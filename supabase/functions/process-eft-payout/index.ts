import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createUser, createTransaction } from '../_shared/zumrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EFT_FEE_CENTS = 99;
const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  console.log('[eft] START', new Date().toISOString());

  const hasZumUser = !!Deno.env.get('ZUMRAILS_USERNAME');
  const hasZumPass = !!Deno.env.get('ZUMRAILS_PASSWORD');
  console.log('[eft] secrets — ZUMRAILS_USERNAME:', hasZumUser, '| ZUMRAILS_PASSWORD:', hasZumPass);

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Parse body ─────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new Error('Invalid JSON body');
    }

    const { staff_member_id, amount_cents, location_id, tip_allocation_id, payout_request_id } =
      body as Record<string, string | number | undefined>;

    console.log('[eft] body — staff_member_id:', staff_member_id ?? 'MISSING',
      '| amount_cents:', amount_cents ?? 'MISSING', '| location_id:', location_id ?? 'MISSING',
      '| tip_allocation_id:', tip_allocation_id ?? 'none', '| payout_request_id:', payout_request_id ?? 'none');

    if (!staff_member_id || !amount_cents || !location_id) {
      throw new Error('staff_member_id, amount_cents, and location_id are required');
    }

    // ── Supabase admin client ───────────────────────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Caller auth ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized — no Authorization header');
    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) throw new Error(`Unauthorized — ${authErr?.message ?? 'no user'}`);
    console.log('[eft] caller:', user.email);

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    let authorised = isAdmin;
    if (!authorised) {
      const { data: sm } = await admin.from('staff_members').select('email').eq('id', staff_member_id).maybeSingle();
      if (sm?.email === user.email) authorised = true;
    }
    if (!authorised) {
      const { data: mgr } = await admin.from('managers').select('id').eq('email', user.email).maybeSingle();
      if (mgr) authorised = true;
    }
    if (!authorised) throw new Error('Unauthorized — caller is not staff, manager, or admin');

    // ── Load staff member ───────────────────────────────────────────────────
    console.log('[eft] loading staff member:', staff_member_id);
    const { data: staff, error: staffErr } = await admin
      .from('staff_members').select('id, name, email, zumrails_user_id')
      .eq('id', staff_member_id).single();
    if (staffErr || !staff) throw new Error(`Staff not found: ${staffErr?.message ?? 'no row'}`);
    console.log('[eft] staff:', staff.name, '| email:', staff.email, '| zumrails_user_id:', staff.zumrails_user_id ?? 'none');

    // ── Get or create Zum Rails user ────────────────────────────────────────
    let zumUserId: string = staff.zumrails_user_id ?? '';
    if (!zumUserId) {
      const parts = (staff.name as string).trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
      console.log('[eft] calling createUser — firstName:', firstName, '| lastName:', lastName);
      zumUserId = await createUser({ firstName, lastName, email: staff.email as string });
      console.log('[eft] Zum Rails user id:', zumUserId);
      await admin.from('staff_members').update({ zumrails_user_id: zumUserId }).eq('id', staff_member_id);
    } else {
      console.log('[eft] reusing Zum Rails user:', zumUserId);
    }

    // ── Create transaction ──────────────────────────────────────────────────
    const netAmountCents = (amount_cents as number) - EFT_FEE_CENTS;
    if (netAmountCents <= 0) throw new Error('Amount too small to cover $0.99 fee');
    console.log('[eft] creating transaction — net cents:', netAmountCents);
    const zumTransactionId = await createTransaction({ userId: zumUserId, amountCents: netAmountCents, memo: 'Mise tip payout' });
    console.log('[eft] transaction id:', zumTransactionId);

    const eftRef = `ZR-${zumTransactionId}`;
    const now = new Date().toISOString();

    // ── Update DB ───────────────────────────────────────────────────────────
    if (tip_allocation_id) {
      const { error } = await admin.from('tip_allocations')
        .update({ eft_ref: eftRef, paid_at: now }).eq('id', tip_allocation_id);
      if (error) console.error('[eft] tip_allocation update error:', error.message);
    } else if (payout_request_id) {
      const { error } = await admin.from('payout_requests')
        .update({ status: 'processed', processed_at: now, zumrails_transaction_id: zumTransactionId })
        .eq('id', payout_request_id);
      if (error) console.error('[eft] payout_request update error:', error.message);
    } else {
      await admin.from('tip_allocations').update({ eft_ref: eftRef, paid_at: now })
        .eq('staff_id', staff_member_id).is('paid_at', null);
      await admin.from('payout_requests').insert({
        staff_id: staff_member_id, location_id, amount: amount_cents,
        fee: EFT_FEE_CENTS, net_amount: netAmountCents,
        status: 'processed', requested_at: now, processed_at: now,
        zumrails_transaction_id: zumTransactionId,
      });
    }

    console.log('[eft] SUCCESS elapsed:', Date.now() - startedAt, 'ms');
    return respond({ success: true, zumrails_transaction_id: zumTransactionId, eft_ref: eftRef, net_amount_cents: netAmountCents });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? (err.stack ?? '') : '';
    console.error('[eft] FATAL:', message);
    console.error('[eft] stack:', stack);
    console.error('[eft] elapsed at failure:', Date.now() - startedAt, 'ms');
    return respond({ error: message, stack: stack.split('\n').slice(0, 5) }, 400);
  }
});
