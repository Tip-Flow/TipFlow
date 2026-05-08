import { useCallback, useRef, useState } from 'react';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import {
  ActivityIndicator,
  Animated,
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
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG           = '#09100e';
const CARD         = '#162019';
const BLUE         = '#4169E1';
const BLUE_DIM     = 'rgba(65,105,225,0.15)';
const BLUE_BORDER  = 'rgba(65,105,225,0.4)';
const GREEN        = '#22c55e';
const GREEN_DIM    = 'rgba(34,197,94,0.15)';
const AMBER        = '#f59e0b';
const AMBER_DIM    = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const RED          = '#ef4444';
const RED_DIM      = 'rgba(239,68,68,0.15)';
const RED_BORDER   = 'rgba(239,68,68,0.4)';
const MUTED        = '#6b7a74';
const WHITE        = '#e8f0ec';
const BORDER       = '#1f3028';

type Level = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Elite';

const levelStyle: Record<Level, { bg: string; text: string }> = {
  Bronze:   { bg: 'rgba(180,83,9,0.2)',    text: '#d97706' },
  Silver:   { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' },
  Gold:     { bg: 'rgba(245,158,11,0.2)',  text: AMBER     },
  Platinum: { bg: 'rgba(139,92,246,0.2)',  text: '#a78bfa' },
  Elite:    { bg: BLUE_DIM,               text: BLUE      },
};

function getTierFromEarnings(cents: number): Level {
  if (cents >= 500000) return 'Elite';
  if (cents >= 300000) return 'Platinum';
  if (cents >= 150000) return 'Gold';
  if (cents >= 50000)  return 'Silver';
  return 'Bronze';
}

type StaffRow = {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
  totalEarnedCents: number;
};

type ManagerRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  locationId: string | null;
  locationName: string;
  inviteSentAt: string | null;
};

type LocationGroup = {
  locationId: string;
  locationName: string;
  staff: StaffRow[];
};

type LocationOption = { id: string; name: string };

const ALL = 'All Locations';

async function callInviteFunction(payload: {
  name: string;
  email: string;
  role: string;
  location_id: string | null;
  organisation_id: string | null;
}): Promise<{ error: Error | null; note: string | null; recordId: string | null }> {
  const { data, error } = await supabase.functions.invoke('send-staff-invite', { body: payload });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch {}
    return { error: new Error(message), note: null, recordId: null };
  }
  return { error: null, note: data?.note ?? null, recordId: data?.record_id ?? null };
}

