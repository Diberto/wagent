import React, { useState, useEffect } from 'react';
import {
  Settings,
  Bot,
  Bike,
  CreditCard,
  Zap,
  Globe,
  Users,
  Database,
  Activity,
  Terminal,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Play,
  Key,
  Sliders,
  PhoneCall,
  Volume2,
  ShieldCheck,
  Check,
  Cpu,
  Receipt,
  Store,
  Clock,
  Sparkles,
  ArrowRight,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Smartphone,
  QrCode,
  Copy,
  ExternalLink
} from 'lucide-react';
import UsersView from './UsersView';
import DatabaseView from './DatabaseView';
import SystemHealthView from './SystemHealthView';
import LogsView from './LogsView';
import AutomationRulesView from './AutomationRulesView';
import WooCommerceView from './WooCommerceView';
import { 
  SYSTEM_AI_PROVIDERS, 
  SYSTEM_AI_MODELS, 
  getDefaultModelForProvider 
} from '../utils/aiModels.js';

export default function AdminHubView({
  socket,
  currentUser,
  onSwitchUser,
  whatsappStatus,
  onOpenQR,
  initialSection = 'general'
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [settings, setSettings] = useState(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Sync initialSection if changed from parent
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  // AI Connection Test
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [showKeyMap, setShowKeyMap] = useState({});
  const toggleKeyVisibility = (keyField) => {
    setShowKeyMap(prev => ({ ...prev, [keyField]: !prev[keyField] }));
  };
  const [showAllApiKeys, setShowAllApiKeys] = useState(false);

  // ARCA (AFIP) Facturación Electrónica & Multi-Razón Social
  const [isTestingArca, setIsTestingArca] = useState(false);
  const [arcaTestResult, setArcaTestResult] = useState(null);
  const [fiscalProfiles, setFiscalProfiles] = useState([]);
  const [editingProfile, setEditingProfile] = useState(null);
  const [allBranches, setAllBranches] = useState([]);

  // Meta WhatsApp Cloud API State
  const [isTestingMeta, setIsTestingMeta] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [showMetaSecret, setShowMetaSecret] = useState(false);

  const handleTestMetaWhatsApp = async () => {
    setIsTestingMeta(true);
    setMetaTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/meta/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: settings?.metaPhoneNumberId,
          accessToken: settings?.metaAccessToken,
          apiVersion: settings?.metaApiVersion
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMetaTestResult({ success: false, error: data.error || 'Error conectando con Meta WhatsApp API' });
      } else {
        setMetaTestResult({ success: true, ...data });
      }
    } catch (err) {
      setMetaTestResult({ success: false, error: err.message || 'Error de red al conectar con Meta' });
    } finally {
      setIsTestingMeta(false);
    }
  };

  const handleCopyMetaText = (text, type) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    if (type === 'webhook') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else if (type === 'verify') {
      setCopiedVerifyToken(true);
      setTimeout(() => setCopiedVerifyToken(false), 2000);
    }
  };

  // GitHub Updater State
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Cargar configuración inicial
  useEffect(() => {
    fetchSettings();
    fetchFiscalProfiles();
  }, []);

  useEffect(() => {
    if (activeSection === 'arca') {
      fetchFiscalProfiles();
    }
  }, [activeSection]);

  const fetchFiscalProfiles = async () => {
    try {
      const [fpRes, brRes] = await Promise.all([
        fetch('/api/fiscal-profiles').then(r => r.json()).catch(() => []),
        fetch('/api/branches').then(r => r.json()).catch(() => [])
      ]);
      if (Array.isArray(fpRes)) setFiscalProfiles(fpRes);
      if (Array.isArray(brRes)) setAllBranches(brRes);
    } catch (e) {
      console.error('Error fetching fiscal profiles:', e);
    }
  };

  const fetchSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Error cargando settings en AdminHub:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al guardar configuración');
      }

      const updated = await res.json();
      setSettings(updated.settings || updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Error guardando configuración:', err);
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAi = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const prov = settings?.aiProvider || 'gemini';
      let activeKey = '';
      if (prov === 'gemini') activeKey = settings?.geminiApiKey;
      else if (prov === 'openai') activeKey = settings?.openaiApiKey;
      else if (prov === 'nvidia') activeKey = settings?.nvidiaApiKey;
      else if (prov === 'anthropic') activeKey = settings?.anthropicApiKey;
      else if (prov === 'deepseek') activeKey = settings?.deepseekApiKey;
      else if (prov === 'groq') activeKey = settings?.groqApiKey;
      else if (prov === 'openrouter') activeKey = settings?.openrouterApiKey;
      else if (prov === 'cohere') activeKey = settings?.cohereApiKey;
      else if (prov === 'custom') activeKey = settings?.customApiKey;

      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: prov,
          model: settings?.aiModel || getDefaultModelForProvider(prov),
          apiKey: activeKey || '',
          customBaseUrl: settings?.customBaseUrl || '',
          customEndpoint: settings?.customBaseUrl || settings?.customEndpoint || ''
        })
      });
      const data = await res.json();
      setAiTestResult(data);
    } catch (err) {
      setAiTestResult({ success: false, error: err.message });
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await fetch('/api/system/update-check');
      const data = await res.json();
      setUpdateInfo(data);
    } catch (err) {
      console.error('Error verificando actualizaciones:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!window.confirm('¿Deseas iniciar la actualización automática del sistema desde GitHub?')) return;
    setIsApplyingUpdate(true);
    try {
      const res = await fetch('/api/system/update-apply', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUpdateSuccess(true);
      }
    } catch (err) {
      console.error('Error aplicando actualización:', err);
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  const handleTestArca = async (profileId = null) => {
    setIsTestingArca(true);
    setArcaTestResult(null);
    try {
      const url = profileId ? `/api/fiscal-profiles/${profileId}/test` : '/api/arca/test';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      setArcaTestResult(data);
    } catch (err) {
      setArcaTestResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setIsTestingArca(false);
    }
  };

  const handleSaveFiscalProfile = async (profileData) => {
    try {
      const isEdit = profileData.id && fiscalProfiles.some(p => p.id === profileData.id);
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/fiscal-profiles/${profileData.id}` : '/api/fiscal-profiles';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        await fetchFiscalProfiles();
        setEditingProfile(null);
      }
    } catch (e) {
      console.error('Error guardando perfil fiscal:', e);
    }
  };

  const handleDeleteFiscalProfile = async (profileId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta Razón Social / Perfil Fiscal?')) return;
    try {
      const res = await fetch(`/api/fiscal-profiles/${profileId}`, { method: 'DELETE' });
      if (res.ok) {
        setFiscalProfiles(prev => prev.filter(p => p.id !== profileId));
      }
    } catch (e) {
      console.error('Error eliminando perfil fiscal:', e);
    }
  };

  // Secciones del Master Rail
  const sections = [
    { id: 'general', label: 'General & Datos', icon: Settings, desc: 'Nombre del negocio, moneda y reglas comerciales' },
    { id: 'metaWhatsapp', label: 'Meta WhatsApp API', icon: Smartphone, desc: 'API Oficial Cloud de Meta, Webhooks y credenciales' },
    { id: 'ai', label: 'Modelos IA & Prompts', icon: Bot, desc: 'Gemini, OpenAI, Llama local y personalidad' },
    { id: 'logistics', label: 'Logística & Despachos', icon: Bike, desc: 'Franjas horarias, costos y radios de envío' },
    { id: 'payments', label: 'Mercado Pago', icon: CreditCard, desc: 'Pasarelas de cobro y Alias digital' },
    { id: 'arca', label: 'ARCA (AFIP) Facturación', icon: Receipt, desc: 'Multi-Razón Social, CUITs, puntos de venta y WSFE' },
    { id: 'automations', label: 'Automatizaciones', icon: Zap, desc: 'Reglas inteligentes de pedidos y respuestas' },
    { id: 'woocommerce', label: 'WooCommerce Sync', icon: Globe, desc: 'Sincronización de catálogo y stock online' },
    { id: 'users', label: 'Usuarios & Accesos', icon: Users, desc: 'Operadores, roles RBAC y permisos' },
    { id: 'database', label: 'Base de Datos & Respaldos', icon: Database, desc: 'Motor dual Mongo/SQLite y copias de seguridad' },
    { id: 'system', label: 'Salud del Sistema', icon: Activity, desc: 'Telemetría CPU/RAM y optimización' },
    { id: 'logs', label: 'Auditoría & Logs en Vivo', icon: Terminal, desc: 'Visor streaming de eventos del sistema' },
    { id: 'updates', label: 'Actualizaciones GitHub', icon: RefreshCw, desc: '1-Click Updater y versiones' }
  ];

  return (
    <div className="flex h-full w-full bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      
      {/* Master Left Rail: Categorías del Admin */}
      <div className="w-64 sm:w-72 border-r border-[#202c33] bg-[#111b21] flex flex-col shrink-0">
        
        {/* Rail Header */}
        <div className="p-4 border-b border-[#202c33] bg-[#0c1317]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Settings size={18} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white">Centro de Control</h1>
              <p className="text-[11px] text-slate-400">Configuración & Sistema</p>
            </div>
          </div>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {sections.map(sec => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;

            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#202c33] border border-transparent'
                }`}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-bold leading-tight ${isActive ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {sec.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {sec.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Global Save Button in Left Rail */}
        {['general', 'metaWhatsapp', 'ai', 'logistics', 'payments', 'arca'].includes(activeSection) && (
          <div className="p-3 border-t border-[#202c33] bg-[#0c1317]">
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>¡Cambios Guardados!</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Guardar Configuración</span>
                </>
              )}
            </button>
            {saveError && (
              <p className="text-[11px] text-rose-400 text-center mt-1 truncate">{saveError}</p>
            )}
          </div>
        )}

      </div>

      {/* Detail Area: Vista Detallada de la Sección Seleccionada */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0b141a]">
        
        {/* Renderizado Condicional por Sección */}

        {/* 1. GENERAL & WHATSAPP */}
        {activeSection === 'general' && settings && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4">
              <h2 className="text-lg font-extrabold text-white">General & WhatsApp</h2>
              <p className="text-xs text-slate-400">Parámetros principales de la sucursal central y el agente WhatsApp</p>
            </div>

            {/* WhatsApp Connection Status Card */}
            <div className="p-4 rounded-2xl bg-[#111b21] border border-[#202c33] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  settings.whatsappProvider === 'meta_cloud'
                    ? (settings.metaPhoneNumberId ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')
                    : (whatsappStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')
                }`}>
                  {settings.whatsappProvider === 'meta_cloud' ? <Smartphone size={20} /> : <Settings size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {settings.whatsappProvider === 'meta_cloud' ? 'WhatsApp Oficial (Meta Cloud API)' : 'WhatsApp Baileys (Web QR)'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      settings.whatsappProvider === 'meta_cloud'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {settings.whatsappProvider === 'meta_cloud' ? 'Oficial Cloud' : 'Sesión Web QR'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {settings.whatsappProvider === 'meta_cloud'
                      ? (settings.metaPhoneNumberId ? '🟢 API de Meta Cloud activa y configurada' : '🟡 Pendiente de configurar Phone Number ID de Meta')
                      : (whatsappStatus === 'connected' ? '🟢 Sesión Baileys vinculada y escuchando mensajes' : '🔴 Desconectado - Requiere vinculación QR')
                    }
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                {settings.whatsappProvider === 'meta_cloud' ? (
                  <button
                    onClick={() => setActiveSection('metaWhatsapp')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-md shadow-emerald-950/30"
                  >
                    <Smartphone size={13} />
                    <span>Configurar Meta API</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onOpenQR}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#202c33] hover:bg-[#2a3942] text-white border border-slate-700 transition"
                    >
                      Abrir Administrador QR
                    </button>
                    <button
                      onClick={() => setActiveSection('metaWhatsapp')}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5"
                      title="Ver configuración de la API Oficial de Meta"
                    >
                      <Smartphone size={13} />
                      <span>Ver Meta API</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Autopilot Mode Toggle */}
            <div className="p-4 rounded-2xl bg-[#111b21] border border-[#202c33] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Modo Autopilot de Pedidos</div>
                <div className="text-[11px] text-slate-400">
                  Notificar automáticamente al cliente por WhatsApp cuando el pedido cambie de estado
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.autopilot_orders)}
                  onChange={(e) => setSettings({ ...settings, autopilot_orders: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              </label>
            </div>

            {/* Business Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Nombre de la Empresa</label>
                <input
                  type="text"
                  value={settings.businessName || ''}
                  onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Nombre del Agente Virtual</label>
                <input
                  type="text"
                  value={settings.agentName || ''}
                  onChange={(e) => setSettings({ ...settings, agentName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Moneda & Símbolo</label>
                <input
                  type="text"
                  value={settings.currency || 'ARS ($)'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Región / Ciudad Principal</label>
                <input
                  type="text"
                  value={settings.region || 'Córdoba Capital y Alrededores'}
                  onChange={(e) => setSettings({ ...settings, region: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Business Rules Textarea */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Reglas Comerciales Principales</label>
              <textarea
                rows={3}
                value={settings.businessRules || ''}
                onChange={(e) => setSettings({ ...settings, businessRules: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none custom-scrollbar"
                placeholder="Envíos en el día dentro de Córdoba, 6 sucursales..."
              />
            </div>
          </div>
        )}

        {/* 2. META WHATSAPP CLOUD API (OFICIAL) */}
        {activeSection === 'metaWhatsapp' && settings && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-white">Meta WhatsApp Cloud API</h2>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    Oficial Meta
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  API oficial en la nube de Meta WhatsApp Business. Conexión directa mediante Webhooks y tokens permanentes sin depender de teléfonos conectados ni escaneo QR.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestMetaWhatsApp}
                disabled={isTestingMeta || !settings.metaPhoneNumberId}
                className="self-start sm:self-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                <RefreshCw size={14} className={isTestingMeta ? 'animate-spin' : ''} />
                <span>{isTestingMeta ? 'Verificando con Meta...' : 'Probar Conexión'}</span>
              </button>
            </div>

            {/* Test Result Alert */}
            {metaTestResult && (
              <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 animate-in fade-in ${
                metaTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {metaTestResult.success ? (
                  <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle size={20} className="text-rose-400 shrink-0" />
                )}
                <div className="flex-1">
                  {metaTestResult.success ? (
                    <div>
                      <div className="font-bold text-emerald-300 text-sm">¡Conexión Exitosa con Meta WhatsApp Cloud API!</div>
                      <div className="text-[11px] text-slate-300 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Número: <b className="text-white">{metaTestResult.data?.displayPhoneNumber || 'OK'}</b></span>
                        <span>Nombre Verificado: <b className="text-white">{metaTestResult.data?.verifiedName || 'No configurado'}</b></span>
                        <span>Calidad: <b className="text-emerald-400 uppercase">{metaTestResult.data?.qualityRating || 'GREEN'}</b></span>
                        <span>Latencia: <b className="text-white">{metaTestResult.latencyMs}ms</b></span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="font-bold text-rose-300">Error de Autenticación con Meta:</span>{' '}
                      <span className="text-slate-200">{metaTestResult.error || 'Revisa el Phone Number ID y el Token de Acceso.'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SELECTOR DE PROVEEDOR ACTIVO */}
            <div className="p-4 sm:p-5 bg-[#111b21] border border-[#202c33] rounded-2xl space-y-3">
              <div>
                <label className="text-xs font-bold text-white uppercase tracking-wider block">
                  Proveedor de WhatsApp Activo en el Sistema
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Define qué infraestructura procesará el envío y recepción de mensajes, pedidos y estados en tiempo real:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Opción 1: Baileys Web QR */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, whatsappProvider: 'baileys' })}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 ${
                    (settings.whatsappProvider || 'baileys') === 'baileys'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-950/20'
                      : 'bg-[#182229] border-[#2a3942] text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <QrCode size={20} className={(settings.whatsappProvider || 'baileys') === 'baileys' ? 'text-emerald-400' : 'text-slate-500'} />
                      <span className="text-xs font-bold text-white">Baileys (Web QR)</span>
                    </div>
                    {(settings.whatsappProvider || 'baileys') === 'baileys' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Vinculación por escaneo de código QR mediante sesión multi-dispositivo de WhatsApp Web.
                  </p>
                </button>

                {/* Opción 2: Meta Cloud API Oficial */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, whatsappProvider: 'meta_cloud' })}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 ${
                    settings.whatsappProvider === 'meta_cloud'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-950/20'
                      : 'bg-[#182229] border-[#2a3942] text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Smartphone size={20} className={settings.whatsappProvider === 'meta_cloud' ? 'text-emerald-400' : 'text-slate-500'} />
                      <span className="text-xs font-bold text-white">Meta Cloud API (Oficial)</span>
                    </div>
                    {settings.whatsappProvider === 'meta_cloud' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    API directa en la nube de Meta. Máxima estabilidad comercial, sin caídas de sesión ni reconexiones.
                  </p>
                </button>
              </div>
            </div>

            {/* FORMULARIO DE CREDENCIALES DE META */}
            <div className="p-4 sm:p-5 bg-[#111b21] border border-[#202c33] rounded-2xl space-y-4">
              <div className="flex items-center gap-2 border-b border-[#202c33] pb-3">
                <Key size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Credenciales de la Aplicación de Meta Developers
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 block">
                    Phone Number ID (Identificador de Número) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 103456789012345"
                    value={settings.metaPhoneNumberId || ''}
                    onChange={(e) => setSettings({ ...settings, metaPhoneNumberId: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">Obtenido en WhatsApp &gt; Configuración de la API en Meta Developers</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 block">
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 109876543210987"
                    value={settings.metaWabaId || ''}
                    onChange={(e) => setSettings({ ...settings, metaWabaId: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">ID de tu cuenta de negocio en Meta Business Manager</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Token de Acceso Permanente (System User Token) <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowMetaToken(!showMetaToken)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    {showMetaToken ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <input
                  type={showMetaToken ? 'text' : 'password'}
                  placeholder="EAA..."
                  value={settings.metaAccessToken || ''}
                  onChange={(e) => setSettings({ ...settings, metaAccessToken: e.target.value })}
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block">
                  Token generado en Meta Business Suite con permisos <b>whatsapp_business_messaging</b> y <b>whatsapp_business_management</b>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 block">
                    Webhook Verify Token (Token de Verificación)
                  </label>
                  <input
                    type="text"
                    placeholder="wagent_meta_verify_2026"
                    value={settings.metaVerifyToken || 'wagent_meta_verify_2026'}
                    onChange={(e) => setSettings({ ...settings, metaVerifyToken: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">Cadena secreta para validar el handshake inicial del webhook</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      App Secret (Opcional - Validación HMAC)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowMetaSecret(!showMetaSecret)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                    >
                      {showMetaSecret ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <input
                    type={showMetaSecret ? 'text' : 'password'}
                    placeholder="Secreto de tu aplicación en Meta"
                    value={settings.metaAppSecret || ''}
                    onChange={(e) => setSettings({ ...settings, metaAppSecret: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">Para validar firma SHA-256 de seguridad en los webhooks entrantes</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  Versión de Meta Graph API
                </label>
                <input
                  type="text"
                  placeholder="v21.0"
                  value={settings.metaApiVersion || 'v21.0'}
                  onChange={(e) => setSettings({ ...settings, metaApiVersion: e.target.value })}
                  className="w-36 bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* GUÍA DE CONFIGURACIÓN DEL WEBHOOK EN META DEVELOPERS */}
            <div className="p-4 sm:p-5 bg-[#111b21] border border-[#202c33] rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#202c33] pb-3">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-teal-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Configuración del Webhook en Meta Developers
                  </h4>
                </div>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  Meta Developers <ExternalLink size={12} />
                </a>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Copia estos dos datos y pégalos en la consola de Meta Developers en <b>WhatsApp &gt; Configuración &gt; Webhook</b>:
              </p>

              {/* URL del Webhook */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  URL de Callback (Webhook Endpoint)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/meta-webhook`}
                    className="flex-1 bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-emerald-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyMetaText(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/meta-webhook`, 'webhook')}
                    className="px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-white text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition shrink-0"
                  >
                    {copiedWebhook ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copiedWebhook ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Nota: Meta requiere que esta URL use HTTPS y sea públicamente accesible (o mediante Cloudflare Tunnel / ngrok en desarrollo).
                </span>
              </div>

              {/* Verify Token */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Token de Verificación (Verify Token)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.metaVerifyToken || 'wagent_meta_verify_2026'}
                    className="flex-1 bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-teal-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyMetaText(settings.metaVerifyToken || 'wagent_meta_verify_2026', 'verify')}
                    className="px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-white text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition shrink-0"
                  >
                    {copiedVerifyToken ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copiedVerifyToken ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Campos obligatorios a suscribir */}
              <div className="p-3.5 bg-[#0b141a] rounded-xl border border-[#202c33] space-y-2">
                <div className="text-xs font-bold text-slate-200">
                  Campos de Webhook que debes suscribir en Meta Developers:
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    messages
                  </span>
                  <span className="px-2 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-bold">
                    messaging_postbacks
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    message_template_status_update
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. MODELOS IA & PROMPT */}
        {activeSection === 'ai' && settings && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Modelos de Inteligencia Artificial & Prompting</h2>
                <p className="text-xs text-slate-400">Configura proveedores de lenguaje (Gemini, OpenAI, Llama) y personalidad cordobesa</p>
              </div>

              <button
                onClick={handleTestAi}
                disabled={isTestingAi}
                className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-2 transition"
              >
                {isTestingAi ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                <span>Probar Conexión</span>
              </button>
            </div>

            {aiTestResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-2.5 animate-in fade-in ${
                aiTestResult.success 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-slate-200' 
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="flex items-center gap-2 font-bold">
                    {aiTestResult.success ? <CheckCircle2 size={17} className="text-emerald-400" /> : <AlertCircle size={17} className="text-rose-400" />}
                    <span className={aiTestResult.success ? 'text-emerald-300' : 'text-rose-300'}>
                      {aiTestResult.success ? '¡Conexión Exitosa con el Modelo!' : 'Error de Conexión con el Modelo'}
                    </span>
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    {aiTestResult.model && (
                      <span className="bg-black/40 border border-white/10 px-2.5 py-0.5 rounded text-white font-semibold">
                        Modelo: {aiTestResult.model}
                      </span>
                    )}
                    {aiTestResult.latencyMs !== undefined && (
                      <span className="text-amber-400 bg-black/40 border border-amber-500/20 px-2 py-0.5 rounded">
                        ⏱️ {aiTestResult.latencyMs} ms
                      </span>
                    )}
                  </div>
                </div>

                {aiTestResult.success ? (
                  <div className="space-y-1 pt-1">
                    <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
                      <span>💬 Respuesta real generada por el modelo:</span>
                    </p>
                    <div className="p-3 rounded-xl bg-black/50 border border-emerald-500/30 font-mono text-emerald-200 text-xs whitespace-pre-wrap leading-relaxed select-text shadow-inner">
                      {aiTestResult.response || 'Sin texto de respuesta'}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 pt-1">
                    <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1.5">
                      <span>⚠️ Detalle del error devuelto por la API:</span>
                    </p>
                    <div className="p-3 rounded-xl bg-black/50 border border-rose-500/30 font-mono text-rose-200 text-xs whitespace-pre-wrap leading-relaxed select-text shadow-inner">
                      {aiTestResult.error || 'Error desconocido'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Provider & Model Select */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Proveedor de IA Activo</label>
                <select
                  value={settings.aiProvider || 'gemini'}
                  onChange={(e) => {
                    const nextProv = e.target.value;
                    setSettings({
                      ...settings,
                      aiProvider: nextProv,
                      aiModel: getDefaultModelForProvider(nextProv)
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                >
                  <option value="gemini">Google Gemini (Oficial)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini / o3-mini)</option>
                  <option value="nvidia">NVIDIA NIM (Llama 3.3 70B / DeepSeek R1 / Nemotron)</option>
                  <option value="anthropic">Anthropic Claude (Claude 3.7 / 3.5 Sonnet)</option>
                  <option value="deepseek">DeepSeek AI (V3 / R1 Reasoner)</option>
                  <option value="groq">Groq Cloud (LPU Ultra Rápido)</option>
                  <option value="openrouter">OpenRouter (100+ Modelos Multi-Cloud)</option>
                  <option value="cohere">Cohere (Command R+)</option>
                  <option value="local">Servidor Local (Ollama / LM Studio)</option>
                  <option value="custom">Endpoint Custom / Compatible OpenAI (vLLM / TGI)</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Modelo Seleccionado</label>
                  <span className="text-[10px] text-slate-400">Podés escribir, pegar o elegir sugerido</span>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={settings.aiModel || ''}
                    onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                    placeholder="Escribe o pega el ID del modelo (ej: gemini-3.8-flash, meta/llama-3.3-70b-instruct...)"
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                  />
                  {/* Sugerencias clicables del proveedor actual */}
                  {SYSTEM_AI_MODELS[settings.aiProvider || 'gemini']?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-400 mr-0.5">Sugeridos:</span>
                      {SYSTEM_AI_MODELS[settings.aiProvider || 'gemini'].map((m) => {
                        const isSelected = (settings.aiModel || '') === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSettings({ ...settings, aiModel: m.id })}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono border transition ${
                              isSelected
                                ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300 font-bold'
                                : 'bg-[#1f2c34] border-[#2a3942] text-slate-300 hover:border-slate-500 hover:text-white'
                            }`}
                            title={m.desc || m.name}
                          >
                            {m.name || m.id} {m.tag ? `• ${m.tag}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Credenciales del Proveedor Seleccionado */}
            <div className="p-4 rounded-xl bg-[#111b21] border border-[#202c33] space-y-4">
              <div className="flex items-center justify-between border-b border-[#202c33] pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <span>🔑 Credenciales para: </span>
                  <span className="text-emerald-400 uppercase font-mono tracking-wide">
                    {settings.aiProvider || 'gemini'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-400">Configuración requerida para la IA activa</span>
              </div>

              {/* Gemini */}
              {(settings.aiProvider === 'gemini' || !settings.aiProvider) && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Google Gemini API Key</span>
                    <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-400 hover:underline">
                      Obtener gratis en Google AI Studio ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.geminiApiKey ? "text" : "password"}
                      value={settings.geminiApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('geminiApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.geminiApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.geminiApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* NVIDIA NIM */}
              {settings.aiProvider === 'nvidia' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>NVIDIA NIM API Key</span>
                    <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-400 hover:underline">
                      Obtener créditos en build.nvidia.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.nvidiaApiKey ? "text" : "password"}
                      value={settings.nvidiaApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, nvidiaApiKey: e.target.value })}
                      placeholder="nvapi-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('nvidiaApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.nvidiaApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.nvidiaApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* OpenAI */}
              {settings.aiProvider === 'openai' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>OpenAI API Key</span>
                    <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-400 hover:underline">
                      Obtener en platform.openai.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.openaiApiKey ? "text" : "password"}
                      value={settings.openaiApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                      placeholder="sk-proj-... o sk-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('openaiApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.openaiApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.openaiApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Anthropic */}
              {settings.aiProvider === 'anthropic' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Anthropic Claude API Key</span>
                    <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-400 hover:underline">
                      Obtener en console.anthropic.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.anthropicApiKey ? "text" : "password"}
                      value={settings.anthropicApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
                      placeholder="sk-ant-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('anthropicApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.anthropicApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.anthropicApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* DeepSeek */}
              {settings.aiProvider === 'deepseek' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>DeepSeek API Key</span>
                    <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">
                      Obtener en platform.deepseek.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.deepseekApiKey ? "text" : "password"}
                      value={settings.deepseekApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, deepseekApiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('deepseekApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.deepseekApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.deepseekApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Groq */}
              {settings.aiProvider === 'groq' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Groq Cloud API Key</span>
                    <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-amber-400 hover:underline">
                      Obtener gratis en console.groq.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.groqApiKey ? "text" : "password"}
                      value={settings.groqApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                      placeholder="gsk_..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('groqApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.groqApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.groqApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* OpenRouter */}
              {settings.aiProvider === 'openrouter' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>OpenRouter API Key</span>
                    <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-400 hover:underline">
                      Obtener en openrouter.ai ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.openrouterApiKey ? "text" : "password"}
                      value={settings.openrouterApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                      placeholder="sk-or-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('openrouterApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.openrouterApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.openrouterApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Cohere */}
              {settings.aiProvider === 'cohere' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Cohere API Key</span>
                    <a href="https://dashboard.cohere.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-orange-400 hover:underline">
                      Obtener en dashboard.cohere.com ↗
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyMap.cohereApiKey ? "text" : "password"}
                      value={settings.cohereApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, cohereApiKey: e.target.value })}
                      placeholder="co-..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility('cohereApiKey')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      title={showKeyMap.cohereApiKey ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {showKeyMap.cohereApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Local Ollama / LM Studio */}
              {settings.aiProvider === 'local' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>URL Base del Servidor Local</span>
                    <span className="text-[10px] text-cyan-400">Ollama: http://localhost:11434/v1 | LM Studio: http://localhost:1234/v1</span>
                  </label>
                  <input
                    type="text"
                    value={settings.customBaseUrl || ''}
                    onChange={(e) => setSettings({ ...settings, customBaseUrl: e.target.value })}
                    placeholder="http://localhost:11434/v1"
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
              )}

              {/* Custom Endpoint OpenAI-compatible */}
              {settings.aiProvider === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">URL Base del Endpoint</label>
                    <input
                      type="text"
                      value={settings.customBaseUrl || ''}
                      onChange={(e) => setSettings({ ...settings, customBaseUrl: e.target.value })}
                      placeholder="https://api.tu-servidor.com/v1 o http://localhost:8000/v1"
                      className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">API Key del Endpoint (Opcional)</label>
                    <div className="relative">
                      <input
                        type={showKeyMap.customApiKey ? "text" : "password"}
                        value={settings.customApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                        placeholder="Clave de acceso o Bearer token..."
                        className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('customApiKey')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                        title={showKeyMap.customApiKey ? "Ocultar clave" : "Mostrar clave"}
                      >
                        {showKeyMap.customApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Toggle para ver y gestionar otras API Keys guardadas */}
            <div className="border border-[#202c33] rounded-xl overflow-hidden bg-[#111b21]/50">
              <button
                type="button"
                onClick={() => setShowAllApiKeys(!showAllApiKeys)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#182229]/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-200">Gestionar Todas las API Keys Guardadas</span>
                  <span className="text-[10px] text-slate-400">(NVIDIA, Gemini, OpenAI, Claude, DeepSeek, Groq, etc.)</span>
                </div>
                <span className="text-xs text-emerald-400 font-semibold">{showAllApiKeys ? '▲ Ocultar' : '▼ Ver Todas'}</span>
              </button>

              {showAllApiKeys && (
                <div className="p-4 border-t border-[#202c33] grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0c1317]">
                  {/* Gemini Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>Gemini API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">geminiApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_gemini ? "text" : "password"}
                        value={settings.geminiApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                        placeholder="AIzaSy..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_gemini')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_gemini ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* OpenAI Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>OpenAI API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">openaiApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_openai ? "text" : "password"}
                        value={settings.openaiApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_openai')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_openai ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* NVIDIA NIM Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>NVIDIA NIM API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">nvidiaApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_nvidia ? "text" : "password"}
                        value={settings.nvidiaApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, nvidiaApiKey: e.target.value })}
                        placeholder="nvapi-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_nvidia')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_nvidia ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Anthropic Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>Anthropic Claude API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">anthropicApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_anthropic ? "text" : "password"}
                        value={settings.anthropicApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
                        placeholder="sk-ant-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_anthropic')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_anthropic ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* DeepSeek Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>DeepSeek API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">deepseekApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_deepseek ? "text" : "password"}
                        value={settings.deepseekApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, deepseekApiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_deepseek')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_deepseek ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Groq Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>Groq Cloud API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">groqApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_groq ? "text" : "password"}
                        value={settings.groqApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                        placeholder="gsk_..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_groq')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_groq ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* OpenRouter Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>OpenRouter API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">openrouterApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_openrouter ? "text" : "password"}
                        value={settings.openrouterApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                        placeholder="sk-or-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_openrouter')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_openrouter ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Cohere Key */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                      <span>Cohere API Key</span>
                      <span className="text-[9px] text-slate-500 font-mono">cohereApiKey</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyMap.all_cohere ? "text" : "password"}
                        value={settings.cohereApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, cohereApiKey: e.target.value })}
                        placeholder="co-..."
                        className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility('all_cohere')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showKeyMap.all_cohere ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Custom Endpoint Base URL & Key */}
                  <div className="space-y-1 md:col-span-2 pt-2 border-t border-[#202c33]/70">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                          <span>URL Base de Endpoint Personalizado / Local</span>
                          <span className="text-[9px] text-slate-500 font-mono">customBaseUrl</span>
                        </label>
                        <input
                          type="text"
                          value={settings.customBaseUrl || ''}
                          onChange={(e) => setSettings({ ...settings, customBaseUrl: e.target.value })}
                          placeholder="http://localhost:11434/v1 o https://mi-servidor.com/v1"
                          className="w-full px-3 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                          <span>Custom API Key (Opcional)</span>
                          <span className="text-[9px] text-slate-500 font-mono">customApiKey</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showKeyMap.all_custom ? "text" : "password"}
                            value={settings.customApiKey || ''}
                            onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                            placeholder="API Key o Token..."
                            className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility('all_custom')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                          >
                            {showKeyMap.all_custom ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Regional Cordobés Prompting */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Estilo & Jerga Regional (Personalidad)</label>
              <textarea
                rows={4}
                value={settings.slang || ''}
                onChange={(e) => setSettings({ ...settings, slang: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none custom-scrollbar"
                placeholder="Cordobés / Argentino amigable y experto..."
              />
            </div>
          </div>
        )}

        {/* 3. LOGÍSTICA & DESPACHOS */}
        {activeSection === 'logistics' && settings && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4">
              <h2 className="text-lg font-extrabold text-white">Logística, Franjas & Envíos</h2>
              <p className="text-xs text-slate-400">Costos de delivery, franjas horarias y reglas de despacho en Córdoba</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Costo Envío Estándar ($)</label>
                <input
                  type="number"
                  value={settings.deliveryStandardCost || 3500}
                  onChange={(e) => setSettings({ ...settings, deliveryStandardCost: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Costo Envío Express ($)</label>
                <input
                  type="number"
                  value={settings.deliveryExpressCost || 6500}
                  onChange={(e) => setSettings({ ...settings, deliveryExpressCost: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Monto Mínimo Envío Gratis ($)</label>
                <input
                  type="number"
                  value={settings.deliveryFreeThreshold || 45000}
                  onChange={(e) => setSettings({ ...settings, deliveryFreeThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Hora Límite de Corte (Cutoff)</label>
                <input
                  type="number"
                  value={settings.deliveryCutoffHour || 12}
                  onChange={(e) => setSettings({ ...settings, deliveryCutoffHour: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
                <span className="text-[10px] text-slate-400">Ej: 12 (12:00 hs mediodía)</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Radio de Cobertura (Km)</label>
                <input
                  type="number"
                  value={settings.deliveryCoverageRadiusKm || 15}
                  onChange={(e) => setSettings({ ...settings, deliveryCoverageRadiusKm: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. MERCADO PAGO & FACTURACIÓN */}
        {activeSection === 'payments' && settings && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4">
              <h2 className="text-lg font-extrabold text-white">Mercado Pago & Pasarelas de Cobro</h2>
              <p className="text-xs text-slate-400">Gestión de Checkout Pro, enlaces de pago automáticos y Alias digital</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Modo de Operación</label>
                <select
                  value={settings.mercadopagoMode || 'production'}
                  onChange={(e) => setSettings({ ...settings, mercadopagoMode: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                >
                  <option value="production">Producción (Cobros Reales)</option>
                  <option value="sandbox">Sandbox (Modo Pruebas)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Alias de Transferencia</label>
                <input
                  type="text"
                  value={settings.aliasMP || 'republica.carne.mp'}
                  onChange={(e) => setSettings({ ...settings, aliasMP: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Access Token de Producción</label>
                <input
                  type="password"
                  value={settings.mercadopagoAccessTokenProduction || settings.mercadopagoAccessToken || ''}
                  onChange={(e) => setSettings({ ...settings, mercadopagoAccessTokenProduction: e.target.value })}
                  placeholder="APP_USR-..."
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Access Token Sandbox (Pruebas)</label>
                <input
                  type="password"
                  value={settings.mercadopagoAccessTokenSandbox || ''}
                  onChange={(e) => setSettings({ ...settings, mercadopagoAccessTokenSandbox: e.target.value })}
                  placeholder="TEST-..."
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                />
              </div>
            </div>

            {/* Direct jump to ARCA */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-transparent border border-blue-500/20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Receipt size={18} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Facturación Electrónica ARCA (AFIP)</div>
                  <div className="text-[11px] text-slate-400">Configura CUITs, puntos de venta, alícuotas y homologación WSFE</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('arca')}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
              >
                <span>Ir a ARCA</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* 5. ARCA (AFIP) FACTURACIÓN ELECTRÓNICA & MULTI-RAZÓN SOCIAL */}
        {activeSection === 'arca' && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  ARCA (ex AFIP) Multi-Razón Social & Facturación
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                    🇦🇷 RG 4291 / 4892
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Vinculación de CUITs, Razones Sociales, puntos de venta y web services WSFE para las 6 sucursales.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingProfile({
                    id: '',
                    name: '',
                    razonSocial: '',
                    nombreFantasia: '',
                    cuit: '',
                    condicionIva: 'Responsable Inscripto',
                    iibb: '',
                    inicioActividades: '',
                    domicilioComercial: '',
                    ptoVta: 1,
                    defaultDocumentType: 'factura_b',
                    mode: 'sandbox',
                    branchIds: [],
                    isDefault: fiscalProfiles.length === 0
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md transition"
                >
                  <Plus size={14} /> Nueva Razón Social
                </button>

                <button
                  type="button"
                  onClick={() => handleTestArca()}
                  disabled={isTestingArca}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isTestingArca ? 'animate-spin' : ''} />
                  {isTestingArca ? 'Verificando...' : '⚡ Probar ARCA'}
                </button>
              </div>
            </div>

            {/* Status Test Result Alert */}
            {arcaTestResult && (
              <div className={`p-4 rounded-2xl border text-xs flex flex-col gap-2 ${
                arcaTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {arcaTestResult.success ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertCircle size={18} className="text-rose-400" />}
                  <span>{arcaTestResult.message || (arcaTestResult.success ? 'Conexión con ARCA exitosa' : 'Error conectando con ARCA')}</span>
                </div>
                {arcaTestResult.success && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-300 pt-2 border-t border-emerald-500/20">
                    <div><span className="text-slate-400">WSAA:</span> <b>{arcaTestResult.wsaaStatus || 'OK'}</b></div>
                    <div><span className="text-slate-400">WSFE:</span> <b>{arcaTestResult.wsfeStatus || 'OK'}</b></div>
                    <div><span className="text-slate-400">Entorno:</span> <b>{arcaTestResult.isSandbox ? '🧪 Sandbox' : '🚀 Producción'}</b></div>
                    <div><span className="text-slate-400">Método:</span> <b>{arcaTestResult.authMethod || 'Certificado'}</b></div>
                  </div>
                )}
              </div>
            )}

            {/* LIST OF FISCAL PROFILES / RAZONES SOCIALES */}
            <div className="p-5 rounded-2xl bg-[#111b21] border border-[#202c33] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Razones Sociales & CUITs Registrados</h3>
                  <p className="text-[11px] text-slate-400">Cada sucursal facturará bajo su Razón Social y Punto de Venta asignado</p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {fiscalProfiles.length} {fiscalProfiles.length === 1 ? 'Perfil' : 'Perfiles'}
                </span>
              </div>

              {fiscalProfiles.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs bg-[#182229] rounded-2xl border border-dashed border-[#2a3942]">
                  <p className="font-semibold text-slate-300">No hay Razones Sociales configuradas aún</p>
                  <p className="text-[11px] text-slate-500 mt-1">Haz clic en "Nueva Razón Social" para asociar un CUIT y punto de venta.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fiscalProfiles.map(profile => {
                    const assignedBranches = allBranches.filter(b => 
                      b.fiscalProfileId === profile.id || (Array.isArray(profile.branchIds) && profile.branchIds.includes(b.id))
                    );

                    return (
                      <div 
                        key={profile.id}
                        className="p-4 rounded-2xl bg-[#182229] border border-[#2a3942] space-y-3 transition hover:border-slate-600"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-white">{profile.razonSocial || profile.name}</span>
                              {profile.nombreFantasia && (
                                <span className="text-xs text-slate-400">({profile.nombreFantasia})</span>
                              )}
                              {profile.isDefault && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  ★ Predeterminada
                                </span>
                              )}
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                profile.mode === 'production'
                                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}>
                                {profile.mode === 'production' ? '🚀 Producción' : '🧪 Sandbox'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>CUIT: <b className="text-white font-mono">{profile.cuit}</b></span>
                              <span>Pto. Venta: <b className="text-emerald-400 font-mono">#{profile.ptoVta || 1}</b></span>
                              <span>Condición: <b className="text-slate-300">{profile.condicionIva}</b></span>
                              {profile.iibb && <span>IIBB: <b className="text-slate-300 font-mono">{profile.iibb}</b></span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTestArca(profile.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold border border-blue-500/30 transition flex items-center gap-1"
                              title="Probar conexión de esta Razón Social"
                            >
                              <span>⚡ Probar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingProfile({ ...profile })}
                              className="px-2.5 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-xs font-bold border border-slate-700 transition"
                              title="Editar datos fiscales"
                            >
                              Editar
                            </button>
                            {!profile.isDefault && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFiscalProfile(profile.id)}
                                className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                                title="Eliminar razón social"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Associated Branches Badges */}
                        <div className="pt-2 border-t border-[#202c33] flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-bold mr-1">Sucursales Asociadas:</span>
                          {assignedBranches.length > 0 ? (
                            assignedBranches.map(b => (
                              <span key={b.id} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[#111b21] text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <Store size={10} /> {b.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-amber-400/80 italic">Todas las sucursales (o fallback general)</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MODAL / FORMULARIO EDICIÓN DE RAZÓN SOCIAL */}
            {editingProfile && (
              <div className="p-5 rounded-2xl bg-[#111b21] border border-blue-500/40 space-y-4 animate-in zoom-in-95 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#202c33] pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Receipt size={16} className="text-blue-400" />
                    {editingProfile.id ? 'Editar Razón Social Fiscal' : 'Nueva Razón Social / CUIT'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#202c33]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Razón Social Legal:</label>
                    <input
                      type="text"
                      value={editingProfile.razonSocial || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, razonSocial: e.target.value })}
                      placeholder="Ej: REPÚBLICA DE LA CARNE S.R.L."
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre de Fantasía:</label>
                    <input
                      type="text"
                      value={editingProfile.nombreFantasia || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, nombreFantasia: e.target.value })}
                      placeholder="Ej: República de la Carne - Urca"
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">CUIT Emisor (11 dígitos):</label>
                    <input
                      type="text"
                      value={editingProfile.cuit || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, cuit: e.target.value.replace(/\D/g, '') })}
                      placeholder="30716892348"
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Punto de Venta (Pto Vta):</label>
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={editingProfile.ptoVta || 1}
                      onChange={(e) => setEditingProfile({ ...editingProfile, ptoVta: parseInt(e.target.value, 10) || 1 })}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Condición frente al IVA:</label>
                    <select
                      value={editingProfile.condicionIva || 'Responsable Inscripto'}
                      onChange={(e) => setEditingProfile({ ...editingProfile, condicionIva: e.target.value })}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Responsable Inscripto">Responsable Inscripto</option>
                      <option value="Monotributo">Monotributo</option>
                      <option value="Exento">IVA Exento</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Entorno:</label>
                    <select
                      value={editingProfile.mode || 'sandbox'}
                      onChange={(e) => setEditingProfile({ ...editingProfile, mode: e.target.value })}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="sandbox">🧪 Sandbox / Homologación (Pruebas)</option>
                      <option value="production">🚀 Producción (Facturación Oficial)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Domicilio Comercial:</label>
                    <input
                      type="text"
                      value={editingProfile.domicilioComercial || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, domicilioComercial: e.target.value })}
                      placeholder="Av. José Roque Funes 1115, Barrio Urca, Córdoba"
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Ingresos Brutos (IIBB):</label>
                    <input
                      type="text"
                      value={editingProfile.iibb || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, iibb: e.target.value })}
                      placeholder="901-283746-1"
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Inicio de Actividades:</label>
                    <input
                      type="text"
                      value={editingProfile.inicioActividades || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, inicioActividades: e.target.value })}
                      placeholder="01/03/2020"
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Selector de Sucursales Asociadas */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sucursales que operan bajo esta Razón Social:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-[#182229] border border-[#2a3942] rounded-xl">
                      {allBranches.map(b => {
                        const isChecked = Array.isArray(editingProfile.branchIds) && editingProfile.branchIds.includes(b.id);
                        return (
                          <label key={b.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const currentIds = Array.isArray(editingProfile.branchIds) ? [...editingProfile.branchIds] : [];
                                if (e.target.checked) {
                                  if (!currentIds.includes(b.id)) currentIds.push(b.id);
                                } else {
                                  const filtered = currentIds.filter(id => id !== b.id);
                                  setEditingProfile({ ...editingProfile, branchIds: filtered });
                                  return;
                                }
                                setEditingProfile({ ...editingProfile, branchIds: currentIds });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate">{b.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProfile.isDefault)}
                        onChange={(e) => setEditingProfile({ ...editingProfile, isDefault: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span>Establecer como Razón Social Predeterminada</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProfile(null)}
                        className="px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs font-semibold transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveFiscalProfile(editingProfile)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition"
                      >
                        Guardar Razón Social
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Automatización de Facturación al Cobrar */}
            <div className="p-5 rounded-2xl bg-[#111b21] border border-[#202c33] flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white">Facturación Automática al Cobrar</div>
                <div className="text-[11px] text-slate-400">
                  Genera y valida automáticamente el comprobante fiscal en ARCA al marcar un pedido como cobrado.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.arcaConfig?.autoInvoicePaidOrders)}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    arcaConfig: { ...(prev?.arcaConfig || {}), autoInvoicePaidOrders: e.target.checked }
                  }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        )}

        {/* 5. AUTOMATIZACIONES */}
        {activeSection === 'automations' && (
          <div className="h-full">
            <AutomationRulesView socket={socket} />
          </div>
        )}

        {/* 6. WOOCOMMERCE */}
        {activeSection === 'woocommerce' && (
          <div className="h-full">
            <WooCommerceView socket={socket} />
          </div>
        )}

        {/* 7. USUARIOS & ROLES RBAC */}
        {activeSection === 'users' && (
          <div className="h-full">
            <UsersView socket={socket} currentUser={currentUser} onSwitchUser={onSwitchUser} />
          </div>
        )}

        {/* 8. BASE DE DATOS & RESPALDOS */}
        {activeSection === 'database' && (
          <div className="h-full">
            <DatabaseView socket={socket} />
          </div>
        )}

        {/* 9. SALUD DEL SISTEMA */}
        {activeSection === 'system' && (
          <div className="h-full">
            <SystemHealthView socket={socket} />
          </div>
        )}

        {/* 10. AUDITORÍA & LOGS */}
        {activeSection === 'logs' && (
          <div className="h-full">
            <LogsView socket={socket} />
          </div>
        )}

        {/* 11. ACTUALIZACIONES GITHUB */}
        {activeSection === 'updates' && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-[#202c33] pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Actualizaciones del Sistema desde GitHub</h2>
                <p className="text-xs text-slate-400">Verifica nuevas versiones y despliega cambios de forma automatizada</p>
              </div>

              <button
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdate}
                className="px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-white text-xs font-bold flex items-center gap-2 border border-slate-700 transition"
              >
                <RefreshCw size={14} className={isCheckingUpdate ? "animate-spin" : ""} />
                <span>Verificar Actualizaciones</span>
              </button>
            </div>

            {updateInfo && (
              <div className="p-4 rounded-2xl bg-[#111b21] border border-[#202c33] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">Estado del Repositorio</div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    updateInfo.hasUpdate ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {updateInfo.hasUpdate ? 'Actualización Disponible' : 'Sistema al Día'}
                  </span>
                </div>

                <div className="text-xs text-slate-300">
                  Rama: <code className="text-emerald-400">{updateInfo.branch || 'main'}</code> | Commit local: <code className="text-slate-400">{updateInfo.currentCommit?.slice(0, 7) || 'HEAD'}</code>
                </div>

                {updateInfo.hasUpdate && (
                  <button
                    onClick={handleApplyUpdate}
                    disabled={isApplyingUpdate}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98"
                  >
                    {isApplyingUpdate ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    <span>Descargar e Instalar Actualización en 1 Clic</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
