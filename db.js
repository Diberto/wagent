/**
 * db.js - MongoDB Atlas Connector for Hostinger & Node.js
 * 
 * Instructions from Hostinger:
 * 1. "mongodb": "^6.0.0" added to package.json
 * 2. db.js located in root directory
 * 3. Whitelisted IP in MongoDB Atlas: 77.37.127.103
 * 4. Automatic connection via Hostinger environment variables:
 *    MONGODB_URI, MONGO_URL, DATABASE_URL, or MONGODB_URL
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

let MongoClient;
try {
  const mongoModule = require('mongodb');
  MongoClient = mongoModule.MongoClient;
} catch (e) {
  // If mongodb is not installed locally yet, will be installed automatically by Hostinger on build
}

let client = null;
let dbInstance = null;
let isConnecting = false;

// Default verified Atlas cluster replica set credentials
const DEFAULT_ATLAS_URI = 'mongodb://dmovil_db_user:quQ7BwGCjqhnflro@ac-vkpxxx5-shard-00-00.qndfojh.mongodb.net:27017,ac-vkpxxx5-shard-00-01.qndfojh.mongodb.net:27017,ac-vkpxxx5-shard-00-02.qndfojh.mongodb.net:27017/cluster0?ssl=true&replicaSet=atlas-cwmn3y-shard-0&authSource=admin&compressors=zlib';
const DEFAULT_DB_NAME = 'cluster0';

/**
 * Dynamically resolves the best MongoDB connection string and database name
 */
export function getMongoConnectionDetails() {
  // 1. Check environment variables
  let uri = process.env.MONGODB_URI || 
            process.env.MONGO_URL || 
            process.env.DATABASE_URL || 
            process.env.MONGODB_URL;
  let dbName = process.env.MONGODB_DB_NAME;

  // 2. Check data/db_config.json if environment variable not set or contains invalid placeholder
  if (!uri || uri.includes('<db_username>') || uri.includes('******')) {
    try {
      const configPaths = [
        path.join(process.cwd(), 'data', 'db_config.json'),
        path.join(process.cwd(), 'server', 'data', 'db_config.json')
      ];
      for (const p of configPaths) {
        if (fs.existsSync(p)) {
          const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (cfg.mongodb?.uri && !cfg.mongodb.uri.includes('<db_username>') && !cfg.mongodb.uri.includes('******')) {
            uri = cfg.mongodb.uri;
            if (cfg.mongodb.dbName) dbName = cfg.mongodb.dbName;
            break;
          }
        }
      }
    } catch (_) {}
  }

  // 3. Fallback to known active Atlas cluster credentials
  if (!uri || uri.includes('localhost') || uri.includes('<db_username>') || uri.includes('******')) {
    uri = DEFAULT_ATLAS_URI;
  }
  if (!dbName || dbName === 'wagent') {
    dbName = DEFAULT_DB_NAME;
  }

  return { uri, dbName };
}

/**
 * Connect to MongoDB Atlas
 */
export async function connectDB(customUri, customDbName) {
  if (dbInstance && !customUri) return dbInstance;
  if (!MongoClient) {
    console.warn('⚠️ [MongoDB Atlas] El paquete mongodb no está instalado localmente. Se utilizará almacenamiento local SQLite/JSON.');
    return null;
  }

  if (isConnecting) {
    await new Promise(r => setTimeout(r, 600));
    return dbInstance;
  }

  isConnecting = true;
  try {
    const { uri, dbName } = customUri 
      ? { uri: customUri, dbName: customDbName || DEFAULT_DB_NAME }
      : getMongoConnectionDetails();

    const maskedUri = uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
    console.log(`🔌 [MongoDB Atlas] Conectando a MongoDB en Hostinger... (${maskedUri})`);

    // Si ya había un cliente previo, cerrarlo limpiamente
    if (client) {
      try { await client.close(); } catch (_) {}
      client = null;
      dbInstance = null;
    }

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 15000,
      tls: true,
      maxPoolSize: 10
    });

    await client.connect();
    dbInstance = client.db(dbName);
    console.log(`✅ [MongoDB Atlas] Conexión establecida exitosamente a la base de datos "${dbInstance.databaseName}".`);
    isConnecting = false;
    return dbInstance;
  } catch (error) {
    console.error("Connection error:", error.message || error);
    console.warn(`⚠️ [MongoDB Atlas] Funcionando con respaldo local SQLite/JSON.`);
    isConnecting = false;
    return null;
  }
}

/**
 * Get active MongoDB instance
 */
export function getDb() {
  return dbInstance;
}

/**
 * Check if MongoDB Atlas is currently connected
 */
export function isMongoConnected() {
  return !!dbInstance;
}

/**
 * Helper to get a collection with safety check
 */
export function getCollection(collectionName) {
  if (!dbInstance) return null;
  return dbInstance.collection(collectionName);
}

// Auto-initialize connection
connectDB().catch(err => console.error("Auto-connect notice:", err.message));

export { MongoClient, client };
export default client || { connectDB, getDb, isMongoConnected, getCollection, getMongoConnectionDetails };

