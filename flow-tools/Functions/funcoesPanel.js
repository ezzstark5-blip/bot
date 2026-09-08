const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');
const {
  BRAND,
  createBaseContainer,
  addTitle,
  addDivider,
  addText,
  getBannerFile,
  BANNER_NAME,
  publicPanelPayload,
} = require('./uiHelper');
const { listAccounts } = require('./tokenManager');
const { isRunning } = require('./questEngine');
const { E, ET } = require('./emojis');

const THEME = 0xffffff;
const BLUE = THEME;

function btn(id, label, style = ButtonStyle.Secondary, emoji = null) {
  const button = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

function dashboard() {
  return new ContainerBuilder().setAccentColor(THEME);
}

function text(container, content) {
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  return container;
}

function divider(container) {
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  return container;
}

function row(container, ...components) {
  container.addActionRowComponents(new ActionRowBuilder().addComponents(...components));
  return container;
}

/** Painel Components V2 público (sem ephemeral) — só o painel principal. */
function panelPayload(container) {
  return {
    components: [container.toJSON()],
    flags: [MessageFlags.IsComponentsV2],
  };
}

/** Painéis das tools: só quem clicou vê. */
function ephemeralPayload(container) {
  return {
    components: [container.toJSON()],
    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
  };
}

function cleanTitle(value) {
  const title = String(value || '').trim().toLocaleLowerCase('pt-BR');
  return title ? title.charAt(0).toLocaleUpperCase('pt-BR') + title.slice(1) : '';
}

function createNoticePanel(title, description) {
  const container = dashboard();
  text(container, `## ${ET.config} ${cleanTitle(title)}\n${description}`);
  return ephemeralPayload(container);
}

function createChannelPickerPanel() {
  const container = dashboard(BLUE);
  text(container, `## ${ET.rocket} Publicar painel\nSelecione o canal em que o painel será enviado.`);
  row(container,
    new ChannelSelectMenuBuilder()
      .setCustomId('sf_adm_channel')
      .setPlaceholder('Selecione um canal')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
  return ephemeralPayload(container);
}

function createPublicPanel(cfg = {}) {
  const title = String(cfg.title || 'PAINEL').trim();
  const body = String(cfg.description || 'Configure sua conta via token para usar o painel.').trim();
  const bannerUrl = String(cfg.bannerUrl || '').trim();
  const imageUrl = bannerUrl || `attachment://${BANNER_NAME}`;
  const container = createBaseContainer();
  addTitle(container, `${ET.raio} ${title}`);
  addDivider(container);
  addText(container, `${body}\n\n-# Selecione uma opção abaixo para começar.`);
  addDivider(container);
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(imageUrl).setDescription('Banner do painel')
    )
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId('sf_public_menu')
    .setPlaceholder('Selecione uma opção')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Adicionar conta')
        .setDescription('Conectar uma nova conta ao painel')
        .setEmoji(E.pessoas)
        .setValue('add_account'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Farm Call')
        .setDescription('Mantenha sua conta conectada em um Canal de Voz')
        .setEmoji(E.bot)
        .setValue('farm_call'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Limpar Mensagens (CL)')
        .setDescription('Apague suas mensagens em DMs.')
        .setEmoji(E.edit)
        .setValue('clear_messages'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Sair de Servidores')
        .setDescription('Saia de todos os servidores')
        .setEmoji(E.config)
        .setValue('leave_servers'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Remover Amizades')
        .setDescription('Remova todas as amizades')
        .setEmoji(E.pessoas)
        .setValue('remove_friends'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Vigia')
        .setDescription('Saiba quando alguém entra em call, fica online ou envia mensagens')
        .setEmoji(E.lupa)
        .setValue('watcher'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Fechar DMs')
        .setDescription('Feche suas conversas privadas abertas')
        .setEmoji(E.tempo)
        .setValue('close_dms'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Abrir DMs')
        .setDescription('Reabra suas conversas privadas fechadas')
        .setEmoji(E.check)
        .setValue('open_dms'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Sair de Grupos')
        .setDescription('Saia dos grupos de mensagens')
        .setEmoji(E.rocket)
        .setValue('leave_groups'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Rich Presence')
        .setDescription('Personalize o status da sua conta')
        .setEmoji(E.raio)
        .setValue('rich_presence'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Platform Spoofer')
        .setDescription('Mude a plataforma exibida no Discord')
        .setEmoji(E.bot)
        .setValue('platform_spoofer')
    );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  const files = bannerUrl ? [] : [getBannerFile()];
  return { ...publicPanelPayload(container, [], files), attachments: [] };
}

function accountSelect(accounts, placeholder = 'Selecione uma conta') {
  return new StringSelectMenuBuilder()
    .setCustomId('sf_aq_pick_account')
    .setPlaceholder(placeholder)
    .addOptions(accounts.slice(0, 25).map((account) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`@${account.username}`.slice(0, 100))
        .setDescription(`ID · ${account.id}`.slice(0, 100))
        .setValue(String(account.id));
      return option;
    }));
}

function createHubPanel(interaction) {
  const accounts = listAccounts(interaction.user.id);
  const container = dashboard(BLUE);
  text(
    container,
    accounts.length
      ? `## Selecionar conta\n${accounts.length} ${accounts.length === 1 ? 'conta conectada' : 'contas conectadas'}. Selecione uma para continuar.`
      : '## Configurar contas\nAdicione uma conta para começar.'
  );
  if (accounts.length) {
    row(container, accountSelect(accounts, 'Selecione uma conta'));
  }
  row(
    container,
    btn('sf_add_account', accounts.length ? 'Adicionar conta' : 'Conectar conta', ButtonStyle.Success, E.pessoas),
    btn('sf_contas', 'Gerenciar contas', ButtonStyle.Secondary, E.config),
    btn('sf_close', 'Fechar', ButtonStyle.Secondary, E.check)
  );
  return ephemeralPayload(container);
}

function createContasPanel(interaction, flash = null) {
  const accounts = listAccounts(interaction.user.id);
  const container = dashboard(BLUE);
  text(container, [
    '## Contas',
    accounts.length ? 'Gerencie as contas conectadas.' : 'Adicione uma conta para começar.',
    flash ? `\n${flash}` : '',
  ].filter(Boolean).join('\n'));
  if (accounts.length) {
    text(container, accounts.map((a, i) =>
      `**@${a.username}**\n-# ID ${a.id}`
    ).join('\n'));
  }
  row(container,
    btn('sf_add_account', 'Adicionar conta', ButtonStyle.Success),
    btn('sf_hub', 'Voltar', ButtonStyle.Secondary)
  );
  for (const account of accounts.slice(0, 3)) {
    row(container, btn(`sf_del_acc:${account.id}`, `Remover @${account.username}`.slice(0, 80), ButtonStyle.Danger));
  }
  return ephemeralPayload(container);
}

function createAccountSelectPanel(interaction) {
  const accounts = listAccounts(interaction.user.id);
  const container = dashboard(BLUE);
  text(container, accounts.length
    ? '## Selecionar conta\nEscolha a conta que executará as missões.'
    : '## Selecionar conta\nNenhuma conta conectada.');
  if (accounts.length) row(container, accountSelect(accounts, 'Selecione uma conta'));
  row(container,
    btn('sf_add_account', 'Adicionar conta', ButtonStyle.Success),
    btn('sf_hub', 'Voltar', ButtonStyle.Secondary)
  );
  return ephemeralPayload(container);
}

function createAutoQuestControlPanel(interaction, accountId, pickedType = null, preparing = false) {
  const account = listAccounts(interaction.user.id).find((a) => String(a.id) === String(accountId));
  const tag = account ? `@${account.username}` : '@conta';
  const running = account ? isRunning(interaction.user.id, account.id) : false;
  const typeLabel = pickedType === 'video' ? 'Vídeo' : pickedType === 'game' ? 'Jogo' : pickedType === 'all' ? 'Todas' : 'Nenhuma selecionada';
  const container = dashboard(BLUE);
  text(container, [
    preparing ? '## Preparando automação' : '## Automação de missões',
    preparing
      ? `Conectando **${tag}**. Aguarde um instante.`
      : running
      ? `Missões em andamento para **${tag}**.`
      : 'Selecione as missões que deseja executar.',
    `-# Conta: ${tag}${pickedType ? ` · Tipo: ${typeLabel}` : ''}`,
  ].join('\n'));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`sf_aq_type:${accountId}`)
    .setPlaceholder('Selecione o tipo de missão')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Vídeo').setDescription('Somente missões de vídeo').setValue('video'),
      new StringSelectMenuOptionBuilder().setLabel('Jogo').setDescription('Somente missões de jogo').setValue('game'),
      new StringSelectMenuOptionBuilder().setLabel('Todas').setDescription('Missões de vídeo e jogo').setValue('all')
    );
  select.setDisabled(running || preparing);
  row(container, select);
  row(container,
    btn(`sf_aq_start:${accountId}`, preparing ? 'Preparando' : running ? 'Em execução' : 'Iniciar', ButtonStyle.Success).setDisabled(running || preparing),
    btn(`sf_aq_stop:${accountId}`, 'Interromper', ButtonStyle.Danger).setDisabled(!running || preparing)
  );
  row(container,
    btn('sf_aq_entry', 'Trocar conta', ButtonStyle.Secondary).setDisabled(preparing),
    btn(`sf_aq_remove_session:${accountId}`, 'Desconectar', ButtonStyle.Danger).setDisabled(preparing)
  );
  return ephemeralPayload(container);
}

function createAdminPanel(cfg = {}) {
  const container = dashboard(BLUE);
  text(container, [
    `## ${ET.config} Administração · ${BRAND}`,
    'Personalize e publique o painel principal (Components V2).',
    '',
    `${ET.edit} **Título:** ${cfg.title || 'Não definido'}`,
    `${ET.lupa} **Subtítulo:** ${cfg.subtitle || 'Não definido'}`,
    `${ET.raio} **Botão:** ${cfg.questLabel || 'Abrir'}`,
    `${ET.bot} **Banner:** ${cfg.bannerUrl ? 'Configurado' : 'Não definido'}`,
  ].join('\n'));
  divider(container);
  text(container, `${ET.pessoas} **Descrição**\n${String(cfg.description || 'Não definida').slice(0, 500)}`);
  divider(container);
  row(container,
    btn('sf_adm_brand', 'Personalizar', ButtonStyle.Primary, E.edit),
    btn('sf_adm_banner', 'Banner', ButtonStyle.Secondary, E.lupa),
    btn('sf_adm_preview', 'Visualizar', ButtonStyle.Secondary, E.check),
    btn('sf_adm_send', 'Publicar', ButtonStyle.Success, E.rocket)
  );
  row(container,
    btn('sf_adm_sync', 'Sincronizar painéis', ButtonStyle.Secondary, E.tempo),
    btn('sf_adm_settings', 'Configurações', ButtonStyle.Secondary, E.config)
  );
  return ephemeralPayload(container);
}

function toolsMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('sf_public_menu')
    .setPlaceholder('Selecione uma função')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Farm Call')
        .setDescription('Mantenha sua conta conectada em um Canal de Voz')
        .setEmoji(E.bot)
        .setValue('farm_call'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Limpar Mensagens (CL)')
        .setDescription('Apague suas mensagens em DMs.')
        .setEmoji(E.edit)
        .setValue('clear_messages'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Sair de Servidores')
        .setDescription('Saia de todos os servidores')
        .setEmoji(E.config)
        .setValue('leave_servers'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Remover Amizades')
        .setDescription('Remova todas as amizades')
        .setEmoji(E.pessoas)
        .setValue('remove_friends'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Vigia')
        .setDescription('Saiba quando alguém entra em call, fica online ou envia mensagens')
        .setEmoji(E.lupa)
        .setValue('watcher'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Fechar DMs')
        .setDescription('Feche suas conversas privadas abertas')
        .setEmoji(E.tempo)
        .setValue('close_dms'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Abrir DMs')
        .setDescription('Reabra suas conversas privadas fechadas')
        .setEmoji(E.check)
        .setValue('open_dms'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Sair de Grupos')
        .setDescription('Saia dos grupos de mensagens')
        .setEmoji(E.rocket)
        .setValue('leave_groups'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Rich Presence')
        .setDescription('Personalize o status da sua conta')
        .setEmoji(E.raio)
        .setValue('rich_presence'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Platform Spoofer')
        .setDescription('Mude a plataforma exibida no Discord')
        .setEmoji(E.bot)
        .setValue('platform_spoofer')
    );
}

/**
 * Painel principal do /setup-tools (estilo Components V2).
 * @param {string|import('discord.js').User} userOrId
 */
function createMainPanel(userOrId) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  const accounts = listAccounts(userId);
  const hasToken = accounts.length > 0;
  const tokenStatus = hasToken ? 'Configurado' : 'Pendente';
  const toolsStatus = hasToken ? 'Liberadas' : 'Bloqueadas';
  const accountLine = hasToken
    ? accounts.map((a) => `@${a.username}`).join(', ')
    : 'Nenhuma conta';

  const container = dashboard();
  text(
    container,
    [
      `-# ${BRAND}`,
      `## ${ET.raio} Painel Principal`,
      'Controle seu token, abra as ferramentas e acompanhe o estado da conta em um painel Components V2 mais bonito e direto.',
    ].join('\n')
  );
  divider(container);
  text(
    container,
    [
      `**${ET.lupa} Resumo rápido**`,
      `>>> ${ET.config} Token: \`${tokenStatus}\``,
      `${ET.rocket} Ferramentas: \`${toolsStatus}\``,
      `${ET.pessoas} Conta(s): ${accountLine}`,
    ].join('\n')
  );
  divider(container);
  text(
    container,
    [
      `**${ET.edit} Como usar**`,
      '1. Clique em **Token** para conectar ou atualizar sua conta.',
      '2. Abra **Funções** para escolher a ferramenta desejada.',
      '3. Use **Info** para revisar ID e token salvo.',
      '',
      `-# Se algum módulo travar, use o botão de info e chame a equipe.`,
    ].join('\n')
  );
  divider(container);
  row(
    container,
    btn('sf_main_token', 'Token', ButtonStyle.Primary, E.pessoas),
    btn('sf_main_funcoes', 'Funções', ButtonStyle.Success, E.raio),
    btn('sf_main_info', 'Info', ButtonStyle.Secondary, E.lupa)
  );

  const devUrl = process.env.DEV_LINK || process.env.SUPPORT_LINK || '';
  if (devUrl && /^https?:\/\//i.test(devUrl)) {
    row(
      container,
      new ButtonBuilder()
        .setLabel(process.env.DEV_LABEL || 'Suporte')
        .setStyle(ButtonStyle.Link)
        .setURL(devUrl)
        .setEmoji(E.bot)
    );
  } else {
    row(container, btn('sf_main_home', 'Atualizar painel', ButtonStyle.Secondary, E.tempo));
  }

  return panelPayload(container);
}

function createFuncoesPanel(userOrId) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  const accounts = listAccounts(userId);
  const hasToken = accounts.length > 0;
  const container = dashboard();
  text(
    container,
    [
      `## ${ET.raio} Funções`,
      hasToken
        ? 'Selecione a ferramenta que deseja usar.'
        : `${ET.config} Nenhuma conta conectada. Clique em **Token** antes de usar as funções.`,
    ].join('\n')
  );
  divider(container);
  if (hasToken) {
    row(container, toolsMenu());
  } else {
    row(container, btn('sf_main_token', 'Conectar Token', ButtonStyle.Primary, E.pessoas));
  }
  row(
    container,
    btn('sf_main_home', 'Voltar', ButtonStyle.Secondary, E.tempo),
    btn('sf_main_info', 'Info', ButtonStyle.Secondary, E.lupa)
  );
  return ephemeralPayload(container);
}

function createInfoPanel(userOrId) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  const accounts = listAccounts(userId);
  const container = dashboard();
  text(container, `## ${ET.lupa} Info da conta`);
  divider(container);

  if (!accounts.length) {
    text(
      container,
      [
        `${ET.config} Nenhum token salvo.`,
        '',
        'Clique em **Token** no painel principal para conectar sua conta.',
      ].join('\n')
    );
  } else {
    text(
      container,
      [
        `${ET.check} **Status:** Configurado`,
        `${ET.rocket} **Ferramentas:** Liberadas`,
        '',
        ...accounts.map(
          (a, i) =>
            `**${i + 1}. @${a.username}**\n>>> ${ET.pessoas} ID: \`${a.id}\`\n${ET.config} Token: \`••••••••${String(a.token || '').slice(-4)}\``
        ),
      ].join('\n\n')
    );
  }

  divider(container);
  row(
    container,
    btn('sf_main_home', 'Voltar', ButtonStyle.Secondary, E.tempo),
    btn('sf_main_token', 'Atualizar Token', ButtonStyle.Primary, E.pessoas),
    btn('sf_main_funcoes', 'Funções', ButtonStyle.Success, E.raio)
  );
  return ephemeralPayload(container);
}

module.exports = {
  createPublicPanel,
  createHubPanel,
  createContasPanel,
  createAccountSelectPanel,
  createAutoQuestControlPanel,
  createAdminPanel,
  createMainPanel,
  createFuncoesPanel,
  createInfoPanel,
  createNoticePanel,
  createChannelPickerPanel,
};
