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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role, location_id, staff_member_id },
    });

    let userId: string | null = null;
    let note: string | null = null;

    if (error) {
      const alreadyRegistered =
        error.message.includes('already been registered') ||
        error.message.includes('already registered') ||
        error.status === 422;

      if (alreadyRegistered) {
        // User already has a Mise account — they can log in directly.
        // Still stamp invite_sent_at so the manager sees the Invited badge.
        note = 'User already has a Mise account and can log in directly.';
        console.log('[send-staff-invite] user already registered:', email, '— marking invite_sent_at anyway');
      } else {
        throw error;
      }
    } else {
      userId = data.user.id;
    }

    // Stamp invite_sent_at regardless of whether they were new or existing
    const { error: updateErr } = await admin
      .from('staff_members')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', staff_member_id);

    if (updateErr) {
      console.warn('[send-staff-invite] failed to stamp invite_sent_at:', updateErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, note }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-staff-invite] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
