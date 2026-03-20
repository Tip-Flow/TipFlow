import type { CSVStaffRow } from './csvParser';

export interface OCRParseResult {
  rows: CSVStaffRow[];
  errors: string[];
  totalTips: number | null;   // CAD cents, null if not found
  totalSales: number | null;  // CAD cents, null if not found
  confidence: number;         // 0–100
}

const VALID_ROLES = ['server', 'bartender', 'runner', 'host', 'kitchen'] as const;
type ValidRole = typeof VALID_ROLES[number];

const ROLE_KEYWORDS: Record<string, ValidRole> = {
  server: 'server', waiter: 'server', waitress: 'server',
  bartender: 'bartender', bar: 'bartender', barstaff: 'bartender',
  runner: 'runner', busser: 'runner', busboy: 'runner',
  host: 'host', hostess: 'host',
  kitchen: 'kitchen', cook: 'kitchen', chef: 'kitchen',
};

// Lines containing these patterns are skipped (headers, footers, totals)
const SKIP_LINE_PATTERNS = [
  /^\s*$/,
  /\btotal(s)?\b/i,
  /\b(date|time|period|report|shift\s*name|generated|printed|location|address)\b/i,
  /^[-=_*#]+$/,                  // separator lines
  /^\d{1,2}[\/\-]\d{1,2}/,      // date lines like "03/20/2026"
  /^\s*page\s+\d/i,              // page numbers
];

function normalizeRole(word: string): ValidRole {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  return ROLE_KEYWORDS[lower] ?? 'server';
}

function parseCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

/** Parse a single text line into a staff row using positional heuristics. */
function parseLine(line: string): CSVStaffRow | null {
  const trimmed = line.trim();
  if (!trimmed || SKIP_LINE_PATTERNS.some((p) => p.test(trimmed))) return null;

  // Must start with a capitalized word (a name)
  if (!/^[A-Z][a-z]/.test(trimmed)) return null;

  // Extract the leading name: 1–3 consecutive capitalized words
  const nameMatch = trimmed.match(/^([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,2})/);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();
  let remainder = trimmed.slice(name.length).trim();

  // Check if the next token is a role keyword
  let role: ValidRole = 'server';
  const roleMatch = remainder.match(/^([A-Za-z]+)/);
  if (roleMatch) {
    const word = roleMatch[1].toLowerCase().replace(/[^a-z]/g, '');
    if (ROLE_KEYWORDS[word]) {
      role = ROLE_KEYWORDS[word];
      remainder = remainder.slice(roleMatch[0].length).trim();
    }
  }

  // Hours: explicit "8.5h / 8.5hrs / 8.5 hours" marker first
  let hoursWorked = 0;
  const hoursExplicitMatch = remainder.match(/\b(\d{1,2}(?:\.\d)?)\s*h(?:rs?|ours?)?\b/i);
  if (hoursExplicitMatch) {
    const h = parseFloat(hoursExplicitMatch[1]);
    if (h >= 0.5 && h <= 24) hoursWorked = h;
  } else {
    // Bare number between 0.5 and 24 (excluding dollar amounts)
    const stripped = remainder.replace(/\$[\d,]+(?:\.\d{1,2})?/g, '');
    const bareMatch = stripped.match(/\b(\d{1,2}(?:\.\d)?)\b/);
    if (bareMatch) {
      const h = parseFloat(bareMatch[1]);
      if (h >= 0.5 && h <= 24) hoursWorked = h;
    }
  }

  // Dollar amounts → tips and sales
  const dollarMatches = remainder.match(/\$[\d,]+(?:\.\d{1,2})?/g) ?? [];
  const dollarValues = dollarMatches
    .map(parseCents)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  // Need at least hours or a dollar amount to be useful
  if (hoursWorked === 0 && dollarValues.length === 0) return null;

  let tips = 0;
  let sales = 0;
  if (dollarValues.length === 1) {
    tips = dollarValues[0];
  } else if (dollarValues.length >= 2) {
    tips = dollarValues[0];                          // smaller = tips
    sales = dollarValues[dollarValues.length - 1];   // larger = sales
  }

  return { name, role, hoursWorked, tips, sales };
}

/** Scan the first few lines for a recognisable column header. */
function hasTableHeader(lines: string[]): boolean {
  return lines.slice(0, 8).some((l) => {
    const lower = l.toLowerCase();
    const hasNameCol = lower.includes('name') || lower.includes('staff') || lower.includes('server') || lower.includes('employee');
    const hasDataCol = lower.includes('hour') || lower.includes('hrs') || lower.includes('tips') || lower.includes('sales') || lower.includes('gratuity');
    return hasNameCol && hasDataCol;
  });
}

export function parseOCRText(ocrText: string): OCRParseResult {
  const lines = ocrText.split(/\r?\n/).map((l) => l.trim());

  if (lines.every((l) => !l)) {
    return {
      rows: [],
      errors: ['No text detected in image.'],
      totalTips: null,
      totalSales: null,
      confidence: 0,
    };
  }

  const headerFound = hasTableHeader(lines);
  const rows: CSVStaffRow[] = [];
  let failedDataLines = 0;

  for (const line of lines) {
    const row = parseLine(line);
    if (row) {
      rows.push(row);
    } else if (
      /^[A-Z][a-z]/.test(line) &&
      /\d/.test(line) &&
      !SKIP_LINE_PATTERNS.some((p) => p.test(line))
    ) {
      // Line looked like staff data but couldn't be parsed
      failedDataLines++;
    }
  }

  const errors: string[] = [];
  if (rows.length === 0) {
    errors.push('Could not extract any staff data from the image.');
    errors.push('Try a clearer, well-lit photo or use CSV upload instead.');
  } else if (rows.length < 2) {
    errors.push('Only found one staff member — photo may be partially cut off.');
  }

  // Confidence scoring
  let confidence = 40;
  if (headerFound) confidence += 15;
  if (rows.length >= 4) confidence += 20;
  else if (rows.length >= 2) confidence += 12;
  else if (rows.length === 1) confidence += 5;
  if (rows.some((r) => r.tips > 0)) confidence += 12;
  if (rows.some((r) => r.sales > 0)) confidence += 8;
  if (rows.length > 0 && rows.every((r) => r.hoursWorked > 0)) confidence += 5;
  confidence -= failedDataLines * 4;
  confidence = Math.max(0, Math.min(100, confidence));

  const hasTips = rows.some((r) => r.tips > 0);
  const hasSales = rows.some((r) => r.sales > 0);

  return {
    rows,
    errors,
    totalTips: hasTips ? rows.reduce((s, r) => s + r.tips, 0) : null,
    totalSales: hasSales ? rows.reduce((s, r) => s + r.sales, 0) : null,
    confidence,
  };
}