export default function RegionalTeam() {
  const isDesktop = useIsDesktop();
  const [groups, setGroups]                   = useState<LocationGroup[]>([]);
  const [managers, setManagers]               = useState<ManagerRow[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([ALL]);
  const [locationList, setLocationList]       = useState<LocationOption[]>([]);
  const [orgId, setOrgId]                     = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState(ALL);
  const [search, setSearch]                   = useState('');
  const [loading, setLoading]                 = useState(true);

  // Invite manager modal
  const [modalVisible, setModalVisible] = useState(false);
  const [inviteName, setInviteName]     = useState('');
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteLocId, setInviteLocId]   = useState('');
  const [inviting, setInviting]         = useState(false);
  const [inviteError, setInviteError]   = useState('');

  // Remove manager state
  const [confirmRemove, setConfirmRemove] = useState<ManagerRow | null>(null);
  const [removing, setRemoving]           = useState(false);

  // Toast
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg]       = useState('');
  const [toastIsError, setToastIsError] = useState(false);

  function showToast(msg: string, isError = false) {
    setToastMsg(msg);
    setToastIsError(isError);
    toastOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }

  const fetchTeam = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email ?? '';

      const [staffRes, locsRes, allocRes, managerRes, myManagerRes] = await Promise.all([
        supabase.from('staff_members').select('id, name, role, location_id'),
        supabase.from('locations').select('id, name, organisation_id').order('name'),
        supabase.from('tip_allocations').select('staff_id, calculated_amount').not('paid_at', 'is', null),
        supabase.from('managers').select('id, name, email, role, location_id, invite_sent_at').eq('role', 'location_manager'),
        supabase.from('managers').select('organisation_id').eq('email', userEmail).maybeSingle(),
      ]);

      const staff  = staffRes.data  ?? [];
      const locs   = locsRes.data   ?? [];
      const allocs = allocRes.data  ?? [];
      const mgrs   = managerRes.data ?? [];
      const myOrg  = myManagerRes.data?.organisation_id ?? null;
      setOrgId(myOrg);

      const earningsByStaff: Record<string, number> = {};
      for (const alloc of allocs) {
        earningsByStaff[alloc.staff_id] = (earningsByStaff[alloc.staff_id] ?? 0) + (alloc.calculated_amount ?? 0);
      }

      const locMap = Object.fromEntries(locs.map(l => [l.id, l.name]));

      const rows: StaffRow[] = staff.map(s => ({
        id: s.id, name: s.name, role: s.role, locationId: s.location_id,
        locationName: locMap[s.location_id] ?? 'Unknown',
        totalEarnedCents: earningsByStaff[s.id] ?? 0,
      }));

      const locNames = [...new Set(locs.map(l => l.name))].sort();
      setLocationOptions([ALL, ...locNames]);
      setLocationList(locs.map(l => ({ id: l.id, name: l.name })));

      const grouped: LocationGroup[] = locs.map(loc => ({
        locationId: loc.id, locationName: loc.name,
        staff: rows.filter(r => r.locationId === loc.id).sort((a, b) => b.totalEarnedCents - a.totalEarnedCents),
      })).filter(g => g.staff.length > 0);

      setGroups(grouped);

      const mgrRows: ManagerRow[] = mgrs.map(m => ({
        id: m.id, name: m.name, email: m.email, role: m.role,
        locationId: m.location_id,
        locationName: locMap[m.location_id ?? ''] ?? 'No location',
        inviteSentAt: m.invite_sent_at,
      }));
      setManagers(mgrRows);
    } catch (err) {
      console.log('[Team] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchTeam(); }, [fetchTeam]));
  useWebFocus(fetchTeam);

  async function handleInviteManager() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteError('');
    setInviting(true);
    try {
      const { error, note } = await callInviteFunction({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: 'location_manager',
        location_id: inviteLocId || null,
        organisation_id: orgId,
      });

      if (error) { setInviteError(error.message); return; }

      setInviteName(''); setInviteEmail(''); setInviteLocId('');
      setModalVisible(false);
      await fetchTeam();
      showToast(note ? `${inviteEmail.trim()} is already registered.` : `Invite sent to ${inviteEmail.trim()}.`);
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(manager: ManagerRow) {
    const { error, note } = await callInviteFunction({
      name: manager.name, email: manager.email,
      role: manager.role, location_id: manager.locationId, organisation_id: orgId,
    });
    if (error) { showToast(`Failed: ${error.message}`, true); return; }
    await fetchTeam();
    showToast(note ? `${manager.email} already has an account.` : 'Invite resent.');
  }

  async function handleConfirmRemove() {
    if (!confirmRemove) return;
    const mgr = confirmRemove;
    setConfirmRemove(null);
    setRemoving(true);
    try {
      const { data, error } = await supabase.functions.invoke('remove-user', {
        body: { record_id: mgr.id, table: 'managers' },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        showToast(`Failed to remove ${mgr.name}: ${msg}`, true);
        return;
      }
      if (data?.error) { showToast(`Failed to remove ${mgr.name}: ${data.error}`, true); return; }
      await fetchTeam();
      showToast(`${mgr.name} removed from Mise.`);
    } catch (err: unknown) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setRemoving(false);
    }
  }

  const filtered = groups
    .filter(g => selectedLocation === ALL || g.locationName === selectedLocation)
    .map(g => ({
      ...g,
      staff: g.staff.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.role.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(g => g.staff.length > 0);

  const totalVisible = filtered.reduce((sum, g) => sum + g.staff.length, 0);

  // Invite modal content
  const inviteModalContent = (
    <KeyboardAvoidingView
      style={styles.modalOverlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.modalBackdrop} onPress={() => { setModalVisible(false); setInviteError(''); }} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Invite Location Manager</Text>
        <Text style={styles.modalSubtitle}>
          They'll receive an invite email and be routed to the Manager portal on first login.
        </Text>

        <View style={styles.modalForm}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput style={styles.modalInput} value={inviteName} onChangeText={setInviteName}
              placeholder="e.g. Alex Chen" placeholderTextColor="#3d4f47" autoCapitalize="words" />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput style={styles.modalInput} value={inviteEmail} onChangeText={setInviteEmail}
              placeholder="e.g. alex@canteen.ca" placeholderTextColor="#3d4f47"
              autoCapitalize="none" keyboardType="email-address" />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>LOCATION (OPTIONAL)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locChipRow}>
              {locationList.map(loc => (
                <Pressable key={loc.id}
                  style={[styles.locChip, inviteLocId === loc.id && styles.locChipActive]}
                  onPress={() => setInviteLocId(prev => prev === loc.id ? '' : loc.id)}>
                  <Text style={[styles.locChipText, inviteLocId === loc.id && styles.locChipTextActive]}>
                    {loc.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        {inviteError ? (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{inviteError}</Text>
          </View>
        ) : null}

        <Pressable style={[styles.modalBtn, inviting && styles.btnDisabled]}
          onPress={handleInviteManager} disabled={inviting}>
          {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Send Invite →</Text>}
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => { setModalVisible(false); setInviteError(''); }}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );

  // Confirm remove content
  const confirmRemoveContent = confirmRemove ? (
    <KeyboardAvoidingView style={styles.modalOverlay} behavior={undefined}>
      <Pressable style={styles.modalBackdrop} onPress={() => setConfirmRemove(null)} />
      <View style={[styles.modalSheet, styles.confirmSheet]}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Remove Manager</Text>
        <Text style={styles.confirmBody}>
          Remove{' '}
          <Text style={{ color: WHITE, fontWeight: '700' }}>{confirmRemove.name}</Text>
          {' '}from Mise?{'\n\n'}They will lose access immediately.
        </Text>
        <Pressable style={[styles.removeConfirmBtn, removing && styles.btnDisabled]}
          onPress={handleConfirmRemove} disabled={removing}>
          <Text style={styles.removeConfirmBtnText}>{removing ? 'Removing…' : 'Remove from Mise'}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => setConfirmRemove(null)}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={[styles.safe, { flex: 1 }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Team</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{totalVisible} staff</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput style={styles.searchInput} placeholder="Search by name or role..."
            placeholderTextColor="#4a5e56" value={search} onChangeText={setSearch}
            autoCapitalize="none" returnKeyType="search" />
        </View>

        {/* Location filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {locationOptions.map(loc => (
            <Pressable key={loc} style={[styles.chip, selectedLocation === loc && styles.chipActive]}
              onPress={() => setSelectedLocation(loc)}>
              <Text style={[styles.chipText, selectedLocation === loc && styles.chipTextActive]}>{loc}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Invite Manager button */}
        <View style={styles.inviteRow}>
          <Pressable style={({ pressed }) => [styles.inviteBtn, pressed && styles.inviteBtnPressed]}
            onPress={() => { setInviteError(''); setModalVisible(true); }}>
            <Text style={styles.inviteBtnText}>+ Invite Manager</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>

            {/* Location Managers section */}
            {managers.length > 0 && (
              <View style={styles.locationGroup}>
                <View style={styles.sectionHeadRow}>
                  <Text style={styles.locationLabel}>Location Managers</Text>
                  <View style={[styles.countBadge, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
                    <Text style={[styles.countText, { color: AMBER }]}>{managers.length}</Text>
                  </View>
                </View>
                <View style={styles.staffCard}>
                  {managers.map((mgr, index) => (
                    <View key={mgr.id} style={[styles.staffRow, index < managers.length - 1 && styles.rowBorder]}>
                      <View style={styles.staffLeft}>
                        <View style={[styles.avatar, { backgroundColor: AMBER_DIM }]}>
                          <Text style={[styles.avatarText, { color: AMBER }]}>{mgr.name[0]}</Text>
                        </View>
                        <View style={styles.staffInfo}>
                          <Text style={styles.staffName}>{mgr.name}</Text>
                          <Text style={styles.staffRole}>{mgr.locationName}</Text>
                        </View>
                      </View>
                      <View style={styles.staffRight}>
                        {mgr.inviteSentAt ? (
                          <View style={[styles.levelBadge, { backgroundColor: GREEN_DIM }]}>
                            <Text style={[styles.levelText, { color: GREEN }]}>✓ Invited</Text>
                          </View>
                        ) : (
                          <View style={[styles.levelBadge, { backgroundColor: AMBER_DIM }]}>
                            <Text style={[styles.levelText, { color: AMBER }]}>Pending</Text>
                          </View>
                        )}
                        <Pressable onPress={() => handleResendInvite(mgr)}>
                          <Text style={styles.resendText}>{mgr.inviteSentAt ? 'Resend' : 'Send invite'}</Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirmRemove(mgr)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Staff grouped by location */}
            {filtered.map(group => (
              <View key={group.locationId} style={styles.locationGroup}>
                <Text style={styles.locationLabel}>{group.locationName}</Text>
                <View style={styles.staffCard}>
                  {group.staff.map((member, index) => {
                    const level = getTierFromEarnings(member.totalEarnedCents);
                    const badge = levelStyle[level];
                    return (
                      <View key={member.id} style={[styles.staffRow, index < group.staff.length - 1 && styles.rowBorder]}>
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
                            <Text style={[styles.levelText, { color: badge.text }]}>{level}</Text>
                          </View>
                          <Text style={styles.staffTips}>
                            ${(member.totalEarnedCents / 100).toLocaleString('en-CA', { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}

            {filtered.length === 0 && managers.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {search ? 'No staff found matching your search.' : 'No staff members yet.'}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Toast */}
      <Animated.View pointerEvents="none"
        style={[styles.toast, { opacity: toastOpacity, backgroundColor: toastIsError ? RED : '#16a34a' }]}>
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

      {/* Invite Manager Modal */}
      {Platform.OS === 'web' ? (
        modalVisible ? (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 50 }]}>{inviteModalContent}</View>
        ) : null
      ) : (
        <Modal visible={modalVisible} animationType="slide" transparent
          onRequestClose={() => { setModalVisible(false); setInviteError(''); }}>
          {inviteModalContent}
        </Modal>
      )}

      {/* Confirm Remove Modal */}
      {Platform.OS === 'web' ? (
        confirmRemove ? (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 50 }]}>{confirmRemoveContent}</View>
        ) : null
      ) : (
        <Modal visible={!!confirmRemove} transparent animationType="fade"
          onRequestClose={() => setConfirmRemove(null)}>
          {confirmRemoveContent ?? <View />}
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: BG },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  countBadge: { backgroundColor: BLUE_DIM, borderWidth: 1, borderColor: BLUE_BORDER, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  countText: { fontSize: 12, fontWeight: '700', color: BLUE },
  inviteRow: { paddingHorizontal: 20, paddingBottom: 8 },
  inviteBtn: { backgroundColor: AMBER_DIM, borderWidth: 1, borderColor: AMBER_BORDER, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  inviteBtnPressed: { opacity: 0.75 },
  inviteBtnText: { fontSize: 14, fontWeight: '700', color: AMBER },
  searchWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  searchInput: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 15, color: WHITE },
  filterRow: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER },
  chipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: BLUE },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationGroup: { gap: 10 },
  locationLabel: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 1, textTransform: 'uppercase' },
  staffCard: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  staffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  staffLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1f3028', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: BLUE },
  staffInfo: { gap: 2 },
  staffName: { fontSize: 15, fontWeight: '700', color: WHITE },
  staffRole: { fontSize: 12, color: MUTED },
  staffRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  levelText: { fontSize: 11, fontWeight: '700' },
  staffTips: { fontSize: 13, fontWeight: '600', color: BLUE },
  resendText: { fontSize: 12, fontWeight: '600', color: AMBER },
  removeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED_BORDER, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 10, color: RED, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: MUTED, textAlign: 'center' },

  toast: { position: 'absolute', top: 60, left: 16, right: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, zIndex: 100 },
  toastText: { fontSize: 14, color: '#fff', fontWeight: '700', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, borderTopWidth: 1, borderColor: BORDER },
  confirmSheet: { paddingBottom: 32 },
  modalHandle: { width: 36, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  modalSubtitle: { fontSize: 13, color: MUTED, lineHeight: 18 },
  confirmBody: { fontSize: 15, color: MUTED, lineHeight: 24 },
  modalForm: { gap: 14 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: { backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: WHITE },
  locChipRow: { gap: 8, flexDirection: 'row' },
  locChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  locChipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER },
  locChipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  locChipTextActive: { color: BLUE },
  formErrorBox: { backgroundColor: RED_DIM, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: RED_BORDER },
  formErrorText: { fontSize: 13, color: RED, fontWeight: '600' },
  modalBtn: { backgroundColor: AMBER, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  removeConfirmBtn: { backgroundColor: RED, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  removeConfirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: MUTED, fontSize: 15, fontWeight: '600' },
});
