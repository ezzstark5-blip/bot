const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
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
  const menu = new StringSelectMenuBuilder().setCustomId('sf_lg_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Sair de grupos', 'Selecione a conta que sairá dos grupos.', [new ActionRowBuilder().addComponents(menu)]);
}

async function preview(interaction, userId, account) {
  const session = await ensureClient(userId, account.id);
  const groups = [...session.client.channels.cache.values()]
    .filter((channel) => channel?.type === 'GROUP_DM' && typeof channel.delete === 'function');
  pending.set(userId, { accountId: String(account.id), client: session.client, channelIds: groups.map((channel) => String(channel.id)), expiresAt: Date.now() + 120000 });
  if (!groups.length) return interaction.editReply(view('Nenhum grupo encontrado', `A conta **@${account.username}** não participa de grupos de mensagem.`));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sf_lg_confirm').setLabel(`Sair de ${groups.length} grupos`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('sf_lg_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply(view('Confirmar saída', `A conta **@${account.username}** sairá de **${groups.length} grupos de mensagem**.`, [row]));
}

module.exports = async function leaveGroups(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);
  if (!id.startsWith('sf_lg_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar esta função.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando grupos', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, accounts[0]); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_lg_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando grupos', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, account); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_lg_cancel' && interaction.isButton()) {
    pending.delete(userId);
    return interaction.update(view('Operação cancelada', 'Nenhum grupo foi alterado.'));
  }
  if (id === 'sf_lg_confirm' && interaction.isButton()) {
    const job = pending.get(userId);
    if (!job || job.expiresAt < Date.now()) {
      pending.delete(userId);
      return interaction.reply(view('Confirmação expirada', 'Inicie a função novamente.'));
    }
    await interaction.deferUpdate();
    await interaction.editReply(view('Saindo dos grupos', 'Aguarde a conclusão da operação.'));
    let success = 0;
    let failed = 0;
    for (const channelId of job.channelIds) {
      const channel = job.client.channels.cache.get(channelId);
      if (!channel || channel.type !== 'GROUP_DM') continue;
      try { await channel.delete(true); success += 1; }
      catch (error) { failed += 1; console.error(`[SAIR DE GRUPOS] Grupo ${channelId}:`, error?.message || error); }
      await sleep(600);
    }
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({ bot, config, interaction, account, title: 'Sair de Grupos', action: 'Grupos de mensagem deixados', details: `${success} concluídos · ${failed} falhas` });
    pending.delete(userId);
    return interaction.editReply(view('Operação concluída', `**${success} grupos deixados.**${failed ? `\n-# ${failed} não puderam ser deixados.` : ''}`));
  }
};
