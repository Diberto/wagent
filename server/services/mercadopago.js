import { db } from './database.js';

export class MercadoPagoService {
  constructor() {
    this.baseUrl = 'https://api.mercadopago.com';
  }

  /**
   * Obtiene las credenciales activas y almacena simultáneamente Sandbox y Producción
   */
  getCredentials() {
    const settings = db.getSettings() || {};
    
    // Sandbox Credentials
    const sandboxAccessToken = settings.mercadopagoAccessTokenSandbox || settings.mercadopagoSandboxAccessToken;
    const sandboxPublicKey = settings.mercadopagoPublicKeySandbox;

    // Production Credentials
    const prodAccessToken = settings.mercadopagoAccessTokenProduction || settings.mercadopagoAccessToken;
    const prodPublicKey = settings.mercadopagoPublicKeyProduction || settings.mercadopagoPublicKey;

    let mode = settings.mercadopagoMode;
    // Si no está explícito o es sandbox pero el token es APP_USR-, auto-ajustar a producción
    if (!mode) {
      if (prodAccessToken?.startsWith('APP_USR-')) {
        mode = 'production';
      } else if (sandboxAccessToken?.startsWith('TEST-') || prodAccessToken?.startsWith('TEST-')) {
        mode = 'sandbox';
      } else {
        mode = 'production';
      }
    } else if (mode === 'sandbox' && prodAccessToken?.startsWith('APP_USR-') && !sandboxAccessToken?.startsWith('TEST-')) {
      // Si configuró APP_USR pero el modo decía sandbox, priorizar producción real porque APP_USR falla en sandbox
      mode = 'production';
    }

    const isSandbox = mode === 'sandbox';
    const activeAccessToken = isSandbox ? (sandboxAccessToken || prodAccessToken) : (prodAccessToken || sandboxAccessToken);
    const activePublicKey = isSandbox ? (sandboxPublicKey || prodPublicKey) : (prodPublicKey || sandboxPublicKey);

    return {
      mode,
      isSandbox,
      accessToken: activeAccessToken,
      publicKey: activePublicKey,
      sandboxAccessToken,
      sandboxPublicKey,
      prodAccessToken,
      prodPublicKey,
      appId: settings.mercadopagoAppId || '963262173359779',
      userId: settings.mercadopagoUserId || '2050924390',
      testUser: settings.mercadopagoTestUser || 'TESTUSER1028937958',
      enabled: settings.mercadopagoEnabled !== false,
      autoSendLink: settings.mercadopagoAutoSendLink !== false,
      webhookSecret: settings.mercadopagoWebhookSecret || ''
    };
  }

