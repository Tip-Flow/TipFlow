// Squirrel POS integration — connects directly to the restaurant's Squirrel
// SQL Server database to pull per-server sales, punch-in hours, and staff.
//
// node-mssql's default driver bindings assume a full Node runtime; Supabase
// Edge Functions run on Deno, which has outbound raw-TCP support (Deno.connect)
// but incomplete Node compat for mssql's connection-pool internals. We use
// npm:tedious directly instead — it's a pure-JS TDS (Tabular Data Stream)
// implementation with no native bindings, so it works over Deno's TCP/TLS
// sockets. This has not been exercised against a live Squirrel server yet
// (no credentials were available at write time) — verify against SQHOST
// before relying on it in production.
import { Connection, Request as TediousRequest, TYPES } from 'npm:tedious@18.6.1';

console.log('[squirrel] SQL client loaded — using npm:tedious (pure-JS TDS driver) for Deno edge runtime compatibility, not node-mssql.');

export interface SquirrelServerSale {
  serverName: string;
  empId: number;
  totalSales: number; // dollars, as returned by Squirrel's CashoutSales (not CAD cents)
  checkCount: number;
}

export interface SquirrelEmployeeHours {
  serverName: string;
  empId: number;
  hoursWorked: number;
}

export interface SquirrelEmployee {
  empId: number;
  empNumber: string | null;
  firstName: string;
  lastName: string;
  status: number;
}

interface SquirrelConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

type TediousColumn = { metadata: { colName: string }; value: unknown };

function getConfig(): SquirrelConfig {
  const host = Deno.env.get('SQUIRREL_HOST') ?? '';
  const port = Number(Deno.env.get('SQUIRREL_PORT') ?? '1433');
  const user = Deno.env.get('SQUIRREL_USER') ?? '';
  const password = Deno.env.get('SQUIRREL_PASSWORD') ?? '';
  const database = Deno.env.get('SQUIRREL_DATABASE') ?? 'Squirrel';
  // Most on-prem SQL Server installs (Squirrel is typically on-prem) present a
  // self-signed certificate. trustServerCertificate=true skips chain
  // validation so the TLS handshake doesn't fail — it does NOT disable
  // encryption. Set SQUIRREL_TRUST_SERVER_CERTIFICATE=false once SQHOST has a
  // certificate signed by a trusted CA.
  const encrypt = (Deno.env.get('SQUIRREL_ENCRYPT') ?? 'true') === 'true';
  const trustServerCertificate = (Deno.env.get('SQUIRREL_TRUST_SERVER_CERTIFICATE') ?? 'true') === 'true';

  if (!host || !user || !password) {
    console.error(
      '[squirrel] missing required env vars — host present:', !!host,
      '| user present:', !!user, '| password present:', !!password,
    );
  }

  return { host, port, user, password, database, encrypt, trustServerCertificate };
}

export function getConnection(): Promise<Connection> {
  const config = getConfig();
  console.log(
    '[squirrel] getConnection — host:', config.host, '| port:', config.port,
    '| database:', config.database, '| encrypt:', config.encrypt,
    '| trustServerCertificate:', config.trustServerCertificate,
  );

  if (config.trustServerCertificate) {
    console.warn(
      '[squirrel] trustServerCertificate is enabled — TLS certificate chain validation is skipped. ' +
      'Common for on-prem SQL Server with a self-signed cert, but weaker against MITM. ' +
      'Set SQUIRREL_TRUST_SERVER_CERTIFICATE=false once SQHOST presents a CA-signed certificate.',
    );
  }

  return new Promise((resolve, reject) => {
    const connection = new Connection({
      server: config.host,
      options: {
        port: config.port,
        database: config.database,
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate,
        rowCollectionOnRequestCompletion: false,
      },
      authentication: {
        type: 'default',
        options: {
          userName: config.user,
          password: config.password,
        },
      },
    });

    connection.on('connect', (err) => {
      if (err) {
        console.error('[squirrel] connection failed:', err.message);
        reject(new Error(`Squirrel SQL Server connection failed: ${err.message}`));
        return;
      }
      console.log('[squirrel] connected to', `${config.host}:${config.port}`, '/', config.database);
      resolve(connection);
    });

    connection.on('error', (err) => {
      console.error('[squirrel] connection-level error:', err.message);
    });

    connection.connect();
  });
}

async function runQuery<T>(
  sql: string,
  mapRow: (columns: TediousColumn[]) => T,
  params?: Array<{ name: string; type: unknown; value: unknown }>,
): Promise<T[]> {
  const connection = await getConnection();

  return new Promise((resolve, reject) => {
    const rows: T[] = [];

    // deno-lint-ignore no-explicit-any
    const request = new (TediousRequest as any)(sql, (err: Error | null | undefined, rowCount: number) => {
      connection.close();
      if (err) {
        console.error('[squirrel] query failed:', err.message, '| sql (first 200 chars):', sql.slice(0, 200));
        reject(new Error(`Squirrel query failed: ${err.message}`));
        return;
      }
      console.log('[squirrel] query complete — rowCount:', rowCount);
      resolve(rows);
    });

    if (params) {
      for (const p of params) {
        // deno-lint-ignore no-explicit-any
        (request as any).addParameter(p.name, p.type, p.value);
      }
    }

    request.on('row', (columns: TediousColumn[]) => {
      rows.push(mapRow(columns));
    });

    request.on('error', (err: Error) => {
      console.error('[squirrel] request-level error:', err.message);
    });

    connection.execSql(request);
  });
}

