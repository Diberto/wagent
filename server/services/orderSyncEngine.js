import { db, parseArgentinePrice } from './database.js';
import { extractCleanAddress, isGarbageAddress } from './ai.js';

/**
 * Motor Inteligente de Sincronización y Registro de Pedidos en Vivo
 * Parsea los items DESDE EL REPLY DEL AGENTE (fuente de verdad conversacional)
 * y los valida/enriquece contra el catálogo real de la base de datos.
 * NUNCA usa precios ni ítems hardcodeados ni infla decimales argentinos.
 */
export class OrderSyncEngine {
  /**
   * Procesa un turno de conversación y sincroniza el estado del pedido
   */
  static syncOrderFromTurn({
    jid = '',
    lead = null,
    customerText = '',
    aiReplyText = '',
    products = null,
    stage = null
  }) {
    try {
      // Catálogo siempre desde la base de datos real
      const catalog = (Array.isArray(products) && products.length > 0)
        ? products
        : (db.getProducts() || []);

      const userMsg = String(customerText || '').toLowerCase().trim();
      const replyMsg = String(aiReplyText || '');
      const clientLead = lead || (jid ? db.getLead(jid) : null) || {};
      const clientName = clientLead.pushName || clientLead.name || 'Cliente';
      const clientPhone = clientLead.phone || (jid && !jid.includes('@lid') ? `+${jid.split('@')[0]}` : '');
      const clientJid = jid || clientLead.jid || clientLead.id || '';

      if (!clientJid && !clientPhone) return null;

      // 1. Detección de Cancelación de Pedido
      const isCancelIntent = /(?:cancelar|cancelo|cancelame|anular|anula|anulame|no quiero el pedido|ya no quiero el pedido|no voy a querer nada)/i.test(userMsg);
      if (isCancelIntent) {
        const activeOrders = db.getActiveOrdersByJid(clientJid);
        if (activeOrders.length > 0) {
          activeOrders.forEach(o => db.updateOrderStatus(o.id, 'cancelled'));
        }
        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, { draftCart: null, currentOrder: null });
        }
        return null;
      }

      // 1.1 Detección de Consulta de Estado de Pedido (Anti-Duplicación Omnicanal)
      // Si el cliente sólo está consultando cómo va su pedido web, POS o WhatsApp, NO duplicar ni modificar
      const isStatusInquiryIntent = /(?:c[oó]mo va|a qu[eé] hora|cu[aá]ndo llega|d[oó]nde est[aá]|ya sali[oó]|estado de mi pedido|mi pedido|pedido de la web|pedido web|pedido pos|hice un pedido|consultar pedido|qu[eé] pas[oó] con mi pedido)/i.test(userMsg);
      const existingActiveOrder = db.getActiveOrdersByJid(clientJid)[0] || null;
      if (isStatusInquiryIntent && existingActiveOrder) {
        return existingActiveOrder;
      }

      // 2. Parsear items DESDE EL REPLY DEL AGENTE (es la fuente de verdad conversacional)
      //    El agente ya confirmó los cortes con precios reales del catálogo
      let { items: itemsToOrder, products: productsToOrder, total: totalAmountToOrder }
        = this.extractItemsFromAgentReply(replyMsg, catalog);

      // Si el agente no mencionó items en el detalle, intentar extraer del texto del cliente
      if (itemsToOrder.length === 0) {
        const fromUser = this.extractProductsFromText(userMsg, catalog);
        itemsToOrder = fromUser.items;
        productsToOrder = fromUser.products;
        totalAmountToOrder = fromUser.total;
      }

      // 3. Buscar si ya existe una orden activa (pending o preparing o draft) para este JID
      let activeOrder = db.getActiveOrdersByJid(clientJid)[0] || null;

