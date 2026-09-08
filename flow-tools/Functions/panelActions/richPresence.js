const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { RichPresence } = require('djs-selfbot-v13');
const { listAccounts } = require('../tokenManager');
const { ensureClient } = require('../questEngine');
const { logInBackground } = require('../actionLogger');
const { ET, titled } = require('../emojis');

const THEME = 0xffffff;
const APPLICATION_ID = '1352297034669101117';
const STORE_PATH = path.join(__dirname, '../../data/richPresence.json');
const TYPE_LABELS = {
  PLAYING: 'Jogando',
  STREAMING: 'Transmitindo',
  LISTENING: 'Ouvindo',
  WATCHING: 'Assistindo',
  COMPETING: 'Competindo',
};
const STATUS_LABELS = { online: 'Online', idle: 'Ausente', dnd: 'Não perturbe', invisible: 'Invisível' };
const TYPE_DESCRIPTIONS = {
  PLAYING: 'Exibe “Jogando” acima do cartão',
  STREAMING: 'Exibe “Transmitindo” acima do cartão',
  LISTENING: 'Exibe “Ouvindo” acima do cartão',
  WATCHING: 'Exibe “Assistindo” acima do cartão',
  COMPETING: 'Exibe “Competindo” acima do cartão',
};
const STATUS_DESCRIPTIONS = {
  online: 'Indicador verde no perfil',
  idle: 'Indicador amarelo no perfil',
  dnd: 'Indicador vermelho no perfil',
  invisible: 'A conta aparece offline',
};

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
  } catch (_) { return {}; }
}

function saveStore(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function configKey(ownerId, accountId) {
  return `${ownerId}:${accountId}`;
}

function defaultConfig() {
  return {
    type: 'PLAYING',
    status: 'online',
    name: 'Meu perfil',
    details: 'Personalizado por mim',
    state: '',
    largeImage: '',
    largeText: '',
    smallImage: '',
    smallText: '',
    buttons: [],
    timerMode: 'elapsed',
    timerHours: 0,
    timerMinutes: 0,
  };
}

function getConfig(ownerId, accountId) {
  const store = readStore();
  const saved = store[configKey(ownerId, accountId)] || {};
  const config = { ...defaultConfig(), ...saved };
  // Compatibilidade com configurações criadas antes do cronômetro editável.
  if (!saved.timerMode && typeof saved.timer === 'boolean') config.timerMode = saved.timer ? 'elapsed' : 'off';
  return config;
}

function setConfig(ownerId, accountId, config) {
  const store = readStore();
  store[configKey(ownerId, accountId)] = config;
  saveStore(store);
}

function view(title, description, rows = []) {
  const container = new ContainerBuilder().setAccentColor(THEME);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titled(ET.raio, title)}\n${description}`));
  rows.forEach((row) => container.addActionRowComponents(row));
  return { components: [container.toJSON()], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] };
}

function accountPicker(accounts) {
  const menu = new StringSelectMenuBuilder().setCustomId('sf_rp_account').setPlaceholder('Selecione uma conta')
    .addOptions(accounts.slice(0, 25).map((account) => new StringSelectMenuOptionBuilder()
      .setLabel(`@${account.username}`.slice(0, 100)).setDescription(`ID · ${account.id}`).setValue(String(account.id))));
  return view('Rich Presence', 'Selecione a conta que será personalizada.', [new ActionRowBuilder().addComponents(menu)]);
}

function panel(ownerId, account) {
  const cfg = getConfig(ownerId, account.id);
  const typeMenu = new StringSelectMenuBuilder().setCustomId(`sf_rp_type:${account.id}`).setPlaceholder('Tipo de atividade')
    .addOptions(Object.entries(TYPE_LABELS).map(([value, label]) => new StringSelectMenuOptionBuilder()
      .setLabel(label).setDescription(TYPE_DESCRIPTIONS[value]).setValue(value).setDefault(cfg.type === value)));
  const statusMenu = new StringSelectMenuBuilder().setCustomId(`sf_rp_status:${account.id}`).setPlaceholder('Status da conta')
    .addOptions(Object.entries(STATUS_LABELS).map(([value, label]) => new StringSelectMenuOptionBuilder()
      .setLabel(label).setDescription(STATUS_DESCRIPTIONS[value]).setValue(value).setDefault(cfg.status === value)));
  const editors = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sf_rp_content:${account.id}`).setLabel('Editar conteúdo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sf_rp_visual:${account.id}`).setLabel('Visual e botões').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sf_rp_timer:${account.id}`).setLabel('Configurar cronômetro').setStyle(cfg.timerMode !== 'off' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sf_rp_apply:${account.id}`).setLabel('Aplicar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sf_rp_remove:${account.id}`).setLabel('Remover').setStyle(ButtonStyle.Danger)
  );
  const summary = [
    `**Conta:** @${account.username} · **Status:** ${STATUS_LABELS[cfg.status]}`,
    '',
    '**Prévia do cartão**',
    `-# ${TYPE_LABELS[cfg.type]}`,
    `**[Imagem grande]  ${cfg.name || 'Nome da atividade'}**`,
    `${cfg.details || 'Detalhes aparecem nesta linha'}`,
    `${cfg.state || 'Estado aparece aqui'}${cfg.timerMode === 'elapsed' ? ` · ${String(cfg.timerHours).padStart(2, '0')}:${String(cfg.timerMinutes).padStart(2, '0')} decorrido` : cfg.timerMode === 'countdown' ? ` · termina em ${cfg.timerHours}h ${cfg.timerMinutes}m` : ''}`,
    cfg.buttons?.length ? `[ ${cfg.buttons.map((button) => button.name).join(' ]  [ ')} ]` : '-# Nenhum botão configurado',
    '',
    '**Onde modificar**',
    '- **Editar conteúdo:** nome principal, detalhes e estado.',
    '- **Visual e botões:** imagens, textos ao passar o mouse e links.',
    '- **Cronômetro:** escolha tempo decorrido, contagem regressiva ou desligado.',
  ].join('\n');
  return view('Rich Presence', summary, [
    new ActionRowBuilder().addComponents(typeMenu),
    new ActionRowBuilder().addComponents(statusMenu),
    editors,
    actions,
  ]);
}

