const { buildContainer, buildPayload, buildWebhookPayload } = require('./componentsV2');
const CONFIG = require('../config');

async function enviarWebhookDiscord(webhookUrl, body) {
    if (!webhookUrl) {
        return false;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            console.error('Erro ao enviar webhook Discord:', await response.text());
            return false;
        }

        return true;
    } catch (error) {
        console.error('Erro ao enviar webhook Discord:', error.message);
        return false;
    }
}

async function enviarWebhookLog(webhookUrl, client, options) {
    const { title, description, fields, color, footer } = options;

    return enviarWebhookDiscord(webhookUrl, buildWebhookPayload({
        container: buildContainer({
            title,
            description,
            fields,
            color: color ?? 0xffffff,
            thumbnail: client?.user?.displayAvatarURL?.() ?? null,
            footer: footer ?? { text: 'NEW BYPASS' },
            timestamp: true
        }),
        username: options.username || 'NEW BYPASS Logs',
        avatar_url: client?.user?.displayAvatarURL?.() ?? undefined
    }));
}

async function enviarLog(client, titulo, descricao, cor = 0xffffff) {
    const canalLog = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (canalLog) {
        await canalLog.send(buildPayload({
            container: buildContainer({
                title: titulo,
                description: descricao,
                color: cor,
                timestamp: true
            })
        })).catch(() => {});
    }
}

async function enviarLogPagamento(client, dados) {
    const painelIcon = getPainelIcon(dados.painel_id);
    const painelNome = dados.painel_id
        ? dados.painel_id.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
        : 'Nao especificado';

    const fields = [
        { name: 'Comprador', value: `${dados.comprador.tag}\n\`${dados.comprador.id}\``, inline: true },
        { name: 'Produto', value: `${dados.produtoNome}\n**[${dados.plano.toUpperCase()}]**`, inline: true },
        { name: 'Painel', value: `**${painelIcon} ${painelNome}**`, inline: true },
        { name: 'Valor Total', value: `**R$ ${dados.valorTotal.toFixed(2)}**`, inline: true },
        { name: 'Quantidade', value: `${dados.quantidade}x`, inline: true },
        { name: 'Pagamento', value: dados.metodoPagamento, inline: true },
        { name: 'Pedido', value: `\`${dados.pedidoId}\``, inline: true }
    ];

    if (dados.cupom) {
        fields.push({ name: 'Cupom', value: `${dados.cupom} (${dados.desconto}%)`, inline: true });
    }

    await enviarWebhookLog(CONFIG.WEBHOOK_LOG_PAGAMENTOS, client, {
        title: `${painelIcon} Pagamento Confirmado`,
        description: 'Uma venda foi concluida com sucesso.',
        fields,
        color: 0xffffff,
        footer: { text: 'NEW BYPASS - Pagamentos' },
        username: 'NEW Pagamentos'
    });

    const canal = client.channels.cache.get(CONFIG.CANAL_LOGS_VENDAS);
    if (canal) {
        await canal.send(buildPayload({
            container: buildContainer({
                title: `${painelIcon} Nova Venda Realizada!`,
                color: 0xffffff,
                thumbnail: client.user.displayAvatarURL(),
                fields,
                footer: { text: 'NEW BYPASS - KeyAuth Panel' },
                timestamp: true
            })
        })).catch(() => {});
    }
}

async function enviarLogCarrinho(client, evento, dados) {
    const eventos = {
        criado: { title: 'Carrinho Criado', color: 0xffffff },
        pix_gerado: { title: 'PIX Gerado', color: 0xffffff },
        cancelado: { title: 'Carrinho Cancelado', color: 0xffffff },
        expirado: { title: 'Carrinho Expirado', color: 0xffffff }
    };

    const config = eventos[evento] || { title: 'Evento de Carrinho', color: 0xffffff };
    const carrinho = dados.carrinho || {};
    const user = dados.user;

    const fields = [
        { name: 'Cliente', value: user ? `${user.tag}\n\`${user.id}\`` : 'Desconhecido', inline: true },
        { name: 'Pedido', value: `\`${carrinho.pedidoId || dados.pedidoId || 'N/A'}\``, inline: true },
        { name: 'Evento', value: config.title, inline: true }
    ];

    if (carrinho.produtoNome) {
        fields.push({ name: 'Produto', value: `${carrinho.quantidade || 1}x **${carrinho.produtoNome}**`, inline: true });
    }

    if (carrinho.plano) {
        fields.push({ name: 'Plano', value: `**${carrinho.plano.toUpperCase()}**`, inline: true });
    }

    if (dados.total != null) {
        fields.push({ name: 'Valor', value: `**R$ ${Number(dados.total).toFixed(2)}**`, inline: true });
    }

    if (dados.threadId) {
        fields.push({ name: 'Topico', value: `<#${dados.threadId}>`, inline: false });
    }

    await enviarWebhookLog(CONFIG.WEBHOOK_LOG_CARRINHOS, client, {
        title: config.title,
        description: dados.descricao || null,
        fields,
        color: config.color,
        footer: { text: 'NEW BYPASS - Carrinhos' },
        username: 'NEW Carrinhos'
    });
}

async function enviarLogStock(client, dados) {
    const fields = [
        { name: 'Produto', value: `**${dados.produtoNome}**`, inline: true },
        { name: 'Plano', value: `**${(dados.plano || '').toUpperCase()}**`, inline: true },
        { name: 'Alteracao', value: `-${dados.quantidade}`, inline: true },
        { name: 'Estoque anterior', value: `${dados.estoqueAnterior}`, inline: true },
        { name: 'Estoque atual', value: `${dados.estoqueAtual}`, inline: true },
        { name: 'Pedido', value: `\`${dados.pedidoId}\``, inline: true }
    ];

    if (dados.comprador) {
        fields.push({ name: 'Comprador', value: `${dados.comprador.tag}`, inline: false });
    }

    await enviarWebhookLog(CONFIG.WEBHOOK_LOG_STOCK, client, {
        title: 'Estoque Atualizado',
        description: 'Baixa de estoque apos pagamento confirmado.',
        fields,
        color: dados.estoqueAtual <= 3 ? 0xffffff : 0xffffff,
        footer: { text: 'NEW BYPASS - Stock' },
        username: 'NEW Stock'
    });
}

function getPainelIcon(painelId) {
    if (!painelId) return '📦';
    const icons = {
        internal_premium: '👑',
        internal_advanced: '⭐',
        external_premium: '💎',
        external_advanced: '🚀'
    };
    return icons[painelId] || '📦';
}

async function enviarLogVenda(client, dados) {
    return enviarLogPagamento(client, dados);
}

module.exports = {
    enviarLog,
    enviarLogVenda,
    enviarLogPagamento,
    enviarLogCarrinho,
    enviarLogStock
};
