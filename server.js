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

// API: Busca canal de voz do usuário via bot
app.post('/api/voice-channel', async (req, res) => {
  const { access_token, guild_id, user_id } = req.body || {};
  if (!access_token || !guild_id || !user_id) {
    return res.status(400).json({ error: 'access_token, guild_id e user_id são obrigatórios' });
  }
  // Valida o token chamando a API do Discord
  let user;
  try {
    user = await discordApi('/api/users/@me', access_token);
    if (!user?.id) throw new Error('Token inválido');
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  // Busca canal de voz via bot
  const channel = await bot.getVoiceChannel(guild_id, user_id).catch(() => null);
  if (!channel) {
    return res.status(404).json({ error: 'Você não está em nenhum canal de voz neste servidor.' });
  }
  res.json({ channel });
});

// API: Inicia a Activity no canal de voz via bot (usando HTTP API do Discord)
app.post('/api/start-activity', async (req, res) => {
  const { access_token, guild_id, channel_id, user_id } = req.body || {};
  if (!access_token || !guild_id || !channel_id || !user_id) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  // Valida token
  try {
    const u = await discordApi('/api/users/@me', access_token);
    if (!u?.id) throw new Error('inválido');
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  // Cria invite de Activity via API REST do Discord usando o bot token
  if (!process.env.BOT_TOKEN) {
    return res.status(503).json({ error: 'Bot não configurado' });
  }
  try {
    const body = JSON.stringify({
      max_age: 86400,
      max_uses: 0,
      target_type: 2,                       // 2 = embedded application
      target_application_id: CLIENT_ID,     // ID da sua Activity
    });
    const invite = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'discord.com',
        path: `/api/v10/channels/${channel_id}/invites`,
        method: 'POST',
        headers: {
          'Authorization': `Bot ${process.env.BOT_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
          catch { reject(new Error('Parse error')); }
        });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    console.log('[start-activity] Discord respondeu:', invite.status, JSON.stringify(invite.data));

    // Resposta de erro do Discord tem statusCode >= 400
    if (invite.status >= 400) {
      const msg = invite.data?.message || invite.data?.error || 'Falha ao criar invite';
      return res.status(500).json({ error: `Discord: ${msg} (código ${invite.data?.code || invite.status})` });
    }

    res.json({ invite_url: `https://discord.gg/${invite.data.code}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  <link rel="preload" href="/foto/Next_-_Banner.png" as="image">
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    html,body{min-height:100%;scroll-behavior:smooth;}

    /* ── Keyframes ── */
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes slideUp  { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
    @keyframes scaleIn  { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
    @keyframes lineGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }

    /* Tela de splash — cobre tudo e desaparece */
    .splash{
      position:fixed;inset:0;z-index:100;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
      background:#0d0d0f;
      animation:fadeIn .01s forwards;
      pointer-events:none;
    }
    .splash.out{
      animation:fadeIn .5s reverse forwards;
      animation-delay:.1s;
    }
    .splash-logo{
      width:72px;height:72px;border-radius:18px;object-fit:contain;
      animation:scaleIn .5s cubic-bezier(.34,1.56,.64,1) forwards;
    }
    .splash-bar{
      width:60px;height:2px;background:#c62828;border-radius:2px;
      transform-origin:left;
      animation:lineGrow .6s .3s cubic-bezier(.4,0,.2,1) forwards;
      transform:scaleX(0);
    }

    /* Elementos da página entram em sequência */
    .anim-1{opacity:0;animation:slideUp .55s .65s ease forwards;}
    .anim-2{opacity:0;animation:slideUp .55s .8s  ease forwards;}
    .anim-3{opacity:0;animation:slideUp .55s .95s ease forwards;}
    .anim-4{opacity:0;animation:slideUp .55s 1.1s ease forwards;}
    .anim-5{opacity:0;animation:slideUp .55s 1.25s ease forwards;}
    .anim-6{opacity:0;animation:slideUp .55s 1.4s ease forwards;}
    .topbar{opacity:0;animation:fadeIn .4s .6s ease forwards;}
    .bg    {opacity:0;animation:fadeIn .8s .2s ease forwards;}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d0d0f;color:#f2f3f5;}

    /* ── Fundo ── */
    .bg{position:fixed;inset:0;z-index:0;pointer-events:none;
      background-color:#0d0d0f;
      background-image:linear-gradient(to right,rgba(8,9,12,.96) 35%,rgba(8,9,12,.6) 65%,rgba(8,9,12,.15) 100%),
      url('/foto/Next_-_Banner.png');
      background-size:cover;background-position:center;}
    .bg-fade{position:fixed;bottom:0;left:0;right:0;height:260px;z-index:0;pointer-events:none;
      background:linear-gradient(0deg,#0d0d0f 0%,transparent 100%);}

    /* ── Topbar ── */
    .topbar{position:fixed;top:0;left:0;right:0;z-index:20;
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 40px;
      background:linear-gradient(180deg,rgba(8,9,12,.7) 0%,transparent 100%);
      backdrop-filter:blur(0px);}
    .topbar-left{display:flex;align-items:center;gap:10px;}
    .topbar-logo{width:30px;height:30px;border-radius:7px;object-fit:contain;}
    .topbar-name{font-size:.82rem;font-weight:800;color:#fff;letter-spacing:.04em;text-transform:uppercase;}
    .topbar-sep{width:1px;height:14px;background:rgba(255,255,255,.15);}
    .topbar-sub{font-size:.75rem;color:rgba(255,255,255,.35);}
    .btn-discord{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;
      background:#5865f2;border:none;border-radius:999px;color:#fff;font-size:.8rem;
      font-weight:600;cursor:pointer;box-shadow:0 2px 14px rgba(88,101,242,.4);
      transition:transform .15s,box-shadow .15s;}
    .btn-discord:hover{transform:scale(1.04);box-shadow:0 4px 22px rgba(88,101,242,.6);}
    .btn-discord svg{width:17px;height:17px;fill:#fff;flex-shrink:0;}
    .user-pill{display:none;align-items:center;gap:8px;
      background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
      border-radius:999px;padding:4px 14px 4px 4px;}
    .user-pill.visible{display:flex;}
    .user-pill img{width:26px;height:26px;border-radius:50%;object-fit:cover;}
    .user-pill span{font-size:.8rem;font-weight:600;color:#f2f3f5;}

    /* ── Hero ── */
    .hero{position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;
      padding:100px 40px 60px 10%;}
    .hero-content{display:flex;flex-direction:column;gap:22px;max-width:520px;}
    .eyebrow{display:inline-flex;align-items:center;gap:8px;
      font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
      color:rgba(255,255,255,.4);}
    .eyebrow-dot{width:5px;height:5px;border-radius:50%;background:#c62828;}
    h1{font-size:clamp(2.2rem,5vw,3.4rem);font-weight:900;line-height:1.08;
      letter-spacing:-.5px;color:#fff;}
    .desc{font-size:.93rem;color:rgba(255,255,255,.5);line-height:1.65;max-width:400px;}

    /* Features */
    .features{display:flex;flex-direction:column;gap:9px;}
    .feature{display:flex;align-items:center;gap:12px;font-size:.83rem;color:rgba(255,255,255,.45);}
    .feature-icon{width:28px;height:28px;border-radius:7px;background:rgba(255,255,255,.05);
      border:1px solid rgba(198,40,40,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .feature-icon svg{width:13px;height:13px;fill:none;stroke:#c62828;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}

    /* Stats */
    .stats{display:flex;gap:28px;padding-top:4px;}
    .stat{display:flex;flex-direction:column;gap:2px;}
    .stat-val{font-size:1.35rem;font-weight:800;color:#fff;}
    .stat-label{font-size:.7rem;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.06em;}
    .stat-sep{width:1px;background:rgba(255,255,255,.08);align-self:stretch;}

    /* Botão criar */
    .btn-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
    .btn-criar{display:inline-flex;align-items:center;gap:9px;padding:13px 28px;
      background:#c62828;border:none;border-radius:10px;color:#fff;font-size:.93rem;
      font-weight:700;cursor:pointer;box-shadow:0 4px 24px rgba(198,40,40,.4);
      transition:transform .15s,box-shadow .15s;}
    .btn-criar:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(198,40,40,.55);}
    .btn-criar:active{transform:translateY(0);}
    .btn-criar:disabled{opacity:.5;cursor:not-allowed;transform:none;}
    .btn-criar svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
    .btn-hint{font-size:.75rem;color:rgba(255,255,255,.3);}

    /* URL box */
    .url-box{display:none;flex-direction:column;gap:8px;width:100%;max-width:460px;}
    .url-box.on{display:flex;}
    .url-label{font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);}
    .url-row{display:flex;align-items:center;gap:8px;
      background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 14px;}
    .url-input{flex:1;font-size:.8rem;color:#b5bac1;background:none;border:none;outline:none;
      font-family:inherit;cursor:default;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .btn-copy{flex-shrink:0;background:#c62828;border:none;border-radius:7px;padding:6px 14px;
      color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;transition:background .15s;}
    .btn-copy:hover{background:#d32f2f;}
    .btn-copy.ok{background:#2e7d32;}
    .url-hint-text{font-size:.72rem;color:rgba(255,255,255,.25);line-height:1.4;}

    /* ── Seção Como funciona ── */
    .section{position:relative;z-index:1;padding:80px 40px 80px 10%;
      background:linear-gradient(180deg,transparent 0%,rgba(10,10,14,.98) 20%);}
    .section-title{font-size:.68rem;font-weight:700;letter-spacing:.12em;
      text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:36px;}
    .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:860px;}
    .step{display:flex;flex-direction:column;gap:10px;padding:24px 22px;
      background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;
      transition:border-color .2s,background .2s;}
    .step:hover{border-color:rgba(198,40,40,.3);background:rgba(255,255,255,.05);}
    .step-num{font-size:.7rem;font-weight:800;color:#c62828;letter-spacing:.08em;}
    .step-title{font-size:.95rem;font-weight:700;color:#fff;}
    .step-desc{font-size:.82rem;color:rgba(255,255,255,.42);line-height:1.65;}

    /* ── Seção Discord ── */
    .discord-section{position:relative;z-index:1;
      padding:0 40px 80px 10%;}
    .discord-card{display:flex;align-items:flex-start;gap:20px;max-width:680px;
      background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.25);
      border-radius:14px;padding:26px 28px;}
    .discord-card svg{width:42px;height:42px;fill:#5865f2;flex-shrink:0;margin-top:2px;}
    .discord-card-text h3{font-size:.95rem;font-weight:700;color:#fff;margin-bottom:6px;}
    .discord-card-text p{font-size:.82rem;color:rgba(255,255,255,.42);line-height:1.65;}

    /* Footer */
    .footer{position:relative;z-index:1;padding:20px 40px 28px 10%;
      font-size:.7rem;color:rgba(255,255,255,.18);border-top:1px solid rgba(255,255,255,.06);}
    /* ── Modal trigger ── */
    .modal-trigger{
      position:fixed;bottom:24px;right:24px;z-index:50;
      width:44px;height:44px;border-radius:50%;
      background:#c62828;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 20px rgba(198,40,40,.5);
      transition:transform .15s,box-shadow .15s;
    }
    .modal-trigger:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(198,40,40,.7);}
    .modal-trigger svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}

    /* ── Crédito fixo ── */
    .credit-badge{
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:50;
      font-size:.72rem;font-weight:600;color:rgba(255,255,255,.55);
      background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
      padding:8px 14px;border-radius:999px;backdrop-filter:blur(6px);
      pointer-events:none;user-select:none;
    }
    .credit-badge span{color:#ff5c5c;}

    /* ── Modal overlay ── */
    .modal-overlay{
      position:fixed;inset:0;z-index:60;
      background:rgba(0,0,0,.7);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;
      opacity:0;pointer-events:none;transition:opacity .2s;
    }
    .modal-overlay.open{opacity:1;pointer-events:auto;}

    /* ── Modal card ── */
    .modal-card{
      background:#18191c;border:1px solid rgba(255,255,255,.1);
      border-radius:16px;padding:24px;width:90%;max-width:380px;
      transform:translateY(20px) scale(.97);
      transition:transform .25s cubic-bezier(.34,1.56,.64,1);
      box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    .modal-overlay.open .modal-card{transform:translateY(0) scale(1);}
    .modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
    .modal-title{display:flex;align-items:center;gap:8px;font-size:.9rem;font-weight:700;color:#fff;}
    .modal-title svg{width:16px;height:16px;fill:none;stroke:#c62828;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
    .modal-close{background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1rem;padding:2px 6px;border-radius:5px;transition:color .15s,background .15s;}
    .modal-close:hover{color:#fff;background:rgba(255,255,255,.08);}

    /* Steps */
    .modal-step{display:flex;flex-direction:column;gap:10px;}
    .step-label{display:flex;align-items:center;gap:8px;font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.5);}
    .step-badge{
      width:20px;height:20px;border-radius:50%;
      background:#c62828;color:#fff;
      font-size:.65rem;font-weight:800;
      display:flex;align-items:center;justify-content:center;flex-shrink:0;
    }
    .step-badge.done{background:#2e7d32;}
    .step-text{font-size:.8rem;color:rgba(255,255,255,.45);line-height:1.55;}

    /* Botão Discord no modal */
    .modal-btn-discord{
      display:flex;align-items:center;justify-content:center;gap:9px;
      padding:11px 0;background:#5865f2;border:none;border-radius:10px;
      color:#fff;font-size:.85rem;font-weight:600;cursor:pointer;width:100%;
      transition:background .15s,transform .15s;
    }
    .modal-btn-discord:hover{background:#4752c4;transform:translateY(-1px);}
    .modal-btn-discord svg{width:16px;height:16px;fill:#fff;flex-shrink:0;}

    /* Card do usuário */
    .user-card{
      display:flex;align-items:center;gap:12px;
      background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);
      border-radius:10px;padding:12px 14px;
    }
    .user-card-av{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;}
    .user-card-info{display:flex;flex-direction:column;gap:2px;}
    .user-card-name{font-size:.88rem;font-weight:700;color:#fff;}
    .user-card-tag{font-size:.72rem;color:rgba(255,255,255,.35);}

    /* Canal de voz */
    .voice-channel-row{
      display:flex;align-items:center;gap:10px;
      background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
      border-radius:10px;padding:10px 14px;
    }
    .voice-channel-icon{flex-shrink:0;}
    .voice-channel-icon svg{width:16px;height:16px;fill:none;stroke:#3ba55d;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
    .voice-channel-name{flex:1;font-size:.83rem;font-weight:600;color:#f2f3f5;}
    .voice-channel-status{font-size:.7rem;color:rgba(255,255,255,.3);}

    /* Erro */
    .modal-error{font-size:.78rem;color:#ff8a80;background:rgba(255,50,50,.1);
      border:1px solid rgba(255,50,50,.25);border-radius:8px;padding:8px 12px;}

    /* Botão conectar */
    .modal-btn-connect{
      display:flex;align-items:center;justify-content:center;gap:9px;
      padding:12px 0;background:#c62828;border:none;border-radius:10px;
      color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;width:100%;
      box-shadow:0 4px 18px rgba(198,40,40,.35);
      transition:background .15s,transform .15s,box-shadow .15s;
    }
    .modal-btn-connect:hover:not(:disabled){background:#d32f2f;transform:translateY(-1px);box-shadow:0 6px 24px rgba(198,40,40,.5);}
    .modal-btn-connect:disabled{opacity:.45;cursor:not-allowed;}
    .modal-btn-connect svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
    .modal-btn-connect.connected{background:#2e7d32;}
    .modal-btn-connect.connected svg{stroke:#fff;}
  </style>
</head>
<body>
  <!-- Splash de entrada -->
  <div class="splash" id="splash">
    <img class="splash-logo" src="/foto/1321a2929b5943c3cc2be6e3722c2552.png" alt="NEXT">
    <div class="splash-bar"></div>
  </div>

  <div class="bg"></div>
  <div class="bg-fade"></div>

  <!-- Topbar -->
  <nav class="topbar">
    <div class="topbar-left">
      <img class="topbar-logo" src="/foto/1321a2929b5943c3cc2be6e3722c2552.png" alt="NEXT">
      <span class="topbar-name">Next Cup</span>
      <div class="topbar-sep"></div>
      <span class="topbar-sub">transmissões</span>
    </div>
    <button class="btn-discord" id="btnLogin">
      <svg viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      Conectar Discord
    </button>
    <div class="user-pill" id="userPill">
      <img id="userAvatar" src="" alt="">
      <span id="userName"></span>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-content">
      <div class="eyebrow anim-1"><span class="eyebrow-dot"></span>Next Cup · Ao vivo</div>
      <h1 class="anim-2">Sua tela, ao vivo,<br>direto para a sala.</h1>
      <p class="desc anim-3">Crie uma sala em um clique, compartilhe o link e transmita pelo navegador. Sem instalar nada, sem cadastro.</p>

      <div class="features anim-4">
        <div class="feature">
          <div class="feature-icon"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
          Sala instantânea, entra por link
        </div>
        <div class="feature">
          <div class="feature-icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg></div>
          Compartilhe tela ou câmera
        </div>
        <div class="feature">
          <div class="feature-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          Várias pessoas transmitindo ao mesmo tempo
        </div>
        <div class="feature">
          <div class="feature-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
          Sem passar pelo servidor — baixa latência
        </div>
      </div>

      <div class="btn-row anim-6">
        <button class="btn-criar" id="btnCriar">
          <svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          Criar sala
        </button>
      </div>

      <div class="url-box" id="urlBox">
        <span class="url-label">Link da sala</span>
        <div class="url-row">
          <input class="url-input" id="urlInput" readonly>
          <button class="btn-copy" id="btnCopy">Copiar</button>
        </div>
        <p class="url-hint-text">Envie para quem vai transmitir ou assistir. Expira quando a sala fechar.</p>
      </div>
    </div>
  </section>

  <footer class="footer">Next Cup · Transmissões ao vivo · nextcuptransmissoes.online</footer>

  <div class="credit-badge">Feito por Stark e ixce <span>❤</span></div>

  <!-- ═══════════════════ MODAL TUTORIAL ═══════════════════ -->
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal-card" id="modalCard">

      <!-- Cabeçalho -->
      <div class="modal-header">
        <div class="modal-title">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Iniciar no Discord
        </div>
        <button class="modal-close" id="modalClose">✕</button>
      </div>

      <!-- Passo 1: conectar Discord -->
      <div class="modal-step" id="step1">
        <div class="step-label"><span class="step-badge">1</span> Conecte sua conta</div>
        <p class="step-text">Clique no botão abaixo para autenticar com o Discord. Vamos pegar sua foto e nome automaticamente.</p>
        <button class="modal-btn-discord" id="modalBtnLogin">
          <svg viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          Conectar Discord
        </button>
      </div>

      <!-- Passo 2: card do usuário + canal de voz (aparece após login) -->
      <div class="modal-step" id="step2" hidden>
        <div class="step-label"><span class="step-badge done">✓</span> Conectado</div>

        <!-- Card do usuário -->
        <div class="user-card" id="modalUserCard">
          <img class="user-card-av" id="modalUserAv" src="" alt="">
          <div class="user-card-info">
            <div class="user-card-name" id="modalUserName">…</div>
            <div class="user-card-tag">Conta Discord</div>
          </div>
        </div>

        <!-- Canal de voz -->
        <div class="step-label" style="margin-top:18px"><span class="step-badge">2</span> Canal de voz detectado</div>
        <p class="step-text">O bot identificou o canal onde você está. Clique em conectar para iniciar a Activity.</p>

        <div class="voice-channel-row" id="voiceChannelRow">
          <div class="voice-channel-icon">
            <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
          <div class="voice-channel-name" id="voiceChannelName">Buscando…</div>
          <div class="voice-channel-status" id="voiceChannelStatus"></div>
        </div>

        <div class="modal-error" id="modalError" hidden></div>

        <button class="modal-btn-connect" id="btnConnect" disabled>
          <svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          Conectar bot
        </button>
      </div>

    </div>
  </div>

  <!-- Botão flutuante "?" para abrir o modal -->
  <button class="modal-trigger" id="modalTrigger" title="Como usar no Discord">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  </button>

  <script>
    const CLIENT_ID = '1540951591685853305';
    const REDIRECT  = location.origin + location.pathname;

    // ── Remove splash ──
    setTimeout(() => {
      const s = document.getElementById('splash');
      if (s) { s.classList.add('out'); setTimeout(() => s.remove(), 600); }
    }, 900);

    // ── Estado global ──
    let discordToken = null;
    let discordUser  = null;
    let guildId      = null;
    let channelId    = null;

    // ── Topbar: botão login principal ──
    const btnLogin = document.getElementById('btnLogin');
    const userPill = document.getElementById('userPill');
    const userAv   = document.getElementById('userAvatar');
    const userNm   = document.getElementById('userName');

    function applyUser(u, tok) {
      discordToken = tok;
      discordUser  = u;
      if (!u || !u.id) return; // token inválido, ignora
      const av = u.avatar
        ? 'https://cdn.discordapp.com/avatars/'+u.id+'/'+u.avatar+'.png?size=128'
        : 'https://cdn.discordapp.com/embed/avatars/'+((Number(u.discriminator||0))%5)+'.png';
      // Topbar
      userAv.src = av;
      userNm.textContent = u.global_name || u.username;
      btnLogin.style.display = 'none';
      userPill.classList.add('visible');
      // Modal — preenche card e avança para passo 2
      document.getElementById('modalUserAv').src = av;
      document.getElementById('modalUserName').textContent = u.global_name || u.username;
      document.getElementById('step1').hidden = true;
      document.getElementById('step2').hidden = false;
      // Abre o modal automaticamente se ainda não estiver aberto
      document.getElementById('modalOverlay').classList.add('open');
      fetchVoiceChannel(u);
    }

    // Verifica retorno do OAuth no hash
    const hash = new URLSearchParams(location.hash.slice(1));
    const tok  = hash.get('access_token');
    if (tok) {
      history.replaceState(null,'',location.pathname+location.search);
      fetch('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+tok}})
        .then(r=>r.json()).then(u => applyUser(u, tok)).catch(()=>{});
    }

    function doOAuth() {
      // Pede identify + guilds para sabermos em qual servidor está
      location.href = 'https://discord.com/oauth2/authorize'
        + '?client_id=' + CLIENT_ID
        + '&redirect_uri=' + encodeURIComponent(REDIRECT)
        + '&response_type=token'
        + '&scope=identify%20guilds';
    }

    btnLogin.addEventListener('click', doOAuth);
    document.getElementById('modalBtnLogin').addEventListener('click', doOAuth);

    // ── Busca canal de voz ──
    async function fetchVoiceChannel(u) {
      const vcName  = document.getElementById('voiceChannelName');
      const vcStatus = document.getElementById('voiceChannelStatus');
      const btnConn = document.getElementById('btnConnect');
      const errEl   = document.getElementById('modalError');
      vcName.textContent = 'Buscando…';
      errEl.hidden = true;

      // Busca guilds do usuário para descobrir em qual servidor está
      let guilds = [];
      try {
        const r = await fetch('https://discord.com/api/users/@me/guilds', {headers:{Authorization:'Bearer '+discordToken}});
        guilds = await r.json();
      } catch {}

      // Tenta cada guild até achar o canal de voz
      for (const g of (guilds||[])) {
        try {
          const r = await fetch('/api/voice-channel', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ access_token: discordToken, guild_id: g.id, user_id: u.id }),
          });
          if (!r.ok) continue;
          const d = await r.json();
          if (d.channel) {
            vcName.textContent  = d.channel.name;
            vcStatus.textContent = g.name;
            guildId   = g.id;
            channelId = d.channel.id;
            btnConn.disabled = false;
            return;
          }
        } catch {}
      }
      vcName.textContent = 'Nenhum canal encontrado';
      errEl.textContent = 'Entre em um canal de voz no Discord e tente novamente.';
      errEl.hidden = false;
    }

    // ── Botão conectar bot ──
    document.getElementById('btnConnect').addEventListener('click', async () => {
      const btnConn = document.getElementById('btnConnect');
      const errEl   = document.getElementById('modalError');
      btnConn.disabled = true;
      btnConn.innerHTML = 'Conectando…';
      errEl.hidden = true;

      try {
        const r = await fetch('/api/start-activity', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            access_token: discordToken,
            guild_id: guildId,
            channel_id: channelId,
            user_id: discordUser.id,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Erro ao conectar');
        // Sucesso
        btnConn.classList.add('connected');
        btnConn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><polyline points="20 6 9 17 4 12"/></svg> Conectado';
        // Abre o invite em nova aba
        if (d.invite_url) window.open(d.invite_url, '_blank');
      } catch(e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
        btnConn.disabled = false;
        btnConn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg> Tentar novamente';
      }
    });

    // ── Abrir/fechar modal ──
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTrigger').addEventListener('click', () => overlay.classList.add('open'));
    document.getElementById('modalClose').addEventListener('click',   () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

    // ── Criar sala ──
    const btnCriar = document.getElementById('btnCriar');
    const urlBox   = document.getElementById('urlBox');
    const urlInput = document.getElementById('urlInput');
    const btnCopy  = document.getElementById('btnCopy');

    btnCriar.addEventListener('click', async () => {
      btnCriar.disabled=true; btnCriar.innerHTML='Criando…';
      try {
        const r = await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        const d = await r.json();
        if (!r.ok) throw new Error(d.error||'Erro');
        const u = new URL(location.origin);
        u.searchParams.set('room',d.roomId); u.searchParams.set('t',d.viewerToken);
        urlInput.value = u.toString();
        urlBox.classList.add('on');
        btnCriar.innerHTML='<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M12 5v14"/><path d="M5 12h14"/></svg> Criar outra sala';
        btnCriar.disabled=false;
        urlBox.scrollIntoView({behavior:'smooth',block:'nearest'});
      } catch(e) { btnCriar.innerHTML='Erro — tente novamente'; btnCriar.disabled=false; }
    });
    btnCopy.addEventListener('click',()=>{
      navigator.clipboard.writeText(urlInput.value).then(()=>{
        btnCopy.textContent='Copiado!'; btnCopy.classList.add('ok');
        setTimeout(()=>{btnCopy.textContent='Copiar';btnCopy.classList.remove('ok');},2000);
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
