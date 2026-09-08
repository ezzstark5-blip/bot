import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { ET } from '../emojis.js';
import {
  buildClonnerPanel,
  buildClonnerModal,
  buildClonnerInfo,
  buildClonnerStatus,
} from './components.js';
import { runClonner } from './clone.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator);
}

export async function replyClonnerPanel(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      components: [
        buildClonnerStatus(
          `${ET.config} Sem permissão`,
          'Apenas administradores podem usar o clonador.'
        ),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await sendAsChannelMessage(interaction, {
    components: [buildClonnerPanel()],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  logEntrada({
    event: 'CLONNER_PANEL',
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });
}

export async function handleClonnerButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('clonner_')) return false;

  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      components: [
        buildClonnerStatus(
          `${ET.config} Sem permissão`,
          'Apenas administradores podem usar o clonador.'
        ),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  try {
    if (interaction.customId === 'clonner_start') {
      await interaction.showModal(buildClonnerModal());
      return true;
    }

    if (interaction.customId === 'clonner_help') {
      await interaction.reply({
        components: [buildClonnerInfo()],
        flags: V2_EPHEMERAL,
        allowedMentions: { parse: [] },
      });
      return true;
    }
  } catch (err) {
    logError({ event: 'CLONNER_BUTTON_ERROR', message: err.message });
  }

  return true;
}

export async function handleClonnerModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== 'clonner_modal') return false;

  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      components: [
        buildClonnerStatus(
          `${ET.config} Sem permissão`,
          'Apenas administradores podem usar o clonador.'
        ),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  const userToken = interaction.fields.getTextInputValue('user_token').trim();
  const originalId = interaction.fields.getTextInputValue('original_id').trim();
  const targetId = interaction.fields.getTextInputValue('target_id').trim();

  if (!/^\d{17,20}$/.test(originalId) || !/^\d{17,20}$/.test(targetId)) {
    await interaction.reply({
      components: [
        buildClonnerStatus(
          `${ET.config} IDs inválidos`,
          'Informe IDs numéricos válidos dos servidores.'
        ),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  if (userToken.length < 50) {
    await interaction.reply({
      components: [
        buildClonnerStatus(
          `${ET.config} Token inválido`,
          'O token informado parece estar incompleto.'
        ),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  // Status da clonagem: ephemeral (editReply herda isso)
  await interaction.reply({
    components: [
      buildClonnerStatus(
        `${ET.rocket} Iniciando clonagem`,
        `Origem: \`${originalId}\`\nAlvo: \`${targetId}\`\n\n${ET.tempo} Validando token e servidores...`
      ),
    ],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  });

  await runClonner(interaction, originalId, targetId, userToken);
  return true;
}
