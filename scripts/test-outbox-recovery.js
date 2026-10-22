import { WhatsAppService } from '../server/services/whatsapp.js';
import { db } from '../server/services/database.js';

async function testOutboxAndRecovery() {
  console.log('🧪 Iniciando prueba de Outbox, Debounce y Auto-Recuperación de WhatsApp...');

  let emittedEvents = [];
  const mockIo = {
    emit: (event, payload) => {
      emittedEvents.push({ event, payload });
    }
  };

  const service = new WhatsAppService(mockIo, 'test-session');
  // Detener watchdog para pruebas
  service.stopWatchdog();

  // Test 1: Verificar inicialización de estructuras
  if (!Array.isArray(service.outboxQueue) || service.outboxQueue.length !== 0) {
    throw new Error('Test 1 falló: outboxQueue no se inicializó correctamente');
  }
  if (!(service.activeReplyDebounce instanceof Map)) {
    throw new Error('Test 1 falló: activeReplyDebounce no es un Map');
  }
  console.log('✅ Test 1: Estructuras de Outbox y Debounce inicializadas');

  // Test 2: waitForConnection en estado desconectado con timeout corto (300ms)
  const waitResult = await service.waitForConnection(300);
  if (waitResult !== false) {
    throw new Error('Test 2 falló: waitForConnection debió retornar false con socket desconectado');
  }
  console.log('✅ Test 2: waitForConnection timeout controlado exitoso');

  // Test 3: sendTextMessage en estado offline debe encolar en outboxQueue
  const queuedRes = await service.sendTextMessage('5493512345678', 'Hola mensaje de prueba encolado', { allowQueue: true, chatId: '5493512345678' });
  if (queuedRes?.status !== 'pending' || !queuedRes?.isQueued) {
    throw new Error('Test 3 falló: sendTextMessage no retornó status pending');
  }
  if (service.outboxQueue.length !== 1) {
    throw new Error('Test 3 falló: outboxQueue debe tener 1 mensaje');
  }
  console.log('✅ Test 3: Mensaje encolado en Outbox con estado pending exitosamente');

  // Test 4: Debounce de mensajes entrantes rápidos
  let repliesProcessed = 0;
  service.executeAutoReply = async (jid, entry) => {
    repliesProcessed++;
    console.log(`[Mock Reply] JID: ${jid}, Mensajes consolidados: ${entry.texts.length}`);
  };

  service.scheduleDebouncedReply('5493519999999@s.whatsapp.net', { incomingText: 'Hola' });
  service.scheduleDebouncedReply('5493519999999@s.whatsapp.net', { incomingText: 'Quiero 2kg de asado' });
  service.scheduleDebouncedReply('5493519999999@s.whatsapp.net', { incomingText: 'Y 1 bolsa de carbón' });

  const debouncedEntry = service.activeReplyDebounce.get('5493519999999@s.whatsapp.net');
  if (!debouncedEntry || debouncedEntry.texts.length !== 3) {
    throw new Error('Test 4 falló: el debounce debió acumular 3 mensajes en un solo lote');
  }
  console.log('✅ Test 4: Debounce agrupó múltiples mensajes sucesivos en un solo lote');

  // Limpiar timer de debounce para evitar que quede corriendo
  clearTimeout(debouncedEntry.timer);
  service.activeReplyDebounce.clear();

  // Test 5: Simular drenado de Outbox al reconectar
  let sentOutboxCount = 0;
  service.status = 'connected';
  service.sock = {
    ws: { isOpen: true, socket: { readyState: 1 } },
    sendPresenceUpdate: async () => {},
    sendMessage: async (target, content) => {
      sentOutboxCount++;
      return { key: { id: `baileys_id_${Date.now()}` } };
    }
  };

  await service.drainOutboxQueue();
  if (service.outboxQueue.length !== 0 || sentOutboxCount !== 1) {
    throw new Error(`Test 5 falló: Outbox debió vaciarse (quedan: ${service.outboxQueue.length}, enviados: ${sentOutboxCount})`);
  }
  console.log('✅ Test 5: drainOutboxQueue entregó con éxito el mensaje acumulado');

  console.log('\n🎉 ¡Todos los tests de Outbox, Debounce y Reconexión pasaron al 100%!');
  process.exit(0);
}

testOutboxAndRecovery().catch(err => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
