import { EmbedBuilder, MessageFlags } from 'discord.js';
import { ET, WHITE } from '../emojis.js';
import { logEntrada, logSaida } from '../logs/logger.js';

function makeEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(WHITE)
    .setTitle(data.title)
    .setTimestamp()
    .addFields(
      { name: `${ET.pessoas} Usuário`, value: `${data.username}`, inline: true },
      { name: `${ET.bot} ID`, value: `\`${data.userId}\``, inline: true },
      { name: `${ET.config} Componente`, value: `\`${data.customId}\``, inline: true }
    )
    .setFooter({ text: `ID: ${data.userId}` });

  if (data.extraFields) {
    for (const f of data.extraFields) {
      embed.addFields(f);
    }
  }

  return embed;
}

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function registerInteractions(client) {
  client.on('interactionCreate', async (interaction) => {
    const { customId, user, channel, values, fields } = interaction;
    const now = Date.now();

    if (customId && customId.startsWith('ticket_')) return;
    if (customId && customId.startsWith('clonner_')) return;
    if (customId && customId.startsWith('quest')) return;
    if (customId && customId.startsWith('hypesquad_')) return;
    if (customId && customId.startsWith('sf_')) return;
    if (customId && customId.startsWith('status_')) return;
    if (customId && customId.startsWith('sorteio_')) return;
    if (customId && customId.startsWith('booster_')) return;
    if (customId && customId.startsWith('antiself_')) return;
    if (customId && customId.startsWith('drop_')) return;
    if (customId && customId.startsWith('auth_')) return;

    if (interaction.isButton()) {
      logEntrada({
        event: 'BUTTON_CLICK',
        customId,
        userId: user.id,
        username: user.username,
        avatarUrl: user.displayAvatarURL({ dynamic: true }),
        channelId: channel?.id,
        timestamp: now
      });

      const embed = makeEmbed({
        title: `${ET.raio} Botão Clicado`,
        customId,
        userId: user.id,
        username: user.username
      });

      switch (customId) {
        case 'btn_ok':
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
          break;
        case 'btn_cancel':
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
          break;
        case 'btn_info':
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
          break;
        case 'btn_sim':
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
          break;
        case 'btn_nao':
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
          break;
        case 'btn_close':
          await interaction.update({
            content: `${ET.config} Interação fechada.`,
            embeds: [embed],
            components: [],
            flags: V2,
          });
          break;
        default:
          await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });
      }

      logSaida({ event: 'BUTTON_REPLY', customId, userId: client.user.id, channelId: channel?.id, timestamp: now });
    }

    if (interaction.isStringSelectMenu()) {
      logEntrada({
        event: 'SELECT_MENU',
        customId,
        userId: user.id,
        username: user.username,
        values,
        channelId: channel?.id,
        timestamp: now
      });

      const embed = new EmbedBuilder()
        .setColor(WHITE)
        .setTitle(`${ET.lupa} Select Menu`)
        .setTimestamp()
        .addFields(
          { name: `${ET.pessoas} Usuário`, value: `${user.username}`, inline: true },
          { name: `${ET.bot} ID`, value: `\`${user.id}\``, inline: true },
          { name: `${ET.check} Valores`, value: values.join(', '), inline: false },
          { name: `${ET.config} CustomId`, value: `\`${customId}\``, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` });

      await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });

      logSaida({ event: 'SELECT_REPLY', customId, userId: client.user.id, channelId: channel?.id, timestamp: now });
    }

    if (interaction.isModalSubmit()) {
      const nome = fields.getTextInputValue('campo_nome');
      const descricao = fields.getTextInputValue('campo_descricao');

      logEntrada({
        event: 'MODAL_SUBMIT',
        customId,
        userId: user.id,
        username: user.username,
        avatarUrl: user.displayAvatarURL({ dynamic: true }),
        nome,
        descricao,
        channelId: channel?.id,
        timestamp: now
      });

      const embed = new EmbedBuilder()
        .setColor(WHITE)
        .setTitle(`${ET.edit} Formulário Enviado`)
        .setTimestamp()
        .addFields(
          { name: `${ET.pessoas} Usuário`, value: `${user.username}`, inline: true },
          { name: `${ET.bot} ID`, value: `\`${user.id}\``, inline: true },
          { name: `${ET.edit} Nome`, value: nome, inline: false },
          { name: `${ET.lupa} Descrição`, value: descricao || 'N/A', inline: false },
          { name: `${ET.config} CustomId`, value: `\`${customId}\``, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` });

      await interaction.reply({ embeds: [embed], flags: V2_EPHEMERAL });

      logSaida({ event: 'MODAL_REPLY', customId, userId: client.user.id, channelId: channel?.id, timestamp: now });
    }
  });
}