function getColumn(columns: TediousColumn[], name: string): unknown {
  return columns.find((c) => c.metadata.colName === name)?.value;
}

// Per-server sales for a single day, keyed by TransactionDate. The confirmed
// query only had a lower bound (>= today); we add an explicit upper bound so
// callers can query any single day, not just "today onward".
export async function getServerSales(date: string): Promise<SquirrelServerSale[]> {
  console.log('[squirrel] getServerSales — date:', date);

  const sql = `
    SELECT
      k.FirstName + ' ' + k.LastName as ServerName,
      k.EmpID,
      SUM(ch.CashoutSales) as TotalSales,
      COUNT(ch.CheckID) as CheckCount
    FROM X_CheckHeader ch
    JOIN K_Employee k ON ch.ServerID = k.EmpID
    WHERE ch.IsCurrent = 1
      AND ch.TransactionDate >= @date
      AND ch.TransactionDate < DATEADD(day, 1, @date)
    GROUP BY k.FirstName, k.LastName, k.EmpID
    ORDER BY TotalSales DESC
  `;

  const results = await runQuery<SquirrelServerSale>(
    sql,
    (columns) => ({
      serverName: String(getColumn(columns, 'ServerName') ?? ''),
      empId: Number(getColumn(columns, 'EmpID') ?? 0),
      totalSales: Number(getColumn(columns, 'TotalSales') ?? 0),
      checkCount: Number(getColumn(columns, 'CheckCount') ?? 0),
    }),
    [{ name: 'date', type: TYPES.Date, value: date }],
  );

  console.log('[squirrel] getServerSales — resolved', results.length, 'servers for', date);
  results.slice(0, 3).forEach((r, i) => console.log(`[squirrel] serverSale[${i}]:`, JSON.stringify(r)));

  return results;
}

export async function getEmployeeHours(date: string): Promise<SquirrelEmployeeHours[]> {
  console.log('[squirrel] getEmployeeHours — date:', date);

  const sql = `
    SELECT
      k.FirstName + ' ' + k.LastName as ServerName,
      k.EmpID,
      SUM(DATEDIFF(minute, pi.TimeIn, pi.TimeOut)) / 60.0 as HoursWorked
    FROM X_PunchIn pi
    JOIN K_Employee k ON pi.EmpID = k.EmpID
    WHERE pi.TransactionDate >= @date
      AND pi.TransactionDate < DATEADD(day, 1, @date)
      AND pi.Active = 1
    GROUP BY k.FirstName, k.LastName, k.EmpID
  `;

  const results = await runQuery<SquirrelEmployeeHours>(
    sql,
    (columns) => ({
      serverName: String(getColumn(columns, 'ServerName') ?? ''),
      empId: Number(getColumn(columns, 'EmpID') ?? 0),
      hoursWorked: Number(getColumn(columns, 'HoursWorked') ?? 0),
    }),
    [{ name: 'date', type: TYPES.Date, value: date }],
  );

  console.log('[squirrel] getEmployeeHours — resolved', results.length, 'employees for', date);
  results.slice(0, 3).forEach((r, i) => console.log(`[squirrel] employeeHours[${i}]:`, JSON.stringify(r)));

  return results;
}

export async function getEmployees(): Promise<SquirrelEmployee[]> {
  console.log('[squirrel] getEmployees — fetching active employees (Status = 0)');

  const sql = `
    SELECT EmpID, EmpNumber, FirstName, LastName, Status
    FROM K_Employee
    WHERE Status = 0
  `;

  const results = await runQuery<SquirrelEmployee>(sql, (columns) => ({
    empId: Number(getColumn(columns, 'EmpID') ?? 0),
    empNumber: getColumn(columns, 'EmpNumber') != null ? String(getColumn(columns, 'EmpNumber')) : null,
    firstName: String(getColumn(columns, 'FirstName') ?? ''),
    lastName: String(getColumn(columns, 'LastName') ?? ''),
    status: Number(getColumn(columns, 'Status') ?? 0),
  }));

  console.log('[squirrel] getEmployees — resolved', results.length, 'active employees');
  return results;
}

// Scans the last 7 days for sales activity (diagnostic — mirrors Push's
// findRecentActivityDates). Runs sequentially rather than in parallel since
// an on-prem SQL Server Express instance may have a small connection limit.
export async function findRecentSalesDates(): Promise<string[]> {
  const today = new Date();
  const dates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d.toISOString().split('T')[0];
  });

  console.log('[squirrel] findRecentSalesDates — checking:', dates.join(', '));

  const active: string[] = [];
  for (const date of dates) {
    try {
      const sales = await getServerSales(date);
      console.log('[squirrel] findRecentSalesDates —', date, '→', sales.length > 0 ? `${sales.length} servers FOUND` : 'no data');
      if (sales.length > 0) active.push(date);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[squirrel] findRecentSalesDates —', date, '→ error:', msg);
    }
  }

  console.log('[squirrel] findRecentSalesDates — done | active dates:', active.join(', ') || '(none)');
  return active;
}
