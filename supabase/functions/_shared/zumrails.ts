// Zum Rails sandbox API client
// Base URL: https://api-sandbox.zumrails.com  (sandbox — never use production URL here)
const BASE = 'https://api-sandbox.zumrails.com';

// Token cache disabled for debugging — fetching fresh token on every call
async function getToken(): Promise<string> {
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
  console.log('[zumrails] authorize response keys:', Object.keys(json).join(', '));
  console.log('[zumrails] authorize response (token redacted):', JSON.stringify(
    Object.fromEntries(Object.entries(json).map(([k, v]) =>
      [k, typeof v === 'string' && v.length > 8 ? v.slice(0, 4) + '...(len=' + (v as string).length + ')' : v]
    ))
  ).slice(0, 500));

  const token: string =
    json.token ??
    json.Token ??
    json.accessToken ??
    json.AccessToken ??
    json.access_token ??
    json.result ??
    json.Result ??
    json.data?.token ??
    json.data?.Token ??
    json.Data?.token ??
    json.Data?.Token ??
    '';

  console.log('[zumrails] token length:', token.length);

  if (!token) {
    console.error('[zumrails] authorize — could not find token. Full body:', JSON.stringify(json).slice(0, 1000));
    throw new Error(`Zum Rails auth returned no token — response keys: ${Object.keys(json).join(', ')}`);
  }

  return token;
}

export async function createUser(params: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const token = await getToken();
  console.log('[zumrails] createUser — token length:', token.length);

  const payload = {
    FirstName: params.firstName,
    LastName: params.lastName,
    Email: params.email,
    CustomerType: 'individual',
  };
  console.log('[zumrails] POST', `${BASE}/api/user`, '| payload:', JSON.stringify(payload));

  // Try primary header format: Authorization: Bearer <token>
  const res = await fetch(`${BASE}/api/user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Some APIs also accept a bare token header — include both
      'token': token,
    },
    body: JSON.stringify(payload),
  });

  console.log('[zumrails] createUser status:', res.status);
  const resText = await res.text();
  console.log('[zumrails] createUser response body:', resText.slice(0, 1000));

  if (!res.ok) {
    throw new Error(`Zum Rails createUser failed (${res.status}): ${resText}`);
  }

  const json = JSON.parse(resText);
  const id = json.id ?? json.Id ?? json.data?.id ?? json.Data?.Id;
  if (!id) {
    console.error('[zumrails] createUser — no id in response. Keys:', Object.keys(json).join(', '));
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
  const token = await getToken();
  console.log('[zumrails] createTransaction — token length:', token.length);

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
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'token': token,
    },
    body: JSON.stringify(payload),
  });

  console.log('[zumrails] createTransaction status:', res.status);
  const resText = await res.text();
  console.log('[zumrails] createTransaction response body:', resText.slice(0, 1000));

  if (!res.ok) {
    throw new Error(`Zum Rails createTransaction failed (${res.status}): ${resText}`);
  }

  const json = JSON.parse(resText);
  const id = json.id ?? json.Id ?? json.data?.id ?? json.Data?.Id;
  if (!id) {
    console.error('[zumrails] createTransaction — no id in response. Keys:', Object.keys(json).join(', '));
    throw new Error('Zum Rails createTransaction returned no id');
  }
  console.log('[zumrails] createTransaction success — id:', id);
  return id;
}

export async function getTransaction(id: string): Promise<{ id: string; status: string }> {
  const token = await getToken();
  console.log('[zumrails] getTransaction — token length:', token.length);
  console.log('[zumrails] GET', `${BASE}/api/transaction/${id}`);

  const res = await fetch(`${BASE}/api/transaction/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'token': token,
    },
  });

  console.log('[zumrails] getTransaction status:', res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error('[zumrails] getTransaction failed — body:', body);
    throw new Error(`Zum Rails getTransaction failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return { id: json.id ?? json.Id, status: json.status ?? json.Status ?? 'unknown' };
}
