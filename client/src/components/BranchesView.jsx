import React, { useState, useEffect } from 'react';
import { 
  Store, 
  MapPin, 
  Phone, 
  User, 
  Clock, 
  Mail, 
  Plus, 
  Search, 
  Edit3, 
  Copy, 
  Trash2, 
  CheckCircle2, 
  RefreshCw, 
  Send, 
  ShoppingBag, 
  ArrowRight,
  TrendingUp,
  Truck,
  Package,
  X,
  Save,
  MessageSquare,
  List,
  LayoutGrid
} from 'lucide-react';
import UserPicker from './ui/UserPicker.jsx';

export default function BranchesView({ socket }) {
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('branches_view_mode') || 'table');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(null);

  // Modal State
  const [branchModal, setBranchModal] = useState(null); // null | { mode: 'create' | 'edit', data: { ... } }
  const [zonesInputText, setZonesInputText] = useState('');
  const [testSendingId, setTestSendingId] = useState(null);
  const [testSuccessMessage, setTestSuccessMessage] = useState(null);

  const fetchBranches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();

    if (socket) {
      socket.on('branch:new', (newBranch) => {
        setBranches(prev => [newBranch, ...prev.filter(b => b.id !== newBranch.id)]);
      });

      socket.on('branch:update', (updated) => {
        setBranches(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
      });

      socket.on('branch:delete', ({ id }) => {
        setBranches(prev => prev.filter(b => b.id !== id));
      });

      socket.on('order:update', () => {
        fetchBranches();
      });

      return () => {
        socket.off('branch:new');
        socket.off('branch:update');
        socket.off('branch:delete');
        socket.off('order:update');
      };
    }
  }, [socket]);

  const handleOpenCreateBranch = () => {
    setBranchModal({
      mode: 'create',
      data: {
        name: '',
        address: '',
        phone: '',
        managerName: '',
        encargadoId: null,
        email: '',
        hours: 'Lun a Sáb 8:30 a 20:30 | Dom 9:00 a 14:00',
        coverageZones: ['Centro', 'General Paz'],
        isActive: true,
        notes: ''
      }
    });
    setZonesInputText('Centro, General Paz');
  };

  const handleOpenEditBranch = (branch) => {
    setBranchModal({
      mode: 'edit',
      data: { ...branch }
    });
    setZonesInputText(Array.isArray(branch.coverageZones) ? branch.coverageZones.join(', ') : (branch.coverageZones || ''));
  };

  const handleDuplicateBranch = async (branchId) => {
    try {
      const res = await fetch(`/api/branches/${branchId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const cloned = await res.json();
        setBranches(prev => [cloned, ...prev]);
      }
    } catch (err) {
      console.error('Error duplicando sucursal:', err);
    }
  };

  const handleDeleteBranch = async (branchId, name) => {
    if (!window.confirm(`¿Eliminar la sucursal "${name}"?`)) return;
    try {
      const res = await fetch(`/api/branches/${branchId}`, { method: 'DELETE' });
      if (res.ok) {
        setBranches(prev => prev.filter(b => b.id !== branchId));
        if (selectedBranch?.id === branchId) setSelectedBranch(null);
      }
    } catch (err) {
      console.error('Error eliminando sucursal:', err);
    }
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    if (!branchModal) return;

    const coverageZones = zonesInputText
      .split(',')
      .map(z => z.trim())
      .filter(Boolean);

    const payload = {
      ...branchModal.data,
      coverageZones
    };

    try {
      if (branchModal.mode === 'create') {
        const res = await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const created = await res.json();
          setBranches(prev => [created, ...prev]);
          setBranchModal(null);
        }
      } else {
        const res = await fetch(`/api/branches/${branchModal.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const updated = await res.json();
          setBranches(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
          setBranchModal(null);
        }
      }
    } catch (err) {
      console.error('Error guardando sucursal:', err);
    }
  };

  const handleTestWhatsApp = async (branchId, branchName) => {
    setTestSendingId(branchId);
    setTestSuccessMessage(null);
    try {
      const res = await fetch(`/api/branches/${branchId}/test-whatsapp`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTestSuccessMessage(`¡Mensaje de prueba enviado exitosamente a ${branchName}!`);
        setTimeout(() => setTestSuccessMessage(null), 3500);
      } else {
        alert(data.error || 'Error enviando mensaje de prueba a la sucursal');
      }
    } catch (err) {
      console.error('Error en test WhatsApp:', err);
    } finally {
      setTestSendingId(null);
    }
  };

  // Metrics
  const totalBranches = branches.length;
  const activeBranches = branches.filter(b => b.isActive).length;
  const totalDerivedOrders = branches.reduce((acc, b) => acc + (b.metrics?.totalOrders || 0), 0);
  const totalBranchSales = branches.reduce((acc, b) => acc + (b.metrics?.totalSales || 0), 0);

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.address || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.managerName || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.phone || '').includes(search) ||
    (Array.isArray(b.coverageZones) && b.coverageZones.some(z => z.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6">
      
      {/* Header & Stats */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Store className="text-emerald-400" />
              Gestión de Sucursales & Derivación de Pedidos
            </h1>
            <p className="text-xs text-slate-400">
              Administra las sedes físicas, cobertura y coordina pedidos automáticamente por WhatsApp con los encargados
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreateBranch}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md transition"
            >
              <Plus size={14} />
              Nueva Sucursal
            </button>

            <button
              onClick={fetchBranches}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs transition"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Sucursales</span>
              <Store size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl font-extrabold text-white">{totalBranches}</div>
            <div className="text-[10px] text-emerald-400 font-semibold">{activeBranches} activas operando</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Pedidos Derivados</span>
              <ShoppingBag size={15} className="text-sky-400" />
            </div>
            <div className="text-xl font-extrabold text-sky-400">{totalDerivedOrders}</div>
            <div className="text-[10px] text-slate-400">Asignados a sucursales</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Ventas en Sucursales</span>
              <TrendingUp size={15} className="text-purple-400" />
            </div>
            <div className="text-xl font-extrabold text-purple-400">${totalBranchSales.toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-400">Facturación acumulada</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Interacción WhatsApp</span>
              <MessageSquare size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl font-extrabold text-white">Activa 24/7</div>
            <div className="text-[10px] text-emerald-400 font-semibold">Confirmación por chat</div>
          </div>
        </div>

        {testSuccessMessage && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-semibold animate-in fade-in">
            <CheckCircle2 size={16} /> {testSuccessMessage}
          </div>
        )}

        {/* Search & View Mode Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre de sucursal, dirección, encargado, teléfono o barrio de cobertura..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#182229] border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* Toggle View Mode */}
          <div className="flex items-center bg-[#182229] border border-slate-700/60 rounded-2xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                localStorage.setItem('branches_view_mode', 'table');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
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
                localStorage.setItem('branches_view_mode', 'grid');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
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

      {/* Main Content: Branches Cards or List */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-emerald-500" />
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 bg-[#182229] border border-slate-800 rounded-3xl text-center space-y-3">
          <Store size={40} className="text-slate-600" />
          <div className="text-sm font-bold text-slate-300">No se encontraron sucursales</div>
          <p className="text-xs text-slate-500 max-w-sm">
            {search ? 'Intenta con otro término de búsqueda.' : 'Crea tu primera sucursal para coordinar y derivar pedidos por WhatsApp.'}
          </p>
          {!search && (
            <button
              onClick={handleOpenCreateBranch}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
            >
              + Agregar Sucursal
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* VISTA EN FORMATO LISTA / TABLA DETALLADA */
        <div className="bg-[#182229] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#111b21] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Sucursal</th>
                  <th className="py-3 px-4">Dirección</th>
                  <th className="py-3 px-4">WhatsApp Encargado</th>
                  <th className="py-3 px-4">Encargado</th>
                  <th className="py-3 px-4">Zonas de Cobertura</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBranches.map(branch => (
                  <tr key={branch.id} className="hover:bg-[#202c33]/50 transition-colors">
                    <td className="py-3.5 px-4 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <Store size={15} />
                        </div>
                        <div>
                          <div className="font-bold text-white">{branch.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {branch.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate text-slate-300">
                      {branch.address || 'Sin dirección'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {branch.phone || 'Sin teléfono'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-semibold whitespace-nowrap">
                      {branch.managerName || 'No asignado'}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate">
                      {Array.isArray(branch.coverageZones) && branch.coverageZones.length > 0 ? (
                        branch.coverageZones.join(', ')
                      ) : (
                        <span className="text-slate-500">Todas</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold border ${
                        branch.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {branch.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleTestWhatsApp(branch.id, branch.name)}
                          disabled={testSendingId === branch.id || !branch.phone}
                          className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold transition disabled:opacity-50"
                          title="Enviar ping de prueba"
                        >
                          💬 Test
                        </button>
                        <button
                          onClick={() => handleOpenEditBranch(branch)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                          title="Editar sucursal"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDuplicateBranch(branch.id)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                          title="Duplicar sucursal"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteBranch(branch.id, branch.name)}
                          className="p-1.5 rounded-lg bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                          title="Eliminar sucursal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA EN FORMATO CUADRÍCULA / TARJETAS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBranches.map(branch => (
            <div
              key={branch.id}
              className="bg-[#182229] hover:bg-[#1a252c] border border-slate-800 hover:border-slate-700/80 rounded-3xl p-5 flex flex-col justify-between space-y-4 shadow-lg transition"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      <Store size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{branch.name}</h3>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {branch.id}</span>
                    </div>
                  </div>

                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold border ${
                    branch.isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {branch.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="text-slate-300 leading-tight">{branch.address || 'Sin dirección asignada'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-emerald-400 shrink-0" />
                    <span className="font-mono text-emerald-300 font-semibold">{branch.phone || 'Sin WhatsApp'}</span>
                  </div>

                  {branch.managerName && (
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-sky-400 shrink-0" />
                      <span>Encargado: <b>{branch.managerName}</b></span>
                    </div>
                  )}

                  {branch.hours && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock size={13} className="text-amber-400 shrink-0" />
                      <span className="truncate">{branch.hours}</span>
                    </div>
                  )}
                </div>

                {/* Coverage Zones */}
                {Array.isArray(branch.coverageZones) && branch.coverageZones.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Zonas de Cobertura:</div>
                    <div className="flex flex-wrap gap-1">
                      {branch.coverageZones.map((zone, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-[#111b21] text-slate-300 border border-slate-700/60 text-[11px]"
                        >
                          {zone}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Branch Metrics Badges */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                  <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800">
                    <div className="text-[10px] text-slate-400">Pedidos</div>
                    <div className="text-xs font-bold text-white">{branch.metrics?.totalOrders || 0}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800">
                    <div className="text-[10px] text-slate-400">Ventas</div>
                    <div className="text-xs font-bold text-emerald-400">${(branch.metrics?.totalSales || 0).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[#111b21] border border-slate-800">
                    <div className="text-[10px] text-slate-400">WhatsApp</div>
                    <div className="text-xs font-bold text-emerald-400">Online</div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestWhatsApp(branch.id, branch.name)}
                  disabled={testSendingId === branch.id || !branch.phone}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition disabled:opacity-50"
                  title="Enviar ping de prueba por WhatsApp al encargado"
                >
                  <Send size={12} className={testSendingId === branch.id ? 'animate-spin' : ''} />
                  {testSendingId === branch.id ? 'Probando...' : '💬 Test WhatsApp'}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditBranch(branch)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                    title="Editar sucursal"
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    onClick={() => handleDuplicateBranch(branch.id)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                    title="Duplicar sucursal"
                  >
                    <Copy size={14} />
                  </button>

                  <button
                    onClick={() => handleDeleteBranch(branch.id, branch.name)}
                    className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                    title="Eliminar sucursal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Sucursal */}
      {branchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Store size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {branchModal.mode === 'create' ? 'Nueva Sucursal' : 'Editar Sucursal'}
                  </h3>
                  <p className="text-xs text-slate-400">Configura la sede y su canal de WhatsApp para derivación</p>
                </div>
              </div>
              <button
                onClick={() => setBranchModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre de la Sucursal:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sucursal Cerro de las Rosas"
                  value={branchModal.data.name}
                  onChange={(e) => setBranchModal({
                    ...branchModal,
                    data: { ...branchModal.data, name: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Dirección Física:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Av. Rafael Núñez 4250, Córdoba"
                  value={branchModal.data.address}
                  onChange={(e) => setBranchModal({
                    ...branchModal,
                    data: { ...branchModal.data, address: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">WhatsApp del Encargado/Sucursal:</label>
                  <input
                    type="text"
                    required
                    placeholder="+54 9 351 626-2475"
                    value={branchModal.data.phone}
                    onChange={(e) => setBranchModal({
                      ...branchModal,
                      data: { ...branchModal.data, phone: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Encargado de Sucursal:</label>
                  <UserPicker
                    role="encargado"
                    value={branchModal.data.encargadoId || ''}
                    onChange={(userId, user) => setBranchModal({
                      ...branchModal,
                      data: {
                        ...branchModal.data,
                        encargadoId: userId || null,
                        managerName: user?.name || branchModal.data.managerName
                      }
                    })}
                    placeholder="Seleccionar encargado del sistema..."
                  />
                  <input
                    type="text"
                    placeholder="O escribir nombre manualmente: Ej: Roberto Gomez"
                    value={branchModal.data.managerName}
                    onChange={(e) => setBranchModal({
                      ...branchModal,
                      data: { ...branchModal.data, managerName: e.target.value }
                    })}
                    className="w-full mt-1.5 px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Horarios de Atención:</label>
                  <input
                    type="text"
                    placeholder="Lun a Sáb 8:00 a 20:30 | Dom 9:00 a 14:00"
                    value={branchModal.data.hours}
                    onChange={(e) => setBranchModal({
                      ...branchModal,
                      data: { ...branchModal.data, hours: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email:</label>
                  <input
                    type="email"
                    placeholder="sucursal@republicadelacarne.com"
                    value={branchModal.data.email}
                    onChange={(e) => setBranchModal({
                      ...branchModal,
                      data: { ...branchModal.data, email: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Zonas de Cobertura (Separadas por coma):</label>
                <input
                  type="text"
                  placeholder="Cerro de las Rosas, Urca, Villa Belgrano, Argüello"
                  value={zonesInputText}
                  onChange={(e) => setZonesInputText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Sucursal Activa para Derivaciones</div>
                  <div className="text-[11px] text-slate-400">Si está activa, podrá recibir y confirmar pedidos por WhatsApp</div>
                </div>
                <input
                  type="checkbox"
                  checked={branchModal.data.isActive !== false}
                  onChange={(e) => setBranchModal({
                    ...branchModal,
                    data: { ...branchModal.data, isActive: e.target.checked }
                  })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBranchModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition"
                >
                  <Save size={14} />
                  Guardar Sucursal
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
