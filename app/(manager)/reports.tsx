import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
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

// Alert.alert is skipped by browsers, so on web use the browser's own pop-ups.
function confirmPopup(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress: onYes },
  ]);
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

async function fnErrorMessage(err: unknown, fallback: string): Promise<string> {
  try {
    const ctx = await (err as { context?: Response }).context?.json();
    if (ctx?.error) return ctx.error;
  } catch { /* keep fallback */ }
  return fallback;
}

const KIND_LABEL: Record<string, string> = {
  staff: '',
  manager_override: 'Manager override · not matched',
  delivery: 'Delivery · not matched',
};

type UploadResult = {
  error?: string;
  report_id?: string;
  status?: string;
  duplicate?: boolean;
  message?: string;
  business_date?: string;
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
  lines?: string[];
};

type FileResult = { fileName: string; result: UploadResult };

function statusLabel(r: UploadResult): { text: string; style: 'ok' | 'wait' | 'warn' | 'err' } {
  if (r.error) return { text: r.error, style: 'err' };
  if (r.duplicate) {
    if (r.status === 'confirmed') return { text: 'Already uploaded · confirmed', style: 'ok' };
    if (r.status === 'parsed') return { text: 'Already uploaded · awaiting confirmation', style: 'wait' };
    return { text: `Already uploaded · ${r.status === 'needs_review' ? 'needs review' : r.status}`, style: 'warn' };
  }
  if (r.status === 'confirmed') return { text: 'Confirmed', style: 'ok' };
  if (!r.recognised) return { text: "Not recognised as a Squirrel cashout report", style: 'warn' };
  if (r.status === 'parsed') return { text: 'Read ✓ totals match · awaiting confirmation', style: 'wait' };
  return { text: 'Needs review', style: 'warn' };
}

type ReviewLine = {
  pos_employee_key: string;
  pos_employee_name: string;
  account_kind: string | null;
  staff_member_id: string | null;
  net_sales_cents: number;
  comps_cents: number;
  card_tips_cents: number;
  cash_tips_cents: number;
  cash_due_cents: number | null;
};
type Staff = { id: string; name: string; role: string };
type Review = {
  report: { id: string; business_date: string; status: string; confirmed_at: string | null };
  lines: ReviewLine[];
  staff: Staff[];
};

