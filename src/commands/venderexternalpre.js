const { SlashCommandBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

function buildErroContainer(client, title, description) {
    return buildContainer({
        title,
        description,
        color: 0xFF0000,
        thumbnail: client.user.displayAvatarURL(),
        footer: { text: 'NEW BYPASS' },
        timestamp: true
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('external-premium')
        .setDescription('🎯 Menu de vendas - NEW External Premium'),

    async execute(interaction, client, dbMySQL) {
        try {
            const [rows] = await dbMySQL.query("SELECT * FROM produtos WHERE slug = 'external-premium'");

            if (rows.length === 0) {
                return interaction.reply(buildPayload({
                    container: buildErroContainer(client, '❌ Produto Não Encontrado', 'Este produto não está disponível no momento.'),
                    ephemeral: true
                }));
            }

            const prod = rows[0];

            const botao = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ver_opcoes_${prod.id}`)
                        .setLabel('Clique aqui para ver as opções')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: 'NEW EXTERNAL PREMIUM',
                    description:
                        '⚡ **Entrega Automática!**\n\n' +
                        '**Recursos External Premium:**\n\n' +
                        '• Aimbot Externo Premium (Memory Based)\n' +
                        '• ESP Overlay Premium (Box, Name, Distance)\n' +
                        '• Triggerbot Configurável\n' +
                        '• Recoil Control System Advanced\n' +
                        '• Radar 2D/3D\n' +
                        '• Configurações Personalizáveis\n' +
                        '• Glow ESP\n' +
                        '• Chams External\n' +
                        '• FOV Circle\n' +
                        '• Crosshair Customizado\n' +
                        '• Head Hitbox\n' +
                        '• Smoothing Avançado\n' +
                        '• Prediction System\n' +
                        '• Anti-Screenshot\n' +
                        '• Stream Safe Mode',
                    color: 0xffffff,
                    image: 'https://i.imgur.com/cLlv8O8.png',
                    thumbnail: client.user.displayAvatarURL(),
                    footer: {
                        text: `NEW BYPASS #7K • Hoje às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    },
                    timestamp: true,
                    actionRows: [botao]
                })
            }));
        } catch (error) {
            console.error('❌ Erro no comando external-premium:', error);

            const payload = buildPayload({
                container: buildErroContainer(
                    client,
                    '❌ Erro Interno',
                    'Ocorreu um erro ao carregar o produto. Tente novamente ou contate o suporte.'
                ),
                ephemeral: true
            });

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(payload);
            } else {
                await interaction.reply(payload);
            }
        }
    }
};
