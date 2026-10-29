import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const numCPUs = os.cpus().length;
const WORKERS = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : Math.min(numCPUs, 4);

if (cluster.isPrimary || cluster.isMaster) {
  console.log('================================================================');
  console.log(`🚀 [WAgent High-Scale Cluster Controller]`);
  console.log(`🖥️  CPUs Disponibles: ${numCPUs} núcleos`);
  console.log(`⚡ Desplegando ${WORKERS} Workers en paralelo para balanceo de carga`);
  console.log(`💾 Base de Datos: SQLite WAL (Multi-Process Concurrent Safe)`);
  console.log('================================================================');

  // Configurar el script de ejecución exacto de cada worker
  const entryScript = path.resolve(__dirname, 'index.js');
  if (typeof cluster.setupPrimary === 'function') {
    cluster.setupPrimary({ exec: entryScript });
  } else if (typeof cluster.setupMaster === 'function') {
    cluster.setupMaster({ exec: entryScript });
  }

  // Lanzar workers preservando su índice lógico
  const workerSlots = new Map();
  for (let i = 0; i < WORKERS; i++) {
    const slot = String(i + 1);
    const worker = cluster.fork({ WORKER_ID: slot });
    workerSlots.set(worker.id, slot);
    console.log(`  └─ [Worker ${worker.process.pid}] Iniciado como Instancia #${slot}`);
  }

  // Auto-healing si algún worker muere preservando su WORKER_ID
  cluster.on('exit', (worker, code, signal) => {
    const slot = workerSlots.get(worker.id) || '2';
    workerSlots.delete(worker.id);
    console.warn(`⚠️ [Worker ${worker.process.pid}] Finalizó (código: ${code}, señal: ${signal}). Relanzando worker #${slot}...`);
    const newWorker = cluster.fork({ WORKER_ID: slot });
    workerSlots.set(newWorker.id, slot);
    console.log(`  └─ [Nuevo Worker ${newWorker.process.pid}] Operativo en slot #${slot}.`);
  });
} else {
  // Código del Worker: Importa el servidor Express existente
  import('./index.js').catch(err => {
    console.error(`❌ [Worker ${process.pid}] Error al iniciar:`, err);
    process.exit(1);
  });
}
