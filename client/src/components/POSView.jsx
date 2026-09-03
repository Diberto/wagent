import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  DollarSign, 
  Send, 
  Printer, 
  User, 
  Phone, 
  MapPin, 
  Store, 
  Truck, 
  ShoppingBag, 
  Check, 
  X, 
  RefreshCw, 
  CheckCircle2, 
  Flame,
  ArrowRight,
  Receipt,
  ScanLine,
  Barcode
} from 'lucide-react';
import TicketPrintModal from './TicketPrintModal.jsx';

const playScannerBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
};

export default function POSView({ socket }) {
  // Products and branches data
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Barcode Scanner Gun Status
  const [lastScannedProduct, setLastScannedProduct] = useState(null); // null | { name, code }

  // Thermal & Multi-format Ticket Print Modal
  const [ticketPrintModal, setTicketPrintModal] = useState(null); // null | order object

  // Parallel Cart Tabs State
  const [tabs, setTabs] = useState([
    {
      id: 'tab-1',
      title: 'Venta #1',
      customerName: '',
      phone: '',
      address: '',
      branchId: '',
      orderType: 'takeaway', // 'takeaway' | 'delivery'
      paymentMethod: 'Efectivo',
      items: [], // [{ id, name, price, quantity, unit }]
      notes: '',
      cashReceived: ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');

  // Checkout Status / Success Modal
  const [checkoutModal, setCheckoutModal] = useState(null); // null | { order, isSubmitting, successMessage }

  const activeCart = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateActiveCart = (updates) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, branchRes, custRes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/branches').then(r => r.json()),
        fetch('/api/customers').then(r => r.json())
      ]);

      const prodList = Array.isArray(prodRes) ? prodRes : [];
      const branchList = Array.isArray(branchRes) ? branchRes : [];
      const custList = Array.isArray(custRes) ? custRes : [];

      setProducts(prodList);
      setBranches(branchList);
      setCustomers(custList);

      // Pre-set default branch if available
      if (branchList.length > 0 && !tabs[0].branchId) {
        setTabs(prev => prev.map((t, idx) => idx === 0 ? { ...t, branchId: branchList[0].id } : t));
      }
    } catch (err) {
      console.error('Error cargando datos del POS:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();

    if (socket) {
      const handleCatalogUpdate = () => {
        fetchInitialData();
      };
      socket.on('catalog:updated', handleCatalogUpdate);
      socket.on('products:updated', handleCatalogUpdate);
      return () => {
        socket.off('catalog:updated', handleCatalogUpdate);
        socket.off('products:updated', handleCatalogUpdate);
      };
    }
  }, [socket]);


  // Argentine scale barcode parser: 20PPPPPWWWWWX or 02PPPPPWWWWWX
  const parseBarcodeData = (scannedCode) => {
    const raw = String(scannedCode).trim();
    if (/^(20|02)\d{11}$/.test(raw)) {
      const pluNum = parseInt(raw.substring(2, 7), 10);
      const weightGrams = parseInt(raw.substring(7, 12), 10);
      const weightKg = Math.round((weightGrams / 1000) * 1000) / 1000;
      
      const found = products.find(p => {
        const pPlu = parseInt(String(p.plu || '').replace(/\D/g, ''), 10);
        return pPlu === pluNum || (p.barcode && p.barcode.includes(String(pluNum)));
      }) || products.find(p => p.plu && String(p.plu).toLowerCase() === String(pluNum).toLowerCase());

      if (found) {
        return { product: found, quantity: weightKg > 0 ? weightKg : 1, isScale: true, weightKg, plu: pluNum };
      }
    }

    const found = products.find(p => 
      (p.barcode && p.barcode.toLowerCase() === raw.toLowerCase()) ||
      (p.plu && String(p.plu).toLowerCase() === raw.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase() === raw.toLowerCase()) ||
      (p.id && p.id.toLowerCase() === raw.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(raw.toLowerCase()))
    );

    return { product: found, quantity: 1, isScale: false };
  };

  // Hardware Barcode Scanner Gun Global Listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      const isInputFocused = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          const scannedCode = barcodeBuffer.trim();
          barcodeBuffer = '';

          const result = parseBarcodeData(scannedCode);
          if (result && result.product) {
            e.preventDefault();
            playScannerBeep();
            handleAddToCart(result.product, result.quantity);
            setLastScannedProduct({ 
              name: result.product.name, 
              code: scannedCode, 
              detail: result.isScale ? `Balanza: ${result.weightKg} kg (PLU ${result.plu})` : 'EAN-13 / PLU' 
            });
            setTimeout(() => setLastScannedProduct(null), 3500);
          }
        } else {
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 120 && !isInputFocused) {
          barcodeBuffer = e.key;
        } else {
          barcodeBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, activeCart]);

  // Multi-Tab management
  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newId = `tab-${Date.now()}`;
    const newTab = {
      id: newId,
      title: `Venta #${nextNum}`,
      customerName: '',
      phone: '',
      address: '',
      branchId: branches[0]?.id || '',
      orderType: 'takeaway',
      paymentMethod: 'Efectivo',
      items: [],
      notes: '',
      cashReceived: ''
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const target = tabs.find(t => t.id === tabId);
    if (target.items.length > 0 && !window.confirm(`¿Cerrar la pestaña "${target.title}" y descartar los productos cargados?`)) {
      return;
    }

    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  // Cart item management
  const handleAddToCart = (product, qtyToAdd = 1) => {
    const existingIndex = activeCart.items.findIndex(item => item.id === product.id);
    let updatedItems = [...activeCart.items];

    if (existingIndex >= 0) {
      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        quantity: Math.round((updatedItems[existingIndex].quantity + qtyToAdd) * 100) / 100
      };
    } else {
      updatedItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        unit: product.unit || 'kg',
        quantity: qtyToAdd
      });
    }

    updateActiveCart({ items: updatedItems });
  };

  const handleUpdateItemQty = (productId, newQty) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    const updatedItems = activeCart.items.map(item => 
      item.id === productId ? { ...item, quantity: Math.round(newQty * 100) / 100 } : item
    );
    updateActiveCart({ items: updatedItems });
  };

  const handleRemoveItem = (productId) => {
    const updatedItems = activeCart.items.filter(item => item.id !== productId);
    updateActiveCart({ items: updatedItems });
  };

  const handleClearCart = () => {
    if (activeCart.items.length === 0) return;
    if (window.confirm('¿Vaciar todos los productos del carrito actual?')) {
      updateActiveCart({ items: [], cashReceived: '' });
    }
  };

  // Customer selection
  const handleSelectCustomer = (customer) => {
    updateActiveCart({
      customerName: customer.name || customer.pushName || '',
      phone: customer.phone || '',
      address: customer.address || '',
      branchId: customer.preferredBranchId || activeCart.branchId
    });
    setCustomerSearch('');
  };

  // Calculations
  const subtotal = activeCart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal;
  const cashNum = parseFloat(activeCart.cashReceived) || 0;
  const change = cashNum > total ? cashNum - total : 0;

  // Categories
  const categories = ['all', 'Combos', 'Novillito', 'Cerdo', 'Milanesas', 'Achuras', 'Embutidos'];

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || 
      (p.category || '').toLowerCase().includes(selectedCategory.toLowerCase()) ||
      (selectedCategory === 'Combos' && p.name.toLowerCase().includes('combo'));
    const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // Submit Order (POS Checkout with Fiscal / Budget options)
  const handleCheckout = async (sendWhatsApp = false, fiscalAction = 'ticket') => {
    if (activeCart.items.length === 0) {
      alert('Agrega al menos un corte o producto al carrito.');
      return;
    }

    const orderItems = activeCart.items.map(i => `• ${i.quantity} ${i.unit} ${i.name} ($${(i.price * i.quantity).toLocaleString('es-AR')})`);
    const selectedBranch = branches.find(b => b.id === activeCart.branchId);

    const payload = {
      customerName: activeCart.customerName || 'Cliente Mostrador',
      phone: activeCart.phone || '',
      customerFiscalCondition: activeCart.customerFiscalCondition || 'CF',
      customerCuit: activeCart.customerCuit || '',
      address: activeCart.orderType === 'takeaway' 
        ? `Retiro en ${selectedBranch?.name || 'Mostrador'}` 
        : (activeCart.address || 'Entrega a Domicilio'),
      deliveryType: activeCart.orderType === 'takeaway' ? 'pickup' : 'delivery',
      items: orderItems,
      products: activeCart.items.map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        unitPrice: it.price,
        quantity: it.quantity,
        unit: it.unit || 'kg',
        ivaRate: it.ivaRate !== undefined ? it.ivaRate : 10.5,
        subtotal: it.price * it.quantity
      })),
      totalAmount: total,
      paymentMethod: activeCart.paymentMethod,
      branchId: activeCart.branchId || null,
      branchName: selectedBranch?.name || null,
      channel: 'POS',
      source: 'POS',
      origin: 'POS',
      status: activeCart.orderType === 'takeaway' ? 'preparing' : 'pending',
      notes: activeCart.notes 
        ? `[POS Mostrador] [${fiscalAction === 'invoice' ? 'FACTURA FISCAL' : fiscalAction === 'budget' ? 'PRESUPUESTO' : 'TICKET INTERNO'}] ${activeCart.notes}` 
        : `[POS Mostrador] [${fiscalAction === 'invoice' ? 'FACTURA FISCAL' : fiscalAction === 'budget' ? 'PRESUPUESTO' : 'TICKET INTERNO'}]`
    };

    setCheckoutModal({ isSubmitting: true, successMessage: null, order: null });

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al registrar pedido');
      let createdOrder = await res.json();

      // Si se eligió Factura Electrónica ARCA oficial:
      if (fiscalAction === 'invoice') {
        try {
          const invRes = await fetch(`/api/arca/invoice/${createdOrder.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              branchId: activeCart.branchId,
              customerCuit: activeCart.customerCuit,
              customerFiscalCondition: activeCart.customerFiscalCondition
            })
          });
          const invData = await invRes.json();
          if (invRes.ok && invData.invoice) {
            createdOrder.invoice = invData.invoice;
          }
        } catch (invErr) {
          console.error('Error emitiendo factura ARCA:', invErr);
        }
      }

      // Si se solicitó WhatsApp y el cliente tiene número
      if (sendWhatsApp && activeCart.phone) {
        try {
          if (activeCart.paymentMethod === 'Mercado Pago') {
            await fetch('/api/mercadopago/create-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: createdOrder.id,
                amount: total,
                customerName: payload.customerName,
                phone: payload.phone,
                items: orderItems,
                sendWhatsApp: true
              })
            });
          } else if (activeCart.branchId) {
            await fetch(`/api/orders/${createdOrder.id}/derive`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                branchId: activeCart.branchId,
                notes: 'Venta ingresada desde terminal POS Mostrador',
                notifyClient: true
              })
            });
          }
        } catch (e) {
          console.error('Error enviando WhatsApp:', e);
        }
      }

      setCheckoutModal({
        isSubmitting: false,
        order: createdOrder,
        fiscalAction,
        successMessage: fiscalAction === 'invoice' 
          ? `¡Factura ARCA emitida! Pedido #${createdOrder.id} (CAE: ${createdOrder.invoice?.cae || 'Simulado'})`
          : fiscalAction === 'budget'
          ? `¡Presupuesto registrado! Pedido #${createdOrder.id} (Sin impacto impositivo)`
          : `¡Venta registrada con éxito! Pedido #${createdOrder.id}`
      });

      // Vaciar carrito
      updateActiveCart({
        items: [],
        customerName: '',
        phone: '',
        customerCuit: '',
        customerFiscalCondition: 'CF',
        address: '',
        notes: '',
        cashReceived: ''
      });
    } catch (err) {
      alert(`Error en Checkout: ${err.message}`);
      setCheckoutModal(null);
    }
  };

  const handlePrintReceipt = (order) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Ticket #${order.id} - República de la Carne</title>
          <style>
            body { font-family: monospace; font-size: 12px; padding: 15px; margin: 0; }
            .header { text-align: center; margin-bottom: 10px; }
            .title { font-size: 16px; font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .item { display: flex; justify-content: space-between; margin: 4px 0; }
            .total { font-size: 14px; font-weight: bold; margin-top: 6px; }
            .footer { text-align: center; margin-top: 15px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">REPÚBLICA DE LA CARNE</div>
            <div>"La calidad nos hace diferentes"</div>
            <div>Ticket de Venta #${order.id}</div>
            <div>${new Date().toLocaleString()}</div>
          </div>
          <div class="line"></div>
          <div><b>Cliente:</b> ${order.customerName}</div>
          <div><b>Teléfono:</b> ${order.phone || 'Mostrador'}</div>
          <div><b>Modalidad:</b> ${order.address}</div>
          <div><b>Sucursal:</b> ${order.branchName || 'Casa Central'}</div>
          <div class="line"></div>
          <div><b>DETALLE DE CORTES:</b></div>
          ${Array.isArray(order.items) ? order.items.map(i => `<div>${i}</div>`).join('') : `<div>${order.items}</div>`}
          <div class="line"></div>
          <div class="total">TOTAL A PAGAR: $${Number(order.totalAmount).toLocaleString('es-AR')}</div>
          <div><b>Medio de Pago:</b> ${order.paymentMethod}</div>
          <div class="line"></div>
          <div class="footer">
            ¡Muchas gracias por su compra!<br/>
            WhatsApp: +54 9 351 626-2475
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden">
      
      {/* Top Bar: Multi-Cart Tabs */}
      <div className="bg-[#111b21] border-b border-slate-800 px-4 pt-2 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const itemCount = tab.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl cursor-pointer text-xs font-bold transition-all select-none border ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-[#182229] hover:bg-[#202c33] text-slate-300 border-slate-700/80'
                }`}
              >
                <Calculator size={14} />
                <span>{tab.title}</span>
                {itemCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
                  }`}>
                    {itemCount}
                  </span>
                )}
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className={`p-0.5 rounded-full hover:bg-black/20 transition ${isActive ? 'text-slate-950' : 'text-slate-400'}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={handleAddNewTab}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#182229] hover:bg-[#202c33] border border-dashed border-slate-700 text-slate-400 hover:text-emerald-400 text-xs font-bold transition whitespace-nowrap"
            title="Abrir nueva venta en paralelo"
          >
            <Plus size={14} />
            Nueva Venta
          </button>
        </div>

        <div className="pb-2 hidden lg:flex items-center gap-3 text-xs">
          {lastScannedProduct && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold animate-pulse">
              <ScanLine size={14} />
              <span>¡Escaneado: {lastScannedProduct.name}!</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold bg-[#182229] px-3 py-1 rounded-xl border border-slate-700">
            <Barcode size={15} className="text-emerald-400" />
            <span>Pistola de Escáner Lista</span>
          </div>
        </div>
      </div>

      {/* Main Split Body: Left Product Catalog (60%) | Right Cart & Checkout (40%) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* LEFT: Product Grid & Search */}
        <div className="flex-1 flex flex-col border-r border-slate-800 bg-[#0b141a] overflow-hidden p-4 space-y-3">
          
          {/* Search & Categories */}
          <div className="space-y-2.5 flex-shrink-0">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar corte o producto por nombre..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#182229] border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat === 'all' ? '🥩 Todos los Cortes' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw size={28} className="animate-spin text-emerald-500" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                No se encontraron cortes que coincidan con la búsqueda.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredProducts.map(product => {
                  const inCartItem = activeCart.items.find(i => i.id === product.id);
                  const isCombo = product.name.toLowerCase().includes('combo');
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddToCart(product, 1)}
                      className={`p-3.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] border cursor-pointer flex flex-col justify-between space-y-2 transition-all group select-none shadow-md ${
                        inCartItem
                          ? 'border-emerald-500/80 ring-1 ring-emerald-500/40'
                          : isCombo
                          ? 'border-amber-500/40 bg-amber-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-[#111b21] text-slate-400 border border-slate-800">
                            {product.category || 'Corte'}
                          </span>
                          {inCartItem && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950">
                              {inCartItem.quantity} {inCartItem.unit}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition leading-snug line-clamp-2">
                          {product.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {product.description || 'Fresco de novillito'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <div>
                          <div className="text-xs font-extrabold text-emerald-400">
                            ${product.price.toLocaleString('es-AR')}
                          </div>
                          <div className="text-[10px] text-slate-500">por {product.unit || 'kg'}</div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product, 1);
                          }}
                          className="w-7 h-7 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold hover:scale-105 transition active:scale-95"
                          title="Agregar 1 unidad/kg"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Current Cart & Checkout Panel */}
        <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col bg-[#111b21] border-t lg:border-t-0 border-slate-800 overflow-hidden">
          
          {/* Cart Header */}
          <div className="p-3.5 border-b border-slate-800 bg-[#182229] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className="text-emerald-400" />
              <span className="text-sm font-bold text-white">{activeCart.title}</span>
              <span className="text-xs text-slate-400">({activeCart.items.length} cortes)</span>
            </div>

            {activeCart.items.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
              >
                <Trash2 size={13} /> Vaciar
              </button>
            )}
          </div>

          {/* Customer & Branch Selector */}
          <div className="p-3.5 border-b border-slate-800 space-y-2 bg-[#141d24]">
            {/* Customer Search / Quick Select */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
                <span>Cliente:</span>
                {activeCart.customerName && (
                  <span className="text-emerald-400 font-semibold truncate max-w-[180px]">
                    👤 {activeCart.customerName}
                  </span>
                )}
              </label>

              {/* Direct Customer Dropdown Picker */}
              <select
                value=""
                onChange={(e) => {
                  const c = customers.find(x => x.id === e.target.value);
                  if (c) handleSelectCustomer(c);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">👤 Seleccionar cliente de la base de datos...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.pushName || 'Cliente'} — 📞 {c.phone || c.jid?.split('@')[0]} {c.address ? `(${c.address})` : ''}
                  </option>
                ))}
              </select>
              
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nombre del cliente"
                  value={activeCart.customerName}
                  onChange={(e) => updateActiveCart({ customerName: e.target.value })}
                  className="px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Celular (+54 9 351...)"
                  value={activeCart.phone}
                  onChange={(e) => updateActiveCart({ phone: e.target.value })}
                  className="px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Fiscal Condition & CUIT */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <select
                    value={activeCart.customerFiscalCondition || 'CF'}
                    onChange={(e) => updateActiveCart({ customerFiscalCondition: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CF">👤 Consumidor Final</option>
                    <option value="RI">🏢 Resp. Inscripto (Factura A)</option>
                    <option value="MONO">💼 Monotributo</option>
                    <option value="EX">🏛️ Exento</option>
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="CUIT / DNI (Facturación)"
                    value={activeCart.customerCuit || ''}
                    onChange={(e) => updateActiveCart({ customerCuit: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Live matching customers popup */}
              {customerSearch && (
                <div className="bg-[#182229] border border-slate-700 rounded-xl p-1.5 max-h-32 overflow-y-auto space-y-1 text-xs">
                  {customers.filter(c => (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch)).map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer flex items-center justify-between text-slate-200"
                    >
                      <span className="font-bold">{c.name || c.pushName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modalidad & Sucursal */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-400 mb-1 block">Modalidad:</label>
                <select
                  value={activeCart.orderType}
                  onChange={(e) => updateActiveCart({ orderType: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="takeaway">🏪 Retiro en Mostrador</option>
                  <option value="delivery">🚚 Envío a Domicilio</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 mb-1 block">Sucursal:</label>
                <select
                  value={activeCart.branchId}
                  onChange={(e) => updateActiveCart({ branchId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>📍 {b.name} ({b.address})</option>
                  ))}
                </select>
              </div>
            </div>

            {activeCart.orderType === 'delivery' && (
              <input
                type="text"
                placeholder="Dirección exacta de entrega (ej: Roque Funes 1704, Urca)"
                value={activeCart.address}
                onChange={(e) => updateActiveCart({ address: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
            {activeCart.items.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                <ShoppingBag size={32} className="mx-auto text-slate-600" />
                <div>Carrito vacío</div>
                <p className="text-[11px]">Haz clic en cualquier corte o combo para agregarlo a esta venta.</p>
              </div>
            ) : (
              activeCart.items.map(item => (
                <div
                  key={item.id}
                  className="bg-[#182229] border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                    <div className="text-[11px] text-slate-400 font-mono">
                      ${item.price.toLocaleString('es-AR')} / {item.unit}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#111b21] px-2 py-1 rounded-xl border border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => handleUpdateItemQty(item.id, item.quantity - (item.unit === 'kg' ? 0.5 : 1))}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-xs font-extrabold text-white font-mono w-10 text-center">
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateItemQty(item.id, item.quantity + (item.unit === 'kg' ? 0.5 : 1))}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  <div className="text-right min-w-[70px]">
                    <div className="text-xs font-extrabold text-emerald-400 font-mono">
                      ${(item.price * item.quantity).toLocaleString('es-AR')}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-[10px] text-slate-500 hover:text-rose-400"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment & Cash Change Calculator */}
          <div className="p-3.5 border-t border-slate-800 bg-[#182229] space-y-3">
            
            {/* Payment Method Selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'Efectivo', label: 'Efectivo', icon: DollarSign },
                { id: 'Mercado Pago', label: 'Mercado Pago', icon: CreditCard },
                { id: 'Transferencia Bancaria', label: 'Transfer.', icon: Send },
                { id: 'Tarjeta Débito/Crédito', label: 'Tarjeta', icon: CreditCard },
              ].map(m => {
                const isSelected = activeCart.paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => updateActiveCart({ paymentMethod: m.id })}
                    className={`py-1.5 px-1 rounded-xl text-[11px] font-bold text-center border transition ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                        : 'bg-[#111b21] text-slate-400 hover:text-white border-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* If Cash: Change Calculator */}
            {activeCart.paymentMethod === 'Efectivo' && (
              <div className="grid grid-cols-2 gap-2 bg-[#111b21] p-2.5 rounded-2xl border border-slate-800 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Paga con ($):</label>
                  <input
                    type="number"
                    placeholder="Monto recibido"
                    value={activeCart.cashReceived}
                    onChange={(e) => updateActiveCart({ cashReceived: e.target.value })}
                    className="w-full bg-[#182229] border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Vuelto a Entregar:</label>
                  <div className="text-sm font-extrabold text-amber-400 font-mono py-1">
                    ${change.toLocaleString('es-AR')}
                  </div>
                </div>
              </div>
            )}

            {/* Total Display */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-slate-400">TOTAL A COBRAR:</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                ${total.toLocaleString('es-AR')}
              </span>
            </div>

            {/* Action Buttons: Facturar vs Presupuesto vs Cobrar Mostrador */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleCheckout(false, 'invoice')}
                disabled={activeCart.items.length === 0}
                className="flex flex-col items-center justify-center py-2 px-1.5 rounded-2xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 text-[11px] font-bold transition disabled:opacity-50"
                title="Genera Factura Electrónica A, B o C con CAE en ARCA/AFIP"
              >
                <Receipt size={14} className="text-blue-400 mb-0.5" />
                <span>🧾 Facturar ARCA</span>
              </button>

              <button
                type="button"
                onClick={() => handleCheckout(false, 'budget')}
                disabled={activeCart.items.length === 0}
                className="flex flex-col items-center justify-center py-2 px-1.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition disabled:opacity-50"
                title="Guarda el pedido como Presupuesto / Comprobante X sin impacto fiscal"
              >
                <Calculator size={14} className="text-amber-400 mb-0.5" />
                <span>📄 Presupuesto</span>
              </button>

              <button
                type="button"
                onClick={() => handleCheckout(true, 'ticket')}
                disabled={activeCart.items.length === 0}
                className="flex flex-col items-center justify-center py-2 px-1.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                title="Registra la venta interna, abre ticket y envía WhatsApp si tiene teléfono"
              >
                <Send size={14} className="mb-0.5" />
                <span>Cobrar / Ticket</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Success / Checkout Modal */}
      {checkoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            
            {checkoutModal.isSubmitting ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                <RefreshCw size={28} className="animate-spin text-emerald-500 mx-auto" />
                <div>Procesando venta en el sistema...</div>
              </div>
            ) : checkoutModal.order ? (
              <div className="space-y-4 text-xs">
                <div className="text-center space-y-1">
                  <CheckCircle2 size={40} className="text-emerald-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">¡Venta Registrada con Éxito!</h3>
                  <p className="text-xs text-slate-400 font-mono">Pedido #{checkoutModal.order.id}</p>
                </div>

                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cliente:</span>
                    <span className="font-bold text-white">{checkoutModal.order.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-extrabold text-emerald-400">${Number(checkoutModal.order.totalAmount).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Medio de Pago:</span>
                    <span className="font-semibold">{checkoutModal.order.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sucursal:</span>
                    <span className="text-sky-400 font-semibold">{checkoutModal.order.branchName || 'Casa Central'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTicketPrintModal(checkoutModal.order)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 font-bold transition"
                  >
                    <Printer size={14} /> 🖨️ Imprimir Ticket
                  </button>

                  <button
                    type="button"
                    onClick={() => setCheckoutModal(null)}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition"
                  >
                    Nueva Venta
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      )}

      {/* Complete Thermal & Multi-format Ticket Print Modal */}
      {ticketPrintModal && (
        <TicketPrintModal
          order={ticketPrintModal}
          onClose={() => setTicketPrintModal(null)}
        />
      )}

    </div>
  );
}
