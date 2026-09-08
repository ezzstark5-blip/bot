import { askGroq, splitMessage } from '../ai/groq.js';
import { logEntrada, logError } from '../logs/logger.js';
import { ET } from '../emojis.js';

export function setupAiCommand(client) {
  const prefix = () => process.env.PREFIX || '!';

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const p = prefix();
    if (!message.content.startsWith(p)) return;

    const withoutPrefix = message.content.slice(p.length).trim();
    const [command, ...rest] = withoutPrefix.split(/\s+/);
    if (command?.toLowerCase() !== 'ia') return;

    const allowedChannel = process.env.CHANNEL_IA || '1546369763758837810';
    if (message.channelId !== allowedChannel) return;

    const pergunta = rest.join(' ').trim();
    if (!pergunta) {
      await message.reply(`Use: \`${p}ia sua pergunta\``);
      return;
    }

    const thinking = await message.reply(`${ET.bot} Pensando...`);

    try {
      logEntrada({
        event: 'AI_ASK',
        userId: message.author.id,
        username: message.author.username,
        prompt: pergunta.slice(0, 300)
      });

      const answer = await askGroq(pergunta, message.author.username);
      const chunks = splitMessage(answer);

      await thinking.edit(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
    } catch (err) {
      logError({ event: 'AI_ERROR', message: err.message });
      await thinking.edit('Não consegui responder agora. Tente de novo em instantes.').catch(() => null);
    }
  });
}