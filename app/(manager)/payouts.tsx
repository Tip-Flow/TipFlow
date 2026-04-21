import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const GREEN = '#22c55e';

type StaffChip = {
  id: string;
  staff_name: string;
  payout_method: string | null;
  calculated_amount: number;
};

type PendingShift = {
  id: string;
  name: string;
  date: string;
  total_tips: number;
  location_name: string;
  allocations: StaffChip[];
};

type HistoryAllocation = {
  id: string;
  shift_name: string;
  shift_date: string;
  staff_name: string;
  payout_method: string | null;
  calculated_amount: number;
  paid_at: string | null;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return '$' + dollars.toLocaleString('en-CA');
}

function payoutMethodLabel(method: string | null): string {
  switch (method) {
    case 'etransfer': return '📱 e-Transfer';
    case 'eft': return '🏦 EFT';
    default: return '💵 Cash';
  }
}

function payoutMethodEmoji(method: string | null): string {
  switch (method) {
    case 'etransfer': return '📱';
    case 'eft': return '🏦';
    default: return '💵';
  }
}

export default function PayoutsScreen() {
  const [pendingShifts, setPendingShifts] = useState<PendingShift[]>([]);
  const [history, setHistory] = useState<HistoryAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingShiftId, setPayingShiftId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, paidRes] = await Promise.all([
        supabase
          .from('shifts')
          .select(
            'id, name, date, total_tips, locations(name), tip_allocations(id, calculated_amount, staff_members(name, payout_method))'
          )
          .in('status', ['calculated', 'pending'])
          .order('date', { ascending: false }),
        supabase
          .from('shifts')
          .select(
            'id, name, date, tip_allocations(id, calculated_amount, paid_at, staff_members(name, payout_method))'
          )
          .eq('status', 'paid')
          .order('date', { ascending: false })
          .limit(20),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (paidRes.error) throw paidRes.error;

      console.log('[Payouts] pendingRes.data:', JSON.stringify(pendingRes.data, null, 2));

      const pending: PendingShift[] = (pendingRes.data ?? []).map((shift: any) => ({
        id: shift.id,
        name: shift.name,
        date: shift.date,
        total_tips: shift.total_tips,
        location_name: shift.locations?.name ?? '',
        allocations: (shift.tip_allocations ?? []).map((a: any) => ({
          id: a.id,
          staff_name: a.staff_members?.name ?? 'Unknown',
          payout_method: a.staff_members?.payout_method ?? null,
          calculated_amount: a.calculated_amount,
        })),
      }));

      const historyRows: HistoryAllocation[] = [];
      for (const shift of paidRes.data ?? []) {
        for (const a of shift.tip_allocations ?? []) {
          historyRows.push({
            id: a.id,
            shift_name: (shift as any).name,
            shift_date: (shift as any).date,
            staff_name: a.staff_members?.name ?? 'Unknown',
            payout_method: a.staff_members?.payout_method ?? null,
            calculated_amount: a.calculated_amount,
            paid_at: a.paid_at,
          });
        }
      }

      setPendingShifts(pending);
      setHistory(historyRows);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handlePayout(shift: PendingShift) {
    setPayingShiftId(shift.id);
    // Optimistic: remove from pending immediately
    setPendingShifts((prev) => prev.filter((s) => s.id !== shift.id));
    try {
      const aptpayRef = 'APT-TEST-' + Date.now();
      const paidAt = new Date().toISOString();

      const { error: shiftError } = await supabase
        .from('shifts')
        .update({ status: 'paid' })
        .eq('id', shift.id);
      if (shiftError) throw shiftError;

      const { error: allocError } = await supabase
        .from('tip_allocations')
        .update({ aptpay_ref: aptpayRef, paid_at: paidAt })
        .eq('shift_id', shift.id);
      if (allocError) throw allocError;

      // Refresh history in background
      fetchData();
    } catch (err: unknown) {
      // Restore shift on failure
      setPendingShifts((prev) => [shift, ...prev]);
      Alert.alert('Payout failed', err instanceof Error ? err.message : String(err));
    } finally {
      setPayingShiftId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payouts</Text>
        </View>

        {/* Loading state */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        ) : pendingShifts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No pending payouts</Text>
            <Text style={styles.emptySubtext}>All shifts have been paid out.</Text>
          </View>
        ) : (
          <>
            {/* Pending badge */}
            <View style={styles.pendingSectionHeader}>
              <Text style={styles.readyText}>Ready to Pay Out</Text>
              <View style={styles.shiftBadge}>
                <Text style={styles.shiftBadgeText}>
                  {pendingShifts.length} {pendingShifts.length === 1 ? 'shift' : 'shifts'}
                </Text>
              </View>
            </View>

            {/* Pending shift cards */}
            {pendingShifts.map((shift) => (
              <View key={shift.id} style={styles.pendingCard}>
                {/* Shift Info */}
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftName}>{shift.name}</Text>
                  <View style={styles.shiftMeta}>
                    {shift.location_name ? (
                      <>
                        <Text style={styles.shiftMetaText}>{shift.location_name}</Text>
                        <Text style={styles.shiftMetaDot}>·</Text>
                      </>
                    ) : null}
                    <Text style={styles.shiftMetaText}>{formatDate(shift.date)}</Text>
                  </View>
                </View>

                {/* Total Amount */}
                <Text style={styles.totalAmount}>{formatCents(shift.total_tips)} CAD</Text>

                {/* Staff Chips */}
                {shift.allocations.length > 0 && (
                  <View style={styles.staffChips}>
                    {shift.allocations.map((chip) => (
                      <View key={chip.id} style={styles.chip}>
                        <Text style={styles.chipEmoji}>{payoutMethodEmoji(chip.payout_method)}</Text>
                        <Text style={styles.chipName}>{chip.staff_name}</Text>
                        <Text style={styles.chipAmount}>{formatCents(chip.calculated_amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Pay Button */}
                <TouchableOpacity
                  style={[styles.payBtn, payingShiftId === shift.id && styles.payBtnDisabled]}
                  activeOpacity={0.8}
                  disabled={payingShiftId === shift.id}
                  onPress={() => handlePayout(shift)}>
                  {payingShiftId === shift.id ? (
                    <ActivityIndicator size="small" color={BG} />
                  ) : (
                    <Text style={styles.payBtnText}>Pay via AptPay</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Payout History */}
        {!loading && history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Payout History</Text>
            <View style={styles.historyCard}>
              {history.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.historyRow,
                    index < history.length - 1 && styles.historyRowBorder,
                  ]}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyName}>{item.staff_name}</Text>
                    <Text style={styles.historyShift}>
                      {item.shift_name} · {formatDate(item.shift_date)}
                    </Text>
                    <Text style={styles.historyMethod}>{payoutMethodLabel(item.payout_method)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>{formatCents(item.calculated_amount)}</Text>
                    <View style={styles.sentBadge}>
                      <Text style={styles.sentText}>Sent</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },

  // Header
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },

  // Loading
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },

  // Empty
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  emptySubtext: {
    fontSize: 13,
    color: MUTED,
  },

  // Pending section header
  pendingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  readyText: {
    fontSize: 15,
    fontWeight: '700',
    color: AMBER,
  },
  shiftBadge: {
    backgroundColor: AMBER_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  shiftBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: AMBER,
  },

  // Pending Card
  pendingCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AMBER_BORDER,
    padding: 18,
    gap: 16,
  },

  // Shift Info
  shiftInfo: {
    gap: 4,
  },
  shiftName: {
    fontSize: 20,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  shiftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftMetaText: {
    fontSize: 13,
    color: MUTED,
  },
  shiftMetaDot: {
    fontSize: 13,
    color: MUTED,
  },

  // Total Amount
  totalAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -1,
  },

  // Staff Chips
  staffChips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: TEAL_DIM,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },
  chipAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },

  // Pay Button
  payBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#09100e',
    letterSpacing: 0.1,
  },

  // History Section
  historySection: {
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.3,
  },
  historyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  historyLeft: {
    gap: 3,
    flex: 1,
  },
  historyName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  historyShift: {
    fontSize: 12,
    color: MUTED,
  },
  historyMethod: {
    fontSize: 12,
    color: MUTED,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: TEAL,
  },
  sentBadge: {
    backgroundColor: GREEN_DIM,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  sentText: {
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
  },
});
