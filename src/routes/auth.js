const express = require('express');
const bcrypt = require('bcrypt');

function createAuthRoutes({ dbMySQL, CONFIG }) {
    const router = express.Router();

    async function notifyWebhook({ username, success, reason, ip }) {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            return;
        }

        const embed = {
            title: success ? 'Login aprovado' : 'Tentativa de login falhou',
            color: success ? 0x2ecc71 : 0xe74c3c,
            fields: [
                { name: 'Usuario', value: username || '(nao informado)', inline: true },
                { name: 'IP', value: ip || 'desconhecido', inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        if (!success && reason) {
            embed.fields.push({ name: 'Motivo', value: reason, inline: false });
        }

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });
        } catch (err) {
            console.error('Nao foi possivel enviar notificacao ao webhook:', err.message);
        }
    }

    function checkApiKey(req, res, next) {
        const key = req.header('x-api-key');
        const expected = process.env.API_KEY || CONFIG.API_KEY;

        if (!expected || !key || key !== expected) {
            return res.status(401).json({ success: false, message: 'API key invalida.' });
        }

        next();
    }

    router.post('/login', checkApiKey, async (req, res) => {
        try {
            const { username, password } = req.body;
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Usuario e senha sao obrigatorios.'
                });
            }

            const [rows] = await dbMySQL.query(
                'SELECT id, username, password FROM users WHERE username = ? LIMIT 1',
                [username]
            );

            if (rows.length === 0) {
                await notifyWebhook({ username, success: false, reason: 'Usuario nao encontrado', ip });
                return res.status(401).json({ success: false, message: 'Usuario ou senha incorretos.' });
            }

            const user = rows[0];
            const senhaCorreta = await bcrypt.compare(password, user.password);

            if (!senhaCorreta) {
                await notifyWebhook({ username, success: false, reason: 'Senha incorreta', ip });
                return res.status(401).json({ success: false, message: 'Usuario ou senha incorretos.' });
            }

            console.log('[LOGIN] Sucesso - "' + username + '" (IP: ' + ip + ')');
            await notifyWebhook({ username, success: true, ip });

            return res.status(200).json({
                success: true,
                message: 'Login realizado com sucesso.',
                user: { id: user.id, username: user.username }
            });
        } catch (err) {
            console.error('Erro no /api/login:', err);
            return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
        }
    });

    router.post('/validatekey', checkApiKey, async (req, res) => {
        try {
            const { key } = req.body;

            if (!key) {
                return res.status(400).json({ success: false, message: 'Key e obrigatoria.' });
            }

            const [rows] = await dbMySQL.query(
                'SELECT id FROM keys_table WHERE key_value = ? LIMIT 1',
                [key]
            );

            if (rows.length === 0) {
                return res.status(401).json({ success: false, message: 'Key invalida.' });
            }

            return res.status(200).json({ success: true, message: 'Key valida.' });
        } catch (err) {
            console.error('Erro no /api/validatekey:', err);
            return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
        }
    });

    router.get('/status', (req, res) => {
        res.json({ online: true, timestamp: new Date().toISOString() });
    });

    return router;
}

module.exports = { createAuthRoutes };