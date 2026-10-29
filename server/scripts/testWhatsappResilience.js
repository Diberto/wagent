import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { WhatsAppService } from '../services/whatsapp.js';
import { db } from '../services/database.js';
import { CONFIG } from '../config/index.js';

async function runResilienceTests() {
  console.log('🧪 Iniciando pruebas de resiliencia y recuperación ante micro-cortes de WhatsApp...\n');

  const testSessionId = 'unit_resilience_check';
  const randSuffix = String(Date.now()).slice(-6);
  const testPhone = `5493518${randSuffix}`;
  const testJid = `${testPhone}@s.whatsapp.net`;
  const outboxPath = path.join(CONFIG.DATA_DIR, `whatsapp_outbox_${testSessionId}.json`);
  if (fs.existsSync(outboxPath)) fs.unlinkSync(outboxPath);
  const service = new WhatsAppService(null, testSessionId);
  service.stopWatchdog();

  try {
    // 1. Prueba de db.getMessageById, caché Signal retry y protección anti-falso positivo de repartidor (+549351)
    console.log('1️⃣ Verificando db.getMessageById(), caché Signal retry y protección de JIDs Córdoba (+549351)...');
    assert.strictEqual(db.getDriverByPhone(testJid), null, 'Un cliente de Córdoba (+549351...) NO debe coincidir con repartidores externos incompletos (+549351)');
    assert.strictEqual(db.getBranchByPhone(testJid), null, 'Un cliente nuevo NO debe coincidir por prefijo parcial con sucursales');
    const testMsgId = `BAE5_TEST_RETRY_${Date.now()}`;
    db.saveMessage({
      id: testMsgId,
      chatId: testJid,
      sender: 'agent',
      type: 'text',
      content: 'Cotización lista: 2 kg de vacío a $29.998',
      status: 'sent'
    });
    const lookedUp = db.getMessageById(testMsgId);
    assert(lookedUp && lookedUp.content.includes('$29.998'), 'db.getMessageById debe recuperar el mensaje exacto por ID');
    service.cacheSentProto({ key: { id: testMsgId }, message: { conversation: lookedUp.content } });
    assert(service.sentProtoCache.get(testMsgId)?.conversation === lookedUp.content, 'sentProtoCache debe conservar el proto para getMessage');
    console.log('   ✅ OK: db.getMessageById y sentProtoCache operativos.\n');

    // 2. Prueba de micro-corte en pleno envío (Timed Out / Stream Errored) con JID argentino 549...
    console.log('2️⃣ Verificando preservación en Outbox ante "Timed Out" / "Stream Errored" sin corromper JID 549...');
    let sendCalls = [];
    service.status = 'connected';
    service.sock = {
      ws: { isOpen: true, socket: { readyState: 1 } },
      onWhatsApp: async (with9) => [{ exists: true, jid: `${with9}@s.whatsapp.net` }],
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, payload) => {
        sendCalls.push({ jid, payload });
        const boomLike = new Error('Timed Out');
        boomLike.output = { statusCode: 408 };
        throw boomLike;
      }
    };

    const queuedRes = await service.sendTextMessage(testJid, '¡Perfecto! Tu pedido quedó confirmado.', {
      allowQueue: true,
      isAiReply: true,
      chatId: testJid
    });
    assert(queuedRes?.isQueued === true, 'sendTextMessage debe encolar en Outbox ante Timed Out (408)');
    assert.strictEqual(sendCalls.length, 1, 'No debe reintentar mutando a 54351... cuando el fallo es de transporte (408)');
    assert.strictEqual(service.outboxQueue.length, 1, 'El mensaje debe quedar en outboxQueue');
    assert.strictEqual(service.outboxQueue[0].jid, testJid, 'El JID encolado debe preservar el 549 original intacto');

    // Guardar burbuja pendiente como hace executeAutoReply
    db.saveMessage({
      id: queuedRes.key.id,
      chatId: testJid,
      sender: 'agent',
      type: 'text',
      content: '¡Perfecto! Tu pedido quedó confirmado.',
      status: 'pending'
    });

    // Ahora simular reconexión exitosa y vaciado de Outbox
    const realWaId = `BAE5_DELIVERED_${Date.now()}`;
    service.sock.sendMessage = async (jid, payload) => ({
      key: { id: realWaId, remoteJid: jid, fromMe: true },
      message: { conversation: payload.text }
    });

    await service.drainOutboxQueue();
    assert.strictEqual(service.outboxQueue.length, 0, 'outboxQueue debe quedar vacía tras reconexión');

    const chatMsgsAfterDrain = db.getMessages(testJid, 20).filter(m => m.content === '¡Perfecto! Tu pedido quedó confirmado.');
    assert.strictEqual(chatMsgsAfterDrain.length, 1, 'No debe duplicar la burbuja en el CRM al promover de Outbox a enviado');
    assert.strictEqual(chatMsgsAfterDrain[0].id, realWaId, 'El registro debe actualizarse in-place con el ID real de WhatsApp');
    assert.strictEqual(chatMsgsAfterDrain[0].status, 'sent', 'El estado debe actualizarse a sent');
    console.log('   ✅ OK: Outbox captura Timed Out, preserva 549 y promueve mensaje sin duplicados.\n');

    // 3. Prueba de recoverUnansweredMessages: ráfaga de 2 mensajes con <8s de antigüedad tras saludo previo del bot
    console.log('3️⃣ Verificando recoverUnansweredMessages() en hueco <8s y ráfaga múltiple de cliente...');
    {
      const snap = db.readDb();
      snap.messages = (snap.messages || []).filter(m => m.chatId !== testJid);
      db.writeDb(snap);
    }
    db.findOrCreateLead({
      jid: testJid,
      phone: testPhone,
      pushName: 'Cliente Test Resiliencia',
      aiEnabled: true
    });

    const baseNow = Date.now();
    // Saludo del bot hace 6.2s, y el cliente responde 1s después (hace 5.2s y 4.5s -> antes fallaba por agentTime >= msgTime - 2000 Y por msgAge <= 8000!)
    db.saveMessage({
      id: `BOT_GREET_${baseNow}`,
      chatId: testJid,
      sender: 'agent',
      type: 'text',
      content: '¡Hola! ¿Qué cortes te preparamos hoy?',
      timestamp: new Date(baseNow - 6200).toISOString(),
      status: 'sent'
    });
    db.saveMessage({
      id: `USR_BURST_1_${baseNow}`,
      chatId: testJid,
      sender: 'user',
      type: 'text',
      content: 'Quiero 2 kg de costilla y 1 kg de chorizo',
      timestamp: new Date(baseNow - 5200).toISOString(),
      status: 'received'
    });
    db.saveMessage({
      id: `USR_BURST_2_${baseNow}`,
      chatId: testJid,
      sender: 'user',
      type: 'text',
      content: 'Para enviar a Roque Funes 1704, abono en efectivo',
      timestamp: new Date(baseNow - 4500).toISOString(),
      status: 'received'
    });

    let recoveredPayloads = [];
    service.scheduleDebouncedReply = (jid, payload) => {
      recoveredPayloads.push({ jid, payload });
    };

    await service.recoverUnansweredMessages();
    const myRecovery = recoveredPayloads.find(r => r.jid === testJid);
    assert(myRecovery, 'recoverUnansweredMessages debe detectar mensajes de 4.5s de antigüedad sin responder');
    assert(
      myRecovery.payload.incomingText.includes('2 kg de costilla') &&
      myRecovery.payload.incomingText.includes('Roque Funes 1704'),
      `Debe consolidar TODOS los mensajes consecutivos sin responder, recibido: "${myRecovery.payload.incomingText}"`
    );
    console.log('   ✅ OK: Ráfaga completa recuperada sin hueco muerto de <8s.\n');

    // 4. Prueba de mensajes offline ('append' reciente vs 'append' antiguo + deduplicación de IDs)
    console.log('4️⃣ Verificando ingesta de mensajes offline (type="append") y deduplicación...');
    const offlineFreshId = `OFFLINE_FRESH_${Date.now()}`;
    const offlineOldId = `OFFLINE_OLD_${Date.now()}`;
    recoveredPayloads = [];

    // Mensaje offline reciente (hace 2 segundos durante el micro-corte)
    await service.handleIncomingMessage({
      key: { id: offlineFreshId, remoteJid: testJid, fromMe: false },
      message: { conversation: '¿Tienen matambre tiernizado?' },
      messageTimestamp: Math.floor((Date.now() - 2000) / 1000),
      pushName: 'Cliente Test Resiliencia'
    }, { upsertType: 'append' });

    assert.strictEqual(recoveredPayloads.length, 1, 'Mensaje offline reciente (<15 min) debe disparar respuesta automática');

    // Si llega el mismo ID otra vez por messaging-history.set o messages.update, NO debe duplicar respuesta
    await service.handleIncomingMessage({
      key: { id: offlineFreshId, remoteJid: testJid, fromMe: false },
      message: { conversation: '¿Tienen matambre tiernizado?' },
      messageTimestamp: Math.floor((Date.now() - 2000) / 1000),
      pushName: 'Cliente Test Resiliencia'
    }, { upsertType: 'append' });

    assert.strictEqual(recoveredPayloads.length, 1, 'ID duplicado no debe disparar doble respuesta de IA');

    // Mensaje histórico viejo (hace 2 horas) sincronizado con 'append' NO debe disparar respuesta automática
    await service.handleIncomingMessage({
      key: { id: offlineOldId, remoteJid: testJid, fromMe: false },
      message: { conversation: 'Mensaje viejo de hace dos horas' },
      messageTimestamp: Math.floor((Date.now() - 2 * 3600 * 1000) / 1000),
      pushName: 'Cliente Test Resiliencia'
    }, { upsertType: 'append' });

    assert.strictEqual(recoveredPayloads.length, 1, 'Mensaje histórico antiguo (>15 min) no debe disparar respuesta tardía');
    console.log('   ✅ OK: Mensajes offline recientes respondidos, antiguos filtrados y duplicados bloqueados.\n');

    // 5. Prueba de paralelismo entre chats (enqueueChatTask)
    console.log('5️⃣ Verificando aislamiento asíncrono entre chats (grupo lento no bloquea a cliente)...');
    const order = [];
    const slowGroup = service.enqueueChatTask('120363000000@g.us', async () => {
      await new Promise(r => setTimeout(r, 250));
      order.push('slow_group');
    });
    const fastClient = service.enqueueChatTask(testJid, async () => {
      await new Promise(r => setTimeout(r, 15));
      order.push('fast_client');
    });
    await Promise.all([slowGroup, fastClient]);
    assert.strictEqual(order[0], 'fast_client', 'El chat del cliente debe procesarse inmediatamente sin esperar al OCR del grupo');
    console.log('   ✅ OK: Procesamiento en paralelo por chat verificado.\n');

    // 6. Prueba de guardia anti-zombie (sin watchdog prematuro en constructor) y deduplicación de emitStatus
    console.log('6️⃣ Verificando guardia anti-zombie en constructor y deduplicación de eventos Socket.IO...');
    let emittedStatusEvents = 0;
    const mockIo = {
      emit: (evt) => {
        if (evt === 'whatsapp:status') emittedStatusEvents++;
      }
    };
    const passiveInstance = new WhatsAppService(mockIo, `${testSessionId}_passive`);
    assert.strictEqual(passiveInstance.watchdogTimer, null, 'El constructor NUNCA debe arrancar watchdogTimer antes de initialize() / server.listen()');
    passiveInstance.status = 'connecting';
    passiveInstance.emitStatus();
    passiveInstance.emitStatus();
    passiveInstance.emitStatus();
    assert.strictEqual(emittedStatusEvents, 1, 'emitStatus() debe deduplicar estados consecutivos idénticos');
    passiveInstance.status = 'connected';
    passiveInstance.emitStatus();
    assert.strictEqual(emittedStatusEvents, 2, 'emitStatus() debe emitir cuando cambia el estado real');
    passiveInstance.shutdown();
    console.log('   ✅ OK: Guardia anti-zombie y deduplicación de Socket.IO verificadas.\n');

    console.log('🎉 TODAS LAS PRUEBAS DE RESILIENCIA DE WHATSAPP PASARON EXITOSAMENTE (6/6).');
  } finally {
    // Limpiar datos sintéticos creados durante el test
    service.stopWatchdog();
    try {
      const rawDb = db.readDb();
      rawDb.leads = (rawDb.leads || []).filter(l => l.jid !== testJid && l.phone !== testPhone && !String(l.jid || '').startsWith('5493518'));
      rawDb.messages = (rawDb.messages || []).filter(m =>
        m.chatId !== testJid &&
        m.chatId !== '5493519998877@s.whatsapp.net' &&
        !String(m.chatId || '').startsWith('5493518') &&
        !String(m.id || '').startsWith('BAE5_TEST_RETRY_') &&
        !String(m.id || '').startsWith('BAE5_DELIVERED_')
      );
      db.writeDb(rawDb);
      if (typeof db.flushSync === 'function') db.flushSync();
      await new Promise(r => setTimeout(r, 80));
      if (fs.existsSync(outboxPath)) fs.unlinkSync(outboxPath);
      const unitAuthDir = path.join(CONFIG.DATA_DIR, `auth_info_baileys_${testSessionId}`);
      if (fs.existsSync(unitAuthDir)) fs.rmSync(unitAuthDir, { recursive: true, force: true });
    } catch (_) {}
  }

  process.exit(0);
}

runResilienceTests().catch(err => {
  console.error('❌ Falló test de resiliencia de WhatsApp:', err);
  process.exit(1);
});
