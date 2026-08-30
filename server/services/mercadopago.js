import { db } from './database.js';

class MercadoPagoService {
  constructor() {
    this.baseUrl = 'https://api.mercadopago.com';
  }

  getCredentials() {
    const settings = db.getSettings();
    const mode = settings.mercadopagoMode || 'sandbox'; // 'sandbox' | 'production'
    const isSandbox = mode === 'sandbox';

    // Live Access Token
    const prodAccessToken = settings.mercadopagoAccessToken || 'APP_USR-963262173359779-083015-7a288c6669f44248572a6202c5de2fb0-2050924390';
    // Sandbox Access Token
    const sandboxAccessToken = settings.mercadopagoSandboxAccessToken || settings.mercadopagoAccessToken || 'APP_USR-963262173359779-083015-7a288c6669f44248572a6202c5de2fb0-2050924390';

    const activeAccessToken = isSandbox ? sandboxAccessToken : prodAccessToken;

    return {
      mode,
      isSandbox,
      accessToken: activeAccessToken,
      prodAccessToken,
      sandboxAccessToken,
      publicKey: settings.mercadopagoPublicKey || 'APP_USR-f2e52862-ab7d-411d-a43f-3e6c417eff9e',
      appId: settings.mercadopagoAppId || '963262173359779',
      userId: settings.mercadopagoUserId || '2050924390',
      testUser: settings.mercadopagoTestUser || 'TESTUSER1028937958',
      enabled: settings.mercadopagoEnabled !== false,
      autoSendLink: settings.mercadopagoAutoSendLink !== false
    };
  }

  /**
   * Verifica la conexión y validez de las credenciales con Mercado Pago
   */
  async testConnection() {
    const creds = this.getCredentials();
    if (!creds.accessToken) {
      return { success: false, error: 'No se ha configurado el Access Token de Mercado Pago' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`
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
   * Crea una Preferencia de Pago Checkout Pro para un pedido
   */
  async createPaymentPreference(orderData) {
    const creds = this.getCredentials();
    if (!creds.enabled) {
      throw new Error('La integración de Mercado Pago está deshabilitada en la configuración');
    }
    if (!creds.accessToken) {
      throw new Error('Falta el Access Token de Mercado Pago');
    }

    const settings = db.getSettings();
    const businessName = settings.businessName || 'República de la Carne';

    const orderId = orderData.id || `ORD-${Date.now()}`;
    const amount = Number(orderData.totalAmount) || 1000;
    const modeTag = creds.isSandbox ? '[TEST / SANDBOX]' : '';
    const title = `${modeTag} Pedido #${orderId} - ${businessName}`.trim();
    const description = Array.isArray(orderData.items) 
      ? orderData.items.join(' • ') 
      : (orderData.items || 'Cortes de carne y productos parrilleros');

    const preferencePayload = {
      items: [
        {
          id: String(orderId),
          title: title.slice(0, 255),
          description: description.slice(0, 255),
          quantity: 1,
          currency_id: 'ARS',
          unit_price: amount
        }
      ],
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

      // Si el token es de producción (APP_USR-), usar siempre init_point para evitar el error de sesión en sandbox
      const isTokenProd = creds.accessToken && creds.accessToken.startsWith('APP_USR');
      const checkoutUrl = (creds.isSandbox && !isTokenProd && preference.sandbox_init_point)
        ? preference.sandbox_init_point 
        : preference.init_point;

      return {
        id: preference.id,
        mode: creds.mode,
        isSandbox: creds.isSandbox,
        checkoutUrl,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
        orderId
      };
    } catch (err) {
      console.error('Error generando preferencia de Mercado Pago:', err);
      throw err;
    }
  }

  /**
   * Consulta el estado de un pago específico
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
}

export const mercadoPagoService = new MercadoPagoService();
