const crypto = require('crypto');

function gerarBlocoKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let bloco = '';
    const bytes = crypto.randomBytes(4);

    for (let i = 0; i < 4; i++) {
        bloco += chars[bytes[i] % chars.length];
    }

    return bloco;
}

function gerarKey() {
    return [gerarBlocoKey(), gerarBlocoKey(), gerarBlocoKey(), gerarBlocoKey()].join('-');
}

async function gerarKeyUnica(dbMySQL, tentativasMax = 5) {
    let tentativas = 0;

    while (tentativas < tentativasMax) {
        const key = gerarKey();
        const [existente] = await dbMySQL.query(
            'SELECT id FROM keys_table WHERE key_value = ? LIMIT 1',
            [key]
        );

        if (existente.length === 0) {
            return key;
        }

        tentativas++;
    }

    throw new Error('Nao foi possivel gerar key unica');
}

async function inserirKeysTable(connection, keys) {
    for (const key of keys) {
        await connection.query(
            'INSERT INTO keys_table (key_value) VALUES (?)',
            [key]
        );
    }
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
    gerarKeyUnica,
    inserirKeysTable,
    gerarPedidoId,
    getPainelIdFromCarrinho,
    addTopicMembers
};