  /**
   * Verifica la conexión y validez de las credenciales con Mercado Pago
   */
  async testConnection(customToken = null) {
    const creds = this.getCredentials();
    const tokenToTest = customToken || creds.accessToken;
    if (!tokenToTest) {
      return { success: false, error: 'No se ha configurado el Access Token de Mercado Pago' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${tokenToTest}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        return { success: false, error: errData.message || 'Error de autenticación en Mercado Pago' };
      }

      const data = await response.json();
      return {
        success: true,
        mode: creds.mode,
        isSandbox: creds.isSandbox,
        user: {
          id: data.id,
          nickname: data.nickname,
          email: data.email,
          countryId: data.country_id,
          siteId: data.site_id
        }
      };
    } catch (err) {
      console.error('Error conectando con Mercado Pago:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Construye el listado detallado de ítems para la preferencia de Mercado Pago
   */
  formatPreferenceItems(orderData, modeTag = '') {
    const amount = Number(orderData.totalAmount) || 0;
    const items = [];

    // 1. Si ya vienen productos estructurados (orderData.products)
    if (Array.isArray(orderData.products) && orderData.products.length > 0) {
      for (const p of orderData.products) {
        const q = Math.max(1, Math.round(Number(p.quantity) || 1));
        const unitPrice = Math.max(1, Math.round(Number(p.price) || (Number(p.subtotal) / q) || 0));
        items.push({
          id: String(p.id || p.name).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50),
          title: `${modeTag ? modeTag + ' ' : ''}${p.name || 'Corte de Carnicería'}`.slice(0, 255),
          description: `${p.quantity || 1} ${p.unit || 'kg'} - República de la Carne`.slice(0, 255),
          quantity: q,
          currency_id: 'ARS',
          unit_price: unitPrice
        });
      }
    } else if (Array.isArray(orderData.items) && orderData.items.length > 0) {
      // 2. Parser de strings de ítems como "• 1 combo Combo “Asadazo” — $39.999" o "2 kg Tapa de Cuadril — $25.600"
      for (const raw of orderData.items) {
        if (typeof raw === 'object' && raw !== null) {
          const q = Math.max(1, Math.round(Number(raw.quantity) || 1));
          const price = Math.max(1, Math.round(Number(raw.price) || (Number(raw.total) / q) || (Number(raw.subtotal) / q) || 0));
          items.push({
            id: String(raw.id || raw.name || 'item').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50),
            title: `${modeTag ? modeTag + ' ' : ''}${raw.name || 'Corte de Carne'}`.slice(0, 255),
            description: `${raw.quantity || 1} ${raw.unit || 'kg'} - República de la Carne`.slice(0, 255),
            quantity: q,
            currency_id: 'ARS',
            unit_price: price
          });
          continue;
        }

        const str = String(raw).replace(/^[•\-\*\s]+/, '').trim();
        const priceMatch = str.match(/—\s*\$\s*([\d\.\,]+)/);
        const price = priceMatch ? parseInt(priceMatch[1].replace(/\D/g, ''), 10) : 0;
        
        const qtyMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|combo|un|unidades?|botellas?|bolsas?)?\s+(.+?)(?:\s*—|\s*\(|\s*\$|$)/i);
        const qty = qtyMatch ? Math.max(1, Math.round(parseFloat(qtyMatch[1].replace(',', '.')))) : 1;
        const name = qtyMatch ? qtyMatch[3].trim() : str.split('—')[0].trim();
        const unitPrice = price > 0 ? Math.round(price / qty) : amount;

        items.push({
          id: name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50),
          title: `${modeTag ? modeTag + ' ' : ''}${name}`.slice(0, 255),
          description: `${qty} ${qtyMatch ? qtyMatch[2] : 'un'} - República de la Carne`.slice(0, 255),
          quantity: qty,
          currency_id: 'ARS',
          unit_price: unitPrice || amount
        });
      }
    }

