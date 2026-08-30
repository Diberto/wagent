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
  UserCheck,
  Edit2,
  Edit3,
  Save,
  Trash2,
  X,
  MapPin,
  FileText,
  Copy,
  CheckCircle2,
  Flame,
  Store
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export default function ChatInbox({ 
  socket,
  leads = [], 
  selectedLead, 
  setSelectedLead, 
  onUpdateLeadStage, 
  onToggleLeadAi,
  onSendMessage,
  onSendAudio,
  onCallLead,
  onDeleteLead,
  onClearChat
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [filterStage, setFilterStage] = useState('all');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Edit Contact Modal State
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);
  const [editContactData, setEditContactData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
    stage: 'new_lead',
    value: 0,
    tags: []
  });
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Delete / Clear Chat Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copied transcription toast state
  const [copiedMsgId, setCopiedMsgId] = useState(null);

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
        setMessages(Array.isArray(data) ? data : []);
        setIsLoadingMessages(false);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      })
      .catch(err => {
        console.error('Error cargando mensajes:', err);
        setIsLoadingMessages(false);
      });
  }, [selectedLead?.jid]);

  // Escuchar mensajes entrantes en tiempo real por WebSocket
  useEffect(() => {
    if (!socket) return;
    const handleSocketMessage = ({ message, lead }) => {
      if (!selectedLead || !message) return;
      const currentJid = selectedLead.jid;
      const altJids = selectedLead.altJids || [];
      if (message.chatId === currentJid || altJids.includes(message.chatId)) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    };

    socket.on('chat:message', handleSocketMessage);
    return () => {
      socket.off('chat:message', handleSocketMessage);
    };
  }, [socket, selectedLead?.jid]);

  // Auto-scroll al recibir nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Manejar envío de texto con render optimista
  const handleSendText = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedLead) return;

    const textToSend = inputText.trim();
    setInputText('');

    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      chatId: selectedLead.jid,
      sender: 'agent',
      type: 'text',
      content: textToSend,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    onSendMessage(selectedLead.jid, textToSend);
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
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      alert('No se pudo acceder al micrófono para grabar la nota de voz.');
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        mediaRecorderRef.current.onstop = null;
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Abrir Modal de Edición de Contacto
  const handleOpenEditContact = () => {
    if (!selectedLead) return;
    setEditContactData({
      name: selectedLead.name || selectedLead.pushName || '',
      phone: selectedLead.phone || selectedLead.jid?.split('@')[0] || '',
      address: selectedLead.address || selectedLead.notes?.replace('Dirección: ', '').split('|')[0]?.trim() || '',
      notes: selectedLead.notes || '',
      stage: selectedLead.stage || 'new_lead',
      value: selectedLead.value || 0,
      tags: selectedLead.tags || ['WhatsApp']
    });
    setIsEditContactModalOpen(true);
  };

  // Guardar Cambios de Contacto
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;

    setIsSavingContact(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(selectedLead.id || selectedLead.jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editContactData.name,
          phone: editContactData.phone,
          address: editContactData.address,
          notes: editContactData.notes,
          stage: editContactData.stage,
          value: Number(editContactData.value) || 0,
          tags: editContactData.tags
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedLead(updated);
        setIsEditContactModalOpen(false);
      }
    } catch (err) {
      console.error('Error guardando contacto:', err);
    } finally {
      setIsSavingContact(false);
    }
  };

  // Vaciar Mensajes del Chat
  const handleClearMessages = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/messages/chat/${encodeURIComponent(selectedLead.jid)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMessages([]);
        if (onClearChat) onClearChat(selectedLead.jid);
        setIsDeleteModalOpen(false);
      }
    } catch (err) {
      console.error('Error vaciando mensajes:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Eliminar Contacto por Completo
  const handleDeleteContact = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(selectedLead.id || selectedLead.jid)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (onDeleteLead) onDeleteLead(selectedLead.id || selectedLead.jid);
        setSelectedLead(null);
        setIsDeleteModalOpen(false);
      }
    } catch (err) {
      console.error('Error eliminando contacto:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Copiar transcripción al portapapeles
  const handleCopyTranscription = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2500);
  };

  // Filtrado de Leads en la Barra Lateral
  const filteredLeads = leads.filter(lead => {
    const matchSearch = 
      (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.phone || '').includes(searchTerm) ||
      (lead.jid || '').includes(searchTerm) ||
      (lead.lastMessage || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;
    if (filterStage === 'all') return true;
    return lead.stage === filterStage;
  });

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#111b21]">
      
      {/* 1. Barra Lateral: Lista de Conversaciones */}
      <div className="w-full sm:w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-[#111b21] flex-shrink-0">
        
        {/* Encabezado y Buscador */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <span>Mensajes de WhatsApp</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                {filteredLeads.length}
              </span>
            </h2>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o corte..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filtro rápido de Etapas */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'new_lead', label: 'Nuevos' },
              { id: 'negotiating', label: 'Negociación' },
              { id: 'proposal', label: 'Propuesta' },
              { id: 'closed_won', label: 'Ganados' }
            ].map(stage => (
              <button
                key={stage.id}
                onClick={() => setFilterStage(stage.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                  filterStage === stage.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Chats */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No hay conversaciones en esta categoría
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const isSelected = selectedLead?.jid === lead.jid;
              return (
                <div
                  key={lead.jid || lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`p-3.5 cursor-pointer transition flex items-start gap-3 relative ${
                    isSelected
                      ? 'bg-emerald-500/10 border-l-4 border-emerald-500'
                      : 'hover:bg-[#182229]/60'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm flex-shrink-0">
                    {(lead.name || lead.pushName || 'C').charAt(0).toUpperCase()}
                  </div>

                  {/* Info del Lead */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-white truncate">
                        {lead.name || lead.pushName || 'Contacto WhatsApp'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                        {lead.lastMessageAt ? new Date(lead.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 truncate mb-1">
                      {lead.lastMessage || 'Conversación iniciada'}
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`px-1.5 py-0.2 rounded font-semibold ${
                        lead.stage === 'closed_won' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        lead.stage === 'proposal' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        lead.stage === 'negotiating' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {lead.stage === 'new_lead' ? 'Nuevo' :
                         lead.stage === 'qualified' ? 'Calificado' :
                         lead.stage === 'negotiating' ? 'Negociando' :
                         lead.stage === 'proposal' ? 'Propuesta' :
                         lead.stage === 'closed_won' ? '🎉 Ganado' : 'Perdido'}
                      </span>
                      {lead.value > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold font-mono">
                          ${Number(lead.value).toLocaleString('es-AR')}
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
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold flex items-center justify-center text-sm flex-shrink-0">
                {(selectedLead.name || 'U').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">
                    {selectedLead.name || selectedLead.pushName || 'Contacto WhatsApp'}
                  </h3>
                  <button
                    onClick={handleOpenEditContact}
                    className="p-1 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                    title="Editar datos del contacto (Nombre, dirección, teléfono, notas)"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
                
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono text-[11px] text-slate-300">
                    📞 {selectedLead.phone || selectedLead.jid?.split('@')[0]}
                  </span>
                  {selectedLead.address && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[200px]">
                      <MapPin size={11} className="text-rose-400 flex-shrink-0" />
                      {selectedLead.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones del Header: Llamar, Editar, Vaciar/Eliminar, Toggle IA */}
            <div className="flex items-center gap-2">
              
              {/* Botón Editar Contacto */}
              <button
                onClick={handleOpenEditContact}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition"
                title="Editar datos del contacto"
              >
                <Edit3 size={13} className="text-emerald-400" />
                <span className="hidden md:inline">Editar Contacto</span>
              </button>

              {/* Botón Llamar a este Contacto */}
              <button
                onClick={() => onCallLead && onCallLead(selectedLead)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                title="Llamar o despachar audio a este contacto"
              >
                <PhoneCall size={13} className="text-emerald-400" />
                <span className="hidden md:inline">Llamar</span>
              </button>

              {/* Botón Vaciar / Eliminar Conversación */}
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-2 rounded-xl bg-[#182229] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                title="Vaciar mensajes o eliminar conversación"
              >
                <Trash2 size={14} />
              </button>

              {/* Toggle IA por Chat */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                selectedLead.aiEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Bot size={15} />
                <span className="text-xs font-bold hidden sm:inline">
                  {selectedLead.aiEnabled ? 'IA Activa' : 'Manual'}
                </span>
                <button
                  onClick={() => onToggleLeadAi(selectedLead.jid, !selectedLead.aiEnabled)}
                  className={`w-8 h-4.5 rounded-full transition-colors relative p-0.5 ${
                    selectedLead.aiEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    selectedLead.aiEnabled ? 'translate-x-3.5' : 'translate-x-0'
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
              <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                <p>No hay mensajes en esta conversación.</p>
                <p className="text-[11px] text-slate-500">Envía un mensaje de texto o nota de voz para comenzar.</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.sender === 'user';
                const hasTranscription = msg.type === 'audio' && msg.content && msg.content !== '[Nota de voz]' && msg.content !== '🎤 [Nota de voz]';

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} animate-in fade-in duration-150`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-md rounded-2xl p-3.5 shadow-lg space-y-2 ${
                        isUser
                          ? 'bg-[#202c33] text-white rounded-tl-sm border border-slate-700/50'
                          : 'bg-[#005c4b] text-white rounded-tr-sm border border-emerald-600/30'
                      }`}
                    >
                      {/* Cabecera del mensaje */}
                      <div className="flex items-center justify-between gap-4 text-[11px] font-semibold text-slate-300/80">
                        <span className="flex items-center gap-1">
                          {isUser ? <User size={12} /> : <Bot size={12} className="text-emerald-300" />}
                          {isUser ? (selectedLead.name || selectedLead.pushName || 'Cliente') : 'Asesor Carnicero (IA)'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Contenido de Audio */}
                      {msg.type === 'audio' && (
                        <div className="space-y-2">
                          <AudioPlayer
                            audioUrl={msg.mediaUrl}
                            duration={msg.audioDuration}
                            isAgent={!isUser}
                          />

                          {/* Burbuja de Transcripción de Audio */}
                          {hasTranscription && (
                            <div className="bg-black/30 rounded-xl p-2.5 border border-white/10 text-xs space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400">
                                <span className="flex items-center gap-1">
                                  <Volume2 size={11} /> Transcripción de Audio:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyTranscription(msg.content, msg.id || index)}
                                  className="text-slate-400 hover:text-white p-0.5 rounded"
                                  title="Copiar texto"
                                >
                                  {copiedMsgId === (msg.id || index) ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                </button>
                              </div>
                              <p className="italic text-[11px] text-slate-200 leading-relaxed font-sans">
                                "{msg.content}"
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Texto del mensaje si no es solo audio */}
                      {msg.type !== 'audio' && msg.content && (
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line text-slate-100">
                          {msg.content}
                        </p>
                      )}

                      {/* Check de estado de entrega */}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-slate-300/70 pt-0.5">
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
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-xl hover:bg-emerald-400 transition"
                  >
                    <Send size={14} />
                    Enviar Audio
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendText} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Escribe un mensaje de respuesta (o graba una nota de voz)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-[#182229] border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="button"
                  onClick={startRecording}
                  className="p-2.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] text-slate-400 hover:text-rose-400 border border-slate-700/80 transition"
                  title="Grabar nota de voz"
                >
                  <Mic size={18} />
                </button>

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold transition"
                  title="Enviar mensaje"
                >
                  <Send size={18} />
                </button>
              </form>
            )}
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-[#182229] border border-slate-800 flex items-center justify-center text-emerald-400">
            <Bot size={32} />
          </div>
          <h3 className="text-base font-bold text-white">Selecciona una conversación</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Elige un chat de la lista izquierda para ver los mensajes, reproducir notas de voz, editar el contacto o responder.
          </p>
        </div>
      )}

      {/* 3. Modal de Edición de Contacto */}
      {isEditContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Editar Datos del Contacto</h3>
                  <p className="text-xs text-slate-400">Modifica nombre, teléfono, dirección y notas del CRM</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditContactModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nombre y Apellido:</label>
                <input
                  type="text"
                  required
                  value={editContactData.name}
                  onChange={(e) => setEditContactData({ ...editContactData, name: e.target.value })}
                  placeholder="Ej: Juan González"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Teléfono Real / WhatsApp:</label>
                <input
                  type="text"
                  value={editContactData.phone}
                  onChange={(e) => setEditContactData({ ...editContactData, phone: e.target.value })}
                  placeholder="Ej: +54 9 351 626-2475"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Dirección de Entrega:</label>
                <input
                  type="text"
                  value={editContactData.address}
                  onChange={(e) => setEditContactData({ ...editContactData, address: e.target.value })}
                  placeholder="Ej: Roque Funes 1704, Barrio Urca"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Etapa del Embudo:</label>
                  <select
                    value={editContactData.stage}
                    onChange={(e) => setEditContactData({ ...editContactData, stage: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="new_lead">Nuevo Lead</option>
                    <option value="qualified">Calificado</option>
                    <option value="negotiating">En Negociación</option>
                    <option value="proposal">Propuesta Enviada</option>
                    <option value="closed_won">🎉 Ganado (Venta)</option>
                    <option value="closed_lost">Perdido</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Monto Acumulado ($):</label>
                  <input
                    type="number"
                    value={editContactData.value}
                    onChange={(e) => setEditContactData({ ...editContactData, value: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Notas & Preferencias:</label>
                <textarea
                  rows={2}
                  value={editContactData.notes}
                  onChange={(e) => setEditContactData({ ...editContactData, notes: e.target.value })}
                  placeholder="Ej: Prefiere cortes parrilleros sin grasa..."
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditContactModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition disabled:opacity-50"
                >
                  <Save size={14} />
                  {isSavingContact ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal de Eliminación / Vaciado de Chat */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Gestionar Conversación</h3>
                <p className="text-xs text-slate-400">¿Qué acción deseas realizar con este chat?</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Estás gestionando el chat de <strong className="text-white">{selectedLead?.name || selectedLead?.pushName}</strong> ({selectedLead?.phone || selectedLead?.jid?.split('@')[0]}).
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleClearMessages}
                disabled={isDeleting}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#111b21] hover:bg-slate-800 border border-slate-700 text-left transition"
              >
                <div>
                  <div className="text-xs font-bold text-white">🗑️ Vaciar Historial de Mensajes</div>
                  <div className="text-[10px] text-slate-400">Borra todos los mensajes del chat pero conserva el contacto en el CRM.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDeleteContact}
                disabled={isDeleting}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-left transition"
              >
                <div>
                  <div className="text-xs font-bold text-rose-400">❌ Eliminar Contacto por Completo</div>
                  <div className="text-[10px] text-slate-400">Elimina el lead y todos sus mensajes asociados permanentemente.</div>
                </div>
              </button>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
