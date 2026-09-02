import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
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
  Tag,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Info,
  Sliders,
  BadgeCheck,
  Banknote,
  Globe
} from 'lucide-react';
import SearchableCombobox from './ui/SearchableCombobox.jsx';

/**
 * Resuelve la URL base de la API del CRM de forma transparente.
 * Soporta:
 * 1. Parámetro en URL (?api_url=https://crm.tudominio.com)
 * 2. Variable global (window.WAGENT_API_URL)
 * 3. Variable de entorno Vite (VITE_API_URL)
 * 4. Almacenamiento local persistente (wagent_store_api_url)
 * 5. Mismo origen relativo ('')
 */
export function getStoreApiUrl() {
  if (typeof window === 'undefined') return '';
  const urlParams = new URLSearchParams(window.location.search);
  const paramUrl = urlParams.get('api_url') || urlParams.get('backend');
  if (paramUrl) {
    try {
      localStorage.setItem('wagent_store_api_url', paramUrl);
    } catch (_) {}
    return paramUrl.replace(/\/+$/, '');
  }

  const stored = localStorage.getItem('wagent_store_api_url');
  if (stored) return stored.replace(/\/+$/, '');

  if (window.WAGENT_API_URL) return String(window.WAGENT_API_URL).replace(/\/+$/, '');
  if (import.meta.env?.VITE_API_URL) return String(import.meta.env.VITE_API_URL).replace(/\/+$/, '');

  return '';
}

const DEFAULT_CATEGORIES = [
  { id: 'all', label: '🔥 Todo el Catálogo', icon: '🥩' },
  { id: 'combos', label: '⭐ Combos & Ofertas', icon: '⭐' },
  { id: 'parrilla', label: '🥩 Vacuno & Parrilla', icon: '🥩' },
  { id: 'cerdo', label: '🐖 Cerdo Seleccionado', icon: '🐖' },
  { id: 'achuras', label: '🌭 Achuras & Embutidos', icon: '🌭' },
  { id: 'elaborados', label: '🍽️ Milanesas & Elaborados', icon: '🍽️' },
  { id: 'almacen', label: '🍷 Carbón & Bebidas', icon: '🔥' }
];

const DEFAULT_BRANCHES = [
  { id: 'branch-1', name: 'Urca Central', address: 'Av. José Roque Funes 1115, Córdoba', phone: '351-6262475' },
  { id: 'branch-2', name: 'Recta Martinoli', address: 'Av. Recta Martinoli 7850, Villa Belgrano', phone: '351-6262475' },
  { id: 'branch-3', name: 'Villa Allende', address: 'Av. Goycoechea 1420, Villa Allende', phone: '351-6262475' },
  { id: 'branch-4', name: 'Barrio Jardín', address: 'Av. Richieri 2850, Barrio Jardín', phone: '351-6262475' },
  { id: 'branch-5', name: 'General Paz', address: '24 de Septiembre 1120, B° General Paz', phone: '351-6262475' },
  { id: 'branch-6', name: 'Cerro de las Rosas', address: 'Av. Rafael Núñez 4200, Cerro de las Rosas', phone: '351-6262475' }
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
  muslo: 3,
  hamburguesa: 5
};

