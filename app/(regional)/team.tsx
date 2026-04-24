import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER = '#f59e0b';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type Level = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Elite';

const levelStyle: Record<Level, { bg: string; text: string }> = {
  Bronze: { bg: 'rgba(180,83,9,0.2)', text: '#d97706' },
  Silver: { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' },
  Gold: { bg: 'rgba(245,158,11,0.2)', text: AMBER },
  Platinum: { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
  Elite: { bg: BLUE_DIM, text: BLUE },
};

const teamData = [
  {
    location: 'Ossington',
    staff: [
      { name: 'Priya S.', role: 'Server', level: 'Gold' as Level, tips: '$1,840' },
      { name: 'Marcus T.', role: 'Bartender', level: 'Silver' as Level, tips: '$1,610' },
      { name: 'Lena K.', role: 'Server', level: 'Platinum' as Level, tips: '$1,290' },
      { name: 'Devon A.', role: 'Runner', level: 'Bronze' as Level, tips: '$720' },
    ],
  },
  {
    location: 'Kensington',
    staff: [
      { name: 'Sam R.', role: 'Server', level: 'Elite' as Level, tips: '$2,140' },
      { name: 'Tara M.', role: 'Bartender', level: 'Gold' as Level, tips: '$1,520' },
      { name: 'Chris J.', role: 'Server', level: 'Silver' as Level, tips: '$1,180' },
    ],
  },
  {
    location: 'Distillery',
    staff: [
      { name: 'Anika P.', role: 'Server', level: 'Gold' as Level, tips: '$1,640' },
      { name: 'Jordan B.', role: 'Bartender', level: 'Silver' as Level, tips: '$1,340' },
      { name: 'Felix O.', role: 'Host', level: 'Bronze' as Level, tips: '$480' },
    ],
  },
];

const ALL = 'All Locations';
const locationOptions = [ALL, 'Ossington', 'Kensington', 'Distillery'];

export default function RegionalTeam() {
  const [selectedLocation, setSelectedLocation] = useState(ALL);
  const [search, setSearch] = useState('');

  const filtered = teamData
    .filter((g) => selectedLocation === ALL || g.location === selectedLocation)
    .map((g) => ({
      ...g,
      staff: g.staff.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((g) => g.staff.length > 0);

  const totalVisible = filtered.reduce((sum, g) => sum + g.staff.length, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Team</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{totalVisible} staff</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor="#4a5e56"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {/* Location filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {locationOptions.map((loc) => (
          <TouchableOpacity
            key={loc}
            style={[styles.chip, selectedLocation === loc && styles.chipActive]}
            onPress={() => setSelectedLocation(loc)}
            activeOpacity={0.8}>
            <Text style={[styles.chipText, selectedLocation === loc && styles.chipTextActive]}>
              {loc}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {filtered.map((group) => (
          <View key={group.location} style={styles.locationGroup}>
            <Text style={styles.locationLabel}>{group.location}</Text>
            <View style={styles.staffCard}>
              {group.staff.map((member, index) => {
                const badge = levelStyle[member.level];
                return (
                  <View
                    key={member.name}
                    style={[
                      styles.staffRow,
                      index < group.staff.length - 1 && styles.rowBorder,
                    ]}>
                    <View style={styles.staffLeft}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{member.name[0]}</Text>
                      </View>
                      <View style={styles.staffInfo}>
                        <Text style={styles.staffName}>{member.name}</Text>
                        <Text style={styles.staffRole}>{member.role}</Text>
                      </View>
                    </View>
                    <View style={styles.staffRight}>
                      <View style={[styles.levelBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.levelText, { color: badge.text }]}>
                          {member.level}
                        </Text>
                      </View>
                      <Text style={styles.staffTips}>{member.tips}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No staff found</Text>
          </View>
        )}

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
    backgroundColor: BLUE_DIM,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countText: { fontSize: 12, fontWeight: '700', color: BLUE },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInput: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: WHITE,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE },
  chipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: BLUE },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 20,
  },
  locationGroup: { gap: 10 },
  locationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  staffCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  staffLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1f3028',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: BLUE },
  staffInfo: { gap: 2 },
  staffName: { fontSize: 15, fontWeight: '700', color: WHITE },
  staffRole: { fontSize: 12, color: MUTED },
  staffRight: { alignItems: 'flex-end', gap: 4 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  levelText: { fontSize: 11, fontWeight: '700' },
  staffTips: { fontSize: 13, fontWeight: '600', color: BLUE },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: MUTED },
});
