const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const path = require('path');
const fs = require('fs');
const { logInBackground } = require('../actionLogger');
const { ET, titled } = require('../emojis');

// ========== ARMAZENAMENTO JSON (sem módulos nativos) ==========
const STORE_PATH = path.join(__dirname, '../../data/watcher.json');
const emptyStore = () => ({ logs: [], history: [], filters: [], cooldowns: {}, stats: {}, webhooks: {} });
function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}
const store = loadStore();
let saveTimer = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      const temp = `${STORE_PATH}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(store), 'utf8');
      fs.renameSync(temp, STORE_PATH);
    } catch (error) {
      console.error('[WATCHER STORE]', error?.message || error);
    }
  }, 250);
  saveTimer.unref?.();
}
const storeKey = (ownerId, accountId, targetId, suffix = '') =>
  `${ownerId}:${accountId}:${targetId}${suffix ? `:${suffix}` : ''}`;

// ========== HELPERS ==========
function now() { return Date.now(); }

function logEvent(ownerId, accountId, targetId, eventType, serverId = null, channelId = null, content = null) {
  store.logs.push({ owner_id: ownerId, account_id: accountId, target_id: targetId, event_type: eventType, server_id: serverId, channel_id: channelId, content, timestamp: now() });
  if (store.logs.length > 5000) store.logs.splice(0, store.logs.length - 5000);
  saveStore();
}

function logHistory(ownerId, accountId, targetId, eventType, serverName, channelName, details) {
  store.history.push({ owner_id: ownerId, account_id: accountId, target_id: targetId, event_type: eventType, server_name: serverName, channel_name: channelName, details, timestamp: now() });
  if (store.history.length > 5000) store.history.splice(0, store.history.length - 5000);
  saveStore();
}

function getHistory(ownerId, accountId, targetId, limit = 20, eventType = null) {
  return store.history
    .filter((row) => String(row.owner_id) === String(ownerId) && String(row.account_id) === String(accountId) && String(row.target_id) === String(targetId) && (!eventType || row.event_type === eventType))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

function getStats(ownerId, accountId, targetId) {
  return store.stats[storeKey(ownerId, accountId, targetId)] || { total_voice_seconds: 0, total_messages: 0 };
}

function updateStats(ownerId, accountId, targetId, field, value) {
  const id = storeKey(ownerId, accountId, targetId);
  store.stats[id] ||= { total_voice_seconds: 0, total_messages: 0 };
  store.stats[id][field] = Number(store.stats[id][field] || 0) + Number(value || 0);
  saveStore();
}

function getFilters(ownerId, accountId, targetId, filterType = null) {
  return store.filters.filter((row) => String(row.owner_id) === String(ownerId) && String(row.account_id) === String(accountId) && String(row.target_id) === String(targetId) && (!filterType || row.filter_type === filterType));
}

function addFilter(ownerId, accountId, targetId, filterType, value) {
  const exists = store.filters.some((row) => String(row.owner_id) === String(ownerId) && String(row.account_id) === String(accountId) && String(row.target_id) === String(targetId) && row.filter_type === filterType && row.value === value);
  if (!exists) store.filters.push({ owner_id: ownerId, account_id: accountId, target_id: targetId, filter_type: filterType, value });
  saveStore();
}

function removeFilter(ownerId, accountId, targetId, filterType, value) {
  store.filters = store.filters.filter((row) => !(String(row.owner_id) === String(ownerId) && String(row.account_id) === String(accountId) && String(row.target_id) === String(targetId) && row.filter_type === filterType && row.value === value));
  saveStore();
}

function getCooldown(ownerId, accountId, targetId, eventType) {
  return Number(store.cooldowns[storeKey(ownerId, accountId, targetId, eventType)] || 0);
}

function setCooldown(ownerId, accountId, targetId, eventType, timestamp) {
  store.cooldowns[storeKey(ownerId, accountId, targetId, eventType)] = timestamp;
  saveStore();
}

function getWebhook(ownerId, accountId, targetId) {
  return store.webhooks[storeKey(ownerId, accountId, targetId)] || null;
}

function setWebhook(ownerId, accountId, targetId, url) {
  store.webhooks[storeKey(ownerId, accountId, targetId)] = url;
  saveStore();
}

function deleteWebhook(ownerId, accountId, targetId) {
  delete store.webhooks[storeKey(ownerId, accountId, targetId)];
  saveStore();
}

// ========== CONSTANTES ==========
const THEME = 0xffffff;
const sessions = new Map();
const key = (ownerId, accountId, targetId) => `${ownerId}:${accountId}:${targetId}`;

// ========== VIEWS ==========
function payload(container) {
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function view(title, description, rows = []) {
  const container = new ContainerBuilder().setAccentColor(THEME);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titled(ET.raio, title)}\n${description}`));
  rows.forEach((row) => container.addActionRowComponents(row));
  return payload(container);
}

