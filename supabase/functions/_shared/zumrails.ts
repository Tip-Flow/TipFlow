const BASE_URL = 'https://api-sandbox.zumrails.com';
const TIMEOUT_MS = 10_000;

// Wraps fetch with a hard 10-second timeout. Throws a clear error on hang.
async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  console.log('[zumrails] fetch →', init?.method ?? 'GET', url);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Zum Rails request timed out after ${TIMEOUT_MS}ms: ${init?.method ?? 'GET'} ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(): Promise<string> {
  const username = Deno.env.get('ZUMRAILS_USERNAME') ?? '';
  const password = Deno.env.get('ZUMRAILS_PASSWORD') ?? '';
  console.log('[zumrails] getToken — username present:', !!username, 'password present:', !!password);

  const res = await timedFetch(`${BASE_URL}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Password: password }),
  });

  const rawText = await res.text();
  console.log('[zumrails] authorize status:', res.status);
  console.log('[zumrails] authorize raw response:', rawText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Zum Rails authorize failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  console.log('[zumrails] authorize top-level keys:', Object.keys(result).join(', '));
  console.log('[zumrails] authorize result keys:', result.result ? Object.keys(result.result).join(', ') : 'no result field');
  const token: string = result.result?.Token ?? result.result?.token ?? '';
  console.log('[zumrails] token length:', token.length);
  if (!token) {
    throw new Error(`Zum Rails returned no token — top-level keys: ${Object.keys(result).join(', ')}`);
  }
  return token;
}

// Fetches the first wallet — funding source for AccountsPayable.
// Logs balance so we can catch unfunded sandbox wallets early.
async function getWalletId(token: string): Promise<string> {
  const envWalletId = Deno.env.get('ZUMRAILS_WALLET_ID') ?? '';
  if (envWalletId) {
    console.log('[zumrails] using ZUMRAILS_WALLET_ID from env:', envWalletId);
    return envWalletId;
  }

  console.log('[zumrails] getWalletId — fetching wallet');
  const res = await timedFetch(`${BASE_URL}/api/wallet`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const rawText = await res.text();
  console.log('[zumrails] getWallet status:', res.status);
  console.log('[zumrails] wallet response:', rawText);

  if (!res.ok) {
    throw new Error(`Zum Rails getWallet failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const wallets = Array.isArray(result.result) ? result.result : [result.result];
  const wallet = wallets[0];
  const walletId: string = wallet?.Id ?? wallet?.id ?? '';
  if (!walletId) {
    throw new Error(`Zum Rails getWallet returned no wallet id — result: ${JSON.stringify(result)}`);
  }

  const balance = wallet?.Balance ?? wallet?.balance ?? wallet?.AvailableBalance ?? 'unknown';
  console.log('[zumrails] walletId:', walletId, '| balance:', balance);
  if (balance === 0 || balance === '0' || balance === '0.00') {
    console.warn('[zumrails] WARNING: wallet balance is 0 — AccountsPayable transaction may fail. Fund the sandbox wallet first.');
  }

  return walletId;
}

export async function getWalletBalance(): Promise<{ walletId: string; balance: number }> {
  const token = await getToken();
  const walletId = await getWalletId(token);

  const res = await timedFetch(`${BASE_URL}/api/wallet`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const rawText = await res.text();
  if (!res.ok) throw new Error(`Zum Rails getWallet failed (${res.status}): ${rawText}`);

  const result = JSON.parse(rawText);
  const wallets = Array.isArray(result.result) ? result.result : [result.result];
  const wallet = wallets[0];
  const balance = parseFloat(String(wallet?.Balance ?? wallet?.balance ?? wallet?.AvailableBalance ?? '0')) || 0;
  console.log('[zumrails] getWalletBalance — walletId:', walletId, '| balance:', balance);
  return { walletId, balance };
}

export async function getFundingSources(userId: string): Promise<string> {
  const token = await getToken();

  console.log('[zumrails] getFundingSources — userId:', userId);
  const res = await timedFetch(`${BASE_URL}/api/fundingsource/filter`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ CustomerId: userId, BillingAccount: false, ItemsPerPage: 10, PageNumber: 1 }),
  });

  const rawText = await res.text();
  console.log('[zumrails] getFundingSources status:', res.status);
  console.log('[zumrails] getFundingSources response:', rawText);

  if (!res.ok) {
    throw new Error(`Zum Rails getFundingSources failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  console.log('[zumrails] getFundingSources result:', JSON.stringify(result));

  const items: Record<string, unknown>[] = result.result?.Items ?? [];
  const bankAccount = items.find((i) => i.FundingSourceType === 'BankAccount') ?? items[0];
  const fundingSourceId: string = (bankAccount?.Id as string) ?? '';

  if (!fundingSourceId) {
    throw new Error(`Zum Rails getFundingSources returned no BankAccount funding source — items: ${JSON.stringify(items)}`);
  }

  console.log('[zumrails] getFundingSources resolved fundingSourceId:', fundingSourceId);
  return fundingSourceId;
}

export async function fundWallet(params: {
  fundingSourceId: string;
  amountDollars: number;
  memo?: string;
}): Promise<string> {
  const token = await getToken();
  const walletId = await getWalletId(token);

  const payload = {
    ZumRailsType: 'FundZumWallet',
    TransactionMethod: 'Eft',
    Amount: parseFloat(params.amountDollars.toFixed(2)),
    FundingSourceId: params.fundingSourceId,
    WalletId: walletId,
    Memo: params.memo ?? 'Wallet-Fund',
    Comment: 'Mise wallet top-up from restaurant account',
  };
  console.log('[zumrails] fundWallet payload:', JSON.stringify(payload));

  const res = await timedFetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('[zumrails] fundWallet status:', res.status);
  console.log('[zumrails] fundWallet response:', rawText);

  if (!res.ok) {
    throw new Error(`Zum Rails fundWallet failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) {
    throw new Error(`Zum Rails fundWallet returned no transaction id — result: ${JSON.stringify(result.result ?? {})}`);
  }
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
  if (params.institutionNumber && params.transitNumber && params.accountNumber) {
    payload.BankAccountInformation = {
      InstitutionNumber: params.institutionNumber,
      TransitNumber: params.transitNumber,
      AccountNumber: params.accountNumber,
    };
  }
  console.log('[zumrails] createUser payload:', JSON.stringify(payload));

  let res: Response;
  try {
    res = await timedFetch(`${BASE_URL}/api/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[zumrails] createUser fetch threw:', msg);
    throw err;
  }

  const rawText = await res.text();
  console.log('[zumrails] createUser status:', res.status);
  console.log('[zumrails] createUser response:', rawText);

  if (!res.ok) {
    throw new Error(`Zum Rails createUser failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) {
    throw new Error(`Zum Rails createUser returned no id — result keys: ${result.result ? Object.keys(result.result).join(', ') : 'no result field'}`);
  }
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

  if (params.userId) {
    payload.UserId = params.userId;
  }

  const res = await timedFetch(`${BASE_URL}/api/connect/createtoken`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('[zumrails] createConnectToken status:', res.status);
  console.log('[zumrails] createConnectToken response:', rawText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Zum Rails createConnectToken failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const token: string = result.result?.Token ?? result.result?.token ?? '';
  if (!token) {
    throw new Error(`Zum Rails createConnectToken returned no token — result: ${JSON.stringify(result.result ?? {})}`);
  }

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

  const payload = {
    ZumRailsType: 'AccountsPayable',
    TransactionMethod: 'Eft',
    Amount: parseFloat((params.amountCents / 100).toFixed(2)),
    UserId: params.userId,
    WalletId: walletId,
    Memo: params.memo ?? 'Mise tip payout',
    Comment: params.comment ?? 'Mise tip payout',
  };
  console.log('[zumrails] createTransaction payload:', JSON.stringify(payload));

  const res = await timedFetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('[zumrails] createTransaction status:', res.status);
  console.log('[zumrails] createTransaction response:', rawText);

  if (!res.ok) {
    throw new Error(`Zum Rails createTransaction failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const id: string = result.result?.Id ?? result.result?.id ?? '';
  if (!id) {
    throw new Error(`Zum Rails createTransaction returned no id — result keys: ${result.result ? Object.keys(result.result).join(', ') : 'no result field'}`);
  }
  console.log('[zumrails] createTransaction success id:', id);
  return id;
}
