import { config } from 'dotenv';
config();

import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  MessageFlags,
  Events,
} from 'discord.js';
import { logInfo, logError } from './logs/logger.js';
import { setupGuildMembers } from './events/guildMemberEvents.js';
import { setupInviteGuard } from './events/inviteGuard.js';
import { setupBoostLogs } from './events/boostEvents.js';
import { setupAiCommand } from './events/aiCommand.js';
import { setupTickets, postTicketPanel } from './tickets/handler.js';
import { registerInteractions } from './handler/componentHandler.js';
import { registerSlashCommands } from './events/slashCommands.js';
import { registerSelfFlow } from './flow/register.js';
import { resumeGiveawayTimers, bindClient as bindSorteioClient } from './sorteio/engine.js';
import { bindBoosterClient, resumeBoosterPolls } from './booster/handler.js';
import { startStormWebhookServer } from './booster/webhook.js';
import { setupAntiself } from './antiself/handler.js';
import { resumeDigit4Scanner, bindDigit4Client } from './digit4/scanner.js';
import { bindAuthClient } from './auth/handler.js';
import { startAuthServer } from './auth/server.js';
import { startPresenceLoop, joinFixedVoiceChannel } from './voice/connect.js';
import { ET } from './emojis.js';

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const APP_ID = process.env.APP_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN não definido no .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Channel],
});

registerSelfFlow(client, {
  ownerIds: OWNER_ID ? [OWNER_ID] : [],
});
registerSlashCommands(client);
registerInteractions(client);
setupGuildMembers(client);
setupInviteGuard(client);
setupAntiself(client);
setupBoostLogs(client);
setupAiCommand(client);
setupTickets(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 Bot ${readyClient.user.tag} online!`);
  console.log(`📌 ${PREFIX}ticket → Painel Central de Atendimento`);
  console.log(`📌 ${PREFIX}ia pergunta → IA (Groq)`);
  logInfo({
    event: 'READY',
    botTag: readyClient.user.tag,
    botId: readyClient.user.id,
  });

  // Slash: não registra no ready (PUT no Discord sobrescreve/remove a lista).
  // Use: npm run deploy
  if (APP_ID && APP_ID !== readyClient.user.id) {
    console.warn(
      `⚠️ APP_ID no .env (${APP_ID}) ≠ bot logado (${readyClient.user.id}).`
    );
  }

  bindSorteioClient(readyClient);
  await resumeGiveawayTimers(readyClient);
  bindBoosterClient(readyClient);
  await resumeBoosterPolls(readyClient);
  startStormWebhookServer();
  bindDigit4Client(readyClient);
  resumeDigit4Scanner(readyClient);
  console.log(`📌 Scanner 4 dígitos → canal ${process.env.DIGIT4_CHANNEL || '1546725534279401574'}`);
  bindAuthClient(readyClient);
  startAuthServer();
  startPresenceLoop(readyClient);
  console.log('📌 Status: Transmitindo Next Community (roxo)');
  await joinFixedVoiceChannel(
    readyClient,
    process.env.CONNECT_VOICE_CHANNEL || '1546354889418866739'
  ).catch((err) => {
    logError({ event: 'VOICE_AUTO_JOIN_READY_FAIL', message: err.message });
  });
});

client.on(Events.Error, (error) => {
  logError({ event: 'CLIENT_ERROR', message: error.message });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().split(/\s+/)[0]?.toLowerCase();
  if (command !== 'ticket') return;

  if (
    !message.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !message.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    await message.reply({
      content: `${ET.config} Sem permissão para enviar o painel.`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  try {
    await postTicketPanel(message.channel);
    await message.delete().catch(() => null);
  } catch (err) {
    logError({ event: 'TICKET_PANEL_FAIL', message: err.message });
    await message.reply({
      content: `${ET.config} Erro ao enviar o painel.`,
      allowedMentions: { parse: [] },
    });
  }
});

client.login(TOKEN);
