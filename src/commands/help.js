const { SlashCommandBuilder } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Lista os comandos disponiveis'),
    async execute(interaction, client) {
        await interaction.reply(buildPayload({
            container: buildContainer({
                title: 'COMANDOS DISPONIVEIS',
                description: 'Slash commands do bot:',
                color: 0xffffff,
                fields: [
                    { name: 'Keys', value: '`/gerar`', inline: false },
                    { name: 'Usuarios', value: '`/addtempo` `/resetar` `/setfoto` `/resethwid`', inline: false },
                    { name: 'Sistema', value: '`/painel` `/aprovar` `/help`', inline: false }
                ],
                footer: { text: 'NEW System' },
                timestamp: true
            }),
            ephemeral: true
        }));
    }
};
