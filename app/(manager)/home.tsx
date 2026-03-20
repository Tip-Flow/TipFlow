import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getDailyQuote } from '../../lib/quotes';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';

const managerQuote = getDailyQuote('manager');

const FALLBACK_STATS = {
  locationName: 'Your Restaurant',
  tipsThisWeek: '$8,120',
  staffActive: '8',
  bankNotLinked: '2',
};

const leaderboard = [
  { rank: 1, name: 'Priya S.', tips: '$1,840', medal: '🥇' },
  { rank: 2, name: 'Marcus T.', tips: '$1,610', medal: '🥈' },
  { rank: 3, name: 'Lena K.', tips: '$1,290', medal: '🥉' },
];

export default function ManagerHome() {
  const [locationName, setLocationName] = useState(FALLBACK_STATS.locationName);
  const [tipsThisWeek, setTipsThisWeek] = useState(FALLBACK_STATS.tipsThisWeek);
  const [staffActive, setStaffActive] = useState(FALLBACK_STATS.staffActive);
  const [bankNotLinked, setBankNotLinked] = useState(FALLBACK_STATS.bankNotLinked);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [locationRes, staffRes, shiftsRes, bankRes] = await Promise.all([
          supabase.from('locations').select('name').limit(1),
          supabase.from('staff_members').select('id'),
          supabase.from('shifts').select('total_tips'),
          supabase.from('staff_members').select('id').eq('bank_linked', false),
        ]);

        console.log('[fetchDashboardData] locationRes:', {
          data: locationRes.data,
          count: locationRes.count,
          error: locationRes.error,
        });
        console.log('[fetchDashboardData] staffRes:', {
          data: staffRes.data,
          count: staffRes.count,
          error: staffRes.error,
        });
        console.log('[fetchDashboardData] shiftsRes:', {
          data: shiftsRes.data,
          count: shiftsRes.count,
          error: shiftsRes.error,
        });
        console.log('[fetchDashboardData] bankRes:', {
          data: bankRes.data,
          count: bankRes.count,
          error: bankRes.error,
        });

        if (locationRes.data && locationRes.data[0]) {
          setLocationName(locationRes.data[0].name);
        }

        if (staffRes.data) {
          setStaffActive(String(staffRes.data.length));
        }

        if (shiftsRes.data) {
          const totalCents = shiftsRes.data.reduce(
            (sum, shift) => sum + (shift.total_tips ?? 0),
            0
          );
          const dollars = Math.round(totalCents / 100);
          setTipsThisWeek('$' + dollars.toLocaleString('en-CA'));
        }

        if (bankRes.data) {
          setBankNotLinked(String(bankRes.data.length));
        }
      } catch {
        // Keep fallback values already set in state
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  const stats = [
    { label: 'Wallet Balance', value: '$5,820', icon: '💳', accent: TEAL },
    { label: 'Tips This Week', value: tipsThisWeek, icon: '📈', accent: TEAL },
    { label: 'Staff Active', value: staffActive, icon: '👥', accent: TEAL },
    { label: 'Bank Not Linked', value: bankNotLinked, icon: '🏦', accent: '#ff6b6b' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Lead Card */}
        <View style={styles.leadCard}>
          <Text style={styles.leadLabel}>LEAD WITH THIS TODAY</Text>
          <Text style={styles.leadText}>{managerQuote.text}</Text>
          {managerQuote.author ? (
            <Text style={styles.leadAuthor}>— {managerQuote.author}</Text>
          ) : null}
        </View>

        {/* Greeting */}
        <Text style={styles.greeting}>Good evening, Jamie 👋</Text>
        <Text style={styles.subGreeting}>
          {loading ? 'Loading...' : locationName}
        </Text>

        {/* Stat Cards 2x2 Grid */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        ) : (
        <View style={styles.grid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.card}>
              <Text style={styles.cardIcon}>{stat.icon}</Text>
              <Text style={[styles.cardValue, { color: stat.accent }]}>{stat.value}</Text>
              <Text style={styles.cardLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        )}

        {/* Team Goal Progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Weekly Team Goal</Text>
            <Text style={styles.sectionBadge}>2 days left</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressPct}>79%</Text>
            <Text style={styles.progressTarget}>Goal: $10,000</Text>
          </View>
        </View>

        {/* Leaderboard Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performers</Text>
          <View style={styles.leaderboardCard}>
            {leaderboard.map((entry, index) => (
              <View
                key={entry.rank}
                style={[
                  styles.leaderRow,
                  index < leaderboard.length - 1 && styles.leaderRowBorder,
                ]}>
                <Text style={styles.medal}>{entry.medal}</Text>
                <View style={styles.leaderInfo}>
                  <Text style={styles.leaderName}>{entry.name}</Text>
                  <Text style={styles.leaderRank}>#{entry.rank} this week</Text>
                </View>
                <Text style={styles.leaderTips}>{entry.tips}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 24,
  },

  // Lead card
  leadCard: {
    backgroundColor: '#162019',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    borderWidth: 1,
    borderColor: '#1f3028',
  },
  leadLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TEAL,
    letterSpacing: 2,
    marginBottom: 8,
  },
  leadText: {
    fontSize: 14,
    color: '#e8f0ec',
    lineHeight: 21,
    fontWeight: '400',
  },
  leadAuthor: {
    fontSize: 12,
    color: TEAL,
    fontWeight: '500',
    marginTop: 6,
  },

  // Greeting
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 14,
    color: MUTED,
    marginTop: 2,
  },

  // Loading
  loadingContainer: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    width: '47.5%',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1f3028',
  },
  cardIcon: {
    fontSize: 22,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -0.5,
  },
  cardLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },

  // Section
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: WHITE,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: TEAL,
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  // Progress Bar
  progressTrack: {
    height: 10,
    backgroundColor: '#1f3028',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    width: '79%',
    height: '100%',
    backgroundColor: TEAL,
    borderRadius: 10,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },
  progressTarget: {
    fontSize: 13,
    color: MUTED,
  },

  // Leaderboard
  leaderboardCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f3028',
    overflow: 'hidden',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  leaderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f3028',
  },
  medal: {
    fontSize: 24,
  },
  leaderInfo: {
    flex: 1,
    gap: 2,
  },
  leaderName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  leaderRank: {
    fontSize: 12,
    color: MUTED,
  },
  leaderTips: {
    fontSize: 15,
    fontWeight: '700',
    color: TEAL,
  },
});
