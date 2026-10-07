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
          // Ignorar si es una pregunta del bot (ej: "¿A dónde se lo enviamos? (Calle, número y barrio)")
          if (!/(?:\?|¿|a d[oó]nde|calle,?\s*n[uú]mero|indicanos|pasame|decime)/i.test(candidate)) {
            cleanAddr = extractCleanAddress(candidate);
          }
        }

        // 2. Mención en el saludo / introducción: "agendado tu envío a *Roque Funes 1704*"
        if (!cleanAddr) {
          const introMatch = replyMsg.match(/(?:env[ií]o|agendado|entrega)(?:\s+a|\s+en)\s+\*?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s,]+?)\*?(?:\.|\n|$)/i);
          if (introMatch && introMatch[1]) {
            const candidateIntro = introMatch[1].trim();
            if (!/(?:\?|¿|a d[oó]nde|calle,?\s*n[uú]mero)/i.test(candidateIntro)) {
              cleanAddr = extractCleanAddress(candidateIntro);
            }
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

      // Si el mensaje del agente está presentando múltiples alternativas de menú/propuesta
      // (ej: Opción 1 y Opción 2) y el usuario aún no eligió ninguna opción,
      // registrar la etapa como 'proposal' y NO crear un pedido activo preliminar que sume todas las alternativas.
      const hasMultipleOptionProposals = /(?:1️⃣|\bopci[oó]n\s*1\b)/i.test(replyMsg) && /(?:2️⃣|\bopci[oó]n\s*2\b)/i.test(replyMsg);
      const isOptionSelection = /^(?:opci[oó]n\s*)?[1-9]$/i.test(userMsg.trim()) ||
        /(?:me\s+gusta|elijo|vamos con|anotame|pasame|mandame)\s+(?:la|el)?\s*(?:opci[oó]n)?\s*[1-9]\b/i.test(userMsg) ||
        /\b(?:la|el)\s+(?:opci[oó]n\s*)?[1-9]\b/i.test(userMsg) ||
        /\bopci[oó]n\s*[1-9]\b/i.test(userMsg) ||
        /^[1-9]️⃣?$/i.test(userMsg.trim());

      if (hasMultipleOptionProposals && !isOptionSelection) {
        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, {
            stage: 'proposal'
          });
        }
        return null;
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
        if (cleanAddr && /(?:retiro|sucursal|pasar\s+a\s+buscar|voy\s+a\s+retirar)/i.test(cleanAddr)) {
          cleanAddr = '';
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
          const hasAuthoritativeDetail = /(?:(?:📋|📝|📦|🛒|🍽️|✨|👉)?\s*\*?\s*(?:Detalle|Resumen)[^\n:]*?(?:pedido|propuesta|orden))/iu.test(replyMsg);

          // Si el cliente está eligiendo una opción o el bot brindó el detalle autoritativo completo del pedido,
          // los productos extraídos del reply reemplazan completamente cualquier propuesta preliminar
          const shouldReplaceCart = isExplicitResetOrReplace || isOptionSelection || hasAuthoritativeDetail;

          if (!shouldReplaceCart && isAdditionIntent && Array.isArray(activeOrder.products) && activeOrder.products.length > 0) {
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
                  const isU = Boolean(p.isUnitMode || existing.isUnitMode);
                  const newQty = (Number(existing.quantity) || 1) + (Number(p.quantity) || 1);
                  const newUnitCount = isU ? ((Number(existing.unitCount) || 0) + (Number(p.unitCount) || 0)) : 0;
                  const unitP = Number(p.unitPrice || existing.unitPrice || p.price || 0);
                  const newSub = unitP > 0 ? Math.round(unitP * newQty) : ((Number(existing.subtotal) || 0) + (Number(p.subtotal) || 0));
                  mergedProductsMap.set(key, {
                    ...existing,
                    quantity: newQty,
                    isUnitMode: isU,
                    unitCount: newUnitCount,
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

    // 1. Aislamiento de la sección autoritativa de detalle si existe
    let relevantText = replyMsg;
    const detailHeaderMatch = replyMsg.match(/(?:(?:📋|📝|📦|🛒|🍽️|✨|👉)?\s*\*?\s*(?:Detalle|Resumen)[^\n:]*?(?:pedido|propuesta|orden)[^*:\n]*\*?[:\s]*)/iu);
    if (detailHeaderMatch) {
      const afterHeader = replyMsg.slice(detailHeaderMatch.index + detailHeaderMatch[0].length);
      const nextSectionMatch = afterHeader.match(/\n\s*(?:(?:\*|_|\(|\s)*(?:nota|aviso|aclaraci[oó]n|los precios de los cortes|total|total estimado|total acumulado|saldo|¿estamos)|(?:💰|💵|💳)|para que esto|para que|cómo seguimos|c[oó]mo seguimos|1[\.\)]\s*\*?direcci[oó]n|direcci[oó]n completa|medio de pago|forma de pago|el pago|¿a d[oó]nde|¿c[oó]mo prefiere|¿le hace falta)/iu);
      relevantText = nextSectionMatch ? afterHeader.slice(0, nextSectionMatch.index) : afterHeader;
    }

    const lines = relevantText.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Descartar encabezados, títulos de opciones o preguntas de checkout
      if (/(?:opci[oó]n\s*\d|propuesta\s*\d|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|direcci[oó]n|medio de pago|forma de pago|efectivo|transferencia|mercado pago|alias:)/i.test(line)) {
        continue;
      }

      // Detectar si parece un item (con flag /u para evitar colisiones de surrogates UTF-16)
      const isBulletOrNum = /^[\s•*\-+]|^\d+[\.\)]\s*|^[0-9]+(?:[.,][0-9]+)?\s*(?:kg|kilos?|k\b|g\b|gr\b|grs\b|gramos\b|unidades?|unidad\b|un\b|bolsas?|botellas?|combos?|tiras?|bifes?)\b/iu.test(line);
      const isProductEmoji = /^(?:🥩|🍖|🔥|🌭|🥓|🍗|🍔|📦|🍷|⭐|👉)\s+/u.test(line);
      if (!isBulletOrNum && !isProductEmoji) continue;

      let clean = line
        .replace(/^[\s•*\-+]+/, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^(?:🥩|🍖|🔥|🌭|🥓|🍗|🍔|📦|🍷|⭐|👉|📋|📝|🛒|🍽️|💰|💵)\s*/u, '')
        .trim();

      if (!clean) continue;

      // Descartar notas, totales, avisos de pesaje o metadatos de checkout
      const cleanLower = clean.toLowerCase();
      if (
        cleanLower.startsWith('nota') ||
        cleanLower.startsWith('(nota') ||
        cleanLower.startsWith('[nota') ||
        cleanLower.includes('pesaje') ||
        cleanLower.includes('balanza') ||
        cleanLower.includes('precios de los cortes') ||
        cleanLower.includes('precios son por kilo') ||
        cleanLower.includes('total informado es estimado') ||
        cleanLower.includes('leve variación') ||
        cleanLower.includes('leve variacion') ||
        cleanLower.includes('detalle actualizado') ||
        cleanLower.includes('detalle de tu pedido') ||
        cleanLower.includes('resumen de tu pedido') ||
        cleanLower.includes('te agrego al pedido') ||
        /^(?:total|total estimado|total acumulado|subtotal|precio total|importe total|saldo)\b/iu.test(clean) ||
        /^(?:sena|seña)\s+de\s+pedidos/i.test(clean) ||
        /^(?:para que|av[ií]seme|recordamos|c[oó]mo seguimos|cómo seguimos|qué te parece|avisame|paso final|coordinar|el pago|ya le reserv|excelente|de diez|de una|joya|gracias)/i.test(clean) ||
        /^(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|[1-9]\))\s*(?:coordinar|elegir|sumar|env[ií]o|retiro|domicilio|sucursal|efectivo|transferencia|mercado)/i.test(clean)
      ) {
        continue;
      }

      // Extraer PLU si viene entre corchetes
      let plu = '';
      const pluMatch = clean.match(/\[(?:PLU\s*)?(\d+)\]/i);
      if (pluMatch && pluMatch[1] && pluMatch[1] !== '0000' && pluMatch[1] !== '0') {
        plu = pluMatch[1];
      }

      // Extraer precio unitario: a *$26.999/kg* o ($26.999/kg) o a $3.600/un
      let unitPrice = 0;
      const unitPriceMatch = clean.match(/(?:a\s+)?\*?\$?\s*([\d\.,]+)\s*\/\s*([a-zA-Z]+)\*?/i);
      if (unitPriceMatch) {
        unitPrice = parseArgentinePrice(unitPriceMatch[1]);
      }

      // Extraer subtotal directo: — *$40.499* o -> $40.499 o : *$11.250**
      let subtotal = 0;
      const arrowMatch = clean.match(/(?:→|->|—|-|:)\s*\*?\$?\s*([\d\.,]+)\s*\*?\*?(?!\s*\/\s*[a-zA-Z]+)\s*$/i);
      if (arrowMatch) {
        subtotal = parseArgentinePrice(arrowMatch[1]);
      }

      // Remover la sección de precios/PLU del texto para quedarnos con Cantidad y Nombre
      let itemBody = clean
        .replace(/\s*\([^)]*\[PLU[^)]*\)\s*/gi, '')
        .replace(/\s*\([^)]*\$\s*[\d\.,]+[^)]*\)\s*/gi, '')
        .replace(/(?:→|->|—|-|:)\s*\*?\$?\s*[\d\.,]+.*$/gi, '')
        .replace(/[*_"]/g, '')
        .trim();

      // Detección:
      // Pattern 1: Cantidad de Nombre (ej: "1,5 kg de COSTILLA", "4 chorizos de cerdo", "1 unidad CARBON")
      // Pattern 2: Nombre : Cantidad (ej: "Costilla: 1,2 kg (aprox.)", "Chorizos de Cerdo: 4 unidades")
      // Pattern 3: Separador guion o paréntesis (ej: "Costilla - 1,2 kg", "Costilla (1,2 kg)")
      const leadingQtyMatch = itemBody.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\b|X\b)?\s*(kg|kilos?|k\b|g\b|gr\b|grs\b|gramos\b|unidades?|unidad\b|un\b|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\s*(?:de\s+)?(.*)$/i);
      const colonMatch = !leadingQtyMatch ? itemBody.match(/^([^:\d\n]+?)\s*:\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|g\b|gr\b|grs\b|gramos\b|unidades?|unidad\b|un\b|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\b\s*(.*)$/i) : null;
      const separatorMatch = (!colonMatch && !leadingQtyMatch) ? itemBody.match(/^(.+?)\s*(?:-|–|—|\()\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|g\b|gr\b|grs\b|gramos\b|unidades?|unidad\b|un\b|u\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\b\s*(?:.*)$/i) : null;

      let rawQty = 1;
      let rawUnit = '';
      let nameCandidate = itemBody;

      if (leadingQtyMatch) {
        rawQty = parseFloat(leadingQtyMatch[1].replace(',', '.'));
        rawUnit = (leadingQtyMatch[2] || '').toLowerCase();
        nameCandidate = (leadingQtyMatch[3] || '').trim();
      } else if (colonMatch) {
        nameCandidate = colonMatch[1].trim();
        rawQty = parseFloat(colonMatch[2].replace(',', '.'));
        rawUnit = (colonMatch[3] || '').toLowerCase();
      } else if (separatorMatch) {
        nameCandidate = separatorMatch[1].trim();
        rawQty = parseFloat(separatorMatch[2].replace(',', '.'));
        rawUnit = (separatorMatch[3] || '').toLowerCase();
      }

      nameCandidate = nameCandidate.replace(/[:—\-\$0-9.,]+$/, '').trim();

      let qty = rawQty || 1;
      let unit = 'kg';
      let isUnitMode = false;
      let unitCount = 0;

      if (/^(?:g|gr|grs|gramos)$/i.test(rawUnit)) {
        qty = Number((rawQty / 1000).toFixed(3));
        unit = 'kg';
        isUnitMode = false;
        unitCount = 0;
      } else if (/^(?:unidades?|unidad|un|u)$/i.test(rawUnit) || (!rawUnit && /^(?:chori|morcilla|costeleta|milanesa|hamburguesa)/i.test(nameCandidate))) {
        qty = rawQty;
        unit = 'un';
        isUnitMode = true;
        unitCount = rawQty;
      } else if (/^bolsas?$/i.test(rawUnit)) {
        qty = rawQty;
        unit = 'bolsa';
        isUnitMode = true;
        unitCount = rawQty;
      } else if (/^botellas?$/i.test(rawUnit)) {
        qty = rawQty;
        unit = 'botella';
        isUnitMode = true;
        unitCount = rawQty;
      } else if (/^combos?$/i.test(rawUnit)) {
        qty = rawQty;
        unit = 'combo';
        isUnitMode = true;
        unitCount = rawQty;
      } else {
        qty = rawQty;
        unit = 'kg';
        isUnitMode = false;
        unitCount = 0;
      }

      if (!nameCandidate || nameCandidate.length < 2) continue;
      if (/^(?:total|total estimado|total acumulado)/i.test(nameCandidate)) continue;

      // Vincular con catálogo real de la carnicería
      const catalogProduct = this.matchCatalogProduct(nameCandidate, catalog, plu);
      const catalogPrice = catalogProduct ? Number(catalogProduct.price) : 0;
      const effectiveUnitPrice = unitPrice > 0 ? unitPrice : catalogPrice;
      let effectiveUnit = catalogProduct?.unit || unit;

      let finalQty = qty;
      if (isUnitMode && catalogProduct && catalogProduct.unit === 'kg') {
        const unitsPerKg = catalogProduct.unitsPerKg || 8;
        finalQty = Number((qty / unitsPerKg).toFixed(3));
        effectiveUnit = 'kg';
        if (subtotal <= 0 && effectiveUnitPrice > 0) {
          subtotal = Math.round(finalQty * effectiveUnitPrice);
        }
      } else if (catalogProduct && catalogProduct.unit !== 'kg') {
        isUnitMode = true;
        effectiveUnit = catalogProduct.unit;
        unitCount = qty;
        if (subtotal <= 0 && effectiveUnitPrice > 0) {
          subtotal = Math.round(qty * effectiveUnitPrice);
        }
      } else {
        if (subtotal <= 0 && effectiveUnitPrice > 0) {
          subtotal = Math.round(qty * effectiveUnitPrice);
        }
      }

      const productEntry = {
        id: catalogProduct?.id || `prod_${nameCandidate.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        plu: catalogProduct?.plu || plu,
        barcode: catalogProduct?.barcode || '',
        category: catalogProduct?.category || 'Carnicería',
        name: catalogProduct?.name || nameCandidate,
        price: effectiveUnitPrice,
        unitPrice: effectiveUnitPrice,
        quantity: finalQty,
        unit: effectiveUnit,
        isUnitMode: isUnitMode,
        unitCount: isUnitMode ? (unitCount || qty) : 0,
        subtotal: subtotal
      };

      products.push(productEntry);
      if (isUnitMode && productEntry.unitCount > 0) {
        items.push(`• ${productEntry.unitCount} Unidades de ${productEntry.name} — $${subtotal.toLocaleString('es-AR')}`);
      } else {
        items.push(`• ${productEntry.quantity} ${productEntry.unit || 'kg'} ${productEntry.name} — $${subtotal.toLocaleString('es-AR')}`);
      }
      total += subtotal;
    }

    // Si hay total general explícito en el texto del mensaje
    const totalMatch = replyMsg.match(/(?:total[^:\n]*|total estimado|total acumulado estimado)[:\s]*\*?\$?\s*([\d.,]+)/i);
    if (totalMatch) {
      const explicitTotal = parseArgentinePrice(totalMatch[1]);
      if (explicitTotal > 0 && products.length === 0) {
        total = explicitTotal;
      }
    }

    return { items, products, total };
  }

  /**
   * Busca el mejor producto del catálogo real por similitud ponderada de palabras.
   * Evita falsos positivos con notas entre paréntesis o palabras cortas.
   */
  static matchCatalogProduct(name, catalog, plu = '') {
    if (!Array.isArray(catalog) || catalog.length === 0 || !name) return null;

    const clean = name.toLowerCase().trim();
    // Prohibir match accidental con "SENA DE PEDIDOS" salvo que el cliente explícitamente mencione seña
    const safeCatalog = (!clean.includes('seña') && !clean.includes('sena'))
      ? catalog.filter(p => !/^(?:sena|seña)\s+de\s+pedidos$/i.test(p.name))
      : catalog;

    // 1. PLU exacto si es válido
    if (plu && plu !== '0000' && plu !== '0') {
      const byPlu = safeCatalog.find(p => p.plu === plu);
      if (byPlu) return byPlu;
    }

    // 2. Coincidencia exacta
    let found = safeCatalog.find(p => (p.name || '').toLowerCase().trim() === clean);
    if (found) return found;

    // 3. Reglas semánticas específicas para insumos y cortes comunes de carnicería
    if (/\bcarb[oó]n\b/i.test(clean)) {
      const has4 = clean.includes('4');
      const has3 = clean.includes('3');
      const has5 = clean.includes('5');
      const match = catalog.find(p => /\bcarb[oó]n\b/i.test(p.name) && (has4 ? p.name.includes('4') : has3 ? p.name.includes('3') : has5 ? p.name.includes('5') : true) && Number(p.price) > 0);
      if (match) return match;
    }

    if (/\bcostilla\b/i.test(clean)) {
      const match = catalog.find(p => /\bcostilla\b/i.test(p.name) && !/cerdo/i.test(p.name) && Number(p.price) > 0);
      if (match) return match;
    }

    if (/\bchorizo.*criollo/i.test(clean)) {
      const match = catalog.find(p => /\bchorizo.*criollo/i.test(p.name));
      if (match) return match;
    }

    // Coincidencia sin notas entre paréntesis (ej: "Matambrito de Cerdo (Entrecot)" -> "Matambrito de Cerdo")
    const withoutParens = clean.replace(/\([^)]*\)/g, '').trim();
    if (withoutParens && withoutParens !== clean) {
      found = catalog.find(p => (p.name || '').toLowerCase().trim() === withoutParens);
      if (found) return found;
    }

    // Extraer palabras significativas (sin artículos ni preposiciones)
    const normalizeWord = (w = '') => {
      let s = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2);
      else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
      if (s === 'matambrito') s = 'matambre';
      return s;
    };

    const stopWords = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'x', 'para', 'con', 'en']);
    const targetWords = (withoutParens || clean)
      .split(/[\s,()\-]+/)
      .map(normalizeWord)
      .filter(w => w.length >= 3 && !stopWords.has(w));

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

      // Calcular coincidencia de palabras principales con prefijos de al menos 5 letras (evita carbón -> bicarbonato)
      let matches = 0;
      for (const tw of targetWords) {
        if (prodWords.some(pw => pw === tw || (pw.length >= 5 && tw.length >= 5 && (pw.startsWith(tw) || tw.startsWith(pw))))) {
          matches++;
        }
      }

      // Calcular coincidencia de palabras secundarias (en paréntesis)
      let secondaryMatches = 0;
      for (const sw of parensWords) {
        if (prodWords.some(pw => pw === sw || (pw.length >= 5 && sw.length >= 5 && (pw.startsWith(sw) || sw.startsWith(pw))))) {
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
        const qtyRegex = new RegExp(`(\\d+(?:[\\.,]\\d+)?)\\s*(?:(kg|kilos?|k\\b|g\\b|gr\\b|grs\\b|gramos\\b|unidades?|un|bolsas?|botellas?|combos?|piezas?))?\\s+(?:de\\s+)?(?:${escapedName})`, 'i');
        const match = text.match(qtyRegex);
        let quantity = match ? parseFloat(match[1].replace(',', '.')) : 1;
        const rawUnit = match && match[2] ? match[2].toLowerCase() : '';
        if (/^(?:g|gr|grs|gramos)$/i.test(rawUnit)) {
          quantity = Number((quantity / 1000).toFixed(3));
        }

        const isUnit = /un|unidades?|botellas?|bolsas?|combo/i.test(rawUnit) || (!rawUnit && /^(?:chori|morcilla|costeleta|milanesa|hamburguesa)/i.test(prod.name)) || prod.unit !== 'kg';
        const unitsPerKg = prod.unitsPerKg || 8;
        const finalQty = (isUnit && prod.unit === 'kg') ? Number((quantity / unitsPerKg).toFixed(3)) : quantity;
        const subtotal = Math.round(unitPrice * finalQty);

        products.push({
          id: prod.id || `prod_${prod.plu || Math.random().toString(36).substr(2, 5)}`,
          plu: prod.plu || '',
          barcode: prod.barcode || '',
          category: prod.category || 'Carnicería',
          name: prod.name,
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: finalQty,
          unit: prod.unit || 'kg',
          isUnitMode: isUnit,
          unitCount: isUnit ? quantity : 0,
          subtotal: subtotal
        });

        if (isUnit && quantity > 0) {
          items.push(`• ${quantity} Unidades de ${prod.name} — $${subtotal.toLocaleString('es-AR')}`);
        } else {
          items.push(`• ${finalQty} ${prod.unit || 'kg'} ${prod.name} — $${subtotal.toLocaleString('es-AR')}`);
        }
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
