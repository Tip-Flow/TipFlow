import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>💸</Text>
          <Text style={styles.logoText}>TipFlow</Text>
          <Text style={styles.tagline}>Tip distribution, simplified.</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.8}
            onPress={() => router.push('/(manager)/home')}>
            <Text style={styles.buttonText}>Sign in as Manager</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonOutline]}
            activeOpacity={0.8}
            onPress={() => router.push('/(staff)/mytips')}>
            <Text style={[styles.buttonText, styles.buttonTextOutline]}>Sign in as Staff</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const TEAL = '#00e5a0';
const BG = '#09100e';

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
    gap: 64,
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
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    backgroundColor: TEAL,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: TEAL,
  },
  buttonText: {
    color: BG,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  buttonTextOutline: {
    color: TEAL,
  },
});
