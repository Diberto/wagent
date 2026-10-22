import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Crown, 
  Sparkles, 
  Gift, 
  Users, 
  TrendingUp, 
  Send, 
  Check, 
  Plus, 
  Settings2, 
  ArrowRight, 
  RefreshCw, 
  DollarSign, 
  MessageSquare,
  AlertCircle,
  Clock,
  History,
  ShieldCheck,
  ChevronRight,
  User
} from 'lucide-react';

export default function LoyaltyView({ socket }) {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'tiers' | 'broadcast' | 'movements'
  
  // Campaña WhatsApp segmentada
  const [selectedTierForBroadcast, setSelectedTierForBroadcast] = useState('all');
  const [broadcastMessage, setBroadcastMessage] = useState(
    '🎉 ¡Hola {nombre}! Como cliente destacado en nuestro programa de puntos, queremos premiarte hoy con un beneficio exclusivo. ¡Escribinos para aprovecharlo!'
  );
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  // Modal ajuste manual
  const [adjustModal, setAdjustModal] = useState({ open: false, customerId: '', points: 50, type: 'BONUS', reason: '' });
  const [customers, setCustomers] = useState([]);
  const [adjustSuccess, setAdjustSuccess] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/loyalty/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching loyalty stats:', e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/loyalty/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error('Error fetching loyalty config:', e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error fetching customers:', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchConfig(), fetchCustomers()]);
      setLoading(false);
    };
    init();

    if (socket) {
      socket.on('loyalty:points-earned', () => { fetchStats(); });
      socket.on('loyalty:points-redeemed', () => { fetchStats(); });
      socket.on('loyalty:points-adjusted', () => { fetchStats(); });
      socket.on('loyalty:config-update', (updated) => { setConfig(updated); fetchStats(); });
    }

    return () => {
      if (socket) {
        socket.off('loyalty:points-earned');
        socket.off('loyalty:points-redeemed');
        socket.off('loyalty:points-adjusted');
        socket.off('loyalty:config-update');
      }
    };
  }, [socket]);

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/loyalty/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch (e) {
      console.error('Error saving config:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setIsSendingBroadcast(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/loyalty/broadcast-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: selectedTierForBroadcast,
          message: broadcastMessage
        })
      });
      const data = await res.json();
      setBroadcastResult(data);
    } catch (err) {
      setBroadcastResult({ error: err.message });
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleExecuteAdjust = async () => {
    if (!adjustModal.customerId || !adjustModal.points) return;
    try {
      const res = await fetch('/api/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustModal)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdjustSuccess(`Puntos asignados correctamente a ${data.loyalty?.customerName}`);
        fetchStats();
        setTimeout(() => {
          setAdjustModal({ open: false, customerId: '', points: 50, type: 'BONUS', reason: '' });
          setAdjustSuccess(null);
        }, 1500);
      } else {
        alert(data.error || 'Error al ajustar puntos');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-slate-950 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
        <span>Cargando Programa de Fidelización...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/5">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Club de Fidelización & Puntos
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Activo
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Segmentación inteligente por niveles (Bronce, Plata, Oro, Platino), ledger inmutable y WhatsApp automático
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs y Acción Rápida */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'overview' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('tiers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'tiers' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Niveles & Reglas
            </button>
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'portal' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Formulario /micuenta
            </button>
            <button
              onClick={() => setActiveTab('broadcast')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'broadcast' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Campañas WhatsApp
            </button>
          </div>

          <button
            onClick={() => setAdjustModal({ open: true, customerId: customers[0]?.id || '', points: 100, type: 'BONUS', reason: 'Bono de fidelidad' })}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Otorgar Bono
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Clientes en el Club</span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">
              {stats?.activeMembersCount || 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">Acumulando puntos activamente</p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Puntos Emitidos</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">
              {(stats?.totalPointsIssued || 0).toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-slate-500 mt-1">Por compras y bonificaciones</p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Puntos Canjeados</span>
              <Gift className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">
              {(stats?.totalPointsRedeemed || 0).toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-slate-500 mt-1">Descuentos efectivos otorgados</p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Puntos Circulantes</span>
              <Award className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-indigo-400">
              {(stats?.currentOutstandingPoints || 0).toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-slate-500 mt-1">Disponibles para próximos canjes</p>
          </div>
        </div>

        {/* TAB 1: OVERVIEW & TIERS DISTRIBUTION */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Tiers distribution breakdown */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Segmentación de la Comunidad por Categoría
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {(stats?.tierDistribution || []).map((tier) => (
                  <div
                    key={tier.id}
                    className="p-5 rounded-xl border relative overflow-hidden transition-all hover:scale-[1.02]"
                    style={{
                      borderColor: `${tier.badgeColor}40`,
                      background: `linear-gradient(135deg, ${tier.badgeColor}10, transparent)`
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ color: tier.badgeColor, backgroundColor: `${tier.badgeColor}20` }}>
                        {tier.name}
                      </span>
                      <Award className="w-5 h-5" style={{ color: tier.badgeColor }} />
                    </div>
                    <div className="text-2xl font-black text-white">
                      {tier.count || 0} <span className="text-xs font-normal text-slate-400">clientes</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-400 space-y-1">
                      <p>• Gasto mínimo: <strong className="text-slate-200">${tier.minSpend.toLocaleString('es-AR')}</strong></p>
                      <p>• Multiplicador: <strong className="text-slate-200">x{tier.pointsMultiplier} puntos</strong></p>
                      <p>• Descuento directo: <strong className="text-emerald-400">{tier.discountPercentage}% OFF</strong></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent movements ledger */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                Ledger de Movimientos Recientes
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Descripción</th>
                      <th className="py-3 px-4 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(stats?.recentMovements || []).length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center py-8 text-slate-500">
                          Aún no hay transacciones en el programa de puntos.
                        </td>
                      </tr>
                    ) : (
                      stats?.recentMovements.map((mov) => (
                        <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 text-xs text-slate-400">
                            {new Date(mov.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              mov.type === 'EARN' ? 'bg-amber-500/20 text-amber-400' :
                              mov.type === 'REDEEM' ? 'bg-emerald-500/20 text-emerald-400' :
                              'bg-indigo-500/20 text-indigo-400'
                            }`}>
                              {mov.type === 'EARN' ? 'COMPRA' : mov.type === 'REDEEM' ? 'CANJE' : 'BONO'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300">{mov.description}</td>
                          <td className={`py-3 px-4 text-right font-bold ${
                            mov.type === 'REDEEM' ? 'text-rose-400' : 'text-emerald-400'
                          }`}>
                            {mov.type === 'REDEEM' ? `-${mov.points}` : `+${mov.points}`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TIERS & REGLAS */}
        {activeTab === 'tiers' && config && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Reglas Globales de Conversión</h2>
                  <p className="text-xs text-slate-400">Configura cuántos puntos equivale cada peso y su valor de canje.</p>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar Cambios
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Puntos ganados por cada $1 gastado
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.pointsPerCurrencyUnit}
                    onChange={(e) => setConfig({ ...config, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ej: 0.1 significa 1 punto cada $10 gastados.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor de canje ($ por cada punto)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.currencyPerPointRedemption}
                    onChange={(e) => setConfig({ ...config, currencyPerPointRedemption: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ej: 1 significa que 100 puntos = $100 de descuento.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Canje mínimo permitido (puntos)
                  </label>
                  <input
                    type="number"
                    value={config.minPointsToRedeem}
                    onChange={(e) => setConfig({ ...config, minPointsToRedeem: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Mínimo para habilitar descuento en caja.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Vigencia de los puntos (Días hasta expirar)
                  </label>
                  <input
                    type="number"
                    value={config.pointsExpiryDays || 180}
                    onChange={(e) => setConfig({ ...config, pointsExpiryDays: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Los puntos caducan automáticamente tras este período.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-400" />
                    Bono por registro inicial (/micuenta)
                  </label>
                  <input
                    type="number"
                    value={config.welcomeBonusPoints || 100}
                    onChange={(e) => setConfig({ ...config, welcomeBonusPoints: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Puntos que recibe el cliente al unirse al Club.</p>
                </div>
              </div>

              {/* Tiers detail editor */}
              <div className="pt-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">Niveles de Membresía</h3>
                <div className="space-y-3">
                  {config.tiers.map((t, idx) => (
                    <div key={t.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.badgeColor }} />
                        <div>
                          <strong className="text-white text-sm">{t.name}</strong>
                          <span className="text-xs text-slate-400 block">ID: {t.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Gasto Mínimo ($)</span>
                          <input
                            type="number"
                            value={t.minSpend}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].minSpend = parseFloat(e.target.value) || 0;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">Multiplicador</span>
                          <input
                            type="number"
                            step="0.05"
                            value={t.pointsMultiplier}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].pointsMultiplier = parseFloat(e.target.value) || 1;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">% Descuento</span>
                          <input
                            type="number"
                            value={t.discountPercentage}
                            onChange={(e) => {
                              const updatedTiers = [...config.tiers];
                              updatedTiers[idx].discountPercentage = parseFloat(e.target.value) || 0;
                              setConfig({ ...config, tiers: updatedTiers });
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONFIGURADOR FORMULARIO /micuenta */}
        {activeTab === 'portal' && config && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-400" />
                  Personalización del Formulario de Ingreso (/micuenta)
                </h2>
                <p className="text-xs text-slate-400">
                  Activá o desactivá los campos que se le solicitarán al cliente la primera vez que ingrese al Club.
                </p>
              </div>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar Formulario
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                  Campos del Formulario para Nuevos Miembros
                </span>

                <div className="space-y-2.5">
                  {(config.registrationFormConfig?.fields || []).map((field, idx) => (
                    <div 
                      key={field.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={field.enabled !== false}
                          disabled={field.id === 'phone' || field.id === 'name'}
                          onChange={(e) => {
                            const updatedFields = [...config.registrationFormConfig.fields];
                            updatedFields[idx].enabled = e.target.checked;
                            setConfig({
                              ...config,
                              registrationFormConfig: {
                                ...config.registrationFormConfig,
                                fields: updatedFields
                              }
                            });
                          }}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                        />
                        <div>
                          <strong className="text-sm text-white">{field.label}</strong>
                          <span className="text-xs text-slate-500 block">
                            Tipo: <code className="text-amber-400">{field.type}</code> &middot; 
                            {field.required ? ' Obligatorio' : ' Opcional'}
                            {field.optionsSource === 'branches' && ' (Toma las sucursales activas del sistema)'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-400 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            disabled={field.id === 'phone' || field.id === 'name'}
                            onChange={(e) => {
                              const updatedFields = [...config.registrationFormConfig.fields];
                              updatedFields[idx].required = e.target.checked;
                              setConfig({
                                ...config,
                                registrationFormConfig: {
                                  ...config.registrationFormConfig,
                                  fields: updatedFields
                                }
                              });
                            }}
                            className="w-3.5 h-3.5 rounded text-amber-500"
                          />
                          Obligatorio
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
                <div>
                  <strong>Link público para tus clientes:</strong>
                  <p className="text-slate-300 mt-0.5">Podés compartir <code className="text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded">/micuenta</code> en tus mensajes de WhatsApp y redes sociales.</p>
                </div>
                <a
                  href="/micuenta"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Abrir /micuenta ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CAMPAÑAS WHATSAPP */}
        {activeTab === 'broadcast' && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                Difusión WhatsApp Segmentada por Nivel
              </h2>
              <p className="text-xs text-slate-400">
                Envía promociones exclusivas a clientes Plata, Oro o Platino con personalización automática de nombre.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Seleccionar Audiencia / Nivel Objetivo
                </label>
                <select
                  value={selectedTierForBroadcast}
                  onChange={(e) => setSelectedTierForBroadcast(e.target.value)}
                  className="w-full md:w-80 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">🌟 Todos los Miembros del Club</option>
                  {(config?.tiers || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      🎖️ Nivel {t.name} (Descuento {t.discountPercentage}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mensaje de la Campaña (Usa <code className="text-amber-400">{'{nombre}'}</code> para personalizar)
                </label>
                <textarea
                  rows="5"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-sm focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              {broadcastResult && (
                <div className={`p-4 rounded-xl border text-sm ${
                  broadcastResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  {broadcastResult.message || broadcastResult.error}
                </div>
              )}

              <button
                onClick={handleSendBroadcast}
                disabled={isSendingBroadcast}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {isSendingBroadcast ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Campaña por WhatsApp...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Lanzar Campaña por WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Ajuste / Bono Manual */}
      {adjustModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              Otorgar Puntos o Bono
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Cliente</label>
              <select
                value={adjustModal.customerId}
                onChange={(e) => setAdjustModal({ ...adjustModal, customerId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Sin nombre'} ({c.phone || c.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Cantidad de Puntos</label>
              <input
                type="number"
                value={adjustModal.points}
                onChange={(e) => setAdjustModal({ ...adjustModal, points: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo</label>
              <input
                type="text"
                placeholder="Ej. Cumpleaños, Compensación, Bono bienvenida"
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
              />
            </div>

            {adjustSuccess && (
              <p className="text-xs text-emerald-400 font-semibold">{adjustSuccess}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setAdjustModal({ ...adjustModal, open: false })}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteAdjust}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
              >
                Confirmar Asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
