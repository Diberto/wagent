import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { db } from './database.js';
import { inventoryService } from './inventoryService.js';
import { CONFIG } from '../config/index.js';

const CONNECTORS_FILE = path.join(CONFIG.DATA_DIR || './data', 'external_connectors.json');
const LOGS_FILE = path.join(CONFIG.DATA_DIR || './data', 'connector_logs.json');

class ExternalConnectorService {
  constructor() {
    this.connectors = [];
    this.logs = [];
    this.io = null;
    this.syncTimers = new Map();
    this.init();
  }

  setIo(io) {
    this.io = io;
  }

  emit(event, data) {
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit(event, data);
      } catch (e) {
        console.warn('[ExternalConnectorService] Error emitiendo socket:', e.message);
      }
    }
  }

  init() {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR || './data')) {
        fs.mkdirSync(CONFIG.DATA_DIR || './data', { recursive: true });
      }

      if (fs.existsSync(CONNECTORS_FILE)) {
        const raw = fs.readFileSync(CONNECTORS_FILE, 'utf8');
        this.connectors = JSON.parse(raw);
      } else {
        // Conectores de ejemplo iniciales (REST y MCP)
        this.connectors = [
          {
            id: 'conn-erp-rest',
            name: 'ERP Tango / SAP Frigorífico Central',
            type: 'rest',
            enabled: true,
            description: 'Conexión bidireccional con el sistema de gestión central de compras y stock.',
            baseUrl: 'https://api-demo.frigorificocentral.com/v1',
            authType: 'apiKey',
            apiKeyHeader: 'X-API-Key',
            authToken: 'frigo_live_9a8b7c6d5e4f3a2b1c',
            webhookUrl: 'https://api-demo.frigorificocentral.com/v1/webhooks/wagent',
            syncCatalog: true,
            syncStock: true,
            syncOrders: true,
            syncDirection: 'bidirectional',
            webhooks: ['order.created', 'stock.updated', 'invoice.scanned'],
            autoSyncIntervalMinutes: 15,
            lastSyncAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            lastSyncStatus: 'idle',
            lastSyncMessage: 'Listo para sincronizar',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'conn-external-mcp',
            name: 'Servidor MCP Agente Remoto (Antigravity/Claude)',
            type: 'mcp_sse',
            enabled: true,
            description: 'Conexión a un servidor MCP externo que expone herramientas de facturación, auditoría y catálogos.',
            sseUrl: 'http://localhost:3001/mcp/sse',
            customHeaders: {
              'X-Custom-Agent': 'WAgent-Bridge'
            },
            syncCatalog: false,
            syncStock: false,
            syncOrders: true,
            syncDirection: 'outbound',
            webhooks: ['order.created'],
            autoSyncIntervalMinutes: 0,
            discoveredMcpTools: [],
            lastSyncAt: null,
            lastSyncStatus: 'idle',
            lastSyncMessage: 'Listo para conectar vía MCP SSE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        this.saveConnectors();
      }

      if (fs.existsSync(LOGS_FILE)) {
        const raw = fs.readFileSync(LOGS_FILE, 'utf8');
        this.logs = JSON.parse(raw);
      } else {
        this.logs = [];
        this.saveLogs();
      }

      this.scheduleAllSyncs();
    } catch (err) {
      console.error('[ExternalConnectorService] Error inicializando conectores:', err);
    }
  }

  saveConnectors() {
    try {
      fs.writeFileSync(CONNECTORS_FILE, JSON.stringify(this.connectors, null, 2), 'utf8');
      this.emit('connectors:updated', this.connectors);
    } catch (e) {
      console.error('[ExternalConnectorService] Error guardando conectores:', e);
    }
  }

  saveLogs() {
    try {
      if (this.logs.length > 500) {
        this.logs = this.logs.slice(0, 500);
      }
      fs.writeFileSync(LOGS_FILE, JSON.stringify(this.logs, null, 2), 'utf8');
      this.emit('connectors:logs_updated', this.logs.slice(0, 50));
    } catch (e) {
      console.error('[ExternalConnectorService] Error guardando logs:', e);
    }
  }

  addLog(entry) {
    const logItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.logs.unshift(logItem);
    this.saveLogs();
    return logItem;
  }

  getLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }

  // ==========================================
  // CRUD CONECTORES
  // ==========================================
  getConnectors() {
    return this.connectors;
  }

  getConnector(id) {
    return this.connectors.find(c => c.id === id);
  }

  createConnector(data) {
    const newConnector = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name || 'Nuevo Conector Externo',
      type: data.type || 'rest', // 'rest' | 'mcp_sse' | 'mcp_stdio'
      enabled: data.enabled !== false,
      description: data.description || '',
      baseUrl: (data.baseUrl || '').trim(),
      authType: data.authType || 'none', // 'none' | 'apiKey' | 'bearer' | 'basic'
      apiKeyHeader: data.apiKeyHeader || 'X-API-Key',
      authToken: data.authToken || '',
      webhookUrl: (data.webhookUrl || '').trim(),
      customHeaders: data.customHeaders || {},
      sseUrl: (data.sseUrl || '').trim(),
      command: data.command || '',
      args: Array.isArray(data.args) ? data.args : [],
      syncCatalog: Boolean(data.syncCatalog),
      syncStock: Boolean(data.syncStock),
      syncOrders: Boolean(data.syncOrders),
      syncDirection: data.syncDirection || 'bidirectional',
      webhooks: Array.isArray(data.webhooks) ? data.webhooks : ['order.created'],
      autoSyncIntervalMinutes: Number(data.autoSyncIntervalMinutes) || 0,
      discoveredMcpTools: [],
      lastSyncAt: null,
      lastSyncStatus: 'idle',
      lastSyncMessage: 'Recién configurado',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.connectors.push(newConnector);
    this.saveConnectors();
    this.scheduleSync(newConnector);
    return newConnector;
  }

  updateConnector(id, data) {
    const idx = this.connectors.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Conector no encontrado');

    const updated = {
      ...this.connectors[idx],
      ...data,
      id, // preservar ID
      updatedAt: new Date().toISOString()
    };

    this.connectors[idx] = updated;
    this.saveConnectors();
    this.scheduleSync(updated);
    return updated;
  }

  deleteConnector(id) {
    const idx = this.connectors.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Conector no encontrado');

    this.clearSyncTimer(id);
    const removed = this.connectors.splice(idx, 1)[0];
    this.saveConnectors();
    return removed;
  }

  // ==========================================
  // CLIENTE MCP: CONEXIÓN & DESCUBRIMIENTO
  // ==========================================
  async createMcpClientForConnector(connector) {
    let transport;

    if (connector.type === 'mcp_sse') {
      if (!connector.sseUrl) {
        throw new Error('La URL SSE del servidor MCP es requerida');
      }
      const headers = { ...connector.customHeaders };
      if (connector.authToken) {
        if (connector.authType === 'bearer') headers['Authorization'] = `Bearer ${connector.authToken}`;
        else headers[connector.apiKeyHeader || 'X-API-Key'] = connector.authToken;
      }
      transport = new SSEClientTransport(new URL(connector.sseUrl), {
        eventSourceInit: {
          headers
        },
        requestInit: {
          headers
        }
      });
    } else if (connector.type === 'mcp_stdio') {
      if (!connector.command) {
        throw new Error('El comando del proceso MCP Stdio es requerido');
      }
      transport = new StdioClientTransport({
        command: connector.command,
        args: connector.args || []
      });
    } else {
      throw new Error(`El conector tipo ${connector.type} no es un servidor MCP`);
    }

    const client = new Client(
      {
        name: 'wagent-mcp-client',
        version: '1.3.3'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    await client.connect(transport);
    return { client, transport };
  }

  // ==========================================
  // TEST DE CONECTIVIDAD
  // ==========================================
  async testConnection(id) {
    const conn = this.getConnector(id);
    if (!conn) throw new Error('Conector no encontrado');

    const startTime = Date.now();
    try {
      if (conn.type === 'rest') {
        const headers = this.buildHeaders(conn);
        const testUrl = conn.baseUrl.endsWith('/') ? `${conn.baseUrl}health` : `${conn.baseUrl}/health`;
        
        let res;
        try {
          res = await fetch(testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        } catch {
          // Si /health falla, probar GET a la base url
          res = await fetch(conn.baseUrl, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        }

        const latencyMs = Date.now() - startTime;
        let responseBody = null;
        try {
          responseBody = await res.json();
        } catch {
          responseBody = { status: res.status, statusText: res.statusText };
        }

        this.addLog({
          connectorId: conn.id,
          connectorName: conn.name,
          type: 'rest_ping',
          status: res.ok ? 'success' : 'warning',
          latencyMs,
          message: `Test REST completado con código HTTP ${res.status}`,
          details: responseBody
        });

        conn.lastSyncAt = new Date().toISOString();
        conn.lastSyncStatus = res.ok ? 'success' : 'error';
        conn.lastSyncMessage = `Conexión verificada (${res.status} ${res.statusText} en ${latencyMs}ms)`;
        this.saveConnectors();

        return {
          success: res.ok,
          status: res.status,
          statusText: res.statusText,
          latencyMs,
          data: responseBody
        };

      } else if (conn.type === 'mcp_sse' || conn.type === 'mcp_stdio') {
        const { client, transport } = await this.createMcpClientForConnector(conn);
        let toolsResult;
        try {
          toolsResult = await client.listTools();
        } finally {
          try {
            if (typeof transport.close === 'function') await transport.close();
          } catch {}
        }

        const latencyMs = Date.now() - startTime;
        const tools = toolsResult?.tools || [];

        conn.discoveredMcpTools = tools;
        conn.lastSyncAt = new Date().toISOString();
        conn.lastSyncStatus = 'success';
        conn.lastSyncMessage = `MCP Conectado: ${tools.length} herramientas descubiertas (${latencyMs}ms)`;
        this.saveConnectors();

        this.addLog({
          connectorId: conn.id,
          connectorName: conn.name,
          type: 'mcp_handshake',
          status: 'success',
          latencyMs,
          message: `Servidor MCP respondió con ${tools.length} herramientas`,
          details: { toolsCount: tools.length, tools: tools.map(t => t.name) }
        });

        return {
          success: true,
          toolsCount: tools.length,
          tools,
          latencyMs
        };
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      conn.lastSyncStatus = 'error';
      conn.lastSyncMessage = `Fallo de conexión: ${err.message}`;
      this.saveConnectors();

      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'test_error',
        status: 'error',
        latencyMs,
        message: err.message
      });

      return {
        success: false,
        error: err.message,
        latencyMs
      };
    }
  }

  // ==========================================
  // EJECUCIÓN DINÁMICA DE HERRAMIENTA MCP REMOTA
  // ==========================================
  async callMcpTool(connectorId, toolName, args = {}) {
    const conn = this.getConnector(connectorId);
    if (!conn) throw new Error('Conector no encontrado');
    if (conn.type !== 'mcp_sse' && conn.type !== 'mcp_stdio') {
      throw new Error('El conector seleccionado no es de tipo MCP');
    }

    const startTime = Date.now();
    const { client, transport } = await this.createMcpClientForConnector(conn);

    try {
      const response = await client.callTool({
        name: toolName,
        arguments: args
      });

      const latencyMs = Date.now() - startTime;
      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'mcp_call_tool',
        status: 'success',
        latencyMs,
        message: `Herramienta remota '${toolName}' ejecutada`,
        details: { args, response }
      });

      return {
        success: true,
        toolName,
        latencyMs,
        response
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'mcp_call_tool_error',
        status: 'error',
        latencyMs,
        message: `Error ejecutando herramienta '${toolName}': ${err.message}`,
        details: { args }
      });
      throw err;
    } finally {
      try {
        if (typeof transport.close === 'function') await transport.close();
      } catch {}
    }
  }

  // ==========================================
  // SINCRONIZACIÓN DE CATÁLOGO (PULL & MERGE)
  // ==========================================
  async syncPullCatalog(connectorId) {
    const conn = this.getConnector(connectorId);
    if (!conn) throw new Error('Conector no encontrado');
    const startTime = Date.now();

    try {
      let externalProducts = [];

      if (conn.type === 'rest') {
        const headers = this.buildHeaders(conn);
        const url = `${conn.baseUrl.replace(/\/$/, '')}/products`;
        const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        externalProducts = Array.isArray(data) ? data : (data.products || data.items || data.data || []);
      } else if (conn.type === 'mcp_sse' || conn.type === 'mcp_stdio') {
        const toolResult = await this.callMcpTool(connectorId, 'wagent_get_products', {});
        const content = toolResult?.response?.content?.[0]?.text;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            externalProducts = Array.isArray(parsed) ? parsed : (parsed.products || []);
          } catch {
            externalProducts = [];
          }
        }
      }

      if (!Array.isArray(externalProducts) || externalProducts.length === 0) {
        return {
          success: true,
          imported: 0,
          updated: 0,
          message: 'El sistema externo no retornó productos nuevos'
        };
      }

      const database = db.readDb();
      if (!Array.isArray(database.products)) database.products = [];

      let imported = 0;
      let updated = 0;

      for (const ep of externalProducts) {
        const plu = String(ep.plu || ep.sku || ep.code || '').trim();
        const name = String(ep.name || ep.title || ep.description || '').trim();
        if (!name) continue;

        const existing = database.products.find(p => (plu && p.plu === plu) || p.name.toLowerCase() === name.toLowerCase());

        if (existing) {
          existing.price = Number(ep.price || existing.price);
          existing.category = ep.category || existing.category || 'General';
          if (ep.unit) existing.unit = ep.unit;
          if (ep.description) existing.description = ep.description;
          existing.updatedAt = new Date().toISOString();
          updated++;
        } else {
          const newProd = {
            id: ep.id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name,
            plu: plu || '',
            category: ep.category || 'General',
            price: Number(ep.price || 0),
            unit: ep.unit || 'kg',
            description: ep.description || '',
            stock: Number(ep.stock || 0),
            isAvailable: ep.isAvailable !== false,
            source: `sync_${conn.id}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          database.products.push(newProd);
          imported++;
        }
      }

      db.writeDb(database);
      db.emitChange('catalog:updated', database.products);

      const latencyMs = Date.now() - startTime;
      conn.lastSyncAt = new Date().toISOString();
      conn.lastSyncStatus = 'success';
      conn.lastSyncMessage = `Catálogo sincronizado: ${imported} nuevos, ${updated} actualizados (${latencyMs}ms)`;
      this.saveConnectors();

      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'sync_pull_catalog',
        status: 'success',
        latencyMs,
        message: `Sincronizados ${imported} productos nuevos y ${updated} actualizados`
      });

      return {
        success: true,
        imported,
        updated,
        total: database.products.length,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      conn.lastSyncStatus = 'error';
      conn.lastSyncMessage = `Error sincronizando catálogo: ${err.message}`;
      this.saveConnectors();

      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'sync_pull_catalog_error',
        status: 'error',
        latencyMs,
        message: err.message
      });
      throw err;
    }
  }

  // ==========================================
  // ENVÍO DE PEDIDOS (PUSH ORDERS TO EXTERNAL)
  // ==========================================
  async pushOrderToExternal(connectorId, order) {
    const conn = this.getConnector(connectorId);
    if (!conn) throw new Error('Conector no encontrado');
    const startTime = Date.now();

    try {
      const payload = {
        orderId: order.id,
        sequenceNumber: order.sequenceNumber || order.orderNumber,
        customer: {
          name: order.customerName || order.name,
          phone: order.phone,
          address: order.address
        },
        deliveryType: order.deliveryType || 'delivery',
        branch: order.branch || order.branchId,
        paymentMethod: order.paymentMethod,
        total: order.total || order.totalAmount,
        status: order.status,
        items: order.items || [],
        notes: order.notes,
        createdAt: order.createdAt || new Date().toISOString(),
        sourceApp: 'WAgent-Carniceria'
      };

      let result;

      if (conn.type === 'rest') {
        const headers = this.buildHeaders(conn);
        headers['Content-Type'] = 'application/json';
        const url = `${conn.baseUrl.replace(/\/$/, '')}/orders`;

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        const data = await res.json().catch(() => ({ status: res.status }));
        if (!res.ok) {
          throw new Error(`Error en sistema externo ${res.status}: ${JSON.stringify(data)}`);
        }
        result = data;
      } else if (conn.type === 'mcp_sse' || conn.type === 'mcp_stdio') {
        result = await this.callMcpTool(connectorId, 'wagent_create_order', {
          customerName: payload.customer.name,
          phone: payload.customer.phone,
          deliveryType: payload.deliveryType,
          address: payload.customer.address,
          branchId: payload.branch,
          paymentMethod: payload.paymentMethod,
          items: payload.items,
          notes: `Enviado desde WAgent ID: ${order.id}`
        });
      }

      const latencyMs = Date.now() - startTime;
      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'push_order',
        status: 'success',
        latencyMs,
        message: `Pedido #${order.sequenceNumber || order.id} enviado con éxito al sistema externo`,
        details: { orderId: order.id, result }
      });

      return { success: true, result, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'push_order_error',
        status: 'error',
        latencyMs,
        message: `Error enviando pedido #${order.sequenceNumber || order.id}: ${err.message}`
      });
      throw err;
    }
  }

  // ==========================================
  // SINCRONIZACIÓN DE STOCK (PUSH / PULL)
  // ==========================================
  async syncPushStock(connectorId) {
    const conn = this.getConnector(connectorId);
    if (!conn) throw new Error('Conector no encontrado');
    const startTime = Date.now();

    try {
      const stockOverview = inventoryService.getBranchStockOverview();
      const payload = {
        timestamp: new Date().toISOString(),
        branchesCount: db.getBranches().length,
        stockItemsCount: stockOverview.length,
        items: stockOverview.map(s => ({
          productId: s.productId,
          name: s.productName,
          plu: s.plu,
          stockByBranch: s.stockByBranch,
          totalStock: s.totalStock,
          isLowStock: s.isLowStock
        }))
      };

      if (conn.type === 'rest') {
        const headers = this.buildHeaders(conn);
        headers['Content-Type'] = 'application/json';
        const url = `${conn.baseUrl.replace(/\/$/, '')}/stock/bulk-update`;

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
          throw new Error(`Error en sistema externo ${res.status}: ${res.statusText}`);
        }
      }

      const latencyMs = Date.now() - startTime;
      conn.lastSyncAt = new Date().toISOString();
      conn.lastSyncStatus = 'success';
      conn.lastSyncMessage = `Stock enviado: ${stockOverview.length} ítems reportados (${latencyMs}ms)`;
      this.saveConnectors();

      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'push_stock',
        status: 'success',
        latencyMs,
        message: `Stock de ${stockOverview.length} productos enviado al sistema externo`
      });

      return { success: true, count: stockOverview.length, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      conn.lastSyncStatus = 'error';
      conn.lastSyncMessage = `Error enviando stock: ${err.message}`;
      this.saveConnectors();

      this.addLog({
        connectorId: conn.id,
        connectorName: conn.name,
        type: 'push_stock_error',
        status: 'error',
        latencyMs,
        message: err.message
      });
      throw err;
    }
  }

  // ==========================================
  // DISPATCHER DE WEBHOOKS SALIENTES
  // ==========================================
  async dispatchWebhooks(eventType, payload) {
    const matchingConnectors = this.connectors.filter(c => 
      c.enabled && 
      Array.isArray(c.webhooks) && 
      c.webhooks.includes(eventType)
    );

    if (matchingConnectors.length === 0) return [];

    const results = [];
    for (const conn of matchingConnectors) {
      const targetUrl = conn.webhookUrl || (conn.baseUrl ? `${conn.baseUrl.replace(/\/$/, '')}/webhooks` : null);
      if (!targetUrl) continue;

      const bodyData = {
        event: eventType,
        timestamp: new Date().toISOString(),
        payload,
        source: 'WAgent-Carniceria'
      };

      const bodyString = JSON.stringify(bodyData);
      const signature = crypto.createHmac('sha256', conn.authToken || 'wagent_secret_key')
        .update(bodyString)
        .digest('hex');

      const headers = this.buildHeaders(conn);
      headers['Content-Type'] = 'application/json';
      headers['X-WAgent-Event'] = eventType;
      headers['X-WAgent-Signature'] = `sha256=${signature}`;

      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: bodyString,
          signal: AbortSignal.timeout(6000)
        });

        results.push({
          connectorId: conn.id,
          connectorName: conn.name,
          url: targetUrl,
          status: res.status,
          success: res.ok
        });

        this.addLog({
          connectorId: conn.id,
          connectorName: conn.name,
          type: 'webhook_dispatch',
          status: res.ok ? 'success' : 'warning',
          message: `Webhook ${eventType} despachado a ${targetUrl} (Status: ${res.status})`
        });
      } catch (err) {
        results.push({
          connectorId: conn.id,
          connectorName: conn.name,
          url: targetUrl,
          success: false,
          error: err.message
        });

        this.addLog({
          connectorId: conn.id,
          connectorName: conn.name,
          type: 'webhook_error',
          status: 'error',
          message: `Fallo entregando webhook ${eventType} a ${targetUrl}: ${err.message}`
        });
      }
    }

    return results;
  }

  // ==========================================
  // PROGRAMADOR DE TAREAS (CRON / INTERVAL)
  // ==========================================
  scheduleAllSyncs() {
    this.connectors.forEach(conn => this.scheduleSync(conn));
  }

  scheduleSync(connector) {
    this.clearSyncTimer(connector.id);
    if (!connector.enabled || !connector.autoSyncIntervalMinutes || connector.autoSyncIntervalMinutes <= 0) {
      return;
    }

    const intervalMs = connector.autoSyncIntervalMinutes * 60 * 1000;
    const timer = setInterval(async () => {
      try {
        console.log(`[ExternalConnector] Ejecutando auto-sync programado para: ${connector.name}`);
        if (connector.syncCatalog) {
          await this.syncPullCatalog(connector.id).catch(e => console.warn(`[AutoSync Catalog Error]: ${e.message}`));
        }
        if (connector.syncStock) {
          await this.syncPushStock(connector.id).catch(e => console.warn(`[AutoSync Stock Error]: ${e.message}`));
        }
      } catch (e) {
        console.warn(`[ExternalConnector] Error en timer de sync: ${e.message}`);
      }
    }, intervalMs);

    this.syncTimers.set(connector.id, timer);
  }

  clearSyncTimer(connectorId) {
    if (this.syncTimers.has(connectorId)) {
      clearInterval(this.syncTimers.get(connectorId));
      this.syncTimers.delete(connectorId);
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================
  buildHeaders(conn) {
    const headers = {
      'User-Agent': 'WAgent-Enterprise-Connector/1.3.3',
      'Accept': 'application/json',
      ...conn.customHeaders
    };

    if (conn.authToken) {
      if (conn.authType === 'bearer') {
        headers['Authorization'] = `Bearer ${conn.authToken}`;
      } else if (conn.authType === 'apiKey') {
        headers[conn.apiKeyHeader || 'X-API-Key'] = conn.authToken;
      } else if (conn.authType === 'basic') {
        headers['Authorization'] = `Basic ${Buffer.from(conn.authToken).toString('base64')}`;
      }
    }

    return headers;
  }
}

export const externalConnectorService = new ExternalConnectorService();
