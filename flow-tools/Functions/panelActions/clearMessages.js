const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const { logInBackground } = require('../actionLogger');
const { ET, titled } = require('../emojis');

const THEME = 0xffffff;
const pending = new Map();
const pendingKey = (userId) => String(userId);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function payload(container) {
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function panel(title, description, rows = []) {
  const container = new ContainerBuilder().setAccentColor(THEME);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titled(ET.raio, title)}\n${description}`));
  for (const row of rows) container.addActionRowComponents(row);
  return payload(container);
}

function accountPanel(accounts) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('sf_cl_account')
    .setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`@${account.username}`.slice(0, 100))
        .setDescription(`ID · ${account.id}`.slice(0, 100))
        .setValue(String(account.id))
    ));
  return panel('Limpar mensagens', 'Selecione a conta que possui as mensagens.', [
    new ActionRowBuilder().addComponents(select),
  ]);
}

function clearModal(accountId) {
  return new ModalBuilder()
    .setCustomId(`sf_cl_modal:${accountId}`)
    .setTitle('Limpar mensagens')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('target_id')
          .setLabel('ID do usuário ou da DM')
          .setPlaceholder('123456789012345678')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

async function resolveDm(client, targetId) {
  const cached = client.channels.cache.get(targetId);
  if (cached?.isDMBased?.() || ['DM', 'GROUP_DM'].includes(cached?.type)) return cached;
  const channel = await client.channels.fetch(targetId).catch(() => null);
  if (channel?.isDMBased?.() || ['DM', 'GROUP_DM'].includes(channel?.type)) return channel;
  const user = await client.users.fetch(targetId).catch(() => null);
  return user?.createDM ? user.createDM() : null;
}

async function fetchMessageBatch(channel, options) {
  if (typeof channel.messages?.fetch === 'function') {
    return channel.messages.fetch(options);
  }
  if (typeof channel.messages?._fetchMany === 'function') {
    return channel.messages._fetchMany(options, true);
  }
  throw new Error('Esta conversa não permite consultar o histórico de mensagens.');
}

async function deleteOwnMessage(channel, messageId) {
  if (typeof channel.messages?.delete === 'function') {
    return channel.messages.delete(messageId);
  }
  if (channel.client?.api?.channels) {
    return channel.client.api.channels(channel.id).messages(messageId).delete();
  }
  throw new Error('Esta conversa não permite apagar mensagens.');
}

async function findOwnMessages(channel, accountId) {
  const found = [];
  let before;
  while (true) {
    const batch = await fetchMessageBatch(channel, { limit: 100, ...(before ? { before } : {}) });
    if (!batch?.size) break;
    for (const message of batch.values()) {
      if (String(message.author?.id) === String(accountId)) found.push(message);
    }
    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
  }
  return found;
}

module.exports = async function clearMessages(interaction, { bot, config } = {}) {
  const customId = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);

  if (!customId.startsWith('sf_cl_')) {
    if (!accounts.length) return interaction.reply(panel('Conta necessária', 'Adicione uma conta antes de limpar mensagens.'));
    if (accounts.length === 1) return interaction.showModal(clearModal(accounts[0].id));
    return interaction.reply(accountPanel(accounts));
  }

  if (customId === 'sf_cl_account' && interaction.isStringSelectMenu()) {
    const accountId = interaction.values[0];
    if (!accounts.some((account) => String(account.id) === String(accountId))) {
      return interaction.reply(panel('Conta indisponível', 'Essa conta não está mais conectada.'));
    }
    return interaction.showModal(clearModal(accountId));
  }

  if (customId.startsWith('sf_cl_modal:') && interaction.isModalSubmit()) {
    const accountId = customId.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    if (!account) return interaction.reply(panel('Conta indisponível', 'Essa conta não está mais conectada.'));
    const targetId = interaction.fields.getTextInputValue('target_id').trim();
    if (!/^\d{17,20}$/.test(targetId)) return interaction.reply(panel('ID inválido', 'Informe somente um ID numérico.'));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(panel('Buscando mensagens', 'Aguarde enquanto suas mensagens são localizadas.'));
    try {
      const session = await ensureClient(userId, accountId);
      const channel = await resolveDm(session.client, targetId);
      if (!channel) return interaction.editReply(panel('DM não encontrada', 'Verifique o ID e tente novamente.'));
      const messages = await findOwnMessages(channel, accountId);
      if (!messages.length) return interaction.editReply(panel('Nenhuma mensagem encontrada', 'Não existem mensagens suas para apagar nessa conversa.'));
      pending.set(pendingKey(userId), {
        accountId: String(accountId),
        channel,
        messageIds: messages.map((message) => String(message.id)),
        expiresAt: Date.now() + 120000,
      });
      const confirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sf_cl_confirm').setLabel(`Apagar ${messages.length} mensagens`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('sf_cl_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
      );
      return interaction.editReply(panel(
        'Confirmar limpeza',
        `Serão apagadas **todas as ${messages.length} mensagens enviadas por @${account.username}** nessa conversa.\n-# Mensagens de outras pessoas não serão alteradas.`,
        [confirm]
      ));
    } catch (error) {
      return interaction.editReply(panel('Falha ao buscar mensagens', String(error.message || error)));
    }
  }

  if (customId === 'sf_cl_cancel' && interaction.isButton()) {
    pending.delete(pendingKey(userId));
    return interaction.update(panel('Limpeza cancelada', 'Nenhuma mensagem foi apagada.'));
  }

  if (customId === 'sf_cl_confirm' && interaction.isButton()) {
    const job = pending.get(pendingKey(userId));
    if (!job || job.expiresAt < Date.now()) {
      pending.delete(pendingKey(userId));
      return interaction.reply(panel('Confirmação expirada', 'Inicie a limpeza novamente.'));
    }
    await interaction.deferUpdate();
    await interaction.editReply(panel('Limpando mensagens', 'Aguarde enquanto as mensagens são apagadas.'));
    let deleted = 0;
    let failed = 0;
    for (const messageId of job.messageIds) {
      try {
        await deleteOwnMessage(job.channel, messageId);
        deleted += 1;
      } catch (_) {
        failed += 1;
      }
      await sleep(750);
    }
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({
      bot, config, interaction, account, title: 'Limpar Mensagens',
      action: 'Mensagens próprias apagadas',
      details: `${deleted} concluídas · ${failed} falhas\nConversa: ${job.channel?.recipient?.username || job.channel?.id || 'DM'}`,
    });
    pending.delete(pendingKey(userId));
    return interaction.editReply(panel(
      'Limpeza concluída',
      `**${deleted} mensagens apagadas.**${failed ? `\n-# ${failed} não puderam ser apagadas.` : ''}`
    ));
  }
};
