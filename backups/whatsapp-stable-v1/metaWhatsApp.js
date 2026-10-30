import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config/index.js';
import { db, isLidIdentifier, normalizePhoneNumber } from './database.js';
import { AIService } from './ai.js';
import { AudioConverter } from './audioConverter.js';
import { SpeechService } from './speech.js';

/**
 * Servicio Oficial de Meta WhatsApp Cloud API (WhatsApp Business Platform)
 * Maneja mensajería saliente oficial, webhooks entrantes, verificación de firmas,
 * descarga/subida de multimedia y automatizaciones del CRM con IA.
 */
export class MetaWhatsAppService {
  constructor(io = null) {
    this.io = io;
    this.displayPhoneNumber = null;
    this.verifiedName = null;
    this.qualityRating = null;
  }

  setIo(io) {
    this.io = io;
  }

  /**
   * Obtiene las credenciales actuales de Meta desde la base de datos
   */
  getCredentials() {
    const settings = db.getSettings() || {};
    return {
      provider: settings.whatsappProvider || 'baileys',
      phoneNumberId: String(settings.metaPhoneNumberId || '').trim(),
      wabaId: String(settings.metaWabaId || '').trim(),
      accessToken: String(settings.metaAccessToken || '').trim(),
      verifyToken: String(settings.metaVerifyToken || 'wagent_meta_verify_2026').trim(),
      appSecret: String(settings.metaAppSecret || '').trim(),
      apiVersion: String(settings.metaApiVersion || 'v21.0').trim()
    };
  }

  /**
   * Determina si Meta Cloud API tiene las credenciales mínimas configuradas
   */
  isConfigured() {
    const { phoneNumberId, accessToken } = this.getCredentials();
    return Boolean(phoneNumberId && accessToken);
  }

  /**
   * Retorna el estado completo del proveedor Meta Cloud API
   */
  getStatus() {
    const creds = this.getCredentials();
    const configured = this.isConfigured();
    return {
      provider: 'meta_cloud',
      isConfigured: configured,
      status: configured ? 'connected' : 'disconnected',
      phoneNumberId: creds.phoneNumberId,
      wabaId: creds.wabaId,
      apiVersion: creds.apiVersion,
      verifyToken: creds.verifyToken,
      hasAccessToken: Boolean(creds.accessToken),
      displayPhoneNumber: this.displayPhoneNumber,
      verifiedName: this.verifiedName,
      qualityRating: this.qualityRating
    };
  }

  /**
   * Prueba la conectividad y validez de las credenciales con Meta Graph API
   */
  async testConnection({ phoneNumberId = null, accessToken = null, apiVersion = null } = {}) {
    const creds = this.getCredentials();
    const pid = phoneNumberId || creds.phoneNumberId;
    const token = accessToken || creds.accessToken;
    const version = apiVersion || creds.apiVersion || 'v21.0';

    if (!pid || !token) {
      throw new Error('Identificador de número (Phone Number ID) y Token de Acceso son obligatorios.');
    }

    const url = `https://graph.facebook.com/${version}/${pid}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status`;
    const startMs = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    const latencyMs = Date.now() - startMs;

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${response.status}: ${response.statusText}`;
      const errCode = data.error?.code;
      throw new Error(`Meta API error [${errCode || response.status}]: ${errMsg}`);
    }

    this.displayPhoneNumber = data.display_phone_number || null;
    this.verifiedName = data.verified_name || null;
    this.qualityRating = data.quality_rating || null;

    if (this.io) {
      this.io.emit('whatsapp:status', this.getStatus());
    }

    return {
      success: true,
      latencyMs,
      data: {
        id: data.id,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        verificationStatus: data.code_verification_status
      }
    };
  }

  /**
   * Normaliza números de teléfono al formato E.164 numérico requerido por Meta
   */
  formatRecipientPhone(target) {
    if (!target) return null;
    let clean = String(target).trim();
    if (clean.includes('@')) {
      clean = clean.split('@')[0];
    }
    clean = clean.replace(/\D/g, '');
    if (!clean) return null;

    // Normalizar números argentinos
    if (clean.length === 10 && !clean.startsWith('54')) {
      clean = '549' + clean;
    } else if (clean.length === 12 && clean.startsWith('54') && !clean.startsWith('549')) {
      clean = '549' + clean.slice(2);
    }
    return clean;
  }

  /**
   * Envía un mensaje de texto simple por Meta Cloud API
   */
  async sendTextMessage(to, text) {
    const creds = this.getCredentials();
    if (!creds.phoneNumberId || !creds.accessToken) {
      throw new Error('Meta WhatsApp Cloud API no está configurada (falta Phone Number ID o Access Token)');
    }

    const cleanTo = this.formatRecipientPhone(to);
    if (!cleanTo) {
      throw new Error(`Número de destinatario inválido: ${to}`);
    }

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: false,
        body: String(text || '').trim()
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${res.status}`;
      throw new Error(`Meta Cloud API sendTextMessage failed: ${errMsg}`);
    }

