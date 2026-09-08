import {
  ActionRowBuilder,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { E, ET } from '../emojis.js';

const COLOR = 0xffffff;

export const HOUSES = {
  bravery: {
    id: 1,
    label: 'Bravery',
    description: 'Coragem, presença e atitude para representar a House of Bravery.',
    emoji: E.raio,
    emojiText: ET.raio,
  },
  brilliance: {
    id: 2,
    label: 'Brilliance',
    description: 'Criatividade, inteligência e inovação para representar a House of Brilliance.',
    emoji: E.coin,
    emojiText: ET.coin,
  },
  balance: {
    id: 3,
    label: 'Balance',
    description: 'Equilíbrio, calma e harmonia para representar a House of Balance.',
    emoji: E.check,
    emojiText: ET.check,
  },
};

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

export function houseLabel(house) {
  return HOUSES[house]?.label || house;
}

export function buildHypePanel() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.raio} Painel HypeSquad`),
      new TextDisplayBuilder().setContent(
        'Escolha abaixo a casa HypeSquad que deseja resgatar ou trocar. O processo é privado e a resposta final aparece somente para você.'
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '**Casas disponíveis**',
          `>>> ${HOUSES.bravery.emojiText} **Bravery** — ${HOUSES.bravery.description}`,
          `${HOUSES.brilliance.emojiText} **Brilliance** — ${HOUSES.brilliance.description}`,
          `${HOUSES.balance.emojiText} **Balance** — ${HOUSES.balance.description}`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Como funciona**`,
          `>>> ${ET.lupa} Selecione uma casa no menu abaixo.`,
          `${ET.edit} Informe o token solicitado na janela privada.`,
          `${ET.check} Aguarde a confirmação do resgate.`,
          '',
          `${ET.config} Use apenas na sua própria conta e nunca compartilhe o token.`,
        ].join('\n')
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId('hypesquad_select')
          .setPlaceholder('Selecione a casa HypeSquad desejada')
          .addOptions(
            {
              label: 'House of Bravery',
              description: HOUSES.bravery.description.slice(0, 100),
              value: 'bravery',
              emoji: HOUSES.bravery.emoji,
            },
            {
              label: 'House of Brilliance',
              description: HOUSES.brilliance.description.slice(0, 100),
              value: 'brilliance',
              emoji: HOUSES.brilliance.emoji,
            },
            {
              label: 'House of Balance',
              description: HOUSES.balance.description.slice(0, 100),
              value: 'balance',
              emoji: HOUSES.balance.emoji,
            }
          )
      )
    );
}

export function buildHypeStatus({ type = 'info', title, description, details }) {
  const icons = {
    success: ET.check,
    error: ET.config,
    warning: ET.tempo,
    info: ET.lupa,
  };

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${icons[type] || icons.info} ${title}`),
      new TextDisplayBuilder().setContent(description)
    );

  if (details) {
    container
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(details));
  }

  return container;
}

export function buildHypeTokenModal(house) {
  return new ModalBuilder()
    .setCustomId(`hypesquad_token_modal_${house}`)
    .setTitle(`Resgatar ${houseLabel(house)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hypesquad_token_input')
          .setLabel('Token da sua conta Discord')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Cole o token aqui para concluir o resgate')
          .setRequired(true)
      )
    );
}
