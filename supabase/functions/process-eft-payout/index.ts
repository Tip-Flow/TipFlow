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

  // Log secret availability (never log values)
  const hasZumUser = !!(Deno.env.get('ZUMRAILS_USERNAME'));
  const hasZumPass = !!(Deno.env.get('ZUMRAILS_PASSWORD'));
  const hasSupaUrl  = !!(Deno.env.get('SUPABASE_URL'));
  const hasSupaSvc  = !!(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  console.log('[eft] secrets — ZUMRAILS_USERNAME:', hasZumUser, '| ZUMRAILS_PASSWORD:', hasZumPass,
    '| SUPABASE_URL:', hasSupaUrl, '| SERVICE_ROLE_KEY:', hasSupaSvc);

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[eft] body parse error:', parseErr);
      throw new Error('Invalid JSON body');
    }

    const {
      staff_member_id,
      amount_cents,
      location_id,
      tip_allocation_id,
      payout_request_id,
    } = body as {
      staff_member_id?: string;
      amount_cents?: number;
      location_id?: string;
      tip_allocation_id?: string;
      payout_request_id?: string;
    };

    console.log('[eft] body — staff_member_id:', staff_member_id ?? 'MISSING',
      '| amount_cents:', amount_cents ?? 'MISSING',
      '| location_id:', location_id ?? 'MISSING',
      '| tip_allocation_id:', tip_allocation_id ?? 'none',
      '| payout_request_id:', payout_request_id ?? 'none');

    if (!staff_member_id || !amount_cents || !location_id) {
      throw new Error('staff_member_id, amount_cents, and location_id are required');
    }

    // ── Supabase admin client ─────────────────────────────────────────────────
    console.log('[eft] creating supabase admin client');
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth check ────────────────────────────────────────────────────────────
    console.log('[eft] verifying caller auth');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized — no Authorization header');
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) throw new Error(`Unauthorized — ${authErr?.message ?? 'no user'}`);
    console.log('[eft] caller:', user.email);

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    let authorised = isAdmin;

    if (!authorised) {
      const { data: staffRecord } = await admin
        .from('staff_members').select('email').eq('id', staff_member_id).maybeSingle();
      if (staffRecord?.email === user.email) authorised = true;
    }

    if (!authorised) {
      const { data: mgr } = await admin
        .from('managers').select('id').eq('email', user.email).maybeSingle();
      if (mgr) authorised = true;
    }

    if (!authorised) throw new Error('Unauthorized — caller is not staff, manager, or admin');

    // ── Load staff member ─────────────────────────────────────────────────────
    console.log('[eft] loading staff member:', staff_member_id);
    const { data: staff, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name, email, zumrails_user_id')
      .eq('id', staff_member_id)
      .single();
    if (staffErr || !staff) throw new Error(`Staff member not found: ${staffErr?.message ?? 'no row'}`);
    console.log('[eft] staff:', staff.name, '| email:', staff.email, '| existing zumrails_user_id:', staff.zumrails_user_id ?? 'none');

    // ── Get or create Zum Rails user ──────────────────────────────────────────
    let zumUserId: string = staff.zumrails_user_id ?? '';
    if (!zumUserId) {
      const parts = staff.name.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
      console.log('[eft] creating Zum Rails user — firstName:', firstName, '| lastName:', lastName);
      zumUserId = await createUser({ firstName, lastName, email: staff.email });
      console.log('[eft] Zum Rails user created:', zumUserId);
      const { error: updateErr } = await admin
        .from('staff_members').update({ zumrails_user_id: zumUserId }).eq('id', staff_member_id);
      if (updateErr) console.warn('[eft] zumrails_user_id update error (non-fatal):', updateErr.message);
    } else {
      console.log('[eft] reusing existing Zum Rails user:', zumUserId);
    }

    // ── Calculate net amount ──────────────────────────────────────────────────
    const netAmountCents = amount_cents - EFT_FEE_CENTS;
    console.log('[eft] gross:', amount_cents, '| fee:', EFT_FEE_CENTS, '| net:', netAmountCents);
    if (netAmountCents <= 0) throw new Error('Amount is too small to cover the $0.99 processing fee');

    // ── Create Zum Rails transaction ──────────────────────────────────────────
    console.log('[eft] creating Zum Rails transaction — userId:', zumUserId, '| netCents:', netAmountCents);
    const zumTransactionId = await createTransaction({
      userId: zumUserId,
      amountCents: netAmountCents,
      memo: 'Mise tip payout',
    });
    console.log('[eft] Zum Rails transaction created:', zumTransactionId);

    const eftRef = `ZR-${zumTransactionId}`;
    const now = new Date().toISOString();

    // ── Update DB record ──────────────────────────────────────────────────────
    if (tip_allocation_id) {
      console.log('[eft] updating tip_allocation:', tip_allocation_id);
      const { error } = await admin
        .from('tip_allocations').update({ eft_ref: eftRef, paid_at: now }).eq('id', tip_allocation_id);
      if (error) console.error('[eft] tip_allocation update error:', error.message);
    } else if (payout_request_id) {
      console.log('[eft] updating payout_request:', payout_request_id);
      const { error } = await admin
        .from('payout_requests')
        .update({ status: 'processed', processed_at: now, zumrails_transaction_id: zumTransactionId })
        .eq('id', payout_request_id);
      if (error) console.error('[eft] payout_request update error:', error.message);
    } else {
      console.log('[eft] staff self-payout — marking all unpaid allocations for staff:', staff_member_id);
      const { error: allocErr } = await admin
        .from('tip_allocations').update({ eft_ref: eftRef, paid_at: now })
        .eq('staff_id', staff_member_id).is('paid_at', null);
      if (allocErr) console.error('[eft] tip_allocations bulk update error:', allocErr.message);

      const { error: reqErr } = await admin.from('payout_requests').insert({
        staff_id: staff_member_id,
        location_id,
        amount: amount_cents,
        fee: EFT_FEE_CENTS,
        net_amount: netAmountCents,
        status: 'processed',
        requested_at: now,
        processed_at: now,
        zumrails_transaction_id: zumTransactionId,
      });
      if (reqErr) console.error('[eft] payout_request insert error:', reqErr.message);
    }

    console.log('[eft] SUCCESS — transaction:', zumTransactionId, '| staff:', staff_member_id,
      '| net_cents:', netAmountCents, '| elapsed:', Date.now() - startedAt, 'ms');

    return new Response(
      JSON.stringify({ success: true, zumrails_transaction_id: zumTransactionId, eft_ref: eftRef, net_amount_cents: netAmountCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? (err.stack ?? 'no stack') : 'no stack';
    console.error('[eft] FATAL error:', message);
    console.error('[eft] stack:', stack);
    console.error('[eft] elapsed at failure:', Date.now() - startedAt, 'ms');
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
