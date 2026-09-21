import { NeuralMemoryService } from '../services/neuralMemory.js';
import { db } from '../services/database.js';

console.log('🧠 ====================================================');
console.log('🧠 SUITE DE VALIDACIÓN: MEMORIA COGNITIVA & RED NEURONAL');
console.log('🧠 ====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failedTests++;
  }
}

try {
  // 1. Test Mapa Mental del Sistema
  console.log('--- 1. Validando Mapa Mental del Sistema (getSystemMentalMap) ---');
  const systemMap = NeuralMemoryService.getSystemMentalMap();
  assert(systemMap && Array.isArray(systemMap.nodes), 'El mapa contiene un array de nodos');
  assert(Array.isArray(systemMap.edges), 'El mapa contiene un array de aristas/edges');
  assert(systemMap.nodes.length > 20, `Nodos suficientes en el mapa (${systemMap.nodes.length} nodos detectados)`);
  assert(systemMap.edges.length > 20, `Aristas suficientes en el mapa (${systemMap.edges.length} aristas detectadas)`);

  const nodeMap = new Map(systemMap.nodes.map(n => [n.id, n]));
  assert(nodeMap.has('node_brand'), 'Existe nodo raíz de marca (node_brand)');
  assert(nodeMap.has('node_carlos_ia'), 'Existe nodo de agente Carlos IA (node_carlos_ia)');
  assert(nodeMap.has('node_elevenlabs_agent'), 'Existe nodo de ElevenLabs (node_elevenlabs_agent)');
  assert(nodeMap.has('cluster_catalog'), 'Existe cluster de catálogo');
  assert(nodeMap.has('cluster_branches'), 'Existe cluster de sucursales');

  // Validar integridad referencial de todas las aristas (cero aristas rotas)
  let brokenEdges = 0;
  for (const edge of systemMap.edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) {
      console.warn(`⚠️ Arista rota: ${edge.from} -> ${edge.to}`);
      brokenEdges++;
    }
  }
  assert(brokenEdges === 0, `Integridad referencial de aristas 100% válida (${brokenEdges} aristas huérfanas)`);

  // 2. Test Búsqueda Sináptica Asociativa
  console.log('\n--- 2. Validando Búsqueda Sináptica Asociativa (searchSynapticContext) ---');
  const queryAsadazo = NeuralMemoryService.searchSynapticContext('asadazo');
  assert(queryAsadazo.length > 0, `Búsqueda de 'asadazo' devolvió ${queryAsadazo.length} nodo(s)`);

  const queryUrca = NeuralMemoryService.searchSynapticContext('urca');
  assert(queryUrca.length > 0, `Búsqueda de 'urca' devolvió ${queryUrca.length} nodo(s) relevantes`);

  const queryMP = NeuralMemoryService.searchSynapticContext('mercadopago');
  assert(queryMP.length > 0, `Búsqueda de 'mercadopago' asoció correctamente los pagos`);

  // 3. Test Generación de Contexto Cognitivo (Vector Prompt)
  console.log('\n--- 3. Validando Contexto Cognitivo Dinámico (generateCognitiveContext) ---');
  const context = NeuralMemoryService.generateCognitiveContext({
    incomingText: 'Hola Carlos, quería saber el precio del vacío y si hacen envíos a Cerro de las Rosas'
  });
  assert(typeof context.contextPrompt === 'string', 'El prompt cognitivo se genera como string');
  assert(context.contextPrompt.includes('REPÚBLICA DE LA CARNE'), 'Prompt incluye identidad de marca');
  assert(context.contextPrompt.includes('URCA CENTRAL'), 'Prompt incluye sucursales de Córdoba');
  assert(context.metrics && context.metrics.tokenSavingsPercent >= 0, `Ahorro de tokens calculado: ${context.metrics?.tokenSavingsPercent}%`);

  // 4. Test Grafo Neuronal de Conversación
  console.log('\n--- 4. Validando Grafo Neuronal por Chat (getConversationNeuralMap) ---');
  const mockChatId = '5493512345678@s.whatsapp.net';
  const chatMap = NeuralMemoryService.getConversationNeuralMap(mockChatId);
  assert(chatMap && Array.isArray(chatMap.nodes), 'Grafo de conversación contiene nodos');
  assert(Array.isArray(chatMap.synapses), 'Grafo de conversación contiene synapses');
  assert(Array.isArray(chatMap.edges), 'Grafo de conversación contiene edges normalizados');
  assert(chatMap.nodes.length >= 2, `Nodos generados para el chat: ${chatMap.nodes.length}`);

  // 5. Test Auto-Aprendizaje en Tiempo Real
  console.log('\n--- 5. Validando Aprendizaje en Tiempo Real (learnFromCustomerInteraction) ---');
  const learned = NeuralMemoryService.learnFromCustomerInteraction({
    jid: mockChatId,
    incomingText: 'Somos 6 personas, queremos hacer asado a la parrilla y prefiero retirar en Urca'
  });
  assert(learned && learned.groupSize === '6 personas', `Detectó grupo de personas correctamente: ${learned?.groupSize}`);
  assert(learned && learned.cookingPreference === 'Parrilla / Asado', `Detectó preferencia de cocción: ${learned?.cookingPreference}`);
  assert(learned && typeof learned.preferredBranch === 'string', `Detectó sucursal preferida: ${learned?.preferredBranch}`);

  console.log('\n====================================================');
  console.log(`📊 RESULTADOS: ${passedTests} PASADOS | ${failedTests} FALLADOS`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Error catastrófico en la prueba:', err);
  process.exit(1);
}
