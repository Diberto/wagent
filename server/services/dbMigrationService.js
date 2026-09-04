import fs from 'fs';
import path from 'path';
import net from 'net';
import { CONFIG } from '../config/index.js';
import { db } from './database.js';
import { sqliteStorage } from './sqliteStorage.js';

let MongoClientClass = null;
let PgClientClass = null;

// Cargar dinámicamente clientes si están disponibles
try {
  const mongoModule = await import('mongodb');
  MongoClientClass = mongoModule.MongoClient;
} catch (e) {}

try {
  const pgModule = await import('pg');
  PgClientClass = pgModule.default?.Client || pgModule.Client;
} catch (e) {}

const CONFIG_FILE = path.join(CONFIG.DATA_DIR, 'db_config.json');

/**
 * Servicio de Configuración, Testeo y Migración Multi-Motor de Base de Datos
 * Soporta: SQLite WAL, MongoDB Atlas / VPS, PostgreSQL / Supabase, Firebase Firestore, MySQL
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
        uri: process.env.MONGODB_URI || 'mongodb://77.37.127.103:27017/wagent',
        dbName: 'wagent'
      },
      supabase: {
        connectionString: process.env.SUPABASE_DB_URL || '',
        schema: 'public'
      },
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        collectionPrefix: 'wagent_'
      },
      mysql: {
        uri: process.env.MYSQL_URI || ''
      },
      lastMigration: null
    };
  }

  /**
   * Guarda y actualiza la configuración del motor de base de datos
   */
  static saveConfig(newConfig) {
    try {
      const current = this.getActiveConfig();
      const merged = { ...current, ...newConfig };
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
   * Testeo real de conexión según el tipo de base de datos seleccionado
   */
  static async testConnection({ type, config }) {
    const startTime = Date.now();

    try {
      switch (type) {
        case 'mongodb': {
          const uri = config?.uri || process.env.MONGODB_URI || 'mongodb://77.37.127.103:27017/wagent';
          if (!uri) throw new Error('Se requiere la URI de conexión de MongoDB');

          if (MongoClientClass) {
            const client = new MongoClientClass(uri, {
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
              engine: 'MongoDB',
              latencyMs,
              details: {
                ping: pingRes?.ok === 1 ? 'OK' : 'Respondido',
                database: client.db().databaseName || 'default',
                existingCollections: collections.map(c => c.name)
              }
            };
          } else {
            // Test por TCP socket si el paquete mongodb no está instanciado
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

        case 'supabase':
        case 'postgres': {
          const connStr = config?.connectionString || config?.uri || process.env.SUPABASE_DB_URL;
          if (!connStr) throw new Error('Se requiere la cadena de conexión de PostgreSQL / Supabase');

          if (PgClientClass) {
            const client = new PgClientClass({
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
              engine: 'PostgreSQL / Supabase',
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

        case 'firebase': {
          const projectId = config?.projectId || process.env.FIREBASE_PROJECT_ID;
          if (!projectId) throw new Error('Se requiere el Project ID de Firebase');

          // Probar endpoint REST público de Firestore
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const latencyMs = Date.now() - startTime;

          // 200 OK o 401/403 (existe pero requiere credencial) confirman que el proyecto existe
          if (res.status === 200 || res.status === 401 || res.status === 403) {
            return {
              success: true,
              engine: 'Firebase Firestore',
              latencyMs,
              details: {
                projectId,
                httpStatus: res.status,
                endpoint: 'Google Cloud Firestore REST API'
              }
            };
          } else {
            throw new Error(`Error de conexión con Firebase Firestore (HTTP ${res.status})`);
          }
        }

        case 'sqlite': {
          const dbPath = config?.path || path.join(CONFIG.DATA_DIR, 'wagent.db');
          const stats = sqliteStorage.getDetailedStats ? sqliteStorage.getDetailedStats() : { tables: [] };
          return {
            success: true,
            engine: 'SQLite WAL (Local)',
            latencyMs: 1,
            details: {
              path: dbPath,
              mode: 'WAL',
              tables: stats.tables?.map(t => `${t.name} (${t.count} reg)`),
              fileSize: stats.fileSize || 'Activo'
            }
          };
        }

        case 'mysql': {
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
          if (!MongoClientClass) throw new Error('El driver de MongoDB no está disponible');
          const uri = targetConfig?.uri || 'mongodb://77.37.127.103:27017/wagent';
          const client = new MongoClientClass(uri, { serverSelectionTimeoutMS: 8000 });
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
          if (!PgClientClass) throw new Error('El driver de PostgreSQL no está disponible');
          const connStr = targetConfig?.connectionString;
          const client = new PgClientClass({
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
