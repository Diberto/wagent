import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Send, 
  Mic, 
  Square, 
  Bot, 
  User, 
  Phone, 
  Mail,
  Store,
  Tag, 
  DollarSign, 
  Sparkles, 
  Check, 
  CheckCheck, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Volume2,
  PhoneCall,
  UserCheck,
  Edit2,
  Edit3,
  Save,
  Trash2,
  X,
  MapPin,
  FileText,
  Copy,
  CheckCircle2,
  Flame,
  ShoppingBag,
  PackageCheck,
  ChevronRight,
  ArrowRight,
  ShoppingCart,
  Plus,
  Minus,
  CreditCard,
  RefreshCw,
  Layers,
  Zap,
  MessageSquare
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';

export const parseNormalizedCartItems = (order, catalogProducts = []) => {
  if (!order) return [];

  // 1. Si ya tiene productos estructurados
  if (Array.isArray(order.products) && order.products.length > 0) {
    return order.products.map((p, idx) => {
      const qty = Number(p.quantity) || 1;
      const unit = p.unit || 'kg';
      const name = p.name || 'Corte Seleccionado';
      const lineSubtotal = Number(p.subtotal) || (Number(p.unitPrice || p.price || 0) * qty) || 0;
      const unitPrice = Number(p.unitPrice || p.price) || (qty > 0 ? Math.round(lineSubtotal / qty) : lineSubtotal);

      return {
        id: p.id || `prod-${idx}`,
        productId: p.productId || p.id || `prod-${idx}`,
        name,
        quantity: qty,
        unit,
        price: unitPrice,
        subtotal: lineSubtotal > 0 ? lineSubtotal : Math.round(unitPrice * qty)
      };
    });
  }

  // 2. Si tiene items en formato array de strings o array de objetos
  const rawItems = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
    ? order.items.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  if (rawItems.length === 0) return [];

  return rawItems.map((item, idx) => {
    if (typeof item === 'object' && item !== null && (item.name || item.price)) {
      const qty = Number(item.quantity) || 1;
      const unit = item.unit || 'kg';
      const name = item.name || 'Corte Seleccionado';
      const price = Number(item.price) || 0;
      const subtotal = Number(item.subtotal) || (price * qty);
      return {
        id: item.id || item.productId || `prod-${idx}`,
        productId: item.productId || item.id || `prod-${idx}`,
        name,
        quantity: qty,
        unit,
        price,
        subtotal
      };
    }

    // Parseo desde string (ej: "• 3 kg Vacío Especial Seleccionado — $34.500")
    const str = String(item).replace(/^[•\-\*\s]+/, '').trim();
    let qty = 1;
    let unit = 'kg';
    let lineSubtotal = 0;
    let name = str;

    // Detectar cantidad al inicio: "3 kg", "6 un", "1 combo", "2x"
    const initialQtyMatch = str.match(/^([0-9.,]+)\s*(?:x\s*)?(kg|kilos?|combo|combos|bolsa|bolsas|botella|botellas|promo|un|unidad|unidades|piezas?)?\s+(.+?)(?:\s*—|\s*\(|\s*\$|$)/i);
    if (initialQtyMatch) {
      qty = parseFloat(initialQtyMatch[1].replace(',', '.')) || 1;
      if (initialQtyMatch[2]) unit = initialQtyMatch[2].toLowerCase();
      name = initialQtyMatch[3].trim();
    } else {
      name = str.split('—')[0].replace(/\([^\)]+\)/, '').trim();
    }

    // Detectar precio/subtotal al final: "— $34.500", "($34.500)", "$34.500"
    const priceMatch = str.match(/(?:—|\-|\()\s*\$?\s*([0-9.,]+)\s*\)?$/i);
    if (priceMatch) {
      lineSubtotal = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
    }

    // Buscar en catálogo si coincide
    const matchedProd = catalogProducts.find(p => 
      p.name.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(p.name.toLowerCase())
    );

    const unitPrice = matchedProd ? Number(matchedProd.price) : (lineSubtotal > 0 && qty > 0 ? Math.round(lineSubtotal / qty) : lineSubtotal);
    const subtotal = lineSubtotal > 0 ? lineSubtotal : Math.round(unitPrice * qty);

    return {
      id: matchedProd?.id || `item-${idx}`,
      productId: matchedProd?.id || `item-${idx}`,
      name: matchedProd?.name || name,
      quantity: qty,
      unit: matchedProd?.unit || unit,
      price: unitPrice,
      subtotal: subtotal
    };
  });
};

