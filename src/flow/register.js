import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const {
  applySelfbotPatch,
  installProcessGuards,
} = require(join(__dirname, '../../flow-tools/Functions/selfbotPatch.js'));

installProcessGuards();
applySelfbotPatch();

const disabled =
  String(process.env.DISABLE_SELF_FLOW || '').toLowerCase() === 'true' ||
  String(process.env.DISABLE_SELF_FLOW || '') === '1';

let flow = null;
if (!disabled) {
  try {
    flow = require(join(__dirname, '../../flow-tools/handler.js'));
  } catch (err) {
    console.warn(
      '⚠️ Self Flow desabilitado (falha ao carregar — comum no Render sem bindings):',
      err.message
    );
    flow = null;
  }
} else {
  console.log('Self Flow desligado (DISABLE_SELF_FLOW=true)');
}

/**
 * Integra Self Flow no client do Bot Hm.
 * @param {import('discord.js').Client} client
 * @param {{ ownerIds?: string[] }} [options]
 */
export function registerSelfFlow(client, options = {}) {
  if (!flow?.registerSelfFlow) {
    console.warn('Self Flow não disponível neste ambiente');
    return null;
  }
  return flow.registerSelfFlow(client, options);
}

export async function handleFlowInteraction(interaction) {
  if (!flow?.handleFlowInteraction) return false;
  return flow.handleFlowInteraction(interaction);
}

export function isFlowInteraction(interaction) {
  if (!flow?.isFlowInteraction) return false;
  return flow.isFlowInteraction(interaction);
}
