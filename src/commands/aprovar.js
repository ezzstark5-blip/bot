const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aprovar')
        .setDescription('Inicia a aprovacao de um pedido')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('pedido').setDescription('ID do pedido').setRequired(true)
        ),
    async execute(interaction) {
        const idPedido = interaction.options.getString('pedido');

        const selectPlanos = new StringSelectMenuBuilder()
            .setCustomId(`sel_plano_${idPedido}`)
            .setPlaceholder('Selecione o Nivel do Plano')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('External Premium')
                    .setDescription('Acesso externo completo')
                    .setValue('ext_pre'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('External Advanced')
                    .setDescription('Acesso externo basico')
                    .setValue('ext_adv'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Internal Premium')
                    .setDescription('Acesso interno completo')
                    .setValue('int_pre'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Internal Advanced')
                    .setDescription('Acesso interno basico')
                    .setValue('int_adv')
            );

        await interaction.reply(buildPayload({
            container: buildContainer({
                title: 'Configuracao de Aprovacao',
                description: `Iniciando aprovacao para o pedido **${idPedido}**.\n\nPor favor, selecione o **Nivel do Plano** abaixo:`,
                color: 0xffffff,
                timestamp: true,
                actionRows: [new ActionRowBuilder().addComponents(selectPlanos)]
            })
        }));
    }
};
