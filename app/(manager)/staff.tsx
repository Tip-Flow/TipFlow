import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useLocationId } from '@/hooks/useLocationId';
import { useWebFocus } from '@/hooks/useWebFocus';

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
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type BankStatus = 'linked' | 'unlinked';
type Role = 'server' | 'bartender' | 'runner' | 'kitchen' | 'support';

const ROLES: { value: Role; label: string; icon: string }[] = [
  { value: 'server',    label: 'Server',     icon: '🍽️' },
  { value: 'bartender', label: 'Bartender',  icon: '🍸' },
  { value: 'runner',    label: 'Runner',     icon: '🏃' },
  { value: 'kitchen',   label: 'Kitchen',    icon: '👨‍🍳' },
  { value: 'support',   label: 'Support',    icon: '🤝' },
];

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  location: string;
  status: BankStatus;
  payoutMethod: string | null;
  inviteSentAt: string | null;
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

function InviteBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
      <Text style={[styles.badgeText, { color: AMBER }]}>✉ Invited</Text>
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
  const showResend = !!member.inviteSentAt && member.status === 'unlinked';
  const showInvite = !member.inviteSentAt && member.status === 'unlinked';

  return (
    <View style={[styles.staffRow, !isLast && styles.staffRowBorder]}>
      <View style={[styles.initCircle, { backgroundColor: color + '33' }]}>
        <Text style={[styles.initText, { color }]}>{getInitials(member.name)}</Text>
      </View>
      <View style={styles.staffInfo}>
        <View style={styles.staffTopRow}>
          <Text style={styles.staffName}>{member.name}</Text>
          <View style={styles.badgeRow}>
            {member.inviteSentAt && member.status === 'unlinked' && <InviteBadge />}
            <StatusBadge status={member.status} />
          </View>
        </View>
        <Text style={styles.staffMeta}>{member.role} · {member.location}</Text>
        {member.email ? (
          <Text style={styles.staffEmail}>{member.email}</Text>
        ) : null}
        <View style={styles.tagRow}>
          {member.status === 'linked' ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>🏦 {payoutMethodLabel(member.payoutMethod)}</Text>
            </View>
          ) : (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Bank not linked</Text>
            </View>
          )}
        </View>
        {showInvite && (
          <Pressable style={styles.inviteBtn} onPress={() => onSendInvite(member)}>
            <Text style={styles.inviteBtnText}>Send Account Invite →</Text>
          </Pressable>
        )}
        {showResend && (
          <Pressable style={styles.resendBtn} onPress={() => onSendInvite(member)}>
            <Text style={styles.resendBtnText}>Resend Invite →</Text>
          </Pressable>
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
  const showResend = !!member.inviteSentAt && member.status === 'unlinked';
  const showInvite = !member.inviteSentAt && member.status === 'unlinked';

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
      {member.email ? (
        <Text style={styles.gridEmail}>{member.email}</Text>
      ) : null}
      <View style={styles.tagRow}>
        {member.status === 'linked' ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>🏦 {payoutMethodLabel(member.payoutMethod)}</Text>
          </View>
        ) : member.inviteSentAt ? (
          <View style={[styles.tag, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
            <Text style={[styles.tagText, { color: AMBER }]}>✉ Invite sent</Text>
          </View>
        ) : (
          <View style={styles.tag}>
            <Text style={styles.tagText}>Bank not linked</Text>
          </View>
        )}
      </View>
      {showInvite && (
        <Pressable style={styles.inviteBtn} onPress={() => onSendInvite(member)}>
          <Text style={styles.inviteBtnText}>Send Invite →</Text>
        </Pressable>
      )}
      {showResend && (
        <Pressable style={styles.resendBtn} onPress={() => onSendInvite(member)}>
          <Text style={styles.resendBtnText}>Resend Invite →</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function StaffScreen() {
  const isDesktop = useIsDesktop();
  const { locationId, locationName } = useLocationId();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);

  // Add staff modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStaff = useCallback(async () => {
    if (!locationId) return;
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, role, email, bank_linked, payout_method, invite_sent_at')
        .eq('location_id', locationId)
        .order('name');

      if (error) console.log('[Staff] fetch error:', error.message);

      setStaff(
        (data ?? []).map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          email: m.email,
          location: locationName,
          status: m.bank_linked ? 'linked' : 'unlinked',
          payoutMethod: m.payout_method,
          inviteSentAt: m.invite_sent_at ?? null,
        }))
      );
    } catch (err) {
      console.log('[Staff] exception:', err);
    } finally {
      setLoading(false);
    }
  }, [locationId, locationName]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useFocusEffect(useCallback(() => { fetchStaff(); }, [fetchStaff]));
  useWebFocus(fetchStaff);

  async function callInviteFunction(
    member: { id: string; name: string; role: string; email: string },
  ): Promise<{ error: Error | null; note: string | null }> {
    const { data, error } = await supabase.functions.invoke('send-staff-invite', {
      body: {
        email: member.email,
        name: member.name,
        role: member.role,
        location_id: locationId,
        staff_member_id: member.id,
      },
    });

    if (error) {
      // FunctionsHttpError.message is just "non-2xx status code" — unwrap the JSON body
      let message = error.message;
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) message = body.error;
      } catch {}
      console.log('[Staff] invite error:', message);
      return { error: new Error(message), note: null };
    }

    const note: string | null = data?.note ?? null;
    console.log('[Staff] invite result — user_id:', data?.user_id ?? 'existing', '| note:', note);
    return { error: null, note };
  }

  async function handleSendInvite(member: StaffMember) {
    if (!member.email) {
      Alert.alert('No email', 'This staff member has no email address on file.');
      return;
    }
    const isResend = !!member.inviteSentAt;
    const actionLabel = isResend ? 'Resend' : 'Send';

    Alert.alert(
      `${actionLabel} Account Invite`,
      `${actionLabel} a Mise account invite to ${member.name} at ${member.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `${actionLabel} Invite`,
          onPress: async () => {
            setSendingInviteId(member.id);
            try {
              const { error: invErr, note } = await callInviteFunction({
                id: member.id,
                name: member.name,
                role: member.role,
                email: member.email!,
              });
              await fetchStaff();
              if (invErr) {
                Alert.alert('Invite failed', invErr.message);
              } else if (note) {
                Alert.alert('Already registered', `${note}\n\nThe Invited badge has been applied.`);
              } else {
                Alert.alert('Invite sent!', `${member.name} will receive an email at ${member.email} to set up their Mise account.`);
              }
            } finally {
              setSendingInviteId(null);
            }
          },
        },
      ]
    );
  }

  function resetModal() {
    setFirstName('');
    setLastName('');
    setSelectedRole(null);
    setEmail('');
    setSaving(false);
    setModalVisible(false);
  }

  async function handleAddStaff() {
    const first = firstName.trim();
    const last  = lastName.trim();
    const mail  = email.trim().toLowerCase();

    if (!first) { Alert.alert('Required', 'Enter a first name.'); return; }
    if (!last)  { Alert.alert('Required', 'Enter a last name.');  return; }
    if (!selectedRole) { Alert.alert('Required', 'Select a role.'); return; }
    if (!mail || !mail.includes('@')) { Alert.alert('Required', 'Enter a valid email address.'); return; }
    if (!locationId) { Alert.alert('Error', 'No location found. Please try again.'); return; }

    setSaving(true);
    try {
      // 1. Insert the staff_members row
      const { data: inserted, error: insertError } = await supabase
        .from('staff_members')
        .insert({
          location_id:   locationId,
          name:          `${first} ${last}`,
          role:          selectedRole,
          email:         mail,
          bank_linked:   false,
          payout_method: 'cash',
        })
        .select('id')
        .single();

      if (insertError) {
        console.log('[Staff] insert error:', insertError.message, insertError.details);
        Alert.alert('Error', insertError.message);
        return;
      }

      console.log('[Staff] inserted staff member:', inserted.id);
      resetModal();
      await fetchStaff();

      // 2. Send the Supabase auth invite email (non-blocking — failure is shown but doesn't undo the insert)
      const { error: inviteErr, note } = await callInviteFunction({
        id: inserted.id,
        name: `${first} ${last}`,
        role: selectedRole,
        email: mail,
      });

      await fetchStaff(); // refresh to show invite badge regardless of outcome

      if (inviteErr) {
        console.log('[Staff] invite email failed (non-fatal):', inviteErr.message);
        Alert.alert(
          'Staff added',
          `${first} ${last} was added, but the invite failed: ${inviteErr.message}\n\nYou can resend from the staff list.`
        );
      } else if (note) {
        // Already registered — no invite email sent but record is saved
        Alert.alert(
          'Staff added',
          `${first} ${last} has been added.\n\n${note}\n\nThey can log in to Mise directly.`
        );
      } else {
        Alert.alert('Invite sent! ✉', `${first} ${last} has been added and will receive an email at ${mail} to create their Mise account.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('[Staff] handleAddStaff exception:', msg);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
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
          <Pressable style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How staff onboarding works</Text>
          <Text style={styles.infoBody}>
            Add staff → they receive an email invite → create their Mise account → link their bank via Flinks → tips route automatically
          </Text>
          <View style={styles.infoSteps}>
            {['Add staff', 'Email invite sent', 'Staff signs up', 'Tips auto-routed'].map((step, i) => (
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
              <StaffGridCard
                key={member.id}
                member={member}
                onSendInvite={handleSendInvite}
              />
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

      {/* Add Staff Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={resetModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={resetModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Staff Member</Text>
            <Text style={styles.modalSubtitle}>They'll receive an email to create their Mise account.</Text>

            {/* Name row */}
            <View style={styles.nameRow}>
              <View style={styles.nameHalf}>
                <Text style={styles.inputLabel}>First name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Alex"
                  placeholderTextColor={MUTED}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.nameHalf}>
                <Text style={styles.inputLabel}>Last name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Dubois"
                  placeholderTextColor={MUTED}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Role selector */}
            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.roleGrid}>
              {ROLES.map(({ value, label, icon }) => {
                const selected = selectedRole === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.roleChip, selected && styles.roleChipSelected]}
                    onPress={() => setSelectedRole(value)}>
                    <Text style={styles.roleIcon}>{icon}</Text>
                    <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Email */}
            <Text style={styles.inputLabel}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="alex@restaurant.com"
              placeholderTextColor={MUTED}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />

            <View style={styles.inviteNote}>
              <Text style={styles.inviteNoteText}>
                ✉ An account invite will be emailed automatically after saving.
              </Text>
            </View>

            {/* Actions */}
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleAddStaff}
              disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Adding…' : 'Add & Send Invite'}</Text>
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={resetModal}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  gridEmail: { fontSize: 11, color: MUTED },

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
  staffEmail: { fontSize: 11, color: MUTED },

  badgeRow: { flexDirection: 'row', gap: 4, alignItems: 'center', flexShrink: 0 },

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

  resendBtn: {
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  resendBtnText: { fontSize: 13, fontWeight: '700', color: AMBER },

  inviteNote: {
    backgroundColor: BLUE_DIM,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  inviteNoteText: { fontSize: 12, color: BLUE, lineHeight: 17 },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#0f1e16',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: WHITE, letterSpacing: -0.4 },
  modalSubtitle: { fontSize: 13, color: MUTED, marginTop: -4 },

  nameRow: { flexDirection: 'row', gap: 12 },
  nameHalf: { flex: 1, gap: 6 },

  inputLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#0d1a14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },

  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0d1a14',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: BORDER,
  },
  roleChipSelected: {
    backgroundColor: BLUE_DIM,
    borderColor: BLUE_BORDER,
  },
  roleIcon: { fontSize: 16 },
  roleLabel: { fontSize: 13, fontWeight: '700', color: MUTED },
  roleLabelSelected: { color: BLUE },

  saveBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 },

  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: MUTED },
});
