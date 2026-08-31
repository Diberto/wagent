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
  Copy,
  Globe,
  DollarSign,
  MapPin,
  User,
  Store,
  Filter,
  Plus,
  CheckSquare,
  Layers,
  AlertTriangle,
  Phone,
  Clock,
  Compass,
  SlidersHorizontal,
  ArrowRight,
  Receipt,
  FileText,
  QrCode
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

  // ElevenLabs Conversational Agent
  const [isTestingElevenAgent, setIsTestingElevenAgent] = useState(false);
  const [elevenAgentTestResult, setElevenAgentTestResult] = useState(null);

  const handleTestElevenAgent = async () => {
    setIsTestingElevenAgent(true);
    setElevenAgentTestResult(null);
    try {
      const res = await fetch('/api/elevenlabs/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: settings.elevenlabsAgentId || 'agent_3701khpbdw76fyqb7pd3gj6a1a8g'
        })
      });
      const data = await res.json();
      setElevenAgentTestResult(data);
    } catch (err) {
      setElevenAgentTestResult({ success: false, error: err.message });
    } finally {
      setIsTestingElevenAgent(false);
    }
  };

  // ARCA (AFIP) Facturación Electrónica
  const [isTestingArca, setIsTestingArca] = useState(false);
  const [arcaTestResult, setArcaTestResult] = useState(null);

  const handleTestArca = async () => {
    setIsTestingArca(true);
    setArcaTestResult(null);
    try {
      const res = await fetch('/api/arca/test', { method: 'POST' });
      const data = await res.json();
      setArcaTestResult(data);
    } catch (err) {
      setArcaTestResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setIsTestingArca(false);
    }
  };

  // Filtros y Condiciones de Aceptación de Pedidos
  const [orderFiltersConfig, setOrderFiltersConfig] = useState({
    enabled: true,
    mode: 'all',
    rules: []
  });
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSavingFilters, setIsSavingFilters] = useState(false);
  const [filterSaveSuccess, setFilterSaveSuccess] = useState(false);
  const [testFilterForm, setTestFilterForm] = useState({
    phone: '+5493516262475',
    address: 'Av. Rafael Núñez 4500, Cerro de las Rosas, Córdoba',
    amount: '25000',
    distance: '6'
  });
  const [testFilterResult, setTestFilterResult] = useState(null);
  const [isEvaluatingFilter, setIsEvaluatingFilter] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState(null);

  const fetchOrderFilters = async () => {
    setIsLoadingFilters(true);
    try {
      const res = await fetch('/api/order-filters');
      if (res.ok) {
        const data = await res.json();
        setOrderFiltersConfig(data);
      }
    } catch (err) {
      console.error('Error cargando filtros de pedidos:', err);
    } finally {
      setIsLoadingFilters(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'orderFilters' || isOpen) {
      fetchOrderFilters();
    }
  }, [activeTab, isOpen]);

  const handleSaveOrderFilters = async () => {
    setIsSavingFilters(true);
    setFilterSaveSuccess(false);
    try {
      const res = await fetch('/api/order-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderFiltersConfig)
      });
      if (res.ok) {
        setFilterSaveSuccess(true);
        setTimeout(() => setFilterSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error guardando filtros de pedidos:', err);
    } finally {
      setIsSavingFilters(false);
    }
  };

  const handleEvaluateFilter = async () => {
    setIsEvaluatingFilter(true);
    setTestFilterResult(null);
    try {
      const res = await fetch('/api/order-filters/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testFilterForm.phone,
          address: testFilterForm.address,
          totalAmount: Number(testFilterForm.amount || 0),
          distanceKm: Number(testFilterForm.distance || 0)
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTestFilterResult(data);
      }
    } catch (err) {
      console.error('Error evaluando filtros:', err);
    } finally {
      setIsEvaluatingFilter(false);
    }
  };

  const handleToggleRule = (ruleId) => {
    setOrderFiltersConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r)
    }));
  };

  const handleUpdateRule = (ruleId, updates) => {
    setOrderFiltersConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => r.id === ruleId ? { ...r, ...updates } : r)
    }));
  };

  const handleAddRule = () => {
    const newRule = {
      id: `rule_custom_${Date.now()}`,
      name: 'Nueva Condición Personalizada',
      type: 'location',
      operator: 'contains',
      value: 'Córdoba',
      isPositive: true,
      action: 'pickup_only',
      customMessage: 'Por favor coordinar retiro por una de nuestras sucursales.',
      enabled: true
    };
    setOrderFiltersConfig(prev => ({
      ...prev,
      rules: [...prev.rules, newRule]
    }));
    setEditingRuleIndex(orderFiltersConfig.rules.length);
  };

  const handleDeleteRule = (ruleId) => {
    setOrderFiltersConfig(prev => ({
      ...prev,
      rules: prev.rules.filter(r => r.id !== ruleId)
    }));
  };

  const tabs = [
    { id: 'ai', label: 'Motor de IA', icon: Bot },
    { id: 'orderFilters', label: 'Filtros de Pedidos', icon: Filter },
    { id: 'mercadopago', label: 'Mercado Pago', icon: CreditCard },
    { id: 'arca', label: 'ARCA / Facturación', icon: Receipt },
    { id: 'voice', label: 'Voz & Síntesis (TTS)', icon: Volume2 },
    { id: 'automation', label: 'Llamadas & Auto-Respuestas', icon: PhoneCall },
    { id: 'prompt', label: 'Prompt & Contexto Regional', icon: Sliders },
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

          {/* TAB: FILTROS Y CONDICIONES DE PEDIDOS */}
          {activeTab === 'orderFilters' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Header Card con Switch Maestro */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      <Filter size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        Filtros y Condiciones de Aceptación de Pedidos
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                          {orderFiltersConfig.rules?.filter(r => r.enabled).length || 0} Reglas Activas
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Reglas combinables positivas (+) y negativas (-) por ubicación, distancia, prefijos de teléfono, montos y horarios.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(orderFiltersConfig.enabled)}
                        onChange={(e) => setOrderFiltersConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-300">
                  <span className="text-[11px] text-slate-400">
                    💡 Si el pedido no cumple las condiciones para delivery a domicilio, Carlos invitará amablemente al cliente a <b>retirar por una de las sucursales</b> o solicitará revisión de un operador humano.
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      type="button"
                      onClick={handleAddRule}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow-sm"
                    >
                      <Plus size={13} />
                      <span>Nueva Regla</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveOrderFilters}
                      disabled={isSavingFilters}
                      className="px-3 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-emerald-400 text-xs font-bold transition flex items-center gap-1"
                    >
                      <Save size={13} />
                      <span>{isSavingFilters ? 'Guardando...' : filterSaveSuccess ? '¡Guardado!' : 'Guardar Reglas'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Reglas Configuradas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <SlidersHorizontal size={14} className="text-emerald-400" />
                    Reglas y Restricciones ({orderFiltersConfig.rules?.length || 0})
                  </span>
                </div>

                {orderFiltersConfig.rules?.map((rule, idx) => {
                  const isExpanded = editingRuleIndex === idx;

                  return (
                    <div
                      key={rule.id || idx}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        rule.enabled
                          ? 'bg-[#182229] border-slate-700/80 hover:border-slate-600'
                          : 'bg-[#111b21]/70 border-slate-800/80 opacity-60'
                      }`}
                    >
                      {/* Fila Principal de la Regla */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                            rule.type === 'location' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                            rule.type === 'distance' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            rule.type === 'phone_prefix' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            rule.type === 'min_amount' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}>
                            {rule.type === 'location' && <MapPin size={15} />}
                            {rule.type === 'distance' && <Compass size={15} />}
                            {rule.type === 'phone_prefix' && <Phone size={15} />}
                            {rule.type === 'min_amount' && <DollarSign size={15} />}
                            {rule.type === 'business_hours' && <Clock size={15} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-xs font-bold text-white truncate">{rule.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                                rule.isPositive
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              }`}>
                                {rule.isPositive ? '+ Positiva (Permite)' : '- Negativa (Restringe)'}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                                rule.action === 'pickup_only'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : rule.action === 'reject'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              }`}>
                                {rule.action === 'pickup_only' ? 'Ofrecer Retiro en Sucursal' :
                                 rule.action === 'reject' ? 'Rechazar Pedido' : 'Revisión Humana'}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400 line-clamp-1">
                              <b className="text-slate-300 font-mono">{rule.operator}</b>: {String(rule.value)}
                            </div>
                          </div>
                        </div>

                        {/* Botones de Acción de Regla */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingRuleIndex(isExpanded ? null : idx)}
                            className="px-2.5 py-1 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[11px] font-bold text-slate-300 transition"
                          >
                            {isExpanded ? 'Ocultar' : 'Editar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleRule(rule.id)}
                            className={`p-1.5 rounded-lg border transition ${
                              rule.enabled
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500 border-slate-700'
                            }`}
                            title={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
                          >
                            <CheckSquare size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                            title="Eliminar regla"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Panel de Edición Desplegable */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-3 text-xs animate-in fade-in">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre / Título de la Condición</label>
                            <input
                              type="text"
                              value={rule.name}
                              onChange={(e) => handleUpdateRule(rule.id, { name: e.target.value })}
                              className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tipo de Parámetro</label>
                              <select
                                value={rule.type}
                                onChange={(e) => handleUpdateRule(rule.id, { type: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-xs"
                              >
                                <option value="phone_prefix">Prefijo Telefónico (Teléfono)</option>
                                <option value="location">Ubicación / Barrio (Dirección)</option>
                                <option value="distance">Distancia Máxima en Km</option>
                                <option value="min_amount">Monto Mínimo de Pedido ($)</option>
                                <option value="business_hours">Horario de Recepción</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Operador Lógico</label>
                              <select
                                value={rule.operator}
                                onChange={(e) => handleUpdateRule(rule.id, { operator: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-xs font-mono"
                              >
                                <option value="contains">Contiene (contains)</option>
                                <option value="not_contains">No contiene (not_contains)</option>
                                <option value="starts_with">Empieza con (starts_with)</option>
                                <option value="less_than_or_equal">Menor o igual que (≤)</option>
                                <option value="greater_than_or_equal">Mayor o igual que (≥)</option>
                                <option value="in_range">En rango (in_range)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Acción al No Cumplir</label>
                              <select
                                value={rule.action}
                                onChange={(e) => handleUpdateRule(rule.id, { action: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-xs"
                              >
                                <option value="pickup_only">Ofrecer Retiro en Sucursal</option>
                                <option value="reject">Rechazar Pedido / Sin Entrega</option>
                                <option value="require_human_review">Derivar a Operador Humano</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                Valor de Referencia (Texto, Números o Lista separada por comas)
                              </label>
                              <input
                                type="text"
                                value={rule.value}
                                onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                                placeholder="Ej: Cerro, Urca, Villa Belgrano o +54, 351 o 12"
                                className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                Comportamiento Condicional
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateRule(rule.id, { isPositive: true })}
                                  className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition ${
                                    rule.isPositive
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                      : 'bg-[#111b21] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  + Positiva (Permite)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateRule(rule.id, { isPositive: false })}
                                  className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition ${
                                    !rule.isPositive
                                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                      : 'bg-[#111b21] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  - Negativa (Bloquea)
                                </button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                              Mensaje Personalizado de Respuesta al Cliente
                            </label>
                            <textarea
                              rows={2}
                              value={rule.customMessage}
                              onChange={(e) => handleUpdateRule(rule.id, { customMessage: e.target.value })}
                              placeholder="Ej: Para tu zona te ofrecemos retiro inmediato en Sucursal Urca..."
                              className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-emerald-500 resize-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 🧪 PROBADOR DE CONDICIONES EN VIVO */}
              <div className="p-4 bg-[#182229] border border-slate-700/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧪</span>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Probador de Condiciones en Vivo
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Prueba cualquier combinación de teléfono, dirección y monto para verificar si el motor aprueba el pedido.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Teléfono WhatsApp</label>
                    <input
                      type="text"
                      value={testFilterForm.phone}
                      onChange={(e) => setTestFilterForm({ ...testFilterForm, phone: e.target.value })}
                      placeholder="+54 9 351 626-2475"
                      className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Dirección / Barrio</label>
                    <input
                      type="text"
                      value={testFilterForm.address}
                      onChange={(e) => setTestFilterForm({ ...testFilterForm, address: e.target.value })}
                      placeholder="Av. Menéndez Pidal 3575, Urca, Córdoba"
                      className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Monto Total ($)</label>
                    <input
                      type="number"
                      value={testFilterForm.amount}
                      onChange={(e) => setTestFilterForm({ ...testFilterForm, amount: e.target.value })}
                      placeholder="39999"
                      className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Distancia Estimada (km)</label>
                    <input
                      type="number"
                      value={testFilterForm.distance}
                      onChange={(e) => setTestFilterForm({ ...testFilterForm, distance: e.target.value })}
                      placeholder="6"
                      className="w-full px-3 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleEvaluateFilter}
                  disabled={isEvaluatingFilter}
                  className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  <Sparkles size={14} className={isEvaluatingFilter ? 'animate-spin' : ''} />
                  <span>{isEvaluatingFilter ? 'Evaluando Reglas...' : 'Evaluar Condiciones del Pedido'}</span>
                </button>

                {/* Resultado de la Prueba */}
                {testFilterResult && (
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-2 animate-in fade-in ${
                    testFilterResult.allowed
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : testFilterResult.action === 'pickup_only'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span className="flex items-center gap-2">
                        {testFilterResult.allowed ? '✅ PEDIDO APROBADO PARA DELIVERY' : `⚠️ CONDICIÓN APLICADA: ${testFilterResult.action?.toUpperCase()}`}
                      </span>
                      <span className="text-[11px] opacity-80 font-mono">
                        {testFilterResult.ruleMatched ? `Regla: ${testFilterResult.ruleMatched}` : 'Todas las reglas cumplidas'}
                      </span>
                    </div>

                    <div className="text-slate-200">
                      <b>Mensaje que responderá Carlos:</b>
                      <div className="mt-1 p-2 bg-[#111b21] rounded-xl border border-slate-800 text-slate-300 italic text-[11px]">
                        "{testFilterResult.message}"
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
                        <span className="font-bold">¡Conexión Exitosa con Mercado Pago!</span> Modo: <b className="uppercase font-mono">{mpTestResult.mode}</b> — Cuenta: <b>{mpTestResult.user?.nickname || 'Vendedor'}</b> (ID: {mpTestResult.user?.id})
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold">Error de Conexión:</span> {mpTestResult.error || 'Revisa las credenciales ingresadas.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ENVIRONMENT MODE SWITCHER (Sandbox vs Production) */}
              <div className="p-4 bg-[#182229] border border-slate-800 rounded-3xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>Ambiente de Operación:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        settings.mercadopagoMode === 'production'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
                      }`}>
                        {settings.mercadopagoMode === 'production' ? '🚀 PRODUCCIÓN (Cobros Reales)' : '🧪 MODO PRUEBAS (Sandbox - Sin Dinero Real)'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Elige si los links de pago generarán transacciones reales o pagos simulados para pruebas
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, mercadopagoMode: 'sandbox' })}
                    className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                      settings.mercadopagoMode !== 'production'
                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-md'
                        : 'bg-[#111b21] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">🧪</span>
                    <div>
                      <div className="text-xs font-bold text-amber-400">Modo Pruebas (Sandbox)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Genera links de prueba (`sandbox_init_point`). Permite probar pagos con tarjetas de test sin debitar dinero.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, mercadopagoMode: 'production' })}
                    className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                      settings.mercadopagoMode === 'production'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-md'
                        : 'bg-[#111b21] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">🚀</span>
                    <div>
                      <div className="text-xs font-bold text-emerald-400">Modo Producción (En Vivo)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Genera links oficiales en vivo (`init_point`) para cobrar dinero real a tus clientes.
                      </div>
                    </div>
                  </button>
                </div>

                {/* Sandbox Test Cards Cheat Sheet */}
                {settings.mercadopagoMode !== 'production' && (
                  <div className="p-3 bg-[#111b21] border border-amber-500/30 rounded-2xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                        💳 Tarjetas Oficiales de Prueba (Sandbox Argentina):
                      </span>
                      <a
                        href="https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#009ee3] hover:underline flex items-center gap-1"
                      >
                        Ver Documentación ↗
                      </a>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-emerald-400 font-bold">Mastercard (Aprobado)</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText('5031755734530451');
                              alert('Número copiado: 5031755734530451');
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold hover:bg-emerald-500/30"
                          >
                            Copiar
                          </button>
                        </div>
                        <div className="text-white font-bold select-all">5031 7557 3453 0451</div>
                        <div className="text-slate-400 text-[10px]">Titular: APRO • Vto: 11/28 • CVV: 123 • DNI: 12345678</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-sky-400 font-bold">Visa (Aprobado)</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText('4024007152000000');
                              alert('Número copiado: 4024007152000000');
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold hover:bg-sky-500/30"
                          >
                            Copiar
                          </button>
                        </div>
                        <div className="text-white font-bold select-all">4024 0071 5200 0000</div>
                        <div className="text-slate-400 text-[10px]">Titular: APRO • Vto: 11/28 • CVV: 123 • DNI: 12345678</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-amber-400 font-bold">Visa (Fondos Insuficientes)</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText('4024007152000000');
                              alert('Número copiado: 4024007152000000');
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold hover:bg-amber-500/30"
                          >
                            Copiar
                          </button>
                        </div>
                        <div className="text-white font-bold select-all">4024 0071 5200 0000</div>
                        <div className="text-slate-400 text-[10px]">Titular: FUND • Vto: 11/28 • CVV: 123 • DNI: 12345678</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-rose-400 font-bold">Visa (Rechazo Seguridad)</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText('4024007152000000');
                              alert('Número copiado: 4024007152000000');
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/30"
                          >
                            Copiar
                          </button>
                        </div>
                        <div className="text-white font-bold select-all">4024 0071 5200 0000</div>
                        <div className="text-slate-400 text-[10px]">Titular: SECU • Vto: 11/28 • CVV: 123 • DNI: 12345678</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

              {/* Credenciales Simultáneas: Producción y Sandbox */}
              <div className="space-y-4 p-4 rounded-2xl bg-[#182229] border border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <CreditCard size={14} className="text-[#009ee3]" />
                    Credenciales Simultáneas de Mercado Pago
                  </h4>
                  <span className="text-[10px] text-slate-400">Guarda ambas credenciales y cambia de modo con un clic</span>
                </div>

                {/* 1. MODO PRODUCCIÓN */}
                <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      🚀 Credenciales de Producción (Cobros Reales)
                    </span>
                    {settings.mercadopagoMode === 'production' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">
                        ACTIVO EN ESTE MOMENTO
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Production Access Token</label>
                      <input
                        type="password"
                        placeholder="APP_USR-..."
                        value={settings.mercadopagoAccessTokenProduction || settings.mercadopagoAccessToken || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            mercadopagoAccessTokenProduction: val,
                            ...(settings.mercadopagoMode === 'production' ? { mercadopagoAccessToken: val } : {})
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Production Public Key</label>
                      <input
                        type="text"
                        placeholder="APP_USR-..."
                        value={settings.mercadopagoPublicKeyProduction || settings.mercadopagoPublicKey || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            mercadopagoPublicKeyProduction: val,
                            ...(settings.mercadopagoMode === 'production' ? { mercadopagoPublicKey: val } : {})
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. MODO SANDBOX */}
                <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      🧪 Credenciales de Sandbox (Modo Pruebas)
                    </span>
                    {settings.mercadopagoMode !== 'production' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40">
                        ACTIVO EN ESTE MOMENTO
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Sandbox Access Token</label>
                      <input
                        type="password"
                        placeholder="TEST-..."
                        value={settings.mercadopagoAccessTokenSandbox || (settings.mercadopagoMode === 'sandbox' ? settings.mercadopagoAccessToken : '') || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            mercadopagoAccessTokenSandbox: val,
                            ...(settings.mercadopagoMode === 'sandbox' ? { mercadopagoAccessToken: val } : {})
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Sandbox Public Key</label>
                      <input
                        type="text"
                        placeholder="TEST-..."
                        value={settings.mercadopagoPublicKeySandbox || (settings.mercadopagoMode === 'sandbox' ? settings.mercadopagoPublicKey : '') || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            mercadopagoPublicKeySandbox: val,
                            ...(settings.mercadopagoMode === 'sandbox' ? { mercadopagoPublicKey: val } : {})
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* IDs adicionales */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">App ID</label>
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

              {/* Webhook & IPN Info Box */}
              <div className="p-4 bg-[#111b21] border border-slate-800 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-[#009ee3]" />
                    Endpoints Oficiales de Webhook e IPN:
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#009ee3] hover:underline"
                    >
                      Docs Webhooks ↗
                    </a>
                    <span className="text-slate-600">•</span>
                    <a
                      href="https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/ipn"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#009ee3] hover:underline"
                    >
                      Docs IPN ↗
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold text-[11px]">Webhook URL:</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/mercadopago/webhook`);
                          alert('¡URL de Webhook copiada!');
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 text-[10px]"
                      >
                        <Copy size={10} /> Copiar
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-[#009ee3] select-all truncate">
                      {window.location.origin}/api/mercadopago/webhook
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#182229] border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold text-[11px]">IPN URL:</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/mercadopago/ipn`);
                          alert('¡URL de IPN copiada!');
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 text-[10px]"
                      >
                        <Copy size={10} /> Copiar
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400 select-all truncate">
                      {window.location.origin}/api/mercadopago/ipn
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Al recibir un pago acreditado desde Mercado Pago (vía Webhook o IPN), WAgent actualizará en tiempo real el pedido a <b>En Preparación</b> y le enviará automáticamente el mensaje de confirmación por WhatsApp al cliente.
                </p>
              </div>

            </div>
          )}

          {/* TAB ARCA / FACTURACIÓN ELECTRÓNICA */}
          {activeTab === 'arca' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Banner Header ARCA */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-[#111b21] border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-md shadow-blue-500/30 shrink-0">
                    <Receipt size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      ARCA (ex AFIP) Facturación Electrónica & Presupuestos
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                        🇦🇷 RG 4291 / 4892
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Emisión de Facturas A, B, C con CAE y QR oficial, o Presupuestos / Comprobantes X no fiscales
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestArca}
                  disabled={isTestingArca}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={13} className={isTestingArca ? 'animate-spin' : ''} />
                  {isTestingArca ? 'Verificando...' : '⚡ Probar Conexión'}
                </button>
              </div>

              {/* Status Test Result Alert */}
              {arcaTestResult && (
                <div className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-1.5 ${
                  arcaTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {arcaTestResult.success ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertCircle size={16} className="text-rose-400" />}
                    {arcaTestResult.message || (arcaTestResult.success ? 'Conexión con ARCA exitosa' : 'Error conectando con ARCA')}
                  </div>
                  {arcaTestResult.success && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 mt-1 pt-2 border-t border-emerald-500/20">
                      <div><b>WSAA:</b> {arcaTestResult.wsaaStatus}</div>
                      <div><b>WSFE:</b> {arcaTestResult.wsfeStatus}</div>
                      <div><b>Entorno:</b> {arcaTestResult.isSandbox ? '🧪 Sandbox / Homologación' : '🚀 Producción'}</div>
                      <div><b>Método:</b> {arcaTestResult.authMethod}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Switch de Entorno: Modo Sandbox vs Producción */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Entorno de Facturación</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    settings?.arcaConfig?.mode === 'production'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {settings?.arcaConfig?.mode === 'production' ? '🚀 PRODUCCIÓN (Facturación Real)' : '🧪 MODO PRUEBAS (Sandbox / Homologación)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      arcaConfig: { ...(prev?.arcaConfig || {}), mode: 'sandbox' }
                    }))}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      (settings?.arcaConfig?.mode || 'sandbox') !== 'production'
                        ? 'border-amber-500 bg-amber-500/10 text-white shadow-sm'
                        : 'border-slate-800 bg-[#111b21] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-300 mb-1">
                      🧪 Modo Pruebas (Sandbox)
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Emite facturas y presupuestos de prueba con CAE simulado y QR verificable sin impacto fiscal.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      arcaConfig: { ...(prev?.arcaConfig || {}), mode: 'production' }
                    }))}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      settings?.arcaConfig?.mode === 'production'
                        ? 'border-blue-500 bg-blue-500/10 text-white shadow-sm'
                        : 'border-slate-800 bg-[#111b21] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-blue-400 mb-1">
                      🚀 Modo Producción (ARCA)
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Conexión directa con servidores de ARCA / AFIP para comprobantes con validez fiscal formal.
                    </p>
                  </button>
                </div>
              </div>

              {/* Parámetros Fiscales del Emisor */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 border-b border-slate-700/60 pb-2">
                  Datos Fiscales de la Carnicería (Emisor)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">CUIT Emisor (11 dígitos):</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.cuit || '30716892348'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), cuit: e.target.value.replace(/\D/g, '') }
                      }))}
                      placeholder="30716892348"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Punto de Venta (Pto Vta):</label>
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={settings?.arcaConfig?.ptoVta || 1}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), ptoVta: parseInt(e.target.value, 10) || 1 }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Razón Social:</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.razonSocial || 'REPÚBLICA DE LA CARNE S.R.L.'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), razonSocial: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre de Fantasía:</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.nombreFantasia || 'República de la Carne'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), nombreFantasia: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Condición frente al IVA:</label>
                    <select
                      value={settings?.arcaConfig?.condicionIva || 'Responsable Inscripto'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), condicionIva: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Responsable Inscripto">Responsable Inscripto</option>
                      <option value="Monotributo">Monotributo</option>
                      <option value="Exento">IVA Exento</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tipo Comprobante por Defecto:</label>
                    <select
                      value={settings?.arcaConfig?.defaultDocumentType || 'factura_b'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), defaultDocumentType: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="factura_b">Factura B (Consumidor Final)</option>
                      <option value="factura_a">Factura A (Responsable Inscripto - IVA 21%)</option>
                      <option value="factura_c">Factura C (Monotributo)</option>
                      <option value="presupuesto">Presupuesto / Comprobante X (No Fiscal)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Domicilio Comercial:</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.domicilioComercial || 'Av. José Roque Funes 1115, Urca, Córdoba'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), domicilioComercial: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Ingresos Brutos (IIBB):</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.iibb || '901-283746-1'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), iibb: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Inicio de Actividades:</label>
                    <input
                      type="text"
                      value={settings?.arcaConfig?.inicioActividades || '01/03/2020'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), inicioActividades: e.target.value }
                      }))}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Opciones y Automatización */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Facturación Automática al Cobrar</div>
                    <div className="text-[11px] text-slate-400">
                      Genera automáticamente el comprobante fiscal o presupuesto al recibir el pago.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settings?.arcaConfig?.autoInvoicePaidOrders)}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        arcaConfig: { ...(prev?.arcaConfig || {}), autoInvoicePaidOrders: e.target.checked }
                      }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
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

              {/* Configuración específica de ElevenLabs & Eleven Agents */}
              {settings.ttsProvider === 'elevenlabs' && (
                <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        <Bot size={14} className="text-purple-400" />
                        Agente Conversacional ElevenLabs (Eleven Agents)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Configura el agente inteligente de voz en tiempo real mediante WebSocket y WebRTC
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.elevenlabsAgentEnabled ?? true}
                        onChange={(e) => setSettings({ ...settings, elevenlabsAgentEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-purple-300 mb-1">ElevenLabs API Key</label>
                    <input
                      type="password"
                      placeholder="sk_..."
                      value={settings.elevenlabsApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, elevenlabsApiKey: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Obtén tu API Key en <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="text-purple-400 underline">elevenlabs.io</a>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">ID del Agente (Agent ID)</label>
                      <input
                        type="text"
                        placeholder="agent_3701khpbdw76fyqb7pd3gj6a1a8g"
                        value={settings.elevenlabsAgentId || 'agent_3701khpbdw76fyqb7pd3gj6a1a8g'}
                        onChange={(e) => setSettings({ ...settings, elevenlabsAgentId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Identificador único del agente en ElevenLabs</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">ID de Voz (Voice ID)</label>
                      <input
                        type="text"
                        placeholder="9rvdnhrYoXoUt4igKpBw"
                        value={settings.elevenlabsVoiceId || '9rvdnhrYoXoUt4igKpBw'}
                        onChange={(e) => setSettings({ ...settings, elevenlabsVoiceId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Voz asignada al carnicero/asesor</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">Modelo de Voz / TTS</label>
                      <select
                        value={settings.elevenlabsModelId || 'eleven_turbo_v2_5'}
                        onChange={(e) => setSettings({ ...settings, elevenlabsModelId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (Recomendado - Baja latencia)</option>
                        <option value="eleven_multilingual_v2">eleven_multilingual_v2 (Alta expresividad)</option>
                        <option value="eleven_flash_v2_5">eleven_flash_v2_5 (Ultra rápido)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-purple-300 mb-1">Nombre del Agente</label>
                      <input
                        type="text"
                        placeholder="República de la Carne"
                        value={settings.elevenlabsAgentName || 'República de la Carne'}
                        onChange={(e) => setSettings({ ...settings, elevenlabsAgentName: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-purple-300 mb-1">Mensaje Inicial (First Message)</label>
                    <input
                      type="text"
                      placeholder="¡Hola! Gracias por comunicarte con nosotros, ¿en qué puedo ayudarte hoy?"
                      value={settings.elevenlabsFirstMessage || '¡Hola! Gracias por comunicarte con nosotros, ¿en qué puedo ayudarte hoy?'}
                      onChange={(e) => setSettings({ ...settings, elevenlabsFirstMessage: e.target.value })}
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Probar Conexión con ElevenLabs Agent */}
                  <div className="pt-2 border-t border-purple-500/20 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleTestElevenAgent}
                      disabled={isTestingElevenAgent}
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all"
                    >
                      {isTestingElevenAgent ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {isTestingElevenAgent ? 'Verificando Agente en ElevenLabs...' : 'Probar Conexión con Agente de ElevenLabs'}
                    </button>

                    {elevenAgentTestResult && (
                      <div className={`p-3 rounded-xl text-xs border ${
                        elevenAgentTestResult.success 
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' 
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      }`}>
                        {elevenAgentTestResult.success ? (
                          <div className="space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <CheckCircle2 size={14} /> ¡Agente de ElevenLabs Conectado Exitosamente!
                            </div>
                            <div className="text-[11px] opacity-90">
                              • <b>ID:</b> <span className="font-mono">{elevenAgentTestResult.agentId}</span><br />
                              • <b>Voz:</b> <span className="font-mono">{elevenAgentTestResult.voiceId}</span> ({elevenAgentTestResult.modelId})<br />
                              • <b>WebSocket:</b> <span className="font-mono text-[10px]">{elevenAgentTestResult.isSigned ? 'Signed URL Segura' : 'Conexión Directa'}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <b>Error conectando con ElevenLabs:</b> {elevenAgentTestResult.error}
                          </div>
                        )}
                      </div>
                    )}
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

              {/* AUTO-ATENCIÓN DE LLAMADAS ENTRANTES */}
              <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <PhoneCall size={14} className="text-emerald-400" />
                      Auto-Atender Llamadas Entrantes de WhatsApp
                    </div>
                    <div className="text-[11px] text-slate-400">Cuando ingresa una llamada de voz, el sistema la gestiona automáticamente con el método elegido.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoAnswerCalls !== false && (settings.autoAnswerCalls || settings.autoCallFollowUp)}
                    onChange={(e) => setSettings({ ...settings, autoAnswerCalls: e.target.checked, autoCallFollowUp: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>

                {(settings.autoAnswerCalls !== false && (settings.autoAnswerCalls || settings.autoCallFollowUp)) && (
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Método de Respuesta Automática por Defecto</label>
                      <select
                        value={settings.autoAnswerCallMethod || 'elevenlabs'}
                        onChange={(e) => setSettings({ ...settings, autoAnswerCallMethod: e.target.value })}
                        className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="elevenlabs">🎙️ Agente Conversacional de Voz ElevenLabs (Ultra-Realista)</option>
                        <option value="ai_voice_note">🗣️ Nota de Voz Personalizada con IA (TTS Neural)</option>
                        <option value="ai_text_note">💬 Mensaje de Texto Inmediato por WhatsApp</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Mensaje de Voz Personalizado (para Nota de Voz / ElevenLabs)</label>
                      <textarea
                        rows="2"
                        value={settings.callFollowUpMessage || ''}
                        onChange={(e) => setSettings({ ...settings, callFollowUpMessage: e.target.value })}
                        placeholder="¡Hola! Gracias por comunicarte con República de la Carne..."
                        className="w-full px-3 py-1.5 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM PROMPT & CONTEXTO REGIONAL */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              
              {/* Header & Preset Reset */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Contexto Regional, País & Reglas de Negocio</h4>
                      <p className="text-[11px] text-slate-400">Personaliza la personalidad, modismos locales, moneda y país del agente</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSettings({
                        ...settings,
                        agentName: 'Carlos',
                        agentRole: 'Maestro Carnicero de República de la Carne',
                        businessName: 'República de la Carne',
                        country: 'Argentina',
                        region: 'Córdoba Capital y Alrededores',
                        currency: 'ARS ($)',
                        slang: 'Cordobés / Argentino amigable y experto (¡De diez!, ¡De una!, asado, achuras, cortes del día)',
                        businessRules: 'Envíos en el día dentro de Córdoba, 6 sucursales de retiro, novillito pesado y cerdo seleccionado, pagos en efectivo, transferencia (republica.carne.mp) o Mercado Pago.',
                        systemPrompt: `Eres Carlos, maestro carnicero y asesor comercial experto de "República de la Carne" en Córdoba, Argentina.
Tu objetivo es asesorar a los clientes con calidez, recomendar los mejores cortes de novillito pesado y cerdo, y guiarlos fluidamente en el proceso de compra por WhatsApp.

Contexto y Reglas de Negocio:
1. País y Moneda: Argentina (Córdoba). Todos los precios son en Pesos Argentinos ($ ARS).
2. Tono y Modismos: Amigable, cordial, experto carnicero cordobés ("¡De diez!", "¡De una!", "mostrador", "asadito", "parrilla", "ternura").
3. Asesoramiento de Asado: Calcula 500g a 600g por persona (combinando cortes y achuras).
4. Opciones de Entrega: Envío a Domicilio en el día o Retiro por cualquiera de nuestras 6 sucursales en Córdoba.
5. Medios de Pago: Efectivo, Transferencia Bancaria (Alias: republica.carne.mp) o Mercado Pago (Link de pago).
6. Desambiguación: Si el cliente pide un corte genérico con múltiples variedades (ej: cuadril, matambre, chorizos), ofrece amablemente las opciones numeradas con precios para que elija.
7. Formato: Respuestas claras, con viñetas elegantes, listas numeradas (1️⃣, 2️⃣, 3️⃣) y precios exactos en negrita.`
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 transition active:scale-95"
                    title="Restaurar valores predeterminados optimizados"
                  >
                    <RotateCcw size={12} className="text-emerald-400" />
                    <span>Restaurar Predeterminado</span>
                  </button>
                </div>

                {/* Campos de Configuración Regional */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Globe size={13} className="text-emerald-400" />
                      País & Ubicación
                    </label>
                    <input
                      type="text"
                      value={settings.country || 'Argentina'}
                      onChange={(e) => setSettings({ ...settings, country: e.target.value })}
                      placeholder="ej: Argentina"
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <MapPin size={13} className="text-rose-400" />
                      Región / Ciudad de Operación
                    </label>
                    <input
                      type="text"
                      value={settings.region || 'Córdoba Capital y Alrededores'}
                      onChange={(e) => setSettings({ ...settings, region: e.target.value })}
                      placeholder="ej: Córdoba Capital"
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <DollarSign size={13} className="text-amber-400" />
                      Moneda & Símbolo
                    </label>
                    <input
                      type="text"
                      value={settings.currency || 'ARS ($)'}
                      onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      placeholder="ej: ARS ($) / Pesos Argentinos"
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <User size={13} className="text-sky-400" />
                      Nombre del Asesor / Agente
                    </label>
                    <input
                      type="text"
                      value={settings.agentName || 'Carlos'}
                      onChange={(e) => setSettings({ ...settings, agentName: e.target.value })}
                      placeholder="ej: Carlos"
                      className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Store size={13} className="text-purple-400" />
                    Rol del Agente & Negocio
                  </label>
                  <input
                    type="text"
                    value={settings.agentRole || 'Maestro Carnicero de República de la Carne'}
                    onChange={(e) => setSettings({ ...settings, agentRole: e.target.value })}
                    placeholder="ej: Maestro Carnicero de República de la Carne"
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    🗣️ Tono, Modismos Locales & Personalidad
                  </label>
                  <input
                    type="text"
                    value={settings.slang || 'Cordobés / Argentino amigable y experto (¡De diez!, ¡De una!, asado, achuras, cortes del día)'}
                    onChange={(e) => setSettings({ ...settings, slang: e.target.value })}
                    placeholder="ej: Cordobés amigable y experto..."
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    📦 Reglas de Negocio, Envíos y Métodos de Pago
                  </label>
                  <input
                    type="text"
                    value={settings.businessRules || 'Envíos en el día dentro de Córdoba, 6 sucursales de retiro, novillito pesado y cerdo seleccionado, pagos en efectivo, transferencia (republica.carne.mp) o Mercado Pago.'}
                    onChange={(e) => setSettings({ ...settings, businessRules: e.target.value })}
                    placeholder="ej: Envíos en moto en el día, 6 sucursales, transferencias y MP..."
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* System Prompt Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Instrucciones del Sistema (System Prompt Avanzado)</span>
                  <span className="text-[11px] text-emerald-400 font-mono">Inyectado en tiempo real</span>
                </label>
                <textarea
                  rows="8"
                  value={settings.systemPrompt || ''}
                  onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-emerald-500"
                  placeholder="Escribe aquí las directivas, restricciones y reglas de atención..."
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  El agente respeta estas directivas junto al contexto del país, moneda y catálogo en cada respuesta.
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
