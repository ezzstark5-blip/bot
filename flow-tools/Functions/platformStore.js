const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../data/platforms.json');
const ALLOWED = new Set(['desktop', 'mobile', 'web', 'android', 'iphone', 'ps5', 'xbox', 'vr']);

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
  } catch (_) { return {}; }
}

function key(ownerId, accountId) {
  return `${ownerId}:${accountId}`;
}

function getPlatform(ownerId, accountId) {
  const value = readStore()[key(ownerId, accountId)];
  return ALLOWED.has(value) ? value : 'desktop';
}

function setPlatform(ownerId, accountId, platform) {
  if (!ALLOWED.has(platform)) throw new Error('Plataforma inválida.');
  const data = readStore();
  data[key(ownerId, accountId)] = platform;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { getPlatform, setPlatform };
