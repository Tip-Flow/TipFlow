import { useState, useEffect } from 'react';
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
import DailyQuote from './components/DailyQuote';
import ShiftGoalsSplash, { ShiftGoal } from './components/ShiftGoalsSplash';

type PendingRole = 'regional' | 'manager' | 'staff' | null;
type ScreenMode = 'login' | 'invite-loading' | 'set-password';

const BLUE = '#4169E1';
const BG   = '#09100e';

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

async function resolveRole(email: string): Promise<'admin' | 'regional' | 'manager' | 'staff' | 'not_found'> {
  console.log('[resolveRole] starting for:', email);

  const lower = email.trim().toLowerCase();

  console.log('[resolveRole] admin check:', lower, ADMIN_EMAILS, ADMIN_EMAILS.includes(lower));

  if (ADMIN_EMAILS.includes(lower)) {
    console.log('[resolveRole] → admin');
    return 'admin';
  }

  const { data: manager, error: mgrErr } = await supabase
    .from('managers')
    .select('role')
    .eq('email', lower)
    .maybeSingle();
  console.log('[resolveRole] managers — data:', JSON.stringify(manager), 'error:', JSON.stringify(mgrErr));

  if (manager?.role === 'regional_manager') { console.log('[resolveRole] → regional'); return 'regional'; }
  if (manager?.role === 'location_manager') { console.log('[resolveRole] → manager');  return 'manager';  }

  const { data: staff, error: staffErr } = await supabase
    .from('staff_members')
    .select('id')
    .eq('email', lower)
    .maybeSingle();
  console.log('[resolveRole] staff — data:', JSON.stringify(staff), 'error:', JSON.stringify(staffErr));

  if (staff) { console.log('[resolveRole] → staff'); return 'staff'; }

  console.log('[resolveRole] → not_found');
  return 'not_found';
}

