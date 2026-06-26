import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEmployeeLabour } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Labour types that represent non-worked time — excluded from hour totals
const NON_WORKED_TYPES = new Set(['vac', 'vacation', 'pto', 'holiday', 'stat', 'sick', 'leave']);

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

interface EmployeeCacheEntry {
  employee_name: string;
  staff_member_id: string | null;
  hours: number;
  position_name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const location_id: string = body.location_id;
    const push_company_id: number = Number(body.push_company_id);
    const date: string = body.date ?? new Date().toISOString().split('T')[0];

    if (!location_id || !push_company_id) {
      throw new Error('location_id and push_company_id are required');
    }

    console.log('[sync-push-labour] start — location_id:', location_id, 'push_company_id:', push_company_id, 'date:', date);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch staff members for this location to enable name matching
    const { data: staffRows, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('location_id', location_id);

    if (staffErr) {
      console.warn('[sync-push-labour] could not fetch staff_members:', staffErr.message);
    }

    // Build normalized name → staff_member_id lookup
    const nameToId = new Map<string, string>();
    for (const s of staffRows ?? []) {
      nameToId.set(normalizeName(s.name), s.id);
    }
    console.log('[sync-push-labour] loaded', nameToId.size, 'staff members for name matching');

    const rawRows = await getEmployeeLabour(push_company_id, date, date);

    // Sum worked hours per employee (exclude vacation / non-worked types)
    const hoursPerEmployee = new Map<string, { hours: number; positionName: string }>();
    for (const row of rawRows) {
      const lt = row.labourType.toLowerCase();
      if (NON_WORKED_TYPES.has(lt)) {
        console.log('[sync-push-labour] skipping non-worked row:', row.employeeName, 'type:', row.labourType);
        continue;
      }
      const existing = hoursPerEmployee.get(row.employeeName) ?? { hours: 0, positionName: row.positionName };
      hoursPerEmployee.set(row.employeeName, {
        hours: Math.round((existing.hours + row.hours) * 100) / 100,
        positionName: existing.positionName || row.positionName,
      });
    }

    const employees: EmployeeCacheEntry[] = [];
    for (const [employeeName, { hours, positionName }] of hoursPerEmployee) {
      const staffMemberId = nameToId.get(normalizeName(employeeName)) ?? null;
      employees.push({
        employee_name: employeeName,
        staff_member_id: staffMemberId,
        hours,
        position_name: positionName,
      });
      console.log('[sync-push-labour] employee:', employeeName, '→ staff_member_id:', staffMemberId, 'hours:', hours, 'position:', positionName);
    }

    const totalHours = Math.round(employees.reduce((s, e) => s + e.hours, 0) * 100) / 100;
    const matchedCount = employees.filter((e) => e.staff_member_id !== null).length;

    console.log('[sync-push-labour] date:', date, '| employees:', employees.length, '| matched:', matchedCount, '| totalHours:', totalHours);

    const { error: updateErr } = await admin
      .from('locations')
      .update({
        push_labour_cache: employees,
        push_labour_cache_date: date,
      })
      .eq('id', location_id);

    if (updateErr) {
      console.error('[sync-push-labour] failed to store cache:', updateErr.message);
    } else {
      console.log('[sync-push-labour] stored per-employee cache for date:', date);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date,
        employees,
        totalHours,
        matchedCount,
        count: employees.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-push-labour] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
