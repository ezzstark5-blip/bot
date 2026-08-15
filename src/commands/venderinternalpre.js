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
        .setName('internal-premium')
        .setDescription('🎯 Menu de vendas - NEW Internal Premium'),

    async execute(interaction, client, dbMySQL) {
        try {
            const [rows] = await dbMySQL.query("SELECT * FROM produtos WHERE slug = 'internal-premium'");

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
                    title: 'NEW INTERNAL PREMIUM',
                    description:
                        '⚡ **Entrega Automática!**\n\n' +
                        '**Painel contém:**\n\n' +
                        '• Aimbot Premium\n' +
                        '• Aimbot Key\n' +
                        '• Aim Bone Avançado\n' +
                        '• Aim Delay Customizável\n' +
                        '• Aim Distance\n' +
                        '• Ignore Bot\n' +
                        '• Ignore Knocked\n' +
                        '• Silent Aim\n\n' +
                        '• Enable Esp Premium\n' +
                        '• Enable WaterMark\n' +
                        '• Enable Enemies Count\n' +
                        '• Enable Lines\n' +
                        '• Enable Health Text\n' +
                        '• Enable Health Bar\n' +
                        '• Enable Box 3D\n' +
                        '• Enable Fill Color\n' +
                        '• Enable Name\n' +
                        '• Enable Distance\n' +
                        '• Enable Skeleton\n' +
                        '• Enable Icon Weapon\n' +
                        '• Chams\n' +
                        '• Glow ESP',
                    color: 0xffffff,
                    image: 'https://i.imgur.com/e8U6beb.png',
                    thumbnail: client.user.displayAvatarURL(),
                    footer: {
                        text: `NEW BYPASS #7K • Hoje às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    },
                    timestamp: true,
                    actionRows: [botao]
                })
            }));
        } catch (error) {
            console.error('❌ Erro no comando internal-premium:', error);

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
