import crypto from 'crypto';
import { connectDB, getDb } from '../../db.js';
import { CONFIG } from '../config/index.js';

const VAULT_COLLECTION = 'wagent_state_vault';
const CHUNK_SIZE = 400;
const MAX_CLOUD_MESSAGES = 4000;

const SINGLETON_KEYS = [
  'settings',
  'knowledgeBase',
  'loyaltyConfig',
  'wooConfig'
];

const ARRAY_KEYS = [
  'branches',
  'drivers',
  'users',
  'agents',
  'coupons',
  'recipes',
  'automations',
  'groupRules',
  'silentOcrGroups',
  'internalGroupOrders',
  'suppliers',
  'supplierInvoices',
  'branchTransfers',
  'stockMovements',
  'products',
  'leads',
  'orders',
  'calls',
  'broadcastCampaigns',
  'cashRegisters',
  'messages'
];

function quickHash(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function getRecordId(item, domain) {
  if (!item || typeof item !== 'object') return null;
  if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') {
    return String(item.id);
  }
  if (domain === 'leads' && item.jid) return `jid:${item.jid}`;
  if (domain === 'groupRules' && item.groupJid) return `grp:${item.groupJid}`;
  if (domain === 'silentOcrGroups' && item.groupJid) return `ocrgrp:${item.groupJid}`;
  if (domain === 'products' && item.plu) return `plu:${item.plu}`;
  return null;
}

function getRecordTimestamp(item) {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.updatedAt || item.lastModified || item.timestamp || item.createdAt || 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isDefaultOrEmptySetting(key, val) {
  if (val === undefined || val === null || val === '') return true;
  const defVal = CONFIG.DEFAULT_SETTINGS?.[key];
  if (defVal !== undefined && JSON.stringify(val) === JSON.stringify(defVal)) return true;
  return false;
}

function mergeSettingsSmart(localSettings = {}, cloudSettings = {}) {
  const localTs = Number(localSettings._updatedAt || 0);
  const cloudTs = Number(cloudSettings._updatedAt || 0);
  const base = cloudTs >= localTs
    ? { ...localSettings, ...cloudSettings }
    : { ...cloudSettings, ...localSettings };

  // Garantizar que ninguna credencial o configuración valiosa guardada en la nube se pierda
  // si el archivo local volvió a valores vacíos o por defecto tras un despliegue
  for (const [k, cloudVal] of Object.entries(cloudSettings || {})) {
    if (k.startsWith('_')) continue;
    const localVal = localSettings?.[k];
    if (isDefaultOrEmptySetting(k, localVal) && !isDefaultOrEmptySetting(k, cloudVal)) {
      base[k] = cloudVal;
    } else if (
      cloudVal &&
      typeof cloudVal === 'object' &&
      !Array.isArray(cloudVal) &&
      localVal &&
      typeof localVal === 'object' &&
      !Array.isArray(localVal)
    ) {
      base[k] = cloudTs >= localTs
        ? { ...localVal, ...cloudVal }
        : { ...cloudVal, ...localVal };
      for (const [subK, subCloudVal] of Object.entries(cloudVal)) {
        if ((base[k][subK] === '' || base[k][subK] === undefined || base[k][subK] === null) && subCloudVal) {
          base[k][subK] = subCloudVal;
        }
      }
    }
  }

  base._updatedAt = Math.max(localTs, cloudTs, Date.now());
  return base;
}

function mergeArraysById(localArr = [], cloudArr = [], domain = '') {
  const safeLocal = Array.isArray(localArr) ? localArr : [];
  const safeCloud = Array.isArray(cloudArr) ? cloudArr : [];

  if (safeCloud.length === 0) return safeLocal;
  if (safeLocal.length === 0) return safeCloud;

  const map = new Map();
  const keyless = [];

  for (const item of safeCloud) {
    const id = getRecordId(item, domain);
    if (!id) {
      keyless.push(item);
      continue;
    }
    map.set(id, item);
  }

  for (const item of safeLocal) {
    const id = getRecordId(item, domain);
    if (!id) {
      keyless.push(item);
      continue;
    }
    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
    } else {
      const localTs = getRecordTimestamp(item);
      const cloudTs = getRecordTimestamp(existing);
      map.set(id, localTs >= cloudTs ? { ...existing, ...item } : { ...item, ...existing });
    }
  }

  const merged = [...map.values(), ...keyless];
  if (domain === 'messages' && merged.length > MAX_CLOUD_MESSAGES) {
    merged.sort((a, b) => getRecordTimestamp(a) - getRecordTimestamp(b));
    return merged.slice(-MAX_CLOUD_MESSAGES);
  }
  return merged;
}

