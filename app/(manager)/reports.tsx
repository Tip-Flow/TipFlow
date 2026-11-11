import { useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { useLocationId } from '../../hooks/useLocationId';

// Restaurant's local date, never UTC (UTC rolls over at 4–5 PM in Vancouver).
function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.apple.numbers',
  'application/x-iwork-numbers-sffnumbers',
  'text/csv',
  'public.comma-separated-values-text',
  '.pdf', '.xlsx', '.xls', '.numbers', '.csv',
];

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const KIND_LABEL: Record<string, string> = {
  staff: '',
  manager_override: 'Manager override',
  delivery: 'Delivery',
};

type Account = {
  name: string;
  key: string;
  kind: string;
  net_sales_cents: number;
  comps_cents: number;
  tips_cents: number;
  cash_due_cents: number | null;
};

type UploadResult = {
  report_id?: string;
  status?: string;
  duplicate?: boolean;
  message?: string;
  business_date?: string;
  file_type?: string;
  page_count?: number;
  line_count?: number;
  recognised?: boolean;
  totals?: {
    netSalesCents: number | null;
    tipsCents: number | null;
    serviceChargeCents: number | null;
    sumNetSalesCents: number;
    sumTipsCents: number;
  };
  totals_match?: boolean;
  warnings?: string[];
  matched_count?: number;
  accounts?: Account[];
  lines?: string[];
};

