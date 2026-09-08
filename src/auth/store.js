import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, '..', '..', 'data', 'auth-members.json');

function ensure() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify({ members: {} }, null, 2));
  }
}

function load() {
  ensure();
  try {
    const data = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (!data.members || typeof data.members !== 'object') return { members: {} };
    return data;
  } catch {
    return { members: {} };
  }
}

function save(data) {
  ensure();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function upsertAuthMember(member) {
  const data = load();
  const prev = data.members[member.id] || {};
  data.members[member.id] = {
    ...prev,
    ...member,
    joinedGuilds: Array.isArray(member.joinedGuilds)
      ? member.joinedGuilds
      : prev.joinedGuilds || [],
    updatedAt: Date.now(),
  };
  save(data);
  return data.members[member.id];
}

export function getAuthMember(userId) {
  return load().members[String(userId)] || null;
}

export function listAuthMembers() {
  return Object.values(load().members).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

export function markJoinedGuild(userId, guildId) {
  const data = load();
  const m = data.members[String(userId)];
  if (!m) return null;
  const set = new Set(m.joinedGuilds || []);
  set.add(String(guildId));
  m.joinedGuilds = [...set];
  m.updatedAt = Date.now();
  save(data);
  return m;
}

export function countAuthMembers() {
  return Object.keys(load().members).length;
}