class MongoPersistenceService {
  constructor() {
    this._syncTimer = null;
    this._isSyncing = false;
    this._pendingData = null;
    this._hashes = new Map();
    this._hydrated = false;
    this._lastSyncAt = null;
  }

  getStatus() {
    const mongoDb = getDb();
    return {
      enabled: Boolean(process.env.MONGODB_URI),
      connected: Boolean(mongoDb),
      hydrated: this._hydrated,
      lastSyncAt: this._lastSyncAt,
      collection: VAULT_COLLECTION
    };
  }

  async ensureCollection() {
    let mongoDb = getDb();
    if (!mongoDb) {
      mongoDb = await connectDB();
    }
    if (!mongoDb) return null;
    return mongoDb.collection(VAULT_COLLECTION);
  }

  /**
   * Hidrata la base local al iniciar el servidor combinando de forma inteligente
   * la bóveda de MongoDB Atlas con el estado en disco local.
   * Si un despliegue borró el archivo local, restaura el 100% de las configuraciones y datos.
   */
  async hydrateFromCloud(localDb = {}) {
    try {
      const col = await this.ensureCollection();
      if (!col) {
        return { hydrated: false, reason: 'mongodb_unavailable' };
      }

      const docs = await col.find({}).toArray();
      if (!docs || docs.length === 0) {
        // Sembrar la bóveda en la nube por primera vez con los datos actuales
        await this.flushCloudSyncNow(localDb, { forceAll: true });
        this._hydrated = true;
        console.log('☁️ [MongoPersistence] Bóveda inicial creada en MongoDB Atlas con los datos actuales.');
        return { hydrated: false, seeded: true };
      }

      const singletons = {};
      const chunkMap = new Map(); // domain -> [{ chunkIndex, items }]
      const arrayMeta = new Map(); // domain -> { totalChunks }

      for (const doc of docs) {
        if (!doc || !doc._id) continue;
        if (doc.kind === 'singleton' && doc.domain) {
          singletons[doc.domain] = doc.payload;
        } else if (doc.kind === 'array_meta' && doc.domain) {
          arrayMeta.set(doc.domain, doc);
        } else if (doc.kind === 'array_chunk' && doc.domain) {
          if (!chunkMap.has(doc.domain)) chunkMap.set(doc.domain, []);
          chunkMap.get(doc.domain).push(doc);
        }
      }

      const mergedDb = { ...localDb };
      let restoredDomains = 0;

      // 1. Restaurar / combinar singletons (settings, knowledgeBase, loyaltyConfig, wooConfig)
      for (const key of SINGLETON_KEYS) {
        if (singletons[key] !== undefined && singletons[key] !== null) {
          if (key === 'settings') {
            mergedDb.settings = mergeSettingsSmart(localDb.settings || {}, singletons.settings || {});
            restoredDomains++;
          } else {
            const localEmpty = !localDb[key] || (Array.isArray(localDb[key]) && localDb[key].length === 0) || (typeof localDb[key] === 'object' && Object.keys(localDb[key]).length === 0);
            if (localEmpty) {
              mergedDb[key] = singletons[key];
              restoredDomains++;
            } else if (Array.isArray(singletons[key]) && Array.isArray(localDb[key])) {
              mergedDb[key] = mergeArraysById(localDb[key], singletons[key], key);
            } else if (typeof singletons[key] === 'object' && typeof localDb[key] === 'object') {
              mergedDb[key] = { ...singletons[key], ...localDb[key] };
            }
          }
        }
      }

      // 2. Reconstruir y combinar colecciones particionadas
      for (const domain of ARRAY_KEYS) {
        const meta = arrayMeta.get(domain);
        const chunks = (chunkMap.get(domain) || []).sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
        const validChunks = meta && typeof meta.totalChunks === 'number'
          ? chunks.filter(c => c.chunkIndex < meta.totalChunks)
          : chunks;

        const cloudItems = [];
        for (const ch of validChunks) {
          if (Array.isArray(ch.items)) {
            cloudItems.push(...ch.items);
          }
        }

        if (cloudItems.length > 0) {
          if (domain === 'products') {
            // Para productos: si local solo tiene el catálogo semilla o está vacío, combinar preservando ediciones de precios/stock de la nube
            mergedDb.products = mergeArraysById(localDb.products || [], cloudItems, 'products');
          } else {
            mergedDb[domain] = mergeArraysById(localDb[domain] || [], cloudItems, domain);
          }
          restoredDomains++;
        }
      }

      this._hydrated = true;
      // Sincronizar de vuelta el estado unificado para dejar nube y disco 100% alineados
      await this.flushCloudSyncNow(mergedDb, { forceAll: false });
      console.log(`☁️ [MongoPersistence] Hidratación completada desde MongoDB Atlas (${restoredDomains} dominios sincronizados).`);

      return { hydrated: true, mergedDb, restoredDomains };
    } catch (err) {
      console.warn('⚠️ [MongoPersistence] Aviso hidratando desde MongoDB Atlas:', err.message);
      return { hydrated: false, error: err.message };
    }
  }

