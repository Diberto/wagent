import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  DollarSign, 
  Tag, 
  Sparkles, 
  Search, 
  Check, 
  X,
  Package,
  Layers,
  HelpCircle
} from 'lucide-react';

export default function KnowledgeBase() {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Test AI prompt box
  const [testPrompt, setTestPrompt] = useState('');
  const [testAiResponse, setTestAiResponse] = useState('');
  const [isTestingAi, setIsTestingAi] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: 'Productos & Precios',
    content: '',
    productPrice: '',
    keywords: ''
  });

  const loadKnowledgeBase = () => {
    fetch('/api/knowledge')
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(err => console.error('Error cargando KB:', err));
  };

  useEffect(() => {
    loadKnowledgeBase();
  }, []);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setForm({
      title: '',
      category: 'Productos & Precios',
      content: '',
      productPrice: '',
      keywords: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title,
      category: item.category,
      content: item.content,
      productPrice: item.productPrice || '',
      keywords: item.keywords ? item.keywords.join(', ') : ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title || !form.content) return;

    const payload = {
      id: editingItem?.id,
      title: form.title,
      category: form.category,
      content: form.content,
      productPrice: form.productPrice ? Number(form.productPrice) : null,
      keywords: form.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    };

    try {
      await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setIsModalOpen(false);
      loadKnowledgeBase();
    } catch (err) {
      console.error('Error guardando KB:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este artículo de la base de conocimientos?')) return;
    try {
      await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      loadKnowledgeBase();
    } catch (err) {
      console.error('Error eliminando KB:', err);
    }
  };

  const handleTestAi = async () => {
    if (!testPrompt.trim()) return;
    setIsTestingAi(true);
    setTestAiResponse('');

    try {
      const res = await fetch('/api/chats/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: 'kb-tester@s.whatsapp.net',
          name: 'Cliente Prueba KB',
          text: testPrompt
        })
      });
      const data = await res.json();
      
      // Esperar brevemente para recibir la respuesta generada
      setTimeout(async () => {
        const msgRes = await fetch('/api/chats/kb-tester@s.whatsapp.net/messages');
        const msgs = await msgRes.json();
        const lastAgentMsg = msgs.filter(m => m.sender === 'agent').pop();
        setTestAiResponse(lastAgentMsg?.content || 'El agente ha procesado la información.');
        setIsTestingAi(false);
      }, 1500);
    } catch (err) {
      console.error('Error probando IA con KB:', err);
      setIsTestingAi(false);
    }
  };

  const categories = ['all', 'Información General', 'Productos & Precios', 'Ventas y Finanzas', 'Logística', 'Políticas'];

  const filteredItems = items.filter(item => {
    const matchesSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.keywords || []).some(k => k.includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b141a] p-4 lg:p-6 overflow-y-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Base de Conocimiento & Catálogo
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {items.length} Artículos
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Toda la información que cargues aquí será utilizada por la IA para cotizar productos y responder preguntas en WhatsApp con precisión.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all self-start sm:self-auto"
        >
          <Plus size={16} />
          Agregar Artículo / Producto
        </button>
      </div>

      {/* Probador en vivo del Agente con la Base de Conocimiento */}
      <div className="glass-card rounded-3xl p-5 border border-emerald-500/30 bg-[#111b21]">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
          <Sparkles size={14} /> Probador RAG de la Base de Conocimiento
        </div>
        <p className="text-xs text-slate-300 mb-3">
          Hazle una pregunta a la IA para verificar cómo utiliza tus artículos y precios para responder:
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ej: ¿Qué formas de pago tienen y cuánto tardan los envíos?"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestAi()}
            className="flex-1 px-4 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleTestAi}
            disabled={isTestingAi || !testPrompt.trim()}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5"
          >
            {isTestingAi ? 'Consultando...' : 'Probar IA'}
          </button>
        </div>

        {testAiResponse && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-slate-200 animate-in fade-in">
            <strong className="text-emerald-400 block mb-1">Respuesta del Agente de Ventas:</strong>
            <p className="whitespace-pre-line leading-relaxed">{testAiResponse}</p>
          </div>
        )}
      </div>

      {/* Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título, contenido o palabra clave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#182229] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'all' ? 'Todas las Categorías' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Cuadrícula de Artículos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">
            No se encontraron artículos en esta búsqueda.
          </div>
        ) : (
          filteredItems.map(item => (
            <div
              key={item.id}
              className="glass-card glass-card-hover rounded-3xl p-5 border border-slate-800 bg-[#111b21] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {item.category}
                  </span>
                  {item.productPrice && (
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                      ${item.productPrice}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white mb-2">{item.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-4 mb-4">
                  {item.content}
                </p>
              </div>

              <div>
                {item.keywords && item.keywords.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mb-4">
                    {item.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Editar"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-[#111b21] border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingItem ? 'Editar Artículo' : 'Nuevo Artículo de Conocimiento'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título del Artículo o Producto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Plan Pro Anual / Políticas de Devolución"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Categoría</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Productos & Precios">Productos & Precios</option>
                    <option value="Información General">Información General</option>
                    <option value="Ventas y Finanzas">Ventas y Finanzas</option>
                    <option value="Logística">Logística</option>
                    <option value="Políticas">Políticas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Precio Opcional ($ USD)</label>
                  <input
                    type="number"
                    placeholder="Ej: 299"
                    value={form.productPrice}
                    onChange={(e) => setForm({ ...form, productPrice: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Información Detallada (Lo que el Asistente debe saber)</label>
                <textarea
                  rows="4"
                  required
                  placeholder="Describe las características, beneficios, condiciones, pasos a seguir o detalles que responderá la IA..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Palabras Clave (separadas por coma)</label>
                <input
                  type="text"
                  placeholder="precio, costo, envio, garantía, plan"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
