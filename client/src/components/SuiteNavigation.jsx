import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Store, 
  Calculator, 
  PackageCheck, 
  Bike, 
  Users, 
  Bot, 
  Sliders, 
  Sparkles, 
  Sun, 
  Moon, 
  Palette, 
  ShieldCheck, 
  Grid, 
  ChevronUp, 
  ChevronDown, 
  Settings, 
  PhoneCall, 
  Kanban, 
  BookOpen, 
  Activity, 
  Layers, 
  User, 
  LogOut,
  Flame,
  Check
} from 'lucide-react';

export const THEME_PRESETS = [
  { id: 'dark_asador', name: 'Dark Asador', bg: '#111b21', card: '#182229', accent: '#e53935', text: '#f1f5f9', border: '#2a3942' },
  { id: 'midnight_oled', name: 'Midnight OLED', bg: '#05080a', card: '#0d1318', accent: '#10b981', text: '#ffffff', border: '#1e293b' },
  { id: 'clean_snow', name: 'Clean Snow', bg: '#f8fafc', card: '#ffffff', accent: '#dc2626', text: '#0f172a', border: '#e2e8f0', isLight: true },
  { id: 'slate_steel', name: 'Slate Steel', bg: '#0f172a', card: '#1e293b', accent: '#3b82f6', text: '#f8fafc', border: '#334155' }
];

