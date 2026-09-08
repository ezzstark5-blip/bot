import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { getLogChannelId, sendChannelLog } from '../logs/channels.js';
import { ET } from '../emojis.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';
import {
  buildDropPanel,
  buildDropModal,
  buildDropLogPanel,
  buildDropSuccessPanel,
} from './components.js';

export async function replyDropPanel(interaction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content: `${ET.config} Você precisa de **Gerenciar Servidor** para postar o painel.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await sendAsChannelMessage(interaction, buildDropPanel({ ephemeral: false }));
  logEntrada({
    event: 'DROP_PANEL_POSTED',
    userId: interaction.user.id,
    channelId: interaction.channelId,
  });
}

export async function handleDropInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('drop_')) return false;

  try {
    if (interaction.isButton() && id === 'drop_pedir') {
      await interaction.showModal(buildDropModal());
      return true;
    }

    if (interaction.isModalSubmit() && id === 'drop_modal') {
      const vazamento = interaction.fields.getTextInputValue('drop_vazamento')?.trim() || '';
      if (!vazamento) {
        await interaction.reply({
          content: `${ET.config} Informe qual vazamento você quer.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const logPayload = buildDropLogPanel({
        user: interaction.user,
        vazamento,
      });

      const sent = await sendChannelLog(interaction.client, 'drop', logPayload);
      if (!sent) {
        const channelId =
          process.env.DROP_LOG_CHANNEL ||
          getLogChannelId('drop') ||
          '1546705971349422091';
        try {
          const ch =
            interaction.client.channels.cache.get(channelId) ||
            (await interaction.client.channels.fetch(channelId).catch(() => null));
          if (ch?.isTextBased?.()) {
            await ch.send(logPayload);
          } else {
            throw new Error('Canal de log não encontrado');
          }
        } catch (err) {
          logError({ event: 'DROP_LOG_FAIL', message: err.message });
          await interaction.reply({
            content: `${ET.config} Não foi possível enviar o pedido para a staff.`,
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }
      }

      await interaction.reply(buildDropSuccessPanel());

      logEntrada({
        event: 'DROP_REQUEST',
        userId: interaction.user.id,
        username: interaction.user.username,
        vazamento: vazamento.slice(0, 200),
      });
      return true;
    }
  } catch (err) {
    logError({ event: 'DROP_INTERACTION_FAIL', message: err.message, customId: id });
    const payload = {
      content: `${ET.config} Erro no drop: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else if (!interaction.isModalSubmit()) {
      await interaction.reply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }

  return true;
}
