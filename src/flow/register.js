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

const flow = require(join(__dirname, '../../flow-tools/handler.js'));

/**
 * Integra Self Flow no client do Bot Hm.
 * @param {import('discord.js').Client} client
 * @param {{ ownerIds?: string[] }} [options]
 */
export function registerSelfFlow(client, options = {}) {
  return flow.registerSelfFlow(client, options);
}

export async function handleFlowInteraction(interaction) {
  return flow.handleFlowInteraction(interaction);
}

export function isFlowInteraction(interaction) {
  return flow.isFlowInteraction(interaction);
}
