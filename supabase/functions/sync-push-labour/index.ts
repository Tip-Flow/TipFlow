import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getLabourActuals } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// labour-actuals returns department aggregates, not per-employee rows.
// We store the department summary so the manager can see total hours per
// department. Individual employee hours need a different Push endpoint.
interface DepartmentEntry {
  department_id: number | null;
  department_name: string;
  hours: number;
  costs: number;
}

function extractDepartmentEntry(record: Record<string, unknown>): DepartmentEntry {
  const rawHours = record.hours ?? record.totalHours ?? record.actual_hours ?? 0;
  const rawCosts = record.costs ?? record.totalCosts ?? record.labour_cost ?? 0;
  return {
    department_id: record.departmentId != null ? Number(record.departmentId) : null,
    department_name: String(record.departmentName ?? record.department ?? 'Unknown'),
    hours: Math.round(parseFloat(String(rawHours)) * 100) / 100 || 0,
    costs: Math.round(parseFloat(String(rawCosts)) * 100) / 100 || 0,
  };
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

    const records = await getLabourActuals(push_company_id, date, date);

    const departments: DepartmentEntry[] = records.map(extractDepartmentEntry);

    const totalHours = Math.round(departments.reduce((s, d) => s + d.hours, 0) * 100) / 100;
    const totalCosts = Math.round(departments.reduce((s, d) => s + d.costs, 0) * 100) / 100;

    console.log('[sync-push-labour] date:', date, '| departments:', departments.length, '| totalHours:', totalHours, '| totalCosts:', totalCosts);
    departments.forEach((d) => {
      console.log('[sync-push-labour] dept:', d.department_name, 'hours:', d.hours, 'costs:', d.costs);
    });

    // Store department-level summary in locations cache.
    // Note: this is aggregated by department, not individual employees.
    const { error: updateErr } = await admin
      .from('locations')
      .update({
        push_labour_cache: departments,
        push_labour_cache_date: date,
      })
      .eq('id', location_id);

    if (updateErr) {
      console.error('[sync-push-labour] failed to store cache:', updateErr.message);
    } else {
      console.log('[sync-push-labour] stored department cache for date:', date);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date,
        departments,
        totalHours,
        totalCosts,
        count: departments.length,
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
