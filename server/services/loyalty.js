import { db } from './database.js';
import { isMongoConnected, getCollection } from '../../db.js';
import { sqliteStorage } from './sqliteStorage.js';

export const DEFAULT_LOYALTY_CONFIG = {
  enabled: true,
  pointsPerCurrencyUnit: 0.1, // 1 punto cada $10 gastados
  currencyPerPointRedemption: 1, // 1 punto = $1 de descuento
  minPointsToRedeem: 50,
  maxDiscountPercentagePerOrder: 50,
  pointsExpiryDays: 180, // Puntos vencen a los 180 días por defecto
  welcomeBonusPoints: 100, // Bono por registro inicial
  whatsappNotifications: true,
  // Campos del formulario de registro en /micuenta configurables desde el admin
  registrationFormConfig: {
    title: 'Unite al Club de Fidelización',
    subtitle: 'Completá tus datos para acumular puntos, recibir descuentos y consultar tus pedidos en vivo.',
    fields: [
      { id: 'name', label: 'Nombre Completo', type: 'text', required: true, enabled: true },
      { id: 'phone', label: 'Número de WhatsApp', type: 'tel', required: true, enabled: true },
      { id: 'email', label: 'Correo Electrónico', type: 'email', required: false, enabled: true },
      { id: 'preferredBranch', label: 'Sucursal de Preferencia', type: 'select', required: true, enabled: true, optionsSource: 'branches' },
      { id: 'address', label: 'Dirección de Entrega', type: 'text', required: false, enabled: true },
      { id: 'birthDate', label: 'Fecha de Cumpleaños', type: 'date', required: false, enabled: true },
      { id: 'cookingPreference', label: 'Preferencia (Parrilla, Horno, Rápida)', type: 'select', required: false, enabled: true, options: ['Parrilla', 'Horno', 'Olla / Guiso', 'Minutas / Rápido'] }
    ]
  },
  tiers: [
    {
      id: 'bronce',
      name: 'Bronce',
      minSpend: 0,
      pointsMultiplier: 1.0,
      discountPercentage: 0,
      badgeColor: '#CD7F32',
      benefits: ['1 punto cada $10 gastados', 'Acceso a promociones estándar']
    },
    {
      id: 'plata',
      name: 'Plata',
      minSpend: 25000,
      pointsMultiplier: 1.25,
      discountPercentage: 5,
      badgeColor: '#C0C0C0',
      benefits: ['+25% puntos por compra', '5% de descuento directo en POS', 'Regalo en tu cumpleaños']
    },
    {
      id: 'oro',
      name: 'Oro',
      minSpend: 75000,
      pointsMultiplier: 1.5,
      discountPercentage: 10,
      badgeColor: '#FFD700',
      benefits: ['+50% puntos por compra', '10% de descuento directo en POS', 'Atención preferencial por WhatsApp']
    },
    {
      id: 'platino',
      name: 'Platino',
      minSpend: 200000,
      pointsMultiplier: 2.0,
      discountPercentage: 15,
      badgeColor: '#E5E4E2',
      benefits: ['Doble de puntos siempre', '15% de descuento en todos tus pedidos', 'Envío prioritario sin cargo']
    }
  ]
};

class LoyaltyService {
  constructor() {
    this.io = null;
    this.whatsappService = null;
    this.expiryInterval = null;
    this.otpCache = new Map(); // phoneCore -> { code, leadId, expiresAt }
    this.initExpiryCron();
  }

  setSocketIO(io) {
    this.io = io;
  }

  setWhatsAppService(service) {
    this.whatsappService = service;
  }

  // Cron diario en background para verificar y expirar puntos vencidos
  initExpiryCron() {
    // Chequear al inicio y cada 6 horas
    setTimeout(() => this.processExpiredPoints(), 10000);
    this.expiryInterval = setInterval(() => {
      this.processExpiredPoints();
    }, 6 * 60 * 60 * 1000);
  }

