const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const { saveClosedDMs } = require('./dmStore');
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
  const menu = new StringSelectMenuBuilder().setCustomId('sf_cd_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Fechar DMs', 'Selecione a conta que terá as conversas fechadas.', [new ActionRowBuilder().addComponents(menu)]);
}

async function preview(interaction, userId, account) {
  const session = await ensureClient(userId, account.id);
  const channels = [...session.client.channels.cache.values()]
    .filter((channel) => channel?.type === 'DM' && typeof channel.delete === 'function');
  pending.set(userId, {
    accountId: String(account.id),
    client: session.client,
    channels: channels.map((channel) => ({
      channelId: String(channel.id),
      recipientId: String(channel.recipient?.id || ''),
    })),
    expiresAt: Date.now() + 120000,
  });
  if (!channels.length) return interaction.editReply(view('Nenhuma DM aberta', `A conta **@${account.username}** não possui conversas privadas abertas.`));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sf_cd_confirm').setLabel(`Fechar ${channels.length} DMs`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('sf_cd_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply(view('Confirmar fechamento', `Serão fechadas **${channels.length} conversas privadas** de **@${account.username}**.\n-# As mensagens não serão apagadas e a conversa poderá ser aberta novamente.`, [row]));
}

module.exports = async function closeDMs(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);
  if (!id.startsWith('sf_cd_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar esta função.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando DMs', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, accounts[0]); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_cd_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando DMs', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, account); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_cd_cancel' && interaction.isButton()) {
    pending.delete(userId);
    return interaction.update(view('Operação cancelada', 'Nenhuma conversa foi fechada.'));
  }
  if (id === 'sf_cd_confirm' && interaction.isButton()) {
    const job = pending.get(userId);
    if (!job || job.expiresAt < Date.now()) {
      pending.delete(userId);
      return interaction.reply(view('Confirmação expirada', 'Inicie a função novamente.'));
    }
    await interaction.deferUpdate();
    await interaction.editReply(view('Fechando DMs', 'Aguarde a conclusão da operação.'));
    let success = 0;
    let failed = 0;
    const closedRecipientIds = [];
    for (const item of job.channels) {
      const channelId = item.channelId;
      const channel = job.client.channels.cache.get(channelId);
      if (!channel || channel.type !== 'DM') continue;
      try {
        await channel.delete();
        success += 1;
        if (item.recipientId) closedRecipientIds.push(item.recipientId);
      }
      catch (error) { failed += 1; console.error(`[FECHAR DMS] Canal ${channelId}:`, error?.message || error); }
      await sleep(500);
    }
    if (closedRecipientIds.length) saveClosedDMs(userId, job.accountId, closedRecipientIds);
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({ bot, config, interaction, account, title: 'Fechar DMs', action: 'Conversas privadas fechadas', details: `${success} concluídas · ${failed} falhas` });
    pending.delete(userId);
    return interaction.editReply(view('Operação concluída', `**${success} conversas fechadas.**${failed ? `\n-# ${failed} não puderam ser fechadas.` : ''}`));
  }
};
