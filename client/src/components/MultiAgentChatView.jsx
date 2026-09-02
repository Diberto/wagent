import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Sparkles, Zap, ChefHat, Package, Cpu, 
  MessageSquare, Users, ShieldCheck, CheckCircle2, Play, 
  RefreshCw, Terminal, ArrowRight, CornerDownLeft
} from 'lucide-react';

export default function MultiAgentChatView({ socket = null }) {
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [targetAgentId, setTargetAgentId] = useState('all'); // 'all' | 'agent_carlos' | 'agent_chef_mateo' | 'agent_stock_inspector' | 'agent_devops'
  const [sending, setSending] = useState(false);
  const [executingTask, setExecutingTask] = useState(false);
  const [taskResult, setTaskResult] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchTeamData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const handleActivity = (data) => {
      if (data?.userMessage) {
        setMessages(prev => [...prev, data.userMessage, ...(data.agentResponses || [])]);
      }
    };
    socket.on('multi-agent:activity', handleActivity);
    return () => socket.off('multi-agent:activity', handleActivity);
  }, [socket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchTeamData = async () => {
    try {
      const res = await fetch('/api/multi-agent/team');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        if (data.history && data.history.length > 0) {
          setMessages(data.history);
        } else {
          // Mensaje de bienvenida inicial del equipo
          setMessages([
            {
              id: 'init-1',
              sender: 'DevOps Ops',
              senderRole: 'Optimizador de Sistema',
              avatar: '⚡',
              content: '⚡ **Sistema WAgent Ops Online:** Todos los módulos cargados y listos. El buffer In-Memory y la sincronización en tiempo real están activos.',
              timestamp: new Date().toISOString(),
              isAgent: true
            },
            {
              id: 'init-2',
              sender: 'Chef Don Mateo',
              senderRole: 'Sommelier de Carnes',
              avatar: '👨‍🍳',
              content: '👨‍🍳 **Don Mateo listo:** Tengo indexadas todas las recetas familiares argentinas para asistir a los clientes cuando busquen comidas de casa fuera de asado.',
              timestamp: new Date().toISOString(),
              isAgent: true
            },
            {
              id: 'init-3',
              sender: 'Carlos Asesor',
              senderRole: 'Líder de Ventas',
              avatar: '🥩',
              content: '🥩 **Carlos listo:** Atendiendo en WhatsApp y Tienda Web. ¿En qué tarea del sistema podemos trabajar juntos hoy?',
              timestamp: new Date().toISOString(),
              isAgent: true
            }
          ]);
        }
      }
    } catch (err) {
      console.error('Error fetching multi-agent team:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || sending) return;

    const currentMsg = inputMessage;
    setInputMessage('');
    setSending(true);

    try {
      const res = await fetch('/api/multi-agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMsg,
          targetAgentId,
          user: 'Administrador'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.userMessage) {
          setMessages(prev => [...prev, data.userMessage, ...(data.agentResponses || [])]);
        }
      }
    } catch (err) {
      console.error('Error sending team message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleExecuteQuickTask = async (taskType, label) => {
    setExecutingTask(true);
    setTaskResult(null);
    try {
      const res = await fetch('/api/multi-agent/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType })
      });
      const data = await res.json();
      setTaskResult({ task: label, ...data });

      // Inyectar en chat el reporte de ejecución
      const agentMsg = {
        id: `task-${Date.now()}`,
        sender: taskType === 'optimize_db' || taskType === 'clear_cache' ? 'DevOps Ops' : 'Inspector Stock',
        senderRole: 'Automatización Ops',
        avatar: taskType === 'optimize_db' ? '⚡' : '📦',
        content: `🛠️ **Tarea Ejecutada:** *${label}*\n${data.message || JSON.stringify(data, null, 2)}`,
        timestamp: new Date().toISOString(),
        isAgent: true
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      console.error('Error executing task:', err);
    } finally {
      setExecutingTask(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] text-slate-100 h-full overflow-hidden">
      {/* Header Superior con Tarjetas de los 4 Agentes */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/5">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Centro de Operaciones Multi-Agente</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  4 Agentes Simultáneos
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Interactuá en vivo con el equipo de IA para consultar métricas, optimizar el sistema y entrenar respuestas
              </p>
            </div>
          </div>
        </div>

        {/* 4 Agentes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <button
            onClick={() => setTargetAgentId('agent_carlos')}
            className={`p-3 rounded-xl border text-left transition ${
              targetAgentId === 'agent_carlos'
                ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-500/10'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">🥩</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-white">Carlos Asesor</h4>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400 truncate">Ventas & Cierre</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">♊ Gemini 2.5</span>
            </div>
          </button>

          <button
            onClick={() => setTargetAgentId('agent_chef_mateo')}
            className={`p-3 rounded-xl border text-left transition ${
              targetAgentId === 'agent_chef_mateo'
                ? 'bg-amber-950/40 border-amber-500/80 shadow-md shadow-amber-500/10'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">👨‍🍳</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-white">Chef Don Mateo</h4>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400 truncate">Recetas & Asesor</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">♊ Gemini 2.5</span>
            </div>
          </button>

          <button
            onClick={() => setTargetAgentId('agent_stock_inspector')}
            className={`p-3 rounded-xl border text-left transition ${
              targetAgentId === 'agent_stock_inspector'
                ? 'bg-sky-950/40 border-sky-500/80 shadow-md shadow-sky-500/10'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">📦</span>
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-white">Inspector Stock</h4>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400 truncate">Balanzas & PLU</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🟢 GPT-4o Mini</span>
            </div>
          </button>

          <button
            onClick={() => setTargetAgentId('agent_devops')}
            className={`p-3 rounded-xl border text-left transition ${
              targetAgentId === 'agent_devops'
                ? 'bg-purple-950/40 border-purple-500/80 shadow-md shadow-purple-500/10'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">⚡</span>
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-white">DevOps Ops</h4>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400 truncate">Memoria & Concurrencia</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">🔵 DeepSeek V3</span>
            </div>
          </button>
        </div>
      </div>

      {/* Píldoras de Acciones Rápidas del Equipo */}
      <div className="px-5 py-2.5 border-b border-slate-800/60 bg-slate-950/20 flex items-center gap-2 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setTargetAgentId('all')}
          className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition ${
            targetAgentId === 'all'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          🌐 Hablar con Todo el Equipo
        </button>

        <button
          onClick={() => handleExecuteQuickTask('optimize_db', 'Optimizar Base de Datos')}
          disabled={executingTask}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 text-xs font-semibold whitespace-nowrap border border-slate-700/80 transition disabled:opacity-50"
        >
          <Zap className="w-3 h-3 text-emerald-400" />
          Optimizar BD y Compactar
        </button>

        <button
          onClick={() => handleExecuteQuickTask('clear_cache', 'Purgar Memoria RAM')}
          disabled={executingTask}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-400 text-xs font-semibold whitespace-nowrap border border-slate-700/80 transition disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3 text-sky-400" />
          Purgar Caché de Memoria
        </button>

        <button
          onClick={() => handleExecuteQuickTask('audit_stock', 'Auditar Stock Faltante')}
          disabled={executingTask}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 text-xs font-semibold whitespace-nowrap border border-slate-700/80 transition disabled:opacity-50"
        >
          <Package className="w-3 h-3 text-amber-400" />
          Auditar Stock Bajo
        </button>

        <button
          onClick={() => {
            setInputMessage('¿Cómo debemos responder si el cliente pide comida de casa para 4 personas y no quiere asado?');
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-xs font-semibold whitespace-nowrap border border-slate-700/80 transition"
        >
          <ChefHat className="w-3 h-3 text-amber-400" />
          Simular Consulta de Receta Familiar
        </button>
      </div>

      {/* Feed de Conversación */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => {
          const isUser = !msg.isAgent;
          return (
            <div 
              key={msg.id || idx} 
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shadow-md shrink-0">
                  {msg.avatar || '🤖'}
                </div>
              )}

              <div className={`max-w-2xl rounded-2xl p-4 shadow-lg ${
                isUser 
                  ? 'bg-purple-600 text-white rounded-tr-none' 
                  : 'bg-slate-900/80 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{msg.sender}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                      {msg.senderRole || 'Team'}
                    </span>
                    {msg.aiModel && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                        {msg.aiModel}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-60">
                    {new Date(msg.timestamp || Date.now()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="text-xs leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de Chat y Asignación de Tareas */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                targetAgentId === 'all' 
                  ? 'Escribir consulta o tarea para todo el equipo de agentes...' 
                  : `Consultar directamente a ${agents.find(a => a.id === targetAgentId)?.name || 'Agente'}...`
              }
              className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={!inputMessage.trim() || sending}
            className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 transition disabled:opacity-50 flex items-center justify-center"
          >
            <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
          </button>
        </div>
      </form>
    </div>
  );
}
