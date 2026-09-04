import { db, parseArgentinePrice } from './database.js';
import { extractCleanAddress, isGarbageAddress } from './ai.js';
import { UserAuthService } from './userAuthService.js';

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

      // Si aún no hay items, verificar si el lead tiene un carrito borrador persistido en memoria
      if (itemsToOrder.length === 0 && clientLead?.draftCart?.items?.length > 0) {
        itemsToOrder = clientLead.draftCart.items;
        productsToOrder = clientLead.draftCart.products || [];
        totalAmountToOrder = clientLead.draftCart.total || 0;
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

      // 4.1 Extracción y Normalización Canónica del Perfil del Cliente (7 Datos Obligatorios)
      const extractedProfile = this.extractProfileDataFromText(customerText);
      if (cleanAddr) extractedProfile.address = cleanAddr;

      const currentProfileState = {
        fullName: extractedProfile.fullName || clientLead?.name || clientLead?.pushName || clientName,
        phone: clientPhone,
        address: cleanAddr || clientLead?.address || activeOrder?.address || '',
        neighborhood: extractedProfile.neighborhood || clientLead?.neighborhood || clientLead?.barrio || '',
        postalCode: extractedProfile.postalCode || clientLead?.postalCode || clientLead?.postal_code || '',
        email: extractedProfile.email || clientLead?.email || '',
        birthDate: extractedProfile.birthDate || clientLead?.birthDate || clientLead?.birth_date || ''
      };
      const profileGate = UserAuthService.evaluateProfileCompleteness(currentProfileState);

      // Si se extrajo nueva información, persistir en Lead y cuenta de Usuario
      if (Object.keys(extractedProfile).length > 0) {
        if (clientLead?.jid || clientLead?.id) {
          db.updateLead(clientLead.jid || clientLead.id, extractedProfile);
        }
        UserAuthService.registerOrUpdateUser({
          ...currentProfileState,
          userType: 'customer'
        }).catch(() => {});
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
          const isExplicitResetOrReplace = /(?:solo quiero|quiero solo|un solo|una sola|nada mas|en vez de|cambia|cambiame|modifica|modificame|borra todo|borrá todo|empecemos de nuevo|arranquemos de nuevo)/i.test(userMsg);
          const isAdditionIntent = /(?:agrega|agregá|agregar|agregame|agregale|suma|sumá|sumar|sumale|sumame|mas|más|tambien|también|sumale también|mas los|más los|mas 1|mas 2|y los|y las|y 1|y 2)/i.test(userMsg);

          // Si el cliente está agregando cortes o la orden activa ya tenía productos que no fueron mencionados en este turno aislado
          if (!isExplicitResetOrReplace && Array.isArray(activeOrder.products) && activeOrder.products.length > 0) {
            const mergedProductsMap = new Map();
            // Cargar productos previos de la orden
            for (const p of activeOrder.products) {
              const key = (p.id || p.name || '').toLowerCase().trim();
              if (key) mergedProductsMap.set(key, { ...p });
            }

            // Integrar productos del nuevo turno
            for (const p of productsToOrder) {
              const key = (p.id || p.name || '').toLowerCase().trim();
              if (key) {
                if (isAdditionIntent && mergedProductsMap.has(key)) {
                  const existing = mergedProductsMap.get(key);
                  const newQty = (Number(existing.quantity) || 1) + (Number(p.quantity) || 1);
                  const unitP = Number(p.unitPrice || existing.unitPrice || p.price || 0);
                  const newSub = unitP > 0 ? Math.round(unitP * newQty) : ((Number(existing.subtotal) || 0) + (Number(p.subtotal) || 0));
                  mergedProductsMap.set(key, {
                    ...existing,
                    quantity: newQty,
                    subtotal: newSub
                  });
                } else {
                  mergedProductsMap.set(key, { ...p });
                }
              }
            }

            const combinedProducts = Array.from(mergedProductsMap.values());
            if (combinedProducts.length >= productsToOrder.length) {
              productsToOrder = combinedProducts;
              totalAmountToOrder = combinedProducts.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);
              itemsToOrder = combinedProducts.map(p => {
                const q = p.isUnitMode ? `${p.unitCount || p.quantity} Unidades` : `${p.quantity} ${p.unit || 'kg'}`;
                return `• ${q} ${p.name} — $${(Number(p.subtotal) || 0).toLocaleString('es-AR')}`;
              });
            }
          }

          // Actualizar orden existente con los items confirmados y combinados
          activeOrder = db.updateOrder(activeOrder.id, {
            items: itemsToOrder,
            products: productsToOrder.length > 0 ? productsToOrder : activeOrder.products,
            totalAmount: totalAmountToOrder > 0 ? totalAmountToOrder : activeOrder.totalAmount,
            deliveryType,
            address: cleanAddr || activeOrder.address || '',
            neighborhood: currentProfileState.neighborhood || activeOrder.neighborhood || '',
            postalCode: currentProfileState.postalCode || activeOrder.postalCode || '',
            customerEmail: currentProfileState.email || activeOrder.customerEmail || '',
            profileGate: {
              isComplete: profileGate.isComplete,
              score: profileGate.score,
              missingFields: profileGate.missing
            },
            branch: branchName || activeOrder.branch || '',
            paymentMethod,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Crear nueva orden
          activeOrder = db.createOrder({
            jid: clientJid,
            phone: clientPhone,
            customerName: currentProfileState.fullName,
            customerEmail: currentProfileState.email,
            items: itemsToOrder,
            products: productsToOrder,
            totalAmount: totalAmountToOrder,
            status: 'pending',
            channel: 'WHATSAPP',
            source: 'WHATSAPP',
            origin: 'WHATSAPP',
            deliveryType,
            address: cleanAddr || '',
            neighborhood: currentProfileState.neighborhood || '',
            postalCode: currentProfileState.postalCode || '',
            profileGate: {
              isComplete: profileGate.isComplete,
              score: profileGate.score,
              missingFields: profileGate.missing
            },
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
   * Soporta múltiples formatos:
   *   - Viñetas: "*   *Costilla:* 1,2 kg — *$26.999/kg*"
   *   - Formato flecha: "• 1,5 kg de ASADO SURTIDO PREMIUM ($11.987/kg) → *$17.980,50*"
   *   - Formato sin flecha: "* 1,5 kg de ASADO SURTIDO PREMIUM ($11.987/kg)"
   *   - Listas numeradas: "1. 1,5 kg de Asado", "2) 4 Chorizos de Cerdo"
   *   - Emojis y cantidades directas: "🥩 4 Unidades de CHORIZO DE CERDO ($14.760/kg)"
   * NUNCA descarta cortes acordados aunque su subtotal sea provisional o dependa de balanza.
   */
  static extractItemsFromAgentReply(replyMsg, catalog) {
    const items = [];
    const products = [];
    let total = 0;

    if (!replyMsg) return { items, products, total };

    const lines = replyMsg.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Detectar si la línea parece un ítem (empieza con viñeta, número, emoji o cantidad)
      const isBulletOrNum = /^[\s•*\-+]|^\d+[\.\)]\s*|^[🥩🍖🔥🌭🥓🍗🍔📦🍷⭐👉]\s*|^[0-9]+(?:[.,][0-9]+)?\s*(?:kg|kilos?|unidades?|un|bolsas?|botellas?|combos?|tiras?|bifes?)\b/i.test(line);
      if (!isBulletOrNum) continue;

      let clean = line
        .replace(/^[\s•*\-+]+/, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^[🥩🍖🔥🌭🥓🍗🍔📦🍷⭐👉]\s*/, '')
        .trim();

      // Ignorar encabezados, resúmenes o metadatos de conversación
      if (!clean || /^(?:detalle|total|opciones|respondé|cómo seguimos|paso\b|recordamos|nota:|modalidad|direcci[oó]n|forma de pago|medio de pago|sucursal|horario)/i.test(clean)) {
        continue;
      }

      let nameCandidate = '';
      let qtyStr = '';
      let priceStr = '';
      let subtotal = 0;
      let unitPrice = 0;
      let isPerUnit = false;

      // PATRÓN 1: Formato con dos puntos "Nombre: Cantidad [Unidad] — Precio"
      // Ej: "*Costilla:* 1,2 kg — *$26.999/kg*"
      // Ej: "*Carbón:* 1 bolsa (4kg Flamar) — *$3.600/un*"
      const colonFormatMatch = clean.match(/^[*_"]?([^*_":]+(?:\([^)]+\))?)[*_"]?\s*:\s*(.+)$/i);

      if (colonFormatMatch && !/(?:direcci[oó]n|modalidad|forma de pago|medio de pago|pago|sucursal|entrega|horario|total)/i.test(colonFormatMatch[1])) {
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
        // PATRÓN 2: Formato flecha/guión "Cantidad [Unidad] [de] Nombre [PrecioUnitario] [→ Subtotal]"
        const arrowMatch = clean.match(/(?:→|->|—)\s*\*?\$?\s*([\d\.,]+(?:\/\w+)?)\s*\*?\s*$/i);
        let textBeforePrice = clean;
        if (arrowMatch) {
          priceStr = arrowMatch[1];
          textBeforePrice = clean.substring(0, arrowMatch.index).trim();
        }

        const unitPriceMatch = textBeforePrice.match(/\(\s*\*?\$?\s*([\d\.,]+)\s*\/\s*(?:kg|kilo|un|unidad|bolsa|botella|combo|u)\*?\s*\)/i);
        if (unitPriceMatch) {
          priceStr = priceStr || unitPriceMatch[0];
          textBeforePrice = textBeforePrice.replace(unitPriceMatch[0], '').trim();
        }

        // Extraer cantidad al inicio del texto (tolerando asteriscos de formato como *1,5 kg de...)
        const qtyMatch = textBeforePrice.match(/^[*_"]?\s*(\d+(?:[.,]\d+)?)\s*(?:x\b|X\b|kg|kilos?|unidades?|un\b|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\s*(?:de\s+)?/i);
        if (qtyMatch) {
          qtyStr = qtyMatch[0].replace(/[*_"]/g, '').trim();
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

      // Limpieza exhaustiva de nombre
      let cleanName = nameCandidate
        .replace(/^[*_"]+|[*_":]+$/g, '')
        .replace(/^[xX]\s+/i, '')
        .replace(/^(?:de|unidades?|un|bolsas?|kilos?|kg)\s+de\s+/i, '')
        .replace(/^de\s+/i, '')
        .trim();

      if (!cleanName) continue;

      // Vincular con catálogo real de la carnicería
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

      let finalQuantity = qty;
      let finalUnit = catalogProduct?.unit || unit;
      let finalUnitPrice = effectiveUnitPrice;

      if (isUnitMode && catalogProduct?.unit === 'kg') {
        const unitsPerKg = catalogProduct?.unitsPerKg || 8;
        finalQuantity = Number((qty / unitsPerKg).toFixed(3));
        finalUnit = 'kg';
        finalUnitPrice = effectiveUnitPrice;
      } else if (subtotal > 0 && qty > 0 && finalUnitPrice === 0) {
        finalUnitPrice = Math.round(subtotal / qty);
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
   * Busca el mejor producto del catálogo real por similitud ponderada de palabras.
   * Evita falsos positivos con notas entre paréntesis o palabras cortas.
   */
  static matchCatalogProduct(name, catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0 || !name) return null;

    const normalizeWord = (w = '') => {
      let s = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      // Normalizar plurales a singulares comunes en carnicería
      if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2);
      else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
      if (s === 'matambrito') s = 'matambre';
      return s;
    };

    const clean = name.toLowerCase().trim();
    const cleanNorm = normalizeWord(clean);

    // 1. Coincidencia exacta estricta
    let found = catalog.find(p => (p.name || '').toLowerCase().trim() === clean);
    if (found) return found;

    // 2. Coincidencia sin notas entre paréntesis (ej: "Matambrito de Cerdo (Entrecot)" -> "Matambrito de Cerdo")
    const withoutParens = clean.replace(/\([^)]*\)/g, '').trim();
    if (withoutParens && withoutParens !== clean) {
      found = catalog.find(p => (p.name || '').toLowerCase().trim() === withoutParens);
      if (found) return found;
    }

    // Extraer palabras significativas (sin artículos ni preposiciones)
    const stopWords = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'x', 'para', 'con', 'en']);
    const targetWords = (withoutParens || clean)
      .split(/[\s,()\-]+/)
      .map(normalizeWord)
      .filter(w => w.length >= 3 && !stopWords.has(w));

    // Si había paréntesis, también extraer esas palabras secundarias con menor peso
    const parensMatch = clean.match(/\(([^)]+)\)/);
    const parensWords = parensMatch
      ? parensMatch[1].split(/[\s,()\-]+/).map(normalizeWord).filter(w => w.length >= 3 && !stopWords.has(w))
      : [];

    let bestScore = 0;
    let bestProduct = null;

    for (const prod of catalog) {
      const prodRaw = (prod.name || '').toLowerCase().trim();
      if (!prodRaw) continue;

      const prodWords = prodRaw
        .split(/[\s,()\-]+/)
        .map(normalizeWord)
        .filter(w => w.length >= 3 && !stopWords.has(w));

      if (prodWords.length === 0) continue;

      // Calcular coincidencia de palabras principales
      let matches = 0;
      for (const tw of targetWords) {
        if (prodWords.some(pw => pw === tw || pw.includes(tw) || tw.includes(pw))) {
          matches++;
        }
      }

      // Calcular coincidencia de palabras secundarias (en paréntesis)
      let secondaryMatches = 0;
      for (const sw of parensWords) {
        if (prodWords.some(pw => pw === sw || pw.includes(sw) || sw.includes(pw))) {
          secondaryMatches++;
        }
      }

      // Bonus si comparten tipo de carne clave (ej: cerdo, pollo, vacio, costilla)
      const hasMeatTypeBonus = targetWords.some(tw => ['cerdo', 'pollo', 'vaca', 'ternera'].includes(tw) && prodWords.includes(tw));

      const primaryScore = matches / Math.max(targetWords.length, 1);
      const secondaryScore = (secondaryMatches * 0.4) / Math.max(parensWords.length || 1, 1);
      const totalScore = primaryScore + secondaryScore + (hasMeatTypeBonus ? 0.25 : 0);

      if (totalScore > bestScore && totalScore >= 0.5) {
        bestScore = totalScore;
        bestProduct = prod;
      }
    }

    return bestProduct;
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

  /**
   * Extrae automáticamente los 7 datos canónicos del perfil del cliente desde texto libre
   */
  static extractProfileDataFromText(text = '') {
    if (!text) return {};
    const res = {};
    const str = String(text);

    // 1. Email
    const emailMatch = str.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) res.email = emailMatch[0].toLowerCase();

    // 2. Código Postal (4 dígitos o formato argentino C1425BGA)
    const cpMatch = str.match(/\b(?:c\.?p\.?|c[oó]digo postal|cp)[\s:]*([A-Za-z]?[0-9]{4}[A-Za-z]{0,3})\b/i)
      || str.match(/\b([0-9]{4})\b(?!\s*(?:kg|g|gr|gramos|kilos|\$|pesos|un|unidades))/i);
    if (cpMatch) res.postalCode = cpMatch[1].toUpperCase();

    // 3. Barrio / Localidad
    const barrioMatch = str.match(/\b(?:barrio|en el barrio|zona|vecindario|localidad)[\s:]+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s]+?)(?:,|\.|\n|$|\s+(?:cp|c[oó]digo|depto|piso|tel|correo|email|nac[ií]))/i);
    if (barrioMatch && barrioMatch[1] && barrioMatch[1].trim().length >= 3) {
      res.neighborhood = barrioMatch[1].trim();
    }

    // 4. Fecha de Nacimiento (ej: 24/10/1988 o 24-10-1988 o "24 de octubre")
    const dateMatch = str.match(/\b(?:naci(?:do)?|cumple(?:a[ñn]os)?|nacimiento)?[\s:]*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `19${dateMatch[3]}` : dateMatch[3]) : '2000';
      res.birthDate = `${year}-${month}-${day}`;
    }

    // 5. Nombre completo si el usuario dice "me llamo ...", "mi nombre es ...", "soy ..."
    const nameMatch = str.match(/\b(?:me llamo|mi nombre es|soy)[\s:]+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:,|\.|\n|$|\s+(?:y vivo|mi direcci[oó]n|mi tel|mi cel|mi mail|mi correo))/i);
    if (nameMatch && nameMatch[1] && nameMatch[1].trim().length >= 3) {
      res.fullName = nameMatch[1].trim();
      res.name = nameMatch[1].trim();
    }

    return res;
  }
}
