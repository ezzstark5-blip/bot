require('dotenv').config();
const express = require('express');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();

// -----------------------------------------------------------------
// PORTA: no Shard Cloud, ao contr�rio de Render/Railway/Heroku, a
// documenta��o oficial exige a porta 80 para aplica��es web
// (docs.shardcloud.app/tutorials/api/express). Para teste local,
// defina PORT=3000 no seu .env.
// -----------------------------------------------------------------
const PORT = process.env.PORT || 80;

// Inicia o bot de status e logs (opcional � s� roda se BOT_TOKEN estiver definido)
let bot = { logTransmissaoIniciada: () => {}, logTransmissaoEncerrada: () => {}, logSalaCriada: () => {}, logSalaFechada: () => {} };
try { bot = require('./bot'); } catch (e) { console.warn('[bot] N�o foi poss�vel iniciar o bot:', e.message); }

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
// Origem p�blica do site (onde share.html abre fora do Discord).
// Se n�o definir, usa o host da pr�pria requisi��o.
const SHARE_ORIGIN = process.env.SHARE_ORIGIN || '';
// Segredo para assinar os tokens (JWT HS256). Se n�o definir, gera um
// aleat�rio por processo � tokens morrem quando o app reinicia.
const TOKEN_SECRET =
  process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[aviso] CLIENT_ID ou CLIENT_SECRET n�o definidos no .env � a troca de token OAuth vai falhar.');
}

// -----------------------------------------------------------------
// Webhook de logs � envia eventos para um canal do Discord.
// Defina LOG_WEBHOOK no .env para ativar.
// -----------------------------------------------------------------
const LOG_WEBHOOK = process.env.LOG_WEBHOOK || '';

function logar(msg) {
  if (!LOG_WEBHOOK) return;
  try {
    const url = new URL(LOG_WEBHOOK);
    const body = JSON.stringify({ content: msg });
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      () => {},
    );
    req.on('error', () => {});
    req.setTimeout(5000, () => req.destroy());
    req.write(body);
    req.end();
  } catch {}
}

function horario() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
if (!process.env.TOKEN_SECRET) {
  console.warn('[aviso] TOKEN_SECRET n�o definido no .env � usando segredo tempor�rio desta execu��o.');
}

app.use(express.json({ limit: '256kb' }));

// CORS + headers obrigat�rios para Discord Activity
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Cache-Control', 'no-store');

  // Permite que o Discord carregue este servidor dentro do iframe da Activity.
  // Sem este header alguns clientes do Discord recusam o carregamento.
  res.header(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://discord.com https://canary.discord.com https://ptb.discord.com https://*.discordsays.com",
  );

  // Remove qualquer X-Frame-Options que o Express ou o host possam adicionar �
  // ele conflita com o frame-ancestors acima e bloqueia o iframe do Discord.
  res.removeHeader('X-Frame-Options');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// -----------------------------------------------------------------
// Tokens: <payloadBase64url>.<assinaturaHMAC-SHA256> � mesmo formato
// da refer�ncia, cujo share.js l� o payload no primeiro segmento.
// Payload com {room, uid, name, av, guild, channel, role[, exp]}.
// A verifica��o aceita tamb�m o formato JWT padr�o (header.payload.sig).
// -----------------------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(payloadPart) {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadPart)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const body = parts[parts.length - 2];
  const sig = parts[parts.length - 1];
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------
// Salas: uma por guild:channel. Guarda transmissores (slots),
// visualizadores e conex�es de controle da p�gina de captura.
// -----------------------------------------------------------------

const rooms = new Map(); // roomId -> room

const ROOM_TTL_MS = 5 * 60 * 1000;

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      broadcasters: new Map(), // slot -> broadcaster
      viewers: new Set(),
      controls: new Set(),
      nextSlot: 1,
      emptyTimer: null,
    };
    rooms.set(roomId, room);
    bot.logSalaCriada({ roomId });
  }
  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
  return room;
}