      // 4. Detección de Dirección física para delivery con protección anti-conversación
      let cleanAddr = extractCleanAddress(userMsg);
      if (!cleanAddr && replyMsg) {
        // 1. Buscar línea explícita de Dirección en el reply del bot: "* Dirección: Roque Funes 1704, Córdoba." o "🏠 Dirección: ..."
        const lineMatch = replyMsg.match(/(?:🏠\s*)?\*?\s*Direcci[oó]n(?:\s+de\s+entrega)?:\*?\s*([^\n\r]+)/i);
        if (lineMatch && lineMatch[1]) {
          const candidate = lineMatch[1].replace(/^[*(:\s]+|[)*:\s]+$/g, '').trim();
          cleanAddr = extractCleanAddress(candidate);
        }

        // 2. Mención en el saludo / introducción: "agendado tu envío a *Roque Funes 1704*"
        if (!cleanAddr) {
          const introMatch = replyMsg.match(/(?:env[ií]o|agendado|entrega)(?:\s+a|\s+en)\s+\*?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s,]+?)\*?(?:\.|\n|$)/i);
          if (introMatch && introMatch[1]) {
            cleanAddr = extractCleanAddress(introMatch[1].trim());
          }
        }
      }
      if (!cleanAddr) {
        if (activeOrder?.address && !isGarbageAddress(activeOrder.address) && activeOrder.address.toLowerCase() !== 'a convenir') {
          cleanAddr = activeOrder.address;
        } else if (clientLead?.address && !isGarbageAddress(clientLead.address) && clientLead.address.toLowerCase() !== 'a convenir') {
          cleanAddr = clientLead.address;
        }
      }

      // 5. Detección de Sucursal para retiro
      const isBranchPickup = /(?:sucursal|retiro|pasar a buscar|retiro por|urca|pidal|tejeda|intercountry|alamos|quiros|allende|san isidro)/i.test(userMsg);
      let branchName = activeOrder?.branch || clientLead?.preferredBranch || '';
      let deliveryType = activeOrder?.deliveryType || clientLead?.deliveryType || (isBranchPickup ? 'pickup' : 'delivery');

      if (isBranchPickup) {
        deliveryType = 'pickup';
        const branches = db.getBranches() || [];
        let matchedBranch = branches.find(b =>
          b.name && userMsg.includes(b.name.toLowerCase().split(' ')[0].toLowerCase())
        );
        branchName = matchedBranch?.name || 'URCA CENTRAL';
        if (!matchedBranch) {
          if (/pidal|tejeda|urca 2/i.test(userMsg)) branchName = 'URCA 2 – ALTO TEJEDA';
          else if (/intercountry|alamos|corteza/i.test(userMsg)) branchName = 'INTERCOUNTRY – CORTEZA MALL';
          else if (/quiros|duarte/i.test(userMsg)) branchName = 'DUARTE QUIRÓS';
          else if (/allende|figueroa|mercadito/i.test(userMsg)) branchName = 'VILLA ALLENDE';
          else if (/san isidro|luchesse/i.test(userMsg)) branchName = 'COUNTRY SAN ISIDRO';
        }
      } else if (cleanAddr) {
        deliveryType = 'delivery';
      }

      // 6. Detección de Medio de Pago
      let paymentMethod = activeOrder?.paymentMethod || 'Efectivo contraentrega';
      if (/(?:efectivo|transferencia|mercado pago|mp|alias)/i.test(userMsg)) {
        if (/transferencia|alias/i.test(userMsg)) paymentMethod = 'Transferencia';
        else if (/mercado pago|mp/i.test(userMsg)) paymentMethod = 'Mercado Pago';
        else paymentMethod = 'Efectivo';
      }

      // 7. Si se detectaron ítems, crear o actualizar la orden
      if (itemsToOrder.length > 0) {
        if (activeOrder && ['pending', 'preparing', 'draft'].includes(activeOrder.status)) {
          // Actualizar orden existente con los items confirmados por el agente
          activeOrder = db.updateOrder(activeOrder.id, {
            items: itemsToOrder,
            products: productsToOrder.length > 0 ? productsToOrder : activeOrder.products,
            totalAmount: totalAmountToOrder > 0 ? totalAmountToOrder : activeOrder.totalAmount,
            deliveryType,
            address: cleanAddr || activeOrder.address || '',
            branch: branchName || activeOrder.branch || '',
            paymentMethod,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Crear nueva orden
          activeOrder = db.createOrder({
            jid: clientJid,
            phone: clientPhone,
            customerName: clientName,
            items: itemsToOrder,
            products: productsToOrder,
            totalAmount: totalAmountToOrder,
            status: 'pending',
            channel: 'WHATSAPP',
            source: 'WHATSAPP',
            origin: 'WHATSAPP',
            deliveryType,
            address: cleanAddr || '',
            branch: branchName || '',
            paymentMethod
          });
        }

        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, {
            currentOrder: activeOrder.id,
            lastOrderId: activeOrder.id,
            stage: stage || 'proposal',
            address: cleanAddr || clientLead.address,
            deliveryType,
            preferredBranch: branchName || clientLead.preferredBranch
          });
        }
      } else if (activeOrder) {
        // Aunque no hayan cambiado los items en este turno (ej: cliente solo dijo la dirección o el pago),
        // actualizar dirección, sucursal o pago en la orden activa
        const updates = {};
        if (cleanAddr && cleanAddr !== activeOrder.address) updates.address = cleanAddr;
        if (branchName && branchName !== activeOrder.branch) updates.branch = branchName;
        if (deliveryType && deliveryType !== activeOrder.deliveryType) updates.deliveryType = deliveryType;
        if (paymentMethod && paymentMethod !== activeOrder.paymentMethod) updates.paymentMethod = paymentMethod;

        if (Object.keys(updates).length > 0) {
          activeOrder = db.updateOrder(activeOrder.id, updates);
        }
      }

      return activeOrder;
    } catch (err) {
      console.error('⚠️ [OrderSyncEngine] Error sincronizando pedido:', err);
      return null;
    }
  }

  /**
   * Parsea los ítems directamente desde el resumen del agente.
   * Soporta tanto formato clásico:
   *   "• 1,5 kg de ASADO SURTIDO PREMIUM ($11.987/kg) → *$17.980,50*"
   * como formato estructurado con dos puntos:
   *   "* *Costilla:* 1,2 kg — *$26.999/kg*"
   *   "* *Matambrito de Cerdo (Entrecot):* 0,5 kg — *$10.890/kg*"
   *   "* *Chorizo de Cerdo:* 4 unidades — *$14.760/kg*"
   *   "* *Carbón:* 1 bolsa (4kg Flamar) — *$3.600/un*"
   */
  static extractItemsFromAgentReply(replyMsg, catalog) {
    const items = [];
    const products = [];
    let total = 0;

    if (!replyMsg) return { items, products, total };

    const lines = replyMsg.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('*') && !line.startsWith('•') && !line.startsWith('-')) continue;

      let clean = line.replace(/^[\s•*\-]+/, '').trim();
      if (!clean || /detalle|total|opciones|respondé|cómo seguimos|paso\b|recordamos|nota:/i.test(clean)) continue;

      let nameCandidate = '';
      let qtyStr = '';
      let priceStr = '';
      let subtotal = 0;
      let unitPrice = 0;
      let isPerUnit = false;

      // PATRÓN 1: Formato "Nombre: Cantidad [Unidad] — Precio"
      // Ej: "*Costilla:* 1,2 kg — *$26.999/kg*"
      // Ej: "*Matambrito de Cerdo (Entrecot):* 0,5 kg — *$10.890/kg*"
      const colonFormatMatch = clean.match(/^[*_"]?([^*_":]+(?:\([^)]+\))?)[*_"]?\s*:\s*(.+)$/i);

      if (colonFormatMatch && !/(?:direcci[oó]n|modalidad|forma de pago|pago|sucursal|entrega|horario)/i.test(colonFormatMatch[1])) {
        nameCandidate = colonFormatMatch[1].trim();
        const rest = colonFormatMatch[2].trim();

        const dashSplit = rest.split(/(?:—|->|→)\s*/);
        if (dashSplit.length >= 2) {
          qtyStr = dashSplit[0].trim();
          priceStr = dashSplit.slice(1).join('—').trim();
        } else {
          qtyStr = rest;
        }
      } else {
        // PATRÓN 2: Formato clásico "Cantidad [Unidad] [de] Nombre [PrecioUnitario] [→ Subtotal]"
        const arrowMatch = clean.match(/(?:→|->|—)\s*\*?\$?\s*([\d\.,]+(?:\/\w+)?)\s*\*?\s*$/i);
        let textBeforePrice = clean;
        if (arrowMatch) {
          priceStr = arrowMatch[1];
          textBeforePrice = clean.substring(0, arrowMatch.index).trim();
        }

        const unitPriceMatch = textBeforePrice.match(/\(\s*\$?\s*([\d\.,]+)\s*\/\s*(?:kg|kilo|un|unidad|bolsa|botella|combo|u)\s*\)/i);
        if (unitPriceMatch) {
          priceStr = priceStr || unitPriceMatch[0];
          textBeforePrice = textBeforePrice.replace(unitPriceMatch[0], '').trim();
        }

        const qtyMatch = textBeforePrice.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\b|X\b|kg|kilos?|unidades?|un\b|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\s*(?:de\s+)?/i);
        if (qtyMatch) {
          qtyStr = qtyMatch[0];
          nameCandidate = textBeforePrice.slice(qtyMatch[0].length).trim();
        } else {
          nameCandidate = textBeforePrice;
        }
      }

      if (!nameCandidate) continue;

      // Parsear Cantidad y Unidad
      let qty = 1;
      let unit = 'kg';
      let isUnitMode = false;
      let unitCount = 0;

      const qtyNumMatch = qtyStr.match(/(\d+(?:[.,]\d+)?)/);
      if (qtyNumMatch) {
        qty = parseFloat(qtyNumMatch[1].replace(',', '.'));
      }

      const lowerQty = qtyStr.toLowerCase();
      if (/unidades?|un\b|u\b/.test(lowerQty)) {
        unit = 'un';
        isUnitMode = true;
        unitCount = Math.round(qty);
      } else if (/k/.test(lowerQty)) {
        unit = 'kg';
      } else if (/bols/.test(lowerQty)) {
        unit = 'bolsa';
        isUnitMode = true;
        unitCount = Math.round(qty);
      } else if (/bot/.test(lowerQty)) {
        unit = 'botella';
        isUnitMode = true;
        unitCount = Math.round(qty);
      } else if (/comb/.test(lowerQty)) {
        unit = 'combo';
        isUnitMode = true;
        unitCount = Math.round(qty);
      }

      // Parsear Precio
      if (priceStr) {
        isPerUnit = /\/(?:kg|kilo|un|unidad|bolsa|botella|combo|u)/i.test(priceStr);
        const parsedNum = parseArgentinePrice(priceStr);
        if (isPerUnit) {
          unitPrice = parsedNum;
        } else {
          subtotal = parsedNum;
        }
      }

      // Limpieza de nombre
      let cleanName = nameCandidate
        .replace(/^[*_"]+|[*_":]+$/g, '')
        .replace(/^[xX]\s+/i, '')
        .replace(/^(?:de|unidades?|un|bolsas?|kilos?|kg)\s+de\s+/i, '')
        .replace(/^de\s+/i, '')
        .trim();

      if (!cleanName) continue;

      // Vincular con catálogo real
      const catalogProduct = this.matchCatalogProduct(cleanName, catalog);
      const catalogPrice = catalogProduct ? Number(catalogProduct.price) : 0;
      const effectiveUnitPrice = unitPrice > 0 ? unitPrice : catalogPrice;

      if (subtotal <= 0 && effectiveUnitPrice > 0) {
        if (isUnitMode && (catalogProduct?.unit === 'kg' || unit === 'un')) {
          const unitsPerKg = catalogProduct?.unitsPerKg || 8;
          const estimatedKg = Number((qty / unitsPerKg).toFixed(3));
          subtotal = Math.round(estimatedKg * effectiveUnitPrice);
        } else {
          subtotal = Math.round(qty * effectiveUnitPrice);
        }
      }

      if (subtotal <= 0) continue;

      let finalQuantity = qty;
      let finalUnit = catalogProduct?.unit || unit;
      let finalUnitPrice = effectiveUnitPrice;

      if (isUnitMode && catalogProduct?.unit === 'kg') {
        const unitsPerKg = catalogProduct?.unitsPerKg || 8;
        finalQuantity = Number((qty / unitsPerKg).toFixed(3));
        finalUnit = 'kg';
        finalUnitPrice = effectiveUnitPrice;
      } else {
        finalUnitPrice = qty > 0 ? Math.round(subtotal / qty) : subtotal;
      }

      const productEntry = {
        id: catalogProduct?.id || `prod_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        plu: catalogProduct?.plu || '',
        barcode: catalogProduct?.barcode || '',
        category: catalogProduct?.category || 'Carnicería',
        name: catalogProduct?.name || cleanName,
        price: finalUnitPrice,
        unitPrice: finalUnitPrice,
        quantity: finalQuantity,
        unit: finalUnit,
        isUnitMode: isUnitMode,
        unitCount: isUnitMode ? qty : 0,
        subtotal: subtotal
      };

      products.push(productEntry);
      if (isUnitMode && unitCount > 0) {
        items.push(`• ${unitCount} Unidades de ${productEntry.name} — $${subtotal.toLocaleString('es-AR')}`);
      } else {
        items.push(`• ${finalQuantity} ${productEntry.unit} ${productEntry.name} — $${subtotal.toLocaleString('es-AR')}`);
      }
      total += subtotal;
    }

    // Si hay total general explícito en el texto del mensaje
    const totalMatch = replyMsg.match(/(?:total[^:\n]*|total estimado|total acumulado estimado)[:\s]*\*?\$?\s*([\d.,]+)/i);
    if (totalMatch) {
      const explicitTotal = parseArgentinePrice(totalMatch[1]);
      if (explicitTotal > 0) {
        total = explicitTotal;
      }
    }

    return { items, products, total };
  }

  /**
   * Busca el mejor producto del catálogo real por similitud de nombre.
   * Retorna null si no encuentra match suficientemente bueno.
   */
  static matchCatalogProduct(name, catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) return null;
    const clean = name.toLowerCase().trim();

    // 1. Exact match primero
    let found = catalog.find(p => (p.name || '').toLowerCase().trim() === clean);
    if (found) return found;

    // 2. Coincidencia sin notas entre paréntesis (ej: "Matambrito de Cerdo (Entrecot)" -> "Matambrito de Cerdo")
    const withoutParens = clean.replace(/\([^)]*\)/g, '').trim();
    if (withoutParens && withoutParens !== clean) {
      found = catalog.find(p => (p.name || '').toLowerCase().trim() === withoutParens);
      if (found) return found;
    }

    // 3. Includes match
    found = catalog.find(p => (p.name || '').toLowerCase().includes(clean) || clean.includes((p.name || '').toLowerCase()));
    if (found) return found;

    if (withoutParens) {
      found = catalog.find(p => (p.name || '').toLowerCase().includes(withoutParens) || withoutParens.includes((p.name || '').toLowerCase()));
      if (found) return found;
    }

    // 4. Partial word match (score >= 60%)
    let bestScore = 0;
    let bestProd = null;
    const cleanWords = (withoutParens || clean).split(/\s+/).filter(w => w.length > 2);
    for (const prod of catalog) {
      const prodName = (prod.name || '').toLowerCase();
      const prodWords = prodName.split(/\s+/).filter(w => w.length > 2);
      if (cleanWords.length === 0 || prodWords.length === 0) continue;
      const matchCount = cleanWords.filter(w => prodName.includes(w)).length;
      const score = matchCount / Math.max(cleanWords.length, 1);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestProd = prod;
      }
    }
    return bestProd;
  }

  /**
   * Parser de productos desde el texto del cliente (fallback cuando el agente
   * no incluyó detalle en su respuesta).
   * Lee SOLO desde el catálogo real de la DB, sin hardcodes.
   */
  static extractProductsFromText(text, catalog) {
    const products = [];
    const items = [];
    let total = 0;

    if (!Array.isArray(catalog) || catalog.length === 0 || !text || typeof text !== 'string') {
      return { products, items, total };
    }

    const lowerText = text.toLowerCase().trim();

    // Si el texto es claramente una dirección, selección de entrega o medio de pago sin mención de carne, no extraer
    const isPureAddressOrPayment = /(?:calle|av\.|avenida|bv\.|roque funes|locelso|pidal|quiros|alamos|alcorta|casa|domicilio|efectivo|transferencia|mercado pago|alias)\b/i.test(lowerText) &&
      !/(?:kilo|kilos|kg|costilla|vacio|vacío|chori|morcilla|matambre|milanesa|carne|pollo|bife|tapa|cuadril|entraña|molida|achura)\b/i.test(lowerText);

    if (isPureAddressOrPayment) {
      return { products, items, total };
    }

    for (const prod of catalog) {
      if (!prod || prod.isAvailable === false || Number(prod.price) <= 1) continue;
      const prodName = (prod.name || '').toLowerCase().trim();
      if (prodName.length < 3) continue;

      // Un PLU solo se considera si el usuario puso expresamente "plu 123" o "código 123"
      const hasExplicitPlu = prod.plu && new RegExp(`\\b(?:plu|c[oó]digo|cod\\.?)\\s*[:=]?\\s*${prod.plu}\\b`, 'i').test(lowerText);

      // El nombre del corte debe coincidir con límites de palabras completas
      const escapedName = prodName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const hasNameMatch = new RegExp(`\\b${escapedName}\\b`, 'i').test(lowerText);

      const isMentioned = hasExplicitPlu || hasNameMatch;

      if (isMentioned) {
        const qtyRegex = new RegExp(`(\\d+(?:[\\.,]\\d+)?)\\s*(?:kg|kilos?|unidades?|un|bolsas?|botellas?|combos?|piezas?)?\\s+(?:de\\s+)?(?:${escapedName})`, 'i');
        const match = text.match(qtyRegex);
        const quantity = match ? parseFloat(match[1].replace(',', '.')) : 1;
        const unitPrice = Number(prod.price) || 0;
        const subtotal = Math.round(unitPrice * quantity);

        products.push({
          id: prod.id || `prod_${prod.plu || Math.random().toString(36).substr(2, 5)}`,
          plu: prod.plu || '',
          name: prod.name,
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: quantity,
          unit: prod.unit || 'kg',
          subtotal: subtotal
        });

        items.push(`• ${quantity} ${prod.unit || 'kg'} ${prod.name} — $${subtotal.toLocaleString('es-AR')}`);
        total += subtotal;
      }
    }

    return { products, items, total };
  }
}
