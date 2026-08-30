import { AIService } from '../server/services/ai.js';

console.log('=== TEST 1: Don Juan corrigiendo a un solo combo asasazo ===');
const reply1 = AIService.generateDynamicReply(
  'corrije, quiero un solo combo asasazo',
  { name: 'Don Juan', jid: 'test@s.whatsapp.net' },
  [],
  {}
);
console.log(reply1);

console.log('\n=== TEST 2: Combo Asadazo único sin duplicación ===');
const reply2 = AIService.generateDynamicReply(
  'quiero un combo asadazo',
  { name: 'Don Juan', jid: 'test@s.whatsapp.net' },
  [],
  {}
);
console.log(reply2);
