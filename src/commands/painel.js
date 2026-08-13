const { SlashCommandBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Envia o painel de registro de conta'),
    async execute(interaction, client) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_registrar_unificado')
                .setLabel('Registrar / Ativar')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply(buildPayload({
            container: buildContainer({
                title: 'REGISTRO DE CONTA',
                description: 'Clique no botao abaixo para criar seu usuario e senha.',
                color: 0xffffff,
                thumbnail: interaction.guild?.iconURL() ?? null,
                image: process.env.BANNER_VENDA || null,
                footer: { text: 'NEW BYPASS' },
                timestamp: true,
                actionRows: [row]
            })
        }));
    }
};
