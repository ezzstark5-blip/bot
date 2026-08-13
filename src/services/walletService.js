function createWalletService({ dbMySQL }) {
    async function garantirCarteira(connection, discordId) {
        await connection.query(
            'INSERT IGNORE INTO carteiras (discord_id, saldo) VALUES (?, 0.00)',
            [discordId]
        );
    }

    async function obterSaldo(discordId) {
        await dbMySQL.query(
            'INSERT IGNORE INTO carteiras (discord_id, saldo) VALUES (?, 0.00)',
            [discordId]
        );

        const [rows] = await dbMySQL.query(
            'SELECT saldo FROM carteiras WHERE discord_id = ? LIMIT 1',
            [discordId]
        );

        return parseFloat(rows[0]?.saldo || 0);
    }

    async function adicionarSaldo(discordId, valor, adminId, descricao = 'Credito manual') {
        const amount = parseFloat(valor);

        if (isNaN(amount) || amount <= 0) {
            throw new Error('Valor invalido');
        }

        const connection = await dbMySQL.getConnection();

        try {
            await connection.beginTransaction();
            await garantirCarteira(connection, discordId);

            const [rows] = await connection.query(
                'SELECT saldo FROM carteiras WHERE discord_id = ? FOR UPDATE',
                [discordId]
            );

            const saldoAtual = parseFloat(rows[0].saldo);
            const saldoApos = saldoAtual + amount;

            await connection.query(
                'UPDATE carteiras SET saldo = ? WHERE discord_id = ?',
                [saldoApos, discordId]
            );

            await connection.query(`
                INSERT INTO carteira_transacoes
                (discord_id, tipo, valor, saldo_apos, descricao, admin_id)
                VALUES (?, 'credito', ?, ?, ?, ?)
            `, [discordId, amount, saldoApos, descricao, adminId]);

            await connection.commit();
            return saldoApos;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async function debitarNaTransacao(connection, discordId, valor, pedidoId, descricao) {
        const amount = parseFloat(valor);

        if (isNaN(amount) || amount <= 0) {
            throw new Error('Valor invalido para debito');
        }

        await garantirCarteira(connection, discordId);

        const [rows] = await connection.query(
            'SELECT saldo FROM carteiras WHERE discord_id = ? FOR UPDATE',
            [discordId]
        );

        const saldoAtual = parseFloat(rows[0]?.saldo || 0);

        if (saldoAtual < amount) {
            throw new Error('Saldo insuficiente na carteira');
        }

        const saldoApos = saldoAtual - amount;

        await connection.query(
            'UPDATE carteiras SET saldo = ? WHERE discord_id = ?',
            [saldoApos, discordId]
        );

        await connection.query(`
            INSERT INTO carteira_transacoes
            (discord_id, tipo, valor, saldo_apos, pedido_id, descricao)
            VALUES (?, 'debito', ?, ?, ?, ?)
        `, [discordId, amount, saldoApos, pedidoId, descricao]);

        return saldoApos;
    }

    return {
        obterSaldo,
        adicionarSaldo,
        debitarNaTransacao
    };
}

module.exports = { createWalletService };