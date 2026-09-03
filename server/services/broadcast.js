import { db } from './database.js';
import path from 'path';
import fs from 'fs';

export class BroadcastService {
  constructor() {
    this.isProcessingQueue = false;
    this.io = null;
    this.whatsappService = null;
    this.schedulerInterval = null;
  }

  setWhatsAppService(service) {
    this.whatsappService = service;
  }

  setSocketIO(io) {
    this.io = io;
    this.startScheduler();
  }

  /**
   * Obtiene la lista de contactos objetivo según el segmento seleccionado
   */
  getAudienceForSegment(segment = 'all', customIds = []) {
    const leads = db.getLeads() || [];
    const orders = db.getOrders() || [];
    const now = Date.now();

    // Map de gastos por lead
    const spendByLead = new Map();
    const ordersByLead = new Map();
    for (const ord of orders) {
      const key = ord.customerJid || ord.customerPhone;
      if (key) {
        spendByLead.set(key, (spendByLead.get(key) || 0) + (Number(ord.totalAmount) || 0));
        ordersByLead.set(key, (ordersByLead.get(key) || 0) + 1);
      }
    }

    return leads.filter(l => {
      // Excluir números de sistema o inválidos
      if (!l.jid || l.jid.includes('status@broadcast') || l.jid.includes('g.us')) return false;

      const leadKey = l.jid || l.phone;
      const orderCount = ordersByLead.get(leadKey) || 0;
      const totalSpend = spendByLead.get(leadKey) || 0;

      switch (segment) {
        case 'vip':
          return (l.tags && l.tags.includes('vip')) || totalSpend >= 50000 || orderCount >= 3;
        case 'frequent':
          return orderCount >= 2;
        case 'inactive_7d': {
          const lastMsg = new Date(l.lastMessageAt || l.updatedAt || 0).getTime();
          return (now - lastMsg) >= 7 * 24 * 60 * 60 * 1000;
        }
        case 'with_orders':
          return orderCount >= 1;
        case 'custom':
          return Array.isArray(customIds) && (customIds.includes(l.id) || customIds.includes(l.jid));
        case 'all':
        default:
          return true;
      }
    });
  }

  /**
   * Renderiza el texto de la plantilla reemplazando las variables dinámicas de personalización
   */
  renderMessageTemplate(template, lead) {
    if (!template) return '';
    const settings = db.getSettings() || {};
    const businessName = settings.businessName || 'República de la Carne';

    // Obtener datos del cliente y su historial
    const clientName = (lead.name && !lead.name.startsWith('+') && !lead.name.includes('Contacto')) 
      ? lead.name 
      : (lead.pushName || 'Amigo');

    const customerNumber = lead.customerNumber || `CLI-${(lead.id || '0000').slice(-4).toUpperCase()}`;
    const phone = lead.phone || lead.jid?.split('@')[0] || '';

    // Historial y preferencias
    const leadOrders = (db.getOrders() || []).filter(o => o.customerJid === lead.jid || o.customerPhone === lead.phone);
    const lastOrder = leadOrders[0] || null;

    let favoriteCuts = 'Costilla, Vacío y Chorizos Criollos';
    let lastOrderSummary = 'Cortes seleccionados';
    let closestBranch = 'Sucursal Urca Central (Av. Funes 1115)';

    if (lastOrder) {
      if (Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
        lastOrderSummary = lastOrder.items.map(i => typeof i === 'string' ? i : i.name).join(', ');
        favoriteCuts = lastOrder.items[0]?.name || 'Vacío Seleccionado';
      }
      if (lastOrder.branchName) closestBranch = lastOrder.branchName;
    }

    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const currentDay = days[new Date().getDay()];

    return template
      .replace(/\{\{nombre\}\}/gi, clientName)
      .replace(/\{\{telefono\}\}/gi, phone)
      .replace(/\{\{numero_cliente\}\}/gi, customerNumber)
      .replace(/\{\{negocio\}\}/gi, businessName)
      .replace(/\{\{dia_semana\}\}/gi, currentDay)
      .replace(/\{\{cortes_favoritos\}\}/gi, favoriteCuts)
      .replace(/\{\{sucursal_cercana\}\}/gi, closestBranch)
      .replace(/\{\{ultimo_pedido\}\}/gi, lastOrderSummary)
      .trim();
  }

