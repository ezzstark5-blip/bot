/**
 * Auto Quest multi-conta + tipo (video | game | all)
 * Notifica DM com visual "hacker/robô" ao terminar ciclo sem pendentes.
 */
const { applySelfbotPatch } = require('./selfbotPatch');
applySelfbotPatch();
const crypto = require('crypto');

const { Client: SelfClient } = require('djs-selfbot-v13');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { getToken, getAccount } = require('./tokenManager');
const { recordUsage, recordQuestCompletion } = require('./statsManager');
const { sendActionLog, getLogChannel, loadNotifications } = require('./actionLogger');

/** userId -> session */
const sessions = new Map();
const { getPlatform, setPlatform } = require('./platformStore');

function defaultConfig(g = {}) {
  return {
    autoAccept: g.autoAccept !== false,
    autoRedeem: g.autoRedeem !== false,
    pollInterval: Number(g.pollInterval) || 30000,
    delayVideo: Number(g.delayVideo) || 300,
    delayGame: Number(g.delayGame) || 800,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sessionKey(userId, accountId) {
  return `${userId}:${accountId}`;
}

function getSession(userId, accountId) {
  return sessions.get(sessionKey(userId, accountId)) || null;
}

function pushLog(session, line) {
  const msg = `[${new Date().toLocaleTimeString('pt-BR')}] ${line}`;
  session.logs.push(msg);
  if (session.logs.length > 50) session.logs.shift();
  console.log(`[AQ ${session.accountTag}] ${msg}`);
}

async function ensureClient(userId, accountId) {
  const key = sessionKey(userId, accountId);
  let session = sessions.get(key);
  const token = getToken(userId, accountId);
  if (!token) throw new Error('Conta não encontrada. Adicione em **Contas**.');

  const acc = getAccount(userId, accountId);
  if (session?.client?.user) return session;

  if (session?.client) {
    try {
      session.client.destroy();
    } catch (_) {}
  }

  const device = getPlatform(userId, accountId);
  const client = new SelfClient({ checkUpdate: false, device });
  session = {
    userId: String(userId),
    accountId: String(accountId),
    accountTag: acc ? `@${acc.username}` : accountId,
    client,
    running: false,
    questType: 'all', // video | game | all
    intervalId: null,
    processing: false,
    logs: [],
    config: defaultConfig(),
    botClient: null,
    discordUserId: String(userId),
    completedNotify: false,
    completedQuests: [],
    startedAt: null,
    notificationMessage: null,
    currentQuest: null,
    totalQuests: 0,
    dmUpdateQueue: Promise.resolve(),
  };
  sessions.set(key, session);

  await new Promise((resolve, reject) => {
    let lastError = null;
    const t = setTimeout(() => {
      const detail = lastError ? ` ${lastError}` : '';
      reject(new Error(`Não foi possível conectar a conta.${detail}`));
    }, 35000);
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
    client.once('ready', ok);
    client.on('error', (err) => {
      const m = String(err?.message || err);
      if (m.includes('map') || m.includes('GuildJoinRequest')) return;
      lastError = m;
    });
    client.login(token)
      .then(() => {
        if (client.user) ok();
      })
      .catch((e) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(new Error(`Falha no login da conta: ${e.message || e}`));
      });
  });

  pushLog(session, `online · ${client.user.tag}`);
  return session;
}

function getQuestType(manager, quest) {
  try {
    return manager.detectQuestType(quest);
  } catch (_) {
    const tasks =
      quest?.config?.task_config_v2?.tasks ||
      quest?.config?.task_config?.tasks ||
      {};
    const names = Object.keys(tasks);
    if (names.some((name) => name.startsWith('WATCH_VIDEO'))) return 'VIDEO';
    if (names.some((name) => name.startsWith('PLAY_ON_'))) return 'GAME';
    if (names.includes('STREAM_ON_DESKTOP')) return 'STREAM';
    if (names.some((name) => name.includes('ACTIVITY'))) return 'ACTIVITY';
    return 'UNKNOWN';
  }
}

function getQuestName(quest) {
  return quest?.config?.messages?.quest_name || quest?.config?.messages?.game_title || quest?.id || 'quest';
}

function tokenFingerprint(token) {
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex').slice(0, 10).toUpperCase();
  const prefix = String(token || '').split('.')[0].slice(0, 6);
  return `${prefix || 'TOKEN'}•••••• [${hash}]`;
}

async function sendSessionLog(session, status) {
  const channelId = getLogChannel('public', session.config);
  if (!channelId || !session.botClient) return;
  try {
    const token = getToken(session.userId, session.accountId);
    const typeLabel = session.questType === 'video' ? 'VÍDEO' : session.questType === 'game' ? 'JOGO' : 'TODAS';
    const elapsed = session.startedAt ? Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)) : 0;
    const quests = session.completedQuests.length
      ? session.completedQuests.map((q) => `**${q.name}**\n-# ${q.type}`).join('\n')
      : 'Nenhuma missão concluída nesta sessão.';
    const statusLabel = status === 'START' ? 'Sessão iniciada' : status === 'COMPLETE' ? 'Sessão concluída' : 'Sessão interrompida';
    await sendActionLog({
      bot: session.botClient,
      config: session.config,
      interaction: { user: { id: session.discordUserId } },
      account: getAccount(session.userId, session.accountId),
      title: 'Auto Quest',
      action: statusLabel,
      details: [
        `Tipo: ${typeLabel.toLowerCase()}`,
        `Identificação: \`${tokenFingerprint(token)}\``,
        status === 'START' ? null : `Duração: ${elapsed}s`,
        status === 'START' ? null : `Missões:\n${quests}`,
      ].filter(Boolean).join('\n'),
    });
    await sendActionLog({
      bot: session.botClient,
      config: session.config,
      interaction: { user: { id: session.discordUserId } },
      account: getAccount(session.userId, session.accountId),
      title: 'Auto Quest',
      action: statusLabel,
      channelType: 'admin',
    });
  } catch (e) {
    pushLog(session, `log do canal falhou: ${e.message}`);
  }
}

