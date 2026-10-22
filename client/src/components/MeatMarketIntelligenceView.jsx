import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  Calculator,
  ArrowRightLeft,
  Sparkles,
  RefreshCw,
  Check,
  AlertCircle,
  HelpCircle,
  DollarSign,
  Layers,
  Scale,
  Percent,
  Sliders,
  Store,
  ChevronRight,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Globe,
  FileSpreadsheet,
  PieChart
} from 'lucide-react';

export default function MeatMarketIntelligenceView({ socket, currentUser }) {
  const [activeTab, setActiveTab] = useState('pulse'); // 'pulse' | 'mag' | 'retail' | 'yield' | 'optimizer' | 'fob'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Estado de Calculadora de Desposte
  const [carcassWeight, setCarcassWeight] = useState(115);
  const [customCostGancho, setCustomCostGancho] = useState('');
  const [yieldResult, setYieldResult] = useState(null);
  const [calculatingYield, setCalculatingYield] = useState(false);

  // Estado del Optimizador de Precios
  const [optCategory, setOptCategory] = useState('Carne Vacuna');
  const [optPercent, setOptPercent] = useState(2.5);
  const [optRoundTo, setOptRoundTo] = useState(50);
  const [applyingPriceChange, setApplyingPriceChange] = useState(false);
  const [priceChangeResult, setPriceChangeResult] = useState(null);

  const fetchMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/market/overview');
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (!customCostGancho && json.livestock?.estimatedCarcassCostPerKg) {
          setCustomCostGancho(json.livestock.estimatedCarcassCostPerKg);
        }
      } else {
        setError(json.error || 'No se pudieron obtener los datos de mercado');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();

    if (socket && typeof socket.on === 'function') {
      const handleUpdate = () => fetchMarketData();
      socket.on('market:updated', handleUpdate);
      socket.on('catalog:updated', handleUpdate);
      return () => {
        socket.off('market:updated', handleUpdate);
        socket.off('catalog:updated', handleUpdate);
      };
    }
  }, [socket]);

  // Ejecutar cálculo de rinde cuando cambian los inputs
  const runYieldCalculation = async (weight, cost) => {
    try {
      setCalculatingYield(true);
      const res = await fetch('/api/market/yield-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carcassWeightKg: Number(weight) || 115,
          costPerKgGancho: cost ? Number(cost) : null
        })
      });
      const json = await res.json();
      if (json.success) {
        setYieldResult(json.result);
      }
    } catch (e) {
      console.error('Error calculando desposte:', e);
    } finally {
      setCalculatingYield(false);
    }
  };

  useEffect(() => {
    if (data?.livestock) {
      const cost = customCostGancho || data.livestock.estimatedCarcassCostPerKg;
      runYieldCalculation(carcassWeight, cost);
    }
  }, [carcassWeight, customCostGancho, data?.livestock]);

  // Aplicar ajuste masivo de precios
  const handleApplyPriceAdjustment = async () => {
    if (!confirm(`¿Confirma aplicar un ajuste del ${optPercent > 0 ? '+' : ''}${optPercent}% a los productos de "${optCategory}"?`)) {
      return;
    }

    try {
      setApplyingPriceChange(true);
      setPriceChangeResult(null);
      const res = await fetch('/api/market/apply-price-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: optCategory,
          adjustmentType: 'percentage',
          value: Number(optPercent),
          roundTo: Number(optRoundTo),
          appliedBy: currentUser?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (json.success) {
        setPriceChangeResult(json);
        fetchMarketData();
      } else {
        alert(json.error || 'Error al aplicar actualización de precios');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setApplyingPriceChange(false);
    }
  };

  const mag = data?.livestock || {};
  const macro = data?.macro || {};
  const retail = data?.retail || {};
  const fob = data?.fob || {};

  return (
    <div className="flex flex-col h-full bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      {/* Encabezado Superior */}
      <header className="px-6 py-4 bg-[#111b21] border-b border-[#202c33] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-orange-600 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-950/40">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white">Mercado de Carnes & Inteligencia de Precios</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MAG / CAÑUELAS & IPC EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cotizaciones de hacienda en pie, benchmark minorista vs supermercados, calculadora de rinde de media res e inflación INDEC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMarketData}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar Cotizaciones</span>
          </button>
        </div>
      </header>

      {/* Barra de Sub-Navegación */}
      <div className="px-6 bg-[#111b21] border-b border-[#202c33] flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('pulse')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'pulse'
              ? 'border-amber-500 text-amber-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <BarChart3 size={15} />
          <span>Tablero de Mercado (Market Pulse)</span>
        </button>

        <button
          onClick={() => setActiveTab('mag')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'mag'
              ? 'border-orange-500 text-orange-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Scale size={15} />
          <span>Mercado Ganadero MAG ({mag.totalHeadsEntered ? `${mag.totalHeadsEntered.toLocaleString()} cabezas` : 'Cañuelas'})</span>
        </button>

        <button
          onClick={() => setActiveTab('retail')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'retail'
              ? 'border-emerald-500 text-emerald-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Store size={15} />
          <span>Benchmark vs Supermercados ({retail.matchedInCatalog || 0} cortes)</span>
        </button>

        <button
          onClick={() => setActiveTab('yield')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'yield'
              ? 'border-blue-500 text-blue-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Calculator size={15} />
          <span>Calculadora Rinde Media Res</span>
        </button>

        <button
          onClick={() => setActiveTab('optimizer')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'optimizer'
              ? 'border-purple-500 text-purple-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Sparkles size={15} />
          <span>Optimizador de Precios al Catálogo</span>
        </button>

        <button
          onClick={() => setActiveTab('fob')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'fob'
              ? 'border-cyan-500 text-cyan-400 bg-[#182229]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]/50'
          }`}
        >
          <Globe size={15} />
          <span>Exportación & FOB Oficial</span>
        </button>
      </div>

      {/* Contenido Principal con Scroll */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

        {/* ================================================================= */}
        {/* TAB 1: MARKET PULSE (RESUMEN GENERAL)                             */}
        {/* ================================================================= */}
        {activeTab === 'pulse' && (
          <div className="space-y-6">
            {/* 4 KPIs Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* KPI 1: INMAG Novillo */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Índice Novillo (INMAG)</span>
                  <Scale size={18} className="text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white font-mono">
                    ${mag.inmagIndex ? mag.inmagIndex.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '2.345,50'}
                  </span>
                  <span className="text-xs text-slate-400">/kg vivo</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <ArrowUpRight size={14} />
                  <span>+{mag.inmagChangePct || 1.85}% en Cañuelas</span>
                </div>
              </div>

              {/* KPI 2: Costo Kilo Gancho Media Res */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Costo Kilo Gancho Estimado</span>
                  <DollarSign size={18} className="text-blue-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white font-mono">
                    ${mag.estimatedCarcassCostPerKg ? mag.estimatedCarcassCostPerKg.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '4.259,13'}
                  </span>
                  <span className="text-xs text-slate-400">/kg media res</span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Rinde 57.5% + flete faena frigorífica
                </div>
              </div>

              {/* KPI 3: Inflación Alimentos INDEC */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">IPC Alimentos (INDEC)</span>
                  <Percent size={18} className="text-purple-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white font-mono">
                    +{macro.meatCategoryInflationEst || 2.2}%
                  </span>
                  <span className="text-xs text-slate-400">mensual</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Nivel General: +{macro.monthlyInflation?.current || 1.9}% (Interanual {macro.yearlyInflation?.current || 33.4}%)
                </div>
              </div>

              {/* KPI 4: Competitividad Minorista */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Brecha vs Supermercados</span>
                  <Store size={18} className="text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black font-mono ${
                    (retail.summary?.avgGapPct || 0) <= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {retail.summary?.avgGapPct !== undefined ? `${retail.summary.avgGapPct > 0 ? '+' : ''}${retail.summary.avgGapPct}%` : '-5.8%'}
                  </span>
                  <span className="text-xs text-slate-400">promedio</span>
                </div>
                <div className="text-[11px] text-emerald-300 font-semibold truncate">
                  {retail.summary?.overallCompetitiveness || 'Muy Competitivo en Mostrador'}
                </div>
              </div>

            </div>

            {/* Dos Paneles Centrales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Panel Izquierdo: Resumen Rápido MAG Cañuelas */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scale size={18} className="text-amber-400" />
                    Principales Categorías en Cañuelas (Kilo Vivo)
                  </h3>
                  <button
                    onClick={() => setActiveTab('mag')}
                    className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>Ver Detalle</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="space-y-2">
                  {(mag.categories || []).slice(0, 5).map(cat => (
                    <div key={cat.category} className="p-3 rounded-xl bg-[#0b141a] border border-[#202c33] flex items-center justify-between text-xs">
                      <div className="font-semibold text-slate-200">{cat.category}</div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-white font-bold">${cat.avg.toLocaleString('es-AR')}/kg</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                          cat.changePct > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                          cat.changePct < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {cat.changePct > 0 ? <ArrowUpRight size={11} /> : cat.changePct < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
                          <span>{cat.changePct > 0 ? `+${cat.changePct}%` : `${cat.changePct}%`}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel Derecho: Cortes Clave vs Supermercados */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Store size={18} className="text-emerald-400" />
                    Cortes Populares: WAgent vs Coto/Carrefour
                  </h3>
                  <button
                    onClick={() => setActiveTab('retail')}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>Ver Tabla Completa</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="space-y-2">
                  {(retail.cuts || []).slice(0, 5).map(cut => {
                    const diff = cut.priceDiffPct;
                    return (
                      <div key={cut.cutName} className="p-3 rounded-xl bg-[#0b141a] border border-[#202c33] flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{cut.cutName}</div>
                          <div className="text-[10px] text-slate-400">Supermercados: ${cut.benchmarkAvg.toLocaleString('es-AR')}/kg</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-emerald-400 font-bold">
                            {cut.wagentPrice ? `$${cut.wagentPrice.toLocaleString('es-AR')}/kg` : 'No asignado'}
                          </div>
                          {diff !== null && (
                            <span className={`text-[10px] font-bold ${
                              diff < 0 ? 'text-emerald-400' : diff > 0 ? 'text-rose-400' : 'text-slate-400'
                            }`}>
                              {diff < 0 ? `${diff}% más barato` : diff > 0 ? `+${diff}% más caro` : 'En paridad'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Banner Informativo y Accesos Directos */}
            <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-500/30 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calculator size={18} className="text-blue-400" />
                  Simulador de Rendimiento y Desposte de Gancho
                </h4>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  ¿Compraste medias reses hoy? Calcula exactamente cuántos kilos de Asado, Vacío, Nalga y Lomo obtendrás, el costo unitario por kilo y la ganancia bruta neta según los precios vigentes en el POS y mostrador de WAgent.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('yield')}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-950/50 shrink-0"
              >
                <span>Abrir Calculadora de Desposte</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: MERCADO GANADERO (MAG / CAÑUELAS)                          */}
        {/* ================================================================= */}
        {activeTab === 'mag' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{mag.marketName || 'Mercado Agroganadero de Cañuelas'}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                      Fecha: {mag.date || 'Hoy'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Precios corrientes de hacienda en pie expresados en pesos argentinos ($/kg vivo) y cálculo automático de kilo gancho.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#0b141a] border border-[#202c33] text-right font-mono">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Total Cabezas Ingresadas</div>
                  <div className="text-lg font-bold text-white">{mag.totalHeadsEntered?.toLocaleString() || '9.420'}</div>
                </div>
              </div>

              {/* Fórmula Kilo Gancho */}
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-3">
                <ShieldCheck size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-amber-300">Fórmula de Conversión a Kilo Gancho (Media Res Frigorífica):</div>
                  <div className="text-slate-300 font-mono text-[11px]">{mag.formulaExplanation}</div>
                </div>
              </div>
            </div>

            {/* Tabla Detallada por Categoría */}
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] overflow-hidden">
              <div className="p-4 border-b border-[#202c33] flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Cotizaciones de Hacienda por Categoría y Peso
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#202c33] text-slate-400 bg-[#0b141a]">
                      <th className="p-3.5 font-bold">Categoría Ganadera</th>
                      <th className="p-3.5 font-bold">Mínimo ($/kg)</th>
                      <th className="p-3.5 font-bold">Promedio ($/kg)</th>
                      <th className="p-3.5 font-bold">Máximo ($/kg)</th>
                      <th className="p-3.5 font-bold">Kilo Gancho Est.</th>
                      <th className="p-3.5 font-bold text-right">Variación Diaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {(mag.categories || []).map(cat => {
                      const estGancho = Number(((cat.avg / (mag.carcassConversionFactor || 0.575)) + (mag.freightSlaughterCostPerKg || 180)).toFixed(0));
                      return (
                        <tr key={cat.category} className="hover:bg-[#182229]/50 transition">
                          <td className="p-3.5 font-bold text-white">{cat.category}</td>
                          <td className="p-3.5 font-mono text-slate-400">${cat.min.toLocaleString('es-AR')}</td>
                          <td className="p-3.5 font-mono text-amber-400 font-bold">${cat.avg.toLocaleString('es-AR')}</td>
                          <td className="p-3.5 font-mono text-slate-300">${cat.max.toLocaleString('es-AR')}</td>
                          <td className="p-3.5 font-mono text-blue-300 font-bold">${estGancho.toLocaleString('es-AR')}</td>
                          <td className="p-3.5 text-right">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              cat.changePct > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                              cat.changePct < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {cat.changePct > 0 ? `+${cat.changePct}%` : `${cat.changePct}%`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: BENCHMARK MINORISTA (WAGENT VS SUPERMERCADOS)              */}
        {/* ================================================================= */}
        {activeTab === 'retail' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Store size={18} className="text-emerald-400" />
                  Comparativa de Precios al Consumidor en Mostrador
                </h3>
                <p className="text-xs text-slate-300">
                  Compara los precios por kilo de tus cortes en WAgent contra las principales cadenas de supermercados (Coto, Carrefour, Jumbo, Día).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {retail.summary?.cheaperCount || 0} cortes más baratos que el super
                </span>
              </div>
            </div>

            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#202c33] text-slate-400 bg-[#0b141a]">
                      <th className="p-3.5 font-bold">Corte de Carne</th>
                      <th className="p-3.5 font-bold">Categoría</th>
                      <th className="p-3.5 font-bold">Tu Precio WAgent</th>
                      <th className="p-3.5 font-bold">Promedio Supermercados</th>
                      <th className="p-3.5 font-bold">Rango Cadenas</th>
                      <th className="p-3.5 font-bold">Diferencia</th>
                      <th className="p-3.5 font-bold text-right">Precio Sugerido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {(retail.cuts || []).map(cut => {
                      const diff = cut.priceDiffPct;
                      return (
                        <tr key={cut.cutName} className="hover:bg-[#182229]/50 transition">
                          <td className="p-3.5 font-bold text-white">{cut.cutName}</td>
                          <td className="p-3.5 text-slate-400">{cut.category}</td>
                          <td className="p-3.5 font-mono text-emerald-400 font-bold">
                            {cut.wagentPrice ? `$${cut.wagentPrice.toLocaleString('es-AR')}` : <span className="text-slate-500">Sin precio</span>}
                          </td>
                          <td className="p-3.5 font-mono text-slate-300 font-semibold">
                            ${cut.benchmarkAvg.toLocaleString('es-AR')}
                          </td>
                          <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                            ${cut.supermarketMin.toLocaleString('es-AR')} - ${cut.supermarketMax.toLocaleString('es-AR')}
                          </td>
                          <td className="p-3.5">
                            {diff !== null ? (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                diff <= -3 ? 'bg-emerald-500/20 text-emerald-400' :
                                diff >= 3 ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {diff <= -3 ? `${diff}% (Más barato)` : diff >= 3 ? `+${diff}% (Más caro)` : 'En paridad'}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-cyan-400">
                            ${cut.suggestedPrice?.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: CALCULADORA DE DESPOSTE Y RINDE MEDIA RES                   */}
        {/* ================================================================= */}
        {activeTab === 'yield' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calculator size={18} className="text-blue-400" />
                Simulador de Despostado y Rendimiento de Media Res
              </h3>
              <p className="text-xs text-slate-300">
                Calcula el rendimiento kilo por kilo de la media res vacuna y proyecta la facturación bruta y margen de ganancia según los precios de venta vigentes en tu carnicería.
              </p>

              {/* Controles de Entrada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Peso Media Res (kg Gancho):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="60"
                      max="200"
                      value={carcassWeight}
                      onChange={(e) => setCarcassWeight(Number(e.target.value) || 115)}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-400">kg</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Costo Kilo Gancho ($/kg):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="10"
                      value={customCostGancho}
                      onChange={(e) => setCustomCostGancho(e.target.value)}
                      placeholder={String(mag.estimatedCarcassCostPerKg || 4250)}
                      className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-400">$/kg</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => setCustomCostGancho(mag.estimatedCarcassCostPerKg || 4250)}
                    className="w-full py-2 px-3 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-xs font-semibold text-slate-200 transition"
                  >
                    Tomar Costo según MAG (${mag.estimatedCarcassCostPerKg || 4250}/kg)
                  </button>
                </div>
              </div>
            </div>

            {/* Resumen Financiero del Desposte */}
            {yieldResult && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Costo Total de Compra:</span>
                    <div className="text-xl font-black text-rose-400 font-mono">
                      ${yieldResult.totalCarcassCost?.toLocaleString('es-AR')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {yieldResult.carcassWeightKg} kg × ${yieldResult.costPerKgGancho}/kg
                    </div>
                  </div>

                  <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Facturación Proyectada:</span>
                    <div className="text-xl font-black text-emerald-400 font-mono">
                      ${yieldResult.totalEstimatedRevenue?.toLocaleString('es-AR')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      A precios actuales de mostrador
                    </div>
                  </div>

                  <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Ganancia Bruta:</span>
                    <div className="text-xl font-black text-cyan-400 font-mono">
                      +${yieldResult.grossProfit?.toLocaleString('es-AR')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Margen bruto por media res
                    </div>
                  </div>

                  <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Margen Porcentual:</span>
                    <div className="text-xl font-black text-purple-400 font-mono">
                      {yieldResult.grossMarginPct}%
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Rinde neto sobre venta
                    </div>
                  </div>
                </div>

                {/* Tabla de Desglose de Cortes de la Media Res */}
                <div className="bg-[#111b21] rounded-2xl border border-[#202c33] overflow-hidden">
                  <div className="p-4 border-b border-[#202c33] flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Desglose de Cortes, Kilos Obtenidos y Facturación ({yieldResult.breakdown?.length || 0} cortes)
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#202c33] text-slate-400 bg-[#0b141a]">
                          <th className="p-3 font-bold">Corte Despostado</th>
                          <th className="p-3 font-bold">% Rinde</th>
                          <th className="p-3 font-bold">Kilos Obtenidos</th>
                          <th className="p-3 font-bold">Precio WAgent ($/kg)</th>
                          <th className="p-3 font-bold text-right">Facturación Estimada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#202c33] text-slate-200">
                        {(yieldResult.breakdown || []).map(b => (
                          <tr key={b.cutName} className="hover:bg-[#182229]/50 transition">
                            <td className="p-3 font-bold text-white">{b.cutName}</td>
                            <td className="p-3 font-mono text-slate-400">{b.sharePct}%</td>
                            <td className="p-3 font-mono text-blue-300 font-bold">{b.weightKg} kg</td>
                            <td className="p-3 font-mono text-emerald-400 font-semibold">${b.currentWagentPricePerKg.toLocaleString('es-AR')}</td>
                            <td className="p-3 font-mono text-white font-bold text-right">
                              ${b.estimatedRevenue.toLocaleString('es-AR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: OPTIMIZADOR DE PRECIOS AL CATÁLOGO                         */}
        {/* ================================================================= */}
        {activeTab === 'optimizer' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  Actualizador Inteligente de Precios del Catálogo
                </h3>
                <p className="text-xs text-slate-300">
                  Aplica aumentos o ajustes porcentuales a tu catálogo de carnicería vinculando automáticamente la suba del mercado ganadero (MAG) o el IPC del INDEC.
                </p>
              </div>

              {/* Botones de presets automáticos */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={() => { setOptPercent(mag.inmagChangePct || 1.85); setOptCategory('Carne Vacuna'); }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Scale size={13} />
                  <span>Ajustar Vacuno según suba MAG (+{mag.inmagChangePct || 1.85}%)</span>
                </button>

                <button
                  onClick={() => { setOptPercent(macro.monthlyInflation?.current || 1.9); setOptCategory('all'); }}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Percent size={13} />
                  <span>Ajustar según Inflación General IPC (+{macro.monthlyInflation?.current || 1.9}%)</span>
                </button>

                <button
                  onClick={() => { setOptPercent(macro.meatCategoryInflationEst || 2.2); setOptCategory('all'); }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <TrendingUp size={13} />
                  <span>Ajustar según Alimentos (+{macro.meatCategoryInflationEst || 2.2}%)</span>
                </button>
              </div>

              {/* Formulario de Parámetros */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#202c33]">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Categoría a Actualizar:</label>
                  <select
                    value={optCategory}
                    onChange={(e) => setOptCategory(e.target.value)}
                    className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">Todo el Catálogo Completo</option>
                    <option value="Carne Vacuna">Carne Vacuna</option>
                    <option value="Cortes Porcinos">Cortes Porcinos</option>
                    <option value="Pollo y Derivados">Pollo y Derivados</option>
                    <option value="Achuras">Achuras</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Variación Porcentual (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={optPercent}
                    onChange={(e) => setOptPercent(Number(e.target.value) || 0)}
                    className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Redondear Precios a:</label>
                  <select
                    value={optRoundTo}
                    onChange={(e) => setOptRoundTo(Number(e.target.value))}
                    className="w-full bg-[#0b141a] border border-[#202c33] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value={10}>Múltiplos de $10</option>
                    <option value={50}>Múltiplos de $50 (Recomendado)</option>
                    <option value={100}>Múltiplos de $100</option>
                    <option value={0}>Sin redondeo exacto</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleApplyPriceAdjustment}
                  disabled={applyingPriceChange}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-950/50 transition active:scale-95"
                >
                  <Sparkles size={15} className={applyingPriceChange ? 'animate-spin' : ''} />
                  <span>Aplicar Ajuste al Catálogo de WAgent</span>
                </button>
              </div>
            </div>

            {/* Resultado de la Actualización */}
            {priceChangeResult && (
              <div className="bg-[#111b21] rounded-2xl border border-emerald-500/30 p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Check size={18} />
                  <span>¡{priceChangeResult.updatedCount} productos actualizados con éxito en el Catálogo!</span>
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-[#202c33] text-xs">
                  {priceChangeResult.updatedCuts?.map(u => (
                    <div key={u.id} className="py-2 flex items-center justify-between">
                      <span className="text-white font-semibold">{u.name}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400 line-through">${u.oldPrice}</span>
                        <span className="text-emerald-400 font-bold">${u.newPrice}</span>
                        <span className="text-[10px] text-slate-500">({u.changePct > 0 ? `+${u.changePct}%` : `${u.changePct}%`})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: PRECIOS FOB EXPORTACIÓN (MAGyP)                            */}
        {/* ================================================================= */}
        {activeTab === 'fob' && (
          <div className="space-y-6">
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe size={18} className="text-cyan-400" />
                  Precios FOB Oficiales de Exportación de Carne Vacuna
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30">
                  {fob.source || 'Secretaría de Agricultura'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Valores de referencia oficiales de exportación para cortes enfriados y congelados con destino a la Unión Europea (Cuota Hilton), China e Israel.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(fob.quotes || []).map(q => (
                <div key={q.cut} className="bg-[#111b21] rounded-2xl border border-[#202c33] p-4.5 space-y-2.5">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {q.destination}
                    </span>
                    <span className={`text-[10px] font-bold ${
                      q.trend === 'up' ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      {q.trend === 'up' ? 'Alza' : 'Estable'}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-white">{q.cut}</h4>

                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="text-xl font-black text-cyan-400 font-mono">
                      ${q.usdTon.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-400">USD / Tonelada</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
