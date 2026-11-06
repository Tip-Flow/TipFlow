const BASE_URL = 'https://api-sandbox.zumrails.com';
const TIMEOUT_MS = 10_000;

// Logging rule for this file: status codes, IDs and amounts only.
// Never log tokens, raw API responses, names, emails or bank details.

// Wraps fetch with a hard 10-second timeout. Throws a clear error on hang.
async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  console.log('[zumrails] fetch →', init?.method ?? 'GET', url);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Zum Rails request timed out after ${TIMEOUT_MS}ms: ${init?.method ?? 'GET'} ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Safe error: status code plus Zum Rails' short message, never the raw body.
function zrError(label: string, status: number, rawText: string): Error {
  let detail = '';
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.message ?? parsed?.Message ?? '';
    if (typeof msg === 'string') detail = msg.slice(0, 200);
  } catch { /* not JSON, leave detail empty */ }
  return new Error(`Zum Rails ${label} failed (${status})${detail ? `: ${detail}` : ''}`);
}

// deno-lint-ignore no-explicit-any
function parseJson(label: string, rawText: string): any {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Zum Rails ${label} returned an unreadable response`);
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function getToken(): Promise<string> {
  const username = Deno.env.get('ZUMRAILS_USERNAME') ?? '';
  const password = Deno.env.get('ZUMRAILS_PASSWORD') ?? '';
  if (!username || !password) throw new Error('Zum Rails credentials are not configured');

  const res = await timedFetch(`${BASE_URL}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Password: password }),
  });
  const rawText = await res.text();
  console.log('[zumrails] authorize status:', res.status);
  if (!res.ok) throw zrError('authorize', res.status, rawText);

  const result = parseJson('authorize', rawText);
  const token: string = result.result?.Token ?? result.result?.token ?? '';
  if (!token) throw new Error('Zum Rails authorize returned no token');
  return token;
}

// Returns the first wallet on the account.
// deno-lint-ignore no-explicit-any
async function fetchFirstWallet(token: string): Promise<any> {
  const res = await timedFetch(`${BASE_URL}/api/wallet`, { headers: authHeaders(token) });
  const rawText = await res.text();
  console.log('[zumrails] getWallet status:', res.status);
  if (!res.ok) throw zrError('getWallet', res.status, rawText);

  const result = parseJson('getWallet', rawText);
  const wallets = Array.isArray(result.result) ? result.result : [result.result];
  return wallets[0];
}

// Wallet used as the source for payouts and the destination for top-ups.
async function getWalletId(token: string): Promise<string> {
  const envWalletId = Deno.env.get('ZUMRAILS_WALLET_ID') ?? '';
  if (envWalletId) return envWalletId;

  const wallet = await fetchFirstWallet(token);
  const walletId: string = wallet?.Id ?? wallet?.id ?? '';
  if (!walletId) throw new Error('Zum Rails getWallet returned no wallet id');

  const balance = wallet?.Balance ?? wallet?.balance ?? wallet?.AvailableBalance;
  if (balance === 0 || balance === '0' || balance === '0.00') {
    console.warn('[zumrails] WARNING: wallet balance is 0, payouts may fail');
  }
  return walletId;
}

export async function getWalletBalance(): Promise<{ walletId: string; balance: number }> {
  const token = await getToken();
  const wallet = await fetchFirstWallet(token);
  const envWalletId = Deno.env.get('ZUMRAILS_WALLET_ID') ?? '';
  const walletId: string = envWalletId || (wallet?.Id ?? wallet?.id ?? '');
  const balance = parseFloat(String(wallet?.Balance ?? wallet?.balance ?? wallet?.AvailableBalance ?? '0')) || 0;
  return { walletId, balance };
}

// Finds the bank account for ONE Zum Rails customer.
// Never falls back to another customer's account: if none is found, it fails.
export async function getFundingSources(userId: string): Promise<string> {
  const token = await getToken();
  const res = await timedFetch(`${BASE_URL}/api/fundingsource/filter`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ CustomerId: userId, BillingAccount: false, ItemsPerPage: 10, PageNumber: 1 }),
  });
  const rawText = await res.text();
  console.log('[zumrails] getFundingSources status:', res.status);
  if (!res.ok) throw zrError('getFundingSources', res.status, rawText);

  const result = parseJson('getFundingSources', rawText);
  const items: Record<string, unknown>[] = result.result?.Items ?? [];
  const bankAccount = items.find((i) => i.FundingSourceType === 'BankAccount') ?? items[0];
  const fundingSourceId = bankAccount?.Id ? String(bankAccount.Id) : '';
  if (!fundingSourceId) {
    throw new Error('No bank account found for this customer in Zum Rails');
  }
  console.log('[zumrails] getFundingSources resolved fundingSourceId:', fundingSourceId);
  return fundingSourceId;
}

