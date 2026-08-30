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
  Users
} from 'lucide-react';

export default function OrdersView({ socket }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Status Change Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState(null); // { order, targetStatus, message, isSubmitting }

  // Create / Edit Order Modal State
  const [orderModal, setOrderModal] = useState(null); // null | { mode: 'create' | 'edit', data: { ... } }
  const [itemsInputText, setItemsInputText] = useState('');

  // Mercado Pago Payment Link Modal
  const [paymentModal, setPaymentModal] = useState(null); // null | { order, linkData, isGenerating, isSending, sendSuccess }

  // Branch Derivation Modal State
  const [deriveModal, setDeriveModal] = useState(null); // null | { order, branchId, notes, notifyClient, isDeriving, deriveSuccess }

  // Driver Assignment Modal State
  const [assignDriverModal, setAssignDriverModal] = useState(null); // null | { order, driverId, notes, notifyClient, isAssigning, assignSuccess }

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

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando pedidos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchBranches();
    fetchDrivers();
    fetchCustomers();
    fetchBranches();
    fetchDrivers();

    if (socket) {
      socket.on('order:new', (newOrder) => {
        setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
      });

      socket.on('order:update', (updatedOrder) => {
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
      });

      socket.on('order:delete', (deletedId) => {
        setOrders(prev => prev.filter(o => o.id !== deletedId));
      });

      socket.on('driver:update', () => fetchDrivers());
      socket.on('driver:new', () => fetchDrivers());

      return () => {
        socket.off('order:new');
        socket.off('order:update');
        socket.off('order:delete');
        socket.off('driver:update');
        socket.off('driver:new');
      };
    }
  }, [socket]);

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

  const generateStatusNotification = (order, targetStatus) => {
    const name = order.customerName || 'Cliente';
    const orderId = order.id;
    const address = order.address || 'tu domicilio';
    const payment = order.paymentMethod || 'Efectivo / Transferencia';

    switch (targetStatus) {
      case 'preparing':
        return `¡Hola ${name}! 🥩 Te avisamos que tu pedido #${orderId} ya está en preparación con cortes frescos por nuestro equipo de carnicería. En breve te avisamos cuando salga el repartidor.`;
      case 'in_transit':
        return `¡Hola ${name}! 🚚 Tu pedido #${orderId} ya salió de sucursal y va en camino hacia ${address}. ¡Tené a mano el medio de pago acordado (${payment})! 🥩🔥`;
      case 'delivered':
        return `¡Hola ${name}! 🎉 Tu pedido #${orderId} ya figura entregado. ¡Esperamos que disfrutes de un excelente asado! Cualquier consulta o comentario sobre los cortes estamos a tu disposición. 🥩🙌`;
      case 'cancelled':
        return `Hola ${name}. Te informamos que tu pedido #${orderId} ha sido cancelado. Si necesitás reprogramarlo o tenés alguna duda, avisanos por acá.`;
      case 'pending':
        return `¡Hola ${name}! Tu pedido #${orderId} se encuentra registrado y pendiente de preparación.`;
      default:
        return `¡Hola ${name}! Tu pedido #${orderId} ha actualizado su estado a: ${targetStatus}.`;
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
          notifyCustomer: Boolean(notifyCustomer),
          notificationMessage: notifyCustomer ? message : undefined
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: targetStatus } : o));
        setConfirmModal(null);
      }
    } catch (err) {
      console.error('Error actualizando estado del pedido:', err);
      setConfirmModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDuplicateOrder = async (orderId) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const cloned = await res.json();
        setOrders(prev => [cloned, ...prev]);
      }
    } catch (err) {
      console.error('Error duplicando pedido:', err);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`¿Eliminar el pedido #${orderId}?`)) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
      }
    } catch (err) {
      console.error('Error eliminando pedido:', err);
    }
  };

  const handleOpenCreateOrder = () => {
    setOrderModal({
      mode: 'create',
      data: {
        customerName: '',
        phone: '',
        address: '',
        items: ['1x Combo Asadazo ($39.999)'],
        totalAmount: 39999,
        paymentMethod: 'Efectivo al repartidor',
        status: 'pending',
        notes: ''
      }
    });
    setItemsInputText('1x Combo Asadazo ($39.999)');
  };

  const handleOpenEditOrder = (order) => {
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
  const inTransitCount = orders.filter(o => o.status === 'in_transit').length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.phone || '').includes(search) ||
      (order.address || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.id || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock size={12} /> Pendiente</span>;
      case 'preparing':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20"><Package size={12} /> En Preparación</span>;
      case 'in_transit':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20"><Truck size={12} /> En Camino</span>;
      case 'delivered':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={12} /> Entregado</span>;
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              <div className="text-[11px] text-slate-400 font-semibold">Por Despachar</div>
              <div className="text-lg font-bold text-amber-400">{pendingCount} pedidos</div>
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
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111b21] p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono, dirección o # de pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pending', label: 'Pendientes' },
            { id: 'preparing', label: 'En Preparación' },
            { id: 'in_transit', label: 'En Camino' },
            { id: 'delivered', label: 'Entregados' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === tab.id
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
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
            Cuando un cliente confirme su pedido por WhatsApp o hagas clic en "Nuevo Pedido", aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map(order => (
            <div
              key={order.id}
              className="bg-[#182229] border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-lg transition"
            >
              {/* Card Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-400 font-mono">
                    #{order.id}
                  </span>
                  {getStatusBadge(order.status)}
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
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Detalle de Cortes:</div>
                <div className="bg-[#111b21] rounded-xl p-2.5 border border-slate-800 text-xs text-slate-300 space-y-1 max-h-24 overflow-y-auto font-mono text-[11px]">
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item, idx) => (
                      <div key={idx} className="truncate">{item}</div>
                    ))
                  ) : (
                    <div className="text-slate-500">{order.items || '1x Combo Asadazo ($39.999)'}</div>
                  )}
                </div>
              </div>

              {/* Branch Assignment Badge */}
              <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Store size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-slate-300 font-semibold truncate">
                    {order.branchName || 'Sin Sucursal Asignada'}
                  </span>
                </div>
                {order.branchStatus && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
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
              </div>

              {/* Driver Assignment Badge */}
              <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Bike size={13} className="text-sky-400 shrink-0" />
                  <span className="text-slate-300 font-semibold truncate">
                    {order.driverName ? `Repartidor: ${order.driverName}` : 'Sin Repartidor Asignado'}
                  </span>
                </div>
                {order.driverStatus && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                    order.driverStatus === 'in_transit'
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      : order.driverStatus === 'delivered'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {order.driverStatus === 'in_transit' ? '🛵 En Camino' : order.driverStatus === 'delivered' ? '✅ Entregado' : '⏳ Asignado'}
                  </span>
                )}
              </div>

              {/* Status Selector & Actions */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={order.status}
                    onChange={(e) => handleRequestStatusChange(order, e.target.value)}
                    className="flex-1 bg-[#111b21] border border-slate-700/80 text-xs text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="preparing">🥩 En Preparación</option>
                    <option value="in_transit">🚚 En Camino</option>
                    <option value="delivered">✅ Entregado</option>
                    <option value="cancelled">❌ Cancelado</option>
                  </select>

                  <button
                    onClick={() => handleOpenAssignDriverModal(order)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                    title="Asignar Repartidor y Despachar por WhatsApp"
                  >
                    <Bike size={14} />
                  </button>

                  <button
                    onClick={() => handleOpenDeriveModal(order)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                    title="Derivar a Sucursal con WhatsApp"
                  >
                    <Store size={14} />
                  </button>

                  <button
                    onClick={() => handleOpenPaymentLink(order)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-[#009ee3]/20 text-slate-400 hover:text-[#009ee3] border border-slate-700/60 transition"
                    title="Cobrar con Mercado Pago"
                  >
                    <CreditCard size={14} />
                  </button>

                  <button
                    onClick={() => handleOpenEditOrder(order)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                    title="Editar pedido"
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    onClick={() => handleDuplicateOrder(order.id)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                    title="Duplicar pedido"
                  >
                    <Copy size={14} />
                  </button>

                  <button
                    onClick={() => handleDeleteOrder(order.id)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                    title="Eliminar pedido"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

            </div>
          ))}
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

      {/* Create / Edit Order Modal */}
      {orderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {orderModal.mode === 'create' ? 'Nuevo Pedido Manual' : `Editar Pedido #${orderModal.data.id}`}
                  </h3>
                  <p className="text-xs text-slate-400">Detalles del cliente, cortes y monto total</p>
                </div>
              </div>
              <button
                onClick={() => setOrderModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrderForm} className="space-y-4 text-xs">
              
              {/* Quick Customer Picker */}
              <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Users size={14} /> Seleccionar Cliente de la Base de Datos:
                  </span>
                  <span className="text-[10px] text-slate-500">Autocompleta nombre, tel y dirección</span>
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
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="">👤 Elegir cliente existente para autocompletar...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.pushName || 'Cliente'} — 📞 {c.phone || c.jid?.split('@')[0]} {c.address ? `(${c.address})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nombre del Cliente:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Juan Gonzalez"
                    value={orderModal.data.customerName}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, customerName: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

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
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Dirección de Entrega:</label>
                <input
                  type="text"
                  placeholder="Ej: Roque Funes 1704, Barrio Urca"
                  value={orderModal.data.address}
                  onChange={(e) => setOrderModal({
                    ...orderModal,
                    data: { ...orderModal.data, address: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Cortes / Combos (un ítem por línea):</label>
                <textarea
                  rows={3}
                  placeholder="1x Combo Asadazo ($39.999)&#10;2 kg Costeleta de Cerdo ($15.000)"
                  value={itemsInputText}
                  onChange={(e) => setItemsInputText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Monto Total ($):</label>
                  <input
                    type="number"
                    required
                    value={orderModal.data.totalAmount}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, totalAmount: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-bold focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="preparing">🥩 En Preparación (Carnicería)</option>
                    <option value="in_transit">🛵 En Reparto / Despachado</option>
                    <option value="delivered">✅ Entregado / Finalizado</option>
                    <option value="cancelled">❌ Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Medio de Pago:</label>
                  <select
                    value={orderModal.data.paymentMethod}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, paymentMethod: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Efectivo al repartidor">💵 Efectivo al repartidor</option>
                    <option value="Mercado Pago">💳 Mercado Pago</option>
                    <option value="Mercado Pago (Sandbox)">🧪 Mercado Pago (Sandbox)</option>
                    <option value="Transferencia Bancaria">📱 Transferencia Bancaria</option>
                    <option value="Tarjeta de Débito / Crédito">💳 Tarjeta Débito / Crédito</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Sucursal Asignada:</label>
                  <select
                    value={orderModal.data.branchId || ''}
                    onChange={(e) => {
                      const selected = branches.find(b => b.id === e.target.value);
                      setOrderModal({
                        ...orderModal,
                        data: {
                          ...orderModal.data,
                          branchId: e.target.value,
                          branchName: selected ? selected.name : ''
                        }
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">🏢 Central / General</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>📍 {b.name} ({b.address})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Repartidor Asignado:</label>
                  <select
                    value={orderModal.data.driverId || ''}
                    onChange={(e) => {
                      const selected = drivers.find(d => d.id === e.target.value);
                      setOrderModal({
                        ...orderModal,
                        data: {
                          ...orderModal.data,
                          driverId: e.target.value,
                          driverName: selected ? selected.name : ''
                        }
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">🛵 Sin Repartidor Asignado</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.vehicle === 'Auto' ? '🚗' : '🛵'} {d.name} ({d.vehicle}) - {d.status === 'busy' ? 'Ocupado' : 'Disponible'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrderModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition"
                >
                  <Save size={14} />
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
                  <div>
                    {paymentModal.linkData.isSandbox && (
                      <button
                        type="button"
                        onClick={handleSimulatePayment}
                        disabled={paymentModal.isSimulating}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition disabled:opacity-50"
                        title="Simular aprobación inmediata de pago sin abrir Mercado Pago"
                      >
                        <RefreshCw size={13} className={paymentModal.isSimulating ? 'animate-spin' : ''} />
                        {paymentModal.isSimulating ? 'Simulando...' : '🧪 Simular Pago Aprobado'}
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
                  <label className="block text-slate-300 font-semibold mb-1">Seleccionar Sucursal Destino:</label>
                  <select
                    required
                    value={deriveModal.branchId}
                    onChange={(e) => setDeriveModal({ ...deriveModal, branchId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecciona una sucursal...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} — ({b.phone || 'Sin tel'}) {b.address ? `• ${b.address}` : ''}
                      </option>
                    ))}
                  </select>
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
                  <label className="block text-slate-300 font-semibold mb-1">Seleccionar Repartidor:</label>
                  <select
                    required
                    value={assignDriverModal.driverId}
                    onChange={(e) => setAssignDriverModal({ ...assignDriverModal, driverId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecciona un repartidor...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.vehicle || 'Moto'} ({d.phone || 'Sin tel'}) • {d.status === 'available' ? '🟢 Libre' : '🛵 En ruta'}
                      </option>
                    ))}
                  </select>
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

    </div>
  );
}
