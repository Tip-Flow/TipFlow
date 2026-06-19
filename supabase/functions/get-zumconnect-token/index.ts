import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createConnectToken } from '../_shared/zumrails.ts';

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
    const body = await req.json();
    const { entity_type, location_id } = body as {
      entity_type: 'staff' | 'restaurant';
      location_id?: string;
    };

    if (!entity_type || !['staff', 'restaurant'].includes(entity_type)) {
      throw new Error('entity_type must be "staff" or "restaurant"');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized — no Authorization header');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error(`Unauthorized — ${authErr?.message ?? 'no user'}`);
    console.log('[get-zumconnect-token] caller:', user.email, '| entity_type:', entity_type);

    if (entity_type === 'staff') {
      const { data: staff } = await admin
        .from('staff_members')
        .select('id, zumrails_user_id')
        .eq('email', user.email)
        .maybeSingle();

      if (!staff) throw new Error('Staff member not found for this account');

      // If staff already has a Zum Rails user, scope the connect session to them so
      // the new bank account is attached to the existing user (not a duplicate).
      const token = await createConnectToken({ userId: staff.zumrails_user_id ?? undefined });
      console.log('[get-zumconnect-token] token generated for staff:', staff.id);
      return respond({ token });
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

      if (!location_id) throw new Error('location_id required for restaurant entity type');

      const { data: loc } = await admin
        .from('locations')
        .select('id, zumrails_funding_source_id')
        .eq('id', location_id)
        .single();
      if (!loc) throw new Error('Location not found');

      const token = await createConnectToken({ userId: loc.zumrails_funding_source_id ?? undefined });
      console.log('[get-zumconnect-token] token generated for location:', location_id);
      return respond({ token });
    }

    throw new Error('Invalid entity_type');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[get-zumconnect-token] error:', message);
    return respond({ error: message }, 400);
  }
});
