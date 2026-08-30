import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import { CONFIG } from '../config/index.js';
import { db } from './database.js';
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
  if (typeof content === 'string') return content;
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.videoMessage?.caption) return content.videoMessage.caption;
  if (content.documentMessage?.caption) return content.documentMessage.caption;
  if (content.buttonsResponseMessage?.selectedButtonId) return content.buttonsResponseMessage.selectedButtonId;
  if (content.listResponseMessage?.singleSelectReply?.selectedRowId) return content.listResponseMessage.singleSelectReply.selectedRowId;
  if (content.templateButtonReplyMessage?.selectedId) return content.templateButtonReplyMessage.selectedId;
  return '';
}

export class WhatsAppService {
  constructor(io) {
    this.io = io;
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'qr_ready'
    this.qrCode = null;
    this.qrDataUrl = null;
    this.user = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 15;
  }

  async initialize() {
    try {
      this.status = 'connecting';
      this.emitStatus();

      if (!fs.existsSync(CONFIG.AUTH_DIR)) {
        fs.mkdirSync(CONFIG.AUTH_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_DIR);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`Iniciando Baileys WhatsApp v${version.join('.')} (Latest: ${isLatest})`);

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ['WAgent CRM', 'Chrome', '124.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: true
      });

      // Guardar credenciales automáticamente
      this.sock.ev.on('creds.update', saveCreds);

      // Eventos de conexión y QR
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status = 'qr_ready';
          this.qrCode = qr;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
            this.emitQR();
            console.log('📌 Nuevo Código QR generado para vinculación.');
          } catch (err) {
            console.error('Error generando DataURL del QR:', err);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          console.log(`Conexión de WhatsApp cerrada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);
          this.status = 'disconnected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.user = null;
          this.emitStatus();

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reintentando conexión (${this.reconnectAttempts}/${this.maxReconnectAttempts}) en 4 segundos...`);
            setTimeout(() => this.initialize(), 4000);
          }
        } else if (connection === 'open') {
          console.log('✅ ¡Conexión de WhatsApp establecida exitosamente!');
          this.status = 'connected';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.user = this.sock.user;
          this.emitStatus();
        }
      });

      // Evento de llamadas de voz / video entrantes
      this.sock.ev.on('call', async (calls) => {
        console.log('📞 Evento de llamada de WhatsApp recibido:', calls);
        for (const call of calls) {
          await this.handleIncomingCall(call);
        }
      });

      // Evento de mensajes entrantes
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
          // Ignorar estados o mensajes broadcast de sistema
          if (!msg.key || !msg.key.remoteJid) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;
          if (msg.key.remoteJid.endsWith('@g.us')) continue; // Ignorar grupos por defecto

          await this.handleIncomingMessage(msg);
        }
      });

    } catch (error) {
      console.error('Error inicializando Baileys:', error);
      this.status = 'disconnected';
      this.emitStatus();
    }
  }

  /**
   * Manejador de eventos de llamadas entrantes
   */
  async handleIncomingCall(call) {
    const callerJid = call.from;
    const cleanNumber = callerJid.split('@')[0];
    const settings = db.getSettings();

    let lead = db.getLead(callerJid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid: callerJid,
        name: `Usuario +${cleanNumber}`,
        phone: `+${cleanNumber}`,
        pushName: `+${cleanNumber}`
      });
    }

    const callRecord = db.saveCall({
      chatId: callerJid,
      callerNumber: lead.phone || `+${cleanNumber}`,
      callerName: lead.pushName || lead.name,
      direction: 'incoming',
      status: call.status === 'offer' ? 'ringing' : (call.status === 'timeout' || call.status === 'reject' ? 'missed' : 'completed'),
      duration: 0,
      timestamp: new Date().toISOString(),
      notes: `Llamada de voz de WhatsApp (${call.status})`,
      aiFollowUpSent: false
    });

    if (this.io) {
      this.io.emit('whatsapp:call', { call: callRecord, lead });
    }

    if (settings.autoCallFollowUp && (call.status === 'offer' || call.status === 'timeout' || call.status === 'reject')) {
      setTimeout(async () => {
        try {
          console.log(`🎙️ Enviando nota de voz de seguimiento automático por llamada a ${callerJid}`);
          const followUpText = settings.callFollowUpMessage;
          const speech = await SpeechService.textToSpeech(followUpText);

          if (fs.existsSync(speech.oggPath)) {
            await this.sendVoiceNote(callerJid, speech.oggPath);
            db.updateCall(callRecord.id, { aiFollowUpSent: true });

            const savedMsg = db.saveMessage({
              chatId: callerJid,
              sender: 'agent',
              type: 'audio',
              content: followUpText,
              mediaUrl: `/media/${path.basename(speech.mp3Path)}`,
              audioDuration: speech.durationSeconds,
              timestamp: new Date().toISOString()
            });

            if (this.io) {
              this.io.emit('chat:message', { message: savedMsg, lead });
            }
          }
        } catch (err) {
          console.error('Error enviando seguimiento de llamada por IA:', err);
        }
      }, 2500);
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
    let realPhone = null;
    if (msg.key.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
      realPhone = msg.key.remoteJidAlt.split('@')[0];
    } else if (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net')) {
      realPhone = msg.key.participant.split('@')[0];
    } else if (jid.includes('@s.whatsapp.net')) {
      realPhone = jid.split('@')[0];
    }

    const cleanNumber = realPhone || jid.split('@')[0];
    const phoneDisplay = realPhone ? `+${realPhone}` : `+${cleanNumber}`;

    // Obtener o registrar Lead (con IA habilitada por defecto)
    let lead = db.getLead(jid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid,
        name: pushName !== 'Contacto WhatsApp' ? pushName : phoneDisplay,
        phone: phoneDisplay,
        pushName,
        aiEnabled: true
      });
    } else if (pushName !== 'Contacto WhatsApp' && (lead.name === 'Contacto WhatsApp' || lead.name.startsWith('+'))) {
      lead = db.saveOrUpdateLead({
        ...lead,
        name: pushName,
        pushName,
        phone: phoneDisplay
      });
    }

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

        // Convertir a MP3 para reproducción en el CRM
        const mp3Path = await AudioConverter.convertOggToMp3(oggPath);
        mediaUrl = `/media/${path.basename(mp3Path)}`;

        // Transcribir audio a texto con IA
        textContent = await SpeechService.transcribeAudio(mp3Path);
        console.log(`🎙️ Transcripción de audio: "${textContent}"`);
      } catch (err) {
        console.error('Error procesando audio entrante:', err);
        textContent = '[Nota de voz recibida]';
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

    console.log(`📩 [WhatsApp ${isFromMe ? 'Saliente' : 'Entrante'}] De ${pushName} (${phoneDisplay}): "${textContent}" (Tipo: ${messageType})`);

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

    // Emitir mensaje en tiempo real al frontend
    if (this.io) {
      this.io.emit('chat:message', { message: savedMessage, lead });
    }

    // Si el mensaje viene de un cliente y la IA está activa
    const settings = db.getSettings();
    if (!isFromMe && lead.aiEnabled && settings.autoReplyEnabled) {
      console.log(`🤖 Agente de IA procesando respuesta automática para ${jid}...`);

      // Marcar como leído
      try {
        if (this.sock) {
          await this.sock.readMessages([msg.key]);
        }
      } catch (e) {}

      // Simular delay natural de escritura
      setTimeout(async () => {
        try {
          // Enviar presencia de escribiendo / grabando audio
          if (this.sock) {
            try {
              await this.sock.sendPresenceUpdate(isAudio ? 'recording' : 'composing', jid);
            } catch (presenceErr) {}
          }

          let responseText = '';
          let shouldSendAudio = false;
          let audioPath = null;
          let audioMp3Path = null;
          let audioDuration = 0;

          if (isImage && downloadedImagePath) {
            // Análisis visual con IA para comprobantes o productos
            const visionResult = await AIService.analyzeImageAndReply({
              jid,
              imagePath: downloadedImagePath,
              caption: textContent
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

          console.log(`📤 Enviando respuesta a ${jid}: "${responseText}" (Voz: ${shouldSendAudio})`);

          // Enviar respuesta por WhatsApp
          if (shouldSendAudio && audioPath && fs.existsSync(audioPath)) {
            // Enviar Nota de Voz Oficial PTT
            await this.sendVoiceNote(jid, audioPath);

            const savedAiMsg = db.saveMessage({
              chatId: jid,
              sender: 'agent',
              type: 'audio',
              content: responseText,
              mediaUrl: audioMp3Path ? `/media/${path.basename(audioMp3Path)}` : null,
              audioDuration: audioDuration || 4,
              timestamp: new Date().toISOString(),
              status: 'sent'
            });

            if (this.io) {
              this.io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
            }
          } else {
            // Enviar Mensaje de Texto
            await this.sendMessage(jid, responseText);

            const savedAiMsg = db.saveMessage({
              chatId: jid,
              sender: 'agent',
              type: 'text',
              content: responseText,
              timestamp: new Date().toISOString(),
              status: 'sent'
            });

            if (this.io) {
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
    return await this.sock.sendMessage(cleanJid, { text });
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

    return await this.sock.sendMessage(cleanJid, {
      audio: audioBuffer,
      mimetype: 'audio/ogg; codecs=opus',
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

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      qrDataUrl: this.qrDataUrl,
      user: this.user
    };
  }

  emitStatus() {
    if (this.io) {
      this.io.emit('whatsapp:status', this.getStatus());
    }
  }

  emitQR() {
    if (this.io) {
      this.io.emit('whatsapp:qr', {
        qrCode: this.qrCode,
        qrDataUrl: this.qrDataUrl
      });
    }
  }
}
