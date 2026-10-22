import { db } from './database.js';
import { AIService } from './ai.js';
import { inventoryService } from './inventoryService.js';
import { meatMarketService } from './meatMarketService.js';

class AnalyticsAiService {
  constructor() {}

  // ==========================================
  // 1. MÉTRICAS EXTENDIDAS & RENTABILIDAD
  // ==========================================
  getEnhancedStats(filters = {}) {
    const database = db.readDb();
    const orders = database.orders || [];
    const products = database.products || [];
    const branches = db.getBranches ? db.getBranches() : (database.branches || []);
    const leads = database.leads || [];
    const invoices = database.supplierInvoices || [];

    const {
      fromDate,
      toDate,
      branchId,
      channel,
      category
    } = filters;

    // Filtrar pedidos
    const filteredOrders = orders.filter(o => {
      if (o.status === 'cancelled') return false;

      if (fromDate) {
        if (new Date(o.createdAt || o.date) < new Date(fromDate)) return false;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt || o.date) > end) return false;
      }

      if (branchId && branchId !== 'all') {
        const b = o.branchId || o.branch || o.branchName;
        if (b !== branchId) return false;
      }

      const orderChannel = o.channel || (o.notes?.includes('[POS Mostrador]') ? 'pos' : (o.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
      if (channel && channel !== 'all' && orderChannel !== channel) return false;

      return true;
    });

    // 1. Métricas Principales de Ventas
    const totalOrders = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount || o.total) || 0), 0);
    const averageTicket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // 2. Canales (WhatsApp vs POS vs Web)
    const channelBreakdown = {
      whatsapp: { name: 'WhatsApp Bot / CRM', count: 0, revenue: 0 },
      pos: { name: 'POS Mostrador', count: 0, revenue: 0 },
      web: { name: 'Tienda Online Web', count: 0, revenue: 0 }
    };

    filteredOrders.forEach(o => {
      const ch = o.channel || (o.notes?.includes('[POS Mostrador]') ? 'pos' : (o.notes?.includes('[WooCommerce]') ? 'web' : 'whatsapp'));
      const amt = Number(o.totalAmount || o.total) || 0;
      if (channelBreakdown[ch]) {
        channelBreakdown[ch].count += 1;
        channelBreakdown[ch].revenue += amt;
      } else {
        channelBreakdown.whatsapp.count += 1;
        channelBreakdown.whatsapp.revenue += amt;
      }
    });

    // 3. Distribución Horaria (0 a 23 hs)
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      orders: 0,
      count: 0,
      revenue: 0,
      avgTicket: 0
    }));

    filteredOrders.forEach(o => {
      try {
        const d = new Date(o.createdAt || o.date);
        const h = d.getHours();
        if (h >= 0 && h < 24) {
          const amt = Number(o.totalAmount || o.total) || 0;
          hourlyDistribution[h].orders += 1;
          hourlyDistribution[h].count += 1;
          hourlyDistribution[h].revenue += amt;
          hourlyDistribution[h].avgTicket = hourlyDistribution[h].count > 0 ? Math.round(hourlyDistribution[h].revenue / hourlyDistribution[h].count) : 0;
        }
      } catch {}
    });

    // 4. Rendimiento por Sucursal (para gráficos 3D y comparativas)
    const branchStats = branches.map(b => {
      const bOrders = filteredOrders.filter(o => (o.branchId || o.branch || o.branchName) === b.id || (o.branchId || o.branch || o.branchName) === b.name);
      const bRevenue = bOrders.reduce((sum, o) => sum + (Number(o.totalAmount || o.total) || 0), 0);
      const bAvgTicket = bOrders.length > 0 ? Math.round(bRevenue / bOrders.length) : 0;

      return {
        id: b.id,
        name: b.name,
        address: b.address || '',
        isWarehouse: b.isWarehouse || false,
        ordersCount: bOrders.length,
        totalRevenue: bRevenue,
        averageTicket: bAvgTicket,
        sharePct: totalRevenue > 0 ? Number(((bRevenue / totalRevenue) * 100).toFixed(1)) : 0
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // 5. Cortes Más Vendidos y Estimación de Rentabilidad
    const productStatsMap = new Map();
    filteredOrders.forEach(o => {
      const items = Array.isArray(o.products) ? o.products : (Array.isArray(o.items) ? o.items : []);
      items.forEach(it => {
        const name = typeof it === 'string' ? it : (it.name || it.productName || 'Corte');
        const qty = Number(it.quantity || 1);
        const price = Number(it.unitPrice || it.price || (it.totalPrice ? it.totalPrice / qty : 0));
        const subtotal = Number(it.totalPrice || (qty * price));

        if (!productStatsMap.has(name)) {
          productStatsMap.set(name, {
            name,
            totalKgSold: 0,
            revenue: 0,
            ordersCount: 0,
            unitPrice: price
          });
        }
        const record = productStatsMap.get(name);
        record.totalKgSold += qty;
        record.revenue += subtotal;
        record.ordersCount += 1;
        if (price > 0) record.unitPrice = price;
      });
    });

    // Enriquecer con margen estimado de desposte
    const mag = meatMarketService.getLivestockQuotes ? meatMarketService.getLivestockQuotes() : {};
    const costGancho = mag.estimatedCarcassCostPerKg || 4250;

    const topProducts = Array.from(productStatsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)
      .map(p => {
        // En carnicería vacuna argentina, el costo ponderado de desposte ronda el 60-70% del precio de mostrador
        const estimatedCost = Math.round(p.revenue * 0.62);
        const estimatedGrossMargin = p.revenue - estimatedCost;
        const marginPct = p.revenue > 0 ? Number(((estimatedGrossMargin / p.revenue) * 100).toFixed(1)) : 38.0;
        const roundedRevenue = Math.round(p.revenue);

        return {
          ...p,
          totalKgSold: Number(p.totalKgSold.toFixed(2)),
          revenue: roundedRevenue,
          totalRevenue: roundedRevenue,
          estimatedCost,
          estimatedGrossMargin,
          marginEstimate: estimatedGrossMargin,
          marginPct,
          unitPrice: p.unitPrice || (p.totalKgSold > 0 ? Math.round(roundedRevenue / p.totalKgSold) : 0)
        };
      });

    // 6. Facturas de Proveedores (Gastos de Compra según OCR Grupo Silencioso)
    const totalExpensesInvoices = invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount || inv.total) || 0), 0);
    const estimatedGrossProfitTotal = Math.round(totalRevenue * 0.38); // 38% margen bruto promedio de carnicería
    const estimatedNetOperatingProfit = Math.max(0, estimatedGrossProfitTotal - (totalExpensesInvoices * 0.15)); // Margen operativo deduciendo gastos

    // 7. Métricas de Clientes y Fidelización
    const totalCustomers = leads.length;
    const activeCustomersWithOrders = new Set(filteredOrders.map(o => o.phone || o.customerName)).size;
    const repurchaseRatePct = totalCustomers > 0 ? Number(((activeCustomersWithOrders / totalCustomers) * 100).toFixed(1)) : 0;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalOrders,
        totalRevenue,
        averageTicket,
        paidRevenue: totalRevenue,
        totalExpensesInvoices,
        estimatedGrossProfit: estimatedGrossProfitTotal,
        estimatedGrossMarginPct: 38.0,
        estimatedNetOperatingProfit,
        totalCustomers,
        activeCustomersWithOrders,
        repurchaseRatePct
      },
      channelBreakdown,
      hourlyDistribution,
      branchStats,
      topProducts,
      recentInvoicesCount: invoices.length,
      branchesCount: branches.length
    };
  }

  // ==========================================
  // 2. COPILOT BI: AGENTE ANALÍTICO CONVERSACIONAL
  // ==========================================
  async queryBiAgent({ query, filters = {}, currentUser = null }) {
    if (!query || typeof query !== 'string') {
      throw new Error('La consulta para el Copilot BI no puede estar vacía');
    }

    const stats = this.getEnhancedStats(filters);
    const mag = meatMarketService.getLivestockQuotes ? meatMarketService.getLivestockQuotes() : {};
    const retail = meatMarketService.getRetailBenchmark ? meatMarketService.getRetailBenchmark() : {};
    const macro = meatMarketService.fetchLiveMacroData ? await meatMarketService.fetchLiveMacroData() : {};

    // Contexto sintético estructurado para alimentar el LLM o el motor heurístico
    const contextPrompt = `
Sos el "Copilot BI & Estratega Analítico de WAgent Carnicería & Frigorífico".
Tu trabajo es responder preguntas de negocio, rentabilidad, rendimiento de cortes y desempeño de sucursales con precisión matemática, tono ejecutivo, datos concretos en pesos argentinos ($) y recomendaciones accionables.

DATOS DEL SISTEMA EN TIEMPO REAL:
- Ventas Totales: $${stats.summary.totalRevenue.toLocaleString('es-AR')} (${stats.summary.totalOrders} pedidos, Ticket promedio: $${stats.summary.averageTicket.toLocaleString('es-AR')})
- Margen Bruto Estimado: $${stats.summary.estimatedGrossProfit.toLocaleString('es-AR')} (~${stats.summary.estimatedGrossMarginPct}%)
- Facturas de Proveedores Registradas: $${stats.summary.totalExpensesInvoices.toLocaleString('es-AR')} (${stats.recentInvoicesCount} facturas procesadas con OCR)
- Canales:
  * POS Mostrador: $${stats.channelBreakdown.pos.revenue.toLocaleString('es-AR')} (${stats.channelBreakdown.pos.count} tickets)
  * WhatsApp CRM: $${stats.channelBreakdown.whatsapp.revenue.toLocaleString('es-AR')} (${stats.channelBreakdown.whatsapp.count} pedidos)
  * Tienda Online: $${stats.channelBreakdown.web.revenue.toLocaleString('es-AR')} (${stats.channelBreakdown.web.count} pedidos)
- Top Sucursales por Facturación:
${stats.branchStats.map((b, i) => `  ${i + 1}. ${b.name}: $${b.totalRevenue.toLocaleString('es-AR')} (${b.ordersCount} pedidos, ${b.sharePct}% del total)`).join('\n')}
- Top Cortes Vendidos:
${stats.topProducts.slice(0, 5).map((p, i) => `  ${i + 1}. ${p.name}: ${p.totalKgSold} kg ($${p.revenue.toLocaleString('es-AR')}, Margen: ${p.marginPct}%)`).join('\n')}
- Mercado Hacienda MAG (Cañuelas):
  * Índice Novillo (INMAG): $${mag.inmagIndex || 2345}/kg vivo
  * Costo Kilo Gancho Estimado: $${mag.estimatedCarcassCostPerKg || 4250}/kg media res
- Macroeconomía: Inflación IPC Alimentos mensual +${macro.meatCategoryInflationEst || 2.2}% (Interanual +${macro.yearlyInflation?.current || 33.4}%)

PREGUNTA DEL OPERADOR / GERENTE:
"${query}"

INSTRUCCIONES DE RESPUESTA:
1. Responde de forma concisa, directa y estructurada en Markdown.
2. Cita números reales tomados del contexto anterior (montos en $, porcentajes y kilos).
3. Si la pregunta es sobre una sucursal, corte o canal específico, enfocate en ese punto y compáralo con el promedio.
4. Concluye siempre con una "Sugerencia Estratégica Clave" para optimizar el margen o la rotación de carne.
`;

    let answerText = '';

    try {
      // Intentar procesar con el servicio de IA configurado en el sistema
      const s = db.getSettings ? db.getSettings() : {};
      const aiResponse = await AIService.callLLMGeneric({
        prompt: `PREGUNTA: ${query}\n\nDATOS DEL NEGOCIO:\n${contextPrompt}`,
        systemPrompt: 'Eres el Agente Copilot de Inteligencia de Negocios WAgent de República de la Carne. Responde de forma concisa, estructurada en Markdown con listas, citando números reales en $ y kg, y una recomendación estratégica final.',
        temperature: 0.2,
        maxTokens: 1000,
        settings: s
      });
      if (aiResponse && typeof aiResponse === 'string' && aiResponse.trim()) {
        answerText = aiResponse.trim();
      }
    } catch (e) {
      console.warn('[AnalyticsAiService] Fallback a motor heurístico local:', e.message);
    }

    // Si el LLM no está disponible o no hay API key, motor analítico heurístico determinista
    if (!answerText) {
      answerText = this.generateDeterministicInsight(query, stats, mag, retail, macro);
    }

    return {
      query,
      answer: answerText,
      timestamp: new Date().toISOString(),
      keyMetrics: {
        totalRevenue: stats.summary.totalRevenue,
        totalOrders: stats.summary.totalOrders,
        averageTicket: stats.summary.averageTicket,
        topBranch: stats.branchStats[0]?.name || 'Casa Central',
        topCut: stats.topProducts[0]?.name || 'Asado de Tira'
      }
    };
  }

  // Motor analítico local sin costo de API
  generateDeterministicInsight(query, stats, mag, retail, macro) {
    const q = query.toLowerCase();

    if (q.includes('corte') || q.includes('producto') || q.includes('vendido') || q.includes('rotacion')) {
      const top3 = stats.topProducts.slice(0, 3);
      return `### 🥩 Análisis de Cortes Más Vendidos y Rentabilidad

De acuerdo con las ventas registradas:

${top3.map((p, idx) => `* **#${idx + 1} ${p.name}**: Se vendieron **${p.totalKgSold} kg** generando **$${p.revenue.toLocaleString('es-AR')}** con un margen bruto estimado del **${p.marginPct}%**.`).join('\n')}

**💡 Sugerencia Estratégica:**
El corte **${top3[0]?.name || 'Asado'}** es el motor principal de rotación. Si la cotización de novillo en el MAG subió a **$${mag.inmagIndex || 2345}/kg**, considera mantener promociones cruzadas con cortes de menor salida (como Roast Beef o Paleta) para balancear el desposte de la media res sin perder margen.`;
    }

    if (q.includes('sucursal') || q.includes('local') || q.includes('tienda')) {
      const top = stats.branchStats[0];
      const bottom = stats.branchStats[stats.branchStats.length - 1];

      return `### 🏢 Desempeño Comparativo de Sucursales

* **Sucursal Líder**: **${top?.name || 'Central'}** con **$${top?.totalRevenue.toLocaleString('es-AR')}** facturados (**${top?.ordersCount}** pedidos, ticket medio: **$${top?.averageTicket.toLocaleString('es-AR')}**), representando el **${top?.sharePct}%** del total del negocio.
${bottom ? `* **Sucursal de Menor Volumen**: **${bottom.name}** con **$${bottom.totalRevenue.toLocaleString('es-AR')}** facturados.` : ''}

**💡 Sugerencia Estratégica:**
Activa campañas geolocalizadas por WhatsApp en el radio de influencia de **${bottom?.name || 'la sucursal con menor volumen'}** para traccionar clientes vecinales con cupones de bienvenida al Club de Fidelización.`;
    }

    if (q.includes('rentabilidad') || q.includes('margen') || q.includes('ganancia') || q.includes('balance') || q.includes('costo')) {
      return `### 💰 Balance Financiero y Estimación de Rentabilidad

* **Facturación Bruta**: **$${stats.summary.totalRevenue.toLocaleString('es-AR')}** (${stats.summary.totalOrders} pedidos).
* **Margen Bruto Estimado**: **$${stats.summary.estimatedGrossProfit.toLocaleString('es-AR')}** (~**${stats.summary.estimatedGrossMarginPct}%**).
* **Costo Kilo Gancho de Referencia (MAG)**: **$${mag.estimatedCarcassCostPerKg ? `$${mag.estimatedCarcassCostPerKg.toLocaleString('es-AR')}` : '$4.259'}** por kg de media res.
* **Facturas de Frigoríficos (Compras registradas)**: **$${stats.summary.totalExpensesInvoices.toLocaleString('es-AR')}**.

**💡 Sugerencia Estratégica:**
Con una inflación mensual de alimentos del **+${macro.meatCategoryInflationEst || 2.2}%**, mantén revisado el costo por kilo gancho cada semana para ajustar listas de mostrador antes de que impacte negativamente en el margen neto.`;
    }

    if (q.includes('horario') || q.includes('hora') || q.includes('pico') || q.includes('cuando')) {
      const sortedHours = [...stats.hourlyDistribution].sort((a, b) => b.revenue - a.revenue);
      const peak1 = sortedHours[0];
      const peak2 = sortedHours[1];

      return `### 🕒 Franjas Horarias de Mayor Demanda

Los picos de mayor facturación en el sistema ocurren a las:
* **${peak1?.hour}**: Mayor concentración de ventas (**$${peak1?.revenue.toLocaleString('es-AR')}**).
* **${peak2?.hour}**: Segundo pico de demanda (**$${peak2?.revenue.toLocaleString('es-AR')}**).

**💡 Sugerencia Estratégica:**
Refuerza el personal de mostrador y la atención de WhatsApp 45 minutos antes de las **${peak1?.hour}** para minimizar los tiempos de espera y evitar pedidos cancelados en horas pico.`;
    }

    // Respuesta general de síntesis ejecutiva
    return `### 📊 Resumen Ejecutivo del Negocio WAgent

* **Ventas Totales**: **$${stats.summary.totalRevenue.toLocaleString('es-AR')}** distribuidas en **${stats.summary.totalOrders} pedidos**.
* **Ticket Promedio**: **$${stats.summary.averageTicket.toLocaleString('es-AR')}** por transacción.
* **Canal Más Rentable**: **${stats.channelBreakdown.pos.revenue >= stats.channelBreakdown.whatsapp.revenue ? 'POS Mostrador' : 'WhatsApp Bot'}** con **$${Math.max(stats.channelBreakdown.pos.revenue, stats.channelBreakdown.whatsapp.revenue).toLocaleString('es-AR')}**.
* **Corte Estrella**: **${stats.topProducts[0]?.name || 'Asado'}** con **${stats.topProducts[0]?.totalKgSold || 0} kg** despachados.
* **Costo de Gancho MAG**: **$${mag.estimatedCarcassCostPerKg || 4250}/kg**.

**💡 Sugerencia Estratégica:**
Tu operación muestra una sólida participación entre ventas de mostrador y pedidos automatizados por WhatsApp. Para aumentar el ticket promedio un 10%, implementa combos inteligentes de asado (corte primario + embutido + carbón) sugeridos automáticamente por el bot de IA.`;
  }
}

export const analyticsAiService = new AnalyticsAiService();
