/**
 * Self Flow — UI idêntica aos prints (bya + painel público)
 */
const { applySelfbotPatch, installProcessGuards } = require('./Functions/selfbotPatch');
installProcessGuards();
applySelfbotPatch();

const fs = require('fs');
const path = require('path');

// Token e owners vêm do .env do Bot Hm (raiz do projeto)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  Events,
} = require('discord.js');

const {
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
} = require('./Functions/funcoesPanel');
const {
  validateToken,
  addAccount,
  removeAccount,
  listAccounts,
  buildTokenModal,
} = require('./Functions/tokenManager');
const {
  startAutoQuest,
  stopAutoQuest,
  getStatus,
  getLogs,
  destroyAccountSession,
  ensureClient,
} = require('./Functions/questEngine');
const { BRAND } = require('./Functions/uiHelper');
const { onStatsChange } = require('./Functions/statsManager');
const farmCall = require('./Functions/panelActions/farmCall');
const clearMessages = require('./Functions/panelActions/clearMessages');
const leaveServers = require('./Functions/panelActions/leaveServers');
const removeFriends = require('./Functions/panelActions/removeFriends');
const watcher = require('./Functions/panelActions/watcher');
const closeDMs = require('./Functions/panelActions/closeDMs');
const openDMs = require('./Functions/panelActions/openDMs');
const leaveGroups = require('./Functions/panelActions/leaveGroups');
const richPresence = require('./Functions/panelActions/richPresence');
const platformSpoofer = require('./Functions/panelActions/platformSpoofer');
const { logInBackground, sendActionLog, setLogChannel, setLogWebhook } = require('./Functions/actionLogger');
const { sendAsChannelMessage } = require('./Functions/publicReply');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const PANEL_PATH = path.join(ROOT, 'data', 'panel.json');

function loadJson(file, fb) {
  try {
    if (!fs.existsSync(file)) return { ...fb };
    return { ...fb, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...fb };
  }
}
function saveJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const CONFIG = loadJson(CONFIG_PATH, {
  botToken: '',
  ownerIds: [],
  autoAccept: true,
  autoRedeem: true,
  pollInterval: 30000,
  delayVideo: 300,
  delayGame: 800,
  userToken: '',
});
CONFIG.ownerIds = (CONFIG.ownerIds || []).map(String);

/** Sempre prioriza o .env do Bot Hm — não usa token salvo no config.json. */
function syncTokensFromEnv() {
  const botToken =
    process.env.DISCORD_TOKEN ||
    process.env.BOT_TOKEN ||
    '';
  const userToken =
    process.env.USER_TOKEN ||
    process.env.SELF_TOKEN ||
    process.env.FLOW_USER_TOKEN ||
    '';
  CONFIG.botToken = String(botToken).trim();
  if (userToken) CONFIG.userToken = String(userToken).trim();
  return CONFIG.botToken;
}
syncTokensFromEnv();


let panelCfg = loadJson(PANEL_PATH, {
  title: '',
  subtitle: '',
  description: '',
  bannerUrl: '',
  questEmoji: '',
  questLabel: 'QUEST',
  sentMessages: [],
});

/** userId:accountId -> video|game|all */
const questTypePick = new Map();
function typeKey(uid, accId) {
  return `${uid}:${accId}`;
}
function getType(uid, accId) {
  return questTypePick.get(typeKey(uid, accId)) || null;
}

function savePanel() {
  saveJson(PANEL_PATH, panelCfg);
}
function saveConfig() {
  // Nunca grava tokens no disco — fonte é o .env
  saveJson(CONFIG_PATH, {
    botToken: '',
    ownerIds: CONFIG.ownerIds,
    autoAccept: CONFIG.autoAccept,
    autoRedeem: CONFIG.autoRedeem,
    pollInterval: CONFIG.pollInterval,
    delayVideo: CONFIG.delayVideo,
    delayGame: CONFIG.delayGame,
    userToken: '',
  });
}

