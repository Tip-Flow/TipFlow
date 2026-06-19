import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Pressable,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { ZumConnectModal } from '../../components/ZumConnectModal';

const BG     = '#09100e';
const CARD   = '#162019';
const BLUE   = '#4169E1';
const BORDER = '#1e3028';
const MUTED  = '#6b7a74';
const LABEL  = '#9db8ad';
const WHITE  = '#e8f0ec';
const RED    = '#f87171';
const GREEN  = '#4ade80';

const NOTIF_SHIFT  = 'mise:notif:shiftGoal';
const NOTIF_PAYOUT = 'mise:notif:payout';
const NOTIF_BADGE  = 'mise:notif:badge';
const BIO_KEY      = 'mise:biometric:enabled';

type ActiveModal = 'notifications' | 'security' | 'help' | null;

// ── Password field with eye toggle ────────────────────────────────────────────
function PasswordField({
  label, value, onChangeText, show, onToggleShow, placeholder = '••••••••',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
}) {
  return (
    <View style={pwStyles.group}>
      <Text style={pwStyles.label}>{label}</Text>
      <View style={pwStyles.wrap}>
        <TextInput
          style={pwStyles.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={pwStyles.eyeBtn} onPress={onToggleShow}>
          <View pointerEvents="none">
            <Ionicons name={show ? 'eye-outline' : 'eye-off-outline'} size={18} color={MUTED} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const pwStyles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1a14',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
  },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: WHITE },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 12 },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // ── Bank linking ──────────────────────────────────────────────────────────
  const [bankLinked,    setBankLinked]    = useState(false);
  const [bankLoading,   setBankLoading]   = useState(true);
  const [connectToken,  setConnectToken]  = useState('');
  const [showConnect,   setShowConnect]   = useState(false);
  const [linkingBank,   setLinkingBank]   = useState(false);
  const [linkError,     setLinkError]     = useState('');
  const [linkSuccess,   setLinkSuccess]   = useState(false);

  useEffect(() => {
    async function loadBankStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;
        const { data: staff } = await supabase
          .from('staff_members')
          .select('bank_linked')
          .eq('email', user.email)
          .maybeSingle();
        if (staff) setBankLinked(staff.bank_linked ?? false);
      } catch (_) {}
      finally { setBankLoading(false); }
    }
    loadBankStatus();
  }, []);

  async function handleLinkBank() {
    setLinkError('');
    setLinkingBank(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-zumconnect-token', {
        body: { entity_type: 'staff' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConnectToken(data.token);
      setShowConnect(true);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Failed to start bank linking');
    } finally {
      setLinkingBank(false);
    }
  }

  async function handleConnectSuccess(zumrailsUserId: string) {
    setShowConnect(false);
    try {
      const { data, error } = await supabase.functions.invoke('save-zumconnect-result', {
        body: { entity_type: 'staff', zumrails_user_id: zumrailsUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBankLinked(true);
      setLinkSuccess(true);
      setTimeout(() => setLinkSuccess(false), 3000);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Failed to save bank link');
    }
  }

  // ── Notification preferences ──────────────────────────────────────────────
  const [notifShiftGoal, setNotifShiftGoal] = useState(true);
  const [notifPayout,    setNotifPayout]    = useState(true);
  const [notifBadge,     setNotifBadge]     = useState(true);
  const [savingNotifs,   setSavingNotifs]   = useState(false);

  // ── Security ──────────────────────────────────────────────────────────────
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showChangePw,     setShowChangePw]     = useState(false);
  const [currentPw,        setCurrentPw]        = useState('');
  const [newPw,            setNewPw]            = useState('');
  const [confirmPw,        setConfirmPw]        = useState('');
  const [showCurrentPw,    setShowCurrentPw]    = useState(false);
  const [showNewPw,        setShowNewPw]        = useState(false);
  const [showConfirmPw,    setShowConfirmPw]    = useState(false);
  const [changingPw,       setChangingPw]       = useState(false);
  const [pwError,          setPwError]          = useState('');
  const [pwSuccess,        setPwSuccess]        = useState(false);

  // ── Load preferences on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function loadPrefs() {
      try {
        const [sg, po, ba, bio] = await Promise.all([
          AsyncStorage.getItem(NOTIF_SHIFT),
          AsyncStorage.getItem(NOTIF_PAYOUT),
          AsyncStorage.getItem(NOTIF_BADGE),
          AsyncStorage.getItem(BIO_KEY),
        ]);
        if (sg  !== null) setNotifShiftGoal(sg  === 'true');
        if (po  !== null) setNotifPayout(po      === 'true');
        if (ba  !== null) setNotifBadge(ba        === 'true');
        if (bio !== null) setBiometricEnabled(bio === 'true');
      } catch (_) {}
    }
    loadPrefs();
  }, []);

  // ── Notifications: save ───────────────────────────────────────────────────
  async function saveNotifications() {
    setSavingNotifs(true);
    try {
      await Promise.all([
        AsyncStorage.setItem(NOTIF_SHIFT,  String(notifShiftGoal)),
        AsyncStorage.setItem(NOTIF_PAYOUT, String(notifPayout)),
        AsyncStorage.setItem(NOTIF_BADGE,  String(notifBadge)),
      ]);
      setActiveModal(null);
    } catch (_) {} finally {
      setSavingNotifs(false);
    }
  }

  // ── Security: biometric toggle ────────────────────────────────────────────
  async function toggleBiometric(val: boolean) {
    setBiometricEnabled(val);
    try { await AsyncStorage.setItem(BIO_KEY, String(val)); } catch (_) {}
  }

  // ── Security: change password ─────────────────────────────────────────────
  async function handleChangePassword() {
    setPwError('');
    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All fields are required.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    setChangingPw(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Not signed in.');

      // Verify current password by signing in again
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (verifyError) {
        setPwError('Current password is incorrect.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
      if (updateError) throw updateError;

      setPwSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setShowChangePw(false); }, 2000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setChangingPw(false);
    }
  }

  function closeSecurityModal() {
    setActiveModal(null);
    setShowChangePw(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwError('');
    setPwSuccess(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.screenTitle}>Profile</Text>

        {/* Profile Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>AD</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.name}>Alex Dubois</Text>
              <Text style={styles.role}>Server · Ossington, Toronto</Text>
              <View style={styles.badgeRow}>
                <View style={styles.goldBadge}>
                  <Text style={styles.goldBadgeText}>⭐ Gold Server</Text>
                </View>
                <View style={styles.amberBadge}>
                  <Text style={styles.amberBadgeText}>🔥 5 Streak</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>$4,820</Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>22.4%</Text>
              <Text style={styles.statLabel}>Tip Average</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>12</Text>
              <Text style={styles.statLabel}>Shifts</Text>
            </View>
          </View>
        </View>

        {/* Bank Account Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🏦 Bank Account</Text>
            {!bankLoading && bankLinked && (
              <View style={styles.linkedBadge}>
                <Text style={styles.linkedText}>✓ Linked</Text>
              </View>
            )}
          </View>

          {bankLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 8 }} />
          ) : bankLinked ? (
            <>
              {linkSuccess && (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>Bank Account Linked ✅</Text>
                </View>
              )}
              <Text style={styles.bankName}>Bank Account Linked</Text>
              <Text style={styles.bankSub}>via Zum Connect</Text>
              <Pressable
                style={[styles.relinkBtn, linkingBank && { opacity: 0.6 }]}
                onPress={handleLinkBank}
                disabled={linkingBank}>
                {linkingBank
                  ? <ActivityIndicator color={BLUE} size="small" />
                  : <Text style={styles.relinkBtnText}>Relink Bank Account</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.bankSub}>No bank account linked yet</Text>
              {linkError ? <Text style={styles.bankError}>{linkError}</Text> : null}
              <Pressable
                style={[styles.linkBtn, linkingBank && { opacity: 0.6 }]}
                onPress={handleLinkBank}
                disabled={linkingBank}>
                {linkingBank
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.linkBtnText}>Link Bank Account</Text>}
              </Pressable>
            </>
          )}
        </View>

        {/* Payout Method Card */}
        <View style={styles.card}>
          <Text style={styles.payoutMethod}>💸 EFT Payout</Text>
          <Text style={styles.payoutDetails}>Direct to your linked bank · via Zum Rails</Text>
        </View>

        {/* Settings List */}
        <View style={styles.card}>
          {SETTINGS.map((item, i) => (
            <View key={item.label}>
              <Pressable style={styles.settingsRow} onPress={() => setActiveModal(item.modal)}>
                <Text style={styles.settingsLabel}>{item.icon} {item.label}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              {i < SETTINGS.length - 1 && <View style={styles.rowSep} />}
            </View>
          ))}
        </View>

        {/* Sign Out */}
        <Pressable
          style={styles.signOutBtn}
          onPress={async () => { await supabase.auth.signOut(); router.replace('/'); }}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

      </ScrollView>

      {/* ── Notifications Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={activeModal === 'notifications'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🔔 Notifications</Text>
            <Pressable style={styles.closeBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.modalSubtitle}>Choose what you want to be notified about</Text>

          <View style={styles.modalCard}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Shift Goal Updates</Text>
                <Text style={styles.toggleSub}>When your location hits its weekly goal</Text>
              </View>
              <Switch
                value={notifShiftGoal}
                onValueChange={setNotifShiftGoal}
                trackColor={{ false: BORDER, true: 'rgba(65,105,225,0.4)' }}
                thumbColor={notifShiftGoal ? BLUE : MUTED}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Payout Alerts</Text>
                <Text style={styles.toggleSub}>When a payout is sent to your bank</Text>
              </View>
              <Switch
                value={notifPayout}
                onValueChange={setNotifPayout}
                trackColor={{ false: BORDER, true: 'rgba(65,105,225,0.4)' }}
                thumbColor={notifPayout ? BLUE : MUTED}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Badge Earned</Text>
                <Text style={styles.toggleSub}>When you unlock a new achievement</Text>
              </View>
              <Switch
                value={notifBadge}
                onValueChange={setNotifBadge}
                trackColor={{ false: BORDER, true: 'rgba(65,105,225,0.4)' }}
                thumbColor={notifBadge ? BLUE : MUTED}
              />
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, savingNotifs && styles.saveBtnDisabled]}
            onPress={saveNotifications}
            disabled={savingNotifs}>
            {savingNotifs
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Preferences</Text>}
          </Pressable>
        </SafeAreaView>
      </Modal>

      {/* ── Security & Face ID Modal ────────────────────────────────────────── */}
      <Modal
        visible={activeModal === 'security'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSecurityModal}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🔒 Security</Text>
                <Pressable style={styles.closeBtn} onPress={closeSecurityModal}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>Manage your account security settings</Text>

              {/* Face ID / Biometric */}
              <View style={styles.modalCard}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>Face ID / Biometric</Text>
                    <Text style={styles.toggleSub}>Require biometric to open the app</Text>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={toggleBiometric}
                    trackColor={{ false: BORDER, true: 'rgba(65,105,225,0.4)' }}
                    thumbColor={biometricEnabled ? BLUE : MUTED}
                  />
                </View>
              </View>

              {/* Change Password */}
              <View style={styles.modalCard}>
                <Pressable
                  style={styles.toggleRow}
                  onPress={() => { setShowChangePw((v) => !v); setPwError(''); setPwSuccess(false); }}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>Change Password</Text>
                    <Text style={styles.toggleSub}>Update your Mise account password</Text>
                  </View>
                  <Text style={[styles.chevron, { fontSize: 18 }]}>{showChangePw ? '∨' : '›'}</Text>
                </Pressable>

                {showChangePw && (
                  <View style={styles.changePwForm}>
                    <View style={styles.toggleDivider} />

                    {pwSuccess ? (
                      <View style={styles.pwSuccessBanner}>
                        <Text style={styles.pwSuccessText}>✓ Password changed successfully!</Text>
                      </View>
                    ) : (
                      <>
                        <PasswordField
                          label="Current Password"
                          value={currentPw}
                          onChangeText={setCurrentPw}
                          show={showCurrentPw}
                          onToggleShow={() => setShowCurrentPw((v) => !v)}
                        />
                        <PasswordField
                          label="New Password"
                          value={newPw}
                          onChangeText={setNewPw}
                          show={showNewPw}
                          onToggleShow={() => setShowNewPw((v) => !v)}
                          placeholder="Min. 8 characters"
                        />
                        <PasswordField
                          label="Confirm New Password"
                          value={confirmPw}
                          onChangeText={setConfirmPw}
                          show={showConfirmPw}
                          onToggleShow={() => setShowConfirmPw((v) => !v)}
                        />
                        {pwError ? <Text style={styles.pwError}>{pwError}</Text> : null}
                        <Pressable
                          style={[styles.saveBtn, changingPw && styles.saveBtnDisabled]}
                          onPress={handleChangePassword}
                          disabled={changingPw}>
                          {changingPw
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.saveBtnText}>Update Password</Text>}
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Zum Connect Modal ───────────────────────────────────────────────── */}
      <ZumConnectModal
        visible={showConnect}
        token={connectToken}
        onSuccess={handleConnectSuccess}
        onClose={() => setShowConnect(false)}
      />

      {/* ── Help & Support Modal ────────────────────────────────────────────── */}
      <Modal
        visible={activeModal === 'help'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>❓ Help & Support</Text>
              <Pressable style={styles.closeBtn} onPress={() => setActiveModal(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>Answers to common questions</Text>

            <View style={styles.modalCard}>
              {FAQ.map((item, i) => (
                <View key={item.q}>
                  {i > 0 && <View style={styles.toggleDivider} />}
                  <View style={styles.faqItem}>
                    <Text style={styles.faqQ}>{item.q}</Text>
                    <Text style={styles.faqA}>{item.a}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.helpSectionTitle}>Contact Us</Text>
              <View style={styles.toggleDivider} />
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Email</Text>
                <Text style={styles.contactValue}>support@mise.ltd</Text>
              </View>
              <View style={styles.toggleDivider} />
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Response time</Text>
                <Text style={styles.contactValue}>Within 24 hours</Text>
              </View>
              <View style={styles.toggleDivider} />
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Registered under</Text>
                <Text style={styles.contactValue}>RPAA — Bank of Canada</Text>
              </View>
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const SETTINGS: { icon: string; label: string; modal: ActiveModal }[] = [
  { icon: '🔔', label: 'Notifications',      modal: 'notifications' },
  { icon: '🔒', label: 'Security & Face ID', modal: 'security' },
  { icon: '❓', label: 'Help & Support',     modal: 'help' },
];

const FAQ = [
  {
    q: 'When will my payout arrive?',
    a: 'EFT payouts typically arrive within 1–2 business days. Interac e-Transfer with auto-deposit is instant.',
  },
  {
    q: 'How is my tip percentage calculated?',
    a: 'Your tip % is your tips earned divided by your sales for that shift. It\'s used for the leaderboard ranking.',
  },
  {
    q: 'Why do I need to link my bank?',
    a: 'Linking your bank via Zum Connect lets Mise send your tips directly to your account. Mise never sees your banking credentials — only a secure token is stored.',
  },
  {
    q: 'Is my data safe?',
    a: 'All data is stored in Canada (AWS ca-central-1), encrypted at rest with AES-256, and in transit with TLS 1.3. Mise is registered under RPAA.',
  },
];

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: BG },
  scroll:  { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  screenTitle: {
    fontSize: 28, fontWeight: '800', color: '#fff',
    marginTop: 8, marginBottom: 4, letterSpacing: -0.5,
  },

  // Hero card
  heroCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#0d2a1c', borderWidth: 2, borderColor: BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: BLUE, letterSpacing: 1 },
  avatarInfo: { flex: 1, gap: 4, paddingTop: 2 },
  name:   { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  role:   { fontSize: 14, color: LABEL, fontWeight: '500' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  goldBadge: {
    backgroundColor: '#2a1f00', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#5a4500',
  },
  goldBadgeText: { fontSize: 12, fontWeight: '700', color: '#fbbf24' },
  amberBadge: {
    backgroundColor: '#2a1500', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#5a3000',
  },
  amberBadgeText: { fontSize: 12, fontWeight: '700', color: '#f97316' },
  divider:  { height: 1, backgroundColor: BORDER, marginVertical: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat:     { flex: 1, alignItems: 'center', gap: 4 },
  statValue:{ fontSize: 18, fontWeight: '800', color: BLUE, letterSpacing: -0.5 },
  statLabel:{ fontSize: 12, color: MUTED, fontWeight: '500' },
  statSep:  { width: 1, height: 32, backgroundColor: BORDER },

  // Generic card
  card: { backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  linkedBadge: {
    backgroundColor: '#0d3324', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#1a5c3a',
  },
  linkedText: { fontSize: 12, fontWeight: '700', color: '#4ade80' },
  bankName:   { fontSize: 16, fontWeight: '700', color: '#e8f5ef' },
  bankSub:    { fontSize: 13, color: MUTED, marginTop: 2, marginBottom: 12 },
  bankError:  { fontSize: 13, color: RED, fontWeight: '500', marginBottom: 8 },
  linkBtn: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  linkBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  relinkBtn: {
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  relinkBtnText: { fontSize: 14, fontWeight: '600', color: BLUE },
  successBanner: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  successText: { fontSize: 14, fontWeight: '700', color: GREEN },
  payoutMethod: { fontSize: 16, fontWeight: '700', color: BLUE },
  payoutDetails:{ fontSize: 13, color: LABEL, marginTop: 2 },

  // Settings rows
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  settingsLabel: { fontSize: 15, color: '#e8f5ef', fontWeight: '500' },
  chevron: { fontSize: 20, color: MUTED, lineHeight: 22 },
  rowSep: { height: 1, backgroundColor: BORDER },

  // Sign out
  signOutBtn: {
    backgroundColor: '#1f0a0a', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#3d1515',
  },
  signOutText: { fontSize: 16, fontWeight: '700', color: RED },

  // ── Modal shared ─────────────────────────────────────────────────────────
  modalSafe:        { flex: 1, backgroundColor: BG },
  modalScrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40, gap: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  modalTitle:  { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, color: MUTED, marginTop: -8, marginBottom: 4, lineHeight: 18 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: MUTED, fontWeight: '700' },

  // Modal card (same visual as main card but inside modal)
  modalCard: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  toggleInfo:  { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: WHITE },
  toggleSub:   { fontSize: 12, color: MUTED },
  toggleDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },

  // Save button
  saveBtn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },

  // Change password form
  changePwForm: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, gap: 14 },
  pwError: { fontSize: 13, color: RED, fontWeight: '500', textAlign: 'center' },
  pwSuccessBanner: {
    backgroundColor: 'rgba(74,222,128,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
    paddingVertical: 14, alignItems: 'center',
  },
  pwSuccessText: { fontSize: 14, fontWeight: '700', color: GREEN },

  // FAQ
  faqItem:     { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  faqQ:        { fontSize: 14, fontWeight: '700', color: WHITE },
  faqA:        { fontSize: 13, color: MUTED, lineHeight: 18 },

  // Help contact
  helpSectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  contactLabel: { fontSize: 14, color: MUTED, fontWeight: '500' },
  contactValue: { fontSize: 14, fontWeight: '600', color: WHITE },
});
