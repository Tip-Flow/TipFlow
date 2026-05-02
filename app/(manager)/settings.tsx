import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const BG      = '#09100e';
const CARD    = '#162019';
const BLUE    = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER   = '#f59e0b';
const RED     = '#ff4d4d';
const MUTED   = '#6b7a74';
const WHITE   = '#e8f0ec';
const BORDER  = '#1f3028';

type PayoutType      = 'direct' | 'house_pool';
type DistributionType = 'equal' | 'hours';
type PayPeriod       = 'weekly' | 'biweekly' | 'monthly';

type TipOutRule = {
  id: string;
  roleName: string;
  percentage: string;
  payoutType: PayoutType;
};

type HousePoolStaff = {
  id: string;
  name: string;
  role: string;
  distributionType: DistributionType;
};

let nextId = 100;
function uid() { return String(nextId++); }

const DEFAULT_RULES: TipOutRule[] = [
  { id: '1', roleName: 'Bar',           percentage: '1.5', payoutType: 'direct'     },
  { id: '2', roleName: 'House Support', percentage: '5.0', payoutType: 'house_pool' },
];

function nextPayoutDate(period: PayPeriod): string {
  const now = new Date();
  const d   = new Date(now);
  if (period === 'weekly') {
    d.setDate(now.getDate() + (7 - now.getDay()));
  } else if (period === 'biweekly') {
    d.setDate(now.getDate() + (7 - now.getDay()) + 7);
  } else {
    d.setMonth(now.getMonth() + 1, 1);
  }
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Tab Switcher ────────────────────────────────────────────────────────────

function TabSwitcher({
  active,
  onChange,
}: {
  active: 'tipout' | 'house';
  onChange: (t: 'tipout' | 'house') => void;
}) {
  return (
    <View style={ts.wrapper}>
      <TouchableOpacity
        style={[ts.tab, active === 'tipout' && ts.tabActive]}
        onPress={() => onChange('tipout')}
        activeOpacity={0.8}>
        <Text style={[ts.label, active === 'tipout' && ts.labelActive]}>
          Tip Out Rules
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[ts.tab, active === 'house' && ts.tabActive]}
        onPress={() => onChange('house')}
        activeOpacity={0.8}>
        <Text style={[ts.label, active === 'house' && ts.labelActive]}>
          House Pool
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const ts = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: BLUE },
  label: { fontSize: 14, fontWeight: '700', color: MUTED },
  labelActive: { color: '#ffffff' },
});

// ─── Payout Type Toggle ───────────────────────────────────────────────────────

function PayoutToggle({ value, onChange }: { value: PayoutType; onChange: (v: PayoutType) => void }) {
  return (
    <View style={pt.wrapper}>
      <TouchableOpacity
        style={[pt.pill, value === 'direct' && pt.pillActive]}
        onPress={() => onChange('direct')}
        activeOpacity={0.8}>
        <Text style={[pt.text, value === 'direct' && pt.textActive]}>Direct</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[pt.pill, value === 'house_pool' && pt.pillHouse]}
        onPress={() => onChange('house_pool')}
        activeOpacity={0.8}>
        <Text style={[pt.text, value === 'house_pool' && pt.textActive]}>House Pool</Text>
      </TouchableOpacity>
    </View>
  );
}

const pt = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 3,
    gap: 2,
  },
  pill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  pillActive: { backgroundColor: BLUE },
  pillHouse: { backgroundColor: AMBER },
  text: { fontSize: 11, fontWeight: '700', color: MUTED },
  textActive: { color: '#ffffff' },
});

// ─── Distribution Type Toggle ─────────────────────────────────────────────────

function DistributionToggle({ value, onChange }: { value: DistributionType; onChange: (v: DistributionType) => void }) {
  return (
    <View style={dt.wrapper}>
      <TouchableOpacity
        style={[dt.pill, value === 'equal' && dt.pillActive]}
        onPress={() => onChange('equal')}
        activeOpacity={0.8}>
        <Text style={[dt.text, value === 'equal' && dt.textActive]}>Equal</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[dt.pill, value === 'hours' && dt.pillActive]}
        onPress={() => onChange('hours')}
        activeOpacity={0.8}>
        <Text style={[dt.text, value === 'hours' && dt.textActive]}>Hours-based</Text>
      </TouchableOpacity>
    </View>
  );
}

const dt = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 3,
    gap: 2,
  },
  pill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  pillActive: { backgroundColor: BLUE },
  text: { fontSize: 11, fontWeight: '700', color: MUTED },
  textActive: { color: '#ffffff' },
});

// ─── Tab 1: Tip Out Rules ─────────────────────────────────────────────────────

