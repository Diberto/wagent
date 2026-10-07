import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  PackageCheck,
  Calculator,
  ShoppingBag,
  Users,
  Kanban,
  Bike,
  Store,
  Tag,
  ChefHat,
  Image as ImageIcon,
  BarChart3,
  Bot,
  Brain,
  PhoneCall,
  BookOpen,
  Send,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  QrCode,
  Sparkles,
  Zap,
  Globe,
  Bell,
  Menu,
  X,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

export default function SidebarNav({
  currentTab,
  setCurrentTab,
  whatsappStatus = 'disconnected',
  onOpenQR,
  globalAiEnabled = true,
  onToggleGlobalAi,
  unreadCount = 0,
  currentUser,
  onLogout,
  onOpenMediaGallery,
  isMobileDrawerOpen,
  setIsMobileDrawerOpen,
  notifications = [],
  onOpenNotifications
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wagent_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('wagent_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  const navSections = [
    {
      id: 'operations',
      label: 'Operaciones',
      items: [
        { id: 'inbox', label: 'WhatsApp Chats', icon: MessageSquare, badge: unreadCount, badgeColor: 'bg-emerald-500 text-slate-950' },
        { id: 'orders', label: 'Pedidos & Ventas', icon: PackageCheck },
        { id: 'pos', label: 'POS Mostrador', icon: Calculator },
        { id: 'catalog', label: 'Cortes & PLU', icon: ShoppingBag },
        { id: 'customers', label: 'Clientes CRM', icon: Users },
        { id: 'kanban', label: 'Embudo de Ventas', icon: Kanban },
        { id: 'drivers', label: 'Reparto & Cadetes', icon: Bike }
      ]
    },
    {
      id: 'commercial',
      label: 'Comercial & Tienda',
      items: [
        { id: 'storefront', label: 'Tienda Online Web', icon: Globe, isSpecial: true },
        { id: 'coupons', label: 'Cupones & Promos', icon: Tag },
        { id: 'recipes', label: 'Recetas Tradicionales', icon: ChefHat },
        { id: 'branches', label: '6 Sucursales', icon: Store },
        { id: 'media-gallery', label: 'Galería de Medios', icon: ImageIcon, isAction: true, onClick: onOpenMediaGallery },
        { id: 'analytics', label: 'Reportes & KPIs', icon: BarChart3 }
      ]
    },
    {
      id: 'ai',
      label: 'Inteligencia Artificial',
      items: [
        { id: 'agents', label: 'Agentes & Personalidades', icon: Bot },
        { id: 'multi-agent', label: 'Team Multi-Agente Ops', icon: Users },
        { id: 'neural-memory', label: 'Red Neuronal & Grafo', icon: Brain },
        { id: 'callcenter', label: 'Centro de Voz (ElevenLabs)', icon: PhoneCall },
        { id: 'knowledge', label: 'Base de Conocimiento (RAG)', icon: BookOpen },
        { id: 'campaigns', label: 'Difusiones & Campañas', icon: Send }
      ]
    },
    {
      id: 'management',
      label: 'Centro de Control',
      items: [
        { 
          id: 'admin', 
          label: 'Admin & Configuración', 
          icon: Settings,
          highlight: true 
        }
      ]
    }
  ];

  const handleItemClick = (item) => {
    if (item.isAction && typeof item.onClick === 'function') {
      item.onClick();
      setIsMobileDrawerOpen?.(false);
      return;
    }
    if (item.id === 'storefront') {
      if (typeof window !== 'undefined') window.history.pushState({}, '', '/tienda');
    }
    setCurrentTab(item.id);
    setIsMobileDrawerOpen?.(false);
  };

  const getStatusBadge = () => {
    switch (whatsappStatus) {
      case 'connected':
        return (
          <div 
            onClick={onOpenQR}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold cursor-pointer hover:bg-emerald-500/25 transition-all"
            title="WhatsApp Conectado - Click para ver detalles"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {!isCollapsed && <span className="truncate">Online</span>}
          </div>
        );
      case 'connecting':
        return (
          <div 
            onClick={onOpenQR}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-semibold cursor-pointer hover:bg-amber-500/25 transition-all"
            title="Conectando WhatsApp..."
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            {!isCollapsed && <span className="truncate">Conectando</span>}
          </div>
        );
      default:
        return (
          <button 
            onClick={onOpenQR}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[11px] font-semibold hover:bg-rose-500/25 transition-all"
            title="WhatsApp Desconectado - Click para escanear QR"
          >
            <QrCode size={12} />
            {!isCollapsed && <span className="truncate">Conectar QR</span>}
          </button>
        );
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#111b21] border-r border-[#202c33] select-none">
      
      {/* Header / Brand */}
      <div className="h-16 px-3 flex items-center justify-between border-b border-[#202c33] shrink-0 bg-[#0c1317]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 via-rose-700 to-amber-600 flex items-center justify-center shrink-0 shadow-lg text-lg">
            🥩
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-extrabold text-white tracking-wide truncate">
                República <span className="text-red-400 font-bold">Carne</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-medium truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> WAgent AI Suite
              </span>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button (Desktop) */}
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202c33] transition-colors"
          title={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Close Button (Mobile Drawer) */}
        <button
          onClick={() => setIsMobileDrawerOpen?.(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202c33]"
        >
          <X size={18} />
        </button>
      </div>

      {/* Status Bar: WhatsApp & Quick AI */}
      <div className={`px-2.5 py-2.5 border-b border-[#202c33] flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between'} bg-[#111b21]/80 shrink-0`}>
        {getStatusBadge()}

        {/* Global AI Quick Switch */}
        <button
          onClick={onToggleGlobalAi}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-semibold transition-all ${
            globalAiEnabled 
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25' 
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title={globalAiEnabled ? "IA Global Activada (Click para pausar)" : "IA Global Pausada (Click para activar)"}
        >
          <Sparkles size={12} className={globalAiEnabled ? "text-purple-400 animate-spin-slow" : ""} />
          {!isCollapsed && <span>{globalAiEnabled ? 'IA On' : 'IA Off'}</span>}
        </button>
      </div>

      {/* Navigation Sections (Scrollable) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2 space-y-4">
        {navSections.map(section => (
          <div key={section.id} className="space-y-1">
            {!isCollapsed && (
              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {section.label}
              </div>
            )}

            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id || (item.id === 'admin' && currentTab.startsWith('admin:'));

                return (
                  <div key={item.id} className="relative group">
                    <button
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? item.highlight 
                            ? 'bg-gradient-to-r from-red-600/30 to-amber-600/20 text-red-200 border border-red-500/40 shadow-sm'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-[#202c33]'
                      } ${isCollapsed ? 'justify-center' : ''}`}
                    >
                      <div className="relative shrink-0">
                        <Icon size={18} className={isActive ? (item.highlight ? 'text-red-400' : 'text-emerald-400') : 'text-slate-400 group-hover:text-slate-200'} />
                        {isCollapsed && item.badge > 0 && (
                          <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <span className="truncate">{item.label}</span>
                          {item.badge > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${item.badgeColor || 'bg-emerald-500/20 text-emerald-400'}`}>
                              {item.badge}
                            </span>
                          )}
                          {item.highlight && !item.badge && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                          )}
                        </div>
                      )}
                    </button>

                    {/* Tooltip on Collapsed Mode */}
                    {isCollapsed && (
                      <div className="hidden md:group-hover:flex absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#182229] border border-[#2a3942] rounded-lg text-white text-xs whitespace-nowrap shadow-xl z-50 pointer-events-none items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
                        <span>{item.label}</span>
                        {item.badge > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: User profile & Logout */}
      <div className="p-2 border-t border-[#202c33] bg-[#0c1317] shrink-0">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'RC'}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate">
                  {currentUser?.name || 'Operador'}
                </span>
                <span className="text-[10px] text-slate-400 capitalize truncate">
                  {currentUser?.role || 'Staff'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside 
        className={`hidden md:block h-screen transition-all duration-200 z-30 shrink-0 ${
          isCollapsed ? 'w-[68px]' : 'w-[256px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-[280px] max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
