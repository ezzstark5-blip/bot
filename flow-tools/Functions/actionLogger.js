const {
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { getToken } = require('./tokenManager');
const fs = require('fs');
const path = require('path');

const NOTIFICATIONS_PATH = path.join(__dirname, '../data/notifications.json');
const inaccessibleChannels = new Map();
const V2 = MessageFlags.IsComponentsV2;

function loadNotifications() {
  try {
    return JSON.parse(fs.readFileSync(NOTIFICATIONS_PATH, 'utf8'));
  } catch (error) {
    console.error('[FLOW NOTIFICATIONS]', error?.message || error);
    return {};
  }
}

function saveNotifications(data) {
  fs.writeFileSync(NOTIFICATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function setLogChannel(channelType, channelId) {
  const notifications = loadNotifications();
  notifications.logRouting ||= {};
  const key = channelType === 'admin' ? 'ADMIN_LOGS' : 'PUBLIC_LOGS';
  notifications.logRouting[key] ||= {};
  notifications.logRouting[key].channelId = String(channelId || '');
  if (channelId) notifications.logRouting[key].webhookUrl = '';
  saveNotifications(notifications);
}

function setLogWebhook(channelType, webhookUrl) {
  const notifications = loadNotifications();
  notifications.logRouting ||= {};
  const key = channelType === 'admin' ? 'ADMIN_LOGS' : 'PUBLIC_LOGS';
  notifications.logRouting[key] ||= {};
  notifications.logRouting[key].webhookUrl = String(webhookUrl || '').trim();
  if (webhookUrl) notifications.logRouting[key].channelId = '';
  saveNotifications(notifications);
}

function getLogChannel(channelType) {
  const notifications = loadNotifications();
  const configured = channelType === 'admin'
    ? notifications.logRouting?.ADMIN_LOGS?.channelId
    : notifications.logRouting?.PUBLIC_LOGS?.channelId;
  return configured ? String(configured) : '';
}

function accountAvatar(account) {
  if (!account?.avatar || !account?.id) return null;
  const format = String(account.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.${format}?size=256`;
}

function maskToken(token) {
  const value = String(token || '');
  if (!value) return 'Não disponível';
  if (value.includes('```')) return value;
  const first = value.split('.')[0] || value.slice(0, 6);
  return `${first.slice(0, 8)}••••••${value.slice(-4)}`;
}

function compatibleEmoji(bot, configured, fallback = '') {
  const value = String(configured || '').trim();
  const match = value.match(/^<a?:[^:>]+:(\d+)>$/);
  if (!match) return value || fallback;
  return bot?.emojis?.cache?.has(match[1]) ? value : fallback;
}

function renderTemplate(template, values) {
  return String(template || '').replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    const val = values[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

function splitEmbedTemplate(rendered, fallbackTitle) {
  const lines = String(rendered || '').split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) return { title: fallbackTitle, description: '\u200b' };
  const title = lines[firstIndex].replace(/^\s*#{1,3}\s*/, '').trim().slice(0, 256) || fallbackTitle;
  const description = lines.filter((_, index) => index !== firstIndex).join('\n').trim().slice(0, 4096) || '\u200b';
  return { title, description };
}

async function sendActionLog({
  bot,
  config,
  interaction,
  account,
  title,
  action,
  details = '',
  result = 'Concluído',
  thumbnail = null,
  channelType = 'public',
}) {
  const notifications = loadNotifications();
  if (notifications.enabled === false) return false;
  const route = channelType === 'admin'
    ? notifications.logRouting?.ADMIN_LOGS
    : notifications.logRouting?.PUBLIC_LOGS;
  const format = channelType === 'admin' ? route?.adminLogFormat : route?.publicLogFormat;
  const webhookUrl = String(route?.webhookUrl || '').trim();
  const channelId = getLogChannel(channelType);
  if (format?.enabled === false || !format?.template || !bot || (!channelId && !webhookUrl) || !interaction?.user) return false;
  if ((inaccessibleChannels.get(channelId) || 0) > Date.now()) return false;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const adminLog = channelType === 'admin';
    const rawToken = account ? getToken(interaction.user.id, account.id) : null;
    
    // ═══ LÓGICA DE MASCARAMENTO ═══
    const shouldMask = adminLog && route?.maskToken !== false;
    const tokenDisplay = shouldMask ? maskToken(rawToken) : (rawToken || 'Não disponível');
    // Se não estiver mascarando e o token não for vazio, coloca em bloco de código
    const finalToken = adminLog && !shouldMask && tokenDisplay !== 'Não disponível'
      ? `\`\`\`${tokenDisplay}\`\`\``
      : tokenDisplay;

    const displayTitle = notifications.functionNames?.[title] || title;
    const emojis = notifications.logEmbed?.emojis || {};
    const emojiFallbacks = notifications.logEmbed?.emojiFallbacks || {};
    const template = adminLog && route?.includeUserToken === false
      ? String(format.template).split(/\r?\n/).filter((line) => !line.includes('{token}')).join('\n')
      : format.template;

    const rendered = renderTemplate(template, {
      user: `<@${interaction.user.id}>`,
      userId: interaction.user.id,
      timestamp: `<t:${timestamp}:F>`,
      token: finalToken,
      function: displayTitle,
      title: displayTitle,
      action,
      details,
      result,
      account: account ? `@${account.username}` : 'Não disponível',
      accountId: account?.id || '',
      notifyEmoji: compatibleEmoji(bot, emojis.notify, emojiFallbacks.notify),
      userEmoji: compatibleEmoji(bot, emojis.user, emojiFallbacks.user),
      dateEmoji: compatibleEmoji(bot, emojis.date, emojiFallbacks.date),
      tokenEmoji: compatibleEmoji(bot, emojis.token, emojiFallbacks.token),
    });

    const content = splitEmbedTemplate(rendered, displayTitle);
    const appearance = notifications.appearance || {};
    const useV2 = appearance.componentsV2 !== false;

    if (webhookUrl && !useV2) {
      const embed = new EmbedBuilder()
        .setTitle(content.title)
        .setDescription(content.description)
        .setColor(0xffffff);
      if (appearance.showFooter && notifications.logEmbed?.footer) {
        embed.setFooter({ text: notifications.logEmbed.footer });
      }
      if (appearance.showTimestamp) embed.setTimestamp();
      const image = thumbnail || accountAvatar(account) || interaction.user.displayAvatarURL?.({ size: 256 });
      if (image && notifications.logEmbed?.showAccountAvatar !== false) embed.setThumbnail(image);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ embeds: [embed.toJSON()] }),
      });
      if (!response.ok) throw new Error(`Webhook recusado pelo Discord (${response.status})`);
      return true;
    }

    const container = new ContainerBuilder()
      .setAccentColor(0xffffff)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${content.title}`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content.description || '—')
      );

    if (appearance.showFooter && notifications.logEmbed?.footer) {
      container
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${notifications.logEmbed.footer}`)
        );
    } else {
      container
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`)
        );
    }

    const payload = {
      components: [container],
      flags: V2,
      allowedMentions: { parse: [] },
    };

    if (webhookUrl) {
      // Webhooks não suportam Components V2 de forma confiável — envia texto
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: `**${content.title}**\n${content.description}`.slice(0, 1900),
        }),
      });
      if (!response.ok) throw new Error(`Webhook recusado pelo Discord (${response.status})`);
    } else {
      const channel = bot.channels.cache.get(channelId) || await bot.channels.fetch(channelId);
      if (!channel?.isTextBased?.()) return false;
      await channel.send(payload);
    }
    return true;
  } catch (error) {
    if (error?.code === 50001 || error?.message === 'Missing Access') {
      inaccessibleChannels.set(channelId, Date.now() + 60_000);
      console.warn(`[FLOW ACTION LOG] Sem acesso ao canal ${channelId}. Configure novamente com /setlogs.`);
    } else {
      console.error('[FLOW ACTION LOG]', error?.message || error);
    }
    return false;
  }
}

function logInBackground(data) {
  const delivery = loadNotifications().delivery || {};
  const retryAttempts = Math.max(0, Number(delivery.retryAttempts) || 0);
  const retryDelayMs = Math.max(250, Number(delivery.retryDelayMs) || 1500);
  const deliver = async (payload) => {
    for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
      if (await sendActionLog(payload).catch(() => false)) return;
      if (attempt < retryAttempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  };

  deliver({ ...data, channelType: 'public' }).catch(() => {});
  deliver({ ...data, channelType: 'admin' }).catch(() => {});
}

module.exports = { sendActionLog, logInBackground, loadNotifications, setLogChannel, setLogWebhook, getLogChannel };
