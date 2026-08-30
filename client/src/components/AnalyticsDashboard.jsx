import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  MessageSquare, 
  PhoneCall, 
  DollarSign, 
  Sparkles, 
  Bot, 
  ArrowUpRight,
  PieChart,
  CheckCircle
} from 'lucide-react';

export default function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        setMetrics(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error cargando métricas:', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading || !metrics) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0b141a]">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const stagesData = [
    { label: 'Nuevos Leads', count: metrics.stagesCount?.new_lead || 0, color: 'bg-sky-500' },
    { label: 'Calificados', count: metrics.stagesCount?.qualified || 0, color: 'bg-indigo-500' },
    { label: 'En Negociación', count: metrics.stagesCount?.negotiating || 0, color: 'bg-amber-500' },
    { label: 'Propuesta Enviada', count: metrics.stagesCount?.proposal || 0, color: 'bg-purple-500' },
    { label: 'Venta Cerrada (Ganado)', count: metrics.stagesCount?.closed_won || 0, color: 'bg-emerald-500' },
    { label: 'Perdidos', count: metrics.stagesCount?.closed_lost || 0, color: 'bg-rose-500' }
  ];

  const maxStageCount = Math.max(...stagesData.map(s => s.count), 1);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b141a] p-4 lg:p-6 overflow-y-auto space-y-6">
      
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Métricas & Rendimiento Comercial
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            En Tiempo Real
          </span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Estadísticas de conversión de ventas, actividad de mensajes y llamadas automatizadas con IA.
        </p>
      </div>

      {/* Grid de Métricas Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="glass-card rounded-3xl p-5 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Ingresos Ganados</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400">
            ${metrics.wonRevenue?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <TrendingUp size={12} className="text-emerald-400" />
            <span>De un pipeline total de ${metrics.totalPipelineValue?.toLocaleString() || 0}</span>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Tasa de Conversión</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {metrics.conversionRate}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.stagesCount?.closed_won || 0} ventas cerradas de {metrics.totalLeads} leads
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Mensajes WhatsApp</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {metrics.totalMessages}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.audioMessages} notas de voz procesadas
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5 border border-slate-800 bg-[#111b21]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Llamadas de Voz</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <PhoneCall size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {metrics.totalCalls}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.completedCalls} completadas | {metrics.missedCalls} perdidas
          </div>
        </div>

      </div>

      {/* Gráfico Visual del Embudo de Conversión */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 glass-card rounded-3xl p-6 border border-slate-800 bg-[#111b21]">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-emerald-400" />
            Distribución del Embudo de Ventas
          </h3>

          <div className="space-y-4">
            {stagesData.map(stage => {
              const percentage = Math.round((stage.count / maxStageCount) * 100);
              return (
                <div key={stage.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">{stage.label}</span>
                    <span className="font-bold text-white">{stage.count} leads</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800/80 rounded-full overflow-hidden p-0.5">
                    <div
                      style={{ width: `${Math.max(percentage, 4)}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${stage.color}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumen del Asistente IA */}
        <div className="glass-card rounded-3xl p-6 border border-emerald-500/20 bg-gradient-to-br from-[#111b21] to-emerald-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Bot size={16} /> Eficiencia del Agente IA
            </div>
            <h4 className="text-base font-bold text-white mb-3">
              Atención y Ventas 24/7
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              El agente inteligente responde consultas en milisegundos, transcribe audios entrantes, envía respuestas de voz fluidas y da seguimiento a llamadas perdidas.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-slate-300">Tiempo promedio de respuesta</span>
                <span className="text-xs font-bold text-emerald-400">&lt; 2 seg</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-slate-300">Disponibilidad del Sistema</span>
                <span className="text-xs font-bold text-emerald-400">99.9% Online</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-slate-300">Soporte Multimodal</span>
                <span className="text-xs font-bold text-sky-400">Texto + Voz PTT</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
