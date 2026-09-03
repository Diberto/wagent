import { db } from './database.js';

/**
 * Motor de Variaciones Naturales, Sinónimos y Paráfrasis Coherentes para República de la Carne
 * Permite que cada respuesta sea única, personalizada y con tono auténtico cordobés/criollo,
 * manteniendo rigurosidad absoluta en precios, cortes, direcciones y datos de negocio.
 */

/**
 * Nota reglamentaria sobre precios por kilo y pesaje variable en balanza
 */
export const WEIGHT_VARIATION_NOTE = '*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variación según el pesaje exacto final en balanza).*';

const GREETING_OPENERS = [
  (name) => name ? `¡Hola ${name}! ¿Cómo estás?` : `¡Hola! ¿Cómo estás?`,
  (name) => name ? `¡Qué tal ${name}! Un gusto saludarte.` : `¡Qué tal! Un gusto saludarte.`,
  (name) => name ? `¡Buenas ${name}! ¿Todo bien?` : `¡Buenas! ¿Todo bien?`,
  (name) => name ? `¡Buenas tardes ${name}! Espero que estés muy bien.` : `¡Buenas tardes! Espero que estés muy bien.`,
  (name) => name ? `¡Hola ${name}, qué hacés! Un gustazo hablar con vos.` : `¡Hola, qué hacés! Un gustazo hablar con vos.`,
  (name) => name ? `¡Hola ${name}! Qué lindo saludarte de nuevo.` : `¡Hola! Qué lindo saludarte.`
];

const PROMO_INTROS = [
  '¡Mirá las ofertas y cortes destacados que tenemos preparados para hoy! 🔥',
  '¡Te paso directo nuestras mejores promos y cortes frescos del día! 🥩',
  '¡Tenemos unos cortes espectaculares y promociones imperdibles! Fijate: 👇',
  '¡Excelente! Acá te comparto los cortes y combos que están saliendo con todo hoy: 🔥',
  '¡Mirá las opciones especiales que tenemos listas en mostrador! 🥩✨'
];

const ORDER_CONFIRM_INTROS = [
  '¡De diez! Ya tengo anotado tu pedido:',
  '¡Excelente elección! Te paso el resumen detallado:',
  '¡Perfecto! Ya te voy reservando estos cortes:',
  '¡Buenísimo! Acá te dejo el detalle de lo que te preparamos:',
  '¡Espectacular! Mirá cómo queda tu pedido:'
];

const DELIVERY_QUESTIONS = [
  `👉 *¿Cómo seguimos con tu pedido?*\n1️⃣ Coordinar *Envío a Domicilio* en el día 🛵\n2️⃣ Elegir *Retiro por Sucursal* (6 sedes en Córdoba) 🏪\n3️⃣ Sumar más cortes o complementos (chorizos, carbón, vino) 🥩\n\n👉 *Respondé 1, 2 o 3 (o escribí "delivery", "sucursal" o los cortes).* 🙌`
];

const PAYMENT_REQUEST_INTROS = [
  'Para abonar, podés hacerlo por Mercado Pago con el link seguro o coordinar en efectivo/transferencia.',
  'Podés pagar cómodamente por Mercado Pago desde tu celu, o bien abonar al recibir/retirar.',
  'Tenemos disponible pago digital por Mercado Pago o transferencia bancaria inmediata.',
  'Elegí el medio de pago que te quede más cómodo: Mercado Pago online, transferencia o efectivo.'
];

const CLOSING_PHRASES = [
  '¡Cualquier duda acá estamos al pie del cañón!',
  '¡Avisame y te lo dejamos listo!',
  '¡Estamos para servirte!',
  '¡Quedo atento a lo que necesites!',
  '¡Muchas gracias por elegirnos!'
];

/**
 * Elige un elemento aleatorio de una lista
 */
export function pickRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return '';
  const idx = Math.floor(Math.random() * array.length);
  return array[idx];
}

/**
 * Genera un saludo natural con variación
 */
export function getVariedGreeting(name) {
  const fn = pickRandom(GREETING_OPENERS);
  return typeof fn === 'function' ? fn(name) : '¡Hola! ¿Cómo estás?';
}

/**
 * Genera un saludo contextual y variado adaptado a lo que el cliente escribió y al agente activo
 */
