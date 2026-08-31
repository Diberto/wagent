import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  MapPin, 
  Phone, 
  User, 
  Send, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Store, 
  CreditCard, 
  DollarSign, 
  ArrowLeft, 
  X, 
  ChevronRight, 
  Sparkles, 
  Flame, 
  RefreshCw,
  MessageCircle,
  Package,
  Layers,
  AlertCircle,
  Tag
} from 'lucide-react';
import SearchableCombobox from './ui/SearchableCombobox.jsx';

const CATEGORIES = [
  { id: 'all', label: '🔥 Todo el Catálogo', icon: '🥩' },
  { id: 'combos', label: '⭐ Combos y Ofertas', icon: '⭐' },
  { id: 'parrilla', label: '🥩 Vacuno y Parrilla', icon: '🥩' },
  { id: 'cerdo', label: '🐖 Cerdo Seleccionado', icon: '🐖' },
  { id: 'achuras', label: '🌭 Achuras y Embutidos', icon: '🌭' },
  { id: 'elaborados', label: '🍽️ Milanesas y Elaborados', icon: '🍽️' },
  { id: 'almacen', label: '🍷 Carbón y Bebidas', icon: '🔥' }
];

const DEFAULT_BRANCHES = [
  { id: 'branch-1', name: 'Urca Central', address: 'Av. José Roque Funes 1115, Córdoba' },
  { id: 'branch-2', name: 'Recta Martinoli', address: 'Av. Recta Martinoli 7850, Villa Belgrano' },
  { id: 'branch-3', name: 'Villa Allende', address: 'Av. Goycoechea 1420, Villa Allende' },
  { id: 'branch-4', name: 'Barrio Jardín', address: 'Av. Richieri 2850, Barrio Jardín' },
  { id: 'branch-5', name: 'General Paz', address: '24 de Septiembre 1120, B° General Paz' },
  { id: 'branch-6', name: 'Cerro de las Rosas', address: 'Av. Rafael Núñez 4200, Cerro de las Rosas' }
];

// Productos que permiten venta fraccionada por unidades y su factor promedio de unidades por kg
const FRACTIONABLE_PRODUCTS = {
  chorizo: 8,
  chori: 8,
  morcilla: 7,
  costeleta: 4,
  chuleta: 4,
  milanesa: 6,
  bife: 3,
  pata: 3,
  muslo: 3
};

function isProductFractionable(name = '', category = '') {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes('bife de chorizo')) return false;
  return /chorizo|morcilla|costeleta|chuleta|milanesa|pata\s+muslo/i.test(n) ||
         c.includes('embutido') || c.includes('elaborados');
}

function getUnitsPerKg(name = '') {
  const n = name.toLowerCase();
  for (const [key, factor] of Object.entries(FRACTIONABLE_PRODUCTS)) {
    if (n.includes(key)) return factor;
  }
  return 4;
}

