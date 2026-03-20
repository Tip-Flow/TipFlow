import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const TEAL_BORDER = 'rgba(0,229,160,0.4)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const ORANGE = '#fb923c';
const ORANGE_DIM = 'rgba(249,115,22,0.15)';

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

export default function RewardsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.title}>Rewards & Incentives</Text>

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
              <TouchableOpacity style={styles.deliverBtn} activeOpacity={0.8}>
                <Text style={styles.deliverBtnText}>Mark as Delivered</Text>
              </TouchableOpacity>
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
    backgroundColor: TEAL_DIM,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  deliverBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: TEAL,
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
    backgroundColor: 'rgba(0,229,160,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TEAL,
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
    backgroundColor: TEAL_DIM,
    marginHorizontal: 18,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  milestoneCount: {
    fontSize: 14,
    fontWeight: '700',
    color: TEAL,
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
});
