import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';

export function isLidIdentifier(raw) {
  if (!raw) return false;
  const str = String(raw).trim();
  if (str.includes('@lid')) return true;
  const digits = str.replace(/\D/g, '');
  // WhatsApp LIDs son IDs opacos de 14 a 16 dígitos que no corresponden a numeración telefónica argentina (+54)
  if (digits.length >= 14 && digits.length <= 16 && !digits.startsWith('549') && !digits.startsWith('54')) {
    return true;
  }
  return false;
}

export function normalizePhoneNumber(raw) {
  if (!raw) return '';
  if (isLidIdentifier(raw)) return ''; // No transformar identificadores @lid en números telefónicos ficticios

  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Formato estándar celular de Argentina (+54 9 XXX XXX-XXXX)
  if (digits.startsWith('549') && digits.length >= 12) {
    const area = digits.slice(3, 6);
    const firstPart = digits.slice(6, 9);
    const lastPart = digits.slice(9);
    return `+54 9 ${area} ${firstPart}-${lastPart}`;
  } else if (digits.startsWith('54') && digits.length >= 11) {
    const area = digits.slice(2, 5);
    const firstPart = digits.slice(5, 8);
    const lastPart = digits.slice(8);
    return `+54 9 ${area} ${firstPart}-${lastPart}`;
  } else if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const firstPart = digits.slice(3, 6);
    const lastPart = digits.slice(6);
    return `+54 9 ${area} ${firstPart}-${lastPart}`;
  }
  
  if (digits.length >= 8 && digits.length <= 13) {
    return `+${digits}`;
  }
  return '';
}

