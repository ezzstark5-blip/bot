const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../data/closedDMs.json');

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function storeKey(ownerId, accountId) {
  return `${ownerId}:${accountId}`;
}

function saveClosedDMs(ownerId, accountId, recipientIds) {
  const data = readStore();
  const key = storeKey(ownerId, accountId);
  data[key] = [...new Set([...(data[key] || []), ...recipientIds.map(String)])];
  writeStore(data);
}

function getClosedDMs(ownerId, accountId) {
  const data = readStore();
  return Array.isArray(data[storeKey(ownerId, accountId)]) ? data[storeKey(ownerId, accountId)].map(String) : [];
}

function removeClosedDMs(ownerId, accountId, recipientIds) {
  const data = readStore();
  const key = storeKey(ownerId, accountId);
  const removed = new Set(recipientIds.map(String));
  data[key] = (data[key] || []).map(String).filter((id) => !removed.has(id));
  if (!data[key].length) delete data[key];
  writeStore(data);
}

module.exports = { saveClosedDMs, getClosedDMs, removeClosedDMs };
