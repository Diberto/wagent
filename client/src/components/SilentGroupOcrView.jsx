import React, { useState, useEffect } from 'react';
import {
  FileText,
  Camera,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  ArrowRight,
  AlertTriangle,
  Layers,
  Sparkles,
  Store,
  Building2,
  Plus,
  Trash2,
  Upload,
  Eye,
  Check,
  X,
  Send,
  Volume2,
  Share2,
  PackageCheck
} from 'lucide-react';

export default function SilentGroupOcrView({ socket, user }) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'matrix' | 'scan' | 'groups'
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [silentGroups, setSilentGroups] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterDirection, setFilterDirection] = useState('all'); // 'all' | 'branch_to_admin' | 'admin_to_branch'
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Preview modal para imagen/manuscrito
  const [previewMedia, setPreviewMedia] = useState(null);

  // Formulario de escaneo manual
  const [manualText, setManualText] = useState('');
  const [manualDirection, setManualDirection] = useState('branch_to_admin');
  const [manualBranchId, setManualBranchId] = useState('');
  const [manualImageBase64, setManualImageBase64] = useState(null);
  const [manualMimeType, setManualMimeType] = useState('image/jpeg');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Modal para agregar/vincular grupo de WhatsApp silencioso
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    groupId: '',
    groupName: '',
    branchId: 'br-1',
    mode: 'all', // 'all' | 'internal_orders' | 'invoices'
    defaultDirection: 'auto',
    autoApproveInternalOrders: false,
    active: true
  });

  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOrdersAndSummary = async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams();
      if (filterDirection !== 'all') q.set('direction', filterDirection);
      if (filterStatus !== 'all') q.set('status', filterStatus);
      if (filterBranch !== 'all') q.set('branchId', filterBranch);
      if (searchQuery.trim()) q.set('search', searchQuery.trim());

      const res = await fetch(`/api/internal-ocr/orders?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
        setSummary(data.summary || null);
        if (data.silentGroups) setSilentGroups(data.silentGroups);
        if (data.branches) setBranches(data.branches);
      }
    } catch (err) {
      console.error('Error cargando pedidos OCR:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersAndSummary();
  }, [filterDirection, filterStatus, filterBranch]);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (newOrd) => {
      setOrders(prev => [newOrd, ...prev.filter(o => o.id !== newOrd.id)]);
      showToast('info', `📦 Nuevo pedido interno detectado: ${newOrd.summary}`);
    };
    const handleUpdate = (upd) => {
      setOrders(prev => prev.map(o => o.id === upd.id ? upd : o));
    };
    const handleSync = (all) => {
      if (Array.isArray(all)) setOrders(all);
    };

    socket.on('internal-ocr:new', handleNew);
    socket.on('internal-ocr:updated', handleUpdate);
    socket.on('internal-ocr:sync', handleSync);

    return () => {
      socket.off('internal-ocr:new', handleNew);
      socket.off('internal-ocr:updated', handleUpdate);
      socket.off('internal-ocr:sync', handleSync);
    };
  }, [socket]);

  const handleUpdateStatus = async (orderId, nextStatus) => {
    try {
      const res = await fetch(`/api/internal-ocr/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success && data.order) {
        setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        showToast('success', `Estado actualizado a "${nextStatus}"`);
      }
    } catch (err) {
      console.error('Error actualizando estado:', err);
      showToast('error', 'Error actualizando estado');
    }
  };

  const handleConvertToTransfer = async (orderId) => {
    try {
      const res = await fetch(`/api/internal-ocr/orders/${encodeURIComponent(orderId)}/convert-to-transfer`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        if (data.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        }
        showToast('success', `✅ Traspaso oficial generado exitosamente (${data.transfer?.id || 'OK'}). Pedido despachado.`);
      } else {
        showToast('error', data.error || 'Error al generar traspaso');
      }
    } catch (err) {
      console.error('Error generando traspaso:', err);
      showToast('error', 'Error de red al generar traspaso');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`¿Eliminar este registro de pedido interno #${orderId}?`)) return;
    try {
      const res = await fetch(`/api/internal-ocr/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        showToast('info', 'Pedido eliminado');
      }
    } catch (err) {
      console.error('Error eliminando pedido:', err);
    }
  };

  const handleRunManualScan = async (e) => {
    e.preventDefault();
    if (!manualText && !manualImageBase64) {
      showToast('error', 'Ingresá texto manuscrito o cargá una foto/documento.');
      return;
    }
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/internal-ocr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: manualText,
          imageBase64: manualImageBase64,
          mimeType: manualMimeType,
          direction: manualDirection,
          branchId: manualBranchId || undefined,
          saveOrder: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setScanResult(data);
        if (data.order) {
          setOrders(prev => [data.order, ...prev.filter(o => o.id !== data.order.id)]);
        }
        showToast('success', `✅ ${data.order?.summary || 'Pedido detectado con éxito'}`);
      } else {
        showToast('error', data.message || 'No se reconoció un pedido válido');
      }
    } catch (err) {
      console.error('Error escaneando:', err);
      showToast('error', 'Error de red ejecutando escaneo OCR');
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setManualMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      setManualImageBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSilentGroup = async (e) => {
    e.preventDefault();
    if (!newGroupForm.groupId) return;
    try {
      const res = await fetch('/api/inventory/silent-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroupForm)
      });
      const data = await res.json();
      if (data.success && data.groups) {
        setSilentGroups(data.groups);
        setNewGroupModal(false);
        setNewGroupForm({
          groupId: '',
          groupName: '',
          branchId: 'br-1',
          mode: 'all',
          defaultDirection: 'auto',
          autoApproveInternalOrders: false,
          active: true
        });
        showToast('success', 'Grupo silencioso configurado correctamente');
      }
    } catch (err) {
      console.error('Error guardando grupo silencioso:', err);
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('¿Desvincular este grupo silencioso?')) return;
    try {
      const res = await fetch(`/api/inventory/silent-groups/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success && data.groups) {
        setSilentGroups(data.groups);
        showToast('info', 'Grupo desvinculado');
      }
    } catch (err) {
      console.error('Error desvinculando grupo:', err);
    }
  };

  const totals = summary?.totals || {
    totalOrders: orders.length,
    branchToAdminCount: orders.filter(o => o.direction === 'branch_to_admin').length,
    adminToBranchCount: orders.filter(o => o.direction === 'admin_to_branch').length,
    pendingCount: orders.filter(o => ['detected', 'approved', 'preparing'].includes(o.status)).length,
    dispatchedCount: orders.filter(o => ['dispatched', 'received'].includes(o.status)).length,
    urgentCount: orders.filter(o => o.priority === 'urgent').length,
    totalKgRequested: orders.reduce((acc, o) => acc + (Number(o.totalEstimatedKg) || 0), 0)
  };

  return (
    <div className="flex flex-col h-full bg-[#0b141a] text-slate-100 overflow-hidden font-sans">
      
      {/* Toast Notifier */}
      {toast && (
        <div className="fixed top-4 right-4 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#182229]/95 backdrop-blur-md border border-emerald-500/50 shadow-2xl text-xs font-bold text-emerald-300 animate-in slide-in-from-top-2">
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Top Header & Navigation Pills */}
      <div className="p-3 sm:p-4 bg-[#111b21] border-b border-slate-800 shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg">
              <Camera size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Grupo Silencioso OCR
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider">
                  Sucursales ↔ Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Detección pasiva multimodal de planillas, fotos manuscritas, audios y pedidos internos en grupos de WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={fetchOrdersAndSummary}
              disabled={isLoading}
              className="p-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
              title="Refrescar"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              onClick={() => setNewGroupModal(true)}
              className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-lg transition flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Vincular Grupo</span>
            </button>
          </div>
        </div>

        {/* View Mode Tabs & Fast Counters */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar border-t border-slate-800/80 pt-2.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-[#182229] hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <FileText size={13} />
              <span>Pedidos Detectados</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                {orders.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-[#182229] hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Layers size={13} />
              <span>Detalle Consolidado de Cortes</span>
            </button>

            <button
              onClick={() => setActiveTab('scan')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'scan'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-[#182229] hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Sparkles size={13} />
              <span>Prueba OCR Manual</span>
            </button>

            <button
              onClick={() => setActiveTab('groups')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'groups'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-[#182229] hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Store size={13} />
              <span>Grupos Silenciosos ({silentGroups.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row (Mobile-First scrollable row / grid) */}
      <div className="p-3 sm:p-4 pb-0 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80 shadow flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sucursal → Admin</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">{totals.branchToAdminCount}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <Store size={16} />
          </div>
        </div>

        <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80 shadow flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Admin → Sucursal</div>
            <div className="text-lg font-black text-sky-400 mt-0.5">{totals.adminToBranchCount}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
            <Building2 size={16} />
          </div>
        </div>

        <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80 shadow flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pendientes</div>
            <div className="text-lg font-black text-amber-400 mt-0.5">{totals.pendingCount}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Clock size={16} />
          </div>
        </div>

        <div className="bg-[#111b21] p-3 rounded-2xl border border-slate-800/80 shadow flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kilos Totales</div>
            <div className="text-lg font-black text-purple-400 mt-0.5 font-mono">{totals.totalKgRequested} kg</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <PackageCheck size={16} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        
        {/* TAB 1: LISTADO DE PEDIDOS INTERNOS */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#111b21] p-2.5 rounded-2xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar corte, sucursal, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchOrdersAndSummary()}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <select
                  value={filterDirection}
                  onChange={(e) => setFilterDirection(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#182229] border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Todas las Direcciones</option>
                  <option value="branch_to_admin">Sucursal → Admin</option>
                  <option value="admin_to_branch">Admin → Sucursal</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#182229] border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="detected">Detectado</option>
                  <option value="approved">Aprobado</option>
                  <option value="preparing">En Preparación</option>
                  <option value="dispatched">Despachado</option>
                  <option value="received">Recibido</option>
                </select>
              </div>
            </div>

            {/* Orders Feed */}
            {orders.length === 0 ? (
              <div className="p-8 text-center bg-[#111b21] rounded-3xl border border-slate-800/80 space-y-2">
                <Camera size={32} className="mx-auto text-slate-500" />
                <div className="text-sm font-bold text-slate-300">No se encontraron pedidos internos con los filtros actuales</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Los pedidos enviados como fotos de papel manuscrito, planillas, audios o mensajes en los grupos de WhatsApp configurados aparecerán aquí automáticamente en tiempo real.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {orders.map((ord) => {
                  const isBranchToAdmin = ord.direction === 'branch_to_admin';
                  const isUrgent = ord.priority === 'urgent';
                  return (
                    <div
                      key={ord.id}
                      className={`p-3.5 sm:p-4 rounded-3xl border transition shadow-lg space-y-3 bg-[#111b21] ${
                        isUrgent
                          ? 'border-red-500/50 hover:border-red-500'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Header Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-white">{ord.id}</span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                isBranchToAdmin
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              }`}
                            >
                              {isBranchToAdmin ? 'Sucursal → Admin' : 'Admin → Sucursal'}
                            </span>
                            {isUrgent && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                🔴 URGENTE
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5 pt-0.5">
                            <span className="text-emerald-400">{ord.sourceBranchName}</span>
                            <ArrowRight size={11} className="text-slate-500" />
                            <span className="text-sky-300">{ord.targetUnitName}</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right shrink-0 space-y-0.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                              ord.status === 'received'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : ord.status === 'dispatched'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                : ord.status === 'preparing'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : ord.status === 'approved'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {ord.status === 'received'
                              ? 'Entregado / Recibido'
                              : ord.status === 'dispatched'
                              ? 'En Reparto / Traspaso'
                              : ord.status === 'preparing'
                              ? 'En Preparación'
                              : ord.status === 'approved'
                              ? 'Aprobado'
                              : 'Detectado'}
                          </span>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Items Matrix */}
                      <div className="bg-[#182229] p-2.5 rounded-2xl border border-slate-800 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Cortes Solicitados ({ord.items?.length || 0})</span>
                          {ord.totalEstimatedKg > 0 && (
                            <span className="text-purple-300 font-mono font-bold">~{ord.totalEstimatedKg} kg</span>
                          )}
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {(ord.items || []).map((it, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-semibold text-slate-200">{it.name}</span>
                                {it.plu && (
                                  <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                    PLU {it.plu}
                                  </span>
                                )}
                                {it.notes && (
                                  <span className="block text-[10px] text-slate-400 italic">{it.notes}</span>
                                )}
                              </div>
                              <span className="font-mono font-bold text-emerald-400 shrink-0">
                                {it.quantity} {it.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Raw Text & Media Preview */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
                        <span className="truncate">
                          Por: <strong className="text-slate-200">{ord.senderName || 'Operador'}</strong>
                        </span>
                        {ord.mediaUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewMedia(ord.mediaUrl)}
                            className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                          >
                            <Eye size={12} />
                            <span>Ver Foto Original</span>
                          </button>
                        )}
                      </div>

                      {/* Workflow Actions */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {ord.status === 'detected' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(ord.id, 'approved')}
                              className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold border border-amber-500/30 transition flex items-center gap-1"
                            >
                              <Check size={12} /> Aprobar
                            </button>
                          )}
                          {['detected', 'approved'].includes(ord.status) && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(ord.id, 'preparing')}
                              className="px-2.5 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[11px] font-bold border border-purple-500/30 transition flex items-center gap-1"
                            >
                              <Layers size={12} /> Preparar
                            </button>
                          )}
                          {!ord.linkedTransferId && (
                            <button
                              type="button"
                              onClick={() => handleConvertToTransfer(ord.id)}
                              className="px-2.5 py-1 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[11px] font-bold border border-sky-500/30 transition flex items-center gap-1"
                              title="Generar traspaso de mercadería formal entre sucursales"
                            >
                              <Truck size={12} /> Generar Traspaso
                            </button>
                          )}
                          {ord.status === 'dispatched' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(ord.id, 'received')}
                              className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-bold border border-emerald-500/30 transition flex items-center gap-1"
                            >
                              <CheckCircle2 size={12} /> Marcar Recibido
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(ord.id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-red-400 transition"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MATRIZ CONSOLIDADA DE CORTES */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <div className="bg-[#111b21] p-4 rounded-3xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers size={16} className="text-emerald-400" />
                    Consolidado de Cortes & Mercadería Solicitada
                  </h3>
                  <p className="text-xs text-slate-400">
                    Suma total de kilos y unidades agrupadas por producto entre todas las sucursales
                  </p>
                </div>
              </div>

              {(!summary?.productBreakdown || summary.productBreakdown.length === 0) ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  No hay cortes suficientes para generar el consolidado todavía.
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.productBreakdown.map((prod, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-[#182229] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{prod.name}</span>
                          {prod.plu && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              PLU {prod.plu}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 uppercase">{prod.category}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap gap-1">
                          <span>Sucursales:</span>
                          {prod.branches.map((bName, bIdx) => (
                            <span key={bIdx} className="text-slate-300 font-medium bg-[#111b21] px-1.5 rounded">
                              {bName}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-black font-mono text-emerald-400">
                            {prod.totalQuantity} {prod.unit}
                          </div>
                          {prod.pendingQty > 0 && (
                            <div className="text-[10px] text-amber-400 font-medium">
                              {prod.pendingQty} {prod.unit} pendiente
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PRUEBA MANUAL DE OCR */}
        {activeTab === 'scan' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-emerald-400" />
                  Prueba de Extracción OCR Multimodal
                </h3>
                <p className="text-xs text-slate-400">
                  Subí una foto de planilla manuscrita, nota de pedido o pegá el texto para verificar la extracción
                </p>
              </div>

              <form onSubmit={handleRunManualScan} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Dirección del Pedido:</label>
                    <select
                      value={manualDirection}
                      onChange={(e) => setManualDirection(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white"
                    >
                      <option value="branch_to_admin">Sucursal → Administración</option>
                      <option value="admin_to_branch">Administración → Sucursal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Sucursal Asociada:</label>
                    <select
                      value={manualBranchId}
                      onChange={(e) => setManualBranchId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white"
                    >
                      <option value="">Detectar automáticamente por IA</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Cargar Foto / Imagen Manuscrita / Planilla (Opcional):
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleImageUpload}
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-emerald-500 file:text-slate-950 file:font-bold file:text-xs"
                  />
                  {manualImageBase64 && (
                    <div className="mt-2 relative inline-block">
                      <img
                        src={manualImageBase64}
                        alt="Preview"
                        className="max-h-40 rounded-xl border border-slate-700 object-contain bg-black"
                      />
                      <button
                        type="button"
                        onClick={() => setManualImageBase64(null)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white text-xs"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Texto o Mensaje de Pedido (o aclaración):
                  </label>
                  <textarea
                    rows={4}
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Ej: Hola admin, para Urca 2 mañana necesitamos:&#10;3 medias reses&#10;20 kg chorizo puro cerdo&#10;15 kg nalga para milanesa&#10;10 bolsas de carbón"
                    className="w-full p-3 rounded-2xl bg-[#182229] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isScanning}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>{isScanning ? 'Procesando con Visión e IA...' : 'Ejecutar Reconocimiento OCR'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: CONFIGURACIÓN DE GRUPOS SILENCIOSOS */}
        {activeTab === 'groups' && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Store size={16} className="text-emerald-400" />
                    Grupos de WhatsApp Monitoreados en Modo Silencioso
                  </h3>
                  <p className="text-xs text-slate-400">
                    El bot escucha en segundo plano sin responder nunca en el grupo. Extrae pedidos y facturas automáticamente.
                  </p>
                </div>
                <button
                  onClick={() => setNewGroupModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>Nuevo Grupo</span>
                </button>
              </div>

              {silentGroups.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                  No hay grupos silenciosos vinculados todavía. Hacé click en "Nuevo Grupo" para agregar un grupo con su ID (@g.us).
                </div>
              ) : (
                <div className="space-y-2">
                  {silentGroups.map((grp) => {
                    const branch = branches.find(b => b.id === grp.branchId);
                    return (
                      <div
                        key={grp.id}
                        className="p-3 rounded-2xl bg-[#182229] border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{grp.groupName}</span>
                            <span className="font-mono text-[10px] text-slate-400">{grp.groupId}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Sucursal base: <strong className="text-slate-200">{branch?.name || grp.branchId}</strong> • Modo:{' '}
                            <span className="text-emerald-400 font-semibold">{grp.mode || 'all'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${grp.active !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                            {grp.active !== false ? 'Activo' : 'Pausado'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(grp.id)}
                            className="p-1 rounded-lg text-slate-500 hover:text-red-400 transition"
                            title="Desvincular"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Modal para Vincular Nuevo Grupo */}
      {newGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Store size={16} className="text-emerald-400" />
                Vincular Grupo Silencioso WhatsApp
              </h3>
              <button onClick={() => setNewGroupModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSilentGroup} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Descriptivo del Grupo:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pedidos Sucursales República"
                  value={newGroupForm.groupName}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, groupName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">ID del Grupo de WhatsApp (@g.us):</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 120363028394857291@g.us"
                  value={newGroupForm.groupId}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, groupId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Sucursal Asociada por Defecto:</label>
                <select
                  value={newGroupForm.branchId}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Modo de Escaneo:</label>
                <select
                  value={newGroupForm.mode}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, mode: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white"
                >
                  <option value="all">Todo (Pedidos Internos y Facturas Proveedor)</option>
                  <option value="internal_orders">Solo Pedidos Internos (Sucursal ↔ Admin)</option>
                  <option value="invoices">Solo Facturas Fiscales de Proveedor</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewGroupModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#111b21] text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                >
                  Vincular Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal de Imagen Original */}
      {previewMedia && (
        <div
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 shadow-2xl">
            <img src={previewMedia} alt="Manuscrito OCR Original" className="max-w-full max-h-[85vh] object-contain" />
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/70 text-white hover:bg-black transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

