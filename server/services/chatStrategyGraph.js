import { db } from './database.js';
import { 
  getVariedGreeting, 
  getContextualGreeting,
  getVariedPromoIntro, 
  getVariedOrderIntro, 
  formatNumberedCatalog, 
  pickRandom 
} from './messageVariations.js';

export const CHAT_STRATEGY_GRAPH = {
  nodes: [
    {
      id: 'node_greeting',
      label: '1️⃣ Saludo & Apertura Proactiva',
      description: 'Saluda al cliente de forma dinámica y no repetitiva. Presenta los cortes estrella y combos del día con numeración.',
      stage: 'prospect'
    },
    {
      id: 'node_culinary_advice',
      label: '2️⃣ Asesoramiento Culinario & Asados',
      description: 'Calcula cantidades exactas según cantidad de comensales (~500g/persona para asado) y sugiere cortes según recetas (milanesas, guiso, horno).',
      stage: 'proposal'
    },
    {
      id: 'node_order_history',
      label: '3️⃣ Historial de Compras & Pedidos',
      description: 'Muestra el historial completo de pedidos anteriores y el estado del pedido activo con opciones de recompra o seguimiento.',
      stage: 'qualified'
    },
    {
      id: 'node_active_management',
      label: '4️⃣ Gestión & Modificación de Pedidos',
      description: 'Permite modificar cortes, sucursales (1-6), dirección, forma de entrega, pago y cancelación en cualquier momento (incluso en viaje).',
      stage: 'negotiation'
    },
    {
      id: 'node_out_of_flow',
      label: '5️⃣ Reenganche Fuera de Flujo (Smalltalk)',
      description: 'Responde amablemente a dudas o charlas casuales y reengancha con calidez hacia el catálogo o pedido en curso.',
      stage: 'qualified'
    },
    {
      id: 'node_registration_phone',
      label: '6️⃣ Ficha de Registro & Captura de Teléfono',
      description: 'Captura y valida nombre, dirección y teléfono para agendar al cliente con opciones numeradas de confirmación.',
      stage: 'confirming_data'
    },
    {
      id: 'node_delivery_branch',
      label: '7️⃣ Selección de Entrega & Sucursal',
      description: 'Coordina envío a domicilio o retiro en las 6 sedes oficiales de Córdoba.',
      stage: 'proposal'
    },
    {
      id: 'node_payment_closing',
      label: '8️⃣ Cobro & Cierre de Venta',
      description: 'Asienta medio de pago (Efectivo, Transferencia o Mercado Pago) y genera la orden en carnicería.',
      stage: 'closed_won'
    }
  ],
  edges: [
    { from: 'node_greeting', to: 'node_culinary_advice', trigger: 'Cliente pide recomendación de asado o comida' },
    { from: 'node_greeting', to: 'node_order_history', trigger: 'Cliente consulta historial o compras pasadas' },
    { from: 'node_greeting', to: 'node_active_management', trigger: 'Cliente tiene pedido activo o desea modificar' },
    { from: 'node_greeting', to: 'node_out_of_flow', trigger: 'Cliente pregunta algo fuera del tema cárnico' },
    { from: 'node_culinary_advice', to: 'node_registration_phone', trigger: 'Cliente elige cortes o combo sugerido' },
    { from: 'node_out_of_flow', to: 'node_greeting', trigger: 'Retorno sutil al catálogo o pedido activo' },
    { from: 'node_registration_phone', to: 'node_delivery_branch', trigger: 'Confirmación de datos' },
    { from: 'node_delivery_branch', to: 'node_payment_closing', trigger: 'Selección de destino / sucursal' },
    { from: 'node_active_management', to: 'node_payment_closing', trigger: 'Modificación completada' }
  ]
};

export class ChatStrategyGraphService {
  /**
   * Retorna la definición completa del grafo de estrategia
   */
  static getGraphDefinition() {
    return CHAT_STRATEGY_GRAPH;
  }