function filterByType(manager, valid, questType) {
  const typed = valid.map((quest) => ({ quest, type: getQuestType(manager, quest) }));
  const video = typed.filter((item) => item.type === 'VIDEO').map((item) => item.quest);
  const game = typed
    .filter((item) => ['GAME', 'STREAM', 'ACTIVITY'].includes(item.type))
    .map((item) => item.quest);
  const unknown = typed.filter((item) => item.type === 'UNKNOWN').map((item) => item.quest);
  if (questType === 'video') return { list: video, video, game: [] };
  if (questType === 'game') return { list: game, video: [], game };
  return { list: [...video, ...game, ...unknown], video, game };
}

function getQuestOrbValue(quest) {
  const rewards = quest?.config?.rewards_config || quest?.raw?.config?.rewards_config;
  if (!rewards || typeof rewards !== 'object') return 0;

  const directKeys = ['orbs', 'orb_amount', 'orb_quantity', 'amount', 'quantity'];
  for (const key of directKeys) {
    const value = Number(rewards[key]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }

  const candidates = [];
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`));
      return;
    }
    const marker = Object.entries(value)
      .filter(([, item]) => typeof item === 'string')
      .map(([key, item]) => `${key}:${item}`.toLowerCase())
      .join(' ');
    const orbReward = /orb|virtual.?currency/.test(`${path} ${marker}`);
    for (const [key, item] of Object.entries(value)) {
      const currentPath = `${path}.${key}`.toLowerCase();
      if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item))) {
        const number = Number(item);
        if (number > 0 && /orb|amount|quantity|count|value/.test(currentPath)) {
          candidates.push({ number, orbReward, key: key.toLowerCase() });
        }
      } else {
        visit(item, currentPath);
      }
    }
  }
  visit(rewards, 'rewards_config');
  const confirmed = candidates.find((item) => item.orbReward);
  const fallback = candidates.find((item) => /amount|quantity|count/.test(item.key));
  return Math.floor((confirmed || fallback)?.number || 0);
}

function sessionTypeLabel(type) {
  if (type === 'video') return 'Missões de vídeo';
  if (type === 'game') return 'Missões de jogo';
  return 'Todas as missões';
}

function sessionDuration(session) {
  const elapsed = session.startedAt ? Math.max(1, Math.round((Date.now() - session.startedAt) / 1000)) : 0;
  return elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ${elapsed % 60} s` : `${elapsed} s`;
}

function progressBar(done, total) {
  const size = 10;
  const filled = total ? Math.min(size, Math.round((done / total) * size)) : 0;
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}

function fillNotificationText(value, variables = {}) {
  return String(value || '').replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(variables[key] ?? ''));
}

