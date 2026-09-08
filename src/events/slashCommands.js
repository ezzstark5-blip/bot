import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { logEntrada, logInfo, logError } from '../logs/logger.js';
import { ET } from '../emojis.js';
import { replyClonnerPanel, handleClonnerButton, handleClonnerModal } from '../clonner/handler.js';
import {
  replyQuestPanel,
  handleQuestButton,
  handleQuestSelect,
  handleQuestModal,
  handleQuestConfig,
} from '../quest/questHandler.js';
import {
  replyHypePanel,
  handleHypeSelect,
  handleHypeModal,
} from '../hypesquad/handler.js';
import { handleFlowInteraction } from '../flow/register.js';
import {
  replySorteioConfig,
  handleSorteioInteraction,
  handleSorteioEndCommand,
  handleSorteioRerollCommand,
} from '../sorteio/handler.js';
import {
  replyBoosterPanel,
  handleBoosterInteraction,
  handleBoosterConfigCommand,
} from '../booster/handler.js';
import {
  handleAntiselfCommand,
  routeAntiselfInteraction,
} from '../antiself/handler.js';
import { replyDropPanel, handleDropInteraction } from '../drop/handler.js';
import { handleDigit4Command } from '../digit4/handler.js';
import { replyAuthPanel, handleAuthInteraction, handleAuthLevarCommand } from '../auth/handler.js';
import {
  handleConectarCommand,
  handleDesconectarCommand,
} from '../voice/connect.js';

const ADMIN_ONLY = PermissionFlagsBits.Administrator;

