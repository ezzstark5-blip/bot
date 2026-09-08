const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const { sendActionLog } = require('../actionLogger');
const { ET, titled } = require('../emojis');

const COLORS = { blue: 0xffffff, green: 0xffffff, yellow: 0xffffff, red: 0xffffff };
const voiceSessions = new Map();
const voicePreferences = new Map();
const accountWarmups = new Map();
const sessionKey = (userId, accountId) => `${userId}:${accountId}`;

async function sendFarmLog(bot, config, interaction, account, entry, connected) {
  if (!bot) return;
  try {
    const action = connected ? 'Conexão iniciada' : 'Conexão encerrada';
    const data = {
      bot,
      config,
      interaction,
      account,
      title: 'Farm Call',
      action,
      thumbnail: entry?.avatarUrl || null,
    };
    await Promise.all([
      sendActionLog({ ...data, channelType: 'public' }),
      sendActionLog({ ...data, channelType: 'admin' }),
    ]);
  } catch (error) {
    console.error('[FARM CALL LOG]', error?.message || error);
  }
}

function warmAccount(userId, accountId) {
  const id = sessionKey(userId, accountId);
  if (accountWarmups.has(id)) return accountWarmups.get(id);
  const promise = ensureClient(userId, accountId).catch((error) => {
    accountWarmups.delete(id);
    throw error;
  });
  accountWarmups.set(id, promise);
  return promise;
}

function getPreferences(userId, accountId) {
  const id = sessionKey(userId, accountId);
  if (!voicePreferences.has(id)) voicePreferences.set(id, { mute: true, deaf: true });
  return voicePreferences.get(id);
}

function payload(container) {
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function addText(container, content) {
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  return container;
}

function notice(title, description, color = COLORS.blue) {
  return payload(addText(new ContainerBuilder().setAccentColor(color), `## ${titled(ET.raio, title)}\n${description}`));
}

function accountPicker(accounts) {
  const container = new ContainerBuilder().setAccentColor(COLORS.blue);
  addText(container, '## Farm Call\nSelecione a conta que entrará no canal de voz.');
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sf_fc_account')
      .setPlaceholder('Selecione uma conta')
      .addOptions(accounts.slice(0, 25).map((account) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`@${account.username}`.slice(0, 100))
          .setDescription(`ID · ${account.id}`.slice(0, 100))
          .setValue(String(account.id))
      ))
  ));
  return payload(container);
}

function channelModal(accountId) {
  return new ModalBuilder()
    .setCustomId(`sf_fc_channel_modal:${accountId}`)
    .setTitle('Farm Call')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('ID do canal de voz')
        .setPlaceholder('123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20)
    ));
}

function setupPanel(account, preferences) {
  const container = new ContainerBuilder().setAccentColor(COLORS.blue);
  addText(container, [
    '## Configurar entrada',
    `**Conta:** @${account.username}`,
    '-# Escolha como a conta entrará no canal.',
  ].join('\n'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sf_fc_toggle_mute:${account.id}`)
      .setLabel(preferences.mute ? 'Microfone: mutado' : 'Microfone: ativo')
      .setStyle(preferences.mute ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`sf_fc_toggle_deaf:${account.id}`)
      .setLabel(preferences.deaf ? 'Áudio: surdo' : 'Áudio: ativo')
      .setStyle(preferences.deaf ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sf_fc_open_modal:${account.id}`)
      .setLabel('Informar canal')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('sf_fc_change_account')
      .setLabel('Trocar conta')
      .setStyle(ButtonStyle.Secondary)
  ));
  return payload(container);
}

