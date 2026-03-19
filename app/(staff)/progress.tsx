import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG     = '#09100e';
const CARD   = '#162019';
const TEAL   = '#00e5a0';
const GOLD   = '#f5c542';
const MUTED  = '#6b7a74';
const LABEL  = '#9db8ad';
const BORDER = '#1e3028';

// Level thresholds based on personal tip average
const LEVELS = [
  { name: 'Bronze Server', icon: '🥉', min: 0,  max: 15, color: '#cd7f32', nextName: 'Silver Server' },
  { name: 'Silver Server', icon: '🥈', min: 15, max: 18, color: '#b0bec5', nextName: 'Gold Server'   },
  { name: 'Gold Server',   icon: '⭐', min: 18, max: 21, color: '#f5c542', nextName: 'Platinum'      },
  { name: 'Platinum',      icon: '💎', min: 21, max: 24, color: '#7ec8e3', nextName: 'Elite'         },
  { name: 'Elite',         icon: '🏆', min: 24, max: 100, color: '#00e5a0', nextName: null            },
];

function getLevel(avg: number) {
  return LEVELS.find((l) => avg >= l.min && avg < l.max) ?? LEVELS[LEVELS.length - 1];
}

function getLevelProgress(avg: number) {
  const level = getLevel(avg);
  if (level.nextName === null) return 1;
  return (avg - level.min) / (level.max - level.min);
}

// Sample personal data
const MY_AVG         = 22.4;
const PERSONAL_BEST  = 26.1;
const STREAK         = 3;    // shifts in a row above personal average
const WEEKLY_GOAL    = 20;   // personal % target
const WEEKLY_CURRENT = 22.4; // current week average

const RECENT_SHIFTS = [
  { label: 'Mar 9',  pct: 19.2 },
  { label: 'Mar 11', pct: 21.8 },
  { label: 'Mar 13', pct: 24.0 },
  { label: 'Mar 15', pct: 22.4 },
  { label: 'Mar 17', pct: 23.1 },
];

const CHART_MAX = 28;

export default function ProgressScreen() {
  const level         = getLevel(MY_AVG);
  const levelProgress = getLevelProgress(MY_AVG);
  const weeklyProgress = Math.min(WEEKLY_CURRENT / WEEKLY_GOAL, 1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>📈 My Progress</Text>
          <Text style={styles.screenSub}>Your personal journey — every shift counts.</Text>
        </View>

        {/* Level Card */}
        <View style={styles.levelCard}>
          <View style={styles.levelTopRow}>
            <View>
              <Text style={styles.levelLabel}>Current Level</Text>
              <Text style={[styles.levelName, { color: level.color }]}>
                {level.icon} {level.name}
              </Text>
            </View>
            <View style={styles.avgPill}>
              <Text style={styles.avgPillText}>{MY_AVG}% avg</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${levelProgress * 100}%` as any, backgroundColor: level.color },
              ]}
            />
          </View>

          {level.nextName ? (
            <Text style={styles.levelNextText}>
              {(level.max - MY_AVG).toFixed(1)}% more to reach{' '}
              <Text style={{ color: level.color }}>{level.nextName}</Text>. Keep going!
            </Text>
          ) : (
            <Text style={styles.levelNextText}>
              You've reached the top. Incredible work! 🏆
            </Text>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🏅</Text>
            <Text style={styles.statValue}>{PERSONAL_BEST}%</Text>
            <Text style={styles.statLabel}>Personal Best</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🔥</Text>
            <Text style={styles.statValue}>{STREAK} shifts</Text>
            <Text style={styles.statLabel}>Above your avg</Text>
          </View>
        </View>

        {/* Weekly Personal Goal */}
        <View style={styles.card}>
          <View style={styles.goalRow}>
            <Text style={styles.cardTitle}>Weekly Personal Goal</Text>
            <Text style={styles.goalTarget}>{WEEKLY_GOAL}% target</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${weeklyProgress * 100}%` as any }]} />
          </View>
          <Text style={styles.goalMeta}>
            {weeklyProgress >= 1
              ? '🎉 You crushed your goal this week!'
              : `You're at ${WEEKLY_CURRENT}% — ${(WEEKLY_GOAL - WEEKLY_CURRENT).toFixed(1)}% away from your goal. Almost there!`}
          </Text>
        </View>

        {/* Recent Shifts Chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Shifts</Text>
          <Text style={styles.chartSub}>Your last 5 shifts — keep that trend up!</Text>

          <View style={styles.chartArea}>
            {RECENT_SHIFTS.map((s) => {
              const barHeight = Math.max((s.pct / CHART_MAX) * 100, 8);
              const isAboveAvg = s.pct >= MY_AVG;
              return (
                <View key={s.label} style={styles.barCol}>
                  <Text style={styles.barPct}>{s.pct}%</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${barHeight}%` as any,
                          backgroundColor: isAboveAvg ? TEAL : '#2a4a3a',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{s.label}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.chartLegend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Above your average ({MY_AVG}%)</Text>
          </View>
        </View>

        {/* Encouragement footer */}
        <View style={styles.encourageBar}>
          <Text style={styles.encourageText}>
            💪 You're in the top tier of your personal performance. Every shift is an opportunity to set a new best.
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
  headerBlock: {
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
  screenSub: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },

  // Level card
  levelCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: TEAL,
    gap: 12,
  },
  levelTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelLabel: {
    fontSize: 12,
    color: LABEL,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  levelName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  avgPill: {
    backgroundColor: '#0d2a1e',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1a5c3a',
  },
  avgPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: TEAL,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#1e3028',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TEAL,
    borderRadius: 4,
  },
  levelNextText: {
    fontSize: 13,
    color: LABEL,
    lineHeight: 18,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 28,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#e8f5ef',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Generic card
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Weekly goal
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalTarget: {
    fontSize: 14,
    fontWeight: '700',
    color: GOLD,
  },
  goalMeta: {
    fontSize: 13,
    color: LABEL,
    lineHeight: 18,
  },

  // Chart
  chartSub: {
    fontSize: 13,
    color: MUTED,
    marginTop: -4,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 8,
    marginTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    gap: 4,
  },
  barPct: {
    fontSize: 10,
    color: LABEL,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1e3028',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '500',
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TEAL,
  },
  legendText: {
    fontSize: 12,
    color: MUTED,
  },

  // Encouragement
  encourageBar: {
    backgroundColor: '#0d2a1e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  encourageText: {
    fontSize: 13,
    color: '#5fba8a',
    fontWeight: '500',
    lineHeight: 20,
  },
});
