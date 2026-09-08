import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TOKENS_PATH = join(process.cwd(), 'src', 'quest', 'tokens.json');

class TokenManager {
  constructor() {
    this.tokens = {};
    this.load();
  }

  load() {
    try {
      if (existsSync(TOKENS_PATH)) {
        this.tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
      }
    } catch {
      this.tokens = {};
    }
  }

  save() {
    try {
      writeFileSync(TOKENS_PATH, JSON.stringify(this.tokens, null, 2));
    } catch (err) {
      console.error('Erro ao salvar tokens:', err.message);
    }
  }

  get(userId) {
    return this.tokens[userId] || null;
  }

  set(userId, token) {
    this.tokens[userId] = token;
    this.save();
  }

  count() {
    this.load();
    return Object.keys(this.tokens).length;
  }

  listUserIds() {
    this.load();
    return Object.keys(this.tokens);
  }
}

export const tokenManager = new TokenManager();