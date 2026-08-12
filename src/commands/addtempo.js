const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addtempo')
        .setDescription('Adiciona dias de validade a um usuario')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome do usuario').setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('dias').setDescription('Quantidade de dias').setRequired(true).setMinValue(1)
        ),
    async execute(interaction, client, dbMySQL) {
        const usuarioNome = interaction.options.getString('usuario');
        const dias = interaction.options.getInteger('dias');

        try {
            const [rows] = await dbMySQL.query(
                'SELECT data_expiracao, plano_ativo FROM usuarios WHERE usuario = ?',
                [usuarioNome]
            );

            if (rows.length === 0) {
                return interaction.reply(buildPayload({
                    container: buildContainer({
                        title: 'Usuario nao encontrado',
                        description: `O usuario **${usuarioNome}** nao foi encontrado.`,
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            await dbMySQL.query(
                `UPDATE usuarios SET
                 data_expiracao = IF(data_expiracao > NOW(), DATE_ADD(data_expiracao, INTERVAL ? DAY), DATE_ADD(NOW(), INTERVAL ? DAY))
                 WHERE usuario = ?`,
                [dias, dias, usuarioNome]
            );

            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Tempo Adicionado!',
                    description: `Usuario: \`${usuarioNome}\`\nDias: \`${dias}\`\nA validade foi estendida com sucesso.`,
                    color: 0xffffff,
                    timestamp: true
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro ao adicionar tempo:', error);
            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Erro ao processar a alteracao no banco de dados.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