export async function fundWallet(params: {
  userId: string;
  amountDollars: number;
  memo?: string;
}): Promise<string> {
  const token = await getToken();
  const walletId = await getWalletId(token);
  const amount = parseFloat(params.amountDollars.toFixed(2));

  console.log('[zumrails] fundWallet sending — amount:', amount);
  const res = await timedFetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      ZumRailsType: 'AccountsReceivable',
      TransactionMethod: 'Eft',
      Amount: amount,
      UserId: params.userId,
      WalletId: walletId,
      Memo: params.memo ?? 'Wallet-Top-Up',
      Comment: 'Mise wallet funding',
    }),
  });
  const rawText = await res.text();
  console.log('[zumrails] fundWallet status:', res.status);
  if (!res.ok) throw zrError('fundWallet', res.status, rawText);

  const result = parseJson('fundWallet', rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) throw new Error('Zum Rails fundWallet returned no transaction id');
  console.log('[zumrails] fundWallet success transaction id:', id);
  return id;
}

export async function createUser(params: {
  firstName: string;
  lastName: string;
  email: string;
  institutionNumber?: string;
  transitNumber?: string;
  accountNumber?: string;
}): Promise<string> {
  const token = await getToken();
  const payload: Record<string, unknown> = {
    FirstName: params.firstName,
    LastName: params.lastName,
    Email: params.email,
    CustomerType: 'individual',
  };
  const hasBank = !!(params.institutionNumber && params.transitNumber && params.accountNumber);
  if (hasBank) {
    payload.BankAccountInformation = {
      InstitutionNumber: params.institutionNumber,
      TransitNumber: params.transitNumber,
      AccountNumber: params.accountNumber,
    };
  }
  console.log('[zumrails] createUser sending — bank info included:', hasBank);

  const res = await timedFetch(`${BASE_URL}/api/user`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  console.log('[zumrails] createUser status:', res.status);
  if (!res.ok) throw zrError('createUser', res.status, rawText);

  const result = parseJson('createUser', rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) throw new Error('Zum Rails createUser returned no id');
  console.log('[zumrails] createUser success id:', id);
  return id;
}

export async function createConnectToken(params: {
  userId?: string;
}): Promise<string> {
  const apiToken = await getToken();
  const payload: Record<string, unknown> = {
    ConnectTokenType: 'AddPaymentProfile',
    Configuration: {
      allowEft: true,
      allowInterac: false,
      allowVisaDirect: false,
      allowCreditCard: false,
    },
  };
  if (params.userId) payload.UserId = params.userId;

  const res = await timedFetch(`${BASE_URL}/api/connect/createtoken`, {
    method: 'POST',
    headers: authHeaders(apiToken),
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  console.log('[zumrails] createConnectToken status:', res.status);
  if (!res.ok) throw zrError('createConnectToken', res.status, rawText);

  const result = parseJson('createConnectToken', rawText);
  const token: string = result.result?.Token ?? result.result?.token ?? '';
  if (!token) throw new Error('Zum Rails createConnectToken returned no token');
  return token;
}

export async function createTransaction(params: {
  userId: string;
  amountCents: number;
  memo?: string;
  comment?: string;
}): Promise<string> {
  const token = await getToken();
  const walletId = await getWalletId(token);
  const amount = parseFloat((params.amountCents / 100).toFixed(2));

  console.log('[zumrails] createTransaction sending — amount cents:', params.amountCents);
  const res = await timedFetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      ZumRailsType: 'AccountsPayable',
      TransactionMethod: 'Eft',
      Amount: amount,
      UserId: params.userId,
      WalletId: walletId,
      Memo: params.memo ?? 'Mise tip payout',
      Comment: params.comment ?? 'Mise tip payout',
    }),
  });
  const rawText = await res.text();
  console.log('[zumrails] createTransaction status:', res.status);
  if (!res.ok) throw zrError('createTransaction', res.status, rawText);

  const result = parseJson('createTransaction', rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) throw new Error('Zum Rails createTransaction returned no id');
  console.log('[zumrails] createTransaction success id:', id);
  return id;
}