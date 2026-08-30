import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Link,
  Shield,
  Zap,
  Globe,
  ArrowUpRight,
  Send,
  Database,
  Layers,
  Settings,
  Clock,
  ExternalLink,
  ChevronRight,
  Sliders,
  Sparkles,
  Search,
  FileText
} from 'lucide-react';

export default function WooCommerceView({ socket }) {
  const [activeTab, setActiveTab] = useState('sync'); // 'sync' | 'settings' | 'orders' | 'logs'
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pushingOrderId, setPushingOrderId] = useState(null);
  const [pushResult, setPushResult] = useState(null);

  // Settings form state
  const [formData, setFormData] = useState({
    wooUrl: '',
    wooConsumerKey: '',
    wooConsumerSecret: '',
    wooSyncEnabled: true,
    wooAutoPushOrders: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Orders list for pushing
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Logs list
  const [logs, setLogs] = useState([]);

  // Load Status and Settings
  const loadWooCommerceStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/woocommerce/status');
      const data = await res.json();
      setStatus(data);
      setFormData(prev => ({
        ...prev,
        wooUrl: data.wooUrl || '',
        wooSyncEnabled: data.wooSyncEnabled !== undefined ? data.wooSyncEnabled : true,
        wooAutoPushOrders: data.wooAutoPushOrders !== undefined ? data.wooAutoPushOrders : true
      }));
      if (data.recentLogs) {
        setLogs(data.recentLogs);
      }
    } catch (err) {
      console.error('Error cargando estado de WooCommerce:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load Orders
  const loadOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    }
  };

  // Load Logs
  const loadLogs = async () => {
    try {
      const res = await fetch('/api/woocommerce/logs?limit=50');
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando logs de WooCommerce:', err);
    }
  };

  useEffect(() => {
    loadWooCommerceStatus();
    loadOrders();
    loadLogs();

    if (socket) {
      const handleSynced = () => {
        loadWooCommerceStatus();
        loadLogs();
      };
      const handleOrderUpdate = () => {
        loadOrders();
      };
      socket.on('woo:synced', handleSynced);
      socket.on('woo:webhook', handleSynced);
      socket.on('order:new', handleOrderUpdate);
      socket.on('order:update', handleOrderUpdate);

      return () => {
        socket.off('woo:synced', handleSynced);
        socket.off('woo:webhook', handleSynced);
        socket.off('order:new', handleOrderUpdate);
        socket.off('order:update', handleOrderUpdate);
      };
    }
  }, [socket]);

  // Test Connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/woocommerce/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      setTestResult(result);
      if (result.success) {
        loadWooCommerceStatus();
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    setSavedSuccess(false);
    try {
      const res = await fetch('/api/woocommerce/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSavedSuccess(true);
        loadWooCommerceStatus();
        setTimeout(() => setSavedSuccess(false), 4000);
      }
    } catch (err) {
      alert('Error guardando ajustes: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Sync Products Now
  const handleSyncProducts = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/woocommerce/sync-products', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({ success: true, message: `¡${data.count} productos sincronizados con éxito desde WooCommerce!` });
        loadWooCommerceStatus();
        loadLogs();
      } else {
        setSyncResult({ success: false, error: data.error || 'Fallo en la sincronización' });
      }
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  // Push Order
  const handlePushOrder = async (orderId) => {
    setPushingOrderId(orderId);
    setPushResult(null);
    try {
      const res = await fetch(`/api/woocommerce/push-order/${orderId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setPushResult({ success: true, orderId, wooOrderId: data.wooOrderId });
        loadOrders();
        loadLogs();
      } else {
        setPushResult({ success: false, orderId, error: data.error });
      }
    } catch (err) {
      setPushResult({ success: false, orderId, error: err.message });
    } finally {
      setPushingOrderId(null);
    }
  };

  const filteredOrders = orders.filter(o => 
    (o.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.phone || '').includes(searchTerm)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto custom-scrollbar">
      {/* Header Banner */}
      <div className="relative border-b border-slate-800 bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 px-6 py-6 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 ring-1 ring-purple-400/30">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">WooCommerce & WordPress</h1>
                {status?.isConfigured ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Configuración pendiente
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Sincroniza tu catálogo, stock en tiempo real y exporta pedidos de WhatsApp directamente a tu tienda virtual.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSyncProducts}
              disabled={syncing || !status?.isConfigured}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium text-sm shadow-lg shadow-purple-600/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Catálogo'}
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="relative max-w-7xl mx-auto mt-6 flex space-x-2 border-b border-slate-800/80">
          {[
            { id: 'sync', label: 'Centro de Sincronización', icon: RefreshCw },
            { id: 'orders', label: 'Exportación de Pedidos', icon: Send, badge: orders.filter(o => !o.wooOrderId).length },
            { id: 'settings', label: 'Ajustes y Credenciales REST', icon: Settings },
            { id: 'logs', label: 'Historial y Webhooks', icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* TAB 1: SYNC CENTER */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 backdrop-blur border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase font-semibold tracking-wider">Productos Sincronizados</span>
                  <Database className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-3xl font-extrabold text-white tracking-tight">
                  {status?.totalWooProducts || 0}
                </div>
                <div className="text-xs text-slate-400 mt-2 flex items-center">
                  <span className="text-emerald-400 mr-1">●</span> En catálogo local de IA y POS
                </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase font-semibold tracking-wider">Última Sincronización</span>
                  <Clock className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-lg font-bold text-white truncate">
                  {status?.wooLastSync ? new Date(status.wooLastSync).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Nunca'}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {status?.wooLastSync ? new Date(status.wooLastSync).toLocaleDateString('es-AR') : 'Pendiente de inicio'}
                </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase font-semibold tracking-wider">Auto-Exportar Pedidos</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-white">
                  {status?.wooAutoPushOrders ? 'Activado ⚡' : 'Manual'}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Hacia WooCommerce REST API
                </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase font-semibold tracking-wider">Tienda Vinculada</span>
                  <Globe className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-sm font-semibold text-slate-200 truncate" title={status?.wooUrl || 'No configurada'}>
                  {status?.wooUrl ? status.wooUrl.replace(/^https?:\/\//, '') : 'Sin configurar'}
                </div>
                <div className="text-xs text-purple-400 mt-2 flex items-center cursor-pointer hover:underline" onClick={() => status?.wooUrl && window.open(status.wooUrl, '_blank')}>
                  Abrir tienda en navegador <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>
            </div>

            {/* Sync Action & Feedback Card */}
            <div className="bg-gradient-to-br from-slate-900/80 to-purple-950/20 border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sincronización Bidireccional Inteligente</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">Sincroniza tu Catálogo de WordPress en 1 Clic</h2>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Descarga automáticamente los precios actualizados, nombres de cortes, fotos y stock real desde tu WooCommerce hacia el Agente de IA de WhatsApp y el Punto de Venta (POS).
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <button
                    onClick={handleSyncProducts}
                    disabled={syncing || !status?.isConfigured}
                    className="inline-flex items-center justify-center px-6 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold text-sm shadow-xl shadow-purple-600/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Descargando catálogo...' : 'Sincronizar Todo Ahora'}
                  </button>
                </div>
              </div>

              {/* Alert Feedback */}
              <AnimatePresence>
                {syncResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`mt-6 p-4 rounded-2xl border flex items-center space-x-3 text-sm ${
                      syncResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    }`}
                  >
                    {syncResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    )}
                    <span className="flex-1">{syncResult.message || syncResult.error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Architecture Details Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-white text-sm">Precios y Stock en Tiempo Real</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Cuando la IA atiende un cliente por WhatsApp o una llamada en vivo, cotiza con los precios reales de tu tienda virtual.
                </p>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                  <Zap className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-white text-sm">Exportación Directa de Pedidos</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Cada pedido confirmado en WhatsApp se envía a WooCommerce con estado "Procesando" y datos del cliente listos para facturar.
                </p>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-white text-sm">Seguridad y Webhooks</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Conexión cifrada vía REST API v3 con Consumer Key y Consumer Secret. Soporte para webhooks entrantes de WordPress.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ORDERS EXPORT QUEUE */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Cola de Pedidos para WooCommerce</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Exporta pedidos generados por WhatsApp o el POS directamente al panel de WordPress.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por cliente o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Pedido ID</th>
                      <th className="py-3 px-4">Cliente / Contacto</th>
                      <th className="py-3 px-4">Cortes / Ítems</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Estado WooCommerce</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-500">
                          No hay pedidos registrados en este momento.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-purple-400">
                            #{order.id}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{order.customerName || 'Cliente'}</div>
                            <div className="text-slate-400 text-[11px]">{order.phone || 'Sin teléfono'}</div>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs truncate">
                            {(order.items || []).join(', ') || 'Combo Asadazo'}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-white">
                            ${(order.totalAmount || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-3.5 px-4">
                            {order.wooOrderId ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                WooCommerce #{order.wooOrderId}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-400">
                                No exportado
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {order.wooOrderId ? (
                              <span className="text-xs text-emerald-400 font-medium">Exportado ✅</span>
                            ) : (
                              <button
                                onClick={() => handlePushOrder(order.id)}
                                disabled={pushingOrderId === order.id || !status?.isConfigured}
                                className="inline-flex items-center px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-md transition-all disabled:opacity-40"
                              >
                                <Send className={`w-3 h-3 mr-1.5 ${pushingOrderId === order.id ? 'animate-spin' : ''}`} />
                                {pushingOrderId === order.id ? 'Enviando...' : 'Exportar a Woo'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS & CREDENTIALS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
              <div className="flex items-center space-x-3 pb-6 border-b border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Configuración de Conexión REST API</h2>
                  <p className="text-xs text-slate-400">
                    Ingresa las credenciales generadas en WooCommerce &gt; Ajustes &gt; Avanzado &gt; REST API.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="mt-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    URL de la Tienda WordPress
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      placeholder="https://tutienda.com"
                      value={formData.wooUrl}
                      onChange={(e) => setFormData({ ...formData, wooUrl: e.target.value })}
                      required
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Ejemplo: <code className="text-purple-400">https://republicadelacarne.com.ar</code> (debe contar con certificado SSL HTTPS).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Consumer Key (ck_...)
                    </label>
                    <div className="relative">
                      <Link className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxx"
                        value={formData.wooConsumerKey}
                        onChange={(e) => setFormData({ ...formData, wooConsumerKey: e.target.value })}
                        required
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Consumer Secret (cs_...)
                    </label>
                    <div className="relative">
                      <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxx"
                        value={formData.wooConsumerSecret}
                        onChange={(e) => setFormData({ ...formData, wooConsumerSecret: e.target.value })}
                        required
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-2xl border border-slate-800/80">
                    <div>
                      <div className="text-sm font-semibold text-white">Sincronización Automática de Catálogo</div>
                      <div className="text-xs text-slate-400">Mantener stock y precios actualizados en segundo plano.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.wooSyncEnabled}
                        onChange={(e) => setFormData({ ...formData, wooSyncEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-2xl border border-slate-800/80">
                    <div>
                      <div className="text-sm font-semibold text-white">Auto-Exportar Pedidos de WhatsApp</div>
                      <div className="text-xs text-slate-400">Crear la orden en WooCommerce automáticamente al confirmar en chat.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.wooAutoPushOrders}
                        onChange={(e) => setFormData({ ...formData, wooAutoPushOrders: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || !formData.wooUrl || !formData.wooConsumerKey || !formData.wooConsumerSecret}
                    className="inline-flex items-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 mr-1.5 ${testing ? 'animate-spin' : 'text-amber-400'}`} />
                    {testing ? 'Comprobando...' : 'Probar Conexión'}
                  </button>

                  <div className="flex items-center space-x-3">
                    {savedSuccess && (
                      <span className="text-xs text-emerald-400 flex items-center font-medium">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> ¡Ajustes guardados!
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="inline-flex items-center px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold text-xs shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                    >
                      {savingSettings ? 'Guardando...' : 'Guardar Ajustes'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Test Result Box */}
              <AnimatePresence>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`mt-6 p-4 rounded-2xl border flex items-start space-x-3 text-xs ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">{testResult.success ? 'Conexión Exitosa' : 'Fallo en la prueba de conexión'}</div>
                      <div className="text-slate-400 mt-0.5">{testResult.message || testResult.error}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* How to generate Keys Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-4 text-xs text-slate-300">
              <h3 className="text-sm font-bold text-white flex items-center">
                <HelpCircle className="w-4 h-4 text-purple-400 mr-2" />
                ¿Cómo obtener las Claves REST en WordPress?
              </h3>
              <ol className="list-decimal pl-4 space-y-2 text-slate-400">
                <li>Ingresa al panel de administración de tu WordPress (<code>/wp-admin</code>).</li>
                <li>Ve al menú lateral <strong>WooCommerce</strong> &gt; <strong>Ajustes</strong>.</li>
                <li>Haz clic en la pestaña <strong>Avanzado</strong> &gt; <strong>REST API</strong>.</li>
                <li>Presiona <strong>Añadir clave</strong>.</li>
                <li>En descripción escribe <code className="text-purple-400">WAgent WhatsApp CRM</code> y en Permisos selecciona <strong>Lectura/Escritura</strong>.</li>
                <li>Copia la <strong>Clave de cliente (ck_...)</strong> y el <strong>Secreto de cliente (cs_...)</strong> en este formulario.</li>
              </ol>
            </div>
          </div>
        )}

        {/* TAB 4: ACTIVITY LOGS & WEBHOOKS */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Registro de Auditoría y Webhooks</h2>
                <p className="text-xs text-slate-400">Historial en tiempo real de sincronizaciones y eventos.</p>
              </div>
              <button
                onClick={loadLogs}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Refrescar logs"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto custom-scrollbar">
              {logs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No hay registros de actividad aún.
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                    <div className="flex items-start space-x-3">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        log.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`} />
                      <div>
                        <div className="font-semibold text-white capitalize">
                          {log.type.replace('_', ' ')}
                        </div>
                        <div className="text-slate-400 mt-0.5">{log.details}</div>
                      </div>
                    </div>
                    <div className="text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('es-AR')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HelpCircle(props) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01" />
    </svg>
  );
}
