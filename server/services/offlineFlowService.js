import { db, parseArgentinePrice } from './database.js';

export const DEFAULT_OFFLINE_FLOW_CONFIG = {
  enabled: true,
  autoFallbackOnAiFailure: true,
  forceOfflineMode: false,
  businessInfo: {
    name: 'República de la Carne',
    tagline: 'Carnes de Calidad Seleccionada en Córdoba',
    openingHours: 'Lunes a Sábados: 9:00 a 21:00 hs | Domingos: 9:00 a 13:30 hs',
    deliveryHours: 'Envíos en el día dentro de Córdoba Capital (pedidos antes de las 12 hs se entregan de 13 a 16 hs)',
    phone: '+54 9 351 626-2475'
  },
  steps: {
    welcome: {
      title: 'Menú Principal & Bienvenida',
      enabled: true,
      message: `¡Hola {customerName}! 👋 Bienvenido a *República de la Carne* 🥩

¿En qué podemos ayudarte hoy? Elegí una opción respondiendo con el número:

1️⃣ 🥩 *Ver Ofertas y Cortes de Hoy*
2️⃣ 🛒 *Hacer un Pedido Rápido*
3️⃣ 🔍 *Consultar Estado de mi Pedido*
4️⃣ 🏪 *Sucursales y Horarios de Atención*
5️⃣ 🛵 *Información de Envíos a Domicilio*
6️⃣ 👤 *Hablar con un Asesor Humano*

*(Escribí el número de la opción o lo que necesites)*`
    },
    catalog: {
      title: 'Catálogo & Ofertas Destacadas',
      enabled: true,
      headerMessage: '🥩 *CORTES Y PROMOS DESTACADAS DE HOY:* 🥩\n*(Precios actualizados de carnicería)*\n\n',
      footerMessage: '\n👉 *Para hacer tu pedido:* respondé con el corte y cantidad (ej: *"2 kg de vacío y 1 kg de costillar"*) o respondé *2* para iniciar el pedido paso a paso.\n*(Respondé 0 para volver al Menú Principal)*',
      includeDynamicProducts: true,
      maxProductsToShow: 8
    },
    orderIntake: {
      title: 'Toma de Pedidos Guiada (Offline)',
      enabled: true,
      promptItems: `🛒 *ARMÁ TU PEDIDO:*\n\nIndicame qué cortes, combos o productos querés y las cantidades.\n\n*Ejemplos:* \n• "2 kg de vacío y 1 kg de costillar"\n• "Combo Asadazo y 1 bolsa de carbón"\n• "6 chorizos criollos y 1 kg de bife de chorizo"\n\n*(Escribí tus cortes o respondé 1 para ver el catálogo)*`,
      promptDeliveryType: `👉 *¿Cómo preferís recibir tu pedido?*\n\n1️⃣ 🛵 *Envío a Domicilio* (reparto en el día)\n2️⃣ 🏪 *Retiro por Sucursal* (6 sedes en Córdoba)\n\n*(Respondé 1 para envío o 2 para retiro)*`,
      promptAddress: `📍 *Por favor indicame tu Dirección de Entrega y Barrio en Córdoba:*\n(Ejemplo: *Av. Menéndez Pidal 3575, Urca*):`,
      promptBranch: `🏪 *Elegí la sucursal por donde pasarás a retirar:*\n\n1️⃣ *URCA CENTRAL* (Av. José Roque Funes 1115)\n2️⃣ *URCA 2 – ALTO TEJEDA* (Av. Menéndez Pidal 3575)\n3️⃣ *CORTEZA MALL* (Av. Los Álamos 1015, Intercountry)\n4️⃣ *DUARTE QUIRÓS* (Av. Duarte Quirós 5130)\n5️⃣ *VILLA ALLENDE* (Av. Figueroa Alcorta 480)\n6️⃣ *COUNTRY SAN ISIDRO* (Av. Padre Luchesse km 2)\n\n*(Respondé del 1 al 6)*`,
      promptPayment: `💳 *¿Cómo vas a abonar tu pedido?*\n\n1️⃣ 💵 *Efectivo contraentrega*\n2️⃣ 📲 *Transferencia Bancaria (Alias)*\n3️⃣ 💳 *Mercado Pago (Tarjeta de Crédito / Débito)*\n\n*(Respondé 1, 2 o 3)*`,
      confirmTemplate: `¡Excelente {customerName}! 🎉 Ya registramos tu pedido:\n\n🆔 *Pedido #{orderId}*\n📋 *Detalle del Pedido:*\n{itemsList}\n💰 *Total Estimado:* *AR$ {totalAmount}*\n{deliveryInfo}\n💳 *Forma de Pago:* {paymentMethod}\n\n🥩 Nuestro equipo de carnicería ya lo tiene en pantalla para prepararlo con cortes frescos. ¡Muchas gracias por elegir República de la Carne! 🙌\n\n*(Podés consultar el estado de tu pedido en cualquier momento respondiendo 3)*`
    },
    orderStatus: {
      title: 'Consulta de Estado de Pedido',
      enabled: true,
      foundTemplate: `🔍 *ESTADO EN VIVO DE TU PEDIDO #{orderId}:*\n\n📋 *Cortes:* \n{itemsList}\n💰 *Total:* AR$ {totalAmount}\n📍 *Modalidad:* {deliveryInfo}\n⏱️ *Estado actual:* **{statusLabel}** {statusIcon}\n\n🥩 Si tenés alguna consulta adicional sobre tu entrega o necesitás coordinar algo, avisanos por acá.`,
      notFoundTemplate: `🔍 No encontramos ningún pedido activo asociado a tu número de WhatsApp.\n\n👉 Respondé *2* para realizar un pedido nuevo o escribí lo que necesites.`
    },
    branches: {
      title: 'Sucursales y Horarios',
      enabled: true,
      message: `🏪 *NUESTRAS SUCURSALES EN CÓRDOBA:*\n\n• *URCA CENTRAL:* Av. José Roque Funes 1115, Barrio Urca\n• *URCA 2 – ALTO TEJEDA:* Av. Menéndez Pidal 3575, Urca\n• *CORTEZA MALL:* Av. Los Álamos 1015, Intercountry\n• *DUARTE QUIRÓS:* Av. Duarte Quirós 5130\n• *VILLA ALLENDE:* Av. Figueroa Alcorta 480\n• *COUNTRY SAN ISIDRO:* Av. Padre Luchesse km 2\n\n🕒 *Horarios:* Lunes a Sábados de 9:00 a 21:00 hs | Domingos de 9:00 a 13:30 hs.\n\n👉 Respondé *0* para volver al Menú Principal.`
    },
    deliveryInfo: {
      title: 'Información de Envíos',
      enabled: true,
      message: `🛵 *LOGÍSTICA Y ENVÍOS A DOMICILIO:* 🛵\n\n• *Zona de cobertura:* Toda la zona norte y centro de Córdoba Capital.\n• *Regla de corte 12:00 hs:* Pedidos confirmados antes de las 12:00 hs se entregan el mismo día entre las 13:00 y 16:00 hs.\n• *Pedidos de la tarde:* Se programan para el turno tarde/noche o primera hora del día siguiente.\n• *Vehículos refrigerados:* Conservamos la cadena de frío para cortes frescos de calidad.\n\n👉 Respondé *2* para armar tu pedido o *0* para volver al Menú Principal.`
    },
    humanHandoff: {
      title: 'Derivación a Asesor Humano',
      enabled: true,
      message: `👤 *¡Un asesor de nuestro equipo tomará tu conversación en breve!*\n\nDejanos tu consulta o pedido por escrito y un operador humano te responderá enseguida. 🥩🙌\n\n*(Si querés volver al menú automático, respondé 0)*`
    }
  },
  keywordTriggers: [
    { keywords: ['menu', 'menú', 'inicio', 'empezar', 'opciones', 'hola', 'buenas', 'buen dia', 'buenas tardes', '0'], action: 'show_welcome' },
    { keywords: ['ofertas', 'oferta', 'precios', 'precio', 'cortes', 'catalogo', 'catálogo', 'cuanto sale', 'costilla', 'vacio', '1'], action: 'show_catalog' },
    { keywords: ['pedir', 'pedido', 'comprar', 'encargar', 'hacer pedido', 'armar pedido', '2'], action: 'start_order' },
    { keywords: ['estado', 'donde esta', 'cuándo llega', 'como va', 'tracking', 'mi pedido', '3'], action: 'check_order_status' },
    { keywords: ['sucursal', 'sucursales', 'donde estan', 'direccion', 'dirección', 'horario', 'horarios', 'abierto', '4'], action: 'show_branches' },
    { keywords: ['envios', 'envíos', 'envio', 'envío', 'delivery', 'flete', 'costo envio', '5'], action: 'show_delivery_info' },
    { keywords: ['humano', 'asesor', 'persona', 'operador', 'chatear', 'ayuda', '6'], action: 'handoff_human' }
  ]
};

