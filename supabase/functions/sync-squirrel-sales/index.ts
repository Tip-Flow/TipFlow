import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServerSales } from '../_shared/squirrel.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

interface SalesCacheEntry {
  serverName: string;
  staffMemberId: string | null;
  totalSales: number;
  checkCount: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const location_id: string = body.location_id;
    const date: string = body.date ?? new Date().toISOString().split('T')[0];

    if (!location_id) {
      throw new Error('location_id is required');
    }

    console.log('[sync-squirrel-sales] start — location_id:', location_id, 'date:', date);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch staff first — needed for name-based matching
    const { data: staffRows, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name')
      .eq('location_id', location_id);

    if (staffErr) {
      console.warn('[sync-squirrel-sales] could not fetch staff_members:', staffErr.message);
    }

    const nameToId = new Map<string, string>();
    for (const s of staffRows ?? []) {
      nameToId.set(normalizeName(s.name), s.id);
    }
    console.log('[sync-squirrel-sales] loaded', nameToId.size, 'staff members for name matching');

    const sales = await getServerSales(date);

    const entries: SalesCacheEntry[] = sales.map((s) => {
      const staffMemberId = nameToId.get(normalizeName(s.serverName)) ?? null;
      console.log(
        '[sync-squirrel-sales] server:', s.serverName, '→ staff_member_id:', staffMemberId,
        '| totalSales:', s.totalSales, '| checkCount:', s.checkCount,
      );
      return {
        serverName: s.serverName,
        staffMemberId,
        totalSales: s.totalSales,
        checkCount: s.checkCount,
      };
    });

    const matchedCount = entries.filter((e) => e.staffMemberId !== null).length;
    const unmatchedCount = entries.length - matchedCount;

    console.log(
      '[sync-squirrel-sales] date:', date, '| entries:', entries.length,
      '| matched:', matchedCount, '| unmatched:', unmatchedCount,
    );

    const { error: updateErr } = await admin
      .from('locations')
      .update({
        squirrel_sales_cache: entries,
        squirrel_sales_cache_date: date,
      })
      .eq('id', location_id);

    if (updateErr) {
      console.error('[sync-squirrel-sales] failed to store cache:', updateErr.message);
    } else {
      console.log('[sync-squirrel-sales] stored sales cache for date:', date);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date,
        entries,
        matchedCount,
        unmatchedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-squirrel-sales] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
