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
import POSView from './components/POSView';
import QRModal from './components/QRModal';
import SettingsModal from './components/SettingsModal';
import CallModal from './components/CallModal';

const socket = io();

export default function App() {
  const [currentTab, setCurrentTab] = useState('inbox');
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [calls, setCalls] = useState([]);
  const [globalAiEnabled, setGlobalAiEnabled] = useState(true);

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

  useEffect(() => {
    loadLeads();
    loadCalls();
    loadWhatsAppStatus();
    loadSettings();
    loadUsers();

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
      console.log('WhatsApp status event:', data);
      setWhatsappStatus(data.status);
      setQrDataUrl(data.qrDataUrl);
      setWhatsappUser(data.user);
      if (data.status === 'qr_ready') {
        setIsQRModalOpen(true);
      }
    });

    socket.on('whatsapp:qr', (data) => {
      setQrDataUrl(data.qrDataUrl);
      setWhatsappStatus('qr_ready');
      setIsQRModalOpen(true);
    });

    socket.on('chat:message', ({ message, lead }) => {
      loadLeads();
      if (lead && selectedLead?.jid === lead.jid) {
        setSelectedLead(lead);
      }
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

  return (
    <div className="flex flex-col h-screen bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        whatsappStatus={whatsappStatus}
        onOpenQR={() => setIsQRModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenCallModal={() => handleOpenCallModal(null)}
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
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden">
        {currentTab === 'inbox' && (
          <ChatInbox
            leads={leads}
            selectedLead={selectedLead}
            setSelectedLead={setSelectedLead}
            onUpdateLeadStage={handleUpdateLeadStage}
            onToggleLeadAi={handleToggleLeadAi}
            onSendMessage={handleSendMessage}
            onSendAudio={handleSendAudio}
            onCallLead={(lead) => handleOpenCallModal(lead)}
          />
        )}

        {currentTab === 'pos' && (
          <POSView socket={socket} />
        )}

        {currentTab === 'orders' && (
          <OrdersView socket={socket} />
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
          <ProductCatalog />
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
      </main>

      {/* Mobile Bottom Navigation Bar (Visible on mobile/tablet screens < lg) */}
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

    </div>
  );
}
