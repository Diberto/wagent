import { db } from './database.js';

export class ScaleService {
  /**
   * Decodifica un código de barras EAN-13 emitido por balanzas Systel o Kretz
   * Formato 1: 20 PPPPP WWWWW C (Peso: gramos)
   * Formato 2: 20 PPPPP TTTTT C (Monto: pesos)
   */
  parseScaleBarcode(barcodeStr, mode = 'weight') {
    if (!barcodeStr) return null;
    const raw = String(barcodeStr).trim().replace(/\D/g, '');

    // Código estándar EAN-13 de 13 dígitos empezando con 20 o 02
    if (/^(20|02)\d{11}$/.test(raw)) {
      const prefix = raw.slice(0, 2);
      const rawPlu = raw.slice(2, 7);
      const plu = String(parseInt(rawPlu, 10)); // e.g. "02008" -> "2008"
      const valueDigits = parseInt(raw.slice(7, 12), 10) || 0;
      const checkDigit = raw.slice(12, 13);

      let weightKg = null;
      let priceAmount = null;

      if (mode === 'price') {
        priceAmount = valueDigits;
      } else {
        weightKg = Number((valueDigits / 1000).toFixed(3));
      }

      // Buscar producto correspondiente en catálogo por PLU
      const products = db.getProducts();
      const product = products.find(p => p.plu === plu || p.barcode === raw || p.id === plu) || null;

      if (product && mode === 'weight' && Number(product.price) > 0) {
        priceAmount = Math.round(weightKg * Number(product.price));
      }

      return {
        isScaleBarcode: true,
        scaleBrand: 'Systel / Kretz compatible (EAN-13)',
        prefix,
        raw,
        plu,
        weightKg,
        priceAmount,
        checkDigit,
        product: product ? {
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          unit: product.unit || 'kg'
        } : null
      };
    }

    return {
      isScaleBarcode: false,
      raw: barcodeStr,
      product: null
    };
  }

  /**
   * Genera el archivo maestro de cortes para importar en software SYSTEL QENDRA / NET
   * Formato: PLU;NOMBRE;PRECIO;TARA;DIAS_VENC;TIPO (0=pesable/kg, 1=unidad)
   */
  exportSystelQendraCatalog() {
    const products = db.getProducts();
    const rows = [
      'PLU;NOMBRE;PRECIO;TARA;DIAS_VENC;TIPO_VENTA'
    ];

    products.forEach(p => {
      if (!p.plu) return;
      const pluNum = p.plu.replace(/\D/g, '');
      if (!pluNum) return;
      const cleanName = (p.name || 'Corte').replace(/;/g, ' ').slice(0, 28);
      const price = Number(p.price) || 0;
      const isPesable = (p.unit || 'kg').toLowerCase() === 'kg' ? 0 : 1;
      const shelfDays = p.shelfLifeDays || 5;

      rows.push(`${pluNum};${cleanName};${price};0;${shelfDays};${isPesable}`);
    });

    return rows.join('\r\n');
  }

  /**
   * Genera el archivo maestro de cortes para importar en software KRETZ iTEGRA
   * Formato: PLU;DESCRIPCION;PRECIO;SECCION;TIPO;DIAS_VENCIMIENTO;CODIGO_BARRA
   */
  exportKretziTegraCatalog() {
    const products = db.getProducts();
    const rows = [
      'DEPARTAMENTO;PLU;DESCRIPCION;PRECIO;TARA;DIAS_VENCIMIENTO;TIPO_VENTA;COD_BARRAS'
    ];

    products.forEach(p => {
      if (!p.plu) return;
      const pluNum = p.plu.replace(/\D/g, '');
      if (!pluNum) return;
      const cleanName = (p.name || 'Corte').replace(/;/g, ' ').slice(0, 24);
      const price = Number(p.price) || 0;
      const isPesable = (p.unit || 'kg').toLowerCase() === 'kg' ? 1 : 2; // 1=pesable, 2=no pesable
      const shelfDays = p.shelfLifeDays || 5;
      const barcode = p.barcode || `20${pluNum.padStart(5, '0')}000000`;

      rows.push(`1;${pluNum};${cleanName};${price};0;${shelfDays};${isPesable};${barcode}`);
    });

    return rows.join('\r\n');
  }

  /**
   * Decodifica una trama de peso recibida por puerto Serie RS-232 / USB / TCP
   * Compatible con protocolo Systel (Cuora, Croma) y Kretz (Report, Novel, Aura)
   */
  parseSerialWeightFrame(rawBufferOrString) {
    const str = String(rawBufferOrString).trim();
    // Systel / Kretz transmiten tramas como "+00.350kg", "ST,GS,+00.350kg", o ASCII con STX/ETX
    const match = str.match(/([+-]?\d{1,3}[\.,]\d{2,3})\s*(kg|g)?/i);
    if (match) {
      const weightNum = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(weightNum)) {
        return {
          success: true,
          weightKg: Math.abs(weightNum),
          isStable: !str.includes('US') && !str.includes('?'),
          raw: str
        };
      }
    }
    return {
      success: false,
      weightKg: 0,
      raw: str
    };
  }
}

export const scaleService = new ScaleService();
