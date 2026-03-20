// Valid roles that the tip calculator understands
const VALID_ROLES = ['server', 'bartender', 'runner', 'host', 'kitchen'] as const;
type ValidRole = typeof VALID_ROLES[number];

export interface CSVStaffRow {
  name: string;
  role: string;
  hoursWorked: number;
  tips: number;   // CAD cents (0 if no tips column)
  sales: number;  // CAD cents (0 if no sales column)
}

export interface CSVParseResult {
  rows: CSVStaffRow[];
  errors: string[];
  totalTips: number | null;   // sum of tips column in CAD cents, null if column absent
  totalSales: number | null;  // sum of sales column in CAD cents, null if column absent
}

// Column header aliases — all lowercase for matching
const NAME_ALIASES = ['name', 'server name', 'staff name', 'employee name', 'employee', 'staff'];
const ROLE_ALIASES = ['role', 'position', 'job', 'job title', 'job_title'];
const HOURS_ALIASES = ['hours', 'hours worked', 'hrs', 'hours_worked', 'shift hours', 'time'];
const TIPS_ALIASES = ['tips', 'total tips', 'tip amount', 'tips_amount', 'tip total', 'tips total', 'gratuity'];
const SALES_ALIASES = ['sales', 'total sales', 'sales total', 'revenue', 'net sales', 'gross sales'];

function findColumnIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

/** Split a CSV row respecting double-quoted fields that may contain commas. */
function splitRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Strip surrounding quotes and whitespace from a cell value. */
function cleanCell(cell: string | undefined): string {
  return (cell ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Parse a dollar-or-number string to CAD cents integer. */
function parseCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

/** Normalize a free-text role to a valid TipFlow role, defaulting to 'server'. */
function normalizeRole(raw: string): ValidRole {
  const lower = raw.toLowerCase();
  if (lower.includes('bar')) return 'bartender';
  if (lower.includes('runner') || lower.includes('bus')) return 'runner';
  if (lower.includes('host') || lower.includes('hostess')) return 'host';
  if (lower.includes('kitchen') || lower.includes('cook') || lower.includes('chef')) return 'kitchen';
  if (lower.includes('server') || lower.includes('waiter') || lower.includes('waitress')) return 'server';
  // If it already exactly matches a valid role, use it
  if ((VALID_ROLES as readonly string[]).includes(lower)) return lower as ValidRole;
  return 'server';
}

export function parseCSV(csvString: string): CSVParseResult {
  const errors: string[] = [];
  const rows: CSVStaffRow[] = [];

  const lines = csvString
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['CSV file is empty.'], totalTips: null, totalSales: null };
  }

  // First non-empty line is the header row
  const rawHeaders = splitRow(lines[0]).map((h) => cleanCell(h));

  const nameIdx  = findColumnIndex(rawHeaders, NAME_ALIASES);
  const roleIdx  = findColumnIndex(rawHeaders, ROLE_ALIASES);
  const hoursIdx = findColumnIndex(rawHeaders, HOURS_ALIASES);
  const tipsIdx  = findColumnIndex(rawHeaders, TIPS_ALIASES);
  const salesIdx = findColumnIndex(rawHeaders, SALES_ALIASES);

  const missing: string[] = [];
  if (nameIdx  === -1) missing.push('name (tried: Name, Server Name, Staff Name, Employee)');
  if (hoursIdx === -1) missing.push('hours (tried: Hours, Hours Worked, Hrs, Shift Hours)');

  if (missing.length > 0) {
    errors.push(`Missing required columns: ${missing.join(' | ')}`);
    errors.push(`Columns found in your file: ${rawHeaders.join(', ')}`);
    return { rows: [], errors, totalTips: null, totalSales: null };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);

    const name = cleanCell(cells[nameIdx]);
    if (!name) continue; // skip blank rows

    const roleRaw    = roleIdx  >= 0 ? cleanCell(cells[roleIdx])  : '';
    const hoursRaw   = hoursIdx >= 0 ? cleanCell(cells[hoursIdx]) : '0';
    const tipsRaw    = tipsIdx  >= 0 ? cleanCell(cells[tipsIdx])  : '0';
    const salesRaw   = salesIdx >= 0 ? cleanCell(cells[salesIdx]) : '0';

    const hoursWorked = Math.max(0, parseFloat(hoursRaw.replace(/[^0-9.]/g, '')) || 0);

    rows.push({
      name,
      role: normalizeRole(roleRaw),
      hoursWorked,
      tips:  parseCents(tipsRaw),
      sales: parseCents(salesRaw),
    });
  }

  if (rows.length === 0) {
    errors.push('No data rows found after the header. Check that the file is not empty.');
  }

  const totalTips  = tipsIdx  >= 0 ? rows.reduce((s, r) => s + r.tips,  0) : null;
  const totalSales = salesIdx >= 0 ? rows.reduce((s, r) => s + r.sales, 0) : null;

  return { rows, errors, totalTips, totalSales };
}
