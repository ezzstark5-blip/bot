import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  EmbedBuilder
} from 'discord.js';

export function createButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_ok').setLabel('OK').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_info').setLabel('Info').setStyle(ButtonStyle.Secondary)
  );
}

export function createConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_sim').setLabel('Sim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_nao').setLabel('Não').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_close').setLabel('Fechar').setStyle(ButtonStyle.Secondary)
  );
}

export function createSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_opcoes')
      .setPlaceholder('Escolha uma opção')
      .addOptions([
        { label: 'Opção A', description: 'Descrição A', value: 'opcao_a' },
        { label: 'Opção B', description: 'Descrição B', value: 'opcao_b' },
        { label: 'Opção C', description: 'Descrição C', value: 'opcao_c' }
      ])
  );
}

export function createModal() {
  const modal = new ModalBuilder()
    .setCustomId('modal_formulario')
    .setTitle('Formulário');

  const input1 = new TextInputBuilder()
    .setCustomId('campo_nome')
    .setLabel('Nome')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const input2 = new TextInputBuilder()
    .setCustomId('campo_descricao')
    .setLabel('Descrição')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(input1));
  modal.addComponents(new ActionRowBuilder().addComponents(input2));
  return modal;
}