function input(id, label, value = '', required = false, style = TextInputStyle.Short, placeholder = '') {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (placeholder) field.setPlaceholder(placeholder);
  if (value) field.setValue(String(value).slice(0, style === TextInputStyle.Paragraph ? 4000 : 4000));
  return new ActionRowBuilder().addComponents(field);
}

function contentModal(ownerId, accountId) {
  const cfg = getConfig(ownerId, accountId);
  return new ModalBuilder().setCustomId(`sf_rp_content_modal:${accountId}`).setTitle('Conteúdo da presença').addComponents(
    input('name', 'Linha principal · ao lado da imagem', cfg.name, true, TextInputStyle.Short, 'Exemplo: Meow Tools'),
    input('details', 'Segunda linha · abaixo do nome', cfg.details, false, TextInputStyle.Short, 'Exemplo: Feito por restart'),
    input('state', 'Terceira linha · abaixo dos detalhes', cfg.state, false, TextInputStyle.Short, 'Exemplo: discord.gg/meow')
  );
}

function visualModal(ownerId, accountId) {
  const cfg = getConfig(ownerId, accountId);
  const buttons = (cfg.buttons || []).map((button) => `${button.name} | ${button.url}`).join('\n');
  return new ModalBuilder().setCustomId(`sf_rp_visual_modal:${accountId}`).setTitle('Visual e botões').addComponents(
    input('large_image', 'Imagem grande · quadrado à esquerda', cfg.largeImage, false, TextInputStyle.Short, 'Cole a URL da imagem ou um Asset ID'),
    input('large_text', 'Ao passar o mouse na imagem grande', cfg.largeText, false, TextInputStyle.Short, 'Exemplo: Meu perfil personalizado'),
    input('small_image', 'Imagem pequena · selo sobre a grande', cfg.smallImage, false, TextInputStyle.Short, 'Cole a URL da imagem ou um Asset ID'),
    input('small_text', 'Ao passar o mouse na imagem pequena', cfg.smallText, false, TextInputStyle.Short, 'Exemplo: Online agora'),
    input('buttons', 'Botões inferiores · Nome | Link', buttons, false, TextInputStyle.Paragraph, 'Meu site | https://exemplo.com\nServidor | https://discord.gg/exemplo')
  );
}

function timerModal(ownerId, accountId) {
  const cfg = getConfig(ownerId, accountId);
  const modeLabels = { elapsed: 'decorrido', countdown: 'regressivo', off: 'desligado' };
  return new ModalBuilder().setCustomId(`sf_rp_timer_modal:${accountId}`).setTitle('Configurar cronômetro').addComponents(
    input('timer_mode', 'Modo · decorrido, regressivo ou desligado', modeLabels[cfg.timerMode] || 'decorrido', true, TextInputStyle.Short, 'decorrido'),
    input('timer_hours', 'Horas', String(cfg.timerHours || 0), true, TextInputStyle.Short, '0'),
    input('timer_minutes', 'Minutos · de 0 a 59', String(cfg.timerMinutes || 0), true, TextInputStyle.Short, '0')
  );
}

