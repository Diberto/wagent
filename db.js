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
const require = createRequire(import.meta.url);

let MongoClient;
try {
  const mongoModule = require('mongodb');
  MongoClient = mongoModule.MongoClient;
} catch (e) {
  // If mongodb is not installed locally yet, will be installed automatically by Hostinger on build
}

const mongoUri = process.env.MONGODB_URI || 
                 process.env.MONGO_URL || 
                 process.env.DATABASE_URL || 
                 process.env.MONGODB_URL || 
                 'mongodb://localhost:27017/wagent';

const dbName = process.env.MONGODB_DB_NAME || 'wagent';

let client = null;
let dbInstance = null;
let isConnecting = false;

/**
 * Connect to MongoDB Atlas
 */
export async function connectDB() {
  if (dbInstance) return dbInstance;
  if (!MongoClient) {
    console.warn('⚠️ [MongoDB Atlas] El paquete mongodb no está instalado localmente. Se utilizará almacenamiento local SQLite/JSON.');
    return null;
  }

  if (isConnecting) {
    // Wait briefly if connection is in progress
    await new Promise(r => setTimeout(r, 500));
    return dbInstance;
  }

  isConnecting = true;
  try {
    console.log(`🔌 [MongoDB Atlas] Conectando a MongoDB en Hostinger... (IP Servidor: 77.37.127.103)`);
    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    dbInstance = client.db(dbName);
    console.log(`✅ [MongoDB Atlas] Conexión establecida exitosamente a la base de datos "${dbName}".`);
    isConnecting = false;
    return dbInstance;
  } catch (error) {
    console.warn(`⚠️ [MongoDB Atlas] No se pudo conectar a MongoDB Atlas: ${error.message}. Funcionando con respaldo SQLite/JSON local.`);
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

// Auto-initialize if running on Hostinger with MONGODB_URI provided
if (process.env.MONGODB_URI || process.env.MONGO_URL) {
  connectDB().catch(() => {});
}

export { MongoClient, client };
export default { connectDB, getDb, isMongoConnected, getCollection };
