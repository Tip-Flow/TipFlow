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

  try {
    const {
      staff_member_id,
      amount_cents,
      location_id,
      tip_allocation_id,
      payout_request_id,
    } = await req.json();

    if (!staff_member_id || !amount_cents || !location_id) {
      throw new Error('staff_member_id, amount_cents, and location_id are required');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) throw new Error('Unauthorized');

    // Caller must be the staff member themselves, a manager, or a Mise admin
    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    let authorised = isAdmin;

    if (!authorised) {
      const { data: staffRecord } = await admin
        .from('staff_members')
        .select('email')
        .eq('id', staff_member_id)
        .maybeSingle();
      if (staffRecord?.email === user.email) authorised = true;
    }

    if (!authorised) {
      const { data: mgr } = await admin
        .from('managers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();
      if (mgr) authorised = true;
    }

    if (!authorised) throw new Error('Unauthorized');

    // Load staff member — get or create Zum Rails user
    const { data: staff, error: staffErr } = await admin
      .from('staff_members')
      .select('id, name, email, zumrails_user_id')
      .eq('id', staff_member_id)
      .single();
    if (staffErr || !staff) throw new Error(`Staff member not found: ${staffErr?.message ?? 'unknown'}`);

    let zumUserId: string = staff.zumrails_user_id ?? '';
    if (!zumUserId) {
      const parts = staff.name.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
      zumUserId = await createUser({ firstName, lastName, email: staff.email });
      await admin
        .from('staff_members')
        .update({ zumrails_user_id: zumUserId })
        .eq('id', staff_member_id);
    }

    const netAmountCents = amount_cents - EFT_FEE_CENTS;
    if (netAmountCents <= 0) throw new Error('Amount is too small to cover the $0.99 processing fee');

    // Create Zum Rails transaction
    const zumTransactionId = await createTransaction({
      userId: zumUserId,
      amountCents: netAmountCents,
      memo: 'Mise tip payout',
    });

    const eftRef = `ZR-${zumTransactionId}`;
    const now = new Date().toISOString();

    if (tip_allocation_id) {
      // Manager paying a specific shift allocation
      const { error } = await admin
        .from('tip_allocations')
        .update({ eft_ref: eftRef, paid_at: now })
        .eq('id', tip_allocation_id);
      if (error) console.error('[process-eft-payout] tip_allocation update error:', error.message);
    } else if (payout_request_id) {
      // Manager processing a pending staff request
      const { error } = await admin
        .from('payout_requests')
        .update({ status: 'processed', processed_at: now, zumrails_transaction_id: zumTransactionId })
        .eq('id', payout_request_id);
      if (error) console.error('[process-eft-payout] payout_request update error:', error.message);
    } else {
      // Staff self-payout: mark all unpaid allocations as paid and record the request
      await admin
        .from('tip_allocations')
        .update({ eft_ref: eftRef, paid_at: now })
        .eq('staff_id', staff_member_id)
        .is('paid_at', null);

      await admin
        .from('payout_requests')
        .insert({
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
    }

    console.log('[process-eft-payout] success — transaction:', zumTransactionId, 'staff:', staff_member_id, 'net_cents:', netAmountCents);

    return new Response(
      JSON.stringify({
        success: true,
        zumrails_transaction_id: zumTransactionId,
        eft_ref: eftRef,
        net_amount_cents: netAmountCents,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[process-eft-payout] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
