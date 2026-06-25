import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getLabourActuals } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LabourEntry {
  push_employee_id: string | number | null;
  name: string;
  hours: number;
  staff_member_id: string | null;
}

function extractEmployeeId(record: Record<string, unknown>): string | null {
  const id = record.employee_id ?? record.employeeId ?? record.id ?? record.push_employee_id ?? null;
  return id !== null ? String(id) : null;
}

function extractEmployeeName(record: Record<string, unknown>): string {
  if (record.first_name || record.last_name) {
    return `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim();
  }
  return String(record.employee_name ?? record.name ?? record.employeeName ?? 'Unknown');
}

function extractHours(record: Record<string, unknown>): number {
  // Try various field names Push might use for total hours
  const raw =
    record.total_hours ??
    record.totalHours ??
    record.regular_hours ??
    record.regularHours ??
    record.hours_worked ??
    record.hoursWorked ??
    record.actual_hours ??
    record.hours ??
    0;
  const parsed = parseFloat(String(raw));
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
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

    // Fetch labour actuals from Push
    const records = await getLabourActuals(push_company_id, date, date);

    // Fetch all staff for this location to map Push employees → staff_member_id
    const { data: staffData, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name, email')
      .eq('location_id', location_id);

    if (staffErr) throw staffErr;

    const staffByName  = new Map<string, string>(); // name.lower → id
    const staffByEmail = new Map<string, string>(); // email.lower → id
    for (const s of staffData ?? []) {
      staffByName.set(s.name.toLowerCase().trim(), s.id);
      if (s.email) staffByEmail.set(s.email.toLowerCase().trim(), s.id);
    }

    // Build mapped entries
    const entries: LabourEntry[] = [];
    for (const record of records) {
      const pushId = extractEmployeeId(record);
      const name   = extractEmployeeName(record);
      const hours  = extractHours(record);

      if (hours <= 0) {
        console.log('[sync-push-labour] skipping', name, '— 0 hours');
        continue;
      }

      // Match by name (email not available in labour actuals)
      const staffMemberId = staffByName.get(name.toLowerCase().trim()) ?? null;

      console.log('[sync-push-labour] record:', name, 'push_id:', pushId, 'hours:', hours, 'matched staff_id:', staffMemberId);

      entries.push({
        push_employee_id: pushId,
        name,
        hours,
        staff_member_id: staffMemberId,
      });
    }

    console.log('[sync-push-labour] mapped', entries.length, 'entries with hours > 0');

    // Store in locations.push_labour_cache so calculate tab can read it
    const { error: updateErr } = await admin
      .from('locations')
      .update({
        push_labour_cache: entries,
        push_labour_cache_date: date,
      })
      .eq('id', location_id);

    if (updateErr) {
      console.error('[sync-push-labour] failed to store cache:', updateErr.message);
      // Non-fatal — still return the data
    } else {
      console.log('[sync-push-labour] stored cache for date:', date);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date,
        entries,
        count: entries.length,
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
