import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  Clock, 
  Truck, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  MapPin, 
  DollarSign, 
  Calendar, 
  Trash2, 
  ExternalLink,
  RefreshCw,
  Package,
  Check,
  Send,
  MessageSquare,
  AlertCircle,
  X,
  Copy,
  Edit3,
  Plus,
  Save,
  CreditCard,
  Store,
  Bike,
  Users,
  LayoutGrid,
  List,
  Calculator,
  Minus,
  Navigation,
  Compass,
  Flame,
  ShoppingCart,
  Eye,
  Printer,
  Share2,
  ChevronRight,
  Receipt,
  Archive,
  ArchiveRestore,
  FolderArchive,
  Banknote,
  Coins,
  ChevronDown,
  Wallet
} from 'lucide-react';
import ClientLocationMap from './ClientLocationMap.jsx';
import TicketPrintModal from './TicketPrintModal.jsx';
import SearchableCombobox from './ui/SearchableCombobox.jsx';

const POS_CATEGORIES = [
  { id: 'all', label: '🔥 Todos' },
  { id: 'combos', label: '⭐ Combos' },
  { id: 'novillito', label: '🥩 Novillito' },
  { id: 'cerdo', label: '🐖 Cerdo' },
  { id: 'achuras', label: '🌭 Achuras' },
  { id: 'elaborados', label: '🍽️ Elaborados' },
  { id: 'almacen', label: '🍷 Carbón / Bebidas' }
];

const DEFAULT_POS_ITEMS = [
  { id: 'prod-combo-asadazo', name: 'Combo Asadazo (4 kg) + Vino', category: 'combos', price: 39999, unit: 'combo', icon: '⭐' },
  { id: 'prod-vacio', name: 'Vacío Especial Novillito', category: 'novillito', price: 11500, unit: 'kg', icon: '🥩' },
  { id: 'prod-costillar', name: 'Costillar / Asado de Tira', category: 'novillito', price: 9800, unit: 'kg', icon: '🥩' },
  { id: 'prod-tapa-cuadril', name: 'Tapa de Cuadril Seleccionada', category: 'novillito', price: 12800, unit: 'kg', icon: '🥩' },
  { id: 'prod-entrana', name: 'Entraña Fina de Novillito', category: 'novillito', price: 16900, unit: 'kg', icon: '🥩' },
  { id: 'prod-bife-chorizo', name: 'Bife de Chorizo Premium', category: 'novillito', price: 14500, unit: 'kg', icon: '🥩' },
  { id: 'prod-costeletas-cerdo', name: 'Costeletas de Cerdo (Promo 2kg)', category: 'cerdo', price: 7500, unit: 'kg', icon: '🐖' },
  { id: 'prod-matambre-cerdo', name: 'Matambre de Cerdo Tierno', category: 'cerdo', price: 8500, unit: 'kg', icon: '🐖' },
  { id: 'prod-pechito-cerdo', name: 'Pechito de Cerdo', category: 'cerdo', price: 7900, unit: 'kg', icon: '🐖' },
  { id: 'prod-chorizo-criollo', name: 'Chorizo Criollo Puro Cerdo', category: 'achuras', price: 5000, unit: 'kg', icon: '🌭' },
  { id: 'prod-morcilla-bombon', name: 'Morcilla Bombón Parrillera', category: 'achuras', price: 5200, unit: 'kg', icon: '🌭' },
  { id: 'prod-chinchulin', name: 'Chinchulines Seleccionados', category: 'achuras', price: 4200, unit: 'kg', icon: '🌭' },
  { id: 'prod-mollejas', name: 'Mollejas de Corazón', category: 'achuras', price: 18900, unit: 'kg', icon: '🌭' },
  { id: 'prod-milanesas-ternera', name: 'Milanesas de Ternera (Promo 2kg)', category: 'elaborados', price: 12495, unit: 'kg', icon: '🍽️' },
  { id: 'prod-milanesas-pollo', name: 'Milanesas de Pollo', category: 'elaborados', price: 8900, unit: 'kg', icon: '🍽️' },
  { id: 'prod-picada-especial', name: 'Picada Especial (Promo 3kg)', category: 'elaborados', price: 9000, unit: 'kg', icon: '🍽️' },
  { id: 'prod-carbon-quebracho', name: 'Carbón Quebracho Blanco', category: 'almacen', price: 2200, unit: 'bolsa', icon: '🔥' },
  { id: 'prod-vino-howlmande', name: 'Vino Howlmande Malbec', category: 'almacen', price: 5500, unit: 'botella', icon: '🍷' }
];

export const formatItemQuantity = (quantity, unit) => {
  const q = Number(quantity) || 0;
  const u = (unit || 'kg').toLowerCase();
  if (u === 'kg' || u === 'kilo' || u === 'kilos') {
    if (q < 1 && q > 0) {
      const grams = Math.round(q * 1000);
      return `${grams} g (${q} kg)`;
    }
    return `${q} kg`;
  }
  return `${q} ${u}`;
};

export const parseOrderItems = (order) => {
  if (!order) return [];

  // Helper: asigna icono según nombre
  const getIcon = (name = '') => {
    const l = name.toLowerCase();
    if (l.includes('combo') || l.includes('asadazo')) return '⭐';
    if (l.includes('chori') || l.includes('morcilla') || l.includes('chinchu') || l.includes('molleja')) return '🌭';
    if (l.includes('cerdo') || l.includes('pechito') || l.includes('costeleta')) return '🐖';
    if (l.includes('pollo') || l.includes('milanesa')) return '🍽️';
    if (l.includes('carbón') || l.includes('carbon')) return '🔥';
    if (l.includes('vino') || l.includes('malbec')) return '🍷';
    return '🥩';
  };

  // 1. Si ya tiene productos estructurados (formato moderno)
  if (Array.isArray(order.products) && order.products.length > 0) {
    return order.products.map((p, idx) => {
      const qty = Number(p.quantity) || 1;
      const unit = p.unit || 'kg';
      const name = p.name || 'Corte Seleccionado';
      const lineSubtotal = Number(p.subtotal) || (Number(p.unitPrice || p.price || 0) * qty) || 0;
      const unitPrice = Number(p.unitPrice || p.price) || (qty > 0 ? Math.round(lineSubtotal / qty) : lineSubtotal);
      return {
        id: p.id || `prod-${idx}`,
        name,
        quantity: qty,
        unit,
        price: unitPrice,
        total: lineSubtotal > 0 ? lineSubtotal : Math.round((Number(order.totalAmount) || 0) / Math.max(1, order.products.length)),
        icon: p.icon || getIcon(name)
      };
    });
  }

  // 2. Intentar parsear items como JSON string si viene así guardado
  let parsedProducts = null;
  if (typeof order.items === 'string') {
    const trimmed = order.items.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        parsedProducts = JSON.parse(trimmed);
        if (!Array.isArray(parsedProducts)) parsedProducts = [parsedProducts];
      } catch (e) { parsedProducts = null; }
    }
  }
  if (parsedProducts && parsedProducts.length > 0 && typeof parsedProducts[0] === 'object') {
    return parsedProducts.map((p, idx) => {
      const qty = Number(p.quantity || p.qty || 1);
      const name = p.name || p.product || 'Corte Seleccionado';
      const sub = Number(p.subtotal || p.total || p.price || 0) * (Number(p.quantity || 1));
      const total = Number(p.subtotal || sub || p.price || 0);
      return {
        id: p.id || `pjson-${idx}`,
        name,
        quantity: qty,
        unit: p.unit || 'kg',
        price: Number(p.unitPrice || p.price || 0) || (qty > 0 ? Math.round(total / qty) : total),
        total: total > 0 ? total : Math.round((Number(order.totalAmount) || 0) / Math.max(1, parsedProducts.length)),
        icon: p.icon || getIcon(name)
      };
    });
  }

  // 3. Normalizar items: array con posibles objetos o strings
  let rawItems = [];
  if (Array.isArray(order.items)) {
    rawItems = order.items.map((item) => {
      if (typeof item === 'object' && item !== null) {
        // Objeto en el array de items → convertir directamente
        const qty = Number(item.quantity || item.qty || 1);
        const name = item.name || item.product || 'Corte Seleccionado';
        const sub = Number(item.subtotal || 0) || (Number(item.unitPrice || item.price || 0) * qty);
        return {
          __obj: true,
          id: item.id || `oi-${Math.random()}`,
          name,
          quantity: qty,
          unit: item.unit || 'kg',
          price: Number(item.unitPrice || item.price || 0),
          total: sub > 0 ? sub : Math.round((Number(order.totalAmount) || 0)),
          icon: item.icon || getIcon(name)
        };
      }
      return String(item).trim();
    }).filter(Boolean);
  } else if (typeof order.items === 'string') {
    rawItems = order.items.split('\n').map(s => s.trim()).filter(Boolean);
  }

  // 4. Devolver directamente los que ya son objetos
  const objItems = rawItems.filter(i => i && typeof i === 'object' && i.__obj);
  const strItems = rawItems.filter(i => typeof i === 'string');

  const result = objItems.map(i => ({ ...i, __obj: undefined }));

  if (strItems.length === 0 && result.length === 0) {
    return [{
      id: 'default-0',
      name: 'Pedido de Carnicería (Cortes Seleccionados)',
      quantity: 1,
      unit: 'un',
      price: Number(order.totalAmount) || 0,
      total: Number(order.totalAmount) || 0,
      icon: '🥩'
    }];
  }

  if (result.length > 0 && strItems.length === 0) return result;

  return rawItems.map((itemStr, idx) => {
    // Si el item ya fue procesado como objeto
    if (itemStr && typeof itemStr === 'object' && itemStr.__obj) {
      const { __obj, ...rest } = itemStr;
      return rest;
    }

    let cleanStr = String(itemStr).replace(/^[•\-\*\d\.\)\s]+/, '').trim();
    let qty = 1;
    let unit = 'un';
    let lineSubtotal = 0;
    let name = cleanStr;

    // Detectar cantidad al inicio en gramos o kilos (ej: "250g de Chorizo", "500 grs", "0.25 kg", "2 kg")
    const gramMatch = cleanStr.match(/^([0-9.,]+)\s*(?:g|gr|grs|gramos)\s+(?:de\s+)?/i);
    if (gramMatch) {
      const parsedGrams = parseFloat(gramMatch[1].replace(',', '.')) || 0;
      qty = Math.round((parsedGrams / 1000) * 1000) / 1000;
      unit = 'kg';
      name = cleanStr.slice(gramMatch[0].length).trim();
    } else {
      const initialQtyMatch = cleanStr.match(/^([0-9.,]+)\s*(?:x\s*)?(kg|kilos?|combo|combos|bolsa|bolsas|botella|botellas|promo|un|unidad|unidades|piezas?)?\s+(?:de\s+)?/i);
      if (initialQtyMatch) {
        qty = parseFloat(initialQtyMatch[1].replace(',', '.')) || 1;
        if (initialQtyMatch[2]) {
          const u = initialQtyMatch[2].toLowerCase();
          unit = (u.startsWith('k') ? 'kg' : (u.startsWith('comb') ? 'combo' : (u.startsWith('bols') ? 'bolsa' : (u.startsWith('bot') ? 'botella' : 'un'))));
        }
        name = cleanStr.slice(initialQtyMatch[0].length).trim();
      }
    }

    // Detectar precio/subtotal: "— $39.999", "($39.999)", "$39.999" o "$39999"
    const priceMatch = name.match(/(?:—|\-|\()\s*\$?\s*([0-9.,]+)\s*\)?$/i);
    if (priceMatch) {
      lineSubtotal = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
      name = name.replace(/(?:—|\-|\()\s*\$?\s*[0-9.,]+\s*\)?$/i, '').trim();
    } else {
      lineSubtotal = Math.round((Number(order.totalAmount) || 0) / Math.max(1, rawItems.length));
    }

    const unitPrice = (qty > 0 && lineSubtotal > 0) ? Math.round(lineSubtotal / qty) : lineSubtotal;

    // Limpiar comillas sobrantes
    name = name.replace(/^["'"]+|["'"]+$/g, '').trim();

    return {
      id: `item-${idx}`,
      name: name || 'Corte Seleccionado',
      quantity: qty,
      unit,
      price: unitPrice,
      total: lineSubtotal > 0 ? lineSubtotal : (Number(order.totalAmount) || 0),
      icon: getIcon(name)
    };
  });
};


export const getOrderChannelBadge = (order) => {
  let ch = (order?.channel || order?.source || order?.origin || '').toUpperCase();
  if (!ch) {
    if (order?.notes?.includes('[POS') || order?.origin === 'pos' || order?.origin === 'POS') ch = 'POS';
    else if (order?.origin === 'tienda_web' || order?.origin === 'tienda' || order?.origin === 'TIENDA' || order?.notes?.includes('[WooCommerce]')) ch = 'TIENDA';
    else ch = 'WHATSAPP';
  }

  if (ch === 'POS') {
    return {
      channel: 'POS',
      label: '🏪 POS Mostrador',
      shortLabel: 'POS',
      bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: '🏪'
    };
  }
  if (ch === 'TIENDA' || ch === 'TIENDA_WEB' || ch === 'STORE') {
    return {
      channel: 'TIENDA',
      label: '🛒 Tienda Web',
      shortLabel: 'TIENDA',
      bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      icon: '🛒'
    };
  }
  return {
    channel: 'WHATSAPP',
    label: '💬 WhatsApp Bot',
    shortLabel: 'WHATSAPP',
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: '💬'
  };
};

