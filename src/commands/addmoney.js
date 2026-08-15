const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');
const { createWalletService } = require('../services/walletService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('Adiciona saldo na carteira de um usuario')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption((option) =>
            option.setName('pessoa').setDescription('Usuario que recebera o saldo').setRequired(true)
        )
        .addNumberOption((option) =>
            option.setName('valor').setDescription('Valor em reais').setRequired(true).setMinValue(0.01)
        ),

    async execute(interaction, client, dbMySQL) {
        const usuario = interaction.options.getUser('pessoa');
        const valor = interaction.options.getNumber('valor');

        await interaction.deferReply({ ephemeral: true });

        try {
            const walletService = createWalletService({ dbMySQL });
            const saldoApos = await walletService.adicionarSaldo(
                usuario.id,
                valor,
                interaction.user.id,
                'Credito via /addmoney por ' + interaction.user.tag
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Saldo adicionado',
                    description: 'Credito aplicado na carteira de **' + usuario.tag + '**.',
                    color: 0xffffff,
                    fields: [
                        { name: 'Valor', value: '`R$ ' + valor.toFixed(2) + '`', inline: true },
                        { name: 'Saldo atual', value: '`R$ ' + saldoApos.toFixed(2) + '`', inline: true }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /addmoney:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: error.message || 'Nao foi possivel adicionar saldo.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};