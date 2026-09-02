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
  QrCode,
  Bike,
  Palette,
  Layout,
  Type,
  Image as ImageIcon,
  Zap,
  Cpu,
  BarChart3,
  Terminal,
  Activity,
  Gauge
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';
import { 
  SYSTEM_AI_PROVIDERS, 
  SYSTEM_AI_MODELS, 
  getDefaultModelForProvider 
} from '../utils/aiModels.js';

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [settings, setSettings] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test AI Connection
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

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

  // Token Tracker & Usage State
  const [tokenStats, setTokenStats] = useState(null);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isResettingTokens, setIsResettingTokens] = useState(false);

  // Embedded Qwen 2.5 0.5B Model State
  const [embeddedModelInfo, setEmbeddedModelInfo] = useState(null);
  const [isDownloadingEmbedded, setIsDownloadingEmbedded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isUnloadingLlama, setIsUnloadingLlama] = useState(false);
  const [isBenchmarkingLlama, setIsBenchmarkingLlama] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [benchmarkPrompt, setBenchmarkPrompt] = useState('Recomiéndame 3 cortes especiales para un asado de domingo en Córdoba con amigos.');
  const [llamaActionMessage, setLlamaActionMessage] = useState(null);

  const fetchTokenStats = async () => {
    setIsLoadingTokens(true);
    try {
      const res = await fetch('/api/ai/token-usage');
      const data = await res.json();
      if (data.success && data.stats) {
        setTokenStats(data.stats);
      }
    } catch (err) {
      console.error('Error cargando métricas de tokens:', err);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const handleResetTokenStats = async () => {
    if (!window.confirm('¿Deseas reiniciar todos los contadores de consumo de tokens acumulados?')) return;
    setIsResettingTokens(true);
    try {
      const res = await fetch('/api/ai/token-usage/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTokenStats(data.stats);
      }
    } catch (err) {
      console.error('Error reiniciando métricas de tokens:', err);
    } finally {
      setIsResettingTokens(false);
    }
  };

  const fetchEmbeddedModelStatus = async () => {
    try {
      const res = await fetch('/api/ai/embedded/status');
      const data = await res.json();
      if (data.success && data.modelInfo) {
        setEmbeddedModelInfo(data.modelInfo);
      }
    } catch (err) {
      console.error('Error cargando estado del modelo embebido:', err);
    }
  };

  const handleDownloadEmbeddedModel = async () => {
    setIsDownloadingEmbedded(true);
    try {
      const res = await fetch('/api/ai/embedded/download', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const interval = setInterval(async () => {
          const statusRes = await fetch('/api/ai/embedded/status');
          const statusData = await statusRes.json();
          if (statusData?.modelInfo) {
            setEmbeddedModelInfo(statusData.modelInfo);
            setDownloadProgress(statusData.modelInfo.downloadState?.progressPercent || 0);
            if (statusData.modelInfo.available || !statusData.modelInfo.downloadState?.isDownloading) {
              clearInterval(interval);
              setIsDownloadingEmbedded(false);
            }
          }
        }, 1500);
      }
    } catch (err) {
      console.error('Error iniciando descarga del modelo embebido:', err);
      setIsDownloadingEmbedded(false);
    }
  };

  const handleUnloadLlama = async () => {
    setIsUnloadingLlama(true);
    setLlamaActionMessage(null);
    try {
      const res = await fetch('/api/ai/embedded/unload', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLlamaActionMessage({ type: 'success', text: '🧹 Memoria RAM del modelo liberada con éxito.' });
        fetchEmbeddedModelStatus();
      } else {
        setLlamaActionMessage({ type: 'error', text: data.error || 'No se pudo liberar la memoria.' });
      }
    } catch (err) {
      setLlamaActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsUnloadingLlama(false);
    }
  };

  const handleRunLlamaBenchmark = async () => {
    setIsBenchmarkingLlama(true);
    setBenchmarkResult(null);
    setLlamaActionMessage(null);
    try {
      const res = await fetch('/api/ai/embedded/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: benchmarkPrompt })
      });
      const data = await res.json();
      setBenchmarkResult(data);
      fetchEmbeddedModelStatus();
    } catch (err) {
      setBenchmarkResult({ success: false, error: err.message });
    } finally {
      setIsBenchmarkingLlama(false);
    }
  };

  const handleSetLlamaAsDefault = async () => {
    try {
      const res = await fetch('/api/ai/embedded/set-default', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSettings(prev => ({ ...prev, aiProvider: 'qwen_embedded', aiModel: 'qwen2.5-0.5b-instruct' }));
        setLlamaActionMessage({ type: 'success', text: '✅ Qwen 2.5 0.5B configurado como Motor Predeterminado del Sistema.' });
        fetchEmbeddedModelStatus();
      }
    } catch (err) {
      setLlamaActionMessage({ type: 'error', text: err.message });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setSettings(data.settings);
          setAvailableVoices(data.availableVoices || []);
        })
        .catch(err => console.error('Error cargando configuración:', err));

      if (activeTab === 'tokens') fetchTokenStats();
      if (activeTab === 'ai' || activeTab === 'llamacpp') fetchEmbeddedModelStatus();
    }
  }, [isOpen, activeTab]);

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

  const handleTestAiConnection = async () => {
    if (!settings) return;
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      let apiKey = '';
      if (settings.aiProvider === 'gemini') apiKey = settings.geminiApiKey;
      else if (settings.aiProvider === 'anthropic') apiKey = settings.anthropicApiKey;
      else if (settings.aiProvider === 'openai') apiKey = settings.openaiApiKey;
      else if (settings.aiProvider === 'nvidia') apiKey = settings.nvidiaApiKey;
      else if (settings.aiProvider === 'deepseek') apiKey = settings.deepseekApiKey;
      else if (settings.aiProvider === 'groq') apiKey = settings.groqApiKey;
      else if (settings.aiProvider === 'openrouter') apiKey = settings.openrouterApiKey;
      else if (settings.aiProvider === 'cohere') apiKey = settings.cohereApiKey;
      else if (settings.aiProvider === 'custom') apiKey = settings.customApiKey;

      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.aiProvider || 'gemini',
          model: settings.aiModel || getDefaultModelForProvider(settings.aiProvider || 'gemini'),
          apiKey: apiKey || '',
          customEndpoint: settings.customBaseUrl || settings.customEndpoint || '',
          temperature: 0.7
        })
      });
      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        data = {
          success: false,
          error: `Error en servidor (${res.status} ${res.statusText || 'Gateway Timeout'}). El servidor tardó en responder.`,
          isFallback: false
        };
      }
      setAiTestResult(data);
    } catch (err) {
      setAiTestResult({
        success: false,
        error: err.message || 'Error de red al intentar probar la conexión',
        isFallback: false
      });
    } finally {
      setIsTestingAi(false);
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
      const list = Array.isArray(data) ? data : (Array.isArray(data?.backups) ? data.backups : (Array.isArray(data?.data) ? data.data : []));
      setBackupsList(list);
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

  // ARCA (AFIP) Facturación Electrónica & Multi-Razón Social
  const [isTestingArca, setIsTestingArca] = useState(false);
  const [arcaTestResult, setArcaTestResult] = useState(null);
  const [fiscalProfiles, setFiscalProfiles] = useState([]);
  const [editingProfile, setEditingProfile] = useState(null);
  const [allBranches, setAllBranches] = useState([]);

  const fetchFiscalProfiles = async () => {
    try {
      const [fpRes, brRes] = await Promise.all([
        fetch('/api/fiscal-profiles').then(r => r.json()).catch(() => []),
        fetch('/api/branches').then(r => r.json()).catch(() => [])
      ]);
      if (Array.isArray(fpRes)) setFiscalProfiles(fpRes);
      if (Array.isArray(brRes)) setAllBranches(brRes);
    } catch (e) {
      console.error('Error fetching fiscal profiles:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'arca' || isOpen) {
      fetchFiscalProfiles();
    }
  }, [activeTab, isOpen]);

  const handleTestArca = async (profileId = null) => {
    setIsTestingArca(true);
    setArcaTestResult(null);
    try {
      const url = profileId ? `/api/fiscal-profiles/${profileId}/test` : '/api/arca/test';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      setArcaTestResult(data);
    } catch (err) {
      setArcaTestResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setIsTestingArca(false);
    }
  };

  const handleSaveFiscalProfile = async (profileData) => {
    try {
      const isEdit = profileData.id && fiscalProfiles.some(p => p.id === profileData.id);
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/fiscal-profiles/${profileData.id}` : '/api/fiscal-profiles';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        await fetchFiscalProfiles();
        setEditingProfile(null);
      }
    } catch (e) {
      console.error('Error guardando perfil fiscal:', e);
    }
  };

  const handleDeleteFiscalProfile = async (profileId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta Razón Social / Perfil Fiscal?')) return;
    try {
      const res = await fetch(`/api/fiscal-profiles/${profileId}`, { method: 'DELETE' });
      if (res.ok) {
        setFiscalProfiles(prev => prev.filter(p => p.id !== profileId));
      }
    } catch (e) {
      console.error('Error eliminando perfil fiscal:', e);
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
    { id: 'llamacpp', label: '🦙 Motor Local Llama-CPP', icon: Cpu },
    { id: 'tokens', label: '📊 Consumo & Tokens IA', icon: Zap },
    { id: 'store', label: '🎨 Tienda Online (Apple UI)', icon: Store },
    { id: 'logistics', label: 'Logística & Franjas', icon: Bike },
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
                <div className="space-y-5 animate-in fade-in">
                  {/* Header & Overview */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-purple-400" />
                        Catálogo de Proveedores de Inteligencia Artificial
                      </h3>
                      <p className="text-xs text-slate-400">
                        Selecciona el motor neuronal predeterminado para el sistema y asignaciones globales.
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 self-start sm:self-auto">
                      {SYSTEM_AI_PROVIDERS.length} Proveedores Canónicos
                    </span>
                  </div>

                  {/* Grid de Proveedores Oficiales */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">Selecciona el Proveedor de IA</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                      {SYSTEM_AI_PROVIDERS.map((prov) => {
                        const isSelected = (settings.aiProvider || 'gemini') === prov.id;
                        return (
                          <button
                            type="button"
                            key={prov.id}
                            onClick={() => {
                              const defModel = getDefaultModelForProvider(prov.id);
                              setAiTestResult(null);
                              setSettings({
                                ...settings,
                                aiProvider: prov.id,
                                aiModel: defModel
                              });
                            }}
                            className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'bg-purple-950/60 border-purple-500 text-white shadow-lg shadow-purple-500/10 ring-1 ring-purple-400'
                                : 'bg-[#182229] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-lg">{prov.icon}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                prov.badge.includes('Gratis') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {prov.badge}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-200">{prov.name}</div>
                              <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{prov.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configuración Detallada del Proveedor Seleccionado */}
                  {(() => {
                    const currentProv = SYSTEM_AI_PROVIDERS.find(p => p.id === (settings.aiProvider || 'gemini')) || SYSTEM_AI_PROVIDERS[0];
                    const provModels = SYSTEM_AI_MODELS[currentProv.id] || [];

                    return (
                      <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{currentProv.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-2">
                                <span>{currentProv.name}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                                  {currentProv.badge}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">{currentProv.desc}</div>
                            </div>
                          </div>
                          {currentProv.keyHelpUrl && (
                            <a
                              href={currentProv.keyHelpUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold underline shrink-0"
                            >
                              <span>Obtener API Key</span>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>

                        {/* API Key Input (si requiere clave) */}
                        {currentProv.requiresKey && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              API Key de {currentProv.name}
                            </label>
                            <input
                              type="password"
                              placeholder={currentProv.keyPlaceholder}
                              value={settings[currentProv.keyField] || ''}
                              onChange={(e) => {
                                setAiTestResult(null);
                                setSettings({ ...settings, [currentProv.keyField]: e.target.value });
                              }}
                              className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        )}

                        {/* Endpoint Base URL para Local / Custom */}
                        {(currentProv.id === 'local' || currentProv.id === 'custom') && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Base URL del Endpoint OpenAI-Compatible
                            </label>
                            <input
                              type="text"
                              placeholder={currentProv.id === 'local' ? 'http://localhost:11434/v1' : 'https://api.servidor.com/v1'}
                              value={settings.customBaseUrl || settings.customEndpoint || ''}
                              onChange={(e) => {
                                setAiTestResult(null);
                                setSettings({ ...settings, customBaseUrl: e.target.value, customEndpoint: e.target.value });
                              }}
                              className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              Compatible con Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`), LocalAI o vLLM.
                            </span>
                          </div>
                        )}

                        {/* Selector de Modelo Canónico y Nombre de Modelo */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Modelo Canónico Predefinido
                            </label>
                            <select
                              value={settings.aiModel || getDefaultModelForProvider(currentProv.id)}
                              onChange={(e) => {
                                setAiTestResult(null);
                                setSettings({ ...settings, aiModel: e.target.value });
                              }}
                              className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                            >
                              {provModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.isFree ? '(🎁 100% Gratis)' : `(${m.tag})`}
                                </option>
                              ))}
                              <option value="custom">✏️ Otro / Modelo Personalizado...</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Identificador Técnico del Modelo (String ID)
                            </label>
                            <input
                              type="text"
                              placeholder="ej: gemini-2.5-flash, gpt-4o, claude-3-7-sonnet"
                              value={settings.aiModel || ''}
                              onChange={(e) => {
                                setAiTestResult(null);
                                setSettings({ ...settings, aiModel: e.target.value });
                              }}
                              className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>

                        {/* Panel Especial de Qwen 2.5 0.5B Embebido con node-llama-cpp */}
                        {currentProv.id === 'qwen_embedded' && (
                          <div className="p-4 rounded-xl bg-[#111b21] border border-emerald-500/40 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-xs font-bold text-white">Qwen 2.5 0.5B Instruct (Q4_K_M) — Modelo C++ Nativo</span>
                              </div>
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto ${
                                embeddedModelInfo?.available
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}>
                                {embeddedModelInfo?.available ? '✅ Descargado y Listo (~380 MB)' : '⚠️ Requiere Descarga (.gguf ~380 MB)'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300">
                              Este modelo corre directamente dentro del proceso de Node.js mediante <strong>node-llama-cpp</strong> sin depender de Ollama ni servicios externos, restringido a <strong>512 tokens de contexto</strong> y <strong>2 hilos CPU</strong> para garantizar un consumo ultra bajo de RAM (~350 MB a 400 MB).
                            </p>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-[#182229] p-2.5 rounded-lg border border-slate-800 text-slate-300">
                              <div><span className="text-slate-400">RAM:</span> ~350-400 MB</div>
                              <div><span className="text-slate-400">Contexto:</span> 512 tokens</div>
                              <div><span className="text-slate-400">Hilos CPU:</span> 2</div>
                              <div><span className="text-slate-400">Modo:</span> 100% Offline</div>
                            </div>

                            {!embeddedModelInfo?.available ? (
                              <div className="space-y-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleDownloadEmbeddedModel}
                                  disabled={isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading}
                                  className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition disabled:opacity-50"
                                >
                                  {isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading ? (
                                    <>
                                      <RefreshCw size={14} className="animate-spin" />
                                      <span>Descargando Qwen 2.5 0.5B ({downloadProgress || embeddedModelInfo?.downloadState?.progressPercent || 0}%)...</span>
                                    </>
                                  ) : (
                                    <>
                                      <HardDriveDownload size={14} />
                                      <span>Descargar Modelo Automáticamente desde Hugging Face (~380 MB)</span>
                                    </>
                                  )}
                                </button>
                                {(isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading) && (
                                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                      className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                                      style={{ width: `${downloadProgress || embeddedModelInfo?.downloadState?.progressPercent || 0}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-semibold">
                                <CheckCircle2 size={14} />
                                <span>Archivo .gguf verificado en <code>data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf</code> ({embeddedModelInfo?.sizeMB || 380} MB).</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* DIAGNÓSTICO EN VIVO & TEST DE CONEXIÓN REAL */}
                        <div className="pt-3 border-t border-slate-800 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                              <Zap size={14} className="text-amber-400" />
                              Diagnóstico de Conexión en Vivo
                            </span>
                            <button
                              type="button"
                              onClick={handleTestAiConnection}
                              disabled={isTestingAi}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-purple-600/20"
                            >
                              {isTestingAi ? (
                                <>
                                  <RefreshCw size={13} className="animate-spin" />
                                  <span>Verificando API Real...</span>
                                </>
                              ) : (
                                <>
                                  <Play size={13} />
                                  <span>Probar Conexión y Diagnóstico ⚡</span>
                                </>
                              )}
                            </button>
                          </div>

                          {aiTestResult && (
                            <div className={`p-3 rounded-xl border text-xs animate-in fade-in ${
                              aiTestResult.success
                                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                                : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                            }`}>
                              <div className="flex items-center justify-between font-bold mb-1">
                                <span className="flex items-center gap-1.5">
                                  {aiTestResult.success ? (
                                    <>
                                      <CheckCircle2 size={15} className="text-emerald-400" />
                                      <span>Conexión Exitosa con el Modelo ({aiTestResult.provider})</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle size={15} className="text-rose-400" />
                                      <span>Error al Conectar con la API del Modelo</span>
                                    </>
                                  )}
                                </span>
                                <span className="font-mono text-[11px] opacity-80">{aiTestResult.latencyMs} ms</span>
                              </div>
                              <div className="text-[11px] font-mono whitespace-pre-wrap mt-1">
                                {aiTestResult.success ? aiTestResult.response : aiTestResult.error}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB: MOTOR LOCAL LLAMA-CPP (QWEN 2.5 0.5B EMBEDDED) */}
              {activeTab === 'llamacpp' && (
                <div className="space-y-5 animate-in fade-in">
                  {/* Header & Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900 to-teal-950/40 border border-emerald-500/30 shadow-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                        <Cpu size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                            Motor Local Embebido Llama-CPP
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            Qwen 2.5 0.5B
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Inferencia 100% offline dentro de Node.js con node-llama-cpp (C++ nativo, ~350 MB RAM).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={fetchEmbeddedModelStatus}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-slate-700"
                      >
                        <RefreshCw size={13} />
                        <span>Actualizar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUnloadLlama}
                        disabled={isUnloadingLlama || !embeddedModelInfo?.isLoadedInMemory}
                        title="Libera el contexto y el modelo de la memoria RAM de Node.js"
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-amber-500/30 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                        <span>{isUnloadingLlama ? 'Liberando...' : 'Liberar RAM'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Feedback Action Alert */}
                  {llamaActionMessage && (
                    <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in ${
                      llamaActionMessage.type === 'success' 
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {llamaActionMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                        <span>{llamaActionMessage.text}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setLlamaActionMessage(null)}
                        className="opacity-70 hover:opacity-100 p-0.5"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {/* 4 Primary Status Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 1. Estado en RAM */}
                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-700/60 flex flex-col justify-between">
                      <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>Estado en Memoria</span>
                        <Activity size={13} className="text-emerald-400" />
                      </div>
                      <div className="flex items-center gap-2 my-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          embeddedModelInfo?.isLoadedInMemory ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`} />
                        <span className="text-xs font-bold text-white">
                          {embeddedModelInfo?.isLoadedInMemory ? '🟢 Activo en RAM' : '💤 En Reposo (Inactivo)'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {embeddedModelInfo?.isLoadedInMemory ? 'Listo para respuesta inmediata' : 'Se carga bajo demanda en primera consulta'}
                      </div>
                    </div>

                    {/* 2. Archivo .GGUF */}
                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-700/60 flex flex-col justify-between">
                      <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>Archivo .GGUF</span>
                        <HardDriveDownload size={13} className="text-sky-400" />
                      </div>
                      <div className="text-xs font-bold text-white my-1">
                        {embeddedModelInfo?.available ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={13} /> {embeddedModelInfo?.sizeMB || 380} MB en Disco
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertCircle size={13} /> No Descargado
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        <code>qwen2.5-0.5b-instruct-q4_k_m</code>
                      </div>
                    </div>

                    {/* 3. Motor C++ Nativo */}
                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-700/60 flex flex-col justify-between">
                      <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>Compilación C++</span>
                        <Terminal size={13} className={embeddedModelInfo?.isSupported ? 'text-purple-400' : 'text-amber-400'} />
                      </div>
                      <div className="text-xs font-bold text-white my-1 flex items-center gap-1.5">
                        {embeddedModelInfo?.isSupported ? (
                          <span className="text-purple-300 flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-emerald-400" /> node-llama-cpp v3
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertCircle size={13} /> No disponible en host
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {embeddedModelInfo?.isSupported ? 'Zero-GPU • 1 Hilo CPU • 256 ctx' : 'Hostinger sin make/g++ (Usa Cloud)'}
                      </div>
                    </div>

                    {/* 4. Asignación en Sistema */}
                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-slate-700/60 flex flex-col justify-between">
                      <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>Asignación Global</span>
                        <Sliders size={13} className="text-amber-400" />
                      </div>
                      <div className="text-xs font-bold text-white my-1">
                        {settings?.aiProvider === 'qwen_embedded' ? (
                          <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                            🌟 Motor Predeterminado
                          </span>
                        ) : (
                          <span className="text-slate-300">
                            Opcional / Por Agente
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {embeddedModelInfo?.systemUsage?.agentsCount || 0} agentes vinculados
                      </div>
                    </div>
                  </div>

                  {/* Panel de Descarga si no está descargado */}
                  {!embeddedModelInfo?.available && (
                    <div className="p-4 rounded-2xl bg-[#182229] border border-amber-500/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={18} className="text-amber-400" />
                          <h4 className="text-xs font-bold text-white">Descarga Requerida del Modelo Qwen 2.5 0.5B</h4>
                        </div>
                        <span className="text-xs text-amber-300 font-mono font-bold">~380 MB</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Para ejecutar inferencias locales offline sin depender de internet ni APIs de terceros, descarga el archivo cuantizado <code>qwen2.5-0.5b-instruct-q4_k_m.gguf</code> directamente a <code>data/models/</code>.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownloadEmbeddedModel}
                        disabled={isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50"
                      >
                        {isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Descargando desde Hugging Face ({downloadProgress || embeddedModelInfo?.downloadState?.progressPercent || 0}%)...</span>
                          </>
                        ) : (
                          <>
                            <HardDriveDownload size={14} />
                            <span>Descargar Modelo Automáticamente desde Hugging Face (~380 MB)</span>
                          </>
                        )}
                      </button>
                      {(isDownloadingEmbedded || embeddedModelInfo?.downloadState?.isDownloading) && (
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                            style={{ width: `${downloadProgress || embeddedModelInfo?.downloadState?.progressPercent || 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Panel de Rendimiento & Hardware de Node.js */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Gauge size={14} className="text-sky-400" />
                      Parámetros de Memoria & Hardware en Tiempo Real (Perfil Anti-Crash 1 GB RAM)
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Context Size</span>
                        <span className="text-white font-bold">{embeddedModelInfo?.maxContext || 256} tokens</span>
                        <span className="text-[9px] text-slate-500 block">Límite estricto RAM</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Hilos CPU</span>
                        <span className="text-white font-bold">{embeddedModelInfo?.threads || 1} hilo</span>
                        <span className="text-[9px] text-slate-500 block">Estabilidad mono-core</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Aceleración GPU</span>
                        <span className="text-emerald-400 font-bold">Desactivada (0 layers)</span>
                        <span className="text-[9px] text-slate-500 block">CPU Pura</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Memoria Libre SO</span>
                        <span className="text-sky-400 font-bold">{embeddedModelInfo?.memory?.systemFreeRAM_MB || 0} MB</span>
                        <span className="text-[9px] text-slate-500 block">De {embeddedModelInfo?.memory?.systemTotalRAM_MB || 0} MB Total</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Consumo Proceso Node.js:</span>
                        <span className="text-white">RSS: <strong>{embeddedModelInfo?.memory?.processRssMB || 0} MB</strong></span>
                        <span className="text-slate-500">|</span>
                        <span className="text-white">Heap: <strong>{embeddedModelInfo?.memory?.processHeapUsedMB || 0} MB</strong></span>
                      </div>
                      <span className="text-emerald-400 font-semibold text-[10px]">
                        Perfil ultra-ligero para VPS Hostinger
                      </span>
                    </div>
                  </div>

                  {/* Panel de Métricas de Uso Acumuladas */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <BarChart3 size={14} className="text-purple-400" />
                      Métricas Acumuladas de Uso Local Llama-CPP
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                      <div className="p-3 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Peticiones Totales</span>
                        <span className="text-lg font-bold text-white">{embeddedModelInfo?.stats?.totalInferences || 0}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Tokens Procesados</span>
                        <span className="text-lg font-bold text-emerald-400">
                          {(embeddedModelInfo?.stats?.totalTokens || 0).toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Latencia Promedio</span>
                        <span className="text-lg font-bold text-amber-400">
                          {embeddedModelInfo?.stats?.avgLatencyMs || 0} ms
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-[#111b21] border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Velocidad Última</span>
                        <span className="text-lg font-bold text-purple-400">
                          {embeddedModelInfo?.stats?.lastTokensPerSecond || 0} tok/s
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Consola de Benchmark & Diagnóstico en Vivo */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <Zap size={14} className="text-amber-400" />
                        Consola de Benchmark & Diagnóstico de Inferencia Local
                      </h4>
                      <button
                        type="button"
                        onClick={handleSetLlamaAsDefault}
                        disabled={settings?.aiProvider === 'qwen_embedded'}
                        className="px-3 py-1 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 text-xs font-bold transition disabled:opacity-40"
                      >
                        {settings?.aiProvider === 'qwen_embedded' ? '✅ Ya es Predeterminado' : '🚀 Establecer como Motor Principal'}
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        Prompt de prueba para medir latencia y velocidad (tokens/segundo):
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={benchmarkPrompt}
                          onChange={(e) => setBenchmarkPrompt(e.target.value)}
                          placeholder="Escribe un prompt de prueba..."
                          className="flex-1 px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          onClick={handleRunLlamaBenchmark}
                          disabled={isBenchmarkingLlama || !embeddedModelInfo?.available}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition active:scale-95 shrink-0"
                        >
                          {isBenchmarkingLlama ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>Ejecutando Benchmark...</span>
                            </>
                          ) : (
                            <>
                              <Play size={13} />
                              <span>Test de Velocidad ⚡</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Benchmark Result Card */}
                    {benchmarkResult && (
                      <div className={`p-3.5 rounded-xl border text-xs animate-in fade-in space-y-2 ${
                        benchmarkResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-slate-200'
                          : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      }`}>
                        <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1.5">
                          <span className="flex items-center gap-1.5 text-emerald-300">
                            {benchmarkResult.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                            <span>{benchmarkResult.success ? 'Benchmark Completado con Éxito' : 'Error en Benchmark'}</span>
                          </span>
                          {benchmarkResult.success && (
                            <div className="flex items-center gap-3 font-mono text-[11px]">
                              <span className="text-amber-400">⏱️ {benchmarkResult.durationMs} ms</span>
                              <span className="text-purple-400">⚡ {benchmarkResult.tokensPerSecond} tok/s</span>
                              <span className="text-sky-400">🪙 {benchmarkResult.tokens?.totalTokens} tokens</span>
                            </div>
                          )}
                        </div>
                        <div className="font-mono text-[11px] whitespace-pre-wrap bg-[#111b21] p-2.5 rounded-lg border border-slate-800">
                          {benchmarkResult.success ? benchmarkResult.response : benchmarkResult.error}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agentes Vinculados */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <Bot size={14} className="text-emerald-400" />
                        Agentes Asignados a este Modelo Local
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {embeddedModelInfo?.systemUsage?.agentsCount || 0} configurados
                      </span>
                    </div>

                    {(!embeddedModelInfo?.systemUsage?.agentsList || embeddedModelInfo.systemUsage.agentsList.length === 0) ? (
                      <div className="p-3 rounded-xl bg-[#111b21] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                        Actualmente ningún agente individual tiene asignado <code>qwen_embedded</code> de forma exclusiva. Si el sistema tiene configurado Llama-CPP como motor global, todos los agentes que hereden por defecto utilizarán este modelo.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {embeddedModelInfo.systemUsage.agentsList.map(ag => (
                          <div key={ag.id} className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="text-xs font-bold text-white">{ag.name}</div>
                              <div className="text-[10px] text-slate-400">{ag.roleLabel || ag.role}</div>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              Activo
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TOKENS & AI USAGE TRACKER */}
              {activeTab === 'tokens' && (
                <div className="space-y-5 animate-in fade-in">
                  {/* Header & Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap size={16} className="text-amber-400" />
                        Monitoreo de Consumo de Tokens & IA
                      </h3>
                      <p className="text-xs text-slate-400">
                        Supervisa en tiempo real los tokens consumidos (Prompt vs Completion), desglose por proveedor y latencias de respuesta.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={fetchTokenStats}
                        disabled={isLoadingTokens}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-slate-700 disabled:opacity-50"
                      >
                        <RefreshCw size={13} className={isLoadingTokens ? 'animate-spin' : ''} />
                        <span>Actualizar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetTokenStats}
                        disabled={isResettingTokens}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-rose-500/30 disabled:opacity-50"
                      >
                        <RotateCcw size={13} />
                        <span>Reiniciar</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Stat Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-amber-500/30 shadow-lg shadow-amber-950/20">
                      <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1 mb-1">
                        <Zap size={13} />
                        <span>Total Tokens</span>
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        {(tokenStats?.totalTokens || 0).toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Acumulado global</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-sky-500/30 shadow-lg shadow-sky-950/20">
                      <div className="text-[11px] font-bold text-sky-400 flex items-center gap-1 mb-1">
                        <span>📥 Entrada (Prompt)</span>
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        {(tokenStats?.totalPromptTokens || 0).toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Tokens enviados a IA</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-emerald-500/30 shadow-lg shadow-emerald-950/20">
                      <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 mb-1">
                        <span>📤 Salida (Generados)</span>
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        {(tokenStats?.totalCompletionTokens || 0).toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Tokens respondidos</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#182229] border border-purple-500/30 shadow-lg shadow-purple-950/20">
                      <div className="text-[11px] font-bold text-purple-400 flex items-center gap-1 mb-1">
                        <span>💬 Peticiones</span>
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        {(tokenStats?.totalRequests || 0).toLocaleString('es-AR')}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Llamadas totales a LLM</div>
                    </div>
                  </div>

                  {/* Desglose por Proveedor */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Layers size={14} className="text-purple-400" />
                      Consumo por Proveedor de Inteligencia Artificial
                    </h4>

                    {Object.keys(tokenStats?.byProvider || {}).length === 0 ? (
                      <div className="p-4 rounded-xl bg-[#111b21] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                        Aún no se registran peticiones a modelos de IA en esta sesión. Los consumos aparecerán automáticamente a medida que los agentes conversen con clientes o realicen pruebas.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {Object.entries(tokenStats.byProvider).map(([key, provData]) => {
                          const percent = tokenStats.totalTokens > 0 ? Math.round((provData.totalTokens / tokenStats.totalTokens) * 100) : 0;
                          return (
                            <div key={key} className="p-3 rounded-xl bg-[#111b21] border border-slate-800 flex flex-col justify-between">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-white capitalize">{provData.name || key}</span>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold">
                                  {percent}%
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-300 bg-[#182229] p-2 rounded-lg border border-slate-800/80">
                                <div><span className="text-slate-500 block text-[9px]">TOKENS</span>{provData.totalTokens.toLocaleString('es-AR')}</div>
                                <div><span className="text-slate-500 block text-[9px]">PETICIONES</span>{provData.requests}</div>
                                <div><span className="text-slate-500 block text-[9px]">LATENCIA</span>{provData.avgLatencyMs} ms</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tabla de Actividad Reciente */}
                  <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <Clock size={14} className="text-emerald-400" />
                        Últimas Peticiones & Turnos Conversacionales
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {tokenStats?.recentLogs?.length || 0} registros recientes
                      </span>
                    </div>

                    {(!tokenStats?.recentLogs || tokenStats.recentLogs.length === 0) ? (
                      <div className="p-4 rounded-xl bg-[#111b21] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                        Sin registros recientes.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#111b21]">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-[#182229] text-[10px] uppercase text-slate-400 font-bold border-b border-slate-800">
                            <tr>
                              <th className="p-2.5">Hora</th>
                              <th className="p-2.5">Origen</th>
                              <th className="p-2.5">Proveedor / Modelo</th>
                              <th className="p-2.5 text-right">Prompt</th>
                              <th className="p-2.5 text-right">Completion</th>
                              <th className="p-2.5 text-right">Total Tokens</th>
                              <th className="p-2.5 text-right">Latencia</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                            {tokenStats.recentLogs.slice(0, 30).map((log) => {
                              const timeStr = new Date(log.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                              return (
                                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="p-2.5 text-slate-400 whitespace-nowrap">{timeStr}</td>
                                  <td className="p-2.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold ${
                                      log.caller === 'whatsapp' ? 'bg-emerald-500/20 text-emerald-400' :
                                      log.caller === 'god_mode' ? 'bg-amber-500/20 text-amber-400' :
                                      log.caller === 'simulator' ? 'bg-sky-500/20 text-sky-400' :
                                      log.caller === 'embedded' ? 'bg-purple-500/20 text-purple-400' :
                                      'bg-slate-800 text-slate-400'
                                    }`}>
                                      {log.caller}
                                    </span>
                                  </td>
                                  <td className="p-2.5 font-sans font-medium text-white truncate max-w-[150px]">
                                    <span className="text-slate-400 capitalize">{log.provider}:</span> {log.model}
                                  </td>
                                  <td className="p-2.5 text-right text-slate-400">{log.promptTokens}</td>
                                  <td className="p-2.5 text-right text-slate-400">{log.completionTokens}</td>
                                  <td className="p-2.5 text-right font-bold text-emerald-400">{log.totalTokens}</td>
                                  <td className="p-2.5 text-right text-slate-400">{log.latencyMs}ms</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}


          {/* TAB: TIENDA WEB & BRANDING (APPLE GLASS EXPERIENCE) */}
          {activeTab === 'store' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Header & Live Preview Card */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-[#111b21] to-slate-950 border border-white/10 shadow-2xl relative overflow-hidden">
                {/* Background Mesh Glow */}
                <div 
                  className="absolute -top-10 -right-10 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none"
                  style={{ backgroundColor: settings?.storeConfig?.primaryColor || '#10b981' }}
                />
                <div 
                  className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
                  style={{ backgroundColor: settings?.storeConfig?.accentColor || '#38bdf8' }}
                />

                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-lg border border-white/15"
                      style={{ 
                        backgroundColor: `${settings?.storeConfig?.primaryColor || '#10b981'}25`,
                        color: settings?.storeConfig?.primaryColor || '#10b981'
                      }}
                    >
                      <Store size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">Diseño & Marca: Tienda Online Apple UI</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                          En Vivo (/tienda)
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Personaliza la portada, paleta de colores translúcidos, tipografías y checkout sin fricción</p>
                    </div>
                  </div>

                  <a
                    href="/tienda"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition active:scale-95 shrink-0"
                  >
                    <span>Ver Tienda</span>
                    <ExternalLink size={13} />
                  </a>
                </div>

                {/* Live Mini Preview */}
                <div className="mt-4 p-4 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 space-y-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-amber-400" />
                    <span>Vista Previa en Vivo de la Portada</span>
                  </div>

                  <div className="p-4 rounded-xl border border-white/10 relative overflow-hidden bg-gradient-to-r from-slate-900/80 via-black/60 to-slate-900/80">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border mb-2"
                      style={{
                        backgroundColor: `${settings?.storeConfig?.primaryColor || '#10b981'}20`,
                        borderColor: `${settings?.storeConfig?.primaryColor || '#10b981'}40`,
                        color: settings?.storeConfig?.primaryColor || '#10b981'
                      }}
                    >
                      {settings?.storeConfig?.heroBadge || '🔥 Envíos en el día en Córdoba Capital'}
                    </div>

                    <h4 
                      className="text-base font-extrabold text-white mb-1 tracking-tight"
                      style={{ fontFamily: settings?.storeConfig?.fontFamily || 'Inter' }}
                    >
                      {settings?.storeConfig?.heroTitle || 'La Mejor Carne Argentina Directo a Tu Mesa'}
                    </h4>
                    
                    <p className="text-xs text-slate-300 line-clamp-2 max-w-xl mb-3">
                      {settings?.storeConfig?.heroSubtitle || 'Novillito pesado premium, cerdo seleccionado y achuras frescas.'}
                    </p>

                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 shadow-lg flex items-center gap-1.5 transition"
                        style={{ backgroundColor: settings?.storeConfig?.primaryColor || '#10b981' }}
                      >
                        <span>{settings?.storeConfig?.heroCtaText || 'Explorar Catálogo'}</span>
                        <ArrowRight size={13} />
                      </button>
                      
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span>Fuente: <b>{settings?.storeConfig?.fontFamily || 'Inter'}</b></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 1: Portada & Hero Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                    <Layout size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Portada & Textos de Bienvenida (Hero)</h3>
                    <p className="text-xs text-slate-400">Contenido destacado que los clientes ven al ingresar a la tienda</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Título Principal de Portada</label>
                    <input
                      type="text"
                      value={settings?.storeConfig?.heroTitle ?? 'La Mejor Carne Argentina Directo a Tu Mesa'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroTitle: e.target.value }
                      })}
                      placeholder="Ej: La Mejor Carne Argentina Directo a Tu Mesa"
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Subtítulo Descriptivo</label>
                    <textarea
                      rows={2}
                      value={settings?.storeConfig?.heroSubtitle ?? 'Novillito pesado premium, cerdo seleccionado y achuras frescas. Hacé tu pedido en segundos con entrega asegurada o retiro en 6 sucursales.'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroSubtitle: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Insignia / Badge Superior</label>
                    <input
                      type="text"
                      value={settings?.storeConfig?.heroBadge ?? '🔥 Envíos en el día en Córdoba Capital'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroBadge: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Texto Botón de Acción (CTA)</label>
                    <input
                      type="text"
                      value={settings?.storeConfig?.heroCtaText ?? 'Explorar Catálogo'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroCtaText: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Estilo de Fondo de Portada</label>
                    <select
                      value={settings?.storeConfig?.heroBannerMode || 'glass-mesh'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroBannerMode: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="glass-mesh">Efecto Malla de Vidrio & Luces Translúcidas (Apple Mesh)</option>
                      <option value="image">Imagen Personalizada de Fondo con Desenfoque</option>
                      <option value="minimal">Minimalista Oscuro Pulcro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">URL Imagen de Fondo (Opcional)</label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={settings?.storeConfig?.heroBgImage || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), heroBgImage: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Barra Superior de Anuncios Ticker */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Barra de Anuncios & Promociones (Ticker)</h3>
                      <p className="text-xs text-slate-400">Cintillo superior animado con envíos gratis o avisos clave</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings?.storeConfig?.announcementBarEnabled !== false}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), announcementBarEnabled: e.target.checked }
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Texto del Anuncio</label>
                  <input
                    type="text"
                    value={settings?.storeConfig?.announcementBarText ?? '🥩 ¡Envíos gratis en compras superiores a $45.000 en Córdoba! Despacho seguro en 24hs.'}
                    onChange={(e) => setSettings({
                      ...settings,
                      storeConfig: { ...(settings?.storeConfig || {}), announcementBarText: e.target.value }
                    })}
                    className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Card 3: Paleta de Colores & Presets Apple Glass */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Paleta de Colores & Temas Apple UI</h3>
                    <p className="text-xs text-slate-400">Selecciona una armonía cromática predefinida o personaliza tus tonos de marca</p>
                  </div>
                </div>

                {/* Presets Rápidos */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Temas Predefinidos (1-Click)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: 'apple-obsidian', name: 'Apple Obsidian', desc: 'Carbón & Esmeralda', primary: '#10b981', accent: '#38bdf8' },
                      { id: 'titanium-frost', name: 'Titanium Frost', desc: 'Zafiro & Cian', primary: '#0284c7', accent: '#38bdf8' },
                      { id: 'midnight-ruby', name: 'Midnight Ruby', desc: 'Carmesí & Borgoña', primary: '#e11d48', accent: '#fb7185' },
                      { id: 'obsidian-gold', name: 'Obsidian Gold', desc: 'Ámbar & Dorado', primary: '#d97706', accent: '#fbbf24' }
                    ].map((preset) => {
                      const isSelected = (settings?.storeConfig?.primaryColor === preset.primary && settings?.storeConfig?.accentColor === preset.accent);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSettings({
                            ...settings,
                            storeConfig: {
                              ...(settings?.storeConfig || {}),
                              themePreset: preset.id,
                              primaryColor: preset.primary,
                              accentColor: preset.accent
                            }
                          })}
                          className={`p-3 rounded-2xl border text-left transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                              : 'border-slate-800 bg-[#111b21] hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: preset.primary }} />
                            <span className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: preset.accent }} />
                          </div>
                          <div className="text-xs font-bold text-white">{preset.name}</div>
                          <div className="text-[10px] text-slate-400">{preset.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Color Primario (Botones & Acentos)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings?.storeConfig?.primaryColor || '#10b981'}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), primaryColor: e.target.value }
                        })}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={settings?.storeConfig?.primaryColor || '#10b981'}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), primaryColor: e.target.value }
                        })}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Color de Acento Secundario</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings?.storeConfig?.accentColor || '#38bdf8'}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), accentColor: e.target.value }
                        })}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={settings?.storeConfig?.accentColor || '#38bdf8'}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), accentColor: e.target.value }
                        })}
                        className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nivel de Desenfoque (Glass Blur)</label>
                    <select
                      value={settings?.storeConfig?.glassBlurLevel || 'xl'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), glassBlurLevel: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none"
                    >
                      <option value="md">Suave (12px blur)</option>
                      <option value="lg">Alto (16px blur)</option>
                      <option value="xl">Ultra Cristalino (24px blur - Recomendado Apple)</option>
                      <option value="2xl">Profundo (40px blur)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 4: Tipografía & Fuentes */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                    <Type size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Tipografía & Fuentes Modernas</h3>
                    <p className="text-xs text-slate-400">Familia tipográfica aplicada a títulos, precios y catálogo de la tienda</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'Inter', name: 'Inter (Apple UI Clean)', sample: 'Tipografía nítida para pantallas táctiles y números' },
                    { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans', sample: 'Moderna, geométrica y con alta legibilidad' },
                    { id: 'Outfit', name: 'Outfit', sample: 'Elegante, moderna y premium para e-commerce' },
                    { id: 'system-ui', name: 'SF Pro / Apple System', sample: 'Nativa de dispositivos iOS y macOS' }
                  ].map(font => {
                    const isSelected = (settings?.storeConfig?.fontFamily === font.id) || (!settings?.storeConfig?.fontFamily && font.id === 'Inter');
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), fontFamily: font.id }
                        })}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10 text-white shadow-lg'
                            : 'border-slate-800 bg-[#111b21] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold text-white" style={{ fontFamily: font.id }}>{font.name}</div>
                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">{font.sample}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card 5: Métodos de Pago Habilitados en Tienda Web */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Medios de Pago Habilitados en Tienda Web</h3>
                    <p className="text-xs text-slate-400">Opciones que se ofrecen al cliente al completar el checkout</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Mercado Pago */}
                  <div className="p-3.5 rounded-xl bg-[#111b21] border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                        <CreditCard size={14} />
                        <span>Mercado Pago</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings?.storeConfig?.allowMercadoPago !== false}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), allowMercadoPago: e.target.checked }
                        })}
                        className="rounded accent-emerald-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">Genera links de pago instantáneos o QR de Checkout Pro</p>
                  </div>

                  {/* Efectivo contraentrega */}
                  <div className="p-3.5 rounded-xl bg-[#111b21] border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <DollarSign size={14} />
                        <span>Efectivo / Vuelto</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings?.storeConfig?.allowCash !== false}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), allowCash: e.target.checked }
                        })}
                        className="rounded accent-emerald-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">Permite abonar al cadete con cálculo de vuelto</p>
                  </div>

                  {/* Transferencia Bancaria */}
                  <div className="p-3.5 rounded-xl bg-[#111b21] border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                        <ArrowRight size={14} />
                        <span>Transferencia</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings?.storeConfig?.allowTransfer !== false}
                        onChange={(e) => setSettings({
                          ...settings,
                          storeConfig: { ...(settings?.storeConfig || {}), allowTransfer: e.target.checked }
                        })}
                        className="rounded accent-emerald-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">Muestra alias y CBU con botón de 1-toque para copiar</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Alias de Transferencia</label>
                    <input
                      type="text"
                      value={settings?.storeConfig?.transferAlias ?? 'republica.carne.mp'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), transferAlias: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Número de WhatsApp de Contacto Directo</label>
                    <input
                      type="text"
                      value={settings?.storeConfig?.whatsappDirectNumber ?? '+5493516262475'}
                      onChange={(e) => setSettings({
                        ...settings,
                        storeConfig: { ...(settings?.storeConfig || {}), whatsappDirectNumber: e.target.value }
                      })}
                      className="w-full px-3.5 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LOGÍSTICA, HORARIOS & FRANJAS DE REPARTO */}
          {activeTab === 'logistics' && (
            <div className="space-y-5 animate-in fade-in">
              {/* Card 1: Horarios de Atención al Público */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Horarios de Atención de Sucursales</h3>
                    <p className="text-xs text-slate-400">Horarios en los que el agente atiende y coordina retiros</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Hora de Apertura</label>
                    <input
                      type="time"
                      value={settings?.businessHours?.open || '08:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        businessHours: { ...(settings?.businessHours || {}), open: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Hora de Cierre</label>
                    <input
                      type="time"
                      value={settings?.businessHours?.close || '20:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        businessHours: { ...(settings?.businessHours || {}), close: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Días de Atención</label>
                    <input
                      type="text"
                      value={settings?.businessHours?.days || 'Lunes a Sábados (Domingos 09:00 a 13:30 hs)'}
                      onChange={(e) => setSettings({
                        ...settings,
                        businessHours: { ...(settings?.businessHours || {}), days: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Regla de Corte (12:00 PM) y Tiempos de Entrega */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                    <Bike size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Regla de Corte y Despacho de Pedidos
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">
                        Corte 12:00 hs (Máx 24h)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">Determina si el pedido se despacha en la tarde del mismo día o al día siguiente</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Hora Límite de Corte (Formato 24h)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="23"
                        value={settings?.deliveryCutoffHour ?? 12}
                        onChange={(e) => setSettings({
                          ...settings,
                          deliveryCutoffHour: parseInt(e.target.value, 10) || 12
                        })}
                        className="w-24 px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                      />
                      <span className="text-xs text-slate-400">:00 hs del mediodía</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Plazo Máximo Garantizado
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="72"
                        value={settings?.deliveryMaxHours ?? 24}
                        onChange={(e) => setSettings({
                          ...settings,
                          deliveryMaxHours: parseInt(e.target.value, 10) || 24
                        })}
                        className="w-24 px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                      />
                      <span className="text-xs text-slate-400">horas</span>
                    </div>
                  </div>
                </div>

                {/* Info Callout */}
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-200">
                    <span>💡 Lógica de corte activa:</span>
                  </div>
                  <div>• <b>Antes de las {settings?.deliveryCutoffHour ?? 12}:00 hs:</b> Se intentará enviar durante el transcurso de la tarde (máx 24 horas).</div>
                  <div>• <b>Luego de las {settings?.deliveryCutoffHour ?? 12}:00 hs:</b> El pedido se despachará al día siguiente en franja correspondiente (siempre dentro de las 24 horas).</div>
                </div>
              </div>

              {/* Card 3: Franjas Horarias de Entrega (2 Franjas por Defecto) */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      <Layers size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Franjas Horarias de Entrega</h3>
                      <p className="text-xs text-slate-400">Rangos de reparto que el agente de IA ofrece a los clientes</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {(settings?.deliverySlots || [
                    { id: 'morning', name: 'Franja Mañana', start: '09:00', end: '13:00', active: true, desc: 'Entregas matutinas de 9:00 a 13:00 hs' },
                    { id: 'afternoon', name: 'Franja Tarde', start: '14:00', end: '19:00', active: true, desc: 'Entregas vespertinas de 14:00 a 19:00 hs' }
                  ]).map((slot, index) => (
                    <div key={slot.id || index} className="p-3.5 rounded-xl bg-[#111b21] border border-slate-700/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-xs font-bold text-white">{slot.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({slot.start} a {slot.end} hs)</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={slot.active !== false}
                            onChange={(e) => {
                              const updated = [...(settings?.deliverySlots || [
                                { id: 'morning', name: 'Franja Mañana', start: '09:00', end: '13:00', active: true, desc: 'Entregas matutinas de 9:00 a 13:00 hs' },
                                { id: 'afternoon', name: 'Franja Tarde', start: '14:00', end: '19:00', active: true, desc: 'Entregas vespertinas de 14:00 a 19:00 hs' }
                              ])];
                              updated[index] = { ...updated[index], active: e.target.checked };
                              setSettings({ ...settings, deliverySlots: updated });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Nombre</label>
                          <input
                            type="text"
                            value={slot.name}
                            onChange={(e) => {
                              const updated = [...(settings?.deliverySlots || [])];
                              updated[index] = { ...updated[index], name: e.target.value };
                              setSettings({ ...settings, deliverySlots: updated });
                            }}
                            className="w-full px-2.5 py-1.5 bg-[#182229] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Inicio</label>
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => {
                              const updated = [...(settings?.deliverySlots || [])];
                              updated[index] = { ...updated[index], start: e.target.value };
                              setSettings({ ...settings, deliverySlots: updated });
                            }}
                            className="w-full px-2.5 py-1.5 bg-[#182229] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Fin</label>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => {
                              const updated = [...(settings?.deliverySlots || [])];
                              updated[index] = { ...updated[index], end: e.target.value };
                              setSettings({ ...settings, deliverySlots: updated });
                            }}
                            className="w-full px-2.5 py-1.5 bg-[#182229] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 4: Tarifas, Envío Express y Envío Bonificado */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Tarifas de Entrega, Express y Envío Bonificado</h3>
                    <p className="text-xs text-slate-400">Precios de flete y montos mínimos de compra para envío gratis</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Envío Estándar */}
                  <div className="p-3 rounded-xl bg-[#111b21] border border-slate-700 space-y-1.5">
                    <label className="block text-xs font-bold text-white">Costo Envío Estándar ($)</label>
                    <input
                      type="number"
                      value={settings?.deliveryStandardCost ?? 3500}
                      onChange={(e) => setSettings({
                        ...settings,
                        deliveryStandardCost: parseFloat(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 bg-[#182229] border border-slate-700 rounded-xl text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400 block">Flete general por envío</span>
                  </div>

                  {/* Envío Express */}
                  <div className="p-3 rounded-xl bg-[#111b21] border border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-amber-400">Envío Express Prioritario</label>
                      <input
                        type="checkbox"
                        checked={settings?.deliveryExpressEnabled !== false}
                        onChange={(e) => setSettings({
                          ...settings,
                          deliveryExpressEnabled: e.target.checked
                        })}
                        className="rounded text-amber-500 focus:ring-amber-500"
                      />
                    </div>
                    <input
                      type="number"
                      value={settings?.deliveryExpressCost ?? 6500}
                      onChange={(e) => setSettings({
                        ...settings,
                        deliveryExpressCost: parseFloat(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 bg-[#182229] border border-slate-700 rounded-xl text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-400 block">A cargo del cliente (45-60 min)</span>
                  </div>

                  {/* Envío Gratis */}
                  <div className="p-3 rounded-xl bg-[#111b21] border border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-emerald-400">Envío Gratis Desde ($)</label>
                      <input
                        type="checkbox"
                        checked={settings?.deliveryFreeEnabled !== false}
                        onChange={(e) => setSettings({
                          ...settings,
                          deliveryFreeEnabled: e.target.checked
                        })}
                        className="rounded text-emerald-500 focus:ring-emerald-500"
                      />
                    </div>
                    <input
                      type="number"
                      value={settings?.deliveryFreeThreshold ?? 45000}
                      onChange={(e) => setSettings({
                        ...settings,
                        deliveryFreeThreshold: parseFloat(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 bg-[#182229] border border-slate-700 rounded-xl text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400 block">Bonificación para compras mayores</span>
                  </div>
                </div>

                {/* Radio de Cobertura */}
                <div className="p-3 rounded-xl bg-[#111b21] border border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white">Radio de Cobertura Máximo</div>
                    <div className="text-[10px] text-slate-400">Distancia máxima desde las sucursales para delivery directo</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={settings?.deliveryCoverageRadiusKm ?? 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        deliveryCoverageRadiusKm: parseFloat(e.target.value) || 15
                      })}
                      className="w-20 px-2.5 py-1.5 bg-[#182229] border border-slate-700 rounded-xl text-xs text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 font-bold">Km</span>
                  </div>
                </div>
              </div>
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

          {/* TAB ARCA / FACTURACIÓN ELECTRÓNICA & MULTI-RAZÓN SOCIAL */}
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
                      ARCA (ex AFIP) Multi-Razón Social & Facturación
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                        🇦🇷 RG 4291 / 4892
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Asocia múltiples CUITs y Razones Sociales a tus sucursales con puntos de venta específicos y alícuotas de IVA.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingProfile({
                      id: '',
                      name: '',
                      razonSocial: '',
                      nombreFantasia: '',
                      cuit: '',
                      condicionIva: 'Responsable Inscripto',
                      iibb: '',
                      inicioActividades: '',
                      domicilioComercial: '',
                      ptoVta: 1,
                      defaultDocumentType: 'factura_b',
                      mode: 'sandbox',
                      branchIds: [],
                      isDefault: fiscalProfiles.length === 0
                    })}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow-md transition"
                  >
                    <Plus size={14} /> Nueva Razón Social
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestArca()}
                    disabled={isTestingArca}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isTestingArca ? 'animate-spin' : ''} />
                    {isTestingArca ? 'Verificando...' : '⚡ Probar ARCA'}
                  </button>
                </div>
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

              {/* LIST OF FISCAL PROFILES / RAZONES SOCIALES */}
              <div className="p-4 rounded-2xl bg-[#182229] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Razones Sociales & CUITs Registrados</h4>
                    <p className="text-[11px] text-slate-400">Cada sucursal facturará bajo su Razón Social y Punto de Venta asignado</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {fiscalProfiles.length} Perfil(es)
                  </span>
                </div>

                <div className="space-y-2.5">
                  {fiscalProfiles.map(profile => {
                    const assignedBranches = allBranches.filter(b => 
                      b.fiscalProfileId === profile.id || (Array.isArray(profile.branchIds) && profile.branchIds.includes(b.id))
                    );

                    return (
                      <div 
                        key={profile.id}
                        className="p-3 rounded-2xl bg-[#111b21] border border-slate-700/80 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-white">{profile.razonSocial}</span>
                              {profile.isDefault && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  ★ Predeterminada
                                </span>
                              )}
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                profile.mode === 'production'
                                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}>
                                {profile.mode === 'production' ? '🚀 Producción' : '🧪 Sandbox'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>CUIT: <b className="text-white font-mono">{profile.cuit}</b></span>
                              <span>Pto. Venta: <b className="text-emerald-400 font-mono">#{profile.ptoVta}</b></span>
                              <span>Condición: <b className="text-slate-300">{profile.condicionIva}</b></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTestArca(profile.id)}
                              className="px-2.5 py-1 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold border border-blue-500/30 transition"
                              title="Probar conexión de esta Razón Social"
                            >
                              ⚡ Probar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingProfile({ ...profile })}
                              className="p-1.5 rounded-xl bg-[#182229] hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                              title="Editar datos fiscales"
                            >
                              ✏️
                            </button>
                            {!profile.isDefault && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFiscalProfile(profile.id)}
                                className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                                title="Eliminar razón social"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Associated Branches Badges */}
                        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-bold mr-1">Sucursales Asociadas:</span>
                          {assignedBranches.length > 0 ? (
                            assignedBranches.map(b => (
                              <span key={b.id} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[#182229] text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <Store size={10} /> {b.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-amber-400/80 italic">Ninguna sucursal vinculada (se aplicará como fallback)</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* MODAL / FORMULARIO EDICIÓN DE RAZÓN SOCIAL */}
              {editingProfile && (
                <div className="p-4 rounded-2xl bg-[#111b21] border border-blue-500/40 space-y-3 animate-in zoom-in-95">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Receipt size={14} className="text-blue-400" />
                      {editingProfile.id ? 'Editar Razón Social' : 'Nueva Razón Social / CUIT'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Razón Social Legal:</label>
                      <input
                        type="text"
                        value={editingProfile.razonSocial || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, razonSocial: e.target.value })}
                        placeholder="Ej: REPÚBLICA DE LA CARNE S.R.L."
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre de Fantasía:</label>
                      <input
                        type="text"
                        value={editingProfile.nombreFantasia || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, nombreFantasia: e.target.value })}
                        placeholder="Ej: República de la Carne - Urca"
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">CUIT Emisor (11 dígitos):</label>
                      <input
                        type="text"
                        value={editingProfile.cuit || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, cuit: e.target.value.replace(/\D/g, '') })}
                        placeholder="30716892348"
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Punto de Venta (Pto Vta):</label>
                      <input
                        type="number"
                        min="1"
                        max="9999"
                        value={editingProfile.ptoVta || 1}
                        onChange={(e) => setEditingProfile({ ...editingProfile, ptoVta: parseInt(e.target.value, 10) || 1 })}
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Condición frente al IVA:</label>
                      <select
                        value={editingProfile.condicionIva || 'Responsable Inscripto'}
                        onChange={(e) => setEditingProfile({ ...editingProfile, condicionIva: e.target.value })}
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="Responsable Inscripto">Responsable Inscripto</option>
                        <option value="Monotributo">Monotributo</option>
                        <option value="Exento">IVA Exento</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Entorno:</label>
                      <select
                        value={editingProfile.mode || 'sandbox'}
                        onChange={(e) => setEditingProfile({ ...editingProfile, mode: e.target.value })}
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="sandbox">🧪 Sandbox / Homologación (Pruebas)</option>
                        <option value="production">🚀 Producción (Facturación Oficial)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Domicilio Comercial:</label>
                      <input
                        type="text"
                        value={editingProfile.domicilioComercial || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, domicilioComercial: e.target.value })}
                        placeholder="Av. José Roque Funes 1115, Barrio Urca, Córdoba"
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Ingresos Brutos (IIBB):</label>
                      <input
                        type="text"
                        value={editingProfile.iibb || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, iibb: e.target.value })}
                        placeholder="901-283746-1"
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Inicio de Actividades:</label>
                      <input
                        type="text"
                        value={editingProfile.inicioActividades || ''}
                        onChange={(e) => setEditingProfile({ ...editingProfile, inicioActividades: e.target.value })}
                        placeholder="01/03/2020"
                        className="w-full bg-[#182229] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Selector de Sucursales Asociadas */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Sucursales que operan bajo esta Razón Social:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-[#182229] border border-slate-800 rounded-xl">
                        {allBranches.map(b => {
                          const isChecked = Array.isArray(editingProfile.branchIds) && editingProfile.branchIds.includes(b.id);
                          return (
                            <label key={b.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const currentIds = Array.isArray(editingProfile.branchIds) ? [...editingProfile.branchIds] : [];
                                  if (e.target.checked) {
                                    if (!currentIds.includes(b.id)) currentIds.push(b.id);
                                  } else {
                                    const filtered = currentIds.filter(id => id !== b.id);
                                    setEditingProfile({ ...editingProfile, branchIds: filtered });
                                    return;
                                  }
                                  setEditingProfile({ ...editingProfile, branchIds: currentIds });
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{b.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingProfile.isDefault)}
                          onChange={(e) => setEditingProfile({ ...editingProfile, isDefault: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Establecer como Razón Social Predeterminada</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProfile(null)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveFiscalProfile(editingProfile)}
                          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"
                        >
                          Guardar Razón Social
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Automatización de Facturación al Cobrar */}
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

                {/* Selector de Modo de Inteligencia & Personalidad */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-400 mb-1 flex items-center justify-between">
                      <span>🧠 Modo de Inteligencia & Enfoque de Conversación</span>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Control de IA</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2.5">
                      Define si el agente actúa como un bot estricto de ventas, un asesor equilibrado o un modo humano que charla brevemente y retoma la venta.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, agentPersonalityMode: 'strict_sales' })}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        settings.agentPersonalityMode === 'strict_sales'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                          : 'bg-[#202c33] border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                        <span>🎯</span> Bot Estricto
                      </div>
                      <p className="text-[10px] mt-1 text-slate-400 leading-tight">100% enfocado a venta y cotización inmediata sin desvíos.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, agentPersonalityMode: 'balanced' })}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        (settings.agentPersonalityMode || 'balanced') === 'balanced'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                          : 'bg-[#202c33] border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                        <span>⚖️</span> Asesor Equilibrado
                      </div>
                      <p className="text-[10px] mt-1 text-slate-400 leading-tight">Recomienda cortes y recetas encauzando con naturalidad a la compra.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, agentPersonalityMode: 'human_empathetic' })}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        settings.agentPersonalityMode === 'human_empathetic'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                          : 'bg-[#202c33] border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                        <span>🤝</span> Modo Humano
                      </div>
                      <p className="text-[10px] mt-1 text-slate-400 leading-tight">Charla empática breve con el cliente para luego retomar suavemente la venta.</p>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Turnos de Charla Casual Permitidos
                      </label>
                      <select
                        value={settings.casualTalkTurnsAllowed || 2}
                        onChange={(e) => setSettings({ ...settings, casualTalkTurnsAllowed: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white"
                      >
                        <option value={1}>1 respuesta casual y encauzar</option>
                        <option value={2}>2 respuestas casuales (Recomendado)</option>
                        <option value={3}>3 respuestas casuales</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-[#202c33] border border-slate-700">
                      <div>
                        <span className="text-xs font-bold text-white block">👨‍🍳 Asesor de Recetas</span>
                        <span className="text-[10px] text-slate-400">Proponer recetas cuando no es asado</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.culinaryAdvisorEnabled !== false}
                        onChange={(e) => setSettings({ ...settings, culinaryAdvisorEnabled: e.target.checked })}
                        className="w-4 h-4 accent-emerald-500"
                      />
                    </div>
                  </div>
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
