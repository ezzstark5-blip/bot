const { buildContainer, buildPayload } = require('../utils/componentsV2');
const QRCode = require('qrcode');

function createPaymentService({ client, dbMySQL, CONFIG, store, helpers, discordLog, avaliacaoService, registrarLog, stormWalletService }) {
    const { gerarKey, getPainelIdFromCarrinho } = helpers;
    const { enviarLogVenda } = discordLog;
    const {
        carrinhos,
        mensagensCarrinho,
        processandoPagamentos,
        threadsPedidos,
        stormPollers,
        limparTimer
    } = store;

    async function salvarEntregaPendente(connection, userId, carrinho, motivo, keys = null) {
        try {
            await connection.query(`
                INSERT INTO entregas_pendentes 
                (user_id, pedido_id, produto_id, quantidade, keys, motivo, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [
                userId,
                carrinho.pedidoId,
                carrinho.produtoId,
                carrinho.quantidade,
                keys ? JSON.stringify(keys) : null,
                motivo
            ]);

            console.log(`📝 Entrega pendente registrada: ${carrinho.pedidoId} - Motivo: ${motivo}`);
        } catch (error) {
            console.error('❌ Erro ao salvar entrega pendente:', error.message);
        }
    }

    async function inserirPedidoPainelAprovacao(connection, userId, carrinho, total) {
        try {
            const user = await client.users.fetch(userId);
            const painelId = getPainelIdFromCarrinho(carrinho);

            const [existente] = await connection.query(
                'SELECT id, status FROM pedidos WHERE pedido_id = ?',
                [carrinho.pedidoId]
            );

            if (existente.length > 0) {
                console.log(`📝 Pedido já existe no painel: ${carrinho.pedidoId} (Status: ${existente[0].status})`);
                return existente[0].id;
            }

            const [insertResult] = await connection.query(`
                INSERT INTO pedidos 
                (discord_id, discord_user, discord_tag, tipo_key, plano, valor, quantidade, pedido_id, status, created_at, painel_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aprovado', NOW(), ?)
            `, [
                userId,
                user.username,
                user.tag,
                carrinho.produtoNome,
                carrinho.plano,
                total,
                carrinho.quantidade,
                carrinho.pedidoId,
                painelId
            ]);

            console.log(`✅ Pedido inserido e APROVADO automaticamente: ${carrinho.pedidoId} (${painelId})`);

            try {
                const canalLogs = client.channels.cache.get(CONFIG.CANAL_LOGS_VENDAS);
                if (canalLogs) {
                    await canalLogs.send(buildPayload({
                        container: buildContainer({
                            title: '✅ Pedido Aprovado Automaticamente!',
                            description: 'Pagamento confirmado e pedido aprovado automaticamente.',
                            color: 0xffffff,
                            fields: [
                                { name: '👤 Cliente', value: `${user.tag}\n\`${userId}\``, inline: true },
                                { name: '📦 Produto', value: `${carrinho.produtoNome}`, inline: true },
                                { name: '💰 Valor', value: `R$ ${total.toFixed(2)}`, inline: true },
                                { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: false },
                                { name: '🎯 Painel', value: `**${painelId.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}**`, inline: false }
                            ],
                            footer: { text: 'NEW BYPASS - Aprovação Automática' },
                            timestamp: true
                        })
                    }));
                }
            } catch (error) {
                console.error('❌ Erro ao enviar notificação:', error.message);
            }

            return insertResult.insertId;
        } catch (error) {
            console.error('❌ Erro ao inserir pedido no painel:', error.message);
            return null;
        }
    }

    async function confirmarPagamentoAutomatico(userId, carrinho) {
        if (carrinho.pagamentoConfirmado) {
            console.log('⚠️ Pagamento já confirmado anteriormente');
            return;
        }

        let connection;
        let tentativas = 0;
        const maxTentativas = 3;

        while (tentativas < maxTentativas) {
            try {
                connection = await dbMySQL.getConnection();
                break;
            } catch (error) {
                tentativas++;
                console.error(`❌ Tentativa ${tentativas}/${maxTentativas} falhou:`, error.message);

                if (tentativas >= maxTentativas) {
                    throw new Error('Falha ao conectar ao banco após 3 tentativas');
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        try {
            await connection.beginTransaction();

            const [prodRows] = await connection.query(
                'SELECT * FROM produtos WHERE id = ? FOR UPDATE',
                [carrinho.produtoId]
            );

            if (prodRows.length === 0) {
                throw new Error('Produto não encontrado');
            }

            const produto = prodRows[0];
            const estoqueAtual = produto[carrinho.colunaEstoque];

            if (estoqueAtual < carrinho.quantidade) {
                await connection.rollback();
                console.error('❌ Estoque insuficiente!');

                const user = await client.users.fetch(userId);

                await user.send(buildPayload({
                    container: buildContainer({
                        title: '❌ Estoque Esgotado',
                        description: 'Infelizmente o produto acabou de esgotar. Entre em contato com o suporte para reembolso.',
                        fields: [
                            { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: false }
                        ],
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    })
                })).catch(() => {});
                await salvarEntregaPendente(connection, userId, carrinho, 'ESTOQUE_INSUFICIENTE');
                return;
            }

            const keys = [];
            for (let i = 0; i < carrinho.quantidade; i++) {
                keys.push(gerarKey());
            }

            const [updateResult] = await connection.query(
                `UPDATE produtos SET ${carrinho.colunaEstoque} = ${carrinho.colunaEstoque} - ? WHERE id = ?`,
                [carrinho.quantidade, carrinho.produtoId]
            );

            if (updateResult.affectedRows === 0) {
                throw new Error('Falha ao atualizar estoque');
            }

            const total = (carrinho.preco * carrinho.quantidade) * (1 - carrinho.desconto / 100);
            const keysJSON = JSON.stringify(keys);

            await inserirPedidoPainelAprovacao(connection, userId, carrinho, total);

            const [insertResult] = await connection.query(`
                INSERT INTO vendas 
                (pedido_id, user_id, produto_id, quantidade, valor_total, cupom, desconto, \`keys\`, metodo_pagamento, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PIX_AUTO', NOW())
            `, [
                carrinho.pedidoId,
                userId,
                carrinho.produtoId,
                carrinho.quantidade,
                total,
                carrinho.cupom || null,
                carrinho.desconto || 0,
                keysJSON
            ]);

            if (insertResult.affectedRows === 0) {
                throw new Error('Falha ao inserir venda');
            }

            await connection.commit();
            console.log(`✅ Transação confirmada: ${carrinho.pedidoId}`);

            carrinho.pagamentoConfirmado = true;
            limparTimer(userId);

            const user = await client.users.fetch(userId);

            const entregaContainer = buildContainer({
                title: '✅ Entrega Automática!',
                description: '🎉 **Pagamento confirmado!**\n\nSuas keys foram geradas com sucesso.',
                color: CONFIG.COR_EMBED_SUCESSO,
                fields: [
                    {
                        name: '📦 Produto',
                        value: `**${carrinho.quantidade}x** ${carrinho.produtoNome}\n**Plano:** ${carrinho.plano.toUpperCase()}`,
                        inline: true
                    },
                    {
                        name: '💰 Valor Pago',
                        value: `R$ ${total.toFixed(2)}`,
                        inline: true
                    },
                    {
                        name: '🆔 ID do Pedido',
                        value: `\`${carrinho.pedidoId}\``,
                        inline: false
                    },
                    {
                        name: '🔑 Suas Keys',
                        value: '```\n' + keys.join('\n') + '\n```',
                        inline: false
                    }
                ],
                thumbnail: client.user.displayAvatarURL(),
                footer: { text: 'NEW BYPASS - Entrega Automática' },
                timestamp: true
            });

            let entregaRealizada = false;

            try {
                await user.send(buildPayload({ container: entregaContainer }));
                console.log(`✅ Keys enviadas via DM para ${user.username}`);
                entregaRealizada = true;

                await avaliacaoService.enviarAvaliacaoPosEntrega(user, carrinho, keys);
            } catch (dmError) {
                console.error('❌ Erro ao enviar DM:', dmError.message);

                const threadId = threadsPedidos.get(userId);
                if (threadId) {
                    try {
                        const channel = await client.channels.fetch(threadId);
                        if (channel?.isThread()) {
                            await channel.send(buildPayload({
                                container: buildContainer({
                                    title: '⚠️ Entrega na Thread',
                                    description: 'Não consegui enviar DM. Suas keys estão aqui:\n\n🎉 **Pagamento confirmado!**',
                                    color: CONFIG.COR_EMBED_SUCESSO,
                                    fields: [
                                        {
                                            name: '📦 Produto',
                                            value: `**${carrinho.quantidade}x** ${carrinho.produtoNome}\n**Plano:** ${carrinho.plano.toUpperCase()}`,
                                            inline: true
                                        },
                                        {
                                            name: '💰 Valor Pago',
                                            value: `R$ ${total.toFixed(2)}`,
                                            inline: true
                                        },
                                        {
                                            name: '🆔 ID do Pedido',
                                            value: `\`${carrinho.pedidoId}\``,
                                            inline: false
                                        },
                                        {
                                            name: '🔑 Suas Keys',
                                            value: '```\n' + keys.join('\n') + '\n```',
                                            inline: false
                                        }
                                    ],
                                    thumbnail: client.user.displayAvatarURL(),
                                    footer: { text: 'NEW BYPASS - Entrega Automática' },
                                    timestamp: true
                                })
                            }));
                            console.log(`✅ Keys enviadas na thread ${threadId}`);
                            entregaRealizada = true;

                            await avaliacaoService.enviarAvaliacaoPosEntrega(user, carrinho, keys, channel);
                        }
                    } catch (threadError) {
                        console.error('❌ Erro ao enviar na thread:', threadError.message);
                    }
                }

                if (!entregaRealizada) {
                    await salvarEntregaPendente(connection, userId, carrinho, 'DM_FECHADA', keys);
                    console.log(`⚠️ Entrega salva como pendente no banco para ${user.username}`);
                }
            }

            await enviarLogVenda(client, {
                comprador: user,
                pedidoId: carrinho.pedidoId,
                produtoNome: carrinho.produtoNome,
                plano: carrinho.plano,
                quantidade: carrinho.quantidade,
                valorTotal: total,
                metodoPagamento: '💎 PIX (Auto)',
                cupom: carrinho.cupom,
                desconto: carrinho.desconto,
                painel_id: getPainelIdFromCarrinho(carrinho)
            });

            carrinhos.delete(userId);
            mensagensCarrinho.delete(userId);
            threadsPedidos.delete(userId);

            console.log(`✅ Venda finalizada: ${user.username}`);
        } catch (err) {
            if (connection) {
                try {
                    await connection.rollback();
                    console.log('🔄 Rollback executado');
                } catch (rollbackError) {
                    console.error('❌ Erro no rollback:', rollbackError.message);
                }
            }

            console.error('❌ Erro na confirmação:', err);

            try {
                const user = await client.users.fetch(userId);

                await user.send(buildPayload({
                    container: buildContainer({
                        title: '❌ Erro no Processamento',
                        description: 'Ocorreu um erro ao processar seu pagamento. Entre em contato com o suporte imediatamente!',
                        fields: [
                            { name: '🆔 Pedido', value: `\`${carrinho.pedidoId}\``, inline: false }
                        ],
                        color: CONFIG.COR_EMBED_ERRO,
                        thumbnail: client.user.displayAvatarURL(),
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    })
                })).catch(() => {});
            } catch {
                // ignore
            }

            throw err;
        } finally {
            if (connection) {
                try {
                    connection.release();
                } catch (releaseError) {
                    console.error('❌ Erro ao liberar conexão:', releaseError.message);
                }
            }
        }
    }

    function pararVerificacaoStorm(userId) {
        if (stormPollers.has(userId)) {
            clearInterval(stormPollers.get(userId));
            stormPollers.delete(userId);
        }
    }

    async function iniciarVerificacaoStorm(userId, chargeId) {
        pararVerificacaoStorm(userId);

        const interval = setInterval(async () => {
            try {
                const carrinho = carrinhos.get(userId);

                if (!carrinho || carrinho.pagamentoConfirmado) {
                    pararVerificacaoStorm(userId);
                    return;
                }

                const charge = await stormWalletService.verifyCharge(chargeId);

                if (stormWalletService.isChargePaid(charge)) {
                    pararVerificacaoStorm(userId);
                    await confirmarPagamentoAutomatico(userId, carrinho);
                    return;
                }

                if (stormWalletService.isChargeExpired(charge)) {
                    pararVerificacaoStorm(userId);
                    carrinhos.delete(userId);
                    limparTimer(userId);

                    const threadId = threadsPedidos.get(userId);
                    if (threadId) {
                        const thread = await client.channels.fetch(threadId).catch(() => null);
                        if (thread?.isThread()) {
                            await thread.send(buildPayload({
                                container: buildContainer({
                                    title: '⏰ Pagamento Expirado',
                                    description: 'O PIX expirou. Inicie uma nova compra.',
                                    color: CONFIG.COR_EMBED_ERRO
                                })
                            })).catch(() => {});
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Erro ao verificar pagamento Storm:', error.message);
            }
        }, 5000);

        stormPollers.set(userId, interval);
    }

    async function criarPagamentoPix(userId, carrinho, user) {
        const total = (carrinho.preco * carrinho.quantidade) * (1 - carrinho.desconto / 100);

        const charge = await stormWalletService.createCharge({
            value: total,
            description: `Pedido ${carrinho.pedidoId} - ${carrinho.quantidade}x ${carrinho.produtoNome}`,
            expiresIn: CONFIG.TEMPO_PAGAMENTO_MINUTOS * 60,
            customer: {
                name: user.username
            }
        });

        const pixCode = charge.pixCode || charge.qrCode?.emv;
        carrinho.stormChargeId = charge.id;
        carrinho.pixCode = pixCode;

        let qrBuffer = stormWalletService.qrImageToBuffer(charge.qrCode?.image);
        if (!qrBuffer && pixCode) {
            qrBuffer = await QRCode.toBuffer(pixCode);
        }

        if (!pixCode || !qrBuffer) {
            throw new Error('A API nao retornou QR Code PIX valido');
        }

        iniciarVerificacaoStorm(userId, charge.id);

        return {
            total,
            pixCode,
            qrBuffer,
            chargeId: charge.id,
            publicPaymentUrl: charge.publicPaymentUrl || null
        };
    }

    async function processarPagamentoWebhook(valorRecebido, identificador, nomeCliente) {
        try {
            const valorFloat = parseFloat(valorRecebido.toString().replace(',', '.'));

            if (isNaN(valorFloat) || valorFloat <= 0) {
                return { sucesso: false, erro: 'Valor inválido' };
            }

            const idNormalizado = identificador.toString()
                .replace(/[\s.-]/g, '')
                .toLowerCase()
                .trim();

            console.log(`🔍 Buscando: R$ ${valorFloat.toFixed(2)} | ID: ${idNormalizado}`);

            let carrinhoEncontrado = null;
            let userId = null;

            for (const [id, carr] of carrinhos.entries()) {
                if (carr.pagamentoConfirmado) continue;

                const totalCarrinho = (carr.preco * carr.quantidade) * (1 - carr.desconto / 100);
                const diferenca = Math.abs(totalCarrinho - valorFloat);

                if (diferenca <= 0.10) {
                    const idCarrinho = (carr.pedidoId || '').toString().toLowerCase();
                    const idStorm = (carr.stormChargeId || '').toString().toLowerCase();

                    if (
                        (idCarrinho.length >= 8 && idNormalizado.includes(idCarrinho)) ||
                        (idStorm && idNormalizado.includes(idStorm))
                    ) {
                        console.log(`✅ Match! User: ${id} | Pedido: ${idCarrinho}`);
                        carrinhoEncontrado = carr;
                        userId = id;
                        break;
                    }
                }
            }

            if (!carrinhoEncontrado || !userId) {
                console.log(`❌ Carrinho não encontrado para valor R$ ${valorFloat.toFixed(2)}`);
                return { sucesso: false, erro: 'Nenhum carrinho ativo encontrado para esse valor e ID' };
            }

            if (processandoPagamentos.has(carrinhoEncontrado.pedidoId)) {
                console.log(`⚠️ Já processando pagamento: ${carrinhoEncontrado.pedidoId}`);
                return { sucesso: false, erro: 'Pagamento já está sendo processado' };
            }

            processandoPagamentos.add(carrinhoEncontrado.pedidoId);

            try {
                await confirmarPagamentoAutomatico(userId, carrinhoEncontrado);
                const user = await client.users.fetch(userId);

                registrarLog('SUCESSO', {
                    motivo: 'Pagamento confirmado',
                    pedidoId: carrinhoEncontrado.pedidoId,
                    username: user.username,
                    userId,
                    valor: valorFloat
                });

                return {
                    sucesso: true,
                    pedidoId: carrinhoEncontrado.pedidoId,
                    username: user.username
                };
            } finally {
                setTimeout(() => {
                    processandoPagamentos.delete(carrinhoEncontrado.pedidoId);
                }, 30000);
            }
        } catch (error) {
            registrarLog('ERRO', {
                motivo: 'Erro ao processar',
                erro: error.message,
                stack: error.stack
            });
            return { sucesso: false, erro: error.message };
        }
    }

    async function processarWebhookStorm(payload) {
        const charge = stormWalletService.extractChargeFromWebhook(payload);
        const chargeId = charge?.id || charge?.correlationID || payload?.chargeId || payload?.id;

        if (!chargeId) {
            return { sucesso: false, erro: 'Charge ID ausente no webhook' };
        }

        let userId = null;
        let carrinhoEncontrado = null;

        for (const [id, carr] of carrinhos.entries()) {
            if (carr.pagamentoConfirmado) continue;

            if (carr.stormChargeId === chargeId) {
                userId = id;
                carrinhoEncontrado = carr;
                break;
            }
        }

        if (!carrinhoEncontrado || !userId) {
            console.log(`⚠️ Webhook Storm: carrinho nao encontrado para charge ${chargeId}`);
            return { sucesso: false, erro: 'Carrinho nao encontrado' };
        }

        if (processandoPagamentos.has(carrinhoEncontrado.pedidoId)) {
            return { sucesso: false, erro: 'Pagamento ja esta sendo processado' };
        }

        const paid = stormWalletService.isChargePaid(charge);
        const expired = stormWalletService.isChargeExpired(charge);

        if (paid) {
            processandoPagamentos.add(carrinhoEncontrado.pedidoId);
            pararVerificacaoStorm(userId);

            try {
                await confirmarPagamentoAutomatico(userId, carrinhoEncontrado);
                return { sucesso: true, pedidoId: carrinhoEncontrado.pedidoId };
            } finally {
                setTimeout(() => {
                    processandoPagamentos.delete(carrinhoEncontrado.pedidoId);
                }, 30000);
            }
        }

        if (expired) {
            pararVerificacaoStorm(userId);
            carrinhos.delete(userId);
            limparTimer(userId);
            return { sucesso: true, status: 'expired' };
        }

        return { sucesso: true, status: 'ignored' };
    }

    return {
        processarPagamentoWebhook,
        inserirPedidoPainelAprovacao,
        confirmarPagamentoAutomatico,
        salvarEntregaPendente,
        criarPagamentoPix,
        iniciarVerificacaoStorm,
        processarWebhookStorm
    };
}

module.exports = { createPaymentService };