export class OfflineFlowService {
  /**
   * Obtiene la configuración activa del Flujo Offline
   */
  static getConfig() {
    const dbData = db.readDb();
    if (!dbData.offlineFlow || typeof dbData.offlineFlow !== 'object') {
      dbData.offlineFlow = DEFAULT_OFFLINE_FLOW_CONFIG;
      db.writeDb(dbData);
    }
    return { ...DEFAULT_OFFLINE_FLOW_CONFIG, ...dbData.offlineFlow };
  }

  /**
   * Actualiza la configuración del Flujo Offline
   */
  static updateConfig(updates) {
    const current = this.getConfig();
    const updated = {
      ...current,
      ...updates,
      businessInfo: { ...current.businessInfo, ...(updates.businessInfo || {}) },
      steps: { ...current.steps, ...(updates.steps || {}) },
      keywordTriggers: updates.keywordTriggers || current.keywordTriggers,
      updatedAt: new Date().toISOString()
    };
    const dbData = db.readDb();
    dbData.offlineFlow = updated;
    db.writeDb(dbData);
    if (db.io) {
      db.io.emit('offlineFlow:update', updated);
    }
    return updated;
  }

  /**
   * Restablece la configuración del Flujo Offline a los valores por defecto
   */
  static resetConfig() {
    const dbData = db.readDb();
    dbData.offlineFlow = DEFAULT_OFFLINE_FLOW_CONFIG;
    db.writeDb(dbData);
    if (db.io) {
      db.io.emit('offlineFlow:update', DEFAULT_OFFLINE_FLOW_CONFIG);
    }
    return DEFAULT_OFFLINE_FLOW_CONFIG;
  }

