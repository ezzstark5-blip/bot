const { buildContainer, buildPayload } = require('./componentsV2');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProcessandoPayload(CONFIG, client, segundos) {
    return buildPayload({
        container: buildContainer({
            title: '✅ Pagamento aprovado!',
            description: 'Processando pagamento...\n\n⏱️ **' + segundos + '**',
            color: CONFIG.COR_EMBED_AVISO,
            thumbnail: client.user.displayAvatarURL(),
            footer: { text: 'NEW BYPASS' },
            timestamp: true
        })
    });
}

async function executarCountdown(segundosInicial, onTick) {
    for (let s = segundosInicial; s >= 1; s--) {
        await onTick(s);
        await sleep(1000);
    }
}

async function executarCountdownEphemeral(interaction, CONFIG, client, segundosInicial = 5) {
    await executarCountdown(segundosInicial, async (s) => {
        await interaction.editReply(buildProcessandoPayload(CONFIG, client, s));
    });
}

async function executarCountdownTopico(thread, CONFIG, client, mensagemRef, segundosInicial = 5) {
    let loadingMsg = mensagemRef;

    await executarCountdown(segundosInicial, async (s) => {
        const payload = buildProcessandoPayload(CONFIG, client, s);
        if (loadingMsg) {
            await loadingMsg.edit(payload);
        } else {
            loadingMsg = await thread.send(payload);
        }
    });

    return loadingMsg;
}

async function limparMensagensBotTopico(thread, clientUserId, manterId = null) {
    const mensagens = await thread.messages.fetch({ limit: 100 });

    for (const mensagem of mensagens.values()) {
        if (mensagem.author.id !== clientUserId) {
            continue;
        }

        if (manterId && mensagem.id === manterId) {
            continue;
        }

        await mensagem.delete().catch(() => {});
    }
}

module.exports = {
    sleep,
    buildProcessandoPayload,
    executarCountdown,
    executarCountdownEphemeral,
    executarCountdownTopico,
    limparMensagensBotTopico
};