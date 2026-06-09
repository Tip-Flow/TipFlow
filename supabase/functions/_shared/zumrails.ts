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
  const token: string = result.Token ?? result.token ?? '';
  console.log('[zumrails] token length:', token.length);
  if (!token) {
    throw new Error(`Zum Rails returned no token — keys: ${Object.keys(result).join(', ')}`);
  }
  return token;
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
  const id: string = result.Id ?? result.id ?? result.data?.Id ?? result.data?.id ?? '';
  if (!id) {
    throw new Error(`Zum Rails createUser returned no id — keys: ${Object.keys(result).join(', ')}`);
  }
  console.log('[zumrails] createUser success id:', id);
  return id;
}

export async function createTransaction(params: {
  userId: string;
  amountCents: number;
  memo?: string;
}): Promise<string> {
  const token = await getToken();
  const payload = {
    ZumRailsType: 'IntraTransaction',
    TransactionType: 'Credit',
    Amount: parseFloat((params.amountCents / 100).toFixed(2)),
    UserId: params.userId,
    Memo: params.memo ?? 'Mise tip payout',
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
  console.log('[zumrails] createTransaction response:', rawText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Zum Rails createTransaction failed (${res.status}): ${rawText}`);
  }

  const result = JSON.parse(rawText);
  const id: string = result.Id ?? result.id ?? result.data?.Id ?? result.data?.id ?? '';
  if (!id) {
    throw new Error(`Zum Rails createTransaction returned no id — keys: ${Object.keys(result).join(', ')}`);
  }
  console.log('[zumrails] createTransaction success id:', id);
  return id;
}
