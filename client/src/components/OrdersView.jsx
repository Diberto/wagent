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
  CreditCard
} from 'lucide-react';

export default function OrdersView({ socket }) {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Status Change Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState(null); // { order, targetStatus, message, isSubmitting }

  // Create / Edit Order Modal State
  const [orderModal, setOrderModal] = useState(null); // null | { mode: 'create' | 'edit', data: { ... } }
  const [itemsInputText, setItemsInputText] = useState('');

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

      return () => {
        socket.off('order:new');
        socket.off('order:update');
        socket.off('order:delete');
      };
    }
  }, [socket]);

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
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
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
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
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
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Cortes / Combos (un ítem por línea):</label>
                <textarea
                  rows={3}
                  placeholder="1x Combo Asadazo ($39.999)&#10;2 kg Costeleta de Cerdo ($15.000)"
                  value={itemsInputText}
                  onChange={(e) => setItemsInputText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono"
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
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Medio de Pago:</label>
                  <select
                    value={orderModal.data.paymentMethod}
                    onChange={(e) => setOrderModal({
                      ...orderModal,
                      data: { ...orderModal.data, paymentMethod: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                  >
                    <option value="Efectivo al repartidor">Efectivo al repartidor</option>
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                    <option value="Mercado Pago">Mercado Pago</option>
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

    </div>
  );
}
