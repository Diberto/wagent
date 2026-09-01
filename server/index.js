import express from 'express';
import http from 'http';
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
import { createApiRouter } from './routes/api.js';

const app = express();
const server = http.createServer(app);

// Configuración de Seguridad en Producción (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "*", "https://*.tile.openstreetmap.org", "https://*.openstreetmap.org"],
      mediaSrc: ["'self'", "blob:", "data:", "*"],
      connectSrc: ["'self'", "ws:", "wss:", "*", "https://nominatim.openstreetmap.org"],
      frameSrc: ["'self'", "https://www.openstreetmap.org", "https://*.openstreetmap.org", "https://maps.google.com", "https://*.mercadopago.com.ar", "https://*.mercadopago.com"],
      childSrc: ["'self'", "blob:", "https://www.openstreetmap.org", "https://*.openstreetmap.org"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compresión Gzip / Deflate para alta velocidad
app.use(compression());

// Configurar WebSockets
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Vincular WebSockets a la Base de Datos para sincronización en tiempo real
db.setIo(io);

// Middleware estándar
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiter para APIs
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 2000, // Máximo 2000 peticiones por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
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

// Rutas de API REST
app.use('/api', createApiRouter(whatsapp, io));

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
}

// Iniciar servidor
const PORT = CONFIG.PORT;
server.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🚀 SERVIDOR CRM WHATSAPP EN MODO PRODUCCIÓN`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Seguridad Helmet & Compresión Gzip activadas`);
  console.log(`📁 Directorio Multimedia: ${CONFIG.MEDIA_DIR}`);
  console.log('====================================================');

  // Inicializar WhatsApp automáticamente si ya existen credenciales guardadas
  const authDir = CONFIG.AUTH_DIR;
  if (fs.existsSync(authDir) && fs.readdirSync(authDir).length > 0) {
    console.log('Credenciales de sesión encontradas. Conectando a WhatsApp...');
    whatsapp.initializePrimary();
  }

  // Inicializar sistema de respaldos automáticos programados
  BackupService.initAutoBackupScheduler();
});

// Manejo de excepciones no capturadas para alta disponibilidad
process.on('uncaughtException', (err) => {
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
    // 2. Cerrar sockets de WhatsApp de forma limpia sin destruir credenciales
    console.log('📱 Desconectando sockets de WhatsApp de forma ordenada (preservando sesión)...');
    const sessions = whatsapp.getAllSessions();
    for (const s of sessions) {
      if (s.sock) {
        try {
          s.sock.ev.removeAllListeners();
          s.sock.end(undefined);
        } catch (e) {}
      }
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
