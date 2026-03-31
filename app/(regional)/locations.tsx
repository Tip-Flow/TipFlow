import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type Status = 'green' | 'amber' | 'red';

const statusColor: Record<Status, string> = {
  green: '#22c55e',
  amber: AMBER,
  red: '#f87171',
};

const posColor: Record<string, string> = {
  Square: TEAL,
  Lightspeed: AMBER,
  CSV: '#a78bfa',
};

const locations = [
  {
    id: '1',
    name: 'Ossington',
    city: 'Toronto',
    manager: 'Jamie Chen',
    pos: 'Square',
    tipsThisWeek: '$11,240',
    staffCount: 9,
    bankLinked: 7,
    housePool: '$620',
    status: 'green' as Status,
  },
  {
    id: '2',
    name: 'Kensington',
    city: 'Toronto',
    manager: 'Marcus T.',
    pos: 'Lightspeed',
    tipsThisWeek: '$9,830',
    staffCount: 8,
    bankLinked: 6,
    housePool: '$380',
    status: 'amber' as Status,
  },
  {
    id: '3',
    name: 'Distillery',
    city: 'Toronto',
    manager: 'Priya S.',
    pos: 'Square',
    tipsThisWeek: '$7,380',
    staffCount: 7,
    bankLinked: 7,
    housePool: '$240',
    status: 'green' as Status,
  },
];

export default function RegionalLocations() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Locations</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{locations.length} locations</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {locations.map((loc) => {
          const unlinked = loc.staffCount - loc.bankLinked;
          const posAccent = posColor[loc.pos] ?? TEAL;
          return (
            <View key={loc.id} style={styles.locationCard}>
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor[loc.status] }]} />
                  <View>
                    <Text style={styles.locationName}>{loc.name}</Text>
                    <Text style={styles.locationCity}>{loc.city}</Text>
                  </View>
                </View>
                <View style={[styles.posBadge, { borderColor: posAccent }]}>
                  <Text style={[styles.posText, { color: posAccent }]}>{loc.pos}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{loc.tipsThisWeek}</Text>
                  <Text style={styles.statLabel}>Tips This Week</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{loc.staffCount}</Text>
                  <Text style={styles.statLabel}>Staff Total</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: AMBER }]}>{loc.housePool}</Text>
                  <Text style={styles.statLabel}>House Pool</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Footer */}
              <View style={styles.cardFooter}>
                <View style={styles.footerLeft}>
                  <Text style={styles.managerText}>
                    Mgr: <Text style={styles.managerName}>{loc.manager}</Text>
                  </Text>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankText}>
                      {loc.bankLinked}/{loc.staffCount} bank linked
                    </Text>
                    {unlinked > 0 && (
                      <View style={styles.bankWarning}>
                        <Text style={styles.bankWarningText}>{unlinked} unlinked</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity style={styles.viewBtn} activeOpacity={0.8}>
                  <Text style={styles.viewBtnText}>View Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  countBadge: {
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countText: { fontSize: 12, fontWeight: '700', color: TEAL },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  locationCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  locationName: { fontSize: 17, fontWeight: '800', color: WHITE },
  locationCity: { fontSize: 12, color: MUTED, marginTop: 1 },
  posBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  posText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: BORDER },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, backgroundColor: BORDER },
  statValue: { fontSize: 16, fontWeight: '800', color: TEAL },
  statLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerLeft: { gap: 4 },
  managerText: { fontSize: 12, color: MUTED },
  managerName: { color: WHITE, fontWeight: '600' },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bankText: { fontSize: 12, color: MUTED },
  bankWarning: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  bankWarningText: { fontSize: 10, fontWeight: '600', color: '#f87171' },
  viewBtn: {
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TEAL,
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: TEAL },
});
