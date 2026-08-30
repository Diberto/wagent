import { db } from './database.js';
import { mercadoPagoService } from './mercadopago.js';
import { SpeechService } from './speech.js';

export class ElevenLabsAgentService {
  static DEFAULT_AGENT_ID = 'agent_3701khpbdw76fyqb7pd3gj6a1a8g';
  static DEFAULT_VOICE_ID = '9rvdnhrYoXoUt4igKpBw';
  static DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
  static DEFAULT_FIRST_MESSAGE = '¡Hola! Gracias por comunicarte con nosotros, ¿en qué puedo ayudarte hoy?';

  /**
   * Obtiene la configuración actual del Agente Conversacional de ElevenLabs
   */
  static getAgentConfig() {
    const settings = db.getSettings();
    return {
      agentId: settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID,
      voiceId: settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
      modelId: settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
      agentName: settings.elevenlabsAgentName || 'República de la Carne',
      agentEnabled: settings.elevenlabsAgentEnabled ?? true,
      firstMessage: settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE,
      hasApiKey: Boolean(settings.elevenlabsApiKey && settings.elevenlabsApiKey.startsWith('sk_')),
      wsEndpoint: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID}`
    };
  }

  /**
   * Genera una URL firmada (Signed URL) para conectar al WebSocket de forma segura desde el navegador
   * Ref: https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket
   */
  static async getSignedUrl(customAgentId = null) {
    const settings = db.getSettings();
    const agentId = customAgentId || settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID;
    const apiKey = settings.elevenlabsApiKey;

    if (!apiKey) {
      // Si no hay API key o es agente público, retorna la URL directa estándar
      return {
        success: true,
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
        agentId,
        isSigned: false
      };
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[ElevenLabs ConvAI] No se pudo obtener Signed URL (${response.status}): ${errText}. Usando conexión directa...`);
        return {
          success: true,
          signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
          agentId,
          isSigned: false
        };
      }

      const data = await response.json();
      return {
        success: true,
        signedUrl: data.signed_url,
        agentId,
        isSigned: true
      };
    } catch (error) {
      console.error('[ElevenLabs ConvAI] Error solicitando signed URL:', error);
      return {
        success: true,
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
        agentId,
        isSigned: false
      };
    }
  }

  /**
   * Construye el payload de inicialización "conversation_initiation_client_data"
   * según la especificación oficial de ElevenLabs WebSocket
   */
  static buildInitiationClientData({
    lead = null,
    customerName = null,
    phoneNumber = null,
    address = null,
    customFirstMessage = null,
    extraVariables = {}
  } = {}) {
    const settings = db.getSettings();
    const name = customerName || lead?.name || 'Cliente';
    const phone = phoneNumber || lead?.phone || lead?.jid?.split('@')[0] || '';
    const addr = address || lead?.address || '';
    const firstMsg = customFirstMessage || settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE;

    // Buscar último pedido si existe
    let lastOrderSummary = '';
    if (lead?.jid) {
      const lastOrder = db.getLatestOrderByJid(lead.jid);
      if (lastOrder) {
        lastOrderSummary = `Pedido #${lastOrder.id}: ${(lastOrder.items || []).join(', ')} ($${(lastOrder.totalAmount || 0).toLocaleString('es-AR')})`;
      }
    }

    return {
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          first_message: firstMsg,
          language: 'es'
        },
        tts: {
          voice_id: settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
          model_id: settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
          stability: 0.5,
          speed: 1.11,
          similarity_boost: 0.8
        }
      },
      dynamic_variables: {
        customer_name: name,
        phone: phone,
        address: addr,
        last_order: lastOrderSummary,
        business_name: settings.businessName || 'República de la Carne',
        currency: 'ARS',
        city: 'Córdoba',
        ...extraVariables
      }
    };
  }

  /**
   * Verifica la conectividad y estado del Agente de ElevenLabs
   */
  static async testAgentConnection(customAgentId = null) {
    const settings = db.getSettings();
    const agentId = customAgentId || settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID;
    const apiKey = settings.elevenlabsApiKey;

    try {
      // 1. Probar endpoint de signed URL
      const signedRes = await this.getSignedUrl(agentId);
      
      // 2. Si hay API key, consultar detalles del agente
      let agentDetails = null;
      if (apiKey) {
        try {
          const detailRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
            headers: { 'xi-api-key': apiKey }
          });
          if (detailRes.ok) {
            agentDetails = await detailRes.json();
          }
        } catch (e) {
          // Ignorar si falla lectura directa
        }
      }

      return {
        success: true,
        agentId,
        name: agentDetails?.name || 'República de la Carne',
        voiceId: agentDetails?.conversation_config?.tts?.voice_id || settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
        modelId: agentDetails?.conversation_config?.tts?.model_id || settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
        firstMessage: agentDetails?.conversation_config?.agent?.first_message || settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE,
        wsEndpoint: signedRes.signedUrl,
        isSigned: signedRes.isSigned,
        status: 'ready'
      };
    } catch (err) {
      console.error('Error probando conexión con Agente de ElevenLabs:', err);
      return {
        success: false,
        agentId,
        error: err.message
      };
    }
  }

  // =========================================================================
  // HERRAMIENTAS BIDIRECCIONALES (ELEVENLABS AGENT <-> SISTEMA CENTRAL)
  // Permite que el agente de voz interactúe con productos, pedidos, sucursales,
  // leads y Mercado Pago en tiempo real.
  // =========================================================================

  /**
   * 1. Consulta de Catálogo y Precios en Tiempo Real
   */
  static getCatalogProducts({ category = null, search = null } = {}) {
    const dbProducts = db.getProducts();
    let list = dbProducts && dbProducts.length > 0 ? dbProducts : [
      { id: 'combo-1', name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', price: 39999, category: 'Combos', unit: 'combo', inStock: true },
      { id: 'vacio-1', name: 'Vacío Especial Seleccionado', price: 11500, category: 'Parrilla', unit: 'kg', inStock: true },
      { id: 'costillar-1', name: 'Costillar / Asado de Tira Novillito', price: 9800, category: 'Parrilla', unit: 'kg', inStock: true },
      { id: 'tapa-1', name: 'Tapa de Cuadril Seleccionada', price: 12800, category: 'Parrilla y Horno', unit: 'kg', inStock: true },
      { id: 'molida-esp', name: 'Carne Molida Especial Seleccionada (Magra)', price: 11800, category: 'Diario', unit: 'kg', inStock: true },
      { id: 'molida-int', name: 'Carne Molida Intermedia (3kg x $27.000 promo)', price: 9000, category: 'Diario', unit: 'kg', inStock: true },
      { id: 'cerdo-cost', name: 'Costeletas de Cerdo (2kg x $15.000 promo)', price: 7500, category: 'Cerdo', unit: 'kg', inStock: true },
      { id: 'chori-1', name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', price: 5000, category: 'Embutidos', unit: 'kg', inStock: true },
      { id: 'morcilla-1', name: 'Morcilla Bombón Parrillera', price: 5200, category: 'Embutidos', unit: 'kg', inStock: true },
      { id: 'carbon-1', name: 'Carbón Quebracho Blanco (Bolsa Grande)', price: 2200, category: 'Almacén', unit: 'bolsa', inStock: true },
      { id: 'vino-1', name: 'Vino Howlmande Malbec Reserva', price: 5500, category: 'Bebidas', unit: 'botella', inStock: true }
    ];

    const normalize = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    if (category) {
      const catNorm = normalize(category);
      list = list.filter(p => normalize(p.category).includes(catNorm));
    }
    if (search) {
      const q = normalize(search);
      list = list.filter(p => normalize(p.name).includes(q) || normalize(p.category).includes(q));
    }

    return {
      success: true,
      totalCount: list.length,
      products: list.map(p => ({
        name: p.name,
        price: p.price,
        unit: p.unit || 'kg',
        category: p.category,
        formattedPrice: `$${p.price.toLocaleString('es-AR')}`
      }))
    };
  }

  /**
   * 2. Consulta de Sucursales y Horarios
   */
  static getBranchesInfo() {
    return {
      success: true,
      city: 'Córdoba Capital y Gran Córdoba',
      branches: [
        {
          id: 1,
          name: 'Urca Central',
          address: 'Av. José Roque Funes 1115',
          hours: 'Lunes a Sábado 9:00 a 21:00 hs | Domingo 9:00 a 13:30 hs',
          phone: '+54 9 3513 906947'
        },
        {
          id: 2,
          name: 'Urca 2 (Alto Tejeda)',
          address: 'Av. Menéndez Pidal 3575',
          hours: 'Lunes a Sábado 9:00 a 21:00 hs',
          phone: '+54 9 3518 623195'
        },
        {
          id: 3,
          name: 'Intercountry (Corteza Mall)',
          address: 'Av. Los Álamos 1015',
          hours: 'Todos los días de 9:00 a 21:00 hs',
          phone: '+54 9 3518 623194'
        },
        {
          id: 4,
          name: 'Duarte Quirós',
          address: 'Av. Duarte Quirós 5130',
          hours: 'Lunes a Sábado 9:00 a 13:30 y 17:00 a 21:00 hs',
          phone: '+54 9 3518 156595'
        },
        {
          id: 5,
          name: 'Villa Allende (Mercadito de la Villa)',
          address: 'Av. Figueroa Alcorta 480',
          hours: 'Lunes a Sábado 9:00 a 21:00 hs',
          phone: '+54 9 3513 540031'
        },
        {
          id: 6,
          name: 'Country San Isidro',
          address: 'Av. Padre Luchesse km 2 (Villa Allende)',
          hours: 'Lunes a Sábado 9:00 a 21:00 hs',
          phone: '+54 9 3518 769099'
        }
      ]
    };
  }

  /**
   * 3. Creación de Pedido en Tiempo Real por el Agente de Voz
   */
  static async createOrderFromAgent({
    customerName,
    phoneNumber,
    address,
    items = [],
    deliveryType = 'delivery',
    branchName = null,
    paymentMethod = 'Efectivo contraentrega',
    notes = 'Pedido generado por Agente Conversacional ElevenLabs'
  }) {
    if (!customerName || !items || items.length === 0) {
      return { success: false, error: 'Faltan datos requeridos (customerName o items)' };
    }

    // Limpiar teléfono y jid
    const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
    const jid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : '';

    // Buscar o registrar lead
    const lead = db.saveOrUpdateLead({
      jid,
      phone: phoneNumber,
      name: customerName,
      pushName: customerName,
      address: address || 'Retiro en sucursal'
    });

    // Calcular total si los ítems son objetos o strings
    let parsedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      if (typeof item === 'string') {
        parsedItems.push(item);
        const match = item.match(/\$([0-9\.]+)/);
        if (match) {
          totalAmount += parseInt(match[1].replace(/\./g, ''), 10) || 0;
        }
      } else if (typeof item === 'object') {
        const qty = item.quantity || 1;
        const price = item.price || 0;
        const sub = price * qty;
        totalAmount += sub;
        parsedItems.push(`• ${qty}x ${item.name} — $${sub.toLocaleString('es-AR')}`);
      }
    }

    if (totalAmount === 0) totalAmount = 39999;

    // Crear orden en base de datos
    const newOrder = db.createOrder({
      jid: lead.jid || '',
      phone: phoneNumber || lead.phone,
      customerName: customerName,
      address: deliveryType === 'pickup' ? `Retiro en sucursal: ${branchName || 'Urca Central'}` : (address || lead.address || 'Domicilio'),
      items: parsedItems,
      totalAmount: totalAmount,
      paymentMethod: paymentMethod,
      deliveryType: deliveryType,
      status: 'pending',
      notes: notes
    });

    // Generar link de Mercado Pago si el método es Mercado Pago
    let paymentLink = null;
    if (/mercadopago|mercado pago|tarjeta|transferencia|mp/i.test(paymentMethod)) {
      try {
        const mpResult = await mercadoPagoService.createPaymentPreference({
          orderId: newOrder.id,
          customerName: customerName,
          customerEmail: 'cliente@republicadelacarne.com',
          amount: totalAmount,
          items: parsedItems.map(it => ({ title: it, quantity: 1, unit_price: totalAmount }))
        });
        if (mpResult?.initPoint) {
          paymentLink = mpResult.initPoint;
          db.updateOrder(newOrder.id, { paymentLink });
        }
      } catch (mpErr) {
        console.warn('Error generando link de Mercado Pago:', mpErr.message);
      }
    }

    return {
      success: true,
      orderId: newOrder.id,
      customerName: customerName,
      totalAmount: totalAmount,
      formattedTotal: `$${totalAmount.toLocaleString('es-AR')}`,
      deliveryType: deliveryType,
      paymentMethod: paymentMethod,
      paymentLink: paymentLink,
      status: newOrder.status,
      message: `¡Pedido #${newOrder.id} creado con éxito por un total de $${totalAmount.toLocaleString('es-AR')}!`
    };
  }

  /**
   * 4. Consulta del estado del pedido del cliente
   */
  static getCustomerOrderStatus(phoneNumberOrJid) {
    const clean = (phoneNumberOrJid || '').replace(/\D/g, '');
    const jid = clean ? `${clean}@s.whatsapp.net` : phoneNumberOrJid;

    const lastOrder = db.getLatestOrderByJid(jid);
    if (!lastOrder) {
      return {
        success: false,
        message: 'No se encontró ningún pedido registrado para este cliente.'
      };
    }

    const statusMap = {
      pending: 'Pendiente de preparación en carnicería',
      preparing: 'Cortes en preparación artesanal',
      in_transit: 'En camino con el repartidor a tu domicilio',
      delivered: 'Entregado con éxito',
      cancelled: 'Cancelado'
    };

    return {
      success: true,
      orderId: lastOrder.id,
      customerName: lastOrder.customerName,
      items: lastOrder.items,
      totalAmount: lastOrder.totalAmount,
      formattedTotal: `$${(lastOrder.totalAmount || 0).toLocaleString('es-AR')}`,
      address: lastOrder.address,
      status: lastOrder.status,
      statusDescription: statusMap[lastOrder.status] || 'Registrado',
      createdAt: lastOrder.createdAt
    };
  }

  /**
   * 5. Actualizar datos del cliente (Nombre, Dirección, Preferencias)
   */
  static updateCustomerData({ phoneNumber, name, address, notes }) {
    const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
    const jid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : '';

    const lead = db.saveOrUpdateLead({
      jid,
      phone: phoneNumber,
      realName: name,
      ...(name ? { name, pushName: name } : {}),
      ...(address ? { address } : {}),
      ...(notes ? { notes } : {})
    });

    if (name) {
      lead.name = name;
      lead.pushName = name;
    }
    if (address) {
      lead.address = address;
    }
    if (notes) {
      lead.notes = notes;
    }
    db.updateLead(lead.id, lead);

    return {
      success: true,
      customer: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        address: lead.address
      }
    };
  }

  /**
   * 6. Despachador de herramientas llamado por ElevenLabs Webhooks / Function Calls
   */
  static async executeTool(toolName, parameters = {}, context = {}) {
    console.log(`🛠️ [ElevenLabs Agent Tool Call] Ejecutando: ${toolName}`, parameters);

    switch (toolName) {
      case 'get_catalog_products':
      case 'get_products':
      case 'getProducts':
        return this.getCatalogProducts(parameters);

      case 'get_branches_info':
      case 'get_branches':
      case 'getBranches':
        return this.getBranchesInfo();

      case 'create_order':
      case 'createOrder':
        return await this.createOrderFromAgent(parameters);

      case 'get_customer_order_status':
      case 'get_order_status':
      case 'getOrderStatus':
        return this.getCustomerOrderStatus(parameters.phoneNumber || parameters.jid || context.phone);

      case 'update_customer_data':
      case 'update_customer':
      case 'updateCustomer':
        return this.updateCustomerData(parameters);

      default:
        return {
          success: false,
          error: `Herramienta desconocida: ${toolName}`
        };
    }
  }
}
