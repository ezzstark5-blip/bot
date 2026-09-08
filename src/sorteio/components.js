import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { E, ET } from '../emojis.js';
import { DURATION_OPTIONS } from './store.js';

const COLOR = 0xffffff;
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function btn(id, label, style = ButtonStyle.Secondary, emoji = null) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

export function buildConfigPanel(draft) {
  const roleText = draft.minRoleId ? `<@&${draft.minRoleId}>` : '`Nenhum (todos)`';
  const prizeText = draft.prize ? `**${draft.prize}**` : '`Não definido`';
  const channelText = draft.channelId ? `<#${draft.channelId}>` : '`Canal atual`';

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.raio} Configurar Sorteio`),
      new TextDisplayBuilder().setContent(
        'Ajuste prêmio, duração, vencedores, cargo mínimo e canal. Depois clique em **Publicar**.'
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**${ET.lupa} Resumo**`,
          `>>> ${ET.coin} Prêmio: ${prizeText}`,
          `${ET.pessoas} Vencedores: \`${draft.winnersCount}\``,
          `${ET.tempo} Duração: \`${draft.durationLabel}\``,
          `${ET.config} Cargo mínimo: ${roleText}`,
          `${ET.rocket} Canal: ${channelText}`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('sorteio_cfg_prize', 'Prêmio', ButtonStyle.Primary, E.coin),
        btn('sorteio_cfg_winners', 'Vencedores', ButtonStyle.Secondary, E.pessoas),
        btn('sorteio_cfg_duration', 'Duração', ButtonStyle.Secondary, E.tempo)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('sorteio_cfg_role')
          .setPlaceholder('Cargo mínimo para participar (opcional)')
          .setMinValues(1)
          .setMaxValues(1)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('sorteio_cfg_channel')
          .setPlaceholder('Canal onde o sorteio será publicado')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('sorteio_cfg_clear_role', 'Remover cargo', ButtonStyle.Secondary, E.config),
        btn('sorteio_cfg_publish', 'Publicar', ButtonStyle.Success, E.check),
        btn('sorteio_cfg_cancel', 'Cancelar', ButtonStyle.Danger, E.edit)
      )
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}

export function buildPrizeModal() {
  return new ModalBuilder()
    .setCustomId('sorteio_modal_prize')
    .setTitle('Prêmio do sorteio')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('prize')
          .setLabel('O que será sorteado?')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 50 NO PIX')
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Texto de apoio (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Clique em Participar para entrar!')
          .setRequired(false)
          .setMaxLength(300)
      )
    );
}

export function buildWinnersSelect() {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${ET.pessoas} Quantos vencedores?`)
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new StringSelectMenuBuilder()
              .setCustomId('sorteio_cfg_winners_select')
              .setPlaceholder('Selecione a quantidade')
              .addOptions(
                ...Array.from({ length: 10 }, (_, i) => ({
                  label: `${i + 1} vencedor${i ? 'es' : ''}`,
                  value: String(i + 1),
                  emoji: E.pessoas,
                }))
              )
          )
        )
        .addActionRowComponents((row) =>
          row.setComponents(btn('sorteio_cfg_back', 'Voltar', ButtonStyle.Secondary, E.tempo))
        ),
    ],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}

export function buildDurationSelect() {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${ET.tempo} Duração do sorteio`)
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new StringSelectMenuBuilder()
              .setCustomId('sorteio_cfg_duration_select')
              .setPlaceholder('Quando o sorteio termina?')
              .addOptions(
                DURATION_OPTIONS.map((opt) => ({
                  label: opt.label,
                  value: opt.value,
                  emoji: E.tempo,
                }))
              )
          )
        )
        .addActionRowComponents((row) =>
          row.setComponents(btn('sorteio_cfg_back', 'Voltar', ButtonStyle.Secondary, E.tempo))
        ),
    ],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}

/**
 * Painel público do sorteio (Components V2).
 */
export function buildGiveawayPanel(giveaway, { ended = false, winnersMentions = [] } = {}) {
  const count = giveaway.participants?.length || 0;
  const endsUnix = Math.floor(giveaway.endsAt / 1000);
  const roleLine = giveaway.minRoleId
    ? `${ET.config} Cargo mínimo: <@&${giveaway.minRoleId}>`
    : `${ET.config} Cargo mínimo: \`Nenhum\``;

  const container = new ContainerBuilder().setAccentColor(COLOR);

  if (ended) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Sorteio encerrado`),
      new TextDisplayBuilder().setContent(`**${giveaway.prize}**`)
    );
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `>>> ${ET.pessoas} Participantes: \`${count}\``,
          `${ET.coin} Vencedores: \`${giveaway.winnersCount}\``,
          winnersMentions.length
            ? `${ET.raio} Ganhador(es): ${winnersMentions.join(', ')}`
            : `${ET.config} Nenhum participante elegível.`,
        ].join('\n')
      )
    );
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Host: <@${giveaway.hostId}> · ID \`${giveaway.id}\``)
    );
    if (giveaway.hostId) {
      container.addActionRowComponents((row) =>
        row.setComponents(
          btn(`sorteio_reroll:${giveaway.id}`, 'Reroll', ButtonStyle.Secondary, E.raio)
        )
      );
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.raio} ${giveaway.prize}`),
      new TextDisplayBuilder().setContent(
        giveaway.description || 'Clique em **Participar** para entrar!'
      )
    );
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `>>> ${ET.pessoas} Participantes: \`${count}\``,
          `${ET.coin} Vencedores: \`${giveaway.winnersCount}\``,
          `${ET.tempo} Termina: <t:${endsUnix}:R> (<t:${endsUnix}:f>)`,
          roleLine,
        ].join('\n')
      )
    );
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Boa sorte a todos! · Host <@${giveaway.hostId}> · ID \`${giveaway.id}\``
      )
    );
    container.addActionRowComponents((row) =>
      row.setComponents(
        btn(`sorteio_join:${giveaway.id}`, `Participar (${count})`, ButtonStyle.Success, E.check),
        btn(`sorteio_leave:${giveaway.id}`, 'Sair', ButtonStyle.Secondary, E.config)
      )
    );
  }

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: [] },
  };
}

export function buildEndedAnnounce(giveaway, winnersMentions, { reroll = false } = {}) {
  const title = reroll
    ? `## ${ET.raio} Reroll — novos vencedores`
    : `## ${ET.raio} Resultado do sorteio`;

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(
        winnersMentions.length
          ? `Parabéns ${winnersMentions.join(', ')}!\nVocês ganharam: **${giveaway.prize}**`
          : `O sorteio **${giveaway.prize}** encerrou sem participantes elegíveis.`
      )
    );

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: ['users'] },
  };
}

export function buildPublishedConfirm(giveaway, channelId) {
  const endsUnix = Math.floor(giveaway.endsAt / 1000);
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Sorteio publicado`),
      new TextDisplayBuilder().setContent(
        [
          `**${giveaway.prize}** em <#${channelId}>`,
          `${ET.tempo} Termina <t:${endsUnix}:R>`,
          `${ET.lupa} ID: \`${giveaway.id}\``,
        ].join('\n')
      )
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}

export function buildCancelledConfirm() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${ET.tempo} Cancelado\nUse \`/sorteio criar\` para começar de novo.`
      )
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}
