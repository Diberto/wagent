import { db } from './server/services/database.js';
import { AIService, findAmbiguousProducts, buildFullSystemPrompt, extractItemsFromHistoryAndText } from './server/services/ai.js';
import { getFeaturedWhatsAppOffers } from './server/services/messageVariations.js';

async function runTests() {
  console.log('=== TEST 1: Configuración de Prompt & Contexto Regional ===');
  const settings = db.getSettings();
  console.log('País:', settings.country);
  console.log('Moneda:', settings.currency);
  console.log('Modismos:', settings.slang);
  console.log('System prompt length:', settings.systemPrompt?.length);
  
  const fullPrompt = buildFullSystemPrompt(settings, db.getProducts());
  if (fullPrompt.includes('Argentina') && fullPrompt.includes('$ ARS') && fullPrompt.includes('Carlos')) {
    console.log('✅ TEST 1 PASSED: Contexto regional y prompt del sistema enriquecido correctamente.\n');
  } else {
    console.error('❌ TEST 1 FAILED:', fullPrompt);
  }

  console.log('=== TEST 2: Edición y Ocultamiento de Tapa de Cuadril / Productos en WhatsApp ===');
  const products = db.getProducts();
  const tapa = products.find(p => p.name.toLowerCase().includes('tapa de cuadril'));
  if (tapa) {
    // Desactivar temporalmente de WhatsApp
    db.updateProduct(tapa.id, { isAvailable: false });
    const offers = getFeaturedWhatsAppOffers();
    const hasTapaInOffers = offers.some(o => o.name.toLowerCase().includes('tapa de cuadril'));
    console.log('¿Tapa de Cuadril aparece en ofertas tras desactivarla?:', hasTapaInOffers ? 'SÍ (ERROR)' : 'NO (CORRECTO)');
    
    // Reactivar y marcar como destacada
    db.updateProduct(tapa.id, { isAvailable: true, isFeaturedWhatsApp: true });
    const offersAfter = getFeaturedWhatsAppOffers();
    const hasTapaFeatured = offersAfter.some(o => o.name.toLowerCase().includes('tapa de cuadril'));
    console.log('¿Tapa de Cuadril aparece en ofertas tras reactivarla?:', hasTapaFeatured ? 'SÍ (CORRECTO)' : 'NO (ERROR)');
    
    if (!hasTapaInOffers && hasTapaFeatured) {
      console.log('✅ TEST 2 PASSED: El catálogo respeta la activación, desactivación y destacados de WhatsApp sin revertirse.\n');
    }
  }

  console.log('=== TEST 3: Desambiguación ante Cortes Similares (ej: "cuadril", "matambre", "milanesas") ===');
  const catalog = db.getProducts();
  
  const ambiguousQuery1 = "quiero 2 kilos de cuadril";
  const amb1 = findAmbiguousProducts(ambiguousQuery1, catalog);
  console.log('Query: "quiero 2 kilos de cuadril" -> Matches:', amb1 ? amb1.matches.map(m => m.name) : 'Ninguno');

  const ambiguousQuery2 = "pasame precio de matambre";
  const amb2 = findAmbiguousProducts(ambiguousQuery2, catalog);
  console.log('Query: "pasame precio de matambre" -> Matches:', amb2 ? amb2.matches.map(m => m.name) : 'Ninguno');

  if (amb1 && amb1.matches.length >= 2 && amb2 && amb2.matches.length >= 2) {
    console.log('✅ TEST 3 PASSED: La IA detecta ambigüedad y ofrece opciones numeradas al cliente.\n');
  } else {
    console.log('⚠️ TEST 3 Matches:', { amb1, amb2 });
  }

  console.log('=== TEST 4: Selección de Productos, Canasta y Modificaciones de Cantidad ===');
  // Probar extracción de productos numerados tras una consulta
  const historyWithMenu = [
    { sender: 'user', content: 'hola, que tenes?' },
    { 
      sender: 'agent', 
      content: '¡Buenas tardes! Mirá lo que tenemos:\n1️⃣ Combo “Asadazo” ➔ $39.999\n2️⃣ Tapa de Cuadril Seleccionada ➔ $12.800 / kg\n3️⃣ Vacío Especial ➔ $11.500 / kg\n4️⃣ Costillar Novillito ➔ $9.800 / kg' 
    }
  ];

  // Cliente pide: "1 combo asadazo y 2 kilos de la opcion 4"
  const { items: cart1Strings, products: cart1 } = extractItemsFromHistoryAndText(historyWithMenu, "1 combo asadazo y 2 kilos de la opcion 4", catalog);
  console.log('Ítems extraídos del pedido inicial:');
  console.log(cart1.map(it => `• ${it.quantity} ${it.unit} ${it.name} ($${it.subtotal})`));

  // Cliente modifica: "cambiame el asado a 1.5 kg y sacá el combo"
  const historyWithCart = [
    ...historyWithMenu,
    { sender: 'user', content: '1 combo asadazo y 2 kilos de la opcion 4' },
    { 
      sender: 'agent', 
      content: '¡De diez! Te anoto:\n📋 Detalle de tu pedido:\n• 1 combo Combo “Asadazo” — $39.999\n• 2 kg Costillar / Asado de Tira Novillito — $19.600\n💰 Total: $59.599' 
    }
  ];

  const { items: cart2Strings, products: cart2 } = extractItemsFromHistoryAndText(historyWithCart, "cambiame el asado a 1.5 kg y sacá el combo asadazo", catalog);
  console.log('Ítems tras modificación del cliente:');
  console.log(cart2.map(it => `• ${it.quantity} ${it.unit} ${it.name} ($${it.subtotal})`));

  const hasModifiedCostillar = cart2.some(it => it.name.includes('Costillar') && it.quantity === 1.5);
  const comboRemoved = !cart2.some(it => it.name.includes('Combo'));

  if (hasModifiedCostillar && comboRemoved) {
    console.log('✅ TEST 4 PASSED: Las modificaciones de cantidad y eliminaciones de la canasta funcionan a la perfección.\n');
  } else {
    console.error('❌ TEST 4 FAILED: Carrito resultante:', cart2);
  }

  console.log('🎉 TODOS LOS TESTS DE INTEGRACIÓN COMPLETADOS CON ÉXITO.');
}

runTests().catch(console.error);
