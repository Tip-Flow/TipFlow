import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import DailyQuote from './components/DailyQuote';

type PendingRole = 'manager' | 'staff' | null;

const TEAL = '#00e5a0';
const BG = '#09100e';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRole, setPendingRole] = useState<PendingRole>(null);

  function detectRole(userEmail: string): PendingRole {
    const lower = userEmail.toLowerCase();
    if (lower.includes('jamie')) return 'manager';
    if (lower.includes('alex')) return 'staff';
    // Default fallback — treat unknown as staff
    return 'staff';
  }

  function handleDismiss() {
    if (pendingRole === 'manager') {
      router.replace('/(manager)/home');
    } else {
      router.replace('/(staff)/mytips');
    }
    setPendingRole(null);
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

  if (pendingRole !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <DailyQuote role={pendingRole} onDismiss={handleDismiss} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

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
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
});
