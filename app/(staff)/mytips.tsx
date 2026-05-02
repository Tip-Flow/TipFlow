import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';
import { getDailyQuote, Quote } from '../../lib/quotes';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const GREEN = '#22c55e';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const MUTED = '#6b7a74';
const LABEL = '#9db8ad';
const BORDER = '#1e3028';
const WHITE = '#e8f0ec';
const RED = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.12)';

const EFT_FEE_CENTS = 99; // $0.99

type Tab = 'history' | 'eft';

type Payout = {
  id: string;
  amount: number;
  paidAt: string;
  shiftName: string;
  eftRef: string | null;
};

type HeroData = {
  staffId: string;
  staffName: string;
  locationName: string;
  locationId: string;
  totalCents: number;
  shiftCount: number;
  payoutMethod: string | null;
  bankLinked: boolean;
};

type PayoutRequest = {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: string;
  requestedAt: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function centsToStr(cents: number): string {
  return (cents / 100).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MyTipsScreen() {
  const [staffQuote, setStaffQuote] = useState<Quote | null>(null);
  const [hero, setHero] = useState<HeroData | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [unpaidCents, setUnpaidCents] = useState(0);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('history');

  // EFT modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  useEffect(() => {
    getDailyQuote('staff').then(setStaffQuote);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: member } = await supabase
        .from('staff_members')
        .select('id, name, payout_method, bank_linked, location_id, locations(name, id)')
        .eq('email', user.email ?? '')
        .maybeSingle();

      if (!member) { setLoading(false); return; }

      const [paidRes, unpaidRes, requestsRes] = await Promise.all([
        supabase
          .from('tip_allocations')
          .select('id, calculated_amount, paid_at, aptpay_ref, shifts(name, date)')
          .eq('staff_id', member.id)
          .not('paid_at', 'is', null)
          .order('paid_at', { ascending: false })
          .limit(20),
        supabase
          .from('tip_allocations')
          .select('calculated_amount')
          .eq('staff_id', member.id)
          .is('paid_at', null),
        supabase
          .from('payout_requests')
          .select('id, amount, fee, net_amount, status, requested_at')
          .eq('staff_id', member.id)
          .order('requested_at', { ascending: false })
          .limit(10),
      ]);

      const allocs = paidRes.data ?? [];
      const totalCents = allocs.reduce((sum, a) => sum + (a.calculated_amount ?? 0), 0);
      const unpaid = (unpaidRes.data ?? []).reduce((sum, a) => sum + (a.calculated_amount ?? 0), 0);

      const loc = member.locations as any;
      setHero({
        staffId: member.id,
        staffName: member.name,
        locationName: loc?.name ?? 'Your Location',
        locationId: loc?.id ?? '',
        totalCents,
        shiftCount: allocs.length,
        payoutMethod: member.payout_method,
        bankLinked: member.bank_linked ?? false,
      });

      setUnpaidCents(unpaid);

      setPayouts(
        allocs.map(a => ({
          id: a.id,
          amount: a.calculated_amount ?? 0,
          paidAt: a.paid_at ?? '',
          shiftName: (a.shifts as any)?.name ?? 'Shift',
          eftRef: a.aptpay_ref,
        }))
      );

      setPayoutRequests(
        (requestsRes.data ?? []).map(r => ({
          id: r.id,
          amount: r.amount,
          fee: r.fee,
          netAmount: r.net_amount,
          status: r.status,
          requestedAt: r.requested_at,
        }))
      );
    } catch (err) {
      console.log('[MyTips] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useWebFocus(loadData);

  async function handleConfirmEFT() {
    if (!hero) return;
    setSubmitting(true);
    try {
      const netAmount = unpaidCents - EFT_FEE_CENTS;
      const { error } = await supabase.from('payout_requests').insert({
        staff_id: hero.staffId,
        location_id: hero.locationId,
        amount: unpaidCents,
        fee: EFT_FEE_CENTS,
        net_amount: netAmount,
        status: 'pending',
        requested_at: new Date().toISOString(),
      });
      if (error) throw error;
      setConfirmVisible(false);
      setSuccessVisible(true);
      loadData();
    } catch (err: unknown) {
      Alert.alert('Request failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function payoutMethodLabel(method: string | null): string {
    if (method === 'etransfer') return '📱 Interac e-Transfer';
    if (method === 'eft') return '🏦 EFT';
    if (method === 'cash') return '💵 Cash';
    return '📱 Interac e-Transfer';
  }

  const netAmount = unpaidCents - EFT_FEE_CENTS;
  const canRequest = unpaidCents > EFT_FEE_CENTS;

  const hasPendingRequest = payoutRequests.some(r => r.status === 'pending');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.screenTitle}>My Tips</Text>

        {/* Daily Intention Card */}
        <View style={styles.intentionCard}>
          <Text style={styles.intentionLabel}>TODAY'S INTENTION</Text>
          <Text style={styles.intentionText}>{staffQuote?.text ?? ''}</Text>
          {staffQuote?.author ? (
            <Text style={styles.intentionAuthor}>— {staffQuote.author}</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : hero ? (
          <>
            {/* Hero Card */}
            <View style={styles.heroCard}>
              <Text style={styles.heroSubtitle}>
                {hero.staffName} · {hero.locationName}
              </Text>
              <Text style={styles.heroAmount}>
                ${centsToStr(hero.totalCents)}
              </Text>
              <Text style={styles.heroMeta}>
                CAD earned · {hero.shiftCount} shift{hero.shiftCount !== 1 ? 's' : ''} paid
              </Text>

              <View style={styles.divider} />

              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>{payoutMethodLabel(hero.payoutMethod)}</Text>
                <View style={styles.instantBadge}>
                  <Text style={styles.instantText}>Instant · 24/7</Text>
                </View>
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, activeTab === 'history' && styles.tabActive]}
                onPress={() => setActiveTab('history')}>
                <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                  Payout History
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'eft' && styles.tabActive]}
                onPress={() => setActiveTab('eft')}>
                <Text style={[styles.tabText, activeTab === 'eft' && styles.tabTextActive]}>
                  EFT Payout
                </Text>
                {unpaidCents > 0 && (
                  <View style={styles.tabDot} />
                )}
              </Pressable>
            </View>

            {/* History Tab */}
            {activeTab === 'history' && (
              <>
                {payouts.length > 0 ? (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>Recent Payouts</Text>
                    </View>
                    {payouts.slice(0, 10).map((p, i) => (
                      <View
                        key={p.id}
                        style={[styles.payoutItem, i < Math.min(payouts.length, 10) - 1 && styles.payoutItemBorder]}>
                        <View style={styles.payoutLeft}>
                          <Text style={styles.payoutAmount}>
                            ${centsToStr(p.amount)}
                          </Text>
                          <Text style={styles.payoutDate}>
                            {formatDate(p.paidAt)} · {p.shiftName}
                          </Text>
                        </View>
                        <View style={styles.payoutRight}>
                          <Text style={styles.payoutStatus}>Paid</Text>
                          {p.eftRef ? (
                            <Text style={styles.payoutRef}>EFT · {p.eftRef}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                      No payouts yet. Your earnings will appear here once your manager processes your first shift.
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* EFT Payout Tab */}
            {activeTab === 'eft' && (
              <>
                {!hero.bankLinked ? (
                  /* No bank linked */
                  <View style={styles.noBankCard}>
                    <Text style={styles.noBankIcon}>🏦</Text>
                    <Text style={styles.noBankTitle}>No bank account linked</Text>
                    <Text style={styles.noBankBody}>
                      Link your bank account in Profile to enable EFT payouts.
                    </Text>
                  </View>
                ) : unpaidCents === 0 ? (
                  /* Nothing to pay out */
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                      You have no unpaid tips at the moment. Check back after your next shift.
                    </Text>
                  </View>
                ) : (
                  /* EFT payout card */
                  <View style={styles.eftCard}>
                    <Text style={styles.eftLabel}>UNPAID BALANCE</Text>
                    <Text style={styles.eftBalance}>${centsToStr(unpaidCents)}</Text>
                    <Text style={styles.eftMeta}>from tips not yet paid out</Text>

                    <View style={styles.eftDivider} />

                    <View style={styles.eftFeeRow}>
                      <Text style={styles.eftFeeLabel}>Processing fee</Text>
                      <Text style={styles.eftFeeValue}>−$0.99</Text>
                    </View>
                    <View style={styles.eftNetRow}>
                      <Text style={styles.eftNetLabel}>You receive</Text>
                      <Text style={[styles.eftNetValue, !canRequest && { color: RED }]}>
                        ${centsToStr(Math.max(0, netAmount))}
                      </Text>
                    </View>

                    {hasPendingRequest ? (
                      <View style={styles.pendingBanner}>
                        <Text style={styles.pendingBannerText}>
                          ⏳ A payout request is already pending — your manager will process it shortly.
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.eftBtn, !canRequest && styles.eftBtnDisabled]}
                        disabled={!canRequest}
                        onPress={() => setConfirmVisible(true)}>
                        <Text style={styles.eftBtnText}>
                          Request EFT Payout · ${centsToStr(unpaidCents)}
                        </Text>
                      </Pressable>
                    )}

                    {!canRequest && unpaidCents > 0 && (
                      <Text style={styles.eftMinNote}>
                        Minimum payout is $0.99 + fee. Earn a bit more first.
                      </Text>
                    )}
                  </View>
                )}

                {/* Past requests */}
                {payoutRequests.length > 0 && (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>Request History</Text>
                    </View>
                    {payoutRequests.map((req, i) => (
                      <View
                        key={req.id}
                        style={[styles.payoutItem, i < payoutRequests.length - 1 && styles.payoutItemBorder]}>
                        <View style={styles.payoutLeft}>
                          <Text style={styles.payoutAmount}>${centsToStr(req.netAmount)}</Text>
                          <Text style={styles.payoutDate}>
                            {formatDate(req.requestedAt)} · fee ${centsToStr(req.fee)}
                          </Text>
                        </View>
                        <View style={styles.payoutRight}>
                          <View style={[
                            styles.statusBadge,
                            req.status === 'processed' ? styles.statusProcessed
                              : req.status === 'failed' ? styles.statusFailed
                              : styles.statusPending,
                          ]}>
                            <Text style={[
                              styles.statusText,
                              req.status === 'processed' ? { color: GREEN }
                                : req.status === 'failed' ? { color: RED }
                                : { color: AMBER },
                            ]}>
                              {req.status === 'processed' ? 'Processed'
                                : req.status === 'failed' ? 'Failed'
                                : 'Pending'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Could not load your tip data. Please check your connection and try again.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Confirm EFT Modal */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Confirm Transfer</Text>
            <Text style={styles.modalSubtitle}>
              Transfer ${centsToStr(unpaidCents)} to your bank account?
            </Text>

            <View style={styles.modalFeeBox}>
              <View style={styles.modalFeeRow}>
                <Text style={styles.modalFeeLabel}>Gross amount</Text>
                <Text style={styles.modalFeeValue}>${centsToStr(unpaidCents)}</Text>
              </View>
              <View style={styles.modalFeeRow}>
                <Text style={styles.modalFeeLabel}>Processing fee</Text>
                <Text style={[styles.modalFeeValue, { color: AMBER }]}>−$0.99</Text>
              </View>
              <View style={[styles.modalFeeRow, styles.modalFeeTotal]}>
                <Text style={styles.modalFeeTotalLabel}>You will receive</Text>
                <Text style={styles.modalFeeTotalValue}>${centsToStr(Math.max(0, netAmount))}</Text>
              </View>
            </View>

            <View style={styles.modalBtns}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setConfirmVisible(false)}
                disabled={submitting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, submitting && { opacity: 0.6 }]}
                onPress={handleConfirmEFT}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm Transfer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.modalTitle}>Transfer Requested</Text>
            <Text style={styles.modalSubtitle}>
              Your transfer has been requested. Funds will arrive in your bank account shortly.
            </Text>
            <Pressable
              style={styles.modalConfirmBtn}
              onPress={() => setSuccessVisible(false)}>
              <Text style={styles.modalConfirmText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },

  loadingWrap: { height: 200, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: { fontSize: 14, color: MUTED, lineHeight: 20, textAlign: 'center' },

  heroCard: {
    backgroundColor: '#0d1f17',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroSubtitle: { fontSize: 14, color: LABEL, fontWeight: '500', marginBottom: 6 },
  heroAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -2,
    lineHeight: 58,
  },
  heroMeta: { fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 16 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payoutLabel: { fontSize: 15, color: '#d0e8df', fontWeight: '500' },
  instantBadge: {
    backgroundColor: '#0d3324',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1a5c3a',
  },
  instantText: { fontSize: 12, color: BLUE, fontWeight: '700' },

  intentionCard: {
    backgroundColor: '#162019',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  intentionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 2,
    marginBottom: 8,
  },
  intentionText: { fontSize: 14, color: '#e8f5ef', lineHeight: 21, fontWeight: '400' },
  intentionAuthor: { fontSize: 12, color: BLUE, fontWeight: '500', marginTop: 6 },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: { backgroundColor: BLUE },
  tabText: { fontSize: 14, fontWeight: '600', color: MUTED },
  tabTextActive: { color: '#fff' },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AMBER,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },

  payoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  payoutItemBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  payoutLeft: { gap: 3 },
  payoutRight: { alignItems: 'flex-end', gap: 4 },
  payoutAmount: { fontSize: 18, fontWeight: '700', color: '#e8f5ef' },
  payoutDate: { fontSize: 13, color: MUTED },
  payoutStatus: { fontSize: 13, fontWeight: '700', color: BLUE },
  payoutRef: { fontSize: 12, color: MUTED },

  // Status badges
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusProcessed: { backgroundColor: GREEN_DIM },
  statusFailed: { backgroundColor: RED_DIM },
  statusPending: { backgroundColor: AMBER_DIM },
  statusText: { fontSize: 11, fontWeight: '700' },

  // EFT card
  eftCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(65,105,225,0.4)',
    gap: 8,
  },
  eftLabel: { fontSize: 11, fontWeight: '700', color: BLUE, letterSpacing: 1.5 },
  eftBalance: {
    fontSize: 48,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -1.5,
    lineHeight: 54,
  },
  eftMeta: { fontSize: 13, color: MUTED },
  eftDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8 },
  eftFeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eftFeeLabel: { fontSize: 14, color: MUTED },
  eftFeeValue: { fontSize: 14, fontWeight: '600', color: AMBER },
  eftNetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eftNetLabel: { fontSize: 15, fontWeight: '700', color: WHITE },
  eftNetValue: { fontSize: 18, fontWeight: '800', color: GREEN },
  eftBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  eftBtnDisabled: { opacity: 0.4 },
  eftBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  eftMinNote: { fontSize: 12, color: MUTED, textAlign: 'center' },

  pendingBanner: {
    backgroundColor: AMBER_DIM,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    marginTop: 8,
  },
  pendingBannerText: { fontSize: 13, color: AMBER, lineHeight: 18 },

  // No bank card
  noBankCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 10,
  },
  noBankIcon: { fontSize: 40 },
  noBankTitle: { fontSize: 17, fontWeight: '700', color: WHITE, textAlign: 'center' },
  noBankBody: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#0f1e16',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 14, color: MUTED, lineHeight: 20 },

  modalFeeBox: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
    marginVertical: 4,
  },
  modalFeeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalFeeLabel: { fontSize: 14, color: MUTED },
  modalFeeValue: { fontSize: 14, fontWeight: '600', color: WHITE },
  modalFeeTotal: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    marginTop: 2,
  },
  modalFeeTotalLabel: { fontSize: 15, fontWeight: '700', color: WHITE },
  modalFeeTotalValue: { fontSize: 18, fontWeight: '800', color: GREEN },

  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: MUTED },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: BLUE,
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  successIcon: {
    fontSize: 40,
    color: GREEN,
    textAlign: 'center',
  },
});
