const BASE_URL = 'https://api.pushoperations.com/platform/api/v1';
const TIMEOUT_MS = 15_000;

function getAuthHeader(): Record<string, string> {
  const token = Deno.env.get('PUSH_PASSWORD') ?? '';
  console.log('[push] getAuthHeader — token present:', !!token);
  return { 'Authorization': `Bearer ${token}` };
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  console.log('[push] fetch →', init?.method ?? 'GET', url);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Push Operations request timed out after ${TIMEOUT_MS}ms: ${init?.method ?? 'GET'} ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getEmployees(companyId: number): Promise<Record<string, unknown>[]> {
  const url = `${BASE_URL}/employees?company=${companyId}&include=positions,location`;
  const res = await timedFetch(url, {
    headers: {
      ...getAuthHeader(),
      'Accept': 'application/json',
    },
  });

  const rawText = await res.text();
  console.log('[push] getEmployees status:', res.status, 'companyId:', companyId);
  console.log('[push] getEmployees raw response (first 1000):', rawText.slice(0, 1000));

  if (!res.ok) {
    throw new Error(`Push Operations getEmployees failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  console.log('[push] getEmployees top-level keys:', Array.isArray(result) ? '[array]' : Object.keys(result).join(', '));

  // Defensive: handle both array and wrapped response shapes
  const employees: Record<string, unknown>[] = Array.isArray(result)
    ? result
    : (result.data ?? result.employees ?? result.results ?? []);

  console.log('[push] getEmployees resolved', employees.length, 'employees');
  employees.slice(0, 3).forEach((e, i) => {
    console.log(`[push] employee[${i}] keys:`, Object.keys(e).join(', '));
    console.log(`[push] employee[${i}] id:`, e.id ?? e.employee_id, 'name:', e.first_name ?? e.name, e.last_name ?? '', 'email:', e.email, 'status:', e.status ?? e.employee_status);
  });

  return employees;
}

export async function findRecentActivityDates(companyId: number): Promise<string[]> {
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 400;
  const OVERALL_DEADLINE_MS = 45_000;

  const startTime = Date.now();
  const today = new Date();
  const dates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d.toISOString().split('T')[0];
  });

  console.log('[push] findRecentActivityDates — START companyId:', companyId, '| checking:', dates.join(', '));

  const active: string[] = [];

  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const elapsed = Date.now() - startTime;
    if (elapsed > OVERALL_DEADLINE_MS) {
      console.warn('[push] findRecentActivityDates — deadline reached after', elapsed, 'ms; returning partial results');
      break;
    }

    const batch = dates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log('[push] findRecentActivityDates — batch', batchNum, 'start:', batch.join(', '), '| elapsed:', elapsed, 'ms');

    const results = await Promise.allSettled(
      batch.map(async (date) => {
        try {
          const records = await getLabourActuals(companyId, date, date);
          const hasData = records.length > 0;
          console.log('[push] findRecentActivityDates —', date, '→', hasData ? `${records.length} records FOUND` : 'no data');
          return hasData ? date : null;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[push] findRecentActivityDates —', date, '→ error:', msg);
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) active.push(r.value);
    }

    console.log('[push] findRecentActivityDates — batch', batchNum, 'done | active so far:', active.join(', ') || '(none)');

    if (i + BATCH_SIZE < dates.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log('[push] findRecentActivityDates — END elapsed:', Date.now() - startTime, 'ms | active dates:', active.join(', ') || '(none)');
  return active;
}

export async function getLabourActuals(
  companyId: number,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const url = `${BASE_URL}/analytics/summary/labour-actuals?company=${companyId}&start=${startDate}&end=${endDate}`;
  const res = await timedFetch(url, {
    headers: {
      ...getAuthHeader(),
      'Accept': 'application/json',
    },
  });

  const rawText = await res.text();
  console.log('[push] getLabourActuals status:', res.status, 'companyId:', companyId, 'start:', startDate, 'end:', endDate);
  console.log('[push] getLabourActuals full raw response:', rawText);

  if (!res.ok) {
    throw new Error(`Push Operations getLabourActuals failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  console.log('[push] getLabourActuals top-level keys:', Array.isArray(result) ? '[array]' : Object.keys(result).join(', '));

  // Response shape: { data: { companyId, totalCosts, totalHours, labourActualByDate: [...] } }
  // Each entry in labourActualByDate is a DEPARTMENT-LEVEL aggregate (departmentId, departmentName,
  // costs, hours) — NOT per-employee. Individual staff hours are not available from this endpoint.
  const labourByDate = (result?.data as Record<string, unknown> | null)?.labourActualByDate;

  if (!Array.isArray(labourByDate)) {
    console.warn('[push] getLabourActuals — labourActualByDate not found or not an array; returning empty. data keys:', Object.keys((result?.data ?? {}) as object).join(', '));
    return [];
  }

  const records = labourByDate as Record<string, unknown>[];
  console.log('[push] getLabourActuals resolved', records.length, 'department records');
  records.slice(0, 3).forEach((r, i) => {
    console.log(`[push] labour[${i}]:`, JSON.stringify(r));
  });

  return records;
}
