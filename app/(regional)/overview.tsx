import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
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

type PointsRequest = {
  id: string;
  locationName: string;
  locationCity: string;
  roleName: string;
  currentPoints: number;
  requestedPoints: number;
  reason: string | null;
};

type KpiData = {
  totalLocations: number;
  totalStaff: number;
  tipsThisWeek: number;
  housePoolTotal: number;
};

export default function RegionalOverview() {
  const router = useRouter();
  const [pendingRequests, setPendingRequests] = useState<PointsRequest[]>([]);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const [locsRes, staffRes, shiftsRes, requestsRes] = await Promise.all([
        supabase.from('locations').select('id, name, city, house_pool_balance'),
        supabase.from('staff_members').select('id'),
        supabase.from('shifts').select('total_tips').gte('date', weekStartStr),
        supabase
          .from('points_change_requests')
          .select('id, role_name, current_points, requested_points, reason, locations(name, city)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      if (locsRes.data) {
        const housePoolTotal = locsRes.data.reduce((sum, l) => sum + (l.house_pool_balance ?? 0), 0);
        const tipsTotal = (shiftsRes.data ?? []).reduce((sum, s) => sum + (s.total_tips ?? 0), 0);
        setKpi({
          totalLocations: locsRes.data.length,
          totalStaff: staffRes.data?.length ?? 0,
          tipsThisWeek: tipsTotal,
          housePoolTotal,
        });
      }

      if (requestsRes.data) {
        setPendingRequests(
          requestsRes.data.map(r => ({
            id: r.id,
            locationName: (r.locations as any)?.name ?? 'Unknown',
            locationCity: (r.locations as any)?.city ?? '',
            roleName: r.role_name,
            currentPoints: r.current_points,
            requestedPoints: r.requested_points,
            reason: r.reason,
          }))
        );
      }
    } catch (err) {
      console.log('[RegionalOverview] fetchData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function handleApprove(request: PointsRequest) {
    setProcessingId(request.id);
    try {
      const { error } = await supabase
        .from('points_change_requests')
        .update({
          status: 'approved',
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      setPendingRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (err) {
      console.log('[RegionalOverview] approve error:', err);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(request: PointsRequest) {
    setProcessingId(request.id);
    try {
      const { error } = await supabase
        .from('points_change_requests')
        .update({
          status: 'rejected',
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      setPendingRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (err) {
      console.log('[RegionalOverview] reject error:', err);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  const stats = kpi
    ? [
        { label: 'Total Locations', value: String(kpi.totalLocations), icon: '📍', accent: BLUE },
        { label: 'Total Staff', value: String(kpi.totalStaff), icon: '👥', accent: BLUE },
        {
          label: 'Tips This Week',
          value: '$' + Math.round(kpi.tipsThisWeek / 100).toLocaleString('en-CA'),
          icon: '📈',
          accent: BLUE,
        },
        {
          label: 'House Pool Balance',
          value: '$' + Math.round(kpi.housePoolTotal / 100).toLocaleString('en-CA'),
          icon: '🏦',
          accent: AMBER,
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Regional</Text>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>Regional Overview 👋</Text>
            <Text style={styles.subGreeting}>All locations · This week</Text>
          </View>

          {/* KPI Cards */}
          <View style={styles.grid}>
            {stats.map(stat => (
              <View key={stat.label} style={styles.card}>
                <Text style={styles.cardIcon}>{stat.icon}</Text>
                <Text style={[styles.cardValue, { color: stat.accent }]}>{stat.value}</Text>
                <Text style={styles.cardLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Pending Approvals */}
          {pendingRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending Approvals</Text>
              <View style={styles.approvalCard}>
                <View style={styles.approvalHeader}>
                  <View style={styles.approvalBadgeWrap}>
                    <Text style={styles.approvalBadgeText}>
                      {pendingRequests.length} PENDING
                    </Text>
                  </View>
                  <Text style={styles.approvalType}>Points Change Requests</Text>
                </View>

                {pendingRequests.map((req, i) => {
                  const isProcessing = processingId === req.id;
                  return (
                    <View
                      key={req.id}
                      style={[
                        styles.approvalItem,
                        i < pendingRequests.length - 1 && styles.approvalItemBorder,
                      ]}>
                      <View style={styles.approvalDetails}>
                        <Text style={styles.approvalLocation}>
                          {req.locationName} · {req.roleName}
                        </Text>
                        <Text style={styles.approvalChange}>
                          {req.currentPoints} → {req.requestedPoints} pts/hr
                        </Text>
                        {req.reason ? (
                          <Text style={styles.approvalReason}>{req.reason}</Text>
                        ) : null}
                      </View>
                      <View style={styles.approvalActions}>
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={BLUE} />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={styles.approveBtn}
                              activeOpacity={0.8}
                              onPress={() => handleApprove(req)}>
                              <Text style={styles.approveBtnText}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectBtn}
                              activeOpacity={0.8}
                              onPress={() => handleReject(req)}>
                              <Text style={styles.rejectBtnText}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

        </ScrollView>
      )}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 24 },
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
  approvalBadgeText: { fontSize: 10, fontWeight: '700', color: AMBER, letterSpacing: 1 },
  approvalType: { fontSize: 14, fontWeight: '700', color: WHITE },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  approvalItemBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  approvalDetails: { flex: 1, gap: 3 },
  approvalLocation: { fontSize: 14, fontWeight: '700', color: WHITE },
  approvalChange: { fontSize: 13, fontWeight: '600', color: AMBER },
  approvalReason: { fontSize: 12, color: MUTED },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: BLUE, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
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
});
