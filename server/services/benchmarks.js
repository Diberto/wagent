import { sqliteStorage } from './sqliteStorage.js';

export async function runStorageBenchmark({ readOps = 5000, writeOps = 1000 } = {}) {
  const startTime = Date.now();
  const initialMemory = process.memoryUsage().heapUsed;

  // 1. Benchmark de Lecturas Concurrentes
  const readStart = performance.now();
  for (let i = 0; i < readOps; i++) {
    // Lectura variada por id y catálogo completo
    sqliteStorage.getProducts();
    sqliteStorage.getOrders();
  }
  const readEnd = performance.now();
  const readDurationMs = readEnd - readStart;
  const readTps = Math.round((readOps / (readDurationMs / 1000)));

  // 2. Benchmark de Escrituras Transaccionales Concurrentes
  const writeStart = performance.now();
  if (sqliteStorage.isNative) {
    sqliteStorage.db.exec('BEGIN;');
  }
  for (let i = 0; i < writeOps; i++) {
    sqliteStorage.saveOrder({
      id: `bench_order_${i}`,
      customerName: `Cliente Test Concurrencia ${i}`,
      customerPhone: `+54 9 351 555-${String(i).padStart(4, '0')}`,
      total: 15400 + i * 100,
      status: 'completed',
      paymentMethod: 'mercadopago',
      createdAt: new Date().toISOString()
    });
  }
  if (sqliteStorage.isNative) {
    sqliteStorage.db.exec('COMMIT;');
  }
  const writeEnd = performance.now();
  const writeDurationMs = writeEnd - writeStart;
  const writeTps = Math.round((writeOps / (writeDurationMs / 1000)));

  // 3. Limpieza de registros de prueba
  if (sqliteStorage.isNative) {
    sqliteStorage.db.exec(`DELETE FROM orders WHERE id LIKE 'bench_order_%'`);
  }

  const totalDurationMs = Date.now() - startTime;
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMb = Math.round((finalMemory - initialMemory) / (1024 * 1024) * 100) / 100;

  return {
    engine: 'SQLite WAL (Write-Ahead Logging) + In-Memory Fast Cache',
    readOps,
    readDurationMs: Math.round(readDurationMs * 10) / 10,
    readTps: `${readTps.toLocaleString('es-AR')} ops/seg`,
    readAvgLatencyMs: (readDurationMs / readOps).toFixed(3),
    writeOps,
    writeDurationMs: Math.round(writeDurationMs * 10) / 10,
    writeTps: `${writeTps.toLocaleString('es-AR')} ops/seg`,
    writeAvgLatencyMs: (writeDurationMs / writeOps).toFixed(3),
    totalDurationMs,
    memoryDeltaMb: `${memoryDeltaMb > 0 ? '+' : ''}${memoryDeltaMb} MB`,
    timestamp: new Date().toISOString()
  };
}
