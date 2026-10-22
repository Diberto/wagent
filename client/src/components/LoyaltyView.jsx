import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, 
  Crown, 
  Sparkles, 
  Gift, 
  Users, 
  TrendingUp, 
  Send, 
  Check, 
  Plus, 
  Settings2, 
  ArrowRight, 
  RefreshCw, 
  DollarSign, 
  MessageSquare,
  AlertCircle,
  Clock,
  History,
  ShieldCheck,
  ChevronRight,
  User,
  Search,
  Filter,
  ArrowUpDown,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Save,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  Download,
  UserCheck,
  UserX,
  Store,
  SlidersHorizontal
} from 'lucide-react';

export default function LoyaltyView({ socket, onSelectLeadForChat }) {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'members' | 'tiers' | 'portal' | 'broadcast'
  
  // Clientes y Sucursales
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);

  // Búsqueda, Filtros y Ordenamiento
  const [searchQuery, setSearchQuery] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('all'); // 'all' | 'club_only' | 'non_club'
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 'bronce' | 'plata' | 'oro' | 'platino'
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortBy, setSortBy] = useState('points_desc'); // 'points_desc' | 'points_asc' | 'spent_desc' | 'orders_desc' | 'name_asc' | 'name_desc' | 'recent'
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Campaña WhatsApp segmentada
  const [selectedTierForBroadcast, setSelectedTierForBroadcast] = useState('all');
  const [broadcastMessage, setBroadcastMessage] = useState(
    '🎉 ¡Hola {nombre}! Como cliente destacado en nuestro programa de puntos, queremos premiarte hoy con un beneficio exclusivo. ¡Escribinos para aprovecharlo!'
  );
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  // Modal ajuste manual de puntos
  const [adjustModal, setAdjustModal] = useState({ open: false, customerId: '', points: 50, type: 'BONUS', reason: '' });
  const [adjustSuccess, setAdjustSuccess] = useState(null);

  // Modal edición de socio/cliente
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    preferredBranch: '',
    cuit: '',
    birthDate: '',
    cookingPreference: 'Parrilla',
    notes: '',
    pointsToAdd: 0,
    pointsReason: 'Bono administrativo'
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [editFeedback, setEditFeedback] = useState(null);

  // Modal historial / extracto de puntos del cliente
  const [historyModal, setHistoryModal] = useState({ open: false, customer: null, movements: [], loading: false });

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/loyalty/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching loyalty stats:', e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/loyalty/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error('Error fetching loyalty config:', e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error fetching customers:', e);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error fetching branches:', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchConfig(), fetchCustomers(), fetchBranches()]);
      setLoading(false);
    };
    init();

    if (socket) {
      socket.on('loyalty:points-earned', () => { fetchStats(); fetchCustomers(); });
      socket.on('loyalty:points-redeemed', () => { fetchStats(); fetchCustomers(); });
      socket.on('loyalty:points-adjusted', () => { fetchStats(); fetchCustomers(); });
      socket.on('loyalty:config-update', (updated) => { setConfig(updated); fetchStats(); });
      socket.on('lead:update', () => { fetchCustomers(); fetchStats(); });
    }

    return () => {
      if (socket) {
        socket.off('loyalty:points-earned');
        socket.off('loyalty:points-redeemed');
        socket.off('loyalty:points-adjusted');
        socket.off('loyalty:config-update');
        socket.off('lead:update');
      }
    };
  }, [socket]);

  // Helper para verificar si un cliente es miembro activo del club
  const isClubMember = (c) => {
    if (!c) return false;
    const pts = c.loyalty?.currentPoints || 0;
    const spent = Number(c.totalSpent) || 0;
    const registered = c.registeredVia === 'micuenta_portal' || c.customFields?.registeredVia === 'micuenta_portal' || Boolean(c.pin);
    const nonBronze = c.loyalty?.tier?.id && c.loyalty.tier.id !== 'bronce';
    return pts > 0 || spent > 0 || registered || nonBronze;
  };

  // Contadores dinámicos para los filtros
  const { clubCount, nonClubCount, tierCounts } = useMemo(() => {
    let club = 0;
    let nonClub = 0;
    const tiers = { bronce: 0, plata: 0, oro: 0, platino: 0 };

    for (const c of customers) {
      if (isClubMember(c)) {
        club++;
      } else {
        nonClub++;
      }
      const tid = c.loyalty?.tier?.id || 'bronce';
      if (tiers[tid] !== undefined) tiers[tid]++;
    }

    return { clubCount: club, nonClubCount: nonClub, tierCounts: tiers };
  }, [customers]);

  // Filtrado y Ordenamiento
  const filteredAndSortedCustomers = useMemo(() => {
    let result = [...customers];

    // 1. Búsqueda por texto libre
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        const cuit = (c.cuit || '').toLowerCase();
        const branch = (c.preferredBranch || '').toLowerCase();
        const notes = (c.notes || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q) || address.includes(q) || cuit.includes(q) || branch.includes(q) || notes.includes(q);
      });
    }

    // 2. Filtro de Membresía del Club
    if (membershipFilter === 'club_only') {
      result = result.filter(isClubMember);
    } else if (membershipFilter === 'non_club') {
      result = result.filter(c => !isClubMember(c));
    }

    // 3. Filtro por Categoría / Tier
    if (tierFilter !== 'all') {
      result = result.filter(c => (c.loyalty?.tier?.id || 'bronce') === tierFilter);
    }

    // 4. Filtro por Sucursal
    if (branchFilter !== 'all') {
      result = result.filter(c => {
        const b = (c.preferredBranch || '').toLowerCase();
        return b.includes(branchFilter.toLowerCase());
      });
    }

    // 5. Ordenamiento
    result.sort((a, b) => {
      switch (sortBy) {
        case 'points_desc':
          return (b.loyalty?.currentPoints || 0) - (a.loyalty?.currentPoints || 0);
        case 'points_asc':
          return (a.loyalty?.currentPoints || 0) - (b.loyalty?.currentPoints || 0);
        case 'spent_desc':
          return (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0);
        case 'orders_desc':
          return (b.totalOrders || b.orders?.length || 0) - (a.totalOrders || a.orders?.length || 0);
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '', 'es', { sensitivity: 'base' });
        case 'recent':
        default:
          return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      }
    });

    return result;
  }, [customers, searchQuery, membershipFilter, tierFilter, branchFilter, sortBy]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedCustomers.slice(start, start + pageSize);
  }, [filteredAndSortedCustomers, currentPage, pageSize]);

  // Reset a página 1 si cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, membershipFilter, tierFilter, branchFilter, sortBy, pageSize]);

  // Guardar configuración global
  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/loyalty/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch (e) {
      console.error('Error saving config:', e);
    } finally {
      setSaving(false);
    }
  };

  // Difusión WhatsApp
  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setIsSendingBroadcast(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/loyalty/broadcast-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: selectedTierForBroadcast,
          message: broadcastMessage
        })
      });
      const data = await res.json();
      setBroadcastResult(data);
    } catch (err) {
      setBroadcastResult({ error: err.message });
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  // Ajuste manual de puntos
  const handleExecuteAdjust = async () => {
    if (!adjustModal.customerId || !adjustModal.points) return;
    try {
      const res = await fetch('/api/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustModal)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdjustSuccess(`Puntos asignados correctamente a ${data.loyalty?.customerName}`);
        await Promise.all([fetchStats(), fetchCustomers()]);
        setTimeout(() => {
          setAdjustModal({ open: false, customerId: '', points: 50, type: 'BONUS', reason: '' });
          setAdjustSuccess(null);
        }, 1500);
      } else {
        alert(data.error || 'Error al ajustar puntos');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  // Abrir Modal de Edición de Cliente
  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setEditFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || customer.shippingAddress || '',
      preferredBranch: customer.preferredBranch || customer.branchId || '',
      cuit: customer.cuit || '',
      birthDate: customer.birthDate || customer.customFields?.birthDate || '',
      cookingPreference: customer.cookingPreference || customer.customFields?.cookingPreference || 'Parrilla',
      notes: customer.notes || customer.preferences?.notes || '',
      pointsToAdd: 0,
      pointsReason: 'Bono de fidelidad'
    });
    setEditFeedback(null);
  };

  // Guardar Cambios en Cliente
  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;
    setIsSavingCustomer(true);
    setEditFeedback(null);
    try {
      // 1. Guardar perfil básico
      const res = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFormData.name,
          phone: editFormData.phone,
          email: editFormData.email,
          address: editFormData.address,
          preferredBranch: editFormData.preferredBranch,
          cuit: editFormData.cuit,
          birthDate: editFormData.birthDate,
          cookingPreference: editFormData.cookingPreference,
          notes: editFormData.notes,
          customFields: {
            ...(editingCustomer.customFields || {}),
            birthDate: editFormData.birthDate,
            cookingPreference: editFormData.cookingPreference
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error actualizando cliente');
      }

      // 2. Si se solicitó ajuste de puntos en el mismo modal
      if (editFormData.pointsToAdd && Number(editFormData.pointsToAdd) !== 0) {
        const pts = Math.abs(Number(editFormData.pointsToAdd));
        const isBonus = Number(editFormData.pointsToAdd) > 0;
        await fetch('/api/loyalty/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: editingCustomer.id,
            points: pts,
            type: isBonus ? 'BONUS' : 'ADJUST_DOWN',
            reason: editFormData.pointsReason || (isBonus ? 'Bono administrativo' : 'Deducción administrativa')
          })
        });
      }

      setEditFeedback({ success: true, message: '¡Datos y puntos del socio actualizados exitosamente!' });
      await Promise.all([fetchCustomers(), fetchStats()]);
      setTimeout(() => {
        setEditingCustomer(null);
        setEditFeedback(null);
      }, 1400);
    } catch (err) {
      setEditFeedback({ success: false, message: err.message || 'Error guardando datos' });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Abrir Historial de Puntos del Cliente
  const handleViewHistory = async (customer) => {
    setHistoryModal({ open: true, customer, movements: [], loading: true });
    try {
      const res = await fetch(`/api/loyalty/customer/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryModal({ open: true, customer, movements: data.recentMovements || [], loading: false });
      } else {
        setHistoryModal(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      console.error('Error fetching customer loyalty history:', e);
      setHistoryModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Exportar lista filtrada a CSV
  const handleExportFiltered = () => {
    const headers = ['Nombre', 'Teléfono', 'Email', 'Estado Club', 'Nivel Tier', 'Puntos Actuales', 'Valor ($)', 'Total Gastado', 'Pedidos', 'Sucursal'];
    const rows = filteredAndSortedCustomers.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${isClubMember(c) ? 'Socio Activo' : 'No Miembro'}"`,
      `"${c.loyalty?.tier?.name || 'Bronce'}"`,
      c.loyalty?.currentPoints || 0,
      c.loyalty?.monetaryValue || 0,
      c.totalSpent || 0,
      c.totalOrders || c.orders?.length || 0,
      `"${(c.preferredBranch || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socios_club_fidelizacion_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-slate-950 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
        <span>Cargando Programa de Fidelización...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header Superior */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/5">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Club de Fidelización & Puntos
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Activo
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Segmentación inteligente por niveles (Bronce, Plata, Oro, Platino), directorio de socios, ledger inmutable y WhatsApp automático
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs y Acción Rápida */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'overview' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'members' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Socios & Clientes ({clubCount})
            </button>
            <button
              onClick={() => setActiveTab('tiers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'tiers' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Niveles & Reglas
            </button>
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'portal' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Formulario /micuenta
            </button>
            <button
              onClick={() => setActiveTab('broadcast')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'broadcast' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Campañas WhatsApp
            </button>
          </div>

          <button
            onClick={() => setAdjustModal({ open: true, customerId: customers[0]?.id || '', points: 100, type: 'BONUS', reason: 'Bono de fidelidad' })}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Otorgar Bono
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* KPI Cards (Siempre visibles en overview y members) */}
        {(activeTab === 'overview' || activeTab === 'members') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Miembros en el Club</span>
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-extrabold text-white flex items-baseline gap-2">
                {clubCount}
                <span className="text-xs font-normal text-slate-400">/ {customers.length} totales</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{nonClubCount} usuarios aún no afiliados</p>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Puntos Emitidos</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-extrabold text-amber-400">
                {(stats?.totalPointsIssued || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Por compras y bonificaciones</p>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Puntos Canjeados</span>
                <Gift className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold text-emerald-400">
                {(stats?.totalPointsRedeemed || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Descuentos efectivos otorgados</p>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Puntos Circulantes</span>
                <Award className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-extrabold text-indigo-400">
                {(stats?.currentOutstandingPoints || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Equivalente a ${(stats?.currentOutstandingPoints || 0).toLocaleString('es-AR')} en compras</p>
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW & TIERS DISTRIBUTION */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Tiers distribution breakdown */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Segmentación de la Comunidad por Categoría
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(stats?.tierDistribution || []).map((tier) => (
                  <div
                    key={tier.id}
                    onClick={() => {
                      setTierFilter(tier.id);
                      setMembershipFilter('all');
                    }}
                    className={`p-5 rounded-xl border relative overflow-hidden transition-all hover:scale-[1.02] cursor-pointer ${
                      tierFilter === tier.id ? 'ring-2 ring-amber-400 shadow-lg' : ''
                    }`}
                    style={{
                      borderColor: `${tier.badgeColor}40`,
                      background: `linear-gradient(135deg, ${tier.badgeColor}10, transparent)`
                    }}
                    title={`Click para filtrar usuarios nivel ${tier.name}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ color: tier.badgeColor, backgroundColor: `${tier.badgeColor}20` }}>
                        {tier.name}
                      </span>
                      <Award className="w-5 h-5" style={{ color: tier.badgeColor }} />
                    </div>
                    <div className="text-2xl font-black text-white">
                      {tier.count || 0} <span className="text-xs font-normal text-slate-400">socios</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-400 space-y-1">
                      <p>• Gasto mín: <strong className="text-slate-200">${tier.minSpend.toLocaleString('es-AR')}</strong></p>
                      <p>• Puntos: <strong className="text-slate-200">x{tier.pointsMultiplier}</strong></p>
                      <p>• Descuento: <strong className="text-emerald-400">{tier.discountPercentage}% OFF</strong></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TABLA PRINCIPAL DE USUARIOS & SOCIOS DEL CLUB (En overview y en members) */}
        {(activeTab === 'overview' || activeTab === 'members') && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-5">
            {/* Header de la sección */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  Directorio de Usuarios & Miembros del Club
                </h2>
                <p className="text-xs text-slate-400">
                  Consulta de saldos de puntos, categorías alcanzadas, edición directa de clientes y gestión de beneficios.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExportFiltered}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                  title="Exportar socios filtrados a archivo CSV / Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  Exportar CSV ({filteredAndSortedCustomers.length})
                </button>
                <button
                  onClick={() => { fetchCustomers(); fetchStats(); }}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
                  title="Recargar datos"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Barra de Filtros, Búsqueda y Ordenamiento */}
            <div className="space-y-3">
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                {/* Input de Búsqueda */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, teléfono, email, DNI, dirección o sucursal..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Selectores de Ordenar y Sucursal */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Selector de Ordenamiento */}
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
                    >
                      <option value="points_desc" className="bg-slate-900">🏆 Más Puntos</option>
                      <option value="points_asc" className="bg-slate-900">🪙 Menos Puntos</option>
                      <option value="spent_desc" className="bg-slate-900">💰 Mayor Gasto ($)</option>
                      <option value="orders_desc" className="bg-slate-900">📦 Más Pedidos</option>
                      <option value="name_asc" className="bg-slate-900">🔤 Nombre (A-Z)</option>
                      <option value="name_desc" className="bg-slate-900">🔤 Nombre (Z-A)</option>
                      <option value="recent" className="bg-slate-900">📅 Actividad Reciente</option>
                    </select>
                  </div>

                  {/* Selector de Sucursal */}
                  {branches.length > 0 && (
                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                      <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <select
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1 max-w-[140px] truncate"
                      >
                        <option value="all" className="bg-slate-900">Todas las sucursales</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.name} className="bg-slate-900">{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Selector de Tamaño de Página */}
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value={10} className="bg-slate-900">10 / pág</option>
                    <option value={20} className="bg-slate-900">20 / pág</option>
                    <option value={50} className="bg-slate-900">50 / pág</option>
                    <option value={100} className="bg-slate-900">100 / pág</option>
                  </select>
                </div>
              </div>

              {/* Filtros rápidos tipo Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* Filtro Membresía del Club */}
                <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setMembershipFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      membershipFilter === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todos ({customers.length})
                  </button>
                  <button
                    onClick={() => setMembershipFilter('club_only')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      membershipFilter === 'club_only'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Crown className="w-3 h-3 text-amber-300" />
                    Miembros del Club ({clubCount})
                  </button>
                  <button
                    onClick={() => setMembershipFilter('non_club')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      membershipFilter === 'non_club'
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    No Miembros ({nonClubCount})
                  </button>
                </div>

                {/* Filtro Niveles Tier */}
                <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 px-2">Categoría:</span>
                  <button
                    onClick={() => setTierFilter('all')}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition ${
                      tierFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas
                  </button>
                  {(config?.tiers || [
                    { id: 'bronce', name: 'Bronce', badgeColor: '#CD7F32' },
                    { id: 'plata', name: 'Plata', badgeColor: '#C0C0C0' },
                    { id: 'oro', name: 'Oro', badgeColor: '#FFD700' },
                    { id: 'platino', name: 'Platino', badgeColor: '#E5E4E2' }
                  ]).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTierFilter(t.id)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                        tierFilter === t.id ? 'bg-slate-700 text-white ring-1 ring-amber-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.badgeColor }} />
                      {t.name} ({tierCounts[t.id] || 0})
                    </button>
                  ))}
                </div>

                {/* Botón reset de filtros si hay alguno activo */}
                {(searchQuery || membershipFilter !== 'all' || tierFilter !== 'all' || branchFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setMembershipFilter('all');
                      setTierFilter('all');
                      setBranchFilter('all');
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded-lg hover:bg-rose-500/10 transition"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* TABLA DE USUARIOS */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-bold">Usuario / Cliente</th>
                    <th className="py-3 px-4 font-bold text-center">Estado Club</th>
                    <th className="py-3 px-4 font-bold">Categoría / Nivel</th>
                    <th className="py-3 px-4 font-bold text-right">Puntos Disponibles</th>
                    <th className="py-3 px-4 font-bold text-right">Gasto / Pedidos</th>
                    <th className="py-3 px-4 font-bold">Sucursal</th>
                    <th className="py-3 px-4 font-bold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-slate-500">
                        <Users className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                        <p className="text-sm font-semibold text-slate-400">No se encontraron clientes con los filtros aplicados.</p>
                        <p className="text-xs text-slate-500 mt-1">Prueba cambiando la búsqueda o restableciendo los filtros de membresía.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((c) => {
                      const isMember = isClubMember(c);
                      const tier = c.loyalty?.tier || { id: 'bronce', name: 'Bronce', badgeColor: '#CD7F32', discountPercentage: 0 };
                      const currentPts = c.loyalty?.currentPoints || 0;
                      const monetaryVal = c.loyalty?.monetaryValue || (currentPts * (config?.currencyPerPointRedemption || 1));
                      const cleanPhone = (c.phone || '').replace(/\D/g, '');
                      const waLink = cleanPhone ? `https://wa.me/${cleanPhone.length <= 10 ? '549' + cleanPhone : cleanPhone}` : null;

                      // Iniciales del cliente
                      const initials = (c.name || 'C')
                        .split(' ')
                        .map(n => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors group">
                          {/* 1. Cliente / Usuario */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm border"
                                style={{
                                  backgroundColor: `${tier.badgeColor}20`,
                                  borderColor: `${tier.badgeColor}60`,
                                  color: tier.badgeColor
                                }}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white text-xs truncate flex items-center gap-1.5">
                                  {c.name || 'Cliente sin nombre'}
                                  {c.cuit && (
                                    <span className="text-[10px] text-slate-400 font-mono">({c.cuit})</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                  {c.phone ? (
                                    <span className="font-mono">{c.phone}</span>
                                  ) : (
                                    <span className="text-slate-600">Sin teléfono</span>
                                  )}
                                  {c.email && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate max-w-[140px] text-slate-400">{c.email}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Estado Club */}
                          <td className="py-3.5 px-4 text-center">
                            {isMember ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Crown className="w-3 h-3 text-amber-300" />
                                Socio Activo
                              </span>
                            ) : (
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 hover:border-amber-500 hover:text-amber-300 transition"
                                title="Click para afiliar y otorgar bono inicial"
                              >
                                <Plus className="w-3 h-3" />
                                Afiliar (+Bono)
                              </button>
                            )}
                          </td>

                          {/* 3. Categoría / Nivel */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col">
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold w-fit"
                                style={{
                                  backgroundColor: `${tier.badgeColor}20`,
                                  color: tier.badgeColor,
                                  border: `1px solid ${tier.badgeColor}40`
                                }}
                              >
                                <Award className="w-3 h-3" />
                                {tier.name}
                                {tier.discountPercentage > 0 && (
                                  <span className="text-[10px] bg-black/30 px-1 rounded font-normal">
                                    {tier.discountPercentage}% OFF
                                  </span>
                                )}
                              </span>

                              {c.loyalty?.nextTier && (
                                <span className="text-[10px] text-slate-500 mt-1">
                                  Faltan ${Number(c.loyalty.spendToNextTier || 0).toLocaleString('es-AR')} para {c.loyalty.nextTier.name}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Puntos Actuales & Equivalente */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-extrabold text-amber-400 text-sm">
                              {currentPts.toLocaleString('es-AR')} <span className="text-[10px] font-normal text-slate-400">pts</span>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                              ≈ ${monetaryVal.toLocaleString('es-AR')} en compras
                            </div>
                          </td>

                          {/* 5. Gasto & Pedidos */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-bold text-slate-200 text-xs">
                              ${Number(c.totalSpent || 0).toLocaleString('es-AR')}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {c.totalOrders || c.orders?.length || 0} pedidos
                            </div>
                          </td>

                          {/* 6. Sucursal Habitual */}
                          <td className="py-3.5 px-4">
                            <span className="text-slate-300 truncate max-w-[120px] block">
                              {c.preferredBranch || 'Casa Central'}
                            </span>
                            {c.customFields?.cookingPreference && (
                              <span className="text-[10px] text-amber-400/80 block">
                                {c.customFields.cookingPreference}
                              </span>
                            )}
                          </td>

                          {/* 7. Acciones */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Botón Editar Socio */}
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition"
                                title="Editar datos y saldo del socio"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Botón Otorgar Bono Rápido */}
                              <button
                                onClick={() => setAdjustModal({
                                  open: true,
                                  customerId: c.id,
                                  points: 100,
                                  type: 'BONUS',
                                  reason: 'Bono de fidelidad'
                                })}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/40 transition"
                                title="Acreditar puntos o bono"
                              >
                                <Gift className="w-3.5 h-3.5" />
                              </button>

                              {/* Botón Historial de Movimientos */}
                              <button
                                onClick={() => handleViewHistory(c)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-slate-700 hover:border-sky-500/40 transition"
                                title="Ver extracto / movimientos de puntos"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              {/* Botón WhatsApp */}
                              {waLink && (
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition"
                                  title="Enviar WhatsApp directo al cliente"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación y Resumen */}
            {filteredAndSortedCustomers.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                <div>
                  Mostrando <span className="font-bold text-white">{((currentPage - 1) * pageSize) + 1}</span> a{' '}
                  <span className="font-bold text-white">{Math.min(currentPage * pageSize, filteredAndSortedCustomers.length)}</span> de{' '}
                  <span className="font-bold text-white">{filteredAndSortedCustomers.length}</span> clientes ({clubCount} miembros activos)
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs"
                    >
                      Anterior
                    </button>
                    <span className="px-2 text-slate-300 font-semibold">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 1 (CONTINUACIÓN): MOVIMIENTOS RECIENTES LEDGER (En overview) */}
        {activeTab === 'overview' && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <History className="w-5 h-5 text-sky-400" />
              Ledger Global de Movimientos Recientes
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Descripción</th>
                    <th className="py-3 px-4 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(stats?.recentMovements || []).length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-slate-500">
                        Aún no hay transacciones en el programa de puntos.
                      </td>
                    </tr>
                  ) : (
                    stats?.recentMovements.map((mov) => (
                      <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-xs text-slate-400">
                          {new Date(mov.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            mov.type === 'EARN' ? 'bg-amber-500/20 text-amber-400' :
                            mov.type === 'REDEEM' ? 'bg-emerald-500/20 text-emerald-400' :
                            'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {mov.type === 'EARN' ? 'COMPRA' : mov.type === 'REDEEM' ? 'CANJE' : 'BONO'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{mov.description}</td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          mov.type === 'REDEEM' ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {mov.type === 'REDEEM' ? `-${mov.points}` : `+${mov.points}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TIERS & REGLAS */}
        {activeTab === 'tiers' && config && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Reglas Globales de Conversión</h2>
                  <p className="text-xs text-slate-400">Configura cuántos puntos equivale cada peso y su valor de canje.</p>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar Cambios
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Puntos ganados por cada $1 gastado
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.pointsPerCurrencyUnit}
                    onChange={(e) => setConfig({ ...config, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ej: 0.1 significa 1 punto cada $10 gastados.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor de canje ($ por cada punto)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.currencyPerPointRedemption}
                    onChange={(e) => setConfig({ ...config, currencyPerPointRedemption: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ej: 1 significa que 100 puntos = $100 de descuento.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Canje mínimo permitido (puntos)
                  </label>
                  <input
                    type="number"
                    value={config.minPointsToRedeem}
                    onChange={(e) => setConfig({ ...config, minPointsToRedeem: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Mínimo para habilitar descuento en caja.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Vigencia de los puntos (Días hasta expirar)
                  </label>
                  <input
                    type="number"
                    value={config.pointsExpiryDays || 180}
                    onChange={(e) => setConfig({ ...config, pointsExpiryDays: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Los puntos caducan automáticamente tras este período.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-400" />
                    Bono por registro inicial (/micuenta)
                  </label>
                  <input
                    type="number"
                    value={config.welcomeBonusPoints || 100}
                    onChange={(e) => setConfig({ ...config, welcomeBonusPoints: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Puntos que recibe el cliente al unirse al Club.</p>
                </div>
              </div>

              {/* Tiers detail editor */}
              <div className="pt-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">Niveles de Membresía</h3>
                <div className="space-y-3">
                  {config.tiers.map((t, idx) => (
                    <div key={t.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.badgeColor }} />
                        <div>
                          <strong className="text-white text-sm">{t.name}</strong>
                          <span className="text-xs text-slate-400 block">ID: {t.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Gasto Mínimo ($)</span>
                          <input
                            type="number"
                            value={t.minSpend}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].minSpend = parseFloat(e.target.value) || 0;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">Multiplicador</span>
                          <input
                            type="number"
                            step="0.05"
                            value={t.pointsMultiplier}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].pointsMultiplier = parseFloat(e.target.value) || 1;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">% Descuento</span>
                          <input
                            type="number"
                            value={t.discountPercentage}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].discountPercentage = parseFloat(e.target.value) || 0;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONFIGURADOR FORMULARIO /micuenta */}
        {activeTab === 'portal' && config && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-400" />
                  Personalización del Formulario de Ingreso (/micuenta)
                </h2>
                <p className="text-xs text-slate-400">
                  Activá o desactivá los campos que se le solicitarán al cliente la primera vez que ingrese al Club.
                </p>
              </div>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar Formulario
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                  Campos del Formulario para Nuevos Miembros
                </span>

                <div className="space-y-2.5">
                  {(config.registrationFormConfig?.fields || []).map((field, idx) => (
                    <div 
                      key={field.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={field.enabled !== false}
                          disabled={field.id === 'phone' || field.id === 'name'}
                          onChange={(e) => {
                            const updatedFields = [...config.registrationFormConfig.fields];
                            updatedFields[idx].enabled = e.target.checked;
                            setConfig({
                              ...config,
                              registrationFormConfig: {
                                ...config.registrationFormConfig,
                                fields: updatedFields
                              }
                            });
                          }}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                        />
                        <div>
                          <strong className="text-sm text-white">{field.label}</strong>
                          <span className="text-xs text-slate-500 block">
                            Tipo: <code className="text-amber-400">{field.type}</code> &middot; 
                            {field.required ? ' Obligatorio' : ' Opcional'}
                            {field.optionsSource === 'branches' && ' (Toma las sucursales activas del sistema)'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-400 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            disabled={field.id === 'phone' || field.id === 'name'}
                            onChange={(e) => {
                              const updatedFields = [...config.registrationFormConfig.fields];
                              updatedFields[idx].required = e.target.checked;
                              setConfig({
                                ...config,
                                registrationFormConfig: {
                                  ...config.registrationFormConfig,
                                  fields: updatedFields
                                }
                              });
                            }}
                            className="w-3.5 h-3.5 rounded text-amber-500"
                          />
                          Obligatorio
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between flex-wrap gap-3">
                <div>
                  <strong>Link público para tus clientes:</strong>
                  <p className="text-slate-300 mt-0.5">Podés compartir <code className="text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded">/micuenta</code> en tus mensajes de WhatsApp y redes sociales.</p>
                </div>
                <a
                  href="/micuenta"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Abrir /micuenta ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CAMPAÑAS WHATSAPP */}
        {activeTab === 'broadcast' && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                Difusión WhatsApp Segmentada por Nivel
              </h2>
              <p className="text-xs text-slate-400">
                Envía promociones exclusivas a clientes Plata, Oro o Platino con personalización automática de nombre.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Seleccionar Audiencia / Nivel Objetivo
                </label>
                <select
                  value={selectedTierForBroadcast}
                  onChange={(e) => setSelectedTierForBroadcast(e.target.value)}
                  className="w-full md:w-80 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">🌟 Todos los Miembros del Club ({clubCount})</option>
                  {(config?.tiers || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      🎖️ Nivel {t.name} (Descuento {t.discountPercentage}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mensaje de la Campaña (Usa <code className="text-amber-400">{'{nombre}'}</code> para personalizar)
                </label>
                <textarea
                  rows="5"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-sm focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              {broadcastResult && (
                <div className={`p-4 rounded-xl border text-sm ${
                  broadcastResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  {broadcastResult.message || broadcastResult.error}
                </div>
              )}

              <button
                onClick={handleSendBroadcast}
                disabled={isSendingBroadcast}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {isSendingBroadcast ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Campaña por WhatsApp...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Lanzar Campaña por WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: EDITAR SOCIO / USUARIO */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border shadow-sm"
                  style={{
                    backgroundColor: `${editingCustomer.loyalty?.tier?.badgeColor || '#CD7F32'}20`,
                    borderColor: `${editingCustomer.loyalty?.tier?.badgeColor || '#CD7F32'}60`,
                    color: editingCustomer.loyalty?.tier?.badgeColor || '#CD7F32'
                  }}
                >
                  {(editingCustomer.name || 'C').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Editar Datos del Socio / Cliente
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>ID: <code className="text-amber-400">{editingCustomer.id}</code></span>
                    <span>•</span>
                    <span className="text-amber-300 font-bold">
                      {editingCustomer.loyalty?.currentPoints || 0} pts acumulados
                    </span>
                    <span>•</span>
                    <span style={{ color: editingCustomer.loyalty?.tier?.badgeColor || '#CD7F32' }}>
                      Nivel {editingCustomer.loyalty?.tier?.name || 'Bronce'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingCustomer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nombre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Teléfono / WhatsApp *</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none font-mono"
                    placeholder="Ej. +54 9 351 123-4567"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                    placeholder="cliente@gmail.com"
                  />
                </div>

                {/* CUIT / DNI */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">CUIT / DNI</label>
                  <input
                    type="text"
                    value={editFormData.cuit}
                    onChange={(e) => setEditFormData({ ...editFormData, cuit: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none font-mono"
                    placeholder="20-12345678-9"
                  />
                </div>

                {/* Sucursal de Preferencia */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sucursal de Preferencia</label>
                  <select
                    value={editFormData.preferredBranch}
                    onChange={(e) => setEditFormData({ ...editFormData, preferredBranch: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Seleccionar sucursal...</option>
                    {branches.length > 0 ? (
                      branches.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="URCA CENTRAL">URCA CENTRAL</option>
                        <option value="URCA 2 – ALTO TEJEDA">URCA 2 – ALTO TEJEDA</option>
                        <option value="INTERCOUNTRY – CORTEZA MALL">INTERCOUNTRY – CORTEZA MALL</option>
                        <option value="DUARTE QUIRÓS">DUARTE QUIRÓS</option>
                        <option value="VILLA ALLENDE">VILLA ALLENDE</option>
                        <option value="COUNTRY SAN ISIDRO">COUNTRY SAN ISIDRO</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Fecha de Cumpleaños */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha de Cumpleaños</label>
                  <input
                    type="date"
                    value={editFormData.birthDate}
                    onChange={(e) => setEditFormData({ ...editFormData, birthDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dirección de Entrega */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección de Entrega</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                  placeholder="Calle, Número, Barrio, Córdoba"
                />
              </div>

              {/* Preferencia de Cocción */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Preferencia de Cocción</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Parrilla', 'Horno', 'Olla / Guiso', 'Minutas / Rápido'].map(pref => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, cookingPreference: pref })}
                      className={`py-1.5 px-2 rounded-xl text-xs font-semibold border text-center transition ${
                        editFormData.cookingPreference === pref
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas Administrativas */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notas Administrativas / CRM</label>
                <textarea
                  rows="2"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 focus:outline-none"
                  placeholder="Observaciones de compra, cortes preferidos, detalles de facturación..."
                />
              </div>

              {/* Sección Especial: Ajuste Rápido de Puntos en la misma ventana */}
              <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Ajustar Saldo de Puntos en esta Operación</span>
                  </div>
                  <span className="text-xs text-amber-300 font-bold font-mono">
                    Saldo actual: {editingCustomer.loyalty?.currentPoints || 0} pts
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Puntos a sumar (+) o restar (-)</label>
                    <input
                      type="number"
                      placeholder="Ej: 100 o -50"
                      value={editFormData.pointsToAdd || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, pointsToAdd: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Motivo del ajuste</label>
                    <input
                      type="text"
                      placeholder="Ej: Bono de bienvenida, Compensación..."
                      value={editFormData.pointsReason}
                      onChange={(e) => setEditFormData({ ...editFormData, pointsReason: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Chips rápidos de bono */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-slate-500">Atajos:</span>
                  {[50, 100, 200, 500].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEditFormData({
                        ...editFormData,
                        pointsToAdd: val,
                        pointsReason: `Bono promocional de +${val} pts`
                      })}
                      className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition"
                    >
                      +{val} pts
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, pointsToAdd: 0, pointsReason: '' })}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
                  >
                    Sin ajuste
                  </button>
                </div>
              </div>

              {/* Feedback de guardado */}
              {editFeedback && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  editFeedback.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {editFeedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{editFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCustomer}
                disabled={isSavingCustomer || !editFormData.name.trim()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSavingCustomer ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: HISTORIAL / EXTRACTO DE PUNTOS INDIVIDUAL */}
      {historyModal.open && historyModal.customer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-400" />
                  Movimientos de Puntos: {historyModal.customer.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Saldo actual: <strong className="text-amber-400">{historyModal.customer.loyalty?.currentPoints || 0} pts</strong> (${(historyModal.customer.loyalty?.monetaryValue || 0).toLocaleString('es-AR')})
                </p>
              </div>
              <button
                onClick={() => setHistoryModal({ open: false, customer: null, movements: [], loading: false })}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {historyModal.loading ? (
                <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Cargando movimientos...</span>
                </div>
              ) : historyModal.movements.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Este socio aún no registra movimientos de puntos en el ledger.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyModal.movements.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'EARN' ? 'bg-amber-500/20 text-amber-400' :
                            m.type === 'REDEEM' ? 'bg-emerald-500/20 text-emerald-400' :
                            m.type === 'EXPIRE' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {m.type === 'EARN' ? 'COMPRA' : m.type === 'REDEEM' ? 'CANJE' : m.type === 'EXPIRE' ? 'VENCIMIENTO' : 'BONO'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(m.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-slate-200">{m.description}</p>
                      </div>

                      <div className={`font-black text-sm shrink-0 ${
                        m.type === 'REDEEM' || m.type === 'EXPIRE' || m.type === 'ADJUST_DOWN'
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}>
                        {m.type === 'REDEEM' || m.type === 'EXPIRE' || m.type === 'ADJUST_DOWN' ? `-${m.points}` : `+${m.points}`} pts
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setHistoryModal({ open: false, customer: null, movements: [], loading: false })}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: AJUSTE / BONO MANUAL RÁPIDO */}
      {adjustModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              Otorgar Puntos o Bono
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Socio / Cliente</label>
              <select
                value={adjustModal.customerId}
                onChange={(e) => setAdjustModal({ ...adjustModal, customerId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Sin nombre'} ({c.phone || c.id}) — Saldo: {c.loyalty?.currentPoints || 0} pts
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Cantidad de Puntos</label>
              <input
                type="number"
                value={adjustModal.points}
                onChange={(e) => setAdjustModal({ ...adjustModal, points: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo / Descripción</label>
              <input
                type="text"
                placeholder="Ej. Cumpleaños, Compensación, Bono bienvenida"
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>

            {adjustSuccess && (
              <p className="text-xs text-emerald-400 font-semibold">{adjustSuccess}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setAdjustModal({ ...adjustModal, open: false })}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteAdjust}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
              >
                Confirmar Asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
