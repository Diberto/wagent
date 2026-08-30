import React from 'react';
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
  Store
} from 'lucide-react';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  whatsappStatus, 
  onOpenQR, 
  onOpenSettings,
  onOpenCallModal,
  unreadCount = 0
}) {
  const tabs = [
    { id: 'inbox', label: 'Mensajes & Audios', icon: MessageSquare, badge: unreadCount },
    { id: 'orders', label: 'Pedidos', icon: PackageCheck },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'branches', label: 'Sucursales', icon: Store },
    { id: 'catalog', label: 'Catálogo', icon: ShoppingBag },
    { id: 'kanban', label: 'Embudo', icon: Kanban },
    { id: 'callcenter', label: 'Llamadas', icon: PhoneCall },
    { id: 'knowledge', label: 'Base de Conocimiento', icon: BookOpen },
    { id: 'analytics', label: 'Métricas', icon: BarChart3 },
  ];

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#111b21]/90 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between z-30 sticky top-0">
      
      {/* Brand & Logo */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('inbox')}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#0b141a] rounded-[15px] flex items-center justify-center text-emerald-400">
              <Bot size={22} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">WAgent</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                CRM IA
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block -mt-0.5">WhatsApp Sales & Voice</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-[#182229] p-1 rounded-2xl border border-slate-800">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
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

      {/* Right Actions & Status */}
      <div className="flex items-center gap-2.5">
        
        {/* Outbound Call Button */}
        <button
          onClick={onOpenCallModal}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 text-xs font-bold border border-slate-700/60 shadow-sm transition-all active:scale-95"
          title="Abrir Marcador Telefónico y Realizar Llamada de Voz"
        >
          <PhoneCall size={14} className="text-emerald-400" />
          <span className="hidden sm:inline">Hacer Llamada</span>
        </button>

        {/* WhatsApp QR / Connection Status Button */}
        <button
          onClick={onOpenQR}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
            whatsappStatus === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : whatsappStatus === 'qr_ready'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 animate-pulse'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
          }`}
        >
          <QrCode size={16} />
          <span className="hidden sm:inline">
            {whatsappStatus === 'connected' ? 'WhatsApp Conectado' : whatsappStatus === 'qr_ready' ? 'Escanear QR' : 'Conectar QR'}
          </span>
          <span className={`w-2 h-2 rounded-full ${
            whatsappStatus === 'connected' ? 'bg-emerald-400 animate-ping' : whatsappStatus === 'qr_ready' ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 transition-colors"
          title="Ajustes de IA, Prompts y Voces"
        >
          <Settings size={18} />
        </button>

      </div>
    </header>
  );
}
