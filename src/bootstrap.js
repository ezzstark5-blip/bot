require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const dbMySQL = require('./database/db');
const CONFIG = require('./config');
const store = require('./state/store');
const helpers = require('./utils/helpers');
const { registrarLog, iniciarLogger } = require('./utils/logger');
const { enviarLog, enviarLogVenda } = require('./utils/discordLog');
const { loadCommands } = require('./utils/loadCommands');
const { registerSlashCommands } = require('./utils/registerSlashCommands');
const registroHandlers = require('./events/registroHandlers');
const { createAvaliacaoService } = require('./services/avaliacaoService');
const { createStormWalletService } = require('./services/stormWalletService');
const { createPaymentService } = require('./services/paymentService');
const { createButtonHandlers } = require('./events/vendas/buttonHandlers');
const { createSelectMenuHandlers } = require('./events/vendas/selectMenuHandlers');
const { createModalHandlers } = require('./events/vendas/modalHandlers');
const { registerInteractionHandlers } = require('./events/interactionCreate');
const { createExpressApp } = require('./server/createExpressApp');
const { iniciarPainelAdmin } = require('./web/server.js');

function start() {
    iniciarLogger();
    store.iniciarLimpezaTimestamps();

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    client.commands = new Collection();
    loadCommands(client);

    const avaliacaoService = createAvaliacaoService({ client, dbMySQL, CONFIG, registrarLog });
    const stormWalletService = createStormWalletService({ CONFIG });

    const paymentService = createPaymentService({
        client,
        dbMySQL,
        CONFIG,
        store,
        helpers,
        discordLog: { enviarLogVenda },
        avaliacaoService,
        registrarLog,
        stormWalletService
    });

    const buttonHandlers = createButtonHandlers({
        client,
        dbMySQL,
        CONFIG,
        store,
        paymentService,
        avaliacaoService
    });

    const selectMenuHandlers = createSelectMenuHandlers({
        client,
        dbMySQL,
        CONFIG,
        store,
        helpers
    });

    const modalHandlers = createModalHandlers({
        client,
        dbMySQL,
        CONFIG,
        store
    });

    const vendasHandlers = {
        handleButtonInteraction: buttonHandlers.handleButtonInteraction,
        handleSelectMenuInteraction: selectMenuHandlers.handleSelectMenuInteraction,
        handleModalInteraction: modalHandlers.handleModalInteraction
    };

    registerInteractionHandlers({
        client,
        dbMySQL,
        CONFIG,
        registrarLog,
        enviarLog,
        vendasHandlers,
        registroHandlers
    });

    const app = createExpressApp({
        client,
        dbMySQL,
        CONFIG,
        store,
        registrarLog,
        paymentService,
        stormWalletService
    });

    const PORT = process.env.PORT || 80;

    client.once('ready', async () => {
        console.log(`Bot online como ${client.user.tag}`);
        console.log('NEW BYPASS - Sistema de Vendas v2.1.0');

        try {
            await registerSlashCommands(client);
        } catch (error) {
            console.error('Erro ao registrar slash commands:', error.message);
        }

        iniciarPainelAdmin(dbMySQL, registrarLog, app);
    });

    client.login(process.env.TOKEN);

    app.listen(PORT, () => {
        console.log(`🚀 Servidor Web rodando na porta ${PORT}`);
        console.log('🔗 Webhook PIX: http://seu-dominio/webhook-pix');
        console.log('🔗 Webhook MacroDroid: http://seu-dominio/webhook-macrodroid');
        console.log('📊 Status: http://seu-dominio/health');
    });
}

module.exports = { start };
