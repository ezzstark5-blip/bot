const { ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildContainer, ActionRowBuilder } = require('../../utils/componentsV2');

const REVISAO_PEDIDO_TITLE = '📋 Revisão do Pedido';

function buildRevisaoContainer({ client, CONFIG, carrinho, total, estoque, mentionUserId, actionRows = [] }) {
    const fields = [
        { name: '💰 Valor à vista', value: `**R$ ${total.toFixed(2)}**`, inline: true }
    ];

    if (estoque !== undefined) {
        fields.push({ name: '📦 Em estoque', value: `**${estoque}**`, inline: true });
    } else {
        fields.push({ name: '\u200B', value: '\u200B', inline: true });
    }

    fields.push(
        { name: '\u200B', value: '\u200B', inline: false },
        {
            name: '🛒 Carrinho',
            value: `**${carrinho.quantidade}x** ${carrinho.produtoNome} | **${carrinho.plano.toUpperCase()}** |\n**R$ ${total.toFixed(2)}**`,
            inline: false
        }
    );

    if (carrinho.cupom) {
        fields.push({
            name: '🎟️ Cupom Aplicado',
            value: `**${carrinho.cupom}** (${carrinho.desconto}% OFF)`,
            inline: false
        });
    }

    let description = 'Descrição do novo campo';
    if (mentionUserId) {
        description = `<@${mentionUserId}>\n\n${description}`;
    }

    return buildContainer({
        title: REVISAO_PEDIDO_TITLE,
        description,
        color: CONFIG.COR_EMBED_PRIMARIA,
        fields,
        thumbnail: client.user.displayAvatarURL(),
        footer: { text: 'NEW BYPASS' },
        timestamp: true,
        actionRows
    });
}

function buildRevisaoBotoes() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ir_pagamento')
                .setLabel('Ir para o Pagamento')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('editar_quantidade')
                .setLabel('Editar Quantidade')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('usar_cupom')
                .setLabel('Usar Cupom')
                .setEmoji('🎟️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cancelar_pedido')
                .setLabel('Cancelar')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        );
}

function calcularTotal(carrinho) {
    return (carrinho.preco * carrinho.quantidade) * (1 - carrinho.desconto / 100);
}

function isRevisaoPedidoMessage(message) {
    return message.components?.some((row) =>
        row.components?.some((component) => component.customId === 'ir_pagamento')
    );
}

module.exports = {
    REVISAO_PEDIDO_TITLE,
    buildRevisaoContainer,
    buildRevisaoBotoes,
    calcularTotal,
    isRevisaoPedidoMessage
};
