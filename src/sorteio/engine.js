import { MessageFlags } from 'discord.js';
import { logError, logInfo } from '../logs/logger.js';
import { buildEndedAnnounce, buildGiveawayPanel } from './components.js';
import { getGiveaway, listActiveGiveaways, upsertGiveaway } from './store.js';

/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

/** @type {import('discord.js').Client | null} */
let botClient = null;

function pickWinners(participants, count) {
  const pool = [...new Set(participants.map(String))];
  const winners = [];
  while (winners.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

export function clearGiveawayTimer(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

export function scheduleGiveaway(id, endsAt) {
  clearGiveawayTimer(id);
  const delay = Math.max(0, endsAt - Date.now());
  const timer = setTimeout(() => {
    endGiveaway(id).catch((err) => logError({ event: 'SORTEIO_END_FAIL', id, message: err.message }));
  }, Math.min(delay, 2_147_000_000));
  timers.set(id, timer);
}

export async function resumeGiveawayTimers(client) {
  botClient = client;
  const active = listActiveGiveaways();
  for (const g of active) {
    if (g.endsAt <= Date.now()) {
      await endGiveaway(g.id).catch((err) =>
        logError({ event: 'SORTEIO_RESUME_END_FAIL', id: g.id, message: err.message })
      );
    } else {
      scheduleGiveaway(g.id, g.endsAt);
    }
  }
  logInfo({ event: 'SORTEIO_TIMERS_RESUMED', count: active.length });
}

export async function refreshGiveawayMessage(client, giveaway) {
  try {
    const channel =
      client.channels.cache.get(giveaway.channelId) ||
      (await client.channels.fetch(giveaway.channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return;

    const winnersMentions = (giveaway.winners || []).map((id) => `<@${id}>`);
    await message.edit(
      buildGiveawayPanel(giveaway, {
        ended: !!giveaway.ended,
        winnersMentions,
      })
    );
  } catch (err) {
    logError({ event: 'SORTEIO_REFRESH_FAIL', id: giveaway.id, message: err.message });
  }
}

export async function endGiveaway(id, { forceHostId = null } = {}) {
  const client = botClient;
  if (!client) throw new Error('Client não pronto.');

  const giveaway = getGiveaway(id);
  if (!giveaway) return null;
  if (giveaway.ended) return giveaway;

  clearGiveawayTimer(id);

  let eligible = [...(giveaway.participants || [])];

  if (giveaway.minRoleId && giveaway.guildId) {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (guild) {
      const filtered = [];
      for (const userId of eligible) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member?.roles.cache.has(giveaway.minRoleId)) filtered.push(userId);
      }
      eligible = filtered;
    }
  }

  const winners = pickWinners(eligible, giveaway.winnersCount || 1);
  giveaway.ended = true;
  giveaway.endedAt = Date.now();
  giveaway.winners = winners;
  if (forceHostId) giveaway.endedBy = forceHostId;
  upsertGiveaway(giveaway);

  await refreshGiveawayMessage(client, giveaway);

  try {
    const channel =
      client.channels.cache.get(giveaway.channelId) ||
      (await client.channels.fetch(giveaway.channelId).catch(() => null));
    if (channel?.isTextBased?.()) {
      const winnersMentions = winners.map((uid) => `<@${uid}>`);
      await channel.send(buildEndedAnnounce(giveaway, winnersMentions));
    }
  } catch (err) {
    logError({ event: 'SORTEIO_ANNOUNCE_FAIL', id, message: err.message });
  }

  logInfo({ event: 'SORTEIO_ENDED', id, winners });
  return giveaway;
}

export async function rerollGiveaway(id) {
  const client = botClient;
  if (!client) throw new Error('Client não pronto.');

  const giveaway = getGiveaway(id);
  if (!giveaway) throw new Error('Sorteio não encontrado.');
  if (!giveaway.ended) throw new Error('O sorteio ainda está ativo.');

  let eligible = [...(giveaway.participants || [])];
  if (giveaway.minRoleId && giveaway.guildId) {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (guild) {
      const filtered = [];
      for (const userId of eligible) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member?.roles.cache.has(giveaway.minRoleId)) filtered.push(userId);
      }
      eligible = filtered;
    }
  }

  const winners = pickWinners(eligible, giveaway.winnersCount || 1);
  giveaway.winners = winners;
  giveaway.rerolledAt = Date.now();
  upsertGiveaway(giveaway);
  await refreshGiveawayMessage(client, giveaway);

  const channel =
    client.channels.cache.get(giveaway.channelId) ||
    (await client.channels.fetch(giveaway.channelId).catch(() => null));
  if (channel?.isTextBased?.()) {
    const winnersMentions = winners.map((uid) => `<@${uid}>`);
    const announce = buildEndedAnnounce(giveaway, winnersMentions, { reroll: true });
    await channel.send(announce);
  }

  return giveaway;
}

export function bindClient(client) {
  botClient = client;
}
