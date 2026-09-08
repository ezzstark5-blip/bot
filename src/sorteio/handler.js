import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { ET } from '../emojis.js';
import {
  buildConfigPanel,
  buildPrizeModal,
  buildWinnersSelect,
  buildDurationSelect,
  buildGiveawayPanel,
  buildPublishedConfirm,
  buildCancelledConfirm,
} from './components.js';
import {
  DURATION_OPTIONS,
  clearDraft,
  createId,
  defaultDraft,
  getDraft,
  getGiveaway,
  setDraft,
  upsertGiveaway,
} from './store.js';
import {
  bindClient,
  endGiveaway,
  refreshGiveawayMessage,
  rerollGiveaway,
  scheduleGiveaway,
} from './engine.js';

function isStaff(interaction) {
  if (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) return true;
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function ensureDraft(interaction) {
  let draft = getDraft(interaction.user.id);
  if (!draft) {
    draft = defaultDraft(interaction.user.id, interaction.channelId, interaction.guildId);
    setDraft(interaction.user.id, draft);
  }
  return draft;
}

export async function replySorteioConfig(interaction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: `${ET.config} Você precisa de **Gerenciar Servidor** para criar sorteios.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const draft = defaultDraft(interaction.user.id, interaction.channelId, interaction.guildId);
  setDraft(interaction.user.id, draft);
  await interaction.reply(buildConfigPanel(draft));
  logEntrada({ event: 'SORTEIO_CONFIG_OPEN', userId: interaction.user.id, guildId: interaction.guildId });
}

export async function handleSorteioEndCommand(interaction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: `${ET.config} Sem permissão.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = interaction.options.getString('id', true).trim();
  const giveaway = getGiveaway(id);
  if (!giveaway) {
    await interaction.reply({ content: `${ET.config} Sorteio \`${id}\` não encontrado.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: `${ET.tempo} Esse sorteio já encerrou.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  bindClient(interaction.client);
  await endGiveaway(id, { forceHostId: interaction.user.id });
  await interaction.editReply({ content: `${ET.check} Sorteio \`${id}\` encerrado.` });
}

export async function handleSorteioRerollCommand(interaction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: `${ET.config} Sem permissão.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = interaction.options.getString('id', true).trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    bindClient(interaction.client);
    await rerollGiveaway(id);
    await interaction.editReply({ content: `${ET.check} Reroll do sorteio \`${id}\` feito.` });
  } catch (err) {
    await interaction.editReply({ content: `${ET.config} ${err.message}` });
  }
}

export async function handleSorteioInteraction(interaction) {
  const id = interaction.customId || '';
  if (
    !id.startsWith('sorteio_') &&
    !(interaction.isModalSubmit() && id.startsWith('sorteio_modal_'))
  ) {
    return false;
  }

  try {
    bindClient(interaction.client);

    // ── Participar / Sair ──
    if (interaction.isButton() && id.startsWith('sorteio_join:')) {
      const gid = id.split(':')[1];
      const giveaway = getGiveaway(gid);
      if (!giveaway || giveaway.ended) {
        await interaction.reply({
          content: `${ET.config} Este sorteio não está mais ativo.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      if (Date.now() >= giveaway.endsAt) {
        await endGiveaway(gid);
        await interaction.reply({
          content: `${ET.tempo} O sorteio acabou de encerrar.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (giveaway.minRoleId) {
        const member = interaction.member;
        const hasRole =
          member?.roles?.cache?.has?.(giveaway.minRoleId) ||
          (await interaction.guild?.members
            .fetch(interaction.user.id)
            .then((m) => m.roles.cache.has(giveaway.minRoleId))
            .catch(() => false));
        if (!hasRole) {
          await interaction.reply({
            content: `${ET.config} Você precisa do cargo <@&${giveaway.minRoleId}> para participar.`,
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }
      }

      const uid = interaction.user.id;
      giveaway.participants = giveaway.participants || [];
      if (giveaway.participants.includes(uid)) {
        await interaction.reply({
          content: `${ET.check} Você já está participando!`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      giveaway.participants.push(uid);
      upsertGiveaway(giveaway);
      await refreshGiveawayMessage(interaction.client, giveaway);
      await interaction.reply({
        content: `${ET.check} Entrada confirmada no sorteio **${giveaway.prize}**!`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id.startsWith('sorteio_leave:')) {
      const gid = id.split(':')[1];
      const giveaway = getGiveaway(gid);
      if (!giveaway || giveaway.ended) {
        await interaction.reply({
          content: `${ET.config} Este sorteio não está ativo.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const before = giveaway.participants?.length || 0;
      giveaway.participants = (giveaway.participants || []).filter((p) => p !== interaction.user.id);
      upsertGiveaway(giveaway);
      if (giveaway.participants.length !== before) {
        await refreshGiveawayMessage(interaction.client, giveaway);
      }
      await interaction.reply({
        content: `${ET.tempo} Você saiu do sorteio.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id.startsWith('sorteio_reroll:')) {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content: `${ET.config} Sem permissão para reroll.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const gid = id.split(':')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await rerollGiveaway(gid);
        await interaction.editReply({ content: `${ET.check} Reroll concluído.` });
      } catch (err) {
        await interaction.editReply({ content: `${ET.config} ${err.message}` });
      }
      return true;
    }

    // ── Config UI ──
    if (!isStaff(interaction) && id.startsWith('sorteio_cfg_')) {
      await interaction.reply({
        content: `${ET.config} Sem permissão.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_prize') {
      await interaction.showModal(buildPrizeModal());
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_winners') {
      await interaction.update(buildWinnersSelect());
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_duration') {
      await interaction.update(buildDurationSelect());
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_back') {
      const draft = ensureDraft(interaction);
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_clear_role') {
      const draft = ensureDraft(interaction);
      draft.minRoleId = null;
      setDraft(interaction.user.id, draft);
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_cancel') {
      clearDraft(interaction.user.id);
      await interaction.update(buildCancelledConfirm()).catch(() => null);
      return true;
    }

    if (interaction.isButton() && id === 'sorteio_cfg_publish') {
      const draft = getDraft(interaction.user.id);
      if (!draft?.prize) {
        await interaction.reply({
          content: `${ET.config} Defina o **prêmio** antes de publicar.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.deferUpdate();
      const giveawayId = createId();
      const endsAt = Date.now() + (draft.durationMs || 3_600_000);
      const channelId = draft.channelId || interaction.channelId;

      const giveaway = {
        id: giveawayId,
        guildId: interaction.guildId,
        channelId,
        messageId: null,
        prize: draft.prize,
        description: draft.description || 'Clique em **Participar** para entrar!',
        winnersCount: draft.winnersCount || 1,
        minRoleId: draft.minRoleId || null,
        endsAt,
        hostId: interaction.user.id,
        participants: [],
        winners: [],
        ended: false,
        createdAt: Date.now(),
      };

      const channel =
        interaction.client.channels.cache.get(channelId) ||
        (await interaction.client.channels.fetch(channelId).catch(() => null));

      if (!channel?.isTextBased?.()) {
        await interaction.followUp({
          content: `${ET.config} Canal inválido para publicar.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const msg = await channel.send(buildGiveawayPanel(giveaway));
      giveaway.messageId = msg.id;
      upsertGiveaway(giveaway);
      scheduleGiveaway(giveaway.id, giveaway.endsAt);
      clearDraft(interaction.user.id);

      await interaction.editReply(buildPublishedConfirm(giveaway, channelId)).catch(() => null);

      logEntrada({
        event: 'SORTEIO_PUBLISHED',
        userId: interaction.user.id,
        giveawayId,
        channelId,
      });
      return true;
    }

    if (interaction.isStringSelectMenu() && id === 'sorteio_cfg_winners_select') {
      const draft = ensureDraft(interaction);
      draft.winnersCount = Math.max(1, Math.min(10, parseInt(interaction.values[0], 10) || 1));
      setDraft(interaction.user.id, draft);
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isStringSelectMenu() && id === 'sorteio_cfg_duration_select') {
      const draft = ensureDraft(interaction);
      const opt = DURATION_OPTIONS.find((d) => d.value === interaction.values[0]);
      if (opt) {
        draft.durationMs = opt.ms;
        draft.durationLabel = opt.label;
        setDraft(interaction.user.id, draft);
      }
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isRoleSelectMenu() && id === 'sorteio_cfg_role') {
      const draft = ensureDraft(interaction);
      draft.minRoleId = interaction.values[0] || null;
      setDraft(interaction.user.id, draft);
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isChannelSelectMenu() && id === 'sorteio_cfg_channel') {
      const draft = ensureDraft(interaction);
      draft.channelId = interaction.values[0] || interaction.channelId;
      setDraft(interaction.user.id, draft);
      await interaction.update(buildConfigPanel(draft));
      return true;
    }

    if (interaction.isModalSubmit() && id === 'sorteio_modal_prize') {
      const draft = ensureDraft(interaction);
      draft.prize = interaction.fields.getTextInputValue('prize').trim().slice(0, 100);
      const desc = interaction.fields.getTextInputValue('description')?.trim();
      if (desc) draft.description = desc.slice(0, 300);
      setDraft(interaction.user.id, draft);
      await interaction.reply(buildConfigPanel(draft));
      return true;
    }
  } catch (err) {
    logError({ event: 'SORTEIO_INTERACTION_FAIL', message: err.message, customId: id });
    const payload = {
      content: `${ET.config} Erro no sorteio: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }

  return true;
}
