import { db } from './database.js';
import { systemMonitor } from './systemMonitor.js';

class MultiAgentOpsService {
  constructor() {
    this.agents = [
      {
        id: 'agent_carlos',
        name: 'Carlos Asesor',
        role: 'Líder de Ventas & Atención al Cliente',
        avatar: '🥩',
        status: 'active',
        aiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        aiTemperature: 0.7,
        skills: ['Ventas en WhatsApp', 'Cotización de Cortes', 'Cierre de Pedidos', 'Manejo de Objeciones'],
        personality: 'Enérgico, cordial, especialista en venta de asados y atención personalizada.'
      },
      {
        id: 'agent_chef_mateo',
        name: 'Chef Don Mateo',
        role: 'Sommelier de Carnes & Asesor Gastronómico',
        avatar: '👨‍🍳',
        status: 'active',
        aiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        aiTemperature: 0.8,
        skills: ['Recetas Tradicionales Argentinas', 'Cálculo de Comensales', 'Reemplazo de Cortes', 'Maridaje y Acompañamientos'],
        personality: 'Cálido, didáctico, experto en guisos, milanesas, horno, empanadas y cortes criollos.'
      },
      {
        id: 'agent_stock_inspector',
        name: 'Inspector Stock',
        role: 'Auditor de Inventario, Balanzas & PLUs',
        avatar: '📦',
        status: 'active',
        aiProvider: 'openai',
        aiModel: 'gpt-4o-mini',
        aiTemperature: 0.2,
        skills: ['Alertas de Stock Mínimo', 'Detección de Cortes Faltantes', 'Validación de PLU / Código de Barras', 'Sugerencias de Promociones'],
        personality: 'Metódico, analítico, enfocado en consistencia de precios y disponibilidad de góndola.'
      },
      {
        id: 'agent_devops',
        name: 'DevOps Ops',
        role: 'Optimizador de Sistema, Memoria & Concurrencia',
        avatar: '⚡',
        status: 'active',
        aiProvider: 'deepseek',
        aiModel: 'deepseek-chat',
        aiTemperature: 0.2,
        skills: ['Monitoreo de CPU/RAM', 'Compactación de Base de Datos', 'Detección de Cuellos de Botella', 'Diagnóstico de Módulos'],
        personality: 'Técnico, veloz, enfocado en alta disponibilidad y resiliencia de servidor.'
      }
    ];

    this.teamChatHistory = [];
  }

  getAgents() {
    const dbAgents = db.getAgents() || [];
    if (dbAgents.length === 0) {
      return this.agents;
    }
    // Combinar agentes predeterminados con los de la base de datos
    return this.agents.map(a => {
      const dbMatch = dbAgents.find(da => da.id === a.id);
      return dbMatch ? { ...a, ...dbMatch } : a;
    });
  }

  getTeamChatHistory() {
    return this.teamChatHistory;
  }

  async processTeamMessage({ message, targetAgentId = 'all', user = 'Administrador' }) {
    const userEntry = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender: user,
      senderRole: 'Admin',
      content: message,
      timestamp: new Date().toISOString(),
      isAgent: false
    };
    this.teamChatHistory.push(userEntry);

    const products = db.getProducts() || [];
    const orders = db.getOrders() || [];
    const recipes = db.getRecipes ? db.getRecipes() : [];
    const settings = db.getSettings() || {};
    const textLower = message.toLowerCase();

    const responses = [];

    // 1. CHEF DON MATEO (Gastronomía, recetas, cortes para comidas de casa)
    if (targetAgentId === 'all' || targetAgentId === 'agent_chef_mateo' || /receta|cocinar|comida|guiso|milanesa|horno|estofado|plato|comensales|reemplazo/i.test(textLower)) {
      let reply = '';
      if (/receta|guiso|milanesa|pastel|estofado/i.test(textLower)) {
        reply = `👨‍🍳 **Don Mateo aquí:** ¡Excelente consulta! Tenemos ${recipes.length} recetas tradicionales cargadas y enlazadas a los cortes del catálogo. Si el cliente no quiere asado y busca algo familiar, siempre le recomiendo: 1) Milanesas de Nalga/Bola de Lomo (PLU 2021), 2) Guiso Carrero con Roast Beef u Osobuco, o 3) Pastel de Papa con Picada Especial. ¡Con 250g a 300g por persona comen como reyes!`;
      } else {
        reply = `👨‍🍳 **Don Mateo aquí:** Estoy listo para sugerir preparaciones familiares, maridajes o calcular cantidades por comensal para cualquier plato que pida el cliente.`;
      }
      responses.push({
        agentId: 'agent_chef_mateo',
        agentName: 'Chef Don Mateo',
        avatar: '👨‍🍳',
        role: 'Sommelier de Carnes',
        aiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        content: reply
      });
    }