export function registerSlashCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (await handleFlowInteraction(interaction)) return;
      if (await routeAntiselfInteraction(interaction)) return;
      if (await handleDropInteraction(interaction)) return;
      if (await handleAuthInteraction(interaction)) return;
      if (await handleBoosterInteraction(interaction)) return;
      if (await handleSorteioInteraction(interaction)) return;
      if (await handleClonnerButton(interaction)) return;
      if (await handleClonnerModal(interaction)) return;
      if (await handleQuestButton(interaction)) return;
      if (await handleQuestSelect(interaction)) return;
      if (await handleQuestModal(interaction)) return;
      if (await handleHypeSelect(interaction)) return;
      if (await handleHypeModal(interaction)) return;

      if (!interaction.isChatInputCommand()) return;

      const { commandName, options, user, guild, channel } = interaction;

      if (commandName === 'booster') {
        const sub = options.getSubcommand(false);
        if (!sub || sub === 'painel') {
          await replyBoosterPanel(interaction);
          return;
        }
        if (sub === 'config') {
          await handleBoosterConfigCommand(interaction);
          return;
        }
        return;
      }

      if (commandName === 'antiself' || commandName === 'antigrabber') {
        await handleAntiselfCommand(interaction);
        return;
      }

      if (commandName === 'drop') {
        await replyDropPanel(interaction);
        return;
      }

      if (commandName === 'digit4') {
        await handleDigit4Command(interaction);
        return;
      }

      if (commandName === 'auth') {
        await replyAuthPanel(interaction);
        return;
      }

      if (commandName === 'authlevar') {
        await handleAuthLevarCommand(interaction);
        return;
      }

      if (commandName === 'conectar' || commandName === 'connectar') {
        await handleConectarCommand(interaction);
        return;
      }

      if (commandName === 'desconectar') {
        await handleDesconectarCommand(interaction);
        return;
      }

      if (commandName === 'sorteio') {
        const sub = options.getSubcommand();
        if (sub === 'criar') {
          await replySorteioConfig(interaction);
          return;
        }
        if (sub === 'encerrar') {
          await handleSorteioEndCommand(interaction);
          return;
        }
        if (sub === 'reroll') {
          await handleSorteioRerollCommand(interaction);
          return;
        }
        return;
      }

      if (commandName === 'clonner') {
        await replyClonnerPanel(interaction);
        return;
      }

      if (commandName === 'quest') {
        await replyQuestPanel(interaction);
        return;
      }

      if (commandName === 'resgatar') {
        await replyHypePanel(interaction);
        return;
      }

      if (commandName === 'config') {
        await handleQuestConfig(interaction);
        return;
      }

      if (commandName === 'ticket') {
        const sub = options.getSubcommand();
        if (sub === 'open') {
          await interaction.reply({
            content: `${ET.config} Use o botão **Abrir Ticket** no painel central.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (sub === 'painel') {
          const { postTicketPanel } = await import('../tickets/handler.js');
          await postTicketPanel(channel);
          await interaction.reply({
            content: `${ET.check} Painel de tickets enviado!`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (sub === 'staff') {
          await interaction.reply({
            content: `${ET.bot} Use o painel dentro de um ticket aberto.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      if (commandName === 'ia') {
        const pergunta = options.getString('pergunta');
        if (!pergunta) {
          await interaction.reply({
            content: `${ET.bot} Use: /ia pergunta:sua pergunta`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          logEntrada({
            event: 'AI_ASK',
            userId: user.id,
            username: user.username,
            prompt: pergunta.slice(0, 300),
          });

          const { askGroq, splitMessage } = await import('../ai/groq.js');
          const answer = await askGroq(pergunta, user.username);
          const chunks = splitMessage(answer);

          await interaction.editReply({ content: chunks[0] });
          for (let i = 1; i < chunks.length; i++) {
            await channel.send({ content: chunks[i] });
          }
        } catch (err) {
          logError({ event: 'AI_ERROR', message: err.message });
          await interaction
            .editReply({ content: `${ET.config} Não consegui responder agora. Tente de novo em instantes.` })
            .catch(() => null);
        }
        return;
      }

      if (commandName === 'painel') {
        const { createButtonRow, createConfirmRow, createSelectRow } = await import(
          '../components/components.js'
        );
        const { sendAsChannelMessage } = await import('../utils/publicReply.js');
        await sendAsChannelMessage(interaction, {
          content: 'Painel de botões:',
          components: [createButtonRow(), createConfirmRow(), createSelectRow()],
        });

        logEntrada({ event: 'PAINEL_SENT', channelId: channel.id, userId: user.id });
        return;
      }

      if (commandName === 'info') {
        const embed = new EmbedBuilder()
          .setColor(0xffffff)
          .setTitle(`${ET.bot} Informações do Bot`)
          .addFields(
            { name: `${ET.bot} Bot`, value: `${interaction.client.user.username}`, inline: true },
            { name: `${ET.config} ID`, value: `\`${interaction.client.user.id}\``, inline: true },
            { name: `${ET.pessoas} Servidor`, value: `${guild?.name || 'DM'}`, inline: true },
            { name: `${ET.pessoas} Membros`, value: `${guild?.memberCount ?? '—'}`, inline: true },
            { name: `${ET.lupa} Canais`, value: `${guild?.channels.cache.size ?? '—'}`, inline: true },
            { name: `${ET.rocket} Versão`, value: '2.0.0', inline: true }
          )
          .setFooter({ text: `ID: ${user.id}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      logError({ event: 'INTERACTION_ERROR', message: err.message });
      const payload = { content: `${ET.config} Erro ao processar a interação.`, flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  });
}

export async function deploySlashCommands(token, clientId, guildId) {
  const { createHash } = await import('crypto');
  const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import('fs');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');

  const commands = [
    new SlashCommandBuilder()
      .setName('clonner')
      .setDescription('Clona cargos, emojis, categorias e canais de um servidor para outro')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Sistema de tickets de atendimento')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addSubcommand((sub) => sub.setName('open').setDescription('Abre o painel de tickets'))
      .addSubcommand((sub) => sub.setName('painel').setDescription('Envia o painel de tickets no canal'))
      .addSubcommand((sub) => sub.setName('staff').setDescription('Abre o painel do atendente'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ia')
      .setDescription('Faz uma pergunta para a IA (Groq)')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addStringOption((opt) =>
        opt.setName('pergunta').setDescription('Sua pergunta').setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Envia o painel de componentes')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('info')
      .setDescription('Informações do bot')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('quest')
      .setDescription('Painel de controle de missões de Orbs do Discord')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('resgatar')
      .setDescription('Abre o painel para resgatar ou trocar sua casa HypeSquad')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('setup-tools')
      .setDescription('Abre o painel principal de tools (Token, Funções e Info)')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('setlogs')
      .setDescription('Configurar logs do Self Flow por canal ou webhook')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addStringOption((option) =>
        option
          .setName('tipo')
          .setDescription('Escolha qual sistema de logs será configurado')
          .setRequired(true)
          .addChoices(
            { name: 'Logs públicos', value: 'public' },
            { name: 'Logs de admin', value: 'admin' }
          )
      )
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal que receberá as notificações')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('webhook')
          .setDescription('URL do webhook que receberá as notificações')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('booster')
      .setDescription('Painel de venda do Acesso Boost (StorM Wallet)')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addSubcommand((sub) =>
        sub.setName('painel').setDescription('Publica o embed de compra do Booster no canal')
      )
      .addSubcommand((sub) =>
        sub
          .setName('config')
          .setDescription('Configura preço, cargo e banner do Booster')
          .addNumberOption((opt) =>
            opt.setName('preco').setDescription('Preço em reais (ex: 6.5)').setMinValue(0.01)
          )
          .addRoleOption((opt) =>
            opt.setName('cargo').setDescription('Cargo entregue após o pagamento')
          )
          .addStringOption((opt) =>
            opt.setName('banner').setDescription('URL da imagem do banner')
          )
          .addStringOption((opt) =>
            opt.setName('titulo').setDescription('Título do embed').setMaxLength(100)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('sorteio')
      .setDescription('Sistema de sorteios')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addSubcommand((sub) =>
        sub.setName('criar').setDescription('Abre o menu para configurar e publicar um sorteio')
      )
      .addSubcommand((sub) =>
        sub
          .setName('encerrar')
          .setDescription('Encerra um sorteio ativo agora')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('ID do sorteio').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('reroll')
          .setDescription('Sorteia novos vencedores de um sorteio encerrado')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('ID do sorteio').setRequired(true)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('antiself')
      .setDescription('Anti Self — honeypot antigrabber / anti-spam')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addSubcommand((sub) =>
        sub
          .setName('ativar')
          .setDescription('Ativa o honeypot e posta o aviso no canal')
          .addChannelOption((opt) =>
            opt
              .setName('canal')
              .setDescription('Canal honeypot (padrão: canal atual)')
              .addChannelTypes(ChannelType.GuildText)
          )
          .addStringOption((opt) =>
            opt
              .setName('punicao')
              .setDescription('Punição ao detectar mensagem')
              .addChoices(
                { name: 'Timeout 7 dias', value: 'timeout' },
                { name: 'Ban', value: 'ban' },
                { name: 'Kick', value: 'kick' }
              )
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('desativar')
          .setDescription('Desativa o honeypot no canal')
          .addChannelOption((opt) =>
            opt
              .setName('canal')
              .setDescription('Canal a desativar (padrão: canal atual)')
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('drop')
      .setDescription('Publica o painel Pedir Drop (Components V2)')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('digit4')
      .setDescription('Scanner de usernames Discord 4–6 chars (letra/número) liberados')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addSubcommand((sub) =>
        sub.setName('iniciar').setDescription('Inicia a varredura a-z / 0-9 (4–6 chars)')
      )
      .addSubcommand((sub) =>
        sub.setName('parar').setDescription('Para a varredura')
      )
      .addSubcommand((sub) =>
        sub.setName('status').setDescription('Mostra progresso do scanner')
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('auth')
      .setDescription('Publica o painel de autenticação (site + cargo)')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('authlevar')
      .setDescription('Leva membros autenticados para outro servidor')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addStringOption((opt) =>
        opt
          .setName('servidor')
          .setDescription('ID do servidor de destino')
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('quantidade')
          .setDescription('Quantos membros levar (1–50)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('conectar')
      .setDescription('Conecta o bot em um canal de voz e ativa Transmitindo/Assistindo')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addChannelOption((opt) =>
        opt
          .setName('canal')
          .setDescription('Canal de voz para o bot entrar')
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('desconectar')
      .setDescription('Desconecta o bot do canal de voz')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('config')
      .setDescription('Configurar canal de logs do AutoQuest')
      .setDefaultMemberPermissions(ADMIN_ONLY)
      .setDMPermission(false)
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal para enviar logs')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
      .toJSON(),
  ];

  const hash = createHash('sha256').update(JSON.stringify(commands)).digest('hex');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const hashPath = join(__dirname, '..', '..', 'data', 'slash-hash.json');
  const force = String(process.env.FORCE_SLASH_DEPLOY || '').toLowerCase() === 'true';

  try {
    if (!force && existsSync(hashPath)) {
      const prev = JSON.parse(readFileSync(hashPath, 'utf8'));
      if (prev.hash === hash && prev.guildId === String(guildId || 'global')) {
        console.log(`⏭️ Slash commands inalterados (${commands.length}) — skip deploy`);
        return;
      }
    }
  } catch {
    /* continua deploy */
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`📌 Registrando ${commands.length} slash commands...`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      logInfo({
        event: 'SLASH_DEPLOY',
        scope: 'guild',
        guildId,
        adminOnly: true,
        count: commands.length,
        commands: commands.map((c) => c.name),
      });
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logInfo({
        event: 'SLASH_DEPLOY',
        scope: 'global',
        adminOnly: true,
        count: commands.length,
        commands: commands.map((c) => c.name),
      });
    }

    const dir = dirname(hashPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      hashPath,
      JSON.stringify({ hash, guildId: String(guildId || 'global'), at: Date.now() }, null, 2)
    );

    console.log(
      `✅ ${commands.length} slash commands registrados:`,
      commands.map((c) => `/${c.name}`).join(', ')
    );
  } catch (err) {
    const msg = err.message || String(err);
    const retry = err.rawError?.retry_after;
    logError({
      event: 'SLASH_DEPLOY_FAIL',
      message: msg,
      code: err.code || err.rawError?.code,
      status: err.status,
      raw: err.rawError || null,
    });
    console.error('❌ Falha ao registrar slash commands:', msg);
    if (err.rawError?.code === 30034) {
      console.error(
        '⚠️ Limite diário de criação de comandos (200). Espere o reset do Discord e rode com FORCE_SLASH_DEPLOY=true'
      );
      if (retry) console.error(`   Tente de novo em ~${Math.ceil(retry)}s`);
    }
  }
}
