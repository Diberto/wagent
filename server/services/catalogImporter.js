import * as XLSX from 'xlsx';

export function cleanProductName(str) {
  if (!str) return '';
  return str
    .replace(/\uFFFD/g, 'ñ')
    .replace(/Bolsn/gi, 'Bolsón')
    .replace(/Bolsn/gi, 'Bolsón')
    .replace(/Jalapeo/gi, 'Jalapeño')
    .replace(/Jalapeno/gi, 'Jalapeño')
    .replace(/CAA/gi, 'CAÑA')
    .replace(/CAA/gi, 'CAÑA')
    .replace(/COMBO\s+N\s*(\d+)/gi, 'COMBO N° $1')
    .replace(/COMBO\s+N\s*(\d+)/gi, 'COMBO N° $1')
    .replace(/Diseno/gi, 'Diseño')
    .replace(/12 anos/gi, '12 años')
    .replace(/Feliz Dia!/gi, 'Feliz Día!')
    .replace(/SEA/gi, 'SEÑA')
    .replace(/VINAS/gi, 'VIÑAS')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  const s = String(priceStr).replace(/\$/g, '').trim();
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export function detectCategory(name) {
  const l = name.toLowerCase();
  if (l.includes('pehuamar') || l.includes('lays') || l.includes('doritos') || l.includes('cheetos') || l.includes('nachos') || l.includes('twistos') || l.includes('snack') || l.includes('3d queso') || l.includes('tryms') || l.includes('chizitos') || l.includes('saladix')) return 'Snacks';
  if (l.includes('acelga') || l.includes('achicoria') || l.includes('espinaca') || l.includes('lechuga') || l.includes('rucula') || l.includes('rúcula') || l.includes('brocoli') || l.includes('brócoli') || l.includes('coliflor') || l.includes('calabacin') || l.includes('calabaza') || l.includes('remolacha') || l.includes('zapallo') || l.includes('berenjena') || l.includes('zanahoria') || l.includes('cebolla') || (l.includes('tomate') && !l.includes('tomate triturado')) || l.includes('pimiento') || l.includes('morron') || l.includes('morrón') || l.includes('fruta') || l.includes('manzana') || l.includes('banana') || l.includes('pera') || l.includes('naranja') || l.includes('mandarina') || l.includes('limon') || l.includes('limón') || l.includes('palta') || l.includes('durazno') || l.includes('frutilla') || l.includes('uva') || l.includes('anana') || l.includes('ananá') || l.includes('ciruela') || l.includes('sandia') || l.includes('sandía') || l.includes('melon') || l.includes('melón') || l.includes('ajo') || l.includes('choclo') || l.includes('huevo') || l.includes('maple')) return 'Verdulería y Frutas';
  if (l.includes('combo') || l.includes('promo')) return 'Combos y Promociones';
  if (l.includes('asado') || l.includes('vacio') || l.includes('vacío') || l.includes('costilla') || l.includes('bife') || l.includes('entraña') || l.includes('entrana') || l.includes('tapa') || l.includes('lomo') || l.includes('matambre') || l.includes('peceto') || l.includes('cuadril') || l.includes('nalga') || l.includes('paleta') || l.includes('marucha') || l.includes('osobuco') || l.includes('falda') || l.includes('carne vac') || l.includes('aguja') || l.includes('colita') || l.includes('costeleta ancha') || l.includes('costeleta fina') || l.includes('entrecot') || l.includes('bocado') || l.includes('tomahawk') || l.includes('tortuguita') || l.includes('brazuelo') || l.includes('molida')) return 'Parrilla y Vacuno';
  if (l.includes('cerdo') || l.includes('bondiola') || l.includes('carre') || l.includes('carré') || l.includes('pechito') || l.includes('costeleta de cerdo') || l.includes('matambrito') || l.includes('solomillo') || l.includes('lechon') || l.includes('lechón') || l.includes('cabrito')) return 'Cerdo';
  if (l.includes('chori') || l.includes('morcilla') || l.includes('chinchulin') || l.includes('chinchulines') || l.includes('molleja') || l.includes('mollejas') || l.includes('rinon') || l.includes('riñon') || l.includes('riñones') || l.includes('achura') || l.includes('lengua') || l.includes('mondongo') || l.includes('corazon') || l.includes('corazón') || l.includes('tripa') || l.includes('sesos') || l.includes('higado') || l.includes('hígado')) return 'Achuras y Embutidos';
  if (l.includes('pollo') || l.includes('alita') || l.includes('pata muslo') || l.includes('suprema') || l.includes('pechuga') || l.includes('menudo') || l.includes('patitas')) return 'Pollo';
  if (l.includes('milanesa') || l.includes('medallon') || l.includes('medallón') || l.includes('hamburguesa') || l.includes('arrollado') || l.includes('albondiga') || l.includes('albóndiga') || l.includes('merluza')) return 'Elaborados y Milanesas';
  if (l.includes('vino') || l.includes('cerveza') || l.includes('coca') || l.includes('sprite') || l.includes('fanta') || l.includes('fernet') || l.includes('vodka') || l.includes('wisky') || l.includes('whisky') || l.includes('agua') || l.includes('pritty') || l.includes('powerade') || l.includes('monster') || l.includes('sidra') || l.includes('suerox') || l.includes('baggio') || l.includes('cunnington') || l.includes('speed') || l.includes('schweppes') || l.includes('rutini') || l.includes('trumpeter')) return 'Bebidas y Vinos';
  if (l.includes('queso') || l.includes('salame') || l.includes('salamin') || l.includes('salamín') || l.includes('jamon') || l.includes('jamón') || l.includes('panceta') || l.includes('mortadela') || l.includes('provoleta') || l.includes('muzzarella') || l.includes('mozza') || l.includes('cheddar') || l.includes('danbo') || l.includes('sardo') || l.includes('reggianito') || l.includes('fontina') || l.includes('fynbo') || l.includes('gouda') || l.includes('pategras') || l.includes('cremoso') || l.includes('salchicha')) return 'Fiambres y Quesos';
  if (l.includes('carbon') || l.includes('carbón') || l.includes('leña') || l.includes('lena') || l.includes('sal ') || l.includes('especias') || l.includes('oregano') || l.includes('orégano') || l.includes('aji') || l.includes('ají') || l.includes('mayo') || l.includes('mayonesa') || l.includes('chimichurri') || l.includes('chimi') || l.includes('aceite') || l.includes('aceto') || l.includes('aderezo') || l.includes('condimento') || l.includes('fideos') || l.includes('arroz') || l.includes('pure') || l.includes('puré') || l.includes('tomate triturado') || l.includes('pan ') || l.includes('criollos') || l.includes('fajitas') || l.includes('wraps')) return 'Almacén Parrillero';
  if (l.includes('cuchillo') || l.includes('tabla') || l.includes('brasero') || l.includes('disco') || l.includes('parrilla') || l.includes('kit') || l.includes('guante') || l.includes('pala') || l.includes('atizador') || l.includes('set vino')) return 'Bazar y Accesorios';
  return 'General';
}

export function detectUnit(name, cat) {
  const l = name.toLowerCase();
  if (l.includes('combo') || l.includes('box')) return 'combo';
  if (l.includes('bolsa') || l.includes('carbon') || l.includes('carbón') || l.includes('lena') || l.includes('leña') || l.includes('bolson') || l.includes('bolsón')) return 'bolsa';
  if (l.includes('botella') || l.includes('vino') || l.includes('fernet') || l.includes('vodka') || l.includes('whisky') || l.includes('wisky') || l.includes('aceite') || l.includes('aceto')) return 'botella';
  if (l.includes('lata')) return 'lata';
  if (l.includes('pack') || l.includes('x12') || l.includes('x6') || l.includes('x2') || l.includes('x3')) return 'pack';
  if (l.includes('docena') || l.includes('maple')) return 'docena';
  if (l.includes('bandeja') || l.includes('band')) return 'bandeja';
  if (l.includes('tabla') || l.includes('cuchillo') || l.includes('disco') || l.includes('brasero') || l.includes('kit') || l.includes('huevo pascua') || l.includes('flor') || l.includes('guantes') || l.includes('pala') || l.includes('parrilla')) return 'un';
  if (cat === 'Bebidas y Vinos' || cat === 'Bazar y Accesorios' || cat === 'Snacks') return 'un';
  return 'kg';
}

/**
 * Parsea un archivo binario de Excel (.xlsx o .xls) o texto (.csv, .tsv, .json)
 * y retorna un array homogéneo de productos listos para la base de datos.
 */
export function parseProductFile(bufferOrString, filename = 'catalogo.csv') {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'json') {
    const raw = typeof bufferOrString === 'string' ? JSON.parse(bufferOrString) : JSON.parse(bufferOrString.toString('utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.products || []);
    return arr.map(normalizeProductObject);
  }

  // Parsear con SheetJS (soporta .xlsx, .xls, .csv, .tsv, .ods)
  let workbook;
  if (Buffer.isBuffer(bufferOrString)) {
    workbook = XLSX.read(bufferOrString, { type: 'buffer' });
  } else if (typeof bufferOrString === 'string') {
    workbook = XLSX.read(bufferOrString, { type: 'string' });
  } else {
    throw new Error('Formato de archivo no compatible');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows || rows.length < 2) {
    return [];
  }

  // Detectar índices de columnas en la primera fila
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  let codeIdx = headers.findIndex(h => h.includes('cod') || h.includes('plu') || h.includes('sku') || h.includes('id'));
  let barcodeIdx = headers.findIndex(h => h.includes('barcode') || h.includes('barra') || h.includes('ean') || h.includes('upc'));
  let nameIdx = headers.findIndex(h => h.includes('prod') || h.includes('nombre') || h.includes('name') || h.includes('desc') || h.includes('corte') || h.includes('articulo'));
  let priceIdx = headers.findIndex(h => h.includes('prec') || h.includes('price') || h.includes('costo') || h.includes('monto') || h.includes('importe'));
  let ivaIdx = headers.findIndex(h => h.includes('iva') || h.includes('impuesto') || h.includes('alicuota') || h.includes('tasa'));
  let catIdx = headers.findIndex(h => h.includes('cat') || h.includes('rubro') || h.includes('grupo') || h.includes('sector'));
  let unitIdx = headers.findIndex(h => h.includes('uni') || h.includes('medida') || h.includes('tipo'));
  let stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('cant') || h.includes('disp'));

  // Defaults si no tienen encabezados exactos: columna 0 = Cod, columna 1 = Producto, columna 2 = Precio
  if (codeIdx === -1 && rows[0].length >= 1) codeIdx = 0;
  if (nameIdx === -1 && rows[0].length >= 2) nameIdx = 1;
  if (priceIdx === -1 && rows[0].length >= 3) priceIdx = 2;

  const products = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawCode = String(row[codeIdx] ?? '').trim();
    const rawBarcode = barcodeIdx !== -1 ? String(row[barcodeIdx] ?? '').trim() : '';
    const rawName = cleanProductName(String(row[nameIdx] ?? '').trim());
    const rawPrice = row[priceIdx] ?? 0;
    const rawIva = ivaIdx !== -1 ? String(row[ivaIdx] ?? '').replace('%', '').trim() : '';
    const rawCat = catIdx !== -1 ? String(row[catIdx] ?? '').trim() : '';
    const rawUnit = unitIdx !== -1 ? String(row[unitIdx] ?? '').trim() : '';
    const rawStock = stockIdx !== -1 ? Number(row[stockIdx]) : 100;

    if (!rawName) continue;

    const price = Math.round(parsePrice(rawPrice));
    const category = rawCat || detectCategory(rawName);
    const unit = rawUnit || detectUnit(rawName, category);

    const isMeat = /vacio|costill|cuadril|entra[nñ]a|matambre|bondiola|costeleta|ternera|molida|pollo|pata|muslo|achura|chinchulin|molleja/i.test(rawName) || 
                   /parrilla|vacun|cerdo|pollo|achura|tradicional/i.test(category);
    let ivaRate = rawIva ? parseFloat(rawIva) : (isMeat ? 10.5 : 21);
    if (isNaN(ivaRate)) ivaRate = isMeat ? 10.5 : 21;

    let plu = '';
    let barcode = rawBarcode;
    let sku = '';

    // Manejo de códigos PLU vs Código de Barras vs Notación Científica de Excel
    if (/^[0-9]+,[0-9]+E\+[0-9]+$/i.test(rawCode) || /^[0-9]+\.[0-9]+E\+[0-9]+$/i.test(rawCode)) {
      const num = Number(rawCode.replace(',', '.'));
      barcode = Math.round(num).toString();
      sku = barcode;
    } else if (/^\d{6,}$/.test(rawCode) && !barcode) {
      barcode = rawCode;
      sku = rawCode;
    } else {
      // Soporta tanto PLU alfanumérico (ej: VAC-01, PLU-101, C01) como puramente numérico (ej: 2001, 105)
      plu = rawCode;
      sku = rawCode;
    }

    if (!barcode && plu) {
      const cleanNum = plu.replace(/\D/g, '');
      barcode = cleanNum ? `779${cleanNum.padStart(4, '0')}000001` : '';
    }

    const id = `prod-${plu || barcode || sku || (i + 1)}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    products.push({
      id,
      plu,
      barcode,
      sku,
      name: rawName,
      price,
      ivaRate,
      unit,
      category,
      description: `${category} - Calidad seleccionada República de la Carne`,
      stock: isNaN(rawStock) ? 100 : rawStock,
      isAvailable: true
    });
  }

  return products;
}

export function normalizeProductObject(item, idx = 0) {
  const name = cleanProductName(item.name || item.title || item.Producto || '');
  const category = item.category || item.Categoria || detectCategory(name);
  const unit = item.unit || item.Unidad || detectUnit(name, category);
  const price = Math.round(parsePrice(item.price ?? item.Precio ?? 0));
  const plu = String(item.plu || item.PLU || item.Cod || item['Cod.'] || '').trim();
  const barcode = String(item.barcode || item.Barcode || '').trim();
  const sku = String(item.sku || item.SKU || plu || barcode || '').trim();

  const isMeat = /vacio|costill|cuadril|entra[nñ]a|matambre|bondiola|costeleta|ternera|molida|pollo|pata|muslo|achura|chinchulin|molleja/i.test(name) || 
                 /parrilla|vacun|cerdo|pollo|achura|tradicional/i.test(category);
  const ivaRate = item.ivaRate !== undefined ? Number(item.ivaRate) : (isMeat ? 10.5 : 21);

  return {
    id: item.id || `prod-${plu || barcode || sku || (idx + 1)}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    plu,
    barcode,
    sku,
    name,
    price,
    ivaRate,
    unit,
    category,
    description: item.description || `${category} - Calidad seleccionada República de la Carne`,
    stock: item.stock !== undefined ? Number(item.stock) : 100,
    isAvailable: item.isAvailable !== false
  };
}

