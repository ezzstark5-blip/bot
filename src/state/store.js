const carrinhos = new Map();
const mensagensCarrinho = new Map();
const timersExpiracao = new Map();
const stormPollers = new Map();
const comprovantesAguardando = new Map();
const processandoPagamentos = new Set();
const timestampsUsados = new Set();
const threadsPedidos = new Map();

function limparTimer(userId) {
    if (timersExpiracao.has(userId)) {
        clearTimeout(timersExpiracao.get(userId));
        timersExpiracao.delete(userId);
    }

    if (stormPollers.has(userId)) {
        clearInterval(stormPollers.get(userId));
        stormPollers.delete(userId);
    }
}

function iniciarLimpezaTimestamps() {
    setInterval(() => {
        const agora = Date.now();
        const limite = 10 * 60 * 1000;

        for (const ts of timestampsUsados) {
            if (agora - parseInt(ts, 10) > limite) {
                timestampsUsados.delete(ts);
            }
        }
    }, 10 * 60 * 1000);
}

module.exports = {
    carrinhos,
    mensagensCarrinho,
    timersExpiracao,
    stormPollers,
    comprovantesAguardando,
    processandoPagamentos,
    timestampsUsados,
    threadsPedidos,
    limparTimer,
    iniciarLimpezaTimestamps
};
