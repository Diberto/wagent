import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Plus, 
  DollarSign, 
  MessageSquare, 
  Bot, 
  Tag, 
  ChevronRight, 
  Clock, 
  Trash2, 
  CheckCircle,
  Sparkles,
  Phone
} from 'lucide-react';

export default function KanbanPipeline({ 
  leads = [], 
  onUpdateLeadStage, 
  onToggleLeadAi, 
  onSelectLead,
  onCreateLead,
  onDeleteLead
}) {
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    phone: '',
    value: 500,
    tags: 'Plan WhatsApp, Voz IA',
    notes: ''
  });

  const columns = [
    { id: 'new_lead', title: 'Nuevos Leads', color: 'border-sky-500/40 text-sky-400 bg-sky-500/10' },
    { id: 'qualified', title: 'Calificados', color: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10' },
    { id: 'negotiating', title: 'En Negociación', color: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
    { id: 'proposal', title: 'Propuesta Enviada', color: 'border-purple-500/40 text-purple-400 bg-purple-500/10' },
    { id: 'closed_won', title: 'Venta Cerrada (Ganado)', color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
    { id: 'closed_lost', title: 'Perdido', color: 'border-rose-500/40 text-rose-400 bg-rose-500/10' },
  ];

  // Disparar confetti cuando se gana una venta
  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (leadId) {
      onUpdateLeadStage(leadId, targetStage);
      if (targetStage === 'closed_won') {
        triggerConfetti();
      }
    }
    setDraggedLeadId(null);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newLeadForm.name || !newLeadForm.phone) return;

    const jid = `${newLeadForm.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const tagsArray = newLeadForm.tags.split(',').map(t => t.trim()).filter(Boolean);

    onCreateLead({
      jid,
      name: newLeadForm.name,
      phone: newLeadForm.phone,
      value: Number(newLeadForm.value) || 0,
      tags: tagsArray,
      notes: newLeadForm.notes,
      stage: 'new_lead'
    });

    setIsNewLeadModalOpen(false);
    setNewLeadForm({ name: '', phone: '', value: 500, tags: 'Plan WhatsApp, Voz IA', notes: '' });
  };

  const totalPipelineValue = leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  const totalWonValue = leads.filter(l => l.stage === 'closed_won').reduce((sum, l) => sum + (Number(l.value) || 0), 0);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b141a] p-4 lg:p-6 overflow-hidden">
      
      {/* Header del Embudo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Embudo de Ventas & Clientes
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {leads.length} Leads Totales
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Valor Total en Pipeline: <strong className="text-white">${totalPipelineValue.toLocaleString()}</strong> | Cerrado Ganado: <strong className="text-emerald-400">${totalWonValue.toLocaleString()}</strong>
          </p>
        </div>

        <button
          onClick={() => setIsNewLeadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all self-start sm:self-auto"
        >
          <Plus size={16} />
          Nuevo Lead Manual
        </button>
      </div>

      {/* Columnas Kanban */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4 items-start">
        {columns.map(column => {
          const columnLeads = leads.filter(l => l.stage === column.id);
          const colValue = columnLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);

          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
              className="w-72 lg:w-80 flex-shrink-0 flex flex-col bg-[#111b21] border border-slate-800 rounded-3xl p-3.5 max-h-full"
            >
              {/* Header de Columna */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${column.color}`}>
                    {column.title}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {columnLeads.length}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-400">
                  ${colValue.toLocaleString()}
                </span>
              </div>

              {/* Tarjetas de Lead */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {columnLeads.map(lead => (
                  <div
                    key={lead.id || lead.jid}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.jid || lead.id)}
                    className="glass-card glass-card-hover rounded-2xl p-4 cursor-grab active:cursor-grabbing border border-slate-700/60 bg-[#182229]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-bold text-white truncate">
                        {lead.name || lead.pushName}
                      </h4>
                      {lead.value > 0 && (
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                          ${lead.value}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2.5">
                      <Phone size={12} className="text-slate-500" />
                      <span>{lead.phone}</span>
                    </div>

                    {lead.lastMessage && (
                      <p className="text-xs text-slate-400 bg-slate-800/60 rounded-xl p-2 mb-3 line-clamp-2 border border-slate-700/40">
                        {lead.lastMessage}
                      </p>
                    )}

                    {/* Tags */}
                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mb-3">
                        {lead.tags.map((tag, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Acciones Rápidas */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                      {/* Botón IA */}
                      <button
                        onClick={() => onToggleLeadAi(lead.jid, !lead.aiEnabled)}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                          lead.aiEnabled
                            ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                            : 'text-slate-400 bg-slate-800 hover:text-white'
                        }`}
                        title={lead.aiEnabled ? 'IA respondiendo automáticamente' : 'Modo manual'}
                      >
                        <Bot size={13} />
                        {lead.aiEnabled ? 'IA On' : 'Manual'}
                      </button>

                      {/* Botón Abrir Chat */}
                      <button
                        onClick={() => onSelectLead(lead)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                      >
                        <MessageSquare size={13} />
                        Chat
                      </button>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal Nuevo Lead Manual */}
      {isNewLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#111b21] border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Agregar Nuevo Lead</h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Laura Ramírez"
                  value={newLeadForm.name}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Número de WhatsApp (con código de país)</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: +54 9 11 1234-5678"
                  value={newLeadForm.phone}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Valor Estimado ($ USD)</label>
                <input
                  type="number"
                  placeholder="500"
                  value={newLeadForm.value}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, value: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Etiquetas (separadas por coma)</label>
                <input
                  type="text"
                  placeholder="Plan WhatsApp, Soporte, Voz"
                  value={newLeadForm.tags}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, tags: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notas iniciales</label>
                <textarea
                  rows="2"
                  placeholder="Detalles sobre el cliente o interés..."
                  value={newLeadForm.notes}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewLeadModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md"
                >
                  Guardar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
