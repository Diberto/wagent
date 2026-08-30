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
import { WhatsAppService } from './services/whatsapp.js';
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
      imgSrc: ["'self'", "data:", "blob:", "*"],
      mediaSrc: ["'self'", "blob:", "data:", "*"],
      connectSrc: ["'self'", "ws:", "wss:", "*"]
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

// Instanciar servicio de WhatsApp con Baileys
const whatsapp = new WhatsAppService(io);

// Rutas de API REST
app.use('/api', createApiRouter(whatsapp, io));

// Gestión de conexiones WebSockets
io.on('connection', (socket) => {
  socket.emit('whatsapp:status', whatsapp.getStatus());
});

// Servir frontend en producción con optimización de caché
const clientDist = path.join(CONFIG.ROOT_DIR, 'client/dist');
if (fs.existsSync(clientDist)) {
  // Caché inmutable para archivos estáticos con hash
  app.use('/assets', express.static(path.join(clientDist, 'assets'), {
    maxAge: '1y',
    immutable: true
  }));

  // Servir el resto de archivos estáticos
  app.use(express.static(clientDist, {
    maxAge: '1h'
  }));

  // SPA fallback
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    whatsapp.initialize();
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
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Recibida señal ${signal}. Cerrando servidor de forma segura...`);
  server.close(() => {
    console.log('Servidor HTTP cerrado.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forzando cierre por tiempo límite.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
