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
  const menu = new StringSelectMenuBuilder().setCustomId('sf_rf_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Remover amigos', 'Selecione a conta que terá os amigos removidos.', [new ActionRowBuilder().addComponents(menu)]);
}

async function preview(interaction, userId, account) {
  const session = await ensureClient(userId, account.id);
  await session.client.relationships.fetch();
  const friends = [...session.client.relationships.friendCache.values()];
  pending.set(userId, { accountId: String(account.id), client: session.client, friendIds: friends.map((friend) => String(friend.id)), expiresAt: Date.now() + 120000 });
  if (!friends.length) return interaction.editReply(view('Nenhum amigo encontrado', `A conta **@${account.username}** não possui amigos para remover.`));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sf_rf_confirm').setLabel(`Remover ${friends.length} amigos`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('sf_rf_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply(view('Confirmar remoção', `Serão removidos **todos os ${friends.length} amigos** de **@${account.username}**.\n-# Solicitações e bloqueios não serão alterados.`, [row]));
}

module.exports = async function removeFriends(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);
  if (!id.startsWith('sf_rf_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar esta função.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando amigos', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, accounts[0]); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_rf_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando amigos', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, account); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_rf_cancel' && interaction.isButton()) {
    pending.delete(userId);
    return interaction.update(view('Operação cancelada', 'Nenhum amigo foi removido.'));
  }
  if (id === 'sf_rf_confirm' && interaction.isButton()) {
    const job = pending.get(userId);
    if (!job || job.expiresAt < Date.now()) return interaction.reply(view('Confirmação expirada', 'Inicie a função novamente.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Removendo amigos', 'Aguarde a conclusão da operação.'));
    let success = 0; let failed = 0;
    for (const friendId of job.friendIds) {
      try { await job.client.relationships.deleteRelationship(friendId); success += 1; }
      catch (_) { failed += 1; }
      await sleep(700);
    }
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({ bot, config, interaction, account, title: 'Remover Amizades', action: 'Amizades removidas', details: `${success} concluídas · ${failed} falhas` });
    pending.delete(userId);
    return interaction.editReply(view('Operação concluída', `**${success} amigos removidos.**${failed ? `\n-# ${failed} não puderam ser removidos.` : ''}`));
  }
};
