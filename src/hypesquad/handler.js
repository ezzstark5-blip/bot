import { MessageFlags } from 'discord.js';
import { logEntrada, logError, logInfo } from '../logs/logger.js';
import { buildLogEmbed, sendChannelLog } from '../logs/channels.js';
import { ET } from '../emojis.js';
import {
  HOUSES,
  houseLabel,
  buildHypePanel,
  buildHypeStatus,
  buildHypeTokenModal,
} from './components.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export async function replyHypePanel(interaction) {
  const ownerId = process.env.OWNER_ID;
  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      components: [
        buildHypeStatus({
          type: 'error',
          title: 'Acesso negado',
          description: 'Você não tem permissão para abrir este painel.',
          details: 'Apenas o responsável configurado no sistema pode usar este comando.',
        }),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await sendAsChannelMessage(interaction, {
    components: [buildHypePanel()],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  logEntrada({
    event: 'HYPE_PANEL',
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });
}

export async function handleHypeSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== 'hypesquad_select') return false;

  const selectedHouse = interaction.values[0];
  if (!HOUSES[selectedHouse]) {
    await interaction.reply({
      components: [
        buildHypeStatus({
          type: 'error',
          title: 'Casa inválida',
          description: 'A casa selecionada não foi reconhecida.',
          details: 'Abra o painel novamente e selecione uma opção válida.',
        }),
      ],
      flags: V2_EPHEMERAL,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  await interaction.showModal(buildHypeTokenModal(selectedHouse));
  logEntrada({
    event: 'HYPE_SELECT',
    userId: interaction.user.id,
    house: selectedHouse,
  });
  return true;
}

export async function handleHypeModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith('hypesquad_token_modal_')) return false;

  const selectedHouse = interaction.customId.replace('hypesquad_token_modal_', '');
  const house = HOUSES[selectedHouse];
  const userToken = interaction.fields.getTextInputValue('hypesquad_token_input').trim();

  await interaction.deferReply({ flags: V2_EPHEMERAL });

  if (!house) {
    await interaction.editReply({
      components: [
        buildHypeStatus({
          type: 'error',
          title: 'Casa inválida',
          description: 'A casa selecionada não foi reconhecida pelo sistema.',
          details: 'Abra o painel novamente e selecione uma opção válida.',
        }),
      ],
      flags: V2,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  try {
    const res = await fetch('https://discord.com/api/v9/hypesquad/online', {
      method: 'POST',
      headers: {
        Authorization: userToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ house_id: house.id }),
      signal: AbortSignal.timeout(15000),
    });

    if (![200, 204].includes(res.status)) {
      if (res.status === 401) {
        await interaction.editReply({
          components: [
            buildHypeStatus({
              type: 'error',
              title: 'Token inválido',
              description: 'O token informado foi recusado pelo Discord.',
              details: 'Copie o token novamente e confira se ele pertence à sua própria conta.',
            }),
          ],
          flags: V2,
          allowedMentions: { parse: [] },
        });
        return true;
      }

      if (res.status === 400) {
        await interaction.editReply({
          components: [
            buildHypeStatus({
              type: 'error',
              title: 'Solicitação inválida',
              description: 'O Discord recusou os dados enviados para esta casa HypeSquad.',
              details: 'Tente selecionar a casa novamente pelo painel.',
            }),
          ],
          flags: V2,
          allowedMentions: { parse: [] },
        });
        return true;
      }

      throw new Error(`Status inesperado: ${res.status}`);
    }

    logInfo({
      event: 'HYPE_SUCCESS',
      userId: interaction.user.id,
      house: selectedHouse,
    });
    void sendChannelLog(
      interaction.client,
      'hypesquad',
      buildLogEmbed({
        title: `${ET.check} HypeSquad resgatado`,
        description: [
          `**Usuário:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
          `**Casa:** ${houseLabel(selectedHouse)}`,
        ].join('\n'),
      })
    );

    await interaction.editReply({
      components: [
        buildHypeStatus({
          type: 'success',
          title: 'Insígnia resgatada',
          description: `Sua casa HypeSquad foi alterada para **${houseLabel(selectedHouse)}** com sucesso.`,
          details: `${ET.lupa} Abra seu perfil no Discord para conferir a nova insígnia.`,
        }),
      ],
      flags: V2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    logError({
      event: 'HYPE_FAIL',
      userId: interaction.user.id,
      message: err.message,
    });
    void sendChannelLog(
      interaction.client,
      'hypesquad',
      buildLogEmbed({
        title: `${ET.config} Falha HypeSquad`,
        description: `**Usuário:** ${interaction.user.tag}\n**Erro:** ${err.message}`,
      })
    );

    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    await interaction.editReply({
      components: [
        buildHypeStatus({
          type: 'error',
          title: timedOut ? 'Tempo esgotado' : 'Não foi possível resgatar',
          description: timedOut
            ? 'O Discord demorou demais para responder.'
            : 'Ocorreu um erro ao processar sua solicitação.',
          details: timedOut
            ? 'Tente novamente em alguns instantes.'
            : 'Verifique os dados informados e tente novamente.',
        }),
      ],
      flags: V2,
      allowedMentions: { parse: [] },
    });
  }

  return true;
}
