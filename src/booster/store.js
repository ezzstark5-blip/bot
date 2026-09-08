import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, 'orders.json');

function ensure() {
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify({ orders: {} }, null, 2));
  }
}

function load() {
  ensure();
  try {
    const data = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (!data.orders || typeof data.orders !== 'object') return { orders: {} };
    return data;
  } catch {
    return { orders: {} };
  }
}

function save(data) {
  ensure();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function createExternalId(userId) {
  return `booster-${userId}-${randomBytes(4).toString('hex')}`;
}

export function upsertOrder(order) {
  const data = load();
  data.orders[order.id] = order;
  save(data);
  return order;
}

export function getOrder(id) {
  return load().orders[id] || null;
}

export function getOrderByExternalId(externalId) {
  return Object.values(load().orders).find((o) => o.externalId === externalId) || null;
}

export function getPendingOrderForUser(userId) {
  return (
    Object.values(load().orders).find(
      (o) => o.userId === String(userId) && o.status === 'PENDENTE'
    ) || null
  );
}

export function listOrders() {
  return Object.values(load().orders);
}
