import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logEntrada, logError, logInfo } from '../logs/logger.js';
import { sendChannelLog } from '../logs/channels.js';
import { ET } from '../emojis.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';
import {
  buildAuthPanel,
  buildAuthLinkPanel,
  getAuthPublicUrl,
  getAuthRoleId,
} from './components.js';
import {
  countAuthMembers,
  listAuthMembers,
  markJoinedGuild,
  upsertAuthMember,
  getAuthMember,
} from './store.js';

/** @type {import('discord.js').Client | null} */
let botClient = null;

/** sid → session data */
const sessions = new Map();

function authSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.AUTH_CLIENT_SECRET ||
    process.env.DISCORD_TOKEN ||
    'auth-dev-secret'
  );
}

function oauthCreds() {
  return {
    clientId: process.env.AUTH_CLIENT_ID || process.env.APP_ID || '',
    clientSecret: (process.env.AUTH_CLIENT_SECRET || '').trim(),
  };
}

export function bindAuthClient(client) {
  botClient = client;
}

export function getAuthClient() {
  return botClient;
}

export function createSession(payload) {
  const sid = randomBytes(24).toString('hex');
  const data = {
    ...payload,
    createdAt: Date.now(),
    granted: false,
  };
  sessions.set(sid, data);
  for (const [k, v] of sessions) {
    if (Date.now() - v.createdAt > 60 * 60 * 1000) sessions.delete(k);
  }
  return sid;
}

export function getSession(sid) {
  return sessions.get(sid) || null;
}

export function markSessionGranted(sid) {
  const s = sessions.get(sid);
  if (!s) return null;
  s.granted = true;
  s.grantedAt = Date.now();
  sessions.set(sid, s);
  return s;
}

export function signState(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = createHmac('sha256', authSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state) {
  if (!state || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  const expected = createHmac('sha256', authSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function refreshMemberToken(member) {
  const { clientId, clientSecret } = oauthCreds();
  if (!member?.refreshToken || !clientId || !clientSecret) return member;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: member.refreshToken,
  });

  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || 'Falha ao renovar token');
  }

  return upsertAuthMember({
    id: member.id,
    accessToken: json.access_token,
    refreshToken: json.refresh_token || member.refreshToken,
    expiresAt: Date.now() + Number(json.expires_in || 604800) * 1000,
    scope: json.scope || member.scope,
  });
}

export async function ensureFreshAccessToken(userId) {
  let member = getAuthMember(userId);
  if (!member?.accessToken) {
    throw new Error('Usuário sem token. Peça para autenticar de novo no painel.');
  }
  if (member.expiresAt && Date.now() > member.expiresAt - 60_000) {
    member = await refreshMemberToken(member);
  }
  return member;
}

/**
 * Adiciona usuário autenticado em outro servidor via OAuth guilds.join.
 * Bot precisa estar no servidor alvo com permissão de criar convite.
 */
export async function addAuthMemberToGuild(userId, guildId) {
  const client = botClient;
  if (!client) throw new Error('Bot offline');

  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN ausente');

  const member = await ensureFreshAccessToken(userId);
  if (!String(member.scope || '').includes('guilds.join')) {
    throw new Error('Auth antiga sem guilds.join — usuário precisa autenticar de novo');
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: member.accessToken }),
    }
  );

  // 201 = added, 204 = already member
  if (res.status === 201 || res.status === 204) {
    markJoinedGuild(userId, guildId);
    return { ok: true, status: res.status, already: res.status === 204 };
  }

  const json = await res.json().catch(() => ({}));
  throw new Error(json.message || `HTTP ${res.status}`);
}

export async function grantAuthRole(userId) {
  const client = botClient;
  const guildId = process.env.GUILD_ID || process.env.AUTH_GUILD_ID;
  const roleId = getAuthRoleId();

  if (!client) throw new Error('Bot offline');
  if (!guildId) throw new Error('GUILD_ID não configurado');
  if (!roleId) throw new Error('AUTH_ROLE_ID não configurado');

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) throw new Error('Servidor não encontrado');

  let member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new Error('Usuário não está no servidor. Entre no Discord e tente de novo.');
  }

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, 'Auth verificada');
  }

  logInfo({ event: 'AUTH_ROLE_GRANTED', userId, roleId, guildId });

  const user = member.user;
  await sendChannelLog(client, 'auth', {
    title: `${ET.check} Auth concluída`,
    description: [
      `${ET.pessoas} **Membro**`,
      `${user} (\`${user.id}\`)`,
      '',
      `${ET.raio} **Cargo**`,
      `<@&${roleId}>`,
      '',
      `${ET.rocket} **guilds.join**`,
      getAuthMember(userId)?.accessToken ? 'token salvo' : 'sem token',
      '',
      `${ET.tempo} **Horário**`,
      `<t:${Math.floor(Date.now() / 1000)}:F>`,
    ].join('\n'),
    footer: `${ET.bot} Log · Auth`,
  }).catch(() => null);

  return {
    userId,
    roleId,
    guildId,
    username: user.username,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
  };
}