export default function ReportsScreen() {
  const { locationId, locationName, locationLoading } = useLocationId();
  const [businessDate, setBusinessDate] = useState(localDateString(-1));
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showText, setShowText] = useState(false);

  async function pickFile() {
    setError('');
    setResult(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    setPicked(res.assets[0]);
  }

  async function upload() {
    if (!locationId) { setError('Location not loaded.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) { setError('Enter the date as YYYY-MM-DD.'); return; }
    if (!picked) { setError('Choose the report file first.'); return; }

    setError('');
    setResult(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('location_id', locationId);
      form.append('business_date', businessDate);
      if (Platform.OS === 'web' && picked.file) {
        form.append('file', picked.file, picked.name);
      } else {
        form.append('file', {
          uri: picked.uri,
          name: picked.name ?? 'report',
          type: picked.mimeType ?? 'application/octet-stream',
        } as unknown as Blob);
      }

      const { data, error: fnErr } = await supabase.functions.invoke('upload-pos-report', { body: form });
      if (fnErr) {
        let msg = 'Upload failed. Please try again.';
        try {
          const ctx = await (fnErr as { context?: Response }).context?.json();
          if (ctx?.error) msg = ctx.error;
        } catch { /* keep default message */ }
        throw new Error(msg);
      }
      setResult(data as UploadResult);
      setPicked(null);
      setShowText(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (locationLoading) {
    return (
      <View style={s.screen}>
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const totals = result?.totals;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      <Text style={s.title}>Daily POS Report</Text>
      <Text style={s.subtitle}>
        Upload the end-of-night Server Cashout report for {locationName ?? 'your restaurant'}. PDF or spreadsheet (Excel, Numbers, CSV).
      </Text>

      <View style={s.card}>
        <Text style={s.label}>BUSINESS DATE</Text>
        <TextInput
          style={s.input}
          value={businessDate}
          onChangeText={setBusinessDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
        />
        <View style={s.row}>
          <Pressable style={s.chip} onPress={() => setBusinessDate(localDateString(-1))}>
            <Text style={s.chipText}>Yesterday</Text>
          </Pressable>
          <Pressable style={s.chip} onPress={() => setBusinessDate(localDateString())}>
            <Text style={s.chipText}>Today</Text>
          </Pressable>
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>REPORT FILE</Text>
        <Pressable style={s.secondaryBtn} onPress={pickFile} disabled={uploading}>
          <Text style={s.secondaryBtnText}>{picked ? 'Choose a different file' : 'Choose file'}</Text>
        </Pressable>
        {picked && <Text style={s.fileName}>📄 {picked.name}</Text>}

        <Pressable
          style={[s.primaryBtn, (!picked || uploading) && s.disabled]}
          onPress={upload}
          disabled={!picked || uploading}
        >
          {uploading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.primaryBtnText}>Upload Report</Text>}
        </Pressable>

        {!!error && <Text style={s.error}>{error}</Text>}
      </View>

      {result && (
        <View style={s.card}>
          {result.duplicate ? (
            <Text style={s.notice}>
              {result.message} (date {result.business_date}, status: {result.status})
            </Text>
          ) : result.recognised ? (
            <>
              <Text style={result.totals_match ? s.success : s.notice}>
                {result.totals_match ? 'Read ✓ — totals match the report' : 'Read, but needs review — totals do not match'}
              </Text>
              {totals && (
                <View style={s.totalsRow}>
                  <View style={s.totalBox}>
                    <Text style={s.totalLabel}>SALES</Text>
                    <Text style={s.totalValue}>{money(totals.netSalesCents ?? totals.sumNetSalesCents)}</Text>
                  </View>
                  <View style={s.totalBox}>
                    <Text style={s.totalLabel}>TIPS</Text>
                    <Text style={s.totalValue}>{money(totals.tipsCents ?? totals.sumTipsCents)}</Text>
                  </View>
                  {!!totals.serviceChargeCents && (
                    <View style={s.totalBox}>
                      <Text style={s.totalLabel}>SERVICE CHARGES</Text>
                      <Text style={s.totalValue}>{money(totals.serviceChargeCents)}</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={s.tableHead}>
                <Text style={[s.th, s.colName]}>ACCOUNT</Text>
                <Text style={[s.th, s.colNum]}>SALES</Text>
                <Text style={[s.th, s.colNum]}>TIPS</Text>
                <Text style={[s.th, s.colNum]}>CASH DUE</Text>
              </View>
              {(result.accounts ?? []).map((a) => (
                <View key={a.key} style={s.tr}>
                  <View style={s.colName}>
                    <Text style={s.td}>{a.name}</Text>
                    {!!KIND_LABEL[a.kind] && <Text style={s.kind}>{KIND_LABEL[a.kind]}</Text>}
                    {a.comps_cents > 0 && <Text style={s.kind}>incl. {money(a.comps_cents)} comps</Text>}
                  </View>
                  <Text style={[s.td, s.colNum]}>{money(a.net_sales_cents)}</Text>
                  <Text style={[s.td, s.colNum]}>{money(a.tips_cents)}</Text>
                  <Text style={[s.td, s.colNum]}>{money(a.cash_due_cents)}</Text>
                </View>
              ))}
              <Text style={s.hint}>
                Cash due: positive means the server owes the house; negative means the house owes the server.
              </Text>
            </>
          ) : (
            <Text style={s.notice}>
              Saved, but Mise couldn't recognise this as a Squirrel Server Cashout report.
            </Text>
          )}

          {!!result.warnings?.length && (
            <View style={{ gap: 4, marginTop: 8 }}>
              {result.warnings.map((w, i) => <Text key={i} style={s.warning}>⚠ {w}</Text>)}
            </View>
          )}

          {!!result.lines?.length && (
            <>
              <Pressable style={s.secondaryBtn} onPress={() => setShowText((v) => !v)}>
                <Text style={s.secondaryBtnText}>{showText ? 'Hide raw text' : 'Show raw text (testing)'}</Text>
              </Pressable>
              {showText && (
                <ScrollView horizontal style={s.rawBox}>
                  <Text style={s.raw} selectable>
                    {result.lines.map((l, i) => `${String(i + 1).padStart(3, ' ')}  ${l}`).join('\n')}
                  </Text>
                </ScrollView>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0f0e' },
  page: { padding: 20, gap: 16, maxWidth: 900 },
  title: { fontSize: 24, fontWeight: '800', color: '#f3f4f6' },
  subtitle: { fontSize: 14, color: '#9ca3af' },
  card: { backgroundColor: '#151b19', borderColor: '#2a3330', borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  label: { fontSize: 12, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.6 },
  input: { borderColor: '#2a3330', borderWidth: 1, borderRadius: 8, padding: 12, color: '#f3f4f6', fontSize: 16 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { borderColor: '#2a3330', borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { color: '#93a8f4', fontWeight: '600' },
  secondaryBtn: { borderColor: '#3b5bdb', borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#93a8f4', fontWeight: '700' },
  fileName: { color: '#e5e7eb', fontSize: 14 },
  primaryBtn: { backgroundColor: '#3b5bdb', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: '#f87171', fontSize: 14 },
  success: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  notice: { color: '#fbbf24', fontSize: 14, fontWeight: '700' },
  warning: { color: '#fbbf24', fontSize: 13 },
  totalsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 4 },
  totalBox: { backgroundColor: '#0b0f0e', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, minWidth: 120 },
  totalLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.6 },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#f3f4f6', fontVariant: ['tabular-nums'] },
  tableHead: { flexDirection: 'row', borderBottomColor: '#2a3330', borderBottomWidth: 1, paddingBottom: 6, marginTop: 8 },
  th: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.6 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomColor: '#1f2724', borderBottomWidth: 1 },
  td: { fontSize: 14, color: '#e5e7eb', fontVariant: ['tabular-nums'] },
  colName: { flex: 2 },
  colNum: { flex: 1, textAlign: 'right' },
  kind: { fontSize: 11, color: '#9ca3af' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  rawBox: { backgroundColor: '#0b0f0e', borderRadius: 8, padding: 12, maxHeight: 500 },
  raw: { fontFamily: MONO, fontSize: 12, color: '#d1d5db' },
});
