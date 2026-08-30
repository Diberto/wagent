/**
 * WAgent - Sistema de Automatizaciones y Motor de Reglas Dinámicas
 * Permite configurar, modificar y ejecutar reglas de negocio coherentes para:
 * - Onboarding y solicitud de datos a clientes nuevos.
 * - Cálculo de comensales y propuestas de asado.
 * - Derivación automática a sucursales y choferes por geolocalización.
 * - Notificaciones de WhatsApp por cambio de estado de pedidos.
 * - Cobro con Mercado Pago (Modo Sandbox / Producción).
 */

export const DEFAULT_AUTOMATIONS = [
  {
    id: 'auto-onboarding-new-clients',
    name: 'Onboarding & Agendado de Clientes Nuevos',
    category: 'onboarding',
    enabled: true,
    description: 'Solicita automáticamente Nombre, Apellido y Dirección de entrega cuando un contacto no registrado escribe por primera vez.',
    trigger: 'NEW_UNRECOGNIZED_LEAD',
    config: {
      askName: true,
      askAddress: true,
      askBranchPreference: true,
      requireConfirmation: true,
      welcomeTemplate: `¡Hola! 👋 Carlos por acá, maestro carnicero de **República de la Carne**.\n\nPara agendarte en nuestro sistema y coordinar tus envíos directos en el día, ¿me indicarías por favor:\n👤 **Tu Nombre y Apellido**\n📍 **Tu Dirección de Entrega y Barrio** (o si preferís retirar por sucursal)\n\n¡Y contame qué cortes o promo tenías ganas de preparar hoy para armarte la propuesta perfecta! 🥩🔥`
    }
  },
  {
    id: 'auto-bbq-calculator',
    name: 'Asesor de Asado & Cálculo por Comensales',
    category: 'assistant',
    enabled: true,
    description: 'Calcula los kilos ideales de carne por persona y sugiere cortes o combos según el número de comensales.',
    trigger: 'PEOPLE_COUNT_DETECTED',
    config: {
      gramsPerPersonStandard: 500,
      gramsPerPersonEconomic: 450,
      defaultStarCombo: 'Combo Asadazo (4 kg)',
      starComboPrice: 39999,
      includeWineGift: true,
      suggestComplements: true
    }
  },
  {
    id: 'auto-branch-derivation',
    name: 'Derivación Inteligente a Sucursal más Cercana',
    category: 'logistics',
    enabled: true,
    description: 'Asigna automáticamente la sucursal óptima según el barrio o coordenadas del cliente en Córdoba.',
    trigger: 'ORDER_ADDRESS_ASSIGNED',
    config: {
      autoNotifyManager: true,
      maxDeliveryRadiusKm: 15,
      zones: [
        { zone: 'Urca / Cerro / Villa Belgrano', branchId: 'br-1', branchName: 'Urca Central (Av. José Roque Funes 1115)' },
        { zone: 'Alto Tejeda / Villa Cabrera', branchId: 'br-2', branchName: 'Urca 2 - Alto Tejeda (Av. Menéndez Pidal 3575)' },
        { zone: 'Intercountry / Tablada / La Calera', branchId: 'br-3', branchName: 'Intercountry Corteza Mall (Av. Los Álamos 1015)' },
        { zone: 'Duarte Quirós / Alberdi / Los Plátanos', branchId: 'br-4', branchName: 'Duarte Quirós (Av. Duarte Quirós 5130)' },
        { zone: 'Villa Allende / Mendiolaza / Unquillo', branchId: 'br-5', branchName: 'Villa Allende (Av. Figueroa Alcorta 480)' },
        { zone: 'San Isidro / Villa Rivera Indarte / Luchesse', branchId: 'br-6', branchName: 'Country San Isidro (Av. Padre Luchesse km 2)' }
      ]
    }
  },
  {
    id: 'auto-order-status-whatsapp',
    name: 'Notificaciones Automáticas de Pedido por WhatsApp',
    category: 'notifications',
    enabled: true,
    description: 'Envía un mensaje por WhatsApp al cliente cuando el estado de su pedido cambia.',
    trigger: 'ORDER_STATUS_CHANGED',
    config: {
      notifyOnPreparing: true,
      notifyOnInTransit: true,
      notifyOnDelivered: true,
      templates: {
        preparing: `🥩 *¡Tu pedido #{orderId} ya está en preparación!* Nuestros carniceros están seleccionando los cortes frescos en la carnicería.`,
        in_transit: `🛵 *¡Tu pedido #{orderId} va en camino a tu domicilio!* El repartidor {driverName} ({driverVehicle}) está en viaje a {address}.`,
        delivered: `✅ *¡Pedido #{orderId} entregado con éxito!* Esperamos que disfrutes la carne de primera calidad. ¡Muchas gracias por elegir República de la Carne! 🙌`
      }
    }
  },
  {
    id: 'auto-payment-mercadopago',
    name: 'Cobro Automatizado con Mercado Pago & Checkout Pro',
    category: 'payments',
    enabled: true,
    description: 'Genera links de Checkout Pro o proporciona el Alias para pagos digitales.',
    trigger: 'PAYMENT_LINK_REQUESTED',
    config: {
      mpMode: 'sandbox', // 'sandbox' | 'production'
      aliasMP: 'republica.carne.mp',
      autoSimulateSandbox: true,
      allowCreditCard: true,
      allowDebitCard: true,
      allowAccountMoney: true
    }
  }
];

export class AutomationEngine {
  constructor(db) {
    this.db = db;
  }

  getRules() {
    const dbData = this.db.readDb();
    if (!dbData.automations || dbData.automations.length === 0) {
      dbData.automations = DEFAULT_AUTOMATIONS;
      this.db.writeDb(dbData);
    }
    return dbData.automations;
  }

  getRule(id) {
    const rules = this.getRules();
    return rules.find(r => r.id === id);
  }

  updateRule(id, updates) {
    const dbData = this.db.readDb();
    if (!dbData.automations) dbData.automations = DEFAULT_AUTOMATIONS;
    const index = dbData.automations.findIndex(r => r.id === id);
    if (index !== -1) {
      dbData.automations[index] = {
        ...dbData.automations[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.db.writeDb(dbData);
      return dbData.automations[index];
    }
    return null;
  }

  toggleRule(id, enabled) {
    return this.updateRule(id, { enabled: Boolean(enabled) });
  }

  resetDefaults() {
    const dbData = this.db.readDb();
    dbData.automations = DEFAULT_AUTOMATIONS;
    this.db.writeDb(dbData);
    return DEFAULT_AUTOMATIONS;
  }

  isRuleActive(id) {
    const rule = this.getRule(id);
    return rule ? rule.enabled : true;
  }
}
