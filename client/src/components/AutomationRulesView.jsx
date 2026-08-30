import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Bot, 
  Zap, 
  Settings2, 
  CheckCircle2, 
  MessageSquare, 
  MapPin, 
  CreditCard, 
  Truck, 
  Flame, 
  RefreshCw, 
  Save, 
  RotateCcw,
  Sliders,
  Play,
  Check,
  AlertCircle
} from 'lucide-react';

export default function AutomationRulesView({ socket }) {
  const [automations, setAutomations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  const fetchAutomations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/automations');
      const data = await res.json();
      setAutomations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando reglas de automatización:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();

    if (socket) {
      socket.on('automation:update', (updated) => {
        setAutomations(prev => prev.map(a => a.id === updated.id ? updated : a));
      });

      socket.on('automations:reset', (resetList) => {
        setAutomations(resetList);
      });

      return () => {
        socket.off('automation:update');
        socket.off('automations:reset');
      };
    }
  }, [socket]);

  const handleToggle = async (rule) => {
    try {
      const res = await fetch(`/api/automations/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      const data = await res.json();
      if (data.success) {
        setAutomations(prev => prev.map(a => a.id === rule.id ? data.automation : a));
        triggerFeedback(`Regla "${rule.name}" ${!rule.enabled ? 'activada' : 'desactivada'}`);
      }
    } catch (err) {
      console.error('Error al cambiar estado de regla:', err);
    }
  };

  const handleUpdateConfig = async (ruleId, newConfig) => {
    try {
      const res = await fetch(`/api/automations/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: newConfig })
      });
      const data = await res.json();
      if (data.success) {
        setAutomations(prev => prev.map(a => a.id === ruleId ? data.automation : a));
        triggerFeedback('Ajustes de automatización guardados correctamente');
      }
    } catch (err) {
      console.error('Error al guardar configuración de regla:', err);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('¿Deseas restablecer todas las automatizaciones a sus valores recomendados por defecto?')) return;
    try {
      const res = await fetch('/api/automations/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAutomations(data.automations);
        triggerFeedback('Todas las reglas fueron restablecidas a valores de fábrica');
      }
    } catch (err) {
      console.error('Error al restablecer reglas:', err);
    }
  };

  const triggerFeedback = (msg) => {
    setSaveFeedback(msg);
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const filteredRules = automations.filter(a => {
    if (activeTab === 'all') return true;
    return a.category === activeTab;
  });

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'onboarding': return <Bot className="text-emerald-400" size={18} />;
      case 'assistant': return <Flame className="text-amber-400" size={18} />;
      case 'logistics': return <MapPin className="text-sky-400" size={18} />;
      case 'notifications': return <MessageSquare className="text-purple-400" size={18} />;
      case 'payments': return <CreditCard className="text-[#009ee3]" size={18} />;
      default: return <Sparkles className="text-emerald-400" size={18} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-emerald-400" />
            Lógica de Automatización & Flujo de Pedidos
          </h1>
          <p className="text-xs text-slate-400">
            Personaliza y ajusta en tiempo real las reglas de asistencia virtual, cálculo de carne, asignaciones y avisos por WhatsApp
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Restablecer reglas a valores predeterminados"
          >
            <RotateCcw size={13} />
            Restablecer Defectos
          </button>

          <button
            onClick={fetchAutomations}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs transition"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Success Alert Banner */}
      {saveFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-semibold animate-fade-in shadow-lg">
          <CheckCircle2 size={16} /> {saveFeedback}
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto bg-[#111b21] p-1.5 rounded-2xl border border-slate-800 text-xs">
        {[
          { id: 'all', label: '⚡ Todas las Reglas' },
          { id: 'onboarding', label: '👤 Onboarding & Clientes' },
          { id: 'assistant', label: '🥩 Asesor de Asados' },
          { id: 'logistics', label: '📍 Sucursales & Logística' },
          { id: 'notifications', label: '💬 Mensajes WhatsApp' },
          { id: 'payments', label: '💳 Mercado Pago & Cobros' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#182229]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rules Cards List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={28} className="animate-spin text-emerald-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRules.map(rule => (
            <div
              key={rule.id}
              className={`border rounded-3xl p-5 shadow-xl transition space-y-4 ${
                rule.enabled 
                  ? 'bg-[#182229] border-slate-700/80 hover:border-slate-600' 
                  : 'bg-[#141d22]/70 border-slate-800/80 opacity-70'
              }`}
            >
              {/* Card Header: Title & Switch */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#111b21] border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    {getCategoryIcon(rule.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white leading-tight">{rule.name}</h3>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-extrabold border ${
                        rule.enabled 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                          : 'bg-slate-700/30 text-slate-400 border-slate-700'
                      }`}>
                        {rule.enabled ? '🟢 Activa' : '⚪ Desactivada'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{rule.description}</p>
                  </div>
                </div>

                {/* Master Switch */}
                <button
                  type="button"
                  onClick={() => handleToggle(rule)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                    rule.enabled ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                  title={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition" />
                </button>
              </div>

              {/* Configurable Body according to Category */}
              <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                
                {/* 1. Onboarding Config */}
                {rule.id === 'auto-onboarding-new-clients' && (
                  <div className="space-y-3">
                    <label className="text-slate-300 font-semibold block">
                      Mensaje de Bienvenida y Solicitud de Datos para Clientes No Registrados:
                    </label>
                    <textarea
                      rows={3}
                      value={rule.config?.welcomeTemplate || ''}
                      onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, welcomeTemplate: e.target.value })}
                      className="w-full p-3 rounded-2xl bg-[#111b21] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center gap-4 text-[11px] text-slate-400">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.config?.askAddress ?? true}
                          onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, askAddress: e.target.checked })}
                          className="rounded text-emerald-500 focus:ring-0"
                        />
                        Pedir Dirección y Barrio
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.config?.requireConfirmation ?? true}
                          onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, requireConfirmation: e.target.checked })}
                          className="rounded text-emerald-500 focus:ring-0"
                        />
                        Exigir Confirmación Explícita ("SÍ")
                      </label>
                    </div>
                  </div>
                )}

                {/* 2. BBQ Calculator Config */}
                {rule.id === 'auto-bbq-calculator' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-[#111b21] border border-slate-800 space-y-1">
                      <label className="text-slate-400 text-[11px] font-bold block">Gramos Estándar / Persona:</label>
                      <input
                        type="number"
                        value={rule.config?.gramsPerPersonStandard || 500}
                        onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, gramsPerPersonStandard: Number(e.target.value) })}
                        className="w-full p-2 bg-[#182229] border border-slate-700 rounded-xl text-white font-bold"
                      />
                      <span className="text-[10px] text-emerald-400 block">Recomendado: 500g</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#111b21] border border-slate-800 space-y-1">
                      <label className="text-slate-400 text-[11px] font-bold block">Gramos Opción Económica:</label>
                      <input
                        type="number"
                        value={rule.config?.gramsPerPersonEconomic || 450}
                        onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, gramsPerPersonEconomic: Number(e.target.value) })}
                        className="w-full p-2 bg-[#182229] border border-slate-700 rounded-xl text-white font-bold"
                      />
                      <span className="text-[10px] text-emerald-400 block">Recomendado: 450g</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#111b21] border border-slate-800 space-y-1">
                      <label className="text-slate-400 text-[11px] font-bold block">Precio Combo Asadazo ($):</label>
                      <input
                        type="number"
                        value={rule.config?.starComboPrice || 39999}
                        onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, starComboPrice: Number(e.target.value) })}
                        className="w-full p-2 bg-[#182229] border border-slate-700 rounded-xl text-emerald-400 font-bold"
                      />
                      <span className="text-[10px] text-slate-400 block">4 kg + Vino regalo</span>
                    </div>
                  </div>
                )}

                {/* 3. Branch Derivation Config */}
                {rule.id === 'auto-branch-derivation' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-semibold">Radio máximo de cobertura delivery:</span>
                      <span className="font-bold text-emerald-400">{rule.config?.maxDeliveryRadiusKm || 15} km</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={rule.config?.maxDeliveryRadiusKm || 15}
                      onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, maxDeliveryRadiusKm: Number(e.target.value) })}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      Calcula automáticamente la sucursal más cercana entre las 6 sedes de Córdoba por geocodificación.
                    </div>
                  </div>
                )}

                {/* 4. WhatsApp Notifications Config */}
                {rule.id === 'auto-order-status-whatsapp' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-semibold flex items-center justify-between">
                        <span>Plantilla "En Preparación":</span>
                        <span className="text-[10px] font-mono text-slate-400">{'{orderId}'}</span>
                      </label>
                      <input
                        type="text"
                        value={rule.config?.templates?.preparing || ''}
                        onChange={(e) => handleUpdateConfig(rule.id, {
                          ...rule.config,
                          templates: { ...rule.config.templates, preparing: e.target.value }
                        })}
                        className="w-full p-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-semibold flex items-center justify-between">
                        <span>Plantilla "En Reparto":</span>
                        <span className="text-[10px] font-mono text-slate-400">{'{orderId}'}, {'{driverName}'}, {'{address}'}</span>
                      </label>
                      <input
                        type="text"
                        value={rule.config?.templates?.in_transit || ''}
                        onChange={(e) => handleUpdateConfig(rule.id, {
                          ...rule.config,
                          templates: { ...rule.config.templates, in_transit: e.target.value }
                        })}
                        className="w-full p-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-semibold flex items-center justify-between">
                        <span>Plantilla "Entregado":</span>
                        <span className="text-[10px] font-mono text-slate-400">{'{orderId}'}</span>
                      </label>
                      <input
                        type="text"
                        value={rule.config?.templates?.delivered || ''}
                        onChange={(e) => handleUpdateConfig(rule.id, {
                          ...rule.config,
                          templates: { ...rule.config.templates, delivered: e.target.value }
                        })}
                        className="w-full p-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* 5. Mercado Pago & Payments Config */}
                {rule.id === 'auto-payment-mercadopago' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[11px] font-bold block">Entorno de Mercado Pago:</label>
                      <select
                        value={rule.config?.mpMode || 'sandbox'}
                        onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, mpMode: e.target.value })}
                        className="w-full p-2.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:border-emerald-500"
                      >
                        <option value="sandbox">🧪 Modo Prueba (Sandbox con Tarjetas Test)</option>
                        <option value="production">🚀 Modo Producción (Cobros Reales)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[11px] font-bold block">Alias Mercado Pago:</label>
                      <input
                        type="text"
                        value={rule.config?.aliasMP || 'republica.carne.mp'}
                        onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, aliasMP: e.target.value })}
                        className="w-full p-2 bg-[#111b21] border border-slate-700 rounded-xl text-white font-mono font-bold"
                      />
                    </div>
                  </div>
                )}

              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
