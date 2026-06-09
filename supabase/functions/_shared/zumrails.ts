const BASE_URL = 'https://api-sandbox.zumrails.com';

async function getToken(): Promise<string> {
  const username = Deno.env.get('ZUMRAILS_USERNAME') ?? '';
  const password = Deno.env.get('ZUMRAILS_PASSWORD') ?? '';
  console.log('[zumrails] getToken — username present:', !!username, 'password present:', !!password);

  const res = await fetch(`${BASE_URL}/api/authorize`, {
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

// Fetches the first wallet from the account — used as the funding source for AccountsPayable.
// Result is cached in ZUMRAILS_WALLET_ID env var if set, otherwise fetched dynamically.
async function getWalletId(token: string): Promise<string> {
  const envWalletId = Deno.env.get('ZUMRAILS_WALLET_ID') ?? '';
  if (envWalletId) {
    console.log('[zumrails] using ZUMRAILS_WALLET_ID from env:', envWalletId);
    return envWalletId;
  }

  console.log('[zumrails] getWalletId — fetching wallet');
  const res = await fetch(`${BASE_URL}/api/wallet`, {
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
  const walletId: string = wallets[0]?.Id ?? wallets[0]?.id ?? '';
  if (!walletId) {
    throw new Error(`Zum Rails getWallet returned no wallet id — result: ${JSON.stringify(result)}`);
  }
  console.log('[zumrails] walletId:', walletId);
  return walletId;
}

export async function createUser(params: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const token = await getToken();
  const payload = {
    FirstName: params.firstName,
    LastName: params.lastName,
    Email: params.email,
    CustomerType: 'individual',
  };
  console.log('[zumrails] createUser payload:', JSON.stringify(payload));

  const res = await fetch(`${BASE_URL}/api/user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('[zumrails] createUser status:', res.status);
  console.log('[zumrails] createUser response:', rawText.slice(0, 500));

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

  const res = await fetch(`${BASE_URL}/api/transaction`, {
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
