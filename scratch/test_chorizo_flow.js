import assert from 'assert';
import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

async function testChorizoFlow() {
  console.log('=== TEST: Flujo de Conversación y Corrección de Chorizo de Cerdo ===');

  const testJid = '5493519998888@s.whatsapp.net';
  const lead = {
    id: testJid,
    jid: testJid,
    name: 'Don Juan',
    phone: '+54 9 351 999-8888',
    isRegistered: true,
    address: 'Locelso 7100'
  };

  // 1. Mensaje 1: "no, solo eso"
  console.log('\n--- Paso 1: "no, solo eso" ---');
  const history1 = [
    { sender: 'user', content: 'hola' },
    { sender: 'assistant', content: '¡Buenas Don Juan! ¿Qué cortes buscas?' },
    { sender: 'user', content: 'quiero un combo asadazo' },
    { sender: 'assistant', content: '¡De diez Don Juan! Te separo 1x Combo Asadazo ($39.999). ¿Sumas algo más?' }
  ];
  const reply1 = AIService.generateDynamicReply('no, solo eso', lead, [], {});
  console.log('Respuesta 1:\n', reply1);
  assert(reply1.includes('39.999'), 'Debe contener $39.999');
  assert(reply1.includes('Combo “Asadazo”'), 'Debe contener Combo Asadazo');

  // 2. Mensaje 2: "domicilio, locelso 7100"
  console.log('\n--- Paso 2: "domicilio, locelso 7100" ---');
  const reply2 = AIService.generateDynamicReply('domicilio, locelso 7100', lead, [], {});
  console.log('Respuesta 2:\n', reply2);
  assert(reply2.includes('FICHA DE REGISTRO') || reply2.includes('locelso 7100'), 'Debe reconocer la dirección');

  // 3. Mensaje 3: "Si, pago con mercadopago"
  console.log('\n--- Paso 3: "Si, pago con mercadopago" ---');
  const reply3 = AIService.generateDynamicReply('Si, pago con mercadopago', lead, [], {});
  console.log('Respuesta 3:\n', reply3);
  assert(reply3.includes('MERCADO PAGO') || reply3.includes('republica.carne.mp'), 'Debe entregar link o alias de MP');

  // 4. Mensaje 4: "quisiera agregar 1 kilo de chorizo de cerdo"
  console.log('\n--- Paso 4: "quisiera agregar 1 kilo de chorizo de cerdo" ---');
  const history4 = [
    { sender: 'user', content: 'quiero 1 combo asadazo' },
    { sender: 'assistant', content: 'Detalle: 1x Combo Asadazo ($39.999)' }
  ];
  const reply4 = AIService.generateDynamicReply('quisiera agregar 1 kilo de chorizo de cerdo', lead, [], {});
  console.log('Respuesta 4:\n', reply4);
  
  // VERIFICACIONES CLAVE:
  assert(!reply4.toLowerCase().includes('costeleta'), 'ERROR: NO debe ofrecer costeletas cuando el cliente pidió chorizo');
  assert(reply4.toLowerCase().includes('chorizo'), 'Debe incluir Chorizo');
  assert(reply4.includes('39.999') && reply4.includes('5.000'), 'Debe mantener el Combo Asadazo y sumar el Chorizo');
  assert(reply4.includes('44.999'), 'El total acumulado debe ser $44.999 ($39.999 + $5.000)');

  // 5. Mensaje 5: "Chorizo cerdo"
  console.log('\n--- Paso 5: "Chorizo cerdo" aislado ---');
  const reply5 = AIService.generateDynamicReply('Chorizo cerdo', lead, [], {});
  console.log('Respuesta 5:\n', reply5);
  assert(!reply5.toLowerCase().includes('costeleta'), 'ERROR: "Chorizo cerdo" NO debe matchear Costeleta');
  assert(reply5.toLowerCase().includes('chorizo'), 'Debe matchear Chorizo');

  console.log('\n✅ TODOS LOS TESTS DEL FLUJO DE CHORIZO Y ADICIÓN PASARON 100%!');
}

testChorizoFlow().catch(err => {
  console.error('Test falló:', err);
  process.exit(1);
});
