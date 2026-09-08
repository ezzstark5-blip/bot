import {
  ActivityType,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  getVoiceConnection,
} from '@discordjs/voice';
import { ET } from '../emojis.js';
import { logInfo, logError } from '../logs/logger.js';

/** @type {import('@discordjs/voice').VoiceConnection | null} */
let currentConnection = null;
/** @type {NodeJS.Timeout | null} */
let presenceTimer = null;

function twitchUrl() {
  // Discord só aceita twitch.tv ou youtube.com para status roxo (Streaming)
  const raw =
    process.env.CONNECT_TWITCH_URL ||
    process.env.TWITCH_URL ||
    'https://twitch.tv/discord';
  return raw.replace('https://www.twitch.tv/', 'https://twitch.tv/');
}

function streamTitle() {
  // Nome que aparece no status roxo
  return (
    process.env.CONNECT_STREAM_NAME ||
    process.env.CONNECT_WATCH_NAME ||
    'Next Community'
  );
}

/**
 * Bots do Discord só exibem UMA activity.
 * Streaming = bolinha roxa + "Transmitindo …"
 */
export function applyConnectPresence(client) {
  if (!client?.user) return;

  const name = streamTitle();
  const url = twitchUrl();

  client.user.setPresence({
    status: 'online',
    afk: false,
    activities: [
      {
        name,
        type: ActivityType.Streaming,
        url,
      },
    ],
  });

  // Reforça com setActivity (alguns clients só pegam assim)
  client.user.setActivity({
    name,
    type: ActivityType.Streaming,
    url,
  });

  logInfo({ event: 'BOT_PRESENCE_SET', name, type: 'STREAMING', url });
}

export function startPresenceLoop(client) {
  applyConnectPresence(client);
  if (presenceTimer) clearInterval(presenceTimer);
  // Discord às vezes limpa presence de bot — reaplica a cada 5 min
  presenceTimer = setInterval(() => {
    applyConnectPresence(client);
  }, 5 * 60 * 1000);
}

function defaultVoiceChannelId() {
  return process.env.CONNECT_VOICE_CHANNEL || '1546354889418866739';
}

/**
 * Entra no canal de voz fixo (ou o informado) e aplica status.
 */
export async function joinFixedVoiceChannel(client, channelId = defaultVoiceChannelId()) {
  if (!client || !channelId) return false;

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
    logError({ event: 'VOICE_CHANNEL_INVALID', channelId });
    return false;
  }

  const guild = channel.guild;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.ViewChannel)) {
    logError({ event: 'VOICE_CONNECT_NO_PERM', channelId });
    return false;
  }

  try {
    const existing = getVoiceConnection(guild.id);
    if (existing) existing.destroy();
    if (currentConnection) {
      try {
        currentConnection.destroy();
      } catch {
        /* ignore */
      }
      currentConnection = null;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    currentConnection = connection;
    connection.on('error', (err) => {
      logError({ event: 'VOICE_CONNECTION_ERROR', message: err.message });
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    applyConnectPresence(client);
    startPresenceLoop(client);

    logInfo({ event: 'BOT_VOICE_AUTO_JOIN', channelId: channel.id, guildId: guild.id });
    console.log(`📌 Voz: conectado em #${channel.name} (${channel.id})`);
    return true;
  } catch (err) {
    logError({ event: 'BOT_VOICE_AUTO_JOIN_FAIL', channelId, message: err.message });
    return false;
  }
}

export async function handleConectarCommand(interaction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)
  ) {
    await interaction.reply({
      content: `${ET.config} Sem permissão para conectar o bot.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel('canal', true);

  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    await interaction.reply({
      content: `${ET.config} Escolha um **canal de voz**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.ViewChannel)) {
    await interaction.reply({
      content: `${ET.config} Não tenho permissão de **Conectar** nesse canal.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const existing = getVoiceConnection(interaction.guildId);
    if (existing) existing.destroy();
    if (currentConnection && currentConnection.joinConfig.guildId === interaction.guildId) {
      currentConnection.destroy();
      currentConnection = null;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    currentConnection = connection;

    connection.on('error', (err) => {
      logError({ event: 'VOICE_CONNECTION_ERROR', message: err.message });
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    applyConnectPresence(interaction.client);
    startPresenceLoop(interaction.client);

    logInfo({
      event: 'BOT_VOICE_CONNECTED',
      channelId: channel.id,
      guildId: interaction.guildId,
      by: interaction.user.id,
    });

    await interaction.editReply({
      content: [
        `${ET.check} Conectado em ${channel}.`,
        `${ET.raio} Status roxo: **Transmitindo ${streamTitle()}**`,
        `-# URL: ${twitchUrl()}`,
      ].join('\n'),
    });
  } catch (err) {
    logError({ event: 'BOT_VOICE_CONNECT_FAIL', message: err.message });
    try {
      currentConnection?.destroy();
    } catch {
      /* ignore */
    }
    currentConnection = null;
    // Mesmo se a voz falhar, aplica o status
    applyConnectPresence(interaction.client);
    await interaction.editReply({
      content: `${ET.config} Voz falhou (${err.message}), mas o status **Transmitindo** foi aplicado.`,
    });
  }
}

export async function handleDesconectarCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: `${ET.config} Sem permissão.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const conn =
    getVoiceConnection(interaction.guildId) ||
    (currentConnection?.joinConfig.guildId === interaction.guildId ? currentConnection : null);

  if (conn) {
    conn.destroy();
    currentConnection = null;
  }

  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }

  interaction.client.user?.setPresence({ activities: [], status: 'online' });

  await interaction.reply({
    content: `${ET.check} Desconectado e status limpo.`,
    flags: MessageFlags.Ephemeral,
  });
}
