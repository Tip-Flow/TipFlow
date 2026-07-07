import { findRecentSalesDates } from '../_shared/squirrel.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[check-squirrel-activity] start');

    const datesWithActivity = await findRecentSalesDates();

    console.log('[check-squirrel-activity] done —', datesWithActivity.length, 'dates found:', datesWithActivity.join(', ') || '(none)');

    return new Response(
      JSON.stringify({ datesWithActivity }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[check-squirrel-activity] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
