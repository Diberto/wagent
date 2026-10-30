import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { MessageSquare, Calculator, PackageCheck, Bike, Menu, Bell, QrCode, Settings, Camera } from 'lucide-react';
import SidebarNav from './components/SidebarNav';
import AdminHubView from './components/AdminHubView';
import ChatInbox from './components/ChatInbox';
import KanbanPipeline from './components/KanbanPipeline';
import CallCenter from './components/CallCenter';
import KnowledgeBase from './components/KnowledgeBase';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ProductCatalog from './components/ProductCatalog';
import OrdersView from './components/OrdersView';
import CustomersView from './components/CustomersView';
import BranchesView from './components/BranchesView';
import DriversView from './components/DriversView';
import UsersView from './components/UsersView';
import AgentsView from './components/AgentsView';
import POSView from './components/POSView';
import WooCommerceView from './components/WooCommerceView';
import AutomationRulesView from './components/AutomationRulesView';
import BroadcastCampaignsView from './components/BroadcastCampaignsView';
import NeuralMemoryView from './components/NeuralMemoryView';
import QRModal from './components/QRModal';
import SettingsModal from './components/SettingsModal';
import CallModal from './components/CallModal';
import StorefrontView from './components/StorefrontView';
import MediaGalleryModal from './components/MediaGalleryModal';
import RecipesView from './components/RecipesView';
import SystemHealthView from './components/SystemHealthView';
import MultiAgentChatView from './components/MultiAgentChatView';
import CouponsView from './components/CouponsView';
import LoyaltyView from './components/LoyaltyView';
import CustomerLoyaltyPortalView from './components/CustomerLoyaltyPortalView';
import DatabaseView from './components/DatabaseView';
import LogsView from './components/LogsView';
import CustomerPortalModal from './components/CustomerPortalModal';
import LoginView from './components/LoginView';
import StockTransfersView from './components/StockTransfersView';
import SilentGroupOcrView from './components/SilentGroupOcrView';
import ApiMcpHubView from './components/ApiMcpHubView';
import MeatMarketIntelligenceView from './components/MeatMarketIntelligenceView';
import { NAVIGATION_HUBS, findHubForTab } from './components/navigationConfig';
import { playNotificationChime, playOrderChime, playMessagePing } from './utils/soundEffects';

