import React, { useState } from 'react';
import { 
  MessageSquare, 
  Kanban, 
  PhoneCall, 
  BookOpen, 
  BarChart3, 
  Settings, 
  Bot, 
  QrCode, 
  Sparkles,
  Smartphone,
  PhoneForwarded,
  UserCheck,
  ShoppingBag,
  PackageCheck,
  Users,
  Store,
  Calculator,
  Power,
  Bike,
  Menu,
  X,
  ChevronDown,
  LogIn,
  ShieldCheck,
  Globe,
  User
} from 'lucide-react';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  whatsappStatus, 
  onOpenQR, 
  onOpenSettings,
  onOpenCallModal,
  globalAiEnabled = true,
  onToggleGlobalAi,
  unreadCount = 0,
  currentUser,
  allUsers = [],
  onSwitchUser,
  isMobileDrawerOpen,
  setIsMobileDrawerOpen
}) {
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

  const allTabs = [
    { id: 'inbox', label: 'Mensajes & Audios', icon: MessageSquare, badge: unreadCount },
    { id: 'pos', label: 'POS Mostrador', icon: Calculator },
    { id: 'orders', label: 'Pedidos', icon: PackageCheck },
    { id: 'woo', label: 'WooCommerce', icon: Globe },
    { id: 'drivers', label: 'Repartidores', icon: Bike },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'branches', label: 'Sucursales', icon: Store },
    { id: 'catalog', label: 'Catálogo', icon: ShoppingBag },
    { id: 'kanban', label: 'Embudo', icon: Kanban },
    { id: 'callcenter', label: 'Llamadas', icon: PhoneCall },
    { id: 'knowledge', label: 'Base de Conocimiento', icon: BookOpen },
    { id: 'analytics', label: 'Métricas', icon: BarChart3 },
    { id: 'users', label: 'Usuarios & Roles', icon: ShieldCheck },
  ];

  // Filter tabs according to user permissions (Admin sees all)
  const allowedTabs = allTabs.filter(tab => {
    if (!currentUser || currentUser.role === 'admin') return true;
    if (Array.isArray(currentUser.tabs)) {
      return currentUser.tabs.includes(tab.id);
    }
    return true;
  });

  const getRoleIconAndBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-400 border border-purple-500/30">👑 Admin</span>;
      case 'gerencia':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">📊 Gerencia</span>;
      case 'encargado':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🏪 Encargado</span>;
      case 'cajero':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">💳 Cajero</span>;
      case 'repartidor':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-400 border border-sky-500/30">🛵 Repartidor</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-700 text-slate-300">Usuario</span>;
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#111b21]/95 backdrop-blur-xl px-3 sm:px-4 lg:px-6 flex items-center justify-between z-40 sticky top-0">
      
      {/* Left: Mobile Menu Toggle & Brand Logo */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
          className="p-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 lg:hidden transition"
          title="Abrir menú de navegación"
        >
          {isMobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Brand & Logo */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer select-none" 
          onClick={() => setCurrentTab('inbox')}
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20 shrink-0">
            <div className="w-full h-full bg-[#0b141a] rounded-[15px] flex items-center justify-center text-emerald-400">
              <Bot size={20} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">WAgent</span>
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                CRM
              </span>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:block -mt-0.5">República de la Carne</span>
          </div>
        </div>

        {/* Desktop Navigation Tabs (Hidden on small screens) */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#182229] p-1 rounded-2xl border border-slate-800 overflow-x-auto max-w-[52vw] xl:max-w-none">
          {allowedTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
                    isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Actions, Master AI Switch & User Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        
        {/* Master AI Auto-Reply Switch Button */}
        <button
          onClick={onToggleGlobalAi}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all active:scale-95 ${
            globalAiEnabled
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-sm'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25 shadow-sm'
          }`}
          title={globalAiEnabled ? 'Agente IA Respondiendo (Clic para pausar general)' : 'Agente IA Pausado (Clic para reactivar)'}
        >
          <Bot size={14} className={globalAiEnabled ? 'text-emerald-400 animate-pulse' : 'text-amber-400'} />
          <span className="hidden sm:inline">IA: {globalAiEnabled ? 'ON' : 'OFF'}</span>
          <span className={`w-2 h-2 rounded-full ${globalAiEnabled ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
        </button>

        {/* Outbound Call Button (Hidden on extra small screens) */}
        <button
          onClick={onOpenCallModal}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 text-xs font-bold border border-slate-700/60 transition active:scale-95"
          title="Marcador Telefónico de Voz"
        >
          <PhoneCall size={14} className="text-emerald-400" />
          <span className="hidden md:inline">Llamar</span>
        </button>

        {/* WhatsApp Connection Button */}
        <button
          onClick={onOpenQR}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
            whatsappStatus === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : whatsappStatus === 'qr_ready'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
          title="Estado de WhatsApp / Vincular QR"
        >
          <QrCode size={15} />
          <span className="hidden md:inline">
            {whatsappStatus === 'connected' ? 'WhatsApp OK' : whatsappStatus === 'qr_ready' ? 'Escanear QR' : 'Conectar'}
          </span>
          <span className={`w-2 h-2 rounded-full ${
            whatsappStatus === 'connected' ? 'bg-emerald-400 animate-ping' : whatsappStatus === 'qr_ready' ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 sm:p-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700/60 transition"
          title="Configuración General del Sistema y Agente IA"
        >
          <Settings size={17} />
        </button>

        {/* User Profile Selector Chip */}
        <div className="relative">
          <button
            onClick={() => setIsUserSwitcherOpen(!isUserSwitcherOpen)}
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-2xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 transition select-none"
            title="Cambiar de usuario o perfil activo"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs font-extrabold text-white shadow-md">
              {currentUser?.avatar || 'U'}
            </div>
            <div className="hidden sm:flex flex-col items-start text-left leading-tight">
              <span className="text-xs font-bold text-white max-w-[90px] truncate">{currentUser?.name || 'Usuario'}</span>
              <span className="text-[10px] text-slate-400">{getRoleIconAndBadge(currentUser?.role || 'admin')}</span>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
          </button>

          {/* User Switcher Dropdown */}
          {isUserSwitcherOpen && (
            <div className="absolute right-0 top-12 w-64 bg-[#182229] border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 space-y-2 z-50 animate-in fade-in">
              <div className="px-2 py-1 border-b border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perfil Activo</div>
                <div className="text-xs font-extrabold text-white mt-0.5">{currentUser?.name || 'Usuario'}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Rol: {currentUser?.role}</div>
              </div>

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1">
                Cambiar de Perfil:
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allUsers.map(user => {
                  const isSelected = currentUser && currentUser.id === user.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        if (onSwitchUser) onSwitchUser(user);
                        setIsUserSwitcherOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition ${
                        isSelected
                          ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                          : 'hover:bg-[#111b21] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#111b21] text-purple-400 flex items-center justify-center text-[10px] font-bold">
                          {user.avatar || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
                          <div className="text-[10px] text-slate-400">@{user.username}</div>
                        </div>
                      </div>
                      {getRoleIconAndBadge(user.role)}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                <button
                  onClick={() => {
                    setCurrentTab('users');
                    setIsUserSwitcherOpen(false);
                  }}
                  className="w-full py-1.5 px-2 rounded-xl bg-[#111b21] hover:bg-purple-950/40 text-purple-400 text-xs font-bold text-center border border-slate-800 transition"
                >
                  👥 Gestionar Usuarios & Roles
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Mobile Drawer (Deslizable lateral) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden animate-fade-in">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-72 max-w-[85vw] bg-[#111b21] border-r border-slate-800 h-full p-4 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto">
            
            <div className="space-y-4">
              {/* Drawer Header & Profile */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                    {currentUser?.avatar || 'CR'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white leading-tight">{currentUser?.name || 'Carlos R.'}</div>
                    <div className="mt-0.5">{getRoleIconAndBadge(currentUser?.role || 'admin')}</div>
                  </div>
                </div>

                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Navigation List */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
                  Módulos del Sistema
                </div>
                {allowedTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setCurrentTab(tab.id);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm'
                          : 'text-slate-300 hover:bg-[#182229] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} />
                        <span>{tab.label}</span>
                      </div>
                      {tab.badge > 0 && (
                        <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
                        }`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                onClick={() => {
                  onOpenSettings();
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700/60 transition"
              >
                <Settings size={15} className="text-emerald-400" />
                <span>Configuración del Sistema</span>
              </button>

              <button
                onClick={() => {
                  onOpenQR();
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700/60 transition"
              >
                <QrCode size={15} className="text-emerald-400" />
                <span>Vincular WhatsApp QR</span>
              </button>

              <button
                onClick={() => {
                  onOpenCallModal();
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700/60 transition"
              >
                <PhoneCall size={15} className="text-sky-400" />
                <span>Marcador Telefónico</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </header>
  );
}
