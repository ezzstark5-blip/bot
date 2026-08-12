const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetar')
        .setDescription('Reseta HWID e IP de um usuario')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome do usuario').setRequired(true)
        ),
    async execute(interaction, client, dbMySQL) {
        const userReset = interaction.options.getString('usuario');

        try {
            const [check] = await dbMySQL.query('SELECT usuario FROM usuarios WHERE usuario = ?', [userReset]);

            if (check.length === 0) {
                return interaction.reply(buildPayload({
                    container: buildContainer({
                        title: 'Usuario nao encontrado',
                        description: `O usuario **${userReset}** nao foi encontrado no banco de dados.`,
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            await dbMySQL.query('UPDATE usuarios SET hwid = NULL, ip = NULL WHERE usuario = ?', [userReset]);

            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Sucesso!',
                    description: `O hardware e IP de **${userReset}** foram limpos.\nO proximo login sera vinculado automaticamente a nova maquina.`,
                    color: 0xffffff,
                    timestamp: true
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro ao resetar HWID:', error);
            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Erro ao acessar o banco de dados para realizar o reset.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
