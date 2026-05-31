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
  const [modalTab, setModalTab]         = useState<'manual' | 'csv'>('manual');

  // Manual tab
  const [newName, setNewName]     = useState('');
  const [newCity, setNewCity]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [modalError, setModalError] = useState('');

  // CSV tab
  type CsvRow = { name: string; city: string };
  const [csvRows, setCsvRows]         = useState<CsvRow[]>([]);
  const [csvError, setCsvError]       = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvSuccess, setCsvSuccess]   = useState('');

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

  function parseCSV(text: string): CsvRow[] {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const nameIdx = headers.indexOf('name');
    const cityIdx = headers.indexOf('city');
    if (nameIdx === -1) throw new Error('CSV must have a "name" column.');
    if (cityIdx === -1) throw new Error('CSV must have a "city" column.');
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return { name: cols[nameIdx] ?? '', city: cols[cityIdx] ?? '' };
    }).filter(r => r.name);
  }

  function pickCSVFile() {
    if (typeof document === 'undefined') return;
    setCsvError('');
    setCsvSuccess('');
    setCsvRows([]);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) throw new Error('No valid rows found in CSV.');
        setCsvRows(rows);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Failed to parse CSV.');
      }
    };
    input.click();
  }

  async function handleImportCSV() {
    if (csvRows.length === 0) return;
    setCsvError('');
    setCsvImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const { data: manager } = await supabase
        .from('managers')
        .select('organisation_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      const orgId = manager?.organisation_id ?? null;
      const rows = csvRows.map(r => ({ name: r.name, city: r.city, organisation_id: orgId }));
      const { error } = await supabase.from('locations').insert(rows);
      if (error) throw error;
      const count = rows.length;
      setCsvSuccess(`${count} location${count !== 1 ? 's' : ''} added successfully.`);
      setCsvRows([]);
      await fetchLocations();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setCsvImporting(false);
    }
  }

  function openModal() {
    setNewName('');
    setNewCity('');
    setModalError('');
    setModalTab('manual');
    setCsvRows([]);
    setCsvError('');
    setCsvSuccess('');
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

              {/* Tabs */}
              <View style={styles.tabRow}>
                <Pressable
                  style={[styles.tab, modalTab === 'manual' && styles.tabActive]}
                  onPress={() => setModalTab('manual')}>
                  <Text style={[styles.tabText, modalTab === 'manual' && styles.tabTextActive]}>Manual</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, modalTab === 'csv' && styles.tabActive]}
                  onPress={() => setModalTab('csv')}>
                  <Text style={[styles.tabText, modalTab === 'csv' && styles.tabTextActive]}>Import CSV</Text>
                </Pressable>
              </View>

              {/* Manual tab */}
              {modalTab === 'manual' && (
                <View style={styles.tabContent}>
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
                </View>
              )}

              {/* CSV tab */}
              {modalTab === 'csv' && (
                <View style={styles.tabContent}>
                  <Text style={styles.csvHint}>
                    CSV must have <Text style={styles.csvCode}>name</Text> and <Text style={styles.csvCode}>city</Text> columns.
                  </Text>

                  <Pressable style={styles.pickFileBtn} onPress={pickCSVFile}>
                    <Text style={styles.pickFileBtnText}>Choose CSV File</Text>
                  </Pressable>

                  {csvError ? <Text style={styles.modalError}>{csvError}</Text> : null}
                  {csvSuccess ? <Text style={styles.csvSuccessText}>{csvSuccess}</Text> : null}

                  {csvRows.length > 0 && (
                    <View style={styles.csvPreview}>
                      <Text style={styles.csvPreviewLabel}>
                        Preview — {csvRows.length} location{csvRows.length !== 1 ? 's' : ''}
                      </Text>
                      {csvRows.slice(0, 8).map((row, i) => (
                        <View key={i} style={styles.csvPreviewRow}>
                          <Text style={styles.csvPreviewName}>{row.name}</Text>
                          <Text style={styles.csvPreviewCity}>{row.city}</Text>
                        </View>
                      ))}
                      {csvRows.length > 8 && (
                        <Text style={styles.csvMore}>+ {csvRows.length - 8} more</Text>
                      )}
                    </View>
                  )}

                  <View style={styles.modalActions}>
                    <Pressable style={styles.cancelBtn} onPress={() => setModalVisible(false)} disabled={csvImporting}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveBtn, (csvRows.length === 0 || csvImporting) && styles.saveBtnDisabled]}
                      onPress={handleImportCSV}
                      disabled={csvRows.length === 0 || csvImporting}>
                      {csvImporting
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.saveBtnText}>
                            {csvRows.length > 0 ? `Import ${csvRows.length}` : 'Import'}
                          </Text>}
                    </Pressable>
                  </View>
                </View>
              )}
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

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#0f1a13',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: BLUE },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: '#fff' },
  tabContent: { gap: 10 },

  csvHint: { fontSize: 12, color: MUTED, lineHeight: 18 },
  csvCode: { color: WHITE, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pickFileBtn: {
    borderWidth: 1,
    borderColor: BLUE,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickFileBtnText: { fontSize: 14, fontWeight: '600', color: BLUE },
  csvSuccessText: { fontSize: 13, color: '#22c55e', fontWeight: '600', textAlign: 'center' },
  csvPreview: {
    backgroundColor: '#0f1a13',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f3028',
    overflow: 'hidden',
  },
  csvPreviewLabel: {
    fontSize: 10, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#1f3028',
  },
  csvPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2520',
  },
  csvPreviewName: { fontSize: 13, color: WHITE, fontWeight: '500' },
  csvPreviewCity: { fontSize: 13, color: MUTED },
  csvMore: { fontSize: 12, color: MUTED, textAlign: 'center', paddingVertical: 8 },

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
