import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Sparkles, 
  PhoneCall, 
  Store, 
  Bike, 
  ShieldCheck, 
  MessageSquare, 
  Send, 
  Volume2, 
  CheckCircle2, 
  Crown, 
  User, 
  Sliders, 
  RefreshCw, 
  Play, 
  Layers, 
  HeartHandshake, 
  Flame,
  FileText,
  Activity,
  AlertTriangle,
  ShoppingCart,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Cpu
} from 'lucide-react';

import { 
  SYSTEM_AI_PROVIDERS, 
  SYSTEM_AI_MODELS, 
  getDefaultModelForProvider 
} from '../utils/aiModels.js';

export default function AgentsView({ socket, currentUser }) {
  const [agents, setAgents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'simulator' | 'training'

  // Modal de Edición / Creación
  const [agentModal, setAgentModal] = useState(null); // null | { mode: 'create'|'edit', data: { ... } }
  const [isTestingAiModel, setIsTestingAiModel] = useState(false);
  const [aiModelTestResult, setAiModelTestResult] = useState(null);
  const [previewingVoice, setPreviewingVoice] = useState(false);

  const handleTestVoice = async (voiceId) => {
    try {
      setPreviewingVoice(true);
      const res = await fetch('/api/speech/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: voiceId || 'es-AR-TomasNeural' })
      });
      const data = await res.json();
      if (res.ok && data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play().catch(e => console.warn('Error reproduciendo audio:', e));
      } else {
        alert(data.error || 'Error al generar la prueba de voz');
      }
    } catch (err) {
      alert('Error de conexión al probar la voz');
    } finally {
      setPreviewingVoice(false);
    }
  };

  // Simulador de Chat
  const [simAgent, setSimAgent] = useState(null);
  const [simInput, setSimInput] = useState('');
  const [simSenderRole, setSimSenderRole] = useState('client'); // 'client' | 'agent'
  const [simMessages, setSimMessages] = useState([]);
  const [isSimLoading, setIsSimLoading] = useState(false);
  const [simCart, setSimCart] = useState(null);

  // Batería de Tests & Entrenamiento
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testSuiteResults, setTestSuiteResults] = useState(null);

  // Preset Avatars
  const PRESET_AVATARS = [
    { url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80', label: 'Carlos (Maestro Carnicero)' },
    { url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80', label: 'Valeria (Logística & Despacho)' },
    { url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80', label: 'Martín (Cortes Premium)' },
    { url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', label: 'Roberto (Administrador)' },
    { url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80', label: 'Lucía (Encargada Sucursal)' },
    { url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', label: 'Romina (Atención al Cliente)' }
  ];

  const AI_PROVIDERS = SYSTEM_AI_PROVIDERS;
  const AI_MODEL_PRESETS = SYSTEM_AI_MODELS;


  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const [agRes, brRes] = await Promise.all([
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/branches').then(r => r.json())
      ]);
      const loadedAgents = Array.isArray(agRes) ? agRes : [];
      setAgents(loadedAgents);
      setBranches(Array.isArray(brRes) ? brRes : []);
      if (!simAgent && loadedAgents.length > 0) {
        setSimAgent(loadedAgents.find(a => a.isDefault) || loadedAgents[0]);
      }
    } catch (err) {
      console.error('Error cargando agentes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    if (socket) {
      socket.on('agents:sync', (updatedAgents) => {
        if (Array.isArray(updatedAgents)) {
          setAgents(updatedAgents);
          if (simAgent) {
            const updatedSim = updatedAgents.find(a => a.id === simAgent.id);
            if (updatedSim) setSimAgent(updatedSim);
          }
        }
      });
      return () => {
        socket.off('agents:sync');
      };
    }
  }, [socket]);

  const handleSetActive = async (agentId) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/set-default`, { method: 'POST' });
      if (res.ok) {
        fetchAgents();
      }
    } catch (err) {
      console.error('Error activando agente:', err);
    }
  };

  const handleDelete = async (agentId) => {
    if (!window.confirm('¿Seguro que deseas eliminar este agente?')) return;
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAgents();
      }
    } catch (err) {
      console.error('Error eliminando agente:', err);
    }
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!agentModal) return;

    const { mode, data } = agentModal;
    const url = mode === 'create' ? '/api/agents' : `/api/agents/${data.id}`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setAgentModal(null);
        fetchAgents();
      }
    } catch (err) {
      console.error('Error guardando agente:', err);
    }
  };

  // Simulación interactiva de conversación
  const handleStartSim = (agent) => {
    setSimAgent(agent);
    setSimMessages([
      { sender: 'agent', text: agent.firstMessage || '¡Hola! ¿En qué te puedo asesorar hoy? 🥩' }
    ]);
    setSimCart(null);
    setActiveTab('simulator');
  };

  const handleSendSimMessage = async (e) => {
    e?.preventDefault();
    if (!simInput.trim() || !simAgent || isSimLoading) return;

    const textToSend = simInput.trim();
    setSimInput('');

    if (simSenderRole === 'agent') {
      // Mensaje manual como agente (operador humano)
      setSimMessages(prev => [...prev, { sender: 'agent', text: textToSend }]);
      return;
    }

    // Mensaje como cliente -> Dispara respuesta automática del Agente IA
    const updatedHistory = [...simMessages, { sender: 'user', text: textToSend }];
    setSimMessages(updatedHistory);
    setIsSimLoading(true);

    try {
      const res = await fetch(`/api/agents/${simAgent.id}/test-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: textToSend,
          history: updatedHistory.map(m => ({
            sender: m.sender === 'user' ? 'user' : 'bot',
            content: m.text
          }))
        })
      });
      const data = await res.json();
      if (data.reply) {
        setSimMessages(prev => [...prev, { 
          sender: 'agent', 
          text: data.reply,
          modelInfo: data.modelInfo,
          tokens: data.tokens
        }]);
      }
      if (data.canonicalCart) {
        setSimCart(data.canonicalCart);
      }
    } catch (err) {
      console.error('Error en simulación:', err);
      setSimMessages(prev => [...prev, { sender: 'agent', text: 'Error al simular la respuesta del agente.' }]);
    } finally {
      setIsSimLoading(false);
    }
  };

  // Ejecución de la batería de pruebas de entrenamiento
  const handleRunTestSuite = async () => {
    setIsRunningTests(true);
    setTestSuiteResults(null);
    try {
      const res = await fetch('/api/agents/run-test-suite', { method: 'POST' });
      const data = await res.json();
      setTestSuiteResults(data);
    } catch (err) {
      console.error('Error ejecutando tests:', err);
      setTestSuiteResults({
        passed: false,
        total: 0,
        passedCount: 0,
        failedCount: 1,
        results: [{ id: 'err', name: 'Error de Red', passed: false, error: err.message }]
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  const filteredAgents = agents.filter(a => {
    const matchSearch = (a.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.roleLabel || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.backstory || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || a.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getRoleBadge = (role) => {
    switch (role) {
      case 'vendedor':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><Flame size={12} /> Vendedor Parrillero</span>;
      case 'logistica':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1"><Bike size={12} /> Logística & Despacho</span>;
      case 'administrador':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><ShieldCheck size={12} /> Administrador</span>;
      case 'encargado':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"><Store size={12} /> Encargado Sucursal</span>;
      case 'soporte':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30 flex items-center gap-1"><HeartHandshake size={12} /> Soporte & Postventa</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600">Asesor IA</span>;
    }
  };

  const handleTestAgentModel = async () => {
    if (!agentModal?.data) return;
    setIsTestingAiModel(true);
    setAiModelTestResult(null);
    try {
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: agentModal.data.aiProvider || 'gemini',
          model: agentModal.data.aiModel || 'gemini-2.5-flash',
          apiKey: agentModal.data.apiKeyOverride || '',
          customEndpoint: agentModal.data.customEndpoint || '',
          temperature: agentModal.data.aiTemperature ?? 0.7
        })
      });
      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        data = {
          success: false,
          error: `Error en servidor (${res.status} ${res.statusText || 'Gateway Timeout'}). El servidor tardó en responder.`,
          isFallback: false
        };
      }
      setAiModelTestResult(data);
    } catch (err) {
      setAiModelTestResult({
        success: false,
        error: err.message || 'Error de red al intentar probar el modelo',
        isFallback: false
      });
    } finally {
      setIsTestingAiModel(false);
    }
  };

  const getModelBadge = (provider, model) => {
    if (provider === 'system_default' || !provider) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 shadow-sm">
          <span className="text-xs">⚙️</span>
          <span className="font-mono text-emerald-300">Por Defecto del Sistema</span>
        </span>
      );
    }
    const prov = SYSTEM_AI_PROVIDERS.find(p => p.id === provider) || SYSTEM_AI_PROVIDERS[0];
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 shadow-sm">
        <span className="text-xs">{prov?.icon || '🤖'}</span>
        <span className="font-mono text-purple-300">{model || prov?.name}</span>
      </span>
    );
  };


  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900/80 border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500/30 to-purple-500/30 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Bot size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Agentes IA & Entrenamiento
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  {agents.length} Activos
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Personalizá personalidades, roles, historias, modelos de IA (Gemini, OpenAI, Claude, DeepSeek, Groq) y entrená su comportamiento.
              </p>
            </div>
          </div>
        </div>

        {/* Action Tabs & New Agent Button */}
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'list' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={14} /> Equipo de Agentes
            </button>
            <button
              onClick={() => {
                if (!simAgent && agents.length > 0) setSimAgent(agents.find(a => a.isDefault) || agents[0]);
                setActiveTab('simulator');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'simulator' 
                  ? 'bg-purple-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles size={14} /> Simulador de Chat
            </button>
            <button
              onClick={() => setActiveTab('training')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'training' 
                  ? 'bg-amber-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity size={14} /> Tests & Entrenamiento
            </button>
          </div>

          <button
            onClick={() => setAgentModal({
              mode: 'create',
              data: {
                name: '',
                role: 'vendedor',
                roleLabel: 'Asesor Comercial de Carnicería',
                avatar: PRESET_AVATARS[0].url,
                backstory: '',
                personality: 'Cálido, cordobés amigable y experto en asados.',
                promptInstructions: '',
                firstMessage: '¡Hola! 👋 Soy tu asesor virtual de República de la Carne. ¿En qué te puedo ayudar hoy?',
                aiProvider: 'system_default',
                aiModel: 'default',
                aiTemperature: 0.7,
                aiMaxTokens: 500,
                apiKeyOverride: '',
                customEndpoint: '',
                voiceType: 'system_default',
                ttsProvider: 'inherited',
                voiceId: '',
                assignedBranches: ['all'],
                isAI: true,
                phoneNumber: '',
                whatsappSessionId: 'default',
                isActive: true,
                isDefault: false
              }
            })}

            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
          >
            <Plus size={16} /> Nuevo Agente IA
          </button>
        </div>
      </div>

      {/* Main Body */}
      {activeTab === 'list' && (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, rol o biografía..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700/60 pl-9 pr-4 py-2 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              {['all', 'vendedor', 'logistica', 'encargado', 'administrador', 'soporte'].map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    roleFilter === r
                      ? 'bg-slate-700 text-slate-100 border border-slate-600 font-bold'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  {r === 'all' ? 'Todos los Roles' : r === 'vendedor' ? '🥩 Vendedores' : r === 'logistica' ? '🛵 Logística' : r === 'encargado' ? '🏪 Encargados' : r === 'administrador' ? '👑 Admin' : '💬 Soporte'}
                </button>
              ))}
            </div>
          </div>

          {/* Agents Grid */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <RefreshCw size={28} className="animate-spin text-emerald-400" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/30 rounded-3xl border border-slate-800/60">
              <Bot size={48} className="mx-auto text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-300">No se encontraron agentes</h3>
              <p className="text-xs text-slate-500 mt-1">Probá con otro término de búsqueda o creá uno nuevo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAgents.map(agent => {
                const isDefault = agent.isDefault;
                return (
                  <div
                    key={agent.id}
                    className={`relative rounded-2xl bg-slate-900/80 border p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-slate-950/50 ${
                      isDefault 
                        ? 'border-emerald-500/60 shadow-lg shadow-emerald-500/10 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20' 
                        : 'border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* Default WhatsApp Active Crown Badge */}
                    {isDefault && (
                      <div className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md shadow-emerald-500/20">
                        <Crown size={12} className="fill-slate-950" /> Agente Activo en WhatsApp
                      </div>
                    )}

                    <div>
                      {/* Avatar & Title Header */}
                      <div className="flex items-start gap-4 mb-4">
                        <div className="relative">
                          <img
                            src={agent.avatar || PRESET_AVATARS[0].url}
                            alt={agent.name}
                            className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-700 shadow-md"
                          />
                          <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-900 ${agent.isActive ? 'bg-emerald-500 ring-2 ring-emerald-500/20 animate-pulse' : 'bg-slate-500'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-bold text-slate-100 truncate flex items-center gap-1.5">
                            {agent.name}
                          </h3>
                          <p className="text-xs text-slate-400 font-medium truncate mb-2">
                            {agent.roleLabel || 'Asesor Comercial'}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                              agent.isAI !== false 
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                                : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                            }`}>
                              {agent.isAI !== false ? <Bot size={10} /> : <User size={10} />}
                              {agent.isAI !== false ? 'Perfil IA' : 'Humano'}
                            </span>
                            {agent.phoneNumber && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                📱 {agent.phoneNumber}
                              </span>
                            )}
                            {getRoleBadge(agent.role)}
                            {agent.isAI !== false && getModelBadge(agent.aiProvider, agent.aiModel)}
                          </div>
                        </div>
                      </div>

                      {/* Backstory & Personality Box */}
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 mb-4 space-y-2">
                        {agent.backstory && (
                          <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                            <span className="font-bold text-slate-400">Historia: </span>
                            {agent.backstory}
                          </p>
                        )}
                        {agent.personality && (
                          <p className="text-[11px] text-emerald-400 font-medium line-clamp-2">
                            <span className="font-bold text-slate-400">Personalidad: </span>
                            {agent.personality}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStartSim(agent)}
                          title="Simular conversación en vivo"
                          className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Sparkles size={13} /> Probar Chat
                        </button>
                        <button
                          onClick={() => setAgentModal({ mode: 'edit', data: { ...agent } })}
                          title="Editar configuración"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        >
                          <Edit3 size={15} />
                        </button>
                        {!isDefault && (
                          <button
                            onClick={() => handleDelete(agent.id)}
                            title="Eliminar agente"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      {!isDefault ? (
                        <button
                          onClick={() => handleSetActive(agent.id)}
                          className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <Check size={13} /> Activar
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 size={14} /> En Uso
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Simulador Interactivo Dual */}
      {activeTab === 'simulator' && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 gap-6">
          {/* Main Chat Simulation Window */}
          <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header del Simulador */}
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={simAgent?.avatar || PRESET_AVATARS[0].url}
                  alt={simAgent?.name}
                  className="w-10 h-10 rounded-xl object-cover border border-emerald-500/50"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-100">{simAgent?.name}</span>
                    {getRoleBadge(simAgent?.role || 'vendedor')}
                    {getModelBadge(simAgent?.aiProvider, simAgent?.aiModel)}
                  </div>
                  <p className="text-[11px] text-slate-400">{simAgent?.roleLabel || 'Asesor IA'} • Temp: {simAgent?.aiTemperature ?? 0.7} • Tokens: {simAgent?.aiMaxTokens || 500}</p>
                </div>
              </div>

              {/* Selector de Agente y Botón Limpiar */}
              <div className="flex items-center gap-2">
                <select
                  value={simAgent?.id || ''}
                  onChange={e => {
                    const chosen = agents.find(a => a.id === e.target.value);
                    if (chosen) handleStartSim(chosen);
                  }}
                  className="bg-slate-950 border border-slate-700 text-xs text-slate-200 px-3 py-1.5 rounded-xl focus:outline-none focus:border-purple-500"
                >
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.aiModel || a.role}) {a.isDefault ? '👑' : ''}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setSimMessages([
                      { sender: 'agent', text: simAgent?.firstMessage || '¡Hola! ¿En qué te puedo asesorar hoy? 🥩' }
                    ]);
                    setSimCart(null);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1"
                >
                  <RefreshCw size={13} /> Reiniciar
                </button>
              </div>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-950/40">
              {simMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[80%] flex flex-col gap-1">
                    <span className={`text-[10px] font-bold px-1 ${msg.sender === 'user' ? 'text-right text-emerald-400' : 'text-slate-400'}`}>
                      {msg.sender === 'user' ? '👤 Cliente Simulado' : `🤖 ${simAgent?.name || 'Agente'}`}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-none shadow-lg shadow-emerald-600/10'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-md'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      {msg.modelInfo && (
                        <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="text-purple-300">⚡ {msg.modelInfo.provider} / {msg.modelInfo.model}</span>
                          <div className="flex items-center gap-2">
                            {Boolean(msg.modelInfo.totalTokens || msg.tokens?.totalTokens) && (
                              <span className="text-emerald-400 font-bold">🪙 {msg.modelInfo.totalTokens || msg.tokens?.totalTokens} tokens</span>
                            )}
                            <span className="text-slate-500">{msg.modelInfo.latencyMs}ms</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isSimLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-slate-700 text-slate-400 text-xs px-4 py-2 rounded-2xl flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin text-purple-400" />
                    <span>{simAgent?.name} está procesando y respondiendo...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Test Prompt Badges */}
            <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">Escenarios rápidos:</span>
              {[
                'Hola, quiero 1 kg de matambre y 1 bolsa de carbón',
                'En vez de matambre poneme 2 kg de vacío',
                'Sacale el carbón y sumale 2 kg de chorizo criollo',
                'Quiero un asado para 4 personas',
                '¿Tenés 2 kg de lomo?',
                'Quiero cancelar el pedido'
              ].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setSimInput(prompt)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] whitespace-nowrap border border-slate-700 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Role Switcher & Input Bar */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Escribir como:</span>
                  <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSimSenderRole('client')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        simSenderRole === 'client' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      👤 Cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimSenderRole('agent')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        simSenderRole === 'agent' ? 'bg-purple-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      👔 Agente / Humano
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500">
                  {simSenderRole === 'client' ? 'Dispara respuesta de IA' : 'Intervención manual de operador'}
                </span>
              </div>

              <form onSubmit={handleSendSimMessage} className="flex gap-2">
                <input
                  type="text"
                  value={simInput}
                  onChange={e => setSimInput(e.target.value)}
                  placeholder={simSenderRole === 'client' ? `Escribir mensaje como cliente a ${simAgent?.name || 'este agente'}...` : `Escribir mensaje manual como ${simAgent?.name || 'agente'}...`}
                  className="flex-1 bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={isSimLoading || !simInput.trim()}
                  className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/20"
                >
                  <Send size={14} /> Enviar
                </button>
              </form>
            </div>
          </div>

          {/* Right Inspector: Working Memory & State */}
          <div className="w-full lg:w-80 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Zap size={18} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Memoria de Carrito Activa
              </h3>
            </div>

            {simCart && simCart.items && simCart.items.length > 0 ? (
              <div className="space-y-3">
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ítems Asentados en Grafo:</span>
                  <ul className="space-y-1.5">
                    {simCart.items.map((item, idx) => (
                      <li key={idx} className="text-xs text-emerald-300 font-medium">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs font-bold text-slate-200">
                    <span>Subtotal Estimado:</span>
                    <span className="text-emerald-400">${Number(simCart.total || 0).toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 leading-relaxed">
                  ⚖️ <strong>Regla de Pesaje:</strong> Los precios son por kilo. El valor final se ajusta según pesaje exacto en balanza al preparar el corte.
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">
                <ShoppingCart size={32} className="mx-auto mb-2 text-slate-700" />
                <p>El carrito está vacío o en etapa de consulta inicial.</p>
                <p className="text-[11px] text-slate-600 mt-1">Escribí un pedido para ver el desglose en vivo.</p>
              </div>
            )}

            {/* Agent Profile Card in Simulator */}
            <div className="mt-auto pt-4 border-t border-slate-800 text-xs space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Personalidad en Uso:</span>
              <p className="text-slate-300 text-[11px] leading-relaxed italic">
                "{simAgent?.personality || 'Cálido, cordobés amigable y experto parrillero.'}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Batería de Tests & Entrenamiento Automático */}
      {activeTab === 'training' && (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity size={20} className="text-amber-400" />
                <h2 className="text-base font-bold text-slate-100">
                  Batería Exhaustiva de Pruebas de Conversación & Memoria
                </h2>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Ejecuta el suite completo de 8 casos de prueba (sustitución, sumas/restas de cortes, cancelaciones, cero productos fantasma, variabilidad humana y disclaimers por kilo) para validar el comportamiento del agente.
              </p>
            </div>

            <button
              onClick={handleRunTestSuite}
              disabled={isRunningTests}
              className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-slate-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all uppercase tracking-wider"
            >
              {isRunningTests ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Ejecutando Suite...
                </>
              ) : (
                <>
                  <Play size={16} /> Ejecutar Batería de Tests
                </>
              )}
            </button>
          </div>

          {/* Test Results */}
          {testSuiteResults && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Summary Bar */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-4 ${
                testSuiteResults.passed 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center gap-3">
                  {testSuiteResults.passed ? (
                    <CheckCircle size={28} className="text-emerald-400" />
                  ) : (
                    <XCircle size={28} className="text-rose-400" />
                  )}
                  <div>
                    <h3 className="font-bold text-sm">
                      {testSuiteResults.passed 
                        ? '¡Todos los Tests Pasaron Exitosamente al 100%!' 
                        : 'Algunos Tests Fallaron o Requieren Atención'}
                    </h3>
                    <p className="text-xs opacity-80">
                      {testSuiteResults.passedCount} de {testSuiteResults.total} pruebas superadas • Tiempo total: {testSuiteResults.durationMs}ms
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono px-3 py-1 bg-black/40 rounded-xl border border-white/10">
                  {testSuiteResults.timestamp}
                </span>
              </div>

              {/* Individual Tests Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testSuiteResults.results?.map((res, i) => (
                  <div
                    key={res.id || i}
                    className={`bg-slate-900/90 border rounded-2xl p-4.5 flex flex-col justify-between transition-all ${
                      res.passed ? 'border-emerald-500/30' : 'border-rose-500/50 bg-rose-950/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          {res.category || 'Test'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5">
                            <Clock size={10} /> {res.durationMs}ms
                          </span>
                          {res.passed ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] border border-emerald-500/30 flex items-center gap-0.5">
                              <Check size={10} /> PASÓ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30 flex items-center gap-0.5">
                              <X size={10} /> FALLÓ
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                        {res.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                        {res.description}
                      </p>
                    </div>

                    {res.error && (
                      <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/30 text-rose-300 text-[11px] font-mono">
                        ❌ {res.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Creación / Edición Completa */}
      {agentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {agentModal.mode === 'create' ? 'Crear Nuevo Agente IA' : `Personalizar a ${agentModal.data.name}`}
                  </h3>
                  <p className="text-xs text-slate-400">Configurá la historia, rol, personalidad y voz del agente.</p>
                </div>
              </div>
              <button
                onClick={() => setAgentModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Toggle Tipo de Perfil: Inteligencia Artificial (IA) vs Humano */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <div>
                  <span className="font-bold text-xs text-white flex items-center gap-1.5">
                    {agentModal.data.isAI !== false ? <Bot size={15} className="text-purple-400" /> : <User size={15} className="text-sky-400" />}
                    {agentModal.data.isAI !== false ? 'Perfil de Inteligencia Artificial (IA)' : 'Perfil de Agente / Operador Humano'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {agentModal.data.isAI !== false 
                      ? 'El bot responderá de forma autónoma con el modelo de IA seleccionado.' 
                      : 'Perfil asignado a un operador humano sin respuestas automáticas neuronales.'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3">
                  <input
                    type="checkbox"
                    checked={agentModal.data.isAI !== false}
                    onChange={(e) => setAgentModal({
                      ...agentModal,
                      data: { ...agentModal.data, isAI: e.target.checked }
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Multi-Agente WhatsApp & Asignación de Número */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    📱 Número WhatsApp Asignado:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: +54 9 351 123-4567 o vacío (todos)"
                    value={agentModal.data.phoneNumber || ''}
                    onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, phoneNumber: e.target.value } })}
                    className="w-full bg-[#111b21] border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Permite múltiples agentes con el mismo o distinto número</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    🔌 Sesión / Instancia Baileys:
                  </label>
                  <input
                    type="text"
                    placeholder="default, ventas_norte, caja_central..."
                    value={agentModal.data.whatsappSessionId || 'default'}
                    onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, whatsappSessionId: e.target.value } })}
                    className="w-full bg-[#111b21] border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">ID de sesión multi-instancia de WhatsApp</span>
                </div>
              </div>

              {/* Name & Role */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nombre del Agente *</label>
                  <input
                    type="text"
                    required
                    value={agentModal.data.name}
                    onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, name: e.target.value } })}
                    placeholder="Ej: Carlos - Maestro Carnicero"
                    className="w-full bg-slate-950 border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Rol Operativo *</label>
                  <select
                    value={agentModal.data.role}
                    onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, role: e.target.value } })}
                    className="w-full bg-slate-950 border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="vendedor">🥩 Vendedor / Asesor Comercial</option>
                    <option value="logistica">🛵 Encargado de Logística & Envíos</option>
                    <option value="encargado">🏪 Encargado de Sucursal & Mostrador</option>
                    <option value="administrador">👑 Administrador / Gerencia</option>
                    <option value="soporte">💬 Soporte & Atención Postventa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Título / Cargo Visible</label>
                <input
                  type="text"
                  value={agentModal.data.roleLabel}
                  onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, roleLabel: e.target.value } })}
                  placeholder="Ej: Maestro Carnicero & Asesor de Ventas"
                  className="w-full bg-slate-950 border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Avatar / Foto de Perfil</label>
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={agentModal.data.avatar || PRESET_AVATARS[0].url}
                    alt="Preview"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={agentModal.data.avatar}
                      onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, avatar: e.target.value } })}
                      placeholder="URL de la imagen o elegí un preset abajo..."
                      className="w-full bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 mb-1.5"
                    />
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {PRESET_AVATARS.map((av, i) => (
                        <button
                          type="button"
                          key={i}
                          onClick={() => setAgentModal({ ...agentModal, data: { ...agentModal.data, avatar: av.url } })}
                          className={`w-8 h-8 rounded-lg overflow-hidden border transition-all ${
                            agentModal.data.avatar === av.url ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-slate-700 opacity-60 hover:opacity-100'
                          }`}
                          title={av.label}
                        >
                          <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Backstory & Biografía */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Historia y Biografía (Backstory)
                </label>
                <textarea
                  rows={3}
                  value={agentModal.data.backstory}
                  onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, backstory: e.target.value } })}
                  placeholder="Contá la historia del agente: años de experiencia en carnes, especialidad en fuegos, trato con los clientes cordobeses..."
                  className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {/* Personality */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Personalidad y Tono de Conversación
                </label>
                <input
                  type="text"
                  value={agentModal.data.personality}
                  onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, personality: e.target.value } })}
                  placeholder="Ej: Cálido, cordobés amigable ('¡De diez!', '¡De una!'), experto parrillero."
                  className="w-full bg-slate-950 border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Prompt Directives */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Instrucciones y Prompt Específico
                </label>
                <textarea
                  rows={3}
                  value={agentModal.data.promptInstructions}
                  onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, promptInstructions: e.target.value } })}
                  placeholder="Directivas de comportamiento: si debe enfocar en ventas premium, coordinar entregas rápidas, etc."
                  className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                />
              </div>

              {/* ASIGNACIÓN DE MODELO DE INTELIGENCIA ARTIFICIAL */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">Motor & Modelo de Inteligencia Artificial</h4>
                      <p className="text-[11px] text-slate-400">Asigná el proveedor y modelo neuronal específico para este agente</p>
                    </div>
                  </div>
                  {getModelBadge(agentModal.data.aiProvider || 'gemini', agentModal.data.aiModel || 'gemini-2.5-flash')}
                </div>

                {/* Proveedor de IA */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-300">Proveedor de IA Oficial</label>
                    <span className="text-[11px] text-purple-400 font-semibold">{SYSTEM_AI_PROVIDERS.length} Proveedores Soportados</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {AI_PROVIDERS.map(prov => {
                      const isSelected = (agentModal.data.aiProvider || 'gemini') === prov.id;
                      return (
                        <button
                          type="button"
                          key={prov.id}
                          onClick={() => {
                            const defaultModel = getDefaultModelForProvider(prov.id);
                            setAiModelTestResult(null);
                            setAgentModal({
                              ...agentModal,
                              data: {
                                ...agentModal.data,
                                aiProvider: prov.id,
                                aiModel: defaultModel
                              }
                            });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-purple-950/60 border-purple-500 text-white shadow-lg shadow-purple-500/10 ring-1 ring-purple-400'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-base">{prov.icon}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              prov.badge.includes('Gratis') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {prov.badge}
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-200">{prov.name}</div>
                            <div className="text-[10px] text-slate-500 line-clamp-1">{prov.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selector de Modelo Preset o Personalizado */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Modelo Soportado del Proveedor
                    </label>
                    <select
                      value={agentModal.data.aiModel || getDefaultModelForProvider(agentModal.data.aiProvider || 'gemini')}
                      onChange={e => {
                        setAiModelTestResult(null);
                        setAgentModal({ ...agentModal, data: { ...agentModal.data, aiModel: e.target.value } });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                    >
                      {(AI_MODEL_PRESETS[agentModal.data.aiProvider || 'gemini'] || []).map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.isFree ? '(🎁 100% Gratis)' : ''}
                        </option>
                      ))}
                      <option value="custom">✏️ Otro / Modelo Personalizado...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Identificador Técnico del Modelo (String ID)
                    </label>
                    <input
                      type="text"
                      value={agentModal.data.aiModel || ''}
                      onChange={e => {
                        setAiModelTestResult(null);
                        setAgentModal({ ...agentModal, data: { ...agentModal.data, aiModel: e.target.value } });
                      }}
                      placeholder="ej: gemini-2.5-flash, gpt-4o, claude-3-7-sonnet"
                      className="w-full bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Info Card para Qwen 2.5 0.5B Embebido */}
                {agentModal.data.aiProvider === 'qwen_embedded' && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between font-bold text-emerald-300">
                      <span className="flex items-center gap-1.5">
                        <Cpu size={14} className="text-emerald-400" />
                        <span>Modelo Local C++ Embebido (node-llama-cpp)</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        100% Offline / Zero API Key
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Este agente responderá utilizando el modelo local <strong>Qwen 2.5 0.5B Instruct (Q4_K_M)</strong> ejecutado directamente en CPU pura con ~350 MB de memoria RAM sin depender de servicios en la nube ni cuotas externas.
                    </p>
                  </div>
                )}

                {/* Temperatura & Max Tokens Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>Temperatura (Creatividad):</span>
                      <span className="text-purple-400 font-mono">{agentModal.data.aiTemperature ?? 0.7}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={agentModal.data.aiTemperature ?? 0.7}
                      onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, aiTemperature: parseFloat(e.target.value) } })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>0.0 (Preciso / Directo)</span>
                      <span>1.0 (Creativo / Gourmet)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>Límite de Tokens (Longitud):</span>
                      <span className="text-purple-400 font-mono">{agentModal.data.aiMaxTokens || 500} tokens</span>
                    </div>
                    <input
                      type="range"
                      min="150"
                      max="2000"
                      step="50"
                      value={agentModal.data.aiMaxTokens || 500}
                      onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, aiMaxTokens: parseInt(e.target.value, 10) } })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>150 (Respuestas cortas)</span>
                      <span>2000 (Exhaustivo)</span>
                    </div>
                  </div>
                </div>

                {/* API Key Override & Custom Endpoint (Opcionales) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      API Key Específica del Agente (Opcional)
                    </label>
                    <input
                      type="password"
                      value={agentModal.data.apiKeyOverride || ''}
                      onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, apiKeyOverride: e.target.value } })}
                      placeholder="Dejar vacío para usar la global de Ajustes"
                      className="w-full bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Endpoint Base Personalizado (Ollama / Local / Proxy)
                    </label>
                    <input
                      type="text"
                      value={agentModal.data.customEndpoint || ''}
                      onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, customEndpoint: e.target.value } })}
                      placeholder="ej: http://localhost:11434/v1"
                      className="w-full bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* DIAGNÓSTICO EN VIVO & TEST DE CONEXIÓN REAL */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-400" />
                      Diagnóstico y Test de Conexión Real
                    </span>
                    <button
                      type="button"
                      onClick={handleTestAgentModel}
                      disabled={isTestingAiModel}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-purple-600/20"
                    >
                      {isTestingAiModel ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Comprobando Modelo...</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} />
                          <span>Probar Conexión en Vivo ⚡</span>
                        </>
                      )}
                    </button>
                  </div>

                  {aiModelTestResult && (
                    <div className={`p-3 rounded-xl border text-xs animate-in fade-in ${
                      aiModelTestResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    }`}>
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span className="flex items-center gap-1.5">
                          {aiModelTestResult.success ? (
                            <>
                              <CheckCircle2 size={15} className="text-emerald-400" />
                              <span>Modelo Conectado y Operativo ({aiModelTestResult.provider})</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={15} className="text-rose-400" />
                              <span>Error de Conexión en el Modelo</span>
                            </>
                          )}
                        </span>
                        <span className="font-mono text-[11px] opacity-80">{aiModelTestResult.latencyMs} ms</span>
                      </div>
                      <div className="text-[11px] font-mono whitespace-pre-wrap mt-1">
                        {aiModelTestResult.success ? aiModelTestResult.response : aiModelTestResult.error}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* First Message */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Mensaje de Saludo Inicial</label>
                <input
                  type="text"
                  value={agentModal.data.firstMessage}
                  onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, firstMessage: e.target.value } })}
                  placeholder="¡Hola! ¿En qué te puedo asesorar hoy? 🥩"
                  className="w-full bg-slate-950 border border-slate-700 px-3.5 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Voz del Agente */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">Configuración de Voz del Agente</h4>
                      <p className="text-[11px] text-slate-400">Seleccioná si este agente hereda la voz del sistema o tiene su propia voz</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestVoice(agentModal.data.voiceType === 'custom' ? agentModal.data.voiceId : null)}
                    disabled={previewingVoice}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Volume2 size={13} className={previewingVoice ? 'animate-ping' : ''} />
                    <span>{previewingVoice ? 'Sintetizando...' : '▶️ Escuchar Muestra'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                    (agentModal.data.voiceType || 'system_default') === 'system_default'
                      ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="voiceType"
                      checked={(agentModal.data.voiceType || 'system_default') === 'system_default'}
                      onChange={() => setAgentModal({ ...agentModal, data: { ...agentModal.data, voiceType: 'system_default', voiceId: '' } })}
                      className="mt-0.5 text-emerald-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-200">🌐 Voz por Defecto del Sistema</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        Hereda automáticamente la voz configurada en Ajustes (es-AR-TomasNeural / Argentina)
                      </div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                    agentModal.data.voiceType === 'custom'
                      ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="voiceType"
                      checked={agentModal.data.voiceType === 'custom'}
                      onChange={() => setAgentModal({ ...agentModal, data: { ...agentModal.data, voiceType: 'custom', voiceId: agentModal.data.voiceId || 'es-AR-TomasNeural' } })}
                      className="mt-0.5 text-purple-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-200">🎙️ Voz Personalizada</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        Elegí una locución neuronal específica o ingresá un Voice ID propio
                      </div>
                    </div>
                  </label>
                </div>

                {agentModal.data.voiceType === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Voces Neuronales en Español
                      </label>
                      <select
                        value={agentModal.data.voiceId || 'es-AR-TomasNeural'}
                        onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, voiceId: e.target.value } })}
                        className="w-full bg-slate-950 border border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                      >
                        <option value="es-AR-TomasNeural">🇦🇷 Tomás (Argentina - Amigable, natural)</option>
                        <option value="es-AR-ElenaNeural">🇦🇷 Elena (Argentina - Cálida, cordial)</option>
                        <option value="es-MX-DaliaNeural">🇲🇽 Dalia (México - Ejecutiva, clara)</option>
                        <option value="es-ES-AlvaroNeural">🇪🇸 Álvaro (España - Formal, neutro)</option>
                        <option value="es-CO-GonzaloNeural">🇨🇴 Gonzalo (Colombia - Amable, cercano)</option>
                        <option value="es-CL-LorenzoNeural">🇨🇱 Lorenzo (Chile - Profesional)</option>
                        <option value="pNInz6obpgDQGcFmaJgB">🎙️ Adam (ElevenLabs - Locutor estándar)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Identificador Técnico / Voice ID
                      </label>
                      <input
                        type="text"
                        value={agentModal.data.voiceId || ''}
                        onChange={e => setAgentModal({ ...agentModal, data: { ...agentModal.data, voiceId: e.target.value } })}
                        placeholder="ej: es-AR-TomasNeural o Voice ID ElevenLabs"
                        className="w-full bg-slate-950 border border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>


              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAgentModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20"
                >
                  Guardar Agente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
