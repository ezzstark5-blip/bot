import { MessageFlags, ChannelType } from 'discord.js';
import { logEntrada, logError } from '../logs/logger.js';
import { getLogChannelId, sendChannelLog, buildLogPanel } from '../logs/channels.js';
import { ET } from '../emojis.js';
import { tokenManager } from './tokenManager.js';
import { questConfig, saveQuestConfig } from './questConfig.js';
import {
  buildQuestPanel,
  buildQuestModal,
  buildQuestList,
  buildQuestTokenMenu,
  buildQuestTutorial,
  buildQuestActions,
  buildFarmProgressPanel,
} from './questComponents.js';
import { fetchAvailableQuests, runAutoQuest } from './questCore.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';

const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PROGRESS_EDIT_MS = 3500;

/** @type {Set<string>} */
const activeSessions = new Set();

function panelStats() {
  const sessions = activeSessions.size;
  tokenManager.load();
  return {
    accounts: tokenManager.count(),
    sessions,
    status: sessions > 0 ? 'Em execução' : 'Aguardando início',
  };
}

async function refreshQuestPanel(client) {
  const channelId = questConfig.panelChannelId;
  const messageId = questConfig.panelMessageId;
  if (!client || !channelId || !messageId) return false;

  try {
    const channel =
      client.channels.cache.get(channelId) ||
      (await client.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return false;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return false;

    await message.edit({
      components: [buildQuestPanel(panelStats())],
      flags: V2,
      allowedMentions: { parse: [] },
    });
    return true;
  } catch (err) {
    logError({ event: 'QUEST_PANEL_REFRESH_FAIL', message: err.message });
    return false;
  }
}

function createProgressUpdater(interaction) {
  let lastEdit = 0;
  let queue = Promise.resolve();
  let stopped = false;

  const edit = (payload, force = false) => {
    if (stopped) return queue;
    const now = Date.now();
    if (!force && now - lastEdit < PROGRESS_EDIT_MS) return queue;

    lastEdit = now;
    queue = queue
      .then(async () => {
        if (stopped) return;
        await interaction.editReply({
          content: null,
          components: [buildFarmProgressPanel(payload)],
          flags: V2,
          allowedMentions: { parse: [] },
        });
      })
      .catch((err) => {
        if (err?.code === 50027 || err?.code === 10062 || err?.code === 10008) {
          stopped = true;
          return;
        }
        logError({ event: 'QUEST_PROGRESS_EDIT_FAIL', message: err.message });
      });
    return queue;
  };

  return {
    edit,
    stop: () => {
      stopped = true;
    },
  };
}

async function sendLog(client, panel) {
  const channelId = questConfig.logChannelId || getLogChannelId('quest');
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      await channel.send({
        components: panel.components,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    logError({ event: 'QUEST_LOG_FAIL', message: err.message });
    await sendChannelLog(client, 'quest', panel);
  }
}

export async function replyQuestPanel(interaction) {
  const message = await sendAsChannelMessage(interaction, {
    components: [buildQuestPanel(panelStats())],
    flags: V2,
    allowedMentions: { parse: [] },
  });

  if (message?.id && message?.channelId) {
    questConfig.panelChannelId = message.channelId;
    questConfig.panelMessageId = message.id;
    saveQuestConfig();
  }

  logEntrada({
    event: 'QUEST_PANEL',
    userId: interaction.user.id,
    guildId: interaction.guildId,
    accounts: panelStats().accounts,
  });
}

export async function handleQuestConfig(interaction) {
  if (interaction.user.id !== questConfig.ownerId) {
    await interaction.reply({
      content: `${ET.config} Apenas o owner pode usar este comando.`,
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('canal');
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: `${ET.config} O canal deve ser de texto.`,
      ephemeral: true,
    });
    return;
  }

  questConfig.logChannelId = channel.id;
  saveQuestConfig();
  await interaction.reply({
    content: `${ET.check} Canal de logs configurado: ${channel}`,
    ephemeral: true,
  });
  logEntrada({ event: 'QUEST_CONFIG', userId: interaction.user.id, channelId: channel.id });
}

export async function handleQuestButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('quest')) return false;

  try {
    if (interaction.customId === 'quest_refresh_panel') {
      await interaction.deferUpdate();
      await interaction.message.edit({
        components: [buildQuestPanel(panelStats())],
        flags: V2,
        allowedMentions: { parse: [] },
      });
      questConfig.panelChannelId = interaction.channelId;
      questConfig.panelMessageId = interaction.message.id;
      saveQuestConfig();
      return true;
    }

    if (interaction.customId === 'quest_settings') {
      await interaction.reply({
        components: [buildQuestTokenMenu()],
        flags: V2_EPHEMERAL,
        allowedMentions: { parse: [] },
      });
      return true;
    }

    if (interaction.customId === 'quest_login') {
      await interaction.showModal(buildQuestModal());
      return true;
    }

    const token = tokenManager.get(interaction.user.id);
    if (!token) {
      await interaction.reply({
        components: [buildQuestTokenMenu()],
        flags: V2_EPHEMERAL,
        allowedMentions: { parse: [] },
      });
      return true;
    }

    if (interaction.customId === 'quest_ver') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const quests = await fetchAvailableQuests(token);
        if (!quests.length) {
          await interaction.editReply({
            content: `${ET.tempo} Nenhuma missão disponível.`,
          });
          return true;
        }
        const list = quests
          .map(
            (q, i) =>
              `**${i + 1}. ${q.questName}**\n${ET.coin} ${q.rewardText} | ${q.taskType} | ${Math.floor(q.target / 60)}min`
          )
          .join('\n\n');
        await interaction.editReply({
          components: [buildQuestList(list)],
          flags: V2,
        });
        return true;
      } catch (err) {
        await interaction
          .editReply({ content: `${ET.config} Erro: ${err.message}` })
          .catch(() => null);
        return true;
      }
    }

    if (interaction.customId === 'quest_farm') {
      if (activeSessions.has(interaction.user.id)) {
        await interaction.reply({
          content: `${ET.tempo} Você já tem uma sessão em execução.`,
          ephemeral: true,
        });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({
        components: [
          buildFarmProgressPanel({
            states: [],
            finished: false,
          }),
        ],
        flags: V2,
        allowedMentions: { parse: [] },
      });

      const user = interaction.user;
      activeSessions.add(user.id);
      void refreshQuestPanel(interaction.client);
      const progressUi = createProgressUpdater(interaction);

      const startPanel = buildLogPanel({
        title: `${ET.rocket} Farm Iniciado`,
        description: `**Usuário:** ${user.tag} (\`${user.id}\`)\n**Status:** Iniciando farm...`,
      });
      await sendLog(interaction.client, startPanel);

      runAutoQuest(token, {
        onLog: async (logMsg) => {
          console.log(`[FARM] ${logMsg}`);
          if (
            logMsg.includes('✅ Missão concluída') ||
            logMsg.includes('🚀 Iniciando') ||
            logMsg.includes('🏁 Tudo pronto')
          ) {
            const logPanel = buildLogPanel({
              title: `${ET.lupa} Log do Farm`,
              description: `**Usuário:** ${user.tag}\n**Log:** ${logMsg}`,
            });
            await sendLog(interaction.client, logPanel);
          }
        },
        onProgress: (payload) => {
          // Fire-and-forget: edição do Discord não pode pausar o farm
          if (payload.type === 'empty') {
            void progressUi.edit(
              {
                empty: true,
                user: payload.user,
                orbs: payload.orbs,
              },
              true
            );
            return;
          }

          if (payload.type === 'finished') {
            void progressUi.edit(
              {
                states: payload.states,
                user: payload.user,
                orbs: payload.orbs,
                finished: true,
                completed: payload.completed,
                total: payload.total,
              },
              true
            );
            return;
          }

          void progressUi.edit(
            {
              states: payload.states,
              user: payload.user,
              orbs: payload.orbs,
              finished: false,
            },
            !!payload.force
          );
        },
      })
        .catch(async (err) => {
          logError({ event: 'QUEST_FARM_ERROR', message: err.message, userId: interaction.user.id });
          progressUi.stop();
          await interaction
            .followUp({ content: `${ET.config} Erro: ${err.message}`, ephemeral: true })
            .catch(() => null);
          const errPanel = buildLogPanel({
            title: `${ET.config} Erro no Farm`,
            description: `**Usuário:** ${user.tag}\n**Erro:** ${err.message}`,
          });
          await sendLog(interaction.client, errPanel);
        })
        .finally(() => {
          activeSessions.delete(user.id);
          progressUi.stop();
          void refreshQuestPanel(interaction.client);
        });
      return true;
    }
  } catch (err) {
    logError({ event: 'QUEST_BUTTON_ERROR', message: err.message });
  }

  return true;
}

export async function handleQuestSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== 'quest_token_menu') return false;

  try {
    const value = interaction.values[0];

    if (value === 'send_token') {
      await interaction.showModal(buildQuestModal());
      return true;
    }

    if (value === 'token_tutorial') {
      await interaction.update({
        components: [buildQuestTutorial()],
        flags: V2,
        allowedMentions: { parse: [] },
      });
      return true;
    }
  } catch (err) {
    logError({ event: 'QUEST_SELECT_ERROR', message: err.message });
  }

  return true;
}

export async function handleQuestModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== 'quest_login_modal') return false;

  const token = interaction.fields.getTextInputValue('token_input').trim();
  tokenManager.set(interaction.user.id, token);
  await interaction.reply({
    components: [buildQuestActions()],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  });
  void refreshQuestPanel(interaction.client);
  logEntrada({
    event: 'QUEST_LOGIN',
    userId: interaction.user.id,
    accounts: tokenManager.count(),
  });
  return true;
}
