import { MessageFlags } from 'discord.js';

/**
 * Envia o painel/embed no canal como mensagem normal do bot,
 * sem aparecer "usuário usou /comando" acima.
 */
export async function sendAsChannelMessage(interaction, payload = {}) {
  const channel = interaction.channel;
  if (!channel?.isTextBased?.()) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply(payload);
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const message = await channel.send({
    content: payload.content ?? undefined,
    components: payload.components,
    embeds: payload.embeds,
    files: payload.files,
    flags: payload.flags,
    allowedMentions: payload.allowedMentions ?? { parse: [] },
  });

  await interaction.deleteReply().catch(() => null);
  return message;
}
