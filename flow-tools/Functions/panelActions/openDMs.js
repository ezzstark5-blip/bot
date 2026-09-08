const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const { getClosedDMs, removeClosedDMs } = require('./dmStore');
const { logInBackground } = require('../actionLogger');
const { ET, titled } = require('../emojis');

const THEME = 0xffffff;
const pending = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function view(title, description, rows = []) {
  const container = new ContainerBuilder().setAccentColor(THEME);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titled(ET.raio, title)}\n${description}`));
  rows.forEach((row) => container.addActionRowComponents(row));
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function accountPicker(accounts) {
  const menu = new StringSelectMenuBuilder().setCustomId('sf_od_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Abrir DMs', 'Selecione a conta que terá as conversas reabertas.', [new ActionRowBuilder().addComponents(menu)]);
}

async function preview(interaction, userId, account) {
  const session = await ensureClient(userId, account.id);
  const recipientIds = getClosedDMs(userId, account.id);
  const openRecipientIds = new Set(
    [...session.client.channels.cache.values()]
      .filter((channel) => channel?.type === 'DM' && channel.recipient?.id)
      .map((channel) => String(channel.recipient.id))
  );
  const pendingIds = recipientIds.filter((id) => !openRecipientIds.has(String(id)));

  pending.set(userId, {
    accountId: String(account.id),
    client: session.client,
    recipientIds: pendingIds,
    expiresAt: Date.now() + 120000,
  });

  if (!pendingIds.length) {
    return interaction.editReply(view('Nenhuma DM para abrir', `A conta **@${account.username}** não possui conversas fechadas registradas.`));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sf_od_confirm').setLabel(`Abrir ${pendingIds.length} DMs`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sf_od_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply(view('Confirmar abertura', `Serão reabertas **${pendingIds.length} conversas privadas** de **@${account.username}**.`, [row]));
}

module.exports = async function openDMs(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);

  if (!id.startsWith('sf_od_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar esta função.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando DMs', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, accounts[0]); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }

  if (id === 'sf_od_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando DMs', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, account); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }

  if (id === 'sf_od_cancel' && interaction.isButton()) {
    pending.delete(userId);
    return interaction.update(view('Operação cancelada', 'Nenhuma conversa foi aberta.'));
  }

  if (id === 'sf_od_confirm' && interaction.isButton()) {
    const job = pending.get(userId);
    if (!job || job.expiresAt < Date.now()) {
      pending.delete(userId);
      return interaction.reply(view('Confirmação expirada', 'Inicie a função novamente.'));
    }

    await interaction.deferUpdate();
    await interaction.editReply(view('Abrindo DMs', 'Aguarde a conclusão da operação.'));
    let success = 0;
    let failed = 0;
    const openedIds = [];

    for (const recipientId of job.recipientIds) {
      try {
        const user = await job.client.users.fetch(recipientId);
        await user.createDM(true);
        openedIds.push(recipientId);
        success += 1;
      } catch (error) {
        failed += 1;
        console.error(`[ABRIR DMS] Usuário ${recipientId}:`, error?.message || error);
      }
      await sleep(500);
    }

    if (openedIds.length) removeClosedDMs(userId, job.accountId, openedIds);
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({ bot, config, interaction, account, title: 'Abrir DMs', action: 'Conversas privadas reabertas', details: `${success} concluídas · ${failed} falhas` });
    pending.delete(userId);
    return interaction.editReply(view('Operação concluída', `**${success} conversas abertas.**${failed ? `\n-# ${failed} não puderam ser abertas.` : ''}`));
  }
};
