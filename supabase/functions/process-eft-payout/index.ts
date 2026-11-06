import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createUser, createTransaction } from '../_shared/zumrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EFT_FEE_CENTS = 99;
const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];
const MAX_PAYOUT_CENTS = Number(Deno.env.get('MAX_PAYOUT_CENTS') ?? '100000');
const IS_SANDBOX = Deno.env.get('ZUMRAILS_ENV') === 'sandbox';

type State = 'open' | 'done' | 'busy';

interface Target {
  kind: 'request' | 'allocation';
  id: string;
  staffId: string;
  locationId: string;
  amountCents: number;
  state: State;
  doneTransactionId: string;
  doneNetCents: number;
  claim: () => Promise<boolean>;
  release: () => Promise<void>;
  finalize: (transactionId: string, netCents: number) => Promise<boolean>;
}

// deno-lint-ignore no-explicit-any
async function loadRequestTarget(admin: any, id: string): Promise<Target> {
  const { data: r, error } = await admin
    .from('payout_requests')
    .select('id, staff_id, location_id, amount, net_amount, status, zumrails_transaction_id')
    .eq('id', id)
    .single();
  if (error || !r) throw new Error('Payout request not found');
  return {
    kind: 'request',
    id,
    staffId: r.staff_id,
    locationId: r.location_id,
    amountCents: Number(r.amount),
    state: r.status === 'pending' ? 'open' : r.status === 'processed' ? 'done' : 'busy',
    doneTransactionId: String(r.zumrails_transaction_id ?? ''),
    doneNetCents: Number(r.net_amount),
    claim: async () => {
      const { data } = await admin.from('payout_requests')
        .update({ status: 'processing' })
        .eq('id', id).eq('status', 'pending')
        .select('id').maybeSingle();
      return !!data;
    },
    release: async () => {
      await admin.from('payout_requests')
        .update({ status: 'pending' })
        .eq('id', id).eq('status', 'processing');
    },
    finalize: async (transactionId, netCents) => {
      const { data } = await admin.from('payout_requests')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          zumrails_transaction_id: transactionId,
          fee: EFT_FEE_CENTS,
          net_amount: netCents,
        })
        .eq('id', id).eq('status', 'processing')
        .select('id').maybeSingle();
      return !!data;
    },
  };
}

// deno-lint-ignore no-explicit-any
async function loadAllocationTarget(admin: any, id: string): Promise<Target> {
  const { data: a, error } = await admin
    .from('tip_allocations')
    .select('id, staff_id, shift_id, calculated_amount, eft_ref, paid_at')
    .eq('id', id)
    .single();
  if (error || !a) throw new Error('Tip allocation not found');
  const { data: shift } = await admin
    .from('shifts').select('location_id').eq('id', a.shift_id).single();
  if (!shift) throw new Error('Shift not found for this allocation');

  const claimToken = `claiming-${crypto.randomUUID()}`;
  const amountCents = Math.round(Number(a.calculated_amount));
  const doneRef = String(a.eft_ref ?? '');
  return {
    kind: 'allocation',
    id,
    staffId: a.staff_id,
    locationId: shift.location_id,
    amountCents,
    state: a.paid_at ? 'done' : a.eft_ref ? 'busy' : 'open',
    doneTransactionId: doneRef.replace(/^ZR-/, ''),
    doneNetCents: amountCents - EFT_FEE_CENTS,
    claim: async () => {
      const { data } = await admin.from('tip_allocations')
        .update({ eft_ref: claimToken })
        .eq('id', id).is('paid_at', null).is('eft_ref', null)
        .select('id').maybeSingle();
      return !!data;
    },
    release: async () => {
      await admin.from('tip_allocations')
        .update({ eft_ref: null })
        .eq('id', id).eq('eft_ref', claimToken);
    },
    finalize: async (transactionId) => {
      const { data } = await admin.from('tip_allocations')
        .update({ eft_ref: `ZR-${transactionId}`, paid_at: new Date().toISOString() })
        .eq('id', id).eq('eft_ref', claimToken)
        .select('id').maybeSingle();
      return !!data;
    },
  };
}

// deno-lint-ignore no-explicit-any
async function mayActOnLocation(admin: any, user: { id: string; email?: string }, locationId: string): Promise<boolean> {
  if (ADMIN_EMAILS.includes(user.email ?? '')) return true;
  const { data: loc } = await admin.from('locations').select('organisation_id').eq('id', locationId).maybeSingle();
  let { data: mgrs } = await admin.from('managers').select('location_id, organisation_id').eq('auth_user_id', user.id);
  if ((!mgrs || mgrs.length === 0) && user.email) {
    ({ data: mgrs } = await admin.from('managers').select('location_id, organisation_id').eq('email', user.email));
  }
  // deno-lint-ignore no-explicit-any
  return (mgrs ?? []).some((m: any) =>
    m.location_id === locationId || (m.organisation_id && loc?.organisation_id === m.organisation_id));
}

