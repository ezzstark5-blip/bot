/**
 * Proteção contra crash GuildJoinRequest (form_responses null).
 * Não força paths nativos inventados — isso quebra @snazzah/davey no Render/Linux.
 */
const fs = require('fs');
const path = require('path');

function applySelfbotPatch() {
  // Só força WASI se o pacote oficial existir (fallback seguro)
  try {
    require.resolve('@snazzah/davey-wasm32-wasi');
    process.env.NAPI_RS_FORCE_WASI = process.env.NAPI_RS_FORCE_WASI || '1';
  } catch {
    delete process.env.NAPI_RS_FORCE_WASI;
  }
  // Nunca apontar NAPI_RS_NATIVE_LIBRARY_PATH para arquivo inexistente
  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH) {
    const p = process.env.NAPI_RS_NATIVE_LIBRARY_PATH;
    if (!fs.existsSync(p)) {
      delete process.env.NAPI_RS_NATIVE_LIBRARY_PATH;
    }
  }

  try {
    const candidates = [
      path.join(__dirname, '..', 'node_modules', 'djs-selfbot-v13', 'src', 'structures', 'GuildJoinRequest.js'),
      path.join(__dirname, '..', '..', 'node_modules', 'djs-selfbot-v13', 'src', 'structures', 'GuildJoinRequest.js'),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) return;

    let src = fs.readFileSync(file, 'utf8');
    if (src.includes('Array.isArray(data.form_responses)')) return;

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
  } catch {
    /* silencioso */
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

function isDaveyNoise(err) {
  const msg = String(err && err.stack ? err.stack : err && err.message ? err.message : err);
  return (
    msg.includes('@snazzah/davey') ||
    msg.includes('Cannot find native binding') ||
    msg.includes('davey.wasi') ||
    msg.includes('DAVESession')
  );
}

function installProcessGuards() {
  if (global.__sfGuardsInstalled) return;
  global.__sfGuardsInstalled = true;

  process.on('uncaughtException', (err) => {
    if (isJoinRequestNoise(err) || isDaveyNoise(err)) {
      console.warn('[ignorado]', err?.message || err);
      return;
    }
    console.error('[uncaughtException]', err);
  });

  process.on('unhandledRejection', (reason) => {
    if (isJoinRequestNoise(reason) || isDaveyNoise(reason)) {
      console.warn('[ignorado]', reason?.message || reason);
      return;
    }
    console.error('[unhandledRejection]', reason);
  });
}

module.exports = { applySelfbotPatch, installProcessGuards };