function maybeCloseRoom(room) {
  if (
    room.broadcasters.size === 0 &&
    room.viewers.size === 0 &&
    room.controls.size === 0
  ) {
    room.emptyTimer = setTimeout(() => {
      rooms.delete(room.id);
      bot.logSalaFechada({ roomId: room.id });
    }, ROOM_TTL_MS);
  }
}

function activeStreams(room) {
  const out = [];
  for (const b of room.broadcasters.values()) {
    if (!b.active) continue;
    out.push({
      slot: b.slot,
      userId: b.userId,
      name: b.name,
      fonte: b.fonte,
      watchers: room.viewers.size,
      config: b.config,
      audioConfig: b.audioConfig,
    });
  }
  return out;
}

function participants(room) {
  const seen = new Map();
  for (const b of room.broadcasters.values()) seen.set(b.userId, { name: b.name, av: b.av, banner: b.banner, accentColor: b.accentColor });
  for (const v of room.viewers.values())      seen.set(v.userId, { name: v.name, av: v.av, banner: v.banner, accentColor: v.accentColor });
  return [...seen.entries()].map(([id, info]) => ({ id, ...info }));
}


// Manda state completo para TODOS � viewers e broadcasters.
// Broadcasters tamb�m precisam saber quem entrou/saiu da sala.
function sendStateToAll(room) {
  const state = {
    type: 'state',
    participants: participants(room),
    abas: [],
    room: null,
    streams: activeStreams(room),
  };
  for (const v of room.viewers)              safeSend(v.ws, state);
  for (const b of room.broadcasters.values()) safeSend(b.ws, state);
}

// Envia contagem de viewers apenas para os broadcasters (n�o altera participantes)
function sendViewersCount(room) {
  const msg = { type: 'viewers-count', viewers: room.viewers.size };
  for (const b of room.broadcasters.values()) safeSend(b.ws, msg);
}

function broadcastStreamStart(room, b) {
  const msg = { type: 'stream-start', slot: b.slot, userId: b.userId, name: b.name, fonte: b.fonte };
  for (const v of room.viewers) safeSend(v.ws, msg);
}

function broadcastStreamStop(room, slot) {
  const msg = { type: 'stream-stop', slot };
  for (const v of room.viewers) safeSend(v.ws, msg);
}

function forwardConfig(room, b, kind) {
  const msg = { type: kind, slot: b.slot, config: kind === 'config' ? b.config : b.audioConfig };
  for (const v of room.viewers) safeSend(v.ws, msg);
}

const WS_OPEN = 1; // ws.ReadyState.Open � evita depender do global WebSocket

function safeSend(ws, obj) {
  try {
    if (ws.readyState === WS_OPEN) ws.send(JSON.stringify(obj));
  } catch {}
}

// -----------------------------------------------------------------
// APIs REST
// -----------------------------------------------------------------

function discordApi(pathName, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'discord.com',
        path: pathName,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Resposta inv�lida do Discord'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Timeout no Discord')));
    req.end();
  });
}

function publicOrigin(req) {
  if (SHARE_ORIGIN) return SHARE_ORIGIN.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  return `${proto}://${host}`;
}

// API: Token exchange (OAuth)
app.post('/api/token', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code required' });
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Servidor sem CLIENT_ID/CLIENT_SECRET configurados' });
  }

  const postData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  }).toString();

  const request = https.request(
    {
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    },
    (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return res.status(400).json(json);
          res.json({ access_token: json.access_token });
        } catch {
          res.status(500).json({ error: 'Parse error' });
        }
      });
    },
  );
  request.on('error', () => res.status(500).json({ error: 'Request failed' }));
  request.write(postData);
  request.end();
});

