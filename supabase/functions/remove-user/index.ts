import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const record_id: string = body.record_id;
    const table: 'staff_members' | 'managers' = body.table;

    if (!record_id || !table) throw new Error('record_id and table are required');
    if (table !== 'staff_members' && table !== 'managers') {
      throw new Error('table must be "staff_members" or "managers"');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !caller) throw new Error('Unauthorized');

    const callerEmail = (caller.email ?? '').toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(callerEmail);

    if (!isAdmin) {
      if (table === 'staff_members') {
        // Caller must be a location manager at the same location
        const { data: target } = await admin
          .from('staff_members').select('location_id').eq('id', record_id).maybeSingle();
        const { data: callerMgr } = await admin
          .from('managers').select('location_id').eq('auth_user_id', caller.id).maybeSingle();
        if (!target || !callerMgr || callerMgr.location_id !== target.location_id) {
          throw new Error('Unauthorized: you can only remove staff from your location');
        }
      } else {
        // Caller must be a regional manager in the same org
        const { data: target } = await admin
          .from('managers').select('organisation_id').eq('id', record_id).maybeSingle();
        const { data: callerMgr } = await admin
          .from('managers').select('organisation_id, role').eq('auth_user_id', caller.id).maybeSingle();
        if (
          !target || !callerMgr ||
          callerMgr.role !== 'regional_manager' ||
          callerMgr.organisation_id !== target.organisation_id
        ) {
          throw new Error('Unauthorized: you can only remove managers in your organisation');
        }
      }
    }

    // Look up name + auth_user_id before deletion
    const { data: record, error: lookupErr } = await admin
      .from(table).select('auth_user_id, name').eq('id', record_id).maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!record) throw new Error('Record not found');

    // Delete the DB row
    const { error: deleteErr } = await admin.from(table).delete().eq('id', record_id);
    if (deleteErr) throw deleteErr;
    console.log('[remove-user] deleted', table, record_id, 'name:', record.name);

    // Delete auth user (best-effort — DB row is already gone)
    let authDeleted = false;
    if (record.auth_user_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(record.auth_user_id);
      if (authErr) {
        console.error('[remove-user] auth delete error (non-fatal):', authErr.message);
      } else {
        authDeleted = true;
        console.log('[remove-user] auth user deleted:', record.auth_user_id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, name: record.name, auth_deleted: authDeleted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[remove-user] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
