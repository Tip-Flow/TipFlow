import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG      = '#09100e';
const CARD    = '#162019';
const BLUE    = '#4169E1';
const BLUE_DIM    = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const GREEN       = '#22c55e';
const GREEN_DIM   = 'rgba(34,197,94,0.15)';
const GREEN_BORDER = 'rgba(34,197,94,0.4)';
const AMBER       = '#f59e0b';
const AMBER_DIM   = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const RED         = '#f87171';
const RED_DIM     = 'rgba(248,113,113,0.15)';
const RED_BORDER  = 'rgba(248,113,113,0.4)';
const MUTED   = '#6b7a74';
const WHITE   = '#e8f0ec';
const BORDER  = '#1f3028';

type LocationDetail = {
  id: string;
  name: string;
  city: string;
  posType: string;
  housePoolCents: number;
  organisationId: string | null;
};

type Manager = {
  id: string;
  name: string;
  email: string;
  inviteSentAt: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  bankLinked: boolean;
  payoutMethod: string | null;
};

type ShiftRow = {
  id: string;
  name: string;
  date: string;
  totalTipsCents: number;
  staffCount: number;
};

type Kpi = {
  tipsThisWeekCents: number;
  totalStaff: number;
  activeShifts: number;
  housePoolCents: number;
};

