import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEmployees } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLE_MAP: Record<string, string> = {
  server:    'server',
  servers:   'server',
  bartender: 'bartender',
  bartenders:'bartender',
  bar:       'bartender',
  runner:    'runner',
  runners:   'runner',
  busser:    'runner',
  bussers:   'runner',
  bus:       'runner',
  host:      'host',
  hosts:     'host',
  hostess:   'host',
  hostesses: 'host',
  kitchen:   'kitchen',
  cook:      'kitchen',
  'line cook':'kitchen',
  'prep cook':'kitchen',
  prep:      'kitchen',
  dishwasher:'kitchen',
};

function mapPosition(positionName: string): string {
  const lower = (positionName ?? '').toLowerCase().trim();
  return ROLE_MAP[lower] ?? 'server';
}

function extractName(emp: Record<string, unknown>): string {
  if (emp.first_name || emp.last_name) {
    return `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim();
  }
  return String(emp.name ?? emp.employee_name ?? 'Unknown');
}

function extractEmail(emp: Record<string, unknown>): string | null {
  const email = emp.email ?? emp.work_email ?? emp.personal_email ?? null;
  return email ? String(email).toLowerCase().trim() : null;
}

function extractPosition(emp: Record<string, unknown>): string {
  // positions may be an array of objects, or a primary_position string
  const positions = emp.positions as Record<string, unknown>[] | null;
  if (Array.isArray(positions) && positions.length > 0) {
    const first = positions[0];
    return String(first.name ?? first.title ?? first.position_name ?? 'server');
  }
  const pos = emp.primary_position ?? emp.position ?? emp.job_title ?? 'server';
  return String(pos);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { location_id, push_company_id, dryRun = false } = await req.json();

    if (!location_id || !push_company_id) {
      throw new Error('location_id and push_company_id are required');
    }

    console.log('[sync-push-staff] start — location_id:', location_id, 'push_company_id:', push_company_id, 'dryRun:', dryRun);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch all current staff for this location (index by email and name)
    const { data: existingStaff, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name, email, role')
      .eq('location_id', location_id);

    if (staffErr) throw staffErr;

    const byEmail = new Map<string, { id: string; name: string; role: string }>();
    const byName  = new Map<string, { id: string; email: string | null; role: string }>();
    for (const s of existingStaff ?? []) {
      if (s.email) byEmail.set(s.email.toLowerCase().trim(), { id: s.id, name: s.name, role: s.role });
      byName.set(s.name.toLowerCase().trim(), { id: s.id, email: s.email ?? null, role: s.role });
    }

    const employees = await getEmployees(Number(push_company_id));

    // Filter to active employees only
    const activeEmployees = employees.filter((emp) => {
      const status = String(emp.status ?? emp.employee_status ?? emp.active ?? 'active').toLowerCase();
      return status === 'active' || status === 'true' || status === '1';
    });
    console.log('[sync-push-staff] active employees:', activeEmployees.length, 'of', employees.length, 'total');

    let invited = 0;
    let updated = 0;
    let alreadyExists = 0;

    for (const emp of activeEmployees) {
      const name  = extractName(emp);
      const email = extractEmail(emp);
      const position = extractPosition(emp);
      const role  = mapPosition(position);

      console.log('[sync-push-staff] processing employee:', name, 'email:', email, 'position:', position, '→ role:', role);

      // Match by email first, then by name
      const existingByEmail = email ? byEmail.get(email) : null;
      const existingByName  = byName.get(name.toLowerCase().trim());
      const existing = existingByEmail ?? existingByName;

      if (existing) {
        // Update role if changed
        if (existing.role !== role) {
          const { error: updateErr } = await admin
            .from('staff_members')
            .update({ role })
            .eq('id', existing.id);
          if (updateErr) {
            console.error('[sync-push-staff] update role error:', updateErr.message);
          } else {
            console.log('[sync-push-staff] updated role for', name, 'from', existing.role, 'to', role);
            updated++;
          }
        } else {
          alreadyExists++;
          console.log('[sync-push-staff] already exists:', name);
        }
        continue;
      }

      // New employee — create staff_member row
      const { data: newStaff, error: insertErr } = await admin
        .from('staff_members')
        .insert({
          location_id,
          name,
          role,
          email: email ?? undefined,
          payout_method: 'etransfer',
          bank_linked: false,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[sync-push-staff] insert error for', name, ':', insertErr.message);
        continue;
      }

      console.log('[sync-push-staff] created staff_member:', newStaff.id, 'for', name);

      // DRY RUN MODE - remove before production launch with Dan
      if (dryRun) {
        console.log('[sync-push-staff] DRY RUN — skipping invite for', name, email ? `(${email})` : '(no email)');
      } else if (email) {
        // Only send invite if we have an email
        try {
          const inviteRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-staff-invite`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                email,
                name,
                role,
                location_id,
                staff_member_id: newStaff.id,
              }),
            },
          );
          const inviteBody = await inviteRes.json();
          console.log('[sync-push-staff] invite result for', email, ':', JSON.stringify(inviteBody));
          invited++;
        } catch (inviteErr: unknown) {
          const msg = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
          console.error('[sync-push-staff] invite failed for', email, ':', msg);
          // Don't fail the whole sync if invite fails
        }
      } else {
        console.log('[sync-push-staff] no email for', name, '— skipping invite');
        invited++; // Count as invited (staff created), invite will be manual
      }
    }

    const summary = { dryRun, updated, invited, alreadyExists, total: activeEmployees.length };
    console.log('[sync-push-staff] done —', JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-push-staff] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
