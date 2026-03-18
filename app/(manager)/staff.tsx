import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const TEAL_BORDER = 'rgba(0,229,160,0.4)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.4)';
const GREEN = '#22c55e';
const GREEN_DIM = 'rgba(34,197,94,0.15)';
const GREEN_BORDER = 'rgba(34,197,94,0.4)';
const RED = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.15)';
const RED_BORDER = 'rgba(239,68,68,0.4)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type BankStatus = 'linked' | 'pending' | 'unlinked';

interface StaffMember {
  name: string;
  role: string;
  location: string;
  initials: string;
  initialsColor: string;
  status: BankStatus;
  payoutMethod?: string;
  bankName: string;
}

const staff: StaffMember[] = [
  {
    name: 'Alex Dubois',
    role: 'Server',
    location: 'Ossington',
    initials: 'AD',
    initialsColor: '#6366f1',
    status: 'linked',
    payoutMethod: 'AptPay',
    bankName: 'RBC ···4821',
  },
  {
    name: 'Maria Costa',
    role: 'Server',
    location: 'Ossington',
    initials: 'MC',
    initialsColor: '#ec4899',
    status: 'linked',
    payoutMethod: 'AptPay',
    bankName: 'TD ···7743',
  },
  {
    name: 'Jordan Lavoie',
    role: 'Bartender',
    location: 'Ossington',
    initials: 'JL',
    initialsColor: '#f59e0b',
    status: 'pending',
    bankName: 'Invite sent',
  },
  {
    name: 'Taylor Nkosi',
    role: 'Runner',
    location: 'Ossington',
    initials: 'TN',
    initialsColor: '#14b8a6',
    status: 'linked',
    payoutMethod: 'AptPay',
    bankName: 'CIBC ···2290',
  },
  {
    name: 'Sam Tremblay',
    role: 'Host',
    location: 'Ossington',
    initials: 'ST',
    initialsColor: '#f97316',
    status: 'unlinked',
    bankName: 'Not linked',
  },
];

function StatusBadge({ status }: { status: BankStatus }) {
  if (status === 'linked') {
    return (
      <View style={[styles.badge, { backgroundColor: GREEN_DIM, borderColor: GREEN_BORDER }]}>
        <Text style={[styles.badgeText, { color: GREEN }]}>✓ Linked</Text>
      </View>
    );
  }
  if (status === 'pending') {
    return (
      <View style={[styles.badge, { backgroundColor: AMBER_DIM, borderColor: AMBER_BORDER }]}>
        <Text style={[styles.badgeText, { color: AMBER }]}>⏳ Pending</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: RED_DIM, borderColor: RED_BORDER }]}>
      <Text style={[styles.badgeText, { color: RED }]}>✕ Unlinked</Text>
    </View>
  );
}

function StaffCard({ member, isLast }: { member: StaffMember; isLast: boolean }) {
  return (
    <View style={[styles.staffRow, !isLast && styles.staffRowBorder]}>
      <View style={[styles.initCircle, { backgroundColor: member.initialsColor + '33' }]}>
        <Text style={[styles.initText, { color: member.initialsColor }]}>{member.initials}</Text>
      </View>

      <View style={styles.staffInfo}>
        <View style={styles.staffTopRow}>
          <Text style={styles.staffName}>{member.name}</Text>
          <StatusBadge status={member.status} />
        </View>

        <Text style={styles.staffMeta}>
          {member.role} · {member.location}
        </Text>

        <View style={styles.tagRow}>
          {member.payoutMethod && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>🏦 {member.payoutMethod}</Text>
            </View>
          )}
          <View style={styles.tag}>
            <Text style={styles.tagText}>{member.bankName}</Text>
          </View>
        </View>

        {member.status === 'unlinked' && (
          <TouchableOpacity style={styles.inviteBtn} activeOpacity={0.8}>
            <Text style={styles.inviteBtnText}>Send Bank Link Invite →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function StaffScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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

        {/* Staff List */}
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Team Members</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{staff.length}</Text>
            </View>
          </View>
          <View style={styles.listDivider} />
          {staff.map((member, index) => (
            <StaffCard
              key={member.name}
              member={member}
              isLast={index === staff.length - 1}
            />
          ))}
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
    paddingBottom: 40,
    gap: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  addBtn: {
    backgroundColor: TEAL_DIM,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: TEAL,
  },

  // Info Card
  infoCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: TEAL_BORDER,
    padding: 18,
    gap: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -0.2,
  },
  infoBody: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
  },
  infoSteps: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: 10,
    fontWeight: '800',
    color: BG,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEAL,
  },

  // List Card
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
  listTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: TEAL,
  },
  listDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 18,
  },

  // Staff Row
  staffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  staffRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  // Initials
  initCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  initText: {
    fontSize: 15,
    fontWeight: '800',
  },

  // Staff Info
  staffInfo: {
    flex: 1,
    gap: 5,
  },
  staffTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
    flex: 1,
  },
  staffMeta: {
    fontSize: 12,
    color: MUTED,
  },

  // Tags
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
  },

  // Status Badge
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Invite Button
  inviteBtn: {
    backgroundColor: TEAL_DIM,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inviteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },
});