function centsToCAD(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    server: 'Server', bartender: 'Bartender', runner: 'Runner',
    kitchen: 'Kitchen', support: 'Support', host: 'Host',
  };
  return map[role] ?? role;
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={[styles.kpiCard, { borderColor: BORDER }]}>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function LocationDetail() {
  const router = useRouter();
  const { locationId } = useLocalSearchParams<{ locationId: string }>();

  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [manager, setManager]   = useState<Manager | null>(null);
  const [staff, setStaff]       = useState<StaffRow[]>([]);
  const [shifts, setShifts]     = useState<ShiftRow[]>([]);
  const [kpi, setKpi]           = useState<Kpi | null>(null);
  const [loading, setLoading]   = useState(true);

  const fetchData = useCallback(async () => {
    if (!locationId) return;
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const [locRes, mgrRes, staffRes, shiftsRes, weekShiftsRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, name, city, pos_type, house_pool_balance, organisation_id')
          .eq('id', locationId)
          .single(),
        supabase
          .from('managers')
          .select('id, name, email, invite_sent_at')
          .eq('location_id', locationId)
          .eq('role', 'location_manager')
          .maybeSingle(),
        supabase
          .from('staff_members')
          .select('id, name, role, bank_linked, payout_method')
          .eq('location_id', locationId)
          .order('name'),
        supabase
          .from('shifts')
          .select('id, name, date, total_tips, status')
          .eq('location_id', locationId)
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('shifts')
          .select('id, total_tips, status')
          .eq('location_id', locationId)
          .gte('date', weekStartStr),
      ]);

      if (locRes.data) {
        setLocation({
          id: locRes.data.id,
          name: locRes.data.name,
          city: locRes.data.city,
          posType: locRes.data.pos_type ?? 'manual',
          housePoolCents: locRes.data.house_pool_balance ?? 0,
          organisationId: locRes.data.organisation_id,
        });
      }

      if (mgrRes.data) {
        setManager({
          id: mgrRes.data.id,
          name: mgrRes.data.name,
          email: mgrRes.data.email,
          inviteSentAt: mgrRes.data.invite_sent_at,
        });
      } else {
        setManager(null);
      }

      const staffList = staffRes.data ?? [];
      setStaff(staffList.map(s => ({
        id: s.id,
        name: s.name,
        role: s.role,
        bankLinked: s.bank_linked,
        payoutMethod: s.payout_method,
      })));

      // Fetch staff counts per recent shift
      const recentShifts = shiftsRes.data ?? [];
      const shiftIds = recentShifts.map(s => s.id);
      let staffCountMap: Record<string, number> = {};
      if (shiftIds.length > 0) {
        const { data: allocData } = await supabase
          .from('tip_allocations')
          .select('shift_id')
          .in('shift_id', shiftIds);
        for (const a of allocData ?? []) {
          staffCountMap[a.shift_id] = (staffCountMap[a.shift_id] ?? 0) + 1;
        }
      }

      setShifts(recentShifts.map(s => ({
        id: s.id,
        name: s.name,
        date: s.date,
        totalTipsCents: s.total_tips ?? 0,
        staffCount: staffCountMap[s.id] ?? 0,
      })));

      const weekTips = (weekShiftsRes.data ?? []).reduce((sum, s) => sum + (s.total_tips ?? 0), 0);
      const activeShifts = (weekShiftsRes.data ?? []).filter(s => s.status === 'pending').length;
      setKpi({
        tipsThisWeekCents: weekTips,
        totalStaff: staffList.length,
        activeShifts,
        housePoolCents: locRes.data?.house_pool_balance ?? 0,
      });
    } catch (err) {
      console.log('[LocationDetail] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));
  useWebFocus(fetchData);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Location not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const posLabel = location.posType.charAt(0).toUpperCase() + location.posType.slice(1);
  const linkedCount = staff.filter(s => s.bankLinked).length;
  const unlinkedCount = staff.length - linkedCount;
  const allLinked = unlinkedCount === 0 && staff.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <View style={[styles.posBadge, { borderColor: BLUE }]}>
          <Text style={[styles.posText, { color: BLUE }]}>{posLabel}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Location title block */}
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, {
              backgroundColor: allLinked ? GREEN : unlinkedCount > 2 ? RED : AMBER,
            }]} />
            <Text style={styles.locationName}>{location.name}</Text>
          </View>
          <Text style={styles.locationCity}>{location.city}</Text>
        </View>

        {/* KPI cards */}
        {kpi && (
          <View style={styles.kpiGrid}>
            <KpiCard label="Tips This Week"  value={centsToCAD(kpi.tipsThisWeekCents)} accent={BLUE} />
            <KpiCard label="Total Staff"     value={String(kpi.totalStaff)}            accent={BLUE} />
            <KpiCard label="Active Shifts"   value={String(kpi.activeShifts)}          accent={AMBER} />
            <KpiCard label="House Pool"      value={centsToCAD(kpi.housePoolCents)}    accent={AMBER} />
          </View>
        )}

        {/* Location Manager */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATION MANAGER</Text>
          <View style={styles.card}>
            {manager ? (
              <View style={styles.managerRow}>
                <View style={[styles.avatar, { backgroundColor: BLUE_DIM }]}>
                  <Text style={[styles.avatarText, { color: BLUE }]}>{manager.name[0]}</Text>
                </View>
                <View style={styles.managerInfo}>
                  <Text style={styles.managerName}>{manager.name}</Text>
                  <Text style={styles.managerEmail}>{manager.email}</Text>
                </View>
                <View style={[styles.badge, {
                  backgroundColor: manager.inviteSentAt ? GREEN_DIM : AMBER_DIM,
                  borderColor: manager.inviteSentAt ? GREEN_BORDER : AMBER_BORDER,
                }]}>
                  <Text style={[styles.badgeText, {
                    color: manager.inviteSentAt ? GREEN : AMBER,
                  }]}>
                    {manager.inviteSentAt ? '✓ Active' : 'Pending'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No manager assigned yet.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Staff list */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>STAFF</Text>
            <View style={styles.staffCountBadge}>
              <Text style={styles.staffCountText}>{staff.length}</Text>
            </View>
            {unlinkedCount > 0 && (
              <View style={[styles.badge, { backgroundColor: RED_DIM, borderColor: RED_BORDER }]}>
                <Text style={[styles.badgeText, { color: RED }]}>{unlinkedCount} unlinked</Text>
              </View>
            )}
          </View>
          <View style={styles.card}>
            {staff.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No staff members yet.</Text>
              </View>
            ) : (
              staff.map((member, index) => (
                <View
                  key={member.id}
                  style={[styles.staffRow, index < staff.length - 1 && styles.rowBorder]}>
                  <View style={styles.staffLeft}>
                    <View style={styles.staffAvatar}>
                      <Text style={styles.staffAvatarText}>{member.name[0]}</Text>
                    </View>
                    <View style={styles.staffInfo}>
                      <Text style={styles.staffName}>{member.name}</Text>
                      <Text style={styles.staffRole}>{roleLabel(member.role)}</Text>
                    </View>
                  </View>
                  <View style={[styles.badge, {
                    backgroundColor: member.bankLinked ? GREEN_DIM : RED_DIM,
                    borderColor: member.bankLinked ? GREEN_BORDER : RED_BORDER,
                  }]}>
                    <Text style={[styles.badgeText, { color: member.bankLinked ? GREEN : RED }]}>
                      {member.bankLinked ? '✓ Linked' : '✕ Unlinked'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Recent shifts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT SHIFTS</Text>
          <View style={styles.card}>
            {shifts.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No shifts yet.</Text>
              </View>
            ) : (
              shifts.map((shift, index) => (
                <View
                  key={shift.id}
                  style={[styles.shiftRow, index < shifts.length - 1 && styles.rowBorder]}>
                  <View style={styles.shiftLeft}>
                    <Text style={styles.shiftName}>{shift.name}</Text>
                    <Text style={styles.shiftDate}>
                      {formatDate(shift.date)} · {shift.staffCount} staff
                    </Text>
                  </View>
                  <Text style={styles.shiftTips}>{centsToCAD(shift.totalTipsCents)}</Text>
                </View>
              ))
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: BLUE },
  posBadge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  posText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },

  titleBlock: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  locationName: { fontSize: 26, fontWeight: '900', color: WHITE, letterSpacing: -0.5, flex: 1 },
  locationCity: { fontSize: 14, color: MUTED, marginLeft: 20 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    width: '47.5%',
    gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },

  section: { gap: 10 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  staffCountBadge: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  staffCountText: { fontSize: 11, fontWeight: '700', color: BLUE },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },

  // Manager
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  managerInfo: { flex: 1, gap: 2 },
  managerName: { fontSize: 15, fontWeight: '700', color: WHITE },
  managerEmail: { fontSize: 12, color: MUTED },

  // Staff
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  staffLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f3028',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { fontSize: 15, fontWeight: '700', color: BLUE },
  staffInfo: { gap: 2 },
  staffName: { fontSize: 14, fontWeight: '700', color: WHITE },
  staffRole: { fontSize: 12, color: MUTED },

  // Shifts
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  shiftLeft: { flex: 1, gap: 3 },
  shiftName: { fontSize: 14, fontWeight: '700', color: WHITE },
  shiftDate: { fontSize: 12, color: MUTED },
  shiftTips: { fontSize: 15, fontWeight: '800', color: BLUE },

  // Shared
  rowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  badge: { borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  emptyRow: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED },
});
