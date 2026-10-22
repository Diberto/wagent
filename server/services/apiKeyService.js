import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config/index.js';

class ApiKeyService {
  constructor() {
    this.keysFile = path.join(CONFIG.DATA_DIR, 'api_keys.json');
    this.keys = [];
    this.loadKeys();
    this.ensureDefaultKey();
  }

  loadKeys() {
    try {
      if (fs.existsSync(this.keysFile)) {
        const raw = fs.readFileSync(this.keysFile, 'utf8');
        this.keys = JSON.parse(raw);
      } else {
        this.keys = [];
      }
    } catch (e) {
      console.warn('⚠️ [ApiKeyService] Error cargando api_keys.json:', e.message);
      this.keys = [];
    }
  }

  saveKeys() {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(this.keysFile, JSON.stringify(this.keys, null, 2), 'utf8');
    } catch (e) {
      console.error('❌ [ApiKeyService] Error guardando api_keys.json:', e.message);
    }
  }

  ensureDefaultKey() {
    if (this.keys.length === 0) {
      const defaultKey = {
        id: 'key-default-admin',
        name: 'Clave Maestra (Sistema & MCP)',
        key: 'wagent_live_' + crypto.randomBytes(24).toString('hex'),
        permissions: ['*'],
        active: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        createdBy: 'system'
      };
      this.keys.push(defaultKey);
      this.saveKeys();
      console.log('🔑 [ApiKeyService] Clave API maestra generada por defecto:', defaultKey.key);
    }
  }

  getAllKeys() {
    this.loadKeys();
    return this.keys.map(k => ({
      id: k.id,
      name: k.name,
      maskedKey: k.key.slice(0, 14) + '...' + k.key.slice(-4),
      fullKey: k.key,
      permissions: k.permissions || ['*'],
      active: k.active !== false,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      createdBy: k.createdBy || 'admin'
    }));
  }

  validateKey(providedKey) {
    if (!providedKey) return false;
    const clean = String(providedKey).trim().replace(/^Bearer\s+/i, '');
    this.loadKeys();
    const found = this.keys.find(k => k.active !== false && k.key === clean);
    if (found) {
      found.lastUsedAt = new Date().toISOString();
      this.saveKeys();
      return found;
    }
    return false;
  }

  createKey({ name = 'Nueva Integración', permissions = ['*'], createdBy = 'admin' }) {
    this.loadKeys();
    const newKey = {
      id: `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      name: name.trim(),
      key: 'wagent_live_' + crypto.randomBytes(24).toString('hex'),
      permissions,
      active: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      createdBy
    };
    this.keys.push(newKey);
    this.saveKeys();
    return newKey;
  }

  toggleKey(id) {
    this.loadKeys();
    const target = this.keys.find(k => k.id === id);
    if (!target) return null;
    target.active = !target.active;
    this.saveKeys();
    return target;
  }

  deleteKey(id) {
    this.loadKeys();
    const prevLen = this.keys.length;
    this.keys = this.keys.filter(k => k.id !== id);
    if (this.keys.length !== prevLen) {
      this.saveKeys();
      return true;
    }
    return false;
  }
}

export const apiKeyService = new ApiKeyService();
