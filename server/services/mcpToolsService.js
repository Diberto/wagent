import { db } from './database.js';
import { inventoryService } from './inventoryService.js';
import { loyaltyService } from './loyalty.js';
import { externalConnectorService } from './externalConnectorService.js';

export const mcpToolsService = {
  // 1. Resumen global del sistema
  async getSystemSummary() {
    const products = db.getProducts() || [];
    const orders = db.getOrders() || [];
    const leads = db.getLeads() || [];
    const branches = db.getBranches() || [];
    const transfers = inventoryService.getBranchTransfers() || [];
    const invoices = inventoryService.getSupplierInvoices() || [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(o => (o.createdAt || o.date || '').startsWith(todayStr));
    const pendingOrders = orders.filter(o => ['pending', 'confirmed', 'preparing', 'Pendiente', 'Confirmado'].includes(o.status));
    const allStock = inventoryService.getBranchStockOverview();
    const lowStockAlerts = allStock.filter(s => s.isLowStock);

    return {
      appName: 'WAgent Carnicería CRM & Stock',
      version: '1.3.3',
      serverTime: new Date().toISOString(),
      branchesCount: branches.length,
      branches: branches.map(b => ({ id: b.id, name: b.name, isWarehouse: b.isWarehouse, address: b.address })),
      metrics: {
        totalProducts: products.length,
        totalCustomers: leads.length,
        totalOrdersCount: orders.length,
        ordersTodayCount: todayOrders.length,
        ordersPendingCount: pendingOrders.length,
        pendingTransfersCount: transfers.filter(t => t.status === 'in_transit').length,
        totalInvoicesRecorded: invoices.length,
        lowStockItemsAlertCount: lowStockAlerts.length
      }
    };
  },

  // 2. Consulta de Productos del Catálogo
  async getProducts({ query = '', category = '', minPrice = 0, maxPrice = Infinity, limit = 100 } = {}) {
    let products = db.getProducts() || [];
    if (query) {
      const q = String(query).toLowerCase().trim();
      products = products.filter(p => 
        (p.name || '').toLowerCase().includes(q) || 
        (p.plu || '').includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    if (category && category !== 'all') {
      const cat = String(category).toLowerCase();
      products = products.filter(p => (p.category || '').toLowerCase() === cat);
    }
    if (minPrice > 0) {
      products = products.filter(p => Number(p.price || 0) >= minPrice);
    }
    if (maxPrice < Infinity) {
      products = products.filter(p => Number(p.price || 0) <= maxPrice);
    }
    return products.slice(0, Number(limit) || 100).map(p => ({
      id: p.id,
      name: p.name,
      plu: p.plu || '',
      price: Number(p.price || 0),
      category: p.category || 'General',
      unit: p.unit || 'kg',
      inStock: p.inStock !== false,
      featured: !!p.featured
    }));
  },

  // 3. Consulta de Stock en Cámaras y Sucursales
  async getStock({ branchId = '', productId = '', lowStockOnly = false } = {}) {
    const branches = db.getBranches() || [];
    const targetBranches = branchId ? branches.filter(b => b.id === branchId) : branches;

    let results = [];
    for (const branch of targetBranches) {
      let stockList = inventoryService.getBranchStockOverview(branch.id) || [];
      if (productId) {
        stockList = stockList.filter(s => s.id === productId || s.plu === productId);
      }
      if (lowStockOnly) {
        stockList = stockList.filter(s => s.isLowStock);
      }
      results.push({
        branchId: branch.id,
        branchName: branch.name,
        isWarehouse: !!branch.isWarehouse,
        totalCutsInStock: stockList.length,
        totalKg: stockList.reduce((sum, s) => sum + (Number(s.currentStock) || 0), 0),
        items: stockList.map(s => ({
          productId: s.id,
          productName: s.name,
          plu: s.plu || '',
          quantity: Number(s.currentStock || 0),
          unit: s.unit || 'kg',
          minStock: s.minStockAlert || 10,
          isLowStock: !!s.isLowStock,
          price: s.price
        }))
      });
    }

    return results;
  },

  // 4. Consulta de Pedidos
  async getOrders({ status = '', phone = '', date = '', branchId = '', limit = 50 } = {}) {
    let orders = db.getOrders() || [];
    if (status) {
      const s = String(status).toLowerCase();
      orders = orders.filter(o => (o.status || '').toLowerCase() === s);
    }
    if (phone) {
      const p = String(phone).replace(/\D/g, '');
      orders = orders.filter(o => String(o.phone || '').replace(/\D/g, '').includes(p));
    }
    if (date) {
      orders = orders.filter(o => (o.createdAt || o.date || '').startsWith(date));
    }
    if (branchId) {
      orders = orders.filter(o => o.branchId === branchId || (o.branch || '').includes(branchId));
    }

    return orders.slice(0, Number(limit) || 50).map(o => ({
      id: o.id,
      sequenceNumber: o.sequenceNumber || o.orderNumber || o.id,
      customerName: o.customerName || o.clientName || o.name || 'Cliente',
      phone: o.phone || '',
      deliveryType: o.deliveryType || 'delivery',
      branch: o.branch || o.branchName || '',
      address: o.address || '',
      paymentMethod: o.paymentMethod || 'Efectivo',
      status: o.status || 'pending',
      totalAmount: Number(o.total || o.totalAmount || 0),
      itemsCount: Array.isArray(o.items) ? o.items.length : 0,
      items: o.items || [],
      createdAt: o.createdAt || o.date
    }));
  },

  // 5. Detalle de Pedido individual
  async getOrderDetails(orderIdOrSequence) {
    const orders = db.getOrders() || [];
    const found = orders.find(o => 
      o.id === orderIdOrSequence || 
      String(o.sequenceNumber) === String(orderIdOrSequence) ||
      String(o.orderNumber) === String(orderIdOrSequence)
    );
    if (!found) return null;
    return found;
  },

  // 6. Consulta de Clientes & Contactos
  async getUsers({ query = '', limit = 100 } = {}) {
    const leads = db.getLeads() || [];
    const loyaltyList = loyaltyService.getAllCustomers ? loyaltyService.getAllCustomers() : [];
    
    let filtered = leads;
    if (query) {
      const q = String(query).toLowerCase().trim();
      filtered = filtered.filter(l => 
        (l.name || '').toLowerCase().includes(q) || 
        (l.phone || '').includes(q) ||
        (l.jid || '').includes(q)
      );
    }

    return filtered.slice(0, Number(limit) || 100).map(l => {
      const loyalty = loyaltyList.find(c => c.phone === l.phone || c.id === l.id);
      return {
        id: l.id,
        name: l.name || 'Sin Nombre',
        phone: l.phone || l.jid || '',
        address: l.address || '',
        tags: l.tags || [],
        loyaltyPoints: loyalty?.points || 0,
        loyaltyTier: loyalty?.tier || 'Estándar',
        totalOrders: loyalty?.ordersCount || 0,
        lastInteraction: l.lastMessageAt || l.updatedAt || l.createdAt
      };
    });
  },

  // 7. Sucursales de Carnicería
  async getBranches() {
    return db.getBranches() || [];
  },

  // 8. Traspasos entre Sucursales
  async getTransfers({ status = '', fromBranchId = '', toBranchId = '' } = {}) {
    return inventoryService.getBranchTransfers({ status, fromBranchId, toBranchId });
  },

  // 9. Proveedores & Facturas de Frigoríficos
  async getSuppliersAndInvoices() {
    const suppliers = inventoryService.getSuppliers() || [];
    const invoices = inventoryService.getSupplierInvoices() || [];
    return {
      suppliersCount: suppliers.length,
      suppliers,
      invoicesCount: invoices.length,
      recentInvoices: invoices.slice(0, 50)
    };
  },

  // 10. Crear Pedido desde Sistema Externo / Agente
  async createOrder({ customerName, phone, deliveryType = 'delivery', address = '', branchId = '', paymentMethod = 'Efectivo', items = [], notes = '' }) {
    if (!customerName || !phone) {
      throw new Error('customerName y phone son campos obligatorios');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('El pedido debe incluir al menos un ítem');
    }

    const calculatedTotal = items.reduce((sum, it) => sum + (Number(it.totalPrice) || (Number(it.quantity || 1) * Number(it.unitPrice || 0))), 0);

    const orderPayload = {
      id: `ord-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      customerName,
      phone,
      deliveryType,
      address,
      branch: branchId,
      branchId,
      paymentMethod,
      items,
      total: calculatedTotal,
      status: 'pending',
      notes,
      source: 'external_api_mcp',
      createdAt: new Date().toISOString()
    };

    const saved = db.saveOrder ? db.saveOrder(orderPayload) : orderPayload;
    if (db.emitChange) {
      db.emitChange('orders:updated', db.getOrders ? db.getOrders() : [saved]);
    }
    
    // Despacho asíncrono de webhooks hacia sistemas externos conectados
    externalConnectorService.dispatchWebhooks('order.created', saved).catch(e => {
      console.warn('[Webhook Order Created Warning]:', e.message);
    });

    return saved;
  }
};