  /**
   * Procesa un mensaje entrante mediante el Flujo Offline
   * Soporta tanto handleMessage({ jid, incomingText, lead }) como handleMessage(incomingText, jid, leadOrState)
   */
  static async handleMessage(arg1, arg2, arg3) {
    let jid = '';
    let incomingText = '';
    let lead = null;

    if (typeof arg1 === 'object' && arg1 !== null && ('incomingText' in arg1 || 'text' in arg1 || 'jid' in arg1)) {
      jid = arg1.jid || '';
      incomingText = arg1.incomingText || arg1.text || '';
      lead = arg1.lead || null;
    } else {
      incomingText = arg1 || '';
      jid = arg2 || '';
      lead = arg3 || null;
    }

    const res = await this._processMessage({ jid, incomingText, lead });
    if (!res) return null;
    return {
      text: res.text || '',
      reply: res.text || '',
      shouldSendAudio: Boolean(res.shouldSendAudio),
      session: res.session || null,
      nextState: res.session || null,
      createdOrder: res.createdOrder || null,
      orderCreated: res.createdOrder || null
    };
  }

  static async _processMessage({ jid, incomingText = '', lead = null }) {
    const cfg = this.getConfig();
    const text = String(incomingText || '').trim();
    const tLower = text.toLowerCase().trim();

    // Resolver datos del cliente
    const clientLead = (lead && lead.name ? lead : (jid ? db.getLead(jid) : null)) || lead || {};
    const rawName = clientLead.pushName || clientLead.name || '';
    const customerName = (rawName && !rawName.includes('+') && !rawName.startsWith('Cliente') && !rawName.startsWith('Contacto'))
      ? rawName
      : 'Cliente';

    // Sesión de conversación offline
    let session = (lead && lead.offlineSession) || (lead && lead.step ? lead : null) || clientLead.offlineSession || { step: 'idle', cart: [], deliveryType: null, address: '', branchId: null, paymentMethod: null };

    // Si el usuario escribe "0", "menu" o "inicio", reiniciamos al menú principal
    if (/^(?:0|menu|menú|inicio|empezar|cancelar|volver)$/i.test(tLower)) {
      session = { step: 'idle', cart: [], deliveryType: null, address: '', branchId: null, paymentMethod: null };
      this.saveSession(jid, clientLead, session);
      return {
        text: this.formatMessage(cfg.steps.welcome.message, { customerName }),
        shouldSendAudio: false,
        session
      };
    }

    // 1. Si está en medio de un paso guiado de toma de pedidos
    if (session.step && session.step !== 'idle') {
      const stepResult = await this.handleOrderIntakeStep({ jid, text, tLower, customerName, clientLead, session, cfg });
      if (stepResult) {
        this.saveSession(jid, clientLead, stepResult.session);
        return stepResult;
      }
    }

    // 2. Detección de selección de número directo en menú principal
    if (/^[1-6]$/.test(tLower)) {
      switch (tLower) {
        case '1':
          return {
            text: this.buildCatalogMessage(cfg),
            shouldSendAudio: false
          };
        case '2':
          session.step = 'awaiting_items';
          this.saveSession(jid, clientLead, session);
          return {
            text: cfg.steps.orderIntake.promptItems,
            shouldSendAudio: false,
            session
          };
        case '3':
          return {
            text: this.buildOrderStatusMessage(jid, clientLead, cfg),
            shouldSendAudio: false
          };
        case '4':
          return {
            text: cfg.steps.branches.message,
            shouldSendAudio: false
          };
        case '5':
          return {
            text: cfg.steps.deliveryInfo.message,
            shouldSendAudio: false
          };
        case '6':
          if (clientLead.jid || clientLead.id) {
            db.updateLead(clientLead.jid || clientLead.id, { requiresHuman: true, botPaused: true });
          }
          return {
            text: cfg.steps.humanHandoff.message,
            shouldSendAudio: false
          };
      }
    }

    // 3. Evaluar palabras clave configuradas
    for (const trigger of (cfg.keywordTriggers || [])) {
      const matches = trigger.keywords.some(kw => {
        const k = kw.toLowerCase().trim();
        return tLower === k || tLower.includes(k) || (k.length > 3 && tLower.startsWith(k));
      });
      if (matches) {
        switch (trigger.action) {
          case 'show_welcome':
            return { text: this.formatMessage(cfg.steps.welcome.message, { customerName }), shouldSendAudio: false };
          case 'show_catalog':
            return { text: this.buildCatalogMessage(cfg), shouldSendAudio: false };
          case 'start_order':
            session.step = 'awaiting_items';
            this.saveSession(jid, clientLead, session);
            return { text: cfg.steps.orderIntake.promptItems, shouldSendAudio: false, session };
          case 'check_order_status':
            return { text: this.buildOrderStatusMessage(jid, clientLead, cfg), shouldSendAudio: false };
          case 'show_branches':
            return { text: cfg.steps.branches.message, shouldSendAudio: false };
          case 'show_delivery_info':
            return { text: cfg.steps.deliveryInfo.message, shouldSendAudio: false };
          case 'handoff_human':
            if (clientLead.jid || clientLead.id) {
              db.updateLead(clientLead.jid || clientLead.id, { requiresHuman: true, botPaused: true });
            }
            return { text: cfg.steps.humanHandoff.message, shouldSendAudio: false };
        }
      }
    }

    // 4. Detección automática de pedido directo por texto (ej: "hola quiero 2 kg de vacio y 1 kg de costillar")
    const catalog = db.getProducts() || [];
    const detected = this.extractItemsFromText(text, catalog);
    if (detected.products.length > 0) {
      session.step = 'awaiting_delivery_type';
      session.cart = detected.products;
      session.totalAmount = detected.total;
      this.saveSession(jid, clientLead, session);

      const itemsFormatted = detected.products.map(p => {
        const qStr = p.isUnitMode ? `${p.unitCount || p.quantity} Unidades` : `${p.quantity} ${p.unit || 'kg'}`;
        return `• ${qStr} ${p.name} — $${Number(p.subtotal || 0).toLocaleString('es-AR')}`;
      }).join('\n');

      return {
        text: `¡De diez ${customerName}! 🥩 Anotamos tus cortes:\n\n${itemsFormatted}\n\n💰 *Subtotal acumulado:* **$${detected.total.toLocaleString('es-AR')}**\n\n${cfg.steps.orderIntake.promptDeliveryType}`,
        shouldSendAudio: false,
        session
      };
    }

    // 5. Fallback por defecto: Mostrar Menú Principal
    return {
      text: this.formatMessage(cfg.steps.welcome.message, { customerName }),
      shouldSendAudio: false
    };
  }

