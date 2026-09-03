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

    const lines = replyMsg.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('*') && !line.startsWith('•') && !line.startsWith('-')) continue;

      // Quitar la viñeta inicial
      const clean = line.replace(/^[•*\-\s]+/, '').trim();
      if (!clean || /detalle|total|opciones|respondé|cómo seguimos|paso 4/i.test(clean)) continue;

      // Buscar precio al final de la línea: después de '—', '-', ':', o '('
      // Ej: "— $3.750", ": $24.990 (total)", "— $11.250", "$28.900"
      const lastPriceMatch = clean.match(/(?:—|-|:)\s*\*?\$?\s*([\d\.,]+)\*?(?:\s*(?:total|en total|\([^)]*\)|por los 2kg|\*))?\s*$/i);
      if (!lastPriceMatch) continue;

      const rawPrice = parseInt(lastPriceMatch[1].replace(/\D/g, ''), 10);
      if (isNaN(rawPrice) || rawPrice <= 0) continue;

      // Cortar la línea antes del separador del precio final
      const separatorIdx = clean.lastIndexOf(lastPriceMatch[0]);
      const textBeforePrice = (separatorIdx >= 0 ? clean.substring(0, separatorIdx) : clean).trim().replace(/[:—\-\(\*]+$/, '').trim();

      // Detectar cantidad y unidad al inicio
      const qtyMatch = textBeforePrice.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|unidades?|un|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\s*(?:de\s+)?/i);
      const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;
      let unit = 'kg';
      if (qtyMatch && qtyMatch[2]) {
        const u = qtyMatch[2].toLowerCase();
        if (u.startsWith('k')) unit = 'kg';
        else if (u.startsWith('u')) unit = 'un';
        else if (u.startsWith('bols')) unit = 'bolsa';
        else if (u.startsWith('bot')) unit = 'botella';
        else if (u.startsWith('comb')) unit = 'combo';
        else if (u.startsWith('tira')) unit = 'tira';
        else if (u.startsWith('bife')) unit = 'bife';
        else unit = u;
      }
      const rawName = qtyMatch ? textBeforePrice.slice(qtyMatch[0].length).trim() : textBeforePrice;
      const cleanName = rawName.replace(/^[*_]+|[*_:]+$/g, '').trim();


      if (!cleanName) continue;

      // Intentar vincular con el catálogo real por similitud
      const catalogProduct = this.matchCatalogProduct(cleanName, catalog);
      const unitPrice = qty > 0 ? Math.round(rawPrice / qty) : rawPrice;

      const productEntry = {
        id: catalogProduct?.id || `prod_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        plu: catalogProduct?.plu || '',
        barcode: catalogProduct?.barcode || '',
        category: catalogProduct?.category || 'Carnicería',
        name: catalogProduct?.name || cleanName,
        price: unitPrice,
        unitPrice: unitPrice,
        quantity: qty,
        unit: catalogProduct?.unit || unit,
        subtotal: rawPrice
      };

      products.push(productEntry);
      items.push(`• ${qty} ${productEntry.unit} ${productEntry.name} — $${rawPrice.toLocaleString('es-AR')}`);
      total += rawPrice;
    }

    // Verificar si hay total general explícito
    const totalMatch = replyMsg.match(/(?:total[^:]*|total estimado|total acumulado estimado)[:\s]*\*?\$?\s*([\d.,]+)/i);
    if (totalMatch) {
      const explicitTotal = parseInt(totalMatch[1].replace(/\D/g, ''), 10);
      if (explicitTotal > 0 && explicitTotal >= total) total = explicitTotal;
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
