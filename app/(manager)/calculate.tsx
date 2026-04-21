import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  calculateShiftSummary,
  calculateHousePool,
  TipOutRule,
  HousePoolStaff,
  ShiftSummaryResult,
  HousePoolAllocation,
} from '@/lib/tipCalculator';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const RED = '#ef4444';

// ─── Default tip-out rules ────────────────────────────────────────────────────
const DEFAULT_TIP_OUT_RULES: TipOutRule[] = [
  { role: 'bartender', percentage: 1.5, distribution: 'direct' },
  { role: 'runner',    percentage: 1.0, distribution: 'house_pool' },
  { role: 'host',      percentage: 0.5, distribution: 'house_pool' },
];

const ROLE_LABELS: Record<string, string> = {
  server:    'Server',
  bartender: 'Bartender',
  runner:    'Runner',
  host:      'Host',
  kitchen:   'Kitchen',
};

const ROLE_EMOJIS: Record<string, string> = {
  server:    '🍽️',
  bartender: '🍸',
  runner:    '🏃',
  host:      '🚪',
  kitchen:   '👨‍🍳',
};

const SERVER_ROLES = new Set(['server']);
const SUPPORT_ROLES = new Set(['bartender', 'runner', 'host', 'kitchen']);

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServerEntry {
  id: string;
  name: string;
  role: string;
  sales: string;
  tipsEarned: string;
  hoursWorked: string;
  included: boolean;
}