    // 3. Validar si la suma de ítems coincide con el monto total del pedido
    const itemsSum = items.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0);
    if (items.length === 0 || itemsSum <= 0 || (amount > 0 && Math.abs(itemsSum - amount) > 5)) {
      const description = Array.isArray(orderData.items) && orderData.items.length > 0
        ? orderData.items.map(i => typeof i === 'string' ? i : `${i.quantity || 1} ${i.unit || 'kg'} ${i.name}`).join(' • ')
        : (typeof orderData.items === 'string' && orderData.items.trim() ? orderData.items : 'Cortes de carne y productos parrilleros seleccionados');

      return [
        {
          id: String(orderData.id || 'ORD-CARNE').slice(0, 50),
          title: `${modeTag ? modeTag + ' ' : ''}Pedido #${orderData.id || 'ORD'} - ${orderData.customerName || 'Cliente'}`.slice(0, 255),
          description: String(description).slice(0, 255),
          quantity: 1,
          currency_id: 'ARS',
          unit_price: amount > 0 ? amount : 1000
        }
      ];
    }

    return items;
  }

  /**
   * Crea una Preferencia de Pago Checkout Pro para un pedido dinámicamente con desglose de cortes y Sandbox
   */
  async createPaymentPreference(orderData) {
    const creds = this.getCredentials();
    if (!creds.enabled) {
      throw new Error('La integración de Mercado Pago está deshabilitada en la configuración');
    }
    if (!creds.accessToken) {
      throw new Error('Falta el Access Token de Mercado Pago');
    }

    const settings = db.getSettings() || {};
    const businessName = settings.businessName || 'República de la Carne';

    const orderId = orderData.id || `ORD-${Date.now()}`;
    const amount = Number(orderData.totalAmount) || 1000;
    const modeTag = creds.isSandbox ? '[TEST SANDBOX]' : '';

    const preferenceItems = this.formatPreferenceItems(orderData, modeTag);

    const preferencePayload = {
      items: preferenceItems,
      payer: {
        name: orderData.customerName || 'Cliente',
        phone: {
          number: String(orderData.phone || '').replace(/\D/g, '')
        }
      },
      external_reference: String(orderId),
      statement_descriptor: 'REP CARNE',
      binary_mode: true,
      back_urls: {
        success: 'https://mercadopago.com.ar',
        failure: 'https://mercadopago.com.ar',
        pending: 'https://mercadopago.com.ar'
      },
      auto_return: 'approved'
    };

    try {
      const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferencePayload)
      });

      if (!response.ok) {
        const errorDetail = await response.json();
        console.error('Error creando preferencia en Mercado Pago:', errorDetail);
        throw new Error(errorDetail.message || 'Error al generar link de Mercado Pago');
      }

      const preference = await response.json();

      // Si el token es de producción (APP_USR-), SIEMPRE entregar preference.init_point para evitar error de sandbox
      const isRealProd = creds.accessToken?.startsWith('APP_USR-');
      const checkoutUrl = (!isRealProd && creds.isSandbox && preference.sandbox_init_point)
        ? preference.sandbox_init_point 
        : (preference.init_point || preference.sandbox_init_point);

      // Actualizar el pedido en la base de datos con el link generado y modo
      db.updateOrder(orderId, {
        paymentLink: checkoutUrl,
        mercadopagoPreferenceId: preference.id,
        mercadopagoMode: creds.mode,
        sandboxPaymentLink: preference.sandbox_init_point
      });

      return {
        id: preference.id,
        mode: creds.mode,
        isSandbox: creds.isSandbox,
        checkoutUrl,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
        orderId,
        amount,
        itemsCount: preferenceItems.length
      };
    } catch (err) {
      console.error('Error generando preferencia de Mercado Pago:', err);
      throw err;
    }
  }

  /**
   * Consulta el estado de un Merchant Order de Mercado Pago
   */
  async getMerchantOrder(merchantOrderId) {
    const { accessToken } = this.getCredentials();
    try {
      const response = await fetch(`${this.baseUrl}/merchant_orders/${merchantOrderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error consultando merchant_order #${merchantOrderId}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Error consultando merchant order de Mercado Pago:', err);
      throw err;
    }
  }

  /**
   * Procesa de forma unificada y resiliente cualquier notificación de Mercado Pago (Webhook o IPN)
   */
  async processNotification({ body = {}, query = {}, headers = {} }) {
    const topic = body.type || body.topic || query.topic || query.type;
    let paymentId = body.data?.id || body.id || query['data.id'] || query.id;

    // Si viene en formato de recurso URL (ej: "resource": "https://api.mercadopago.com/v1/payments/12345")
    if (!paymentId && body.resource) {
      const match = String(body.resource).match(/\/(\d+)$/);
      if (match) paymentId = match[1];
    }

    // 1. Si es notificación de tipo Payment
    if ((topic === 'payment' || body.action === 'payment.created' || body.action === 'payment.updated') && paymentId) {
      const payment = await this.getPayment(paymentId);
      if (!payment) return { handled: false, error: 'No se encontró el pago' };

      const orderId = payment.external_reference;
      const isApproved = payment.status === 'approved' || payment.status === 'accredited';

      if (orderId && isApproved) {
        const updatedOrder = db.updateOrder(orderId, {
          paymentStatus: 'paid',
          paymentMethod: payment.payment_method_id ? `Mercado Pago (${payment.payment_method_id.toUpperCase()})` : 'Mercado Pago',
          status: 'preparing',
          mercadopagoPaymentId: String(payment.id),
          paidAmount: payment.transaction_amount,
          paidAt: payment.date_approved || new Date().toISOString()
        });

        return {
          handled: true,
          type: 'payment',
          status: 'approved',
          orderId,
          paymentId: payment.id,
          amount: payment.transaction_amount,
          order: updatedOrder,
          payment
        };
      }

      return {
        handled: true,
        type: 'payment',
        status: payment.status,
        orderId,
        paymentId: payment.id,
        payment
      };
    }

    // 2. Si es notificación de tipo Merchant Order
    if ((topic === 'merchant_order' || body.action === 'merchant_order.updated') && paymentId) {
      const merchantOrder = await this.getMerchantOrder(paymentId);
      const orderId = merchantOrder.external_reference;
      const approvedPayment = (merchantOrder.payments || []).find(p => p.status === 'approved' || p.status === 'accredited');

      if (orderId && approvedPayment) {
        const updatedOrder = db.updateOrder(orderId, {
          paymentStatus: 'paid',
          paymentMethod: 'Mercado Pago (Merchant Order)',
          status: 'preparing',
          mercadopagoPaymentId: String(approvedPayment.id),
          paidAmount: approvedPayment.transaction_amount || merchantOrder.total_amount,
          paidAt: approvedPayment.date_approved || new Date().toISOString()
        });

        return {
          handled: true,
          type: 'merchant_order',
          status: 'approved',
          orderId,
          paymentId: approvedPayment.id,
          amount: approvedPayment.transaction_amount,
          order: updatedOrder,
          merchantOrder
        };
      }

      return {
        handled: true,
        type: 'merchant_order',
        status: merchantOrder.order_status || 'opened',
        orderId,
        merchantOrder
      };
    }

    return { handled: false, message: 'Notificación ignorada o sin ID procesable' };
  }

  /**
   * Consulta el estado de un pago específico por ID de pago de Mercado Pago
   */
  async getPayment(paymentId) {
    const { accessToken } = this.getCredentials();
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error consultando pago #${paymentId}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Error consultando pago de Mercado Pago:', err);
      throw err;
    }
  }

  /**
   * Verifica en vivo si un pedido tiene pagos aprobados en Mercado Pago buscando por external_reference
   */
  async verifyOrderPayment(orderId) {
    const { accessToken } = this.getCredentials();
    if (!accessToken) {
      return { verified: false, error: 'Sin Access Token configurado' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        return { verified: false, error: 'Error al consultar pagos en Mercado Pago' };
      }

      const data = await response.json();
      const results = data.results || [];
      const approvedPayment = results.find(p => p.status === 'approved');

      if (approvedPayment) {
        // Actualizar la orden como pagada
        const updatedOrder = db.updateOrder(orderId, {
          paymentStatus: 'paid',
          paymentMethod: 'mercadopago',
          status: 'preparing',
          mercadopagoPaymentId: approvedPayment.id,
          paidAmount: approvedPayment.transaction_amount,
          paidAt: approvedPayment.date_approved || new Date().toISOString()
        });

        return {
          verified: true,
          status: 'approved',
          paymentId: approvedPayment.id,
          amount: approvedPayment.transaction_amount,
          dateApproved: approvedPayment.date_approved,
          order: updatedOrder
        };
      }

      const latestPayment = results[0] || null;
      return {
        verified: false,
        status: latestPayment ? latestPayment.status : 'unpaid',
        paymentId: latestPayment ? latestPayment.id : null,
        message: latestPayment ? `Estado en MP: ${latestPayment.status}` : 'No se encontraron pagos registrados para este pedido'
      };
    } catch (err) {
      console.error(`Error verificando pago para pedido ${orderId}:`, err);
      return { verified: false, error: err.message };
    }
  }

  /**
   * Asignación y registro manual de pago (Efectivo, Transferencia, POS o Mercado Pago manual)
   */
  updateOrderPaymentManual(orderId, { paymentMethod = 'cash', paymentStatus = 'paid', paidAmount = null, cashReceived = null, changeAmount = null, transactionRef = '', notes = '' }) {
    const order = db.getOrder(orderId);
    if (!order) return null;

    const total = Number(order.totalAmount) || 0;
    const amount = paidAmount !== null ? Number(paidAmount) : total;
    const received = cashReceived !== null && cashReceived !== '' ? Number(cashReceived) : (paymentMethod?.toLowerCase().includes('efectivo') ? amount : null);
    const change = changeAmount !== null && changeAmount !== '' ? Number(changeAmount) : (received !== null ? Math.max(0, received - amount) : 0);

    const updates = {
      paymentMethod,
      paymentStatus,
      paidAmount: amount,
      cashReceived: received,
      changeAmount: change,
      paymentReference: transactionRef,
      paymentNotes: notes,
      paidAt: paymentStatus === 'paid' ? (order.paidAt || new Date().toISOString()) : null
    };

    if (paymentStatus === 'paid' && order.status === 'pending') {
      updates.status = 'preparing';
    }

    return db.updateOrder(orderId, updates);
  }
}

export const mercadoPagoService = new MercadoPagoService();
