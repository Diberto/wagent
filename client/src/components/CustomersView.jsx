import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Phone, 
  MapPin, 
  DollarSign, 
  ShoppingBag, 
  Flame, 
  Heart, 
  Calendar, 
  Edit3, 
  Save, 
  Check, 
  Clock, 
  Star, 
  Tag, 
  MessageSquare,
  Sparkles,
  RefreshCw,
  ChefHat,
  CreditCard,
  Plus,
  Copy,
  Trash2,
  X
} from 'lucide-react';

export default function CustomersView({ socket, onSelectLeadForChat }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      if (!selectedCustomer && list.length > 0) {
        setSelectedCustomer(list[0]);
      } else if (selectedCustomer) {
        const updated = list.find(c => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();

    if (socket) {
      socket.on('lead:update', () => fetchCustomers());
      socket.on('order:new', () => fetchCustomers());
      return () => {
        socket.off('lead:update');
        socket.off('order:new');
      };
    }
  }, [socket]);

  useEffect(() => {
    if (selectedCustomer) {
      setEditForm({
        name: selectedCustomer.name || '',
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || '',
        preferences: {
          favoriteCuts: selectedCustomer.preferences?.favoriteCuts || [],
          cookingPreference: selectedCustomer.preferences?.cookingPreference || 'Parrilla',
          groupSize: selectedCustomer.preferences?.groupSize || '4 personas',
          preferredPayment: selectedCustomer.preferences?.preferredPayment || 'Efectivo / Transferencia',
          notes: selectedCustomer.preferences?.notes || ''
        }
      });
      setIsEditing(false);
    }
  }, [selectedCustomer]);

  const handleSaveCustomer = async () => {
    if (!selectedCustomer || !editForm) return;
    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const updated = await res.json();
      setSelectedCustomer(updated);
      setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error guardando ficha del cliente:', err);
    }
  };

  const handleDuplicateCustomer = async (customerId) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const cloned = await res.json();
        setCustomers(prev => [cloned, ...prev]);
        setSelectedCustomer(cloned);
      }
    } catch (err) {
      console.error('Error duplicando cliente:', err);
    }
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm(`¿Eliminar la ficha de este cliente de la base de datos?`)) return;
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
      if (res.ok) {
        setCustomers(prev => prev.filter(c => c.id !== customerId));
        setSelectedCustomer(null);
      }
    } catch (err) {
      console.error('Error eliminando cliente:', err);
    }
  };

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    address: '',
    cookingPreference: 'Parrilla',
    groupSize: '4 personas',
    notes: ''
  });

  const handleCreateCustomerSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCustomerForm,
          preferences: {
            favoriteCuts: [],
            cookingPreference: newCustomerForm.cookingPreference,
            groupSize: newCustomerForm.groupSize,
            preferredPayment: 'Efectivo / Transferencia',
            notes: newCustomerForm.notes
          }
        })
      });
      if (res.ok) {
        const created = await res.json();
        setCustomers(prev => [created, ...prev]);
        setSelectedCustomer(created);
        setCreateModalOpen(false);
        setNewCustomerForm({
          name: '',
          phone: '',
          address: '',
          cookingPreference: 'Parrilla',
          groupSize: '4 personas',
          notes: ''
        });
      }
    } catch (err) {
      console.error('Error creando cliente:', err);
    }
  };

  const handleAddFavoriteCut = (cutName) => {
    if (!cutName || !cutName.trim()) return;
    const cut = cutName.trim();
    if (!editForm.preferences.favoriteCuts.includes(cut)) {
      setEditForm(prev => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          favoriteCuts: [...prev.preferences.favoriteCuts, cut]
        }
      }));
    }
  };

  const handleRemoveFavoriteCut = (cutToRemove) => {
    setEditForm(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        favoriteCuts: prev.preferences.favoriteCuts.filter(c => c !== cutToRemove)
      }
    }));
  };

  // Metrics
  const totalCustomers = customers.length;
  const vipCustomersCount = customers.filter(c => (c.totalSpent >= 50000 || (c.tags || []).includes('Cliente VIP'))).length;
  const totalRevenueAll = customers.reduce((acc, c) => acc + (Number(c.totalSpent) || 0), 0);

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search) ||
      (c.address || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.preferences?.favoriteCuts || []).some(cut => cut.toLowerCase().includes(search.toLowerCase()));

    const isVip = (c.totalSpent >= 50000 || (c.tags || []).includes('Cliente VIP'));
    const isFrequent = c.totalOrders >= 2;

    if (tierFilter === 'vip') return matchesSearch && isVip;
    if (tierFilter === 'frequent') return matchesSearch && isFrequent;
    if (tierFilter === 'new') return matchesSearch && c.totalOrders <= 1;
    return matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden">
      
      {/* Top Banner with Stats */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#111b21] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="text-emerald-400" />
              Base de Datos & Memoria de Clientes
            </h1>
            <p className="text-xs text-slate-400">
              Historial de compras, preferencias gastronómicas, cortes favoritos y direcciones guardadas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md transition"
            >
              <Plus size={14} />
              Nuevo Cliente
            </button>

            <button
              onClick={fetchCustomers}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs transition"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="bg-[#182229] border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Clientes</div>
              <div className="text-sm font-bold text-white">{totalCustomers}</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Star size={16} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Clientes VIP</div>
              <div className="text-sm font-bold text-amber-400">{vipCustomersCount}</div>
            </div>
          </div>

          <div className="bg-[#182229] border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Ventas Acumuladas</div>
              <div className="text-sm font-bold text-purple-400">${totalRevenueAll.toLocaleString('es-AR')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body: Sidebar + Dossier */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Customer List */}
        <div className="w-full sm:w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-[#111b21]">
          {/* Search and Filters */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cliente, corte, teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'vip', label: '⭐ VIP' },
                { id: 'frequent', label: '🔥 Frecuentes' },
                { id: 'new', label: 'Nuevos' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setTierFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                    tierFilter === tab.id
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customers List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No se encontraron clientes
              </div>
            ) : (
              filteredCustomers.map(customer => {
                const isSelected = selectedCustomer?.id === customer.id;
                const isVip = customer.totalSpent >= 50000 || (customer.tags || []).includes('Cliente VIP');
                const isFrequent = customer.totalOrders >= 2;

                return (
                  <div
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className={`p-3.5 cursor-pointer transition flex items-start gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/10 border-l-4 border-emerald-500'
                        : 'hover:bg-[#182229]/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm shrink-0">
                      {(customer.name || customer.pushName || 'C').charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-bold text-white truncate">
                          {customer.name || customer.pushName || 'Cliente'}
                        </span>
                        {isVip && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            VIP
                          </span>
                        )}
                        {!isVip && isFrequent && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            Frecuente
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 truncate mb-1">
                        {customer.phone || customer.jid?.split('@')[0]}
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {customer.totalOrders || 0} pedidos
                        </span>
                        <span className="font-bold text-emerald-400">
                          ${(customer.totalSpent || 0).toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Customer Dossier & Memory */}
        <div className="hidden sm:flex flex-1 flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6">
          {selectedCustomer && editForm ? (
            <div className="space-y-6 max-w-4xl">
              
              {/* Dossier Header Card */}
              <div className="bg-[#182229] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
                      <div className="w-full h-full bg-[#111b21] rounded-[14px] flex items-center justify-center font-extrabold text-2xl text-emerald-400">
                        {(selectedCustomer.name || 'C').charAt(0).toUpperCase()}
                      </div>
                    </div>

                    <div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="text-lg font-bold text-white bg-[#111b21] border border-slate-700 px-2 py-1 rounded-xl"
                        />
                      ) : (
                        <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                          {selectedCustomer.name || selectedCustomer.pushName || 'Cliente'}
                          {selectedCustomer.totalSpent >= 50000 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <Star size={11} /> Cliente VIP
                            </span>
                          )}
                        </h2>
                      )}
                      
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                        <Phone size={12} className="text-emerald-400" />
                        <span>{selectedCustomer.phone || selectedCustomer.jid?.split('@')[0]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {onSelectLeadForChat && (
                      <button
                        onClick={() => onSelectLeadForChat(selectedCustomer)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition"
                        title="Abrir conversación"
                      >
                        <MessageSquare size={14} />
                        Chat
                      </button>
                    )}

                    <button
                      onClick={() => handleDuplicateCustomer(selectedCustomer.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#202c33] hover:bg-sky-950/40 text-slate-300 hover:text-sky-400 border border-slate-700 text-xs font-semibold transition"
                      title="Duplicar ficha de cliente"
                    >
                      <Copy size={14} />
                      Duplicar
                    </button>

                    {isEditing ? (
                      <button
                        onClick={handleSaveCustomer}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md transition"
                      >
                        <Save size={14} />
                        Guardar
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-200 text-xs font-semibold transition"
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                      className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                      title="Eliminar cliente"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 font-semibold">Total Comprado</div>
                    <div className="text-base font-bold text-emerald-400">${(selectedCustomer.totalSpent || 0).toLocaleString('es-AR')}</div>
                  </div>

                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 font-semibold">Pedidos Realizados</div>
                    <div className="text-base font-bold text-white">{selectedCustomer.totalOrders || 0}</div>
                  </div>

                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 font-semibold">Ticket Promedio</div>
                    <div className="text-base font-bold text-white">${(selectedCustomer.averageTicket || 0).toLocaleString('es-AR')}</div>
                  </div>

                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 font-semibold">Último Pedido</div>
                    <div className="text-xs font-bold text-slate-300">
                      {selectedCustomer.lastOrderAt ? new Date(selectedCustomer.lastOrderAt).toLocaleDateString() : 'Sin pedidos'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Delivery Address & General Data */}
              <div className="bg-[#182229] border border-slate-800 rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MapPin size={16} className="text-rose-400" />
                  Dirección Habitual de Entrega
                </h3>

                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Ej: Locelso 7089, Barrio Urca..."
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                ) : (
                  <div className="p-3 bg-[#111b21] rounded-2xl border border-slate-800 text-xs text-slate-200 font-medium">
                    {selectedCustomer.address || selectedCustomer.notes?.replace('Dirección de entrega: ', '') || 'No especificada'}
                  </div>
                )}
              </div>

              {/* Customer Memory & Gastronomic Preferences */}
              <div className="bg-[#182229] border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-400" />
                    Memoria & Gustos Gastronómicos (Para el Asesor IA)
                  </h3>
                  <span className="text-[11px] text-slate-400">La IA usa estos datos para personalizar sus recomendaciones</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                      <Flame size={12} className="text-amber-500" /> Cocción Habitual
                    </span>
                    {isEditing ? (
                      <select
                        value={editForm.preferences.cookingPreference}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          preferences: { ...editForm.preferences, cookingPreference: e.target.value }
                        })}
                        className="w-full bg-[#182229] border border-slate-700 text-xs text-white rounded-lg p-1.5"
                      >
                        <option value="Parrilla / Asado">Parrilla / Asado</option>
                        <option value="Horno y Estofados">Horno y Estofados</option>
                        <option value="Milanesas">Milanesas</option>
                        <option value="Comidas Diarias">Comidas Diarias</option>
                      </select>
                    ) : (
                      <div className="text-xs font-bold text-white">{selectedCustomer.preferences?.cookingPreference || 'Parrilla'}</div>
                    )}
                  </div>

                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                      <ChefHat size={12} className="text-emerald-400" /> Comensales Habituales
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.preferences.groupSize}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          preferences: { ...editForm.preferences, groupSize: e.target.value }
                        })}
                        className="w-full bg-[#182229] border border-slate-700 text-xs text-white rounded-lg p-1"
                      />
                    ) : (
                      <div className="text-xs font-bold text-white">{selectedCustomer.preferences?.groupSize || '4 personas'}</div>
                    )}
                  </div>

                  <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                      <CreditCard size={12} className="text-purple-400" /> Medio de Pago Preferido
                    </span>
                    {isEditing ? (
                      <select
                        value={editForm.preferences.preferredPayment}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          preferences: { ...editForm.preferences, preferredPayment: e.target.value }
                        })}
                        className="w-full bg-[#182229] border border-slate-700 text-xs text-white rounded-lg p-1.5"
                      >
                        <option value="Efectivo contraentrega">Efectivo contraentrega</option>
                        <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                        <option value="Mercado Pago">Mercado Pago</option>
                      </select>
                    ) : (
                      <div className="text-xs font-bold text-white">{selectedCustomer.preferences?.preferredPayment || 'Efectivo / Transferencia'}</div>
                    )}
                  </div>
                </div>

                {/* Favorite Cuts Tags */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Heart size={14} className="text-rose-400" />
                    Cortes & Combos Favoritos:
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(isEditing ? editForm.preferences.favoriteCuts : selectedCustomer.preferences?.favoriteCuts || []).map((cut, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      >
                        🥩 {cut}
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFavoriteCut(cut)}
                            className="text-slate-400 hover:text-rose-400 ml-1 font-bold"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}

                    {isEditing && (
                      <div className="flex items-center gap-1">
                        <input
                          id="newCutInput"
                          type="text"
                          placeholder="Agregar corte..."
                          className="px-2.5 py-1 rounded-lg bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 w-32"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddFavoriteCut(e.target.value);
                              e.target.value = '';
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes by Agent */}
                <div className="space-y-1 pt-1">
                  <div className="text-xs font-bold text-slate-300">Notas & Observaciones del Asesor:</div>
                  {isEditing ? (
                    <textarea
                      rows={2}
                      value={editForm.preferences.notes}
                      onChange={(e) => setEditForm({
                        ...editForm,
                        preferences: { ...editForm.preferences, notes: e.target.value }
                      })}
                      placeholder="Ej: Prefiere cortes con poca grasa, le gusta la carne a punto..."
                      className="w-full p-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <div className="p-3 bg-[#111b21] rounded-2xl border border-slate-800 text-xs text-slate-300 italic">
                      {selectedCustomer.preferences?.notes || selectedCustomer.notes || 'Sin notas especiales registradas.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Order History */}
              <div className="bg-[#182229] border border-slate-800 rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShoppingBag size={16} className="text-emerald-400" />
                    Historial de Pedidos Realizados ({selectedCustomer.orders?.length || 0})
                  </h3>
                </div>

                {selectedCustomer.orders && selectedCustomer.orders.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {selectedCustomer.orders.map(order => (
                      <div
                        key={order.id}
                        className="bg-[#111b21] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-400 font-mono">#{order.id}</span>
                            <span className="text-[11px] text-slate-400">📅 {new Date(order.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-slate-300 font-mono text-[11px]">
                            {Array.isArray(order.items) ? order.items.join(' • ') : '1x Combo Asado'}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-bold text-white">${(Number(order.totalAmount) || 0).toLocaleString('es-AR')}</div>
                          <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500 bg-[#111b21] rounded-2xl border border-slate-800">
                    Este cliente aún no registra pedidos cerrados.
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="py-20 text-center text-xs text-slate-500">
              Selecciona un cliente de la lista para ver su dossier completo y memoria
            </div>
          )}
        </div>

      </div>

      {/* Create Customer Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Nuevo Cliente</h3>
                  <p className="text-xs text-slate-400">Registrar cliente y preferencias en la base de datos</p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nombre y Apellido:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Marcelo Perez"
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Teléfono / WhatsApp:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: +54 9 351 555-1234"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Dirección de Entrega:</label>
                <input
                  type="text"
                  placeholder="Ej: Av. Recta Martinoli 6500, Villa Belgrano"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Preferencia de Cocción:</label>
                  <select
                    value={newCustomerForm.cookingPreference}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, cookingPreference: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                  >
                    <option value="Parrilla / Asado">Parrilla / Asado</option>
                    <option value="Horno y Estofados">Horno y Estofados</option>
                    <option value="Milanesas">Milanesas</option>
                    <option value="Comidas Diarias">Comidas Diarias</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Comensales Habituales:</label>
                  <input
                    type="text"
                    placeholder="Ej: 4 a 6 personas"
                    value={newCustomerForm.groupSize}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, groupSize: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Notas y Observaciones:</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Prefiere cortes desgrasados, atiende por la tarde..."
                  value={newCustomerForm.notes}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition"
                >
                  <Save size={14} />
                  Guardar Cliente
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
