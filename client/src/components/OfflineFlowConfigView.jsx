import React, { useState, useEffect } from 'react';
import {
  Bot,
  Zap,
  Save,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Send,
  Sliders,
  Sparkles,
  ShoppingBag,
  MapPin,
  Clock,
  PhoneCall,
  UserCheck,
  ShieldCheck,
  Power,
  ChevronRight,
  Plus,
  Trash2,
  FileText,
  CreditCard,
  Store,
  HelpCircle,
  CornerDownRight,
  MessageSquare
} from 'lucide-react';

export default function OfflineFlowConfigView({ socket }) {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [activeStepTab, setActiveStepTab] = useState('welcome'); // 'welcome' | 'catalog' | 'orderIntake' | 'orderStatus' | 'branches' | 'humanHandoff' | 'keywords'

  // Simulador de WhatsApp Offline
  const [simHistory, setSimHistory] = useState([
    {
      sender: 'bot',
      text: '🤖 *Modo Offline / Auto-Respuesta*\nEscribe "hola" o envía un número (1 al 5) para probar el flujo sin IA.'
    }
  ]);
  const [simInput, setSimInput] = useState('');
  const [simState, setSimState] = useState(null);
  const [simCustomerPhone, setSimCustomerPhone] = useState('5493512345678');
  const [simLoading, setSimLoading] = useState(false);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/offline-flow');
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Error cargando configuración offline:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const triggerFeedback = (type, msg) => {
    setSaveFeedback({ type, msg });
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/offline-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        triggerFeedback('success', '✅ Configuración del Flujo Offline guardada correctamente.');
      } else {
        triggerFeedback('error', `❌ Error: ${data.error || 'No se pudo guardar'}`);
      }
    } catch (err) {
      triggerFeedback('error', `❌ Error de conexión: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('¿Restablecer todo el flujo de conversación offline a los valores recomendados de fábrica?')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/offline-flow/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        triggerFeedback('success', '🔄 Flujo offline restablecido a valores por defecto.');
      }
    } catch (err) {
      triggerFeedback('error', `❌ Error restableciendo: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulación de interacción
  const handleSimulateSend = async (messageToSend = null) => {
    const text = (messageToSend !== null ? messageToSend : simInput).trim();
    if (!text || simLoading) return;

    const userMsg = { sender: 'user', text };
    setSimHistory(prev => [...prev, userMsg]);
    if (messageToSend === null) setSimInput('');
    setSimLoading(true);

    try {
      const res = await fetch('/api/offline-flow/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          customerPhone: simCustomerPhone,
          state: simState
        })
      });
      const data = await res.json();
      if (data.success) {
        setSimHistory(prev => [
          ...prev,
          {
            sender: 'bot',
            text: data.reply,
            orderCreated: data.orderCreated
          }
        ]);
        setSimState(data.nextState);
      } else {
        setSimHistory(prev => [
          ...prev,
          { sender: 'bot', text: `⚠️ Error de simulación: ${data.error}` }
        ]);
      }
    } catch (err) {
      setSimHistory(prev => [
        ...prev,
        { sender: 'bot', text: `⚠️ Error conectando al servidor: ${err.message}` }
      ]);
    } finally {
      setSimLoading(false);
    }
  };

  const handleResetSimulator = () => {
    setSimState(null);
    setSimHistory([
      {
        sender: 'bot',
        text: '🔄 *Conversación reiniciada.*\nEnvía "hola" o presiona alguno de los atajos rápidos para probar.'
      }
    ]);
  };

  if (isLoading || !config) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
        <RefreshCw size={24} className="animate-spin text-emerald-400" />
        <p className="text-xs">Cargando motor de flujos offline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast de retroalimentación */}
      {saveFeedback && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl animate-fade-in backdrop-blur-md border ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/50'
          }`}
        >
          {saveFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{saveFeedback.msg}</span>
        </div>
      )}

      {/* Header & Master Controls */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-[#182229] border border-emerald-500/30 rounded-3xl p-5 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1.5">
              <Bot size={13} className="text-emerald-400" />
              Motor de Flujo Sin IA (Offline & Failover)
            </span>
            <span className="text-xs text-slate-400">
              WhatsApp Automatizado con Menú Determinístico y Toma de Pedidos
            </span>
          </div>
          <h2 className="text-base font-bold text-white">
            Automatización Garantizada Cuando la IA no esté Disponible
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Permite que tus clientes elijan cortes, soliciten delivery o retiro, consulten sucursales o hagan pedidos paso a paso de forma rápida y sin caídas, garantizando coherencia en la base de datos de administración.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111b21] hover:bg-[#182229] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Restablecer a valores por defecto"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Defectos</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            <span>Guardar Configuración</span>
          </button>
        </div>
      </div>

      {/* 3 Master Switches */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Switch 1: Habilitado */}
        <div
          onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
          className={`p-4 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
            config.enabled
              ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
              : 'bg-[#182229] border-slate-800 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Power size={16} className={config.enabled ? 'text-emerald-400' : 'text-slate-500'} />
              <span className="text-xs font-bold text-white">Flujo Offline Activo</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Habilita la capacidad del bot para ejecutar árboles de decisiones sin depender de la IA.
            </p>
          </div>
          <div
            className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
              config.enabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>

        {/* Switch 2: Forzar Modo Offline */}
        <div
          onClick={() => setConfig(prev => ({ ...prev, forceOfflineMode: !prev.forceOfflineMode }))}
          className={`p-4 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
            config.forceOfflineMode
              ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
              : 'bg-[#182229] border-slate-800 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap size={16} className={config.forceOfflineMode ? 'text-amber-400' : 'text-slate-500'} />
              <span className="text-xs font-bold text-white">Forzar 100% Offline</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Responde siempre con este menú numérico rápido en WhatsApp, sin consumir tokens ni APIs de IA.
            </p>
          </div>
          <div
            className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
              config.forceOfflineMode ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                config.forceOfflineMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>

        {/* Switch 3: Auto-Fallback en Caídas de IA */}
        <div
          onClick={() =>
            setConfig(prev => ({
              ...prev,
              autoFallbackOnAiFailure: !prev.autoFallbackOnAiFailure
            }))
          }
          className={`p-4 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
            config.autoFallbackOnAiFailure
              ? 'bg-sky-950/20 border-sky-500/40 shadow-sm'
              : 'bg-[#182229] border-slate-800 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={16}
                className={config.autoFallbackOnAiFailure ? 'text-sky-400' : 'text-slate-500'}
              />
              <span className="text-xs font-bold text-white">Auto-Fallback si la IA Falla</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Si Gemini experimenta saturación, cuotas excedidas o timeout, este menú responde al instante.
            </p>
          </div>
          <div
            className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
              config.autoFallbackOnAiFailure ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                config.autoFallbackOnAiFailure ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Config Tabs on Left, Live Simulator on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Step Configuration (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub-tabs Navigation */}
          <div className="flex items-center gap-1.5 p-1.5 bg-[#111b21] rounded-2xl border border-slate-800 overflow-x-auto">
            {[
              { id: 'welcome', label: '1. Menú Principal', icon: MessageSquare },
              { id: 'catalog', label: '2. Catálogo & Precios', icon: ShoppingBag },
              { id: 'orderIntake', label: '3. Toma de Pedidos', icon: FileText },
              { id: 'orderStatus', label: '4. Consulta Pedido', icon: Clock },
              { id: 'branches', label: '5. Sucursales', icon: Store },
              { id: 'humanHandoff', label: '6. Asesor Humano', icon: PhoneCall },
              { id: 'keywords', label: '7. Palabras Clave', icon: Sliders }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeStepTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveStepTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: WELCOME & MAIN MENU */}
          {activeStepTab === 'welcome' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Menú Principal y Bienvenida</h3>
                    <p className="text-[11px] text-slate-400">
                      Mensaje de apertura cuando el cliente escribe por primera vez o dice "hola"
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nombre del Negocio
                  </label>
                  <input
                    type="text"
                    value={config.businessName || ''}
                    onChange={e => setConfig(prev => ({ ...prev, businessName: e.target.value }))}
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="República de la Carne"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Teléfono / WhatsApp de Soporte
                  </label>
                  <input
                    type="text"
                    value={config.supportPhone || ''}
                    onChange={e => setConfig(prev => ({ ...prev, supportPhone: e.target.value }))}
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="+54 9 351 000-0000"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Encabezado del Mensaje de Bienvenida
                </label>
                <textarea
                  rows={2}
                  value={config.steps?.welcome?.header || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        welcome: { ...prev.steps?.welcome, header: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Opciones Numéricas del Menú (1 línea por opción)
                </label>
                <div className="space-y-2">
                  {(config.steps?.welcome?.menuOptions || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-6 text-center text-xs font-mono font-bold text-emerald-400">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => {
                          const nextOpts = [...(config.steps?.welcome?.menuOptions || [])];
                          nextOpts[idx] = e.target.value;
                          setConfig(prev => ({
                            ...prev,
                            steps: {
                              ...prev.steps,
                              welcome: { ...prev.steps?.welcome, menuOptions: nextOpts }
                            }
                          }));
                        }}
                        className="flex-1 bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextOpts = (config.steps?.welcome?.menuOptions || []).filter(
                            (_, i) => i !== idx
                          );
                          setConfig(prev => ({
                            ...prev,
                            steps: {
                              ...prev.steps,
                              welcome: { ...prev.steps?.welcome, menuOptions: nextOpts }
                            }
                          }));
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        title="Eliminar opción"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpts = [
                        ...(config.steps?.welcome?.menuOptions || []),
                        `Opción nueva`
                      ];
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          welcome: { ...prev.steps?.welcome, menuOptions: nextOpts }
                        }
                      }));
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 pt-1"
                  >
                    <Plus size={13} />
                    <span>Agregar Opción</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Pie del Mensaje (Instrucción de respuesta)
                </label>
                <input
                  type="text"
                  value={config.steps?.welcome?.footer || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        welcome: { ...prev.steps?.welcome, footer: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: CATALOG & PRICES */}
          {activeStepTab === 'catalog' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Catálogo & Lista de Precios</h3>
                    <p className="text-[11px] text-slate-400">
                      Responde cuando el cliente presiona "1" o consulta "precios" / "catálogo"
                    </p>
                  </div>
                </div>

                <div
                  onClick={() =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        catalog: {
                          ...prev.steps?.catalog,
                          includeDbPrices: !prev.steps?.catalog?.includeDbPrices
                        }
                      }
                    }))
                  }
                  className="flex items-center gap-2 cursor-pointer bg-[#111b21] px-3 py-1.5 rounded-xl border border-slate-700"
                >
                  <span className="text-[11px] font-bold text-slate-300">
                    Conectar a Precios en Vivo DB
                  </span>
                  <div
                    className={`w-8 h-4 rounded-full p-0.5 transition ${
                      config.steps?.catalog?.includeDbPrices ? 'bg-purple-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        config.steps?.catalog?.includeDbPrices ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Encabezado del Catálogo
                </label>
                <textarea
                  rows={2}
                  value={config.steps?.catalog?.header || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        catalog: { ...prev.steps?.catalog, header: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-200 flex items-start gap-2">
                <Sparkles size={16} className="text-purple-400 shrink-0 mt-0.5" />
                <p>
                  El bot extrae automáticamente los precios actuales de la base de datos de productos de la carnicería agrupados por categorías (Asado, Vacunos, Cerdo, Pollo, Embutidos) para que el cliente siempre vea precios vigentes en AR$.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Pie del Catálogo (Llamado a la acción)
                </label>
                <input
                  type="text"
                  value={config.steps?.catalog?.footer || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        catalog: { ...prev.steps?.catalog, footer: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: ORDER INTAKE */}
          {activeStepTab === 'orderIntake' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Toma de Pedidos Paso a Paso</h3>
                  <p className="text-[11px] text-slate-400">
                    Configura cada una de las 5 preguntas secuenciales que guían al cliente para cerrar su pedido
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-center text-[10px] flex items-center justify-center">1</span>
                    Pregunta 1: Cortes y Kilos Deseados
                  </label>
                  <textarea
                    rows={2}
                    value={config.steps?.orderIntake?.askProductsPrompt || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            askProductsPrompt: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-center text-[10px] flex items-center justify-center">2</span>
                    Pregunta 2: Tipo de Entrega (Delivery / Retiro)
                  </label>
                  <textarea
                    rows={2}
                    value={config.steps?.orderIntake?.askDeliveryTypePrompt || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            askDeliveryTypePrompt: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-center text-[10px] flex items-center justify-center">3</span>
                    Pregunta 3: Dirección para Delivery
                  </label>
                  <textarea
                    rows={2}
                    value={config.steps?.orderIntake?.askAddressPrompt || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            askAddressPrompt: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-center text-[10px] flex items-center justify-center">4</span>
                    Pregunta 4: Sucursal para Retiro
                  </label>
                  <textarea
                    rows={2}
                    value={config.steps?.orderIntake?.askBranchPrompt || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            askBranchPrompt: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-center text-[10px] flex items-center justify-center">5</span>
                    Pregunta 5: Forma de Pago
                  </label>
                  <textarea
                    rows={2}
                    value={config.steps?.orderIntake?.askPaymentPrompt || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            askPaymentPrompt: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-emerald-400 block mb-1 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Mensaje Final de Pedido Confirmado
                  </label>
                  <textarea
                    rows={3}
                    value={config.steps?.orderIntake?.orderConfirmedMessage || ''}
                    onChange={e =>
                      setConfig(prev => ({
                        ...prev,
                        steps: {
                          ...prev.steps,
                          orderIntake: {
                            ...prev.steps?.orderIntake,
                            orderConfirmedMessage: e.target.value
                          }
                        }
                      }))
                    }
                    className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Variables disponibles: {'{orderId}'}, {'{summary}'}, {'{delivery}'}, {'{payment}'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ORDER STATUS */}
          {activeStepTab === 'orderStatus' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Consulta de Estado de Pedido</h3>
                  <p className="text-[11px] text-slate-400">
                    Informa en tiempo real el estado actual del pedido del cliente (opción "3")
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Plantilla de Pedido Encontrado
                </label>
                <textarea
                  rows={4}
                  value={config.steps?.orderStatus?.template || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        orderStatus: { ...prev.steps?.orderStatus, template: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Variables: {'{orderId}'}, {'{statusText}'}, {'{total}'}, {'{address}'}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Mensaje si no se encuentra ningún pedido activo
                </label>
                <textarea
                  rows={2}
                  value={config.steps?.orderStatus?.notFoundMessage || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        orderStatus: {
                          ...prev.steps?.orderStatus,
                          notFoundMessage: e.target.value
                        }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* TAB 5: BRANCHES */}
          {activeStepTab === 'branches' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
                  <Store size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Sucursales y Horarios de Atención</h3>
                  <p className="text-[11px] text-slate-400">
                    Lista informativa de las 6 sucursales oficiales de República de la Carne en Córdoba
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Encabezado del Mensaje de Sucursales
                </label>
                <textarea
                  rows={2}
                  value={config.steps?.branches?.header || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        branches: { ...prev.steps?.branches, header: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-200">
                <p className="font-semibold mb-1">Sucursales sincronizadas con el backend:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
                  <li>📍 1. Urca (Av. Menéndez Pidal 3850)</li>
                  <li>📍 2. Recta Martinoli (Recta Martinoli 7200)</li>
                  <li>📍 3. Gauss (Av. Gauss 5400)</li>
                  <li>📍 4. Poeta Lugones (Fray Luis Beltrán 2100)</li>
                  <li>📍 5. Valle Escondido (República de China 1400)</li>
                  <li>📍 6. Villa Allende (Av. Goycoechea 850)</li>
                </ul>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Pie del Mensaje de Sucursales
                </label>
                <input
                  type="text"
                  value={config.steps?.branches?.footer || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        branches: { ...prev.steps?.branches, footer: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 6: HUMAN HANDOFF */}
          {activeStepTab === 'humanHandoff' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <PhoneCall size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Derivación a Asesor Humano</h3>
                  <p className="text-[11px] text-slate-400">
                    Mensaje cuando el cliente solicita hablar con una persona o escribe "asesor" / "5"
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Mensaje de Transferencia a Operador
                </label>
                <textarea
                  rows={4}
                  value={config.steps?.humanHandoff?.message || ''}
                  onChange={e =>
                    setConfig(prev => ({
                      ...prev,
                      steps: {
                        ...prev.steps,
                        humanHandoff: { ...prev.steps?.humanHandoff, message: e.target.value }
                      }
                    }))
                  }
                  className="w-full bg-[#111b21] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 7: KEYWORDS TRIGGERS */}
          {activeStepTab === 'keywords' && (
            <div className="bg-[#182229] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Palabras Clave & Disparadores</h3>
                  <p className="text-[11px] text-slate-400">
                    Términos que activan automáticamente cada sección del flujo sin importar mayúsculas
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'catalog', label: '1. Catálogo & Precios', color: 'purple' },
                  { key: 'newOrder', label: '2. Hacer un Pedido', color: 'amber' },
                  { key: 'trackOrder', label: '3. Estado de Pedido', color: 'sky' },
                  { key: 'branches', label: '4. Sucursales & Horarios', color: 'teal' },
                  { key: 'humanAgent', label: '5. Hablar con Humano', color: 'indigo' },
                  { key: 'cancel', label: 'Cancelar / Volver al Menú', color: 'rose' }
                ].map(group => {
                  const words = config.keywordTriggers?.[group.key] || [];
                  return (
                    <div key={group.key} className="bg-[#111b21] p-3 rounded-xl border border-slate-800/80">
                      <div className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                        <span>{group.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {words.length} disparadores
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {words.map((w, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono border border-slate-700"
                          >
                            <span>"{w}"</span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextWords = words.filter((_, i) => i !== idx);
                                setConfig(prev => ({
                                  ...prev,
                                  keywordTriggers: {
                                    ...prev.keywordTriggers,
                                    [group.key]: nextWords
                                  }
                                }));
                              }}
                              className="text-slate-500 hover:text-rose-400 ml-0.5"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          placeholder="+ agregar palabra y presionar Enter..."
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              e.preventDefault();
                              const newWord = e.target.value.trim().toLowerCase();
                              if (!words.includes(newWord)) {
                                setConfig(prev => ({
                                  ...prev,
                                  keywordTriggers: {
                                    ...prev.keywordTriggers,
                                    [group.key]: [...words, newWord]
                                  }
                                }));
                              }
                              e.target.value = '';
                            }
                          }}
                          className="bg-transparent border-b border-slate-700 text-xs text-white px-2 py-0.5 focus:outline-none focus:border-emerald-500 min-w-[150px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive WhatsApp Simulator (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col h-[700px] bg-[#111b21] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
          {/* Simulator Header */}
          <div className="bg-[#182229] p-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
                🥩
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Simulador de WhatsApp</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Estado: {simState ? simState.step || 'activo' : 'menú principal'}
                </div>
              </div>
            </div>

            <button
              onClick={handleResetSimulator}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
              title="Reiniciar chat de prueba"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {/* Quick Trigger Chips */}
          <div className="bg-[#0b141a] px-3 py-2 border-b border-slate-800/60 flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span className="text-slate-500 text-[10px] shrink-0 font-semibold">Atajos:</span>
            {['hola', '1', '2', '2 kg de vacío', 'delivery', 'retiro', '3', '4', '5', '0'].map(
              cmd => (
                <button
                  key={cmd}
                  onClick={() => handleSimulateSend(cmd)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-300 font-mono text-[10px] border border-slate-700/50 shrink-0 transition"
                >
                  "{cmd}"
                </button>
              )
            )}
          </div>

          {/* Messages Flow Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-[#0b141a]">
            {simHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap shadow-md ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-[#182229] text-slate-200 border border-slate-800 rounded-bl-none font-sans'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.orderCreated && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/40">
                    <CheckCircle2 size={11} /> ¡Pedido persistido en Base de Datos de Pedidos!
                  </div>
                )}
              </div>
            ))}
            {simLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#182229] p-2.5 rounded-2xl w-fit">
                <RefreshCw size={12} className="animate-spin text-emerald-400" />
                <span>Bot procesando mensaje...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSimulateSend();
            }}
            className="p-2.5 bg-[#182229] border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={simInput}
              onChange={e => setSimInput(e.target.value)}
              placeholder="Escribe un mensaje o número..."
              className="flex-1 bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={simLoading || !simInput.trim()}
              className="p-2 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
