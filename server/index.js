import express from 'express';
import http from 'http';
import cluster from 'cluster';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config/index.js';
import { db } from './services/database.js';
import { WhatsAppManager } from './services/whatsapp.js';
import { BackupService } from './services/backup.js';
import { UpdateService } from './services/updater.js';
import { auditLogger } from './services/auditLogger.js';
import { createApiRouter } from './routes/api.js';
import { createExternalApiRouter, setupMcpHttpEndpoints } from './routes/externalApi.js';
import externalConnectorsRouter from './routes/externalConnectorsRoutes.js';
import { externalConnectorService } from './services/externalConnectorService.js';
import meatMarketRouter from './routes/meatMarketRoutes.js';
import { meatMarketService } from './services/meatMarketService.js';
import { analyticsRouter } from './routes/analyticsRoutes.js';
import { connectDB } from '../db.js';

const app = express();
const server = http.createServer(app);

// Habilitar trust proxy para entornos de producción detrás de proxies reversos (Nginx, Hostinger, Cloudflare)
app.set('trust proxy', 1);

// Configuración de Seguridad en Producción (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "*", "https://*.tile.openstreetmap.org", "https://*.openstreetmap.org", "https://*.basemaps.cartocdn.com", "https://basemaps.cartocdn.com"],
      mediaSrc: ["'self'", "blob:", "data:", "*"],
      connectSrc: ["'self'", "ws:", "wss:", "*", "https://nominatim.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
      frameSrc: ["'self'", "https://www.openstreetmap.org", "https://*.openstreetmap.org", "https://maps.google.com", "https://*.mercadopago.com.ar", "https://*.mercadopago.com"],
      childSrc: ["'self'", "blob:", "https://www.openstreetmap.org", "https://*.openstreetmap.org"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compresión Gzip / Deflate para alta velocidad
app.use(compression());

// Configurar WebSockets (polling -> websocket upgrade garantiza compatibilidad detrás de Nginx/Cloudflare/Hostinger)
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 20000
});

// Vincular WebSockets a la Base de Datos, Audit Logger y Updater para sincronización en tiempo real
db.setIo(io);
auditLogger.setIo(io);
UpdateService.setSocketIO(io);
externalConnectorService.setIo(io);
meatMarketService.setIo(io);

// Middleware estándar
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiter para APIs con soporte proxy
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 3000, // Máximo 3000 peticiones por ventana
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Demasiadas solicitudes desde esta IP, por favor intenta nuevamente más tarde.' }
});
app.use('/api', apiLimiter);

// Servir archivos multimedia con caché optimizado
if (!fs.existsSync(CONFIG.MEDIA_DIR)) {
  fs.mkdirSync(CONFIG.MEDIA_DIR, { recursive: true });
}
app.use('/media', express.static(CONFIG.MEDIA_DIR, {
  maxAge: '7d',
  etag: true
}));

// Instanciar Gestor Multi-Instancia de WhatsApp con Baileys
const whatsapp = new WhatsAppManager(io);

// Rutas de API REST Interna
app.use('/api', createApiRouter(whatsapp, io));

// Rutas de API REST Externa v1 y Protocolo MCP (Model Context Protocol)
app.use('/api/v1/external', createExternalApiRouter());
setupMcpHttpEndpoints(app);

// Conectores Salientes y Clientes MCP hacia otros sistemas
app.use('/api/connectors', externalConnectorsRouter);

// Inteligencia de Mercado de Carnes (MAG, Retail Benchmark, IPC Inflación, FOB)
app.use('/api/market', meatMarketRouter);

// Estadísticas 360, Informes Personalizados y Copilot BI de Negocio
app.use('/api/analytics', analyticsRouter);

// Gestión de conexiones WebSockets
io.on('connection', (socket) => {
  socket.emit('whatsapp:status', whatsapp.getStatus('default'));
  socket.emit('whatsapp:sessions', whatsapp.getAllSessionsStatus());
});

