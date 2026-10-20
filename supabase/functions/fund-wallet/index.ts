import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fundWallet, getWalletBalance } from '../_shared/zumrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const MIN_CENTS = 100;        // $1.00
const MAX_CENTS = 5_000_000;  // $50,000.00
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  let fundingId: string | null = null;

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Parse body ───────────────────────────────────────────────────────────
    let body: {
      location_id?: unknown;
      amount_dollars?: unknown;
      balance_only?: unknown;
      idempotency_key?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const locationId = typeof body.location_id === 'string' ? body.location_id : null;
    const balanceOnly = body.balance_only === true;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new HttpError(401, 'Unauthorized');

    if (!locationId || !UUID_RE.test(locationId)) {
      throw new HttpError(400, 'location_id is required');
    }

    // Managers must be assigned to THIS location. No location = no access.
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

    // ── Balance-only mode ────────────────────────────────────────────────────
    if (balanceOnly) {
      const { balance } = await getWalletBalance();
      return respond({ wallet_balance: balance });
    }

    // ── Validate amount (work in whole cents) ────────────────────────────────
    const amountDollars = body.amount_dollars;
    if (typeof amountDollars !== 'number' || !Number.isFinite(amountDollars)) {
      throw new HttpError(400, 'Amount must be a number');
    }
    const amountCents = Math.round(amountDollars * 100);
    if (Math.abs(amountDollars * 100 - amountCents) > 1e-6) {
      throw new HttpError(400, 'Amount can have at most 2 decimal places');
    }
    if (amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      throw new HttpError(400, 'Amount must be between $1.00 and $50,000.00');
    }

    const idempotencyKey = body.idempotency_key;
    if (typeof idempotencyKey !== 'string' || !UUID_RE.test(idempotencyKey)) {
      throw new HttpError(400, 'idempotency_key is required');
    }

    // ── Has this exact request been seen before? ─────────────────────────────
    const priorResult = async (): Promise<Response | null> => {
      const { data: existing, error } = await admin
        .from('wallet_fundings')
        .select('id, location_id, amount_cents, status, zumrails_transaction_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(`funding lookup failed: ${error.message}`);
      if (!existing) return null;
      if (existing.location_id !== locationId || existing.amount_cents !== amountCents) {
        throw new HttpError(409, 'This request key was already used for a different top-up');
      }
      if (existing.status === 'processed') {
        return respond({
          success: true,
          already_processed: true,
          funding_id: existing.id,
          transaction_id: existing.zumrails_transaction_id,
          amount_dollars: existing.amount_cents / 100,
        });
      }
      if (existing.status === 'processing') {
        throw new HttpError(409, 'This top-up is already in progress');
      }
      if (existing.status === 'needs_review') {
        throw new HttpError(409, 'This top-up needs review before trying again');
      }
      throw new HttpError(409, 'This top-up failed. Start a new top-up to try again.');
    };

    const prior = await priorResult();
    if (prior) return prior;

    // ── Load location & funding source ───────────────────────────────────────
    const { data: loc, error: locErr } = await admin
      .from('locations')
      .select('id, zumrails_funding_source_id')
      .eq('id', locationId)
      .maybeSingle();
    if (locErr) throw new Error(`location lookup failed: ${locErr.message}`);
    if (!loc) throw new HttpError(404, 'Location not found');
    if (!loc.zumrails_funding_source_id) {
      throw new HttpError(400, 'Restaurant bank account not linked. Please link a bank account in Settings → Funding first.');
    }

    // ── Claim: record the top-up BEFORE any money moves ──────────────────────
    const { data: claimed, error: claimErr } = await admin
      .from('wallet_fundings')
      .insert({
        idempotency_key: idempotencyKey,
        location_id: locationId,
        amount_cents: amountCents,
        requested_by: user.id,
        status: 'processing',
      })
      .select('id')
      .single();
    if (claimErr) {
      if (claimErr.code === '23505') {
        const again = await priorResult();
        if (again) return again;
        throw new HttpError(409, 'Another top-up for this location is in progress or needs review. Please wait, or check the Zum Rails report.');
      }
      throw new Error(`claim failed: ${claimErr.message}`);
    }
    fundingId = claimed.id;
    console.log('[fund-wallet] claimed', fundingId, '| location', locationId, '| cents', amountCents);

    // ── Send to Zum Rails ────────────────────────────────────────────────────
    let transactionId: string | null = null;
    try {
      const result = await fundWallet({
        userId: loc.zumrails_funding_source_id,
        amountDollars: amountCents / 100,
        memo: 'Wallet-Top-Up',
      });
      transactionId = result ? String(result) : null;
    } catch (zrErr: unknown) {
      // We can't be sure whether money moved, so flag it rather than mark failed.
      const msg = zrErr instanceof Error ? zrErr.message : String(zrErr);
      await admin
        .from('wallet_fundings')
        .update({ status: 'needs_review', error_message: msg.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', fundingId);
      console.error('[fund-wallet] Zum Rails call failed — funding', fundingId, 'marked needs_review');
      throw new HttpError(502, "We couldn't confirm this top-up with Zum Rails. It has been flagged for review. Please don't retry until it's checked.");
    }

    const { error: updErr } = await admin
      .from('wallet_fundings')
      .update({ status: 'processed', zumrails_transaction_id: transactionId, updated_at: new Date().toISOString() })
      .eq('id', fundingId);
    if (updErr) {
      console.error('[fund-wallet] CRITICAL: funding', fundingId, 'sent to Zum Rails but status update failed:', updErr.message);
    }

    // ── Fetch updated balance (non-fatal) ────────────────────────────────────
    let newBalance: number | null = null;
    try {
      const { balance } = await getWalletBalance();
      newBalance = balance;
    } catch {
      console.warn('[fund-wallet] could not fetch balance after funding', fundingId);
    }

    console.log('[fund-wallet] processed', fundingId, '| tx', transactionId, '| elapsed', Date.now() - startedAt, 'ms');
    return respond({
      success: true,
      funding_id: fundingId,
      transaction_id: transactionId,
      amount_dollars: amountCents / 100,
      wallet_balance: newBalance,
    });

  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong. Please try again.';
    console.error('[fund-wallet] error', status, '| funding', fundingId ?? 'none', '|', err instanceof Error ? err.message : String(err));
    return respond({ error: message }, status);
  }
});