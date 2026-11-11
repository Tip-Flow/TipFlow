// Reads a Squirrel "Server Cashout" report into one entry per POS account.
// Works on rows of cells, so the same rules apply to spreadsheets (.xls,
// .xlsx, .numbers, .csv) and to PDFs (cells rebuilt from the page layout).
//
// Report layout, per account:
//   [seq] [ACCOUNT NAME] [account id]        <- block header
//   Cash | count | amount | 0 | amount | cash due | cash due
//   Visa-i / Debit-I / ... | count | amount | 0 | amount
//   PROMO - ... / MEAL - ... / QSA | count | amount | ...   <- comps
//   total | 0.00 | total | net sales | net sales            <- subtotal
//   TIPS | count | amount | 0 | amount
// Then an "All Departments" section with the same rows as report totals.
// All money is returned in integer cents.

export interface CashoutAccount {
  seq: number;
  name: string;
  key: string;               // Squirrel account id, used to match to Mise staff
  kind: 'staff' | 'manager_override' | 'delivery';
  grossCents: number;        // everything tendered, tips included
  netSalesCents: number;     // gross minus tips (as Squirrel reports it; comps included)
  compsCents: number;        // PROMO / MEAL / QSA lines (included in netSales)
  tipsCents: number;
  cashDueCents: number | null; // + server owes house cash, − house owes server
  checkCount: number | null;   // number of tips-bearing payments, if shown
  tenders: Record<string, number>; // tender label -> cents
}

export interface CashoutResult {
  recognised: boolean;
  reportDate: string | null;   // YYYY-MM-DD printed on the report (PDF only)
  storeName: string | null;    // store name printed on the report (PDF only)
  accounts: CashoutAccount[];
  totals: {
    netSalesCents: number | null;
    tipsCents: number | null;
    serviceChargeCents: number | null;
    sumNetSalesCents: number;
    sumTipsCents: number;
  };
  warnings: string[];
}

const COMP_RE = /^(PROMO|MEAL|QSA)\b/i;
const DELIVERY_RE = /(door\s*dash|uber|skip\s*the|ritual|fantuan)/i;

function toCents(s: string): number | null {
  let t = s.trim().replace(/[$,\s]/g, '');
  if (t === '') return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = Math.round(parseFloat(t) * 100);
  return neg ? -v : v;
}

function clean(row: unknown[]): string[] {
  return row
    .map((c) => (c === null || c === undefined ? '' : String(c)).replace(/\s+/g, ' ').trim())
    .filter((c) => c !== '');
}

// Split every cell on whitespace: a PDF line may hold several values in one
// cell ("TIPS 12 82.43"). The label is the leading run of non-numeric words.
function splitLabelAndNumbers(cells: string[]): { label: string; nums: number[] } {
  const words = cells.flatMap((c) => c.split(/\s+/)).filter((w) => w !== '');
  const labelParts: string[] = [];
  const nums: number[] = [];
  for (const w of words) {
    const n = toCents(w);
    if (n === null) {
      if (nums.length === 0) labelParts.push(w);
    } else {
      nums.push(n);
    }
  }
  return { label: labelParts.join(' '), nums };
}

// Header: "1 | AM BAR | 07"  or  "1 AM BAR 07"
function parseHeader(cells: string[]): { seq: number; name: string; key: string } | null {
  if (cells.length >= 3 && /^\d{1,3}$/.test(cells[0]) && /[a-z]/i.test(cells[1]) && /^\d{1,15}$/.test(cells[cells.length - 1])) {
    return { seq: Number(cells[0]), name: cells.slice(1, -1).join(' '), key: cells[cells.length - 1] };
  }
  const m = cells.join(' ').match(/^(\d{1,3})\s+(.*?[a-z].*?)\s+(\d{1,15})$/i);
  if (m) return { seq: Number(m[1]), name: m[2].trim(), key: m[3] };
  return null;
}

