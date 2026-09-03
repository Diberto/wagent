import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Kanban, 
  PhoneCall, 
  BookOpen, 
  BarChart3, 
  Settings, 
  Bot, 
  QrCode, 
  ShoppingBag, 
  PackageCheck, 
  Users, 
  Store, 
  Calculator, 
  Bike, 
  Menu, 
  X, 
  ChevronDown, 
  ShieldCheck, 
  Globe, 
  Zap,
  Sparkles,
  Brain,
  Send,
  Image as ImageIcon,
  Receipt,
  Search,
  ChevronRight,
  UserCheck,
  ChefHat,
  Activity,
  Tag
} from 'lucide-react';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  whatsappStatus, 
  onOpenQR, 
  onOpenSettings,
  onOpenCallModal,
  onOpenMediaGallery,
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
  const [activeDropdown, setActiveDropdown] = useState(null); // 'commercial' | 'ai_modules' | null
  const [drawerSearch, setDrawerSearch] = useState('');
  const navRef = useRef(null);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActiveDropdown(null);
        setIsUserSwitcherOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Grupos organizados para los dropdowns y el drawer lateral
  const navGroups = [
    {
      id: 'commercial',
      label: 'Comercial & Sucursales',
      icon: Store,
      items: [
        { id: 'storefront', label: '🛍️ Tienda Online (/tienda)', icon: Globe, desc: 'Catálogo webapp y pedidos WhatsApp' },
        { id: 'coupons', label: '🏷️ Cupones de Descuento', icon: Tag, desc: 'Crear y gestionar códigos de descuento con vigencia y límites' },
        { id: 'recipes', label: '👨‍🍳 Recetas Tradicionales', icon: ChefHat, desc: 'Recetario argentino vinculado a cortes' },
        { id: 'branches', label: '6 Sucursales Oficiales', icon: Store, desc: 'Urca, Intercountry, Duarte Quirós, Villa Allende y más' },
        { id: 'media-gallery', label: '🖼️ Galería de Medios', icon: ImageIcon, desc: 'Fotos de cortes y banners optimizados' },
        { id: 'kanban', label: 'Embudo de Ventas (CRM)', icon: Kanban, desc: 'Pipeline de conversión y etapas' },
        { id: 'drivers', label: 'Repartidores & Logística', icon: Bike, desc: 'Asignación de cadetes y despachos' }
      ]
    },
    {
      id: 'ai_modules',
      label: 'IA & Módulos',
      icon: Sparkles,
      items: [
        { id: 'multi-agent', label: '👥 Team Multi-Agente Ops', icon: Users, desc: 'Chat interno con Carlos, Mateo, Stock y DevOps' },
        { id: 'system-health', label: '📊 Monitoreo & Recursos', icon: Activity, desc: 'Telemetría CPU/RAM, estado de módulos y optimización BD' },
        { id: 'agents', label: 'Agentes IA Personalizados', icon: Bot, desc: 'Perfiles, historias, roles, personalidades y avatares' },
        { id: 'neural-memory', label: 'Red Neuronal & Grafo', icon: Brain, desc: 'Grafo cognitivo y aprendizaje continuo' },
        { id: 'campaigns', label: 'Difusiones & Campañas', icon: Send, desc: 'Envíos masivos y ofertas' },
        { id: 'callcenter', label: 'Centro de Voz (ElevenLabs)', icon: PhoneCall, desc: 'Llamadas y agente de voz telefónico' },
        { id: 'automations', label: 'Automatizaciones & Flujos', icon: Zap, desc: 'Reglas inteligentes de pedidos' },
        { id: 'woo', label: 'WooCommerce Sync', icon: Globe, desc: 'Sincronización de tienda online' },
        { id: 'knowledge', label: 'Base de Conocimiento (RAG)', icon: BookOpen, desc: 'Respuestas automáticas del agente' },
        { id: 'analytics', label: 'Reporte de Ventas & KPIs', icon: BarChart3, desc: 'Estadísticas por sucursal y producto' },
        { id: 'users', label: 'Usuarios & Accesos', icon: ShieldCheck, desc: 'Control de operadores y roles' }
      ]
    }
  ];

  // 5 Accesos directos de máxima frecuencia diaria
  const primaryTabs = [
    { id: 'inbox', label: 'WhatsApp', icon: MessageSquare, badge: unreadCount },
    { id: 'orders', label: 'Pedidos', icon: PackageCheck },
    { id: 'pos', label: 'POS Caja', icon: Calculator },
    { id: 'catalog', label: 'Cortes & PLU', icon: ShoppingBag },
    { id: 'customers', label: 'Clientes', icon: Users }
  ];

  const getRoleBadge = (role) => {
    switch (role) {
      case 'agente_ia_principal':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-emerald-500/25 to-purple-500/25 text-emerald-300 border border-emerald-400/40">🤖 IA Master</span>;
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

  const allItemsForDrawer = [
    ...primaryTabs.map(t => ({ ...t, desc: 'Acceso directo principal' })),
    ...navGroups.flatMap(g => g.items)
  ];

  const filteredDrawerItems = allItemsForDrawer.filter(item => 
    !drawerSearch || 
    item.label.toLowerCase().includes(drawerSearch.toLowerCase()) || 
    (item.desc && item.desc.toLowerCase().includes(drawerSearch.toLowerCase()))
  );

  return (
    <header ref={navRef} className="h-16 border-b border-slate-800/80 bg-[#111b21]/95 backdrop-blur-xl px-2 sm:px-4 flex items-center justify-between z-40 sticky top-0 gap-2 select-none">
      
      {/* 1. Izquierda: Logo & Botón Menú Lateral */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
          className={`p-2 rounded-xl border transition-all ${
            isMobileDrawerOpen
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : 'bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60'
          }`}
          title="Abrir Menú de Secciones y Búsqueda Rápida"
        >
          {isMobileDrawerOpen ? <X size={19} /> : <Menu size={19} />}
        </button>

        <div 
          className="flex items-center gap-2.5 cursor-pointer group" 
          onClick={() => setCurrentTab('inbox')}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 p-[1.5px] shadow-lg shadow-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-[#0b141a] rounded-[10px] flex items-center justify-center text-lg">
              🥩
            </div>
          </div>
          <div className="hidden min-[520px]:block leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white group-hover:text-emerald-400 transition-colors">WAgent</span>
              <span className="text-[9px] uppercase font-black tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                CRM
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 block -mt-0.5 truncate max-w-[130px]">República de la Carne</span>
          </div>
        </div>
      </div>

      {/* 2. Centro: Segmented Controller Ergonómico (Sin sobrecarga ni duplicados) */}
      <nav className="hidden lg:flex items-center gap-1 bg-[#182229] p-1 rounded-2xl border border-slate-800/90 shadow-inner">
        
        {/* Pestañas primarias */}
        {primaryTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setCurrentTab(tab.id);
                setActiveDropdown(null);
              }}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-slate-950' : 'text-emerald-400'} />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse ${
                  isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="w-[1px] h-4 bg-slate-700/60 mx-1 shrink-0" />

        {/* Dropdowns secundarios limpios */}
        {navGroups.map(group => {
          const isGroupActive = group.items.some(it => it.id === currentTab);
          const isOpen = activeDropdown === group.id;
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="relative">
              <button
                onClick={() => setActiveDropdown(isOpen ? null : group.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isGroupActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : isOpen
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <GroupIcon size={13} className={isGroupActive ? 'text-emerald-400' : 'text-slate-400'} />
                <span>{group.label}</span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : 'text-slate-500'}`} />
              </button>

              {/* Menú Desplegable Glassmorphism */}
              {isOpen && (
                <div className="absolute left-0 top-11 w-72 bg-[#182229]/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-800/80 mb-1 flex items-center justify-between">
                    <span>{group.label}</span>
                    <span className="text-[9px] text-emerald-400 font-bold">Módulos</span>
                  </div>
                  <div className="space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar">
                    {group.items.map(item => {
                      const ItemIcon = item.icon;
                      const isItemActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.id === 'media-gallery') {
                              onOpenMediaGallery?.();
                            } else {
                              setCurrentTab(item.id);
                            }
                            setActiveDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                            isItemActive
                              ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                              : 'hover:bg-[#202c33] text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-lg ${isItemActive ? 'bg-slate-950/20' : 'bg-[#111b21] text-emerald-400'}`}>
                              <ItemIcon size={14} />
                            </div>
                            <div>
                              <div className="text-xs leading-tight font-bold">{item.label}</div>
                              {item.desc && <div className={`text-[10px] leading-tight ${isItemActive ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{item.desc}</div>}
                            </div>
                          </div>
                          <ChevronRight size={12} className={isItemActive ? 'text-slate-950' : 'text-slate-600'} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 3. Derecha: Barra de Control y Estados en Vivo */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        
        {/* Toggle Master del Agente IA */}
        <button
          onClick={onToggleGlobalAi}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-black border transition-all active:scale-95 ${
            globalAiEnabled
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25 shadow-sm'
          }`}
          title={globalAiEnabled ? 'Agente IA Respondiendo en Vivo (Clic para pausar)' : 'Agente IA Pausado (Clic para reactivar)'}
        >
          <Bot size={14} className={globalAiEnabled ? 'text-emerald-400' : 'text-amber-400'} />
          <span className="hidden sm:inline">IA: {globalAiEnabled ? 'ON' : 'OFF'}</span>
          <span className={`w-2 h-2 rounded-full ${globalAiEnabled ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
        </button>

        {/* Botón de Estado / Vinculación WhatsApp */}
        <button
          onClick={onOpenQR}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
            whatsappStatus === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : whatsappStatus === 'qr_ready'
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25 animate-pulse'
              : 'bg-rose-500/15 text-rose-400 border-rose-500/40 hover:bg-rose-500/25'
          }`}
          title="Estado de conexión WhatsApp / Vincular Código QR"
        >
          <QrCode size={14} />
          <span className="hidden md:inline">
            {whatsappStatus === 'connected' ? 'WhatsApp' : whatsappStatus === 'qr_ready' ? 'Escanear QR' : 'Conectar'}
          </span>
          <span className={`w-2 h-2 rounded-full ${
            whatsappStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : whatsappStatus === 'qr_ready' ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
        </button>

        {/* Botón de Ajustes Generales */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-slate-600 transition-all shadow-sm active:scale-95"
          title="Configuración General, Logística, ARCA y Agente IA"
        >
          <Settings size={16} />
        </button>

        {/* Chip Selector de Usuario / Perfil Activo */}
        <div className="relative">
          <button
            onClick={() => setIsUserSwitcherOpen(!isUserSwitcherOpen)}
            className="flex items-center gap-1.5 p-1 sm:px-2 sm:py-1 rounded-2xl bg-[#182229] hover:bg-[#202c33] border border-slate-700/80 transition-all active:scale-95 select-none"
            title="Cambiar operador o perfil activo"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-xs font-black text-white shadow-md">
              {currentUser?.avatar || 'U'}
            </div>
            <div className="hidden xl:flex flex-col items-start text-left leading-tight">
              <span className="text-xs font-bold text-white max-w-[85px] truncate">{currentUser?.name || 'Usuario'}</span>
              <span className="text-[9px] text-slate-400 uppercase font-semibold">{currentUser?.role}</span>
            </div>
            <ChevronDown size={11} className="text-slate-400 hidden sm:block" />
          </button>

          {/* Menú Flotante de Selección de Perfil */}
          {isUserSwitcherOpen && (
            <div className="absolute right-0 top-12 w-64 bg-[#111b21] border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 space-y-2 z-50 animate-in fade-in">
              <div className="px-2 py-1 border-b border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operador Activo</div>
                <div className="text-xs font-extrabold text-white mt-0.5">{currentUser?.name || 'Usuario'}</div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <span>Rol:</span> {getRoleBadge(currentUser?.role)}
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1">
                Cambiar de Usuario:
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                {allUsers.map(user => {
                  const isSelected = currentUser && currentUser.id === user.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        if (onSwitchUser) onSwitchUser(user);
                        setIsUserSwitcherOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                          : 'hover:bg-[#182229] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#0b141a] text-purple-400 flex items-center justify-center text-[10px] font-bold">
                          {user.avatar || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
                          <div className="text-[10px] text-slate-400">@{user.username}</div>
                        </div>
                      </div>
                      {getRoleBadge(user.role)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Drawer Móvil y Command Palette Lateral */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-black/70 backdrop-blur-md flex animate-in fade-in">
          <div className="w-full max-w-sm bg-[#111b21] border-r border-slate-800 h-full flex flex-col p-4 shadow-2xl">
            
            {/* Buscador Rápido de Secciones */}
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="Buscar sección o módulo..."
                className="w-full pl-9 pr-3 py-2 bg-[#182229] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                autoFocus
              />
              {drawerSearch && (
                <button
                  onClick={() => setDrawerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Lista de Secciones */}
            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 py-1">
                Accesos Directos
              </div>
              {filteredDrawerItems.map(item => {
                const ItemIcon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'media-gallery') {
                        onOpenMediaGallery?.();
                      } else {
                        setCurrentTab(item.id);
                      }
                      setIsMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                        : 'hover:bg-[#182229] text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isActive ? 'bg-slate-950/20' : 'bg-[#182229] text-emerald-400'}`}>
                        <ItemIcon size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold">{item.label}</div>
                        {item.desc && <div className={`text-[10px] ${isActive ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{item.desc}</div>}
                      </div>
                    </div>
                    {item.badge > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pie del Drawer con accesos rápidos */}
            <div className="pt-3 mt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  onOpenSettings();
                  setIsMobileDrawerOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-[#182229] hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-200 border border-slate-700/80 transition"
              >
                <Settings size={14} />
                <span>Ajustes</span>
              </button>
              <button
                onClick={() => {
                  onOpenQR();
                  setIsMobileDrawerOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-500/40 transition"
              >
                <QrCode size={14} />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
          
          <div className="flex-1 h-full" onClick={() => setIsMobileDrawerOpen(false)} />
        </div>
      )}
    </header>
  );
}
