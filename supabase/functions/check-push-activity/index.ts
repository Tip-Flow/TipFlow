import { findRecentActivityDates } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { push_company_id } = await req.json();

    if (!push_company_id) {
      throw new Error('push_company_id is required');
    }

    console.log('[check-push-activity] start — push_company_id:', push_company_id);

    const datesWithActivity = await findRecentActivityDates(Number(push_company_id));

    console.log('[check-push-activity] done —', datesWithActivity.length, 'dates found:', datesWithActivity.join(', ') || '(none)');

    return new Response(
      JSON.stringify({ datesWithActivity }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[check-push-activity] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
