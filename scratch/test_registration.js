import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

// Lead nuevo no reconocido
const newLead = {
  id: 'lead-test-new-123',
  jid: '5493519998877@s.whatsapp.net',
  phone: '+54 9 351 999-8877',
  name: 'Contacto WhatsApp',
  pushName: 'Contacto WhatsApp',
  isRegistered: false,
  address: ''
};

console.log('=== TEST 1: Cliente nuevo diciendo Hola ===');
const reply1 = AIService.generateDynamicReply('hola', newLead, [], {});
console.log(reply1);
console.log('\n-----------------------------------------\n');

console.log('=== TEST 2: Cliente nuevo dando Nombre y Dirección ===');
const reply2 = AIService.generateDynamicReply(
  'Hola me llamo Marcos Rossi y vivo en Av. Rafael Núñez 4250 Barrio Cerro',
  newLead,
  [],
  {}
);
console.log(reply2);
console.log('\n-----------------------------------------\n');

console.log('=== TEST 3: Cliente confirmando datos ("sí correcto") ===');
const leadWithPendingData = {
  ...newLead,
  name: 'Marcos Rossi',
  address: 'Av. Rafael Núñez 4250, Barrio Cerro de las Rosas'
};
const reply3 = AIService.generateDynamicReply('sí correcto', leadWithPendingData, [], {});
console.log(reply3);
