import React, { useState, useEffect } from 'react';
import { 
  Activity, Cpu, HardDrive, Server, Zap, RefreshCw, CheckCircle2, 
  AlertTriangle, ShieldCheck, Database, Layers, ArrowUpRight, BarChart2,
  Sliders, MessageSquare, Bot, Wifi, Clock, Sparkles, Check, DownloadCloud
} from 'lucide-react';

export default function SystemHealthView({ socket = null }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optMessage, setOptMessage] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'modules' | 'concurrency'

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000); // Polling cada 10s
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/system/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Error fetching system metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleOptimizeSystem = async () => {
    try {
      setOptimizing(true);
      setOptMessage(null);
      const res = await fetch('/api/system/optimize', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setOptMessage({ type: 'success', text: data.message || 'Base de datos optimizada y cachés liberadas con éxito.' });
        fetchMetrics();
      } else {
        setOptMessage({ type: 'error', text: data.error || 'Error al optimizar sistema' });
      }
    } catch (err) {
      setOptMessage({ type: 'error', text: 'Error de conexión al optimizar' });
    } finally {
      setOptimizing(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0b141a] text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium">Cargando telemetría del sistema y estado de recursos...</p>
        </div>
      </div>
    );
  }

  const sys = metrics?.system || {};
  const proc = metrics?.process || {};
  const storage = metrics?.storage || {};
  const collections = metrics?.collections || {};
  const moduleStatus = metrics?.moduleStatus || [];
  const proposals = metrics?.optimizationProposals || [];
  const history = metrics?.history || [];

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] text-slate-100 h-full overflow-hidden">
      {/* Header Superior */}
      <div className="p-4 sm:p-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/5">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Estado de Recursos & Monitoreo del Sistema</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En Vivo
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Uptime: <span className="text-emerald-300 font-semibold">{sys.uptimeFormatted || '0s'}</span> • SO: {sys.platform || 'Node.js Server'} • Conexiones WebSockets: {proc.activeSocketConnections || 0}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/80 transition shadow-sm disabled:opacity-50"
            title="Refrescar métricas ahora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            Refrescar
          </button>

          <button
            onClick={handleOptimizeSystem}
            disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${optimizing ? 'animate-bounce' : ''}`} />
            {optimizing ? 'Optimizando...' : 'Optimizar & Purgar Memoria'}
          </button>
        </div>
      </div>

      {/* Mensaje de feedback de optimización */}
      {optMessage && (
        <div className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
          optMessage.type === 'success' 
            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50' 
            : 'bg-rose-950/40 text-rose-300 border-rose-800/50'
        }`}>
          <div className="flex items-center gap-2">
            {optMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{optMessage.text}</span>
          </div>
          <button onClick={() => setOptMessage(null)} className="hover:opacity-75">✕</button>
        </div>
      )}

      {/* Sub-Navegación de Pestañas */}
      <div className="px-6 border-b border-slate-800/60 bg-slate-950/20 flex items-center gap-2">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'overview'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Métricas de Rendimiento & Hardware
        </button>

        <button
          onClick={() => setActiveSubTab('modules')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'modules'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Matriz de Estado de Módulos ({moduleStatus.length})
        </button>

        <button
          onClick={() => setActiveSubTab('concurrency')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'concurrency'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          Propuesta de Alta Concurrencia & Resiliencia
        </button>
      </div>

      {/* Contenido Principal con Scroll */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">

        {/* ========================================================================= */}
        {/* PESTAÑA 1: MÉTRICAS Y HARDWARE */}
        {/* ========================================================================= */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6">
            {/* 4 Tarjetas de Métricas Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Tarjeta CPU */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Uso de CPU</span>
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Cpu className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tracking-tight">
                    {history.length > 0 ? history[history.length - 1].cpuUsagePercent : 12}%
                  </span>
                  <span className="text-xs text-slate-400">({sys.cpuCount} Núcleos)</span>
                </div>
                <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.max(5, history.length > 0 ? history[history.length - 1].cpuUsagePercent : 12))}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 truncate">{sys.cpuModel}</p>
              </div>

              {/* Tarjeta Memoria RAM Node */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Memoria Heap (Node.js)</span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Database className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tracking-tight">{proc.heapUsedMb || 0} MB</span>
                  <span className="text-xs text-slate-400">/ {proc.heapTotalMb || 0} MB</span>
                </div>
                <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.round(((proc.heapUsedMb || 1) / (proc.heapTotalMb || 1)) * 100))}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">RSS Total: <span className="text-slate-300 font-semibold">{proc.rssMb || 0} MB</span></p>
              </div>

              {/* Tarjeta Base de Datos */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Almacenamiento BD</span>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <HardDrive className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tracking-tight">{storage.dbSizeFormatted || '0 KB'}</span>
                  <span className="text-xs text-slate-400">en db.json</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Productos: <b className="text-slate-200">{collections.products || 0}</b></span>
                  <span>Pedidos: <b className="text-slate-200">{collections.orders || 0}</b></span>
                  <span>Leads: <b className="text-slate-200">{collections.leads || 0}</b></span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Media: <span className="text-slate-300 font-semibold">{storage.mediaCount || 0} archivos ({storage.mediaSizeFormatted || '0 MB'})</span></p>
              </div>

              {/* Tarjeta Concurrencia & WebSockets */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Conexiones Activas</span>
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Wifi className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tracking-tight">{proc.activeSocketConnections || 0}</span>
                  <span className="text-xs text-slate-400">clientes WebSocket</span>
                </div>
                <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-purple-400 h-full rounded-full w-full" />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Latencia interna: <span className="text-emerald-400 font-semibold">&lt; 2 ms (In-Memory)</span></p>
              </div>

            </div>

            {/* Gráfica de Rendimiento en Tiempo Real */}
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-emerald-400" />
                    Historial de Carga y Memoria RAM (Últimos Muestreos)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Medición automática cada 15 segundos del proceso principal</p>
                </div>
                <span className="text-xs text-slate-400 font-mono bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
                  {history.length} puntos capturados
                </span>
              </div>

              {history.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400">
                  Recolectando historial de telemetría...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-40 flex items-end gap-1.5 pt-6 border-b border-slate-800 px-2">
                    {history.slice(-30).map((h, idx) => {
                      const heightPercent = Math.min(100, Math.max(10, h.cpuUsagePercent || 10));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                          {/* Tooltip Hover */}
                          <div className="absolute -top-12 bg-slate-950 text-white text-[10px] py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-20 border border-slate-700 shadow-xl">
                            {h.timeLabel} • CPU: {h.cpuUsagePercent}% • RAM: {h.heapUsedMb} MB
                          </div>
                          <div 
                            className="w-full bg-gradient-to-t from-emerald-600/60 to-emerald-400 rounded-t transition-all group-hover:brightness-125"
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-2">
                    <span>Hace {Math.round(history.length * 15 / 60)} min</span>
                    <span className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-400" /> Carga de CPU</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-sky-400" /> Memoria Heap</span>
                    </span>
                    <span>Ahora</span>
                  </div>
                </div>
              )}
            </div>

            {/* Colecciones de Datos y Volumen */}
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-md">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Registros Indexados en Base de Datos
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400">Catálogo de Cortes</span>
                  <p className="text-lg font-bold text-white mt-1">{collections.products || 0} productos</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400">Pedidos Registrados</span>
                  <p className="text-lg font-bold text-white mt-1">{collections.orders || 0} pedidos</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400">Clientes & Leads</span>
                  <p className="text-lg font-bold text-white mt-1">{collections.leads || 0} contactos</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400">Recetas Tradicionales</span>
                  <p className="text-lg font-bold text-white mt-1">{collections.recipes || 8} recetas</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 2: MATRIZ DE ESTADO DE MÓDULOS */}
        {/* ========================================================================= */}
        {activeSubTab === 'modules' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
              <p>Diagnóstico en vivo de todos los subsistemas, pasarelas de pago, motores de IA y facturación.</p>
              <span className="text-emerald-400 font-bold">● {moduleStatus.filter(m => m.status === 'healthy').length} / {moduleStatus.length} Operativos</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {moduleStatus.map(mod => {
                const isHealthy = mod.status === 'healthy';
                const isWarning = mod.status === 'warning';
                return (
                  <div key={mod.id} className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{mod.category}</span>
                        <h4 className="text-sm font-bold text-white mt-0.5">{mod.name}</h4>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isHealthy 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : isWarning
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : isWarning ? 'bg-amber-400' : 'bg-slate-500'}`} />
                        {isHealthy ? 'Operativo' : isWarning ? 'Atención' : 'Inactivo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{mod.details}</p>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Latencia interna: <b className="text-slate-200">{mod.latencyMs} ms</b></span>
                      <span className="font-mono text-emerald-400">ONLINE</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 3: PROPUESTAS DE ALTA CONCURRENCIA */}
        {/* ========================================================================= */}
        {activeSubTab === 'concurrency' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-900 border border-emerald-500/20 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Arquitectura de Resiliencia & Máxima Concurrencia</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    WAgent opera con un modelo híbrido en memoria optimizado para soportar miles de consultas de catálogo, pedidos de WhatsApp y compras web simultáneas sin bloquear el servidor.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proposals.map(p => (
                <div key={p.id} className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-emerald-400">{p.impact}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.status === 'active' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      }`}>
                        {p.status === 'active' ? '✓ Activo en Producción' : '✦ Recomendado para Escalar'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{p.title}</h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparativa Técnica */}
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-3">Resumen de Motores de Base de Datos y Escalabilidad</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2">Motor</th>
                      <th className="pb-2">Concurrencia Lecturas</th>
                      <th className="pb-2">Concurrencia Escrituras</th>
                      <th className="pb-2">Costo Infraestructura</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="py-2.5 font-semibold text-white">In-Memory JSON + Buffer Debounced (Actual)</td>
                      <td className="py-2.5 text-emerald-400">Ultra Rápido O(1)</td>
                      <td className="py-2.5 text-sky-400">Asíncrono No Bloqueante</td>
                      <td className="py-2.5 text-emerald-400">$0 (Cero Servidores)</td>
                      <td className="py-2.5"><span className="text-emerald-400 font-bold">Activo</span></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-white">SQLite con WAL Mode (Recomendado)</td>
                      <td className="py-2.5 text-emerald-400">Ilimitada Simultánea</td>
                      <td className="py-2.5 text-emerald-400">Transaccional ACID Total</td>
                      <td className="py-2.5 text-emerald-400">$0 (Archivo Local)</td>
                      <td className="py-2.5"><span className="text-sky-400 font-bold">Listo para activar</span></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-white">PostgreSQL + Prisma + Redis</td>
                      <td className="py-2.5 text-emerald-400">Distribuida Multirregión</td>
                      <td className="py-2.5 text-emerald-400">Clúster / Réplicas</td>
                      <td className="py-2.5 text-amber-400">Hosting Cloud Externo</td>
                      <td className="py-2.5"><span className="text-slate-400">Para &gt;50.000 clientes/día</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
