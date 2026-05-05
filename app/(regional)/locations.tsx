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
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65, 105, 225, 0.15)';
const AMBER = '#f59e0b';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

const posColor: Record<string, string> = {
  square:     BLUE,
  lightspeed: AMBER,
  csv:        '#a78bfa',
  manual:     MUTED,
};

type LocationRow = {
  id: string;
  name: string;
  city: string;
  posType: string;
  housePoolCents: number;
  staffTotal: number;
  bankLinked: number;
  tipsThisWeekCents: number;
};

export default function RegionalLocations() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async () => {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const [locsRes, staffRes, shiftsRes] = await Promise.all([
        supabase.from('locations').select('id, name, city, pos_type, house_pool_balance'),
        supabase.from('staff_members').select('id, location_id, bank_linked'),
        supabase.from('shifts').select('location_id, total_tips').gte('date', weekStartStr),
      ]);

      const locs = locsRes.data ?? [];
      const staff = staffRes.data ?? [];
      const shifts = shiftsRes.data ?? [];

      setLocations(
        locs.map(loc => {
          const locStaff = staff.filter(s => s.location_id === loc.id);
          const locShifts = shifts.filter(s => s.location_id === loc.id);
          const tipsThisWeekCents = locShifts.reduce((sum, s) => sum + (s.total_tips ?? 0), 0);
          return {
            id: loc.id,
            name: loc.name,
            city: loc.city,
            posType: loc.pos_type ?? 'manual',
            housePoolCents: loc.house_pool_balance ?? 0,
            staffTotal: locStaff.length,
            bankLinked: locStaff.filter(s => s.bank_linked).length,
            tipsThisWeekCents,
          };
        })
      );
    } catch (err) {
      console.log('[Locations] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchLocations(); }, [fetchLocations]));
  useWebFocus(fetchLocations);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Locations</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{locations.length} location{locations.length !== 1 ? 's' : ''}</Text>
        </View>
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

          {locations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No locations found.</Text>
            </View>
          ) : (
            locations.map(loc => {
              const unlinked = loc.staffTotal - loc.bankLinked;
              const posKey = loc.posType?.toLowerCase() ?? 'manual';
              const posAccent = posColor[posKey] ?? BLUE;
              const posLabel = loc.posType
                ? loc.posType.charAt(0).toUpperCase() + loc.posType.slice(1)
                : 'Manual';
              const allLinked = unlinked === 0 && loc.staffTotal > 0;

              return (
                <View key={loc.id} style={styles.locationCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.statusDot, { backgroundColor: allLinked ? '#22c55e' : unlinked > 2 ? '#f87171' : AMBER }]} />
                      <View>
                        <Text style={styles.locationName}>{loc.name}</Text>
                        <Text style={styles.locationCity}>{loc.city}</Text>
                      </View>
                    </View>
                    <View style={[styles.posBadge, { borderColor: posAccent }]}>
                      <Text style={[styles.posText, { color: posAccent }]}>{posLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Stats Row */}
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        ${Math.round(loc.tipsThisWeekCents / 100).toLocaleString('en-CA')}
                      </Text>
                      <Text style={styles.statLabel}>Tips This Week</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{loc.staffTotal}</Text>
                      <Text style={styles.statLabel}>Staff Total</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: AMBER }]}>
                        ${(loc.housePoolCents / 100).toFixed(0)}
                      </Text>
                      <Text style={styles.statLabel}>House Pool</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Footer */}
                  <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                      <View style={styles.bankRow}>
                        <Text style={styles.bankText}>
                          {loc.bankLinked}/{loc.staffTotal} bank linked
                        </Text>
                        {unlinked > 0 && (
                          <View style={styles.bankWarning}>
                            <Text style={styles.bankWarningText}>{unlinked} unlinked</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Pressable
                      style={styles.viewBtn}
                      onPress={() => router.push({
                        pathname: '/(regional)/location-detail' as any,
                        params: { locationId: loc.id },
                      })}>
                      <Text style={styles.viewBtnText}>View Details</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 16 },
  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED },

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
  posBadge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  posText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: BORDER },
  statsRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16 },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, backgroundColor: BORDER },
  statValue: { fontSize: 16, fontWeight: '800', color: BLUE },
  statLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerLeft: { gap: 4 },
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
    backgroundColor: BLUE_DIM,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BLUE,
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: BLUE },
});
