import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = '#00b880';
const GOLD = '#f5c842';
const GOLD_DIM = '#c9a030';
const MUTED = '#6b7a74';
const BORDER = '#1e3028';

type Challenge = {
  icon: string;
  name: string;
  description: string;
  bonus: string;
  progress: number;
  total: number;
  unit?: string;
  complete: boolean;
};

const CHALLENGES: Challenge[] = [
  {
    icon: '📈',
    name: '20% Club',
    description: 'Hit 20%+ tip average, 3 shifts',
    bonus: '$30',
    progress: 3,
    total: 3,
    unit: 'shifts',
    complete: true,
  },
  {
    icon: '🍷',
    name: 'Upsell Master',
    description: 'Upsell a premium item 3 times',
    bonus: '$25',
    progress: 2,
    total: 3,
    unit: 'upsells',
    complete: false,
  },
  {
    icon: '🍾',
    name: 'Sommelier',
    description: 'Sell 2 bottles of wine',
    bonus: '$20',
    progress: 2,
    total: 2,
    unit: 'bottles',
    complete: true,
  },
  {
    icon: '📅',
    name: 'Full Week',
    description: 'Work all 5 shifts this week',
    bonus: '$20',
    progress: 4,
    total: 5,
    unit: 'shifts',
    complete: false,
  },
];

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const pct = challenge.progress / challenge.total;

  return (
    <View style={[styles.card, challenge.complete && styles.cardComplete]}>
      {challenge.complete && (
        <View style={styles.completeBadge}>
          <Text style={styles.completeBadgeText}>COMPLETE</Text>
        </View>
      )}

      <View style={styles.cardTop}>
        <Text style={styles.cardIcon}>{challenge.icon}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{challenge.name}</Text>
          <Text style={styles.cardDesc}>{challenge.description}</Text>
        </View>
        <Text style={styles.cardBonus}>{challenge.bonus}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct * 100}%` as any },
            challenge.complete && styles.progressFillComplete,
          ]}
        />
      </View>

      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>
          {challenge.progress} / {challenge.total} {challenge.unit}
        </Text>
        <Text style={styles.progressPct}>{Math.round(pct * 100)}%</Text>
      </View>

      {challenge.complete && (
        <View style={styles.completionBar}>
          <Text style={styles.completionText}>
            ✓ Bonus queued for next payout via AptPay!
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const totalPotential = CHALLENGES.reduce(
    (sum, c) => sum + parseInt(c.bonus.replace('$', ''), 10),
    0,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>⚡ Challenges</Text>
          <Text style={styles.screenSubtitle}>
            Bonuses auto-paid via AptPay on completion
          </Text>
        </View>

        {/* Gold info bar */}
        <View style={styles.infoBar}>
          <Text style={styles.infoBarLabel}>Potential bonuses this week</Text>
          <Text style={styles.infoBarAmount}>${totalPotential}</Text>
        </View>

        {/* Challenge cards */}
        {CHALLENGES.map((c) => (
          <ChallengeCard key={c.name} challenge={c} />
        ))}

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

  // Info bar
  infoBar: {
    backgroundColor: '#1c1500',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#3d2e00',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoBarLabel: {
    fontSize: 14,
    color: '#c9a030',
    fontWeight: '600',
  },
  infoBarAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -1,
  },

  // Challenge card
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  cardComplete: {
    borderColor: '#1a3d2e',
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
  cardDesc: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  cardBonus: {
    fontSize: 22,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.5,
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
  progressFillComplete: {
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

  // Complete badge (top-right overlay)
  completeBadge: {
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
  completeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: 0.8,
  },

  // Completion message bar
  completionBar: {
    backgroundColor: '#0a2a1c',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  completionText: {
    fontSize: 13,
    color: TEAL,
    fontWeight: '600',
  },
});
