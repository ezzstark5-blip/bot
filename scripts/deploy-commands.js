import 'dotenv/config';
import { deploySlashCommands } from '../src/events/slashCommands.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('Falta DISCORD_TOKEN ou GUILD_ID no .env');
  process.exit(1);
}

// Descobre o application id pelo próprio token (evita APP_ID antigo)
const me = await fetch('https://discord.com/api/v10/users/@me', {
  headers: { Authorization: `Bot ${token}` },
}).then((r) => r.json());
const clientId = me?.id;
if (!clientId) {
  console.error('Token inválido — não consegui ler /users/@me');
  process.exit(1);
}
if (process.env.APP_ID && process.env.APP_ID !== clientId) {
  console.warn(`⚠️ APP_ID no .env (${process.env.APP_ID}) ≠ bot (${clientId}). Usando o do token.`);
}

process.env.FORCE_SLASH_DEPLOY = 'true';
await deploySlashCommands(token, clientId, guildId);
