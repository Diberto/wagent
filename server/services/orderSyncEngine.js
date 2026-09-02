import { db } from './database.js';

/**
 * Motor Inteligente de Sincronización y Registro de Pedidos en Vivo
 * Garantiza que cualquier intención de compra o confirmación conversacional
 * se traduzca de inmediato en un registro de orden persistido en db.json y SQLite WAL,
 * visible en tiempo real en el panel de pedidos y CRM.
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
      const catalog = products || db.getProducts() || [];
      const userMsg = String(customerText || '').toLowerCase().trim();
      const replyMsg = String(aiReplyText || '').toLowerCase();
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
          activeOrders.forEach(o => {
            db.updateOrderStatus(o.id, 'cancelled');
          });
        }
        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, { draftCart: null, currentOrder: null });
        }
        return null;
      }

      // 2. Extraer cortes y cantidades solicitadas por el cliente
      const extracted = this.extractProductsFromText(userMsg, catalog);
      const isSelectingComboOption = /(?:opci[oó]n|el\s+[1-3]|la\s+[1-3]|combo\s+asadazo|asadazo)/i.test(userMsg);

      let itemsToOrder = extracted.items;
      let productsToOrder = extracted.products;
      let totalAmountToOrder = extracted.total;

      // Si el usuario eligió "opción 1", "combo asadazo", etc.
      if (itemsToOrder.length === 0 && isSelectingComboOption) {
        const optionMatch = userMsg.match(/(?:opci[oó]n\s*([1-3])|el\s*([1-3])|la\s*([1-3]))/);
        const optNum = optionMatch ? (optionMatch[1] || optionMatch[2] || optionMatch[3]) : '1';
        
        if (optNum === '1') {
          itemsToOrder = [
            '• 1.5 kg Vacío Especial Seleccionado — $17.250',
            '• 1.5 kg Costillar / Asado de Tira Novillito — $14.700',
            '• 6 Chorizos Criollos Puro Cerdo — $3.750',
            '• 1 Bolsa de Carbón Quebracho — $2.200'
          ];
          totalAmountToOrder = 37900;
        } else if (optNum === '2') {
          itemsToOrder = [
            '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999'
          ];
          totalAmountToOrder = 39999;
        } else {
          itemsToOrder = [
            '• 2 kg Tapa de Cuadril Seleccionada — $25.600',
            '• 1 kg Matambrito de Cerdo Tiernizado — $8.500',
            '• 1 Bolsa de Carbón Quebracho — $2.200'
          ];
          totalAmountToOrder = 36300;
        }
      }

      // 3. Buscar si ya existe una orden activa (pending o preparing) para este JID
      let activeOrder = db.getActiveOrdersByJid(clientJid)[0] || null;

      // 4. Si el cliente mencionó nuevos cortes o combos, crear o actualizar la orden
      if (itemsToOrder.length > 0) {
        if (activeOrder && ['pending', 'preparing', 'draft'].includes(activeOrder.status)) {
          // Actualizar orden existente
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
            branch: clientLead.preferredBranch || 'URCA CENTRAL'
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
      const hasAddressMatch = userMsg.match(/(?:calle|av\.|avenida|barrio|bv\.|bulevar|pasaje|entrega en|enviar a|mandamelo a|direcci[oó]n:?)\s+([a-zA-Z0-9\s,\.\-]+)/i);
      if (hasAddressMatch && activeOrder) {
        const extractedAddress = hasAddressMatch[1].trim();
        if (extractedAddress.length > 5) {
          db.updateOrder(activeOrder.id, {
            address: extractedAddress,
            deliveryType: 'delivery'
          });
          if (clientLead.jid || clientLead.id) {
            db.updateLead(clientLead.jid || clientLead.id, {
              address: extractedAddress,
              deliveryType: 'delivery'
            });
          }
        }
      }

      // 6. Detección de Sucursal para retiro
      const isBranchPickup = /(?:sucursal|retiro|pasar a buscar|retiro por|urca|funes|pidal|tejeda|intercountry|alamos|quiros|allende|san isidro)/i.test(userMsg);
      if (isBranchPickup && activeOrder) {
        let branchName = 'URCA CENTRAL (Av. José Roque Funes 1115)';
        if (/pidal|tejeda|urca 2/i.test(userMsg)) branchName = 'URCA 2 – ALTO TEJEDA (Av. Menéndez Pidal 3575)';
        else if (/intercountry|alamos|corteza/i.test(userMsg)) branchName = 'INTERCOUNTRY – CORTEZA MALL (Av. Los Álamos 1015)';
        else if (/quiros|duarte/i.test(userMsg)) branchName = 'DUARTE QUIRÓS (Av. Duarte Quirós 5130)';
        else if (/allende|figueroa|mercadito/i.test(userMsg)) branchName = 'VILLA ALLENDE (Av. Figueroa Alcorta 480)';
        else if (/san isidro|luchesse/i.test(userMsg)) branchName = 'COUNTRY SAN ISIDRO (Av. Padre Luchesse km 2)';

        db.updateOrder(activeOrder.id, {
          branch: branchName,
          deliveryType: 'pickup'
        });
        if (clientLead.jid || clientLead.id) {
          db.updateLead(clientLead.jid || clientLead.id, {
            preferredBranch: branchName,
            deliveryType: 'pickup'
          });
        }
      }

      // 7. Detección de Medio de Pago
      if (/(?:efectivo|transferencia|mercado pago|mp|alias)/i.test(userMsg) && activeOrder) {
        let paymentMethod = 'Efectivo';
        if (/transferencia|alias/i.test(userMsg)) paymentMethod = 'Transferencia (republica.carne.mp)';
        else if (/mercado pago|mp/i.test(userMsg)) paymentMethod = 'Mercado Pago (Link / Tarjetas)';

        db.updateOrder(activeOrder.id, { paymentMethod });
      }

      return activeOrder;
    } catch (err) {
      console.error('⚠️ [OrderSyncEngine] Error sincronizando pedido:', err);
      return null;
    }
  }

  /**
   * Parser inteligente de productos, unidades y precios
   */
  static extractProductsFromText(text, catalog) {
    const products = [];
    const items = [];
    let total = 0;

    const lowerText = text.toLowerCase();
    for (const prod of catalog) {
      const prodName = prod.name.toLowerCase();
      // Palabras clave o nombre del producto
      const isMentioned = lowerText.includes(prodName) || 
        (prod.plu && lowerText.includes(prod.plu)) ||
        (Array.isArray(prod.keywords) && prod.keywords.some(kw => lowerText.includes(kw.toLowerCase())));

      if (isMentioned) {
        // Extraer cantidad
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
