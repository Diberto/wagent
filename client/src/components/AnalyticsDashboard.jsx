import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  MessageSquare, 
  DollarSign, 
  Store,
  ShoppingBag,
  CreditCard,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Search,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  Bike,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  Layers
} from 'lucide-react';
import TicketPrintModal from './TicketPrintModal.jsx';

export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'branches' | 'products' | 'sales_list' | 'channels'
  const [stats, setStats] = useState(null);
  const [salesList, setSalesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ticketPrintModal, setTicketPrintModal] = useState(null);

  // Filters State
  const [dateRange, setDateRange] = useState('all'); // 'today' | '7days' | 'month' | 'all'
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  const [listSearch, setListSearch] = useState('');
  const [branchesList, setBranchesList] = useState([]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      setBranchesList(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const getFilterParams = () => {
    const params = new URLSearchParams();
    
    // Dates calculation
    const now = new Date();
    if (dateRange === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      params.append('fromDate', startOfDay);
    } else if (dateRange === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      params.append('fromDate', sevenDaysAgo);
    } else if (dateRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      params.append('fromDate', startOfMonth);
    }

    if (selectedBranch !== 'all') params.append('branchId', selectedBranch);
    if (selectedChannel !== 'all') params.append('channel', selectedChannel);
    if (selectedPayment !== 'all') params.append('paymentMethod', selectedPayment);
    if (listSearch.trim()) params.append('search', listSearch.trim());

    return params.toString();
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const queryStr = getFilterParams();
      const [statsRes, listRes] = await Promise.all([
        fetch(`/api/sales/stats?${queryStr}`),
        fetch(`/api/sales/list?${queryStr}`)
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (listRes.ok) {
        const listData = await listRes.json();
        setSalesList(Array.isArray(listData) ? listData : []);
      }
    } catch (err) {
      console.error('Error cargando estadísticas de ventas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    loadData();
  }, [dateRange, selectedBranch, selectedChannel, selectedPayment, listSearch]);

  const handleExportSales = (format = 'xlsx') => {
    const queryStr = getFilterParams();
    window.open(`/api/sales/export?${queryStr}&format=${format}`, '_blank');
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b141a] p-3 sm:p-4 lg:p-6 overflow-y-auto space-y-5">
      
      {/* Top Header & Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <span>Reporte de Ventas & Inteligencia Comercial</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
              República de la Carne
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Métricas completas por sucursal, producto/corte PLU, canal de venta y registro detallado de operaciones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Refrescar métricas"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
          </button>

          <button
            onClick={() => handleExportSales('xlsx')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition"
            title="Descargar reporte completo en Microsoft Excel"
          >
            <Download size={14} />
            <span>Exportar Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => handleExportSales('csv')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-semibold text-xs transition"
            title="Descargar en formato CSV (;)"
          >
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Date Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-500 font-bold flex items-center gap-1 shrink-0">
            <Calendar size={13} /> Periodo:
          </span>
          {[
            { id: 'all', label: 'Todo el Historial' },
            { id: 'today', label: 'Hoy' },
            { id: '7days', label: 'Últimos 7 Días' },
            { id: 'month', label: 'Este Mes' }
          ].map(d => (
            <button
              key={d.id}
              onClick={() => setDateRange(d.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                dateRange === d.id
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Branch Filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-[#182229] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">🏪 Todas las Sucursales</option>
            {branchesList.map(b => (
              <option key={b.id || b.name} value={b.name || b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Channel Filter */}
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="bg-[#182229] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">🌐 Todos los Canales</option>
            <option value="whatsapp">💬 WhatsApp (IA)</option>
            <option value="pos">🏪 POS Mostrador</option>
            <option value="web">🛒 Tienda Online</option>
          </select>

          {/* Payment Method Filter */}
          <select
            value={selectedPayment}
            onChange={(e) => setSelectedPayment(e.target.value)}
            className="bg-[#182229] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">💳 Todos los Medios de Pago</option>
            <option value="efectivo">💵 Efectivo</option>
            <option value="mercado pago">📱 Mercado Pago</option>
            <option value="transfer">🏦 Transferencia Bancaria</option>
            <option value="tarjeta">💳 Tarjeta Débito / Crédito</option>
          </select>
        </div>

      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Facturado */}
        <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 relative overflow-hidden group">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <DollarSign size={20} />
          </div>
          <span className="text-xs font-semibold text-slate-400">Facturación Total</span>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
            ${(stats?.totalSalesAmount || 0).toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-400" />
            <span>Cobrado: ${(stats?.paidAmount || 0).toLocaleString('es-AR')}</span>
          </div>
        </div>

        {/* Total Pedidos / Ventas */}
        <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 relative overflow-hidden">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <ShoppingBag size={20} />
          </div>
          <span className="text-xs font-semibold text-slate-400">Total Operaciones</span>
          <div className="text-2xl font-black text-white font-mono mt-1">
            {stats?.totalOrdersCount || 0} <span className="text-xs font-normal text-slate-400">ventas</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <Clock size={12} className="text-amber-400" />
            <span>Pendiente Cobro: ${(stats?.pendingAmount || 0).toLocaleString('es-AR')}</span>
          </div>
        </div>

        {/* Ticket Promedio */}
        <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 relative overflow-hidden">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
          <span className="text-xs font-semibold text-slate-400">Ticket Promedio</span>
          <div className="text-2xl font-black text-purple-300 font-mono mt-1">
            ${(stats?.averageTicket || 0).toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Valor medio por pedido o corte despachado
          </div>
        </div>

        {/* Sucursales Activas */}
        <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-slate-800 relative overflow-hidden">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Store size={20} />
          </div>
          <span className="text-xs font-semibold text-slate-400">Sucursal Líder</span>
          <div className="text-base font-extrabold text-amber-400 truncate mt-1">
            {stats?.branchStats?.[0]?.name || 'URCA CENTRAL'}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            ${(stats?.branchStats?.[0]?.totalRevenue || 0).toLocaleString('es-AR')} ({stats?.branchStats?.[0]?.percentageOfTotal || 0}% del total)
          </div>
        </div>

      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-1">
        {[
          { id: 'overview', label: '📊 Resumen & Evolución', icon: BarChart3 },
          { id: 'branches', label: '🏪 Ventas por Sucursal', icon: Store, badge: stats?.branchStats?.length },
          { id: 'products', label: '🥩 Ventas por Producto & PLU', icon: ShoppingBag, badge: stats?.productStats?.length },
          { id: 'sales_list', label: '📋 Registro Detallado de Ventas', icon: Layers, badge: salesList.length },
          { id: 'channels', label: '💳 Canales & Medios de Pago', icon: CreditCard }
        ].map(t => {
          const Icon = t.icon;
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-bold text-xs transition whitespace-nowrap ${
                isSelected
                  ? 'border-emerald-500 text-emerald-400 bg-[#111b21]/60 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon size={14} />
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  isSelected ? 'bg-emerald-500/20 text-emerald-300 font-black' : 'bg-[#182229] text-slate-500'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. TAB: RESUMEN Y TIMELINE DIARIO                                         */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Top 3 Sucursales & Top 3 Cortes Resumen */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Top Sucursales Preview */}
            <div className="bg-[#111b21] p-5 rounded-3xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Store size={14} className="text-amber-400" />
                  <span>Ranking de Sucursales</span>
                </h3>
                <button
                  onClick={() => setActiveTab('branches')}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-0.5 font-semibold"
                >
                  Ver todas <ChevronRight size={12} />
                </button>
              </div>

              <div className="space-y-3">
                {(stats?.branchStats || []).slice(0, 4).map((b, idx) => (
                  <div key={b.id || idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        {idx + 1}. {b.name}
                      </span>
                      <span className="font-mono font-extrabold text-emerald-400">
                        ${b.totalRevenue.toLocaleString('es-AR')} ({b.ordersCount} pedidos)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{ width: `${Math.max(b.percentageOfTotal, 3)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Corte estrella: {b.topProduct}</span>
                      <span>{b.percentageOfTotal}% del total</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Cortes / Productos Preview */}
            <div className="bg-[#111b21] p-5 rounded-3xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag size={14} className="text-emerald-400" />
                  <span>Cortes y Productos Más Vendidos</span>
                </h3>
                <button
                  onClick={() => setActiveTab('products')}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-0.5 font-semibold"
                >
                  Ver todos <ChevronRight size={12} />
                </button>
              </div>

              <div className="space-y-3">
                {(stats?.productStats || []).slice(0, 4).map((p, idx) => (
                  <div key={p.id || idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 truncate max-w-[240px]">
                        {idx + 1}. {p.plu ? `[PLU ${p.plu}] ` : ''}{p.name}
                      </span>
                      <span className="font-mono font-extrabold text-emerald-400">
                        ${p.totalRevenue.toLocaleString('es-AR')}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full"
                        style={{ width: `${Math.max(p.percentageOfTotal, 3)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Despachado: {p.unitsSold} {p.unit}</span>
                      <span>{p.percentageOfTotal}% de ventas</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Timeline Diario */}
          {stats?.timeline && stats.timeline.length > 0 && (
            <div className="bg-[#111b21] p-5 rounded-3xl border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <BarChart3 size={14} className="text-sky-400" />
                <span>Evolución Diaria de Ventas</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
                {stats.timeline.map((item, idx) => (
                  <div key={idx} className="bg-[#182229] p-3 rounded-2xl border border-slate-800 text-center space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">{item.date}</span>
                    <div className="text-sm font-black text-emerald-400 font-mono">
                      ${item.revenue.toLocaleString('es-AR')}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {item.orders} pedido{item.orders !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TAB: VENTAS POR SUCURSAL                                               */}
      {/* ========================================================================= */}
      {activeTab === 'branches' && (
        <div className="bg-[#111b21] rounded-3xl border border-slate-800 overflow-hidden shadow-xl animate-fade-in">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-white">Desglose de Ventas por Sucursal</h3>
              <p className="text-xs text-slate-400">Rendimiento comercial y facturación de las 6 sedes de Córdoba</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#182229] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-4"># Sucursal</th>
                  <th className="py-3.5 px-4">Dirección / Zona</th>
                  <th className="py-3.5 px-4 text-center">Pedidos</th>
                  <th className="py-3.5 px-4 text-right">Facturación ($)</th>
                  <th className="py-3.5 px-4 text-right">Ticket Promedio</th>
                  <th className="py-3.5 px-4 text-center">% del Total</th>
                  <th className="py-3.5 px-4">Corte Estrella</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(stats?.branchStats || []).map((b, idx) => (
                  <tr key={b.id || idx} className="hover:bg-[#182229]/60 transition">
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-mono">
                        {idx + 1}
                      </span>
                      <span>{b.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{b.address || 'Córdoba Capital'}</td>
                    <td className="py-3.5 px-4 text-center font-bold font-mono text-slate-200">{b.ordersCount}</td>
                    <td className="py-3.5 px-4 text-right font-extrabold font-mono text-emerald-400 text-sm">
                      ${b.totalRevenue.toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      ${b.averageTicket.toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-extrabold text-[11px] border border-emerald-500/20">
                        {b.percentageOfTotal}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-medium">{b.topProduct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TAB: VENTAS POR PRODUCTO Y PLU                                         */}
      {/* ========================================================================= */}
      {activeTab === 'products' && (
        <div className="bg-[#111b21] rounded-3xl border border-slate-800 overflow-hidden shadow-xl animate-fade-in">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-white">Ranking de Cortes y Productos Vendidos</h3>
              <p className="text-xs text-slate-400">Volumen en Kilos/Unidades y Recaudación acumulada</p>
            </div>
            <span className="text-xs text-emerald-400 font-bold">
              {stats?.productStats?.length || 0} cortes registrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#182229] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">PLU / Código</th>
                  <th className="py-3.5 px-4">Descripción del Corte</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4 text-center">Volumen Vendido</th>
                  <th className="py-3.5 px-4 text-center">Frecuencia</th>
                  <th className="py-3.5 px-4 text-right">Recaudación ($)</th>
                  <th className="py-3.5 px-4 text-center">% de Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(stats?.productStats || []).map((p, idx) => (
                  <tr key={p.id || idx} className="hover:bg-[#182229]/60 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-purple-400">
                      {p.plu ? `PLU ${p.plu}` : `PLU-${idx + 1}`}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{p.name}</td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <span className="px-2 py-0.5 rounded-lg bg-[#182229] border border-slate-800 text-[10px]">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold font-mono text-emerald-400 text-sm">
                      {p.unitsSold} {p.unit}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                      {p.ordersCount} pedidos
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold font-mono text-white text-sm">
                      ${p.totalRevenue.toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 font-extrabold text-[11px] border border-purple-500/20">
                        {p.percentageOfTotal}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TAB: REGISTRO DETALLADO DE VENTAS                                      */}
      {/* ========================================================================= */}
      {activeTab === 'sales_list' && (
        <div className="space-y-3 animate-fade-in">
          
          {/* List Search Input */}
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por N° Orden, cliente, teléfono, corte o dirección..."
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="bg-[#111b21] rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#182229] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Ticket ID</th>
                    <th className="py-3.5 px-4">Fecha / Hora</th>
                    <th className="py-3.5 px-4">Cliente & Contacto</th>
                    <th className="py-3.5 px-4">Canal</th>
                    <th className="py-3.5 px-4">Sucursal / Entrega</th>
                    <th className="py-3.5 px-4">Detalle de Cortes</th>
                    <th className="py-3.5 px-4 text-right">Total ($)</th>
                    <th className="py-3.5 px-4">Medio de Pago</th>
                    <th className="py-3.5 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {salesList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        No se encontraron registros de ventas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    salesList.map(sale => {
                      const channel = sale.channel || (sale.notes?.includes('[POS Mostrador]') ? 'pos' : (sale.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
                      const isPaid = sale.paymentStatus === 'paid' || sale.mpPaymentId || (sale.paymentMethod && sale.paymentMethod.toLowerCase().includes('mercado pago')) || sale.status === 'delivered';
                      const productsSummary = Array.isArray(sale.products) && sale.products.length > 0
                        ? sale.products.map(p => `${p.quantity} ${p.unit || 'kg'} ${p.name}`).join(' • ')
                        : (Array.isArray(sale.items) ? sale.items.join(' • ') : '');

                      return (
                        <tr key={sale.id} className="hover:bg-[#182229]/60 transition">
                          <td className="py-3.5 px-4 font-mono font-black text-emerald-400 whitespace-nowrap">
                            #{sale.id}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                            {new Date(sale.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}{' '}
                            {new Date(sale.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3.5 px-4 min-w-[150px]">
                            <div className="font-bold text-white truncate">{sale.customerName || 'Cliente'}</div>
                            <div className="text-slate-400 text-[11px] font-mono">{sale.phone || 'Sin registrar'}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                              channel === 'pos'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : channel === 'web'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}>
                              {channel === 'pos' ? '🏪 POS' : channel === 'web' ? '🛒 Web' : '💬 WhatsApp'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-[180px]">
                            <div className="font-semibold text-slate-200 truncate">{sale.branchName || 'URCA CENTRAL'}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sale.deliveryType === 'pickup' ? '🏪 Retiro' : `🛵 ${sale.address || 'Domicilio'}`}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 min-w-[200px] max-w-xs">
                            <div className="text-[11px] text-slate-300 truncate" title={productsSummary}>
                              {productsSummary || 'Cortes varios'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black font-mono text-emerald-400 text-sm whitespace-nowrap">
                            ${Number(sale.totalAmount || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-200 text-[11px]">{sale.paymentMethod || 'Efectivo'}</div>
                            <span className={`text-[10px] font-bold ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {isPaid ? '✅ Cobrado' : '⏳ Pendiente'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => setTicketPrintModal(sale)}
                              className="p-1.5 rounded-lg bg-[#182229] hover:bg-emerald-950/40 text-slate-300 hover:text-emerald-400 border border-slate-700 transition"
                              title="Imprimir Ticket Térmico / Comanda"
                            >
                              <Printer size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TAB: CANALES & MEDIOS DE PAGO                                          */}
      {/* ========================================================================= */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          
          {/* Canales de Venta */}
          <div className="bg-[#111b21] p-5 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <MessageSquare size={14} className="text-emerald-400" />
              <span>Ventas por Canal</span>
            </h3>

            <div className="space-y-4">
              {(stats?.channelStats || []).map((ch, idx) => (
                <div key={ch.channel || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">{ch.label}</span>
                    <span className="font-mono font-extrabold text-emerald-400">
                      ${ch.totalRevenue.toLocaleString('es-AR')} ({ch.ordersCount} operaciones)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full"
                      style={{ 
                        width: `${Math.max(ch.percentage, 4)}%`,
                        backgroundColor: ch.color || '#10B981'
                      }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-slate-400 font-bold">
                    {ch.percentage}% del volumen total
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Medios de Pago */}
          <div className="bg-[#111b21] p-5 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <CreditCard size={14} className="text-sky-400" />
              <span>Distribución por Medio de Pago</span>
            </h3>

            <div className="space-y-4">
              {(stats?.paymentStats || []).map((p, idx) => (
                <div key={p.method || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">{p.method}</span>
                    <span className="font-mono font-extrabold text-white">
                      ${p.totalRevenue.toLocaleString('es-AR')} ({p.ordersCount} transacciones)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 rounded-full"
                      style={{ width: `${Math.max(p.percentage, 4)}%` }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-slate-400 font-bold">
                    {p.percentage}% del total facturado
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Ticket Print Modal */}
      {ticketPrintModal && (
        <TicketPrintModal
          order={ticketPrintModal}
          onClose={() => setTicketPrintModal(null)}
        />
      )}

    </div>
  );
}