  /**
   * Programa una sincronización asíncrona no bloqueante (debounced) hacia MongoDB Atlas.
   */
  scheduleCloudSync(dbData) {
    if (!dbData) return;
    this._pendingData = dbData;
    if (this._syncTimer) return;

    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      const snapshot = this._pendingData;
      this._pendingData = null;
      if (snapshot) {
        this.flushCloudSyncNow(snapshot).catch((err) => {
          console.warn('⚠️ [MongoPersistence] Error en sync diferido:', err.message);
        });
      }
    }, 2200);
  }

  /**
   * Fuerza el guardado inmediato en MongoDB Atlas (ej. antes de actualizar/reiniciar el servidor o tras un reset explícito).
   */
  async flushCloudSyncNow(dbData, { forceAll = false } = {}) {
    const payload = dbData || this._pendingData;
    if (!payload) return false;

    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }

    if (this._isSyncing && !forceAll) {
      this._pendingData = payload;
      return false;
    }

    this._isSyncing = true;
    try {
      const col = await this.ensureCollection();
      if (!col) return false;

      const nowIso = new Date().toISOString();
      const bulkOps = [];

      // 1. Singletons
      for (const key of SINGLETON_KEYS) {
        if (payload[key] === undefined) continue;
        const serialized = JSON.stringify(payload[key]);
        const hash = quickHash(serialized);
        if (!forceAll && this._hashes.get(`s:${key}`) === hash) continue;

        this._hashes.set(`s:${key}`, hash);
        bulkOps.push({
          updateOne: {
            filter: { _id: `singleton:${key}` },
            update: {
              $set: {
                kind: 'singleton',
                domain: key,
                payload: payload[key],
                hash,
                updatedAt: nowIso
              }
            },
            upsert: true
          }
        });
      }

      // 2. Colecciones en chunks seguros (<16MB BSON garantizado)
      for (const domain of ARRAY_KEYS) {
        if (!Array.isArray(payload[domain])) continue;

        const sourceItems = domain === 'messages' && payload.messages.length > MAX_CLOUD_MESSAGES
          ? payload.messages.slice(-MAX_CLOUD_MESSAGES)
          : payload[domain];

        const domainSerialized = JSON.stringify(sourceItems);
        const domainHash = quickHash(domainSerialized);
        if (!forceAll && this._hashes.get(`a:${domain}`) === domainHash) continue;

        this._hashes.set(`a:${domain}`, domainHash);

        const totalChunks = Math.ceil(sourceItems.length / CHUNK_SIZE);
        bulkOps.push({
          updateOne: {
            filter: { _id: `meta:${domain}` },
            update: {
              $set: {
                kind: 'array_meta',
                domain,
                totalItems: sourceItems.length,
                totalChunks,
                hash: domainHash,
                updatedAt: nowIso
              }
            },
            upsert: true
          }
        });

        for (let idx = 0; idx < totalChunks; idx++) {
          const slice = sourceItems.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
          bulkOps.push({
            updateOne: {
              filter: { _id: `chunk:${domain}:${idx}` },
              update: {
                $set: {
                  kind: 'array_chunk',
                  domain,
                  chunkIndex: idx,
                  items: slice,
                  updatedAt: nowIso
                }
              },
              upsert: true
            }
          });
        }

        // Eliminar chunks sobrantes si la colección se redujo (ej. borrado o reset intencional)
        bulkOps.push({
          deleteMany: {
            filter: {
              kind: 'array_chunk',
              domain,
              chunkIndex: { $gte: totalChunks }
            }
          }
        });
      }

      if (bulkOps.length > 0) {
        await col.bulkWrite(bulkOps, { ordered: false });
      }
      this._lastSyncAt = nowIso;
      return true;
    } catch (err) {
      console.warn('⚠️ [MongoPersistence] Error sincronizando con MongoDB Atlas:', err.message);
      return false;
    } finally {
      this._isSyncing = false;
    }
  }
}

export const mongoPersistence = new MongoPersistenceService();
export default mongoPersistence;

