const crypto = require('crypto');

function createStormWalletService({ CONFIG }) {
    const baseUrl = (CONFIG.STORM_WALLET_API_URL || 'https://wallet.stormapplications.com').replace(/\/$/, '');
    const apiKey = CONFIG.STORM_WALLET_API_KEY;

    async function request(path, options = {}) {
        if (!apiKey) {
            throw new Error('STORM_WALLET_API_KEY nao configurada no .env');
        }

        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Erro Storm Wallet (${response.status})`);
        }

        return data;
    }

    async function createCharge({ value, description, expiresIn, customer }) {
        const payload = {
            value,
            description,
            expiresIn: expiresIn ?? CONFIG.TEMPO_PAGAMENTO_MINUTOS * 60
        };

        if (customer) {
            payload.customer = customer;
        }

        const data = await request('/api/flow-api/charge', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!data.success || !data.charge) {
            throw new Error(data.error || 'Resposta invalida ao criar cobranca PIX');
        }

        return data.charge;
    }

    async function verifyCharge(chargeId) {
        const data = await request(`/api/flow-api/charge/${encodeURIComponent(chargeId)}`, {
            method: 'GET'
        });

        if (!data.success || !data.charge) {
            throw new Error(data.error || 'Charge nao encontrada');
        }

        return data.charge;
    }

    function isChargePaid(charge) {
        const status = String(charge.status || '').toUpperCase();
        const pixStatus = String(charge.paymentMethods?.pix?.status || charge.pix?.status || '').toUpperCase();
        const paidStatuses = new Set(['PAID', 'CONFIRMED', 'COMPLETED']);

        return paidStatuses.has(status) || paidStatuses.has(pixStatus);
    }

    function isChargeExpired(charge) {
        const status = String(charge.status || '').toUpperCase();
        return status === 'EXPIRED' || status === 'CANCELLED';
    }

    function qrImageToBuffer(qrImage) {
        if (!qrImage) {
            return null;
        }

        const base64 = qrImage.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64, 'base64');
    }

    function verifyWebhookSignature(rawBody, signatureHeader) {
        const secret = CONFIG.STORM_WEBHOOK_SECRET;
        if (!secret || !signatureHeader) {
            return false;
        }

        const received = String(signatureHeader).replace(/^sha256=/i, '').trim();
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

        try {
            const receivedBuffer = Buffer.from(received, received.length === 64 ? 'hex' : 'utf8');
            const expectedBuffer = Buffer.from(expected, 'hex');

            if (receivedBuffer.length !== expectedBuffer.length) {
                return false;
            }

            return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
        } catch {
            return false;
        }
    }

    function extractChargeFromWebhook(payload) {
        return payload?.charge || payload?.data?.charge || payload?.data || payload;
    }

    return {
        createCharge,
        verifyCharge,
        isChargePaid,
        isChargeExpired,
        qrImageToBuffer,
        verifyWebhookSignature,
        extractChargeFromWebhook
    };
}

module.exports = { createStormWalletService };
