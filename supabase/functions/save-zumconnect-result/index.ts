import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const rawBody = await req.text();
    console.log('[save-zumconnect-result] raw body:', rawBody);
    const body = JSON.parse(rawBody);
    const { entity_type, zumrails_user_id, location_id } = body as {
      entity_type: 'staff' | 'restaurant';
      zumrails_user_id: string;
      location_id?: string;
    };
    console.log('[save-zumconnect-result] parsed — entity_type:', entity_type, '| zumrails_user_id:', zumrails_user_id, '| location_id:', location_id ?? 'none');

    if (!entity_type || !zumrails_user_id) {
      throw new Error('entity_type and zumrails_user_id are required');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error(`Unauthorized — ${authErr?.message ?? 'no user'}`);
    console.log('[save-zumconnect-result] caller:', user.email, '| entity_type:', entity_type);

    if (entity_type === 'staff') {
      const { error } = await admin
        .from('staff_members')
        .update({ zumrails_user_id, bank_linked: true })
        .eq('email', user.email);
      if (error) throw new Error(`Failed to update staff member: ${error.message}`);
      console.log('[save-zumconnect-result] staff bank linked:', user.email);
      return respond({ success: true });
    }

    if (entity_type === 'restaurant') {
      const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
      if (!isAdmin) {
        const { data: mgr } = await admin
          .from('managers')
          .select('id')
          .eq('email', user.email)
          .maybeSingle();
        if (!mgr) throw new Error('Unauthorized — not a manager or admin');
      }
      if (!location_id) throw new Error('location_id required for restaurant');

      console.log('[save-zumconnect-result] updating locations.zumrails_funding_source_id — location_id:', location_id, '| value:', zumrails_user_id);
      const { error, count } = await admin
        .from('locations')
        .update({ zumrails_funding_source_id: zumrails_user_id })
        .eq('id', location_id)
        .select();
      console.log('[save-zumconnect-result] update result — error:', error?.message ?? null, '| rows affected count:', count);
      if (error) throw new Error(`Failed to update location: ${error.message}`);
      console.log('[save-zumconnect-result] restaurant funding source linked:', location_id);
      return respond({ success: true });
    }

    throw new Error('Invalid entity_type');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[save-zumconnect-result] error:', message);
    return respond({ error: message }, 400);
  }
});
