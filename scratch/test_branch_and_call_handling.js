import assert from 'assert';
import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

async function testBranchCorroborationAndFlow() {
  console.log('=== TEST: Branch Selection, DB Reflection & Corroboration Flow ===\n');

  const testJid = '5493517778899@s.whatsapp.net';
  const lead = db.saveOrUpdateLead({
    jid: testJid,
    phone: '+54 9 351 777-8899',
    name: 'Don Juan',
    pushName: 'Don Juan'
  });

  // Turn 1: Client orders Combo Asadazo
  db.saveMessage({
    chatId: testJid,
    sender: 'user',
    type: 'text',
    content: 'quiero un combo asadazo',
    timestamp: new Date(Date.now() - 40000).toISOString()
  });

  const reply1 = AIService.generateDynamicReply('quiero un combo asadazo', lead, [], db.getSettings());
  console.log('Reply 1 (Combo Asadazo):', reply1.slice(0, 150));

  // Turn 2: Client adds 2kg chorizo
  db.saveMessage({
    chatId: testJid,
    sender: 'user',
    type: 'text',
    content: 'sumame 2 kilos de chorizo de cerdo',
    timestamp: new Date(Date.now() - 30000).toISOString()
  });
  const reply2 = AIService.generateDynamicReply('sumame 2 kilos de chorizo de cerdo', lead, [], db.getSettings());
  console.log('\nReply 2 (Sumar Chorizo):', reply2.slice(0, 150));

  // Turn 3: Client specifies pickup at Roque Funes branch
  db.saveMessage({
    chatId: testJid,
    sender: 'user',
    type: 'text',
    content: 'ok, eso lo retiro por sucursal roque funes',
    timestamp: new Date(Date.now() - 20000).toISOString()
  });
  const reply3 = AIService.generateDynamicReply('ok, eso lo retiro por sucursal roque funes', lead, [], db.getSettings());
  console.log('\nReply 3 (Branch Selection & Corroboration Ficha):\n', reply3);

  // Assertions for Turn 3
  assert(reply3.includes('FICHA DE RETIRO Y ASIGNACIÓN DE SUCURSAL'), 'Debe incluir la ficha de corroboración');
  assert(reply3.includes('Urca Central (Av. José Roque Funes 1115)'), 'Debe incluir la sucursal correcta');
  assert(reply3.includes('Av. José Roque Funes 1115, Barrio Urca, Córdoba'), 'Debe incluir la dirección');
  assert(reply3.includes('$49.999'), 'Debe reflejar el total acumulado de $49.999');

  // Verify Database Reflection
  const updatedLead = db.getLead(testJid);
  console.log('\nUpdated Lead in DB:', {
    name: updatedLead.name,
    preferredBranch: updatedLead.preferredBranch,
    deliveryType: updatedLead.deliveryType,
    address: updatedLead.address
  });
  assert.strictEqual(updatedLead.preferredBranch, 'Urca Central (Av. José Roque Funes 1115)', 'Lead debe tener sucursal guardada');
  assert.strictEqual(updatedLead.deliveryType, 'pickup', 'Lead debe ser tipo pickup');

  const activeOrder = db.getLatestOrderByJid(testJid);
  console.log('\nActive Order in DB:', {
    id: activeOrder?.id,
    branch: activeOrder?.branch,
    deliveryType: activeOrder?.deliveryType,
    totalAmount: activeOrder?.totalAmount,
    status: activeOrder?.status
  });
  assert(activeOrder, 'Debe existir la orden en la BD');
  assert.strictEqual(activeOrder.branch, 'Urca Central (Av. José Roque Funes 1115)', 'Orden debe tener la sucursal');
  assert.strictEqual(activeOrder.deliveryType, 'pickup', 'Orden debe ser pickup');
  assert.strictEqual(activeOrder.totalAmount, 49999, 'Total de la orden debe ser 49999');

  // Turn 4: Client corroborates & chooses payment method
  db.saveMessage({
    chatId: testJid,
    sender: 'user',
    type: 'text',
    content: 'abono al retirar',
    timestamp: new Date().toISOString()
  });
  const reply4 = AIService.generateDynamicReply('abono al retirar', lead, [], db.getSettings());
  console.log('\nReply 4 (Payment Confirmation & Pickup Finalization):\n', reply4);

  assert(reply4.includes('Urca Central (Av. José Roque Funes 1115)'), 'Debe confirmar el retiro en la sucursal');
  assert(reply4.includes('Efectivo / Débito al retirar'), 'Debe registrar el medio de pago');

  const finalOrder = db.getLatestOrderByJid(testJid);
  assert.strictEqual(finalOrder.status, 'preparing', 'El pedido debe quedar en estado preparing');
  assert.strictEqual(finalOrder.paymentMethod, 'Efectivo / Débito al retirar', 'Medio de pago debe ser Efectivo/Débito al retirar');

  console.log('\n✅ TODAS LAS PRUEBAS DE ASIGNACIÓN DE SUCURSAL, CORROBORACIÓN Y REFLEJO EN BASE DE DATOS PASARON AL 100%!');
}

testBranchCorroborationAndFlow().catch(err => {
  console.error('Error en pruebas:', err);
  process.exit(1);
});
