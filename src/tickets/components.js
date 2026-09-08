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
  UserSelectMenuBuilder
} from 'discord.js';
import { E, ET } from '../emojis.js';

const COLORS = {
  panel: 0xffffff,
  open: 0xffffff,
  close: 0xffffff,
  info: 0xffffff
};

export function buildCentralPanel() {
  return new ContainerBuilder()
    .setAccentColor(COLORS.panel)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.config} Central de Atendimento`),
      new TextDisplayBuilder().setContent(
        [
          'Precisa de ajuda? Abra um ticket e nossa equipe vai te atender em um canal privado.',
          '',
          `${ET.tempo} O suporte **não** funciona 24 horas — aguarde o retorno dentro do horário de atendimento.`,
          `${ET.check} Só membros autorizados têm acesso ao seu ticket.`
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('ticket_open')
          .setLabel('Abrir Ticket')
          .setEmoji(E.config)
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

export function buildTicketReasonModal() {
  return new ModalBuilder()
    .setCustomId('ticket_reason_modal')
    .setTitle('Novo Ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_motivo')
          .setLabel('Qual o motivo do contato?')
          .setPlaceholder('Ex: dúvida, denúncia, parceria, suporte...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(1000)
      )
    );
}

export function buildTicketOpened(userId, motivo) {
  return new ContainerBuilder()
    .setAccentColor(COLORS.open)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Ticket criado`),
      new TextDisplayBuilder().setContent(
        [
          `Olá, <@${userId}>!`,
          '',
          'Seu atendimento foi iniciado. Em breve um membro da equipe vai responder por aqui.',
          '',
          `${ET.edit} **Motivo informado**`,
          `>>> ${motivo}`
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('ticket_staff_panel')
          .setLabel('Painel do Atendente')
          .setEmoji(E.bot)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_user_panel')
          .setLabel('Painel do Usuário')
          .setEmoji(E.pessoas)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_info')
          .setEmoji(E.lupa)
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

export function buildStaffPanel() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Fechar Ticket')
        .setEmoji(E.check)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_notify')
        .setLabel('Notificar Atendente')
        .setEmoji(E.raio)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_add_user')
        .setLabel('Adicionar Usuário')
        .setEmoji(E.pessoas)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_remove_user')
        .setLabel('Remover Usuário')
        .setEmoji(E.lupa)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_transfer')
        .setLabel('Transferir')
        .setEmoji(E.rocket)
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_call')
        .setLabel('Solicitar Call')
        .setEmoji(E.raio)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_transcript')
        .setLabel('Transcript')
        .setEmoji(E.edit)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildUserPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_request')
      .setLabel('Solicitar Fechamento')
      .setEmoji(E.check)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_call')
      .setLabel('Solicitar Call')
      .setEmoji(E.raio)
      .setStyle(ButtonStyle.Secondary)
  );
}

export function buildInfoPanel() {
  return new ContainerBuilder()
    .setAccentColor(COLORS.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Como funciona`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.pessoas} **Painel do Usuário** — pedir fechamento ou call`,
          `${ET.bot} **Painel do Atendente** — gerenciar o ticket (equipe)`,
          '',
          'Este canal é privado. Só você e a equipe conseguem ver as mensagens.'
        ].join('\n')
      )
    );
}

export function buildTicketClosed(closedById) {
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.close)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${ET.check} Atendimento encerrado`),
        new TextDisplayBuilder().setContent(
          [
            `Finalizado por <@${closedById}>.`,
            '',
            'Obrigado pelo contato. Se precisar de algo, abra um novo ticket a qualquer momento.'
          ].join('\n')
        )
      ),
    new TextDisplayBuilder().setContent(`-# ${ET.bot} Mensagem do sistema · canal será removido em breve`)
  ];
}

export function buildOpenLog({ userId, channelId, ticketId, motivo }) {
  return new ContainerBuilder()
    .setAccentColor(COLORS.open)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Novo ticket`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.pessoas} **Membro** — <@${userId}>`,
          `**ID** — \`${userId}\``,
          `**Canal** — <#${channelId}>`,
          `**Código** — \`${ticketId}\``,
          `${ET.edit} **Motivo** — ${motivo}`,
          `${ET.tempo} **Quando** — <t:${Math.floor(Date.now() / 1000)}:F>`
        ].join('\n')
      )
    );
}

export function buildCloseLog({ userId, closedById, channelName, ticketId }) {
  return new ContainerBuilder()
    .setAccentColor(COLORS.close)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Ticket finalizado`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.pessoas} **Membro** — <@${userId}>`,
          `**Fechado por** — <@${closedById}>`,
          `**Canal** — \`${channelName}\``,
          `**Código** — \`${ticketId}\``,
          `${ET.tempo} **Quando** — <t:${Math.floor(Date.now() / 1000)}:F>`
        ].join('\n')
      )
    );
}

export function buildUserSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}