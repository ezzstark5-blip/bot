const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');
const { gerarKeyUnica } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerarkey')
        .setDescription('Gera uma key aleatoria e salva no banco')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, dbMySQL) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const key = await gerarKeyUnica(dbMySQL);

            await dbMySQL.query(
                'INSERT INTO keys_table (key_value, created_by) VALUES (?, ?)',
                [key, interaction.user.tag]
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Key gerada',
                    description: 'Key criada com sucesso.',
                    color: 0xffffff,
                    fields: [
                        { name: 'Key', value: '`' + key + '`', inline: false }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /gerarkey:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao gerar a key.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};