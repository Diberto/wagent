import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, X, Check,
  Globe, Smartphone, Calendar, RefreshCw,
  Copy, Eye, EyeOff, Search, Percent, DollarSign
} from 'lucide-react';

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  minOrderAmount: '',
  maxUses: '',
  isActive: true,
  startDate: '',
  startTime: '00:00',
  endDate: '',
  endTime: '23:59',
  appliesTo: 'all',
};

const FMT = (n) => Number(n || 0).toLocaleString('es-AR');

export default function CouponsView({ apiBaseUrl = '' }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncMsg, setSyncMsg] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [validateCode, setValidateCode] = useState('');
  const [validateAmount, setValidateAmount] = useState('');
  const [validateResult, setValidateResult] = useState(null);
  const [validating, setValidating] = useState(false);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/coupons`);
      if (res.ok) setCoupons(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiBaseUrl]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const showMsg = (type, text) => {
    setSyncMsg({ type, text });
    setTimeout(() => setSyncMsg(null), 4000);
  };

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setIsModalOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code || '',
      description: c.description || '',
      discountType: c.discountType || 'percent',
      discountValue: c.discountValue ?? '',
      minOrderAmount: c.minOrderAmount || '',
      maxUses: c.maxUses ?? '',
      isActive: c.isActive !== false,
      startDate: c.startDate || '',
      startTime: c.startTime || '00:00',
      endDate: c.endDate || '',
      endTime: c.endTime || '23:59',
      appliesTo: c.appliesTo || 'all',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        discountValue: Number(form.discountValue) || 0,
        minOrderAmount: form.minOrderAmount !== '' ? Number(form.minOrderAmount) : 0,
        maxUses: form.maxUses !== '' ? Number(form.maxUses) : null,
      };
      const url = editingId ? `${apiBaseUrl}/api/coupons/${editingId}` : `${apiBaseUrl}/api/coupons`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('success', `Cupon ${editingId ? 'actualizado' : 'creado'} correctamente`);
        setIsModalOpen(false);
        fetchCoupons();
      } else {
        showMsg('error', data.error || 'Error al guardar');
      }
    } catch (err) {
      showMsg('error', 'Error de conexion');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, code) => {
    if (!window.confirm(`Eliminar el cupon "${code}"?`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/coupons/${id}`, { method: 'DELETE' });
      if (res.ok) { setCoupons(prev => prev.filter(c => c.id !== id)); showMsg('success', `Cupon "${code}" eliminado`); }
    } catch (err) { showMsg('error', 'Error al eliminar'); }
  };

  const handleToggleActive = async (c) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/coupons/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c, isActive: !c.isActive })
      });
      if (res.ok) {
        setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !x.isActive } : x));
        showMsg('success', `Cupon ${!c.isActive ? 'activado' : 'desactivado'}`);
      }
    } catch (err) { showMsg('error', 'Error'); }
  };

  const handleValidate = async () => {
    if (!validateCode.trim()) return;
    setValidating(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validateCode.trim(), orderAmount: Number(validateAmount) || 0, channel: 'all' })
      });
      setValidateResult(await res.json());
    } catch (err) { setValidateResult({ valid: false, error: 'Error de conexion' }); }
    finally { setValidating(false); }
  };

  const isExpired = (c) => c.endDate && new Date() > new Date(`${c.endDate}T${c.endTime || '23:59'}:59`);
  const isNotStarted = (c) => c.startDate && new Date() < new Date(`${c.startDate}T${c.startTime || '00:00'}:00`);

  const statusBadge = (c) => {
    if (!c.isActive) return { text: 'Inactivo', color: 'bg-slate-700 text-slate-400' };
    if (isExpired(c)) return { text: 'Expirado', color: 'bg-rose-500/20 text-rose-400' };
    if (isNotStarted(c)) return { text: 'Pendiente', color: 'bg-amber-500/20 text-amber-400' };
    if (c.maxUses != null && c.usedCount >= c.maxUses) return { text: 'Agotado', color: 'bg-orange-500/20 text-orange-400' };
    return { text: 'Activo', color: 'bg-emerald-500/20 text-emerald-400' };
  };

  const inputCls = "w-full px-3 py-2 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500";
  const filtered = coupons.filter(c =>
    c.code?.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] h-full overflow-hidden text-slate-200">
      {syncMsg && (
        <div className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${syncMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
          {syncMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{syncMsg.text}</span>
        </div>
      )}

      <div className="bg-[#111b21] border-b border-[#222e35] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-400" />
            Cupones de Descuento
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {coupons.length} cupones creados &middot; {coupons.filter(c => c.isActive && !isExpired(c) && !isNotStarted(c)).length} activos ahora
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCoupons} className="p-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-400 hover:text-white transition">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 transition">
            <Plus className="w-4 h-4" /> Nuevo Cupon
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Validador */}
        <div className="bg-[#111b21] border border-slate-700/60 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5"><Tag size={13} /> Probar Cupon</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] text-slate-400 block mb-1">Codigo</label>
              <input type="text" placeholder="Ej: DESCUENTO20" value={validateCode}
                onChange={(e) => { setValidateCode(e.target.value.toUpperCase()); setValidateResult(null); }}
                className={inputCls} />
            </div>
            <div className="w-36">
              <label className="text-[10px] text-slate-400 block mb-1">Monto pedido ($)</label>
              <input type="number" placeholder="0" value={validateAmount} onChange={(e) => setValidateAmount(e.target.value)} className={inputCls} />
            </div>
            <button onClick={handleValidate} disabled={validating || !validateCode.trim()}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition disabled:opacity-50">
              {validating ? '...' : 'Validar'}
            </button>
          </div>
          {validateResult && (
            <div className={`p-3 rounded-xl text-xs border ${validateResult.valid ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
              {validateResult.valid ? (
                <div className="space-y-0.5">
                  <p className="font-bold">Cupon valido: {validateResult.message}</p>
                  <p>Descuento: <strong>${FMT(validateResult.discountAmount)}</strong> &middot; Total final: <strong>${FMT(validateResult.finalAmount)}</strong></p>
                </div>
              ) : <p>Error: {validateResult.error}</p>}
            </div>
          )}
        </div>

        {/* Busqueda */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Buscar cupones..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#111b21] border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-10 text-slate-500 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Tag className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-slate-500 text-sm">No hay cupones creados</p>
            <button onClick={openCreate} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition">Crear primer cupon</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(c => {
              const status = statusBadge(c);
              return (
                <div key={c.id} className="bg-[#111b21] border border-slate-700/60 rounded-2xl p-4 space-y-3 hover:border-slate-600 transition group">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-white tracking-widest" style={{ fontFamily: 'monospace' }}>{c.code}</span>
                        <button onClick={() => navigator.clipboard.writeText(c.code).catch(()=>{})} className="text-slate-500 hover:text-emerald-400 transition opacity-0 group-hover:opacity-100">
                          <Copy size={12} />
                        </button>
                      </div>
                      {c.description && <p className="text-[11px] text-slate-400">{c.description}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.color}`}>{status.text}</span>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 bg-[#182229] rounded-xl">
                    {c.discountType === 'percent' ? <Percent size={16} className="text-emerald-400" /> : <DollarSign size={16} className="text-sky-400" />}
                    <span className="text-sm font-extrabold text-white">
                      {c.discountType === 'percent' ? `${c.discountValue}% de descuento` : `$${FMT(c.discountValue)} de descuento`}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-1">
                    {c.minOrderAmount > 0 && <p>Minimo: <span className="text-slate-300 font-semibold">${FMT(c.minOrderAmount)}</span></p>}
                    <p>Usos: <span className="text-slate-300 font-semibold">{c.usedCount || 0}{c.maxUses != null ? `/${c.maxUses}` : ' (ilimitado)'}</span></p>
                    {c.appliesTo !== 'all' && (
                      <p className="flex items-center gap-1">
                        {c.appliesTo === 'web' ? <Globe size={10} /> : <Smartphone size={10} />}
                        Solo {c.appliesTo === 'web' ? 'Tienda Web' : 'WhatsApp'}
                      </p>
                    )}
                    {(c.startDate || c.endDate) && (
                      <p className="flex items-center gap-1">
                        <Calendar size={10} />
                        {c.startDate ? `Desde ${c.startDate} ${c.startTime}` : ''}
                        {c.startDate && c.endDate ? ' - ' : ''}
                        {c.endDate ? `Hasta ${c.endDate} ${c.endTime}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button onClick={() => handleToggleActive(c)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${c.isActive ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}>
                      {c.isActive ? <><EyeOff size={10} /> Desactivar</> : <><Eye size={10} /> Activar</>}
                    </button>
                    <button onClick={() => openEdit(c)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition">
                      <Edit3 size={10} /> Editar
                    </button>
                    <button onClick={() => handleDelete(c.id, c.code)} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-700/50 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><Tag size={20} /></div>
                <div>
                  <h3 className="text-base font-extrabold text-white">{editingId ? 'Editar Cupon' : 'Nuevo Cupon'}</h3>
                  <p className="text-[11px] text-slate-400">Configura las condiciones del descuento</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Codigo *</label>
                  <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase().replace(/\s+/g, '') }))}
                    placeholder="Ej: VERANO25" className={inputCls} required style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Aplica en</label>
                  <select value={form.appliesTo} onChange={(e) => setForm(p => ({ ...p, appliesTo: e.target.value }))} className={inputCls}>
                    <option value="all">Todos los canales</option>
                    <option value="web">Solo Tienda Web</option>
                    <option value="whatsapp">Solo WhatsApp</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Descripcion</label>
                <input value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripcion opcional" className={inputCls} />
              </div>
              <div className="p-3 bg-[#111b21] rounded-2xl border border-slate-700 space-y-3">
                <label className="block text-[10px] text-slate-400 font-semibold uppercase">Tipo de Descuento *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'percent', label: 'Porcentaje (%)', icon: <Percent size={13} /> }, { value: 'fixed', label: 'Monto Fijo ($)', icon: <DollarSign size={13} /> }].map(opt => (
                    <label key={opt.value} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${form.discountType === opt.value ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-[#0b141a] text-slate-400'}`}>
                      <input type="radio" name="discountType" value={opt.value} checked={form.discountType === opt.value}
                        onChange={() => setForm(p => ({ ...p, discountType: opt.value }))} className="accent-emerald-500" />
                      {opt.icon}{opt.label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Valor {form.discountType === 'percent' ? '(%)' : '($)'} *</label>
                  <input type="number" min="0" step="0.01" value={form.discountValue} onChange={(e) => setForm(p => ({ ...p, discountValue: e.target.value }))}
                    placeholder={form.discountType === 'percent' ? 'Ej: 20' : 'Ej: 5000'} className={inputCls} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Monto minimo ($)</label>
                  <input type="number" min="0" value={form.minOrderAmount} onChange={(e) => setForm(p => ({ ...p, minOrderAmount: e.target.value }))} placeholder="0 = sin minimo" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Max usos</label>
                  <input type="number" min="1" value={form.maxUses} onChange={(e) => setForm(p => ({ ...p, maxUses: e.target.value }))} placeholder="Vacio = ilimitado" className={inputCls} />
                </div>
              </div>
              <div className="p-3 bg-[#111b21] rounded-2xl border border-slate-700 space-y-3">
                <label className="block text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1.5"><Calendar size={11} /> Vigencia (opcional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] text-slate-500 mb-1">Fecha inicio</label><input type="date" value={form.startDate} onChange={(e) => setForm(p => ({ ...p, startDate: e.target.value }))} className={inputCls} /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Hora inicio</label><input type="time" value={form.startTime} onChange={(e) => setForm(p => ({ ...p, startTime: e.target.value }))} className={inputCls} /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Fecha fin</label><input type="date" value={form.endDate} onChange={(e) => setForm(p => ({ ...p, endDate: e.target.value }))} className={inputCls} /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Hora fin</label><input type="time" value={form.endTime} onChange={(e) => setForm(p => ({ ...p, endTime: e.target.value }))} className={inputCls} /></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#111b21] rounded-2xl border border-slate-700">
                <div><span className="font-bold text-white block">Cupon Activo</span><span className="text-[10px] text-slate-400">Disponible para usar si esta activo y en vigencia</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl bg-[#111b21] text-slate-400 hover:text-white border border-slate-800">Cancelar</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition disabled:opacity-50">
                  <Check size={14} />{saving ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Cupon')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
