import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { E, ET } from '../emojis.js';

const COLOR = 0xffffff;
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function flagsFor({ ephemeral = false } = {}) {
  return ephemeral ? V2_EPHEMERAL : V2;
}

/** Painel público Pedir Drop. */
export function buildDropPanel({ ephemeral = false } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Pedir Drop`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.lupa} Solicite um **vazamento / drop** pelo botão abaixo.`,
          `${ET.edit} Informe qual vazamento você quer no formulário.`,
          `${ET.tempo} A staff recebe o pedido no canal de logs e responde em breve.`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${ET.bot} Sistema de Drop · <t:${Math.floor(Date.now() / 1000)}:f>`
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('drop_pedir')
          .setLabel('Pedir Drop')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(E.rocket)
      )
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };
}

export function buildDropModal() {
  return new ModalBuilder()
    .setCustomId('drop_modal')
    .setTitle('Pedir Drop')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('drop_vazamento')
          .setLabel('Qual vazamento você quer?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex: nome do vazamento, data, detalhes...')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(1000)
      )
    );
}

/** Log V2 enviado ao canal de staff. */
export function buildDropLogPanel({ user, vazamento }) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Novo pedido de Drop`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.pessoas} **Membro**`,
          `${user} (\`${user.id}\`)`,
          '',
          `${ET.edit} **Vazamento solicitado**`,
          vazamento,
          '',
          `${ET.tempo} **Horário**`,
          `<t:${Math.floor(Date.now() / 1000)}:F>`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${ET.bot} Log · Pedir Drop`)
    );

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: [] },
  };
}

export function buildDropSuccessPanel() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${ET.check} Pedido enviado\n${ET.tempo} A staff recebeu seu pedido de drop.`
      )
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}
