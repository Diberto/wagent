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
  Delete,
  RefreshCw,
  AlertCircle
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
  const [mode, setMode] = useState('dialer'); // 'incoming' | 'dialer' | 'in_call' | 'elevenlabs_call'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [customVoiceMessage, setCustomVoiceMessage] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [callSuccessMessage, setCallSuccessMessage] = useState(null);

  // Live Call WebRTC State (Standard)
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveAiResponse, setLiveAiResponse] = useState('');
  const [liveAiAudioUrl, setLiveAiAudioUrl] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ElevenLabs Conversational AI Agent State
  const [isElevenConnected, setIsElevenConnected] = useState(false);
  const [elevenAgentStatus, setElevenAgentStatus] = useState('connecting'); // 'connecting' | 'listening' | 'speaking' | 'error'
  const [elevenAgentId, setElevenAgentId] = useState('agent_3701khpbdw76fyqb7pd3gj6a1a8g');
  const [elevenError, setElevenError] = useState(null);

  const callTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const isMutedRef = useRef(false);

  // Web Audio & WebSocket refs for ElevenLabs ConvAI
  const wsRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Si hay llamada entrante, activar modo incoming
  useEffect(() => {
    if (incomingCall) {
      setMode('incoming');
    } else if (activeLead) {
      setPhoneNumber(activeLead.phone || activeLead.jid.split('@')[0]);
      setContactName(activeLead.name || activeLead.pushName || '');
    }
  }, [incomingCall, activeLead]);

  // Cargar configuración de ElevenLabs al abrir
  useEffect(() => {
    if (isOpen) {
      fetch('/api/elevenlabs/agent/config')
        .then(res => res.json())
        .then(cfg => {
          if (cfg.agentId) setElevenAgentId(cfg.agentId);
        })
        .catch(err => console.log('Error leyendo config de ElevenLabs Agent:', err));
    }
  }, [isOpen]);

  // Manejar temporizador de llamada
  useEffect(() => {
    if (mode === 'in_call' || mode === 'elevenlabs_call') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      if (mode === 'in_call') {
        startLiveVoiceRecognition();
      } else if (mode === 'elevenlabs_call') {
        startElevenLabsConversation();
      }
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      stopLiveVoiceRecognition();
      stopElevenLabsConversation();
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      stopLiveVoiceRecognition();
      stopElevenLabsConversation();
    };
  }, [mode]);

  // =========================================================================
  // ELEVENLABS CONVERSATIONAL AI AGENT (WEBSOCKET REAL-TIME AUDIO STREAMING)
  // Ref: https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket
  // =========================================================================
  const startElevenLabsConversation = async () => {
    setElevenError(null);
    setElevenAgentStatus('connecting');
    setLiveTranscript('🔌 Conectando con el Agente de ElevenLabs (República de la Carne)...');

    try {
      // 1. Obtener URL de conexión (Signed URL o Direct Endpoint)
      const urlRes = await fetch('/api/elevenlabs/agent/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: elevenAgentId })
      });
      const urlData = await urlRes.json();
      const wsUrl = urlData.signedUrl || `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenAgentId}`;

      // 2. Iniciar WebSocket
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // 3. Inicializar Contexto de Reproducción de Audio (16kHz PCM)
      const PlaybackAudioCtx = window.AudioContext || window.webkitAudioContext;
      const playbackCtx = new PlaybackAudioCtx({ sampleRate: 16000 });
      if (playbackCtx.state === 'suspended') {
        await playbackCtx.resume();
      }
      playbackContextRef.current = playbackCtx;
      nextPlayTimeRef.current = playbackCtx.currentTime;
      activeSourcesRef.current = [];

      ws.onopen = async () => {
        setIsElevenConnected(true);
        setElevenAgentStatus('listening');
        setLiveTranscript('🥩 Agente de ElevenLabs Conectado. Escuchando...');

        // 4. Enviar "conversation_initiation_client_data" según la especificación oficial
        try {
          const initRes = await fetch('/api/elevenlabs/agent/initiation-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadJid: activeLead?.jid,
              customerName: contactName || activeLead?.name || 'Cliente',
              phoneNumber: phoneNumber || activeLead?.phone || '',
              address: activeLead?.address || ''
            })
          });
          const initiationPayload = await initRes.json();
          ws.send(JSON.stringify(initiationPayload));
        } catch (e) {
          console.warn('Error enviando initiation client data:', e);
        }

        // 5. Iniciar Captura de Micrófono y Stream de PCM 16kHz
        startMicrophoneStream(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Audio chunk recibido del agente
          if (data.type === 'audio' && data.audio_event?.audio_base_64) {
            setElevenAgentStatus('speaking');
            playAudioChunk(data.audio_event.audio_base_64, playbackCtx);
          }
          // Transcripción de la respuesta del agente
          else if (data.type === 'agent_response' && data.agent_response_event?.agent_response) {
            const agentText = data.agent_response_event.agent_response;
            setLiveTranscript(prev => `${prev}\n🥩 Agente: "${agentText}"`);
          }
          // Transcripción de la voz del usuario
          else if (data.type === 'user_transcript' && data.user_transcription_event?.user_transcript) {
            const userText = data.user_transcription_event.user_transcript;
            setLiveTranscript(prev => `${prev}\n👤 Tú: "${userText}"`);
            setElevenAgentStatus('listening');
          }
          // Interrupción: el usuario habló mientras el agente hablaba
          else if (data.type === 'interruption') {
            stopCurrentAudioPlayback(playbackCtx);
            setElevenAgentStatus('listening');
          }
          // Ping/Pong Heartbeat
          else if (data.type === 'ping' && data.ping_event?.event_id) {
            ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
          }
        } catch (err) {
          console.error('Error procesando mensaje de ElevenLabs:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('Error en WebSocket de ElevenLabs:', err);
        setElevenError('Error de conexión con ElevenLabs. Verifica tu API Key.');
        setElevenAgentStatus('error');
      };

      ws.onclose = () => {
        setIsElevenConnected(false);
        setElevenAgentStatus('connecting');
      };

    } catch (err) {
      console.error('Error iniciando conversación con ElevenLabs:', err);
      setElevenError(`No se pudo conectar: ${err.message}`);
      setElevenAgentStatus('error');
    }
  };

  // Captura y transmisión de audio de micrófono en PCM 16kHz Base64 con AudioWorklet moderno
  const startMicrophoneStream = async (ws) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micStreamRef.current = stream;

      const MicAudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new MicAudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Helper para convertir Float32 a PCM Int16 y Base64
      const sendPcmChunk = (inputData) => {
        if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);
        ws.send(JSON.stringify({ user_audio_chunk: base64Audio }));
      };

      // Intentar usar AudioWorkletNode moderno para evitar deprecación de ScriptProcessorNode
      if (audioCtx.audioWorklet) {
        try {
          const workletCode = `
            class PCMStreamProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const channelData = input[0];
                  if (channelData && channelData.length > 0) {
                    this.port.postMessage(channelData);
                  }
                }
                return true;
              }
            }
            registerProcessor('pcm-stream-processor', PCMStreamProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await audioCtx.audioWorklet.addModule(workletUrl);

          const workletNode = new AudioWorkletNode(audioCtx, 'pcm-stream-processor');
          scriptProcessorRef.current = workletNode;

          workletNode.port.onmessage = (e) => {
            if (e.data) sendPcmChunk(e.data);
          };

          source.connect(workletNode);
          workletNode.connect(audioCtx.destination);
          return;
        } catch (workletErr) {
          console.warn('AudioWorklet falló, usando fallback seguro:', workletErr);
        }
      }

      // Fallback seguro si AudioWorklet no está disponible
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        sendPcmChunk(inputData);
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('Error accediendo al micrófono:', err);
      setElevenError('Permiso de micrófono denegado en el navegador.');
    }
  };

  // Reproducción de buffers de audio PCM 16kHz recibidos de ElevenLabs
  const playAudioChunk = (base64Data, ctx) => {
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 16000);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now;
      }

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setElevenAgentStatus('listening');
        }
      };
    } catch (e) {
      console.error('Error decodificando audio de ElevenLabs:', e);
    }
  };

  const stopCurrentAudioPlayback = (ctx) => {
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (ctx) {
      nextPlayTimeRef.current = ctx.currentTime;
    }
  };

  const stopElevenLabsConversation = () => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch (e) {}
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      stopCurrentAudioPlayback(playbackContextRef.current);
      try { playbackContextRef.current.close(); } catch (e) {}
      playbackContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsElevenConnected(false);
  };

  // Reconocimiento de voz estándar (Web Speech API) para modo fallback
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
            const res = await fetch('/api/ai/live-call-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userText: text,
                jid: activeLead?.jid || 'call@live.user',
                customerName: contactName || activeLead?.name || 'Cliente'
              })
            });
            const data = await res.json();
            const reply = data.replyText || '¡Hola! Te escucho con gusto.';
            setLiveAiResponse(`🤖 Asesor Carnicero: "${reply}"`);
            setLiveTranscript(prev => `${prev}\n🤖 Asesor Carnicero: "${reply}"`);
            
            if (data.audioUrl) {
              setLiveAiAudioUrl(data.audioUrl);
              const audio = new Audio(data.audioUrl);
              audio.play().catch(e => console.log('Audio autoplay prevented:', e));
            }
          } catch (err) {
            console.error('Error en llamada en vivo:', err);
          } finally {
            setIsSpeaking(false);
          }
        }
      };

      recognition.onerror = (e) => {
        // 'no-speech' y 'aborted' son estados normales de silencio en el navegador
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('SpeechRecognition notice:', e.error);
        }
      };
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

  const handleStartElevenLabsPhoneCall = async (e) => {
    e?.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsCalling(true);
    setCallSuccessMessage(null);

    try {
      const res = await fetch('/api/elevenlabs/agent/outbound-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          customerName: contactName.trim() || 'Cliente',
          customMessage: customVoiceMessage.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setCallSuccessMessage(data.message || '¡Llamada con Agente ElevenLabs iniciada con éxito!');
        setTimeout(() => {
          setCallSuccessMessage(null);
          onClose();
        }, 3000);
      } else {
        alert(data.error || 'No se pudo iniciar la llamada telefónica');
      }
    } catch (err) {
      console.error('Error iniciando llamada con ElevenLabs:', err);
    } finally {
      setIsCalling(false);
    }
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
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

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
            <p className="text-sm font-mono text-slate-400 mb-6">
              {incomingCall?.callerNumber}
            </p>

            {/* Opciones de respuesta */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mb-6">
              <button
                onClick={() => setMode('elevenlabs_call')}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all group"
              >
                <Sparkles size={22} className="mb-1.5 text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">ElevenLabs</span>
                <span className="text-[10px] text-slate-400">Agente de Voz Directo</span>
              </button>

              <button
                onClick={() => {
                  onAnswerCallAi(incomingCall);
                  onClose();
                }}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all group"
              >
                <Bot size={22} className="mb-1.5 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Audio IA</span>
                <span className="text-[10px] text-slate-400">Respuesta WhatsApp</span>
              </button>

              <button
                onClick={() => setMode('in_call')}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all group"
              >
                <Radio size={22} className="mb-1.5 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">En Vivo</span>
                <span className="text-[10px] text-slate-400">Por micrófono</span>
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

        {/* 2. MODO ELEVENLABS CONVERSATIONAL AI AGENT (ELEVEN AGENTS LIVE CALL) */}
        {mode === 'elevenlabs_call' && (
          <div className="flex flex-col items-center py-4">
            
            {/* Animated Glowing Orb Visualizer */}
            <div className="relative my-3 flex items-center justify-center">
              <div 
                className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
                  elevenAgentStatus === 'speaking'
                    ? 'scale-110 shadow-cyan-500/40 ring-8 ring-cyan-400/30 animate-pulse'
                    : 'scale-100 shadow-purple-500/20 ring-4 ring-purple-500/20'
                }`}
                style={{
                  background: elevenAgentStatus === 'speaking'
                    ? 'radial-gradient(circle, #9ce6e6 0%, #2792dc 70%, #1a5c9a 100%)'
                    : 'radial-gradient(circle, #c084fc 0%, #7e22ce 70%, #3b0764 100%)'
                }}
              >
                <Sparkles 
                  size={42} 
                  className={`text-white transition-transform duration-300 ${
                    elevenAgentStatus === 'speaking' ? 'animate-spin' : ''
                  }`} 
                />
              </div>

              {/* Ripples when agent is speaking */}
              {elevenAgentStatus === 'speaking' && (
                <div className="absolute inset-0 -m-4 rounded-full border border-cyan-400/30 animate-ping pointer-events-none" />
              )}
            </div>

            <span className="text-xs font-mono font-bold text-purple-300 px-3 py-1 rounded-full bg-purple-950/40 border border-purple-500/30 mb-2 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isElevenConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
              ElevenLabs Agent • {formatCallTime(callDuration)}
            </span>

            <h3 className="text-lg font-bold text-white mb-0.5">
              República de la Carne
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              {contactName || activeLead?.name || phoneNumber || 'Cliente en Línea'}
            </p>

            {/* Estado del Agente */}
            <div className="text-xs font-medium mb-3 flex items-center gap-1.5">
              {elevenAgentStatus === 'speaking' && (
                <span className="text-cyan-300 flex items-center gap-1">
                  <Volume2 size={13} className="animate-pulse" /> Agente Hablando...
                </span>
              )}
              {elevenAgentStatus === 'listening' && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Mic size={13} className="animate-bounce" /> Escuchando tu voz...
                </span>
              )}
              {elevenAgentStatus === 'connecting' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <RefreshCw size={13} className="animate-spin" /> Conectando WebSocket...
                </span>
              )}
              {elevenAgentStatus === 'error' && (
                <span className="text-rose-400 flex items-center gap-1">
                  <AlertCircle size={13} /> {elevenError || 'Error de conexión'}
                </span>
              )}
            </div>

            {/* Transcripción en Vivo Bidireccional */}
            <div className="w-full bg-[#182229] border border-slate-700/60 rounded-2xl p-3.5 mb-5 text-xs max-h-40 overflow-y-auto space-y-2 text-left">
              <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Mic size={10} className="text-purple-400" /> Conversación en Tiempo Real:
              </div>
              <p className="text-slate-200 italic whitespace-pre-line leading-relaxed">
                {liveTranscript || 'Iniciando conversación fluida...'}
              </p>
            </div>

            {/* Controles de Llamada */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-4 rounded-full border transition-all ${
                  isMuted ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title={isMuted ? 'Desmutear Micrófono' : 'Mutear Micrófono'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('dialer');
                  onClose();
                }}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
                title="Finalizar Llamada"
              >
                <PhoneOff size={24} />
              </button>
            </div>
          </div>
        )}

        {/* 3. MODO LLAMADA EN VIVO ESTÁNDAR (FALLBACK) */}
        {mode === 'in_call' && (
          <div className="flex flex-col items-center py-4">
            <div className="w-20 h-20 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center mb-3 ring-4 ring-sky-500/10">
              <PhoneCall size={36} className="animate-pulse" />
            </div>

            <span className="text-xs font-mono font-bold text-sky-400 px-3 py-1 rounded-full bg-sky-500/10 mb-2">
              Llamada en Vivo • {formatCallTime(callDuration)}
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

        {/* 4. MODO MARCADOR TELEFÓNICO (Realizar Llamada Saliente) */}
        {mode === 'dialer' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <PhoneCall size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Centro de Llamadas & Eleven Agents</h3>
                  <p className="text-[10px] text-slate-400">Atención telefónica en vivo y notas de voz con IA</p>
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
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
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
                    placeholder="+54 9 351 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#202c33] border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
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
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed"
                />
              </div>
            </div>

            {/* Teclado Numérico (Dialpad) */}
            <div className="grid grid-cols-3 gap-2 mb-4">
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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMode('elevenlabs_call')}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/20 transition-all active:scale-95"
              >
                <Sparkles size={16} />
                🎙️ Hablar con Agente ElevenLabs en Vivo (Eleven Agents)
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleStartElevenLabsPhoneCall}
                  disabled={isCalling || !phoneNumber.trim()}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  <PhoneCall size={14} />
                  {isCalling ? 'Llamando...' : 'Llamar Teléfono'}
                </button>

                <button
                  type="button"
                  onClick={handleStartOutboundCall}
                  disabled={isCalling || !phoneNumber.trim()}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  <PhoneCall size={14} />
                  {isCalling ? 'Enviando...' : 'Llamar WhatsApp'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMode('in_call')}
                className="flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] font-semibold transition-all"
              >
                <Radio size={13} />
                Simulador de Llamada por Micrófono Local
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