// True only when we know no transfer was created (safe to release the claim).
function isDefiniteRejection(err: unknown): boolean {
  const m = err instanceof Error ? err.message : '';
  if (/Zum Rails (authorize|getWallet) failed \(\d{3}\)/.test(m)) return true;
  const t = m.match(/Zum Rails createTransaction failed \((\d{3})\)/);
  return !!t && t[1].startsWith('4');
}

async function withRetry(fn: () => Promise<boolean>, tries = 3): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try { if (await fn()) return true; } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new Error('Invalid JSON body'); }

    const payoutRequestId = typeof body.payout_request_id === 'string' ? body.payout_request_id : null;
    const tipAllocationId = typeof body.tip_allocation_id === 'string' ? body.tip_allocation_id : null;
    const claimedStaffId = typeof body.staff_member_id === 'string' ? body.staff_member_id : null;
    if ((payoutRequestId ? 1 : 0) + (tipAllocationId ? 1 : 0) !== 1) {
      throw new Error('Exactly one of payout_request_id or tip_allocation_id is required');
    }

    // Who is calling
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');
    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) throw new Error('Unauthorized');

    // What is being paid (amount and location come from the database, never the request body)
    const target = payoutRequestId
      ? await loadRequestTarget(admin, payoutRequestId)
      : await loadAllocationTarget(admin, tipAllocationId as string);
    console.log('[eft] start —', target.kind, target.id, '| state:', target.state);

    if (!(await mayActOnLocation(admin, user, target.locationId))) {
      throw new Error('Unauthorized — not a manager for this location');
    }
    if (claimedStaffId && claimedStaffId !== target.staffId) {
      throw new Error('Staff member does not match this payout');
    }

    // Safe repeat: already paid means success, no second payment
    if (target.state === 'done') {
      console.log('[eft] already processed —', target.kind, target.id);
      return respond({
        success: true,
        already_processed: true,
        zumrails_transaction_id: target.doneTransactionId,
        eft_ref: `ZR-${target.doneTransactionId}`,
        net_amount_cents: target.doneNetCents,
      });
    }
    if (target.state === 'busy') {
      throw new Error('This payout is already in progress or needs review. Check Zum Rails before retrying.');
    }

    if (!Number.isInteger(target.amountCents) || target.amountCents <= 0) throw new Error('Invalid payout amount');
    if (target.amountCents > MAX_PAYOUT_CENTS) throw new Error('Payout exceeds the configured maximum');
    const netCents = target.amountCents - EFT_FEE_CENTS;
    if (netCents <= 0) throw new Error('Amount too small to cover the $0.99 fee');

    const { data: staff } = await admin
      .from('staff_members')
      .select('id, name, email, location_id, zumrails_user_id')
      .eq('id', target.staffId).single();
    if (!staff) throw new Error('Staff member not found');
    if (staff.location_id !== target.locationId) throw new Error('Staff member is not at this location');

    // Claim: only one caller can win this
    if (!(await target.claim())) {
      throw new Error('This payout was just claimed by another request. Refresh and check its status.');
    }

    // Zum Rails user (no money moves here, so any failure releases the claim)
    let zumUserId: string = staff.zumrails_user_id ?? '';
    try {
      if (!zumUserId) {
        if (!IS_SANDBOX) throw new Error('This staff member has not linked a bank account yet.');
        const parts = String(staff.name).trim().split(' ');
        const firstName = parts[0];
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
        zumUserId = await createUser({
          firstName,
          lastName,
          email: staff.email as string,
          institutionNumber: '003',
          transitNumber: '00002',
          accountNumber: '3456789',
        });
        await admin.from('staff_members').update({ zumrails_user_id: zumUserId })
          .eq('id', staff.id).is('zumrails_user_id', null);
      }
    } catch (e) {
      await target.release();
      throw e;
    }

    // The transfer
    let transactionId: string;
    try {
      transactionId = await createTransaction({
        userId: zumUserId,
        amountCents: netCents,
        memo: 'Mise tip payout',
        comment: `Mise payout ${target.id}`,
      });
    } catch (e) {
      if (isDefiniteRejection(e)) {
        await target.release();
        throw e;
      }
      console.error('[eft] AMBIGUOUS — left as processing:', target.kind, target.id);
      throw new Error('Zum Rails did not confirm this payout. It is left as "processing". Check Zum Rails before retrying.');
    }

    // Record it
    const saved = await withRetry(() => target.finalize(transactionId, netCents));
    if (!saved) {
      console.error('[eft] PAID BUT NOT RECORDED —', target.kind, target.id, '| zum:', transactionId);
      throw new Error(`Money was sent (Zum Rails ${transactionId}) but could not be recorded. Do not retry; contact support.`);
    }

    console.log('[eft] SUCCESS —', target.kind, target.id, '| zum:', transactionId);
    return respond({
      success: true,
      zumrails_transaction_id: transactionId,
      eft_ref: `ZR-${transactionId}`,
      net_amount_cents: netCents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[eft] FATAL:', message.slice(0, 300));
    return respond({ error: message.slice(0, 300) }, 400);
  }
});