  /**
   * Asesora con recetas personalizadas y cálculo de asados por persona
   */
  static handleCulinaryAndAsado(text, clientName, products = []) {
    const t = (text || '').toLowerCase();
    const catalog = (Array.isArray(products) && products.length > 0) ? products : (db.getProducts() || []);

    const findProd = (pattern, fallbackName, fallbackPrice) => {
      const match = catalog.find(p => pattern.test(p.name));
      if (match) {
        return {
          name: match.name,
          price: Number(match.price) || fallbackPrice,
          unit: match.unit || 'kg'
        };
      }
      return { name: fallbackName, price: fallbackPrice, unit: 'kg' };
    };

    const vacio = findProd(/vacio|vacío/i, 'Vacío Especial Seleccionado', 11500);
    const chori = findProd(/chorizo/i, 'Chorizo Criollo Puro Cerdo', 5000);
    const comboAsadazo = findProd(/asadazo/i, 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', 39999);
    const tapaCuadril = findProd(/tapa.*cuadril/i, 'Tapa de Cuadril Seleccionada', 12800);
    const matambre = findProd(/matambre/i, 'Matambre Vacuno Tierno', 9500);
    const nalga = findProd(/nalga|bola de lomo/i, 'Nalga de Novillito para Milanesas', 10500);
    const peceto = findProd(/peceto/i, 'Peceto Especial Seleccionado', 13200);
    const suprema = findProd(/suprema|pechuga/i, 'Supremas de Pollo Frescas', 6900);
    const osobuco = findProd(/osobuco/i, 'Osobuco Seleccionado', 6800);
    const roastBeef = findProd(/roast|palomita/i, 'Roast Beef / Palomita Tierna', 9400);
    const molida = findProd(/molida/i, 'Carne Molida Especial Vacuna', 7200);
    const colita = findProd(/colita/i, 'Colita de Cuadril Seleccionada', 12800);
    const pataMuslo = findProd(/pata muslo/i, 'Pata Muslo Fresca de Pollo', 4660);
    const carbon = findProd(/carbón|carbon/i, 'Bolsa de Carbón Quebracho', 3500);

    // 0. Si el cliente ya detalló cortes o productos específicos con cantidades o listas de pedido, NO interceptar con propuestas genéricas
    const hasSpecificCutsWithQty = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b(?:una|un|dos|tres|cuatro|cinco|seis)\s+bolsas?)\s+(?:de\s+)?(?:costillar|costilla|vacio|vacío|matambre|chorizo|chori|morcilla|milanesa|cuadril|tapa|lomo|bife|molida|pollo|carbon|carbón|cerdo|novillito)/i.test(t) ||
      (/(?:quiero|dame|mandame|anotame|separame|preparame)\s+(?:\d+|medio|un|una)\s*(?:kg|kilo|unidades?|bolsa|botella|paquete|tira|bife|de)/i.test(t) && /(?:costilla|matambre|chorizo|vacio|carbon|cuadril|milanesa|bife)/i.test(t));

    if (hasSpecificCutsWithQty) {
      return null;
    }

    // 1. Detección de Asados por número de personas / comensales
    const peopleMatch = t.match(/(?:para|somos|comemos|seremos|seriamos|calculale|asadito\s+para|asado\s+para|un\s+asado\s+para|un\s+asadito\s+para)\s+(?:unos\s+|unas\s+)?(\d{1,3})\s*(?:personas?|comensales|amigos|invitados|familiares|bocas|peronas)?/i) ||
      t.match(/(\d{1,3})\s*(?:personas|comensales|invitados|amigos|peronas)/i);

    const isAsadoConsultation = /(?:asesorame|asesoramiento|qu[eé]\s+me\s+recomendas|recomendas\s+para\s+asado|recomendás\s+para\s+asado|opciones\s+para\s+asado|cuanto\s+calculo|cuánto\s+calculo|calcular\s+asado|asado\s+para\s+\d+|para\s+\d+\s+personas|somos\s+\d+)/i.test(t) ||
      (peopleMatch && /(?:asado|asadito|asadaso|asadazo|parrilla|parrillada|fuego|brasas|comer|cena|almuerzo)/i.test(t));

    if (peopleMatch || isAsadoConsultation) {
      let peopleCount = peopleMatch ? parseInt(peopleMatch[1], 10) : 4;
      if (peopleCount <= 0) peopleCount = 4;
      if (peopleCount > 100) peopleCount = 100;

      // Cálculo: ~500g por persona para asado completo (carne + achura/embutido)
      const totalKg = (peopleCount * 0.5).toFixed(1).replace('.0', '');
      const meatKg = Math.max(1, Math.round(peopleCount * 0.35));
      const choriKg = Math.max(1, Math.round(peopleCount * 0.15));

      const total1 = (meatKg * vacio.price) + (choriKg * chori.price);
      const total2 = comboAsadazo.price + (peopleCount > 4 ? (peopleCount - 4) * vacio.price : 0);
      const meatGourmet1 = Math.max(1, Math.round(meatKg * 0.6));
      const meatGourmet2 = Math.max(1, Math.round(meatKg * 0.4));
      const total3 = (meatGourmet1 * tapaCuadril.price) + (meatGourmet2 * matambre.price) + (choriKg * chori.price);

      return `¡Qué lindo asado ${clientName}! 🔥🥩 Para **${peopleCount} personas** calculamos un promedio de **${totalKg} kg en total** (~500g por comensal bien servido).\n\n` +
        `👉 *Te armé 3 opciones ideales para que elijas:*\n\n` +
        `1️⃣ **Opción Clásica Equilibrada (${totalKg} kg):**\n` +
        `• ${meatKg} kg de ${vacio.name} ($${(meatKg * vacio.price).toLocaleString('es-AR')})\n` +
        `• ${choriKg} kg de ${chori.name} ($${(choriKg * chori.price).toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${total1.toLocaleString('es-AR')}**\n\n` +
        `2️⃣ **Opción Combo “Asadazo” + Agregados:**\n` +
        `• 1 ${comboAsadazo.name} — $${comboAsadazo.price.toLocaleString('es-AR')}\n` +
        (peopleCount > 4 ? `• ${Math.max(1, peopleCount - 4)} kg adicional de Vacío / Costillar ($${((peopleCount - 4) * vacio.price).toLocaleString('es-AR')})\n` : '') +
        `💰 *Total:* **$${total2.toLocaleString('es-AR')}**\n\n` +
        `3️⃣ **Opción Parrillera Gourmet:**\n` +
        `• ${meatGourmet1} kg de ${tapaCuadril.name} ($${(meatGourmet1 * tapaCuadril.price).toLocaleString('es-AR')})\n` +
        `• ${meatGourmet2} kg de ${matambre.name} ($${(meatGourmet2 * matambre.price).toLocaleString('es-AR')})\n` +
        `• ${choriKg} kg de ${chori.name} ($${(choriKg * chori.price).toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${total3.toLocaleString('es-AR')}**\n\n` +
        `💡 *Complemento opcional:* ¿Querés sumar 1 bolsa de Carbón Quebracho ($${carbon.price.toLocaleString('es-AR')}) para el fuego? 🪵\n\n` +
        `👉 ¿Con cuál opción te gustaría avanzar (*1*, *2* o *3*), o preferís ajustar algún corte a tu gusto? 🙌 [[STAGE:proposal]]`;
    }

    // 2. Detección de Milanesas
    if (/(?:milanesa|milanesas|milas|supremas|hacer milanesas)/i.test(t)) {
      return `¡De diez ${clientName}! 🥩 Para hacer las mejores **Milanesas**, te recomendamos nuestros cortes tiernos y sin grasa:\n\n` +
        `1️⃣ *${nalga.name}* ($${nalga.price.toLocaleString('es-AR')} / kg) — Feteada justa para milanesas tiernas.\n` +
        `2️⃣ *${peceto.name}* ($${peceto.price.toLocaleString('es-AR')} / kg) — Redonditas, parejas y súper tiernas.\n` +
        `3️⃣ *${suprema.name}* ($${suprema.price.toLocaleString('es-AR')} / kg) — Para milanesas de pollo jugosas.\n\n` +
        `👉 Decime cuántos kilos o qué opción te preparamos feteada para milanesas. 🙌 [[STAGE:proposal]]`;
    }

    // 3. Detección de Guisos, Estofados o Empanadas
    if (/(?:guiso|estofado|olla|locro|puchero|carbonada|empanadas|picada)/i.test(t)) {
      return `¡Excelente idea ${clientName}! 🍲 Para **guisos, estofados u olla**, estos son nuestros mejores cortes con todo el sabor:\n\n` +
        `1️⃣ *${osobuco.name}* ($${osobuco.price.toLocaleString('es-AR')} / kg) — Puro sabor con caracú para estofados y guisazos.\n` +
        `2️⃣ *${roastBeef.name}* ($${roastBeef.price.toLocaleString('es-AR')} / kg) — Carne magra ideal para cortar en cubitos.\n` +
        `3️⃣ *${molida.name}* ($${molida.price.toLocaleString('es-AR')} / kg) — Magra y fresca, ideal para empanadas o salsas.\n\n` +
        `👉 ¿Cuántos kilos te gustaría que te separemos? Respondé con el número o nombre del corte. 🥩 [[STAGE:proposal]]`;
    }

    // 4. Detección de Horno / Cocción Lenta
    if (/(?:horno|al horno|coccion lenta|cocción lenta|asadera|con papas)/i.test(t)) {
      return `¡Espectacular ${clientName}! 🥩 Para cocinar al **Horno con papas o verduras**, los cortes más jugosos son:\n\n` +
        `1️⃣ *${colita.name}* ($${colita.price.toLocaleString('es-AR')} / kg) — Queda tiernísima y rosada al medio.\n` +
        `2️⃣ *${vacio.name}* ($${vacio.price.toLocaleString('es-AR')} / kg) — Crujiente por fuera y desmechado por dentro.\n` +
        `3️⃣ *${pataMuslo.name}* ($${pataMuslo.price.toLocaleString('es-AR')} / kg) — Dorada con limón y finas hierbas.\n\n` +
        `👉 Decime cuál te tienta más (*1*, *2* o *3*) y te lo dejamos listo para despachar en el día. 🛵 [[STAGE:proposal]]`;
    }

    return null;
  }