    // 2. INSPECTOR STOCK (Auditoría de inventario, faltantes, PLU)
    if (targetAgentId === 'all' || targetAgentId === 'agent_stock_inspector' || /stock|inventario|falta|agotado|plu|precio|promocion|combo/i.test(textLower)) {
      const outOfStock = products.filter(p => p.stockControl && (Number(p.stockQuantity ?? p.stock ?? 0) <= 0));
      const lowStock = products.filter(p => p.stockControl && (Number(p.stockQuantity ?? p.stock ?? 0) > 0 && Number(p.stockQuantity ?? p.stock ?? 0) <= Number(p.stockMinAlert ?? 5)));
      
      let reply = `📦 **Inspector Stock reportando:** Analicé el catálogo de ${products.length} productos:\n` +
        `• ✅ Productos disponibles en tienda: ${products.filter(p => p.availableInStore !== false).length}\n` +
        `• 📱 Productos activos en WhatsApp: ${products.filter(p => p.availableInWhatsApp !== false).length}\n` +
        `• ⚠️ Cortes con stock bajo: ${lowStock.length} items\n` +
        `• 🚫 Cortes agotados: ${outOfStock.length} items.`;

      if (outOfStock.length > 0) {
        reply += `\n💡 Sugiero ofrecer cortes alternativos equivalentes de la misma categoría para no perder ventas.`;
      }

      responses.push({
        agentId: 'agent_stock_inspector',
        agentName: 'Inspector Stock',
        avatar: '📦',
        role: 'Auditor de Inventario',
        aiProvider: 'openai',
        aiModel: 'gpt-4o-mini',
        content: reply
      });
    }

    // 3. DEVOPS OPS (Rendimiento, base de datos, memoria)
    if (targetAgentId === 'all' || targetAgentId === 'agent_devops' || /servidor|memoria|ram|cpu|rendimiento|base de datos|optimiz|limpieza|concurrencia|lag/i.test(textLower)) {
      const sysMetrics = await systemMonitor.getFullSystemMetrics();
      const reply = `⚡ **DevOps Ops reportando:** Estado de infraestructura:\n` +
        `• CPU: ${sysMetrics.system.cpuCount} núcleos | Carga: ${sysMetrics.history[sysMetrics.history.length - 1]?.cpuUsagePercent || 15}%\n` +
        `• Memoria RAM: ${sysMetrics.process.heapUsedMb} MB Heap Usado / ${sysMetrics.system.totalMemoryGb} GB Total (${sysMetrics.system.memoryUsedPercent}% ocupado)\n` +
        `• Conexiones WebSockets activas: ${sysMetrics.process.activeSocketConnections}\n` +
        `• Tamaño Base de Datos: ${sysMetrics.storage.dbSizeFormatted} | Archivos Media: ${sysMetrics.storage.mediaCount} (${sysMetrics.storage.mediaSizeFormatted})\n` +
        `🚀 El buffer In-Memory con persistencia Write-Behind garantiza alta concurrencia sin bloqueos de I/O.`;

      responses.push({
        agentId: 'agent_devops',
        agentName: 'DevOps Ops',
        avatar: '⚡',
        role: 'Optimizador de Sistema',
        aiProvider: 'deepseek',
        aiModel: 'deepseek-chat',
        content: reply
      });
    }

    // 4. CARLOS (Ventas, pedidos, atención)
    if (targetAgentId === 'all' || targetAgentId === 'agent_carlos' || responses.length === 0 || /venta|pedido|cliente|conversacion|cerrar|bot|atencion|modo/i.test(textLower)) {
      const pendingOrders = orders.filter(o => ['pending', 'preparing'].includes(o.status));
      const personality = settings.agentPersonalityMode || 'balanced';
      const modeLabels = {
        strict_sales: '🎯 Modo Estricto (Ventas 100%)',
        balanced: '⚖️ Modo Intermedio (Asesor Equilibrado)',
        human_empathetic: '🤝 Modo Humano (Empático con Encauce)'
      };

      const reply = `🥩 **Carlos Asesor:** ¡Todo bajo control en la trinchera comercial!\n` +
        `• Modo de Atención actual: ${modeLabels[personality] || modeLabels.balanced}\n` +
        `• Pedidos activos en preparación: ${pendingOrders.length}\n` +
        `• Estrategia: Cuando el cliente pide asado le calculamos 500g/persona con carbón y combos. Si pide cocina de casa, Mateo entra en acción sugiriendo milanesas, guisos o bifes rápidos para no perder la venta jamás.`;

      responses.push({
        agentId: 'agent_carlos',
        agentName: 'Carlos Asesor',
        avatar: '🥩',
        role: 'Líder Comercial',
        aiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        content: reply
      });
    }

    // Guardar respuestas en el historial
    responses.forEach(r => {
      this.teamChatHistory.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        sender: r.agentName,
        senderRole: r.role,
        avatar: r.avatar,
        aiProvider: r.aiProvider,
        aiModel: r.aiModel,
        content: r.content,
        timestamp: new Date().toISOString(),
        isAgent: true,
        agentId: r.agentId
      });
    });

    if (this.teamChatHistory.length > 100) {
      this.teamChatHistory = this.teamChatHistory.slice(-100);
    }

    return {
      userMessage: userEntry,
      agentResponses: responses
    };
  }

  async executeTask({ taskId, taskType, parameters = {} }) {
    switch (taskType) {
      case 'optimize_db':
        return systemMonitor.optimizeDatabase();
      case 'clear_cache':
        return systemMonitor.clearMemoryCaches();
      case 'audit_stock':
        const products = db.getProducts();
        const lowStock = products.filter(p => p.stockControl && (Number(p.stockQuantity ?? p.stock ?? 0) <= Number(p.stockMinAlert ?? 5)));
        return {
          success: true,
          lowStockCount: lowStock.length,
          items: lowStock.map(p => ({ id: p.id, name: p.name, stock: p.stockQuantity ?? p.stock, min: p.stockMinAlert }))
        };
      case 'seed_recipes':
        if (db.seedRecipes) {
          const seeded = db.seedRecipes(true);
          return { success: true, count: seeded.length, recipes: seeded };
        }
        return { success: true, message: 'Recetas ya cargadas.' };
      default:
        return { success: false, error: 'Tipo de tarea no reconocido' };
    }
  }
}

export const multiAgentOps = new MultiAgentOpsService();
