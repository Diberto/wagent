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
    const molida = findProd(/^(?!.*grasa).*molida|carne picada|picada especial/i, 'Carne Molida Especial Vacuna', 7200);
    const colita = findProd(/colita/i, 'Colita de Cuadril Seleccionada', 12800);
    const costeleta = findProd(/costeleta|bife angosto|bife de chorizo/i, 'Costeletas de Ternera / Bife Angosto', 17500);
    const pataMuslo = findProd(/pata muslo/i, 'Pata Muslo Fresca de Pollo', 4660);
    const carbon = findProd(/carbón|carbon/i, 'Bolsa de Carbón Quebracho', 3500);

    // 0. Si el cliente ya detalló cortes o productos específicos con cantidades o listas de pedido, NO interceptar con propuestas genéricas
    const hasSpecificCutsWithQty = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b(?:una|un|dos|tres|cuatro|cinco|seis)\s+bolsas?)\s+(?:de\s+)?(?:costillar|costilla|vacio|vacío|matambre|chorizo|chori|morcilla|milanesa|cuadril|tapa|lomo|bife|molida|pollo|carbon|carbón|cerdo|novillito)/i.test(t) ||
      (/(?:quiero|dame|mandame|anotame|separame|preparame)\s+(?:\d+|medio|un|una)\s*(?:kg|kilo|unidades?|bolsa|botella|paquete|tira|bife|de)/i.test(t) && /(?:costilla|matambre|chorizo|vacio|carbon|cuadril|milanesa|bife)/i.test(t));

    if (hasSpecificCutsWithQty) {
      return null;
    }

    const peopleMatch = t.match(/(?:para|somos|comemos|seremos|seriamos|calculale|asadito\s+para|asado\s+para|un\s+asado\s+para|un\s+asadito\s+para)\s+(?:unos\s+|unas\s+|los\s+|las\s+)?(\d{1,3})\s*(?:personas?|comensales|amigos|invitados|familiares|bocas|peronas)?/i) ||
      t.match(/(\d{1,3})\s*(?:personas|comensales|invitados|amigos|peronas)/i);

    let peopleCount = peopleMatch ? parseInt(peopleMatch[1], 10) : 4;
    if (peopleCount <= 0) peopleCount = 4;
    if (peopleCount > 100) peopleCount = 100;

    // Detección de Negación Explícita de Asado o Búsqueda de Comida Casera/Rápida/Familiar
    const isExplicitNoAsado = /no\s+(?:quiero|hago|vamos\s+a\s+hacer|tengo\s+ganas\s+de)\s+(?:asado|parrilla|asadito)|nada\s+de\s+asado|sin\s+asado|fuera\s+de\s+asado|otra\s+cosa\s+que\s+no\s+sea\s+asado/i.test(t);
    const isDailyCookingOrFamilyMeal = /(?:cocinar\s+(?:algo|rico|hoy|en\s+casa|para\s+la\s+familia|con\s+mi\s+familia)|algo\s+sencillo|plato\s+familiar|para\s+cocinar|comida\s+de\s+casa|almuerzo|cena|cocinar\s+hoy|algo\s+para\s+comer|comida\s+r[aá]pida|men[uú]|algo\s+f[aá]cil|hacer\s+(?:la\s+)?comida|hacer\s+algo|comer\s+algo|comer\s+en\s+casa|con\s+mi\s+familia|en\s+familia|somos\s+\d+)/i.test(t);

    // 1. SI ES COMIDA DIARIA FAMILIAR O SE NEGÓ EL ASADO EXPLÍCITAMENTE (O NO MENCIONA ASADO/PARRILLA)
    if (isExplicitNoAsado || (isDailyCookingOrFamilyMeal && !/(?:asado|asadito|parrilla|parrillada|fuego|brasas|asadazo)/i.test(t))) {
      const rawFamilyKg = Math.round(peopleCount * 0.28 * 10) / 10;
      const familyMeatKg = Math.max(0.75, rawFamilyKg);
      const bifeKg = Math.max(0.8, Math.round(peopleCount * 0.3 * 10) / 10);
      const bifesCount = peopleCount;

      const nalgaPrice = Math.round(nalga.price * familyMeatKg);
      const bifePrice = Math.round((costeleta.price || 17500) * bifeKg);
      const picadaPrice = Math.round(molida.price * familyMeatKg);

      return `¡Entendido perfectamente ${clientName}! 👨‍🍳🍲 Para **cocinar rico, fácil y rápido en casa para ${peopleCount} personas** (~250g a 300g por porción), te propongo 3 platazos clásicos infalibles:\n\n` +
        `1️⃣ **Milanesas Caseras a la Napolitana o Fritas (Rinde ${peopleCount} platos abundantes):**\n` +
        `• ${familyMeatKg} kg de ${nalga.name} feteada fina ($${nalgaPrice.toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${nalgaPrice.toLocaleString('es-AR')}**\n\n` +
        `2️⃣ **Bifes a la Plancha o a la Criolla con Papas (Listo en 15 minutos):**\n` +
        `• ${bifeKg} kg de ${costeleta.name} (~${bifesCount} bifes) ($${bifePrice.toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${bifePrice.toLocaleString('es-AR')}**\n\n` +
        `3️⃣ **Pastel de Papa Tradicional o Guisito Carrero:**\n` +
        `• ${familyMeatKg} kg de ${molida.name} magra ($${picadaPrice.toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${picadaPrice.toLocaleString('es-AR')}**\n\n` +
        `👉 ¿Cuál de estas opciones te gustaría que te preparemos (*1*, *2* o *3*), o preferís otro corte para tu receta? 🙌 [[STAGE:proposal]]`;
    }

    // 2. Detección de Asados por número de personas / comensales
    const isAsadoConsultation = /(?:asesorame|asesoramiento|qu[eé]\s+me\s+recomendas|recomendas\s+para\s+asado|recomendás\s+para\s+asado|opciones\s+para\s+asado|cuanto\s+calculo|cuánto\s+calculo|calcular\s+asado|asado\s+para|asadito\s+para|un\s+asado|un\s+asadito|hacer\s+(?:un\s+)?asado|hacer\s+(?:un\s+)?asadito)/i.test(t) ||
      (/(?:asado|asadito|asadaso|asadazo|parrilla|parrillada|fuego|brasas)/i.test(t) && Boolean(peopleMatch));

    if (isAsadoConsultation) {
      // Cálculo: ~500g por persona para asado completo (carne + achura/embutido)
      const totalKg = Number((peopleCount * 0.5).toFixed(1));
      const meatKg = peopleCount <= 3 ? Number((totalKg * 0.75).toFixed(1)) : Math.max(1, Math.round(peopleCount * 0.35));
      const choriKg = peopleCount <= 3 ? Number((totalKg * 0.25).toFixed(1)) : Math.max(1, Math.round(peopleCount * 0.15));
      const choriUnits = Math.max(2, Math.round(choriKg * 8));

      const total1 = Math.round((meatKg * vacio.price) + (choriKg * chori.price));
      const meatGourmet1 = Number((meatKg * 0.6).toFixed(1));
      const meatGourmet2 = Number((meatKg * 0.4).toFixed(1));
      const total3 = Math.round((meatGourmet1 * tapaCuadril.price) + (meatGourmet2 * matambre.price) + (choriKg * chori.price));

      let option2Section = '';
      if (peopleCount <= 3) {
        const costillaKg = 1.0;
        const total2 = Math.round((costillaKg * 9800) + (choriKg * chori.price));
        option2Section = `2️⃣ **Opción Costillar & Chorizos:**\n` +
          `• 1.0 kg de Costillar / Asado de Tira ($9.800)\n` +
          `• ${choriUnits} Chorizos Criollos Puro Cerdo (~${choriKg} kg - $${Math.round(choriKg * chori.price).toLocaleString('es-AR')})\n` +
          `💰 *Total:* **$${total2.toLocaleString('es-AR')}**\n\n`;
      } else {
        const total2 = comboAsadazo.price + (peopleCount > 4 ? (peopleCount - 4) * vacio.price : 0);
        option2Section = `2️⃣ **Opción Combo “Asadazo” + Agregados:**\n` +
          `• 1 ${comboAsadazo.name} — $${comboAsadazo.price.toLocaleString('es-AR')}\n` +
          (peopleCount > 4 ? `• ${Math.max(1, peopleCount - 4)} kg adicional de Vacío / Costillar ($${((peopleCount - 4) * vacio.price).toLocaleString('es-AR')})\n` : '') +
          `💰 *Total:* **$${total2.toLocaleString('es-AR')}**\n\n`;
      }

      return `¡Qué lindo asado ${clientName}! 🔥🥩 Para **${peopleCount} personas** calculamos un promedio de **${totalKg} kg en total** (~500g por comensal bien servido):\n\n` +
        `1️⃣ **Opción Clásica (${totalKg} kg):**\n` +
        `• ${meatKg} kg de ${vacio.name} ($${Math.round(meatKg * vacio.price).toLocaleString('es-AR')})\n` +
        `• ${choriUnits} Chorizos Criollos Puro Cerdo (~${choriKg} kg - $${Math.round(choriKg * chori.price).toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${total1.toLocaleString('es-AR')}**\n\n` +
        option2Section +
        `3️⃣ **Opción Parrillera Gourmet:**\n` +
        `• ${meatGourmet1} kg de ${tapaCuadril.name} ($${Math.round(meatGourmet1 * tapaCuadril.price).toLocaleString('es-AR')})\n` +
        `• ${meatGourmet2} kg de ${matambre.name} ($${Math.round(meatGourmet2 * matambre.price).toLocaleString('es-AR')})\n` +
        `• ${choriUnits} Chorizos Criollos Puro Cerdo (~${choriKg} kg - $${Math.round(choriKg * chori.price).toLocaleString('es-AR')})\n` +
        `💰 *Total:* **$${total3.toLocaleString('es-AR')}**\n\n` +
        `💡 *Carbón opcional:* Si te hace falta para el fuego, tenemos bolsa de Carbón Quebracho a $${carbon.price.toLocaleString('es-AR')}. 🪵\n\n` +
        `👉 ¿Cuál de estas opciones te gusta más (*1*, *2* o *3*), o preferís armarlo con otros cortes a tu gusto? 🙌 [[STAGE:proposal]]`;
    }

    // 3. Detección de Milanesas
    if (/(?:milanesa|milanesas|milas|supremas|hacer milanesas)/i.test(t)) {
      return `¡De diez ${clientName}! 🥩 Para hacer las mejores **Milanesas**, te recomendamos nuestros cortes tiernos y sin grasa:\n\n` +
        `1️⃣ *${nalga.name}* ($${nalga.price.toLocaleString('es-AR')} / kg) — Feteada justa para milanesas tiernas.\n` +
        `2️⃣ *${peceto.name}* ($${peceto.price.toLocaleString('es-AR')} / kg) — Redonditas, parejas y súper tiernas.\n` +
        `3️⃣ *${suprema.name}* ($${suprema.price.toLocaleString('es-AR')} / kg) — Para milanesas de pollo jugosas.\n\n` +
        `👉 Decime cuántos kilos o qué opción te preparamos feteada para milanesas. 🙌 [[STAGE:proposal]]`;
    }

    // 4. Detección de Guisos, Estofados o Empanadas
    if (/(?:guiso|estofado|olla|locro|puchero|carbonada|empanadas|picada)/i.test(t)) {
      return `¡Excelente idea ${clientName}! 🍲 Para **guisos, estofados u olla**, estos son nuestros mejores cortes con todo el sabor:\n\n` +
        `1️⃣ *${osobuco.name}* ($${osobuco.price.toLocaleString('es-AR')} / kg) — Puro sabor con caracú para estofados y guisazos.\n` +
        `2️⃣ *${roastBeef.name}* ($${roastBeef.price.toLocaleString('es-AR')} / kg) — Carne magra ideal para cortar en cubitos.\n` +
        `3️⃣ *${molida.name}* ($${molida.price.toLocaleString('es-AR')} / kg) — Magra y fresca, ideal para empanadas o salsas.\n\n` +
        `👉 ¿Cuántos kilos te gustaría que te separemos? Respondé con el número o nombre del corte. 🥩 [[STAGE:proposal]]`;
    }

    // 5. Detección de Horno / Cocción Lenta
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
   * Muestra el estado del pedido activo o historial completo de compras del cliente
   */
  static handleOrderHistory(lead, clientName) {
    const jid = lead.jid || lead.id || lead;
    const allOrders = db.getOrdersByJid(jid) || [];
    const activeOrder = db.getActiveOrdersByJid(jid)[0] || allOrders.find(o => ['pending', 'preparing', 'in_transit', 'ready_for_pickup', 'ready'].includes(o.status));

    const formatStatus = (st) => {
      switch (st) {
        case 'pending': return '⏳ En espera de preparación';
        case 'preparing': return '🥩 En preparación en carnicería';
        case 'in_transit': return '🛵 En camino con repartidor';
        case 'ready':
        case 'ready_for_pickup': return '🎉 Listo para retirar en sucursal';
        case 'delivered': return '✅ Entregado con éxito';
        case 'cancelled': return '❌ Cancelado';
        default: return st;
      }
    };

    // 1. Si tiene un pedido activo en curso
    if (activeOrder) {
      const itemsText = Array.isArray(activeOrder.items) ? activeOrder.items.join('\n') : (activeOrder.items || 'Cortes seleccionados');
      const orderId = activeOrder.id.replace(/^ord-/i, '');
      const deliveryInfo = activeOrder.deliveryType === 'delivery' 
        ? `🛵 **Envío a Domicilio:** ${activeOrder.address || lead.address || 'Dirección registrada'}`
        : `🏪 **Retiro por Sucursal:** ${activeOrder.branch || lead.preferredBranch || 'Sucursal Urca Central'}`;

      return `¡Hola ${clientName}! 📋 Acá tenés el estado de tu pedido en curso:\n\n` +
        `📌 **Pedido #${orderId}** — ${formatStatus(activeOrder.status)}\n` +
        `🥩 *Cortes en preparación:*\n` +
        `${itemsText}\n\n` +
        `💰 *Total estimado:* **$${Number(activeOrder.totalAmount).toLocaleString('es-AR')}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variación según el pesaje exacto final en balanza).*\n\n` +
        `${deliveryInfo}\n` +
        `💳 **Medio de pago:** ${activeOrder.paymentMethod || 'A convenir'}\n\n` +
        `👉 **¿Precisás algo más?** Podés sumar cortes extra para despacharlo todo junto, modificar algún dato o consultar la entrega. ¡Estoy a tu disposición! 🥩🚚`;
    }

    // 2. Si no tiene pedido confirmado pero tenía borrador en memoria
    if (lead?.draftCart && Array.isArray(lead.draftCart.items) && lead.draftCart.items.length > 0) {
      return `¡Hola ${clientName}! 👋 En este momento no tenés ningún pedido confirmado en preparación, pero teníamos anotado en borrador tu pedido de:\n\n` +
        `📋 *Detalle en borrador (precios por kilo según corte):*\n` +
        `${lead.draftCart.items.join('\n')}\n\n` +
        `💰 *Total estimado:* **$${Number(lead.draftCart.total).toLocaleString('es-AR')}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variación según el pesaje exacto final en balanza).*\n\n` +
        `👉 ¿Querés que confirmemos estos datos y te lo preparemos para hoy? 🥩🚚 [[STAGE:proposal]]`;
    }

    // 3. Si no tiene pedidos activos pero tiene compras anteriores registradas
    if (allOrders.length > 0) {
      const lastOrd = allOrders[0];
      const itemsSummary = Array.isArray(lastOrd.items) ? lastOrd.items.slice(0, 2).join(', ') : lastOrd.items;
      const dateStr = lastOrd.createdAt ? new Date(lastOrd.createdAt).toLocaleDateString('es-AR') : 'Reciente';

      return `¡Hola ${clientName}! 👋 Revisé en el sistema y en este momento **no tenés ningún pedido pendiente ni activo en curso**.\n\n` +
        `📜 Tu última compra registrada fue el **Pedido #${lastOrd.id}** (${dateStr}) por **$${Number(lastOrd.totalAmount).toLocaleString('es-AR')}** (${itemsSummary}).\n\n` +
        `👉 ¿Te gustaría repetir alguno de esos cortes o armamos un nuevo pedido con las ofertas frescas del día? 🥩🔥 [[STAGE:proposal]]`;
    }

    // 4. Si no registra ningún pedido
    return `¡Hola ${clientName}! 👋 Estuve revisando en el sistema y en este momento **no tenés ningún pedido pendiente ni activo a tu nombre**.\n\n` +
      `🥩 ¡Hoy es un excelente momento para armar tu pedido! Tenemos novillito pesado de primera selección, embutidos caseros y combos parrilleros con envíos en el día a todo Córdoba.\n\n` +
      `👉 Contame: ¿qué cortes te gustaría que te preparemos para hoy o para cuántas personas estás calculando? 🛵🥩 [[STAGE:proposal]]`;
  }

  /**
   * Responde cortésmente a dudas y preguntas del cliente, resolviendo su inquietud y reenganchando al flujo de venta
   */
  static handleOutOfFlow(text, clientName, lead) {
    const t = (text || '').toLowerCase().trim();

    // 1. CONSULTAS DE PEDIDOS / ESTADO / PENDIENTES
    const isOrderQuery = /(?:que|qué|cuales|cuáles|tengo|hay)\s+(?:mis\s+|el\s+|alg[uú]n\s+)?(?:pedidos?|compras?|ordenes?|órdenes?).*(?:pendiente|activos?|en curso|tengo|hice|anotado|guardado|listo)/i.test(t) ||
      /(?:consultar|ver|estado|seguimiento|donde est[aá]|dónde est[aá]|cuando llega|a que hora llega|como va|mis|mi)\s+(?:de\s+mi\s+|el\s+)?(?:pedidos?|compras?|ordenes?|órdenes?|env[ií]o|despacho)/i.test(t) ||
      /(?:que|qué)\s+(?:pedidos?\s+tengo|tengo\s+pedid[oa]|te\s+ped[ií]|ped[ií]|tengo\s+pendiente)/i.test(t) ||
      /^(?:mis pedidos|mi pedido|estado del pedido|pedido pendiente|pedidos pendientes|ver pedido|ver orden)$/i.test(t);

    if (isOrderQuery) {
      return this.handleOrderHistory(lead, clientName);
    }

    // 2. CONSULTAS DE MEDIOS DE PAGO Y FACTURACIÓN
    if (/(?:medios?\s+de\s+pago|formas?\s+de\s+pago|como\s+(?:puedo|se)\s+paga|c[oó]mo\s+(?:puedo|se)\s+paga|tarjeta|d[eé]bito|cr[eé]dito|transferencia|mercado\s*pago|mp|qr|factura\s+[ab]|hacen\s+factura)/i.test(t)) {
      return `¡Hola ${clientName}! 💳 En **República de la Carne** trabajamos con todos los medios de pago para tu comodidad:\n\n` +
        `1️⃣ **Efectivo contraentrega:** Abonás al recibir en tu domicilio o al retirar por sucursal.\n` +
        `2️⃣ **Transferencia bancaria directa:** Alias oficial: \`republica.carne.mp\`\n` +
        `3️⃣ **Mercado Pago (Link o QR):** Aceptamos dinero en cuenta, tarjetas de débito y crédito.\n` +
        `🧾 *Emitimos Factura A y B según lo que precises.*\n\n` +
        `👉 ¿Te gustaría que te preparemos un pedido y te pasamos el total para abonar con el medio que prefieras? 🥩🚚 [[STAGE:proposal]]`;
    }

    // 3. CONSULTAS DE ENVÍOS, DEMORA Y COBERTURA
    if (/(?:env[ií]os?|delivery|reparto|cadete|cobertura|llegan\s+a|hacen\s+env[ií]os?|cuanto\s+(?:tarda|demora)|costo\s+de\s+env[ií]o|cuanto\s+sale\s+el\s+env[ií]o)/i.test(t)) {
      return `¡Hola ${clientName}! 🛵 **¡Sí, hacemos envíos directos en el día a todo Córdoba Capital y Gran Córdoba!**\n\n` +
        `• **Cobertura:** Urca, Cerro de las Rosas, Alto Tejeda, Villa Allende, San Isidro, Duarte Quirós, Alta Córdoba, Nueva Córdoba, General Paz, Centro y alrededores.\n` +
        `• **Cadena de frío:** Repartos en vehículos acondicionados para que la carne llegue fresca y perfecta.\n` +
        `• **Horarios de entrega:** Coordinamos en la franja horaria que te quede más cómoda.\n\n` +
        `👉 ¿A qué zona o dirección te gustaría que te lo llevemos y qué cortes te vamos preparando? 🥩🔥 [[STAGE:proposal]]`;
    }

    // 4. CONSULTAS DE CALIDAD, PROCEDENCIA Y CORTE PERSONALIZADO
    if (/(?:qu[eé]\s+calidad|es\s+novillito|es\s+ternera|es\s+buena|terneza|de\s+d[oó]nde\s+es|envasado|al\s+vac[ií]o|fresco|cortan\s+grueso|corte\s+a\s+pedido)/i.test(t)) {
      return `¡Excelente pregunta ${clientName}! 🥩 En **República de la Carne** trabajamos exclusivamente **hacienda pesada seleccionada de exportación** (novillito y cerdo de primera calidad).\n\n` +
        `• **Cortes frescos del día:** Despostados en nuestras plantas bajo estrictos controles sanitarios.\n` +
        `• **Grosor a gusto:** Te preparamos los cortes finos, medianos o corte grueso parrillero a tu gusto.\n` +
        `• **Envasado al vacío:** Disponible para conservar máxima terneza, jugosidad y vida útil.\n\n` +
        `👉 ¿Qué cortes te gustaría probar hoy? Tenemos vacío, costillar, bife de chorizo, entraña y achuras de primera. 🙌 [[STAGE:proposal]]`;
    }

    // 5. CONTACTO HUMANO / OPERADOR TELEFÓNICO
    if (/(?:humano|operador|persona|hablar\s+con\s+alguien|telefono|tel[eé]fono|llamar|contacto\s+directo)/i.test(t)) {
      return `¡Por supuesto ${clientName}! 👋 Podés comunicarte directamente con nuestro equipo de atención humana al 📞 **+54 9 3513 906947** (Sucursal Urca Central).\n\n` +
        `Igual estoy acá para asesorarte, tomar tu pedido y responder cualquier duda técnica de cortes o precios al instante.\n\n` +
        `👉 ¿Querés que te preparemos algún corte o precisás consultar sobre alguna sucursal? 🥩`;
    }

    // 6. AGRADECIMIENTOS Y CIERRES POSITIVOS
    if (/(?:muchas\s+gracias|gracias|buen[ií]simo|espectacular|joya|de\s+diez|genial|perfecto|mil\s+gracias)/i.test(t)) {
      return `¡De diez ${clientName}! Un gustazo darte una mano. 🙌🥩\n\n` +
        `¿Querés que te separemos algún corte para hoy o precisás consultar algo más del catálogo? 🛵🔥`;
    }

    // 7. CHARLA CASUAL (CLIMA, FÚTBOL, IDENTIDAD, CHISTES) + REENGANCHE CORDIAL
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

    const activeOrder = db.getActiveOrdersByJid(lead.jid || lead.id || lead)[0] || null;
    if (activeOrder && activeOrder.status === 'in_transit') {
      return `${smalltalkAck}\n\n` +
        `Te comento que tu pedido **#${activeOrder.id}** está en camino con el repartidor. 🛵🥩 ¡Cualquier duda acá estoy! 🙌`;
    }

    return `${smalltalkAck}\n\n` +
      `Contame, ¿tenías ganas de prender el fuego para un asadito o buscás cortes para cocinar en casa? Hacemos envíos directos en el día a todo Córdoba. 🛵🥩 ¿En qué te puedo dar una mano hoy? 🙌 [[STAGE:proposal]]`;
  }
}
