const path = require('path');

const CONFIG = {
    CANAL_LOGS_VENDAS: '1461889488376303855',
    CANAL_VENDAS: process.env.CANAL_VENDAS || '1234567890',
    TOPIC_MEMBERS: [
        '1503506610201428087',
        '1376246337309376612'
    ],
    TEMPO_PAGAMENTO_MINUTOS: 10,
    COOLDOWN_RESET_HWID_DIAS: 7,
    MAX_LOG_SIZE_MB: 50,
    COR_EMBED_PRIMARIA: 0xffffff,
    COR_EMBED_SUCESSO: 0xffffff,
    COR_EMBED_ERRO: 0xffffff,
    COR_EMBED_AVISO: 0xffffff,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    WEBHOOK_HMAC_KEY: process.env.WEBHOOK_HMAC_KEY,
    MACRODROID_API_KEY: process.env.MACRODROID_API_KEY || 'sua-api-key-super-secreta-aqui',
    LOG_DIR: path.join(__dirname, '..', '..', 'logs'),
    LOG_FILE: path.join(__dirname, '..', '..', 'logs', 'webhook-access.log'),
    CHAVE_PIX: process.env.CHAVE_PIX || 'sua@chave.pix',
    STORM_WALLET_API_URL: process.env.STORM_WALLET_API_URL || 'https://wallet.stormapplications.com',
    STORM_WALLET_API_KEY: process.env.STORM_WALLET_API_KEY || process.env.STORM_API_KEY || '',
    STORM_WEBHOOK_SECRET: process.env.STORM_WEBHOOK_SECRET || '',
    STORM_WEBHOOK_PATH: process.env.STORM_WEBHOOK_PATH || '/webhooks/storm-x7k9m2p4q8w3n6r1v5t0',
    BASE_URL: process.env.BASE_URL || 'https://bot-9e38.onrender.com'
};

module.exports = CONFIG;
