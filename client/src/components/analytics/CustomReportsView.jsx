import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Filter,
  Calendar,
  Store,
  Share2,
  Printer,
  Table,
  CheckCircle2,
  FileText,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react';

export default function CustomReportsView({ stats, branches = [] }) {
  const [reportType, setReportType] = useState('sales_by_cut');
  const [dateRange, setDateRange] = useState('30d'); // 'today' | '7d' | '30d' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState('all');

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch report when filters change
  const fetchReport = async () => {
    setLoading(true);
    let fromDate = '';
    let toDate = '';

    const now = new Date();
    if (dateRange === 'today') {
      fromDate = now.toISOString().split('T')[0];
      toDate = fromDate;
    } else if (dateRange === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      fromDate = past.toISOString().split('T')[0];
      toDate = now.toISOString().split('T')[0];
    } else if (dateRange === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      fromDate = past.toISOString().split('T')[0];
      toDate = now.toISOString().split('T')[0];
    } else if (dateRange === 'custom') {
      fromDate = customFrom;
      toDate = customTo;
    }

    try {
      const res = await fetch('/api/analytics/custom-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType,
          fromDate,
          toDate,
          branchId: selectedBranch,
          channel: selectedChannel
        })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReportData(data.report);
      }
    } catch (err) {
      console.error('Error cargando informe:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, dateRange, selectedBranch, selectedChannel]);

  // Exportar a Excel (.xlsx) con SheetJS
  const exportToExcel = () => {
    if (!reportData || !reportData.headers || !reportData.rows) return;

    const worksheetData = [
      [reportData.title],
      [`Generado: ${new Date().toLocaleString('es-AR')}`],
      [],
      reportData.headers,
      ...reportData.rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Informe WAgent');

    // Generar archivo y descargar
    const filename = `Informe_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Exportar a CSV
  const exportToCsv = () => {
    if (!reportData || !reportData.headers || !reportData.rows) return;

    const csvContent = [
      reportData.headers.join(','),
      ...reportData.rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Informe_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir reporte
  const handlePrint = () => {
    window.print();
  };

  // Filtrado local por término de búsqueda en la tabla
  const filteredRows = (reportData?.rows || []).filter(row => {
    if (!searchTerm) return true;
    return row.some(cell => String(cell).toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const templates = [
    { id: 'sales_by_cut', name: '🥩 Cortes y Rentabilidad', desc: 'Kg vendidos, facturación y márgenes por corte' },
    { id: 'branch_profitability', name: '🏢 Ventas por Sucursal', desc: 'Cuota de mercado, ticket medio y volumen' },
    { id: 'hourly_volume', name: '🕒 Carga y Horas Pico', desc: 'Distribución horaria para reforzar mostrador' },
    { id: 'supplier_expenses', name: '🧾 Compras a Frigoríficos', desc: 'Auditoría de facturas y gastos operativos' },
    { id: 'rfm_customers', name: '👥 Retención y Clientes RFM', desc: 'Segmentos VIP, leales y en riesgo' }
  ];

  return (
    <div className="space-y-6">
      {/* Selector de Plantillas de Informe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => setReportType(tpl.id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              reportType === tpl.id
                ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10 text-white ring-1 ring-cyan-500/50'
                : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <div className="font-bold text-xs flex items-center justify-between mb-1">
              <span>{tpl.name}</span>
              {reportType === tpl.id && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{tpl.desc}</p>
          </button>
        ))}
      </div>

      {/* Barra de Filtros Personalizados y Acciones de Exportación */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Período */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-slate-800 text-xs text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
            >
              <option value="today">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 border border-slate-700"
              />
              <span className="text-xs text-slate-500">hasta</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 border border-slate-700"
              />
              <button
                onClick={fetchReport}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs"
              >
                Aplicar
              </button>
            </div>
          )}

          {/* Sucursal */}
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-indigo-400" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-slate-800 text-xs text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todas las Sucursales</option>
              {branches.map((b) => (
                <option key={b.id || b.name} value={b.id || b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Canal */}
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-slate-800 text-xs text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todos los Canales</option>
              <option value="pos">POS Mostrador</option>
              <option value="whatsapp">WhatsApp Bot / CRM</option>
              <option value="web">Web / E-commerce</option>
            </select>
          </div>
        </div>

        {/* Acciones de Exportación */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold shadow-md transition-all"
            title="Descargar en formato Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Exportar Excel
          </button>

          <button
            onClick={exportToCsv}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all"
            title="Descargar en formato CSV"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>

          <button
            onClick={handlePrint}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title="Imprimir o guardar como PDF"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenido del Reporte: Tabla y Búsqueda */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800/80 bg-slate-900/80">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              {reportData?.title || 'Generando informe...'}
            </h4>
            <span className="text-[11px] text-slate-400">
              {filteredRows.length} registros encontrados
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en la tabla..."
              className="bg-slate-800/90 text-xs text-white pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Consolidando datos y calculando márgenes...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  {(reportData?.headers || []).map((header, idx) => (
                    <th key={idx} className="py-3 px-4">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.length > 0 ? (
                  filteredRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-slate-800/40 transition-colors text-slate-200"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-3 px-4 ${
                            cIdx === 0
                              ? 'font-medium text-white'
                              : String(cell).startsWith('$')
                              ? 'text-emerald-400 font-mono font-medium'
                              : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={reportData?.headers?.length || 4}
                      className="py-8 text-center text-slate-500"
                    >
                      No se encontraron registros para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
