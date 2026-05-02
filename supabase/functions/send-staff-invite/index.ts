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
    const { email, name, role, location_id, staff_member_id } = await req.json();

    if (!email || !staff_member_id) {
      throw new Error('email and staff_member_id are required');
    }

    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically injected
    // by the Supabase Edge Functions runtime — never hard-code these.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role, location_id, staff_member_id },
    });

    if (error) throw error;

    // Stamp invite_sent_at on the staff record (idempotent — overwrites on resend)
    await admin
      .from('staff_members')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', staff_member_id);

    return new Response(
      JSON.stringify({ success: true, user_id: data.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-staff-invite]', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
