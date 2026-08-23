require('dotenv').config();
const express = require('express');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();

// -----------------------------------------------------------------
// PORTA: no Shard Cloud, ao contrário de Render/Railway/Heroku, a
// documentação oficial exige a porta 80 para aplicações web
// (docs.shardcloud.app/tutorials/api/express). Para teste local,
// defina PORT=3000 no seu .env.
// -----------------------------------------------------------------
const PORT = process.env.PORT || 80;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
// Origem pública do site (onde share.html abre fora do Discord).
// Se não definir, usa o host da própria requisição.
const SHARE_ORIGIN = process.env.SHARE_ORIGIN || '';
// Segredo para assinar os tokens (JWT HS256). Se não definir, gera um
// aleatório por processo — tokens morrem quando o app reinicia.
const TOKEN_SECRET =
  process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[aviso] CLIENT_ID ou CLIENT_SECRET não definidos no .env — a troca de token OAuth vai falhar.');
}
if (!process.env.TOKEN_SECRET) {
  console.warn('[aviso] TOKEN_SECRET não definido no .env — usando segredo temporário desta execução.');
}

app.use(express.json({ limit: '256kb' }));

// CORS + headers obrigatórios para Discord Activity
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

  // Remove qualquer X-Frame-Options que o Express ou o host possam adicionar —
  // ele conflita com o frame-ancestors acima e bloqueia o iframe do Discord.
  res.removeHeader('X-Frame-Options');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// -----------------------------------------------------------------
// Tokens: <payloadBase64url>.<assinaturaHMAC-SHA256> — mesmo formato
// da referência, cujo share.js lê o payload no primeiro segmento.
// Payload com {room, uid, name, av, guild, channel, role[, exp]}.
// A verificação aceita também o formato JWT padrão (header.payload.sig).
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
// visualizadores e conexões de controle da página de captura.
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
    room.emptyTimer = setTimeout(() => rooms.delete(room.id), ROOM_TTL_MS);
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
  for (const b of room.broadcasters.values()) seen.set(b.userId, b.name);
  for (const v of room.viewers.values()) seen.set(v.userId, v.name);
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function sendStateToViewers(room) {
  const state = {
    type: 'state',
    participants: participants(room),
    abas: [],
    room: null,
    streams: activeStreams(room),
  };
  for (const v of room.viewers) safeSend(v.ws, state);
}

