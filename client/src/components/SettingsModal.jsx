import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Bot, 
  Key, 
  Volume2, 
  Play, 
  Save, 
  X, 
  Sparkles, 
  Check, 
  PhoneCall,
  Sliders,
  MessageSquare,
  RefreshCw,
  GitBranch,
  ArrowUpCircle,
  ExternalLink
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [settings, setSettings] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test voice
  const [testVoiceText, setTestVoiceText] = useState('¡Hola! Soy tu asistente virtual de ventas por WhatsApp. ¿En qué te puedo ayudar hoy?');
  const [testVoiceAudioUrl, setTestVoiceAudioUrl] = useState(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  // GitHub Updates
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateLogs, setUpdateLogs] = useState([]);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setSettings(data.settings);
          setAvailableVoices(data.availableVoices || []);
        })
        .catch(err => console.error('Error cargando configuración:', err));
    }
  }, [isOpen]);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await fetch('/api/system/update-check');
      const data = await res.json();
      setUpdateInfo(data);
    } catch (e) {
      console.error('Error verificando actualizaciones:', e);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setIsApplyingUpdate(true);
    setUpdateLogs(['Iniciando proceso de actualización desde GitHub...']);
    try {
      const res = await fetch('/api/system/update-apply', { method: 'POST' });
      const data = await res.json();
      if (data.logs) setUpdateLogs(data.logs);
      if (data.success) {
        setUpdateSuccess(true);
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch (e) {
      setUpdateLogs(prev => [...prev, `Error: ${e.message}`]);
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  if (!isOpen || !settings) return null;

  const handleSave = async (e) => {
    e?.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const updated = await res.json();
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error guardando configuración:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    setTestVoiceAudioUrl(null);

    try {
      const res = await fetch('/api/ai/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testVoiceText,
          voice: settings.aiVoiceModel
        })
      });
      const data = await res.json();
      setTestVoiceAudioUrl(data.audioUrl);
    } catch (err) {
      console.error('Error probando voz:', err);
    } finally {
      setIsTestingVoice(false);
    }
  };

  const tabs = [
    { id: 'ai', label: 'Motor de IA', icon: Bot },
    { id: 'voice', label: 'Voz & Síntesis (TTS)', icon: Volume2 },
    { id: 'automation', label: 'Llamadas & Auto-Respuestas', icon: PhoneCall },
    { id: 'prompt', label: 'Prompt del Agente', icon: Sliders },
    { id: 'updates', label: 'Actualizaciones GitHub', icon: RefreshCw },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-[#111b21] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#182229]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Configuración del Agente IA</h2>
              <p className="text-xs text-slate-400">Personaliza modelos, voces, API keys y reglas de ventas</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-[#111b21] px-4 pt-2 gap-2 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-xl'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* TAB 1: AI ENGINE */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Proveedor Principal de IA</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'gemini' })}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      settings.aiProvider === 'gemini'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <Sparkles size={20} className="text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold">Google Gemini</div>
                      <div className="text-[10px] text-slate-400">Gemini 2.0 Flash (Recomendado)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'openai' })}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      settings.aiProvider === 'openai'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <Bot size={20} className="text-sky-400" />
                    <div>
                      <div className="text-xs font-bold">OpenAI</div>
                      <div className="text-[10px] text-slate-400">GPT-4o / GPT-4o-mini</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Google Gemini API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Permite transcripción de audio multimodal y respuestas ultra-rápidas con Gemini 2.0 Flash.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settings.openaiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Utilizada para modelos GPT-4o, Whisper STT y OpenAI TTS.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Modelo de Lenguaje (LLM)</label>
                <select
                  value={settings.aiModel || 'gemini-2.0-flash'}
                  onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {settings.aiProvider === 'gemini' ? (
                    <>
                      <option value="gemini-2.0-flash">gemini-2.0-flash (Más rápido y potente)</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-4o-mini">gpt-4o-mini (Recomendado para ventas rápidas)</option>
                      <option value="gpt-4o">gpt-4o (Máxima inteligencia)</option>
                      <option value="gpt-4-turbo">gpt-4-turbo</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* TAB 2: VOICE & TTS */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              
              {/* Selector de Proveedor TTS */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Proveedor de Voz (Text-to-Speech)</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ttsProvider: 'edge' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      (settings.ttsProvider || 'edge') === 'edge'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-emerald-400">Edge Neural</div>
                    <div className="text-[10px] text-slate-400">Gratuito y rápido</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ttsProvider: 'elevenlabs' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.ttsProvider === 'elevenlabs'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-purple-400">ElevenLabs</div>
                    <div className="text-[10px] text-slate-400">Ultra-realista & Clonación</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ttsProvider: 'openai' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.ttsProvider === 'openai'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-sky-400">OpenAI TTS</div>
                    <div className="text-[10px] text-slate-400">Alloy, Nova, Echo</div>
                  </button>
                </div>
              </div>

              {/* Configuración específica de ElevenLabs */}
              {settings.ttsProvider === 'elevenlabs' && (
                <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-3 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-purple-300 mb-1">ElevenLabs API Key</label>
                    <input
                      type="password"
                      placeholder="sk_..."
                      value={settings.elevenlabsApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, elevenlabsApiKey: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Obtén tu API Key en <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="text-purple-400 underline">elevenlabs.io</a>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">Modelo de ElevenLabs</label>
                      <select
                        value={settings.elevenlabsModelId || 'eleven_multilingual_v2'}
                        onChange={(e) => setSettings({ ...settings, elevenlabsModelId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="eleven_multilingual_v2">eleven_multilingual_v2 (Mejor español)</option>
                        <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (Baja latencia)</option>
                        <option value="eleven_flash_v2_5">eleven_flash_v2_5 (Ultra rápido)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">ID de Voz o Clonada</label>
                      <input
                        type="text"
                        placeholder="21m00Tcm4TlvDq8ikWAM"
                        value={settings.elevenlabsVoiceId || ''}
                        onChange={(e) => setSettings({ ...settings, elevenlabsVoiceId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Selector de Voz General */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Voz Seleccionada para Notas de Voz y Llamadas</label>
                <select
                  value={settings.aiVoiceModel || 'es-MX-DaliaNeural'}
                  onChange={(e) => {
                    const selectedVal = e.target.value;
                    setSettings({ 
                      ...settings, 
                      aiVoiceModel: selectedVal,
                      elevenlabsVoiceId: settings.ttsProvider === 'elevenlabs' ? selectedVal : settings.elevenlabsVoiceId
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {availableVoices
                    .filter(v => !settings.ttsProvider || v.provider === settings.ttsProvider)
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  {/* Si es Elevenlabs y no hay filtro coincidente, mostrar todas las de Elevenlabs */}
                  {settings.ttsProvider === 'elevenlabs' && availableVoices.filter(v => v.provider === 'elevenlabs').map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Probador de Voz en Vivo */}
              <div className="bg-[#182229] border border-slate-700/60 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Volume2 size={14} /> Probar Síntesis de Voz
                </div>
                <textarea
                  rows="2"
                  value={testVoiceText}
                  onChange={(e) => setTestVoiceText(e.target.value)}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    disabled={isTestingVoice}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-md"
                  >
                    <Play size={14} />
                    {isTestingVoice ? 'Generando...' : 'Escuchar Voz'}
                  </button>

                  {testVoiceAudioUrl && (
                    <AudioPlayer audioUrl={testVoiceAudioUrl} isAgent={true} />
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#182229] border border-slate-700/60 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Responder con notas de voz a notas de voz</div>
                    <div className="text-[11px] text-slate-400">Si el cliente envía un audio, el agente responderá con un audio de voz.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.voiceRepliesEnabled)}
                    onChange={(e) => setSettings({ ...settings, voiceRepliesEnabled: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#182229] border border-slate-700/60 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Siempre responder con notas de voz</div>
                    <div className="text-[11px] text-slate-400">El agente responderá SIEMPRE con notas de voz PTT, incluso a textos.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.alwaysVoiceReply)}
                    onChange={(e) => setSettings({ ...settings, alwaysVoiceReply: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: CALLS & AUTOMATION */}
          {activeTab === 'automation' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre del Asistente</label>
                  <input
                    type="text"
                    value={settings.agentName || ''}
                    onChange={(e) => setSettings({ ...settings, agentName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre de la Empresa</label>
                  <input
                    type="text"
                    value={settings.businessName || ''}
                    onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#182229] border border-slate-700/60 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-white">Auto-Respuesta Global con IA</div>
                  <div className="text-[11px] text-slate-400">Permite que el agente responda automáticamente en WhatsApp a leads activos.</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.autoReplyEnabled)}
                  onChange={(e) => setSettings({ ...settings, autoReplyEnabled: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#182229] border border-slate-700/60 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-white">Auto-Seguimiento con Nota de Voz por Llamadas</div>
                  <div className="text-[11px] text-slate-400">Cuando entra una llamada de voz, enviar nota de voz inmediata explicativa.</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.autoCallFollowUp)}
                  onChange={(e) => setSettings({ ...settings, autoCallFollowUp: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 focus:ring-0"
                />
              </label>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Mensaje de Voz para Llamadas Entrantes</label>
                <textarea
                  rows="3"
                  value={settings.callFollowUpMessage || ''}
                  onChange={(e) => setSettings({ ...settings, callFollowUpMessage: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM PROMPT */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Instrucciones del Sistema (System Prompt de Ventas y Atención)</label>
                <textarea
                  rows="12"
                  value={settings.systemPrompt || ''}
                  onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Define la personalidad del agente, tácticas de cierre, cómo saludar y cómo resolver dudas técnicas o comerciales.
                </span>
              </div>
            </div>
          )}

          {/* TAB 5: GITHUB UPDATES */}
          {activeTab === 'updates' && (
            <div className="space-y-4">
              
              {/* Tarjeta de Estado del Repositorio */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <GitBranch size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Repositorio Oficial</div>
                      <a 
                        href="https://github.com/Diberto/wagent" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[11px] text-purple-400 hover:underline flex items-center gap-1"
                      >
                        github.com/Diberto/wagent <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdate || isApplyingUpdate}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-slate-200 border border-slate-700 transition-all active:scale-95"
                  >
                    <RefreshCw size={13} className={isCheckingUpdate ? 'animate-spin' : ''} />
                    {isCheckingUpdate ? 'Consultando...' : 'Buscar Actualizaciones'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="text-slate-400">
                    Versión Instalada: <span className="text-white font-mono font-semibold">{updateInfo?.currentVersion || 'v1.0.0'}</span>
                  </div>
                  <div className="text-slate-400">
                    Commit Local: <span className="text-emerald-400 font-mono">{updateInfo?.currentCommit || 'HEAD'}</span>
                  </div>
                </div>
              </div>

              {/* Banner de Actualización Disponible */}
              {updateInfo?.updateAvailable && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                      <ArrowUpCircle size={18} />
                      ¡Nueva versión disponible en GitHub!
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Commit {updateInfo.latestCommit}
                    </span>
                  </div>

                  <div className="bg-[#111b21] rounded-xl p-3 border border-slate-800 text-xs space-y-1">
                    <div className="text-[11px] text-slate-400 font-semibold">Mensaje del Commit:</div>
                    <div className="text-slate-200 font-mono text-[11px]">{updateInfo.latestCommitMessage}</div>
                    <div className="text-[10px] text-slate-500 pt-1">
                      Publicado por <span className="text-slate-300">{updateInfo.author}</span> • {new Date(updateInfo.latestCommitDate).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyUpdate}
                    disabled={isApplyingUpdate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    <RefreshCw size={14} className={isApplyingUpdate ? 'animate-spin' : ''} />
                    {isApplyingUpdate ? 'Actualizando Sistema...' : 'Actualizar e Instalar Ahora'}
                  </button>
                </div>
              )}

              {/* Mensaje de Todo al Día */}
              {updateInfo && !updateInfo.updateAvailable && !updateInfo.error && (
                <div className="p-4 rounded-2xl bg-[#182229] border border-slate-800 text-center space-y-1">
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                    <Check size={14} /> Tu versión de WAgent está actualizada
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Estás ejecutando los últimos cambios sincronizados con la rama principal de GitHub.
                  </p>
                </div>
              )}

              {/* Consola de Logs de Actualización */}
              {updateLogs.length > 0 && (
                <div className="bg-[#0b141a] rounded-2xl p-3 border border-slate-800 text-xs font-mono space-y-1 max-h-36 overflow-y-auto">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Registro de Actualización:</div>
                  {updateLogs.map((log, idx) => (
                    <div key={idx} className="text-slate-300 text-[11px]">{log}</div>
                  ))}
                  {updateSuccess && (
                    <div className="text-emerald-400 font-bold text-[11px] pt-1">
                      ¡Actualización lista! Recargando aplicación...
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#182229] flex items-center justify-between">
          <div>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold animate-in fade-in">
                <Check size={14} /> ¡Ajustes guardados correctamente!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-md transition-transform active:scale-95"
            >
              <Save size={14} />
              {isSaving ? 'Guardando...' : 'Guardar Ajustes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
