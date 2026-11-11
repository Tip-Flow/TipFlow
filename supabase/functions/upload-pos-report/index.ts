import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDocumentProxy } from 'npm:unpdf';
import * as XLSX from 'npm:xlsx@0.18.5';
import { parseSquirrelCashout, type CashoutResult } from '../_shared/cashoutParser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 5000;
const PARSER_VERSION = 'squirrel-cashout-1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type FileKind = 'pdf' | 'xlsx' | 'numbers' | 'xls' | 'csv';
const CONTENT_TYPES: Record<FileKind, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  numbers: 'application/vnd.apple.numbers',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Identify the file from its first bytes, never from its name.
function detectKind(bytes: Uint8Array, fileName: string): FileKind | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';            // %PDF
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls';            // old Excel
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {                        // zip
    return /\.numbers$/i.test(fileName) ? 'numbers' : 'xlsx';
  }
  // Plain text: CSV, or an "xls" that is really an HTML table (common POS export)
  const head = new TextDecoder().decode(b.slice(0, 512)).toLowerCase();
  if (head.includes('\u0000')) return null;
  if (head.includes('<table') || head.includes('<html')) return 'xls';
  return 'csv';
}

// Rebuild the PDF's rows: group text by vertical position, order left to right.
async function pdfRows(bytes: Uint8Array): Promise<{ pageCount: number; rows: string[][] }> {
  const pdf = await getDocumentProxy(bytes);
  const rows: string[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str || !item.transform || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: item.transform[4], s: item.str.trim() });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      rows.push(byY.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.s));
    }
  }
  return { pageCount: pdf.numPages, rows };
}