export default function ReportsScreen() {
  const { locationId, locationName, locationLoading } = useLocationId();
  // Empty = use the date printed on each report (PDFs show it).
  const [businessDate, setBusinessDate] = useState('');
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);

  const [review, setReview] = useState<Review | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const callReview = useCallback(async (body: Record<string, unknown>) => {
    setReviewBusy(true);
    setReviewError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('review-pos-report', { body });
      if (fnErr) throw new Error(await fnErrorMessage(fnErr, 'Could not update the report. Please try again.'));
      const rv = data as Review;
      setReview(rv);
      setResults((prev) => prev.map((fr) =>
        fr.result.report_id === rv.report.id
          ? { ...fr, result: { ...fr.result, status: rv.report.status } }
          : fr));
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : 'Could not update the report.');
    } finally {
      setReviewBusy(false);
    }
  }, []);

  async function pickFile() {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setPicked(res.assets);
  }

  async function uploadOne(asset: DocumentPicker.DocumentPickerAsset): Promise<UploadResult> {
    const form = new FormData();
    form.append('location_id', locationId as string);
    if (businessDate) form.append('business_date', businessDate);
    if (Platform.OS === 'web' && asset.file) {
      form.append('file', asset.file, asset.name);
    } else {
      form.append('file', {
        uri: asset.uri,
        name: asset.name ?? 'report',
        type: asset.mimeType ?? 'application/octet-stream',
      } as unknown as Blob);
    }
    const { data, error: fnErr } = await supabase.functions.invoke('upload-pos-report', { body: form });
    if (fnErr) return { error: await fnErrorMessage(fnErr, 'Upload failed. Please try again.') };
    return data as UploadResult;
  }

  async function upload() {
    if (!locationId) { setError('Location not loaded.'); return; }
    if (businessDate && !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) { setError('Enter the date as YYYY-MM-DD, or leave it blank.'); return; }
    if (picked.length === 0) { setError('Choose the report files first.'); return; }
    if (businessDate && picked.length > 1) {
      setError('A typed date applies to one file. Clear the date to use each report\'s own date, or upload one file at a time.');
      return;
    }

    setError('');
    setReview(null);
    setUploading(true);
    const out: FileResult[] = [];
    try {
      // One at a time, so each night is checked and stored on its own.
      for (let i = 0; i < picked.length; i++) {
        setProgress(`Uploading ${i + 1} of ${picked.length}…`);
        let r: UploadResult;
        try {
          r = await uploadOne(picked[i]);
        } catch (e: unknown) {
          r = { error: e instanceof Error ? e.message : 'Upload failed.' };
        }
        out.push({ fileName: picked[i].name ?? 'report', result: r });
        setResults([...out]);
      }
      out.sort((a, b) => (a.result.business_date ?? '').localeCompare(b.result.business_date ?? ''));
      setResults(out);
      setPicked([]);
      // Open the first night that still needs confirming.
      const first = out.find((fr) => fr.result.report_id && fr.result.status === 'parsed')
        ?? out.find((fr) => fr.result.report_id && fr.result.recognised !== false);
      if (first?.result.report_id) await callReview({ action: 'get', report_id: first.result.report_id });
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  function openReview(reportId: string) {
    setOpenKey(null);
    setSearch('');
    callReview({ action: 'get', report_id: reportId });
  }

  function chooseStaff(key: string, staffId: string | null) {
    if (!review) return;
    setOpenKey(null);
    setSearch('');
    callReview({ action: 'match', report_id: review.report.id, pos_employee_key: key, staff_member_id: staffId });
  }

  function confirmReport() {
    if (!review) return;
    const unmatched = review.lines.filter((l) => (l.account_kind ?? 'staff') === 'staff' && !l.staff_member_id);
    const note = unmatched.length
      ? `${unmatched.length} account(s) are not matched to staff, so their sales and tips won't fill into Calculate: ${unmatched.map((l) => l.pos_employee_name).join(', ')}.`
      : 'Every account is matched.';
    confirmPopup(
      `Confirm report for ${review.report.business_date}?`,
      `${note}\n\nOnce confirmed, these figures fill into Calculate for this date.`,
      () => callReview({ action: 'confirm', report_id: review.report.id }),
    );
  }

  function reopenReport() {
    if (!review) return;
    confirmPopup(
      'Reopen this report?',
      'Calculate will stop using it until it is confirmed again.',
      () => callReview({ action: 'reopen', report_id: review.report.id }),
    );
  }

  if (locationLoading) {
    return (
      <View style={s.screen}>
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const staffById = new Map((review?.staff ?? []).map((st) => [st.id, st]));
  const isConfirmed = review?.report.status === 'confirmed';
  const canConfirm = review?.report.status === 'parsed';
  const staffLines = (review?.lines ?? []).filter((l) => (l.account_kind ?? 'staff') === 'staff');
  const matchedCount = staffLines.filter((l) => l.staff_member_id).length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Daily POS Report</Text>
      <Text style={s.subtitle}>
        Upload the end-of-night Server Cashout report for {locationName ?? 'your restaurant'}. PDF or spreadsheet (Excel, Numbers, CSV).
      </Text>

      <View style={s.card}>
        <Text style={s.label}>REPORT FILES</Text>
        <Text style={s.hint}>Select every night's report since your last upload. Each PDF shows its own date.</Text>
        <Pressable style={s.secondaryBtn} onPress={pickFile} disabled={uploading}>
          <Text style={s.secondaryBtnText}>{picked.length ? 'Choose different files' : 'Choose files'}</Text>
        </Pressable>
        {picked.map((f, i) => <Text key={i} style={s.fileName}>📄 {f.name}</Text>)}

        <Text style={[s.label, { marginTop: 12 }]}>BUSINESS DATE</Text>
        <TextInput
          style={s.input}
          value={businessDate}
          onChangeText={setBusinessDate}
          placeholder="From each report (leave blank)"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
        />
        <View style={s.row}>
          <Pressable style={s.chip} onPress={() => setBusinessDate('')}>
            <Text style={s.chipText}>From report</Text>
          </Pressable>
          <Pressable style={s.chip} onPress={() => setBusinessDate(localDateString(-1))}>
            <Text style={s.chipText}>Yesterday</Text>
          </Pressable>
          <Pressable style={s.chip} onPress={() => setBusinessDate(localDateString())}>
            <Text style={s.chipText}>Today</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>Only needed for a spreadsheet, which doesn't show its date.</Text>

        <Pressable
          style={[s.primaryBtn, (picked.length === 0 || uploading) && s.disabled]}
          onPress={upload}
          disabled={picked.length === 0 || uploading}
        >
          {uploading
            ? <Text style={s.primaryBtnText}>{progress || 'Uploading…'}</Text>
            : <Text style={s.primaryBtnText}>{picked.length > 1 ? `Upload ${picked.length} Reports` : 'Upload Report'}</Text>}
        </Pressable>

        {!!error && <Text style={s.error}>{error}</Text>}
      </View>

      {results.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Uploaded</Text>
          {results.map((fr, i) => {
            const r = fr.result;
            const st = statusLabel(r);
            const t = r.totals;
            const selected = review?.report.id && review.report.id === r.report_id;
            return (
              <View key={i} style={[s.resultRow, selected && s.resultRowSelected]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.td}>{r.business_date ?? fr.fileName}</Text>
                  <Text style={s.kind}>{fr.fileName}</Text>
                  <Text style={st.style === 'ok' ? s.okText : st.style === 'wait' ? s.waitText : st.style === 'warn' ? s.warning : s.error}>
                    {st.text}
                  </Text>
                  {t && (
                    <Text style={s.kind}>
                      Sales {money(t.netSalesCents ?? t.sumNetSalesCents)} · Tips {money(t.tipsCents ?? t.sumTipsCents)}
                      {t.serviceChargeCents ? ` · Service charges ${money(t.serviceChargeCents)}` : ''}
                    </Text>
                  )}
                  {(r.warnings ?? []).map((w, j) => <Text key={j} style={s.warning}>⚠ {w}</Text>)}
                </View>
                {!!r.report_id && (r.recognised !== false) && (
                  <Pressable style={s.chip} onPress={() => openReview(r.report_id as string)} disabled={reviewBusy}>
                    <Text style={s.chipText}>{selected ? 'Reviewing' : 'Review'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {review && (
        <View style={s.card}>
          <View style={s.reviewHead}>
            <Text style={s.sectionTitle}>Review · {review.report.business_date}</Text>
            <Text style={[s.badge, isConfirmed ? s.badgeOk : canConfirm ? s.badgeWait : s.badgeWarn]}>
              {isConfirmed ? 'Confirmed' : canConfirm ? 'Awaiting confirmation' : 'Needs review'}
            </Text>
          </View>
          <Text style={s.hint}>
            Match each account to a staff member. Mise remembers each match for future reports.
            {staffLines.length > 0 ? `  ${matchedCount} of ${staffLines.length} matched.` : ''}
          </Text>

          <View style={s.tableHead}>
            <Text style={[s.th, s.colName]}>ACCOUNT</Text>
            <Text style={[s.th, s.colNum]}>SALES</Text>
            <Text style={[s.th, s.colNum]}>TIPS</Text>
            <Text style={[s.th, s.colNum]}>CASH DUE</Text>
          </View>

          {review.lines
            .slice()
            .sort((a, b) => a.pos_employee_name.localeCompare(b.pos_employee_name))
            .map((l) => {
              const kind = l.account_kind ?? 'staff';
              const matched = l.staff_member_id ? staffById.get(l.staff_member_id) : null;
              const open = openKey === l.pos_employee_key;
              const q = search.trim().toLowerCase();
              const options = review.staff.filter((st) => !q || st.name.toLowerCase().includes(q)).slice(0, 8);
              return (
                <View key={l.pos_employee_key} style={s.tr}>
                  <View style={s.trTop}>
                    <View style={s.colName}>
                      <Text style={s.td}>{l.pos_employee_name}</Text>
                      {!!KIND_LABEL[kind] && <Text style={s.kind}>{KIND_LABEL[kind]}</Text>}
                      {l.comps_cents > 0 && <Text style={s.kind}>incl. {money(l.comps_cents)} comps</Text>}
                      {kind === 'staff' && (
                        <Pressable
                          disabled={isConfirmed || reviewBusy}
                          onPress={() => { setOpenKey(open ? null : l.pos_employee_key); setSearch(''); }}
                        >
                          <Text style={matched ? s.matched : s.unmatched}>
                            {matched ? `→ ${matched.name}` : isConfirmed ? 'Not matched' : 'Match staff…'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={[s.td, s.colNum]}>{money(l.net_sales_cents)}</Text>
                    <Text style={[s.td, s.colNum]}>{money(l.card_tips_cents + l.cash_tips_cents)}</Text>
                    <Text style={[s.td, s.colNum]}>{money(l.cash_due_cents)}</Text>
                  </View>

                  {open && (
                    <View style={s.picker}>
                      <TextInput
                        style={s.input}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search staff"
                        placeholderTextColor="#6b7280"
                        autoFocus
                      />
                      {options.map((st) => (
                        <Pressable key={st.id} style={s.option} onPress={() => chooseStaff(l.pos_employee_key, st.id)}>
                          <Text style={s.optionText}>{st.name}</Text>
                          <Text style={s.kind}>{st.role}</Text>
                        </Pressable>
                      ))}
                      {options.length === 0 && <Text style={s.kind}>No staff match that search.</Text>}
                      <Pressable style={s.option} onPress={() => chooseStaff(l.pos_employee_key, null)}>
                        <Text style={s.unmatched}>Leave unmatched (e.g. a shared terminal)</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

          <Text style={s.hint}>
            Cash due: positive means the server owes the house; negative means the house owes the server.
          </Text>

          {!!reviewError && <Text style={s.error}>{reviewError}</Text>}

          {isConfirmed ? (
            <>
              <Text style={s.success}>Confirmed ✓ — these figures fill into Calculate for {review.report.business_date}.</Text>
              <Pressable style={[s.secondaryBtn, reviewBusy && s.disabled]} onPress={reopenReport} disabled={reviewBusy}>
                <Text style={s.secondaryBtnText}>Reopen to change matches</Text>
              </Pressable>
            </>
          ) : canConfirm ? (
            <Pressable style={[s.primaryBtn, reviewBusy && s.disabled]} onPress={confirmReport} disabled={reviewBusy}>
              {reviewBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Confirm Report</Text>}
            </Pressable>
          ) : (
            <Text style={s.notice}>
              This report can't be confirmed because its totals or date don't match. Upload the correct report for this date.
            </Text>
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
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#f3f4f6' },
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
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 12, fontWeight: '700', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { backgroundColor: '#14532d', color: '#4ade80' },
  badgeWait: { backgroundColor: '#1e2a5a', color: '#93a8f4' },
  badgeWarn: { backgroundColor: '#422006', color: '#fbbf24' },
  tableHead: { flexDirection: 'row', borderBottomColor: '#2a3330', borderBottomWidth: 1, paddingBottom: 6, marginTop: 8 },
  th: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.6 },
  tr: { paddingVertical: 8, borderBottomColor: '#1f2724', borderBottomWidth: 1, gap: 6 },
  trTop: { flexDirection: 'row', alignItems: 'flex-start' },
  td: { fontSize: 14, color: '#e5e7eb', fontVariant: ['tabular-nums'] },
  colName: { flex: 2, gap: 2 },
  colNum: { flex: 1, textAlign: 'right' },
  kind: { fontSize: 11, color: '#9ca3af' },
  matched: { fontSize: 13, color: '#4ade80', fontWeight: '600' },
  unmatched: { fontSize: 13, color: '#93a8f4', fontWeight: '600' },
  picker: { backgroundColor: '#0b0f0e', borderRadius: 8, padding: 8, gap: 4 },
  option: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionText: { color: '#e5e7eb', fontSize: 14 },
  hint: { fontSize: 12, color: '#9ca3af' },
  okText: { fontSize: 13, color: '#4ade80', fontWeight: '700' },
  waitText: { fontSize: 13, color: '#93a8f4', fontWeight: '700' },
  resultRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, borderBottomColor: '#1f2724', borderBottomWidth: 1 },
  resultRowSelected: { backgroundColor: '#1e2a5a' },
  rawBox: { backgroundColor: '#0b0f0e', borderRadius: 8, padding: 12, maxHeight: 500 },
  raw: { fontFamily: MONO, fontSize: 12, color: '#d1d5db' },
});
