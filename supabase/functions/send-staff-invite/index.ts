import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    server:           'Server',
    bartender:        'Bartender',
    runner:           'Runner',
    kitchen:          'Kitchen',
    support:          'Support',
    location_manager: 'Location Manager',
    regional_manager: 'Regional Manager',
  };
  return map[role] ?? role;
}

function isManagerRole(role: string): boolean {
  return role === 'location_manager' || role === 'regional_manager';
}

function buildInviteEmail(name: string, locationName: string, role: string, inviteUrl: string): string {
  const firstName = name.split(' ')[0];
  const isManager = isManagerRole(role);

  const bodyText = isManager
    ? `<strong style="color:#0f172a;">${locationName}</strong> has added you to Mise as a <strong style="color:#4169E1;">${roleLabel(role)}</strong>.`
    : `<strong style="color:#0f172a;">${locationName}</strong> has added you to Mise as a <strong style="color:#4169E1;">${roleLabel(role)}</strong>.`;

  const description = isManager
    ? `Mise is how your team gets paid. Manage shift schedules, calculate tips instantly, and pay staff directly — no cash, no spreadsheets.`
    : `After every shift, your tips are calculated automatically and waiting for you in Mise. Check your earnings, request a payout, and watch it land directly in your bank account.`;

  const step2 = isManager
    ? `Set up your location's tip pool rules and team`
    : `Link your bank account securely via Flinks — takes 2 minutes`;

  const step3 = isManager
    ? `Import your first shift and pay your team in seconds`
    : `After your next shift, tips land directly in your account`;

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
                ${bodyText}
              </p>

              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                ${description}
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
                    ${step2}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;vertical-align:top;width:28px;">
                    <div style="width:22px;height:22px;background:#4169E1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">3</div>
                  </td>
                  <td style="padding:8px 0 8px 10px;font-size:14px;color:#475569;line-height:1.5;">
                    ${step3}
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
    const {
      email,
      name,
      role,
      location_id,
      organisation_id,
      staff_member_id,
      manager_id,
    } = await req.json();

    if (!email || !name || !role) {
      throw new Error('email, name, and role are required');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify caller authorisation for sensitive roles
    const authHeader = req.headers.get('Authorization');
    if (role === 'regional_manager' && authHeader) {
      const jwt = authHeader.replace('Bearer ', '');
      const { data: { user } } = await admin.auth.getUser(jwt);
      if (!ADMIN_EMAILS.includes(user?.email ?? '')) {
        throw new Error('Unauthorized: only Mise admins can invite regional managers');
      }
    }

    // Look up location name for the email
    let locationName = 'your restaurant';
    if (location_id) {
      const { data: loc } = await admin
        .from('locations')
        .select('name')
        .eq('id', location_id)
        .maybeSingle();
      locationName = loc?.name ?? locationName;
    } else if (organisation_id) {
      const { data: org } = await admin
        .from('organisations')
        .select('name')
        .eq('id', organisation_id)
        .maybeSingle();
      locationName = org?.name ?? locationName;
    }

    // Resolve or create the record row
    let recordId: string | null = null;

    if (isManagerRole(role)) {
      if (manager_id) {
        recordId = manager_id;
      } else {
        // Check if manager already exists
        const { data: existing } = await admin
          .from('managers')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          recordId = existing.id;
        } else {
          const { data: inserted, error: insertErr } = await admin
            .from('managers')
            .insert({ name, email, role, organisation_id: organisation_id ?? null, location_id: location_id ?? null })
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          recordId = inserted?.id ?? null;
        }
      }
    } else {
      recordId = staff_member_id ?? null;
      if (!recordId) throw new Error('staff_member_id is required for staff role');
    }

    // Generate invite link (suppresses Supabase default email).
    // redirectTo is explicit so the link always lands on app.mise.ltd regardless
    // of what SITE_URL is set to in the Supabase project Auth settings.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { name, role, location_id, organisation_id },
        redirectTo: 'https://app.mise.ltd',
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

    // Stamp invite_sent_at on the correct table
    if (isManagerRole(role) && recordId) {
      await admin
        .from('managers')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', recordId);
    } else if (recordId) {
      await admin
        .from('staff_members')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', recordId);
    }

    // Send branded email for new users only
    let resendResult: Record<string, unknown> | null = null;
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
            from: 'Mise <noreply@mise.ltd>',
            to: email,
            subject: "You've been added to Mise",
            html: buildInviteEmail(name, locationName, role, inviteUrl),
          }),
        });

        const resendBody = await emailRes.json();
        if (!emailRes.ok) {
          console.error('[send-staff-invite] Resend error:', JSON.stringify(resendBody));
          resendResult = { ok: false, status: emailRes.status, body: resendBody };
        } else {
          console.log('[send-staff-invite] email sent via Resend id:', resendBody.id);
          resendResult = { ok: true, id: resendBody.id };
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, record_id: recordId, note, resend: resendResult }),
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