  /**
   * Manejador de cada paso del flujo secuencial de toma de pedido offline
   */
  static async handleOrderIntakeStep({ jid, text, tLower, customerName, clientLead, session, cfg }) {
    const catalog = db.getProducts() || [];
    const branches = db.getBranches() || [];

    switch (session.step) {
      case 'awaiting_items': {
        const detected = this.extractItemsFromText(text, catalog);
        if (detected.products.length === 0) {
          return {
            text: `⚠️ No pude reconocer los cortes en tu mensaje.\n\nPor favor indicalo con la cantidad y nombre del corte (ej: *2 kg de vacío y 1 kg de costillar*).\n\n*(O respondé 1 para ver el catálogo disponible)*`,
            shouldSendAudio: false,
            session
          };
        }
        session.cart = detected.products;
        session.totalAmount = detected.total;
        session.step = 'awaiting_delivery_type';

        const itemsFormatted = detected.products.map(p => {
          const qStr = p.isUnitMode ? `${p.unitCount || p.quantity} Unidades` : `${p.quantity} ${p.unit || 'kg'}`;
          return `• ${qStr} ${p.name} — $${Number(p.subtotal || 0).toLocaleString('es-AR')}`;
        }).join('\n');

        return {
          text: `¡Perfecto! 🥩 Anotamos:\n\n${itemsFormatted}\n\n💰 *Subtotal:* **$${detected.total.toLocaleString('es-AR')}**\n\n${cfg.steps.orderIntake.promptDeliveryType}`,
          shouldSendAudio: false,
          session
        };
      }

      case 'awaiting_delivery_type': {
        if (/1|envio|envío|domicilio|delivery|casa/i.test(tLower)) {
          session.deliveryType = 'delivery';
          session.step = 'awaiting_address';
          return {
            text: cfg.steps.orderIntake.promptAddress,
            shouldSendAudio: false,
            session
          };
        } else if (/2|retiro|sucursal|pasar|buscar/i.test(tLower)) {
          session.deliveryType = 'pickup';
          session.step = 'awaiting_branch';
          return {
            text: cfg.steps.orderIntake.promptBranch,
            shouldSendAudio: false,
            session
          };
        } else {
          return {
            text: `👉 Por favor respondé *1* para Envío a Domicilio o *2* para Retiro por Sucursal:`,
            shouldSendAudio: false,
            session
          };
        }
      }

      case 'awaiting_address': {
        if (text.length < 5) {
          return {
            text: `📍 Por favor ingresá una dirección válida con calle, número y barrio (ej: *Av. Menéndez Pidal 3575, Urca*):`,
            shouldSendAudio: false,
            session
          };
        }
        session.address = text.trim();
        session.step = 'awaiting_payment';
        return {
          text: `📍 Dirección agendada: *${session.address}*\n\n${cfg.steps.orderIntake.promptPayment}`,
          shouldSendAudio: false,
          session
        };
      }

      case 'awaiting_branch': {
        const branchIndex = parseInt(tLower.replace(/\D/g, ''), 10);
        let selectedBranch = null;
        if (branchIndex >= 1 && branchIndex <= branches.length) {
          selectedBranch = branches[branchIndex - 1];
        } else {
          selectedBranch = branches.find(b => b.name && tLower.includes(b.name.toLowerCase().split(' ')[0]));
        }

        if (!selectedBranch) {
          return {
            text: `🏢 Por favor respondé con un número del 1 al ${branches.length} para elegir la sucursal de retiro:\n\n` + cfg.steps.orderIntake.promptBranch,
            shouldSendAudio: false,
            session
          };
        }

        session.branchId = selectedBranch.id;
        session.branchName = selectedBranch.name;
        session.step = 'awaiting_payment';
        return {
          text: `🏪 Sucursal de retiro agendada: *${selectedBranch.name}*\n\n${cfg.steps.orderIntake.promptPayment}`,
          shouldSendAudio: false,
          session
        };
      }

      case 'awaiting_payment': {
        let payMethod = 'Efectivo';
        if (/2|transf|alias|cbu|cvu/i.test(tLower)) {
          payMethod = 'Transferencia';
        } else if (/3|mp|mercado|tarjeta|link/i.test(tLower)) {
          payMethod = 'Mercado Pago';
        } else if (/1|efec|cash/i.test(tLower)) {
          payMethod = 'Efectivo';
        }

        session.paymentMethod = payMethod;

        // Crear la orden en la base de datos de manera definitiva y consistente
        const cleanPhone = clientLead.phone || (jid && !jid.includes('@lid') ? `+${jid.split('@')[0]}` : '');
        const createdOrder = db.createOrder({
          jid,
          phone: cleanPhone,
          customerName,
          address: session.deliveryType === 'delivery' ? session.address : (session.branchName || 'Retiro en Sucursal'),
          deliveryType: session.deliveryType,
          branchId: session.branchId || 'br-1',
          branch: session.branchName || 'URCA CENTRAL',
          branchName: session.branchName || 'URCA CENTRAL',
          products: session.cart,
          items: session.cart.map(p => {
            const qStr = p.isUnitMode ? `${p.unitCount || p.quantity} Unidades` : `${p.quantity} ${p.unit || 'kg'}`;
            return `• ${qStr} ${p.name} — $${Number(p.subtotal || 0).toLocaleString('es-AR')}`;
          }),
          totalAmount: session.totalAmount,
          paymentMethod: payMethod,
          channel: 'WHATSAPP',
          source: 'WHATSAPP_OFFLINE_BOT',
          origin: 'WHATSAPP',
          status: 'pending',
          notes: '[Flujo Offline sin IA]'
        });

        const itemsList = (createdOrder.items || []).join('\n');
        const deliveryInfo = session.deliveryType === 'delivery'
          ? `🛵 *Envío a Domicilio:* ${session.address}`
          : `🏪 *Retiro por Sucursal:* ${session.branchName}`;

        const confirmMsg = this.formatMessage(cfg.steps.orderIntake.confirmTemplate, {
          customerName,
          orderId: createdOrder.id,
          itemsList,
          totalAmount: Number(createdOrder.totalAmount).toLocaleString('es-AR'),
          deliveryInfo,
          paymentMethod: payMethod
        });

        // Limpiar sesión offline del cliente
        session.step = 'idle';
        session.cart = [];

        return {
          text: confirmMsg,
          shouldSendAudio: false,
          createdOrder,
          session
        };
      }

      default:
        session.step = 'idle';
        return null;
    }
  }

