import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65, 105, 225, 0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const RED = '#f87171';
const RED_DIM = 'rgba(248,113,113,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

const locationRows = [
  { name: 'Ossington', city: 'Toronto', tips: '$11,240', staff: 9, status: 'green' as const },
  { name: 'Kensington', city: 'Toronto', tips: '$9,830', staff: 8, status: 'amber' as const },
  { name: 'Distillery', city: 'Toronto', tips: '$7,380', staff: 7, status: 'green' as const },
];

const statusColor = {
  green: '#22c55e',
  amber: AMBER,
  red: RED,
};

export default function RegionalOverview() {
  const router = useRouter();
  const [approvalVisible, setApprovalVisible] = useState(true);

  const stats = [
    { label: 'Total Locations', value: '3', icon: '📍', accent: BLUE },
    { label: 'Total Staff', value: '24', icon: '👥', accent: BLUE },
    { label: 'Tips This Week', value: '$28,450', icon: '📈', accent: BLUE },
    { label: 'House Pool Balance', value: '$1,240', icon: '🏦', accent: AMBER },
  ];

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Regional</Text>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>Good evening, Sarah 👋</Text>
          <Text style={styles.subGreeting}>Regional Manager · Canteen Group</Text>
        </View>

        {/* KPI Cards 2×2 */}
        <View style={styles.grid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.card}>
              <Text style={styles.cardIcon}>{stat.icon}</Text>
              <Text style={[styles.cardValue, { color: stat.accent }]}>{stat.value}</Text>
              <Text style={styles.cardLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Locations Performance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Locations Performance</Text>
          <View style={styles.listCard}>
            {locationRows.map((loc, index) => (
              <View
                key={loc.name}
                style={[
                  styles.locationRow,
                  index < locationRows.length - 1 && styles.rowBorder,
                ]}>
                <View style={styles.locationLeft}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor[loc.status] }]} />
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{loc.name}</Text>
                    <Text style={styles.locationCity}>{loc.city}</Text>
                  </View>
                </View>
                <View style={styles.locationRight}>
                  <Text style={styles.locationTips}>{loc.tips}</Text>
                  <Text style={styles.locationStaff}>{loc.staff} staff</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Pending Approvals */}
        {approvalVisible && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Approvals</Text>
            <View style={styles.approvalCard}>
              <View style={styles.approvalHeader}>
                <View style={styles.approvalBadgeWrap}>
                  <Text style={styles.approvalBadgeText}>1 PENDING</Text>
                </View>
                <Text style={styles.approvalType}>Points Change Requests</Text>
              </View>
              <View style={styles.approvalItem}>
                <View style={styles.approvalDetails}>
                  <Text style={styles.approvalLocation}>Ossington · Line Cook</Text>
                  <Text style={styles.approvalChange}>2.25 → 3.0 pts/hr</Text>
                  <Text style={styles.approvalRequested}>Requested by Jamie</Text>
                </View>
                <View style={styles.approvalActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    activeOpacity={0.8}
                    onPress={() => setApprovalVisible(false)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    activeOpacity={0.8}
                    onPress={() => setApprovalVisible(false)}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Team Milestones */}
        <View style={styles.milestonesCard}>
          <Text style={styles.milestonesLabel}>TEAM MILESTONES THIS WEEK</Text>
          <View style={styles.milestonesRow}>
            <Text style={styles.milestonesCount}>24</Text>
            <Text style={styles.milestonesText}>
              milestones hit across all locations this week 🎉
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1f0a0a',
    borderWidth: 1,
    borderColor: '#3d1515',
  },
  signOutText: { fontSize: 13, fontWeight: '600', color: RED },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 24,
  },
  greetingBlock: { gap: 4 },
  greeting: { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  subGreeting: { fontSize: 14, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    width: '47.5%',
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardIcon: { fontSize: 22 },
  cardValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  cardLabel: { fontSize: 12, color: MUTED, fontWeight: '500' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  listCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  locationLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  locationInfo: { gap: 2 },
  locationName: { fontSize: 15, fontWeight: '700', color: WHITE },
  locationCity: { fontSize: 12, color: MUTED },
  locationRight: { alignItems: 'flex-end', gap: 2 },
  locationTips: { fontSize: 15, fontWeight: '700', color: BLUE },
  locationStaff: { fontSize: 12, color: MUTED },
  approvalCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AMBER,
    overflow: 'hidden',
  },
  approvalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  approvalBadgeWrap: {
    backgroundColor: AMBER_DIM,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  approvalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: AMBER,
    letterSpacing: 1,
  },
  approvalType: { fontSize: 14, fontWeight: '700', color: WHITE },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  approvalDetails: { flex: 1, gap: 3 },
  approvalLocation: { fontSize: 14, fontWeight: '700', color: WHITE },
  approvalChange: { fontSize: 13, fontWeight: '600', color: AMBER },
  approvalRequested: { fontSize: 12, color: MUTED },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  rejectBtn: {
    backgroundColor: RED_DIM,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RED,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: RED },
  milestonesCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  milestonesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 2,
  },
  milestonesRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestonesCount: {
    fontSize: 48,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -2,
  },
  milestonesText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: WHITE,
    lineHeight: 22,
  },
});
