import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, 'services.json');

const DEFAULT = {
  updatedAt: null,
  services: [
    { id: 'tools', name: 'Tools', description: 'Painel de ferramentas (/setup-tools)', status: 'online' },
    { id: 'autoquest', name: 'AutoQuest', description: 'Farm de missões e Orbs (/quest)', status: 'online' },
    { id: 'hypesquad', name: 'HypeSquad', description: 'Resgate de casas (/resgatar)', status: 'online' },
    { id: 'clonner', name: 'Clonador', description: 'Clonagem de servidores (/clonner)', status: 'online' },
    { id: 'tickets', name: 'Tickets', description: 'Central de atendimento', status: 'online' },
    { id: 'ia', name: 'IA', description: 'Assistente Groq (/ia)', status: 'online' },
  ],
};

export const STATUSES = ['online', 'maintenance', 'offline'];

function ensure() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify(DEFAULT, null, 2));
  }
}

export function loadStatus() {
  ensure();
  try {
    const data = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (!Array.isArray(data.services)) return { ...DEFAULT };
    return data;
  } catch {
    return { ...DEFAULT, services: DEFAULT.services.map((s) => ({ ...s })) };
  }
}

export function saveStatus(data) {
  ensure();
  data.updatedAt = new Date().toISOString();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  return data;
}

export function listServices() {
  return loadStatus().services;
}

export function setServiceStatus(serviceId, status) {
  if (!STATUSES.includes(status)) throw new Error('Status inválido.');
  const data = loadStatus();
  const service = data.services.find((s) => s.id === serviceId);
  if (!service) throw new Error('Serviço não encontrado.');
  service.status = status;
  saveStatus(data);
  return service;
}

export function getService(serviceId) {
  return listServices().find((s) => s.id === serviceId) || null;
}
