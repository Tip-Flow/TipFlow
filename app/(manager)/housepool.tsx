import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type HousePoolRole = {
  id: string;
  staff_id: string;
  staff_name: string;
  distribution_type: 'fixed' | 'points';
  fixed_amount: number;
  points_per_hour: number;
};

type ShiftContribution = {
  id: string;
  name: string;
  date: string;
  house_pool_contribution: number;
};

type PayoutAllocation = {
  staff_id: string;
  staff_name: string;
  distribution_type: 'fixed' | 'points';
  hours: number;
  points_per_hour: number;
  amount: number;
};

function centsToDisplay(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function nextPayoutDate(lastPayout: string | null): string {
  const base = lastPayout ? new Date(lastPayout) : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function HousePool() {
  const router = useRouter();

  const [locationId, setLocationId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [lastPayoutDate, setLastPayoutDate] = useState<string | null>(null);
  const [roles, setRoles] = useState<HousePoolRole[]>([]);
  const [shifts, setShifts] = useState<ShiftContribution[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPayout, setShowPayout] = useState(false);
  const [payoutStep, setPayoutStep] = useState<'hours' | 'confirm'>('hours');
  const [hoursInputs, setHoursInputs] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<PayoutAllocation[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: loc, error: locError } = await supabase
        .from('locations')
        .select('id, name, house_pool_balance, last_house_pool_payout_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (locError) {
        console.log('[HousePool] fetchData error:', locError.message);
      }

      if (loc) {
        setLocationId(loc.id);
        const loadedBalance = loc.house_pool_balance ?? 0;
        console.log('[HousePool] Loaded house pool balance (cents):', loadedBalance, '→', '$' + (loadedBalance / 100).toFixed(2));
        setBalance(loadedBalance);
        setLastPayoutDate(loc.last_house_pool_payout_at ?? null);

        const [rolesRes, shiftsRes] = await Promise.all([
          supabase
            .from('house_pool_roles')
            .select('*')
            .eq('location_id', loc.id),
          supabase
            .from('shifts')
            .select('id, name, date, house_pool_contribution')
            .eq('location_id', loc.id)
            .gt('house_pool_contribution', 0)
            .order('date', { ascending: false })
            .limit(5),
        ]);

        if (rolesRes.data) setRoles(rolesRes.data);
        if (shiftsRes.data) setShifts(shiftsRes.data);
      }
    } catch (err) {
      console.log('[HousePool] fetchData exception:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );
  useWebFocus(fetchData);

  function totalContributions(): number {
    return shifts.reduce((sum, s) => sum + (s.house_pool_contribution ?? 0), 0);
  }

  function openPayoutFlow() {
    console.log('[HousePool] Pay Out Now tapped — balance:', balance, 'showPayout before:', showPayout);
    const initial: Record<string, string> = {};
    roles
      .filter(r => r.distribution_type === 'points')
      .forEach(r => { initial[r.staff_id] = ''; });
    setHoursInputs(initial);
    setPayoutStep('hours');
    setShowPayout(true);
  }

  function buildAllocations(): PayoutAllocation[] {
    const fixed = roles.filter(r => r.distribution_type === 'fixed');
    const points = roles.filter(r => r.distribution_type === 'points');

    const totalFixed = fixed.reduce((sum, r) => sum + r.fixed_amount, 0);
    const remaining = Math.max(0, balance - totalFixed);

    const totalPoints = points.reduce((sum, r) => {
      const h = parseFloat(hoursInputs[r.staff_id] || '0') || 0;
      return sum + h * r.points_per_hour;
    }, 0);

    const result: PayoutAllocation[] = [];

    fixed.forEach(r =>
      result.push({
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        distribution_type: 'fixed',
        hours: 0,
        points_per_hour: 0,
        amount: r.fixed_amount,
      })
    );

    points.forEach(r => {
      const h = parseFloat(hoursInputs[r.staff_id] || '0') || 0;
      const myPoints = h * r.points_per_hour;
      const share = totalPoints > 0 ? Math.round((myPoints / totalPoints) * remaining) : 0;
      result.push({
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        distribution_type: 'points',
        hours: h,
        points_per_hour: r.points_per_hour,
        amount: share,
      });
    });

    return result;
  }

  function handleReviewPayout() {
    setAllocations(buildAllocations());
    setPayoutStep('confirm');
  }

  async function handleConfirmPayout() {
    if (!locationId) return;
    setSaving(true);
    try {
      const { data: payout } = await supabase
        .from('house_pool_payouts')
        .insert({
          location_id: locationId,
          total_amount: balance,
          paid_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (payout) {
        await supabase.from('house_pool_allocations').insert(
          allocations.map(a => ({
            payout_id: payout.id,
            staff_id: a.staff_id,
            amount: a.amount,
            distribution_type: a.distribution_type,
            hours_worked: a.hours,
          }))
        );
      }

      await supabase
        .from('locations')
        .update({
          house_pool_balance: 0,
          last_house_pool_payout_at: new Date().toISOString(),
        })
        .eq('id', locationId);

      setBalance(0);
      setSuccess(true);
      setTimeout(() => {
        setShowPayout(false);
        setSuccess(false);
      }, 2200);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  const pointsRoles = roles.filter(r => r.distribution_type === 'points');
  const allHoursFilled = pointsRoles.length === 0
    || pointsRoles.every(r => parseFloat(hoursInputs[r.staff_id] || '0') > 0);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>House Pool</Text>
          <Text style={styles.headerSub}>
            Accumulated tips from all shifts, distributed every 2 weeks to support staff
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
            <Text style={styles.balanceAmount}>{centsToDisplay(balance)}</Text>
            <Text style={styles.balanceSub}>Accumulated since last payout</Text>
            <View style={styles.divider} />
            <View style={styles.nextPayoutRow}>
              <Text style={styles.nextPayoutLabel}>Next scheduled payout</Text>
              <Text style={styles.nextPayoutDate}>{nextPayoutDate(lastPayoutDate)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.payNowBtn, balance === 0 && styles.payNowBtnDisabled]}
              onPress={openPayoutFlow}
              disabled={balance === 0}
              activeOpacity={0.8}>
              <Text style={styles.payNowText}>Pay Out Now</Text>
            </TouchableOpacity>
          </View>

          {/* Pay Period Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pay Period Summary</Text>
            <View style={styles.card}>
              {shifts.length === 0 ? (
                <Text style={styles.emptyText}>No contributions recorded this period</Text>
              ) : (
                <>
                  {shifts.map((shift, i) => (
                    <View
                      key={shift.id}
                      style={[styles.shiftRow, i < shifts.length - 1 && styles.rowBorder]}>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName}>{shift.name}</Text>
                        <Text style={styles.rowMeta}>{formatDate(shift.date)}</Text>
                      </View>
                      <Text style={styles.amountTeal}>
                        +{centsToDisplay(shift.house_pool_contribution)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total contributions this period</Text>
                    <Text style={styles.totalAmount}>{centsToDisplay(totalContributions())}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Distribution Preview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Distribution Preview</Text>
            <View style={styles.card}>
              {roles.length === 0 ? (
                <Text style={styles.emptyText}>No distribution rules configured</Text>
              ) : (
                <>
                  {roles.map((role, i) => (
                    <View
                      key={role.id}
                      style={[styles.distRow, i < roles.length - 1 && styles.rowBorder]}>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName}>{role.staff_name}</Text>
                        <Text style={styles.rowMeta}>
                          {role.distribution_type === 'fixed'
                            ? 'Fixed allocation'
                            : `${role.points_per_hour} pts/hr × hours worked`}
                        </Text>
                      </View>
                      <Text style={[
                        styles.distAmount,
                        role.distribution_type === 'points' && styles.distAmountPoints,
                      ]}>
                        {role.distribution_type === 'fixed'
                          ? centsToDisplay(role.fixed_amount)
                          : 'Variable'}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.distNote}>
                    <Text style={styles.distNoteText}>
                      Final amounts calculated from actual hours worked
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

        </ScrollView>
      )}

      {/* Payout Modal */}
      <Modal
        visible={showPayout}
        animationType="slide"
        transparent
        onRequestClose={() => !saving && setShowPayout(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}>
            <View style={styles.sheet}>

              {success ? (
                <View style={styles.successWrap}>
                  <View style={styles.successCircle}>
                    <Text style={styles.successCheck}>✓</Text>
                  </View>
                  <Text style={styles.successTitle}>Payout Complete</Text>
                  <Text style={styles.successSub}>
                    House pool distributed and reset to $0.00
                  </Text>
                </View>
              ) : payoutStep === 'hours' ? (
                <>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Pay Out House Pool</Text>
                    <TouchableOpacity
                      onPress={() => setShowPayout(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.poolBalanceRow}>
                    <Text style={styles.poolBalanceLabel}>Pool balance</Text>
                    <Text style={styles.poolBalanceAmount}>{centsToDisplay(balance)}</Text>
                  </View>

                  <ScrollView
                    style={styles.sheetScroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled">

                    {roles.filter(r => r.distribution_type === 'fixed').length > 0 && (
                      <>
                        <Text style={styles.sheetSection}>Fixed Amount Staff</Text>
                        {roles.filter(r => r.distribution_type === 'fixed').map((role, i, arr) => (
                          <View
                            key={role.id}
                            style={[styles.modalRow, i < arr.length - 1 && styles.rowBorder]}>
                            <View style={styles.rowInfo}>
                              <Text style={styles.rowName}>{role.staff_name}</Text>
                              <Text style={styles.rowMeta}>Fixed allocation</Text>
                            </View>
                            <Text style={styles.amountTeal}>{centsToDisplay(role.fixed_amount)}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {pointsRoles.length > 0 && (
                      <>
                        <Text style={styles.sheetSection}>Points-Based Staff</Text>
                        <Text style={styles.sheetHint}>Enter hours worked this pay period</Text>
                        {pointsRoles.map((role, i) => (
                          <View
                            key={role.id}
                            style={[
                              styles.inputRow,
                              i < pointsRoles.length - 1 && styles.rowBorder,
                            ]}>
                            <View style={styles.rowInfo}>
                              <Text style={styles.rowName}>{role.staff_name}</Text>
                              <Text style={styles.rowMeta}>{role.points_per_hour} pts/hr</Text>
                            </View>
                            <View style={styles.hoursWrap}>
                              <TextInput
                                style={styles.hoursInput}
                                value={hoursInputs[role.staff_id]}
                                onChangeText={val =>
                                  setHoursInputs(prev => ({ ...prev, [role.staff_id]: val }))
                                }
                                placeholder="0"
                                placeholderTextColor={MUTED}
                                keyboardType="decimal-pad"
                                maxLength={5}
                              />
                              <Text style={styles.hoursUnit}>hrs</Text>
                            </View>
                          </View>
                        ))}
                      </>
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.actionBtn, !allHoursFilled && styles.actionBtnDisabled]}
                    onPress={handleReviewPayout}
                    disabled={!allHoursFilled}
                    activeOpacity={0.8}>
                    <Text style={styles.actionBtnText}>Review Payout →</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.sheetHeader}>
                    <TouchableOpacity onPress={() => setPayoutStep('hours')}>
                      <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.sheetTitle}>Final Breakdown</Text>
                    <View style={{ width: 56 }} />
                  </View>

                  <ScrollView
                    style={styles.sheetScroll}
                    showsVerticalScrollIndicator={false}>
                    {allocations.map((alloc, i) => (
                      <View
                        key={alloc.staff_id}
                        style={[styles.modalRow, i < allocations.length - 1 && styles.rowBorder]}>
                        <View style={styles.rowInfo}>
                          <Text style={styles.rowName}>{alloc.staff_name}</Text>
                          <Text style={styles.rowMeta}>
                            {alloc.distribution_type === 'fixed'
                              ? 'Fixed'
                              : `${alloc.hours} hrs × ${alloc.points_per_hour} pts`}
                          </Text>
                        </View>
                        <Text style={styles.amountTeal}>{centsToDisplay(alloc.amount)}</Text>
                      </View>
                    ))}
                    <View style={styles.finalTotalRow}>
                      <Text style={styles.finalTotalLabel}>Total Paid Out</Text>
                      <Text style={styles.finalTotalAmount}>
                        {centsToDisplay(allocations.reduce((s, a) => s + a.amount, 0))}
                      </Text>
                    </View>
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.actionBtn, saving && styles.actionBtnDisabled]}
                    onPress={handleConfirmPayout}
                    disabled={saving}
                    activeOpacity={0.8}>
                    {saving ? (
                      <ActivityIndicator color={BG} />
                    ) : (
                      <Text style={styles.actionBtnText}>Confirm & Pay</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: BLUE,
  },
  headerTitles: {
    gap: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 24,
  },

  // Balance Card
  balanceCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 2,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -1,
    lineHeight: 56,
  },
  balanceSub: {
    fontSize: 13,
    color: MUTED,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 8,
  },
  nextPayoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextPayoutLabel: {
    fontSize: 13,
    color: MUTED,
  },
  nextPayoutDate: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },
  payNowBtn: {
    marginTop: 8,
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  payNowBtnDisabled: {
    opacity: 0.4,
  },
  payNowText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a0f00',
  },

  // Sections
  section: { gap: 12 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: WHITE,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    padding: 18,
    textAlign: 'center',
  },

  // Rows
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
  },
  rowMeta: {
    fontSize: 12,
    color: MUTED,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  amountTeal: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: BLUE_DIM,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },
  totalAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: BLUE,
  },

  // Distribution
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  distAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  distAmountPoints: {
    color: AMBER,
  },
  distNote: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(65, 105, 225, 0.06)',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  distNoteText: {
    fontSize: 12,
    color: MUTED,
    fontStyle: 'italic',
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111a14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: BORDER,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: WHITE,
  },
  closeBtn: {
    fontSize: 16,
    color: MUTED,
    paddingHorizontal: 4,
  },
  poolBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BLUE_DIM,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  poolBalanceLabel: {
    fontSize: 13,
    color: BLUE,
    fontWeight: '600',
  },
  poolBalanceAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: BLUE,
  },
  sheetSection: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  sheetHint: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 8,
  },
  sheetScroll: {
    maxHeight: 340,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  hoursWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  hoursInput: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
    minWidth: 40,
    textAlign: 'right',
  },
  hoursUnit: {
    fontSize: 12,
    color: MUTED,
  },
  finalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  finalTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  finalTotalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: BLUE,
  },
  actionBtn: {
    marginTop: 16,
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Success
  successWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BLUE_DIM,
    borderWidth: 2,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successCheck: {
    fontSize: 32,
    color: BLUE,
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
  },
  successSub: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
});
