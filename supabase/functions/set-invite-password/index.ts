import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();

    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header.');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify the caller's invite session JWT and extract their user ID
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    console.log('[set-invite-password] getUser — id:', user?.id ?? 'none', 'email:', user?.email ?? 'none', 'error:', userErr?.message ?? 'none');

    if (userErr || !user) {
      throw new Error('Invite session invalid or expired. Please request a new invite.');
    }

    // Use the admin API to set the password — bypasses the client-side AMR
    // security level restriction that blocks updateUser() from invite sessions.
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password });
    console.log('[set-invite-password] admin.updateUserById — error:', updateErr?.message ?? 'none');

    if (updateErr) {
      throw updateErr;
    }

    return new Response(
      JSON.stringify({ success: true, user_id: user.id, email: user.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[set-invite-password] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
