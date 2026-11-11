import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Review an uploaded end-of-night report:
//   get     -> the report, its accounts, and the location's staff for matching
//   match   -> link one POS account to a Mise staff member (remembered for next time)
//   confirm -> approve the report so Calculate can use it
//   reopen  -> undo a confirmation, e.g. to fix a match
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let body: { action?: unknown; report_id?: unknown; pos_employee_key?: unknown; staff_member_id?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const action = String(body.action ?? '');
    const reportId = typeof body.report_id === 'string' ? body.report_id : '';
    if (!['get', 'match', 'confirm', 'reopen'].includes(action)) throw new HttpError(400, 'Unknown action');
    if (!UUID_RE.test(reportId)) throw new HttpError(400, 'report_id is required');

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

    // ── The report, and permission for its location ──────────────────────────
    const { data: report, error: repErr } = await admin
      .from('pos_reports')
      .select('id, location_id, business_date, status, report_totals, review_notes, file_type, confirmed_at')
      .eq('id', reportId)
      .maybeSingle();
    if (repErr) throw new Error(`report lookup failed: ${repErr.message}`);
    if (!report) throw new HttpError(404, 'Report not found');
    const locationId = String(report.location_id);

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    if (!isAdmin) {
      const { data: mgrRows, error: mgrErr } = await admin
        .from('managers')
        .select('id')
        .eq('email', user.email ?? '')
        .eq('location_id', locationId)
        .limit(1);
      if (mgrErr || !mgrRows || mgrRows.length === 0) {
        throw new HttpError(403, 'This report does not belong to your location');
      }
    }

    // ── match ────────────────────────────────────────────────────────────────
    if (action === 'match') {
      if (report.status === 'confirmed') throw new HttpError(409, 'Reopen this report before changing matches');
      const key = typeof body.pos_employee_key === 'string' ? body.pos_employee_key : '';
      const staffId = typeof body.staff_member_id === 'string' && body.staff_member_id ? body.staff_member_id : null;
      if (!key) throw new HttpError(400, 'pos_employee_key is required');

      const { data: line, error: lineErr } = await admin
        .from('pos_report_lines')
        .select('id, account_kind')
        .eq('report_id', reportId)
        .eq('pos_employee_key', key)
        .maybeSingle();
      if (lineErr) throw new Error(`line lookup failed: ${lineErr.message}`);
      if (!line) throw new HttpError(404, 'Account not found on this report');
      if (line.account_kind && line.account_kind !== 'staff') {
        throw new HttpError(400, 'Delivery and manager-override accounts are not matched to staff');
      }

      if (staffId) {
        if (!UUID_RE.test(staffId)) throw new HttpError(400, 'Invalid staff member');
        const { data: staff, error: staffErr } = await admin
          .from('staff_members')
          .select('id, location_id')
          .eq('id', staffId)
          .maybeSingle();
        if (staffErr) throw new Error(`staff lookup failed: ${staffErr.message}`);
        if (!staff || staff.location_id !== locationId) throw new HttpError(404, 'Staff member not found at this location');

        const { error: mapErr } = await admin
          .from('pos_employee_map')
          .upsert(
            { location_id: locationId, pos_employee_key: key, staff_member_id: staffId, created_by: user.id },
            { onConflict: 'location_id,pos_employee_key' },
          );
        if (mapErr) throw new Error(`saving match failed: ${mapErr.message}`);
      } else {
        const { error: delErr } = await admin
          .from('pos_employee_map')
          .delete()
          .eq('location_id', locationId)
          .eq('pos_employee_key', key);
        if (delErr) throw new Error(`clearing match failed: ${delErr.message}`);
      }

      const { error: updErr } = await admin
        .from('pos_report_lines')
        .update({ staff_member_id: staffId })
        .eq('id', line.id);
      if (updErr) throw new Error(`updating line failed: ${updErr.message}`);

      console.log('[review-pos-report] match | report', reportId, '| line', line.id, '| matched', !!staffId);
    }

    // ── confirm ──────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      if (report.status === 'confirmed') throw new HttpError(409, 'This report is already confirmed');
      if (report.status !== 'parsed') {
        throw new HttpError(409, "This report needs review (totals or date don't match), so it can't be confirmed. Re-upload the correct report.");
      }
      const { error: confErr } = await admin
        .from('pos_reports')
        .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .eq('status', 'parsed');
      if (confErr) {
        if (confErr.code === '23505') {
          throw new HttpError(409, 'Another report is already confirmed for this date. Reopen that one first.');
        }
        throw new Error(`confirm failed: ${confErr.message}`);
      }
      console.log('[review-pos-report] confirmed', reportId, '| location', locationId, '| date', report.business_date);
    }

    // ── reopen ───────────────────────────────────────────────────────────────
    if (action === 'reopen') {
      if (report.status !== 'confirmed') throw new HttpError(409, 'Only a confirmed report can be reopened');
      const { error: reErr } = await admin
        .from('pos_reports')
        .update({ status: 'parsed', confirmed_by: null, confirmed_at: null, updated_at: new Date().toISOString() })
        .eq('id', reportId);
      if (reErr) throw new Error(`reopen failed: ${reErr.message}`);
      console.log('[review-pos-report] reopened', reportId);
    }

    // ── Return the current state (all actions) ───────────────────────────────
    const [{ data: fresh }, { data: lines, error: linesErr }, { data: staff, error: staffListErr }] = await Promise.all([
      admin.from('pos_reports')
        .select('id, business_date, status, report_totals, review_notes, file_type, confirmed_at')
        .eq('id', reportId).single(),
      admin.from('pos_report_lines')
        .select('pos_employee_key, pos_employee_name, account_kind, staff_member_id, net_sales_cents, comps_cents, card_tips_cents, cash_tips_cents, cash_due_cents')
        .eq('report_id', reportId),
      admin.from('staff_members')
        .select('id, name, role')
        .eq('location_id', locationId)
        .order('name'),
    ]);
    if (linesErr) throw new Error(`lines lookup failed: ${linesErr.message}`);
    if (staffListErr) throw new Error(`staff list failed: ${staffListErr.message}`);

    return respond({ report: fresh, lines: lines ?? [], staff: staff ?? [] });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[review-pos-report] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});