export function getContextualGreeting(incomingText = '', name = '', agent = null) {
  const t = (incomingText || '').toLowerCase().trim();
  const n = name ? ` ${name}` : '';
  
  const activeAgent = agent || (db.getActiveAgent ? db.getActiveAgent() : null);
  const agentName = activeAgent?.name?.split('-')[0]?.trim() || 'Carlos';
  const roleLabel = activeAgent?.roleLabel || 'maestro carnicero';

  if (/(?:buen\s+d[ií]a|buenos\s+d[ií]as)/i.test(t)) {
    const morningOptions = [
      `¡Muy buenos días${n}! 👋 ¿Cómo estás? Te saluda ${agentName}, ${roleLabel} de **República de la Carne**. 🥩`,
      `¡Buenos días${n}! 👋 Qué lindo saludarte. ${agentName} por acá de **República de la Carne**. 🥩`,
      `¡Muy buen día${n}! 👋 ¿Todo bien? ${agentName} de **República de la Carne** a tu entera disposición. 🥩`,
      `¡Buen día${n}! 👋 ${agentName} por acá. ¡Espero que tengas una excelente mañana! 🥩`
    ];
    return pickRandom(morningOptions);
  }

  if (/(?:buenas\s+tardes)/i.test(t)) {
    const afternoonOptions = [
      `¡Muy buenas tardes${n}! 👋 ¿Cómo estás? ${agentName} por acá, ${roleLabel} de **República de la Carne**. 🥩`,
      `¡Buenas tardes${n}! 👋 Un gusto saludarte. Te saluda ${agentName} de **República de la Carne**. 🥩`,
      `¡Buenas tardes${n}! 👋 ¿Todo bien? ${agentName} de **República de la Carne** a tu disposición. 🥩`
    ];
    return pickRandom(afternoonOptions);
  }

  if (/(?:buenas\s+noches)/i.test(t)) {
    const eveningOptions = [
      `¡Muy buenas noches${n}! 👋 ¿Cómo andás? ${agentName} por acá, ${roleLabel} de **República de la Carne**. 🥩`,
      `¡Buenas noches${n}! 👋 Un gusto saludarte. Te saluda ${agentName} de **República de la Carne**. 🥩`
    ];
    return pickRandom(eveningOptions);
  }

  if (/(?:holis|hola\s+amigo|hola\s+maestro|hola\s+carlos|que\s+tal|qu[eé]\s+onda|c[oó]mo\s+va|c[oó]mo\s+est[aá]s)/i.test(t)) {
    const informalOptions = [
      `¡Hola${n}! 👋 ¿Cómo andás? Te saluda ${agentName} de **República de la Carne**. 🥩`,
      `¡Qué tal${n}! 👋 Un gustazo saludarte. ${agentName} de **República de la Carne** por acá. 🥩`,
      `¡Buenas${n}! 👋 ¿Todo en orden? ${agentName} de **República de la Carne** a tu disposición. 🥩`,
      `¡Hola${n}, qué hacés! 👋 ${agentName} por acá. ¿Cómo te trata el día? 🥩`
    ];
    return pickRandom(informalOptions);
  }

  const generalOptions = [
    `¡Hola${n}! 👋 ¿Cómo estás? Te saluda ${agentName}, ${roleLabel} de **República de la Carne**. 🥩`,
    `¡Qué tal${n}! 👋 Un gusto saludarte. ${agentName} por acá de **República de la Carne**. 🥩`,
    `¡Buenas${n}! 👋 ¿Todo bien? ${agentName} de **República de la Carne** a tu disposición. 🥩`,
    `¡Hola${n}! 👋 ${agentName} por acá de **República de la Carne**. ¡Qué lindo saludarte! 🥩`
  ];
  return pickRandom(generalOptions);
}

/**
 * Genera una introducción variada para promociones
 */
export function getVariedPromoIntro() {
  return pickRandom(PROMO_INTROS);
}

/**
 * Genera una confirmación variada de pedido con el nombre del cliente bien integrado
 */
export function getVariedOrderIntro(name = '') {
  const n = name ? ` ${name}` : '';
  const intros = [
    `¡De diez${n}! 🥩 Ya tengo anotado tu pedido:`,
    `¡Excelente elección${n}! 🥩 Te paso el resumen detallado:`,
    `¡Perfecto${n}! 🥩 Ya te voy reservando estos cortes:`,
    `¡Buenísimo${n}! 🥩 Acá te dejo el detalle de lo que te preparamos:`,
    `¡Espectacular${n}! 🥩 Mirá cómo queda tu pedido:`,
    `¡Anotadísimo${n}! 🥩 Mirá el detalle de tu compra:`,
    `¡Listo${n}! 🥩 Te dejamos separados estos cortes:`
  ];
  return pickRandom(intros);
}