function accountPicker(accounts) {
  const menu = new StringSelectMenuBuilder().setCustomId('sf_wg_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Vigia', 'Selecione a conta que acompanhará os eventos.', [new ActionRowBuilder().addComponents(menu)]);
}

function targetModal(accountId) {
  return new ModalBuilder().setCustomId(`sf_wg_target_modal:${accountId}`).setTitle('Vigia')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('target_id').setLabel('ID do usuário').setPlaceholder('123456789012345678')
      .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(17).setMaxLength(20)));
}

function controlPanel(session, stats = null) {
  if (!stats) stats = getStats(session.ownerId, session.accountId, session.targetId);
  const voiceTime = stats.total_voice_seconds || 0;
  const hours = Math.floor(voiceTime / 3600);
  const minutes = Math.floor((voiceTime % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_wg_toggle_voice:${session.accountId}:${session.targetId}`).setLabel(`Call: ${session.voice ? 'ligado' : 'desligado'}`).setStyle(session.voice ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_toggle_presence:${session.accountId}:${session.targetId}`).setLabel(`Presença: ${session.presence ? 'ligado' : 'desligado'}`).setStyle(session.presence ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_toggle_messages:${session.accountId}:${session.targetId}`).setLabel(`Mensagens: ${session.messages ? 'ligado' : 'desligado'}`).setStyle(session.messages ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_wg_toggle_activity:${session.accountId}:${session.targetId}`).setLabel(`Jogos: ${session.activity ? 'ligado' : 'desligado'}`).setStyle(session.activity ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_toggle_avatar:${session.accountId}:${session.targetId}`).setLabel(`Avatar: ${session.avatar ? 'ligado' : 'desligado'}`).setStyle(session.avatar ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_toggle_nickname:${session.accountId}:${session.targetId}`).setLabel(`Apelido: ${session.nickname ? 'ligado' : 'desligado'}`).setStyle(session.nickname ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_wg_start:${session.accountId}:${session.targetId}`).setLabel('Ativar').setStyle(ButtonStyle.Success).setDisabled(session.active),
      new ButtonBuilder().setCustomId(`sf_wg_stop:${session.accountId}:${session.targetId}`).setLabel('Desativar').setStyle(ButtonStyle.Danger).setDisabled(!session.active),
      new ButtonBuilder().setCustomId(`sf_wg_back:${session.accountId}`).setLabel('Trocar usuário').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_wg_stats:${session.accountId}:${session.targetId}`).setLabel(`📊 Estatísticas (${timeStr})`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_history:${session.accountId}:${session.targetId}`).setLabel('Histórico').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_filters:${session.accountId}:${session.targetId}`).setLabel('Filtros').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_wg_webhook:${session.accountId}:${session.targetId}`).setLabel('Webhook').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sf_wg_export:${session.accountId}:${session.targetId}`).setLabel('Exportar').setStyle(ButtonStyle.Secondary)
    ),
  ];
  const desc = `**Usuário:** ${session.targetTag || session.targetId}\n-# ${session.active ? 'Monitoramento ativo' : 'Monitoramento inativo'} · ${session.sharedGuilds ? `Servidores compartilhados: ${session.sharedGuilds}` : 'Nenhum servidor em comum'}`;
  return view('Vigia', desc, rows);
}

// ========== NOTIFICAÇÕES ==========
async function notify(bot, ownerId, title, description, extra = null) {
  let user = null;
  try {
    user = await bot.users.fetch(ownerId);
    const dm = await user.createDM();
    const msg = view(title, description);
    msg.flags = MessageFlags.IsComponentsV2;
    if (extra) msg.content = extra;
    await dm.send(msg);
    return true;
  } catch (error) {
    console.error(`[VIGIA DM ${ownerId}] Falha no Components V2:`, error?.message || error);

    // Se o Discord rejeitar os componentes, a notificação ainda chega em texto.
    try {
      if (!user) user = await bot.users.fetch(ownerId);
      const dm = await user.createDM();
      const suffix = extra ? `\n${extra}` : '';
      await dm.send({ content: `**${title}**\n${description}${suffix}`.slice(0, 2000) });
      return true;
    } catch (fallbackError) {
      console.error(`[VIGIA DM ${ownerId}] Falha no envio alternativo:`, fallbackError?.message || fallbackError);
      return false;
    }
  }
}

