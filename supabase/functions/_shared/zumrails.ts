const BASE = 'https://gateway.sandbox.zumrails.com';

let cachedToken = '';
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`${BASE}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Username: Deno.env.get('ZUMRAILS_USERNAME') ?? '',
      Password: Deno.env.get('ZUMRAILS_PASSWORD') ?? '',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zum Rails auth failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  cachedToken = json.token ?? json.Token ?? '';
  if (!cachedToken) throw new Error('Zum Rails auth returned no token');
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
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
  const res = await fetch(`${BASE}/api/user`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      FirstName: params.firstName,
      LastName: params.lastName,
      Email: params.email,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zum Rails createUser failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  const id = json.id ?? json.Id ?? json.data?.id;
  if (!id) throw new Error('Zum Rails createUser returned no id');
  return id;
}

export async function createTransaction(params: {
  userId: string;
  amountCents: number;
  memo?: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/api/transaction`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      ZumRailsType: 'IntraTransaction',
      TransactionType: 'Credit',
      Amount: parseFloat((params.amountCents / 100).toFixed(2)),
      UserId: params.userId,
      Memo: params.memo ?? 'Mise tip payout',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zum Rails createTransaction failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  const id = json.id ?? json.Id ?? json.data?.id;
  if (!id) throw new Error('Zum Rails createTransaction returned no id');
  return id;
}

export async function getTransaction(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${BASE}/api/transaction/${id}`, {
    headers: await headers(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zum Rails getTransaction failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return { id: json.id ?? json.Id, status: json.status ?? json.Status ?? 'unknown' };
}
