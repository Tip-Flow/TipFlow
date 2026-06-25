import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseCSV, CSVParseResult, CSVStaffRow } from '@/lib/csvParser';
import { parseOCRText, OCRParseResult } from '@/lib/ocrParser';
import { formatSyncSummary, SyncSummary } from '@/lib/syncInviteGate';
import { supabase } from '../../lib/supabase';
import { useLocationId } from '@/hooks/useLocationId';
import { useWebFocus } from '@/hooks/useWebFocus';

const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65, 105, 225, 0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const RED = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.12)';

const ROLES = ['server', 'bartender', 'runner', 'host', 'kitchen'] as const;

const locations = [
  {
    name: 'Ossington',
    city: 'Toronto, ON',
    posType: 'Square API',
    posStyle: 'teal',
    connected: true,
  },
  {
    name: 'Kensington',
    city: 'Toronto, ON',
    posType: 'CSV Upload',
    posStyle: 'amber',
    connected: false,
  },
];

const posSystems = [
  { name: 'Square', type: 'API' },
  { name: 'Lightspeed', type: 'API' },
  { name: 'TouchBistro', type: 'CSV' },
  { name: "Maitre'D", type: 'CSV' },
  { name: 'Any POS', type: 'CSV' },
];

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

type ReportShift = {
  id: string;
  name: string;
  date: string;
  total_tips: number;
  total_sales: number;
  status: string;
};

type ReportAllocation = {
  id: string;
  staff_name: string;
  hours_worked: number;
  calculated_amount: number;
};