function parseTimer(fields) {
  const rawMode = fields.getTextInputValue('timer_mode').trim().toLowerCase();
  const modes = {
    decorrido: 'elapsed', elapsed: 'elapsed',
    regressivo: 'countdown', regressiva: 'countdown', countdown: 'countdown',
    desligado: 'off', desligada: 'off', off: 'off',
  };
  const mode = modes[rawMode];
  if (!mode) throw new Error('Use decorrido, regressivo ou desligado no campo Modo.');
  const hours = Number(fields.getTextInputValue('timer_hours').trim());
  const minutes = Number(fields.getTextInputValue('timer_minutes').trim());
  if (!Number.isInteger(hours) || hours < 0 || hours > 999) throw new Error('As horas devem ser um número inteiro entre 0 e 999.');
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) throw new Error('Os minutos devem estar entre 0 e 59.');
  if (mode === 'countdown' && hours === 0 && minutes === 0) throw new Error('A contagem regressiva precisa ter pelo menos 1 minuto.');
  return { mode, hours, minutes };
}

function parseButtons(value) {
  if (!value.trim()) return [];
  const buttons = value.split(/\r?\n/).map((line) => {
    const separator = line.indexOf('|');
    if (separator < 1) throw new Error('Use o formato Nome | https://link em cada botão.');
    const name = line.slice(0, separator).trim();
    const url = line.slice(separator + 1).trim();
    if (!name || !URL.canParse(url)) throw new Error('Um dos botões possui nome ou link inválido.');
    return { name: name.slice(0, 32), url };
  });
  if (buttons.length > 2) throw new Error('A presença aceita no máximo dois botões.');
  return buttons;
}

async function resolveImages(client, values) {
  const result = [...values];
  const externalIndexes = [];
  const externalUrls = [];
  values.forEach((value, index) => {
    if (value && URL.canParse(value) && !/^https?:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(value)) {
      externalIndexes.push(index);
      externalUrls.push(value);
    }
  });
  if (externalUrls.length) {
    const assets = await RichPresence.getExternal(client, APPLICATION_ID, ...externalUrls);
    assets.forEach((asset, index) => {
      result[externalIndexes[index]] = asset.external_asset_path;
    });
  }
  return result;
}

async function applyPresence(ownerId, account) {
  const session = await ensureClient(ownerId, account.id);
  const cfg = getConfig(ownerId, account.id);
  const [largeImage, smallImage] = await resolveImages(session.client, [cfg.largeImage, cfg.smallImage]);
  const rpc = new RichPresence(session.client)
    .setApplicationId(APPLICATION_ID)
    .setType(cfg.type)
    .setName(cfg.name || 'Meu perfil');
  if (cfg.details) rpc.setDetails(cfg.details);
  if (cfg.state) rpc.setState(cfg.state);
  if (largeImage) rpc.setAssetsLargeImage(largeImage);
  if (cfg.largeText) rpc.setAssetsLargeText(cfg.largeText);
  if (smallImage) rpc.setAssetsSmallImage(smallImage);
  if (cfg.smallText) rpc.setAssetsSmallText(cfg.smallText);
  const timerOffset = ((cfg.timerHours || 0) * 60 + (cfg.timerMinutes || 0)) * 60000;
  if (cfg.timerMode === 'elapsed') rpc.setStartTimestamp(Date.now() - timerOffset);
  if (cfg.timerMode === 'countdown') rpc.setEndTimestamp(Date.now() + timerOffset);
  if (cfg.buttons?.length) rpc.setButtons(...cfg.buttons);
  await session.client.user.setPresence({ status: cfg.status, activities: [rpc] });
}