function sendViewersCount(room) {
  const msg = { type: 'state', viewers: room.viewers.size };
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

const WS_OPEN = 1; // ws.ReadyState.Open — evita depender do global WebSocket

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
            reject(new Error('Resposta inválida do Discord'));
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

// API: Sessão — valida o access_token no Discord e devolve os tokens
// (visualizador + transmissor) e a URL da página de captura.
app.post('/api/session', async (req, res) => {
  const { access_token, guild_id, channel_id } = req.body || {};
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  let user;
  try {
    user = await discordApi('/api/users/@me', access_token);
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao validar token no Discord: ' + e.message });
  }
  if (!user || !user.id) return res.status(401).json({ error: 'Token inválido' });

  const name = user.global_name || user.username || 'Convidado';
  const guild = guild_id ? String(guild_id) : null;
  const channel = channel_id ? String(channel_id) : null;
  const roomId = guild && channel ? `call-${guild}-${channel}` : `user-${user.id}`;

  const base = { room: roomId, uid: user.id, name, av: user.avatar || '', guild: guild || '', channel: channel || '' };

  getRoom(roomId); // garante que a sala exista desde já

  res.json({
    roomId,
    user: { id: user.id, name, av: user.avatar },
    viewerToken: signToken({ ...base, role: 'viewer' }),
    broadcasterToken: signToken({ ...base, role: 'broadcaster' }),
    shareUrl: `${publicOrigin(req)}/share.html`,
  });
});

// API: Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------------------------
// Relay WebSocket: /ws?t=<token>[&fonte=tela|camera][&modo=controle]
//
// Papéis:
//  - fonte=...     → transmissor (recebe um slot, repacota nada: só repassa)
//  - modo=controle → canal de controle da aba de captura
//  - resto         → visualizador
//
// Formato binário (vídeo e áudio), definido pelo broadcaster.js:
//   [1B slot][1B tipo][8B timestamp f64][8B relógio envio f64][payload]
// -----------------------------------------------------------------

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rodando na porta ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`Sem permissão para abrir a porta ${PORT}. No Shard Cloud use a porta 80 (padrão). Testando local? Defina PORT=3000 no .env.`);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso por outro processo.`);
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
  // Remove o prefixo /.proxy do INÍCIO do path (Discord proxy encaminha como /.proxy/ws,
  // não /ws/.proxy). O regex anterior removia do final e nunca casava dentro do Discord.
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
    ws.send(JSON.stringify({ type: 'error', message: 'Token inválido.' }));
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
    ws.send(JSON.stringify({ type: 'error', message: 'Token sem permissão de transmissão.' }));
    ws.close(4003, 'sem permissao');
    return;
  }

  // Uma transmissão por usuário/fonte: segunda conexão é recusada.
  for (const b of room.broadcasters.values()) {
    if (b.userId === payload.uid && b.fonte === fonte) {
      ws.send(JSON.stringify({ type: 'error', message: 'Você já está transmitindo desta fonte nesta sala.' }));
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
        broadcastStreamStart(room, b);
        sendStateToViewers(room);
        break;
      case 'config':
        b.config = msg.config;
        forwardConfig(room, b, 'config');
        sendStateToViewers(room);
        break;
      case 'audio-config':
        b.audioConfig = msg.config;
        forwardConfig(room, b, 'audio-config');
        sendStateToViewers(room);
        break;
      case 'stop':
        if (b.active) {
          b.active = false;
          broadcastStreamStop(room, b.slot);
          sendStateToViewers(room);
        }
        break;
      case 'native-audio-start':
        // Captura nativa do Firefox depende de um agente na máquina do
        // usuário; este servidor não oferece isso.
        safeSend(ws, {
          type: 'native-audio-error',
          message: 'Áudio nativo do Firefox não está disponível neste servidor.',
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
      broadcastStreamStop(room, b.slot);
    }
    sendStateToViewers(room);
    sendViewersCount(room);
    maybeCloseRoom(room);
  });
}

// --------------------------------------------------------------- controle

function attachControl(ws, room) {
  room.controls.add(ws);

  ws.on('message', (data) => {
    // Controle só escuta; nada chega dele na referência.
  });

  ws.on('close', () => {
    room.controls.delete(ws);
    maybeCloseRoom(room);
  });
}

// ------------------------------------------------------------ visualizador

function attachViewer(ws, room, payload) {
  const v = { ws, userId: payload.uid, name: payload.name };
  room.viewers.add(v);

  // Ordem importa: cada stream ativa vai com config antes de qualquer quadro.
  const streams = activeStreams(room);
  safeSend(ws, { type: 'state', participants: participants(room), abas: [], room: null, streams });
  for (const s of streams) {
    if (s.config) safeSend(ws, { type: 'config', slot: s.slot, config: s.config });
    if (s.audioConfig) safeSend(ws, { type: 'audio-config', slot: s.slot, config: s.audioConfig });
  }
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
      sendStateToViewers(room);
    } else if (msg.type === 'need-keyframe') {
      // Visualizador recriou o decoder (ex.: resolução mudou no meio do ar):
      // pede um ponto de partida novo aos transmissores ativos.
      for (const b of room.broadcasters.values()) {
        if (b.active) safeSend(b.ws, { type: 'need-keyframe' });
      }
    } else if (msg.type === 'start-broadcast') {
      // A atividade pediu uma fonte pela interface: repassa às abas de captura.
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
    sendViewersCount(room);
    sendStateToViewers(room);
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
