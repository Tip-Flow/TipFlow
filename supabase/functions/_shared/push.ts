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
  console.log('[push] getLabourActuals parsed result:', JSON.stringify(result).slice(0, 2000));

  // Step 1: unwrap top-level envelope
  let candidate: unknown = Array.isArray(result)
    ? result
    : (result.data ?? result.labour ?? result.actuals ?? result.results ?? result.items ?? null);

  // Step 2: if candidate is still a non-array object, go one level deeper
  if (candidate !== null && !Array.isArray(candidate) && typeof candidate === 'object') {
    const inner = candidate as Record<string, unknown>;
    console.log('[push] getLabourActuals candidate (non-array) keys:', Object.keys(inner).join(', '));
    candidate = inner.records ?? inner.labour ?? inner.actuals ?? inner.items ?? inner.data ?? null;
  }

  if (!Array.isArray(candidate)) {
    console.warn('[push] getLabourActuals — no array found in response; returning empty. Shape:', JSON.stringify(result).slice(0, 500));
    candidate = [];
  }

  const records = candidate as Record<string, unknown>[];
  console.log('[push] getLabourActuals resolved', records.length, 'records');
  records.slice(0, 3).forEach((r, i) => {
    console.log(`[push] labour[${i}] keys:`, Object.keys(r).join(', '));
    console.log(`[push] labour[${i}]:`, JSON.stringify(r));
  });

  return records;
}