// Servir frontend en producción con optimización de caché
const clientDist = path.join(CONFIG.ROOT_DIR, 'client/dist');
if (fs.existsSync(clientDist)) {
  // Caché inmutable para assets con hash (JS/CSS)
  app.use('/assets', express.static(path.join(clientDist, 'assets'), {
    maxAge: '1y',
    immutable: true
  }));

  // Auto-recuperación para bundles viejos solicitados por navegadores con caché persistente
  app.get('/assets/*.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send("console.log('🔄 Actualizando bundle desactualizado a la última versión...'); window.location.reload(true);");
  });

  // Servir el resto de archivos estáticos evitando caché en archivos HTML
  app.use(express.static(clientDist, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  // SPA fallback garantizando index.html fresco
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // Fallback si aún no se ha compilado el frontend
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path.startsWith('/media')) {
      return res.status(404).json({ error: 'Endpoint no encontrado', path: req.path });
    }
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WAgent CRM - Servidor Activo</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
          .card { background: #111b21; border: 1px solid #202c33; padding: 2.5rem; border-radius: 1.25rem; max-width: 520px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center; }
          h1 { color: #25d366; margin-top: 0; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
          p { color: #8696a0; font-size: 0.95rem; line-height: 1.5; }
          .cmd { background: #202c33; padding: 0.75rem 1rem; border-radius: 0.75rem; color: #53bdeb; font-family: monospace; font-size: 0.95rem; margin: 1.25rem 0; border: 1px solid #2a3942; }
          .btn { display: inline-block; background: #25d366; color: #0b141a; text-decoration: none; font-weight: 700; padding: 0.75rem 1.5rem; border-radius: 0.75rem; margin-top: 1rem; font-size: 0.9rem; }
          .endpoints { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid #202c33; font-size: 0.8rem; color: #8696a0; }
          .endpoints a { color: #53bdeb; text-decoration: none; margin: 0 0.5rem; }
          .endpoints a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🚀 WAgent CRM - Backend Activo</h1>
          <p>El servidor Fullstack está ejecutándose con éxito en el puerto <strong>${CONFIG.PORT}</strong>.</p>
          <p>Para visualizar la interfaz visual (React + Vite), compila el frontend ejecutando en la consola:</p>
          <div class="cmd">npm run build</div>
          <p>O inicia el entorno interactivo completo con:</p>
          <div class="cmd">npm run dev</div>
          <div class="endpoints">
            <strong>Endpoints del Sistema:</strong><br>
            <a href="/api/health">Salud API</a> •
            <a href="/api/v1/external/health">API Externa</a> •
            <a href="/mcp/info">Protocolo MCP</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });
}

const execAsync = promisify(exec);

/**
 * En servidores Linux de producción, una vez que este proceso es dueño legítimo de PORT,
 * purga cualquier proceso duplicado / zombie (en PM2 o huérfano en /proc) que ejecute server/index.js
 * en este mismo directorio para impedir desconexiones en bucle 440 (connectionReplaced) en WhatsApp.
 */
async function cleanupCompetingInstances() {
  if (process.platform === 'win32' || cluster.isWorker) return;

  const rootResolved = path.resolve(CONFIG.ROOT_DIR);
  let cleanedCount = 0;

  // 1. Purgar entradas duplicadas en PM2 que apunten al mismo proyecto pero tengan otro PID
  try {
    const { stdout } = await execAsync('pm2 jlist', { timeout: 6000 });
    const jsonStart = stdout ? stdout.indexOf('[') : -1;
    if (jsonStart !== -1) {
      const pmList = JSON.parse(stdout.slice(jsonStart));
      if (Array.isArray(pmList)) {
        const myPmEntry = pmList.find(p =>
          Number(p?.pid) === process.pid ||
          (process.env.pm_id !== undefined && Number(p?.pm_id) === Number(process.env.pm_id))
        );

        let pmDeleted = false;
        for (const proc of pmList) {
          const procPid = Number(proc?.pid || 0);
          const procPmId = proc?.pm_id;
          if (procPid === process.pid) continue;
          if (myPmEntry && Number(procPmId) === Number(myPmEntry.pm_id)) continue;

          const execPath = String(proc?.pm2_env?.pm_exec_path || '');
          const pmCwd = String(proc?.pm2_env?.pm_cwd || '');
          const name = String(proc?.name || '');
          const isSameProject =
            (pmCwd && path.resolve(pmCwd) === rootResolved) ||
            (execPath && path.resolve(execPath).startsWith(rootResolved)) ||
            name === 'wagent-crm' ||
            name === 'wagent-cluster';

          if (isSameProject && procPmId !== undefined) {
            console.warn(`🧹 [Single-Instance] Eliminando entrada PM2 duplicada conflictiva: ${name} (pm_id=${procPmId}, pid=${procPid})...`);
            await execAsync(`pm2 delete ${procPmId}`, { timeout: 5000 }).catch(() => {});
            pmDeleted = true;
            cleanedCount++;
          }
        }

        if (pmDeleted) {
          await execAsync('pm2 save', { timeout: 5000 }).catch(() => {});
        }
      }
    }
  } catch (_) {
    // PM2 no instalado o no accesible para este usuario; continuar con inspección /proc
  }

  // 2. Si NO existe ya otro líder activo con lease vigente, reclamar liderazgo y purgar workers legados / huérfanos en /proc
  //    (cubre tanto "node server/index.js" como workers hermanos "lsnode:/home/..." en Hostinger CloudLinux / LiteSpeed)
  const hasRemoteLeader = whatsapp?.primarySession?.hasActiveRemoteLeader?.() || false;
  if (!hasRemoteLeader) {
    whatsapp?.primarySession?.acquireLeaderLock?.();

    try {
      if (fs.existsSync('/proc')) {
        // Construir conjunto de ancestros intocables (init, lshttpd, lsnode master, PM2 daemon)
        const ancestorPids = new Set([1, process.pid, process.ppid]);
        let cursorPid = process.ppid;
        for (let hop = 0; hop < 16 && cursorPid > 1; hop++) {
          ancestorPids.add(cursorPid);
          try {
            const stRaw = fs.readFileSync(`/proc/${cursorPid}/status`, 'utf8');
            const m = stRaw.match(/^PPid:\s*(\d+)/m);
            const nextPpid = m ? Number(m[1]) : 0;
            if (!nextPpid || ancestorPids.has(nextPpid)) break;
            cursorPid = nextPpid;
          } catch (_) {
            break;
          }
        }

        const entries = fs.readdirSync('/proc');
        const zombiePids = [];

        for (const entry of entries) {
          if (!/^\d+$/.test(entry)) continue;
          const pidNum = Number(entry);
          if (pidNum <= 1 || ancestorPids.has(pidNum)) continue;

          try {
            const cmdRaw = fs.readFileSync(`/proc/${pidNum}/cmdline`, 'utf8');
            if (!cmdRaw) continue;
            const args = cmdRaw.split('\0').filter(Boolean);
            if (args.length === 0) continue;

            const firstArg = args[0] || '';
            const binBase = path.basename(firstArg);
            const isLsNodeWorker = firstArg.startsWith('lsnode:') || args.some(a => a.includes('lsnode.js'));
            const isNodeServer = (binBase === 'node' || binBase === 'nodejs') && args.some(a =>
              a === 'server/index.js' ||
              a.endsWith('/server/index.js') ||
              a.includes('lsnode.js')
            );

            if (!isLsNodeWorker && !isNodeServer) continue;

            let procCwd = '';
            try {
              procCwd = path.resolve(fs.readlinkSync(`/proc/${pidNum}/cwd`));
            } catch (_) {}

            const sameDir =
              procCwd === rootResolved ||
              firstArg.includes(rootResolved) ||
              args.some(a => a.startsWith(rootResolved));

            if (sameDir) {
              zombiePids.push(pidNum);
            }
          } catch (_) {}
        }

        for (const zPid of zombiePids) {
          try {
            console.warn(`🧹 [Single-Instance] Terminando worker legado/duplicado sin lease (PID ${zPid})...`);
            process.kill(zPid, 'SIGTERM');
            cleanedCount++;
          } catch (_) {}
        }

        if (zombiePids.length > 0) {
          await new Promise(r => setTimeout(r, 1200));
          for (const zPid of zombiePids) {
            try {
              process.kill(zPid, 0);
              process.kill(zPid, 'SIGKILL');
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  if (cleanedCount > 0) {
    console.log(`✅ [Single-Instance] ${cleanedCount} instancia(s) duplicada(s) purgada(s). Esperando 1.8s antes de conectar WhatsApp...`);
    await new Promise(r => setTimeout(r, 1800));
  }
}

// Iniciar servidor con guardia estricta de instancia única
const PORT = CONFIG.PORT;
let isExitingDuplicate = false;

const abortDuplicateInstance = (err) => {
  if (isExitingDuplicate) return;
  isExitingDuplicate = true;
  console.error(`❌ [Single-Instance Guard] El puerto ${PORT} ya está ocupado por otra instancia activa (${err.message}). Cerrando PID ${process.pid} sin iniciar WhatsApp para evitar conflicto 440...`);
  try {
    whatsapp.shutdownAll();
  } catch (_) {}
  setTimeout(() => {
    process.exit(1);
  }, 3000);
};

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    abortDuplicateInstance(err);
    return;
  }
  console.error('❌ Error en servidor HTTP:', err);
});

server.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🚀 SERVIDOR CRM WHATSAPP EN MODO PRODUCCIÓN (PID ${process.pid})`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Seguridad Helmet & Compresión Gzip activadas`);
  console.log(`📁 Directorio Multimedia: ${CONFIG.MEDIA_DIR}`);
  console.log('====================================================');

  // Purgar posibles procesos zombies o duplicados antes de reclamar la sesión de WhatsApp
  await cleanupCompetingInstances();

  // En modo cluster multi-worker solo el worker primario #1 debe conectar sockets Baileys
  const shouldInitWhatsApp = !cluster.isWorker || !process.env.WORKER_ID || process.env.WORKER_ID === '1';
  if (shouldInitWhatsApp) {
    // Inicializar WhatsApp automáticamente si ya existen credenciales guardadas válidas (tanto maestra como de usuarios)
    await whatsapp.initializeAllSavedSessions().catch(err => {
      console.error('Error inicializando sesiones guardadas de WhatsApp:', err);
    });
  } else {
    console.log(`ℹ️ [Cluster Worker #${process.env.WORKER_ID}] Omitiendo conexión duplicada de Baileys (gestionada por Worker #1).`);
  }

  // Inicializar conexión con MongoDB Atlas si está configurado en Hostinger
  connectDB().catch(err => console.warn('Aviso MongoDB:', err.message));

  // Inicializar sistema de respaldos automáticos programados
  BackupService.initAutoBackupScheduler();

  // Inicializar planificador de auto-actualización continua desde GitHub
  UpdateService.initAutoUpdateScheduler(10);
});

// Manejo de excepciones no capturadas para alta disponibilidad
process.on('uncaughtException', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    abortDuplicateInstance(err);
    return;
  }
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Apagado elegante (Graceful Shutdown)
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Recibida señal ${signal}. Cerrando servidor de forma segura...`);
  
  try {
    // 1. Crear respaldo preventivo antes de apagar
    console.log('💾 Creando respaldo de seguridad previo al apagado/actualización...');
    BackupService.createBackup('pre-update-shutdown');
  } catch (err) {
    console.error('Error guardando backup de apagado:', err);
  }

  try {
    // 2. Cerrar sockets y watchdogs de WhatsApp de forma limpia sin destruir credenciales
    console.log('📱 Desconectando sockets de WhatsApp de forma ordenada (preservando sesión)...');
    if (whatsapp && typeof whatsapp.shutdownAll === 'function') {
      whatsapp.shutdownAll();
    }
  } catch (err) {
    console.error('Error cerrando sesiones de WhatsApp:', err);
  }

  server.close(() => {
    console.log('✅ Servidor HTTP cerrado correctamente.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forzando cierre por tiempo límite.');
    process.exit(1);
  }, 8000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
