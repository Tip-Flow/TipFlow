import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Pressable,
  View,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useWebFocus } from '@/hooks/useWebFocus';
import { supabase } from '@/lib/supabase';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import {
  calculateShiftSummary,
  calculateHousePool,
  TipOutRule,
  HousePoolStaff,
  ShiftSummaryResult,
  HousePoolAllocation,
} from '@/lib/tipCalculator';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG = '#09100e';
const CARD = '#162019';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65,105,225,0.15)';
const BLUE_BORDER = 'rgba(65,105,225,0.4)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.15)';
const MUTED = '#6b7a74';
const WHITE = '#e8f0ec';
const BORDER = '#1f3028';
const RED = '#ef4444';

// ─── Desktop table column widths ─────────────────────────────────────────────
const COL_SALES = 80;
const COL_TIPS  = 80;
const COL_HOURS = 70;
const COL_ON    = 56;

// ─── Default tip-out rules ────────────────────────────────────────────────────
const DEFAULT_TIP_OUT_RULES: TipOutRule[] = [
  { role: 'bartender', percentage: 1.5, distribution: 'direct' },
  { role: 'runner',    percentage: 1.0, distribution: 'house_pool' },
  { role: 'host',      percentage: 0.5, distribution: 'house_pool' },
];

const ROLE_LABELS: Record<string, string> = {
  server:    'Server',
  bartender: 'Bartender',
  runner:    'Runner',
  host:      'Host',
  kitchen:   'Kitchen',
};

const ROLE_EMOJIS: Record<string, string> = {
  server:    '🍽️',
  bartender: '🍸',
  runner:    '🏃',
  host:      '🚪',
  kitchen:   '👨‍🍳',
};

const SERVER_ROLES = new Set(['server']);
const SUPPORT_ROLES = new Set(['bartender', 'runner', 'host', 'kitchen']);

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServerEntry {
  id: string;
  name: string;
  role: string;
  sales: string;
  tipsEarned: string;
  hoursWorked: string;
  included: boolean;
}

interface SupportEntry {
  id: string;
  name: string;
  role: string;
  hoursWorked: string;
  included: boolean;
}

