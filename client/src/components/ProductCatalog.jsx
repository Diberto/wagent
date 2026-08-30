import React, { useState, useEffect } from 'react';
import { 
  Package, Plus, Search, Tag, DollarSign, Edit3, Trash2, 
  RefreshCw, CheckCircle2, AlertCircle, ShoppingBag, Sparkles, Filter, Check, X
} from 'lucide-react';

export default function ProductCatalog({ apiBaseUrl = 'http://localhost:3001' }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  
  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Parrilla',
    price: '',
    unit: 'kg',
    description: '',
    stock: 50,
    isAvailable: true,
    sku: ''
  });

  const categories = [
    'all',
    'Parrilla',
    'Cortes Premium',
    'Horno y Olla',
    'Milanesas y Preparados',
    'Achuras y Embutidos',
    'Comidas Diarias',
    'Combos y Promociones',
    'General'
  ];

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/products`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncWithWhatsApp = async () => {
    try {
      setSyncing(true);
      setSyncMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/whatsapp/sync-catalog`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage({ type: 'success', text: data.message || 'Sincronizado con éxito' });
        if (data.products) setProducts(data.products);
      } else {
        setSyncMessage({ type: 'error', text: data.error || 'No se pudo sincronizar' });
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: 'Error de conexión con el servidor' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: 'Parrilla',
      price: '',
      unit: 'kg',
      description: '',
      stock: 50,
      isAvailable: true,
      sku: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category || 'General',
      price: product.price,
      unit: product.unit || 'kg',
      description: product.description || '',
      stock: product.stock ?? 50,
      isAvailable: product.isAvailable !== false,
      sku: product.sku || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      const url = editingProduct 
        ? `${apiBaseUrl}/api/products/${editingProduct.id}`
        : `${apiBaseUrl}/api/products`;
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: Number(formData.price) || 0,
          stock: Number(formData.stock) || 0
        })
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchProducts();
      }
    } catch (err) {
      console.error('Error saving product:', err);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este producto del catálogo?')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(products.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.category?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] h-full overflow-hidden text-slate-200">
      {/* Header */}
      <div className="bg-[#111b21] border-b border-[#222e35] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                Catálogo de Productos & Carnes
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30">
                  {products.length} productos
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                La IA utiliza este catálogo en tiempo real para cotizar, asesorar y cerrar ventas en WhatsApp.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncWithWhatsApp}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50"
            title="Importar productos del catálogo de WhatsApp Business"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar con WhatsApp Business'}
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Sync Message Alert */}
      {syncMessage && (
        <div className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
          syncMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}>
          {syncMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {syncMessage.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-[#111b21]/60 border-b border-[#222e35] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por corte, producto o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#202c33] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Category Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-[#202c33] hover:bg-[#2a3942] text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat === 'all' ? 'Todos' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
            <span className="text-xs">Cargando catálogo...</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-center">
            <Package className="w-12 h-12 mb-3 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">No se encontraron productos</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Agrega tus productos o sincroniza desde WhatsApp Business para que el Asesor Virtual pueda venderlos.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 rounded-xl text-xs font-semibold text-emerald-400"
            >
              Crear primer producto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(prod => (
              <div
                key={prod.id}
                className="group relative bg-[#111b21] hover:bg-[#182229] border border-[#222e35] hover:border-emerald-500/40 rounded-2xl p-4 flex flex-col justify-between transition shadow-md hover:shadow-xl hover:shadow-emerald-500/5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#202c33] text-emerald-400 border border-emerald-500/20">
                      {prod.category || 'General'}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleOpenEditModal(prod)}
                        className="p-1 hover:bg-[#202c33] text-slate-400 hover:text-emerald-400 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-1 hover:bg-[#202c33] text-slate-400 hover:text-rose-400 rounded-lg transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-1.5 line-clamp-1">{prod.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {prod.description || 'Sin descripción adicional'}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#222e35] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-medium">Precio</span>
                    <div className="text-base font-extrabold text-emerald-400 flex items-baseline gap-0.5">
                      <span>${Number(prod.price).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 font-normal">/{prod.unit || 'kg'}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block font-medium">Estado</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      prod.isAvailable !== false
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {prod.isAvailable !== false ? 'Disponible' : 'Agotado'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Crear / Editar Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#111b21] border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[#222e35] flex items-center justify-between bg-[#182229]">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto / Corte'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-[#202c33] text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre del Corte / Producto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Costilla de Novillito, Vacío, Matambre..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Parrilla">Parrilla</option>
                    <option value="Cortes Premium">Cortes Premium</option>
                    <option value="Horno y Olla">Horno y Olla</option>
                    <option value="Milanesas y Preparados">Milanesas y Preparados</option>
                    <option value="Achuras y Embutidos">Achuras y Embutidos</option>
                    <option value="Comidas Diarias">Comidas Diarias</option>
                    <option value="Combos y Promociones">Combos y Promociones</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Unidad</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="kg">Por Kilo (kg)</option>
                    <option value="unidad">Por Unidad</option>
                    <option value="combo">Por Combo</option>
                    <option value="paquete">Por Paquete</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Precio ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="7800"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Stock Estimado</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descripción & Recomendaciones de Cocina</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Corte tierno con grasa moderada. Ideal para asar a fuego lento o al horno..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isAvailable"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-[#202c33]"
                />
                <label htmlFor="isAvailable" className="text-xs font-medium text-slate-300 cursor-pointer">
                  Producto disponible para venta inmediata
                </label>
              </div>

              <div className="pt-3 border-t border-[#222e35] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-xs font-semibold text-slate-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
