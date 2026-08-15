const {
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    AttachmentBuilder
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../../utils/componentsV2');
const { buildRevisaoContainer, buildRevisaoBotoes, calcularTotal } = require('./carrinhoUi');
const { buildProdutoVendaContainer, buildPlanoSelectMenu } = require('./produtoVendaUi');

function createButtonHandlers({ client, dbMySQL, CONFIG, store, paymentService, avaliacaoService, discordLog, walletService }) {
    const {
        carrinhos,
        mensagensCarrinho,
        timersExpiracao,
        threadsPedidos,
        limparTimer
    } = store;
    const { enviarLogCarrinho } = discordLog || {};

    async function handleButtonInteraction(interaction) {
        const userId = interaction.user.id;

        if (interaction.customId.startsWith('avaliacao_')) {
            return await avaliacaoService.handleAvaliacaoButtons(interaction);
        }

        if (interaction.customId.startsWith('ver_opcoes_')) {
            const produtoId = interaction.customId.split('_')[2];
            await interaction.deferUpdate();

            const [rows] = await dbMySQL.query('SELECT * FROM produtos WHERE id = ?', [produtoId]);
            if (rows.length === 0) return;

            const prod = rows[0];
            const menu = buildPlanoSelectMenu(prod);

            await interaction.editReply(buildPayload({
                container: buildProdutoVendaContainer(client, prod, [menu])
            }));
        } else if (interaction.customId === 'ir_pagamento') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado! Inicie uma nova compra.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            await interaction.deferUpdate();

            try {
                await interaction.message.delete();
            } catch (error) {
                console.error('⚠️ Não foi possível deletar mensagem anterior:', error.message);
            }

            const rowPagamento = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('pagar_pix')
                        .setLabel('PIX')
                        .setEmoji('💎')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('pagar_carteira')
                        .setLabel('Carteira')
                        .setEmoji('👛')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('pagar_manual')
                        .setLabel('Pagamento Manual')
                        .setEmoji('📝')
                        .setStyle(ButtonStyle.Secondary)
                );

            const rowVoltar = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('voltar_carrinho')
                        .setLabel('Voltar')
                        .setEmoji('🔙')
                        .setStyle(ButtonStyle.Danger)
                );

            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);
            await thread.send(buildPayload({
                container: buildContainer({
                    title: '💳 Selecione uma forma de pagamento',
                    description: 'Escolha como deseja pagar sua compra:',
                    color: CONFIG.COR_EMBED_PRIMARIA,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true,
                    actionRows: [rowPagamento, rowVoltar]
                })
            }));
        } else if (interaction.customId === 'voltar_carrinho') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado! Inicie uma nova compra.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            await interaction.deferUpdate();

            try {
                await interaction.message.delete();
            } catch (error) {
                console.error('⚠️ Não foi possível deletar mensagem de pagamento:', error.message);
            }

            const total = calcularTotal(carrinho);
            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);

            const botoesRevisao = buildRevisaoBotoes();
            const container = buildRevisaoContainer({
                client,
                CONFIG,
                carrinho,
                total,
                actionRows: [botoesRevisao]
            });

            await thread.send(buildPayload({ container }));
        } else if (interaction.customId === 'pagar_manual') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado! Inicie uma nova compra.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            await interaction.deferUpdate();

            try {
                await interaction.message.delete();
            } catch (error) {
                console.error('⚠️ Não foi possível deletar mensagem de seleção:', error.message);
            }

            const total = calcularTotal(carrinho);

            try {
                const connection = await dbMySQL.getConnection();
                await paymentService.inserirPedidoPainelAprovacao(connection, userId, carrinho, total);
                connection.release();
            } catch (error) {
                console.error('❌ Erro ao inserir pedido no painel:', error);
                return await interaction.followUp(buildPayload({
                    container: buildContainer({ description: '❌ Erro ao processar pedido. Tente novamente.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);

            await thread.send(buildPayload({
                container: buildContainer({
                    title: '📝 Pagamento Manual Solicitado',
                    description: 'Seu pedido foi enviado para análise e aparecerá no painel de aprovação.',
                    color: CONFIG.COR_EMBED_AVISO,
                    fields: [
                        { name: '📦 Produto', value: `${carrinho.quantidade}x **${carrinho.produtoNome}**`, inline: true },
                        { name: '📋 Plano', value: `**${carrinho.plano.toUpperCase()}**`, inline: true },
                        { name: '💰 Valor', value: `**R$ ${total.toFixed(2)}**`, inline: true },
                        { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: false },
                        { name: '⏱️ Status', value: '🟡 **Aguardando Aprovação Manual**', inline: false }
                    ],
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS - Aguardando aprovação' },
                    timestamp: true
                })
            }));

            carrinhos.delete(userId);
            limparTimer(userId);
        } else if (interaction.customId === 'pagar_pix') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado! Inicie uma nova compra.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            await interaction.deferUpdate();

            try {
                await interaction.message.delete();
            } catch (error) {
                console.error('⚠️ Não foi possível deletar mensagem de seleção:', error.message);
            }

            let pagamento;
            try {
                pagamento = await paymentService.criarPagamentoPix(userId, carrinho, interaction.user);
            } catch (error) {
                console.error('❌ Erro ao criar PIX Storm Wallet:', error);
                return await interaction.followUp(buildPayload({
                    container: buildContainer({
                        title: '❌ Erro ao gerar PIX',
                        description: `${error.message}\n\nVerifique se a **STORM_WALLET_API_KEY** esta configurada no .env`,
                        color: CONFIG.COR_EMBED_ERRO
                    }),
                    ephemeral: true
                }));
            }

            const { total, pixCode, qrBuffer, publicPaymentUrl } = pagamento;

            if (enviarLogCarrinho) {
                await enviarLogCarrinho(client, 'pix_gerado', {
                    user: interaction.user,
                    carrinho,
                    total,
                    threadId: threadsPedidos.get(userId)
                });
            }

            const attachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });

            const botaoCopiar = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`copiar_pix_${carrinho.pedidoId}`)
                    .setLabel('📋 Copiar Código PIX')
                    .setStyle(ButtonStyle.Primary)
            );

            const threadId = threadsPedidos.get(userId);
            const thread = await client.channels.fetch(threadId);

            let description = `⏰ **Você tem ${CONFIG.TEMPO_PAGAMENTO_MINUTOS} minutos para efetuar o pagamento**\n\n📱 Escaneie o QR Code abaixo ou copie o código Pix:\n\`\`\`${pixCode}\`\`\``;
            if (publicPaymentUrl) {
                description += `\n\n🔗 **Link de pagamento:** ${publicPaymentUrl}`;
            }

            await thread.send(buildPayload({
                container: buildContainer({
                    title: '💎 Pagamento via PIX',
                    description,
                    color: CONFIG.COR_EMBED_SUCESSO,
                    fields: [
                        { name: '💰 Valor', value: `**R$ ${total.toFixed(2)}**`, inline: true },
                        { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: true }
                    ],
                    image: 'attachment://qrcode.png',
                    actionRows: [botaoCopiar]
                }),
                files: [attachment]
            }));

            const msgAguardando = await thread.send(buildPayload({
                container: buildContainer({
                    title: '⏳ Aguardando confirmação...',
                    description: 'Assim que o pagamento for confirmado, você receberá suas keys automaticamente!',
                    fields: [
                        { name: '📦 Produto', value: `${carrinho.quantidade}x **${carrinho.produtoNome}**`, inline: true },
                        { name: '📋 Plano', value: `**${carrinho.plano.toUpperCase()}**`, inline: true },
                        { name: '💰 Valor', value: `**R$ ${total.toFixed(2)}**`, inline: true }
                    ],
                    color: CONFIG.COR_EMBED_AVISO,
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                })
            }));

            carrinho.mensagemAguardandoId = msgAguardando.id;

            const timer = setTimeout(async () => {
                if (carrinhos.has(userId) && !carrinhos.get(userId).pagamentoConfirmado) {
                    const carrinhoExpirado = carrinhos.get(userId);
                    carrinhos.delete(userId);

                    if (enviarLogCarrinho && carrinhoExpirado) {
                        await enviarLogCarrinho(client, 'expirado', {
                            user: interaction.user,
                            carrinho: carrinhoExpirado,
                            threadId: threadsPedidos.get(userId)
                        });
                    }

                    try {
                        await thread.send(buildPayload({
                            container: buildContainer({
                                title: '⏰ Tempo Expirado',
                                description: 'Seu carrinho expirou! Inicie uma nova compra.',
                                color: CONFIG.COR_EMBED_ERRO,
                                thumbnail: client.user.displayAvatarURL(),
                                footer: { text: 'NEW BYPASS' },
                                timestamp: true
                            })
                        }));
                    } catch {
                        // ignore
                    }
                }
            }, CONFIG.TEMPO_PAGAMENTO_MINUTOS * 60 * 1000);

            timersExpiracao.set(userId, timer);
        } else if (interaction.customId === 'pagar_carteira') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado! Inicie uma nova compra.', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            const total = calcularTotal(carrinho);
            const saldo = walletService ? await walletService.obterSaldo(userId) : 0;
            const saldoApos = saldo - total;
            const saldoSuficiente = saldo >= total;

            const botoesCarteira = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirmar_carteira')
                    .setLabel('Confirmar compra')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!saldoSuficiente),
                new ButtonBuilder()
                    .setCustomId('cancelar_carteira')
                    .setLabel('Cancelar')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply(buildPayload({
                container: buildContainer({
                    title: '👛 Pagar com Carteira',
                    description: saldoSuficiente
                        ? 'Confirme para debitar da sua carteira e receber o produto na hora.'
                        : 'Saldo insuficiente para concluir esta compra.',
                    fields: [
                        { name: '💰 Seu saldo', value: `**R$ ${saldo.toFixed(2)}**`, inline: true },
                        { name: '🛒 Valor da compra', value: `**R$ ${total.toFixed(2)}**`, inline: true },
                        { name: '📊 Saldo apos compra', value: saldoSuficiente ? `**R$ ${saldoApos.toFixed(2)}**` : '—', inline: true },
                        { name: '📦 Produto', value: `${carrinho.quantidade}x **${carrinho.produtoNome}**`, inline: false },
                        { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: false }
                    ],
                    color: saldoSuficiente ? CONFIG.COR_EMBED_SUCESSO : CONFIG.COR_EMBED_ERRO,
                    actionRows: [botoesCarteira]
                }),
                ephemeral: true
            }));
        } else if (interaction.customId === 'confirmar_carteira') {
            const carrinho = carrinhos.get(userId);
            if (!carrinho) {
                return await interaction.update(buildPayload({
                    container: buildContainer({ description: '❌ Carrinho expirado!', color: CONFIG.COR_EMBED_ERRO }),
                    ephemeral: true
                }));
            }

            await interaction.deferUpdate();

            const totalCompra = calcularTotal(carrinho);
            const carrinhoLog = { ...carrinho };

            try {
                await paymentService.processarPagamentoCarteira(userId, carrinho);

                if (enviarLogCarrinho) {
                    await enviarLogCarrinho(client, 'pix_gerado', {
                        user: interaction.user,
                        carrinho: carrinhoLog,
                        total: totalCompra,
                        threadId: threadsPedidos.get(userId),
                        descricao: 'Pagamento aprovado via carteira'
                    });
                }

                await interaction.deleteReply().catch(() => {});
            } catch (error) {
                console.error('❌ Erro pagamento carteira:', error);
                await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: '❌ Erro no pagamento',
                        description: error.message || 'Nao foi possivel processar o pagamento com carteira.',
                        color: CONFIG.COR_EMBED_ERRO
                    }),
                    ephemeral: true
                }));
            }
        } else if (interaction.customId === 'cancelar_carteira') {
            await interaction.update(buildPayload({
                container: buildContainer({
                    description: 'Pagamento com carteira cancelado.',
                    color: CONFIG.COR_EMBED_AVISO
                }),
                ephemeral: true
            }));
        } else if (interaction.customId.startsWith('copiar_pix_')) {
            await interaction.reply(buildPayload({
                container: buildContainer({
                    description: '✅ Código PIX copiado! Cole no seu aplicativo bancário.',
                    color: CONFIG.COR_EMBED_SUCESSO
                }),
                ephemeral: true
            }));
        } else if (interaction.customId === 'editar_quantidade') {
            const modal = new ModalBuilder()
                .setCustomId('modal_quantidade')
                .setTitle('✏️ Editar Quantidade');

            const input = new TextInputBuilder()
                .setCustomId('quantidade_input')
                .setLabel('Insira a quantia desejada, exemplo: 3')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Digite a quantidade desejada')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(3);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        } else if (interaction.customId === 'usar_cupom') {
            const modal = new ModalBuilder()
                .setCustomId('modal_cupom')
                .setTitle('🎟️ Usar Cupom');

            const input = new TextInputBuilder()
                .setCustomId('cupom_input')
                .setLabel('Insira o código do cupom de desconto aqui')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Digite o código do cupom')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        } else if (interaction.customId === 'cancelar_pedido') {
            await interaction.deferUpdate();
            const carrinhoCancelado = carrinhos.get(userId);
            carrinhos.delete(userId);
            limparTimer(userId);

            if (enviarLogCarrinho && carrinhoCancelado) {
                await enviarLogCarrinho(client, 'cancelado', {
                    user: interaction.user,
                    carrinho: carrinhoCancelado,
                    threadId: threadsPedidos.get(userId)
                });
            }

            const threadId = threadsPedidos.get(userId);
            if (threadId) {
                try {
                    const thread = await client.channels.fetch(threadId);

                    if (thread && thread.isThread()) {
                        await thread.send(buildPayload({
                            container: buildContainer({
                                title: '🗑️ Pedido Cancelado',
                                description: 'Seu pedido foi cancelado com sucesso!',
                                color: CONFIG.COR_EMBED_ERRO,
                                thumbnail: client.user.displayAvatarURL(),
                                footer: { text: 'NEW BYPASS' },
                                timestamp: true
                            })
                        }));

                        setTimeout(async () => {
                            try {
                                await thread.setArchived(true);
                                await thread.setLocked(true);
                            } catch (error) {
                                console.error('❌ Erro ao fechar thread:', error);
                            }
                        }, 2000);
                    }
                } catch (error) {
                    console.error('❌ Erro ao cancelar pedido:', error);
                }
            }

            threadsPedidos.delete(userId);
            mensagensCarrinho.delete(userId);
        }
    }

    return { handleButtonInteraction };
}

module.exports = { createButtonHandlers };
