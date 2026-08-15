const {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../../utils/componentsV2');
const { buildRevisaoContainer, buildRevisaoBotoes, calcularTotal, isRevisaoPedidoMessage } = require('./carrinhoUi');

function createModalHandlers({ client, dbMySQL, CONFIG, store, helpers, paymentService }) {
    const { carrinhos, threadsPedidos, timersExpiracao } = store;
    const { gerarPedidoId, addTopicMembers } = helpers;

    async function handleModalInteraction(interaction) {
        const userId = interaction.user.id;

        if (interaction.customId === 'modal_depositar_saldo') {
            const bruto = interaction.fields.getTextInputValue('deposito_valor').replace(',', '.').trim();
            const valor = parseFloat(bruto);

            if (isNaN(valor) || valor < 1) {
                return interaction.reply(buildPayload({
                    container: buildContainer({
                        title: '❌ Valor inválido',
                        description: 'Digite um valor de no mínimo **R$ 1.00**. Exemplo: `50.00`',
                        color: CONFIG.COR_EMBED_ERRO
                    }),
                    ephemeral: true
                }));
            }

            await interaction.deferReply({ ephemeral: true });

            const parent = interaction.channel.isThread()
                ? interaction.channel.parent
                : interaction.channel;

            if (!parent?.threads?.create) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        description: '❌ Esse canal não aceita tópico privado.',
                        color: CONFIG.COR_EMBED_ERRO
                    }),
                    ephemeral: true
                }));
            }

            const pedidoId = gerarPedidoId();
            const carrinhoDeposito = {
                tipo: 'deposito',
                pedidoId,
                produtoId: null,
                produtoNome: 'Depósito Carteira',
                plano: 'saldo',
                preco: valor,
                quantidade: 1,
                desconto: 0,
                cupom: null,
                pagamentoConfirmado: false,
                criadoEm: Date.now()
            };

            carrinhos.set(userId, carrinhoDeposito);

            const thread = await parent.threads.create({
                name: `💵 ${interaction.user.username} - Depósito`,
                type: ChannelType.PrivateThread,
                invitable: false
            });

            await thread.members.add(userId);
            await addTopicMembers(thread, CONFIG.TOPIC_MEMBERS, [userId]);
            threadsPedidos.set(userId, thread.id);

            let pagamento;
            try {
                pagamento = await paymentService.criarPagamentoPix(userId, carrinhoDeposito, interaction.user);
            } catch (error) {
                console.error('❌ Erro ao gerar PIX de depósito:', error);
                carrinhos.delete(userId);
                threadsPedidos.delete(userId);
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Erro ao gerar PIX',
                        description: error.message || 'Não foi possível gerar o QR Code.',
                        color: CONFIG.COR_EMBED_ERRO
                    }),
                    ephemeral: true
                }));
            }

            const { total, pixCode, qrBuffer, publicPaymentUrl } = pagamento;
            const attachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
            const botaoCopiar = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`copiar_pix_${pedidoId}`)
                    .setLabel('📋 Copiar Código PIX')
                    .setStyle(ButtonStyle.Primary)
            );

            let description = `⏰ **Você tem ${CONFIG.TEMPO_PAGAMENTO_MINUTOS} minutos para pagar**\n\n📱 Escaneie o QR Code ou copie o código Pix:\n\`\`\`${pixCode}\`\`\``;
            if (publicPaymentUrl) {
                description += `\n\n🔗 **Link de pagamento:** ${publicPaymentUrl}`;
            }

            await thread.send(buildPayload({
                container: buildContainer({
                    title: '💵 Depósito via PIX',
                    description,
                    color: CONFIG.COR_EMBED_SUCESSO,
                    fields: [
                        { name: '💰 Valor', value: `**R$ ${total.toFixed(2)}**`, inline: true },
                        { name: '🆔 Pedido', value: `\`${pedidoId}\``, inline: true }
                    ],
                    image: 'attachment://qrcode.png',
                    actionRows: [botaoCopiar]
                }),
                files: [attachment]
            }));

            const timer = setTimeout(() => {
                const atual = carrinhos.get(userId);
                if (atual?.tipo === 'deposito' && !atual.pagamentoConfirmado) {
                    carrinhos.delete(userId);
                    thread.send(buildPayload({
                        container: buildContainer({
                            title: '⏰ Tempo Expirado',
                            description: 'O depósito expirou. Abra um novo pelo painel de saldo.',
                            color: CONFIG.COR_EMBED_ERRO
                        })
                    })).catch(() => {});
                }
            }, CONFIG.TEMPO_PAGAMENTO_MINUTOS * 60 * 1000);

            timersExpiracao.set(userId, timer);

            return interaction.editReply(buildPayload({
                container: buildContainer({
                    title: '✅ Tópico criado',
                    description: `Pague o PIX em <#${thread.id}> para creditar **R$ ${valor.toFixed(2)}** na carteira.`,
                    color: CONFIG.COR_EMBED_SUCESSO
                }),
                ephemeral: true
            }));
        }

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
