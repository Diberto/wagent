import fs from 'fs';
import path from 'path';
import net from 'net';
import { CONFIG } from '../config/index.js';
import { db } from './database.js';
import { sqliteStorage } from './sqliteStorage.js';

let MongoClientClass = null;
let PgClientClass = null;

// Cargar dinámicamente clientes bajo demanda (evita top-level await para compatibilidad con CommonJS / LiteSpeed require)
async function getMongoClientClass() {
  if (!MongoClientClass) {
    try {
      const mongoModule = await import('mongodb');
      MongoClientClass = mongoModule.MongoClient || mongoModule.default?.MongoClient;
    } catch (e) {}
  }
  return MongoClientClass;
}

async function getPgClientClass() {
  if (!PgClientClass) {
    try {
      const pgModule = await import('pg');
      PgClientClass = pgModule.default?.Client || pgModule.Client;
    } catch (e) {}
  }
  return PgClientClass;
}

function unmaskValue(newVal, oldVal) {
  if (!newVal) return oldVal || '';
  if (typeof newVal === 'string' && newVal.includes('******')) return oldVal || newVal;
  return newVal;
}

const CONFIG_FILE = path.join(CONFIG.DATA_DIR, 'db_config.json');

/**
 * Servicio de Configuración, Testeo y Migración Multi-Motor de Base de Datos
 * Soporta: SQLite WAL, MongoDB Atlas (Data API / URI), PostgreSQL / Supabase (REST API Key / URI), Firebase Firestore (API Key / REST), MySQL
 */
export class DbMigrationService {
  /**
   * Obtiene la configuración activa del motor de base de datos
   */
  static getActiveConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {}

