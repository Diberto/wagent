import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Send, 
  Mic, 
  Square, 
  Bot, 
  User, 
  Phone, 
  Tag, 
  DollarSign, 
  Sparkles, 
  Check, 
  CheckCheck, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Volume2,
  PhoneCall,
  UserCheck
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export default function ChatInbox({ 
  leads = [], 
  selectedLead, 
  setSelectedLead, 
  onUpdateLeadStage, 
  onToggleLeadAi,
  onSendMessage,
  onSendAudio,
  onCallLead
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [filterStage, setFilterStage] = useState('all');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Cargar mensajes cuando cambia el lead seleccionado
  useEffect(() => {
    if (!selectedLead) return;

    setIsLoadingMessages(true);
    fetch(`/api/chats/${encodeURIComponent(selectedLead.jid)}/messages`)
      .then(res => res.json())
      .then(data => {
        setMessages(data);
        setIsLoadingMessages(false);
        // Scroll al fondo
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      })
      .catch(err => {
        console.error('Error cargando mensajes:', err);
        setIsLoadingMessages(false);
      });
  }, [selectedLead?.jid]);

  // Auto-scroll al recibir nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Manejar envío de texto
  const handleSendText = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedLead) return;

    onSendMessage(selectedLead.jid, inputText.trim());
    setInputText('');
  };

  // Grabación de audio con MediaRecorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0 && selectedLead) {
          const formData = new FormData();
          formData.append('audio', audioBlob, `voice_note_${Date.now()}.webm`);
          onSendAudio(selectedLead.jid, formData);
        }
        // Detener pistas de audio
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accediendo al micrófono:', err);
      alert('No se pudo acceder al micrófono del navegador. Permite el acceso para grabar notas de voz.');
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Filtrar leads
  const filteredLeads = leads.filter(l => {
    const matchesSearch = (l.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (l.phone || '').includes(searchTerm) ||
                          (l.lastMessage || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = filterStage === 'all' || l.stage === filterStage;
    return matchesSearch && matchesStage;
  });

  const stages = [
    { id: 'all', label: 'Todos' },
    { id: 'new_lead', label: 'Nuevos' },
    { id: 'qualified', label: 'Calificados' },
    { id: 'negotiating', label: 'Negociando' },
    { id: 'proposal', label: 'Propuesta' },
    { id: 'closed_won', label: 'Ganados' },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0b141a] overflow-hidden">
      
      {/* 1. Lista Lateral de Chats & Leads */}
      <div className="w-full md:w-80 lg:w-96 border-r border-slate-800/80 bg-[#111b21] flex flex-col flex-shrink-0">
        
        {/* Barra de búsqueda y filtros */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar chat o número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#202c33] border border-slate-700/50 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Filtros rápidos por etapa */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {stages.map(s => (
              <button
                key={s.id}
                onClick={() => setFilterStage(s.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  filterStage === s.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de contactos / leads */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No hay conversaciones en esta categoría.
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = selectedLead?.jid === lead.jid;
              return (
                <div
                  key={lead.jid}
                  onClick={() => setSelectedLead(lead)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#202c33] border-l-4 border-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Avatar con inicial o bot */}
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-slate-700/80 flex items-center justify-center text-white font-bold text-sm">
                      {(lead.name || lead.pushName || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    {lead.aiEnabled && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[9px] font-bold shadow-md" title="IA Activa">
                        <Bot size={10} />
                      </span>
                    )}
                  </div>

                  {/* Detalles del contacto */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {lead.name || lead.pushName || lead.phone}
                      </h4>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {lead.lastMessageAt ? new Date(lead.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 truncate mb-1.5">
                      {lead.lastMessage || 'Sin mensajes aún'}
                    </p>

                    {/* Tags y etapa del lead */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                        {lead.stage === 'new_lead' ? 'Nuevo' :
                         lead.stage === 'qualified' ? 'Calificado' :
                         lead.stage === 'negotiating' ? 'Negociando' :
                         lead.stage === 'proposal' ? 'Propuesta' :
                         lead.stage === 'closed_won' ? '🎉 Ganado' : 'Perdido'}
                      </span>
                      {lead.value > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold">
                          ${lead.value}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de no leídos */}
                  {lead.unreadCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 self-center">
                      {lead.unreadCount}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* 2. Área Principal de Chat & Mensajes */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden">
          
          {/* Header del Chat */}
          <div className="h-16 px-5 border-b border-slate-800 bg-[#111b21] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center">
                {(selectedLead.name || 'U').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {selectedLead.name || selectedLead.pushName}
                  <span className="text-xs font-normal text-slate-400">{selectedLead.phone}</span>
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Tag size={12} className="text-emerald-400" />
                    Etapa:
                  </span>
                  <select
                    value={selectedLead.stage}
                    onChange={(e) => onUpdateLeadStage(selectedLead.jid, e.target.value)}
                    className="bg-slate-800 text-emerald-400 font-semibold text-xs rounded-lg px-2 py-0.5 border border-slate-700 focus:outline-none"
                  >
                    <option value="new_lead">Nuevo Lead</option>
                    <option value="qualified">Calificado</option>
                    <option value="negotiating">En Negociación</option>
                    <option value="proposal">Propuesta Enviada</option>
                    <option value="closed_won">Venta Cerrada (Ganado)</option>
                    <option value="closed_lost">Perdido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Acciones de Llamada y Toggle de Agente IA para este chat */}
            <div className="flex items-center gap-2.5">
              
              {/* Botón Llamar a este Contacto */}
              <button
                onClick={() => onCallLead && onCallLead(selectedLead)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                title="Llamar o despachar audio a este contacto"
              >
                <PhoneCall size={14} className="text-emerald-400" />
                <span className="hidden sm:inline">Llamar</span>
              </button>

              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                selectedLead.aiEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Bot size={16} />
                <span className="text-xs font-bold">
                  {selectedLead.aiEnabled ? 'IA Respondiendo' : 'Modo Manual'}
                </span>
                <button
                  onClick={() => onToggleLeadAi(selectedLead.jid, !selectedLead.aiEnabled)}
                  className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                    selectedLead.aiEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    selectedLead.aiEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Hilo de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 chat-bg-pattern space-y-4">
            {isLoadingMessages ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No hay mensajes previos en este chat. Escribe un mensaje o envía un audio para comenzar.
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} animate-in fade-in duration-150`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-md rounded-2xl p-3.5 shadow-lg ${
                        isUser
                          ? 'bg-[#202c33] text-white rounded-tl-sm border border-slate-700/50'
                          : 'bg-[#005c4b] text-white rounded-tr-sm border border-emerald-600/30'
                      }`}
                    >
                      {/* Cabecera del mensaje si es audio o llamada */}
                      <div className="flex items-center justify-between gap-4 mb-1 text-[11px] font-semibold text-slate-300/80">
                        <span className="flex items-center gap-1">
                          {isUser ? <User size={12} /> : <Bot size={12} className="text-emerald-300" />}
                          {isUser ? (selectedLead.name || 'Cliente') : 'Agente IA (Sara)'}
                        </span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Contenido de Audio */}
                      {msg.type === 'audio' && (
                        <div className="my-2">
                          <AudioPlayer
                            audioUrl={msg.mediaUrl}
                            duration={msg.audioDuration}
                            isAgent={!isUser}
                          />
                        </div>
                      )}

                      {/* Texto del mensaje o transcripción */}
                      {msg.content && (
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line text-slate-100">
                          {msg.content}
                        </p>
                      )}

                      {/* Check de estado */}
                      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-300/70">
                        {isUser ? null : <CheckCheck size={13} className="text-sky-300" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Entrada de Texto y Grabación de Audio */}
          <div className="p-3.5 bg-[#111b21] border-t border-slate-800 flex-shrink-0">
            {isRecording ? (
              <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 px-5 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-sm font-bold text-rose-400">Grabando Nota de Voz: {formatTimer(recordingSeconds)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => stopRecording(true)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => stopRecording(false)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md"
                  >
                    <Send size={14} /> Enviar Audio
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendText} className="flex items-center gap-2.5">
                
                {/* Botón de Grabación de Audio PTT */}
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 flex items-center justify-center transition-colors flex-shrink-0 border border-slate-700/50 shadow-sm"
                  title="Grabar y enviar nota de voz de WhatsApp"
                >
                  <Mic size={18} />
                </button>

                {/* Input de Texto */}
                <input
                  type="text"
                  placeholder="Escribe un mensaje de respuesta..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 py-2.5 px-4 bg-[#202c33] border border-slate-700/50 rounded-2xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                />

                {/* Botón de Enviar */}
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-slate-950 font-bold flex items-center justify-center transition-transform active:scale-95 flex-shrink-0 shadow-lg shadow-emerald-500/20"
                >
                  <Send size={18} />
                </button>
              </form>
            )}
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0b141a]">
          <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-4">
            <Bot size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Selecciona una conversación</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Haz clic en un contacto de la izquierda para ver su historial, responder mensajes de texto y notas de voz con IA o control manual.
          </p>
        </div>
      )}

    </div>
  );
}