export function extractCoreDigits(raw) {
  if (!raw) return '';
  if (isLidIdentifier(raw)) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

class DatabaseService {
  constructor() {
    this.dataDir = CONFIG.DATA_DIR;
    this.mediaDir = CONFIG.MEDIA_DIR;
    this.dbFile = path.join(this.dataDir, 'db.json');
    this.init();
  }

  init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }

    const backupsDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    if (!fs.existsSync(this.dbFile)) {
      const initialData = {
        settings: CONFIG.DEFAULT_SETTINGS,
        knowledgeBase: CONFIG.DEFAULT_KNOWLEDGE_BASE,
        leads: [],
        messages: [],
        calls: [],
        orders: []
      };
      this.writeDb(initialData);
    } else {
      // Crear respaldo de seguridad obligatorio al iniciar el servidor
      this.createBackup('startup');
      this.deduplicateDatabase();
    }

    // Configurar respaldo automático periódico cada 1 hora
    if (!this._backupInterval) {
      this._backupInterval = setInterval(() => {
        this.createBackup('auto');
      }, 60 * 60 * 1000);
    }
  }

  createBackup(label = 'auto') {
    try {
      const backupsDir = path.join(this.dataDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      if (!fs.existsSync(this.dbFile)) return null;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `db_backup_${timestamp}_${label}.json`;
      const backupPath = path.join(backupsDir, filename);

      fs.copyFileSync(this.dbFile, backupPath);

      // Rotar backups antiguos: mantener los 30 más recientes
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(backupsDir, f),
          time: fs.statSync(path.join(backupsDir, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 30) {
        for (const file of files.slice(30)) {
          try { fs.unlinkSync(file.path); } catch (e) {}
        }
      }

      return { filename, path: backupPath, createdAt: new Date().toISOString() };
    } catch (err) {
      console.error('Error creando backup de la base de datos:', err);
      return null;
    }
  }

  getBackupsList() {
    try {
      const backupsDir = path.join(this.dataDir, 'backups');
      if (!fs.existsSync(backupsDir)) return [];

      return fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(backupsDir, f);
          const stat = fs.statSync(filePath);
          return {
            filename: f,
            size: stat.size,
            createdAt: stat.mtime.toISOString(),
            formattedSize: (stat.size / 1024).toFixed(2) + ' KB'
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (err) {
      console.error('Error listando backups:', err);
      return [];
    }
  }

  restoreBackup(filename) {
    try {
      const backupsDir = path.join(this.dataDir, 'backups');
      const backupPath = path.join(backupsDir, filename);

      if (!fs.existsSync(backupPath)) {
        throw new Error(`El archivo de respaldo ${filename} no existe.`);
      }

      const content = fs.readFileSync(backupPath, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('El archivo de respaldo no contiene una estructura de datos válida.');
      }

      // Respaldar estado actual antes de restaurar
      this.createBackup('pre_restore');

      this.writeDb(parsed);
      return { success: true, message: `Respaldo ${filename} restaurado exitosamente.` };
    } catch (err) {
      console.error(`Error restaurando backup ${filename}:`, err);
      return { success: false, error: err.message };
    }
  }

  setIo(io) {
    this.io = io;
  }

  emitChange(event, data) {
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit(event, data);
      } catch (err) {
        console.warn('Error emitting change event:', err.message);
      }
    }
  }

  readDb() {
    try {
      const data = fs.readFileSync(this.dbFile, 'utf8');
      if (!data || !data.trim()) {
        if (this._cache) return this._cache;
      }
      const parsed = JSON.parse(data);
      this._cache = parsed;
      return parsed;
    } catch (error) {
      if (this._cache) return this._cache;
      console.error('Error reading database file:', error.message);
      return {
        settings: CONFIG.DEFAULT_SETTINGS,
        knowledgeBase: CONFIG.DEFAULT_KNOWLEDGE_BASE,
        leads: [],
        messages: [],
        calls: [],
        orders: []
      };
    }
  }

  writeDb(data) {
    if (!data) return false;
    this._cache = data;
    const jsonStr = JSON.stringify(data, null, 2);
    try {
      const tempPath = `${this.dbFile}.tmp.${process.pid}`;
      fs.writeFileSync(tempPath, jsonStr, 'utf8');
      try {
        fs.renameSync(tempPath, this.dbFile);
      } catch {
        fs.copyFileSync(tempPath, this.dbFile);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
      return true;
    } catch (error) {
      try {
        fs.writeFileSync(this.dbFile, jsonStr, 'utf8');
        return true;
      } catch (retryErr) {
        console.error('Error writing to database:', retryErr.message);
        return false;
      }
    }
  }

  // --- Settings & Deep Merge Persistence Guarantee ---
  getSettings() {
    const db = this.readDb();
    const rawSettings = db.settings || {};
    return {
      ...CONFIG.DEFAULT_SETTINGS,
      ...rawSettings,
      businessHours: {
        ...(CONFIG.DEFAULT_SETTINGS.businessHours || {}),
        ...(rawSettings.businessHours || {})
      },
      deliverySlots: Array.isArray(rawSettings.deliverySlots) && rawSettings.deliverySlots.length > 0
        ? rawSettings.deliverySlots
        : (CONFIG.DEFAULT_SETTINGS.deliverySlots || []),
      storeConfig: {
        ...(CONFIG.DEFAULT_SETTINGS.storeConfig || {}),
        ...(rawSettings.storeConfig || {})
      }
    };
  }

  updateSettings(newSettings) {
    const db = this.readDb();
    const current = this.getSettings();
    const merged = {
      ...current,
      ...newSettings,
      businessHours: {
        ...(current.businessHours || {}),
        ...(newSettings.businessHours || {})
      },
      deliverySlots: newSettings.deliverySlots !== undefined
        ? newSettings.deliverySlots
        : (current.deliverySlots || []),
      storeConfig: {
        ...(current.storeConfig || {}),
        ...(newSettings.storeConfig || {})
      }
    };
    db.settings = merged;
    this.writeDb(db);
    return db.settings;
  }

  /**
   * Calcula la franja horaria recomendada y costo de envío según la regla de corte de las 12:00 hs,
   * tipo de envío (Estándar vs Express) y monto mínimo de compra para envío gratuito.
   */
  calculateDeliverySlotAndCost({ orderDate = new Date(), deliveryType = 'delivery', subtotal = 0, isExpress = false, requestedSlotId = null } = {}) {
    const settings = this.getSettings();
    const cutoffHour = Number(settings.deliveryCutoffHour) || 12;
    const standardCost = Number(settings.deliveryStandardCost) || 3500;
    const expressCost = Number(settings.deliveryExpressCost) || 6500;
    const freeThreshold = Number(settings.deliveryFreeThreshold) || 45000;
    const freeEnabled = settings.deliveryFreeEnabled !== false;
    const expressEnabled = settings.deliveryExpressEnabled !== false;

    const dateObj = orderDate instanceof Date ? orderDate : new Date(orderDate);
    const hour = dateObj.getHours();

    const isBeforeCutoff = hour < cutoffHour;
    
    // Franjas configurables (por defecto Mañana 09-13hs y Tarde 14-19hs)
    const slots = (settings.deliverySlots && settings.deliverySlots.length > 0) ? settings.deliverySlots : [
      { id: 'morning', name: 'Franja Mañana', start: '09:00', end: '13:00', active: true },
      { id: 'afternoon', name: 'Franja Tarde', start: '14:00', end: '19:00', active: true }
    ];

    let suggestedSlot = null;
    let estimatedDeliveryLabel = '';
    let dayOffset = 0; // 0 = hoy, 1 = mañana

    if (isExpress && expressEnabled) {
      suggestedSlot = { id: 'express', name: 'Envío Express Inmediato', start: 'Inmediato', end: '45-60 min' };
      estimatedDeliveryLabel = 'Despacho prioritario inmediato (45 a 60 minutos)';
    } else if (isBeforeCutoff) {
      // Compra antes de las 12:00 hs -> Se despacha durante la tarde del mismo día (máx 24h)
      const afternoonSlot = slots.find(s => s.id === 'afternoon' || s.name.toLowerCase().includes('tarde')) || slots[1] || slots[0];
      suggestedSlot = afternoonSlot;
      dayOffset = 0;
      estimatedDeliveryLabel = `Hoy en ${afternoonSlot?.name || 'Franja Tarde'} (${afternoonSlot?.start || '14:00'} a ${afternoonSlot?.end || '19:00'} hs, máx 24h)`;
    } else {
      // Compra después de las 12:00 hs -> Se despacha preferentemente al día siguiente (dentro de las 24h)
      const morningSlot = slots.find(s => s.id === 'morning' || s.name.toLowerCase().includes('mañana')) || slots[0];
      suggestedSlot = morningSlot;
      dayOffset = 1;
      estimatedDeliveryLabel = `Mañana en ${morningSlot?.name || 'Franja Mañana'} (${morningSlot?.start || '09:00'} a ${morningSlot?.end || '13:00'} hs, máx 24h)`;
    }

    if (requestedSlotId && requestedSlotId !== 'auto') {
      const found = slots.find(s => s.id === requestedSlotId);
      if (found) {
        suggestedSlot = found;
        if (!isExpress) {
          estimatedDeliveryLabel = `${dayOffset === 0 ? 'Hoy' : 'Mañana'} en ${found.name} (${found.start} a ${found.end} hs)`;
        }
      }
    }

    // Cálculo del costo de envío
    let shippingCost = 0;
    let isFreeShipping = false;

    if (deliveryType === 'pickup') {
      shippingCost = 0;
      isFreeShipping = true;
    } else if (isExpress && expressEnabled) {
      shippingCost = expressCost;
      isFreeShipping = false;
    } else if (freeEnabled && subtotal >= freeThreshold) {
      shippingCost = 0;
      isFreeShipping = true;
    } else {
      shippingCost = standardCost;
      isFreeShipping = false;
    }

    return {
      suggestedSlotId: suggestedSlot?.id || 'afternoon',
      suggestedSlotName: suggestedSlot?.name || 'Franja Tarde',
      suggestedSlot,
      dayOffset,
      isBeforeCutoff,
      cutoffHour,
      estimatedDeliveryLabel,
      shippingCost,
      isFreeShipping,
      isExpress: Boolean(isExpress && expressEnabled),
      freeThreshold,
      standardCost,
      expressCost,
      businessHours: settings.businessHours
    };
  }

  /**
   * Valida que todos los datos requeridos para ingresar el pedido hayan sido solicitados y comprobados.
   */
  validateOrderPayload(orderData = {}) {
    const missingFields = [];
    const errors = [];

    // 1. Nombre del cliente
    const name = (orderData.customerName || orderData.name || '').trim();
    if (!name || name === 'Contacto WhatsApp' || name === 'Don Juan' || name === 'Cliente Demo') {
      missingFields.push('customerName');
      errors.push('Nombre del cliente es requerido.');
    }

    // 2. Teléfono o JID de contacto
    const phone = String(orderData.phone || orderData.customerPhone || orderData.jid || '').replace(/\D/g, '');
    if (!phone || phone.length < 6) {
      missingFields.push('phone');
      errors.push('Teléfono de WhatsApp de contacto es requerido.');
    }

    // 3. Modalidad de entrega y destino
    const deliveryType = orderData.deliveryType === 'pickup' ? 'pickup' : 'delivery';
    if (deliveryType === 'delivery') {
      const address = (orderData.address || '').trim();
      if (!address || address.length < 4 || /^(retiro|sucursal|a coordinar|domicilio|sin direccion)/i.test(address)) {
        missingFields.push('address');
        errors.push('Dirección de entrega completa (Calle, Altura/Número y Barrio) es requerida para envíos a domicilio.');
      }
    } else {
      const branch = (orderData.branch || orderData.branchName || '').trim();
      if (!branch || branch === 'A coordinar') {
        missingFields.push('branch');
        errors.push('Debe seleccionar una de las 6 sucursales para el retiro.');
      }
    }

    // 4. Medio de pago
    const paymentMethod = (orderData.paymentMethod || '').trim();
    if (!paymentMethod || paymentMethod.toLowerCase().includes('pendiente') || paymentMethod === 'Efectivo / Transferencia / Mercado Pago') {
      missingFields.push('paymentMethod');
      errors.push('Medio de pago (Efectivo, Transferencia o Mercado Pago) debe estar seleccionado.');
    }

    // 5. Items o productos
    const items = Array.isArray(orderData.items) ? orderData.items : (typeof orderData.items === 'string' ? orderData.items.split('\n').filter(Boolean) : []);
    const products = Array.isArray(orderData.products) ? orderData.products : [];
    if (items.length === 0 && products.length === 0) {
      missingFields.push('items');
      errors.push('El pedido debe contener al menos un producto o corte.');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      errors
    };
  }

  // --- Knowledge Base ---
  getKnowledgeBase() {
    const db = this.readDb();
    return db.knowledgeBase || [];
  }

  saveKnowledgeItem(item) {
    const db = this.readDb();
    if (!db.knowledgeBase) db.knowledgeBase = [];
    
    if (item.id) {
      const index = db.knowledgeBase.findIndex(k => k.id === item.id);
      if (index !== -1) {
        db.knowledgeBase[index] = { ...db.knowledgeBase[index], ...item, updatedAt: new Date().toISOString() };
      } else {
        db.knowledgeBase.push({ ...item, createdAt: new Date().toISOString() });
      }
    } else {
      item.id = `kb-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      item.createdAt = new Date().toISOString();
      db.knowledgeBase.push(item);
    }
    this.writeDb(db);
    return item;
  }

  deleteKnowledgeItem(id) {
    const db = this.readDb();
    db.knowledgeBase = (db.knowledgeBase || []).filter(k => k.id !== id);
    this.writeDb(db);
    return true;
  }

  // --- Automations & Workflow Engine ---
  getAutomations() {
    const db = this.readDb();
    if (!db.automations || db.automations.length === 0) {
      return [];
    }
    return db.automations;
  }

  updateAutomation(id, updates) {
    const db = this.readDb();
    if (!db.automations) db.automations = [];
    const index = db.automations.findIndex(a => a.id === id);
    if (index !== -1) {
      db.automations[index] = { ...db.automations[index], ...updates, updatedAt: new Date().toISOString() };
      this.writeDb(db);
      return db.automations[index];
    }
    return null;
  }

  setAutomations(automationsList) {
    const db = this.readDb();
    db.automations = automationsList;
    this.writeDb(db);
    return db.automations;
  }

  // --- Leads / Contacts Matching & Reconciliation Engine ---
  getLeads() {
    const db = this.readDb();
    return (db.leads || []).sort((a, b) => new Date(b.lastMessageAt || b.updatedAt) - new Date(a.lastMessageAt || a.updatedAt));
  }

  getLead(jidOrId) {
    if (!jidOrId) return null;
    const db = this.readDb();
    const cleanJid = String(jidOrId).trim();
    const core = extractCoreDigits(cleanJid);

    return (db.leads || []).find(l => 
      l.id === cleanJid || 
      l.jid === cleanJid || 
      (l.altJids && l.altJids.includes(cleanJid)) ||
      (core && core.length >= 7 && (extractCoreDigits(l.phone) === core || extractCoreDigits(l.jid) === core))
    );
  }

  findOrCreateLead(leadData) {
    const db = this.readDb();
    if (!db.leads) db.leads = [];

    const jid = leadData.jid || '';
    const altJid = leadData.altJid || '';
    const rawPhone = leadData.phone || jid || altJid;
    const formattedPhone = normalizePhoneNumber(rawPhone);
    const core = extractCoreDigits(rawPhone);

    // Buscar si ya existe por JID, altJids o últimos 8 dígitos del teléfono
    let existing = (db.leads || []).find(l => 
      (jid && (l.jid === jid || (l.altJids && l.altJids.includes(jid)))) ||
      (altJid && (l.jid === altJid || (l.altJids && l.altJids.includes(altJid)))) ||
      (core && core.length >= 7 && (extractCoreDigits(l.phone) === core || extractCoreDigits(l.jid) === core))
    );

    if (existing) {
      // Unificar JIDs alternativos (@lid y @s.whatsapp.net)
      if (!existing.altJids) existing.altJids = [];
      if (jid && existing.jid !== jid && !existing.altJids.includes(jid)) {
        existing.altJids.push(jid);
      }
      if (altJid && existing.jid !== altJid && !existing.altJids.includes(altJid)) {
        existing.altJids.push(altJid);
      }

      // Normalizar teléfono si estaba sin formato o era un ID @lid
      if (formattedPhone && (!existing.phone || existing.phone.includes('@lid') || !existing.phone.startsWith('+54'))) {
        existing.phone = formattedPhone;
      }

      // Prioridad inteligente de nombres:
      // 1. Si viene un nombre real (ej: "Juan Gonzalez" verificado en pedido/chat), fijarlo
      if (leadData.realName && leadData.realName.length >= 3 && !/funes|roque|efectivo|contacto/i.test(leadData.realName)) {
        existing.name = leadData.realName;
        existing.pushName = leadData.realName;
      } else if (!existing.name || existing.name.startsWith('+') || existing.name === 'Contacto WhatsApp' || existing.name === 'Usuario') {
        // 2. Si el actual es genérico, usar pushName
        const candidate = leadData.name || leadData.pushName;
        if (candidate && candidate !== 'Contacto WhatsApp' && !candidate.startsWith('+')) {
          existing.name = candidate;
        }
      }

      if (leadData.pushName && leadData.pushName !== 'Contacto WhatsApp') {
        existing.pushName = leadData.pushName;
      }

      if (leadData.email) existing.email = leadData.email;
      if (leadData.address) existing.address = leadData.address;
      if (leadData.preferredBranch) existing.preferredBranch = leadData.preferredBranch;
      if (leadData.deliveryType) existing.deliveryType = leadData.deliveryType;
      if (leadData.customFields) {
        existing.customFields = { ...(existing.customFields || {}), ...leadData.customFields };
      }

      if (leadData.lastMessage) existing.lastMessage = leadData.lastMessage;
      if (leadData.lastMessageAt) existing.lastMessageAt = leadData.lastMessageAt;
      if (leadData.unreadCount !== undefined) existing.unreadCount = leadData.unreadCount;

      // Auto-link to system user if one exists with same phone/jid
      if (!existing.linkedUserId) {
        const linkedUser = this.getUserByPhone(existing.phone) || this.getUserByJid(existing.jid);
        if (linkedUser) {
          existing.linkedUserId = linkedUser.id;
          if (!linkedUser.linkedLeadId) {
            linkedUser.linkedLeadId = existing.id;
            linkedUser.updatedAt = new Date().toISOString();
          }
        }
      }

      if (!existing.customerNumber) {
        existing.customerNumber = `CLI-${(existing.id || '0000').slice(-4).toUpperCase()}`;
      }

      existing.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return existing;
    } else {
      // Crear nuevo Lead unificado
      const realPhoneCandidate = formattedPhone || (jid && !isLidIdentifier(jid) ? `+${jid.split('@')[0]}` : '');
      const newLead = {
        id: leadData.id || `lead-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        customerNumber: `CLI-${Math.floor(1000 + Math.random() * 9000)}`,
        jid: jid || (formattedPhone ? `${formattedPhone.replace(/\D/g, '')}@s.whatsapp.net` : ''),
        altJids: altJid ? [altJid] : [],
        phone: realPhoneCandidate,
        name: leadData.realName || (leadData.name && leadData.name !== 'Contacto WhatsApp' ? leadData.name : (leadData.pushName && leadData.pushName !== 'Contacto WhatsApp' ? leadData.pushName : realPhoneCandidate || 'Nuevo Contacto')),
        pushName: leadData.pushName || 'Contacto WhatsApp',
        email: leadData.email || '',
        address: leadData.address || '',
        preferredBranch: leadData.preferredBranch || '',
        deliveryType: leadData.deliveryType || 'delivery',
        customFields: leadData.customFields || {},
        stage: leadData.stage || 'new_lead',
        value: leadData.value || 0,
        tags: leadData.tags || ['WhatsApp'],
        aiEnabled: leadData.aiEnabled !== undefined ? leadData.aiEnabled : true,
        unreadCount: leadData.unreadCount || 0,
        linkedUserId: null, // will be set below if a system user matches
        preferences: leadData.preferences || {
          favoriteCuts: [],
          cookingPreference: 'Parrilla',
          preferredPayment: 'Efectivo / Transferencia',
          groupSize: '4 personas',
          notes: ''
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Auto-link to system user if one exists with same phone/jid
      const linkedUser = this.getUserByPhone(newLead.phone) || this.getUserByJid(newLead.jid);
      if (linkedUser) {
        newLead.linkedUserId = linkedUser.id;
        if (!linkedUser.linkedLeadId) {
          linkedUser.linkedLeadId = newLead.id;
          linkedUser.updatedAt = new Date().toISOString();
        }
      }

      db.leads.unshift(newLead);
      this.writeDb(db);
      return newLead;
    }
  }

  /**
   * Reconcilia un identificador LID de WhatsApp con el JID/teléfono real del cliente
   */
  resolveLidToPhone(lidJid, phoneJid, pushName = null) {
    if (!lidJid || !phoneJid) return null;
    const db = this.readDb();
    if (!db.leads) db.leads = [];

    const normPhone = normalizePhoneNumber(phoneJid);
    const cleanPhoneJid = phoneJid.includes('@') ? phoneJid : `${phoneJid.replace(/\D/g, '')}@s.whatsapp.net`;
    const cleanLid = lidJid.includes('@') ? lidJid : `${lidJid}@lid`;

    // Buscar lead existente por LID o por teléfono
    let lead = db.leads.find(l => 
      l.jid === cleanLid || 
      (l.altJids && l.altJids.includes(cleanLid)) ||
      l.jid === cleanPhoneJid ||
      (normPhone && l.phone === normPhone)
    );

    if (lead) {
      if (!lead.altJids) lead.altJids = [];
      if (!lead.altJids.includes(cleanLid)) lead.altJids.push(cleanLid);
      if (!lead.altJids.includes(cleanPhoneJid)) lead.altJids.push(cleanPhoneJid);

      if (normPhone && (!lead.phone || isLidIdentifier(lead.phone))) {
        lead.phone = normPhone;
      }
      if (cleanPhoneJid && lead.jid.includes('@lid')) {
        lead.altJids.push(lead.jid);
        lead.jid = cleanPhoneJid;
      }
      if (pushName && pushName !== 'Contacto WhatsApp' && (!lead.name || lead.name === 'Contacto WhatsApp' || lead.name.startsWith('+'))) {
        lead.name = pushName;
        lead.pushName = pushName;
      }
      lead.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return lead;
    }
    return null;
  }

  saveOrUpdateLead(leadData) {
    return this.findOrCreateLead(leadData);
  }

  // --- Session Cart & Conversational State Management ---
  getSessionCart(jidOrLead) {
    const lead = typeof jidOrLead === 'object' ? jidOrLead : this.getLead(jidOrLead);
    if (!lead) return { items: [], totalAmount: 0, updatedAt: null };
    return lead.sessionCart || { items: [], totalAmount: 0, updatedAt: null };
  }

  updateSessionCart(jidOrLead, cartData) {
    const db = this.readDb();
    const cleanJid = typeof jidOrLead === 'object' ? (jidOrLead.jid || jidOrLead.id) : String(jidOrLead).trim();
    const core = extractCoreDigits(cleanJid);

    const lead = (db.leads || []).find(l => 
      l.id === cleanJid || 
      l.jid === cleanJid || 
      (l.altJids && l.altJids.includes(cleanJid)) ||
      (core && core.length >= 7 && (extractCoreDigits(l.phone) === core || extractCoreDigits(l.jid) === core))
    );

    if (lead) {
      const items = Array.isArray(cartData.items) ? cartData.items : [];
      const totalAmount = items.reduce((sum, it) => sum + (Number(it.subtotal) || (Number(it.price || 0) * (Number(it.quantity) || 1))), 0);
      lead.sessionCart = {
        items,
        totalAmount: Math.round(totalAmount),
        deliveryType: cartData.deliveryType || lead.deliveryType || 'delivery',
        branch: cartData.branch || lead.preferredBranch || 'URCA CENTRAL',
        paymentMethod: cartData.paymentMethod || 'Mercado Pago / Efectivo',
        notes: cartData.notes || '',
        updatedAt: new Date().toISOString()
      };
      this.writeDb(db);
      return lead.sessionCart;
    }
    return null;
  }

  clearSessionCart(jidOrLead) {
    const db = this.readDb();
    const cleanJid = typeof jidOrLead === 'object' ? (jidOrLead.jid || jidOrLead.id) : String(jidOrLead).trim();
    const core = extractCoreDigits(cleanJid);

    const lead = (db.leads || []).find(l => 
      l.id === cleanJid || 
      l.jid === cleanJid || 
      (l.altJids && l.altJids.includes(cleanJid)) ||
      (core && core.length >= 7 && (extractCoreDigits(l.phone) === core || extractCoreDigits(l.jid) === core))
    );

    if (lead) {
      lead.sessionCart = null;
      this.writeDb(db);
      return true;
    }
    return false;
  }

  deduplicateDatabase() {
    const db = this.readDb();
    if (!db.leads || db.leads.length <= 1) return;

    const uniqueLeads = [];
    const leadMap = new Map();

    for (const lead of db.leads) {
      const core = extractCoreDigits(lead.phone || lead.jid);
      const key = (core && core.length >= 7) ? core : lead.jid;

      if (!leadMap.has(key)) {
        leadMap.set(key, lead);
        if (!lead.altJids) lead.altJids = [];
        if (lead.phone) lead.phone = normalizePhoneNumber(lead.phone);
        uniqueLeads.push(lead);
      } else {
        const master = leadMap.get(key);
        if (lead.jid && master.jid !== lead.jid && !master.altJids.includes(lead.jid)) {
          master.altJids.push(lead.jid);
        }
        if (lead.altJids) {
          lead.altJids.forEach(j => {
            if (j && master.jid !== j && !master.altJids.includes(j)) master.altJids.push(j);
          });
        }
        // Conservar mejor nombre
        if (lead.name && !lead.name.startsWith('+') && lead.name !== 'Contacto WhatsApp' && lead.name !== 'efectivo' && (master.name.startsWith('+') || master.name === 'Contacto WhatsApp' || master.name === 'Don Juan' || master.name === 'efectivo')) {
          master.name = lead.name;
        }
        if (lead.value > master.value) master.value = lead.value;
        if (lead.stage === 'closed_won') master.stage = 'closed_won';
        if (lead.notes && !master.notes) master.notes = lead.notes;
        if (lead.address && !master.address) master.address = lead.address;
        if (lead.preferences) {
          master.preferences = { ...(master.preferences || {}), ...lead.preferences };
        }
        master.updatedAt = new Date().toISOString();
      }
    }

    db.leads = uniqueLeads;
    this.writeDb(db);
  }

  updateLead(jidOrId, updates) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (lead) {
      Object.assign(lead, updates);
      lead.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return lead;
    }
    return null;
  }

  updateLeadStage(jidOrId, stage) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (lead) {
      lead.stage = stage;
      lead.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return lead;
    }
    return null;
  }

  updateLeadAiStatus(jidOrId, aiEnabled) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (lead) {
      lead.aiEnabled = Boolean(aiEnabled);
      lead.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return lead;
    }
    return null;
  }

  deleteLead(id) {
    const db = this.readDb();
    const cleanId = String(id).trim();
    const lead = (db.leads || []).find(l => l.id === cleanId || l.jid === cleanId);
    const jids = [cleanId];
    if (lead) {
      if (lead.jid) jids.push(lead.jid);
      if (lead.altJids) jids.push(...lead.altJids);
    }
    db.leads = (db.leads || []).filter(l => !jids.includes(l.id) && !jids.includes(l.jid));
    db.messages = (db.messages || []).filter(m => !jids.includes(m.chatId));
    this.writeDb(db);
    return true;
  }

  clearMessagesForChat(chatId) {
    const db = this.readDb();
    const cleanId = String(chatId).trim();
    const lead = (db.leads || []).find(l => l.id === cleanId || l.jid === cleanId);
    const jids = [cleanId];
    if (lead) {
      if (lead.jid) jids.push(lead.jid);
      if (lead.altJids) jids.push(...lead.altJids);
      lead.lastMessage = '';
      lead.unreadCount = 0;
      lead.updatedAt = new Date().toISOString();
    }
    db.messages = (db.messages || []).filter(m => !jids.includes(m.chatId));
    this.writeDb(db);
    return true;
  }

  // --- Messages ---
  getMessages(chatId, limit = 50) {
    const db = this.readDb();
    const cleanId = String(chatId).trim();
    const lead = (db.leads || []).find(l => l.id === cleanId || l.jid === cleanId);
    const jids = [cleanId];
    if (lead) {
      if (lead.jid) jids.push(lead.jid);
      if (lead.altJids) jids.push(...lead.altJids);
    }
    const messages = (db.messages || []).filter(m => jids.includes(m.chatId));
    return messages.slice(-limit);
  }

  saveMessage(msgData) {
    const db = this.readDb();
    if (!db.messages) db.messages = [];

    const chatId = msgData.chatId || msgData.jid || '';
    const content = (msgData.content || '').trim();
    const sender = msgData.sender || 'user';
    const now = Date.now();

    // 1. Si ya existe un mensaje con el mismo ID exacto, actualizarlo sin duplicar
    if (msgData.id) {
      const existingById = db.messages.find(m => m.id === msgData.id);
      if (existingById) {
        Object.assign(existingById, msgData);
        this.writeDb(db);
        return { ...existingById, _isDuplicate: true };
      }
    }

    // 2. Deduping inteligente para mensajes de salida (agent / bot):
    // Si en los últimos 15 segundos ya se guardó un mensaje idéntico para este chatId, actualizar ID en lugar de duplicar
    if (sender === 'agent' && content) {
      const recentDuplicate = db.messages.slice(-20).reverse().find(m => {
        if (m.sender !== 'agent' || m.chatId !== chatId) return false;
        if ((m.content || '').trim() !== content) return false;
        const msgTime = new Date(m.timestamp).getTime();
        return Math.abs(now - msgTime) < 15000;
      });

      if (recentDuplicate) {
        if (msgData.id && !recentDuplicate.id.startsWith('true_') && !recentDuplicate.id.startsWith('BAE5')) {
          recentDuplicate.id = msgData.id;
        }
        if (msgData.mediaUrl) recentDuplicate.mediaUrl = msgData.mediaUrl;
        if (msgData.status) recentDuplicate.status = msgData.status;
        this.writeDb(db);
        return { ...recentDuplicate, _isDuplicate: true };
      }
    }

    const newMsg = {
      id: msgData.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      chatId: chatId,
      timestamp: msgData.timestamp || new Date().toISOString(),
      status: msgData.status || 'sent',
      ...msgData
    };
    newMsg.chatId = chatId;

    db.messages.push(newMsg);

    // Actualizar datos del lead automáticamente
    if (newMsg.chatId) {
      const lead = (db.leads || []).find(l => l.jid === newMsg.chatId || (l.altJids && l.altJids.includes(newMsg.chatId)));
      if (lead) {
        lead.lastMessage = newMsg.type === 'audio' ? '🎤 [Nota de voz]' : newMsg.content;
        lead.lastMessageAt = newMsg.timestamp;
        lead.updatedAt = newMsg.timestamp;
        if (newMsg.sender === 'user') {
          lead.unreadCount = (lead.unreadCount || 0) + 1;
        }
      }
    }

    this.writeDb(db);
    return newMsg;
  }

  markChatRead(chatId) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.jid === chatId || (l.altJids && l.altJids.includes(chatId)));
    if (lead) {
      lead.unreadCount = 0;
      this.writeDb(db);
      return true;
    }
    return false;
  }

  // --- Calls ---
  getCalls() {
    const db = this.readDb();
    return (db.calls || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  saveCall(callData) {
    const db = this.readDb();
    if (!db.calls) db.calls = [];

    const newCall = {
      id: callData.id || `call-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: callData.timestamp || new Date().toISOString(),
      direction: callData.direction || 'incoming',
      status: callData.status || 'missed',
      duration: callData.duration || 0,
      aiFollowUpSent: Boolean(callData.aiFollowUpSent),
      ...callData
    };

    db.calls.push(newCall);
    this.writeDb(db);
    return newCall;
  }

  updateCall(id, updateData) {
    const db = this.readDb();
    const call = (db.calls || []).find(c => c.id === id);
    if (call) {
      Object.assign(call, updateData);
      this.writeDb(db);
      return call;
    }
    return null;
  }

  // --- Products Catalog & PLU Barcode System ---
  static MASTER_PRODUCTS_SEED = [
    { id: 'prod_asadazo', plu: '2001', barcode: '7792001000001', name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', price: 39999, ivaRate: 21, unit: 'combo', saleMode: 'combo', unitsPerKg: 1, unitWeightGrams: 4000, unitPrice: 39999, category: 'Combos en Oferta', description: '4 kg cortes parrilleros (Bocado, Aguja, Falda, Chori criollo, Morcilla) + 1 Vino Howlmande Malbec Reserva de regalo', stock: 100, isAvailable: true, sku: 'PLU-2001' },
    { id: 'prod_tapa_cuadril', plu: '2002', barcode: '7792002000002', name: 'Tapa de Cuadril Seleccionada', price: 12800, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1200, unitPrice: 15360, category: 'Parrilla y Horno', description: 'Corte de novillito seleccionado con cobertura de grasa perfecta', stock: 85, isAvailable: true, sku: 'PLU-2002' },
    { id: 'prod_vacio', plu: '2003', barcode: '7792003000003', name: 'Vacío Especial Seleccionado', price: 11500, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1400, unitPrice: 16100, category: 'Parrilla', description: 'Vacío tierno y jugoso de novillito', stock: 90, isAvailable: true, sku: 'PLU-2003' },
    { id: 'prod_costillar', plu: '2004', barcode: '7792004000004', name: 'Costillar / Asado de Tira Novillito', price: 9800, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 2, unitWeightGrams: 500, unitPrice: 4900, category: 'Parrilla', description: 'Tira de asado con excelente marmoleado', stock: 120, isAvailable: true, sku: 'PLU-2004' },
    { id: 'prod_bife_chorizo', plu: '2005', barcode: '7792005000005', name: 'Bife de Chorizo Premium', price: 14500, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 3, unitWeightGrams: 330, unitPrice: 4833, category: 'Cortes Premium', description: 'Corte deshuesado de lomo de novillito (~330g por bife)', stock: 60, isAvailable: true, sku: 'PLU-2005' },
    { id: 'prod_entrana', plu: '2006', barcode: '7792006000006', name: 'Entraña Fina Seleccionada', price: 16900, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 2, unitWeightGrams: 500, unitPrice: 8450, category: 'Cortes Premium', description: 'Entraña tierna y crocante a la brasa (~500g la tira)', stock: 45, isAvailable: true, sku: 'PLU-2006' },
    { id: 'prod_matambre_cerdo', plu: '2007', barcode: '7792007000007', name: 'Matambrito de Cerdo Tiernizado', price: 8500, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 1, unitWeightGrams: 900, unitPrice: 7650, category: 'Cerdo y Parrilla', description: 'Matambre de cerdo fresco listo para parrilla o limón (~900g por pieza)', stock: 70, isAvailable: true, sku: 'PLU-2007' },
    { id: 'prod_matambre_vaca', plu: '2008', barcode: '7792008000008', name: 'Matambre Vacuno', price: 9500, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1500, unitPrice: 14250, category: 'Parrilla y Horno', description: 'Matambre vacuno magro y tierno', stock: 65, isAvailable: true, sku: 'PLU-2008' },
    { id: 'prod_bondiola', plu: '2009', barcode: '7792009000009', name: 'Bondiola de Cerdo sin Hueso', price: 8900, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1800, unitPrice: 16020, category: 'Cerdo', description: 'Pieza entera o fraccionada de bondiola de cerdo', stock: 80, isAvailable: true, sku: 'PLU-2009' },
    { id: 'prod_costeletas_cerdo', plu: '2010', barcode: '7792010000010', name: 'Costeletas de Cerdo (2kg x $15.000 promo)', price: 7500, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 4, unitWeightGrams: 250, unitPrice: 1875, category: 'Cerdo', description: 'Chuletas frescas de cerdo (~4 unidades por kilo)', stock: 110, isAvailable: true, sku: 'PLU-2010' },
    { id: 'prod_costeletas_ternera', plu: '2011', barcode: '7792011000011', name: 'Costeletas de Ternera (2kg x $35.000 promo)', price: 17500, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 4, unitWeightGrams: 250, unitPrice: 4375, category: 'Cortes Tradicionales', description: 'Costeletas de ternera de primera calidad (~4 unidades por kilo)', stock: 75, isAvailable: true, sku: 'PLU-2011' },
    { id: 'prod_chorizo', plu: '2012', barcode: '7792012000012', name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', price: 5000, ivaRate: 21, unit: 'kg', saleMode: 'both', unitsPerKg: 8, unitWeightGrams: 125, unitPrice: 625, category: 'Embutidos', description: 'Embutido parrillero 100% puro cerdo (promedio entre 7 y 9 unidades por kilo, ~125g c/u)', stock: 200, isAvailable: true, sku: 'PLU-2012' },
    { id: 'prod_morcilla', plu: '2013', barcode: '7792013000013', name: 'Morcilla Bombón Parrillera', price: 5200, ivaRate: 21, unit: 'kg', saleMode: 'both', unitsPerKg: 7, unitWeightGrams: 140, unitPrice: 742, category: 'Embutidos', description: 'Morcillas bombón suaves y cremosas (~7 unidades por kilo, ~140g c/u)', stock: 140, isAvailable: true, sku: 'PLU-2013' },
    { id: 'prod_mollejas', plu: '2014', barcode: '7792014000014', name: 'Mollejas de Corazón', price: 14800, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 3, unitWeightGrams: 330, unitPrice: 4933, category: 'Achuras', description: 'Achura crocante por fuera y suave por dentro (~3 unidades por kilo)', stock: 35, isAvailable: true, sku: 'PLU-2014' },
    { id: 'prod_chinchulines', plu: '2015', barcode: '7792015000015', name: 'Chinchulines Crocantes', price: 4800, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1000, unitPrice: 4800, category: 'Achuras', description: 'Chinchulines seleccionados y limpios', stock: 90, isAvailable: true, sku: 'PLU-2015' },
    { id: 'prod_molida_especial', plu: '2016', barcode: '7792016000016', name: 'Carne Molida Especial Seleccionada (Magra)', price: 11800, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1000, unitPrice: 11800, category: 'Diario y Preparados', description: 'Carne picada de primera sin grasa', stock: 150, isAvailable: true, sku: 'PLU-2016' },
    { id: 'prod_molida_intermedia', plu: '2017', barcode: '7792017000017', name: 'Carne Molida Intermedia (3kg x $27.000 promo)', price: 9000, ivaRate: 10.5, unit: 'kg', saleMode: 'kg', unitsPerKg: 1, unitWeightGrams: 1000, unitPrice: 9000, category: 'Diario y Preparados', description: 'Molida para empanadas o salsas', stock: 130, isAvailable: true, sku: 'PLU-2017' },
    { id: 'prod_milanesas', plu: '2018', barcode: '7792018000018', name: 'Milanesas de Ternera preparadas (2kg x $24.990)', price: 12495, ivaRate: 21, unit: 'kg', saleMode: 'both', unitsPerKg: 6, unitWeightGrams: 165, unitPrice: 2082, category: 'Diario y Preparados', description: 'Milanesas rebozadas listas para freír (~6 milanesas por kilo)', stock: 100, isAvailable: true, sku: 'PLU-2018' },
    { id: 'prod_pollo', plu: '2019', barcode: '7792019000019', name: 'Pata Muslo Fresca (3kg x $13.990 promo)', price: 4660, ivaRate: 10.5, unit: 'kg', saleMode: 'both', unitsPerKg: 3, unitWeightGrams: 330, unitPrice: 1553, category: 'Pollo', description: 'Pollo fresco seleccionado (~3 patas muslo por kilo)', stock: 160, isAvailable: true, sku: 'PLU-2019' },
    { id: 'prod_carbon', plu: '2020', barcode: '7792020000020', name: 'Carbón Quebracho Blanco (Bolsa Grande)', price: 2200, ivaRate: 21, unit: 'bolsa', saleMode: 'unit', unitsPerKg: 1, unitWeightGrams: 4000, unitPrice: 2200, category: 'Almacén Parrillero', description: 'Carbón de leña dura de larga duración', stock: 250, isAvailable: true, sku: 'PLU-2020' },
    { id: 'prod_vino', plu: '2021', barcode: '7792021000021', name: 'Vino Howlmande Malbec Reserva', price: 5500, ivaRate: 21, unit: 'botella', saleMode: 'unit', unitsPerKg: 1, unitWeightGrams: 750, unitPrice: 5500, category: 'Bebidas', description: 'Vino tinto Malbec premium para maridar carnes', stock: 80, isAvailable: true, sku: 'PLU-2021' }
  ];

  seedMasterProducts(force = false) {
    const db = this.readDb();
    if (!db.products) db.products = [];

    if (force || db.products.length === 0) {
      db.products = [...DatabaseService.MASTER_PRODUCTS_SEED];
      this.writeDb(db);
      console.log(`🥩 [Database] Catálogo Maestro inicializado con ${db.products.length} productos y códigos PLU.`);
    }
    return db.products;
  }

  getProducts() {
    const db = this.readDb();
    if (!db.products || db.products.length === 0) {
      return this.seedMasterProducts();
    }
    return db.products;
  }

  parseBarcode(barcode) {
    if (!barcode) return null;
    const raw = String(barcode).trim();
    // Balanza pesable: código empieza con 20 o 02 (formato balanza argentina: 20 + 5 dígitos PLU + 5 dígitos peso/precio)
    if (/^(20|02)\d{10,11}$/.test(raw)) {
      const pluNum = raw.slice(2, 7).replace(/^0+/, '');
      const valDigits = parseInt(raw.slice(7, 12), 10) || 0;
      const weightKg = Number((valDigits / 1000).toFixed(3));
      return {
        type: 'scale_balance',
        raw,
        plu: pluNum,
        scaleValue: valDigits,
        weightKg,
        weight: weightKg,
        isBalanceWeight: true,
        isScale: true
      };
    }
    return {
      type: 'standard',
      raw,
      plu: null,
      isBalanceWeight: false,
      isScale: false
    };
  }

  saveProduct(prodData) {
    const db = this.readDb();
    if (!db.products) db.products = [];

    const plu = String(prodData.plu || (prodData.barcode ? prodData.barcode.slice(-4) : `${2000 + db.products.length + 1}`)).trim();
    const barcode = String(prodData.barcode || (plu ? `779${plu.padStart(4, '0')}000001` : '')).trim();

    const isMeat = /vacio|costill|cuadril|entra[nñ]a|matambre|bondiola|costeleta|ternera|molida|pollo|pata|muslo|achura|chinchulin|molleja/i.test(prodData.name || '') || 
                   /parrilla|vacun|cerdo|pollo|achura|tradicional/i.test(prodData.category || '');
    const ivaRate = prodData.ivaRate !== undefined ? Number(prodData.ivaRate) : (isMeat ? 10.5 : 21);

    const existingIndex = db.products.findIndex(p => p.id === prodData.id || (plu && p.plu === plu));
    const availableInStore = prodData.availableInStore !== undefined 
      ? Boolean(prodData.availableInStore) 
      : (prodData.isAvailable !== false);
    const availableInWhatsApp = prodData.availableInWhatsApp !== undefined 
      ? Boolean(prodData.availableInWhatsApp) 
      : (prodData.isAvailable !== false);

    const newProduct = {
      id: prodData.id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      plu: plu,
      barcode: barcode,
      name: prodData.name || 'Nuevo Producto',
      category: prodData.category || 'Parrilla',
      price: Number(prodData.price) || 0,
      ivaRate: ivaRate,
      unit: prodData.unit || 'kg',
      description: prodData.description || '',
      stock: Number(prodData.stock) ?? 100,
      imageUrl: prodData.imageUrl || '',
      isAvailable: prodData.isAvailable !== false,
      availableInStore,
      availableInWhatsApp,
      sku: prodData.sku || (plu ? `PLU-${plu}` : ''),
      updatedAt: new Date().toISOString(),
      ...prodData,
      plu: plu,
      barcode: barcode,
      ivaRate: ivaRate,
      availableInStore,
      availableInWhatsApp
    };

    if (existingIndex >= 0) {
      db.products[existingIndex] = { ...db.products[existingIndex], ...newProduct };
    } else {
      db.products.push(newProduct);
    }

    this.writeDb(db);
    return newProduct;
  }

  updateProduct(id, updateData) {
    const db = this.readDb();
    const product = (db.products || []).find(p => p.id === id);
    if (product) {
      Object.assign(product, updateData, { updatedAt: new Date().toISOString() });
      this.writeDb(db);
      return product;
    }
    return null;
  }

  bulkUpdateProducts(productIds, updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(db.products) || !Array.isArray(productIds)) return [];
    const updatedList = [];
    const idSet = new Set(productIds);

    db.products = db.products.map(p => {
      if (idSet.has(p.id) || idSet.has(p.plu)) {
        const modified = { ...p };
        if (updates.pricePercentChange !== undefined) {
          const factor = 1 + (Number(updates.pricePercentChange) / 100);
          modified.price = Math.max(0, Math.round(Number(p.price || 0) * factor));
        }
        if (updates.ivaRate !== undefined) modified.ivaRate = Number(updates.ivaRate);
        if (updates.availableInStore !== undefined) modified.availableInStore = Boolean(updates.availableInStore);
        if (updates.availableInWhatsApp !== undefined) modified.availableInWhatsApp = Boolean(updates.availableInWhatsApp);
        if (updates.isAvailable !== undefined) modified.isAvailable = Boolean(updates.isAvailable);
        if (updates.category !== undefined) modified.category = updates.category;
        
        modified.updatedAt = new Date().toISOString();
        updatedList.push(modified);
        return modified;
      }
      return p;
    });

    this.writeDb(db);
    return updatedList;
  }

  bulkDeleteProducts(productIds) {
    const db = this.readDb();
    if (!Array.isArray(db.products) || !Array.isArray(productIds)) return 0;
    const idSet = new Set(productIds);
    const beforeCount = db.products.length;
    db.products = db.products.filter(p => !idSet.has(p.id) && !idSet.has(p.plu));
    this.writeDb(db);
    return beforeCount - db.products.length;
  }

  updateProductStock(id, stockDelta, isAbsolute = false) {
    const db = this.readDb();
    const product = (db.products || []).find(p => p.id === id || p.plu === id);
    if (product) {
      if (isAbsolute) {
        product.stockQuantity = Math.max(0, Number(stockDelta) || 0);
      } else {
        const current = Number(product.stockQuantity ?? product.stock ?? 100);
        product.stockQuantity = Math.max(0, current + Number(stockDelta));
      }
      product.stock = product.stockQuantity;
      if (product.stockQuantity === 0 && !product.allowBackorder) {
        product.isAvailable = false;
      }
      product.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return product;
    }
    return null;
  }

  // --- Quick Replies / Plantillas para Operador Humano ---
  getQuickReplies() {
    const db = this.readDb();
    if (!db.quickReplies || db.quickReplies.length === 0) {
      db.quickReplies = [
        {
          id: 'qr-branches',
          title: '🏪 Sucursales y Direcciones',
          category: 'sucursales',
          content: '🏪 *NUESTRAS 6 SUCURSALES EN CÓRDOBA:*\n\n1️⃣ *URCA CENTRAL:* Av. José Roque Funes 1115 (📞 3513906947)\n2️⃣ *URCA 2 – ALTO TEJEDA:* Av. Menéndez Pidal 3575 (📞 3518623195)\n3️⃣ *INTERCOUNTRY – CORTEZA MALL:* Av. Los Álamos 1015 (📞 3518623194)\n4️⃣ *DUARTE QUIRÓS:* Av. Duarte Quirós 5130 (📞 3518156595)\n5️⃣ *VILLA ALLENDE:* Av. Figueroa Alcorta 480 (📞 3513540031)\n6️⃣ *COUNTRY SAN ISIDRO:* Av. Padre Luchesse km 2 (📞 3518769099)\n\n🛵 *Envíos directos a domicilio en el día en todo Córdoba.*'
        },
        {
          id: 'qr-hours',
          title: '⏰ Horarios de Atención',
          category: 'horarios',
          content: '⏰ *HORARIOS DE ATENCIÓN EN SUCURSALES:*\n\n🥩 *Urca Central / Urca 2 / Intercountry:*\nLunes a Sábado: 9:00 a 21:00 hs | Domingos: 9:00 a 13:30 hs\n\n🥩 *Duarte Quirós / Villa Allende:*\nLunes a Sábado: 9:00 a 13:30 y 17:00 a 21:00 hs | Domingos: 9:00 a 13:30 hs\n\n🥩 *Country San Isidro:*\nLunes a Miércoles: 7:00 a 00:00 hs | Jueves a Sábado: 7:00 a 01:00 hs'
        },
        {
          id: 'qr-payment',
          title: '💳 Datos Bancarios y Medios de Pago',
          category: 'pagos',
          content: '💳 *DATOS DE PAGO OFICIALES:*\n\n📱 *Alias Mercado Pago / Bancario:* `republica.carne.mp`\n🏦 *Titular:* República de la Carne\n\n👉 *También aceptamos:* Efectivo contraentrega, Débito/Crédito y Dinero en cuenta de Mercado Pago.\nEn cuanto transfieras, por favor pasanos el comprobante por acá para despachar tu pedido al instante. 🙌'
        },
        {
          id: 'qr-promos',
          title: '🥩 Promociones y Combos Estrella',
          category: 'productos',
          content: '🔥 *OFERTAS DESTACADAS DEL DÍA:*\n\n1️⃣ Combo “Asadazo” (4 kg cortes + Vino de regalo) ➔ $39.999\n2️⃣ Vacío Especial Seleccionado ➔ $11.500 / kg\n3️⃣ Costillar Novillito ➔ $9.800 / kg\n4️⃣ Bife de Chorizo Premium ➔ $14.500 / kg\n5️⃣ Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) ➔ $5.000 / kg\n6️⃣ Matambrito de Cerdo Tiernizado ➔ $8.500 / kg'
        },
        {
          id: 'qr-order-status',
          title: '🚚 Estado y Despacho de Pedido',
          category: 'pedidos',
          content: '¡Hola {nombre}! 👋 Tu pedido #{pedido_id} por ${total} se encuentra en preparación en carnicería y saldrá en el próximo despacho con nuestro repartidor a {direccion}. ¡Te avisamos en cuanto esté en viaje! 🥩🛵'
        }
      ];
      this.writeDb(db);
    }
    return db.quickReplies;
  }

  saveQuickReply(replyData) {
    const db = this.readDb();
    if (!db.quickReplies) db.quickReplies = [];
    const id = replyData.id || `qr-${Date.now()}`;
    const entry = {
      id,
      title: replyData.title || 'Respuesta Rápida',
      category: replyData.category || 'general',
      content: replyData.content || '',
      updatedAt: new Date().toISOString()
    };
    const idx = db.quickReplies.findIndex(r => r.id === id);
    if (idx >= 0) {
      db.quickReplies[idx] = { ...db.quickReplies[idx], ...entry };
    } else {
      db.quickReplies.push(entry);
    }
    this.writeDb(db);
    return entry;
  }

  deleteQuickReply(id) {
    const db = this.readDb();
    if (!db.quickReplies) return true;
    db.quickReplies = db.quickReplies.filter(r => r.id !== id);
    this.writeDb(db);
    return true;
  }

  deleteProduct(id) {
    const db = this.readDb();
    if (!db.products) return true;
    db.products = db.products.filter(p => p.id !== id);
    this.writeDb(db);
    return true;
  }

  saveProductsBulk(products = [], replaceAll = false) {
    const db = this.readDb();
    if (!db.products || replaceAll) db.products = [];

    const now = new Date().toISOString();
    const existingMap = new Map();
    if (!replaceAll) {
      db.products.forEach(p => existingMap.set(p.id, p));
    }

    for (const p of products) {
      const plu = String(p.plu || (p.barcode ? p.barcode.slice(-4) : '')).trim();
      const barcode = String(p.barcode || '').trim();
      const sku = String(p.sku || (plu ? `PLU-${plu}` : '')).trim();
      const id = p.id || `prod-${plu || barcode || sku || Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      const normalized = {
        id,
        plu,
        barcode,
        sku,
        name: p.name || 'Producto',
        category: p.category || 'General',
        price: Number(p.price) || 0,
        unit: p.unit || 'kg',
        description: p.description || '',
        stock: Number(p.stock) !== undefined && !isNaN(Number(p.stock)) ? Number(p.stock) : 100,
        imageUrl: p.imageUrl || '',
        isAvailable: p.isAvailable !== false,
        updatedAt: now
      };

      existingMap.set(id, normalized);
    }

    db.products = Array.from(existingMap.values());
    this.writeDb(db);
    return db.products;
  }

  // --- Knowledge / RAG Base ---
  getKnowledge() {
    const db = this.readDb();
    return db.knowledgeBase || db.knowledge || [];
  }

  saveKnowledgeDoc(docData) {
    const db = this.readDb();
    if (!db.knowledgeBase) db.knowledgeBase = db.knowledge || [];
    const id = docData.id || `doc-${Date.now()}`;
    const idx = db.knowledgeBase.findIndex(k => k.id === id);
    const doc = {
      id,
      title: docData.title || 'Documento de Conocimiento',
      category: docData.category || 'general',
      tags: docData.tags || [],
      keywords: docData.keywords || docData.tags || [],
      content: docData.content || '',
      updatedAt: new Date().toISOString()
    };
    if (idx >= 0) {
      db.knowledgeBase[idx] = { ...db.knowledgeBase[idx], ...doc };
    } else {
      db.knowledgeBase.unshift(doc);
    }
    this.writeDb(db);
    return doc;
  }

  // --- Broadcast Campaigns ---
  getCampaigns() {
    const db = this.readDb();
    return db.campaigns || [];
  }

  saveCampaign(camp) {
    const db = this.readDb();
    if (!db.campaigns) db.campaigns = [];
    const idx = db.campaigns.findIndex(c => c.id === camp.id);
    if (idx >= 0) {
      db.campaigns[idx] = { ...db.campaigns[idx], ...camp, updatedAt: new Date().toISOString() };
    } else {
      db.campaigns.unshift(camp);
    }
    this.writeDb(db);
    return camp;
  }

  // --- Metrics / Analytics ---
  getMetrics() {
    const db = this.readDb();
    const leads = db.leads || [];
    const messages = db.messages || [];
    const calls = db.calls || [];

    const totalLeads = leads.length;
    const closedWon = leads.filter(l => l.stage === 'closed_won');
    const closedLost = leads.filter(l => l.stage === 'closed_lost');
    const totalPipelineValue = leads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    const wonRevenue = closedWon.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    
    const conversionRate = totalLeads > 0 ? ((closedWon.length / totalLeads) * 100).toFixed(1) : 0;
    
    const userMessages = messages.filter(m => m.sender === 'user').length;
    const agentMessages = messages.filter(m => m.sender === 'agent').length;
    const audioMessages = messages.filter(m => m.type === 'audio').length;

    const stagesCount = {
      new_lead: leads.filter(l => l.stage === 'new_lead').length,
      qualified: leads.filter(l => l.stage === 'qualified').length,
      negotiating: leads.filter(l => l.stage === 'negotiating').length,
      proposal: leads.filter(l => l.stage === 'proposal').length,
      closed_won: closedWon.length,
      closed_lost: closedLost.length
    };

    return {
      totalLeads,
      totalPipelineValue,
      wonRevenue,
      conversionRate: Number(conversionRate),
      totalMessages: messages.length,
      userMessages,
      agentMessages,
      audioMessages,
      totalCalls: calls.length,
      missedCalls: calls.filter(c => c.status === 'missed').length,
      completedCalls: calls.filter(c => c.status === 'completed').length,
      stagesCount
    };
  }

  /**
   * Obtiene estadísticas completas y multidimensionales de ventas por Sucursal, Producto, Canal y Método de Pago
   */
  getSalesStatistics(filters = {}) {
    const db = this.readDb();
    const orders = db.orders || [];
    const branches = db.branches || [];
    const products = db.products || [];

    const {
      fromDate,
      toDate,
      branchId,
      channel,
      paymentMethod,
      status
    } = filters;

    // Filtrar pedidos según rango de fechas y filtros seleccionados
    const filteredOrders = orders.filter(o => {
      if (status && status !== 'all' && o.status !== status) return false;
      // Por defecto no incluir pedidos cancelados en métricas de venta salvo que se filtre explícitamente
      if (!status && o.status === 'cancelled') return false;

      if (fromDate) {
        const orderDate = new Date(o.createdAt);
        if (orderDate < new Date(fromDate)) return false;
      }
      if (toDate) {
        const orderDate = new Date(o.createdAt);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) return false;
      }

      if (branchId && branchId !== 'all') {
        const orderBranchId = o.branchId || o.branch;
        if (orderBranchId !== branchId && o.branchName !== branchId) return false;
      }

      const orderChannel = o.channel || (o.notes?.includes('[POS Mostrador]') ? 'pos' : (o.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
      if (channel && channel !== 'all' && orderChannel !== channel) return false;

      if (paymentMethod && paymentMethod !== 'all') {
        const pm = (o.paymentMethod || '').toLowerCase();
        if (!pm.includes(paymentMethod.toLowerCase())) return false;
      }

      return true;
    });

    // 1. KPIs Generales
    const totalOrdersCount = filteredOrders.length;
    const totalSalesAmount = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const averageTicket = totalOrdersCount > 0 ? Math.round(totalSalesAmount / totalOrdersCount) : 0;

    let paidAmount = 0;
    let pendingAmount = 0;

    filteredOrders.forEach(o => {
      const isPaid = o.paymentStatus === 'paid' || o.mpPaymentId || (o.paymentMethod && o.paymentMethod.toLowerCase().includes('mercado pago')) || o.status === 'delivered';
      const amt = Number(o.totalAmount) || 0;
      if (isPaid) paidAmount += amt;
      else pendingAmount += amt;
    });

    // 2. Estadísticas por Sucursal
    const branchMap = new Map();
    // Inicializar con sucursales oficiales
    branches.forEach(b => {
      branchMap.set(b.id || b.name, {
        id: b.id || b.name,
        name: b.name,
        address: b.address || '',
        totalRevenue: 0,
        ordersCount: 0,
        paidRevenue: 0,
        productsSold: new Map()
      });
    });

    // Asegurar sucursales conocidas
    const defaultBranchNames = [
      'URCA CENTRAL',
      'URCA 2 – ALTO TEJEDA',
      'CERRO DE LAS ROSAS',
      'ALTA CÓRDOBA',
      'GENERAL PAZ',
      'CENTRO'
    ];
    defaultBranchNames.forEach(name => {
      if (!branchMap.has(name)) {
        branchMap.set(name, {
          id: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: name,
          address: 'Córdoba Capital',
          totalRevenue: 0,
          ordersCount: 0,
          paidRevenue: 0,
          productsSold: new Map()
        });
      }
    });

    // Acumular ventas por sucursal
    filteredOrders.forEach(o => {
      const bKey = o.branchName || o.branch || 'URCA CENTRAL';
      let entry = branchMap.get(bKey);
      if (!entry) {
        entry = {
          id: bKey.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: bKey,
          address: 'Córdoba Capital',
          totalRevenue: 0,
          ordersCount: 0,
          paidRevenue: 0,
          productsSold: new Map()
        };
        branchMap.set(bKey, entry);
      }

      const amt = Number(o.totalAmount) || 0;
      entry.totalRevenue += amt;
      entry.ordersCount += 1;
      const isPaid = o.paymentStatus === 'paid' || o.mpPaymentId || (o.paymentMethod && o.paymentMethod.toLowerCase().includes('mercado pago')) || o.status === 'delivered';
      if (isPaid) entry.paidRevenue += amt;

      // Registrar productos vendidos en esta sucursal
      const orderProducts = Array.isArray(o.products) && o.products.length > 0 ? o.products : [];
      orderProducts.forEach(p => {
        const pName = p.name || 'Producto';
        const current = entry.productsSold.get(pName) || { qty: 0, total: 0 };
        current.qty += Number(p.quantity) || 1;
        current.total += Number(p.subtotal) || (Number(p.price) * Number(p.quantity)) || 0;
        entry.productsSold.set(pName, current);
      });
    });

    const branchStats = Array.from(branchMap.values()).map(b => {
      // Top producto de esta sucursal
      let topProd = 'Sin ventas registradas';
      let topProdTotal = 0;
      b.productsSold.forEach((val, key) => {
        if (val.total > topProdTotal) {
          topProdTotal = val.total;
          topProd = `${key} ($${val.total.toLocaleString('es-AR')})`;
        }
      });

      return {
        id: b.id,
        name: b.name,
        address: b.address,
        totalRevenue: b.totalRevenue,
        ordersCount: b.ordersCount,
        paidRevenue: b.paidRevenue,
        percentageOfTotal: totalSalesAmount > 0 ? Math.round((b.totalRevenue / totalSalesAmount) * 100) : 0,
        averageTicket: b.ordersCount > 0 ? Math.round(b.totalRevenue / b.ordersCount) : 0,
        topProduct: topProd
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // 3. Estadísticas por Producto / Corte
    const productSalesMap = new Map();

    filteredOrders.forEach(o => {
      const orderProducts = Array.isArray(o.products) && o.products.length > 0 ? o.products : [];
      if (orderProducts.length > 0) {
        orderProducts.forEach(p => {
          const key = (p.plu ? `PLU-${p.plu}` : p.name).toLowerCase();
          const existing = productSalesMap.get(key) || {
            id: p.id || key,
            plu: p.plu || '',
            name: p.name || 'Producto',
            category: p.category || 'Parrilla y Vacuno',
            unit: p.unit || 'kg',
            unitsSold: 0,
            totalRevenue: 0,
            ordersCount: 0
          };
          existing.unitsSold += Number(p.quantity) || 1;
          existing.totalRevenue += Number(p.subtotal) || (Number(p.price) * Number(p.quantity)) || 0;
          existing.ordersCount += 1;
          productSalesMap.set(key, existing);
        });
      } else if (Array.isArray(o.items)) {
        o.items.forEach(itemStr => {
          const str = String(itemStr);
          const priceMatch = str.match(/(?:—|\-|\()\s*\$?\s*([\d\.\,]+)\s*\)?$/);
          const lineTotal = priceMatch ? parseInt(priceMatch[1].replace(/\D/g, ''), 10) : 0;
          const cleanName = str.replace(/^[•\-\*\s]+/, '').replace(/—.*$/, '').replace(/\(.*?\)/, '').trim();

          const key = cleanName.toLowerCase();
          const existing = productSalesMap.get(key) || {
            id: key,
            plu: '',
            name: cleanName,
            category: 'Parrilla y Vacuno',
            unit: 'kg',
            unitsSold: 0,
            totalRevenue: 0,
            ordersCount: 0
          };
          existing.unitsSold += 1;
          existing.totalRevenue += lineTotal || 0;
          existing.ordersCount += 1;
          productSalesMap.set(key, existing);
        });
      }
    });

    const productStats = Array.from(productSalesMap.values()).map(p => ({
      ...p,
      percentageOfTotal: totalSalesAmount > 0 ? Math.round((p.totalRevenue / totalSalesAmount) * 100) : 0
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // 4. Estadísticas por Canal de Venta
    const channelCounts = {
      whatsapp: { label: '💬 WhatsApp Chatbot (IA)', count: 0, revenue: 0, color: '#25D366' },
      pos: { label: '🏪 POS Mostrador / Caja', count: 0, revenue: 0, color: '#10B981' },
      web: { label: '🌐 Tienda Web / Online', count: 0, revenue: 0, color: '#3B82F6' }
    };

    filteredOrders.forEach(o => {
      const ch = o.channel || (o.notes?.includes('[POS Mostrador]') ? 'pos' : (o.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
      const amt = Number(o.totalAmount) || 0;
      if (channelCounts[ch]) {
        channelCounts[ch].count += 1;
        channelCounts[ch].revenue += amt;
      } else {
        channelCounts.whatsapp.count += 1;
        channelCounts.whatsapp.revenue += amt;
      }
    });

    const channelStats = Object.keys(channelCounts).map(k => ({
      channel: k,
      label: channelCounts[k].label,
      ordersCount: channelCounts[k].count,
      totalRevenue: channelCounts[k].revenue,
      percentage: totalSalesAmount > 0 ? Math.round((channelCounts[k].revenue / totalSalesAmount) * 100) : 0,
      color: channelCounts[k].color
    }));

    // 5. Estadísticas por Método de Pago
    const paymentMap = new Map();
    filteredOrders.forEach(o => {
      const rawMethod = o.paymentMethod || 'Efectivo';
      let normalizedMethod = 'Efectivo';
      if (rawMethod.toLowerCase().includes('mercado pago')) normalizedMethod = 'Mercado Pago (Link / QR)';
      else if (rawMethod.toLowerCase().includes('transfer')) normalizedMethod = 'Transferencia Bancaria';
      else if (rawMethod.toLowerCase().includes('tarjeta') || rawMethod.toLowerCase().includes('debito') || rawMethod.toLowerCase().includes('credito')) normalizedMethod = 'Tarjeta Débito / Crédito';

      const entry = paymentMap.get(normalizedMethod) || { method: normalizedMethod, ordersCount: 0, totalRevenue: 0 };
      entry.ordersCount += 1;
      entry.totalRevenue += Number(o.totalAmount) || 0;
      paymentMap.set(normalizedMethod, entry);
    });

    const paymentStats = Array.from(paymentMap.values()).map(p => ({
      ...p,
      percentage: totalSalesAmount > 0 ? Math.round((p.totalRevenue / totalSalesAmount) * 100) : 0
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // 6. Línea Temporal Diaria (Últimos 14 días o rango seleccionado)
    const timelineMap = new Map();
    filteredOrders.forEach(o => {
      const dateKey = new Date(o.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const entry = timelineMap.get(dateKey) || { date: dateKey, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += Number(o.totalAmount) || 0;
      timelineMap.set(dateKey, entry);
    });

    const timeline = Array.from(timelineMap.values()).reverse();

    return {
      totalSalesAmount,
      totalOrdersCount,
      averageTicket,
      paidAmount,
      pendingAmount,
      branchStats,
      productStats,
      channelStats,
      paymentStats,
      timeline,
      filtersApplied: {
        fromDate: fromDate || null,
        toDate: toDate || null,
        branchId: branchId || 'all',
        channel: channel || 'all',
        paymentMethod: paymentMethod || 'all',
        status: status || 'all'
      }
    };
  }

  /**
   * Obtiene la lista detallada y filtrable de todas las ventas para tabla y exportación
   */
  getSalesList(filters = {}) {
    const db = this.readDb();
    const orders = db.orders || [];
    const {
      fromDate,
      toDate,
      branchId,
      channel,
      paymentMethod,
      status,
      search,
      limit = 200
    } = filters;

    let filtered = orders.filter(o => {
      if (status && status !== 'all' && o.status !== status) return false;
      if (fromDate && new Date(o.createdAt) < new Date(fromDate)) return false;
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt) > end) return false;
      }

      if (branchId && branchId !== 'all') {
        const orderBranchId = o.branchId || o.branch;
        if (orderBranchId !== branchId && o.branchName !== branchId) return false;
      }

      const orderChannel = o.channel || (o.notes?.includes('[POS Mostrador]') ? 'pos' : (o.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
      if (channel && channel !== 'all' && orderChannel !== channel) return false;

      if (paymentMethod && paymentMethod !== 'all') {
        const pm = (o.paymentMethod || '').toLowerCase();
        if (!pm.includes(paymentMethod.toLowerCase())) return false;
      }

      if (search && search.trim()) {
        const q = search.toLowerCase().trim();
        const matchId = String(o.id).toLowerCase().includes(q);
        const matchCustomer = String(o.customerName || '').toLowerCase().includes(q);
        const matchPhone = String(o.phone || '').toLowerCase().includes(q);
        const matchAddress = String(o.address || '').toLowerCase().includes(q);
        const matchBranch = String(o.branchName || '').toLowerCase().includes(q);
        if (!matchId && !matchCustomer && !matchPhone && !matchAddress && !matchBranch) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  }

  // --- Orders System ---
  getOrders() {
    const db = this.readDb();
    return (db.orders || []).map(o => {
      let ch = o.channel || o.source;
      if (!ch) {
        if (o.notes?.includes('[POS') || o.origin === 'pos' || o.origin === 'POS') ch = 'POS';
        else if (o.origin === 'tienda_web' || o.origin === 'tienda' || o.origin === 'TIENDA' || o.notes?.includes('[WooCommerce]')) ch = 'TIENDA';
        else ch = 'WHATSAPP';
      }
      return { ...o, channel: ch, source: ch, origin: ch };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getOrder(id) {
    const db = this.readDb();
    if (!id) return null;
    const cleanId = String(id).replace(/^#/, '').toLowerCase().trim();
    const order = (db.orders || []).find(o => 
      String(o.id).toLowerCase() === cleanId || 
      String(o.id).replace(/\D/g, '') === cleanId.replace(/\D/g, '')
    );
    if (!order) return null;
    let ch = order.channel || order.source;
    if (!ch) {
      if (order.notes?.includes('[POS') || order.origin === 'pos' || order.origin === 'POS') ch = 'POS';
      else if (order.origin === 'tienda_web' || order.origin === 'tienda' || order.origin === 'TIENDA') ch = 'TIENDA';
      else ch = 'WHATSAPP';
    }
    return { ...order, channel: ch, source: ch, origin: ch };
  }

  getOrdersByQuery(query) {
    const db = this.readDb();
    const q = String(query || '').replace(/^#/, '').toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    if (!q) return [];

    return (db.orders || []).filter(o => {
      const ordId = String(o.id).toLowerCase();
      const ordDigits = ordId.replace(/\D/g, '');
      const ordPhone = String(o.phone || o.customerPhone || '').replace(/\D/g, '');
      
      // Match por código de orden exacto o parcial
      if (ordId === q || ordId === `ord-${q}` || (qDigits.length >= 3 && ordDigits === qDigits)) return true;
      // Match por teléfono
      if (qDigits.length >= 6 && (ordPhone.includes(qDigits) || qDigits.includes(ordPhone))) return true;
      return false;
    }).map(o => {
      let ch = o.channel || o.source;
      if (!ch) {
        if (o.notes?.includes('[POS') || o.origin === 'pos' || o.origin === 'POS') ch = 'POS';
        else if (o.origin === 'tienda_web' || o.origin === 'tienda' || o.origin === 'TIENDA') ch = 'TIENDA';
        else ch = 'WHATSAPP';
      }
      return { ...o, channel: ch, source: ch, origin: ch };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getLatestOrderByJid(jidOrLead) {
    const db = this.readDb();
    if (!jidOrLead) return null;
    const cleanJid = typeof jidOrLead === 'object' ? (jidOrLead.jid || jidOrLead.id || '') : String(jidOrLead).trim();
    const lead = typeof jidOrLead === 'object' ? jidOrLead : this.getLead(cleanJid);
    const core = extractCoreDigits(cleanJid || lead?.phone || lead?.jid);
    const altJids = lead?.altJids || [];

    const orders = (db.orders || []).filter(o => {
      if (o.jid === cleanJid || (lead && (o.jid === lead.jid || altJids.includes(o.jid) || o.jid === lead.id))) return true;
      if (core && core.length >= 7) {
        const orderCore = extractCoreDigits(o.phone || o.jid);
        if (orderCore && orderCore === core) return true;
      }
      return false;
    });
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  }

  getOrdersByJid(jidOrLead) {
    const db = this.readDb();
    if (!jidOrLead) return [];
    const cleanJid = typeof jidOrLead === 'object' ? (jidOrLead.jid || jidOrLead.id || '') : String(jidOrLead).trim();
    const lead = typeof jidOrLead === 'object' ? jidOrLead : this.getLead(cleanJid);
    const core = extractCoreDigits(cleanJid || lead?.phone || lead?.jid);
    const altJids = lead?.altJids || [];

    return (db.orders || []).filter(o => {
      if (o.jid === cleanJid || (lead && (o.jid === lead.jid || altJids.includes(o.jid) || o.jid === lead.id))) return true;
      if (core && core.length >= 7) {
        const orderCore = extractCoreDigits(o.phone || o.jid);
        if (orderCore && orderCore === core) return true;
      }
      return false;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getActiveOrdersByJid(jidOrLead) {
    const db = this.readDb();
    if (!jidOrLead) return [];
    const cleanJid = typeof jidOrLead === 'object' ? (jidOrLead.jid || jidOrLead.id || '') : String(jidOrLead).trim();
    const lead = typeof jidOrLead === 'object' ? jidOrLead : this.getLead(cleanJid);
    const core = extractCoreDigits(cleanJid || lead?.phone || lead?.jid);
    const altJids = lead?.altJids || [];
    const activeStatuses = ['pending', 'preparing', 'ready', 'ready_for_pickup', 'in_transit'];

    return (db.orders || []).filter(o => {
      if (!activeStatuses.includes(o.status)) return false;
      if (o.jid === cleanJid || (lead && (o.jid === lead.jid || altJids.includes(o.jid) || o.jid === lead.id))) return true;
      if (core && core.length >= 7) {
        const orderCore = extractCoreDigits(o.phone || o.jid);
        if (orderCore && orderCore === core) return true;
      }
      return false;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  updateOrder(id, updateData) {
    const db = this.readDb();
    const order = (db.orders || []).find(o => o.id === id);
    if (!order) return null;

    // Si el pedido se cancela y ya se había descontado stock, reponer el stock de los productos correspondientes
    if (updateData.status === 'cancelled' && order.stockDeducted && !order.stockRestored) {
      const orderProducts = Array.isArray(order.products) ? order.products : [];
      orderProducts.forEach(p => {
        const catalogProd = (db.products || []).find(cp => cp.id === p.id || cp.plu === p.plu || cp.name.toLowerCase() === (p.name || '').toLowerCase());
        if (catalogProd && catalogProd.stockControl) {
          const qty = Number(p.quantity) || 1;
          const currentStock = Number(catalogProd.stockQuantity ?? catalogProd.stock ?? 0);
          catalogProd.stockQuantity = Number((currentStock + qty).toFixed(2));
          catalogProd.stock = catalogProd.stockQuantity;
          if (catalogProd.stockQuantity > 0) {
            catalogProd.isAvailable = true;
          }
          catalogProd.updatedAt = new Date().toISOString();
        }
      });
      order.stockRestored = true;
    }

    // Si updateData trae items, pero no trae products estructurados, regenerar products a partir de items
    if (updateData.items && (!updateData.products || !Array.isArray(updateData.products) || updateData.products.length === 0)) {
      const allProducts = db.products || DatabaseService.MASTER_PRODUCTS_SEED;
      const rawItems = Array.isArray(updateData.items) ? updateData.items : (typeof updateData.items === 'string' ? updateData.items.split('\n').filter(Boolean) : []);
      const parsedProducts = [];

      rawItems.forEach((itemStr, idx) => {
        const str = String(itemStr).replace(/^[•\-\*\s]+/, '').trim();
        const priceMatch = str.match(/(?:—|\-|\()\s*\$?\s*([\d\.\,]+)\s*\)?$/);
        const subtotal = priceMatch ? parseInt(priceMatch[1].replace(/\D/g, ''), 10) : 0;
        
        const qtyMatch = str.match(/^([0-9.,]+)\s*(?:x\s*)?(kg|kilos?|combo|un|unidades?|botellas?|bolsas?|piezas?)?\s+(.+?)(?:\s*—|\s*\(|\s*\$|$)/i);
        const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;
        const rawUnit = qtyMatch ? (qtyMatch[2] || 'kg').toLowerCase() : 'kg';
        const rawNamePart = qtyMatch ? qtyMatch[3].trim() : str.split('—')[0].trim();
        const namePart = rawNamePart.replace(/^de\s+/i, '').trim();

        const matched = allProducts.find(p => 
          p.name.toLowerCase() === namePart.toLowerCase() ||
          namePart.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(namePart.toLowerCase())
        );

        const unitPrice = matched ? Number(matched.price) : (qty > 0 && subtotal > 0 ? Math.round(subtotal / qty) : 0);
        const isUnit = /un|unidades?|botellas?|bolsas?|combo/i.test(rawUnit) || (matched && matched.unit !== 'kg');
        const unitsPerKg = matched?.unitsPerKg || 8;
        const finalQty = (isUnit && matched?.unit === 'kg') ? Number((qty / unitsPerKg).toFixed(3)) : qty;

        parsedProducts.push({
          id: matched?.id || `prod-${idx}`,
          plu: matched?.plu || '',
          barcode: matched?.barcode || '',
          name: matched?.name || namePart,
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: finalQty,
          unit: matched?.unit || rawUnit,
          isUnitMode: isUnit,
          unitCount: isUnit ? qty : 0,
          subtotal: subtotal || Math.round(unitPrice * finalQty)
        });
      });

      if (parsedProducts.length > 0) {
        updateData.products = parsedProducts;
      }
    }

    // Auto-finalizado y archivado cuando un pedido está entregado y pagado (salvo desarchivo explícito)
    const nextStatus = updateData.status || order.status;
    const nextPaymentStatus = updateData.paymentStatus || order.paymentStatus;
    const isExplicitUnarchive = updateData.isArchived === false;
    if (!isExplicitUnarchive && (nextStatus === 'delivered' || nextStatus === 'completed') && nextPaymentStatus === 'paid') {
      updateData.isArchived = true;
      updateData.status = 'completed';
      updateData.completedAt = updateData.completedAt || order.completedAt || new Date().toISOString();
      updateData.archivedAt = updateData.archivedAt || order.archivedAt || new Date().toISOString();
    }

    Object.assign(order, updateData, { updatedAt: new Date().toISOString() });
    if (updateData.totalAmount !== undefined) order.totalAmount = Number(updateData.totalAmount) || 0;
    this.writeDb(db);

    if (this.io) {
      this.io.emit('order:update', order);
      this.io.emit('orders:sync', this.getOrders());
    }
    return order;
  }

  updateOrderStatus(id, status, meta = {}) {
    const updateData = { status, ...meta };
    const db = this.readDb();
    const currentOrder = (db.orders || []).find(o => o.id === id);

    if (status === 'ready' || status === 'ready_for_pickup') {
      updateData.isPrepared = true;
      if (!updateData.preparedAt) {
        updateData.preparedAt = new Date().toISOString();
      }
      updateData.readyAt = new Date().toISOString();
    } else if (status === 'delivered') {
      updateData.deliveredAt = new Date().toISOString();
      // Si el pedido ya fue pagado o se indica autoArchive, marcar como finalizado / archivado
      const isPaid = (currentOrder?.paymentStatus === 'paid') || (meta.paymentStatus === 'paid') || (updateData.paymentStatus === 'paid');
      if (isPaid || meta.autoArchive) {
        updateData.isArchived = true;
        updateData.status = 'completed';
        updateData.completedAt = new Date().toISOString();
        updateData.archivedAt = new Date().toISOString();
      }
    } else if (status === 'completed' || status === 'archived') {
      updateData.isArchived = true;
      updateData.status = 'completed';
      updateData.completedAt = updateData.completedAt || new Date().toISOString();
      updateData.archivedAt = updateData.archivedAt || new Date().toISOString();
    } else if (status === 'in_transit') {
      updateData.inTransitAt = new Date().toISOString();
    }
    return this.updateOrder(id, updateData);
  }

  archiveOrder(id, isArchived = true) {
    const shouldArchive = Boolean(isArchived);
    const updateData = {
      isArchived: shouldArchive,
      archivedAt: shouldArchive ? new Date().toISOString() : null
    };
    if (shouldArchive) {
      updateData.status = 'completed';
      updateData.completedAt = new Date().toISOString();
    } else {
      updateData.status = 'delivered';
    }
    return this.updateOrder(id, updateData);
  }

  setOrderPrepared(id, isPrepared = true, preparedBy = null) {
    const isPrep = Boolean(isPrepared);
    const updateData = {
      isPrepared: isPrep,
      preparedAt: isPrep ? new Date().toISOString() : null,
      preparedBy: isPrep ? (preparedBy || 'Equipo Carnicería') : null
    };
    return this.updateOrder(id, updateData);
  }

  deleteOrder(id) {
    const db = this.readDb();
    db.orders = (db.orders || []).filter(o => o.id !== id);
    this.writeDb(db);

    if (this.io) {
      this.io.emit('order:delete', id);
      this.io.emit('orders:sync', this.getOrders());
    }
    return true;
  }

  addOrder(orderData) {
    return this.createOrder(orderData);
  }

  saveOrder(orderData) {
    return this.createOrder(orderData);
  }

  createOrder(orderData) {
    const db = this.readDb();
    if (!db.orders) db.orders = [];

    // Resolver sucursal y normalizar
    let branchName = orderData.branch || orderData.branchName || '';
    let branchId = orderData.branchId || '';

    if (!branchName) {
      if (orderData.deliveryType === 'pickup') {
        branchName = 'URCA 2 – ALTO TEJEDA';
        branchId = 'branch_urca_2';
      } else {
        branchName = 'URCA CENTRAL';
        branchId = 'branch_urca_1';
      }
    }

    // Resolver canal de origen
    let channel = 'WHATSAPP';
    if (orderData.channel) {
      channel = String(orderData.channel).toUpperCase();
    } else if (orderData.source) {
      channel = String(orderData.source).toUpperCase();
    } else if (orderData.origin === 'tienda_web' || orderData.origin === 'tienda' || orderData.origin === 'TIENDA' || orderData.origin === 'store') {
      channel = 'TIENDA';
    } else if (orderData.origin === 'pos' || orderData.origin === 'POS' || orderData.notes?.includes('[POS Mostrador]')) {
      channel = 'POS';
    } else if (orderData.notes?.includes('[WooCommerce]')) {
      channel = 'TIENDA';
    }

    // Normalizar items y productos estructurados con PLU
    const allProducts = db.products || DatabaseService.MASTER_PRODUCTS_SEED;
    const items = Array.isArray(orderData.items) ? orderData.items : (typeof orderData.items === 'string' ? orderData.items.split('\n').filter(Boolean) : []);
    let products = Array.isArray(orderData.products) && orderData.products.length > 0 ? [...orderData.products] : [];

    if (products.length === 0 && items.length > 0) {
      // Extraer y casar productos desde los textos de items con cantidades y precios reales
      items.forEach((itemStr, idx) => {
        const str = String(itemStr).replace(/^[•\-\*\s]+/, '').trim();
        
        // Detectar subtotal de la línea: "— $39.999", "($39.999)", "$39.999"
        const priceMatch = str.match(/(?:—|\-|\()\s*\$?\s*([\d\.\,]+)\s*\)?$/);
        const subtotal = priceMatch ? parseInt(priceMatch[1].replace(/\D/g, ''), 10) : 0;
        
        // Detectar cantidad al inicio: "2 kg", "1 combo", "6 unidades", "1x"
        const qtyMatch = str.match(/^([0-9.,]+)\s*(?:x\s*)?(kg|kilos?|combo|un|unidades?|botellas?|bolsas?|piezas?)?\s+(.+?)(?:\s*—|\s*\(|\s*\$|$)/i);
        const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;
        const rawUnit = qtyMatch ? (qtyMatch[2] || 'kg').toLowerCase() : 'kg';
        const rawNamePart = qtyMatch ? qtyMatch[3].trim() : str.split('—')[0].trim();
        const namePart = rawNamePart.replace(/^de\s+/i, '').trim();

        const lower = namePart.toLowerCase();
        const matchedProd = allProducts.find(p => 
          lower.includes(p.name.toLowerCase()) || 
          p.name.toLowerCase().includes(lower) || 
          (p.plu && lower.includes(p.plu.toLowerCase()))
        );
        
        const unitPrice = matchedProd ? Number(matchedProd.price) : (subtotal > 0 && qty > 0 ? Math.round(subtotal / qty) : subtotal);
        const isUnit = /un|unidades?|botellas?|bolsas?|combo/i.test(rawUnit) || (matchedProd && matchedProd.unit !== 'kg');
        const unitsPerKg = matchedProd?.unitsPerKg || 8;
        const finalQty = (isUnit && matchedProd?.unit === 'kg') ? Number((qty / unitsPerKg).toFixed(3)) : qty;
        const lineTotal = subtotal > 0 ? subtotal : Math.round(unitPrice * finalQty);

        products.push({
          id: matchedProd?.id || `prod-${idx}`,
          plu: matchedProd?.plu || '',
          barcode: matchedProd?.barcode || '',
          name: matchedProd?.name || namePart,
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: finalQty,
          unit: matchedProd?.unit || rawUnit,
          isUnitMode: isUnit,
          unitCount: isUnit ? qty : 0,
          subtotal: lineTotal
        });
      });
    } else if (products.length > 0) {
      products = products.map((p, idx) => {
        const qty = Number(p.quantity) || 1;
        const unitPrice = Number(p.unitPrice || p.price || 0);
        const subtotal = Number(p.subtotal) || Math.round(unitPrice * qty);
        return {
          id: p.id || `prod-${idx}`,
          plu: p.plu || '',
          barcode: p.barcode || '',
          name: p.name || 'Producto',
          price: unitPrice,
          unitPrice: unitPrice,
          quantity: qty,
          unit: p.unit || 'kg',
          isUnitMode: Boolean(p.isUnitMode),
          unitCount: p.unitCount !== undefined ? Number(p.unitCount) : (p.isUnitMode ? Math.round(qty * 8) : 0),
          subtotal: subtotal
        };
      });
    }

    // Calcular suma exacta de productos
    const calculatedTotal = products.reduce((acc, p) => acc + (Number(p.subtotal) || (Number(p.price) * Number(p.quantity)) || 0), 0);
    const finalTotalAmount = Number(orderData.totalAmount) || calculatedTotal || 0;

    // Calcular estimación de franja horaria y costo de envío según la regla de corte de las 12hs
    const deliveryCalc = this.calculateDeliverySlotAndCost({
      orderDate: orderData.createdAt ? new Date(orderData.createdAt) : new Date(),
      deliveryType: orderData.deliveryType || 'delivery',
      subtotal: finalTotalAmount,
      isExpress: Boolean(orderData.isExpress || orderData.deliveryOption === 'express'),
      requestedSlotId: orderData.deliverySlotId || orderData.deliverySlot
    });

    const newOrder = {
      id: orderData.id || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      jid: orderData.jid || '',
      phone: orderData.phone || (orderData.jid ? orderData.jid.split('@')[0] : ''),
      customerName: orderData.customerName || 'Cliente',
      address: orderData.address || '',
      branch: branchName,
      branchName: branchName,
      branchId: branchId,
      deliveryType: orderData.deliveryType || 'delivery',
      deliverySlot: orderData.deliverySlot || deliveryCalc.suggestedSlotId,
      deliverySlotName: orderData.deliverySlotName || deliveryCalc.suggestedSlotName,
      estimatedDelivery: orderData.estimatedDelivery || deliveryCalc.estimatedDeliveryLabel,
      shippingCost: orderData.shippingCost !== undefined ? Number(orderData.shippingCost) : deliveryCalc.shippingCost,
      isFreeShipping: orderData.isFreeShipping !== undefined ? Boolean(orderData.isFreeShipping) : deliveryCalc.isFreeShipping,
      isExpress: Boolean(orderData.isExpress || deliveryCalc.isExpress),
      items: items,
      products: products,
      totalAmount: finalTotalAmount,
      paymentMethod: orderData.paymentMethod || 'Efectivo / Transferencia',
      paymentLink: orderData.paymentLink || null,
      status: orderData.status || 'pending', // 'pending' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'cancelled'
      isPrepared: Boolean(orderData.isPrepared) || (orderData.status === 'ready' || orderData.status === 'ready_for_pickup'),
      preparedAt: orderData.preparedAt || (orderData.isPrepared || orderData.status === 'ready' ? new Date().toISOString() : null),
      preparedBy: orderData.preparedBy || null,
      channel: channel,
      source: channel,
      origin: channel,
      notes: orderData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...orderData,
      channel: channel,
      source: channel,
      origin: channel,
      branch: branchName,
      branchName: branchName,
      branchId: branchId,
      products: products,
      totalAmount: finalTotalAmount,
      deliverySlot: orderData.deliverySlot || deliveryCalc.suggestedSlotId,
      deliverySlotName: orderData.deliverySlotName || deliveryCalc.suggestedSlotName,
      estimatedDelivery: orderData.estimatedDelivery || deliveryCalc.estimatedDeliveryLabel
    };

    db.orders.unshift(newOrder);

    // Descuento automático de stock si el producto tiene control de stock activo
    if (Array.isArray(products) && products.length > 0) {
      products.forEach(p => {
        const catalogProd = (db.products || []).find(cp => cp.id === p.id || cp.plu === p.plu || cp.name.toLowerCase() === (p.name || '').toLowerCase());
        if (catalogProd && catalogProd.stockControl) {
          const qty = Number(p.quantity) || 1;
          const currentStock = Number(catalogProd.stockQuantity ?? catalogProd.stock ?? 100);
          catalogProd.stockQuantity = Math.max(0, Number((currentStock - qty).toFixed(2)));
          catalogProd.stock = catalogProd.stockQuantity;
          if (catalogProd.stockQuantity === 0 && !catalogProd.allowBackorder) {
            catalogProd.isAvailable = false;
          }
          catalogProd.updatedAt = new Date().toISOString();
          newOrder.stockDeducted = true;
        }
      });
    }

    // Actualizar Memoria y Estadísticas del Cliente en la Base de Datos de Leads
    const targetJid = newOrder.jid;
    const lead = (db.leads || []).find(l => l.jid === targetJid || (l.phone && newOrder.phone && l.phone.includes(newOrder.phone)));
    if (lead) {
      lead.name = newOrder.customerName || lead.name;
      lead.pushName = newOrder.customerName || lead.pushName;
      lead.address = newOrder.address || lead.address;
      lead.totalOrders = (lead.totalOrders || 0) + 1;
      lead.totalSpent = (lead.totalSpent || 0) + newOrder.totalAmount;
      lead.lastOrderAt = newOrder.createdAt;
      lead.lastOrderId = newOrder.id;

      // Preferencias gastronómicas del cliente
      if (!lead.preferences) {
        lead.preferences = {
          favoriteCuts: [],
          cookingPreference: 'Parrilla',
          preferredPayment: newOrder.paymentMethod,
          groupSize: '4 personas',
          notes: ''
        };
      }

      // Agregar cortes de la orden a favoritos si no están
      if (Array.isArray(newOrder.items)) {
        newOrder.items.forEach(item => {
          const itemStr = typeof item === 'string' ? item : (item?.name || '');
          const cutName = itemStr.replace(/^[•\d\sx]+/, '').split('—')[0].split('(')[0].trim();
          if (cutName && !lead.preferences.favoriteCuts.includes(cutName)) {
            lead.preferences.favoriteCuts.push(cutName);
          }
        });
      }

      // Etiquetas automáticas por fidelidad
      if (!lead.tags) lead.tags = [];
      if (!lead.tags.includes('Cliente Comprador')) lead.tags.push('Cliente Comprador');
      if (lead.totalSpent >= 50000 && !lead.tags.includes('Cliente VIP')) lead.tags.push('Cliente VIP');
      if (lead.totalOrders >= 3 && !lead.tags.includes('Frecuente')) lead.tags.push('Frecuente');

      lead.updatedAt = new Date().toISOString();
    }

    this.writeDb(db);

    if (this.io) {
      this.io.emit('order:new', newOrder);
      this.io.emit('orders:sync', this.getOrders());
    }

    return newOrder;
  }

  getCustomerProfile(jidOrId) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (!lead) return null;

    const orders = (db.orders || []).filter(o => o.jid === lead.jid || (o.phone && lead.phone && lead.phone.includes(o.phone)));
    const totalSpent = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    return {
      ...lead,
      orders,
      totalOrders: orders.length,
      totalSpent,
      averageTicket: orders.length > 0 ? Math.round(totalSpent / orders.length) : 0,
      lastOrder: orders[0] || null,
      preferences: lead.preferences || {
        favoriteCuts: [],
        cookingPreference: 'Parrilla',
        preferredPayment: 'Efectivo / Transferencia',
        groupSize: '4 personas',
        notes: ''
      }
    };
  }

  updateCustomerProfile(jidOrId, updates) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (!lead) return null;

    if (updates.preferences) {
      lead.preferences = { ...(lead.preferences || {}), ...updates.preferences };
    }
    Object.assign(lead, updates);
    lead.updatedAt = new Date().toISOString();
    this.writeDb(db);
    return this.getCustomerProfile(lead.id);
  }

  // --- Dynamic Neural Learning & Insights ---
  getLearnedInsights() {
    const db = this.readDb();
    return (db.learnedInsights || []).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  saveLearnedInsight(insight) {
    const db = this.readDb();
    if (!db.learnedInsights) db.learnedInsights = [];

    const existingIdx = db.learnedInsights.findIndex(i => i.id === insight.id || (i.mistakeType === insight.mistakeType && i.clientFeedback === insight.clientFeedback));
    const entry = {
      id: insight.id || `insight-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      appliedCount: 1,
      ...insight,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      entry.appliedCount = (db.learnedInsights[existingIdx].appliedCount || 1) + 1;
      db.learnedInsights[existingIdx] = { ...db.learnedInsights[existingIdx], ...entry };
    } else {
      db.learnedInsights.unshift(entry);
    }

    // Mantener un máximo de 100 aprendizajes más relevantes
    if (db.learnedInsights.length > 100) {
      db.learnedInsights = db.learnedInsights.slice(0, 100);
    }

    this.writeDb(db);
    return entry;
  }

  deleteLearnedInsight(id) {
    const db = this.readDb();
    if (!db.learnedInsights) return;
    db.learnedInsights = db.learnedInsights.filter(i => i.id !== id);
    this.writeDb(db);
  }

  updateLeadLearnedMemory(jidOrId, learnedData) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === jidOrId || l.jid === jidOrId);
    if (!lead) return null;

    if (!lead.preferences) {
      lead.preferences = {
        favoriteCuts: [],
        cookingPreference: 'Parrilla',
        preferredPayment: 'Efectivo / Transferencia',
        groupSize: '4 personas',
        notes: ''
      };
    }

    if (learnedData.favoriteCut && !lead.preferences.favoriteCuts.includes(learnedData.favoriteCut)) {
      lead.preferences.favoriteCuts.push(learnedData.favoriteCut);
    }
    if (learnedData.groupSize) {
      lead.preferences.groupSize = learnedData.groupSize;
    }
    if (learnedData.cookingPreference) {
      lead.preferences.cookingPreference = learnedData.cookingPreference;
    }
    if (learnedData.budget) {
      lead.preferences.budget = learnedData.budget;
    }
    if (learnedData.address) {
      lead.address = learnedData.address;
    }
    if (learnedData.preferredBranch) {
      lead.preferredBranch = learnedData.preferredBranch;
    }

    if (!lead.learnedNotes) lead.learnedNotes = [];
    if (learnedData.newNote && !lead.learnedNotes.includes(learnedData.newNote)) {
      lead.learnedNotes.push(learnedData.newNote);
    }

    lead.updatedAt = new Date().toISOString();
    this.writeDb(db);
    return lead;
  }

  duplicateOrder(id) {
    const db = this.readDb();
    const source = (db.orders || []).find(o => o.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.orders) db.orders = [];
    db.orders.unshift(cloned);
    this.writeDb(db);
    return cloned;
  }

  duplicateCustomer(id) {
    const db = this.readDb();
    const source = (db.leads || []).find(l => l.id === id || l.jid === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `lead-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: `${source.name || 'Cliente'} (Copia)`,
      pushName: `${source.pushName || 'Cliente'} (Copia)`,
      jid: `copy_${Date.now()}@s.whatsapp.net`,
      altJids: [],
      totalOrders: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.leads) db.leads = [];
    db.leads.unshift(cloned);
    this.writeDb(db);
    return this.getCustomerProfile(cloned.id);
  }

  duplicateProduct(id) {
    const db = this.readDb();
    const source = (db.products || []).find(p => p.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: `${source.name} (Copia)`,
      updatedAt: new Date().toISOString()
    };

    if (!db.products) db.products = [];
    db.products.push(cloned);
    this.writeDb(db);
    return cloned;
  }

  duplicateKnowledgeItem(id) {
    const db = this.readDb();
    const source = (db.knowledgeBase || []).find(k => k.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `kb-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: `${source.title} (Copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.knowledgeBase) db.knowledgeBase = [];
    db.knowledgeBase.push(cloned);
    this.writeDb(db);
  }

  // =========================================================================
  // GESTIÓN DE SUCURSALES (BRANCHES)
  // =========================================================================
  getBranches() {
    const db = this.readDb();
    if (!db.branches || db.branches.length === 0 || db.branches.length < 6) {
      db.branches = [
        {
          id: "br-1",
          name: "URCA CENTRAL",
          address: "Av. José Roque Funes 1115, Barrio Urca, Córdoba",
          phone: "+54 9 3513 906947",
          phoneNormalized: "+5493513906947",
          managerName: "Encargado Urca Central",
          encargadoId: null,
          email: "urca1@republicadelacarne.com",
          hours: "Lunes a sábado: 9:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs",
          coverageZones: ["Urca", "Cerro de las Rosas", "Tablada Park"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-2",
          name: "URCA 2 – ALTO TEJEDA",
          address: "Av. Menéndez Pidal 3575, Urca, Córdoba",
          phone: "+54 9 3518 623195",
          phoneNormalized: "+5493518623195",
          managerName: "Encargado Alto Tejeda",
          encargadoId: null,
          email: "urca2@republicadelacarne.com",
          hours: "Lunes a sábado: 9:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs",
          coverageZones: ["Alto Tejeda", "Urca", "Chateau Carreras"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-3",
          name: "INTERCOUNTRY – CORTEZA MALL / ALTO TEJEDA",
          address: "Av. Los Álamos 1015, Corteza Mall, Córdoba",
          phone: "+54 9 3518 623194",
          phoneNormalized: "+5493518623194",
          managerName: "Encargado Intercountry",
          encargadoId: null,
          email: "intercountry@republicadelacarne.com",
          hours: "Lunes a domingos: 9:00 a 21:00 hs",
          coverageZones: ["Intercountry", "Corteza Mall", "Countries Zona Norte"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-4",
          name: "DUARTE QUIRÓS",
          address: "Av. Duarte Quirós 5130, Córdoba",
          phone: "+54 9 3518 156595",
          phoneNormalized: "+5493518156595",
          managerName: "Encargado Duarte Quirós",
          encargadoId: null,
          email: "duartequiros@republicadelacarne.com",
          hours: "Lunes a sábado: 9:00 a 13:30 hs y 17:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs",
          coverageZones: ["Duarte Quirós", "Las Palmas", "Teodoro Fels", "San Salvador"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-5",
          name: "VILLA ALLENDE – MERCADITO DE LA VILLA",
          address: "Av. Figueroa Alcorta 480, Villa Allende, Córdoba",
          phone: "+54 9 3513 540031",
          phoneNormalized: "+5493513540031",
          managerName: "Encargado Villa Allende",
          encargadoId: null,
          email: "villaallende@republicadelacarne.com",
          hours: "Lunes a sábado: 9:00 a 13:30 hs y 17:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs",
          coverageZones: ["Villa Allende", "Mendiolaza", "Saldán"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-6",
          name: "COUNTRY SAN ISIDRO – ALTO TEJEDA (Nueva)",
          address: "Av. Padre Luchesse km 2, San Isidro, Córdoba",
          phone: "+54 9 3518 769099",
          phoneNormalized: "+5493518769099",
          managerName: "Encargado Country San Isidro",
          encargadoId: null,
          email: "sanisidro@republicadelacarne.com",
          hours: "Lun a Mié: 07:00 a 00:00 hs | Jue y Vie: 07:00 a 01:00 hs | Sáb: 08:00 a 01:00 hs | Dom: 08:30 a 00:00 hs",
          coverageZones: ["Country San Isidro", "Villa Allende Golf", "Chacras de la Villa"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        }
      ];
      this.writeDb(db);
    }
    return db.branches;
  }

  getBranch(id) {
    const branches = this.getBranches();
    return branches.find(b => b.id === id) || null;
  }

  getBranchByPhone(rawPhoneOrJid) {
    if (!rawPhoneOrJid) return null;
    const branches = this.getBranches();
    const core = extractCoreDigits(rawPhoneOrJid);
    if (!core) return null;

    return branches.find(b => {
      if (!b.isActive) return false;
      const bCore = extractCoreDigits(b.phone || b.phoneNormalized);
      return bCore && (bCore === core || bCore.endsWith(core) || core.endsWith(bCore));
    }) || null;
  }

  createBranch(data) {
    const db = this.readDb();
    if (!db.branches) db.branches = [];

    const newBranch = {
      id: `br-${Date.now()}`,
      name: data.name || 'Nueva Sucursal',
      address: data.address || '',
      phone: normalizePhoneNumber(data.phone || ''),
      phoneNormalized: (data.phone || '').replace(/\D/g, ''),
      managerName: data.managerName || '',
      encargadoId: data.encargadoId || null,
      email: data.email || '',
      hours: data.hours || 'Lun a Sáb 8:30 a 20:30',
      coverageZones: Array.isArray(data.coverageZones) ? data.coverageZones : (data.coverageZones ? data.coverageZones.split(',').map(z => z.trim()) : []),
      isActive: data.isActive !== false,
      notes: data.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.branches.unshift(newBranch);
    this.writeDb(db);
    return newBranch;
  }

  updateBranch(id, updates) {
    const db = this.readDb();
    if (!db.branches) db.branches = [];
    const idx = db.branches.findIndex(b => b.id === id);
    if (idx === -1) return null;

    const current = db.branches[idx];
    const updated = {
      ...current,
      ...updates,
      phone: updates.phone ? normalizePhoneNumber(updates.phone) : current.phone,
      phoneNormalized: updates.phone ? updates.phone.replace(/\D/g, '') : current.phoneNormalized,
      coverageZones: updates.coverageZones 
        ? (Array.isArray(updates.coverageZones) ? updates.coverageZones : updates.coverageZones.split(',').map(z => z.trim())) 
        : current.coverageZones,
      updatedAt: new Date().toISOString()
    };

    db.branches[idx] = updated;
    this.writeDb(db);
    return updated;
  }

  duplicateBranch(id) {
    const db = this.readDb();
    const source = (db.branches || []).find(b => b.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `br-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: `${source.name} (Copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.branches) db.branches = [];
    db.branches.push(cloned);
    this.writeDb(db);
    return cloned;
  }

  deleteBranch(id) {
    const db = this.readDb();
    db.branches = (db.branches || []).filter(b => b.id !== id);
    this.writeDb(db);
    return true;
  }

  getBranchProfile(id) {
    const branch = this.getBranch(id);
    if (!branch) return null;

    const orders = this.getOrders().filter(o => o.branchId === id);
    const leads = this.getLeads().filter(l => l.preferredBranchId === id);
    const totalSales = orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    // Enrich with encargado user data
    let encargadoUser = null;
    if (branch.encargadoId) {
      const u = this.getUser(branch.encargadoId);
      if (u) encargadoUser = { id: u.id, name: u.name, avatar: u.avatar, email: u.email, phone: u.phone || '' };
    }

    return {
      ...branch,
      encargadoUser,
      orders,
      assignedCustomers: leads,
      metrics: {
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending' || o.status === 'preparing').length,
        inTransitOrders: orders.filter(o => o.status === 'in_transit').length,
        deliveredOrders: orders.filter(o => o.status === 'delivered').length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        totalSales
      }
    };
  }

  deriveOrderToBranch(orderId, branchId, notes = '') {
    const db = this.readDb();
    const order = (db.orders || []).find(o => o.id === orderId);
    const branch = (db.branches || []).find(b => b.id === branchId);
    if (!order || !branch) return null;

    order.branchId = branch.id;
    order.branchName = branch.name;
    order.branchPhone = branch.phone;
    order.branchStatus = 'derived';
    order.branchNotifiedAt = new Date().toISOString();
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n${notes}` : notes;
    }
    order.updatedAt = new Date().toISOString();

    this.writeDb(db);
    return { order, branch };
  }

  // --- Delivery Drivers (Repartidores) System ---
  getDrivers() {
    const db = this.readDb();
    if (!db.drivers || db.drivers.length === 0) {
      db.drivers = [
        {
          id: 'drv-1',
          name: 'Marcos Benítez',
          phone: '+5493512345678',
          vehicle: 'Moto Honda CG 150',
          plate: 'A123BCD',
          branchId: 'suc-cerro',
          userId: 'usr-repartidor',
          status: 'available',
          activeDeliveriesCount: 0,
          totalDeliveredCount: 142,
          cashCollectedBalance: 0,
          rating: 4.9,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'drv-2',
          name: 'Lautaro Gómez',
          phone: '+5493518765432',
          vehicle: 'Moto Yamaha YBR 125',
          plate: 'A987ZYX',
          branchId: 'suc-urca',
          userId: null,
          status: 'available',
          activeDeliveriesCount: 0,
          totalDeliveredCount: 98,
          cashCollectedBalance: 0,
          rating: 4.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      this.writeDb(db);
    }
    return db.drivers;
  }

  getDriver(id) {
    const db = this.readDb();
    return (db.drivers || []).find(d => d.id === id);
  }

  getDriverByPhone(phoneOrJid) {
    if (!phoneOrJid) return null;
    const db = this.readDb();
    const clean = phoneOrJid.replace(/\D/g, '');
    const core = clean.slice(-8);

    return (db.drivers || []).find(d => {
      const dClean = (d.phone || '').replace(/\D/g, '');
      const dCore = dClean.slice(-8);
      return (dClean && clean && (dClean === clean || dClean.includes(clean) || clean.includes(dClean))) ||
             (core.length >= 7 && dCore.length >= 7 && (core === dCore || dClean.includes(core) || clean.includes(dCore)));
    }) || null;
  }

  createDriver(data) {
    const db = this.readDb();
    if (!db.drivers) db.drivers = [];

    const newDriver = {
      id: data.id || `drv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name || 'Repartidor',
      phone: data.phone || '',
      vehicle: data.vehicle || 'Moto',
      plate: data.plate || '',
      branchId: data.branchId || null,
      userId: data.userId || null,
      status: data.status || 'available', // 'available' | 'on_delivery' | 'offline'
      activeDeliveriesCount: 0,
      totalDeliveredCount: 0,
      cashCollectedBalance: 0,
      rating: data.rating || 5.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.drivers.push(newDriver);
    this.writeDb(db);
    return newDriver;
  }

  updateDriver(id, updates) {
    const db = this.readDb();
    if (!db.drivers) db.drivers = [];

    const idx = db.drivers.findIndex(d => d.id === id);
    if (idx === -1) return null;

    const updated = {
      ...db.drivers[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    db.drivers[idx] = updated;
    this.writeDb(db);
    return updated;
  }

  duplicateDriver(id) {
    const db = this.readDb();
    const source = (db.drivers || []).find(d => d.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `drv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: `${source.name} (Copia)`,
      cashCollectedBalance: 0,
      activeDeliveriesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.drivers) db.drivers = [];
    db.drivers.push(cloned);
    this.writeDb(db);
    return cloned;
  }

  deleteDriver(id) {
    const db = this.readDb();
    db.drivers = (db.drivers || []).filter(d => d.id !== id);
    this.writeDb(db);
    return true;
  }

  assignOrderToDriver(orderId, driverId, notes = '') {
    const db = this.readDb();
    const order = (db.orders || []).find(o => o.id === orderId);
    const driver = (db.drivers || []).find(d => d.id === driverId);
    if (!order || !driver) return null;

    order.driverId = driver.id;
    order.driverName = driver.name;
    order.driverPhone = driver.phone;
    order.driverAssignedAt = new Date().toISOString();
    order.driverStatus = 'assigned'; // 'assigned' | 'in_transit' | 'delivered' | 'rejected'
    order.status = 'preparing';
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n[Reparto] ${notes}` : `[Reparto] ${notes}`;
    }
    order.updatedAt = new Date().toISOString();

    // Actualizar contador del repartidor
    driver.activeDeliveriesCount = (driver.activeDeliveriesCount || 0) + 1;
    driver.status = 'on_delivery';
    driver.updatedAt = new Date().toISOString();

    this.writeDb(db);
    return { order, driver };
  }

  updateDriverCashBalance(driverId, amountDelta) {
    const db = this.readDb();
    const driver = (db.drivers || []).find(d => d.id === driverId);
    if (!driver) return null;

    driver.cashCollectedBalance = Math.max(0, (driver.cashCollectedBalance || 0) + (Number(amountDelta) || 0));
    driver.updatedAt = new Date().toISOString();

    this.writeDb(db);
    return driver;
  }

  // --- Barcode & Product Lookup ---
  getProductByBarcode(barcodeOrSku) {
    if (!barcodeOrSku) return null;
    const db = this.readDb();
    const code = barcodeOrSku.trim().toLowerCase();
    return (db.products || []).find(p => 
      (p.barcode && p.barcode.toLowerCase() === code) ||
      (p.sku && p.sku.toLowerCase() === code) ||
      (p.id && p.id.toLowerCase() === code)
    ) || null;
  }

  // --- User Profiles & Role-Based Access Control (RBAC) ---
  getRoles() {
    const db = this.readDb();
    if (!db.roles || db.roles.length === 0 || !db.roles.some(r => r.id === 'agente_ia_principal')) {
      db.roles = [
        {
          id: 'agente_ia_principal',
          name: '🤖 Agente de Venta IA Principal (Central)',
          description: 'Usuario Maestro y Administrador de Central. Agente IA con superpoderes de venta, cotizaciones, mapas y control absoluto.',
          tabs: ['inbox', 'pos', 'orders', 'drivers', 'customers', 'branches', 'catalog', 'kanban', 'callcenter', 'knowledge', 'analytics', 'users', 'settings', 'automations', 'campaigns', 'neural-memory', 'woo'],
          permissions: {
            canEditSettings: true,
            canManageUsers: true,
            canDeleteOrders: true,
            canManageBranches: true,
            canManageDrivers: true,
            canManageProducts: true,
            canViewFinancials: true,
            canToggleAi: true
          }
        },
        {
          id: 'admin',
          name: 'Administrador General',
          description: 'Control total de la plataforma, ajustes de IA, usuarios y finanzas',
          tabs: ['inbox', 'pos', 'orders', 'drivers', 'customers', 'branches', 'catalog', 'kanban', 'callcenter', 'knowledge', 'analytics', 'users', 'settings'],
          permissions: {
            canEditSettings: true,
            canManageUsers: true,
            canDeleteOrders: true,
            canManageBranches: true,
            canManageDrivers: true,
            canManageProducts: true,
            canViewFinancials: true,
            canToggleAi: true
          }
        },
        {
          id: 'cliente',
          name: 'Cliente',
          description: 'Comprador registrado en el sistema. Sin acceso al panel administrativo.',
          tabs: [],
          permissions: {
            canEditSettings: false,
            canManageUsers: false,
            canDeleteOrders: false,
            canManageBranches: false,
            canManageDrivers: false,
            canManageProducts: false,
            canViewFinancials: false,
            canToggleAi: false
          }
        },
        {
          id: 'gerencia',
          name: 'Gerencia & Dirección',
          description: 'Supervisión de métricas, pedidos, clientes, sucursales y reportes',
          tabs: ['analytics', 'orders', 'customers', 'branches', 'drivers', 'pos', 'catalog', 'inbox'],
          permissions: {
            canEditSettings: false,
            canManageUsers: false,
            canDeleteOrders: false,
            canManageBranches: true,
            canManageDrivers: true,
            canManageProducts: true,
            canViewFinancials: true,
            canToggleAi: false
          }
        },
        {
          id: 'encargado',
          name: 'Encargado de Sucursal',
          description: 'Gestión de pedidos de su sede, POS mostrador, clientes y asignación de repartidores',
          tabs: ['pos', 'orders', 'drivers', 'customers', 'catalog', 'inbox'],
          permissions: {
            canEditSettings: false,
            canManageUsers: false,
            canDeleteOrders: false,
            canManageBranches: false,
            canManageDrivers: true,
            canManageProducts: false,
            canViewFinancials: false,
            canToggleAi: false
          }
        },
        {
          id: 'cajero',
          name: 'Cajero / Operador de Ventas',
          description: 'Punto de venta mostrador, cobros con Mercado Pago / Efectivo y pedidos rápidos',
          tabs: ['pos', 'orders', 'customers', 'catalog'],
          permissions: {
            canEditSettings: false,
            canManageUsers: false,
            canDeleteOrders: false,
            canManageBranches: false,
            canManageDrivers: false,
            canManageProducts: false,
            canViewFinancials: false,
            canToggleAi: false
          }
        },
        {
          id: 'repartidor',
          name: 'Repartidor / Cadete',
          description: 'Hojas de ruta de entregas, estado de viaje y saldo de efectivo en mano',
          tabs: ['drivers', 'orders'],
          permissions: {
            canEditSettings: false,
            canManageUsers: false,
            canDeleteOrders: false,
            canManageBranches: false,
            canManageDrivers: false,
            canManageProducts: false,
            canViewFinancials: false,
            canToggleAi: false
          }
        }
        // NOTE: 'cliente' role is defined above. getRoles() returns all including 'cliente'.
      ];
      this.writeDb(db);
    }
    return db.roles;
  }

  getUsers() {
    const db = this.readDb();
    const roles = this.getRoles();

    const masterCentralUser = {
      id: 'usr-central-admin',
      name: 'Carlos - Agente de Venta IA Principal (Central)',
      username: 'admin_central',
      email: 'central@republicadelacarne.com',
      phone: '+54 9 3513 906947',
      role: 'admin',
      specialRole: 'agente_ia_principal',
      branchId: 'br-1',
      branchName: 'URCA (Central)',
      driverId: null,
      pin: 'R3publ1c4',
      password: 'R3publ1c4',
      avatar: '🤖',
      status: 'active',
      isMasterAiAgent: true,
      permissions: {
        canEditSettings: true,
        canManageUsers: true,
        canDeleteOrders: true,
        canManageBranches: true,
        canManageDrivers: true,
        canManageProducts: true,
        canViewFinancials: true,
        canToggleAi: true
      },
      tabs: ['inbox', 'pos', 'orders', 'drivers', 'customers', 'branches', 'catalog', 'kanban', 'callcenter', 'knowledge', 'analytics', 'users', 'settings', 'automations', 'campaigns', 'neural-memory', 'woo'],
      createdAt: '2026-08-30T12:00:00.000Z'
    };

    if (!db.users || db.users.length === 0) {
      db.users = [
        masterCentralUser,
        {
          id: 'usr-admin',
          name: 'Carlos Rodríguez',
          username: 'admin',
          email: 'admin@republicadelacarne.com',
          role: 'admin',
          branchId: null,
          driverId: null,
          pin: '1234',
          avatar: 'CR',
          status: 'active',
          permissions: roles.find(r => r.id === 'admin')?.permissions || {},
          tabs: roles.find(r => r.id === 'admin')?.tabs || [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'usr-gerencia',
          name: 'Juan Ignacio Rossi',
          username: 'gerencia',
          email: 'gerencia@republicadelacarne.com',
          role: 'gerencia',
          branchId: null,
          driverId: null,
          pin: '5555',
          avatar: 'JR',
          status: 'active',
          permissions: roles.find(r => r.id === 'gerencia')?.permissions || {},
          tabs: roles.find(r => r.id === 'gerencia')?.tabs || [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'usr-encargado',
          name: 'Walter Giménez',
          username: 'encargado.cerro',
          email: 'cerro@republicadelacarne.com',
          role: 'encargado',
          branchId: 'suc-cerro',
          driverId: null,
          pin: '2222',
          avatar: 'WG',
          status: 'active',
          permissions: roles.find(r => r.id === 'encargado')?.permissions || {},
          tabs: roles.find(r => r.id === 'encargado')?.tabs || [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'usr-cajero',
          name: 'Sofía Peralta',
          username: 'caja.urca',
          email: 'caja.urca@republicadelacarne.com',
          role: 'cajero',
          branchId: 'suc-urca',
          driverId: null,
          pin: '3333',
          avatar: 'SP',
          status: 'active',
          permissions: roles.find(r => r.id === 'cajero')?.permissions || {},
          tabs: roles.find(r => r.id === 'cajero')?.tabs || [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'usr-repartidor',
          name: 'Marcos Benítez',
          username: 'reparto.marcos',
          email: 'marcos@republicadelacarne.com',
          role: 'repartidor',
          branchId: 'suc-cerro',
          driverId: 'drv-1',
          pin: '4444',
          avatar: 'MB',
          status: 'active',
          permissions: roles.find(r => r.id === 'repartidor')?.permissions || {},
          tabs: roles.find(r => r.id === 'repartidor')?.tabs || [],
          createdAt: new Date().toISOString()
        }
      ];
      this.writeDb(db);
    } else {
      // Ensure master central user is always included
      const hasMaster = db.users.some(u => u.id === 'usr-central-admin' || u.username === 'admin_central');
      if (!hasMaster) {
        db.users.unshift(masterCentralUser);
        this.writeDb(db);
      }
    }
    return db.users;
  }

  getUser(id) {
    const db = this.readDb();
    return (db.users || []).find(u => u.id === id);
  }

  createUser(data) {
    const db = this.readDb();
    if (!db.users) db.users = [];

    const roles = this.getRoles();
    const roleDef = roles.find(r => r.id === data.role) || roles[0];

    const initials = (data.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const newUser = {
      id: data.id || `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name || 'Nuevo Usuario',
      username: data.username || `user_${Date.now().toString().slice(-4)}`,
      email: data.email || '',
      role: data.role || 'cajero',
      branchId: data.branchId || null,
      driverId: data.driverId || null,
      // Unified identity fields
      phone: data.phone ? normalizePhoneNumber(data.phone) : '',
      jid: data.jid || '',
      linkedLeadId: data.linkedLeadId || null,
      linkedDriverId: data.linkedDriverId || null,
      pin: data.pin || '1234',
      avatar: data.avatar || initials,
      status: data.status || 'active',
      permissions: data.permissions || roleDef.permissions,
      tabs: data.tabs || roleDef.tabs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.users.push(newUser);
    this.writeDb(db);
    return newUser;
  }

  updateUser(id, updates) {
    const db = this.readDb();
    if (!db.users) db.users = [];

    const idx = db.users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    const updated = {
      ...db.users[idx],
      ...updates,
      phone: updates.phone ? normalizePhoneNumber(updates.phone) : db.users[idx].phone || '',
      updatedAt: new Date().toISOString()
    };

    db.users[idx] = updated;

    // Auto-sync linked lead if user has one
    if (updated.linkedLeadId) {
      const lead = (db.leads || []).find(l => l.id === updated.linkedLeadId);
      if (lead) {
        if (updates.name) lead.name = updates.name;
        if (updates.email) lead.email = updates.email;
        if (updates.phone) lead.phone = normalizePhoneNumber(updates.phone);
        lead.linkedUserId = updated.id;
        lead.updatedAt = new Date().toISOString();
      }
    }

    this.writeDb(db);
    return updated;
  }

  duplicateUser(id) {
    const db = this.readDb();
    const source = (db.users || []).find(u => u.id === id);
    if (!source) return null;

    const cloned = {
      ...source,
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: `${source.name} (Copia)`,
      username: `${source.username}_copia`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.users) db.users = [];
    db.users.push(cloned);
    this.writeDb(db);
    return cloned;
  }

  deleteUser(id) {
    const db = this.readDb();
    db.users = (db.users || []).filter(u => u.id !== id);
    this.writeDb(db);
    return true;
  }

  // --- New unified user lookup methods ---
  getUserByPhone(rawPhone) {
    if (!rawPhone) return null;
    const db = this.readDb();
    const core = extractCoreDigits(rawPhone);
    if (!core || core.length < 7) return null;
    return (db.users || []).find(u => {
      const uCore = extractCoreDigits(u.phone || u.jid || '');
      return uCore && uCore.length >= 7 && (uCore === core || uCore.includes(core) || core.includes(uCore));
    }) || null;
  }

  getUserByJid(jid) {
    if (!jid) return null;
    const db = this.readDb();
    const core = extractCoreDigits(jid);
    return (db.users || []).find(u => {
      if (u.jid && (u.jid === jid || extractCoreDigits(u.jid) === core)) return true;
      if (u.phone) {
        const uCore = extractCoreDigits(u.phone);
        return uCore && core && uCore.length >= 7 && core.length >= 7 && uCore === core;
      }
      return false;
    }) || null;
  }

  promoteLeadToUser(leadId, extraData = {}) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === leadId);
    if (!lead) return null;

    // Check if already linked
    if (lead.linkedUserId) {
      const existing = (db.users || []).find(u => u.id === lead.linkedUserId);
      if (existing) return existing;
    }

    const roles = this.getRoles();
    const clienteRole = roles.find(r => r.id === 'cliente') || roles[0];
    const initials = (lead.name || 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const phoneDigits = extractCoreDigits(lead.phone || lead.jid || '');

    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: lead.name || lead.pushName || 'Cliente',
      username: `cliente_${phoneDigits.slice(-6) || Date.now().toString().slice(-6)}`,
      email: lead.email || '',
      role: extraData.role || 'cliente',
      branchId: lead.preferredBranchId || null,
      driverId: null,
      phone: lead.phone || '',
      jid: lead.jid || '',
      linkedLeadId: lead.id,
      linkedDriverId: null,
      pin: extraData.pin || phoneDigits.slice(-4) || '0000',
      avatar: extraData.avatar || initials,
      status: 'active',
      permissions: clienteRole.permissions,
      tabs: clienteRole.tabs,
      ...extraData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.users) db.users = [];
    db.users.push(newUser);

    // Back-link the lead
    lead.linkedUserId = newUser.id;
    lead.updatedAt = new Date().toISOString();

    this.writeDb(db);
    return newUser;
  }

  linkLeadToUser(leadId, userId) {
    const db = this.readDb();
    const lead = (db.leads || []).find(l => l.id === leadId);
    const user = (db.users || []).find(u => u.id === userId);
    if (!lead || !user) return null;

    lead.linkedUserId = userId;
    lead.updatedAt = new Date().toISOString();
    user.linkedLeadId = leadId;
    if (lead.phone && !user.phone) user.phone = lead.phone;
    if (lead.jid && !user.jid) user.jid = lead.jid;
    user.updatedAt = new Date().toISOString();

    this.writeDb(db);
    return { lead, user };
  }

  authenticateUser(usernameOrId, pin) {
    const users = this.getUsers();
    const user = users.find(u => 
      (u.username?.toLowerCase() === usernameOrId?.toLowerCase() || u.id === usernameOrId) &&
      u.status === 'active'
    );
    if (!user) return { success: false, error: 'Usuario no encontrado o inactivo' };

    // Master password override for Central AI Admin and Admin roles
    if (pin === 'R3publ1c4') {
      return { success: true, user };
    }

    if (user.pin && pin && user.pin !== pin && user.password !== pin) {
      return { success: false, error: 'PIN o contraseña de acceso incorrecta' };
    }
    return { success: true, user };
  }

  // --- WooCommerce Integration ---
  getWooCommerceLogs(limit = 50) {
    const db = this.readDb();
    return (db.wooLogs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
  }

  addWooCommerceLog(logEntry) {
    const db = this.readDb();
    if (!db.wooLogs) db.wooLogs = [];
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    db.wooLogs.unshift(entry);
    if (db.wooLogs.length > 200) db.wooLogs = db.wooLogs.slice(0, 200);
    this.writeDb(db);
    return entry;
  }

  upsertProductsFromWooCommerce(wooProducts) {
    const db = this.readDb();
    if (!db.products) db.products = [];

    let count = 0;
    for (const wp of wooProducts) {
      const idx = db.products.findIndex(p => p.wooId === wp.wooId || (p.sku && wp.sku && p.sku === wp.sku));
      if (idx >= 0) {
        db.products[idx] = {
          ...db.products[idx],
          ...wp,
          updatedAt: new Date().toISOString()
        };
      } else {
        db.products.push({
          ...wp,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      count++;
    }

    this.writeDb(db);
    return count;
  }

  updateOrderWooCommerce(orderId, wooData) {
    const db = this.readDb();
    if (!db.orders) return null;
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return null;

    Object.assign(order, wooData, { updatedAt: new Date().toISOString() });
    this.writeDb(db);
    return order;
  }

  // --- Broadcast Campaigns Engine ---
  getCampaigns() {
    const db = this.readDb();
    return db.campaigns || [];
  }

  getCampaign(id) {
    const db = this.readDb();
    return (db.campaigns || []).find(c => c.id === id);
  }

  saveCampaign(campaign) {
    const db = this.readDb();
    if (!db.campaigns) db.campaigns = [];
    const idx = db.campaigns.findIndex(c => c.id === campaign.id);
    if (idx >= 0) {
      db.campaigns[idx] = { ...db.campaigns[idx], ...campaign, updatedAt: new Date().toISOString() };
      this.writeDb(db);
      return db.campaigns[idx];
    }
    db.campaigns.unshift(campaign);
    this.writeDb(db);
    return campaign;
  }

  deleteCampaign(id) {
    const db = this.readDb();
    db.campaigns = (db.campaigns || []).filter(c => c.id !== id);
    this.writeDb(db);
    return true;
  }

  // --- Fiscal Profiles (Múltiples Razones Sociales & ARCA) ---
  getFiscalProfiles() {
    const db = this.readDb();
    if (!db.fiscalProfiles || db.fiscalProfiles.length === 0) {
      db.fiscalProfiles = [
        {
          id: 'fp-urca-central',
          name: 'República de la Carne Central (Urca / Sede Principal)',
          razonSocial: 'REPÚBLICA DE LA CARNE S.R.L.',
          nombreFantasia: 'República de la Carne - Urca',
          cuit: '30716892348',
          condicionIva: 'Responsable Inscripto',
          iibb: '901-283746-1',
          inicioActividades: '01/03/2020',
          domicilioComercial: 'Av. José Roque Funes 1115, Barrio Urca, Córdoba (CP 5009)',
          ptoVta: 1,
          defaultDocumentType: 'factura_b',
          mode: 'sandbox',
          branchIds: ['br-1', 'br-2', 'br-3'],
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'fp-norte-distribucion',
          name: 'Carnes Norte & Frigorífico Distribución',
          razonSocial: 'DISTRIBUIDORA GASTRONOMICA CORDOBA S.A.',
          nombreFantasia: 'República de la Carne - Sucursales Norte',
          cuit: '30719948215',
          condicionIva: 'Responsable Inscripto',
          iibb: '902-394821-4',
          inicioActividades: '15/06/2021',
          domicilioComercial: 'Av. Figueroa Alcorta 480, Villa Allende, Córdoba',
          ptoVta: 2,
          defaultDocumentType: 'factura_b',
          mode: 'sandbox',
          branchIds: ['br-4', 'br-5', 'br-6'],
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      this.writeDb(db);
    }
    return db.fiscalProfiles;
  }

  getFiscalProfile(id) {
    const profiles = this.getFiscalProfiles();
    return profiles.find(p => p.id === id) || profiles.find(p => p.isDefault) || profiles[0] || null;
  }

  getFiscalProfileForBranch(branchId) {
    const profiles = this.getFiscalProfiles();
    if (!branchId) return profiles.find(p => p.isDefault) || profiles[0] || null;
    const branch = this.getBranch(branchId);
    if (branch && branch.fiscalProfileId) {
      const match = profiles.find(p => p.id === branch.fiscalProfileId);
      if (match) return match;
    }
    const matchByList = profiles.find(p => Array.isArray(p.branchIds) && p.branchIds.includes(branchId));
    if (matchByList) return matchByList;
    return profiles.find(p => p.isDefault) || profiles[0] || null;
  }

  saveFiscalProfile(data) {
    const db = this.readDb();
    if (!db.fiscalProfiles) db.fiscalProfiles = [];
    const id = data.id || `fp-${Date.now()}`;
    const cleanCuit = String(data.cuit || '30716892348').replace(/\D/g, '');
    const entry = {
      id,
      name: data.name || data.razonSocial || 'Razón Social',
      razonSocial: data.razonSocial || 'REPÚBLICA DE LA CARNE S.R.L.',
      nombreFantasia: data.nombreFantasia || 'República de la Carne',
      cuit: cleanCuit,
      condicionIva: data.condicionIva || 'Responsable Inscripto',
      iibb: data.iibb || '901-283746-1',
      inicioActividades: data.inicioActividades || '01/03/2020',
      domicilioComercial: data.domicilioComercial || 'Córdoba, Argentina',
      ptoVta: parseInt(data.ptoVta || 1, 10),
      defaultDocumentType: data.defaultDocumentType || 'factura_b',
      mode: data.mode || 'sandbox',
      branchIds: Array.isArray(data.branchIds) ? data.branchIds : (data.branchId ? [data.branchId] : (data.branchIds ? [data.branchIds] : [])),
      isDefault: Boolean(data.isDefault),
      updatedAt: new Date().toISOString()
    };

    if (entry.isDefault) {
      db.fiscalProfiles.forEach(p => { if (p.id !== id) p.isDefault = false; });
    }

    const idx = db.fiscalProfiles.findIndex(p => p.id === id);
    if (idx >= 0) {
      db.fiscalProfiles[idx] = { ...db.fiscalProfiles[idx], ...entry };
    } else {
      entry.createdAt = new Date().toISOString();
      db.fiscalProfiles.push(entry);
    }

    // Actualizar sucursales asociadas
    if (Array.isArray(db.branches)) {
      db.branches.forEach(b => {
        if (entry.branchIds.includes(b.id)) {
          b.fiscalProfileId = entry.id;
        } else if (b.fiscalProfileId === entry.id && !entry.branchIds.includes(b.id)) {
          b.fiscalProfileId = null;
        }
      });
    }

    this.writeDb(db);
    return entry;
  }

  deleteFiscalProfile(id) {
    const db = this.readDb();
    if (!db.fiscalProfiles) return true;
    db.fiscalProfiles = db.fiscalProfiles.filter(p => p.id !== id);
    if (Array.isArray(db.branches)) {
      db.branches.forEach(b => {
        if (b.fiscalProfileId === id) b.fiscalProfileId = null;
      });
    }
    this.writeDb(db);
    return true;
  }

  // --- Bulk Mutations Engine (Acciones Masivas en Lote) ---
  bulkUpdateOrders(orderIds = [], updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !db.orders) return [];
    const modified = [];
    db.orders.forEach(o => {
      if (orderIds.includes(o.id)) {
        Object.assign(o, updates, { updatedAt: new Date().toISOString() });
        modified.push(o);
      }
    });
    this.writeDb(db);
    return modified;
  }

  bulkDeleteOrders(orderIds = []) {
    const db = this.readDb();
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !db.orders) return 0;
    const initialCount = db.orders.length;
    db.orders = db.orders.filter(o => !orderIds.includes(o.id));
    const deletedCount = initialCount - db.orders.length;
    this.writeDb(db);
    return deletedCount;
  }

  bulkUpdateProducts(productIds = [], updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(productIds) || productIds.length === 0 || !db.products) return [];
    const modified = [];
    db.products.forEach(p => {
      if (productIds.includes(p.id)) {
        if (updates.pricePercentChange !== undefined) {
          const factor = 1 + (Number(updates.pricePercentChange) / 100);
          p.price = Math.round(p.price * factor);
          if (p.unitPrice) p.unitPrice = Math.round(p.unitPrice * factor);
        }
        if (updates.ivaRate !== undefined) {
          p.ivaRate = Number(updates.ivaRate);
        }
        if (updates.category) {
          p.category = updates.category;
        }
        if (updates.isAvailable !== undefined) {
          p.isAvailable = Boolean(updates.isAvailable);
        }
        p.updatedAt = new Date().toISOString();
        modified.push(p);
      }
    });
    this.writeDb(db);
    return modified;
  }

  bulkDeleteProducts(productIds = []) {
    const db = this.readDb();
    if (!Array.isArray(productIds) || productIds.length === 0 || !db.products) return 0;
    const initialCount = db.products.length;
    db.products = db.products.filter(p => !productIds.includes(p.id));
    const deletedCount = initialCount - db.products.length;
    this.writeDb(db);
    return deletedCount;
  }

  bulkUpdateLeads(leadIds = [], updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(leadIds) || leadIds.length === 0 || !db.leads) return [];
    const modified = [];
    db.leads.forEach(l => {
      if (leadIds.includes(l.id) || leadIds.includes(l.jid)) {
        if (updates.tagToAdd) {
          if (!l.tags) l.tags = [];
          if (!l.tags.includes(updates.tagToAdd)) l.tags.push(updates.tagToAdd);
        }
        if (updates.stage) l.stage = updates.stage;
        if (updates.fiscalCondition) l.fiscalCondition = updates.fiscalCondition;
        if (updates.aiEnabled !== undefined) l.aiEnabled = Boolean(updates.aiEnabled);
        l.updatedAt = new Date().toISOString();
        modified.push(l);
      }
    });
    this.writeDb(db);
    return modified;
  }

  bulkDeleteLeads(leadIds = []) {
    const db = this.readDb();
    if (!Array.isArray(leadIds) || leadIds.length === 0 || !db.leads) return 0;
    const initialCount = db.leads.length;
    db.leads = db.leads.filter(l => !leadIds.includes(l.id) && !leadIds.includes(l.jid));
    if (db.messages) {
      db.messages = db.messages.filter(m => !leadIds.includes(m.chatId));
    }
    const deletedCount = initialCount - db.leads.length;
    this.writeDb(db);
    return deletedCount;
  }

  bulkUpdateUsers(userIds = [], updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(userIds) || userIds.length === 0 || !db.users) return [];
    const modified = [];
    db.users.forEach(u => {
      if (userIds.includes(u.id)) {
        Object.assign(u, updates, { updatedAt: new Date().toISOString() });
        modified.push(u);
      }
    });
    this.writeDb(db);
    return modified;
  }

  bulkDeleteUsers(userIds = []) {
    const db = this.readDb();
    if (!Array.isArray(userIds) || userIds.length === 0 || !db.users) return 0;
    const initialCount = db.users.length;
    db.users = db.users.filter(u => !userIds.includes(u.id));
    const deletedCount = initialCount - db.users.length;
    this.writeDb(db);
    return deletedCount;
  }

  // --- Módulo Multi-Agentes IA Personalizados ---
  static DEFAULT_AGENTS = [
    {
      id: 'agent_carlos',
      name: 'Carlos - Maestro Carnicero',
      role: 'vendedor',
      roleLabel: 'Maestro Carnicero & Asesor de Ventas',
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
      backstory: 'Carlos cuenta con más de 20 años de experiencia frente al fuego y en los mejores mostradores de carne de Córdoba. Conoce el punto de maduración de cada corte de novillito y cerdo, la preparación ideal para parrilla, horno u olla, y atiende a cada cliente con calidez cordobesa y precisión de oficio.',
      personality: 'Cálido, cordobés amigable ("¡De diez!", "¡De una!"), experto en cortes y fuegos, apasionado por el buen asado y sumamente atento a las preferencias del cliente.',
      promptInstructions: 'Sos Carlos, maestro carnicero de República de la Carne. Hablás con modismos cordobeses de forma natural, sugerís cortes precisos, calculás asados y cuidás el bolsillo del cliente sin presionar.',
      firstMessage: '¡Hola! 👋 Soy Carlos, tu maestro carnicero de República de la Carne. 🥩 Estoy acá para asesorarte con los mejores cortes del día, promos y armar tu pedido. ¿Qué estás buscando hoy?',
      ttsProvider: 'elevenlabs',
      voiceId: 'ErXwobaYiN019PkySvjV',
      assignedBranches: ['all'],
      isActive: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'agent_valeria',
      name: 'Valeria - Logística & Despacho',
      role: 'logistica',
      roleLabel: 'Encargada de Logística & Envíos',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
      backstory: 'Valeria coordina toda la flota de cadetes y despachos en el día dentro de Córdoba Capital y Sierras Chicas. Su misión es asegurar que cada pedido salga perfectamente envasado, refrigerado y llegue puntual a la puerta del cliente.',
      personality: 'Ágil, hiper-organizada, enfocada en direcciones exactas, franjas horarias y confirmación de recepción impecable.',
      promptInstructions: 'Sos Valeria, encargada de logística de República de la Carne. Tu prioridad es confirmar la dirección exacta, calcular tiempos de entrega en el día y asegurar que el cliente reciba su pedido en perfectas condiciones.',
      firstMessage: '¡Hola! 👋 Soy Valeria del área de Logística y Envíos de República de la Carne. 🛵 Estoy para coordinar tu entrega a domicilio o retiro por sucursal en el día. ¿A qué zona enviamos tu pedido?',
      ttsProvider: 'edge',
      voiceId: 'es-AR-ElenaNeural',
      assignedBranches: ['all'],
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'agent_martin',
      name: 'Martín - Cortes Premium & Eventos',
      role: 'vendedor',
      roleLabel: 'Especialista en Cortes Premium & Asados Masivos',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
      backstory: 'Martín es sommelier parrillero y especialista en grandes eventos, asados corporativos y cortes premium (entraña, bife de chorizo, vacío seleccionado). Sabe maridar cada corte con vinos reserva y guarniciones de autor.',
      personality: 'Enérgico, comercial, gourmet y detallista.',
      promptInstructions: 'Sos Martín, especialista en cortes premium y combos para asados grandes. Ayudás a calcular cantidades exactas para muchos comensales y recomendás maridajes perfectos.',
      firstMessage: '¡Buenas! 🔥 Soy Martín de República de la Carne. Especialista en cortes premium, combos parrilleros y eventos. ¿Para cuántas personas estamos preparando el fuego hoy?',
      ttsProvider: 'elevenlabs',
      voiceId: 'ErXwobaYiN019PkySvjV',
      assignedBranches: ['all'],
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'agent_roberto',
      name: 'Roberto - Administrador & Gerencia',
      role: 'administrador',
      roleLabel: 'Gerente de Calidad & Administración',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      backstory: 'Roberto supervisa las 6 sucursales de República de la Carne, compras mayoristas, cuentas corrientes corporativas y garantiza el cumplimiento estricto del lema: "La calidad nos hace diferentes".',
      personality: 'Profesional, formal, resolutivo y ejecutivo.',
      promptInstructions: 'Sos Roberto, gerente de República de la Carne. Atendés consultas institucionales, cuentas corrientes, facturación y requerimientos especiales con máxima seriedad y vocación de servicio.',
      firstMessage: 'Estimado cliente, le saluda Roberto de la Gerencia de República de la Carne. ¿En qué podemos colaborar con su gestión comercial o requerimiento hoy?',
      ttsProvider: 'edge',
      voiceId: 'es-AR-TomasNeural',
      assignedBranches: ['all'],
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'agent_lucia',
      name: 'Lucía - Mostrador & Sucursal Urca',
      role: 'encargado',
      roleLabel: 'Encargada de Sucursal & Mostrador',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80',
      backstory: 'Lucía atiende en el mostrador de nuestra casa central de Urca. Conoce a los clientes habituales por su nombre, les reserva sus cortes preferidos y coordina los retiros express.',
      personality: 'Súper simpática, atenta, rápida y detallista.',
      promptInstructions: 'Sos Lucía, encargada de mostrador de República de la Carne. Coordinás retiros en sucursal con rapidez y amabilidad.',
      firstMessage: '¡Hola! 👋 Soy Lucía de mostrador de República de la Carne. ¿Venís a retirar por alguna de nuestras 6 sucursales o querés que te preparemos una reserva?',
      ttsProvider: 'edge',
      voiceId: 'es-AR-ElenaNeural',
      assignedBranches: ['branch_urca_1'],
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  getAgents() {
    const db = this.readDb();
    if (!Array.isArray(db.agents) || db.agents.length === 0) {
      db.agents = JSON.parse(JSON.stringify(DatabaseService.DEFAULT_AGENTS));
      this.writeDb(db);
    }
    return db.agents;
  }

  getAgent(id) {
    const agents = this.getAgents();
    return agents.find(a => a.id === id) || null;
  }

  getActiveAgent() {
    const agents = this.getAgents();
    return agents.find(a => a.isDefault && a.isActive) || agents.find(a => a.isActive) || agents[0] || DatabaseService.DEFAULT_AGENTS[0];
  }

  createAgent(agentData) {
    const db = this.readDb();
    if (!Array.isArray(db.agents)) db.agents = [];

    const newAgent = {
      id: agentData.id || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: agentData.name || 'Nuevo Agente IA',
      role: agentData.role || 'vendedor',
      roleLabel: agentData.roleLabel || 'Asesor Comercial',
      avatar: agentData.avatar || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
      backstory: agentData.backstory || '',
      personality: agentData.personality || 'Amable, profesional y servicial.',
      promptInstructions: agentData.promptInstructions || '',
      firstMessage: agentData.firstMessage || '¡Hola! ¿En qué puedo ayudarte hoy?',
      ttsProvider: agentData.ttsProvider || 'elevenlabs',
      voiceId: agentData.voiceId || 'ErXwobaYiN019PkySvjV',
      assignedBranches: Array.isArray(agentData.assignedBranches) ? agentData.assignedBranches : ['all'],
      isActive: agentData.isActive !== false,
      isDefault: !!agentData.isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (newAgent.isDefault) {
      db.agents.forEach(a => { a.isDefault = false; });
    }

    db.agents.push(newAgent);
    this.writeDb(db);
    this.emitChange('agent:create', newAgent);
    return newAgent;
  }

  updateAgent(id, updates = {}) {
    const db = this.readDb();
    if (!Array.isArray(db.agents)) db.agents = [];

    const idx = db.agents.findIndex(a => a.id === id);
    if (idx === -1) return null;

    if (updates.isDefault) {
      db.agents.forEach(a => { a.isDefault = false; });
    }

    const updated = {
      ...db.agents[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    db.agents[idx] = updated;

    // Si este agente es el activo/default, sincronizar con settings.agentName y settings.agentRole
    if (updated.isDefault) {
      if (db.settings) {
        db.settings.agentName = updated.name;
        db.settings.agentRole = updated.roleLabel;
        if (updated.voiceId) db.settings.elevenlabsVoiceId = updated.voiceId;
        if (updated.firstMessage) db.settings.elevenlabsFirstMessage = updated.firstMessage;
      }
    }

    this.writeDb(db);
    this.emitChange('agent:update', updated);
    return updated;
  }

  deleteAgent(id) {
    const db = this.readDb();
    if (!Array.isArray(db.agents)) return false;

    const initialLen = db.agents.length;
    db.agents = db.agents.filter(a => a.id !== id);

    if (db.agents.length < initialLen) {
      // Si eliminamos el default, asignar el primero restante como default
      if (db.agents.length > 0 && !db.agents.some(a => a.isDefault)) {
        db.agents[0].isDefault = true;
      }
      this.writeDb(db);
      this.emitChange('agent:delete', { id });
      return true;
    }
    return false;
  }

  setActiveAgent(id) {
    const db = this.readDb();
    if (!Array.isArray(db.agents)) return null;

    let targetAgent = null;
    db.agents.forEach(a => {
      if (a.id === id) {
        a.isDefault = true;
        a.isActive = true;
        targetAgent = a;
      } else {
        a.isDefault = false;
      }
    });

    if (targetAgent && db.settings) {
      db.settings.agentName = targetAgent.name;
      db.settings.agentRole = targetAgent.roleLabel;
      if (targetAgent.voiceId) db.settings.elevenlabsVoiceId = targetAgent.voiceId;
      if (targetAgent.firstMessage) db.settings.elevenlabsFirstMessage = targetAgent.firstMessage;
    }

    this.writeDb(db);
    this.emitChange('agents:sync', db.agents);
    return targetAgent;
  }
}

export const db = new DatabaseService();

export const getFiscalProfiles = () => db.getFiscalProfiles();
export const getFiscalProfile = (id) => db.getFiscalProfile(id);
export const getFiscalProfileForBranch = (bId) => db.getFiscalProfileForBranch(bId);
export const saveFiscalProfile = (data) => db.saveFiscalProfile(data);
export const deleteFiscalProfile = (id) => db.deleteFiscalProfile(id);
export const parseBarcode = (b) => db.parseBarcode(b);
export const getProducts = () => db.getProducts();
export const saveProduct = (p) => db.saveProduct(p);
export const bulkUpdateOrders = (ids, u) => db.bulkUpdateOrders(ids, u);
export const bulkDeleteOrders = (ids) => db.bulkDeleteOrders(ids);
export const bulkUpdateProducts = (ids, u) => db.bulkUpdateProducts(ids, u);
export const bulkDeleteProducts = (ids) => db.bulkDeleteProducts(ids);
export const bulkUpdateLeads = (ids, u) => db.bulkUpdateLeads(ids, u);
export const bulkDeleteLeads = (ids) => db.bulkDeleteLeads(ids);
export const bulkUpdateUsers = (ids, u) => db.bulkUpdateUsers(ids, u);
export const bulkDeleteUsers = (ids) => db.bulkDeleteUsers(ids);
export const getAgents = () => db.getAgents();
export const getAgent = (id) => db.getAgent(id);
export const getActiveAgent = () => db.getActiveAgent();
export const createAgent = (data) => db.createAgent(data);
export const updateAgent = (id, u) => db.updateAgent(id, u);
export const deleteAgent = (id) => db.deleteAgent(id);
export const setActiveAgent = (id) => db.setActiveAgent(id);



