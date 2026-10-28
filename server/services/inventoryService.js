import { db } from './database.js';

export class InventoryService {
  constructor() {
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  emit(event, data) {
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit(event, data);
      } catch (err) {
        console.warn('[InventoryService] Error emitiendo socket:', err.message);
      }
    }
  }

  // ==========================================
  // 1. GESTIÓN DE PROVEEDORES
  // ==========================================
  getSuppliers() {
    const database = db.readDb();
    if (!Array.isArray(database.suppliers)) {
      database.suppliers = [
        {
          id: 'sup-1',
          name: 'Frigorífico Logros S.A.',
          cuit: '30-70812345-8',
          phone: '+54 9 351 511-2233',
          email: 'ventas@frigorificologros.com.ar',
          address: 'Ruta 9 Km 695, Río Segundo, Córdoba',
          category: 'Carne Vacuna',
          paymentTerms: 'Cuenta Corriente 15 días',
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'sup-2',
          name: 'Distribuidora Porcina Central',
          cuit: '30-71239874-2',
          phone: '+54 9 351 644-8899',
          email: 'pedidos@porcinoscentral.com.ar',
          address: 'Mercado de Abasto Córdoba Nave 3',
          category: 'Cortes Porcinos',
          paymentTerms: 'Contado Contraentrega',
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'sup-3',
          name: 'Avícola Sierras Chicas',
          cuit: '30-68994411-5',
          phone: '+54 9 351 477-0011',
          email: 'contacto@avicolasierras.com.ar',
          address: 'Av. San Martín 2450, Unquillo',
          category: 'Pollo y Derivados',
          paymentTerms: 'Transferencia 7 días',
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ];
      db.writeDb(database);
    }
    return database.suppliers;
  }

  getSupplier(id) {
    const suppliers = this.getSuppliers();
    return suppliers.find(s => s.id === id) || null;
  }

  saveSupplier(data) {
    const database = db.readDb();
    if (!Array.isArray(database.suppliers)) database.suppliers = [];

    const id = data.id || `sup-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const supplier = {
      id,
      name: data.name || 'Nuevo Proveedor',
      cuit: data.cuit ? String(data.cuit).trim() : '',
      phone: data.phone ? String(data.phone).trim() : '',
      email: data.email ? String(data.email).trim() : '',
      address: data.address || '',
      category: data.category || 'General',
      paymentTerms: data.paymentTerms || 'Contado',
      notes: data.notes || '',
      isActive: data.isActive !== false,
      updatedAt: new Date().toISOString()
    };

    const idx = database.suppliers.findIndex(s => s.id === id);
    if (idx >= 0) {
      database.suppliers[idx] = { ...database.suppliers[idx], ...supplier };
    } else {
      supplier.createdAt = new Date().toISOString();
      database.suppliers.unshift(supplier);
    }

    db.writeDb(database);
    this.emit('suppliers:sync', database.suppliers);
    return supplier;
  }

  deleteSupplier(id) {
    const database = db.readDb();
    if (!Array.isArray(database.suppliers)) return false;
    database.suppliers = database.suppliers.filter(s => s.id !== id);
    db.writeDb(database);
    this.emit('suppliers:sync', database.suppliers);
    return true;
  }

  /**
   * Busca un proveedor existente por CUIT o por coincidencia de nombre (normalizado o por palabras clave).
   * Si no existe, lo agrega automáticamente al sistema y lo asocia de inmediato.
   */
  findOrCreateSupplier({
    name = '',
    cuit = '',
    category = 'General',
    paymentTerms = 'Cuenta Corriente',
    phone = '',
    email = '',
    address = '',
    notes = ''
  } = {}) {
    const suppliers = this.getSuppliers();
    const cleanName = String(name || '').trim();
    const cleanCuit = String(cuit || '').replace(/\D/g, '');

    const isGeneric = !cleanName || 
      /^(proveedor\s*(general|de\s*grupo|desconocido)?|ticket|factura|comprobante|recibo|sin\s*nombre)$/i.test(cleanName);

    let matched = null;

    // 1. Coincidencia por CUIT si se cuenta con él
    if (cleanCuit && cleanCuit.length >= 10) {
      matched = suppliers.find(s => {
        const sCuit = String(s.cuit || '').replace(/\D/g, '');
        return sCuit && sCuit === cleanCuit;
      });
    }

    // 2. Coincidencia por nombre (normalizado o por tokens)
    if (!matched && cleanName && !isGeneric) {
      const normalize = (str) => String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/gi, '')
        .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|distribuidora|frigorifico|avicola|carnes?|almacen)\b/g, '')
        .trim();

      const targetNorm = normalize(cleanName);

      if (targetNorm.length >= 3) {
        matched = suppliers.find(s => {
          const sNorm = normalize(s.name);
          if (!sNorm || sNorm.length < 3) return false;
          if (sNorm === targetNorm) return true;
          if (sNorm.includes(targetNorm) || targetNorm.includes(sNorm)) return true;

          const targetTokens = targetNorm.split(/\s+/).filter(t => t.length >= 4);
          const sTokens = sNorm.split(/\s+/).filter(t => t.length >= 4);
          const common = targetTokens.filter(t => sTokens.includes(t));
          return common.length > 0 && common.length >= Math.min(targetTokens.length, sTokens.length);
        });
      }
    }

    // Si ya existe el proveedor
    if (matched) {
      let needsUpdate = false;
      if (cuit && !matched.cuit) {
        matched.cuit = String(cuit).trim();
        needsUpdate = true;
      }
      if (category && category !== 'General' && (!matched.category || matched.category === 'General')) {
        matched.category = category;
        needsUpdate = true;
      }
      if (needsUpdate) {
        this.saveSupplier(matched);
      }
      return {
        id: matched.id,
        name: matched.name,
        isNew: false,
        supplier: matched
      };
    }

    // Si NO existe y el nombre es válido, agregarlo automáticamente al sistema
    if (!isGeneric && cleanName.length >= 2) {
      const created = this.saveSupplier({
        name: cleanName,
        cuit: cuit ? String(cuit).trim() : '',
        category: category || 'General',
        paymentTerms: paymentTerms || 'Cuenta Corriente',
        phone: phone || '',
        email: email || '',
        address: address || '',
        notes: notes || 'Proveedor agregado automáticamente al detectar comprobante',
        isActive: true
      });
      console.log(`✨ [InventoryService] Proveedor detectado y agregado automáticamente: "${created.name}" (ID: ${created.id})`);
      return {
        id: created.id,
        name: created.name,
        isNew: true,
        supplier: created
      };
    }

    return {
      id: null,
      name: cleanName || 'Proveedor General',
      isNew: false,
      supplier: null
    };
  }

  // ==========================================
  // 2. STOCK MULTI-SUCURSAL & MOVIMIENTOS
  // ==========================================
  getBranchStockOverview(branchId = null) {
    const database = db.readDb();
    const products = db.getProducts();
    const branches = db.getBranches();

    return products.map(prod => {
      const stockByBranch = prod.stockByBranch || {};
      let totalStock = 0;
      branches.forEach(b => {
        totalStock += Number(stockByBranch[b.id] ?? 0);
      });

      // Si no tiene stock por sucursal especificado aún, inicializar distribuido o con prod.stock
      if (Object.keys(stockByBranch).length === 0 && prod.stock !== undefined) {
        totalStock = Number(prod.stock) || 0;
      }

      const branchStock = branchId ? Number(stockByBranch[branchId] ?? 0) : totalStock;
      const minStockAlert = Number(prod.minStockAlert || 10);
      const isLowStock = branchStock <= minStockAlert;

      return {
        id: prod.id,
        plu: prod.plu,
        sku: prod.sku,
        barcode: prod.barcode,
        name: prod.name,
        category: prod.category,
        unit: prod.unit || 'kg',
        price: prod.price,
        stockByBranch,
        totalStock,
        currentStock: branchStock,
        minStockAlert,
        isLowStock,
        isAvailable: prod.isAvailable !== false
      };
    });
  }

  adjustStock({ productId, branchId, quantity, type = 'manual_adjustment', reason = '', cost = 0, referenceId = null, user = 'Admin' }) {
    const database = db.readDb();
    if (!Array.isArray(database.products)) return null;

    const prod = database.products.find(p => p.id === productId || p.plu === productId);
    if (!prod) return null;

    if (!prod.stockByBranch) prod.stockByBranch = {};
    const branches = db.getBranches();
    const targetBranchId = branchId || (branches[0] ? branches[0].id : 'br-1');

    const previousStock = Number(prod.stockByBranch[targetBranchId] ?? prod.stock ?? 0);
    let newStock = previousStock;
    const qtyNum = Number(quantity);

    if (type === 'set_absolute') {
      newStock = Math.max(0, qtyNum);
    } else {
      newStock = Math.max(0, previousStock + qtyNum);
    }

    prod.stockByBranch[targetBranchId] = Number(newStock.toFixed(3));

    // Recalcular stock total consolidado
    let consolidated = 0;
    branches.forEach(b => {
      consolidated += Number(prod.stockByBranch[b.id] ?? 0);
    });
    prod.stock = Number(consolidated.toFixed(3));
    prod.stockQuantity = prod.stock;
    prod.updatedAt = new Date().toISOString();

    // Registrar auditoría de movimiento de stock
    if (!Array.isArray(database.stockMovements)) database.stockMovements = [];
    const movement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: prod.id,
      productName: prod.name,
      plu: prod.plu,
      branchId: targetBranchId,
      branchName: branches.find(b => b.id === targetBranchId)?.name || targetBranchId,
      delta: type === 'set_absolute' ? (newStock - previousStock) : qtyNum,
      previousStock,
      newStock,
      type, // 'purchase_invoice' | 'transfer_in' | 'transfer_out' | 'sale_pos' | 'sale_whatsapp' | 'manual_adjustment' | 'spoilage_waste'
      reason,
      cost: Number(cost) || 0,
      referenceId,
      user,
      createdAt: new Date().toISOString()
    };
    database.stockMovements.unshift(movement);

    // Mantener los últimos 2000 movimientos
    if (database.stockMovements.length > 2000) {
      database.stockMovements = database.stockMovements.slice(0, 2000);
    }

    db.writeDb(database);
    this.emit('stock:updated', { product: prod, movement });
    this.emit('catalog:updated', database.products);

    return { product: prod, movement };
  }

  getStockMovements(filter = {}) {
    const database = db.readDb();
    let list = Array.isArray(database.stockMovements) ? database.stockMovements : [];

    if (filter.branchId) {
      list = list.filter(m => m.branchId === filter.branchId);
    }
    if (filter.productId) {
      list = list.filter(m => m.productId === filter.productId || m.plu === filter.productId);
    }
    if (filter.type) {
      list = list.filter(m => m.type === filter.type);
    }

    return list.slice(0, filter.limit || 200);
  }

  // ==========================================
  // 3. TRASPASOS DE MERCADERÍA INTER-SUCURSAL
  // ==========================================
  getBranchTransfers(filter = {}) {
    const database = db.readDb();
    if (!Array.isArray(database.branchTransfers)) {
      database.branchTransfers = [];
    }
    let list = database.branchTransfers;

    if (filter.fromBranchId) {
      list = list.filter(t => t.fromBranchId === filter.fromBranchId);
    }
    if (filter.toBranchId) {
      list = list.filter(t => t.toBranchId === filter.toBranchId);
    }
    if (filter.status) {
      list = list.filter(t => t.status === filter.status);
    }

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getBranchTransfer(id) {
    const transfers = this.getBranchTransfers();
    return transfers.find(t => t.id === id) || null;
  }

  createBranchTransfer({ fromBranchId, toBranchId, items = [], notes = '', dispatchedBy = 'Encargado', driverId = null, cadeteName = '', vehicleType = 'moto', deliveryService = '', cadetePlate = '', cadetePhone = '' }) {
    if (!fromBranchId || !toBranchId) throw new Error('Sucursal origen y destino son requeridas');
    if (fromBranchId === toBranchId) throw new Error('La sucursal de origen y destino no pueden ser la misma');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Debe incluir al menos un producto a transferir');

    const database = db.readDb();
    if (!Array.isArray(database.branchTransfers)) database.branchTransfers = [];

    const branches = db.getBranches();
    const fromBranch = branches.find(b => b.id === fromBranchId);
    const toBranch = branches.find(b => b.id === toBranchId);

    let driver = null;
    if (driverId) {
      driver = (database.drivers || []).find(d => d.id === driverId);
    }

    const resolvedCadeteName = driver ? driver.name : (cadeteName || null);
    const resolvedVehicleType = (driver && driver.vehicleType) ? driver.vehicleType : (vehicleType || 'moto');
    const resolvedDeliveryService = (driver && driver.deliveryService) ? driver.deliveryService : (deliveryService || null);
    const resolvedPlate = driver ? driver.plate : (cadetePlate || null);
    const resolvedPhone = driver ? driver.phone : (cadetePhone || null);

    const transferNumber = `TR-${Date.now().toString().slice(-6)}`;
    const newTransfer = {
      id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      transferNumber,
      fromBranchId,
      fromBranchName: fromBranch ? fromBranch.name : fromBranchId,
      toBranchId,
      toBranchName: toBranch ? toBranch.name : toBranchId,
      status: 'in_transit', // 'draft' | 'in_transit' | 'received' | 'cancelled'
      items: items.map(it => ({
        productId: it.productId,
        plu: it.plu || '',
        name: it.name,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'kg',
        cost: Number(it.cost) || 0
      })),
      totalItems: items.length,
      totalQuantity: items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
      notes,
      dispatchedBy,
      dispatchedAt: new Date().toISOString(),
      driverId: driver ? driver.id : (driverId || null),
      cadeteId: driver ? driver.id : (driverId || null),
      cadeteName: resolvedCadeteName,
      cadetePhone: resolvedPhone,
      cadetePlate: resolvedPlate,
      vehicleType: resolvedVehicleType, // 'bici' | 'moto' | 'auto' | 'utilitario' | 'camioneta_con_camara' | 'delivery_externo'
      deliveryService: resolvedDeliveryService, // e.g. 'Rapiboy', 'PedidosYa'
      receivedBy: null,
      receivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Descontar inmediatamente el stock en la sucursal de origen
    items.forEach(it => {
      this.adjustStock({
        productId: it.productId,
        branchId: fromBranchId,
        quantity: -(Number(it.quantity) || 0),
        type: 'transfer_out',
        reason: `Traspaso #${transferNumber} hacia ${newTransfer.toBranchName}`,
        referenceId: newTransfer.id,
        user: dispatchedBy
      });
    });

    database.branchTransfers.unshift(newTransfer);
    db.writeDb(database);
    this.emit('transfers:sync', database.branchTransfers);
    this.emit('transfer:new', newTransfer);

    return newTransfer;
  }

  confirmBranchTransfer(transferId, { receivedBy = 'Receptor Destino', notes = '' } = {}) {
    const database = db.readDb();
    if (!Array.isArray(database.branchTransfers)) return null;

    const transfer = database.branchTransfers.find(t => t.id === transferId);
    if (!transfer) throw new Error('Traspaso no encontrado');
    if (transfer.status === 'received') throw new Error('El traspaso ya fue recibido previamente');
    if (transfer.status === 'cancelled') throw new Error('El traspaso se encuentra cancelado');

    transfer.status = 'received';
    transfer.receivedBy = receivedBy;
    transfer.receivedAt = new Date().toISOString();
    if (notes) {
      transfer.notes = transfer.notes ? `${transfer.notes} | Recep: ${notes}` : notes;
    }
    transfer.updatedAt = new Date().toISOString();

    // Sumar el stock en la sucursal de destino
    transfer.items.forEach(it => {
      this.adjustStock({
        productId: it.productId,
        branchId: transfer.toBranchId,
        quantity: Number(it.quantity) || 0,
        type: 'transfer_in',
        reason: `Recepción Traspaso #${transfer.transferNumber} desde ${transfer.fromBranchName}`,
        referenceId: transfer.id,
        user: receivedBy
      });
    });

    db.writeDb(database);
    this.emit('transfers:sync', database.branchTransfers);
    this.emit('transfer:updated', transfer);

    return transfer;
  }

  assignTransferDriver(transferId, { driverId = null, cadeteName = '', vehicleType = 'moto', deliveryService = '', phone = '', plate = '' } = {}) {
    const database = db.readDb();
    if (!Array.isArray(database.branchTransfers)) return null;

    const transfer = database.branchTransfers.find(t => t.id === transferId);
    if (!transfer) throw new Error('Traspaso no encontrado');

    let driver = null;
    if (driverId) {
      driver = (database.drivers || []).find(d => d.id === driverId);
    }

    transfer.driverId = driverId || (driver ? driver.id : null);
    transfer.cadeteId = transfer.driverId;
    transfer.cadeteName = driver ? driver.name : (cadeteName || transfer.cadeteName || 'Repartidor / Cadete');
    transfer.cadetePhone = driver ? driver.phone : (phone || transfer.cadetePhone || null);
    transfer.cadetePlate = driver ? driver.plate : (plate || transfer.cadetePlate || null);
    transfer.vehicleType = (driver && driver.vehicleType) ? driver.vehicleType : (vehicleType || transfer.vehicleType || 'moto');
    transfer.deliveryService = (driver && driver.deliveryService) ? driver.deliveryService : (deliveryService || transfer.deliveryService || null);
    transfer.assignedCadeteAt = new Date().toISOString();
    transfer.updatedAt = new Date().toISOString();

    db.writeDb(database);
    this.emit('transfers:sync', database.branchTransfers);
    this.emit('transfer:updated', transfer);

    return transfer;
  }

  cancelBranchTransfer(transferId, { cancelledBy = 'Admin', reason = '' } = {}) {
    const database = db.readDb();
    if (!Array.isArray(database.branchTransfers)) return null;

    const transfer = database.branchTransfers.find(t => t.id === transferId);
    if (!transfer) throw new Error('Traspaso no encontrado');
    if (transfer.status === 'received') throw new Error('No se puede cancelar un traspaso ya recibido');

    transfer.status = 'cancelled';
    transfer.cancelledBy = cancelledBy;
    transfer.cancelledAt = new Date().toISOString();
    transfer.cancelReason = reason;
    transfer.updatedAt = new Date().toISOString();

    // Reintegrar el stock a la sucursal de origen
    transfer.items.forEach(it => {
      this.adjustStock({
        productId: it.productId,
        branchId: transfer.fromBranchId,
        quantity: Number(it.quantity) || 0,
        type: 'manual_adjustment',
        reason: `Cancelación Traspaso #${transfer.transferNumber} - ${reason}`,
        referenceId: transfer.id,
        user: cancelledBy
      });
    });

    db.writeDb(database);
    this.emit('transfers:sync', database.branchTransfers);
    this.emit('transfer:updated', transfer);

    return transfer;
  }

  // ==========================================
  // 4. FACTURAS Y BOLETAS DE PROVEEDORES (COMPRAS)
  // ==========================================
  getSupplierInvoices(filter = {}) {
    const database = db.readDb();
    if (!Array.isArray(database.supplierInvoices)) {
      database.supplierInvoices = [];
    }
    let list = database.supplierInvoices;

    if (filter.supplierId) {
      list = list.filter(i => i.supplierId === filter.supplierId);
    }
    if (filter.branchId) {
      list = list.filter(i => i.branchId === filter.branchId);
    }
    if (filter.status) {
      list = list.filter(i => i.status === filter.status);
    }

    return list.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }

  getSupplierInvoice(id) {
    const invoices = this.getSupplierInvoices();
    return invoices.find(i => i.id === id) || null;
  }

  registerSupplierInvoice({
    supplierId = null,
    supplierName = '',
    invoiceNumber = '',
    invoiceType = 'Factura A', // 'Factura A' | 'Factura B' | 'Factura C' | 'Remito' | 'Ticket'
    date = null,
    branchId = 'br-1',
    expenseCategory = 'mercaderia', // 'mercaderia' | 'insumos' | 'mantenimiento' | 'servicios' | 'otros'
    items = [],
    totalAmount = 0,
    mediaUrl = null,
    rawOcrData = null,
    status = 'confirmed', // 'draft' | 'confirmed'
    notes = '',
    operator = 'Admin',
    paymentSource = 'administracion', // 'administracion' | 'caja_sucursal' | 'cuenta_corriente'
    paidBy = '',
    chatComment = ''
  }) {
    const database = db.readDb();
    if (!Array.isArray(database.supplierInvoices)) database.supplierInvoices = [];

    const branches = db.getBranches();
    const targetBranch = branches.find(b => b.id === branchId) || branches[0];
    const targetBranchId = targetBranch ? targetBranch.id : 'br-1';

    const cleanInvoiceNumber = invoiceNumber || `FC-${Date.now().toString().slice(-6)}`;
    const invoiceDate = date || new Date().toISOString().slice(0, 10);

    const calculatedTotal = Number(totalAmount) || items.reduce((sum, it) => sum + (Number(it.totalPrice) || (Number(it.quantity) * Number(it.unitPrice)) || 0), 0);

    const finalPaymentSource = paymentSource || 'administracion';
    const finalPaidBy = paidBy || (
      finalPaymentSource === 'caja_sucursal' ? 'Caja Sucursal' :
      finalPaymentSource === 'cuenta_corriente' ? 'Cuenta Corriente' :
      'Administración Central'
    );

    // Auto-resolución y asignación de proveedor (si existe lo asigna automáticamente, si no lo agrega al sistema)
    const matchedSupplier = this.findOrCreateSupplier({
      name: supplierName || rawOcrData?.merchant || '',
      cuit: rawOcrData?.cuit || '',
      category: expenseCategory === 'mercaderia' ? (rawOcrData?.category || 'Carne Vacuna') : (expenseCategory || 'General'),
      paymentTerms: rawOcrData?.paymentMethod || (finalPaymentSource === 'cuenta_corriente' ? 'Cuenta Corriente' : 'Contado')
    });
    const resolvedSupplierId = supplierId || matchedSupplier.id;
    const resolvedSupplierName = matchedSupplier.name || supplierName || 'Proveedor General';

    const newInvoice = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      supplierId: resolvedSupplierId || null,
      supplierName: resolvedSupplierName,
      invoiceNumber: cleanInvoiceNumber,
      invoiceType,
      date: invoiceDate,
      branchId: targetBranchId,
      branchName: targetBranch ? targetBranch.name : targetBranchId,
      expenseCategory,
      items: items.map(it => ({
        description: it.description || it.name,
        productId: it.productId || null,
        plu: it.plu || null,
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'kg',
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: Number(it.totalPrice) || (Number(it.quantity || 1) * Number(it.unitPrice || 0))
      })),
      totalAmount: calculatedTotal,
      status, // 'draft' | 'confirmed'
      mediaUrl,
      rawOcrData,
      notes,
      operator,
      paymentSource: finalPaymentSource,
      paidBy: finalPaidBy,
      chatComment: chatComment || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Si la factura está confirmada y es mercadería/cortes, incrementar de forma automática el stock
    if (status === 'confirmed' && (expenseCategory === 'mercaderia' || !expenseCategory)) {
      newInvoice.items.forEach(it => {
        if (it.productId) {
          this.adjustStock({
            productId: it.productId,
            branchId: targetBranchId,
            quantity: Number(it.quantity) || 0,
            type: 'purchase_invoice',
            reason: `Compra ${invoiceType} #${cleanInvoiceNumber} - ${newInvoice.supplierName}`,
            cost: Number(it.unitPrice) || 0,
            referenceId: newInvoice.id,
            user: operator
          });
        }
      });
    }

    database.supplierInvoices.unshift(newInvoice);
    db.writeDb(database);
    this.emit('invoices:sync', database.supplierInvoices);
    this.emit('invoice:new', newInvoice);

    return newInvoice;
  }

  updateSupplierInvoice(id, updateData, operator = 'Admin') {
    const database = db.readDb();
    if (!Array.isArray(database.supplierInvoices)) return null;

    const invoiceIndex = database.supplierInvoices.findIndex(i => i.id === id);
    if (invoiceIndex === -1) throw new Error('Factura no encontrada');

    const prevInvoice = database.supplierInvoices[invoiceIndex];
    const prevStatus = prevInvoice.status;
    const prevBranchId = prevInvoice.branchId;
    const prevItems = prevInvoice.items || [];
    const prevExpenseCategory = prevInvoice.expenseCategory || 'mercaderia';

    const newStatus = updateData.status || prevStatus;
    const newBranchId = updateData.branchId || prevBranchId;
    const newItems = updateData.items ? updateData.items.map(it => ({
      description: it.description || it.name || '',
      productId: it.productId || null,
      plu: it.plu || null,
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'kg',
      unitPrice: Number(it.unitPrice) || 0,
      totalPrice: Number(it.totalPrice) || (Number(it.quantity || 1) * Number(it.unitPrice || 0))
    })) : prevItems;

    const newExpenseCategory = updateData.expenseCategory || prevExpenseCategory;
    const calculatedTotal = updateData.totalAmount !== undefined 
      ? Number(updateData.totalAmount)
      : newItems.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);

    const branches = db.getBranches();
    const targetBranch = branches.find(b => b.id === newBranchId);

    // 1. Si antes estaba confirmada y era de mercadería, revertir stock anterior
    if (prevStatus === 'confirmed' && (prevExpenseCategory === 'mercaderia' || !prevExpenseCategory)) {
      prevItems.forEach(it => {
        if (it.productId) {
          this.adjustStock({
            productId: it.productId,
            branchId: prevBranchId,
            quantity: -(Number(it.quantity) || 0),
            type: 'manual_adjustment',
            reason: `Ajuste por edición de Factura #${prevInvoice.invoiceNumber} (Reversión previa)`,
            referenceId: prevInvoice.id,
            user: operator
          });
        }
      });
    }

    // 2. Si ahora queda confirmada y es mercadería, aplicar nuevo stock
    if (newStatus === 'confirmed' && (newExpenseCategory === 'mercaderia' || !newExpenseCategory)) {
      newItems.forEach(it => {
        if (it.productId) {
          this.adjustStock({
            productId: it.productId,
            branchId: newBranchId,
            quantity: Number(it.quantity) || 0,
            type: 'purchase_invoice',
            reason: `Ingreso Stock Factura #${updateData.invoiceNumber || prevInvoice.invoiceNumber} (Actualizada)`,
            cost: Number(it.unitPrice) || 0,
            referenceId: prevInvoice.id,
            user: operator
          });
        }
      });
    }

    const newPaymentSource = updateData.paymentSource !== undefined ? updateData.paymentSource : (prevInvoice.paymentSource || 'administracion');
    const newPaidBy = updateData.paidBy !== undefined ? updateData.paidBy : (
      updateData.paymentSource ? (
        updateData.paymentSource === 'caja_sucursal' ? 'Caja Sucursal' :
        updateData.paymentSource === 'cuenta_corriente' ? 'Cuenta Corriente' :
        'Administración Central'
      ) : (prevInvoice.paidBy || 'Administración Central')
    );
    const newChatComment = updateData.chatComment !== undefined ? updateData.chatComment : (prevInvoice.chatComment || '');

    let updatedSupplierId = updateData.supplierId !== undefined ? updateData.supplierId : prevInvoice.supplierId;
    let updatedSupplierName = updateData.supplierName !== undefined ? updateData.supplierName : prevInvoice.supplierName;

    if (updateData.supplierName && updateData.supplierName !== prevInvoice.supplierName) {
      const matched = this.findOrCreateSupplier({
        name: updateData.supplierName,
        category: newExpenseCategory
      });
      if (matched.id) {
        updatedSupplierId = matched.id;
        updatedSupplierName = matched.name;
      }
    }

    const updatedInvoice = {
      ...prevInvoice,
      supplierId: updatedSupplierId,
      supplierName: updatedSupplierName,
      invoiceNumber: updateData.invoiceNumber !== undefined ? updateData.invoiceNumber : prevInvoice.invoiceNumber,
      invoiceType: updateData.invoiceType !== undefined ? updateData.invoiceType : prevInvoice.invoiceType,
      date: updateData.date !== undefined ? updateData.date : prevInvoice.date,
      branchId: newBranchId,
      branchName: targetBranch ? targetBranch.name : (updateData.branchName || prevInvoice.branchName),
      expenseCategory: newExpenseCategory,
      items: newItems,
      totalAmount: calculatedTotal,
      status: newStatus,
      paymentSource: newPaymentSource,
      paidBy: newPaidBy,
      chatComment: newChatComment,
      notes: updateData.notes !== undefined ? updateData.notes : prevInvoice.notes,
      mediaUrl: updateData.mediaUrl !== undefined ? updateData.mediaUrl : prevInvoice.mediaUrl,
      updatedAt: new Date().toISOString()
    };

    database.supplierInvoices[invoiceIndex] = updatedInvoice;
    db.writeDb(database);
    this.emit('invoices:sync', database.supplierInvoices);
    this.emit('invoice:updated', updatedInvoice);

    return updatedInvoice;
  }

  confirmDraftInvoice(invoiceId, operator = 'Admin') {
    const database = db.readDb();
    if (!Array.isArray(database.supplierInvoices)) return null;

    const invoice = database.supplierInvoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Factura no encontrada');
    if (invoice.status === 'confirmed') return invoice;

    invoice.status = 'confirmed';
    invoice.confirmedAt = new Date().toISOString();
    invoice.updatedAt = new Date().toISOString();

    // Actualizar inventario para cada ítem si es mercadería
    if (invoice.expenseCategory === 'mercaderia' || !invoice.expenseCategory) {
      invoice.items.forEach(it => {
        if (it.productId) {
          this.adjustStock({
            productId: it.productId,
            branchId: invoice.branchId,
            quantity: Number(it.quantity) || 0,
            type: 'purchase_invoice',
            reason: `Confirmación Compra ${invoice.invoiceType} #${invoice.invoiceNumber} - ${invoice.supplierName}`,
            cost: Number(it.unitPrice) || 0,
            referenceId: invoice.id,
            user: operator
          });
        }
      });
    }

    db.writeDb(database);
    this.emit('invoices:sync', database.supplierInvoices);
    this.emit('invoice:updated', invoice);

    return invoice;
  }

  deleteSupplierInvoice(id, operator = 'Admin') {
    const database = db.readDb();
    if (!Array.isArray(database.supplierInvoices)) return false;
    const inv = database.supplierInvoices.find(i => i.id === id);
    if (inv && inv.status === 'confirmed' && (inv.expenseCategory === 'mercaderia' || !inv.expenseCategory)) {
      (inv.items || []).forEach(it => {
        if (it.productId) {
          this.adjustStock({
            productId: it.productId,
            branchId: inv.branchId,
            quantity: -(Number(it.quantity) || 0),
            type: 'manual_adjustment',
            reason: `Eliminación de Factura #${inv.invoiceNumber} (Reversión stock)`,
            referenceId: inv.id,
            user: operator
          });
        }
      });
    }
    database.supplierInvoices = database.supplierInvoices.filter(i => i.id !== id);
    db.writeDb(database);
    this.emit('invoices:sync', database.supplierInvoices);
    return true;
  }
}

