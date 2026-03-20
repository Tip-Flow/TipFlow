import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

type Role = 'server' | 'bartender' | 'runner' | 'host' | 'kitchen';

const ROLES: { key: Role; label: string; emoji: string }[] = [
  { key: 'server',    label: 'Server',    emoji: '🍽️' },
  { key: 'kitchen',   label: 'Kitchen',   emoji: '👨‍🍳' },
  { key: 'bartender', label: 'Bartender', emoji: '🍸' },
  { key: 'runner',    label: 'Runner',    emoji: '🏃' },
  { key: 'host',      label: 'Host',      emoji: '🚪' },
];

const DEFAULTS: Record<Role, number> = {
  server:    14,
  kitchen:    6,
  bartender:  3,
  runner:     2,
  host:       1,
};

export default function TipPoolSettings() {
  const [values, setValues] = useState<Record<Role, string>>({
    server:    String(DEFAULTS.server),
    kitchen:   String(DEFAULTS.kitchen),
    bartender: String(DEFAULTS.bartender),
    runner:    String(DEFAULTS.runner),
    host:      String(DEFAULTS.host),
  });

  function handleChange(role: Role, text: string) {
    // Allow only digits and empty string while typing
    if (/^\d{0,3}$/.test(text)) {
      setValues((prev) => ({ ...prev, [role]: text }));
    }
  }

  function numericValue(role: Role): number {
    const n = parseInt(values[role], 10);
    return isNaN(n) ? 0 : n;
  }

  const tipOutTotal = (Object.keys(DEFAULTS) as Role[])
    .filter((r) => r !== 'server')
    .reduce((sum, r) => sum + numericValue(r), 0);

  const serverKeeps = numericValue('server');
  const grandTotal = tipOutTotal + serverKeeps;

  function handleSave() {
    if (grandTotal !== 100) {
      Alert.alert(
        'Invalid total',
        `All roles must sum to 100%. Current total: ${grandTotal}%.`
      );
      return;
    }
    Alert.alert('Settings saved', 'Tip pool percentages have been updated.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Text style={styles.heading}>Tip Pool Settings</Text>
          <Text style={styles.subtitle}>
            Set how tips are distributed across your team. Total must equal 100%
            of the tip out amount.
          </Text>

          {/* Role cards */}
          <View style={styles.section}>
            {ROLES.map((role, index) => (
              <View
                key={role.key}
                style={[
                  styles.roleCard,
                  index < ROLES.length - 1 && styles.roleCardBorder,
                ]}>
                <Text style={styles.roleEmoji}>{role.emoji}</Text>
                <Text style={styles.roleLabel}>{role.label}</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    value={values[role.key]}
                    onChangeText={(t) => handleChange(role.key, t)}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    placeholderTextColor={MUTED}
                  />
                  <Text style={styles.pctSymbol}>%</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total tip out</Text>
              <Text style={styles.summaryValue}>{tipOutTotal}%</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowBorder]}>
              <Text style={styles.summaryLabel}>Server keeps</Text>
              <Text style={[styles.summaryValue, { color: TEAL }]}>
                {serverKeeps}%
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Grand total</Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: grandTotal === 100 ? TEAL : '#ff6b6b' },
                ]}>
                {grandTotal}%
              </Text>
            </View>
          </View>

          {/* Helper note */}
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              💡 Example: If a customer tips 20% and kitchen gets 6%, server
              receives 14%
            </Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              grandTotal !== 100 && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>Save Settings</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
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
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 60,
  },

  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    marginBottom: 20,
  },

  // Role list card
  section: {
    backgroundColor: CARD,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  roleCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  roleEmoji: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  roleLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: WHITE,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1a14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  input: {
    fontSize: 18,
    fontWeight: '700',
    color: TEAL,
    minWidth: 36,
    textAlign: 'right',
    padding: 0,
  },
  pctSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: MUTED,
  },

  // Summary card
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryRowBorder: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: MUTED,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
  },

  // Note
  noteCard: {
    backgroundColor: TEAL_DIM,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.25)',
    marginBottom: 20,
  },
  noteText: {
    fontSize: 13,
    color: TEAL,
    lineHeight: 19,
  },

  // Save button
  saveButton: {
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#09100e',
    letterSpacing: 0.2,
  },
});
