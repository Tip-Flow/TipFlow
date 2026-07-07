import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEmployees } from '../_shared/squirrel.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const location_id: string = body.location_id;
    // DRY RUN by default — this function never sends invites (unlike
    // sync-push-staff); dryRun only controls whether new staff_members rows
    // are actually inserted or just logged.
    const dryRun: boolean = body.dryRun ?? true;

    if (!location_id) {
      throw new Error('location_id is required');
    }

    console.log('[sync-squirrel-staff] start — location_id:', location_id, 'dryRun:', dryRun);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: existingStaff, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('location_id', location_id);

    if (staffErr) throw staffErr;

    const byName = new Map<string, { id: string }>();
    for (const s of existingStaff ?? []) {
      byName.set(normalizeName(s.name), { id: s.id });
    }
    console.log('[sync-squirrel-staff] loaded', byName.size, 'existing staff for matching');

    const employees = await getEmployees();
    console.log('[sync-squirrel-staff] fetched', employees.length, 'active employees from Squirrel');

    let matched = 0;
    let created = 0;
    const unmatchedNames: string[] = [];

    for (const emp of employees) {
      const name = `${emp.firstName} ${emp.lastName}`.trim();
      const existing = byName.get(normalizeName(name));

      if (existing) {
        matched++;
        console.log('[sync-squirrel-staff] matched:', name, '→ staff_member_id:', existing.id);
        continue;
      }

      unmatchedNames.push(name);

      if (dryRun) {
        console.log('[sync-squirrel-staff] DRY RUN — would create staff_member for', name, '(EmpID:', emp.empId, ') — skipping insert');
        continue;
      }

      // Squirrel's K_Employee table has no confirmed role/position column —
      // new staff default to 'server'; managers adjust roles manually.
      const { data: newStaff, error: insertErr } = await admin
        .from('staff_members')
        .insert({
          location_id,
          name,
          role: 'server',
          payout_method: 'etransfer',
          bank_linked: false,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[sync-squirrel-staff] insert error for', name, ':', insertErr.message);
        continue;
      }

      console.log('[sync-squirrel-staff] created staff_member:', newStaff.id, 'for', name, '(EmpID:', emp.empId, ') — no invite sent');
      created++;
    }

    const summary = {
      dryRun,
      total: employees.length,
      matched,
      created,
      unmatchedCount: unmatchedNames.length,
      unmatchedNames,
    };
    console.log('[sync-squirrel-staff] done —', JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-squirrel-staff] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
