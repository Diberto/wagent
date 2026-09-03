import { AIService } from '../services/ai.js';
import { db } from '../services/database.js';
import { OrderSyncEngine } from '../services/orderSyncEngine.js';

async function runEndToEndSimulation() {
  console.log('🚀 Iniciando simulación End-to-End de pedido por WhatsApp...');

  const clientPhone = '+54 9 351 626-2475';
  const clientJid = '5493516262475@s.whatsapp.net';
  const clientName = 'Don Juan';

  // 1. Limpiar pedidos pendientes previos de Don Juan para comenzar limpios
  const existingOrders = db.getOrdersByJid(clientJid);
  for (const o of existingOrders) {
    if (['pending', 'draft'].includes(o.status)) {
      db.deleteOrder(o.id);
    }
  }

  // 2. Turno 1: Saludo inicial pidiendo asado para 4 personas
  console.log('\n--- Turno 1: Cliente consulta por asado para 4 personas ---');
  let history = [
    { sender: 'user', content: 'Hola, buenas tardes. Queremos hacer un asado para 4 personas, ¿qué nos recomendás?' }
  ];

  let lead = db.getLead(clientJid) || { id: clientJid, jid: clientJid, name: clientName, phone: clientPhone };

  let reply1 = await AIService.generateSalesResponse({
    rawText: history[0].content,
    lead,
    history: [],
    settings: db.getSettings()
  });

  console.log('Bot respuesta 1:\n', reply1.slice(0, 300) + '...\n');
  history.push({ sender: 'bot', content: reply1 });

  // 3. Turno 2: Cliente elige opción 1 y suma carbón
  console.log('\n--- Turno 2: Cliente elige opción 1 pero agrega 1 carbón ---');
  const userMsg2 = 'quiero la opcion 1 pero agrega 1 carbon';
  history.push({ sender: 'user', content: userMsg2 });

  let reply2 = await AIService.generateSalesResponse({
    rawText: userMsg2,
    lead,
    history: history.slice(0, -1),
    settings: db.getSettings()
  });

  console.log('Bot respuesta 2:\n', reply2);
  history.push({ sender: 'bot', content: reply2 });

  // Sincronizar pedido con OrderSyncEngine
  const syncResult = await OrderSyncEngine.syncOrderFromTurn({
    jid: clientJid,
    customerText: userMsg2,
    aiReplyText: reply2,
    lead,
    stage: 'proposal'
  });

  console.log('\nResultado de sincronización Turno 2:');
  console.log('Order ID:', syncResult?.id);
  console.log('Items en Orden:', syncResult?.items);
  console.log('Total en Orden: $', syncResult?.totalAmount);

  // Verificaciones críticas
  const activeOrder = db.getOrder(syncResult?.id);
  if (!activeOrder) {
    throw new Error('❌ La orden no fue creada en la base de datos.');
  }

  const itemsStr = JSON.stringify(activeOrder.items).toLowerCase();
  if (itemsStr.includes('grasa') || itemsStr.includes('sesos') || itemsStr.includes('fynbo')) {
    throw new Error('❌ FALLO: La orden contiene productos residuales viejos (grasa, sesos o fynbo).');
  }

  if (!itemsStr.includes('vacio') && !itemsStr.includes('costilla') && !itemsStr.includes('tapa')) {
    throw new Error('❌ FALLO: La orden no contiene cortes de carne válidos de la opción 1.');
  }

  if (!itemsStr.includes('carbon')) {
    throw new Error('❌ FALLO: La orden no incluyó el carbón solicitado.');
  }

  console.log('✅ ÉXITO: Los ítems y productos corresponden exactamente a lo solicitado.');

  // 4. Turno 3: Cliente pasa dirección y medio de pago
  console.log('\n--- Turno 3: Cliente proporciona dirección y método de pago ---');
  const userMsg3 = 'a mi casa roque funes 1704 abono en efectivo';
  history.push({ sender: 'user', content: userMsg3 });

  let reply3 = await AIService.generateSalesResponse({
    rawText: userMsg3,
    lead,
    history: history.slice(0, -1),
    settings: db.getSettings()
  });

  console.log('Bot respuesta 3:\n', reply3);

  const syncResult3 = await OrderSyncEngine.syncOrderFromTurn({
    jid: clientJid,
    customerText: userMsg3,
    aiReplyText: reply3,
    lead,
    stage: 'closed_won'
  });

  const finalOrder = db.getOrder(activeOrder.id);
  console.log('\nOrden final confirmada:');
  console.log('ID:', finalOrder.id);
  console.log('Dirección:', finalOrder.address);
  console.log('Método de Pago:', finalOrder.paymentMethod);
  console.log('Items:', finalOrder.items);
  console.log('Total: $', finalOrder.totalAmount);
  console.log('Estado:', finalOrder.status);

  if (!finalOrder.address || !/funes|1704/i.test(finalOrder.address)) {
    throw new Error(`❌ FALLO: La dirección no fue guardada correctamente (obtenido: "${finalOrder.address}").`);
  }

  const finalItemsStr = JSON.stringify(finalOrder.items).toLowerCase();
  if (finalItemsStr.includes('grasa') || finalItemsStr.includes('sesos') || finalItemsStr.includes('fynbo')) {
    throw new Error('❌ FALLO: La orden final se contaminó con productos residuales.');
  }

  if (finalOrder.totalAmount !== 40589) {
    throw new Error(`❌ FALLO: El monto total no coincide con los cortes reales del catálogo ($40.589 vs $${finalOrder.totalAmount}).`);
  }

  console.log('\n🎉 ¡Simulación End-to-End completada con éxito!');
  process.exit(0);
}

runEndToEndSimulation().catch(err => {
  console.error('❌ Error en simulación:', err);
  process.exit(1);
});
