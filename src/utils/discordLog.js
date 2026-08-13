const { buildContainer, buildPayload } = require('./componentsV2');
const CONFIG = require('../config');

async function enviarLog(client, titulo, descricao, cor = 0xffffff) {
    const canalLog = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!canalLog) return;

    await canalLog.send(buildPayload({
        container: buildContainer({
            title: titulo,
            description: descricao,
            color: cor,
            timestamp: true
        })
    })).catch(() => {});
}

async function enviarLogVenda(client, dados) {
    const canal = client.channels.cache.get(CONFIG.CANAL_LOGS_VENDAS);
    if (!canal) return;

    const getPainelColor = () => 0xffffff;

    const getPainelIcon = (painelId) => {
        if (!painelId) return '📦';
        const icons = {
            internal_premium: '👑',
            internal_advanced: '⭐',
            external_premium: '💎',
            external_advanced: '🚀'
        };
        return icons[painelId] || '📦';
    };

    const painelIcon = getPainelIcon(dados.painel_id);
    const painelColor = getPainelColor(dados.painel_id);
    const painelNome = dados.painel_id
        ? dados.painel_id.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
        : 'Não especificado';

    const fields = [
        { name: '👤 Comprador', value: `${dados.comprador.tag}\n\`${dados.comprador.id}\``, inline: true },
        { name: '📦 Produto', value: `${dados.produtoNome}\n**[${dados.plano.toUpperCase()}]**`, inline: true },
        { name: '🎯 Painel', value: `**${painelIcon} ${painelNome}**`, inline: true },
        { name: '💵 Valor Total', value: `**R$ ${dados.valorTotal.toFixed(2)}**`, inline: true },
        { name: '🔢 Quantidade', value: `${dados.quantidade}x`, inline: true },
        { name: '💳 Pagamento', value: dados.metodoPagamento, inline: true },
        { name: '🆔 Pedido', value: `\`${dados.pedidoId}\``, inline: true }
    ];

    if (dados.cupom) {
        fields.push({ name: '🎟️ Cupom', value: `${dados.cupom} (${dados.desconto}%)`, inline: true });
    }

    await canal.send(buildPayload({
        container: buildContainer({
            title: `${painelIcon} Nova Venda Realizada!`,
            color: painelColor,
            thumbnail: client.user.displayAvatarURL(),
            fields,
            footer: { text: 'NEW BYPASS - KeyAuth Panel' },
            timestamp: true
        })
    }));
}

module.exports = {
    enviarLog,
    enviarLogVenda
};
