import express from 'express';
import { apiKeyService } from '../services/apiKeyService.js';
import { mcpToolsService } from '../services/mcpToolsService.js';
import { createMcpServerInstance } from '../services/mcpServer.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Middleware de autenticación por API Key
export function requireApiKey(req, res, next) {
  const headerKey = req.headers['x-api-key'] || req.headers['authorization'];
  const queryKey = req.query.apiKey || req.query.key;
  const keyToValidate = headerKey || queryKey;

  if (!keyToValidate) {
    return res.status(401).json({
      error: 'Acceso no autorizado',
      message: 'Debe proveer una clave de API válida mediante el header "X-API-Key", "Authorization: Bearer <token>" o parámetro "?apiKey="'
    });
  }

  const valid = apiKeyService.validateKey(keyToValidate);
  if (!valid) {
    return res.status(403).json({
      error: 'Clave de API inválida o revocada',
      message: 'La clave proporcionada no existe o ha sido desactivada en el panel de WAgent'
    });
  }

  req.apiKey = valid;
  next();
}

export function createExternalApiRouter() {
  const router = express.Router();

  // =========================================================================
  // 1. ENDPOINTS PÚBLICOS DE INFORMACIÓN / SALUD
  // =========================================================================
  router.get('/health', (req, res) => {
    res.json({
      status: 'online',
      service: 'WAgent Carnicería External REST API & MCP',
      version: '1.3.3',
      timestamp: new Date().toISOString()
    });
  });

  // =========================================================================
  // 2. GESTIÓN DE CLAVES API (Para el panel de administración web)
  // =========================================================================
  router.get('/keys', (req, res) => {
    try {
      const keys = apiKeyService.getAllKeys();
      res.json({ success: true, keys });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/keys', (req, res) => {
    try {
      const { name, permissions, createdBy } = req.body || {};
      const newKey = apiKeyService.createKey({ name, permissions, createdBy });
      res.json({ success: true, key: newKey });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.patch('/keys/:id/toggle', (req, res) => {
    try {
      const updated = apiKeyService.toggleKey(req.params.id);
      if (!updated) return res.status(404).json({ success: false, error: 'Clave no encontrada' });
      res.json({ success: true, key: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/keys/:id', (req, res) => {
    try {
      const ok = apiKeyService.deleteKey(req.params.id);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // 3. REST API EXTERNA PARA CONSULTA DE DATOS (PROTEGIDA CON API KEY)
  // =========================================================================
  router.get('/summary', requireApiKey, async (req, res) => {
    try {
      const summary = await mcpToolsService.getSystemSummary();
      res.json({ success: true, ...summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/products', requireApiKey, async (req, res) => {
    try {
      const { query, category, minPrice, maxPrice, limit } = req.query;
      const products = await mcpToolsService.getProducts({
        query,
        category,
        minPrice: minPrice ? Number(minPrice) : 0,
        maxPrice: maxPrice ? Number(maxPrice) : Infinity,
        limit: limit ? Number(limit) : 100
      });
      res.json({ success: true, count: products.length, products });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/stock', requireApiKey, async (req, res) => {
    try {
      const { branchId, productId, lowStockOnly } = req.query;
      const stock = await mcpToolsService.getStock({
        branchId,
        productId,
        lowStockOnly: lowStockOnly === 'true' || lowStockOnly === '1'
      });
      res.json({ success: true, stock });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/orders', requireApiKey, async (req, res) => {
    try {
      const { status, phone, date, branchId, limit } = req.query;
      const orders = await mcpToolsService.getOrders({
        status,
        phone,
        date,
        branchId,
        limit: limit ? Number(limit) : 50
      });
      res.json({ success: true, count: orders.length, orders });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/orders/:id', requireApiKey, async (req, res) => {
    try {
      const order = await mcpToolsService.getOrderDetails(req.params.id);
      if (!order) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
      res.json({ success: true, order });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/orders', requireApiKey, async (req, res) => {
    try {
      const created = await mcpToolsService.createOrder(req.body);
      res.status(201).json({ success: true, order: created });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.get('/users', requireApiKey, async (req, res) => {
    try {
      const { query, limit } = req.query;
      const users = await mcpToolsService.getUsers({
        query,
        limit: limit ? Number(limit) : 100
      });
      res.json({ success: true, count: users.length, users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/branches', requireApiKey, async (req, res) => {
    try {
      const branches = await mcpToolsService.getBranches();
      res.json({ success: true, count: branches.length, branches });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/transfers', requireApiKey, async (req, res) => {
    try {
      const { status, fromBranchId, toBranchId } = req.query;
      const transfers = await mcpToolsService.getTransfers({ status, fromBranchId, toBranchId });
      res.json({ success: true, count: transfers.length, transfers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/suppliers', requireApiKey, async (req, res) => {
    try {
      const data = await mcpToolsService.getSuppliersAndInvoices();
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// =========================================================================
// 4. MCP OVER HTTP (SSE TRANSPORT) HANDLER
// =========================================================================
// Mapeo en memoria de sesiones activas de SSE para el protocolo MCP
const mcpSessions = new Map();

export function setupMcpHttpEndpoints(app) {
  // GET /mcp/sse: Conecta el flujo de eventos SSE del protocolo MCP
  app.get('/mcp/sse', requireApiKey, async (req, res) => {
    try {
      // Desactivar buffering en proxies reversos (Nginx, Hostinger CDN, Cloudflare)
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache, no-transform');

      // Crear instancia de servidor MCP dedicada para esta conexión SSE
      const mcpServer = createMcpServerInstance();
      const transport = new SSEServerTransport('/mcp/messages', res);

      const sessionId = transport.sessionId;
      mcpSessions.set(sessionId, { mcpServer, transport });

      // Ping periódico para mantener vivo el socket HTTP/2 en CDN (Hostinger / Cloudflare)
      const keepAliveTimer = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch (_) {}
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAliveTimer);
        // Período de gracia para permitir procesar respuestas POST en tránsito
        setTimeout(() => {
          mcpSessions.delete(sessionId);
        }, 30000);
      });

      await mcpServer.connect(transport);
    } catch (err) {
      console.error('❌ [MCP SSE] Error al conectar cliente SSE:', err);
      if (!res.headersSent) {
        res.status(500).send('Error iniciando conexión MCP SSE');
      }
    }
  });

  // POST /mcp/messages: Recibe peticiones JSON-RPC del cliente MCP
  app.post('/mcp/messages', requireApiKey, async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId || !mcpSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Sesión MCP no encontrada o expirada' });
    }

    try {
      const { transport } = mcpSessions.get(sessionId);
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error('❌ [MCP Messages] Error procesando mensaje:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /mcp/info: Consulta rápida del estado del servidor MCP
  app.get('/mcp/info', (req, res) => {
    res.json({
      name: 'WAgent MCP Server',
      protocolVersion: '2024-11-05',
      supportedTransports: ['sse', 'stdio'],
      sseEndpoint: '/mcp/sse',
      messagesEndpoint: '/mcp/messages',
      requiresApiKey: true,
      activeSessions: mcpSessions.size,
      documentation: 'Conectá Claude Desktop, Cursor, Antigravity o cualquier cliente MCP compatible.'
    });
  });
}
