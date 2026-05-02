import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const ORANGE = '#fb923c';
const ORANGE_DIM = 'rgba(249,115,22,0.15)';

const GOAL_TYPES = [
  { key: 'top_sales',       label: 'Top Sales',        icon: '💰' },
  { key: 'most_upsells',    label: 'Most Upsells',     icon: '📈' },
  { key: 'specific_item',   label: 'Specific Item',    icon: '🎯' },
  { key: 'managers_choice', label: "Manager's Choice", icon: '⭐' },
] as const;

type GoalType = typeof GOAL_TYPES[number]['key'];

type ShiftGoal = {
  id: string;
  title: string;
  goal_type: GoalType;
  target_item: string | null;
};

const incentivesEarned = [
  { name: 'Alex Dubois',  milestone: '5 Shift Streak 🔥', date: 'Today' },
  { name: 'Maria Costa',  milestone: 'New Personal Best ⭐', date: 'Yesterday' },
];

const teamLevels = [
  { name: 'Alex Dubois',   level: 'Gold Server ⭐',   pct: 75, next: 'Platinum' },
  { name: 'Maria Costa',   level: 'Silver Server',    pct: 60, next: 'Gold' },
  { name: 'Jordan Lavoie', level: 'Gold Server ⭐',   pct: 40, next: 'Platinum' },
  { name: 'Taylor Nkosi',  level: 'Bronze Server',    pct: 80, next: 'Silver' },
  { name: 'Sam Tremblay',  level: 'Bronze Server',    pct: 30, next: 'Silver' },
];

const activeStreaks = [
  { name: 'Alex Dubois',   shifts: 5 },
  { name: 'Jordan Lavoie', shifts: 3 },
];

