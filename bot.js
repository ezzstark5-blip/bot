/**
 * Bot do Discord — status "Analisando telas"
 *
 * Conecta ao Gateway do Discord e define a presença do bot.
 * O token vem da variável de ambiente BOT_TOKEN — nunca hardcoded.
 */

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.warn('[bot] BOT_TOKEN não definido — bot de status não iniciado.');
  return;
}

const WebSocket = require('ws');

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

let ws = null;
let heartbeatInterval = null;
let sequence = null;
let reconnectDelay = 5000;

function connect() {
  ws = new WebSocket(GATEWAY);

  ws.on('open', () => {
    console.log('[bot] Conectado ao Gateway do Discord.');
    reconnectDelay = 5000;
  });

  ws.on('message', (data) => {
    let payload;
    try { payload = JSON.parse(data); } catch { return; }

    const { op, d, s } = payload;
    if (s) sequence = s;

    switch (op) {
      // Hello — inicia heartbeat e identifica
      case 10:
        startHeartbeat(d.heartbeat_interval);
        identify();
        break;

      // Heartbeat ACK — nada a fazer
      case 11:
        break;

      // Dispatch
      case 0:
        if (payload.t === 'READY') {
          console.log(`[bot] Logado como ${d.user.username}#${d.user.discriminator}`);
          updatePresence();
        }
        break;

      // Reconnect
      case 7:
        reconnect();
        break;

      // Invalid Session
      case 9:
        setTimeout(identify, 2000);
        break;
    }
  });

  ws.on('close', (code) => {
    console.warn(`[bot] Gateway fechado (${code}). Reconectando em ${reconnectDelay / 1000}s…`);
    cleanup();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  ws.on('error', (err) => {
    console.error('[bot] Erro no Gateway:', err.message);
  });
}

function startHeartbeat(interval) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 1, d: sequence }));
    }
  }, interval);
}

function identify() {
  ws.send(JSON.stringify({
    op: 2,
    d: {
      token: BOT_TOKEN,
      intents: 0,
      properties: {
        os: 'linux',
        browser: 'next-transmissoes',
        device: 'next-transmissoes',
      },
      presence: buildPresence(),
    },
  }));
}

function buildPresence() {
  return {
    status: 'online',
    afk: false,
    since: null,
    activities: [
      {
        name: 'Analisando telas',
        type: 4, // 4 = CUSTOM_STATUS
        state: 'Analisando telas',
        emoji: {
          name: 'dowload',
          id: '1537636547912802355',
          animated: false,
        },
      },
    ],
  };
}

function updatePresence() {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    op: 3,
    d: buildPresence(),
  }));
}

function reconnect() {
  cleanup();
  setTimeout(connect, 1000);
}

function cleanup() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try { ws?.close(); } catch {}
  ws = null;
}

// Inicia a conexão
connect();

module.exports = { updatePresence };