// API: Sess�o � valida o access_token no Discord e devolve os tokens
// (visualizador + transmissor) e a URL da p�gina de captura.
app.post('/api/session', async (req, res) => {
  const { access_token, guild_id, channel_id } = req.body || {};
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  let user;
  try {
    user = await discordApi('/api/users/@me', access_token);
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao validar token no Discord: ' + e.message });
  }
  if (!user || !user.id) return res.status(401).json({ error: 'Token inv�lido' });

  const name    = user.global_name || user.username || 'Convidado';
  const guild   = guild_id   ? String(guild_id)   : null;
  const channel = channel_id ? String(channel_id) : null;
  const roomId  = guild && channel ? `call-${guild}-${channel}` : `user-${user.id}`;

  // banner � hash do banner; accent_color � inteiro RGB
  const banner       = user.banner       || '';
  const accentColor  = user.accent_color != null ? user.accent_color : null;

  const base = {
    room: roomId, uid: user.id, name,
    av: user.avatar || '',
    banner, accentColor,
    guild: guild || '', channel: channel || '',
  };

  getRoom(roomId); // garante que a sala exista desde j�

  res.json({
    roomId,
    user: { id: user.id, name, av: user.avatar, banner, accentColor },
    viewerToken:      signToken({ ...base, role: 'viewer' }),
    broadcasterToken: signToken({ ...base, role: 'broadcaster' }),
    shareUrl: `${publicOrigin(req)}/share.html`,
  });
});

// API: Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// API: Criar sala anônima (para a landing page)
app.post('/api/room', (req, res) => {
  const roomId = 'public-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  getRoom(roomId);
  const base = { room: roomId, uid: 'anon', name: 'Anônimo', av: '', banner: '', accentColor: null, guild: '', channel: '' };
  res.json({
    roomId,
    viewerToken:      signToken({ ...base, role: 'viewer' }),
    broadcasterToken: signToken({ ...base, role: 'broadcaster' }),
    shareUrl: `${publicOrigin(req)}/share.html`,
  });
});

