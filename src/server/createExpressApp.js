const express = require('express');
const crypto = require('crypto');
const { createAuthRoutes } = require('../routes/auth');

function createExpressApp({ client, dbMySQL, CONFIG, store, registrarLog, paymentService, stormWalletService }) {
    const app = express();
    const { carrinhos, timestampsUsados } = store;

    app.post(CONFIG.STORM_WEBHOOK_PATH, express.raw({ type: 'application/json' }), async (req, res) => {
        try {
            const rawBody = req.body?.toString('utf8') || '';
            const signature = req.headers['x-storm-signature'];

            if (CONFIG.STORM_WEBHOOK_SECRET && !stormWalletService.verifyWebhookSignature(rawBody, signature)) {
                registrarLog('STORM_WEBHOOK', { motivo: 'Assinatura invalida', ip: req.ip });
                return res.status(401).json({ success: false, error: 'Assinatura invalida' });
            }

            let payload = {};
            try {
                payload = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                return res.status(400).json({ success: false, error: 'JSON invalido' });
            }

            res.status(200).json({ success: true, received: true });

            setImmediate(async () => {
                try {
                    await paymentService.processarWebhookStorm(payload);
                } catch (error) {
                    console.error('❌ Erro ao processar webhook Storm:', error.message);
                }
            });
        } catch (error) {
            console.error('❌ Erro no webhook Storm:', error.message);
            res.status(500).json({ success: false, error: 'Erro interno' });
        }
    });

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use('/api', createAuthRoutes({ dbMySQL, CONFIG }));

    app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
        next();
    });

    const rateLimitMap = new Map();
    const RATE_LIMIT_WINDOW = 60000;
    const RATE_LIMIT_MAX = 100;

    app.use((req, res, next) => {
        const ip = req.ip;
        const now = Date.now();

        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
            return next();
        }

        const record = rateLimitMap.get(ip);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + RATE_LIMIT_WINDOW;
            return next();
        }

        if (record.count >= RATE_LIMIT_MAX) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit excedido. Tente novamente em 1 minuto.',
                timestamp: new Date().toISOString()
            });
        }

        record.count++;
        next();
    });

    setInterval(() => {
        const now = Date.now();
        for (const [ip, record] of rateLimitMap.entries()) {
            if (now > record.resetTime) {
                rateLimitMap.delete(ip);
            }
        }
    }, RATE_LIMIT_WINDOW);

    app.post('/', async (req, res) => {
        res.status(410).json({
            success: false,
            message: 'Endpoint descontinuado. Use POST /api/login com x-api-key.'
        });
    });

    app.get('/', (req, res) => {
        res.json({
            status: 'online',
            bot: client.user?.tag || 'iniciando',
            version: '2.1.0-NEW',
            endpoints: {
                login: '/api/login',
                validateKey: '/api/validatekey',
                status: '/api/status',
                webhook: '/webhook-pix',
                stormWebhook: CONFIG.STORM_WEBHOOK_PATH,
                macrodroid: '/webhook-macrodroid',
                health: '/health',
                stats: '/stats'
            },
            baseUrl: CONFIG.BASE_URL,
            timestamp: new Date().toISOString()
        });
    });

    app.get('/health', (req, res) => {
        res.json({
            status: 'online',
            bot: client.user?.tag || 'iniciando',
            uptime: process.uptime(),
            memory: {
                used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`
            },
            timestamp: new Date().toISOString()
        });
    });

    app.get('/stats', async (req, res) => {
        try {
            const [vendas] = await dbMySQL.query(
                'SELECT COUNT(*) as total, SUM(valor_total) as receita FROM vendas WHERE DATE(created_at) = CURDATE()'
            );

            res.json({
                vendas_hoje: vendas[0].total || 0,
                receita_hoje: `R$ ${(vendas[0].receita || 0).toFixed(2)}`,
                carrinhos_ativos: carrinhos.size,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
    });

    app.post('/webhook-macrodroid', async (req, res) => {
        const startTime = Date.now();

        try {
            const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

            if (!apiKey || apiKey !== CONFIG.MACRODROID_API_KEY) {
                registrarLog('MACRODROID', {
                    motivo: 'API Key inválida',
                    ip: req.ip,
                    headers: { ...req.headers, 'x-api-key': '[REDACTED]' }
                });
                return res.status(401).json({
                    success: false,
                    error: 'API Key inválida',
                    timestamp: new Date().toISOString()
                });
            }

            const { valor, identificador, nomeCliente } = req.body;

            if (!valor || !identificador) {
                registrarLog('MACRODROID', {
                    motivo: 'Dados incompletos',
                    ip: req.ip,
                    body: req.body
                });
                return res.status(400).json({
                    success: false,
                    error: 'Dados incompletos (valor e identificador são obrigatórios)',
                    timestamp: new Date().toISOString()
                });
            }

            registrarLog('MACRODROID', {
                motivo: 'Requisição recebida',
                ip: req.ip,
                valor,
                identificador: identificador.substring(0, 8) + '...',
                tempo_validacao_ms: Date.now() - startTime
            });

            const resultado = await paymentService.processarPagamentoWebhook(valor, identificador, nomeCliente);

            if (resultado.sucesso) {
                return res.status(200).json({
                    success: true,
                    message: 'Pagamento processado com sucesso',
                    data: {
                        pedidoId: resultado.pedidoId,
                        usuario: resultado.username,
                        tempo_processamento_ms: Date.now() - startTime
                    },
                    timestamp: new Date().toISOString()
                });
            }

            registrarLog('MACRODROID', {
                motivo: 'Carrinho não encontrado',
                valor,
                identificador: identificador.substring(0, 8) + '...'
            });
            return res.status(200).json({
                success: false,
                message: resultado.erro || 'Carrinho não encontrado',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            registrarLog('MACRODROID', {
                motivo: 'Erro interno',
                ip: req.ip,
                erro: error.message
            });
            console.error('❌ Erro no webhook MacroDroid:', error);
            res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                timestamp: new Date().toISOString()
            });
        }
    });

    app.post('/webhook-pix', async (req, res) => {
        const startTime = Date.now();

        try {
            const { valor, identificador, secret, timestamp, signature, nomeCliente } = req.body;

            if (!valor || !identificador) {
                registrarLog('ERRO', {
                    motivo: 'Dados incompletos',
                    ip: req.ip,
                    body: { ...req.body, secret: '[REDACTED]' }
                });
                return res.status(400).json({
                    success: false,
                    error: 'Dados incompletos',
                    timestamp: new Date().toISOString()
                });
            }

            if (secret) {
                const secretBuffer = Buffer.from(secret);
                const expectedBuffer = Buffer.from(CONFIG.WEBHOOK_SECRET);

                if (secretBuffer.length !== expectedBuffer.length ||
                    !crypto.timingSafeEqual(secretBuffer, expectedBuffer)) {
                    registrarLog('FALHA_SIGNATURE', {
                        motivo: 'Secret inválido',
                        ip: req.ip,
                        valor,
                        identificador
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'Acesso negado',
                        timestamp: new Date().toISOString()
                    });
                }
            }

            if (signature && timestamp) {
                const requestTime = parseInt(timestamp, 10);
                const now = Date.now();
                const diferenca = Math.abs(now - requestTime);

                if (diferenca > 5 * 60 * 1000) {
                    registrarLog('FALHA_TIMESTAMP', {
                        motivo: 'Timestamp expirado',
                        ip: req.ip,
                        valor,
                        identificador
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'Requisição expirada',
                        timestamp: new Date().toISOString()
                    });
                }

                if (timestampsUsados.has(timestamp.toString())) {
                    registrarLog('FALHA_TIMESTAMP', {
                        motivo: 'Replay attack detectado',
                        ip: req.ip,
                        timestamp
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'Requisição duplicada',
                        timestamp: new Date().toISOString()
                    });
                }

                const expectedSignature = crypto
                    .createHmac('sha256', CONFIG.WEBHOOK_HMAC_KEY)
                    .update(`${valor}|${identificador}|${timestamp}`)
                    .digest('hex');

                const signatureBuffer = Buffer.from(signature, 'hex');
                const expectedBuffer = Buffer.from(expectedSignature, 'hex');

                if (signatureBuffer.length !== expectedBuffer.length ||
                    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
                    registrarLog('FALHA_SIGNATURE', {
                        motivo: 'HMAC inválido',
                        ip: req.ip,
                        valor,
                        identificador
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'Assinatura inválida',
                        timestamp: new Date().toISOString()
                    });
                }

                timestampsUsados.add(timestamp.toString());
            }

            registrarLog('SUCESSO', {
                motivo: 'Webhook recebido',
                ip: req.ip,
                valor,
                identificador,
                tempo_validacao_ms: Date.now() - startTime
            });

            const resultado = await paymentService.processarPagamentoWebhook(valor, identificador, nomeCliente);

            if (resultado.sucesso) {
                return res.status(200).json({
                    success: true,
                    message: 'Pagamento processado',
                    data: {
                        pedidoId: resultado.pedidoId,
                        usuario: resultado.username,
                        tempo_processamento_ms: Date.now() - startTime
                    },
                    timestamp: new Date().toISOString()
                });
            }

            registrarLog('NAO_ENCONTRADO', {
                motivo: 'Carrinho não encontrado',
                valor,
                identificador
            });
            return res.status(200).json({
                success: false,
                message: resultado.erro || 'Carrinho não encontrado',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            registrarLog('ERRO', {
                motivo: 'Erro interno',
                ip: req.ip,
                erro: error.message
            });
            console.error('❌ Erro no webhook:', error);
            res.status(500).json({
                success: false,
                error: 'Erro interno',
                timestamp: new Date().toISOString()
            });
        }
    });

    return app;
}

module.exports = { createExpressApp };
