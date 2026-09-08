const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'data', 'stats.json');
let cache = null;
const listeners = new Set();

function emptyStats() {
  return { totalOrbs: 0, users: {}, countedQuests: {}, updatedAt: null };
}

function loadStats() {
  if (cache) return cache;
  try {
    cache = fs.existsSync(statsPath)
      ? { ...emptyStats(), ...JSON.parse(fs.readFileSync(statsPath, 'utf8')) }
      : emptyStats();
  } catch (_) {
    cache = emptyStats();
  }
  return cache;
}

function saveStats() {
  const dir = path.dirname(statsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statsPath, JSON.stringify(loadStats(), null, 2));
  for (const listener of listeners) {
    try { listener(); } catch (_) {}
  }
}

function onStatsChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensureUser(userId, username = '') {
  const stats = loadStats();
  const id = String(userId);
  if (!stats.users[id]) stats.users[id] = { username: '', uses: 0, quests: 0, orbs: 0 };
  if (username) stats.users[id].username = String(username).replace(/^@/, '').slice(0, 100);
  return stats.users[id];
}

function recordUsage(userId, username) {
  const user = ensureUser(userId, username);
  user.uses += 1;
  loadStats().updatedAt = Date.now();
  saveStats();
}

function recordQuest(userId, username) {
  const user = ensureUser(userId, username);
  user.quests += 1;
  loadStats().updatedAt = Date.now();
  saveStats();
}

function recordOrbs(userId, username, amount) {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return;
  const stats = loadStats();
  const user = ensureUser(userId, username);
  user.orbs += value;
  stats.totalOrbs += value;
  stats.updatedAt = Date.now();
  saveStats();
}

function recordQuestCompletion(userId, username, accountId, questId, orbValue = 0) {
  const stats = loadStats();
  if (!stats.countedQuests || typeof stats.countedQuests !== 'object') stats.countedQuests = {};
  const key = `${String(accountId)}:${String(questId)}`;
  if (stats.countedQuests[key]) return false;
  stats.countedQuests[key] = Date.now();
  const user = ensureUser(userId, username);
  const orbs = Math.max(0, Math.floor(Number(orbValue) || 0));
  user.quests += 1;
  user.orbs += orbs;
  stats.totalOrbs += orbs;
  stats.updatedAt = Date.now();
  saveStats();
  return true;
}

function getStats() {
  const stats = loadStats();
  const ranking = Object.entries(stats.users)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.uses - a.uses || b.quests - a.quests)
    .slice(0, 5);
  return {
    totalOrbs: Number(stats.totalOrbs) || 0,
    totalUsers: Object.keys(stats.users).length,
    ranking,
  };
}

module.exports = { recordUsage, recordQuest, recordOrbs, recordQuestCompletion, getStats, onStatsChange };
