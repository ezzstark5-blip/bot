const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const bcrypt = require('bcrypt');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criarusuario')
        .setDescription('Cria um usuario no banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome de usuario').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('senha').setDescription('Senha do usuario').setRequired(true)
        ),

    async execute(interaction, client, dbMySQL) {
        const username = interaction.options.getString('usuario');
        const password = interaction.options.getString('senha');

        await interaction.deferReply({ ephemeral: true });

        try {
            const [existentes] = await dbMySQL.query(
                'SELECT id FROM users WHERE username = ? LIMIT 1',
                [username]
            );

            if (existentes.length > 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Usuario existente',
                        description: 'Ja existe um usuario com o nome **' + username + '**.',
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            const hash = await bcrypt.hash(password, 10);

            await dbMySQL.query(
                'INSERT INTO users (username, password, created_by) VALUES (?, ?, ?)',
                [username, hash, interaction.user.tag]
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuario criado',
                    description: 'Usuario **' + username + '** criado com sucesso.',
                    color: 0xffffff,
                    fields: [
                        { name: 'Criado por', value: interaction.user.tag, inline: true }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /criarusuario:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao criar o usuario.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};