export function parseSquirrelCashout(rows: unknown[][]): CashoutResult {
  const warnings: string[] = [];
  const accounts: CashoutAccount[] = [];
  let cur: CashoutAccount | null = null;
  let inTotals = false;
  let totalNet: number | null = null;
  let totalTips: number | null = null;
  let serviceCharge: number | null = null;
  let reportDate: string | null = null;
  let storeName: string | null = null;
  let inPageHeader = false;

  for (const raw of rows) {
    const cells = clean(raw);
    if (cells.length === 0) continue;
    const joined = cells.join(' ');

    // PDF page header, repeated on every page: from the "Page #" line down to
    // the "Ref # | Name | Number ..." column titles. Never part of an account.
    if (/\bPage #/i.test(joined)) {
      inPageHeader = true;
      const sm = cells.find((c) => /[a-z]/i.test(c) && !/page #|\d{1,2}\/\d{1,2}\/\d{4}/i.test(c));
      if (sm && !storeName) storeName = sm;
      continue;
    }
    if (inPageHeader) {
      const dm = joined.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+[a-z]+day$/i);
      if (dm && !reportDate) reportDate = `${dm[3]}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
      if (/^ref #/i.test(joined)) inPageHeader = false;
      continue;
    }

    if (/^(total\s*:\s*)?all departments$/i.test(joined)) { inTotals = true; cur = null; continue; }

    if (!inTotals) {
      const h = parseHeader(cells);
      if (h) {
        cur = {
          seq: h.seq, name: h.name, key: h.key,
          kind: /\bMOD$/i.test(h.name) ? 'manager_override' : 'staff',
          grossCents: 0, netSalesCents: 0, compsCents: 0, tipsCents: 0,
          cashDueCents: null, checkCount: null, tenders: {},
        };
        accounts.push(cur);
        continue;
      }
    }

    const { label, nums } = splitLabelAndNumbers(cells);

    if (/^srvc chrg|^service charge/i.test(label)) {
      // Appears once per report outside the account blocks.
      if (nums.length) serviceCharge = nums[nums.length - 1];
      continue;
    }

    // Subtotal row: numbers only -> [gross, 0, gross, net, net]
    if (label === '' && nums.length >= 4) {
      if (inTotals) { if (totalNet === null) totalNet = nums[3]; }
      else if (cur) { cur.grossCents = nums[0]; cur.netSalesCents = nums[3]; }
      continue;
    }

    if (/^tips$/i.test(label) && nums.length >= 1) {
      const amt = nums[nums.length - 1];
      if (inTotals) { if (totalTips === null) totalTips = amt; }
      else if (cur) { cur.tipsCents = amt; cur.checkCount = nums.length >= 4 ? Math.round(nums[0] / 100) : null; }
      continue;
    }

    if (inTotals || !cur || !label) continue;

    // Tender / comp line
    if (/^cash$/i.test(label)) {
      // [count?, amount, 0, amount, due, due]
      if (nums.length >= 5) cur.cashDueCents = nums[nums.length - 1];
      const amt = nums.length >= 6 ? nums[1] : nums.length >= 5 ? nums[0] : nums[Math.min(1, nums.length - 1)];
      cur.tenders['Cash'] = amt ?? 0;
    } else if (nums.length >= 2) {
      const amt = nums.length >= 4 ? nums[1] : nums[nums.length - 1];
      cur.tenders[label] = (cur.tenders[label] ?? 0) + amt;
      if (COMP_RE.test(label)) cur.compsCents += amt;
    }
  }

  for (const a of accounts) {
    const labels = Object.keys(a.tenders).filter((l) => l !== 'Cash' || a.tenders[l] !== 0);
    if (a.kind === 'staff' && a.tipsCents === 0 && labels.length > 0 && labels.every((l) => DELIVERY_RE.test(l))) {
      a.kind = 'delivery';
    }
  }

  const sumNet = accounts.reduce((s, a) => s + a.netSalesCents, 0);
  const sumTips = accounts.reduce((s, a) => s + a.tipsCents, 0);
  const recognised = accounts.length > 0 && (totalTips !== null || totalNet !== null);

  if (!recognised) warnings.push("This doesn't look like a Squirrel Server Cashout report.");
  if (totalTips !== null && totalTips !== sumTips) {
    warnings.push(`Tips don't add up: accounts total ${(sumTips / 100).toFixed(2)}, report total ${(totalTips / 100).toFixed(2)}.`);
  }
  if (totalNet !== null && totalNet !== sumNet) {
    warnings.push(`Sales don't add up: accounts total ${(sumNet / 100).toFixed(2)}, report total ${(totalNet / 100).toFixed(2)}.`);
  }
  for (const a of accounts) {
    if (a.kind === 'staff' && a.grossCents !== 0 && a.grossCents - a.tipsCents !== a.netSalesCents) {
      warnings.push(`${a.name}: sales minus tips doesn't match the subtotal.`);
    }
  }
  if (serviceCharge) {
    warnings.push(`Service charges of ${(serviceCharge / 100).toFixed(2)} are reported for the whole location, not per server.`);
  }

  return {
    recognised,
    reportDate,
    storeName,
    accounts,
    totals: { netSalesCents: totalNet, tipsCents: totalTips, serviceChargeCents: serviceCharge, sumNetSalesCents: sumNet, sumTipsCents: sumTips },
    warnings,
  };
}
