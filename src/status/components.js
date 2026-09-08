import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { E, ET } from '../emojis.js';
import { listServices, loadStatus } from './store.js';

const COLOR = 0xffffff;

const STATUS_META = {
  online: { label: 'Online', emoji: ET.check },
  maintenance: { label: 'Manutenção', emoji: ET.tempo },
  offline: { label: 'Offline', emoji: ET.config },
};

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function gatewayLabel(client) {
  if (!client?.isReady?.()) return { key: 'offline', ...STATUS_META.offline };
  const ping = client.ws?.ping;
  if (typeof ping === 'number' && ping >= 0) {
    return { key: 'online', ...STATUS_META.online, ping };
  }
  return { key: 'online', ...STATUS_META.online };
}

export function buildStatusPanel(client) {
  const data = loadStatus();
  const services = listServices();
  const gateway = gatewayLabel(client);

  const online = services.filter((s) => s.status === 'online').length;
  const maintenance = services.filter((s) => s.status === 'maintenance').length;
  const offline = services.filter((s) => s.status === 'offline').length;

  const updated = data.updatedAt
    ? `<t:${Math.floor(new Date(data.updatedAt).getTime() / 1000)}:R>`
    : '—';

  const lines = services.map((s) => {
    const meta = STATUS_META[s.status] || STATUS_META.offline;
    return `${meta.emoji} **${s.name}** — \`${meta.label}\`\n-# ${s.description}`;
  });

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.bot} Status dos Bots`),
      new TextDisplayBuilder().setContent(
        'Acompanhe se cada módulo está **online**, em **manutenção** ou **offline**.'
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**${ET.raio} Gateway**`,
          `>>> ${gateway.emoji} Bot principal: \`${gateway.label}\`${
            gateway.ping != null ? ` · \`${gateway.ping}ms\`` : ''
          }`,
          `${ET.lupa} Atualizado: ${updated}`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**${ET.pessoas} Resumo**`,
          `>>> ${ET.check} Online: \`${online}\``,
          `${ET.tempo} Manutenção: \`${maintenance}\``,
          `${ET.config} Offline: \`${offline}\``,
        ].join('\n')
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${ET.rocket} Serviços**\n\n${lines.join('\n\n')}`)
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('status_refresh')
          .setLabel('Atualizar')
          .setEmoji(E.tempo)
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildStatusUpdatedNotice(service) {
  const meta = STATUS_META[service.status] || STATUS_META.offline;
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Status atualizado`),
      new TextDisplayBuilder().setContent(
        `${meta.emoji} **${service.name}** agora está \`${meta.label}\`.`
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}
