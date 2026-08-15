const crypto = require('crypto');

function createStormWalletService({ CONFIG }) {
    const baseUrl = (CONFIG.STORM_WALLET_API_URL || 'https://wallet.stormapplications.com').replace(/\/$/, '');
    const apiKey = CONFIG.STORM_WALLET_API_KEY;

    function buildHeaders(extra = {}) {
        return {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            Authorization: `Bearer ${apiKey}`,
            ...extra
        };
    }

    async function request(path, options = {}) {
        if (!apiKey) {
            throw new Error('STORM_WALLET_API_KEY nao configurada no .env');
        }

        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: buildHeaders(options.headers || {})
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const details = Array.isArray(data.details)
                ? data.details.map((item) => `${item.field}: ${item.message}`).join('; ')
                : '';
            const message = data.error || `Erro Storm Wallet (${response.status})`;
            throw new Error(details ? `${message} (${details})` : message);
        }

        return data;
    }

    async function createCharge({ amount, value, description, payerName, payerDocument, externalId, metadata, customer }) {
        const payload = {
            amount: Number(amount ?? value),
            payerName: payerName || customer?.name || 'Cliente Discord',
            payerDocument: payerDocument || customer?.document || CONFIG.STORM_DEFAULT_PAYER_DOCUMENT || '52998224725',
            description: description || 'Pagamento via Discord'
        };

        if (externalId) {
            payload.externalId = String(externalId);
        }

        if (metadata) {
            payload.metadata = metadata;
        }

        const headers = {};
        if (payload.externalId) {
            headers['Idempotency-Key'] = payload.externalId;
        }

        const data = await request('/api/v1/payments/create', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!data.success || !data.data) {
            throw new Error(data.error || 'Resposta invalida ao criar cobranca PIX');
        }

        return normalizePayment(data.data);
    }

    async function verifyCharge(paymentId) {
        const data = await request(`/api/v1/payments/${encodeURIComponent(paymentId)}`, {
            method: 'GET'
        });

        if (!data.success || !data.data) {
            throw new Error(data.error || 'Pagamento nao encontrado');
        }

        return normalizePayment(data.data);
    }

    function normalizePayment(payment) {
        const qrCode = typeof payment.qrCode === 'string'
            ? payment.qrCode
            : payment.qrCode?.image || null;

        return {
            id: payment.id,
            externalId: payment.externalId || null,
            value: payment.amount,
            amount: payment.amount,
            status: payment.status,
            pixCode: payment.pixCode || null,
            qrCode,
            publicPaymentUrl: payment.publicPaymentUrl || null,
            completedAt: payment.completedAt || null
        };
    }

    function isChargePaid(charge) {
        const status = String(charge?.status || '').toUpperCase();
        const event = String(charge?.event || '').toLowerCase();
        const paidStatuses = new Set(['PAID', 'CONFIRMED', 'COMPLETED', 'COMPLETO']);

        return paidStatuses.has(status) || event === 'payment.completed';
    }

    function isChargeExpired(charge) {
        const status = String(charge?.status || '').toUpperCase();
        const event = String(charge?.event || '').toLowerCase();

        return status === 'FALHA' || status === 'EXPIRED' || status === 'CANCELLED' || event === 'payment.failed';
    }

    function qrImageToBuffer(qrImage) {
        if (!qrImage) {
            return null;
        }

        const base64 = String(qrImage).replace(/^data:image\/\w+;base64,/, '');
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
        const payment = payload?.data || payload?.charge || payload;

        if (payment && payload?.event) {
            payment.event = payload.event;
        }

        return payment;
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
