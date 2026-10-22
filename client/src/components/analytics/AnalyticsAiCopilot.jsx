import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  TrendingUp,
  DollarSign,
  Clock,
  Store,
  RefreshCw,
  Copy,
  Check,
  HelpCircle,
  Lightbulb,
  MessageSquare
} from 'lucide-react';

export default function AnalyticsAiCopilot({ stats, activeFilters = {} }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: `¡Hola! Soy tu **Agente de Inteligencia de Negocios WAgent** 🥩📊.\n\nTengo acceso en tiempo real a las ventas de mostrador (POS), pedidos de WhatsApp, precios del Mercado Agroganadero (MAG), inflación IPC y comprobantes de compras a frigoríficos.\n\n¿Qué indicador o decisión estratégica te gustaría analizar hoy?`,
      timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const chatBottomRef = useRef(null);

  const quickPrompts = [
    { label: '🥩 ¿Cuál es el corte más rentable?', query: '¿Cuál es el corte de carne más rentable y con mayor margen del mes?' },
    { label: '🏢 Comparar sucursales', query: 'Compara el rendimiento y facturación de todas las sucursales' },
    { label: '🕒 Picos horarios de venta', query: '¿Cuáles son los horarios pico de mayor facturación para reforzar el mostrador?' },
    { label: '💰 Rentabilidad y Costo MAG Gancho', query: '¿Cuál es el margen bruto estimado frente al costo del kilo gancho de referencia?' },
    { label: '👥 Fidelización de Clientes RFM', query: '¿Cómo está la retención de clientes y cuántos están en riesgo de abandono?' }
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const q = textToSend || inputQuery;
    if (!q.trim() || loading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/analytics/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, filters: activeFilters })
      });
      const data = await res.json();

      if (data.success && data.answer) {
        const textAnswer = typeof data.answer === 'string' ? data.answer : (data.answer.answer || JSON.stringify(data.answer));
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'ai',
            text: textAnswer,
            timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(data.error || 'No se obtuvo respuesta del agente');
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: `⚠️ **Aviso del Agente:** No se pudo procesar la consulta en este momento (${err.message}). Por favor verifica la conexión con el servidor.`,
          timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Renderizador simple de Markdown (listas, negritas, saltos)
  const renderFormattedText = (rawText) => {
    const lines = rawText.split('\n');
    return lines.map((line, idx) => {
      // Títulos ###
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-sm font-bold text-cyan-300 mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      // Puntos de lista * o -
      if (line.startsWith('* ') || line.startsWith('- ')) {
        const content = line.substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-slate-200 my-0.5">
            {formatBold(content)}
          </li>
        );
      }
      // Párrafo normal
      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="my-1 leading-relaxed">
          {formatBold(line)}
        </p>
      );
    });
  };

  const formatBold = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="text-white font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-[520px] rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header del Agente BI */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/70">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Agente BI Copilot de Negocio
              <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                IA Activa
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Consultas en lenguaje natural sobre finanzas, cortes, stock y sucursales
            </p>
          </div>
        </div>

        <button
          onClick={() =>
            setMessages([
              {
                id: Date.now(),
                sender: 'ai',
                text: 'Conversación reiniciada. ¿En qué métrica del negocio nos enfocamos ahora?',
                timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
              }
            ])
          }
          title="Reiniciar Conversación"
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700/60 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Historial de Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {msg.sender === 'ai' ? (
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 shrink-0 mt-0.5">
                <MessageSquare className="w-4 h-4" />
              </div>
            )}

            <div
              className={`relative group max-w-[85%] rounded-2xl p-4 text-xs ${
                msg.sender === 'user'
                  ? 'bg-cyan-600 text-white rounded-tr-none shadow-md shadow-cyan-600/20'
                  : 'bg-slate-800/80 text-slate-300 rounded-tl-none border border-slate-700/60 shadow-lg'
              }`}
            >
              <div className="leading-relaxed">{renderFormattedText(msg.text)}</div>

              <div
                className={`mt-2 flex items-center justify-between text-[10px] ${
                  msg.sender === 'user' ? 'text-cyan-200' : 'text-slate-400'
                }`}
              >
                <span>{msg.timestamp}</span>
                {msg.sender === 'ai' && (
                  <button
                    onClick={() => copyToClipboard(msg.id, msg.text)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-3 hover:text-cyan-400 flex items-center gap-1"
                    title="Copiar respuesta"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-tl-none p-3.5 text-xs text-cyan-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-pulse text-cyan-400" />
              <span>Analizando base de datos, precios MAG y facturación...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Sugerencias de Consultas Rápidas (Chips) */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/40 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            disabled={loading}
            onClick={() => handleSend(qp.query)}
            className="px-2.5 py-1 text-[11px] font-medium whitespace-nowrap bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/40 rounded-full transition-all disabled:opacity-50"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Barra de Entrada de Consulta */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-slate-800/80 bg-slate-900/70 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Escribe una pregunta ejecutiva (ej: ¿Cuáles fueron los cortes con mejor margen ayer?)..."
          disabled={loading}
          className="flex-1 bg-slate-800/90 text-white placeholder-slate-500 text-xs rounded-xl px-4 py-2.5 border border-slate-700/70 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || loading}
          className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
