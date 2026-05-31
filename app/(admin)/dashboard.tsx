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

const BG           = '#09100e';
const CARD         = '#162019';
const BLUE         = '#4169E1';
const BLUE_DIM     = 'rgba(65,105,225,0.15)';
const BLUE_BORDER  = 'rgba(65,105,225,0.4)';
const AMBER        = '#f59e0b';
const AMBER_DIM    = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const RED          = '#ef4444';
const RED_DIM      = 'rgba(239,68,68,0.15)';
const RED_BORDER   = 'rgba(239,68,68,0.4)';
const MUTED        = '#6b7a74';
const WHITE        = '#e8f0ec';
const BORDER       = '#1f3028';

type Org = { id: string; name: string; city: string | null; country: string | null };
type RegionalManager = { id: string; name: string; email: string; orgName: string; inviteSentAt: string | null };

export default function AdminScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [regionalManagers, setRegionalManagers] = useState<RegionalManager[]>([]);

  // Combined onboarding form
  const [orgName, setOrgName]   = useState('');
  const [orgCity, setOrgCity]   = useState('');
  const [orgCountry, setOrgCountry] = useState('Canada');
  const [rmName, setRmName]     = useState('');
  const [rmEmail, setRmEmail]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  // Remove RM state
  const [confirmRemove, setConfirmRemove] = useState<RegionalManager | null>(null);
  const [removing, setRemoving] = useState(false);

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

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const email = (user?.email ?? '').toLowerCase();
    const admin = ADMIN_EMAILS.includes(email);
    setIsAdmin(admin);
    if (!admin) return;

    const [orgRes, rmRes] = await Promise.all([
      supabase.from('organisations').select('id, name, city, country').order('name'),
      supabase.from('managers').select('id, name, email, organisation_id, invite_sent_at').eq('role', 'regional_manager').order('name'),
    ]);
    const fetchedOrgs = orgRes.data ?? [];
    setOrgs(fetchedOrgs);

    const orgMap = Object.fromEntries(fetchedOrgs.map(o => [o.id, o.name]));
    setRegionalManagers(
      (rmRes.data ?? []).map(m => ({
        id: m.id, name: m.name, email: m.email,
        orgName: orgMap[m.organisation_id ?? ''] ?? 'No org',
        inviteSentAt: m.invite_sent_at,
      }))
    );
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useWebFocus(loadData);

  async function handleCreateAndInvite() {
    if (!orgName.trim()) { setFormError('Organisation name is required.'); return; }
    if (!rmName.trim())  { setFormError('Regional Manager name is required.'); return; }
    if (!rmEmail.trim()) { setFormError('Regional Manager email is required.'); return; }
    setFormError('');
    setSubmitting(true);
    try {
      // 1. Create organisation
      const { data: orgData, error: orgErr } = await supabase
        .from('organisations')
        .insert({ name: orgName.trim(), city: orgCity.trim() || null, country: orgCountry.trim() || null })
        .select('id')
        .single();
      if (orgErr) throw new Error(orgErr.message);

      // 2. Invite RM — edge function creates the manager record and sends the email
      const { data: inviteData, error: inviteErr } = await supabase.functions.invoke('send-staff-invite', {
        body: {
          email: rmEmail.trim().toLowerCase(),
          name: rmName.trim(),
          role: 'regional_manager',
          organisation_id: orgData.id,
        },
      });
      if (inviteErr) {
        let msg = inviteErr.message;
        try { const b = await (inviteErr as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }

      setOrgName(''); setOrgCity(''); setOrgCountry('Canada');
      setRmName(''); setRmEmail('');
      await loadData();
      showToast(inviteData?.note
        ? `Organisation created. ${rmEmail.trim()} already has an account.`
        : `Organisation created. Invite sent to ${rmEmail.trim()}.`
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
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
    } catch (err) {
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
              <Text style={styles.pageSubtitle}>Create an organisation and invite its Regional Manager in one step.</Text>
            </View>

            {/* Summary chips */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryChip, { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER }]}>
                <Text style={[styles.summaryCount, { color: BLUE }]}>{orgs.length}</Text>
                <Text style={[styles.summaryLabel, { color: BLUE }]}>Orgs</Text>
              </View>
              <View style={[styles.summaryChip, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
                <Text style={[styles.summaryCount, { color: AMBER }]}>{regionalManagers.length}</Text>
                <Text style={[styles.summaryLabel, { color: AMBER }]}>Reg. Managers</Text>
              </View>
            </View>

            {/* Create & Invite form */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>New Organisation</Text>
                <Text style={styles.sectionSubtitle}>Creates the org and sends the RM their invite in one step.</Text>
              </View>

              <Text style={styles.groupLabel}>ORGANISATION</Text>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput style={styles.input} value={orgName} onChangeText={setOrgName}
                  placeholder="e.g. Canteen Group" placeholderTextColor="#3d4f47"
                  autoCapitalize="words" editable={!submitting} />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput style={styles.input} value={orgCity} onChangeText={setOrgCity}
                  placeholder="e.g. Toronto" placeholderTextColor="#3d4f47"
                  autoCapitalize="words" editable={!submitting} />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Country</Text>
                <TextInput style={styles.input} value={orgCountry} onChangeText={setOrgCountry}
                  placeholder="Canada" placeholderTextColor="#3d4f47"
                  autoCapitalize="words" editable={!submitting} />
              </View>

              <View style={styles.divider} />

              <Text style={styles.groupLabel}>REGIONAL MANAGER</Text>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput style={styles.input} value={rmName} onChangeText={setRmName}
                  placeholder="e.g. Jamie Chen" placeholderTextColor="#3d4f47"
                  autoCapitalize="words" editable={!submitting} />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput style={styles.input} value={rmEmail} onChangeText={setRmEmail}
                  placeholder="e.g. jamie@canteen.ca" placeholderTextColor="#3d4f47"
                  autoCapitalize="none" keyboardType="email-address"
                  returnKeyType="done" onSubmitEditing={handleCreateAndInvite}
                  editable={!submitting} />
              </View>

              {formError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <Pressable style={[styles.btn, submitting && styles.btnDisabled]}
                onPress={handleCreateAndInvite} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Create & Invite →</Text>}
              </Pressable>
            </View>

            {/* Regional Managers list */}
            {regionalManagers.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Regional Managers</Text>
                  <Text style={styles.sectionSubtitle}>Remove access for managers who have left.</Text>
                </View>
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
          presentationStyle="overFullScreen" onRequestClose={() => setConfirmRemove(null)}>
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

  groupLabel: { fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4 },
  divider: { height: 1, backgroundColor: BORDER },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#0d1812', borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: WHITE },

  errorBox: { backgroundColor: RED_DIM, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: RED_BORDER },
  errorText: { fontSize: 13, color: RED, fontWeight: '600' },

  btn: { backgroundColor: BLUE, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
