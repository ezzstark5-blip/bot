const crypto = require('crypto');

function gerarKey() {
    return crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
}

function gerarPedidoId() {
    return crypto.randomBytes(12).toString('hex');
}

function getPainelIdFromCarrinho(carrinho) {
    const produtoNome = (carrinho.produtoNome || '').toLowerCase();
    const plano = (carrinho.plano || '').toLowerCase();

    if (produtoNome.includes('external')) {
        return plano.includes('premium') ? 'external_premium' : 'external_advanced';
    }

    return plano.includes('premium') ? 'internal_premium' : 'internal_advanced';
}

async function addTopicMembers(thread, memberIds = [], skipIds = []) {
    const skip = new Set(skipIds);
    const ids = [...new Set(memberIds)].filter((id) => id && !skip.has(id));

    for (const memberId of ids) {
        try {
            await thread.members.add(memberId);
        } catch (error) {
            console.error(`Erro ao adicionar membro ${memberId} ao topico:`, error.message);
        }
    }
}

module.exports = {
    gerarKey,
    gerarPedidoId,
    getPainelIdFromCarrinho,
    addTopicMembers
};
