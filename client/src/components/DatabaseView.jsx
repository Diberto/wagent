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
  FileDown,
  ArrowLeftRight,
  ArrowRight,
  Globe,
  Sliders,
  CheckCheck,
  Send
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
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'backups' | 'optimize' | 'migration'
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

  // Configuración & Migración Multi-Motor
  const [dbConfig, setDbConfig] = useState(null);
  const [selectedTargetEngine, setSelectedTargetEngine] = useState('mongodb');
  const [targetConfig, setTargetConfig] = useState({
    mongodbUri: 'mongodb://77.37.127.103:27017/wagent',
    mongodbDbName: 'wagent',
    supabaseUrl: '',
    firebaseProjectId: '',
    mysqlUri: ''
  });
  const [testingConn, setTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [switchingEngine, setSwitchingEngine] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  useEffect(() => {
    fetchData();
    fetchDbConfig();

    if (socket) {
      const handleMigProgress = (data) => {
        setMigrationProgress(data);
      };
      socket.on('database:migration:progress', handleMigProgress);
      return () => {
        socket.off('database:migration:progress', handleMigProgress);
      };
    }

    const interval = setInterval(fetchStatusOnly, 15000);
    return () => clearInterval(interval);
  }, [socket]);

  const fetchDbConfig = async () => {
    try {
      const res = await fetch('/api/database/config');
      if (res.ok) {
        const data = await res.json();
        setDbConfig(data.config);
        if (data.config?.mongodb?.uri) {
          setTargetConfig(prev => ({ ...prev, mongodbUri: data.config.mongodb.uri, mongodbDbName: data.config.mongodb.dbName || 'wagent' }));
        }
        if (data.config?.supabase?.connectionString) {
          setTargetConfig(prev => ({ ...prev, supabaseUrl: data.config.supabase.connectionString }));
        }
        if (data.config?.firebase?.projectId) {
          setTargetConfig(prev => ({ ...prev, firebaseProjectId: data.config.firebase.projectId }));
        }
        if (data.config?.mysql?.uri) {
          setTargetConfig(prev => ({ ...prev, mysqlUri: data.config.mysql.uri }));
        }
      }
    } catch (e) {
      console.warn('Error cargando config de DB:', e);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setConnTestResult(null);
    try {
      let configPayload = {};
      if (selectedTargetEngine === 'mongodb') {
        configPayload = { uri: targetConfig.mongodbUri, dbName: targetConfig.mongodbDbName };
      } else if (selectedTargetEngine === 'supabase') {
        configPayload = { connectionString: targetConfig.supabaseUrl };
      } else if (selectedTargetEngine === 'firebase') {
        configPayload = { projectId: targetConfig.firebaseProjectId };
      } else if (selectedTargetEngine === 'mysql') {
        configPayload = { uri: targetConfig.mysqlUri };
      }

      const res = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedTargetEngine, config: configPayload })
      });
      const data = await res.json();
      setConnTestResult(data);
    } catch (err) {
      setConnTestResult({ success: false, error: err.message });
    } finally {
      setTestingConn(false);
    }
  };

  const handleStartMigration = async () => {
    if (!window.confirm(`¿Iniciar migración transparente hacia ${selectedTargetEngine.toUpperCase()}? Se transferirán productos, clientes, pedidos, mensajes y agentes sin pérdida de información.`)) {
      return;
    }

    setMigrating(true);
    setMigrationProgress({ percentage: 5, message: 'Iniciando conexión con motor destino...' });
    setMigrationResult(null);

    try {
      let configPayload = {};
      if (selectedTargetEngine === 'mongodb') {
        configPayload = { uri: targetConfig.mongodbUri, dbName: targetConfig.mongodbDbName };
      } else if (selectedTargetEngine === 'supabase') {
        configPayload = { connectionString: targetConfig.supabaseUrl };
      } else if (selectedTargetEngine === 'firebase') {
        configPayload = { projectId: targetConfig.firebaseProjectId };
      } else if (selectedTargetEngine === 'mysql') {
        configPayload = { uri: targetConfig.mysqlUri };
      } else if (selectedTargetEngine === 'sqlite') {
        configPayload = {};
      }

      const res = await fetch('/api/database/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: selectedTargetEngine, targetConfig: configPayload })
      });
      const data = await res.json();
      if (data.success) {
        setMigrationResult({ success: true, stats: data.stats });
        await fetchData();
        await fetchDbConfig();
      } else {
        setMigrationResult({ success: false, error: data.error });
      }
    } catch (err) {
      setMigrationResult({ success: false, error: err.message });
    } finally {
      setMigrating(false);
    }
  };

  const handleSaveDbConfig = async () => {
    setSavingConfig(true);
    setConfigSaveSuccess(false);
    try {
      const payload = {
        mongodb: { uri: targetConfig.mongodbUri, dbName: targetConfig.mongodbDbName },
        supabase: { connectionString: targetConfig.supabaseUrl },
        firebase: { projectId: targetConfig.firebaseProjectId },
        mysql: { uri: targetConfig.mysqlUri }
      };
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setConfigSaveSuccess(true);
        setTimeout(() => setConfigSaveSuccess(false), 3000);
        await fetchDbConfig();
      } else {
        alert(data.error || 'Error al guardar la configuración');
      }
    } catch (e) {
      alert('Error guardando configuración: ' + e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSwitchEngine = async (engine) => {
    setSwitchingEngine(true);
    try {
      const res = await fetch('/api/database/switch-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine })
      });
      const data = await res.json();
      if (data.success) {
        await fetchDbConfig();
        await fetchData();
      }
    } catch (err) {
      alert('Error cambiando motor: ' + err.message);
    } finally {
      setSwitchingEngine(false);
    }
  };

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

        <button
          onClick={() => setActiveTab('migration')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'migration'
              ? 'border-sky-500 text-sky-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
          }`}
        >
          <ArrowLeftRight size={14} />
          <span>Configurar & Migrar Motores</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-sky-950 border border-sky-500/40 text-sky-300 font-mono uppercase">
            {dbConfig?.activeEngine || 'SQLITE'}
          </span>
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

        {/* PESTAÑA 4: CONFIGURACIÓN & MIGRACIÓN MULTI-MOTOR */}
        {activeTab === 'migration' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Banner de Estado del Motor Activo */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 border border-sky-500/20 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 flex-shrink-0">
                  <Database size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Motor Activo en Tiempo Real</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5"></span>
                      EN LÍNEA
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white capitalize flex items-center gap-2 mt-0.5">
                    {dbConfig?.activeEngine === 'sqlite' && 'SQLite WAL (Almacenamiento Local de Alta Velocidad)'}
                    {dbConfig?.activeEngine === 'mongodb' && 'MongoDB (Atlas / Hostinger VPS Distribuido)'}
                    {dbConfig?.activeEngine === 'supabase' && 'Supabase (PostgreSQL Cloud Realtime)'}
                    {dbConfig?.activeEngine === 'firebase' && 'Firebase Firestore (Google Cloud Serverless)'}
                    {dbConfig?.activeEngine === 'mysql' && 'MySQL / MariaDB (Enterprise SQL)'}
                    {!dbConfig?.activeEngine && 'SQLite WAL'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Todas las lecturas y escrituras del CRM, agentes de IA, pedidos y WhatsApp se procesan a través de este motor.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {configSaveSuccess && (
                  <span className="px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 size={13} />
                    Configuración Guardada
                  </span>
                )}
                <button
                  onClick={handleSaveDbConfig}
                  disabled={savingConfig}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-2"
                >
                  <FileText size={13} />
                  <span>{savingConfig ? 'Guardando...' : 'Guardar Credenciales'}</span>
                </button>
              </div>
            </div>

            {/* Selector de Motor Target (Cards) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-sky-400" />
                  <span>Seleccionar Motor para Configurar o Migrar</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                  Haz clic en un motor para editar credenciales o migrar datos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  {
                    id: 'mongodb',
                    name: 'MongoDB',
                    badge: 'NoSQL / VPS',
                    desc: 'Atlas o VPS dedicado (Hostinger 77.37.127.103)',
                    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-300',
                    iconBg: 'bg-emerald-500/20 text-emerald-400'
                  },
                  {
                    id: 'supabase',
                    name: 'Supabase',
                    badge: 'PostgreSQL',
                    desc: 'PostgreSQL en la nube, pgvector y realtime',
                    color: 'from-teal-500/20 to-cyan-500/10 border-teal-500/40 text-teal-300',
                    iconBg: 'bg-teal-500/20 text-teal-400'
                  },
                  {
                    id: 'firebase',
                    name: 'Firebase',
                    badge: 'Firestore',
                    desc: 'Google Cloud NoSQL autoescalable serverless',
                    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-300',
                    iconBg: 'bg-amber-500/20 text-amber-400'
                  },
                  {
                    id: 'mysql',
                    name: 'MySQL',
                    badge: 'Relacional SQL',
                    desc: 'Estándar empresarial para ERP y contabilidad',
                    color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/40 text-blue-300',
                    iconBg: 'bg-blue-500/20 text-blue-400'
                  },
                  {
                    id: 'sqlite',
                    name: 'SQLite WAL',
                    badge: 'Local Zero-Ops',
                    desc: 'Archivo local ultra-rápido de cero dependencias',
                    color: 'from-purple-500/20 to-slate-500/10 border-purple-500/40 text-purple-300',
                    iconBg: 'bg-purple-500/20 text-purple-400'
                  }
                ].map(engine => {
                  const isSelected = selectedTargetEngine === engine.id;
                  const isActive = (dbConfig?.activeEngine || 'sqlite') === engine.id;

                  return (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => {
                        setSelectedTargetEngine(engine.id);
                        setConnTestResult(null);
                      }}
                      className={`p-4 rounded-2xl text-left transition-all border relative flex flex-col justify-between ${
                        isSelected
                          ? `bg-gradient-to-b ${engine.color} shadow-lg ring-2 ring-sky-500/50`
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          ACTIVO
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${engine.iconBg}`}>
                            <Database size={15} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{engine.name}</div>
                            <div className="text-[10px] text-slate-400">{engine.badge}</div>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 mt-1">
                          {engine.desc}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                        <span className={isSelected ? 'text-sky-300 font-semibold' : 'text-slate-500'}>
                          {isSelected ? 'Configurando' : 'Seleccionar'}
                        </span>
                        {isSelected && <Check size={12} className="text-sky-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Panel de Configuración del Motor Seleccionado */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Formulario de Conexión */}
              <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Globe size={16} className="text-sky-400" />
                      <span>Parámetros de Conexión: <span className="uppercase text-sky-400">{selectedTargetEngine}</span></span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ingresa las credenciales para probar la conectividad y transferir tus datos.
                    </p>
                  </div>

                  {dbConfig?.activeEngine !== selectedTargetEngine && (
                    <button
                      onClick={() => handleSwitchEngine(selectedTargetEngine)}
                      disabled={switchingEngine}
                      className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                    >
                      <ArrowLeftRight size={13} className={switchingEngine ? 'animate-spin' : ''} />
                      <span>{switchingEngine ? 'Cambiando...' : 'Activar como Motor Principal'}</span>
                    </button>
                  )}
                </div>

                {/* Campos Específicos por Motor */}
                {selectedTargetEngine === 'mongodb' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        URI de Conexión MongoDB
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetConfig(prev => ({
                            ...prev,
                            mongodbUri: 'mongodb://admin:WAgent2026@77.37.127.103:27017/wagent?authSource=admin',
                            mongodbDbName: 'wagent'
                          }));
                        }}
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline font-mono"
                      >
                        Aplicar VPS Hostinger (77.37.127.103)
                      </button>
                    </div>
                    <input
                      type="text"
                      value={targetConfig.mongodbUri}
                      onChange={e => setTargetConfig({ ...targetConfig, mongodbUri: e.target.value })}
                      placeholder="mongodb://usuario:contraseña@servidor:27017/wagent o mongodb+srv://..."
                      className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />

                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Nombre de la Base de Datos
                      </label>
                      <input
                        type="text"
                        value={targetConfig.mongodbDbName}
                        onChange={e => setTargetConfig({ ...targetConfig, mongodbDbName: e.target.value })}
                        placeholder="wagent"
                        className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}

                {selectedTargetEngine === 'supabase' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        Connection String PostgreSQL (Supabase)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetConfig(prev => ({
                            ...prev,
                            supabaseUrl: 'postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'
                          }));
                        }}
                        className="text-[11px] text-teal-400 hover:text-teal-300 underline font-mono"
                      >
                        Cargar Plantilla Supabase
                      </button>
                    </div>
                    <input
                      type="text"
                      value={targetConfig.supabaseUrl}
                      onChange={e => setTargetConfig({ ...targetConfig, supabaseUrl: e.target.value })}
                      placeholder="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
                      className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                    />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      💡 Puedes obtener este connection string en tu dashboard de Supabase en <strong>Project Settings → Database → Connection string (URI)</strong>.
                    </p>
                  </div>
                )}

                {selectedTargetEngine === 'firebase' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Google Cloud / Firebase Project ID
                    </label>
                    <input
                      type="text"
                      value={targetConfig.firebaseProjectId}
                      onChange={e => setTargetConfig({ ...targetConfig, firebaseProjectId: e.target.value })}
                      placeholder="ej: wagent-crm-prod"
                      className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      💡 La sincronización utiliza la API REST nativa de Google Cloud Firestore. Cada colección del CRM se creará como una colección raíz en Firestore.
                    </p>
                  </div>
                )}

                {selectedTargetEngine === 'mysql' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-300 block">
                      URI de Conexión MySQL / MariaDB
                    </label>
                    <input
                      type="text"
                      value={targetConfig.mysqlUri}
                      onChange={e => setTargetConfig({ ...targetConfig, mysqlUri: e.target.value })}
                      placeholder="mysql://root:password@127.0.0.1:3306/wagent"
                      className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {selectedTargetEngine === 'sqlite' && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <HardDrive size={15} className="text-purple-400" />
                      <span>Motor SQLite WAL Local</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      El motor SQLite local no requiere servidor externo. Guarda todas las colecciones en <code>data/wagent.db</code> con modo WAL (Write-Ahead Logging) habilitado para máxima concurrencia y persistencia transaccional.
                    </p>
                  </div>
                )}

                {/* Botón Probar Conexión */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConn || selectedTargetEngine === 'sqlite'}
                    className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/20 transition-all flex items-center gap-2"
                  >
                    <Radio size={14} className={testingConn ? 'animate-pulse text-white' : ''} />
                    <span>{testingConn ? 'Midiendo Latencia & Handshake...' : 'Probar Conexión en Vivo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDbConfig}
                    disabled={savingConfig}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <CheckCheck size={14} />
                    <span>Guardar Parámetros</span>
                  </button>
                </div>

                {/* Resultado del Test de Conexión */}
                {connTestResult && (
                  <div className={`p-4 rounded-2xl border text-xs animate-in fade-in ${
                    connTestResult.success
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        {connTestResult.success ? (
                          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-sm">
                            {connTestResult.success ? 'Conexión Exitosa y Validada' : 'Error de Conexión'}
                          </div>
                          <div className="mt-1 text-slate-300">
                            {connTestResult.message || connTestResult.error}
                          </div>
                          {connTestResult.pingMs !== undefined && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                              <Wifi size={12} />
                              <span>Latencia medidor: {connTestResult.pingMs} ms</span>
                            </div>
                          )}
                          {connTestResult.collections && (
                            <div className="mt-1 text-[11px] text-slate-400 font-mono">
                              Colecciones remotas encontradas: {connTestResult.collections.join(', ') || 'Ninguna (BD Vacía)'}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setConnTestResult(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Asistente de Migración */}
              <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <ArrowLeftRight size={18} className="text-indigo-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Migración Transparente & Frictionless
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Copia íntegra de colecciones sin interrumpir la operación
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Origen</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">
                          SQLite WAL (Local)
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-500" />
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">Destino</div>
                        <div className="text-xs font-bold text-sky-300 mt-0.5 uppercase">
                          {selectedTargetEngine}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                        Colecciones a Sincronizar (13):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'leads', 'orders', 'messages', 'products',
                          'agents', 'users', 'settings', 'branches',
                          'drivers', 'shifts', 'templates', 'coupons', 'calls'
                        ].map(col => (
                          <span
                            key={col}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-slate-800/80 border border-slate-700/60 text-slate-300"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Estado de Migración en Progreso */}
                {migrating && (
                  <div className="p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-semibold text-sky-300">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw size={13} className="animate-spin text-sky-400" />
                        <span>Migrando Datos...</span>
                      </span>
                      <span className="font-mono text-sm">{migrationProgress?.percentage || 0}%</span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${migrationProgress?.percentage || 0}%` }}
                      ></div>
                    </div>

                    <div className="text-[11px] text-slate-300 font-mono truncate">
                      {migrationProgress?.message || 'Procesando...'}
                    </div>
                  </div>
                )}

                {/* Resultado de Migración */}
                {migrationResult && (
                  <div className={`p-4 rounded-2xl border text-xs animate-in fade-in ${
                    migrationResult.success
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      {migrationResult.success ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-rose-400" />}
                      <span>{migrationResult.success ? '¡Migración Finalizada Exitosamente!' : 'Error en la Migración'}</span>
                    </div>
                    {migrationResult.error && (
                      <p className="mt-1 text-slate-300">{migrationResult.error}</p>
                    )}
                    {migrationResult.stats && (
                      <div className="mt-2 text-[11px] space-y-1">
                        <div className="text-slate-300">Total registros migrados: <strong>{migrationResult.stats.totalCopied || 0}</strong></div>
                        <div className="text-slate-400 font-mono">Tiempo: {migrationResult.stats.durationMs || 0} ms</div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartMigration}
                  disabled={migrating || selectedTargetEngine === 'sqlite'}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-xl shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={15} />
                  <span>{migrating ? 'Migración en Progreso...' : `Iniciar Migración a ${selectedTargetEngine.toUpperCase()}`}</span>
                </button>
              </div>
            </div>
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
