import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEmployeeLabour } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// All current restaurants are in BC. Move this to a per-location setting
// before onboarding a restaurant in another time zone.
const RESTAURANT_TZ = 'America/Vancouver';

// Labour types that represent non-worked time — excluded from hour totals
const NON_WORKED_TYPES = new Set(['vac', 'vacation', 'pto', 'holiday', 'stat', 'sick', 'leave']);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Today's date in the restaurant's own time zone, as YYYY-MM-DD.
function restaurantToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RESTAURANT_TZ }).format(new Date());
}

interface EmployeeCacheEntry {
  employee_name: string;
  staff_member_id: string | null;
  hours: number;
  position_name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let body: { location_id?: unknown; date?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const locationId = typeof body.location_id === 'string' ? body.location_id : '';
    if (!UUID_RE.test(locationId)) throw new HttpError(400, 'location_id is required');

    const date = typeof body.date === 'string' && body.date ? body.date : restaurantToday();
    if (!DATE_RE.test(date) || isNaN(Date.parse(date))) {
      throw new HttpError(400, 'date must be YYYY-MM-DD');
    }

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

    // ── Staff for name matching. Shared names are never matched. ─────────────
    const { data: staffRows, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('location_id', locationId);
    if (staffErr) throw new Error(`staff lookup failed: ${staffErr.message}`);

    const nameToId = new Map<string, string>();
    const ambiguousNames = new Set<string>();
    for (const s of staffRows ?? []) {
      const key = normalizeName(String(s.name));
      if (nameToId.has(key)) ambiguousNames.add(key);
      else nameToId.set(key, s.id);
    }

    // ── Push hours for the date ──────────────────────────────────────────────
    const rawRows = await getEmployeeLabour(Number(loc.push_company_id), date, date);

    const hoursPerEmployee = new Map<string, { hours: number; positionName: string }>();
    let skippedNonWorked = 0;
    for (const row of rawRows) {
      if (NON_WORKED_TYPES.has(String(row.labourType).toLowerCase())) {
        skippedNonWorked++;
        continue;
      }
      const existing = hoursPerEmployee.get(row.employeeName) ?? { hours: 0, positionName: row.positionName };
      hoursPerEmployee.set(row.employeeName, {
        hours: Math.round((existing.hours + row.hours) * 100) / 100,
        positionName: existing.positionName || row.positionName,
      });
    }

    const employees: EmployeeCacheEntry[] = [];
    const sharedNames: string[] = [];
    for (const [employeeName, { hours, positionName }] of hoursPerEmployee) {
      const key = normalizeName(employeeName);
      let staffMemberId: string | null = null;
      if (ambiguousNames.has(key)) {
        sharedNames.push(employeeName);
      } else {
        staffMemberId = nameToId.get(key) ?? null;
      }
      employees.push({
        employee_name: employeeName,
        staff_member_id: staffMemberId,
        hours,
        position_name: positionName,
      });
    }

    const totalHours = Math.round(employees.reduce((s, e) => s + e.hours, 0) * 100) / 100;
    const matchedCount = employees.filter((e) => e.staff_member_id !== null).length;

    const { error: updateErr } = await admin
      .from('locations')
      .update({ push_labour_cache: employees, push_labour_cache_date: date })
      .eq('id', locationId);
    if (updateErr) throw new Error(`cache update failed: ${updateErr.message}`);

    console.log('[sync-push-labour] location', locationId, '| date', date,
      '| employees', employees.length, '| matched', matchedCount,
      '| shared names', sharedNames.length, '| non-worked skipped', skippedNonWorked);

    return respond({
      success: true,
      date,
      employees,
      totalHours,
      matchedCount,
      count: employees.length,
      shared_names: sharedNames,
    });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[sync-push-labour] error', status, '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});