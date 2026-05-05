import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const ADMIN_EMAILS = ['sukhi.muker@gmail.com'];

const BG     = '#09100e';
const CARD   = '#162019';
const BLUE   = '#4169E1';
const BLUE_DIM   = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const GREEN  = '#22c55e';
const GREEN_DIM  = 'rgba(34,197,94,0.15)';
const GREEN_BORDER = 'rgba(34,197,94,0.4)';
const AMBER  = '#f59e0b';
const AMBER_DIM  = 'rgba(245,158,11,0.15)';
const AMBER_BORDER = 'rgba(245,158,11,0.35)';
const RED    = '#ef4444';
const MUTED  = '#6b7a74';
const WHITE  = '#e8f0ec';
const BORDER = '#1f3028';

type Org = { id: string; name: string; city: string | null; country: string | null };
type Loc = { id: string; name: string; organisation_id: string | null };

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor="#3d4f47"
        autoCapitalize="none"
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

function Picker<T extends { id: string; label: string }>({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  options: T[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = options.find(o => o.id === selectedId);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
        {options.map(opt => (
          <Pressable
            key={opt.id}
            style={[styles.chip, opt.id === selectedId && styles.chipActive]}
            onPress={() => onSelect(opt.id)}>
            <Text style={[styles.chipText, opt.id === selectedId && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
        {options.length === 0 && (
          <Text style={styles.emptyChip}>None yet</Text>
        )}
      </ScrollView>
      {selected && (
        <Text style={styles.selectedLabel}>Selected: {selected.label}</Text>
      )}
    </View>
  );
}

export default function AdminScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);

  // Org form
  const [orgName, setOrgName] = useState('');
  const [orgCity, setOrgCity] = useState('');
  const [orgCountry, setOrgCountry] = useState('Canada');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Location form
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locOrgId, setLocOrgId] = useState('');
  const [creatingLoc, setCreatingLoc] = useState(false);

  // Regional manager invite form
  const [rmName, setRmName] = useState('');
  const [rmEmail, setRmEmail] = useState('');
  const [rmOrgId, setRmOrgId] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? '';
    const admin = ADMIN_EMAILS.includes(email);
    setIsAdmin(admin);
    if (!admin) return;

    const [orgRes, locRes] = await Promise.all([
      supabase.from('organisations').select('id, name, city, country').order('name'),
      supabase.from('locations').select('id, name, organisation_id').order('name'),
    ]);
    setOrgs(orgRes.data ?? []);
    setLocs(locRes.data ?? []);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function handleCreateOrg() {
    if (!orgName.trim()) { Alert.alert('Required', 'Organisation name is required'); return; }
    setCreatingOrg(true);
    try {
      const { error } = await supabase
        .from('organisations')
        .insert({ name: orgName.trim(), city: orgCity.trim() || null, country: orgCountry.trim() || null });
      if (error) throw error;
      setOrgName(''); setOrgCity(''); setOrgCountry('Canada');
      await loadData();
      Alert.alert('Created', 'Organisation created successfully.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleCreateLocation() {
    if (!locName.trim()) { Alert.alert('Required', 'Location name is required'); return; }
    setCreatingLoc(true);
    try {
      const { error } = await supabase
        .from('locations')
        .insert({
          name: locName.trim(),
          city: locAddress.trim() || null,
          organisation_id: locOrgId || null,
          pos_type: 'manual',
          cra_tip_type: 'direct',
        });
      if (error) throw error;
      setLocName(''); setLocAddress(''); setLocOrgId('');
      await loadData();
      Alert.alert('Created', 'Location created successfully.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingLoc(false);
    }
  }

  async function handleInviteRegionalManager() {
    if (!rmName.trim() || !rmEmail.trim()) {
      Alert.alert('Required', 'Name and email are required');
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-staff-invite', {
        body: {
          email: rmEmail.trim().toLowerCase(),
          name: rmName.trim(),
          role: 'regional_manager',
          organisation_id: rmOrgId || null,
        },
      });

      if (error) {
        let message = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }

      if (data?.note) {
        Alert.alert('Already Registered', `${rmEmail.trim()} already has a Mise account. They can log in directly.`);
      } else {
        Alert.alert('Invited', `Invite sent to ${rmEmail.trim()}.`);
      }

      setRmName(''); setRmEmail(''); setRmOrgId('');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  if (isAdmin === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.deniedTitle}>Access Denied</Text>
          <Text style={styles.deniedSub}>This screen is restricted to Mise admins.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const orgOptions = orgs.map(o => ({ id: o.id, label: `${o.name}${o.city ? ` · ${o.city}` : ''}` }));
  const locOptions = locs.map(l => ({ id: l.id, label: l.name }));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.pageHeader}>
            <View style={[styles.adminBadge, { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER }]}>
              <Text style={[styles.adminBadgeText, { color: BLUE }]}>MISE ADMIN</Text>
            </View>
            <Text style={styles.pageTitle}>Onboarding</Text>
            <Text style={styles.pageSubtitle}>Create organisations, locations, and invite regional managers.</Text>
          </View>

          {/* Summary chips */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryChip, { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER }]}>
              <Text style={[styles.summaryCount, { color: BLUE }]}>{orgs.length}</Text>
              <Text style={[styles.summaryLabel, { color: BLUE }]}>Orgs</Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: GREEN_DIM, borderColor: GREEN_BORDER }]}>
              <Text style={[styles.summaryCount, { color: GREEN }]}>{locs.length}</Text>
              <Text style={[styles.summaryLabel, { color: GREEN }]}>Locations</Text>
            </View>
          </View>

          {/* ── Section 1: Create Organisation ── */}
          <View style={styles.card}>
            <SectionHeader
              title="1. Create Organisation"
              subtitle="A restaurant group or single-location brand."
            />
            <Field label="Name" value={orgName} onChange={setOrgName} placeholder="e.g. Canteen Group" />
            <Field label="City" value={orgCity} onChange={setOrgCity} placeholder="e.g. Toronto" />
            <Field label="Country" value={orgCountry} onChange={setOrgCountry} placeholder="Canada" />
            <Pressable
              style={[styles.btn, { backgroundColor: BLUE }, creatingOrg && styles.btnDisabled]}
              onPress={handleCreateOrg}
              disabled={creatingOrg}>
              {creatingOrg ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Create Organisation</Text>
              )}
            </Pressable>

            {orgs.length > 0 && (
              <View style={styles.existingList}>
                <Text style={styles.existingLabel}>EXISTING ({orgs.length})</Text>
                {orgs.map(o => (
                  <View key={o.id} style={styles.existingRow}>
                    <Text style={styles.existingName}>{o.name}</Text>
                    <Text style={styles.existingMeta}>{[o.city, o.country].filter(Boolean).join(', ')}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Section 2: Create Location ── */}
          <View style={styles.card}>
            <SectionHeader
              title="2. Create Location"
              subtitle="A physical restaurant linked to an organisation."
            />
            <Field label="Name" value={locName} onChange={setLocName} placeholder="e.g. Canteen King West" />
            <Field label="Address" value={locAddress} onChange={setLocAddress} placeholder="e.g. 488 King St W, Toronto" />
            <Picker
              label="Organisation (optional)"
              options={orgOptions}
              selectedId={locOrgId}
              onSelect={id => setLocOrgId(prev => prev === id ? '' : id)}
            />
            <Pressable
              style={[styles.btn, { backgroundColor: GREEN }, creatingLoc && styles.btnDisabled]}
              onPress={handleCreateLocation}
              disabled={creatingLoc}>
              {creatingLoc ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Create Location</Text>
              )}
            </Pressable>

            {locs.length > 0 && (
              <View style={styles.existingList}>
                <Text style={styles.existingLabel}>EXISTING ({locs.length})</Text>
                {locs.map(l => (
                  <View key={l.id} style={styles.existingRow}>
                    <Text style={styles.existingName}>{l.name}</Text>
                    <Text style={styles.existingMeta}>
                      {orgs.find(o => o.id === l.organisation_id)?.name ?? 'No org'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Section 3: Invite Regional Manager ── */}
          <View style={styles.card}>
            <SectionHeader
              title="3. Invite Regional Manager"
              subtitle="They'll oversee a full organisation and can invite location managers."
            />
            <Field label="Name" value={rmName} onChange={setRmName} placeholder="e.g. Jamie Chen" />
            <Field
              label="Email"
              value={rmEmail}
              onChange={setRmEmail}
              placeholder="e.g. jamie@canteen.ca"
              keyboardType="email-address"
            />
            <Picker
              label="Organisation (optional)"
              options={orgOptions}
              selectedId={rmOrgId}
              onSelect={id => setRmOrgId(prev => prev === id ? '' : id)}
            />
            <Pressable
              style={[styles.btn, { backgroundColor: AMBER }, inviting && styles.btnDisabled]}
              onPress={handleInviteRegionalManager}
              disabled={inviting}>
              {inviting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Send Invite →</Text>
              )}
            </Pressable>
            <Text style={styles.inviteNote}>
              An invite email will be sent. They'll set their password and be routed to the Regional portal on first login.
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedTitle: { fontSize: 20, fontWeight: '800', color: RED, marginBottom: 8 },
  deniedSub: { fontSize: 14, color: MUTED, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 20, paddingTop: 16 },

  pageHeader: { gap: 8, marginBottom: 4 },
  adminBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: WHITE, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: MUTED, lineHeight: 20 },

  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  summaryCount: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 14,
  },
  sectionHeader: { gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: WHITE },
  sectionSubtitle: { fontSize: 13, color: MUTED, lineHeight: 18 },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#0d1812',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: WHITE,
  },

  pickerRow: { gap: 8, flexDirection: 'row', paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#0d1812',
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE_BORDER },
  chipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: BLUE },
  emptyChip: { fontSize: 13, color: MUTED, fontStyle: 'italic', paddingVertical: 7 },
  selectedLabel: { fontSize: 12, color: MUTED, marginTop: 2 },

  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  inviteNote: { fontSize: 12, color: MUTED, lineHeight: 18, textAlign: 'center' },

  existingList: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    gap: 8,
  },
  existingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  existingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  existingName: { fontSize: 14, fontWeight: '600', color: WHITE },
  existingMeta: { fontSize: 12, color: MUTED },
});
