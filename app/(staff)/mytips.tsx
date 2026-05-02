import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useWebFocus } from '@/hooks/useWebFocus';
import { getDailyQuote, Quote } from '../../lib/quotes';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const MUTED = '#6b7a74';
const LABEL = '#9db8ad';
const BORDER = '#1e3028';

type Payout = {
  id: string;
  amount: number;
  paidAt: string;
  shiftName: string;
  aptpayRef: string | null;
};

type HeroData = {
  staffName: string;
  locationName: string;
  totalCents: number;
  shiftCount: number;
  payoutMethod: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyTipsScreen() {
  const [staffQuote, setStaffQuote] = useState<Quote | null>(null);
  const [hero, setHero] = useState<HeroData | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDailyQuote('staff').then(setStaffQuote);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: member } = await supabase
        .from('staff_members')
        .select('id, name, payout_method, location_id, locations(name)')
        .eq('email', user.email ?? '')
        .maybeSingle();

      if (!member) { setLoading(false); return; }

      const { data: allocations } = await supabase
        .from('tip_allocations')
        .select('id, calculated_amount, paid_at, aptpay_ref, shifts(name, date)')
        .eq('staff_id', member.id)
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(20);

      const allocs = allocations ?? [];
      const totalCents = allocs.reduce((sum, a) => sum + (a.calculated_amount ?? 0), 0);

      setHero({
        staffName: member.name,
        locationName: (member.locations as any)?.name ?? 'Your Location',
        totalCents,
        shiftCount: allocs.length,
        payoutMethod: member.payout_method,
      });

      setPayouts(
        allocs.map(a => ({
          id: a.id,
          amount: a.calculated_amount ?? 0,
          paidAt: a.paid_at ?? '',
          shiftName: (a.shifts as any)?.name ?? 'Shift',
          aptpayRef: a.aptpay_ref,
        }))
      );
    } catch (err) {
      console.log('[MyTips] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useWebFocus(loadData);

  function payoutMethodLabel(method: string | null): string {
    if (method === 'etransfer') return '📱 Interac e-Transfer';
    if (method === 'eft') return '🏦 EFT';
    if (method === 'cash') return '💵 Cash';
    return '📱 Interac e-Transfer';
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.screenTitle}>My Tips</Text>

        {/* Daily Intention Card */}
        <View style={styles.intentionCard}>
          <Text style={styles.intentionLabel}>TODAY'S INTENTION</Text>
          <Text style={styles.intentionText}>{staffQuote?.text ?? ''}</Text>
          {staffQuote?.author ? (
            <Text style={styles.intentionAuthor}>— {staffQuote.author}</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : hero ? (
          <>
            {/* Hero Card */}
            <View style={styles.heroCard}>
              <Text style={styles.heroSubtitle}>
                {hero.staffName} · {hero.locationName}
              </Text>
              <Text style={styles.heroAmount}>
                ${(hero.totalCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.heroMeta}>
                CAD earned · {hero.shiftCount} shift{hero.shiftCount !== 1 ? 's' : ''} paid
              </Text>

              <View style={styles.divider} />

              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>{payoutMethodLabel(hero.payoutMethod)}</Text>
                <View style={styles.instantBadge}>
                  <Text style={styles.instantText}>Instant · 24/7</Text>
                </View>
              </View>
            </View>

            {/* Recent Payouts */}
            {payouts.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Recent Payouts</Text>
                </View>

                {payouts.slice(0, 10).map((p, i) => (
                  <View
                    key={p.id}
                    style={[styles.payoutItem, i < Math.min(payouts.length, 10) - 1 && styles.payoutItemBorder]}>
                    <View style={styles.payoutLeft}>
                      <Text style={styles.payoutAmount}>
                        ${(p.amount / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={styles.payoutDate}>
                        {formatDate(p.paidAt)} · {p.shiftName}
                      </Text>
                    </View>
                    <View style={styles.payoutRight}>
                      <Text style={styles.payoutStatus}>Paid</Text>
                      {p.aptpayRef ? (
                        <Text style={styles.payoutRef}>AptPay · {p.aptpayRef}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {payouts.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No payouts yet. Your earnings will appear here once your manager processes your first shift.</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Could not load your tip data. Please check your connection and try again.</Text>
          </View>
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

  loadingWrap: { height: 200, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: { fontSize: 14, color: MUTED, lineHeight: 20, textAlign: 'center' },

  heroCard: {
    backgroundColor: '#0d1f17',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroSubtitle: { fontSize: 14, color: LABEL, fontWeight: '500', marginBottom: 6 },
  heroAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -2,
    lineHeight: 58,
  },
  heroMeta: { fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 16 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payoutLabel: { fontSize: 15, color: '#d0e8df', fontWeight: '500' },
  instantBadge: {
    backgroundColor: '#0d3324',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1a5c3a',
  },
  instantText: { fontSize: 12, color: BLUE, fontWeight: '700' },

  intentionCard: {
    backgroundColor: '#162019',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  intentionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 2,
    marginBottom: 8,
  },
  intentionText: { fontSize: 14, color: '#e8f5ef', lineHeight: 21, fontWeight: '400' },
  intentionAuthor: { fontSize: 12, color: BLUE, fontWeight: '500', marginTop: 6 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },

  payoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  payoutItemBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  payoutLeft: { gap: 3 },
  payoutRight: { alignItems: 'flex-end', gap: 3 },
  payoutAmount: { fontSize: 18, fontWeight: '700', color: '#e8f5ef' },
  payoutDate: { fontSize: 13, color: MUTED },
  payoutStatus: { fontSize: 13, fontWeight: '700', color: BLUE },
  payoutRef: { fontSize: 12, color: MUTED },
});
