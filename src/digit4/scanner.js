import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { ET } from '../emojis.js';
import { logError, logInfo } from '../logs/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', '..', 'data', 'digit4.json');
const COLOR = 0xffffff;
const V2 = MessageFlags.IsComponentsV2;
const CHECK_URL = 'https://discord.com/api/v9/unique-username/username-attempt-unauthed';

/**
 * Discord username: a-z, 0-9, _ e .
 * Varre nomes com 4, 5 e 6 caracteres (letra + número).
 */
const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789_.';
const BASE = CHARSET.length; // 38
const LENGTHS = [4, 5, 6];

const TOTAL = Object.fromEntries(
  LENGTHS.map((len) => [len, BASE ** len])
);

const DEFAULT_CHANNEL = '1546725534279401574';

/** @type {import('discord.js').Client | null} */
let botClient = null;
/** @type {NodeJS.Timeout | null} */
let loopTimer = null;
let running = false;
let checking = false;

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function cfg() {
  return {
    channelId: process.env.DIGIT4_CHANNEL || DEFAULT_CHANNEL,
    delayMs: Math.max(800, Number(process.env.DIGIT4_DELAY_MS || 1200)),
    autoStart: String(process.env.DIGIT4_AUTO_START || 'true').toLowerCase() !== 'false',
  };
}

/** Converte índice → username no charset (ex: 0 → aaaa). */
function indexToUsername(index, len) {
  const total = TOTAL[len];
  let n = ((Number(index) % total) + total) % total;
  let out = '';
  for (let i = 0; i < len; i++) {
    out = CHARSET[n % BASE] + out;
    n = Math.floor(n / BASE);
  }
  return out;
}

function emptyStore() {
  return {
    index4: 0,
    index5: 0,
    index6: 0,
    turn: 4,
    found: [],
    announced: {},
    running: false,
    checks: 0,
    mode: 'alnum',
  };
}

function readStore() {
  try {
    if (!existsSync(DATA_PATH)) return emptyStore();
    const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    // Se o store antigo era só numérico, reinicia índices no modo alnum
    const mode = raw.mode === 'alnum' ? 'alnum' : 'legacy';
    const reset = mode !== 'alnum';
    return {
      index4: reset ? 0 : Number(raw.index4) || 0,
      index5: reset ? 0 : Number(raw.index5) || 0,
      index6: reset ? 0 : Number(raw.index6) || 0,
      turn: LENGTHS.includes(Number(raw.turn)) ? Number(raw.turn) : 4,
      found: Array.isArray(raw.found) ? raw.found : [],
      announced: raw.announced && typeof raw.announced === 'object' ? raw.announced : {},
      running: Boolean(raw.running),
      checks: reset ? 0 : Number(raw.checks) || 0,
      mode: 'alnum',
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  const dir = dirname(DATA_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    DATA_PATH,
    JSON.stringify(
      {
        mode: 'alnum',
        index4: store.index4 % TOTAL[4],
        index5: store.index5 % TOTAL[5],
        index6: store.index6 % TOTAL[6],
        turn: store.turn,
        found: store.found.slice(-800),
        announced: store.announced,
        running: store.running,
        checks: store.checks || 0,
        updatedAt: Date.now(),
      },
      null,
      2
    ),
    'utf8'
  );
}

function indexKey(len) {
  return `index${len}`;
}

function nextTurn(current) {
  const i = LENGTHS.indexOf(current);
  return LENGTHS[(i + 1) % LENGTHS.length];
}

function peekNext(store) {
  const len = store.turn;
  const key = indexKey(len);
  return { len, username: indexToUsername(store[key], len) };
}

export function buildDigit4AvailablePanel(username) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Username liberado`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.edit} **User**`,
          `\`${username}\``,
          '',
          `${ET.raio} **Tipo**`,
          `${username.length} caracteres (letra / número)`,
          '',
          `${ET.tempo} **Detectado**`,
          `<t:${Math.floor(Date.now() / 1000)}:F>`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${ET.bot} Scanner · 4–6 chars a-z 0-9 _ .`)
    );

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: [] },
  };
}

export function buildDigit4StatusPanel() {
  const store = readStore();
  const { delayMs, channelId } = cfg();
  const next = peekNext(store);
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Scanner usernames 4–6`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.raio} **Status:** ${running ? 'rodando' : 'parado'}`,
          `${ET.edit} **Próximo:** \`${next.username}\` (${next.len} chars)`,
          `${ET.tempo} **Charset:** \`a-z\` \`0-9\` \`_\` \`.\``,
          `${ET.check} **Liberados:** **${store.found.length}**`,
          `${ET.bot} **Checks:** **${store.checks || 0}** · delay \`${delayMs}ms\``,
          `${ET.bot} **Canal:** <#${channelId}>`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${ET.bot} Rodízio 4↔5↔6 · <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

async function checkUsername(username) {
  // Discord rejeita username começando/terminando com . ou __ consecutivos em alguns casos;
  // a API responde taken/invalid — seguimos.
  const res = await fetch(CHECK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; BotHm/2.0)',
    },
    body: JSON.stringify({ username }),
  });

  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') || 5);
    return { ok: false, rateLimited: true, retryAfter: retry };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, available: data.taken === false, raw: data };
}

