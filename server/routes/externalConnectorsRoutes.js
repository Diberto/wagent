import express from 'express';
import { externalConnectorService } from '../services/externalConnectorService.js';
import { db } from '../services/database.js';

const router = express.Router();

// Listar todos los conectores externos
router.get('/', (req, res) => {
  try {
    const list = externalConnectorService.getConnectors();
    res.json({ success: true, count: list.length, connectors: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logs de sincronización y webhooks
router.get('/logs', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = externalConnectorService.getLogs(limit);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtener un conector específico
router.get('/:id', (req, res) => {
  try {
    const conn = externalConnectorService.getConnector(req.params.id);
    if (!conn) return res.status(404).json({ success: false, error: 'Conector no encontrado' });
    res.json({ success: true, connector: conn });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Crear nuevo conector (REST o MCP)
router.post('/', (req, res) => {
  try {
    const created = externalConnectorService.createConnector(req.body);
    res.status(201).json({ success: true, connector: created });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Actualizar conector existente
router.put('/:id', (req, res) => {
  try {
    const updated = externalConnectorService.updateConnector(req.params.id, req.body);
    res.json({ success: true, connector: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Eliminar conector
router.delete('/:id', (req, res) => {
  try {
    const deleted = externalConnectorService.deleteConnector(req.params.id);
    res.json({ success: true, message: 'Conector eliminado', deleted });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Probar conectividad con el sistema externo (REST ping o MCP Handshake)
router.post('/:id/test', async (req, res) => {
  try {
    const result = await externalConnectorService.testConnection(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ejecutar sincronización manual (pull-catalog, push-stock, push-order)
router.post('/:id/sync/:action', async (req, res) => {
  try {
    const { id, action } = req.params;

    if (action === 'pull-catalog') {
      const result = await externalConnectorService.syncPullCatalog(id);
      return res.json({ success: true, action, result });
    }

    if (action === 'push-stock') {
      const result = await externalConnectorService.syncPushStock(id);
      return res.json({ success: true, action, result });
    }

    if (action === 'push-order') {
      const { orderId } = req.body;
      const orders = db.getOrders ? db.getOrders() : (db.readDb().orders || []);
      const order = orders.find(o => o.id === orderId || String(o.sequenceNumber) === String(orderId)) || orders[0];
      const sampleOrder = order || {
        id: `ord-test-${Date.now()}`,
        sequenceNumber: 'TEST-1001',
        customerName: 'Cliente Prueba Externa',
        phone: '+5493512345678',
        deliveryType: 'delivery',
        address: 'Av. Colón 1500, Córdoba',
        branch: 'Casa Central',
        paymentMethod: 'Efectivo',
        total: 24500,
        status: 'pending',
        items: [
          { name: 'Costillar de Ternera', quantity: 2.5, unit: 'kg', unitPrice: 8500, totalPrice: 21250 },
          { name: 'Chorizo Criollo Especial', quantity: 0.5, unit: 'kg', unitPrice: 6500, totalPrice: 3250 }
        ],
        notes: 'Pedido de prueba sincronizado hacia sistema externo',
        createdAt: new Date().toISOString()
      };

      const result = await externalConnectorService.pushOrderToExternal(id, sampleOrder);
      return res.json({ success: true, action, result });
    }

    res.status(400).json({ success: false, error: `Acción de sincronización desconocida: ${action}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Invocar herramienta MCP remota en el otro sistema
router.post('/:id/call-tool', async (req, res) => {
  try {
    const { id } = req.params;
    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ success: false, error: 'toolName es obligatorio' });
    }

    const result = await externalConnectorService.callMcpTool(id, toolName, toolArgs || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disparar prueba de webhook manual
router.post('/webhook-test', async (req, res) => {
  try {
    const { eventType = 'order.created', sampleData = {} } = req.body;
    const dispatched = await externalConnectorService.dispatchWebhooks(eventType, {
      test: true,
      timestamp: new Date().toISOString(),
      ...sampleData
    });
    res.json({ success: true, dispatchedCount: dispatched.length, results: dispatched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
