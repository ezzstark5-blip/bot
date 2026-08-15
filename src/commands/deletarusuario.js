const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletarusuario')
        .setDescription('Remove um usuario do banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome de usuario a remover').setRequired(true)
        ),

    async execute(interaction, client, dbMySQL) {
        const username = interaction.options.getString('usuario');

        await interaction.deferReply({ ephemeral: true });

        try {
            const [result] = await dbMySQL.query('DELETE FROM users WHERE username = ?', [username]);

            if (result.affectedRows === 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Nao encontrado',
                        description: 'Nenhum usuario encontrado com o nome **' + username + '**.',
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuario removido',
                    description: 'Usuario **' + username + '** removido com sucesso.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /deletarusuario:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao remover o usuario.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};