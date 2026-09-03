import React, { useState, useEffect } from 'react';
import { 
  UtensilsCrossed, Plus, Search, Sparkles, Clock, Users, ChefHat, 
  Trash2, Edit3, CheckCircle2, AlertCircle, RefreshCw, Flame, Tag,
  Layers, ArrowRight, BookOpen, Check, X, ShieldAlert,
  Download, Upload, Globe, FileSpreadsheet
} from 'lucide-react';

export default function RecipesView({ socket = null }) {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Estados para Importación / Exportación y Búsqueda Web
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importRawText, setImportRawText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);

  const [webSearchModalOpen, setWebSearchModalOpen] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchResults, setWebSearchResults] = useState([]);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [savedWebRecipeId, setSavedWebRecipeId] = useState(null);
  
  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Guisos y Olla',
    description: '',
    prepTimeMinutes: 45,
    difficulty: 'Media',
    servingsDefault: 4,
    gramsPerPerson: 250,
    suggestedCuts: [{ name: '', plu: '', isPrimary: true, note: '' }],
    replacementCuts: [{ name: '', plu: '', note: '' }],
    ingredients: [''],
    instructions: [''],
    isFeatured: true
  });

  const categories = [
    'all',
    'Guisos y Olla',
    'Milanesas y Fritos',
    'Horno y Asaderas',
    'Pastas y Salsas',
    'Minutas y Plancha',
    'Tradicionales'
  ];

  useEffect(() => {
    fetchRecipes();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchRecipes();
    socket.on('recipes:updated', handleUpdate);
    return () => socket.off('recipes:updated', handleUpdate);
  }, [socket]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recipes');
      if (res.ok) {
        const data = await res.json();
        setRecipes(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const handleExportRecipes = (format = 'json') => {
    setShowExportMenu(false);
    window.open(`/api/recipes/export?format=${format}`, '_blank');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImportRawText(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!importRawText && !importFile) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      let payload = {};
      if (importFile?.name?.endsWith('.json') || importRawText.trim().startsWith('[')) {
        try {
          payload.recipes = JSON.parse(importRawText);
        } catch (e) {
          payload.csvData = importRawText;
        }
      } else {
        payload.csvData = importRawText;
      }

      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setImportStatus({ success: true, message: data.message || `${data.count || 0} recetas importadas correctamente.` });
        await fetchRecipes();
        setTimeout(() => {
          setImportModalOpen(false);
          setImportFile(null);
          setImportRawText('');
          setImportStatus(null);
        }, 1500);
      } else {
        setImportStatus({ success: false, message: data.error || 'Error al importar recetas' });
      }
    } catch (err) {
      setImportStatus({ success: false, message: err.message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExecuteWebSearch = async () => {
    if (!webSearchQuery.trim()) return;
    setIsSearchingWeb(true);
    setWebSearchResults([]);
    try {
      const res = await fetch('/api/recipes/search-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: webSearchQuery.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setWebSearchResults(Array.isArray(data.recipes) ? data.recipes : []);
      } else {
        alert(data.error || 'Error al buscar recetas en internet');
      }
    } catch (err) {
      console.error('Error buscando receta web:', err);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  const handleSaveWebRecipe = async (recipe) => {
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });
      if (res.ok) {
        const saved = await res.json();
        setSavedWebRecipeId(recipe.id || saved.id);
        await fetchRecipes();
        setTimeout(() => setSavedWebRecipeId(null), 2500);
      }
    } catch (err) {
      console.error('Error guardando receta web:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingRecipe(null);
    setFormData({
      title: '',
      category: 'Guisos y Olla',
      description: '',
      prepTimeMinutes: 45,
      difficulty: 'Media',
      servingsDefault: 4,
      gramsPerPerson: 250,
      suggestedCuts: [{ name: '', plu: '', isPrimary: true, note: '' }],
      replacementCuts: [{ name: '', plu: '', note: '' }],
      ingredients: ['1 kg de carne seleccionada', '2 cebollas picadas', 'Sal y condimentos al gusto'],
      instructions: ['Dorar la carne en cacerola caliente.', 'Sumar vegetales y cocinar a fuego lento.'],
      isFeatured: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      title: recipe.title || '',
      category: recipe.category || 'Guisos y Olla',
      description: recipe.description || '',
      prepTimeMinutes: recipe.prepTimeMinutes || 45,
      difficulty: recipe.difficulty || 'Media',
      servingsDefault: recipe.servingsDefault || 4,
      gramsPerPerson: recipe.gramsPerPerson || 250,
      suggestedCuts: Array.isArray(recipe.suggestedCuts) && recipe.suggestedCuts.length > 0 
        ? recipe.suggestedCuts 
        : [{ name: '', plu: '', isPrimary: true, note: '' }],
      replacementCuts: Array.isArray(recipe.replacementCuts) && recipe.replacementCuts.length > 0
        ? recipe.replacementCuts
        : [{ name: '', plu: '', note: '' }],
      ingredients: Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients
        : [''],
      instructions: Array.isArray(recipe.instructions) && recipe.instructions.length > 0
        ? recipe.instructions
        : [''],
      isFeatured: recipe.isFeatured !== false
    });
    setIsModalOpen(true);
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    try {
      const url = editingRecipe ? `/api/recipes/${editingRecipe.id}` : '/api/recipes';
      const method = editingRecipe ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchRecipes();
      }
    } catch (err) {
      console.error('Error saving recipe:', err);
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta receta?')) return;
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedRecipe?.id === id) setSelectedRecipe(null);
        fetchRecipes();
      }
    } catch (err) {
      console.error('Error deleting recipe:', err);
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('¿Restaurar las 8 recetas clásicas tradicionales argentinas?')) return;
    try {
      const res = await fetch('/api/recipes/seed', { method: 'POST' });
      if (res.ok) {
        fetchRecipes();
      }
    } catch (err) {
      console.error('Error seeding recipes:', err);
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchCat = selectedCategory === 'all' || r.category === selectedCategory;
    const term = searchTerm.toLowerCase();
    const matchSearch = (r.title || '').toLowerCase().includes(term) ||
      (r.description || '').toLowerCase().includes(term) ||
      (r.suggestedCuts || []).some(c => (c.name || '').toLowerCase().includes(term));
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] text-slate-100 h-full overflow-hidden">
      {/* Header Superior */}
      <div className="p-4 sm:p-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/5">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Recetas Tradicionales & Asesor Gastronómico</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {recipes.length} Recetas Vinculadas
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Recetas argentinas con cálculo de comensales y cortes obligatorios/reemplazos vinculados al catálogo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setWebSearchModalOpen(true); setWebSearchResults([]); setWebSearchQuery(''); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition shadow-md"
            title="Buscar recetas en internet y adaptarlas automáticamente al catálogo de carnes con IA"
          >
            <Globe size={14} className="text-purple-400" />
            Buscar en Internet con IA
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              title="Exportar recetario"
            >
              <Download size={13} className="text-amber-400" />
              Exportar
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-[#182229] border border-slate-700 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in">
                <button
                  onClick={() => handleExportRecipes('json')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <FileText size={13} className="text-sky-400" /> JSON Estructurado
                </button>
                <button
                  onClick={() => handleExportRecipes('csv')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <FileSpreadsheet size={13} className="text-emerald-400" /> Excel (CSV)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => { setImportModalOpen(true); setImportStatus(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            title="Importar recetario desde archivo"
          >
            <Upload size={13} className="text-sky-400" />
            Importar
          </button>

          <button
            onClick={handleSeedDefaults}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            title="Recargar recetas base"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            Restaurar Base
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            Nueva Receta
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros de Categoría */}
      <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {cat === 'all' ? '🍽️ Todas las Recetas' : cat}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por plato o corte..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      {/* Grid de Recetas y Vista de Detalle */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
            Cargando recetario tradicional...
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <UtensilsCrossed className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300">No se encontraron recetas con ese criterio.</p>
            <p className="text-xs text-slate-500 mt-1">Podés crear una nueva o restaurar las recetas tradicionales argentinas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRecipes.map(recipe => (
              <div 
                key={recipe.id}
                className="rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-amber-500/40 transition flex flex-col justify-between overflow-hidden group shadow-lg"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {recipe.category}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      <button 
                        onClick={() => handleOpenEditModal(recipe)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Editar receta"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteRecipe(recipe.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 transition"
                        title="Eliminar receta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition line-clamp-1">
                    {recipe.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {recipe.description}
                  </p>

                  {/* Badges de Tiempos y Porciones */}
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      {recipe.prepTimeMinutes} min
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      {recipe.servingsDefault} porciones (~{recipe.gramsPerPerson}g/p)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                      {recipe.difficulty}
                    </span>
                  </div>

                  {/* Cortes Sugeridos Principales */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      🥩 Cortes Sugeridos:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(recipe.suggestedCuts || []).map((cut, cIdx) => (
                        <span 
                          key={cIdx} 
                          className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                        >
                          {cut.name} {cut.plu ? `[PLU ${cut.plu}]` : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Cortes de Reemplazo si no hay stock */}
                  {(recipe.replacementCuts || []).length > 0 && recipe.replacementCuts[0].name && (
                    <div className="mt-2.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        🔄 Reemplazos Posibles:
                      </span>
                      <p className="text-[11px] text-slate-400 italic">
                        {recipe.replacementCuts.map(r => r.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">IA de Ventas: <b className="text-emerald-400">Vinculado a Bot</b></span>
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    Auto-sugerido en cocina familiar <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Crear / Editar Receta */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  {editingRecipe ? 'Editar Receta Tradicional' : 'Nueva Receta Tradicional'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRecipe} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nombre de la Receta *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ej: Milanesas Caseras a la Napolitana"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Categoría Gastronómica *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {categories.filter(c => c !== 'all').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Descripción Atractiva *</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción para que el bot recomiende el plato con tentación..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Tiempos, Dificultad, Porciones */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Tiempo (min)</label>
                  <input
                    type="number"
                    value={formData.prepTimeMinutes}
                    onChange={(e) => setFormData({ ...formData, prepTimeMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Dificultad</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Súper Fácil">Súper Fácil</option>
                    <option value="Fácil">Fácil</option>
                    <option value="Media">Media</option>
                    <option value="Chef Experto">Chef Experto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Gramos por Persona</label>
                  <input
                    type="number"
                    value={formData.gramsPerPerson}
                    onChange={(e) => setFormData({ ...formData, gramsPerPerson: Number(e.target.value) })}
                    placeholder="250"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Cortes Sugeridos */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-400">🥩 Cortes Sugeridos Principales (Catálogo)</span>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      suggestedCuts: [...formData.suggestedCuts, { name: '', plu: '', isPrimary: true, note: '' }]
                    })}
                    className="text-[11px] text-amber-400 hover:underline font-semibold"
                  >
                    + Agregar Corte
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.suggestedCuts.map((cut, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nombre de corte (ej: Nalga Feteada)"
                        value={cut.name}
                        onChange={(e) => {
                          const updated = [...formData.suggestedCuts];
                          updated[idx].name = e.target.value;
                          setFormData({ ...formData, suggestedCuts: updated });
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="PLU (ej: 2021)"
                        value={cut.plu}
                        onChange={(e) => {
                          const updated = [...formData.suggestedCuts];
                          updated[idx].plu = e.target.value;
                          setFormData({ ...formData, suggestedCuts: updated });
                        }}
                        className="w-24 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                      />
                      {formData.suggestedCuts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.suggestedCuts.filter((_, i) => i !== idx);
                            setFormData({ ...formData, suggestedCuts: updated });
                          }}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cortes de Reemplazo */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-400">🔄 Cortes de Reemplazo / Alternativos</span>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      replacementCuts: [...formData.replacementCuts, { name: '', plu: '', note: '' }]
                    })}
                    className="text-[11px] text-sky-400 hover:underline font-semibold"
                  >
                    + Agregar Reemplazo
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.replacementCuts.map((cut, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Corte alternativo (ej: Peceto / Bola de Lomo)"
                        value={cut.name}
                        onChange={(e) => {
                          const updated = [...formData.replacementCuts];
                          updated[idx].name = e.target.value;
                          setFormData({ ...formData, replacementCuts: updated });
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="PLU (opcional)"
                        value={cut.plu}
                        onChange={(e) => {
                          const updated = [...formData.replacementCuts];
                          updated[idx].plu = e.target.value;
                          setFormData({ ...formData, replacementCuts: updated });
                        }}
                        className="w-24 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                      />
                      {formData.replacementCuts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.replacementCuts.filter((_, i) => i !== idx);
                            setFormData({ ...formData, replacementCuts: updated });
                          }}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20"
                >
                  {editingRecipe ? 'Guardar Cambios' : 'Crear Receta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importación de Recetas */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#182229] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Importar Recetario</h3>
                  <p className="text-[11px] text-slate-400">Soporta archivo JSON estructurado o CSV</p>
                </div>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-amber-500/60 transition bg-[#111b21]">
                <Upload size={28} className="mx-auto text-amber-400 mb-2" />
                <label className="cursor-pointer">
                  <span className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg transition">
                    Seleccionar Archivo (.json, .csv)
                  </span>
                  <input
                    type="file"
                    accept=".json, .csv, application/json, text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {importFile && (
                  <p className="mt-2 text-xs text-amber-400 font-mono">
                    📄 {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  O pegar JSON con recetas:
                </label>
                <textarea
                  value={importRawText}
                  onChange={(e) => setImportRawText(e.target.value)}
                  placeholder="[ { &quot;title&quot;: &quot;Guiso Carrero&quot;, &quot;suggestedCuts&quot;: [...] } ]"
                  rows={5}
                  className="w-full bg-[#111b21] border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {importStatus && (
                <div className={`p-3 rounded-xl text-xs font-medium ${importStatus.success ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950/60 text-rose-400 border border-rose-800/50'}`}>
                  {importStatus.message}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700/60 bg-[#111b21] flex justify-end gap-2">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isImporting || (!importFile && !importRawText.trim())}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isImporting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Cargar Recetas
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Búsqueda Web con IA & Adaptación de Recetas */}
      {webSearchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#182229] border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Buscar Recetas en Internet con IA
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-mono">
                      Adaptación a Cortes Oficiales
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    La IA busca en la web, extrae ingredientes y asocia automáticamente los cortes y PLU del catálogo
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWebSearchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800 bg-[#111b21] flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ej: Matambre a la pizza, Carbonada criolla, Ossobuco al vino tinto..."
                  value={webSearchQuery}
                  onChange={(e) => setWebSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExecuteWebSearch()}
                  className="w-full pl-9 pr-3 py-2 bg-[#182229] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                onClick={handleExecuteWebSearch}
                disabled={isSearchingWeb || !webSearchQuery.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {isSearchingWeb ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Buscar & Adaptar
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
              {isSearchingWeb ? (
                <div className="text-center py-12 space-y-3">
                  <RefreshCw size={24} className="animate-spin text-purple-400 mx-auto" />
                  <p className="text-xs text-purple-300 font-semibold">Consultando la web y adaptando cortes al catálogo de carnes...</p>
                </div>
              ) : webSearchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Escribe el plato o receta que buscas y presiona <strong className="text-slate-300">Buscar & Adaptar</strong>.
                </div>
              ) : (
                webSearchResults.map((rec, idx) => (
                  <div key={idx} className="bg-[#111b21] border border-slate-700/80 rounded-2xl p-4 space-y-3 hover:border-purple-500/40 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{rec.title}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">{rec.category}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{rec.description}</p>
                      </div>
                      <button
                        onClick={() => handleSaveWebRecipe(rec)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${savedWebRecipeId === rec.id ? 'bg-emerald-500 text-slate-950' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                      >
                        {savedWebRecipeId === rec.id ? (
                          <>
                            <Check size={13} />
                            ¡Cargada!
                          </>
                        ) : (
                          <>
                            <Plus size={13} />
                            Cargar en Sistema
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 py-1 bg-[#182229] rounded-xl px-3">
                      <div>⏱️ Tiempo: <strong className="text-slate-200">{rec.prepTimeMinutes} min</strong></div>
                      <div>👥 Porciones: <strong className="text-slate-200">{rec.servingsDefault} comensales</strong></div>
                      <div>⚖️ Por porción: <strong className="text-slate-200">{rec.gramsPerPerson}g carne</strong></div>
                    </div>

                    {rec.suggestedCuts && rec.suggestedCuts.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-amber-400">🥩 Cortes del Catálogo Sugeridos:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.suggestedCuts.map((sc, sidx) => (
                            <span key={sidx} className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                              {sc.name} {sc.plu ? `(PLU: ${sc.plu})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
