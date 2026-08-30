import React, { useState, useEffect, useRef } from 'react';
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
  ExternalLink,
  ShieldCheck,
  HardDriveDownload,
  UploadCloud,
  DownloadCloud,
  RotateCcw,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Trash2,
  CreditCard,
  Copy
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

  // Backups & Snapshots System
  const [backupsList, setBackupsList] = useState([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState(null);
  const fileInputRef = useRef(null);

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

  // Backup Management Handlers
  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setBackupsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando lista de respaldos:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleCreateBackup = async (label = 'manual') => {
    setIsCreatingBackup(true);
    setBackupStatusMessage(null);
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      const data = await res.json();
      if (data.success) {
        setBackupStatusMessage({ type: 'success', text: `¡Respaldo "${data.backup?.filename}" creado exitosamente!` });
        fetchBackups();
      } else {
        setBackupStatusMessage({ type: 'error', text: data.error || 'No se pudo generar el respaldo.' });
      }
    } catch (err) {
      setBackupStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsCreatingBackup(false);
      setTimeout(() => setBackupStatusMessage(null), 6000);
    }
  };

  const handleRestoreBackup = async (filename) => {
    if (!window.confirm(`¿Estás seguro de restaurar el respaldo "${filename}"? Se reemplazarán los datos actuales con este punto de restauración (se creará una copia de seguridad automática previa).`)) {
      return;
    }

    setIsRestoring(true);
    setBackupStatusMessage(null);
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (data.success) {
        setBackupStatusMessage({ 
          type: 'success', 
          text: `¡Restauración completada con éxito! (${data.stats?.leads || 0} leads, ${data.stats?.messages || 0} mensajes, ${data.stats?.products || 0} productos). Recargando datos...` 
        });
        setTimeout(() => window.location.reload(), 2500);
      } else {
        setBackupStatusMessage({ type: 'error', text: data.error || 'Error restaurando respaldo.' });
      }
    } catch (err) {
      setBackupStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleUploadRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`¿Deseas restaurar la base de datos a partir del archivo subido "${file.name}"?`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsRestoring(true);
    setBackupStatusMessage(null);
    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      const res = await fetch('/api/backups/upload-restore', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setBackupStatusMessage({
          type: 'success',
          text: `¡Base de datos restaurada correctamente desde el archivo! Recargando aplicación...`
        });
        setTimeout(() => window.location.reload(), 2500);
      } else {
        setBackupStatusMessage({ type: 'error', text: data.error || 'Error procesando archivo de respaldo.' });
      }
    } catch (err) {
      setBackupStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`¿Eliminar la copia de seguridad "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (res.ok) {
        setBackupsList(prev => prev.filter(b => b.filename !== filename));
      }
    } catch (err) {
      console.error('Error eliminando respaldo:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchBackups();
    }
  }, [activeTab]);

  // Mercado Pago
  const [isTestingMp, setIsTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState(null);

  const handleTestMercadoPago = async () => {
    setIsTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await fetch('/api/mercadopago/test', { method: 'POST' });
      const data = await res.json();
      setMpTestResult(data);
    } catch (err) {
      setMpTestResult({ success: false, error: err.message });
    } finally {
      setIsTestingMp(false);
    }
  };

  const tabs = [
    { id: 'ai', label: 'Motor de IA', icon: Bot },
    { id: 'mercadopago', label: 'Mercado Pago', icon: CreditCard },
    { id: 'voice', label: 'Voz & Síntesis (TTS)', icon: Volume2 },
    { id: 'automation', label: 'Llamadas & Auto-Respuestas', icon: PhoneCall },
    { id: 'prompt', label: 'Prompt del Agente', icon: Sliders },
    { id: 'backups', label: 'Respaldos & Seguridad', icon: ShieldCheck },
    { id: 'updates', label: 'Actualizaciones GitHub', icon: RefreshCw },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-[#111b21] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-[#182229]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Configuración del Sistema & IA</h2>
              <p className="text-xs text-slate-400">Personaliza modelos, voces, Mercado Pago y copias de seguridad</p>
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
          
          {!settings ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw size={32} className="animate-spin text-emerald-400" />
              <div className="text-xs text-slate-400 font-semibold">Cargando configuración del sistema...</div>
            </div>
          ) : (
            <>
              {/* TAB 1: AI ENGINE */}
              {activeTab === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Proveedor de Inteligencia Artificial (LLM)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'gemini' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.aiProvider === 'gemini'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-emerald-400">Google Gemini</div>
                    <div className="text-[10px] text-slate-400">2.0 Flash (Recomendado)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'nvidia' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.aiProvider === 'nvidia'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-green-400">NVIDIA NIM</div>
                    <div className="text-[10px] text-slate-400">Llama 3.3 / DeepSeek</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'openai' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.aiProvider === 'openai'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-sky-400">OpenAI</div>
                    <div className="text-[10px] text-slate-400">GPT-4o / GPT-4o-mini</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, aiProvider: 'custom' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings.aiProvider === 'custom'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-[#182229] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-400">Custom / Ollama</div>
                    <div className="text-[10px] text-slate-400">Local / LM Studio / Groq</div>
                  </button>
                </div>
              </div>

              {/* 1. Campos de Google Gemini */}
              {settings.aiProvider === 'gemini' && (
                <div className="space-y-3 p-4 rounded-2xl bg-[#182229] border border-slate-700/60 animate-in fade-in">
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
                      Permite visión de imágenes, transcripción de voz y respuestas rápidas. Obtén tu clave en <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">aistudio.google.com</a>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Modelo de Gemini</label>
                    <select
                      value={settings.aiModel || 'gemini-flash-latest'}
                      onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="gemini-flash-latest">gemini-flash-latest (Ultra Rápido + Multimodal + Visión + Audios)</option>
                      <option value="gemini-pro-latest">gemini-pro-latest (Máximo Razonamiento y Ventas)</option>
                      <option value="gemini-3.7-flash">gemini-3.7-flash (Última Generación Google)</option>
                      <option value="gemini-3.5-flash">gemini-3.5-flash (Alta Velocidad)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 2. Campos de NVIDIA NIM */}
              {settings.aiProvider === 'nvidia' && (
                <div className="space-y-3 p-4 rounded-2xl bg-green-950/20 border border-green-500/30 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-green-300 mb-1">NVIDIA API Key</label>
                    <input
                      type="password"
                      placeholder="nvapi-..."
                      value={settings.nvidiaApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, nvidiaApiKey: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Obtén tu API Key gratuita en <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-green-400 underline">build.nvidia.com</a>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-green-300 mb-1">Modelo de NVIDIA NIM</label>
                    <select
                      value={settings.nvidiaModel || 'meta/llama-3.3-70b-instruct'}
                      onChange={(e) => setSettings({ ...settings, nvidiaModel: e.target.value })}
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-green-500"
                    >
                      <option value="meta/llama-3.3-70b-instruct">meta/llama-3.3-70b-instruct (Última generación recomendada)</option>
                      <option value="meta/llama-3.1-70b-instruct">meta/llama-3.1-70b-instruct</option>
                      <option value="deepseek-ai/deepseek-r1">deepseek-ai/deepseek-r1 (Razonamiento avanzado)</option>
                      <option value="mistralai/mistral-large-2-instruct">mistralai/mistral-large-2-instruct</option>
                      <option value="nvidia/llama-3.2-11b-vision-instruct">nvidia/llama-3.2-11b-vision-instruct (Visión)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 3. Campos de OpenAI */}
              {settings.aiProvider === 'openai' && (
                <div className="space-y-3 p-4 rounded-2xl bg-sky-950/20 border border-sky-500/30 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-sky-300 mb-1">OpenAI API Key</label>
                    <input
                      type="password"
                      placeholder="sk-proj-..."
                      value={settings.openaiApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-sky-300 mb-1">Modelo de OpenAI</label>
                    <select
                      value={settings.aiModel || 'gpt-4o-mini'}
                      onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Rápido y económico para ventas)</option>
                      <option value="gpt-4o">gpt-4o (Máxima inteligencia + Visión)</option>
                      <option value="gpt-4-turbo">gpt-4-turbo</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 4. Campos de Custom Endpoint (Ollama, LM Studio, Groq, DeepSeek, LocalAI) */}
              {settings.aiProvider === 'custom' && (
                <div className="space-y-3 p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-amber-300 mb-1">Base URL del Endpoint OpenAI-compatible</label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434/v1 o https://api.groq.com/openai/v1"
                      value={settings.customBaseUrl || ''}
                      onChange={(e) => setSettings({ ...settings, customBaseUrl: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Compatible con Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`), Groq, DeepSeek, vLLM, etc.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-amber-300 mb-1">Nombre del Modelo</label>
                      <input
                        type="text"
                        placeholder="llama3 / mistral / deepseek-chat"
                        value={settings.customModel || ''}
                        onChange={(e) => setSettings({ ...settings, customModel: e.target.value })}
                        className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-amber-300 mb-1">API Key (Si aplica)</label>
                      <input
                        type="password"
                        placeholder="Opcional para Ollama/Local"
                        value={settings.customApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                        className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB MERCADO PAGO */}
          {activeTab === 'mercadopago' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Banner Header Mercado Pago */}
              <div className="p-4 rounded-2xl bg-[#009ee3]/10 border border-[#009ee3]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#009ee3] text-white flex items-center justify-center font-extrabold text-sm shadow-md shadow-[#009ee3]/30">
                    MP
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Mercado Pago Checkout Pro & Cobros
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                        🇦🇷 Argentina
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Genera links de pago oficiales y cobra por WhatsApp con acreditación automática
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestMercadoPago}
                  disabled={isTestingMp}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#009ee3] hover:bg-[#0081ba] text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isTestingMp ? 'animate-spin' : ''} />
                  {isTestingMp ? 'Verificando...' : '⚡ Probar Conexión'}
                </button>
              </div>

              {/* Status Test Result Alert */}
              {mpTestResult && (
                <div className={`p-3 rounded-2xl border text-xs flex items-center gap-2.5 ${
                  mpTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  {mpTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <div>
                    {mpTestResult.success ? (
                      <div>
                        <span className="font-bold">¡Conexión Exitosa con Mercado Pago!</span> Cuenta: <b>{mpTestResult.user?.nickname || 'Vendedor'}</b> (ID: {mpTestResult.user?.id}) — Listo para cobrar en vivo.
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold">Error de Conexión:</span> {mpTestResult.error || 'Revisa las credenciales ingresadas.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-[#182229] border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Habilitar Mercado Pago</div>
                    <div className="text-[11px] text-slate-400">Permite generar links y recibir webhooks</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.mercadopagoEnabled !== false}
                    onChange={(e) => setSettings({ ...settings, mercadopagoEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-[#182229] border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Auto-Enviar Link por WhatsApp</div>
                    <div className="text-[11px] text-slate-400">Cuando el cliente elija Mercado Pago</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.mercadopagoAutoSendLink !== false}
                    onChange={(e) => setSettings({ ...settings, mercadopagoAutoSendLink: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Credenciales */}
              <div className="space-y-3 p-4 rounded-2xl bg-[#182229] border border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Credenciales de la Aplicación</h4>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Access Token (Producción / Prueba)</label>
                  <input
                    type="password"
                    placeholder="APP_USR-..."
                    value={settings.mercadopagoAccessToken || ''}
                    onChange={(e) => setSettings({ ...settings, mercadopagoAccessToken: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#009ee3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Public Key</label>
                  <input
                    type="text"
                    placeholder="APP_USR-..."
                    value={settings.mercadopagoPublicKey || ''}
                    onChange={(e) => setSettings({ ...settings, mercadopagoPublicKey: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#009ee3]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">N.° de Aplicación (App ID)</label>
                    <input
                      type="text"
                      placeholder="963262173359779"
                      value={settings.mercadopagoAppId || ''}
                      onChange={(e) => setSettings({ ...settings, mercadopagoAppId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">User ID</label>
                    <input
                      type="text"
                      placeholder="2050924390"
                      value={settings.mercadopagoUserId || ''}
                      onChange={(e) => setSettings({ ...settings, mercadopagoUserId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Usuario de Prueba</label>
                    <input
                      type="text"
                      placeholder="TESTUSER1028937958"
                      value={settings.mercadopagoTestUser || ''}
                      onChange={(e) => setSettings({ ...settings, mercadopagoTestUser: e.target.value })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Webhook Info Box */}
              <div className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-[#009ee3]" />
                    URL de Webhook / Notificaciones IPN:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/mercadopago/webhook`);
                      alert('¡URL de Webhook copiada!');
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 text-[11px]"
                  >
                    <Copy size={11} /> Copiar
                  </button>
                </div>
                <div className="p-2 rounded-xl bg-[#182229] font-mono text-[11px] text-[#009ee3] select-all truncate border border-slate-800">
                  {window.location.origin}/api/mercadopago/webhook
                </div>
                <p className="text-[11px] text-slate-400">
                  Al recibir un pago acreditado, WAgent actualizará automáticamente el estado del pedido a <b>En Preparación</b> y le enviará un WhatsApp de confirmación al cliente.
                </p>
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

          {/* 6. PESTAÑA: RESPALDOS Y SEGURIDAD */}
          {activeTab === 'backups' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Header Card */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Sistema de Respaldos y Restauración</h3>
                      <p className="text-xs text-slate-400">Protege clientes, historial de chats, audios, catálogo y configuración</p>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCreateBackup('manual')}
                    disabled={isCreatingBackup}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    <HardDriveDownload size={15} className={isCreatingBackup ? 'animate-bounce' : ''} />
                    {isCreatingBackup ? 'Generando Respaldo...' : 'Crear Respaldo Ahora'}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRestoring}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-200 hover:text-white font-bold text-xs transition-all"
                  >
                    <UploadCloud size={15} className="text-purple-400" />
                    Restaurar desde Archivo (.json)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleUploadRestoreFile}
                  />
                </div>
              </div>

              {/* Status Message */}
              {backupStatusMessage && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
                  backupStatusMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  {backupStatusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{backupStatusMessage.text}</span>
                </div>
              )}

              {/* Backups List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <FileJson size={14} className="text-emerald-400" />
                    Puntos de Restauración Disponibles ({backupsList.length})
                  </span>
                  <button
                    type="button"
                    onClick={fetchBackups}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw size={11} className={isLoadingBackups ? 'animate-spin' : ''} />
                    Actualizar lista
                  </button>
                </div>

                {isLoadingBackups ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-emerald-500" />
                    Cargando respaldos...
                  </div>
                ) : backupsList.length === 0 ? (
                  <div className="py-8 bg-[#182229] border border-slate-800 rounded-2xl text-center text-xs text-slate-500">
                    No hay copias de seguridad generadas aún. Haz clic en "Crear Respaldo Ahora" para proteger tus datos.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {backupsList.map(bkp => (
                      <div
                        key={bkp.filename}
                        className="bg-[#182229] hover:bg-[#202c33] border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-white truncate">{bkp.filename}</span>
                            <span className={`text-[10px] uppercase px-1.5 py-0.2 rounded font-bold ${
                              bkp.label === 'auto-daily' || bkp.label === 'auto-startup'
                                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                : bkp.label === 'pre-restore-safety'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {bkp.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            <span>📅 {new Date(bkp.createdAt).toLocaleString()}</span>
                            <span>📦 {(bkp.sizeBytes / 1024).toFixed(1)} KB</span>
                            {bkp.stats && (
                              <span className="text-slate-500">
                                ({bkp.stats.totalLeads ?? bkp.stats.leads ?? 0} leads • {bkp.stats.totalMessages ?? bkp.stats.messages ?? 0} msgs • {bkp.stats.totalProducts ?? bkp.stats.products ?? 0} prod)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Descargar */}
                          <a
                            href={`/api/backups/download/${encodeURIComponent(bkp.filename)}`}
                            download
                            className="p-2 rounded-xl bg-[#111b21] hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                            title="Descargar archivo de respaldo"
                          >
                            <DownloadCloud size={15} />
                          </a>

                          {/* Restaurar */}
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(bkp.filename)}
                            disabled={isRestoring}
                            className="p-2 rounded-xl bg-[#111b21] hover:bg-purple-950/40 text-slate-400 hover:text-purple-400 border border-slate-700/60 transition"
                            title="Restaurar base de datos a este punto"
                          >
                            <RotateCcw size={15} />
                          </button>

                          {/* Eliminar */}
                          <button
                            type="button"
                            onClick={() => handleDeleteBackup(bkp.filename)}
                            className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                            title="Eliminar este respaldo"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="p-3 bg-[#111b21] border border-slate-800/80 rounded-xl text-[11px] text-slate-400 flex items-start gap-2">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">Protección Automática 24/7:</span> WAgent genera copias de seguridad automáticas diarias y antes de cada restauración. Puedes descargar los archivos `.json` en cualquier momento para mantener una copia física en tu computadora o migrar a otro servidor.
                </div>
              </div>
            </div>
          )}

            </>
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