async function notifyWebhook(ownerId, accountId, targetId, title, description) {
  const url = getWebhook(ownerId, accountId, targetId);
  if (!url) return;
  try {
    const payload = { content: `**${title}**\n${description}` };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (_) {}
}

async function notifyAll(bot, ownerId, accountId, targetId, title, description) {
  const dmSent = await notify(bot, ownerId, title, description);
  await notifyWebhook(ownerId, accountId, targetId, title, description);
  return dmSent;
}

// ========== DETECÇÃO DE SERVIDORES COMPARTILHADOS ==========
async function getSharedGuilds(client, targetId) {
  const shared = [];
  for (const guild of client.guilds.cache.values()) {
    if (guild.members.cache.has(targetId)) {
      shared.push(guild);
      continue;
    }
    let member = null;
    try {
      member = await guild.members.fetch(targetId);
    } catch (_) {
      try {
        const data = await client.api.guilds(guild.id).members(targetId).get();
        if (data) member = guild.members._add(data, true);
      } catch (_) {}
    }
    if (member) shared.push(guild);
  }
  return shared;
}

// ========== HANDLERS ==========
async function attach(session, bot) {
  detach(session);
  const client = session.client;

  // Atualizar servidores compartilhados
  const shared = await getSharedGuilds(client, session.targetId);
  session.sharedGuilds = shared.length;
  session.sharedGuildsList = shared;

  // Handler de voz
  const voice = async (oldState, newState) => {
    const targetId = String(newState?.id || newState?.member?.id || oldState?.id || oldState?.member?.id || '');
    if (!session.voice || targetId !== session.targetId) return;
    const oldChannel = oldState?.channel;
    const newChannel = newState?.channel;
    if (oldChannel?.id === newChannel?.id) return;

    let action = 'trocou de canal';
    let details = '';
    if (!oldChannel && newChannel) {
      action = `entrou em **${newChannel.name}**`;
      details = `Entrou em ${newChannel.name}`;
      // Registrar tempo de call
      session._voiceJoinTime = now();
      // Listar membros presentes
      const members = newChannel.members.filter(m => m.id !== session.targetId);
      if (members.size > 0) {
        const names = members.map(m => m.displayName).join(', ');
        action += ` (com: ${names})`;
        details += ` | Com: ${names}`;
      }
      // Verificar se alguém específico está na call
      if (session.watchlist && session.watchlist.length) {
        const found = members.filter(m => session.watchlist.includes(m.id));
        if (found.size) {
          const names = found.map(m => m.displayName).join(', ');
          action += ` 🔔 **Alvo na call**: ${names}`;
        }
      }
    } else if (oldChannel && !newChannel) {
      action = `saiu de **${oldChannel.name}**`;
      details = `Saiu de ${oldChannel.name}`;
      if (session._voiceJoinTime) {
        const elapsed = Math.floor((now() - session._voiceJoinTime) / 1000);
        updateStats(session.ownerId, session.accountId, session.targetId, 'total_voice_seconds', elapsed);
        session._voiceJoinTime = null;
      }
    } else if (oldChannel && newChannel) {
      action = `trocou de **${oldChannel.name}** para **${newChannel.name}**`;
      details = `Trocou de ${oldChannel.name} para ${newChannel.name}`;
    }

    const guild = newState?.guild || oldState?.guild;
    const serverName = guild?.name || 'Servidor desconhecido';
    const full = `${action}\n-# Servidor: ${serverName}`;
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Call', full);
    logHistory(session.ownerId, session.accountId, session.targetId, `voice_${action.split(' ')[0]}`, serverName, newChannel?.name || oldChannel?.name, details);
    logEvent(session.ownerId, session.accountId, session.targetId, 'voice', guild?.id || null, newChannel?.id || oldChannel?.id, details);
  };

  // Handler de presença
  const presence = async (oldPresence, newPresence) => {
    if (!session.presence || String(newPresence?.userId || '') !== session.targetId) return;
    const before = oldPresence?.status || 'offline';
    const after = newPresence?.status || 'offline';
    if (before === after) return;
    const labels = { online: 'Online', idle: 'Ausente', dnd: 'Não perturbe', offline: 'Offline' };
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Presença', `${session.targetTag} agora está **${labels[after] || after}**.`);
    logHistory(session.ownerId, session.accountId, session.targetId, `presence_${after}`, null, null, `${before} -> ${after}`);
    logEvent(session.ownerId, session.accountId, session.targetId, 'presence', null, null, `${before} -> ${after}`);
  };

  // Handler de mensagem
  const message = async (msg) => {
    if (!session.messages || String(msg?.author?.id || '') !== session.targetId || !msg.guild) return;
    // Filtros
    const content = msg.content || '';
    const filters = getFilters(session.ownerId, session.accountId, session.targetId, 'keyword');
    if (filters.length) {
      const match = filters.some(f => content.toLowerCase().includes(f.value.toLowerCase()));
      if (!match) return;
    }
    // Cooldown
    if (!checkCooldown(session.ownerId, session.accountId, session.targetId, 'message', 10000)) return;
    setCooldown(session.ownerId, session.accountId, session.targetId, 'message', now());

    const trimmed = content.slice(0, 500);
    const link = msg.url || `https://discord.com/channels/${msg.guild.id}/${msg.channel.id}/${msg.id}`;
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Mensagem', `**${msg.guild.name} · ${msg.channel?.name || 'canal'}**\n${trimmed}\n-# ${link}`);
    logHistory(session.ownerId, session.accountId, session.targetId, 'message', msg.guild.name, msg.channel?.name, trimmed);
    logEvent(session.ownerId, session.accountId, session.targetId, 'message', msg.guild.id, msg.channel.id, trimmed);
    updateStats(session.ownerId, session.accountId, session.targetId, 'total_messages', 1);
  };

  // Handler de edição de mensagem
  const messageUpdate = async (oldMsg, newMsg) => {
    if (!session.messages || String(newMsg?.author?.id || '') !== session.targetId || !newMsg.guild) return;
    if (oldMsg.content === newMsg.content) return;
    const before = oldMsg.content || '(vazio)';
    const after = newMsg.content || '(vazio)';
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Edição', `**${newMsg.guild.name} · ${newMsg.channel?.name}**\nAntes: ${before.slice(0, 200)}\nDepois: ${after.slice(0, 200)}`);
    logHistory(session.ownerId, session.accountId, session.targetId, 'message_edit', newMsg.guild.name, newMsg.channel?.name, `Antes: ${before} | Depois: ${after}`);
    logEvent(session.ownerId, session.accountId, session.targetId, 'message_edit', newMsg.guild.id, newMsg.channel.id, after);
  };

  // Handler de exclusão de mensagem
  const messageDelete = async (msg) => {
    if (!session.messages || String(msg?.author?.id || '') !== session.targetId || !msg.guild) return;
    const content = msg.content || '(sem conteúdo)';
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Exclusão', `**${msg.guild.name} · ${msg.channel?.name}**\nDeletou: ${content.slice(0, 200)}`);
    logHistory(session.ownerId, session.accountId, session.targetId, 'message_delete', msg.guild.name, msg.channel?.name, content);
    logEvent(session.ownerId, session.accountId, session.targetId, 'message_delete', msg.guild.id, msg.channel.id, content);
  };

  // Handler de atividade (jogo/streaming)
  const activity = async (oldPresence, newPresence) => {
    if (!session.activity || String(newPresence?.userId || '') !== session.targetId) return;
    const oldGame = oldPresence?.activities?.find(a => a.type === 0)?.name || null;
    const newGame = newPresence?.activities?.find(a => a.type === 0)?.name || null;
    if (oldGame === newGame) return;
    if (newGame) {
      await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Jogo', `${session.targetTag} começou a jogar **${newGame}**`);
      logHistory(session.ownerId, session.accountId, session.targetId, 'game_start', null, null, newGame);
      logEvent(session.ownerId, session.accountId, session.targetId, 'game_start', null, null, newGame);
    } else {
      await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Jogo', `${session.targetTag} parou de jogar.`);
      logHistory(session.ownerId, session.accountId, session.targetId, 'game_stop', null, null, '');
      logEvent(session.ownerId, session.accountId, session.targetId, 'game_stop', null, null, '');
    }
  };

  // Handler de avatar
  let lastAvatar = null;
  const avatar = async (oldUser, newUser) => {
    if (!session.avatar || String(newUser?.id || '') !== session.targetId) return;
    if (oldUser?.avatar === newUser?.avatar) return;
    const oldUrl = oldUser?.displayAvatarURL({ dynamic: true }) || 'antigo';
    const newUrl = newUser?.displayAvatarURL({ dynamic: true }) || 'novo';
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Avatar', `${session.targetTag} mudou o avatar.\nAntigo: ${oldUrl}\nNovo: ${newUrl}`);
    logHistory(session.ownerId, session.accountId, session.targetId, 'avatar_change', null, null, `Antigo: ${oldUrl} | Novo: ${newUrl}`);
    logEvent(session.ownerId, session.accountId, session.targetId, 'avatar_change', null, null, newUrl);
  };

  // Handler de nickname
  const nickname = async (oldMember, newMember) => {
    if (!session.nickname || String(newMember?.id || '') !== session.targetId) return;
    if (oldMember?.nick === newMember?.nick) return;
    const before = oldMember?.nick || 'sem apelido';
    const after = newMember?.nick || 'sem apelido';
    await notifyAll(bot, session.ownerId, session.accountId, session.targetId, 'Vigia · Apelido', `${session.targetTag} mudou o apelido: **${before}** -> **${after}** no servidor ${newMember.guild.name}`);
    logHistory(session.ownerId, session.accountId, session.targetId, 'nickname_change', newMember.guild.name, null, `${before} -> ${after}`);
    logEvent(session.ownerId, session.accountId, session.targetId, 'nickname_change', newMember.guild.id, null, `${before} -> ${after}`);
  };

  // Registrar listeners
  client.on('voiceStateUpdate', voice);
  client.on('presenceUpdate', presence);
  client.on('messageCreate', message);
  client.on('messageUpdate', messageUpdate);
  client.on('messageDelete', messageDelete);
  client.on('presenceUpdate', activity);
  client.on('userUpdate', avatar);
  client.on('guildMemberUpdate', nickname);

  session.handlers = { voice, presence, message, messageUpdate, messageDelete, activity, avatar, nickname };
  session.active = true;

  const dmSent = await notifyAll(
    bot,
    session.ownerId,
    session.accountId,
    session.targetId,
    'Vigia ativado',
    `Monitorando ${session.targetTag || session.targetId} em ${session.sharedGuilds} servidor(es) compartilhado(s).`
  );

  if (!dmSent) {
    detach(session);
    throw new Error('Não consegui enviar a DM de confirmação. Verifique se suas mensagens diretas estão habilitadas.');
  }
}

function detach(session) {
  if (!session?.client || !session.handlers) return;
  const client = session.client;
  const h = session.handlers;
  client.off('voiceStateUpdate', h.voice);
  client.off('presenceUpdate', h.presence);
  client.off('messageCreate', h.message);
  client.off('messageUpdate', h.messageUpdate);
  client.off('messageDelete', h.messageDelete);
  client.off('presenceUpdate', h.activity);
  client.off('userUpdate', h.avatar);
  client.off('guildMemberUpdate', h.nickname);
  session.handlers = null;
  session.active = false;
}

function checkCooldown(ownerId, accountId, targetId, eventType, ms) {
  const last = getCooldown(ownerId, accountId, targetId, eventType);
  if (now() - last < ms) return false;
  setCooldown(ownerId, accountId, targetId, eventType, now());
  return true;
}

// ========== EXPORTAÇÃO ==========
module.exports = async function watcher(interaction, { bot, config } = {}) {
  const customId = interaction.customId || '';
  const ownerId = String(interaction.user.id);
  const accounts = listAccounts(ownerId);

  if (!customId.startsWith('sf_wg_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar o Vigia.'));
    if (accounts.length === 1) return interaction.showModal(targetModal(accounts[0].id));
    return interaction.reply(accountPicker(accounts));
  }

  if (customId === 'sf_wg_account' && interaction.isStringSelectMenu()) {
    const accountId = interaction.values[0];
    if (!accounts.some((a) => String(a.id) === String(accountId))) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    return interaction.showModal(targetModal(accountId));
  }

  if (customId.startsWith('sf_wg_target_modal:') && interaction.isModalSubmit()) {
    const accountId = customId.split(':')[1];
    const targetId = interaction.fields.getTextInputValue('target_id').trim();
    if (!/^\d{17,20}$/.test(targetId)) return interaction.reply(view('ID inválido', 'Informe um ID numérico válido.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Preparando Vigia', 'Aguarde um instante.'));
    try {
      const accountSession = await ensureClient(ownerId, accountId);
      const client = accountSession.client;
      let target = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);
      const shared = await getSharedGuilds(client, targetId);
      if (!shared.length) {
        const cachedRelationship = client.relationships?.cache?.get(targetId);
        let isFriend = cachedRelationship === 1 || cachedRelationship === 'FRIEND';
        try {
          const user = await client.users.fetch(targetId);
          isFriend = isFriend || user.relationship === 1 || user.relationship === 'FRIEND';
        } catch (_) {}
        if (!isFriend) {
          return interaction.editReply(view('Sem servidor em comum', 'A conta não está em nenhum servidor com o alvo e vocês não são amigos. O Vigia não funcionará.'));
        }
      }
      const session = {
        ownerId,
        accountId: String(accountId),
        targetId,
        targetTag: target?.username ? `@${target.username}` : `Usuário ${targetId}`,
        client,
        voice: true,
        presence: true,
        messages: true,
        activity: true,
        avatar: true,
        nickname: true,
        active: false,
        handlers: null,
        sharedGuilds: shared.length,
        sharedGuildsList: shared,
        watchlist: [],
        _voiceJoinTime: null,
      };
      sessions.set(key(ownerId, accountId, targetId), session);
      const stats = getStats(ownerId, accountId, targetId);
      return interaction.editReply(controlPanel(session, stats));
    } catch (error) {
      return interaction.editReply(view('Falha ao preparar', String(error.message || error)));
    }
  }

  const parts = customId.split(':');
  const accountId = parts[1];
  const targetId = parts[2];
  if (customId.startsWith('sf_wg_back:') && interaction.isButton()) return interaction.showModal(targetModal(accountId));

  const session = sessions.get(key(ownerId, accountId, targetId));
  if (!session) return interaction.reply(view('Sessão expirada', 'Configure o Vigia novamente.'));

  const controlPrefixes = [
    'sf_wg_toggle_voice:',
    'sf_wg_toggle_presence:',
    'sf_wg_toggle_messages:',
    'sf_wg_toggle_activity:',
    'sf_wg_toggle_avatar:',
    'sf_wg_toggle_nickname:',
    'sf_wg_start:',
    'sf_wg_stop:',
  ];

  // Confirma o clique imediatamente. A busca de servidores feita ao ativar pode
  // levar alguns segundos, mas a interação do Discord não expira enquanto isso.
  if (controlPrefixes.some(prefix => customId.startsWith(prefix))) {
    await interaction.deferUpdate();

    try {
      if (customId.startsWith('sf_wg_toggle_voice:')) session.voice = !session.voice;
      else if (customId.startsWith('sf_wg_toggle_presence:')) session.presence = !session.presence;
      else if (customId.startsWith('sf_wg_toggle_messages:')) session.messages = !session.messages;
      else if (customId.startsWith('sf_wg_toggle_activity:')) session.activity = !session.activity;
      else if (customId.startsWith('sf_wg_toggle_avatar:')) session.avatar = !session.avatar;
      else if (customId.startsWith('sf_wg_toggle_nickname:')) session.nickname = !session.nickname;
      else if (customId.startsWith('sf_wg_start:')) {
        await interaction.editReply(view('Ativando Vigia', 'Verificando a conta e os servidores em comum.'));
        await attach(session, bot);
        const account = accounts.find((item) => String(item.id) === String(accountId));
        logInBackground({ bot, config, interaction, account, title: 'Vigia', action: 'Monitoramento ativado', details: `Alvo: ${session.targetTag} · ${session.targetId}\nServidores compartilhados: ${session.sharedGuilds}` });
      } else if (customId.startsWith('sf_wg_stop:')) {
        detach(session);
        const account = accounts.find((item) => String(item.id) === String(accountId));
        logInBackground({ bot, config, interaction, account, title: 'Vigia', action: 'Monitoramento desativado', details: `Alvo: ${session.targetTag} · ${session.targetId}` });
      }

      const stats = getStats(ownerId, accountId, targetId);
      return interaction.editReply(controlPanel(session, stats));
    } catch (error) {
      return interaction.editReply(view('Falha ao processar', String(error.message || error)));
    }
  }

  if (customId.startsWith('sf_wg_stats:')) {
    const stats = getStats(ownerId, accountId, targetId);
    const history = getHistory(ownerId, accountId, targetId, 5);
    let hist = history.map(h => `${new Date(h.timestamp).toLocaleString()} - ${h.event_type}`).join('\n') || 'Nenhum evento recente.';
    return interaction.reply(view('Estatísticas', `**Tempo em call:** ${Math.floor(stats.total_voice_seconds/3600)}h ${Math.floor((stats.total_voice_seconds%3600)/60)}m\n**Mensagens:** ${stats.total_messages}\n\n**Últimos eventos:**\n${hist}`));
  }
  else if (customId.startsWith('sf_wg_history:')) {
    const history = getHistory(ownerId, accountId, targetId, 15);
    if (!history.length) return interaction.reply(view('Histórico vazio', 'Nenhum evento registrado para este alvo.'));
    const lines = history.map(h => `${new Date(h.timestamp).toLocaleString()} - ${h.event_type}: ${h.details || ''}`).join('\n');
    const content = `Histórico de ${session.targetTag}:\n${lines}`;
    if (content.length > 2000) return interaction.reply(view('Histórico extenso', 'Use exportação para ver todos os logs.'));
    return interaction.reply(view('Histórico', content));
  }
  else if (customId.startsWith('sf_wg_filters:')) {
    const filters = getFilters(ownerId, accountId, targetId);
    let msg = 'Filtros atuais:\n';
    if (!filters.length) msg += 'Nenhum filtro configurado.\n';
    else filters.forEach(f => msg += `- ${f.filter_type}: ${f.value}\n`);
    msg += '\nPara adicionar: use `/watcher addfilter` (implementar em breve)';
    return interaction.reply(view('Filtros', msg));
  }
  else if (customId.startsWith('sf_wg_webhook:')) {
    const current = getWebhook(ownerId, accountId, targetId);
    if (current) {
      return interaction.reply(view('Webhook', `Webhook ativo: ${current}\nClique no botão para remover.`, [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`sf_wg_webhook_remove:${accountId}:${targetId}`).setLabel('Remover webhook').setStyle(ButtonStyle.Danger)
        )
      ]));
    } else {
      // Modal para adicionar webhook
      const modal = new ModalBuilder().setCustomId(`sf_wg_webhook_modal:${accountId}:${targetId}`).setTitle('Adicionar Webhook')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId('webhook_url').setLabel('URL do webhook').setPlaceholder('https://discord.com/api/webhooks/...')
          .setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }
  }
  else if (customId.startsWith('sf_wg_webhook_modal:') && interaction.isModalSubmit()) {
    const [, accId, tgtId] = customId.split(':');
    const url = interaction.fields.getTextInputValue('webhook_url').trim();
    if (!url.startsWith('https://discord.com/api/webhooks/')) return interaction.reply(view('Webhook inválido', 'URL inválida.'));
    setWebhook(ownerId, accId, tgtId, url);
    return interaction.reply(view('Webhook definido', 'Webhook configurado com sucesso.'));
  }
  else if (customId.startsWith('sf_wg_webhook_remove:')) {
    deleteWebhook(ownerId, accountId, targetId);
    return interaction.reply(view('Webhook removido', 'Webhook removido com sucesso.'));
  }
  else if (customId.startsWith('sf_wg_export:')) {
    const history = getHistory(ownerId, accountId, targetId, 1000);
    if (!history.length) return interaction.reply(view('Sem dados', 'Nenhum dado para exportar.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let csv = 'Timestamp,Evento,Detalhes\n';
    for (const h of history) {
      const ts = new Date(h.timestamp).toISOString();
      csv += `${ts},${h.event_type},${(h.details || '').replace(/,/g, ';')}\n`;
    }
    const user = await bot.users.fetch(ownerId);
    const dm = await user.createDM();
    const buffer = Buffer.from(csv, 'utf-8');
    await dm.send({ content: `Logs de ${session.targetTag}`, files: [{ attachment: buffer, name: `watcher_${targetId}_${Date.now()}.csv` }] });
    return interaction.editReply(view('Exportado', 'Arquivo enviado na sua DM.'));
  }

  if (!interaction.replied && !interaction.deferred) {
    return interaction.reply(view('Ação indisponível', 'Este controle não está disponível.'));
  }
};