export const inventoryService = new InventoryService();

/**
 * Analiza el comentario o texto adjunto al comprobante o enviado con posterioridad en el chat de WhatsApp.
 * Extrae:
 * - Quién abona / Modalidad: 'administracion', 'caja_sucursal', 'cuenta_corriente'
 * - Sucursal mencionada (si aplica)
 * - Comentario normalizado
 */
export function parsePaymentAndBranchFromComment(text = '', branches = []) {
  if (!text || typeof text !== 'string') {
    return { paymentSource: null, paidBy: null, branchId: null, branchName: null, chatComment: '' };
  }

  const clean = text.trim();
  const lower = clean.toLowerCase();

  let paymentSource = null;
  let paidBy = null;

  // 1. Detectar quién abona / modalidad de pago
  if (/(admin|administraci[oó]n|oficina|central|transferencia|transferir|tesorer[ií]a|abona\s+admin|paga\s+admin|desde\s+admin)/i.test(lower)) {
    paymentSource = 'administracion';
    paidBy = 'Administración Central';
  } else if (/(caja|cajero|sucursal|efectivo|pag[oó]\s+caja|pag[oó]\s+en\s+sucursal|abona\s+caja|paga\s+cajero|caja\s+chica)/i.test(lower)) {
    paymentSource = 'caja_sucursal';
    paidBy = 'Caja Sucursal';
  } else if (/(cuenta\s*corriente|cta\s*cte|cta\.?\s*cte|a\s+cuenta|corriente|saldo\s+pendiente|fiado|anotar|a\s+pagar|queda\s+debilitado)/i.test(lower)) {
    paymentSource = 'cuenta_corriente';
    paidBy = 'Cuenta Corriente';
  }

  // 2. Detectar sucursal si fue nombrada en el mensaje
  let branchId = null;
  let branchName = null;

  if (Array.isArray(branches) && branches.length > 0) {
    const normalizeStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleanLower = normalizeStr(lower);

    for (const b of branches) {
      const bNorm = normalizeStr(b.name || '');
      // Palabras clave significativas de la sede
      const rawWords = bNorm
        .replace(/republica|sucursal|de la carne|carniceria|nueva|alto|mall/gi, '')
        .split(/[\s–\-\/]+/)
        .map(w => w.trim())
        .filter(w => w.length >= 4 || w === 'urca');

      const matches = rawWords.some(w => cleanLower.includes(w)) ||
                      (cleanLower.includes('urca') && bNorm.includes('urca')) ||
                      (cleanLower.includes('cerro') && (bNorm.includes('cerro') || bNorm.includes('tejeda')));

      if (matches) {
        branchId = b.id;
        branchName = b.name;
        break;
      }
    }
  }

  return {
    paymentSource,
    paidBy,
    branchId,
    branchName,
    chatComment: clean
  };
}