function notificationPayload(session, state = 'RUNNING', detail = '') {
  const settings = loadNotifications();
  const dm = settings.directMessages?.autoQuest || {};
  const view = dm.states?.[state] || dm.states?.RUNNING || {};
  const accent = /^#[0-9a-f]{6}$/i.test(dm.accentColor || '')
    ? parseInt(dm.accentColor.slice(1), 16)
    : 0xffffff;
  const container = new ContainerBuilder().setAccentColor(accent);
  const done = session.completedQuests.length;
  const total = Math.max(session.totalQuests, done);
  const variables = {
    account: session.accountTag,
    questType: sessionTypeLabel(session.questType),
    done,
    total: total || '—',
    progressBar: progressBar(done, total),
    currentQuest: session.currentQuest || '',
    duration: sessionDuration(session),
    detail: detail || view.fallback || '',
  };
  const header = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `## ${fillNotificationText(view.title, variables)}`,
      `**${session.accountTag}**`,
      `-# ${sessionTypeLabel(session.questType)}`,
    ].join('\n'))
  );
  const avatar = session.botClient?.user?.displayAvatarURL?.({ extension: 'png', size: 128 });
  if (avatar) header.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar).setDescription(dm.thumbnailDescription || 'Self Flow'));
  container.addSectionComponents(header);

  if (state === 'RUNNING') {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fillNotificationText(view.content, variables))
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sf_dm_stop:${session.accountId}`)
          .setLabel(dm.stopButtonLabel || 'Interromper')
          .setStyle(ButtonStyle.Danger)
      )
    );
  } else if (state === 'COMPLETE') {
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fillNotificationText(view.content || view.fallback, variables))
    );
  }

  return { components: [container.toJSON()], flags: MessageFlags.IsComponentsV2 };
}

async function updateSessionDm(session, state = 'RUNNING', detail = '') {
  if (!session.botClient) return;
  try {
    if (session.notificationMessage) {
      await session.notificationMessage.edit(notificationPayload(session, state, detail));
      return;
    }
    const user = await session.botClient.users.fetch(session.discordUserId);
    session.notificationMessage = await user.send(notificationPayload(session, state, detail));
    pushLog(session, 'DM de acompanhamento enviada');
  } catch (e) {
    pushLog(session, `DM falhou: ${e.message}`);
  }
}

function queueSessionDm(session, state = 'RUNNING', detail = '') {
  session.dmUpdateQueue = (session.dmUpdateQueue || Promise.resolve())
    .catch(() => {})
    .then(() => updateSessionDm(session, state, detail));
  return session.dmUpdateQueue;
}

async function sendDoneDm(session) {
  if (!session.botClient || !session.completedQuests.length) return;
  session.currentQuest = null;
  await queueSessionDm(session, 'COMPLETE');
  pushLog(session, 'DM de conclusão atualizada');
}

async function processQuests(session) {
  if (session.processing) return;
  session.processing = true;
  const { client, config, questType } = session;
  try {
    await client.quests.fetchQuests(false);
    const valid = client.quests.filterQuestsValid();
    const { list, video, game } = filterByType(client.quests, valid, questType);

    if (!list.length) {
      if (config.autoRedeem) {
        for (const q of client.quests.getClaimable()) {
          try {
            await client.quests.redeemQuest(q);
            pushLog(session, `resgatar · ${getQuestName(q)}`);
          } catch (_) {}
          await sleep(400);
        }
      }
      pushLog(session, 'nenhuma quest pendente neste filtro');
      if (session.running && !session.completedNotify && session.completedQuests.length) {
        session.completedNotify = true;
        await sendDoneDm(session);
      } else if (session.running && !session.completedNotify) {
        session.completedNotify = true;
        await queueSessionDm(session, 'EMPTY');
      }
      return;
    }

    session.completedNotify = false;
    session.totalQuests = Math.max(
      session.totalQuests,
      session.completedQuests.length + list.length
    );
    pushLog(session, `fila · ${list.length} (vid ${video.length} / jogo ${game.length})`);

    for (const quest of list) {
      if (!session.running) break;
      const isVideo = getQuestType(client.quests, quest) === 'VIDEO';
      const kind = isVideo ? 'VIDEO' : 'JOGO';
      session.currentQuest = getQuestName(quest);
      await queueSessionDm(session, 'RUNNING');
      pushLog(session, `>> fazendo quest de ${isVideo ? 'vídeo' : 'jogo'} · ${getQuestName(quest)}`);

      if (!quest.isEnrolledQuest() && config.autoAccept) {
        try {
          await client.quests.acceptQuest(quest.id);
          pushLog(session, `   aceita`);
          await sleep(250);
        } catch (e) {
          pushLog(session, `   fail aceitar: ${e.message}`);
          continue;
        }
      }

      try {
        await client.quests.doingQuest(quest);
      } catch (e) {
        pushLog(session, `   fail: ${e.message}`);
        continue;
      }

      let completed = false;
      try {
        await client.quests.get();
        const updated = client.quests.getQuest(quest.id);
        completed = Boolean(updated?.isCompleted());
      } catch (_) {}

      if (completed && !session.completedQuests.some((item) => item.id === quest.id)) {
        session.completedQuests.push({
          id: quest.id,
          name: getQuestName(quest),
          type: isVideo ? 'Vídeo' : getQuestType(client.quests, quest) === 'STREAM' ? 'Transmissão' : 'Jogo / atividade',
        });
        pushLog(session, `   completa · ${kind}`);
        const orbValue = getQuestOrbValue(quest);
        recordQuestCompletion(
          session.discordUserId,
          session.discordUsername || '',
          session.accountId,
          quest.id,
          orbValue
        );
        pushLog(session, `   valor da quest · ${orbValue} orbs`);
        await queueSessionDm(session, 'RUNNING');
      }

      if (config.autoRedeem && completed) {
        try {
          const up = client.quests.getQuest(quest.id);
          if (up?.isCompleted()) {
            await client.quests.redeemQuest(up);
            pushLog(session, `   recompensa`);
          }
        } catch (_) {}
      }
      await sleep(isVideo ? config.delayVideo : config.delayGame);
    }

    if (session.running && session.completedQuests.length && !session.completedNotify) {
      try {
        await client.quests.fetchQuests(false);
        const remaining = filterByType(
          client.quests,
          client.quests.filterQuestsValid(),
          questType
        ).list;
        if (!remaining.length) {
          session.completedNotify = true;
          await sendDoneDm(session);
          sendSessionLog(session, 'COMPLETE').catch((e) => pushLog(session, `log de conclusão falhou: ${e.message}`));
        }
      } catch (e) {
        pushLog(session, `aviso final pendente: ${e.message}`);
      }
    }
  } catch (e) {
    pushLog(session, `erro: ${e.message}`);
    await queueSessionDm(session, 'ERROR', 'Ocorreu um erro durante a execução. Uma nova tentativa será feita automaticamente.');
  } finally {
    session.processing = false;
  }
}

async function startAutoQuest(userId, accountId, questType, globalCfg, botClient, discordUsername = '') {
  const session = await ensureClient(userId, accountId);
  if (session.running) {
    return { ok: false, text: 'A automação já está ativa nesta conta.' };
  }
  session.config = defaultConfig(globalCfg);
  session.questType = questType || 'all';
  session.botClient = botClient || null;
  session.completedNotify = false;
  session.completedQuests = [];
  session.startedAt = Date.now();
  session.notificationMessage = null;
  session.currentQuest = null;
  session.totalQuests = 0;
  session.dmUpdateQueue = Promise.resolve();

  session.running = true;
  session.discordUsername = String(discordUsername || session.discordUsername || '');
  recordUsage(session.discordUserId, session.discordUsername);
  const typeLabel =
    session.questType === 'video' ? 'vídeo' : session.questType === 'game' ? 'jogo' : 'vídeo + jogo';
  pushLog(session, `START · filtro ${typeLabel}`);
  queueSessionDm(session, 'PREPARING');
  sendSessionLog(session, 'START').catch((e) => pushLog(session, `log inicial falhou: ${e.message}`));

  processQuests(session).catch((e) => pushLog(session, e.message));
  session.intervalId = setInterval(() => {
    if (session.running) processQuests(session).catch((e) => pushLog(session, e.message));
  }, session.config.pollInterval);

  return {
    ok: true,
    text: `A automação foi iniciada para **${session.accountTag}**. Acompanhe o progresso pela DM.`,
  };
}

async function stopAutoQuest(userId, accountId) {
  const session = getSession(userId, accountId);
  if (!session?.running) return { ok: false, text: 'Auto Quest já está parado nesta conta.' };
  session.running = false;
  if (session.intervalId) {
    clearInterval(session.intervalId);
    session.intervalId = null;
  }
  pushLog(session, 'STOP');
  session.currentQuest = null;
  queueSessionDm(session, 'STOPPED');
  sendSessionLog(session, 'STOP').catch((e) => pushLog(session, `log final falhou: ${e.message}`));
  return { ok: true, text: `Parado · ${session.accountTag}` };
}

function getStatus(userId, accountId) {
  const session = getSession(userId, accountId);
  const acc = getAccount(userId, accountId);
  if (!session) {
    return [
      `**Conta:** ${acc ? `@${acc.username}` : accountId}`,
      '**Engine:** offline',
      '**Auto Quest:** parado',
    ].join('\n');
  }
  const typeLabel =
    session.questType === 'video' ? 'vídeo' : session.questType === 'game' ? 'jogo' : 'todas';
  return [
    `**Conta:** \`${session.accountTag}\``,
    `**Self:** \`${session.client?.user?.tag || '…'}\``,
    `**Auto Quest:** ${session.running ? 'ATIVO' : 'PARADO'}`,
    `**Filtro:** ${typeLabel}`,
    `**Ciclo:** ${session.processing ? 'trabalhando' : 'idle'}`,
  ].join('\n');
}