/**
 * Genera un mensaje variado ante modificación exitosa de cortes
 */
export function getVariedModificationIntro(name = '') {
  const n = name ? ` ${name}` : '';
  const intros = [
    `¡Actualizado${n}! 🥩 Modificamos tu pedido con los cambios solicitados:`,
    `¡Corregido${n}! 👍 Dejamos asentado tu pedido actualizado:`,
    `¡De diez${n}! 🥩 Aplicamos los cambios a tus cortes:`,
    `¡Ajustado${n}! 🥩 Mirá cómo quedó ahora tu pedido:`,
    `¡Perfecto${n}! 👍 Tomamos nota de la modificación:`
  ];
  return pickRandom(intros);
}

/**
 * Genera un mensaje de cancelación cordial y humano
 */
export function getVariedCancellationMessage(name = '') {
  const n = name ? ` ${name}` : '';
  const cancels = [
    `¡Entendido${n}! 👍 Hemos cancelado el pedido y liberamos la reserva de los cortes. Cuando gustes volver a armar algo rico para el fuego o la cocina, acá estamos a tu disposición. ¡Muchas gracias por avisarnos! 🥩🙌`,
    `¡Listo${n}! Cancelamos el pedido sin ningún problema. Si más tarde querés pedir otros cortes o consultar promociones, escribinos cuando quieras. ¡Que tengas un excelente día! 🥩🙌`,
    `¡De diez${n}! Cancelamos la orden. No te preocupes, cualquier cosa que necesites para la parrilla o la semana, acá estamos al pie del cañón. ¡Un saludo grande! 🥩`
  ];
  return pickRandom(cancels);
}

/**
 * Genera una pregunta variada sobre logística
 */
export function getVariedDeliveryQuestion() {
  return pickRandom(DELIVERY_QUESTIONS);
}

/**
 * Genera un cierre variado
 */
export function getVariedClosing() {
  return pickRandom(CLOSING_PHRASES);
}

/**
 * Obtiene los 8 cortes y promociones estrella para venta y bienvenida por WhatsApp
 * garantizando que NUNCA se listen artículos de almacén general, snacks o productos a $0.
 */
export function getFeaturedWhatsAppOffers(catalog = null) {
  const currentCatalog = (Array.isArray(catalog) && catalog.length > 0) ? catalog : (db.getProducts() || []);

  // Ya no se usan ofertas hardcodeadas — db.getProducts() es la fuente única de verdad
  const fallbackOffers = [];

  // Filtrar solo productos válidos, disponibles y con precio real > 0
  const validMeatList = currentCatalog.filter(p => {
    const price = Number(p.price) || 0;
    if (price <= 0 || price === 1) return false;
    if (p.isAvailable === false || p.showInWhatsApp === false || p.availableInWhatsApp === false) return false;
    const cat = p.category || '';
    if (['Snacks', 'Verdulería y Frutas', 'General', 'Fiambres y Quesos', 'Bazar y Accesorios'].includes(cat)) return false;
    if (/snack|pehuamar|lays|doritos|3d queso|aceite|acelga|achicoria/i.test(p.name)) return false;
    return true;
  });

  if (validMeatList.length === 0) return fallbackOffers.filter(p => p.isAvailable !== false);

  // 1. Productos marcados explícitamente como destacados por el usuario
  const userFeatured = validMeatList.filter(p => p.isFeaturedWhatsApp === true || p.isFeatured === true);
  const selected = [...userFeatured];
  const usedIds = new Set(selected.map(p => p.id || p.name));

  // 2. Cortes parrilleros y combos preferidos
  const candidateFinders = [
    p => /asadazo|combo/i.test(p.name),
    p => /tapa de cuadril|tapa cuadril/i.test(p.name),
    p => /vacio|vacío/i.test(p.name),
    p => /costillar|asado de tira/i.test(p.name),
    p => /bife de chorizo/i.test(p.name),
    p => /entraña|entrana/i.test(p.name),
    p => /matambrito de cerdo|matambre cerdo/i.test(p.name),
    p => /matambre vacuno|matambre cv/i.test(p.name) && !/cerdo|arrollado/i.test(p.name)
  ];

  for (const finder of candidateFinders) {
    if (selected.length >= 8) break;
    const found = validMeatList.find(p => !usedIds.has(p.id || p.name) && finder(p));
    if (found) {
      selected.push(found);
      usedIds.add(found.id || found.name);
    }
  }

  // 3. Si aún no llega a 8, completar con otros cortes disponibles de carne vacuna, cerdo o pollo
  for (const p of validMeatList) {
    if (selected.length >= 8) break;
    if (!usedIds.has(p.id || p.name)) {
      selected.push(p);
      usedIds.add(p.id || p.name);
    }
  }

  return selected.slice(0, 8);
}