// Static files — desativa o index automático para que o fallback abaixo controle a rota /
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Landing page — HTML inline para não depender de arquivo externo
const LANDING_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next Cup · Transmissões</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    html,body{height:100%;overflow:hidden}
    body{
      font-family:'Segoe UI',system-ui,sans-serif;
      background:#0d0d0f;color:#f2f3f5;
      min-height:100vh;position:relative;
    }

    /* ── Fundo banner ── */
    .bg{
      position:fixed;inset:0;z-index:0;pointer-events:none;
      background:
        linear-gradient(to right,rgba(8,9,12,.92) 38%,rgba(8,9,12,.55) 70%,rgba(8,9,12,.1) 100%),
        url('/foto/Next_-_Banner.png') center/cover no-repeat;
    }
    .bg-bottom{
      position:fixed;bottom:0;left:0;right:0;height:180px;z-index:0;pointer-events:none;
      background:linear-gradient(0deg,#0d0d0f 0%,transparent 100%);
    }

    /* ── Topbar ── */
    .topbar{
      position:fixed;top:0;left:0;right:0;z-index:10;
      display:flex;align-items:center;justify-content:space-between;
      padding:16px 32px;
    }
    .topbar-left{display:flex;align-items:center;gap:10px;}
    .topbar-logo{width:32px;height:32px;border-radius:8px;object-fit:contain;}
    .topbar-name{font-size:.85rem;font-weight:700;color:#fff;letter-spacing:.02em;}
    .topbar-sep{width:1px;height:16px;background:rgba(255,255,255,.15);}
    .topbar-sub{font-size:.78rem;color:rgba(255,255,255,.4);}

    /* Botão conectar Discord (topbar direita) */
    .btn-discord{
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 18px;
      background:#5865f2;border:none;border-radius:999px;
      color:#fff;font-size:.82rem;font-weight:600;cursor:pointer;
      box-shadow:0 2px 12px rgba(88,101,242,.4);
      transition:transform .15s,box-shadow .15s;
      text-decoration:none;
    }
    .btn-discord:hover{transform:scale(1.04);box-shadow:0 4px 20px rgba(88,101,242,.6);}
    .btn-discord svg{width:16px;height:16px;fill:#fff;flex-shrink:0;}

    /* Avatar após login */
    .user-pill{
      display:none;align-items:center;gap:8px;
      background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
      border-radius:999px;padding:4px 14px 4px 4px;
    }
    .user-pill.visible{display:flex;}
    .user-pill img{width:28px;height:28px;border-radius:50%;object-fit:cover;}
    .user-pill span{font-size:.82rem;font-weight:600;color:#f2f3f5;}

    /* ── Conteúdo principal ── */
    .main{
      position:relative;z-index:1;
      min-height:100vh;
      display:flex;align-items:center;
      padding:0 32px 0 10%;
      max-width:640px;
    }
    .content{display:flex;flex-direction:column;gap:20px;padding-top:80px;}

    .eyebrow{
      display:inline-flex;align-items:center;gap:8px;
      font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
      color:rgba(255,255,255,.45);
    }
    .eyebrow-dot{width:6px;height:6px;border-radius:50%;background:#c62828;}

    h1{
      font-size:clamp(2rem,5vw,3rem);font-weight:800;line-height:1.1;
      letter-spacing:-.5px;color:#fff;
    }

    .desc{
      font-size:.95rem;color:rgba(255,255,255,.55);
      line-height:1.6;max-width:420px;
    }

    /* Lista de features */
    .features{display:flex;flex-direction:column;gap:10px;margin-top:4px;}
    .feature{
      display:flex;align-items:center;gap:12px;
      font-size:.84rem;color:rgba(255,255,255,.5);
    }
    .feature-icon{
      width:28px;height:28px;border-radius:7px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
      display:flex;align-items:center;justify-content:center;flex-shrink:0;
    }
    .feature-icon svg{width:14px;height:14px;fill:none;stroke:#c62828;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}

    /* Botão criar sala */
    .btn-criar{
      display:inline-flex;align-items:center;gap:9px;
      padding:13px 28px;
      background:#c62828;border:none;border-radius:10px;
      color:#fff;font-size:.95rem;font-weight:700;cursor:pointer;
      box-shadow:0 4px 24px rgba(198,40,40,.4);
      transition:transform .15s,box-shadow .15s;
      align-self:flex-start;margin-top:4px;
    }
    .btn-criar:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(198,40,40,.55);}
    .btn-criar:active{transform:translateY(0);}
    .btn-criar:disabled{opacity:.5;cursor:not-allowed;transform:none;}
    .btn-criar svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}

    /* Caixa de URL */
    .url-box{display:none;flex-direction:column;gap:8px;width:100%;max-width:460px;}
    .url-box.on{display:flex;}
    .url-label{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);}
    .url-row{
      display:flex;align-items:center;gap:8px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
      border-radius:10px;padding:10px 14px;
    }
    .url-input{flex:1;font-size:.82rem;color:#b5bac1;background:none;border:none;outline:none;font-family:inherit;cursor:default;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .btn-copy{flex-shrink:0;background:#c62828;border:none;border-radius:7px;padding:6px 14px;color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;transition:background .15s;}
    .btn-copy:hover{background:#d32f2f;}
    .btn-copy.ok{background:#2e7d32;}
    .url-hint{font-size:.74rem;color:rgba(255,255,255,.28);line-height:1.4;}
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="bg-bottom"></div>

  <!-- Topbar -->
  <nav class="topbar">
    <div class="topbar-left">
      <img class="topbar-logo" src="/foto/1321a2929b5943c3cc2be6e3722c2552.png" alt="NEXT">
      <span class="topbar-name">NEXT CUP</span>
      <div class="topbar-sep"></div>
      <span class="topbar-sub">transmissões</span>
    </div>

    <!-- Antes do login -->
    <button class="btn-discord" id="btnLogin">
      <svg viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;fill:#fff;">
        <path fill-rule="evenodd" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      Conectar Discord
    </button>

    <!-- Após o login -->
    <div class="user-pill" id="userPill">
      <img id="userAvatar" src="" alt="">
      <span id="userName"></span>
    </div>
  </nav>

  <!-- Conteúdo -->
  <div class="main">
    <div class="content">
      <div class="eyebrow">
        <span class="eyebrow-dot"></span>
        Next Cup
      </div>

      <h1>Sua tela, ao vivo,<br>direto para a sala.</h1>

      <p class="desc">
        Crie uma sala em um clique, compartilhe o código e
        transmita a tela pelo navegador. Sem instalar nada, sem cadastro.
      </p>

      <div class="features">
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          Sala instantânea, entra por código ou link
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          O vídeo vai de um navegador ao outro, sem passar pelo servidor
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          Várias pessoas podem transmitir ao mesmo tempo
        </div>
      </div>

      <button class="btn-criar" id="btnCriar">
        <svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        Criar sala
      </button>

      <div class="url-box" id="urlBox">
        <span class="url-label">Link da sala</span>
        <div class="url-row">
          <input class="url-input" id="urlInput" readonly>
          <button class="btn-copy" id="btnCopy">Copiar</button>
        </div>
        <p class="url-hint">Envie este link para quem vai transmitir ou assistir.</p>
      </div>
    </div>
  </div>

  <script>
    // ── OAuth Discord (apenas pega foto e nome, sem backend) ──
    const CLIENT_ID = '1540951591685853305';
    const REDIRECT   = location.origin + location.pathname;
    const SCOPES     = 'identify';

    const btnLogin = document.getElementById('btnLogin');
    const userPill = document.getElementById('userPill');
    const userAv   = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    function applyUser(user) {
      const av = user.avatar
        ? 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=64'
        : 'https://cdn.discordapp.com/embed/avatars/' + ((Number(user.discriminator||0)) % 5) + '.png';
      userAv.src = av;
      userName.textContent = user.global_name || user.username;
      btnLogin.style.display = 'none';
      userPill.classList.add('visible');
    }

    // Verifica se voltou do OAuth com token no hash
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get('access_token');
    if (token) {
      history.replaceState(null,'',location.pathname + location.search);
      fetch('https://discord.com/api/users/@me', { headers:{ Authorization:'Bearer '+token } })
        .then(r=>r.json()).then(applyUser).catch(()=>{});
    }

    // Clique no botão Discord
    btnLogin.addEventListener('click', () => {
      const url = 'https://discord.com/oauth2/authorize'
        + '?client_id=' + CLIENT_ID
        + '&redirect_uri=' + encodeURIComponent(REDIRECT)
        + '&response_type=token'
        + '&scope=' + SCOPES;
      location.href = url;
    });

    // ── Criar sala ──
    const btnCriar = document.getElementById('btnCriar');
    const urlBox   = document.getElementById('urlBox');
    const urlInput = document.getElementById('urlInput');
    const btnCopy  = document.getElementById('btnCopy');

    btnCriar.addEventListener('click', async () => {
      btnCriar.disabled = true;
      btnCriar.innerHTML = 'Criando…';
      try {
        const r = await fetch('/api/room', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error||'Erro');
        const u = new URL(location.origin);
        u.searchParams.set('room', d.roomId);
        u.searchParams.set('t', d.viewerToken);
        urlInput.value = u.toString();
        urlBox.classList.add('on');
        btnCriar.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M12 5v14"/><path d="M5 12h14"/></svg> Criar outra sala';
        btnCriar.disabled = false;
      } catch(e) {
        btnCriar.innerHTML = 'Erro — tente novamente';
        btnCriar.disabled = false;
      }
    });

    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(urlInput.value).then(() => {
        btnCopy.textContent = 'Copiado!';
        btnCopy.classList.add('ok');
        setTimeout(() => { btnCopy.textContent = 'Copiar'; btnCopy.classList.remove('ok'); }, 2000);
      });
    });
  </script>
</body>
</html>`;

// SPA fallback — landing quando não há token, index.html quando tem
app.get('*', (req, res) => {
  const hasToken = req.query.t || req.query.frame_id;
  if (!hasToken) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(LANDING_HTML);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// -----------------------------------------------------------------
// Relay WebSocket: /ws?t=<token>[&fonte=tela|camera][&modo=controle]
//
// Pap�is:
//  - fonte=...     ? transmissor (recebe um slot, repacota nada: s� repassa)
//  - modo=controle ? canal de controle da aba de captura
//  - resto         ? visualizador
//
// Formato bin�rio (v�deo e �udio), definido pelo broadcaster.js:
//   [1B slot][1B tipo][8B timestamp f64][8B rel�gio envio f64][payload]
// -----------------------------------------------------------------

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rodando na porta ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`Sem permiss�o para abrir a porta ${PORT}. No Shard Cloud use a porta 80 (padr�o). Testando local? Defina PORT=3000 no .env.`);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} j� est� em uso por outro processo.`);
  } else {
    console.error('Erro ao iniciar o servidor:', err);
  }
  process.exit(1);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

server.on('upgrade', (request, socket, head) => {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }
  // Remove o prefixo /.proxy do IN�CIO do path (Discord proxy encaminha como /.proxy/ws,
  // n�o /ws/.proxy). O regex anterior removia do final e nunca casava dentro do Discord.
  if (url.pathname.replace(/^\/.proxy/, '').replace(/\/+$/, '') !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, url.searchParams);
  });
});

