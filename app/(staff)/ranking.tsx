import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG    = '#09100e';
const CARD  = '#162019';
const TEAL  = '#00e5a0';
const GOLD  = '#f5c542';
const SILVER = '#b0bec5';
const BRONZE = '#cd7f32';
const MUTED = '#6b7a74';
const LABEL = '#9db8ad';
const BORDER = '#1e3028';

const STAFF = [
  { rank: 1,  medal: '🥇', name: 'Alex Dubois',    role: 'Server',    pct: '22.4%', streak: 5,  initials: 'AD', color: '#1a5c3a', isYou: true  },
  { rank: 2,  medal: '🥈', name: 'Maria Costa',    role: 'Server',    pct: '21.1%', streak: 3,  initials: 'MC', color: '#1a3a5c', isYou: false },
  { rank: 3,  medal: '🥉', name: 'Jordan Lavoie',  role: 'Bartender', pct: '19.8%', streak: 0,  initials: 'JL', color: '#3a1a5c', isYou: false },
  { rank: 4,  medal: null, name: 'Taylor Nkosi',   role: 'Runner',    pct: '17.2%', streak: 2,  initials: 'TN', color: '#5c3a1a', isYou: false },
  { rank: 5,  medal: null, name: 'Sam Tremblay',   role: 'Host',      pct: '15.8%', streak: 0,  initials: 'ST', color: '#1a4a3a', isYou: false },
];

function pctColor(rank: number) {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return LABEL;
}

export default function RankingScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>🏆 Leaderboard</Text>
          <Text style={styles.screenSub}>Ranked by tip %. Resets Sunday.</Text>
        </View>

        {/* Team Goal Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalRow}>
            <Text style={styles.goalTitle}>Team Goal — <Text style={styles.goalDays}>2 days left</Text></Text>
            <Text style={styles.goalReward}>$20 each</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '79%' }]} />
          </View>
          <Text style={styles.goalMeta}>$11,840 of $15,000 · Keep pushing!</Text>
        </View>

        {/* Leaderboard */}
        <View style={styles.listCard}>
          {STAFF.map((s, i) => (
            <View key={s.name}>
              {i > 0 && <View style={styles.sep} />}
              <View style={[styles.staffRow, s.isYou && styles.staffRowYou]}>

                {/* Rank indicator */}
                <View style={styles.rankCol}>
                  {s.medal ? (
                    <Text style={styles.medal}>{s.medal}</Text>
                  ) : (
                    <Text style={styles.rankNum}>{s.rank}</Text>
                  )}
                </View>

                {/* Initials circle */}
                <View style={[styles.initialsCircle, { backgroundColor: s.color }]}>
                  <Text style={styles.initialsText}>{s.initials}</Text>
                </View>

                {/* Name + role + streak */}
                <View style={styles.nameCol}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.staffName, s.isYou && styles.staffNameYou]}>{s.name}</Text>
                    {s.isYou && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>YOU</Text>
                      </View>
                    )}
                    {s.streak > 0 && (
                      <View style={styles.streakBadge}>
                        <Text style={styles.streakText}>🔥×{s.streak}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.staffRole}>{s.role}</Text>
                </View>

                {/* Tip % */}
                <Text style={[styles.tipPct, { color: pctColor(s.rank) }]}>{s.pct}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Info bar */}
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            🏅 Stay #1 through Sunday to earn the $25 Top Earner bonus
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

  // Team goal card
  goalCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: TEAL,
    gap: 10,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e8f5ef',
  },
  goalDays: {
    color: TEAL,
  },
  goalReward: {
    fontSize: 16,
    fontWeight: '800',
    color: GOLD,
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
  goalMeta: {
    fontSize: 13,
    color: LABEL,
    fontWeight: '500',
  },

  // Staff list card
  listCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  sep: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 16,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  staffRowYou: {
    borderWidth: 1.5,
    borderColor: TEAL,
    borderRadius: 12,
    margin: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0d2a1e',
  },

  // Rank
  rankCol: {
    width: 28,
    alignItems: 'center',
  },
  medal: {
    fontSize: 22,
  },
  rankNum: {
    fontSize: 16,
    fontWeight: '700',
    color: MUTED,
  },

  // Initials
  initialsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Name col
  nameCol: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e8f5ef',
  },
  staffNameYou: {
    color: TEAL,
  },
  staffRole: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },

  // YOU badge
  youBadge: {
    backgroundColor: TEAL,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#09100e',
    letterSpacing: 0.5,
  },

  // Streak badge
  streakBadge: {
    backgroundColor: '#2a1e0a',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
  },

  // Tip %
  tipPct: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Info bar
  infoBar: {
    backgroundColor: '#1f1500',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#3d2e00',
  },
  infoText: {
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
    lineHeight: 18,
  },
});
