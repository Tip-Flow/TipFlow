import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fundWallet, getWalletBalance } from '../_shared/zumrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const MIN_AMOUNT_DOLLARS = 1.00;
const MAX_AMOUNT_DOLLARS = 50_000.00;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  console.log('[fund-wallet] START', new Date().toISOString());

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Parse body ──────────────────────────────────────────────────────────
    const rawBody = await req.text();
    console.log('[fund-wallet] raw body:', rawBody);
    const body = JSON.parse(rawBody) as {
      location_id?: string;
      amount_dollars?: number;
    };

    const { location_id, amount_dollars, balance_only } = body as typeof body & { balance_only?: boolean };
    console.log('[fund-wallet] location_id:', location_id ?? 'none', '| amount_dollars:', amount_dollars ?? 'none', '| balance_only:', balance_only ?? false);

    // ── Supabase admin client ────────────────────────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized — no Authorization header');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error(`Unauthorized — ${authErr?.message ?? 'no user'}`);
    console.log('[fund-wallet] caller:', user.email);

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    if (!isAdmin) {
      const { data: mgr } = await admin
        .from('managers')
        .select('id, location_id')
        .eq('email', user.email)
        .maybeSingle();
      if (!mgr) throw new Error('Unauthorized — caller is not a manager or admin');
      // Location managers can only fund their own location
      if (mgr.location_id && mgr.location_id !== location_id) {
        throw new Error('Unauthorized — this location does not belong to your account');
      }
    }

    // ── Balance-only mode ────────────────────────────────────────────────────
    if (balance_only) {
      const { walletId, balance } = await getWalletBalance();
      console.log('[fund-wallet] balance-only — walletId:', walletId, '| balance:', balance);
      return respond({ wallet_balance: balance });
    }

    // ── Validate required fields for funding ────────────────────────────────
    if (!location_id) throw new Error('location_id is required');
    if (amount_dollars === undefined || amount_dollars === null) throw new Error('amount_dollars is required');
    if (typeof amount_dollars !== 'number' || isNaN(amount_dollars)) throw new Error('amount_dollars must be a number');
    if (amount_dollars < MIN_AMOUNT_DOLLARS) throw new Error(`Minimum funding amount is $${MIN_AMOUNT_DOLLARS.toFixed(2)}`);
    if (amount_dollars > MAX_AMOUNT_DOLLARS) throw new Error(`Maximum funding amount is $${MAX_AMOUNT_DOLLARS.toFixed(2)}`);

    // ── Load location & funding source ───────────────────────────────────────
    const { data: loc, error: locErr } = await admin
      .from('locations')
      .select('id, name, zumrails_funding_source_id')
      .eq('id', location_id)
      .single();
    if (locErr || !loc) throw new Error(`Location not found: ${locErr?.message ?? 'no row'}`);
    console.log('[fund-wallet] location:', loc.name, '| funding_source_id:', loc.zumrails_funding_source_id ?? 'NOT LINKED');

    if (!loc.zumrails_funding_source_id) {
      throw new Error('Restaurant bank account not linked. Please link a bank account in Settings → Funding first.');
    }

    // ── Fund the wallet ──────────────────────────────────────────────────────
    // zumrails_funding_source_id IS the Zum Rails userId (created by Zum Connect).
    // AccountsReceivable takes UserId directly — no separate FundingSource lookup needed.
    console.log('[fund-wallet] calling fundWallet — amount:', amount_dollars, '| userId:', loc.zumrails_funding_source_id);
    const transactionId = await fundWallet({
      userId: loc.zumrails_funding_source_id,
      amountDollars: amount_dollars,
      memo: 'Wallet-Top-Up',
    });

    // ── Fetch updated balance ────────────────────────────────────────────────
    let newBalance: number | null = null;
    try {
      const { balance } = await getWalletBalance();
      newBalance = balance;
    } catch (balErr: unknown) {
      // Non-fatal — we already succeeded
      console.warn('[fund-wallet] could not fetch balance after funding:', balErr instanceof Error ? balErr.message : String(balErr));
    }

    console.log('[fund-wallet] SUCCESS — transaction_id:', transactionId, '| new_balance:', newBalance, '| elapsed:', Date.now() - startedAt, 'ms');
    return respond({
      success: true,
      transaction_id: transactionId,
      amount_dollars,
      wallet_balance: newBalance,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? '') : '';
    console.error('[fund-wallet] FATAL:', message);
    console.error('[fund-wallet] stack:', stack);
    console.error('[fund-wallet] elapsed at failure:', Date.now() - startedAt, 'ms');
    return respond({ error: message, stack: stack.split('\n').slice(0, 5) }, 400);
  }
});