  // --- CONFIGURACIÓN Y NIVELES ---
  getConfig() {
    const database = db.readDb();
    if (!database.loyaltyConfig) {
      database.loyaltyConfig = JSON.parse(JSON.stringify(DEFAULT_LOYALTY_CONFIG));
      db.writeDb(database);
    } else {
      // Auto-migración si faltan campos nuevos como registrationFormConfig
      let changed = false;
      if (!database.loyaltyConfig.registrationFormConfig) {
        database.loyaltyConfig.registrationFormConfig = DEFAULT_LOYALTY_CONFIG.registrationFormConfig;
        changed = true;
      }
      if (database.loyaltyConfig.pointsExpiryDays === undefined) {
        database.loyaltyConfig.pointsExpiryDays = 180;
        changed = true;
      }
      if (changed) db.writeDb(database);
    }
    return database.loyaltyConfig;
  }

  updateConfig(updates) {
    const database = db.readDb();
    database.loyaltyConfig = {
      ...(database.loyaltyConfig || DEFAULT_LOYALTY_CONFIG),
      ...updates,
      updatedAt: new Date().toISOString()
    };
    db.writeDb(database);
    if (this.io) {
      this.io.emit('loyalty:config-update', database.loyaltyConfig);
    }
    return database.loyaltyConfig;
  }

  getTiers() {
    const config = this.getConfig();
    return (config.tiers || []).sort((a, b) => a.minSpend - b.minSpend);
  }

  // Determina el nivel alcanzado según el gasto histórico acumulado
  calculateTierForSpend(totalSpent = 0) {
    const tiers = this.getTiers();
    let currentTier = tiers[0] || { id: 'bronce', name: 'Bronce', discountPercentage: 0, pointsMultiplier: 1 };
    for (const tier of tiers) {
      if (Number(totalSpent) >= Number(tier.minSpend)) {
        currentTier = tier;
      }
    }

    const currentIndex = tiers.findIndex(t => t.id === currentTier.id);
    const nextTier = (currentIndex >= 0 && currentIndex < tiers.length - 1) ? tiers[currentIndex + 1] : null;
    const spendToNextTier = nextTier ? Math.max(0, Number(nextTier.minSpend) - Number(totalSpent)) : 0;
    const progressToNext = nextTier 
      ? Math.min(100, Math.round(((totalSpent - currentTier.minSpend) / (nextTier.minSpend - currentTier.minSpend)) * 100))
      : 100;

    return {
      currentTier,
      nextTier,
      spendToNextTier,
      progressToNext
    };
  }

