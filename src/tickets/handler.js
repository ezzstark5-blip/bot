import {
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import {
  buildCentralPanel,
  buildTicketOpened,
  buildTicketReasonModal,
  buildStaffPanel,
  buildUserPanel,
  buildInfoPanel,
  buildTicketClosed,
  buildOpenLog,
  buildCloseLog,
  buildUserSelect
} from './components.js';
import { saveTicket, getTicket, deleteTicket, findOpenTicketByUser } from './store.js';
import { logEntrada, logSaida, logError } from '../logs/logger.js';

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function isStaff(member) {
  const staffRole = process.env.TICKET_STAFF_ROLE;
  if (staffRole && member.roles.cache.has(staffRole)) return true;
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

async function sendLog(client, channelId, components) {
  if (!channelId) return;
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  await channel.send({
    components: Array.isArray(components) ? components : [components],
    flags: V2,
    allowedMentions: { parse: [] }
  });
}

export async function postTicketPanel(channel) {
  await channel.send({
    components: [buildCentralPanel()],
    flags: V2,
    allowedMentions: { parse: [] }
  });
}

export function setupTickets(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleButton(client, interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        await handleModal(client, interaction);
        return;
      }
      if (interaction.isUserSelectMenu()) {
        await handleUserSelect(client, interaction);
      }
    } catch (err) {
      logError({ event: 'TICKET_ERROR', message: err.message, stack: err.stack });
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Erro ao processar o ticket.', flags: V2_EPHEMERAL }).catch(() => null);
      }
    }
  });
}

async function handleButton(client, interaction) {
  const { customId } = interaction;

  if (customId === 'ticket_open') {
    const existing = await findOpenTicketByUser(interaction.guild, interaction.user.id);
    if (existing) {
      await interaction.reply({
        content: `Você já tem um ticket aberto: <#${existing[0]}>`,
        flags: V2_EPHEMERAL
      });
      return;
    }
    await interaction.showModal(buildTicketReasonModal());
    return;
  }

  if (customId === 'ticket_staff_panel') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Apenas atendentes podem abrir este painel.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.reply({ components: buildStaffPanel(), flags: V2_EPHEMERAL });
    return;
  }

  if (customId === 'ticket_user_panel') {
    const ticket = getTicket(interaction.channelId);
    if (!ticket || ticket.ownerId !== interaction.user.id) {
      if (!isStaff(interaction.member)) {
        await interaction.reply({ content: 'Este painel é só para o dono do ticket.', flags: V2_EPHEMERAL });
        return;
      }
    }
    await interaction.reply({ components: [buildUserPanel()], flags: V2_EPHEMERAL });
    return;
  }

  if (customId === 'ticket_info') {
    await interaction.reply({
      components: [buildInfoPanel()],
      flags: V2_EPHEMERAL
    });
    return;
  }

  if (customId === 'ticket_close' || customId === 'ticket_close_request') {
    if (customId === 'ticket_close' && !isStaff(interaction.member)) {
      await interaction.reply({ content: 'Apenas atendentes podem fechar o ticket.', flags: V2_EPHEMERAL });
      return;
    }
    if (customId === 'ticket_close_request') {
      const ticket = getTicket(interaction.channelId);
      if (!ticket || ticket.ownerId !== interaction.user.id) {
        await interaction.reply({ content: 'Só o dono do ticket pode solicitar fechamento.', flags: V2_EPHEMERAL });
        return;
      }
      await interaction.reply({
        content: `${interaction.user} solicitou o fechamento do ticket.`
      });
      return;
    }
    await closeTicket(client, interaction);
    return;
  }

  if (customId === 'ticket_notify') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
      return;
    }
    const role = process.env.TICKET_STAFF_ROLE;
    await interaction.reply({
      content: role
        ? `${interaction.user} notificou a equipe: <@&${role}>`
        : `${interaction.user} notificou a equipe de atendimento.`
    });
    return;
  }

  if (customId === 'ticket_add_user') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.reply({
      content: 'Selecione o usuário para adicionar:',
      components: [buildUserSelect('ticket_select_add', 'Adicionar usuário ao ticket')],
      flags: V2_EPHEMERAL
    });
    return;
  }

  if (customId === 'ticket_remove_user') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.reply({
      content: 'Selecione o usuário para remover:',
      components: [buildUserSelect('ticket_select_remove', 'Remover usuário do ticket')],
      flags: V2_EPHEMERAL
    });
    return;
  }

  if (customId === 'ticket_transfer') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.reply({
      content: 'Selecione o novo dono do ticket:',
      components: [buildUserSelect('ticket_select_transfer', 'Transferir ticket')],
      flags: V2_EPHEMERAL
    });
    return;
  }

  if (customId === 'ticket_call') {
    await interaction.reply({
      content: `📢 ${interaction.user} solicitou uma **call** neste ticket.`
    });
    return;
  }

  if (customId === 'ticket_transcript') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.deferReply({ flags: V2_EPHEMERAL });
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const lines = [...messages.values()]
      .reverse()
      .map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[anexo/componente]'}`)
      .join('\n');

    const file = new AttachmentBuilder(Buffer.from(lines || 'Sem mensagens.', 'utf8'), {
      name: `transcript-${interaction.channel.name}.txt`
    });

    await interaction.editReply({
      content: 'Transcript gerado:',
      files: [file]
    });
  }
}