module.exports = async function richPresence(interaction, { bot, config } = {}) {
  const id = interaction.customId || '';
  const ownerId = String(interaction.user.id);
  const accounts = listAccounts(ownerId);
  const accountById = (accountId) => accounts.find((account) => String(account.id) === String(accountId));

  if (!id.startsWith('sf_rp_')) {
    if (!accounts.length) return interaction.reply(view('Conta necessária', 'Adicione uma conta antes de personalizar o perfil.'));
    if (accounts.length > 1) return interaction.reply(accountPicker(accounts));
    return interaction.reply(panel(ownerId, accounts[0]));
  }

  if (id === 'sf_rp_account' && interaction.isStringSelectMenu()) {
    const account = accountById(interaction.values[0]);
    if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));
    return interaction.update(panel(ownerId, account));
  }

  const accountId = id.split(':')[1];
  const account = accountById(accountId);
  if (!account) return interaction.reply(view('Conta indisponível', 'Essa conta não está mais conectada.'));

  if (id.startsWith('sf_rp_content:') && interaction.isButton()) return interaction.showModal(contentModal(ownerId, accountId));
  if (id.startsWith('sf_rp_visual:') && interaction.isButton()) return interaction.showModal(visualModal(ownerId, accountId));
  if (id.startsWith('sf_rp_timer:') && interaction.isButton()) return interaction.showModal(timerModal(ownerId, accountId));

  if (id.startsWith('sf_rp_content_modal:') && interaction.isModalSubmit()) {
    const cfg = getConfig(ownerId, accountId);
    cfg.name = interaction.fields.getTextInputValue('name').trim();
    cfg.details = interaction.fields.getTextInputValue('details').trim();
    cfg.state = interaction.fields.getTextInputValue('state').trim();
    setConfig(ownerId, accountId, cfg);
    return interaction.reply(panel(ownerId, account));
  }

  if (id.startsWith('sf_rp_visual_modal:') && interaction.isModalSubmit()) {
    try {
      const cfg = getConfig(ownerId, accountId);
      cfg.largeImage = interaction.fields.getTextInputValue('large_image').trim();
      cfg.largeText = interaction.fields.getTextInputValue('large_text').trim();
      cfg.smallImage = interaction.fields.getTextInputValue('small_image').trim();
      cfg.smallText = interaction.fields.getTextInputValue('small_text').trim();
      cfg.buttons = parseButtons(interaction.fields.getTextInputValue('buttons'));
      setConfig(ownerId, accountId, cfg);
      return interaction.reply(panel(ownerId, account));
    } catch (error) {
      return interaction.reply(view('Configuração inválida', String(error.message || error)));
    }
  }

  if (id.startsWith('sf_rp_timer_modal:') && interaction.isModalSubmit()) {
    try {
      const timer = parseTimer(interaction.fields);
      const cfg = getConfig(ownerId, accountId);
      cfg.timerMode = timer.mode;
      cfg.timerHours = timer.hours;
      cfg.timerMinutes = timer.minutes;
      delete cfg.timer;
      setConfig(ownerId, accountId, cfg);
      return interaction.reply(panel(ownerId, account));
    } catch (error) {
      return interaction.reply(view('Cronômetro inválido', String(error.message || error)));
    }
  }

  if (id.startsWith('sf_rp_type:') && interaction.isStringSelectMenu()) {
    const cfg = getConfig(ownerId, accountId);
    cfg.type = interaction.values[0];
    setConfig(ownerId, accountId, cfg);
    return interaction.update(panel(ownerId, account));
  }

  if (id.startsWith('sf_rp_status:') && interaction.isStringSelectMenu()) {
    const cfg = getConfig(ownerId, accountId);
    cfg.status = interaction.values[0];
    setConfig(ownerId, accountId, cfg);
    return interaction.update(panel(ownerId, account));
  }

  if (id.startsWith('sf_rp_apply:') && interaction.isButton()) {
    await interaction.deferUpdate();
    await interaction.editReply(view('Aplicando presença', 'Aguarde um instante.'));
    try {
      await applyPresence(ownerId, account);
      const cfg = getConfig(ownerId, account.id);
      logInBackground({
        bot, config, interaction, account,
        title: 'Rich Presence', action: 'Presença personalizada aplicada',
        details: `${TYPE_LABELS[cfg.type]} · ${cfg.name}\nStatus: ${STATUS_LABELS[cfg.status]}`,
      });
      return interaction.editReply(view('Rich Presence aplicada', `O perfil de **@${account.username}** foi atualizado.`));
    } catch (error) {
      return interaction.editReply(view('Falha ao aplicar', String(error.message || error)));
    }
  }

  if (id.startsWith('sf_rp_remove:') && interaction.isButton()) {
    await interaction.deferUpdate();
    try {
      const session = await ensureClient(ownerId, account.id);
      const cfg = getConfig(ownerId, account.id);
      await session.client.user.setPresence({ status: cfg.status, activities: [] });
      logInBackground({ bot, config, interaction, account, title: 'Rich Presence', action: 'Presença personalizada removida' });
      return interaction.editReply(view('Rich Presence removida', `A atividade de **@${account.username}** foi limpa.`));
    } catch (error) {
      return interaction.editReply(view('Falha ao remover', String(error.message || error)));
    }
  }
};
