const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setfoto')
        .setDescription('Descontinuado no schema BOT-BY (tabela users)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.reply(buildPayload({
            container: buildContainer({
                title: 'Comando descontinuado',
                description: 'O schema atual usa a tabela `users` do BOT-BY, que nao possui foto de perfil.',
                color: 0xffffff
            }),
            ephemeral: true
        }));
    }
};