  /**
   * Guarda el estado de la sesión offline en el lead
   */
  static saveSession(jid, lead, session) {
    if (lead) {
      lead.offlineSession = session;
    }
    if (jid) {
      db.updateLead(jid, { offlineSession: session });
    }
  }

  /**
   * Construye el mensaje de catálogo formateado con los cortes y precios reales
   */
  static buildCatalogMessage(cfg) {
    const products = db.getProducts() || [];
    let msg = cfg.steps.catalog.headerMessage;

    if (cfg.steps.catalog.includeDynamicProducts) {
      const available = products.filter(p => p.isAvailable !== false && p.price > 0);
      const featured = available.slice(0, cfg.steps.catalog.maxProductsToShow || 8);
      featured.forEach((p, idx) => {
        const u = p.unit || 'kg';
        const icon = p.category === 'combos' ? '⭐' : p.category === 'achuras' ? '🌭' : p.category === 'cerdo' ? '🐖' : '🥩';
        msg += `${idx + 1}️⃣ ${icon} *${p.name}*\n   💰 *$${Number(p.price).toLocaleString('es-AR')}* por ${u}\n\n`;
      });
    }

    msg += cfg.steps.catalog.footerMessage;
    return msg;
  }

  /**
   * Consulta el estado de la última orden activa del cliente
   */
  static buildOrderStatusMessage(jid, lead, cfg) {
    const orders = db.getOrdersByJid(jid || lead?.id || '') || [];
    const activeOrder = orders.find(o => ['pending', 'preparing', 'ready', 'in_transit'].includes(o.status)) || orders[0];

    if (!activeOrder) {
      return cfg.steps.orderStatus.notFoundTemplate;
    }

    let statusLabel = 'Pendiente de preparación';
    let statusIcon = '⏳';
    switch (activeOrder.status) {
      case 'preparing':
        statusLabel = 'En preparación en carnicería';
        statusIcon = '🥩';
        break;
      case 'ready':
      case 'ready_for_pickup':
        statusLabel = '¡Listo y empaquetado para entregar!';
        statusIcon = '✨';
        break;
      case 'in_transit':
        statusLabel = 'En camino hacia tu domicilio';
        statusIcon = '🛵';
        break;
      case 'delivered':
      case 'completed':
        statusLabel = 'Entregado con éxito';
        statusIcon = '✅';
        break;
      case 'cancelled':
        statusLabel = 'Cancelado';
        statusIcon = '❌';
        break;
    }

    const itemsList = Array.isArray(activeOrder.items) && activeOrder.items.length > 0
      ? activeOrder.items.join('\n')
      : '• Cortes seleccionados';

    const deliveryInfo = activeOrder.deliveryType === 'pickup'
      ? `Retiro en ${activeOrder.branchName || activeOrder.branch || 'Sucursal'}`
      : `Envío a domicilio (${activeOrder.address || 'Domicilio acordado'})`;

    return this.formatMessage(cfg.steps.orderStatus.foundTemplate, {
      orderId: activeOrder.id,
      itemsList,
      totalAmount: Number(activeOrder.totalAmount || 0).toLocaleString('es-AR'),
      deliveryInfo,
      statusLabel,
      statusIcon
    });
  }

