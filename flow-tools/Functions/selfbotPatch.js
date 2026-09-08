/**
 * Proteção contra crash GuildJoinRequest (form_responses null).
 * O arquivo em node_modules já está patchado; daqui só:
 * 1) revalida o arquivo
 * 2) process guards (não mata o bot)
 */
const fs = require('fs');
const path = require('path');

// A implementação nativa do DAVE pode falhar em contêineres Linux reduzidos.
// Força o backend WASI oficial antes de qualquer importação do selfbot.
process.env.NAPI_RS_FORCE_WASI = '1';
process.env.NAPI_RS_NATIVE_LIBRARY_PATH = path.join(__dirname, '__flow_force_wasi__.node');

function applySelfbotPatch() {
  try {
    const candidates = [
      path.join(__dirname, '..', 'node_modules', 'djs-selfbot-v13', 'src', 'structures', 'GuildJoinRequest.js'),
      path.join(__dirname, '..', '..', 'node_modules', 'djs-selfbot-v13', 'src', 'structures', 'GuildJoinRequest.js'),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) return;

    let src = fs.readFileSync(file, 'utf8');
    // Já patchado?
    if (src.includes('Array.isArray(data.form_responses)')) return;

    // Aplica patch no disco se npm reinstalou a lib crua
    if (src.includes('data.form_responses.map')) {
      src = src.replace(
        /this\.responses = data\.form_responses\.map\(r => \(\{[\s\S]*?\}\)\)\;/,
        `const responses = Array.isArray(data.form_responses) ? data.form_responses : [];
      this.responses = responses.map(r => ({
        question: r?.label,
        answers: r?.response ?? null,
      }));`
      );
      fs.writeFileSync(file, src, 'utf8');
      console.log('[selfbotPatch] GuildJoinRequest.js corrigido no disco');
    }
  } catch (e) {
    // silencioso — process guards cobrem o resto
  }
}

function isJoinRequestNoise(err) {
  const msg = String(err && err.stack ? err.stack : err && err.message ? err.message : err);
  return (
    msg.includes('GuildJoinRequest') ||
    msg.includes('form_responses') ||
    msg.includes("reading 'map'") ||
    msg.includes('GUILD_JOIN_REQUEST')
  );
}

function installProcessGuards() {
  if (global.__sfGuardsInstalled) return;
  global.__sfGuardsInstalled = true;

  process.on('uncaughtException', (err) => {
    if (isJoinRequestNoise(err)) {
      console.warn('[ignorado] evento join request do Discord (selfbot)');
      return;
    }
    console.error('[uncaughtException]', err);
  });

  process.on('unhandledRejection', (reason) => {
    if (isJoinRequestNoise(reason)) {
      console.warn('[ignorado] rejection join request (selfbot)');
      return;
    }
    console.error('[unhandledRejection]', reason);
  });
}

module.exports = { applySelfbotPatch, installProcessGuards };
