import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';

export function normalizePhoneNumber(raw) {
  if (!raw) return '';
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
  return `+${digits}`;
}

export function extractCoreDigits(raw) {
  if (!raw) return '';
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
      this.deduplicateDatabase();
    }
  }

  readDb() {
    try {
      const data = fs.readFileSync(this.dbFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading database file:', error);
      return {
        settings: CONFIG.DEFAULT_SETTINGS,
        knowledgeBase: CONFIG.DEFAULT_KNOWLEDGE_BASE,
        leads: [],
        messages: [],
        calls: []
      };
    }
  }

  writeDb(data) {
    try {
      const tempPath = `${this.dbFile}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.dbFile);
      return true;
    } catch (error) {
      console.error('Error writing to database:', error);
      return false;
    }
  }

  // --- Settings ---
  getSettings() {
    const db = this.readDb();
    return db.settings || CONFIG.DEFAULT_SETTINGS;
  }

  updateSettings(newSettings) {
    const db = this.readDb();
    db.settings = { ...db.settings, ...newSettings };
    this.writeDb(db);
    return db.settings;
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

      if (leadData.lastMessage) existing.lastMessage = leadData.lastMessage;
      if (leadData.lastMessageAt) existing.lastMessageAt = leadData.lastMessageAt;
      if (leadData.unreadCount !== undefined) existing.unreadCount = leadData.unreadCount;

      existing.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return existing;
    } else {
      // Crear nuevo Lead unificado
      const newLead = {
        id: leadData.id || `lead-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        jid: jid || (formattedPhone ? `${formattedPhone.replace(/\D/g, '')}@s.whatsapp.net` : ''),
        altJids: altJid ? [altJid] : [],
        phone: formattedPhone || (jid ? `+${jid.split('@')[0]}` : ''),
        name: leadData.realName || (leadData.name && leadData.name !== 'Contacto WhatsApp' ? leadData.name : (leadData.pushName && leadData.pushName !== 'Contacto WhatsApp' ? leadData.pushName : formattedPhone || 'Nuevo Contacto')),
        pushName: leadData.pushName || 'Contacto WhatsApp',
        stage: leadData.stage || 'new_lead',
        value: leadData.value || 0,
        tags: leadData.tags || ['WhatsApp'],
        aiEnabled: leadData.aiEnabled !== undefined ? leadData.aiEnabled : true,
        unreadCount: leadData.unreadCount || 0,
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

      db.leads.unshift(newLead);
      this.writeDb(db);
      return newLead;
    }
  }

  saveOrUpdateLead(leadData) {
    return this.findOrCreateLead(leadData);
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
    db.leads = (db.leads || []).filter(l => l.id !== id && l.jid !== id);
    this.writeDb(db);
    return true;
  }

  // --- Messages ---
  getMessages(chatId, limit = 50) {
    const db = this.readDb();
    const messages = (db.messages || []).filter(m => m.chatId === chatId);
    return messages.slice(-limit);
  }

  saveMessage(msgData) {
    const db = this.readDb();
    if (!db.messages) db.messages = [];

    const newMsg = {
      id: msgData.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: msgData.timestamp || new Date().toISOString(),
      status: msgData.status || 'sent',
      ...msgData
    };

    db.messages.push(newMsg);

    // Actualizar datos del lead automáticamente
    if (newMsg.chatId) {
      const lead = (db.leads || []).find(l => l.jid === newMsg.chatId);
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
    const lead = (db.leads || []).find(l => l.jid === chatId);
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

    db.calls.unshift(newCall);
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

  // --- Products Catalog ---
  getProducts() {
    const db = this.readDb();
    return db.products || [];
  }

  saveProduct(prodData) {
    const db = this.readDb();
    if (!db.products) db.products = [];

    const existingIndex = db.products.findIndex(p => p.id === prodData.id);
    const newProduct = {
      id: prodData.id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: prodData.name || 'Nuevo Producto',
      category: prodData.category || 'General',
      price: Number(prodData.price) || 0,
      unit: prodData.unit || 'kg',
      description: prodData.description || '',
      stock: Number(prodData.stock) || 100,
      imageUrl: prodData.imageUrl || '',
      isAvailable: prodData.isAvailable !== false,
      sku: prodData.sku || '',
      updatedAt: new Date().toISOString(),
      ...prodData
    };

    if (existingIndex >= 0) {
      db.products[existingIndex] = newProduct;
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

  deleteProduct(id) {
    const db = this.readDb();
    if (!db.products) return true;
    db.products = db.products.filter(p => p.id !== id);
    this.writeDb(db);
    return true;
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

  // --- Orders System ---
  getOrders() {
    const db = this.readDb();
    return (db.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getOrder(id) {
    const db = this.readDb();
    return (db.orders || []).find(o => o.id === id);
  }

  getLatestOrderByJid(jid) {
    const db = this.readDb();
    const orders = (db.orders || []).filter(o => o.jid === jid || (o.phone && jid && jid.includes(o.phone)));
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  }

  createOrder(orderData) {
    const db = this.readDb();
    if (!db.orders) db.orders = [];

    const newOrder = {
      id: orderData.id || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      jid: orderData.jid || '',
      phone: orderData.phone || (orderData.jid ? orderData.jid.split('@')[0] : ''),
      customerName: orderData.customerName || 'Cliente',
      address: orderData.address || '',
      items: orderData.items || [],
      totalAmount: Number(orderData.totalAmount) || 0,
      paymentMethod: orderData.paymentMethod || 'Efectivo / Transferencia',
      status: orderData.status || 'pending', // 'pending' | 'preparing' | 'in_transit' | 'delivered' | 'cancelled'
      notes: orderData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.orders.unshift(newOrder);

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
          const cutName = item.replace(/^[•\d\sx]+/, '').split('—')[0].split('(')[0].trim();
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

  updateOrder(id, updates) {
    const db = this.readDb();
    const order = (db.orders || []).find(o => o.id === id);
    if (order) {
      Object.assign(order, updates, { updatedAt: new Date().toISOString() });
      if (updates.totalAmount !== undefined) order.totalAmount = Number(updates.totalAmount) || 0;
      this.writeDb(db);
      return order;
    }
    return null;
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
    return cloned;
  }

  updateOrderStatus(id, status) {
    const db = this.readDb();
    const order = (db.orders || []).find(o => o.id === id);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
      this.writeDb(db);
      return order;
    }
    return null;
  }

  deleteOrder(id) {
    const db = this.readDb();
    db.orders = (db.orders || []).filter(o => o.id !== id);
    this.writeDb(db);
    return true;
  }
}

export const db = new DatabaseService();
