import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

const BG     = '#09100e';
const CARD   = '#162019';
const BLUE   = '#4169E1';
const BLUE_DIM   = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const GREEN  = '#22c55e';
const GREEN_DIM  = 'rgba(34,197,94,0.15)';
const GREEN_BORDER = 'rgba(34,197,94,0.4)';
const AMBER  = '#f59e0b';
const AMBER_DIM  = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const RED    = '#ef4444';
const RED_DIM    = 'rgba(239,68,68,0.15)';
const RED_BORDER = 'rgba(239,68,68,0.4)';
const MUTED  = '#6b7a74';
const WHITE  = '#e8f0ec';
const BORDER = '#1f3028';

type Org = { id: string; name: string; city: string | null; country: string | null };
type Loc = { id: string; name: string; organisation_id: string | null };
type RegionalManager = { id: string; name: string; email: string; organisationId: string | null; orgName: string; inviteSentAt: string | null };

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Field({
  label, value, onChange, placeholder, keyboardType,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange}
        placeholder={placeholder ?? label} placeholderTextColor="#3d4f47"
        autoCapitalize="none" keyboardType={keyboardType ?? 'default'} />
    </View>
  );
}

function Picker<T extends { id: string; label: string }>({
  label, options, selectedId, onSelect,
}: {
  label: string; options: T[]; selectedId: string; onSelect: (id: string) => void;
}) {
  const selected = options.find(o => o.id === selectedId);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
        {options.map(opt => (
          <Pressable key={opt.id} style={[styles.chip, opt.id === selectedId && styles.chipActive]}
            onPress={() => onSelect(opt.id)}>
            <Text style={[styles.chipText, opt.id === selectedId && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
        {options.length === 0 && <Text style={styles.emptyChip}>None yet</Text>}
      </ScrollView>
      {selected && <Text style={styles.selectedLabel}>Selected: {selected.label}</Text>}
    </View>
  );
}

export default function AdminScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [regionalManagers, setRegionalManagers] = useState<RegionalManager[]>([]);

  // Org form
  const [orgName, setOrgName] = useState('');
  const [orgCity, setOrgCity] = useState('');
  const [orgCountry, setOrgCountry] = useState('Canada');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Location form
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locOrgId, setLocOrgId] = useState('');
  const [creatingLoc, setCreatingLoc] = useState(false);

  // Regional manager invite form
  const [rmName, setRmName] = useState('');
  const [rmEmail, setRmEmail] = useState('');
  const [rmOrgId, setRmOrgId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Remove state
  const [confirmRemove, setConfirmRemove] = useState<RegionalManager | null>(null);
  const [removing, setRemoving] = useState(false);

  // Toast
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');
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

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const email = (user?.email ?? '').toLowerCase();
    console.log('[Admin] loadData — user email:', email, 'isAdmin:', ADMIN_EMAILS.includes(email));
    const admin = ADMIN_EMAILS.includes(email);
    setIsAdmin(admin);
    if (!admin) return;

    const [orgRes, locRes, rmRes] = await Promise.all([
      supabase.from('organisations').select('id, name, city, country').order('name'),
      supabase.from('locations').select('id, name, organisation_id').order('name'),
      supabase.from('managers').select('id, name, email, organisation_id, invite_sent_at').eq('role', 'regional_manager').order('name'),
    ]);
    setOrgs(orgRes.data ?? []);
    setLocs(locRes.data ?? []);

    const orgMap = Object.fromEntries((orgRes.data ?? []).map(o => [o.id, o.name]));
    setRegionalManagers(
      (rmRes.data ?? []).map(m => ({
        id: m.id, name: m.name, email: m.email,
        organisationId: m.organisation_id,
        orgName: orgMap[m.organisation_id ?? ''] ?? 'No org',
        inviteSentAt: m.invite_sent_at,
      }))
    );
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useWebFocus(loadData);

  async function handleCreateOrg() {
    if (!orgName.trim()) { showToast('Organisation name is required', true); return; }
    setCreatingOrg(true);
    try {
      const payload = { name: orgName.trim(), city: orgCity.trim() || null, country: orgCountry.trim() || null };
      const { data, error } = await supabase.from('organisations').insert(payload).select();
      console.log('[Admin] createOrg response — data:', JSON.stringify(data), 'error:', JSON.stringify(error));
      if (error) throw new Error(`${error.message} (code: ${error.code})`);
      setOrgName(''); setOrgCity(''); setOrgCountry('Canada');
      await loadData();
      showToast('Organisation created.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleCreateLocation() {
    if (!locName.trim()) { showToast('Location name is required', true); return; }
    setCreatingLoc(true);
    try {
      const payload = { name: locName.trim(), city: locAddress.trim() || '', organisation_id: locOrgId || null, pos_type: 'manual', cra_tip_type: 'direct' };
      const { data, error } = await supabase.from('locations').insert(payload).select();
      console.log('[Admin] createLocation response — data:', JSON.stringify(data), 'error:', JSON.stringify(error));
      if (error) throw new Error(`${error.message} (code: ${error.code})`);
      setLocName(''); setLocAddress(''); setLocOrgId('');
      await loadData();
      showToast('Location created.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setCreatingLoc(false);
    }
  }

  async function handleInviteRegionalManager() {
    if (!rmName.trim() || !rmEmail.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteError('');
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-staff-invite', {
        body: { email: rmEmail.trim().toLowerCase(), name: rmName.trim(), role: 'regional_manager', organisation_id: rmOrgId || null },
      });

      if (error) {
        let message = error.message;
        try { const body = await (error as any).context?.json?.(); if (body?.error) message = body.error; } catch {}
        setInviteError(message);
        return;
      }

      setRmName(''); setRmEmail(''); setRmOrgId('');
      await loadData();
      showToast(data?.note ? `${rmEmail.trim()} already has an account.` : `Invite sent to ${rmEmail.trim()}.`);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleConfirmRemove() {
    if (!confirmRemove) return;
    const rm = confirmRemove;
    setConfirmRemove(null);
    setRemoving(true);
    try {
      const { data, error } = await supabase.functions.invoke('remove-user', {
        body: { record_id: rm.id, table: 'managers' },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        showToast(`Failed to remove ${rm.name}: ${msg}`, true);
        return;
      }
      if (data?.error) { showToast(`Failed to remove ${rm.name}: ${data.error}`, true); return; }
      await loadData();
      showToast(`${rm.name} removed from Mise.`);
    } catch (err: unknown) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setRemoving(false);
    }
  }

  if (isAdmin === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={BLUE} /></View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.deniedTitle}>Access Denied</Text>
          <Text style={styles.deniedSub}>This screen is restricted to Mise admins.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const orgOptions = orgs.map(o => ({ id: o.id, label: `${o.name}${o.city ? ` · ${o.city}` : ''}` }));

  // Confirm remove modal content
  const confirmRemoveContent = confirmRemove ? (
    <KeyboardAvoidingView style={styles.modalOverlay} behavior={undefined}>
      <Pressable style={styles.modalBackdrop} onPress={() => setConfirmRemove(null)} />
      <View style={[styles.modalSheet, styles.confirmSheet]}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Remove Regional Manager</Text>
        <Text style={styles.confirmBody}>
          Remove{' '}
          <Text style={{ color: WHITE, fontWeight: '700' }}>{confirmRemove.name}</Text>
          {' '}from Mise?{'\n\n'}They will lose access immediately.
        </Text>
        <Pressable style={[styles.removeConfirmBtn, removing && styles.btnDisabled]}
          onPress={handleConfirmRemove} disabled={removing}>
          <Text style={styles.removeConfirmBtnText}>{removing ? 'Removing…' : 'Remove from Mise'}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtnRow} onPress={() => setConfirmRemove(null)}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={[styles.safe, { flex: 1 }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={styles.pageHeader}>
              <View style={[styles.adminBadge, { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER }]}>
                <Text style={[styles.adminBadgeText, { color: BLUE }]}>MISE ADMIN</Text>
              </View>
              <Text style={styles.pageTitle}>Onboarding</Text>
              <Text style={styles.pageSubtitle}>Create organisations, locations, and invite regional managers.</Text>
            </View>

            {/* Summary chips */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryChip, { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER }]}>
                <Text style={[styles.summaryCount, { color: BLUE }]}>{orgs.length}</Text>
                <Text style={[styles.summaryLabel, { color: BLUE }]}>Orgs</Text>
              </View>
              <View style={[styles.summaryChip, { backgroundColor: GREEN_DIM, borderColor: GREEN_BORDER }]}>
                <Text style={[styles.summaryCount, { color: GREEN }]}>{locs.length}</Text>
                <Text style={[styles.summaryLabel, { color: GREEN }]}>Locations</Text>
              </View>
              <View style={[styles.summaryChip, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
                <Text style={[styles.summaryCount, { color: AMBER }]}>{regionalManagers.length}</Text>
                <Text style={[styles.summaryLabel, { color: AMBER }]}>Reg. Managers</Text>
              </View>
            </View>

            {/* Section 1: Create Organisation */}
            <View style={styles.card}>
              <SectionHeader title="1. Create Organisation" subtitle="A restaurant group or single-location brand." />
              <Field label="Name" value={orgName} onChange={setOrgName} placeholder="e.g. Canteen Group" />
              <Field label="City" value={orgCity} onChange={setOrgCity} placeholder="e.g. Toronto" />
              <Field label="Country" value={orgCountry} onChange={setOrgCountry} placeholder="Canada" />
              <Pressable style={[styles.btn, { backgroundColor: BLUE }, creatingOrg && styles.btnDisabled]}
                onPress={handleCreateOrg} disabled={creatingOrg}>
                {creatingOrg ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Organisation</Text>}
              </Pressable>
              {orgs.length > 0 && (
                <View style={styles.existingList}>
                  <Text style={styles.existingLabel}>EXISTING ({orgs.length})</Text>
                  {orgs.map(o => (
                    <View key={o.id} style={styles.existingRow}>
                      <Text style={styles.existingName}>{o.name}</Text>
                      <Text style={styles.existingMeta}>{[o.city, o.country].filter(Boolean).join(', ')}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Section 2: Create Location */}
            <View style={styles.card}>
              <SectionHeader title="2. Create Location" subtitle="A physical restaurant linked to an organisation." />
              <Field label="Name" value={locName} onChange={setLocName} placeholder="e.g. Canteen King West" />
              <Field label="Address" value={locAddress} onChange={setLocAddress} placeholder="e.g. 488 King St W, Toronto" />
              <Picker label="Organisation (optional)" options={orgOptions} selectedId={locOrgId}
                onSelect={id => setLocOrgId(prev => prev === id ? '' : id)} />
              <Pressable style={[styles.btn, { backgroundColor: GREEN }, creatingLoc && styles.btnDisabled]}
                onPress={handleCreateLocation} disabled={creatingLoc}>
                {creatingLoc ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Location</Text>}
              </Pressable>
              {locs.length > 0 && (
                <View style={styles.existingList}>
                  <Text style={styles.existingLabel}>EXISTING ({locs.length})</Text>
                  {locs.map(l => (
                    <View key={l.id} style={styles.existingRow}>
                      <Text style={styles.existingName}>{l.name}</Text>
                      <Text style={styles.existingMeta}>{orgs.find(o => o.id === l.organisation_id)?.name ?? 'No org'}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Section 3: Invite Regional Manager */}
            <View style={styles.card}>
              <SectionHeader title="3. Invite Regional Manager"
                subtitle="They'll oversee a full organisation and can invite location managers." />
              <Field label="Name" value={rmName} onChange={setRmName} placeholder="e.g. Jamie Chen" />
              <Field label="Email" value={rmEmail} onChange={setRmEmail}
                placeholder="e.g. jamie@canteen.ca" keyboardType="email-address" />
              <Picker label="Organisation (optional)" options={orgOptions} selectedId={rmOrgId}
                onSelect={id => setRmOrgId(prev => prev === id ? '' : id)} />
              {inviteError ? (
                <View style={styles.formErrorBox}>
                  <Text style={styles.formErrorText}>{inviteError}</Text>
                </View>
              ) : null}
              <Pressable style={[styles.btn, { backgroundColor: AMBER }, inviting && styles.btnDisabled]}
                onPress={handleInviteRegionalManager} disabled={inviting}>
                {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send Invite →</Text>}
              </Pressable>
              <Text style={styles.inviteNote}>
                An invite email will be sent. They'll set their password and be routed to the Regional portal on first login.
              </Text>
            </View>

            {/* Section 4: Manage Regional Managers */}
            {regionalManagers.length > 0 && (
              <View style={styles.card}>
                <SectionHeader title="4. Regional Managers"
                  subtitle="Remove access for regional managers who have left." />
                <View style={styles.rmList}>
                  {regionalManagers.map((rm, index) => (
                    <View key={rm.id} style={[styles.rmRow, index < regionalManagers.length - 1 && styles.rmRowBorder]}>
                      <View style={styles.rmLeft}>
                        <View style={styles.rmAvatar}>
                          <Text style={styles.rmAvatarText}>{rm.name[0].toUpperCase()}</Text>
                        </View>
                        <View style={styles.rmInfo}>
                          <Text style={styles.rmName}>{rm.name}</Text>
                          <Text style={styles.rmMeta}>{rm.email}</Text>
                          <Text style={styles.rmOrg}>{rm.orgName}</Text>
                        </View>
                      </View>
                      <Pressable onPress={() => setConfirmRemove(rm)} style={styles.removeBtn}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Toast */}
      <Animated.View pointerEvents="none"
        style={[styles.toast, { opacity: toastOpacity, backgroundColor: toastIsError ? RED : '#16a34a' }]}>
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedTitle: { fontSize: 20, fontWeight: '800', color: RED, marginBottom: 8 },
  deniedSub: { fontSize: 14, color: MUTED, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 20, paddingTop: 16 },

  pageHeader: { gap: 8, marginBottom: 4 },
  adminBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 },
  adminBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: WHITE, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: MUTED, lineHeight: 20 },

  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 2 },
  summaryCount: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  card: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 20, gap: 14 },
  sectionHeader: { gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: WHITE },
  sectionSubtitle: { fontSize: 13, color: MUTED, lineHeight: 18 },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#0d1812', borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: WHITE },

  pickerRow: { gap: 8, flexDirection: 'row', paddingVertical: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#0d1812', borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER },
  chipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: BLUE },
  emptyChip: { fontSize: 13, color: MUTED, fontStyle: 'italic', paddingVertical: 7 },
  selectedLabel: { fontSize: 12, color: MUTED, marginTop: 2 },

  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  formErrorBox: { backgroundColor: RED_DIM, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: RED_BORDER },
  formErrorText: { fontSize: 13, color: RED, fontWeight: '600' },

  inviteNote: { fontSize: 12, color: MUTED, lineHeight: 18, textAlign: 'center' },

  existingList: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12, gap: 8 },
  existingLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1, textTransform: 'uppercase' },
  existingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  existingName: { fontSize: 14, fontWeight: '600', color: WHITE },
  existingMeta: { fontSize: 12, color: MUTED },

  // Regional managers list
  rmList: { gap: 0, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  rmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  rmRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  rmLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rmAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: AMBER_DIM, alignItems: 'center', justifyContent: 'center' },
  rmAvatarText: { fontSize: 15, fontWeight: '800', color: AMBER },
  rmInfo: { gap: 1, flex: 1 },
  rmName: { fontSize: 14, fontWeight: '700', color: WHITE },
  rmMeta: { fontSize: 11, color: MUTED },
  rmOrg: { fontSize: 11, color: BLUE },
  removeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED_BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  removeBtnText: { fontSize: 10, color: RED, fontWeight: '800' },

  toast: { position: 'absolute', top: 60, left: 16, right: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, zIndex: 100 },
  toastText: { fontSize: 14, color: '#fff', fontWeight: '700', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, borderTopWidth: 1, borderColor: BORDER },
  confirmSheet: { paddingBottom: 32 },
  modalHandle: { width: 36, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  confirmBody: { fontSize: 15, color: MUTED, lineHeight: 24 },
  removeConfirmBtn: { backgroundColor: RED, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  removeConfirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtnRow: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: MUTED, fontSize: 15, fontWeight: '600' },
});
