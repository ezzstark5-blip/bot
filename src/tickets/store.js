import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DATA_FILE = join(DATA_DIR, 'tickets.json');

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, '{}', 'utf8');
}

function read() {
  ensure();
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function write(data) {
  ensure();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function saveTicket(channelId, data) {
  const all = read();
  all[channelId] = { ...all[channelId], ...data };
  write(all);
}

export function getTicket(channelId) {
  return read()[channelId] || null;
}

export function deleteTicket(channelId) {
  const all = read();
  delete all[channelId];
  write(all);
}

export async function findOpenTicketByUser(guild, userId) {
  const all = read();
  const entry = Object.entries(all).find(([, t]) => t.ownerId === userId && t.status === 'open');
  if (!entry) return null;

  const [channelId, ticket] = entry;
  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    deleteTicket(channelId);
    return null;
  }

  return [channelId, ticket];
}