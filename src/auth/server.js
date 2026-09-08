import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { logError, logInfo } from '../logs/logger.js';
import {
  createSession,
  getSession,
  markSessionGranted,
  grantAuthRole,
  signState,
  verifyState,
} from './handler.js';
import { upsertAuthMember } from './store.js';
import { handleStormRequest, getStormWebhookPath } from '../booster/webhook.js';
import { getAuthPublicUrl } from './components.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = join(__dirname, 'public', 'index.html');

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const isJson = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function oauthConfig() {
  const clientId = process.env.AUTH_CLIENT_ID || process.env.APP_ID || '';
  const clientSecret = process.env.AUTH_CLIENT_SECRET || '';
  const publicUrl = getAuthPublicUrl();
  const redirectUri =
    process.env.AUTH_REDIRECT_URI || `${publicUrl}/callback`;
  return { clientId, clientSecret, publicUrl, redirectUri };
}

function avatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const idx = Number(BigInt(user.id) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  if (!clientId || !clientSecret) {
    throw new Error('AUTH_CLIENT_ID ou AUTH_CLIENT_SECRET faltando no .env');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret.trim(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const codeErr = json.error || '';
    if (codeErr === 'invalid_client') {
      throw new Error(
        'Client Secret inválido. No Developer Portal → OAuth2, copie o Client Secret de novo e cole em AUTH_CLIENT_SECRET no .env'
      );
    }
    if (codeErr === 'invalid_grant') {
      throw new Error('Código expirado. Abra o link de autenticação de novo.');
    }
    throw new Error(json.error_description || json.error || 'Falha no token OAuth');
  }
  return json;
}

async function fetchMe(accessToken) {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Falha ao buscar usuário');
  return json;
}

function serveIndex(res) {
  if (!existsSync(INDEX_HTML)) {
    send(res, 500, 'index.html missing');
    return;
  }
  send(res, 200, readFileSync(INDEX_HTML, 'utf8'), {
    'Content-Type': 'text/html; charset=utf-8',
  });
}

/**
 * Site de autenticação Discord OAuth + animação de verificação.
 */
export function startAuthServer() {
  // Render injeta PORT; local usa AUTH_PORT
  const port = Number(process.env.PORT || process.env.AUTH_PORT || 3850);
  const { clientId, clientSecret, publicUrl, redirectUri } = oauthConfig();

  if (!clientId || !clientSecret) {
    console.warn(
      '⚠️ Auth site desabilitado — configure AUTH_CLIENT_ID (ou APP_ID) e AUTH_CLIENT_SECRET no .env'
    );
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      // Storm Wallet no mesmo host (Render só abre 1 porta)
      if (await handleStormRequest(req, res)) return;

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;

      if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
        serveIndex(res);
        return;
      }

      if (req.method === 'GET' && path === '/login') {
        const state = signState({ t: Date.now(), n: Math.random().toString(36).slice(2) });
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'identify guilds.join',
          state,
          prompt: 'none',
        });
        // guilds.join exige consent na primeira vez
        if (url.searchParams.get('force') === '1') {
          params.set('prompt', 'consent');
        } else {
          // Força consent se ainda não temos token com guilds.join (fallback no callback)
          params.set('prompt', 'consent');
        }
        res.writeHead(302, {
          Location: `https://discord.com/api/oauth2/authorize?${params}`,
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && path === '/callback') {
        const err = url.searchParams.get('error');
        if (err) {
          // Sem interação: tenta de novo com consent se prompt=none falhou
          if (err === 'consent_required' || err === 'login_required' || err === 'interaction_required') {
            res.writeHead(302, { Location: '/login?force=1' });
            res.end();
            return;
          }
          res.writeHead(302, {
            Location: `/?error=${encodeURIComponent(err)}`,
          });
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !verifyState(state)) {
          res.writeHead(302, {
            Location: `/?error=${encodeURIComponent('Estado inválido. Tente de novo.')}`,
          });
          res.end();
          return;
        }

        try {
          const token = await exchangeCode(code);
          const user = await fetchMe(token.access_token);

          upsertAuthMember({
            id: user.id,
            username: user.username,
            globalName: user.global_name || user.username,
            avatarUrl: avatarUrl(user),
            accessToken: token.access_token,
            refreshToken: token.refresh_token || null,
            expiresAt: Date.now() + Number(token.expires_in || 604800) * 1000,
            scope: token.scope || 'identify guilds.join',
            authAt: Date.now(),
          });

          const sid = createSession({
            id: user.id,
            username: user.username,
            globalName: user.global_name || user.username,
            avatarUrl: avatarUrl(user),
          });
          logInfo({
            event: 'AUTH_OAUTH_OK',
            userId: user.id,
            username: user.username,
            scopes: token.scope,
          });
          res.writeHead(302, { Location: `/?sid=${sid}` });
          res.end();
        } catch (e) {
          logError({ event: 'AUTH_OAUTH_FAIL', message: e.message });
          res.writeHead(302, {
            Location: `/?error=${encodeURIComponent(e.message)}`,
          });
          res.end();
        }
        return;
      }

      if (req.method === 'GET' && path.startsWith('/api/session/')) {
        const sid = decodeURIComponent(path.slice('/api/session/'.length));
        const session = getSession(sid);
        if (!session) {
          send(res, 404, { ok: false, error: 'Sessão expirada. Faça login de novo.' });
          return;
        }
        send(res, 200, {
          ok: true,
          id: session.id,
          username: session.username,
          globalName: session.globalName,
          avatarUrl: session.avatarUrl,
          granted: session.granted,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/grant') {
        const raw = await readBody(req);
        let body = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          send(res, 400, { ok: false, error: 'JSON inválido' });
          return;
        }
        const session = getSession(body.sid);
        if (!session) {
          send(res, 404, { ok: false, error: 'Sessão expirada' });
          return;
        }
        if (session.granted) {
          send(res, 200, { ok: true, already: true });
          return;
        }
        try {
          const result = await grantAuthRole(session.id);
          markSessionGranted(body.sid);
          send(res, 200, { ok: true, ...result });
        } catch (e) {
          logError({ event: 'AUTH_GRANT_FAIL', userId: session.id, message: e.message });
          send(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === 'GET' && path === '/health') {
        send(res, 200, { ok: true, service: 'auth', publicUrl });
        return;
      }

      send(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      logError({ event: 'AUTH_HTTP_ERROR', message: err.message });
      send(res, 500, { ok: false, error: 'internal error' });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🔐 Auth site em ${publicUrl} (porta ${port})`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Redirect URI (cole EXATO no Developer Portal → OAuth2 → Redirects):`);
    console.log(`   ${redirectUri}`);
    console.log(`   Portal: https://discord.com/developers/applications/${clientId}/oauth2`);
    console.log(`   Storm webhook: ${publicUrl}${getStormWebhookPath()}`);
    logInfo({ event: 'AUTH_SERVER_LISTENING', port, publicUrl, redirectUri, clientId });
  });

  server.on('error', (err) => {
    logError({ event: 'AUTH_SERVER_ERROR', message: err.message });
  });

  return server;
}
