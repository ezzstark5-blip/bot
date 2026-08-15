const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listarusuarios')
        .setDescription('Lista os usuarios cadastrados no banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, dbMySQL) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const [rows] = await dbMySQL.query(
                'SELECT username, created_by, created_at FROM users ORDER BY created_at DESC LIMIT 25'
            );

            if (rows.length === 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Usuarios',
                        description: 'Nenhum usuario cadastrado ainda.',
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            const lista = rows
                .map((u, i) => {
                    const data = u.created_at
                        ? new Date(u.created_at).toLocaleString('pt-BR')
                        : 'desconhecido';
                    return '**' + (i + 1) + '.** ' + u.username + ' — ' + (u.created_by ?? 'desconhecido') + ' (' + data + ')';
                })
                .join('\n');

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuarios cadastrados',
                    description: lista,
                    color: 0xffffff,
                    footer: { text: 'Ultimos 25 registros' }
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /listarusuarios:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao listar os usuarios.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};