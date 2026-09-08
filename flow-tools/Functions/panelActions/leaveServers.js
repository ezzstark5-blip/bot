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
  const menu = new StringSelectMenuBuilder().setCustomId('sf_ls_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Sair de servidores', 'Selecione a conta que sairá dos servidores.', [new ActionRowBuilder().addComponents(menu)]);
}

async function preview(interaction, userId, account) {
  const session = await ensureClient(userId, account.id);
  const protectedGuildId = interaction.guildId ? String(interaction.guildId) : null;
  const guilds = [...session.client.guilds.cache.values()]
    .filter((guild) => !protectedGuildId || String(guild.id) !== protectedGuildId);
  pending.set(userId, {
    accountId: String(account.id),
    client: session.client,
    guildIds: guilds.map((guild) => String(guild.id)),
    protectedGuildId,
    expiresAt: Date.now() + 120000,
  });
  if (!guilds.length) return interaction.editReply(view('Nenhum servidor encontrado', `A conta **@${account.username}** não participa de servidores.`));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sf_ls_confirm').setLabel(`Sair de ${guilds.length} servidores`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('sf_ls_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply(view(
    'Confirmar saída',
    `A conta **@${account.username}** sairá de **${guilds.length} servidores**.\n-# O servidor desta ferramenta será mantido. Servidores pertencentes à conta também podem ser preservados pelo Discord.`,
    [row]
  ));
}

module.exports = async function leaveServers(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const userId = String(interaction.user.id);
  const accounts = listAccounts(userId);
  if (!id.startsWith('sf_ls_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de usar esta função.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando servidores', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, accounts[0]); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_ls_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando servidores', 'Aguarde um instante.'));
    try { return await preview(interaction, userId, account); }
    catch (error) { return interaction.editReply(view('Falha ao carregar', String(error.message || error))); }
  }
  if (id === 'sf_ls_cancel' && interaction.isButton()) {
    pending.delete(userId);
    return interaction.update(view('Operação cancelada', 'Nenhum servidor foi alterado.'));
  }
  if (id === 'sf_ls_confirm' && interaction.isButton()) {
    const job = pending.get(userId);
    if (!job || job.expiresAt < Date.now()) return interaction.reply(view('Confirmação expirada', 'Inicie a função novamente.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Saindo dos servidores', 'Aguarde a conclusão da operação.'));
    let success = 0; let failed = 0;
    for (const guildId of job.guildIds) {
      if (job.protectedGuildId && String(guildId) === String(job.protectedGuildId)) continue;
      const guild = job.client.guilds.cache.get(guildId);
      if (!guild) continue;
      try { await guild.leave(); success += 1; }
      catch (_) { failed += 1; }
      await sleep(800);
    }
    const account = accounts.find((item) => String(item.id) === String(job.accountId));
    logInBackground({ bot, config, interaction, account, title: 'Sair de Servidores', action: 'Servidores deixados', details: `${success} concluídos · ${failed} falhas\nServidor da ferramenta preservado` });
    pending.delete(userId);
    return interaction.editReply(view('Operação concluída', `**${success} servidores deixados.**${failed ? `\n-# ${failed} não puderam ser deixados.` : ''}`));
  }
};
