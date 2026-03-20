import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

const locations = [
  {
    name: 'Ossington',
    city: 'Toronto, ON',
    posType: 'Square API',
    posStyle: 'teal',
    connected: true,
  },
  {
    name: 'Kensington',
    city: 'Toronto, ON',
    posType: 'CSV Upload',
    posStyle: 'amber',
    connected: false,
  },
];

const posSystems = [
  { name: 'Square', type: 'API' },
  { name: 'Lightspeed', type: 'API' },
  { name: 'TouchBistro', type: 'CSV' },
  { name: "Maitre'D", type: 'CSV' },
  { name: 'Any POS', type: 'CSV' },
];

export default function POSScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>POS Import</Text>
              <Text style={styles.subtitle}>Pull tonight's tip data</Text>
            </View>
            <TouchableOpacity
              style={styles.newCalcBtn}
              onPress={() => router.push('/(manager)/calculate')}
              activeOpacity={0.8}>
              <Text style={styles.newCalcBtnText}>+ New Calculation</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location Cards */}
        <View style={styles.section}>
          {locations.map((loc) => {
            const isTeal = loc.posStyle === 'teal';
            return (
              <View key={loc.name} style={styles.locationCard}>
                {/* Location name + city */}
                <View style={styles.locHeader}>
                  <View style={styles.locInfo}>
                    <Text style={styles.locName}>{loc.name}</Text>
                    <Text style={styles.locCity}>{loc.city}</Text>
                  </View>
                  {/* Connected badge */}
                  <View style={[
                    styles.statusBadge,
                    loc.connected ? styles.statusConnected : styles.statusDisconnected,
                  ]}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: loc.connected ? TEAL : '#ef4444' },
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: loc.connected ? TEAL : '#ef4444' },
                    ]}>
                      {loc.connected ? 'Connected' : 'Not Connected'}
                    </Text>
                  </View>
                </View>

                {/* POS type badge */}
                <View style={[
                  styles.posBadge,
                  isTeal ? styles.posBadgeTeal : styles.posBadgeAmber,
                ]}>
                  <Text style={[
                    styles.posBadgeText,
                    { color: isTeal ? TEAL : AMBER },
                  ]}>
                    {loc.posType}
                  </Text>
                </View>

                {/* Action button */}
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    isTeal ? styles.actionBtnTeal : styles.actionBtnAmber,
                  ]}
                  activeOpacity={0.8}>
                  <Text style={[
                    styles.actionBtnText,
                    { color: isTeal ? '#09100e' : '#09100e' },
                  ]}>
                    {loc.connected ? "Pull Tonight's Report" : 'Upload CSV Report'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Supported POS Systems */}
        <View style={styles.supportedCard}>
          <Text style={styles.supportedTitle}>Supported POS Systems</Text>
          <View style={styles.divider} />
          {posSystems.map((pos, index) => (
            <View
              key={pos.name}
              style={[
                styles.posRow,
                index < posSystems.length - 1 && styles.posRowBorder,
              ]}>
              <Text style={styles.posName}>{pos.name}</Text>
              <View style={[
                styles.integrationBadge,
                pos.type === 'API' ? styles.integrationAPI : styles.integrationCSV,
              ]}>
                <Text style={[
                  styles.integrationText,
                  { color: pos.type === 'API' ? TEAL : AMBER },
                ]}>
                  {pos.type}
                </Text>
              </View>
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
    gap: 24,
  },

  // Header
  header: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  newCalcBtn: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  newCalcBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#09100e',
    letterSpacing: 0.1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
  },

  // Section
  section: {
    gap: 14,
  },

  // Location Card
  locationCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  locHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  locInfo: {
    gap: 2,
  },
  locName: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  locCity: {
    fontSize: 13,
    color: MUTED,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusConnected: {
    backgroundColor: TEAL_DIM,
  },
  statusDisconnected: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // POS type badge
  posBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  posBadgeTeal: {
    backgroundColor: TEAL_DIM,
  },
  posBadgeAmber: {
    backgroundColor: AMBER_DIM,
  },
  posBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Action button
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnTeal: {
    backgroundColor: TEAL,
  },
  actionBtnAmber: {
    backgroundColor: AMBER,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // Supported POS card
  supportedCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  supportedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 18,
    marginBottom: 4,
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  posRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  posName: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
  },
  integrationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  integrationAPI: {
    backgroundColor: TEAL_DIM,
  },
  integrationCSV: {
    backgroundColor: AMBER_DIM,
  },
  integrationText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