function maskToken(token) {
  const value = String(token || '');
  const parts = value.split('.');
  return `${(parts[0] || 'TOKEN').slice(0, 8)}••••••${value.slice(-4)}`;
}

function accountAvatarUrl(entry) {
  if (!entry?.avatar) return null;
  const format = String(entry.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${entry.id}/${entry.avatar}.${format}?size=256`;
}

async function sendAdminAudit(interaction, title) {
  sendActionLog({
    bot,
    config: CONFIG,
    interaction,
    title,
    action: title,
    channelType: 'admin',
  }).catch(() => {});
  return true;
}

async function sendTokenRegisteredLog(interaction, entry, token) {
  try {
    const data = {
      bot,
      config: CONFIG,
      interaction,
      account: entry,
      title: 'Conta conectada',
      action: 'Conta conectada',
      thumbnail: accountAvatarUrl(entry) || interaction.user.displayAvatarURL({ size: 256 }),
    };
    await Promise.all([
      sendActionLog({ ...data, channelType: 'public' }),
      sendActionLog({ ...data, channelType: 'admin' }),
    ]);
  } catch (error) {
    console.error('[logs] falha ao notificar token registrado:', error.message);
  }
}

function isAdmin(i) {
  if (CONFIG.ownerIds.length && CONFIG.ownerIds.includes(String(i.user.id))) return true;
  return !!i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function canConfigureLogs(i) {
  if (CONFIG.ownerIds.length) return CONFIG.ownerIds.includes(String(i.user.id));
  return !!i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

/** update embed ephemeral (bya style) */
async function setPanel(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    if (interaction.isMessageComponent?.()) {
      return interaction.update(payload);
    }
    return interaction.reply(payload);
  } catch (e) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      return interaction.editReply(payload);
    } catch (err) {
      console.error('setPanel', err.message);
    }
  }
}

function isEphemeralSource(interaction) {
  const flags = interaction.message?.flags;
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has(MessageFlags.Ephemeral);
  return Boolean(Number(flags) & MessageFlags.Ephemeral);
}

/** Responde ephemeral sem alterar o painel principal público. */
async function replyPrivate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  if (interaction.isMessageComponent?.() && isEphemeralSource(interaction)) {
    return interaction.update(payload);
  }
  return interaction.reply(payload);
}

const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

/** @type {import('discord.js').Client} */
let bot = null;

let publicSyncTimer = null;
let publicSyncRunning = false;

async function syncPublicStats() {
  if (publicSyncRunning) return;
  publicSyncRunning = true;
  try {
    for (const ref of panelCfg.sentMessages || []) {
      try {
        const channel = await bot.channels.fetch(ref.channelId);
        const message = await channel.messages.fetch(ref.messageId);
        await message.edit(createPublicPanel(panelCfg));
      } catch (_) {}
    }
  } finally {
    publicSyncRunning = false;
  }
}

function schedulePublicStatsSync() {
  if (publicSyncTimer) clearTimeout(publicSyncTimer);
  publicSyncTimer = setTimeout(() => {
    publicSyncTimer = null;
    syncPublicStats().catch((error) => console.error('[stats] falha ao sincronizar:', error.message));
  }, 3000);
}

onStatsChange(schedulePublicStatsSync);

function isFlowInteraction(interaction) {
  if (interaction.isChatInputCommand?.()) {
    return interaction.commandName === 'setup-tools' || interaction.commandName === 'setlogs';
  }
  const id = interaction.customId;
  return typeof id === 'string' && id.startsWith('sf_');
}

async function handleFlowInteraction(interaction) {
  if (!isFlowInteraction(interaction)) return false;
  try {
    if (interaction.customId?.startsWith('sf_fc_')) {
      await farmCall(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_cl_')) {
      await clearMessages(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_ls_')) {
      await leaveServers(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_rf_')) {
      await removeFriends(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_wg_')) {
      await watcher(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_cd_')) {
      await closeDMs(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_od_')) {
      await openDMs(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_lg_')) {
      await leaveGroups(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_rp_')) {
      await richPresence(interaction, { bot, config: CONFIG });
      return true;
    }
    if (interaction.customId?.startsWith('sf_ps_')) {
      await platformSpoofer(interaction, { bot, config: CONFIG });
      return true;
    }
    // ── /setup-tools ──
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tools') {
      await sendAsChannelMessage(interaction, createMainPanel(interaction.user.id));
      return true;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'setlogs') {
      if (!canConfigureLogs(interaction)) {
        return interaction.reply(createNoticePanel('ACESSO NEGADO', 'Você não possui permissão para configurar os logs.', 0xffffff));
      }
      const channel = interaction.options.getChannel('canal', false);
      const webhookUrl = interaction.options.getString('webhook', false)?.trim() || '';
      const logType = interaction.options.getString('tipo', true);
      if (!channel && !webhookUrl) {
        return interaction.reply(createNoticePanel('DESTINO AUSENTE', 'Informe um canal ou uma URL de webhook.', 0xffffff));
      }
      if (channel && !channel.isTextBased?.()) {
        return interaction.reply(createNoticePanel('CANAL INVÁLIDO', 'Escolha um canal de texto ou anúncios.', 0xffffff));
      }
      if (webhookUrl && !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/i.test(webhookUrl)) {
        return interaction.reply(createNoticePanel('WEBHOOK INVÁLIDO', 'Use uma URL de webhook válida do Discord.', 0xffffff));
      }
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      if (webhookUrl) setLogWebhook(logType, webhookUrl);
      else setLogChannel(logType, channel.id);
      try {
        const sent = await sendActionLog({
          bot,
          config: CONFIG,
          interaction,
          title: logType === 'admin' ? 'Logs de admin' : 'Logs públicos',
          action: 'Canal configurado',
          channelType: logType,
        });
        if (!sent) throw new Error('O Discord recusou o envio do log de teste.');
      } catch (error) {
        if (webhookUrl) setLogWebhook(logType, '');
        else setLogChannel(logType, '');
        return interaction.editReply(createNoticePanel(
          'NÃO FOI POSSÍVEL USAR O CANAL',
          `Verifique se o bot possui **Ver canal**, **Enviar mensagens** e **Usar componentes externos**.\n\n-# ${error.message}`,
          0xffffff
        ));
      }
      const auditSent = logType === 'admin'
        ? true
        : await sendAdminAudit(interaction, 'Configurar logs públicos');
      return interaction.editReply(createNoticePanel(
        'CANAL DE LOGS CONFIGURADO',
        `${logType === 'admin' ? 'Os logs administrativos' : 'Os logs públicos das ferramentas'} serão enviados ${webhookUrl ? 'pelo webhook configurado' : `em ${channel}`}.\n-# Teste de auditoria: ${auditSent ? 'enviado' : 'falhou'}.`,
        0xffffff
      ));
    }

    // ── Modal adicionar conta (img4) ──
    if (interaction.isModalSubmit() && ['sf_modal_add_account', 'sf_modal_add_account_public'].includes(interaction.customId)) {
      const fromPublicPanel = interaction.customId === 'sf_modal_add_account_public';
      const token = interaction.fields.getTextInputValue('user_token').trim();
      try {
        if (fromPublicPanel) await interaction.deferReply({ flags: V2_EPHEMERAL });
        else await interaction.deferUpdate();
      } catch {
        await interaction.deferReply({ flags: V2_EPHEMERAL });
      }

      const profile = await Promise.race([
        validateToken(token),
        new Promise((r) => setTimeout(() => r(null), 12000)),
      ]);
      if (!profile) {
        const notice = createNoticePanel('ACESSO RECUSADO', 'O token informado é inválido. Verifique e tente novamente.', 0xffffff);
        return fromPublicPanel ? interaction.editReply(notice) : interaction.followUp(notice);
      }
      const entry = addAccount(interaction.user.id, token, profile);
      ensureClient(interaction.user.id, entry.id).catch((error) => {
        console.error(`[conta] pré-conexão de @${entry.username} falhou:`, error.message);
      });
      schedulePublicStatsSync();
      await sendTokenRegisteredLog(interaction, entry, token);
      if (fromPublicPanel) {
        return interaction.editReply(createFuncoesPanel(interaction.user.id));
      }
      await interaction.editReply(createMainPanel(interaction.user.id));
      return interaction.followUp(
        createNoticePanel('CONEXÃO ESTABELECIDA', `A conta **@${entry.username}** foi adicionada. Abra **Funções** para continuar.`, 0xffffff)
      );
    }

    // ── Admin modals ──
    if (interaction.isModalSubmit()) {
      const mid = interaction.customId;
      if (mid === 'sf_modal_brand') {
        panelCfg.title = interaction.fields.getTextInputValue('title').trim().slice(0, 100);
        panelCfg.subtitle = interaction.fields.getTextInputValue('subtitle').trim().slice(0, 200);
        panelCfg.description = interaction.fields.getTextInputValue('description').trim().slice(0, 3500);
        panelCfg.questLabel = interaction.fields.getTextInputValue('button').trim().slice(0, 80);
        panelCfg.questEmoji = '';
        savePanel();
        await sendAdminAudit(interaction, 'Personalizar painel');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_banner') {
        const value = interaction.fields.getTextInputValue('banner').trim();
        if (value && !/^https?:\/\/\S+$/i.test(value)) {
          return interaction.reply(createNoticePanel('LINK INVÁLIDO', 'Use um link direto começando com **http://** ou **https://**.', 0xffffff));
        }
        panelCfg.bannerUrl = value.slice(0, 2000);
        savePanel();
        await sendAdminAudit(interaction, 'Alterar banner');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_title') {
        panelCfg.title = interaction.fields.getTextInputValue('v').slice(0, 100);
        savePanel();
        await sendAdminAudit(interaction, 'Alterar título');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_sub') {
        panelCfg.subtitle = interaction.fields.getTextInputValue('v').slice(0, 200);
        savePanel();
        await sendAdminAudit(interaction, 'Alterar subtítulo');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_desc') {
        panelCfg.description = interaction.fields.getTextInputValue('v').slice(0, 3500);
        savePanel();
        await sendAdminAudit(interaction, 'Alterar descrição');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_btn') {
        panelCfg.questLabel = interaction.fields.getTextInputValue('label').slice(0, 80);
        panelCfg.questEmoji = '';
        savePanel();
        await sendAdminAudit(interaction, 'Alterar botão');
        return interaction.reply(createAdminPanel(panelCfg));
      }
      if (mid === 'sf_modal_settings') {
        const poll = parseInt(interaction.fields.getTextInputValue('poll'), 10);
        const dv = parseInt(interaction.fields.getTextInputValue('dvideo'), 10);
        const dg = parseInt(interaction.fields.getTextInputValue('dgame'), 10);
        if (Number.isFinite(poll) && poll >= 5000) CONFIG.pollInterval = poll;
        if (Number.isFinite(dv)) CONFIG.delayVideo = dv;
        if (Number.isFinite(dg)) CONFIG.delayGame = dg;
        saveConfig();
        await sendAdminAudit(interaction, 'Configurar engine');
        return interaction.reply(createNoticePanel('ENGINE ATUALIZADA', `**POLL**  \`${CONFIG.pollInterval}ms\`\n**VÍDEO**  \`${CONFIG.delayVideo}ms\`\n**JOGO**  \`${CONFIG.delayGame}ms\``, 0xffffff));
      }
    }

    // ── Enviar painel (canal) ──
    if (interaction.isChannelSelectMenu() && interaction.customId === 'sf_adm_channel') {
      if (!isAdmin(interaction)) {
        return interaction.reply(createNoticePanel('ACESSO NEGADO', 'Você não possui permissão para publicar este painel.', 0xffffff));
      }
      await interaction.deferUpdate();
      const ch = await bot.channels.fetch(interaction.values[0]).catch(() => null);
      if (!ch?.isTextBased?.()) return interaction.editReply(createNoticePanel('CANAL INVÁLIDO', 'Escolha um canal de texto válido.', 0xffffff));
      try {
        const msg = await ch.send(createPublicPanel(panelCfg));
        panelCfg.sentMessages = panelCfg.sentMessages || [];
        panelCfg.sentMessages.push({ channelId: ch.id, messageId: msg.id, at: Date.now() });
        savePanel();
        await sendAdminAudit(interaction, 'Publicar painel');
        return interaction.editReply(createNoticePanel('PUBLICAÇÃO CONCLUÍDA', `O dashboard público foi enviado em ${ch}.`, 0xffffff));
      } catch (e) {
        return interaction.editReply(createNoticePanel('FALHA NA PUBLICAÇÃO', e.message, 0xffffff));
      }
    }

    // ── Selects ──
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'sf_public_menu') {
        const action = interaction.values[0];
        if (action === 'add_account') {
          return interaction.showModal(buildTokenModal('sf_modal_add_account_public'));
        }
        if (action === 'farm_call') {
          await farmCall(interaction, { bot, config: CONFIG });
          if (!interaction.deferred && !interaction.replied) {
            return interaction.reply(
              createNoticePanel('Farm Call', 'Função preparada para implementação.', 0xffffff)
            );
          }
          return true;
        }
        if (action === 'clear_messages') {
          return clearMessages(interaction, { bot, config: CONFIG });
        }
        if (action === 'leave_servers') {
          return leaveServers(interaction, { bot, config: CONFIG });
        }
        if (action === 'remove_friends') {
          return removeFriends(interaction, { bot, config: CONFIG });
        }
        if (action === 'watcher') {
          await watcher(interaction, { bot, config: CONFIG });
          if (!interaction.deferred && !interaction.replied) {
            return interaction.reply(createNoticePanel('Vigia', 'Função preparada para implementação.'));
          }
          return true;
        }
        if (action === 'close_dms') {
          return closeDMs(interaction, { bot, config: CONFIG });
        }
        if (action === 'open_dms') {
          return openDMs(interaction, { bot, config: CONFIG });
        }
        if (action === 'leave_groups') {
          return leaveGroups(interaction, { bot, config: CONFIG });
        }
        if (action === 'rich_presence') {
          return richPresence(interaction, { bot, config: CONFIG });
        }
        if (action === 'platform_spoofer') {
          return platformSpoofer(interaction, { bot, config: CONFIG });
        }
        return true;
      }
      // img6-7 → img8
      if (interaction.customId === 'sf_aq_pick_account') {
        return true;
      }
      // tipo de quest no painel da conta
      if (interaction.customId.startsWith('sf_aq_type:')) {
        return true;
      }
    }

    if (!interaction.isButton()) return true;
    const id = interaction.customId;

    if (id === 'sf_main_token') {
      return interaction.showModal(buildTokenModal('sf_modal_add_account_public'));
    }
    if (id === 'sf_main_funcoes') {
      return replyPrivate(interaction, createFuncoesPanel(interaction.user.id));
    }
    if (id === 'sf_main_info') {
      return replyPrivate(interaction, createInfoPanel(interaction.user.id));
    }
    if (id === 'sf_main_home') {
      // Voltar: fecha a mensagem ephemeral e mantém o painel principal público
      if (isEphemeralSource(interaction)) {
        try {
          await interaction.deferUpdate();
          return interaction.deleteReply();
        } catch {
          return replyPrivate(
            interaction,
            createNoticePanel('Painel', 'Volte ao **Painel Principal** no canal.', 0xffffff)
          );
        }
      }
      return replyPrivate(interaction, createMainPanel(interaction.user.id));
    }

    // img1 botão único → img2 hub
    if (id === 'sf_open') {
      return interaction.reply(createHubPanel(interaction));
    }
    if (id === 'sf_hub') return setPanel(interaction, createHubPanel(interaction));

    // img2 → img3 contas
    if (id === 'sf_contas') return setPanel(interaction, createContasPanel(interaction));

    // img2 → img6 select conta
    if (id === 'sf_aq_entry') return true;

    if (id === 'sf_close') {
      try {
        await interaction.deferUpdate();
        return interaction.deleteReply();
      } catch {
        if (!interaction.deferred && !interaction.replied) {
          return interaction.reply(createNoticePanel('SESSÃO ENCERRADA', 'O dashboard foi fechado com segurança.'));
        }
      }
    }

    // img3/4 adicionar
    if (id === 'sf_add_account') {
      return interaction.showModal(buildTokenModal());
    }

    // img5 lixeira
    if (id.startsWith('sf_del_acc:')) {
      const accId = id.split(':')[1];
      const removedAccount = listAccounts(interaction.user.id).find((item) => String(item.id) === String(accId));
      removeAccount(interaction.user.id, accId);
      logInBackground({ bot, config: CONFIG, interaction, account: removedAccount, title: 'Contas', action: 'Conta removida do painel' });
      schedulePublicStatsSync();
      await destroyAccountSession(interaction.user.id, accId);
      return setPanel(interaction, createContasPanel(interaction));
    }

    // Auto Quest removido das funções do tools
    if (
      id.startsWith('sf_aq_start:') ||
      id.startsWith('sf_aq_stop:') ||
      id.startsWith('sf_aq_status:') ||
      id.startsWith('sf_aq_logs:') ||
      id.startsWith('sf_aq_remove_session:') ||
      id.startsWith('sf_dm_stop:')
    ) {
      return true;
    }

    // Admin
    if (!id.startsWith('sf_adm_')) return true;
    if (!isAdmin(interaction)) {
      return interaction.reply(createNoticePanel('ACESSO NEGADO', 'Você não possui permissão para acessar esta função.', 0xffffff));
    }

    if (id === 'sf_adm_refresh') return setPanel(interaction, createAdminPanel(panelCfg));

    if (id === 'sf_adm_brand') {
      const modal = new ModalBuilder().setCustomId('sf_modal_brand').setTitle('Personalizar painel');
      const field = (customId, label, value, style = TextInputStyle.Short, max = 200, required = false) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(style)
            .setRequired(required)
            .setMaxLength(max)
            .setValue(String(value || '').slice(0, max))
        );
      modal.addComponents(
        field('title', 'Título (opcional)', panelCfg.title || '', TextInputStyle.Short, 100),
        field('subtitle', 'Subtítulo', panelCfg.subtitle || '', TextInputStyle.Short, 200),
        field('description', 'Descrição', panelCfg.description || '', TextInputStyle.Paragraph, 3500),
        field('button', 'Texto do botão', panelCfg.questLabel || '', TextInputStyle.Short, 80)
      );
      return interaction.showModal(modal);
    }

    if (id === 'sf_adm_banner') {
      const modal = new ModalBuilder().setCustomId('sf_modal_banner').setTitle('Banner do painel');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('banner')
            .setLabel('Link direto da imagem (vazio remove)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(2000)
            .setPlaceholder('https://exemplo.com/banner.png')
            .setValue(String(panelCfg.bannerUrl || '').slice(0, 2000))
        )
      );
      return interaction.showModal(modal);
    }

    if (id === 'sf_adm_sync') {
      await interaction.deferUpdate();
      const sent = panelCfg.sentMessages || [];
      const valid = [];
      let updated = 0;
      for (const ref of sent) {
        try {
          const channel = await bot.channels.fetch(ref.channelId);
          const message = await channel.messages.fetch(ref.messageId);
          await message.edit(createPublicPanel(panelCfg));
          valid.push(ref);
          updated += 1;
        } catch (_) {}
      }
      panelCfg.sentMessages = valid;
      savePanel();
      await sendAdminAudit(interaction, 'Sincronizar painéis');
      return interaction.editReply(createNoticePanel(
        updated ? 'SINCRONIZAÇÃO CONCLUÍDA' : 'NENHUM PAINEL ENCONTRADO',
        updated ? `**${updated}** painel(is) publicado(s) foram atualizados.` : 'Não há painéis publicados disponíveis para sincronizar.',
        updated ? 0xffffff : 0xffffff
      ));
    }

    if (id === 'sf_adm_preview') {
      const p = createPublicPanel(panelCfg);
      return interaction.reply({
        components: p.components,
        files: p.files,
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      });
    }

    if (id === 'sf_adm_send') {
      return interaction.reply(createChannelPickerPanel());
    }

    if (id === 'sf_adm_title') {
      return interaction.showModal(modalShort('sf_modal_title', 'Título', panelCfg.title || 'Self Flow'));
    }
    if (id === 'sf_adm_sub') {
      return interaction.showModal(modalShort('sf_modal_sub', 'Subtítulo', panelCfg.subtitle || ''));
    }
    if (id === 'sf_adm_desc') {
      return interaction.showModal(modalLong('sf_modal_desc', 'Descrição', panelCfg.description || ''));
    }
    if (id === 'sf_adm_btn') {
      const modal = new ModalBuilder().setCustomId('sf_modal_btn').setTitle('Botão do painel');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('label')
            .setLabel('Texto do botão')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80)
            .setValue((panelCfg.questLabel || '').slice(0, 80))
        )
      );
      return interaction.showModal(modal);
    }
    if (id === 'sf_adm_settings') {
      const modal = new ModalBuilder().setCustomId('sf_modal_settings').setTitle('Config engine');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('poll')
            .setLabel('Poll (ms)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(CONFIG.pollInterval))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dvideo')
            .setLabel('Delay vídeo (ms)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(CONFIG.delayVideo))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dgame')
            .setLabel('Delay jogo (ms)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(CONFIG.delayGame))
        )
      );
      return interaction.showModal(modal);
    }
  } catch (err) {
    console.error(err);
    try {
      const p = createNoticePanel('ERRO DO SISTEMA', String(err.message || err), 0xffffff);
      if (interaction.deferred || interaction.replied) await interaction.followUp(p);
      else await interaction.reply(p);
    } catch (_) {}
  }
  return true;
}

function modalShort(id, title, value) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('v')
        .setLabel(title)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(String(value || '').slice(0, 200))
    )
  );
  return modal;
}

function modalLong(id, title, value) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('v')
        .setLabel(title)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(3500)
        .setValue(String(value || '').slice(0, 3500))
    )
  );
  return modal;
}

function registerSelfFlow(client, options = {}) {
  bot = client;
  syncTokensFromEnv();
  if (Array.isArray(options.ownerIds) && options.ownerIds.length) {
    CONFIG.ownerIds = options.ownerIds.map(String);
  } else if (process.env.OWNER_ID) {
    CONFIG.ownerIds = [String(process.env.OWNER_ID)];
  }
  if (!CONFIG.botToken) {
    console.warn('Self Flow: DISCORD_TOKEN ausente no .env');
  }
  saveConfig();
  schedulePublicStatsSync();
  console.log('Self Flow integrado (/setup-tools, /setlogs)');
  return { handleFlowInteraction, CONFIG, panelCfg };
}

module.exports = {
  registerSelfFlow,
  handleFlowInteraction,
  isFlowInteraction,
};
