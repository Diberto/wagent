import { AIService, getCanonicalCart, extractItemsFromHistoryAndText } from './ai.js';
import { db } from './database.js';
import { getContextualGreeting, getVariedOrderIntro } from './messageVariations.js';

export async function runConversationTestSuite() {
  const startTime = Date.now();
  const results = [];

  const runTest = async (id, name, description, category, fn) => {
    const t0 = Date.now();
    try {
      await fn();
      results.push({
        id,
        name,
        description,
        category,
        passed: true,
        durationMs: Date.now() - t0
      });
    } catch (err) {
      results.push({
        id,
        name,
        description,
        category,
        passed: false,
        error: err.message,
        durationMs: Date.now() - t0
      });
    }
  };

  // 1. Compra Directa y Sustitución de Producto ("en vez de matambre poneme vacío")
  await runTest(
    'test-1-substitution',
    'Sustitución en Caliente (En vez de X poneme Y)',
    'Verifica que el modelo de memoria reemplace un producto por otro sin dejar rastros del anterior ni duplicar ítems.',
    'Memoria de Carrito',
    async () => {
      const lead = { id: 'lead_t1', name: 'Marcos', phone: '+54 9 351 555-1111', customFields: {} };
      const catalog = db.getProducts();

      const history = [
        { sender: 'user', content: 'Hola, quiero 1 kg de matambrito de cerdo y 1 bolsa de carbón' }
      ];

      const cart1 = getCanonicalCart(lead, history, 'Hola, quiero 1 kg de matambrito de cerdo y 1 bolsa de carbón', catalog);
      if (cart1.items.length !== 2) throw new Error('El carrito inicial debe tener 2 ítems.');
      if (!cart1.items.some(i => i.toLowerCase().includes('matambre') || i.toLowerCase().includes('matambrito'))) throw new Error('Falta el matambre en el carrito inicial.');
      if (!cart1.items.some(i => i.toLowerCase().includes('carbón') || i.toLowerCase().includes('carbon'))) throw new Error('Falta el carbón en el carrito inicial.');

      history.push({ sender: 'bot', content: `¡De diez Marcos! 🥩 Resumen:\n${cart1.items.join('\n')}\nSubtotal: $${cart1.total}` });
      history.push({ sender: 'user', content: 'En vez del matambre poneme 2 kg de vacío' });

      const cart2 = getCanonicalCart(lead, history, 'En vez del matambre poneme 2 kg de vacío', catalog);
      if (!cart2.items.some(i => i.toLowerCase().includes('vacío') || i.toLowerCase().includes('vacio'))) throw new Error('El nuevo carrito debe contener Vacío.');
      if (cart2.items.some(i => i.toLowerCase().includes('matambre') || i.toLowerCase().includes('matambrito'))) throw new Error('El matambre debe haber sido removido.');
      if (!cart2.items.some(i => i.toLowerCase().includes('carbón') || i.toLowerCase().includes('carbon'))) throw new Error('El carbón debe permanecer intacto.');
    }
  );

  // 2. Cancelación de Pedido en Etapa de Propuesta
  await runTest(
    'test-2-cancellation',
    'Cancelación y Reseteo Total del Pedido',
    'Verifica que ante intención de cancelación ("cancelar pedido"), la memoria y el carrito se limpien y la respuesta sea empática.',
    'Flujo de Cierre',
    async () => {
      const lead = { id: 'lead_t2', name: 'Laura', phone: '+54 9 351 555-2222', customFields: {} };
      const history = [
        { sender: 'user', content: 'Quiero 2 kg de bife de chorizo' },
        { sender: 'bot', content: '¡De diez Laura! ¿A qué dirección te lo llevamos?' },
        { sender: 'user', content: 'Quiero cancelar el pedido' }
      ];

      const reply = await AIService.generateSalesResponse({
        rawText: 'Quiero cancelar el pedido',
        lead,
        history,
        settings: db.getSettings()
      });

      if (!reply.toLowerCase().includes('cancelado') && !reply.toLowerCase().includes('cancelamos') && !reply.toLowerCase().includes('canceló')) {
        throw new Error('La respuesta debe confirmar la cancelación de forma cordial.');
      }
      const cart = getCanonicalCart(lead, history, 'Quiero cancelar el pedido', db.getProducts());
      if (cart.items.length !== 0) throw new Error('El carrito debe quedar en 0 ítems tras la cancelación.');
    }
  );

  // 3. Suma y Resta Combinada de Cortes
  await runTest(
    'test-3-add-remove',
    'Suma y Resta Combinada en un Mismo Mensaje',
    'Verifica la capacidad de interpretar "Sacale el carbón y sumale 2 kg de chorizo criollo" manteniendo los otros cortes ya pedidos.',
    'Memoria de Carrito',
    async () => {
      const lead = { id: 'lead_t3', name: 'Gonzalo', phone: '+54 9 351 555-3333', customFields: {} };
      const catalog = db.getProducts();

      const history = [
        { sender: 'user', content: 'Quiero 1 kg de costillar y 1 bolsa de carbón' }
      ];

      const cart1 = getCanonicalCart(lead, history, 'Quiero 1 kg de costillar y 1 bolsa de carbón', catalog);
      if (cart1.items.length !== 2) throw new Error('Carrito inicial incompleto.');

      history.push({ sender: 'bot', content: `Detalle:\n${cart1.items.join('\n')}` });
      history.push({ sender: 'user', content: 'Sacale el carbón y sumale 2 kg de chorizo criollo' });

      const cart2 = getCanonicalCart(lead, history, 'Sacale el carbón y sumale 2 kg de chorizo criollo', catalog);
      if (cart2.items.some(i => i.toLowerCase().includes('carbón') || i.toLowerCase().includes('carbon'))) {
        throw new Error('El carbón debió ser eliminado.');
      }
      if (!cart2.items.some(i => i.toLowerCase().includes('chorizo'))) {
        throw new Error('El chorizo criollo debe haber sido sumado.');
      }
      if (!cart2.items.some(i => i.toLowerCase().includes('costilla') || i.toLowerCase().includes('costillar') || i.toLowerCase().includes('asado'))) {
        throw new Error('La costilla debe mantenerse intacta.');
      }
    }
  );

  // 4. Asesoramiento para 4 personas con pedido explícito
  await runTest(
    'test-4-asado-explicit',
    'Respeto Estricto de Pedido Explícito con Asesoramiento',
    'Verifica que si el cliente solicita cortes específicos para un asado de 4 personas, el agente reconozca todos los cortes sin imponer combos ajenos.',
    'Asesoramiento IA',
    async () => {
      const lead = { id: 'lead_t4', name: 'Don Juan', phone: '+54 9 351 626-2475', customFields: {} };
      const userText = 'buenas, quiero un asado para 4 personas, quiero 1 kilo de matambre de cerdo, 4 chorizos de cerdo y 1 kilo de costilla de vaca, una bolsa de carbon';
      
      const reply = await AIService.generateSalesResponse({
        rawText: userText,
        lead,
        history: [{ sender: 'user', content: userText }],
        settings: db.getSettings()
      });

      const repLower = reply.toLowerCase();
      if (!repLower.includes('matambre') && !repLower.includes('matambrito')) throw new Error('No reconoció el matambre de cerdo.');
      if (!repLower.includes('chorizo')) throw new Error('No reconoció los chorizos.');
      if (!repLower.includes('costilla') && !repLower.includes('costillar')) throw new Error('No reconoció la costilla.');
      if (!repLower.includes('carbón') && !repLower.includes('carbon')) throw new Error('No reconoció el carbón.');
    }
  );

  // 5. Cero Productos Fantasma (No Ghost Items)
  await runTest(
    'test-5-no-ghost-items',
    'Erradicación Total de Productos Fantasma en Ficha de Entrega',
    'Verifica que recomendaciones o sugerencias descartadas en turnos anteriores (ej: Bife de Chorizo ofrecido por falta de Lomo) NO aparezcan en el pedido final.',
    'Consistencia de Cierre',
    async () => {
      const lead = { id: 'lead_t5', name: 'Carlos Gomez', phone: '+54 9 351 444-5555', customFields: {} };
      const history = [
        { sender: 'user', content: 'Hola, ¿tenés lomo?' },
        { sender: 'bot', content: 'Disculpá Carlos, no tenemos lomo pero te podemos ofrecer Bife de Chorizo Premium a $14.500/kg.' },
        { sender: 'user', content: 'No gracias, solo quiero 2 kg de costillar' },
        { sender: 'bot', content: '¡De diez Carlos! Te separamos 2 kg de Costillar. Pasame tu dirección.' },
        { sender: 'user', content: 'Av. José Roque Funes 1115, Barrio Urca' }
      ];

      const reply = await AIService.generateSalesResponse({
        rawText: 'Av. José Roque Funes 1115, Barrio Urca',
        lead,
        history,
        settings: db.getSettings()
      });

      if (!reply.includes('FICHA DE REGISTRO') && !reply.toLowerCase().includes('detalle')) {
        throw new Error('Debe generar el detalle o ficha de registro.');
      }
      if (!reply.toLowerCase().includes('costilla') && !reply.toLowerCase().includes('costillar') && !reply.toLowerCase().includes('asado')) {
        throw new Error('La ficha debe listar Costillar.');
      }
      if (reply.includes('Lomo')) throw new Error('Arrastró Lomo (producto no disponible).');
      if (reply.includes('Bife de Chorizo')) throw new Error('Arrastró Bife de Chorizo (sugerencia no aceptada).');
    }
  );

  // 6. Variabilidad Humana Dinámica
  await runTest(
    'test-6-human-variation',
    'Variabilidad Natural y Humana en Mensajes',
    'Comprueba que múltiples llamadas idénticas generen saludos y aperturas diversas sin sonar a plantilla fija.',
    'Humanización & Tono',
    async () => {
      const greetings = new Set();
      const orderIntros = new Set();

      for (let i = 0; i < 15; i++) {
        greetings.add(getContextualGreeting('hola', 'Santiago'));
        orderIntros.add(getVariedOrderIntro('Santiago'));
      }

      if (greetings.size < 2) throw new Error('Saludos insuficientemente variados.');
      if (orderIntros.size < 2) throw new Error('Intros de orden insuficientemente variadas.');
    }
  );

  // 7. Multi-Agentes & Asignación de Roles
  await runTest(
    'test-7-multi-agent',
    'Sistema Multi-Agente (Gestión, Roles y Activación)',
    'Verifica la disponibilidad de agentes precargados (Vendedor, Logística, Admin) y el cambio en tiempo real del agente activo.',
    'Multi-Agente',
    async () => {
      const agents = db.getAgents();
      if (!Array.isArray(agents) || agents.length < 5) {
        throw new Error(`Se esperaban al menos 5 agentes precargados, encontrados: ${agents.length}`);
      }

      const carlos = agents.find(a => a.id === 'agent_carlos');
      const valeria = agents.find(a => a.id === 'agent_valeria');
      const roberto = agents.find(a => a.id === 'agent_roberto');

      if (!carlos || carlos.role !== 'vendedor') throw new Error('Carlos debe existir con rol vendedor.');
      if (!valeria || valeria.role !== 'logistica') throw new Error('Valeria debe existir con rol logistica.');
      if (!roberto || roberto.role !== 'administrador') throw new Error('Roberto debe existir con rol administrador.');

      db.setActiveAgent('agent_valeria');
      if (db.getActiveAgent().id !== 'agent_valeria') throw new Error('Fallo al activar a Valeria.');

      db.setActiveAgent('agent_carlos');
      if (db.getActiveAgent().id !== 'agent_carlos') throw new Error('Fallo al restaurar a Carlos.');
    }
  );

  // 8. Disclaimer de Pesaje Variable por Kilo
  await runTest(
    'test-8-weight-disclaimer',
    'Aclaración de Precios por Kilo y Pesaje Final en Balanza',
    'Verifica que todo resumen comercial o pedido directo incluya la aclaración sobre precios por kilo y variación de pesaje final.',
    'Reglas de Negocio',
    async () => {
      const lead = { id: 'lead_t8', name: 'Claudia', phone: '+54 9 351 777-1122', customFields: {} };
      const reply = await AIService.generateSalesResponse({
        rawText: 'Hola! Quiero 2 kg de vacio y 1 kg de chorizo criollo',
        lead,
        history: [{ sender: 'user', content: 'Hola! Quiero 2 kg de vacio y 1 kg de chorizo criollo' }],
        settings: db.getSettings()
      });

      if (!reply.includes('balanza') && !reply.includes('pesaje') && !reply.includes('peso final')) {
        throw new Error('Falta el disclaimer de variación de pesaje en balanza.');
      }
    }
  );

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const total = results.length;

  return {
    passed: failedCount === 0,
    total,
    passedCount,
    failedCount,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    results
  };
}
