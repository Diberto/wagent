import assert from 'assert';
import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

async function runTests() {
  console.log('=== TEST: Comprehensive Customer Dialog Scenarios ===\n');

  const lead = {
    id: 'lead-test-dialog-full',
    jid: '5493516262475@s.whatsapp.net',
    name: 'Don Juan',
    pushName: 'Don Juan',
    phone: '+54 9 351 626-2475',
    isRegistered: true
  };
  db.saveOrUpdateLead(lead);
  db.clearMessagesForChat(lead.jid);

  const settings = db.getSettings();
  const knowledgeBase = db.getKnowledgeBase();

  // Test 1: Molida Especial (NO debe vender Intermedia)
  console.log('--- 1. Testing "quiero 2 kilos de carne molida especial" ---');
  const reply1 = AIService.generateDynamicReply('quiero 2 kilos de carne molida especial', lead, knowledgeBase, settings);
  console.log('Reply 1:\n', reply1);
  assert(reply1.includes('Carne Molida Especial Seleccionada (Magra)'), 'Debe incluir Carne Molida Especial');
  assert(reply1.includes('$23.600'), '2 kg x $11.800 debe ser $23.600');
  assert(!reply1.includes('Intermedia'), 'NO debe incluir Intermedia cuando se pide Especial');

  // Test 2: "pero qiero molida especial"
  console.log('\n--- 2. Testing "pero qiero molida especial" ---');
  const reply2 = AIService.generateDynamicReply('pero qiero molida especial', lead, knowledgeBase, settings);
  console.log('Reply 2:\n', reply2);
  assert(reply2.includes('Carne Molida Especial Seleccionada (Magra)'), 'Debe incluir Carne Molida Especial');

  // Test 3: "que beneficios tienen?"
  console.log('\n--- 3. Testing "que beneficios tienen?" ---');
  const reply3 = AIService.generateDynamicReply('que beneficios tienen?', lead, knowledgeBase, settings);
  console.log('Reply 3:\n', reply3);
  assert(reply3.includes('beneficios únicos') || reply3.includes('Calidad & Terneza Premium'), 'Debe listar los beneficios');
  assert(reply3.includes('6 Sucursales'), 'Debe mencionar las 6 sucursales');

  // Test 4: "abono al retirar"
  console.log('\n--- 4. Testing "abono al retirar" ---');
  const reply4 = AIService.generateDynamicReply('abono al retirar', lead, knowledgeBase, settings);
  console.log('Reply 4:\n', reply4);
  assert(reply4.includes('Ya quedó asentado tu medio de pago'), 'Debe confirmar el medio de pago');
  assert(reply4.includes('retirar'), 'Debe indicar retiro en sucursal');

  // Test 5: Producto no disponible (fuera de catálogo: pescado/sushi)
  console.log('\n--- 5. Testing producto no disponible ("tenes salmon?") ---');
  const reply5 = AIService.generateDynamicReply('tenes salmon para hacer a la parrilla?', lead, knowledgeBase, settings);
  console.log('Reply 5:\n', reply5);
  assert(reply5.includes('nos especializamos exclusivamente en cortes vacunos') || reply5.includes('No contamos con ese producto'), 'Debe indicar que no se trabaja pescado');

  // Test 6: Inferencia de cantidad ("2 kilos") a partir del corte previo en historial
  console.log('\n--- 6. Testing inferencia de cantidad "2 kilos" con corte previo ---');
  const lead6 = { id: 'lead-test-6', jid: '5493510006666@s.whatsapp.net', name: 'Don Juan', phone: '+54 9 351 000-6666' };
  db.saveOrUpdateLead(lead6);
  db.clearMessagesForChat(lead6.jid);
  db.saveMessage({
    id: `msg-${Date.now()}-1`,
    chatId: lead6.jid,
    sender: 'assistant',
    content: '¡Sí, Don Juan! Tenemos Chorizo Criollo Puro Cerdo fresca a $5.000 por kg. ¿Cuántos kg te gustaría que te separemos?'
  });
  const reply6 = AIService.generateDynamicReply('2 kilos', lead6, knowledgeBase, settings);
  console.log('Reply 6:\n', reply6);
  assert(reply6.includes('Chorizo Criollo Puro Cerdo'), 'Debe asociar los 2 kilos con Chorizo Criollo');
  assert(reply6.includes('$10.000'), '2 kg de chorizo deben ser $10.000');

  // Test 7: Simulación de flujo completo interactivo
  console.log('\n--- 7. Testing Full Dialog Pipeline ---');
  const lead7 = { id: 'lead-test-7', jid: '5493510007777@s.whatsapp.net', name: 'Don Juan', phone: '+54 9 351 000-7777' };
  db.saveOrUpdateLead(lead7);
  db.clearMessagesForChat(lead7.jid);

  // Turn 1: User adds 1 combo
  db.saveMessage({ chatId: lead7.jid, sender: 'user', content: 'quiero un combo asadazo' });
  const rep7a = AIService.generateDynamicReply('quiero un combo asadazo', lead7, knowledgeBase, settings);
  db.saveMessage({ chatId: lead7.jid, sender: 'assistant', content: rep7a });
  console.log('Turn 1 (Combo Asadazo):\n', rep7a);
  assert(rep7a.includes('Combo “Asadazo”'), 'Debe contener combo asadazo');
  assert(rep7a.includes('$39.999'), 'Total de 1 combo debe ser $39.999');

  // Turn 2: User adds 2 kg chorizo
  db.saveMessage({ chatId: lead7.jid, sender: 'user', content: 'mas los dos kilos de chorizo de cerdo' });
  const rep7b = AIService.generateDynamicReply('mas los dos kilos de chorizo de cerdo', lead7, knowledgeBase, settings);
  db.saveMessage({ chatId: lead7.jid, sender: 'assistant', content: rep7b });
  console.log('Turn 2 (Sumar Chorizo):\n', rep7b);
  assert(rep7b.includes('Chorizo Criollo Puro Cerdo'), 'Debe contener chorizo criollo');
  assert(rep7b.includes('$49.999'), 'Total de combo ($39.999) + 2kg chorizo ($10.000) debe ser $49.999');

  // Turn 3: User confirms selection
  db.saveMessage({ chatId: lead7.jid, sender: 'user', content: 'ok, solo eso, confirmame el pedido' });
  const rep7c = AIService.generateDynamicReply('ok, solo eso, confirmame el pedido', lead7, knowledgeBase, settings);
  db.saveMessage({ chatId: lead7.jid, sender: 'assistant', content: rep7c });
  console.log('Turn 3 (Confirmar):\n', rep7c);
  assert(rep7c.includes('$49.999'), 'Total confirmado debe ser $49.999');
  assert(rep7c.includes('sucursales') || rep7c.includes('domicilio'), 'Debe preguntar método de entrega');

  // Turn 4: User chooses branch
  db.saveMessage({ chatId: lead7.jid, sender: 'user', content: 'ok, eso lo retiro por sucursal roque funes' });
  const rep7d = AIService.generateDynamicReply('ok, eso lo retiro por sucursal roque funes', lead7, knowledgeBase, settings);
  db.saveMessage({ chatId: lead7.jid, sender: 'assistant', content: rep7d });
  console.log('Turn 4 (Sucursal):\n', rep7d);
  assert(rep7d.includes('Urca Central (Av. José Roque Funes 1115)'), 'Debe fijar sucursal Roque Funes');

  // Turn 5: User chooses payment
  db.saveMessage({ chatId: lead7.jid, sender: 'user', content: 'abono al retirar' });
  const rep7e = AIService.generateDynamicReply('abono al retirar', lead7, knowledgeBase, settings);
  console.log('Turn 5 (Pago):\n', rep7e);
  assert(rep7e.includes('Ya quedó asentado tu medio de pago: **Efectivo / Débito al retirar**'), 'Debe confirmar el pago');

  console.log('\n✅ TODOS LOS ESCENARIOS DEL DIÁLOGO PASARON AL 100%!');
}

runTests().catch(err => {
  console.error('Error en tests:', err);
  process.exit(1);
});
