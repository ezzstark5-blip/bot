/**
 * Multi-contas (formato bya)
 */
const fs = require('fs');
const path = require('path');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const tokensPath = path.join(__dirname, '..', 'data', 'token.json');
const legacyTokensPath = path.join(__dirname, '..', 'data', 'tokens.json');
let cache = null;

function ensureDir() {
  const d = path.dirname(tokensPath);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function loadAll() {
  if (cache) return cache;
  if (!fs.existsSync(tokensPath) && fs.existsSync(legacyTokensPath)) {
    ensureDir();
    fs.renameSync(legacyTokensPath, tokensPath);
  }
  if (!fs.existsSync(tokensPath)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  } catch {
    cache = {};
  }
  for (const [k, v] of Object.entries(cache)) {
    if (typeof v === 'string') cache[k] = { accounts: [] };
    if (v && !Array.isArray(v.accounts)) cache[k] = { accounts: [] };
  }
  return cache;
}

function saveAll(data) {
  ensureDir();
  cache = data;
  fs.writeFileSync(tokensPath, JSON.stringify(data, null, 2));
  try {
    fs.chmodSync(tokensPath, 0o600);
  } catch (_) {}
}

function listAccounts(userId) {
  const all = loadAll();
  const id = String(userId);
  if (!all[id]?.accounts) return [];
  return all[id].accounts.slice();
}

function getAccountTotals() {
  const all = loadAll();
  const entries = Object.values(all).filter((entry) => Array.isArray(entry?.accounts) && entry.accounts.length);
  return {
    users: entries.length,
    accounts: entries.reduce((total, entry) => total + entry.accounts.length, 0),
  };
}

function getAccount(userId, accountId) {
  return listAccounts(userId).find((a) => String(a.id) === String(accountId)) || null;
}

function getToken(userId, accountId) {
  return getAccount(userId, accountId)?.token || null;
}

async function validateToken(token) {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: token.trim() },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function addAccount(userId, token, profile) {
  const all = loadAll();
  const id = String(userId);
  if (!all[id]) all[id] = { accounts: [] };
  const accounts = all[id].accounts;
  const accId = String(profile.id);
  const entry = {
    id: accId,
    username: profile.username || 'user',
    globalName: profile.global_name || profile.username || 'user',
    avatar: profile.avatar || null,
    token: token.trim(),
  };
  const i = accounts.findIndex((a) => String(a.id) === accId);
  if (i >= 0) accounts[i] = entry;
  else accounts.push(entry);
  saveAll(all);
  return entry;
}

function removeAccount(userId, accountId) {
  const all = loadAll();
  const id = String(userId);
  if (!all[id]?.accounts) return false;
  const before = all[id].accounts.length;
  all[id].accounts = all[id].accounts.filter((a) => String(a.id) !== String(accountId));
  saveAll(all);
  return all[id].accounts.length < before;
}

/** Modal idêntico ao print bya "Adicionar conta" */
function buildTokenModal(customId = 'sf_modal_add_account') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Adicionar conta')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_token')
          .setLabel('Token da conta')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Fica só com você · usado pra usar as ferramentas nessa conta. Não compartilhe.')
          .setRequired(true)
          .setMinLength(50)
          .setMaxLength(200)
      )
    );
}

module.exports = {
  listAccounts,
  getAccountTotals,
  getAccount,
  getToken,
  validateToken,
  addAccount,
  removeAccount,
  buildTokenModal,
};