wss.on('connection', (ws, request, params) => {
  ws.binaryType = 'nodebuffer';
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const payload = verifyToken(params.get('t'));
  if (!payload || !payload.room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Token inv�lido.' }));
    ws.close(4001, 'token invalido');
    return;
  }

  const room = getRoom(payload.room);
  const fonte = params.get('fonte');
  const modo = params.get('modo');

  if (modo === 'controle') attachControl(ws, room, payload);
  else if (fonte) attachBroadcaster(ws, room, payload, fonte);
  else attachViewer(ws, room, payload);
});

// ------------------------------------------------------------ transmissor

function attachBroadcaster(ws, room, payload, fonte) {
  if (payload.role !== 'broadcaster') {
    ws.send(JSON.stringify({ type: 'error', message: 'Token sem permiss�o de transmiss�o.' }));
    ws.close(4003, 'sem permissao');
    return;
  }

  // Uma transmiss�o por usu�rio/fonte: segunda conex�o � recusada.
  for (const b of room.broadcasters.values()) {
    if (b.userId === payload.uid && b.fonte === fonte) {
      ws.send(JSON.stringify({ type: 'error', message: 'Voc� j� est� transmitindo desta fonte nesta sala.' }));
      ws.close(4002, 'ja transmitindo');
      return;
    }
  }

  const slot = room.nextSlot++;
  const b = {
    ws,
    slot,
    userId: payload.uid,
    name: payload.name,
    av: payload.av,
    banner: payload.banner || '',
    accentColor: payload.accentColor != null ? payload.accentColor : null,
    fonte,
    active: false,
    config: null,
    audioConfig: null,
  };
  room.broadcasters.set(slot, b);

  safeSend(ws, { type: 'slot', slot });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Repassa o buffer intacto para todos os visualizadores.
      if (!b.active) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      for (const v of room.viewers) {
        try {
          if (v.ws.readyState === WS_OPEN) v.ws.send(buf, { binary: true });
        } catch {}
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'start':
        b.active = true;
        logar(`**${b.name}** come�ou a transmitir **${b.fonte}** na sala \`${room.id}\` (${horario()})`);
        bot.logTransmissaoIniciada({ name: b.name, userId: b.userId, av: b.av, fonte: b.fonte, roomId: room.id });
        broadcastStreamStart(room, b);
        sendStateToAll(room);
        break;
      case 'config':
        b.config = msg.config;
        forwardConfig(room, b, 'config');
        sendStateToAll(room);
        break;
      case 'audio-config':
        b.audioConfig = msg.config;
        forwardConfig(room, b, 'audio-config');
        sendStateToAll(room);
        break;
      case 'stop':
        if (b.active) {
          b.active = false;
          logar(`**${b.name}** parou de transmitir (${horario()})`);
          bot.logTransmissaoEncerrada({ name: b.name, userId: b.userId, av: b.av, fonte: b.fonte, roomId: room.id });
          broadcastStreamStop(room, b.slot);
          sendStateToAll(room);
        }
        break;
      case 'native-audio-start':
        // Captura nativa do Firefox depende de um agente na m�quina do
        // usu�rio; este servidor n�o oferece isso.
        safeSend(ws, {
          type: 'native-audio-error',
          message: '�udio nativo do Firefox n�o est� dispon�vel neste servidor.',
        });
        break;
      case 'native-audio-stop':
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    room.broadcasters.delete(b.slot);
    if (b.active) {
      b.active = false;
      bot.logTransmissaoEncerrada({ name: b.name, userId: b.userId, av: b.av, fonte: b.fonte, roomId: room.id });
      broadcastStreamStop(room, b.slot);
    }
    sendStateToAll(room);
    sendViewersCount(room);
    maybeCloseRoom(room);
  });
}

