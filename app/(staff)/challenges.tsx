import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG     = '#09100e';
const CARD   = '#162019';
const TEAL   = '#00e5a0';
const TEAL_DIM = '#00b880';
const GOLD   = '#f5c842';
const MUTED  = '#6b7a74';
const BORDER = '#1e3028';
const LABEL  = '#9db8ad';

type Milestone = {
  icon: string;
  name: string;
  description: string;
  progress: number;
  total: number;
  unit?: string;
  earned: boolean;
  locked: boolean;
};

const MILESTONES: Milestone[] = [
  {
    icon: '🔥',
    name: '3 in a Row',
    description: '3 shifts above 20% back-to-back — you\'re on fire!',
    progress: 3,
    total: 3,
    unit: 'shifts',
    earned: true,
    locked: false,
  },
  {
    icon: '⭐',
    name: 'New Personal Best',
    description: 'Smash your highest tip percentage ever.',
    progress: 1,
    total: 1,
    unit: 'shift',
    earned: true,
    locked: false,
  },
  {
    icon: '📈',
    name: 'Beat Your Average',
    description: 'Finish the week above your personal tip average.',
    progress: 1,
    total: 1,
    unit: 'week',
    earned: false,
    locked: false,
  },
  {
    icon: '🎯',
    name: 'Hit Your Weekly Goal',
    description: 'Reach your personal weekly tip % target.',
    progress: 0,
    total: 1,
    unit: 'week',
    earned: false,
    locked: false,
  },
  {
    icon: '💪',
    name: '5 Shift Streak',
    description: '5 shifts in a row above your personal average.',
    progress: 3,
    total: 5,
    unit: 'shifts',
    earned: false,
    locked: false,
  },
  {
    icon: '🏆',
    name: '10 Shift Streak',
    description: 'The ultimate streak — 10 consecutive above-average shifts.',
    progress: 0,
    total: 10,
    unit: 'shifts',
    earned: false,
    locked: true,
  },
];

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const pct = milestone.progress / milestone.total;

  return (
    <View
      style={[
        styles.card,
        milestone.earned && styles.cardEarned,
        milestone.locked && styles.cardLocked,
      ]}>
      {milestone.earned && (
        <View style={styles.earnedBadge}>
          <Text style={styles.earnedBadgeText}>EARNED</Text>
        </View>
      )}
      {milestone.locked && (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedBadgeText}>🔒 LOCKED</Text>
        </View>
      )}

      <View style={styles.cardTop}>
        <Text style={[styles.cardIcon, milestone.locked && styles.iconLocked]}>
          {milestone.icon}
        </Text>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, milestone.locked && styles.textLocked]}>
            {milestone.name}
          </Text>
          <Text style={[styles.cardDesc, milestone.locked && styles.descLocked]}>
            {milestone.description}
          </Text>
        </View>
      </View>

      {!milestone.locked && (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct * 100}%` as any },
                milestone.earned && styles.progressFillEarned,
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>
              {milestone.progress} / {milestone.total} {milestone.unit}
            </Text>
            <Text style={styles.progressPct}>{Math.round(pct * 100)}%</Text>
          </View>
        </>
      )}

      {milestone.earned && (
        <View style={styles.earnedBar}>
          <Text style={styles.earnedBarText}>
            You've earned an incentive! Your manager has been notified 🎉
          </Text>
        </View>
      )}

      {milestone.locked && (
        <View style={styles.lockedBar}>
          <Text style={styles.lockedBarText}>
            Complete the 5 Shift Streak first to unlock this milestone.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const earnedCount = MILESTONES.filter((m) => m.earned).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>🎯 Milestones</Text>
          <Text style={styles.screenSubtitle}>
            Personal achievements based on your own performance.
          </Text>
        </View>

        {/* Summary bar */}
        <View style={styles.summaryBar}>
          <View>
            <Text style={styles.summaryLabel}>Milestones earned</Text>
            <Text style={styles.summaryValue}>{earnedCount} of {MILESTONES.length}</Text>
          </View>
          <Text style={styles.summaryEmoji}>
            {earnedCount >= MILESTONES.length ? '🏆' : earnedCount > 0 ? '⭐' : '💫'}
          </Text>
        </View>

        {/* Milestone cards */}
        {MILESTONES.map((m) => (
          <MilestoneCard key={m.name} milestone={m} />
        ))}

        {/* Footer message */}
        <View style={styles.footerBar}>
          <Text style={styles.footerText}>
            ✨ Every milestone you hit is a reflection of your own growth. Your manager is notified when you earn an incentive.
          </Text>
        </View>

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
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },

  // Header
  header: {
    marginTop: 8,
    marginBottom: 4,
    gap: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },

  // Summary bar
  summaryBar: {
    backgroundColor: '#0d2a1e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#1a4a2e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 12,
    color: LABEL,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -1,
  },
  summaryEmoji: {
    fontSize: 36,
  },

  // Milestone card
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  cardEarned: {
    borderColor: '#1a4a2e',
    backgroundColor: '#0d1f16',
  },
  cardLocked: {
    opacity: 0.6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIcon: {
    fontSize: 36,
    lineHeight: 42,
  },
  iconLocked: {
    opacity: 0.5,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e8f5ef',
    letterSpacing: -0.2,
  },
  textLocked: {
    color: MUTED,
  },
  cardDesc: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  descLocked: {
    color: '#4a5e58',
  },

  // Progress bar
  progressTrack: {
    height: 7,
    backgroundColor: '#1e3028',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TEAL_DIM,
    borderRadius: 4,
  },
  progressFillEarned: {
    backgroundColor: TEAL,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
    color: MUTED,
  },
  progressPct: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '600',
  },

  // Earned badge (top-right overlay)
  earnedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#0d3324',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: TEAL,
    zIndex: 1,
  },
  earnedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: 0.8,
  },

  // Locked badge
  lockedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#1e3028',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: BORDER,
    zIndex: 1,
  },
  lockedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.5,
  },

  // Earned message bar
  earnedBar: {
    backgroundColor: '#0a2a1c',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  earnedBarText: {
    fontSize: 13,
    color: TEAL,
    fontWeight: '600',
    lineHeight: 18,
  },

  // Locked hint bar
  lockedBar: {
    backgroundColor: '#111e18',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1a2e22',
    marginTop: 4,
  },
  lockedBarText: {
    fontSize: 12,
    color: '#4a5e58',
    fontStyle: 'italic',
  },

  // Footer
  footerBar: {
    backgroundColor: '#0d2a1e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  footerText: {
    fontSize: 13,
    color: '#5fba8a',
    fontWeight: '500',
    lineHeight: 20,
  },
});
