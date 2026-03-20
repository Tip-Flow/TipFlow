import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { parseCSV, CSVParseResult } from '@/lib/csvParser';

const BG = '#09100e';
const CARD = '#162019';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.15)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const RED = '#ef4444';
const RED_DIM = 'rgba(239,68,68,0.12)';

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

export default function POSScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<CSVParseResult | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

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

  function handleUseData() {
    if (!preview) return;
    setPreviewVisible(false);
    router.push({
      pathname: '/(manager)/calculate',
      params: { csvData: JSON.stringify(preview) },
    });
  }

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
            <TouchableOpacity
              style={styles.newCalcBtn}
              onPress={() => router.push('/(manager)/calculate')}
              activeOpacity={0.8}>
              <Text style={styles.newCalcBtnText}>+ New Calculation</Text>
            </TouchableOpacity>
          </View>
        </View>

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
                  {/* Connected badge */}
                  <View style={[
                    styles.statusBadge,
                    loc.connected ? styles.statusConnected : styles.statusDisconnected,
                  ]}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: loc.connected ? TEAL : '#ef4444' },
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: loc.connected ? TEAL : '#ef4444' },
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
                    { color: isTeal ? TEAL : AMBER },
                  ]}>
                    {loc.posType}
                  </Text>
                </View>

                {/* Action button */}
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    isTeal ? styles.actionBtnTeal : styles.actionBtnAmber,
                    loading && isCSV && styles.actionBtnDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={loading && isCSV}
                  onPress={isCSV ? handleUploadCSV : undefined}>
                  {loading && isCSV ? (
                    <ActivityIndicator color="#09100e" />
                  ) : (
                    <Text style={styles.actionBtnText}>
                      {loc.connected ? "Pull Tonight's Report" : 'Upload CSV'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
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
                  { color: pos.type === 'API' ? TEAL : AMBER },
                ]}>
                  {pos.type}
                </Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* CSV Preview Modal */}
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
                {/* Modal header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>CSV Preview</Text>
                    <Text style={styles.modalSubtitle}>
                      {(Array.isArray(preview.rows) ? preview.rows : []).length} staff member{(Array.isArray(preview.rows) ? preview.rows : []).length !== 1 ? 's' : ''} detected
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setPreviewVisible(false)}
                    activeOpacity={0.7}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Parsing errors */}
                {(preview.errors.length ?? 0) > 0 && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Parsing Issues</Text>
                    {preview.errors.map((err, i) => (
                      <Text key={i} style={styles.errorText}>• {err}</Text>
                    ))}
                  </View>
                )}

                {/* Totals from CSV */}
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

                {/* Staff table */}
                {(Array.isArray(preview.rows) ? preview.rows : []).length > 0 && (
                  <View style={styles.tableCard}>
                    {/* Table header */}
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
                      <Text style={[styles.tableHeaderCell, styles.colRole]}>Role</Text>
                      <Text style={[styles.tableHeaderCell, styles.colHours]}>Hours</Text>
                      <Text style={[styles.tableHeaderCell, styles.colTips]}>Tips</Text>
                    </View>
                    <View style={styles.tableDivider} />

                    {(Array.isArray(preview.rows) ? preview.rows : []).map((row, index) => (
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

                {/* Hint */}
                <Text style={styles.hint}>
                  Looks wrong? Fix in Numbers or Excel and re-upload.
                </Text>

                {/* Use This Data button */}
                {(Array.isArray(preview.rows) ? preview.rows : []).length > 0 && (
                  <TouchableOpacity
                    style={styles.useDataBtn}
                    onPress={handleUseData}
                    activeOpacity={0.8}>
                    <Text style={styles.useDataBtnText}>Use This Data</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    gap: 24,
  },

  // Header
  header: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  newCalcBtn: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  newCalcBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#09100e',
    letterSpacing: 0.1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
  },

  // Section
  section: {
    gap: 14,
  },

  // Location Card
  locationCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  locHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  locInfo: {
    gap: 2,
  },
  locName: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  locCity: {
    fontSize: 13,
    color: MUTED,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusConnected: {
    backgroundColor: TEAL_DIM,
  },
  statusDisconnected: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // POS type badge
  posBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  posBadgeTeal: {
    backgroundColor: TEAL_DIM,
  },
  posBadgeAmber: {
    backgroundColor: AMBER_DIM,
  },
  posBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Action button
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnTeal: {
    backgroundColor: TEAL,
  },
  actionBtnAmber: {
    backgroundColor: AMBER,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09100e',
    letterSpacing: 0.1,
  },

  // Supported POS card
  supportedCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  supportedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 18,
    marginBottom: 4,
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  posRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  posName: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
  },
  integrationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  integrationAPI: {
    backgroundColor: TEAL_DIM,
  },
  integrationCSV: {
    backgroundColor: AMBER_DIM,
  },
  integrationText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalSafe: {
    flex: 1,
    backgroundColor: BG,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: MUTED,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '700',
  },

  // Error card
  errorCard: {
    backgroundColor: RED_DIM,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: RED,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  errorText: {
    fontSize: 13,
    color: RED,
    lineHeight: 18,
  },

  // Totals card
  totalsCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  totalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalItemBorder: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  totalItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
  },
  totalItemValue: {
    fontSize: 17,
    fontWeight: '800',
    color: TEAL,
  },

  // Table
  tableCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0e1a14',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tableDivider: {
    height: 1,
    backgroundColor: BORDER,
  },
  tableRowDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 14,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  tableCellName: {
    fontSize: 14,
    fontWeight: '700',
    color: WHITE,
  },
  tableCellMuted: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
  },
  tableCellTeal: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },

  // Column widths
  colName:  { flex: 2 },
  colRole:  { flex: 1.5 },
  colHours: { flex: 1, textAlign: 'center' },
  colTips:  { flex: 1, textAlign: 'right' },

  // Hint
  hint: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Use This Data button
  useDataBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  useDataBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#09100e',
    letterSpacing: 0.2,
  },
});
