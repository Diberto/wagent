import { db } from './database.js';

/**
 * Motor Inteligente de Sincronización y Registro de Pedidos en Vivo
 * Parsea los items DESDE EL REPLY DEL AGENTE (fuente de verdad conversacional)
 * y los valida/enriquece contra el catálogo real de la base de datos.
 * NUNCA usa precios ni ítems hardcodeados.
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

      // 3. Buscar si ya existe una orden activa (pending o preparing) para este JID
      let activeOrder = db.getActiveOrdersByJid(clientJid)[0] || null;

      // 4. Si se detectaron ítems, crear o actualizar la orden
      if (itemsToOrder.length > 0) {
        if (activeOrder && ['pending', 'preparing', 'draft'].includes(activeOrder.status)) {
          // Actualizar orden existente con los items confirmados por el agente
          activeOrder = db.updateOrder(activeOrder.id, {
            items: itemsToOrder,
            products: productsToOrder.length > 0 ? productsToOrder : activeOrder.products,
            totalAmount: totalAmountToOrder > 0 ? totalAmountToOrder : activeOrder.totalAmount,
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
            deliveryType: clientLead.deliveryType || 'delivery',
            address: clientLead.address || '',
            branch: clientLead.preferredBranch || ''
          });
        }

        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, {
            currentOrder: activeOrder.id,
            lastOrderId: activeOrder.id,
            stage: stage || 'proposal'
          });
        }
      }

      // 5. Detección de Dirección física para delivery
      // Patrón mejorado: captura "Roque Funes 1704", "Av. Colón 234", etc.
      const addressPatterns = [
        /(?:direcci[oó]n[:\s]+|enviar\s+a[:\s]+|mandamelo\s+a[:\s]+|a\s+mi\s+domicilio[:\s]+|entrega\s+en[:\s]+)([^.\n]{5,60})/i,
        /(?:calle|av\.|avenida|bv\.|bulevar|pasaje|ruta)\s+([a-zA-ZñÑáéíóúÁÉÍÓÚ\s\.]+\s+\d{1,5}[a-z]?(?:\s*[-,]\s*[a-zA-Z\s]+)?)/i,
        /\b([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:\s+[a-záéíóúñA-ZÁÉÍÓÚ]+){0,4}\s+\d{3,5})\b/
      ];
      for (const pat of addressPatterns) {
        const m = replyMsg.match(pat) || userMsg.match(pat);
        if (m && activeOrder) {
          const extractedAddress = (m[1] || m[0]).replace(/^(calle|av\.|avenida|bv\.)\s*/i, '').trim();
          if (extractedAddress.length > 5) {
            db.updateOrder(activeOrder.id, { address: extractedAddress, deliveryType: 'delivery' });
            if (clientLead.jid || clientLead.id) {
              db.updateLead(clientLead.jid || clientLead.id, { address: extractedAddress, deliveryType: 'delivery' });
            }
          }
          break;
        }
      }

      // 6. Detección de Sucursal para retiro
      const isBranchPickup = /(?:sucursal|retiro|pasar a buscar|retiro por|urca|pidal|tejeda|intercountry|alamos|quiros|allende|san isidro)/i.test(userMsg);
      if (isBranchPickup && activeOrder) {
        const branches = db.getBranches() || [];
        let matchedBranch = branches.find(b =>
          b.name && userMsg.includes(b.name.toLowerCase().split(' ')[0].toLowerCase())
        );
        let branchName = matchedBranch?.name || 'URCA CENTRAL';
        if (!matchedBranch) {
          if (/pidal|tejeda|urca 2/i.test(userMsg)) branchName = 'URCA 2 – ALTO TEJEDA';
          else if (/intercountry|alamos|corteza/i.test(userMsg)) branchName = 'INTERCOUNTRY – CORTEZA MALL';
          else if (/quiros|duarte/i.test(userMsg)) branchName = 'DUARTE QUIRÓS';
          else if (/allende|figueroa|mercadito/i.test(userMsg)) branchName = 'VILLA ALLENDE';
          else if (/san isidro|luchesse/i.test(userMsg)) branchName = 'COUNTRY SAN ISIDRO';
        }
        db.updateOrder(activeOrder.id, { branch: branchName, deliveryType: 'pickup' });
        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, { preferredBranch: branchName, deliveryType: 'pickup' });
        }
      }

      // 7. Detección de Medio de Pago
      if (/(?:efectivo|transferencia|mercado pago|mp|alias)/i.test(userMsg) && activeOrder) {
        let paymentMethod = 'Efectivo';
        if (/transferencia|alias/i.test(userMsg)) paymentMethod = 'Transferencia';
        else if (/mercado pago|mp/i.test(userMsg)) paymentMethod = 'Mercado Pago';
        db.updateOrder(activeOrder.id, { paymentMethod });
      }

      return activeOrder;
    } catch (err) {
      console.error('⚠️ [OrderSyncEngine] Error sincronizando pedido:', err);
      return null;
    }
  }

  /**
   * Parsea los ítems directamente desde el resumen del agente.
   * Busca bloques tipo "Detalle de tu pedido" o listas con • / * y extrae
   * nombre, cantidad y precio. Luego enriquece con el catálogo real.
   * Esta es la fuente de verdad: el agente ya calculó todo desde el catálogo.
   */
  static extractItemsFromAgentReply(replyMsg, catalog) {
    const items = [];
    const products = [];
    let total = 0;

    if (!replyMsg) return { items, products, total };

    // Patrones de líneas de detalle del pedido que emite el agente
    // Ej: "* 2 kg de Milanesas de Ternera: $24.990" 
    //     "• 1.5 kg Vacío Especial — $17.250"
    //     "* *2 kg de Milanesas de Ternera (Promo):* $24.990"
    const lineRegex = /[•*\-]\s+\*?(\d+(?:[.,]\d+)?)\s*(kg|kilos?|unidades?|u\b|gr|gramos?)?\*?\s+(?:de\s+)?\*?([A-Za-záéíóúñÁÉÍÓÚÑ\s\(\)\/]+?)\*?\s*[:\-–—]\*?\s*\$?\s*([\d.,]+)/gi;

    // También capturar el total general del resumen
    const totalRegex = /(?:total[^:]*|total estimado)[:\s]*\$?\s*([\d.,]+)/gi;

    let match;
    while ((match = lineRegex.exec(replyMsg)) !== null) {
      const qty = parseFloat((match[1] || '1').replace(',', '.'));
      const unit = (match[2] || 'kg').toLowerCase().replace(/s$/, '').replace('kilo', 'kg');
      const rawName = (match[3] || '').trim().replace(/\s+/g, ' ');
      const rawPrice = parseFloat((match[4] || '0').replace(/\./g, '').replace(',', '.'));

      if (!rawName || rawPrice <= 0) continue;

      // Intentar encontrar el producto en el catálogo real por nombre
      const catalogProduct = this.matchCatalogProduct(rawName, catalog);

      // Precio unitario: si el agente puso el total del renglón, calcular unitario
      // Si la cantidad es > 1, el precio reportado puede ser subtotal o unitario
      let unitPrice = rawPrice;
      let subtotal = rawPrice;

      if (catalogProduct) {
        // Usar precio real del catálogo
        unitPrice = Number(catalogProduct.price) || unitPrice;
        subtotal = Math.round(unitPrice * qty);
      } else if (qty > 1 && rawPrice > 0) {
        // El agente reportó el subtotal del renglón (ej: "2 kg x $12.495 = $24.990")
        // Intentar determinar si es unitario o subtotal según magnitud
        const perUnit = rawPrice / qty;
        // Si el precio por unidad parece razonable (entre $100 y $100.000/kg), es subtotal
        if (perUnit >= 100 && perUnit <= 100000) {
          unitPrice = perUnit;
        } else {
          subtotal = Math.round(unitPrice * qty);
        }
      }

      const productEntry = {
        id: catalogProduct?.id || `prod-${rawName.toLowerCase().replace(/\s+/g, '-')}`,
        plu: catalogProduct?.plu || '',
        name: catalogProduct?.name || rawName,
        price: unitPrice,
        unitPrice: unitPrice,
        quantity: qty,
        unit: catalogProduct?.unit || unit,
        subtotal: subtotal
      };

      products.push(productEntry);
      items.push(`• ${qty} ${productEntry.unit} ${productEntry.name} — $${subtotal.toLocaleString('es-AR')}`);
      total += subtotal;
    }

    // Capturar total general si lo menciona el agente
    let totalMatch;
    while ((totalMatch = totalRegex.exec(replyMsg)) !== null) {
      const t = parseFloat((totalMatch[1] || '0').replace(/\./g, '').replace(',', '.'));
      if (t > total) total = t;
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

    // Exact match primero
    let found = catalog.find(p => (p.name || '').toLowerCase().trim() === clean);
    if (found) return found;

    // Includes match
    found = catalog.find(p => (p.name || '').toLowerCase().includes(clean) || clean.includes((p.name || '').toLowerCase()));
    if (found) return found;

    // Partial word match (score >= 60%)
    let bestScore = 0;
    let bestProd = null;
    const cleanWords = clean.split(/\s+/).filter(w => w.length > 2);
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

    if (!Array.isArray(catalog) || catalog.length === 0) return { products, items, total };

    const lowerText = text.toLowerCase();
    for (const prod of catalog) {
      const prodName = (prod.name || '').toLowerCase();
      const isMentioned = lowerText.includes(prodName) ||
        (prod.plu && lowerText.includes(String(prod.plu))) ||
        (Array.isArray(prod.keywords) && prod.keywords.some(kw => lowerText.includes(kw.toLowerCase())));

      if (isMentioned) {
        const qtyRegex = new RegExp(`(\\d+(?:[\\.,]\\d+)?)\\s*(?:kg|kilos?|unidades?|un|bolsas?|botellas?|combos?|piezas?)?\\s+(?:de\\s+)?(?:${prodName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'i');
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
