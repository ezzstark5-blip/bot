const {
  ActionRowBuilder, ContainerBuilder, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} = require('discord.js');
const { listAccounts } = require('../tokenManager');
const { ensureClient, reconnectAccountDevice } = require('../questEngine');
const { getPlatform } = require('../platformStore');
const { logInBackground } = require('../actionLogger');
const { ET, titled } = require('../emojis');

const THEME = 0xffffff;
const PLATFORMS = {
  desktop: { label: 'Desktop', description: 'Exibe a conta conectada pelo aplicativo de computador' },
  mobile: { label: 'Mobile', description: 'Exibe o indicador de dispositivo móvel' },
  web: { label: 'Web', description: 'Exibe a conta conectada pelo navegador' },
  android: { label: 'Android', description: 'Simula o aplicativo Discord para Android' },
  iphone: { label: 'iPhone', description: 'Simula o aplicativo Discord para iOS' },
  ps5: { label: 'PlayStation', description: 'Simula uma conexão Discord Embedded' },
  xbox: { label: 'Xbox', description: 'Simula uma conexão Discord Embedded' },
  vr: { label: 'VR', description: 'Simula uma conexão Discord VR' },
};

function view(title, description, rows = []) {
  const container = new ContainerBuilder().setAccentColor(THEME);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titled(ET.raio, title)}\n${description}`));
  rows.forEach((row) => container.addActionRowComponents(row));
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function accountPicker(accounts) {
  const menu = new StringSelectMenuBuilder().setCustomId('sf_ps_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100))
      .setDescription(`ID · ${account.id}`)
      .setValue(String(account.id))));
  return view('Platform Spoofer', 'Selecione a conta que terá a plataforma alterada.', [
    new ActionRowBuilder().addComponents(menu),
  ]);
}

function platformPanel(account, current = 'desktop', applied = false) {
  const currentPlatform = PLATFORMS[current] || PLATFORMS.desktop;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sf_ps_platform:${account.id}`)
    .setPlaceholder('Escolha a plataforma exibida')
    .addOptions(Object.entries(PLATFORMS).map(([value, item]) => new StringSelectMenuOptionBuilder()
      .setLabel(item.label)
      .setDescription(item.description)
      .setValue(value)
      .setDefault(current === value)));

  const description = [
    `**Conta:** @${account.username}`,
    `**Plataforma:** ${currentPlatform.label}`,
    applied ? '-# Alteração aplicada à conexão atual.' : '-# Escolha abaixo como a conta deverá aparecer no Discord.',
    '',
    '-# Desktop restaura o formato padrão. Mobile e Android exibem o indicador de celular.',
  ].join('\n');

  return view('Platform Spoofer', description, [new ActionRowBuilder().addComponents(menu)]);
}

module.exports = async function platformSpoofer(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const ownerId = String(interaction.user.id);
  const accounts = listAccounts(ownerId);

  if (!id.startsWith('sf_ps_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de alterar a plataforma.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(view('Carregando conta', 'Aguarde um instante.'));
    try {
      const session = await ensureClient(ownerId, accounts[0].id);
      const current = getPlatform(ownerId, accounts[0].id);
      return interaction.editReply(platformPanel(accounts[0], current));
    } catch (error) {
      return interaction.editReply(view('Falha ao carregar', String(error.message || error)));
    }
  }

  if (id === 'sf_ps_account' && interaction.isStringSelectMenu()) {
    const account = accounts.find((item) => String(item.id) === String(interaction.values[0]));
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    await interaction.deferUpdate();
    await interaction.editReply(view('Carregando conta', 'Aguarde um instante.'));
    try {
      const session = await ensureClient(ownerId, account.id);
      const current = getPlatform(ownerId, account.id);
      return interaction.editReply(platformPanel(account, current));
    } catch (error) {
      return interaction.editReply(view('Falha ao carregar', String(error.message || error)));
    }
  }

  if (id.startsWith('sf_ps_platform:') && interaction.isStringSelectMenu()) {
    const accountId = id.split(':')[1];
    const account = accounts.find((item) => String(item.id) === String(accountId));
    const platform = interaction.values[0];
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    if (!PLATFORMS[platform]) return interaction.reply(view('Plataforma inválida', 'Selecione uma opção disponível.'));

    await interaction.deferUpdate();
    await interaction.editReply(view('Alterando plataforma', 'Aplicando a nova identificação da conta.'));
    try {
      const previous = getPlatform(ownerId, account.id);
      const session = await reconnectAccountDevice(ownerId, account.id, platform);
      const identifiedAs = String(session.client.options?.ws?.properties?.browser || PLATFORMS[platform].label);
      const result = platformPanel(account, platform, true);
      const container = result.components[0];
      if (container?.components?.[0]?.content) {
        container.components[0].content += `\n-# Sessão identificada como: ${identifiedAs}`;
      }
      logInBackground({
        bot, config, interaction, account,
        title: 'Platform Spoofer',
        action: 'Plataforma alterada',
        details: `${PLATFORMS[previous]?.label || previous} → ${PLATFORMS[platform].label}\nIdentificação: ${identifiedAs}`,
      });
      return interaction.editReply(result);
    } catch (error) {
      return interaction.editReply(view('Falha ao alterar', String(error.message || error)));
    }
  }
};
