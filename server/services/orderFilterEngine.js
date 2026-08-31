import { db } from './database.js';

/**
 * Motor de Filtros y Condiciones de Aceptación de Pedidos
 * Permite evaluar reglas positivas y negativas combinables sobre ubicación,
 * distancia, prefijo telefónico, monto y horarios.
 */

// Reglas por defecto si no existen en la base de datos
export const DEFAULT_ORDER_RULES = [
  {
    id: 'rule-phone-prefix',
    name: 'Prefijos Telefónicos Nacionales / Córdoba',
    type: 'phone_prefix',
    operator: 'starts_with',
    value: '+54, 54, 351, 3543, 3541, 3525, 353, 358, 11, 15',
    isPositive: true, // Debe cumplir para ser aceptado
    action: 'reject',
    customMessage: 'Por el momento nuestro sistema automático de pedidos por WhatsApp solo acepta números con prefijo de Argentina (+54 / 351 / 3543). Para atención personalizada, un operador te contactará en breve.',
    enabled: true
  },
  {
    id: 'rule-coverage-zone',
    name: 'Zona de Cobertura de Envíos en Córdoba',
    type: 'location',
    operator: 'contains',
    value: 'Córdoba, Cordoba, Urca, Cerro, Villa Allende, Argüello, Alberdi, Centro, Nueva Córdoba, General Paz, Cofico, Alto Verde, Las Rosas, Poeta Lugones, San Isidro, Valle Escondido, Tablada, Guiñazú, Jardín, Manantiales, Villa Belgrano, Funes, Locelso, Pidal, Quirós, Álamos, Alcorta, Luchesse, Colón, Velez Sarsfield, Chacabuco, Estrada, San Martín, Rivadavia, Sagrada Familia, Recta Martinoli, Rafael Nuñez, Tejeda, Gauss, Donato Alvarez, Monseñor Pablo Cabrera, Castro Barros, Santa Fe, Costanera, Duarte Quirós, Menéndez Pidal, Figueroa Alcorta, Padre Luchesse',
    isPositive: true,
    action: 'pickup_only',
    customMessage: 'Nuestros envíos directos en moto/auto cubren Córdoba Capital y Gran Córdoba (hasta 15 km de nuestras 6 sucursales). Si tu dirección está fuera de este radio, podés retirar tu pedido en cualquiera de nuestras sucursales sin cargo. 🏪',
    enabled: true
  },
  {
    id: 'rule-max-distance',
    name: 'Distancia Máxima de Delivery a Domicilio',
    type: 'distance',
    operator: 'less_than_or_equal',
    value: 20, // 20 km
    isPositive: true,
    action: 'pickup_only',
    customMessage: 'Tu domicilio supera el radio máximo de 20 km para entrega en el día. Te invitamos a seleccionar Retiro en Sucursal para tener tus cortes listos y frescos cuando gustes. 🥩',
    enabled: true
  },
  {
    id: 'rule-min-amount',
    name: 'Monto Mínimo de Pedido para Envío',
    type: 'min_amount',
    operator: 'greater_than_or_equal',
    value: 10000,
    isPositive: true,
    action: 'pickup_only',
    customMessage: 'El monto mínimo para envíos directos a domicilio es de $10.000. Podés sumar más cortes/complementos o elegir Retiro en Sucursal para cualquier monto.',
    enabled: true
  }
];

export class OrderFilterEngine {
  /**
   * Obtiene las reglas configuradas en el sistema
   */
  static getRules() {
    const settings = db.getSettings();
    if (Array.isArray(settings.orderFilterRules) && settings.orderFilterRules.length > 0) {
      return settings.orderFilterRules;
    }
    return DEFAULT_ORDER_RULES;
  }

  /**
   * Guarda las reglas de filtrado
   */
  static saveRules(rules) {
    if (!Array.isArray(rules)) return false;
    db.updateSettings({ orderFilterRules: rules });
    return true;
  }