/**
 * Formatea una lista de productos con numeración clara y opciones seleccionables
 * ej: 1️⃣ Tapa de Cuadril ($12.800/kg)
 *     2️⃣ Combo Asadazo ($39.999)
 */
export function formatNumberedCatalog(products) {
  if (!Array.isArray(products) || products.length === 0) return '';
  const numIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣', '1️⃣6️⃣', '1️⃣7️⃣', '1️⃣8️⃣', '1️⃣9️⃣', '2️⃣0️⃣'];

  return products.map((p, idx) => {
    const icon = numIcons[idx] || `[${idx + 1}]`;
    const priceFormatted = `$${Number(p.price).toLocaleString('es-AR')}`;
    const unitLabel = p.unit === 'kg' ? '/ kg' : p.unit === 'combo' ? '(promo 4kg + vino)' : `/${p.unit}`;
    const unitPieces = p.unitsPerKg ? ` (aprox. ${p.unitsPerKg} un/kg)` : '';
    
    return `${icon} *${p.name}* ➔ ${priceFormatted} ${unitLabel}${unitPieces}`;
  }).join('\n');
}

/**
 * Genera sugerencias inteligentes y ágiles de venta cruzada (Cross-Selling)
 * según los cortes que el cliente ya tiene en su pedido
 */
export function getCrossSellingSuggestion(items = [], catalog = null) {
  const currentCatalog = (Array.isArray(catalog) && catalog.length > 0) ? catalog : (db.getProducts() || []);
  const itemsText = items.map(it => typeof it === 'string' ? it : (it.name || it.prod?.name || '')).join(' ').toLowerCase();

  const hasAsado = /vacio|vacío|asado|costillar|tapa|cuadril|bife|entraña|entrana|matambre/i.test(itemsText);
  const hasChori = /chorizo|chori|morcilla|embutido/i.test(itemsText);
  const hasCarbon = /carbón|carbon|leña|lena/i.test(itemsText);
  const hasMila = /milanesa|milas|nalga|peceto|bola de lomo/i.test(itemsText);

  // 1. Asado sin carbón ni embutidos
  if (hasAsado && !hasCarbon && !hasChori) {
    const carbonProd = currentCatalog.find(p => /carbón|carbon/i.test(p.name));
    const choriProd = currentCatalog.find(p => /chorizo/i.test(p.name));
    const carbonPrice = carbonProd ? `$${Number(carbonProd.price).toLocaleString('es-AR')}` : '$3.500';
    const choriPrice = choriProd ? `$${Number(choriProd.price).toLocaleString('es-AR')}` : '$5.000';
    return `💡 *¿Querés sumar algo para las brasas?*\n• 🪵 *Bolsa de Carbón Quebracho* (${carbonPrice})\n• 🌭 *Chorizos Criollos Puro Cerdo* (${choriPrice}/kg)`;
  }

  // 2. Asado con embutido pero sin carbón
  if (hasAsado && hasChori && !hasCarbon) {
    const carbonProd = currentCatalog.find(p => /carbón|carbon/i.test(p.name));
    const carbonPrice = carbonProd ? `$${Number(carbonProd.price).toLocaleString('es-AR')}` : '$3.500';
    return `💡 *¿Te sumamos 1 bolsa de Carbón Quebracho (${carbonPrice}) para el fuego?* 🪵🔥`;
  }

  // 3. Milanesas
  if (hasMila && !/pollo|suprema/i.test(itemsText)) {
    const polloProd = currentCatalog.find(p => /suprema|pechuga|pollo/i.test(p.name));
    const polloPrice = polloProd ? `$${Number(polloProd.price).toLocaleString('es-AR')}` : '$6.900';
    return `💡 *¿Querés sumar también 1 kg de Supremas de Pollo (${polloPrice}/kg) para tener milas combinadas?* 🍗✨`;
  }

  return null;
}

