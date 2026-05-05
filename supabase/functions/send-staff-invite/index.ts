import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    server: 'Server',
    bartender: 'Bartender',
    runner: 'Runner',
    kitchen: 'Kitchen',
    support: 'Support',
  };
  return map[role] ?? role;
}

function buildInviteEmail(name: string, locationName: string, role: string, inviteUrl: string): string {
  const firstName = name.split(' ')[0];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been added to Mise</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#4169E1;border-radius:16px 16px 0 0;padding:32px 40px 28px;">
              <div style="font-size:36px;font-weight:900;color:#ffffff;letter-spacing:-0.04em;line-height:1;margin-bottom:6px;">Mise</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.05em;text-transform:uppercase;">Everything in its Place</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Hi ${firstName} 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                <strong style="color:#0f172a;">${locationName}</strong> has added you to Mise as a <strong style="color:#4169E1;">${roleLabel(role)}</strong>.
              </p>

              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Mise is how your team gets paid. Your tips are calculated instantly after every shift and deposited directly into your bank account — no cash, no waiting.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}"
                       style="display:inline-block;background:#4169E1;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:0.1px;">
                      Set Up Your Account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">
                This invite link expires in 24 hours.
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr><td style="height:1px;background:#e2e8f0;"></td></tr>
              </table>

              <!-- What to expect -->
              <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">What happens next</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;vertical-align:top;width:28px;">
                    <div style="width:22px;height:22px;background:#4169E1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">1</div>
                  </td>
                  <td style="padding:8px 0 8px 10px;font-size:14px;color:#475569;line-height:1.5;">
                    Click the button above and set your password
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;vertical-align:top;width:28px;">
                    <div style="width:22px;height:22px;background:#4169E1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">2</div>
                  </td>
                  <td style="padding:8px 0 8px 10px;font-size:14px;color:#475569;line-height:1.5;">
                    Link your bank account securely via Flinks — takes 2 minutes
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;vertical-align:top;width:28px;">
                    <div style="width:22px;height:22px;background:#4169E1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">3</div>
                  </td>
                  <td style="padding:8px 0 8px 10px;font-size:14px;color:#475569;line-height:1.5;">
                    After your next shift, tips land directly in your account
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">
                Sent by Mise · <a href="https://mise.ltd" style="color:#4169E1;text-decoration:none;">mise.ltd</a>
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                🍁 RPAA Registered &nbsp;·&nbsp; 🔒 PIPEDA Compliant &nbsp;·&nbsp; 🏦 Data: ca-central-1
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

    // Look up location name for the email body
    const { data: loc } = await admin
      .from('locations')
      .select('name')
      .eq('id', location_id)
      .maybeSingle();
    const locationName = loc?.name ?? 'your restaurant';

    // generateLink creates the auth account and returns the invite URL
    // without sending Supabase's default plain-text invite email.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { name, role, location_id, staff_member_id },
      },
    });

    let userId: string | null = null;
    let inviteUrl: string | null = null;
    let note: string | null = null;

    if (linkError) {
      const alreadyRegistered =
        linkError.message.includes('already been registered') ||
        linkError.message.includes('already registered') ||
        (linkError as any).status === 422;

      if (alreadyRegistered) {
        note = 'User already has a Mise account and can log in directly.';
        console.log('[send-staff-invite] already registered:', email);
      } else {
        throw linkError;
      }
    } else {
      userId = linkData.user.id;
      inviteUrl = linkData.properties.action_link;
    }

    // Stamp invite_sent_at regardless of new/existing
    let resendResult: Record<string, unknown> | null = null;
    await admin
      .from('staff_members')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', staff_member_id);

    // Send branded Resend email for new users only
    if (inviteUrl) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        console.warn('[send-staff-invite] RESEND_API_KEY not set — skipping branded email');
      } else {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Mise <onboarding@resend.dev>',
            to: email,
            subject: "You've been added to Mise",
            html: buildInviteEmail(name, locationName, role, inviteUrl),
          }),
        });

        const resendBody = await emailRes.json();
        if (!emailRes.ok) {
          // Log but don't fail — auth account was created successfully
          console.error('[send-staff-invite] Resend error:', JSON.stringify(resendBody));
          resendResult = { ok: false, status: emailRes.status, body: resendBody };
        } else {
          console.log('[send-staff-invite] email sent via Resend id:', resendBody.id);
          resendResult = { ok: true, id: resendBody.id };
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, note, resend: resendResult }),
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
