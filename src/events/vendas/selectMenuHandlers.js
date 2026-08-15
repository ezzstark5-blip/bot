const { ChannelType } = require('discord.js');
const { buildContainer, buildPayload } = require('../../utils/componentsV2');
const { buildRevisaoContainer, buildRevisaoBotoes } = require('./carrinhoUi');

function createSelectMenuHandlers({ client, dbMySQL, CONFIG, store, helpers, discordLog }) {
    const { carrinhos, threadsPedidos } = store;
    const { gerarPedidoId, addTopicMembers } = helpers;
    const { enviarLogCarrinho } = discordLog || {};

    async function handleSelectMenuInteraction(interaction) {
        const userId = interaction.user.id;

        if (interaction.customId.startsWith('selecionar_plano_')) {
            const produtoId = interaction.customId.split('_')[2];
            const plano = interaction.values[0];

            await interaction.deferUpdate();

            const [rows] = await dbMySQL.query('SELECT * FROM produtos WHERE id = ?', [produtoId]);
            if (rows.length === 0) return;

            const produto = rows[0];
            let preco;
            let colunaEstoque;
            let estoque;

            switch (plano) {
                case 'diario':
                    preco = parseFloat(produto.preco_diario);
                    colunaEstoque = 'estoque_diario';
                    estoque = produto.estoque_diario;
                    break;
                case 'semanal':
                    preco = parseFloat(produto.preco_semanal);
                    colunaEstoque = 'estoque_semanal';
                    estoque = produto.estoque_semanal;
                    break;
                case 'mensal':
                    preco = parseFloat(produto.preco_mensal);
                    colunaEstoque = 'estoque_mensal';
                    estoque = produto.estoque_mensal;
                    break;
                case 'permanente':
                    preco = parseFloat(produto.preco_permanente);
                    colunaEstoque = 'estoque_permanente';
                    estoque = produto.estoque_permanente;
                    break;
                default:
                    return;
            }

            if (estoque <= 0) {
                return await interaction.followUp(buildPayload({
                    container: buildContainer({
                        title: '❌ Estoque Esgotado',
                        description: `Infelizmente o plano **${plano.toUpperCase()}** está sem estoque no momento.`,
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            const pedidoId = gerarPedidoId();

            carrinhos.set(userId, {
                pedidoId,
                produtoId: produto.id,
                produtoNome: produto.nome,
                produtoSlug: produto.slug,
                plano,
                preco,
                quantidade: 1,
                desconto: 0,
                cupom: null,
                colunaEstoque,
                pagamentoConfirmado: false,
                criadoEm: Date.now()
            });

            let thread;
            if (interaction.channel?.isThread()) {
                thread = interaction.channel;
                threadsPedidos.set(userId, thread.id);
            } else {
                let channel;
                try {
                    channel = await client.channels.fetch(CONFIG.CANAL_VENDAS);
                } catch (error) {
                    console.error('❌ Canal de vendas não encontrado:', CONFIG.CANAL_VENDAS);

                    return await interaction.followUp(buildPayload({
                        container: buildContainer({
                            title: '❌ Erro de Configuração',
                            description: 'O canal de vendas não foi encontrado. Entre em contato com o administrador.',
                            fields: [{ name: 'Código do Erro', value: '`CANAL_VENDAS_NOT_FOUND`' }],
                            color: CONFIG.COR_EMBED_ERRO,
                            thumbnail: client.user.displayAvatarURL(),
                            footer: { text: 'NEW BYPASS' },
                            timestamp: true
                        }),
                        ephemeral: true
                    }));
                }

                if (!channel.isTextBased()) {
                    console.error('❌ Canal de vendas não é um canal de texto');
                    return await interaction.followUp(buildPayload({
                        container: buildContainer({
                            description: '❌ O canal de vendas configurado não é válido.',
                            color: CONFIG.COR_EMBED_ERRO
                        }),
                        ephemeral: true
                    }));
                }

                thread = await channel.threads.create({
                    name: `🛒 ${interaction.user.username} - ${pedidoId}`,
                    type: ChannelType.PrivateThread,
                    invitable: false
                });

                await thread.members.add(userId);
                await addTopicMembers(thread, CONFIG.TOPIC_MEMBERS, [userId]);
                threadsPedidos.set(userId, thread.id);
            }

            const botoesRevisao = buildRevisaoBotoes();
            const container = buildRevisaoContainer({
                client,
                CONFIG,
                carrinho: carrinhos.get(userId),
                total: preco,
                estoque,
                mentionUserId: userId,
                actionRows: [botoesRevisao]
            });

            await thread.send(buildPayload({ container }));

            if (enviarLogCarrinho) {
                await enviarLogCarrinho(client, 'criado', {
                    user: interaction.user,
                    carrinho: carrinhos.get(userId),
                    total: preco,
                    threadId: thread.id
                });
            }

            await interaction.followUp(buildPayload({
                container: buildContainer({
                    title: '✅ Seu carrinho foi criado com êxito.',
                    description: `📋 **Ir para o carrinho** <#${thread.id}>`,
                    color: CONFIG.COR_EMBED_SUCESSO,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                }),
                ephemeral: true
            }));
        }
    }

    return { handleSelectMenuInteraction };
}

module.exports = { createSelectMenuHandlers };
