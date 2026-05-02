import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BORDER = '#1e3028';
const MUTED = '#6b7a74';
const BLUE = '#4169E1';

type BadgeDef = {
  key: string;
  emoji: string;
  title: string;
  desc: string;
  accent: string;
  iconBg: string;
};

const ALL_BADGES: BadgeDef[] = [
  { key: 'first_payout',    emoji: '💸', title: 'First Payout',    desc: 'Received your first tip',              accent: '#4169E1', iconBg: '#0d3324' },
  { key: 'ten_shifts',      emoji: '🔟', title: '10 Shifts',       desc: 'Completed 10 shifts',                  accent: '#4da6ff', iconBg: '#0d1f33' },
  { key: 'top_earner',      emoji: '🏆', title: 'Top Earner',      desc: 'Highest tip % in location',            accent: '#f5c842', iconBg: '#2e2408' },
  { key: 'five_day_streak', emoji: '🔥', title: '5-Day Streak',    desc: '5 shifts above 20% in a row',         accent: '#ff7a3d', iconBg: '#2e1408' },
  { key: 'diamond_earner',  emoji: '💎', title: 'Diamond Earner',  desc: '$25k in total tips',                   accent: '#7ec8e3', iconBg: '#0d2233' },
  { key: 'star_server',     emoji: '⭐', title: 'Star Server',     desc: '20%+ avg for a full month',            accent: '#f5c842', iconBg: '#2e2408' },
  { key: 'consistent',      emoji: '🎯', title: 'Consistent',      desc: 'Hit goal 4 weeks in a row',           accent: '#22c55e', iconBg: '#0d2a1e' },
  { key: 'legend',          emoji: '👑', title: 'Legend',          desc: '#1 for a full month',                  accent: '#a78bfa', iconBg: '#1a0d33' },
];

export default function BadgesScreen() {
  const [earnedKeys, setEarnedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadBadges = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: member } = await supabase
        .from('staff_members')
        .select('id')
        .eq('email', user.email ?? '')
        .maybeSingle();

      if (!member) { setLoading(false); return; }

      const { data: badges } = await supabase
        .from('staff_badges')
        .select('badge_key')
        .eq('staff_id', member.id);

      setEarnedKeys(new Set((badges ?? []).map(b => b.badge_key)));
    } catch (err) {
      console.log('[Badges] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadBadges(); }, [loadBadges]));
  useWebFocus(loadBadges);

  const earned = ALL_BADGES.filter(b => earnedKeys.has(b.key));
  const locked = ALL_BADGES.filter(b => !earnedKeys.has(b.key));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.screenTitle}>🏅 Badges</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Earned ({earned.length})</Text>
            {earned.length > 0 ? (
              <View style={styles.grid}>
                {earned.map(badge => (
                  <View key={badge.key} style={styles.earnedCard}>
                    <View style={[styles.iconCircle, { backgroundColor: badge.iconBg }]}>
                      <Text style={styles.iconEmoji}>{badge.emoji}</Text>
                    </View>
                    <Text style={[styles.badgeTitle, { color: badge.accent }]}>{badge.title}</Text>
                    <Text style={[styles.badgeDesc, { color: badge.accent, opacity: 0.7 }]}>{badge.desc}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No badges earned yet. Keep going — your first one is on the way!</Text>
              </View>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>🔒 Locked</Text>
            <View style={styles.grid}>
              {locked.map(badge => (
                <View key={badge.key} style={styles.lockedCard}>
                  <View style={styles.lockedIconCircle}>
                    <Text style={[styles.iconEmoji, styles.lockedEmoji]}>{badge.emoji}</Text>
                  </View>
                  <Text style={styles.lockedTitle}>{badge.title}</Text>
                  <Text style={styles.lockedDesc}>{badge.desc}</Text>
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  loadingWrap: { height: 160, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#9db8ad', marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: { fontSize: 14, color: MUTED, lineHeight: 20 },

  earnedCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    width: '47%',
    gap: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 24 },
  badgeTitle: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  badgeDesc: { fontSize: 12, fontWeight: '500', lineHeight: 16 },

  lockedCard: {
    backgroundColor: '#0f1712',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a2420',
    padding: 16,
    width: '47%',
    gap: 10,
    opacity: 0.5,
  },
  lockedIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a2420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedEmoji: { opacity: 0.6 },
  lockedTitle: { fontSize: 15, fontWeight: '700', color: MUTED, lineHeight: 18 },
  lockedDesc: { fontSize: 12, fontWeight: '500', color: MUTED, lineHeight: 16, opacity: 0.8 },
});
