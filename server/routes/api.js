import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../services/database.js';
import { SpeechService } from '../services/speech.js';
import { AIService } from '../services/ai.js';
import { AudioConverter } from '../services/audioConverter.js';
import { UpdateService } from '../services/updater.js';
import { CONFIG } from '../config/index.js';

export function createApiRouter(whatsappService, io) {
  const router = express.Router();

  // Configuración de Multer para subida de audios y archivos desde el panel web
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, CONFIG.MEDIA_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
    }
  });
  const upload = multer({ storage });

  // --- 1. WhatsApp Connection & QR ---
  router.get('/whatsapp/status', (req, res) => {
    res.json(whatsappService.getStatus());
  });

  router.post('/whatsapp/connect', async (req, res) => {
    try {
      await whatsappService.initialize();
      res.json({ success: true, message: 'Inicializando conexión de WhatsApp' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/whatsapp/disconnect', async (req, res) => {
    try {
      await whatsappService.disconnect();
      res.json({ success: true, message: 'WhatsApp desconectado exitosamente' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 2. Leads & CRM Kanban ---
  router.get('/leads', (req, res) => {
    res.json(db.getLeads());
  });

  router.post('/leads', (req, res) => {
    const lead = db.saveOrUpdateLead(req.body);
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.patch('/leads/:id/stage', (req, res) => {
    const { stage } = req.body;
    const lead = db.updateLeadStage(req.params.id, stage);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.patch('/leads/:id/ai', (req, res) => {
    const { aiEnabled } = req.body;
    const lead = db.updateLeadAiStatus(req.params.id, aiEnabled);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.delete('/leads/:id', (req, res) => {
    db.deleteLead(req.params.id);
    io.emit('lead:delete', { id: req.params.id });
    res.json({ success: true });
  });

  // --- 3. Chats & Messages ---
  router.get('/chats/:jid/messages', (req, res) => {
    const messages = db.getMessages(req.params.jid, 100);
    db.markChatRead(req.params.jid);
    res.json(messages);
  });

  router.post('/chats/:jid/messages', async (req, res) => {
    const { jid } = req.params;
    const { text, sendViaWhatsApp = true } = req.body;

    if (!text) return res.status(400).json({ error: 'El texto es obligatorio' });

    try {
      // Si WhatsApp está conectado, enviar mensaje real
      if (sendViaWhatsApp && whatsappService.status === 'connected') {
        await whatsappService.sendTextMessage(jid, text);
      }

      const msg = db.saveMessage({
        chatId: jid,
        sender: 'agent',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      const lead = db.getLead(jid);
      io.emit('chat:message', { message: msg, lead });

      res.json({ success: true, message: msg });
    } catch (err) {
      console.error('Error enviando mensaje manual:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Subir y enviar nota de voz grabada desde el CRM
  router.post('/chats/:jid/send-audio', upload.single('audio'), async (req, res) => {
    const { jid } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo de audio' });

    try {
      // Convertir a WhatsApp PTT Opus OGG
      const oggPath = await AudioConverter.convertToWhatsAppPtt(req.file.path);
      const mp3Path = await AudioConverter.convertOggToMp3(oggPath);

      if (whatsappService.status === 'connected') {
        await whatsappService.sendVoiceNote(jid, oggPath);
      }

      const savedMsg = db.saveMessage({
        chatId: jid,
        sender: 'agent',
        type: 'audio',
        content: '🎤 [Nota de voz enviada por asesor]',
        mediaUrl: `/media/${path.basename(mp3Path)}`,
        audioDuration: 5,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      const lead = db.getLead(jid);
      io.emit('chat:message', { message: savedMsg, lead });

      res.json({ success: true, message: savedMsg });
    } catch (err) {
      console.error('Error procesando audio para WhatsApp:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/chats/:jid/mark-read', (req, res) => {
    db.markChatRead(req.params.jid);
    res.json({ success: true });
  });

  // Simular mensaje entrante para pruebas sin QR
  router.post('/chats/simulate-incoming', async (req, res) => {
    const { jid = '5491199998888@s.whatsapp.net', name = 'Cliente Demo', text = 'Hola, quiero información', isAudio = false } = req.body;

    let lead = db.getLead(jid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid,
        name,
        phone: jid.split('@')[0],
        pushName: name
      });
    }

    const savedMsg = db.saveMessage({
      chatId: jid,
      sender: 'user',
      type: isAudio ? 'audio' : 'text',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'received'
    });

    io.emit('chat:message', { message: savedMsg, lead: db.getLead(jid) });

    // Responder con IA si está habilitada
    const settings = db.getSettings();
    if (lead.aiEnabled && settings.autoReplyEnabled) {
      setTimeout(async () => {
        const aiResponse = await AIService.generateReply({
          jid,
          incomingText: text,
          isAudioInput: isAudio
        });

        const savedAiMsg = db.saveMessage({
          chatId: jid,
          sender: 'agent',
          type: aiResponse.shouldSendAudio ? 'audio' : 'text',
          content: aiResponse.text,
          mediaUrl: aiResponse.audioMp3Path ? `/media/${path.basename(aiResponse.audioMp3Path)}` : null,
          audioDuration: aiResponse.audioDuration || 4,
          timestamp: new Date().toISOString(),
          status: 'sent'
        });

        io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
      }, 1000);
    }

    res.json({ success: true, message: savedMsg });
  });

  // --- 4. Calls & Voice Center ---
  router.get('/calls', (req, res) => {
    res.json(db.getCalls());
  });

  // Realizar Llamada de Voz Saliente / Despacho de Voz IA
  router.post('/calls/make', async (req, res) => {
    const { jid, phone, name = 'Cliente', customMessage, voice } = req.body;

    if (!jid && !phone) {
      return res.status(400).json({ error: 'Se requiere JID o número de teléfono' });
    }

    const cleanNumber = (phone || jid).replace(/[^0-9]/g, '');
    const targetJid = jid || `${cleanNumber}@s.whatsapp.net`;

    // Registrar o actualizar Lead
    let lead = db.getLead(targetJid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid: targetJid,
        name: name || `+${cleanNumber}`,
        phone: `+${cleanNumber}`,
        pushName: name || `+${cleanNumber}`
      });
    }

    try {
      const settings = db.getSettings();
      const messageText = customMessage || `Hola ${name}, te llamamos de ${settings.businessName || 'nuestra empresa'} para darte seguimiento a tu consulta sobre nuestros servicios. ¿Cómo podemos ayudarte?`;

      // Sintetizar voz neural
      const speech = await SpeechService.textToSpeech(messageText, voice);

      // Si WhatsApp está conectado, enviar como nota de voz PTT
      if (whatsappService.status === 'connected') {
        await whatsappService.sendVoiceNote(targetJid, speech.oggPath);
      }

      // Guardar registro de llamada saliente
      const callRecord = db.saveCall({
        chatId: targetJid,
        callerNumber: lead.phone || `+${cleanNumber}`,
        callerName: lead.name || name,
        direction: 'outgoing',
        status: 'completed',
        duration: speech.durationSeconds || 5,
        timestamp: new Date().toISOString(),
        notes: `Llamada / Audio de voz saliente enviado: "${messageText.substring(0, 60)}..."`,
        aiFollowUpSent: true
      });

      // Guardar mensaje en el chat
      const savedMsg = db.saveMessage({
        chatId: targetJid,
        sender: 'agent',
        type: 'audio',
        content: messageText,
        mediaUrl: `/media/${path.basename(speech.mp3Path)}`,
        audioDuration: speech.durationSeconds,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      io.emit('whatsapp:call', { call: callRecord, lead });
      io.emit('chat:message', { message: savedMsg, lead: db.getLead(targetJid) });

      res.json({
        success: true,
        call: callRecord,
        message: savedMsg,
        audioUrl: `/media/${path.basename(speech.mp3Path)}`
      });
    } catch (err) {
      console.error('Error realizando llamada saliente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Atender llamada entrante con Agente de Voz IA
  router.post('/calls/answer-ai', async (req, res) => {
    const { callId, jid } = req.body;
    const settings = db.getSettings();

    try {
      const speech = await SpeechService.textToSpeech(settings.callFollowUpMessage);
      
      if (whatsappService.status === 'connected' && jid) {
        await whatsappService.sendVoiceNote(jid, speech.oggPath);
      }

      if (callId) {
        db.updateCall(callId, { status: 'completed', aiFollowUpSent: true });
      }

      if (jid) {
        const savedMsg = db.saveMessage({
          chatId: jid,
          sender: 'agent',
          type: 'audio',
          content: settings.callFollowUpMessage,
          mediaUrl: `/media/${path.basename(speech.mp3Path)}`,
          audioDuration: speech.durationSeconds,
          timestamp: new Date().toISOString(),
          status: 'sent'
        });

        io.emit('chat:message', { message: savedMsg, lead: db.getLead(jid) });
      }

      io.emit('whatsapp:call:updated', { callId, status: 'completed' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error respondiendo llamada con IA:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5. Knowledge Base & FAQs ---
  router.get('/knowledge', (req, res) => {
    res.json(db.getKnowledgeBase());
  });

  router.post('/knowledge', (req, res) => {
    const item = db.saveKnowledgeItem(req.body);
    res.json(item);
  });

  router.delete('/knowledge/:id', (req, res) => {
    db.deleteKnowledgeItem(req.params.id);
    res.json({ success: true });
  });

  // --- 5.1 Product Catalog ---
  router.get('/products', (req, res) => {
    res.json(db.getProducts());
  });

  router.post('/products', (req, res) => {
    const product = db.saveProduct(req.body);
    res.json(product);
  });

  router.put('/products/:id', (req, res) => {
    const product = db.updateProduct(req.params.id, req.body);
    res.json(product);
  });

  router.delete('/products/:id', (req, res) => {
    db.deleteProduct(req.params.id);
    res.json({ success: true });
  });

  // Sincronizar catálogo con WhatsApp Business
  router.post('/whatsapp/sync-catalog', async (req, res) => {
    try {
      if (whatsappService.status !== 'connected' || !whatsappService.sock) {
        return res.status(400).json({ error: 'WhatsApp no está conectado' });
      }

      let catalogProducts = [];
      try {
        const myJid = whatsappService.sock.user?.id;
        if (myJid && whatsappService.sock.getCatalog) {
          const catalogResult = await whatsappService.sock.getCatalog({ jid: myJid, limit: 50 });
          if (catalogResult && catalogResult.data) {
            catalogProducts = catalogResult.data.map(item => ({
              id: item.id || `wa-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              name: item.name || item.title,
              description: item.description || '',
              price: Number(item.price) / 1000 || 0,
              currency: item.currency || 'ARS',
              imageUrl: item.image_url || (item.media && item.media[0]?.url) || '',
              isAvailable: !item.is_hidden
            }));

            // Guardar en la base de datos
            catalogProducts.forEach(p => db.saveProduct(p));
          }
        }
      } catch (catErr) {
        console.warn('Nota: La cuenta vinculada no es WhatsApp Business o no tiene catálogo público activo:', catErr.message);
      }

      const allProducts = db.getProducts();
      res.json({
        success: true,
        syncedCount: catalogProducts.length,
        totalProducts: allProducts.length,
        products: allProducts,
        message: catalogProducts.length > 0
          ? `¡Se importaron ${catalogProducts.length} productos desde WhatsApp Business con éxito!`
          : 'Catálogo sincronizado. Puedes cargar o editar productos directamente desde el panel.'
      });
    } catch (err) {
      console.error('Error sincronizando catálogo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 6. Settings & Voice Testing ---
  router.get('/settings', (req, res) => {
    res.json({
      settings: db.getSettings(),
      availableVoices: SpeechService.getAvailableVoices()
    });
  });

  router.put('/settings', (req, res) => {
    const updated = db.updateSettings(req.body);
    io.emit('settings:update', updated);
    res.json(updated);
  });

  // Obtener voces personalizadas de la cuenta de ElevenLabs
  router.get('/elevenlabs/voices', async (req, res) => {
    const settings = db.getSettings();
    const apiKey = req.query.apiKey || settings.elevenlabsApiKey;
    if (!apiKey) {
      return res.json([]);
    }
    const voices = await SpeechService.fetchElevenLabsVoices(apiKey);
    res.json(voices);
  });

  // Prueba de síntesis de voz en vivo en el navegador
  router.post('/ai/test-voice', async (req, res) => {
    const { text = '¡Hola! Soy tu asistente de ventas por WhatsApp.', voice } = req.body;
    try {
      const speech = await SpeechService.textToSpeech(text, voice);
      res.json({
        audioUrl: `/media/${path.basename(speech.mp3Path)}`,
        duration: speech.durationSeconds
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 7. Metrics & Analytics ---
  router.get('/metrics', (req, res) => {
    res.json(db.getMetrics());
  });

  // --- 8. GitHub Updates System ---
  router.get('/system/update-check', async (req, res) => {
    try {
      const updateInfo = await UpdateService.checkUpdates();
      res.json(updateInfo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/system/update-apply', async (req, res) => {
    try {
      const result = await UpdateService.applyUpdate();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
