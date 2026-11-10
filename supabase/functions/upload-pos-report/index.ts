import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDocumentProxy } from 'npm:unpdf';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Rebuilds the PDF's rows: groups text by vertical position, then orders each
// row left to right. Cells are joined with " | " so columns stay visible.
async function extractLines(bytes: Uint8Array): Promise<{ pageCount: number; lines: string[] }> {
  const pdf = await getDocumentProxy(bytes);
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str || !item.transform || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s: item.str.trim() });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // top of page first
    for (const y of ys) {
      const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push(cells.map((c) => c.s).join(' | '));
    }
  }
  return { pageCount: pdf.numPages, lines };
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
    if (!(file instanceof File)) throw new HttpError(400, 'A PDF file is required');
    if (file.size === 0 || file.size > MAX_BYTES) throw new HttpError(400, 'The PDF must be under 10 MB');

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

    // ── Check it really is a PDF ─────────────────────────────────────────────
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== '%PDF-') throw new HttpError(400, 'That file is not a PDF');

    const fileHash = await sha256Hex(bytes);

    // ── Same file already uploaded for this location? ────────────────────────
    const { data: existing, error: existErr } = await admin
      .from('pos_reports')
      .select('id, business_date, status')
      .eq('location_id', locationId)
      .eq('file_sha256', fileHash)
      .maybeSingle();
    if (existErr) throw new Error(`report lookup failed: ${existErr.message}`);
    if (existing) {
      return respond({
        duplicate: true,
        report_id: existing.id,
        business_date: existing.business_date,
        status: existing.status,
        message: 'This exact report was already uploaded.',
      });
    }

    // ── Store the original privately ─────────────────────────────────────────
    const storagePath = `${locationId}/${businessDate}/${fileHash}.pdf`;
    const { error: upErr } = await admin.storage
      .from('pos-reports')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (upErr && !/exists/i.test(upErr.message)) {
      throw new Error(`storage upload failed: ${upErr.message}`);
    }

    // ── Record it ────────────────────────────────────────────────────────────
    const { data: report, error: insErr } = await admin
      .from('pos_reports')
      .insert({
        location_id: locationId,
        business_date: businessDate,
        storage_path: storagePath,
        file_sha256: fileHash,
        uploaded_by: user.id,
        status: 'uploaded',
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`report insert failed: ${insErr.message}`);

    // ── Extract text (the reading rules come once we have the real layout) ───
    let pageCount = 0;
    let lines: string[] = [];
    try {
      const extracted = await extractLines(bytes);
      pageCount = extracted.pageCount;
      lines = extracted.lines;
    } catch (pdfErr: unknown) {
      console.error('[upload-pos-report] text extraction failed for', report.id, pdfErr instanceof Error ? pdfErr.message : '');
      await admin
        .from('pos_reports')
        .update({ status: 'needs_review', review_notes: 'Could not read text from this PDF', updated_at: new Date().toISOString() })
        .eq('id', report.id);
      throw new HttpError(422, 'The PDF was saved, but its text could not be read. Is it a scanned image?');
    }

    console.log('[upload-pos-report] stored', report.id, '| location', locationId, '| date', businessDate, '| pages', pageCount, '| lines', lines.length);

    return respond({
      report_id: report.id,
      status: 'uploaded',
      page_count: pageCount,
      line_count: lines.length,
            // Raw text, for writing the reading rules. Only this location's managers or admins get here.
      lines,
  });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[upload-pos-report] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});