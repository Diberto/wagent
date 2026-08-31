import React, { useState, useRef } from 'react';
import { 
  Printer, 
  X, 
  Send, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  Receipt, 
  Flame, 
  Truck, 
  Store, 
  User, 
  Phone, 
  MapPin, 
  Calendar,
  Sparkles,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck
} from 'lucide-react';
import { parseOrderItems } from './OrdersView.jsx';

export default function TicketPrintModal({ order, onClose, businessInfo = null }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [printFormat, setPrintFormat] = useState('thermal80'); // 'thermal80' | 'thermal58' | 'butcher' | 'a4'
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isEmitting, setIsEmitting] = useState(false);
  const [showEmissionModal, setShowEmissionModal] = useState(false);
  const [emissionForm, setEmissionForm] = useState({
    documentType: 'factura_b', // 'factura_b' | 'factura_a' | 'factura_c' | 'presupuesto'
    customerDocType: (order.customerDoc && order.customerDoc.length === 11) ? 'CUIT' : 'DNI',
    customerDoc: order.customerDoc || '',
    customerName: order.customerName || 'Consumidor Final'
  });

  const ticketRef = useRef(null);

  if (!currentOrder) return null;

  const invoice = currentOrder.invoice || null;

  const info = {
    name: invoice?.emisorRazonSocial || 'REPÚBLICA DE LA CARNE S.R.L.',
    fantasyName: invoice?.emisorNombreFantasia || 'República de la Carne',
    slogan: 'La calidad nos hace diferentes',
    cuit: invoice?.emisorCuit ? `${invoice.emisorCuit.slice(0,2)}-${invoice.emisorCuit.slice(2,10)}-${invoice.emisorCuit.slice(10)}` : '30-71689234-8',
    iibb: invoice?.emisorIibb || '901-283746-1',
    ivaCondition: invoice?.emisorIva || 'IVA Responsable Inscripto',
    startActivity: invoice?.emisorInicio || '01/03/2020',
    whatsapp: '+54 9 351 626-2475',
    address: invoice?.emisorDireccion || (currentOrder.branchName ? `${currentOrder.branchName} • Córdoba` : 'Av. José Roque Funes 1115, Urca, Córdoba'),
    ...businessInfo
  };

  const parsedItems = parseOrderItems(currentOrder);
  const orderDate = currentOrder.createdAt ? new Date(currentOrder.createdAt).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : new Date().toLocaleString('es-AR');

  const isDelivery = (currentOrder.deliveryType === 'delivery') || (!currentOrder.branch && !currentOrder.branchName && currentOrder.address && currentOrder.address !== 'Retiro en Sucursal');

  // Emitir Factura Electrónica ARCA
  const handleEmitInvoice = async (docType = emissionForm.documentType) => {
    setIsEmitting(true);
    try {
      const res = await fetch('/api/arca/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          documentType: docType,
          customerName: emissionForm.customerName || currentOrder.customerName,
          customerDoc: emissionForm.customerDoc,
          customerDocType: emissionForm.customerDocType,
          sendWhatsApp: false
        })
      });
      const data = await res.json();
      if (data.success && data.order) {
        setCurrentOrder(data.order);
        setShowEmissionModal(false);
      } else {
        alert(data.error || 'Error al emitir comprobante con ARCA');
      }
    } catch (err) {
      alert(`Error emitiendo comprobante: ${err.message}`);
    } finally {
      setIsEmitting(false);
    }
  };

  // Emitir Presupuesto (No Fiscal)
  const handleEmitPresupuesto = async () => {
    setIsEmitting(true);
    try {
      const res = await fetch('/api/arca/presupuesto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          customerName: emissionForm.customerName || currentOrder.customerName,
          customerDoc: emissionForm.customerDoc
        })
      });
      const data = await res.json();
      if (data.success && data.order) {
        setCurrentOrder(data.order);
        setShowEmissionModal(false);
      } else {
        alert(data.error || 'Error al emitir presupuesto');
      }
    } catch (err) {
      alert(`Error emitiendo presupuesto: ${err.message}`);
    } finally {
      setIsEmitting(false);
    }
  };

  // Generar texto plano del ticket para WhatsApp o portapapeles
  const getTicketPlainText = () => {
    const divider = '----------------------------------------';
    const itemsText = parsedItems.map(item => {
      const pluStr = item.plu ? `[PLU ${item.plu}] ` : '';
      return `${pluStr}${item.quantity} ${item.unit} x ${item.name} = $${Number(item.total).toLocaleString('es-AR')}`;
    }).join('\n');

    let ch = (currentOrder.channel || currentOrder.source || currentOrder.origin || '').toUpperCase();
    if (!ch) {
      if (currentOrder.notes?.includes('[POS') || currentOrder.origin === 'pos') ch = 'POS';
      else if (currentOrder.origin === 'tienda_web' || currentOrder.origin === 'tienda') ch = 'TIENDA';
      else ch = 'WHATSAPP';
    }
    const channelLabel = ch === 'POS' ? 'POS Mostrador' : ch === 'TIENDA' ? 'Tienda Web' : 'WhatsApp Bot';

    const fiscalBlock = invoice ? `
🆔 *COMPROBANTE:* ${invoice.documentType} N° ${invoice.fullDocNumber}
${invoice.isFiscal ? `🔑 *CAE:* ${invoice.cae}\n📅 *VTO. CAE:* ${invoice.caeVtoFormatted || invoice.caeVto}` : '*(Comprobante no válido como factura fiscal)*'}` : `🆔 *TICKET / PEDIDO:* #${currentOrder.id}`;

    return `🥩 *${info.name.toUpperCase()}* 🥩
"${info.slogan}"
${info.address}
WhatsApp: ${info.whatsapp} • CUIT: ${info.cuit}
${divider}${fiscalBlock}
📡 *CANAL:* ${channelLabel}
📅 *FECHA:* ${orderDate}
👤 *CLIENTE:* ${currentOrder.customerName || 'Cliente Mostrador'}
📱 *TEL:* ${currentOrder.phone || 'No especificado'}
📍 *ENTREGA:* ${isDelivery ? `Domicilio: ${currentOrder.address || 'Córdoba'}` : `Retiro en Sucursal: ${currentOrder.branchName || currentOrder.branch || 'Urca Central'}`}
💳 *MEDIO DE PAGO:* ${currentOrder.paymentMethod || 'Efectivo'}
${divider}
*DETALLE DE CORTES Y PRODUCTOS (precios por kilo según corte):*
${itemsText}
${divider}
${invoice && invoice.isFiscal && invoice.tipoCbte === 1 ? `*Neto Gravado:* $${Number(invoice.importeNeto).toLocaleString('es-AR')}\n*IVA (21%):* $${Number(invoice.importeIva).toLocaleString('es-AR')}\n` : ''}💰 *TOTAL ESTIMADO: $${Number(currentOrder.totalAmount || 0).toLocaleString('es-AR')}*
*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variación según el pesaje exacto final en balanza).*
${divider}
¡Muchas gracias por su compra!
República de la Carne - Selección Premium`;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getTicketPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(getTicketPlainText());
    const phone = (currentOrder.phone || '').replace(/\D/g, '');
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    setIsPrinting(true);
    const printContent = ticketRef.current ? ticketRef.current.innerHTML : '';
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('Por favor habilita las ventanas emergentes (pop-ups) en tu navegador para imprimir.');
      setIsPrinting(false);
      return;
    }

    const isThermal = printFormat === 'thermal80' || printFormat === 'thermal58' || printFormat === 'butcher';
    const paperWidth = printFormat === 'thermal58' ? '54mm' : printFormat === 'thermal80' ? '76mm' : printFormat === 'butcher' ? '78mm' : '210mm';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Imprimir ${invoice ? invoice.fullDocNumber : `Ticket #${currentOrder.id}`} - ${info.name}</title>
          <style>
            @page {
              size: ${isThermal ? 'auto' : 'A4 portrait'};
              margin: ${isThermal ? '0mm' : '10mm'};
            }
            body {
              margin: 0;
              padding: ${isThermal ? '2mm' : '0mm'};
              font-family: ${isThermal ? 'monospace, "Courier New", Courier' : 'system-ui, -apple-system, sans-serif'};
              color: #000000;
              background: #ffffff;
              width: ${isThermal ? paperWidth : '100%'};
              box-sizing: border-box;
            }
            * {
              box-sizing: border-box;
              color: #000000 !important;
            }
            .ticket-container {
              width: 100%;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              padding: 2px 0;
            }
            .big-plu {
              font-size: 16px;
              font-weight: 900;
              border: 1px solid #000;
              padding: 1px 4px;
              border-radius: 4px;
              display: inline-block;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            @media print {
              body {
                width: ${isThermal ? paperWidth : '100%'};
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="ticket-container">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() {
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setIsPrinting(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl bg-[#111b21] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#182229] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-black">
              {invoice ? <FileCheck size={22} className="text-emerald-400" /> : <Receipt size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Centro de Emisión e Impresión de Comprobantes
                </h2>
                {invoice ? (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    invoice.isFiscal 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {invoice.isFiscal ? `✅ ${invoice.documentType} (${invoice.fullDocNumber})` : `📄 ${invoice.fullDocNumber}`}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    Ticket #{currentOrder.id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Facturación electrónica oficial ARCA (AFIP), Presupuestos no fiscales y Comandas de corte</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Bar: Emisión Fiscal ARCA / Presupuesto */}
        <div className="p-3 bg-gradient-to-r from-[#182229] via-[#1c2833] to-[#182229] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {!invoice ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowEmissionModal(true)}
                  disabled={isEmitting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition disabled:opacity-50"
                >
                  <Receipt size={14} />
                  🧾 Emitir Factura ARCA (A / B / C)
                </button>

                <button
                  type="button"
                  onClick={handleEmitPresupuesto}
                  disabled={isEmitting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold border border-slate-600 transition disabled:opacity-50"
                >
                  <FileText size={14} />
                  📄 Emitir Presupuesto (No Fiscal)
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium">
                  Comprobante emitido: <b className="text-white">{invoice.documentType} ({invoice.fullDocNumber})</b>
                </span>
                <button
                  type="button"
                  onClick={() => setShowEmissionModal(true)}
                  className="text-[11px] text-blue-400 hover:underline font-semibold"
                >
                  (Cambiar / Re-emitir)
                </button>
              </div>
            )}
          </div>

          {/* Formats Selector */}
          <div className="flex items-center gap-1.5 bg-[#111b21] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setPrintFormat('thermal80')}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                printFormat === 'thermal80'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              80mm Térmico
            </button>
            <button
              onClick={() => setPrintFormat('thermal58')}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                printFormat === 'thermal58'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              58mm
            </button>
            <button
              onClick={() => setPrintFormat('butcher')}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                printFormat === 'butcher'
                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🥩 Comanda Corte
            </button>
            <button
              onClick={() => setPrintFormat('a4')}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                printFormat === 'a4'
                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📄 A4 Factura
            </button>
          </div>
        </div>

        {/* Modal Emisión Rápida ARCA (Selector de tipo y cliente) */}
        {showEmissionModal && (
          <div className="p-4 bg-[#141f27] border-b border-blue-500/30 animate-in fade-in space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Receipt size={15} className="text-blue-400" />
                Configurar Emisión de Comprobante ARCA
              </h3>
              <button onClick={() => setShowEmissionModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕ Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tipo de Comprobante:</label>
                <select
                  value={emissionForm.documentType}
                  onChange={(e) => setEmissionForm({ ...emissionForm, documentType: e.target.value })}
                  className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="factura_b">Factura B (Consumidor Final)</option>
                  <option value="factura_a">Factura A (Responsable Inscripto - IVA 21%)</option>
                  <option value="factura_c">Factura C (Monotributo)</option>
                  <option value="presupuesto">Presupuesto / Comprobante X (No Fiscal)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nombre / Razón Social:</label>
                <input
                  type="text"
                  value={emissionForm.customerName}
                  onChange={(e) => setEmissionForm({ ...emissionForm, customerName: e.target.value })}
                  className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Nombre del Cliente"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tipo Doc:</label>
                <select
                  value={emissionForm.customerDocType}
                  onChange={(e) => setEmissionForm({ ...emissionForm, customerDocType: e.target.value })}
                  className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="DNI">DNI</option>
                  <option value="CUIT">CUIT (11 dígitos)</option>
                  <option value="Consumidor Final">Consumidor Final</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Número de Doc (DNI / CUIT):</label>
                <input
                  type="text"
                  value={emissionForm.customerDoc}
                  onChange={(e) => setEmissionForm({ ...emissionForm, customerDoc: e.target.value.replace(/\D/g, '') })}
                  className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder={emissionForm.documentType === 'factura_a' ? 'Obligatorio CUIT (11 dígitos)' : 'Opcional para Factura B'}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleEmitInvoice(emissionForm.documentType)}
                disabled={isEmitting}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
              >
                {isEmitting ? 'Emitiendo ante ARCA...' : `Confirmar y Emitir ${emissionForm.documentType === 'presupuesto' ? 'Presupuesto' : 'Factura'}`}
              </button>
            </div>
          </div>
        )}

        {/* Live Ticket / Invoice Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0b141a] flex justify-center items-start">
          <div 
            ref={ticketRef}
            className={`bg-white text-black p-4 sm:p-6 shadow-2xl transition-all ${
              printFormat === 'thermal58'
                ? 'w-[260px] font-mono text-[11px]'
                : printFormat === 'thermal80'
                ? 'w-[360px] font-mono text-xs'
                : printFormat === 'butcher'
                ? 'w-[370px] font-mono text-xs border-2 border-black'
                : 'w-full max-w-[620px] font-sans text-xs rounded-xl border border-slate-300'
            }`}
            style={{ color: '#000' }}
          >
            
            {/* ========================================================================= */}
            {/* 1. COMANDERA TÉRMICA 80MM / 58MM                                          */}
            {/* ========================================================================= */}
            {(printFormat === 'thermal80' || printFormat === 'thermal58') && (
              <div className="space-y-1.5 leading-tight">
                
                {/* Encabezado Fiscal / Negocio */}
                <div className="text-center space-y-0.5">
                  <div className="text-base font-black tracking-wider uppercase">{info.fantasyName || info.name}</div>
                  <div className="text-[10px] font-bold">{info.name}</div>
                  <div className="text-[10px] italic">"{info.slogan}"</div>
                  <div className="text-[10px]">{info.address}</div>
                  <div className="text-[10px]">WhatsApp: {info.whatsapp}</div>
                  <div className="text-[10px]">CUIT: {info.cuit} • {info.ivaCondition}</div>
                  <div className="text-[10px]">IIBB: {info.iibb} • Inicio: {info.startActivity}</div>
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                {/* Bloque Fiscal AFIP / ARCA si existe factura o presupuesto */}
                {invoice ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between border-2 border-black p-1 text-center font-bold">
                      <div className="text-lg font-black w-8 border-r border-black">{invoice.letter}</div>
                      <div className="flex-1 text-[11px] font-black uppercase">{invoice.documentType}</div>
                      <div className="text-[10px] text-right font-mono">COD. {String(invoice.tipoCbte).padStart(3, '0')}</div>
                    </div>
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>Punto de Venta: {invoice.ptoVtaFormatted}</span>
                      <span>Comp. N°: {invoice.nroFormatted}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span>Fecha de Emisión:</span>
                      <span>{invoice.fechaFormatted || orderDate}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between font-bold">
                    <span>TICKET / ORDEN:</span>
                    <span>#{currentOrder.id}</span>
                  </div>
                )}

                <div className="border-t border-dashed border-black my-2"></div>

                {/* Datos del Cliente */}
                <div className="text-[11px] space-y-0.5">
                  <div><b>Cliente:</b> {currentOrder.customerName || 'Consumidor Final'}</div>
                  <div><b>Condición IVA:</b> {invoice?.tipoCbte === 1 ? 'IVA Responsable Inscripto' : 'Consumidor Final'}</div>
                  {(invoice?.clienteDoc || currentOrder.customerDoc) && (
                    <div><b>{invoice?.clienteDocTipo || 'Doc'}:</b> {invoice?.clienteDoc || currentOrder.customerDoc}</div>
                  )}
                  <div><b>Teléfono:</b> {currentOrder.phone || 'No registrado'}</div>
                  {isDelivery ? (
                    <div><b>Dirección Entrega:</b> {currentOrder.address || 'Córdoba Capital'}</div>
                  ) : (
                    <div><b>Retiro:</b> {currentOrder.branchName || currentOrder.branch || 'Urca Central'}</div>
                  )}
                  {currentOrder.notes && <div className="italic text-[10px] bg-slate-100 p-1 mt-1 rounded">Nota: {currentOrder.notes}</div>}
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                {/* Detalle de Cortes */}
                <div className="font-bold text-[11px] pb-1">DETALLE DE CORTES (precios x kg/unidad):</div>
                
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="pb-1">PLU/Corte</th>
                      <th className="pb-1 text-center">Cant</th>
                      <th className="pb-1 text-right">P.Unit</th>
                      <th className="pb-1 text-right">Subtot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="py-1 pr-1">
                          {item.plu && <span className="font-bold text-[10px] bg-slate-200 px-1 rounded mr-1">PLU {item.plu}</span>}
                          <span className="font-semibold">{item.name}</span>
                        </td>
                        <td className="py-1 text-center whitespace-nowrap">{item.quantity} {item.unit}</td>
                        <td className="py-1 text-right whitespace-nowrap">${Number(item.price).toLocaleString('es-AR')}</td>
                        <td className="py-1 text-right font-bold whitespace-nowrap">${Number(item.total).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totales y Discriminación Fiscal */}
                <div className="border-t-2 border-black pt-2 space-y-1">
                  {invoice && invoice.isFiscal && invoice.tipoCbte === 1 && (
                    <>
                      <div className="flex justify-between text-[11px]">
                        <span>Subtotal Neto Gravado:</span>
                        <span>${Number(invoice.importeNeto).toLocaleString('es-AR')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>IVA (21%):</span>
                        <span>${Number(invoice.importeIva).toLocaleString('es-AR')}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-black">
                    <span>TOTAL A PAGAR:</span>
                    <span>${Number(currentOrder.totalAmount || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="text-[9px] text-slate-600 italic leading-tight">
                    * Los precios de cortes son por kilo. El importe final puede variar según el pesaje exacto en balanza.
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Forma de Pago:</span>
                    <span className="font-bold uppercase">{currentOrder.paymentMethod || 'Efectivo'}</span>
                  </div>
                </div>

                {/* CAE & QR Oficial de ARCA / AFIP */}
                {invoice && invoice.isFiscal && (
                  <div className="border-t border-dashed border-black pt-2 mt-2 text-center space-y-1.5">
                    {invoice.qrDataUrl && (
                      <div className="flex justify-center my-1">
                        <img src={invoice.qrDataUrl} alt="Código QR ARCA" className="w-24 h-24" />
                      </div>
                    )}
                    <div className="text-[10px] font-bold">CAE: {invoice.cae}</div>
                    <div className="text-[9px]">Vto. de CAE: {invoice.caeVtoFormatted || invoice.caeVto}</div>
                    <div className="text-[8px] uppercase tracking-wider font-semibold text-slate-700">
                      {invoice.legend || 'Comprobante Autorizado por ARCA'}
                    </div>
                  </div>
                )}

                {invoice && !invoice.isFiscal && (
                  <div className="border-t border-dashed border-black pt-2 mt-2 text-center space-y-1">
                    <div className="text-[10px] font-bold uppercase">{invoice.legend}</div>
                    <div className="text-[9px] text-slate-600">Presupuesto válido por 7 días.</div>
                  </div>
                )}

                <div className="border-t border-dashed border-black my-2"></div>

                <div className="text-center pt-1 space-y-0.5">
                  <div className="text-[10px] font-bold">¡MUCHAS GRACIAS POR ELEGIRNOS!</div>
                  <div className="text-[9px] text-slate-600">República de la Carne • Selección Premium</div>
                  <div className="text-[8px] font-mono">www.republicadelacarne.com.ar</div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 2. COMANDA DE CARNICERÍA / SECTOR CORTE (PLUs Grandes)                     */}
            {/* ========================================================================= */}
            {printFormat === 'butcher' && (
              <div className="space-y-2 leading-snug">
                <div className="text-center border-b-2 border-black pb-2">
                  <div className="text-lg font-black uppercase tracking-wider">🥩 COMANDA DE PREPARACIÓN</div>
                  <div className="text-sm font-extrabold">ORDEN #{currentOrder.id} {invoice ? `(${invoice.fullDocNumber})` : ''}</div>
                  <div className="text-[11px] font-bold">{orderDate}</div>
                </div>

                <div className="bg-slate-100 p-2 rounded border border-black space-y-0.5 text-[11px]">
                  <div><b>CLIENTE:</b> {currentOrder.customerName} ({currentOrder.phone || 'S/N'})</div>
                  <div><b>DESTINO:</b> {isDelivery ? `🛵 DOMICILIO: ${currentOrder.address}` : `🏪 RETIRO SUCURSAL: ${currentOrder.branchName || 'Urca Central'}`}</div>
                  {currentOrder.driverName && <div><b>REPARTIDOR:</b> {currentOrder.driverName}</div>}
                  {currentOrder.notes && <div className="text-red-700 font-bold bg-amber-100 p-1 rounded mt-1">⚠️ NOTA: {currentOrder.notes}</div>}
                </div>

                <div className="text-xs font-black uppercase tracking-wider border-b border-black pt-1 pb-1">
                  LISTA DE CORTES A PESAR Y PREPARAR:
                </div>

                <div className="space-y-2.5">
                  {parsedItems.map((item, idx) => (
                    <div key={idx} className="p-2 border border-black rounded flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="big-plu">PLU {item.plu || (idx + 1)}</span>
                          <span className="font-black text-sm uppercase">{item.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          Precio Unitario: ${Number(item.price).toLocaleString('es-AR')} / {item.unit}
                        </div>
                      </div>

                      <div className="text-right shrink-0 border-l-2 border-black pl-3">
                        <div className="text-base font-black">{item.quantity} {item.unit}</div>
                        <div className="text-[11px] font-bold">${Number(item.total).toLocaleString('es-AR')}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-black pt-2 flex justify-between items-center text-sm font-black">
                  <span>TOTAL ESTIMADO:</span>
                  <span>${Number(currentOrder.totalAmount || 0).toLocaleString('es-AR')}</span>
                </div>

                <div className="border border-dashed border-black p-2 mt-3 text-center space-y-1">
                  <div className="text-[10px] font-bold">CONTROL DE CALIDAD Y PESAJE CARNICERÍA</div>
                  <div className="text-[9px]">Firma Maestro Carnicero: ______________________</div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 3. FORMATO A4 / FACTURA ELECTRÓNICA ARCA / REMITO COMERCIAL               */}
            {/* ========================================================================= */}
            {printFormat === 'a4' && (
              <div className="space-y-4">
                
                {/* Header Fiscal A4 */}
                <div className="border-2 border-black p-3 rounded-lg relative">
                  <div className="grid grid-cols-2 gap-4">
                    
                    {/* Lado Izquierdo: Datos Emisor */}
                    <div>
                      <h1 className="text-lg font-black tracking-wider text-black uppercase">{info.fantasyName || info.name}</h1>
                      <div className="text-xs font-bold">{info.name}</div>
                      <p className="text-[11px] text-slate-700">{info.address}</p>
                      <p className="text-[11px] text-slate-700">WhatsApp: {info.whatsapp}</p>
                      <p className="text-[11px] font-bold mt-1">IVA: {info.ivaCondition}</p>
                    </div>

                    {/* Lado Derecho: Datos Comprobante */}
                    <div className="text-right">
                      <div className="text-base font-black uppercase">
                        {invoice ? invoice.documentType : `REMITO / TICKET`}
                      </div>
                      <div className="text-xs font-bold mt-1">
                        Punto de Venta: {invoice ? invoice.ptoVtaFormatted : '0001'} • Comp. N°: {invoice ? invoice.nroFormatted : currentOrder.id}
                      </div>
                      <p className="text-xs text-slate-700 mt-1">Fecha de Emisión: {invoice ? invoice.fechaFormatted : orderDate}</p>
                      <p className="text-xs text-slate-700">CUIT: {info.cuit}</p>
                      <p className="text-xs text-slate-700">Ingresos Brutos: {info.iibb}</p>
                      <p className="text-xs text-slate-700">Inicio de Actividades: {info.startActivity}</p>
                    </div>
                  </div>

                  {/* Letra AFIP en el centro superior */}
                  {invoice && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white border-2 border-black px-3 py-1 text-center">
                      <div className="text-xl font-black">{invoice.letter}</div>
                      <div className="text-[9px] font-mono">COD. {String(invoice.tipoCbte).padStart(3, '0')}</div>
                    </div>
                  )}
                </div>

                {/* Customer and Delivery Info Box */}
                <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 border border-black rounded-lg text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-black uppercase">Datos del Cliente / Receptor:</div>
                    <div><b>Nombre / Razón Social:</b> {currentOrder.customerName || 'Consumidor Final'}</div>
                    {(invoice?.clienteDoc || currentOrder.customerDoc) && (
                      <div><b>{invoice?.clienteDocTipo || 'DNI / CUIT'}:</b> {invoice?.clienteDoc || currentOrder.customerDoc}</div>
                    )}
                    <div><b>Condición IVA:</b> {invoice?.tipoCbte === 1 ? 'IVA Responsable Inscripto' : 'Consumidor Final'}</div>
                    <div><b>Teléfono:</b> {currentOrder.phone || 'No especificado'}</div>
                    <div><b>Medio de Pago:</b> {currentOrder.paymentMethod || 'Efectivo'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-black uppercase">Datos de Entrega y Logística:</div>
                    <div><b>Modalidad:</b> {isDelivery ? '🛵 Envío a Domicilio' : '🏪 Retiro por Sucursal'}</div>
                    <div><b>Destino:</b> {isDelivery ? (currentOrder.address || 'Córdoba Capital') : (currentOrder.branchName || 'Urca Central')}</div>
                    {currentOrder.driverName && <div><b>Repartidor:</b> {currentOrder.driverName}</div>}
                    {currentOrder.notes && <div className="text-slate-700 italic">Nota: {currentOrder.notes}</div>}
                  </div>
                </div>

                {/* Products Table */}
                <table className="w-full text-xs border border-black">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-2 text-left">Código PLU</th>
                      <th className="p-2 text-left">Descripción del Producto / Corte</th>
                      <th className="p-2 text-center">Cantidad</th>
                      <th className="p-2 text-right">Precio Unitario</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2 font-mono font-bold">{item.plu || `PLU-${idx + 1}`}</td>
                        <td className="p-2 font-semibold">{item.name}</td>
                        <td className="p-2 text-center font-bold">{item.quantity} {item.unit}</td>
                        <td className="p-2 text-right">${Number(item.price).toLocaleString('es-AR')}</td>
                        <td className="p-2 text-right font-bold">${Number(item.total).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-black bg-slate-100 font-bold">
                    {invoice && invoice.isFiscal && invoice.tipoCbte === 1 && (
                      <>
                        <tr>
                          <td colSpan={4} className="p-2 text-right">Importe Neto Gravado:</td>
                          <td className="p-2 text-right font-bold">${Number(invoice.importeNeto).toLocaleString('es-AR')}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} className="p-2 text-right">IVA (21%):</td>
                          <td className="p-2 text-right font-bold">${Number(invoice.importeIva).toLocaleString('es-AR')}</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td colSpan={4} className="p-2.5 text-right text-sm">TOTAL GENERAL:</td>
                      <td className="p-2.5 text-right text-sm font-black text-emerald-800">
                        ${Number(currentOrder.totalAmount || 0).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Footer Fiscal con QR y CAE de ARCA */}
                {invoice && invoice.isFiscal && (
                  <div className="border border-black p-3 rounded-lg flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3">
                      {invoice.qrDataUrl && (
                        <img src={invoice.qrDataUrl} alt="Código QR ARCA" className="w-20 h-20 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-sm">Comprobante Autorizado por ARCA</div>
                        <div className="text-[11px] text-slate-700">R.G. AFIP N° 4291/4892</div>
                      </div>
                    </div>

                    <div className="text-right space-y-0.5">
                      <div><b>CAE N°:</b> <span className="font-mono font-bold text-sm">{invoice.cae}</span></div>
                      <div><b>Fecha de Vencimiento de CAE:</b> <span className="font-bold">{invoice.caeVtoFormatted || invoice.caeVto}</span></div>
                    </div>
                  </div>
                )}

                {invoice && !invoice.isFiscal && (
                  <div className="border border-black p-2.5 text-center text-xs font-bold uppercase bg-slate-50">
                    {invoice.legend}
                  </div>
                )}

                {/* Footer Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-4 text-xs text-center">
                  <div className="border-t border-slate-400 pt-2">
                    Firma y Aclaración de Quien Entrega (Despacho)
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    Firma y Conformidad de Quien Recibe (Cliente)
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#111b21] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#182229] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
              title="Copiar texto del ticket"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? '¡Copiado!' : 'Copiar Texto'}
            </button>

            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition"
              title="Enviar ticket por WhatsApp"
            >
              <Send size={14} />
              Enviar WhatsApp
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#182229] border border-slate-800 text-xs font-semibold"
            >
              Cerrar
            </button>

            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow-lg shadow-emerald-500/25 active:scale-95"
            >
              <Printer size={15} />
              {isPrinting ? 'Abriendo Impresora...' : '🖨️ Imprimir Comprobante'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
