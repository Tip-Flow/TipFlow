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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { calculateTips, Role, TipAllocationResult } from '@/lib/tipCalculator';
import { CSVParseResult } from '@/lib/csvParser';

// ─── Palette ────────────────────────────────────────────────────────────────
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
const RED_DIM = 'rgba(239,68,68,0.12)';

// ─── Defaults (mirrors CLAUDE.md role weight table) ─────────────────────────
const DEFAULT_ROLE_WEIGHTS: Record<Role, number> = {
  server: 0.70,
  bartender: 0.60,
  runner: 0.30,
  host: 0.20,
  kitchen: 0.06,
};

const ROLE_LABELS: Record<Role, string> = {
  server: 'Server',
  bartender: 'Bartender',
  runner: 'Runner',
  host: 'Host',
  kitchen: 'Kitchen',
};

const ROLE_EMOJIS: Record<Role, string> = {
  server: '🍽️',
  bartender: '🍸',
  runner: '🏃',
  host: '🚪',
  kitchen: '👨‍🍳',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface StaffRow {
  id: string;
  name: string;
  role: Role;
  location_id: string;
}

interface StaffEntry extends StaffRow {
  hoursWorked: string; // string for input state
  included: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function CalculateScreen() {
  const router = useRouter();
  const { csvData } = useLocalSearchParams<{ csvData?: string }>();

  // Shift details
  const [shiftName, setShiftName] = useState('');
  const [shiftDate, setShiftDate] = useState(today());
  const [totalTipsDollars, setTotalTipsDollars] = useState('');
  const [totalSalesDollars, setTotalSalesDollars] = useState('');

  // Staff
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [csvImported, setCsvImported] = useState(false);

  // Results
  const [results, setResults] = useState<TipAllocationResult[] | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Fetch staff on mount ───────────────────────────────────────────────────
  useEffect(() => {
    async function fetchStaff() {
      setLoadingStaff(true);
      try {
        // Use first available location (same pattern as home.tsx)
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

        let entries: StaffEntry[] = (staffData ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          role: (s.role as Role) ?? 'server',
          location_id: s.location_id,
          hoursWorked: '',
          included: true,
        }));

        // ── Apply CSV pre-fill if navigated from CSV import ────────────────
        if (csvData) {
          try {
            const parsed: CSVParseResult = JSON.parse(csvData);

            // Pre-fill totalTips / totalSales
            if (parsed.totalTips !== null && parsed.totalTips > 0) {
              setTotalTipsDollars(centsToDisplay(parsed.totalTips));
            }
            if (parsed.totalSales !== null && parsed.totalSales > 0) {
              setTotalSalesDollars(centsToDisplay(parsed.totalSales));
            }

            // Match CSV rows to Supabase staff by name (case-insensitive)
            // and pre-fill hours. Unmatched CSV rows are ignored (manager
            // can still add hours manually for any staff not in the CSV).
            entries = entries.map((entry) => {
              const match = parsed.rows.find(
                (row) => row.name.toLowerCase() === entry.name.toLowerCase(),
              );
              if (match && match.hoursWorked > 0) {
                return { ...entry, hoursWorked: String(match.hoursWorked) };
              }
              return entry;
            });

            setCsvImported(true);
          } catch {
            // Malformed param — ignore silently, fall through to manual entry
          }
        }

        setStaff(entries);
      } catch (err) {
        console.error('Failed to load staff:', err);
      } finally {
        setLoadingStaff(false);
      }
    }
    fetchStaff();
  }, []);

  // ── Staff update helpers ───────────────────────────────────────────────────
  function updateHours(id: string, value: string) {
    if (/^\d{0,2}(\.\d{0,2})?$/.test(value)) {
      setStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, hoursWorked: value } : s)),
      );
    }
  }

  function toggleIncluded(id: string) {
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s)),
    );
    setResults(null);
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  function handleCalculate() {
    const totalTipsCents = dollarsToCents(totalTipsDollars);

    if (!shiftName.trim()) {
      Alert.alert('Missing info', 'Please enter a shift name.');
      return;
    }
    if (totalTipsCents <= 0) {
      Alert.alert('Missing info', 'Please enter total tips greater than $0.');
      return;
    }

    const activeStaff = staff.filter((s) => s.included);
    if (activeStaff.length === 0) {
      Alert.alert('No staff', 'Include at least one staff member.');
      return;
    }

    const missingHours = activeStaff.filter(
      (s) => !s.hoursWorked || parseFloat(s.hoursWorked) <= 0,
    );
    if (missingHours.length > 0) {
      Alert.alert(
        'Missing hours',
        `Enter hours worked for: ${missingHours.map((s) => s.name).join(', ')}`,
      );
      return;
    }

    try {
      const staffInput = activeStaff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        hoursWorked: parseFloat(s.hoursWorked),
      }));

      const result = calculateTips(totalTipsCents, staffInput, DEFAULT_ROLE_WEIGHTS);
      setResults(result.allocations);
    } catch (err: unknown) {
      Alert.alert('Calculation error', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Save & pay out ────────────────────────────────────────────────────────
  async function handleSaveAndPayout() {
    if (!results || !locationId) return;

    const totalTipsCents = dollarsToCents(totalTipsDollars);
    const totalSalesCents = dollarsToCents(totalSalesDollars);

    setSaving(true);
    try {
      // Insert shift
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

      // Insert tip allocations
      const allocations = results.map((r) => {
        const staffEntry = staff.find((s) => s.id === r.staffId);
        return {
          shift_id: shiftData.id,
          staff_id: r.staffId,
          hours_worked: r.hoursWorked,
          role_weight: DEFAULT_ROLE_WEIGHTS[r.role] ?? 0,
          calculated_amount: r.calculatedAmount,
        };
      });

      const { error: allocError } = await supabase
        .from('tip_allocations')
        .insert(allocations);

      if (allocError) throw allocError;

      Alert.alert('Saved!', 'Shift and tip allocations have been saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

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
            <Text style={styles.subtitle}>Enter shift details and staff hours</Text>
          </View>

          {/* CSV import banner */}
          {csvImported && (
            <View style={styles.csvBanner}>
              <Text style={styles.csvBannerText}>
                CSV imported — hours and totals pre-filled. Adjust anything before calculating.
              </Text>
            </View>
          )}

          {/* Shift Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shift Details</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Shift Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Friday Dinner"
                placeholderTextColor={MUTED}
                value={shiftName}
                onChangeText={(t) => { setShiftName(t); setResults(null); }}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                style={styles.textInput}
                value={shiftDate}
                onChangeText={(t) => { setShiftDate(t); setResults(null); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={MUTED}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Total Tips ($)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={MUTED}
                value={totalTipsDollars}
                onChangeText={(t) => { setTotalTipsDollars(t); setResults(null); }}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Total Sales ($)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={MUTED}
                value={totalSalesDollars}
                onChangeText={(t) => { setTotalSalesDollars(t); setResults(null); }}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Staff Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Staff on Shift</Text>

            {loadingStaff ? (
              <ActivityIndicator color={TEAL} style={{ marginVertical: 20 }} />
            ) : staff.length === 0 ? (
              <Text style={styles.emptyText}>
                No staff found. Add staff members in the Staff tab.
              </Text>
            ) : (
              staff.map((s, index) => (
                <View key={s.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={[styles.staffRow, !s.included && styles.staffRowMuted]}>
                    {/* Name + role */}
                    <View style={styles.staffInfo}>
                      <Text style={[styles.staffName, !s.included && { color: MUTED }]}>
                        {ROLE_EMOJIS[s.role]} {s.name}
                      </Text>
                      <Text style={styles.staffRole}>{ROLE_LABELS[s.role]}</Text>
                    </View>

                    {/* Hours input */}
                    <TextInput
                      style={[
                        styles.hoursInput,
                        !s.included && styles.hoursInputDisabled,
                      ]}
                      placeholder="hrs"
                      placeholderTextColor={MUTED}
                      value={s.hoursWorked}
                      onChangeText={(t) => { updateHours(s.id, t); setResults(null); }}
                      keyboardType="decimal-pad"
                      editable={s.included}
                    />

                    {/* Include toggle */}
                    <Switch
                      value={s.included}
                      onValueChange={() => toggleIncluded(s.id)}
                      trackColor={{ false: BORDER, true: TEAL_DIM }}
                      thumbColor={s.included ? TEAL : MUTED}
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Calculate Button */}
          <TouchableOpacity
            style={styles.calcBtn}
            onPress={handleCalculate}
            activeOpacity={0.8}>
            <Text style={styles.calcBtnText}>Calculate</Text>
          </TouchableOpacity>

          {/* Results */}
          {results && results.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Results</Text>

              {results.map((r, index) => {
                const totalSalesCents = dollarsToCents(totalSalesDollars);
                const tipPctOfSales =
                  totalSalesCents > 0
                    ? ((r.calculatedAmount / totalSalesCents) * 100).toFixed(1)
                    : '—';

                return (
                  <View
                    key={r.staffId}
                    style={[
                      styles.resultCard,
                      index < results.length - 1 && styles.resultCardBorder,
                    ]}>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{r.name}</Text>
                      <Text style={styles.resultMeta}>
                        {r.hoursWorked}h · {ROLE_LABELS[r.role]} · {tipPctOfSales}% of sales
                      </Text>
                    </View>
                    <Text style={styles.resultAmount}>
                      ${centsToDisplay(r.calculatedAmount)}
                    </Text>
                  </View>
                );
              })}

              {/* Totals row */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total distributed</Text>
                <Text style={styles.totalAmount}>
                  ${centsToDisplay(dollarsToCents(totalTipsDollars))}
                </Text>
              </View>

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

// ─── Styles ──────────────────────────────────────────────────────────────────
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
    paddingBottom: 48,
    gap: 20,
  },

  // Header
  header: {
    gap: 4,
  },
  backBtn: {
    marginBottom: 8,
  },
  backText: {
    fontSize: 15,
    color: TEAL,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
  },

  // CSV banner
  csvBanner: {
    backgroundColor: AMBER_DIM,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  csvBannerText: {
    fontSize: 13,
    color: AMBER,
    lineHeight: 18,
    fontWeight: '500',
  },

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
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 16,
  },

  // Field row
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
    flex: 1,
  },
  textInput: {
    fontSize: 15,
    fontWeight: '600',
    color: TEAL,
    textAlign: 'right',
    minWidth: 100,
    padding: 0,
  },

  // Staff rows
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  staffRowMuted: {
    opacity: 0.45,
  },
  staffInfo: {
    flex: 1,
    gap: 2,
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  staffRole: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
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
  hoursInputDisabled: {
    color: MUTED,
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    paddingHorizontal: 16,
    paddingVertical: 20,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Calculate button
  calcBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  calcBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#09100e',
    letterSpacing: 0.2,
  },

  // Results section
  resultsSection: {
    gap: 2,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  resultInfo: {
    flex: 1,
    gap: 3,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  resultMeta: {
    fontSize: 12,
    color: MUTED,
  },
  resultAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -0.5,
  },
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
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: TEAL,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: TEAL,
  },

  // Save & Pay Out button
  payoutBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payoutBtnDisabled: {
    opacity: 0.6,
  },
  payoutBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#09100e',
    letterSpacing: 0.2,
  },
});
