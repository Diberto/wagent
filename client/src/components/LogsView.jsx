import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Activity,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ShoppingBag,
  MessageSquare,
  Bot,
  Cpu,
  Radio,
  FileSpreadsheet,
  FileCode,
  Shield,
  Layers
} from 'lucide-react';

export default function LogsView({ socket }) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    last24h: 0,
    byCategory: { orders: 0, chats: 0, agents: 0, system: 0 },
    byLevel: { info: 0, success: 0, warn: 0, error: 0 }
  });
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'orders' | 'chats' | 'agents' | 'system'
  const [levelFilter, setLevelFilter] = useState('all'); // 'all' | 'info' | 'success' | 'warn' | 'error'
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);

  // Fetch initial logs and stats
  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (levelFilter !== 'all') params.append('level', levelFilter);
      if (search.trim()) params.append('search', search.trim());
      params.append('limit', '300');

      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/logs?${params.toString()}`),
        fetch('/api/logs/stats')
      ]);

      const logsData = await logsRes.json();
      const statsData = await statsRes.json();

      if (logsData.success) {
        setLogs(logsData.logs || []);
      }
      if (statsData.success) {
        setStats(statsData);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, levelFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchLogs();
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;

    const handleNewLog = (newEntry) => {
      if (!isLiveStreaming) return;

      // Check if matches active filters
      const matchesCat = categoryFilter === 'all' || newEntry.category === categoryFilter;
      const matchesLevel = levelFilter === 'all' || newEntry.level === levelFilter;
      const matchesSearch = !search.trim() || 
        (newEntry.title && newEntry.title.toLowerCase().includes(search.toLowerCase())) ||
        (newEntry.action && newEntry.action.toLowerCase().includes(search.toLowerCase()));

      if (matchesCat && matchesLevel && matchesSearch) {
        setLogs(prev => [newEntry, ...prev.slice(0, 499)]);
      }

      setStats(prev => {
        const next = { ...prev };
        next.total = (next.total || 0) + 1;
        next.last24h = (next.last24h || 0) + 1;
        if (next.byCategory && next.byCategory[newEntry.category] !== undefined) {
          next.byCategory[newEntry.category]++;
        }
        if (next.byLevel && next.byLevel[newEntry.level] !== undefined) {
          next.byLevel[newEntry.level]++;
        }
        return next;
      });
    };

    const handleCleared = () => {
      setLogs([]);
      setStats({
        total: 0,
        last24h: 0,
        byCategory: { orders: 0, chats: 0, agents: 0, system: 0 },
        byLevel: { info: 0, success: 0, warn: 0, error: 0 }
      });
    };

    socket.on('audit:log:new', handleNewLog);
    socket.on('audit:cleared', handleCleared);

    return () => {
      socket.off('audit:log:new', handleNewLog);
      socket.off('audit:cleared', handleCleared);
    };
  }, [socket, isLiveStreaming, categoryFilter, levelFilter, search]);

  const handleClearLogs = async () => {
    if (!window.confirm('¿Estás seguro de que deseas limpiar todo el historial de auditoría de logs? Esta acción no se puede deshacer.')) return;
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setStats({
          total: 0,
          last24h: 0,
          byCategory: { orders: 0, chats: 0, agents: 0, system: 0 },
          byLevel: { info: 0, success: 0, warn: 0, error: 0 }
        });
      }
    } catch (err) {
      alert('Error limpiando logs: ' + err.message);
    }
  };

  const handleExport = (format) => {
    window.open(`/api/logs/export?format=${format}`, '_blank');
  };

  const handleCopyJson = (log) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryBadge = (cat) => {
    switch (cat) {
      case 'orders':
        return {
          label: 'Pedidos & POS',
          icon: <ShoppingBag size={13} className="text-amber-400" />,
          color: 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        };
      case 'chats':
        return {
          label: 'Chats & WhatsApp',
          icon: <MessageSquare size={13} className="text-emerald-400" />,
          color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        };
      case 'agents':
        return {
          label: 'Agentes IA',
          icon: <Bot size={13} className="text-purple-400" />,
          color: 'bg-purple-500/10 text-purple-300 border-purple-500/20'
        };
      case 'system':
      default:
        return {
          label: 'Sistema',
          icon: <Cpu size={13} className="text-cyan-400" />,
          color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
        };
    }
  };

  const getLevelBadge = (lvl) => {
    switch (lvl) {
      case 'success':
        return {
          label: 'Éxito',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        };
      case 'warn':
        return {
          label: 'Alerta',
          icon: <AlertTriangle size={13} className="text-amber-400" />,
          color: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        };
      case 'error':
        return {
          label: 'Error',
          icon: <AlertCircle size={13} className="text-rose-400" />,
          color: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
        };
      case 'info':
      default:
        return {
          label: 'Info',
          icon: <Info size={13} className="text-blue-400" />,
          color: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
        };
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    const date = new Date(ts);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getRelativeTime = (ts) => {
    if (!ts) return '';
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'justo ahora';
    if (diffSec < 60) return `hace ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `hace ${diffHours}h`;
    return `hace ${Math.floor(diffHours / 24)}d`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-slate-200 overflow-hidden select-none">
      
      {/* Top Header */}
      <div className="bg-[#111b21] border-b border-slate-800 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <Terminal size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-wide">
                Auditoría y Logs del Sistema
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Live Stream
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Monitoreo centralizado de pedidos, conversaciones de clientes, acciones de agentes IA y eventos de sistema.
            </p>
          </div>
        </div>

        {/* Live Indicator & Global Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition shadow-sm ${
              isLiveStreaming
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Radio size={13} className={isLiveStreaming ? 'animate-pulse text-emerald-400' : ''} />
            <span>{isLiveStreaming ? 'Streaming Activo' : 'En Pausa'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('json')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Exportar archivo JSON"
          >
            <FileCode size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Exportar planilla CSV"
          >
            <FileSpreadsheet size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
            title="Limpiar todos los registros"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Limpiar</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-700/20 text-slate-300 flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Eventos</div>
              <div className="text-lg font-black text-white truncate">{stats.total || 0}</div>
            </div>
          </div>

          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Últimas 24h</div>
              <div className="text-lg font-black text-cyan-400 truncate">{stats.last24h || 0}</div>
            </div>
          </div>

          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <ShoppingBag size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Pedidos & POS</div>
              <div className="text-lg font-black text-amber-400 truncate">{stats.byCategory?.orders || 0}</div>
            </div>
          </div>

          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Chats & WS</div>
              <div className="text-lg font-black text-emerald-400 truncate">{stats.byCategory?.chats || 0}</div>
            </div>
          </div>

          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Agentes IA</div>
              <div className="text-lg font-black text-purple-400 truncate">{stats.byCategory?.agents || 0}</div>
            </div>
          </div>

          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Errores / Alert</div>
              <div className="text-lg font-black text-rose-400 truncate">
                {(stats.byLevel?.error || 0) + (stats.byLevel?.warn || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#111b21] p-3 rounded-2xl border border-slate-800">
          
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por texto, ID, acción, cliente o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Tabs */}
            <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-slate-800">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'orders', label: '📦 Pedidos' },
                { id: 'chats', label: '💬 Chats' },
                { id: 'agents', label: '🤖 Agentes' },
                { id: 'system', label: '⚙️ Sistema' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    categoryFilter === cat.id
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Level Filter */}
            <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-slate-800">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'success', label: 'Éxito' },
                { id: 'info', label: 'Info' },
                { id: 'warn', label: 'Alerta' },
                { id: 'error', label: 'Error' }
              ].map(lvl => (
                <button
                  key={lvl.id}
                  onClick={() => setLevelFilter(lvl.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    levelFilter === lvl.id
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Logs Table / List */}
        {isLoading ? (
          <div className="py-20 text-center text-xs text-slate-500">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-cyan-400" />
            Cargando registros de auditoría...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 bg-[#111b21] border border-slate-800/80 rounded-3xl text-center p-8 space-y-3">
            <Terminal size={36} className="mx-auto text-slate-600" />
            <div className="text-sm font-bold text-white">No se encontraron eventos registrados</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Los eventos generados por pedidos, mensajes de clientes, ejecuciones de agentes IA y acciones del sistema aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="bg-[#111b21] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="divide-y divide-slate-800/60">
              {logs.map((log) => {
                const catBadge = getCategoryBadge(log.category);
                const lvlBadge = getLevelBadge(log.level);
                const isExpanded = expandedLogId === log.id;

                return (
                  <div key={log.id} className="hover:bg-slate-800/30 transition">
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="p-3 sm:px-4 sm:py-3 flex items-start sm:items-center justify-between gap-3 cursor-pointer select-text"
                    >
                      {/* Left: Icon, Category, Level, Title */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          className="mt-0.5 sm:mt-0 text-slate-500 hover:text-slate-300 transition"
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {/* Category Badge */}
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${catBadge.color}`}>
                            {catBadge.icon}
                            <span>{catBadge.label}</span>
                          </span>

                          {/* Level Badge */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${lvlBadge.color}`}>
                            {lvlBadge.icon}
                            <span className="uppercase">{lvlBadge.label}</span>
                          </span>
                        </div>

                        {/* Title & Action */}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {log.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span className="bg-slate-800 px-1 rounded text-slate-300">{log.action}</span>
                            {log.metadata?.orderId && (
                              <span className="text-amber-400 font-bold">#{log.metadata.orderId}</span>
                            )}
                            {log.metadata?.phone && (
                              <span className="text-emerald-400">Tel: {log.metadata.phone}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Timestamp */}
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-medium text-slate-300 whitespace-nowrap">
                          {getRelativeTime(log.timestamp)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap hidden sm:block">
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Drawer */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-[#0d1418] border-t border-slate-800/80 space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-500">ID Evento: {log.id}</span>
                            <span className="text-slate-600">•</span>
                            <span className="font-mono text-[10px] text-slate-500">Hora Exacta: {log.timestamp}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopyJson(log)}
                            className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
                          >
                            {copiedId === log.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                            <span>{copiedId === log.id ? 'Copiado' : 'Copiar JSON'}</span>
                          </button>
                        </div>

                        {/* Metadata Tags */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                              Metadatos del Evento
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(log.metadata).map(([key, val]) => (
                                <div key={key} className="bg-slate-800/70 border border-slate-700/60 px-2 py-1 rounded-lg text-xs font-mono">
                                  <span className="text-slate-400">{key}: </span>
                                  <span className="text-cyan-300 font-semibold">{String(val)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Details / Payload Viewer */}
                        {log.details !== null && log.details !== undefined && (
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                              Detalles / Payload
                            </div>
                            <pre className="bg-[#080d10] border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-64 leading-relaxed">
                              {typeof log.details === 'object' 
                                ? JSON.stringify(log.details, null, 2) 
                                : String(log.details)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
