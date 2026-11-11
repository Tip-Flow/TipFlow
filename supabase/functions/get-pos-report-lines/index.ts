import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Returns the CONFIRMED end-of-night report lines for one location and date,
// only for staff already matched to Mise. Unconfirmed reports are never used.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let body: { location_id?: unknown; date?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const locationId = typeof body.location_id === 'string' ? body.location_id : '';
    const date = typeof body.date === 'string' ? body.date : '';
    if (!UUID_RE.test(locationId)) throw new HttpError(400, 'location_id is required');
    if (!DATE_RE.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth: admin, or a manager of THIS location ───────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new HttpError(401, 'Unauthorized');

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

    // ── The confirmed report for that day (at most one exists) ───────────────
    const { data: report, error: repErr } = await admin
      .from('pos_reports')
      .select('id')
      .eq('location_id', locationId)
      .eq('business_date', date)
      .eq('status', 'confirmed')
      .maybeSingle();
    if (repErr) throw new Error(`report lookup failed: ${repErr.message}`);
    if (!report) {
      console.log('[get-pos-report-lines] location', locationId, '| date', date, '| no confirmed report');
      return respond({ report_id: null, lines: [] });
    }

    const { data: lines, error: linesErr } = await admin
      .from('pos_report_lines')
      .select('staff_member_id, net_sales_cents, card_tips_cents, cash_tips_cents')
      .eq('report_id', report.id)
      .not('staff_member_id', 'is', null);
    if (linesErr) throw new Error(`lines lookup failed: ${linesErr.message}`);

    console.log('[get-pos-report-lines] location', locationId, '| date', date, '| report', report.id, '| lines', lines?.length ?? 0);
    return respond({ report_id: report.id, lines: lines ?? [] });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[get-pos-report-lines] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});