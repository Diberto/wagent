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
  Barcode,
  Lock,
  Unlock,
  Shield,
  ShieldAlert,
  LogIn,
  LogOut,
  Clock,
  Coins,
  History,
  Bike,
  AlertCircle,
  Calendar,
  Maximize2,
  Minimize2,
  ChevronDown
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

export default function POSView({ 
  socket, 
  currentUser: initialCurrentUser = null, 
  allUsers = [], 
  onSwitchUser, 
  isStandalone = false, 
  onExitStandalone 
}) {
  // Session & User State
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [activeBranchId, setActiveBranchId] = useState(null);
  const [isCashierLoginModalOpen, setIsCashierLoginModalOpen] = useState(false);
  const [isBranchSelectModalOpen, setIsBranchSelectModalOpen] = useState(false);
  const [loginPin, setLoginPin] = useState('');
  const [loginSelectedUserId, setLoginSelectedUserId] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminPinModal, setAdminPinModal] = useState(null); // null | { actionName, onConfirm }
  const [adminPinInput, setAdminPinInput] = useState('');

  // Cash Register / Shifts State (Apertura y Cierre de Caja)
  const [activeShift, setActiveShift] = useState(null);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isShiftsHistoryModalOpen, setIsShiftsHistoryModalOpen] = useState(false);
  const [shiftsList, setShiftsList] = useState([]);
  const [openShiftForm, setOpenShiftForm] = useState({ initialCash: '', notes: '' });
  const [closeShiftForm, setCloseShiftForm] = useState({ finalCashDeclared: '', notes: '' });
  const [shiftActionLoading, setShiftActionLoading] = useState(false);

  // Products, branches, customers and drivers
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Barcode Scanner Gun Status
  const [lastScannedProduct, setLastScannedProduct] = useState(null);

  // Thermal & Multi-format Ticket Print Modal
  const [ticketPrintModal, setTicketPrintModal] = useState(null);

  // Derivar a Reparto / Retiro Modal State
  const [dispatchModal, setDispatchModal] = useState(null); // null | { open: true }
  const [dispatchForm, setDispatchForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    orderType: 'delivery', // 'delivery' | 'takeaway'
    deliverySlot: 'Inmediato (30-45 min)',
    driverId: '',
    paymentMethod: 'Efectivo',
    notes: ''
  });

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
  const [checkoutModal, setCheckoutModal] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if current user is admin
  const isAdmin = (user = currentUser) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'agente_ia_principal' || user.role === 'gerencia') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some(r => r === 'admin' || r === 'agente_ia_principal' || r === 'gerencia');
    }
    return false;
  };

  const activeCart = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateActiveCart = (updates) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  // Sync currentUser from props or localStorage
  useEffect(() => {
    if (initialCurrentUser) {
      setCurrentUser(initialCurrentUser);
    } else {
      const savedUserJson = localStorage.getItem('wagent_user');
      if (savedUserJson) {
        try {
          setCurrentUser(JSON.parse(savedUserJson));
        } catch (e) {}
      }
    }
  }, [initialCurrentUser]);

  // Initial user branch resolution
  useEffect(() => {
    if (currentUser) {
      const userBranches = Array.isArray(currentUser.branches) && currentUser.branches.length > 0
        ? currentUser.branches
        : (currentUser.branchId ? [currentUser.branchId] : []);

      if (!activeBranchId) {
        if (userBranches.length === 1) {
          setActiveBranchId(userBranches[0]);
        } else if (userBranches.length > 1) {
          setActiveBranchId(userBranches[0]);
        } else if (branches.length > 0) {
          setActiveBranchId(branches[0].id);
        }
      }
    }
  }, [currentUser, branches]);

  // Fetch initial data
  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, branchRes, custRes, drivRes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/branches').then(r => r.json()),
        fetch('/api/customers').then(r => r.json()),
        fetch('/api/drivers').then(r => r.json()).catch(() => [])
      ]);

      const prodList = Array.isArray(prodRes) ? prodRes : [];
      const branchList = Array.isArray(branchRes) ? branchRes : [];
      const custList = Array.isArray(custRes) ? custRes : [];
      const drivList = Array.isArray(drivRes) ? drivRes : [];

      setProducts(prodList);
      setBranches(branchList);
      setCustomers(custList);
      setDrivers(drivList);

      if (branchList.length > 0 && !activeBranchId) {
        setActiveBranchId(branchList[0].id);
      }
    } catch (err) {
      console.error('Error cargando datos del POS:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch active shift for current branch
  const fetchActiveShift = async (branchId = activeBranchId) => {
    if (!branchId) return;
    try {
      const res = await fetch(`/api/pos/shift/current?branchId=${encodeURIComponent(branchId)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveShift(data.shift || null);
      }
    } catch (err) {
      console.error('Error cargando turno de caja activo:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeBranchId) {
      fetchActiveShift(activeBranchId);
    }
  }, [activeBranchId]);

  // WebSocket listeners
  useEffect(() => {
    if (socket) {
      const handleCatalogUpdate = () => fetchInitialData();
      const handleShiftOpened = (shift) => {
        if (shift.branchId === activeBranchId) setActiveShift(shift);
      };
      const handleShiftUpdated = (shift) => {
        if (shift.branchId === activeBranchId) setActiveShift(shift);
      };
      const handleShiftClosed = (shift) => {
        if (shift.branchId === activeBranchId) setActiveShift(null);
      };

      socket.on('catalog:updated', handleCatalogUpdate);
      socket.on('products:updated', handleCatalogUpdate);
      socket.on('pos:shift:opened', handleShiftOpened);
      socket.on('pos:shift:updated', handleShiftUpdated);
      socket.on('pos:shift:closed', handleShiftClosed);

      return () => {
        socket.off('catalog:updated', handleCatalogUpdate);
        socket.off('products:updated', handleCatalogUpdate);
        socket.off('pos:shift:opened', handleShiftOpened);
        socket.off('pos:shift:updated', handleShiftUpdated);
        socket.off('pos:shift:closed', handleShiftClosed);
      };
    }
  }, [socket, activeBranchId]);

  // Argentine scale barcode parser
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

    const foundByCode = products.find(p => 
      (p.barcode && p.barcode.trim() === raw) || 
      (p.sku && p.sku.trim() === raw) || 
      (p.plu && String(p.plu).trim() === raw)
    );

    if (foundByCode) {
      return { product: foundByCode, quantity: 1, isScale: false };
    }
    return null;
  };

  // Global Barcode Gun Listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      const now = Date.now();
      if (now - lastKeyTime > 120) {
        barcodeBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          e.preventDefault();
          const parsed = parseBarcodeData(barcodeBuffer);
          if (parsed && parsed.product) {
            playScannerBeep();
            handleAddToCart(parsed.product, parsed.quantity);
            setLastScannedProduct({
              name: parsed.product.name,
              code: barcodeBuffer,
              weight: parsed.isScale ? parsed.weightKg : null
            });
            setTimeout(() => setLastScannedProduct(null), 4000);
          }
          barcodeBuffer = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, activeCart]);

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
    const updated = activeCart.items.map(item => 
      item.id === productId ? { ...item, quantity: Math.round(newQty * 100) / 100 } : item
    );
    updateActiveCart({ items: updated });
  };

  const handleRemoveItem = (productId) => {
    updateActiveCart({ items: activeCart.items.filter(i => i.id !== productId) });
  };

  const handleClearCart = () => {
    if (activeCart.items.length === 0) return;
    if (window.confirm('¿Vaciar los productos del carrito actual?')) {
      updateActiveCart({ items: [], notes: '', cashReceived: '' });
    }
  };

  // Parallel Cart Tabs Management
  const handleAddNewTab = () => {
    const newId = `tab-${Date.now().toString().slice(-4)}`;
    const newTab = {
      id: newId,
      title: `Venta #${tabs.length + 1}`,
      customerName: '',
      phone: '',
      address: '',
      branchId: activeBranchId || (branches[0]?.id || ''),
      orderType: 'takeaway',
      paymentMethod: 'Efectivo',
      items: [],
      notes: '',
      cashReceived: ''
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e, tabIdToClose) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const filtered = tabs.filter(t => t.id !== tabIdToClose);
    setTabs(filtered);
    if (activeTabId === tabIdToClose) {
      setActiveTabId(filtered[filtered.length - 1].id);
    }
  };

  // Customers Quick Select
  const handleSelectCustomer = (customer) => {
    updateActiveCart({
      customerName: customer.name || customer.pushName || '',
      phone: customer.phone || '',
      address: customer.address || customer.shippingAddress || '',
      branchId: customer.preferredBranchId || activeCart.branchId || activeBranchId
    });
    setCustomerSearch('');
  };

  // Calculations
  const subtotal = activeCart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal;
  const cashNum = parseFloat(activeCart.cashReceived) || 0;
  const change = cashNum > total ? cashNum - total : 0;

  // Universal Catalog Channel Filtering: only products visible in POS and available
  const visibleProducts = products.filter(p => p.showInPos !== false && p.isAvailable !== false);

  const categories = ['all', 'Combos', 'Novillito', 'Cerdo', 'Milanesas', 'Achuras', 'Embutidos'];

  const filteredProducts = visibleProducts.filter(p => {
    const matchCat = selectedCategory === 'all' || 
      (p.category || '').toLowerCase().includes(selectedCategory.toLowerCase()) ||
      (selectedCategory === 'Combos' && p.name.toLowerCase().includes('combo'));
    const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.plu && String(p.plu).includes(productSearch));
    return matchCat && matchSearch;
  });

  // Current active branch object
  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0] || { id: 'main', name: 'Sucursal Central' };

  // User branches list
  const userBranchesList = currentUser && Array.isArray(currentUser.branches) && currentUser.branches.length > 0
    ? branches.filter(b => currentUser.branches.includes(b.id))
    : (currentUser?.branchId ? branches.filter(b => b.id === currentUser.branchId) : branches);

  // Handle Apertura de Caja
  const handleOpenShiftSubmit = async (e) => {
    e.preventDefault();
    setShiftActionLoading(true);
    try {
      const res = await fetch('/api/pos/shift/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: activeBranchId,
          branchName: activeBranch.name,
          userId: currentUser?.id || 'cajero',
          userName: currentUser?.name || 'Cajero de Turno',
          initialCash: Number(openShiftForm.initialCash) || 0,
          notes: openShiftForm.notes
        })
      });
      const data = await res.json();
      if (res.ok && data.shift) {
        setActiveShift(data.shift);
        setIsOpenShiftModalOpen(false);
        setOpenShiftForm({ initialCash: '', notes: '' });
      } else {
        alert(data.error || 'Error al abrir la caja');
      }
    } catch (err) {
      alert('Error de conexión al abrir turno');
    } finally {
      setShiftActionLoading(false);
    }
  };

  // Handle Cierre de Caja
  const handleCloseShiftSubmit = async (e) => {
    e.preventDefault();
    if (!activeShift) return;
    setShiftActionLoading(true);
    try {
      const res = await fetch('/api/pos/shift/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: activeShift.id,
          closedByUserId: currentUser?.id,
          closedByUserName: currentUser?.name,
          finalCashDeclared: Number(closeShiftForm.finalCashDeclared) || 0,
          notes: closeShiftForm.notes
        })
      });
      const data = await res.json();
      if (res.ok && data.shift) {
        setActiveShift(null);
        setIsCloseShiftModalOpen(false);
        setCloseShiftForm({ finalCashDeclared: '', notes: '' });
        alert(`✅ Turno de Caja cerrado exitosamente.\nEfectivo Esperado: $${data.shift.expectedCash.toLocaleString('es-AR')}\nDeclarado: $${data.shift.finalCashDeclared.toLocaleString('es-AR')}\nDiferencia: $${data.shift.cashDifference.toLocaleString('es-AR')}`);
      } else {
        alert(data.error || 'Error al cerrar caja');
      }
    } catch (err) {
      alert('Error de conexión al cerrar turno');
    } finally {
      setShiftActionLoading(false);
    }
  };

  // Handle Cashier Switch / Login
  const handleCashierLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    const foundUser = allUsers.find(u => u.id === loginSelectedUserId);
    if (!foundUser) {
      setLoginError('Seleccioná un usuario válido');
      return;
    }
    if (foundUser.pin && foundUser.pin !== loginPin.trim()) {
      setLoginError('PIN o contraseña incorrecta');
      return;
    }

    setCurrentUser(foundUser);
    if (onSwitchUser) onSwitchUser(foundUser);
    localStorage.setItem('wagent_user', JSON.stringify(foundUser));
    setIsCashierLoginModalOpen(false);
    setLoginPin('');
    setLoginSelectedUserId('');

    // Check if user has assigned branches and auto-prompt if multiple
    const userBranches = Array.isArray(foundUser.branches) && foundUser.branches.length > 0
      ? foundUser.branches
      : (foundUser.branchId ? [foundUser.branchId] : []);

    if (userBranches.length > 1) {
      setIsBranchSelectModalOpen(true);
    } else if (userBranches.length === 1) {
      setActiveBranchId(userBranches[0]);
    }
  };

  // Open Dispatch to Delivery / Retiro modal
  const handleOpenDispatchModal = () => {
    if (activeCart.items.length === 0) {
      alert('Agregá al menos un producto antes de derivar el pedido.');
      return;
    }
    setDispatchForm({
      customerName: activeCart.customerName || '',
      phone: activeCart.phone || '',
      address: activeCart.address || '',
      orderType: 'delivery',
      deliverySlot: 'Inmediato (30-45 min)',
      driverId: drivers[0]?.id || '',
      paymentMethod: activeCart.paymentMethod || 'Efectivo',
      notes: activeCart.notes || ''
    });
    setDispatchModal({ open: true });
  };

  // Submit Order (POS Checkout with Dual Mode: Counter vs Delivery Dispatch)
  const handleCheckout = async (sendWhatsApp = false, fiscalAction = 'ticket', customPayload = null) => {
    if (activeCart.items.length === 0) {
      alert('Agrega al menos un corte o producto al carrito.');
      return;
    }

    // Si la caja no está abierta, avisar
    if (!activeShift) {
      if (!window.confirm('⚠️ La caja registradora está cerrada. ¿Deseas registrar la venta de todas formas sin turno activo? (Se recomienda abrir caja primero)')) {
        setIsOpenShiftModalOpen(true);
        return;
      }
    }

    const isDeliveryOrder = customPayload?.orderType === 'delivery';

    const payload = customPayload || {
      customerName: activeCart.customerName || 'Cliente Mostrador',
      phone: activeCart.phone || '',
      address: activeCart.address || '',
      items: activeCart.items.map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        unitPrice: it.price,
        quantity: it.quantity,
        unit: it.unit || 'kg',
        ivaRate: 10.5,
        subtotal: it.price * it.quantity
      })),
      totalAmount: total,
      paymentMethod: activeCart.paymentMethod,
      branchId: activeBranchId || activeCart.branchId,
      branchName: activeBranch.name,
      shiftId: activeShift?.id || null,
      channel: 'pos',
      source: 'pos',
      origin: 'pos',
      orderType: 'takeaway',
      status: 'completed',
      notes: activeCart.notes 
        ? `[POS Mostrador] [${fiscalAction === 'invoice' ? 'FACTURA FISCAL' : fiscalAction === 'budget' ? 'PRESUPUESTO' : 'TICKET INTERNO'}] ${activeCart.notes}` 
        : `[POS Mostrador] [${fiscalAction === 'invoice' ? 'FACTURA FISCAL' : fiscalAction === 'budget' ? 'PRESUPUESTO' : 'TICKET INTERNO'}]`
    };

    setCheckoutModal({ isSubmitting: true, successMessage: null, order: null });

    try {
      const res = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al registrar venta en el sistema');
      let data = await res.json();
      let createdOrder = data.order || data;

      // Factura Electrónica ARCA si fue solicitada
      if (fiscalAction === 'invoice') {
        try {
          const invRes = await fetch(`/api/arca/invoice/${createdOrder.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branchId: activeBranchId })
          });
          const invData = await invRes.json();
          if (invRes.ok && invData.invoice) {
            createdOrder.invoice = invData.invoice;
          }
        } catch (invErr) {
          console.error('Error emitiendo factura ARCA:', invErr);
        }
      }

      // Notificación de WhatsApp si tiene teléfono
      if (sendWhatsApp && (payload.phone || activeCart.phone)) {
        try {
          const targetPhone = payload.phone || activeCart.phone;
          const msg = `¡Hola ${payload.customerName}! 🥩 Tu compra en República de la Carne (${activeBranch.name}) por $${Number(payload.totalAmount).toLocaleString('es-AR')} fue registrada con éxito.\nMuchas gracias por elegirnos. 🙌`;
          await fetch(`/api/chats/${encodeURIComponent(targetPhone)}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg, sendViaWhatsApp: true })
          });
        } catch (waErr) {}
      }

      setCheckoutModal({
        isSubmitting: false,
        order: createdOrder,
        successMessage: isDeliveryOrder ? '¡Pedido derivado para reparto exitosamente!' : '¡Venta registrada con éxito!'
      });

      // Limpiar carrito actual
      updateActiveCart({
        items: [],
        customerName: '',
        phone: '',
        address: '',
        notes: '',
        cashReceived: ''
      });

      // Refrescar turno activo
      fetchActiveShift(activeBranchId);

    } catch (err) {
      console.error('Error registrando venta POS:', err);
      alert('Ocurrió un error al registrar la venta: ' + err.message);
      setCheckoutModal(null);
    }
  };

  // Submit Dispatch to Delivery
  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!dispatchForm.address && dispatchForm.orderType === 'delivery') {
      alert('Ingresá la dirección de entrega para el reparto.');
      return;
    }

    const payload = {
      customerName: dispatchForm.customerName || activeCart.customerName || 'Cliente Reparto',
      phone: dispatchForm.phone || activeCart.phone || '',
      address: dispatchForm.address || '',
      shippingAddress: dispatchForm.address || '',
      items: activeCart.items.map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        unitPrice: it.price,
        quantity: it.quantity,
        unit: it.unit || 'kg',
        ivaRate: 10.5,
        subtotal: it.price * it.quantity
      })),
      totalAmount: total,
      paymentMethod: dispatchForm.paymentMethod,
      branchId: activeBranchId,
      branchName: activeBranch.name,
      shiftId: activeShift?.id || null,
      channel: 'pos',
      source: 'pos',
      origin: 'pos',
      orderType: dispatchForm.orderType,
      deliverySlot: dispatchForm.deliverySlot,
      driverId: dispatchForm.driverId || null,
      status: 'confirmed',
      notes: `[POS Derivado ${dispatchForm.orderType === 'delivery' ? 'REPARTO' : 'RETIRO'}] Slot: ${dispatchForm.deliverySlot}. ${dispatchForm.notes || ''}`
    };

    setDispatchModal(null);
    await handleCheckout(true, 'ticket', payload);
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden select-none">
      
      {/* Dedicated Transparent POS Header Bar */}
      <header className="bg-[#111b21] border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-md">
        
        {/* Left: Brand & Mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <Calculator size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider text-white uppercase">Terminal POS</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  Caja Mostrador
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Cortes & PLU's Universal</p>
            </div>
          </div>

          {/* Active Branch Badge */}
          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-800">
            <Store size={14} className="text-sky-400" />
            <span className="text-xs font-bold text-slate-200">{activeBranch.name}</span>
            {userBranchesList.length > 1 && (
              <button
                type="button"
                onClick={() => setIsBranchSelectModalOpen(true)}
                className="ml-1 p-1 hover:bg-[#182229] text-slate-400 hover:text-white rounded-lg transition text-[10px] flex items-center gap-0.5 border border-slate-800"
                title="Cambiar sucursal activa de cobro"
              >
                <span>Cambiar</span>
                <ChevronDown size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Center: Shift Status (Apertura / Cierre de Caja) */}
        <div className="flex items-center gap-2">
          {activeShift ? (
            <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/40 px-3 py-1.5 rounded-2xl text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider">Caja Abierta</span>
                <span className="text-[11px] font-bold text-white font-mono">
                  ${Number(activeShift.totalSalesAmount || 0).toLocaleString('es-AR')} ({activeShift.salesCount || 0} vtas)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCloseShiftModalOpen(true)}
                className="ml-2 px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/40 text-[10px] font-black transition"
              >
                Cerrar Caja
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-500/40 px-3 py-1.5 rounded-2xl text-xs">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-wider">Caja Cerrada</span>
                <span className="text-[10px] text-slate-400">Sin turno activo</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpenShiftModalOpen(true)}
                className="ml-2 px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-black shadow-md transition"
              >
                Abrir Caja
              </button>
            </div>
          )}
        </div>

        {/* Right: Cashier Session & Standalone Controls */}
        <div className="flex items-center gap-2 text-xs">
          {currentUser ? (
            <div 
              onClick={() => setIsCashierLoginModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 cursor-pointer transition select-none"
              title="Click para cambiar cajero"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] border border-emerald-500/30">
                {currentUser.avatar || 'C'}
              </div>
              <div className="text-left">
                <div className="font-bold text-white leading-none text-xs">{currentUser.name || 'Cajero'}</div>
                <span className="text-[9px] text-slate-400 uppercase font-medium">{currentUser.role || 'Caja'}</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCashierLoginModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 font-bold text-xs transition"
            >
              <LogIn size={14} />
              <span>Ingresar Cajero</span>
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-400 hover:text-white border border-slate-800 transition"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* If Standalone mode, provide exit button */}
          {isStandalone && onExitStandalone && (
            <button
              onClick={onExitStandalone}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition"
              title="Regresar al panel principal"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Salir</span>
            </button>
          )}
        </div>

      </header>

      {/* Parallel Cart Tabs Subheader */}
      <div className="bg-[#111b21] border-b border-slate-800 px-4 pt-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const itemCount = tab.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-2xl cursor-pointer text-xs font-bold transition-all select-none border ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-[#182229] hover:bg-[#202c33] text-slate-300 border-slate-700/80'
                }`}
              >
                <Calculator size={13} />
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] border border-dashed border-slate-700 text-slate-400 hover:text-emerald-400 text-xs font-bold transition whitespace-nowrap"
            title="Abrir nueva venta en paralelo"
          >
            <Plus size={13} />
            Nueva Venta
          </button>
        </div>

        {/* Live scanner indicator */}
        <div className="pb-2 hidden lg:flex items-center gap-3 text-xs">
          {lastScannedProduct && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold animate-pulse">
              <ScanLine size={14} />
              <span>¡Escaneado: {lastScannedProduct.name}!</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono">
            <Barcode size={16} className="text-emerald-400" />
            <span>Pistola / Balanza Lista</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column POS Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Column: Product Search & Universal Catalog Grid */}
        <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800 p-3 space-y-3">
          
          {/* Search and Category Filters */}
          <div className="space-y-2 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar corte por nombre o código PLU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#182229] border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner"
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
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                      : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat === 'all' ? '🥩 Todos los Cortes' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
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
                          ? 'border-emerald-500/80 ring-1 ring-emerald-500/40 bg-emerald-950/10'
                          : isCombo
                          ? 'border-amber-500/40 bg-amber-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-[#111b21] text-slate-400 border border-slate-800">
                            {product.plu ? `PLU ${product.plu}` : product.category || 'Corte'}
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

                      <div className="flex items-baseline justify-between pt-1 border-t border-slate-800/60">
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          ${Number(product.price).toLocaleString('es-AR')}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">
                          x {product.unit || 'kg'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Active Cart & Dual Checkout Controls */}
        <div className="w-full md:w-96 lg:w-[420px] bg-[#111b21] flex flex-col h-full border-t md:border-t-0 border-slate-800 shrink-0">
          
          {/* Customer Search & Cart Header */}
          <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={14} className="text-emerald-400" />
                Ticket Actual
              </span>
              <button
                type="button"
                onClick={handleClearCart}
                disabled={activeCart.items.length === 0}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-bold transition disabled:opacity-30 flex items-center gap-1"
              >
                <Trash2 size={12} />
                <span>Vaciar</span>
              </button>
            </div>

            {/* Customer Search Bar */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cliente o Teléfono..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#182229] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />

              {customerSearch && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[#182229] border border-slate-700 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto p-1 space-y-1">
                  {customers
                    .filter(c => 
                      (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
                      (c.phone || '').includes(customerSearch)
                    )
                    .slice(0, 5)
                    .map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-2 hover:bg-[#202c33] rounded-lg cursor-pointer text-xs flex justify-between items-center text-slate-200 transition"
                      >
                        <span className="font-bold">{c.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{c.phone}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Current Cart Customer Display */}
            {activeCart.customerName && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                <span className="text-emerald-400 font-bold truncate max-w-[200px]">
                  👤 {activeCart.customerName} {activeCart.phone && `(${activeCart.phone})`}
                </span>
                <button
                  type="button"
                  onClick={() => updateActiveCart({ customerName: '', phone: '', address: '' })}
                  className="text-slate-400 hover:text-white text-[10px]"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {activeCart.items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-2 py-12">
                <ShoppingBag size={32} className="opacity-40" />
                <p>El ticket está vacío.</p>
                <p className="text-[10px]">Escaneá con la balanza o seleccioná cortes.</p>
              </div>
            ) : (
              activeCart.items.map(item => (
                <div 
                  key={item.id} 
                  className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      ${Number(item.price).toLocaleString('es-AR')} x {item.unit || 'kg'}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5 bg-[#111b21] px-1.5 py-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleUpdateItemQty(item.id, item.quantity - 1)}
                      className="w-5 h-5 flex items-center justify-center rounded-lg bg-[#182229] hover:bg-slate-700 text-slate-300 font-bold transition"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="font-extrabold text-white text-xs w-8 text-center font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateItemQty(item.id, item.quantity + 1)}
                      className="w-5 h-5 flex items-center justify-center rounded-lg bg-[#182229] hover:bg-slate-700 text-slate-300 font-bold transition"
                    >
                      <Plus size={10} />
                    </button>
                  </div>

                  <div className="text-right min-w-[60px]">
                    <div className="font-black text-emerald-400 font-mono">
                      ${(item.price * item.quantity).toLocaleString('es-AR')}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer: Summary, Payment & Dual Checkout Actions */}
          <div className="p-3 bg-[#182229] border-t border-slate-800 space-y-2.5 shrink-0">
            
            {/* Quick Payment Method Selector */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
              {['Efectivo', 'Mercado Pago', 'Débito', 'Crédito', 'Transferencia'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateActiveCart({ paymentMethod: m })}
                  className={`px-2.5 py-1 rounded-xl font-bold whitespace-nowrap transition text-[11px] border ${
                    activeCart.paymentMethod === m
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                      : 'bg-[#111b21] text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Cash & Change Calculator (if Efectivo) */}
            {activeCart.paymentMethod === 'Efectivo' && total > 0 && (
              <div className="bg-[#111b21] p-2 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-medium">Paga con $:</span>
                  <input
                    type="number"
                    placeholder="Monto recibido"
                    value={activeCart.cashReceived}
                    onChange={(e) => updateActiveCart({ cashReceived: e.target.value })}
                    className="w-28 text-right px-2 py-1 bg-[#182229] border border-slate-700 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {change > 0 && (
                  <div className="flex items-center justify-between text-emerald-400 font-bold pt-1 border-t border-slate-800/80">
                    <span>Vuelto a entregar:</span>
                    <span className="font-mono text-sm font-black">${change.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Total Amount Display */}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider">Total a Cobrar:</span>
              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                ${total.toLocaleString('es-AR')}
              </span>
            </div>

            {/* DUAL CHECKOUT BUTTONS: Counter Sale vs Dispatch to Delivery */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              
              {/* Option A: Instant Counter Sale */}
              <button
                type="button"
                onClick={() => handleCheckout(false, 'ticket')}
                disabled={activeCart.items.length === 0}
                className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition disabled:opacity-40 select-none"
                title="Cobrar en mostrador de inmediato y emitir ticket"
              >
                <DollarSign size={16} />
                <span>Cobro Mostrador</span>
              </button>

              {/* Option B: Derived Delivery / Retiro Dispatch */}
              <button
                type="button"
                onClick={handleOpenDispatchModal}
                disabled={activeCart.items.length === 0}
                className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/40 font-black text-xs transition disabled:opacity-40 select-none"
                title="Derivar pedido para reparto a domicilio o retiro"
              >
                <Truck size={16} />
                <span>Derivar Reparto</span>
              </button>
            </div>

            {/* Fiscal Action (ARCA Invoice / Presupuesto) */}
            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => handleCheckout(false, 'invoice')}
                disabled={activeCart.items.length === 0}
                className="hover:text-blue-400 transition flex items-center gap-1"
              >
                <Receipt size={12} />
                <span>Factura ARCA</span>
              </button>

              <button
                type="button"
                onClick={() => handleCheckout(false, 'budget')}
                disabled={activeCart.items.length === 0}
                className="hover:text-amber-400 transition flex items-center gap-1"
              >
                <Calculator size={12} />
                <span>Presupuesto</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* MODAL: Apertura de Caja Registradora                                      */}
      {/* ========================================================================= */}
      {isOpenShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Coins size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Apertura de Caja Registradora</h3>
                  <p className="text-[11px] text-slate-400">Iniciar nuevo turno de cobro</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpenShiftModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleOpenShiftSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Sucursal de Operación:</label>
                <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800 text-white font-bold flex items-center gap-2">
                  <Store size={14} className="text-sky-400" />
                  <span>{activeBranch.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Cajero Responsable:</label>
                <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800 text-white font-bold flex items-center gap-2">
                  <User size={14} className="text-emerald-400" />
                  <span>{currentUser?.name || 'Cajero de Turno'}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Fondo Inicial en Efectivo ($ ARS): *</label>
                <input
                  type="number"
                  required
                  placeholder="Ej: 15000"
                  value={openShiftForm.initialCash}
                  onChange={(e) => setOpenShiftForm(prev => ({ ...prev, initialCash: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-emerald-500 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">Efectivo para cambio (vuelto) cargado en gaveta.</p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Notas / Observaciones de Entrada:</label>
                <input
                  type="text"
                  placeholder="Turno mañana / Novedades de inicio..."
                  value={openShiftForm.notes}
                  onChange={(e) => setOpenShiftForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenShiftModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={shiftActionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition shadow-lg shadow-emerald-500/20"
                >
                  {shiftActionLoading ? 'Abriendo...' : 'Confirmar Apertura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Cierre de Caja & Arqueo                                            */}
      {/* ========================================================================= */}
      {isCloseShiftModalOpen && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Coins size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Cierre de Caja y Arqueo</h3>
                  <p className="text-[11px] text-slate-400">Finalizar turno y balancear efectivo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCloseShiftSubmit} className="space-y-3 text-xs">
              {/* Shift Stats Card */}
              <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1.5 text-slate-300 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Fondo Inicial:</span>
                  <span>${Number(activeShift.initialCash || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Ventas en Efectivo:</span>
                  <span className="text-emerald-400 font-bold">+${Number(activeShift.paymentSummary?.efectivo || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Ventas Digitales / Tarjetas:</span>
                  <span>${(Number(activeShift.totalSalesAmount || 0) - Number(activeShift.paymentSummary?.efectivo || 0)).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800 text-white font-bold font-sans">
                  <span>Efectivo Esperado en Gaveta:</span>
                  <span className="text-emerald-400 font-mono text-sm">
                    ${((Number(activeShift.initialCash || 0)) + (Number(activeShift.paymentSummary?.efectivo || 0))).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Efectivo Real Contado en Gaveta ($ ARS): *</label>
                <input
                  type="number"
                  required
                  placeholder="Ingrese el monto físico contado..."
                  value={closeShiftForm.finalCashDeclared}
                  onChange={(e) => setCloseShiftForm(prev => ({ ...prev, finalCashDeclared: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-mono font-black focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              {/* Difference Preview */}
              {closeShiftForm.finalCashDeclared !== '' && (
                <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Diferencia de Caja:</span>
                  {(() => {
                    const expected = (Number(activeShift.initialCash || 0)) + (Number(activeShift.paymentSummary?.efectivo || 0));
                    const declared = Number(closeShiftForm.finalCashDeclared) || 0;
                    const diff = declared - expected;
                    return (
                      <span className={`font-mono font-extrabold text-sm ${
                        diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-sky-400' : 'text-rose-400'
                      }`}>
                        {diff >= 0 ? `+$${diff.toLocaleString('es-AR')} (Sobrante)` : `-$${Math.abs(diff).toLocaleString('es-AR')} (Faltante)`}
                      </span>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Observaciones de Cierre:</label>
                <input
                  type="text"
                  placeholder="Motivo de diferencia / retiro de dinero..."
                  value={closeShiftForm.notes}
                  onChange={(e) => setCloseShiftForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseShiftModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={shiftActionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-extrabold transition shadow-lg shadow-rose-500/20"
                >
                  {shiftActionLoading ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Derivar Pedido para Reparto / Retiro                                */}
      {/* ========================================================================= */}
      {dispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Derivar a Reparto / Retiro en Sucursal</h3>
                  <p className="text-[11px] text-slate-400">Total: ${total.toLocaleString('es-AR')} ({activeCart.items.length} cortes)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-3 text-xs">
              
              {/* Order Type Toggle: Delivery vs Takeaway */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchForm(prev => ({ ...prev, orderType: 'delivery' }))}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                    dispatchForm.orderType === 'delivery'
                      ? 'bg-sky-500 text-slate-950 shadow-md font-black'
                      : 'bg-[#111b21] text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <Bike size={14} />
                  <span>🛵 Envío a Domicilio</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchForm(prev => ({ ...prev, orderType: 'takeaway' }))}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                    dispatchForm.orderType === 'takeaway'
                      ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                      : 'bg-[#111b21] text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <Store size={14} />
                  <span>🏬 Retiro en Sucursal</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Nombre del Cliente:</label>
                  <input
                    type="text"
                    required
                    placeholder="Don Juan..."
                    value={dispatchForm.customerName}
                    onChange={(e) => setDispatchForm(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">WhatsApp / Teléfono:</label>
                  <input
                    type="text"
                    placeholder="+54 9 351..."
                    value={dispatchForm.phone}
                    onChange={(e) => setDispatchForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {dispatchForm.orderType === 'delivery' && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Dirección Completa de Entrega: *</label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Calle, Número, Barrio, Piso/Depto..."
                      value={dispatchForm.address}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Franja Horaria / Entrega:</label>
                  <select
                    value={dispatchForm.deliverySlot}
                    onChange={(e) => setDispatchForm(prev => ({ ...prev, deliverySlot: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="Inmediato (30-45 min)">⚡ Inmediato (30-45 min)</option>
                    <option value="Mediodía (11:30 - 13:30)">☀️ Mediodía (11:30 - 13:30)</option>
                    <option value="Tarde (18:00 - 20:30)">🌆 Tarde (18:00 - 20:30)</option>
                    <option value="Programado Mañana">📅 Programado Mañana</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Repartidor Asignado:</label>
                  <select
                    value={dispatchForm.driverId}
                    onChange={(e) => setDispatchForm(prev => ({ ...prev, driverId: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="">-- Asignación Automática / Libre --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.vehicle || 'Moto'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Notas de Despacho / Instrucciones:</label>
                <input
                  type="text"
                  placeholder="Tocar timbre blanco / Envolver al vacío..."
                  value={dispatchForm.notes}
                  onChange={(e) => setDispatchForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#111b21] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black transition shadow-lg shadow-sky-500/20"
                >
                  Confirmar y Despachar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Login de Cajero / Cambio de Turno                                   */}
      {/* ========================================================================= */}
      {isCashierLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Lock size={20} />
              </div>
              <h3 className="text-base font-extrabold text-white">Ingreso a Caja Mostrador</h3>
              <p className="text-xs text-slate-400">Seleccioná tu usuario e ingresá tu PIN</p>
            </div>

            <form onSubmit={handleCashierLogin} className="space-y-3 text-xs">
              {loginError && (
                <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-center font-bold">
                  {loginError}
                </div>
              )}

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Usuario / Cajero:</label>
                <select
                  required
                  value={loginSelectedUserId}
                  onChange={(e) => setLoginSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Seleccionar Cajero --</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role || 'Usuario'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">PIN / Contraseña de Acceso:</label>
                <input
                  type="password"
                  placeholder="PIN numérico"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white text-center tracking-widest font-mono text-base focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCashierLoginModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition shadow-lg shadow-emerald-500/20"
                >
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Selector de Sucursal Activa de Cobro                                */}
      {/* ========================================================================= */}
      {isBranchSelectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center mx-auto mb-2">
                <Store size={20} />
              </div>
              <h3 className="text-base font-extrabold text-white">Seleccionar Sucursal Activa</h3>
              <p className="text-xs text-slate-400">¿En qué sucursal estás cobrando en este momento?</p>
            </div>

            <div className="space-y-2 pt-1">
              {userBranchesList.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setActiveBranchId(b.id);
                    setIsBranchSelectModalOpen(false);
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                    activeBranchId === b.id
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold'
                      : 'bg-[#111b21] hover:bg-[#202c33] text-slate-300 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Store size={16} />
                    <span>{b.name}</span>
                  </div>
                  {activeBranchId === b.id && <Check size={16} className="text-sky-400" />}
                </button>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsBranchSelectModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <h3 className="text-base font-bold text-white">{checkoutModal.successMessage || '¡Venta Registrada con Éxito!'}</h3>
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
                    <span className="text-sky-400 font-semibold">{checkoutModal.order.branchName || activeBranch.name}</span>
                  </div>
                  {checkoutModal.order.orderType === 'delivery' && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dirección:</span>
                      <span className="text-amber-400 font-semibold truncate max-w-[200px]">{checkoutModal.order.address}</span>
                    </div>
                  )}
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
