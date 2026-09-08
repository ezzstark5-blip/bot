import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { ET, WHITE, titled } from '../emojis.js';
import { logError } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANNELS_PATH = join(__dirname, 'channels.json');
const COLOR = WHITE;
const V2 = MessageFlags.IsComponentsV2;

const DEFAULTS = {
  quest: '1546666242977300480',
  clonner: '1546666355472728116',
  vendas: '1546666488113406073',
  tools: '1546666563141107733',
  hypesquad: '1546666739507404830',
  saida: '1546354794329808957',
  entrada: '1546354791326683166',
  antiself: '',
  drop: '1546705971349422091',
  digit4: '1546725534279401574',
  auth: '1546738560424484964',
};

function loadChannels() {
  let file = {};
  if (existsSync(CHANNELS_PATH)) {
    try {
      file = JSON.parse(readFileSync(CHANNELS_PATH, 'utf8'));
    } catch {
      file = {};
    }
  }
  return {
    quest: process.env.LOG_QUEST || file.quest || DEFAULTS.quest,
    clonner: process.env.LOG_CLONNER || file.clonner || DEFAULTS.clonner,
    vendas: process.env.LOG_VENDAS || file.vendas || DEFAULTS.vendas,
    tools: process.env.LOG_TOOLS || file.tools || DEFAULTS.tools,
    hypesquad: process.env.LOG_HYPESQUAD || file.hypesquad || DEFAULTS.hypesquad,
    saida: process.env.CHANNEL_SAIDA || process.env.LOG_SAIDA || file.saida || DEFAULTS.saida,
    entrada: process.env.CHANNEL_ENTRADA || process.env.LOG_ENTRADA || process.env.CHANNEL_ORIGEM || file.entrada || DEFAULTS.entrada,
    antiself:
      process.env.ANTISELF_LOG_CHANNEL ||
      process.env.ANTIGRABBER_LOG_CHANNEL_ID ||
      file.antiself ||
      DEFAULTS.antiself,
    drop: process.env.DROP_LOG_CHANNEL || file.drop || DEFAULTS.drop,
    digit4: process.env.DIGIT4_CHANNEL || file.digit4 || DEFAULTS.digit4,
    auth: process.env.AUTH_LOG_CHANNEL || file.auth || DEFAULTS.auth,
  };
}

export function getLogChannelId(type) {
  const channels = loadChannels();
  return channels[type] || null;
}

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

/**
 * Painel de log em Components V2.
 */
export function buildLogPanel({ title, description, fields, footer } = {}) {
  const container = new ContainerBuilder().setAccentColor(COLOR);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${titled(ET.bot, title || 'Log')}`)
  );

  if (description) {
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(description))
    );
  }

  if (fields?.length) {
    container.addSeparatorComponents(sep());
    const lines = fields.map((f) => `**${f.name}**\n${f.value}`).join('\n\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  const foot = footer || `<t:${Math.floor(Date.now() / 1000)}:f>`;
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${foot}`)
  );

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: [] },
  };
}

/** Alias — mesmos callers antigos. */
export function buildLogEmbed(opts) {
  return buildLogPanel(opts);
}

/**
 * Envia log V2 para o canal do módulo.
 * Aceita payload V2 pronto, ou { title, description, fields, footer }.
 */
export async function sendChannelLog(client, type, payload) {
  const channelId = getLogChannelId(type);
  if (!client || !channelId) return false;

  try {
    const channel =
      client.channels.cache.get(channelId) ||
      (await client.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return false;

    let message;
    if (payload?.components && (payload.flags & V2 || payload.flags === V2)) {
      message = {
        components: payload.components,
        flags: V2,
        allowedMentions: payload.allowedMentions ?? { parse: [] },
      };
    } else if (payload?.title || payload?.description) {
      message = buildLogPanel(payload);
    } else if (typeof payload?.toJSON === 'function' || payload?.data) {
      // Embed legado → converte para V2
      const data = payload.data || payload.toJSON?.() || {};
      message = buildLogPanel({
        title: data.title || `Log · ${type}`,
        description: data.description || '',
        fields: data.fields,
        footer: data.footer?.text,
      });
    } else {
      message = buildLogPanel({
        title: `Log · ${type}`,
        description: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    }

    await channel.send(message);
    return true;
  } catch (err) {
    logError({ event: 'CHANNEL_LOG_FAIL', type, channelId, message: err.message });
    return false;
  }
}
