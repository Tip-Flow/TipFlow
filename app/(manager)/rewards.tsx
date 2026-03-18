import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const TEAL_BORDER = 'rgba(0,229,160,0.4)';
const GOLD = '#f59e0b';
const GOLD_DIM = 'rgba(245,158,11,0.15)';
const GOLD_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

const leaderboard = [
  { rank: 1, medal: '🥇', name: 'Alex Dubois',   pct: '22.4%', streak: 5 },
  { rank: 2, medal: '🥈', name: 'Maria Costa',   pct: '21.1%', streak: 3 },
  { rank: 3, medal: '🥉', name: 'Jordan Lavoie', pct: '19.8%', streak: 0 },
  { rank: 4, medal: null, name: 'Taylor Nkosi',  pct: '17.2%', streak: 2 },
  { rank: 5, medal: null, name: 'Sam Tremblay',  pct: '15.8%', streak: 0 },
];

const bonusRules = [
  { label: 'Top tip % each week earns $10',       enabled: true  },
  { label: 'Streak of 3+ shifts earns $5 bonus',  enabled: true  },
  { label: 'Perfect attendance adds $15 bonus',   enabled: false },
  { label: 'New hire first shift bonus $10',       enabled: true  },
];

export default function RewardsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Rewards</Text>
          <TouchableOpacity style={styles.bonusBtn} activeOpacity={0.8}>
            <Text style={styles.bonusBtnText}>+ Bonus</Text>
          </TouchableOpacity>
        </View>

        {/* Team Goal Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View style={styles.goalTitleGroup}>
              <Text style={styles.goalTitle}>Weekly Team Goal</Text>
              <Text style={styles.goalSubtitle}>2 days left</Text>
            </View>
            <View style={styles.goalBadge}>
              <Text style={styles.goalBadgeText}>79%</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '79%' }]} />
          </View>

          <Text style={styles.goalAmount}>$11,840 of $15,000</Text>

          <View style={styles.goalNote}>
            <Text style={styles.goalNoteText}>🎯 Everyone earns $20 CAD bonus on completion</Text>
          </View>
        </View>

        {/* Weekly Bonus Pool */}
        <View style={styles.poolCard}>
          <Text style={styles.cardTitle}>Weekly Bonus Pool</Text>
          <View style={styles.poolStats}>
            <View style={styles.poolStat}>
              <Text style={styles.poolStatValue}>$200</Text>
              <Text style={styles.poolStatLabel}>Total</Text>
            </View>
            <View style={styles.poolDivider} />
            <View style={styles.poolStat}>
              <Text style={[styles.poolStatValue, { color: GOLD }]}>$75</Text>
              <Text style={styles.poolStatLabel}>Sent</Text>
            </View>
            <View style={styles.poolDivider} />
            <View style={styles.poolStat}>
              <Text style={[styles.poolStatValue, { color: TEAL }]}>$125</Text>
              <Text style={styles.poolStatLabel}>Left</Text>
            </View>
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.leaderCard}>
          <View style={styles.leaderHeader}>
            <Text style={styles.cardTitle}>This Week's Top Staff</Text>
            <Text style={styles.leaderSubtitle}>by tip %</Text>
          </View>
          {leaderboard.map((item, index) => (
            <View
              key={item.name}
              style={[
                styles.leaderRow,
                index < leaderboard.length - 1 && styles.leaderRowBorder,
              ]}>
              <View style={styles.leaderLeft}>
                {item.medal ? (
                  <Text style={styles.medal}>{item.medal}</Text>
                ) : (
                  <Text style={styles.rankNum}>{item.rank}</Text>
                )}
                <Text style={styles.leaderName}>{item.name}</Text>
              </View>
              <View style={styles.leaderRight}>
                {item.streak > 0 && (
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakText}>🔥×{item.streak}</Text>
                  </View>
                )}
                <Text style={[styles.leaderPct, item.rank === 1 && { color: GOLD }]}>
                  {item.pct}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Auto Bonus Rules */}
        <View style={styles.rulesCard}>
          <Text style={[styles.cardTitle, styles.rulesPadding]}>Auto Bonus Rules</Text>
          <View style={styles.rulesDivider} />
          {bonusRules.map((rule, index) => (
            <View
              key={rule.label}
              style={[
                styles.ruleRow,
                index < bonusRules.length - 1 && styles.ruleRowBorder,
              ]}>
              <Text style={styles.ruleLabel}>{rule.label}</Text>
              <Switch
                value={rule.enabled}
                trackColor={{ false: BORDER, true: TEAL_BORDER }}
                thumbColor={rule.enabled ? TEAL : MUTED}
                ios_backgroundColor={BORDER}
              />
            </View>
          ))}
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
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  bonusBtn: {
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bonusBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: GOLD,
  },

  // Team Goal Card
  goalCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: TEAL_BORDER,
    padding: 18,
    gap: 14,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  goalTitleGroup: {
    gap: 3,
  },
  goalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  goalSubtitle: {
    fontSize: 13,
    color: MUTED,
  },
  goalBadge: {
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  goalBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: TEAL,
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(0,229,160,0.12)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TEAL,
    borderRadius: 4,
  },
  goalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  goalNote: {
    backgroundColor: TEAL_DIM,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  goalNoteText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEAL,
    lineHeight: 18,
  },

  // Pool Card
  poolCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 16,
  },
  poolStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  poolStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  poolStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  poolStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  poolDivider: {
    width: 1,
    height: 40,
    backgroundColor: BORDER,
  },

  // Shared
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },

  // Leaderboard
  leaderCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  leaderHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  leaderSubtitle: {
    fontSize: 13,
    color: MUTED,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  leaderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  leaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medal: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  rankNum: {
    fontSize: 15,
    fontWeight: '700',
    color: MUTED,
    width: 28,
    textAlign: 'center',
  },
  leaderName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  leaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakBadge: {
    backgroundColor: 'rgba(249,115,22,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fb923c',
  },
  leaderPct: {
    fontSize: 16,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -0.3,
    minWidth: 50,
    textAlign: 'right',
  },

  // Rules Card
  rulesCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  rulesPadding: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  rulesDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginTop: 14,
    marginHorizontal: 18,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  ruleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  ruleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
    flex: 1,
    lineHeight: 20,
  },
});