    const messageId = data.messages?.[0]?.id || `meta-${Date.now()}`;
    return {
      key: { id: messageId, remoteJid: `${cleanTo}@s.whatsapp.net`, fromMe: true },
      messageId,
      status: 'sent',
      data
    };
  }

  /**
   * Sube un archivo binario a Meta Graph API y devuelve el Media ID
   */
  async uploadMedia(filePathOrBuffer, mimeType, filename = 'media') {
    const creds = this.getCredentials();
    if (!creds.phoneNumberId || !creds.accessToken) {
      throw new Error('Meta WhatsApp Cloud API no está configurada para subir multimedia');
    }

    let buffer;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      buffer = filePathOrBuffer;
    } else if (typeof filePathOrBuffer === 'string') {
      if (!fs.existsSync(filePathOrBuffer)) {
        throw new Error(`Archivo multimedia no encontrado: ${filePathOrBuffer}`);
      }
      buffer = fs.readFileSync(filePathOrBuffer);
    } else {
      throw new Error('filePathOrBuffer debe ser un Buffer o una ruta de archivo existente');
    }

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('file', blob, filename);

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/media`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${res.status}`;
      throw new Error(`Meta Cloud API uploadMedia falló: ${errMsg}`);
    }

    return data.id;
  }

  /**
   * Envía una nota de voz o audio a través de Meta Cloud API
   */
  async sendVoiceNote(to, audioPathOrBuffer) {
    const creds = this.getCredentials();
    const cleanTo = this.formatRecipientPhone(to);
    if (!cleanTo) throw new Error(`Número inválido para nota de voz: ${to}`);

    const mimeType = 'audio/ogg; codecs=opus';
    const mediaId = await this.uploadMedia(audioPathOrBuffer, mimeType, 'voice_note.ogg');

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'audio',
      audio: {
        id: mediaId
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${res.status}`;
      throw new Error(`Meta Cloud API sendVoiceNote falló: ${errMsg}`);
    }

    const messageId = data.messages?.[0]?.id || `meta-voice-${Date.now()}`;
    return {
      key: { id: messageId, remoteJid: `${cleanTo}@s.whatsapp.net`, fromMe: true },
      messageId,
      status: 'sent',
      data
    };
  }

  /**
   * Envía una imagen con subtítulo a través de Meta Cloud API
   */
  async sendImageMessage(to, imagePathOrBuffer, caption = '') {
    const creds = this.getCredentials();
    const cleanTo = this.formatRecipientPhone(to);
    if (!cleanTo) throw new Error(`Número inválido para enviar imagen: ${to}`);

    let payloadImage = {};
    if (typeof imagePathOrBuffer === 'string' && (imagePathOrBuffer.startsWith('http://') || imagePathOrBuffer.startsWith('https://'))) {
      payloadImage = {
        link: imagePathOrBuffer,
        caption: caption || undefined
      };
    } else {
      const mediaId = await this.uploadMedia(imagePathOrBuffer, 'image/jpeg', 'image.jpg');
      payloadImage = {
        id: mediaId,
        caption: caption || undefined
      };
    }

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'image',
      image: payloadImage
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${res.status}`;
      throw new Error(`Meta Cloud API sendImageMessage falló: ${errMsg}`);
    }

    const messageId = data.messages?.[0]?.id || `meta-img-${Date.now()}`;
    return {
      key: { id: messageId, remoteJid: `${cleanTo}@s.whatsapp.net`, fromMe: true },
      messageId,
      status: 'sent',
      data
    };
  }

  /**
   * Envía un mensaje polimórfico (texto o multimedia)
   */
  async sendMessage(to, text, media = null) {
    if (media) {
      if (typeof media === 'string') {
        const ext = path.extname(media).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
          return this.sendImageMessage(to, media, text);
        } else if (['.ogg', '.mp3', '.m4a', '.wav'].includes(ext)) {
          return this.sendVoiceNote(to, media);
        }
      }
    }
    return this.sendTextMessage(to, text);
  }

  /**
   * Envía plantilla oficial de Meta WhatsApp
   */
  async sendTemplateMessage(to, templateName, languageCode = 'es_AR', components = []) {
    const creds = this.getCredentials();
    const cleanTo = this.formatRecipientPhone(to);
    if (!cleanTo) throw new Error(`Número inválido: ${to}`);

    const url = `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components || []
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `Error HTTP ${res.status}`;
      throw new Error(`Meta Cloud API sendTemplateMessage falló: ${errMsg}`);
    }

    return data;
  }

  /**
   * Descarga un archivo multimedia enviado por un usuario desde Meta Graph API
   */
  async downloadMedia(mediaId) {
    const creds = this.getCredentials();
    if (!creds.accessToken) throw new Error('Meta accessToken no configurado para descarga');

    // 1. Obtener URL de descarga temporal
    const metaUrl = `https://graph.facebook.com/${creds.apiVersion}/${mediaId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${creds.accessToken}` }
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData.url) {
      throw new Error(`Fallo obteniendo URL de media: ${metaData.error?.message || metaRes.statusText}`);
    }

    // 2. Descargar el archivo binario
    const binRes = await fetch(metaData.url, {
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'User-Agent': 'curl/7.64.1'
      }
    });
    if (!binRes.ok) {
      throw new Error(`Fallo descargando binario de media (${binRes.status})`);
    }

    const arrayBuffer = await binRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mime = metaData.mime_type || '';
    let ext = '.bin';
    if (mime.includes('audio/ogg')) ext = '.ogg';
    else if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) ext = '.m4a';
    else if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) ext = '.mp3';
    else if (mime.includes('image/jpeg')) ext = '.jpg';
    else if (mime.includes('image/png')) ext = '.png';
    else if (mime.includes('image/webp')) ext = '.webp';
    else if (mime.includes('pdf')) ext = '.pdf';

    const filename = `meta_${Date.now()}_${mediaId}${ext}`;
    const localPath = path.join(CONFIG.MEDIA_DIR, filename);
    fs.writeFileSync(localPath, buffer);

    return {
      localPath,
      mediaUrl: `/media/${filename}`,
      mimeType: mime,
      fileSize: buffer.length
    };
  }

  /**
   * Valida la firma criptográfica HMAC-SHA256 del webhook si se definió metaAppSecret
   */
  verifySignature(rawBody, signatureHeader) {
    const creds = this.getCredentials();
    if (!creds.appSecret) return true; // Si no hay secreto configurado, se permite
    if (!signatureHeader) return false;

    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') return false;
    const expectedHash = parts[1];

    const hmac = crypto.createHmac('sha256', creds.appSecret);
    const calculatedHash = hmac.update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(calculatedHash, 'hex'));
    } catch (_) {
      return false;
    }
  }

  /**
   * Procesa el payload JSON enviado por el webhook de Meta
   */
  async handleWebhookPayload(payload) {
    if (!payload || payload.object !== 'whatsapp_business_account') {
      return { handled: false, reason: 'not_whatsapp_business_account' };
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const val = change.value;
        if (!val) continue;

        // 1. Confirmaciones de entrega y lectura (statuses)
        if (Array.isArray(val.statuses)) {
          for (const st of val.statuses) {
            const messageId = st.id;
            const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const recipientId = st.recipient_id;
            const errorDetails = st.errors?.map(e => e.message || e.title).join(', ') || null;

            console.log(`📡 [Meta Webhook Status] Mensaje ${messageId} para ${recipientId} => ${status}`);
            const updated = db.updateMessageStatus(messageId, status, errorDetails);

            if (this.io) {
              this.io.emit('chat:message:status', {
                messageId,
                status,
                recipientId,
                updatedMessage: updated
              });
            }
          }
        }

        // 2. Mensajes entrantes de clientes
        if (Array.isArray(val.messages)) {
          const contacts = val.contacts || [];
          for (const msg of val.messages) {
            await this.processIncomingMetaMessage(msg, contacts, val.metadata);
          }
        }
      }
    }

    return { handled: true };
  }

  /**
   * Procesa un mensaje individual recibido desde Meta Cloud API
   */
  async processIncomingMetaMessage(msg, contacts = [], metadata = {}) {
    const rawSender = msg.from; // e.g. "5493516262475"
    if (!rawSender) return;

    const jid = `${rawSender}@s.whatsapp.net`;
    const contactInfo = contacts.find(c => c.wa_id === rawSender);
    const pushName = contactInfo?.profile?.name || `+${rawSender}`;

    let lead = db.findOrCreateLead({
      jid,
      phone: `+${rawSender}`,
      pushName,
      aiEnabled: true
    });

    let textContent = '';
    let messageType = 'text';
    let mediaUrl = null;
    let audioDuration = 0;
    let isAudio = false;
    let isImage = false;
    let downloadedImagePath = null;

    if (msg.type === 'text') {
      textContent = msg.text?.body || '';
      messageType = 'text';
    } else if (msg.type === 'audio') {
      isAudio = true;
      messageType = 'audio';
      try {
        console.log(`📥 [Meta Cloud] Descargando audio de ${jid}...`);
        const audioInfo = await this.downloadMedia(msg.audio.id);
        mediaUrl = audioInfo.mediaUrl;
        let playablePath = audioInfo.localPath;
        try {
          playablePath = await AudioConverter.convertOggToMp3(audioInfo.localPath);
          mediaUrl = `/media/${path.basename(playablePath)}`;
        } catch (_) {}

        try {
          textContent = await SpeechService.transcribeAudio(playablePath);
          console.log(`🎙️ [Meta Audio Transcripción]: "${textContent}"`);
        } catch (sttErr) {
          textContent = '🎤 [Nota de voz recibida]';
        }
      } catch (err) {
        console.error('Error procesando audio de Meta:', err.message);
        textContent = '🎤 [Nota de voz recibida]';
      }
    } else if (msg.type === 'image') {
      isImage = true;
      messageType = 'image';
      try {
        console.log(`📥 [Meta Cloud] Descargando imagen de ${jid}...`);
        const imgInfo = await this.downloadMedia(msg.image.id);
        downloadedImagePath = imgInfo.localPath;
        mediaUrl = imgInfo.mediaUrl;
        textContent = msg.image.caption || '[Foto recibida]';
      } catch (err) {
        console.error('Error procesando imagen de Meta:', err.message);
        textContent = msg.image?.caption || '[Foto recibida]';
      }
    } else if (msg.type === 'document') {
      messageType = 'document';
      try {
        const docInfo = await this.downloadMedia(msg.document.id);
        mediaUrl = docInfo.mediaUrl;
        textContent = msg.document.caption || `📄 ${msg.document.filename || 'Documento recibido'}`;
      } catch (err) {
        textContent = msg.document?.caption || '📄 [Documento recibido]';
      }
    } else if (msg.type === 'location') {
      messageType = 'location';
      const loc = msg.location || {};
      textContent = `📍 Ubicación compartida: lat ${loc.latitude}, lng ${loc.longitude}${loc.name ? ` (${loc.name})` : ''}`;
    } else if (msg.type === 'interactive') {
      const inter = msg.interactive || {};
      if (inter.type === 'button_reply') {
        textContent = inter.button_reply?.title || inter.button_reply?.id || '';
      } else if (inter.type === 'list_reply') {
        textContent = inter.list_reply?.title || inter.list_reply?.id || '';
      }
    } else if (msg.type === 'button') {
      textContent = msg.button?.text || msg.button?.payload || '';
    }

    if (!textContent && !isAudio && !isImage) return;

    // Detección automática de número de teléfono si el cliente lo escribe en el texto
    const phoneRegexMatch = textContent.match(/(?:\+?54\s*9?\s*)?(?:35\d{1,2}|11|2\d{2,3})\s*[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
    if (phoneRegexMatch) {
      const norm = normalizePhoneNumber(phoneRegexMatch[0]);
      if (norm && (!lead.phone || lead.phone.startsWith('+1') || lead.phone.length < 8)) {
        db.updateLead(lead.id, { phone: norm });
        lead = db.getLead(jid);
      }
    }

    console.log(`📩 [WhatsApp Meta Cloud Entrante] De ${pushName} (${lead?.phone || jid}): "${textContent}" (Tipo: ${messageType})`);

    // Guardar mensaje en base de datos
    const savedMessage = db.saveMessage({
      id: msg.id,
      chatId: jid,
      sender: 'user',
      type: messageType,
      content: textContent,
      mediaUrl,
      audioDuration,
      timestamp: new Date(Number(msg.timestamp || Date.now() / 1000) * 1000).toISOString(),
      status: 'received'
    });

    lead = db.getLead(jid);

    if (this.io && !savedMessage._isDuplicate) {
      this.io.emit('chat:message', { message: savedMessage, lead });
    }

    // Interceptar mensajes de Sucursales
    const branch = db.getBranchByPhone(jid) || (lead?.phone ? db.getBranchByPhone(lead.phone) : null);
    if (branch) {
      console.log(`🏪 Mensaje de Sucursal recibido vía Meta Cloud: "${branch.name}": "${textContent}"`);
      return;
    }

    // Interceptar mensajes de Repartidores
    const driver = db.getDriverByPhone(jid) || (lead?.phone ? db.getDriverByPhone(lead.phone) : null);
    if (driver) {
      console.log(`🛵 Mensaje de Repartidor recibido vía Meta Cloud: "${driver.name}": "${textContent}"`);
      return;
    }

    // Flujo de Respuesta Automática con IA
    const settings = db.getSettings();
    const isAiGloballyEnabled = Boolean(settings.autoReplyEnabled !== false);
    const isAiChatEnabled = Boolean(lead ? lead.aiEnabled !== false : true);

    if (isAiGloballyEnabled && isAiChatEnabled) {
      console.log(`🤖 [Meta Cloud API] IA procesando respuesta automática para ${jid}...`);

      setTimeout(async () => {
        try {
          let responseText = '';
          let shouldSendAudio = false;
          let audioPath = null;
          let audioMp3Path = null;
          let audioDuration = 0;

          if (isImage && downloadedImagePath) {
            const visionResult = await SpeechService.analyzeImageWithAI({
              imagePath: downloadedImagePath,
              caption: textContent,
              jid
            });
            responseText = visionResult?.text || '';
          } else {
            const aiResponse = await AIService.generateReply({
              jid,
              incomingText: textContent || 'Hola',
              isAudioInput: isAudio
            });
            responseText = aiResponse?.text || '';
            shouldSendAudio = Boolean(aiResponse?.shouldSendAudio);
            audioPath = aiResponse?.audioOggPath || null;
            audioMp3Path = aiResponse?.audioMp3Path || null;
            audioDuration = aiResponse?.audioDuration || 0;
          }

          let cleanClientResponse = (responseText || '').replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();
          if (!cleanClientResponse) {
            cleanClientResponse = '¡Hola! ¿En qué puedo asesorarte hoy con tu pedido en República de la Carne? 🥩';
          }

          console.log(`📤 [Meta Cloud API] Enviando respuesta a ${jid}: "${cleanClientResponse.slice(0, 80)}..." (Voz: ${shouldSendAudio})`);

          if (shouldSendAudio && audioPath && fs.existsSync(audioPath)) {
            const sent = await this.sendVoiceNote(rawSender, audioPath);
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
            const sent = await this.sendTextMessage(rawSender, cleanClientResponse);
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
        } catch (err) {
          console.error('Error enviando respuesta de IA vía Meta Cloud API:', err);
        }
      }, 1200);
    }
  }
}
