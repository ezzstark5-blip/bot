import { PermissionFlagsBits } from 'discord.js';
import { logSaida, logError } from '../logs/logger.js';

const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i;

const ALLOWED_INVITE_CHANNEL =
  process.env.ALLOWED_INVITE_CHANNEL || '1546374722361622608';

const TIMEOUT_MS = 24 * 60 * 60 * 1000;

async function punishInvite(message) {
  if (!message.guild || message.author?.bot) return;
  if (message.channelId === ALLOWED_INVITE_CHANNEL) return;

  const content = message.content || '';
  if (!INVITE_REGEX.test(content)) return;

  const member = message.member;
  if (!member) return;

  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    logError({
      event: 'INVITE_TIMEOUT_NO_PERM',
      message: 'Bot sem permissão Moderate Members (Castigar membros)',
    });
    return;
  }

  if (!member.moderatable) {
    logError({
      event: 'INVITE_TIMEOUT_SKIP',
      userId: member.id,
      message: 'Membro não pode ser castigado (cargo igual/acima do bot ou admin)',
    });
    return;
  }

  await member.timeout(TIMEOUT_MS, 'Envio de convite discord.gg fora do canal permitido');
  await message.delete().catch(() => null);

  await message.channel
    .send({
      content:
        `${member} recebeu **castigo de 1 dia** por enviar convite de servidor.\n` +
        `Convites só são permitidos em <#${ALLOWED_INVITE_CHANNEL}>.`,
    })
    .catch(() => null);

  logSaida({
    event: 'INVITE_TIMEOUT',
    userId: member.id,
    username: member.user.username,
    channelId: message.channelId,
    guildId: message.guild.id,
    duration: '1d',
    reason: 'discord invite link outside allowed channel',
  });
}

export function setupInviteGuard(client) {
  client.on('messageCreate', async (message) => {
    try {
      await punishInvite(message);
    } catch (err) {
      logError({ event: 'INVITE_GUARD_ERROR', message: err.message, stack: err.stack });
    }
  });

  client.on('messageUpdate', async (_oldMessage, newMessage) => {
    try {
      if (newMessage.partial) {
        try {
          newMessage = await newMessage.fetch();
        } catch {
          return;
        }
      }
      await punishInvite(newMessage);
    } catch (err) {
      logError({ event: 'INVITE_GUARD_EDIT_ERROR', message: err.message, stack: err.stack });
    }
  });
}