async function announceAvailable(username) {
  const store = readStore();
  if (store.announced[username]) return;

  const channelId = cfg().channelId;
  if (!botClient || !channelId) return;

  const ch =
    botClient.channels.cache.get(channelId) ||
    (await botClient.channels.fetch(channelId).catch(() => null));
  if (!ch?.isTextBased?.()) {
    logError({ event: 'DIGIT4_CHANNEL_MISSING', channelId });
    return;
  }

  await ch.send(buildDigit4AvailablePanel(username));

  store.announced[username] = Date.now();
  if (!store.found.includes(username)) store.found.push(username);
  store.running = running;
  writeStore(store);

  logInfo({ event: 'DIGIT4_AVAILABLE', username, chars: username.length });
}

function advanceStore(store, len) {
  const key = indexKey(len);
  store[key] = (store[key] + 1) % TOTAL[len];
  store.turn = nextTurn(len);
  store.checks = (store.checks || 0) + 1;
  store.running = true;
  store.mode = 'alnum';
}

async function tick() {
  if (!running || checking) return;
  checking = true;

  try {
    const store = readStore();
    const len = store.turn;
    const key = indexKey(len);
    const username = indexToUsername(store[key], len);
    const result = await checkUsername(username);

    if (result.rateLimited) {
      const wait = Math.max(result.retryAfter || 5, 5) * 1000;
      logInfo({ event: 'DIGIT4_RATE_LIMIT', waitMs: wait, username });
      checking = false;
      scheduleNext(wait);
      return;
    }

    if (!result.ok) {
      logError({
        event: 'DIGIT4_CHECK_FAIL',
        username,
        status: result.status,
        message: result.error,
      });
      advanceStore(store, len);
      writeStore(store);
      checking = false;
      scheduleNext(cfg().delayMs * 2);
      return;
    }

    if (result.available) {
      await announceAvailable(username);
    } else if ((store.checks || 0) % 30 === 0) {
      logInfo({
        event: 'DIGIT4_PROGRESS',
        checked: username,
        chars: len,
        found: store.found.length,
        checks: store.checks,
      });
    }

    advanceStore(store, len);
    writeStore(store);
  } catch (err) {
    logError({ event: 'DIGIT4_TICK_ERROR', message: err.message });
  } finally {
    checking = false;
  }

  if (running) scheduleNext(cfg().delayMs);
}

function scheduleNext(ms) {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = setTimeout(() => {
    tick().catch(() => null);
  }, ms);
}

export function startDigit4Scanner(client) {
  if (client) botClient = client;
  if (running) return { ok: true, already: true };
  running = true;
  const store = readStore();
  store.running = true;
  store.mode = 'alnum';
  writeStore(store);
  logInfo({
    event: 'DIGIT4_STARTED',
    mode: 'alnum',
    charset: CHARSET,
    index4: store.index4,
    index5: store.index5,
    index6: store.index6,
    channelId: cfg().channelId,
  });
  scheduleNext(500);
  return { ok: true, already: false };
}

export function stopDigit4Scanner() {
  running = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  const store = readStore();
  store.running = false;
  writeStore(store);
  logInfo({ event: 'DIGIT4_STOPPED' });
  return { ok: true };
}

export function isDigit4Running() {
  return running;
}

export function bindDigit4Client(client) {
  botClient = client;
}

export function resumeDigit4Scanner(client) {
  bindDigit4Client(client);
  if (cfg().autoStart) {
    startDigit4Scanner(client);
    return;
  }
  const store = readStore();
  if (store.running) startDigit4Scanner(client);
}