const recentMilestones = [
  '🔥 Alex Dubois hit a 5-shift streak',
  '⭐ Maria Costa set a new personal best',
  '🏅 Taylor Nkosi completed 10 shifts',
  '📈 Jordan Lavoie above average 3 shifts in a row',
  '🎯 Sam Tremblay hit Silver tier progress',
  '⭐ Alex Dubois - Diamond Earner badge unlocked',
];

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export default function RewardsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('top_sales');
  const [description, setDescription] = useState('');
  const [targetItem, setTargetItem] = useState('');
  const [saving, setSaving] = useState(false);

  const [todaysGoals, setTodaysGoals] = useState<ShiftGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);

  const fetchTodaysGoals = useCallback(async () => {
    setLoadingGoals(true);
    try {
      const { data: locData } = await supabase
        .from('locations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (!locData) return;

      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('id')
        .eq('location_id', locData.id)
        .eq('date', today());

      if (!shiftsData || shiftsData.length === 0) return;

      const shiftIds = shiftsData.map((s: { id: string }) => s.id);
      const { data: goalsData } = await supabase
        .from('shift_goals')
        .select('id, title, goal_type, target_item')
        .in('shift_id', shiftIds)
        .order('created_at', { ascending: true });

      setTodaysGoals((goalsData ?? []) as ShiftGoal[]);
    } catch (err) {
      console.error('Failed to load shift goals:', err);
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTodaysGoals();
    }, [fetchTodaysGoals])
  );
  useWebFocus(fetchTodaysGoals);

  function openModal() {
    setGoalType('top_sales');
    setDescription('');
    setTargetItem('');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!description.trim()) {
      Alert.alert('Missing description', 'Please describe the goal for your team.');
      return;
    }
    if (goalType === 'specific_item' && !targetItem.trim()) {
      Alert.alert('Missing item', 'Please enter the specific item for this goal.');
      return;
    }

    setSaving(true);
    try {
      const { data: locData } = await supabase
        .from('locations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (!locData) throw new Error('No location found.');

      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('id')
        .eq('location_id', locData.id)
        .eq('date', today())
        .limit(1);

      const shiftId = shiftsData?.[0]?.id ?? null;
      if (!shiftId) {
        Alert.alert(
          'No shift for tonight',
          "Create tonight's shift in the Calculate tab first, then set goals here."
        );
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData?.user?.id ?? null;

      const { error } = await supabase.from('shift_goals').insert({
        shift_id: shiftId,
        location_id: locData.id,
        title: description.trim(),
        goal_type: goalType,
        target_item: goalType === 'specific_item' ? targetItem.trim() : null,
        created_by: createdBy,
      });
      if (error) throw error;

      setModalVisible(false);
      fetchTodaysGoals();
    } catch (err: unknown) {
      Alert.alert('Failed to save', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.title}>Rewards & Incentives</Text>

        {/* ── Shift Goals ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.shiftGoalsHeader}>
            <Text style={styles.cardTitle}>Tonight's Shift Goals</Text>
            <Pressable style={styles.createGoalBtn} onPress={openModal}>
              <Text style={styles.createGoalBtnText}>+ Create</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          {loadingGoals ? (
            <ActivityIndicator color={BLUE} size="small" style={styles.goalsLoader} />
          ) : todaysGoals.length === 0 ? (
            <View style={styles.goalsEmpty}>
              <Text style={styles.goalsEmptyText}>No goals set for tonight yet</Text>
              <Text style={styles.goalsEmptySubtext}>
                Tap + Create to motivate your team with a shift goal
              </Text>
            </View>
          ) : (
            todaysGoals.map((goal, index) => {
              const meta = GOAL_TYPES.find((g) => g.key === goal.goal_type);
              return (
                <View
                  key={goal.id}
                  style={[styles.goalRow, index < todaysGoals.length - 1 && styles.rowBorder]}>
                  <View style={styles.goalIconWrap}>
                    <Text style={styles.goalIcon}>{meta?.icon ?? '🎯'}</Text>
                  </View>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTypeLabel}>{meta?.label ?? goal.goal_type}</Text>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    {goal.target_item ? (
                      <Text style={styles.goalItem}>Item: {goal.target_item}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Incentives Earned — amber border, most important */}
        <View style={styles.amberCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Incentives Earned</Text>
            <View style={styles.amberBadge}>
              <Text style={styles.amberBadgeText}>{incentivesEarned.length} pending</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            These staff members have earned an incentive — you decide the reward
          </Text>

          <View style={styles.divider} />

          {incentivesEarned.map((item, index) => (
            <View
              key={item.name}
              style={[
                styles.incentiveRow,
                index < incentivesEarned.length - 1 && styles.rowBorder,
              ]}>
              <View style={styles.incentiveLeft}>
                <Text style={styles.incentiveName}>{item.name}</Text>
                <Text style={styles.incentiveMilestone}>{item.milestone}</Text>
                <Text style={styles.incentiveDate}>{item.date}</Text>
              </View>
              <Pressable style={styles.deliverBtn}>
                <Text style={styles.deliverBtnText}>Mark as Delivered</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Team Levels */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Team Levels</Text>
          <View style={styles.divider} />

          {teamLevels.map((item, index) => (
            <View
              key={item.name}
              style={[
                styles.levelRow,
                index < teamLevels.length - 1 && styles.rowBorder,
              ]}>
              <View style={styles.levelInfo}>
                <View style={styles.levelNameRow}>
                  <Text style={styles.levelName}>{item.name}</Text>
                  <Text style={styles.levelLabel}>{item.level}</Text>
                </View>
                <View style={styles.levelProgressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${item.pct}%` as any }]} />
                  </View>
                  <Text style={styles.levelNextLabel}>{item.pct}% to {item.next}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Active Streaks */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Active Streaks</Text>
          <View style={styles.divider} />

          {activeStreaks.map((item, index) => (
            <View
              key={item.name}
              style={[
                styles.streakRow,
                index < activeStreaks.length - 1 && styles.rowBorder,
              ]}>
              <View style={styles.streakIcon}>
                <Text style={styles.streakEmoji}>🔥</Text>
              </View>
              <View style={styles.streakInfo}>
                <Text style={styles.streakName}>{item.name}</Text>
                <Text style={styles.streakDesc}>{item.shifts} shifts above personal average</Text>
              </View>
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>×{item.shifts}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Team Milestones This Week */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Team Milestones This Week</Text>
          <View style={styles.milestoneSummary}>
            <Text style={styles.milestoneCount}>6 milestones achieved this week 🎉</Text>
          </View>
          <View style={styles.divider} />

          {recentMilestones.map((item, index) => (
            <View
              key={index}
              style={[
                styles.milestoneRow,
                index < recentMilestones.length - 1 && styles.rowBorder,
              ]}>
              <Text style={styles.milestoneText}>{item}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── Create Shift Goal Modal ─────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Shift Goal</Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Staff will see this goal on login tonight
            </Text>

            {/* Goal type chips */}
            <Text style={styles.fieldLabel}>Goal Type</Text>
            <View style={styles.typeChips}>
              {GOAL_TYPES.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.typeChip, goalType === g.key && styles.typeChipActive]}
                  onPress={() => setGoalType(g.key)}>
                  <Text style={styles.typeChipIcon}>{g.icon}</Text>
                  <Text style={[styles.typeChipText, goalType === g.key && styles.typeChipTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Highest wine sales wins a bonus this shift"
              placeholderTextColor={MUTED}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={140}
            />

            {/* Target item (specific_item only) */}
            {goalType === 'specific_item' && (
              <>
                <Text style={styles.fieldLabel}>Specific Item</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Halibut special, Bottle of Barolo"
                  placeholderTextColor={MUTED}
                  value={targetItem}
                  onChangeText={setTargetItem}
                />
              </>
            )}

            {/* Save */}
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}>
              {saving ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.saveBtnText}>Set Goal for Tonight</Text>
              )}
            </Pressable>

          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },

  // Cards
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  amberCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AMBER_BORDER,
    overflow: 'hidden',
    padding: 18,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 0,
  },
  cardSubtitle: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  amberBadge: {
    backgroundColor: AMBER_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  amberBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: AMBER,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginTop: 14,
    marginHorizontal: 18,
    marginBottom: 0,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  // Shift Goals section
  shiftGoalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 14,
  },
  createGoalBtn: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    marginTop: 14,
  },
  createGoalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BLUE,
  },
  goalsLoader: {
    marginVertical: 20,
  },
  goalsEmpty: {
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 4,
  },
  goalsEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
  goalsEmptySubtext: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  goalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  goalIcon: {
    fontSize: 17,
  },
  goalInfo: {
    flex: 1,
    gap: 2,
  },
  goalTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
    lineHeight: 20,
  },
  goalItem: {
    fontSize: 12,
    color: MUTED,
  },

  // Incentives Earned
  incentiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  incentiveLeft: {
    flex: 1,
    gap: 2,
  },
  incentiveName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  incentiveMilestone: {
    fontSize: 13,
    fontWeight: '600',
    color: AMBER,
  },
  incentiveDate: {
    fontSize: 12,
    color: MUTED,
  },
  deliverBtn: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  deliverBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE,
  },

  // Team Levels
  levelRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  levelInfo: {
    gap: 8,
  },
  levelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  levelLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AMBER,
  },
  levelProgressRow: {
    gap: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(65, 105, 225, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BLUE,
    borderRadius: 3,
  },
  levelNextLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
  },

  // Active Streaks
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  streakIcon: {
    width: 36,
    height: 36,
    backgroundColor: ORANGE_DIM,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakEmoji: {
    fontSize: 18,
  },
  streakInfo: {
    flex: 1,
    gap: 2,
  },
  streakName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  streakDesc: {
    fontSize: 13,
    color: MUTED,
  },
  streakBadge: {
    backgroundColor: ORANGE_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  streakBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: ORANGE,
  },

  // Team Milestones
  milestoneSummary: {
    backgroundColor: BLUE_DIM,
    marginHorizontal: 18,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  milestoneCount: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  milestoneRow: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  milestoneText: {
    fontSize: 14,
    fontWeight: '500',
    color: WHITE,
    lineHeight: 20,
  },

  // ── Create Goal Modal ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 13,
    color: MUTED,
    marginTop: -6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0e1a14',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#0e1a14',
  },
  typeChipActive: {
    backgroundColor: BLUE_DIM,
    borderColor: BLUE_BORDER,
  },
  typeChipIcon: {
    fontSize: 14,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  typeChipTextActive: {
    color: BLUE,
  },
  textInput: {
    backgroundColor: '#0e1a14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: WHITE,
    fontWeight: '500',
    marginTop: -4,
    minHeight: 48,
  },
  saveBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.1,
  },
});
