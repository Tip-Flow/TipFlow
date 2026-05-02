import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const GREEN = '#22c55e';
const PURPLE = '#a78bfa';
const PURPLE_DIM = 'rgba(167,139,250,0.12)';
const PURPLE_BORDER = 'rgba(167,139,250,0.3)';

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

type PayoutRequest = {
  id: string;
  staff_name: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: string;
  requested_at: string;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return '$' + dollars.toLocaleString('en-CA');
}

function formatCentsExact(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
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
  const isDesktop = useIsDesktop();
  const [pendingShifts, setPendingShifts] = useState<PendingShift[]>([]);
  const [history, setHistory] = useState<HistoryAllocation[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingShiftId, setPayingShiftId] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, paidRes, requestsRes] = await Promise.all([
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
        supabase
          .from('payout_requests')
          .select('id, amount, fee, net_amount, status, requested_at, staff_members(name)')
          .eq('status', 'pending')
          .order('requested_at', { ascending: false }),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (paidRes.error) throw paidRes.error;
      // Ignore payout_requests error — table may not exist yet in dev

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

      const requests: PayoutRequest[] = (requestsRes.data ?? []).map((r: any) => ({
        id: r.id,
        staff_name: r.staff_members?.name ?? 'Unknown',
        amount: r.amount,
        fee: r.fee,
        net_amount: r.net_amount,
        status: r.status,
        requested_at: r.requested_at,
      }));

      setPendingShifts(pending);
      setHistory(historyRows);
      setPayoutRequests(requests);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
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

  async function handlePayout(shift: PendingShift) {
    setPayingShiftId(shift.id);
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

      fetchData();
    } catch (err: unknown) {
      setPendingShifts((prev) => [shift, ...prev]);
      Alert.alert('Payout failed', err instanceof Error ? err.message : String(err));
    } finally {
      setPayingShiftId(null);
    }
  }

  async function handleProcessEFT(req: PayoutRequest) {
    setProcessingRequestId(req.id);
    setPayoutRequests((prev) => prev.filter((r) => r.id !== req.id));
    try {
      const { error } = await supabase
        .from('payout_requests')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', req.id);
      if (error) throw error;
      fetchData();
    } catch (err: unknown) {
      setPayoutRequests((prev) => [req, ...prev]);
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingRequestId(null);
    }
  }

  const pendingSection = loading ? (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={BLUE} />
    </View>
  ) : pendingShifts.length === 0 ? (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>No pending payouts</Text>
      <Text style={styles.emptySubtext}>All shifts have been paid out.</Text>
    </View>
  ) : (
    <>
      <View style={styles.pendingSectionHeader}>
        <Text style={styles.readyText}>Ready to Pay Out</Text>
        <View style={styles.shiftBadge}>
          <Text style={styles.shiftBadgeText}>
            {pendingShifts.length} {pendingShifts.length === 1 ? 'shift' : 'shifts'}
          </Text>
        </View>
      </View>

      {isDesktop ? (
        <View style={styles.desktopTable}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Shift</Text>
            <Text style={styles.tableHeadCell}>Date</Text>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Staff</Text>
            <Text style={styles.tableHeadCell}>Total</Text>
            <Text style={[styles.tableHeadCell, { width: 160 }]}>Action</Text>
          </View>
          {pendingShifts.map((shift, index) => (
            <View
              key={shift.id}
              style={[styles.tableRow, index < pendingShifts.length - 1 && styles.tableRowBorder]}>
              <View style={{ flex: 2, gap: 2 }}>
                <Text style={styles.tableShiftName}>{shift.name}</Text>
                {shift.location_name ? (
                  <Text style={styles.tableShiftMeta}>{shift.location_name}</Text>
                ) : null}
              </View>
              <Text style={styles.tableCell}>{formatDate(shift.date)}</Text>
              <View style={{ flex: 2 }}>
                {shift.allocations.slice(0, 3).map((chip) => (
                  <Text key={chip.id} style={styles.tableStaffRow}>
                    {payoutMethodEmoji(chip.payout_method)} {chip.staff_name} · {formatCents(chip.calculated_amount)}
                  </Text>
                ))}
                {shift.allocations.length > 3 && (
                  <Text style={styles.tableMoreStaff}>+{shift.allocations.length - 3} more</Text>
                )}
              </View>
              <Text style={styles.tableTotalAmount}>{formatCents(shift.total_tips)}</Text>
              <Pressable
                style={[styles.tablePayBtn, payingShiftId === shift.id && styles.payBtnDisabled, { width: 148 }]}
                disabled={payingShiftId === shift.id}
                onPress={() => handlePayout(shift)}>
                {payingShiftId === shift.id ? (
                  <ActivityIndicator size="small" color={BG} />
                ) : (
                  <Text style={styles.payBtnText}>Pay via EFT</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        pendingShifts.map((shift) => (
          <View key={shift.id} style={styles.pendingCard}>
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
            <Text style={styles.totalAmount}>{formatCents(shift.total_tips)} CAD</Text>
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
            <Pressable
              style={[styles.payBtn, payingShiftId === shift.id && styles.payBtnDisabled]}
              disabled={payingShiftId === shift.id}
              onPress={() => handlePayout(shift)}>
              {payingShiftId === shift.id ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                <Text style={styles.payBtnText}>Pay via EFT</Text>
              )}
            </Pressable>
          </View>
        ))
      )}
    </>
  );

  const eftRequestsSection = !loading && payoutRequests.length > 0 ? (
    <View style={styles.eftSection}>
      <View style={styles.eftSectionHeader}>
        <Text style={styles.eftSectionTitle}>Staff Payout Requests</Text>
        <View style={styles.eftBadge}>
          <Text style={styles.eftBadgeText}>
            {payoutRequests.length} pending
          </Text>
        </View>
      </View>

      {isDesktop ? (
        <View style={styles.desktopTable}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Staff</Text>
            <Text style={styles.tableHeadCell}>Requested</Text>
            <Text style={styles.tableHeadCell}>Gross</Text>
            <Text style={styles.tableHeadCell}>Fee</Text>
            <Text style={styles.tableHeadCell}>Net</Text>
            <Text style={[styles.tableHeadCell, { width: 148 }]}>Action</Text>
          </View>
          {payoutRequests.map((req, index) => (
            <View
              key={req.id}
              style={[styles.tableRow, index < payoutRequests.length - 1 && styles.tableRowBorder]}>
              <Text style={[styles.tableShiftName, { flex: 2 }]}>{req.staff_name}</Text>
              <Text style={styles.tableCell}>{formatTimestamp(req.requested_at)}</Text>
              <Text style={styles.tableCell}>{formatCentsExact(req.amount)}</Text>
              <Text style={[styles.tableCell, { color: AMBER }]}>−{formatCentsExact(req.fee)}</Text>
              <Text style={[styles.tableTotalAmount, { color: GREEN }]}>{formatCentsExact(req.net_amount)}</Text>
              <Pressable
                style={[styles.eftProcessBtn, processingRequestId === req.id && styles.payBtnDisabled, { width: 136 }]}
                disabled={processingRequestId === req.id}
                onPress={() => handleProcessEFT(req)}>
                {processingRequestId === req.id ? (
                  <ActivityIndicator size="small" color={BG} />
                ) : (
                  <Text style={styles.eftProcessBtnText}>Process EFT</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.eftCard}>
          {payoutRequests.map((req, index) => (
            <View
              key={req.id}
              style={[
                styles.eftRow,
                index < payoutRequests.length - 1 && styles.eftRowBorder,
              ]}>
              <View style={styles.eftRowTop}>
                <Text style={styles.eftStaffName}>{req.staff_name}</Text>
                <Text style={styles.eftTime}>{formatTimestamp(req.requested_at)}</Text>
              </View>
              <View style={styles.eftAmounts}>
                <View style={styles.eftAmountItem}>
                  <Text style={styles.eftAmountLabel}>Gross</Text>
                  <Text style={styles.eftAmountValue}>{formatCentsExact(req.amount)}</Text>
                </View>
                <Text style={styles.eftMinus}>−</Text>
                <View style={styles.eftAmountItem}>
                  <Text style={styles.eftAmountLabel}>Fee</Text>
                  <Text style={[styles.eftAmountValue, { color: AMBER }]}>{formatCentsExact(req.fee)}</Text>
                </View>
                <Text style={styles.eftEquals}>=</Text>
                <View style={styles.eftAmountItem}>
                  <Text style={styles.eftAmountLabel}>Net</Text>
                  <Text style={[styles.eftAmountValue, { color: GREEN }]}>{formatCentsExact(req.net_amount)}</Text>
                </View>
              </View>
              <Pressable
                style={[styles.eftProcessBtnMobile, processingRequestId === req.id && styles.payBtnDisabled]}
                disabled={processingRequestId === req.id}
                onPress={() => handleProcessEFT(req)}>
                {processingRequestId === req.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.eftProcessBtnText}>Process EFT</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  ) : null;

  const historySection = !loading && history.length > 0 ? (
    <View style={styles.historySection}>
      <Text style={styles.sectionTitle}>Payout History</Text>
      {isDesktop ? (
        <View style={styles.desktopTable}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Staff</Text>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Shift</Text>
            <Text style={styles.tableHeadCell}>Date</Text>
            <Text style={styles.tableHeadCell}>Method</Text>
            <Text style={styles.tableHeadCell}>Amount</Text>
            <Text style={[styles.tableHeadCell, { width: 80 }]}>Status</Text>
          </View>
          {history.map((item, index) => (
            <View
              key={item.id}
              style={[styles.tableRow, index < history.length - 1 && styles.tableRowBorder]}>
              <Text style={[styles.tableShiftName, { flex: 2 }]}>{item.staff_name}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{item.shift_name}</Text>
              <Text style={styles.tableCell}>{formatDate(item.shift_date)}</Text>
              <Text style={styles.tableCell}>{payoutMethodLabel(item.payout_method)}</Text>
              <Text style={styles.tableTotalAmount}>{formatCents(item.calculated_amount)}</Text>
              <View style={[styles.sentBadge, { width: 68 }]}>
                <Text style={styles.sentText}>Sent</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
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
      )}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.title}>Payouts</Text>
        </View>

        {pendingSection}
        {eftRequestsSection}
        {historySection}

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
  contentDesktop: {
    paddingHorizontal: 32,
  },

  // Desktop table
  desktopTable: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#0e1a14',
    gap: 12,
  },
  tableHeadCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableShiftName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  tableShiftMeta: {
    fontSize: 11,
    color: MUTED,
  },
  tableCell: {
    flex: 1,
    fontSize: 13,
    color: MUTED,
  },
  tableStaffRow: {
    fontSize: 12,
    color: WHITE,
    marginBottom: 2,
  },
  tableMoreStaff: {
    fontSize: 11,
    color: MUTED,
    fontStyle: 'italic',
  },
  tableTotalAmount: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: BLUE,
  },
  tablePayBtn: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
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
    color: BLUE,
    letterSpacing: -1,
  },

  // Staff Chips
  staffChips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: BLUE_DIM,
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
    color: BLUE,
  },

  // Pay Button
  payBtn: {
    backgroundColor: BLUE,
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
    color: '#ffffff',
    letterSpacing: 0.1,
  },

  // EFT Requests Section
  eftSection: {
    gap: 12,
  },
  eftSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eftSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PURPLE,
  },
  eftBadge: {
    backgroundColor: PURPLE_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  eftBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: PURPLE,
  },
  eftCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: PURPLE_BORDER,
    overflow: 'hidden',
  },
  eftRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  eftRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  eftRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eftStaffName: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  eftTime: {
    fontSize: 12,
    color: MUTED,
  },
  eftAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eftAmountItem: {
    alignItems: 'center',
    gap: 2,
  },
  eftAmountLabel: {
    fontSize: 11,
    color: MUTED,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  eftAmountValue: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  eftMinus: {
    fontSize: 16,
    color: MUTED,
    marginTop: 14,
  },
  eftEquals: {
    fontSize: 16,
    color: MUTED,
    marginTop: 14,
  },
  eftProcessBtn: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  eftProcessBtnMobile: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  eftProcessBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
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
    color: BLUE,
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