function TipOutTab() {
  const [rules, setRules] = useState<TipOutRule[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const { data: loc } = await supabase
        .from('locations')
        .select('id')
        .limit(1)
        .single();

      if (!loc) { setRules(DEFAULT_RULES); setLoading(false); return; }
      setLocationId(loc.id);

      const { data, error } = await supabase
        .from('tip_out_rules')
        .select('id, role_name, percentage_of_sales, payout_type')
        .eq('location_id', loc.id)
        .eq('is_active', true)
        .order('created_at');

      if (error) throw error;

      setRules(
        data && data.length > 0
          ? data.map(r => ({
              id: r.id,
              roleName: r.role_name,
              percentage: String(r.percentage_of_sales),
              payoutType: r.payout_type as PayoutType,
            }))
          : DEFAULT_RULES
      );
    } catch {
      setRules(DEFAULT_RULES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  function updateRule(id: string, patch: Partial<TipOutRule>) {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function deleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  function addRule() {
    setRules(prev => [...prev, { id: uid(), roleName: '', percentage: '0', payoutType: 'direct' }]);
  }

  function parseNum(s: string): number {
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const directTotal = rules.filter(r => r.payoutType === 'direct').reduce((sum, r) => sum + parseNum(r.percentage), 0);
  const houseTotal  = rules.filter(r => r.payoutType === 'house_pool').reduce((sum, r) => sum + parseNum(r.percentage), 0);
  const grandTotal  = directTotal + houseTotal;

  async function handleSave() {
    if (!locationId) {
      Alert.alert('Not ready', 'Location not loaded yet. Please wait and try again.');
      return;
    }
    setSaving(true);
    try {
      const { error: delError } = await supabase
        .from('tip_out_rules')
        .delete()
        .eq('location_id', locationId);

      if (delError) throw delError;

      const toInsert = rules
        .filter(r => r.roleName.trim() !== '')
        .map(r => ({
          location_id: locationId,
          role_name: r.roleName.trim(),
          percentage_of_sales: parseNum(r.percentage),
          payout_type: r.payoutType,
          is_active: true,
        }));

      if (toInsert.length > 0) {
        const { error: insError } = await supabase.from('tip_out_rules').insert(toInsert);
        if (insError) throw insError;
      }

      await loadRules();
      Alert.alert('Saved', 'Tip out rules have been updated.');
    } catch (err) {
      console.log('[TipOutTab] save error:', err);
      Alert.alert('Error', 'Failed to save rules. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <Text style={s.heading}>Tip Out Rules</Text>
      <Text style={s.subtitle}>
        Set what percentage of each server's SALES goes to other roles. Servers keep their remaining tips.
      </Text>

      <View style={s.exampleCard}>
        <Text style={s.exampleText}>
          <Text style={s.exampleBold}>Example: </Text>
          Susan sells $1,000. Bar tip out 1.5% = $15 goes directly to bar. House 5% = $50 goes to house pool. Susan keeps her tips minus $65.
        </Text>
      </View>

      <View style={s.rulesCard}>
        {rules.map((rule, index) => (
          <View key={rule.id} style={[s.ruleRow, index < rules.length - 1 && s.ruleRowBorder]}>
            <TextInput
              style={s.roleInput}
              value={rule.roleName}
              onChangeText={t => updateRule(rule.id, { roleName: t })}
              placeholder="Role"
              placeholderTextColor={MUTED}
            />
            <View style={s.pctWrapper}>
              <TextInput
                style={s.pctInput}
                value={rule.percentage}
                onChangeText={t => {
                  if (/^\d{0,2}(\.\d{0,1})?$/.test(t)) updateRule(rule.id, { percentage: t });
                }}
                keyboardType="decimal-pad"
                maxLength={4}
                selectTextOnFocus
                placeholderTextColor={MUTED}
              />
              <Text style={s.pctSymbol}>%</Text>
            </View>
            <PayoutToggle value={rule.payoutType} onChange={v => updateRule(rule.id, { payoutType: v })} />
            <TouchableOpacity style={s.deleteBtn} onPress={() => deleteRule(rule.id)} activeOpacity={0.7}>
              <Text style={s.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity style={s.addBtn} onPress={addRule} activeOpacity={0.8}>
        <Text style={s.addBtnText}>+ Add Rule</Text>
      </TouchableOpacity>

      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total direct tip outs</Text>
          <Text style={s.summaryValue}>{directTotal.toFixed(1)}% of server sales</Text>
        </View>
        <View style={[s.summaryRow, s.summaryRowBorder]}>
          <Text style={s.summaryLabel}>Total house pool contribution</Text>
          <Text style={[s.summaryValue, { color: AMBER }]}>{houseTotal.toFixed(1)}% of server sales</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={[s.summaryLabel, { fontWeight: '700', color: WHITE }]}>Total tip out</Text>
          <Text style={[s.summaryValue, { color: BLUE }]}>{grandTotal.toFixed(1)}% of server sales</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}>
        {saving
          ? <ActivityIndicator color="#ffffff" />
          : <Text style={s.saveBtnText}>Save Rules</Text>}
      </TouchableOpacity>
    </>
  );
}

// ─── Tab 2: House Pool ────────────────────────────────────────────────────────

function HousePoolTab() {
  const router = useRouter();
  const [payPeriod, setPayPeriod] = useState<PayPeriod>('biweekly');
  const [staff, setStaff] = useState<HousePoolStaff[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const PAY_PERIODS: { key: PayPeriod; label: string }[] = [
    { key: 'weekly',   label: 'Weekly'    },
    { key: 'biweekly', label: 'Bi-weekly' },
    { key: 'monthly',  label: 'Monthly'   },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        const { data: loc } = await supabase
          .from('locations')
          .select('id, house_pool_balance, house_pool_pay_period')
          .limit(1)
          .single();

        if (!loc) { setLoading(false); return; }
        setBalance(loc.house_pool_balance ?? 0);
        if (loc.house_pool_pay_period) setPayPeriod(loc.house_pool_pay_period as PayPeriod);

        const { data: roles } = await supabase
          .from('house_pool_roles')
          .select('id, staff_member_id, distribution_type, staff_members(name, role)')
          .eq('location_id', loc.id)
          .eq('is_active', true);

        if (roles) {
          setStaff(roles.map(r => ({
            id: r.staff_member_id,
            name: (r.staff_members as any)?.name ?? 'Unknown',
            role: (r.staff_members as any)?.role ?? '',
            distributionType: r.distribution_type as DistributionType,
          })));
        }
      } catch (err) {
        console.log('[HousePoolTab] load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function updateDist(id: string, distributionType: DistributionType) {
    setStaff(prev => prev.map(m => (m.id === id ? { ...m, distributionType } : m)));
  }

  if (loading) return <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <Text style={s.heading}>House Pool Distribution</Text>
      <Text style={s.subtitle}>
        Configure how the house pool is distributed to support staff every{' '}
        {PAY_PERIODS.find(p => p.key === payPeriod)?.label.toLowerCase()} pay period.
      </Text>

      <View style={s.periodRow}>
        <Text style={s.periodLabel}>Pay period:</Text>
        <View style={s.periodPills}>
          {PAY_PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[s.periodPill, payPeriod === p.key && s.periodPillActive]}
              onPress={() => setPayPeriod(p.key)}
              activeOpacity={0.8}>
              <Text style={[s.periodPillText, payPeriod === p.key && s.periodPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.balanceCard}>
        <Text style={s.balanceTitle}>Current Balance</Text>
        <Text style={s.balanceAmount}>${(balance / 100).toFixed(2)}</Text>
        <Text style={s.balanceNext}>Next payout: {nextPayoutDate(payPeriod)}</Text>
        <TouchableOpacity
          style={s.payNowBtn}
          onPress={() => router.push('/(manager)/housepool')}
          activeOpacity={0.8}>
          <Text style={s.payNowText}>Pay Out Now</Text>
        </TouchableOpacity>
      </View>

      {staff.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Staff in House Pool</Text>
          <View style={s.staffCard}>
            {staff.map((member, index) => (
              <View key={member.id} style={[s.staffRow, index < staff.length - 1 && s.staffRowBorder]}>
                <View style={s.staffInfo}>
                  <Text style={s.staffName}>{member.name}</Text>
                  <Text style={s.staffRole}>{member.role}</Text>
                </View>
                <DistributionToggle
                  value={member.distributionType}
                  onChange={v => updateDist(member.id, v)}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function TipPoolSettings() {
  const [activeTab, setActiveTab] = useState<'tipout' | 'house'>('tipout');

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <TabSwitcher active={activeTab} onChange={setActiveTab} />
          {activeTab === 'tipout' ? <TipOutTab /> : <HousePoolTab />}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },

  heading: { fontSize: 24, fontWeight: '800', color: WHITE, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: MUTED, lineHeight: 19, marginBottom: 18 },

  exampleCard: {
    backgroundColor: CARD,
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
  },
  exampleText: { fontSize: 13, color: MUTED, lineHeight: 20 },
  exampleBold: { color: BLUE, fontWeight: '700' },

  rulesCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 14,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  ruleRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  roleInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 0,
  },
  pctWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  pctInput: { fontSize: 14, fontWeight: '700', color: BLUE, minWidth: 30, textAlign: 'right', padding: 0 },
  pctSymbol: { fontSize: 13, fontWeight: '600', color: MUTED },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,77,77,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 13, fontWeight: '800', color: RED },

  addBtn: {
    borderWidth: 1.5,
    borderColor: BLUE,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: BLUE },

  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  summaryRowBorder: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: MUTED, flex: 1 },
  summaryValue: { fontSize: 14, fontWeight: '800', color: WHITE },

  saveBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  periodLabel: { fontSize: 14, fontWeight: '600', color: MUTED },
  periodPills: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 3,
    gap: 3,
  },
  periodPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  periodPillActive: { backgroundColor: BLUE },
  periodPillText: { fontSize: 13, fontWeight: '700', color: MUTED },
  periodPillTextActive: { color: '#ffffff' },

  balanceCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  balanceAmount: { fontSize: 42, fontWeight: '800', color: BLUE, letterSpacing: -1, marginBottom: 6 },
  balanceNext: { fontSize: 13, color: MUTED, marginBottom: 18 },
  payNowBtn: { backgroundColor: AMBER, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  payNowText: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: WHITE, marginBottom: 12 },
  staffCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  staffRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: '700', color: WHITE, marginBottom: 2 },
  staffRole: { fontSize: 12, color: MUTED, fontWeight: '600' },
});
