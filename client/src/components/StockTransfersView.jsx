import React, { useState, useEffect, useRef } from 'react';
import {
  Boxes,
  ArrowRightLeft,
  Truck,
  Receipt,
  Scan,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Upload,
  Camera,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Building2,
  Trash2,
  Scale,
  DollarSign,
  Package,
  Layers,
  ChevronRight,
  Sparkles,
  Eye,
  X,
  ExternalLink,
  Store,
  Calendar,
  UserCheck,
  VolumeX,
  MessageSquare,
  Bot,
  Share2,
  Link,
  ShieldCheck,
  Check,
  AlertCircle,
  Copy,
  Pencil
} from 'lucide-react';

export const EXPENSE_CATEGORIES = [
  { id: 'mercaderia', label: '🥩 Mercadería & Cortes (Suma a Stock)', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { id: 'insumos', label: '📦 Insumos & Empaques', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: 'mantenimiento', label: '🔧 Mantenimiento & Maquinarias', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { id: 'servicios', label: '💡 Servicios Públicos (Luz/Gas)', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { id: 'otros', label: '📝 Otros Gastos Operativos', badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
];

export default function StockTransfersView({ socket, currentUser, initialTab = 'stock' }) {
  // Navigation tabs within Stock module
  const [activeTab, setActiveTab] = useState(initialTab || 'stock');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Global Data
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [stockList, setStockList] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Multi-Group Silent Groups state
  const [silentGroups, setSilentGroups] = useState([]);
  const [participatingGroups, setParticipatingGroups] = useState([]);
  const [silentGroupSettings, setSilentGroupSettings] = useState({
    supplierScanGroupEnabled: true,
    supplierScanGroupId: '',
    defaultSupplierBranchId: 'br-1',
    autoConfirmGroupInvoices: true,
    notifyAdminOnGroupInvoice: true,
    adminNotifyPhone: '',
    silentGroups: []
  });
  const [newGroupMapping, setNewGroupMapping] = useState({
    groupId: '',
    groupName: '',
    branchId: 'br-1',
    expenseCategory: 'mercaderia',
    autoConfirm: true
  });
  const [groupInviteUrl, setGroupInviteUrl] = useState('');
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [isSavingGroupSettings, setIsSavingGroupSettings] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isAddingGroupMapping, setIsAddingGroupMapping] = useState(false);

  // Edit Invoice Modal (a posteriori)
  const [isEditInvoiceModalOpen, setIsEditInvoiceModalOpen] = useState(false);
  const [editingInvoiceData, setEditingInvoiceData] = useState(null);
  const [isSavingInvoiceEdit, setIsSavingInvoiceEdit] = useState(false);

  // Modals state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState(null);
  const [adjustData, setAdjustData] = useState({ quantity: 1, type: 'manual_adjustment', reason: '', cost: 0 });

  const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false);
  const [newTransferData, setNewTransferData] = useState({
    fromBranchId: '',
    toBranchId: '',
    items: [],
    notes: '',
    dispatchedBy: currentUser?.name || 'Encargado'
  });

  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [supplierFormData, setSupplierFormData] = useState({
    name: '', cuit: '', phone: '', email: '', address: '', category: 'Carne Vacuna', paymentTerms: 'Contado'
  });

  // TicketScan OCR Modal
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scanStep, setScanStep] = useState('upload'); // 'upload' | 'scanning' | 'review'
  const [scannedImagePreview, setScannedImagePreview] = useState(null);
  const [extractedInvoiceData, setExtractedInvoiceData] = useState(null);
  const [selectedInvoiceBranchId, setSelectedInvoiceBranchId] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);

  // Scale test state
  const [scaleBarcodeTest, setScaleBarcodeTest] = useState('2002008015403');
  const [scaleParseResult, setScaleParseResult] = useState(null);

  // Load initial data
  const loadBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (Array.isArray(data)) {
        setBranches(data);
        if (!selectedBranchId && data.length > 0) {
          setSelectedBranchId(data[0].id);
          setSelectedInvoiceBranchId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Error cargando sucursales:', e);
    }
  };

  const loadStock = async () => {
    try {
      setLoading(true);
      const url = selectedBranchId 
        ? `/api/inventory/stock?branchId=${encodeURIComponent(selectedBranchId)}` 
        : '/api/inventory/stock';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setStockList(data.stock || []);
      }
    } catch (e) {
      console.error('Error cargando stock:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCatalogProducts(data);
      }
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  };

  const loadTransfers = async () => {
    try {
      const res = await fetch('/api/inventory/transfers');
      const data = await res.json();
      if (data.success) {
        setTransfers(data.transfers || []);
      }
    } catch (e) {
      console.error('Error cargando traspasos:', e);
    }
  };

  const loadInvoices = async () => {
    try {
      const res = await fetch('/api/inventory/invoices');
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
      }
    } catch (e) {
      console.error('Error cargando facturas:', e);
    }
  };

  const loadSuppliers = async () => {
    try {
      const res = await fetch('/api/inventory/suppliers');
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.suppliers || []);
      }
    } catch (e) {
      console.error('Error cargando proveedores:', e);
    }
  };

  const loadParticipatingGroups = async () => {
    try {
      setIsLoadingGroups(true);
      const res = await fetch('/api/whatsapp/groups');
      const data = await res.json();
      if (data.success) {
        setParticipatingGroups(data.groups || []);
      }
    } catch (e) {
      console.error('Error cargando grupos de WhatsApp:', e);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const loadSilentGroups = async () => {
    try {
      const res = await fetch('/api/inventory/silent-groups');
      const data = await res.json();
      if (data.success) {
        setSilentGroups(data.groups || []);
      }
    } catch (e) {
      console.error('Error cargando grupos silenciosos:', e);
    }
  };

  const handleAddGroupMapping = async (e) => {
    if (e) e.preventDefault();
    if (!newGroupMapping.groupId) {
      alert('Seleccione o ingrese un ID de grupo de WhatsApp');
      return;
    }
    try {
      setIsAddingGroupMapping(true);
      const found = participatingGroups.find(g => g.id === newGroupMapping.groupId);
      const groupName = newGroupMapping.groupName || found?.subject || newGroupMapping.groupId;

      const res = await fetch('/api/inventory/silent-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newGroupMapping,
          groupName
        })
      });
      const data = await res.json();
      if (data.success) {
        setSilentGroups(data.groups || []);
        setNewGroupMapping({
          groupId: '',
          groupName: '',
          branchId: branches[0]?.id || 'br-1',
          expenseCategory: 'mercaderia',
          autoConfirm: true
        });
        alert('✅ Grupo vinculado exitosamente.');
      } else {
        alert(data.error || 'Error vinculando grupo');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setIsAddingGroupMapping(false);
    }
  };

  const handleDeleteGroupMapping = async (idOrGroupId) => {
    if (!confirm('¿Desea desvincular este grupo del escáner silencioso?')) return;
    try {
      const res = await fetch(`/api/inventory/silent-groups/${encodeURIComponent(idOrGroupId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSilentGroups(data.groups || []);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleGroupActive = async (group) => {
    try {
      const res = await fetch('/api/inventory/silent-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...group,
          active: !group.active
        })
      });
      const data = await res.json();
      if (data.success) {
        setSilentGroups(data.groups || []);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Open Edit Invoice Modal (a posteriori)
  const handleOpenEditInvoice = (inv) => {
    setEditingInvoiceData({
      id: inv.id,
      supplierId: inv.supplierId || '',
      supplierName: inv.supplierName || '',
      invoiceNumber: inv.invoiceNumber || '',
      invoiceType: inv.invoiceType || 'Factura A',
      date: inv.date || new Date().toISOString().slice(0, 10),
      branchId: inv.branchId || (branches[0]?.id || 'br-1'),
      expenseCategory: inv.expenseCategory || 'mercaderia',
      items: Array.isArray(inv.items) ? JSON.parse(JSON.stringify(inv.items)) : [],
      totalAmount: inv.totalAmount || 0,
      status: inv.status || 'draft',
      notes: inv.notes || '',
      mediaUrl: inv.mediaUrl || null
    });
    setIsEditInvoiceModalOpen(true);
  };

  // Save Edited Invoice
  const handleSaveEditedInvoice = async () => {
    if (!editingInvoiceData) return;
    try {
      setIsSavingInvoiceEdit(true);
      const res = await fetch(`/api/inventory/invoices/${editingInvoiceData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingInvoiceData,
          operator: currentUser?.name || 'Admin'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditInvoiceModalOpen(false);
        setEditingInvoiceData(null);
        loadInvoices();
        loadStock();
        alert('✅ ¡Comprobante actualizado y stock recalculado correctamente!');
      } else {
        alert(data.error || 'Error actualizando comprobante');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setIsSavingInvoiceEdit(false);
    }
  };

  // Delete Invoice
  const handleDeleteInvoice = async (invoiceId) => {
    if (!confirm('¿Eliminar este comprobante? Si estaba confirmado, se revertirá el stock ingresado.')) return;
    try {
      const res = await fetch(`/api/inventory/invoices/${invoiceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser?.name || 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        loadInvoices();
        loadStock();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleConfirmInvoice = async (invoiceId) => {
    try {
      const res = await fetch(`/api/inventory/invoices/${invoiceId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser?.name || 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        loadInvoices();
        loadStock();
        alert('✅ ¡Comprobante confirmado e ingresado a stock!');
      } else {
        alert(data.error || 'Error confirmando comprobante');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const loadSilentGroupSettings = async () => {
    try {
      const res = await fetch('/api/inventory/silent-group-settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setSilentGroupSettings(data.settings);
        if (Array.isArray(data.settings.silentGroups)) {
          setSilentGroups(data.settings.silentGroups);
        }
      }
    } catch (e) {
      console.error('Error cargando ajustes de grupo silencioso:', e);
    }
  };

  const handleSaveSilentGroupSettings = async (updates = {}) => {
    try {
      setIsSavingGroupSettings(true);
      const newSettings = { ...silentGroupSettings, ...updates };
      const res = await fetch('/api/inventory/silent-group-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSilentGroupSettings(data.settings);
        alert('✅ Configuración guardada con éxito.');
      }
    } catch (e) {
      alert('Error guardando configuración: ' + e.message);
    } finally {
      setIsSavingGroupSettings(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!groupInviteUrl) {
      alert('Pegue el enlace de invitación del grupo de WhatsApp (ej: https://chat.whatsapp.com/...)');
      return;
    }
    try {
      setIsJoiningGroup(true);
      const res = await fetch('/api/whatsapp/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteUrl: groupInviteUrl })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ¡El agente se ha unido al grupo de WhatsApp exitosamente!');
        setGroupInviteUrl('');
        loadParticipatingGroups();
        if (data.groupId) {
          // Auto-vincular a lista de grupos con la primera sucursal
          handleAddGroupMapping({
            preventDefault: () => {},
            target: {}
          });
        }
      } else {
        alert(data.error || 'No se pudo unir al grupo');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setIsJoiningGroup(false);
    }
  };

  useEffect(() => {
    loadBranches();
    loadProducts();
    loadSuppliers();
    loadTransfers();
    loadInvoices();
    loadParticipatingGroups();
    loadSilentGroupSettings();
    loadSilentGroups();
  }, []);

  useEffect(() => {
    loadStock();
  }, [selectedBranchId]);

  // Socket updates
  useEffect(() => {
    if (!socket) return;
    socket.on('stock:updated', () => loadStock());
    socket.on('transfers:sync', (data) => setTransfers(data));
    socket.on('invoices:sync', (data) => setInvoices(data));
    socket.on('suppliers:sync', (data) => setSuppliers(data));

    return () => {
      socket.off('stock:updated');
      socket.off('transfers:sync');
      socket.off('invoices:sync');
      socket.off('suppliers:sync');
    };
  }, [socket]);

  // Adjust stock handler
  const handleConfirmAdjust = async () => {
    if (!selectedProductForAdjust) return;
    try {
      const res = await fetch('/api/inventory/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductForAdjust.id,
          branchId: selectedBranchId || branches[0]?.id,
          quantity: adjustData.quantity,
          type: adjustData.type,
          reason: adjustData.reason,
          cost: adjustData.cost,
          user: currentUser?.name || 'Operador'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdjustModalOpen(false);
        loadStock();
      } else {
        alert(data.error || 'Error al ajustar stock');
      }
    } catch (e) {
      alert('Error en conexión: ' + e.message);
    }
  };

  // Create Transfer handler
  const handleCreateTransfer = async () => {
    if (!newTransferData.fromBranchId || !newTransferData.toBranchId) {
      alert('Seleccione sucursal de origen y destino');
      return;
    }
    if (newTransferData.fromBranchId === newTransferData.toBranchId) {
      alert('Origen y destino deben ser distintos');
      return;
    }
    if (newTransferData.items.length === 0) {
      alert('Agregue al menos un corte al traspaso');
      return;
    }

    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTransferData)
      });
      const data = await res.json();
      if (data.success) {
        setIsNewTransferModalOpen(false);
        setNewTransferData({
          fromBranchId: '',
          toBranchId: '',
          items: [],
          notes: '',
          dispatchedBy: currentUser?.name || 'Encargado'
        });
        loadTransfers();
        loadStock();
      } else {
        alert(data.error || 'Error creando traspaso');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Confirm Transfer reception
  const handleConfirmTransfer = async (transferId) => {
    if (!confirm('¿Confirmar recepción de mercadería en la sucursal de destino? El stock se sumará automáticamente.')) return;
    try {
      const res = await fetch(`/api/inventory/transfers/${transferId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedBy: currentUser?.name || 'Encargado Destino' })
      });
      const data = await res.json();
      if (data.success) {
        loadTransfers();
        loadStock();
      } else {
        alert(data.error || 'Error confirmando traspaso');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Cancel Transfer
  const handleCancelTransfer = async (transferId) => {
    const reason = prompt('Motivo de la cancelación del traspaso:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/inventory/transfers/${transferId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelledBy: currentUser?.name || 'Admin', reason })
      });
      const data = await res.json();
      if (data.success) {
        loadTransfers();
        loadStock();
      } else {
        alert(data.error || 'Error cancelando traspaso');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // TicketScan OCR Upload handler
  const handleProcessScan = async (file) => {
    if (!file) return;
    setFileToUpload(file);
    const previewUrl = URL.createObjectURL(file);
    setScannedImagePreview(previewUrl);
    setScanStep('scanning');

    const formData = new FormData();
    formData.append('invoiceFile', file);

    try {
      const res = await fetch('/api/inventory/invoices/scan', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.extractedData) {
        setExtractedInvoiceData({
          ...data.extractedData,
          mediaUrl: data.mediaUrl,
          branchId: selectedInvoiceBranchId || branches[0]?.id
        });
        setScanStep('review');
      } else {
        alert(data.error || 'No se pudo extraer la información del comprobante');
        setScanStep('upload');
      }
    } catch (e) {
      alert('Error al escanear con IA: ' + e.message);
      setScanStep('upload');
    }
  };

  // Save Scanned Invoice to Stock
  const handleSaveScannedInvoice = async () => {
    if (!extractedInvoiceData) return;
    try {
      const res = await fetch('/api/inventory/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: extractedInvoiceData.supplierId,
          supplierName: extractedInvoiceData.merchant || 'Proveedor',
          invoiceNumber: extractedInvoiceData.invoiceNumber,
          invoiceType: extractedInvoiceData.invoiceType || 'Factura A',
          date: extractedInvoiceData.date,
          branchId: extractedInvoiceData.branchId || selectedInvoiceBranchId || branches[0]?.id,
          expenseCategory: extractedInvoiceData.expenseCategory || 'mercaderia',
          items: extractedInvoiceData.items || [],
          totalAmount: Number(extractedInvoiceData.total) || (extractedInvoiceData.items || []).reduce((sum, it) => sum + (Number(it.totalPrice) || (Number(it.quantity || 1) * Number(it.unitPrice || 0))), 0),
          mediaUrl: extractedInvoiceData.mediaUrl,
          status: extractedInvoiceData.status || 'confirmed',
          notes: extractedInvoiceData.notes || 'Cargado mediante escáner TicketScan',
          operator: currentUser?.name || 'Admin'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsScannerModalOpen(false);
        setScanStep('upload');
        setExtractedInvoiceData(null);
        setScannedImagePreview(null);
        loadInvoices();
        loadStock();
        alert('✅ ¡Factura guardada e inventario actualizado con éxito!');
      } else {
        alert(data.error || 'Error guardando factura');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Helper functions for editing extracted invoice items at scan time
  const handleExtractedItemChange = (index, field, value) => {
    if (!extractedInvoiceData || !extractedInvoiceData.items) return;
    const newItems = [...extractedInvoiceData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'matchedProductId') {
      const prod = catalogProducts.find(p => p.id === value);
      if (prod) {
        newItems[index].matchedProductName = prod.name;
        newItems[index].plu = prod.plu;
      }
    }
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(field === 'quantity' ? value : newItems[index].quantity) || 0;
      const p = parseFloat(field === 'unitPrice' ? value : newItems[index].unitPrice) || 0;
      newItems[index].totalPrice = q * p;
    }
    const newTotal = newItems.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0);
    setExtractedInvoiceData({ ...extractedInvoiceData, items: newItems, total: newTotal });
  };

  const handleAddExtractedItem = () => {
    if (!extractedInvoiceData) return;
    const items = extractedInvoiceData.items ? [...extractedInvoiceData.items] : [];
    const firstProd = catalogProducts[0];
    items.push({
      description: 'Nuevo Corte / Ítem',
      matchedProductId: firstProd?.id || '',
      matchedProductName: firstProd?.name || 'General',
      quantity: 1,
      unit: 'kg',
      unitPrice: 0,
      totalPrice: 0
    });
    setExtractedInvoiceData({ ...extractedInvoiceData, items });
  };

  const handleRemoveExtractedItem = (index) => {
    if (!extractedInvoiceData || !extractedInvoiceData.items) return;
    const newItems = extractedInvoiceData.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0);
    setExtractedInvoiceData({ ...extractedInvoiceData, items: newItems, total: newTotal });
  };

  // Helper functions for editing invoice items a posteriori
  const handleEditInvoiceItemChange = (index, field, value) => {
    if (!editingInvoiceData || !editingInvoiceData.items) return;
    const newItems = [...editingInvoiceData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'matchedProductId') {
      const prod = catalogProducts.find(p => p.id === value);
      if (prod) {
        newItems[index].matchedProductName = prod.name;
        newItems[index].plu = prod.plu;
      }
    }
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(field === 'quantity' ? value : newItems[index].quantity) || 0;
      const p = parseFloat(field === 'unitPrice' ? value : newItems[index].unitPrice) || 0;
      newItems[index].totalPrice = q * p;
    }
    const newTotal = newItems.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0);
    setEditingInvoiceData({ ...editingInvoiceData, items: newItems, totalAmount: newTotal });
  };

  const handleAddEditInvoiceItem = () => {
    if (!editingInvoiceData) return;
    const items = editingInvoiceData.items ? [...editingInvoiceData.items] : [];
    const firstProd = catalogProducts[0];
    items.push({
      description: 'Nuevo Corte / Ítem',
      matchedProductId: firstProd?.id || '',
      matchedProductName: firstProd?.name || 'General',
      quantity: 1,
      unit: 'kg',
      unitPrice: 0,
      totalPrice: 0
    });
    setEditingInvoiceData({ ...editingInvoiceData, items });
  };

  const handleRemoveEditInvoiceItem = (index) => {
    if (!editingInvoiceData || !editingInvoiceData.items) return;
    const newItems = editingInvoiceData.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0);
    setEditingInvoiceData({ ...editingInvoiceData, items: newItems, totalAmount: newTotal });
  };

  // Save Supplier
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierFormData.name) return;
    try {
      const res = await fetch('/api/inventory/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierFormData)
      });
      const data = await res.json();
      if (data.success) {
        setIsNewSupplierModalOpen(false);
        setSupplierFormData({ name: '', cuit: '', phone: '', email: '', address: '', category: 'Carne Vacuna', paymentTerms: 'Contado' });
        loadSuppliers();
      }
    } catch (e) {
      alert('Error guardando proveedor: ' + e.message);
    }
  };

  // Test Scale Barcode
  const handleTestScaleBarcode = async () => {
    try {
      const res = await fetch('/api/scales/parse-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: scaleBarcodeTest, mode: 'weight' })
      });
      const data = await res.json();
      setScaleParseResult(data.parsed);
    } catch (e) {
      console.error(e);
    }
  };

  // Filter stock products
  const filteredStock = stockList.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.plu || '').includes(searchTerm);
    const matchesCategory = categoryFilter === 'all' || (p.category || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(stockList.map(p => p.category).filter(Boolean))];

  return (
    <div className="flex flex-col h-full bg-[#0b141a] text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <header className="px-5 py-3.5 bg-[#111b21] border-b border-[#202c33] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-950/40">
            <Boxes size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Gestión Integral de Stock, Traspasos & Proveedores
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                TicketScan IA Activo
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Control de cámaras frigoríficas por sucursal, traspasos de mercadería y escaneo inteligente de facturas
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setActiveTab('silent-group')}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
              silentGroupSettings.supplierScanGroupEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title="Configuración de Grupo de WhatsApp Silencioso"
          >
            <VolumeX size={15} />
            <span>Grupo Silencioso: {silentGroupSettings.supplierScanGroupEnabled ? 'Activo' : 'Pausado'}</span>
          </button>

          <button
            onClick={() => {
              setScanStep('upload');
              setExtractedInvoiceData(null);
              setScannedImagePreview(null);
              setIsScannerModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs flex items-center gap-2 shadow-md shadow-emerald-950/40 transition active:scale-95"
          >
            <Scan size={16} />
            <span>Escanear Factura / Remito</span>
          </button>

          <button
            onClick={() => setIsNewTransferModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-2 transition active:scale-95"
          >
            <ArrowRightLeft size={16} />
            <span>Nuevo Traspaso</span>
          </button>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <div className="px-5 bg-[#111b21] border-b border-[#202c33] flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'stock'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <Boxes size={16} />
          <span>Stock & Existencias</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {stockList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'transfers'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <ArrowRightLeft size={16} />
          <span>Traspasos entre Sucursales</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {transfers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'invoices'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <Receipt size={16} />
          <span>Facturas & Compras Proveedores</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {invoices.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'suppliers'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <Building2 size={16} />
          <span>Proveedores</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {suppliers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('silent-group')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'silent-group'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <VolumeX size={16} />
          <span>Grupo WhatsApp Silencioso</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {silentGroupSettings.supplierScanGroupEnabled ? 'Activo' : 'Pausado'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('scales')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition border-b-2 ${
            activeTab === 'scales'
              ? 'border-rose-500 text-rose-400 bg-rose-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#182229]'
          }`}
        >
          <Scale size={16} />
          <span>Balanzas Systel & Kretz</span>
        </button>
      </div>

      {/* Main Tab Content View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        
        {/* ================================================================= */}
        {/* 1. VISTA DE STOCK & EXISTENCIAS                                   */}
        {/* ================================================================= */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            {/* Filter and Branch Selector Bar */}
            <div className="bg-[#111b21] p-3.5 rounded-xl border border-[#202c33] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar corte por nombre o PLU..."
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-[#182229] border border-[#2a3942] text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">Todas las Categorías</option>
                  {categories.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Branch Selector */}
              <div className="flex items-center gap-2">
                <Store size={16} className="text-slate-400" />
                <span className="text-xs text-slate-300 font-medium">Sucursal:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-[#182229] border border-emerald-500/50 text-xs text-emerald-400 font-semibold rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  <option value="">Consolidado (Todas las Sucursales)</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stock Table */}
            <div className="bg-[#111b21] rounded-xl border border-[#202c33] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#182229] text-slate-400 border-b border-[#202c33] uppercase text-[10px] tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">PLU</th>
                      <th className="py-3 px-4">Corte / Producto</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4">Unidad</th>
                      <th className="py-3 px-4">Precio Venta</th>
                      <th className="py-3 px-4">Stock Sucursal</th>
                      <th className="py-3 px-4">Total Cadena</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {filteredStock.map(item => (
                      <tr key={item.id} className="hover:bg-[#182229]/50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {item.plu || '-'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {item.category}
                        </td>
                        <td className="py-3 px-4 uppercase font-mono text-[11px] text-slate-300">
                          {item.unit}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-400">
                          ${Number(item.price || 0).toLocaleString('es-AR')}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-sm">
                          <span className={item.isLowStock ? 'text-rose-400' : 'text-slate-100'}>
                            {Number(item.currentStock || 0).toFixed(item.unit === 'kg' ? 2 : 0)} {item.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {Number(item.totalStock || 0).toFixed(item.unit === 'kg' ? 2 : 0)} {item.unit}
                        </td>
                        <td className="py-3 px-4">
                          {item.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px]">
                              <AlertTriangle size={11} />
                              Bajo Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                              <CheckCircle2 size={11} />
                              Óptimo
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedProductForAdjust(item);
                              setAdjustData({
                                quantity: 0,
                                type: 'set_absolute',
                                reason: 'Conteo físico en cámara',
                                cost: 0
                              });
                              setIsAdjustModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-[#2a3942] hover:bg-[#32444f] text-slate-200 text-xs font-medium transition"
                          >
                            Ajustar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredStock.length === 0 && (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron productos en el inventario con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. TRASPASOS ENTRE SUCURSALES                                     */}
        {/* ================================================================= */}
        {activeTab === 'transfers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Registro de Remitos de Traspasos</h2>
                <p className="text-xs text-slate-400">Control de envío y recepción entre las 6 sucursales</p>
              </div>
              <button
                onClick={() => setIsNewTransferModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow"
              >
                <Plus size={15} />
                <span>Nuevo Remito de Traspaso</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {transfers.map(t => (
                <div key={t.id} className="bg-[#111b21] rounded-xl border border-[#202c33] p-4 flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-blue-400">{t.transferNumber}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        t.status === 'received' 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : t.status === 'in_transit'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      }`}>
                        {t.status === 'received' ? 'Recibido' : t.status === 'in_transit' ? 'En Tránsito' : 'Cancelado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-300 font-medium mb-3">
                      <span className="truncate">{t.fromBranchName}</span>
                      <ArrowRightLeft size={13} className="text-slate-500 shrink-0" />
                      <span className="truncate text-white font-bold">{t.toBranchName}</span>
                    </div>

                    <div className="bg-[#182229] rounded-lg p-2.5 border border-[#202c33] space-y-1.5 text-xs">
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                        Cortes despachados ({t.items?.length || 0})
                      </div>
                      {t.items?.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-300">
                          <span className="truncate">{it.name}</span>
                          <span className="font-mono font-bold text-slate-100">{it.quantity} {it.unit}</span>
                        </div>
                      ))}
                    </div>

                    {t.notes && (
                      <p className="text-[11px] text-slate-400 mt-2 italic">"{t.notes}"</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#202c33] flex items-center justify-between text-[11px] text-slate-400">
                    <span>{new Date(t.createdAt).toLocaleDateString('es-AR')}</span>
                    {t.status === 'in_transit' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleConfirmTransfer(t.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition"
                        >
                          Confirmar Recepción
                        </button>
                        <button
                          onClick={() => handleCancelTransfer(t.id)}
                          className="px-2 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 font-medium text-[11px] transition"
                          title="Cancelar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    {t.status === 'received' && (
                      <span className="text-emerald-400 font-medium">Recibido por: {t.receivedBy || 'Sucursal'}</span>
                    )}
                  </div>
                </div>
              ))}
              {transfers.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                  No hay traspasos registrados aún. Utilice el botón "Nuevo Traspaso" para crear uno.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. FACTURAS & COMPRAS PROVEEDORES                                 */}
        {/* ================================================================= */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Comprobantes & Boletas de Compras</h2>
                <p className="text-xs text-slate-400">Facturas A, B, C y remitos digitalizados con TicketScan</p>
              </div>
              <button
                onClick={() => {
                  setScanStep('upload');
                  setExtractedInvoiceData(null);
                  setScannedImagePreview(null);
                  setIsScannerModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow"
              >
                <Scan size={15} />
                <span>Escanear Nuevo Comprobante</span>
              </button>
            </div>

            <div className="bg-[#111b21] rounded-xl border border-[#202c33] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#182229] text-slate-400 border-b border-[#202c33] uppercase text-[10px] tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-3">Fecha</th>
                      <th className="py-3 px-3">Proveedor</th>
                      <th className="py-3 px-3">Comprobante</th>
                      <th className="py-3 px-3">Sucursal Destino</th>
                      <th className="py-3 px-3">Rubro / Caso</th>
                      <th className="py-3 px-3">Ítems</th>
                      <th className="py-3 px-3">Monto Total</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {invoices.map(inv => {
                      const expCategory = EXPENSE_CATEGORIES.find(c => c.id === (inv.expenseCategory || 'mercaderia'));
                      return (
                        <tr key={inv.id} className="hover:bg-[#182229]/50 transition">
                          <td className="py-3 px-3 font-mono text-slate-300">
                            {inv.date}
                          </td>
                          <td className="py-3 px-3 font-semibold text-white">
                            {inv.supplierName}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">
                            {inv.invoiceType} #{inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {inv.branchName}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${expCategory?.badge || 'bg-slate-800 text-slate-300'}`}>
                              {expCategory?.label ? expCategory.label.split(' ')[1] || expCategory.label : 'Mercadería'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {inv.items?.length || 0} ítems
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm">
                            ${Number(inv.totalAmount || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              inv.status === 'confirmed'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            }`}>
                              {inv.status === 'confirmed' ? 'Ingresado a Stock' : 'Borrador'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditInvoice(inv)}
                                className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white transition"
                                title="Editar Comprobante, Ítems y Stock"
                              >
                                <Pencil size={13} />
                              </button>
                              {inv.status === 'draft' && (
                                <button
                                  onClick={() => handleConfirmInvoice(inv.id)}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[10px] transition"
                                  title="Confirmar e Ingresar a Stock"
                                >
                                  Confirmar
                                </button>
                              )}
                              {inv.mediaUrl && (
                                <a
                                  href={inv.mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 hover:text-white transition"
                                  title="Ver Foto Comprobante"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              <button
                                onClick={() => handleDeleteInvoice(inv.id)}
                                className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 hover:text-white transition"
                                title="Eliminar Comprobante"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500 text-xs">
                          No se han registrado facturas de compra aún.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. PROVEEDORES                                                    */}
        {/* ================================================================= */}
        {activeTab === 'suppliers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Directorio de Frigoríficos & Proveedores</h2>
                <p className="text-xs text-slate-400">Listado comercial con CUIT, condiciones y contacto</p>
              </div>
              <button
                onClick={() => setIsNewSupplierModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow"
              >
                <Plus size={15} />
                <span>Nuevo Proveedor</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {suppliers.map(s => (
                <div key={s.id} className="bg-[#111b21] rounded-xl border border-[#202c33] p-4 flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white">{s.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {s.category}
                      </span>
                    </div>
                    {s.cuit && (
                      <div className="text-xs font-mono text-slate-400 mb-2">CUIT: {s.cuit}</div>
                    )}
                    <div className="space-y-1 text-xs text-slate-300">
                      {s.phone && <div>📞 {s.phone}</div>}
                      {s.email && <div>✉️ {s.email}</div>}
                      {s.address && <div>📍 {s.address}</div>}
                      {s.paymentTerms && <div className="text-slate-400">💳 Pago: {s.paymentTerms}</div>}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#202c33] flex items-center justify-end">
                    <button
                      onClick={async () => {
                        if (confirm(`¿Eliminar proveedor ${s.name}?`)) {
                          await fetch(`/api/inventory/suppliers/${s.id}`, { method: 'DELETE' });
                          loadSuppliers();
                        }
                      }}
                      className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 5. BALANZAS SYSTEL & KRETZ                                        */}
        {/* ================================================================= */}
        {activeTab === 'scales' && (
          <div className="space-y-5">
            <div className="bg-[#111b21] rounded-xl border border-[#202c33] p-4.5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Scale size={24} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Conectividad e Integración con Balanzas Systel & Kretz</h2>
                  <p className="text-xs text-slate-400">Protocolos de escaneo EAN-13, sincronización de catálogo PLU y lectura de mostrador</p>
                </div>
              </div>

              {/* Protocol features */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Systel Card */}
                <div className="bg-[#182229] p-4 rounded-xl border border-[#2a3942] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Balanzas Systel (Cuora, Croma, Urbe)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Soporte EAN-13 + Qendra
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Genera el archivo maestro delimitado por punto y coma (;) compatible con el software oficial <strong>Systel Qendra / Net</strong> para cargar precios y PLUs por cable o Wi-Fi.
                  </p>
                  <a
                    href="/api/scales/export/systel"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow"
                  >
                    <FileSpreadsheet size={15} />
                    <span>Descargar CSV para Systel Qendra</span>
                  </a>
                </div>

                {/* Kretz Card */}
                <div className="bg-[#182229] p-4 rounded-xl border border-[#2a3942] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Balanzas Kretz (Report, Novel, Aura)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Soporte iTegra TXT
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Exporta el catálogo de cortes vacunos y porcinos en formato <strong>PLU.txt</strong> para el software <strong>Kretz iTegra</strong> para distribución a balanzas de mostrador.
                  </p>
                  <a
                    href="/api/scales/export/kretz"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow"
                  >
                    <FileText size={15} />
                    <span>Descargar TXT para Kretz iTegra</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Test Barcode Decodification */}
            <div className="bg-[#111b21] rounded-xl border border-[#202c33] p-4.5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Scan size={15} className="text-emerald-400" />
                Simulador de Lectura de Tickets de Balanza (EAN-13: 20 PPPPP WWWWW C)
              </h3>
              <p className="text-xs text-slate-400">
                Probá el decodificador ingresando un código de 13 dígitos de balanza (ej: <strong>2002008015403</strong> = PLU 2008, 1.540 kg):
              </p>

              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={scaleBarcodeTest}
                  onChange={(e) => setScaleBarcodeTest(e.target.value)}
                  placeholder="2002008015403"
                  className="flex-1 bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={handleTestScaleBarcode}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition"
                >
                  Decodificar
                </button>
              </div>

              {scaleParseResult && (
                <div className="bg-[#182229] p-3 rounded-lg border border-[#202c33] space-y-1.5 text-xs font-mono text-slate-300">
                  <div className="text-emerald-400 font-bold">
                    Resultado: {scaleParseResult.isScaleBarcode ? 'Ticket Válido de Balanza' : 'Código Estándar'}
                  </div>
                  <div>PLU Detectado: <strong className="text-amber-400">{scaleParseResult.plu || '-'}</strong></div>
                  <div>Peso Extraído: <strong className="text-white">{scaleParseResult.weightKg} kg</strong></div>
                  {scaleParseResult.product && (
                    <div className="text-white">
                      Corte Vinculado: <strong>{scaleParseResult.product.name}</strong> (${scaleParseResult.product.price}/kg)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 6. GRUPO SILENCIOSO DE WHATSAPP (FACTURAS & COMPRAS AUTOMÁTICAS)  */}
        {/* ================================================================= */}
        {activeTab === 'silent-group' && (
          <div className="space-y-5">
            {/* Hero Information Card */}
            <div className="bg-gradient-to-r from-[#111b21] via-[#14232c] to-[#111b21] rounded-2xl border border-emerald-500/30 p-5 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/50">
                    <VolumeX size={26} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-white">Agente en Modo Silencioso / Pasivo en Grupos de WhatsApp</h2>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        silentGroupSettings.supplierScanGroupEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      }`}>
                        {silentGroupSettings.supplierScanGroupEnabled ? '● ESCUCHA ACTIVA 24/7' : '⏸ PAUSADO'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      El agente se une al grupo de WhatsApp de tus proveedores o frigoríficos en <strong>Modo Totalmente Silencioso</strong>. 
                      <span className="text-emerald-300"> NO responde, no envía mensajes ni saluda en el grupo</span> para evitar spam. 
                      Cuando alguien envía una foto o PDF de una factura o remito de carne, el bot la descarga, 
                      la analiza con IA (TicketScan Gemini Vision), carga los cortes al inventario y te envía un resumen privado.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                  <button
                    onClick={() => handleSaveSilentGroupSettings({
                      supplierScanGroupEnabled: !silentGroupSettings.supplierScanGroupEnabled
                    })}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg ${
                      silentGroupSettings.supplierScanGroupEnabled
                        ? 'bg-rose-600/80 hover:bg-rose-600 text-white shadow-rose-950/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                    }`}
                  >
                    <VolumeX size={16} />
                    <span>{silentGroupSettings.supplierScanGroupEnabled ? 'Pausar Escucha' : 'Activar Modo Silencioso'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Card 1: Unir el bot a un grupo mediante enlace */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Share2 size={17} className="text-blue-400" />
                    Unir Agente al Grupo de Proveedores
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">Baileys WA</span>
                </div>

                <div className="space-y-3 text-xs">
                  <p className="text-slate-300">
                    Copiá el enlace de invitación de tu grupo de WhatsApp (desde WhatsApp $\rightarrow$ Info del grupo $\rightarrow$ Enlace de invitación):
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Link size={16} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={groupInviteUrl}
                          onChange={(e) => setGroupInviteUrl(e.target.value)}
                          placeholder="https://chat.whatsapp.com/Gabc123xyz..."
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                      <button
                        onClick={handleJoinGroup}
                        disabled={isJoiningGroup || !groupInviteUrl}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 shadow-md shadow-blue-950/40"
                      >
                        {isJoiningGroup ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Uniéndose...</span>
                          </>
                        ) : (
                          <>
                            <Bot size={15} />
                            <span>Unir Agente</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Selector de Grupos donde ya participa */}
                  <div className="pt-3 border-t border-[#202c33] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-300">Grupo Específico a Monitorear</label>
                      <button
                        onClick={loadParticipatingGroups}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        title="Refrescar lista de grupos de WhatsApp"
                      >
                        <RefreshCw size={12} className={isLoadingGroups ? 'animate-spin' : ''} />
                        <span>Actualizar grupos</span>
                      </button>
                    </div>

                    <select
                      value={silentGroupSettings.supplierScanGroupId || ''}
                      onChange={(e) => setSilentGroupSettings({
                        ...silentGroupSettings,
                        supplierScanGroupId: e.target.value
                      })}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      <option value="">Cualquier grupo donde se envíe una factura (Todos)</option>
                      {participatingGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          👥 {g.subject} ({g.participantsCount} miembros)
                        </option>
                      ))}
                    </select>

                    <p className="text-[11px] text-slate-400 italic">
                      {silentGroupSettings.supplierScanGroupId
                        ? `Monitoreando únicamente el grupo seleccionado (${silentGroupSettings.supplierScanGroupId}).`
                        : 'El bot detectará comprobantes en cualquier grupo donde sea participante sin intervenir en la conversación.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Parámetros de Ingestión Automática */}
              <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={17} className="text-emerald-400" />
                    Reglas de Stock & Notificaciones Privadas
                  </h3>
                  <span className="text-[11px] text-slate-400">Automatización</span>
                </div>

                <div className="space-y-3.5 text-xs">
                  {/* Sucursal Destino */}
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">
                      Sucursal por Defecto para Carga de Mercadería
                    </label>
                    <select
                      value={silentGroupSettings.defaultSupplierBranchId}
                      onChange={(e) => setSilentGroupSettings({
                        ...silentGroupSettings,
                        defaultSupplierBranchId: e.target.value
                      })}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-white font-medium"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Cámara frigorífica a donde se sumará el stock de los cortes recibidos en el grupo.
                    </p>
                  </div>

                  {/* Auto-Confirmar Stock */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#182229] border border-[#202c33]">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-semibold text-white">Ingreso Directo a Stock</div>
                      <div className="text-[11px] text-slate-400">
                        {silentGroupSettings.autoConfirmGroupInvoices
                          ? 'Suma los kilos inmediatamente al inventario tras el escaneo.'
                          : 'Deja la factura en borrador para revisión manual previa antes de impactar el stock.'}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={silentGroupSettings.autoConfirmGroupInvoices}
                        onChange={(e) => setSilentGroupSettings({
                          ...silentGroupSettings,
                          autoConfirmGroupInvoices: e.target.checked
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#2a3942] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Notificación Privada al Admin */}
                  <div className="space-y-2 p-3 rounded-xl bg-[#182229] border border-[#202c33]">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white">Aviso Privado por WhatsApp a Admin</div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={silentGroupSettings.notifyAdminOnGroupInvoice}
                          onChange={(e) => setSilentGroupSettings({
                            ...silentGroupSettings,
                            notifyAdminOnGroupInvoice: e.target.checked
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#2a3942] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>

                    {silentGroupSettings.notifyAdminOnGroupInvoice && (
                      <div className="pt-2 border-t border-[#2a3942]/60">
                        <label className="block text-slate-400 text-[11px] mb-1">Teléfono Móvil del Administrador:</label>
                        <input
                          type="text"
                          value={silentGroupSettings.adminNotifyPhone || ''}
                          onChange={(e) => setSilentGroupSettings({
                            ...silentGroupSettings,
                            adminNotifyPhone: e.target.value
                          })}
                          placeholder="+54 9 351 ..."
                          className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          El bot le enviará un mensaje directo solo a este número con el desglose del remito. Nunca en el grupo.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Guardar cambios */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => handleSaveSilentGroupSettings()}
                      disabled={isSavingGroupSettings}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
                    >
                      {isSavingGroupSettings ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Guardar Parámetros de Grupo</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-Group Mapping Section */}
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#202c33] gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 size={17} className="text-amber-400" />
                    Mapeo de Múltiples Grupos a Sucursales & Casos de Gastos
                  </h3>
                  <p className="text-xs text-slate-400">
                    Asigna cada grupo de WhatsApp a una sucursal física o a un rubro de gasto específico (Mercadería, Insumos, Mantenimiento, Servicios)
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#182229] text-slate-300 border border-[#202c33]">
                  {silentGroups.length} grupos configurados
                </span>
              </div>

              {/* Formulario Vincular Nuevo Grupo */}
              <form onSubmit={handleAddGroupMapping} className="bg-[#182229] p-4 rounded-xl border border-[#2a3942] space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={14} className="text-emerald-400" />
                  Vincular Grupo de WhatsApp a Sucursal & Caso de Gasto
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  {/* Select Grupo */}
                  <div className="md:col-span-1">
                    <label className="block text-slate-400 mb-1 font-semibold">Grupo de WhatsApp</label>
                    <select
                      value={newGroupMapping.groupId}
                      onChange={(e) => {
                        const gid = e.target.value;
                        const grp = participatingGroups.find(g => g.id === gid);
                        setNewGroupMapping({
                          ...newGroupMapping,
                          groupId: gid,
                          groupName: grp ? grp.subject : ''
                        });
                      }}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-2 text-white font-medium"
                      required
                    >
                      <option value="">Seleccione grupo...</option>
                      {participatingGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          👥 {g.subject}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Sucursal */}
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Sucursal Asignada</label>
                    <select
                      value={newGroupMapping.branchId}
                      onChange={(e) => setNewGroupMapping({ ...newGroupMapping, branchId: e.target.value })}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-2 text-white font-medium"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Select Caso de Gasto */}
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Rubro / Caso de Gasto</label>
                    <select
                      value={newGroupMapping.expenseCategory}
                      onChange={(e) => setNewGroupMapping({ ...newGroupMapping, expenseCategory: e.target.value })}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-2 text-white font-medium"
                    >
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Auto-Confirm & Botón */}
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={newGroupMapping.autoConfirm}
                        onChange={(e) => setNewGroupMapping({ ...newGroupMapping, autoConfirm: e.target.checked })}
                        className="rounded bg-[#111b21] border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Auto-Stock</span>
                    </label>

                    <button
                      type="submit"
                      disabled={isAddingGroupMapping || !newGroupMapping.groupId}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-1 shadow-md shadow-emerald-950/40"
                    >
                      <Plus size={15} />
                      <span>{isAddingGroupMapping ? 'Guardando...' : 'Vincular'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Lista de Grupos Vinculados */}
              <div className="overflow-x-auto rounded-xl border border-[#202c33]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#182229] text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Grupo de WhatsApp</th>
                      <th className="py-2.5 px-3">Sucursal Destino</th>
                      <th className="py-2.5 px-3">Rubro / Caso de Gasto</th>
                      <th className="py-2.5 px-3">Carga Automática</th>
                      <th className="py-2.5 px-3 text-center">Estado</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {silentGroups.map((grp) => {
                      const branch = branches.find(b => b.id === grp.branchId);
                      const cat = EXPENSE_CATEGORIES.find(c => c.id === grp.expenseCategory);
                      return (
                        <tr key={grp.id || grp.groupId} className="hover:bg-[#182229]/60 transition">
                          <td className="py-2.5 px-3 font-semibold text-white">
                            <div>{grp.groupName || grp.groupId}</div>
                            <div className="text-[10px] font-mono text-slate-500">{grp.groupId}</div>
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 font-medium">
                            {branch?.name || grp.branchId || 'Sucursal'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cat?.badge || 'bg-slate-800 text-slate-300'}`}>
                              {cat?.label || grp.expenseCategory}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {grp.autoConfirm ? (
                              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                                <CheckCircle2 size={13} /> Directo a Stock
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                                <Clock size={13} /> Borrador previo
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleToggleGroupActive(grp)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                grp.active !== false
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              {grp.active !== false ? '● Activo' : '⏸ Pausado'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleDeleteGroupMapping(grp.id || grp.groupId)}
                              className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 hover:text-white transition"
                              title="Desvincular Grupo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {silentGroups.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-6 text-center text-slate-500 text-xs">
                          No hay grupos vinculados específicamente aún. El bot usará la sucursal por defecto para cualquier imagen recibida.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoices Received via WhatsApp Groups Table */}
            <div className="bg-[#111b21] rounded-2xl border border-[#202c33] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Receipt size={17} className="text-emerald-400" />
                    Comprobantes Ingeridos desde Grupos de WhatsApp
                  </h3>
                  <p className="text-xs text-slate-400">
                    Historial de imágenes y remitos recibidos silenciosamente sin interacción en el chat
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#182229] text-slate-300 border border-[#202c33]">
                  {invoices.filter(i => (i.notes || '').includes('grupo') || (i.operator || '').includes('Silencioso')).length} facturas
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#202c33]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#182229] text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3">Proveedor Detectado</th>
                      <th className="py-2.5 px-3">Comprobante</th>
                      <th className="py-2.5 px-3">Sucursal Asignada</th>
                      <th className="py-2.5 px-3">Cortes Extraídos</th>
                      <th className="py-2.5 px-3">Monto Total</th>
                      <th className="py-2.5 px-3">Estado Stock</th>
                      <th className="py-2.5 px-3 text-right">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202c33] text-slate-200">
                    {invoices
                      .filter(i => (i.notes || '').includes('grupo') || (i.operator || '').includes('Silencioso'))
                      .map(inv => (
                        <tr key={inv.id} className="hover:bg-[#182229]/60 transition">
                          <td className="py-2.5 px-3 font-mono text-slate-300">{inv.date}</td>
                          <td className="py-2.5 px-3 font-semibold text-white">{inv.supplierName}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{inv.invoiceType} #{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-medium">{inv.branchName}</td>
                          <td className="py-2.5 px-3 text-slate-300">{inv.items?.length || 0} cortes</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                            ${Number(inv.totalAmount || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {inv.status === 'confirmed' ? 'Ingresado al Stock' : 'Borrador'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {inv.mediaUrl ? (
                              <a
                                href={inv.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                              >
                                <ExternalLink size={13} />
                                <span>Ver Foto</span>
                              </a>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    {invoices.filter(i => (i.notes || '').includes('grupo') || (i.operator || '').includes('Silencioso')).length === 0 && (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-500 text-xs">
                          Aún no se han recibido comprobantes automáticos desde grupos de WhatsApp. Una vez que el bot esté en el grupo, cada imagen enviada aparecerá aquí al instante.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL: AJUSTE DE STOCK                                              */}
      {/* =================================================================== */}
      {isAdjustModalOpen && selectedProductForAdjust && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes size={18} className="text-emerald-400" />
                Ajustar Stock: {selectedProductForAdjust.name}
              </h3>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Tipo de Ajuste</label>
                <select
                  value={adjustData.type}
                  onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value })}
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                >
                  <option value="set_absolute">Fijar Stock Total Exacto (Conteo Físico)</option>
                  <option value="manual_adjustment">Sumar / Restar Diferencia</option>
                  <option value="spoilage_waste">Merma / Descarte de Carnicería</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {adjustData.type === 'set_absolute' ? 'Cantidad Total en Cámara' : 'Diferencia a aplicar (+ o -)'} ({selectedProductForAdjust.unit})
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={adjustData.quantity}
                  onChange={(e) => setAdjustData({ ...adjustData, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Motivo / Observación</label>
                <input
                  type="text"
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                  placeholder="Ej: Conteo semanal, desposte, merma por grasa"
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#202c33]">
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAdjust}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow"
              >
                Guardar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: NUEVO TRASPASO DE SUCURSAL                                   */}
      {/* =================================================================== */}
      {isNewTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-blue-400" />
                Emitir Remito de Traspaso de Mercadería
              </h3>
              <button onClick={() => setIsNewTransferModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Sucursal Origen (Emisora)</label>
                  <select
                    value={newTransferData.fromBranchId}
                    onChange={(e) => setNewTransferData({ ...newTransferData, fromBranchId: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Seleccione Origen...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Sucursal Destino (Receptora)</label>
                  <select
                    value={newTransferData.toBranchId}
                    onChange={(e) => setNewTransferData({ ...newTransferData, toBranchId: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Seleccione Destino...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Add item to transfer */}
              <div className="bg-[#182229] p-3 rounded-xl border border-[#202c33] space-y-2">
                <div className="font-semibold text-slate-200">Agregar Cortes / Productos al Remito:</div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <select
                      id="transfer-prod-select"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">Seleccione corte...</option>
                      {catalogProducts.map(p => (
                        <option key={p.id} value={JSON.stringify({ id: p.id, plu: p.plu, name: p.name, unit: p.unit })}>
                          {p.name} {p.plu ? `(PLU ${p.plu})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input
                      id="transfer-qty-input"
                      type="number"
                      step="0.1"
                      placeholder="Cantidad (kg)"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => {
                        const select = document.getElementById('transfer-prod-select');
                        const qtyInput = document.getElementById('transfer-qty-input');
                        if (!select.value || !qtyInput.value) return;
                        const parsed = JSON.parse(select.value);
                        const qty = parseFloat(qtyInput.value) || 1;

                        setNewTransferData({
                          ...newTransferData,
                          items: [
                            ...newTransferData.items,
                            {
                              productId: parsed.id,
                              plu: parsed.plu,
                              name: parsed.name,
                              quantity: qty,
                              unit: parsed.unit || 'kg'
                            }
                          ]
                        });
                        qtyInput.value = '';
                      }}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs"
                    >
                      + Sumar
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Cortes en este traspaso:</div>
                {newTransferData.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#182229] px-3 py-2 rounded-lg border border-[#202c33]">
                    <span className="font-medium text-white">{it.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-blue-400">{it.quantity} {it.unit}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTransferData({
                            ...newTransferData,
                            items: newTransferData.items.filter((_, i) => i !== idx)
                          });
                        }}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {newTransferData.items.length === 0 && (
                  <div className="text-slate-500 italic text-center py-3">Aún no agregó cortes al remito.</div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Observaciones / Chofer / Vehículo</label>
                <input
                  type="text"
                  value={newTransferData.notes}
                  onChange={(e) => setNewTransferData({ ...newTransferData, notes: e.target.value })}
                  placeholder="Ej: Remito en Hilux blanca, precinto #4410"
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#202c33]">
              <button
                onClick={() => setIsNewTransferModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTransfer}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow"
              >
                Despachar Traspaso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: TICKETSCAN IA OCR SCANNER (ADAPTADO DE DIBERTO/TICKETSCAN)     */}
      {/* =================================================================== */}
      {isScannerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scan size={18} className="text-emerald-400" />
                Escáner Inteligente TicketScan & Facturas
              </h3>
              <button onClick={() => setIsScannerModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {/* Step 1: Upload or Capture */}
              {scanStep === 'upload' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-300">
                    Seleccione la sucursal que recibe la mercadería y suba la foto o PDF de la boleta:
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-semibold">Sucursal de Ingreso de Stock</label>
                    <select
                      value={selectedInvoiceBranchId}
                      onChange={(e) => setSelectedInvoiceBranchId(e.target.value)}
                      className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Drag and Drop Zone */}
                  <label className="border-2 border-dashed border-[#2a3942] hover:border-emerald-500/60 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition bg-[#182229]/40 hover:bg-[#182229]">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Upload size={24} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-white">Haga clic o arrastre la foto o PDF de la factura</p>
                      <p className="text-[11px] text-slate-400 mt-1">Soporta JPG, PNG, WEBP y PDF de AFIP / Frigoríficos</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleProcessScan(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Step 2: Scanning Loading State */}
              {scanStep === 'scanning' && (
                <div className="py-14 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                    <Sparkles size={20} className="text-emerald-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Analizando Comprobante con Gemini Vision...</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Detectando proveedor, CUIT, fecha, kilos de carne, precios unitarios y vinculando automáticamente con los cortes de tu catálogo.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Review Extracted Data */}
              {scanStep === 'review' && extractedInvoiceData && (
                <div className="space-y-3.5 text-xs">
                  {/* Header info & Total */}
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-center justify-between">
                    <div className="flex-1 pr-3">
                      <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">
                        Proveedor / Frigorífico
                      </div>
                      <input
                        type="text"
                        value={extractedInvoiceData.merchant || ''}
                        onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, merchant: e.target.value })}
                        placeholder="Nombre del proveedor"
                        className="bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1 text-white font-bold text-xs w-full max-w-sm"
                      />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Calculado</div>
                      <div className="text-lg font-bold text-emerald-400 font-mono">
                        ${Number(extractedInvoiceData.total || 0).toLocaleString('es-AR')}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Row: Branch, Expense Category, Status, Number, Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 bg-[#182229] p-3 rounded-xl border border-[#202c33]">
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Sucursal Destino</label>
                      <select
                        value={extractedInvoiceData.branchId || selectedInvoiceBranchId || branches[0]?.id}
                        onChange={(e) => {
                          setSelectedInvoiceBranchId(e.target.value);
                          setExtractedInvoiceData({ ...extractedInvoiceData, branchId: e.target.value });
                        }}
                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Rubro / Caso de Gasto</label>
                      <select
                        value={extractedInvoiceData.expenseCategory || 'mercaderia'}
                        onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, expenseCategory: e.target.value })}
                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                      >
                        {EXPENSE_CATEGORIES.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Comprobante</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={extractedInvoiceData.invoiceType || 'Factura A'}
                          onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, invoiceType: e.target.value })}
                          className="w-24 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                          placeholder="Tipo"
                        />
                        <input
                          type="text"
                          value={extractedInvoiceData.invoiceNumber || ''}
                          onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, invoiceNumber: e.target.value })}
                          className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white font-mono"
                          placeholder="N° 0001-..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Fecha & Impacto Stock</label>
                      <div className="flex gap-1.5">
                        <input
                          type="date"
                          value={extractedInvoiceData.date || ''}
                          onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, date: e.target.value })}
                          className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                        />
                        <select
                          value={extractedInvoiceData.status || 'confirmed'}
                          onChange={(e) => setExtractedInvoiceData({ ...extractedInvoiceData, status: e.target.value })}
                          className="w-28 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white font-semibold text-[11px]"
                        >
                          <option value="confirmed">Confirmar</option>
                          <option value="draft">Borrador</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Editable Items Table */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-300 uppercase text-[10px] tracking-wider">
                        Cortes & Ítems ({extractedInvoiceData.items?.length || 0}):
                      </div>
                      <button
                        type="button"
                        onClick={handleAddExtractedItem}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <Plus size={13} />
                        <span>Agregar Ítem</span>
                      </button>
                    </div>

                    <div className="bg-[#182229] rounded-xl border border-[#202c33] overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[620px]">
                        <thead className="bg-[#111b21] text-slate-400 text-[10px] uppercase font-semibold">
                          <tr>
                            <th className="py-2 px-2.5">Descripción Factura</th>
                            <th className="py-2 px-2.5">Corte Catálogo</th>
                            <th className="py-2 px-2.5 w-24">Cantidad / Kg</th>
                            <th className="py-2 px-2.5 w-28">Precio Unit ($)</th>
                            <th className="py-2 px-2.5 text-right w-28">Subtotal</th>
                            <th className="py-2 px-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#202c33] text-slate-200">
                          {extractedInvoiceData.items?.map((it, idx) => (
                            <tr key={idx} className="hover:bg-[#111b21]/50">
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="text"
                                  value={it.description || ''}
                                  onChange={(e) => handleExtractedItemChange(idx, 'description', e.target.value)}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded px-2 py-1 text-white text-xs"
                                />
                              </td>
                              <td className="py-1.5 px-2.5">
                                <select
                                  value={it.matchedProductId || ''}
                                  onChange={(e) => handleExtractedItemChange(idx, 'matchedProductId', e.target.value)}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded px-2 py-1 text-emerald-400 font-medium text-xs"
                                >
                                  <option value="">Seleccione corte...</option>
                                  {catalogProducts.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {p.plu ? `[PLU ${p.plu}]` : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-1.5 px-2.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={it.quantity || ''}
                                    onChange={(e) => handleExtractedItemChange(idx, 'quantity', e.target.value)}
                                    className="w-full bg-[#111b21] border border-[#2a3942] rounded px-1.5 py-1 text-white font-mono text-xs"
                                  />
                                  <span className="text-[10px] text-slate-400">{it.unit || 'kg'}</span>
                                </div>
                              </td>
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={it.unitPrice || ''}
                                  onChange={(e) => handleExtractedItemChange(idx, 'unitPrice', e.target.value)}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded px-1.5 py-1 text-white font-mono text-xs"
                                />
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-400">
                                ${(Number(it.totalPrice) || 0).toLocaleString('es-AR')}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExtractedItem(idx)}
                                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                  title="Eliminar Ítem"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#202c33]">
              <button
                onClick={() => {
                  if (scanStep === 'review') setScanStep('upload');
                  else setIsScannerModalOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs"
              >
                {scanStep === 'review' ? 'Volver a Escanear' : 'Cancelar'}
              </button>

              {scanStep === 'review' && (
                <button
                  onClick={handleSaveScannedInvoice}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center gap-1.5"
                >
                  <CheckCircle2 size={16} />
                  <span>Confirmar e Ingresar a Stock</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: NUEVO PROVEEDOR                                              */}
      {/* =================================================================== */}
      {isNewSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveSupplier} className="bg-[#111b21] border border-[#202c33] w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 size={18} className="text-amber-400" />
                Registrar Nuevo Proveedor / Frigorífico
              </h3>
              <button type="button" onClick={() => setIsNewSupplierModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Razón Social / Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  value={supplierFormData.name}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                  placeholder="Ej: Frigorífico Logros S.A."
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={supplierFormData.cuit}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, cuit: e.target.value })}
                    placeholder="30-70812345-8"
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Categoría</label>
                  <select
                    value={supplierFormData.category}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Carne Vacuna">Carne Vacuna</option>
                    <option value="Cortes Porcinos">Cortes Porcinos</option>
                    <option value="Pollo y Aves">Pollo y Aves</option>
                    <option value="Achuras y Menudencias">Achuras y Menudencias</option>
                    <option value="Embutidos y Chacinados">Embutidos y Chacinados</option>
                    <option value="Insumos y Envases">Insumos y Envases</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    placeholder="+54 9 351 ..."
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Condición de Pago</label>
                  <input
                    type="text"
                    value={supplierFormData.paymentTerms}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, paymentTerms: e.target.value })}
                    placeholder="Contado, 7 días, Cta Cte"
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Dirección / Planta</label>
                <input
                  type="text"
                  value={supplierFormData.address}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, address: e.target.value })}
                  placeholder="Ruta o Localidad"
                  className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#202c33]">
              <button
                type="button"
                onClick={() => setIsNewSupplierModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow"
              >
                Guardar Proveedor
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: EDITAR COMPROBANTE A POSTERIORI                              */}
      {/* =================================================================== */}
      {isEditInvoiceModalOpen && editingInvoiceData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-[#202c33] w-full max-w-3xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#202c33]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Editar Comprobante #{editingInvoiceData.invoiceNumber || editingInvoiceData.id}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Modifique datos del comprobante, sucursal, rubro o ítems. Si está confirmado, el stock se recalculará automáticamente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditInvoiceModalOpen(false);
                  setEditingInvoiceData(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs flex-1 overflow-y-auto custom-scrollbar pr-1">
              {/* Header and Total */}
              <div className="bg-[#182229] p-3.5 rounded-xl border border-[#2a3942] flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Proveedor / Frigorífico</label>
                  <input
                    type="text"
                    value={editingInvoiceData.supplierName || ''}
                    onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, supplierName: e.target.value })}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs"
                    placeholder="Razón Social del Proveedor"
                  />
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Total Comprobante</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    ${Number(editingInvoiceData.totalAmount || 0).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              {/* Branch, Category, Type, Number, Date, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 bg-[#182229] p-3 rounded-xl border border-[#202c33]">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Sucursal Destino</label>
                  <select
                    value={editingInvoiceData.branchId}
                    onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, branchId: e.target.value })}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Rubro / Caso de Gasto</label>
                  <select
                    value={editingInvoiceData.expenseCategory || 'mercaderia'}
                    onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, expenseCategory: e.target.value })}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Comprobante</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={editingInvoiceData.invoiceType || 'Factura A'}
                      onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, invoiceType: e.target.value })}
                      className="w-24 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                      placeholder="Tipo"
                    />
                    <input
                      type="text"
                      value={editingInvoiceData.invoiceNumber || ''}
                      onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, invoiceNumber: e.target.value })}
                      className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white font-mono"
                      placeholder="N° 0001-..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Fecha & Estado Stock</label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={editingInvoiceData.date || ''}
                      onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, date: e.target.value })}
                      className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white"
                    />
                    <select
                      value={editingInvoiceData.status || 'draft'}
                      onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, status: e.target.value })}
                      className="w-28 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1.5 text-white font-semibold text-[11px]"
                    >
                      <option value="confirmed">Confirmado</option>
                      <option value="draft">Borrador</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Editable Items Table */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-300 uppercase text-[10px] tracking-wider">
                    Desglose de Cortes & Mercadería ({editingInvoiceData.items?.length || 0}):
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditInvoiceItem}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Plus size={13} />
                    <span>Agregar Corte</span>
                  </button>
                </div>

                <div className="bg-[#182229] rounded-xl border border-[#202c33] overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[620px]">
                    <thead className="bg-[#111b21] text-slate-400 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-2.5">Descripción Factura</th>
                        <th className="py-2 px-2.5">Corte Catálogo</th>
                        <th className="py-2 px-2.5 w-24">Cantidad / Kg</th>
                        <th className="py-2 px-2.5 w-28">Precio Unit ($)</th>
                        <th className="py-2 px-2.5 text-right w-28">Subtotal</th>
                        <th className="py-2 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#202c33] text-slate-200">
                      {editingInvoiceData.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#111b21]/50">
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              value={it.description || ''}
                              onChange={(e) => handleEditInvoiceItemChange(idx, 'description', e.target.value)}
                              className="w-full bg-[#111b21] border border-[#2a3942] rounded px-2 py-1 text-white text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2.5">
                            <select
                              value={it.matchedProductId || ''}
                              onChange={(e) => handleEditInvoiceItemChange(idx, 'matchedProductId', e.target.value)}
                              className="w-full bg-[#111b21] border border-[#2a3942] rounded px-2 py-1 text-emerald-400 font-medium text-xs"
                            >
                              <option value="">Seleccione corte...</option>
                              {catalogProducts.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} {p.plu ? `[PLU ${p.plu}]` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={it.quantity || ''}
                                onChange={(e) => handleEditInvoiceItemChange(idx, 'quantity', e.target.value)}
                                className="w-full bg-[#111b21] border border-[#2a3942] rounded px-1.5 py-1 text-white font-mono text-xs"
                              />
                              <span className="text-[10px] text-slate-400">{it.unit || 'kg'}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2.5">
                            <input
                              type="number"
                              step="0.01"
                              value={it.unitPrice || ''}
                              onChange={(e) => handleEditInvoiceItemChange(idx, 'unitPrice', e.target.value)}
                              className="w-full bg-[#111b21] border border-[#2a3942] rounded px-1.5 py-1 text-white font-mono text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-400">
                            ${(Number(it.totalPrice) || 0).toLocaleString('es-AR')}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveEditInvoiceItem(idx)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Eliminar Ítem"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes & mediaUrl preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold text-[11px]">Notas / Observaciones</label>
                  <input
                    type="text"
                    value={editingInvoiceData.notes || ''}
                    onChange={(e) => setEditingInvoiceData({ ...editingInvoiceData, notes: e.target.value })}
                    placeholder="Observaciones de la compra..."
                    className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-1.5 text-white"
                  />
                </div>

                {editingInvoiceData.mediaUrl && (
                  <div className="flex items-center gap-2 p-2 bg-[#182229] rounded-lg border border-[#202c33]">
                    <a
                      href={editingInvoiceData.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <ExternalLink size={14} />
                      <span>Ver Foto Original del Comprobante</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#202c33]">
              <button
                type="button"
                onClick={() => {
                  setIsEditInvoiceModalOpen(false);
                  setEditingInvoiceData(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditedInvoice}
                disabled={isSavingInvoiceEdit}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-950/40 flex items-center gap-1.5"
              >
                {isSavingInvoiceEdit ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Guardar y Recalcular Stock</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
