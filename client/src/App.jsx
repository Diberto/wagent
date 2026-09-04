import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { MessageSquare, Calculator, PackageCheck, Bike, Menu } from 'lucide-react';
import Navbar from './components/Navbar';
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
import DatabaseView from './components/DatabaseView';
import LogsView from './components/LogsView';
import { playNotificationChime, playOrderChime, playMessagePing } from './utils/soundEffects';

const socket = io();

export default function App() {
  const [currentTab, setCurrentTab] = useState(() => {
    if (typeof window !== 'undefined') {
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
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  
  // WhatsApp Baileys State
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [whatsappUser, setWhatsappUser] = useState(null);
  
  // Modals
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
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
        if (data && typeof data.autoReplyEnabled === 'boolean') {
          setGlobalAiEnabled(data.autoReplyEnabled);
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
              const found = usersList.find(u => u.id === savedUser.id);
              if (found) {
                setCurrentUser(found);
                return;
              }
            } catch (e) {}
          }
          if (usersList.length > 0 && !currentUser) {
            const adminUser = usersList.find(u => u.role === 'admin') || usersList[0];
            setCurrentUser(adminUser);
          }
        }
      })
      .catch(err => console.error('Error cargando usuarios:', err));
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

  useEffect(() => {
    loadLeads();
    loadCalls();
    loadWhatsAppStatus();
    loadSettings();
    loadUsers();

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    socket.on('connect', () => {
      console.log('Conectado a Socket.IO');
    });

    socket.on('settings:update', (newSettings) => {
      if (newSettings && typeof newSettings.autoReplyEnabled === 'boolean') {
        setGlobalAiEnabled(newSettings.autoReplyEnabled);
      }
    });

    socket.on('user:new', (newUser) => {
      setAllUsers(prev => [newUser, ...prev.filter(u => u.id !== newUser.id)]);
    });

    socket.on('user:update', (updated) => {
      setAllUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      if (currentUser && currentUser.id === updated.id) {
        setCurrentUser(updated);
        localStorage.setItem('wagent_user', JSON.stringify(updated));
      }
    });

    socket.on('user:delete', (deletedId) => {
      setAllUsers(prev => prev.filter(u => u.id !== deletedId));
    });

    socket.on('whatsapp:status', (data) => {
      if (!data || (data.sessionId && data.sessionId !== 'default')) return;
      console.log('WhatsApp primary status event:', data);
      setWhatsappStatus(data.status);
      setQrDataUrl(data.qrDataUrl);
      setWhatsappUser(data.user);
    });

    socket.on('whatsapp:qr', (data) => {
      if (!data || (data.sessionId && data.sessionId !== 'default')) return;
      setQrDataUrl(data.qrDataUrl);
      setWhatsappStatus('qr_ready');
    });

    socket.on('chat:message', ({ message, lead }) => {
      loadLeads();
      if (lead && selectedLead?.jid === lead.jid) {
        setSelectedLead(lead);
      }
      const isOutgoing = message.sender === 'agent' || message.fromMe;
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
    });

    socket.on('order:new', (order) => {
      playOrderChime();
      const totalNum = Number(order?.totalAmount || order?.total || 0);
      addNotification({
        title: `Nuevo Pedido #${order?.orderNumber || order?.id?.slice(-5) || ''}`,
        message: `${order?.customerName || 'Cliente'} - $${totalNum.toLocaleString('es-AR')} (${order?.paymentMethod || 'Efectivo'})`,
        type: 'order',
        tab: 'orders',
        data: order
      });
    });

    socket.on('order:update', (order) => {
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
    });

    socket.on('pos:shift:opened', (shift) => {
      playNotificationChime();
      addNotification({
        title: 'Caja POS Abierta',
        message: `Turno iniciado por ${shift?.openedByName || 'Operador'} con $${shift?.initialCash || 0}`,
        type: 'pos',
        tab: 'pos'
      });
    });

    socket.on('pos:shift:closed', (shift) => {
      playNotificationChime();
      addNotification({
        title: 'Caja POS Cerrada',
        message: `Turno cerrado por ${shift?.closedByName || 'Operador'}. Ventas: $${shift?.totalSales || 0}`,
        type: 'pos',
        tab: 'pos'
      });
    });

    socket.on('whatsapp:call', ({ call, lead }) => {
      console.log('Evento de llamada en Socket:', call);
      loadCalls();
      loadLeads();
      
      // Si la llamada está sonando, abrir modal de llamada entrante
      if (call.status === 'ringing' || call.status === 'offer') {
        setIncomingCall(call);
        setIsCallModalOpen(true);
      }
    });

    socket.on('lead:update', (updatedLead) => {
      setLeads(prev => prev.map(l => (l.jid === updatedLead.jid || l.id === updatedLead.id ? updatedLead : l)));
      if (selectedLead?.jid === updatedLead.jid || selectedLead?.id === updatedLead.id) {
        setSelectedLead(updatedLead);
      }
    });

    socket.on('lead:delete', ({ id }) => {
      setLeads(prev => prev.filter(l => l.id !== id && l.jid !== id));
    });

    return () => {
      socket.disconnect();
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
      await fetch(`/api/chats/${encodeURIComponent(jid)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sendViaWhatsApp: true })
      });
    } catch (err) {
      console.error('Error enviando mensaje:', err);
    }
  };

  const handleSendAudio = async (jid, formData) => {
    try {
      await fetch(`/api/chats/${encodeURIComponent(jid)}/send-audio`, {
        method: 'POST',
        body: formData
      });
    } catch (err) {
      console.error('Error enviando nota de voz:', err);
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

  return (
    <div className="flex flex-col h-screen bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      
      {/* Top Navbar (Solo visible en vistas de Administración / Operador, NO en la Tienda Web del Cliente ni en el POS Autónomo /pos) */}
      {currentTab !== 'storefront' && !isPosStandalone && (
        <Navbar
          currentTab={currentTab}
          setCurrentTab={(tab) => {
            if (tab === 'storefront') {
              window.history.pushState({}, '', '/tienda');
            } else if (tab === 'pos-standalone') {
              window.history.pushState({}, '', '/pos');
              setCurrentTab('pos');
              return;
            } else if (window.location.pathname.startsWith('/tienda') || window.location.pathname.startsWith('/pos')) {
              window.history.pushState({}, '', '/');
            }
            setCurrentTab(tab);
          }}
          whatsappStatus={whatsappStatus}
          onOpenQR={() => setIsQRModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenCallModal={() => handleOpenCallModal(null)}
          onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
          globalAiEnabled={globalAiEnabled}
          onToggleGlobalAi={handleToggleGlobalAi}
          unreadCount={totalUnreadCount}
          currentUser={currentUser}
          allUsers={allUsers}
          onSwitchUser={(user) => {
            setCurrentUser(user);
            localStorage.setItem('wagent_user', JSON.stringify(user));
          }}
          isMobileDrawerOpen={isMobileDrawerOpen}
          setIsMobileDrawerOpen={setIsMobileDrawerOpen}
          notifications={notifications}
          onMarkAllNotificationsRead={() => {
            setNotifications(prev => {
              const updated = prev.map(n => ({ ...n, read: true }));
              try { localStorage.setItem('wagent_notifications', JSON.stringify(updated)); } catch (e) {}
              return updated;
            });
          }}
          onClearNotifications={() => {
            setNotifications([]);
            try { localStorage.removeItem('wagent_notifications'); } catch (e) {}
          }}
          onSelectNotification={(notif) => {
            if (notif.tab) setCurrentTab(notif.tab);
            if (notif.jid && leads.length > 0) {
              const targetLead = leads.find(l => l.jid === notif.jid);
              if (targetLead) setSelectedLead(targetLead);
            }
          }}
        />
      )}

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden">
        {currentTab === 'storefront' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <StorefrontView onBackToAdmin={() => {
              setCurrentTab('inbox');
              window.history.pushState({}, '', '/');
            }} />
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
          <AnalyticsDashboard />
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
      </main>

      {/* Mobile Bottom Navigation Bar (Visible on mobile/tablet screens < lg solo en panel Admin) */}
      {currentTab !== 'storefront' && !isPosStandalone && (
        <div className="lg:hidden h-14 bg-[#111b21]/95 border-t border-slate-800 flex items-center justify-around px-2 z-30 sticky bottom-0 backdrop-blur-md">
          <button
            onClick={() => setCurrentTab('inbox')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'inbox' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare size={18} />
            <span className="text-[10px]">Chats</span>
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
            onClick={() => setCurrentTab('orders')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'orders' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PackageCheck size={18} />
            <span className="text-[10px]">Pedidos</span>
          </button>

          <button
            onClick={() => setCurrentTab('drivers')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              currentTab === 'drivers' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bike size={18} />
            <span className="text-[10px]">Reparto</span>
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

    </div>
  );
}