  /**
   * Evalúa los datos de un pedido o cliente contra todas las reglas activas
   * @param {Object} context { phone, address, location, distanceKm, amount, totalAmount, deliveryType, jid }
   * @returns {Object} { allowed: boolean, action: 'allow' | 'reject' | 'pickup_only' | 'require_human_review', rejectedRules: [], message: string }
   */
  static evaluateOrder(context = {}) {
    const rules = this.getRules().filter(r => r.enabled !== false);
    const {
      phone = '',
      address = '',
      location = '',
      distanceKm = null,
      amount = 0,
      totalAmount = 0,
      deliveryType = 'delivery'
    } = context;

    const cleanPhone = String(phone || '').replace(/[\s\-\(\)]+/g, '').trim();
    const cleanAddress = `${address || ''} ${location || ''}`.toLowerCase().trim();
    const orderAmount = Number(totalAmount !== 0 ? totalAmount : amount) || 0;
    const dist = distanceKm !== null ? Number(distanceKm) : null;

    const failedRules = [];

    for (const rule of rules) {
      let passed = true;
      const type = rule.type;
      const op = rule.operator || 'contains';
      const rawVal = rule.value;
      const isPositive = rule.isPositive !== false; // default true

      switch (type) {
        case 'phone_prefix': {
          if (!cleanPhone) break;
          const prefixes = String(rawVal || '').split(/[,;]+/).map(p => p.trim().replace(/[\s\-\+]/g, '')).filter(Boolean);
          const rawWithPlus = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
          const rawDigits = cleanPhone.replace(/^\+/, '');

          const matchesAnyPrefix = prefixes.some(p => {
            return rawDigits.startsWith(p) || rawWithPlus.startsWith(p) || (p.length <= 4 && rawDigits.includes(p));
          });

          passed = isPositive ? matchesAnyPrefix : !matchesAnyPrefix;
          break;
        }

        case 'location': {
          // Solo aplica para envíos a domicilio si hay dirección especificada
          if (deliveryType !== 'delivery' || cleanAddress.length < 3) break;
          const allowedKeywords = String(rawVal || '').split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);

          const hasExcludedLocation = /(?:buenos aires|bs as|caba|rosario|santa fe capital|mendoza|san juan|tucum[aá]n|chile|uruguay|brasil|exterior)\b/i.test(cleanAddress);
          const hasStreetAndNumber = /[a-záéíóúñ\s\.\-]+\s+[0-9]{1,5}/i.test(cleanAddress);
          const matchesLocation = (allowedKeywords.some(kw => cleanAddress.includes(kw)) || hasStreetAndNumber) && !hasExcludedLocation;
          passed = isPositive ? matchesLocation : !matchesLocation;
          break;
        }

        case 'distance': {
          if (deliveryType !== 'delivery' || dist === null || isNaN(dist)) break;
          const threshold = Number(rawVal) || 20;
          let distanceSatisfied = false;

          if (op === 'less_than' || op === 'less_than_or_equal') {
            distanceSatisfied = dist <= threshold;
          } else if (op === 'greater_than') {
            distanceSatisfied = dist > threshold;
          } else {
            distanceSatisfied = dist <= threshold;
          }

          passed = isPositive ? distanceSatisfied : !distanceSatisfied;
          break;
        }

        case 'min_amount': {
          if (deliveryType !== 'delivery' || orderAmount <= 0) break;
          const minRequired = Number(rawVal) || 10000;
          const amountSatisfied = orderAmount >= minRequired;
          passed = isPositive ? amountSatisfied : !amountSatisfied;
          break;
        }

        case 'business_hours': {
          const now = new Date();
          const currentHour = now.getHours() + (now.getMinutes() / 60);
          // rawVal ej: "08:30-21:00"
          const matchHours = String(rawVal || '').match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
          if (matchHours) {
            const start = parseInt(matchHours[1], 10) + (parseInt(matchHours[2] || 0, 10) / 60);
            const end = parseInt(matchHours[3], 10) + (parseInt(matchHours[4] || 0, 10) / 60);
            const isWithin = currentHour >= start && currentHour <= end;
            passed = isPositive ? isWithin : !isWithin;
          }
          break;
        }

        default:
          passed = true;
          break;
      }

      if (!passed) {
        failedRules.push(rule);
      }
    }

    if (failedRules.length === 0) {
      return {
        allowed: true,
        action: 'allow',
        rejectedRules: [],
        message: ''
      };
    }

    // Determinar la acción más restrictiva de las reglas que fallaron
    // Prioridad de restricción: reject > pickup_only > require_human_review
    let finalAction = 'allow';
    if (failedRules.some(r => r.action === 'reject')) {
      finalAction = 'reject';
    } else if (failedRules.some(r => r.action === 'pickup_only')) {
      finalAction = 'pickup_only';
    } else if (failedRules.some(r => r.action === 'require_human_review')) {
      finalAction = 'require_human_review';
    }

    const firstMessage = failedRules.find(r => r.customMessage)?.customMessage || 
      'Tu pedido no cumple con las condiciones automáticas de entrega. Un operador te contactará.';

    return {
      allowed: finalAction === 'allow',
      action: finalAction,
      ruleMatched: failedRules[0]?.name || null,
      rejectedRules: failedRules,
      message: firstMessage
    };
  }
}