interface ActiveShift {
  id: string;
  name: string;
  date: string;
  staffCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string): number {
  const n = parseFloat(dollars);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Builds a staff_member_id → hours map from the Push labour cache, but only
// when the cache's date matches the target date (the date of the shift being
// worked on — not necessarily today, since managers can load past shifts).
function computePushHoursMap(
  cache: Array<{ staff_member_id: string | null; hours: number; employee_name?: string }> | null,
  cacheDate: string | null,
  targetDate: string,
  staffList: Array<{ id: string; name: string }>,
): { hoursMap: Record<string, number>; totalHours: number } {
  const hoursMap: Record<string, number> = {};
  let totalHours = 0;
  if (cacheDate !== targetDate || !Array.isArray(cache) || cache.length === 0) {
    return { hoursMap, totalHours };
  }
  const nameToId = new Map<string, string>();
  for (const s of staffList) {
    nameToId.set(normalizeName(s.name), s.id);
  }
  for (const entry of cache) {
    let staffId = entry.staff_member_id ?? null;
    if (!staffId && entry.employee_name) {
      staffId = nameToId.get(normalizeName(entry.employee_name)) ?? null;
    }
    if (staffId && entry.hours > 0) {
      hoursMap[staffId] = entry.hours;
      totalHours += entry.hours;
    }
  }
  return { hoursMap, totalHours };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalculateScreen() {
  const isDesktop = useIsDesktop();
  const scrollRef = useRef<ScrollView>(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [showBanner, setShowBanner] = useState(false);
  const pushBannerOpacity = useRef(new Animated.Value(0)).current;
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushBannerMsg, setPushBannerMsg] = useState('');

  function triggerSuccessBanner() {
    setShowBanner(true);
    successOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(2500),
      Animated.timing(successOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setShowBanner(false));
  }

  function triggerPushBanner(msg: string) {
    setPushBannerMsg(msg);
    setShowPushBanner(true);
    pushBannerOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(3000),
      Animated.timing(pushBannerOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setShowPushBanner(false));
  }

  // ── Main form state ───────────────────────────────────────────────────────
  const [shiftName, setShiftName] = useState('');
  const [shiftDate, setShiftDate] = useState(today());
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [supportStaff, setSupportStaff] = useState<SupportEntry[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [summary, setSummary] = useState<ShiftSummaryResult | null>(null);
  const [housePoolAllocations, setHousePoolAllocations] = useState<HousePoolAllocation[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Push labour hours cache: staff_member_id → hours (pre-filled from Push sync)
  const [pushHours, setPushHours] = useState<Record<string, number>>({});
  // Track which fields were pre-filled by Push (to show badge)
  const [pushFilledIds, setPushFilledIds] = useState<Set<string>>(new Set());
  // Raw Push cache + its date, kept around so we can re-match hours against
  // whatever shift date the manager loads (not just today's date)
  const [pushCache, setPushCache] = useState<Array<{ staff_member_id: string | null; hours: number; employee_name?: string }> | null>(null);
  const [pushCacheDate, setPushCacheDate] = useState<string | null>(null);

  // ── Active (pending) shifts ───────────────────────────────────────────────
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [loadingActive, setLoadingActive] = useState(false);
  // When a pending shift is loaded into the form, this is its ID
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);

  // ── New Shift modal state ─────────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftDate, setNewShiftDate] = useState(today());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalSales, setModalSales] = useState<Record<string, string>>({});
  const [creatingShift, setCreatingShift] = useState(false);

  // ── All staff for the modal ───────────────────────────────────────────────
  const allStaff = [...servers, ...supportStaff];

  // ── Fetch staff + location on mount ──────────────────────────────────────
  useEffect(() => {
    async function fetchStaff() {
      setLoadingStaff(true);
      try {
        const { data: locData } = await supabase
          .from('locations')
          .select('id, push_labour_cache, push_labour_cache_date')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        if (!locData) return;
        setLocationId(locData.id);

        // Fetch staff first — needed for name-based cache matching
        const { data: staffData, error } = await supabase
          .from('staff_members')
          .select('id, name, role, location_id')
          .eq('location_id', locData.id)
          .order('name');
        if (error) throw error;

        const all = staffData ?? [];

        // Process Push labour cache and build hoursMap keyed by staff_member_id.
        // Pre-fill against the currently loaded shift date (today, since no
        // pending shift has been loaded yet at mount) — not just "today" —
        // so a later shift load can re-match against its own date.
        const todayStr = today();
        const cacheDate = locData.push_labour_cache_date ?? null;
        const cache = locData.push_labour_cache as Array<{ staff_member_id: string | null; hours: number; employee_name?: string }> | null;
        setPushCache(cache);
        setPushCacheDate(cacheDate);

        console.log('[Calculate] push_labour_cache_date:', cacheDate, '| todayStr:', todayStr);
        console.log('[Calculate] push_labour_cache full content:', JSON.stringify(cache));

        const { hoursMap, totalHours } = computePushHoursMap(cache, cacheDate, todayStr, all);
        const staffCount = Object.keys(hoursMap).length;
        console.log('[Calculate] hoursMap after matching:', JSON.stringify(hoursMap));
        setPushHours(hoursMap);
        if (staffCount > 0) {
          const roundedHours = Math.round(totalHours * 10) / 10;
          triggerPushBanner(`Labour loaded for ${formatDate(todayStr)} — ${staffCount} staff, ${roundedHours}h`);
        } else {
          console.log('[Calculate] no Push cache for today — cacheDate:', cacheDate, '| cache length:', Array.isArray(cache) ? cache.length : 'not array');
        }

        // Initialize servers and support staff — pre-fill hours inline so there
        // is no race between setPushHours and setServers across separate renders
        const filledIds = new Set<string>();

        setServers(
          all
            .filter((s) => SERVER_ROLES.has(s.role?.toLowerCase()))
            .map((s) => {
              const hrs = hoursMap[s.id];
              if (hrs !== undefined) filledIds.add(s.id);
              return {
                id: s.id,
                name: s.name,
                role: s.role?.toLowerCase() ?? 'server',
                sales: '',
                tipsEarned: '',
                hoursWorked: hrs !== undefined ? String(hrs) : '',
                included: true,
              };
            }),
        );
        setSupportStaff(
          all
            .filter((s) => SUPPORT_ROLES.has(s.role?.toLowerCase()))
            .map((s) => {
              const hrs = hoursMap[s.id];
              if (hrs !== undefined) filledIds.add(s.id);
              return {
                id: s.id,
                name: s.name,
                role: s.role?.toLowerCase() ?? 'runner',
                hoursWorked: hrs !== undefined ? String(hrs) : '',
                included: true,
              };
            }),
        );

        if (filledIds.size > 0) {
          setPushFilledIds(filledIds);
          console.log('[Calculate] pre-filled hours from Push for', filledIds.size, 'staff:', Array.from(filledIds).join(', '));
        }
      } catch (err) {
        console.error('Failed to load staff:', err);
      } finally {
        setLoadingStaff(false);
      }
    }
    fetchStaff();
  }, []);

  // ── Fetch active (pending) shifts when location is known ──────────────────
  const fetchActiveShifts = useCallback(async (locId: string) => {
    setLoadingActive(true);
    try {
      const { data } = await supabase
        .from('shifts')
        .select('id, name, date, tip_allocations(id)')
        .eq('location_id', locId)
        .eq('status', 'active')
        .order('date', { ascending: false });

      setActiveShifts(
        (data ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          date: s.date,
          staffCount: (s.tip_allocations ?? []).length,
        })),
      );
    } catch (err) {
      console.error('Failed to fetch active shifts:', err);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  useEffect(() => {
    if (locationId) fetchActiveShifts(locationId);
  }, [locationId, fetchActiveShifts]);

  // Refresh pending shifts whenever the tab regains focus (another device may have added/removed shifts)
  useFocusEffect(
    useCallback(() => {
      if (locationId) fetchActiveShifts(locationId);
    }, [locationId, fetchActiveShifts])
  );
  useWebFocus(useCallback(() => { if (locationId) fetchActiveShifts(locationId); }, [locationId, fetchActiveShifts]));

  // ── Update helpers ────────────────────────────────────────────────────────
  function updateServer(
    id: string,
    field: keyof Pick<ServerEntry, 'sales' | 'tipsEarned' | 'hoursWorked'>,
    value: string,
  ) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
      setSummary(null);
      // Clear Push badge if user manually edits the hours
      if (field === 'hoursWorked') {
        setPushFilledIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
  }

  function toggleServer(id: string) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s)));
    setSummary(null);
  }

  function updateSupportHours(id: string, value: string) {
    if (/^\d{0,2}(\.\d{0,2})?$/.test(value)) {
      setSupportStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, hoursWorked: value } : s)),
      );
      setSummary(null);
      setPushFilledIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  function toggleSupport(id: string) {
    setSupportStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s)),
    );
    setSummary(null);
  }

  // ── New Shift modal helpers ───────────────────────────────────────────────
  function openNewShiftModal() {
    setNewShiftName('');
    setNewShiftDate(today());
    setSelectedIds(new Set());
    setModalSales({});
    setModalVisible(true);
  }

  function toggleStaffSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateModalSales(id: string, value: string) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setModalSales((prev) => ({ ...prev, [id]: value }));
    }
  }

  async function handleCreateShift() {
    if (!newShiftName.trim()) {
      Alert.alert('Missing shift name', 'Give tonight\'s shift a name.');
      return;
    }
    if (selectedIds.size === 0) {
      Alert.alert('No staff selected', 'Select at least one staff member for this shift.');
      return;
    }
    if (!locationId) return;

    setSaving(true);
    try {
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .insert({
          location_id: locationId,
          date: newShiftDate,
          name: newShiftName.trim(),
          total_tips: 0,
          total_sales: 0,
          status: 'active',
          pos_source: 'manual',
        })
        .select('id')
        .single();
      if (shiftError) throw shiftError;

      const stubs = allStaff
        .filter((s) => selectedIds.has(s.id))
        .map((s) => ({
          shift_id: shiftData.id,
          staff_id: s.id,
          hours_worked: 0,
          role_weight: SERVER_ROLES.has(s.role) ? 1.0 : 0,
          server_sales: SERVER_ROLES.has(s.role)
            ? dollarsToCents(modalSales[s.id] ?? '0')
            : 0,
          calculated_amount: 0,
        }));

      const { error: allocError } = await supabase.from('tip_allocations').insert(stubs);
      if (allocError) throw allocError;

      setShiftName(newShiftName.trim());
      setShiftDate(newShiftDate);
      setActiveShiftId(shiftData.id);
      setSummary(null);
      setHousePoolAllocations(null);

      setServers((prev) =>
        prev.map((s) => ({
          ...s,
          included: selectedIds.has(s.id),
          sales: SERVER_ROLES.has(s.role) ? (modalSales[s.id] ?? '') : s.sales,
          tipsEarned: '',
          hoursWorked: '',
        })),
      );
      setSupportStaff((prev) =>
        prev.map((s) => ({
          ...s,
          included: selectedIds.has(s.id),
          hoursWorked: '',
        })),
      );

      // Pre-fill hours from the Push labour cache if it matches this new shift's date
      console.log('[Calculate] new shift created — checking Push cache for date:', newShiftDate);
      const { hoursMap, totalHours } = computePushHoursMap(pushCache, pushCacheDate, newShiftDate, allStaff);
      const staffCount = Object.keys(hoursMap).length;
      if (staffCount > 0) {
        setPushHours(hoursMap);
        const filledIds = new Set<string>();
        setServers((prev) =>
          prev.map((s) => {
            const hrs = hoursMap[s.id];
            if (hrs === undefined) return s;
            filledIds.add(s.id);
            return { ...s, hoursWorked: String(hrs) };
          }),
        );
        setSupportStaff((prev) =>
          prev.map((s) => {
            const hrs = hoursMap[s.id];
            if (hrs === undefined) return s;
            filledIds.add(s.id);
            return { ...s, hoursWorked: String(hrs) };
          }),
        );
        setPushFilledIds(filledIds);
        const roundedHours = Math.round(totalHours * 10) / 10;
        triggerPushBanner(`Labour loaded for ${formatDate(newShiftDate)} — ${staffCount} staff, ${roundedHours}h`);
      }

      setModalVisible(false);
      fetchActiveShifts(locationId);
    } catch (err: unknown) {
      Alert.alert('Failed to create shift', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Load a pending shift into the calculation form ────────────────────────
  async function handleLoadShift(shift: ActiveShift) {
    console.log('[Calculate] Load tapped for shift:', shift.id);
    try {
      const { data: allocs } = await supabase
        .from('tip_allocations')
        .select('staff_id, server_sales, hours_worked')
        .eq('shift_id', shift.id);

      const allocMap: Record<string, { server_sales: number; hours_worked: number }> = {};
      for (const a of allocs ?? []) {
        allocMap[a.staff_id] = { server_sales: a.server_sales ?? 0, hours_worked: a.hours_worked ?? 0 };
      }

      // Re-match the Push labour cache against this shift's own date, not
      // today's date — a manager can load a pending shift from any day.
      const { hoursMap, totalHours } = computePushHoursMap(pushCache, pushCacheDate, shift.date, allStaff);
      const staffCount = Object.keys(hoursMap).length;
      setPushHours(hoursMap);

      setShiftName(shift.name);
      setShiftDate(shift.date);
      setActiveShiftId(shift.id);
      setSummary(null);
      setHousePoolAllocations(null);

      const filledIds = new Set<string>();

      setServers((prev) =>
        prev.map((s) => {
          const hrs = hoursMap[s.id];
          if (hrs !== undefined) filledIds.add(s.id);
          return {
            ...s,
            included: !!allocMap[s.id],
            sales: allocMap[s.id]?.server_sales
              ? centsToDisplay(allocMap[s.id].server_sales)
              : '',
            tipsEarned: '',
            hoursWorked: hrs !== undefined ? String(hrs) : '',
          };
        }),
      );

      setSupportStaff((prev) =>
        prev.map((s) => {
          const hrs = hoursMap[s.id];
          if (hrs !== undefined) filledIds.add(s.id);
          return {
            ...s,
            included: !!allocMap[s.id],
            hoursWorked: hrs !== undefined ? String(hrs) : '',
          };
        }),
      );

      setPushFilledIds(filledIds);
      if (staffCount > 0) {
        const roundedHours = Math.round(totalHours * 10) / 10;
        triggerPushBanner(`Labour loaded for ${formatDate(shift.date)} — ${staffCount} staff, ${roundedHours}h`);
      }
    } catch (err) {
      Alert.alert('Failed to load shift', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  function handleCalculate() {
    console.log("Calculate tapped");
    console.log('[Calculate] shiftName:', JSON.stringify(shiftName), '| servers:', servers.length, '| support:', supportStaff.length);
    console.log('[Calculate] server data:', JSON.stringify(servers.map(s => ({ name: s.name, included: s.included, sales: s.sales, tips: s.tipsEarned, hours: s.hoursWorked }))));
    if (!shiftName.trim()) {
      Alert.alert('Missing info', 'Please enter a shift name.');
      return;
    }

    const activeServers = servers.filter((s) => s.included);
    if (activeServers.length === 0) {
      Alert.alert('No servers', 'Include at least one server.');
      return;
    }

    const missingData = activeServers.filter(
      (s) =>
        dollarsToCents(s.sales) <= 0 ||
        dollarsToCents(s.tipsEarned) <= 0 ||
        parseFloat(s.hoursWorked) <= 0,
    );
    if (missingData.length > 0) {
      Alert.alert(
        'Missing data',
        `Enter sales, tips earned, and hours for: ${missingData.map((s) => s.name).join(', ')}`,
      );
      return;
    }

    try {
      const serverInputs = activeServers.map((s) => ({
        id: s.id,
        name: s.name,
        sales: dollarsToCents(s.sales),
        tipsEarned: dollarsToCents(s.tipsEarned),
        hoursWorked: parseFloat(s.hoursWorked),
      }));

      const newSummary = calculateShiftSummary(serverInputs, DEFAULT_TIP_OUT_RULES);

      const activeSupport = supportStaff.filter(
        (s) => s.included && parseFloat(s.hoursWorked) > 0,
      );
      const poolRoles: HousePoolStaff[] = activeSupport.map((s) => ({
        staffId: s.id,
        name: s.name,
        distribution_type: 'points',
        points_per_hour: 1,
        hours_worked: parseFloat(s.hoursWorked),
      }));
      const newPoolAllocations = calculateHousePool(newSummary.totalHousePool, poolRoles);

      console.log('[Calculate] results summary:', JSON.stringify(newSummary));
      console.log('[Calculate] housePool allocations:', JSON.stringify(newPoolAllocations));

      setSummary(newSummary);
      setHousePoolAllocations(newPoolAllocations);
    } catch (err: unknown) {
      Alert.alert('Calculation error', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Direct tip-out totals per role ────────────────────────────────────────
  function getDirectTipOutTotals(): Record<string, number> {
    if (!summary) return {};
    const totals: Record<string, number> = {};
    for (const server of summary.perServerBreakdown) {
      for (const tipOut of server.directTipOuts) {
        totals[tipOut.role] = (totals[tipOut.role] ?? 0) + tipOut.amount;
      }
    }
    return totals;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSaveAndPayout() {
    if (!summary || !housePoolAllocations || !locationId) return;

    const totalTipsCents = summary.perServerBreakdown.reduce((sum, s) => sum + s.tipsEarned, 0);
    const totalSalesCents = summary.perServerBreakdown.reduce((sum, s) => sum + s.sales, 0);

    const directTotals = getDirectTipOutTotals();

    // Build allocations array (shift_id placeholder replaced below)
    function buildAllocations(shiftId: string): object[] {
      const rows: object[] = [];

      for (const s of summary!.perServerBreakdown) {
        const directTipOutsTotal = s.directTipOuts.reduce((sum, t) => sum + t.amount, 0);
        rows.push({
          shift_id: shiftId,
          staff_id: s.id,
          hours_worked: s.hoursWorked,
          role_weight: 1.0,
          server_sales: s.sales,
          total_tip_out: s.totalTipOut,
          direct_tip_outs: directTipOutsTotal,
          house_pool_contribution: s.housePoolContribution,
          tips_kept: s.tipsKept,
          calculated_amount: s.tipsKept,
        });
      }

      for (const a of housePoolAllocations!) {
        rows.push({
          shift_id: shiftId,
          staff_id: a.staffId,
          hours_worked: a.hoursWorked,
          role_weight: 0,
          calculated_amount: a.calculatedAmount,
        });
      }

      for (const [role, totalAmount] of Object.entries(directTotals)) {
        const recipients = supportStaff.filter(
          (s) => s.included && s.role === role && parseFloat(s.hoursWorked) > 0,
        );
        if (recipients.length === 0) continue;
        const perPerson = Math.floor(totalAmount / recipients.length);
        let leftover = totalAmount - perPerson * recipients.length;
        for (const r of recipients) {
          const amount = leftover > 0 ? perPerson + 1 : perPerson;
          if (leftover > 0) leftover--;
          rows.push({
            shift_id: shiftId,
            staff_id: r.id,
            hours_worked: parseFloat(r.hoursWorked) || 0,
            role_weight: 0,
            calculated_amount: amount,
          });
        }
      }

      return rows;
    }

    setSaving(true);
    try {
      let shiftId: string;

      const allocations = buildAllocations('__placeholder__');
      console.log('[SaveAndPayout] locationId:', locationId);
      console.log('[SaveAndPayout] activeShiftId:', activeShiftId);
      console.log('[SaveAndPayout] totalTipsCents:', totalTipsCents, 'totalSalesCents:', totalSalesCents);
      console.log('[SaveAndPayout] allocations to insert:', JSON.stringify(allocations, null, 2));

      if (activeShiftId) {
        // Update existing active shift
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            name: shiftName.trim(),
            date: shiftDate,
            total_tips: totalTipsCents,
            total_sales: totalSalesCents,
            status: 'calculated',
          })
          .eq('id', activeShiftId);
        if (updateError) {
          console.log('[SaveAndPayout] shifts UPDATE error:', JSON.stringify(updateError));
          throw updateError;
        }

        // Replace stub allocations with calculated ones
        const { error: deleteError } = await supabase
          .from('tip_allocations')
          .delete()
          .eq('shift_id', activeShiftId);
        if (deleteError) {
          console.log('[SaveAndPayout] tip_allocations DELETE error:', JSON.stringify(deleteError));
          throw deleteError;
        }

        shiftId = activeShiftId;
      } else {
        // Create a brand-new shift
        const { data: shiftData, error: shiftError } = await supabase
          .from('shifts')
          .insert({
            location_id: locationId,
            date: shiftDate,
            name: shiftName.trim(),
            total_tips: totalTipsCents,
            total_sales: totalSalesCents,
            status: 'calculated',
            pos_source: 'manual',
          })
          .select('id')
          .single();
        if (shiftError) {
          console.log('[SaveAndPayout] shifts INSERT error:', JSON.stringify(shiftError));
          throw shiftError;
        }
        shiftId = shiftData.id;
      }

      const finalAllocations = buildAllocations(shiftId);
      console.log('[SaveAndPayout] inserting', finalAllocations.length, 'allocations for shiftId:', shiftId);
      const { error: allocError } = await supabase
        .from('tip_allocations')
        .insert(finalAllocations);
      if (allocError) {
        console.log('[SaveAndPayout] tip_allocations INSERT error:', JSON.stringify(allocError));
        throw allocError;
      }

      // Update house pool balance
      const { data: locBalance } = await supabase
        .from('locations')
        .select('house_pool_balance')
        .eq('id', locationId)
        .single();
      const currentBalance = locBalance?.house_pool_balance ?? 0;
      const { error: balanceError } = await supabase
        .from('locations')
        .update({ house_pool_balance: currentBalance + summary.totalHousePool })
        .eq('id', locationId);
      if (balanceError) {
        console.log('[SaveAndPayout] locations UPDATE error:', JSON.stringify(balanceError));
        throw balanceError;
      }

      console.log('[SaveAndPayout] success — shiftId:', shiftId);

      // Dismiss keyboard — native uses Keyboard.dismiss(), web blurs the active element
      Keyboard.dismiss();
      if (Platform.OS === 'web') {
        const el = (global as any)?.document?.activeElement;
        if (el && typeof el.blur === 'function') el.blur();
      }

      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });

      // Reset form for next shift
      setShiftName('');
      setShiftDate(today());
      setActiveShiftId(null);
      setSummary(null);
      setHousePoolAllocations(null);
      setServers((prev) => prev.map((s) => ({ ...s, sales: '', tipsEarned: '', hoursWorked: '', included: true })));
      setSupportStaff((prev) => prev.map((s) => ({ ...s, hoursWorked: '', included: true })));
      if (locationId) fetchActiveShifts(locationId);

      // Banner works on both mobile and web; Alert.alert on web maps to
      // window.alert() which is a blocking browser dialog — use banner instead.
      triggerSuccessBanner();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as any)?.message
          ? String((err as any).message)
          : JSON.stringify(err);
      console.log('[SaveAndPayout] caught error:', JSON.stringify(err));
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }

  const directTipOutTotals = getDirectTipOutTotals();

  // ── Render ────────────────────────────────────────────────────────────────

  // Servers table header for desktop
  const serversTableHeader = isDesktop ? (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Staff</Text>
      <Text style={[styles.tableHeaderCell, { width: COL_SALES, flexShrink: 0, textAlign: 'center' }]}>Sales ($)</Text>
      <Text style={[styles.tableHeaderCell, { width: COL_TIPS,  flexShrink: 0, textAlign: 'center' }]}>Tips ($)</Text>
      <Text style={[styles.tableHeaderCell, { width: COL_HOURS, flexShrink: 0, textAlign: 'center' }]}>Hours</Text>
      <Text style={[styles.tableHeaderCell, { width: COL_ON,   flexShrink: 0, textAlign: 'center' }]}>On</Text>
    </View>
  ) : null;

  const serversDesktopRows = isDesktop ? (
    servers.map((s, index) => (
      <View key={s.id}>
        {index > 0 && <View style={styles.divider} />}
        <View style={[styles.desktopServerRow, !s.included && styles.mutedBlock]}>
          <Text style={[styles.staffName, { flex: 1 }, !s.included && { color: MUTED }]}>
            {ROLE_EMOJIS.server} {s.name}
          </Text>
          <TextInput
            style={[styles.tableInput, { width: COL_SALES, flexShrink: 0 }, !s.included && { color: MUTED }]}
            placeholder="0.00"
            placeholderTextColor={MUTED}
            value={s.sales}
            onChangeText={(t) => updateServer(s.id, 'sales', t)}
            keyboardType="decimal-pad"
            editable={s.included}
          />
          <TextInput
            style={[styles.tableInput, { width: COL_TIPS, flexShrink: 0 }, !s.included && { color: MUTED }]}
            placeholder="0.00"
            placeholderTextColor={MUTED}
            value={s.tipsEarned}
            onChangeText={(t) => updateServer(s.id, 'tipsEarned', t)}
            keyboardType="decimal-pad"
            editable={s.included}
          />
          <View style={{ width: COL_HOURS, flexShrink: 0, alignItems: 'center' }}>
            <TextInput
              style={[styles.tableInput, { width: COL_HOURS, flexShrink: 0 }, !s.included && { color: MUTED }, pushFilledIds.has(s.id) && styles.tableInputPush]}
              placeholder="0"
              placeholderTextColor={MUTED}
              value={s.hoursWorked}
              onChangeText={(t) => updateServer(s.id, 'hoursWorked', t)}
              keyboardType="decimal-pad"
              editable={s.included}
            />
            {pushFilledIds.has(s.id) && (
              <Text style={styles.pushBadgeSmall}>Push</Text>
            )}
          </View>
          <View style={{ width: COL_ON, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Switch
              value={s.included}
              onValueChange={() => toggleServer(s.id)}
              trackColor={{ false: BORDER, true: BLUE_DIM }}
              thumbColor={s.included ? BLUE : MUTED}
            />
          </View>
        </View>
      </View>
    ))
  ) : null;

  const formPanel = (
    <>
      {/* ── Pending (active) shifts ──────────────────────────────────── */}
      {(loadingActive || activeShifts.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pending Shifts</Text>
          {loadingActive ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 16 }} />
          ) : (
            activeShifts.map((shift, index) => (
              <View key={shift.id}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.pendingRow}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingName}>{shift.name}</Text>
                    <Text style={styles.pendingMeta}>
                      {formatDate(shift.date)} · {shift.staffCount} staff
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.loadBtn,
                      activeShiftId === shift.id && styles.loadBtnActive,
                    ]}
                    onPress={() => handleLoadShift(shift)}>
                    <Text style={[
                      styles.loadBtnText,
                      activeShiftId === shift.id && styles.loadBtnTextActive,
                    ]}>
                      {activeShiftId === shift.id ? '✓ Loaded' : 'Load →'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Loaded shift indicator */}
      {activeShiftId && (
        <View style={styles.loadedBanner}>
          <Text style={styles.loadedBannerText}>
            ✓ Editing: {shiftName} — complete the fields below and calculate
          </Text>
        </View>
      )}

      {/* Tip-out rules */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tip-Out Rules</Text>
        {DEFAULT_TIP_OUT_RULES.map((rule, i) => (
          <View key={rule.role}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.ruleRow}>
              <Text style={styles.ruleRole}>
                {ROLE_EMOJIS[rule.role] ?? ''} {ROLE_LABELS[rule.role] ?? rule.role}
              </Text>
              <Text style={styles.rulePct}>{rule.percentage}% of sales</Text>
              <View style={[
                styles.ruleBadge,
                rule.distribution === 'direct' ? styles.badgeTeal : styles.badgeAmber,
              ]}>
                <Text style={[
                  styles.ruleBadgeText,
                  rule.distribution === 'direct' ? styles.badgeTealText : styles.badgeAmberText,
                ]}>
                  {rule.distribution === 'direct' ? 'direct' : 'pool'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Shift Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Shift Details</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Shift Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Friday Dinner"
            placeholderTextColor={MUTED}
            value={shiftName}
            onChangeText={(t) => { setShiftName(t); setSummary(null); }}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            style={styles.textInput}
            value={shiftDate}
            onChangeText={(t) => { setShiftDate(t); setSummary(null); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      {/* Servers */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Servers</Text>
        {loadingStaff ? (
          <ActivityIndicator color={BLUE} style={{ marginVertical: 20 }} />
        ) : servers.length === 0 ? (
          <Text style={styles.emptyText}>
            No servers found. Add server staff in the Staff tab.
          </Text>
        ) : isDesktop ? (
          <>
            {serversTableHeader}
            {serversDesktopRows}
          </>
        ) : (
          servers.map((s, index) => (
            <View key={s.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={[styles.serverBlock, !s.included && styles.mutedBlock]}>
                <View style={styles.serverHeader}>
                  <Text style={[styles.staffName, !s.included && { color: MUTED }]}>
                    {ROLE_EMOJIS.server} {s.name}
                  </Text>
                  <Switch
                    value={s.included}
                    onValueChange={() => toggleServer(s.id)}
                    trackColor={{ false: BORDER, true: BLUE_DIM }}
                    thumbColor={s.included ? BLUE : MUTED}
                  />
                </View>
                {s.included && (
                  <View style={styles.serverInputs}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Sales ($)</Text>
                      <TextInput
                        style={styles.smallInput}
                        placeholder="0.00"
                        placeholderTextColor={MUTED}
                        value={s.sales}
                        onChangeText={(t) => updateServer(s.id, 'sales', t)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Tips ($)</Text>
                      <TextInput
                        style={styles.smallInput}
                        placeholder="0.00"
                        placeholderTextColor={MUTED}
                        value={s.tipsEarned}
                        onChangeText={(t) => updateServer(s.id, 'tipsEarned', t)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.inputLabel}>Hours</Text>
                        {pushFilledIds.has(s.id) && (
                          <Text style={styles.pushBadge}>Push</Text>
                        )}
                      </View>
                      <TextInput
                        style={[styles.smallInput, pushFilledIds.has(s.id) && styles.smallInputPush]}
                        placeholder="0"
                        placeholderTextColor={MUTED}
                        value={s.hoursWorked}
                        onChangeText={(t) => updateServer(s.id, 'hoursWorked', t)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Support Staff */}
      {!loadingStaff && supportStaff.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Support Staff</Text>
          <Text style={styles.cardSubtitle}>Hours worked determines house pool share</Text>
          {supportStaff.map((s, index) => (
            <View key={s.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={[styles.staffRow, !s.included && styles.mutedBlock]}>
                <View style={styles.staffInfo}>
                  <Text style={[styles.staffName, !s.included && { color: MUTED }]}>
                    {ROLE_EMOJIS[s.role] ?? ''} {s.name}
                  </Text>
                  <View style={styles.staffRoleRow}>
                    <Text style={styles.staffRole}>{ROLE_LABELS[s.role] ?? s.role}</Text>
                    {pushFilledIds.has(s.id) && (
                      <Text style={styles.pushBadge}>Push</Text>
                    )}
                  </View>
                </View>
                <TextInput
                  style={[styles.hoursInput, !s.included && styles.hoursInputDisabled, pushFilledIds.has(s.id) && styles.hoursInputPush]}
                  placeholder="hrs"
                  placeholderTextColor={MUTED}
                  value={s.hoursWorked}
                  onChangeText={(t) => updateSupportHours(s.id, t)}
                  keyboardType="decimal-pad"
                  editable={s.included}
                />
                <Switch
                  value={s.included}
                  onValueChange={() => toggleSupport(s.id)}
                  trackColor={{ false: BORDER, true: BLUE_DIM }}
                  thumbColor={s.included ? BLUE : MUTED}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Calculate Button */}
      <Pressable style={styles.calcBtn} onPress={handleCalculate}>
        <Text style={styles.calcBtnText}>Calculate</Text>
      </Pressable>
    </>
  );

  const resultsPanel = summary && housePoolAllocations ? (
    <View style={styles.resultsSection}>
      <Text style={styles.resultsTitle}>Results</Text>

      {summary.perServerBreakdown.map((s, index) => (
        <View
          key={s.id}
          style={[
            styles.resultCard,
            index < summary.perServerBreakdown.length - 1 && styles.resultCardBorder,
          ]}>
          <View style={styles.resultHeaderRow}>
            <Text style={styles.resultName}>{s.name}</Text>
            <Text style={[styles.resultAmount, s.tipsKept < 0 && { color: RED }]}>
              ${centsToDisplay(s.tipsKept)}
            </Text>
          </View>
          <Text style={styles.resultMeta}>
            ${centsToDisplay(s.sales)} sales · ${centsToDisplay(s.tipsEarned)} earned
          </Text>
          {s.directTipOuts.map((t) => (
            <View key={t.role} style={styles.tipOutRow}>
              <Text style={styles.tipOutLabel}>
                → {ROLE_LABELS[t.role] ?? t.role} tip-out ({t.percentage}%)
              </Text>
              <Text style={styles.tipOutAmount}>−${centsToDisplay(t.amount)}</Text>
            </View>
          ))}
          {s.housePoolContribution > 0 && (
            <View style={styles.tipOutRow}>
              <Text style={styles.tipOutLabel}>→ Pool contribution</Text>
              <Text style={styles.tipOutAmount}>
                −${centsToDisplay(s.housePoolContribution)}
              </Text>
            </View>
          )}
        </View>
      ))}

      <View style={styles.totalRow}>
        <View>
          <Text style={styles.totalLabel}>Servers keep</Text>
          <Text style={styles.totalSub}>After all tip-outs</Text>
        </View>
        <Text style={styles.totalAmount}>${centsToDisplay(summary.totalTipsKept)}</Text>
      </View>

      {Object.keys(directTipOutTotals).length > 0 && (
        <View style={styles.poolCard}>
          <Text style={styles.poolCardTitle}>Direct Tip-Outs</Text>
          {Object.entries(directTipOutTotals).map(([role, amount], i) => (
            <View key={role}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.poolRow}>
                <Text style={styles.poolName}>
                  {ROLE_EMOJIS[role] ?? ''} {ROLE_LABELS[role] ?? role}s (split equally)
                </Text>
                <Text style={styles.poolAmount}>${centsToDisplay(amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {summary.totalHousePool > 0 && (
        <View style={styles.poolCard}>
          <View style={styles.poolCardHeader}>
            <Text style={styles.poolCardTitle}>House Pool</Text>
            <Text style={styles.poolCardTotal}>
              ${centsToDisplay(summary.totalHousePool)}
            </Text>
          </View>
          {housePoolAllocations.length === 0 ? (
            <Text style={styles.emptyText}>
              No support staff on shift — pool unallocated.
            </Text>
          ) : (
            housePoolAllocations.map((a, i) => (
              <View key={a.staffId}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.poolRow}>
                  <View>
                    <Text style={styles.poolName}>{a.name}</Text>
                    <Text style={styles.poolMeta}>
                      {a.hoursWorked}h
                      {a.distributionType === 'points'
                        ? ` · ${a.points.toFixed(1)} pts`
                        : ' · fixed'}
                    </Text>
                  </View>
                  <Text style={styles.poolAmount}>
                    ${centsToDisplay(a.calculatedAmount)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      <Pressable
        style={[styles.payoutBtn, saving && styles.payoutBtnDisabled]}
        onPress={handleSaveAndPayout}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#09100e" />
        ) : (
          <Text style={styles.payoutBtnText}>Save & Pay Out</Text>
        )}
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      {showBanner && (
        <Animated.View style={[styles.successBanner, { opacity: successOpacity }]} pointerEvents="none">
          <Text style={styles.successBannerText}>✓ Shift saved and paid out!</Text>
        </Animated.View>
      )}
      {showPushBanner && (
        <Animated.View style={[styles.pushLabourBanner, { opacity: pushBannerOpacity }]} pointerEvents="none">
          <Text style={styles.pushLabourBannerText}>{pushBannerMsg}</Text>
        </Animated.View>
      )}
      {/* KeyboardAvoidingView: only apply padding behavior on iOS — on web/Android
          the 'height' behavior can add a blocking div layer over content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Calculate Tips</Text>
              <Pressable
                style={styles.newShiftBtn}
                onPress={openNewShiftModal}>
                <Text style={styles.newShiftBtnText}>+ New Shift</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>Enter each server's sales and tips earned</Text>
          </View>

          {formPanel}
          {resultsPanel}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── New Shift Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>

              {/* Modal header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Shift</Text>
                <Pressable
                  style={styles.closeBtn}
                  onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>
                Set up tonight's shift and pre-load sales before calculating tips
              </Text>

              {/* Shift name */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Shift Details</Text>
                <View style={styles.modalField}>
                  <Text style={styles.modalFieldLabel}>Shift Name</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="e.g. Saturday Dinner"
                    placeholderTextColor={MUTED}
                    value={newShiftName}
                    onChangeText={setNewShiftName}
                  />
                </View>
                <View style={styles.modalDivider} />
                <View style={styles.modalField}>
                  <Text style={styles.modalFieldLabel}>Date</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    value={newShiftDate}
                    onChangeText={setNewShiftDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={MUTED}
                  />
                </View>
              </View>

              {/* Staff multi-select */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>
                  Staff on Tonight's Shift
                  {selectedIds.size > 0 && (
                    <Text style={styles.modalCardCount}>  {selectedIds.size} selected</Text>
                  )}
                </Text>

                {loadingStaff ? (
                  <ActivityIndicator color={BLUE} style={{ marginVertical: 16 }} />
                ) : allStaff.length === 0 ? (
                  <Text style={styles.emptyText}>No staff found for this location.</Text>
                ) : (
                  allStaff.map((s, index) => {
                    const isSelected = selectedIds.has(s.id);
                    const isServer = SERVER_ROLES.has(s.role);
                    return (
                      <View key={s.id}>
                        {index > 0 && <View style={styles.modalDivider} />}
                        <Pressable
                          style={[styles.staffSelectRow, isSelected && styles.staffSelectRowActive]}
                          onPress={() => toggleStaffSelection(s.id)}>
                          {/* Checkbox */}
                          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                            {isSelected && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <View style={styles.staffSelectInfo}>
                            <Text style={[styles.staffSelectName, isSelected && { color: WHITE }]}>
                              {ROLE_EMOJIS[s.role] ?? ''} {s.name}
                            </Text>
                            <Text style={styles.staffSelectRole}>
                              {ROLE_LABELS[s.role] ?? s.role}
                            </Text>
                          </View>
                        </Pressable>

                        {/* Sales input for servers when selected */}
                        {isServer && isSelected && (
                          <View style={styles.salesInputRow}>
                            <Text style={styles.salesInputLabel}>Sales ($)</Text>
                            <TextInput
                              style={styles.salesInput}
                              placeholder="0.00"
                              placeholderTextColor={MUTED}
                              value={modalSales[s.id] ?? ''}
                              onChangeText={(v) => updateModalSales(s.id, v)}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Save */}
              <Pressable
                style={[styles.modalSaveBtn, creatingShift && styles.payoutBtnDisabled]}
                onPress={handleCreateShift}
                disabled={creatingShift}>
                {creatingShift ? (
                  <ActivityIndicator color={BG} />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Create Shift</Text>
                )}
              </Pressable>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  successBanner: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    zIndex: 100,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successBannerText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  pushLabourBanner: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    zIndex: 100,
    backgroundColor: '#0f1f2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  pushLabourBannerText: { color: BLUE, fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 20 },
  contentDesktop: { paddingHorizontal: 32 },

  // Desktop two-pane layout
  desktopPanes: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
  },
  desktopFormPane: {
    flex: 1,
    gap: 20,
  },
  desktopResultsPane: {
    width: 380,
    flexShrink: 0,
  },

  // Desktop server table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0e1a14',
    gap: 8,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  desktopServerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tableInput: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },

  // Header
  header: { gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: MUTED },

  // New Shift button
  newShiftBtn: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  newShiftBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff', letterSpacing: 0.1 },

  // Pending shifts
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  pendingInfo: { flex: 1, gap: 3 },
  pendingName: { fontSize: 15, fontWeight: '700', color: WHITE },
  pendingMeta: { fontSize: 12, color: MUTED },
  loadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#0e1a14',
  },
  loadBtnActive: {
    backgroundColor: BLUE_DIM,
    borderColor: BLUE_BORDER,
  },
  loadBtnText: { fontSize: 13, fontWeight: '700', color: MUTED },
  loadBtnTextActive: { color: BLUE },

  // Loaded banner
  loadedBanner: {
    backgroundColor: BLUE_DIM,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  loadedBannerText: { fontSize: 13, fontWeight: '600', color: BLUE, lineHeight: 18 },

  // Card
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardSubtitle: {
    fontSize: 12,
    color: MUTED,
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: -8,
  },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },

  // Tip-out rule row
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 8,
  },
  ruleRole: { fontSize: 14, fontWeight: '600', color: WHITE, flex: 1 },
  rulePct: { fontSize: 13, color: MUTED },
  ruleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTeal: { backgroundColor: 'rgba(65, 105, 225, 0.12)' },
  badgeAmber: { backgroundColor: 'rgba(245,158,11,0.12)' },
  ruleBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  badgeTealText: { color: BLUE },
  badgeAmberText: { color: AMBER },

  // Field row (shift details)
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: WHITE, flex: 1 },
  textInput: {
    fontSize: 15,
    fontWeight: '600',
    color: BLUE,
    textAlign: 'right',
    minWidth: 100,
    padding: 0,
  },

  // Server block
  serverBlock: { paddingHorizontal: 16, paddingVertical: 12 },
  mutedBlock: { opacity: 0.45 },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  serverInputs: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  smallInput: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'center',
  },

  // Support staff row
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  staffInfo: { flex: 1, gap: 2 },
  staffName: { fontSize: 15, fontWeight: '700', color: WHITE },
  staffRole: { fontSize: 12, color: MUTED, fontWeight: '500' },
  hoursInput: {
    fontSize: 15,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 56,
    textAlign: 'center',
  },
  hoursInputDisabled: { color: MUTED },
  emptyText: { fontSize: 14, color: MUTED, paddingHorizontal: 16, paddingVertical: 20, textAlign: 'center', lineHeight: 20 },

  // Push labour badge
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  staffRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  pushBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: BLUE,
    backgroundColor: BLUE_DIM,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  pushBadgeSmall: {
    fontSize: 8,
    fontWeight: '800',
    color: BLUE,
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  smallInputPush: { borderColor: BLUE_BORDER },
  hoursInputPush: { borderColor: BLUE_BORDER },
  tableInputPush: { borderColor: BLUE_BORDER },

  // Calculate button
  calcBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  calcBtnText: { fontSize: 17, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  // Results
  resultsSection: { gap: 2 },
  resultsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  resultCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  resultCardBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  resultName: { fontSize: 16, fontWeight: '700', color: WHITE },
  resultAmount: { fontSize: 22, fontWeight: '800', color: BLUE, letterSpacing: -0.5 },
  resultMeta: { fontSize: 12, color: MUTED, marginBottom: 6 },
  tipOutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  tipOutLabel: { fontSize: 12, color: MUTED },
  tipOutAmount: { fontSize: 12, fontWeight: '600', color: AMBER },

  // Totals row
  totalRow: {
    backgroundColor: BLUE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(65, 105, 225, 0.25)',
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: BLUE },
  totalSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  totalAmount: { fontSize: 18, fontWeight: '800', color: BLUE },

  // Pool card
  poolCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 14,
    paddingVertical: 4,
  },
  poolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  poolCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  poolCardTotal: { fontSize: 15, fontWeight: '800', color: AMBER },
  poolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  poolName: { fontSize: 14, fontWeight: '600', color: WHITE },
  poolMeta: { fontSize: 11, color: MUTED, marginTop: 2 },
  poolAmount: { fontSize: 16, fontWeight: '800', color: BLUE },

  // Save button
  payoutBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payoutBtnDisabled: { opacity: 0.6 },
  payoutBtnText: { fontSize: 17, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  // ── New Shift Modal ────────────────────────────────────────────────────────
  modalSafe: { flex: 1, backgroundColor: BG },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 20 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 24, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 13, color: MUTED, marginTop: -12, lineHeight: 18 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: MUTED, fontWeight: '700' },

  modalCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  modalCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  modalCardCount: {
    fontSize: 13,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 0,
    textTransform: 'none',
  },
  modalDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  modalField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalFieldLabel: { fontSize: 15, fontWeight: '600', color: WHITE, flex: 1 },
  modalTextInput: {
    fontSize: 15,
    fontWeight: '600',
    color: BLUE,
    textAlign: 'right',
    minWidth: 100,
    padding: 0,
  },

  // Staff select rows in modal
  staffSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  staffSelectRowActive: {
    backgroundColor: 'rgba(65, 105, 225, 0.05)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#0e1a14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  checkmark: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  staffSelectInfo: { flex: 1, gap: 2 },
  staffSelectName: { fontSize: 15, fontWeight: '600', color: MUTED },
  staffSelectRole: { fontSize: 12, color: MUTED },

  // Sales input within modal
  salesInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 0,
    marginTop: -6,
  },
  salesInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingLeft: 34,
  },
  salesInput: {
    fontSize: 15,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: '#0e1a14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 90,
    textAlign: 'right',
  },

  modalSaveBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalSaveBtnText: { fontSize: 17, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },
});
