import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const GREEN = '#22c55e';

const staffChips = [
  { name: 'Alex', amount: '$453', method: '📱' },
  { name: 'Jordan', amount: '$377', method: '💵' },
  { name: 'Taylor', amount: '$302', method: '🏦' },
];

const payoutHistory = [
  { name: 'Alex Chen', shift: 'Friday Dinner', date: 'Jun 6', method: '📱 e-Transfer', amount: '$453' },
  { name: 'Jordan Park', shift: 'Friday Dinner', date: 'Jun 6', method: '💵 Cash', amount: '$377' },
  { name: 'Taylor Nguyen', shift: 'Friday Dinner', date: 'Jun 6', method: '🏦 AptPay', amount: '$302' },
  { name: 'Sam Rivera', shift: 'Thursday Lunch', date: 'Jun 5', method: '📱 e-Transfer', amount: '$289' },
  { name: 'Morgan Lee', shift: 'Thursday Lunch', date: 'Jun 5', method: '💵 Cash', amount: '$241' },
];

export default function PayoutsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payouts</Text>
        </View>

        {/* Pending Payout Card */}
        <View style={styles.pendingCard}>
          {/* Card Header */}
          <View style={styles.pendingHeader}>
            <Text style={styles.readyText}>Ready to Pay Out</Text>
            <View style={styles.shiftBadge}>
              <Text style={styles.shiftBadgeText}>1 shift</Text>
            </View>
          </View>

          {/* Shift Info */}
          <View style={styles.shiftInfo}>
            <Text style={styles.shiftName}>Saturday Lunch</Text>
            <View style={styles.shiftMeta}>
              <Text style={styles.shiftMetaText}>Ossington</Text>
              <Text style={styles.shiftMetaDot}>·</Text>
              <Text style={styles.shiftMetaText}>Jun 7</Text>
            </View>
          </View>

          {/* Total Amount */}
          <Text style={styles.totalAmount}>$1,320 CAD</Text>

          {/* Staff Chips */}
          <View style={styles.staffChips}>
            {staffChips.map((chip) => (
              <View key={chip.name} style={styles.chip}>
                <Text style={styles.chipEmoji}>{chip.method}</Text>
                <Text style={styles.chipName}>{chip.name}</Text>
                <Text style={styles.chipAmount}>{chip.amount}</Text>
              </View>
            ))}
          </View>

          {/* Pay Button */}
          <TouchableOpacity style={styles.payBtn} activeOpacity={0.8}>
            <Text style={styles.payBtnText}>Pay via AptPay</Text>
          </TouchableOpacity>
        </View>

        {/* Payout History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Payout History</Text>
          <View style={styles.historyCard}>
            {payoutHistory.map((item, index) => (
              <View
                key={`${item.name}-${item.date}`}
                style={[
                  styles.historyRow,
                  index < payoutHistory.length - 1 && styles.historyRowBorder,
                ]}>
                {/* Left: name + shift */}
                <View style={styles.historyLeft}>
                  <Text style={styles.historyName}>{item.name}</Text>
                  <Text style={styles.historyShift}>{item.shift} · {item.date}</Text>
                  <Text style={styles.historyMethod}>{item.method}</Text>
                </View>
                {/* Right: amount + status */}
                <View style={styles.historyRight}>
                  <Text style={styles.historyAmount}>{item.amount}</Text>
                  <View style={styles.sentBadge}>
                    <Text style={styles.sentText}>Sent</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
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
    gap: 24,
  },

  // Header
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },

  // Pending Card
  pendingCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AMBER_BORDER,
    padding: 18,
    gap: 16,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyText: {
    fontSize: 15,
    fontWeight: '700',
    color: AMBER,
  },
  shiftBadge: {
    backgroundColor: AMBER_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  shiftBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: AMBER,
  },

  // Shift Info
  shiftInfo: {
    gap: 4,
  },
  shiftName: {
    fontSize: 20,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  shiftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftMetaText: {
    fontSize: 13,
    color: MUTED,
  },
  shiftMetaDot: {
    fontSize: 13,
    color: MUTED,
  },

  // Total Amount
  totalAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -1,
  },

  // Staff Chips
  staffChips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: TEAL_DIM,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },
  chipAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },

  // Pay Button
  payBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  payBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#09100e',
    letterSpacing: 0.1,
  },

  // History Section
  historySection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.3,
  },
  historyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  historyLeft: {
    gap: 3,
    flex: 1,
  },
  historyName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  historyShift: {
    fontSize: 12,
    color: MUTED,
  },
  historyMethod: {
    fontSize: 12,
    color: MUTED,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: TEAL,
  },
  sentBadge: {
    backgroundColor: GREEN_DIM,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  sentText: {
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
  },
});
