import { useState } from 'react';
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

const BLUE = '#4169E1';
const BG   = '#09100e';

const ADMIN_EMAILS = ['sukhi.muker@gmail.com', 'sukhi@drsukhi.com'];

async function resolveRole(email: string): Promise<'admin' | 'regional' | 'manager' | 'staff' | 'not_found'> {
  console.log('[resolveRole] starting for:', email);

  // Normalise — trim whitespace AND lowercase to handle browser autofill quirks
  const lower = email.trim().toLowerCase();

  console.log('[resolveRole] admin check:', lower, ADMIN_EMAILS, ADMIN_EMAILS.includes(lower));

  // ── 1. Admin check — must be FIRST, no DB queries ──
  if (ADMIN_EMAILS.includes(lower)) {
    console.log('[resolveRole] → admin');
    return 'admin';
  }

  // ── 2. Managers table ──
  const { data: manager, error: mgrErr } = await supabase
    .from('managers')
    .select('role')
    .eq('email', lower)
    .maybeSingle();
  console.log('[resolveRole] managers — data:', JSON.stringify(manager), 'error:', JSON.stringify(mgrErr));

  if (manager?.role === 'regional_manager') { console.log('[resolveRole] → regional'); return 'regional'; }
  if (manager?.role === 'location_manager') { console.log('[resolveRole] → manager');  return 'manager';  }

  // ── 3. Staff members table ──
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
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [pendingRole, setPendingRole] = useState<PendingRole>(null);
  const [pendingGoals, setPendingGoals] = useState<ShiftGoal[] | null>(null);

  // Called after DailyQuote is dismissed — only for non-admin roles.
  // Role is passed explicitly to avoid reading stale closure state.
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

  async function handleSignIn() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }

      const role = await resolveRole(trimmedEmail);
      console.log('[handleSignIn] resolved role:', role);

      if (role === 'not_found') {
        await supabase.auth.signOut();
        setError('Account not found. Contact your manager to be added to Mise.');
        return;
      }

      // Admin routes immediately — no DailyQuote, no state indirection.
      // setTimeout gives the web router one event-loop tick to finish
      // processing the auth state change before navigation fires.
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
  logoContainer: {
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 64,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 15,
    color: '#6b7a74',
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  formContainer: {
    width: '100%',
    gap: 14,
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
