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
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const BLUE = '#4169E1';
const BG   = '#09100e';

let cachedAccessToken  = '';
let cachedRefreshToken = '';

type Phase = 'loading' | 'set-password' | 'error' | 'done';

export default function InviteScreen() {
  const router = useRouter();

  const [phase, setPhase]         = useState<Phase>('loading');
  const [errorMsg, setErrorMsg]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [fieldError, setFieldError] = useState('');
  const sessionEstablished = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionEstablished.current) return;

    // 1. Check sessionStorage first — populated on a previous mount before any remount wiped state.
    let resolvedAccess  = '';
    let resolvedRefresh = '';
    try {
      const storedAccess  = sessionStorage.getItem('mise_invite_access_token');
      const storedRefresh = sessionStorage.getItem('mise_invite_refresh_token');
      if (storedAccess && storedRefresh) {
        resolvedAccess  = storedAccess;
        resolvedRefresh = storedRefresh;
        sessionStorage.removeItem('mise_invite_access_token');
        sessionStorage.removeItem('mise_invite_refresh_token');
      }
    } catch {}

    // 2. Parse the hash — overrides sessionStorage if fresh tokens are present.
    const hash   = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);

    const accessToken  = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const code         = search.get('code');

    if (accessToken && refreshToken) {
      try {
        sessionStorage.setItem('mise_invite_access_token', accessToken);
        sessionStorage.setItem('mise_invite_refresh_token', refreshToken);
      } catch {}
      resolvedAccess  = accessToken;
      resolvedRefresh = refreshToken;
    }

    // 3. Module-level cache as a final fallback.
    if (resolvedAccess)  cachedAccessToken  = resolvedAccess;
    if (resolvedRefresh) cachedRefreshToken = resolvedRefresh;
    if (!resolvedAccess)  resolvedAccess  = cachedAccessToken;
    if (!resolvedRefresh) resolvedRefresh = cachedRefreshToken;

    if (resolvedAccess && resolvedRefresh) {
      supabase.auth.setSession({ access_token: resolvedAccess, refresh_token: resolvedRefresh })
        .then(({ error }) => {
          if (error) {
            setErrorMsg('Invite link expired or already used. Please ask your manager to resend it.');
            setPhase('error');
          } else {
            sessionEstablished.current = true;
            setPhase('set-password');
          }
        });
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setErrorMsg('Invite link expired or already used. Please ask your manager to resend it.');
            setPhase('error');
          } else {
            sessionEstablished.current = true;
            setPhase('set-password');
          }
        });
    } else {
      setErrorMsg('Invalid invite link. Please ask your manager to resend it.');
      setPhase('error');
    }
  }, []);

  async function handleSubmit() {
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    setFieldError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPhase('done');
      router.replace('/');
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

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

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorHeading}>Invite link problem</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'height' : undefined}>
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Mise</Text>
            <Text style={styles.headline}>Welcome to Mise</Text>
            <Text style={styles.sub}>Set a password to secure your account.</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Password (min. 8 characters)"
              placeholderTextColor="#4a5e56"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              returnKeyType="next"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#4a5e56"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!loading}
            />

            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}>
              {loading
                ? <ActivityIndicator color={BG} />
                : <Text style={styles.buttonText}>Set Password & Sign In →</Text>}
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: BG },
  keyboardView: { flex: 1 },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText:  { color: '#6b7a74', fontSize: 15, fontWeight: '500' },
  errorHeading: { color: '#f87171', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBody:    { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  logoContainer: { alignItems: 'center', gap: 10 },
  logoText: { fontSize: 64, fontWeight: '800', color: BLUE, letterSpacing: -2 },
  headline: { fontSize: 22, fontWeight: '700', color: '#e8f0ec', letterSpacing: -0.3, textAlign: 'center' },
  sub:      { fontSize: 14, color: '#6b7a74', textAlign: 'center', lineHeight: 20 },
  form: { width: '100%', gap: 14 },
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
  errorText:     { color: '#f87171', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  button:        { backgroundColor: BLUE, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:    { color: '#ffffff', fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
});
