import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

const lead = { name: 'Don Juan', jid: '153051277086768@lid', id: '153051277086768@lid' };

const convo = [
  'hola',
  'quiero un asado economico para 4 personar',
  'no, que ofertas tenes',
  'quiero un combo asazado nomas',
  'no, solo eso',
  'no, retiro por sucursal',
  '1',
  'por mercado pago'
];

console.log('========================================================');
console.log('SIMULATING EXACT CONVERSATION TRANSCRIPT:');
console.log('========================================================\n');

for (const msg of convo) {
  console.log(`👤 Don Juan: "${msg}"`);
  const reply = AIService.generateDynamicReply(msg, lead, db.getKnowledgeBase(), db.getSettings());
  console.log(`🤖 Agente:\n${reply}\n--------------------------------------------------------\n`);
}