  /**
   * Parser sintáctico de cortes y cantidades desde texto natural
   */
  static extractItemsFromText(text, catalog = []) {
    const products = [];
    let total = 0;
    if (!text || !Array.isArray(catalog)) return { products, total };

    const lines = text.split(/[\n,;y\+]/i).map(s => s.trim()).filter(Boolean);

    for (const segment of lines) {
      if (/^(?:hola|buenas|quiero|pedir|mandame|traeme|para)\b/i.test(segment) && segment.length < 15 && !/\d/.test(segment)) {
        continue;
      }

      // Regex para cantidades: "2 kg de vacio", "500g de chori", "1 combo asadazo", "3 chorizos", "1 bolsa de carbon"
      const match = segment.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|g\b|gr\b|grs\b|gramos\b|unidades?|un\b|bolsas?|botellas?|combos?|tiras?|bifes?)?\s*(?:de\s+)?([a-záéíóúñ\s]+)/i);

      let qty = 1;
      let unit = 'kg';
      let isUnitMode = false;
      let namePart = segment;

      if (match) {
        const rawQty = parseFloat(match[1].replace(',', '.'));
        const rawUnit = (match[2] || '').toLowerCase();
        namePart = match[3].trim();

        if (/^(?:g|gr|grs|gramos)$/i.test(rawUnit)) {
          qty = Number((rawQty / 1000).toFixed(3));
          unit = 'kg';
        } else if (/^(?:unidades?|un|bolsas?|botellas?|combos?)$/i.test(rawUnit)) {
          qty = rawQty;
          unit = rawUnit.startsWith('bols') ? 'bolsa' : rawUnit.startsWith('bot') ? 'botella' : rawUnit.startsWith('comb') ? 'combo' : 'un';
          isUnitMode = true;
        } else {
          qty = rawQty;
          unit = 'kg';
        }
      }

