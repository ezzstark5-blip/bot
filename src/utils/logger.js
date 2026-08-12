const fs = require('fs').promises;
const fsSync = require('fs');
const CONFIG = require('../config');

let logQueue = [];

async function rotacionarLog() {
    try {
        const stats = await fs.stat(CONFIG.LOG_FILE).catch(() => null);
        if (!stats) return;

        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > CONFIG.MAX_LOG_SIZE_MB) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = `${CONFIG.LOG_DIR}/webhook-access-${timestamp}.log`;
            await fs.rename(CONFIG.LOG_FILE, backupFile);
            console.log(`Log rotacionado: ${backupFile}`);
        }
    } catch (error) {
        console.error('Erro ao rotacionar log:', error.message);
    }
}

async function flushLogs() {
    if (logQueue.length === 0) return;

    const linhas = [...logQueue];
    logQueue = [];

    try {
        if (!fsSync.existsSync(CONFIG.LOG_DIR)) {
            fsSync.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
        }
        await rotacionarLog();
        await fs.appendFile(CONFIG.LOG_FILE, linhas.join(''));
    } catch (error) {
        console.error('Erro ao gravar logs:', error.message);
        logQueue.unshift(...linhas);
    }
}

function registrarLog(tipo, dados) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${tipo}] ${JSON.stringify(dados)}\n`;

    const emoji = {
        SUCESSO: '✅',
        FALHA_SIGNATURE: '🔒',
        FALHA_TIMESTAMP: '⏰',
        NAO_ENCONTRADO: '🔍',
        ERRO: '❌',
        HWID_RESET: '🔄',
        MACRODROID: '📱'
    };

    console.log(`${emoji[tipo] || '📝'} ${tipo}: ${JSON.stringify(dados)}`);
    logQueue.push(logLine);

    if (logQueue.length >= 10) {
        flushLogs();
    }
}

function iniciarLogger() {
    if (!fsSync.existsSync(CONFIG.LOG_DIR)) {
        fsSync.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
    }

    setInterval(flushLogs, 5000);

    process.on('SIGINT', async () => {
        await flushLogs();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await flushLogs();
        process.exit(0);
    });
}

module.exports = {
    registrarLog,
    flushLogs,
    iniciarLogger
};
