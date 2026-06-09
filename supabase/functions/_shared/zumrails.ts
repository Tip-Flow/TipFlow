// Zum Rails sandbox API client
// Base URL: https://api-sandbox.zumrails.com  (sandbox — never use production URL here)
const BASE = 'https://api-sandbox.zumrails.com';

let cachedToken = '';
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    console.log('[zumrails] using cached token (expires in', Math.round((tokenExpiresAt - Date.now()) / 1000), 's)');
    return cachedToken;
  }

  const username = Deno.env.get('ZUMRAILS_USERNAME') ?? '';
  const password = Deno.env.get('ZUMRAILS_PASSWORD') ?? '';
  console.log('[zumrails] getToken — username present:', !!username, '| password present:', !!password);
  console.log('[zumrails] POST', `${BASE}/api/authorize`);

  const res = await fetch(`${BASE}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Password: password }),
  });

  console.log('[zumrails] authorize status:', res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error('[zumrails] authorize failed — body:', body);
    throw new Error(`Zum Rails auth failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  cachedToken = json.token ?? json.Token ?? '';
  if (!cachedToken) {
    console.error('[zumrails] authorize response keys:', Object.keys(json).join(', '));
    throw new Error('Zum Rails auth returned no token');
  }
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  console.log('[zumrails] token acquired, expires in 55 min');
  return cachedToken;
}

async function headers(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getToken()}`,
    'Content-Type': 'application/json',
  };
}

export async function createUser(params: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const payload = { FirstName: params.firstName, LastName: params.lastName, Email: params.email };
  console.log('[zumrails] POST', `${BASE}/api/user`, '| payload:', JSON.stringify(payload));

  const res = await fetch(`${BASE}/api/user`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(payload),
  });

  console.log('[zumrails] createUser status:', res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error('[zumrails] createUser failed — body:', body);
    throw new Error(`Zum Rails createUser failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  console.log('[zumrails] createUser response keys:', Object.keys(json).join(', '));
  const id = json.id ?? json.Id ?? json.data?.id ?? json.Data?.Id;
  if (!id) {
    console.error('[zumrails] createUser — no id in response:', JSON.stringify(json).slice(0, 500));
    throw new Error('Zum Rails createUser returned no id');
  }
  console.log('[zumrails] createUser success — id:', id);
  return id;
}

export async function createTransaction(params: {
  userId: string;
  amountCents: number;
  memo?: string;
}): Promise<string> {
  const amountDollars = parseFloat((params.amountCents / 100).toFixed(2));
  const payload = {
    ZumRailsType: 'IntraTransaction',
    TransactionType: 'Credit',
    Amount: amountDollars,
    UserId: params.userId,
    Memo: params.memo ?? 'Mise tip payout',
  };
  console.log('[zumrails] POST', `${BASE}/api/transaction`, '| payload:', JSON.stringify(payload));

  const res = await fetch(`${BASE}/api/transaction`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(payload),
  });

  console.log('[zumrails] createTransaction status:', res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error('[zumrails] createTransaction failed — body:', body);
    throw new Error(`Zum Rails createTransaction failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  console.log('[zumrails] createTransaction response keys:', Object.keys(json).join(', '));
  const id = json.id ?? json.Id ?? json.data?.id ?? json.Data?.Id;
  if (!id) {
    console.error('[zumrails] createTransaction — no id in response:', JSON.stringify(json).slice(0, 500));
    throw new Error('Zum Rails createTransaction returned no id');
  }
  console.log('[zumrails] createTransaction success — id:', id);
  return id;
}

export async function getTransaction(id: string): Promise<{ id: string; status: string }> {
  console.log('[zumrails] GET', `${BASE}/api/transaction/${id}`);
  const res = await fetch(`${BASE}/api/transaction/${id}`, { headers: await headers() });

  console.log('[zumrails] getTransaction status:', res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error('[zumrails] getTransaction failed — body:', body);
    throw new Error(`Zum Rails getTransaction failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return { id: json.id ?? json.Id, status: json.status ?? json.Status ?? 'unknown' };
}