function isProductFractionable(name = '', category = '') {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes('bife de chorizo')) return false;
  return /chorizo|morcilla|costeleta|chuleta|milanesa|pata\s+muslo|hamburguesa/i.test(n) ||
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
  const [storeConfig, setStoreConfig] = useState({
    storeName: 'República de la Carne',
    tagline: 'Carnicería Boutique & Asados Gourmet',
    heroBadge: '🔥 Envíos en el día en Córdoba Capital',
    heroTitle: 'La Mejor Carne Argentina Directo a Tu Mesa',
    heroSubtitle: 'Novillito pesado premium, cerdo seleccionado y achuras frescas. Hacé tu pedido en segundos con entrega asegurada.',
    heroCtaText: 'Explorar Catálogo',
    heroBannerMode: 'glass-mesh',
    announcementBarEnabled: true,
    announcementBarText: '🥩 ¡Envíos gratis en compras superiores a $45.000 en Córdoba! Despacho asegurado en 24hs.',
    themePreset: 'apple-obsidian',
    primaryColor: '#0071e3',
    accentColor: '#30d158',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, sans-serif',
    glassBlurLevel: 'xl',
    allowMercadoPago: true,
    allowCash: true,
    allowTransfer: true,
    transferAlias: 'republica.carne.mp',
    whatsappDirectNumber: '+5493516262475',
    freeShippingThreshold: 45000
  });

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAlias, setCopiedAlias] = useState(false);

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
  const [customerFiscalCondition, setCustomerFiscalCondition] = useState('CF'); // 'CF' | 'RI'
  const [customerCuit, setCustomerCuit] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_BRANCHES[0].id);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [cashBillAmount, setCashBillAmount] = useState('');
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

  // Cargar configuración de tienda y catálogo público aislado (Soporte Multi-Dominio)
  const fetchStoreData = async () => {
    setIsLoading(true);
    const apiBase = getStoreApiUrl();
    try {
      const [cfgRes, prodRes, branchRes] = await Promise.all([
        fetch(`${apiBase}/api/store/config`).then(r => r.json()).catch(() => null),
        fetch(`${apiBase}/api/store/products`).then(r => r.json()).catch(() => []),
        fetch(`${apiBase}/api/store/branches`).then(r => r.json()).catch(() => DEFAULT_BRANCHES)
      ]);

      if (cfgRes && cfgRes.config) {
        setStoreConfig(prev => ({ ...prev, ...cfgRes.config }));
      }
      if (Array.isArray(prodRes)) {
        setProducts(prodRes);
      }
      if (Array.isArray(branchRes) && branchRes.length > 0) {
        setBranches(branchRes);
      }
    } catch (err) {
      console.error('Error cargando datos de tienda:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Conexión WebSockets en tiempo real con el backend (incluso en otro dominio)
  useEffect(() => {
    fetchStoreData();

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

    const apiBase = getStoreApiUrl();
    const socket = io(apiBase || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 2000
    });

    socket.on('products:sync', (newProducts) => {
      if (Array.isArray(newProducts)) {
        const availableInStore = newProducts.filter(p => p.isAvailable !== false && p.availableInStore !== false && p.price > 0);
        setProducts(availableInStore.length > 0 ? availableInStore : newProducts);
      }
    });

    socket.on('orders:sync', () => {
      if (trackingPhone && trackingPhone.trim().length >= 4) {
        fetchTrackedOrders(trackingPhone);
      }
    });

    socket.on('order:update', () => {
      if (trackingPhone && trackingPhone.trim().length >= 4) {
        fetchTrackedOrders(trackingPhone);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Agregar al Carrito (soporta kilos o unidades)
  const handleAddToCart = (product, mode = 'kg', amount = 1) => {
    const isUnit = mode === 'units';
    const unitsPerKg = product.unitsPerKg || getUnitsPerKg(product.name);
    const unitPrice = Number(product.price) || 0;

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
  const totalCartAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [cart]);

  const totalCartItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.isUnitMode ? item.unitCount : 1), 0);
  }, [cart]);

  const freeShippingGoal = storeConfig.freeShippingThreshold || 45000;
  const freeShippingProgress = Math.min(100, Math.round((totalCartAmount / freeShippingGoal) * 100));
  const missingForFreeShipping = Math.max(0, freeShippingGoal - totalCartAmount);

  const calculatedChange = useMemo(() => {
    if (paymentMethod !== 'Efectivo' || !cashBillAmount) return null;
    const bill = parseFloat(cashBillAmount.replace(/[^0-9.]/g, '')) || 0;
    if (bill <= totalCartAmount) return 0;
    return bill - totalCartAmount;
  }, [cashBillAmount, totalCartAmount, paymentMethod]);

  const handleCopyAlias = () => {
    const alias = storeConfig.transferAlias || 'republica.carne.mp';
    navigator.clipboard.writeText(alias);
    setCopiedAlias(true);
    setTimeout(() => setCopiedAlias(false), 2500);
  };

  // Checkout y creación de pedido sincronizado
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Por favor completá tu Nombre y Teléfono de WhatsApp para confirmar el pedido.');
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

    const selectedBranchObj = branches.find(b => b.id === selectedBranchId) || branches[0] || DEFAULT_BRANCHES[0];

    try {
      const orderPayload = {
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        address: deliveryType === 'delivery' ? customerAddress.trim() : selectedBranchObj.address,
        fiscalCondition: customerFiscalCondition,
        cuit: customerFiscalCondition === 'RI' ? customerCuit.trim() : '',
        customerDoc: customerFiscalCondition === 'RI' ? customerCuit.trim() : '',
        deliveryType,
        branchId: selectedBranchObj.id,
        branchName: selectedBranchObj.name,
        items: cart,
        totalAmount: totalCartAmount,
        paymentMethod,
        cashChangeFor: paymentMethod === 'Efectivo' && cashBillAmount ? Number(cashBillAmount) : null,
        channel: 'TIENDA',
        source: 'TIENDA_ONLINE_WEB',
        notes: orderNotes.trim()
      };

      const apiBase = getStoreApiUrl();
      const res = await fetch(`${apiBase}/api/store/order`, {
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

      // Si el usuario eligió Mercado Pago y se generó link de pago, podemos ofrecer abrirlo directamente
      const paymentLink = data.paymentLink || orderObj.paymentLink;

      // Armar mensaje WhatsApp
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
      const fiscalInfo = customerFiscalCondition === 'RI' 
        ? `🏢 *Factura Solicitada:* Factura A (CUIT: ${customerCuit.trim()})`
        : `👤 *Facturación:* Consumidor Final`;

      let paymentText = `💳 *Medio de Pago:* ${paymentMethod}`;
      if (paymentMethod === 'Efectivo' && cashBillAmount) {
        paymentText += ` (Abona con $${Number(cashBillAmount).toLocaleString('es-AR')} - Vuelto: $${(calculatedChange || 0).toLocaleString('es-AR')})`;
      } else if (paymentMethod === 'Transferencia Bancaria') {
        paymentText += ` (Alias: ${storeConfig.transferAlias || 'republica.carne.mp'})`;
      } else if (paymentMethod === 'Mercado Pago' && paymentLink) {
        paymentText += `\n💳 *Link de Pago MP:* ${paymentLink}`;
      }

      const whatsappText = `¡Hola! 🥩 Acabo de realizar mi pedido en la Tienda Web:

📋 *Pedido #${orderObj.id}*
👤 *Cliente:* ${customerName.trim()}
📱 *Teléfono:* ${customerPhone.trim()}
📍 ${deliveryInfo}
🧾 ${fiscalInfo}
${paymentText}

🥩 *Detalle de Cortes Seleccionados:*
${itemsListFormatted}

💰 *Total Estimado:* $${totalCartAmount.toLocaleString('es-AR')}
*(Nota: Precios por kg. El total informado es estimado y puede ajustarse al pesaje final de balanza).*
${orderNotes.trim() ? `\n📝 *Aclaraciones:* ${orderNotes.trim()}\n` : '\n'}
🔗 *Seguimiento en Vivo:* ${trackingUrl}

¿Me confirman para comenzar la preparación? ¡Muchas gracias! 🙌`;

      const targetWhatsApp = (storeConfig.whatsappDirectNumber || '5493516262475').replace(/\D/g, '');
      const waUrl = `https://wa.me/${targetWhatsApp}?text=${encodeURIComponent(whatsappText)}`;
      
      // Abrir WhatsApp
      window.open(waUrl, '_blank');

      // Si hay link de Mercado Pago, ofrecer abrirlo
      if (paymentLink && paymentMethod === 'Mercado Pago') {
        setTimeout(() => {
          if (window.confirm('¿Deseas abrir ahora el Checkout de Mercado Pago para abonar con tarjeta o saldo?')) {
            window.open(paymentLink, '_blank');
          }
        }, 1000);
      }

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

  // Buscar pedidos para tracking
  const fetchTrackedOrders = async (queryToSearch) => {
    const rawQ = queryToSearch || trackingPhone || '';
    const q = rawQ.trim();
    if (!q) return;

    setIsSearchingTracking(true);
    const apiBase = getStoreApiUrl();
    try {
      const res = await fetch(`${apiBase}/api/store/track/${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data && Array.isArray(data.orders) && data.orders.length > 0) {
        setTrackedOrders(data.orders);
      } else {
        setTrackedOrders([]);
      }
    } catch (err) {
      console.error('Error buscando tracking:', err);
      setTrackedOrders([]);
    } finally {
      setIsSearchingTracking(false);
    }
  };

  // Filtrado de productos del catálogo
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = selectedCategory === 'all' || 
        (selectedCategory === 'combos' && /combo|oferta|promo|asadazo/i.test(p.name + (p.category || ''))) ||
        (selectedCategory === 'parrilla' && /parrilla|vacuno|novillito|vacio|costillar|tapa|entraña|bife|matambre/i.test(p.name + (p.category || ''))) ||
        (selectedCategory === 'cerdo' && /cerdo|bondiola|matambrito|pechito|solomillo/i.test(p.name + (p.category || ''))) ||
        (selectedCategory === 'achuras' && /achura|chorizo|morcilla|chinchulin|molleja|rinon|chori/i.test(p.name + (p.category || ''))) ||
        (selectedCategory === 'elaborados' && /milanesa|elaborado|picada|hamburguesa|preparado/i.test(p.name + (p.category || ''))) ||
        (selectedCategory === 'almacen' && /carbon|carbón|vino|bebida|almacen|sal|especia/i.test(p.name + (p.category || ''))) ||
        (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());

      const matchesSearch = !searchTerm || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  // Estilos y Blur dinámico
  const blurClass = storeConfig.glassBlurLevel === '2xl' 
    ? 'backdrop-blur-2xl' 
    : storeConfig.glassBlurLevel === 'lg' 
    ? 'backdrop-blur-lg' 
    : storeConfig.glassBlurLevel === 'md' 
    ? 'backdrop-blur-md' 
    : 'backdrop-blur-xl';

  return (
    <div 
      className="min-h-screen bg-[#070b0e] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 relative overflow-x-hidden font-sans"
      style={{ fontFamily: storeConfig.fontFamily || 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* Background Apple Glass Mesh Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[140px] opacity-20 transition-all duration-1000"
          style={{ backgroundColor: storeConfig.primaryColor || '#10b981' }}
        />
        <div 
          className="absolute top-1/3 -right-40 w-[550px] h-[550px] rounded-full blur-[160px] opacity-15 transition-all duration-1000"
          style={{ backgroundColor: storeConfig.accentColor || '#38bdf8' }}
        />
        <div 
          className="absolute -bottom-40 left-1/4 w-[700px] h-[700px] rounded-full blur-[180px] opacity-10"
          style={{ backgroundColor: storeConfig.primaryColor || '#10b981' }}
        />
      </div>

      {/* 1. Ticker / Announcement Bar */}
      {storeConfig.announcementBarEnabled !== false && (
        <aside 
          aria-label="Anuncios y Promociones"
          className="relative z-50 py-2 px-4 text-xs font-semibold text-center border-b border-white/10 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-emerald-950/80 backdrop-blur-md"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
          <span className="text-slate-200 tracking-wide">
            {storeConfig.announcementBarText || '🥩 ¡Envíos gratis en compras superiores a $45.000 en Córdoba! Despacho asegurado en 24hs.'}
          </span>
        </aside>
      )}

      {/* 2. Apple Glass Floating Header */}
      <header className={`sticky top-0 z-40 bg-slate-950/70 ${blurClass} border-b border-white/10 shadow-2xl transition-all`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          
          {/* Logo & Marca */}
          <div className="flex items-center gap-3">
            <div 
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg border border-white/20 transition-transform hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${storeConfig.primaryColor || '#10b981'}, ${storeConfig.accentColor || '#38bdf8'})`
              }}
            >
              <Flame className="w-6 h-6 text-slate-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white leading-none">
                  {storeConfig.storeName || 'República de la Carne'}
                </h1>
                <span 
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold border tracking-wider uppercase"
                  style={{
                    backgroundColor: `${storeConfig.primaryColor || '#0071e3'}20`,
                    borderColor: `${storeConfig.primaryColor || '#0071e3'}40`,
                    color: storeConfig.primaryColor || '#0071e3'
                  }}
                >
                  Tienda Oficial
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {storeConfig.tagline || 'Carnicería Boutique & Asados Gourmet • Córdoba'}
              </p>
            </div>
          </div>

          {/* Navegación Desktop & Carrito */}
          <div className="flex items-center gap-3">
            <nav aria-label="Navegación principal de la tienda" className="hidden sm:flex bg-white/[0.04] p-1 rounded-2xl border border-white/10 text-xs font-semibold backdrop-blur-xl">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'catalog'
                    ? 'bg-white/15 text-white shadow-lg border border-white/20 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🥩</span>
                <span>Catálogo</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('tracking');
                  if (trackingPhone) fetchTrackedOrders(trackingPhone);
                }}
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'tracking'
                    ? 'bg-white/15 text-white shadow-lg border border-white/20 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Package size={13} />
                <span>Mis Pedidos</span>
              </button>
            </nav>

            {/* Botón Carrito Apple Glass */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-2xl transition-all duration-200 active:scale-95 border border-white/20 text-slate-950 group"
              style={{
                background: `linear-gradient(135deg, ${storeConfig.primaryColor || '#10b981'}, ${storeConfig.accentColor || '#38bdf8'})`
              }}
            >
              <ShoppingBag className="w-4 h-4 text-slate-950 transition-transform group-hover:scale-110" />
              <span className="hidden sm:inline font-extrabold">Mi Carrito</span>
              <span className="bg-slate-950 text-white px-2 py-0.5 rounded-full font-black text-[11px] shadow-sm">
                {totalCartItemsCount}
              </span>
              {totalCartAmount > 0 && (
                <span className="hidden md:inline border-l border-slate-950/30 pl-2 font-black">
                  ${totalCartAmount.toLocaleString('es-AR')}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <nav aria-label="Navegación móvil de la tienda" className="sm:hidden flex border-t border-white/10 bg-slate-950/80 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
              activeTab === 'catalog'
                ? 'border-emerald-400 text-emerald-300 bg-white/[0.04] font-bold'
                : 'border-transparent text-slate-400'
            }`}
          >
            🥩 Catálogo & Cortes
          </button>
          <button
            onClick={() => {
              setActiveTab('tracking');
              if (trackingPhone) fetchTrackedOrders(trackingPhone);
            }}
            className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
              activeTab === 'tracking'
                ? 'border-emerald-400 text-emerald-300 bg-white/[0.04] font-bold'
                : 'border-transparent text-slate-400'
            }`}
          >
            📦 Rastrear Pedido
          </button>
        </nav>
      </header>

      {/* 3. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        
        {activeTab === 'catalog' ? (
          <div className="space-y-6">
            
            {/* Hero / Glassmorphic Banner */}
            <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent border border-white/15 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
              {/* Radial Accent Glow */}
              <div 
                className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-30 pointer-events-none"
                style={{ backgroundColor: storeConfig.primaryColor || '#10b981' }}
              />

              <div className="max-w-3xl relative z-10 space-y-4">
                <div 
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md"
                  style={{
                    backgroundColor: `${storeConfig.primaryColor || '#10b981'}20`,
                    borderColor: `${storeConfig.primaryColor || '#10b981'}40`,
                    color: storeConfig.primaryColor || '#10b981'
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{storeConfig.heroBadge || '🔥 Envíos en el día en Córdoba Capital'}</span>
                </div>

                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  {storeConfig.heroTitle || 'La Mejor Carne Argentina Directo a Tu Mesa'}
                </h2>
                
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  {storeConfig.heroSubtitle || 'Novillito pesado premium, cerdo seleccionado y achuras frescas. Elegí por kilos o unidades con entrega asegurada en Córdoba.'}
                </p>

                {/* Badges de Beneficios Apple Glass */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-md">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <span>Envíos en el día</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-md">
                    <Store className="w-4 h-4 text-sky-400" />
                    <span>6 Sucursales en Córdoba</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-md">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    <span>Mercado Pago, Efectivo & Transferencia</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Search Bar & Category Pills */}
            <div className="space-y-4">
              <div className="relative max-w-xl">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar corte (ej: Vacío, Asado, Tapa de Cuadril, Chorizos)..."
                  className="w-full bg-slate-900/60 border border-white/15 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 backdrop-blur-xl transition-all shadow-lg"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-lg"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Categorías iOS Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {DEFAULT_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
                      selectedCategory === cat.id
                        ? 'bg-white/20 text-white border-white/40 shadow-xl shadow-black/40 scale-105'
                        : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            {isLoading ? (
              <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
                <p className="text-sm font-medium">Cargando cortes frescos...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-white/15 rounded-3xl p-8 bg-white/[0.02] backdrop-blur-xl">
                <Flame className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">No se encontraron productos</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Probá buscando con otro término o seleccionando otra categoría.
                </p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl border border-white/15 transition"
                >
                  Ver todos los cortes
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredProducts.map(product => (
                  <AppleProductCard
                    key={product.id || product.name}
                    product={product}
                    onAddToCart={handleAddToCart}
                    primaryColor={storeConfig.primaryColor || '#0071e3'}
                  />
                ))}
              </div>
            )}

          </div>
        ) : (
          /* Pestaña: Mis Pedidos & Tracking */
          <div className="max-w-3xl mx-auto py-4 space-y-6 animate-in fade-in">
            <div className="bg-slate-900/60 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-2xl space-y-4">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
                  <Package size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">Rastreo & Estado de Pedidos en Vivo</h2>
                  <p className="text-xs text-slate-400">Consultá el avance de preparación y despacho de tu pedido en tiempo real</p>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={trackingPhone}
                    onChange={(e) => setTrackingPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchTrackedOrders(trackingPhone); }}
                    placeholder="Código de pedido (#ORD-XXXX) o Celular WhatsApp"
                    className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <button
                  onClick={() => fetchTrackedOrders(trackingPhone)}
                  disabled={isSearchingTracking}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isSearchingTracking ? 'Consultando...' : 'Rastrear'}</span>
                </button>
              </div>

              {/* Accesos rápidos de pedidos recientes guardados en el navegador */}
              {(() => {
                try {
                  const recents = JSON.parse(localStorage.getItem('republica_recent_orders') || '[]');
                  if (recents.length > 0) {
                    return (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2 flex-wrap text-xs text-slate-400">
                        <span className="text-[11px] text-slate-500">Tus pedidos recientes:</span>
                        {recents.map(rId => (
                          <button
                            key={rId}
                            onClick={() => {
                              setTrackingPhone(rId);
                              fetchTrackedOrders(rId);
                            }}
                            className="px-2.5 py-1 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-slate-200 rounded-lg text-[11px] font-semibold transition font-mono"
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
                  <AppleOrderTrackingCard 
                    key={order.id} 
                    order={order} 
                    whatsappNumber={storeConfig.whatsappDirectNumber || '5493516262475'} 
                  />
                ))}
              </div>
            ) : trackingPhone && !isSearchingTracking ? (
              <div className="text-center py-12 text-slate-500 bg-white/[0.02] border border-white/10 rounded-3xl p-6">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm">No encontramos pedidos activos asociados a la búsqueda.</p>
                <p className="text-xs text-slate-600 mt-1">Verificá que el código o celular ingresado sea correcto.</p>
              </div>
            ) : null}
          </div>
        )}

      </main>

      {/* 4. Slide-Over Cart & Frictionless Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-md bg-slate-950/95 border-l border-white/15 shadow-2xl flex flex-col backdrop-blur-2xl">
              
              {/* Header Carrito */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2.5 rounded-2xl flex items-center justify-center font-bold text-slate-950"
                    style={{ background: storeConfig.primaryColor || '#10b981' }}
                  >
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">Tu Carrito de Compra</h3>
                    <p className="text-xs text-slate-400">{cart.length} cortes seleccionados</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Envío Gratis */}
              <div className="px-6 py-3 bg-white/[0.03] border-b border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Truck size={14} className="text-emerald-400" />
                    <span>Envío Gratis ($45.000)</span>
                  </span>
                  <span className="font-bold text-emerald-400">
                    {missingForFreeShipping === 0 ? '¡Envío Gratis desbloqueado! 🎉' : `Faltan $${missingForFreeShipping.toLocaleString('es-AR')}`}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 rounded-full transition-all duration-500"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-white/10 custom-scrollbar">
                {cart.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 space-y-3">
                    <ShoppingBag className="w-12 h-12 mx-auto text-slate-700" />
                    <p className="text-sm font-semibold text-slate-400">Tu carrito está vacío</p>
                    <p className="text-xs text-slate-600 max-w-xs mx-auto">
                      Explorá el catálogo y agregá tus cortes favoritos para armar tu pedido.
                    </p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.cartItemId} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate">{item.name}</h4>
                        
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-white/10 rounded-md font-semibold text-emerald-300">
                            {item.isUnitMode && item.unitCount > 0
                              ? `${item.unitCount} Unidades`
                              : `${item.quantity} ${item.unit || 'kg'}`}
                          </span>
                          <span>${item.price.toLocaleString('es-AR')} / {item.unit || 'kg'}</span>
                        </div>
                      </div>

                      {/* Stepper y Subtotal */}
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center bg-black/60 border border-white/15 rounded-xl p-0.5">
                          <button
                            onClick={() => handleUpdateCartItemQty(item.cartItemId, -1)}
                            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-white min-w-6 text-center">
                            {item.isUnitMode ? item.unitCount : item.amount}
                          </span>
                          <button
                            onClick={() => handleUpdateCartItemQty(item.cartItemId, 1)}
                            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <div className="text-xs sm:text-sm font-extrabold text-emerald-400">
                            ${item.subtotal.toLocaleString('es-AR')}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveCartItem(item.cartItemId)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition"
                          title="Quitar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Checkout Form & Final Actions */}
              {cart.length > 0 && (
                <div className="p-5 sm:p-6 border-t border-white/15 bg-slate-950 space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
                  
                  {/* Modalidad de Entrega */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Modalidad de Entrega
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('delivery')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                          deliveryType === 'delivery'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md'
                            : 'bg-white/[0.04] border-white/10 text-slate-400 hover:bg-white/[0.08]'
                        }`}
                      >
                        <Truck className="w-4 h-4" />
                        <span>Envío Domicilio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                          deliveryType === 'pickup'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md'
                            : 'bg-white/[0.04] border-white/10 text-slate-400 hover:bg-white/[0.08]'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        <span>Retiro Sucursal</span>
                      </button>
                    </div>
                  </div>

                  {/* Sucursal o Dirección */}
                  {deliveryType === 'pickup' ? (
                    <div>
                      <SearchableCombobox
                        label="Sucursal de Retiro en Córdoba"
                        options={branches.map(b => ({ id: b.id, label: b.name, subtitle: b.address }))}
                        value={selectedBranchId}
                        onChange={(val) => setSelectedBranchId(val)}
                        placeholder="Seleccionar sucursal..."
                        icon={Store}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase tracking-wider">
                        Dirección de Entrega en Córdoba
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                        <input
                          type="text"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder="Calle, Número, Barrio (ej: Av. Funes 1115, Urca)"
                          className="w-full bg-slate-900 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Datos del Cliente */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase tracking-wider">
                        Tu Nombre
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase tracking-wider">
                        WhatsApp (Celular)
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej: 3512345678"
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Facturación Fiscal ARCA */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Comprobante / Factura
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomerFiscalCondition('CF')}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          customerFiscalCondition === 'CF'
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'bg-black/40 text-slate-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        <span>👤 Consumidor Final</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerFiscalCondition('RI')}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          customerFiscalCondition === 'RI'
                            ? 'bg-purple-500 text-white font-black'
                            : 'bg-black/40 text-slate-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        <span>🏢 Factura A (CUIT)</span>
                      </button>
                    </div>

                    {customerFiscalCondition === 'RI' && (
                      <div className="pt-1">
                        <input
                          type="text"
                          required
                          value={customerCuit}
                          onChange={(e) => setCustomerCuit(e.target.value)}
                          placeholder="CUIT / Razón Social (ej: 30-71234567-8)"
                          className="w-full bg-slate-900 border border-purple-500/50 rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Métodos de Pago Habilitados */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Método de Pago
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {storeConfig.allowCash !== false && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('Efectivo')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                            paymentMethod === 'Efectivo'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-md'
                              : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <DollarSign size={16} />
                          <span>Efectivo</span>
                        </button>
                      )}

                      {storeConfig.allowTransfer !== false && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('Transferencia Bancaria')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                            paymentMethod === 'Transferencia Bancaria'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-md'
                              : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <ArrowRight size={16} />
                          <span>Transferencia</span>
                        </button>
                      )}

                      {storeConfig.allowMercadoPago !== false && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('Mercado Pago')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                            paymentMethod === 'Mercado Pago'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 shadow-md'
                              : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <CreditCard size={16} />
                          <span>Mercado Pago</span>
                        </button>
                      )}
                    </div>

                    {/* Frictionless Helper: Efectivo & Calculadora de Vuelto */}
                    {paymentMethod === 'Efectivo' && (
                      <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-400 flex items-center gap-1">
                            <Banknote size={14} />
                            <span>¿Con cuánto abonás? (Calculadora de Vuelto)</span>
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Ej: 50000"
                            value={cashBillAmount}
                            onChange={(e) => setCashBillAmount(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-emerald-500/40 rounded-xl text-xs text-white font-bold placeholder-slate-600 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setCashBillAmount(String(totalCartAmount))}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-semibold whitespace-nowrap"
                          >
                            Monto Exacto
                          </button>
                        </div>

                        {/* Chips rápidos de billetes comunes */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[20000, 30000, 40000, 50000, 100000].filter(v => v >= totalCartAmount).map(chip => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setCashBillAmount(String(chip))}
                              className="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/30"
                            >
                              ${chip.toLocaleString('es-AR')}
                            </button>
                          ))}
                        </div>

                        {calculatedChange !== null && calculatedChange > 0 && (
                          <div className="text-[11px] font-bold text-emerald-300 pt-1">
                            💵 Tu vuelto estimado será: <b>${calculatedChange.toLocaleString('es-AR')}</b>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Frictionless Helper: Transferencia Bancaria con 1-Click Copy */}
                    {paymentMethod === 'Transferencia Bancaria' && (
                      <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-2 animate-in fade-in">
                        <div className="text-xs text-purple-300">
                          Transferí directamente al Alias oficial:
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-purple-500/30">
                          <span className="font-mono font-bold text-xs text-purple-200">
                            {storeConfig.transferAlias || 'republica.carne.mp'}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyAlias}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[11px] font-bold transition"
                          >
                            {copiedAlias ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            <span>{copiedAlias ? '¡Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Al finalizar, adjuntá el comprobante en el chat de WhatsApp que se abrirá automáticamente.
                        </p>
                      </div>
                    )}

                    {/* Frictionless Helper: Mercado Pago */}
                    {paymentMethod === 'Mercado Pago' && (
                      <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1.5 animate-in fade-in">
                        <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                          <CreditCard size={14} />
                          <span>Checkout Pro de Mercado Pago</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Pagá con Tarjeta de Débito, Crédito o Dinero en Cuenta con acreditación instantánea y protección al comprador.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Total & Action Button */}
                  <div className="pt-3 space-y-2.5 border-t border-white/10">
                    <div className="flex items-center justify-between text-base font-extrabold text-white">
                      <span>Total Estimado:</span>
                      <span className="text-xl text-emerald-400 font-black">${totalCartAmount.toLocaleString('es-AR')}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2 leading-tight">
                      <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
                      <span><strong>Aviso de balanza:</strong> Los precios de los cortes son por kilo. El valor final se confirmará al pesaje exacto al preparar el pedido.</span>
                    </div>

                    <button
                      onClick={handleCheckout}
                      disabled={isSubmittingOrder}
                      className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-2xl active:scale-98 transition-all disabled:opacity-50 text-slate-950"
                      style={{
                        background: `linear-gradient(135deg, ${storeConfig.primaryColor || '#10b981'}, ${storeConfig.accentColor || '#38bdf8'})`
                      }}
                    >
                      <MessageCircle className="w-5 h-5 fill-current" />
                      <span>{isSubmittingOrder ? 'Generando Pedido...' : 'Confirmar Pedido'}</span>
                    </button>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 5. Footer */}
      <footer className="border-t border-white/10 bg-slate-950/80 backdrop-blur-2xl py-8 text-center text-xs text-slate-400 relative z-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-bold text-slate-300">© 2026 {storeConfig.storeName || 'República de la Carne'}. Todos los derechos reservados.</p>
          <p className="text-[11px] text-slate-400">Carnicería Boutique & Asados Gourmet • Córdoba, Argentina</p>
          
          {onBackToAdmin && (
            <div className="pt-2">
              <button
                onClick={onBackToAdmin}
                className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition py-1 px-3 rounded-xl border border-transparent hover:border-white/10 bg-white/[0.02]"
              >
                <span>🔒 Acceso Operador CRM</span>
              </button>
            </div>
          )}
        </div>
      </footer>

    </div>
  );
}

/**
 * Tarjeta individual de Producto con Estilo Apple Minimalista
 */
function AppleProductCard({ product, onAddToCart, primaryColor = '#0071e3' }) {
  const isKgProduct = !product.unit || product.unit === 'kg';
  const isFractionable = isProductFractionable(product.name, product.category);
  const unitsPerKg = product.unitsPerKg || getUnitsPerKg(product.name);

  // Modo: 'kg' (peso) o 'units' (piezas)
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
    <div className="bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-300 group shadow-xl hover:shadow-2xl hover:-translate-y-1 backdrop-blur-xl">
      
      {/* Image Container with Glass Badges */}
      <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
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

        {/* Category Pill */}
        <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-xl text-[10px] font-bold text-slate-300 uppercase tracking-wider border border-white/10 shadow">
          {product.category || 'Carnicería'}
        </span>

        {isKgProduct && (
          <span 
            className="absolute top-3 right-3 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide backdrop-blur-md border border-white/15 text-slate-950"
            style={{ backgroundColor: primaryColor }}
          >
            {isFractionable ? '⚖️ Peso o Unid.' : '⚖️ Por Kilo'}
          </span>
        )}
      </div>

      {/* Product Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-white leading-snug line-clamp-2 mb-1 group-hover:text-emerald-400 transition-colors">
            {product.name}
          </h3>
          <div className="text-base font-black text-emerald-400">
            ${unitPrice.toLocaleString('es-AR')}
            <span className="text-xs text-slate-400 font-normal"> / {product.unit || 'kg'}</span>
          </div>
        </div>

        {/* Mode Selector (Kg vs Units) */}
        {isKgProduct && (
          <div className="bg-black/50 p-1 rounded-xl border border-white/10 flex text-[11px] font-bold">
            <button
              type="button"
              onClick={() => { setMode('kg'); setAmount(1); }}
              className={`flex-1 py-1 rounded-lg transition flex items-center justify-center gap-1 ${
                mode === 'kg' ? 'bg-white/20 text-white shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>⚖️</span>
              <span>Por Peso (Kg)</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('units'); setAmount(isFractionable ? 4 : 2); }}
              className={`flex-1 py-1 rounded-lg transition flex items-center justify-center gap-1 ${
                mode === 'units' ? 'bg-white/20 text-white shadow-sm font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🥩</span>
              <span>Por Unidad</span>
            </button>
          </div>
        )}

        {/* Quick Select Chips */}
        <div className="flex items-center gap-1.5 justify-center flex-wrap">
          {isKgProduct && mode === 'kg' ? (
            <>
              {[0.5, 1, 1.5, 2, 3].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setAmount(w)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition border ${
                    amount === w
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
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
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition border ${
                    amount === u
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
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
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition border ${
                    amount === u
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {u} {product.unit || 'un'}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Stepper & Add to Cart Button */}
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-black/50 border border-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={handleDecrement}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="text-center font-bold text-xs">
              <span className="text-white">
                {isKgProduct
                  ? (mode === 'units' ? `${amount} un (~${calculatedKg.toFixed(2)} kg)` : `${amount} kg`)
                  : `${amount} ${product.unit || 'un'}`}
              </span>
              <span className="text-[10px] text-emerald-400 font-extrabold block">
                Total: ${calculatedSubtotal.toLocaleString('es-AR')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleIncrement}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAddToCart(product, mode, amount)}
            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Agregar al Carrito</span>
          </button>
        </div>

      </div>

    </div>
  );
}

/**
 * Tarjeta de Seguimiento de Pedido (Tracking) Estilo Apple
 */
function AppleOrderTrackingCard({ order, whatsappNumber = '5493516262475' }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'delivered':
        return { label: '✅ Entregado con éxito', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'in_transit':
        return { label: '🛵 En camino a tu domicilio', bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' };
      case 'ready_for_pickup':
        return { label: '🏪 Listo para retirar', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'preparing':
        return { label: '🥩 En preparación en carnicería', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'cancelled':
        return { label: '❌ Cancelado', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      default:
        return { label: '⏳ Pedido Recibido', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
    }
  };

  const badge = getStatusBadge(order.status);
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="bg-slate-900/70 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Orden #{order.id}</span>
          <h4 className="text-base font-extrabold text-white">{order.customerName || 'Cliente'}</h4>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
          {badge.label}
        </div>
      </div>

      {/* Detalle */}
      <div className="space-y-1.5 text-xs text-slate-300 bg-black/40 p-3.5 rounded-2xl border border-white/10">
        <div className="font-semibold text-slate-400 mb-1">Cortes del pedido:</div>
        {items.map((it, idx) => (
          <div key={idx} className="font-medium text-slate-200">
            {typeof it === 'string' ? it : `• ${it.quantity || it.amount} ${it.unit || 'kg'} ${it.name} — $${Number(it.subtotal || it.price).toLocaleString('es-AR')}`}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-1">
        <div>
          <span>Destino: </span>
          <strong className="text-slate-200">{order.address || order.branch || 'Córdoba'}</strong>
        </div>
        <div className="text-base font-black text-emerald-400">
          Total: ${Number(order.totalAmount || 0).toLocaleString('es-AR')}
        </div>
      </div>

      {/* WhatsApp Support Button */}
      <div className="pt-2">
        <a
          href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola! Consulto por el estado de mi pedido #${order.id}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition border border-white/15"
        >
          <MessageCircle className="w-4 h-4 text-emerald-400" />
          <span>Consultar por WhatsApp</span>
        </a>
      </div>
    </div>
  );
}
