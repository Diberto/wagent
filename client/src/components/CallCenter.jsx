import React, { useState, useRef, useEffect } from 'react';
import { 
  PhoneCall, 
  PhoneIncoming, 
  PhoneMissed, 
  PhoneOutgoing, 
  Bot, 
  Mic, 
  Square, 
  Play, 
  Volume2, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  MessageSquare,
  Radio
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export default function CallCenter({ 
  calls = [], 
  onOpenCallModal, 
  onSelectLead, 
  leads = [] 
}) {
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveAiReply, setLiveAiReply] = useState('');
  const [liveAiAudioUrl, setLiveAiAudioUrl] = useState(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const recognitionRef = useRef(null);

  // Inicializar Web Speech Recognition si está disponible en el navegador para el simulador
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES';

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        setLiveTranscript(`👤 Tú: "${transcript}"`);
        setIsLiveSpeaking(false);
        setIsProcessingVoice(true);

        try {
          const res = await fetch('/api/ai/live-call-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userText: transcript, customerName: 'Cliente en Vivo' })
          });
          const data = await res.json();
          const reply = data.replyText || '¡Hola! Te escucho atentamente.';
          setLiveAiReply(`🥩 Asesor Carnicero: "${reply}"`);
          
          if (data.audioUrl) {
            setLiveAiAudioUrl(data.audioUrl);
            const audio = new Audio(data.audioUrl);
            audio.play().catch(e => console.log('Audio autoplay prevented:', e));
          }
        } catch (err) {
          console.error('Error procesando voz en vivo:', err);
        } finally {
          setIsProcessingVoice(false);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsLiveSpeaking(false);
        setIsProcessingVoice(false);
      };

      recognition.onend = () => {
        setIsLiveSpeaking(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const startLiveVoiceCall = () => {
    if (recognitionRef.current) {
      setLiveTranscript('Escuchando tu voz... Habla ahora.');
      setLiveAiReply('');
      setLiveAiAudioUrl(null);
      setIsLiveSpeaking(true);
      recognitionRef.current.start();
    } else {
      alert('Tu navegador no soporta Web Speech Recognition directo.');
    }
  };

  const stopLiveVoiceCall = () => {
    if (recognitionRef.current && isLiveSpeaking) {
      recognitionRef.current.stop();
      setIsLiveSpeaking(false);
    }
  };

  const incomingCalls = calls.filter(c => c.direction === 'incoming');
  const missedCalls = calls.filter(c => c.status === 'missed');
  const completedCalls = calls.filter(c => c.status === 'completed');
  const followUpsSent = calls.filter(c => c.aiFollowUpSent).length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b141a] p-4 lg:p-6 overflow-y-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Centro de Llamadas & Asistente de Voz IA
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              VoIP & Baileys Call Engine
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro en tiempo real de llamadas entrantes y salientes de WhatsApp con atención y notas de voz por IA.
          </p>
        </div>

        <button
          onClick={onOpenCallModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all self-start sm:self-auto"
        >
          <PhoneCall size={16} />
          Realizar Llamada de Voz
        </button>
      </div>

      {/* Tarjetas KPI de Llamadas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Llamadas</span>
            <PhoneCall size={16} className="text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{calls.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Registros en el historial</div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Llamadas Perdidas</span>
            <PhoneMissed size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400">{missedCalls.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Atendidas por IA con voz</div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Completadas</span>
            <PhoneIncoming size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400">{completedCalls.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Conversaciones exitosas</div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Audios Auto-Seguimiento</span>
            <Bot size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400">{followUpsSent}</div>
          <div className="text-[11px] text-slate-400 mt-1">Notas de voz enviadas por IA</div>
        </div>
      </div>

      {/* Simulador Interactivo de Voz en Vivo WebRTC */}
      <div className="glass-card rounded-3xl p-6 border border-emerald-500/30 bg-gradient-to-br from-[#111b21] via-[#111b21] to-emerald-950/20 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Sparkles size={14} /> Asistente de Voz en Vivo
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Prueba Interactiva del Agente de Voz
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Habla por tu micrófono como si fueras un cliente llamando. El sistema capturará tu voz, la procesará con IA y responderá hablándote con síntesis de voz neural ultra-realista.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!isLiveSpeaking ? (
              <button
                onClick={startLiveVoiceCall}
                disabled={isProcessingVoice}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/25 transition-transform active:scale-95"
              >
                <Mic size={18} />
                <span>{isProcessingVoice ? 'Procesando Voz...' : 'Hablar con el Agente'}</span>
              </button>
            ) : (
              <button
                onClick={stopLiveVoiceCall}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-sm shadow-xl shadow-rose-500/25 animate-pulse"
              >
                <Square size={18} />
                <span>Detener Grabación</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback visual del simulador de voz */}
        {(liveTranscript || liveAiReply || isProcessingVoice) && (
          <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#182229] border border-slate-700/60 rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                <Mic size={12} className="text-sky-400" /> Lo que dijiste (Transcripción):
              </div>
              <p className="text-sm text-slate-100 italic">
                {liveTranscript || 'Escuchando...'}
              </p>
            </div>

            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4">
              <div className="text-xs font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
                <Bot size={12} /> Respuesta de Voz del Agente:
              </div>
              {isProcessingVoice ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  Sintetizando voz y generando respuesta...
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-200">
                    {liveAiReply || 'Respuesta lista'}
                  </p>
                  {liveAiAudioUrl && (
                    <AudioPlayer audioUrl={liveAiAudioUrl} isAgent={true} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabla de Historial de Llamadas */}
      <div className="glass-card rounded-3xl border border-slate-800 bg-[#111b21] overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Historial de Llamadas de WhatsApp</h3>
          <span className="text-xs text-slate-400">{calls.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#182229] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Contacto / Número</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Duración</th>
                <th className="py-3 px-4">Auto-Seguimiento IA</th>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    No hay llamadas registradas aún. Haz clic en "Simular Llamada Entrante" para probar.
                  </td>
                </tr>
              ) : (
                calls.map(call => {
                  const lead = leads.find(l => l.jid === call.chatId);
                  return (
                    <tr key={call.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{call.callerName || lead?.name || 'Usuario'}</div>
                        <div className="text-[11px] text-slate-400">{call.callerNumber}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="flex items-center gap-1 text-slate-300">
                          {call.direction === 'incoming' ? <PhoneIncoming size={13} className="text-sky-400" /> : <PhoneOutgoing size={13} className="text-indigo-400" />}
                          {call.direction === 'incoming' ? 'Entrante' : 'Saliente'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          call.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          call.status === 'missed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {call.status === 'completed' ? 'Completada' : call.status === 'missed' ? 'Perdida' : 'Sonando'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {call.duration > 0 ? `${call.duration}s` : '--'}
                      </td>
                      <td className="py-3.5 px-4">
                        {call.aiFollowUpSent ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                            <CheckCircle2 size={13} /> Nota de Voz Enviada
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">No enviado</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(call.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {lead && (
                          <button
                            onClick={() => onSelectLead(lead)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-[11px] transition-colors"
                          >
                            Abrir Chat
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
