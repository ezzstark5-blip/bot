import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');

const DEFAULTS = {
  title: 'Acesso Boost',
  description:
    '• Tenha acesso ao Boost e aproveite\n• todos os benefícios disponíveis em um só lugar.',
  price: 6.5,
  stockLabel: '∞ Unidade(s) disponíveis',
  bannerUrl: '',
  roleId: '',
  color: 0xffffff,
  cartCategoryId: '1546353915505680474',
};

function ensure() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
  }
}

export function loadBoosterConfig() {
  ensure();
  let file = {};
  try {
    file = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    file = {};
  }

  const priceEnv = process.env.BOOSTER_PRICE;
  const price = priceEnv != null && priceEnv !== '' ? Number(priceEnv) : Number(file.price ?? DEFAULTS.price);

  return {
    title: process.env.BOOSTER_TITLE || file.title || DEFAULTS.title,
    description: process.env.BOOSTER_DESCRIPTION || file.description || DEFAULTS.description,
    price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : DEFAULTS.price,
    stockLabel: file.stockLabel || DEFAULTS.stockLabel,
    bannerUrl: process.env.BOOSTER_BANNER_URL || file.bannerUrl || DEFAULTS.bannerUrl,
    roleId: process.env.BOOSTER_ROLE_ID || file.roleId || DEFAULTS.roleId,
    color: file.color ?? DEFAULTS.color,
    cartCategoryId:
      process.env.BOOSTER_CART_CATEGORY || file.cartCategoryId || DEFAULTS.cartCategoryId,
    apiKey: process.env.STORM_WALLET_API_KEY || '',
    baseUrl: (process.env.STORM_WALLET_BASE || 'https://wallet.stormapplications.com').replace(/\/$/, ''),
    webhookSecret: process.env.STORM_WEBHOOK_SECRET || '',
  };
}

export function saveBoosterConfig(partial) {
  ensure();
  const current = loadBoosterConfig();
  const next = {
    title: partial.title ?? current.title,
    description: partial.description ?? current.description,
    price: partial.price ?? current.price,
    stockLabel: partial.stockLabel ?? current.stockLabel,
    bannerUrl: partial.bannerUrl ?? current.bannerUrl,
    roleId: partial.roleId ?? current.roleId,
    color: partial.color ?? current.color,
    cartCategoryId: partial.cartCategoryId ?? current.cartCategoryId,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return loadBoosterConfig();
}

export function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
