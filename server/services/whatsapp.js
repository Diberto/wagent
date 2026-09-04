import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
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

export class WhatsAppService {
  constructor(io, sessionId = 'default', authDir = null) {
    this.io = io;
    this.sessionId = sessionId;
    this.authDir = authDir || (sessionId === 'default' ? CONFIG.AUTH_DIR : path.join(CONFIG.DATA_DIR, `auth_info_baileys_${sessionId}`));
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'qr_ready'
    this.qrCode = null;
    this.qrDataUrl = null;
    this.user = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.isInitializing = false;
    this.lidToPhoneMap = new Map();
    this.phoneToLidMap = new Map();
  }

  /**
   * Respalda las credenciales de Baileys para asegurar que nunca se pierda la sesión
   */
  backupAuthFiles() {
    try {
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

      const isCredsActiveValid = fs.existsSync(credsActive) && fs.statSync(credsActive).size > 10;
      const isCredsBackupValid = fs.existsSync(credsBackup) && fs.statSync(credsBackup).size > 10;

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
   * Limpia archivos de autenticación solo si el usuario lo solicita explícitamente o WhatsApp cerró sesión
   */
  async clearAuthFiles() {
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
    } catch (err) {
      console.error(`Error purgando authDir de sesión [${this.sessionId}]:`, err);
    }
  }

  async initialize({ resetAuth = false } = {}) {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (resetAuth) {
        await this.clearAuthFiles();
        this.reconnectAttempts = 0;
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

      // Si las credenciales activas no están pero existe backup, restaurar
      this.restoreAuthFromBackup();

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`Iniciando Baileys WhatsApp [Sesión: ${this.sessionId}] v${version.join('.')} (Latest: ${isLatest})`);

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: [`WAgent CRM (${this.sessionId})`, 'Chrome', '124.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 2000
      });

      // Guardar credenciales y respaldar automáticamente
      this.sock.ev.on('creds.update', async () => {
        await saveCreds();
        this.backupAuthFiles();
      });

      // Eventos de conexión y QR
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status = 'qr_ready';
          this.qrCode = qr;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
            this.emitQR();
            this.emitStatus();
            console.log(`📌 [${this.sessionId}] Nuevo Código QR generado para vinculación.`);
          } catch (err) {
            console.error('Error generando DataURL del QR:', err);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
          const shouldReconnect = !isLoggedOut;
          
          console.log(`Conexión de WhatsApp cerrada [${this.sessionId}]. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);
          
          if (isLoggedOut) {
            console.log(`⚠️ Sesión [${this.sessionId}] cerrada por WhatsApp (Logged Out explícito). Limpiando auth...`);
            await this.clearAuthFiles();
          }

          this.status = 'disconnected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.user = null;
          this.emitStatus();

          if (shouldReconnect) {
            this.reconnectAttempts++;
            // Backoff exponencial progresivo: 4s, 6s, 9s... hasta 30s máx (sin límite destructivo de intentos)
            const delayMs = Math.min(30000, Math.round(4000 * Math.pow(1.25, Math.min(this.reconnectAttempts, 10))));
            console.log(`Reintentando conexión automática (${this.reconnectAttempts}) en ${Math.round(delayMs / 1000)}s...`);
            setTimeout(() => {
              this.isInitializing = false;
              this.initialize();
            }, delayMs);
          }
        } else if (connection === 'open') {
          console.log(`✅ ¡Conexión de WhatsApp establecida exitosamente [${this.sessionId}]!`);
          this.status = 'connected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.user = this.sock.user;
          this.emitStatus();
          // Asegurar respaldo de credenciales válidas
          this.backupAuthFiles();
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
          if (msg.key.remoteJid.endsWith('@g.us')) continue;

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
        const imgPath = path.join(CONFIG.MEDIA_DIR, `img_${Date.now()}_${msg.key.id}.jpg`);
        fs.writeFileSync(imgPath, buffer);
        downloadedImagePath = imgPath;
        mediaUrl = `/media/${path.basename(imgPath)}`;
        textContent = messageContent.imageMessage?.caption || messageContent.documentMessage?.caption || '[Imagen / Comprobante recibido]';
        console.log(`📸 Imagen guardada en: ${mediaUrl}`);
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
      console.log(`🤖 Agente de IA procesando respuesta automática para ${jid} (Global: ON, Chat: ON)...`);

      // Mostrar estado de presencia "componiendo" / "escribiendo" en WhatsApp
      if (this.sock) {
        try {
          await this.sock.sendPresenceUpdate('composing', jid);
        } catch (e) {}
      }

      // Delay natural de respuesta humana (1.2 a 2.5 seg)
      setTimeout(async () => {
        try {
          let responseText = '';
          let shouldSendAudio = false;
          let audioPath = null;
          let audioMp3Path = null;
          let audioDuration = 0;

          if (isImage && downloadedImagePath) {
            // Analizar imagen (comprobantes, cartas, productos)
            const visionResult = await SpeechService.analyzeImageWithAI({
              imagePath: downloadedImagePath,
              caption: textContent,
              jid
            });
            responseText = visionResult.text;
          } else {
            // Generar respuesta inteligente con LLM / RAG
            const aiResponse = await AIService.generateReply({
              jid,
              incomingText: textContent || 'Hola',
              isAudioInput: isAudio
            });
            responseText = aiResponse.text;
            shouldSendAudio = aiResponse.shouldSendAudio;
            audioPath = aiResponse.audioOggPath;
            audioMp3Path = aiResponse.audioMp3Path;
            audioDuration = aiResponse.audioDuration;
          }

          // Sanitizar COMPLETAMENTE cualquier etiqueta técnica interna [[...]] antes de enviar al cliente
          const cleanClientResponse = (responseText || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();

          console.log(`📤 Enviando respuesta a ${jid}: "${cleanClientResponse}" (Voz: ${shouldSendAudio})`);

          // Enviar respuesta por WhatsApp
          if (shouldSendAudio && audioPath && fs.existsSync(audioPath)) {
            // Enviar Nota de Voz Oficial PTT
            const sent = await this.sendVoiceNote(jid, audioPath);

            const savedAiMsg = db.saveMessage({
              id: sent?.key?.id,
              chatId: jid,
              sender: 'agent',
              type: 'audio',
              content: cleanClientResponse,
              mediaUrl: audioMp3Path ? `/media/${path.basename(audioMp3Path)}` : null,
              audioDuration: audioDuration || 4,
              timestamp: new Date().toISOString(),
              status: 'sent'
            });

            if (this.io && !savedAiMsg._isDuplicate) {
              this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
            }
          } else {
            // Enviar Mensaje de Texto
            const sent = await this.sendTextMessage(jid, cleanClientResponse);

            const savedAiMsg = db.saveMessage({
              id: sent?.key?.id,
              chatId: jid,
              sender: 'agent',
              type: 'text',
              content: cleanClientResponse,
              timestamp: new Date().toISOString(),
              status: 'sent'
            });

            if (this.io && !savedAiMsg._isDuplicate) {
              this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
            }
          }

          // Pausar presencia
          if (this.sock) {
            try {
              await this.sock.sendPresenceUpdate('paused', jid);
            } catch (e) {}
          }
        } catch (err) {
          console.error('Error enviando respuesta automática de IA:', err);
        }
      }, 1500);
    }
  }

  /**
   * Envía un mensaje de texto a un JID
   */
  async sendTextMessage(jid, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp no está conectado');
    }
    const cleanJid = jidNormalizedUser(jid);
    const cleanText = (text || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();
    return await this.sock.sendMessage(cleanJid, { text: cleanText });
  }

  async sendMessage(jid, text) {
    return await this.sendTextMessage(jid, text);
  }

  /**
   * Envía una imagen con texto / epígrafe a un JID
   */
  async sendImageMessage(jid, imagePathOrBuffer, caption = '') {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp no está conectado');
    }

    const cleanJid = jidNormalizedUser(jid);
    const imgBuffer = Buffer.isBuffer(imagePathOrBuffer) ? imagePathOrBuffer : fs.readFileSync(imagePathOrBuffer);
    const cleanCaption = (caption || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();

    return await this.sock.sendMessage(cleanJid, {
      image: imgBuffer,
      caption: cleanCaption
    });
  }

  /**
   * Envía una nota de voz PTT (.ogg opus) a un JID
   */
  async sendVoiceNote(jid, audioPathOrBuffer) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp no está conectado');
    }

    const cleanJid = jidNormalizedUser(jid);
    const audioBuffer = Buffer.isBuffer(audioPathOrBuffer) ? audioPathOrBuffer : fs.readFileSync(audioPathOrBuffer);
    const isOgg = typeof audioPathOrBuffer === 'string' ? (audioPathOrBuffer.endsWith('.ogg') || audioPathOrBuffer.endsWith('.opus')) : true;

    return await this.sock.sendMessage(cleanJid, {
      audio: audioBuffer,
      mimetype: isOgg ? 'audio/ogg; codecs=opus' : 'audio/mp4',
      ptt: true // Nota de voz nativa en WhatsApp
    });
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
      this.status = 'disconnected';
      this.qrCode = null;
      this.qrDataUrl = null;
      this.user = null;
      this.reconnectAttempts = 0;
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
          this.sock = null;
        } catch (e) {}
      }
      if (clearAuth) {
        await this.clearAuthFiles();
      }
      this.emitStatus();
    } catch (e) {
      console.error(`Error desconectando sesión de WhatsApp [${this.sessionId}]:`, e);
    }
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      userId: this.sessionId,
      status: this.status,
      qrCode: this.qrCode,
      qrDataUrl: this.qrDataUrl,
      user: this.user
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
    // Sesión Maestra Principal
    this.primarySession = new WhatsAppService(io, 'default', CONFIG.AUTH_DIR);
    this.sessions.set('default', this.primarySession);
  }

  async initializePrimary() {
    await this.primarySession.initialize();
  }

  getSession(userId = 'default') {
    const id = userId || 'default';
    if (!this.sessions.has(id)) {
      const authDir = id === 'default' ? CONFIG.AUTH_DIR : path.join(CONFIG.DATA_DIR, `auth_info_baileys_${id}`);
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
    const session = this.getSession(userId);
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
    return this.primarySession?.status || 'disconnected';
  }

  async sendTextMessage(jid, text, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendTextMessage(jid, text);
  }

  async sendVoiceNote(jid, audioPathOrBuffer, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendVoiceNote(jid, audioPathOrBuffer);
  }

  async sendImageMessage(jid, imagePathOrBuffer, caption = '', userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendImageMessage(jid, imagePathOrBuffer, caption);
  }

  async sendMessage(jid, text, media = null, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendMessage(jid, text, media);
  }

  async sendDriverDispatchNotification(order, driver, notifyClient = true, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendDriverDispatchNotification(order, driver, notifyClient);
  }

  async sendBranchDerivationNotification(order, branch, notifyClient = true, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendBranchDerivationNotification(order, branch, notifyClient);
  }

  async getCleanOrderClientJid(order, userId = 'default') {
    let session = this.getSession(userId);
    if (!session) {
      session = this.primarySession;
    }
    return session ? session.getCleanOrderClientJid(order) : null;
  }

  async sendTextMessage(jid, text, userId = 'default') {
    let session = this.getSession(userId);
    if (!session || session.status !== 'connected') {
      session = this.primarySession;
    }
    return session.sendTextMessage(jid, text);
  }
}