export default function StorefrontView({ onBackToAdmin = null }) {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'tracking'
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState(DEFAULT_BRANCHES);
  const [settings, setSettings] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Carrito de Compras
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('republica_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Formulario de Checkout
  const [deliveryType, setDeliveryType] = useState('delivery'); // 'delivery' | 'pickup'
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('republica_customer_name') || '');
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem('republica_customer_phone') || '');
  const [customerAddress, setCustomerAddress] = useState(() => localStorage.getItem('republica_customer_address') || '');
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_BRANCHES[0].id);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo contraentrega');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Estado del Tracking
  const [trackingPhone, setTrackingPhone] = useState(() => localStorage.getItem('republica_customer_phone') || '');
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [isSearchingTracking, setIsSearchingTracking] = useState(false);

  // Persistir carrito
  useEffect(() => {
    localStorage.setItem('republica_cart', JSON.stringify(cart));
  }, [cart]);

  // Cargar catálogo de productos y sucursales
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, branchRes, setRes] = useState ? await Promise.all([
        fetch('/api/products').then(r => r.json()).catch(() => []),
        fetch('/api/branches').then(r => r.json()).catch(() => DEFAULT_BRANCHES),
        fetch('/api/settings').then(r => r.json()).catch(() => ({}))
      ]) : [[], DEFAULT_BRANCHES, {}];

      if (Array.isArray(prodRes)) {
        // Filtrar productos válidos y activos en WhatsApp / Tienda
        const activeProds = prodRes.filter(p => p.isAvailable !== false && Number(p.price) > 0);
        setProducts(activeProds);
      }
      if (Array.isArray(branchRes) && branchRes.length > 0) {
        setBranches(branchRes);
      }
      if (setRes) {
        setSettings(setRes);
      }
    } catch (err) {
      console.error('Error cargando tienda:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar datos y verificar si hay código de seguimiento en la URL
  useEffect(() => {
    fetchData();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const trackingParam = params.get('tracking') || params.get('order') || params.get('pedido');
      if (trackingParam) {
        setActiveTab('tracking');
        setTrackingPhone(trackingParam);
        fetchTrackedOrders(trackingParam);
      } else {
        const savedPhone = localStorage.getItem('republica_customer_phone');
        if (savedPhone) {
          fetchTrackedOrders(savedPhone);
        }
      }
    }
  }, []);

  // Agregar al Carrito (soporta kilos o unidades)
  const handleAddToCart = (product, mode = 'kg', amount = 1) => {
    const isUnit = mode === 'units';
    const unitsPerKg = getUnitsPerKg(product.name);
    const unitPrice = Number(product.price) || 0;

    // Calcular peso equivalente y subtotal
    const calculatedKg = isUnit ? (amount / unitsPerKg) : amount;
    const subtotal = Math.round(unitPrice * calculatedKg);

    const cartItemId = `${product.id || product.name}_${isUnit ? 'unit' : 'kg'}`;

    setCart(prev => {
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map(item => {
          if (item.cartItemId === cartItemId) {
            const newAmount = item.amount + amount;
            const newKg = isUnit ? (newAmount / unitsPerKg) : newAmount;
            const newSubtotal = Math.round(unitPrice * newKg);
            return {
              ...item,
              amount: newAmount,
              quantity: isUnit ? newKg : newAmount,
              unitCount: isUnit ? newAmount : 0,
              subtotal: newSubtotal
            };
          }
          return item;
        });
      }

      return [...prev, {
        cartItemId,
        id: product.id,
        name: product.name,
        category: product.category,
        price: unitPrice,
        unit: product.unit || 'kg',
        isUnitMode: isUnit,
        unitCount: isUnit ? amount : 0,
        amount,
        quantity: calculatedKg,
        subtotal,
        imageUrl: product.imageUrl || product.image || null
      }];
    });

    setIsCartOpen(true);
  };

  // Modificar cantidad en Carrito
  const handleUpdateCartItemQty = (cartItemId, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.cartItemId === cartItemId) {
          const step = item.isUnitMode ? 1 : 0.5;
          const newAmount = Math.max(0, item.amount + (delta * step));
          if (newAmount === 0) return null;

          const unitsPerKg = getUnitsPerKg(item.name);
          const calculatedKg = item.isUnitMode ? (newAmount / unitsPerKg) : newAmount;
          const subtotal = Math.round(item.price * calculatedKg);

          return {
            ...item,
            amount: newAmount,
            quantity: item.isUnitMode ? calculatedKg : newAmount,
            unitCount: item.isUnitMode ? newAmount : 0,
            subtotal
          };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const handleRemoveCartItem = (cartItemId) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Totales
  const totalCartAmount = cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const totalCartItemsCount = cart.length;

  // Checkout y Envío al WhatsApp del Agente por defecto
  const handleCheckoutWhatsApp = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Por favor completá tu Nombre y Teléfono de WhatsApp para continuar.');
      return;
    }
    if (deliveryType === 'delivery' && !customerAddress.trim()) {
      alert('Por favor ingresá tu Dirección completa de entrega en Córdoba.');
      return;
    }

    setIsSubmittingOrder(true);
    localStorage.setItem('republica_customer_name', customerName);
    localStorage.setItem('republica_customer_phone', customerPhone);
    if (deliveryType === 'delivery') {
      localStorage.setItem('republica_customer_address', customerAddress);
    }

    const selectedBranchObj = branches.find(b => b.id === selectedBranchId) || branches[0];

    // 1. Guardar orden en Backend (sincronizada en vivo con CRM y canal TIENDA)
    try {
      const orderPayload = {
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        address: deliveryType === 'delivery' ? customerAddress.trim() : selectedBranchObj.address,
        deliveryType,
        branchId: selectedBranchObj.id,
        branchName: selectedBranchObj.name,
        items: cart,
        totalAmount: totalCartAmount,
        paymentMethod,
        channel: 'TIENDA',
        source: 'TIENDA',
        origin: 'TIENDA',
        notes: orderNotes.trim()
      };

      const res = await fetch('/api/store/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'No se pudo registrar el pedido automáticamente.');
        return;
      }

      const orderObj = data.order || { id: `ORD-${Math.floor(1000 + Math.random() * 9000)}` };
      setCreatedOrder(orderObj);

      // Guardar en pedidos recientes de este navegador
      try {
        const existingRecent = JSON.parse(localStorage.getItem('republica_recent_orders') || '[]');
        const updatedRecent = [orderObj.id, ...existingRecent.filter(id => id !== orderObj.id)].slice(0, 10);
        localStorage.setItem('republica_recent_orders', JSON.stringify(updatedRecent));
      } catch (e) {}

      // 2. Construir mensaje preformateado para WhatsApp
      const itemsListFormatted = cart.map(it => {
        if (it.isUnitMode && it.unitCount > 0) {
          return `• ${it.unitCount} Unidades de ${it.name} ➔ $${it.subtotal.toLocaleString('es-AR')}`;
        }
        return `• ${it.quantity} kg ${it.name} ➔ $${it.subtotal.toLocaleString('es-AR')}`;
      }).join('\n');

      const deliveryInfo = deliveryType === 'delivery'
        ? `🛵 *Envío a Domicilio:* ${customerAddress.trim()}`
        : `🏪 *Retiro en Sucursal:* ${selectedBranchObj.name} (${selectedBranchObj.address})`;

      const trackingUrl = `${window.location.origin}/tienda?tracking=${orderObj.id}`;

      const whatsappText = `¡Hola Carlos! 🥩 Acabo de armar mi pedido en la Tienda Web:

📋 *Pedido #${orderObj.id}*
👤 *Cliente:* ${customerName.trim()}
📱 *Teléfono:* ${customerPhone.trim()}
📍 ${deliveryInfo}
💳 *Medio de Pago:* ${paymentMethod}

🥩 *Detalle de Cortes:*
${itemsListFormatted}

💰 *Total a Abonar:* $${totalCartAmount.toLocaleString('es-AR')}
${orderNotes.trim() ? `📝 *Aclaraciones:* ${orderNotes.trim()}\n` : ''}
🔗 *Seguimiento en Vivo:* ${trackingUrl}

¿Me confirmás el pedido para comenzar la preparación? ¡Muchas gracias! 🙌`;

      // 3. Obtener número del agente por defecto (Settings / WhatsApp oficial)
      const defaultAgentPhone = (settings.whatsappNumber || settings.agentPhone || '5493513906947').replace(/\D/g, '');
      const waUrl = `https://wa.me/${defaultAgentPhone}?text=${encodeURIComponent(whatsappText)}`;
      
      window.open(waUrl, '_blank');
      setCart([]);
      setIsCartOpen(false);
      setActiveTab('tracking');
      setTrackingPhone(orderObj.id || customerPhone.trim());
      fetchTrackedOrders(orderObj.id || customerPhone.trim());
    } catch (err) {
      console.error('Error registrando pedido:', err);
      alert('Hubo un inconveniente al registrar el pedido, pero podés contactarnos directamente por WhatsApp.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Buscar pedidos para tracking (por código #ORD-XXXX o por teléfono)
  const fetchTrackedOrders = async (queryToSearch) => {
    const rawQ = queryToSearch || trackingPhone || '';
    const q = rawQ.trim();
    if (!q) return;

    setIsSearchingTracking(true);
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data && Array.isArray(data.orders) && data.orders.length > 0) {
        setTrackedOrders(data.orders);
      } else {
        // Fallback a /api/orders
        const allRes = await fetch('/api/orders');
        const allOrders = await allRes.json();
        if (Array.isArray(allOrders)) {
          const qDigits = q.replace(/\D/g, '');
          const matches = allOrders.filter(o => {
            const ordId = String(o.id).toLowerCase();
            const ordPhone = String(o.phone || o.customerPhone || '').replace(/\D/g, '');
            return ordId.includes(q.toLowerCase()) || (qDigits.length >= 4 && ordPhone.includes(qDigits));
          });
          setTrackedOrders(matches);
        } else {
          setTrackedOrders([]);
        }
      }
    } catch (err) {
      console.error('Error buscando tracking:', err);
      setTrackedOrders([]);
    } finally {
      setIsSearchingTracking(false);
    }
  };

  // Filtrar productos
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategory === 'all' || 
      (selectedCategory === 'combos' && /combo|asadazo/i.test(p.name + p.category)) ||
      (selectedCategory === 'parrilla' && /parrilla|vacuno|novillito|vacio|costillar|tapa|entraña|bife/i.test(p.name + p.category)) ||
      (selectedCategory === 'cerdo' && /cerdo|bondiola|matambrito|pechito/i.test(p.name + p.category)) ||
      (selectedCategory === 'achuras' && /achura|chorizo|morcilla|chinchulin|molleja/i.test(p.name + p.category)) ||
      (selectedCategory === 'elaborados' && /milanesa|elaborado|picada|hamburguesa/i.test(p.name + p.category)) ||
      (selectedCategory === 'almacen' && /carbon|carbón|vino|bebida|almacen/i.test(p.name + p.category));

    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col selection:bg-red-500 selection:text-white">
      
      {/* Header Superior (100% experiencia cliente) */}
      <header className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur-xl border-b border-gray-800 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Marca */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-700 via-red-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-900/40">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-white leading-none flex items-center gap-1.5">
                  República de la Carne
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 font-bold rounded border border-red-500/30">
                    TIENDA
                  </span>
                </h1>
                <p className="text-[11px] text-gray-400 font-medium">La calidad nos hace diferentes • Córdoba</p>
              </div>
            </div>
          </div>

          {/* Navegación Pestañas & Carrito */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex bg-gray-950/80 p-1 rounded-xl border border-gray-800 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'catalog'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🥩 Catálogo & Ofertas
              </button>
              <button
                onClick={() => {
                  setActiveTab('tracking');
                  if (trackingPhone) fetchTrackedOrders(trackingPhone);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'tracking'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📦 Mis Pedidos
              </button>
            </div>

            {/* Botón Carrito Flotante / Header */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-3.5 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-900/30 transition-all active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Ver Pedido</span>
              <span className="bg-white text-red-700 px-1.5 py-0.2 rounded-full font-black text-[11px]">
                {totalCartItemsCount}
              </span>
              {totalCartAmount > 0 && (
                <span className="hidden md:inline border-l border-red-400/40 pl-2">
                  ${totalCartAmount.toLocaleString('es-AR')}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Barra Móvil de Pestañas */}
        <div className="sm:hidden flex border-t border-gray-800 bg-gray-950/90 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
              activeTab === 'catalog'
                ? 'border-red-500 text-red-400 bg-red-500/10'
                : 'border-transparent text-gray-400'
            }`}
          >
            🥩 Catálogo
          </button>
          <button
            onClick={() => {
              setActiveTab('tracking');
              if (trackingPhone) fetchTrackedOrders(trackingPhone);
            }}
            className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
              activeTab === 'tracking'
                ? 'border-red-500 text-red-400 bg-red-500/10'
                : 'border-transparent text-gray-400'
            }`}
          >
            📦 Seguir Pedido
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {activeTab === 'catalog' ? (
          <div>
            
            {/* Hero / Promoción Destacada */}
            <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-red-950/80 via-gray-900 to-gray-900 border border-red-900/40 shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-red-600/10 to-transparent pointer-events-none" />
              
              <div className="max-w-2xl relative z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-bold border border-red-500/30 mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Cortes Seleccionados Novillito & Cerdo Pesado
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2">
                  Los mejores cortes y asados de Córdoba directo a tu mesa
                </h2>
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                  Elegí por <strong>Kilos</strong> o fraccioná por <strong>Unidades</strong> (chorizos, costeletas, milanesas). Tu pedido se coordina al instante con Carlos por WhatsApp.
                </p>

                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-400">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Truck className="w-4 h-4" /> Envíos en el día
                  </span>
                  <span className="flex items-center gap-1.5 text-red-400">
                    <Store className="w-4 h-4" /> 6 Sucursales de retiro
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <CreditCard className="w-4 h-4" /> Efectivo, Transferencia o MP
                  </span>
                </div>
              </div>
            </div>

            {/* Buscador & Categorías */}
            <div className="mb-6 space-y-4">
              <div className="relative max-w-xl">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar cortes, asado, tapa de cuadril, chorizos, promos..."
                  className="w-full bg-gray-900/90 border border-gray-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                />
              </div>

              {/* Categorías en Carrusel Horizontal */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedCategory === cat.id
                        ? 'bg-red-600 text-white shadow-lg shadow-red-950/50 scale-105'
                        : 'bg-gray-900/80 border border-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-850'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de Productos */}
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-gray-500">
                <RefreshCw className="w-8 h-8 animate-spin text-red-500 mb-3" />
                <p className="text-sm font-medium">Cargando cortes frescos...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-gray-800 rounded-3xl p-8 bg-gray-900/40">
                <Flame className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-300 mb-1">No se encontraron productos</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                  Probá buscando con otro término o seleccionando otra categoría.
                </p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-xl"
                >
                  Ver todos los productos
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id || product.name}
                    product={product}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            )}

          </div>
        ) : (
          /* Pestaña de Seguimiento / Mis Pedidos */
          <div className="max-w-3xl mx-auto py-4">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl mb-6">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Package className="w-5 h-5 text-red-500" />
                Rastrear y Consultar Pedidos
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                Ingresá tu <strong>Código de Pedido (ej: #ORD-3218)</strong> o tu <strong>Número de WhatsApp</strong> para ver el estado de preparación y despacho en tiempo real.
              </p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={trackingPhone}
                    onChange={(e) => setTrackingPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchTrackedOrders(trackingPhone); }}
                    placeholder="Código de pedido (#ORD-XXXX) o Celular WhatsApp"
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <button
                  onClick={() => fetchTrackedOrders(trackingPhone)}
                  disabled={isSearchingTracking}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  <span>{isSearchingTracking ? 'Buscando...' : 'Consultar'}</span>
                </button>
              </div>

              {/* Accesos rápidos de pedidos recientes guardados en el navegador */}
              {(() => {
                try {
                  const recents = JSON.parse(localStorage.getItem('republica_recent_orders') || '[]');
                  if (recents.length > 0) {
                    return (
                      <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center gap-2 flex-wrap text-xs text-gray-400">
                        <span className="text-[11px] text-gray-500">Tus pedidos recientes:</span>
                        {recents.map(rId => (
                          <button
                            key={rId}
                            onClick={() => {
                              setTrackingPhone(rId);
                              fetchTrackedOrders(rId);
                            }}
                            className="px-2.5 py-1 bg-gray-950 hover:bg-gray-800 border border-gray-750 hover:border-red-500/50 text-gray-200 rounded-lg text-[11px] font-semibold transition"
                          >
                            #{rId}
                          </button>
                        ))}
                      </div>
                    );
                  }
                } catch (e) {}
                return null;
              })()}
            </div>

            {/* Listado de Pedidos en Seguimiento */}
            {trackedOrders.length > 0 ? (
              <div className="space-y-4">
                {trackedOrders.map(order => (
                  <OrderTrackingCard 
                    key={order.id} 
                    order={order} 
                    agentNumber={settings.whatsappNumber || settings.agentPhone || '5493513906947'} 
                  />
                ))}
              </div>
            ) : trackingPhone && !isSearchingTracking ? (
              <div className="text-center py-12 text-gray-500 bg-gray-900/30 border border-gray-800 rounded-3xl p-6">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p className="text-sm">No encontramos pedidos activos asociados a la búsqueda.</p>
                <p className="text-xs text-gray-600 mt-1">Verificá que el código o celular ingresado sea correcto.</p>
              </div>
            ) : null}
          </div>
        )}

      </main>

      {/* Modal / Slide-Over del Carrito de Compras */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col">
              
              {/* Header Carrito */}
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/80">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-red-500/10 text-red-400 rounded-xl">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Tu Pedido</h3>
                    <p className="text-xs text-gray-400">{cart.length} productos seleccionados</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lista de Ítems */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-gray-800/60 custom-scrollbar">
                {cart.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                    <p className="text-sm font-semibold text-gray-400">Tu canasta está vacía</p>
                    <p className="text-xs text-gray-600 mt-1">Elegí cortes frescos del catálogo para agregarlos.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.cartItemId} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{item.name}</h4>
                        
                        {/* CONDICIONAL OBLIGATORIO: Mostrar Unidades y NO kilos si fue fraccionado por unidades */}
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-gray-800 rounded font-semibold text-red-300">
                            {item.isUnitMode && item.unitCount > 0
                              ? `${item.unitCount} Unidades`
                              : `${item.quantity} ${item.unit || 'kg'}`}
                          </span>
                          <span>${item.price.toLocaleString('es-AR')} / {item.unit || 'kg'}</span>
                        </div>
                      </div>

                      {/* Stepper y Subtotal */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-gray-950 border border-gray-800 rounded-lg p-0.5">
                          <button
                            onClick={() => handleUpdateCartItemQty(item.cartItemId, -1)}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-white min-w-6 text-center">
                            {item.isUnitMode ? item.unitCount : item.amount}
                          </span>
                          <button
                            onClick={() => handleUpdateCartItemQty(item.cartItemId, 1)}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <div className="text-sm font-bold text-white">
                            ${item.subtotal.toLocaleString('es-AR')}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveCartItem(item.cartItemId)}
                          className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Formulario de Entrega & Checkout */}
              {cart.length > 0 && (
                <div className="p-6 border-t border-gray-800 bg-gray-950/90 space-y-4">
                  
                  {/* Tipo de Entrega */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                      Modalidad de Entrega
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('delivery')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          deliveryType === 'delivery'
                            ? 'bg-red-600 text-white border-red-500 shadow'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-850'
                        }`}
                      >
                        <Truck className="w-4 h-4" />
                        <span>Envío Domicilio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          deliveryType === 'pickup'
                            ? 'bg-red-600 text-white border-red-500 shadow'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-850'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        <span>Retiro Sucursal</span>
                      </button>
                    </div>
                  </div>

                  {/* Sucursal o Dirección según entrega */}
                  {deliveryType === 'pickup' ? (
                    <div>
                      <SearchableCombobox
                        label="Sucursal de Retiro"
                        options={branches.map(b => ({ id: b.id, label: b.name, subtitle: b.address }))}
                        value={selectedBranchId}
                        onChange={(val) => setSelectedBranchId(val)}
                        placeholder="Elegí la sucursal..."
                        icon={Store}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Dirección de Entrega en Córdoba
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                        <input
                          type="text"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder="Calle, Número, Barrio (ej: Av. Funes 1115, Urca)"
                          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Datos del Cliente */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        Tu Nombre
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                        WhatsApp (Celular)
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej: 3512345678"
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>

                  {/* Medio de Pago */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                      Preferencia de Pago
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-red-500"
                    >
                      <option value="Efectivo contraentrega">💵 Efectivo (al repartidor o en sucursal)</option>
                      <option value="Transferencia Bancaria">📲 Transferencia (Alias: republica.carne.mp)</option>
                      <option value="Mercado Pago">💳 Mercado Pago (Tarjetas / Dinero en cuenta)</option>
                    </select>
                  </div>

                  {/* Total y Botón de Envío a WhatsApp */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-base font-black text-white mb-3">
                      <span>Total Estimado:</span>
                      <span className="text-xl text-red-400">${totalCartAmount.toLocaleString('es-AR')}</span>
                    </div>

                    <button
                      onClick={handleCheckoutWhatsApp}
                      disabled={isSubmittingOrder}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-green-950/40 active:scale-98 transition-all disabled:opacity-50"
                    >
                      <MessageCircle className="w-5 h-5 fill-white" />
                      <span>{isSubmittingOrder ? 'Procesando pedido...' : 'Finalizar Pedido por WhatsApp'}</span>
                    </button>
                    <p className="text-[11px] text-gray-500 text-center mt-2">
                      Al presionar, se abrirá WhatsApp con el detalle de tu pedido listo para enviar a Carlos.
                    </p>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-900 bg-gray-950 py-6 text-center text-xs text-gray-600">
        <p>© 2026 República de la Carne. Todos los derechos reservados.</p>
        <p className="mt-1">Carnicería Boutique y Asados Gourmet • Córdoba, Argentina</p>
        {onBackToAdmin && (
          <div className="mt-3">
            <button
              onClick={onBackToAdmin}
              className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 hover:text-gray-400 transition-colors py-1 px-2.5 rounded-lg border border-transparent hover:border-gray-800"
              title="Panel Administrativo"
            >
              <span>🔒 Acceso CRM / Panel Operador</span>
            </button>
          </div>
        )}
      </footer>

    </div>
  );
}

/**
 * Tarjeta individual de Producto con selector de Kilos vs Unidades
 */
function ProductCard({ product, onAddToCart }) {
  const isKgProduct = !product.unit || product.unit === 'kg';
  const isFractionable = isProductFractionable(product.name, product.category);
  const unitsPerKg = getUnitsPerKg(product.name);

  // Modo de selección: 'kg' (peso) o 'units' (unidades / piezas)
  const [mode, setMode] = useState(isKgProduct ? (isFractionable ? 'units' : 'kg') : 'units');
  const [amount, setAmount] = useState(() => {
    if (!isKgProduct) return 1;
    return isFractionable ? 4 : 1;
  });

  const unitPrice = Number(product.price) || 0;
  const isUnit = mode === 'units';
  const calculatedKg = isKgProduct ? (isUnit ? (amount / unitsPerKg) : amount) : amount;
  const calculatedSubtotal = Math.round(unitPrice * calculatedKg);

  const handleIncrement = () => {
    if (!isKgProduct) {
      setAmount(prev => prev + 1);
    } else if (isUnit) {
      setAmount(prev => prev + (isFractionable ? 2 : 1));
    } else {
      setAmount(prev => +(prev + 0.5).toFixed(1));
    }
  };

  const handleDecrement = () => {
    if (!isKgProduct) {
      setAmount(prev => Math.max(1, prev - 1));
    } else if (isUnit) {
      setAmount(prev => Math.max(isFractionable ? 2 : 1, prev - (isFractionable ? 2 : 1)));
    } else {
      setAmount(prev => Math.max(0.5, +(prev - 0.5).toFixed(1)));
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden flex flex-col justify-between hover:border-gray-700 transition-all group shadow-xl hover:shadow-2xl hover:shadow-black/60">
      
      {/* Imagen & Badges */}
      <div className="aspect-[4/3] bg-gray-950 relative overflow-hidden flex items-center justify-center">
        <img
          src={product.imageUrl || product.image || 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=500&auto=format&fit=crop&q=80'}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=500&auto=format&fit=crop&q=80';
          }}
        />

        {/* Badge Categoría */}
        <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-wider border border-white/10">
          {product.category || 'Carnicería'}
        </span>

        {isKgProduct && (
          <span className="absolute top-3 right-3 px-2 py-0.5 bg-red-600/90 backdrop-blur-md text-white rounded-md text-[10px] font-black uppercase tracking-wide">
            {isFractionable ? '⚖️ Peso o Unid.' : '⚖️ Por Kilo'}
          </span>
        )}
      </div>

      {/* Datos del Producto */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 mb-1 group-hover:text-red-400 transition-colors">
            {product.name}
          </h3>
          <div className="text-base font-black text-red-400 mb-2">
            ${unitPrice.toLocaleString('es-AR')}
            <span className="text-xs text-gray-400 font-normal"> / {product.unit || 'kg'}</span>
          </div>
        </div>

        {/* Selector de Modalidad (Por Peso vs Por Unidades) */}
        {isKgProduct && (
          <div className="mb-2.5 bg-gray-950 p-1 rounded-xl border border-gray-800 flex text-[11px] font-bold">
            <button
              type="button"
              onClick={() => { setMode('kg'); setAmount(1); }}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                mode === 'kg' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>⚖️</span>
              <span>Por Peso (Kg)</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('units'); setAmount(isFractionable ? 4 : 2); }}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                mode === 'units' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🥩</span>
              <span>Por Unidad</span>
            </button>
          </div>
        )}

        {/* Chips de Selección Rápida */}
        <div className="mb-2.5 flex items-center gap-1.5 justify-center flex-wrap">
          {isKgProduct && mode === 'kg' ? (
            <>
              {[0.5, 1, 1.5, 2, 3].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setAmount(w)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${
                    amount === w
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-gray-950/80 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {w === 0.5 ? '500g' : `${w} kg`}
                </button>
              ))}
            </>
          ) : isKgProduct && mode === 'units' ? (
            <>
              {[2, 4, 6, 8, 12].map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setAmount(u)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${
                    amount === u
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-gray-950/80 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {u} un
                </button>
              ))}
            </>
          ) : (
            <>
              {[1, 2, 3, 5].map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setAmount(u)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${
                    amount === u
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-gray-950/80 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {u} {product.unit || 'un'}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Controles de Cantidad Fina y Botón de Agregar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl p-1">
            <button
              type="button"
              onClick={handleDecrement}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Disminuir"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="text-center font-bold text-xs">
              <span className="text-white">
                {isKgProduct
                  ? (mode === 'units' ? `${amount} unidades (~${calculatedKg.toFixed(2)} kg)` : `${amount} kg`)
                  : `${amount} ${product.unit || 'unidad'}`}
              </span>
              <span className="text-[10px] text-red-400 font-black block">
                Total: ${calculatedSubtotal.toLocaleString('es-AR')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleIncrement}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Aumentar"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAddToCart(product, mode, amount)}
            className="w-full py-2 bg-red-600 hover:bg-red-500 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-red-950/50"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Agregar al Pedido</span>
          </button>
        </div>

      </div>

    </div>
  );
}

/**
 * Tarjeta de Seguimiento de Pedido (Tracking)
 */
function OrderTrackingCard({ order, agentNumber }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'delivered':
        return { label: '✅ Entregado con éxito', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'in_transit':
        return { label: '🛵 En camino a tu domicilio', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
      case 'ready_for_pickup':
        return { label: '🏪 Listo para retirar', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      case 'preparing':
        return { label: '🥩 En preparación en carnicería', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'cancelled':
        return { label: '❌ Cancelado', bg: 'bg-red-500/20 text-red-300 border-red-500/30' };
      default:
        return { label: '⏳ Pendiente de confirmación', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    }
  };

  const badge = getStatusBadge(order.status);
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
        <div>
          <span className="text-xs font-bold text-gray-500 uppercase">Orden #{order.id}</span>
          <h4 className="text-base font-bold text-white">{order.customerName || 'Cliente'}</h4>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
          {badge.label}
        </div>
      </div>

      {/* Detalle */}
      <div className="space-y-1.5 text-xs text-gray-300 bg-gray-950 p-3.5 rounded-2xl border border-gray-850">
        <div className="font-semibold text-gray-400 mb-1">Cortes del pedido:</div>
        {items.map((it, idx) => (
          <div key={idx} className="font-medium text-gray-200">
            {typeof it === 'string' ? it : `• ${it.quantity || it.amount} ${it.unit || 'kg'} ${it.name} — $${Number(it.subtotal || it.price).toLocaleString('es-AR')}`}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400 pt-1">
        <div>
          <span>Destino: </span>
          <strong className="text-gray-200">{order.address || order.branch || 'Córdoba'}</strong>
        </div>
        <div className="text-base font-black text-red-400">
          Total: ${Number(order.totalAmount || 0).toLocaleString('es-AR')}
        </div>
      </div>

      {/* Botón Consultar a Carlos */}
      <div className="pt-2">
        <a
          href={`https://wa.me/${agentNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola Carlos! Consulto por el estado de mi pedido #${order.id}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-gray-700"
        >
          <MessageCircle className="w-4 h-4 text-emerald-400" />
          <span>Consultar al Agente por WhatsApp</span>
        </a>
      </div>
    </div>
  );
}