function sheetRows(bytes: Uint8Array): { pageCount: number; rows: string[][] } {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  const rows: string[][] = [];
  for (const name of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (const r of sheetRows) rows.push(r.map((c) => String(c ?? '')));
    if (rows.length > MAX_ROWS) break;
  }
  return { pageCount: wb.SheetNames.length, rows: rows.slice(0, MAX_ROWS) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new HttpError(401, 'Unauthorized');

    // ── Read the form ────────────────────────────────────────────────────────
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, 'Expected a file upload');
    }
    const locationId = String(form.get('location_id') ?? '');
    const businessDate = String(form.get('business_date') ?? '');
    const file = form.get('file');

    if (!UUID_RE.test(locationId)) throw new HttpError(400, 'location_id is required');
    if (!DATE_RE.test(businessDate) || isNaN(Date.parse(businessDate))) {
      throw new HttpError(400, 'business_date must be YYYY-MM-DD');
    }
    if (!(file instanceof File)) throw new HttpError(400, 'A report file is required');
    if (file.size === 0 || file.size > MAX_BYTES) throw new HttpError(400, 'The file must be under 10 MB');

    // ── Permission: admin, or a manager of THIS location ─────────────────────
    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    if (!isAdmin) {
      const { data: mgrRows, error: mgrErr } = await admin
        .from('managers')
        .select('id')
        .eq('email', user.email ?? '')
        .eq('location_id', locationId)
        .limit(1);
      if (mgrErr || !mgrRows || mgrRows.length === 0) {
        throw new HttpError(403, 'This location does not belong to your account');
      }
    }

    // ── What kind of file is it? ─────────────────────────────────────────────
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectKind(bytes, file.name ?? '');
    if (!kind) throw new HttpError(400, 'Upload a PDF or a spreadsheet (Excel, Numbers or CSV)');
    const fileHash = await sha256Hex(bytes);

    // ── Same file already uploaded for this location? ────────────────────────
    const { data: existing, error: existErr } = await admin
      .from('pos_reports')
      .select('id, business_date, status')
      .eq('location_id', locationId)
      .eq('file_sha256', fileHash)
      .maybeSingle();
    if (existErr) throw new Error(`report lookup failed: ${existErr.message}`);

    let reportId: string;
    if (existing && existing.status !== 'uploaded') {
      return respond({
        duplicate: true,
        report_id: existing.id,
        business_date: existing.business_date,
        status: existing.status,
        message: 'This exact report was already uploaded.',
      });
    } else if (existing) {
      // Stored earlier but never read (e.g. before spreadsheets were supported): read it now.
      reportId = existing.id;
    } else {
      const ext = kind === 'numbers' ? 'numbers' : kind;
      const storagePath = `${locationId}/${businessDate}/${fileHash}.${ext}`;
      const { error: upErr } = await admin.storage
        .from('pos-reports')
        .upload(storagePath, bytes, { contentType: CONTENT_TYPES[kind], upsert: false });
      if (upErr && !/exists/i.test(upErr.message)) {
        throw new Error(`storage upload failed: ${upErr.message}`);
      }
      const { data: report, error: insErr } = await admin
        .from('pos_reports')
        .insert({
          location_id: locationId,
          business_date: businessDate,
          storage_path: storagePath,
          file_sha256: fileHash,
          file_type: kind,
          uploaded_by: user.id,
          status: 'uploaded',
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`report insert failed: ${insErr.message}`);
      reportId = report.id;
    }

    // ── Read the rows ────────────────────────────────────────────────────────
    let pageCount = 0;
    let rows: string[][] = [];
    try {
      const out = kind === 'pdf' ? await pdfRows(bytes) : sheetRows(bytes);
      pageCount = out.pageCount;
      rows = out.rows;
    } catch (readErr: unknown) {
      console.error('[upload-pos-report] could not read', kind, 'for', reportId, readErr instanceof Error ? readErr.message : '');
      await admin.from('pos_reports')
        .update({ status: 'needs_review', review_notes: `Could not read this ${kind} file`, updated_at: new Date().toISOString() })
        .eq('id', reportId);
      throw new HttpError(422, kind === 'pdf'
        ? 'The file was saved, but its text could not be read. Is it a scanned image?'
        : 'The file was saved, but the spreadsheet could not be read.');
    }

    // ── Understand it ────────────────────────────────────────────────────────
    const parsed: CashoutResult = parseSquirrelCashout(rows);
    let matchedCount = 0;
    if (parsed.reportDate && parsed.reportDate !== businessDate) {
      parsed.warnings.unshift(`The report is dated ${parsed.reportDate}, but it was uploaded for ${businessDate}. Check the business date.`);
    }

    if (parsed.recognised) {
      const { data: mapRows, error: mapErr } = await admin
        .from('pos_employee_map')
        .select('pos_employee_key, staff_member_id')
        .eq('location_id', locationId);
      if (mapErr) throw new Error(`employee map lookup failed: ${mapErr.message}`);
      const keyToStaff = new Map((mapRows ?? []).map((m) => [String(m.pos_employee_key), String(m.staff_member_id)]));

      // Replace any earlier reading of this report.
      const { error: delErr } = await admin.from('pos_report_lines').delete().eq('report_id', reportId);
      if (delErr) throw new Error(`clearing old lines failed: ${delErr.message}`);

      const seen = new Set<string>();
      const lines = [];
      for (const a of parsed.accounts) {
        if (seen.has(a.key)) {
          parsed.warnings.push(`Account ${a.key} appears more than once; only the first was used.`);
          continue;
        }
        seen.add(a.key);
        const staffId = keyToStaff.get(a.key) ?? null;
        if (staffId) matchedCount++;
        lines.push({
          report_id: reportId,
          pos_employee_key: a.key,
          pos_employee_name: a.name,
          staff_member_id: staffId,
          account_kind: a.kind,
          gross_cents: a.grossCents,
          net_sales_cents: a.netSalesCents,
          comps_cents: a.compsCents,
          card_tips_cents: a.tipsCents,   // Squirrel's TIPS line (tips added to payments)
          cash_tips_cents: 0,
          service_charge_cents: 0,
          cash_due_cents: a.cashDueCents,
          check_count: a.checkCount,
          tenders: a.tenders,
        });
      }
      if (lines.length) {
        const { error: lineErr } = await admin.from('pos_report_lines').insert(lines);
        if (lineErr) throw new Error(`saving lines failed: ${lineErr.message}`);
      }
    }

    const totalsOk = parsed.recognised &&
      (parsed.totals.tipsCents === null || parsed.totals.tipsCents === parsed.totals.sumTipsCents) &&
      (parsed.totals.netSalesCents === null || parsed.totals.netSalesCents === parsed.totals.sumNetSalesCents);
    const dateOk = !parsed.reportDate || parsed.reportDate === businessDate;
    const status = parsed.recognised && totalsOk && dateOk ? 'parsed' : 'needs_review';

    const { error: updErr } = await admin.from('pos_reports')
      .update({
        status,
        parser_version: PARSER_VERSION,
        report_totals: parsed.totals,
        review_notes: parsed.warnings.length ? parsed.warnings.join('\n') : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);
    if (updErr) throw new Error(`report update failed: ${updErr.message}`);

    console.log('[upload-pos-report] report', reportId, '| location', locationId, '| date', businessDate,
      '| kind', kind, '| rows', rows.length, '| accounts', parsed.accounts.length,
      '| matched', matchedCount, '| status', status);

    return respond({
      report_id: reportId,
      status,
      file_type: kind,
      page_count: pageCount,
      line_count: rows.length,
      recognised: parsed.recognised,
      report_date: parsed.reportDate,
      store_name: parsed.storeName,
      totals: parsed.totals,
      totals_match: totalsOk,
      warnings: parsed.warnings,
      matched_count: matchedCount,
      accounts: parsed.accounts.map((a) => ({
        name: a.name,
        key: a.key,
        kind: a.kind,
        net_sales_cents: a.netSalesCents,
        comps_cents: a.compsCents,
        tips_cents: a.tipsCents,
        cash_due_cents: a.cashDueCents,
      })),
      // Raw rows, for checking the reading. Only this location's managers or admins get here.
      lines: rows.map((r) => r.filter((c) => c.trim() !== '').join(' | ')).filter((l) => l !== ''),
    });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[upload-pos-report] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});
