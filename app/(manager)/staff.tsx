import { StyleSheet, Text, View, SafeAreaView } from 'react-native';

const BG = '#09100e';
const MUTED = '#6b7a74';

export default function StaffScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>👥</Text>
        <Text style={styles.title}>Staff</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  icon: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#e8f0ec' },
  subtitle: { fontSize: 14, color: MUTED },
});
