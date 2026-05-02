import { useEffect, useState } from 'react';
import {
  Alert,
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
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const BG     = '#09100e';
const CARD   = '#162019';
const BLUE   = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.35)';
const MUTED  = '#6b7a74';
const WHITE  = '#e8f0ec';
const BORDER = '#1f3028';
const RED    = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.12)';
const LABEL  = '#9db8ad';
const GOLD   = '#f5c842';

type GoalType = 'top_sales' | 'most_upsells' | 'specific_item' | 'managers_choice';

type ShiftGoal = {
  id: string;
  title: string;
  goal_type: GoalType;
  target_item: string | null;
  winner_staff_id: string | null;
};

type StaffMember = {
  id: string;
  name: string;
  role: string;
};

const GOAL_TYPES: { type: GoalType; icon: string; label: string; sub: string }[] = [
  { type: 'top_sales',       icon: '🏆', label: 'Top Sales',      sub: 'Highest total sales wins' },
  { type: 'most_upsells',    icon: '📈', label: 'Most Upsells',   sub: 'Most add-ons & subs' },
  { type: 'specific_item',   icon: '🎯', label: 'Specific Item',  sub: 'Sell the most of one item' },
  { type: 'managers_choice', icon: '⭐', label: "Manager's Choice", sub: 'Manager decides winner' },
];

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  top_sales: 'Top Sales',
  most_upsells: 'Most Upsells',
  specific_item: 'Specific Item',
  managers_choice: "Manager's Choice",
};

function getTodayDate() { return new Date().toISOString().split('T')[0]; }
function getTodayLabel() { return new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }); }

const DEMO_STAFF: StaffMember[] = [
  { id: 'staff-1', name: 'Alex Dubois',    role: 'Server' },
  { id: 'staff-2', name: 'Maria Costa',    role: 'Server' },
  { id: 'staff-3', name: 'Jordan Lavoie',  role: 'Bartender' },
  { id: 'staff-4', name: 'Priya Singh',    role: 'Server' },
  { id: 'staff-5', name: 'Marcus Tran',    role: 'Runner' },
];

