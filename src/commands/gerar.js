const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerar')
        .setDescription('Abre o painel para gerar keys')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_gerar_ext_adv').setLabel('Ext Advanced').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_gerar_ext_pre').setLabel('Ext Premium').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_gerar_int_adv').setLabel('Int Advanced').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_gerar_int_pre').setLabel('Int Premium').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply(buildPayload({
            container: buildContainer({
                title: 'Gerar Key',
                description: 'Selecione o plano e informe a quantidade de dias no modal.',
                color: 0xffffff,
                thumbnail: interaction.guild?.iconURL() ?? null,
                footer: { text: 'NEW BYPASS' },
                timestamp: true,
                actionRows: [row]
            })
        }));
    }
};