async function handleModal(client, interaction) {
  if (interaction.customId !== 'ticket_reason_modal') return;

  const motivo = interaction.fields.getTextInputValue('ticket_motivo').trim();
  if (!motivo) {
    await interaction.reply({ content: 'Informe o motivo do ticket.', flags: V2_EPHEMERAL });
    return;
  }

  await openTicket(client, interaction, motivo);
}

async function handleUserSelect(client, interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: 'Este canal não é um ticket.', flags: V2_EPHEMERAL });
    return;
  }

  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Sem permissão.', flags: V2_EPHEMERAL });
    return;
  }

  const targetId = interaction.values[0];
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.reply({ content: 'Usuário não encontrado.', flags: V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === 'ticket_select_add') {
    await interaction.channel.permissionOverwrites.edit(targetId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
    await interaction.reply({ content: `${target} foi adicionado ao ticket.` });
    return;
  }

  if (interaction.customId === 'ticket_select_remove') {
    if (targetId === ticket.ownerId) {
      await interaction.reply({ content: 'Não é possível remover o dono do ticket.', flags: V2_EPHEMERAL });
      return;
    }
    await interaction.channel.permissionOverwrites.delete(targetId).catch(() => null);
    await interaction.reply({ content: `${target} foi removido do ticket.` });
    return;
  }

  if (interaction.customId === 'ticket_select_transfer') {
    const oldOwner = ticket.ownerId;
    saveTicket(interaction.channelId, { ownerId: targetId });

    await interaction.channel.permissionOverwrites.edit(targetId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });

    if (oldOwner !== targetId) {
      await interaction.channel.permissionOverwrites.delete(oldOwner).catch(() => null);
    }

    await interaction.channel.setTopic(`Ticket de ${target.user.username} | ID: ${targetId}`).catch(() => null);
    await interaction.reply({ content: `Ticket transferido para ${target}.` });
  }
}

async function openTicket(client, interaction, motivo) {
  const existing = await findOpenTicketByUser(interaction.guild, interaction.user.id);
  if (existing) {
    await interaction.reply({
      content: `Você já tem um ticket aberto: <#${existing[0]}>`,
      flags: V2_EPHEMERAL
    });
    return;
  }

  await interaction.deferReply({ flags: V2_EPHEMERAL });

  const guild = interaction.guild;
  const staffRole = process.env.TICKET_STAFF_ROLE;
  const categoryId = process.env.TICKET_CATEGORY;
  const ticketId = `T-${Date.now().toString(36).toUpperCase()}`;
  const safeName = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20) || 'user';

  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  if (staffRole) {
    overwrites.push({
      id: staffRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    topic: `Ticket de ${interaction.user.username} | Motivo: ${motivo.slice(0, 80)} | ${ticketId}`,
    permissionOverwrites: overwrites
  });

  saveTicket(channel.id, {
    ownerId: interaction.user.id,
    ticketId,
    motivo,
    status: 'open',
    openedAt: Date.now(),
    openedBy: interaction.user.id
  });

  await channel.send({
    content: staffRole
      ? `<@${interaction.user.id}> | <@&${staffRole}>`
      : `<@${interaction.user.id}>`,
    allowedMentions: { users: [interaction.user.id], roles: staffRole ? [staffRole] : [] }
  });

  await channel.send({
    components: [buildTicketOpened(interaction.user.id, motivo)],
    flags: V2,
    allowedMentions: { parse: [] }
  });

  await sendLog(
    client,
    process.env.CHANNEL_TICKET_OPEN,
    buildOpenLog({
      userId: interaction.user.id,
      channelId: channel.id,
      ticketId,
      motivo
    })
  );

  logEntrada({
    event: 'TICKET_OPEN',
    userId: interaction.user.id,
    channelId: channel.id,
    ticketId,
    motivo
  });

  await interaction.editReply({ content: `Ticket criado: ${channel}` });
}

async function closeTicket(client, interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: 'Este canal não é um ticket registrado.', flags: V2_EPHEMERAL });
    return;
  }

  await interaction.deferReply();

  const channel = interaction.channel;
  const channelName = channel.name;
  const ownerId = ticket.ownerId;
  const ticketId = ticket.ticketId;

  await channel.send({
    components: buildTicketClosed(interaction.user.id),
    flags: V2,
    allowedMentions: { parse: [] }
  });

  await sendLog(
    client,
    process.env.CHANNEL_TICKET_CLOSE,
    buildCloseLog({
      userId: ownerId,
      closedById: interaction.user.id,
      channelName,
      ticketId
    })
  );

  logSaida({
    event: 'TICKET_CLOSE',
    userId: ownerId,
    closedById: interaction.user.id,
    channelId: channel.id,
    ticketId
  });

  deleteTicket(channel.id);

  await interaction.editReply({ content: 'Ticket fechado. Canal será excluído em 5 segundos...' });

  setTimeout(async () => {
    await channel.delete('Ticket finalizado').catch((err) => {
      logError({ event: 'TICKET_DELETE_FAIL', message: err.message, channelId: channel.id });
      deleteTicket(channel.id);
    });
  }, 5000);
}