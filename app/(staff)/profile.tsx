import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BORDER = '#1e3028';
const MUTED = '#6b7a74';
const LABEL = '#9db8ad';

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.screenTitle}>Profile</Text>

        {/* Profile Hero Card */}
        <View style={styles.heroCard}>
          {/* Avatar + Name */}
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

          {/* Stats */}
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
            <View style={styles.linkedBadge}>
              <Text style={styles.linkedText}>✓ Linked</Text>
            </View>
          </View>
          <Text style={styles.bankName}>RBC Royal Bank</Text>
          <Text style={styles.bankAccount}>Chequing ···4821</Text>
          <Text style={styles.bankSub}>via Flinks</Text>
        </View>

        {/* Payout Method Card */}
        <View style={styles.card}>
          <Text style={styles.payoutMethod}>📱 Interac e-Transfer</Text>
          <Text style={styles.payoutDetails}>alex@tip.ca · Instant · 24/7 via EFT</Text>
        </View>

        {/* Settings List */}
        <View style={styles.card}>
          {SETTINGS.map((item, i) => (
            <View key={item.label}>
              <Pressable style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>
                  {item.icon} {item.label}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              {i < SETTINGS.length - 1 && <View style={styles.rowSep} />}
            </View>
          ))}
        </View>

        {/* Sign Out */}
        <Pressable
          style={styles.signOutBtn}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/');
          }}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const SETTINGS = [
  { icon: '🔔', label: 'Notifications' },
  { icon: '🔒', label: 'Security & Face ID' },
  { icon: '❓', label: 'Help & Support' },
];

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },

  // Hero card
  heroCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0d2a1c',
    borderWidth: 2,
    borderColor: BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: 1,
  },
  avatarInfo: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  role: {
    fontSize: 14,
    color: LABEL,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  goldBadge: {
    backgroundColor: '#2a1f00',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#5a4500',
  },
  goldBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fbbf24',
  },
  amberBadge: {
    backgroundColor: '#2a1500',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#5a3000',
  },
  amberBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f97316',
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  statSep: {
    width: 1,
    height: 32,
    backgroundColor: BORDER,
  },

  // Generic card
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  linkedBadge: {
    backgroundColor: '#0d3324',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1a5c3a',
  },
  linkedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4ade80',
  },
  bankName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e8f5ef',
  },
  bankAccount: {
    fontSize: 14,
    color: LABEL,
    fontWeight: '500',
  },
  bankSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },

  // Payout method
  payoutMethod: {
    fontSize: 16,
    fontWeight: '700',
    color: BLUE,
  },
  payoutDetails: {
    fontSize: 13,
    color: LABEL,
    marginTop: 2,
  },

  // Settings rows
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  settingsLabel: {
    fontSize: 15,
    color: '#e8f5ef',
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: MUTED,
    lineHeight: 22,
  },
  rowSep: {
    height: 1,
    backgroundColor: BORDER,
  },

  // Sign out
  signOutBtn: {
    backgroundColor: '#1f0a0a',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3d1515',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f87171',
  },
});