      const cleanSearch = namePart.toLowerCase().replace(/^(?:el|la|los|las|de|un|una)\s+/, '').trim();
      if (cleanSearch.length < 3) continue;

      const matchedProd = catalog.find(p => {
        const pName = (p.name || '').toLowerCase();
        return pName.includes(cleanSearch) || cleanSearch.includes(pName) ||
          (/\bvacio|vacío\b/.test(cleanSearch) && /\bvacio|vacío\b/.test(pName)) ||
          (/\bcostilla|asado\b/.test(cleanSearch) && /\bcostilla|asado\b/.test(pName) && !/cerdo/.test(pName)) ||
          (/\bchori|chorizo\b/.test(cleanSearch) && /\bchori|chorizo\b/.test(pName)) ||
          (/\bmatambre\b/.test(cleanSearch) && /\bmatambre\b/.test(pName)) ||
          (/\bcarbon|carbón\b/.test(cleanSearch) && /\bcarbon|carbón\b/.test(pName)) ||
          (/\bcombo|asadazo\b/.test(cleanSearch) && /\bcombo|asadazo\b/.test(pName));
      });

      if (matchedProd && Number(matchedProd.price) > 0) {
        const unitPrice = Number(matchedProd.price);
        const subtotal = Math.round(unitPrice * qty);
        products.push({
          id: matchedProd.id,
          plu: matchedProd.plu || '',
          barcode: matchedProd.barcode || '',
          name: matchedProd.name,
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: qty,
          unit: matchedProd.unit || unit,
          isUnitMode: isUnitMode || matchedProd.unit !== 'kg',
          unitCount: isUnitMode ? qty : 0,
          subtotal
        });
        total += subtotal;
      }
    }

    return { products, total };
  }

  /**
   * Reemplazo de etiquetas dinámicas {tag} en mensajes
   */
  static formatMessage(template = '', replacements = {}) {
    let result = String(template || '');
    for (const [key, val] of Object.entries(replacements)) {
      result = result.replaceAll(`{${key}}`, String(val ?? ''));
    }
    return result;
  }
}

export default OfflineFlowService;
