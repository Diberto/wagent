import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, jidNormalizedUser, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import { CONFIG } from '../config/index.js';
import { db, isLidIdentifier, normalizePhoneNumber } from './database.js';
import { AIService } from './ai.js';
import { AudioConverter } from './audioConverter.js';
import { SpeechService } from './speech.js';
import { MetaWhatsAppService } from './metaWhatsApp.js';
import { inventoryService } from './inventoryService.js';
import { invoiceOcrService } from './invoiceOcrService.js';
import { imageService } from './imageService.js';

/**
 * Desenpaqueta mensajes anidados (efímeros, view-once, multimedia con subtítulo)
 */
function unwrapMessageContent(msgContent) {
  if (!msgContent) return null;
  let content = msgContent;
  
  while (
    content?.ephemeralMessage?.message ||
    content?.viewOnceMessage?.message ||
    content?.viewOnceMessageV2?.message ||
    content?.documentWithCaptionMessage?.message ||
    content?.deviceSentMessage?.message
  ) {
    content = content.ephemeralMessage?.message ||
              content.viewOnceMessage?.message ||
              content.viewOnceMessageV2?.message ||
              content.documentWithCaptionMessage?.message ||
              content.deviceSentMessage?.message;
  }
  return content;
}

/**
 * Extrae texto de cualquier estructura de mensaje de WhatsApp
 */
function extractTextMessage(content) {
  if (!content) return '';
  return content.conversation ||
         content.extendedTextMessage?.text ||
         content.imageMessage?.caption ||
         content.videoMessage?.caption ||
         content.documentMessage?.caption ||
         content.buttonsResponseMessage?.selectedDisplayText ||
         content.listResponseMessage?.title ||
         content.templateButtonReplyMessage?.selectedId ||
         '';
}

/**
 * Valida rigurosamente si un archivo creds.json contiene una sesión autenticada y registrada en Baileys
 */
