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
  AlertCircle,
  ArrowRight,
  GitBranch,
  ShoppingBag,
  Send,
  HelpCircle,
  UserCheck,
  PhoneCall,
  CheckCircle,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';
import BroadcastCampaignsView from './BroadcastCampaignsView';

export default function AutomationRulesView({ socket }) {
  const [automations, setAutomations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [viewMode, setViewMode] = useState('flow'); // 'flow' | 'rules' | 'broadcast'
  const [activeTab, setActiveTab] = useState('all');
  
  // Simulador de Flujo en Vivo
  const [simQuery, setSimQuery] = useState('hola');
  const [simCustomerName, setSimCustomerName] = useState('Don Juan');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [selectedFlowNode, setSelectedFlowNode] = useState('greeting');

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

  const handleTestSimulate = async (customText = null) => {
    const textToSend = customText !== null ? customText : simQuery;
    if (!textToSend.trim()) return;

    setSimLoading(true);
    try {
      const res = await fetch('/api/neural-memory/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: textToSend })
      });
      const neuralData = await res.json();

      // Generar respuesta IA en vivo del servidor
      const testRes = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: textToSend,
          customerName: simCustomerName
        })
      });

      let replyText = '';
      if (testRes.ok) {
        const testData = await testRes.json();
        replyText = testData.reply || testData.text;
      }

      if (!replyText) {
        // Fallback local si endpoint de test directo
        replyText = `¡Hola ${simCustomerName}! 🥩 Carlos por acá. Sumamos tu elección y te calculamos los mejores cortes con envío en el día. 🙌`;
      }

      setSimResult({
        input: textToSend,
        reply: replyText,
        neuralContext: neuralData?.contextSnippet || '',
        matchedNodes: neuralData?.results || []
      });
    } catch (err) {
      console.error('Error en simulación:', err);
    } finally {
      setSimLoading(false);
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

  // Etapas del Flujo de Conversación & Venta
  const FLOW_STAGES = [
    {
      id: 'greeting',
      step: '1',
      title: 'Saludo & Detección de Cliente',
      icon: UserCheck,
      color: 'emerald',
      description: 'Saluda por su nombre personalizado. Si el cliente tiene un pedido activo, le consulta si desea ver su estado o modificarlo antes de reiniciar.',
      triggers: ['"hola"', '"buenas"', '"buen día"', 'Audio de WhatsApp'],
      agentAction: 'Ofrece directamente el Combo Estrella y cortes destacados del día con sus precios por kg y opciones 1 a 8.'
    },
    {
      id: 'proactive_offers',
      step: '2',
      title: 'Oferta Proactiva de Cortes & Menú',
      icon: ShoppingBag,
      color: 'purple',
      description: 'Presenta opciones numeradas (1 al 8) para que el cliente elija rápido con un solo número o nombre de corte.',
      triggers: ['"1"', '"combo asadazo"', '"2 kg de tapa de cuadril"', '"ofertas"'],
      agentAction: 'Asienta el corte en el pedido, calcula el subtotal exacto y ofrece complementos de asado.'
    },
    {
      id: 'portion_calc',
      step: '3',
      title: 'Cálculo de Carne & Comensales',
      icon: Flame,
      color: 'amber',
      description: 'Calcula automáticamente 500g de carne por persona para que no falte nada y recomienda la combinación ideal.',
      triggers: ['"somos 6 personas"', '"asado para 10"', '"calcular para 4"'],
      agentAction: 'Recomienda Combo Asadazo o combinación de Costillar + Vacío + Embutidos.'
    },
    {
      id: 'cross_selling',
      step: '4',
      title: 'Cross-Selling & Complementos',
      icon: Sparkles,
      color: 'indigo',
      description: 'Ofrece sumar embutidos artesanales en promo (2kg x $10.000), bolsa de Carbón Quebracho ($2.200) o Vino Malbec ($5.500).',
      triggers: ['"sumale carbón"', '"agrega 1kg de chori"', '"nada más, solo eso"'],
      agentAction: 'Actualiza el subtotal acumulado de la orden al instante.'
    },
    {
      id: 'delivery_corroboration',
      step: '5',
      title: 'Corroboración de Entrega & Sucursal',
      icon: MapPin,
      color: 'sky',
      description: 'Pregunta si prefiere Delivery a domicilio en el día o Retiro por alguna de nuestras 6 sucursales en Córdoba.',
      triggers: ['"envío a Locelso 7100"', '"retiro por sucursal Pidal"', '"av funes 1115"'],
      agentAction: 'Genera la Ficha de Registro y solicita confirmación con un simple "SÍ".'
    },
    {
      id: 'payment_checkout',
      step: '6',
      title: 'Métodos de Pago & Link Mercado Pago',
      icon: CreditCard,
      color: 'cyan',
      description: 'Ofrece Efectivo contraentrega, Transferencia Bancaria con alias oficial o Link de Pago Checkout Pro.',
      triggers: ['"1 (Efectivo)"', '"2 (Transferencia)"', '"3 (Mercado Pago)"', '"link de pago"'],
      agentAction: 'Emite comprobante, alias `republica.carne.mp` o genera link de pago instantáneo.'
    },
    {
      id: 'order_closing',
      step: '7',
      title: 'Cierre, Códigos PLU & Derivación',
      icon: Truck,
      color: 'emerald',
      description: 'Guarda la orden con sus códigos PLU de balanza, notifica automáticamente por WhatsApp a la sucursal y chofer.',
      triggers: ['Confirmación final de pedido'],
      agentAction: 'Deriva el pedido a la carnicería más cercana y avisa al cliente con seguimiento en vivo.'
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-emerald-400" />
            Flujo de Automatización & Venta Inteligente
          </h1>
          <p className="text-xs text-slate-400">
            Supervisa el diagrama interactivo de ventas, atención personalizada, oferta proactiva de productos y reglas de WhatsApp
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Switcher Vista Flujo vs Reglas */}
          <div className="flex items-center bg-[#182229] border border-slate-700 rounded-xl p-1">
            <button
              onClick={() => setViewMode('flow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'flow' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <GitBranch size={14} />
              <span>Diagrama de Flujo</span>
            </button>
            <button
              onClick={() => setViewMode('rules')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'rules' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders size={14} />
              <span>Reglas & Switches</span>
            </button>
            <button
              onClick={() => setViewMode('broadcast')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'broadcast' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Send size={14} />
              <span>Difusiones & Ofertas</span>
            </button>
          </div>

          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Restablecer reglas a valores predeterminados"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Defectos</span>
          </button>
        </div>
      </div>

      {/* Success Alert Banner */}
      {saveFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-semibold animate-fade-in shadow-lg">
          <CheckCircle2 size={16} /> {saveFeedback}
        </div>
      )}

      {viewMode === 'broadcast' ? (
        <BroadcastCampaignsView socket={socket} />
      ) : viewMode === 'flow' ? (
        /* VISTA DIAGRAMA DE FLUJO INTERACTIVO DE CONVERSACIÓN & VENTA */
        <div className="space-y-6">
          
          {/* Banner Resumen del Flujo */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-purple-950/30 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                  Motor de Venta Activo
                </span>
                <span className="text-xs text-slate-400">7 Etapas Automatizadas con IA y Códigos PLU</span>
              </div>
              <h2 className="text-base font-bold text-white">Atención Rápida, Asesoramiento de Cortes y Cierre en 3 Pasos</h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                El agente ofrece proactivamente el menú destacado del día, calcula los kilos por comensal, suma complementos, corrobora la entrega y notifica a la sucursal automáticamente.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleTestSimulate('hola')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
              >
                <Play size={13} />
                <span>Simular Saludo</span>
              </button>
            </div>
          </div>

          {/* Diagrama de Nodos del Flujo */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers size={14} className="text-emerald-400" />
              Secuencia del Flujo de Venta & Corroboración
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {FLOW_STAGES.map((st, idx) => {
                const Icon = st.icon;
                const isSelected = selectedFlowNode === st.id;

                return (
                  <div
                    key={st.id}
                    onClick={() => setSelectedFlowNode(st.id)}
                    className={`cursor-pointer rounded-2xl p-4 border transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#182229] border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                        : 'bg-[#111b21] hover:bg-[#182229] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-extrabold text-xs flex items-center justify-center border border-emerald-500/30">
                            {st.step}
                          </span>
                          <span className="text-xs font-bold text-white">{st.title}</span>
                        </div>
                        <Icon size={16} className="text-emerald-400 shrink-0" />
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                        {st.description}
                      </p>

                      <div className="space-y-1.5 pt-2 border-t border-slate-800">
                        <div className="text-[10px] text-slate-400 font-semibold">Disparadores:</div>
                        <div className="flex flex-wrap gap-1">
                          {st.triggers.map((tr, i) => (
                            <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#202c33] text-emerald-300 border border-slate-700">
                              {tr}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Acción del Asesor:</span>
                      <ChevronRight size={13} className="text-emerald-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulador Interactivo de Conversación en Tiempo Real */}
          <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Simulador en Vivo del Flujo de Conversación</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Cliente Simulado:</span>
                <input
                  type="text"
                  value={simCustomerName}
                  onChange={(e) => setSimCustomerName(e.target.value)}
                  className="px-2.5 py-1 bg-[#182229] border border-slate-700 rounded-lg text-xs text-white font-bold w-28 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Accesos Rápidos de Prueba */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-500 font-semibold text-[11px] shrink-0">Probar rápido:</span>
              {[
                { label: '👋 Saludo inicial', text: 'hola' },
                { label: '🔥 Opción 1 (Combo Asadazo)', text: '1' },
                { label: '🥩 2kg Tapa de Cuadril', text: 'quiero 2 kilos de tapa de cuadril' },
                { label: '👥 Asado para 6', text: 'somos 6 personas para un asado' },
                { label: '📍 Envío con dirección', text: 'mandamelo a Locelso 7100, Don Juan' },
                { label: '💳 Pagar con Transferencia', text: '2' },
                { label: '🛵 Consultar estado', text: 'como viene mi pedido' },
                { label: '❌ Cancelar orden', text: 'quiero cancelar mi pedido' }
              ].map((btn, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSimQuery(btn.text);
                    handleTestSimulate(btn.text);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 whitespace-nowrap transition text-[11px]"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Input y Botón Enviar */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Escribe lo que diría el cliente (ej: 'hola', '1', 'quiero 2kg de vacio y carbon')..."
                value={simQuery}
                onChange={(e) => setSimQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestSimulate()}
                className="flex-1 px-4 py-2.5 bg-[#182229] border border-slate-700 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => handleTestSimulate()}
                disabled={simLoading}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
              >
                {simLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>Probar Flujo</span>
              </button>
            </div>

            {/* Resultado de la Simulación */}
            {simResult && (
              <div className="bg-[#182229] border border-slate-700/80 rounded-2xl p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Mensaje entrante del cliente:</span>
                  <span className="font-mono text-emerald-400 font-bold">"{simResult.input}"</span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Bot size={14} className="text-emerald-400" />
                    Respuesta Inteligente del Asesor Virtual:
                  </span>
                  <div className="p-3.5 rounded-xl bg-[#111b21] border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {simResult.reply}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VISTA REGLAS & SWITCHES INDIVIDUALES */
        <div className="space-y-4">
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

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={28} className="animate-spin text-emerald-500" />
            </div>
          ) : (
            filteredRules.map(rule => (
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rule.enabled 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-700/30 text-slate-400'
                        }`}>
                          {rule.enabled ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{rule.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggle(rule)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      rule.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Config Controls */}
                {rule.config && Object.keys(rule.config).length > 0 && (
                  <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(rule.config).map(([key, val]) => (
                      <div key={key} className="bg-[#111b21] p-3 rounded-2xl border border-slate-800">
                        <label className="text-[11px] font-medium text-slate-400 block mb-1 capitalize">
                          {key.replace(/([A-Z])/g, ' $1')}
                        </label>
                        {typeof val === 'boolean' ? (
                          <button
                            onClick={() => handleUpdateConfig(rule.id, { ...rule.config, [key]: !val })}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                              val ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {val ? 'Habilitado' : 'Deshabilitado'}
                          </button>
                        ) : typeof val === 'number' ? (
                          <input
                            type="number"
                            value={val}
                            onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, [key]: Number(e.target.value) })}
                            className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleUpdateConfig(rule.id, { ...rule.config, [key]: e.target.value })}
                            className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
