import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'src', 'quest', 'questConfig.json');

function loadQuestConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {
    ownerId: '',
    logChannelId: '',
    xSuperProperties: '',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}

export const questConfig = loadQuestConfig();

export function saveQuestConfig() {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(questConfig, null, 2));
  } catch (err) {
    console.error('Erro ao salvar questConfig:', err.message);
  }
}