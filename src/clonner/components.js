import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { E, ET } from '../emojis.js';

const COLOR = 0xffffff;

export function buildClonnerPanel() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Clonador de Servidor`),
      new TextDisplayBuilder().setContent(
        [
          'Copia cargos, emojis, categorias e canais de um servidor para outro.',
          '',
          `${ET.lupa} Use o **token da sua conta** do Discord para a clonagem.`,
          `${ET.raio} O servidor alvo será limpo (canais e cargos) antes da cópia.`,
          `${ET.bot} O bot **não** precisa estar nos servidores nem ter permissões.`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('clonner_start')
          .setLabel('Iniciar Clonagem')
          .setEmoji(E.rocket)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('clonner_help')
          .setLabel('Como usar')
          .setEmoji(E.lupa)
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

export function buildClonnerModal() {
  return new ModalBuilder()
    .setCustomId('clonner_modal')
    .setTitle('Clonar Servidor')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_token')
          .setLabel('Token da conta do Discord')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Cole o token da sua conta aqui...')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('original_id')
          .setLabel('ID do servidor ORIGINAL (copiar de)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 123456789012345678')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('target_id')
          .setLabel('ID do servidor ALVO (colar em)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 987654321098765432')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

export function buildClonnerInfo() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Como usar o Clonador`),
      new TextDisplayBuilder().setContent(
        [
          `1. Obtenha o **token da sua conta** (necessário para a clonagem).`,
          `2. Sua conta precisa de **Administrador** nos dois servidores.`,
          `3. Use \`/clonner\` e clique em **Iniciar Clonagem**.`,
          `4. Informe o **token da sua conta**, o **ID do servidor original** e o **ID do servidor alvo**.`,
          `5. Aguarde a limpeza e a cópia (cargos → emojis → categorias → canais).`,
          '',
          `${ET.raio} O servidor alvo será **apagado** (canais/cargos) antes da clonagem.`,
          `${ET.bot} A clonagem é feita pelo **token da sua conta** — o bot só responde ao comando.`,
        ].join('\n')
      )
    );
}

export function buildClonnerStatus(title, description, color = COLOR) {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(description)
    );
}