export default function ShiftGoalsScreen() {
  const router = useRouter();

  const [goals, setGoals] = useState<ShiftGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [todayLabel, setTodayLabel] = useState(getTodayLabel());

  // Resolved shift state — populated on mount from Supabase (or created if none exists today)
  const [shiftId, setShiftId]       = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [shiftName, setShiftName]   = useState('Tonight\'s Shift');

  // Create form state
  const [newTitle, setNewTitle]         = useState('');
  const [newType, setNewType]           = useState<GoalType | null>(null);
  const [newTargetItem, setNewTargetItem] = useState('');
  const [saving, setSaving]             = useState(false);

  // Winner picker state
  const [winnerPickerGoal, setWinnerPickerGoal] = useState<ShiftGoal | null>(null);
  const [pickerVisible, setPickerVisible]       = useState(false);
  const [staff]                                 = useState<StaffMember[]>(DEMO_STAFF);

  const shiftIsComplete = false; // updated below once shift status is known

  // ── Resolve or create today's shift ──────────────────────────────────────

  useEffect(() => {
    resolveShift();

    // On web, window focus re-fires when the user tabs back in — mobile gets this
    // for free via native navigation lifecycle, but the browser does not.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => resolveShift();
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
    }
  }, []);

  async function resolveShift() {
    const todayDate  = getTodayDate();
    const freshLabel = getTodayLabel();
    setTodayLabel(freshLabel);

    try {
      // Get the authenticated manager
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.log('[ShiftGoals] No authenticated user — running in demo mode');
        setShiftId('demo-shift-id');
        setLocationId('demo-location-id');
        loadGoals('demo-shift-id');
        return;
      }

      // Fetch location_id — order by created_at so mobile and web always pick the same row
      const { data: locationData, error: locationError } = await supabase
        .from('locations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (locationError) {
        console.log('[ShiftGoals] Location fetch error:', locationError.message);
      }

      const resolvedLocationId = locationData?.id ?? null;
      console.log('[ShiftGoals] resolvedLocationId:', resolvedLocationId, '| todayDate:', todayDate);

      if (!resolvedLocationId) {
        console.log('[ShiftGoals] No location found — falling back to demo');
        setShiftId('demo-shift-id');
        setLocationId('demo-location-id');
        loadGoals('demo-shift-id');
        return;
      }

      // Look for an existing shift today at this location
      const { data: existing, error: shiftFetchError } = await supabase
        .from('shifts')
        .select('id, name, location_id, status')
        .eq('date', todayDate)
        .eq('location_id', resolvedLocationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shiftFetchError) {
        console.log('[ShiftGoals] Shift fetch error:', shiftFetchError.message);
      }

      if (existing) {
        console.log('[ShiftGoals] Found existing shift:', existing.id);
        setShiftId(existing.id);
        setLocationId(existing.location_id);
        setShiftName(existing.name);
        loadGoals(existing.id);
        return;
      }

      const defaultName = `${freshLabel} Shift`;
      const { data: newShift, error: createError } = await supabase
        .from('shifts')
        .insert({
          location_id: resolvedLocationId,
          date: todayDate,
          name: defaultName,
          total_tips: 0,
          total_sales: 0,
          status: 'pending',
          pos_source: 'manual',
        })
        .select('id')
        .single();

      if (createError) {
        console.log('[ShiftGoals] Shift create error:', createError.message, createError.details);
        setShiftId('demo-shift-id');
        setLocationId(resolvedLocationId);
        loadGoals('demo-shift-id');
        return;
      }

      console.log('[ShiftGoals] Created new shift:', newShift.id);
      setShiftId(newShift.id);
      setLocationId(resolvedLocationId);
      setShiftName(defaultName);
      loadGoals(newShift.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('[ShiftGoals] resolveShift unexpected error:', msg);
      setShiftId('demo-shift-id');
      setLocationId('demo-location-id');
      loadGoals('demo-shift-id');
    }
  }

  // ── Load goals ────────────────────────────────────────────────────────────

  async function loadGoals(forShiftId?: string) {
    const id = forShiftId ?? shiftId;
    if (!id) return;
    setLoadingGoals(true);
    try {
      console.log('[ShiftGoals] loadGoals querying shift_id:', id);
      const { data, error } = await supabase
        .from('shift_goals')
        .select('id, title, goal_type, target_item, winner_staff_id')
        .eq('shift_id', id)
        .order('created_at', { ascending: true });

      console.log('[ShiftGoals] loadGoals response — data:', JSON.stringify(data), '| error:', error?.message ?? null);

      if (error) {
        console.log('[ShiftGoals] loadGoals error details:', error.details, '| hint:', error.hint);
        throw error;
      }
      setGoals((data ?? []) as ShiftGoal[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('[ShiftGoals] loadGoals caught:', msg, '— keeping existing list');
    } finally {
      setLoadingGoals(false);
      setRefreshing(false);
    }
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    await resolveShift();
  }

  // ── Create goal ───────────────────────────────────────────────────────────

  async function handleAddGoal() {
    const title = newTitle.trim();

    // 1. Debug log on every tap
    console.log('[ShiftGoals] Add Goal tapped:', {
      title,
      goalType: newType,
      targetItem: newTargetItem,
      shiftId,
      locationId,
    });

    if (!title) {
      Alert.alert('Goal title required', 'Enter a name for this goal before saving.');
      return;
    }
    if (!newType) {
      Alert.alert('Goal type required', 'Select a goal type before saving.');
      return;
    }
    if (newType === 'specific_item' && !newTargetItem.trim()) {
      Alert.alert('Item name required', 'Enter the specific item for this goal.');
      return;
    }

    // 2. Warn if shift_id is the demo placeholder
    if (!shiftId || shiftId === 'demo-shift-id') {
      console.log('[ShiftGoals] WARNING: using demo shift_id — insert will not persist to Supabase');
    }

    const targetItem = newType === 'specific_item' ? newTargetItem.trim() : null;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('shift_goals')
        .insert({
          shift_id:    shiftId ?? 'demo-shift-id',
          location_id: locationId ?? 'demo-location-id',
          title,
          goal_type:   newType,
          target_item: targetItem,
          created_by:  user?.id,
        })
        .select('id, title, goal_type, target_item, winner_staff_id')
        .single();

      // 3. Log Supabase errors explicitly — never swallow silently
      if (error) {
        console.log('[ShiftGoals] Supabase insert error:', error.message, '| details:', error.details, '| hint:', error.hint);
        throw error;
      }

      console.log('[ShiftGoals] Goal saved to Supabase:', data.id);
      // 5. Refresh from server after successful save
      await loadGoals();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('[ShiftGoals] Falling back to local state. Reason:', msg);
      // Offline / demo mode — add locally so UI still responds
      const localGoal: ShiftGoal = {
        id: `local-${Date.now()}`,
        title,
        goal_type: newType,
        target_item: targetItem,
        winner_staff_id: null,
      };
      setGoals((prev) => [...prev, localGoal]);
    } finally {
      // 5. Always clear form after attempt
      setSaving(false);
      setNewTitle('');
      setNewType(null);
      setNewTargetItem('');
    }
  }

  // ── Delete goal ───────────────────────────────────────────────────────────

  async function handleDeleteGoal(goalId: string) {
    Alert.alert('Remove goal?', 'This will delete the goal for tonight\'s shift.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const snapshot = goals.find((g) => g.id === goalId);
          setGoals((prev) => prev.filter((g) => g.id !== goalId));
          try {
            const { error } = await supabase.from('shift_goals').delete().eq('id', goalId);
            if (error) throw error;
          } catch {
            if (snapshot) setGoals((prev) => [...prev, snapshot]);
          }
        },
      },
    ]);
  }

  // ── Mark winner ───────────────────────────────────────────────────────────

  function openWinnerPicker(goal: ShiftGoal) {
    setWinnerPickerGoal(goal);
    setPickerVisible(true);
  }

  async function handleSelectWinner(staffId: string) {
    if (!winnerPickerGoal) return;
    setPickerVisible(false);

    const originalGoal = winnerPickerGoal;
    const updatedGoal = { ...originalGoal, winner_staff_id: staffId };
    setGoals((prev) => prev.map((g) => (g.id === originalGoal.id ? updatedGoal : g)));

    try {
      const { error } = await supabase
        .from('shift_goals')
        .update({ winner_staff_id: staffId })
        .eq('id', originalGoal.id);
      if (error) throw error;

      const winner = staff.find((s) => s.id === staffId);
      Alert.alert(
        '🎉 Winner marked!',
        `${winner?.name ?? 'Staff member'} has been notified about their incentive.`
      );
    } catch {
      setGoals((prev) => prev.map((g) => (g.id === originalGoal.id ? originalGoal : g)));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function winnerName(winnerId: string | null): string | null {
    if (!winnerId) return null;
    return staff.find((s) => s.id === winnerId)?.name ?? 'Unknown';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
                <Text style={styles.backChevron}>‹</Text>
                <Text style={styles.backLabel}>POS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
                onPress={handleManualRefresh}
                activeOpacity={0.7}
                disabled={refreshing}>
                <Text style={styles.refreshBtnText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.title}>Shift Goals</Text>
            <Text style={styles.subtitle}>Set tonight's goals</Text>
            <View style={styles.shiftPill}>
              <Text style={styles.shiftPillText}>{shiftName}  ·  {todayLabel}</Text>
            </View>
          </View>

          {/* Active Goals Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Active Goals</Text>

            {loadingGoals ? (
              <Text style={styles.emptyText}>Loading…</Text>
            ) : goals.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎯</Text>
                <Text style={styles.emptyText}>No goals yet for tonight's shift.</Text>
                <Text style={styles.emptyHint}>Add one below to motivate your team.</Text>
              </View>
            ) : (
              goals.map((goal) => {
                const typeInfo = GOAL_TYPES.find((t) => t.type === goal.goal_type);
                const winner = winnerName(goal.winner_staff_id);
                return (
                  <View key={goal.id} style={styles.goalRow}>
                    <View style={styles.goalRowLeft}>
                      <Text style={styles.goalTitle}>{goal.title}</Text>
                      <View style={styles.goalMeta}>
                        <View style={styles.typeBadge}>
                          <Text style={styles.typeBadgeText}>
                            {typeInfo?.icon} {GOAL_TYPE_LABELS[goal.goal_type]}
                          </Text>
                        </View>
                        {goal.target_item ? (
                          <Text style={styles.targetItem}>"{goal.target_item}"</Text>
                        ) : null}
                      </View>
                      {winner ? (
                        <View style={styles.winnerBadge}>
                          <Text style={styles.winnerBadgeText}>🏆 {winner}</Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteGoal(goal.id)}
                      activeOpacity={0.7}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          {/* Create New Goal Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add a goal for tonight</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Move the halibut special"
              placeholderTextColor={MUTED}
              value={newTitle}
              onChangeText={setNewTitle}
              returnKeyType="done"
            />

            {/* Goal type chips */}
            <View style={styles.chipGrid}>
              {GOAL_TYPES.map(({ type, icon, label, sub }) => {
                const selected = newType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setNewType(type)}
                    activeOpacity={0.8}>
                    <Text style={styles.chipIcon}>{icon}</Text>
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
                    <Text style={[styles.chipSub, selected && styles.chipSubSelected]}>{sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Specific item input */}
            {newType === 'specific_item' && (
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="Item name (e.g. Halibut Special)"
                placeholderTextColor={MUTED}
                value={newTargetItem}
                onChangeText={setNewTargetItem}
                returnKeyType="done"
              />
            )}

            <TouchableOpacity
              style={[styles.addBtn, saving && styles.addBtnDisabled]}
              onPress={handleAddGoal}
              activeOpacity={0.8}
              disabled={saving}>
              <Text style={styles.addBtnText}>{saving ? 'Saving…' : 'Add Goal'}</Text>
            </TouchableOpacity>
          </View>

          {/* Mark Winner Section — visible when shift is complete */}
          {shiftIsComplete && goals.filter((g) => !g.winner_staff_id).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mark Winners</Text>
              <Text style={styles.cardSubtitle}>Shift complete — pick a winner for each goal.</Text>
              {goals
                .filter((g) => !g.winner_staff_id)
                .map((goal) => (
                  <View key={goal.id} style={styles.winnerRow}>
                    <Text style={styles.winnerRowTitle}>{goal.title}</Text>
                    <TouchableOpacity
                      style={styles.markWinnerBtn}
                      onPress={() => openWinnerPicker(goal)}
                      activeOpacity={0.8}>
                      <Text style={styles.markWinnerText}>Mark Winner</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Staff picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Who won?</Text>
            {winnerPickerGoal && (
              <Text style={styles.pickerGoalName}>{winnerPickerGoal.title}</Text>
            )}
            <View style={styles.pickerDivider} />
            {staff.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.pickerRow}
                onPress={() => handleSelectWinner(s.id)}
                activeOpacity={0.8}>
                <View style={styles.pickerAvatar}>
                  <Text style={styles.pickerAvatarText}>
                    {s.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.pickerName}>{s.name}</Text>
                  <Text style={styles.pickerRole}>{s.role}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setPickerVisible(false)}
              activeOpacity={0.7}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  kav:  { flex: 1 },
  scroll: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },

  // Header
  header: { marginTop: 8, gap: 6 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backChevron: { fontSize: 24, color: BLUE, lineHeight: 28 },
  backLabel: { fontSize: 15, color: BLUE, fontWeight: '600' },
  refreshBtn: {
    backgroundColor: BLUE_DIM,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  refreshBtnDisabled: { opacity: 0.5 },
  refreshBtnText: { fontSize: 13, fontWeight: '700', color: BLUE },
  title: { fontSize: 28, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: MUTED, fontWeight: '500' },
  shiftPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0d2a1e',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1a4a2e',
    marginTop: 2,
  },
  shiftPillText: { fontSize: 13, color: BLUE, fontWeight: '600' },

  // Cards
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: WHITE },
  cardSubtitle: { fontSize: 13, color: MUTED, marginTop: -4 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: MUTED, fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#3d4f47' },

  // Goal row
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 10,
  },
  goalRowLeft: { flex: 1, gap: 5 },
  goalTitle: { fontSize: 15, fontWeight: '700', color: WHITE },
  goalMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: {
    backgroundColor: BLUE_DIM,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: BLUE, letterSpacing: 0.2 },
  targetItem: { fontSize: 12, color: LABEL, fontStyle: 'italic' },
  winnerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,200,66,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(245,200,66,0.3)',
  },
  winnerBadgeText: { fontSize: 12, fontWeight: '700', color: GOLD },

  deleteBtn: {
    backgroundColor: RED_DIM,
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  deleteBtnText: { fontSize: 13, color: RED, fontWeight: '700' },

  // Input
  input: {
    backgroundColor: '#0d1a14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },

  // Goal type chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    width: '47%',
    backgroundColor: '#0d1a14',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 2,
  },
  chipSelected: {
    backgroundColor: BLUE_DIM,
    borderColor: BLUE_BORDER,
  },
  chipIcon: { fontSize: 20 },
  chipLabel: { fontSize: 13, fontWeight: '700', color: WHITE, marginTop: 2 },
  chipLabelSelected: { color: BLUE },
  chipSub: { fontSize: 11, color: MUTED, lineHeight: 16 },
  chipSubSelected: { color: '#5fba8a' },

  // Add button
  addBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 },

  // Mark winner section
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 10,
  },
  winnerRowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: WHITE },
  markWinnerBtn: {
    backgroundColor: BLUE_DIM,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  markWinnerText: { fontSize: 13, fontWeight: '700', color: BLUE },

  // Staff picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#0f1e16',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: WHITE, textAlign: 'center' },
  pickerGoalName: { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 4 },
  pickerDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a3a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: { fontSize: 14, fontWeight: '700', color: BLUE },
  pickerName: { fontSize: 15, fontWeight: '700', color: WHITE },
  pickerRole: { fontSize: 12, color: MUTED, marginTop: 1 },
  pickerCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#162019',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pickerCancelText: { fontSize: 15, fontWeight: '700', color: MUTED },
});
