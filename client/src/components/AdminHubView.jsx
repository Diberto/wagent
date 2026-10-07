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
  ArrowRight
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

  // AI Connection Test
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

  // GitHub Updater State
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Cargar configuración inicial
  useEffect(() => {
    fetchSettings();
  }, []);

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
      setSettings(updated);
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
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings?.aiProvider,
          model: settings?.aiModel,
          apiKey: settings?.geminiApiKey || settings?.openaiApiKey || settings?.nvidiaApiKey,
          customBaseUrl: settings?.customBaseUrl
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
      const res = await fetch('/api/system/updater-info');
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
      const res = await fetch('/api/system/apply-update', { method: 'POST' });
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

  // Secciones del Master Rail
  const sections = [
    { id: 'general', label: 'General & WhatsApp', icon: Settings, desc: 'Sesión Baileys, autopilot y datos del negocio' },
    { id: 'ai', label: 'Modelos IA & Prompts', icon: Bot, desc: 'Gemini, OpenAI, Llama local y personalidad' },
    { id: 'logistics', label: 'Logística & Despachos', icon: Bike, desc: 'Franjas horarias, costos y radios de envío' },
    { id: 'payments', label: 'Mercado Pago & ARCA', icon: CreditCard, desc: 'Pasarelas de cobro y facturación electrónica' },
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
        {['general', 'ai', 'logistics', 'payments'].includes(activeSection) && (
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
            <div className="p-4 rounded-2xl bg-[#111b21] border border-[#202c33] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  whatsappStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  <Settings size={20} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Estado de WhatsApp Baileys</div>
                  <div className="text-[11px] text-slate-400">
                    {whatsappStatus === 'connected' ? '🟢 Sesión vinculada y escuchando mensajes' : '🔴 Desconectado - Requiere vinculación QR'}
                  </div>
                </div>
              </div>

              <button
                onClick={onOpenQR}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#202c33] hover:bg-[#2a3942] text-white border border-slate-700 transition"
              >
                Abrir Administrador QR
              </button>
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

        {/* 2. MODELOS IA & PROMPT */}
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
              <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                aiTestResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {aiTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{aiTestResult.message || (aiTestResult.success ? 'Conexión exitosa con el proveedor de IA' : aiTestResult.error)}</span>
              </div>
            )}

            {/* Provider Select */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <option value="gemini">Google Gemini (Recomendado)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  <option value="nvidia">NVIDIA NIM (Llama 3.3 70B)</option>
                  <option value="custom">Servidor Propio / Local (Ollama / VLLM)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Modelo Seleccionado</label>
                <input
                  type="text"
                  value={settings.aiModel || ''}
                  onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* API Keys (Secured / Masked) */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Gemini API Key</span>
                  <span className="text-[10px] text-slate-400">Enmascarada por seguridad</span>
                </label>
                <input
                  type="password"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>OpenAI API Key</span>
                  <span className="text-[10px] text-slate-400">Opcional para GPT-4o</span>
                </label>
                <input
                  type="password"
                  value={settings.openaiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-[#2a3942] text-white text-xs focus:border-emerald-500 outline-none font-mono"
                />
              </div>
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