  /**
   * Muestra el historial completo de pedidos del cliente
   */
  static handleOrderHistory(lead, clientName) {
    const jid = lead.jid || lead.id || lead;
    const allOrders = db.getOrdersByJid(jid);

    if (!allOrders || allOrders.length === 0) {
      return `¡Hola ${clientName}! 👋 No registramos compras anteriores a tu nombre todavía.\n\n` +
        `🥩 ¡Hoy es un gran día para tu primer pedido! Tenemos novillito de exportación, embutidos propios y combos en promo con envío en el día a tu domicilio.\n\n` +
        `👉 ¿Te gustaría que te pase nuestras ofertas del día o tenías ganas de preparar un asado? 🔥 [[STAGE:proposal]]`;
    }

    const formatStatus = (st) => {
      switch (st) {
        case 'pending': return '⏳ Pendiente';
        case 'preparing': return '🥩 En preparación';
        case 'in_transit': return '🛵 En camino con repartidor';
        case 'ready_for_pickup': return '🎉 Listo para retirar en sucursal';
        case 'delivered': return '✅ Entregado con éxito';
        case 'cancelled': return '❌ Cancelado';
        default: return st;
      }
    };

    const ordersList = allOrders.slice(0, 5).map((ord, idx) => {
      const dateStr = ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('es-AR') : 'Reciente';
      const itemsSummary = Array.isArray(ord.items) ? ord.items.slice(0, 2).join(', ') : ord.items;
      return `• **Pedido #${ord.id}** (${dateStr}) — ${formatStatus(ord.status)}\n  📋 *Cortes:* ${itemsSummary}\n  💰 *Total:* $${Number(ord.totalAmount).toLocaleString('es-AR')}`;
    }).join('\n\n');

    const activeOrder = allOrders.find(o => ['pending', 'preparing', 'in_transit', 'ready_for_pickup'].includes(o.status));

    let activeNotice = '';
    if (activeOrder) {
      activeNotice = `\n\n📌 *Tenés un pedido activo en curso:* **#${activeOrder.id}** (${formatStatus(activeOrder.status)}). Podés escribir *"modificar pedido"* o *"cancelar pedido"* en cualquier momento.`;
    }

    return `📜 *HISTORIAL DE PEDIDOS — ${clientName.toUpperCase()}:*\n\n` +
      `${ordersList}${activeNotice}\n\n` +
      `👉 ¿Te gustaría repetir alguno de tus pedidos anteriores o armar un nuevo pedido para hoy? 🥩🔥 [[STAGE:qualified]]`;
  }

