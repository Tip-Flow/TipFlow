import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = '#00b880';
const MUTED = '#6b7a74';
const LABEL = '#9db8ad';
const BORDER = '#1e3028';

export default function MyTipsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.screenTitle}>My Tips</Text>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Alex Dubois · Ossington</Text>
          <Text style={styles.heroAmount}>$4,820</Text>
          <Text style={styles.heroMeta}>CAD earned · 12 shifts paid</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Rank #1 this week 🥇</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🔥×5 streak</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>📱 Interac e-Transfer</Text>
            <View style={styles.instantBadge}>
              <Text style={styles.instantText}>Instant · 24/7</Text>
            </View>
          </View>
        </View>

        {/* Tax Info Bar */}
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            Direct Tips — No CPP/EI deductions. Self-report on T1.
          </Text>
        </View>

        {/* Challenges Preview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Active Challenges</Text>
            <Text style={styles.cardLink}>See all</Text>
          </View>

          {/* Challenge 1 */}
          <View style={styles.challenge}>
            <View style={styles.challengeTop}>
              <Text style={styles.challengeName}>⚡ Weekend Warrior</Text>
              <Text style={styles.challengeReward}>+$50</Text>
            </View>
            <Text style={styles.challengeDesc}>Earn $500 across Fri–Sun shifts</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: '74%' }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressMuted}>$370 / $500</Text>
              <Text style={styles.progressMuted}>74%</Text>
            </View>
          </View>

          <View style={styles.challengeSep} />

          {/* Challenge 2 */}
          <View style={styles.challenge}>
            <View style={styles.challengeTop}>
              <Text style={styles.challengeName}>🌟 Top Tipper Magnet</Text>
              <Text style={styles.challengeReward}>+$25</Text>
            </View>
            <Text style={styles.challengeDesc}>Receive 20 tips in a single week</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: '60%' }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressMuted}>12 / 20 tips</Text>
              <Text style={styles.progressMuted}>60%</Text>
            </View>
          </View>
        </View>

        {/* Recent Payouts */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent Payouts</Text>
          </View>

          {PAYOUTS.map((p, i) => (
            <View key={p.ref} style={[styles.payoutItem, i < PAYOUTS.length - 1 && styles.payoutItemBorder]}>
              <View style={styles.payoutLeft}>
                <Text style={styles.payoutAmount}>{p.amount}</Text>
                <Text style={styles.payoutDate}>{p.date}</Text>
              </View>
              <View style={styles.payoutRight}>
                <Text style={styles.payoutStatus}>Paid</Text>
                <Text style={styles.payoutRef}>AptPay · {p.ref}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const PAYOUTS = [
  { amount: '$612.00', date: 'Mar 15, 2026 · Sat shift', ref: 'AP-88214' },
  { amount: '$540.50', date: 'Mar 8, 2026 · Sat shift',  ref: 'AP-87102' },
  { amount: '$498.00', date: 'Mar 1, 2026 · Sat shift',  ref: 'AP-85990' },
];

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

  // Hero card
  heroCard: {
    backgroundColor: '#0d1f17',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroSubtitle: {
    fontSize: 14,
    color: LABEL,
    fontWeight: '500',
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -2,
    lineHeight: 58,
  },
  heroMeta: {
    fontSize: 14,
    color: MUTED,
    marginTop: 4,
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: '#1a3028',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 13,
    color: TEAL,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payoutLabel: {
    fontSize: 15,
    color: '#d0e8df',
    fontWeight: '500',
  },
  instantBadge: {
    backgroundColor: '#0d3324',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1a5c3a',
  },
  instantText: {
    fontSize: 12,
    color: TEAL,
    fontWeight: '700',
  },

  // Info bar
  infoBar: {
    backgroundColor: '#0d2a1c',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1a4a2e',
  },
  infoText: {
    fontSize: 13,
    color: '#5fba8a',
    fontWeight: '500',
    lineHeight: 18,
  },

  // Generic card
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cardLink: {
    fontSize: 14,
    color: TEAL,
    fontWeight: '600',
  },

  // Challenges
  challenge: {
    gap: 6,
  },
  challengeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challengeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e8f5ef',
  },
  challengeReward: {
    fontSize: 15,
    fontWeight: '700',
    color: TEAL,
  },
  challengeDesc: {
    fontSize: 13,
    color: MUTED,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1e3028',
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TEAL_DIM,
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressMuted: {
    fontSize: 12,
    color: MUTED,
  },
  challengeSep: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 14,
  },

  // Payouts
  payoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  payoutItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  payoutLeft: {
    gap: 3,
  },
  payoutRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  payoutAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e8f5ef',
  },
  payoutDate: {
    fontSize: 13,
    color: MUTED,
  },
  payoutStatus: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },
  payoutRef: {
    fontSize: 12,
    color: MUTED,
  },
});
