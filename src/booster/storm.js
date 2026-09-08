import { loadBoosterConfig } from './config.js';

function headers(apiKey, extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    ...extra,
  };
}

async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
  const { apiKey, baseUrl } = loadBoosterConfig();
  if (!apiKey) {
    throw new Error('STORM_WALLET_API_KEY não configurada no .env');
  }

  const extra = {};
  if (idempotencyKey) {
    extra['Idempotency-Key'] = String(idempotencyKey);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: headers(apiKey, extra),
    body: body ? JSON.stringify(body) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Resposta inválida da Storm Wallet (HTTP ${res.status})`);
  }

  if (!json.success) {
    const details = json.details ? ` — ${JSON.stringify(json.details)}` : '';
    const err = new Error(json.error || `Erro Storm Wallet (HTTP ${res.status})${details}`);
    err.status = res.status;
    err.details = json.details;
    throw err;
  }

  return json.data;
}

export async function validateAccount() {
  return request('/api/v1/account');
}

export async function createPayment({
  amount,
  payerName,
  payerDocument,
  description,
  externalId,
  metadata,
}) {
  return request('/api/v1/payments/create', {
    method: 'POST',
    idempotencyKey: externalId,
    body: {
      amount,
      payerName,
      payerDocument,
      description,
      externalId,
      metadata,
    },
  });
}

export async function getPayment(id) {
  return request(`/api/v1/payments/${encodeURIComponent(id)}`);
}

export async function listPayments(query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return request(`/api/v1/payments${qs ? `?${qs}` : ''}`);
}