  /**
   * Crea una nueva campaña de difusión
   */
  createCampaign(data) {
    const dbData = db.readDb();
    if (!dbData.campaigns) dbData.campaigns = [];

    const audience = this.getAudienceForSegment(data.segment || 'all', data.customLeadIds || []);

    const campaign = {
      id: `camp-${Date.now()}`,
      name: data.name || `Difusión ${new Date().toLocaleDateString('es-AR')}`,
      segment: data.segment || 'all',
      customLeadIds: data.customLeadIds || [],
      products: data.products || [],
      messageTemplate: data.messageTemplate || '',
      mediaUrl: data.mediaUrl || null,
      mediaType: data.mediaType || (data.mediaUrl ? 'image' : 'text'),
      status: data.scheduledAt ? 'scheduled' : 'draft', // 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'paused'
      scheduledAt: data.scheduledAt || null,
      totalRecipients: audience.length,
      sentCount: 0,
      failedCount: 0,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbData.campaigns.unshift(campaign);
    db.writeDb(dbData);

    this.syncCampaignWithKnowledge(campaign);

    if (this.io) this.io.emit('campaign:new', campaign);
    return campaign;
  }

  /**
   * Sincroniza la campaña de difusión activa con la Base de Conocimiento RAG de la IA
   */
  syncCampaignWithKnowledge(campaign) {
    if (!campaign || !campaign.name) return;
    try {
      const docId = `doc-campaign-${campaign.id}`;

      const productsSummary = Array.isArray(campaign.products) && campaign.products.length > 0
        ? campaign.products.map(p => `• ${p.name}: $${Number(p.price).toLocaleString('es-AR')} / ${p.unit || 'kg'}`).join('\n')
        : '';

      const doc = {
        id: docId,
        title: `🔥 Promoción / Difusión Activa: ${campaign.name}`,
        category: 'promociones',
        tags: [
          'difusion', 'difusión', 'promocion', 'promoción', 'oferta', 'campaña', 'descuento',
          ...(campaign.products || []).map(p => (p.name || '').toLowerCase())
        ],
        content: `OFERTA ACTIVA POR DIFUSIÓN WHATSAPP: "${campaign.name}"\n\n` +
                 `Texto de la difusión:\n${campaign.messageTemplate}\n\n` +
                 (productsSummary ? `Cortes y Combos incluidos:\n${productsSummary}\n\n` : '') +
                 `Regla para el Agente IA: Si el cliente pregunta por la difusión, la promo enviada hoy o consulta sobre estos cortes, valida estos precios especiales y toma su pedido inmediatamente.`
      };

      db.saveKnowledgeDoc(doc);
      console.log(`🧠 [RAG / CONOCIMIENTO] Campaña "${campaign.name}" sincronizada en Base de Conocimiento IA.`);
    } catch (err) {
      console.error('Error sincronizando campaña con conocimiento:', err);
    }
  }

  /**
   * Ejecuta inmediatamente el envío masivo de una campaña
   */
  async executeCampaign(campaignId) {
    const dbData = db.readDb();
    if (!dbData.campaigns) return null;
    const campaign = dbData.campaigns.find(c => c.id === campaignId);
    if (!campaign) return null;

    campaign.status = 'sending';
    campaign.updatedAt = new Date().toISOString();
    db.writeDb(dbData);
    if (this.io) this.io.emit('campaign:update', campaign);

    const audience = this.getAudienceForSegment(campaign.segment, campaign.customLeadIds);
    campaign.totalRecipients = audience.length;
    campaign.sentCount = 0;
    campaign.failedCount = 0;
    campaign.logs = [];

    console.log(`📢 [DIFUSIÓN WHATSAPP] Iniciando campaña "${campaign.name}" para ${audience.length} destinatarios...`);

    // Proceso asíncrono con delay anti-ban
    (async () => {
      for (let i = 0; i < audience.length; i++) {
        const lead = audience[i];
        const personalizedText = this.renderMessageTemplate(campaign.messageTemplate, lead);

        try {
          // Enviar con imagen si tiene mediaUrl
          if (campaign.mediaUrl && campaign.mediaType === 'image') {
            const cleanPath = campaign.mediaUrl.replace('/media/', '');
            const absoluteImgPath = path.join(db.MEDIA_DIR || 'data/media', cleanPath);
            
            if (fs.existsSync(absoluteImgPath) && this.whatsappService?.sendImageMessage) {
              await this.whatsappService.sendImageMessage(lead.jid, absoluteImgPath, personalizedText);
            } else if (this.whatsappService) {
              await this.whatsappService.sendMessage(lead.jid, personalizedText);
            }
          } else if (this.whatsappService) {
            await this.whatsappService.sendMessage(lead.jid, personalizedText);
          }

          campaign.sentCount++;
          campaign.logs.push({
            jid: lead.jid,
            name: lead.name || lead.pushName,
            status: 'sent',
            time: new Date().toISOString()
          });
        } catch (err) {
          console.error(`Error enviando difusión a ${lead.jid}:`, err);
          campaign.failedCount++;
          campaign.logs.push({
            jid: lead.jid,
            name: lead.name || lead.pushName,
            status: 'failed',
            error: err.message,
            time: new Date().toISOString()
          });
        }

        // Emitir progreso por WebSocket
        if (this.io) {
          this.io.emit('campaign:progress', {
            id: campaign.id,
            sentCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            total: campaign.totalRecipients,
            currentLead: lead.name || lead.pushName
          });
        }

        // Delay anti-bloqueo aleatorio entre 3.5s y 6s por mensaje
        const delay = 3500 + Math.floor(Math.random() * 2500);
        await new Promise(res => setTimeout(res, delay));
      }

      campaign.status = 'completed';
      campaign.completedAt = new Date().toISOString();
      campaign.updatedAt = new Date().toISOString();

      const freshDb = db.readDb();
      const idx = freshDb.campaigns.findIndex(c => c.id === campaign.id);
      if (idx !== -1) freshDb.campaigns[idx] = campaign;
      db.writeDb(freshDb);

      if (this.io) this.io.emit('campaign:update', campaign);
      console.log(`✅ [DIFUSIÓN WHATSAPP] Campaña "${campaign.name}" completada (${campaign.sentCount} enviados, ${campaign.failedCount} fallidos).`);
    })();

    return campaign;
  }

  /**
   * Planificador en segundo plano que revisa campañas programadas cada 30 segundos
   */
  startScheduler() {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    this.schedulerInterval = setInterval(() => {
      try {
        const dbData = db.readDb();
        const campaigns = dbData.campaigns || [];
        const now = Date.now();

        const pendingScheduled = campaigns.filter(c => 
          c.status === 'scheduled' && 
          c.scheduledAt && 
          new Date(c.scheduledAt).getTime() <= now
        );

        for (const camp of pendingScheduled) {
          console.log(`⏰ [PROGRAMADOR DE DIFUSIONES] Disparando campaña programada "${camp.name}"...`);
          this.executeCampaign(camp.id);
        }
      } catch (err) {
        console.error('Error en planificador de difusiones:', err);
      }
    }, 30000);
  }
}

export const broadcastService = new BroadcastService();
