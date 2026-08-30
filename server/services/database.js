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
    const jsonStr = JSON.stringify(data, null, 2);
    try {
      fs.writeFileSync(this.dbFile, jsonStr, 'utf8');
      return true;
    } catch (error) {
      try {
        const tempPath = `${this.dbFile}.tmp`;
        fs.writeFileSync(tempPath, jsonStr, 'utf8');
        try {
          fs.copyFileSync(tempPath, this.dbFile);
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {
          fs.renameSync(tempPath, this.dbFile);
        }
        return true;
      } catch (retryErr) {
        console.error('Error writing to database:', retryErr.message);
        return false;
      }
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

    const newMsg = {
      id: msgData.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      chatId: msgData.chatId || msgData.jid || '',
      timestamp: msgData.timestamp || new Date().toISOString(),
      status: msgData.status || 'sent',
      ...msgData
    };
    newMsg.chatId = newMsg.chatId || msgData.jid || '';

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

  // =========================================================================
  // GESTIÓN DE SUCURSALES (BRANCHES)
  // =========================================================================
  getBranches() {
    const db = this.readDb();
    if (!db.branches || db.branches.length === 0) {
      db.branches = [
        {
          id: "br-1",
          name: "Sucursal Cerro de las Rosas",
          address: "Av. Rafael Núñez 4250, Cerro de las Rosas, Córdoba",
          phone: "+54 9 351 626-2475",
          phoneNormalized: "+5493516262475",
          managerName: "Roberto Gomez",
          email: "cerro@republicadelacarne.com",
          hours: "Lun a Sáb 8:00 a 20:30 | Dom 9:00 a 14:00",
          coverageZones: ["Cerro de las Rosas", "Urca", "Villa Belgrano", "Argüello"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-2",
          name: "Sucursal Urca",
          address: "Av. Menéndez Pidal 3600, Urca, Córdoba",
          phone: "+54 9 351 555-0102",
          phoneNormalized: "+5493515550102",
          managerName: "Marcos Díaz",
          email: "urca@republicadelacarne.com",
          hours: "Lun a Sáb 8:30 a 20:30 | Dom 9:00 a 13:30",
          coverageZones: ["Urca", "Parque Tablada", "Chateau Carreras"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-3",
          name: "Sucursal General Paz",
          address: "Av. 24 de Septiembre 1150, B° General Paz, Córdoba",
          phone: "+54 9 351 555-0103",
          phoneNormalized: "+5493515550103",
          managerName: "Romina Paz",
          email: "gralpaz@republicadelacarne.com",
          hours: "Lun a Sáb 8:00 a 21:00 | Dom 9:30 a 14:00",
          coverageZones: ["General Paz", "Centro", "Alta Córdoba", "Juniors"],
          isActive: true,
          createdAt: "2026-08-30T17:00:00.000Z"
        },
        {
          id: "br-4",
          name: "Sucursal Villa Belgrano",
          address: "Av. Recta Martinolli 5800, Villa Belgrano, Córdoba",
          phone: "+54 9 351 555-0104",
          phoneNormalized: "+5493515550104",
          managerName: "Carlos Vaca",
          email: "villabelgrano@republicadelacarne.com",
          hours: "Lun a Sáb 8:30 a 20:30 | Dom 9:00 a 14:00",
          coverageZones: ["Villa Belgrano", "Villa Warcalde", "Granja de Funes"],
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

    return {
      ...branch,
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
    if (!db.roles || db.roles.length === 0) {
      db.roles = [
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
      ];
      this.writeDb(db);
    }
    return db.roles;
  }

  getUsers() {
    const db = this.readDb();
    if (!db.users || db.users.length === 0) {
      const roles = this.getRoles();
      db.users = [
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
      updatedAt: new Date().toISOString()
    };

    db.users[idx] = updated;
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

  authenticateUser(usernameOrId, pin) {
    const users = this.getUsers();
    const user = users.find(u => 
      (u.username?.toLowerCase() === usernameOrId?.toLowerCase() || u.id === usernameOrId) &&
      u.status === 'active'
    );
    if (!user) return { success: false, error: 'Usuario no encontrado o inactivo' };
    if (user.pin && pin && user.pin !== pin) {
      return { success: false, error: 'PIN de acceso incorrecto' };
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
}

export const db = new DatabaseService();