  /**
   * Responde cortésmente a preguntas fuera de flujo y reengancha hacia la carnicería
   */
  static handleOutOfFlow(text, clientName, lead) {
    const t = (text || '').toLowerCase().trim();
    const activeOrder = db.getActiveOrdersByJid(lead.jid || lead.id || lead)[0] || null;

    let smalltalkAck = '';
    if (/(?:hola|holis|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|que tal|qué tal)/i.test(t)) {
      smalltalkAck = getContextualGreeting(text, clientName);
    } else if (/clima|calor|frio|frío|llueve|lluvia|tiempo/i.test(t)) {
      smalltalkAck = `¡Totalmente ${clientName}! El clima está especial para prender el fuego o mandar algo rico al horno. 😉`;
    } else if (/futbol|fútbol|partido|talleres|belgrano|instituto|boca|river|messi/i.test(t)) {
      smalltalkAck = `¡Qué temazo ${clientName}! En Córdoba el fútbol siempre se vive mejor con un buen asado de por medio. ⚽🔥`;
    } else if (/como te llamas|quien sos|sos bot|sos ia|sos humano|que sos/i.test(t)) {
      smalltalkAck = `¡Soy Carlos! Maestro carnicero digital de **República de la Carne**, listo para seleccionarte los mejores cortes de Córdoba. 🥩`;
    } else if (/chiste|gracioso|broma/i.test(t)) {
      smalltalkAck = `¿Sabés cuál es el colmo de un carnicero? ¡Tener un perro salchicha y que se le escape la clientela! 😂`;
    } else {
      smalltalkAck = `¡Te escucho atentamente ${clientName}!`;
    }

    if (activeOrder) {
      const itemsText = Array.isArray(activeOrder.items) ? activeOrder.items.join('\n') : (activeOrder.items || 'Cortes seleccionados');
      const isDetailQuery = /ver|mostrar|mostrame|detalle|orden|pedido|resumen|corte|qu[eé]\s+ped[ií]/i.test(t);
      if (isDetailQuery) {
        return `¡Hola ${clientName}! 📋 Acá tenés el detalle completo de tu pedido **#${activeOrder.id}**:\n\n` +
          `🥩 *Cortes seleccionados:*\n` +
          `${itemsText}\n\n` +
          `💰 *Total:* **$${Number(activeOrder.totalAmount).toLocaleString('es-AR')}**\n` +
          `📍 *Destino:* ${activeOrder.address || lead.address || activeOrder.branch || 'A coordinar'}\n` +
          `💳 *Medio de pago:* ${activeOrder.paymentMethod || 'Efectivo / Transferencia'}\n\n` +
          `¿Precisás hacer algún cambio o está todo listo para despachar? 🙌`;
      }

      return `${smalltalkAck}\n\n` +
        `Te recuerdo que tenemos en curso tu pedido **#${activeOrder.id}** por **$${Number(activeOrder.totalAmount).toLocaleString('es-AR')}**.\n\n` +
        `👉 *¿Precisás algo de tu pedido?*\n` +
        `1️⃣ Modificar datos o cortes\n` +
        `2️⃣ Consultar estado y detalle\n` +
        `3️⃣ Cancelar pedido\n\n` +
        `¡Estoy acá para ayudarte! 🙌`;
    }

    return `${smalltalkAck}\n\n` +
      `Contame, ¿tenías ganas de preparar un asadito o buscás cortes para la semana? Hacemos envíos directos en el día a todo Córdoba. 🛵🥩\n\n` +
      `👉 *Opciones rápidas:*\n` +
      `1️⃣ Ver ofertas del día y combos\n` +
      `2️⃣ Asesoramiento de asado por cantidad de personas\n` +
      `3️⃣ Consultar nuestras 6 sucursales\n\n` +
      `¿Por dónde arrancamos? 🙌 [[STAGE:proposal]]`;
  }
}
