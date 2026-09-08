import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { ET } from '../emojis.js';
import { getLogChannelId } from '../logs/channels.js';
import { logError, logInfo } from '../logs/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', '..', 'data', 'antiself.json');
const WHITE = 0xffffff;
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function cfg() {
  return {
    channelId: process.env.ANTISELF_CHANNEL_ID || process.env.ANTIGRABBER_CHANNEL_ID || '',
    logChannelId:
      process.env.ANTISELF_LOG_CHANNEL ||
      process.env.ANTIGRABBER_LOG_CHANNEL_ID ||
      getLogChannelId('antiself') ||
      '',
    action: (process.env.ANTISELF_ACTION || process.env.ANTIGRABBER_ACTION || 'timeout').toLowerCase(),
    timeoutMs: Number(process.env.ANTISELF_TIMEOUT_MS || process.env.ANTIGRABBER_TIMEOUT_MS || 604800000),
    staffRoleId: process.env.TICKET_STAFF_ROLE || '',
    thumbUrl: process.env.ANTISELF_THUMB_URL || process.env.BOOSTER_BANNER_URL || '',
  };
}

function readStore() {
  try {
    if (!existsSync(DATA_PATH)) return { channels: {} };
    const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    if (!raw.channels || typeof raw.channels !== 'object') return { channels: {} };
    return raw;
  } catch {
    return { channels: {} };
  }
}

function writeStore(store) {
  const dir = dirname(DATA_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function isTrapChannel(channelId) {
  if (!channelId) return false;
  const fixed = cfg().channelId;
  if (fixed && channelId === fixed) return true;
  return Boolean(readStore().channels[channelId]);
}

function markTrapChannel(channelId, meta = {}) {
  const store = readStore();
  store.channels[channelId] = {
    enabled: true,
    action: meta.action || cfg().action || 'timeout',
    setBy: meta.setBy || null,
    setAt: Date.now(),
  };
  writeStore(store);
  return store.channels[channelId];
}

function unmarkTrapChannel(channelId) {
  const store = readStore();
  if (!store.channels[channelId]) return false;
  delete store.channels[channelId];
  writeStore(store);
  return true;
}

function getChannelConfig(channelId) {
  const store = readStore();
  if (store.channels[channelId]) return store.channels[channelId];
  const fixed = cfg().channelId;
  if (fixed && channelId === fixed) {
    return { enabled: true, action: cfg().action || 'timeout' };
  }
  return null;
}

function isExempt(member) {
  if (!member) return false;
  if (member.user?.bot) return true;
  if (member.id === member.client?.user?.id) return true;
  // Cargo opcional de bypass (não inclui Admin automaticamente)
  const bypassRole = process.env.ANTISELF_BYPASS_ROLE || '';
  if (bypassRole && member.roles?.cache?.has(bypassRole)) return true;
  return false;
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.BanMembers)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  const staffRole = cfg().staffRoleId;
  if (staffRole && member.roles?.cache?.has(staffRole)) return true;
  return false;
}

function statusLabel(action) {
  const mode = (action || 'ban').toLowerCase();
  if (mode === 'kick') return 'kick aplicado';
  if (mode === 'timeout') return 'timeout de 7 dias aplicado';
  if (mode === 'ban') return 'ban aplicado';
  return `${mode} aplicado`;
}

function formatBanTime(date = new Date()) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function buildWarningPanel() {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(WHITE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `# ${ET.config} Não envie mensagens neste canal!`,
              '',
              'Canal criado para manter a segurança dos usuários — **anti-spam / Anti Self**.',
              'Não escreva neste canal, você pode receber uma punição indesejada!',
              '',
              `-# ${ET.bot} Anti Self`,
            ].join('\n')
          )
        ),
    ],
    flags: V2,
  };
}

function buildSelfbotLog({ userId, action, when = new Date() }) {
  const thumb = cfg().thumbUrl || null;
  const body = [
    '**Membro**',
    `<@${userId}>`,
    '',
    '**ID**',
    `\`${userId}\``,
    '',
    '**Hora**',
    formatBanTime(when),
    '',
    '**Status**',
    statusLabel(action),
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(WHITE);
  const heading = `# ${ET.lupa} Selfbot detectado\n\n${body}`;

  if (thumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(heading)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(heading)
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`antiself_rmto:${userId}`)
        .setLabel('Remover timeout')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`antiself_unban:${userId}`)
        .setLabel('Desbanir')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { components: [container], flags: V2 };
}

function notice(title, body) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(WHITE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`# ${ET.config} ${title}\n${body}`)
        ),
    ],
    flags: V2_EPHEMERAL,
  };
}

async function sendSelfbotLog(client, { userId, action }) {
  const channelId = cfg().logChannelId;
  if (!channelId || !client) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return;
    await ch.send(buildSelfbotLog({ userId, action }));
  } catch (err) {
    logError({ event: 'ANTISELF_LOG_FAIL', message: err.message });
  }
}

async function sendFailLog(client, lines) {
  const channelId = cfg().logChannelId;
  if (!channelId || !client) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return;
    await ch.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(WHITE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# ${ET.config} Selfbot — falha\n\n${lines.join('\n')}\n\n-# ${ET.bot} Anti Self`
            )
          ),
      ],
      flags: V2,
    });
  } catch (err) {
    logError({ event: 'ANTISELF_FAIL_LOG', message: err.message });
  }
}

