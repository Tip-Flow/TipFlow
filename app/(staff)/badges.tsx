import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#09100e';
const CARD = '#162019';
const BORDER = '#1e3028';
const MUTED = '#6b7a74';

const EARNED_BADGES = [
  {
    emoji: '💸',
    title: 'First Payout',
    desc: 'Received your first tip',
    accent: '#4169E1',
    iconBg: '#0d3324',
  },
  {
    emoji: '🔟',
    title: '10 Shifts',
    desc: 'Completed 10 shifts',
    accent: '#4da6ff',
    iconBg: '#0d1f33',
  },
  {
    emoji: '🏆',
    title: 'Top Earner',
    desc: 'Highest tip % in location',
    accent: '#f5c842',
    iconBg: '#2e2408',
  },
  {
    emoji: '🔥',
    title: '5-Day Streak',
    desc: '5 shifts above 20% in a row',
    accent: '#ff7a3d',
    iconBg: '#2e1408',
  },
];

const LOCKED_BADGES = [
  {
    emoji: '💎',
    title: 'Diamond Earner',
    desc: '$25k in total tips',
  },
  {
    emoji: '⭐',
    title: 'Star Server',
    desc: '20%+ avg for a full month',
  },
  {
    emoji: '🎯',
    title: 'Consistent',
    desc: 'Hit goal 4 weeks in a row',
  },
  {
    emoji: '👑',
    title: 'Legend',
    desc: '#1 for a full month',
  },
];

export default function BadgesScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.screenTitle}>🏅 Badges</Text>

        {/* Earned Section */}
        <Text style={styles.sectionLabel}>Earned (4)</Text>
        <View style={styles.grid}>
          {EARNED_BADGES.map((badge) => (
            <View key={badge.title} style={styles.earnedCard}>
              <View style={[styles.iconCircle, { backgroundColor: badge.iconBg }]}>
                <Text style={styles.iconEmoji}>{badge.emoji}</Text>
              </View>
              <Text style={[styles.badgeTitle, { color: badge.accent }]}>{badge.title}</Text>
              <Text style={[styles.badgeDesc, { color: badge.accent, opacity: 0.7 }]}>{badge.desc}</Text>
            </View>
          ))}
        </View>

        {/* Locked Section */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>🔒 Locked</Text>
        <View style={styles.grid}>
          {LOCKED_BADGES.map((badge) => (
            <View key={badge.title} style={styles.lockedCard}>
              <View style={styles.lockedIconCircle}>
                <Text style={[styles.iconEmoji, styles.lockedEmoji]}>{badge.emoji}</Text>
              </View>
              <Text style={styles.lockedTitle}>{badge.title}</Text>
              <Text style={styles.lockedDesc}>{badge.desc}</Text>
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
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9db8ad',
    marginBottom: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  // Earned badge card
  earnedCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    width: '47%',
    gap: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 24,
  },
  badgeTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  badgeDesc: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  // Locked badge card
  lockedCard: {
    backgroundColor: '#0f1712',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a2420',
    padding: 16,
    width: '47%',
    gap: 10,
    opacity: 0.5,
  },
  lockedIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a2420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedEmoji: {
    opacity: 0.6,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: MUTED,
    lineHeight: 18,
  },
  lockedDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    lineHeight: 16,
    opacity: 0.8,
  },
});
