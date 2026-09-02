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

  // Lanzar workers
  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork({ WORKER_ID: i + 1 });
    console.log(`  └─ [Worker ${worker.process.pid}] Iniciado como Instancia #${i + 1}`);
  }

  // Auto-healing si algún worker muere
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️ [Worker ${worker.process.pid}] Finalizó (código: ${code}, señal: ${signal}). Relanzando worker de reemplazo...`);
    const newWorker = cluster.fork();
    console.log(`  └─ [Nuevo Worker ${newWorker.process.pid}] Operativo y balanceando tráfico.`);
  });
} else {
  // Código del Worker: Importa el servidor Express existente
  import('./index.js').catch(err => {
    console.error(`❌ [Worker ${process.pid}] Error al iniciar:`, err);
    process.exit(1);
  });
}
