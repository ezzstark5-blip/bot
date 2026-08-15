const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

function buildPainelSaldo() {
    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('depositar_saldo')
            .setLabel('Depositar Saldo')
            .setEmoji('💵')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('meu_saldo')
            .setLabel('Meu Saldo')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
    );

    return buildContainer({
        title: 'Sistema de Saldo',
        description:
            'Deposite saldo na sua conta e use para comprar produtos com desconto ou pagamento instantâneo!\n\n' +
            'Clique no botão abaixo para depositar.',
        color: 0xffffff,
        separators: true,
        actionRows: [botoes]
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('saldo')
        .setDescription('Painel de depósito da carteira')
        .addSubcommand((sub) =>
            sub
                .setName('configure')
                .setDescription('Envia o painel Sistema de Saldo')
                .addChannelOption((option) =>
                    option
                        .setName('canal')
                        .setDescription('Canal onde o painel vai ser enviado')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channel = interaction.options.getChannel('canal') || interaction.channel;
        if (!channel?.isTextBased()) {
            return interaction.reply(buildPayload({
                container: buildContainer({
                    title: '❌ Canal inválido',
                    description: 'Escolhe um canal de texto.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }

        await interaction.deferReply({ ephemeral: true });
        await channel.send(buildPayload({ container: buildPainelSaldo() }));

        return interaction.editReply(buildPayload({
            container: buildContainer({
                title: '✅ Painel enviado',
                description: `Sistema de Saldo postado em ${channel}.`,
                color: 0xffffff
            }),
            ephemeral: true
        }));
    }
};
