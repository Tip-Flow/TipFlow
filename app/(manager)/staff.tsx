import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useIsDesktop } from '@/hooks/use-is-desktop';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const GREEN = '#22c55e';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const GREEN_BORDER = 'rgba(34,197,94,0.4)';
const RED = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.15)';
const RED_BORDER = 'rgba(239,68,68,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type BankStatus = 'linked' | 'unlinked';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  location: string;
  status: BankStatus;
  payoutMethod: string | null;
}

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#f97316', '#22c55e'];

function avatarColor(id: string): string {
  const h = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function payoutMethodLabel(method: string | null): string {
  if (method === 'etransfer') return 'Interac e-Transfer';
  if (method === 'eft') return 'EFT';
  if (method === 'cash') return 'Cash';
  return 'Bank linked';
}

function StatusBadge({ status }: { status: BankStatus }) {
  if (status === 'linked') {
    return (
      <View style={[styles.badge, { backgroundColor: GREEN_DIM, borderColor: GREEN_BORDER }]}>
        <Text style={[styles.badgeText, { color: GREEN }]}>✓ Linked</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: RED_DIM, borderColor: RED_BORDER }]}>
      <Text style={[styles.badgeText, { color: RED }]}>✕ Unlinked</Text>
    </View>
  );
}

function StaffCard({
  member,
  isLast,
  onSendInvite,
}: {
  member: StaffMember;
  isLast: boolean;
  onSendInvite: (m: StaffMember) => void;
}) {
  const color = avatarColor(member.id);
  return (
    <View style={[styles.staffRow, !isLast && styles.staffRowBorder]}>
      <View style={[styles.initCircle, { backgroundColor: color + '33' }]}>
        <Text style={[styles.initText, { color }]}>{getInitials(member.name)}</Text>
      </View>
      <View style={styles.staffInfo}>
        <View style={styles.staffTopRow}>
          <Text style={styles.staffName}>{member.name}</Text>
          <StatusBadge status={member.status} />
        </View>
        <Text style={styles.staffMeta}>{member.role} · {member.location}</Text>
        <View style={styles.tagRow}>
          {member.status === 'linked' ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>🏦 {payoutMethodLabel(member.payoutMethod)}</Text>
            </View>
          ) : (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Not linked</Text>
            </View>
          )}
        </View>
        {member.status === 'unlinked' && (
          <TouchableOpacity
            style={styles.inviteBtn}
            activeOpacity={0.8}
            onPress={() => onSendInvite(member)}>
            <Text style={styles.inviteBtnText}>Send Bank Link Invite →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function StaffGridCard({
  member,
  onSendInvite,
}: {
  member: StaffMember;
  onSendInvite: (m: StaffMember) => void;
}) {
  const color = avatarColor(member.id);
  return (
    <View style={styles.gridCard}>
      <View style={styles.gridCardTop}>
        <View style={[styles.initCircle, { backgroundColor: color + '33' }]}>
          <Text style={[styles.initText, { color }]}>{getInitials(member.name)}</Text>
        </View>
        <StatusBadge status={member.status} />
      </View>
      <Text style={styles.gridName}>{member.name}</Text>
      <Text style={styles.gridMeta}>{member.role} · {member.location}</Text>
      <View style={styles.tagRow}>
        {member.status === 'linked' ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>🏦 {payoutMethodLabel(member.payoutMethod)}</Text>
          </View>
        ) : (
          <View style={styles.tag}>
            <Text style={styles.tagText}>Not linked</Text>
          </View>
        )}
      </View>
      {member.status === 'unlinked' && (
        <TouchableOpacity
          style={styles.inviteBtn}
          activeOpacity={0.8}
          onPress={() => onSendInvite(member)}>
          <Text style={styles.inviteBtnText}>Send Invite →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function StaffScreen() {
  const isDesktop = useIsDesktop();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchStaff = useCallback(async () => {
    try {
      const { data: loc } = await supabase
        .from('locations')
        .select('id, name')
        .limit(1)
        .single();

      if (!loc) { setLoading(false); return; }
      setLocationName(loc.name);

      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, role, email, bank_linked, payout_method')
        .eq('location_id', loc.id)
        .order('name');

      if (error) console.log('[Staff] fetch error:', error.message);

      setStaff(
        (data ?? []).map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          email: m.email,
          location: loc.name,
          status: m.bank_linked ? 'linked' : 'unlinked',
          payoutMethod: m.payout_method,
        }))
      );
    } catch (err) {
      console.log('[Staff] exception:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchStaff(); }, [fetchStaff]));

  async function handleSendInvite(member: StaffMember) {
    if (!member.email) {
      Alert.alert('No email', 'This staff member has no email address on file.');
      return;
    }
    Alert.alert(
      'Send Bank Link Invite',
      `Send a Flinks bank link invite to ${member.name} at ${member.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Invite',
          onPress: async () => {
            await supabase
              .from('staff_members')
              .update({ invite_sent_at: new Date().toISOString() })
              .eq('id', member.id);
            Alert.alert('Invite Sent', `Bank link invite sent to ${member.email}`);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Staff</Text>
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How bank linking works</Text>
          <Text style={styles.infoBody}>
            Staff link their own bank accounts — Add staff → they receive a secure SMS invite → link via Flinks open banking → tips route automatically
          </Text>
          <View style={styles.infoSteps}>
            {['Add staff', 'SMS invite sent', 'Staff links via Flinks', 'Tips auto-routed'].map((step, i) => (
              <View key={step} style={styles.infoStep}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
                <Text style={styles.stepLabel}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Team Members */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {locationName ? `${locationName} — Team` : 'Team Members'}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{staff.length}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : staff.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No staff members yet. Tap + Add to get started.</Text>
          </View>
        ) : isDesktop ? (
          <View style={styles.cardGrid}>
            {staff.map(member => (
              <StaffGridCard key={member.id} member={member} onSendInvite={handleSendInvite} />
            ))}
          </View>
        ) : (
          <View style={styles.listCard}>
            <View style={styles.listDivider} />
            {staff.map((member, index) => (
              <StaffCard
                key={member.id}
                member={member}
                isLast={index === staff.length - 1}
                onSendInvite={handleSendInvite}
              />
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 20,
  },
  contentDesktop: { paddingHorizontal: 32 },

  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 8,
    minWidth: 260,
    flex: 1,
    maxWidth: '32%' as any,
  },
  gridCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gridName: { fontSize: 16, fontWeight: '800', color: WHITE, letterSpacing: -0.2 },
  gridMeta: { fontSize: 12, color: MUTED },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  addBtn: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: BLUE },

  infoCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BLUE_BORDER,
    padding: 18,
    gap: 12,
  },
  infoTitle: { fontSize: 15, fontWeight: '800', color: BLUE, letterSpacing: -0.2 },
  infoBody: { fontSize: 13, color: MUTED, lineHeight: 19 },
  infoSteps: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BLUE_DIM,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  stepLabel: { fontSize: 12, fontWeight: '600', color: BLUE },

  listCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  listTitle: { fontSize: 17, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  countBadge: {
    backgroundColor: BLUE_DIM,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  countText: { fontSize: 12, fontWeight: '700', color: BLUE },
  listDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 18 },

  loadingWrap: { height: 160, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

  staffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  staffRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },

  initCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  initText: { fontSize: 15, fontWeight: '800' },

  staffInfo: { flex: 1, gap: 5 },
  staffTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  staffName: { fontSize: 15, fontWeight: '700', color: WHITE, flex: 1 },
  staffMeta: { fontSize: 12, color: MUTED },

  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: MUTED },

  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  inviteBtn: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inviteBtnText: { fontSize: 13, fontWeight: '700', color: BLUE },
});