export function isCredsValid(credsPath) {
  try {
    if (!fs.existsSync(credsPath)) return false;
    const stat = fs.statSync(credsPath);
    if (stat.size <= 40) return false;
    const raw = fs.readFileSync(credsPath, 'utf8');
    const content = JSON.parse(raw);
    if (!content) return false;

    // Una sesión SOLO es válida si el usuario ya vinculó el teléfono exitosamente
    if (content.registered !== true) {
      // Si el archivo fue escrito en los últimos 90 segundos durante el proceso activo de handshake QR
      const isFresh = (Date.now() - stat.mtimeMs) < 90000;
      if (isFresh && content.me?.id) return true;
      return false;
    }
    if (!content.me || !content.me.id) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Servicio Central de Baileys WhatsApp con Manejo Multi-Sesión y Respaldo Atómico
 */
export class WhatsAppService {
  constructor(io, sessionId = 'default', authDir = null) {
    this.io = io;
    this.sessionId = sessionId;
    this.authDir = authDir || (sessionId === 'default' ? CONFIG.AUTH_DIR : path.join(CONFIG.DATA_DIR, `auth_info_baileys_${sessionId}`));
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.qrCode = null;
    this.qrDataUrl = null;
    this.user = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.lidToPhoneMap = new Map();
    this.phoneToLidMap = new Map();
    this.lastConnectedAt = 0;
    this.rapidDisconnectCount = 0;
    this.connectingStartedAt = 0;
    this.lastPingAt = 0;
    this.explicitlyDisconnected = false;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
    this.outboxQueue = [];
    this.isDrainingOutbox = false;
    this.activeReplyDebounce = new Map();
    this.processingChats = new Set();
    this.recoveredMsgIds = new Set();
    this.isRecoveringUnanswered = false;
    this.startWatchdog();
  }

  /**
   * Comprueba si la sesión posee archivos creds.json válidos (activos o en backup)
   */
  hasSavedSession() {
    const credsActive = path.join(this.authDir, 'creds.json');
    const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
    const credsBackup = path.join(backupDir, 'creds.json');
    return isCredsValid(credsActive) || isCredsValid(credsBackup);
  }

  /**
   * Espera de forma asíncrona y no bloqueante a que el socket de WhatsApp esté en estado 'connected' y abierto.
   * Si el socket se está reconectando activamente, aguarda hasta timeoutMs en lugar de arrojar error inmediato.
   */
  async waitForConnection(timeoutMs = 12000) {
    if (this.status === 'connected' && this.sock && (this.sock.ws?.isOpen || this.sock.ws?.socket?.readyState === 1)) {
      return true;
    }

    // Si la sesión fue desconectada explícitamente o está esperando escaneo de QR, no esperar
    if (this.explicitlyDisconnected || this.status === 'qr_ready') {
      return false;
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const isWsReady = this.status === 'connected' && this.sock && (this.sock.ws?.isOpen || this.sock.ws?.socket?.readyState === 1);
        if (isWsReady) {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        // Si expiró el tiempo de gracia
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        // Si cambió a desconexión explícita o QR
        if (this.explicitlyDisconnected || this.status === 'qr_ready') {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }
      }, 300);
    });
  }

  /**
   * Planifica un único reintento de conexión cancelando timers previos duplicados
   */
  scheduleReconnect(delayMs = 3000, { resetAuth = false } = {}) {
    this.cancelScheduledReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isInitializing = false;
      this.initialize({ resetAuth });
    }, delayMs);
  }

  cancelScheduledReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Inicia el Watchdog / Heartbeat de autorecuperación 24/7
   */
  startWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    // Chequeo proactivo cada 20 segundos
    this.watchdogTimer = setInterval(async () => {
      try {
        await this.runWatchdogCheck();
      } catch (wErr) {
        console.warn(`[Watchdog ${this.sessionId}] Error en ciclo de verificación:`, wErr.message);
      }
    }, 20000);
    if (this.watchdogTimer?.unref) {
      this.watchdogTimer.unref();
    }
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Chequea la salud del socket, previene estados zombies y autoreconecta si hay credenciales válidas
   */
  async runWatchdogCheck() {
    // Si el usuario desconectó explícitamente desde el panel o está en modo QR activo, NUNCA interferir
    if (this.explicitlyDisconnected || this.status === 'qr_ready') {
      return;
    }

    // Si ya existe un temporizador de reconexión programado, dejarlo actuar ordenadamente
    if (this.reconnectTimer) {
      return;
    }

    // Si está inicializando, verificar que no haya quedado estancado (timeout de 90s)
    if (this.isInitializing) {
      const initDuration = Date.now() - (this.connectingStartedAt || Date.now());
      if (initDuration > 90000) {
        console.warn(`⏱️ [Watchdog ${this.sessionId}] Conexión estancada durante ${Math.round(initDuration / 1000)}s. Reseteando socket para reintentar...`);
        this.isInitializing = false;
        this.status = 'disconnected';
        this.emitStatus();
        this.initialize();
      }
      return;
    }

    const credsActive = path.join(this.authDir, 'creds.json');
    const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
    const credsBackup = path.join(backupDir, 'creds.json');
    const hasValidCreds = isCredsValid(credsActive) || isCredsValid(credsBackup);

    // 1. Estado marcado como 'connected': Verificar que el WebSocket realmente esté vivo
    if (this.status === 'connected') {
      const ws = this.sock?.ws;
      // En Baileys sock.ws es un WebSocketClient (.isOpen: boolean, ws.socket?.readyState: 1 = OPEN, 0 = CONNECTING)
      const isWsAlive = ws ? (ws.isOpen === true || ws.socket?.readyState === 1 || ws.socket?.readyState === 0) : false;

      // Solo declarar zombie si ha pasado gracia inicial de 30s y el socket realmente se cerró
      const connectedDuration = this.lastConnectedAt ? (Date.now() - this.lastConnectedAt) : 0;
      if (!isWsAlive && connectedDuration > 30000) {
        console.warn(`🚨 [Watchdog ${this.sessionId}] Socket zombie o cerrado detectado (isOpen: ${ws?.isOpen}, readyState: ${ws?.socket?.readyState ?? 'null'}). Forzando auto-reconexión...`);
        this.status = 'disconnected';
        this.emitStatus();
        this.isInitializing = false;
        this.initialize();
        return;
      }

      // Enviar presencia activa cada 60s para mantener abierta la tabla de NAT del router / ISP (solo tras >30s conectado estable)
      const now = Date.now();
      if (connectedDuration > 30000 && (!this.lastPingAt || (now - this.lastPingAt) >= 60000)) {
        this.lastPingAt = now;
        try {
          if (this.sock && typeof this.sock.sendPresenceUpdate === 'function') {
            await this.sock.sendPresenceUpdate('available');
          }
        } catch (pingErr) {
          // No-op
        }
      }
      return;
    }

    // 2. Estado 'connecting' estancado por más de 90s
    if (this.status === 'connecting') {
      const connectingDuration = Date.now() - (this.connectingStartedAt || Date.now());
      if (connectingDuration > 90000) {
        console.warn(`⏱️ [Watchdog ${this.sessionId}] Socket en 'connecting' durante >90s sin resolver. Reintentando...`);
        this.isInitializing = false;
        this.initialize();
      }
      return;
    }

    // 3. Estado 'disconnected' pero con credenciales válidas guardadas Y sin timer activo: Autoreconectar
    if (this.status === 'disconnected' && hasValidCreds && !this.reconnectTimer) {
      console.log(`🛡️ [Watchdog ${this.sessionId}] WhatsApp se encuentra desconectado pero posee sesión guardada válida. Autoreconectando automáticamente...`);
      this.isInitializing = false;
      this.initialize();
      return;
    }
  }

  /**
   * Respalda las credenciales de Baileys ÚNICAMENTE cuando la sesión está verificada, conectada y válida
   */
  backupAuthFiles() {
    try {
      const credsActive = path.join(this.authDir, 'creds.json');
      if (!this.sock?.user || this.status !== 'connected' || !isCredsValid(credsActive)) {
        return;
      }
      const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.copyFileSync(path.join(this.authDir, file), path.join(backupDir, file));
          }
        }
      }
    } catch (err) {
      console.error(`Error respaldando auth de WhatsApp [${this.sessionId}]:`, err);
    }
  }

  /**
   * Restaura las credenciales desde el backup si el directorio activo estuviera vacío o dañado
   */
  restoreAuthFromBackup() {
    try {
      const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
      const credsActive = path.join(this.authDir, 'creds.json');
      const credsBackup = path.join(backupDir, 'creds.json');

      const isCredsActiveValid = isCredsValid(credsActive);
      const isCredsBackupValid = isCredsValid(credsBackup);

      if (!isCredsActiveValid && isCredsBackupValid) {
        console.log(`🔄 Restaurando credenciales de WhatsApp [${this.sessionId}] desde backup seguro...`);
        if (!fs.existsSync(this.authDir)) {
          fs.mkdirSync(this.authDir, { recursive: true });
        }
        const files = fs.readdirSync(backupDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.copyFileSync(path.join(backupDir, file), path.join(this.authDir, file));
          }
        }
        console.log(`✅ Credenciales de WhatsApp [${this.sessionId}] restauradas.`);
      }
    } catch (err) {
      console.error(`Error restaurando auth desde backup [${this.sessionId}]:`, err);
    }
  }

  /**
   * Limpia archivos de autenticación tanto activos como de respaldo para evitar resurrección de credenciales inválidas
   */
  async clearAuthFiles({ clearBackup = false } = {}) {
    try {
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(this.authDir, file));
          } catch (e) {}
        }
        console.log(`🧹 Sesión [${this.sessionId}] purgada: archivos de auth eliminados de ${this.authDir}`);
      }

      if (clearBackup) {
        const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
        if (fs.existsSync(backupDir)) {
          const bFiles = fs.readdirSync(backupDir);
          for (const file of bFiles) {
            try {
              fs.unlinkSync(path.join(backupDir, file));
            } catch (e) {}
          }
          console.log(`🧹 Backup de sesión [${this.sessionId}] purgado de ${backupDir}`);
        }
      }

      // Si es la sesión default o admin central, limpiar directorios legados solo si clearBackup es true
      if (clearBackup && (this.sessionId === 'default' || this.sessionId === 'usr-central-admin')) {
        const legacyDirs = [
          path.join(CONFIG.DATA_DIR, 'auth_info_baileys_usr-central-admin'),
          path.join(CONFIG.DATA_DIR, 'backups', 'auth_backup_usr-central-admin')
        ];
        for (const lDir of legacyDirs) {
          if (fs.existsSync(lDir)) {
            const lFiles = fs.readdirSync(lDir);
            for (const file of lFiles) {
              try { fs.unlinkSync(path.join(lDir, file)); } catch (e) {}
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error purgando authDir de sesión [${this.sessionId}]:`, err);
    }
  }

  async initialize({ resetAuth = false } = {}) {
    if (this.isInitializing) return;
    this.cancelScheduledReconnect();
    this.isInitializing = true;
    this.connectingStartedAt = Date.now();

    try {
      if (resetAuth) {
        await this.clearAuthFiles({ clearBackup: true });
        this.reconnectAttempts = 0;
        this.rapidDisconnectCount = 0;
        this.explicitlyDisconnected = true;
      } else {
        this.explicitlyDisconnected = false;
      }

      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
          this.sock = null;
        } catch (e) {}
      }

      this.status = 'connecting';
      this.emitStatus();

      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // Si no es un reseteo explícito y faltan las credenciales activas, intentar restaurar backup válido
      if (!resetAuth) {
        this.restoreAuthFromBackup();
      }

      // Validar si las credenciales en authDir están corruptas o sin registrar
      const credsActive = path.join(this.authDir, 'creds.json');
      const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
      const credsBackup = path.join(backupDir, 'creds.json');

      if (fs.existsSync(credsActive) && !isCredsValid(credsActive)) {
        if (isCredsValid(credsBackup)) {
          console.warn(`⚠️ [${this.sessionId}] creds.json activo dañado pero backup seguro es VÁLIDO. Restaurando desde backup...`);
          this.restoreAuthFromBackup();
        } else if (resetAuth) {
          console.warn(`⚠️ [${this.sessionId}] Credenciales detectadas en ${this.authDir} son inválidas o incompletas. Purgando para generar nuevo QR limpio...`);
          await this.clearAuthFiles({ clearBackup: true });
          this.reconnectAttempts = 0;
          this.rapidDisconnectCount = 0;
        }
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      let version = [2, 3000, 1043857760];
      let isLatest = true;
      try {
        const versionRes = await fetchLatestBaileysVersion();
        version = versionRes.version;
        isLatest = versionRes.isLatest;
      } catch (vErr) {
        console.warn(`Aviso: usando versión estable de Baileys [${version.join('.')}]`);
      }

      console.log(`Iniciando Baileys WhatsApp [Sesión: ${this.sessionId}] v${version.join('.')} (Latest: ${isLatest})`);

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 2500,
        markOnlineOnConnect: false,
        getMessage: async () => undefined
      });

      // Guardar credenciales y respaldar automáticamente ante credenciales válidas
      this.sock.ev.on('creds.update', async () => {
        await saveCreds();
        const credsActive = path.join(this.authDir, 'creds.json');
        if (isCredsValid(credsActive)) {
          this.backupAuthFiles();
        }
      });

      // Eventos de conexión y QR
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (qr) {
          this.status = 'qr_ready';
          this.qrCode = qr;
          this.reconnectAttempts = 0;
          this.rapidDisconnectCount = 0;
          this.connectingStartedAt = 0;
          this.cancelScheduledReconnect();
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 10 });
            this.emitQR();
            this.emitStatus();
            console.log(`📌 [${this.sessionId}] Nuevo Código QR generado para vinculación.`);
          } catch (err) {
            console.error('Error generando DataURL del QR:', err);
          }
        }

        // Si el teléfono escanea el QR y la vinculación comienza con éxito
        if (isNewLogin) {
          console.log(`🎉 [${this.sessionId}] ¡Código QR escaneado y reconocido por el teléfono! Finalizando emparejamiento...`);
          this.status = 'connecting';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.emitStatus();
        }

        if (connection === 'connecting') {
          if (this.status !== 'qr_ready') {
            this.status = 'connecting';
            this.emitStatus();
          }
        }

        if (connection === 'close') {
          const err = lastDisconnect?.error;
          const statusCode = err?.output?.statusCode || (err instanceof Boom ? err.output?.statusCode : undefined) || err?.statusCode;
          const errorMsg = err?.output?.payload?.message || err?.message || String(err || 'Desconexión desconocida');

          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

          // Si es reinicio requerido (515) tras escanear el QR para completar el emparejamiento:
          if (isRestartRequired) {
            console.log(`🔄 [${this.sessionId}] Reinicio requerido por WhatsApp (515) para completar vinculación de sesión. Reconectando de inmediato...`);
            this.status = 'connecting';
            this.emitStatus();
            this.scheduleReconnect(300);
            return;
          }

          const isLoggedOut = statusCode === DisconnectReason.loggedOut || 
                             statusCode === 401 || 
                             statusCode === DisconnectReason.forbidden ||
                             statusCode === 403 ||
                             statusCode === DisconnectReason.multideviceMismatch ||
                             statusCode === 411;

          const isReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;

          console.log(`Conexión de WhatsApp cerrada [${this.sessionId}]. Motivo: ${statusCode} (${errorMsg}). LoggedOut: ${isLoggedOut}, Replaced: ${isReplaced}`);

          const credsActive = path.join(this.authDir, 'creds.json');
          const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
          const credsBackup = path.join(backupDir, 'creds.json');
          const hasSavedSession = isCredsValid(credsActive) || isCredsValid(credsBackup);

          // Si el socket se cerró durante la espera o rotación del QR y aún NO hay sesión registrada por el teléfono:
          // WhatsApp refresca el token de vinculación cada 30-40 segundos.
          // Mantener el QR en pantalla y solicitar el refresco de socket sin provocar parpadeo en la UI.
          if (!hasSavedSession && (this.status === 'qr_ready' || this.status === 'connecting' || !this.user)) {
            console.log(`🔄 [${this.sessionId}] Ciclo de rotación o refresco de QR (${statusCode}). Manteniendo QR visible y renovando socket...`);
            this.scheduleReconnect(1000);
            return;
          }

          this.status = 'disconnected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.user = null;
          this.connectingStartedAt = 0;
          this.isDrainingOutbox = false;
          this.emitStatus();

          // 1. Conflicto por otra instancia abierta en simultáneo (440)
          if (isReplaced) {
            console.warn(`⚠️ [${this.sessionId}] Sesión reemplazada (440): Se detectó otra conexión activa con esta misma cuenta de WhatsApp. Reintentando reconexión en 45 segundos...`);
            this.reconnectAttempts = 0;
            this.rapidDisconnectCount = 0;
            this.scheduleReconnect(45000);
            return;
          }

          // 2. Detección de bucle de desconexión intermitente rápida (Flapping Circuit Breaker)
          const sessionDurationMs = this.lastConnectedAt ? (Date.now() - this.lastConnectedAt) : 0;
          if (this.lastConnectedAt && sessionDurationMs < 8000) {
            this.rapidDisconnectCount = (this.rapidDisconnectCount || 0) + 1;
            console.warn(`⚠️ [${this.sessionId}] Desconexión rápida detectada (${this.rapidDisconnectCount}/4) tras solo ${Math.round(sessionDurationMs / 1000)}s.`);
          } else if (sessionDurationMs > 30000) {
            this.rapidDisconnectCount = 0;
          }

          if (this.rapidDisconnectCount >= 4) {
            console.warn(`⚠️ [${this.sessionId}] Detectado flapping intermitente. Restaurando desde backup de autenticación seguro y esperando 15s...`);
            this.rapidDisconnectCount = 0;
            this.restoreAuthFromBackup();
            this.scheduleReconnect(15000);
            return;
          }

          // 3. Sesión con error de autorización o revocada por WhatsApp (401, loggedOut)
          if (isLoggedOut) {
            const canRestore = isCredsValid(credsBackup);
            if (canRestore && !this._triedBackupRestore) {
              this._triedBackupRestore = true;
              console.warn(`⚠️ [${this.sessionId}] Desconexión de socket (código ${statusCode}). Restaurando credenciales desde backup de seguridad...`);
              this.restoreAuthFromBackup();
              this.scheduleReconnect(3000);
              return;
            }
            this._triedBackupRestore = false;
            console.log(`⚠️ Sesión [${this.sessionId}] desvinculada por WhatsApp (${statusCode}). Purgando credenciales activas para emitir nuevo QR...`);
            await this.clearAuthFiles({ clearBackup: false });
            this.reconnectAttempts = 0;
            this.rapidDisconnectCount = 0;
            this.scheduleReconnect(2500, { resetAuth: true });
            return;
          }

          // 4. Reconexión estándar 24/7 sin eliminación destructiva de credenciales
          this.reconnectAttempts++;
          const delayMs = Math.min(30000, Math.round(3000 * Math.pow(1.2, Math.min(this.reconnectAttempts, 8))));
          console.log(`🔄 [${this.sessionId}] Reintentando conexión automática 24/7 (intento #${this.reconnectAttempts}) en ${Math.round(delayMs / 1000)}s...`);
          this.scheduleReconnect(delayMs);
        } else if (connection === 'open') {
          console.log(`✅ ¡Conexión de WhatsApp establecida exitosamente [${this.sessionId}]!`);
          this.cancelScheduledReconnect();
          this.status = 'connected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.rapidDisconnectCount = 0;
          this.connectingStartedAt = 0;
          this._triedBackupRestore = false;
          this.lastConnectedAt = Date.now();
          this.lastPingAt = Date.now();
          this.explicitlyDisconnected = false;
          this.user = this.sock.user;
          this.emitStatus();
          // Asegurar respaldo de credenciales válidas y activas
          this.backupAuthFiles();

          // 1. Vaciar cola Outbox de mensajes que esperaban reconexión
          this.drainOutboxQueue().catch(err => {
            console.warn(`[Outbox ${this.sessionId}] Error vaciando cola tras reconexión:`, err.message);
          });

          // 2. Auto-recuperar mensajes de clientes que hayan quedado sin respuesta durante la desconexión
          setTimeout(() => {
            this.recoverUnansweredMessages().catch(err => {
              console.warn(`[Auto-Recuperación ${this.sessionId}] Error revisando mensajes sin responder:`, err.message);
            });
          }, 2500);
        }
      });

      // Evento de llamadas de voz / video entrantes
      this.sock.ev.on('call', async (calls) => {
        console.log('📞 Evento de llamada de WhatsApp recibido:', calls);
        for (const call of calls) {
          await this.handleIncomingCall(call);
        }
      });

      // Evento de sincronización de libreta y contactos de WhatsApp (Mapeo LID <-> Teléfono Real)
      this.sock.ev.on('contacts.upsert', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
          if (!c) continue;
          const phoneJid = c.id && c.id.includes('@s.whatsapp.net') ? c.id : null;
          const lidJid = c.lid && c.lid.includes('@lid') ? c.lid : (c.id && c.id.includes('@lid') ? c.id : null);
          if (phoneJid && lidJid) {
            this.lidToPhoneMap.set(lidJid, phoneJid);
            this.phoneToLidMap.set(phoneJid, lidJid);
            db.resolveLidToPhone(lidJid, phoneJid, c.notify || c.name);
          }
        }
      });

      this.sock.ev.on('contacts.update', (updates) => {
        if (!Array.isArray(updates)) return;
        for (const u of updates) {
          if (!u) continue;
          const phoneJid = u.id && u.id.includes('@s.whatsapp.net') ? u.id : null;
          const lidJid = u.lid && u.lid.includes('@lid') ? u.lid : null;
          if (phoneJid && lidJid) {
            this.lidToPhoneMap.set(lidJid, phoneJid);
            this.phoneToLidMap.set(phoneJid, lidJid);
            db.resolveLidToPhone(lidJid, phoneJid, u.notify || u.name);
          }
        }
      });

      // Evento de mensajes entrantes
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
          if (!msg.key || !msg.key.remoteJid) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;
          if (msg.key.remoteJid.endsWith('@g.us')) {
            // Escaneo pasivo silencioso de facturas en grupos de proveedores
            await this.handleGroupMessage(msg);
            continue;
          }

          await this.handleIncomingMessage(msg);
        }
      });

    } catch (error) {
      console.error('Error inicializando Baileys:', error);
      this.status = 'disconnected';
      this.emitStatus();
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Resuelve el JID telefónico real a partir de un JID de WhatsApp o LID
   */
  async resolvePhoneJid(jid) {
    if (!jid) return null;
    const clean = jidNormalizedUser(jid);
    if (clean.includes('@s.whatsapp.net')) return clean;
    if (!clean.includes('@lid')) return clean;

    // 1. En mapa de memoria
    if (this.lidToPhoneMap.has(clean)) {
      return this.lidToPhoneMap.get(clean);
    }

    // 2. Consultar repositorio Signal de Baileys
    try {
      const pn = await this.sock?.signalRepository?.lidMapping?.getPNFromLID?.(clean);
      if (pn) {
        const resolved = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
        this.lidToPhoneMap.set(clean, resolved);
        this.phoneToLidMap.set(resolved, clean);
        return resolved;
      }
    } catch (e) {}

    // 3. Consultar claves authState
    try {
      const keys = await this.sock?.authState?.keys?.get?.('lid-mapping', [clean]);
      if (keys && keys[clean]) {
        const resolved = keys[clean].includes('@') ? keys[clean] : `${keys[clean]}@s.whatsapp.net`;
        this.lidToPhoneMap.set(clean, resolved);
        this.phoneToLidMap.set(resolved, clean);
        return resolved;
      }
    } catch (e) {}

    // 4. Consultar en base de datos local
    const existingLead = db.getLead(clean);
    if (existingLead?.phone && !existingLead.phone.includes('@lid') && !isLidIdentifier(existingLead.phone)) {
      const rawDigits = existingLead.phone.replace(/\D/g, '');
      if (rawDigits.length >= 8) {
        const resolved = `${rawDigits}@s.whatsapp.net`;
        this.lidToPhoneMap.set(clean, resolved);
        return resolved;
      }
    }

    return null;
  }

  /**
   * Manejador de eventos de llamadas entrantes
   */
  async handleIncomingCall(call) {
    const callerJid = call.from;
    const cleanNumber = callerJid ? callerJid.split('@')[0] : '';
    const settings = db.getSettings();

    let lead = db.findOrCreateLead({
      jid: callerJid,
      phone: cleanNumber,
      pushName: `+${cleanNumber}`
    });

    const isAutoAnswerEnabled = settings.autoAnswerCalls !== false;
    const answerMethod = settings.autoAnswerCallMethod || 'elevenlabs'; // 'elevenlabs' | 'ai_voice_note' | 'ai_text_note'

    const isRinging = call.status === 'offer' || call.status === 'ringing' || call.status === 'call';
    const isMissed = call.status === 'timeout' || call.status === 'reject' || call.status === 'terminate';

    const callRecord = db.saveCall({
      chatId: callerJid,
      callerNumber: lead.phone || `+${cleanNumber}`,
      callerName: lead.pushName || lead.name,
      direction: 'incoming',
      status: isRinging ? 'ringing' : (isMissed ? 'missed' : 'completed'),
      duration: 0,
      timestamp: new Date().toISOString(),
      notes: `Llamada de voz de WhatsApp (${call.status}) - AutoAtención: ${isAutoAnswerEnabled ? answerMethod : 'Desactivada'}`,
      aiFollowUpSent: false
    });

    if (this.io) {
      this.io.emit('whatsapp:call', { call: callRecord, lead });
    }

    // Auto-atención inteligente al recibir la llamada
    if (isAutoAnswerEnabled) {
      // 1. Si está timbrando ('offer' o 'ringing'), rechazar elegantemente para descolgar e iniciar la respuesta inmediata
      if (isRinging) {
        try {
          if (this.sock?.rejectCall) {
            await this.sock.rejectCall(call.id, call.from);
          }
        } catch (e) {
          // Ignorar si ya colgó
        }
      }

      // 2. Programar respuesta inmediata al cliente
      setTimeout(async () => {
        try {
          // Verificar si ya se envió seguimiento previo para no duplicar
          const currentCall = db.getCall ? db.getCall(callRecord.id) : null;
          if (currentCall?.aiFollowUpSent) return;

          const clientName = lead.name && !lead.name.startsWith('+') ? lead.name : (lead.pushName && !lead.pushName.startsWith('+') ? lead.pushName : 'amigo');

          if (answerMethod === 'ai_text_note') {
            // Método 1: Mensaje de Texto Inmediato
            console.log(`💬 Auto-atendiendo llamada con Mensaje de Texto a ${callerJid}`);
            const textReply = `¡Hola ${clientName}! 🥩👋 Recibí tu llamada en República de la Carne. En este momento estoy atendiendo pedidos por WhatsApp. Contame qué cortes, combos o promos estás buscando hoy y te tomo el pedido al instante. 🙌`;
            
            if (this.status === 'connected') {
              try {
                await this.sendMessage(callerJid, textReply);
              } catch (sendErr) {
                console.warn('Advertencia enviando respuesta de llamada por WhatsApp:', sendErr.message);
              }
            }

            db.updateCall(callRecord.id, { aiFollowUpSent: true, status: 'completed', aiMethod: 'ai_text_note' });
            if (this.io) {
              this.io.emit('whatsapp:call:updated', { callId: callRecord.id, status: 'completed' });
            }
          } else {
            // Método 2 y 3: ElevenLabs Conversational Voice Note o Custom Voice Note
            console.log(`🎙️ Auto-atendiendo llamada con ${answerMethod === 'elevenlabs' ? 'Agente de Voz ElevenLabs' : 'Nota de Voz IA'} a ${callerJid}`);
            
            const followUpText = settings.callFollowUpMessage ||
              `¡Hola ${clientName}! 🥩 Gracias por comunicarte con República de la Carne. Recibí tu llamada. Contame qué cortes o combos estás buscando hoy o para cuántos comensales calculamos, y te paso precios y disponibilidad al instante. 🙌`;

            const speech = await SpeechService.textToSpeech(followUpText);

            if (speech.oggPath && fs.existsSync(speech.oggPath)) {
              if (this.status === 'connected') {
                try {
                  await this.sendVoiceNote(callerJid, speech.oggPath);
                  await this.sendTextMessage(callerJid, `🎙️ *[Asistente de Voz República de la Carne]*\n${followUpText}`);
                } catch (sendErr) {
                  console.warn('Advertencia enviando nota de voz de llamada por WhatsApp:', sendErr.message);
                }
              }

              db.updateCall(callRecord.id, { 
                aiFollowUpSent: true, 
                status: 'completed', 
                aiMethod: answerMethod,
                duration: speech.durationSeconds || 15 
              });

              const savedMsg = db.saveMessage({
                chatId: callerJid,
                sender: 'agent',
                type: 'audio',
                content: followUpText,
                mediaUrl: `/media/${path.basename(speech.mp3Path)}`,
                audioDuration: speech.durationSeconds,
                timestamp: new Date().toISOString(),
                status: 'sent'
              });

              if (this.io) {
                this.io.emit('chat:message', { message: savedMsg, lead });
                this.io.emit('whatsapp:call:updated', { callId: callRecord.id, status: 'completed' });
              }
            }
          }
        } catch (err) {
          console.error('Error en auto-atención de llamada:', err);
        }
      }, 1000);
    }
  }

  /**
   * MODO SILENCIOSO / PASIVO: Escucha imágenes y comprobantes en grupos de proveedores sin responder en el grupo
   */
  async handleGroupMessage(msg) {
    try {
      const groupJid = msg.key.remoteJid;
      const settings = db.getSettings();
      const silentGroups = Array.isArray(settings.silentGroups) ? settings.silentGroups : [];

      // Buscar si el grupo emisor está registrado en la lista de grupos silenciosos activos
      let matchedGroup = silentGroups.find(g => g.groupId === groupJid && g.active !== false);

      // Compatibilidad con configuración unitaria anterior si aún no se migró
      if (!matchedGroup && settings.supplierScanGroupId === groupJid && settings.supplierScanGroupEnabled !== false) {
        matchedGroup = {
          groupId: settings.supplierScanGroupId,
          groupName: 'Grupo Proveedores Principal',
          branchId: settings.defaultSupplierBranchId || 'br-1',
          expenseCategory: 'mercaderia',
          autoConfirm: Boolean(settings.autoConfirmGroupInvoices),
          active: true
        };
      }

      // Si el grupo no está configurado como receptor silencioso o está pausado, ignorar en silencio
      if (!matchedGroup) {
        return;
      }

      // Desenpaquetar contenido
      const rawMessage = msg.message;
      if (!rawMessage) return;
      const messageContent = unwrapMessageContent(rawMessage);
      if (!messageContent) return;

      const isImage = Boolean(messageContent.imageMessage);
      const isDocument = Boolean(messageContent.documentMessage);

      // Solo procesar si contiene archivo multimedia (foto de factura, remito o PDF)
      if (!isImage && !isDocument) return;

      console.log(`🧾 [Grupo WhatsApp "${matchedGroup.groupName || groupJid}"] Comprobante recibido. Iniciando análisis OCR TicketScan en modo pasivo...`);

      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      let localPath;
      let mediaUrl;
      let mimeType;

      if (isImage) {
        try {
          const optimized = await imageService.processAndOptimizeImage(buffer, `group_invoice_${Date.now()}_${msg.key.id}`);
          localPath = optimized.filePath;
          mediaUrl = optimized.url;
          mimeType = 'image/webp';
          console.log(`🖼️ [Grupo WhatsApp] Imagen convertida y guardada en WebP: ${mediaUrl}`);
        } catch (convErr) {
          console.warn('Fallo convirtiendo imagen a WebP, guardando como jpg fallback:', convErr.message);
          const filename = `group_invoice_${Date.now()}_${msg.key.id}.jpg`;
          localPath = path.join(CONFIG.MEDIA_DIR, filename);
          fs.writeFileSync(localPath, buffer);
          mediaUrl = `/media/${filename}`;
          mimeType = 'image/jpeg';
        }
      } else {
        const ext = path.extname(messageContent.documentMessage.fileName || '.pdf') || '.pdf';
        const filename = `group_invoice_${Date.now()}_${msg.key.id}${ext}`;
        localPath = path.join(CONFIG.MEDIA_DIR, filename);
        fs.writeFileSync(localPath, buffer);
        mediaUrl = `/media/${filename}`;
        mimeType = messageContent.documentMessage.mimetype || 'application/pdf';
      }

      // Procesar comprobante con Gemini Vision (TicketScan OCR)
      const ocrResult = await invoiceOcrService.analyzeInvoice(localPath, mimeType);
      if (ocrResult.success && ocrResult.data) {
        const extData = ocrResult.data;
        console.log(`✅ [Grupo WhatsApp] Factura extraída: ${extData.merchant} - Total: $${extData.total}`);

        const autoConfirm = matchedGroup.autoConfirm !== undefined ? Boolean(matchedGroup.autoConfirm) : Boolean(settings.autoConfirmGroupInvoices);
        const expenseCategory = matchedGroup.expenseCategory || 'mercaderia';
        const targetBranchId = matchedGroup.branchId || settings.defaultSupplierBranchId || 'br-1';

        // Registrar factura en el sistema con sucursal y rubro de gastos asignado a este grupo
        const registered = inventoryService.registerSupplierInvoice({
          supplierId: extData.supplierId,
          supplierName: extData.merchant || 'Proveedor de Grupo',
          invoiceNumber: extData.invoiceNumber,
          invoiceType: extData.invoiceType || 'Factura A',
          date: extData.date,
          branchId: targetBranchId,
          expenseCategory,
          items: extData.items || [],
          totalAmount: extData.total,
          mediaUrl,
          rawOcrData: extData,
          status: autoConfirm ? 'confirmed' : 'draft',
          notes: `Recibido automáticamente desde grupo WhatsApp "${matchedGroup.groupName || groupJid}" [Caso: ${expenseCategory}]`,
          operator: 'Bot Escáner Silencioso'
        });

        // Emitir notificación visual al panel web
        if (this.io) {
          this.io.emit('notification:new', {
            title: `🧾 Factura Proveedor Detectada`,
            message: `${extData.merchant || 'Proveedor'} - $${Number(extData.total || 0).toLocaleString('es-AR')} en ${registered.branchName} (${expenseCategory})`,
            type: 'inventory',
            tab: 'stock-transfers',
            data: registered
          });
          this.io.emit('invoices:sync', inventoryService.getSupplierInvoices());
          this.io.emit('stock:updated', { source: 'group_scan' });
        }

        // Si hay un teléfono de administrador configurado para alertas de compras, avisar por mensaje PRIVADO (nunca al grupo)
        if (settings.notifyAdminOnGroupInvoice && settings.adminNotifyPhone) {
          const adminJid = `${settings.adminNotifyPhone.replace(/\D/g, '')}@s.whatsapp.net`;
          const summaryMsg = `🔔 *[Comprobante Registrado desde Grupo]*\n\n` +
            `👥 *Grupo:* ${matchedGroup.groupName || groupJid}\n` +
            `📂 *Caso / Rubro:* ${expenseCategory.toUpperCase()}\n` +
            `🏢 *Proveedor:* ${extData.merchant || 'No especificado'}\n` +
            `📄 *Comprobante:* ${extData.invoiceType || 'Factura'} #${extData.invoiceNumber || 'S/N'}\n` +
            `💰 *Monto Total:* $${Number(extData.total || 0).toLocaleString('es-AR')}\n` +
            `📦 *Ítems/Cortes:* ${extData.items?.length || 0} detectados\n` +
            `🏪 *Sucursal Asignada:* ${registered.branchName}\n` +
            `⚡ *Estado:* ${registered.status === 'confirmed' ? 'Confirmado e ingresado a Stock' : 'Borrador pendiente de confirmación'}\n\n` +
            `Podés revisarlo o editarlo en la sección de Stock y Facturas del sistema.`;

          this.sendTextMessage(adminJid, summaryMsg).catch(err => console.warn('Error enviando aviso privado a admin:', err.message));
        }
      }
    } catch (err) {
      console.warn('⚠️ [Grupo WhatsApp] Error procesando comprobante silencioso:', err.message);
    }
  }

  /**
   * Procesa mensajes entrantes (texto, audios, fotos)
   */
  async handleIncomingMessage(msg) {
    const rawJid = msg.key.remoteJid;
    const jid = jidNormalizedUser(rawJid);
    const isFromMe = Boolean(msg.key.fromMe);

    // Desenpaquetar contenido
    const rawMessage = msg.message;
    if (!rawMessage) return;
    const messageContent = unwrapMessageContent(rawMessage);
    if (!messageContent) return;

    const pushName = msg.pushName || 'Contacto WhatsApp';
    
    // Detección precisa de número de teléfono real (incluso con identificadores @lid)
    let altJid = null;
    let realPhone = null;
    if (msg.key.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
      altJid = msg.key.remoteJidAlt;
      realPhone = altJid.split('@')[0];
    } else if (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net')) {
      altJid = msg.key.participant;
      realPhone = altJid.split('@')[0];
    } else if (jid.includes('@s.whatsapp.net')) {
      realPhone = jid.split('@')[0];
    } else if (jid.includes('@lid')) {
      const resolvedPhoneJid = await this.resolvePhoneJid(jid);
      if (resolvedPhoneJid) {
        altJid = resolvedPhoneJid;
        realPhone = resolvedPhoneJid.split('@')[0];
      }
    }

    // Obtener o reconciliar Lead único sin duplicados
    let lead = db.findOrCreateLead({
      jid,
      altJid,
      phone: realPhone,
      pushName,
      aiEnabled: true
    });

    // Sincronizar foto de perfil, estado de WhatsApp y pushName en segundo plano
    this.fetchAndSyncContactProfile(jid, pushName).catch(() => {});

    let textContent = '';
    let messageType = 'text';
    let mediaUrl = null;
    let audioDuration = 0;
    let isAudio = false;
    let isImage = false;
    let downloadedImagePath = null;

    // 1. Detección de texto
    const extractedText = extractTextMessage(messageContent);
    if (extractedText) {
      textContent = extractedText;
      messageType = 'text';
    }

    // 2. Detección de Notas de Voz / Audio
    if (messageContent.audioMessage) {
      isAudio = true;
      messageType = 'audio';
      audioDuration = messageContent.audioMessage.seconds || 0;

      try {
        console.log(`📥 Descargando nota de voz de ${jid}...`);
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const oggPath = path.join(CONFIG.MEDIA_DIR, `in_${Date.now()}_${msg.key.id}.ogg`);
        fs.writeFileSync(oggPath, buffer);

        // Convertir a MP3 para reproducción en el CRM (con fallback a OGG nativo)
        let playablePath = oggPath;
        try {
          playablePath = await AudioConverter.convertOggToMp3(oggPath);
        } catch (convErr) {
          console.warn('[WhatsApp] No se pudo convertir a MP3, usando OGG original:', convErr.message);
          playablePath = oggPath;
        }
        mediaUrl = `/media/${path.basename(playablePath)}`;

        // Transcribir audio a texto con IA
        try {
          textContent = await SpeechService.transcribeAudio(playablePath);
          console.log(`🎙️ Transcripción de audio: "${textContent}"`);
        } catch (sttErr) {
          console.warn('[WhatsApp] Error en transcripción:', sttErr.message);
          textContent = '🎤 [Nota de voz recibida]';
        }
      } catch (err) {
        console.error('Error procesando audio entrante:', err);
        textContent = '🎤 [Nota de voz recibida]';
      }
    } else if (messageContent.imageMessage || (messageContent.documentMessage && messageContent.documentMessage.mimetype?.startsWith('image/'))) {
      // 3. Detección de Imágenes (Productos, Comprobantes de Pago, Tickets)
      isImage = true;
      messageType = 'image';

      try {
        console.log(`📥 Descargando imagen de ${jid}...`);
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        let imgPath;
        try {
          const optimized = await imageService.processAndOptimizeImage(buffer, `img_${Date.now()}_${msg.key.id}`);
          imgPath = optimized.filePath;
          mediaUrl = optimized.url;
        } catch (convErr) {
          imgPath = path.join(CONFIG.MEDIA_DIR, `img_${Date.now()}_${msg.key.id}.jpg`);
          fs.writeFileSync(imgPath, buffer);
          mediaUrl = `/media/${path.basename(imgPath)}`;
        }
        downloadedImagePath = imgPath;
        textContent = messageContent.imageMessage?.caption || messageContent.documentMessage?.caption || '[Imagen / Comprobante recibido]';
        console.log(`📸 Imagen guardada en WebP/JPG: ${mediaUrl}`);
      } catch (err) {
        console.error('Error descargando imagen entrante:', err);
        textContent = messageContent.imageMessage?.caption || '[Foto recibida]';
      }
    }

    // Si no pudimos extraer nada con sentido, salir
    if (!textContent && !isAudio && !isImage) {
      return;
    }

    // Detección y actualización automática de teléfono si el cliente lo escribe en el chat
    if (!isFromMe && textContent) {
      const phoneRegexMatch = textContent.match(/(?:\+?54\s*9?\s*)?(?:35\d{1,2}|11|2\d{2,3})\s*[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
      if (phoneRegexMatch) {
        const rawFound = phoneRegexMatch[0];
        const digitsOnly = rawFound.replace(/\D/g, '');
        if (digitsOnly.length >= 8) {
          const norm = normalizePhoneNumber(rawFound);
          if (norm && (!lead.phone || lead.phone.startsWith('+1') || lead.phone.includes('@lid') || lead.phone.length < 8)) {
            console.log(`📱 Teléfono real detectado en texto para lead ${lead.id}: ${norm}`);
            db.updateLead(lead.id, { phone: norm });
            lead = db.getLead(jid);
          }
        }
      }
    }

    console.log(`📩 [WhatsApp ${isFromMe ? 'Saliente' : 'Entrante'}] De ${pushName} (${lead?.phone || jid}): "${textContent}" (Tipo: ${messageType})`);

    // Guardar mensaje en base de datos
    const savedMessage = db.saveMessage({
      id: msg.key.id,
      chatId: jid,
      sender: isFromMe ? 'agent' : 'user',
      type: messageType,
      content: textContent,
      mediaUrl,
      audioDuration,
      timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
      status: isFromMe ? 'sent' : 'received'
    });

    // Actualizar lead
    lead = db.getLead(jid);

    // Emitir mensaje en tiempo real al frontend sólo si no es un duplicado ya emitido
    if (this.io && !savedMessage._isDuplicate) {
      this.io.emit('chat:message', { message: savedMessage, lead });
    }

    // 4. Si el mensaje proviene de una SUCURSAL registrada (Encargado/Operador de Sucursal)
    const branch = !isFromMe ? (db.getBranchByPhone(jid) || (lead?.phone ? db.getBranchByPhone(lead.phone) : null)) : null;
    if (branch && !isFromMe) {
      console.log(`🏪 Mensaje interactivo recibido de la Sucursal: "${branch.name}" (${jid}): "${textContent}"`);
      await this.handleBranchOperatorMessage(branch, jid, textContent);
      return;
    }

    // 4.1 Si el mensaje proviene de un REPARTIDOR registrado
    const driver = !isFromMe ? (db.getDriverByPhone(jid) || (lead?.phone ? db.getDriverByPhone(lead.phone) : null)) : null;
    if (driver && !isFromMe) {
      console.log(`🛵 Mensaje interactivo recibido del Repartidor: "${driver.name}" (${jid}): "${textContent}"`);
      await this.handleDriverMessage(driver, jid, textContent);
      return;
    }

    // 5. Flujo Automático del Agente de Inteligencia Artificial (Atención al Cliente)
    // Se ejecuta solo si: no es un mensaje propio, la IA global está activa y el chat tiene IA activada
    const settings = db.getSettings();
    const isAiGloballyEnabled = Boolean(settings.autoReplyEnabled !== false);
    const isAiChatEnabled = Boolean(lead ? lead.aiEnabled !== false : true);

    if (!isFromMe && isAiGloballyEnabled && isAiChatEnabled) {
      this.scheduleDebouncedReply(jid, {
        incomingText: textContent,
        isAudio,
        isImage,
        downloadedImagePath,
        pushName,
        targetJid: altJid || jid
      });
    }
  }

  /**
   * Envía presencia visual de escritura ('composing') de manera segura
   */
  async sendTypingIndicator(targetJid) {
    if (!this.sock || this.status !== 'connected') return;
    try {
      await this.sock.sendPresenceUpdate('composing', targetJid);
    } catch (_) {}
  }

  /**
   * Consolida y deserializa múltiples mensajes rápidos del mismo cliente (Debounce anti-race-conditions)
   * Evita llamadas simultáneas en paralelo al LLM y protege la integridad del carrito de compras.
   */
  scheduleDebouncedReply(jid, data) {
    const existing = this.activeReplyDebounce.get(jid);
    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      if (data.incomingText && data.incomingText.trim()) {
        existing.texts.push(data.incomingText.trim());
      }
      if (data.isAudio) existing.isAudio = true;
      if (data.isImage && data.downloadedImagePath) {
        existing.isImage = true;
        existing.downloadedImagePath = data.downloadedImagePath;
      }
      if (data.targetJid) existing.targetJid = data.targetJid;
      if (data.pushName) existing.pushName = data.pushName;

      existing.timer = setTimeout(async () => {
        this.activeReplyDebounce.delete(jid);
        await this.executeAutoReply(jid, existing);
      }, 1600);
      return;
    }

    const entry = {
      texts: data.incomingText && data.incomingText.trim() ? [data.incomingText.trim()] : [],
      isAudio: Boolean(data.isAudio),
      isImage: Boolean(data.isImage),
      downloadedImagePath: data.downloadedImagePath || null,
      targetJid: data.targetJid || jid,
      pushName: data.pushName,
      timer: null
    };

    // Indicador inmediato en WhatsApp de que el agente comenzó a escribir
    this.sendTypingIndicator(entry.targetJid || jid).catch(() => {});

    entry.timer = setTimeout(async () => {
      this.activeReplyDebounce.delete(jid);
      await this.executeAutoReply(jid, entry);
    }, 1600);

    this.activeReplyDebounce.set(jid, entry);
  }

  /**
   * Ejecuta la generación y despacho seguro de la respuesta de IA para un chat consolidado
   */
  async executeAutoReply(jid, entry) {
    if (this.processingChats.has(jid)) {
      console.log(`⏳ [WhatsApp ${this.sessionId}] Chat ${jid} ya se encuentra procesando respuesta. Reintentando en 1s...`);
      setTimeout(() => this.executeAutoReply(jid, entry), 1000);
      return;
    }
    this.processingChats.add(jid);

    const targetJid = (await this.formatRecipientJid(entry.targetJid || jid)) || jid;
    const consolidatedText = entry.texts.length > 0 ? entry.texts.join('\n') : (entry.isAudio ? '🎤 [Nota de voz]' : 'Hola');

    console.log(`🤖 Agente de IA procesando respuesta automática para ${jid} (Mensajes acumulados: ${entry.texts.length}): "${consolidatedText.slice(0, 80)}..."`);

    let typingSafetyTimer = null;
    const clearTypingPresence = async () => {
      if (typingSafetyTimer) {
        clearTimeout(typingSafetyTimer);
        typingSafetyTimer = null;
      }
      if (this.sock) {
        try {
          await this.sock.sendPresenceUpdate('paused', targetJid);
          if (jid && jid !== targetJid) {
            await this.sock.sendPresenceUpdate('paused', jid);
          }
        } catch (_) {}
      }
    };

    try {
      if (this.sock) {
        try {
          await this.sock.sendPresenceUpdate('composing', targetJid);
          if (jid && jid !== targetJid) {
            await this.sock.sendPresenceUpdate('composing', jid);
          }
          typingSafetyTimer = setTimeout(() => {
            clearTypingPresence().catch(() => {});
          }, 4500);
        } catch (e) {}
      }

      let responseText = '';
      let shouldSendAudio = false;
      let audioPath = null;
      let audioMp3Path = null;
      let audioDuration = 0;

      if (entry.isImage && entry.downloadedImagePath && fs.existsSync(entry.downloadedImagePath)) {
        const visionResult = await SpeechService.analyzeImageWithAI({
          imagePath: entry.downloadedImagePath,
          caption: consolidatedText,
          jid
        });
        responseText = visionResult?.text || '';
      } else {
        const aiResponse = await AIService.generateReply({
          jid,
          incomingText: consolidatedText || 'Hola',
          isAudioInput: entry.isAudio
        });
        responseText = aiResponse?.text || '';
        shouldSendAudio = Boolean(aiResponse?.shouldSendAudio);
        audioPath = aiResponse?.audioOggPath || null;
        audioMp3Path = aiResponse?.audioMp3Path || null;
        audioDuration = aiResponse?.audioDuration || 0;
      }

      // Sanitizar COMPLETAMENTE cualquier etiqueta técnica interna [[...]] antes de enviar al cliente
      let cleanClientResponse = (responseText || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();

      const currentSettings = db.getSettings();
      if (currentSettings.mentionPluInChat === false || !currentSettings.mentionPluInChat) {
        cleanClientResponse = cleanClientResponse
          .replace(/\s*\[PLU\s*#?\d+\]/gi, '')
          .replace(/\s*\(PLU\s*#?\d+\)/gi, '');
      }

      if (!cleanClientResponse) {
        cleanClientResponse = '¡Hola! ¿En qué puedo asesorarte hoy con tu pedido en República de la Carne? 🥩';
      }

      await clearTypingPresence();

      console.log(`📤 Enviando respuesta a ${targetJid}: "${cleanClientResponse.slice(0, 80)}..." (Voz: ${shouldSendAudio})`);

      if (shouldSendAudio && audioPath && fs.existsSync(audioPath)) {
        const sent = await this.sendVoiceNote(targetJid, audioPath, { allowQueue: true, isAiReply: true, chatId: jid });
        const savedAiMsg = db.saveMessage({
          id: sent?.key?.id || (sent?.id && !sent.id.startsWith('outbox_') ? sent.id : null),
          chatId: jid,
          sender: 'agent',
          type: 'audio',
          content: cleanClientResponse,
          mediaUrl: audioMp3Path ? `/media/${path.basename(audioMp3Path)}` : null,
          audioDuration: audioDuration || 4,
          timestamp: new Date().toISOString(),
          status: sent?.key?.id ? 'sent' : 'pending'
        });
        if (this.io && !savedAiMsg._isDuplicate) {
          this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
        }
      } else {
        const sent = await this.sendTextMessage(targetJid, cleanClientResponse, { allowQueue: true, isAiReply: true, chatId: jid });
        const savedAiMsg = db.saveMessage({
          id: sent?.key?.id || (sent?.id && !sent.id.startsWith('outbox_') ? sent.id : null),
          chatId: jid,
          sender: 'agent',
          type: 'text',
          content: cleanClientResponse,
          timestamp: new Date().toISOString(),
          status: sent?.key?.id ? 'sent' : 'pending'
        });
        if (this.io && !savedAiMsg._isDuplicate) {
          this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
        }
      }
    } catch (err) {
      console.error('Error enviando respuesta automática de IA:', err);
    } finally {
      await clearTypingPresence();
      this.processingChats.delete(jid);
    }
  }

  /**
   * Vacía ordenadamente la cola Outbox de mensajes acumulados durante períodos de desconexión o reconexión
   */
  async drainOutboxQueue() {
    if (this.isDrainingOutbox || !this.outboxQueue || this.outboxQueue.length === 0) return;
    if (this.status !== 'connected' || !this.sock) return;

    this.isDrainingOutbox = true;
    console.log(`📦 [Outbox ${this.sessionId}] Despachando ${this.outboxQueue.length} mensaje(s) acumulado(s) durante la reconexión...`);

    const MAX_QUEUE_AGE_MS = 10 * 60 * 1000; // 10 minutos máx

    while (this.outboxQueue.length > 0) {
      if (this.status !== 'connected' || !this.sock) {
        console.warn(`⚠️ [Outbox ${this.sessionId}] Conexión cerrada durante el vaciado. Pausando outbox...`);
        break;
      }

      const item = this.outboxQueue.shift();
      const ageMs = Date.now() - item.createdAt;

      if (ageMs > MAX_QUEUE_AGE_MS) {
        console.warn(`⏱️ [Outbox ${this.sessionId}] Descartando mensaje vencido para ${item.jid} (${Math.round(ageMs / 1000)}s de antigüedad)`);
        if (item.reject) item.reject(new Error('Mensaje expirado en cola de reconexión'));
        continue;
      }

      try {
        let sent = null;
        if (item.type === 'audio' && (item.audioPath || item.audioBuffer)) {
          sent = await this.sendVoiceNote(item.jid, item.audioPath || item.audioBuffer, { allowQueue: false, isAiReply: false });
        } else if (item.type === 'image' && (item.imagePath || item.imageBuffer)) {
          sent = await this.sendImageMessage(item.jid, item.imagePath || item.imageBuffer, item.caption, { allowQueue: false, isAiReply: false });
        } else {
          sent = await this.sendTextMessage(item.jid, item.text, { allowQueue: false, isAiReply: false });
        }

        // Si era una respuesta de IA o mensaje que aún requería asentarse en DB
        if (item.isAiReply || item.saveToDb) {
          const savedAiMsg = db.saveMessage({
            id: sent?.key?.id,
            chatId: item.chatId || item.jid,
            sender: 'agent',
            type: item.type || 'text',
            content: item.text || item.caption || '',
            mediaUrl: item.audioMp3Path ? `/media/${path.basename(item.audioMp3Path)}` : null,
            audioDuration: item.audioDuration || 0,
            timestamp: new Date().toISOString(),
            status: 'sent'
          });

          if (this.io && !savedAiMsg._isDuplicate) {
            this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(item.chatId || item.jid) });
          }
        }

        if (item.resolve) item.resolve(sent);
        console.log(`✅ [Outbox ${this.sessionId}] Mensaje encolado entregado con éxito a ${item.jid}`);
      } catch (err) {
        console.error(`❌ [Outbox ${this.sessionId}] Error entregando mensaje encolado a ${item.jid}:`, err.message);
        if (item.reject) item.reject(err);
      }

      // Pausa respetuosa de 350ms para no saturar el canal de Baileys
      await new Promise(r => setTimeout(r, 350));
    }

    this.isDrainingOutbox = false;
  }

  /**
   * Examina los chats activos en la base de datos tras una reconexión para recuperar clientes que hayan escrito
   * durante la ventana de desconexión sin haber recibido respuesta del bot, garantizando que el flujo de compra continúe.
   */
  async recoverUnansweredMessages() {
    if (this.isRecoveringUnanswered || this.status !== 'connected' || !this.sock) return;
    this.isRecoveringUnanswered = true;

    try {
      const settings = db.getSettings();
      if (settings.autoReplyEnabled === false) return;

      const leads = db.getLeads() || [];
      const now = Date.now();
      const MAX_UNANSWERED_AGE_MS = 15 * 60 * 1000; // 15 minutos máx

      for (const lead of leads) {
        if (!lead || !lead.jid) continue;
        if (lead.aiEnabled === false) continue;
        if (this.activeReplyDebounce.has(lead.jid) || this.processingChats.has(lead.jid)) continue;
        if (this.outboxQueue.some(m => m.chatId === lead.jid || m.jid === lead.jid)) continue;

        // Omitir sucursales o repartidores registrados
        if (db.getBranchByPhone(lead.jid) || (lead.phone && db.getBranchByPhone(lead.phone))) continue;
        if (db.getDriverByPhone(lead.jid) || (lead.phone && db.getDriverByPhone(lead.phone))) continue;

        const msgs = db.getMessages(lead.jid, 6);
        if (!msgs || msgs.length === 0) continue;

        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg || lastMsg.sender !== 'user') continue;

        const msgTime = new Date(lastMsg.timestamp).getTime();
        const msgAge = now - msgTime;

        // Si el último mensaje del cliente fue en los últimos 15 minutos y hace más de 3 segundos
        if (msgAge > 3000 && msgAge < MAX_UNANSWERED_AGE_MS) {
          if (this.recoveredMsgIds && this.recoveredMsgIds.has(lastMsg.id)) continue;
          if (!this.recoveredMsgIds) this.recoveredMsgIds = new Set();
          this.recoveredMsgIds.add(lastMsg.id);

          console.log(`🔄 [Auto-Recuperación ${this.sessionId}] Reanudando compra interrumpida para ${lead.pushName || lead.phone || lead.jid} (Mensaje recibido hace ${Math.round(msgAge / 1000)}s: "${(lastMsg.content || '').slice(0, 50)}...")`);

          this.scheduleDebouncedReply(lead.jid, {
            incomingText: lastMsg.content,
            isAudio: lastMsg.type === 'audio',
            isImage: lastMsg.type === 'image',
            downloadedImagePath: null,
            pushName: lead.pushName || lead.name,
            targetJid: lead.altJids?.[0] || lead.jid
          });

          await new Promise(r => setTimeout(r, 250));
        }
      }
    } catch (err) {
      console.warn(`[Auto-Recuperación ${this.sessionId}] Error en escaneo de mensajes sin responder:`, err.message);
    } finally {
      this.isRecoveringUnanswered = false;
    }
  }

  /**
   * Resuelve y normaliza el JID del destinatario a un identificador canónico de WhatsApp válido (@s.whatsapp.net, @lid o @g.us)
   * Preserva fielmente identificadores @lid, detecta teléfonos argentinos con o sin '9' vía onWhatsApp,
   * y garantiza entrega física al dispositivo del cliente.
   */
  async formatRecipientJid(rawJid) {
    if (!rawJid) return null;
    let target = String(rawJid).trim();

    // 1. Grupos de WhatsApp (@g.us): retornar sin modificaciones
    if (target.endsWith('@g.us')) {
      return target;
    }

    // 2. Identificadores de Dispositivo Vinculado / Privacidad (@lid)
    if (target.endsWith('@lid')) {
      // 2.1 Si ya tenemos el número telefónico real en caché en memoria
      if (this.lidToPhoneMap.has(target)) {
        return this.lidToPhoneMap.get(target);
      }
      // 2.2 Intentar resolver contra el almacén criptográfico de Baileys
      const resolved = await this.resolvePhoneJid(target);
      if (resolved && resolved.includes('@s.whatsapp.net')) {
        this.lidToPhoneMap.set(target, resolved);
        return resolved;
      }
      // 2.3 Si el lead en la BD tiene un teléfono real no-LID asociado
      const lead = db.getLead(target);
      if (lead?.phone && !isLidIdentifier(lead.phone)) {
        const cleanPhoneDigits = String(lead.phone).replace(/\D/g, '');
        if (cleanPhoneDigits.length >= 8) {
          const phoneJid = `${cleanPhoneDigits}@s.whatsapp.net`;
          this.lidToPhoneMap.set(target, phoneJid);
          return phoneJid;
        }
      }
      // 2.4 CRÍTICO: Si no se pudo asociar a un número telefónico, PRESERVAR @lid TAL CUAL.
      // Baileys tiene soporte nativo para entregar mensajes punto a punto a JIDs @lid.
      // NUNCA transformar el número LID en un teléfono falso @s.whatsapp.net.
      const cleanLidDigits = target.split('@')[0].replace(/\D/g, '');
      return `${cleanLidDigits}@lid`;
    }

    // 3. Si es un identificador de Lead en la base de datos o sintético (lead-xxx, test-xxx, usr-xxx)
    const isSynthetic = (s) => Boolean(s && (s.startsWith('lead-') || s.startsWith('test-') || s.startsWith('usr-') || s.includes('-test') || /^[a-z_]+$/i.test(s)));

    if (isSynthetic(target)) {
      const lead = db.getLead(target);
      if (lead) {
        if (lead.phone && !isLidIdentifier(lead.phone)) {
          target = lead.phone;
        } else if (lead.altJid && !isSynthetic(lead.altJid)) {
          return this.formatRecipientJid(lead.altJid);
        } else if (Array.isArray(lead.altJids)) {
          const nonSynAlt = lead.altJids.find(a => a && !isSynthetic(a) && (a.endsWith('@s.whatsapp.net') || a.endsWith('@lid')));
          if (nonSynAlt) return this.formatRecipientJid(nonSynAlt);
        } else if (lead.jid && lead.jid !== target && !isSynthetic(lead.jid) && (lead.jid.endsWith('@s.whatsapp.net') || lead.jid.endsWith('@lid') || lead.jid.endsWith('@g.us'))) {
          return this.formatRecipientJid(lead.jid);
        }
      }
    }

    // 4. Es un número de teléfono o usuario @s.whatsapp.net
    // 4.1 Verificar si existe un Lead con este identificador que ya tenga su JID canónico guardado
    const existingLead = db.getLead(target);
    if (existingLead?.jid && (existingLead.jid.endsWith('@s.whatsapp.net') || existingLead.jid.endsWith('@lid'))) {
      if (existingLead.jid !== target && !isSynthetic(existingLead.jid)) {
        return this.formatRecipientJid(existingLead.jid);
      }
    }

    let rawDigits = target.split('@')[0].replace(/\D/g, '');
    if (rawDigits.length === 10 && !rawDigits.startsWith('54')) {
      rawDigits = '549' + rawDigits;
    }

    // 4.2 Si es número argentino, verificar formato canónico exacto con WhatsApp (54 vs 549)
    if (rawDigits.startsWith('54') && rawDigits.length >= 10) {
      const with9 = rawDigits.startsWith('549') ? rawDigits : `549${rawDigits.slice(2)}`;
      const without9 = rawDigits.startsWith('549') ? `54${rawDigits.slice(3)}` : rawDigits;

      // Si el socket Baileys está conectado, consultar a WhatsApp directamente (onWhatsApp / USync)
      if (this.sock && this.status === 'connected') {
        try {
          const onWaResults = await this.sock.onWhatsApp(with9, without9);
          if (Array.isArray(onWaResults)) {
            const valid = onWaResults.find(r => r && r.exists && r.jid);
            if (valid?.jid) {
              return valid.jid;
            }
          }
        } catch (_) {}
      }

      // Por defecto para Argentina en WhatsApp, la mayoría de cuentas móviles usan 549 o el formato provisto
      return `${with9}@s.whatsapp.net`;
    }

    // 4.3 Internacional o genérico
    if (rawDigits.length >= 8) {
      if (this.sock && this.status === 'connected') {
        try {
          const onWaResults = await this.sock.onWhatsApp(rawDigits);
          if (Array.isArray(onWaResults) && onWaResults[0]?.exists && onWaResults[0]?.jid) {
            return onWaResults[0].jid;
          }
        } catch (_) {}
      }
      return `${rawDigits}@s.whatsapp.net`;
    }

    const fallback = jidNormalizedUser(target);
    return fallback || null;
  }

  /**
   * Envía un mensaje de texto a un JID con confirmación de entrega al socket y reintento resiliente
   */
  async sendTextMessage(jid, text, options = {}) {
    const { allowQueue = true, isAiReply = false, saveToDb = false, chatId = null } = (typeof options === 'object' && options !== null) ? options : {};

    let cleanJid = await this.formatRecipientJid(jid);
    if (!cleanJid) {
      throw new Error(`JID o teléfono de destinatario inválido: "${jid}"`);
    }
    let cleanText = (text || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();
    if (!cleanText) {
      cleanText = '¡Hola! ¿En qué puedo asesorarte hoy con tu pedido en República de la Carne? 🥩';
    }

    // Si el socket se encuentra reconectando, esperar hasta 10 segundos la reconexión activa
    const isReady = await this.waitForConnection(10000);
    if (!isReady || !this.sock) {
      if (allowQueue) {
        console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] WhatsApp en reconexión. Encolando mensaje en Outbox para ${cleanJid}...`);
        const outboxId = `outbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.outboxQueue.push({
          id: outboxId,
          type: 'text',
          jid: cleanJid,
          chatId: chatId || jid,
          text: cleanText,
          isAiReply,
          saveToDb,
          createdAt: Date.now()
        });
        return { key: { id: outboxId }, status: 'pending', isQueued: true };
      }
      throw new Error(`WhatsApp no está conectado [Sesión: ${this.sessionId}]. Estado actual: ${this.status}`);
    }

    // Asegurar pausado de presencia de escritura previo al despacho
    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}

    console.log(`📤 [WhatsApp Saliente (${this.sessionId})] Enviando a ${cleanJid} (WS Open: ${Boolean(this.sock?.ws?.isOpen)}): "${cleanText.slice(0, 80)}..."`);
    
    let sent;
    try {
      sent = await this.sock.sendMessage(cleanJid, { text: cleanText });
    } catch (firstErr) {
      // Reintento inteligente para números argentinos si el primer formato (549 vs 54) falló
      const isArgNet = cleanJid.includes('@s.whatsapp.net') && cleanJid.startsWith('54');
      if (isArgNet) {
        const altJid = cleanJid.startsWith('549')
          ? `54${cleanJid.slice(3)}`
          : `549${cleanJid.slice(2)}`;
        console.warn(`⚠️ [WhatsApp Saliente (${this.sessionId})] Error con ${cleanJid} (${firstErr.message}). Reintentando con JID argentino alternativo ${altJid}...`);
        try {
          sent = await this.sock.sendMessage(altJid, { text: cleanText });
          cleanJid = altJid;
        } catch (retryErr) {
          if (allowQueue && (retryErr.message?.includes('closed') || retryErr.message?.includes('not open') || retryErr.message?.includes('Connection') || !this.sock?.ws?.isOpen)) {
            console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] Socket cerrado durante envío. Moviendo a Outbox para ${altJid}...`);
            const outboxId = `outbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            this.outboxQueue.push({
              id: outboxId,
              type: 'text',
              jid: altJid,
              chatId: chatId || jid,
              text: cleanText,
              isAiReply,
              saveToDb,
              createdAt: Date.now()
            });
            return { key: { id: outboxId }, status: 'pending', isQueued: true };
          }
          throw retryErr;
        }
      } else {
        if (allowQueue && (firstErr.message?.includes('closed') || firstErr.message?.includes('not open') || firstErr.message?.includes('Connection') || !this.sock?.ws?.isOpen)) {
          console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] Socket cerrado durante envío. Moviendo mensaje a Outbox para ${cleanJid}...`);
          const outboxId = `outbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          this.outboxQueue.push({
            id: outboxId,
            type: 'text',
            jid: cleanJid,
            chatId: chatId || jid,
            text: cleanText,
            isAiReply,
            saveToDb,
            createdAt: Date.now()
          });
          return { key: { id: outboxId }, status: 'pending', isQueued: true };
        }
        throw firstErr;
      }
    }

    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}
    console.log(`✅ [WhatsApp Saliente (${this.sessionId})] Entregado exitosamente a WhatsApp (${cleanJid}). Msg ID: ${sent?.key?.id || 'OK'}`);
    return sent;
  }

  async sendMessage(jid, text, options = {}) {
    return await this.sendTextMessage(jid, text, options);
  }

  /**
   * Envía una imagen con texto / epígrafe a un JID con fallback Outbox
   */
  async sendImageMessage(jid, imagePathOrBuffer, caption = '', options = {}) {
    const { allowQueue = true, isAiReply = false, saveToDb = false, chatId = null } = (typeof options === 'object' && options !== null) ? options : {};

    const cleanJid = await this.formatRecipientJid(jid);
    if (!cleanJid) {
      throw new Error(`JID o teléfono de destinatario inválido: "${jid}"`);
    }

    const isReady = await this.waitForConnection(10000);
    if (!isReady || !this.sock) {
      if (allowQueue) {
        console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] WhatsApp en reconexión. Encolando imagen en Outbox para ${cleanJid}...`);
        const outboxId = `outbox_img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.outboxQueue.push({
          id: outboxId,
          type: 'image',
          jid: cleanJid,
          chatId: chatId || jid,
          imagePath: typeof imagePathOrBuffer === 'string' ? imagePathOrBuffer : null,
          imageBuffer: Buffer.isBuffer(imagePathOrBuffer) ? imagePathOrBuffer : null,
          caption,
          isAiReply,
          saveToDb,
          createdAt: Date.now()
        });
        return { key: { id: outboxId }, status: 'pending', isQueued: true };
      }
      throw new Error(`WhatsApp no está conectado [Sesión: ${this.sessionId}]`);
    }

    const imgBuffer = Buffer.isBuffer(imagePathOrBuffer) ? imagePathOrBuffer : fs.readFileSync(imagePathOrBuffer);
    const cleanCaption = (caption || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();

    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}
    console.log(`📤 [WhatsApp Saliente (${this.sessionId})] Enviando imagen a ${cleanJid}...`);
    let sent;
    try {
      sent = await this.sock.sendMessage(cleanJid, {
        image: imgBuffer,
        caption: cleanCaption
      });
    } catch (sendErr) {
      if (allowQueue && (sendErr.message?.includes('closed') || sendErr.message?.includes('not open') || sendErr.message?.includes('Connection') || !this.sock?.ws?.isOpen)) {
        console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] Socket cerrado durante envío de imagen. Moviendo a Outbox para ${cleanJid}...`);
        const outboxId = `outbox_img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.outboxQueue.push({
          id: outboxId,
          type: 'image',
          jid: cleanJid,
          chatId: chatId || jid,
          imagePath: typeof imagePathOrBuffer === 'string' ? imagePathOrBuffer : null,
          imageBuffer: Buffer.isBuffer(imagePathOrBuffer) ? imagePathOrBuffer : null,
          caption,
          isAiReply,
          saveToDb,
          createdAt: Date.now()
        });
        return { key: { id: outboxId }, status: 'pending', isQueued: true };
      }
      throw sendErr;
    }

    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}
    console.log(`✅ [WhatsApp Saliente (${this.sessionId})] Imagen entregada a WhatsApp. Msg ID: ${sent?.key?.id || 'OK'}`);
    return sent;
  }

  /**
   * Envía una nota de voz PTT (.ogg opus) a un JID con fallback Outbox
   */
  async sendVoiceNote(jid, audioPathOrBuffer, options = {}) {
    const { allowQueue = true, isAiReply = false, saveToDb = false, chatId = null } = (typeof options === 'object' && options !== null) ? options : {};

    const cleanJid = await this.formatRecipientJid(jid);
    if (!cleanJid) {
      throw new Error(`JID o teléfono de destinatario inválido: "${jid}"`);
    }

    const isReady = await this.waitForConnection(10000);
    if (!isReady || !this.sock) {
      if (allowQueue) {
        console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] WhatsApp en reconexión. Encolando nota de voz en Outbox para ${cleanJid}...`);
        const outboxId = `outbox_audio_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.outboxQueue.push({
          id: outboxId,
          type: 'audio',
          jid: cleanJid,
          chatId: chatId || jid,
          audioPath: typeof audioPathOrBuffer === 'string' ? audioPathOrBuffer : null,
          audioBuffer: Buffer.isBuffer(audioPathOrBuffer) ? audioPathOrBuffer : null,
          isAiReply,
          saveToDb,
          createdAt: Date.now()
        });
        return { key: { id: outboxId }, status: 'pending', isQueued: true };
      }
      throw new Error(`WhatsApp no está conectado [Sesión: ${this.sessionId}]`);
    }

    const audioBuffer = Buffer.isBuffer(audioPathOrBuffer) ? audioPathOrBuffer : fs.readFileSync(audioPathOrBuffer);
    const isOgg = typeof audioPathOrBuffer === 'string' ? (audioPathOrBuffer.endsWith('.ogg') || audioPathOrBuffer.endsWith('.opus')) : true;

    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}
    console.log(`📤 [WhatsApp Saliente (${this.sessionId})] Enviando nota de voz a ${cleanJid}...`);
    let sent;
    try {
      sent = await this.sock.sendMessage(cleanJid, {
        audio: audioBuffer,
        mimetype: isOgg ? 'audio/ogg; codecs=opus' : 'audio/mp4',
        ptt: true // Nota de voz nativa en WhatsApp
      });
    } catch (sendErr) {
      if (allowQueue && (sendErr.message?.includes('closed') || sendErr.message?.includes('not open') || sendErr.message?.includes('Connection') || !this.sock?.ws?.isOpen)) {
        console.warn(`⏳ [WhatsApp Saliente (${this.sessionId})] Socket cerrado durante envío de voz. Moviendo a Outbox para ${cleanJid}...`);
        const outboxId = `outbox_audio_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.outboxQueue.push({
          id: outboxId,
          type: 'audio',
          jid: cleanJid,
          chatId: chatId || jid,
          audioPath: typeof audioPathOrBuffer === 'string' ? audioPathOrBuffer : null,
          audioBuffer: Buffer.isBuffer(audioPathOrBuffer) ? audioPathOrBuffer : null,
          isAiReply,
          saveToDb,
          createdAt: Date.now()
        });
        return { key: { id: outboxId }, status: 'pending', isQueued: true };
      }
      throw sendErr;
    }

    try {
      await this.sock.sendPresenceUpdate('paused', cleanJid);
      if (jid && jid !== cleanJid) {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}
    console.log(`✅ [WhatsApp Saliente (${this.sessionId})] Nota de voz entregada a WhatsApp. Msg ID: ${sent?.key?.id || 'OK'}`);
    return sent;
  }

  /**
   * Obtiene la lista de grupos en los que participa el bot
   */
  async getParticipatingGroups() {
    if (!this.sock || this.status !== 'connected') {
      return [];
    }
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      return Object.values(groups).map(g => ({
        id: g.id,
        subject: g.subject || 'Grupo sin nombre',
        creation: g.creation,
        owner: g.owner,
        desc: g.desc ? g.desc.toString() : '',
        participantsCount: Array.isArray(g.participants) ? g.participants.length : 0
      }));
    } catch (err) {
      console.warn(`[WhatsApp ${this.sessionId}] Error obteniendo grupos participantes:`, err.message);
      return [];
    }
  }

  /**
   * Une al bot a un grupo de WhatsApp mediante enlace o código de invitación
   */
  async joinGroupViaInvite(inviteCodeOrUrl) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp no se encuentra conectado');
    }
    let code = String(inviteCodeOrUrl || '').trim();
    if (code.includes('chat.whatsapp.com/')) {
      code = code.split('chat.whatsapp.com/')[1].split(/[?#]/)[0];
    }
    if (!code) {
      throw new Error('Código o enlace de invitación no válido');
    }

    // 1. Intentar obtener información del grupo previo a la unión
    let groupInfo = null;
    try {
      if (typeof this.sock.groupGetInviteInfo === 'function') {
        groupInfo = await this.sock.groupGetInviteInfo(code);
      }
    } catch (infoErr) {
      console.warn(`[WhatsApp ${this.sessionId}] Pre-check de enlace de grupo:`, infoErr.message);
    }

    // 2. Si obtuvimos el ID del grupo, verificar si el bot ya es participante
    if (groupInfo?.id) {
      try {
        const participating = await this.getParticipatingGroups();
        const alreadyInGroup = participating.find(g => g.id === groupInfo.id);
        if (alreadyInGroup) {
          console.log(`ℹ️ [WhatsApp ${this.sessionId}] El bot ya es miembro de "${groupInfo.subject || alreadyInGroup.subject}" (${groupInfo.id})`);
          return {
            success: true,
            alreadyMember: true,
            groupId: groupInfo.id,
            groupName: groupInfo.subject || alreadyInGroup.subject,
            message: `El agente ya pertenece al grupo "${groupInfo.subject || alreadyInGroup.subject}". ¡Ya está listo para monitorear comprobantes!`
          };
        }
      } catch (listErr) {
        console.warn(`[WhatsApp ${this.sessionId}] Error revisando grupos actuales:`, listErr.message);
      }
    }

    // 3. Proceder a unirse al grupo mediante groupAcceptInvite
    try {
      const groupId = await this.sock.groupAcceptInvite(code);
      console.log(`✅ [WhatsApp ${this.sessionId}] Bot se unió exitosamente al grupo: ${groupId}`);
      return {
        success: true,
        alreadyMember: false,
        groupId,
        groupName: groupInfo?.subject,
        message: groupInfo?.subject
          ? `¡El bot se unió con éxito al grupo "${groupInfo.subject}"!`
          : '¡El bot se unió exitosamente al grupo de WhatsApp!'
      };
    } catch (err) {
      console.error(`[WhatsApp ${this.sessionId}] Error uniéndose a grupo mediante enlace:`, err.message);

      const errMsg = String(err.message || '').toLowerCase();
      const errData = String(err.data || '');
      const statusCode = err.output?.statusCode || err.status;

      // Código 409 o "conflict" en WhatsApp indica que el usuario ya es miembro activo del grupo
      if (errMsg.includes('conflict') || errData.includes('409') || statusCode === 409) {
        const resolvedId = groupInfo?.id || null;
        const resolvedName = groupInfo?.subject || 'Grupo de WhatsApp';
        return {
          success: true,
          alreadyMember: true,
          groupId: resolvedId,
          groupName: resolvedName,
          message: groupInfo?.subject
            ? `El agente ya forma parte del grupo "${groupInfo.subject}". ¡Ya se encuentra activo y listo para monitorear!`
            : 'El agente ya forma parte de este grupo de WhatsApp. ¡Ya se encuentra activo y listo para monitorear!'
        };
      }

      if (errMsg.includes('not-authorized') || errMsg.includes('gone') || statusCode === 404 || statusCode === 410) {
        throw new Error('El enlace de invitación ha expirado, fue revocado por el administrador o no tiene permisos para unirse.');
      }

      throw new Error(`Error al unirse al grupo: ${err.message}`);
    }
  }

  /**
   * Desconecta la sesión actual
   */
  async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {}
      this.sock = null;
    }
    this.status = 'disconnected';
    this.qrCode = null;
    this.qrDataUrl = null;
    this.user = null;

    try {
      if (fs.existsSync(CONFIG.AUTH_DIR)) {
        fs.rmSync(CONFIG.AUTH_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Error eliminando sesión anterior:', e);
    }

    this.emitStatus();
  }

  /**
   * Resuelve el JID limpio para notificaciones al cliente de un pedido
   */
  async getCleanOrderClientJid(order) {
    if (!order) return null;
    let jid = order.jid;
    if (jid && jid.includes('@lid')) {
      const resolved = await this.resolvePhoneJid(jid);
      if (resolved) jid = resolved;
    }
    if (jid && jid.includes('@s.whatsapp.net')) {
      const digits = jid.split('@')[0].replace(/\D/g, '');
      if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
    }
    const rawPhone = order.phone || order.jid || '';
    const digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
    return null;
  }

  /**
   * Notifica a la sucursal por WhatsApp sobre un nuevo pedido derivado
   */
  async sendBranchDerivationNotification(order, branch, notifyClient = true) {
    if (!branch || !branch.phone) return false;
    const branchJid = `${branch.phone.replace(/\D/g, '')}@s.whatsapp.net`;

    const itemsStr = Array.isArray(order.items) ? order.items.join('\n') : (order.items || 'Cortes de carne');
    const branchNotice = `🥩🔔 *¡NUEVO PEDIDO DERIVADO! #${order.id}*\n\n🏪 *Sucursal Destino:* ${branch.name}\n👤 *Cliente:* ${order.customerName} (📞 ${order.phone || 'Sin tel'})\n📍 *Destino / Entrega:* ${order.address || 'Retiro en sucursal'}\n\n📋 *CORTES SOLICITADOS:*\n${itemsStr}\n\n💰 *Total:* $${Number(order.totalAmount).toLocaleString('es-AR')}\n💳 *Medio de Pago:* ${order.paymentMethod || 'Efectivo / MP'}\n${order.notes ? `📝 *Notas:* ${order.notes}\n` : ''}\n👉 *RESPONDÉ A ESTE MENSAJE PARA ACTUALIZAR ESTADO:*\n1️⃣ *1* o *ACEPTAR* ➔ Confirmar en preparación\n2️⃣ *2* o *LISTO* ➔ Listo para entrega / retiro\n3️⃣ *3* o *ENTREGADO* ➔ Confirmar entrega\n4️⃣ *4* o *RECHAZAR* ➔ Rechazar / sin stock`;

    await this.sendMessage(branchJid, branchNotice);

    // Notificar al cliente
    if (notifyClient) {
      const clientJid = await this.getCleanOrderClientJid(order);
      if (clientJid) {
        const clientMsg = `¡Hola ${order.customerName}! 🥩 Tu pedido *#${order.id}* ha sido asignado a nuestra *${branch.name}* (${branch.address}). El equipo de corte ya fue notificado y está preparando todo para vos. 🙌`;
        await this.sendMessage(clientJid, clientMsg);
      }
    }

    return true;
  }


  /**
   * Procesa mensajes interactivos enviados por los encargados u operadores de las sucursales
   */
  async handleBranchOperatorMessage(branch, branchJid, textContent) {
    const raw = (textContent || '').trim().toLowerCase();
    const allOrders = db.getOrders();

    // 1. Detectar si menciona un número de pedido específico (ej: #ORD-6636 o ORD-6636 o 6636)
    const idMatch = textContent.match(/ORD-([0-9a-zA-Z]+)/i) || textContent.match(/#([0-9a-zA-Z]+)/);
    let targetOrder = null;
    if (idMatch) {
      const searchId = idMatch[0].replace('#', '').toUpperCase();
      targetOrder = allOrders.find(o => o.id === searchId || o.id === `ORD-${searchId}`);
    }

    // Si no especificó ID, tomar el pedido más reciente asignado o pendiente en esta sucursal
    if (!targetOrder) {
      const branchOrders = allOrders
        .filter(o => o.branchId === branch.id && (o.branchStatus === 'derived' || o.status === 'pending' || o.status === 'preparing'))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      targetOrder = branchOrders[0];
    }

    // 2. Procesar Comandos
    const isAccept = /^(1|aceptar|acepto|preparar|preparacion|en preparacion|confirmar|confirmo|ok|dale|tomar)/i.test(raw);
    const isReady = /^(2|listo|despachado|en camino|empaquetado|despachar|terminado)/i.test(raw);
    const isDelivered = /^(3|entregado|completado|cerrado|finalizado|cobrado)/i.test(raw);
    const isReject = /^(4|rechazar|rechazo|sin stock|no tenemos|cancelar|cancelado)/i.test(raw);

    if (isAccept && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'preparing');
      db.updateOrder(targetOrder.id, {
        branchStatus: 'accepted',
        branchConfirmedAt: new Date().toISOString()
      });
      if (this.io) this.io.emit('order:update', updated);

      const opReply = `✅ ¡Confirmado! El pedido *#${targetOrder.id}* (${targetOrder.customerName} - $${Number(targetOrder.totalAmount).toLocaleString('es-AR')}) quedó marcado como 🥩 *EN PREPARACIÓN*.\n\nNotificamos automáticamente al cliente por WhatsApp.`;
      await this.sendMessage(branchJid, opReply);

      // Notificar al cliente
      const clientJid = await this.getCleanOrderClientJid(targetOrder);
      if (clientJid) {
        const clientNotice = `¡Excelentes noticias ${targetOrder.customerName}! 🎉 Nuestra *${branch.name}* acaba de confirmar tu pedido *#${targetOrder.id}* y ya comenzó su preparación en carnicería 🥩🔥\n\nTe avisaremos apenas salga hacia tu domicilio.`;
        await this.sendMessage(clientJid, clientNotice);
      }
      return;
    }

    if (isReady && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'in_transit');
      db.updateOrder(targetOrder.id, { branchStatus: 'ready' });
      if (this.io) this.io.emit('order:update', updated);

      const opReply = `🚚 ¡Excelente! El pedido *#${targetOrder.id}* fue marcado como 🚚 *EN CAMINO / LISTO PARA RETIRO*.\n\nEl cliente ya recibió el aviso de despacho.`;
      await this.sendMessage(branchJid, opReply);

      // Notificar al cliente
      const clientJid = await this.getCleanOrderClientJid(targetOrder);
      if (clientJid) {
        const clientNotice = `¡Tu pedido *#${targetOrder.id}* ya está listo y en camino hacia tu domicilio desde nuestra *${branch.name}*! 🚚🥩 Pronto llegará a destino.`;
        await this.sendMessage(clientJid, clientNotice);
      }
      return;
    }

    if (isDelivered && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'delivered');
      db.updateOrder(targetOrder.id, { branchStatus: 'delivered' });
      if (this.io) this.io.emit('order:update', updated);

      const opReply = `🎉 ¡Gran trabajo! El pedido *#${targetOrder.id}* de ${targetOrder.customerName} ha sido marcado como ✅ *ENTREGADO Y COMPLETADO*.`;
      await this.sendMessage(branchJid, opReply);

      // Notificar al cliente
      const clientJid = await this.getCleanOrderClientJid(targetOrder);
      if (clientJid) {
        const clientNotice = `¡Muchas gracias por tu compra en República de la Carne ${targetOrder.customerName}! 🙌 Esperamos que disfrutes tu asado. ¡Hasta la próxima! 🥩🔥`;
        await this.sendMessage(clientJid, clientNotice);
      }
      return;
    }


    if (isReject && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'cancelled');
      db.updateOrder(targetOrder.id, { branchStatus: 'rejected' });
      if (this.io) this.io.emit('order:update', updated);

      const opReply = `⚠️ Pedido *#${targetOrder.id}* marcado como ❌ *RECHAZADO*. Se ha dado aviso al panel central de República de la Carne.`;
      await this.sendMessage(branchJid, opReply);
      return;
    }

    // Consulta de pedidos o menú de ayuda
    const pendingList = allOrders
      .filter(o => o.branchId === branch.id && o.status !== 'delivered' && o.status !== 'cancelled')
      .slice(0, 5);

    let helpMsg = `🏪 *Hola ${branch.managerName || 'Encargado'} - ${branch.name}* 🥩\n\n`;
    if (pendingList.length > 0) {
      helpMsg += `📋 *PEDIDOS ACTIVOS EN TU SUCURSAL (${pendingList.length}):*\n`;
      pendingList.forEach(o => {
        helpMsg += `• *#${o.id}* | ${o.customerName} | $${Number(o.totalAmount).toLocaleString('es-AR')} | Estado: ${o.status}\n`;
      });
      helpMsg += `\n👉 Para interactuar, respondé:\n1️⃣ *1* o *ACEPTAR* (Pone el último pedido en preparación)\n2️⃣ *2* o *LISTO* (Marca en camino / despacho)\n3️⃣ *3* o *ENTREGADO* (Marca entregado)\n4️⃣ *4* o *RECHAZAR* (Cancela o rechaza)\n\n*(O indicá el número de pedido: ej: "1 #ORD-1042")*`;
    } else {
      helpMsg += `No tenés pedidos pendientes en este momento. En cuanto el CRM derive una nueva venta para ${branch.name}, recibirás la notificación inmediata acá. 🥩🙌`;
    }

    await this.sendMessage(branchJid, helpMsg);
  }

  /**
   * Envía notificación de despacho a un Repartidor por WhatsApp
   */
  async sendDriverDispatchNotification(order, driver, notifyClient = true) {
    if (!driver.phone) return null;
    const cleanPhone = driver.phone.replace(/\D/g, '');
    const driverJid = `${cleanPhone}@s.whatsapp.net`;

    const encodedAddress = encodeURIComponent(`${order.address || ''}, Cordoba, Argentina`);
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    const itemsSummary = Array.isArray(order.items) ? order.items.join('\n') : (order.items || 'Cortes seleccionados');
    const amountToCollect = Number(order.totalAmount || 0).toLocaleString('es-AR');

    const message = `🥩🛵 *¡NUEVO PEDIDO ASIGNADO PARA REPARTO!* #*${order.id}*\n\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📞 *Teléfono:* ${order.phone || 'Sin número'}\n` +
      `📍 *Dirección de Entrega:* ${order.address || 'A convenir'}\n` +
      `🗺️ *Google Maps:* ${mapsLink}\n\n` +
      `📋 *DETALLE DEL PEDIDO:*\n${itemsSummary}\n\n` +
      `💰 *Monto a Cobrar:* $${amountToCollect} (${order.paymentMethod || 'Efectivo'})\n` +
      `${order.notes ? `📝 *Notas:* ${order.notes}\n` : ''}\n` +
      `👉 *RESPONDÉ CON UN COMANDO PARA ACTUALIZAR EL ESTADO:*\n` +
      `1️⃣ *1* o *EN CAMINO* ➔ Iniciar viaje (avisa al cliente)\n` +
      `2️⃣ *2* o *ENTREGADO* ➔ Confirmar entrega y cobro de $${amountToCollect}\n` +
      `3️⃣ *3* o *INCIDENCIA* ➔ Reportar problema (cliente no está, etc.)\n\n` +
      `¡Buen viaje y gracias por tu trabajo en República de la Carne! 🥩🛵`;

    await this.sendMessage(driverJid, message);

    if (notifyClient) {
      const clientJid = await this.getCleanOrderClientJid(order);
      if (clientJid) {
        const clientMsg = `¡Hola ${order.customerName}! 🥩🛵 Tu pedido *#${order.id}* ha sido asignado a nuestro repartidor *${driver.name}* (${driver.vehicle || 'Moto'}). En breve inicia su viaje a tu domicilio.`;
        await this.sendMessage(clientJid, clientMsg);
      }
    }


    return true;
  }

  /**
   * Obtiene la foto de perfil en alta resolución y el estado de WhatsApp de un contacto,
   * descargando y persistiendo la imagen localmente para que nunca expire.
   */
  async fetchAndSyncContactProfile(jid, pushName = null) {
    if (!this.sock || this.status !== 'connected' || !jid) return null;
    try {
      const cleanJid = jidNormalizedUser(jid);
      const targetPhoneJid = await this.resolvePhoneJid(cleanJid);
      const queryJid = targetPhoneJid || (cleanJid.includes('@s.whatsapp.net') ? cleanJid : null);

      let profilePicUrl = null;
      if (queryJid) {
        try {
          profilePicUrl = await this.sock.profilePictureUrl(queryJid, 'image');
        } catch (e) {
          try {
            profilePicUrl = await this.sock.profilePictureUrl(queryJid, 'preview');
          } catch (e2) {}
        }
      }

      if (!profilePicUrl && !cleanJid.includes('@lid')) {
        try {
          profilePicUrl = await this.sock.profilePictureUrl(cleanJid, 'image');
        } catch (e) {}
      }

      let localAvatarUrl = null;
      if (profilePicUrl) {
        try {
          const avatarsDir = path.join(CONFIG.MEDIA_DIR, 'avatars');
          if (!fs.existsSync(avatarsDir)) {
            fs.mkdirSync(avatarsDir, { recursive: true });
          }
          const leadIdent = (queryJid || cleanJid).split('@')[0];
          const filename = `avatar_${leadIdent}.jpg`;
          const filePath = path.join(avatarsDir, filename);

          const res = await fetch(profilePicUrl);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(buffer));
            localAvatarUrl = `/media/avatars/${filename}?v=${Date.now()}`;
          } else {
            localAvatarUrl = profilePicUrl;
          }
        } catch (downloadErr) {
          localAvatarUrl = profilePicUrl;
        }
      }

      let statusBio = null;
      if (queryJid) {
        try {
          const statusRes = await this.sock.fetchStatus(queryJid);
          statusBio = statusRes?.status || null;
        } catch (e) {}
      }

      const updates = {};
      if (localAvatarUrl) updates.avatar = localAvatarUrl;
      if (statusBio) updates.bio = statusBio;
      if (pushName && pushName !== 'Contacto WhatsApp') updates.pushName = pushName;

      if (Object.keys(updates).length > 0) {
        const updatedLead = db.updateLead(cleanJid, updates) || (queryJid ? db.updateLead(queryJid, updates) : null);
        if (this.io && updatedLead) {
          this.io.emit('lead:update', updatedLead);
        }
        return updatedLead;
      }
    } catch (err) {
      // Ignorar errores silenciosos de Baileys
    }
    return null;
  }

  /**
   * Procesa mensajes y comandos interactivos enviados por Repartidores
   */
  async handleDriverMessage(driver, driverJid, textContent) {
    const raw = (textContent || '').trim();
    const t = raw.toLowerCase();

    // Buscar pedidos asignados a este repartidor
    const allOrders = db.getOrders();
    let targetOrder = null;

    // Si menciona un ID de pedido
    const idMatch = raw.match(/#?(ORD-\d+)/i);
    if (idMatch) {
      targetOrder = allOrders.find(o => o.id.toUpperCase() === idMatch[1].toUpperCase());
    }

    // Si no mencionó pedido específico, tomar el último asignado o en tránsito
    if (!targetOrder) {
      targetOrder = allOrders.find(o => o.driverId === driver.id && (o.status === 'preparing' || o.status === 'in_transit' || o.status === 'pending'));
    }

    const isInTransit = /^(1|camino|en camino|viaje|iniciar|arranco|sali)$/i.test(t) || t.startsWith('1 ');
    const isDelivered = /^(2|entregado|cobrado|listo|entregue|pago|finalizado)$/i.test(t) || t.startsWith('2 ');
    const isIncident = /^(3|incidencia|problema|no esta|cerrado|rechazo)$/i.test(t) || t.startsWith('3 ');

    if (isInTransit && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'in_transit');
      db.updateOrder(targetOrder.id, { driverStatus: 'in_transit' });
      if (this.io) this.io.emit('order:update', updated);

      const repReply = `🛵 ¡Excelente ${driver.name}! El pedido *#${targetOrder.id}* de ${targetOrder.customerName} figura ahora *EN CAMINO*. Le avisamos al cliente. ¡Conducí con cuidado!`;
      await this.sendMessage(driverJid, repReply);

      // Notificar al cliente
      const clientJid = await this.getCleanOrderClientJid(targetOrder);
      if (clientJid) {
        const clientNotice = `¡Tu pedido *#${targetOrder.id}* está en camino hacia tu domicilio con *${driver.name}* (${driver.vehicle || 'Moto'})! 🚚🥩 Pronto tocará timbre.`;
        await this.sendMessage(clientJid, clientNotice);
      }
      return;
    }

    if (isDelivered && targetOrder) {
      const updated = db.updateOrderStatus(targetOrder.id, 'delivered');
      db.updateOrder(targetOrder.id, { driverStatus: 'delivered' });
      
      // Si el pedido fue en efectivo, sumar al saldo a rendir del repartidor
      if (targetOrder.paymentMethod && targetOrder.paymentMethod.toLowerCase().includes('efectivo')) {
        db.updateDriverCashBalance(driver.id, targetOrder.totalAmount);
      }

      // Actualizar contadores del repartidor
      db.updateDriver(driver.id, {
        activeDeliveriesCount: Math.max(0, (driver.activeDeliveriesCount || 1) - 1),
        totalDeliveredCount: (driver.totalDeliveredCount || 0) + 1,
        status: (driver.activeDeliveriesCount || 1) <= 1 ? 'available' : 'on_delivery'
      });

      if (this.io) {
        this.io.emit('order:update', updated);
        this.io.emit('driver:update', db.getDriver(driver.id));
      }

      const repReply = `🎉 ¡Entrega confirmada! El pedido *#${targetOrder.id}* de ${targetOrder.customerName} ha sido marcado como ✅ *ENTREGADO*. Gracias por tu compromiso 🙌`;
      await this.sendMessage(driverJid, repReply);

      // Notificar al cliente
      const clientJid = await this.getCleanOrderClientJid(targetOrder);
      if (clientJid) {
        const clientNotice = `¡Pedido *#${targetOrder.id}* entregado con éxito por ${driver.name}! 🙌 Muchas gracias por elegir República de la Carne. ¡Que disfrutes el asado! 🥩🔥`;
        await this.sendMessage(clientJid, clientNotice);
      }
      return;
    }


    if (isIncident && targetOrder) {
      db.updateOrder(targetOrder.id, { driverStatus: 'incident', notes: `${targetOrder.notes || ''}\n[Alerta Repartidor] Reportó incidencia: "${raw}"` });
      if (this.io) this.io.emit('order:update', db.getOrder(targetOrder.id));

      const repReply = `⚠️ Incidencia registrada para el pedido *#${targetOrder.id}*. Se ha dado aviso a los operadores del local para coordinar con el cliente.`;
      await this.sendMessage(driverJid, repReply);
      return;
    }

    // Hoja de ruta o ayuda
    const pendingList = allOrders
      .filter(o => o.driverId === driver.id && o.status !== 'delivered' && o.status !== 'cancelled');

    let helpMsg = `🛵 *Hola ${driver.name} - Repartidor República de la Carne* 🥩\n\n`;
    if (pendingList.length > 0) {
      helpMsg += `📋 *TUS ENTREGAS PENDIENTES (${pendingList.length}):*\n`;
      pendingList.forEach(o => {
        helpMsg += `• *#${o.id}* | ${o.customerName} | ${o.address} | $${Number(o.totalAmount).toLocaleString('es-AR')}\n`;
      });
      helpMsg += `\n👉 Para interactuar, respondé:\n1️⃣ *1* o *EN CAMINO* (Inicia viaje)\n2️⃣ *2* o *ENTREGADO* (Confirma entrega y cobro)\n3️⃣ *3* o *INCIDENCIA* (Reporta problema)`;
    } else {
      helpMsg += `No tenés entregas pendientes asignadas en este momento. Cuando te asignen un pedido, te llegará la ficha con mapa y datos acá. 🥩🙌`;
    }

    await this.sendMessage(driverJid, helpMsg);
  }

  async disconnect({ clearAuth = true } = {}) {
    try {
      this.cancelScheduledReconnect();
      this.status = 'disconnected';
      this.qrCode = null;
      this.qrDataUrl = null;
      this.user = null;
      this.reconnectAttempts = 0;
      if (clearAuth) {
        this.explicitlyDisconnected = true;
      }
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
          this.sock = null;
        } catch (e) {}
      }
      if (clearAuth) {
        await this.clearAuthFiles({ clearBackup: true });
      }
      this.emitStatus();
    } catch (e) {
      console.error(`Error desconectando sesión de WhatsApp [${this.sessionId}]:`, e);
    }
  }

  getStatus() {
    const credsActive = path.join(this.authDir, 'creds.json');
    const backupDir = path.join(CONFIG.DATA_DIR, 'backups', `auth_backup_${this.sessionId}`);
    const credsBackup = path.join(backupDir, 'creds.json');
    const hasSavedAuth = isCredsValid(credsActive) || isCredsValid(credsBackup);

    return {
      sessionId: this.sessionId,
      userId: this.sessionId,
      status: this.status,
      qrCode: this.qrCode,
      qrDataUrl: this.qrDataUrl,
      user: this.user,
      lastConnectedAt: this.lastConnectedAt,
      reconnectAttempts: this.reconnectAttempts,
      watchdogActive: Boolean(this.watchdogTimer),
      hasSavedAuth
    };
  }

  emitStatus() {
    if (this.io) {
      const statusData = this.getStatus();
      // Emisión global para todos los listeners de la aplicación
      this.io.emit('whatsapp:status', statusData);
      // Emisión específica por ID de sesión/usuario
      this.io.emit(`whatsapp:status:${this.sessionId}`, statusData);
      this.io.emit('whatsapp:sessions:update', statusData);
    }
  }

  emitQR() {
    if (this.io) {
      const qrData = {
        sessionId: this.sessionId,
        userId: this.sessionId,
        status: 'qr_ready',
        qrCode: this.qrCode,
        qrDataUrl: this.qrDataUrl
      };
      // Emisión global y específica para que cualquier operador reciba su QR al instante
      this.io.emit('whatsapp:qr', qrData);
      this.io.emit(`whatsapp:qr:${this.sessionId}`, qrData);
      this.io.emit('whatsapp:sessions:update', qrData);
    }
  }
}