const socket = io({
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

export default function App() {
  const [currentTab, setCurrentTab] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/micuenta') || window.location.pathname.startsWith('/club')) {
        return 'micuenta';
      }
      if (window.location.pathname.startsWith('/tienda')) {
        return 'storefront';
      }
      if (window.location.pathname.startsWith('/pos')) {
        return 'pos';
      }
    }
    return 'inbox';
  });
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [targetOrderId, setTargetOrderId] = useState(null);
  const [calls, setCalls] = useState([]);
  const [globalAiEnabled, setGlobalAiEnabled] = useState(true);

  // Notification Center & Toast State
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('wagent_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [toasts, setToasts] = useState([]);

  // Users & RBAC Session State
  const [allUsers, setAllUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wagent_user');
        if (saved) return JSON.parse(saved);
      } catch {}
      // Si el visitante entra directo a la tienda pública /tienda o al club de fidelización /micuenta, permitir acceso de cliente
      if (window.location.pathname.startsWith('/tienda')) {
        return {
          id: 'usr-cliente-publico',
          name: 'Cliente Online',
          username: 'cliente',
          role: 'cliente',
          roles: ['cliente'],
          tabs: ['storefront', 'micuenta'],
          permissions: { canViewStore: true, canOrderWhatsApp: true }
        };
      }
      if (window.location.pathname.startsWith('/micuenta') || window.location.pathname.startsWith('/club')) {
        return {
          id: 'usr-cliente-club',
          name: 'Cliente Fidelización',
          username: 'cliente_club',
          role: 'cliente',
          roles: ['cliente'],
          tabs: ['micuenta', 'storefront'],
          permissions: { canViewStore: true, canViewLoyalty: true }
        };
      }
    }
    return null;
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDockVisible, setIsDockVisible] = useState(() => {
    return localStorage.getItem('wagent_suite_dock_collapsed') !== 'true';
  });
  
  // WhatsApp Baileys State
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [whatsappUser, setWhatsappUser] = useState(null);
  
  // Modals
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callTargetLead, setCallTargetLead] = useState(null);

  // Cargar datos iniciales
  const loadLeads = () => {
    fetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        setLeads(data);
        if (!selectedLead && data.length > 0) {
          setSelectedLead(data[0]);
        }
      })
      .catch(err => console.error('Error cargando leads:', err));
  };

  const loadCalls = () => {
    fetch('/api/calls')
      .then(res => res.json())
      .then(data => setCalls(data))
      .catch(err => console.error('Error cargando llamadas:', err));
  };

  const loadWhatsAppStatus = () => {
    fetch('/api/whatsapp/status')
      .then(res => res.json())
      .then(data => {
        setWhatsappStatus(data.status);
        setQrDataUrl(data.qrDataUrl);
        setWhatsappUser(data.user);
      })
      .catch(err => console.error('Error cargando estado de WhatsApp:', err));
  };

  const loadSettings = () => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const s = data?.settings || data;
        if (s && typeof s.autoReplyEnabled === 'boolean') {
          setGlobalAiEnabled(s.autoReplyEnabled);
        }
      })
      .catch(err => console.error('Error cargando settings:', err));
  };

  const loadUsers = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(usersList => {
        if (Array.isArray(usersList)) {
          setAllUsers(usersList);
          const savedUserJson = localStorage.getItem('wagent_user');
          if (savedUserJson) {
            try {
              const savedUser = JSON.parse(savedUserJson);
              const found = usersList.find(u => u.id === savedUser.id || u.username?.toLowerCase() === savedUser.username?.toLowerCase());
              if (found) {
                setCurrentUser(found);
              } else if (savedUser.role === 'cliente') {
                setCurrentUser(savedUser);
              }
            } catch (e) {}
          }
        }
      })
      .catch(err => console.error('Error cargando usuarios:', err));
  };

  // RBAC Route Guard: Forzar reglas estrictas por rol
  useEffect(() => {
    if (currentUser) {
      // El rol cliente única y exclusivamente puede ver la tienda online y hacer pedidos
      if (currentUser.role === 'cliente') {
        if (currentTab !== 'storefront') {
          setCurrentTab('storefront');
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/tienda');
          }
        }
      } else if (currentUser.role !== 'admin' && Array.isArray(currentUser.tabs) && currentUser.tabs.length > 0) {
        // Operadores con pestañas personalizadas: Si intentan entrar a pestaña no permitida, redirigir
        if (!currentUser.tabs.includes(currentTab)) {
          setCurrentTab(currentUser.tabs[0]);
        }
      }
    }
  }, [currentUser, currentTab]);

  const handleLogout = () => {
    localStorage.removeItem('wagent_user');
    localStorage.removeItem('wagent_session');
    setCurrentUser(null);
    setCurrentTab('inbox');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  };

  const handleToggleGlobalAi = async () => {
    try {
      const nextState = !globalAiEnabled;
      setGlobalAiEnabled(nextState);
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoReplyEnabled: nextState })
      });
    } catch (err) {
      console.error('Error alternando estado global de IA:', err);
    }
  };

  const addNotification = (notif) => {
    const item = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false,
      ...notif
    };
    setNotifications(prev => {
      const updated = [item, ...prev].slice(0, 50);
      try { localStorage.setItem('wagent_notifications', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    // Toast flotante temporal (5 segundos)
    setToasts(prev => [...prev, item]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== item.id));
    }, 5000);

    // Notificación nativa del navegador si está habilitada
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(item.title || 'WAgent Notificación', {
          body: item.message,
          icon: '/favicon.ico'
        });
      } catch (e) {}
    }
  };

  const currentUserRef = useRef(currentUser);
  const selectedLeadRef = useRef(selectedLead);
  const lastWaStatusLogRef = useRef('');

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedLeadRef.current = selectedLead;
  }, [selectedLead]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    loadLeads();
    loadCalls();
    loadWhatsAppStatus();
    loadSettings();
    loadUsers();

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const onConnect = () => {
      console.log('Conectado a Socket.IO');
      loadWhatsAppStatus();
    };

    const onSettingsUpdate = (newSettings) => {
      if (newSettings && typeof newSettings.autoReplyEnabled === 'boolean') {
        setGlobalAiEnabled(newSettings.autoReplyEnabled);
      }
    };

    const onUserNew = (newUser) => {
      setAllUsers(prev => [newUser, ...prev.filter(u => u.id !== newUser.id)]);
    };

    const onUserUpdate = (updated) => {
      setAllUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      const activeUser = currentUserRef.current;
      if (activeUser && activeUser.id === updated.id) {
        setCurrentUser(updated);
        localStorage.setItem('wagent_user', JSON.stringify(updated));
      }
    };

    const onUserDelete = (deletedId) => {
      setAllUsers(prev => prev.filter(u => u.id !== deletedId));
    };

    const onWhatsAppStatus = (data) => {
      if (!data) return;
      const activeUserId = currentUserRef.current?.id;
      if (!data.sessionId || data.sessionId === 'default' || data.sessionId === activeUserId) {
        const logSig = `${data.sessionId || 'default'}:${data.status}`;
        if (lastWaStatusLogRef.current !== logSig) {
          lastWaStatusLogRef.current = logSig;
          console.log('WhatsApp status:', data.status);
        }
        setWhatsappStatus(data.status);
        setQrDataUrl(data.qrDataUrl);
        setWhatsappUser(data.user);
      }
    };

    const onWhatsAppSessions = (sessions) => {
      if (sessions && typeof sessions === 'object') {
        const activeUserId = currentUserRef.current?.id;
        const userSession = activeUserId ? sessions[activeUserId] : null;
        const defaultSession = sessions['default'];
        const anyConnected = Object.values(sessions).find(s => s && s.status === 'connected');
        const active = (userSession && userSession.status === 'connected')
          ? userSession
          : ((defaultSession && defaultSession.status === 'connected') ? defaultSession : anyConnected);

        if (active) {
          setWhatsappStatus(active.status);
          setWhatsappUser(active.user);
        }
      }
    };

    const onWhatsAppQr = (data) => {
      if (!data) return;
      const activeUserId = currentUserRef.current?.id;
      if (!data.sessionId || data.sessionId === 'default' || data.sessionId === activeUserId) {
        setQrDataUrl(data.qrDataUrl);
        setWhatsappStatus('qr_ready');
      }
    };

    const onChatMessage = ({ message, lead }) => {
      loadLeads();
      const activeLead = selectedLeadRef.current;
      if (lead && activeLead?.jid === lead.jid) {
        setSelectedLead(lead);
      }
      const isOutgoing = message?.sender === 'agent' || message?.fromMe;
      if (message && !isOutgoing) {
        playMessagePing();
        const textPreview = message.content || message.body;
        addNotification({
          title: `Mensaje de ${lead?.name || message.pushName || 'WhatsApp'}`,
          message: textPreview ? textPreview.slice(0, 70) : (message.type === 'audio' ? '🎵 Nota de voz' : '📎 Archivo recibido'),
          type: 'message',
          tab: 'inbox',
          jid: lead?.jid || message.remoteJid || message.chatId
        });
      }
    };

    const onOrderNew = (order) => {
      playOrderChime();
      const totalNum = Number(order?.totalAmount || order?.total || 0);
      addNotification({
        title: `Nuevo Pedido #${order?.orderNumber || order?.id?.slice(-5) || ''}`,
        message: `${order?.customerName || 'Cliente'} - $${totalNum.toLocaleString('es-AR')} (${order?.paymentMethod || 'Efectivo'})`,
        type: 'order',
        tab: 'orders',
        data: order
      });
    };

    const onOrderUpdate = (order) => {
      playNotificationChime();
      const statusLabels = {
        pending: 'Pendiente',
        preparing: 'En Preparación',
        ready: 'Listo para Entrega',
        ready_for_pickup: 'Listo para Retiro',
        in_transit: 'En Camino',
        delivered: 'Entregado',
        completed: 'Completado',
        cancelled: 'Cancelado'
      };
      const readableStatus = statusLabels[order?.status] || order?.status || 'Actualizado';
      addNotification({
        title: `Pedido #${order?.orderNumber || order?.id?.slice(-5) || ''} Actualizado`,
        message: `Estado: ${readableStatus} - ${order?.customerName || ''}`,
        type: 'order',
        tab: 'orders',
        data: order
      });
    };

    const onPosShiftOpened = (shift) => {
      playNotificationChime();
      addNotification({
        title: 'Caja POS Abierta',
        message: `Turno iniciado por ${shift?.openedByName || 'Operador'} con $${shift?.initialCash || 0}`,
        type: 'pos',
        tab: 'pos'
      });
    };

    const onPosShiftClosed = (shift) => {
      playNotificationChime();
      addNotification({
        title: 'Caja POS Cerrada',
        message: `Turno cerrado por ${shift?.closedByName || 'Operador'}. Ventas: $${shift?.totalSales || 0}`,
        type: 'pos',
        tab: 'pos'
      });
    };

    const onWhatsAppCall = ({ call }) => {
      console.log('Evento de llamada en Socket:', call);
      loadCalls();
      loadLeads();
      
      // Si la llamada está sonando, abrir modal de llamada entrante
      if (call.status === 'ringing' || call.status === 'offer') {
        setIncomingCall(call);
        setIsCallModalOpen(true);
      }
    };

    const onLeadUpdate = (updatedLead) => {
      setLeads(prev => prev.map(l => (l.jid === updatedLead.jid || l.id === updatedLead.id ? updatedLead : l)));
      const activeLead = selectedLeadRef.current;
      if (activeLead?.jid === updatedLead.jid || activeLead?.id === updatedLead.id) {
        setSelectedLead(updatedLead);
      }
    };

    const onLeadDelete = ({ id }) => {
      setLeads(prev => prev.filter(l => l.id !== id && l.jid !== id));
    };

    socket.on('connect', onConnect);
    socket.on('settings:update', onSettingsUpdate);
    socket.on('user:new', onUserNew);
    socket.on('user:update', onUserUpdate);
    socket.on('user:delete', onUserDelete);
    socket.on('whatsapp:status', onWhatsAppStatus);
    socket.on('whatsapp:sessions', onWhatsAppSessions);
    socket.on('whatsapp:qr', onWhatsAppQr);
    socket.on('chat:message', onChatMessage);
    socket.on('order:new', onOrderNew);
    socket.on('order:update', onOrderUpdate);
    socket.on('pos:shift:opened', onPosShiftOpened);
    socket.on('pos:shift:closed', onPosShiftClosed);
    socket.on('whatsapp:call', onWhatsAppCall);
    socket.on('lead:update', onLeadUpdate);
    socket.on('lead:delete', onLeadDelete);

    return () => {
      socket.off('connect', onConnect);
      socket.off('settings:update', onSettingsUpdate);
      socket.off('user:new', onUserNew);
      socket.off('user:update', onUserUpdate);
      socket.off('user:delete', onUserDelete);
      socket.off('whatsapp:status', onWhatsAppStatus);
      socket.off('whatsapp:sessions', onWhatsAppSessions);
      socket.off('whatsapp:qr', onWhatsAppQr);
      socket.off('chat:message', onChatMessage);
      socket.off('order:new', onOrderNew);
      socket.off('order:update', onOrderUpdate);
      socket.off('pos:shift:opened', onPosShiftOpened);
      socket.off('pos:shift:closed', onPosShiftClosed);
      socket.off('whatsapp:call', onWhatsAppCall);
      socket.off('lead:update', onLeadUpdate);
      socket.off('lead:delete', onLeadDelete);
    };
  }, []);

  // Acciones de WhatsApp
  const handleConnectWhatsApp = async () => {
    try {
      setWhatsappStatus('connecting');
      setIsQRModalOpen(true);
      await fetch('/api/whatsapp/connect', { method: 'POST' });
    } catch (err) {
      console.error('Error conectando WhatsApp:', err);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      setWhatsappStatus('disconnected');
      setQrDataUrl(null);
      setWhatsappUser(null);
    } catch (err) {
      console.error('Error desconectando WhatsApp:', err);
    }
  };

  // Acciones de Leads
  const handleUpdateLeadStage = async (jid, stage) => {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(jid)}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage })
      });
      const updated = await res.json();
      setLeads(prev => prev.map(l => l.jid === jid ? updated : l));
      if (selectedLead?.jid === jid) setSelectedLead(updated);
    } catch (err) {
      console.error('Error actualizando etapa:', err);
    }
  };

  const handleToggleLeadAi = async (jid, aiEnabled) => {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(jid)}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled })
      });
      const updated = await res.json();
      setLeads(prev => prev.map(l => l.jid === jid ? updated : l));
      if (selectedLead?.jid === jid) setSelectedLead(updated);
    } catch (err) {
      console.error('Error toggling AI:', err);
    }
  };

  const handleCreateLead = async (leadData) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const created = await res.json();
      setLeads(prev => [created, ...prev]);
      setSelectedLead(created);
    } catch (err) {
      console.error('Error creando lead:', err);
    }
  };

  const handleDeleteLead = async (id) => {
    try {
      await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      setLeads(prev => prev.filter(l => l.id !== id && l.jid !== id));
      if (selectedLead?.id === id || selectedLead?.jid === id) {
        setSelectedLead(leads[0] || null);
      }
    } catch (err) {
      console.error('Error eliminando lead:', err);
    }
  };

  // Enviar Mensajes
  const handleSendMessage = async (jid, text) => {
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          sendViaWhatsApp: true,
          userId: currentUser?.id || 'usr-central-admin'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false || data.error) {
        const errorMsg = data.error || data.warning || 'No se pudo entregar por WhatsApp';
        console.warn('Advertencia entrega WhatsApp:', errorMsg);
        addNotification({
          title: '⚠️ WhatsApp: Fallo de Envío',
          message: errorMsg,
          icon: '⚠️'
        });
      } else if (data.warning) {
        addNotification({
          title: 'ℹ️ Aviso de Mensaje',
          message: data.warning,
          icon: 'ℹ️'
        });
      }
      return data;
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      addNotification({
        title: '❌ Error al Enviar',
        message: err.message,
        icon: '❌'
      });
      throw err;
    }
  };

  const handleSendAudio = async (jid, formData) => {
    try {
      if (currentUser?.id && !formData.has('userId')) {
        formData.append('userId', currentUser.id);
      }
      const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/send-audio`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false || data.error) {
        addNotification({
          title: '⚠️ Nota de Voz: Fallo de Envío',
          message: data.error || data.warning || 'Error enviando nota de voz a WhatsApp',
          icon: '🎤'
        });
      }
      return data;
    } catch (err) {
      console.error('Error enviando nota de voz:', err);
      addNotification({
        title: '❌ Error Nota de Voz',
        message: err.message,
        icon: '❌'
      });
    }
  };

  // Acciones de Llamadas
  const handleOpenCallModal = (lead = null) => {
    setCallTargetLead(lead);
    setIncomingCall(null);
    setIsCallModalOpen(true);
  };

  const handleMakeOutboundCall = async (callData) => {
    const res = await fetch('/api/calls/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callData)
    });
    const data = await res.json();
    loadCalls();
    loadLeads();
    return data;
  };

  const handleAnswerCallAi = async (call) => {
    try {
      await fetch('/api/calls/answer-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call?.id, jid: call?.chatId })
      });
      setIncomingCall(null);
      loadCalls();
    } catch (err) {
      console.error('Error respondiendo llamada con IA:', err);
    }
  };

  const handleRejectCall = async (call) => {
    setIncomingCall(null);
  };

  const totalUnreadCount = leads.reduce((sum, l) => sum + (l.unreadCount || 0), 0);
  const isPosStandalone = typeof window !== 'undefined' && window.location.pathname.startsWith('/pos');
  const activeHub = findHubForTab(currentTab);

  // Si no hay usuario autenticado en la sesión y no es una ruta pública de clientes (/micuenta, /tienda), mostrar pantalla de login
  if (!currentUser && currentTab !== 'micuenta' && currentTab !== 'storefront') {
    return (
      <LoginView
        onLoginSuccess={(user, token) => {
          setCurrentUser(user);
          if (user.role === 'cliente') {
            setCurrentTab('storefront');
            if (typeof window !== 'undefined') window.history.pushState({}, '', '/tienda');
          } else if (user.role !== 'admin' && Array.isArray(user.tabs) && user.tabs.length > 0) {
            if (!user.tabs.includes(currentTab)) {
              setCurrentTab(user.tabs[0]);
            }
          }
        }}
        onGuestClientAccess={(clientUser) => {
          setCurrentUser(clientUser);
          setCurrentTab('storefront');
          if (typeof window !== 'undefined') window.history.pushState({}, '', '/tienda');
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      
      {/* Sidebar Navigation Lateral (Visible en todas las vistas de operador/admin excepto tienda pública, POS autónomo y portal del cliente) */}
      {currentTab !== 'storefront' && currentTab !== 'micuenta' && !isPosStandalone && (
        <SidebarNav
          currentTab={currentTab}
          setCurrentTab={(tab) => {
            if (tab === 'storefront') {
              window.history.pushState({}, '', '/tienda');
            } else if (tab === 'micuenta') {
              window.history.pushState({}, '', '/micuenta');
            } else if (tab === 'pos-standalone') {
              window.history.pushState({}, '', '/pos');
              setCurrentTab('pos');
              return;
            } else if (window.location.pathname.startsWith('/tienda') || window.location.pathname.startsWith('/pos') || window.location.pathname.startsWith('/micuenta')) {
              window.history.pushState({}, '', '/');
            }
            setCurrentTab(tab);
          }}
          whatsappStatus={whatsappStatus}
          onOpenQR={() => setIsQRModalOpen(true)}
          globalAiEnabled={globalAiEnabled}
          onToggleGlobalAi={handleToggleGlobalAi}
          unreadCount={totalUnreadCount}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          setIsMobileDrawerOpen={setIsMobileDrawerOpen}
          notifications={notifications}
        />
      )}

      {/* Main Content Area con Header Móvil */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* Header Superior Móvil (Solo visible en pantallas < md en panel admin) */}
        {currentTab !== 'storefront' && currentTab !== 'micuenta' && !isPosStandalone && (
          <header className="md:hidden h-14 bg-[#111b21] border-b border-[#202c33] flex items-center justify-between px-3 shrink-0 z-20">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsMobileDrawerOpen(true)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#202c33]"
              >
                <Menu size={20} />
              </button>
              <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <span>🥩</span> República Carne
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsQRModalOpen(true)}
                className={`p-1.5 rounded-lg border ${
                  whatsappStatus === 'connected' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                }`}
                title="Estado de WhatsApp"
              >
                <QrCode size={16} />
              </button>
              
              <button
                onClick={() => setCurrentTab('admin')}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#202c33]"
                title="Centro de Control & Configuración"
              >
                <Settings size={18} />
              </button>
            </div>
          </header>
        )}

        {/* Submenu Pill Bar contextual del Hub Activo (Visible en todas las vistas de operador excepto storefront y micuenta) */}
        {currentTab !== 'storefront' && currentTab !== 'micuenta' && !isPosStandalone && activeHub?.subTabs?.length > 1 && (
          <div className="bg-[#111b21] border-b border-[#202c33] px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar shrink-0 z-10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0 hidden sm:inline">
                {activeHub.shortTitle || activeHub.title}:
              </span>
              <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                {activeHub.subTabs.map(tab => {
                  const TabIcon = tab.icon;
                  const isActive = currentTab === tab.id;
                  const badgeValue = tab.id === 'inbox' && totalUnreadCount > 0 ? totalUnreadCount : tab.badge;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === 'storefront') {
                          window.history.pushState({}, '', '/tienda');
                        } else if (tab.id === 'micuenta') {
                          window.history.pushState({}, '', '/micuenta');
                        }
                        setCurrentTab(tab.id);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                        isActive
                          ? tab.highlight 
                            ? 'bg-gradient-to-r from-red-600/30 to-amber-600/20 text-red-200 border border-red-500/40 shadow-sm'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-[#202c33] border border-transparent'
                      }`}
                    >
                      <TabIcon size={13} className={isActive ? (tab.highlight ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500'} />
                      <span>{tab.shortLabel || tab.label}</span>
                      {badgeValue && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          typeof badgeValue === 'number'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {badgeValue}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main View Area */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {currentTab === 'micuenta' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <CustomerLoyaltyPortalView />
          </div>
        )}

        {currentTab === 'storefront' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <StorefrontView 
              currentUser={currentUser}
              onLogout={handleLogout}
              onBackToAdmin={currentUser?.role === 'admin' ? () => {
                setCurrentTab('inbox');
                window.history.pushState({}, '', '/');
              } : null} 
            />
          </div>
        )}

        {currentTab === 'inbox' && (
          <ChatInbox
            socket={socket}
            leads={leads}
            selectedLead={selectedLead}
            setSelectedLead={setSelectedLead}
            onUpdateLeadStage={handleUpdateLeadStage}
            onToggleLeadAi={handleToggleLeadAi}
            onSendMessage={handleSendMessage}
            onSendAudio={handleSendAudio}
            onCallLead={(lead) => handleOpenCallModal(lead)}
            onDeleteLead={handleDeleteLead}
            onClearChat={() => loadLeads()}
            onNavigateToOrders={(orderId) => {
              setTargetOrderId(orderId);
              setCurrentTab('orders');
            }}
          />
        )}

        {currentTab === 'pos' && (
          <POSView 
            socket={socket}
            currentUser={currentUser}
            allUsers={allUsers}
            onSwitchUser={(user) => {
              setCurrentUser(user);
              localStorage.setItem('wagent_user', JSON.stringify(user));
            }}
            isStandalone={isPosStandalone}
            onExitStandalone={() => {
              window.history.pushState({}, '', '/');
              setCurrentTab('inbox');
            }}
          />
        )}

        {currentTab === 'silent-group' && (
          <SilentGroupOcrView 
            socket={socket} 
            user={currentUser} 
          />
        )}

        {currentTab === 'stock-transfers' && (
          <StockTransfersView 
            socket={socket} 
            currentUser={currentUser} 
            initialTab="stock" 
          />
        )}

        {currentTab === 'orders' && (
          <OrdersView 
            socket={socket} 
            targetOrderId={targetOrderId} 
            onClearTargetOrder={() => setTargetOrderId(null)}
          />
        )}

        {currentTab === 'automations' && (
          <AutomationRulesView socket={socket} />
        )}

        {currentTab === 'woo' && (
          <WooCommerceView socket={socket} />
        )}

        {currentTab === 'drivers' && (
          <DriversView socket={socket} />
        )}

        {currentTab === 'customers' && (
          <CustomersView 
            socket={socket} 
            onSelectLeadForChat={(lead) => {
              setSelectedLead(lead);
              setCurrentTab('inbox');
            }} 
          />
        )}

        {currentTab === 'branches' && (
          <BranchesView socket={socket} />
        )}

        {currentTab === 'catalog' && (
          <ProductCatalog socket={socket} />
        )}

        {currentTab === 'coupons' && (
          <CouponsView />
        )}

        {currentTab === 'loyalty' && (
          <LoyaltyView socket={socket} />
        )}

        {currentTab === 'kanban' && (
          <KanbanPipeline
            leads={leads}
            onUpdateLeadStage={handleUpdateLeadStage}
            onToggleLeadAi={handleToggleLeadAi}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setCurrentTab('inbox');
            }}
            onCreateLead={handleCreateLead}
            onDeleteLead={handleDeleteLead}
          />
        )}

        {currentTab === 'callcenter' && (
          <CallCenter
            calls={calls}
            onOpenCallModal={() => handleOpenCallModal(null)}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setCurrentTab('inbox');
            }}
            leads={leads}
          />
        )}

        {currentTab === 'agents' && (
          <AgentsView socket={socket} currentUser={currentUser} />
        )}

        {currentTab === 'neural-memory' && (
          <NeuralMemoryView socket={socket} />
        )}

        {currentTab === 'campaigns' && (
          <BroadcastCampaignsView socket={socket} />
        )}

        {currentTab === 'recipes' && (
          <RecipesView socket={socket} />
        )}

        {currentTab === 'system-health' && (
          <SystemHealthView socket={socket} />
        )}

        {currentTab === 'multi-agent' && (
          <MultiAgentChatView socket={socket} />
        )}

        {currentTab === 'knowledge' && (
          <KnowledgeBase />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsDashboard socket={socket} />
        )}

        {currentTab === 'users' && (
          <UsersView
            socket={socket}
            currentUser={currentUser}
            onSwitchUser={(user) => {
              setCurrentUser(user);
              localStorage.setItem('wagent_user', JSON.stringify(user));
            }}
          />
        )}

        {currentTab === 'database' && (
          <DatabaseView socket={socket} />
        )}

        {currentTab === 'system-logs' && (
          <LogsView socket={socket} />
        )}

        {(currentTab === 'admin' || currentTab === 'arca') && (
          <AdminHubView
            socket={socket}
            currentUser={currentUser}
            onSwitchUser={(user) => {
              setCurrentUser(user);
              localStorage.setItem('wagent_user', JSON.stringify(user));
            }}
            whatsappStatus={whatsappStatus}
            onOpenQR={() => setIsQRModalOpen(true)}
            initialSection={currentTab === 'arca' ? 'arca' : 'general'}
          />
        )}

        {currentTab === 'api-mcp' && (
          <ApiMcpHubView
            currentUser={currentUser}
          />
        )}

        {currentTab === 'meat-market' && (
          <MeatMarketIntelligenceView
            socket={socket}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Visible on mobile/tablet screens < lg solo en panel Admin) */}
      {currentTab !== 'storefront' && currentTab !== 'micuenta' && !isPosStandalone && (
        <div className="lg:hidden h-14 bg-[#111b21]/95 border-t border-slate-800 flex items-center justify-around px-2 z-30 sticky bottom-0 backdrop-blur-md pb-safe">
          <button
            onClick={() => setCurrentTab('inbox')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'inbox' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <div className="relative">
              <MessageSquare size={18} />
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[12px] h-[12px] px-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Atención</span>
          </button>

          <button
            onClick={() => setCurrentTab('orders')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'orders' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PackageCheck size={18} />
            <span className="text-[10px]">Pedidos</span>
          </button>

          <button
            onClick={() => setCurrentTab('pos')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'pos' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calculator size={18} />
            <span className="text-[10px]">POS</span>
          </button>

          <button
            onClick={() => setCurrentTab('silent-group')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'silent-group' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera size={18} />
            <span className="text-[10px]">OCR Grupos</span>
          </button>

          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-400 hover:text-white transition"
          >
            <Menu size={18} />
            <span className="text-[10px]">Menú</span>
          </button>
        </div>
      )}

      </div>

      {/* QR Code Modal (Multi-Operator WhatsApp) */}
      <QRModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        status={whatsappStatus}
        qrDataUrl={qrDataUrl}
        user={whatsappUser}
        onConnect={handleConnectWhatsApp}
        onDisconnect={handleDisconnectWhatsApp}
        currentUser={currentUser}
        allUsers={allUsers}
        socket={socket}
        onOpenSettings={() => {
          setIsQRModalOpen(false);
          setIsSettingsModalOpen(true);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* Call Center & Outbound/Inbound Call Modal */}
      <CallModal
        isOpen={isCallModalOpen}
        onClose={() => {
          setIsCallModalOpen(false);
          setIncomingCall(null);
          setCallTargetLead(null);
        }}
        incomingCall={incomingCall}
        activeLead={callTargetLead}
        leads={leads}
        onAnswerCallAi={handleAnswerCallAi}
        onRejectCall={handleRejectCall}
        onMakeOutboundCall={handleMakeOutboundCall}
      />

      {/* Media Gallery & Product Images Modal */}
      <MediaGalleryModal
        isOpen={isMediaGalleryOpen}
        onClose={() => setIsMediaGalleryOpen(false)}
      />

      {/* Floating Toast Notification Alerts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => {
              if (toast.tab) setCurrentTab(toast.tab);
              if (toast.jid && leads.length > 0) {
                const targetLead = leads.find(l => l.jid === toast.jid);
                if (targetLead) setSelectedLead(targetLead);
              }
              setToasts(prev => prev.filter(t => t.id !== toast.id));
            }}
            className="pointer-events-auto bg-[#1e293b]/95 backdrop-blur-md border border-emerald-500/40 text-white p-3.5 rounded-2xl shadow-2xl flex items-start gap-3 transform transition-all duration-300 animate-slide-up hover:scale-102 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <PackageCheck size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-400 truncate">{toast.title}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{toast.time}</span>
              </div>
              <p className="text-xs text-slate-200 line-clamp-2 mt-0.5">{toast.message}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToasts(prev => prev.filter(t => t.id !== toast.id));
              }}
              className="text-slate-400 hover:text-white shrink-0 p-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>



      {/* Universal Customer & User Portal Modal */}
      <CustomerPortalModal
        isOpen={isCustomerPortalOpen}
        onClose={() => setIsCustomerPortalOpen(false)}
        currentUser={currentUser}
        onUserUpdated={(updatedUser) => {
          if (updatedUser) {
            setCurrentUser(updatedUser);
            localStorage.setItem('wagent_user', JSON.stringify(updatedUser));
            loadUsers();
          }
        }}
      />

    </div>
  );
}
