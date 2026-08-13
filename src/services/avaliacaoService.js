const { ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildContainer, buildPayload, buildWebhookPayload, ActionRowBuilder } = require('../utils/componentsV2');

function createAvaliacaoService({ client, dbMySQL, CONFIG, registrarLog }) {
    async function enviarAvaliacaoPosEntrega(user, carrinho, keys, channel = null) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const botoesAvaliacao = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`avaliacao_ruim_${carrinho.pedidoId}`)
                        .setLabel('🔴 Ruim :(')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`avaliacao_mediano_${carrinho.pedidoId}`)
                        .setLabel('⚪ Mediano')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`avaliacao_muito_bom_${carrinho.pedidoId}`)
                        .setLabel('🔵 Muito Bom!')
                        .setStyle(ButtonStyle.Primary)
                );

            const mensagemAvaliacao = buildPayload({
                container: buildContainer({
                    title: '⭐ Como foi sua experiência?',
                    description: 'Sua opinião é muito importante para nós! Avalie nosso serviço:',
                    color: 0xffffff,
                    fields: [
                        {
                            name: '📦 Produto Avaliado',
                            value: `**${carrinho.quantidade}x** ${carrinho.produtoNome}\n**Plano:** ${carrinho.plano.toUpperCase()}`,
                            inline: false
                        },
                        {
                            name: '🆔 Pedido',
                            value: `\`${carrinho.pedidoId}\``,
                            inline: false
                        }
                    ],
                    thumbnail: client.user.displayAvatarURL(),
                    footer: { text: 'NEW BYPASS - Avaliação' },
                    timestamp: true,
                    actionRows: [botoesAvaliacao]
                })
            });

            if (channel) {
                await channel.send(mensagemAvaliacao);
                console.log(`✅ Avaliação enviada na thread para ${user.username}`);
            } else {
                await user.send(mensagemAvaliacao);
                console.log(`✅ Avaliação enviada via DM para ${user.username}`);
            }

            if (!global.avaliacoesPendentes) {
                global.avaliacoesPendentes = new Map();
            }

            global.avaliacoesPendentes.set(carrinho.pedidoId, {
                userId: user.id,
                userTag: user.tag,
                produtoId: carrinho.produtoId,
                produtoNome: carrinho.produtoNome,
                plano: carrinho.plano,
                quantidade: carrinho.quantidade,
                keys,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('❌ Erro ao enviar avaliação:', error.message);
        }
    }

    async function enviarWebhookAvaliacaoDiscord(avaliacaoData) {
        try {
            const webhookUrl = process.env.DISCORD_AVALIACOES_WEBHOOK;
            if (!webhookUrl) {
                console.log('⚠️ Webhook de avaliações não configurado');
                return;
            }

            const tipoConfig = {
                ruim: { emoji: '🔴', cor: 0xffffff, nome: 'Ruim :(' },
                mediano: { emoji: '⚪', cor: 0xffffff, nome: 'Mediano' },
                muito_bom: { emoji: '🔵', cor: 0xffffff, nome: 'Muito Bom!' }
            };

            const config = tipoConfig[avaliacaoData.tipo_avaliacao];

            const fields = [
                {
                    name: '👤 Cliente',
                    value: `**${avaliacaoData.usuario_nome}** (ID: ${avaliacaoData.usuario_id})`,
                    inline: true
                },
                {
                    name: '📦 Produto',
                    value: `**${avaliacaoData.produto_nome}**`,
                    inline: true
                },
                {
                    name: '🎯 Avaliação',
                    value: `${config.emoji} **${config.nome}**`,
                    inline: true
                },
                {
                    name: '🆔 Pedido',
                    value: `#${avaliacaoData.pedido_id}`,
                    inline: true
                }
            ];

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buildWebhookPayload({
                    container: buildContainer({
                        title: `${config.emoji} Nova Avaliação Recebida`,
                        color: config.cor,
                        fields,
                        footer: { text: 'NEW BYPASS - Sistema de Avaliações' },
                        timestamp: avaliacaoData.data_avaliacao,
                        thumbnail: client.user.displayAvatarURL()
                    }),
                    username: 'NEW Avaliações',
                    avatar_url: client.user.displayAvatarURL()
                }))
            });

            if (response.ok) {
                console.log(`✅ Webhook de avaliação enviado para ${avaliacaoData.usuario_nome}`);
            } else {
                console.error('❌ Erro ao enviar webhook:', await response.text());
            }
        } catch (error) {
            console.error('❌ Erro ao enviar webhook de avaliação:', error);
        }
    }

    async function handleAvaliacaoButtons(interaction) {
        const customId = interaction.customId;

        if (!customId.startsWith('avaliacao_')) return;

        const [, tipoAvaliacao, pedidoId] = customId.split('_');
        const dadosAvaliacao = global.avaliacoesPendentes?.get(pedidoId);

        if (!dadosAvaliacao) {
            return await interaction.reply(buildPayload({
                container: buildContainer({ description: '❌ Avaliação não encontrada ou expirada!', color: 0xffffff }),
                ephemeral: true
            }));
        }

        try {
            const [existente] = await dbMySQL.query(
                'SELECT id FROM avaliacoes WHERE usuario_id = ? AND pedido_id = ?',
                [dadosAvaliacao.userId, pedidoId]
            );

            if (existente.length > 0) {
                return await interaction.reply(buildPayload({
                    container: buildContainer({ description: '❌ Você já avaliou este pedido!', color: 0xffffff }),
                    ephemeral: true
                }));
            }
        } catch (error) {
            console.error('Erro ao verificar avaliação existente:', error);
        }

        await interaction.deferUpdate();

        const tipoMap = {
            ruim: 'ruim',
            mediano: 'mediano',
            muito: 'muito_bom'
        };

        const tipoFinal = tipoMap[tipoAvaliacao] || 'mediano';

        try {
            await dbMySQL.query(`
                INSERT INTO avaliacoes (usuario_id, produto_id, pedido_id, tipo_avaliacao, data_avaliacao)
                VALUES (?, ?, ?, ?, NOW())
            `, [
                dadosAvaliacao.userId,
                dadosAvaliacao.produtoId,
                pedidoId,
                tipoFinal
            ]);

            await enviarWebhookAvaliacaoDiscord({
                usuario_nome: dadosAvaliacao.userTag,
                usuario_id: dadosAvaliacao.userId,
                produto_id: dadosAvaliacao.produtoId,
                produto_nome: dadosAvaliacao.produtoNome,
                pedido_id: pedidoId,
                tipo_avaliacao: tipoFinal,
                data_avaliacao: new Date().toISOString()
            });

            const emojiMap = {
                ruim: '🔴',
                mediano: '⚪',
                muito_bom: '🔵'
            };

            const textoMap = {
                ruim: 'Ruim :(',
                mediano: 'Mediano',
                muito_bom: 'Muito Bom!'
            };

            await interaction.followUp(buildPayload({
                container: buildContainer({
                    title: `${emojiMap[tipoFinal]} Avaliação Registrada!`,
                    description: `Obrigado por avaliar nosso serviço como **${textoMap[tipoFinal]}**!`,
                    color: 0xffffff,
                    footer: { text: 'NEW BYPASS - Obrigado pelo feedback!' },
                    timestamp: true
                }),
                ephemeral: true
            }));

            global.avaliacoesPendentes.delete(pedidoId);

            console.log(`✅ Avaliação registrada: ${dadosAvaliacao.userTag} - ${textoMap[tipoFinal]}`);
        } catch (error) {
            console.error('❌ Erro ao registrar avaliação:', error);

            await interaction.followUp(buildPayload({
                container: buildContainer({
                    description: '❌ Erro ao registrar sua avaliação. Tente novamente.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }

    return {
        enviarAvaliacaoPosEntrega,
        handleAvaliacaoButtons,
        enviarWebhookAvaliacaoDiscord
    };
}

module.exports = { createAvaliacaoService };
