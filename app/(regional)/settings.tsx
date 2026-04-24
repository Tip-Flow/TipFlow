import { useState } from 'react';
import {
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
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';

const PAY_PERIODS = ['Weekly', 'Bi-weekly', 'Semi-monthly'] as const;

export default function RegionalSettings() {
  const [serverPct, setServerPct] = useState('70');
  const [bartenderPct, setBartenderPct] = useState('60');
  const [runnerPct, setRunnerPct] = useState('30');
  const [hostPct, setHostPct] = useState('20');

  const [serverPts, setServerPts] = useState('2.5');
  const [bartenderPts, setBartenderPts] = useState('2.0');
  const [runnerPts, setRunnerPts] = useState('1.25');
  const [hostPts, setHostPts] = useState('1.0');
  const [kitchenPts, setKitchenPts] = useState('1.5');

  const [payPeriod, setPayPeriod] = useState<(typeof PAY_PERIODS)[number]>('Bi-weekly');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const tipOutRules = [
    { label: 'Server', value: serverPct, setter: setServerPct },
    { label: 'Bartender', value: bartenderPct, setter: setBartenderPct },
    { label: 'Runner', value: runnerPct, setter: setRunnerPct },
    { label: 'Host', value: hostPct, setter: setHostPct },
  ];

  const pointsRules = [
    { label: 'Server', value: serverPts, setter: setServerPts },
    { label: 'Bartender', value: bartenderPts, setter: setBartenderPts },
    { label: 'Runner', value: runnerPts, setter: setRunnerPts },
    { label: 'Host', value: hostPts, setter: setHostPts },
    { label: 'Kitchen', value: kitchenPts, setter: setKitchenPts },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Regional Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            These defaults apply to all new locations. Existing locations can request changes.
          </Text>
        </View>

        {/* Default Tip Out Rules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Tip Out Rules</Text>
          <Text style={styles.sectionSub}>Role % of total tip pool</Text>
          <View style={styles.settingsCard}>
            {tipOutRules.map((item, index) => (
              <View
                key={item.label}
                style={[styles.settingRow, index < tipOutRules.length - 1 && styles.rowBorder]}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.settingInput}
                    value={item.value}
                    onChangeText={item.setter}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={styles.inputUnit}>%</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Default Points Per Role */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Points Per Role</Text>
          <Text style={styles.sectionSub}>pts/hr for house pool calculation</Text>
          <View style={styles.settingsCard}>
            {pointsRules.map((item, index) => (
              <View
                key={item.label}
                style={[styles.settingRow, index < pointsRules.length - 1 && styles.rowBorder]}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.settingInput}
                    value={item.value}
                    onChangeText={item.setter}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={styles.inputUnit}>pts/hr</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Pay Period */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pay Period</Text>
          <View style={styles.payPeriodRow}>
            {PAY_PERIODS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.periodChip, payPeriod === option && styles.periodChipActive]}
                onPress={() => setPayPeriod(option)}
                activeOpacity={0.8}>
                <Text style={[styles.periodText, payPeriod === option && styles.periodTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnDone]}
          onPress={handleSave}
          activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Defaults'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 24,
  },
  infoBanner: {
    backgroundColor: AMBER_DIM,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: AMBER,
  },
  infoBannerText: {
    fontSize: 13,
    color: AMBER,
    lineHeight: 19,
    fontWeight: '500',
  },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  sectionSub: { fontSize: 13, color: MUTED, marginTop: -4 },
  settingsCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  settingLabel: { fontSize: 15, fontWeight: '600', color: WHITE },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1f3028',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingInput: {
    fontSize: 15,
    fontWeight: '700',
    color: BLUE,
    minWidth: 40,
    textAlign: 'right',
  },
  inputUnit: { fontSize: 13, color: MUTED, fontWeight: '500' },
  payPeriodRow: { flexDirection: 'row', gap: 10 },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  periodChipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE },
  periodText: { fontSize: 13, fontWeight: '600', color: MUTED },
  periodTextActive: { color: BLUE },
  saveBtn: {
    backgroundColor: BLUE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDone: { backgroundColor: '#22c55e' },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#ffffff', letterSpacing: 0.2 },
});