// --------------------------------------------------------------- controle

function attachControl(ws, room) {
  room.controls.add(ws);

  ws.on('message', (data) => {
    // Controle s� escuta; nada chega dele na refer�ncia.
  });

  ws.on('close', () => {
    room.controls.delete(ws);
    maybeCloseRoom(room);
  });
}

// ------------------------------------------------------------ visualizador

function attachViewer(ws, room, payload) {
  const v = { ws, userId: payload.uid, name: payload.name, av: payload.av, banner: payload.banner || '', accentColor: payload.accentColor != null ? payload.accentColor : null };
  room.viewers.add(v);
  logar(`**${v.name}** entrou na sala \`${room.id}\` (${room.viewers.size} assistindo)`);

  // Manda o estado atual para o novo viewer (inclui ele mesmo na lista)
  const streams = activeStreams(room);
  safeSend(ws, { type: 'state', participants: participants(room), abas: [], room: null, streams });
  for (const s of streams) {
    if (s.config)      safeSend(ws, { type: 'config',       slot: s.slot, config: s.config });
    if (s.audioConfig) safeSend(ws, { type: 'audio-config', slot: s.slot, config: s.audioConfig });
  }

  // Avisa TODOS os outros (viewers + broadcasters) que uma nova pessoa entrou
  const stateAtualizado = { type: 'state', participants: participants(room), abas: [], room: null, streams };
  for (const outro of room.viewers) {
    if (outro !== v) safeSend(outro.ws, stateAtualizado);
  }
  for (const b of room.broadcasters.values()) safeSend(b.ws, stateAtualizado);

  sendViewersCount(room);

  // Pede keyframe aos transmissores ativos: quem acabou de entrar precisa
  // de um ponto de partida.
  for (const b of room.broadcasters.values()) {
    if (b.active) safeSend(b.ws, { type: 'need-keyframe' });
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'rename' && typeof msg.name === 'string') {
      v.name = msg.name.slice(0, 32);
      sendStateToAll(room);
    } else if (msg.type === 'need-keyframe') {
      // Visualizador recriou o decoder (ex.: resolu��o mudou no meio do ar):
      // pede um ponto de partida novo aos transmissores ativos.
      for (const b of room.broadcasters.values()) {
        if (b.active) safeSend(b.ws, { type: 'need-keyframe' });
      }
    } else if (msg.type === 'start-broadcast') {
      // A atividade pediu uma fonte pela interface: repassa �s abas de captura.
      for (const c of room.controls) {
        safeSend(c, { type: 'start-request', fonte: msg.fonte, opcoes: msg.opcoes });
      }
    } else if (msg.type === 'config-broadcast') {
      for (const c of room.controls) {
        safeSend(c, { type: 'config-request', opcoes: msg.opcoes });
      }
    }
  });

  ws.on('close', () => {
    room.viewers.delete(v);
    logar(`**${v.name}** saiu da sala (${room.viewers.size} restantes)`);
    sendViewersCount(room);
    sendStateToAll(room);
    maybeCloseRoom(room);
  });
}

// Limpa sockets mortos (rede caiu sem close) a cada 30s.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 30000);

