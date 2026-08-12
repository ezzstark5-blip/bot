const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setfoto')
        .setDescription('Define a foto de perfil de um usuario')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome do usuario').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('url').setDescription('Link da imagem').setRequired(true)
        ),
    async execute(interaction, client, dbMySQL) {
        const usuario = interaction.options.getString('usuario');
        const fotoUrl = interaction.options.getString('url');

        if (!fotoUrl.startsWith('http')) {
            return interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'URL invalida',
                    description: 'O link da foto deve ser uma URL valida (http ou https).',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }

        try {
            const [check] = await dbMySQL.query('SELECT usuario FROM usuarios WHERE usuario = ?', [usuario]);

            if (check.length === 0) {
                return interaction.reply(buildPayload({
                    container: buildContainer({
                        title: 'Usuario nao encontrado',
                        description: `O usuario **${usuario}** nao foi encontrado no banco de dados.`,
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            await dbMySQL.query('UPDATE usuarios SET foto_url = ? WHERE usuario = ?', [fotoUrl, usuario]);

            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Sucesso!',
                    description: `A foto de perfil do usuario **${usuario}** foi atualizada.`,
                    color: 0xffffff,
                    timestamp: true
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro ao definir foto:', error);
            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Erro ao acessar o banco de dados.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
