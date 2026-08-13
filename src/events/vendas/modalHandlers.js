const { buildContainer, buildPayload } = require('../../utils/componentsV2');
const { buildRevisaoContainer, buildRevisaoBotoes, calcularTotal, isRevisaoPedidoMessage } = require('./carrinhoUi');

function createModalHandlers({ client, dbMySQL, CONFIG, store }) {
    const { carrinhos, threadsPedidos } = store;

    async function handleModalInteraction(interaction) {
        const userId = interaction.user.id;
        const carrinho = carrinhos.get(userId);

        if (!carrinho) {
            return await interaction.reply(buildPayload({
                container: buildContainer({
                    title: '❌ Carrinho Expirado',
                    description: 'Seu carrinho expirou! Inicie uma nova compra.',
                    color: CONFIG.COR_EMBED_ERRO,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                }),
                ephemeral: true
            }));
        }

        await interaction.deferReply({ ephemeral: true });

        if (interaction.customId === 'modal_quantidade') {
            const quantidade = parseInt(interaction.fields.getTextInputValue('quantidade_input'), 10);

            if (isNaN(quantidade) || quantidade < 1 || quantidade > 100) {
                return await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Quantidade Inválida',
                        description: 'Digite um número entre **1** e **100**.',
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            const [rows] = await dbMySQL.query(
                `SELECT ${carrinho.colunaEstoque} as estoque FROM produtos WHERE id = ?`,
                [carrinho.produtoId]
            );

            if (rows.length === 0 || rows[0].estoque < quantidade) {
                return await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Estoque Insuficiente',
                        description: `Disponível: **${rows[0]?.estoque || 0}** unidades`,
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            carrinho.quantidade = quantidade;

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: '✅ Quantidade Atualizada',
                    description: `Nova quantidade: **${quantidade}x**`,
                    color: CONFIG.COR_EMBED_SUCESSO,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                }),
                ephemeral: true
            }));

            const total = calcularTotal(carrinho);
            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);

            const botoesRevisao = buildRevisaoBotoes();
            const container = buildRevisaoContainer({ client, CONFIG, carrinho, total, actionRows: [botoesRevisao] });

            const messages = await thread.messages.fetch({ limit: 10 });
            const originalMessage = messages.find(isRevisaoPedidoMessage);
            if (originalMessage) {
                await originalMessage.edit(buildPayload({ container }));
            }
        } else if (interaction.customId === 'modal_cupom') {
            const cupomCodigo = interaction.fields.getTextInputValue('cupom_input').trim().toUpperCase();

            const [cupons] = await dbMySQL.query('SELECT * FROM cupons WHERE codigo = ?', [cupomCodigo]);

            if (cupons.length === 0) {
                return await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Cupom Inválido',
                        description: 'O cupom informado não existe ou está desativado.',
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            const cupom = cupons[0];

            if (cupom.expira_em && new Date(cupom.expira_em) < new Date()) {
                return await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Cupom Expirado',
                        description: 'Este cupom já expirou e não pode mais ser utilizado.',
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            if (cupom.max_usos && cupom.usos_atuais >= cupom.max_usos) {
                return await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Cupom Esgotado',
                        description: 'Este cupom atingiu o limite máximo de usos.',
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            carrinho.cupom = cupomCodigo;
            carrinho.desconto = parseFloat(cupom.desconto_percentual);

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: '✅ Cupom Aplicado',
                    description: `Cupom **${cupomCodigo}** aplicado com sucesso!`,
                    fields: [{ name: '💰 Desconto', value: `**${cupom.desconto_percentual}%**`, inline: true }],
                    color: CONFIG.COR_EMBED_SUCESSO,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                }),
                ephemeral: true
            }));

            const total = calcularTotal(carrinho);
            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);

            const botoesRevisao = buildRevisaoBotoes();
            const container = buildRevisaoContainer({ client, CONFIG, carrinho, total, actionRows: [botoesRevisao] });

            const messages = await thread.messages.fetch({ limit: 10 });
            const originalMessage = messages.find(isRevisaoPedidoMessage);
            if (originalMessage) {
                await originalMessage.edit(buildPayload({ container }));
            }
        }
    }

    return { handleModalInteraction };
}

module.exports = { createModalHandlers };
