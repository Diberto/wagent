import { AIService } from '../server/services/ai.js';
import { db } from '../server/services/database.js';

console.log('=== TEST 1: Don Juan pidiendo recordar su pedido ===');
const lastOrder = db.getLatestOrderByJid('153051277086768@lid');
console.log('Last order in DB:', lastOrder?.id, lastOrder?.totalAmount);

const reply1 = AIService.generateDynamicReply(
  'puedes recordar mi ultimo pedido?',
  { name: 'Don Juan', jid: '153051277086768@lid', id: '153051277086768@lid' },
  [],
  {}
);
console.log(reply1);
