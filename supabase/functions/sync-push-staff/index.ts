import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEmployees } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_MAP: Record<string, string> = {
  server:      'server',
  servers:     'server',
  bartender:   'bartender',
  bartenders:  'bartender',
  bar:         'bartender',
  runner:      'runner',
  runners:     'runner',
  busser:      'runner',
  bussers:     'runner',
  bus:         'runner',
  host:        'host',
  hosts:       'host',
  hostess:     'host',
  hostesses:   'host',
  kitchen:     'kitchen',
  cook:        'kitchen',
  'line cook': 'kitchen',
  'prep cook': 'kitchen',
  prep:        'kitchen',
  dishwasher:  'kitchen',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Unknown positions return null: they are listed for review, never guessed.
function mapPosition(positionName: string): string | null {
  const lower = (positionName ?? '').toLowerCase().trim();
  return ROLE_MAP[lower] ?? null;
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
  const positions = emp.positions as Record<string, unknown>[] | null;
  if (Array.isArray(positions) && positions.length > 0) {
    const first = positions[0];
    return String(first.name ?? first.title ?? first.position_name ?? '');
  }
  return String(emp.primary_position ?? emp.position ?? emp.job_title ?? '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let body: { location_id?: unknown; dryRun?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const locationId = typeof body.location_id === 'string' ? body.location_id : '';
    if (!UUID_RE.test(locationId)) throw new HttpError(400, 'location_id is required');

    // Safe by default: ONLY an explicit dryRun === false makes changes.
    const dryRun = body.dryRun !== false;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth: admin, or a manager of THIS location ───────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new HttpError(401, 'Unauthorized');

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    if (!isAdmin) {
      const { data: mgrRows, error: mgrErr } = await admin
        .from('managers')
        .select('id')
        .eq('email', user.email ?? '')
        .eq('location_id', locationId)
        .limit(1);
      if (mgrErr || !mgrRows || mgrRows.length === 0) {
        throw new HttpError(403, 'This location does not belong to your account');
      }
    }

    // ── Push company comes from our own records, never from the caller ───────
    const { data: loc, error: locErr } = await admin
      .from('locations')
      .select('id, push_company_id')
      .eq('id', locationId)
      .maybeSingle();
    if (locErr) throw new Error(`location lookup failed: ${locErr.message}`);
    if (!loc) throw new HttpError(404, 'Location not found');
    if (!loc.push_company_id) throw new HttpError(400, 'This location has no Push company configured');

    // ── Current Mise staff for this location ─────────────────────────────────
    const { data: existingStaff, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name, email, role')
      .eq('location_id', locationId);
    if (staffErr) throw new Error(`staff lookup failed: ${staffErr.message}`);

    const byEmail = new Map<string, { id: string; role: string }>();
    const byName = new Map<string, { id: string; email: string | null; role: string }>();
    for (const s of existingStaff ?? []) {
      if (s.email) byEmail.set(String(s.email).toLowerCase().trim(), { id: s.id, role: s.role });
      byName.set(String(s.name).toLowerCase().trim(), { id: s.id, email: s.email ? String(s.email).toLowerCase().trim() : null, role: s.role });
    }

    // ── Push employees (active only) ─────────────────────────────────────────
    const employees = await getEmployees(Number(loc.push_company_id));
    const activeEmployees = employees.filter((emp) => {
      const status = String(emp.status ?? emp.employee_status ?? emp.active ?? 'active').toLowerCase();
      return status === 'active' || status === 'true' || status === '1';
    });

    const toAdd: { name: string; email: string | null; role: string }[] = [];
    const roleChanges: { staffMemberId: string; name: string; from: string; to: string }[] = [];
    const unmapped: { name: string; position: string }[] = [];
    const needsReview: { name: string; reason: string }[] = [];
    let alreadyExists = 0;

    for (const emp of activeEmployees) {
      const name = extractName(emp);
      const email = extractEmail(emp);
      const position = extractPosition(emp);
      const role = mapPosition(position);

      if (!role) {
        unmapped.push({ name, position: position || '(no position in Push)' });
        continue;
      }

      // Strong match: same email.
      const emailMatch = email ? byEmail.get(email) : undefined;
      if (emailMatch) {
        if (emailMatch.role !== role) {
          roleChanges.push({ staffMemberId: emailMatch.id, name, from: emailMatch.role, to: role });
        } else {
          alreadyExists++;
        }
        continue;
      }

      // Weak match: same name only. Never change anything automatically.
      const nameMatch = byName.get(name.toLowerCase().trim());
      if (nameMatch) {
        if (email && nameMatch.email && nameMatch.email !== email) {
          needsReview.push({ name, reason: 'Same name as an existing staff member, but a different email' });
        } else if (nameMatch.role !== role) {
          needsReview.push({ name, reason: `Push says ${role}, Mise says ${nameMatch.role}` });
        } else {
          alreadyExists++;
        }
        continue;
      }

      toAdd.push({ name, email, role });
    }

    // ── Apply (only when explicitly asked). Never sends invites. ─────────────
    let added = 0;
    let updated = 0;
    const failures: string[] = [];
    if (!dryRun) {
      for (const p of toAdd) {
        const { error } = await admin.from('staff_members').insert({
          location_id: locationId,
          name: p.name,
          role: p.role,
          email: p.email ?? undefined,
          payout_method: 'etransfer',
          bank_linked: false,
        });
        if (error) failures.push(p.name); else added++;
      }
      for (const c of roleChanges) {
        const { error } = await admin
          .from('staff_members')
          .update({ role: c.to })
          .eq('id', c.staffMemberId)
          .eq('location_id', locationId);
        if (error) failures.push(c.name); else updated++;
      }
    }

    console.log('[sync-push-staff] location', locationId, '| dryRun', dryRun,
      '| active', activeEmployees.length, '| existing', alreadyExists,
      '| toAdd', toAdd.length, '| roleChanges', roleChanges.length,
      '| unmapped', unmapped.length, '| review', needsReview.length,
      '| added', added, '| updated', updated, '| failures', failures.length);

    return respond({
      success: true,
      dryRun,
      total: activeEmployees.length,
      alreadyExists,
      added,
      updated,
      invited: 0,
      would_add: toAdd.map((p) => ({ name: p.name, role: p.role, has_email: !!p.email })),
      role_changes: roleChanges.map((c) => ({ name: c.name, from: c.from, to: c.to })),
      unmapped_positions: unmapped,
      needs_review: needsReview,
      failures: failures.length ? failures : undefined,
    });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[sync-push-staff] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});