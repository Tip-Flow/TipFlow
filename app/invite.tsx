import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const BLUE = '#4169E1';
const BG   = '#09100e';

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

async function resolveRole(email: string): Promise<'admin' | 'regional' | 'manager' | 'staff' | 'not_found'> {
  const lower = email.trim().toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return 'admin';

  const { data: manager } = await supabase
    .from('managers')
    .select('role')
    .eq('email', lower)
    .maybeSingle();

  if (manager?.role === 'regional_manager') return 'regional';
  if (manager?.role === 'location_manager')  return 'manager';

  const { data: staff } = await supabase
    .from('staff_members')
    .select('id')
    .eq('email', lower)
    .maybeSingle();

  if (staff) return 'staff';
  return 'not_found';
}

type Phase = 'loading' | 'set-password' | 'error';

export default function InviteScreen() {
  const router = useRouter();

  const [phase, setPhase]               = useState<Phase>('loading');
  const [inviteEmail, setInviteEmail]   = useState('');
  const [pageError, setPageError]       = useState('');

  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw]           = useState(false);
  const [showConfirmPw, setShowConfirmPw]   = useState(false);
  const [loading, setLoading]               = useState(false);
  const [fieldError, setFieldError]         = useState('');

  const mountedAt = useRef(Date.now());
  const sessionEmailRef = useRef('');

  // ── Parse URL and establish invite session ────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setPageError('Invite links must be opened in a web browser.');
      setPhase('error');
      return;
    }

    const hashParams   = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);

    const accessToken  = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const hashType     = hashParams.get('type');
    const tokenHash    = searchParams.get('token_hash');
    const searchType   = searchParams.get('type');
    const searchCode   = searchParams.get('code');

    console.log('[invite] URL hash:', window.location.hash);
    console.log('[invite] hashType:', hashType, '| accessToken:', !!accessToken, '| refreshToken:', !!refreshToken);
    console.log('[invite] searchType:', searchType, '| tokenHash:', !!tokenHash, '| code:', !!searchCode);

    async function establish() {
      if (hashType === 'invite' && accessToken && refreshToken) {
        console.log('[invite] path: setSession (implicit flow)');
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        console.log('[invite] setSession — user:', data?.session?.user?.email ?? 'none', '| error:', error?.message ?? 'none');
        if (error || !data.session) {
          setPageError('Invite link expired or invalid. Ask your manager to resend it.');
          setPhase('error');
          return;
        }
        sessionEmailRef.current = data.session.user.email ?? '';
      } else if (searchType === 'invite' && tokenHash) {
        console.log('[invite] path: verifyOtp (email OTP flow)');
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        console.log('[invite] verifyOtp — user:', data?.user?.email ?? 'none', '| error:', error?.message ?? 'none');
        if (error || !data.user) {
          setPageError('Invite link expired or invalid. Ask your manager to resend it.');
          setPhase('error');
          return;
        }
        sessionEmailRef.current = data.user.email ?? '';
      } else if (searchCode) {
        console.log('[invite] path: exchangeCodeForSession (PKCE flow)');
        const { data, error } = await supabase.auth.exchangeCodeForSession(searchCode);
        console.log('[invite] exchangeCode — user:', data?.session?.user?.email ?? 'none', '| error:', error?.message ?? 'none');
        if (error || !data.session) {
          setPageError('Invite link expired or invalid. Ask your manager to resend it.');
          setPhase('error');
          return;
        }
        sessionEmailRef.current = data.session.user.email ?? '';
      } else {
        console.log('[invite] no invite params found in URL — redirecting to login');
        router.replace('/');
        return;
      }

      // Confirm session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[invite] confirmed session — user:', session?.user?.email ?? 'NONE');
      if (!session) {
        setPageError('Invite session could not be established. Ask your manager to resend the invite.');
        setPhase('error');
        return;
      }

      const email = session.user.email ?? sessionEmailRef.current;
      sessionEmailRef.current = email;
      setInviteEmail(email);
      setPhase('set-password');
    }

    establish();
  }, []);

  // ── Set password ──────────────────────────────────────────────────────────
  async function handleSetPassword() {
    const elapsed = Date.now() - mountedAt.current;
    if (elapsed < 500) {
      console.log('[invite] blocked submit within 500ms of mount — likely autofill, elapsed:', elapsed);
      return;
    }
    if (newPassword.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }
    setFieldError('');
    setLoading(true);

    try {
      const email = sessionEmailRef.current || inviteEmail;
      console.log('[invite] setting password for:', email);

      // Refresh session before any password update attempt
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      console.log('[invite] refreshSession — user:', refreshData?.session?.user?.email ?? 'none', '| error:', refreshErr?.message ?? 'none');

      // Try updateUser first
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      console.log('[invite] updateUser — user:', updateData?.user?.email ?? 'none', '| error:', updateErr?.message ?? 'none');

      let passwordSet = false;
      if (!updateErr) {
        // Verify the password actually took
        const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: newPassword });
        console.log('[invite] verify signIn — error:', verifyErr?.message ?? 'none');
        passwordSet = !verifyErr;
        if (!passwordSet) {
          console.warn('[invite] updateUser appeared to succeed but signIn failed — falling back to edge function');
        }
      }

      // Fall back to admin edge function (bypasses AMR restriction)
      if (!passwordSet) {
        console.log('[invite] calling set-invite-password edge function');
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('set-invite-password', {
          body: { password: newPassword },
        });
        console.log('[invite] set-invite-password — data:', JSON.stringify(fnData), '| error:', fnErr?.message ?? 'none');

        if (fnErr || fnData?.error) {
          throw new Error(fnData?.error ?? fnErr?.message ?? 'Failed to set password. Please try again.');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: newPassword });
        console.log('[invite] post-admin signIn — user:', signInData?.user?.email ?? 'none', '| error:', signInErr?.message ?? 'none');

        if (signInErr) {
          // Password is set but signIn failed — use existing session as fallback
          const { data: { session: fallback } } = await supabase.auth.getSession();
          if (!fallback) throw new Error(signInErr.message ?? 'Could not sign in. Please contact your manager.');
        }
      }

      // Resolve role and navigate
      const role = await resolveRole(email);
      console.log('[invite] resolved role:', role);

      if (role === 'admin')    { setTimeout(() => router.replace('/(admin)/dashboard' as any), 100); return; }
      if (role === 'regional') { setTimeout(() => router.replace('/(regional)/overview'), 100); return; }
      if (role === 'manager')  { setTimeout(() => router.replace('/(manager)/home'), 100); return; }
      if (role === 'staff')    { setTimeout(() => router.replace('/(staff)/mytips'), 100); return; }

      // not_found — account exists, just send to login
      router.replace('/');
    } catch (err) {
      console.error('[invite] handleSetPassword error:', err);
      setFieldError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={styles.loadingText}>Verifying your invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorHeading}>Invite link problem</Text>
          <Text style={styles.errorBody}>{pageError}</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: set password ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'height' : undefined}
        keyboardVerticalOffset={StatusBar.currentHeight ?? 0}>
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}>

          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Mise</Text>
            <Text style={styles.welcomeHeadline}>Welcome to Mise</Text>
            <Text style={styles.welcomeSub}>
              Set a password to secure your account and get started.
            </Text>
          </View>

          <View style={styles.formContainer}>
            {/* Honeypot: tricks browser autofill away from the password fields */}
            <TextInput
              style={{ height: 0, width: 0, opacity: 0, position: 'absolute' }}
              autoComplete="username"
              editable={false}
            />

            <View>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#4a5e56"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPw}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!loading}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowNewPw(v => !v)}>
                  <View pointerEvents="none">
                    <Ionicons name={showNewPw ? 'eye-outline' : 'eye-off-outline'} size={20} color="#4a5e56" />
                  </View>
                </Pressable>
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter password"
                  placeholderTextColor="#4a5e56"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPw}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSetPassword}
                  editable={!loading}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowConfirmPw(v => !v)}>
                  <View pointerEvents="none">
                    <Ionicons name={showConfirmPw ? 'eye-outline' : 'eye-off-outline'} size={20} color="#4a5e56" />
                  </View>
                </Pressable>
              </View>
            </View>

            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSetPassword}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.buttonText}>Set Password & Sign In →</Text>
              )}
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  keyboardView: {
    flex: 1,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 48,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: {
    color: '#6b7a74',
    fontSize: 15,
    fontWeight: '500',
  },
  errorHeading: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  logoContainer: {
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 64,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -2,
  },
  welcomeHeadline: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e8f0ec',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 14,
    color: '#6b7a74',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  formContainer: {
    width: '100%',
    gap: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7a74',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#162019',
    borderWidth: 1,
    borderColor: '#1f3028',
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#e8f0ec',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  button: {
    backgroundColor: BLUE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