export default function SuiteNavigation({ 
  currentTab, 
  setCurrentTab, 
  currentUser, 
  onOpenCustomerPortal,
  onOpenSettings,
  notificationsCount = 0 
}) {
  const [isExpandedMenuOpen, setIsExpandedMenuOpen] = useState(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem('wagent_theme') || 'dark_asador';
  });

  // Aplicar tema al elemento raíz html/body
  useEffect(() => {
    const themeObj = THEME_PRESETS.find(t => t.id === activeTheme) || THEME_PRESETS[0];
    document.documentElement.setAttribute('data-theme', themeObj.id);
    if (themeObj.isLight) {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('theme-light');
    }
    localStorage.setItem('wagent_theme', themeObj.id);
  }, [activeTheme]);

  const handleSelectTheme = (themeId) => {
    setActiveTheme(themeId);
    setIsThemePickerOpen(false);
  };

  // Apps Principales en el Dock
  const primaryApps = [
    { id: 'inbox', label: 'Chats WhatsApp', icon: MessageSquare, badge: notificationsCount },
    { id: 'storefront', label: 'Tienda Online', icon: Store },
    { id: 'pos', label: 'POS Mostrador', icon: Calculator },
    { id: 'orders', label: 'KDS & Pedidos', icon: PackageCheck },
    { id: 'drivers', label: 'Delivery Flota', icon: Bike },
    { id: 'agents', label: 'Agentes IA', icon: Bot, isAi: true },
    { id: 'customers', label: 'Clientes (7/7)', icon: Users }
  ];

  // Micro-módulos adicionales en el menú empaquetado
  const secondaryApps = [
    { id: 'kanban', label: 'Embudo de Ventas Kanban', icon: Kanban },
    { id: 'callcenter', label: 'Central Telefónica IA', icon: PhoneCall },
    { id: 'catalog', label: 'Catálogo de Cortes', icon: Layers },
    { id: 'branches', label: 'Sucursales de Carne', icon: Store },
    { id: 'users', label: 'Usuarios Unificados & Staff', icon: User },
    { id: 'knowledge', label: 'Base de Conocimiento RAG', icon: BookOpen },
    { id: 'neural-memory', label: 'Memoria Neuronal', icon: Sparkles },
    { id: 'campaigns', label: 'Campañas Masivas', icon: Flame },
    { id: 'analytics', label: 'Métricas de Venta', icon: Activity },
    { id: 'system-health', label: 'Diagnóstico & Salud', icon: ShieldCheck }
  ];

  const isAiAgent = currentUser?.userType === 'ai_agent' || currentUser?.isAIAgent;

  return (
    <>
      {/* ========================================================================= */}
      {/* DESKTOP FLOATING SUITE DOCK (Visible en pantallas medianas y grandes)    */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex fixed bottom-5 left-1/2 -translate-x-1/2 z-40 items-center gap-1.5 p-2 bg-[#111b21]/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/60 transition-all duration-300 hover:border-red-500/50">
        
        {/* Logo / Switcher Marca */}
        <div 
          onClick={() => setCurrentTab('storefront')}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 cursor-pointer group"
          title="Ir a Tienda Online"
        >
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-900/40 group-hover:scale-105 transition">
            <Flame size={18} />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-extrabold text-white leading-tight tracking-wide">WAgent</span>
            <span className="text-[9px] text-slate-400 font-medium leading-none">Suite 360°</span>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-slate-700/80 mx-1" />

        {/* Primary Navigation Buttons */}
        <div className="flex items-center gap-1">
          {primaryApps.map((app) => {
            const Icon = app.icon;
            const isActive = currentTab === app.id;
            return (
              <button
                key={app.id}
                onClick={() => setCurrentTab(app.id)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                  isActive 
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-102 font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
                title={app.label}
              >
                <Icon size={16} className={app.isAi ? 'text-amber-400' : ''} />
                <span>{app.label}</span>
                {app.badge > 0 && (
                  <span className="bg-emerald-500 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full min-w-[16px] text-center">
                    {app.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-[1px] bg-slate-700/80 mx-1" />

        {/* Botón Apps Extra / Más Módulos */}
        <div className="relative">
          <button
            onClick={() => {
              setIsExpandedMenuOpen(!isExpandedMenuOpen);
              setIsThemePickerOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium transition ${
              isExpandedMenuOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
            title="Más herramientas y módulos"
          >
            <Grid size={16} />
            <span>Módulos</span>
            {isExpandedMenuOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* Menú Popover Empaquetado */}
          {isExpandedMenuOpen && (
            <div className="absolute bottom-14 right-0 w-72 bg-[#182229] border border-slate-700 rounded-3xl p-3 shadow-2xl backdrop-blur-xl animate-fade-in z-50">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1 mb-1 border-b border-slate-800 flex items-center justify-between">
                <span>Herramientas Adicionales</span>
                <span className="text-[10px] text-red-400 font-mono">10 Apps</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto custom-scrollbar p-1">
                {secondaryApps.map((subApp) => {
                  const SubIcon = subApp.icon;
                  const isCurrent = currentTab === subApp.id;
                  return (
                    <button
                      key={subApp.id}
                      onClick={() => {
                        setCurrentTab(subApp.id);
                        setIsExpandedMenuOpen(false);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-xl text-left text-xs transition ${
                        isCurrent 
                          ? 'bg-red-600/30 text-red-300 font-bold border border-red-500/40' 
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <SubIcon size={15} className="shrink-0 text-slate-400" />
                      <span className="truncate">{subApp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Botón Selector de Temas / Personalización */}
        <div className="relative">
          <button
            onClick={() => {
              setIsThemePickerOpen(!isThemePickerOpen);
              setIsExpandedMenuOpen(false);
            }}
            className="p-2 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
            title="Personalizar Tema & Diseño"
          >
            <Palette size={16} />
          </button>

          {/* Popover Selector de Temas */}
          {isThemePickerOpen && (
            <div className="absolute bottom-14 right-0 w-64 bg-[#182229] border border-slate-700 rounded-3xl p-3 shadow-2xl backdrop-blur-xl animate-fade-in z-50">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-2 border-b border-slate-800">
                Temas del Sistema
              </div>
              <div className="space-y-1.5">
                {THEME_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTheme(t.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition ${
                      activeTheme === t.id 
                        ? 'bg-slate-800 text-white font-bold border border-red-500/40' 
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-4 h-4 rounded-full border border-white/20 shadow-inner" 
                        style={{ backgroundColor: t.accent }} 
                      />
                      <span>{t.name}</span>
                    </div>
                    {activeTheme === t.id && <Check size={14} className="text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Avatar Usuario / Acceso a Mi Cuenta */}
        <button
          onClick={onOpenCustomerPortal}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-white transition hover:border-red-500/50"
          title="Ver o Modificar Mi Cuenta (7/7 Datos)"
        >
          <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-[10px]">
            {isAiAgent ? '🤖' : (currentUser?.fullName?.[0] || currentUser?.name?.[0] || '👤')}
          </div>
          <span className="font-semibold max-w-[90px] truncate">
            {currentUser?.fullName || currentUser?.name || 'Mi Perfil'}
          </span>
        </button>

      </div>

      {/* ========================================================================= */}
      {/* MOBILE QUICK ACTION HEADER (Optimizado para teléfonos)                   */}
      {/* ========================================================================= */}
      <div className="lg:hidden fixed top-3 right-3 z-40 flex items-center gap-1.5">
        <button
          onClick={() => setIsThemePickerOpen(!isThemePickerOpen)}
          className="w-9 h-9 rounded-2xl bg-[#182229]/90 backdrop-blur-md border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center shadow-lg"
          title="Tema"
        >
          <Palette size={16} />
        </button>
        <button
          onClick={onOpenCustomerPortal}
          className="w-9 h-9 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-900/40 font-bold text-xs"
          title="Mi Cuenta"
        >
          {currentUser?.fullName?.[0] || '👤'}
        </button>
      </div>

      {/* Popover Tema Mobile */}
      {isThemePickerOpen && (
        <div className="lg:hidden fixed top-14 right-3 z-50 w-56 bg-[#182229] border border-slate-700 rounded-3xl p-3 shadow-2xl animate-fade-in">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pb-1 mb-1 border-b border-slate-800">
            Temas
          </div>
          {THEME_PRESETS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTheme(t.id)}
              className="w-full flex items-center justify-between p-2 rounded-xl text-xs text-slate-300 hover:text-white"
            >
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.accent }} />
                <span>{t.name}</span>
              </div>
              {activeTheme === t.id && <Check size={13} className="text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