function controlPanel(account, entry, state = 'connected') {
  const connected = state === 'connected';
  const connecting = state === 'connecting';
  const color = connecting ? COLORS.blue : connected ? COLORS.green : COLORS.yellow;
  const container = new ContainerBuilder().setAccentColor(color);
  addText(container, [
    `## ${titled(ET.raio, connecting ? 'Conectando ao canal' : 'Farm Call')}`,
    `**Conta:** @${account.username}`,
    entry?.channelName ? `**Canal:** ${entry.channelName}` : '',
    entry?.guildName ? `**Servidor:** ${entry.guildName}` : '',
    entry?.preferences ? `**Entrada:** ${entry.preferences.mute ? 'Mutado' : 'Microfone ativo'} · ${entry.preferences.deaf ? 'Surdo' : 'Áudio ativo'}` : '',
    `-# ${connecting ? 'Aguarde um instante.' : connected ? 'Conectado' : 'Desconectado'}`,
  ].filter(Boolean).join('\n'));
  if (!connecting) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sf_fc_disconnect:${account.id}`).setLabel('Desconectar').setStyle(ButtonStyle.Danger).setDisabled(!connected),
      new ButtonBuilder().setCustomId(`sf_fc_change_channel:${account.id}`).setLabel('Trocar canal').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sf_fc_change_account').setLabel('Trocar conta').setStyle(ButtonStyle.Secondary)
    ));
  }
  return payload(container);
}

async function disconnectEntry(entry) {
  if (entry?.voiceSession) await entry.voiceSession.disconnect().catch(() => {});
  if (entry) entry.voiceSession = null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyVoicePreferences(voiceSession, channel, selfClient, preferences) {
  // A conexão inicial pode sobrescrever mute/deaf durante o handshake.
  // Aguarda o estado estabilizar e aplica novamente pela sessão ativa.
  await sleep(500);
  await voiceSession.setMute(Boolean(preferences.mute));
  await voiceSession.setDeaf(Boolean(preferences.deaf));
  await sleep(500);

  const voiceState = channel.guild?.voiceStates?.cache?.get(selfClient.user?.id);
  const muteApplied = !preferences.mute || voiceState?.selfMute === true || voiceSession._mute === true;
  const deafApplied = !preferences.deaf || voiceState?.selfDeaf === true || voiceSession._deaf === true;
  if (!muteApplied || !deafApplied) {
    await voiceSession.setMute(Boolean(preferences.mute));
    await voiceSession.setDeaf(Boolean(preferences.deaf));
    await sleep(300);
  }
}

async function withTimeout(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function farmCall(interaction, { bot, config } = {}) {
  const customId = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);

  if (!customId.startsWith('sf_fc_')) {
    if (!accounts.length) return interaction.reply(notice('Conta necessária', 'Adicione uma conta antes de usar o Farm Call.', COLORS.yellow));
    if (accounts.length === 1) {
      const account = accounts[0];
      warmAccount(userId, account.id).catch(() => {});
      return interaction.reply(setupPanel(account, getPreferences(userId, account.id)));
    }
    return interaction.reply(accountPicker(accounts));
  }

  if (customId === 'sf_fc_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(notice('Conta indisponível', 'Essa conta não está mais conectada.', COLORS.red));
    warmAccount(userId, account.id).catch(() => {});
    return interaction.update(setupPanel(account, getPreferences(userId, account.id)));
  }

  if ((customId.startsWith('sf_fc_toggle_mute:') || customId.startsWith('sf_fc_toggle_deaf:')) && interaction.isButton()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    if (!account) return interaction.reply(notice('Conta indisponível', 'Essa conta não está mais conectada.', COLORS.red));
    const preferences = getPreferences(userId, accountId);
    if (customId.startsWith('sf_fc_toggle_mute:')) preferences.mute = !preferences.mute;
    else preferences.deaf = !preferences.deaf;
    return interaction.update(setupPanel(account, preferences));
  }

  if (customId.startsWith('sf_fc_open_modal:') && interaction.isButton()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    if (!account) return interaction.reply(notice('Conta indisponível', 'Essa conta não está mais conectada.', COLORS.red));
    return interaction.showModal(channelModal(accountId));
  }

  if (customId.startsWith('sf_fc_channel_modal:') && interaction.isModalSubmit()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    if (!account) return interaction.reply(notice('Conta indisponível', 'Essa conta não está mais conectada.', COLORS.red));
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    if (!/^\d{17,20}$/.test(channelId)) return interaction.reply(notice('ID inválido', 'Informe somente o ID numérico do canal de voz.', COLORS.red));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(controlPanel(account, null, 'connecting'));
    try {
      const accountSession = await withTimeout(warmAccount(userId, accountId), 38000, 'A conexão com a conta demorou mais que o esperado.');
      const selfClient = accountSession.client;
      const channel = selfClient.channels.cache.get(channelId)
        || await selfClient.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error('Canal não encontrado. Verifique o ID e o acesso da conta ao servidor.');
      const voiceTypes = [2, 13, 'GUILD_VOICE', 'GUILD_STAGE_VOICE'];
      if (!voiceTypes.includes(channel.type) && !voiceTypes.includes(Number(channel.type))) {
        throw new Error('O ID informado não pertence a um canal de voz ou palco.');
      }

      const id = sessionKey(userId, accountId);
      await disconnectEntry(voiceSessions.get(id));
      const preferences = { ...getPreferences(userId, accountId) };
      const voiceSession = await withTimeout(
        selfClient.voice.joinVoice(channel, preferences),
        20000,
        'Não foi possível entrar no canal dentro do tempo esperado.'
      );
      await withTimeout(
        applyVoicePreferences(voiceSession, channel, selfClient, preferences),
        5000,
        'A conta entrou no canal, mas não foi possível aplicar o estado de áudio.'
      );
      const entry = {
        voiceSession,
        channelName: channel.name || 'Canal de voz',
        guildName: channel.guild?.name || 'Servidor',
        avatarUrl: selfClient.user?.displayAvatarURL?.({ dynamic: true, size: 256 }) || null,
        preferences,
      };
      voiceSessions.set(id, entry);
      sendFarmLog(bot, config, interaction, account, entry, true).catch(() => {});
      return interaction.editReply(controlPanel(account, entry, 'connected'));
    } catch (error) {
      return interaction.editReply(notice('Falha ao conectar', String(error.message || error), COLORS.red));
    }
  }

  if (customId.startsWith('sf_fc_disconnect:') && interaction.isButton()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    await interaction.deferUpdate();
    const id = sessionKey(userId, accountId);
    const entry = voiceSessions.get(id);
    await disconnectEntry(entry);
    voiceSessions.delete(id);
    if (account && entry) sendFarmLog(bot, config, interaction, account, entry, false).catch(() => {});
    return interaction.editReply(account ? controlPanel(account, entry, 'disconnected') : notice('Desconectado', 'A conexão de voz foi encerrada.', COLORS.yellow));
  }

  if (customId.startsWith('sf_fc_change_channel:') && interaction.isButton()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    if (!account) return interaction.reply(notice('Conta indisponível', 'Essa conta não está mais conectada.', COLORS.red));
    return interaction.showModal(channelModal(accountId));
  }

  if (customId === 'sf_fc_change_account' && interaction.isButton()) {
    if (!accounts.length) return interaction.reply(notice('Conta necessária', 'Adicione uma conta antes de usar o Farm Call.', COLORS.yellow));
    return interaction.update(accountPicker(accounts));
  }

  if (!interaction.replied && !interaction.deferred) return interaction.reply(notice('Farm Call', 'Não foi possível processar esta ação.', COLORS.red));
};
