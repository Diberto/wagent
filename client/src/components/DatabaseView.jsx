import React, { useState, useEffect } from 'react';
import { 
  Database, 
  HardDrive, 
  Server, 
  RefreshCw, 
  Zap, 
  Download, 
  Upload, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Clock, 
  FileText, 
  Layers, 
  Sparkles, 
  Activity, 
  Search,
  Check,
  X,
  Radio,
  Wifi,
  FileDown
} from 'lucide-react';

export default function DatabaseView({ socket = null }) {
  const [dbStatus, setDbStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optResult, setOptResult] = useState(null);
  const [pingLatency, setPingLatency] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'backups' | 'optimize'
  const [collectionSearch, setCollectionSearch] = useState('');

  // Modal Crear Respaldo
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupLabel, setBackupLabel] = useState('manual');
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Modal Confirmar Restauración
  const [restoreModalData, setRestoreModalData] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(null);

  // Subir Respaldo Externo
  const [uploadingBackup, setUploadingBackup] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchStatusOnly, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStatusOnly(), fetchBackups()]);
    } catch (err) {
      console.error('Error cargando estado de la base de datos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchStatusOnly = async () => {
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch (err) {
      console.error('Error obteniendo status de BD:', err);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error('Error obteniendo respaldos:', err);
    }
  };

  const handlePing = async () => {
    try {
      setPinging(true);
      const res = await fetch('/api/database/ping');
      if (res.ok) {
        const data = await res.json();
        setPingLatency(data.latencyMs);
      }
    } catch (err) {
      setPingLatency(-1);
    } finally {
      setPinging(false);
    }
  };

  const handleOptimize = async () => {
    try {
      setOptimizing(true);
      setOptResult(null);
      const res = await fetch('/api/database/optimize', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setOptResult({
          success: true,
          message: data.message || 'Base de datos compactada y optimizada con éxito.',
          details: data
        });
        await fetchData();
      } else {
        setOptResult({ success: false, message: data.error || 'Error al optimizar base de datos' });
      }
    } catch (err) {
      setOptResult({ success: false, message: 'Error de conexión durante la optimización' });
    } finally {
      setOptimizing(false);
    }
  };

  const handleCreateBackup = async (e) => {
    e?.preventDefault();
    try {
      setCreatingBackup(true);
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: backupLabel.trim() || 'manual' })
      });
      if (res.ok) {
        setIsBackupModalOpen(false);
        setBackupLabel('manual');
        await fetchBackups();
        await fetchStatusOnly();
      } else {
        alert('Error al crear el respaldo');
      }
    } catch (err) {
      alert('Error de conexión al generar el respaldo');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = (filename) => {
    window.open(`/api/backups/download/${encodeURIComponent(filename)}`, '_blank');
  };

  const handleRestoreBackup = async () => {
    if (!restoreModalData) return;
    try {
      setRestoring(true);
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: restoreModalData.filename })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRestoreSuccess('Respaldo restaurado exitosamente. Los datos han sido actualizados.');
        setRestoreModalData(null);
        await fetchData();
      } else {
        alert(data.error || 'No se pudo restaurar el respaldo seleccionado.');
      }
    } catch (err) {
      alert('Error de red al intentar restaurar el respaldo.');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente el respaldo "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchBackups();
        await fetchStatusOnly();
      }
    } catch (err) {
      console.error('Error eliminando respaldo:', err);
    }
  };

  const handleUploadExternalBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      alert('Por favor selecciona un archivo de respaldo válido con extensión .json');
      return;
    }

    if (!confirm(`¿Deseas restaurar la base de datos a partir del archivo "${file.name}"? Los datos actuales serán actualizados.`)) {
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      setUploadingBackup(true);
      const res = await fetch('/api/backups/upload-restore', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Respaldo externo cargado y restaurado con éxito.');
        await fetchData();
      } else {
        alert(data.error || 'Error restaurando el respaldo subido.');
      }
    } catch (err) {
      alert('Error de conexión al subir el respaldo.');
    } finally {
      setUploadingBackup(false);
      e.target.value = '';
    }
  };

  const filteredCollections = (dbStatus?.collections || []).filter(c => 
    c.name.toLowerCase().includes(collectionSearch.toLowerCase()) ||
    c.label.toLowerCase().includes(collectionSearch.toLowerCase())
  );

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !dbStatus) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0b141a] text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <Database className="w-8 h-8 text-emerald-500 animate-pulse" />
          <p className="text-sm font-medium">Conectando con motores de Base de Datos y telemetría...</p>
        </div>
      </div>
    );
  }

  const isMongo = dbStatus?.engine === 'mongodb_atlas';

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] text-slate-100 h-full overflow-hidden">
      {/* Header Superior Ejecutivo */}
      <div className="p-4 sm:p-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-white tracking-tight">Centro de Base de Datos & Respaldos</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isMongo 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isMongo ? 'bg-emerald-400 animate-ping' : 'bg-sky-400'}`} />
                {dbStatus?.engineLabel || 'SQLite WAL Nativo'}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                IP Hostinger: 77.37.127.103
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Alta disponibilidad dual: MongoDB Atlas en la nube con respaldo local SQLite WAL de latencia ultra baja.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas del Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePing}
            disabled={pinging}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
            title="Medir latencia de respuesta de la base de datos"
          >
            <Wifi size={14} className={pinging ? 'animate-spin text-sky-400' : 'text-slate-400'} />
            <span>{pingLatency !== null ? `${pingLatency} ms` : 'Probar Ping'}</span>
          </button>

          <button
            onClick={handleOptimize}
            disabled={optimizing}
            className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            <Zap size={14} className={optimizing ? 'animate-bounce text-purple-400' : 'text-purple-400'} />
            <span>{optimizing ? 'Optimizando...' : 'Optimizar BD'}</span>
          </button>

          <button
            onClick={() => setIsBackupModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
          >
            <HardDrive size={14} />
            <span>Crear Respaldo</span>
          </button>

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 rounded-xl text-xs transition-colors"
            title="Actualizar métricas"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
          </button>
        </div>
      </div>

      {/* Alerta de Éxito de Restauración */}
      {restoreSuccess && (
        <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span>{restoreSuccess}</span>
          </div>
          <button onClick={() => setRestoreSuccess(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Alerta de Resultado de Optimización */}
      {optResult && (
        <div className={`mx-4 sm:mx-6 mt-4 p-3.5 rounded-2xl border text-xs flex items-center justify-between animate-in fade-in ${
          optResult.success ? 'bg-purple-950/60 border-purple-500/40 text-purple-200' : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {optResult.success ? <Zap size={16} className="text-purple-400" /> : <AlertTriangle size={16} className="text-rose-400" />}
            <span>{optResult.message}</span>
          </div>
          <button onClick={() => setOptResult(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sub-Pestañas de Navegación */}
      <div className="px-4 sm:px-6 pt-3 border-b border-slate-800/60 bg-slate-900/20 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
          }`}
        >
          <Layers size={14} />
          <span>Estado & Colecciones</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-300 font-mono">
            {dbStatus?.collections?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'backups'
              ? 'border-emerald-500 text-emerald-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
          }`}
        >
          <HardDrive size={14} />
          <span>Copias de Respaldo</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-300 font-mono">
            {backups.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('optimize')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'optimize'
              ? 'border-purple-500 text-purple-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
          }`}
        >
          <Zap size={14} />
          <span>Mantenimiento & Desfragmentación</span>
        </button>
      </div>

      {/* Contenido Principal con Scroll */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
        {/* PESTAÑA 1: ESTADO Y COLECCIONES */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Tarjetas de Métricas de Almacenamiento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Motor y Conexión */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Motor de Base de Datos</span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Database size={16} />
                  </div>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">
                  {isMongo ? 'MongoDB Atlas' : 'SQLite WAL'}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Hostinger IP:</span>
                  <span className="font-mono text-emerald-400 font-semibold">77.37.127.103</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Base de datos:</span>
                  <span className="font-mono text-slate-200">{dbStatus?.hostinger?.databaseName || 'wagent'}</span>
                </div>
              </div>

              {/* Card 2: Tamaño de Base de Datos */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Peso Base de Datos</span>
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                    <HardDrive size={16} />
                  </div>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">
                  {dbStatus?.storage?.sqliteSizeFormatted || '1.20 MB'}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>WAL Journal:</span>
                  <span className="font-mono text-sky-400 font-semibold">{formatBytes(dbStatus?.storage?.walSizeBytes)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Modo Transaccional:</span>
                  <span className="text-slate-200 font-semibold">WAL (Ultra Rápido)</span>
                </div>
              </div>

              {/* Card 3: Multimedia & Audios */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Multimedia & Audios</span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <FileText size={16} />
                  </div>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">
                  {dbStatus?.storage?.mediaSizeFormatted || '0.00 MB'}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Archivos almacenados:</span>
                  <span className="font-mono text-amber-400 font-semibold">{dbStatus?.storage?.mediaCount || 0} archivos</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Audios WhatsApp:</span>
                  <span className="text-slate-200">PTT Opus & MP3</span>
                </div>
              </div>

              {/* Card 4: Respaldos Guardados */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Respaldos en Servidor</span>
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">
                  {backups.length} Disponibles
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Peso total respaldos:</span>
                  <span className="font-mono text-purple-400 font-semibold">{formatBytes(dbStatus?.storage?.backupsTotalSizeBytes)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Último respaldo:</span>
                  <span className="text-slate-200 truncate max-w-[120px]" title={dbStatus?.lastBackup?.label}>
                    {dbStatus?.lastBackup ? new Date(dbStatus.lastBackup.createdAt).toLocaleDateString() : 'Ninguno'}
                  </span>
                </div>
              </div>
            </div>

            {/* Listado Detallado de Colecciones y Tablas */}
            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers size={16} className="text-emerald-400" />
                    <span>Tablas & Colecciones del Sistema</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mapeo de registros estructurados sincronizados entre memoria, disco y MongoDB Atlas.
                  </p>
                </div>

                <div className="relative min-w-[240px]">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                    placeholder="Filtrar tablas o colecciones..."
                    className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredCollections.map((col, idx) => (
                  <div
                    key={col.name || idx}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                        <Database size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 truncate">{col.label}</div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          table: <span className="text-slate-400">{col.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-base font-bold font-mono text-emerald-400">
                        {col.count.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        Registros
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: RESPALDOS Y RESTAURACIÓN */}
        {activeTab === 'backups' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Banner de Acciones de Respaldo */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-teal-950/40 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  <span>Protección Integral & Respaldos JSON</span>
                </h3>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  Generá copias completas de clientes, pedidos, cortes, configuraciones y recetas. Podés descargarlas a tu máquina o restaurarlas en cualquier momento con 1 solo clic.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className={`px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  uploadingBackup ? 'opacity-50 cursor-not-allowed' : ''
                }`}>
                  <Upload size={14} className={uploadingBackup ? 'animate-bounce text-sky-400' : 'text-sky-400'} />
                  <span>{uploadingBackup ? 'Restaurando...' : 'Subir Respaldo'}</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleUploadExternalBackup}
                    disabled={uploadingBackup}
                  />
                </label>

                <button
                  onClick={() => setIsBackupModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  <HardDrive size={14} />
                  <span>+ Nuevo Respaldo</span>
                </button>
              </div>
            </div>

            {/* Listado de Respaldos Existentes */}
            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock size={16} className="text-emerald-400" />
                  <span>Historial de Respaldos ({backups.length})</span>
                </h3>
                <button
                  onClick={fetchBackups}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  <RefreshCw size={12} />
                  <span>Refrescar</span>
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-3">
                  <HardDrive size={36} className="mx-auto text-slate-600 stroke-[1.5]" />
                  <p className="text-xs">No hay copias de respaldo generadas todavía.</p>
                  <button
                    onClick={() => setIsBackupModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all"
                  >
                    Crear el Primer Respaldo
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {backups.map((bkp) => (
                    <div
                      key={bkp.filename}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-800/30 px-3 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
                          <FileDown size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-100 font-mono truncate">{bkp.filename}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {bkp.label || 'manual'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3 flex-wrap">
                            <span>{new Date(bkp.createdAt).toLocaleString()}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-300">{formatBytes(bkp.sizeBytes)}</span>
                            {bkp.stats && (
                              <>
                                <span>•</span>
                                <span className="text-slate-400">
                                  {bkp.stats.totalLeads || 0} leads, {bkp.stats.totalProducts || 0} productos, {bkp.stats.totalMessages || 0} mensajes
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Acciones del Respaldo */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadBackup(bkp.filename)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700/80"
                          title="Descargar archivo JSON a tu equipo"
                        >
                          <Download size={13} className="text-emerald-400" />
                          <span>Descargar</span>
                        </button>

                        <button
                          onClick={() => setRestoreModalData(bkp)}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-500/30"
                          title="Restaurar base de datos a este punto"
                        >
                          <RotateCcwIcon size={13} className="text-amber-400" />
                          <span>Restaurar</span>
                        </button>

                        <button
                          onClick={() => handleDeleteBackup(bkp.filename)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Eliminar este respaldo"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 3: MANTENIMIENTO Y OPTIMIZACIÓN */}
        {activeTab === 'optimize' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-950 border border-purple-500/30 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap size={18} className="text-purple-400" />
                    <span>Optimizador de Rendimiento & Compactación de Datos</span>
                  </h3>
                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Esta herramienta realiza una desfragmentación física de las tablas SQLite con <code className="text-purple-300 bg-purple-950/80 px-1 py-0.5 rounded font-mono">VACUUM</code>, sincroniza los índices analíticos con <code className="text-purple-300 bg-purple-950/80 px-1 py-0.5 rounded font-mono">ANALYZE</code>, trunca los registros de escritura Write-Ahead Logging (WAL) y purga archivos temporales huérfanos de audio e imágenes sin afectar registros de clientes ni mensajes.
                  </p>
                </div>

                <button
                  onClick={handleOptimize}
                  disabled={optimizing}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 flex-shrink-0"
                >
                  <Zap size={15} className={optimizing ? 'animate-spin' : ''} />
                  <span>{optimizing ? 'Ejecutando Optimización...' : 'Ejecutar Optimización Completa'}</span>
                </button>
              </div>

              {/* Checklist de lo que hace */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span>Desfragmentación Física</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Reorganiza páginas de disco y reduce el peso total de los archivos .db y .db-wal.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span>Indexación & ANALYZE</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Calcula estadísticas de los índices para que las consultas de catálogo y POS vuelen en 1ms.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span>Purga de Temporales</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Elimina buffers temporales huérfanos generados durante conversiones de audio TTS/STT.
                  </p>
                </div>
              </div>
            </div>

            {/* Detalles del Último Resultado */}
            {optResult?.details && (
              <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Métricas de la Última Optimización
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Espacio Liberado</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                      {optResult.details.sqlite?.freedKb || 0} KB
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Duración Operación</div>
                    <div className="text-base font-bold font-mono text-purple-400 mt-0.5">
                      {optResult.details.sqlite?.durationMs || 0} ms
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Temporales Purgados</div>
                    <div className="text-base font-bold font-mono text-sky-400 mt-0.5">
                      {optResult.details.cleanedMedia?.files || 0} archivos
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px]">Estado del Motor</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">
                      100% Saludable
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: CREAR RESPALDO */}
      {isBackupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HardDrive size={16} className="text-emerald-400" />
                <span>Generar Nueva Copia de Respaldo</span>
              </h3>
              <button onClick={() => setIsBackupModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              El sistema creará un paquete JSON seguro con el estado actual de todas las tablas y colecciones.
            </p>

            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Etiqueta Identificatoria
                </label>
                <input
                  type="text"
                  value={backupLabel}
                  onChange={(e) => setBackupLabel(e.target.value)}
                  placeholder="ej: manual, antes_del_cierre, promociones_navidad"
                  className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBackupModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingBackup}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  {creatingBackup ? 'Generando...' : 'Crear Respaldo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR RESTAURACIÓN */}
      {restoreModalData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">¿Restaurar Copia de Respaldo?</h3>
                <p className="text-[11px] text-slate-400">Esta acción reemplazará los datos actuales con este punto en el tiempo.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 font-mono text-slate-300">
              <div><strong>Archivo:</strong> {restoreModalData.filename}</div>
              <div><strong>Fecha:</strong> {new Date(restoreModalData.createdAt).toLocaleString()}</div>
              <div><strong>Tamaño:</strong> {formatBytes(restoreModalData.sizeBytes)}</div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestoreModalData(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={restoring}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-600/20"
              >
                {restoring ? 'Restaurando Datos...' : 'Confirmar Restauración'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RotateCcwIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
