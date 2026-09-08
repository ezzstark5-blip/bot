import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { E, ET, WHITE } from '../emojis.js';
import { createProgressBar, formatTime, TASK_TYPES } from './questCore.js';

const COLOR = WHITE;
const VERSION = '1.0.0';

export function buildQuestPanel({ accounts = 0, sessions = 0, status = 'Aguardando início' } = {}) {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `## ${ET.rocket} Auto-Quest`,
              'Automação multitarefa simultânea de missões elegíveis e resgate automático de recompensas.',
            ].join('\n')
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('quest_settings')
            .setEmoji(E.config)
            .setStyle(ButtonStyle.Secondary)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '**Estado do Sistema**',
          `>>> ${ET.pessoas} Contas registradas: **${accounts}** conectada(s)`,
          `${ET.rocket} Sessões ativas: **${sessions}** em execução`,
          `${ET.tempo} Status geral: ${status}`,
          `${ET.coin} Versão: ${VERSION}`,
          `-# Atualizado <t:${Math.floor(Date.now() / 1000)}:R>`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '**Funcionalidades em Destaque**',
          `>>> ${ET.raio} **Processamento Simultâneo:** Vídeos, jogos e transmissões em paralelo`,
          `${ET.edit} **Retomada Inteligente:** Sessões salvas e retomadas se o bot reiniciar`,
          `${ET.coin} **Claim Instantâneo:** Envio e resgate automático dos códigos de recompensa`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '**Como operar:**',
          'Clique na engrenagem no canto superior direito do painel para conectar sua conta ou gerenciar os comandos.',
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('quest_refresh_panel')
          .setLabel('Atualizar status')
          .setEmoji(E.tempo)
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

export function buildQuestTokenMenu() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${ET.config} Token da conta`,
          `Para usar o Auto-Quest precisamos do **token da sua conta Discord.**`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId('quest_token_menu')
          .setPlaceholder('Selecione uma opção')
          .addOptions(
            {
              label: 'Enviar o token',
              description: 'Abrir formulário para colar o token',
              value: 'send_token',
              emoji: E.config,
            },
            {
              label: 'Tutorial de como pegar o token',
              description: 'Passo a passo no Discord',
              value: 'token_tutorial',
              emoji: E.lupa,
            }
          )
      )
    );
}

export function buildQuestTutorial() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Tutorial — Token da conta`),
      new TextDisplayBuilder().setContent(
        [
          '**Passo a passo no Discord (PC):**',
          '',
          `>>> ${ET.bot} Abra o Discord no navegador (discord.com/app) e faça login.`,
          `${ET.edit} Pressione **F12** → aba **Network** (Rede).`,
          `${ET.lupa} Recarregue a página (**F5**) e filtre por \`/api\`.`,
          `${ET.config} Clique em qualquer requisição → **Headers** → copie o valor de **authorization**.`,
          '',
          `${ET.raio} Esse valor é o **token**. Volte ao painel e escolha **Enviar o token**.`,
          `${ET.tempo} Não compartilhe o token com ninguém.`,
        ].join('\n')
      )
    );
}

export function buildQuestModal() {
  return new ModalBuilder()
    .setCustomId('quest_login_modal')
    .setTitle('Login - Insira seu Token')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('token_input')
          .setLabel('Token de usuário do Discord')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Cole seu token aqui...')
          .setRequired(true)
      )
    );
}

export function buildQuestList(content) {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Missões disponíveis\n\n${content}`)
    );
}

export function buildQuestStatus(content) {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

export function buildQuestActions() {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Comandos Auto-Quest`),
      new TextDisplayBuilder().setContent(
        `${ET.check} Conta conectada. Escolha uma ação abaixo.`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('quest_ver')
          .setLabel('Ver Missões')
          .setEmoji(E.lupa)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('quest_farm')
          .setLabel('Iniciar Farm')
          .setEmoji(E.raio)
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

const STATUS_LABEL = {
  pending: 'Na fila',
  running: 'Em andamento',
  done: 'Concluída',
  failed: 'Falhou',
};

/**
 * @param {{ states: Array, user?: object, orbs?: number|null, finished?: boolean, completed?: number, total?: number, empty?: boolean }} opts
 */
export function buildFarmProgressPanel({
  states = [],
  user = null,
  orbs = null,
  finished = false,
  completed = 0,
  total = 0,
  empty = false,
} = {}) {
  const account = user
    ? `${user.global_name || user.username} (@${user.username})`
    : '—';
  const orbsText = orbs == null ? '—' : orbs.toLocaleString('pt-BR');

  const container = new ContainerBuilder().setAccentColor(COLOR);

  if (empty) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.tempo} Auto-Quest`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.pessoas} **Conta:** ${account}`,
          `${ET.coin} **Orbs:** ${orbsText}`,
          '',
          `${ET.config} Nenhuma missão disponível no momento.`,
        ].join('\n')
      )
    );
  }

  if (!states.length && !finished) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.raio} Farm em andamento`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.tempo} Validando token e buscando missões...`,
          `${ET.rocket} A barra de progresso de cada missão aparece aqui.`,
        ].join('\n')
      )
    );
  }

  const title = finished
    ? `## ${ET.check} Farm concluído`
    : `## ${ET.raio} Farm em andamento`;

  const headerLines = [
    `${ET.pessoas} **Conta:** ${account}`,
    `${ET.coin} **Orbs:** ${orbsText}`,
  ];

  if (finished) {
    headerLines.push(`${ET.rocket} **Resultado:** ${completed}/${total} missões concluídas`);
  } else {
    const running = states.find((s) => s.status === 'running');
    const doneCount = states.filter((s) => s.status === 'done').length;
    headerLines.push(
      `${ET.tempo} **Progresso geral:** ${doneCount}/${states.length}`,
      running ? `${ET.edit} **Atual:** ${running.questName}` : `${ET.tempo} Preparando...`
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(title),
    new TextDisplayBuilder().setContent(headerLines.join('\n'))
  );

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const bar = createProgressBar(s.current || 0, s.target || 1);
    const typeLabel = TASK_TYPES[s.taskType] || s.taskType;
    const statusLabel = STATUS_LABEL[s.status] || s.status;

    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**${i + 1}. ${s.questName}**`,
            `>>> ${ET.coin} ${s.rewardText} · ${typeLabel}`,
            `${ET.tempo} ${statusLabel}`,
            `\`${bar}\``,
            `${formatTime(s.current || 0)} / ${formatTime(s.target || 0)}`,
          ].join('\n')
        )
      );
  }

  return container;
}
