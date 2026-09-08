import { MessageFlags } from 'discord.js';
import { ET } from '../emojis.js';
import { logEntrada, logSaida } from '../logs/logger.js';
import { createButtonRow, createConfirmRow, createSelectRow, createModal } from '../components/components.js';

export function setupMessageCreate(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const channelEntrada = process.env.CHANNEL_ENTRADA;
    const channelSaida = process.env.CHANNEL_SAIDA;
    const prefix = process.env.PREFIX || '!';

    if (message.channelId === channelEntrada) {
      logEntrada({
        userId: message.author.id,
        username: message.author.username,
        channelId: message.channelId,
        content: message.content,
        messageId: message.id,
        timestamp: message.createdTimestamp
      });

      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'responder') {
          const responseText = args.join(' ') || 'Resposta automática';
          await message.reply(responseText);

          logSaida({
            userId: client.user.id,
            username: client.user.username,
            channelId: message.channelId,
            content: responseText,
            messageId: message.id,
            timestamp: Date.now()
          });
        }

        if (command === 'painel') {
          await message.reply({
            content: `${ET.raio} Painel de botões:`,
            components: [createButtonRow(), createConfirmRow(), createSelectRow()]
          });

          logSaida({ event: 'PAINEL_SENT', channelId: message.channelId, userId: client.user.id });
        }

        if (command === 'modal') {
          await message.showModal(createModal());

          logSaida({ event: 'MODAL_SENT', channelId: message.channelId, userId: client.user.id });
        }
      }
    }

    if (message.channelId === channelSaida) {
      logSaida({
        userId: message.author.id,
        username: message.author.username,
        channelId: message.channelId,
        content: message.content,
        messageId: message.id,
        timestamp: message.createdTimestamp
      });
    }
  });
}