export async function handleAuthLevarCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: `${ET.config} Apenas administradores.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.options.getString('servidor', true).trim();
  const quantidade = interaction.options.getInteger('quantidade', true);

  if (!/^\d{17,20}$/.test(guildId)) {
    await interaction.reply({
      content: `${ET.config} ID de servidor inválido.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (quantidade < 1 || quantidade > 50) {
    await interaction.reply({
      content: `${ET.config} Quantidade entre **1** e **50**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const client = interaction.client;
  const targetGuild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));

  if (!targetGuild) {
    await interaction.editReply({
      content: `${ET.config} O bot **não está** nesse servidor (\`${guildId}\`). Entre com o bot primeiro.`,
    });
    return;
  }

  const me = targetGuild.members.me || (await targetGuild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
    await interaction.editReply({
      content: `${ET.config} O bot precisa de **Criar Convite** no servidor alvo.`,
    });
    return;
  }

  const pool = listAuthMembers().filter((m) => {
    if (!m.accessToken) return false;
    if (!String(m.scope || '').includes('guilds.join')) return false;
    const joined = m.joinedGuilds || [];
    return !joined.includes(guildId);
  });

  if (!pool.length) {
    await interaction.editReply({
      content:
        `${ET.lupa} Nenhum autenticado disponível.\n` +
        `Total no banco: **${countAuthMembers()}**\n` +
        `Peça para autenticarem de novo (com permissão de entrar em servidores).`,
    });
    return;
  }

  const selected = pool.slice(0, quantidade);
  let ok = 0;
  let fail = 0;
  const errors = [];

  for (const m of selected) {
    try {
      await addAuthMemberToGuild(m.id, guildId);
      ok += 1;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      fail += 1;
      if (errors.length < 5) errors.push(`\`${m.username || m.id}\`: ${err.message}`);
      logError({
        event: 'AUTH_LEVAR_FAIL',
        userId: m.id,
        guildId,
        message: err.message,
      });
    }
  }

  logInfo({
    event: 'AUTH_LEVAR_DONE',
    guildId,
    ok,
    fail,
    requested: quantidade,
    by: interaction.user.id,
  });

  await sendChannelLog(client, 'auth', {
    title: `${ET.rocket} Auth levar`,
    description: [
      `${ET.lupa} **Servidor**`,
      `${targetGuild.name} (\`${guildId}\`)`,
      '',
      `${ET.check} **Sucesso:** **${ok}**`,
      `${ET.config} **Falhas:** **${fail}**`,
      `${ET.pessoas} **Pedidos:** **${quantidade}**`,
      `${ET.edit} **Por:** <@${interaction.user.id}>`,
    ].join('\n'),
    footer: `${ET.bot} Log · Auth levar`,
  }).catch(() => null);

  await interaction.editReply({
    content: [
      `${ET.check} Levei **${ok}** membro(s) para **${targetGuild.name}**.`,
      fail ? `${ET.config} Falhas: **${fail}**` : null,
      errors.length ? errors.join('\n') : null,
      `-# Autenticados restantes aptos: **${Math.max(0, pool.length - ok)}**`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

export async function replyAuthPanel(interaction) {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content: `${ET.config} Você precisa de **Gerenciar Servidor** para postar o painel.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await sendAsChannelMessage(interaction, buildAuthPanel({ ephemeral: false }));
  logEntrada({
    event: 'AUTH_PANEL_POSTED',
    userId: interaction.user.id,
    channelId: interaction.channelId,
    url: getAuthPublicUrl(),
  });
}

export async function handleAuthInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('auth_')) return false;

  try {
    if (interaction.isButton() && id === 'auth_open') {
      await interaction.reply(buildAuthLinkPanel());
      return true;
    }
  } catch (err) {
    logError({ event: 'AUTH_INTERACTION_FAIL', message: err.message });
    const payload = {
      content: `${ET.config} Erro no auth: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
  return true;
}