  // --- LEDGER INMUTABLE DE MOVIMIENTOS ---
  getMovements(filter = {}) {
    const database = db.readDb();
    let movements = database.loyaltyMovements || [];

    if (filter.customerId) {
      movements = movements.filter(m => m.customerId === filter.customerId || m.customerPhone === filter.customerId);
    }
    if (filter.type) {
      movements = movements.filter(m => m.type === filter.type);
    }

    return movements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Proceso automático de expiración de puntos por lote
  processExpiredPoints() {
    const config = this.getConfig();
    if (!config.enabled || !config.pointsExpiryDays || config.pointsExpiryDays <= 0) return 0;

    const database = db.readDb();
    const movements = database.loyaltyMovements || [];
    const now = new Date();
    let expiredCount = 0;

    // Agrupar movimientos activos de tipo EARN o BONUS que tengan expiresAt
    for (const m of movements) {
      if ((m.type === 'EARN' || m.type === 'BONUS') && m.expiresAt && !m.isExpired && !m.consumed) {
        const expDate = new Date(m.expiresAt);
        if (now > expDate) {
          // Marcar como expirado y generar movimiento de deducción EXPIRE
          m.isExpired = true;
          const remainingInBatch = Math.max(0, (Number(m.points) || 0) - (Number(m.pointsRedeemedFromBatch) || 0));
          if (remainingInBatch > 0) {
            movements.push({
              id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              customerId: m.customerId,
              customerPhone: m.customerPhone,
              type: 'EXPIRE',
              points: remainingInBatch,
              originalMovementId: m.id,
              description: `Vencimiento de ${remainingInBatch} puntos por inactividad (${config.pointsExpiryDays} días)`,
              createdAt: now.toISOString()
            });
            expiredCount++;
          }
        }
      }
    }

    if (expiredCount > 0) {
      db.writeDb(database);
      console.log(`⏰ [Loyalty] Se procesaron y expiraron ${expiredCount} lotes de puntos vencidos.`);
      if (this.io) {
        this.io.emit('loyalty:points-expired', { count: expiredCount });
      }
    }
    return expiredCount;
  }

  getCustomerLoyalty(customerIdOrPhone) {
    if (!customerIdOrPhone) return null;
    const profile = db.getCustomerProfile(customerIdOrPhone);
    const lead = (db.readDb().leads || []).find(l => 
      l.id === customerIdOrPhone || 
      l.jid === customerIdOrPhone || 
      l.phone === customerIdOrPhone ||
      (l.phone && customerIdOrPhone && customerIdOrPhone.includes(l.phone.replace(/\D/g, '').slice(-8)))
    );

    const totalSpent = profile?.totalSpent || 0;
    const tierInfo = this.calculateTierForSpend(totalSpent);

    const movements = this.getMovements({ customerId: lead?.id || customerIdOrPhone });
    
    // Balance consolidado calculado desde el ledger inmutable
    const currentPoints = movements.reduce((acc, m) => {
      if (m.type === 'EARN' || m.type === 'BONUS' || m.type === 'ADJUST_UP') return acc + (Number(m.points) || 0);
      if (m.type === 'REDEEM' || m.type === 'EXPIRE' || m.type === 'ADJUST_DOWN') return acc - (Number(m.points) || 0);
      return acc;
    }, 0);

    const lifetimeEarned = movements
      .filter(m => m.type === 'EARN' || m.type === 'BONUS' || m.type === 'ADJUST_UP')
      .reduce((acc, m) => acc + (Number(m.points) || 0), 0);

    const lifetimeRedeemed = movements
      .filter(m => m.type === 'REDEEM')
      .reduce((acc, m) => acc + (Number(m.points) || 0), 0);

    const config = this.getConfig();
    const monetaryValue = currentPoints * (config.currencyPerPointRedemption || 1);

    // Próximo vencimiento de puntos
    const unexpiredBatches = movements.filter(m => (m.type === 'EARN' || m.type === 'BONUS') && m.expiresAt && !m.isExpired);
    unexpiredBatches.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    const nextExpiringBatch = unexpiredBatches[0] || null;

    return {
      customerId: lead?.id || customerIdOrPhone,
      customerName: lead?.name || profile?.name || 'Cliente',
      customerPhone: lead?.phone || profile?.phone || '',
      preferredBranch: lead?.preferredBranch || '',
      address: lead?.address || '',
      email: lead?.email || '',
      hasPin: Boolean(lead?.pin && String(lead.pin).trim().length >= 4),
      customFields: lead?.customFields || {},
      currentPoints: Math.max(0, currentPoints),
      monetaryValue,
      lifetimeEarned,
      lifetimeRedeemed,
      nextExpiryDate: nextExpiringBatch ? nextExpiringBatch.expiresAt : null,
      nextExpiringPoints: nextExpiringBatch ? nextExpiringBatch.points : 0,
      tier: tierInfo.currentTier,
      nextTier: tierInfo.nextTier,
      spendToNextTier: tierInfo.spendToNextTier,
      progressToNext: tierInfo.progressToNext,
      recentMovements: movements.slice(0, 20),
      orders: profile?.orders || []
    };
  }

  // --- SEGURIDAD Y ACCESO AL PORTAL /micuenta ---
  findLeadByPhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 6) return null;
    const core = digits.slice(-8);
    const dbData = db.readDb();
    return (dbData.leads || []).find(l => {
      const lDigits = (l.phone || l.jid || '').replace(/\D/g, '');
      return lDigits.includes(core);
    });
  }

  maskPhone(phone) {
    if (!phone) return '';
    const clean = String(phone).trim();
    if (clean.length <= 6) return clean;
    const suffix = clean.slice(-4);
    const prefix = clean.slice(0, clean.length - 4);
    return `${prefix.replace(/[0-9]/g, '*')} ${suffix}`;
  }

  checkPhoneSecurity(phone) {
    const lead = this.findLeadByPhone(phone);
    if (!lead) {
      return { exists: false };
    }
    const hasPin = Boolean(lead.pin && String(lead.pin).trim().length >= 4);
    const masked = this.maskPhone(lead.phone || phone);
    return {
      exists: true,
      hasPin,
      customerId: lead.id,
      customerName: lead.name || 'Cliente Club',
      maskedPhone: masked
    };
  }

  verifyCustomerPin(phone, pin) {
    const lead = this.findLeadByPhone(phone);
    if (!lead) {
      throw new Error('Cliente no registrado en el sistema.');
    }
    if (!lead.pin) {
      throw new Error('Esta cuenta aún no posee un PIN de seguridad configurado.');
    }
    if (String(lead.pin).trim() !== String(pin).trim()) {
      throw new Error('PIN incorrecto. Por favor verificá los 4 dígitos o solicitá un código por WhatsApp.');
    }
    return {
      success: true,
      customer: this.getCustomerLoyalty(lead.id)
    };
  }

  setCustomerPin(phone, pin, currentPin = null) {
    const lead = this.findLeadByPhone(phone);
    if (!lead) {
      throw new Error('Cliente no encontrado en el sistema.');
    }
    const cleanPin = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      throw new Error('El PIN debe tener entre 4 y 6 dígitos numéricos.');
    }

    // Si ya tenía PIN y se pasa currentPin, verificarlo
    if (lead.pin && currentPin) {
      if (String(lead.pin).trim() !== String(currentPin).trim()) {
        throw new Error('El PIN actual no es correcto.');
      }
    }

    const dbData = db.readDb();
    const found = (dbData.leads || []).find(l => l.id === lead.id);
    if (found) {
      found.pin = cleanPin;
      found.updatedAt = new Date().toISOString();
      db.writeDb(dbData);
    }

    return {
      success: true,
      customer: this.getCustomerLoyalty(lead.id)
    };
  }

  async sendSecurityOtp(phone) {
    const lead = this.findLeadByPhone(phone);
    if (!lead) {
      throw new Error('El número ingresado no pertenece a un cliente registrado.');
    }

    const digits = String(phone).replace(/\D/g, '');
    const core = digits.slice(-8);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    this.otpCache.set(core, {
      code,
      phone: lead.phone || phone,
      leadId: lead.id,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutos
    });

    console.log(`🔐 [PORTAL OTP] Código generado para ${lead.name} (${lead.phone || phone}): ${code}`);

    let sentViaWhatsApp = false;
    if (this.whatsappService) {
      try {
        let jid = lead.jid || lead.phone || phone;
        if (!jid.includes('@')) {
          const clean = jid.replace(/\D/g, '');
          jid = clean.length >= 10 ? `${clean}@s.whatsapp.net` : null;
        }
        if (jid) {
          const msg = `🔐 *Código de Seguridad - Club de Fidelización*\n\nHola *${lead.name}*, tu código para ingresar a tu cuenta y validar tu identidad es:\n\n👉 *${code}* 👈\n\n⏱️ Válido por 10 minutos. No lo compartas con nadie.\n\n_Si no solicitaste este código, por favor ignorá este mensaje._`;
          await this.whatsappService.sendMessage(jid, msg);
          sentViaWhatsApp = true;
        }
      } catch (err) {
        console.warn('⚠️ [LoyaltyService] Fallo envío WhatsApp OTP:', err.message);
      }
    }

    return {
      success: true,
      sentViaWhatsApp,
      message: sentViaWhatsApp 
        ? 'Código de 6 dígitos enviado a tu WhatsApp.' 
        : 'Código de verificación generado (verificá tu WhatsApp o consola de pruebas).',
      devCode: code
    };
  }

  verifySecurityOtp(phone, code) {
    const digits = String(phone).replace(/\D/g, '');
    const core = digits.slice(-8);
    const cached = this.otpCache.get(core);

    if (!cached) {
      throw new Error('No hay ninguna solicitud de código activa o ya expiró.');
    }
    if (Date.now() > cached.expiresAt) {
      this.otpCache.delete(core);
      throw new Error('El código ha expirado. Por favor solicitá un código nuevo.');
    }
    if (cached.code !== String(code).trim()) {
      throw new Error('Código incorrecto. Verificá los 6 dígitos recibidos.');
    }

    this.otpCache.delete(core);
    return {
      success: true,
      customer: this.getCustomerLoyalty(cached.leadId)
    };
  }

  resetPinWithOtp(phone, code, newPin) {
    const digits = String(phone).replace(/\D/g, '');
    const core = digits.slice(-8);
    const cached = this.otpCache.get(core);

    if (!cached) {
      throw new Error('No hay ninguna solicitud de código activa o ya expiró.');
    }
    if (Date.now() > cached.expiresAt) {
      this.otpCache.delete(core);
      throw new Error('El código ha expirado. Por favor solicitá un código nuevo.');
    }
    if (cached.code !== String(code).trim()) {
      throw new Error('Código incorrecto.');
    }

    const cleanPin = String(newPin || '').trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      throw new Error('El nuevo PIN debe tener entre 4 y 6 dígitos numéricos.');
    }

    this.otpCache.delete(core);
    const dbData = db.readDb();
    const found = (dbData.leads || []).find(l => l.id === cached.leadId);
    if (found) {
      found.pin = cleanPin;
      found.updatedAt = new Date().toISOString();
      db.writeDb(dbData);
    }

    return {
      success: true,
      customer: this.getCustomerLoyalty(cached.leadId)
    };
  }

  // --- REGISTRO / ALTA DE CLIENTE DESDE /micuenta ---
  async registerOrUpdateCustomer(formData) {
    const { phone, name, email, address, preferredBranch, birthDate, cookingPreference, pin, customFields = {} } = formData;
    if (!phone || !phone.trim()) {
      throw new Error('El número de WhatsApp o teléfono es obligatorio.');
    }

    const config = this.getConfig();
    const dbData = db.readDb();

    // Normalizar teléfono
    const digits = phone.replace(/\D/g, '');
    const cleanPhone = digits.startsWith('549') ? `+${digits}` : (digits.startsWith('54') ? `+549${digits.slice(2)}` : `+549${digits}`);

    // Buscar si ya existe
    let lead = (dbData.leads || []).find(l => {
      const lDigits = (l.phone || l.jid || '').replace(/\D/g, '');
      return lDigits.includes(digits.slice(-8));
    });

    const isNewCustomer = !lead;

    const leadPayload = {
      phone: cleanPhone,
      name: name || lead?.name || 'Cliente Club',
      email: email || lead?.email || '',
      address: address || lead?.address || '',
      preferredBranch: preferredBranch || lead?.preferredBranch || '',
      deliveryType: 'pickup',
      pin: pin ? String(pin).trim() : (lead?.pin || null),
      customFields: {
        ...(lead?.customFields || {}),
        birthDate: birthDate || '',
        cookingPreference: cookingPreference || '',
        registeredVia: 'micuenta_portal',
        ...customFields
      }
    };

    lead = db.findOrCreateLead(leadPayload);

    // Si es nuevo cliente y hay bono de bienvenida configurado, otorgarlo
    if (isNewCustomer && config.welcomeBonusPoints > 0) {
      await this.adjustPoints({
        customerId: lead.id,
        points: config.welcomeBonusPoints,
        type: 'BONUS',
        reason: '🎁 Bono de bienvenida por registrarte en el Club'
      });
    }

    return this.getCustomerLoyalty(lead.id);
  }

  // --- ADICIÓN DE PUNTOS POR COMPRA (EARN) ---
  async addPointsForOrder(order) {
    if (!order) return null;
    const config = this.getConfig();
    if (!config.enabled) return null;

    const customerKey = order.customerJid || order.customerPhone || order.jid;
    if (!customerKey) return null;

    const loyaltyData = this.getCustomerLoyalty(customerKey);
    const multiplier = loyaltyData?.tier?.pointsMultiplier || 1.0;
    const amount = Number(order.totalAmount || order.total) || 0;
    
    // Calcular puntos proporcionales con multiplicador de tier
    const earnedPoints = Math.round(amount * config.pointsPerCurrencyUnit * multiplier);
    if (earnedPoints <= 0) return null;

    const previousTier = loyaltyData.tier;

    // Calcular fecha de vencimiento según política en días
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (config.pointsExpiryDays || 180) * 24 * 60 * 60 * 1000);

    const movement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      customerId: loyaltyData.customerId,
      customerPhone: loyaltyData.customerPhone,
      orderId: order.id,
      type: 'EARN',
      points: earnedPoints,
      multiplier,
      orderAmount: amount,
      description: `Puntos por compra #${order.id ? String(order.id).slice(-6) : 'POS'} ($${amount.toLocaleString('es-AR')})`,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isExpired: false
    };

    const database = db.readDb();
    if (!database.loyaltyMovements) database.loyaltyMovements = [];
    database.loyaltyMovements.push(movement);
    db.writeDb(database);

    const updatedLoyalty = this.getCustomerLoyalty(customerKey);

    // Emitir socket para actualización inmediata en UI
    if (this.io) {
      this.io.emit('loyalty:points-earned', {
        movement,
        loyalty: updatedLoyalty
      });
    }

    // Verificar si subió de categoría para notificarlo
    const hasUpgraded = previousTier && updatedLoyalty.tier && previousTier.id !== updatedLoyalty.tier.id;
    if (config.whatsappNotifications && this.whatsappService) {
      this.notifyPointsEarned(loyaltyData.customerPhone || customerKey, earnedPoints, updatedLoyalty, hasUpgraded);
    }

    return { movement, loyalty: updatedLoyalty };
  }

  // --- CANJE DE PUNTOS (REDEEM) ---
  async redeemPoints({ customerId, pointsToRedeem, orderId = null, description = '' }) {
    const config = this.getConfig();
    if (!config.enabled) throw new Error('El sistema de fidelización se encuentra desactivado.');

    const loyalty = this.getCustomerLoyalty(customerId);
    if (!loyalty) throw new Error('Cliente no encontrado.');

    const points = Number(pointsToRedeem);
    if (isNaN(points) || points <= 0) throw new Error('Cantidad de puntos inválida.');
    if (points > loyalty.currentPoints) throw new Error(`Puntos insuficientes. Disponibles: ${loyalty.currentPoints}`);
    if (points < (config.minPointsToRedeem || 50)) {
      throw new Error(`El canje mínimo es de ${config.minPointsToRedeem} puntos.`);
    }

    const discountAmount = points * (config.currencyPerPointRedemption || 1);

    const movement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      customerId: loyalty.customerId,
      customerPhone: loyalty.customerPhone,
      orderId,
      type: 'REDEEM',
      points,
      discountAmount,
      description: description || `Canje de ${points} puntos por descuento de $${discountAmount}`,
      createdAt: new Date().toISOString()
    };

    const database = db.readDb();
    if (!database.loyaltyMovements) database.loyaltyMovements = [];
    database.loyaltyMovements.push(movement);
    db.writeDb(database);

    const updatedLoyalty = this.getCustomerLoyalty(customerId);

    if (this.io) {
      this.io.emit('loyalty:points-redeemed', {
        movement,
        loyalty: updatedLoyalty
      });
    }

    return {
      success: true,
      movement,
      discountAmount,
      remainingPoints: updatedLoyalty.currentPoints
    };
  }

  // --- AJUSTE MANUAL O BONO ---
  async adjustPoints({ customerId, points, type = 'BONUS', reason = '' }) {
    const loyalty = this.getCustomerLoyalty(customerId);
    if (!loyalty) throw new Error('Cliente no encontrado');

    const pts = Math.abs(Number(points));
    const isAdding = type === 'BONUS' || type === 'ADJUST_UP';

    if (!isAdding && pts > loyalty.currentPoints) {
      throw new Error(`No se puede deducir más puntos (${pts}) de los que tiene el cliente (${loyalty.currentPoints})`);
    }

    const config = this.getConfig();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (config.pointsExpiryDays || 180) * 24 * 60 * 60 * 1000);

    const movement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      customerId: loyalty.customerId,
      customerPhone: loyalty.customerPhone,
      type,
      points: pts,
      description: reason || (isAdding ? `Bono administrativo de ${pts} pts` : `Ajuste administrativo de -${pts} pts`),
      createdAt: createdAt.toISOString(),
      expiresAt: isAdding ? expiresAt.toISOString() : null,
      isExpired: false
    };

    const database = db.readDb();
    if (!database.loyaltyMovements) database.loyaltyMovements = [];
    database.loyaltyMovements.push(movement);
    db.writeDb(database);

    const updatedLoyalty = this.getCustomerLoyalty(customerId);
    if (this.io) {
      this.io.emit('loyalty:points-adjusted', { movement, loyalty: updatedLoyalty });
    }

    return { success: true, movement, loyalty: updatedLoyalty };
  }

  // --- NOTIFICACIONES WHATSAPP ---
  async notifyPointsEarned(phone, pointsEarned, loyalty, hasUpgraded = false) {
    if (!this.whatsappService || !phone) return;
    try {
      let jid = phone;
      if (!jid.includes('@')) {
        const clean = phone.replace(/\D/g, '');
        jid = clean.length >= 10 ? `${clean}@s.whatsapp.net` : null;
      }
      if (!jid) return;

      let message = `🎉 *¡Sumaste ${pointsEarned} puntos!* 🌟\n\n`;
      message += `Hola *${loyalty.customerName}*, con tu reciente compra acumulaste nuevos puntos en tu cuenta.\n\n`;
      message += `💎 *Balance Actual:* ${loyalty.currentPoints} puntos (equivalente a *$${loyalty.monetaryValue}* en compras)\n`;
      message += `🎖️ *Categoría:* ${loyalty.tier.name} (${loyalty.tier.discountPercentage}% de descuento directo)\n`;

      if (hasUpgraded) {
        message += `\n🚀 *¡FELICITACIONES! Has subido al nivel ${loyalty.tier.name}!* Disfruta de tus nuevos beneficios exclusivos.\n`;
      } else if (loyalty.nextTier) {
        message += `\nTe faltan *$${loyalty.spendToNextTier.toLocaleString('es-AR')}* para alcanzar la categoría *${loyalty.nextTier.name}* y obtener mejores descuentos.\n`;
      }

      message += `\nPodés consultar tus puntos y canjearlos en: _/micuenta_\n`;
      message += `\n_¡Gracias por elegirnos siempre!_`;

      await this.whatsappService.sendMessage(jid, message);
    } catch (err) {
      console.warn('⚠️ [LoyaltyService] No se pudo enviar notificación WhatsApp:', err.message);
    }
  }

  // --- MÉTRICAS GLOBALES DEL PROGRAMA ---
  getProgramStats() {
    const config = this.getConfig();
    const leads = db.getLeads() || [];
    const database = db.readDb();
    const movements = database.loyaltyMovements || [];

    let totalPointsIssued = 0;
    let totalPointsRedeemed = 0;
    let totalPointsExpired = 0;

    for (const m of movements) {
      if (m.type === 'EARN' || m.type === 'BONUS' || m.type === 'ADJUST_UP') totalPointsIssued += (Number(m.points) || 0);
      if (m.type === 'REDEEM') totalPointsRedeemed += (Number(m.points) || 0);
      if (m.type === 'EXPIRE') totalPointsExpired += (Number(m.points) || 0);
    }

    const tierDistribution = {};
    (config.tiers || []).forEach(t => {
      tierDistribution[t.id] = { ...t, count: 0, customers: [] };
    });

    for (const l of leads) {
      const profile = db.getCustomerProfile(l.id);
      const tierInfo = this.calculateTierForSpend(profile?.totalSpent || 0);
      const tid = tierInfo.currentTier.id;
      if (tierDistribution[tid]) {
        tierDistribution[tid].count++;
      }
    }

    return {
      enabled: config.enabled,
      pointsExpiryDays: config.pointsExpiryDays,
      activeMembersCount: leads.length,
      totalPointsIssued,
      totalPointsRedeemed,
      totalPointsExpired,
      currentOutstandingPoints: Math.max(0, totalPointsIssued - totalPointsRedeemed - totalPointsExpired),
      tierDistribution: Object.values(tierDistribution),
      recentMovements: movements.slice(-15).reverse()
    };
  }
}

export const loyaltyService = new LoyaltyService();