export default function POSScreen() {
  const router = useRouter();

  // Pull Tonight's Report flow
  const { locationId, refetchLocation } = useLocationId();
  const [pullingReport, setPullingReport] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportShift, setReportShift] = useState<ReportShift | null>(null);
  const [reportAllocations, setReportAllocations] = useState<ReportAllocation[]>([]);

  // CSV flow
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<CSVParseResult | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // OCR flow
  const [scanning, setScanning] = useState(false);
  const [scanSheetVisible, setScanSheetVisible] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRParseResult | null>(null);
  const [ocrPreviewVisible, setOcrPreviewVisible] = useState(false);

  // Coming-soon integration modals
  const [comingSoonModal, setComingSoonModal] = useState<null | 'squirrel' | 'adp'>(null);
  // Sync result banner — set by processSyncedStaff() when integrations go live
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  // Push Operations sync
  const [syncingPush, setSyncingPush] = useState(false);
  const [pushSyncBanner, setPushSyncBanner] = useState<string | null>(null);

  // Edit row flow
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<CSVStaffRow | null>(null);
  const [editTipsStr, setEditTipsStr] = useState('');
  const [editSalesStr, setEditSalesStr] = useState('');
  const [editHoursStr, setEditHoursStr] = useState('');

  // Pulse animation for scanning overlay
  const scanAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (scanning) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      scanAnim.setValue(1);
    }
  }, [scanning]);

  // ── Pull Tonight's Report ─────────────────────────────────────────────────

  const handlePullReport = useCallback(async () => {
    console.log("Pull Tonight's Report tapped");
    const today = new Date().toISOString().split('T')[0];
    console.log('[POS] handlePullReport triggered — locationId from hook:', locationId, '| today:', today);
    setPullingReport(true);
    try {
      // Log auth session state before querying
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      console.log('[POS] auth session:', session?.user?.email ?? 'none', '| sessionErr:', sessionErr?.message ?? null);

      // Use hook-cached value; if not ready yet, do one direct fetch
      let locId = locationId;
      if (!locId) {
        console.log('[POS] locationId is null — triggering refetch');
        await refetchLocation();
        const { data: loc, error: locErr } = await supabase
          .from('locations')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        console.log('[POS] direct location fetch — data:', loc, '| error:', locErr?.message ?? null, '| code:', locErr?.code ?? null);
        locId = loc?.id ?? null;
      }

      console.log('[POS] resolved locId:', locId);

      if (!locId) {
        Alert.alert('No Location', 'No location found. Please set up your location first.');
        return;
      }

      console.log('[POS] querying shifts for location:', locId, 'date:', today);

      const { data: shift, error: shiftErr, status: shiftStatus } = await supabase
        .from('shifts')
        .select('id, name, date, total_tips, total_sales, status')
        .eq('location_id', locId)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('[POS] shift query — status:', shiftStatus, '| data:', JSON.stringify(shift), '| error:', shiftErr?.message ?? null, '| code:', shiftErr?.code ?? null);

      if (shiftErr) console.log('[POS] shift fetch error detail:', shiftErr);

      if (!shift) {
        Alert.alert(
          'No Shift Tonight',
          "There's no shift created for today yet. Go to the Calculate tab to create tonight's shift first.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Calculate', onPress: () => router.push('/(manager)/calculate') },
          ]
        );
        return;
      }

      console.log('[POS] found shift:', shift.id, 'status:', shift.status);
      setReportShift(shift);

      const { data: allocs, error: allocErr } = await supabase
        .from('tip_allocations')
        .select('id, calculated_amount, hours_worked, staff_members(name)')
        .eq('shift_id', shift.id)
        .order('calculated_amount', { ascending: false });

      if (allocErr) console.log('[POS] allocations fetch error:', allocErr.message);

      console.log('[POS] allocations response:', JSON.stringify(allocs));

      setReportAllocations(
        (allocs ?? []).map((a) => ({
          id: a.id,
          staff_name: (a.staff_members as unknown as { name: string } | null)?.name ?? 'Unknown',
          hours_worked: Number(a.hours_worked),
          calculated_amount: Number(a.calculated_amount),
        }))
      );

      setReportModalVisible(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('[POS] handlePullReport error:', msg);
      Alert.alert('Error', "Couldn't pull tonight's report. Please try again.");
    } finally {
      setPullingReport(false);
    }
  }, [locationId, refetchLocation, router]);

  // ── Push Operations sync ──────────────────────────────────────────────────

  const handleSyncFromPush = useCallback(async () => {
    setSyncingPush(true);
    setPushSyncBanner(null);
    try {
      // Resolve location and its push_company_id
      let locId = locationId;
      let pushCompanyId: number | null = null;

      if (!locId) {
        await refetchLocation();
      }

      const { data: loc, error: locErr } = await supabase
        .from('locations')
        .select('id, push_company_id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (locErr) throw new Error(`Could not fetch location: ${locErr.message}`);
      locId = loc?.id ?? null;
      pushCompanyId = loc?.push_company_id ?? null;

      console.log('[POS] Push sync — locId:', locId, 'push_company_id:', pushCompanyId);

      if (!locId) {
        Alert.alert('No Location', 'No location found. Set up your location first.');
        return;
      }
      if (!pushCompanyId) {
        Alert.alert('Push Not Configured', 'This location does not have a Push company ID configured. Contact Mise support.');
        return;
      }

      // Step 1: Sync staff roster
      console.log('[POS] calling sync-push-staff');
      const staffRes = await supabase.functions.invoke('sync-push-staff', {
        body: { location_id: locId, push_company_id: pushCompanyId },
      });
      console.log('[POS] sync-push-staff raw — data:', JSON.stringify(staffRes.data), '| error:', staffRes.error?.message ?? null);
      if (staffRes.error) {
        // FunctionsHttpError stores the raw Response in .context; read it to get the actual error from the function.
        let detail = staffRes.error.message;
        try {
          const body = await (staffRes.error as unknown as { context?: Response }).context?.json() as { error?: string } | undefined;
          console.log('[POS] sync-push-staff error body:', JSON.stringify(body));
          if (body?.error) detail = body.error;
        } catch (bodyErr) {
          console.log('[POS] could not read sync-push-staff error body:', bodyErr);
        }
        throw new Error(`Staff sync failed: ${detail}`);
      }
      const staffData = staffRes.data as { invited?: number; updated?: number; alreadyExists?: number } | null;
      console.log('[POS] sync-push-staff result:', JSON.stringify(staffData));

      // Step 2: Sync today's labour hours
      const today = new Date().toISOString().split('T')[0];
      console.log('[POS] calling sync-push-labour for date:', today);
      const labourRes = await supabase.functions.invoke('sync-push-labour', {
        body: { location_id: locId, push_company_id: pushCompanyId, date: today },
      });
      console.log('[POS] sync-push-labour raw — data:', JSON.stringify(labourRes.data), '| error:', labourRes.error?.message ?? null);
      if (labourRes.error) {
        let detail = labourRes.error.message;
        try {
          const body = await (labourRes.error as unknown as { context?: Response }).context?.json() as { error?: string } | undefined;
          console.log('[POS] sync-push-labour error body:', JSON.stringify(body));
          if (body?.error) detail = body.error;
        } catch (bodyErr) {
          console.log('[POS] could not read sync-push-labour error body:', bodyErr);
        }
        throw new Error(`Labour sync failed: ${detail}`);
      }
      const labourData = labourRes.data as { count?: number } | null;
      console.log('[POS] sync-push-labour result:', JSON.stringify(labourData));

      const invited = staffData?.invited ?? 0;
      const updatedStaff = staffData?.updated ?? 0;
      const labourCount = labourData?.count ?? 0;

      const bannerMsg = [
        invited > 0 ? `${invited} new staff invited` : null,
        updatedStaff > 0 ? `${updatedStaff} roles updated` : null,
        labourCount > 0 ? `${labourCount} staff hours loaded for today` : null,
      ].filter(Boolean).join(' · ');

      console.log('[POS] setPushSyncBanner →', bannerMsg || 'Push sync complete — no changes');
      setPushSyncBanner(bannerMsg || 'Push sync complete — no changes');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[POS] handleSyncFromPush error:', msg);
      Alert.alert('Push Sync Failed', msg);
    } finally {
      setSyncingPush(false);
    }
  }, [locationId, refetchLocation]);

  // ── CSV upload ────────────────────────────────────────────────────────────

  async function handleUploadCSV() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'public.comma-separated-values-text', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setLoading(true);
      const content = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseCSV(content);
      setPreview(parsed);
      setPreviewVisible(true);
    } catch (err) {
      console.error('CSV upload error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleUseCSVData() {
    if (!preview) return;
    setPreviewVisible(false);
    router.push({
      pathname: '/(manager)/calculate',
      params: { csvData: JSON.stringify(preview) },
    });
  }

  // ── OCR scan ──────────────────────────────────────────────────────────────

  async function handleScanReport() {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Camera Access Required',
        'Mise needs camera access to photograph your POS reports. Please enable it in Settings.',
        [
          {
            text: 'Open Settings',
            onPress: () => {
              Alert.alert('Go to Settings', 'Settings → Mise → Camera → Allow');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    setScanSheetVisible(true);
  }

  async function handleTakePhoto() {
    setScanSheetVisible(false);
    // Small delay to let the modal fully dismiss before launching camera
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: false,
    });
    if (!result.canceled) {
      await processImage(result.assets[0].uri);
    }
  }

  async function handleChooseLibrary() {
    setScanSheetVisible(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: false,
    });
    if (!result.canceled) {
      await processImage(result.assets[0].uri);
    }
  }

  async function processImage(uri: string) {
    setScanning(true);
    try {
      const ocrData = await TextRecognition.recognize(uri);
      const parsed = parseOCRText(ocrData.text);
      setOcrResult(parsed);
      setOcrPreviewVisible(true);
    } catch (err) {
      console.error('OCR error:', err);
      Alert.alert(
        'Scan Failed',
        'Could not read text from the image. Try a clearer, well-lit photo or use CSV upload instead.'
      );
    } finally {
      setScanning(false);
    }
  }

  function handleUseOCRData() {
    if (!ocrResult) return;
    setOcrPreviewVisible(false);
    router.push({
      pathname: '/(manager)/calculate',
      params: { csvData: JSON.stringify(ocrResult) },
    });
  }

  function handleRescan() {
    setOcrPreviewVisible(false);
    setOcrResult(null);
    setScanSheetVisible(true);
  }

  function isRowLowConfidence(row: CSVStaffRow): boolean {
    return row.hoursWorked === 0 || row.tips === 0;
  }

  // ── Edit row ──────────────────────────────────────────────────────────────

  function openEditModal(idx: number) {
    if (!ocrResult) return;
    const row = ocrResult.rows[idx];
    setEditingRowIdx(idx);
    setEditingRow({ ...row });
    setEditHoursStr(String(row.hoursWorked));
    setEditTipsStr((row.tips / 100).toFixed(2));
    setEditSalesStr((row.sales / 100).toFixed(2));
    setEditModalVisible(true);
  }

  function handleSaveEdit() {
    if (editingRow === null || editingRowIdx === null || !ocrResult) return;
    const finalRow: CSVStaffRow = {
      ...editingRow,
      hoursWorked: Math.max(0, parseFloat(editHoursStr) || 0),
      tips: Math.round((parseFloat(editTipsStr) || 0) * 100),
      sales: Math.round((parseFloat(editSalesStr) || 0) * 100),
    };
    const updatedRows = [...ocrResult.rows];
    updatedRows[editingRowIdx] = finalRow;
    const hasTips = updatedRows.some((r) => r.tips > 0);
    const hasSales = updatedRows.some((r) => r.sales > 0);
    setOcrResult({
      ...ocrResult,
      rows: updatedRows,
      totalTips: hasTips ? updatedRows.reduce((s, r) => s + r.tips, 0) : null,
      totalSales: hasSales ? updatedRows.reduce((s, r) => s + r.sales, 0) : null,
    });
    setEditModalVisible(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>POS Import</Text>
              <Text style={styles.subtitle}>Pull tonight's tip data</Text>
            </View>
            <Pressable
              style={styles.newCalcBtn}
              onPress={() => router.push('/(manager)/calculate')}>
              <Text style={styles.newCalcBtnText}>+ New Calculation</Text>
            </Pressable>
          </View>
        </View>

        {/* Sync summary banner */}
        {syncSummary && (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerText}>{formatSyncSummary(syncSummary)}</Text>
            <Pressable onPress={() => setSyncSummary(null)}>
              <Text style={styles.syncBannerDismiss}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Push sync result banner */}
        {pushSyncBanner && (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerText}>Push · {pushSyncBanner}</Text>
            <Pressable onPress={() => setPushSyncBanner(null)}>
              <Text style={styles.syncBannerDismiss}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Location Cards */}
        <View style={styles.section}>
          {locations.map((loc) => {
            const isTeal = loc.posStyle === 'teal';
            const isCSV = loc.posType === 'CSV Upload';
            return (
              <View key={loc.name} style={styles.locationCard}>
                {/* Location name + city */}
                <View style={styles.locHeader}>
                  <View style={styles.locInfo}>
                    <Text style={styles.locName}>{loc.name}</Text>
                    <Text style={styles.locCity}>{loc.city}</Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    loc.connected ? styles.statusConnected : styles.statusDisconnected,
                  ]}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: loc.connected ? BLUE : '#ef4444' },
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: loc.connected ? BLUE : '#ef4444' },
                    ]}>
                      {loc.connected ? 'Connected' : 'Not Connected'}
                    </Text>
                  </View>
                </View>

                {/* POS type badge */}
                <View style={[
                  styles.posBadge,
                  isTeal ? styles.posBadgeTeal : styles.posBadgeAmber,
                ]}>
                  <Text style={[
                    styles.posBadgeText,
                    { color: isTeal ? BLUE : AMBER },
                  ]}>
                    {loc.posType}
                  </Text>
                </View>

                {/* Primary action button */}
                <Pressable
                  style={[
                    styles.actionBtn,
                    isTeal ? styles.actionBtnTeal : styles.actionBtnAmber,
                    ((loading && isCSV) || (pullingReport && !isCSV)) && styles.actionBtnDisabled,
                  ]}
                  disabled={(loading && isCSV) || (pullingReport && !isCSV)}
                  onPress={isCSV ? handleUploadCSV : handlePullReport}>
                  {(loading && isCSV) || (pullingReport && !isCSV) ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.actionBtnText}>
                      {loc.connected ? "Pull Tonight's Report" : 'Upload CSV'}
                    </Text>
                  )}
                </Pressable>

                {/* Scan Report button */}
                <Pressable
                  style={[
                    styles.scanBtn,
                    isTeal ? styles.scanBtnTeal : styles.scanBtnAmber,
                  ]}
                  onPress={handleScanReport}>
                  <Text style={[
                    styles.scanBtnText,
                    { color: isTeal ? BLUE : AMBER },
                  ]}>
                    📷  Scan Report
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Shift Goals CTA */}
        <Pressable
          style={styles.shiftGoalsBtn}
          onPress={() => router.push('/(manager)/shiftgoals')}>
          <Text style={styles.shiftGoalsBtnText}>🎯  Set tonight's shift goals →</Text>
        </Pressable>

        {/* Coming-Soon Integrations */}
        <View style={styles.integrationsCard}>
          <Text style={styles.integrationsTitle}>More Integrations</Text>
          <View style={styles.divider} />

          {/* Squirrel */}
          <Pressable
            style={styles.integrationRow}
            onPress={() => setComingSoonModal('squirrel')}>
            <View style={styles.integrationRowLeft}>
              <View style={styles.integrationIcon}>
                <Text style={styles.integrationIconText}>🖥️</Text>
              </View>
              <Text style={styles.integrationRowName}>Sync from Squirrel</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
            </View>
          </Pressable>

          <View style={styles.rowDivider} />

          {/* Push Operations */}
          <Pressable
            style={[styles.integrationRow, syncingPush && { opacity: 0.6 }]}
            onPress={handleSyncFromPush}
            disabled={syncingPush}>
            <View style={styles.integrationRowLeft}>
              <View style={styles.integrationIcon}>
                <Text style={styles.integrationIconText}>🕐</Text>
              </View>
              <View>
                <Text style={styles.integrationRowName}>Sync from Push</Text>
                <Text style={styles.integrationRowSub}>Staff & hours</Text>
              </View>
            </View>
            {syncingPush ? (
              <ActivityIndicator color={BLUE} size="small" />
            ) : (
              <View style={styles.syncNowBadge}>
                <Text style={styles.syncNowBadgeText}>Sync Now</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.rowDivider} />

          {/* ADP */}
          <Pressable
            style={styles.integrationRow}
            onPress={() => setComingSoonModal('adp')}>
            <View style={styles.integrationRowLeft}>
              <View style={styles.integrationIcon}>
                <Text style={styles.integrationIconText}>👥</Text>
              </View>
              <Text style={styles.integrationRowName}>Sync from ADP</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
            </View>
          </Pressable>
        </View>

        {/* Supported POS Systems */}
        <View style={styles.supportedCard}>
          <Text style={styles.supportedTitle}>Supported POS Systems</Text>
          <View style={styles.divider} />
          {posSystems.map((pos, index) => (
            <View
              key={pos.name}
              style={[
                styles.posRow,
                index < posSystems.length - 1 && styles.posRowBorder,
              ]}>
              <Text style={styles.posName}>{pos.name}</Text>
              <View style={[
                styles.integrationBadge,
                pos.type === 'API' ? styles.integrationAPI : styles.integrationCSV,
              ]}>
                <Text style={[
                  styles.integrationText,
                  { color: pos.type === 'API' ? BLUE : AMBER },
                ]}>
                  {pos.type}
                </Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── Scan action sheet ──────────────────────────────────────────────── */}
      <Modal
        visible={scanSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScanSheetVisible(false)}>
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setScanSheetVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Import POS Report</Text>
            <Text style={styles.sheetSubtitle}>
              Point your camera at a printed report, or choose a screenshot.
            </Text>

            <Pressable
              style={styles.sheetOption}
              onPress={handleTakePhoto}>
              <Text style={styles.sheetOptionIcon}>📷</Text>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionTitle}>Take Photo</Text>
                <Text style={styles.sheetOptionSub}>Photograph a printed report</Text>
              </View>
            </Pressable>

            <View style={styles.sheetDivider} />

            <Pressable
              style={styles.sheetOption}
              onPress={handleChooseLibrary}>
              <Text style={styles.sheetOptionIcon}>🖼️</Text>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionTitle}>Choose from Library</Text>
                <Text style={styles.sheetOptionSub}>Select a screenshot of a report</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.sheetCancel}
              onPress={() => setScanSheetVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Scanning overlay ───────────────────────────────────────────────── */}
      <Modal visible={scanning} transparent animationType="fade">
        <View style={styles.scanningOverlay}>
          <Animated.Text style={[styles.scanningIcon, { opacity: scanAnim }]}>
            📷
          </Animated.Text>
          <Text style={styles.scanningTitle}>Scanning report…</Text>
          <Text style={styles.scanningSubtitle}>Reading text from your photo</Text>
          <ActivityIndicator color={BLUE} size="large" style={{ marginTop: 24 }} />
        </View>
      </Modal>

      {/* ── CSV Preview Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={previewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}>

            {preview !== null && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>CSV Preview</Text>
                    <Text style={styles.modalSubtitle}>
                      {preview.rows.length} staff member{preview.rows.length !== 1 ? 's' : ''} detected
                    </Text>
                  </View>
                  <Pressable
                    style={styles.closeBtn}
                    onPress={() => setPreviewVisible(false)}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                {preview.errors.length > 0 && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Parsing Issues</Text>
                    {preview.errors.map((err, i) => (
                      <Text key={i} style={styles.errorText}>• {err}</Text>
                    ))}
                  </View>
                )}

                <View style={styles.totalsCard}>
                  <View style={styles.totalItem}>
                    <Text style={styles.totalItemLabel}>Total Tips</Text>
                    <Text style={styles.totalItemValue}>
                      {preview.totalTips !== null ? `$${centsToDisplay(preview.totalTips)}` : 'Not in CSV'}
                    </Text>
                  </View>
                  <View style={[styles.totalItem, styles.totalItemBorder]}>
                    <Text style={styles.totalItemLabel}>Total Sales</Text>
                    <Text style={styles.totalItemValue}>
                      {preview.totalSales !== null ? `$${centsToDisplay(preview.totalSales)}` : 'Not in CSV'}
                    </Text>
                  </View>
                </View>

                {preview.rows.length > 0 && (
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
                      <Text style={[styles.tableHeaderCell, styles.colRole]}>Role</Text>
                      <Text style={[styles.tableHeaderCell, styles.colHours]}>Hours</Text>
                      <Text style={[styles.tableHeaderCell, styles.colTips]}>Tips</Text>
                    </View>
                    <View style={styles.tableDivider} />
                    {preview.rows.map((row, index) => (
                      <View key={index}>
                        {index > 0 && <View style={styles.tableRowDivider} />}
                        <View style={styles.tableRow}>
                          <Text style={[styles.tableCellName, styles.colName]} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={[styles.tableCellMuted, styles.colRole]} numberOfLines={1}>
                            {row.role}
                          </Text>
                          <Text style={[styles.tableCellMuted, styles.colHours]}>
                            {row.hoursWorked}h
                          </Text>
                          <Text style={[styles.tableCellTeal, styles.colTips]}>
                            {row.tips > 0 ? `$${centsToDisplay(row.tips)}` : '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.hint}>
                  Looks wrong? Fix in Numbers or Excel and re-upload.
                </Text>

                {preview.rows.length > 0 && (
                  <Pressable
                    style={styles.useDataBtn}
                    onPress={handleUseCSVData}>
                    <Text style={styles.useDataBtnText}>Use This Data</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── OCR Preview Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={ocrPreviewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOcrPreviewVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}>

            {ocrResult !== null && (
              <>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.modalTitle}>Review Scanned Data</Text>
                    <Text style={styles.modalSubtitle}>
                      {ocrResult.rows.length} item{ocrResult.rows.length !== 1 ? 's' : ''} detected
                    </Text>
                    {/* Confidence badge */}
                    <View style={[
                      styles.confidenceBadge,
                      ocrResult.confidence >= 70 ? styles.confidenceHigh : styles.confidenceLow,
                    ]}>
                      <Text style={[
                        styles.confidenceText,
                        { color: ocrResult.confidence >= 70 ? BLUE : AMBER },
                      ]}>
                        {ocrResult.confidence}% confident
                      </Text>
                      {ocrResult.confidence < 70 && (
                        <Text style={styles.confidenceWarning}>  Review carefully</Text>
                      )}
                    </View>
                  </View>
                  <Pressable
                    style={styles.closeBtn}
                    onPress={() => setOcrPreviewVisible(false)}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                {/* Parsing errors */}
                {ocrResult.errors.length > 0 && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Parsing Issues</Text>
                    {ocrResult.errors.map((err, i) => (
                      <Text key={i} style={styles.errorText}>• {err}</Text>
                    ))}
                  </View>
                )}

                {/* Totals */}
                <View style={styles.totalsCard}>
                  <View style={styles.totalItem}>
                    <Text style={styles.totalItemLabel}>Total Tips</Text>
                    <Text style={styles.totalItemValue}>
                      {ocrResult.totalTips !== null
                        ? `$${centsToDisplay(ocrResult.totalTips)}`
                        : 'Not found'}
                    </Text>
                  </View>
                  <View style={[styles.totalItem, styles.totalItemBorder]}>
                    <Text style={styles.totalItemLabel}>Total Sales</Text>
                    <Text style={styles.totalItemValue}>
                      {ocrResult.totalSales !== null
                        ? `$${centsToDisplay(ocrResult.totalSales)}`
                        : 'Not found'}
                    </Text>
                  </View>
                </View>

                {/* Editable staff table */}
                {ocrResult.rows.length > 0 && (
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
                      <Text style={[styles.tableHeaderCell, styles.colRole]}>Role</Text>
                      <Text style={[styles.tableHeaderCell, styles.colHours]}>Hours</Text>
                      <Text style={[styles.tableHeaderCell, styles.colTips]}>Tips</Text>
                      <Text style={[styles.tableHeaderCell, styles.colEdit]}> </Text>
                    </View>
                    <View style={styles.tableDivider} />
                    {ocrResult.rows.map((row, index) => {
                      const lowConf = isRowLowConfidence(row);
                      return (
                        <View key={index}>
                          {index > 0 && <View style={styles.tableRowDivider} />}
                          <Pressable
                            style={[styles.tableRow, lowConf && styles.tableRowAmber]}
                            onPress={() => openEditModal(index)}>
                            <Text style={[styles.tableCellName, styles.colName]} numberOfLines={1}>
                              {row.name}
                            </Text>
                            <Text style={[styles.tableCellMuted, styles.colRole]} numberOfLines={1}>
                              {row.role}
                            </Text>
                            <Text style={[
                              styles.tableCellMuted,
                              styles.colHours,
                              row.hoursWorked === 0 && styles.tableCellAmber,
                            ]}>
                              {row.hoursWorked > 0 ? `${row.hoursWorked}h` : '?'}
                            </Text>
                            <Text style={[
                              styles.tableCellTeal,
                              styles.colTips,
                              row.tips === 0 && styles.tableCellAmber,
                            ]}>
                              {row.tips > 0 ? `$${centsToDisplay(row.tips)}` : '?'}
                            </Text>
                            <Text style={[styles.editIconCell, styles.colEdit]}>✏️</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}

                {ocrResult.rows.some(isRowLowConfidence) && (
                  <Text style={styles.hintAmber}>
                    ⚠️  Amber rows have missing values — tap to edit before importing.
                  </Text>
                )}

                <View style={styles.ocrActionRow}>
                  <Pressable
                    style={styles.rescanBtn}
                    onPress={handleRescan}>
                    <Text style={styles.rescanBtnText}>Rescan</Text>
                  </Pressable>
                  {ocrResult.rows.length > 0 && (
                    <Pressable
                      style={styles.confirmBtn}
                      onPress={handleUseOCRData}>
                      <Text style={styles.confirmBtnText}>Confirm & Import</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Tonight's Report Modal ────────────────────────────────────────── */}
      <Modal
        visible={reportModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReportModalVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}>

            {reportShift && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.modalTitle}>Tonight's Report</Text>
                    <Text style={styles.modalSubtitle}>{reportShift.name}</Text>
                    <View style={[
                      styles.shiftStatusBadge,
                      reportShift.status === 'paid' ? styles.shiftStatusPaid
                        : reportShift.status === 'calculated' ? styles.shiftStatusCalc
                        : styles.shiftStatusPending,
                    ]}>
                      <Text style={[
                        styles.shiftStatusText,
                        { color: reportShift.status === 'paid' ? '#22c55e'
                            : reportShift.status === 'calculated' ? BLUE
                            : AMBER },
                      ]}>
                        {reportShift.status === 'paid' ? '✓ Paid out'
                          : reportShift.status === 'calculated' ? 'Calculated'
                          : 'Pending'}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.closeBtn}
                    onPress={() => setReportModalVisible(false)}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                {/* Totals */}
                <View style={styles.totalsCard}>
                  <View style={styles.totalItem}>
                    <Text style={styles.totalItemLabel}>Total Tips</Text>
                    <Text style={styles.totalItemValue}>
                      {reportShift.total_tips > 0 ? `$${centsToDisplay(reportShift.total_tips)}` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.totalItem, styles.totalItemBorder]}>
                    <Text style={styles.totalItemLabel}>Total Sales</Text>
                    <Text style={styles.totalItemValue}>
                      {reportShift.total_sales > 0 ? `$${centsToDisplay(reportShift.total_sales)}` : '—'}
                    </Text>
                  </View>
                </View>

                {/* Allocations table */}
                {reportAllocations.length > 0 ? (
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCell, styles.colName]}>Staff</Text>
                      <Text style={[styles.tableHeaderCell, styles.colHours]}>Hours</Text>
                      <Text style={[styles.tableHeaderCell, styles.colTips]}>Amount</Text>
                    </View>
                    <View style={styles.tableDivider} />
                    {reportAllocations.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <View style={styles.tableRowDivider} />}
                        <View style={styles.tableRow}>
                          <Text style={[styles.tableCellName, styles.colName]} numberOfLines={1}>
                            {a.staff_name}
                          </Text>
                          <Text style={[styles.tableCellMuted, styles.colHours]}>
                            {a.hours_worked > 0 ? `${a.hours_worked}h` : '—'}
                          </Text>
                          <Text style={[styles.tableCellTeal, styles.colTips]}>
                            {a.calculated_amount > 0 ? `$${centsToDisplay(a.calculated_amount)}` : '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.reportEmptyCard}>
                    <Text style={styles.reportEmptyIcon}>📊</Text>
                    <Text style={styles.reportEmptyTitle}>No allocations yet</Text>
                    <Text style={styles.reportEmptyBody}>
                      Tip allocations haven't been calculated for this shift yet. Go to the Calculate tab to run the calculation.
                    </Text>
                  </View>
                )}

                <Pressable
                  style={styles.useDataBtn}
                  onPress={() => {
                    setReportModalVisible(false);
                    router.push('/(manager)/calculate');
                  }}>
                  <Text style={styles.useDataBtnText}>
                    {reportShift.status === 'pending' ? 'Go to Calculate →' : 'View in Calculate →'}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Row Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.editOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.editSheet}>
            <View style={styles.editSheetHeader}>
              <Text style={styles.editSheetTitle}>Edit Row</Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setEditModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Name */}
            <Text style={styles.editLabel}>Name</Text>
            <TextInput
              style={styles.editInput}
              value={editingRow?.name ?? ''}
              onChangeText={(v) => setEditingRow((r) => r ? { ...r, name: v } : r)}
              placeholderTextColor={MUTED}
              autoCapitalize="words"
            />

            {/* Role chips */}
            <Text style={styles.editLabel}>Role</Text>
            <View style={styles.roleChips}>
              {ROLES.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.roleChip,
                    editingRow?.role === r && styles.roleChipActive,
                  ]}
                  onPress={() => setEditingRow((row) => row ? { ...row, role: r } : row)}>
                  <Text style={[
                    styles.roleChipText,
                    editingRow?.role === r && styles.roleChipTextActive,
                  ]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Hours / Tips / Sales in a row */}
            <View style={styles.editNumericRow}>
              <View style={styles.editNumericField}>
                <Text style={styles.editLabel}>Hours</Text>
                <TextInput
                  style={styles.editInput}
                  value={editHoursStr}
                  onChangeText={setEditHoursStr}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={MUTED}
                />
              </View>
              <View style={styles.editNumericField}>
                <Text style={styles.editLabel}>Tips ($)</Text>
                <TextInput
                  style={styles.editInput}
                  value={editTipsStr}
                  onChangeText={setEditTipsStr}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={MUTED}
                />
              </View>
              <View style={styles.editNumericField}>
                <Text style={styles.editLabel}>Sales ($)</Text>
                <TextInput
                  style={styles.editInput}
                  value={editSalesStr}
                  onChangeText={setEditSalesStr}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={MUTED}
                />
              </View>
            </View>

            <Pressable
              style={styles.editSaveBtn}
              onPress={handleSaveEdit}>
              <Text style={styles.editSaveBtnText}>Save Changes</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Coming-Soon Integration Modals ─────────────────────────────────── */}
      {([
        {
          key: 'squirrel' as const,
          title: 'Squirrel POS — Coming Soon',
          intro: 'When connected, Mise will automatically:',
          bullets: [
            "Pull tonight's sales for every server directly from your POS",
            'Sync your full staff list — no manual entry needed',
            'New staff members receive an automatic invite — existing Mise users are never re-invited',
            'Pre-fill the Calculate tab with real sales data every shift',
          ],
          closing: 'One tap. Everything done.',
        },
        {
          key: 'adp' as const,
          title: 'ADP Payroll — Coming Soon',
          intro: 'When connected, Mise will automatically:',
          bullets: [
            'Sync staff positions, wage rates, and payroll data',
            'Onboard new employees the moment they\'re added in ADP — invite sent, account created',
            'Feed labour cost data into your management reports',
            'Keep payroll and tip data in one place',
          ],
          closing: 'Your team is always up to date.',
        },
      ] as const).map(({ key, title, intro, bullets, closing }) => (
        <Modal
          key={key}
          visible={comingSoonModal === key}
          transparent
          animationType="fade"
          onRequestClose={() => setComingSoonModal(null)}>
          <Pressable
            style={styles.sheetOverlay}
            onPress={() => setComingSoonModal(null)}>
            <View style={styles.comingSoonSheet}>
              <Text style={styles.comingSoonSheetTitle}>{title}</Text>
              <Text style={styles.comingSoonSheetIntro}>{intro}</Text>
              <View style={styles.comingSoonBullets}>
                {bullets.map((b, i) => (
                  <View key={i} style={styles.comingSoonBulletRow}>
                    <Text style={styles.comingSoonBulletDot}>•</Text>
                    <Text style={styles.comingSoonBulletText}>{b}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.comingSoonClosing}>{closing}</Text>
              <Pressable
                style={styles.comingSoonGotIt}
                onPress={() => setComingSoonModal(null)}>
                <Text style={styles.comingSoonGotItText}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ))}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 24 },

  // Header
  header: { gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  newCalcBtn: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  newCalcBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff', letterSpacing: 0.1 },
  title: { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: MUTED },

  section: { gap: 14 },

  // Location Card
  locationCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  locHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  locInfo: { gap: 2 },
  locName: { fontSize: 18, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  locCity: { fontSize: 13, color: MUTED },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusConnected: { backgroundColor: BLUE_DIM },
  statusDisconnected: { backgroundColor: 'rgba(239,68,68,0.12)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },

  posBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  posBadgeTeal: { backgroundColor: BLUE_DIM },
  posBadgeAmber: { backgroundColor: AMBER_DIM },
  posBadgeText: { fontSize: 13, fontWeight: '700' },

  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnTeal: { backgroundColor: BLUE },
  actionBtnAmber: { backgroundColor: AMBER },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', letterSpacing: 0.1 },

  // Scan Report button (outline style)
  scanBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  scanBtnTeal: { borderColor: BLUE, backgroundColor: BLUE_DIM },
  scanBtnAmber: { borderColor: AMBER, backgroundColor: AMBER_DIM },
  scanBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },

  // Shift Goals button
  shiftGoalsBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shiftGoalsBtnText: { fontSize: 15, fontWeight: '700', color: BLUE, letterSpacing: 0.2 },

  // Coming-soon integrations card
  integrationsCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  integrationsTitle: { fontSize: 16, fontWeight: '700', color: WHITE, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 },
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  integrationRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  integrationIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  integrationIconText: { fontSize: 18 },
  integrationRowName: { fontSize: 15, fontWeight: '600', color: WHITE },
  integrationRowSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 18 },
  syncNowBadge: {
    backgroundColor: BLUE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncNowBadgeText: { fontSize: 12, fontWeight: '700', color: '#ffffff', letterSpacing: 0.2 },
  comingSoonBadge: {
    backgroundColor: 'rgba(65,105,225,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(65,105,225,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  comingSoonBadgeText: { fontSize: 11, fontWeight: '700', color: BLUE, letterSpacing: 0.3 },

  // Coming-soon modal sheet
  comingSoonSheet: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(65,105,225,0.45)',
    padding: 28,
    marginHorizontal: 20,
    gap: 14,
    alignItems: 'stretch',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  comingSoonSheetTitle: { fontSize: 18, fontWeight: '800', color: WHITE, textAlign: 'center', letterSpacing: -0.3, marginBottom: 2 },
  comingSoonSheetIntro: { fontSize: 14, color: MUTED, lineHeight: 20 },
  comingSoonBullets: { gap: 10 },
  comingSoonBulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  comingSoonBulletDot: { fontSize: 15, color: BLUE, lineHeight: 22, flexShrink: 0 },
  comingSoonBulletText: { fontSize: 14, color: WHITE, lineHeight: 22, flex: 1 },
  comingSoonClosing: { fontSize: 14, fontWeight: '700', color: BLUE, marginTop: 2 },
  comingSoonGotIt: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  comingSoonGotItText: { fontSize: 15, fontWeight: '700', color: '#ffffff', letterSpacing: 0.1 },

  // Sync summary banner
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(65,105,225,0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  syncBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: WHITE, lineHeight: 20 },
  syncBannerDismiss: { fontSize: 14, color: MUTED, fontWeight: '700', paddingLeft: 8 },

  // Supported POS card
  supportedCard: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  supportedTitle: { fontSize: 16, fontWeight: '700', color: WHITE, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 18, marginBottom: 4 },
  posRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  posRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  posName: { fontSize: 15, fontWeight: '600', color: WHITE },
  integrationBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  integrationAPI: { backgroundColor: BLUE_DIM },
  integrationCSV: { backgroundColor: AMBER_DIM },
  integrationText: { fontSize: 12, fontWeight: '700' },

  // ── Scan action sheet ────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: WHITE, letterSpacing: -0.3, marginBottom: 2 },
  sheetSubtitle: { fontSize: 13, color: MUTED, marginBottom: 16, lineHeight: 18 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  sheetOptionIcon: { fontSize: 28 },
  sheetOptionText: { flex: 1, gap: 2 },
  sheetOptionTitle: { fontSize: 16, fontWeight: '700', color: WHITE },
  sheetOptionSub: { fontSize: 13, color: MUTED },
  sheetDivider: { height: 1, backgroundColor: BORDER },
  sheetCancel: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: BORDER,
  },
  sheetCancelText: { fontSize: 15, fontWeight: '600', color: MUTED },

  // ── Scanning overlay ─────────────────────────────────────────────────────
  scanningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9,16,14,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanningIcon: { fontSize: 64, marginBottom: 8 },
  scanningTitle: { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  scanningSubtitle: { fontSize: 15, color: MUTED },

  // ── Modal base ───────────────────────────────────────────────────────────
  modalSafe: { flex: 1, backgroundColor: BG },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  modalTitle: { fontSize: 24, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 14, color: MUTED, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: MUTED, fontWeight: '700' },

  // Confidence badge
  confidenceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  confidenceHigh: { backgroundColor: BLUE_DIM },
  confidenceLow: { backgroundColor: AMBER_DIM },
  confidenceText: { fontSize: 12, fontWeight: '700' },
  confidenceWarning: { fontSize: 12, color: AMBER, fontWeight: '600' },

  // Error card
  errorCard: {
    backgroundColor: RED_DIM, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    padding: 16, gap: 6,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: RED, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  errorText: { fontSize: 13, color: RED, lineHeight: 18 },

  // Totals card
  totalsCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  totalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  totalItemBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  totalItemLabel: { fontSize: 15, fontWeight: '600', color: WHITE },
  totalItemValue: { fontSize: 17, fontWeight: '800', color: BLUE },

  // Table
  tableCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#0e1a14' },
  tableHeaderCell: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  tableDivider: { height: 1, backgroundColor: BORDER },
  tableRowDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 14 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center' },
  tableCellName: { fontSize: 14, fontWeight: '700', color: WHITE },
  tableCellMuted: { fontSize: 13, color: MUTED, fontWeight: '500' },
  tableCellTeal: { fontSize: 13, fontWeight: '700', color: BLUE },
  editIconCell: { fontSize: 13, textAlign: 'center' },

  // Column widths
  colName: { flex: 2 },
  colRole: { flex: 1.5 },
  colHours: { flex: 1, textAlign: 'center' },
  colTips: { flex: 1, textAlign: 'right' },
  colEdit: { width: 28, textAlign: 'center' },

  hint: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  hintAmber: { fontSize: 13, color: AMBER, textAlign: 'center', lineHeight: 18 },
  useDataBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  useDataBtnText: { fontSize: 17, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },
  tableRowAmber: { backgroundColor: 'rgba(245,158,11,0.07)' },
  tableCellAmber: { color: AMBER, fontWeight: '700' },
  ocrActionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rescanBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  rescanBtnText: { fontSize: 16, fontWeight: '700', color: MUTED, letterSpacing: 0.1 },
  confirmBtn: { flex: 2, backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.1 },

  // ── Edit row modal ───────────────────────────────────────────────────────
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  editSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 12,
  },
  editSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editSheetTitle: { fontSize: 20, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  editLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  editInput: {
    backgroundColor: '#0e1a14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: WHITE,
    fontWeight: '500',
  },

  roleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#0e1a14',
  },
  roleChipActive: { backgroundColor: BLUE_DIM, borderColor: BLUE },
  roleChipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  roleChipTextActive: { color: BLUE },

  editNumericRow: { flexDirection: 'row', gap: 10 },
  editNumericField: { flex: 1, gap: 6 },

  editSaveBtn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  editSaveBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.1 },

  // ── Tonight's Report Modal ───────────────────────────────────────────────
  shiftStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 2,
  },
  shiftStatusPaid:    { backgroundColor: 'rgba(34,197,94,0.15)' },
  shiftStatusCalc:    { backgroundColor: BLUE_DIM },
  shiftStatusPending: { backgroundColor: AMBER_DIM },
  shiftStatusText: { fontSize: 12, fontWeight: '700' },

  reportEmptyCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  reportEmptyIcon:  { fontSize: 36 },
  reportEmptyTitle: { fontSize: 16, fontWeight: '700', color: WHITE },
  reportEmptyBody:  { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19 },
});
