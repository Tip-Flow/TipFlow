import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_ROLES = new Set(['server', 'bartender', 'runner', 'host', 'kitchen', 'support']);
const INVITE_REDIRECT = 'https://app.mise.ltd/invite';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    server:           'Server',
    bartender:        'Bartender',
    runner:           'Runner',
    host:             'Host',
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

function buildInviteEmail(name: string, placeName: string, role: string, inviteUrl: string): string {
  const firstName = escapeHtml(name.split(' ')[0] || name);
  const safePlace = escapeHtml(placeName);
  const safeRole = escapeHtml(roleLabel(role));
  const safeUrl = escapeHtml(inviteUrl);
  const isManager = isManagerRole(role);

  const description = isManager
    ? 'Mise is how your team gets paid. Manage shifts, calculate tips instantly, and pay staff directly — no cash, no spreadsheets.'
    : 'After every shift, your tips are calculated and waiting for you in Mise. Check your earnings and get paid directly to your bank account.';
  const step2 = isManager
    ? "Set up your location's tip pool rules and team"
    : 'Link your bank account securely through Zum Connect — takes 2 minutes';
  const step3 = isManager
    ? 'Load your first shift and pay your team'
    : 'After your next shift, your tips are paid to your account';

  const stepRow = (n: number, text: string) => `
                <tr>
                  <td style="padding:8px 0;vertical-align:top;width:28px;">
                    <div style="width:22px;height:22px;background:#4169E1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">${n}</div>
                  </td>
                  <td style="padding:8px 0 8px 10px;font-size:14px;color:#475569;line-height:1.5;">${text}</td>
                </tr>`;

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
          <tr>
            <td align="center" style="background:#4169E1;border-radius:16px 16px 0 0;padding:32px 40px 28px;">
              <div style="font-size:36px;font-weight:900;color:#ffffff;letter-spacing:-0.04em;line-height:1;margin-bottom:6px;">Mise</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.05em;text-transform:uppercase;">Everything in its Place</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Hi ${firstName} 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                <strong style="color:#0f172a;">${safePlace}</strong> has added you to Mise as a <strong style="color:#4169E1;">${safeRole}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">${description}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
                <tr>
                  <td align="center">
                    <a href="${safeUrl}" style="display:inline-block;background:#4169E1;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;">
                      Set Up Your Account →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">
                This link works once. If it has expired, ask your manager to send a new invite.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr><td style="height:1px;background:#e2e8f0;"></td></tr>
              </table>
              <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">What happens next</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${stepRow(1, 'Click the button above and set your password')}
                ${stepRow(2, step2)}
                ${stepRow(3, step3)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">
                Sent by Mise · <a href="https://mise.ltd" style="color:#4169E1;text-decoration:none;">mise.ltd</a>
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">🔒 Your data is stored in Canada</p>
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Read and validate the request ────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const role = String(body.role ?? '').trim();
    const locationId = typeof body.location_id === 'string' && body.location_id ? body.location_id : null;
    const orgId = typeof body.organisation_id === 'string' && body.organisation_id ? body.organisation_id : null;
    const staffMemberId = typeof body.staff_member_id === 'string' && body.staff_member_id ? body.staff_member_id : null;

    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (!name || name.length > 100) throw new HttpError(400, 'Enter a name (up to 100 characters)');
    if (!isManagerRole(role) && !STAFF_ROLES.has(role)) throw new HttpError(400, 'Unknown role');
    for (const id of [locationId, orgId, staffMemberId]) {
      if (id && !UUID_RE.test(id)) throw new HttpError(400, 'Invalid ID in request');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Who is asking? (a login is always required) ──────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new HttpError(401, 'Unauthorized');
    const callerEmail = (user.email ?? '').toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(callerEmail);

    const { data: callerMgrs, error: cmErr } = await admin
      .from('managers')
      .select('role, location_id, organisation_id')
      .eq('email', callerEmail);
    if (cmErr) throw new Error(`caller lookup failed: ${cmErr.message}`);
    const managesLocation = (locId: string) =>
      (callerMgrs ?? []).some((m) => m.location_id === locId);
    const isRegionalOf = (org: string) =>
      (callerMgrs ?? []).some((m) => m.role === 'regional_manager' && m.organisation_id === org);

    // ── The location (if any) and the organisation it belongs to ─────────────
    let loc: Record<string, unknown> | null = null;
    if (locationId) {
      const { data, error } = await admin.from('locations').select('*').eq('id', locationId).maybeSingle();
      if (error) throw new Error(`location lookup failed: ${error.message}`);
      if (!data) throw new HttpError(404, 'Location not found');
      loc = data;
    }
    const locOrgId = loc ? ((loc.organisation_id ?? loc.org_id ?? null) as string | null) : null;
    let placeName = loc?.name ? String(loc.name) : 'your restaurant';

    // ── Permission check and record, by role ─────────────────────────────────
    let recordId: string | null = null;

    if (role === 'regional_manager') {
      if (!isAdmin) throw new HttpError(403, 'Only Mise admins can invite regional managers');
      if (!orgId) throw new HttpError(400, 'organisation_id is required');
      const { data: org, error: orgErr } = await admin
        .from('organisations').select('id, name').eq('id', orgId).maybeSingle();
      if (orgErr) throw new Error(`organisation lookup failed: ${orgErr.message}`);
      if (!org) throw new HttpError(404, 'Organisation not found');
      placeName = org.name ?? placeName;

      const { data: existing } = await admin
        .from('managers').select('id')
        .eq('email', email).eq('role', 'regional_manager').eq('organisation_id', orgId)
        .limit(1);
      if (existing && existing.length > 0) {
        recordId = existing[0].id;
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('managers')
          .insert({ name, email, role, organisation_id: orgId, location_id: null })
          .select('id').single();
        if (insErr) throw new Error(`manager insert failed: ${insErr.message}`);
        recordId = inserted.id;
      }

    } else if (role === 'location_manager') {
      if (!locationId) throw new HttpError(400, 'location_id is required');
      if (!isAdmin && !(locOrgId && isRegionalOf(locOrgId))) {
        throw new HttpError(403, "Only a Mise admin or this location's regional manager can invite its managers");
      }
      const { data: existing } = await admin
        .from('managers').select('id')
        .eq('email', email).eq('location_id', locationId)
        .limit(1);
      if (existing && existing.length > 0) {
        recordId = existing[0].id;
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('managers')
          .insert({ name, email, role, organisation_id: locOrgId, location_id: locationId })
          .select('id').single();
        if (insErr) throw new Error(`manager insert failed: ${insErr.message}`);
        recordId = inserted.id;
      }

    } else {
      // Staff roles: an existing staff record at this location is required.
      if (!locationId) throw new HttpError(400, 'location_id is required');
      if (!staffMemberId) throw new HttpError(400, 'staff_member_id is required');
      if (!isAdmin && !managesLocation(locationId) && !(locOrgId && isRegionalOf(locOrgId))) {
        throw new HttpError(403, 'This location does not belong to your account');
      }
      const { data: staffRow, error: staffErr } = await admin
        .from('staff_members').select('id, email, location_id')
        .eq('id', staffMemberId).maybeSingle();
      if (staffErr) throw new Error(`staff lookup failed: ${staffErr.message}`);
      if (!staffRow || staffRow.location_id !== locationId) {
        throw new HttpError(404, 'Staff member not found at this location');
      }
      if (String(staffRow.email ?? '').trim().toLowerCase() !== email) {
        throw new HttpError(400, "The email must match this staff member's email in Mise");
      }
      recordId = staffMemberId;
    }

    // ── One-time invite link (no tokens copied into URLs or logs) ────────────
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { name, role, location_id: locationId, organisation_id: role === 'regional_manager' ? orgId : locOrgId },
        redirectTo: INVITE_REDIRECT,
      },
    });

    let inviteUrl: string | null = null;
    let note: string | null = null;
    if (linkError) {
      const alreadyRegistered =
        /already (been )?registered/i.test(linkError.message) ||
        (linkError as { status?: number }).status === 422;
      if (!alreadyRegistered) throw new Error(`invite link failed: ${linkError.message}`);
      note = 'This person already has a Mise account and can log in directly.';
    } else {
      inviteUrl = linkData?.properties?.action_link ?? null;
    }

    // ── Send the branded email (only if email sending is set up) ─────────────
    let emailSent = false;
    if (inviteUrl) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        note = 'Invite created, but email sending is not set up yet, so no email was sent.';
      } else {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Mise <noreply@mise.ltd>',
            to: email,
            subject: "You've been added to Mise",
            html: buildInviteEmail(name, placeName, role, inviteUrl),
          }),
        });
        emailSent = emailRes.ok;
        if (!emailSent) {
          console.error('[send-staff-invite] email provider status', emailRes.status, '| record', recordId);
          note = 'The invite email could not be sent. Please try again later.';
        }
      }
    }

    // Only mark as invited when an email actually went out.
    if (emailSent && recordId) {
      const table = isManagerRole(role) ? 'managers' : 'staff_members';
      await admin.from(table).update({ invite_sent_at: new Date().toISOString() }).eq('id', recordId);
    }

    console.log('[send-staff-invite] role', role, '| record', recordId, '| email sent', emailSent, '| already registered', !inviteUrl);
    return respond({ success: true, record_id: recordId, email_sent: emailSent, note });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[send-staff-invite] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});