export default function ChatInbox({ 
  socket,
  leads = [], 
  selectedLead, 
  setSelectedLead, 
  onUpdateLeadStage, 
  onUpdateLead,
  onToggleLeadAi,
  onSendMessage,
  onSendAudio,
  onCallLead,
  onDeleteLead,
  onClearChat,
  onNavigateToOrders
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [messages, setMessages] = useState([]);
  const [leadOrders, setLeadOrders] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [filterStage, setFilterStage] = useState('all');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Cart / Order Sidebar State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [selectedProdToAdd, setSelectedProdToAdd] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderCartSuccess, setOrderCartSuccess] = useState(null);

  // Edit Contact Modal State
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);
  const [editContactData, setEditContactData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    preferredBranch: '',
    notes: '',
    stage: 'new_lead',
    value: 0,
    tags: []
  });
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Delete / Clear Chat Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick Replies / Plantillas del Operador
  const [quickReplies, setQuickReplies] = useState([]);
  const [isQuickRepliesOpen, setIsQuickRepliesOpen] = useState(false);
  const [quickReplyCategory, setQuickReplyCategory] = useState('all');
  const [quickReplySearch, setQuickReplySearch] = useState('');
  const [isEditQuickReplyModalOpen, setIsEditQuickReplyModalOpen] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState(null);
  const [quickReplyFormData, setQuickReplyFormData] = useState({
    title: '',
    category: 'general',
    content: ''
  });

  // Copied transcription toast state
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const fetchQuickReplies = async () => {
    try {
      const res = await fetch('/api/quick-replies');
      const data = await res.json();
      if (data.quickReplies) setQuickReplies(data.quickReplies);
    } catch (err) {
      console.error('Error cargando respuestas rápidas:', err);
    }
  };

  useEffect(() => {
    fetchQuickReplies();
  }, []);

  // Reemplazar variables dinámicas de plantilla ({nombre}, {pedido_id}, {total}, {direccion}, {sucursal}, {telefono})
  const resolveTemplateVariables = (content) => {
    if (!content) return '';
    const name = selectedLead?.name && selectedLead.name !== 'Contacto WhatsApp' ? selectedLead.name : (selectedLead?.pushName || 'Estimado/a');
    const activeOrder = leadOrders && leadOrders.length > 0 ? leadOrders[0] : null;
    const pedidoId = activeOrder?.id || 'ORD-3239';
    const total = activeOrder?.totalAmount ? Number(activeOrder.totalAmount).toLocaleString('es-AR') : '39.999';
    const direccion = selectedLead?.address || activeOrder?.address || 'Córdoba Capital';
    const sucursal = selectedLead?.preferredBranch || activeOrder?.branch || activeOrder?.branchName || 'Urca Central (Av. José Roque Funes 1115)';
    const telefono = selectedLead?.phone || (selectedLead?.jid ? selectedLead.jid.split('@')[0] : '');

    return content
      .replace(/\{nombre\}/gi, name)
      .replace(/\{cliente\}/gi, name)
      .replace(/\{pedido_id\}/gi, pedidoId)
      .replace(/\{pedido\}/gi, pedidoId)
      .replace(/\{total\}/gi, total)
      .replace(/\{monto\}/gi, total)
      .replace(/\{direccion\}/gi, direccion)
      .replace(/\{sucursal\}/gi, sucursal)
      .replace(/\{telefono\}/gi, telefono);
  };

  const handleInsertQuickReply = (content) => {
    const resolved = resolveTemplateVariables(content);
    setInputText(prev => prev ? `${prev}\n${resolved}` : resolved);
    setIsQuickRepliesOpen(false);
  };

  const handleSendQuickReplyDirect = (content) => {
    if (!selectedLead?.jid) return;
    const resolved = resolveTemplateVariables(content);
    if (onSendMessage) {
      onSendMessage(selectedLead.jid, resolved);
    }
    setIsQuickRepliesOpen(false);
  };

  const handleSaveQuickReply = async (e) => {
    e.preventDefault();
    if (!quickReplyFormData.title.trim() || !quickReplyFormData.content.trim()) return;
    try {
      const res = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickReplyFormData)
      });
      const data = await res.json();
      if (data.success) {
        await fetchQuickReplies();
        setIsEditQuickReplyModalOpen(false);
        setEditingQuickReply(null);
      }
    } catch (err) {
      console.error('Error guardando plantilla rápida:', err);
    }
  };

  const handleDeleteQuickReply = async (id) => {
    if (!window.confirm('¿Eliminar esta plantilla de respuesta rápida?')) return;
    try {
      const res = await fetch(`/api/quick-replies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setQuickReplies(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error('Error eliminando respuesta rápida:', err);
    }
  };

  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const liveTranscriptionRef = useRef('');
  const [transcribingMsgId, setTranscribingMsgId] = useState(null);

  const handleRequestTranscription = async (msg) => {
    if (!selectedLead?.jid || !msg?.id) return;
    try {
      setTranscribingMsgId(msg.id);
      const res = await fetch(`/api/chats/${encodeURIComponent(selectedLead.jid)}/messages/${encodeURIComponent(msg.id)}/transcribe`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages(prev => prev.map(m => String(m.id) === String(msg.id) ? data.message : m));
      }
    } catch (err) {
      console.error('Error solicitando transcripción:', err);
    } finally {
      setTranscribingMsgId(null);
    }
  };

  // Cargar mensajes cuando cambia el lead seleccionado
  useEffect(() => {
    if (!selectedLead) return;

    setIsLoadingMessages(true);
    fetch(`/api/chats/${encodeURIComponent(selectedLead.jid)}/messages`)
      .then(res => res.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setIsLoadingMessages(false);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      })
      .catch(err => {
        console.error('Error cargando mensajes:', err);
        setIsLoadingMessages(false);
      });
  }, [selectedLead?.jid]);

  // Escuchar mensajes entrantes en tiempo real por WebSocket
  useEffect(() => {
    if (!socket) return;
    const handleSocketMessage = ({ message, lead }) => {
      if (!selectedLead || !message) return;
      const currentJid = selectedLead.jid;
      const altJids = selectedLead.altJids || [];
      if (message.chatId === currentJid || altJids.includes(message.chatId)) {
        setMessages(prev => {
          // 1. Si ya existe exactamente el mismo ID, ignorar o actualizar
          const existingExact = prev.findIndex(m => m.id === message.id);
          if (existingExact >= 0) {
            const updated = [...prev];
            updated[existingExact] = { ...updated[existingExact], ...message };
            return updated;
          }

          // 2. Si hay un mensaje temporal optimista (temp-...) con el mismo contenido y remitente, reemplazarlo
          const tempIndex = prev.findIndex(m => 
            String(m.id).startsWith('temp-') && 
            m.sender === message.sender && 
            (m.content || '').trim() === (message.content || '').trim()
          );

          if (tempIndex >= 0) {
            const updated = [...prev];
            updated[tempIndex] = message;
            return updated;
          }

          // 3. Deduping por contenido y ventana de tiempo para mensajes de agente
          if (message.sender === 'agent' && message.content) {
            const msgTime = new Date(message.timestamp).getTime();
            const duplicateRecent = prev.some(m => 
              m.sender === 'agent' &&
              (m.content || '').trim() === (message.content || '').trim() &&
              Math.abs(new Date(m.timestamp).getTime() - msgTime) < 8000
            );
            if (duplicateRecent) return prev;
          }

          return [...prev, message];
        });
      }
    };

    socket.on('chat:message', handleSocketMessage);
    return () => {
      socket.off('chat:message', handleSocketMessage);
    };
  }, [socket, selectedLead?.jid]);

  // Cargar pedidos asociados al lead seleccionado
  useEffect(() => {
    if (!selectedLead?.jid && !selectedLead?.id) {
      setLeadOrders([]);
      return;
    }

    const fetchLeadOrders = () => {
      fetch('/api/orders')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const jid = selectedLead.jid;
            const altJids = selectedLead.altJids || [];
            const leadId = selectedLead.id;
            const phoneDigits = String(selectedLead.phone || selectedLead.jid || '').replace(/\D/g, '');
            const coreDigits = phoneDigits.length >= 8 ? phoneDigits.slice(-8) : (phoneDigits.length >= 6 ? phoneDigits : '');

            const matching = data.filter(o => {
              if (o.jid === jid || o.customerJid === jid || o.leadId === leadId || o.jid === leadId) return true;
              if (altJids.includes(o.jid) || altJids.includes(o.customerJid)) return true;
              const ordDigits = String(o.phone || o.customerPhone || o.jid || '').replace(/\D/g, '');
              if (coreDigits && ordDigits.includes(coreDigits)) return true;
              return false;
            });
            setLeadOrders(matching);
          }
        })
        .catch(err => console.error('Error cargando pedidos del lead:', err));
    };

    fetchLeadOrders();

    // Auto-refresco en segundo plano al cambiar de ventana o foco
    const handleFocus = () => fetchLeadOrders();
    window.addEventListener('focus', handleFocus);

    if (socket) {
      const handleOrderUpdate = (order) => {
        if (!order) {
          fetchLeadOrders();
          return;
        }
        const jid = selectedLead?.jid;
        const altJids = selectedLead?.altJids || [];
        const leadId = selectedLead?.id;
        const phoneDigits = String(selectedLead?.phone || selectedLead?.jid || '').replace(/\D/g, '');
        const coreDigits = phoneDigits.length >= 8 ? phoneDigits.slice(-8) : (phoneDigits.length >= 6 ? phoneDigits : '');
        const ordDigits = String(order.phone || order.customerPhone || order.jid || '').replace(/\D/g, '');

        if (
          order.jid === jid || 
          order.customerJid === jid || 
          order.leadId === leadId || 
          order.jid === leadId ||
          altJids.includes(order.jid) ||
          altJids.includes(order.customerJid) ||
          (coreDigits && ordDigits.includes(coreDigits))
        ) {
          fetchLeadOrders();
        }
      };

      socket.on('order:new', handleOrderUpdate);
      socket.on('order:update', handleOrderUpdate);
      socket.on('order:delete', fetchLeadOrders);
      socket.on('orders:sync', fetchLeadOrders);

      return () => {
        window.removeEventListener('focus', handleFocus);
        socket.off('order:new', handleOrderUpdate);
        socket.off('order:update', handleOrderUpdate);
        socket.off('order:delete', fetchLeadOrders);
        socket.off('orders:sync', fetchLeadOrders);
      };
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [socket, selectedLead?.jid, selectedLead?.id, selectedLead?.phone]);

  // Cargar catálogo de productos activos para añadir a la canasta
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCatalogProducts(data.filter(p => p.isAvailable !== false));
        }
      })
      .catch(err => console.error('Error cargando catálogo:', err));
  }, []);

  const handleUpdateItemQty = async (order, itemIndex, newQty) => {
    if (!order) return;
    const currentNormalized = parseNormalizedCartItems(order, catalogProducts);
    if (!currentNormalized || currentNormalized.length === 0) return;

    const qty = Math.max(0.1, Number(newQty) || 0.1);
    const updatedProducts = currentNormalized.map((it, idx) => {
      if (idx !== itemIndex) return it;
      const subtotal = Math.round((Number(it.price) || 0) * qty);
      return { ...it, quantity: qty, subtotal };
    });

    const updatedItemsStrings = updatedProducts.map(it => 
      `• ${it.quantity} ${it.unit} ${it.name} — $${it.subtotal.toLocaleString('es-AR')}`
    );
    const totalAmount = updatedProducts.reduce((acc, it) => acc + (it.subtotal || 0), 0);

    setIsSavingOrder(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: updatedItemsStrings, 
          products: updatedProducts, 
          totalAmount 
        })
      });
      if (res.ok) {
        setLeadOrders(prev => prev.map(o => o.id === order.id ? { ...o, items: updatedItemsStrings, products: updatedProducts, totalAmount } : o));
      }
    } catch (err) {
      console.error('Error actualizando cantidad:', err);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleRemoveItemFromOrder = async (order, itemIndex) => {
    if (!order) return;
    const currentNormalized = parseNormalizedCartItems(order, catalogProducts);
    const updatedProducts = currentNormalized.filter((_, idx) => idx !== itemIndex);

    const updatedItemsStrings = updatedProducts.map(it => 
      `• ${it.quantity} ${it.unit} ${it.name} — $${it.subtotal.toLocaleString('es-AR')}`
    );
    const totalAmount = updatedProducts.reduce((acc, it) => acc + (it.subtotal || 0), 0);

    setIsSavingOrder(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: updatedItemsStrings, 
          products: updatedProducts, 
          totalAmount 
        })
      });
      if (res.ok) {
        setLeadOrders(prev => prev.map(o => o.id === order.id ? { ...o, items: updatedItemsStrings, products: updatedProducts, totalAmount } : o));
      }
    } catch (err) {
      console.error('Error eliminando ítem:', err);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleToggleGodMode = async () => {
    if (!selectedLead) return;
    const nextState = !Boolean(selectedLead.godMode);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(selectedLead.id || selectedLead.jid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ godMode: nextState })
      });
      if (res.ok) {
        setSelectedLead(prev => ({ ...prev, godMode: nextState }));
        if (onUpdateLead) onUpdateLead({ ...selectedLead, godMode: nextState });
      }
    } catch (err) {
      console.error('Error alternando God Mode:', err);
    }
  };

  const handleToggleOrderPrepared = async (order) => {
    if (!order) return;
    const nextVal = !Boolean(order.isPrepared);
    try {
      const res = await fetch(`/api/orders/${order.id}/prepare`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrepared: nextVal })
      });
      const data = await res.json();
      if (res.ok) {
        setLeadOrders(prev => prev.map(o => o.id === order.id ? data : o));
      }
    } catch (err) {
      console.error('Error alternando preparación:', err);
    }
  };

  const handleUpdateOrderStatus = async (order, newStatus) => {
    if (!order || !newStatus) return;
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notify: false })
      });
      const data = await res.json();
      if (res.ok) {
        setLeadOrders(prev => prev.map(o => o.id === order.id ? data : o));
      }
    } catch (err) {
      console.error('Error actualizando estado:', err);
    }
  };

  const handleAddItemToOrder = async (order) => {
    if (!selectedProdToAdd) return;
    const prod = catalogProducts.find(p => String(p.id) === String(selectedProdToAdd) || p.name === selectedProdToAdd);
    if (!prod) return;

    const qty = Number(addQty) || 1;
    const unitPrice = Number(prod.price) || 0;
    const subtotal = Math.round(unitPrice * qty);

    setIsSavingOrder(true);
    try {
      if (order) {
        // Añadir a pedido existente
        const currentNormalized = parseNormalizedCartItems(order, catalogProducts);
        const existingIdx = currentNormalized.findIndex(it => 
          (it.productId && String(it.productId) === String(prod.id)) || 
          it.name.toLowerCase() === prod.name.toLowerCase()
        );

        let updatedProducts = [];
        if (existingIdx >= 0) {
          updatedProducts = currentNormalized.map((it, idx) => {
            if (idx !== existingIdx) return it;
            const newQ = (Number(it.quantity) || 0) + qty;
            return { ...it, quantity: newQ, subtotal: Math.round(unitPrice * newQ) };
          });
        } else {
          updatedProducts = [
            ...currentNormalized,
            {
              id: prod.id,
              productId: prod.id,
              name: prod.name,
              category: prod.category || 'General',
              quantity: qty,
              unit: prod.unit || 'kg',
              price: unitPrice,
              subtotal: subtotal
            }
          ];
        }

        const updatedItemsStrings = updatedProducts.map(it => 
          `• ${it.quantity} ${it.unit} ${it.name} — $${it.subtotal.toLocaleString('es-AR')}`
        );
        const totalAmount = updatedProducts.reduce((acc, it) => acc + (it.subtotal || 0), 0);

        const res = await fetch(`/api/orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            items: updatedItemsStrings, 
            products: updatedProducts, 
            totalAmount 
          })
        });
        if (res.ok) {
          setLeadOrders(prev => prev.map(o => o.id === order.id ? { ...o, items: updatedItemsStrings, products: updatedProducts, totalAmount } : o));
          setSelectedProdToAdd('');
          setAddQty('1');
          setOrderCartSuccess('¡Producto agregado al pedido!');
          setTimeout(() => setOrderCartSuccess(null), 3000);
        }
      } else {
        // Crear nuevo pedido para este contacto
        const newOrderPayload = {
          customerJid: selectedLead.jid,
          customerName: selectedLead.name || selectedLead.pushName || 'Cliente WhatsApp',
          customerPhone: selectedLead.phone || selectedLead.jid?.split('@')[0],
          phone: selectedLead.phone || selectedLead.jid?.split('@')[0],
          leadId: selectedLead.id,
          address: selectedLead.address || '',
          branch: selectedLead.preferredBranch || 'URCA CENTRAL',
          status: 'pending',
          paymentStatus: 'pending',
          channel: 'WHATSAPP',
          source: 'WHATSAPP',
          origin: 'WHATSAPP',
          products: [{
            id: prod.id,
            productId: prod.id,
            name: prod.name,
            category: prod.category || 'General',
            quantity: qty,
            unit: prod.unit || 'kg',
            price: unitPrice,
            subtotal: subtotal
          }],
          items: [`• ${qty} ${prod.unit || 'kg'} ${prod.name} — $${subtotal.toLocaleString('es-AR')}`],
          totalAmount: subtotal
        };

        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOrderPayload)
        });
        if (res.ok) {
          const created = await res.json();
          setLeadOrders([created, ...leadOrders]);
          setSelectedProdToAdd('');
          setAddQty('1');
          setOrderCartSuccess('¡Nuevo pedido iniciado con éxito!');
          setTimeout(() => setOrderCartSuccess(null), 3000);
        }
      }
    } catch (err) {
      console.error('Error agregando producto al pedido:', err);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSendCartToWhatsApp = (order) => {
    if (!order || !selectedLead) return;
    const normalizedCartItems = parseNormalizedCartItems(order, catalogProducts);
    if (!normalizedCartItems || normalizedCartItems.length === 0) return;

    const itemsList = normalizedCartItems.map(it => {
      return `• ${it.quantity} ${it.unit} de *${it.name}* ➔ $${it.subtotal.toLocaleString('es-AR')}`;
    }).join('\n');
    const msg = `📋 *Detalle de tu pedido actualizado:* 🥩\n\n${itemsList}\n\n💰 *Total:* $${Number(order.totalAmount || 0).toLocaleString('es-AR')}\n\n👉 Decime si te parece bien o si querés sumar algo más y te lo preparamos al toque. 🚚`;
    onSendMessage(selectedLead.jid, msg);
    setOrderCartSuccess('¡Detalle del carrito enviado al chat de WhatsApp!');
    setTimeout(() => setOrderCartSuccess(null), 3000);
  };

  const handleSendPaymentLink = async (order) => {
    if (!order || !selectedLead) return;
    try {
      const res = await fetch(`/api/orders/${order.id}/mercadopago`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const initPoint = data.init_point || data.sandbox_init_point;
        if (initPoint) {
          const msg = `💳 *Link de Pago Oficial Mercado Pago:* 🥩\n\nPodés abonar tu pedido #${order.id} por un total de *$${Number(order.totalAmount || 0).toLocaleString('es-AR')}* en el siguiente link seguro:\n🔗 ${initPoint}\n\n¡Apenas se confirme el pago comenzamos a cortar y despachar tu pedido! 🚚`;
          onSendMessage(selectedLead.jid, msg);
          setOrderCartSuccess('¡Link de pago generado y enviado al chat!');
          setTimeout(() => setOrderCartSuccess(null), 3000);
        }
      }
    } catch (err) {
      console.error('Error generating payment link:', err);
    }
  };

  // Auto-scroll al recibir nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Manejar envío de texto con render optimista
  const handleSendText = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedLead) return;

    const textToSend = inputText.trim();
    setInputText('');

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      chatId: selectedLead.jid,
      sender: 'agent',
      type: 'text',
      content: textToSend,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      if (onSendMessage) {
        const res = await onSendMessage(selectedLead.jid, textToSend);
        if (res && res.message) {
          setMessages(prev => prev.map(m => m.id === tempId ? res.message : m));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', deliveryWarning: err.message } : m));
    }
  };

  // Grabación de audio con MediaRecorder y reconocimiento de voz asistido
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      // Iniciar reconocimiento de voz en vivo en el navegador si está disponible
      liveTranscriptionRef.current = '';
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        try {
          const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
          speechRecognitionRef.current = new SpeechRec();
          speechRecognitionRef.current.lang = 'es-AR';
          speechRecognitionRef.current.continuous = true;
          speechRecognitionRef.current.interimResults = true;
          speechRecognitionRef.current.onresult = (event) => {
            let finalTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
              finalTranscript += event.results[i][0].transcript;
            }
            liveTranscriptionRef.current = finalTranscript;
          };
          speechRecognitionRef.current.start();
        } catch (_) {}
      }

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        if (speechRecognitionRef.current) {
          try { speechRecognitionRef.current.stop(); } catch (_) {}
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0 && selectedLead) {
          const formData = new FormData();
          formData.append('audio', audioBlob, `voice_note_${Date.now()}.webm`);
          if (liveTranscriptionRef.current) {
            formData.append('transcription', liveTranscriptionRef.current);
          }
          formData.append('duration', String(recordingSeconds || 5));
          onSendAudio(selectedLead.jid, formData);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      alert('No se pudo acceder al micrófono para grabar la nota de voz.');
    }
  };

  const stopRecording = (cancel = false) => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        mediaRecorderRef.current.onstop = null;
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Abrir Modal de Edición de Contacto
  const handleOpenEditContact = () => {
    if (!selectedLead) return;
    setEditContactData({
      name: selectedLead.name || selectedLead.pushName || '',
      phone: selectedLead.phone || selectedLead.jid?.split('@')[0] || '',
      email: selectedLead.email || '',
      address: selectedLead.address || selectedLead.notes?.replace('Dirección: ', '').split('|')[0]?.trim() || '',
      preferredBranch: selectedLead.preferredBranch || '',
      notes: selectedLead.notes || '',
      stage: selectedLead.stage || 'new_lead',
      value: selectedLead.value || 0,
      tags: selectedLead.tags || ['WhatsApp']
    });
    setIsEditContactModalOpen(true);
  };

  // Guardar Cambios de Contacto
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;

    setIsSavingContact(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(selectedLead.id || selectedLead.jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editContactData.name,
          phone: editContactData.phone,
          email: editContactData.email,
          address: editContactData.address,
          preferredBranch: editContactData.preferredBranch,
          notes: editContactData.notes,
          stage: editContactData.stage,
          value: Number(editContactData.value) || 0,
          tags: editContactData.tags
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedLead(updated);
        setIsEditContactModalOpen(false);
      }
    } catch (err) {
      console.error('Error guardando contacto:', err);
    } finally {
      setIsSavingContact(false);
    }
  };

  // Vaciar Mensajes del Chat
  const handleClearMessages = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/messages/chat/${encodeURIComponent(selectedLead.jid)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMessages([]);
        if (onClearChat) onClearChat(selectedLead.jid);
        setIsDeleteModalOpen(false);
      }
    } catch (err) {
      console.error('Error vaciando mensajes:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Eliminar Contacto por Completo
  const handleDeleteContact = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(selectedLead.id || selectedLead.jid)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (onDeleteLead) onDeleteLead(selectedLead.id || selectedLead.jid);
        setSelectedLead(null);
        setIsDeleteModalOpen(false);
      }
    } catch (err) {
      console.error('Error eliminando contacto:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Copiar transcripción al portapapeles
  const handleCopyTranscription = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2500);
  };

  // Filtrado de Leads en la Barra Lateral
  const filteredLeads = leads.filter(lead => {
    const matchSearch = 
      (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.phone || '').includes(searchTerm) ||
      (lead.jid || '').includes(searchTerm) ||
      (lead.lastMessage || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;
    if (filterStage === 'all') return true;
    return lead.stage === filterStage;
  });

  // Pedido activo o más reciente del cliente
  const latestOrder = leadOrders.find(o => ['pending', 'preparing', 'in_transit', 'ready_for_pickup'].includes(o.status)) || leadOrders[0] || null;

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#111b21]">
      
      {/* 1. Barra Lateral: Lista de Conversaciones */}
      <div className="w-full sm:w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-[#111b21] flex-shrink-0">
        
        {/* Encabezado y Buscador */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <span>Mensajes de WhatsApp</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                {filteredLeads.length}
              </span>
            </h2>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o corte..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#182229] border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filtro rápido de Etapas */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'new_lead', label: 'Nuevos' },
              { id: 'negotiating', label: 'Negociación' },
              { id: 'proposal', label: 'Propuesta' },
              { id: 'closed_won', label: 'Ganados' }
            ].map(stage => (
              <button
                key={stage.id}
                onClick={() => setFilterStage(stage.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                  filterStage === stage.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Chats */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No hay conversaciones en esta categoría
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const isSelected = selectedLead?.jid === lead.jid;
              return (
                <div
                  key={lead.jid || lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`p-3.5 cursor-pointer transition flex items-start gap-3 relative ${
                    isSelected
                      ? 'bg-emerald-500/10 border-l-4 border-emerald-500'
                      : 'hover:bg-[#182229]/60'
                  }`}
                >
                  {/* Avatar con foto o iniciales */}
                  <div className="relative w-10 h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-emerald-400 text-sm flex-shrink-0">
                    {lead.avatar ? (
                      <img
                        src={lead.avatar}
                        alt={lead.name || 'Avatar'}
                        className="w-full h-full object-cover absolute inset-0"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : null}
                    <span>
                      {(lead.name || lead.pushName || 'C').charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info del Lead */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-white truncate">
                        {lead.name || lead.pushName || 'Contacto WhatsApp'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                        {lead.lastMessageAt ? new Date(lead.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 truncate mb-1">
                      {lead.lastMessage || 'Conversación iniciada'}
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`px-1.5 py-0.2 rounded font-semibold ${
                        lead.stage === 'closed_won' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        lead.stage === 'proposal' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        lead.stage === 'negotiating' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {lead.stage === 'new_lead' ? 'Nuevo' :
                         lead.stage === 'qualified' ? 'Calificado' :
                         lead.stage === 'negotiating' ? 'Negociando' :
                         lead.stage === 'proposal' ? 'Propuesta' :
                         lead.stage === 'closed_won' ? '🎉 Ganado' : 'Perdido'}
                      </span>
                      {lead.value > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold font-mono">
                          ${Number(lead.value).toLocaleString('es-AR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de no leídos */}
                  {lead.unreadCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 self-center">
                      {lead.unreadCount}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* 2. Área Principal de Chat & Mensajes */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden">
          
          {/* Header del Chat */}
          <div className="h-16 px-5 border-b border-slate-800 bg-[#111b21] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden text-emerald-400 font-bold flex items-center justify-center text-sm flex-shrink-0">
                {selectedLead.avatar ? (
                  <img
                    src={selectedLead.avatar}
                    alt={selectedLead.name || 'Avatar'}
                    className="w-full h-full object-cover absolute inset-0"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : null}
                <span>
                  {(selectedLead.name || selectedLead.pushName || 'U').substring(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">
                    {selectedLead.name || selectedLead.pushName || 'Contacto WhatsApp'}
                  </h3>
                  <button
                    onClick={handleOpenEditContact}
                    className="p-1 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                    title="Editar datos del contacto (Nombre, dirección, teléfono, notas)"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
                
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
                  <span className="font-mono text-[11px] text-slate-300">
                    📞 {selectedLead.phone && !selectedLead.phone.includes('@lid') && !selectedLead.phone.startsWith('+1530')
                      ? selectedLead.phone
                      : (selectedLead.jid && selectedLead.jid.includes('@s.whatsapp.net')
                        ? `+${selectedLead.jid.split('@')[0]}`
                        : 'WhatsApp Directo')}
                  </span>
                  {selectedLead.email && (
                    <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-sky-400">
                      <Mail size={11} />
                      {selectedLead.email}
                    </span>
                  )}
                  {selectedLead.preferredBranch && (
                    <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-amber-400">
                      <Store size={11} />
                      {selectedLead.preferredBranch}
                    </span>
                  )}
                  {selectedLead.address && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[180px]">
                      <MapPin size={11} className="text-rose-400 flex-shrink-0" />
                      {selectedLead.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones del Header: Canasta, Ir a Pedido, Llamar, Editar, Vaciar/Eliminar, Toggle IA */}
            <div className="flex items-center gap-2">
              
              {/* Botón Abrir / Cerrar Canasta de Pedido en Vivo */}
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 shadow-sm ${
                  isCartOpen
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-emerald-500/20'
                    : 'bg-[#182229] hover:bg-[#202c33] text-emerald-400 border-emerald-500/40'
                }`}
                title="Abrir panel interactivo de Canasta y Modificación de Pedido"
              >
                <ShoppingCart size={13} />
                <span>Canasta</span>
                {latestOrder && (
                  <span className={`font-mono text-[11px] ${isCartOpen ? 'text-slate-900' : 'text-emerald-300'}`}>
                    (${Number(latestOrder.totalAmount || 0).toLocaleString('es-AR')})
                  </span>
                )}
              </button>

              {/* Botón Ir al Pedido del Cliente */}
              {latestOrder && (
                <button
                  onClick={() => onNavigateToOrders && onNavigateToOrders(latestOrder.id)}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold border border-amber-500/40 transition-all active:scale-95 shadow-sm"
                  title={`Ir al Pedido #${latestOrder.id} (${latestOrder.status})`}
                >
                  <PackageCheck size={14} className="text-amber-400" />
                  <span className="hidden xl:inline">Pedido #{latestOrder.id}</span>
                  <span className="xl:hidden">#{latestOrder.id}</span>
                  <ChevronRight size={13} className="text-amber-400" />
                </button>
              )}

              {/* Botón Editar Contacto */}
              <button
                onClick={handleOpenEditContact}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-[#202c33] text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition"
                title="Editar datos del contacto"
              >
                <Edit3 size={13} className="text-emerald-400" />
                <span className="hidden md:inline">Editar Contacto</span>
              </button>

              {/* Botón Llamar a este Contacto */}
              <button
                onClick={() => onCallLead && onCallLead(selectedLead)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                title="Llamar o despachar audio a este contacto"
              >
                <PhoneCall size={13} className="text-emerald-400" />
                <span className="hidden md:inline">Llamar</span>
              </button>

              {/* Botón Vaciar / Eliminar Conversación */}
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-2 rounded-xl bg-[#182229] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                title="Vaciar mensajes o eliminar conversación"
              >
                <Trash2 size={14} />
              </button>

              {/* Botón God Mode (Modo Dios IA Libre) */}
              <button
                onClick={handleToggleGodMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 shadow-sm ${
                  selectedLead.godMode
                    ? 'bg-purple-600 text-white border-purple-400 font-extrabold shadow-purple-500/30 ring-2 ring-purple-400/50'
                    : 'bg-[#182229] hover:bg-[#202c33] text-purple-400 border-purple-500/40'
                }`}
                title="Activar/Desactivar Modo Dios (Conversación Libre con el Modelo de IA sin restricciones de venta)"
              >
                <Sparkles size={13} className={selectedLead.godMode ? 'text-amber-300' : 'text-purple-400'} />
                <span>{selectedLead.godMode ? '⚡ God Mode ON' : '⚡ God Mode'}</span>
              </button>

              {/* Toggle IA por Chat */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                selectedLead.aiEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Bot size={15} />
                <span className="text-xs font-bold hidden sm:inline">
                  {selectedLead.aiEnabled ? 'IA Activa' : 'Manual'}
                </span>
                <button
                  onClick={() => onToggleLeadAi(selectedLead.jid, !selectedLead.aiEnabled)}
                  className={`w-8 h-4.5 rounded-full transition-colors relative p-0.5 ${
                    selectedLead.aiEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    selectedLead.aiEnabled ? 'translate-x-3.5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Banner de Modo Dios Activo */}
          {selectedLead.godMode && (
            <div className="bg-gradient-to-r from-purple-900/60 via-indigo-900/60 to-purple-900/60 border-b border-purple-500/40 px-5 py-2 flex items-center justify-between text-xs text-purple-200 flex-shrink-0 animate-fadeIn shadow-inner">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-300 animate-pulse" />
                <span className="font-bold text-white">Modo Dios (God Mode) Activo:</span>
                <span className="text-purple-200 hidden sm:inline">El contacto está conversando directamente y sin restricciones con el modelo de IA.</span>
              </div>
              <button
                onClick={handleToggleGodMode}
                className="text-[11px] font-bold text-amber-300 hover:text-white underline ml-2 shrink-0"
              >
                Desactivar (/godmode off)
              </button>
            </div>
          )}

          {/* Banner de Pedido Activo / Histórico del Cliente */}
          {latestOrder && (
            <div className="bg-[#182229] border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between gap-3 text-xs flex-shrink-0 animate-fadeIn shadow-inner">
              <div className="flex items-center gap-2.5 text-slate-300 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                <span className="font-bold text-white flex-shrink-0">Pedido #{latestOrder.id}:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
                  latestOrder.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  latestOrder.status === 'in_transit' ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' :
                  latestOrder.status === 'preparing' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                  latestOrder.status === 'ready_for_pickup' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                  latestOrder.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {latestOrder.status === 'pending' ? '⏳ Pendiente' :
                   latestOrder.status === 'preparing' ? '🥩 En Preparación' :
                   latestOrder.status === 'in_transit' ? '🛵 En Camino' :
                   latestOrder.status === 'ready_for_pickup' ? '🎉 Listo en Sucursal' :
                   latestOrder.status === 'delivered' ? '✅ Entregado' : '❌ Cancelado'}
                </span>
                <span className="font-mono font-bold text-emerald-400 flex-shrink-0">
                  ${Number(latestOrder.totalAmount || 0).toLocaleString('es-AR')}
                </span>
                {Array.isArray(latestOrder.items) && latestOrder.items.length > 0 && (
                  <span className="text-slate-400 truncate hidden md:inline text-[11px]">
                    • {latestOrder.items.map(it => typeof it === 'object' ? `${it.quantity || 1} ${it.name}` : String(it).replace(/^•\s*/, '')).join(', ').substring(0, 60)}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold rounded-lg text-xs transition shadow-sm active:scale-95 flex-shrink-0"
                title="Modificar cortes y cantidades de este pedido"
              >
                <ShoppingCart size={12} />
                <span>{isCartOpen ? 'Cerrar Canasta' : 'Modificar Canasta'}</span>
                <ChevronRight size={12} />
              </button>
            </div>
          )}

          {/* Contenedor Flex: Chat de Mensajes + Canasta Lateral Interactiva */}
          <div className="flex-1 flex overflow-hidden">
            {/* Columna Principal: Hilo de Mensajes + Input Bar */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Hilo de Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 chat-bg-pattern space-y-4">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-10">
                    <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                    <p>No hay mensajes en esta conversación.</p>
                    <p className="text-[11px] text-slate-500">Envía un mensaje de texto o nota de voz para comenzar.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isUser = msg.sender === 'user';
                    const hasTranscription = msg.type === 'audio' && msg.content && msg.content !== '[Nota de voz]' && msg.content !== '🎤 [Nota de voz]';

                    return (
                      <div
                        key={msg.id || index}
                        className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} animate-in fade-in duration-150`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-md rounded-2xl p-3.5 shadow-lg space-y-2 ${
                            isUser
                              ? 'bg-[#202c33] text-white rounded-tl-sm border border-slate-700/50'
                              : 'bg-[#005c4b] text-white rounded-tr-sm shadow-emerald-950/20'
                          }`}
                        >
                          {/* Header del Mensaje */}
                          <div className="flex items-center justify-between gap-4 text-[10px] text-slate-300/80 border-b border-white/10 pb-1">
                            <span className="font-semibold flex items-center gap-1">
                              {isUser ? (
                                <>
                                  <User size={11} className="text-slate-400" />
                                  {selectedLead.name || selectedLead.pushName || 'Cliente'}
                                </>
                              ) : (
                                <>
                                  <Bot size={11} className="text-emerald-300" />
                                  Asesor de Ventas
                                </>
                              )}
                            </span>
                            <span className="font-mono">
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>

                          {/* Reproductor de Audio si es mensaje de voz */}
                          {msg.type === 'audio' && (
                            <div className="space-y-2">
                              <AudioPlayer
                                audioUrl={msg.mediaUrl}
                                duration={msg.audioDuration}
                                isAgent={!isUser}
                              />

                              {/* Burbuja de Transcripción de Audio */}
                              {hasTranscription ? (
                                <div className="bg-black/30 rounded-xl p-2.5 border border-white/10 text-xs space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400">
                                    <span className="flex items-center gap-1">
                                      <Volume2 size={11} /> Transcripción de Audio:
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyTranscription(msg.content, msg.id || index)}
                                      className="text-slate-400 hover:text-white p-0.5 rounded"
                                      title="Copiar texto"
                                    >
                                      {copiedMsgId === (msg.id || index) ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                    </button>
                                  </div>
                                  <p className="italic text-[11px] text-slate-200 leading-relaxed font-sans">
                                    "{msg.content}"
                                  </p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                                  <span className="italic">Audio de voz</span>
                                  <button
                                    type="button"
                                    disabled={transcribingMsgId === msg.id}
                                    onClick={() => handleRequestTranscription(msg)}
                                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1"
                                  >
                                    <Sparkles size={10} className={transcribingMsgId === msg.id ? 'animate-spin' : ''} />
                                    <span>{transcribingMsgId === msg.id ? 'Transcribiendo...' : 'Transcribir'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}


                          {/* Texto del mensaje si no es solo audio */}
                          {msg.type !== 'audio' && msg.content && (
                            <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line text-slate-100">
                              {msg.content}
                            </p>
                          )}

                          {/* Check de estado de entrega */}
                          {!isUser && (
                            <div className="flex items-center justify-end gap-1 text-[10px] pt-0.5">
                              {msg.status === 'failed' ? (
                                <span className="text-rose-400 font-bold flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded" title={msg.deliveryWarning || 'No se pudo entregar por WhatsApp'}>
                                  <AlertCircle size={12} className="text-rose-400" />
                                  <span>No enviado por WhatsApp</span>
                                </span>
                              ) : msg.status === 'pending' ? (
                                <span className="text-amber-300 flex items-center gap-1" title="Pendiente de conexión de WhatsApp">
                                  <Clock size={11} className="text-amber-300" />
                                  <span>Pendiente</span>
                                </span>
                              ) : (
                                <span title="Entregado">
                                  <CheckCheck size={13} className="text-sky-300" />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Panel Desplegable de Respuestas Rápidas y Plantillas */}
              {isQuickRepliesOpen && (
                <div className="border-t border-slate-800 bg-[#141e24] p-3 sm:p-4 max-h-72 overflow-y-auto space-y-3 animate-in slide-in-from-bottom duration-200">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-amber-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Plantillas & Respuestas Rápidas para Operador
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuickReply(null);
                          setQuickReplyFormData({ title: '', category: 'general', content: '' });
                          setIsEditQuickReplyModalOpen(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition"
                      >
                        <Plus size={13} />
                        Nueva Plantilla
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsQuickRepliesOpen(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Filtros de Categorías y Buscador */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[140px]">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar plantilla o contenido..."
                        value={quickReplySearch}
                        onChange={(e) => setQuickReplySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#111b21] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    {['all', 'sucursales', 'horarios', 'pagos', 'productos', 'pedidos', 'general'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setQuickReplyCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                          quickReplyCategory === cat
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-[#111b21] text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {cat === 'all' ? 'Todas' : cat}
                      </button>
                    ))}
                  </div>

                  {/* Lista de Plantillas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {quickReplies
                      .filter(r => {
                        if (quickReplyCategory !== 'all' && r.category !== quickReplyCategory) return false;
                        if (quickReplySearch) {
                          const s = quickReplySearch.toLowerCase();
                          return (r.title || '').toLowerCase().includes(s) || (r.content || '').toLowerCase().includes(s);
                        }
                        return true;
                      })
                      .map(r => (
                        <div
                          key={r.id}
                          className="bg-[#111b21] border border-slate-700/80 rounded-xl p-2.5 flex flex-col justify-between hover:border-slate-600 transition space-y-2 group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-bold text-white truncate">{r.title}</span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                {r.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-line bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80 font-sans">
                              {resolveTemplateVariables(r.content)}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/80">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuickReply(r);
                                  setQuickReplyFormData({ title: r.title, category: r.category || 'general', content: r.content });
                                  setIsEditQuickReplyModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                                title="Editar plantilla"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuickReply(r.id)}
                                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-500/10"
                                title="Eliminar plantilla"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleInsertQuickReply(r.content)}
                                className="px-2 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                                title="Insertar en el campo de texto para editar"
                              >
                                ✍️ Insertar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendQuickReplyDirect(r.content)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition flex items-center gap-1"
                                title="Enviar directamente por WhatsApp"
                              >
                                <Send size={11} /> Enviar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Barra de Entrada de Texto, Respuestas Rápidas y Grabación */}
              <div className="p-3 bg-[#111b21] border-t border-slate-800 flex-shrink-0 space-y-2">
                {/* Chips de Respuestas Rápidas de 1-Clic */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                  <button
                    type="button"
                    onClick={() => setIsQuickRepliesOpen(prev => !prev)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                      isQuickRepliesOpen
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                        : 'bg-[#182229] text-amber-400 hover:bg-[#202c33] border border-amber-500/30'
                    }`}
                    title="Abrir menú de respuestas rápidas y plantillas"
                  >
                    <Zap size={13} />
                    <span>Respuestas Rápidas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedLead?.godMode) {
                        onSendMessage(selectedLead.jid, '/godmode off');
                        setSelectedLead(prev => ({ ...prev, godMode: false }));
                      } else {
                        onSendMessage(selectedLead.jid, '/godmode on');
                        setSelectedLead(prev => ({ ...prev, godMode: true }));
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl shrink-0 transition text-xs font-bold border ${
                      selectedLead?.godMode
                        ? 'bg-purple-600 text-white border-purple-400 shadow-purple-500/30 shadow-md animate-pulse'
                        : 'bg-[#182229] hover:bg-[#202c33] border-purple-500/40 text-purple-400 hover:text-purple-300'
                    }`}
                    title="Alternar Modo Dios (Conversación libre sin restricciones con el modelo de IA)"
                  >
                    <Sparkles size={12} className={selectedLead?.godMode ? 'text-amber-300' : 'text-purple-400'} />
                    <span>{selectedLead?.godMode ? '⚡ Salir God Mode' : '⚡ /godmode'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const item = quickReplies.find(r => r.category === 'sucursales');
                      if (item) handleInsertQuickReply(item.content);
                      else handleInsertQuickReply('🏪 *Nuestras Sucursales:* Urca (Roque Funes 1115), Urca 2 (Pidal 3575), Intercountry (Los Álamos 1015), Duarte Quirós 5130, Villa Allende (Alcorta 480), Country San Isidro.');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 text-slate-300 hover:text-white shrink-0 transition"
                  >
                    <span>🏪 Sucursales</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const item = quickReplies.find(r => r.category === 'horarios');
                      if (item) handleInsertQuickReply(item.content);
                      else handleInsertQuickReply('⏰ *Horarios:* Lunes a Sábado de 9:00 a 21:00 hs | Domingos de 9:00 a 13:30 hs.');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 text-slate-300 hover:text-white shrink-0 transition"
                  >
                    <span>⏰ Horarios</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const item = quickReplies.find(r => r.category === 'pagos');
                      if (item) handleInsertQuickReply(item.content);
                      else handleInsertQuickReply('💳 *Datos de Pago:* Alias MP `republica.carne.mp` | También podés pagar en efectivo o link de Mercado Pago.');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 text-slate-300 hover:text-white shrink-0 transition"
                  >
                    <span>💳 Alias / MP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const item = quickReplies.find(r => r.category === 'productos');
                      if (item) handleInsertQuickReply(item.content);
                      else handleInsertQuickReply('🔥 *Promos del Día:* Combo Asadazo $39.999 | Vacío $11.500/kg | Costillar $9.800/kg | Chori Criollo $5.000/kg.');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 text-slate-300 hover:text-white shrink-0 transition"
                  >
                    <span>🥩 Promos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const item = quickReplies.find(r => r.category === 'pedidos');
                      if (item) handleInsertQuickReply(item.content);
                      else handleInsertQuickReply('¡Hola {nombre}! 👋 Tu pedido #{pedido_id} por ${total} se encuentra en preparación y saldrá con el repartidor a {direccion}. 🥩🛵');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 text-slate-300 hover:text-white shrink-0 transition"
                  >
                    <span>🚚 Estado Pedido</span>
                  </button>
                </div>

                {isRecording ? (
                  <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 px-5 animate-pulse">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-sm font-bold text-rose-400">Grabando Nota de Voz: {formatTimer(recordingSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => stopRecording(true)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => stopRecording(false)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-xl hover:bg-emerald-400 transition"
                      >
                        <Send size={14} />
                        Enviar Audio
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendText} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Escribe un mensaje (o usa {nombre}, {pedido_id}, {total})..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-[#182229] border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />

                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-2.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] text-slate-400 hover:text-rose-400 border border-slate-700/80 transition"
                      title="Grabar nota de voz"
                    >
                      <Mic size={18} />
                    </button>

                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="p-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold transition"
                      title="Enviar mensaje"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Panel Lateral: Canasta y Modificación de Pedido en Vivo */}
            {isCartOpen && (
              <div className="w-80 sm:w-96 border-l border-slate-800 bg-[#111b21] flex flex-col h-full flex-shrink-0 animate-in slide-in-from-right duration-200">
                {/* Header Canasta */}
                <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-[#182229]">
                  <div className="flex items-center gap-2">
                    <ShoppingCart size={16} className="text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      {latestOrder ? `Pedido #${latestOrder.id}` : 'Canasta Activa'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Cerrar panel de canasta"
                  >
                    <X size={15} />
                  </button>
                </div>

                {orderCartSuccess && (
                  <div className="px-3.5 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>{orderCartSuccess}</span>
                  </div>
                )}

                {/* Contenido Canasta */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                  {/* Selector de Producto para Agregar */}
                  <div className="p-3 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-2">
                    <label className="block text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                      <Plus size={12} />
                      <span>Agregar Corte del Catálogo</span>
                    </label>
                    <div className="space-y-2">
                      <select
                        value={selectedProdToAdd}
                        onChange={(e) => setSelectedProdToAdd(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Seleccionar corte o combo...</option>
                        {catalogProducts.map(prod => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name} - ${Number(prod.price).toLocaleString()} /{prod.unit || 'kg'}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0.1"
                            placeholder="Cantidad (ej: 2)"
                            value={addQty}
                            onChange={(e) => setAddQty(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-[#111b21] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddItemToOrder(latestOrder)}
                          disabled={!selectedProdToAdd || isSavingOrder}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition flex items-center gap-1 shrink-0"
                        >
                          <Plus size={13} />
                          <span>Agregar</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Lista de Cortes en la Canasta */}
                  {(() => {
                    const normalizedCartItems = parseNormalizedCartItems(latestOrder, catalogProducts);
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-1">
                          <span>Cortes Seleccionados</span>
                          <span>{normalizedCartItems.length} ítems</span>
                        </div>

                        {normalizedCartItems.length === 0 ? (
                          <div className="p-6 text-center text-slate-500 text-xs bg-[#182229]/40 border border-dashed border-slate-800 rounded-2xl">
                            <ShoppingBag size={24} className="mx-auto mb-2 opacity-40 text-emerald-400" />
                            <p>No hay cortes en la canasta todavía.</p>
                            <p className="text-[10px] text-slate-500 mt-1">Podés seleccionar un corte arriba para iniciar el pedido.</p>
                          </div>
                        ) : (
                          normalizedCartItems.map((item, idx) => {
                            const name = item.name;
                            const qty = Number(item.quantity) || 1;
                            const unit = item.unit || 'kg';
                            const price = Number(item.price) || 0;
                            const subtotal = Number(item.subtotal) || (price * qty);

                            return (
                              <div
                                key={idx}
                                className="p-3 rounded-2xl bg-[#182229] border border-slate-700/60 space-y-2 hover:border-slate-600 transition"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-white truncate">{name}</h4>
                                    {price > 0 && (
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        ${price.toLocaleString('es-AR')} /{unit}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleRemoveItemFromOrder(latestOrder, idx)}
                                    className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                                    title="Quitar ítem"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                                  {/* Cantidad Control */}
                                  <div className="flex items-center gap-1.5 bg-[#111b21] px-2 py-0.5 rounded-xl border border-slate-700/60">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemQty(latestOrder, idx, Math.max(0.5, qty - (unit === 'kg' ? 0.5 : 1)))}
                                      className="text-slate-400 hover:text-white"
                                    >
                                      <Minus size={11} />
                                    </button>
                                    <span className="font-mono text-xs font-bold text-emerald-400 px-1">
                                      {qty} {unit}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemQty(latestOrder, idx, +(qty + (unit === 'kg' ? 0.5 : 1)).toFixed(1))}
                                      className="text-slate-400 hover:text-white"
                                    >
                                      <Plus size={11} />
                                    </button>
                                  </div>

                                  {/* Subtotal */}
                                  <span className="font-mono text-xs font-extrabold text-white">
                                    ${subtotal.toLocaleString('es-AR')}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}

                  {/* Resumen de Totales y Control de Estado */}
                  {latestOrder && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">Total a Cobrar:</span>
                        <span className="font-mono text-base font-extrabold text-emerald-400">
                          ${Number(latestOrder.totalAmount || 0).toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Estado del Pedido */}
                      <div className="flex items-center justify-between text-[11px] gap-2 pt-1 border-t border-emerald-500/20">
                        <span className="text-slate-300 font-semibold">Estado:</span>
                        <select
                          value={latestOrder.status}
                          onChange={(e) => handleUpdateOrderStatus(latestOrder, e.target.value)}
                          className="bg-[#111b21] border border-slate-700 text-[11px] font-bold text-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="pending">⏳ Pendiente</option>
                          <option value="preparing">🥩 En Preparación</option>
                          <option value="ready">✨ Listo / Preparado</option>
                          <option value="in_transit">🚚 En Camino</option>
                          <option value="delivered">✅ Entregado</option>
                          <option value="cancelled">❌ Cancelado</option>
                        </select>
                      </div>

                      {/* Control de Preparación en Carnicería */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-500/20">
                        <span className="text-slate-300 font-semibold flex items-center gap-1">
                          <Flame size={12} className={latestOrder.isPrepared || latestOrder.status === 'ready' || latestOrder.status === 'ready_for_pickup' ? 'text-emerald-400' : 'text-amber-400'} />
                          <span>Preparación:</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleOrderPrepared(latestOrder)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                            latestOrder.isPrepared || latestOrder.status === 'ready' || latestOrder.status === 'ready_for_pickup'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                          }`}
                        >
                          {latestOrder.isPrepared || latestOrder.status === 'ready' || latestOrder.status === 'ready_for_pickup' ? '🥩 Preparado' : '⏳ Sin Preparar'}
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-emerald-500/20">
                        <span>Estado de Pago:</span>
                        <span className={`font-bold uppercase ${latestOrder.paymentStatus === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {latestOrder.paymentStatus === 'approved' ? 'Aprobado ✅' : 'Pendiente ⏳'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones de Canasta */}
                {latestOrder && latestOrder.items?.length > 0 && (
                  <div className="p-3.5 border-t border-slate-800 bg-[#182229] space-y-2">
                    <button
                      type="button"
                      onClick={() => handleSendCartToWhatsApp(latestOrder)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-500/10 active:scale-95"
                    >
                      <Send size={13} />
                      <span>💬 Enviar Detalle al Chat (WhatsApp)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendPaymentLink(latestOrder)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold rounded-xl transition active:scale-95"
                    >
                      <CreditCard size={13} className="text-sky-400" />
                      <span>💳 Enviar Link de Mercado Pago</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-[#182229] border border-slate-800 flex items-center justify-center text-emerald-400">
            <Bot size={32} />
          </div>
          <h3 className="text-base font-bold text-white">Selecciona una conversación</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Elige un chat de la lista izquierda para ver los mensajes, reproducir notas de voz, editar el contacto o responder.
          </p>
        </div>
      )}

      {/* 3. Modal de Edición de Contacto */}
      {isEditContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Editar Datos del Contacto</h3>
                  <p className="text-xs text-slate-400">Modifica nombre, teléfono, dirección y notas del CRM</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditContactModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nombre y Apellido:</label>
                <input
                  type="text"
                  required
                  value={editContactData.name}
                  onChange={(e) => setEditContactData({ ...editContactData, name: e.target.value })}
                  placeholder="Ej: Juan González"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Teléfono Real / WhatsApp:</label>
                <input
                  type="text"
                  value={editContactData.phone}
                  onChange={(e) => setEditContactData({ ...editContactData, phone: e.target.value })}
                  placeholder="Ej: +54 9 351 626-2475"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Correo Electrónico (Email):</label>
                <input
                  type="email"
                  value={editContactData.email}
                  onChange={(e) => setEditContactData({ ...editContactData, email: e.target.value })}
                  placeholder="Ej: cliente@correo.com"
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Dirección de Entrega:</label>
                  <input
                    type="text"
                    value={editContactData.address}
                    onChange={(e) => setEditContactData({ ...editContactData, address: e.target.value })}
                    placeholder="Ej: Roque Funes 1704, Barrio Urca"
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Sucursal Preferida:</label>
                  <select
                    value={editContactData.preferredBranch}
                    onChange={(e) => setEditContactData({ ...editContactData, preferredBranch: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">🏢 Sin sucursal fija</option>
                    <option value="URCA CENTRAL">📍 URCA CENTRAL</option>
                    <option value="URCA 2 – ALTO TEJEDA">📍 URCA 2 – ALTO TEJEDA</option>
                    <option value="INTERCOUNTRY – CORTEZA MALL / ALTO TEJEDA">📍 INTERCOUNTRY – CORTEZA MALL</option>
                    <option value="DUARTE QUIRÓS">📍 DUARTE QUIRÓS</option>
                    <option value="VILLA ALLENDE – MERCADITO DE LA VILLA">📍 VILLA ALLENDE</option>
                    <option value="COUNTRY SAN ISIDRO – ALTO TEJEDA">📍 COUNTRY SAN ISIDRO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Etapa del Embudo:</label>
                  <select
                    value={editContactData.stage}
                    onChange={(e) => setEditContactData({ ...editContactData, stage: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="new_lead">Nuevo Lead</option>
                    <option value="qualified">Calificado</option>
                    <option value="negotiating">En Negociación</option>
                    <option value="proposal">Propuesta Enviada</option>
                    <option value="closed_won">🎉 Ganado (Venta)</option>
                    <option value="closed_lost">Perdido</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Monto Acumulado ($):</label>
                  <input
                    type="number"
                    value={editContactData.value}
                    onChange={(e) => setEditContactData({ ...editContactData, value: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Notas & Preferencias:</label>
                <textarea
                  rows={2}
                  value={editContactData.notes}
                  onChange={(e) => setEditContactData({ ...editContactData, notes: e.target.value })}
                  placeholder="Ej: Prefiere cortes parrilleros sin grasa..."
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditContactModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition disabled:opacity-50"
                >
                  <Save size={14} />
                  {isSavingContact ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal de Eliminación / Vaciado de Chat */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Gestionar Conversación</h3>
                <p className="text-xs text-slate-400">¿Qué acción deseas realizar con este chat?</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Estás gestionando el chat de <strong className="text-white">{selectedLead?.name || selectedLead?.pushName}</strong> ({selectedLead?.phone || selectedLead?.jid?.split('@')[0]}).
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleClearMessages}
                disabled={isDeleting}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#111b21] hover:bg-slate-800 border border-slate-700 text-left transition"
              >
                <div>
                  <div className="text-xs font-bold text-white">🗑️ Vaciar Historial de Mensajes</div>
                  <div className="text-[10px] text-slate-400">Borra todos los mensajes del chat pero conserva el contacto en el CRM.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDeleteContact}
                disabled={isDeleting}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-left transition"
              >
                <div>
                  <div className="text-xs font-bold text-rose-400">❌ Eliminar Contacto por Completo</div>
                  <div className="text-[10px] text-slate-400">Elimina el lead y todos sus mensajes asociados permanentemente.</div>
                </div>
              </button>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal de Creación / Edición de Plantilla de Respuesta Rápida */}
      {isEditQuickReplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingQuickReply ? 'Editar Respuesta Rápida' : 'Nueva Plantilla de Respuesta'}
                  </h3>
                  <p className="text-xs text-slate-400">Personaliza mensajes prearmados para el operador</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditQuickReplyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickReply} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Título del Botón / Atajo:</label>
                <input
                  type="text"
                  required
                  value={quickReplyFormData.title}
                  onChange={(e) => setQuickReplyFormData({ ...quickReplyFormData, title: e.target.value })}
                  placeholder="Ej: 🏪 Info Sucursales / 💳 Datos de Transferencia"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Categoría:</label>
                <select
                  value={quickReplyFormData.category}
                  onChange={(e) => setQuickReplyFormData({ ...quickReplyFormData, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="sucursales">🏪 Sucursales y Direcciones</option>
                  <option value="horarios">⏰ Horarios de Atención</option>
                  <option value="pagos">💳 Medios de Pago / Alias</option>
                  <option value="productos">🥩 Catálogo & Promociones</option>
                  <option value="pedidos">🚚 Pedidos & Despachos</option>
                  <option value="general">⚡ Mensaje General / Plantilla</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold">Contenido del Mensaje:</label>
                  <span className="text-[10px] text-amber-400">Soporta negrita *texto* y emojis</span>
                </div>
                <textarea
                  rows={6}
                  required
                  value={quickReplyFormData.content}
                  onChange={(e) => setQuickReplyFormData({ ...quickReplyFormData, content: e.target.value })}
                  placeholder="Escribe el texto predeterminado..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                />
              </div>

              {/* Variables dinámicas disponibles */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <span className="text-[11px] font-bold text-amber-400">💡 Variables dinámicas que podés incluir:</span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {[
                    { tag: '{nombre}', desc: 'Nombre del cliente' },
                    { tag: '{pedido_id}', desc: 'ID del pedido activo' },
                    { tag: '{total}', desc: 'Total del pedido' },
                    { tag: '{direccion}', desc: 'Dirección del cliente' },
                    { tag: '{sucursal}', desc: 'Sucursal asignada' },
                    { tag: '{telefono}', desc: 'Teléfono WhatsApp' }
                  ].map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => setQuickReplyFormData(prev => ({ ...prev, content: `${prev.content} ${v.tag}` }))}
                      className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono"
                      title={v.desc}
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditQuickReplyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition text-xs"
                >
                  <Save size={14} />
                  Guardar Plantilla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
