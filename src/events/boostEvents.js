import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { ET } from '../emojis.js';

function nameOf(user) {
  return user.globalName || user.username;
}

function boostDays(premiumSince) {
  if (!premiumSince) return 0;
  return Math.max(1, Math.floor((Date.now() - premiumSince) / 86400000) + 1);
}

function buildBoostLog(member) {
  const user = member.user;
  const since = member.premiumSinceTimestamp;
  const days = boostDays(since);
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const boostCount = member.guild.premiumSubscriptionCount ?? 0;
  const boostLevel = member.guild.premiumTier ?? 0;

  return new ContainerBuilder()
    .setAccentColor(0xffffff)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${ET.rocket} Dia do Impulso`),
          new TextDisplayBuilder().setContent(
            [
              `${ET.pessoas} **Booster:** <@${user.id}> · \`${nameOf(user)}\``,
              `**ID:** \`${user.id}\``,
              `${ET.raio} **Dia do impulso:** **${days}º dia**`,
              since
                ? `${ET.tempo} **Impulsionando desde:** <t:${Math.floor(since / 1000)}:F> · <t:${Math.floor(since / 1000)}:R>`
                : `${ET.tempo} **Impulsionando desde:** Agora`,
              `${ET.coin} **Boosts do servidor:** \`${boostCount}\``,
              `**Nível do servidor:** \`${boostLevel}\``
            ].join('\n')
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl).setDescription(nameOf(user))
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${ET.rocket} Obrigado por impulsionar o servidor! · <t:${Math.floor(Date.now() / 1000)}:f>`
      )
    );
}

async function sendBoostLog(client, member) {
  const channelId = process.env.CHANNEL_BOOST;
  if (!channelId) return;

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel?.isTextBased()) {
    logError({ event: 'BOOST_CHANNEL_INVALID', channelId });
    return;
  }

  await channel.send({
    components: [buildBoostLog(member)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  });
}

export function setupBoostLogs(client) {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const wasBoosting = Boolean(oldMember.premiumSince);
      const isBoosting = Boolean(newMember.premiumSince);

      if (!wasBoosting && isBoosting) {
        logEntrada({
          event: 'SERVER_BOOST',
          userId: newMember.id,
          username: newMember.user.username,
          premiumSince: newMember.premiumSinceTimestamp,
          guildId: newMember.guild.id,
          boostCount: newMember.guild.premiumSubscriptionCount
        });

        await sendBoostLog(client, newMember);
      }
    } catch (err) {
      logError({ event: 'BOOST_LOG_ERROR', message: err.message, stack: err.stack });
    }
  });
}