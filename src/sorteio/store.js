import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, 'giveaways.json');

function ensure() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify({ giveaways: {} }, null, 2));
  }
}

export function loadGiveaways() {
  ensure();
  try {
    const data = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (!data.giveaways || typeof data.giveaways !== 'object') return { giveaways: {} };
    return data;
  } catch {
    return { giveaways: {} };
  }
}

export function saveGiveaways(data) {
  ensure();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function createId() {
  return randomBytes(4).toString('hex');
}

export function getGiveaway(id) {
  return loadGiveaways().giveaways[id] || null;
}

export function upsertGiveaway(giveaway) {
  const data = loadGiveaways();
  data.giveaways[giveaway.id] = giveaway;
  saveGiveaways(data);
  return giveaway;
}

export function deleteGiveaway(id) {
  const data = loadGiveaways();
  delete data.giveaways[id];
  saveGiveaways(data);
}

export function listActiveGiveaways() {
  const data = loadGiveaways();
  return Object.values(data.giveaways).filter((g) => !g.ended);
}

export function listAllGiveaways() {
  return Object.values(loadGiveaways().giveaways);
}

/** @type {Map<string, object>} */
export const drafts = new Map();

export function getDraft(userId) {
  return drafts.get(String(userId)) || null;
}

export function setDraft(userId, draft) {
  drafts.set(String(userId), draft);
  return draft;
}

export function clearDraft(userId) {
  drafts.delete(String(userId));
}

export function defaultDraft(userId, channelId, guildId) {
  return {
    userId: String(userId),
    guildId: String(guildId || ''),
    channelId: String(channelId || ''),
    prize: '',
    winnersCount: 1,
    durationMs: 60 * 60 * 1000,
    durationLabel: '1 hora',
    minRoleId: null,
    description: 'Clique em **Participar** para entrar!',
  };
}

export const DURATION_OPTIONS = [
  { label: '1 minuto', value: '60s', ms: 60_000 },
  { label: '5 minutos', value: '5m', ms: 5 * 60_000 },
  { label: '10 minutos', value: '10m', ms: 10 * 60_000 },
  { label: '30 minutos', value: '30m', ms: 30 * 60_000 },
  { label: '1 hora', value: '1h', ms: 60 * 60_000 },
  { label: '6 horas', value: '6h', ms: 6 * 60 * 60_000 },
  { label: '12 horas', value: '12h', ms: 12 * 60 * 60_000 },
  { label: '1 dia', value: '1d', ms: 24 * 60 * 60_000 },
  { label: '3 dias', value: '3d', ms: 3 * 24 * 60 * 60_000 },
  { label: '7 dias', value: '7d', ms: 7 * 24 * 60 * 60_000 },
  { label: '14 dias', value: '14d', ms: 14 * 24 * 60 * 60_000 },
];