/**
 * Genera un archivo exportable en el formato solicitado (.xlsx, .xls, .csv, .json)
 */
export function exportCatalog(products = [], format = 'xlsx') {
  const rows = (products || []).map(p => ({
    'Código PLU': p.plu || '',
    'Código de Barras': p.barcode || '',
    'SKU': p.sku || '',
    'Producto / Corte': p.name || '',
    'Categoría': p.category || '',
    'Precio ($)': p.price || 0,
    'Alícuota IVA (%)': p.ivaRate !== undefined ? p.ivaRate : 10.5,
    'Unidad': p.unit || 'kg',
    'Stock': p.stock !== undefined ? p.stock : 100,
    'Disponible': p.isAvailable ? 'SÍ' : 'NO',
    'Descripción': p.description || ''
  }));

  if (format === 'json') {
    return {
      buffer: Buffer.from(JSON.stringify(products, null, 2), 'utf8'),
      contentType: 'application/json; charset=utf-8',
      extension: 'json'
    };
  }

  if (format === 'csv') {
    // CSV con punto y coma (;) y UTF-8 BOM para compatibilidad total con Excel en español
    const headerKeys = Object.keys(rows[0] || { 'Código PLU': '', 'Producto / Corte': '', 'Precio ($)': '' });
    const csvRows = [
      headerKeys.join(';'),
      ...rows.map(r => headerKeys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
    ];
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    return {
      buffer: Buffer.from(csvContent, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv'
    };
  }

  // Generar Excel con SheetJS (.xlsx o .xls)
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-ajustar anchos de columnas
  const colWidths = [
    { wch: 12 }, // PLU
    { wch: 18 }, // Barcode
    { wch: 12 }, // SKU
    { wch: 45 }, // Producto
    { wch: 24 }, // Categoria
    { wch: 14 }, // Precio
    { wch: 16 }, // IVA
    { wch: 10 }, // Unidad
    { wch: 10 }, // Stock
    { wch: 12 }, // Disponible
    { wch: 45 }  // Descripcion
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo de Carnicería');

  if (format === 'xls') {
    const buffer = XLSX.write(workbook, { bookType: 'biff8', type: 'buffer' });
    return {
      buffer,
      contentType: 'application/vnd.ms-excel',
      extension: 'xls'
    };
  }

  // Default: .xlsx
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx'
  };
}
