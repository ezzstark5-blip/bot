import http from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { logError, logInfo } from '../logs/logger.js';
import { handleStormPaymentWebhook } from './handler.js';

function verifyStormSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureHeader), 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function getStormWebhookPath() {
  return process.env.STORM_WEBHOOK_PATH || '/webhooks/storm/payments';
}

/**
 * Processa request Storm no servidor HTTP principal (Render usa 1 porta).
 * @returns {Promise<boolean>} true se a rota foi tratada
 */
export async function handleStormRequest(req, res) {
  const secret = process.env.STORM_WEBHOOK_SECRET || '';
  const stormPath = getStormWebhookPath();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname !== stormPath) return false;

  if (!secret) {
    sendJson(res, 503, { success: false, error: 'storm webhook disabled' });
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'method not allowed' });
    return true;
  }

  try {
    const rawBuf = await readRawBody(req);
    const rawBody = rawBuf.toString('utf8');
    const signature = req.headers['x-storm-signature'];
    const eventHeader = req.headers['x-storm-event'];

    if (!verifyStormSignature(rawBody, signature, secret)) {
      logError({ event: 'STORM_WEBHOOK_BAD_SIGNATURE' });
      sendJson(res, 401, { success: false, error: 'invalid signature' });
      return true;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { success: false, error: 'invalid json' });
      return true;
    }

    const event = payload.event || eventHeader;
    const data = payload.data || {};

    sendJson(res, 200, { success: true });

    handleStormPaymentWebhook({ event, data, createdAt: payload.createdAt }).catch((err) => {
      logError({ event: 'STORM_WEBHOOK_HANDLE_FAIL', message: err.message });
    });
  } catch (err) {
    logError({ event: 'STORM_WEBHOOK_SERVER_ERROR', message: err.message });
    if (!res.headersSent) {
      sendJson(res, 500, { success: false, error: 'internal' });
    }
  }

  return true;
}

/**
 * No Render (PORT definido) o Storm fica no servidor principal.
 * Em local, se STORM_WEBHOOK_PORT for diferente, sobe servidor separado (legado).
 */
export function startStormWebhookServer() {
  const secret = process.env.STORM_WEBHOOK_SECRET || '';
  const path = getStormWebhookPath();

  if (!secret) {
    console.warn('⚠️ STORM_WEBHOOK_SECRET não definido — webhook desabilitado.');
    return null;
  }

  // Render / 1 porta: tratado em startAuthServer via handleStormRequest
  if (process.env.PORT) {
    console.log(`💳 Storm webhook na porta do Render → ${path}`);
    logInfo({ event: 'STORM_WEBHOOK_SHARED_PORT', path });
    return null;
  }

  const port = Number(process.env.STORM_WEBHOOK_PORT || 3847);
  const mainPort = Number(process.env.AUTH_PORT || 3850);
  if (port === mainPort) {
    console.log(`💳 Storm webhook compartilhado com auth → http://0.0.0.0:${port}${path}`);
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
        sendJson(res, 200, { ok: true, service: 'storm-webhook' });
        return;
      }

      const handled = await handleStormRequest(req, res);
      if (!handled) {
        sendJson(res, 404, { success: false, error: 'not found' });
      }
    } catch (err) {
      logError({ event: 'STORM_WEBHOOK_SERVER_ERROR', message: err.message });
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, error: 'internal' });
      }
    }
  });

  server.listen(port, () => {
    console.log(`💳 Storm webhook em http://0.0.0.0:${port}${path}`);
    logInfo({ event: 'STORM_WEBHOOK_LISTENING', port, path });
  });

  server.on('error', (err) => {
    logError({ event: 'STORM_WEBHOOK_LISTEN_FAIL', message: err.message });
  });

  return server;
}
