import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Users,
  Image as ImageIcon,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  Trash2,
  Eye,
  RefreshCw,
  Zap,
  Tag,
  Check,
  X,
  FileText,
  Upload,
  MessageSquare,
  BarChart3,
  Flame,
  Layers,
  Search,
  Filter
} from 'lucide-react';

export default function BroadcastCampaignsView({ socket }) {
  const [campaigns, setCampaigns] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [couponsList, setCouponsList] = useState([]);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [selectedPosProduct, setSelectedPosProduct] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [feedback, setFeedback] = useState(null);

  // Formulario de Campaña
  const [formData, setFormData] = useState({
    name: '',
    segment: 'all',
    customLeadIds: [],
    products: [],
    messageTemplate: `¡Hola {{nombre}}! 🥩🔥 En {{negocio}} tenemos ofertas especiales listas para vos este {{dia_semana}}:\n\n🔥 *Combo Asadazo (4kg + Vino de regalo):* $39.999\n🥩 *Tapa de Cuadril Seleccionada:* $12.800/kg\n🥓 *Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)*\n\n¿Te separamos tu pedido para despacho en el día? Respondé este mensaje y te lo dejamos listo. 🛵📦`,
    mediaUrl: null,
    mediaType: 'text',
    scheduledAt: ''
  });

  // Vista Previa en Vivo
  const [previewData, setPreviewData] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [audienceCounts, setAudienceCounts] = useState({});
  const [selectedLogsModal, setSelectedLogsModal] = useState(null);

  const TEMPLATE_VARIABLES = [
    { tag: '{{nombre}}', label: 'Nombre Cliente', desc: 'Don Juan / Cliente' },
    { tag: '{{numero_cliente}}', label: 'N.° Cliente', desc: 'CLI-1001' },
    { tag: '{{telefono}}', label: 'Teléfono', desc: '+54 9 351...' },
    { tag: '{{dia_semana}}', label: 'Día Actual', desc: 'Viernes / Sábado' },
    { tag: '{{cortes_favoritos}}', label: 'Cortes Favoritos', desc: 'Tapa de cuadril...' },
    { tag: '{{sucursal_cercana}}', label: 'Sucursal Cercana', desc: 'Sucursal Urca' },
    { tag: '{{ultimo_pedido}}', label: 'Último Pedido', desc: 'Combo Asadazo...' },
    { tag: '{{negocio}}', label: 'Negocio', desc: 'República de la Carne' }
  ];

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando campañas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProductsList(Array.isArray(data) ? data : []);
      }
    } catch (err) {}
  };

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons');
      if (res.ok) {
        const data = await res.json();
        setCouponsList(Array.isArray(data) ? data.filter(c => c.isActive !== false) : []);
      }
    } catch (err) {}
  };

  const fetchAudienceCount = async (segment) => {
    try {
      const res = await fetch(`/api/campaigns/audience-count?segment=${segment}`);
      const data = await res.json();
      setAudienceCounts(prev => ({ ...prev, [segment]: data.count }));
    } catch (e) {}
  };

  const updatePreview = async (template, segment) => {
    try {
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, segment })
      });
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchCampaigns();
    fetchProducts();
    fetchCoupons();
    fetchAudienceCount('all');
    fetchAudienceCount('vip');
    fetchAudienceCount('frequent');
    fetchAudienceCount('inactive_7d');
    fetchAudienceCount('with_orders');

    updatePreview(formData.messageTemplate, formData.segment);

    if (socket) {
      socket.on('campaign:new', (camp) => {
        setCampaigns(prev => [camp, ...prev.filter(c => c.id !== camp.id)]);
      });

      socket.on('campaign:update', (camp) => {
        setCampaigns(prev => prev.map(c => c.id === camp.id ? camp : c));
      });

      socket.on('campaign:progress', (progress) => {
        setCampaigns(prev => prev.map(c => {
          if (c.id === progress.id) {
            return {
              ...c,
              sentCount: progress.sentCount,
              failedCount: progress.failedCount,
              totalRecipients: progress.total,
              status: 'sending'
            };
          }
          return c;
        }));
      });

      socket.on('campaign:delete', (id) => {
        setCampaigns(prev => prev.filter(c => c.id !== id));
      });

      return () => {
        socket.off('campaign:new');
        socket.off('campaign:update');
        socket.off('campaign:progress');
        socket.off('campaign:delete');
      };
    }
  }, [socket]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    const bodyData = new FormData();
    bodyData.append('image', file);

    try {
      const res = await fetch('/api/campaigns/upload-banner', {
        method: 'POST',
        body: bodyData
      });
      const data = await res.json();
      if (data.success) {
        setFormData(prev => ({
          ...prev,
          mediaUrl: data.mediaUrl,
          mediaType: 'image'
        }));
        showToast('Imagen / Banner subido con éxito');
      }
    } catch (err) {
      console.error('Error subiendo imagen:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const insertVariable = (tag) => {
    setFormData(prev => {
      const newText = prev.messageTemplate + ' ' + tag;
      updatePreview(newText, prev.segment);
      return { ...prev, messageTemplate: newText };
    });
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.messageTemplate.trim()) {
      alert('Por favor completa el nombre y la plantilla del mensaje.');
      return;
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(prev => [data.campaign, ...prev]);
        setIsModalOpen(false);
        showToast('Campaña creada con éxito');
      }
    } catch (err) {
      console.error('Error creando campaña:', err);
    }
  };

  const handleSendNow = async (campaignId) => {
    if (!window.confirm('¿Deseas iniciar el envío masivo de esta campaña ahora mismo? Los mensajes se enviarán automáticamente a cada cliente con intervalo anti-bloqueo.')) return;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Envío masivo iniciado en segundo plano');
      }
    } catch (err) {
      console.error('Error iniciando campaña:', err);
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('¿Eliminar esta campaña?')) return;
    try {
      await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
      showToast('Campaña eliminada');
    } catch (err) {
      console.error('Error eliminando campaña:', err);
    }
  };

  const showToast = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  // Métricas
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
  const totalRecipients = campaigns.reduce((acc, c) => acc + (c.totalRecipients || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'sending' || c.status === 'scheduled').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="text-emerald-400" />
            Difusiones Masivas & Campañas Automatizadas
          </h1>
          <p className="text-xs text-slate-400">
            Envía difusiones de ofertas, recordatorios de asados, promociones personalizadas y publicidades con imágenes por WhatsApp
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Nueva Difusión</span>
        </button>
      </div>

      {/* Banner de Feedback */}
      {feedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-semibold animate-fade-in shadow-lg">
          <CheckCircle2 size={16} /> {feedback}
        </div>
      )}

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Campañas Totales</span>
            <Layers size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{campaigns.length}</div>
          <div className="text-[10px] text-slate-500">Borradores, programadas y enviadas</div>
        </div>

        <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Mensajes Entregados</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{totalSent}</div>
          <div className="text-[10px] text-slate-500">WhatsApp directo a clientes</div>
        </div>

        <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Alcance Total</span>
            <Users size={16} className="text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalRecipients}</div>
          <div className="text-[10px] text-slate-500">Contactos segmentados</div>
        </div>

        <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>En Ejecución / Programadas</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{activeCampaigns}</div>
          <div className="text-[10px] text-slate-500">Cola con delay anti-bloqueo</div>
        </div>
      </div>

      {/* Lista de Campañas */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <MessageSquare size={14} className="text-emerald-400" />
          Historial de Campañas & Automatizaciones
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={28} className="animate-spin text-emerald-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-[#111b21] border border-slate-800 rounded-3xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <Send size={24} />
            </div>
            <h3 className="text-base font-bold text-white">No hay campañas creadas todavía</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Creá tu primera difusión de ofertas para enviar cortes destacados, combos del día o recordatorios de compras a tus clientes por WhatsApp.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Crear Campaña de Ofertas</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(camp => {
              const progressPct = camp.totalRecipients > 0 
                ? Math.round(((camp.sentCount || 0) / camp.totalRecipients) * 100) 
                : 0;

              return (
                <div
                  key={camp.id}
                  className="bg-[#111b21] hover:bg-[#182229] border border-slate-800 hover:border-slate-700 rounded-3xl p-5 transition space-y-4 shadow-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#182229] border border-slate-700 flex items-center justify-center shrink-0">
                        {camp.mediaUrl ? <ImageIcon size={18} className="text-emerald-400" /> : <MessageSquare size={18} className="text-emerald-400" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">{camp.name}</h3>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            camp.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : camp.status === 'sending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse'
                              : camp.status === 'scheduled'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : 'bg-slate-700/30 text-slate-400'
                          }`}>
                            {camp.status === 'completed' ? '✅ COMPLETADA' : camp.status === 'sending' ? '⚡ ENVIANDO...' : camp.status === 'scheduled' ? '⏰ PROGRAMADA' : '📝 BORRADOR'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {camp.messageTemplate}
                        </p>
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {camp.status !== 'sending' && (
                        <button
                          onClick={() => handleSendNow(camp.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition"
                          title="Enviar ahora a todos los destinatarios"
                        >
                          <Play size={12} />
                          <span>{camp.status === 'completed' ? 'Re-Enviar' : 'Enviar Ahora'}</span>
                        </button>
                      )}

                      {camp.logs && camp.logs.length > 0 && (
                        <button
                          onClick={() => setSelectedLogsModal(camp)}
                          className="p-2 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-300 hover:text-white border border-slate-700 transition"
                          title="Ver registro de envíos"
                        >
                          <Eye size={14} />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        className="p-2 rounded-xl bg-[#182229] hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition"
                        title="Eliminar campaña"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Barra de Progreso y Estadísticas */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-3">
                        <span>Audiencia: <strong className="text-white capitalize">{camp.segment.replace('_', ' ')}</strong> ({camp.totalRecipients} contactos)</span>
                        {camp.scheduledAt && (
                          <span className="flex items-center gap-1 text-sky-400">
                            <Clock size={12} /> {new Date(camp.scheduledAt).toLocaleString('es-AR')}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-white">{camp.sentCount} / {camp.totalRecipients} ({progressPct}%)</span>
                    </div>

                    <div className="w-full h-2 bg-[#182229] rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          camp.status === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-amber-400'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear Nueva Campaña */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#111b21] border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Crear Nueva Campaña de Difusión</h3>
                  <p className="text-xs text-slate-400">Personaliza el mensaje con variables automáticas y envía ofertas por WhatsApp</p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#182229] transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: 2 Columnas (Editor + Preview) */}
            <form onSubmit={handleCreateCampaign} className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
              
              {/* Columna Izquierda: Formulario (7 Cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre de la Campaña</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 🔥 Ofertas de Fin de Semana - Cortes Parrilleros"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#182229] border border-slate-700 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Selección de Audiencia */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Segmento de Clientes Objetivo</label>
                  <select
                    value={formData.segment}
                    onChange={(e) => {
                      const seg = e.target.value;
                      setFormData({ ...formData, segment: seg });
                      updatePreview(formData.messageTemplate, seg);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#182229] border border-slate-700 rounded-2xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">🌐 Todos los Contactos ({audienceCounts.all || 0} clientes)</option>
                    <option value="vip">⭐ Clientes VIP / Alto Consumo ({audienceCounts.vip || 0} clientes)</option>
                    <option value="frequent">🥩 Compradores Frecuentes ({audienceCounts.frequent || 0} clientes)</option>
                    <option value="with_orders">📦 Clientes con Pedidos Anteriores ({audienceCounts.with_orders || 0} clientes)</option>
                    <option value="inactive_7d">⏳ Inactivos +7 Días ({audienceCounts.inactive_7d || 0} clientes)</option>
                  </select>
                </div>

                {/* Subir Imagen / Flyer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Imagen / Flyer Publicitario (Opcional)</label>
                  <div className="flex items-center gap-3">
                    <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 bg-[#182229] hover:bg-[#202c33] border border-dashed border-slate-600 rounded-2xl text-xs text-slate-300 transition">
                      <Upload size={14} className="text-emerald-400" />
                      <span>{isUploadingImage ? 'Subiendo imagen...' : formData.mediaUrl ? 'Cambiar Imagen' : 'Subir Imagen o Banner'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>

                    {formData.mediaUrl && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, mediaUrl: null, mediaType: 'text' })}
                        className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition"
                        title="Quitar imagen"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Variables de Personalización */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">Variables de Personalización (Clic para insertar):</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => insertVariable(v.tag)}
                        className="px-2 py-1 rounded-xl bg-[#182229] hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-400 border border-slate-700 text-[11px] font-mono transition"
                        title={v.desc}
                      >
                        {v.tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector de Productos del Catálogo */}
                <div className="p-3 bg-[#182229] border border-slate-700/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Tag size={13} />
                      Incluir Productos del Catálogo en la Oferta:
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {selectedProducts.length} seleccionados
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {productsList.map(prod => {
                      const isSelected = selectedProducts.some(p => p.id === prod.id);
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => {
                            let updated;
                            if (isSelected) {
                              updated = selectedProducts.filter(p => p.id !== prod.id);
                            } else {
                              updated = [...selectedProducts, prod];
                            }
                            setSelectedProducts(updated);
                            setFormData({ ...formData, products: updated });
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-left transition border ${
                            isSelected
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                              : 'bg-[#111b21] border-slate-800 text-slate-300 hover:bg-[#202c33]'
                          }`}
                        >
                          <span className="truncate">{prod.name}</span>
                          <span className="font-mono text-[11px] text-emerald-400 shrink-0 ml-2">
                            ${Number(prod.price).toLocaleString('es-AR')}/{prod.unit || 'kg'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {selectedProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const numIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                          const lines = selectedProducts.map((p, idx) => {
                            const icon = numIcons[idx] || `[${idx + 1}]`;
                            const priceFmt = `$${Number(p.price).toLocaleString('es-AR')}`;
                            const unitLabel = p.unit === 'kg' ? '/kg' : p.unit === 'combo' ? '(promo 4kg + vino)' : `/${p.unit}`;
                            return `${icon} *${p.name}:* ${priceFmt} ${unitLabel}`;
                          }).join('\n');

                          const newTemplate = `${formData.messageTemplate}\n\n🔥 *OFERTAS DESTACADAS:*\n${lines}\n\n👉 Respondé con el número de opción o corte que quieras y te lo preparamos! 🥩📦`;
                          setFormData({ ...formData, messageTemplate: newTemplate });
                          updatePreview(newTemplate, formData.segment);
                        }}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Sparkles size={13} />
                        <span>Insertar Lista ({selectedProducts.length})</span>
                      </button>
                    )}

                    {selectedProducts.length === 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const prod = selectedProducts[0];
                          setSelectedPosProduct(prod);
                          const cardText = `\n━━━━━━━━━━━━━━━━━━━━━\n🥩 *PROMO EXCLUSIVA POS*\n🏷️ *Corte:* ${prod.name.toUpperCase()}\n💰 *Precio Especial:* $${Number(prod.price).toLocaleString('es-AR')}/${prod.unit || 'kg'}\n🔖 *Código PLU:* #${prod.plu || prod.id}\n━━━━━━━━━━━━━━━━━━━━━`;
                          const updated = `${formData.messageTemplate}\n${cardText}`;
                          setFormData({ ...formData, messageTemplate: updated });
                          updatePreview(updated, formData.segment);
                        }}
                        className="py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <span>💳 Formato Tarjeta POS</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Selector de Cupones de Descuento */}
                <div className="p-3 bg-[#182229] border border-slate-700/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Zap size={13} />
                      Incluir Código o Cupón de Descuento:
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {couponsList.length} cupones activos
                    </span>
                  </div>

                  {couponsList.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">No hay cupones activos configurados en el sistema.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {couponsList.slice(0, 4).map(cup => (
                        <div
                          key={cup.id}
                          className="bg-[#111b21] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2 hover:border-amber-500/40 transition"
                        >
                          <div>
                            <div className="text-xs font-mono font-bold text-white tracking-wide">{cup.code}</div>
                            <div className="text-[10px] text-amber-400 font-semibold">
                              {cup.discountType === 'percent' ? `${cup.discountValue}% OFF` : `$${cup.discountValue} OFF`}
                              {cup.combinable ? ' • Combinable' : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCoupon(cup);
                              const couponText = `\n🎁 *CUPÓN EXCLUSIVO:* Usá el código 👉 *${cup.code}* para obtener *${cup.discountType === 'percent' ? `${cup.discountValue}% OFF` : `$${cup.discountValue} OFF`}* en tu compra!\n${cup.durationHours ? `⏱️ ¡Válido solo por las próximas ${cup.durationHours} horas!` : ''}`;
                              const updated = `${formData.messageTemplate}\n${couponText}`;
                              setFormData({ ...formData, messageTemplate: updated });
                              updatePreview(updated, formData.segment);
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/30 transition"
                          >
                            + Insertar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mensaje Template */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Texto del Mensaje</label>
                  <textarea
                    rows={6}
                    required
                    value={formData.messageTemplate}
                    onChange={(e) => {
                      const text = e.target.value;
                      setFormData({ ...formData, messageTemplate: text });
                      updatePreview(text, formData.segment);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#182229] border border-slate-700 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
                  />
                </div>

                {/* Programación */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha y Hora Programada (Dejar vacío para enviar ahora o guardar borrador)</label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[#182229] border border-slate-700 rounded-2xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Columna Derecha: Vista Previa en Vivo WhatsApp Mobile (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-start space-y-3 bg-[#0b141a] p-4 rounded-3xl border border-slate-800">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 self-start">
                  <Eye size={14} className="text-emerald-400" />
                  Vista Previa en WhatsApp (Cliente Real)
                </div>

                {/* Smartphone Container */}
                <div className="w-full max-w-[300px] bg-[#111b21] rounded-[2.5rem] p-3 border-4 border-slate-700 shadow-2xl space-y-2">
                  {/* WhatsApp Mobile Top Bar */}
                  <div className="bg-[#202c33] rounded-2xl p-2.5 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center">
                      🥩
                    </div>
                    <div className="text-left leading-tight">
                      <div className="text-[11px] font-bold text-white">República de la Carne</div>
                      <div className="text-[9px] text-emerald-400">Cuenta Oficial Empresa</div>
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="bg-[#0b141a] rounded-2xl p-2.5 min-h-[260px] flex flex-col justify-end space-y-2">
                    {/* Burbuja WhatsApp Saliente */}
                    <div className="bg-[#005c4b] text-slate-100 rounded-2xl rounded-tr-none p-3 text-xs shadow-md space-y-2 max-w-[95%] self-end text-left">
                      {formData.mediaUrl && (
                        <div className="rounded-xl overflow-hidden border border-emerald-600/30">
                          <img
                            src={formData.mediaUrl}
                            alt="Banner difusión"
                            className="w-full h-32 object-cover"
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed text-[11px]">
                        {previewData?.rendered || formData.messageTemplate}
                      </p>
                      <div className="text-[9px] text-emerald-200 text-right">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 text-center">
                  Ejemplo renderizado para: <strong className="text-white">{previewData?.sampleLead?.name || 'Don Juan'}</strong> ({previewData?.recipientCount || 0} destinatarios en este segmento)
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="lg:col-span-12 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] text-slate-300 text-xs font-semibold transition"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
                >
                  <Send size={14} />
                  <span>{formData.scheduledAt ? 'Programar Difusión' : 'Crear Campaña'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Logs de Envíos */}
      {selectedLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#111b21] border border-slate-700 rounded-3xl w-full max-w-xl max-h-[80vh] overflow-y-auto shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText size={16} className="text-emerald-400" />
                Registro de Envíos: "{selectedLogsModal.name}"
              </h3>
              <button
                onClick={() => setSelectedLogsModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {(selectedLogsModal.logs || []).map((log, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#182229] border border-slate-800"
                >
                  <div>
                    <div className="font-bold text-white">{log.name || 'Cliente'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.jid}</div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      log.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {log.status === 'sent' ? '✓ Enviado' : '✕ Fallido'}
                    </span>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      {new Date(log.time).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