/**
 * Gestor Multi-Instancia / Multi-Operador de WhatsApp
 */
export class WhatsAppManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map();

    // Migración automática de credenciales legadas desde usr-central-admin hacia auth_info_baileys
    this.migrateLegacyAdminAuth();

    // Servicio Oficial Meta WhatsApp Cloud API
    this.metaService = new MetaWhatsAppService(io);

    // Sesión Maestra Principal Unificada para la Línea Central de la Empresa
    this.primarySession = new WhatsAppService(io, 'default', CONFIG.AUTH_DIR);
    this.sessions.set('default', this.primarySession);
    this.sessions.set('usr-central-admin', this.primarySession);
    this.sessions.set('admin_central', this.primarySession);
  }

  /**
   * Si existen credenciales válidas en la carpeta legada de usr-central-admin y la principal está vacía,
   * migrar los archivos automáticamente a la ubicación canónica y respaldar
   */
  migrateLegacyAdminAuth() {
    try {
      const legacyDir = path.join(CONFIG.DATA_DIR, 'auth_info_baileys_usr-central-admin');
      const targetDir = CONFIG.AUTH_DIR;
      const legacyCreds = path.join(legacyDir, 'creds.json');
      const targetCreds = path.join(targetDir, 'creds.json');

      const hasLegacyCreds = isCredsValid(legacyCreds);
      const hasTargetCreds = isCredsValid(targetCreds);

      if (hasLegacyCreds && !hasTargetCreds) {
        console.log('🔄 [WhatsAppManager] Migrando credenciales activas válidas desde usr-central-admin a la sesión principal auth_info_baileys...');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const files = fs.readdirSync(legacyDir);
        for (const file of files) {
          fs.copyFileSync(path.join(legacyDir, file), path.join(targetDir, file));
        }
        console.log(`✅ [WhatsAppManager] ${files.length} archivos de autenticación migrados a ${targetDir}.`);

        const backupDir = path.join(CONFIG.DATA_DIR, 'backups', 'auth_backup_default');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        for (const file of files) {
          fs.copyFileSync(path.join(legacyDir, file), path.join(backupDir, file));
        }
      }
    } catch (err) {
      console.warn('Aviso comprobando migración de auth legado:', err.message);
    }
  }

  async initializePrimary() {
    await this.primarySession.initialize();
  }

  getSession(userId = 'default') {
    const id = userId || 'default';
    // Unificar alias del administrador central con la sesión principal maestra
    if (id === 'default' || id === 'usr-central-admin' || id === 'admin_central' || id === 'usr-admin' || id === 'usr-admin-republica') {
      return this.primarySession;
    }
    if (!this.sessions.has(id)) {
      const authDir = path.join(CONFIG.DATA_DIR, `auth_info_baileys_${id}`);
      const service = new WhatsAppService(this.io, id, authDir);
      this.sessions.set(id, service);
    }
    return this.sessions.get(id);
  }

  async connectUserSession(userId, { resetAuth = false } = {}) {
    const session = this.getSession(userId);
    await session.initialize({ resetAuth });
    return session.getStatus();
  }

  async reconnectSession(userId = 'default') {
    const session = this.getSession(userId);
    session.restoreAuthFromBackup();
    await session.initialize({ resetAuth: false });
    return session.getStatus();
  }

  async disconnectUserSession(userId, { clearAuth = true } = {}) {
    const session = this.getSession(userId);
    await session.disconnect({ clearAuth });
    return session.getStatus();
  }

  async resetUserSession(userId) {
    const session = this.getSession(userId);
    await session.disconnect({ clearAuth: true });
    await session.initialize({ resetAuth: true });
    return session.getStatus();
  }

  getStatus(userId = 'default') {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.getStatus();
    }
    const id = userId || 'default';
    if (id === 'default' || id === 'usr-central-admin' || id === 'admin_central' || id === 'usr-admin' || id === 'usr-admin-republica') {
      return this.primarySession.getStatus();
    }
    const session = this.getSession(id);
    return session.getStatus();
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getAllSessionsStatus() {
    const result = {};
    for (const [id, session] of this.sessions.entries()) {
      result[id] = session.getStatus();
    }
    return result;
  }

  get status() {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.isConfigured() ? 'connected' : 'disconnected';
    }
    if (this.primarySession?.status === 'connected') return 'connected';
    for (const session of this.sessions.values()) {
      if (session && session.status === 'connected') {
        return 'connected';
      }
    }
    return this.primarySession?.status || 'disconnected';
  }

  get isAnyConnected() {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.isConfigured();
    }
    return this.status === 'connected';
  }

  get isAnyConnecting() {
    if (this.primarySession?.status === 'connecting') return true;
    for (const session of this.sessions.values()) {
      if (session && session.status === 'connecting') return true;
    }
    return false;
  }

  hasSavedSession() {
    if (this.primarySession && typeof this.primarySession.hasSavedSession === 'function') {
      return this.primarySession.hasSavedSession();
    }
    return false;
  }

  get sock() {
    const session = this.getActiveConnectedSession() || this.primarySession;
    return session?.sock || null;
  }

  /**
   * Resuelve dinámicamente la mejor sesión activa y conectada.
   * Si el usuario operador tiene una sesión conectada, se prioriza.
   * Si no, utiliza la sesión primaria o cualquier otra sesión conectada en el pool.
   */
  getActiveConnectedSession(preferredUserId = null) {
    // Si el usuario preferido es el admin central o default, usar la sesión primaria
    if (!preferredUserId || preferredUserId === 'default' || preferredUserId === 'usr-central-admin' || preferredUserId === 'admin_central' || preferredUserId === 'usr-admin' || preferredUserId === 'usr-admin-republica') {
      if (this.primarySession && this.primarySession.status === 'connected') {
        return this.primarySession;
      }
    } else {
      const preferred = this.sessions.get(preferredUserId);
      if (preferred && preferred.status === 'connected') {
        return preferred;
      }
    }

    if (this.primarySession && this.primarySession.status === 'connected') {
      return this.primarySession;
    }

    for (const session of this.sessions.values()) {
      if (session && session.status === 'connected') {
        return session;
      }
    }

    return this.primarySession;
  }

  /**
   * Inicializa de forma automática todas las sesiones de WhatsApp que tengan credenciales guardadas válidas
   * (tanto la sesión default maestra como sesiones de usuarios/administradores específicos).
   */
  async initializeAllSavedSessions() {
    console.log('🔄 [WhatsAppManager] Escaneando y conectando sesiones de WhatsApp guardadas...');
    
    // 1. Sesión Maestra Principal ('default' / central business line)
    // Siempre se inicializa: si tiene credenciales se reconecta automáticamente;
    // si no tiene credenciales, genera el código QR para que el operador lo vincule de inmediato.
    console.log('📱 Inicializando sesión WhatsApp principal [default]...');
    this.primarySession.initialize().catch(err => {
      console.warn('Aviso inicializando sesión default:', err.message);
    });

    // 2. Sesiones de Operadores independientes en DATA_DIR (omitiendo alias del admin central para evitar conflictos)
    try {
      if (fs.existsSync(CONFIG.DATA_DIR)) {
        const entries = fs.readdirSync(CONFIG.DATA_DIR);
        for (const entry of entries) {
          if (entry.startsWith('auth_info_baileys_')) {
            const userId = entry.replace('auth_info_baileys_', '');
            // Omitir carpetas del admin central para no duplicar el socket con la cuenta principal
            if (userId === 'usr-central-admin' || userId === 'admin_central' || userId === 'usr-admin' || userId === 'usr-admin-republica') {
              continue;
            }
            const credsFile = path.join(CONFIG.DATA_DIR, entry, 'creds.json');
            if (isCredsValid(credsFile)) {
              console.log(`📱 Inicializando sesión de WhatsApp guardada para operador [${userId}]...`);
              const session = this.getSession(userId);
              session.initialize().catch(err => {
                console.warn(`Aviso inicializando sesión de operador [${userId}]:`, err.message);
              });
            }
          }
        }
      }
    } catch (scanErr) {
      console.warn('Error escaneando directorios de autenticación de WhatsApp:', scanErr.message);
    }
  }

  async sendTextMessage(jid, text, userId = null, options = {}) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.sendTextMessage(jid, text);
    }
    let session = this.getActiveConnectedSession(userId);
    if (!session || session.status !== 'connected') {
      const targetSession = (userId && this.sessions.get(userId)) || this.primarySession;
      if (targetSession && typeof targetSession.waitForConnection === 'function') {
        const isReady = await targetSession.waitForConnection(10000);
        if (isReady) {
          session = targetSession;
        }
      }
    }
    if (!session) {
      session = (userId && this.sessions.get(userId)) || this.primarySession;
    }
    return session.sendTextMessage(jid, text, options);
  }

  async sendVoiceNote(jid, audioPathOrBuffer, userId = null, options = {}) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.sendVoiceNote(jid, audioPathOrBuffer);
    }
    let session = this.getActiveConnectedSession(userId);
    if (!session || session.status !== 'connected') {
      const targetSession = (userId && this.sessions.get(userId)) || this.primarySession;
      if (targetSession && typeof targetSession.waitForConnection === 'function') {
        const isReady = await targetSession.waitForConnection(10000);
        if (isReady) {
          session = targetSession;
        }
      }
    }
    if (!session) {
      session = (userId && this.sessions.get(userId)) || this.primarySession;
    }
    return session.sendVoiceNote(jid, audioPathOrBuffer, options);
  }

  async sendImageMessage(jid, imagePathOrBuffer, caption = '', userId = null, options = {}) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.sendImageMessage(jid, imagePathOrBuffer, caption);
    }
    let session = this.getActiveConnectedSession(userId);
    if (!session || session.status !== 'connected') {
      const targetSession = (userId && this.sessions.get(userId)) || this.primarySession;
      if (targetSession && typeof targetSession.waitForConnection === 'function') {
        const isReady = await targetSession.waitForConnection(10000);
        if (isReady) {
          session = targetSession;
        }
      }
    }
    if (!session) {
      session = (userId && this.sessions.get(userId)) || this.primarySession;
    }
    return session.sendImageMessage(jid, imagePathOrBuffer, caption, options);
  }

  async sendMessage(jid, text, media = null, userId = null, options = {}) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.metaService.sendMessage(jid, text, media);
    }
    if (media) {
      return this.sendImageMessage(jid, media, text, userId, options);
    }
    return this.sendTextMessage(jid, text, userId, options);
  }

  async sendDriverDispatchNotification(order, driver, notifyClient = true, userId = null) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.primarySession.sendDriverDispatchNotification.call(this, order, driver, notifyClient);
    }
    const session = this.getActiveConnectedSession(userId);
    if (!session || session.status !== 'connected') {
      throw new Error(`WhatsApp no está conectado en el servidor (ninguna sesión activa disponible)`);
    }
    return session.sendDriverDispatchNotification(order, driver, notifyClient);
  }

  async sendBranchDerivationNotification(order, branch, notifyClient = true, userId = null) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      return this.primarySession.sendBranchDerivationNotification.call(this, order, branch, notifyClient);
    }
    const session = this.getActiveConnectedSession(userId);
    if (!session || session.status !== 'connected') {
      throw new Error(`WhatsApp no está conectado en el servidor (ninguna sesión activa disponible)`);
    }
    return session.sendBranchDerivationNotification(order, branch, notifyClient);
  }

  async getCleanOrderClientJid(order, userId = null) {
    const session = this.getActiveConnectedSession(userId);
    return session ? session.getCleanOrderClientJid(order) : null;
  }

  async resolvePhoneJid(jid, userId = null) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      const clean = this.metaService.formatRecipientPhone(jid);
      return clean ? `${clean}@s.whatsapp.net` : null;
    }
    const session = this.getActiveConnectedSession(userId);
    return session ? session.resolvePhoneJid(jid) : null;
  }

  async formatRecipientJid(target, userId = null) {
    const settings = db.getSettings();
    if (settings.whatsappProvider === 'meta_cloud' && this.metaService) {
      const clean = this.metaService.formatRecipientPhone(target);
      return clean ? `${clean}@s.whatsapp.net` : null;
    }
    const session = this.getActiveConnectedSession(userId);
    return session ? session.formatRecipientJid(target) : null;
  }

  async getParticipatingGroups(userId = null) {
    const session = this.getActiveConnectedSession(userId) || this.primarySession;
    if (!session || typeof session.getParticipatingGroups !== 'function') {
      return [];
    }
    return session.getParticipatingGroups();
  }

  async joinGroupViaInvite(inviteCodeOrUrl, userId = null) {
    const session = this.getActiveConnectedSession(userId) || this.primarySession;
    if (!session || typeof session.joinGroupViaInvite !== 'function') {
      throw new Error('WhatsApp no está conectado en el servidor');
    }
    return session.joinGroupViaInvite(inviteCodeOrUrl);
  }
}

