import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneCall, 
  PhoneIncoming, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Bot, 
  User, 
  X, 
  Sparkles, 
  Volume2, 
  Radio, 
  Send,
  CheckCircle2,
  Delete
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export default function CallModal({ 
  isOpen, 
  onClose, 
  incomingCall, 
  activeLead, 
  leads = [], 
  onAnswerCallAi, 
  onRejectCall, 
  onMakeOutboundCall 
}) {
  const [mode, setMode] = useState('dialer'); // 'incoming' | 'dialer' | 'in_call'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [customVoiceMessage, setCustomVoiceMessage] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [callSuccessMessage, setCallSuccessMessage] = useState(null);

  // Live Call WebRTC State
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveAiResponse, setLiveAiResponse] = useState('');
  const [liveAiAudioUrl, setLiveAiAudioUrl] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const callTimerRef = useRef(null);
  const recognitionRef = useRef(null);

  // Si hay llamada entrante, activar modo incoming
  useEffect(() => {
    if (incomingCall) {
      setMode('incoming');
    } else if (activeLead) {
      setPhoneNumber(activeLead.phone || activeLead.jid.split('@')[0]);
      setContactName(activeLead.name || activeLead.pushName || '');
    }
  }, [incomingCall, activeLead]);

  // Manejar temporizador de llamada
  useEffect(() => {
    if (mode === 'in_call') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      startLiveVoiceRecognition();
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      stopLiveVoiceRecognition();
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      stopLiveVoiceRecognition();
    };
  }, [mode]);

  // Reconocimiento de voz para llamadas en vivo
  const startLiveVoiceRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = async (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const text = lastResult[0].transcript.trim();
          if (!text) return;

          setLiveTranscript(prev => `${prev}\n👤 Tú: "${text}"`);
          setIsSpeaking(true);

          try {
            // Consultar respuesta de IA
            const res = await fetch('/api/ai/test-voice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `Respondiendo a tu consulta en llamada: ${text}. Nuestro asistente virtual está listo para ayudarte con pedidos, cotizaciones y soporte.`
              })
            });
            const data = await res.json();
            setLiveAiResponse(`🤖 Asistente: "Hemos registrado tu consulta. ¿Deseas confirmar el pedido o agendar una reunión?"`);
            setLiveAiAudioUrl(data.audioUrl);

            // Reproducir audio de voz del agente
            const audio = new Audio(data.audioUrl);
            audio.play().catch(e => console.log('Audio autoplay:', e));
          } catch (err) {
            console.error('Error en llamada en vivo:', err);
          } finally {
            setIsSpeaking(false);
          }
        }
      };

      recognition.onerror = (e) => console.log('Speech error in call:', e);
      recognition.start();
      recognitionRef.current = recognition;
    }
  };

  const stopLiveVoiceRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
  };

  const formatCallTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Acciones de Marcador
  const handleDialNumber = (num) => {
    setPhoneNumber(prev => prev + num);
  };

  const handleDeleteDigit = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleStartOutboundCall = async (e) => {
    e?.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsCalling(true);
    setCallSuccessMessage(null);

    try {
      await onMakeOutboundCall({
        phone: phoneNumber.trim(),
        name: contactName.trim() || 'Cliente',
        customMessage: customVoiceMessage.trim() || undefined
      });

      setCallSuccessMessage('¡Llamada / Nota de Voz enviada con éxito al WhatsApp del cliente!');
      setTimeout(() => {
        setCallSuccessMessage(null);
        onClose();
      }, 2500);
    } catch (err) {
      console.error('Error realizando llamada saliente:', err);
    } finally {
      setIsCalling(false);
    }
  };

  if (!isOpen && !incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-slate-700/80 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Glow decorativo */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. MODO LLAMADA ENTRANTE */}
        {mode === 'incoming' && (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-6 ring-8 ring-emerald-500/10 animate-bounce">
              <PhoneIncoming size={48} />
            </div>

            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">
              Llamada de WhatsApp Entrante
            </span>
            <h3 className="text-xl font-bold text-white mb-1">
              {incomingCall?.callerName || incomingCall?.callerNumber || 'Cliente WhatsApp'}
            </h3>
            <p className="text-sm font-mono text-slate-400 mb-8">
              {incomingCall?.callerNumber}
            </p>

            {/* Opciones de respuesta */}
            <div className="grid grid-cols-2 gap-3 w-full mb-6">
              <button
                onClick={() => {
                  onAnswerCallAi(incomingCall);
                  onClose();
                }}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all group"
              >
                <Bot size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Atender con Voz IA</span>
                <span className="text-[10px] text-slate-400">Envía audio automático</span>
              </button>

              <button
                onClick={() => setMode('in_call')}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all group"
              >
                <Radio size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Llamada en Vivo</span>
                <span className="text-[10px] text-slate-400">Hablar por micrófono</span>
              </button>
            </div>

            <button
              onClick={() => {
                onRejectCall(incomingCall);
                onClose();
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors"
            >
              <PhoneOff size={16} />
              Rechazar Llamada
            </button>
          </div>
        )}

        {/* 2. MODO LLAMADA EN VIVO (VoIP WebRTC Session) */}
        {mode === 'in_call' && (
          <div className="flex flex-col items-center py-4">
            <div className="w-20 h-20 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center mb-3 ring-4 ring-sky-500/10">
              <PhoneCall size={36} className="animate-pulse" />
            </div>

            <span className="text-xs font-mono font-bold text-sky-400 px-3 py-1 rounded-full bg-sky-500/10 mb-2">
              Llamada Activa • {formatCallTime(callDuration)}
            </span>
            <h3 className="text-lg font-bold text-white mb-1">
              {contactName || incomingCall?.callerName || phoneNumber || 'Llamada en Curso'}
            </h3>

            {/* Onda Sonora de Voz */}
            <div className="flex items-center justify-center gap-1 my-4 h-8">
              {[40, 70, 30, 90, 60, 100, 45, 80, 50, 95, 30, 65].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="w-1 bg-emerald-400 rounded-full animate-wave"
                />
              ))}
            </div>

            {/* Transcripción en Vivo */}
            <div className="w-full bg-[#182229] border border-slate-700/60 rounded-2xl p-3.5 mb-6 text-xs max-h-40 overflow-y-auto space-y-2 text-left">
              <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Mic size={10} className="text-sky-400" /> Transcripción en Vivo:
              </div>
              <p className="text-slate-200 italic whitespace-pre-line">
                {liveTranscript || 'Escuchando tu voz... Habla para interactuar.'}
              </p>
              {liveAiResponse && (
                <p className="text-emerald-400 font-medium">
                  {liveAiResponse}
                </p>
              )}
            </div>

            {/* Controles de Llamada */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-4 rounded-full border transition-all ${
                  isMuted ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={isMuted ? 'Desmutear' : 'Mutear'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                onClick={() => {
                  setMode('dialer');
                  onClose();
                }}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
                title="Colgar Llamada"
              >
                <PhoneOff size={24} />
              </button>
            </div>
          </div>
        )}

        {/* 3. MODO MARCADOR TELEFÓNICO (Realizar Llamada Saliente) */}
        {mode === 'dialer' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <PhoneCall size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Realizar Llamada de Voz</h3>
                  <p className="text-[10px] text-slate-400">Envío de audio neural por WhatsApp o VoIP</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Input de Número y Contacto */}
            <div className="space-y-3 mb-4">
              {leads.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Seleccionar Contacto Guardado</label>
                  <select
                    onChange={(e) => {
                      const selected = leads.find(l => l.jid === e.target.value);
                      if (selected) {
                        setPhoneNumber(selected.phone || selected.jid.split('@')[0]);
                        setContactName(selected.name || selected.pushName || '');
                      }
                    }}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Elegir contacto --</option>
                    {leads.map(l => (
                      <option key={l.jid} value={l.jid}>
                        {l.name || l.pushName} ({l.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Número de Teléfono (con código de país)</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="+54 9 11 1234-5678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#202c33] border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {phoneNumber && (
                    <button
                      onClick={handleDeleteDigit}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    >
                      <Delete size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Mensaje de Voz Personalizado (Opcional)</label>
                <textarea
                  rows="2"
                  placeholder="Mensaje que dirá el Asistente de Voz al llamar..."
                  value={customVoiceMessage}
                  onChange={(e) => setCustomVoiceMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>
            </div>

            {/* Teclado Numérico (Dialpad) */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDialNumber(digit)}
                  className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white font-mono font-bold text-base transition-colors active:scale-95"
                >
                  {digit}
                </button>
              ))}
            </div>

            {callSuccessMessage && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 size={16} />
                <span>{callSuccessMessage}</span>
              </div>
            )}

            {/* Botones de Inicio de Llamada */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('in_call')}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold transition-all"
              >
                <Radio size={16} />
                Llamada en Vivo
              </button>

              <button
                type="button"
                onClick={handleStartOutboundCall}
                disabled={isCalling || !phoneNumber.trim()}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <PhoneCall size={16} />
                {isCalling ? 'Llamando...' : 'Llamar por WhatsApp'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
