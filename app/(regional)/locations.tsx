import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName]           = useState('');
  const [newCity, setNewCity]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [modalError, setModalError]     = useState('');

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

  async function handleAddLocation() {
    const name = newName.trim();
    const city = newCity.trim();
    if (!name) { setModalError('Location name is required.'); return; }
    if (!city) { setModalError('City is required.'); return; }
    setModalError('');
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');

      const { data: manager } = await supabase
        .from('managers')
        .select('organisation_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      const { error } = await supabase
        .from('locations')
        .insert({ name, city, organisation_id: manager?.organisation_id ?? null });

      if (error) throw error;

      setModalVisible(false);
      setNewName('');
      setNewCity('');
      await fetchLocations();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  }

  function openModal() {
    setNewName('');
    setNewCity('');
    setModalError('');
    setModalVisible(true);
  }

  useFocusEffect(useCallback(() => { fetchLocations(); }, [fetchLocations]));
  useWebFocus(fetchLocations);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Locations</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{locations.length} location{locations.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openModal}>
          <Text style={styles.addBtnText}>+ Add Location</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Add Location</Text>

              <Text style={styles.fieldLabel}>Location Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. The Elm Street Bar"
                placeholderTextColor="#4a5e56"
                value={newName}
                onChangeText={setNewName}
                autoCapitalize="words"
                returnKeyType="next"
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Toronto"
                placeholderTextColor="#4a5e56"
                value={newCity}
                onChangeText={setNewCity}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleAddLocation}
                editable={!saving}
              />

              {modalError ? <Text style={styles.modalError}>{modalError}</Text> : null}

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setModalVisible(false)} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleAddLocation} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add Location</Text>}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

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

  addBtn: {
    marginLeft: 'auto',
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#162019',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f3028',
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#e8f0ec', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.3 },
  modalInput: {
    backgroundColor: '#0f1a13',
    borderWidth: 1,
    borderColor: '#1f3028',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#e8f0ec',
  },
  modalError: { fontSize: 13, color: '#f87171', fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f3028',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: MUTED },
  saveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: BLUE,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
