import { logEntrada, logError } from '../logs/logger.js';
import { buildStatusPanel, buildStatusUpdatedNotice } from './components.js';
import { setServiceStatus, listServices, STATUSES } from './store.js';
import { ET } from '../emojis.js';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';

function isAdmin(interaction) {
  if (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) return true;
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

export async function replyStatusPanel(interaction) {
  await sendAsChannelMessage(interaction, buildStatusPanel(interaction.client));
  logEntrada({ event: 'STATUS_PANEL', userId: interaction.user.id, guildId: interaction.guildId });
}

export async function handleStatusSet(interaction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content: `${ET.config} Apenas administradores podem alterar o status.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const serviceId = interaction.options.getString('servico', true);
  const status = interaction.options.getString('status', true);

  try {
    const service = setServiceStatus(serviceId, status);
    await interaction.reply(buildStatusUpdatedNotice(service));
    logEntrada({
      event: 'STATUS_SET',
      userId: interaction.user.id,
      serviceId,
      status,
    });
  } catch (err) {
    logError({ event: 'STATUS_SET_FAIL', message: err.message });
    await interaction.reply({
      content: `${ET.config} ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleStatusButton(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== 'status_refresh') return false;

  try {
    await interaction.update(buildStatusPanel(interaction.client));
    logEntrada({ event: 'STATUS_REFRESH', userId: interaction.user.id });
  } catch (err) {
    logError({ event: 'STATUS_REFRESH_FAIL', message: err.message });
    await interaction
      .reply({ content: `${ET.config} Não foi possível atualizar.`, flags: MessageFlags.Ephemeral })
      .catch(() => null);
  }
  return true;
}

export function statusServiceChoices() {
  return listServices().map((s) => ({ name: s.name, value: s.id }));
}

export function statusChoices() {
  return [
    { name: 'Online', value: 'online' },
    { name: 'Manutenção', value: 'maintenance' },
    { name: 'Offline', value: 'offline' },
  ];
}

export { STATUSES };
