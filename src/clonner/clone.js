import { ChannelType } from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { buildLogEmbed, sendChannelLog } from '../logs/channels.js';
import { ET } from '../emojis.js';
import { buildClonnerStatus } from './components.js';

const V2 = 1 << 15;
const API = 'https://discord.com/api/v10';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(token, method, path, body = null) {
  const opts = {
    method,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function setStatus(interaction, title, description, color) {
  await interaction.editReply({
    components: [buildClonnerStatus(title, description, color)],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

export async function runClonner(interaction, originalId, targetId, userToken) {
  try {
    const meUser = await api(userToken, 'GET', '/users/@me');
    logEntrada({ event: 'CLONNER_TOKEN_VALID', username: meUser.username, userId: meUser.id });
  } catch (err) {
    await setStatus(
      interaction,
      `${ET.config} Token inválido`,
      'Não foi possível validar o token da conta. Verifique e tente novamente.',
      0xffffff
    );
    return;
  }

  let originalGuild, targetGuild;
  try {
    originalGuild = await api(userToken, 'GET', `/guilds/${originalId}?with_counts=true`);
  } catch {
    await setStatus(
      interaction,
      `${ET.config} Erro`,
      'Servidor **original** não encontrado. Verifique se o token tem acesso a ele.'
    );
    return;
  }

  try {
    targetGuild = await api(userToken, 'GET', `/guilds/${targetId}?with_counts=true`);
  } catch {
    await setStatus(
      interaction,
      `${ET.config} Erro`,
      'Servidor **alvo** não encontrado. Verifique se o token tem acesso a ele.'
    );
    return;
  }

  if (originalId === targetId) {
    await setStatus(
      interaction,
      `${ET.config} Erro`,
      'Os IDs de origem e destino precisam ser **diferentes**.'
    );
    return;
  }

  logEntrada({ event: 'CLONNER_START', originalId, targetId, userId: interaction.user.id });
  void sendChannelLog(
    interaction.client,
    'clonner',
    buildLogEmbed({
      title: `${ET.rocket} Clonagem iniciada`,
      description: [
        `**Por:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
        `**Origem:** \`${originalId}\` · ${originalGuild.name}`,
        `**Destino:** \`${targetId}\` · ${targetGuild.name}`,
      ].join('\n'),
    })
  );

  try {
    await setStatus(
      interaction,
      `${ET.tempo} Limpando alvo`,
      `Removendo canais e cargos de **${targetGuild.name}**...`
    );

    const channels = await api(userToken, 'GET', `/guilds/${targetId}/channels`);

    for (const ch of channels) {
      await api(userToken, 'DELETE', `/channels/${ch.id}`).catch(() => null);
      await sleep(250);
    }

    let roles = await api(userToken, 'GET', `/guilds/${targetId}/roles`);
    for (const role of roles) {
      if (role.managed || role.id === targetId) continue;
      if (role.tags?.bot_id) continue;
      await api(userToken, 'DELETE', `/guilds/${targetId}/roles/${role.id}`).catch(() => null);
      await sleep(250);
    }

    await setStatus(
      interaction,
      `${ET.pessoas} Cargos`,
      `Copiando cargos de **${originalGuild.name}**...`
    );

    let originalRoles = await api(userToken, 'GET', `/guilds/${originalId}/roles`);
    const roleMap = new Map();
    roleMap.set(originalId, targetId);

    const sortedRoles = originalRoles
      .filter((r) => !r.managed && r.id !== originalId)
      .sort((a, b) => a.position - b.position);

    for (const role of sortedRoles) {
      try {
        const newRole = await api(userToken, 'POST', `/guilds/${targetId}/roles`, {
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          permissions: String(role.permissions),
          mentionable: role.mentionable,
        });
        roleMap.set(role.id, newRole.id);
        logEntrada({ event: 'CLONNER_ROLE', roleName: role.name, newRoleId: newRole.id });
        await sleep(300);
      } catch (err) {
        logError({ event: 'CLONNER_ROLE_FAIL', roleName: role.name, message: err.message });
      }
    }

    await setStatus(interaction, `${ET.coin} Emojis`, 'Copiando emojis...');

    let originalEmojis = await api(userToken, 'GET', `/guilds/${originalId}/emojis`);
    for (const emoji of originalEmojis) {
      try {
        const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=128`;
        const imgRes = await fetch(emojiUrl);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const blob = new Blob([buffer], { type: emoji.animated ? 'image/gif' : 'image/png' });
        const form = new FormData();
        form.append('name', emoji.name);
        form.append('image', blob, `${emoji.name}.${emoji.animated ? 'gif' : 'png'}`);

        await fetch(`${API}/guilds/${targetId}/emojis`, {
          method: 'POST',
          headers: { Authorization: userToken },
          body: form,
        });
        await sleep(500);
      } catch (err) {
        logError({ event: 'CLONNER_EMOJI_FAIL', emojiName: emoji.name, message: err.message });
      }
    }

    const originalChannels = await api(userToken, 'GET', `/guilds/${originalId}/channels`);

    const categories = originalChannels
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);
    const textChannels = originalChannels
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .sort((a, b) => a.position - b.position);
    const voiceChannels = originalChannels
      .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
      .sort((a, b) => a.position - b.position);

    await setStatus(interaction, `${ET.edit} Categorias`, 'Copiando categorias...');

    const categoryMap = new Map();
    for (const category of categories) {
      try {
        const permOverwrites = (category.permission_overwrites || [])
          .map((v) => {
            const newRoleId = roleMap.get(v.id);
            if (!newRoleId) return null;
            return { id: newRoleId, allow: v.allow, deny: v.deny };
          })
          .filter(Boolean);

        const newCategory = await api(userToken, 'POST', `/guilds/${targetId}/channels`, {
          name: category.name,
          type: ChannelType.GuildCategory,
          permission_overwrites: permOverwrites,
          position: category.position,
        });
        categoryMap.set(category.id, newCategory.id);
        logEntrada({ event: 'CLONNER_CATEGORY', categoryName: category.name });
        await sleep(300);
      } catch (err) {
        logError({ event: 'CLONNER_CATEGORY_FAIL', categoryName: category.name, message: err.message });
      }
    }

    await setStatus(interaction, `${ET.edit} Canais de texto`, 'Copiando canais de texto...');

    for (const textChan of textChannels) {
      try {
        const permOverwrites = (textChan.permission_overwrites || [])
          .map((v) => {
            const newRoleId = roleMap.get(v.id);
            if (!newRoleId) return null;
            return { id: newRoleId, allow: v.allow, deny: v.deny };
          })
          .filter(Boolean);

        await api(userToken, 'POST', `/guilds/${targetId}/channels`, {
          name: textChan.name,
          type: textChan.type,
          parent_id: textChan.parent_id ? categoryMap.get(textChan.parent_id) : null,
          permission_overwrites: permOverwrites,
          topic: textChan.topic || undefined,
          nsfw: textChan.nsfw,
          rate_limit_per_user: textChan.rate_limit_per_user,
          position: textChan.position,
        });
        logEntrada({ event: 'CLONNER_TEXT_CHANNEL', channelName: textChan.name });
        await sleep(300);
      } catch (err) {
        logError({ event: 'CLONNER_TEXT_CHANNEL_FAIL', channelName: textChan.name, message: err.message });
      }
    }

    await setStatus(interaction, `${ET.raio} Canais de voz`, 'Copiando canais de voz...');

    for (const voiceChan of voiceChannels) {
      try {
        const permOverwrites = (voiceChan.permission_overwrites || [])
          .map((v) => {
            const newRoleId = roleMap.get(v.id);
            if (!newRoleId) return null;
            return { id: newRoleId, allow: v.allow, deny: v.deny };
          })
          .filter(Boolean);

        await api(userToken, 'POST', `/guilds/${targetId}/channels`, {
          name: voiceChan.name,
          type: voiceChan.type,
          parent_id: voiceChan.parent_id ? categoryMap.get(voiceChan.parent_id) : null,
          permission_overwrites: permOverwrites,
          bitrate: voiceChan.bitrate,
          user_limit: voiceChan.user_limit,
          position: voiceChan.position,
        });
        logEntrada({ event: 'CLONNER_VOICE_CHANNEL', channelName: voiceChan.name });
        await sleep(300);
      } catch (err) {
        logError({ event: 'CLONNER_VOICE_CHANNEL_FAIL', channelName: voiceChan.name, message: err.message });
      }
    }

    await setStatus(
      interaction,
      `${ET.check} Clonagem concluída`,
      `**${originalGuild.name}** → **${targetGuild.name}**\n\nCargos, emojis, categorias e canais foram copiados.`,
      0xffffff
    );
    logEntrada({ event: 'CLONNER_COMPLETE', originalId, targetId, userId: interaction.user.id });
    void sendChannelLog(
      interaction.client,
      'clonner',
      buildLogEmbed({
        title: `${ET.check} Clonagem concluída`,
        description: [
          `**Por:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
          `**${originalGuild.name}** → **${targetGuild.name}**`,
          `Cargos, emojis, categorias e canais copiados.`,
        ].join('\n'),
      })
    );
  } catch (err) {
    logError({ event: 'CLONNER_ERROR', message: err.message });
    void sendChannelLog(
      interaction.client,
      'clonner',
      buildLogEmbed({
        title: `${ET.config} Erro na clonagem`,
        description: `**Por:** ${interaction.user.tag}\n**Erro:** ${err.message}`,
      })
    );
    await setStatus(
      interaction,
      `${ET.config} Erro`,
      `Falha na clonagem: ${err.message}`,
      0xffffff
    ).catch(() => null);
  }
}
