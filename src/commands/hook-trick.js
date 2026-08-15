const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

const BANNER_URL = 'https://api.purincash.com/uploads/embed/696bdd6fad083adf.png';

function buildErroContainer(client, title, description) {
    return buildContainer({
        title,
        description,
        color: 0xffffff,
        thumbnail: client.user.displayAvatarURL(),
        footer: { text: 'NEW BYPASS' },
        timestamp: true
    });
}

async function findHookTrickProduct(dbMySQL) {
    const slugs = ['hook-trick', 'du7', 'hooktrick'];
    for (const slug of slugs) {
        const [rows] = await dbMySQL.query('SELECT * FROM produtos WHERE slug = ? LIMIT 1', [slug]);
        if (rows.length) return rows[0];
    }

    const [likeRows] = await dbMySQL.query(
        "SELECT * FROM produtos WHERE LOWER(nome) LIKE '%hook%' OR LOWER(slug) LIKE '%du7%' LIMIT 1"
    );
    return likeRows[0] || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hook-trick')
        .setDescription('Loja Hook Trick')
        .addSubcommand((sub) =>
            sub
                .setName('configure')
                .setDescription('Envia a loja Hook Trick (mesmo sistema de vendas)')
                .addChannelOption((option) =>
                    option
                        .setName('canal')
                        .setDescription('Canal onde a loja vai ser enviada')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, dbMySQL) {
        try {
            const channel = interaction.options.getChannel('canal') || interaction.channel;
            if (!channel?.isTextBased()) {
                return interaction.reply(buildPayload({
                    container: buildErroContainer(client, '❌ Canal inválido', 'Escolhe um canal de texto.'),
                    ephemeral: true
                }));
            }

            const prod = await findHookTrickProduct(dbMySQL);
            if (!prod) {
                return interaction.reply(buildPayload({
                    container: buildErroContainer(
                        client,
                        '❌ Produto não encontrado',
                        'Cria o produto no painel com slug `hook-trick` ou `du7`.'
                    ),
                    ephemeral: true
                }));
            }

            await interaction.deferReply({ ephemeral: true });

            const botao = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ver_opcoes_${prod.id}`)
                    .setLabel('Comprar')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send(buildPayload({
                container: buildContainer({
                    title: 'Hook Trick',
                    description:
                        '• Menu com uma interface moderna\n' +
                        '• Compatibilidade Total\n' +
                        '• Menu totalmente otimizado\n\n' +
                        '**ESP PERFEITO**\n' +
                        'Veja todos os jogadores através das paredes, itens e veículos com um sistema ultra-otimizado.\n\n' +
                        '**AIMBOT INTELIGENTE**\n' +
                        'Mira ajustável por distância, suavidade e prioridade (cabeça/peito).\n\n' +
                        '**COMPATIBILIDADE TOTAL**\n' +
                        'Funciona em todos os emuladores (Bluestacks, MSI 4/5, P64, N32).\n\n' +
                        'Não perca tempo! Compre agora e seja o mais temido do servidor.',
                    color: 0xffffff,
                    image: BANNER_URL,
                    footer: { text: "Clique no botão 'Comprar'" },
                    timestamp: true,
                    actionRows: [botao]
                })
            }));

            return interaction.editReply(buildPayload({
                container: buildContainer({
                    title: '✅ Loja enviada',
                    description: `Painel Hook Trick postado em ${channel}.\n**Comprar** usa o mesmo fluxo dos outros produtos.`,
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('❌ Erro no /hook-trick:', error);
            const payload = buildPayload({
                container: buildErroContainer(client, '❌ Erro Interno', 'Não foi possível enviar a loja.'),
                ephemeral: true
            });
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply(payload);
            }
            return interaction.reply(payload);
        }
    }
};
