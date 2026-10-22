import React, { useState, useEffect } from 'react';
import {
  Key,
  Cpu,
  Code2,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Terminal,
  Boxes,
  PackageCheck,
  Users,
  Store,
  Receipt,
  ArrowRightLeft,
  Sparkles,
  Bot,
  Play,
  Send,
  Globe,
  Activity,
  CheckCircle2,
  AlertCircle,
  X,
  Sliders,
  Radio,
  Layers
} from 'lucide-react';

export default function ApiMcpHubView({ currentUser }) {
  const [activeSubTab, setActiveSubTab] = useState('connectors'); // 'connectors' | 'keys' | 'mcp' | 'logs' | 'rest'
  
  // Claves API
  const [keys, setKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  // Servidor MCP Local
  const [mcpInfo, setMcpInfo] = useState(null);

  // Conectores Salientes & Clientes MCP
  const [connectors, setConnectors] = useState([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [isConnectorModalOpen, setIsConnectorModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState(null);
  const [testingConnectorId, setTestingConnectorId] = useState(null);
  const [testConnectorResult, setTestConnectorResult] = useState(null);
  const [syncingAction, setSyncingAction] = useState(null); // { id, action }

  // Modal para Invocar Herramienta MCP Remota
  const [remoteMcpModal, setRemoteMcpModal] = useState(null); // { connector, tool }
  const [remoteToolArgs, setRemoteToolArgs] = useState('{}');
  const [callingRemoteTool, setCallingRemoteTool] = useState(false);
  const [remoteToolResult, setRemoteToolResult] = useState(null);

  // Logs de Conectores
  const [connectorLogs, setConnectorLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Formulario de Conector
  const [connectorForm, setConnectorForm] = useState({
    name: '',
    type: 'rest', // 'rest' | 'mcp_sse' | 'mcp_stdio'
    enabled: true,
    description: '',
    baseUrl: '',
    authType: 'apiKey', // 'none' | 'apiKey' | 'bearer' | 'basic'
    apiKeyHeader: 'X-API-Key',
    authToken: '',
    webhookUrl: '',
    sseUrl: '',
    command: '',
    args: '',
    syncCatalog: true,
    syncStock: true,
    syncOrders: true,
    syncDirection: 'bidirectional',
    webhooks: ['order.created'],
    autoSyncIntervalMinutes: 15
  });

  // Live REST tester state
  const [testEndpoint, setTestEndpoint] = useState('/api/v1/external/summary');
  const [testResult, setTestResult] = useState(null);
  const [testingLoading, setTestingLoading] = useState(false);

  // Cargas iniciales
  const loadKeys = async () => {
    try {
      setLoadingKeys(true);
      const res = await fetch('/api/v1/external/keys');
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        setKeys(data.keys);
      }
    } catch (e) {
      console.error('Error cargando claves API:', e);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadMcpInfo = async () => {
    try {
      const res = await fetch('/mcp/info');
      const data = await res.json();
      setMcpInfo(data);
    } catch (e) {
      console.error('Error cargando estado MCP:', e);
    }
  };

  const loadConnectors = async () => {
    try {
      setLoadingConnectors(true);
      const res = await fetch('/api/connectors');
      const data = await res.json();
      if (data.success && Array.isArray(data.connectors)) {
        setConnectors(data.connectors);
      }
    } catch (e) {
      console.error('Error cargando conectores:', e);
    } finally {
      setLoadingConnectors(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await fetch('/api/connectors/logs?limit=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setConnectorLogs(data.logs);
      }
    } catch (e) {
      console.error('Error cargando logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadKeys();
    loadMcpInfo();
    loadConnectors();
    loadLogs();
  }, []);

  const handleCopy = (text, id = 'generic') => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2500);
  };

  // ==========================================
  // GESTIÓN DE CLAVES
  // ==========================================
  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      setCreatingKey(true);
      const res = await fetch('/api/v1/external/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          createdBy: currentUser?.name || 'Admin'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsNewKeyModalOpen(false);
        setNewKeyName('');
        loadKeys();
      } else {
        alert(data.error || 'Error al generar clave');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleKey = async (id) => {
    try {
      const res = await fetch(`/api/v1/external/keys/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) loadKeys();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleDeleteKey = async (id) => {
    if (!confirm('¿Desea revocar y eliminar permanentemente esta clave API?')) return;
    try {
      const res = await fetch(`/api/v1/external/keys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) loadKeys();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // ==========================================
  // GESTIÓN DE CONECTORES SALIENTES
  // ==========================================
  const openNewConnectorModal = () => {
    setEditingConnector(null);
    setConnectorForm({
      name: '',
      type: 'rest',
      enabled: true,
      description: '',
      baseUrl: '',
      authType: 'apiKey',
      apiKeyHeader: 'X-API-Key',
      authToken: '',
      webhookUrl: '',
      sseUrl: '',
      command: '',
      args: '',
      syncCatalog: true,
      syncStock: true,
      syncOrders: true,
      syncDirection: 'bidirectional',
      webhooks: ['order.created', 'stock.updated'],
      autoSyncIntervalMinutes: 15
    });
    setIsConnectorModalOpen(true);
  };

  const openEditConnectorModal = (conn) => {
    setEditingConnector(conn);
    setConnectorForm({
      name: conn.name || '',
      type: conn.type || 'rest',
      enabled: conn.enabled !== false,
      description: conn.description || '',
      baseUrl: conn.baseUrl || '',
      authType: conn.authType || 'apiKey',
      apiKeyHeader: conn.apiKeyHeader || 'X-API-Key',
      authToken: conn.authToken || '',
      webhookUrl: conn.webhookUrl || '',
      sseUrl: conn.sseUrl || '',
      command: conn.command || '',
      args: Array.isArray(conn.args) ? conn.args.join(' ') : (conn.args || ''),
      syncCatalog: Boolean(conn.syncCatalog),
      syncStock: Boolean(conn.syncStock),
      syncOrders: Boolean(conn.syncOrders),
      syncDirection: conn.syncDirection || 'bidirectional',
      webhooks: Array.isArray(conn.webhooks) ? conn.webhooks : ['order.created'],
      autoSyncIntervalMinutes: Number(conn.autoSyncIntervalMinutes) || 0
    });
    setIsConnectorModalOpen(true);
  };

  const handleSaveConnector = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...connectorForm,
        args: connectorForm.args ? connectorForm.args.split(' ').map(s => s.trim()).filter(Boolean) : []
      };

      const url = editingConnector ? `/api/connectors/${editingConnector.id}` : '/api/connectors';
      const method = editingConnector ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setIsConnectorModalOpen(false);
        loadConnectors();
        loadLogs();
      } else {
        alert(data.error || 'Error al guardar conector');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleDeleteConnector = async (id) => {
    if (!confirm('¿Desea eliminar esta conexión hacia el sistema externo?')) return;
    try {
      const res = await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadConnectors();
        loadLogs();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleTestConnector = async (id) => {
    try {
      setTestingConnectorId(id);
      setTestConnectorResult(null);
      const res = await fetch(`/api/connectors/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestConnectorResult({ id, ...data });
      loadConnectors();
      loadLogs();
    } catch (e) {
      setTestConnectorResult({ id, success: false, error: e.message });
    } finally {
      setTestingConnectorId(null);
    }
  };

  const handleSyncConnector = async (id, action) => {
    try {
      setSyncingAction({ id, action });
      const res = await fetch(`/api/connectors/${id}/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        alert(`¡Sincronización '${action}' ejecutada con éxito!\n${JSON.stringify(data.result, null, 2)}`);
      } else {
        alert(`Error al sincronizar: ${data.error}`);
      }
      loadConnectors();
      loadLogs();
    } catch (e) {
      alert('Error de sincronización: ' + e.message);
    } finally {
      setSyncingAction(null);
    }
  };

  // Invocación de herramientas remotas en el otro sistema
  const handleOpenRemoteMcpModal = (connector, tool) => {
    setRemoteMcpModal({ connector, tool });
    setRemoteToolArgs('{}');
    setRemoteToolResult(null);
  };

  const handleExecuteRemoteMcpTool = async () => {
    if (!remoteMcpModal) return;
    try {
      setCallingRemoteTool(true);
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(remoteToolArgs);
      } catch (err) {
        alert('El JSON de argumentos no es válido: ' + err.message);
        setCallingRemoteTool(false);
        return;
      }

      const res = await fetch(`/api/connectors/${remoteMcpModal.connector.id}/call-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: remoteMcpModal.tool.name,
          arguments: parsedArgs
        })
      });
      const data = await res.json();
      setRemoteToolResult(data);
      loadLogs();
    } catch (e) {
      setRemoteToolResult({ error: e.message });
    } finally {
      setCallingRemoteTool(false);
    }
  };

  // REST Tester
  const runLiveTest = async (endpointUrl) => {
    const activeKey = keys.find(k => k.active)?.fullKey || keys[0]?.fullKey;
    if (!activeKey) {
      alert('Genere al menos una clave API activa para probar');
      return;
    }

    try {
      setTestingLoading(true);
      setTestResult(null);
      const res = await fetch(endpointUrl, {
        headers: { 'X-API-Key': activeKey }
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ error: e.message });
    } finally {
      setTestingLoading(false);
    }
  };

  const firstActiveKey = keys.find(k => k.active)?.fullKey || 'TU_CLAVE_API';
  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        wagent_carniceria: {
          command: 'node',
          args: ['C:/Users/srlom/OneDrive/Documentos/WAgent/server/mcp-server.js']
        }
      }
    },
    null,
    2
  );

  return (
    <div className="flex flex-col h-full bg-[#0b141a] text-slate-100 overflow-hidden">
      {/* Top Header */}
      <header className="px-6 py-4 bg-[#111b21] border-b border-[#202c33] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-950/50">
            <Cpu size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white">Conectividad Total: API REST & Servidor/Cliente MCP</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                BIDIRECCIONAL ACTIVO
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Conecta WAgent con sistemas externos (ERP, AFIP, Tango, SAP, Tiendas) y orquesta Agentes de IA autónomos (MCP)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {activeSubTab === 'connectors' && (
            <button
              onClick={openNewConnectorModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition active:scale-95"
            >
              <Plus size={16} />
              <span>Conectar Nuevo Sistema</span>
            </button>
          )}

          {activeSubTab === 'keys' && (
            <button
              onClick={() => setIsNewKeyModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-950/40 transition active:scale-95"
            >
              <Plus size={16} />
              <span>Generar Clave API</span>
            </button>
          )}
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <div className="px-6 bg-[#111b21] border-b border-[#202c33] flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('connectors')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeSubTab === 'connectors'
              ? 'border-emerald-500 text-emerald-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Radio size={15} />
          <span>Sistemas Externos & Clientes MCP ({connectors.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('keys')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeSubTab === 'keys'
              ? 'border-blue-500 text-blue-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Key size={15} />
          <span>Claves API Entrantes ({keys.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('mcp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeSubTab === 'mcp'
              ? 'border-purple-500 text-purple-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Bot size={15} />
          <span>Servidor MCP Local (Para Claude/Cursor)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeSubTab === 'logs'
              ? 'border-amber-500 text-amber-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Activity size={15} />
          <span>Historial de Sync & Webhooks</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rest')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeSubTab === 'rest'
              ? 'border-cyan-500 text-cyan-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Code2 size={15} />
          <span>Documentación REST & Tester</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        
        {/* ================================================================= */}
        {/* TAB 1: CONECTORES SALIENTES & CLIENTES MCP                        */}
        {/* ================================================================= */}
        {activeSubTab === 'connectors' && (
          <div className="space-y-6">
            {/* Header / Info Banner */}
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <ArrowRightLeft size={22} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Sincronización Bidireccional de Datos</h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    Conecta WAgent con otros servidores o agentes. Puedes importar productos al catálogo, actualizar stocks en cámaras frigoríficas, enviar pedidos generados por WhatsApp en tiempo real a ERPs externos e invocar herramientas de servidores MCP remotos.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadConnectors}
                  disabled={loadingConnectors}
                  className="px-3 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <RefreshCw size={14} className={loadingConnectors ? 'animate-spin' : ''} />
                  <span>Refrescar</span>
                </button>
              </div>
            </div>

            {/* Listado de Conectores */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {connectors.map(conn => {
                const isMcp = conn.type === 'mcp_sse' || conn.type === 'mcp_stdio';
                const isTesting = testingConnectorId === conn.id;

                return (
                  <div
                    key={conn.id}
                    className={`bg-[#111b21] rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                      conn.enabled ? 'border-[#202c33] hover:border-slate-700' : 'border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isMcp ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          }`}>
                            {isMcp ? (conn.type === 'mcp_sse' ? 'MCP SSE Remoto' : 'MCP Stdio Local') : 'REST API Client'}
                          </span>

                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            {conn.syncDirection === 'bidirectional' ? 'Bidireccional' : conn.syncDirection === 'inbound' ? 'Solo Entrada' : 'Solo Salida'}
                          </span>

                          {conn.autoSyncIntervalMinutes > 0 && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              Auto-sync c/{conn.autoSyncIntervalMinutes}m
                            </span>
                          )}
                        </div>

                        <span className={`w-2.5 h-2.5 rounded-full ${
                          conn.lastSyncStatus === 'success' ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50' :
                          conn.lastSyncStatus === 'error' ? 'bg-rose-400' : 'bg-slate-500'
                        }`} />
                      </div>

                      {/* Name & Desc */}
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {conn.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {conn.description || 'Sin descripción'}
                      </p>

                      {/* Connection Target */}
                      <div className="mt-3 p-2.5 rounded-xl bg-[#0b141a] border border-[#202c33] font-mono text-[11px] text-slate-300 truncate">
                        <span className="text-slate-500 mr-2">{isMcp ? 'SSE:' : 'BASE:'}</span>
                        {conn.type === 'mcp_stdio' ? `${conn.command} ${(conn.args || []).join(' ')}` : (conn.sseUrl || conn.baseUrl || 'URL no configurada')}
                      </div>

                      {/* Status / Last Sync Message */}
                      <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Último sync: {conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleTimeString() : 'Nunca'}</span>
                        <span className={`font-medium ${
                          conn.lastSyncStatus === 'success' ? 'text-emerald-400' :
                          conn.lastSyncStatus === 'error' ? 'text-rose-400' : 'text-slate-400'
                        }`}>
                          {conn.lastSyncMessage || 'Inactivo'}
                        </span>
                      </div>

                      {/* Herramientas MCP descubiertas */}
                      {isMcp && Array.isArray(conn.discoveredMcpTools) && conn.discoveredMcpTools.length > 0 && (
                        <div className="mt-3 p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20">
                          <div className="text-[11px] font-bold text-purple-300 mb-1.5 flex items-center justify-between">
                            <span>Herramientas Remotas Disponibles ({conn.discoveredMcpTools.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                            {conn.discoveredMcpTools.map(t => (
                              <button
                                key={t.name}
                                onClick={() => handleOpenRemoteMcpModal(conn, t)}
                                className="px-2 py-0.5 rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-mono border border-purple-500/30 transition flex items-center gap-1"
                              >
                                <span>{t.name}</span>
                                <Play size={9} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-5 pt-4 border-t border-[#202c33] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleTestConnector(conn.id)}
                          disabled={isTesting}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} />
                          <span>Probar Conexión</span>
                        </button>

                        {conn.syncCatalog && (
                          <button
                            onClick={() => handleSyncConnector(conn.id, 'pull-catalog')}
                            disabled={syncingAction?.id === conn.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition"
                            title="Traer productos del sistema externo y actualizar catálogo local"
                          >
                            <Boxes size={13} />
                            <span>Traer Catálogo</span>
                          </button>
                        )}

                        {conn.syncStock && (
                          <button
                            onClick={() => handleSyncConnector(conn.id, 'push-stock')}
                            disabled={syncingAction?.id === conn.id}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition"
                            title="Enviar niveles de stock actuales al sistema externo"
                          >
                            <Store size={13} />
                            <span>Enviar Stock</span>
                          </button>
                        )}

                        {conn.syncOrders && (
                          <button
                            onClick={() => handleSyncConnector(conn.id, 'push-order')}
                            disabled={syncingAction?.id === conn.id}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1 transition"
                            title="Enviar pedido de prueba al sistema externo"
                          >
                            <PackageCheck size={13} />
                            <span>Enviar Pedido</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditConnectorModal(conn)}
                          className="p-1.5 rounded-lg hover:bg-[#202c33] text-slate-400 hover:text-white transition"
                          title="Editar Conexión"
                        >
                          <Sliders size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteConnector(conn.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                          title="Eliminar Conexión"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resultado del último Test */}
            {testConnectorResult && (
              <div className="p-4 rounded-2xl bg-[#111b21] border border-blue-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Activity size={16} className="text-blue-400" />
                    Resultado del Diagnóstico de Conexión
                  </span>
                  <button
                    onClick={() => setTestConnectorResult(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-[#0b141a] text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 custom-scrollbar">
                  {JSON.stringify(testConnectorResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: CLAVES DE API ENTRANTES                                    */}
        {/* ================================================================= */}
        {activeSubTab === 'keys' && (
          <div className="space-y-5">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Autenticación por Token Bearer o Header</h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    Las aplicaciones y agentes que deseen consultar WAgent deben enviar su clave en el encabezado <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">X-API-Key: wagent_live_...</code> o como <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">Authorization: Bearer wagent_live_...</code>.
                  </p>
                </div>
              </div>

              <button
                onClick={loadKeys}
                disabled={loadingKeys}
                className="px-3 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition self-start md:self-auto"
              >
                <RefreshCw size={14} className={loadingKeys ? 'animate-spin' : ''} />
                <span>Refrescar</span>
              </button>
            </div>

            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] overflow-hidden">
              <div className="p-4 border-b border-[#202c33] flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Claves de Acceso Activas ({keys.length})
                </h3>
              </div>

              <div className="divide-y divide-[#202c33]">
                {keys.map((k) => (
                  <div key={k.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#182229]/50 transition">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">{k.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase ${
                          k.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {k.active ? 'Activa' : 'Revocada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span>{k.fullKey || k.keyPrefix + '••••••••••••••••••••'}</span>
                        <button
                          onClick={() => handleCopy(k.fullKey || k.keyPrefix, k.id)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
                          title="Copiar Clave"
                        >
                          {copiedKeyId === k.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Creada: {new Date(k.createdAt).toLocaleDateString()} por {k.createdBy} • Usada: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Nunca'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        onClick={() => handleToggleKey(k.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                          k.active ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                        }`}
                      >
                        {k.active ? 'Suspender' : 'Reactivar'}
                      </button>
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                        title="Eliminar Clave"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: SERVIDOR MCP LOCAL                                         */}
        {/* ================================================================= */}
        {activeSubTab === 'mcp' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Servidor MCP de WAgent Carnicería</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-bold border border-purple-500/30">
                      v1.3.3 • Stdio & SSE
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                    Permite que asistentes y agentes de IA (Claude Desktop, Cursor, Antigravity, OpenDevin) lean y modifiquen los datos de la carnicería a través del estándar abierto de Anthropic.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(claudeDesktopConfig, 'claude_json')}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-950/40 transition active:scale-95"
                  >
                    {copiedKeyId === 'claude_json' ? <Check size={14} /> : <Copy size={14} />}
                    <span>Copiar claude_desktop_config.json</span>
                  </button>
                </div>
              </div>

              {/* Endpoints SSE y Stdio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0b141a] border border-[#202c33] space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Transporte HTTP SSE (Remoto):</span>
                  <div className="font-mono text-purple-300 truncate">{serverOrigin}/mcp/sse?apiKey={firstActiveKey}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b141a] border border-[#202c33] space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Transporte Stdio (Local CLI):</span>
                  <div className="font-mono text-purple-300 truncate">node server/mcp-server.js</div>
                </div>
              </div>
            </div>

            {/* Listado de Herramientas MCP */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                10 Herramientas Registradas en el Servidor MCP
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {[
                  { name: 'wagent_get_system_summary', desc: 'Resumen global del sistema, métricas de pedidos, alertas de stock mínimo y sucursales activas.' },
                  { name: 'wagent_get_products', desc: 'Consulta y filtra el catálogo de cortes por nombre, categoría, PLU de balanza y rango de precios.' },
                  { name: 'wagent_get_stock', desc: 'Niveles de stock en kg de las cámaras frigoríficas por sucursal y detección de faltantes.' },
                  { name: 'wagent_get_orders', desc: 'Listado de pedidos de clientes con desglose de ítems, estado, dirección y medio de pago.' },
                  { name: 'wagent_get_order_details', desc: 'Detalle unitario de un pedido específico por ID o comprobante.' },
                  { name: 'wagent_create_order', desc: 'Crea un pedido desde un agente externo o aplicación remota en la base de datos de WAgent.' },
                  { name: 'wagent_get_users', desc: 'Consulta clientes y leads del CRM con puntaje de fidelización y datos de contacto.' },
                  { name: 'wagent_get_branches', desc: 'Información de las 6 sucursales físicas (casa central, cámaras frigoríficas, direcciones).' },
                  { name: 'wagent_get_transfers', desc: 'Traspasos de mercadería y cortes entre sucursales y camiones de reparto.' },
                  { name: 'wagent_get_suppliers_and_invoices', desc: 'Historial de compras a frigoríficos proveedores y facturas procesadas con escáner OCR.' }
                ].map(tool => (
                  <div key={tool.name} className="p-4 rounded-xl bg-[#111b21] border border-[#202c33] space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-bold text-purple-400 font-mono">{tool.name}</code>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">Tool</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{tool.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: HISTORIAL DE SYNC & LOGS                                   */}
        {/* ================================================================= */}
        {activeSubTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Auditoría en Tiempo Real de Sincronizaciones & Webhooks ({connectorLogs.length})
              </h3>
              <button
                onClick={loadLogs}
                disabled={loadingLogs}
                className="px-3 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
                <span>Refrescar Logs</span>
              </button>
            </div>

            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] overflow-hidden">
              <div className="divide-y divide-[#202c33] max-h-[600px] overflow-y-auto custom-scrollbar font-mono text-xs">
                {connectorLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    No hay registros de sincronización aún.
                  </div>
                ) : (
                  connectorLogs.map(l => (
                    <div key={l.id} className="p-3.5 hover:bg-[#182229]/50 transition flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            l.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                            l.status === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {l.type || 'EVENT'}
                          </span>
                          <span className="font-bold text-white truncate">{l.connectorName || 'Sistema'}</span>
                          {l.latencyMs && <span className="text-slate-500">({l.latencyMs}ms)</span>}
                        </div>
                        <div className="text-slate-300 text-[11px] break-all">{l.message}</div>
                        {l.details && (
                          <pre className="text-[10px] text-slate-400 bg-[#0b141a] p-2 rounded max-h-24 overflow-y-auto">
                            {JSON.stringify(l.details, null, 2)}
                          </pre>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 shrink-0">
                        {new Date(l.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: DOCUMENTACIÓN REST & TESTER                                */}
        {/* ================================================================= */}
        {activeSubTab === 'rest' && (
          <div className="space-y-6">
            <div className="p-4.5 rounded-2xl bg-[#111b21] border border-[#202c33] space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 size={18} className="text-emerald-400" />
                Probador Interactivo de Endpoints REST
              </h3>
              <p className="text-xs text-slate-300">
                Prueba en tiempo real las llamadas a la API usando la primera clave activa del sistema.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={testEndpoint}
                  onChange={(e) => setTestEndpoint(e.target.value)}
                  className="bg-[#0b141a] border border-[#202c33] rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 flex-1"
                >
                  <option value="/api/v1/external/summary">GET /api/v1/external/summary (Resumen Global)</option>
                  <option value="/api/v1/external/products">GET /api/v1/external/products (Catálogo de Cortes)</option>
                  <option value="/api/v1/external/stock">GET /api/v1/external/stock (Stock en Cámaras)</option>
                  <option value="/api/v1/external/orders">GET /api/v1/external/orders (Pedidos)</option>
                  <option value="/api/v1/external/users">GET /api/v1/external/users (Clientes CRM)</option>
                  <option value="/api/v1/external/branches">GET /api/v1/external/branches (Sucursales)</option>
                  <option value="/api/v1/external/transfers">GET /api/v1/external/transfers (Traspasos)</option>
                  <option value="/api/v1/external/suppliers">GET /api/v1/external/suppliers (Proveedores & Facturas)</option>
                </select>

                <button
                  onClick={() => runLiveTest(testEndpoint)}
                  disabled={testingLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-950/40"
                >
                  <Play size={14} className={testingLoading ? 'animate-spin' : ''} />
                  <span>Ejecutar Petición</span>
                </button>
              </div>

              {testResult && (
                <div className="mt-4 p-4 rounded-xl bg-[#0b141a] border border-[#202c33] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>Respuesta JSON (200 OK):</span>
                    <button
                      onClick={() => handleCopy(JSON.stringify(testResult, null, 2), 'test_json')}
                      className="text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      {copiedKeyId === 'test_json' ? <Check size={12} /> : <Copy size={12} />}
                      <span>Copiar JSON</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 max-h-72 overflow-y-auto custom-scrollbar p-2">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL: CREAR / EDITAR CONECTOR EXTERNO                            */}
      {/* ================================================================= */}
      {isConnectorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#202c33] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingConnector ? 'Editar Conexión a Sistema Externo' : 'Conectar Nuevo Sistema o Agente MCP'}
              </h3>
              <button
                onClick={() => setIsConnectorModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConnector} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Nombre del Sistema</label>
                <input
                  type="text"
                  required
                  placeholder="ej: ERP Frigorífico Central / Agente Claude Remoto"
                  value={connectorForm.name}
                  onChange={(e) => setConnectorForm({ ...connectorForm, name: e.target.value })}
                  className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Tipo de Conexión</label>
                <select
                  value={connectorForm.type}
                  onChange={(e) => setConnectorForm({ ...connectorForm, type: e.target.value })}
                  className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="rest">Cliente REST API (HTTP GET / POST)</option>
                  <option value="mcp_sse">Servidor MCP Remoto (HTTP SSE)</option>
                  <option value="mcp_stdio">Servidor MCP Local (Proceso Stdio)</option>
                </select>
              </div>

              {connectorForm.type === 'rest' && (
                <>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Base URL de la API Externa</label>
                    <input
                      type="url"
                      placeholder="https://api.erpfrigorifico.com/v1"
                      value={connectorForm.baseUrl}
                      onChange={(e) => setConnectorForm({ ...connectorForm, baseUrl: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Autenticación</label>
                      <select
                        value={connectorForm.authType}
                        onChange={(e) => setConnectorForm({ ...connectorForm, authType: e.target.value })}
                        className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="none">Sin Autenticación</option>
                        <option value="apiKey">API Key Header (ej: X-API-Key)</option>
                        <option value="bearer">Bearer Token (Authorization)</option>
                        <option value="basic">Basic Auth</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Token / API Key</label>
                      <input
                        type="text"
                        placeholder="clave_secreta_externa"
                        value={connectorForm.authToken}
                        onChange={(e) => setConnectorForm({ ...connectorForm, authToken: e.target.value })}
                        className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">URL Webhook para Eventos en Vivo (Opcional)</label>
                    <input
                      type="url"
                      placeholder="https://api.erpfrigorifico.com/v1/webhooks/wagent"
                      value={connectorForm.webhookUrl}
                      onChange={(e) => setConnectorForm({ ...connectorForm, webhookUrl: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              {connectorForm.type === 'mcp_sse' && (
                <>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">URL Endpoint MCP SSE</label>
                    <input
                      type="url"
                      placeholder="http://servidor-agente:3002/mcp/sse"
                      value={connectorForm.sseUrl}
                      onChange={(e) => setConnectorForm({ ...connectorForm, sseUrl: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Token de Autenticación MCP (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Bearer token o API Key"
                      value={connectorForm.authToken}
                      onChange={(e) => setConnectorForm({ ...connectorForm, authToken: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </>
              )}

              {connectorForm.type === 'mcp_stdio' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Comando (Binario)</label>
                    <input
                      type="text"
                      placeholder="node / python / npx"
                      value={connectorForm.command}
                      onChange={(e) => setConnectorForm({ ...connectorForm, command: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Argumentos (separados por espacio)</label>
                    <input
                      type="text"
                      placeholder="-y @model/server"
                      value={connectorForm.args}
                      onChange={(e) => setConnectorForm({ ...connectorForm, args: e.target.value })}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Capacidades de Sincronización */}
              <div className="p-3.5 rounded-xl bg-[#0b141a] border border-[#202c33] space-y-2">
                <span className="font-bold text-slate-300 block">Flujos de Datos Habilitados:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={connectorForm.syncCatalog}
                      onChange={(e) => setConnectorForm({ ...connectorForm, syncCatalog: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>Traer Catálogo (Pull)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={connectorForm.syncStock}
                      onChange={(e) => setConnectorForm({ ...connectorForm, syncStock: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>Stock Cámaras (Push)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={connectorForm.syncOrders}
                      onChange={(e) => setConnectorForm({ ...connectorForm, syncOrders: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>Enviar Pedidos (Push)</span>
                  </label>
                </div>
              </div>

              {/* Frecuencia de Auto-Sincronización */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">Sincronización Automática Programada</label>
                <select
                  value={connectorForm.autoSyncIntervalMinutes}
                  onChange={(e) => setConnectorForm({ ...connectorForm, autoSyncIntervalMinutes: Number(e.target.value) })}
                  className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={0}>Manual únicamente</option>
                  <option value={5}>Cada 5 minutos</option>
                  <option value={15}>Cada 15 minutos</option>
                  <option value={60}>Cada 1 hora</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#202c33]">
                <button
                  type="button"
                  onClick={() => setIsConnectorModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-950/50"
                >
                  Guardar Conexión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: EJECUTAR HERRAMIENTA MCP REMOTA EN EL OTRO SISTEMA         */}
      {/* ================================================================= */}
      {remoteMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-purple-500/40 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#202c33] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bot size={18} className="text-purple-400" />
                  Invocar Herramienta MCP Remota
                </h3>
                <div className="text-xs text-purple-300 font-mono mt-0.5">
                  {remoteMcpModal.connector.name} → <span className="font-bold">{remoteMcpModal.tool.name}</span>
                </div>
              </div>
              <button
                onClick={() => setRemoteMcpModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {remoteMcpModal.tool.description || 'Sin descripción'}
            </p>

            {/* Input Schema Preview */}
            {remoteMcpModal.tool.inputSchema && (
              <div className="p-3 rounded-xl bg-[#0b141a] border border-[#202c33] space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Esquema de Parámetros:</span>
                <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto">
                  {JSON.stringify(remoteMcpModal.tool.inputSchema, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-bold mb-1 text-xs">Argumentos en formato JSON:</label>
              <textarea
                rows={4}
                value={remoteToolArgs}
                onChange={(e) => setRemoteToolArgs(e.target.value)}
                className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl p-3 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500"
              />
            </div>

            {remoteToolResult && (
              <div className="p-3 rounded-xl bg-[#0b141a] border border-purple-500/30 space-y-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase">Respuesta del Sistema Externo:</span>
                <pre className="text-[11px] font-mono text-slate-200 overflow-x-auto max-h-48 custom-scrollbar">
                  {JSON.stringify(remoteToolResult, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#202c33]">
              <button
                onClick={() => setRemoteMcpModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cerrar
              </button>
              <button
                onClick={handleExecuteRemoteMcpTool}
                disabled={callingRemoteTool}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-950/50"
              >
                <Play size={13} className={callingRemoteTool ? 'animate-spin' : ''} />
                <span>Ejecutar en Sistema Externo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: CREAR CLAVE API                                            */}
      {/* ================================================================= */}
      {isNewKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#202c33] pb-3">
              <h3 className="text-base font-bold text-white">Generar Nueva Clave API</h3>
              <button
                onClick={() => setIsNewKeyModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre / Identificador de la Clave</label>
                <input
                  type="text"
                  required
                  placeholder="ej: Integración App Móvil Repartidor / ERP"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#202c33]">
                <button
                  type="button"
                  onClick={() => setIsNewKeyModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingKey}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-950/50"
                >
                  {creatingKey ? 'Generando...' : 'Crear Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