export default function LoginScreen() {
  const router = useRouter();

  // Login state
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [timedOut, setTimedOut]         = useState(false);
  const [pendingRole, setPendingRole]   = useState<PendingRole>(null);
  const [pendingGoals, setPendingGoals] = useState<ShiftGoal[] | null>(null);

  // Invite / set-password state
  const [screenMode, setScreenMode]           = useState<ScreenMode>('login');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw]             = useState(false);
  const [showConfirmPw, setShowConfirmPw]     = useState(false);
  const [inviteEmail, setInviteEmail]         = useState('');

  // ── Detect invite token in URL on web ──────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Supabase redirects with params in the hash fragment:
    // app.mise.ltd#access_token=...&refresh_token=...&type=invite
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken  = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const hashType     = hashParams.get('type');

    // PKCE / OTP flow uses query params: ?token_hash=...&type=invite
    const searchParams = new URLSearchParams(window.location.search);
    const tokenHash    = searchParams.get('token_hash');
    const searchType   = searchParams.get('type');

    // PKCE OAuth code-exchange path: ?code=...
    const searchCode = searchParams.get('code');

    console.log('[invite] URL hash:', window.location.hash);
    console.log('[invite] URL search:', window.location.search);
    console.log('[invite] hashType:', hashType, '| accessToken:', !!accessToken, '| refreshToken:', !!refreshToken);
    console.log('[invite] searchType:', searchType, '| tokenHash:', !!tokenHash, '| code:', !!searchCode);

    async function handleInviteToken() {
      setScreenMode('invite-loading');

      if (hashType === 'invite' && accessToken && refreshToken) {
        // Implicit flow: Supabase put access_token in the hash fragment
        console.log('[invite] path: setSession (implicit flow)');
        const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        console.log('[invite] setSession full response:', JSON.stringify({ user: sessionData?.user?.email, error: sessionErr }));
        if (sessionErr) {
          setError('Invite link expired or invalid. Ask your manager to resend it.');
          setScreenMode('login');
          return;
        }
      } else if (searchType === 'invite' && tokenHash) {
        // Email OTP path: Supabase put token_hash in query params
        console.log('[invite] path: verifyOtp (email OTP flow)');
        const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'invite',
        });
        console.log('[invite] verifyOtp full response:', JSON.stringify({ user: otpData?.user?.email, error: otpErr }));
        if (otpErr) {
          setError('Invite link expired or invalid. Ask your manager to resend it.');
          setScreenMode('login');
          return;
        }
      } else if (searchCode) {
        // PKCE code-exchange path: ?code=...
        console.log('[invite] path: exchangeCodeForSession (PKCE flow)');
        const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(searchCode);
        console.log('[invite] exchangeCodeForSession full response:', JSON.stringify({ user: codeData?.user?.email, error: codeErr }));
        if (codeErr) {
          setError('Invite link expired or invalid. Ask your manager to resend it.');
          setScreenMode('login');
          return;
        }
      } else {
        setScreenMode('login');
        return;
      }

      // Confirm session is actually active before showing the password screen
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[invite] getSession after token exchange — user:', session?.user?.email ?? 'NONE', '| expires_at:', session?.expires_at ?? 'N/A');
      if (!session) {
        console.error('[invite] session is null after token exchange — link may be expired or already used');
        setError('Invite link expired or already used. Ask your manager to resend it.');
        setScreenMode('login');
        return;
      }

      setInviteEmail(session.user.email ?? '');
      window.history.replaceState({}, '', '/');
      setScreenMode('set-password');
    }

    if (
      (hashType === 'invite' && accessToken && refreshToken) ||
      (searchType === 'invite' && tokenHash) ||
      searchCode
    ) {
      handleInviteToken();
    }
  }, []);

  // ── After DailyQuote dismissed ─────────────────────────────────────────────
  async function handleDismissQuote(role: PendingRole) {
    if (role === 'regional') {
      router.replace('/(regional)/overview');
    } else if (role === 'manager') {
      router.replace('/(manager)/home');
    } else {
      const goals = await fetchTodaysShiftGoals();
      if (goals.length > 0) {
        setPendingGoals(goals);
        return;
      }
      router.replace('/(staff)/mytips');
    }
    setPendingRole(null);
  }

  function handleDismissGoals() {
    router.replace('/(staff)/mytips');
    setPendingRole(null);
    setPendingGoals(null);
  }

  async function fetchTodaysShiftGoals(): Promise<ShiftGoal[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: locationData } = await supabase
        .from('locations')
        .select('id')
        .limit(1)
        .single();
      if (!locationData) return [];

      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('id')
        .eq('location_id', locationData.id)
        .eq('date', today);
      if (!shiftsData || shiftsData.length === 0) return [];

      const shiftIds = shiftsData.map((s) => s.id);
      const { data: goalsData } = await supabase
        .from('shift_goals')
        .select('id, title, goal_type, target_item')
        .in('shift_id', shiftIds)
        .order('created_at', { ascending: true });

      return (goalsData ?? []) as ShiftGoal[];
    } catch {
      return [];
    }
  }

  function isTimeoutError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('timeout') ||
      msg.includes('Timeout') ||
      msg.includes('AbortError') ||
      msg.includes('aborted') ||
      msg.includes('timed out')
    );
  }

  // ── Handle set password (invite flow) ─────────────────────────────────────
  async function handleSetPassword() {
    console.log('[invite] handleSetPassword called — newPassword.length:', newPassword.length, '| confirmPassword.length:', confirmPassword.length, '| loading:', loading);

    if (newPassword.length < 8) {
      console.log('[invite] early return: password too short');
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      console.log('[invite] early return: passwords do not match');
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    console.log('[invite] validation passed — entering try block');
    try {
      // 1. Confirm the invite session is still active
      const { data: { session: preSession } } = await supabase.auth.getSession();
      console.log('[invite] pre-updateUser session — user:', preSession?.user?.email ?? 'NONE', '| expires_at:', preSession?.expires_at ?? 'N/A');
      if (!preSession) {
        console.log('[invite] early return: no pre-session — redirecting to login');
        setError('Your invite session expired. Please contact your manager for a new invite link.');
        setScreenMode('login');
        return;
      }

      // 2. Refresh the session so the access token is as fresh as possible
      //    before any password-update call.
      console.log('[invite] refreshing session before password update');
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      console.log('[invite] refreshSession — user:', refreshData?.session?.user?.email ?? 'none', '| error:', refreshErr?.message ?? 'none');

      // 3. Attempt updateUser first — log every detail so we can see what Supabase returns.
      //    On projects with Secure Password Change enabled the invite session's AMR level
      //    is too low and updateUser silently returns the user without saving the password.
      console.log('[invite] about to call updateUser');
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      console.log('[invite] updateUser full response:', JSON.stringify({ user: updateData?.user?.email, id: updateData?.user?.id, error: updateErr }));

      const userEmail = updateData?.user?.email ?? refreshData?.session?.user?.email ?? inviteEmail;

      if (updateErr) {
        // updateUser returned an explicit error — surface it and fall through to
        // the admin edge function below.
        console.warn('[invite] updateUser returned error — will try admin edge function. Error:', JSON.stringify(updateErr));
      }

      // 4. Regardless of whether updateUser reported an error, verify the password
      //    was actually set by trying signInWithPassword immediately.
      //    If updateUser silently failed (Secure Password Change policy), this 400
      //    is the signal to fall back to the admin edge function.
      let passwordSetViaUpdateUser = false;
      if (!updateErr) {
        console.log('[invite] about to call signInWithPassword to verify password was set, email:', userEmail);
        const { data: verifyData, error: verifyErr } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: newPassword,
        });
        console.log('[invite] verification signIn full response:', JSON.stringify({ user: verifyData?.user?.email, error: verifyErr }));
        if (!verifyErr) {
          passwordSetViaUpdateUser = true;
        } else {
          console.warn('[invite] updateUser appeared to succeed but signIn failed with:', JSON.stringify(verifyErr), '— falling back to admin edge function');
        }
      }

      // 5. If updateUser didn't work (either returned error or verification signIn
      //    failed), use the server-side admin edge function which bypasses AMR restrictions.
      if (!passwordSetViaUpdateUser) {
        console.log('[invite] calling set-invite-password edge function');
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('set-invite-password', {
          body: { password: newPassword },
        });
        console.log('[invite] set-invite-password response:', JSON.stringify({ data: fnData, error: fnErr }));

        if (fnErr || fnData?.error) {
          const msg = fnData?.error ?? fnErr?.message ?? 'Failed to set password. Please try again.';
          throw new Error(msg);
        }

        // Password is now set via admin API — wait 1 second for it to propagate,
        // then sign in to establish a normal session.
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[invite] signing in after admin password set, email:', userEmail);
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: newPassword,
        });
        console.log('[invite] post-admin signIn full response:', JSON.stringify({ user: signInData?.user?.email, error: signInErr }));

        if (signInErr) {
          // Admin set the password but signIn still fails — use existing invite session.
          console.warn('[invite] post-admin signIn failed, using invite session as fallback. Error:', JSON.stringify(signInErr));
          const { data: { session: fallback } } = await supabase.auth.getSession();
          if (!fallback) {
            throw new Error(signInErr.message ?? 'Could not sign in — please contact your manager.');
          }
        }
      }

      // 6. Resolve role and navigate
      let role: Awaited<ReturnType<typeof resolveRole>>;
      try {
        role = await resolveRole(userEmail);
      } catch (resolveErr) {
        if (isTimeoutError(resolveErr)) {
          setTimedOut(true);
        } else {
          setError('Account created. Please sign in to continue.');
          setScreenMode('login');
          setEmail(userEmail);
        }
        return;
      }

      if (role === 'admin') {
        setTimeout(() => router.replace('/(admin)/dashboard' as any), 100);
        return;
      }
      if (role === 'not_found') {
        setError('Account created. Please sign in to continue.');
        setScreenMode('login');
        setEmail(userEmail);
        return;
      }
      setPendingRole(role as PendingRole);
    } catch (err) {
      console.error('[invite] handleSetPassword error:', err);
      setError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Handle normal sign in ──────────────────────────────────────────────────
  async function handleSignIn() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setTimedOut(false);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (authError) {
        if (isTimeoutError(authError)) {
          setTimedOut(true);
          setError('');
        } else {
          setError(authError.message);
        }
        return;
      }

      let role: Awaited<ReturnType<typeof resolveRole>>;
      try {
        role = await resolveRole(trimmedEmail);
      } catch (resolveErr) {
        if (isTimeoutError(resolveErr)) {
          setTimedOut(true);
        } else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }
      console.log('[handleSignIn] resolved role:', role);

      if (role === 'not_found') {
        await supabase.auth.signOut();
        setError('Account not found. Contact your manager to be added to Mise.');
        return;
      }

      if (role === 'admin') {
        console.log('[handleSignIn] resolved admin — scheduling navigation');
        setTimeout(() => {
          console.log('[handleSignIn] navigating to /(admin)/dashboard');
          router.replace('/(admin)/dashboard' as any);
        }, 100);
        return;
      }

      setPendingRole(role);
    } finally {
      setLoading(false);
    }
  }

  // ── Render: splash screens ─────────────────────────────────────────────────
  if (pendingRole !== null && pendingGoals === null) {
    const quoteRole: 'manager' | 'staff' = pendingRole === 'staff' ? 'staff' : 'manager';
    return (
      <SafeAreaView style={styles.container}>
        <DailyQuote role={quoteRole} onDismiss={() => handleDismissQuote(pendingRole)} />
      </SafeAreaView>
    );
  }

  if (pendingGoals !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <ShiftGoalsSplash goals={pendingGoals} onDismiss={handleDismissGoals} />
      </SafeAreaView>
    );
  }

  // ── Render: verifying invite token ─────────────────────────────────────────
  if (screenMode === 'invite-loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredFull}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={styles.loadingText}>Verifying your invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: set password ───────────────────────────────────────────────────
  if (screenMode === 'set-password') {
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
              {/* Password */}
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
                    returnKeyType="next"
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowNewPw(v => !v)}>
                    <View pointerEvents="none">
                      <Ionicons
                        name={showNewPw ? 'eye-outline' : 'eye-off-outline'}
                        size={20}
                        color="#4a5e56"
                      />
                    </View>
                  </Pressable>
                </View>
              </View>

              {/* Confirm password */}
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
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      console.log('[invite] confirm-password returnKey submitted');
                      handleSetPassword();
                    }}
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirmPw(v => !v)}>
                    <View pointerEvents="none">
                      <Ionicons
                        name={showConfirmPw ? 'eye-outline' : 'eye-off-outline'}
                        size={20}
                        color="#4a5e56"
                      />
                    </View>
                  </Pressable>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => {
                  console.log('[invite] Set Password button tapped — loading:', loading);
                  handleSetPassword();
                }}
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

  // ── Render: login ──────────────────────────────────────────────────────────
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
            <Text style={styles.tagline}>Everything in its Place.</Text>
          </View>

          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#4a5e56"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              editable={!loading}
            />
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#4a5e56"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                editable={!loading}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => {
                  console.log('eye tapped');
                  setShowPassword(v => !v);
                }}>
                <View pointerEvents="none">
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#4a5e56"
                  />
                </View>
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {timedOut ? (
              <View style={styles.timeoutBox}>
                <Text style={styles.timeoutTitle}>Connection timed out</Text>
                <Text style={styles.timeoutSub}>
                  Supabase took too long to respond — this can happen on cold starts.
                </Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={handleSignIn}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.retryButtonText}>Retry</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={BG} />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>
            )}
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
  centeredFull: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#6b7a74',
    fontSize: 15,
    fontWeight: '500',
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
  tagline: {
    fontSize: 15,
    color: '#6b7a74',
    fontWeight: '400',
    letterSpacing: 0.5,
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
  input: {
    backgroundColor: '#162019',
    borderWidth: 1,
    borderColor: '#1f3028',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#e8f0ec',
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
  timeoutBox: {
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12,
    padding: 20,
    gap: 8,
    alignItems: 'center',
  },
  timeoutTitle: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  timeoutSub: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: BLUE,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    minWidth: 120,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
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
