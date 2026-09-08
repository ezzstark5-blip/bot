import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'src', 'logs');
const LOG_FILE = join(LOGS_DIR, 'log.txt');

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function formatLine(type, data) {
  return `[${timestamp()}] ${type} | ${data}\n`;
}

export function logEntrada(data) {
  const line = formatLine('ENTRADA', JSON.stringify(data));
  writeFileSync(LOG_FILE, line, { flag: 'a' });
  console.log(`\x1b[36m${line.trim()}\x1b[0m`);
}

export function logSaida(data) {
  const line = formatLine('SAIDA', JSON.stringify(data));
  writeFileSync(LOG_FILE, line, { flag: 'a' });
  console.log(`\x1b[32m${line.trim()}\x1b[0m`);
}

export function logError(data) {
  const line = formatLine('ERRO', JSON.stringify(data));
  writeFileSync(LOG_FILE, line, { flag: 'a' });
  console.log(`\x1b[31m${line.trim()}\x1b[0m`);
}

export function logInfo(data) {
  const line = formatLine('INFO', JSON.stringify(data));
  writeFileSync(LOG_FILE, line, { flag: 'a' });
  console.log(`\x1b[35m${line.trim()}\x1b[0m`);
}
