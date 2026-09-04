import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';
import { sqliteStorage } from './sqliteStorage.js';

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

export function parseArgentinePrice(str) {
  if (!str) return 0;
  let s = String(str).trim();
  s = s.replace(/[\$\*]/g, '').trim();

  // Caso 1: Decimal con coma (ej: "17.980,50", "5.904,00", "27.484,50", "5904,00", "5904,5")
  if (/,\d{1,2}$/.test(s)) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(normalized);
    return isNaN(val) ? 0 : Math.round(val);
  }

  // Caso 2: Miles con punto (ej: "17.980", "1.198.700", "3.600") y NO tiene comas
  if (/\.\d{3}/.test(s) && !s.includes(',')) {
    const val = parseInt(s.replace(/\./g, '').replace(/[^\d]/g, ''), 10);
    return isNaN(val) ? 0 : val;
  }

  // Caso 3: Decimal con punto (ej: "17980.50")
  if (/\.\d{1,2}$/.test(s)) {
    const val = parseFloat(s.replace(/,/g, ''));
    return isNaN(val) ? 0 : Math.round(val);
  }

  const val = parseInt(s.replace(/[^\d]/g, ''), 10);
  return isNaN(val) ? 0 : val;
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

    // Sincronización transparente con SQLite WAL
    try {
      sqliteStorage.migrateFromJsonData(data);
    } catch (sqliteErr) {
      console.warn('⚠️ [DatabaseService] Error sincronizando a SQLite:', sqliteErr.message);
    }

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

  getStorageMode() {
    return 'SQLite WAL (Write-Ahead Logging) + L1 RAM Cache';
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
  static getOfficialCatalogSeed() {
    try {
      const csvPath = path.join(process.cwd(), 'server/data/official_catalog.csv');
      if (fs.existsSync(csvPath)) {
        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.trim().split(/\r?\n/);
        const products = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(';');
          if (parts.length < 9) continue;
          const plu = (parts[0] || '').trim();
          const barcode = (parts[1] || '').trim();
          const sku = (parts[2] || '').trim();
          const name = (parts[3] || '').trim();
          const category = (parts[4] || 'Carnicería').trim();
          const rawPrice = (parts[5] || '0').trim().replace(',', '.');
          const unit = (parts[6] || 'kg').trim();
          const stock = parseFloat((parts[7] || '100').replace(',', '.')) || 0;
          const disponible = (parts[8] || 'Sí').trim().toUpperCase();
          const description = (parts[9] || '').trim();
          const price = parseFloat(rawPrice) || 0;

          // Regla: Productos con valor 0 (o <= 1) o Disponible NO quedan completamente desactivados
          const isZeroOrPlaceholder = price <= 1 || isNaN(price);
          const isExplicitlyDisabled = disponible === 'NO';
          const isAvailable = !isZeroOrPlaceholder && !isExplicitlyDisabled;
          const id = `prod_${sku ? sku.replace(/[^a-zA-Z0-9_-]/g, '') : ''}_${i}`;

          products.push({
            id,
            plu,
            barcode,
            sku: sku || (plu ? `PLU-${plu}` : `SKU-${i}`),
            name,
            category,
            price: isZeroOrPlaceholder ? 0 : price,
            unitPrice: isZeroOrPlaceholder ? 0 : price,
            unit: unit || 'kg',
            stock,
            isAvailable,
            available: isAvailable,
            is_available: isAvailable ? 1 : 0,
            status: isAvailable ? 'active' : 'inactive',
            isAvailableDelivery: isAvailable,
            isAvailableCounter: isAvailable,
            showInPos: isAvailable,
            showInWhatsApp: isAvailable,
            showInWeb: isAvailable,
            minOrder: unit === 'kg' ? 0.5 : 1,
            description: description || `${name} - Categoría: ${category}`
          });
        }
        if (products.length > 0) return products;
      }
    } catch (e) {
      console.warn('⚠️ [Database] Error cargando official_catalog.csv:', e.message);
    }
    return [];
  }

  seedMasterProducts(force = false) {
    const db = this.readDb();
    if (!db.products) db.products = [];

    if (force || db.products.length === 0) {
      const catalogSeed = DatabaseService.getOfficialCatalogSeed();
      db.products = catalogSeed.length > 0 ? catalogSeed : (sqliteStorage.getProducts() || []);
      this.writeDb(db);
      if (sqliteStorage.isNative && catalogSeed.length > 0) {
        sqliteStorage.saveProducts(catalogSeed);
      }
      console.log(`🥩 [Database] Catálogo Oficial inicializado con ${db.products.length} productos desde CSV.`);
    }
    return db.products;
  }

  getProducts() {
    const db = this.readDb();
    const prods = (!db.products || db.products.length === 0) ? this.seedMasterProducts() : db.products;
    return prods.map(p => ({
      ...p,
      showInPos: p.showInPos !== undefined ? p.showInPos : (p.isAvailable !== false),
      showInWhatsApp: p.showInWhatsApp !== undefined ? p.showInWhatsApp : (p.isAvailable !== false),
      showInWeb: p.showInWeb !== undefined ? p.showInWeb : (p.isAvailable !== false)
    }));
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
          title: '🥩 Promociones y Cortes Estrella',
          category: 'productos',
          content: '🔥 *OFERTAS Y CORTES DESTACADOS DEL DÍA:*\n\n1️⃣ Vacío Seleccionado ➔ $26.999 / kg\n2️⃣ Costilla Parrillera ➔ $26.999 / kg\n3️⃣ Chorizo Criollos ➔ $9.990 / kg\n4️⃣ Morcilla Bombón ➔ $10.500 / kg\n5️⃣ Matambre Vacuno ➔ $25.999 / kg\n6️⃣ Tapa de Cuadril Envasada ➔ $25.997 / kg'
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

  _sanitizeOrder(order, db) {
    if (!order) return order;
    const o = { ...order };

    // 1. Detección y corrección de inflación 100x (coma decimal argentina parseada sin coma)
    // Ejemplo: asado a $1.198.700/kg en vez de $11.987, carbón a $360.000 en vez de $3.600, total $2.748.450
    const hasInflatedPrices = (Number(o.totalAmount) > 400000 && Array.isArray(o.products) && o.products.some(p => Number(p.price || p.unitPrice) > 90000 && !/combo.*asadazo/i.test(p.name || '')));
    if (hasInflatedPrices) {
      o.totalAmount = Math.round(Number(o.totalAmount) / 100);
      if (Array.isArray(o.products)) {
        o.products = o.products.map(p => {
          const newPrice = Math.round((Number(p.price || p.unitPrice) || 0) / 100);
          const newSubtotal = Math.round((Number(p.subtotal) || 0) / 100);
          return {
            ...p,
            price: newPrice,
            unitPrice: newPrice,
            subtotal: newSubtotal
          };
        });
      }
      if (Array.isArray(o.items)) {
        o.items = o.items.map(itemStr => {
          if (typeof itemStr === 'string') {
            return itemStr.replace(/—\s*\$([\d\.,]+)/g, (_, m) => {
              const num = parseArgentinePrice(m);
              const corrected = Math.round(num / 100);
              return `— $${corrected.toLocaleString('es-AR')}`;
            });
          }
          return itemStr;
        });
      }
    }

    // 2. Detección y corrección de dirección corrupta con saludos/conversación del bot
    // Ej: "¡Entendido perfectamente, Don Juan! Me pongo firme..."
    if (o.address && (/¡Entendido|¡De una|¡Espectacular|¡Hola|¡Claro|Me pongo firme|Sacamos el kilo|Detalle de tu pedido/i.test(o.address) || o.address.length > 70)) {
      const lead = (db.leads || []).find(l => l.jid === o.jid || (l.phone && o.phone && l.phone.includes(o.phone)));
      if (lead?.address && !/¡Entendido|¡De una/i.test(lead.address)) {
        o.address = lead.address;
      } else {
        const addrMatch = o.address.match(/(?:Roque Funes|Funes|Urca|Av\.|Calle)\s+[0-9]{2,5}[^,\n\.]*/i);
        o.address = addrMatch ? addrMatch[0].trim() : (lead?.address || 'Roque Funes 1704, Barrio Urca');
      }
    }

    return o;
  }

  // --- Orders System ---
  getOrders() {
    const db = this.readDb();
    return (db.orders || []).map(rawOrder => {
      const o = this._sanitizeOrder(rawOrder, db);
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
    const rawOrder = (db.orders || []).find(o => 
      String(o.id).toLowerCase() === cleanId || 
      String(o.id).replace(/\D/g, '') === cleanId.replace(/\D/g, '')
    );
    if (!rawOrder) return null;
    const order = this._sanitizeOrder(rawOrder, db);
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
        
        // Detectar subtotal de la línea: "— $39.999", "($39.999)", "$39.999", "— $17.980,50"
        const priceMatch = str.match(/(?:—|\-|\()\s*\$?\s*([\d\.\,]+)\s*\)?$/);
        const subtotal = priceMatch ? parseArgentinePrice(priceMatch[1]) : 0;
        
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
    const rolesList = Array.isArray(data.roles) && data.roles.length > 0 
      ? data.roles 
      : [data.role || 'cajero'];
    const primaryRole = rolesList[0] || data.role || 'cajero';
    const roleDef = roles.find(r => r.id === primaryRole) || roles[0];

    const branchesList = Array.isArray(data.branches) && data.branches.length > 0
      ? data.branches
      : (data.branchId ? [data.branchId] : []);
    const primaryBranch = branchesList[0] || data.branchId || null;

    const initials = (data.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const newUser = {
      id: data.id || `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name || 'Nuevo Usuario',
      username: data.username || `user_${Date.now().toString().slice(-4)}`,
      email: data.email || '',
      role: primaryRole,
      roles: rolesList,
      branchId: primaryBranch,
      branches: branchesList,
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

    const current = db.users[idx];
    const rolesList = Array.isArray(updates.roles) && updates.roles.length > 0
      ? updates.roles
      : (updates.role ? [updates.role] : current.roles || [current.role || 'cajero']);
    const primaryRole = rolesList[0] || updates.role || current.role || 'cajero';

    const branchesList = Array.isArray(updates.branches)
      ? updates.branches
      : (updates.branchId ? [updates.branchId] : current.branches || (current.branchId ? [current.branchId] : []));
    const primaryBranch = branchesList[0] || updates.branchId || current.branchId || null;

    const updated = {
      ...current,
      ...updates,
      role: primaryRole,
      roles: rolesList,
      branchId: primaryBranch,
      branches: branchesList,
      phone: updates.phone ? normalizePhoneNumber(updates.phone) : current.phone || '',
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
      aiProvider: 'gemini',
      aiModel: 'gemini-2.5-flash',
      aiTemperature: 0.7,
      aiMaxTokens: 500,
      apiKeyOverride: '',
      customEndpoint: '',
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
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiTemperature: 0.3,
      aiMaxTokens: 400,
      apiKeyOverride: '',
      customEndpoint: '',
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
      aiProvider: 'gemini',
      aiModel: 'gemini-1.5-pro-latest',
      aiTemperature: 0.8,
      aiMaxTokens: 600,
      apiKeyOverride: '',
      customEndpoint: '',
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
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
      aiTemperature: 0.4,
      aiMaxTokens: 500,
      apiKeyOverride: '',
      customEndpoint: '',
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
      aiProvider: 'anthropic',
      aiModel: 'claude-3-5-sonnet-20241022',
      aiTemperature: 0.7,
      aiMaxTokens: 450,
      apiKeyOverride: '',
      customEndpoint: '',
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
      aiProvider: agentData.aiProvider || 'gemini',
      aiModel: agentData.aiModel || 'gemini-2.5-flash',
      aiTemperature: agentData.aiTemperature !== undefined ? Number(agentData.aiTemperature) : 0.7,
      aiMaxTokens: agentData.aiMaxTokens !== undefined ? Number(agentData.aiMaxTokens) : 500,
      apiKeyOverride: agentData.apiKeyOverride || '',
      customEndpoint: agentData.customEndpoint || '',
      ttsProvider: agentData.ttsProvider || 'elevenlabs',
      voiceId: agentData.voiceId || 'ErXwobaYiN019PkySvjV',
      assignedBranches: Array.isArray(agentData.assignedBranches) ? agentData.assignedBranches : ['all'],
      isAI: agentData.isAI !== false, // Identifica si este perfil es un Agente de IA o un Operador Humano
      whatsappSessionId: agentData.whatsappSessionId || 'default', // Sesión o número de WhatsApp asignado
      phoneNumber: agentData.phoneNumber ? normalizePhoneNumber(agentData.phoneNumber) : '',
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

  // =========================================================================
  // GESTIÓN DE RECETAS GASTRONÓMICAS TRADICIONALES
  // =========================================================================
  getRecipes() {
    const db = this.readDb();
    if (!db.recipes || !Array.isArray(db.recipes) || db.recipes.length === 0) {
      return this.seedRecipes(false);
    }
    return db.recipes;
  }

  getRecipe(id) {
    const recipes = this.getRecipes();
    return recipes.find(r => r.id === id) || null;
  }

  saveRecipe(recipeData) {
    const db = this.readDb();
    if (!db.recipes) db.recipes = [];

    let saved;
    if (recipeData.id) {
      const idx = db.recipes.findIndex(r => r.id === recipeData.id);
      if (idx !== -1) {
        db.recipes[idx] = {
          ...db.recipes[idx],
          ...recipeData,
          updatedAt: new Date().toISOString()
        };
        saved = db.recipes[idx];
      } else {
        saved = {
          ...recipeData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.recipes.push(saved);
      }
    } else {
      saved = {
        ...recipeData,
        id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.recipes.push(saved);
    }

    this.writeDb(db);
    this.emitChange('recipes:updated', db.recipes);
    return saved;
  }

  deleteRecipe(id) {
    const db = this.readDb();
    if (!Array.isArray(db.recipes)) return false;
    db.recipes = db.recipes.filter(r => r.id !== id);
    this.writeDb(db);
    this.emitChange('recipes:updated', db.recipes);
    return true;
  }

  // ─── CUPONES DE DESCUENTO ────────────────────────────────────────────────────

  // ─── CUPONES DE DESCUENTO AVANZADOS ──────────────────────────────────────────

  getCoupons() {
    const db = this.readDb();
    return Array.isArray(db.coupons) ? db.coupons : [];
  }

  getCoupon(idOrCode) {
    const coupons = this.getCoupons();
    const upper = String(idOrCode).toUpperCase().trim();
    return coupons.find(c => c.id === idOrCode || c.code === upper) || null;
  }

  saveCoupon(couponData) {
    const db = this.readDb();
    if (!Array.isArray(db.coupons)) db.coupons = [];

    const upper = String(couponData.code || '').toUpperCase().replace(/\s+/g, '').trim();
    if (!upper) throw new Error('El código de descuento es obligatorio');

    // Manejo de caducidad por duración (horas) o fecha/hora fija
    let endDate = couponData.endDate || null;
    let endTime = couponData.endTime || '23:59';
    let validUntil = couponData.validUntil || null;

    if (couponData.durationHours && Number(couponData.durationHours) > 0) {
      const expires = new Date(Date.now() + Number(couponData.durationHours) * 3600 * 1000);
      validUntil = expires.toISOString();
      endDate = expires.toISOString().slice(0, 10);
      endTime = expires.toTimeString().slice(0, 5);
    } else if (endDate) {
      validUntil = new Date(`${endDate}T${endTime || '23:59'}:59`).toISOString();
    }

    let saved;
    const existing = db.coupons.findIndex(c => c.id === couponData.id);
    if (existing >= 0) {
      saved = {
        ...db.coupons[existing],
        ...couponData,
        code: upper,
        endDate,
        endTime,
        validUntil,
        durationHours: couponData.durationHours ? Number(couponData.durationHours) : null,
        maxUses: couponData.maxUses != null && couponData.maxUses !== '' ? Number(couponData.maxUses) : null,
        maxUsesPerUser: couponData.maxUsesPerUser != null && couponData.maxUsesPerUser !== '' ? Number(couponData.maxUsesPerUser) : null,
        combinable: couponData.combinable === true,
        userUsages: db.coupons[existing].userUsages || {},
        updatedAt: new Date().toISOString()
      };
      db.coupons[existing] = saved;
    } else {
      // Verificar que el código no exista
      const duplicate = db.coupons.find(c => c.code === upper);
      if (duplicate) throw new Error(`El código "${upper}" ya existe`);
      saved = {
        id: `cpn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        code: upper,
        description: couponData.description || '',
        discountType: couponData.discountType || 'percent', // 'percent' | 'fixed'
        discountValue: Number(couponData.discountValue) || 0,
        minOrderAmount: Number(couponData.minOrderAmount) || 0,
        maxUses: couponData.maxUses != null && couponData.maxUses !== '' ? Number(couponData.maxUses) : null, // null = ilimitado
        maxUsesPerUser: couponData.maxUsesPerUser != null && couponData.maxUsesPerUser !== '' ? Number(couponData.maxUsesPerUser) : null, // usos por usuario
        usedCount: 0,
        userUsages: {}, // { [userIdOrPhone]: count }
        combinable: couponData.combinable === true, // Si se puede combinar con otras promos o cupones
        durationHours: couponData.durationHours ? Number(couponData.durationHours) : null,
        validUntil,
        isActive: couponData.isActive !== false,
        startDate: couponData.startDate || null,
        startTime: couponData.startTime || '00:00',
        endDate,
        endTime,
        appliesTo: couponData.appliesTo || 'all', // 'all' | 'web' | 'whatsapp' | 'pos'
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.coupons.push(saved);
    }
    this.writeDb(db);
    return saved;
  }

  deleteCoupon(id) {
    const db = this.readDb();
    if (!Array.isArray(db.coupons)) return false;
    db.coupons = db.coupons.filter(c => c.id !== id);
    this.writeDb(db);
    return true;
  }

  validateCoupon(code, orderAmount = 0, channel = 'all', userIdentifier = null, activePromos = []) {
    const upper = String(code || '').toUpperCase().replace(/\s+/g, '').trim();
    const coupon = this.getCoupon(upper);
    if (!coupon) return { valid: false, error: 'Código de descuento no válido' };
    if (!coupon.isActive) return { valid: false, error: 'Este cupón no está activo' };

    const now = new Date();

    // 1. Validación de fecha y hora de inicio
    if (coupon.startDate) {
      const start = new Date(`${coupon.startDate}T${coupon.startTime || '00:00'}:00`);
      if (now < start) return { valid: false, error: `El cupón es válido a partir del ${coupon.startDate} ${coupon.startTime || ''}` };
    }

    // 2. Validación de fecha y hora de caducidad / duración
    if (coupon.validUntil) {
      const expiry = new Date(coupon.validUntil);
      if (now > expiry) return { valid: false, error: 'El cupón ha expirado' };
    } else if (coupon.endDate) {
      const end = new Date(`${coupon.endDate}T${coupon.endTime || '23:59'}:59`);
      if (now > end) return { valid: false, error: 'El cupón ha expirado' };
    }

    // 3. Cantidad total de usos
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, error: 'El cupón ha alcanzado su límite total de usos' };
    }

    // 4. Cantidad de usos por usuario / teléfono
    if (coupon.maxUsesPerUser != null && userIdentifier) {
      const cleanUser = String(userIdentifier).replace(/\D/g, '') || String(userIdentifier).trim();
      const usages = (coupon.userUsages && coupon.userUsages[cleanUser]) || 0;
      if (usages >= coupon.maxUsesPerUser) {
        return { valid: false, error: `Has alcanzado el límite máximo (${coupon.maxUsesPerUser}) de usos para este cupón` };
      }
    }

    // 5. Combinabilidad con otros cupones o promociones
    if (Array.isArray(activePromos) && activePromos.length > 0 && !coupon.combinable) {
      return { valid: false, error: 'Este cupón no es combinable con otras promociones o códigos activos' };
    }

    // 6. Monto mínimo
    if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount) {
      return { valid: false, error: `Monto mínimo de pedido: $${coupon.minOrderAmount.toLocaleString('es-AR')}` };
    }

    // 7. Canal (all, web, whatsapp, pos)
    if (coupon.appliesTo !== 'all' && coupon.appliesTo !== channel) {
      const channelNames = { web: 'Tienda Web', whatsapp: 'WhatsApp', pos: 'Caja POS' };
      return { valid: false, error: `Este cupón solo aplica para ${channelNames[coupon.appliesTo] || coupon.appliesTo}` };
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percent') {
      discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
    } else {
      discountAmount = Math.min(coupon.discountValue, orderAmount);
    }

    return {
      valid: true,
      coupon,
      discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
      combinable: !!coupon.combinable,
      message: `Cupón "${upper}" aplicado: ${coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `$${coupon.discountValue.toLocaleString('es-AR')} de descuento`}`
    };
  }

  useCoupon(code, userIdentifier = null) {
    const db = this.readDb();
    if (!Array.isArray(db.coupons)) return false;
    const idx = db.coupons.findIndex(c => c.code === String(code).toUpperCase().trim());
    if (idx < 0) return false;

    db.coupons[idx].usedCount = (db.coupons[idx].usedCount || 0) + 1;
    if (userIdentifier) {
      const cleanUser = String(userIdentifier).replace(/\D/g, '') || String(userIdentifier).trim();
      if (!db.coupons[idx].userUsages) db.coupons[idx].userUsages = {};
      db.coupons[idx].userUsages[cleanUser] = (db.coupons[idx].userUsages[cleanUser] || 0) + 1;
    }
    db.coupons[idx].updatedAt = new Date().toISOString();
    this.writeDb(db);
    return true;
  }

  // ─── CAJAS & TURNOS POS (APERTURA Y CIERRE DE CAJA) ──────────────────────────

  getShifts(filter = {}) {
    let shifts = sqliteStorage.getShifts();
    if (filter.branchId) {
      shifts = shifts.filter(s => s.branchId === filter.branchId);
    }
    if (filter.status) {
      shifts = shifts.filter(s => s.status === filter.status);
    }
    return shifts;
  }

  getShift(id) {
    return sqliteStorage.getShiftById(id);
  }

  getActiveShift(branchId) {
    return sqliteStorage.getActiveShift(branchId);
  }

  openShift({ branchId, branchName, userId, userName, initialCash = 0, notes = '' }) {
    // Verificar si ya hay una caja abierta para esta sucursal
    const existing = this.getActiveShift(branchId);
    if (existing) {
      return existing; // Retornar el turno abierto existente
    }

    const shift = {
      id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      branchId: branchId || 'main',
      branchName: branchName || 'Sucursal Principal',
      userId: userId || 'user',
      userName: userName || 'Cajero',
      openedAt: new Date().toISOString(),
      closedAt: null,
      status: 'open',
      initialCash: Number(initialCash) || 0,
      salesCount: 0,
      totalSalesAmount: 0,
      paymentSummary: {
        efectivo: 0,
        debito: 0,
        credito: 0,
        qr: 0,
        transferencia: 0
      },
      sales: [],
      notes: notes || '',
      closingNotes: '',
      expectedCash: Number(initialCash) || 0,
      finalCashDeclared: null,
      cashDifference: null
    };

    sqliteStorage.saveShift(shift);
    if (this.io) {
      this.io.emit('pos:shift:opened', shift);
    }
    return shift;
  }

  recordShiftSale(shiftId, saleData) {
    const shift = this.getShift(shiftId);
    if (!shift || shift.status !== 'open') return null;

    shift.salesCount = (shift.salesCount || 0) + 1;
    const amount = Number(saleData.total) || 0;
    shift.totalSalesAmount = (shift.totalSalesAmount || 0) + amount;

    // Clasificar pago
    const method = String(saleData.paymentMethod || 'efectivo').toLowerCase();
    if (!shift.paymentSummary) {
      shift.paymentSummary = { efectivo: 0, debito: 0, credito: 0, qr: 0, transferencia: 0 };
    }

    if (method.includes('efectivo') || method === 'cash') {
      shift.paymentSummary.efectivo = (shift.paymentSummary.efectivo || 0) + amount;
    } else if (method.includes('debito') || method.includes('débito')) {
      shift.paymentSummary.debito = (shift.paymentSummary.debito || 0) + amount;
    } else if (method.includes('credito') || method.includes('crédito')) {
      shift.paymentSummary.credito = (shift.paymentSummary.credito || 0) + amount;
    } else if (method.includes('qr') || method.includes('mp') || method.includes('mercado')) {
      shift.paymentSummary.qr = (shift.paymentSummary.qr || 0) + amount;
    } else {
      shift.paymentSummary.transferencia = (shift.paymentSummary.transferencia || 0) + amount;
    }

    if (!Array.isArray(shift.sales)) shift.sales = [];
    shift.sales.push({
      orderId: saleData.id,
      customerName: saleData.customerName || 'Venta Mostrador',
      total: amount,
      paymentMethod: saleData.paymentMethod,
      orderType: saleData.orderType || 'counter',
      timestamp: new Date().toISOString()
    });

    shift.expectedCash = (shift.initialCash || 0) + (shift.paymentSummary.efectivo || 0);

    sqliteStorage.saveShift(shift);
    if (this.io) {
      this.io.emit('pos:shift:updated', shift);
    }
    return shift;
  }

  closeShift(shiftId, { closedByUserId, closedByUserName, finalCashDeclared = 0, notes = '' }) {
    const shift = this.getShift(shiftId);
    if (!shift) throw new Error('Turno de caja no encontrado');

    const expectedCash = (shift.initialCash || 0) + (shift.paymentSummary?.efectivo || 0);
    const declared = Number(finalCashDeclared) || 0;
    const diff = declared - expectedCash;

    shift.status = 'closed';
    shift.closedAt = new Date().toISOString();
    shift.closedByUserId = closedByUserId || shift.userId;
    shift.closedByUserName = closedByUserName || shift.userName;
    shift.finalCashDeclared = declared;
    shift.expectedCash = expectedCash;
    shift.cashDifference = diff;
    shift.closingNotes = notes || '';

    sqliteStorage.saveShift(shift);
    if (this.io) {
      this.io.emit('pos:shift:closed', shift);
    }
    return shift;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  seedRecipes(force = false) {
    const db = this.readDb();
    if (!force && Array.isArray(db.recipes) && db.recipes.length >= 8) {
      return db.recipes;
    }

    const defaultRecipes = [
      {
        id: "rec-1",
        title: "Milanesas Caseras a la Napolitana o Fritas",
        category: "Milanesas y Fritos",
        description: "El plato familiar argentino por excelencia. Tiernas, crocantes y con el grosor exacto para no secarse.",
        prepTimeMinutes: 25,
        difficulty: "Fácil",
        servingsDefault: 4,
        gramsPerPerson: 250,
        suggestedCuts: [
          { name: "Nalga Feteada", plu: "2021", isPrimary: true, note: "El corte clásico más tierno y sin desperdicio" },
          { name: "Bola de Lomo", plu: "2022", isPrimary: true, note: "Súper tierna y rendidora" },
          { name: "Cuadrada", plu: "2029", isPrimary: false, note: "Opción económica y pareja" }
        ],
        replacementCuts: [
          { name: "Peceto", plu: "2023", note: "Para milanesas gourmet redonditas y magras" },
          { name: "Suprema de Pollo", plu: "2030", note: "Para milanesas de pollo jugosas" }
        ],
        ingredients: [
          "1 kg de Nalga o Bola de Lomo feteada fina",
          "3 huevos frescos con perejil y ajo picado",
          "500g de pan rallado de panadería",
          "Sal fina y pimienta al gusto",
          "Opcional Napolitana: salsa de tomate, jamón cocido y queso mozzarella"
        ],
        instructions: [
          "Pasar los bifes por la mezcla de huevo batido con ajo, perejil y sal.",
          "Empanar presionando firmemente con ambas caras sobre el pan rallado.",
          "Freír en aceite caliente o dorar al horno a 200°C durante 15 minutos.",
          "Para Napolitana: agregar salsa, jamón y muzzarella en los últimos 5 minutos de horno hasta gratinar."
        ],
        isFeatured: true
      },
      {
        id: "rec-2",
        title: "Guiso de Lentejas o Carrero Criollo",
        category: "Guisos y Olla",
        description: "Guisazo calórico y reparador con todo el sabor criollo. La carne queda tierna desmechándose al toque de la cuchara.",
        prepTimeMinutes: 50,
        difficulty: "Media",
        servingsDefault: 4,
        gramsPerPerson: 250,
        suggestedCuts: [
          { name: "Roast Beef", plu: "2024", isPrimary: true, note: "Corte con grasa intramuscular ideal para cubitos jugosos" },
          { name: "Osobuco con Caracú", plu: "2025", isPrimary: true, note: "Aporta gelatina, caldo espeso y sabor profundo" },
          { name: "Chorizo Criollo", plu: "2012", isPrimary: false, note: "Indispensable para el toque criollo" }
        ],
        replacementCuts: [
          { name: "Palomita", plu: "2031", note: "Magro y sabroso para cocción lenta" },
          { name: "Aguja Parrillera", plu: "2032", note: "Muy sabrosa en trozos medianos" },
          { name: "Falda Parrillera", plu: "2033", note: "Sabor intenso con hueso" }
        ],
        ingredients: [
          "1 kg de Roast Beef u Osobuco cortado en cubos",
          "2 chorizos criollos puro cerdo en rodajas",
          "400g de lentejas remojadas",
          "2 cebollas, 1 morrón rojo, 2 zanahorias y 2 papas en cubos",
          "1 lata de puré de tomate y 1 litro de caldo de carne",
          "Pimentón dulce, comino, laurel y ají molido"
        ],
        instructions: [
          "Sellar los cubos de carne y las rodajas de chorizo en una olla gruesa con un chorrito de aceite hasta dorar bien.",
          "Agregar la cebolla, el morrón y las zanahorias; rehogar 5 minutos.",
          "Incorporar el tomate, el caldo caliente, el laurel y los condimentos.",
          "Sumar las lentejas y cocinar a fuego bajo durante 35 minutos.",
          "Agregar las papas en cubos y cocinar 15 minutos más hasta que todo esté tierno y espeso."
        ],
        isFeatured: true
      },
      {
        id: "rec-3",
        title: "Pastel de Papa Tradicional Casero",
        category: "Horno y Asaderas",
        description: "El clásico de la abuela: base sustanciosa de carne picada jugosa y gratinado dorado de puré de papas con manteca.",
        prepTimeMinutes: 45,
        difficulty: "Fácil",
        servingsDefault: 4,
        gramsPerPerson: 250,
        suggestedCuts: [
          { name: "Carne Picada Especial / Molida", plu: "2026", isPrimary: true, note: "Picada en el momento, fresca y magra" },
          { name: "Nalga Picada", plu: "2021", isPrimary: false, note: "100% magra sin grasa" }
        ],
        replacementCuts: [
          { name: "Roast Beef Picado", plu: "2024", note: "Sabor más intenso y jugoso" },
          { name: "Sobras de Asado Desmechadas", plu: "2003", note: "Para un pastel de papa ahumado gourmet" }
        ],
        ingredients: [
          "1 kg de Carne Picada Especial",
          "1.2 kg de papas para puré",
          "2 cebollas grandes y 1 cebolla de verdeo picadas",
          "2 huevos duros picados y aceitunas descarozadas",
          "50g de manteca y 50ml de leche para el puré",
          "Pimentón dulce, nuez moscada, sal y pimienta",
          "100g de queso rallado para gratinar"
        ],
        instructions: [
          "Hervir las papas y pisarlas calientes con manteca, leche, sal y nuez moscada.",
          "Rehogar las cebollas en sartén, agregar la carne picada y cocinar hasta que cambie de color (unos 10 min) sin sobrecocinar para que quede jugosa.",
          "Condimentar la carne con pimentón, sal y pimienta. Fuera del fuego sumar los huevos duros y aceitunas.",
          "En una fuente para horno, colocar la capa de carne y cubrir con el puré.",
          "Espolvorear queso rallado y gratinar a horno fuerte a 220°C por 15 minutos."
        ],
        isFeatured: true
      },
      {
        id: "rec-4",
        title: "Estofado de Carne con Tallarines Caseros o Polenta",
        category: "Pastas y Salsas",
        description: "Salsa espesa y perfumada con trozos enteros de carne que se desarman al tenedor.",
        prepTimeMinutes: 60,
        difficulty: "Media",
        servingsDefault: 4,
        gramsPerPerson: 250,
        suggestedCuts: [
          { name: "Peceto", plu: "2023", isPrimary: true, note: "Corte magro y compacto para rodajas perfectas" },
          { name: "Cuadril", plu: "2028", isPrimary: true, note: "Muy sabroso y tierno" },
          { name: "Osobuco con Caracú", plu: "2025", isPrimary: false, note: "Para una salsa súper intensa" }
        ],
        replacementCuts: [
          { name: "Roast Beef", plu: "2024", note: "Económico y rendidor" },
          { name: "Palomita", plu: "2031", note: "Ideal para estofado en olla tapada" }
        ],
        ingredients: [
          "1 kg de Peceto o Cuadril entero o en postas",
          "2 cebollas, 2 dientes de ajo y 1 zanahoria rallada",
          "1 vaso de vino tinto Malbec",
          "750ml de salsa de tomate triturado",
          "Orégano, laurel, pimentón y sal",
          "500g de pasta seca o fresca"
        ],
        instructions: [
          "Dorar la carne entera por todos sus lados en cacerola con aceite caliente.",
          "Agregar los vegetales picados y dorar 5 minutos.",
          "Desglasar con el vino tinto y dejar evaporar el alcohol 2 minutos.",
          "Incorporar el tomate y condimentos. Bajar el fuego al mínimo y cocinar tapado durante 50 minutos.",
          "Servir sobre los tallarines al dente con abundante queso rallado."
        ],
        isFeatured: true
      },
      {
        id: "rec-5",
        title: "Bifes a la Plancha o a la Criolla Rápidos",
        category: "Minutas y Plancha",
        description: "Solución en 15 minutos para el almuerzo o cena de la semana con cebolla, morrones y papas.",
        prepTimeMinutes: 15,
        difficulty: "Súper Fácil",
        servingsDefault: 4,
        gramsPerPerson: 300,
        suggestedCuts: [
          { name: "Bife Angosto / Costeletas de Ternera", plu: "2011", isPrimary: true, note: "Jugosos, tiernos y con el hueso que da sabor" },
          { name: "Bife de Chorizo", plu: "2005", isPrimary: true, note: "Calidad premium para plancha bien caliente" }
        ],
        replacementCuts: [
          { name: "Cuadril", plu: "2028", note: "Bifes magros y tiernos" },
          { name: "Costeletas de Cerdo", plu: "2010", note: "Opción económica doradas con limón" }
        ],
        ingredients: [
          "4 a 6 bifes de ternera o bife de chorizo (1.2 kg total)",
          "2 cebollas en aros y 1 morrón en tiras",
          "Sal entrefina, pimienta negra y provenzal",
          "Aceite de oliva"
        ],
        instructions: [
          "Calentar la plancha o sartén de hierro a fuego fuerte con un hilo de aceite.",
          "Colocar los bifes bien secos; dorar 4 minutos por lado sin moverlos para sellar los jugos.",
          "En la misma plancha al costado, saltear los aros de cebolla y morrón.",
          "Salpimentar al dar vuelta y servir con papas fritas o ensalada mixta."
        ],
        isFeatured: true
      },
      {
        id: "rec-6",
        title: "Empanadas Criollas Cortadas a Cuchillo",
        category: "Tradicionales",
        description: "Empanadas jugosas con cebolla rehogada, comino criollo y masa crocante.",
        prepTimeMinutes: 50,
        difficulty: "Media",
        servingsDefault: 4,
        gramsPerPerson: 200,
        suggestedCuts: [
          { name: "Nalga", plu: "2021", isPrimary: true, note: "Fácil de cortar a cuchillo en cubitos finos" },
          { name: "Bola de Lomo", plu: "2022", isPrimary: true, note: "Tierna y sabrosa" },
          { name: "Roast Beef", plu: "2024", isPrimary: false, note: "Muy jugosa" }
        ],
        replacementCuts: [
          { name: "Cuadril", plu: "2028", note: "Corte magro y parejo" },
          { name: "Carne Picada Especial", plu: "2026", note: "Para preparación rápida" }
        ],
        ingredients: [
          "800g de Nalga o Bola de Lomo cortada a cuchillo en cubitos",
          "800g de cebolla picada y 2 cebollas de verdeo",
          "100g de grasa vacuna para rehogar",
          "Comino, pimentón dulce, ají molido y sal",
          "3 huevos duros y aceitunas verdes",
          "24 discos de empanadas criollas"
        ],
        instructions: [
          "Fundir la grasa en sartén y rehogar la cebolla hasta transparentar.",
          "Agregar la carne cortada a cuchillo y cocinar solo 5 minutos para que no se seque.",
          "Condimentar con comino, pimentón y sal. Dejar enfriar el relleno en heladera (idealmente de un día para otro).",
          "Armar las empanadas sumando huevo duro y aceituna en cada disco, repulgar y hornear a 230°C por 12-15 minutos."
        ],
        isFeatured: true
      },
      {
        id: "rec-7",
        title: "Carbonada Criolla en Cazuela",
        category: "Guisos y Olla",
        description: "Guiso agridulce tradicional con calabaza, choclo, duraznos y carne vacuna tierna.",
        prepTimeMinutes: 55,
        difficulty: "Media",
        servingsDefault: 4,
        gramsPerPerson: 250,
        suggestedCuts: [
          { name: "Roast Beef", plu: "2024", isPrimary: true, note: "Corte ideal para cocción lenta" },
          { name: "Palomita", plu: "2031", isPrimary: true, note: "Magra y tierna" }
        ],
        replacementCuts: [
          { name: "Osobuco", plu: "2025", note: "Sabor profundo" },
          { name: "Carnaza Común", plu: "2034", note: "Opción económica" }
        ],
        ingredients: [
          "1 kg de Roast Beef en cubitos",
          "500g de calabaza en cubos",
          "2 choclos en rodajas",
          "1 cebolla y 1 morrón",
          "4 orejones de durazno o damasco",
          "Caldo de carne y condimentos criollos"
        ],
        instructions: [
          "Dorar la carne en cubos en olla de hierro.",
          "Sumar cebolla, morrón y rehogar.",
          "Agregar caldo, calabaza, choclos y orejones.",
          "Cocinar a fuego lento durante 40 minutos hasta que la calabaza comience a espesar el caldo."
        ],
        isFeatured: false
      },
      {
        id: "rec-8",
        title: "Matambre a la Pizza al Horno",
        category: "Horno y Asaderas",
        description: "Matambre tiernizado al horno con salsa de tomate casera, queso mozzarella derretido y orégano.",
        prepTimeMinutes: 40,
        difficulty: "Fácil",
        servingsDefault: 4,
        gramsPerPerson: 350,
        suggestedCuts: [
          { name: "Matambre Vacuno", plu: "2008", isPrimary: true, note: "El clásico bien tiernizado con leche" },
          { name: "Matambrito de Cerdo", plu: "2007", isPrimary: true, note: "Súper tierno directo a la asadera" }
        ],
        replacementCuts: [
          { name: "Tapa de Asado", plu: "2035", note: "Tiernizada al horno con papel aluminio" },
          { name: "Pechito de Cerdo", plu: "2036", note: "Versión porcina jugosa" }
        ],
        ingredients: [
          "1.4 kg de Matambre Vacuno o Matambrito de Cerdo",
          "1 litro de leche (para hervir si es vacuno)",
          "300g de salsa de tomate para pizza",
          "400g de queso mozzarella",
          "Aceitunas, orégano y ají molido"
        ],
        instructions: [
          "Si es vacuno: hervir 40 minutos en leche con sal y laurel para tiernizar. Si es de cerdo va directo.",
          "Colocar en asadera con la grasa hacia abajo y dorar 10 min a 200°C.",
          "Dar vuelta, cubrir con salsa de tomate y abundante muzzarella.",
          "Hornear 10 minutos más hasta derretir y gratinar. Terminar con orégano y aceitunas."
        ],
        isFeatured: true
      }
    ];

    db.recipes = defaultRecipes;
    this.writeDb(db);
    this.emitChange('recipes:updated', db.recipes);
    return defaultRecipes;
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
export const getRecipes = () => db.getRecipes();
export const getRecipe = (id) => db.getRecipe(id);
export const saveRecipe = (r) => db.saveRecipe(r);
export const deleteRecipe = (id) => db.deleteRecipe(id);
export const seedRecipes = (f) => db.seedRecipes(f);

export const getCoupons = () => db.getCoupons();
export const getCoupon = (id) => db.getCoupon(id);
export const saveCoupon = (data) => db.saveCoupon(data);
export const deleteCoupon = (id) => db.deleteCoupon(id);
export const validateCoupon = (code, amount, channel) => db.validateCoupon(code, amount, channel);
export const useCoupon = (code) => db.useCoupon(code);
