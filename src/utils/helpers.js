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

async function gerarKeyUnica(dbMySQL, tentativasMax = 5, tableName = 'keys_table') {
    const safeTable = String(tableName).replace(/[^a-zA-Z0-9_-]/g, '') || 'keys_table';
    let tentativas = 0;

    while (tentativas < tentativasMax) {
        const key = gerarKey();
        const [existente] = await dbMySQL.query(
            `SELECT id FROM \`${safeTable}\` WHERE key_value = ? LIMIT 1`,
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

function resolveBotByPanelId(produto, carrinho = {}) {
    const slug = String(produto?.slug || carrinho.produtoSlug || '').toLowerCase();
    const nome = String(produto?.nome || carrinho.produtoNome || '').toLowerCase();

    const bySlug = {
        'external-advanced': 'external-advanced',
        'external-premium': 'external-premium',
        'internal-advanced': 'internal-advanced',
        'internal-premium': 'internal-premium',
        'hook-trick': 'du7',
        hooktrick: 'du7',
        du7: 'du7'
    };

    if (bySlug[slug]) {
        return bySlug[slug];
    }

    if (nome.includes('hook') || nome.includes('du7')) {
        return 'du7';
    }
    if (nome.includes('external') && nome.includes('premium')) {
        return 'external-premium';
    }
    if (nome.includes('external')) {
        return 'external-advanced';
    }
    if (nome.includes('internal') && nome.includes('premium')) {
        return 'internal-premium';
    }
    if (nome.includes('internal')) {
        return 'internal-advanced';
    }

    return null;
}

function getBotByKeyTableName(panelId) {
    if (!panelId) {
        return null;
    }
    return `keys_${panelId}`;
}

function planoParaDuracao(plano) {
    switch (String(plano || '').toLowerCase()) {
        case 'diario':
            return { isLifetime: 0, durationDays: 1 };
        case 'semanal':
            return { isLifetime: 0, durationDays: 7 };
        case 'mensal':
            return { isLifetime: 0, durationDays: 30 };
        case 'permanente':
            return { isLifetime: 1, durationDays: null };
        default:
            return { isLifetime: 1, durationDays: null };
    }
}

async function inserirKeysPainelBotBy(connection, keys, panelId, duracao) {
    const tableName = getBotByKeyTableName(panelId);
    if (!tableName) {
        throw new Error('Painel da key nao mapeado. Confira o slug do produto.');
    }

    const { isLifetime, durationDays } = duracao;
    for (const key of keys) {
        await connection.query(
            `INSERT INTO \`${tableName}\` (key_value, is_lifetime, duration_days, creator_avatar, panel_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                key,
                isLifetime ? 1 : 0,
                isLifetime ? null : durationDays,
                'https://cdn.discordapp.com/embed/avatars/0.png',
                panelId
            ]
        );
    }

    console.log(`✅ ${keys.length} key(s) inserida(s) em ${tableName}`);
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
    addTopicMembers,
    resolveBotByPanelId,
    getBotByKeyTableName,
    planoParaDuracao,
    inserirKeysPainelBotBy
};
