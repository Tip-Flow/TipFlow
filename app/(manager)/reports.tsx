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

type UploadResult = {
  report_id?: string;
  status?: string;
  duplicate?: boolean;
  message?: string;
  business_date?: string;
  page_count?: number;
  line_count?: number;
  lines?: string[];
};

export default function ReportsScreen() {
  const { locationId, locationName, locationLoading } = useLocationId();
  const [businessDate, setBusinessDate] = useState(localDateString());
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showText, setShowText] = useState(false);

  async function pickFile() {
    setError('');
    setResult(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    setPicked(res.assets[0]);
  }

  async function upload() {
    if (!locationId) { setError('Location not loaded.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) { setError('Enter the date as YYYY-MM-DD.'); return; }
    if (!picked) { setError('Choose the PDF first.'); return; }

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
          name: picked.name ?? 'report.pdf',
          type: 'application/pdf',
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

  if (locationLoading) return <ActivityIndicator size="large" style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Daily POS Report</Text>
      <Text style={s.subtitle}>
        Upload tonight's end-of-night report for {locationName ?? 'your restaurant'}.
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

        <Text style={[s.label, { marginTop: 16 }]}>REPORT (PDF)</Text>
        <Pressable style={s.secondaryBtn} onPress={pickFile} disabled={uploading}>
          <Text style={s.secondaryBtnText}>{picked ? 'Choose a different PDF' : 'Choose PDF'}</Text>
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
          ) : (
            <Text style={s.success}>
              Uploaded ✓ {result.page_count} page(s), {result.line_count} lines read.
            </Text>
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
  notice: { color: '#fbbf24', fontSize: 14 },
  rawBox: { backgroundColor: '#0b0f0e', borderRadius: 8, padding: 12, maxHeight: 500 },
  raw: { fontFamily: MONO, fontSize: 12, color: '#d1d5db' },
});