function getLogs(userId, accountId) {
  const session = getSession(userId, accountId);
  if (!session?.logs?.length) return 'sem logs';
  return session.logs.slice(-25).join('\n');
}

function isRunning(userId, accountId) {
  return !!getSession(userId, accountId)?.running;
}

async function destroyAccountSession(userId, accountId) {
  const key = sessionKey(userId, accountId);
  const session = sessions.get(key);
  if (!session) return;
  session.running = false;
  if (session.intervalId) clearInterval(session.intervalId);
  session.currentQuest = null;
  queueSessionDm(session, 'STOPPED');
  try {
    session.client?.destroy();
  } catch (_) {}
  sessions.delete(key);
}

async function reconnectAccountDevice(userId, accountId, device) {
  const key = sessionKey(userId, accountId);
  const session = sessions.get(key);
  const previousPresence = session?.client?.presence ? {
    status: session.client.presence.status === 'offline' ? 'online' : (session.client.presence.status || 'online'),
    activities: Array.isArray(session.client.presence.activities) ? session.client.presence.activities : [],
    afk: !!session.client.presence.afk,
  } : { status: 'online', activities: [], afk: false };
  if (session) {
    session.running = false;
    if (session.intervalId) clearInterval(session.intervalId);
    session.currentQuest = null;
    try { session.client?.destroy(); } catch (_) {}
    sessions.delete(key);
  }
  setPlatform(userId, accountId, device);
  const connected = await ensureClient(userId, accountId);

  // O dispositivo é definido no IDENTIFY. Uma atualização após o READY faz a
  // nova sessão ser publicada imediatamente em "Disponível em" no perfil.
  await connected.client.user.setPresence(previousPresence);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await connected.client.user.setPresence(previousPresence);
  return connected;
}

module.exports = {
  startAutoQuest,
  stopAutoQuest,
  getStatus,
  getLogs,
  isRunning,
  destroyAccountSession,
  reconnectAccountDevice,
  ensureClient,
};
