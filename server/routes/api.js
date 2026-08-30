import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../services/database.js';
import { SpeechService } from '../services/speech.js';
import { AIService } from '../services/ai.js';
import { AudioConverter } from '../services/audioConverter.js';
import { UpdateService } from '../services/updater.js';
import { BackupService } from '../services/backup.js';
import { mercadoPagoService } from '../services/mercadopago.js';
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

  router.post('/knowledge/:id/duplicate', (req, res) => {
    const item = db.duplicateKnowledgeItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });
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

  router.post('/products/:id/duplicate', (req, res) => {
    const product = db.duplicateProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
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

  // --- 5.1 Orders Management System ---
  router.get('/orders', (req, res) => {
    res.json(db.getOrders());
  });

  router.post('/orders', (req, res) => {
    const order = db.createOrder(req.body);
    io.emit('order:new', order);
    res.json(order);
  });

  router.patch('/orders/:id/status', async (req, res) => {
    const { status, notifyCustomer, notificationMessage } = req.body;
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const updated = db.updateOrderStatus(req.params.id, status);
    io.emit('order:update', updated);

    // Si el operador confirmó el envío de aviso por WhatsApp al cliente
    if (notifyCustomer && notificationMessage) {
      try {
        const targetJid = order.jid || (order.phone ? `${order.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (targetJid) {
          await whatsappService.sendMessage(targetJid, notificationMessage);
          
          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'agent',
            type: 'text',
            content: notificationMessage,
            timestamp: new Date().toISOString()
          });

          // Actualizar último mensaje del lead
          const lead = db.getLead(targetJid);
          if (lead) {
            db.updateLead(lead.id, {
              lastMessage: notificationMessage,
              lastMessageAt: new Date().toISOString()
            });
          }

          io.emit('chat:message', { message: savedMsg, lead });
        }
      } catch (notifyErr) {
        console.error('Error enviando notificación de estado de pedido al cliente:', notifyErr);
      }
    }

    res.json(updated);
  });

  // Edit full order
  router.put('/orders/:id', (req, res) => {
    const updated = db.updateOrder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:update', updated);
    res.json(updated);
  });

  // Duplicate order
  router.post('/orders/:id/duplicate', (req, res) => {
    const cloned = db.duplicateOrder(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:new', cloned);
    res.json(cloned);
  });

  router.delete('/orders/:id', (req, res) => {
    db.deleteOrder(req.params.id);
    io.emit('order:delete', req.params.id);
    res.json({ success: true });
  });

  // --- 5.2 Customer Memory & Dossier System ---
  router.get('/customers', (req, res) => {
    const leads = db.getLeads();
    const customers = leads.map(l => db.getCustomerProfile(l.id));
    res.json(customers);
  });

  router.post('/customers', (req, res) => {
    const newCustomer = db.findOrCreateLead(req.body);
    io.emit('lead:update', newCustomer);
    res.json(newCustomer);
  });

  router.get('/customers/:id', (req, res) => {
    const profile = db.getCustomerProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(profile);
  });

  router.put('/customers/:id', (req, res) => {
    const updated = db.updateCustomerProfile(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cliente no encontrado' });
    io.emit('lead:update', updated);
    res.json(updated);
  });

  router.post('/customers/:id/duplicate', (req, res) => {
    const cloned = db.duplicateCustomer(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Cliente no encontrado' });
    io.emit('lead:update', cloned);
    res.json(cloned);
  });

  router.delete('/customers/:id', (req, res) => {
    db.deleteLead(req.params.id);
    io.emit('lead:delete', { id: req.params.id });
    res.json({ success: true });
  });

  // --- 5.2.1 Branches (Sucursales) Management ---
  router.get('/branches', (req, res) => {
    const branches = db.getBranches();
    const profiles = branches.map(b => db.getBranchProfile(b.id));
    res.json(profiles);
  });

  router.post('/branches', (req, res) => {
    const created = db.createBranch(req.body);
    io.emit('branch:new', created);
    res.json(created);
  });

  router.get('/branches/:id', (req, res) => {
    const branch = db.getBranchProfile(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json(branch);
  });

  router.put('/branches/:id', (req, res) => {
    const updated = db.updateBranch(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Sucursal no encontrada' });
    io.emit('branch:update', updated);
    res.json(updated);
  });

  router.post('/branches/:id/duplicate', (req, res) => {
    const cloned = db.duplicateBranch(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Sucursal no encontrada' });
    io.emit('branch:new', cloned);
    res.json(cloned);
  });

  router.delete('/branches/:id', (req, res) => {
    db.deleteBranch(req.params.id);
    io.emit('branch:delete', { id: req.params.id });
    res.json({ success: true });
  });

  router.post('/branches/:id/test-whatsapp', async (req, res) => {
    const branch = db.getBranch(req.params.id);
    if (!branch || !branch.phone) {
      return res.status(400).json({ error: 'La sucursal no tiene un teléfono válido' });
    }

    try {
      const targetJid = `${branch.phone.replace(/\D/g, '')}@s.whatsapp.net`;
      const testMsg = `🏪 *Prueba de Conexión WAgent - República de la Carne* 🥩\n\n¡Hola ${branch.managerName || 'Encargado'}! Este número está registrado como canal oficial para recepción y confirmación de pedidos de *${branch.name}*.\n\nCuando derivemos un pedido, recibirás el detalle aquí y podrás responder *1 (Aceptar)*, *2 (Listo)*, *3 (Entregado)* o *4 (Rechazar)* directamente por este chat. 🙌`;
      
      await whatsappService.sendMessage(targetJid, testMsg);
      res.json({ success: true, message: 'Mensaje de prueba enviado a la sucursal' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Derivar pedido a sucursal y notificar por WhatsApp
  router.post('/orders/:id/derive', async (req, res) => {
    const { branchId, notes, notifyClient = true } = req.body;
    const result = db.deriveOrderToBranch(req.params.id, branchId, notes);
    if (!result) return res.status(404).json({ error: 'Pedido o sucursal no encontrados' });

    const { order, branch } = result;

    try {
      // Enviar notificación a la sucursal y al cliente
      await whatsappService.sendBranchDerivationNotification(order, branch, notifyClient);
    } catch (err) {
      console.error('Error enviando notificación WhatsApp de derivación:', err);
    }

    io.emit('order:update', order);
    res.json({ success: true, order, branch });
  });

  // --- 5.3 Mercado Pago Integration ---
  router.get('/mercadopago/status', async (req, res) => {
    const creds = mercadoPagoService.getCredentials();
    const test = await mercadoPagoService.testConnection();
    res.json({
      credentials: {
        publicKey: creds.publicKey,
        appId: creds.appId,
        userId: creds.userId,
        testUser: creds.testUser,
        enabled: creds.enabled,
        autoSendLink: creds.autoSendLink
      },
      connection: test
    });
  });

  router.post('/mercadopago/test', async (req, res) => {
    const result = await mercadoPagoService.testConnection();
    res.json(result);
  });

  router.post('/mercadopago/create-link', async (req, res) => {
    try {
      const { orderId, amount, customerName, phone, items, sendWhatsApp, jid } = req.body;
      const order = orderId ? db.getOrder(orderId) : null;
      
      const orderData = order || {
        id: orderId || `ORD-${Date.now()}`,
        totalAmount: amount || 1000,
        customerName: customerName || 'Cliente',
        phone: phone || '',
        items: items || ['Pedido de Carnicería']
      };

      const preference = await mercadoPagoService.createPaymentPreference(orderData);
      
      // Si el pedido existe, guardar el preferenceId, el link de pago y el modo
      if (order) {
        db.updateOrder(order.id, {
          paymentMethod: preference.isSandbox ? 'Mercado Pago (Sandbox)' : 'Mercado Pago',
          paymentPreferenceId: preference.id,
          paymentLink: preference.checkoutUrl,
          paymentMode: preference.mode,
          sandboxPaymentLink: preference.sandboxInitPoint
        });
      }

      // Si se solicitó enviar por WhatsApp
      if (sendWhatsApp) {
        const targetJid = jid || order?.jid || (phone ? `${phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (targetJid && whatsappService.status === 'connected') {
          const modeTag = preference.isSandbox ? '🧪 *[MODO PRUEBAS / SANDBOX]*\n' : '';
          const sandboxNote = preference.isSandbox ? '\n*(Enlace de prueba Sandbox - No debita dinero real)*' : '';
          const paymentMsg = `${modeTag}¡Hola ${orderData.customerName}! 🥩💳 Acá tenés el link de pago ${preference.isSandbox ? 'de prueba ' : ''}de Mercado Pago para tu pedido #${orderData.id} por $${Number(orderData.totalAmount).toLocaleString('es-AR')}:\n\n🔗 ${preference.checkoutUrl}\n\nPodés abonar con Dinero en cuenta, Débito, Crédito o Transferencia.${sandboxNote}\n\nEn cuanto se acredite, ¡comenzamos la preparación de tu pedido!`;
          
          await whatsappService.sendMessage(targetJid, paymentMsg);

          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'agent',
            type: 'text',
            content: paymentMsg,
            timestamp: new Date().toISOString()
          });

          const lead = db.getLead(targetJid);
          if (lead) {
            db.updateLead(lead.id, {
              lastMessage: paymentMsg,
              lastMessageAt: new Date().toISOString()
            });
          }

          io.emit('chat:message', { message: savedMsg, lead });
        }
      }

      res.json({
        success: true,
        ...preference
      });
    } catch (err) {
      console.error('Error generando link de pago de Mercado Pago:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/mercadopago/webhook', async (req, res) => {
    try {
      const { type, action, data } = req.body;
      const topic = type || req.query.topic;
      const paymentId = (data && data.id) || req.query.id;

      if ((topic === 'payment' || action === 'payment.created' || action === 'payment.updated') && paymentId) {
        const payment = await mercadoPagoService.getPayment(paymentId);
        
        if (payment && (payment.status === 'approved' || payment.status === 'accredited')) {
          const orderId = payment.external_reference;
          console.log(`💰 ¡Pago acreditado en Mercado Pago para pedido #${orderId}! Monto: $${payment.transaction_amount}`);
          
          if (orderId) {
            const updatedOrder = db.updateOrderStatus(orderId, 'preparing');
            if (updatedOrder) {
              db.updateOrder(orderId, {
                paymentStatus: 'paid',
                paymentMethod: 'Mercado Pago (Acreditado)',
                paymentId: String(paymentId)
              });
              io.emit('order:update', updatedOrder);

              // Notificar al cliente por WhatsApp que su pago fue recibido con éxito
              const targetJid = updatedOrder.jid || (updatedOrder.phone ? `${updatedOrder.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
              if (targetJid && whatsappService.status === 'connected') {
                const confirmMsg = `¡Pago recibido con éxito! 🎉🥩 Ya registramos tu acreditación de Mercado Pago por $${Number(payment.transaction_amount).toLocaleString('es-AR')} para el pedido #${orderId}. Tus cortes pasan de inmediato a preparación. ¡Muchas gracias! 🙌`;
                
                await whatsappService.sendMessage(targetJid, confirmMsg);

                const savedMsg = db.saveMessage({
                  chatId: targetJid,
                  sender: 'agent',
                  type: 'text',
                  content: confirmMsg,
                  timestamp: new Date().toISOString()
                });

                const lead = db.getLead(targetJid);
                if (lead) {
                  db.updateLead(lead.id, {
                    lastMessage: confirmMsg,
                    lastMessageAt: new Date().toISOString()
                  });
                }

                io.emit('chat:message', { message: savedMsg, lead });
              }
            }
          }
        }
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('Error procesando webhook de Mercado Pago:', err);
      res.sendStatus(500);
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

  // --- 9. Backup & Restore System ---
  // Listar respaldos
  router.get('/backups', (req, res) => {
    try {
      const backups = BackupService.listBackups();
      res.json(backups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crear nuevo respaldo
  router.post('/backups', (req, res) => {
    try {
      const { label = 'manual' } = req.body;
      const backup = BackupService.createBackup(label);
      res.json({ success: true, backup });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Descargar archivo de respaldo
  router.get('/backups/download/:filename', (req, res) => {
    try {
      const filePath = BackupService.getBackupFilePath(req.params.filename);
      res.download(filePath, req.params.filename);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Restaurar respaldo desde JSON
  router.post('/backups/restore', (req, res) => {
    try {
      const { backupData, filename } = req.body;
      let payload = backupData;

      if (!payload && filename) {
        const filePath = BackupService.getBackupFilePath(filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        payload = JSON.parse(fileContent);
      }

      if (!payload) {
        return res.status(400).json({ error: 'No se enviaron datos de respaldo para restaurar.' });
      }

      const result = BackupService.restoreBackup(payload);
      
      // Notificar a clientes conectados para recargar datos
      io.emit('system:restored', result);

      res.json(result);
    } catch (err) {
      console.error('Error restaurando respaldo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Subir y restaurar archivo de respaldo directamente
  router.post('/backups/upload-restore', upload.single('backupFile'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo de respaldo.' });
      }

      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const parsed = JSON.parse(fileContent);
      const result = BackupService.restoreBackup(parsed);

      // Limpiar archivo subido temporal
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      io.emit('system:restored', result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Eliminar respaldo
  router.delete('/backups/:filename', (req, res) => {
    try {
      BackupService.deleteBackup(req.params.filename);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5.4 Delivery Drivers (Repartidores) Endpoints ---
  router.get('/drivers', (req, res) => {
    res.json(db.getDrivers());
  });

  router.post('/drivers', (req, res) => {
    const created = db.createDriver(req.body);
    io.emit('driver:new', created);
    res.json(created);
  });

  router.get('/drivers/:id', (req, res) => {
    const driver = db.getDriver(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
    res.json(driver);
  });

  router.put('/drivers/:id', (req, res) => {
    const updated = db.updateDriver(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Repartidor no encontrado' });
    io.emit('driver:update', updated);
    res.json(updated);
  });

  router.post('/drivers/:id/duplicate', (req, res) => {
    const cloned = db.duplicateDriver(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Repartidor no encontrado' });
    io.emit('driver:new', cloned);
    res.json(cloned);
  });

  router.delete('/drivers/:id', (req, res) => {
    db.deleteDriver(req.params.id);
    io.emit('driver:delete', req.params.id);
    res.json({ success: true });
  });

  router.post('/drivers/:id/test-whatsapp', async (req, res) => {
    try {
      const driver = db.getDriver(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
      if (!driver.phone) return res.status(400).json({ error: 'El repartidor no tiene número de teléfono registrado' });

      const cleanPhone = driver.phone.replace(/\D/g, '');
      const driverJid = `${cleanPhone}@s.whatsapp.net`;
      const testMsg = `🛵🥩 *Prueba de Conexión WAgent - República de la Carne*\n\n¡Hola ${driver.name}! Tu línea de WhatsApp ha sido vinculada como Repartidor Oficial. Recibirás aquí las hojas de ruta y pedidos para entrega a domicilio.`;

      await whatsappService.sendMessage(driverJid, testMsg);
      res.json({ success: true, message: 'Mensaje de prueba enviado con éxito' });
    } catch (err) {
      console.error('Error enviando test a repartidor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/orders/:id/assign-driver', async (req, res) => {
    try {
      const { driverId, notes, notifyClient = true } = req.body;
      const result = db.assignOrderToDriver(req.params.id, driverId, notes);
      if (!result) return res.status(404).json({ error: 'Pedido o Repartidor no encontrado' });

      // Enviar ficha de despacho por WhatsApp al repartidor
      await whatsappService.sendDriverDispatchNotification(result.order, result.driver, notifyClient);

      io.emit('order:update', result.order);
      io.emit('driver:update', result.driver);
      res.json(result);
    } catch (err) {
      console.error('Error asignando pedido a repartidor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5.5 Barcode Scanner Lookup Endpoint ---
  router.get('/products/barcode/:code', (req, res) => {
    const product = db.getProductByBarcode(req.params.code);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado para este código de barras' });
    res.json(product);
  });

  // --- 5.6 User Profiles & Roles (RBAC) Endpoints ---
  router.get('/roles', (req, res) => {
    res.json(db.getRoles());
  });

  router.get('/users', (req, res) => {
    res.json(db.getUsers());
  });

  router.post('/users', (req, res) => {
    const created = db.createUser(req.body);
    io.emit('user:new', created);
    res.json(created);
  });

  router.get('/users/:id', (req, res) => {
    const user = db.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  });

  router.put('/users/:id', (req, res) => {
    const updated = db.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Usuario no encontrado' });
    io.emit('user:update', updated);
    res.json(updated);
  });

  router.post('/users/:id/duplicate', (req, res) => {
    const cloned = db.duplicateUser(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Usuario no encontrado' });
    io.emit('user:new', cloned);
    res.json(cloned);
  });

  router.delete('/users/:id', (req, res) => {
    db.deleteUser(req.params.id);
    io.emit('user:delete', req.params.id);
    res.json({ success: true });
  });

  router.post('/users/login', (req, res) => {
    const { username, pin } = req.body;
    const result = db.authenticateUser(username, pin);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  return router;
}
