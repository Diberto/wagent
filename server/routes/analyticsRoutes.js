import express from 'express';
import { analyticsAiService } from '../services/analyticsAiService.js';
import { db } from '../services/database.js';

export const analyticsRouter = express.Router();

/**
 * GET /api/analytics/enhanced-stats
 * Retorna métricas analíticas 360: Facturación, márgenes MAG gancho,
 * distribución horaria, desglose canales, sucursales, top cortes y retención RFM.
 */
analyticsRouter.get('/enhanced-stats', (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || '',
      branchId: req.query.branchId || 'all',
      channel: req.query.channel || 'all',
      category: req.query.category || 'all'
    };

    const stats = analyticsAiService.getEnhancedStats(filters);
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas avanzadas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/analytics/ai-copilot
 * Consulta interactiva con el Agente de Inteligencia de Negocios (BI)
 */
analyticsRouter.post('/ai-copilot', async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query es requerida' });
    }

    const result = await analyticsAiService.queryBiAgent({ query, filters });
    const answerText = typeof result === 'object' ? (result.answer || '') : String(result);
    res.json({
      success: true,
      query,
      answer: answerText,
      keyMetrics: result?.keyMetrics || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en BI Copilot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/analytics/custom-report
 * Genera informes personalizados según tipo, rango de fechas y dimensiones
 */
analyticsRouter.post('/custom-report', (req, res) => {
  try {
    const {
      reportType = 'sales_by_cut', // 'sales_by_cut' | 'branch_profitability' | 'hourly_volume' | 'supplier_expenses' | 'rfm_customers'
      fromDate,
      toDate,
      branchId = 'all',
      channel = 'all'
    } = req.body;

    const stats = analyticsAiService.getEnhancedStats({ fromDate, toDate, branchId, channel });
    const database = db.readDb();

    let title = 'Informe Personalizado WAgent';
    let headers = [];
    let rows = [];

    switch (reportType) {
      case 'sales_by_cut':
        title = 'Ventas y Rentabilidad Estimada por Corte de Carne';
        headers = ['Corte / Producto', 'Categoría', 'Kg Vendidos', 'Precio Promedio / Kg', 'Facturación Bruta', 'Margen Estimado ($)', 'Margen %'];
        rows = (stats.topProducts || []).map(p => [
          p.name,
          p.category,
          `${p.totalKgSold} kg`,
          `$${p.unitPrice?.toLocaleString('es-AR') || 0}`,
          `$${p.totalRevenue?.toLocaleString('es-AR') || 0}`,
          `$${p.marginEstimate?.toLocaleString('es-AR') || 0}`,
          `${p.marginPct || 0}%`
        ]);
        break;

      case 'branch_profitability':
        title = 'Rendimiento y Cuota de Mercado por Sucursal';
        headers = ['Sucursal', 'Facturación Total', 'Pedidos Despachados', 'Ticket Promedio', 'Cuota de Ventas %'];
        rows = (stats.branchStats || []).map(b => [
          b.name,
          `$${b.totalRevenue?.toLocaleString('es-AR') || 0}`,
          b.ordersCount,
          `$${b.averageTicket?.toLocaleString('es-AR') || 0}`,
          `${b.sharePct}%`
        ]);
        break;

      case 'hourly_volume':
        title = 'Distribución Horaria de Facturación y Carga de Pedidos';
        headers = ['Franja Horaria', 'Facturación ($)', 'Cantidad de Pedidos', 'Ticket Promedio'];
        rows = (stats.hourlyDistribution || []).map(h => [
          h.hour,
          `$${h.revenue?.toLocaleString('es-AR') || 0}`,
          h.count,
          `$${h.avgTicket?.toLocaleString('es-AR') || 0}`
        ]);
        break;

      case 'supplier_expenses':
        title = 'Auditoría de Compras de Frigoríficos y Comprobantes';
        headers = ['Fecha', 'Proveedor', 'Tipo Comprobante', 'N° Comprobante', 'Monto Total', 'Estado'];
        const invoices = database.supplierInvoices || [];
        rows = invoices.map(inv => [
          inv.date ? new Date(inv.date).toLocaleDateString('es-AR') : 'S/D',
          inv.supplierName || 'Frigorífico / Proveedor',
          inv.invoiceType || 'Factura A',
          inv.invoiceNumber || 'S/N',
          `$${(Number(inv.totalAmount) || 0).toLocaleString('es-AR')}`,
          inv.status || 'Registrado'
        ]);
        break;

      case 'rfm_customers':
        title = 'Segmentación RFM y Fidelización de Clientes';
        headers = ['Segmento', 'Descripción', 'Cantidad Clientes', '% del Total'];
        const rfm = stats.customerRetention || {};
        rows = [
          ['Campeones (Frecuentes VIP)', 'Clientes que compran semanalmente y alto ticket', rfm.vip?.count || 0, `${rfm.vip?.pct || 0}%`],
          ['Recurrentes Leales', 'Compran regularmente todos los meses', rfm.recurrent?.count || 0, `${rfm.recurrent?.pct || 0}%`],
          ['En Riesgo de Abandono', 'Más de 45 días sin realizar compras', rfm.atRisk?.count || 0, `${rfm.atRisk?.pct || 0}%`],
          ['Nuevos / Única Compra', 'Primera compra en los últimos 30 días', rfm.newClients?.count || 0, `${rfm.newClients?.pct || 0}%`]
        ];
        break;

      default:
        title = 'Resumen Ejecutivo Multidimensional';
        headers = ['Indicador KPI', 'Valor'];
        rows = [
          ['Facturación Total', `$${stats.summary.totalRevenue.toLocaleString('es-AR')}`],
          ['Total de Pedidos', stats.summary.totalOrders],
          ['Ticket Promedio', `$${stats.summary.averageTicket.toLocaleString('es-AR')}`],
          ['Margen Bruto Estimado', `$${stats.summary.estimatedGrossProfit.toLocaleString('es-AR')} (${stats.summary.estimatedGrossMarginPct}%)`],
          ['Compras Registradas a Frigoríficos', `$${stats.summary.totalExpensesInvoices.toLocaleString('es-AR')}`]
        ];
    }

    res.json({
      success: true,
      report: {
        type: reportType,
        title,
        generatedAt: new Date().toISOString(),
        filters: { fromDate, toDate, branchId, channel },
        summary: stats.summary,
        headers,
        rows
      }
    });
  } catch (error) {
    console.error('❌ Error generando informe personalizado:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
