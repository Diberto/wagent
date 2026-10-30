import {
  MessageSquare,
  Kanban,
  Users,
  PhoneCall,
  PackageCheck,
  Bike,
  Store,
  Calculator,
  ShoppingBag,
  Globe,
  Sparkles,
  Tag,
  ChefHat,
  Camera,
  Boxes,
  Brain,
  Bot,
  BookOpen,
  Send,
  Zap,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Settings,
  Receipt,
  RefreshCw,
  Cpu,
  UserCheck,
  Database,
  Activity,
  FileText
} from 'lucide-react';

export const NAVIGATION_HUBS = [
  {
    id: 'crm',
    title: 'Atención & CRM',
    shortTitle: 'Atención',
    description: 'Chats omnicanal, embudo comercial y gestión de clientes',
    icon: MessageSquare,
    defaultTab: 'inbox',
    subTabs: [
      { id: 'inbox', label: 'WhatsApp Chats', shortLabel: 'Chats', icon: MessageSquare, badgeKey: 'unreadCount' },
      { id: 'kanban', label: 'Embudo de Ventas', shortLabel: 'Embudo', icon: Kanban },
      { id: 'customers', label: 'Clientes CRM', shortLabel: 'Clientes', icon: Users },
      { id: 'callcenter', label: 'Centro de Voz (ElevenLabs)', shortLabel: 'Llamadas', icon: PhoneCall }
    ]
  },
  {
    id: 'orders_hub',
    title: 'Pedidos & Despacho',
    shortTitle: 'Pedidos',
    description: 'Ventas, logística vial, asignación de cadetes y sucursales',
    icon: PackageCheck,
    defaultTab: 'orders',
    subTabs: [
      { id: 'orders', label: 'Pedidos & Ventas', shortLabel: 'Pedidos', icon: PackageCheck },
      { id: 'drivers', label: 'Repartidores & Cadetes', shortLabel: 'Reparto', icon: Bike },
      { id: 'branches', label: '6 Sucursales Córdoba', shortLabel: 'Sucursales', icon: Store }
    ]
  },
  {
    id: 'pos_catalog',
    title: 'POS & Catálogo',
    shortTitle: 'POS',
    description: 'Venta de mostrador, catálogo con PLU, tienda online y fidelización',
    icon: Calculator,
    defaultTab: 'pos',
    subTabs: [
      { id: 'pos', label: 'POS Mostrador', shortLabel: 'Mostrador', icon: Calculator },
      { id: 'catalog', label: 'Cortes & Catálogo PLU', shortLabel: 'Catálogo', icon: ShoppingBag },
      { id: 'storefront', label: 'Tienda Web', shortLabel: 'Tienda', icon: Globe },
      { id: 'loyalty', label: 'Club de Fidelización', shortLabel: 'Club', icon: Sparkles, highlight: true },
      { id: 'coupons', label: 'Cupones & Promos', shortLabel: 'Cupones', icon: Tag },
      { id: 'recipes', label: 'Recetas Tradicionales', shortLabel: 'Recetas', icon: ChefHat }
    ]
  },
  {
    id: 'logistics_ocr',
    title: 'OCR Grupos & Stock',
    shortTitle: 'OCR Grupos',
    description: 'Pedidos internos silenciosos, auditoría de remitos y stock',
    icon: Camera,
    defaultTab: 'silent-group',
    subTabs: [
      { id: 'silent-group', label: 'Grupo Silencioso OCR', shortLabel: 'OCR Grupos', icon: Camera, badge: 'Sucursales ↔ Admin', highlight: true },
      { id: 'stock-transfers', label: 'Stock & Traspasos', shortLabel: 'Stock', icon: Boxes }
    ]
  },
  {
    id: 'ai_growth',
    title: 'IA & Crecimiento',
    shortTitle: 'IA',
    description: 'Agentes neuronales, automatizaciones y campañas de difusión',
    icon: Brain,
    defaultTab: 'agents',
    subTabs: [
      { id: 'agents', label: 'Agentes & Personalidades', shortLabel: 'Agentes', icon: Bot },
      { id: 'multi-agent', label: 'Team Multi-Agente Ops', shortLabel: 'Multi-Agente', icon: Users },
      { id: 'knowledge', label: 'Base de Conocimiento (RAG)', shortLabel: 'Conocimiento', icon: BookOpen },
      { id: 'neural-memory', label: 'Red Neuronal & Grafo', shortLabel: 'Red Neuronal', icon: Brain },
      { id: 'campaigns', label: 'Difusiones & Campañas', shortLabel: 'Difusión', icon: Send },
      { id: 'automations', label: 'Automatizaciones', shortLabel: 'Reglas', icon: Zap },
      { id: 'analytics', label: 'Reportes & Métricas', shortLabel: 'Métricas', icon: BarChart3 },
      { id: 'meat-market', label: 'Mercado Ganadero & Precios', shortLabel: 'Mercado', icon: TrendingUp, badge: 'MAG/IPC', highlight: true }
    ]
  },
  {
    id: 'admin_control',
    title: 'Administración & Sistema',
    shortTitle: 'Ajustes',
    description: 'Configuraciones, seguridad, fiscal, conectores y base persistente',
    icon: ShieldCheck,
    defaultTab: 'admin',
    subTabs: [
      { id: 'admin', label: 'Ajustes Generales', shortLabel: 'Ajustes', icon: Settings },
      { id: 'arca', label: 'ARCA / AFIP Fiscal', shortLabel: 'ARCA', icon: Receipt },
      { id: 'woo', label: 'WooCommerce Sync', shortLabel: 'Woo', icon: RefreshCw },
      { id: 'api-mcp', label: 'API Externa & MCP', shortLabel: 'API / MCP', icon: Cpu },
      { id: 'users', label: 'Usuarios & Permisos', shortLabel: 'Usuarios', icon: UserCheck },
      { id: 'database', label: 'Bóveda Persistente & SQLite', shortLabel: 'Base Datos', icon: Database },
      { id: 'system-health', label: 'Salud del Sistema', shortLabel: 'Salud', icon: Activity },
      { id: 'system-logs', label: 'Logs de Auditoría', shortLabel: 'Logs', icon: FileText }
    ]
  }
];

export function findHubForTab(tabId) {
  if (!tabId) return NAVIGATION_HUBS[0];
  for (const hub of NAVIGATION_HUBS) {
    if (hub.defaultTab === tabId || hub.subTabs.some(st => st.id === tabId)) {
      return hub;
    }
  }
  return NAVIGATION_HUBS[0];
}