export default function OrdersView({ socket, targetOrderId, onClearTargetOrder }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all' | 'pending' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'completed' | 'cancelled'
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'WHATSAPP' | 'TIENDA' | 'POS'
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('orders_view_mode') || 'table');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  // POS Selector State inside Order Modal
  const [posMode, setPosMode] = useState('pos'); // 'pos' | 'manual'
  const [posCategory, setPosCategory] = useState('all');
  const [posSearch, setPosSearch] = useState('');
  const [posCart, setPosCart] = useState([]); // [{ id, name, price, quantity, unit }]

  // Real Map Modal State
  const [mapModal, setMapModal] = useState(null); // null | { address, customerName, onConfirm }

  // Dedicated Detailed Order View Modal
  const [detailModal, setDetailModal] = useState(null); // null | order object

  // Status Change Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState(null); // { order, targetStatus, message, isSubmitting }

  // Create / Edit Order Modal State
  const [orderModal, setOrderModal] = useState(null); // null | { mode: 'create' | 'edit', data: { ... } }
  const [itemsInputText, setItemsInputText] = useState('');

  // Mercado Pago Payment Link Modal
  const [paymentModal, setPaymentModal] = useState(null); // null | { order, linkData, isGenerating, isSending, sendSuccess }

  // Manual Payment Registration Modal
  const [manualPaymentModal, setManualPaymentModal] = useState(null); // null | { order, paymentMethod, paymentStatus, paidAmount, transactionRef, notes, isSubmitting, success }

  // Branch Derivation Modal State
  const [deriveModal, setDeriveModal] = useState(null); // null | { order, branchId, notes, notifyClient, isDeriving, deriveSuccess }

  // Driver Assignment Modal State
  const [assignDriverModal, setAssignDriverModal] = useState(null); // null | { order, driverId, notes, notifyClient, isAssigning, assignSuccess }

  // Thermal & Multi-format Ticket Print Modal
  const [ticketPrintModal, setTicketPrintModal] = useState(null); // null | order object

  const fetchDrivers = async () => {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando repartidores:', err);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    }
  };

  const fetchCatalogProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setCatalogProducts(Array.isArray(data) && data.length > 0 ? data : DEFAULT_POS_ITEMS);
    } catch (err) {
      setCatalogProducts(DEFAULT_POS_ITEMS);
    }
  };

  const fetchOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(prev => {
          // Comparar longitud y IDs/estados para evitar re-renders innecesarios
          if (prev.length === data.length) {
            const hasChanges = data.some((item, idx) => {
              const p = prev[idx];
              return !p || p.id !== item.id || p.status !== item.status || p.paymentStatus !== item.paymentStatus || p.branchId !== item.branchId || p.driverId !== item.driverId || p.updatedAt !== item.updatedAt;
            });
            if (!hasChanges) return prev;
          }
          return data;
        });
      }
    } catch (err) {
      console.error('Error cargando pedidos:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    // Carga inicial
    fetchOrders(true);
    fetchBranches();
    fetchDrivers();
    fetchCustomers();
    fetchCatalogProducts();

    // Sincronización en segundo plano silenciosa y no intrusiva (cada 60s como salvaguarda)
    const syncInterval = setInterval(() => {
      fetchOrders(false);
    }, 60000);

    if (socket) {
      socket.on('order:new', (newOrder) => {
        setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
      });

      socket.on('order:update', (updatedOrder) => {
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      });

      socket.on('order:delete', (deletedId) => {
        setOrders(prev => prev.filter(o => o.id !== deletedId));
      });

      socket.on('orders:sync', (allOrders) => {
        if (Array.isArray(allOrders) && allOrders.length > 0) {
          setOrders(prev => {
            if (prev.length === allOrders.length && JSON.stringify(prev) === JSON.stringify(allOrders)) return prev;
            return allOrders;
          });
        }
      });

      socket.on('driver:update', () => fetchDrivers());
      socket.on('driver:new', () => fetchDrivers());

      return () => {
        clearInterval(syncInterval);
        socket.off('order:new');
        socket.off('order:update');
        socket.off('order:delete');
        socket.off('orders:sync');
        socket.off('driver:update');
        socket.off('driver:new');
      };
    }

    return () => {
      clearInterval(syncInterval);
    };
  }, [socket]);

  // Manejo de orden objetivo sin disparar re-renderizados continuos
  const targetHandledRef = React.useRef(null);
  useEffect(() => {
    if (targetOrderId && targetHandledRef.current !== targetOrderId) {
      targetHandledRef.current = targetOrderId;
      setSearch(String(targetOrderId));
      const found = orders.find(o => String(o.id) === String(targetOrderId) || String(o.id).replace(/\D/g, '') === String(targetOrderId).replace(/\D/g, ''));
      if (found) {
        setDetailModal(found);
      }
    }
  }, [targetOrderId, orders]);

  // Hardware Barcode Scanner Listener for Orders View (Escanear Ticket #ORD-XXXX)
  useEffect(() => {
    let buffer = '';
    let lastTime = Date.now();

    const handleKeyDown = (e) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const now = Date.now();
      const diff = now - lastTime;
      lastTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const code = buffer.trim();
          buffer = '';
          setSearch(code);
        } else {
          buffer = '';
        }
      } else if (e.key.length === 1) {
        if (diff > 120 && !isInput) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const syncPosCartToOrder = (cartList) => {
    const formattedLines = cartList.map(item => {
      const q = Number(item.quantity) || 1;
      const u = item.unit || 'kg';
      const isKg = u.toLowerCase() === 'kg' || u.toLowerCase().startsWith('kilo');
      const qtyStr = isKg && q < 1 ? `${Math.round(q * 1000)}g` : `${q} ${u}`;
      const lineSubtotal = Math.round(item.price * q);
      return `${qtyStr}x ${item.name} ($${lineSubtotal.toLocaleString('es-AR')})`;
    });
    const total = cartList.reduce((acc, item) => acc + Math.round(item.price * (Number(item.quantity) || 1)), 0);
    setItemsInputText(formattedLines.join('\n'));
    setOrderModal(prev => prev ? {
      ...prev,
      data: {
        ...prev.data,
        items: formattedLines,
        totalAmount: total
      }
    } : null);
  };

  const handleAddPosProduct = (prod, defaultWeight = null) => {
    setPosCart(prev => {
      const existing = prev.find(item => item.name.toLowerCase() === prod.name.toLowerCase() || item.id === prod.id);
      let updated;
      if (existing) {
        const isKg = (existing.unit || 'kg').toLowerCase() === 'kg';
        const step = isKg ? (defaultWeight || 0.5) : 1;
        const newQty = Math.round((existing.quantity + step) * 1000) / 1000;
        updated = prev.map(item => item.id === existing.id ? { ...item, quantity: newQty } : item);
      } else {
        const isKg = (prod.unit || 'kg').toLowerCase() === 'kg';
        const initialQty = defaultWeight || (isKg ? 1 : 1);
        updated = [...prev, { id: prod.id, name: prod.name, price: Number(prod.price) || 0, quantity: initialQty, unit: prod.unit || 'kg', icon: prod.icon || '🥩' }];
      }
      syncPosCartToOrder(updated);
      return updated;
    });
  };

  const handleRemovePosProduct = (prodId) => {
    setPosCart(prev => {
      const existing = prev.find(item => item.id === prodId);
      if (!existing) return prev;
      let updated;
      const isKg = (existing.unit || 'kg').toLowerCase() === 'kg';
      const step = isKg ? (existing.quantity <= 0.5 ? 0.25 : 0.5) : 1;
      const newQty = Math.round((existing.quantity - step) * 1000) / 1000;
      if (newQty > 0.04) {
        updated = prev.map(item => item.id === prodId ? { ...item, quantity: newQty } : item);
      } else {
        updated = prev.filter(item => item.id !== prodId);
      }
      syncPosCartToOrder(updated);
      return updated;
    });
  };

  const handleSetPosItemQuantity = (prodId, newQty) => {
    const q = Math.max(0, Math.round(Number(newQty) * 1000) / 1000);
    setPosCart(prev => {
      let updated;
      if (q <= 0.01) {
        updated = prev.filter(item => item.id !== prodId);
      } else {
        updated = prev.map(item => item.id === prodId ? { ...item, quantity: q } : item);
      }
      syncPosCartToOrder(updated);
      return updated;
    });
  };

  const handleStepPosWeightGrams = (prodId, deltaGrams) => {
    setPosCart(prev => {
      const existing = prev.find(item => item.id === prodId);
      if (!existing) return prev;
      const currentGrams = Math.round((Number(existing.quantity) || 1) * 1000);
      const targetGrams = Math.max(50, currentGrams + deltaGrams);
      const targetKg = Math.round(targetGrams) / 1000;
      const updated = prev.map(item => item.id === prodId ? { ...item, quantity: targetKg } : item);
    });
  };

  const handleClearPosCart = () => {
    setPosCart([]);
    syncPosCartToOrder([]);
  };

  const handleOpenMap = (address, customerName) => {
    setMapModal({
      address: address || 'Córdoba, Argentina',
      customerName: customerName || 'Cliente',
      onConfirm: (locData) => {
        if (orderModal) {
          setOrderModal(prev => prev ? {
            ...prev,
            data: {
              ...prev.data,
              address: locData.address,
              branchId: locData.closestBranch ? locData.closestBranch.id : prev.data.branchId,
              branchName: locData.closestBranch ? locData.closestBranch.name : prev.data.branchName
            }
          } : null);
        }
        setMapModal(null);
      }
    });
  };

  const generateStatusNotification = (order, targetStatus) => {
    const name = order.customerName || 'Cliente';
    const orderId = order.id;
    const address = order.address || 'tu domicilio';
    const payment = order.paymentMethod || 'Efectivo / Transferencia';

    switch (targetStatus) {
      case 'preparing':
        return `¡Hola ${name}! 🥩 Te avisamos que tu pedido #${orderId} ya está en preparación con cortes frescos por nuestro equipo de carnicería. En breve te avisamos cuando salga el repartidor.`;
      case 'ready':
      case 'ready_for_pickup':
        if (order.deliveryType === 'pickup' || order.branchName || order.branch) {
          const branch = order.branchName || order.branch || 'nuestra sucursal';
          return `¡Hola ${name}! ✨🥩 ¡Tu pedido #${orderId} YA ESTÁ LISTO y preparado en ${branch}! Podés pasar a retirarlo cuando gustes. ¡Te esperamos! 🙌`;
        }
        return `¡Hola ${name}! ✨🥩 Tu pedido #${orderId} YA ESTÁ LISTO y preparado en carnicería. Está empaquetado y listo para salir con el repartidor. 🛵`;
      case 'in_transit':
        return `¡Hola ${name}! 🚚 Tu pedido #${orderId} ya salió de sucursal y va en camino hacia ${address}. ¡Tené a mano el medio de pago acordado (${payment})! 🥩🔥`;
      case 'delivered':
        return `¡Hola ${name}! 🎉 Tu pedido #${orderId} ya figura entregado. ¡Esperamos que disfrutes de un excelente asado! Cualquier consulta o comentario sobre los cortes estamos a tu disposición. 🥩🙌`;
      case 'completed':
      case 'archived':
        return `¡Hola ${name}! 🎉 Tu pedido #${orderId} ha sido finalizado y archivado con éxito. ¡Muchas gracias por elegir República de la Carne! 🥩🙌`;
      case 'cancelled':
        return `Hola ${name}. Te informamos que tu pedido #${orderId} ha sido cancelado. Si necesitás reprogramarlo o tenés alguna duda, avisanos por acá.`;
      case 'pending':
        return `¡Hola ${name}! Tu pedido #${orderId} se encuentra registrado y pendiente de preparación.`;
      default:
        return `¡Hola ${name}! Tu pedido #${orderId} ha actualizado su estado a: ${targetStatus}.`;
    }
  };

  const handleTogglePrepared = async (order) => {
    if (!order) return;
    const nextVal = !Boolean(order.isPrepared);
    try {
      const res = await fetch(`/api/orders/${order.id}/prepare`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrepared: nextVal })
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === order.id ? data : o));
        if (detailModal && detailModal.id === order.id) {
          setDetailModal(data);
        }
      }
    } catch (err) {
      console.error('Error actualizando preparación:', err);
    }
  };

  const handleToggleArchive = async (order) => {
    if (!order) return;
    const nextArchived = !Boolean(order.isArchived || order.status === 'completed' || order.status === 'archived');
    try {
      const res = await fetch(`/api/orders/${order.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: nextArchived })
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === order.id ? data : o));
        if (detailModal && detailModal.id === order.id) {
          setDetailModal(data);
        }
      }
    } catch (err) {
      console.error('Error archivando pedido:', err);
    }
  };

  const handleRequestStatusChange = (order, targetStatus) => {
    if (order.status === targetStatus) return;
    setConfirmModal({
      order,
      targetStatus,
      message: generateStatusNotification(order, targetStatus),
      isSubmitting: false
    });
  };

  const handleConfirmStatusChange = async (notifyCustomer) => {
    if (!confirmModal) return;
    const { order, targetStatus, message } = confirmModal;

    setConfirmModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: targetStatus,
          notify: notifyCustomer,
          customMessage: message
        })
      });

      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: targetStatus } : o));
        if (detailModal && detailModal.id === order.id) {
          setDetailModal(prev => prev ? { ...prev, status: targetStatus } : null);
        }
        setConfirmModal(null);
      } else {
        alert(data.error || 'Error al cambiar estado');
        setConfirmModal(prev => ({ ...prev, isSubmitting: false }));
      }
    } catch (err) {
      console.error('Error:', err);
      setConfirmModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDuplicateOrder = (orderId) => {
    const original = orders.find(o => o.id === orderId);
    if (!original) return;
    const parsed = parseOrderItems(original);
    setPosCart(parsed.map((p, idx) => ({ id: p.id || `item-${idx}`, name: p.name, price: p.price, quantity: p.quantity, unit: p.unit, icon: p.icon })));
    setPosMode('pos');
    setOrderModal({
      mode: 'create',
      data: {
        customerName: `${original.customerName || 'Cliente'} (Copia)`,
        phone: original.phone,
        address: original.address,
        branchId: original.branchId,
        branchName: original.branchName,
        deliveryType: original.deliveryType,
        items: original.items,
        totalAmount: original.totalAmount,
        paymentMethod: original.paymentMethod,
        status: 'pending',
        notes: `Copia del pedido #${original.id}`
      }
    });
    setItemsInputText(Array.isArray(original.items) ? original.items.join('\n') : (original.items || ''));
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`¿Eliminar el pedido #${orderId}?`)) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        if (detailModal && detailModal.id === orderId) setDetailModal(null);
      }
    } catch (err) {
      console.error('Error eliminando pedido:', err);
    }
  };

  const handleQuickAssignBranch = async (orderId, branchId) => {
    const branch = branches.find(b => b.id === branchId || b.alias?.includes(branchId) || b.name.toLowerCase() === branchId.toLowerCase());
    const branchName = branch ? branch.name : (branchId ? branchId : '');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, branchId, branchName } : o));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, branchName })
      });
    } catch (err) {
      console.error('Error actualizando sucursal asignada:', err);
    }
  };

  const handleQuickAssignDriver = async (orderId, driverVal) => {
    if (driverVal === 'pickup') {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, driverId: '', driverName: '', deliveryType: 'pickup' } : o));
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverId: '', driverName: '', deliveryType: 'pickup' })
        });
      } catch (err) {
        console.error('Error actualizando entrega en local:', err);
      }
      return;
    }

    const driver = drivers.find(d => d.id === driverVal || d.name.toLowerCase() === driverVal.toLowerCase());
    const driverName = driver ? driver.name : (driverVal ? driverVal : '');
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, driverId: driverVal, driverName, deliveryType: 'delivery' } : o));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driverVal, driverName, deliveryType: 'delivery' })
      });
    } catch (err) {
      console.error('Error actualizando repartidor asignado:', err);
    }
  };

  const handleOpenCreateOrder = () => {
    const initialCart = [{ id: 'prod-combo-asadazo', name: 'Combo Asadazo (4 kg) + Vino', price: 39999, quantity: 1, unit: 'combo', icon: '⭐' }];
    setPosCart(initialCart);
    setPosMode('pos');
    setOrderModal({
      mode: 'create',
      data: {
        customerName: '',
        phone: '',
        address: '',
        items: ['1x Combo Asadazo (4 kg) + Vino ($39.999)'],
        totalAmount: 39999,
        paymentMethod: 'Efectivo al repartidor',
        status: 'pending',
        notes: ''
      }
    });
    setItemsInputText('1x Combo Asadazo (4 kg) + Vino ($39.999)');
  };

  const handleOpenEditOrder = (order) => {
    const parsedItems = parseOrderItems(order);
    const parsedCart = parsedItems.map((item, idx) => ({
      id: item.id || `item-${idx}`,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      unit: item.unit || 'kg',
      icon: item.icon || '🥩'
    }));

    setPosCart(parsedCart.length > 0 ? parsedCart : [{ id: 'item-0', name: 'Combo Asadazo', price: Number(order.totalAmount) || 0, quantity: 1, unit: 'combo', icon: '⭐' }]);
    setPosMode('pos');
    setOrderModal({
      mode: 'edit',
      data: { ...order }
    });
    setItemsInputText(Array.isArray(order.items) ? order.items.join('\n') : (order.items || ''));
  };

  const handleSaveOrderForm = async (e) => {
    e.preventDefault();
    if (!orderModal) return;

    const items = itemsInputText
      .split('\n')
      .map(i => i.trim())
      .filter(Boolean);

    const payload = {
      ...orderModal.data,
      items,
      totalAmount: Number(orderModal.data.totalAmount) || 0
    };

    try {
      if (orderModal.mode === 'create') {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const created = await res.json();
          setOrders(prev => [created, ...prev]);
          setOrderModal(null);
        }
      } else {
        const res = await fetch(`/api/orders/${orderModal.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const updated = await res.json();
          setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
          setOrderModal(null);
        }
      }
    } catch (err) {
      console.error('Error guardando pedido:', err);
    }
  };

  const handleOpenPaymentLink = async (order) => {
    setPaymentModal({
      order,
      linkData: null,
      isGenerating: true,
      isSending: false,
      sendSuccess: false
    });

    try {
      const res = await fetch('/api/mercadopago/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          amount: order.totalAmount,
          customerName: order.customerName,
          phone: order.phone,
          items: order.items,
          sendWhatsApp: false
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPaymentModal(prev => ({ ...prev, linkData: data, isGenerating: false }));
      } else {
        alert(`Error generando link de Mercado Pago: ${data.error || 'Verifica credenciales'}`);
        setPaymentModal(null);
      }
    } catch (err) {
      console.error('Error:', err);
      setPaymentModal(null);
    }
  };

  const handleSendPaymentLinkWhatsApp = async () => {
    if (!paymentModal || !paymentModal.order) return;
    setPaymentModal(prev => ({ ...prev, isSending: true }));
    try {
      const res = await fetch('/api/mercadopago/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: paymentModal.order.id,
          amount: paymentModal.order.totalAmount,
          customerName: paymentModal.order.customerName,
          phone: paymentModal.order.phone,
          items: paymentModal.order.items,
          sendWhatsApp: true
        })
      });
      if (res.ok) {
        setPaymentModal(prev => ({ ...prev, isSending: false, sendSuccess: true }));
        setTimeout(() => setPaymentModal(null), 2500);
      }
    } catch (err) {
      console.error('Error enviando WhatsApp:', err);
      setPaymentModal(prev => ({ ...prev, isSending: false }));
    }
  };

  const handleSimulatePayment = async () => {
    if (!paymentModal || !paymentModal.order) return;
    setPaymentModal(prev => ({ ...prev, isSimulating: true }));
    try {
      const res = await fetch('/api/mercadopago/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: paymentModal.order.id })
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
        setPaymentModal(prev => ({ ...prev, isSimulating: false, simulateSuccess: true }));
        setTimeout(() => setPaymentModal(null), 2000);
      } else {
        alert(data.error || 'Error al simular pago');
        setPaymentModal(prev => ({ ...prev, isSimulating: false }));
      }
    } catch (err) {
      console.error('Error simulando pago:', err);
      setPaymentModal(prev => ({ ...prev, isSimulating: false }));
    }
  };

  const handleVerifyPayment = async (orderId) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/verify-payment`, { method: 'POST' });
      const data = await res.json();
      if (data.verified) {
        alert(`¡Pago verificado con éxito en Mercado Pago! 🎉 Monto: $${Number(data.payment?.transaction_amount || 0).toLocaleString('es-AR')}`);
        if (data.order) {
          setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
        }
        if (paymentModal && paymentModal.order.id === orderId) {
          setPaymentModal(null);
        }
      } else {
        alert(data.message || 'No se encontró una transacción acreditada para este pedido en Mercado Pago.');
      }
    } catch (err) {
      console.error('Error verificando pago:', err);
      alert('Error al consultar estado en Mercado Pago');
    }
  };

  const handleOpenManualPayment = (order) => {
    const total = Number(order.totalAmount) || 0;
    const defaultReceived = order.cashReceived !== undefined && order.cashReceived !== null ? order.cashReceived : total;
    const defaultPaid = order.paidAmount !== undefined && order.paidAmount !== null ? order.paidAmount : total;
    const defaultChange = order.changeAmount !== undefined && order.changeAmount !== null ? order.changeAmount : Math.max(0, defaultReceived - defaultPaid);

    setManualPaymentModal({
      order,
      paymentMethod: order.paymentMethod || 'Efectivo al Repartidor',
      paymentStatus: order.paymentStatus || 'paid',
      paidAmount: defaultPaid,
      cashReceived: defaultReceived,
      changeAmount: defaultChange,
      transactionRef: order.paymentReference || '',
      notes: order.paymentNotes || '',
      printTicketAfter: false,
      isSubmitting: false,
      success: false
    });
  };

  const handleQuickUpdatePaymentStatus = async (orderId, newStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const total = Number(order.totalAmount) || 0;
      const paid = newStatus === 'paid' ? total : (newStatus === 'pending' ? 0 : (order.paidAmount || total));
      const received = order.cashReceived !== undefined && order.cashReceived !== null ? order.cashReceived : paid;
      const change = Math.max(0, received - paid);

      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: order.paymentMethod || 'Efectivo al Repartidor',
          paymentStatus: newStatus,
          paidAmount: paid,
          cashReceived: received,
          changeAmount: change,
          transactionRef: order.paymentReference || '',
          notes: order.paymentNotes || ''
        })
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
      }
    } catch (err) {
      console.error('Error actualizando estado de pago:', err);
    }
  };

  const handleQuickUpdatePaymentMethod = async (orderId, newMethod) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const total = Number(order.totalAmount) || 0;
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: newMethod,
          paymentStatus: order.paymentStatus || 'pending',
          paidAmount: order.paidAmount !== undefined && order.paidAmount !== null ? order.paidAmount : total,
          cashReceived: order.cashReceived || null,
          changeAmount: order.changeAmount || 0,
          transactionRef: order.paymentReference || '',
          notes: order.paymentNotes || ''
        })
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
      }
    } catch (err) {
      console.error('Error actualizando medio de pago:', err);
    }
  };

  const handleSaveManualPayment = async (e) => {
    if (e) e.preventDefault();
    if (!manualPaymentModal) return;

    const total = Number(manualPaymentModal.order.totalAmount) || 0;
    const paid = Number(manualPaymentModal.paidAmount) || total;
    const received = manualPaymentModal.cashReceived !== '' && manualPaymentModal.cashReceived !== null ? Number(manualPaymentModal.cashReceived) : paid;
    const change = Math.max(0, received - paid);

    setManualPaymentModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      const res = await fetch(`/api/orders/${manualPaymentModal.order.id}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: manualPaymentModal.paymentMethod,
          paymentStatus: manualPaymentModal.paymentStatus,
          paidAmount: paid,
          cashReceived: received,
          changeAmount: change,
          transactionRef: manualPaymentModal.transactionRef,
          notes: manualPaymentModal.notes
        })
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
        setManualPaymentModal(prev => ({ ...prev, isSubmitting: false, success: true }));
        const orderSaved = data.order;
        const shouldPrint = manualPaymentModal.printTicketAfter;
        setTimeout(() => {
          setManualPaymentModal(null);
          if (shouldPrint) {
            setTicketPrintModal(orderSaved);
          }
        }, 1200);
      } else {
        alert(data.error || 'Error registrando pago manual');
        setManualPaymentModal(prev => ({ ...prev, isSubmitting: false }));
      }
    } catch (err) {
      console.error('Error registrando pago manual:', err);
      setManualPaymentModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleOpenDeriveModal = (order) => {
    setDeriveModal({
      order,
      branchId: order.branchId || (branches.length > 0 ? branches[0].id : ''),
      notes: '',
      notifyClient: true,
      isDeriving: false,
      deriveSuccess: false
    });
  };

  const handleExecuteDerive = async (e) => {
    e.preventDefault();
    if (!deriveModal || !deriveModal.branchId) return;

    setDeriveModal(prev => ({ ...prev, isDeriving: true }));
    try {
      const res = await fetch(`/api/orders/${deriveModal.order.id}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: deriveModal.branchId,
          notes: deriveModal.notes,
          notifyClient: deriveModal.notifyClient
        })
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
        setDeriveModal(prev => ({ ...prev, isDeriving: false, deriveSuccess: true }));
        setTimeout(() => setDeriveModal(null), 2500);
      } else {
        alert(data.error || 'Error derivando pedido a la sucursal');
        setDeriveModal(prev => ({ ...prev, isDeriving: false }));
      }
    } catch (err) {
      console.error('Error derivando pedido:', err);
      setDeriveModal(prev => ({ ...prev, isDeriving: false }));
    }
  };

  const handleOpenAssignDriverModal = (order) => {
    setAssignDriverModal({
      order,
      driverId: order.driverId || (drivers.length > 0 ? drivers[0].id : ''),
      notes: '',
      notifyClient: true,
      isAssigning: false,
      assignSuccess: false
    });
  };

  const handleExecuteAssignDriver = async (e) => {
    e.preventDefault();
    if (!assignDriverModal || !assignDriverModal.driverId) return;

    setAssignDriverModal(prev => ({ ...prev, isAssigning: true }));
    try {
      const res = await fetch(`/api/orders/${assignDriverModal.order.id}/assign-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: assignDriverModal.driverId,
          notes: assignDriverModal.notes,
          notifyClient: assignDriverModal.notifyClient
        })
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
        setAssignDriverModal(prev => ({ ...prev, isAssigning: false, assignSuccess: true }));
        setTimeout(() => setAssignDriverModal(null), 2500);
      } else {
        alert(data.error || 'Error asignando repartidor');
        setAssignDriverModal(prev => ({ ...prev, isAssigning: false }));
      }
    } catch (err) {
      console.error('Error asignando repartidor:', err);
      setAssignDriverModal(prev => ({ ...prev, isAssigning: false }));
    }
  };

  // Metrics
  const totalRevenue = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length;
  const readyCount = orders.filter(o => o.status === 'ready' || o.status === 'ready_for_pickup' || o.isPrepared).length;
  const inTransitCount = orders.filter(o => o.status === 'in_transit').length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const completedCount = orders.filter(o => o.status === 'completed' || o.status === 'archived' || o.isArchived).length;

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.phone || '').includes(search) ||
      (order.address || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.id || '').toLowerCase().includes(search.toLowerCase());

    const isOrderArchived = Boolean(order.isArchived) || order.status === 'completed' || order.status === 'archived';
    let matchesStatus = true;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'active') {
      matchesStatus = !isOrderArchived && order.status !== 'cancelled';
    } else if (statusFilter === 'completed' || statusFilter === 'archived') {
      matchesStatus = isOrderArchived;
    } else if (statusFilter === 'ready') {
      matchesStatus = (order.status === 'ready' || order.status === 'ready_for_pickup' || order.isPrepared) && !isOrderArchived;
    } else {
      matchesStatus = order.status === statusFilter;
    }

    let ch = (order.channel || order.source || order.origin || '').toUpperCase();
    if (!ch) {
      if (order.notes?.includes('[POS') || order.origin === 'pos' || order.origin === 'POS') ch = 'POS';
      else if (order.origin === 'tienda_web' || order.origin === 'tienda' || order.origin === 'TIENDA' || order.notes?.includes('[WooCommerce]')) ch = 'TIENDA';
      else ch = 'WHATSAPP';
    }
    const matchesChannel = channelFilter === 'all' || ch === channelFilter;

    return matchesSearch && matchesStatus && matchesChannel;
  });

  // Multi-selección y acciones masivas
  const handleToggleSelectAllOrders = () => {
    if (selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    }
  };

  const handleToggleSelectOrder = (id) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkUpdateStatus = async (targetStatus) => {
    try {
      const res = await fetch('/api/orders/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrderIds, status: targetStatus })
      });
      if (res.ok) {
        await fetchOrders();
        setSelectedOrderIds([]);
      }
    } catch (e) {
      console.error('Error actualizando estados en lote:', e);
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar los ${selectedOrderIds.length} pedidos seleccionados?`)) return;
    try {
      const res = await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrderIds })
      });
      if (res.ok) {
        await fetchOrders();
        setSelectedOrderIds([]);
      }
    } catch (e) {
      console.error('Error eliminando pedidos en lote:', e);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock size={12} /> Pendiente</span>;
      case 'preparing':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20"><Package size={12} /> En Preparación</span>;
      case 'ready':
      case 'ready_for_pickup':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm"><CheckCircle2 size={12} /> ✨ Listo</span>;
      case 'in_transit':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20"><Truck size={12} /> En Camino</span>;
      case 'delivered':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={12} /> Entregado</span>;
      case 'completed':
      case 'archived':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700/40 text-slate-300 border border-slate-600/40"><FolderArchive size={12} /> 📦 Finalizado / Archivado</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle size={12} /> Cancelado</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6">
      
      {/* Header & Stats Banner */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ShoppingBag className="text-emerald-400" />
              Gestión de Pedidos y Ventas
            </h1>
            <p className="text-xs text-slate-400">
              Crea, edita, duplica y despacha pedidos con aviso automático por WhatsApp
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreateOrder}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md transition"
            >
              <Plus size={14} />
              Nuevo Pedido
            </button>

            <button
              onClick={fetchOrders}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs transition"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">Total Facturado</div>
              <div className="text-lg font-bold text-white">${totalRevenue.toLocaleString('es-AR')}</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">En Preparación</div>
              <div className="text-lg font-bold text-amber-400">{pendingCount} pedidos</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">✨ Listos / Prep.</div>
              <div className="text-lg font-bold text-teal-400">{readyCount} pedidos</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Truck size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">En Reparto</div>
              <div className="text-lg font-bold text-purple-400">{inTransitCount} pedidos</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">Entregados</div>
              <div className="text-lg font-bold text-emerald-400">{deliveredCount} pedidos</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-700/30 text-slate-300 flex items-center justify-center">
              <Archive size={20} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">Archivados</div>
              <div className="text-lg font-bold text-slate-300">{completedCount} pedidos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter, Search and View Mode Bar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-[#111b21] p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono, dirección o # de pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
          {/* Filtro por Canal de Origen */}
          <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-slate-800 shrink-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'WHATSAPP', label: '💬 WhatsApp' },
              { id: 'TIENDA', label: '🛒 Tienda' },
              { id: 'POS', label: '🏪 POS' }
            ].map(ch => (
              <button
                key={ch.id}
                onClick={() => setChannelFilter(ch.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  channelFilter === ch.id
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {/* Filtro por Estado */}
          <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-slate-800 shrink-0 overflow-x-auto">
            {[
              { id: 'active', label: '🚀 Activos' },
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: '⏳ Pendientes' },
              { id: 'preparing', label: '🥩 Preparación' },
              { id: 'ready', label: '✨ Listos' },
              { id: 'in_transit', label: '🚚 En Camino' },
              { id: 'delivered', label: '✅ Entregados' },
              { id: 'completed', label: '📦 Finalizados / Archivados' },
              { id: 'cancelled', label: '❌ Cancelados' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Toggle View Mode: List / Table vs Grid / Cards */}
          <div className="flex items-center bg-[#182229] border border-slate-700/60 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                localStorage.setItem('orders_view_mode', 'table');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'table' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista en Lista / Tabla detallada"
            >
              <List size={14} />
              <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                localStorage.setItem('orders_view_mode', 'grid');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'grid' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista en Tarjetas"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Tarjetas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Orders Content */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-500">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
          Cargando pedidos...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-16 bg-[#182229] border border-slate-800 rounded-3xl text-center p-8 space-y-3">
          <ShoppingBag size={36} className="mx-auto text-slate-600" />
          <div className="text-sm font-bold text-white">No hay pedidos registrados</div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Cuando un cliente confirme su pedido por WhatsApp, Tienda Web o POS, aparecerá aquí.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* VISTA EN FORMATO LISTA / TABLA DETALLADA */
        <div className="bg-[#182229] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#111b21] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0}
                      onChange={handleToggleSelectAllOrders}
                      className="rounded text-emerald-500 bg-[#182229] border-slate-700 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Pedido ID</th>
                  <th className="py-3 px-4">Origen / Canal</th>
                  <th className="py-3 px-4">Fecha / Hora</th>
                  <th className="py-3 px-4">Cliente & Contacto</th>
                  <th className="py-3 px-4">Cortes / Ítems</th>
                  <th className="py-3 px-4">Preparación</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Entrega / Sucursal</th>
                  <th className="py-3 px-4">Pago</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map(order => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  return (
                  <tr key={order.id} className={`transition-colors ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-[#202c33]/50'}`}>
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOrder(order.id)}
                        className="rounded text-emerald-500 bg-[#182229] border-slate-700 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      #{order.id}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {(() => {
                        const b = getOrderChannelBadge(order);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${b.bg}`}>
                            {b.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(order.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}{' '}
                      {new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-4 min-w-[160px]">
                      <div className="font-bold text-white truncate">{order.customerName || 'Cliente'}</div>
                      <div className="text-slate-400 text-[11px] font-mono">{order.phone || 'Sin teléfono'}</div>
                    </td>
                    <td className="py-3.5 px-4 min-w-[220px] max-w-sm">
                      <div 
                        onClick={() => setDetailModal(order)}
                        className="cursor-pointer group flex flex-col gap-1"
                        title="Haz clic para ver el detalle y desglose completo del pedido"
                      >
                        <div className="flex flex-wrap gap-1">
                          {parseOrderItems(order).slice(0, 2).map((prod, idx) => (
                            <span 
                              key={idx} 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#111b21] border border-slate-800 group-hover:border-emerald-500/50 text-slate-200 text-[11px] font-medium transition truncate max-w-[200px]"
                            >
                              <span>{prod.icon}</span>
                              <span className="font-bold text-emerald-400 font-mono">{prod.quantity}{prod.unit !== 'un' ? prod.unit : 'x'}</span>
                              <span className="truncate">{prod.name}</span>
                            </span>
                          ))}
                          {parseOrderItems(order).length > 2 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                              +{parseOrderItems(order).length - 2} más
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 group-hover:text-emerald-400 flex items-center gap-1 transition">
                          <Eye size={10} /> Clic para abrir detalle
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleTogglePrepared(order)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition border shadow-sm ${
                          order.isPrepared || order.status === 'ready' || order.status === 'ready_for_pickup'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-amber-500/10 text-amber-300/90 border-amber-500/20 hover:bg-amber-500/20'
                        }`}
                        title={order.isPrepared ? `Preparado el ${new Date(order.preparedAt || order.updatedAt).toLocaleTimeString('es-AR')}. Clic para alternar.` : 'Pendiente de corte/pesado. Clic para marcar como preparado.'}
                      >
                        <Flame size={12} className={order.isPrepared || order.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'} />
                        <span>{order.isPrepared || order.status === 'ready' ? '🥩 Preparado' : '⏳ Sin Preparar'}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-white whitespace-nowrap">
                      ${(Number(order.totalAmount) || 0).toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <select
                        value={order.status}
                        onChange={(e) => handleRequestStatusChange(order, e.target.value)}
                        className="bg-[#111b21] border border-slate-700/80 text-[11px] font-semibold text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="pending">⏳ Pendiente</option>
                        <option value="preparing">🥩 Preparación</option>
                        <option value="ready">✨ Listo / Preparado</option>
                        <option value="in_transit">🚚 En Camino</option>
                        <option value="delivered">✅ Entregado</option>
                        <option value="completed">📦 Finalizado / Archivado</option>
                        <option value="cancelled">❌ Cancelado</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 max-w-[180px]">
                      <div className="text-slate-300 truncate font-medium flex items-center gap-1" title={order.address || 'A convenir'}>
                        <MapPin size={11} className="text-rose-400 shrink-0" />
                        <span className="truncate">{order.address || 'A convenir'}</span>
                      </div>
                      {order.branchName && (
                        <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                          <Store size={10} className="shrink-0" />
                          <span className="truncate">{order.branchName}</span>
                        </div>
                      )}
                      {order.driverName && (
                        <div className="text-[10px] text-sky-400 flex items-center gap-1 mt-0.5 truncate">
                          <Bike size={10} className="shrink-0" />
                          <span className="truncate">{order.driverName}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-[11px]">
                      <div className="text-slate-300 font-semibold">{order.paymentMethod || 'Efectivo'}</div>
                      {order.mpPaymentId ? (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> MP Pagado
                        </span>
                      ) : order.paymentLink ? (
                        <span className="text-[10px] text-sky-400">Link enviado</span>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setTicketPrintModal(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Imprimir Ticket Térmico / Comanda (80mm, 58mm, A4)"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          onClick={() => setDetailModal(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Ver Detalle Completo del Pedido"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenMap(order.address, order.customerName)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Ver Ubicación en Mapa de Córdoba"
                        >
                          <MapPin size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenAssignDriverModal(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                          title="Asignar Repartidor por WhatsApp"
                        >
                          <Bike size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenDeriveModal(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Derivar a Sucursal"
                        >
                          <Store size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenPaymentLink(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-[#009ee3]/20 text-slate-400 hover:text-[#009ee3] border border-slate-700/60 transition"
                          title="Cobrar / Link Mercado Pago"
                        >
                          <CreditCard size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenManualPayment(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Registrar Pago Manual (Efectivo / Transferencia)"
                        >
                          <DollarSign size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenEditOrder(order)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Editar pedido con POS"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDuplicateOrder(order.id)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                          title="Duplicar pedido"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleArchive(order)}
                          className={`p-1.5 rounded-lg border transition ${
                            order.isArchived || order.status === 'completed'
                              ? 'bg-slate-700/50 hover:bg-slate-600/50 text-emerald-400 border-slate-600'
                              : 'bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-white border-slate-700/60'
                          }`}
                          title={order.isArchived || order.status === 'completed' ? 'Desarchivar pedido' : 'Finalizar y Archivar pedido'}
                        >
                          {order.isArchived || order.status === 'completed' ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                        </button>
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                          title="Eliminar pedido"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA EN FORMATO CUADRÍCULA / TARJETAS */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map(order => (
            <div
              key={order.id}
              className="bg-[#182229] border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-lg transition"
            >
              {/* Card Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-emerald-400 font-mono">
                    #{order.id}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const b = getOrderChannelBadge(order);
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${b.bg}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {getStatusBadge(order.status)}
                    <button
                      type="button"
                      onClick={() => handleTogglePrepared(order)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                        order.isPrepared || order.status === 'ready' || order.status === 'ready_for_pickup'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-300/80 border-amber-500/20 hover:bg-amber-500/20'
                      }`}
                      title={order.isPrepared ? 'Preparado en carnicería. Clic para alternar.' : 'Sin preparar. Clic para marcar preparado.'}
                    >
                      <Flame size={10} className={order.isPrepared || order.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'} />
                      {order.isPrepared || order.status === 'ready' ? '🥩 Preparado' : '⏳ Sin Preparar'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white truncate">{order.customerName}</h3>
                  <span className="text-xs font-bold text-emerald-400">${(Number(order.totalAmount) || 0).toLocaleString('es-AR')}</span>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="text-slate-500" />
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                  <span className="text-slate-400">{order.phone}</span>
                </div>
              </div>

              {/* Destination Address */}
              <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
                  <MapPin size={13} className="text-rose-400 shrink-0" />
                  <span>Dirección de Entrega:</span>
                </div>
                <div className="text-slate-200 font-medium pl-5 truncate">{order.address || 'A convenir'}</div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  <span>Detalle de Cortes & Productos:</span>
                  <button
                    type="button"
                    onClick={() => setDetailModal(order)}
                    className="text-emerald-400 hover:text-emerald-300 normal-case font-semibold text-[11px] flex items-center gap-0.5"
                  >
                    <Eye size={11} /> Ver Desglose
                  </button>
                </div>
                <div className="bg-[#111b21] rounded-xl p-2 border border-slate-800 text-xs text-slate-300 space-y-1 max-h-32 overflow-y-auto divide-y divide-slate-800/40">
                  {parseOrderItems(order).map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 pt-1 first:pt-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs shrink-0">{prod.icon}</span>
                        <span className="font-semibold text-slate-200 text-[11px] truncate">{prod.name}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold text-[10px] shrink-0 font-mono">
                          {formatItemQuantity(prod.quantity, prod.unit)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 text-[11px] shrink-0">
                        ${prod.total.toLocaleString('es-AR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Branch Assignment Inline Select */}
              <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800/80 hover:border-emerald-500/50 flex items-center justify-between text-xs transition">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Store size={13} className="text-emerald-400 shrink-0" />
                  <select
                    value={order.branchId || ''}
                    onChange={(e) => handleQuickAssignBranch(order.id, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer truncate appearance-none"
                    title="Cambiar sucursal asignada (clic para seleccionar)"
                  >
                    <option value="" className="bg-[#111b21] text-slate-400">🏢 Sin Sucursal / Central</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#111b21] text-slate-200">
                        🏢 {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {order.branchStatus && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                      order.branchStatus === 'accepted'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : order.branchStatus === 'ready'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : order.branchStatus === 'derived'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-700'
                    }`}>
                      {order.branchStatus === 'accepted' ? '🥩 Aceptado' : order.branchStatus === 'ready' ? '🚚 Listo' : order.branchStatus === 'derived' ? '⏳ Derivado' : order.branchStatus}
                    </span>
                  )}
                  <ChevronDown size={11} className="text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Quick Driver / Reparto Assignment Inline Select */}
              <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800/80 hover:border-sky-500/50 flex items-center justify-between text-xs transition">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Bike size={13} className="text-sky-400 shrink-0" />
                  <select
                    value={order.deliveryType === 'pickup' ? 'pickup' : (order.driverId || '')}
                    onChange={(e) => handleQuickAssignDriver(order.id, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer truncate appearance-none"
                    title="Cambiar repartidor o modalidad de entrega (clic para seleccionar)"
                  >
                    <option value="" className="bg-[#111b21] text-slate-400">🛵 Sin Repartidor Asignado</option>
                    <option value="pickup" className="bg-[#111b21] text-purple-300 font-bold">🏪 Retiro en Sucursal / Local</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id} className="bg-[#111b21] text-slate-200">
                        🛵 {d.name} ({d.vehicle || 'Moto'}) {d.status === 'busy' ? '• En viaje' : '• Libre'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {order.driverStatus && order.deliveryType !== 'pickup' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                      order.driverStatus === 'in_transit'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : order.driverStatus === 'delivered'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {order.driverStatus === 'in_transit' ? '🛵 En Camino' : order.driverStatus === 'delivered' ? '✅ Entregado' : '⏳ Asignado'}
                    </span>
                  )}
                  <ChevronDown size={11} className="text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Quick Payment Method & Status Assignment Inline Row */}
              <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800/80 hover:border-emerald-500/50 flex items-center justify-between text-xs transition gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Wallet size={13} className="text-emerald-400 shrink-0" />
                  <select
                    value={order.paymentMethod || 'Efectivo al Repartidor'}
                    onChange={(e) => handleQuickUpdatePaymentMethod(order.id, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer truncate appearance-none"
                    title="Cambiar medio de pago acordado (clic para seleccionar)"
                  >
                    <option value="Efectivo al Repartidor" className="bg-[#111b21] text-slate-200">💵 Efectivo al Repartidor</option>
                    <option value="Transferencia Bancaria (Alias)" className="bg-[#111b21] text-slate-200">📱 Transferencia MP / Bancaria</option>
                    <option value="Mercado Pago (Manual / POS)" className="bg-[#111b21] text-slate-200">💳 Mercado Pago (QR / Link)</option>
                    <option value="Tarjeta Débito en Sucursal" className="bg-[#111b21] text-slate-200">💳 Tarjeta Débito</option>
                    <option value="Tarjeta Crédito en Sucursal" className="bg-[#111b21] text-slate-200">💳 Tarjeta Crédito</option>
                    <option value="Cuenta Corriente" className="bg-[#111b21] text-slate-200">📑 Cuenta Corriente</option>
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickUpdatePaymentStatus(order.id, order.paymentStatus === 'paid' ? 'pending' : 'paid')}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                      order.paymentStatus === 'paid'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                        : order.paymentStatus === 'partial'
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                    }`}
                    title="Clic para cambiar estado de pago rápido"
                  >
                    {order.paymentStatus === 'paid' ? '✅ Pagado' : order.paymentStatus === 'partial' ? '🌓 Parcial' : '⏳ Pendiente'}
                  </button>
                  {Number(order.changeAmount) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono font-bold" title="Vuelto registrado">
                      💵 ${Number(order.changeAmount).toLocaleString('es-AR')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenManualPayment(order)}
                    className="p-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition"
                    title="Abrir calculadora de cobro y vuelto"
                  >
                    <DollarSign size={12} />
                  </button>
                </div>
              </div>

              {/* Status Selector & Redesigned Actions Bar (Zero Overflow) */}
              <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                {/* Full-width Order Status Selector */}
                <select
                  value={order.status}
                  onChange={(e) => handleRequestStatusChange(order, e.target.value)}
                  className="w-full bg-[#111b21] border border-slate-700/80 text-xs font-bold text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="pending">⏳ Pendiente</option>
                  <option value="preparing">🥩 En Preparación</option>
                  <option value="ready">✨ Listo / Preparado</option>
                  <option value="in_transit">🚚 En Camino</option>
                  <option value="delivered">✅ Entregado</option>
                  <option value="completed">📦 Finalizado / Archivado</option>
                  <option value="cancelled">❌ Cancelado</option>
                </select>

                {/* Primary High-Impact Actions Grid */}
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => handleOpenManualPayment(order)}
                    className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] shadow-sm shadow-emerald-500/20 transition"
                    title="Cobrar / Registrar Pago con Vuelto"
                  >
                    <DollarSign size={13} className="shrink-0" />
                    <span className="truncate">Cobrar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTicketPrintModal(order)}
                    className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-200 border border-slate-700 font-bold text-[11px] transition"
                    title="Imprimir Ticket Térmico / Comanda"
                  >
                    <Printer size={13} className="shrink-0 text-slate-400" />
                    <span className="truncate">Ticket</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailModal(order)}
                    className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-200 border border-slate-700 font-bold text-[11px] transition"
                    title="Ver Desglose y Detalles del Pedido"
                  >
                    <Eye size={13} className="shrink-0 text-slate-400" />
                    <span className="truncate">Desglose</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditOrder(order)}
                    className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold text-[11px] transition"
                    title="Editar Cortes en Punto de Venta (POS)"
                  >
                    <Edit3 size={13} className="shrink-0 text-sky-400" />
                    <span className="truncate">POS</span>
                  </button>
                </div>

                {/* Secondary Tools Row (7 Uniform Width Buttons Grid - Zero Overflow) */}
                <div className="grid grid-cols-7 gap-1 w-full pt-1.5 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleOpenMap(order.address, order.customerName)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800 flex items-center justify-center transition"
                    title="Ver Ubicación en Mapa de Córdoba"
                  >
                    <MapPin size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAssignDriverModal(order)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-sky-400 border border-slate-800 flex items-center justify-center transition"
                    title="Asignar Repartidor y Despachar"
                  >
                    <Bike size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenDeriveModal(order)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 flex items-center justify-center transition"
                    title="Derivar Pedido a Sucursal"
                  >
                    <Store size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPaymentLink(order)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-[#009ee3]/20 text-slate-400 hover:text-[#009ee3] border border-slate-800 flex items-center justify-center transition"
                    title="Generar Link de Pago Mercado Pago"
                  >
                    <CreditCard size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicateOrder(order.id)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-purple-400 border border-slate-800 flex items-center justify-center transition"
                    title="Duplicar / Clonar Pedido"
                  >
                    <Copy size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleArchive(order)}
                    className={`p-1.5 rounded-lg border flex items-center justify-center transition ${
                      order.isArchived || order.status === 'completed'
                        ? 'bg-slate-700/50 hover:bg-slate-600 text-emerald-400 border-slate-600'
                        : 'bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                    }`}
                    title={order.isArchived || order.status === 'completed' ? 'Desarchivar pedido' : 'Finalizar y Archivar pedido'}
                  >
                    {order.isArchived || order.status === 'completed' ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(order.id)}
                    className="p-1.5 rounded-lg bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center justify-center transition"
                    title="Eliminar Pedido"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEDICATED FULL ORDER DETAILS MODAL (PRODUCTOS & DESGLOSE COMPLETO) */}
      {/* ========================================================================= */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-5 sm:p-6 w-full max-w-3xl shadow-2xl space-y-5 my-auto max-h-[95vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  <ShoppingBag size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      Pedido #{detailModal.id}
                    </h3>
                    {(() => {
                      const b = getOrderChannelBadge(detailModal);
                      return (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${b.bg}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {getStatusBadge(detailModal.status)}
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>📅 {new Date(detailModal.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(detailModal.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>•</span>
                    <span className="text-slate-300 font-medium">Cliente: <strong>{detailModal.customerName || 'Cliente'}</strong></span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-[#202c33] transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              
              {/* Product Breakdown Table */}
              <div className="bg-[#111b21] rounded-2xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-[#141e24] border-b border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-2">
                    <Package size={14} className="text-emerald-400" />
                    Cortes & Productos del Pedido
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                    {parseOrderItems(detailModal).length} {parseOrderItems(detailModal).length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#111b21] text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800/80">
                      <tr>
                        <th className="py-2.5 px-4">Producto / Corte</th>
                        <th className="py-2.5 px-4 text-center">Cantidad</th>
                        <th className="py-2.5 px-4 text-right">Precio Unit.</th>
                        <th className="py-2.5 px-4 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {parseOrderItems(detailModal).map((prod, idx) => (
                        <tr key={idx} className="hover:bg-[#182229]/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span className="text-lg shrink-0">{prod.icon}</span>
                              <div>
                                <div className="font-bold text-white text-xs">{prod.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">Unidad: {prod.unit}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2.5 py-1 rounded-xl bg-[#182229] border border-slate-700 text-emerald-400 font-mono font-bold text-xs">
                              {prod.quantity} {prod.unit}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300 font-medium">
                            ${(Number(prod.price) || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-400">
                            ${(Number(prod.total) || 0).toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#141e24] border-t-2 border-slate-700/80">
                      <tr>
                        <td colSpan="3" className="py-3 px-4 text-right text-xs font-bold text-slate-300 uppercase">
                          Total a Abonar:
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-base font-black text-emerald-400">
                          ${(Number(detailModal.totalAmount) || 0).toLocaleString('es-AR')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Customer, Logistic & Preparation Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Customer Data */}
                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                    <Users size={13} className="text-emerald-400" />
                    <span>Datos del Cliente</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Nombre:</span>
                      <span className="font-bold text-white">{detailModal.customerName || 'Cliente'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Teléfono:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-200">{detailModal.phone || 'Sin registrar'}</span>
                        {detailModal.phone && (
                          <a
                            href={`https://wa.me/${detailModal.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition flex items-center gap-1"
                            title="Abrir WhatsApp con el cliente"
                          >
                            <MessageSquare size={11} /> Chat
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400 shrink-0">Dirección:</span>
                      <div className="text-right">
                        <div className="text-slate-200 font-medium">{detailModal.address || 'A coordinar'}</div>
                        {detailModal.address && (
                          <button
                            type="button"
                            onClick={() => handleOpenMap(detailModal.address, detailModal.customerName)}
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 justify-end mt-0.5"
                          >
                            <MapPin size={10} /> Ver en Mapa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logistic & Payment Info */}
                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 text-sky-400">
                      <Truck size={13} /> Logística & Franja Horaria
                    </span>
                    {detailModal.customerName && detailModal.phone && (detailModal.deliveryType === 'pickup' ? (detailModal.branch || detailModal.branchName) : (detailModal.address && detailModal.address.length >= 4)) ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 font-extrabold text-[9px] border border-emerald-500/30">
                        ✓ Verificado
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-400 font-extrabold text-[9px] border border-amber-500/30">
                        ⚠ Incompleto
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Modalidad:</span>
                      <span className="font-bold text-slate-200">
                        {detailModal.deliveryType === 'pickup' ? '🏪 Retiro en Sucursal' : '🛵 Envío a Domicilio'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-slate-400 shrink-0">Franja / Entrega:</span>
                      <span className="font-bold text-emerald-400 text-right leading-tight">
                        {detailModal.estimatedDelivery || detailModal.deliverySlotName || (detailModal.deliverySlot === 'morning' ? 'Franja Mañana (09:00 a 13:00 hs)' : 'Franja Tarde (14:00 a 19:00 hs)')}
                      </span>
                    </div>
                    {detailModal.isExpress && (
                      <div className="flex items-center justify-between text-amber-400 font-bold text-[11px]">
                        <span>Tipo de Envío:</span>
                        <span>🚀 Express Prioritario</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Costo Envío:</span>
                      <span className={`font-bold ${detailModal.isFreeShipping ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {detailModal.isFreeShipping ? '🎉 Bonificado ($0)' : detailModal.shippingCost ? `$${Number(detailModal.shippingCost).toLocaleString('es-AR')}` : 'Incluido'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Sucursal:</span>
                      <span className="font-medium text-emerald-400 truncate max-w-[160px]">
                        {detailModal.branchName || detailModal.branch || 'URCA CENTRAL'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Repartidor:</span>
                      <span className="font-medium text-sky-400 truncate max-w-[160px]">
                        {detailModal.driverName || 'Sin asignar'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400">Medio de Pago:</span>
                      <div className="text-right">
                        <span className="font-bold text-white">{detailModal.paymentMethod || 'Efectivo'}</span>
                        {detailModal.paymentStatus === 'paid' ? (
                          <span className="block text-[10px] text-emerald-400 font-bold">✅ Cobrado / Pagado</span>
                        ) : (
                          <span className="block text-[10px] text-amber-400 font-semibold">⏳ Pendiente de Pago</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preparation in Butchery */}
                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <Flame size={13} /> Preparación
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTogglePrepared(detailModal)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                        detailModal.isPrepared || detailModal.status === 'ready' || detailModal.status === 'ready_for_pickup'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                      }`}
                    >
                      {detailModal.isPrepared || detailModal.status === 'ready' ? '✅ Marcar No Listo' : '🥩 Marcar Preparado'}
                    </button>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Corte / Pesado:</span>
                      <span className={`font-bold ${detailModal.isPrepared || detailModal.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {detailModal.isPrepared || detailModal.status === 'ready' ? '🥩 Preparado y envasado' : '⏳ Pendiente de corte'}
                      </span>
                    </div>
                    {detailModal.preparedAt && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Preparado el:</span>
                        <span className="font-mono text-slate-300">
                          {new Date(detailModal.preparedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span>Estado Global:</span>
                      <span className="font-bold">{getStatusBadge(detailModal.status)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span>Ciclo de Vida:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(detailModal)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                          detailModal.isArchived || detailModal.status === 'completed'
                            ? 'bg-slate-700/50 hover:bg-slate-600/50 text-emerald-400 border-slate-600'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        }`}
                      >
                        {detailModal.isArchived || detailModal.status === 'completed' ? (
                          <>
                            <ArchiveRestore size={11} /> <span>Desarchivar Pedido</span>
                          </>
                        ) : (
                          <>
                            <Archive size={11} /> <span>Finalizar y Archivar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const orderToEdit = detailModal;
                    setDetailModal(null);
                    handleOpenEditOrder(orderToEdit);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition"
                >
                  <Edit3 size={13} />
                  <span>Editar en POS</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const orderForNotice = detailModal;
                    setDetailModal(null);
                    handleRequestStatusChange(orderForNotice, orderForNotice.status);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 border border-slate-700 font-semibold text-xs transition"
                >
                  <MessageSquare size={13} />
                  <span>Notificar WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleArchive(detailModal)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs transition ${
                    detailModal.isArchived || detailModal.status === 'completed'
                      ? 'bg-slate-700/50 hover:bg-slate-600/50 text-emerald-400 border-slate-600'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={detailModal.isArchived || detailModal.status === 'completed' ? 'Desarchivar pedido' : 'Finalizar y Archivar pedido'}
                >
                  {detailModal.isArchived || detailModal.status === 'completed' ? (
                    <>
                      <ArchiveRestore size={13} />
                      <span>Desarchivar</span>
                    </>
                  ) : (
                    <>
                      <Archive size={13} />
                      <span>Archivar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTicketPrintModal(detailModal)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 font-bold text-xs transition"
                  title="Abrir Centro de Impresión de Tickets (80mm, 58mm, A4)"
                >
                  <Printer size={13} />
                  <span>Imprimir Ticket</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className="px-4 py-2 rounded-xl bg-[#111b21] hover:bg-[#182229] text-slate-300 border border-slate-800 font-bold text-xs transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Operator Status Confirmation & WhatsApp Notification Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Confirmar Aviso al Cliente</h3>
                  <p className="text-xs text-slate-400">Notificación automática de WhatsApp por cambio de estado</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Order & Status Transition Info */}
            <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">Pedido #{confirmModal.order.id} — {confirmModal.order.customerName}</span>
                <span className="text-slate-400">{confirmModal.order.phone}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Estado:</span>
                {getStatusBadge(confirmModal.order.status)}
                <span className="text-slate-500 font-bold">➔</span>
                {getStatusBadge(confirmModal.targetStatus)}
              </div>
            </div>

            {/* WhatsApp Notification Message Editor */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Send size={13} className="text-emerald-400" />
                Mensaje de WhatsApp a Enviar al Cliente (Editable):
              </label>
              <textarea
                rows={4}
                value={confirmModal.message}
                onChange={(e) => setConfirmModal({ ...confirmModal, message: e.target.value })}
                className="w-full p-3 rounded-2xl bg-[#111b21] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Operator Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={confirmModal.isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleConfirmStatusChange(false)}
                disabled={confirmModal.isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-[#202c33] hover:bg-[#2a3942] border border-slate-700"
              >
                Solo Cambiar Estado (Sin Notificar)
              </button>

              <button
                type="button"
                onClick={() => handleConfirmStatusChange(true)}
                disabled={confirmModal.isSubmitting}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-md transition"
              >
                <Send size={13} />
                {confirmModal.isSubmitting ? 'Enviando...' : 'Cambiar y Enviar WhatsApp'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Create / Edit Order Modal with POS Product Selector & Location Map */}
      {orderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-5 sm:p-6 w-full max-w-4xl shadow-2xl space-y-5 my-auto max-h-[95vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {orderModal.mode === 'create' ? 'Nuevo Pedido (Carga Rápida POS)' : `Editar Pedido #${orderModal.data.id}`}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      POS Mostrador
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Selecciona cortes, calcula subtotales al instante y verifica la ubicación del cliente</p>
                </div>
              </div>
              <button
                onClick={() => setOrderModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrderForm} className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              
              {/* Quick Customer Picker & Location Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111b21] p-3 rounded-2xl border border-slate-800">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <Users size={13} /> Autocompletar con Cliente:
                    </span>
                  </label>
                  <select
                    onChange={(e) => {
                      const c = customers.find(x => x.id === e.target.value);
                      if (c) {
                        setOrderModal({
                          ...orderModal,
                          data: {
                            ...orderModal.data,
                            customerName: c.name || c.pushName || orderModal.data.customerName,
                            phone: c.phone || c.jid?.split('@')[0] || orderModal.data.phone,
                            address: c.address || orderModal.data.address,
                            branchId: c.preferredBranchId || orderModal.data.branchId,
                            branchName: branches.find(b => b.id === (c.preferredBranchId || orderModal.data.branchId))?.name || orderModal.data.branchName
                          }
                        });
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700 text-white font-medium focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    <option value="">👤 Elegir cliente existente...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.pushName || 'Cliente'} — 📞 {c.phone || c.jid?.split('@')[0]} {c.address ? `(${c.address})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold text-[11px]">Nombre del Cliente:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Don Juan / Matías Rossi"
                    value={orderModal.data.customerName}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, customerName: e.target.value }
                    })}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              {/* Phone & Address with Map Location Trigger */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Teléfono / WhatsApp:</label>
                  <input
                    type="text"
                    placeholder="Ej: +54 9 351 626-2475"
                    value={orderModal.data.phone}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, phone: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold">Dirección de Entrega:</label>
                    <button
                      type="button"
                      onClick={() => handleOpenMap(orderModal.data.address, orderModal.data.customerName)}
                      className="text-emerald-400 hover:text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition"
                      title="Abrir mapa interactivo de Córdoba"
                    >
                      <MapPin size={12} /> Ubicar en Mapa
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ej: Av. José Roque Funes 1115, Barrio Urca"
                      value={orderModal.data.address}
                      onChange={(e) => setOrderModal({
                        ...orderModal,
                        data: { ...orderModal.data, address: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenMap(orderModal.data.address, orderModal.data.customerName)}
                      className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold shrink-0 transition"
                      title="Ver en Mapa"
                    >
                      🗺️ Mapa
                    </button>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* POS PRODUCT SELECTOR & CART AREA */}
              {/* ========================================================================= */}
              <div className="bg-[#111b21] p-3.5 sm:p-4 rounded-3xl border border-slate-800 space-y-3">
                
                {/* POS / Manual Toggle Header */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShoppingCart size={16} className="text-emerald-400" />
                    <span className="font-bold text-white text-xs">Cortes & Productos del Pedido</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {posCart.length} {posCart.length === 1 ? 'ítem' : 'ítems'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setPosMode('pos')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${
                        posMode === 'pos' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Calculator size={13} />
                      <span>Selector POS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosMode('manual')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${
                        posMode === 'manual' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Edit3 size={13} />
                      <span>Texto Libre</span>
                    </button>
                  </div>
                </div>

                {posMode === 'pos' ? (
                  <div className="space-y-3">
                    
                    {/* Category Filter Pills & Search */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
                        {POS_CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setPosCategory(cat.id)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition ${
                              posCategory === cat.id
                                ? 'bg-emerald-500 text-slate-950 shadow'
                                : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative w-full sm:w-48">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar corte..."
                          value={posSearch}
                          onChange={(e) => setPosSearch(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1 bg-[#182229] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* POS Product Grid Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                      {(catalogProducts.length > 0 ? catalogProducts : DEFAULT_POS_ITEMS)
                        .filter(p => {
                          const matchesCat = posCategory === 'all' || p.category === posCategory;
                          const matchesSearch = !posSearch || p.name.toLowerCase().includes(posSearch.toLowerCase());
                          return matchesCat && matchesSearch;
                        })
                        .map(prod => {
                          const inCart = posCart.find(item => item.id === prod.id || item.name.toLowerCase() === prod.name.toLowerCase());
                          return (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => handleAddPosProduct(prod)}
                              className={`p-2 rounded-2xl border text-left flex flex-col justify-between transition group relative ${
                                inCart 
                                  ? 'bg-emerald-950/30 border-emerald-500/60 shadow-md' 
                                  : 'bg-[#182229] hover:bg-[#202c33] border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-base">{prod.icon || '🥩'}</span>
                                  {inCart && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                                      {inCart.quantity} {inCart.unit || 'kg'}
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-white text-[11px] leading-tight mt-1 line-clamp-2">
                                  {prod.name}
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-slate-800/80">
                                <span className="font-mono font-extrabold text-emerald-400 text-xs">
                                  ${Number(prod.price).toLocaleString('es-AR')}
                                </span>
                                <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
                                  <Plus size={12} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>

                    {/* Live Cart Items Summary with Stepper */}
                    {/* Live Cart Items Summary with Stepper and Grams Support */}
                    <div className="bg-[#182229] p-3 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                        <span>Detalle de Cortes Seleccionados</span>
                        {posCart.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearPosCart}
                            className="text-[10px] text-rose-400 hover:underline flex items-center gap-1"
                          >
                            <Trash2 size={11} /> Vaciar Carrito
                          </button>
                        )}
                      </div>

                      {posCart.length === 0 ? (
                        <div className="text-center py-4 text-slate-500 text-xs">
                          Haz clic en los cortes o combos arriba para añadirlos al pedido.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {posCart.map(item => {
                            const isKg = (item.unit || 'kg').toLowerCase() === 'kg' || (item.unit || '').toLowerCase().startsWith('kilo');
                            const currentQty = Number(item.quantity) || 1;
                            const currentGrams = Math.round(currentQty * 1000);
                            const lineSubtotal = Math.round(item.price * currentQty);

                            return (
                              <div
                                key={item.id}
                                className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 text-xs space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 pr-2 flex items-center gap-1.5">
                                    <span className="text-sm shrink-0">{item.icon || '🥩'}</span>
                                    <div className="truncate">
                                      <div className="font-bold text-white truncate">{item.name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        ${item.price.toLocaleString('es-AR')} / {item.unit || 'kg'}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* Stepper controls */}
                                    <div className="flex items-center bg-[#182229] border border-slate-700 rounded-lg p-0.5">
                                      <button
                                        type="button"
                                        onClick={() => isKg ? handleStepPosWeightGrams(item.id, -250) : handleRemovePosProduct(item.id)}
                                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                                        title={isKg ? 'Restar 250g' : 'Restar 1'}
                                      >
                                        <Minus size={11} />
                                      </button>

                                      <div className="px-1.5 flex items-center gap-1">
                                        <input
                                          type="number"
                                          step={isKg ? '0.05' : '1'}
                                          min={isKg ? '0.05' : '1'}
                                          value={item.quantity}
                                          onChange={(e) => handleSetPosItemQuantity(item.id, parseFloat(e.target.value) || 0)}
                                          className="w-12 bg-transparent text-center font-mono font-bold text-white text-xs focus:outline-none"
                                        />
                                        <span className="text-[10px] font-bold text-slate-400 font-mono">
                                          {isKg ? (currentQty < 1 ? `(${currentGrams}g)` : 'kg') : (item.unit || 'un')}
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => isKg ? handleStepPosWeightGrams(item.id, 250) : handleAddPosProduct(item)}
                                        className="p-1 text-emerald-400 hover:text-white rounded hover:bg-slate-800 transition"
                                        title={isKg ? 'Sumar 250g' : 'Sumar 1'}
                                      >
                                        <Plus size={11} />
                                      </button>
                                    </div>

                                    <div className="font-mono font-extrabold text-emerald-400 text-xs w-20 text-right">
                                      ${lineSubtotal.toLocaleString('es-AR')}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleSetPosItemQuantity(item.id, 0)}
                                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                                      title="Quitar corte"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>

                                {/* Weight quick pills for kg items */}
                                {isKg && (
                                  <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-800/60">
                                    <span className="text-[10px] text-slate-500 font-medium mr-1">Pesos rápidos:</span>
                                    {[
                                      { label: '250 g', qty: 0.25 },
                                      { label: '500 g', qty: 0.5 },
                                      { label: '750 g', qty: 0.75 },
                                      { label: '1 kg', qty: 1 },
                                      { label: '1.5 kg', qty: 1.5 },
                                      { label: '2 kg', qty: 2 },
                                      { label: '3 kg', qty: 3 }
                                    ].map(preset => (
                                      <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => handleSetPosItemQuantity(item.id, preset.qty)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                                          Math.abs(currentQty - preset.qty) < 0.01
                                            ? 'bg-emerald-500 text-slate-950 font-bold'
                                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                        }`}
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Live Total Bar */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-300">Total Calculado del Pedido:</span>
                        <span className="text-base font-black font-mono text-emerald-400">
                          ${posCart.reduce((sum, item) => sum + Math.round(item.price * (Number(item.quantity) || 1)), 0).toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                  </div>
                ) : (
                  /* Manual Textarea Mode */
                  <div className="space-y-2">
                    <label className="text-slate-300 font-semibold block">Cortes / Combos (un ítem por línea):</label>
                    <textarea
                      rows={4}
                      placeholder="1x Combo Asadazo ($39.999)&#10;2 kg Costeleta de Cerdo ($15.000)&#10;1 bolsa Carbón Quebracho ($2.200)"
                      value={itemsInputText}
                      onChange={(e) => setItemsInputText(e.target.value)}
                      className="w-full p-3 rounded-2xl bg-[#182229] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500 text-xs"
                    />
                  </div>
                )}

              </div>

              {/* Total Amount & Status Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Monto Total del Pedido ($):</label>
                  <input
                    type="number"
                    required
                    value={orderModal.data.totalAmount}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, totalAmount: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-emerald-400 font-extrabold text-base focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Estado del Pedido:</label>
                  <select
                    value={orderModal.data.status || 'pending'}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, status: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="preparing">🥩 En Preparación (Carnicería)</option>
                    <option value="in_transit">🛵 En Reparto / Despachado</option>
                    <option value="delivered">✅ Entregado / Finalizado</option>
                    <option value="cancelled">❌ Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Payment Method & Payment Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Medio de Pago:</label>
                  <select
                    value={orderModal.data.paymentMethod}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, paymentMethod: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    <option value="Efectivo al repartidor">💵 Efectivo al repartidor</option>
                    <option value="Mercado Pago">💳 Mercado Pago</option>
                    <option value="Mercado Pago (Sandbox)">🧪 Mercado Pago (Sandbox)</option>
                    <option value="Transferencia Bancaria">📱 Transferencia Bancaria</option>
                    <option value="Tarjeta de Débito / Crédito">💳 Tarjeta Débito / Crédito</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Estado del Pago:</label>
                  <select
                    value={orderModal.data.paymentStatus || 'pending'}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, paymentStatus: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    <option value="pending">⏳ Pago Pendiente</option>
                    <option value="paid">✅ Pagado / Acreditado</option>
                    <option value="refunded">↩️ Reembolsado</option>
                  </select>
                </div>
              </div>

              {/* Branch and Driver Row with SearchableCombobox */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <SearchableCombobox
                    label="Sucursal Asignada"
                    options={[
                      { id: '', label: '🏢 Central / General', subtitle: 'Sin sucursal fija' },
                      ...branches.map(b => ({ id: b.id, label: b.name, subtitle: b.address || b.phone }))
                    ]}
                    value={orderModal.data.branchId || ''}
                    onChange={(val) => {
                      const selected = branches.find(b => b.id === val || b.alias?.includes(val) || b.name.toLowerCase() === (val || '').toLowerCase());
                      setOrderModal({
                        ...orderModal,
                        data: {
                          ...orderModal.data,
                          branchId: val,
                          branchName: selected ? selected.name : val
                        }
                      });
                    }}
                    allowCustom={false}
                    placeholder="Elegir o buscar sucursal..."
                    icon={Store}
                  />
                </div>

                <div>
                  <SearchableCombobox
                    label="Repartidor Asignado"
                    options={[
                      { id: '', label: '🛵 Sin Repartidor Asignado', subtitle: 'Pendiente de cadete' },
                      ...drivers.map(d => ({ id: d.id, label: `${d.name} (${d.vehicle || 'Moto'})`, subtitle: `${d.phone || ''} • ${d.status === 'busy' ? 'En ruta' : 'Libre'}` }))
                    ]}
                    value={orderModal.data.driverId || ''}
                    onChange={(val) => {
                      const selected = drivers.find(d => d.id === val || d.name.toLowerCase() === (val || '').toLowerCase());
                      setOrderModal({
                        ...orderModal,
                        data: {
                          ...orderModal.data,
                          driverId: val,
                          driverName: selected ? selected.name : val
                        }
                      });
                    }}
                    allowCustom={false}
                    placeholder="Elegir o buscar repartidor..."
                    icon={Bike}
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setOrderModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition shadow-lg"
                >
                  <Save size={15} />
                  Guardar Pedido
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Mercado Pago Payment Link Modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#009ee3]/20 text-[#009ee3] flex items-center justify-center font-bold">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Link de Cobro Mercado Pago</h3>
                  <p className="text-xs text-slate-400">Pedido #{paymentModal.order.id} — ${Number(paymentModal.order.totalAmount).toLocaleString('es-AR')}</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {paymentModal.isGenerating ? (
              <div className="py-10 text-center text-xs text-slate-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#009ee3]" />
                Generando Checkout Pro de Mercado Pago...
              </div>
            ) : paymentModal.linkData ? (
              <div className="space-y-4 text-xs">
                
                {paymentModal.sendSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 font-semibold">
                    <Check size={16} /> ¡Link de pago enviado por WhatsApp al cliente con éxito!
                  </div>
                )}

                {/* Mode Badge */}
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#111b21] border border-slate-800">
                  <div className="text-slate-400 font-bold text-[11px]">Ambiente de Mercado Pago:</div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                    paymentModal.linkData.isSandbox
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}>
                    {paymentModal.linkData.isSandbox ? '🧪 MODO PRUEBAS (SANDBOX)' : '🚀 MODO PRODUCCIÓN (EN VIVO)'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center justify-between">
                    <span>Link de Pago Generado:</span>
                    <a
                      href={paymentModal.linkData.checkoutUrl || paymentModal.linkData.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline text-[11px]"
                    >
                      Abrir enlace ↗
                    </a>
                  </label>
                  <div className="p-3 rounded-2xl bg-[#111b21] border border-slate-700/80 text-[#009ee3] font-mono text-xs break-all select-all flex items-center justify-between gap-2">
                    <span className="truncate">{paymentModal.linkData.checkoutUrl || paymentModal.linkData.initPoint}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(paymentModal.linkData.checkoutUrl || paymentModal.linkData.initPoint);
                        alert('¡Link de pago copiado al portapapeles!');
                      }}
                      className="p-1.5 rounded-lg bg-[#182229] hover:bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 shrink-0"
                      title="Copiar Link"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                {/* Success Feedback Alerts */}
                {paymentModal.simulateSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 font-semibold">
                    <Check size={16} /> ¡Pago simulado y acreditado con éxito! Pedido actualizado a preparación.
                  </div>
                )}

                {/* If Sandbox Mode, show test cards guide and Incognito tip */}
                {paymentModal.linkData.isSandbox && (
                  <div className="p-3 bg-[#111b21] border border-amber-500/30 rounded-2xl space-y-2 text-[11px]">
                    <div className="text-amber-400 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1">🧪 Tarjeta de Prueba para Modo Test:</span>
                      <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded font-mono">Sandbox ARS</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono bg-[#182229] p-2 rounded-xl border border-slate-800">
                      <div>
                        <div className="text-slate-400 font-sans text-[10px]">Mastercard Test:</div>
                        <div className="text-emerald-400 font-bold select-all">5031 7557 3453 0451</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-sans text-[10px]">Vto / CVV / DNI:</div>
                        <div className="text-slate-300">11/27 • 123 • 12345678</div>
                      </div>
                    </div>
                    
                    {/* Incognito warning tip */}
                    <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[10px] text-amber-300 leading-relaxed">
                      💡 <b>¿Te dio el error <i>"Una de las partes es de prueba"</i>?</b><br/>
                      Mercado Pago bloquea links de prueba si tu navegador tiene tu cuenta real iniciada.
                      👉 <b>Solución:</b> Abre el link en una <b>Ventana de Incógnito / Privada</b> o haz clic en <b>"Simular Pago Aprobado"</b> abajo para probar el flujo sin pasar por Mercado Pago.
                    </div>
                  </div>
                )}

                <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1 text-[11px] text-slate-400">
                  <div>👤 <b>Cliente:</b> {paymentModal.order.customerName} ({paymentModal.order.phone})</div>
                  <div>💰 <b>Total a cobrar:</b> ${Number(paymentModal.order.totalAmount).toLocaleString('es-AR')}</div>
                  <div>💳 <b>Métodos permitidos:</b> Débito, Crédito, Dinero en cuenta MP, Transferencia</div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyPayment(paymentModal.order.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition"
                      title="Consultar API de Mercado Pago para verificar si ya fue pagado"
                    >
                      <CheckCircle2 size={13} />
                      <span>Verificar en MP</span>
                    </button>

                    {paymentModal.linkData.isSandbox && (
                      <button
                        type="button"
                        onClick={handleSimulatePayment}
                        disabled={paymentModal.isSimulating}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition disabled:opacity-50"
                        title="Simular aprobación inmediata de pago sin abrir Mercado Pago"
                      >
                        <RefreshCw size={13} className={paymentModal.isSimulating ? 'animate-spin' : ''} />
                        {paymentModal.isSimulating ? 'Simulando...' : '🧪 Simular Pago'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModal(null)}
                      className="px-3.5 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 text-xs"
                    >
                      Cerrar
                    </button>

                    <button
                      type="button"
                      onClick={handleSendPaymentLinkWhatsApp}
                      disabled={paymentModal.isSending}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
                    >
                      <Send size={13} />
                      {paymentModal.isSending ? 'Enviando...' : '📱 Enviar por WhatsApp'}
                    </button>
                  </div>
                </div>

              </div>
            ) : null}

          </div>
        </div>
      )}

      {/* Unified POS-Integrated Payment & Change Modal */}
      {manualPaymentModal && (() => {
        const orderTotal = Number(manualPaymentModal.order.totalAmount) || 0;
        const currentPaid = Number(manualPaymentModal.paidAmount) || orderTotal;
        const currentReceived = manualPaymentModal.cashReceived !== '' && manualPaymentModal.cashReceived !== null ? Number(manualPaymentModal.cashReceived) : currentPaid;
        const calculatedChange = Math.max(0, currentReceived - currentPaid);
        const pendingBalance = Math.max(0, currentPaid - currentReceived);

        // Montos rápidos sugeridos
        const suggestedBills = [];
        suggestedBills.push({ label: `Exacto ($${orderTotal.toLocaleString('es-AR')})`, val: orderTotal });
        const nextTenThousand = Math.ceil(orderTotal / 10000) * 10000;
        if (nextTenThousand > orderTotal) suggestedBills.push({ label: `$${nextTenThousand.toLocaleString('es-AR')}`, val: nextTenThousand });
        if (nextTenThousand + 10000 > orderTotal) suggestedBills.push({ label: `$${(nextTenThousand + 10000).toLocaleString('es-AR')}`, val: nextTenThousand + 10000 });
        if (nextTenThousand + 20000 > orderTotal && !suggestedBills.some(b => b.val === nextTenThousand + 20000)) suggestedBills.push({ label: `$${(nextTenThousand + 20000).toLocaleString('es-AR')}`, val: nextTenThousand + 20000 });
        const roundFifty = Math.ceil(orderTotal / 50000) * 50000;
        if (roundFifty > orderTotal && !suggestedBills.some(b => b.val === roundFifty)) suggestedBills.push({ label: `$${roundFifty.toLocaleString('es-AR')}`, val: roundFifty });
        const roundHundred = Math.ceil(orderTotal / 100000) * 100000;
        if (roundHundred > orderTotal && !suggestedBills.some(b => b.val === roundHundred)) suggestedBills.push({ label: `$${roundHundred.toLocaleString('es-AR')}`, val: roundHundred });

        const paymentOptions = [
          { id: 'Efectivo al Repartidor', label: '💵 Efectivo', icon: '💵' },
          { id: 'Transferencia Bancaria (Alias)', label: '📱 Transferencia MP', icon: '📱' },
          { id: 'Mercado Pago (Manual / POS)', label: '💳 Mercado Pago', icon: '💳' },
          { id: 'Tarjeta Débito en Sucursal', label: '💳 Tarjeta Débito', icon: '💳' },
          { id: 'Tarjeta Crédito en Sucursal', label: '💳 Tarjeta Crédito', icon: '💳' },
          { id: 'Cuenta Corriente', label: '📑 Cta Corriente', icon: '📑' }
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl space-y-4 my-auto max-h-[95vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <DollarSign size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Registrar / Cobrar Pedido #{manualPaymentModal.order.id}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {manualPaymentModal.order.customerName} • {manualPaymentModal.order.phone || 'Sin tel'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setManualPaymentModal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {manualPaymentModal.success ? (
                <div className="py-8 text-center space-y-3">
                  <CheckCircle2 size={44} className="text-emerald-400 mx-auto" />
                  <div className="text-base font-bold text-white">¡Pago y Vuelto Registrados con Éxito!</div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    El estado de pago y el vuelto se sincronizaron con el pedido en todo el sistema.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSaveManualPayment} className="space-y-4 text-xs overflow-y-auto pr-1">
                  
                  {/* Total Banner */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#111b21] border border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total a Cobrar:</div>
                      <div className="text-2xl font-black text-emerald-400 font-mono">
                        ${orderTotal.toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Modalidad:</div>
                      <div className="text-slate-200 font-bold">
                        {manualPaymentModal.order.deliveryType === 'pickup' ? '🏪 Retiro en Sucursal' : '🛵 Envío a Domicilio'}
                      </div>
                    </div>
                  </div>

                  {/* Payment Method Selector Grid (Like POS) */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-semibold text-[11px] uppercase tracking-wide">
                      Seleccionar Medio de Pago:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {paymentOptions.map(opt => {
                        const isSelected = manualPaymentModal.paymentMethod === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setManualPaymentModal({ ...manualPaymentModal, paymentMethod: opt.id })}
                            className={`py-2 px-2 rounded-xl text-xs font-bold text-center border transition flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                                : 'bg-[#111b21] text-slate-300 hover:text-white border-slate-700 hover:border-slate-600'
                            }`}
                          >
                            <span>{opt.icon}</span>
                            <span className="truncate">{opt.label.replace(/^.*? /, '')}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Status & Amount Imputed Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold">Estado del Pago:</label>
                      <select
                        value={manualPaymentModal.paymentStatus}
                        onChange={(e) => {
                          const newSt = e.target.value;
                          setManualPaymentModal({
                            ...manualPaymentModal,
                            paymentStatus: newSt,
                            paidAmount: newSt === 'pending' ? 0 : (newSt === 'paid' ? orderTotal : manualPaymentModal.paidAmount)
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500"
                      >
                        <option value="paid">✅ Pagado / Acreditado</option>
                        <option value="pending">⏳ Pago Pendiente</option>
                        <option value="partial">🌓 Pago Parcial / Seña</option>
                        <option value="refunded">↩️ Reembolsado</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold">Monto Imputado / Abonado ($):</label>
                      <input
                        type="number"
                        required
                        value={manualPaymentModal.paidAmount}
                        onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, paidAmount: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold font-mono"
                      />
                    </div>
                  </div>

                  {/* Change Calculator (Unified with POS) */}
                  <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Banknote size={14} className="text-emerald-400" />
                        <span>Calculadora de Vuelto (Efectivo / Caja)</span>
                      </span>
                      {calculatedChange > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold font-mono">
                          Vuelto: ${calculatedChange.toLocaleString('es-AR')}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Paga con / Monto Recibido ($):</label>
                        <input
                          type="number"
                          placeholder="Monto entregado por cliente"
                          value={manualPaymentModal.cashReceived}
                          onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, cashReceived: e.target.value })}
                          className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-black text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                          {currentReceived >= currentPaid ? 'Vuelto a Entregar:' : 'Saldo Pendiente / Falta:'}
                        </label>
                        <div className={`p-2 rounded-xl border font-mono font-black text-lg text-center ${
                          currentReceived >= currentPaid
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          ${(currentReceived >= currentPaid ? calculatedChange : pendingBalance).toLocaleString('es-AR')}
                        </div>
                      </div>
                    </div>

                    {/* Quick Suggested Bills / Fast Amounts */}
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Billetes / Montos Rápidos:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedBills.map((b, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setManualPaymentModal({ ...manualPaymentModal, cashReceived: b.val })}
                            className="px-2 py-1 rounded-lg bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-mono font-bold transition"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Transaction Reference & Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">N.° de Comprobante / Ref. (Opcional):</label>
                      <input
                        type="text"
                        placeholder="Ej: TRANSF-9382173 / Recibo #102"
                        value={manualPaymentModal.transactionRef}
                        onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, transactionRef: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Notas / Observaciones:</label>
                      <input
                        type="text"
                        placeholder="Ej: Abonó con $50.000, vuelto $10.000"
                        value={manualPaymentModal.notes}
                        onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, notes: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Print Ticket Toggle */}
                  <div className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Printer size={16} className="text-emerald-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Imprimir Comanda / Ticket Térmico</div>
                        <div className="text-[10px] text-slate-400">Abrir modal de impresión automática al guardar el pago</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={manualPaymentModal.printTicketAfter}
                      onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, printTicketAfter: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setManualPaymentModal(null)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 text-xs font-semibold"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={manualPaymentModal.isSubmitting}
                      className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                    >
                      <Check size={14} />
                      <span>{manualPaymentModal.isSubmitting ? 'Guardando Pago...' : '✅ Asignar y Guardar Pago'}</span>
                    </button>
                  </div>

                </form>
              )}

            </div>
          </div>
        );
      })()}

      {/* Branch Derivation Modal */}
      {deriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Store size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Derivar Pedido a Sucursal</h3>
                  <p className="text-xs text-slate-400">Pedido #{deriveModal.order.id} — {deriveModal.order.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setDeriveModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {deriveModal.deriveSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">¡Pedido Derivado Exitosamente!</div>
                <p className="text-xs text-slate-400">
                  Se ha enviado el aviso por WhatsApp al encargado de la sucursal. En cuanto el encargado responda, el pedido se actualizará automáticamente.
                </p>
              </div>
            ) : (
              <form onSubmit={handleExecuteDerive} className="space-y-3.5 text-xs">
                <div>
                  <SearchableCombobox
                    label="Seleccionar Sucursal Destino:"
                    required={true}
                    options={branches.map(b => ({
                      id: b.id,
                      label: b.name,
                      subtitle: `${b.address || ''} • ${b.phone || ''}`
                    }))}
                    value={deriveModal.branchId}
                    onChange={(val) => setDeriveModal({ ...deriveModal, branchId: val })}
                    placeholder="Elegir o escribir sucursal..."
                    allowCustom={true}
                    icon={Store}
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Instrucciones / Notas para el Encargado (Opcional):</label>
                  <textarea
                    rows={2}
                    placeholder="Ej: Cliente pasa a retirar 19:30 hs / Prioridad corte magro"
                    value={deriveModal.notes}
                    onChange={(e) => setDeriveModal({ ...deriveModal, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <div className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Avisar al Cliente por WhatsApp</div>
                    <div className="text-[11px] text-slate-400">Notificarle que su pedido está en esta sucursal</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={deriveModal.notifyClient}
                    onChange={(e) => setDeriveModal({ ...deriveModal, notifyClient: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDeriveModal(null)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={deriveModal.isDeriving || !deriveModal.branchId}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition disabled:opacity-50"
                  >
                    <Send size={13} className={deriveModal.isDeriving ? 'animate-spin' : ''} />
                    {deriveModal.isDeriving ? 'Derivando...' : '🏪 Derivar y Notificar por WhatsApp'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Assign Delivery Driver Modal */}
      {assignDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  <Bike size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Asignar Repartidor / Delivery</h3>
                  <p className="text-xs text-slate-400">Pedido #{assignDriverModal.order.id} — {assignDriverModal.order.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setAssignDriverModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {assignDriverModal.assignSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">¡Repartidor Asignado y Despachado!</div>
                <p className="text-xs text-slate-400">
                  Se ha enviado la hoja de ruta con Google Maps y detalle del pedido al WhatsApp del repartidor.
                </p>
              </div>
            ) : (
              <form onSubmit={handleExecuteAssignDriver} className="space-y-3.5 text-xs">
                <div>
                  <SearchableCombobox
                    label="Seleccionar Repartidor:"
                    required={true}
                    options={drivers.map(d => ({
                      id: d.id,
                      label: `${d.name} (${d.vehicle || 'Moto'})`,
                      subtitle: `${d.phone || 'Sin tel'} • ${d.status === 'busy' ? 'En ruta' : 'Libre'}`
                    }))}
                    value={assignDriverModal.driverId}
                    onChange={(val) => setAssignDriverModal({ ...assignDriverModal, driverId: val })}
                    placeholder="Elegir o escribir repartidor..."
                    allowCustom={true}
                    icon={Bike}
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Instrucciones / Notas de Entrega (Opcional):</label>
                  <textarea
                    rows={2}
                    placeholder="Ej: Tocar timbre departamento 4B / Llevar cambio de $50.000"
                    value={assignDriverModal.notes}
                    onChange={(e) => setAssignDriverModal({ ...assignDriverModal, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <div className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Avisar al Cliente por WhatsApp</div>
                    <div className="text-[11px] text-slate-400">Notificarle el nombre del repartidor asignado</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={assignDriverModal.notifyClient}
                    onChange={(e) => setAssignDriverModal({ ...assignDriverModal, notifyClient: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAssignDriverModal(null)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={assignDriverModal.isAssigning || !assignDriverModal.driverId}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition disabled:opacity-50"
                  >
                    <Send size={13} className={assignDriverModal.isAssigning ? 'animate-spin' : ''} />
                    {assignDriverModal.isAssigning ? 'Despachando...' : '🛵 Asignar y Enviar Hoja de Ruta'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Order Detail & Breakdown Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  🥩
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Detalle del Pedido #{detailModal.id}</h3>
                    {getStatusBadge(detailModal.status)}
                  </div>
                  <p className="text-xs text-slate-400">{detailModal.customerName} • {detailModal.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="space-y-4 overflow-y-auto pr-1 text-xs">
              
              {/* Delivery & Logistics Grid */}
              <div className="grid grid-cols-2 gap-2 bg-[#111b21] p-3 rounded-2xl border border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Dirección de Entrega:</div>
                  <div className="text-slate-200 font-medium truncate">{detailModal.address || 'A convenir / Retiro en local'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Sucursal Asignada:</div>
                  <div className="text-emerald-400 font-semibold truncate">{detailModal.branchName || 'Central / Sin Sucursal'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Modalidad / Repartidor:</div>
                  <div className="text-sky-400 font-semibold truncate">
                    {detailModal.deliveryType === 'pickup' ? '🏪 Retiro en Sucursal' : (detailModal.driverName ? `🛵 ${detailModal.driverName}` : '🛵 Sin Repartidor Asignado')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Medio de Pago:</div>
                  <div className="text-slate-200 font-medium truncate">{detailModal.paymentMethod || 'Efectivo al repartidor'}</div>
                </div>
              </div>

              {/* Products and Cuts Breakdown Table */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                  Desglose de Cortes y Productos:
                </div>
                <div className="bg-[#111b21] rounded-2xl p-2.5 border border-slate-800 space-y-1.5 divide-y divide-slate-800/60">
                  {parseOrderItems(detailModal).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between pt-1.5 first:pt-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">{item.icon}</span>
                        <div className="truncate">
                          <div className="font-bold text-white truncate">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ${item.price.toLocaleString('es-AR')} / {item.unit || 'kg'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 font-bold font-mono text-[10px]">
                          {formatItemQuantity(item.quantity, item.unit)}
                        </span>
                        <span className="font-mono font-extrabold text-emerald-400 text-xs w-20 text-right">
                          ${item.total.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {detailModal.notes && (
                <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Notas / Observaciones:</div>
                  <div className="text-slate-300 italic">{detailModal.notes}</div>
                </div>
              )}

              {/* Total Summary */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 font-mono font-extrabold text-sm">
                <span>Total del Pedido:</span>
                <span className="text-base">${(Number(detailModal.totalAmount) || 0).toLocaleString('es-AR')}</span>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const target = detailModal;
                  setDetailModal(null);
                  setTicketPrintModal(target);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111b21] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs transition"
              >
                <Printer size={13} />
                <span>Imprimir Ticket</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = detailModal;
                    setDetailModal(null);
                    handleOpenEditOrder(target);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition"
                >
                  <Edit3 size={13} />
                  <span>Editar con POS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Real Interactive Map for Customer Delivery Location */}
      {mapModal && (
        <ClientLocationMap
          address={mapModal.address}
          customerName={mapModal.customerName}
          onConfirmLocation={mapModal.onConfirm}
          onClose={() => setMapModal(null)}
        />
      )}

      {/* Complete Thermal & Multi-format Ticket Print Modal */}
      {ticketPrintModal && (
        <TicketPrintModal
          order={ticketPrintModal}
          onClose={() => setTicketPrintModal(null)}
        />
      )}

      {/* Barra Flotante de Acciones Masivas para Pedidos */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#182229]/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
              {selectedOrderIds.length}
            </span>
            <span className="text-xs font-bold text-white hidden sm:inline">Pedidos Seleccionados</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleBulkUpdateStatus('preparing')}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 transition"
              title="Mover a preparación"
            >
              🥩 Preparación
            </button>

            <button
              onClick={() => handleBulkUpdateStatus('ready')}
              className="px-2.5 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs font-bold border border-teal-500/30 transition"
              title="Marcar como listo"
            >
              ✨ Listo
            </button>

            <button
              onClick={() => handleBulkUpdateStatus('in_transit')}
              className="px-2.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold border border-purple-500/30 transition"
              title="Marcar en reparto"
            >
              🚚 En Camino
            </button>

            <button
              onClick={() => handleBulkUpdateStatus('delivered')}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition"
              title="Marcar como entregado"
            >
              ✅ Entregado
            </button>

            <button
              onClick={() => handleBulkUpdateStatus('completed')}
              className="px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold border border-slate-600 transition"
              title="Archivar pedidos"
            >
              📦 Archivar
            </button>

            <button
              onClick={handleBulkDeleteOrders}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold border border-rose-500/30 transition"
              title="Eliminar pedidos seleccionados"
            >
              <Trash2 size={13} className="inline mr-1" /> Eliminar
            </button>

            <button
              onClick={() => setSelectedOrderIds([])}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1"
              title="Cancelar selección"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
