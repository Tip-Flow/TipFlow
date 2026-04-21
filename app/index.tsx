import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import DailyQuote from './components/DailyQuote';
import ShiftGoalsSplash, { ShiftGoal } from './components/ShiftGoalsSplash';

type PendingRole = 'manager' | 'staff' | 'regional' | null;

const TEAL = '#00e5a0';
const BG = '#09100e';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRole, setPendingRole] = useState<PendingRole>(null);
  const [pendingGoals, setPendingGoals] = useState<ShiftGoal[] | null>(null);

  function detectRole(userEmail: string): PendingRole {
    const lower = userEmail.toLowerCase();
    if (lower.includes('regional')) return 'regional';
    if (lower.includes('jamie')) return 'manager';
    if (lower.includes('alex')) return 'staff';
    // Default fallback — treat unknown as staff
    return 'staff';
  }

  async function handleDismissQuote() {
    if (pendingRole === 'regional') {
      router.replace('/(regional)/overview');
      setPendingRole(null);
    } else if (pendingRole === 'manager') {
      router.replace('/(manager)/home');
      setPendingRole(null);
    } else {
      // Staff: check for today's shift goals before navigating
      const goals = await fetchTodaysShiftGoals();
      if (goals.length > 0) {
        setPendingGoals(goals);
      } else {
        router.replace('/(staff)/mytips');
        setPendingRole(null);
      }
    }
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
      const role = detectRole(trimmedEmail);
      setPendingRole(role);
    } finally {
      setLoading(false);
    }
  }

  if (pendingRole !== null && pendingGoals === null) {
    return (
      <SafeAreaView style={styles.container}>
        <DailyQuote role={pendingRole} onDismiss={handleDismissQuote} />
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
            <Text style={styles.logoEmoji}>💸</Text>
            <Text style={styles.logoText}>TipFlow</Text>
            <Text style={styles.tagline}>Tip distribution, simplified.</Text>
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
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#4a5e56"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              editable={!loading}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              activeOpacity={0.8}
              onPress={handleSignIn}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.regionalButton, loading && styles.buttonDisabled]}
              activeOpacity={0.8}
              onPress={() => {
                setEmail('regional@canteen.ca');
                setPassword('password');
              }}
              disabled={loading}>
              <Text style={styles.regionalButtonText}>Sign in as Regional Manager</Text>
            </TouchableOpacity>
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
    gap: 8,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 48,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#6b7a74',
    letterSpacing: 0.3,
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
  errorText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  button: {
    backgroundColor: TEAL,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: BG,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1f3028',
  },
  dividerText: {
    fontSize: 13,
    color: '#4a5e56',
    fontWeight: '500',
  },
  regionalButton: {
    backgroundColor: '#162019',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f3028',
  },
  regionalButtonText: {
    color: '#6b7a74',
    fontSize: 15,
    fontWeight: '600',
  },
});
