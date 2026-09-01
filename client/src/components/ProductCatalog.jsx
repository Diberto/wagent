import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, Plus, Search, Tag, DollarSign, Edit3, Trash2, 
  RefreshCw, CheckCircle2, AlertCircle, ShoppingBag, Sparkles, Filter, Check, X, Copy, Barcode,
  List, LayoutGrid, Download, Upload, FileSpreadsheet, Database, ArrowUpDown, FileText,
  Star, Smartphone, EyeOff, Eye, Image as ImageIcon, Boxes, AlertTriangle, Store, Globe
} from 'lucide-react';
import MediaGalleryModal from './MediaGalleryModal';

export default function ProductCatalog({ apiBaseUrl = '', socket = null }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [whatsappFilter, setWhatsappFilter] = useState('all'); // 'all' | 'enabled' | 'disabled' | 'featured'
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'store_only' | 'whatsapp_only' | 'both' | 'disabled'
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'with_control' | 'low_stock' | 'out_of_stock'
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('catalog_view_mode') || 'table');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [copiedPlu, setCopiedPlu] = useState(null);
  const fileInputRef = useRef(null);
  
  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMediaGalleryPickerOpen, setIsMediaGalleryPickerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Parrilla y Vacuno',
    price: '',
    unit: 'kg',
    description: '',
    imageUrl: '',
    stock: 100,
    stockQuantity: 100,
    stockControl: false,
    stockMinAlert: 5,
    allowBackorder: true,
    isAvailable: true,
    availableInStore: true,
    availableInWhatsApp: true,
    isFeaturedWhatsApp: false,
    plu: '',
    barcode: '',
    sku: '',
    ivaRate: 10.5
  });

  // Selección Múltiple y Acciones Masivas
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  // Modal de Ajuste Rápido de Stock
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockModalProduct, setStockModalProduct] = useState(null);
  const [stockModalQuantity, setStockModalQuantity] = useState(0);
  const [stockModalControl, setStockModalControl] = useState(false);
  const [stockModalMinAlert, setStockModalMinAlert] = useState(5);
  const [stockModalAllowBackorder, setStockModalAllowBackorder] = useState(true);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);

  // Extraer categorías dinámicas únicas de los productos
  const categories = [
    'all',
    ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  ];

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleProductsUpdate = (data) => {
      if (Array.isArray(data)) {
        setProducts(data);
      } else if (data && Array.isArray(data.products)) {
        setProducts(data.products);
      } else {
        fetchProducts();
      }
    };

    socket.on('products:updated', handleProductsUpdate);
    socket.on('catalog:updated', handleProductsUpdate);

    return () => {
      socket.off('products:updated', handleProductsUpdate);
      socket.off('catalog:updated', handleProductsUpdate);
    };
  }, [socket]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/products`);
      if (res.ok) {
        const data = await res.json();
        const prods = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
        setProducts(prods);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importReplaceAll, setImportReplaceAll] = useState(false);

  // Cargar Catálogo Maestro Oficial con Códigos PLU (757 Productos)
  const handleSeedMasterCatalog = async () => {
    if (!window.confirm('¿Deseas cargar el Catálogo Maestro Oficial con los 757 productos y códigos PLU (Cod.;Producto;Precio)?')) return;
    try {
      setSyncing(true);
      setSyncMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/products/seed-master`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
        setSyncMessage({ type: 'success', text: data.message || `¡Catálogo maestro cargado con ${data.count || 0} productos y códigos PLU!` });
      } else {
        setSyncMessage({ type: 'error', text: data.error || 'Error al cargar catálogo maestro' });
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: 'Error de conexión con el servidor' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  // --- Manejo de Selección Múltiple y Acciones en Lote ---
  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id));
    }
  };

  const handleToggleSelectProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkUpdatePrice = async () => {
    const percentStr = window.prompt(`Ingresa el % de aumento o descuento para los ${selectedProductIds.length} productos seleccionados (ej: 15 para +15%, -10 para -10%):`);
    if (percentStr === null) return;
    const percent = parseFloat(percentStr);
    if (isNaN(percent)) return alert('Porcentaje inválido.');
    
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProductIds, updates: { pricePercentChange: percent } })
      });
      if (res.ok) {
        await fetchProducts();
        setSelectedProductIds([]);
        setSyncMessage({ type: 'success', text: `¡Precios actualizados en ${selectedProductIds.length} productos con ${percent > 0 ? '+' : ''}${percent}%!` });
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error en bulk price update:', e);
    }
  };

  const handleBulkUpdateIva = async (ivaRate) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProductIds, updates: { ivaRate: Number(ivaRate) } })
      });
      if (res.ok) {
        await fetchProducts();
        setSelectedProductIds([]);
        setSyncMessage({ type: 'success', text: `¡Alícuota IVA de ${ivaRate}% asignada a ${selectedProductIds.length} productos!` });
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error en bulk iva update:', e);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar los ${selectedProductIds.length} productos seleccionados? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProductIds })
      });
      if (res.ok) {
        await fetchProducts();
        setSelectedProductIds([]);
        setSyncMessage({ type: 'success', text: `¡${selectedProductIds.length} productos eliminados del catálogo!` });
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error en bulk delete:', e);
    }
  };

  // Sincronizar catálogo con WhatsApp Business
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

  // Exportar Catálogo en diferentes formatos
  const handleExport = (format = 'xlsx') => {
    setShowExportMenu(false);
    window.open(`${apiBaseUrl}/api/products/export?format=${format}`, '_blank');
  };

  // Importar Archivo Binario (Excel .xlsx / .xls / .csv / .tsv / .json)
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSyncing(true);
      setSyncMessage(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('replaceAll', importReplaceAll ? 'true' : 'false');

      const res = await fetch(`${apiBaseUrl}/api/products/import?replace=${importReplaceAll ? 'true' : 'false'}`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        setSyncMessage({ 
          type: 'success', 
          text: data.message || `¡Se procesaron ${data.importedCount || 0} productos con sus códigos PLU y precios!` 
        });
        setIsImportModalOpen(false);
        fetchProducts();
      } else {
        setSyncMessage({ type: 'error', text: data.error || 'Error al importar archivo' });
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: 'Error procesando archivo: ' + err.message });
    } finally {
      setSyncing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    const nextPlu = `${2000 + (products.length || 0) + 1}`;
    setFormData({
      name: '',
      category: 'Parrilla',
      price: '',
      unit: 'kg',
      description: '',
      imageUrl: '',
      stock: 100,
      stockQuantity: 100,
      stockControl: false,
      stockMinAlert: 5,
      allowBackorder: true,
      isAvailable: true,
      availableInStore: true,
      availableInWhatsApp: true,
      isFeaturedWhatsApp: false,
      plu: nextPlu,
      barcode: `779${nextPlu.padStart(4, '0')}000001`,
      sku: `PLU-${nextPlu}`,
      saleMode: 'kilo',
      unitsPerKg: '',
      unitWeightGrams: '',
      unitPrice: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    const plu = product.plu || (product.barcode ? product.barcode.slice(-4) : '');
    setFormData({
      name: product.name,
      category: product.category || 'Parrilla',
      price: product.price,
      unit: product.unit || 'kg',
      description: product.description || '',
      imageUrl: product.imageUrl || product.image || '',
      stock: product.stockQuantity ?? product.stock ?? 100,
      stockQuantity: product.stockQuantity ?? product.stock ?? 100,
      stockControl: Boolean(product.stockControl),
      stockMinAlert: product.stockMinAlert ?? 5,
      allowBackorder: product.allowBackorder !== false,
      isAvailable: product.isAvailable !== false,
      availableInStore: product.availableInStore !== undefined ? Boolean(product.availableInStore) : (product.isAvailable !== false),
      availableInWhatsApp: product.availableInWhatsApp !== undefined ? Boolean(product.availableInWhatsApp) : (product.isAvailable !== false),
      isFeaturedWhatsApp: Boolean(product.isFeaturedWhatsApp),
      plu: plu,
      barcode: product.barcode || (plu ? `779${plu.padStart(4, '0')}000001` : ''),
      sku: product.sku || (plu ? `PLU-${plu}` : ''),
      saleMode: product.saleMode || (product.unitsPerKg ? 'both' : 'kilo'),
      unitsPerKg: product.unitsPerKg || '',
      unitWeightGrams: product.unitWeightGrams || '',
      unitPrice: product.unitPrice || ''
    });
    setIsModalOpen(true);
  };

  const handleOpenStockModal = (product) => {
    setStockModalProduct(product);
    setStockModalQuantity(product.stockQuantity ?? product.stock ?? 100);
    setStockModalControl(Boolean(product.stockControl));
    setStockModalMinAlert(product.stockMinAlert ?? 5);
    setStockModalAllowBackorder(product.allowBackorder !== false);
    setIsStockModalOpen(true);
  };

  const handleSaveStockAdjustment = async (e) => {
    e.preventDefault();
    if (!stockModalProduct) return;
    try {
      setIsUpdatingStock(true);
      const res = await fetch(`${apiBaseUrl}/api/products/${stockModalProduct.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockQuantity: Number(stockModalQuantity),
          isAbsolute: true,
          stockControl: stockModalControl,
          stockMinAlert: Number(stockModalMinAlert),
          allowBackorder: stockModalAllowBackorder
        })
      });
      const data = await res.json();
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === stockModalProduct.id ? { ...p, ...data.product } : p));
        setIsStockModalOpen(false);
        setSyncMessage({ type: 'success', text: `Stock de "${stockModalProduct.name}" actualizado: ${stockModalQuantity} ${stockModalProduct.unit || 'kg'}` });
        setTimeout(() => setSyncMessage(null), 3000);
      }
    } catch (err) {
      console.error('Error ajustando stock:', err);
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleToggleWhatsAppAvailability = async (product) => {
    const current = product.availableInWhatsApp !== undefined ? Boolean(product.availableInWhatsApp) : (product.isAvailable !== false);
    const newAvailable = !current;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, availableInWhatsApp: newAvailable, isAvailable: newAvailable || (p.availableInStore !== false) } : p));
    try {
      await fetch(`${apiBaseUrl}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, availableInWhatsApp: newAvailable, isAvailable: newAvailable })
      });
      setSyncMessage({
        type: 'success',
        text: `Producto "${product.name}" ${newAvailable ? 'habilitado en WhatsApp' : 'ocultado de WhatsApp'}`
      });
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('Error toggling WhatsApp availability:', err);
      fetchProducts();
    }
  };

  const handleToggleStoreAvailability = async (product) => {
    const current = product.availableInStore !== undefined ? Boolean(product.availableInStore) : (product.isAvailable !== false);
    const newAvailable = !current;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, availableInStore: newAvailable } : p));
    try {
      await fetch(`${apiBaseUrl}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, availableInStore: newAvailable })
      });
      setSyncMessage({
        type: 'success',
        text: `Producto "${product.name}" ${newAvailable ? 'habilitado en Tienda Web' : 'ocultado de Tienda Web'}`
      });
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('Error toggling Store availability:', err);
      fetchProducts();
    }
  };

  const handleToggleFeaturedWhatsApp = async (product) => {
    const newFeatured = !product.isFeaturedWhatsApp;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isFeaturedWhatsApp: newFeatured } : p));
    try {
      await fetch(`${apiBaseUrl}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, isFeaturedWhatsApp: newFeatured })
      });
      setSyncMessage({
        type: 'success',
        text: `Producto "${product.name}" ${newFeatured ? '⭐ Destacado en Menú de Bienvenida' : 'removido de destacados'}`
      });
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('Error toggling featured:', err);
      fetchProducts();
    }
  };

  const handleBulkUpdateChannel = async (channel, enabled) => {
    if (selectedProductIds.length === 0) return;
    const key = channel === 'store' ? 'availableInStore' : 'availableInWhatsApp';
    const label = channel === 'store' ? 'Tienda Web' : 'WhatsApp';
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProductIds, updates: { [key]: enabled } })
      });
      if (res.ok) {
        await fetchProducts();
        setSelectedProductIds([]);
        setSyncMessage({ type: 'success', text: `¡${selectedProductIds.length} productos ${enabled ? 'habilitados' : 'ocultados'} en ${label}!` });
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error en bulk channel update:', e);
    }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      const url = editingProduct 
        ? `${apiBaseUrl}/api/products/${editingProduct.id}`
        : `${apiBaseUrl}/api/products`;
      const method = editingProduct ? 'PUT' : 'POST';

      const finalStock = Number(formData.stockQuantity !== undefined ? formData.stockQuantity : formData.stock) || 0;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: Number(formData.price) || 0,
          imageUrl: formData.imageUrl || '',
          stock: finalStock,
          stockQuantity: finalStock,
          stockControl: Boolean(formData.stockControl),
          stockMinAlert: Number(formData.stockMinAlert ?? 5),
          allowBackorder: formData.allowBackorder !== false,
          isAvailable: Boolean(formData.isAvailable),
          availableInStore: Boolean(formData.availableInStore),
          availableInWhatsApp: Boolean(formData.availableInWhatsApp),
          isFeaturedWhatsApp: Boolean(formData.isFeaturedWhatsApp),
          unitsPerKg: formData.unitsPerKg ? Number(formData.unitsPerKg) : null,
          unitWeightGrams: formData.unitWeightGrams ? Number(formData.unitWeightGrams) : null,
          unitPrice: formData.unitPrice ? Number(formData.unitPrice) : null
        })
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchProducts();
        setSyncMessage({ type: 'success', text: `Producto ${formData.name} guardado con éxito con PLU ${formData.plu}` });
        setTimeout(() => setSyncMessage(null), 4000);
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

  const copyToClipboard = (text, type = 'plu') => {
    navigator.clipboard.writeText(text);
    setCopiedPlu(text);
    setTimeout(() => setCopiedPlu(null), 2000);
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    
    // Canal Tienda Web vs WhatsApp
    const inStore = product.availableInStore !== undefined ? Boolean(product.availableInStore) : (product.isAvailable !== false);
    const inWhatsApp = product.availableInWhatsApp !== undefined ? Boolean(product.availableInWhatsApp) : (product.isAvailable !== false);

    let matchesChannel = true;
    if (channelFilter === 'store') {
      matchesChannel = inStore;
    } else if (channelFilter === 'whatsapp') {
      matchesChannel = inWhatsApp;
    } else if (channelFilter === 'both') {
      matchesChannel = inStore && inWhatsApp;
    } else if (channelFilter === 'store_only') {
      matchesChannel = inStore && !inWhatsApp;
    } else if (channelFilter === 'whatsapp_only') {
      matchesChannel = inWhatsApp && !inStore;
    } else if (channelFilter === 'disabled') {
      matchesChannel = !inStore && !inWhatsApp;
    }

    // Filtro secundario de WhatsApp
    let matchesWhatsApp = true;
    if (whatsappFilter === 'enabled') {
      matchesWhatsApp = inWhatsApp;
    } else if (whatsappFilter === 'disabled') {
      matchesWhatsApp = !inWhatsApp;
    } else if (whatsappFilter === 'featured') {
      matchesWhatsApp = Boolean(product.isFeaturedWhatsApp);
    }

    // Filtro de Stock
    let matchesStock = true;
    if (stockFilter === 'with_control') {
      matchesStock = Boolean(product.stockControl);
    } else if (stockFilter === 'low_stock') {
      const qty = Number(product.stockQuantity ?? product.stock ?? 0);
      const min = Number(product.stockMinAlert ?? 5);
      matchesStock = product.stockControl && qty <= min && qty > 0;
    } else if (stockFilter === 'out_of_stock') {
      const qty = Number(product.stockQuantity ?? product.stock ?? 0);
      matchesStock = product.stockControl && qty <= 0;
    }

    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (product.name || '').toLowerCase().includes(term) ||
      (product.description || '').toLowerCase().includes(term) ||
      (product.category || '').toLowerCase().includes(term) ||
      (product.plu || '').toLowerCase().includes(term) ||
      (product.barcode || '').toLowerCase().includes(term) ||
      (product.sku || '').toLowerCase().includes(term);
    return matchesCategory && matchesChannel && matchesWhatsApp && matchesStock && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] h-full overflow-hidden text-slate-200">
      {/* Input oculto para importación de archivos */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv, .txt, .json"
        className="hidden"
      />

      {/* Header */}
      <div className="bg-[#111b21] border-b border-[#222e35] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            Catálogo de Productos & Códigos PLU de Balanza
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Administra los cortes, precios, stock y códigos de barras EAN/PLU sincronizados con el Asesor Virtual y las Balanzas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Cargar Catálogo Maestro Oficial */}
          <button
            onClick={handleSeedMasterCatalog}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 hover:text-white transition disabled:opacity-50 shadow-sm"
            title="Cargar los 757 productos oficiales con códigos PLU del negocio"
          >
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span>Catálogo Oficial (757 PLUs)</span>
          </button>

          {/* Exportar Multi-Formato Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-200 hover:text-white transition"
              title="Descargar Catálogo en Excel, CSV o JSON"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar</span>
              <span className="text-[10px] text-slate-400">▼</span>
            </button>

            {showExportMenu && (
              <div 
                className="absolute right-0 mt-1.5 w-48 bg-[#182229] border border-slate-700 rounded-2xl shadow-2xl z-30 py-1.5 overflow-hidden animate-fade-in text-xs"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <button
                  onClick={() => handleExport('xlsx')}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#202c33] text-slate-200 hover:text-emerald-400 flex items-center justify-between transition"
                >
                  <span className="font-semibold">📊 Excel Moderno (.xlsx)</span>
                </button>
                <button
                  onClick={() => handleExport('xls')}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#202c33] text-slate-200 hover:text-emerald-400 flex items-center justify-between transition"
                >
                  <span className="font-semibold">📑 Excel 97-2004 (.xls)</span>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#202c33] text-slate-200 hover:text-emerald-400 flex items-center justify-between transition"
                >
                  <span className="font-semibold">📄 CSV (; UTF-8 BOM)</span>
                </button>
                <div className="border-t border-slate-800 my-1"></div>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#202c33] text-slate-200 hover:text-sky-400 flex items-center justify-between transition"
                >
                  <span className="font-semibold">🗄️ JSON Estructurado</span>
                </button>
              </div>
            )}
          </div>

          {/* Importar Archivo Excel / CSV Modal */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-200 hover:text-white transition disabled:opacity-50"
            title="Importar catálogo desde archivo Excel (.xlsx, .xls) o CSV"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Importar Excel/CSV</span>
          </button>

          {/* Sincronizar Catálogo WhatsApp */}
          <button
            onClick={handleSyncWithWhatsApp}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 text-slate-200 hover:text-white transition disabled:opacity-50"
            title="Sincronizar catálogo con WhatsApp Business"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          {/* Nuevo Producto */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* Sync Message Alert */}
      {syncMessage && (
        <div className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${
          syncMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          {syncMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* Search, Categories and View Mode Bar */}
      <div className="p-4 bg-[#111b21] border-b border-[#222e35] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por corte, código PLU, código de barras o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-[#182229] border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filtros rápidos de Canal (Tienda Web vs WhatsApp) & Stock */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => { setChannelFilter('all'); setWhatsappFilter('all'); setStockFilter('all'); }}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                channelFilter === 'all' && whatsappFilter === 'all' && stockFilter === 'all'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Todos ({products.length})
            </button>
            <button
              onClick={() => { setChannelFilter('store'); setWhatsappFilter('all'); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                channelFilter === 'store'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-emerald-400 hover:text-emerald-300 border border-slate-800'
              }`}
            >
              <Store size={12} />
              <span>En Tienda Web ({products.filter(p => p.availableInStore !== false && p.isAvailable !== false).length})</span>
            </button>
            <button
              onClick={() => { setChannelFilter('whatsapp'); setWhatsappFilter('all'); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                channelFilter === 'whatsapp'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-emerald-400 hover:text-emerald-300 border border-slate-800'
              }`}
            >
              <Smartphone size={12} />
              <span>En WhatsApp ({products.filter(p => p.availableInWhatsApp !== false && p.isAvailable !== false).length})</span>
            </button>
            <button
              onClick={() => { setChannelFilter('both'); setWhatsappFilter('all'); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                channelFilter === 'both'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-teal-400 hover:text-teal-300 border border-slate-800'
              }`}
            >
              <Globe size={12} />
              <span>Ambos Canales ({products.filter(p => (p.availableInStore !== false) && (p.availableInWhatsApp !== false) && p.isAvailable !== false).length})</span>
            </button>
            <button
              onClick={() => setWhatsappFilter('featured')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                whatsappFilter === 'featured'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-amber-400 hover:text-amber-300 border border-slate-800'
              }`}
            >
              <Star size={12} fill="currentColor" />
              <span>Destacados ({products.filter(p => p.isFeaturedWhatsApp).length})</span>
            </button>

            {/* Separador */}
            <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

            <button
              onClick={() => setStockFilter('with_control')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                stockFilter === 'with_control'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-sky-400 hover:text-sky-300 border border-slate-800'
              }`}
            >
              <Boxes size={12} />
              <span>Con Control ({products.filter(p => p.stockControl).length})</span>
            </button>
            <button
              onClick={() => setStockFilter('low_stock')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                stockFilter === 'low_stock'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[#182229] text-amber-400 hover:text-amber-300 border border-slate-800'
              }`}
            >
              <AlertTriangle size={12} />
              <span>Stock Bajo ({products.filter(p => p.stockControl && (p.stockQuantity ?? p.stock ?? 0) <= (p.stockMinAlert || 5) && (p.stockQuantity ?? p.stock ?? 0) > 0).length})</span>
            </button>
            <button
              onClick={() => setStockFilter('out_of_stock')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                stockFilter === 'out_of_stock'
                  ? 'bg-rose-500 text-white font-bold shadow-sm'
                  : 'bg-[#182229] text-rose-400 hover:text-rose-300 border border-slate-800'
              }`}
            >
              <AlertCircle size={12} />
              <span>Agotados ({products.filter(p => p.stockControl && (p.stockQuantity ?? p.stock ?? 0) <= 0).length})</span>
            </button>
          </div>

          {/* Toggle View Mode */}
          <div className="flex items-center bg-[#182229] border border-slate-700/60 rounded-xl p-1 shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                localStorage.setItem('catalog_view_mode', 'table');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'table' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista en Lista / Tabla detallada con Códigos PLU"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabla</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                localStorage.setItem('catalog_view_mode', 'grid');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'grid' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista en Tarjetas"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tarjetas</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat === 'all' ? 'Todas las Categorías' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Content */}
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
              Carga el catálogo maestro de productos con códigos PLU de la base de conocimiento o importa un archivo Excel/CSV.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleSeedMasterCatalog}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/20 transition"
              >
                🥩 Cargar Catálogo Oficial
              </button>
              <button
                onClick={handleOpenCreateModal}
                className="px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 rounded-xl text-xs font-semibold text-emerald-400"
              >
                Crear producto manual
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* VISTA EN FORMATO LISTA / TABLA DE PRODUCTOS CON CÓDIGOS PLU */
          <div className="bg-[#182229] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#111b21] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3.5 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={handleToggleSelectAll}
                        className="rounded text-emerald-500 bg-[#182229] border-slate-700 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-3.5 px-4">Código PLU</th>
                    <th className="py-3.5 px-4">Código de Barras (EAN-13)</th>
                    <th className="py-3.5 px-4">Nombre del Corte / Producto</th>
                    <th className="py-3.5 px-4">Categoría</th>
                    <th className="py-3.5 px-4">Precio / Unidad</th>
                    <th className="py-3.5 px-4">Alícuota IVA</th>
                    <th className="py-3.5 px-4 text-center">Control de Stock</th>
                    <th className="py-3.5 px-4 text-center">🌐 Tienda Web</th>
                    <th className="py-3.5 px-4 text-center">📱 WhatsApp</th>
                    <th className="py-3.5 px-4 text-center">⭐ Top 8</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredProducts.map(prod => {
                    const plu = prod.plu || (prod.barcode ? prod.barcode.slice(-4) : '2001');
                    const barcode = prod.barcode || `779${String(plu).padStart(4, '0')}000001`;
                    const currentStock = Number(prod.stockQuantity ?? prod.stock ?? 0);
                    const minAlert = Number(prod.stockMinAlert ?? 5);
                    const isSelected = selectedProductIds.includes(prod.id);
                    const isStoreActive = prod.availableInStore !== false && prod.isAvailable !== false;
                    const isWhatsAppActive = prod.availableInWhatsApp !== false && prod.isAvailable !== false;

                    return (
                      <tr key={prod.id} className={`transition-colors ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-[#202c33]/50'}`}>
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectProduct(prod.id)}
                            className="rounded text-emerald-500 bg-[#182229] border-slate-700 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            onClick={() => copyToClipboard(plu, 'plu')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-extrabold text-xs transition"
                            title="Click para copiar código PLU de balanza"
                          >
                            <Tag className="w-3 h-3 text-emerald-400" />
                            <span>PLU {plu}</span>
                            {copiedPlu === plu && <Check className="w-3 h-3 text-emerald-300 ml-0.5" />}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            onClick={() => copyToClipboard(barcode, 'barcode')}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white transition"
                            title="Copiar código de barras EAN-13"
                          >
                            <Barcode className="w-3.5 h-3.5 text-slate-500" />
                            <span>{barcode}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 min-w-[220px]">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{prod.name}</span>
                            {prod.isFeaturedWhatsApp && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                ⭐ Top 8
                              </span>
                            )}
                          </div>
                          {prod.description && (
                            <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{prod.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#202c33] text-emerald-400 border border-emerald-500/20">
                            {prod.category || 'General'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-white whitespace-nowrap">
                          <span className="text-emerald-400 text-sm">${Number(prod.price).toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 font-normal ml-0.5">/{prod.unit || 'kg'}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                            Number(prod.ivaRate ?? 10.5) === 10.5
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              : Number(prod.ivaRate) === 21
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : 'bg-slate-700 text-slate-300 border-slate-600'
                          }`}>
                            IVA {prod.ivaRate !== undefined ? `${prod.ivaRate}%` : '10.5%'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          {prod.stockControl ? (
                            <button
                              onClick={() => handleOpenStockModal(prod)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold transition active:scale-95 border ${
                                currentStock <= 0
                                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
                                  : currentStock <= minAlert
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                              }`}
                              title="Click para ajustar stock o inventario físico"
                            >
                              <Boxes size={12} />
                              <span>{currentStock} {prod.unit || 'kg'}</span>
                              {currentStock <= 0 && <span className="text-[10px] uppercase ml-1">Agotado</span>}
                              {currentStock > 0 && currentStock <= minAlert && <span className="text-[10px] ml-1">⚠️ Bajo</span>}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenStockModal(prod)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition"
                              title="Click para activar control de stock en este producto"
                            >
                              <span className="text-slate-500">Ilimitado</span>
                              <span className="text-[10px] text-emerald-400 underline ml-0.5">+ Activar</span>
                            </button>
                          )}
                        </td>
                        {/* Tienda Web Toggle */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleToggleStoreAvailability(prod)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition active:scale-95 ${
                              isStoreActive
                                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30'
                            }`}
                            title={isStoreActive ? 'Click para ocultar de la Tienda Web' : 'Click para activar en la Tienda Web'}
                          >
                            {isStoreActive ? (
                              <>
                                <Store size={12} />
                                <span>Activo</span>
                              </>
                            ) : (
                              <>
                                <EyeOff size={12} />
                                <span>Oculto</span>
                              </>
                            )}
                          </button>
                        </td>
                        {/* WhatsApp Toggle */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleToggleWhatsAppAvailability(prod)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition active:scale-95 ${
                              isWhatsAppActive
                                ? 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30'
                                : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30'
                            }`}
                            title={isWhatsAppActive ? 'Click para ocultar de WhatsApp' : 'Click para activar en WhatsApp'}
                          >
                            {isWhatsAppActive ? (
                              <>
                                <Smartphone size={12} />
                                <span>Activo</span>
                              </>
                            ) : (
                              <>
                                <EyeOff size={12} />
                                <span>Oculto</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleToggleFeaturedWhatsApp(prod)}
                            className={`p-1.5 rounded-xl border transition active:scale-95 ${
                              prod.isFeaturedWhatsApp
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                                : 'text-slate-500 hover:text-slate-300 bg-[#202c33] border-slate-700/60'
                            }`}
                            title={prod.isFeaturedWhatsApp ? 'Destacado en Menú de Bienvenida de WhatsApp' : 'Click para destacar en Menú de Bienvenida'}
                          >
                            <Star size={14} fill={prod.isFeaturedWhatsApp ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenStockModal(prod)}
                              className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-sky-400 rounded-lg transition"
                              title="Ajuste rápido de stock"
                            >
                              <Boxes className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(prod)}
                              className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-emerald-400 rounded-lg transition"
                              title="Editar producto, precio y PLU"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod.id)}
                              className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-rose-400 rounded-lg transition"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* VISTA EN FORMATO CUADRÍCULA / TARJETAS */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(prod => {
              const plu = prod.plu || (prod.barcode ? prod.barcode.slice(-4) : '2001');
              const barcode = prod.barcode || `779${plu.padStart(4, '0')}000001`;

              return (
                <div
                  key={prod.id}
                  className="group relative bg-[#111b21] hover:bg-[#182229] border border-[#222e35] hover:border-emerald-500/40 rounded-2xl p-4 flex flex-col justify-between transition shadow-md hover:shadow-xl hover:shadow-emerald-500/5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        onClick={() => copyToClipboard(plu, 'plu')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-black text-[11px] transition"
                        title="Click para copiar PLU"
                      >
                        <Tag className="w-3 h-3 text-emerald-400" />
                        <span>PLU {plu}</span>
                        {copiedPlu === plu && <Check className="w-3 h-3 text-emerald-300 ml-0.5" />}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleFeaturedWhatsApp(prod)}
                          className={`p-1 rounded-lg border transition ${
                            prod.isFeaturedWhatsApp
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'text-slate-600 hover:text-slate-400 border-transparent'
                          }`}
                          title="Destacar en menú de bienvenida"
                        >
                          <Star size={13} fill={prod.isFeaturedWhatsApp ? 'currentColor' : 'none'} />
                        </button>

                        <button
                          onClick={() => handleToggleStoreAvailability(prod)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                            prod.availableInStore !== false && prod.isAvailable !== false
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                          title="Click para alternar disponibilidad en Tienda Web"
                        >
                          {prod.availableInStore !== false && prod.isAvailable !== false ? '🌐 Tienda' : '🌐 Off'}
                        </button>

                        <button
                          onClick={() => handleToggleWhatsAppAvailability(prod)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                            prod.availableInWhatsApp !== false && prod.isAvailable !== false
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                          title="Click para alternar disponibilidad en WhatsApp"
                        >
                          {prod.availableInWhatsApp !== false && prod.isAvailable !== false ? '📱 WApp' : '📱 Off'}
                        </button>
                      </div>
                    </div>

                    <h3 className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                      {prod.name}
                    </h3>
                    {prod.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">{prod.description}</p>
                    )}

                    {/* Badge de Stock en Tarjeta */}
                    <div className="mt-2.5">
                      {prod.stockControl ? (
                        <button
                          onClick={() => handleOpenStockModal(prod)}
                          className={`w-full flex items-center justify-between px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                            (prod.stockQuantity ?? prod.stock ?? 0) <= 0
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : (prod.stockQuantity ?? prod.stock ?? 0) <= (prod.stockMinAlert || 5)
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          }`}
                          title="Click para ajustar stock o inventario físico"
                        >
                          <span className="flex items-center gap-1">
                            <Boxes size={12} />
                            <span>Stock: {prod.stockQuantity ?? prod.stock ?? 0} {prod.unit || 'kg'}</span>
                          </span>
                          <span className="text-[10px] underline">Ajustar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenStockModal(prod)}
                          className="w-full flex items-center justify-between px-2.5 py-1 rounded-xl text-xs text-slate-400 bg-slate-800/60 border border-slate-700/60 hover:text-white transition"
                          title="Click para activar control de stock"
                        >
                          <span>Stock: Ilimitado</span>
                          <span className="text-[10px] text-emerald-400 underline">+ Activar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-base font-black text-emerald-400">
                        ${Number(prod.price).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">/{prod.unit || 'kg'}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenStockModal(prod)}
                        className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-sky-400 rounded-lg transition"
                        title="Ajuste rápido de stock"
                      >
                        <Boxes className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(prod)}
                        className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-emerald-400 rounded-lg transition"
                        title="Editar producto"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-1.5 hover:bg-[#202c33] text-slate-400 hover:text-rose-400 rounded-lg transition"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Crear / Editar Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#222e35] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-[#222e35] flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                {editingProduct ? 'Editar Producto & Código PLU' : 'Nuevo Producto en Catálogo'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-[#202c33] text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre del Corte / Producto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Tapa de Cuadril Seleccionada"
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
                    {Array.from(new Set([
                      'Parrilla',
                      'Parrilla y Horno',
                      'Cortes Premium',
                      'Cerdo',
                      'Cerdo y Parrilla',
                      'Cortes Tradicionales',
                      'Embutidos',
                      'Achuras',
                      'Diario y Preparados',
                      'Pollo',
                      'Almacén Parrillero',
                      'Bebidas',
                      'Combos en Oferta',
                      'General'
                    ])).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Unidad de Medida</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="kg">Por Kilo (kg)</option>
                    <option value="unidad">Por Unidad (un)</option>
                    <option value="combo">Por Combo (promo)</option>
                    <option value="paquete">Por Paquete</option>
                    <option value="bolsa">Por Bolsa (carbón)</option>
                    <option value="botella">Por Botella (vino/bebida)</option>
                    <option value="bandeja">Por Bandeja</option>
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
                    placeholder="12800"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Stock Estimado</label>
                  <input
                    type="number"
                    placeholder="100"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <Tag size={13} className="text-emerald-400" />
                    Código PLU *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 2001 o VAC-01"
                    value={formData.plu}
                    onChange={(e) => {
                      const val = e.target.value.trim().toUpperCase();
                      setFormData({ 
                        ...formData, 
                        plu: val,
                        barcode: val && /^\d+$/.test(val) ? `779${val.padStart(4, '0')}000001` : formData.barcode,
                        sku: val ? `PLU-${val}` : formData.sku
                      });
                    }}
                    className="w-full px-3 py-2 bg-[#202c33] border border-emerald-500/40 rounded-xl text-xs text-emerald-400 font-mono font-bold placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <Barcode size={13} className="text-slate-400" />
                    Código de Barras
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 7792001000001"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Alícuota IVA (ARCA)</label>
                  <select
                    value={formData.ivaRate !== undefined ? formData.ivaRate : 10.5}
                    onChange={(e) => setFormData({ ...formData, ivaRate: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#202c33] border border-blue-500/40 rounded-xl text-xs text-blue-300 font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value={10.5}>10.5% (Carnes)</option>
                    <option value={21.0}>21.0% (General / Elaborados)</option>
                    <option value={0}>0% (Exento)</option>
                  </select>
                </div>
              </div>

              {/* Modalidad de Venta & Estimación de Piezas por Kilo */}
              <div className="p-3.5 bg-[#182229] border border-slate-700/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <span>⚖️</span> Modalidad de Venta & Piezas por Kilo
                  </span>
                  <span className="text-[10px] text-slate-400">Para clientes que piden por unidad</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Unidades / kg
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ej: 8 (chorizos)"
                      value={formData.unitsPerKg}
                      onChange={(e) => {
                        const upk = e.target.value;
                        const p = Number(formData.price) || 0;
                        const calculatedWeight = upk ? Math.round(1000 / Number(upk)) : '';
                        const calculatedUnitPrice = (upk && p) ? Math.round(p / Number(upk)) : '';
                        setFormData({
                          ...formData,
                          unitsPerKg: upk,
                          unitWeightGrams: calculatedWeight,
                          unitPrice: calculatedUnitPrice
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Peso Estimado (g)
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 125g"
                      value={formData.unitWeightGrams}
                      onChange={(e) => setFormData({ ...formData, unitWeightGrams: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Precio sugerido ($/un)
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: $625"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-emerald-400 font-bold placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  💡 Si el cliente pide ej: "6 chorizos", la IA calculará automáticamente ~0.75 kg (6 / 8 un/kg).
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descripción & Recomendaciones de Cocina</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Corte tierno con cobertura de grasa ideal para asar a fuego lento o al horno..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#202c33] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Control de Stock Detallado (Opcional) */}
              <div className="p-3.5 bg-[#182229] border border-slate-700/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-white">Control de Stock Detallado</span>
                      <span className="text-[10px] text-slate-400 block">Descuento automático al vender y alertas de reposición</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.stockControl)}
                      onChange={(e) => setFormData({ ...formData, stockControl: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {formData.stockControl && (
                  <div className="pt-2 border-t border-slate-700/60 grid grid-cols-3 gap-2 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Stock Actual ({formData.unit || 'kg'})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Ej: 50"
                        value={formData.stockQuantity !== undefined ? formData.stockQuantity : formData.stock}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormData({ ...formData, stockQuantity: val, stock: val });
                        }}
                        className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white font-bold placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Alerta Mínima
                      </label>
                      <input
                        type="number"
                        step="1"
                        placeholder="Ej: 5"
                        value={formData.stockMinAlert ?? 5}
                        onChange={(e) => setFormData({ ...formData, stockMinAlert: Number(e.target.value) })}
                        className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-amber-400 font-bold placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex flex-col justify-between">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Venta s/ stock
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={formData.allowBackorder !== false}
                          onChange={(e) => setFormData({ ...formData, allowBackorder: e.target.checked })}
                          className="rounded text-emerald-500 focus:ring-0 bg-slate-800 border-slate-700"
                        />
                        <span>Permitir</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Imagen del Producto desde Galería WebP */}
              <div className="p-3 bg-[#182229] border border-slate-700/60 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Foto del Producto (Galería WebP)</span>
                  {formData.imageUrl && <span className="text-[10px] text-emerald-400 font-semibold">✓ Imagen vinculada</span>}
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center relative shrink-0">
                    {formData.imageUrl ? (
                      <img src={formData.imageUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMediaGalleryPickerOpen(true)}
                        className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <ImageIcon size={13} />
                        <span>{formData.imageUrl ? 'Cambiar Imagen' : 'Elegir de Galería'}</span>
                      </button>
                      {formData.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, imageUrl: '' })}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition"
                          title="Quitar imagen"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="O pegar URL directa de imagen..."
                      value={formData.imageUrl || ''}
                      onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                      className="w-full px-2.5 py-1 bg-[#111b21] border border-slate-700 rounded-lg text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500 truncate"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-3">
                {/* Switch Tienda Web */}
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="availableInStore" className="text-xs font-bold text-emerald-400 cursor-pointer flex items-center gap-1.5">
                      <Store size={14} />
                      Disponible en Tienda Web (Apple Glass)
                    </label>
                    <p className="text-[10px] text-slate-400">Si se activa, el producto se exhibirá en el catálogo público /tienda.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="availableInStore"
                    checked={formData.availableInStore !== false}
                    onChange={(e) => setFormData({ ...formData, availableInStore: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-[#202c33]"
                  />
                </div>

                {/* Switch WhatsApp */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div>
                    <label htmlFor="availableInWhatsApp" className="text-xs font-bold text-sky-400 cursor-pointer flex items-center gap-1.5">
                      <Smartphone size={14} />
                      Disponible en WhatsApp (Asesor IA)
                    </label>
                    <p className="text-[10px] text-slate-400">Si se desactiva, el asesor virtual no lo cotizará ni lo incluirá en ventas.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="availableInWhatsApp"
                    checked={formData.availableInWhatsApp !== false}
                    onChange={(e) => setFormData({ ...formData, availableInWhatsApp: e.target.checked, isAvailable: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-[#202c33]"
                  />
                </div>

                {/* Switch Top 8 */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div>
                    <label htmlFor="isFeaturedWhatsApp" className="text-xs font-bold text-amber-300 cursor-pointer flex items-center gap-1.5">
                      <Star size={14} className="text-amber-400" fill="currentColor" />
                      Destacar en Menú Principal (Top 8)
                    </label>
                    <p className="text-[10px] text-slate-400">Aparecerá en la lista inicial de 8 ofertas que se le presentan al cliente.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="isFeaturedWhatsApp"
                    checked={Boolean(formData.isFeaturedWhatsApp)}
                    onChange={(e) => setFormData({ ...formData, isFeaturedWhatsApp: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-[#202c33]"
                  />
                </div>
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

      {/* Modal de Importación Multi-Formato (Excel .xlsx / .xls / .csv) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Importar Catálogo de Productos</h3>
                  <p className="text-xs text-slate-400">Compatible con Excel (.xlsx, .xls) y CSV (Cod.;Producto;Precio)</p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drop Zone / File Input Area */}
            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/80 rounded-2xl p-6 text-center space-y-3 bg-[#111b21]/60 transition group">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv,.tsv,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto group-hover:scale-110 transition">
                <Upload size={24} />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={syncing}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition shadow-md shadow-emerald-500/20"
                >
                  {syncing ? 'Procesando archivo...' : 'Seleccionar Archivo Excel o CSV'}
                </button>
                <p className="text-[11px] text-slate-400 mt-2">
                  Formatos soportados: <b>.xlsx</b>, <b>.xls</b>, <b>.csv</b>, <b>.tsv</b>, <b>.json</b>
                </p>
              </div>
            </div>

            {/* Options */}
            <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importReplaceAll}
                  onChange={(e) => setImportReplaceAll(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-[#202c33]"
                />
                <span className="text-slate-300 font-semibold">
                  Reemplazar catálogo completo (borrar productos anteriores e importar nuevos)
                </span>
              </label>
              <p className="text-[10px] text-slate-500 italic pl-6">
                Si no se marca, los productos existentes se actualizarán y se agregarán los nuevos sin borrar nada.
              </p>
            </div>

            {/* Format Hint */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-[11px] text-purple-300 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <span>📋 Formato de Columnas Aceptado:</span>
              </div>
              <p className="font-mono text-[10px] text-purple-200 bg-purple-950/40 p-1.5 rounded">
                Cod.;Producto;Precio
              </p>
              <p className="text-[10px] text-purple-400">
                Los códigos numéricos de hasta 5 dígitos se asignan automáticamente como <b>PLU</b>, los de 13 dígitos como <b>Código de Barras</b> y los alfanuméricos como <b>SKU</b>.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition"
              >
                <Download size={12} /> Descargar plantilla Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#111b21] hover:bg-[#202c33] text-slate-300 text-xs font-semibold border border-slate-800"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Ajuste Rápido de Stock e Inventario */}
      {isStockModalOpen && stockModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  <Boxes size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Ajuste de Stock e Inventario</h3>
                  <p className="text-xs text-slate-400">PLU {stockModalProduct.plu} — {stockModalProduct.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="space-y-4 text-xs">
              {/* Switch de control de stock */}
              <div className="p-3 bg-[#111b21] rounded-2xl border border-slate-700/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Control de Stock Activo</span>
                  <span className="text-[10px] text-slate-400">Descuenta automáticamente en cada venta</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stockModalControl}
                    onChange={(e) => setStockModalControl(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Cantidad de Stock Actual */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center justify-between">
                  <span>Stock Actual Disponible:</span>
                  <span className="text-emerald-400 font-mono font-bold">{stockModalProduct.unit || 'kg'}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStockModalQuantity(prev => Math.max(0, Number((Number(prev) - 5).toFixed(1))))}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockModalQuantity(prev => Math.max(0, Number((Number(prev) - 1).toFixed(1))))}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={stockModalQuantity}
                    onChange={(e) => setStockModalQuantity(Number(e.target.value))}
                    className="flex-1 text-center py-2 bg-[#111b21] border border-slate-700 rounded-xl text-white font-extrabold text-base focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setStockModalQuantity(prev => Number((Number(prev) + 1).toFixed(1)))}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockModalQuantity(prev => Number((Number(prev) + 10).toFixed(1)))}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700"
                  >
                    +10
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Alerta Mínima:</label>
                  <input
                    type="number"
                    value={stockModalMinAlert}
                    onChange={(e) => setStockModalMinAlert(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Venta s/ stock:</label>
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={stockModalAllowBackorder}
                        onChange={(e) => setStockModalAllowBackorder(e.target.checked)}
                        className="rounded text-emerald-500 bg-slate-800 border-slate-700"
                      />
                      <span>Permitir venta</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#111b21] text-slate-400 hover:text-white border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStock}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition disabled:opacity-50"
                >
                  <Check size={14} />
                  {isUpdatingStock ? 'Guardando...' : 'Guardar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media Gallery Picker Modal */}
      <MediaGalleryModal
        isOpen={isMediaGalleryPickerOpen}
        onClose={() => setIsMediaGalleryPickerOpen(false)}
        onSelectImage={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
        selectedImageUrl={formData.imageUrl}
      />

      {/* Barra Flotante de Acciones Masivas en Lote */}
      {selectedProductIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#182229]/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
              {selectedProductIds.length}
            </span>
            <span className="text-xs font-bold text-white hidden sm:inline">Seleccionados</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBulkUpdatePrice}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition"
              title="Aumentar o reducir precio en % a todos los seleccionados"
            >
              📈 Precios %
            </button>

            {/* Bulk Tienda Web Toggle */}
            <div className="flex items-center bg-[#111b21] rounded-xl p-0.5 border border-slate-700">
              <button
                onClick={() => handleBulkUpdateChannel('store', true)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1"
                title="Habilitar en Tienda Web a seleccionados"
              >
                <Store size={11} /> +Tienda
              </button>
              <button
                onClick={() => handleBulkUpdateChannel('store', false)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition"
                title="Ocultar de Tienda Web a seleccionados"
              >
                -Tienda
              </button>
            </div>

            {/* Bulk WhatsApp Toggle */}
            <div className="flex items-center bg-[#111b21] rounded-xl p-0.5 border border-slate-700">
              <button
                onClick={() => handleBulkUpdateChannel('whatsapp', true)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-sky-400 hover:bg-sky-500/20 transition flex items-center gap-1"
                title="Habilitar en WhatsApp a seleccionados"
              >
                <Smartphone size={11} /> +WApp
              </button>
              <button
                onClick={() => handleBulkUpdateChannel('whatsapp', false)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition"
                title="Ocultar de WhatsApp a seleccionados"
              >
                -WApp
              </button>
            </div>

            <button
              onClick={() => handleBulkUpdateIva(10.5)}
              className="px-2.5 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-bold border border-blue-500/30 transition"
              title="Asignar IVA 10.5% (Carnes)"
            >
              IVA 10.5%
            </button>

            <button
              onClick={() => handleBulkUpdateIva(21.0)}
              className="px-2.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold border border-purple-500/30 transition"
              title="Asignar IVA 21% (Elaborados/Almacén)"
            >
              IVA 21%
            </button>

            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold border border-rose-500/30 transition"
              title="Eliminar productos seleccionados"
            >
              <Trash2 size={13} className="inline mr-1" /> Eliminar
            </button>

            <button
              onClick={() => setSelectedProductIds([])}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1"
              title="Cancelar selección"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