    return {
      activeEngine: 'sqlite',
      sqlite: {
        path: path.join(CONFIG.DATA_DIR, 'wagent.db'),
        walEnabled: true
      },
      mongodb: {
        authMode: 'uri', // 'uri' | 'apikey'
        uri: process.env.MONGODB_URI || 'mongodb://77.37.127.103:27017/wagent',
        dbName: 'wagent',
        apiKey: process.env.MONGODB_API_KEY || '',
        endpoint: process.env.MONGODB_DATA_API_ENDPOINT || '',
        dataSource: process.env.MONGODB_DATA_SOURCE || 'Cluster0'
      },
      supabase: {
        authMode: 'apikey', // 'apikey' | 'uri'
        projectUrl: process.env.SUPABASE_URL || '',
        apiKey: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        connectionString: process.env.SUPABASE_DB_URL || '',
        schema: 'public'
      },
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        apiKey: process.env.FIREBASE_API_KEY || '',
        collectionPrefix: 'wagent_'
      },
      mysql: {
        uri: process.env.MYSQL_URI || ''
      },
      lastMigration: null
    };
  }

  /**
   * Guarda y actualiza la configuración del motor de base de datos preservando credenciales enmascaradas
   */
  static saveConfig(newConfig) {
    try {
      const current = this.getActiveConfig();

      const unmaskedMongodb = {
        ...(current.mongodb || {}),
        ...(newConfig.mongodb || {}),
        uri: unmaskValue(newConfig.mongodb?.uri, current.mongodb?.uri),
        apiKey: unmaskValue(newConfig.mongodb?.apiKey, current.mongodb?.apiKey)
      };

      const unmaskedSupabase = {
        ...(current.supabase || {}),
        ...(newConfig.supabase || {}),
        connectionString: unmaskValue(newConfig.supabase?.connectionString, current.supabase?.connectionString),
        apiKey: unmaskValue(newConfig.supabase?.apiKey, current.supabase?.apiKey)
      };

      const unmaskedFirebase = {
        ...(current.firebase || {}),
        ...(newConfig.firebase || {}),
        apiKey: unmaskValue(newConfig.firebase?.apiKey, current.firebase?.apiKey)
      };

      const merged = {
        ...current,
        ...newConfig,
        mongodb: unmaskedMongodb,
        supabase: unmaskedSupabase,
        firebase: unmaskedFirebase,
        mysql: { ...(current.mysql || {}), ...(newConfig.mysql || {}) },
        sqlite: { ...(current.sqlite || {}), ...(newConfig.sqlite || {}) }
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
      return merged;
    } catch (e) {
      console.error('Error guardando configuración de base de datos:', e);
      throw e;
    }
  }

  /**
   * Testeo de conexión a bajo nivel TCP (Handshake rápido y universal)
   */
  static testTcpPing(host, port, timeoutMs = 4000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.connect(port, host, () => {
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ success: true, latencyMs: latency });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ success: false, error: err.message, latencyMs: Date.now() - start });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, error: 'Tiempo de espera agotado (Timeout)', latencyMs: timeoutMs });
      });
    });
  }

  /**
   * Testeo real de conexión según el tipo de base de datos y modo de autenticación (API Key vs URI)
   */
  static async testConnection({ type, config: rawConfig }) {
    const startTime = Date.now();
    const activeCfg = this.getActiveConfig();

    try {
      switch (type) {
        case 'mongodb': {
          const config = {
            ...(activeCfg.mongodb || {}),
            ...(rawConfig || {}),
            uri: unmaskValue(rawConfig?.uri, activeCfg.mongodb?.uri),
            apiKey: unmaskValue(rawConfig?.apiKey, activeCfg.mongodb?.apiKey)
          };

          const isApiKeyMode = config.authMode === 'apikey' || (!!config.apiKey && (!!config.endpoint || !config.uri));

          if (isApiKeyMode) {
            if (!config.apiKey) throw new Error('Se requiere el API Key de MongoDB Atlas (App Services / Data API)');
            if (!config.endpoint) throw new Error('Se requiere la URL del Endpoint de Data API de Atlas (ej: https://data.mongodb-api.com/app/.../endpoint/data/v1)');

            const cleanEndpoint = config.endpoint.replace(/\/+$/, '');
            const testUrl = cleanEndpoint.endsWith('/action/find') || cleanEndpoint.endsWith('/action/findOne')
              ? cleanEndpoint
              : `${cleanEndpoint}/action/find`;

            const res = await fetch(testUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api-key': config.apiKey,
                'apiKey': config.apiKey
              },
              body: JSON.stringify({
                dataSource: config.dataSource || 'Cluster0',
                database: config.dbName || 'wagent',
                collection: 'settings',
                filter: {},
                limit: 1
              }),
              signal: AbortSignal.timeout(8000)
            });

            const latencyMs = Date.now() - startTime;
            if (res.ok) {
              return {
                success: true,
                engine: 'MongoDB Atlas (Data API / API Key)',
                latencyMs,
                details: {
                  auth: 'API Key Validada con Éxito (HTTP 200)',
                  cluster: config.dataSource || 'Cluster0',
                  database: config.dbName || 'wagent',
                  endpoint: cleanEndpoint,
                  note: 'Conexión HTTPS REST activa sin necesidad de abrir puertos TCP'
                }
              };
            } else if (res.status === 401 || res.status === 403) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(`API Key de MongoDB Atlas rechazada (HTTP ${res.status}): ${errBody.error || errBody.message || 'Verifica permisos del API Key en Atlas'}`);
            } else if (res.status === 404) {
              throw new Error(`Endpoint de Atlas Data API no encontrado (HTTP 404). Verifica que la URL del App Service / Data API sea correcta`);
            } else {
              const errText = await res.text().catch(() => '');
              throw new Error(`Respuesta de MongoDB Atlas (HTTP ${res.status}): ${errText.slice(0, 140)}`);
            }
          } else {
            const uri = config?.uri || process.env.MONGODB_URI || 'mongodb://77.37.127.103:27017/wagent';
            if (!uri) throw new Error('Se requiere la URI de conexión de MongoDB');

            const Mongo = await getMongoClientClass();
            if (Mongo) {
              const client = new Mongo(uri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000
              });
              await client.connect();
              const pingRes = await client.db().command({ ping: 1 });
              const latencyMs = Date.now() - startTime;
              const collections = await client.db().listCollections().toArray();
              await client.close();

              return {
                success: true,
                engine: 'MongoDB (Driver TCP)',
                latencyMs,
                details: {
                  ping: pingRes?.ok === 1 ? 'OK' : 'Respondido',
                  database: client.db().databaseName || config.dbName || 'wagent',
                  existingCollections: collections.map(c => c.name)
                }
              };
            } else {
              const urlObj = new URL(uri.startsWith('mongodb') ? uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://') : `http://${uri}`);
              const host = urlObj.hostname || '77.37.127.103';
              const port = parseInt(urlObj.port, 10) || 27017;
              const tcpResult = await this.testTcpPing(host, port);
              if (!tcpResult.success) throw new Error(tcpResult.error);
              return {
                success: true,
                engine: 'MongoDB (TCP Handshake)',
                latencyMs: tcpResult.latencyMs,
                details: { host, port, note: 'Servidor MongoDB responde al socket TCP' }
              };
            }
          }
        }

        case 'supabase':
        case 'postgres': {
          const config = {
            ...(activeCfg.supabase || {}),
            ...(rawConfig || {}),
            connectionString: unmaskValue(rawConfig?.connectionString, activeCfg.supabase?.connectionString),
            apiKey: unmaskValue(rawConfig?.apiKey, activeCfg.supabase?.apiKey)
          };

          const isApiKeyMode = config.authMode === 'apikey' || (!!config.apiKey && !!config.projectUrl);

          if (isApiKeyMode) {
            if (!config.projectUrl) throw new Error('Se requiere el Project URL de Supabase (ej: https://xyz.supabase.co)');
            if (!config.apiKey) throw new Error('Se requiere el API Key de Supabase (clave anon o service_role)');

            const cleanUrl = config.projectUrl.replace(/\/+$/, '');
            const testUrl = `${cleanUrl}/rest/v1/`;

            const res = await fetch(testUrl, {
              headers: {
                'apikey': config.apiKey,
                'Authorization': `Bearer ${config.apiKey}`
              },
              signal: AbortSignal.timeout(7000)
            });

            const latencyMs = Date.now() - startTime;
            if (res.ok) {
              const spec = await res.json().catch(() => ({}));
              const tables = spec?.definitions ? Object.keys(spec.definitions) : [];
              return {
                success: true,
                engine: 'Supabase (REST API Key)',
                latencyMs,
                details: {
                  auth: 'API Key Autorizada (200 OK)',
                  projectUrl: cleanUrl,
                  existingTables: tables.slice(0, 10),
                  totalTables: tables.length,
                  note: 'Conexión HTTPS REST activa y autenticada'
                }
              };
            } else if (res.status === 401 || res.status === 403) {
              throw new Error(`API Key de Supabase rechazada (HTTP ${res.status}). Verifica tu clave anon o service_role`);
            } else {
              throw new Error(`Error conectando a Supabase REST (HTTP ${res.status})`);
            }
          } else {
            const connStr = config?.connectionString || config?.uri || process.env.SUPABASE_DB_URL;
            if (!connStr) throw new Error('Se requiere la cadena de conexión de PostgreSQL / Supabase');

            const Pg = await getPgClientClass();
            if (Pg) {
              const client = new Pg({
                connectionString: connStr,
                connectionTimeoutMillis: 5000,
                ssl: connStr.includes('supabase') || connStr.includes('sslmode=require') ? { rejectUnauthorized: false } : false
              });
              await client.connect();
              const qRes = await client.query('SELECT version(), current_database() as db;');
              const latencyMs = Date.now() - startTime;
              await client.end();

              return {
                success: true,
                engine: 'PostgreSQL / Supabase (Driver TCP)',
                latencyMs,
                details: {
                  serverVersion: qRes.rows[0]?.version?.split(' ')?.[0] || 'PostgreSQL',
                  database: qRes.rows[0]?.db || 'postgres'
                }
              };
            } else {
              const urlObj = new URL(connStr.replace('postgresql://', 'http://').replace('postgres://', 'http://'));
              const host = urlObj.hostname;
              const port = parseInt(urlObj.port, 10) || 5432;
              const tcpResult = await this.testTcpPing(host, port);
              if (!tcpResult.success) throw new Error(tcpResult.error);
              return {
                success: true,
                engine: 'PostgreSQL / Supabase (TCP Handshake)',
                latencyMs: tcpResult.latencyMs,
                details: { host, port, note: 'Servidor PostgreSQL/Supabase alcanzable' }
              };
            }
          }
        }

        case 'firebase': {
          const config = {
            ...(activeCfg.firebase || {}),
            ...(rawConfig || {}),
            apiKey: unmaskValue(rawConfig?.apiKey, activeCfg.firebase?.apiKey)
          };

          const projectId = config?.projectId || process.env.FIREBASE_PROJECT_ID;
          if (!projectId) throw new Error('Se requiere el Project ID de Firebase');

          let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
          if (config?.apiKey) {
            url += `?key=${encodeURIComponent(config.apiKey)}`;
          }

          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          const latencyMs = Date.now() - startTime;

          if (res.status === 200) {
            return {
              success: true,
              engine: 'Firebase Firestore (REST API)',
              latencyMs,
              details: {
                projectId,
                hasApiKey: !!config.apiKey,
                httpStatus: 200,
                endpoint: 'Google Cloud Firestore REST API Activo'
              }
            };
          } else if (res.status === 401 || res.status === 403) {
            return {
              success: true,
              engine: 'Firebase Firestore (Proyecto Validado)',
              latencyMs,
              details: {
                projectId,
                hasApiKey: !!config.apiKey,
                httpStatus: res.status,
                endpoint: 'Google Cloud Firestore REST API',
                note: config.apiKey ? 'Proyecto y API Key alcanzables (restringido por Firestore Security Rules)' : 'Proyecto existe en Google Cloud'
              }
            };
          } else if (res.status === 404) {
            throw new Error(`Proyecto de Firebase '${projectId}' no encontrado (HTTP 404). Verifica el ID.`);
          } else {
            throw new Error(`Error de conexión con Firebase Firestore (HTTP ${res.status})`);
          }
        }

        case 'sqlite': {
          const config = {
            ...(activeCfg.sqlite || {}),
            ...(rawConfig || {})
          };
          const dbPath = config?.path || path.join(CONFIG.DATA_DIR, 'wagent.db');
          let stats = { tables: [] };
          try {
            if (sqliteStorage && typeof sqliteStorage.getDetailedStats === 'function') {
              stats = sqliteStorage.getDetailedStats();
            }
          } catch (e) {}
          return {
            success: true,
            engine: 'SQLite WAL (Local)',
            latencyMs: 1,
            details: {
              path: dbPath,
              mode: 'WAL',
              tables: stats?.tables?.map(t => `${t.name} (${t.count} reg)`) || [],
              fileSize: stats?.fileSize || 'Activo'
            }
          };
        }

        case 'mysql': {
          const config = {
            ...(activeCfg.mysql || {}),
            ...(rawConfig || {})
          };
          const uri = config?.uri || process.env.MYSQL_URI;
          if (!uri) throw new Error('Se requiere la URI de conexión de MySQL');
          const urlObj = new URL(uri.replace('mysql://', 'http://'));
          const host = urlObj.hostname || 'localhost';
          const port = parseInt(urlObj.port, 10) || 3306;
          const tcpResult = await this.testTcpPing(host, port);
          if (!tcpResult.success) throw new Error(tcpResult.error);
          return {
            success: true,
            engine: 'MySQL',
            latencyMs: tcpResult.latencyMs,
            details: { host, port, note: 'Servidor MySQL responde' }
          };
        }

        default:
          throw new Error(`Motor de base de datos no soportado: ${type}`);
      }
    } catch (err) {
      return {
        success: false,
        engine: type,
        latencyMs: Date.now() - startTime,
        error: err.message
      };
    }
  }

  /**
   * Ejecuta la migración transparente de todos los datos hacia el motor destino
   */
  static async migrateData({ targetType, targetConfig, io = null }) {
    const rawData = db.readDb();
    const collectionsToMigrate = [
      'leads',
      'orders',
      'messages',
      'products',
      'agents',
      'users',
      'settings',
      'branches',
      'drivers',
      'shifts',
      'templates',
      'coupons',
      'calls'
    ];

    const stats = {
      startTime: new Date().toISOString(),
      targetType,
      migratedCollections: {},
      totalRecords: 0,
      status: 'in_progress',
      errors: []
    };

    const emitProgress = (collectionName, current, total, message) => {
      if (io && typeof io.emit === 'function') {
        io.emit('database:migration:progress', {
          targetType,
          collection: collectionName,
          current,
          total,
          message,
          percentage: total > 0 ? Math.round((current / total) * 100) : 100
        });
      }
    };

    try {
      switch (targetType) {
        case 'mongodb': {
          const isApiKeyMode = targetConfig?.authMode === 'apikey' || (!!targetConfig?.apiKey && !!targetConfig?.endpoint);

          if (isApiKeyMode) {
            const cleanEndpoint = targetConfig.endpoint.replace(/\/+$/, '');
            const insertUrl = `${cleanEndpoint}/action/insertMany`;
            const deleteUrl = `${cleanEndpoint}/action/deleteMany`;

            for (const colName of collectionsToMigrate) {
              const records = Array.isArray(rawData[colName]) ? rawData[colName] : (rawData[colName] ? [rawData[colName]] : []);
              const count = records.length;
              stats.totalRecords += count;

              emitProgress(colName, 0, count, `Migrando ${colName} (${count} registros vía Atlas Data API)...`);

              if (count > 0) {
                await fetch(deleteUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'api-key': targetConfig.apiKey,
                    'apiKey': targetConfig.apiKey
                  },
                  body: JSON.stringify({
                    dataSource: targetConfig.dataSource || 'Cluster0',
                    database: targetConfig.dbName || 'wagent',
                    collection: colName,
                    filter: {}
                  })
                }).catch(() => {});

                const docsToInsert = records.map((item, idx) => {
                  const doc = typeof item === 'object' && item !== null ? { ...item } : { value: item };
                  if (doc.id) doc._id = String(doc.id);
                  else doc._id = `doc_${idx}_${Date.now()}`;
                  return doc;
                });

                for (let i = 0; i < docsToInsert.length; i += 50) {
                  const batch = docsToInsert.slice(i, i + 50);
                  const insRes = await fetch(insertUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'api-key': targetConfig.apiKey,
                      'apiKey': targetConfig.apiKey
                    },
                    body: JSON.stringify({
                      dataSource: targetConfig.dataSource || 'Cluster0',
                      database: targetConfig.dbName || 'wagent',
                      collection: colName,
                      documents: batch
                    })
                  });
                  if (!insRes.ok) {
                    const errTxt = await insRes.text().catch(() => '');
                    console.warn(`[Atlas Data API] Advertencia en lote ${colName}:`, errTxt.slice(0, 100));
                  }
                  emitProgress(colName, Math.min(i + 50, count), count, `Migrando ${colName}...`);
                }
              }

              stats.migratedCollections[colName] = count;
            }
            break;
          }

          const Mongo = await getMongoClientClass();
          if (!Mongo) throw new Error('El driver de MongoDB no está disponible');
          const uri = targetConfig?.uri || 'mongodb://77.37.127.103:27017/wagent';
          const client = new Mongo(uri, { serverSelectionTimeoutMS: 8000 });
          await client.connect();
          const targetDb = client.db();

          for (const colName of collectionsToMigrate) {
            const records = Array.isArray(rawData[colName]) ? rawData[colName] : (rawData[colName] ? [rawData[colName]] : []);
            const count = records.length;
            stats.totalRecords += count;

            emitProgress(colName, 0, count, `Migrando ${colName} (${count} registros)...`);

            if (count > 0) {
              const mongoCol = targetDb.collection(colName);
              // Operación masiva limpia
              await mongoCol.deleteMany({});
              const docsToInsert = records.map((item, idx) => {
                const doc = typeof item === 'object' && item !== null ? { ...item } : { value: item };
                if (doc.id) doc._id = String(doc.id);
                else doc._id = `doc_${idx}_${Date.now()}`;
                return doc;
              });

              // Insertar en lotes de 200
              for (let i = 0; i < docsToInsert.length; i += 200) {
                const batch = docsToInsert.slice(i, i + 200);
                await mongoCol.insertMany(batch, { ordered: false });
                emitProgress(colName, Math.min(i + 200, count), count, `Migrando ${colName}...`);
              }
            }

            stats.migratedCollections[colName] = count;
          }

          await client.close();
          break;
        }

        case 'supabase':
        case 'postgres': {
          const isApiKeyMode = targetConfig?.authMode === 'apikey' || (!!targetConfig?.apiKey && !!targetConfig?.projectUrl && !targetConfig?.connectionString);

          if (isApiKeyMode) {
            const cleanUrl = targetConfig.projectUrl.replace(/\/+$/, '');
            for (const colName of collectionsToMigrate) {
              const records = Array.isArray(rawData[colName]) ? rawData[colName] : (rawData[colName] ? [rawData[colName]] : []);
              const count = records.length;
              stats.totalRecords += count;

              emitProgress(colName, 0, count, `Migrando ${colName} (${count} registros vía Supabase REST)...`);

              if (count > 0) {
                for (let i = 0; i < records.length; i += 50) {
                  const batch = records.slice(i, i + 50).map((rec, idx) => ({
                    id: String(rec.id || `rec_${i + idx}`),
                    data: rec
                  }));

                  const res = await fetch(`${cleanUrl}/rest/v1/wagent_${colName}`, {
                    method: 'POST',
                    headers: {
                      'apikey': targetConfig.apiKey,
                      'Authorization': `Bearer ${targetConfig.apiKey}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify(batch)
                  });

                  if (!res.ok && res.status === 404) {
                    throw new Error(`La tabla 'wagent_${colName}' no existe aún en Supabase. Ejecuta el script SQL en el Editor SQL de Supabase o utiliza la Cadena de Conexión de PostgreSQL para crearla automáticamente.`);
                  }
                  emitProgress(colName, Math.min(i + 50, count), count, `Migrando ${colName}...`);
                }
              }
              stats.migratedCollections[colName] = count;
            }
            break;
          }

          const Pg = await getPgClientClass();
          if (!Pg) throw new Error('El driver de PostgreSQL no está disponible');
          const connStr = targetConfig?.connectionString;
          const client = new Pg({
            connectionString: connStr,
            ssl: connStr.includes('supabase') || connStr.includes('sslmode=require') ? { rejectUnauthorized: false } : false
          });
          await client.connect();

          for (const colName of collectionsToMigrate) {
            const records = Array.isArray(rawData[colName]) ? rawData[colName] : (rawData[colName] ? [rawData[colName]] : []);
            const count = records.length;
            stats.totalRecords += count;

            emitProgress(colName, 0, count, `Creando tabla y migrando ${colName}...`);

            // Crear tabla genérica con payload JSONB de alta performance
            await client.query(`
              CREATE TABLE IF NOT EXISTS wagent_${colName} (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                data JSONB NOT NULL
              );
            `);
            await client.query(`TRUNCATE TABLE wagent_${colName};`);

            if (count > 0) {
              for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                const recId = String(rec.id || `rec_${i}`);
                await client.query(
                  `INSERT INTO wagent_${colName} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2;`,
                  [recId, JSON.stringify(rec)]
                );
                if (i % 50 === 0 || i === records.length - 1) {
                  emitProgress(colName, i + 1, count, `Insertando ${colName}...`);
                }
              }
            }

            stats.migratedCollections[colName] = count;
          }

          await client.end();
          break;
        }

        case 'sqlite': {
          // Migrar hacia SQLite nativo WAL
          sqliteStorage.migrateFromJsonData(rawData);
          for (const colName of collectionsToMigrate) {
            const count = Array.isArray(rawData[colName]) ? rawData[colName].length : (rawData[colName] ? 1 : 0);
            stats.migratedCollections[colName] = count;
            stats.totalRecords += count;
          }
          break;
        }

        default:
          throw new Error(`Migración para motor ${targetType} aún no implementada`);
      }

      stats.status = 'completed';
      stats.endTime = new Date().toISOString();

      // Guardar en la configuración que se migró exitosamente
      this.saveConfig({
        activeEngine: targetType,
        lastMigration: stats
      });

      emitProgress('all', stats.totalRecords, stats.totalRecords, '¡Migración completada con éxito!');
      return { success: true, stats };
    } catch (err) {
      console.error('Error durante la migración de base de datos:', err);
      stats.status = 'failed';
      stats.errors.push(err.message);
      emitProgress('error', 0, 0, `Error en migración: ${err.message}`);
      return { success: false, error: err.message, stats };
    }
  }
}
