import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { logEntrada, logSaida, logError } from '../logs/logger.js';
import { getLogChannelId } from '../logs/channels.js';
import { ET } from '../emojis.js';

function nameOf(user) {
  return user?.globalName || user?.username || 'Desconhecido';
}

function buildLog({ title, color, avatarUrl, description, fields }) {
  const body = fields.map(([label, value]) => `**${label}**\n${value}`).join('\n\n');

  const container = new ContainerBuilder().setAccentColor(color);

  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}`),
          new TextDisplayBuilder().setContent(body)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl).setDescription(description || title)
        )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body)
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:f>`)
    );

  return container;
}

async function send(client, channelId, container, label) {
  if (!channelId) {
    logError({ event: 'CHANNEL_MISSING', label, message: 'ID do canal não definido no .env' });
    return;
  }

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch((err) => {
      logError({ event: 'CHANNEL_FETCH_FAIL', label, channelId, message: err.message });
      return null;
    }));

  if (!channel?.isTextBased()) {
    logError({ event: 'CHANNEL_INVALID', label, channelId });
    return;
  }

  try {
    await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
  } catch (err) {
    logError({ event: 'SEND_FAIL', label, channelId, message: err.message });
  }
}

export function setupGuildMembers(client) {
  client.on('guildMemberAdd', async (member) => {
    try {
      const user = member.user;
      const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
      const joinedAt = member.joinedTimestamp || Date.now();
      const roleId = process.env.ROLE_ENTRADA;

      if (roleId) {
        await member.roles.add(roleId, 'Cargo automático ao entrar').catch((err) => {
          logError({
            event: 'ROLE_ADD_FAIL',
            userId: user.id,
            roleId,
            message: err.message
          });
        });
      }

      logEntrada({
        event: 'MEMBER_JOIN',
        userId: user.id,
        username: user.username,
        avatarUrl,
        guildId: member.guild.id,
        joinedAt,
        accountCreatedAt: user.createdTimestamp,
        roleId
      });

      const container = buildLog({
        title: `${ET.check} Membro entrou`,
        color: 0xffffff,
        avatarUrl,
        description: nameOf(user),
        fields: [
          ['Usuário', `<@${user.id}> · \`${nameOf(user)}\``],
          ['ID', `\`${user.id}\``],
          ['Cargo', roleId ? `<@&${roleId}>` : 'Não configurado'],
          ['Entrou', `<t:${Math.floor(joinedAt / 1000)}:F> · <t:${Math.floor(joinedAt / 1000)}:R>`],
          ['Conta criada', `<t:${Math.floor(user.createdTimestamp / 1000)}:F> · <t:${Math.floor(user.createdTimestamp / 1000)}:R>`]
        ]
      });

      await send(client, process.env.CHANNEL_ENTRADA || process.env.CHANNEL_ORIGEM || getLogChannelId('entrada'), container, 'ENTRADA');
    } catch (err) {
      logError({ event: 'MEMBER_JOIN_ERROR', message: err.message, stack: err.stack });
    }
  });

  client.on('guildMemberRemove', async (member) => {
    try {
      const user = member.user || (await client.users.fetch(member.id).catch(() => null));
      if (!user) {
        logError({ event: 'MEMBER_LEAVE_NO_USER', memberId: member.id, guildId: member.guild?.id });
        return;
      }

      const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
      const leftAt = Date.now();
      const joinedAt = member.joinedTimestamp ?? null;
      const hours = joinedAt ? Math.floor((leftAt - joinedAt) / 3600000) : null;

      logSaida({
        event: 'MEMBER_LEAVE',
        userId: user.id,
        username: user.username,
        avatarUrl,
        guildId: member.guild.id,
        leftAt,
        joinedAt,
        accountCreatedAt: user.createdTimestamp,
        hoursInServer: hours,
        partial: member.partial
      });

      const fields = [
        ['Usuário', `<@${user.id}> · \`${nameOf(user)}\``],
        ['ID', `\`${user.id}\``],
        ['Saiu', `<t:${Math.floor(leftAt / 1000)}:F> · <t:${Math.floor(leftAt / 1000)}:R>`]
      ];

      if (hours !== null) {
        fields.push(['Tempo no servidor', `${hours}h`]);
      }

      if (user.createdTimestamp) {
        fields.push([
          'Conta criada',
          `<t:${Math.floor(user.createdTimestamp / 1000)}:F> · <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
        ]);
      }

      const container = buildLog({
        title: `${ET.pessoas} Membro saiu`,
        color: 0xffffff,
        avatarUrl,
        description: nameOf(user),
        fields
      });

      await send(client, process.env.CHANNEL_SAIDA || process.env.CHANNEL_DESTINO || getLogChannelId('saida'), container, 'SAIDA');
    } catch (err) {
      logError({ event: 'MEMBER_LEAVE_ERROR', message: err.message, stack: err.stack });
    }
  });
}