interface SupportEntry {
  id: string;
  name: string;
  role: string;
  hoursWorked: string;
  included: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string): number {
  const n = parseFloat(dollars);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalculateScreen() {
  const router = useRouter();

  const [shiftName, setShiftName] = useState('');
  const [shiftDate, setShiftDate] = useState(today());

  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [supportStaff, setSupportStaff] = useState<SupportEntry[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const [summary, setSummary] = useState<ShiftSummaryResult | null>(null);
  const [housePoolAllocations, setHousePoolAllocations] = useState<HousePoolAllocation[] | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Fetch staff on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function fetchStaff() {
      setLoadingStaff(true);
      try {
        const { data: locData } = await supabase
          .from('locations')
          .select('id')
          .limit(1)
          .single();
        if (!locData) return;
        setLocationId(locData.id);

        const { data: staffData, error } = await supabase
          .from('staff_members')
          .select('id, name, role, location_id')
          .eq('location_id', locData.id)
          .order('name');
        if (error) throw error;

        const all = staffData ?? [];

        setServers(
          all
            .filter((s) => SERVER_ROLES.has(s.role?.toLowerCase()))
            .map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role?.toLowerCase() ?? 'server',
              sales: '',
              tipsEarned: '',
              hoursWorked: '',
              included: true,
            })),
        );
        setSupportStaff(
          all
            .filter((s) => SUPPORT_ROLES.has(s.role?.toLowerCase()))
            .map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role?.toLowerCase() ?? 'runner',
              hoursWorked: '',
              included: true,
            })),
        );
      } catch (err) {
        console.error('Failed to load staff:', err);
      } finally {
        setLoadingStaff(false);
      }
    }
    fetchStaff();
  }, []);

  // ── Update helpers ────────────────────────────────────────────────────────
  function updateServer(
    id: string,
    field: keyof Pick<ServerEntry, 'sales' | 'tipsEarned' | 'hoursWorked'>,
    value: string,
  ) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
      setSummary(null);
    }
  }

  function toggleServer(id: string) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s)));
    setSummary(null);
  }

  function updateSupportHours(id: string, value: string) {
    if (/^\d{0,2}(\.\d{0,2})?$/.test(value)) {
      setSupportStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, hoursWorked: value } : s)),
      );
      setSummary(null);
    }
  }

  function toggleSupport(id: string) {
    setSupportStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s)),
    );
    setSummary(null);
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  function handleCalculate() {
    if (!shiftName.trim()) {
      Alert.alert('Missing info', 'Please enter a shift name.');
      return;
    }

    const activeServers = servers.filter((s) => s.included);
    if (activeServers.length === 0) {
      Alert.alert('No servers', 'Include at least one server.');
      return;
    }

    const missingData = activeServers.filter(
      (s) =>
        dollarsToCents(s.sales) <= 0 ||
        dollarsToCents(s.tipsEarned) <= 0 ||
        parseFloat(s.hoursWorked) <= 0,
    );
    if (missingData.length > 0) {
      Alert.alert(
        'Missing data',
        `Enter sales, tips earned, and hours for: ${missingData.map((s) => s.name).join(', ')}`,
      );
      return;
    }

    try {
      const serverInputs = activeServers.map((s) => ({
        id: s.id,
        name: s.name,
        sales: dollarsToCents(s.sales),
        tipsEarned: dollarsToCents(s.tipsEarned),
        hoursWorked: parseFloat(s.hoursWorked),
      }));

      const newSummary = calculateShiftSummary(serverInputs, DEFAULT_TIP_OUT_RULES);
      setSummary(newSummary);

      // Distribute house pool among active support staff by hours (points)
      const activeSupport = supportStaff.filter(
        (s) => s.included && parseFloat(s.hoursWorked) > 0,
      );
      const poolRoles: HousePoolStaff[] = activeSupport.map((s) => ({
        staffId: s.id,
        name: s.name,
        distribution_type: 'points',
        points_per_hour: 1,
        hours_worked: parseFloat(s.hoursWorked),
      }));

      setHousePoolAllocations(calculateHousePool(newSummary.totalHousePool, poolRoles));
    } catch (err: unknown) {
      Alert.alert('Calculation error', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Direct tip-out totals per role ────────────────────────────────────────
  function getDirectTipOutTotals(): Record<string, number> {
    if (!summary) return {};
    const totals: Record<string, number> = {};
    for (const server of summary.perServerBreakdown) {
      for (const tipOut of server.directTipOuts) {
        totals[tipOut.role] = (totals[tipOut.role] ?? 0) + tipOut.amount;
      }
    }
    return totals;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSaveAndPayout() {
    if (!summary || !housePoolAllocations || !locationId) return;

    const totalTipsCents = summary.perServerBreakdown.reduce((sum, s) => sum + s.tipsEarned, 0);
    const totalSalesCents = summary.perServerBreakdown.reduce((sum, s) => sum + s.sales, 0);

    setSaving(true);
    try {
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .insert({
          location_id: locationId,
          date: shiftDate,
          name: shiftName.trim(),
          total_tips: totalTipsCents,
          total_sales: totalSalesCents,
          status: 'calculated',
          pos_source: 'manual',
        })
        .select('id')
        .single();
      if (shiftError) throw shiftError;

      const allocations: object[] = [];

      // Server allocations — what each server keeps after tip-outs
      for (const s of summary.perServerBreakdown) {
        const directTipOutsTotal = s.directTipOuts.reduce((sum, t) => sum + t.amount, 0);
        const row = {
          shift_id: shiftData.id,
          staff_id: s.id,
          hours_worked: s.hoursWorked,
          role_weight: 1.0,
          server_sales: s.sales,
          total_tip_out: s.totalTipOut,
          direct_tip_outs: directTipOutsTotal,
          house_pool_contribution: s.housePoolContribution,
          tips_kept: s.tipsKept,
          calculated_amount: s.tipsKept,
        };
        console.log('[TipFlow] Server allocation:', row);
        allocations.push(row);
      }

      // House pool allocations
      for (const a of housePoolAllocations) {
        allocations.push({
          shift_id: shiftData.id,
          staff_id: a.staffId,
          hours_worked: a.hoursWorked,
          role_weight: 0,
          calculated_amount: a.calculatedAmount,
        });
      }

      // Direct tip-out allocations — split equally among active staff of each role
      const directTotals = getDirectTipOutTotals();
      for (const [role, totalAmount] of Object.entries(directTotals)) {
        const recipients = supportStaff.filter(
          (s) => s.included && s.role === role && parseFloat(s.hoursWorked) > 0,
        );
        if (recipients.length === 0) continue;
        const perPerson = Math.floor(totalAmount / recipients.length);
        let leftover = totalAmount - perPerson * recipients.length;
        for (const r of recipients) {
          const amount = leftover > 0 ? perPerson + 1 : perPerson;
          if (leftover > 0) leftover--;
          allocations.push({
            shift_id: shiftData.id,
            staff_id: r.id,
            hours_worked: parseFloat(r.hoursWorked) || 0,
            role_weight: 0,
            calculated_amount: amount,
          });
        }
      }

      console.log('[TipFlow] All allocations to insert:', JSON.stringify(allocations, null, 2));
      console.log('[TipFlow] Total house pool to add to location balance:', summary.totalHousePool);

      const { error: allocError } = await supabase.from('tip_allocations').insert(allocations);
      if (allocError) throw allocError;

      // Update location's house_pool_balance
      const { data: locBalance } = await supabase
        .from('locations')
        .select('house_pool_balance')
        .eq('id', locationId)
        .single();
      const currentBalance = locBalance?.house_pool_balance ?? 0;
      const { error: balanceError } = await supabase
        .from('locations')
        .update({ house_pool_balance: currentBalance + summary.totalHousePool })
        .eq('id', locationId);
      if (balanceError) throw balanceError;
      console.log('[TipFlow] house_pool_balance updated:', currentBalance, '+', summary.totalHousePool, '=', currentBalance + summary.totalHousePool);

      router.back();
    } catch (err: unknown) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const directTipOutTotals = getDirectTipOutTotals();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Calculate Tips</Text>
            <Text style={styles.subtitle}>Enter each server's sales and tips earned</Text>
          </View>

          {/* Tip-out rules */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tip-Out Rules</Text>
            {DEFAULT_TIP_OUT_RULES.map((rule, i) => (
              <View key={rule.role}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.ruleRow}>
                  <Text style={styles.ruleRole}>
                    {ROLE_EMOJIS[rule.role] ?? ''} {ROLE_LABELS[rule.role] ?? rule.role}
                  </Text>
                  <Text style={styles.rulePct}>{rule.percentage}% of sales</Text>
                  <View style={[
                    styles.ruleBadge,
                    rule.distribution === 'direct' ? styles.badgeTeal : styles.badgeAmber,
                  ]}>
                    <Text style={[
                      styles.ruleBadgeText,
                      rule.distribution === 'direct' ? styles.badgeTealText : styles.badgeAmberText,
                    ]}>
                      {rule.distribution === 'direct' ? 'direct' : 'pool'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Shift Details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shift Details</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Shift Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Friday Dinner"
                placeholderTextColor={MUTED}
                value={shiftName}
                onChangeText={(t) => { setShiftName(t); setSummary(null); }}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                style={styles.textInput}
                value={shiftDate}
                onChangeText={(t) => { setShiftDate(t); setSummary(null); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={MUTED}
              />
            </View>
          </View>

          {/* Servers */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Servers</Text>
            {loadingStaff ? (
              <ActivityIndicator color={TEAL} style={{ marginVertical: 20 }} />
            ) : servers.length === 0 ? (
              <Text style={styles.emptyText}>
                No servers found. Add server staff in the Staff tab.
              </Text>
            ) : (
              servers.map((s, index) => (
                <View key={s.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={[styles.serverBlock, !s.included && styles.mutedBlock]}>
                    <View style={styles.serverHeader}>
                      <Text style={[styles.staffName, !s.included && { color: MUTED }]}>
                        {ROLE_EMOJIS.server} {s.name}
                      </Text>
                      <Switch
                        value={s.included}
                        onValueChange={() => toggleServer(s.id)}
                        trackColor={{ false: BORDER, true: TEAL_DIM }}
                        thumbColor={s.included ? TEAL : MUTED}
                      />
                    </View>
                    {s.included && (
                      <View style={styles.serverInputs}>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Sales ($)</Text>
                          <TextInput
                            style={styles.smallInput}
                            placeholder="0.00"
                            placeholderTextColor={MUTED}
                            value={s.sales}
                            onChangeText={(t) => updateServer(s.id, 'sales', t)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Tips ($)</Text>
                          <TextInput
                            style={styles.smallInput}
                            placeholder="0.00"
                            placeholderTextColor={MUTED}
                            value={s.tipsEarned}
                            onChangeText={(t) => updateServer(s.id, 'tipsEarned', t)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Hours</Text>
                          <TextInput
                            style={styles.smallInput}
                            placeholder="0"
                            placeholderTextColor={MUTED}
                            value={s.hoursWorked}
                            onChangeText={(t) => updateServer(s.id, 'hoursWorked', t)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Support Staff */}
          {!loadingStaff && supportStaff.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Support Staff</Text>
              <Text style={styles.cardSubtitle}>Hours worked determines house pool share</Text>
              {supportStaff.map((s, index) => (
                <View key={s.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={[styles.staffRow, !s.included && styles.mutedBlock]}>
                    <View style={styles.staffInfo}>
                      <Text style={[styles.staffName, !s.included && { color: MUTED }]}>
                        {ROLE_EMOJIS[s.role] ?? ''} {s.name}
                      </Text>
                      <Text style={styles.staffRole}>{ROLE_LABELS[s.role] ?? s.role}</Text>
                    </View>
                    <TextInput
                      style={[styles.hoursInput, !s.included && styles.hoursInputDisabled]}
                      placeholder="hrs"
                      placeholderTextColor={MUTED}
                      value={s.hoursWorked}
                      onChangeText={(t) => updateSupportHours(s.id, t)}
                      keyboardType="decimal-pad"
                      editable={s.included}
                    />
                    <Switch
                      value={s.included}
                      onValueChange={() => toggleSupport(s.id)}
                      trackColor={{ false: BORDER, true: TEAL_DIM }}
                      thumbColor={s.included ? TEAL : MUTED}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Calculate Button */}
          <TouchableOpacity style={styles.calcBtn} onPress={handleCalculate} activeOpacity={0.8}>
            <Text style={styles.calcBtnText}>Calculate</Text>
          </TouchableOpacity>

          {/* Results */}
          {summary && housePoolAllocations && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Results</Text>

              {/* Per-server breakdown */}
              {summary.perServerBreakdown.map((s, index) => (
                <View
                  key={s.id}
                  style={[
                    styles.resultCard,
                    index < summary.perServerBreakdown.length - 1 && styles.resultCardBorder,
                  ]}>
                  <View style={styles.resultHeaderRow}>
                    <Text style={styles.resultName}>{s.name}</Text>
                    <Text style={[
                      styles.resultAmount,
                      s.tipsKept < 0 && { color: RED },
                    ]}>
                      ${centsToDisplay(s.tipsKept)}
                    </Text>
                  </View>
                  <Text style={styles.resultMeta}>
                    ${centsToDisplay(s.sales)} sales · ${centsToDisplay(s.tipsEarned)} earned
                  </Text>
                  {s.directTipOuts.map((t) => (
                    <View key={t.role} style={styles.tipOutRow}>
                      <Text style={styles.tipOutLabel}>
                        → {ROLE_LABELS[t.role] ?? t.role} tip-out ({t.percentage}%)
                      </Text>
                      <Text style={styles.tipOutAmount}>−${centsToDisplay(t.amount)}</Text>
                    </View>
                  ))}
                  {s.housePoolContribution > 0 && (
                    <View style={styles.tipOutRow}>
                      <Text style={styles.tipOutLabel}>→ Pool contribution</Text>
                      <Text style={styles.tipOutAmount}>
                        −${centsToDisplay(s.housePoolContribution)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}

              {/* Servers total */}
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>Servers keep</Text>
                  <Text style={styles.totalSub}>After all tip-outs</Text>
                </View>
                <Text style={styles.totalAmount}>${centsToDisplay(summary.totalTipsKept)}</Text>
              </View>

              {/* Direct tip-out totals */}
              {Object.keys(directTipOutTotals).length > 0 && (
                <View style={styles.poolCard}>
                  <Text style={styles.poolCardTitle}>Direct Tip-Outs</Text>
                  {Object.entries(directTipOutTotals).map(([role, amount], i) => (
                    <View key={role}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.poolRow}>
                        <Text style={styles.poolName}>
                          {ROLE_EMOJIS[role] ?? ''} {ROLE_LABELS[role] ?? role}s (split equally)
                        </Text>
                        <Text style={styles.poolAmount}>${centsToDisplay(amount)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* House pool distribution */}
              {summary.totalHousePool > 0 && (
                <View style={styles.poolCard}>
                  <View style={styles.poolCardHeader}>
                    <Text style={styles.poolCardTitle}>House Pool</Text>
                    <Text style={styles.poolCardTotal}>
                      ${centsToDisplay(summary.totalHousePool)}
                    </Text>
                  </View>
                  {housePoolAllocations.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No support staff on shift — pool unallocated.
                    </Text>
                  ) : (
                    housePoolAllocations.map((a, i) => (
                      <View key={a.staffId}>
                        {i > 0 && <View style={styles.divider} />}
                        <View style={styles.poolRow}>
                          <View>
                            <Text style={styles.poolName}>{a.name}</Text>
                            <Text style={styles.poolMeta}>
                              {a.hoursWorked}h
                              {a.distributionType === 'points'
                                ? ` · ${a.points.toFixed(1)} pts`
                                : ' · fixed'}
                            </Text>
                          </View>
                          <Text style={styles.poolAmount}>
                            ${centsToDisplay(a.calculatedAmount)}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Save & Pay Out */}
              <TouchableOpacity
                style={[styles.payoutBtn, saving && styles.payoutBtnDisabled]}
                onPress={handleSaveAndPayout}
                activeOpacity={0.8}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#09100e" />
                ) : (
                  <Text style={styles.payoutBtnText}>Save & Pay Out</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 20 },

  // Header
  header: { gap: 4 },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 15, color: TEAL, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: MUTED },

  // Card
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardSubtitle: {
    fontSize: 12,
    color: MUTED,
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: -8,
  },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },

  // Tip-out rule row
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 8,
  },
  ruleRole: { fontSize: 14, fontWeight: '600', color: WHITE, flex: 1 },
  rulePct: { fontSize: 13, color: MUTED },
  ruleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTeal: { backgroundColor: 'rgba(0,229,160,0.12)' },
  badgeAmber: { backgroundColor: 'rgba(245,158,11,0.12)' },
  ruleBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  badgeTealText: { color: TEAL },
  badgeAmberText: { color: AMBER },

  // Field row (shift details)
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: WHITE, flex: 1 },
  textInput: {
    fontSize: 15,
    fontWeight: '600',
    color: TEAL,
    textAlign: 'right',
    minWidth: 100,
    padding: 0,
  },

  // Server block
  serverBlock: { paddingHorizontal: 16, paddingVertical: 12 },
  mutedBlock: { opacity: 0.45 },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  serverInputs: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  smallInput: {
    fontSize: 14,
    fontWeight: '700',
    color: TEAL,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'center',
  },

  // Support staff row
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  staffInfo: { flex: 1, gap: 2 },
  staffName: { fontSize: 15, fontWeight: '700', color: WHITE },
  staffRole: { fontSize: 12, color: MUTED, fontWeight: '500' },
  hoursInput: {
    fontSize: 15,
    fontWeight: '700',
    color: TEAL,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 56,
    textAlign: 'center',
  },
  hoursInputDisabled: { color: MUTED },
  emptyText: { fontSize: 14, color: MUTED, paddingHorizontal: 16, paddingVertical: 20, textAlign: 'center', lineHeight: 20 },

  // Calculate button
  calcBtn: { backgroundColor: TEAL, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  calcBtnText: { fontSize: 17, fontWeight: '800', color: '#09100e', letterSpacing: 0.2 },

  // Results
  resultsSection: { gap: 2 },
  resultsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  resultCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  resultCardBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  resultName: { fontSize: 16, fontWeight: '700', color: WHITE },
  resultAmount: { fontSize: 22, fontWeight: '800', color: TEAL, letterSpacing: -0.5 },
  resultMeta: { fontSize: 12, color: MUTED, marginBottom: 6 },
  tipOutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  tipOutLabel: { fontSize: 12, color: MUTED },
  tipOutAmount: { fontSize: 12, fontWeight: '600', color: AMBER },

  // Totals row
  totalRow: {
    backgroundColor: TEAL_DIM,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.25)',
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: TEAL },
  totalSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  totalAmount: { fontSize: 18, fontWeight: '800', color: TEAL },

  // Pool card
  poolCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 14,
    paddingVertical: 4,
  },
  poolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  poolCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  poolCardTotal: { fontSize: 15, fontWeight: '800', color: AMBER },
  poolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  poolName: { fontSize: 14, fontWeight: '600', color: WHITE },
  poolMeta: { fontSize: 11, color: MUTED, marginTop: 2 },
  poolAmount: { fontSize: 16, fontWeight: '800', color: TEAL },

  // Save button
  payoutBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payoutBtnDisabled: { opacity: 0.6 },
  payoutBtnText: { fontSize: 17, fontWeight: '800', color: '#09100e', letterSpacing: 0.2 },
});
