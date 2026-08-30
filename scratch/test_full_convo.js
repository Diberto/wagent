import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

const lead = { name: 'Don Juan', jid: '153051277086768@lid', id: '153051277086768@lid' };

const convo = [
  'hola',
  'quiero un asado economico para 4 personar',
  'no, que ofertas tenes',
  'quiero un combo asazado nomas',
  'corrije, quiero un solo combo asasazo',
  'hola recuerdas mi pedido por favor',
  'recuerdas mi pedido?',
  'puedes recordar mi ultimo pedido?'
];

console.log('========================================================');
console.log('SIMULATING EXACT CONVERSATION TRANSCRIPT:');
console.log('========================================================\n');

for (const msg of convo) {
  console.log(`👤 Don Juan: "${msg}"`);
  const reply = AIService.generateDynamicReply(msg, lead, db.getKnowledgeBase(), db.getSettings());
  console.log(`🤖 Agente:\n${reply}\n--------------------------------------------------------\n`);
}