async function punish(member, action) {
  const reason = 'Anti Self — selfbot / honeypot';
  const mode = (action || 'timeout').toLowerCase();

  if (member.guild?.ownerId === member.id) {
    throw new Error('Não é possível castigar o dono do servidor (mensagem apagada).');
  }

  if (mode === 'kick') {
    if (!member.kickable) throw new Error('Membro não pode ser expulso (cargo acima do bot).');
    await member.kick(reason);
    return 'kick';
  }
  if (mode === 'timeout') {
    if (!member.moderatable) {
      throw new Error('Membro não pode receber timeout (admin/cargo acima do bot).');
    }
    const ms = Number(cfg().timeoutMs) || 7 * 24 * 60 * 60 * 1000;
    await member.timeout(ms, reason);
    return 'timeout';
  }
  if (!member.bannable) throw new Error('Membro não pode ser banido (cargo acima do bot).');
  await member.ban({ reason, deleteMessageSeconds: 0 });
  return 'ban';
}

export async function handleAntiselfCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: `${ET.config} Apenas administradores podem configurar o Anti Self.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('canal') || interaction.channel;

  if (!channel?.isTextBased?.()) {
    return interaction.reply({
      content: `${ET.config} Escolha um canal de texto.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'desativar') {
    const removed = unmarkTrapChannel(channel.id);
    return interaction.reply({
      content: removed
        ? `${ET.check} Anti Self **desativado** em <#${channel.id}>.`
        : `${ET.lupa} <#${channel.id}> não estava marcado como honeypot.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const action = interaction.options.getString('punicao') || cfg().action || 'timeout';
  markTrapChannel(channel.id, {
    action,
    setBy: interaction.user.id,
  });

  await channel.send(buildWarningPanel());

  const logId = cfg().logChannelId;
  return interaction.reply({
    content: [
      `${ET.check} Anti Self **ativo** em <#${channel.id}>.`,
      `Punição: \`${action}\` (qualquer mensagem no canal, inclusive admin).`,
      logId ? `Logs: <#${logId}>` : 'Logs: configure `ANTISELF_LOG_CHANNEL` no `.env`.',
      'Aviso postado no canal.',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

export async function routeAntiselfInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || '';
  if (!id.startsWith('antiself_rmto:') && !id.startsWith('antiself_unban:')) {
    return false;
  }

  if (!isStaff(interaction.member)) {
    await interaction.reply(notice('Sem permissão', 'Apenas staff pode usar estes botões.'));
    return true;
  }

  const userId = id.split(':')[1];
  if (!userId) {
    await interaction.reply(notice('Erro', 'ID inválido.'));
    return true;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply(notice('Erro', 'Servidor não encontrado.'));
    return true;
  }

  try {
    if (id.startsWith('antiself_rmto:')) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await interaction.reply(
          notice('Erro', `Membro <@${userId}> não está no servidor.`)
        );
        return true;
      }
      await member.timeout(null, `Timeout removido por ${interaction.user.tag} (Anti Self)`);
      await interaction.reply(
        notice('Timeout removido', `Timeout de <@${userId}> removido por <@${interaction.user.id}>.`)
      );
      return true;
    }

    await guild.members.unban(userId, `Desbanido por ${interaction.user.tag} (Anti Self)`);
    await interaction.reply(
      notice('Desbanido', `<@${userId}> desbanido por <@${interaction.user.id}>.`)
    );
  } catch (err) {
    await interaction.reply(
      notice('Erro', err.message || 'Não foi possível concluir a ação.')
    );
  }
  return true;
}

async function onMessageCreate(message) {
  if (!message.guild || message.author?.bot) return;
  if (!isTrapChannel(message.channelId)) return;

  const channelCfg = getChannelConfig(message.channelId);
  if (!channelCfg?.enabled) return;

  let member = message.member;
  if (!member) {
    try {
      member = await message.guild.members.fetch(message.author.id);
    } catch {
      return;
    }
  }

  if (isExempt(member)) return;

  const contentPreview = String(message.content || '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  // Sempre tenta apagar, mesmo se a punição falhar
  const deleted = await message.delete().then(() => true).catch(() => false);

  let result = 'falha';
  try {
    result = await punish(member, channelCfg.action);
  } catch (err) {
    logError({ event: 'ANTISELF_PUNISH_FAIL', message: err.message, userId: message.author.id });
    await sendFailLog(message.client, [
      `**Membro:** <@${message.author.id}>`,
      `**ID:** \`${message.author.id}\``,
      `**Canal:** <#${message.channelId}>`,
      `**Msg apagada:** ${deleted ? 'sim' : 'não'}`,
      `**Erro:** ${err.message}`,
      contentPreview ? `**Msg:** \`${contentPreview}\`` : null,
    ].filter(Boolean));
    return;
  }

  logInfo({
    event: 'ANTISELF_HIT',
    userId: message.author.id,
    channelId: message.channelId,
    action: result,
  });

  await sendSelfbotLog(message.client, {
    userId: message.author.id,
    action: result,
  });
}

export function setupAntiself(client) {
  client.on('messageCreate', (message) => {
    onMessageCreate(message).catch((err) => {
      logError({ event: 'ANTISELF_ERROR', message: err?.message || String(err) });
    });
  });
}
