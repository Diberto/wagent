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
  QrCode
} from 'lucide-react';
import { parseOrderItems } from './OrdersView.jsx';

export default function TicketPrintModal({ order, onClose, businessInfo = null }) {
  const [printFormat, setPrintFormat] = useState('thermal80'); // 'thermal80' | 'thermal58' | 'butcher' | 'a4'
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const ticketRef = useRef(null);

  if (!order) return null;

  const info = {
    name: 'REPÚBLICA DE LA CARNE',
    slogan: 'La calidad nos hace diferentes',
    cuit: '30-71689234-8',
    whatsapp: '+54 9 351 626-2475',
    address: order.branchName ? `${order.branchName} • Córdoba` : 'Av. José Roque Funes 1115, Urca, Córdoba',
    ...businessInfo
  };

  const parsedItems = parseOrderItems(order);
  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : new Date().toLocaleString('es-AR');

  const isDelivery = (order.deliveryType === 'delivery') || (!order.branch && !order.branchName && order.address && order.address !== 'Retiro en Sucursal');

  // Generar texto plano del ticket para WhatsApp o portapapeles
  const getTicketPlainText = () => {
    const divider = '----------------------------------------';
    const itemsText = parsedItems.map(item => {
      const pluStr = item.plu ? `[PLU ${item.plu}] ` : '';
      return `${pluStr}${item.quantity} ${item.unit} x ${item.name} = $${Number(item.total).toLocaleString('es-AR')}`;
    }).join('\n');

    let ch = (order.channel || order.source || order.origin || '').toUpperCase();
    if (!ch) {
      if (order.notes?.includes('[POS') || order.origin === 'pos') ch = 'POS';
      else if (order.origin === 'tienda_web' || order.origin === 'tienda') ch = 'TIENDA';
      else ch = 'WHATSAPP';
    }
    const channelLabel = ch === 'POS' ? 'POS Mostrador' : ch === 'TIENDA' ? 'Tienda Web' : 'WhatsApp Bot';

    return `🥩 *${info.name.toUpperCase()}* 🥩
"${info.slogan}"
${info.address}
WhatsApp: ${info.whatsapp}
${divider}
🆔 *TICKET / PEDIDO:* #${order.id}
📡 *CANAL:* ${channelLabel}
📅 *FECHA:* ${orderDate}
👤 *CLIENTE:* ${order.customerName || 'Cliente Mostrador'}
📱 *TEL:* ${order.phone || 'No especificado'}
📍 *ENTREGA:* ${isDelivery ? `Domicilio: ${order.address || 'Córdoba'}` : `Retiro en Sucursal: ${order.branchName || order.branch || 'Urca Central'}`}
💳 *MEDIO DE PAGO:* ${order.paymentMethod || 'Efectivo'}
${divider}
*DETALLE DE CORTES Y PRODUCTOS:*
${itemsText}
${divider}
💰 *TOTAL A ABONAR: $${Number(order.totalAmount || 0).toLocaleString('es-AR')}*
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
    const phone = (order.phone || '').replace(/\D/g, '');
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
          <title>Imprimir Ticket #${order.id} - ${info.name}</title>
          <style>
            @page {
              size: ${isThermal ? 'auto' : 'A4 portrait'};
              margin: ${isThermal ? '0mm' : '10mm'};
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: ${isThermal ? "'Courier New', Courier, monospace" : "'Helvetica Neue', Helvetica, Arial, sans-serif"};
              background: #fff;
              color: #000;
              margin: 0;
              padding: ${isThermal ? '6px' : '20px'};
              width: ${paperWidth};
              margin-left: auto;
              margin-right: auto;
            }
            .ticket-container {
              width: 100%;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .dashed-line {
              border-top: 1px dashed #000;
              margin: 6px 0;
            }
            .solid-line {
              border-top: 2px solid #000;
              margin: 6px 0;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .bold { font-weight: bold; }
            .uppercase { text-transform: uppercase; }
            .big-plu {
              font-size: 16px;
              font-weight: 900;
              background: #000;
              color: #fff !important;
              padding: 2px 5px;
              border-radius: 3px;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="ticket-container">
            ${printContent}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
    setIsPrinting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#182229] border border-slate-700/80 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#111b21]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                Centro de Impresión de Tickets
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  #{order.id}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Formato compatible con comandera térmica (58/80mm), carnicería y A4
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="px-4 py-2.5 bg-[#141d22] border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto select-none">
          <button
            onClick={() => setPrintFormat('thermal80')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              printFormat === 'thermal80'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Receipt size={14} />
            🧾 Comandera Térmica 80mm (Estándar)
          </button>

          <button
            onClick={() => setPrintFormat('thermal58')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              printFormat === 'thermal58'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Receipt size={14} />
            🧾 Comandera Térmica 58mm (Mini)
          </button>

          <button
            onClick={() => setPrintFormat('butcher')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              printFormat === 'butcher'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Flame size={14} />
            🥩 Comanda Sector Corte (PLUs Grandes)
          </button>

          <button
            onClick={() => setPrintFormat('a4')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              printFormat === 'a4'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 font-black'
                : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileText size={14} />
            📄 Factura / Remito A4
          </button>
        </div>

        {/* Live Ticket Preview Container */}
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
                : 'w-full max-w-[560px] font-sans text-xs rounded-xl'
            }`}
            style={{ color: '#000' }}
          >
            
            {/* ========================================================================= */}
            {/* 1. COMANDERA TÉRMICA 80MM / 58MM                                          */}
            {/* ========================================================================= */}
            {(printFormat === 'thermal80' || printFormat === 'thermal58') && (
              <div className="space-y-1.5 leading-tight">
                <div className="text-center space-y-0.5">
                  <div className="text-base font-black tracking-wider uppercase">{info.name}</div>
                  <div className="text-[10px] italic">"{info.slogan}"</div>
                  <div className="text-[10px]">{info.address}</div>
                  <div className="text-[10px]">WhatsApp: {info.whatsapp}</div>
                  <div className="text-[10px]">CUIT: {info.cuit}</div>
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                <div className="flex justify-between font-bold">
                  <span>TICKET / ORDEN:</span>
                  <span>#{order.id}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Canal:</span>
                  <span className="font-bold uppercase">{order.channel || (order.notes?.includes('[POS') ? 'POS Mostrador' : order.origin === 'tienda_web' ? 'Tienda Web' : 'WhatsApp Bot')}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Fecha:</span>
                  <span>{orderDate}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Modalidad:</span>
                  <span className="font-bold uppercase">{isDelivery ? '🛵 Envío Domicilio' : '🏪 Retiro Sucursal'}</span>
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                <div className="text-[11px] space-y-0.5">
                  <div><b>Cliente:</b> {order.customerName || 'Cliente Mostrador'}</div>
                  <div><b>Teléfono:</b> {order.phone || 'No registrado'}</div>
                  {isDelivery ? (
                    <div><b>Dirección:</b> {order.address || 'Córdoba Capital'}</div>
                  ) : (
                    <div><b>Sucursal:</b> {order.branchName || order.branch || 'Urca Central'}</div>
                  )}
                  {order.driverName && <div><b>Repartidor:</b> 🛵 {order.driverName}</div>}
                  {order.notes && <div className="italic text-[10px] bg-slate-100 p-1 mt-1 rounded">Nota: {order.notes}</div>}
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                <div className="font-bold text-[11px] pb-1">DETALLE DE CORTES:</div>
                
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

                <div className="border-t-2 border-black pt-2 space-y-1">
                  <div className="flex justify-between text-sm font-black">
                    <span>TOTAL A PAGAR:</span>
                    <span>${Number(order.totalAmount || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Forma de Pago:</span>
                    <span className="font-bold uppercase">{order.paymentMethod || 'Efectivo'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Estado del Pago:</span>
                    <span className="font-bold">
                      {order.status === 'delivered' || order.paymentMethod?.includes('Mercado Pago') ? '✅ ACREDITADO / PAGADO' : '⏳ PENDIENTE DE COBRO'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-dashed border-black my-2"></div>

                <div className="text-center pt-2 space-y-1">
                  <div className="text-[10px] font-bold">¡MUCHAS GRACIAS POR ELEGIRNOS!</div>
                  <div className="text-[9px] text-slate-600">Conservar este ticket como comprobante de entrega.</div>
                  <div className="text-[9px] font-mono">www.republicadelacarne.com.ar</div>
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
                  <div className="text-sm font-extrabold">ORDEN #{order.id}</div>
                  <div className="text-[11px] font-bold">{orderDate}</div>
                </div>

                <div className="bg-slate-100 p-2 rounded border border-black space-y-0.5 text-[11px]">
                  <div><b>CLIENTE:</b> {order.customerName} ({order.phone || 'S/N'})</div>
                  <div><b>DESTINO:</b> {isDelivery ? `🛵 DOMICILIO: ${order.address}` : `🏪 RETIRO SUCURSAL: ${order.branchName || 'Urca Central'}`}</div>
                  {order.driverName && <div><b>REPARTIDOR:</b> {order.driverName}</div>}
                  {order.notes && <div className="text-red-700 font-bold bg-amber-100 p-1 rounded mt-1">⚠️ NOTA: {order.notes}</div>}
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
                  <span>${Number(order.totalAmount || 0).toLocaleString('es-AR')}</span>
                </div>

                <div className="border border-dashed border-black p-2 mt-3 text-center space-y-1">
                  <div className="text-[10px] font-bold">CONTROL DE CALIDAD Y PESAJE CARNICERÍA</div>
                  <div className="text-[9px]">Firma Maestro Carnicero: ______________________</div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 3. FORMATO A4 / FACTURA / REMITO COMERCIAL                                */}
            {/* ========================================================================= */}
            {printFormat === 'a4' && (
              <div className="space-y-4">
                {/* Header Row */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                  <div>
                    <h1 className="text-xl font-black tracking-wider text-slate-900">{info.name}</h1>
                    <p className="text-xs italic text-slate-600">"{info.slogan}"</p>
                    <p className="text-xs text-slate-700 mt-1">{info.address}</p>
                    <p className="text-xs text-slate-700">WhatsApp: {info.whatsapp} • CUIT: {info.cuit}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black px-3 py-1 bg-slate-900 text-white rounded inline-block">
                      REMITO / TICKET #{order.id}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">Fecha: {orderDate}</p>
                    <p className="text-xs font-bold text-emerald-700 uppercase">
                      {order.status === 'delivered' ? 'Entregado' : order.status === 'in_transit' ? 'En Tránsito' : 'En Preparación'}
                    </p>
                  </div>
                </div>

                {/* Customer and Delivery Info Box */}
                <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 uppercase">Datos del Cliente:</div>
                    <div><b>Nombre:</b> {order.customerName || 'Cliente Mostrador'}</div>
                    <div><b>Teléfono:</b> {order.phone || 'No especificado'}</div>
                    <div><b>Medio de Pago:</b> {order.paymentMethod || 'Efectivo'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 uppercase">Datos de Entrega:</div>
                    <div><b>Modalidad:</b> {isDelivery ? '🛵 Envío a Domicilio' : '🏪 Retiro por Sucursal'}</div>
                    <div><b>Destino:</b> {isDelivery ? (order.address || 'Córdoba Capital') : (order.branchName || 'Urca Central')}</div>
                    {order.driverName && <div><b>Repartidor:</b> {order.driverName}</div>}
                  </div>
                </div>

                {/* Products Table */}
                <table className="w-full text-xs border border-slate-300">
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
                  <tfoot className="border-t-2 border-slate-900 bg-slate-100 font-bold">
                    <tr>
                      <td colSpan={4} className="p-2.5 text-right text-sm">TOTAL GENERAL:</td>
                      <td className="p-2.5 text-right text-sm font-black text-emerald-800">
                        ${Number(order.totalAmount || 0).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Footer Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-center">
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
              {isPrinting ? 'Abriendo Impresora...' : '🖨️ Imprimir Ticket'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
