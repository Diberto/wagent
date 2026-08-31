import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { SpeechService } from './speech.js';
import { mercadoPagoService } from './mercadopago.js';
import { NeuralMemoryService } from './neuralMemory.js';
import { ChatStrategyGraphService } from './chatStrategyGraph.js';
import { OrderFilterEngine } from './orderFilterEngine.js';
import { 
  getVariedGreeting, 
  getContextualGreeting,
  getVariedPromoIntro, 
  getVariedOrderIntro, 
  getVariedDeliveryQuestion, 
  getVariedClosing, 
  formatNumberedCatalog, 
  getFeaturedWhatsAppOffers,
  getCrossSellingSuggestion,
  pickRandom 
} from './messageVariations.js';

/**
 * Catálogo Maestro de Cortes y Precios de República de la Carne
 */
const MASTER_CATALOG = [
  { 
    plu: '2001',
    keywords: ['combo asadazo', 'combo “asadazo”', 'combo asado', 'asadazo', 'azadazo', 'asasazo', 'asadaso', 'azadaso', 'combo parrillero', 'combo 4kg', 'combo 4 kg', 'combo'], 
    name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', 
    price: 39999, 
    unit: 'combo', 
    category: 'Combos en Oferta' 
  },
  { 
    plu: '2002',
    keywords: ['tapa de cuadril', 'tapa cuadril', 'colita de cuadril', 'cuadril', 'picanha'], 
    name: 'Tapa de Cuadril Seleccionada', 
    price: 12800, 
    unit: 'kg', 
    category: 'Parrilla y Horno' 
  },
  { 
    plu: '2003',
    keywords: ['vacio especial', 'vacío especial', 'vacio tierno', 'vacío tierno', 'vacio', 'vacío'], 
    name: 'Vacío Especial Seleccionado', 
    price: 11500, 
    unit: 'kg', 
    category: 'Parrilla' 
  },
  { 
    plu: '2004',
    keywords: ['costillar de novillito', 'asado de tira novillito', 'costillar', 'asado de tira', 'tira de asado', 'costilla novillito', 'costillar novillito', 'tira novillito', 'costilla'], 
    name: 'Costillar / Asado de Tira Novillito', 
    price: 9800, 
    unit: 'kg', 
    category: 'Parrilla' 
  },
  { 
    plu: '2005',
    keywords: ['bife de chorizo', 'bife chorizo', 'bifes de chorizo', 'ojo de bife', 'bife de lomo'], 
    name: 'Bife de Chorizo Premium', 
    price: 14500, 
    unit: 'kg', 
    category: 'Cortes Premium' 
  },
  { 
    plu: '2006',
    keywords: ['entraña fina', 'entrana fina', 'entraña', 'entrana', 'entrecot', 'enrecor'], 
    name: 'Entraña Fina Seleccionada', 
    price: 16900, 
    unit: 'kg', 
    category: 'Cortes Premium' 
  },
  { 
    plu: '2007',
    keywords: ['matambre de cerdo', 'matambrito de cerdo', 'matambre cerdo', 'matambrito cerdo', 'matambrito'], 
    name: 'Matambrito de Cerdo Tiernizado', 
    price: 8500, 
    unit: 'kg', 
    category: 'Cerdo y Parrilla' 
  },
  { 
    plu: '2008',
    keywords: ['matambre de vaca', 'matambre vacuno', 'matambre'], 
    name: 'Matambre Vacuno', 
    price: 9500, 
    unit: 'kg', 
    category: 'Parrilla y Horno' 
  },
  { 
    plu: '2009',
    keywords: ['bondiola de cerdo', 'bondiola cerdo', 'bondiola'], 
    name: 'Bondiola de Cerdo sin Hueso', 
    price: 8900, 
    unit: 'kg', 
    category: 'Cerdo' 
  },
  { 
    plu: '2010',
    keywords: ['costeleta de cerdo', 'costeletas de cerdo', 'costeleta cerdo', 'costeletas cerdo', 'chuleta de cerdo', 'chuletas de cerdo'], 
    name: 'Costeletas de Cerdo (2kg x $15.000 promo)', 
    price: 7500, 
    unit: 'kg', 
    category: 'Cerdo' 
  },
  { 
    plu: '2011',
    keywords: ['costeleta de ternera', 'costeletas de ternera', 'costeleta ternera', 'costeletas ternera', 'costeleta', 'costeletas'], 
    name: 'Costeletas de Ternera (2kg x $35.000 promo)', 
    price: 17500, 
    unit: 'kg', 
    category: 'Cortes Tradicionales' 
  },
  { 
    plu: '2012',
    keywords: ['chorizo criollo puro cerdo', 'chorizo de cerdo', 'chorizos de cerdo', 'chorizo cerdo', 'chorizos cerdo', 'chori de cerdo', 'choris de cerdo', 'chorizo criollo', 'chori criollo', 'chorizo puro cerdo', 'chorizo', 'chorizos', 'chori', 'choris'], 
    name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', 
    price: 5000, 
    unit: 'kg', 
    category: 'Embutidos' 
  },
  { 
    plu: '2013',
    keywords: ['morcilla bombon', 'morcilla bombón', 'morcillas bombon', 'morcillas bombón', 'morcilla', 'morcillas'], 
    name: 'Morcilla Bombón Parrillera', 
    price: 5200, 
    unit: 'kg', 
    category: 'Embutidos' 
  },
  { 
    plu: '2014',
    keywords: ['molleja de corazon', 'mollejas de corazon', 'molleja', 'mollejas'], 
    name: 'Mollejas de Corazón', 
    price: 14800, 
    unit: 'kg', 
    category: 'Achuras' 
  },
  { 
    plu: '2015',
    keywords: ['chinchulin', 'chinchulines', 'chinchu'], 
    name: 'Chinchulines Crocantes', 
    price: 4800, 
    unit: 'kg', 
    category: 'Achuras' 
  },
  { 
    plu: '2016',
    keywords: ['carne molida especial', 'molida especial', 'picada especial', 'carne picada especial', 'molida de primera', 'molida magra', 'picada de primera', 'picada magra'], 
    name: 'Carne Molida Especial Seleccionada (Magra)', 
    price: 11800, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    plu: '2017',
    keywords: ['carne molida intermedia', 'molida intermedia', 'carne molida comun', 'molida comun', 'carne molida común', 'molida común', 'carne molida', 'carne picada', 'molida', 'picada'], 
    name: 'Carne Molida Intermedia (3kg x $27.000 promo)', 
    price: 9000, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    plu: '2018',
    keywords: ['milanesas de ternera', 'milanesa de ternera', 'milanesas', 'milanesa'], 
    name: 'Milanesas de Ternera preparadas (2kg x $24.990)', 
    price: 12495, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    plu: '2019',
    keywords: ['pata muslo', 'pollo fresco', 'pollo', 'suprema de pollo', 'pechuga'], 
    name: 'Pata Muslo Fresca (3kg x $13.990 promo)', 
    price: 4660, 
    unit: 'kg', 
    category: 'Pollo' 
  },
  { 
    plu: '2020',
    keywords: ['carbon quebracho', 'carbón quebracho', 'bolsa de carbon', 'bolsa de carbón', 'carbon', 'carbón'], 
    name: 'Carbón Quebracho Blanco (Bolsa Grande)', 
    price: 2200, 
    unit: 'bolsa', 
    category: 'Almacén Parrillero' 
  },
  { 
    plu: '2021',
    keywords: ['vino howlmande', 'howlmande malbec', 'vino', 'howlmande', 'malbec'], 
    name: 'Vino Howlmande Malbec Reserva', 
    price: 5500, 
    unit: 'botella', 
    category: 'Bebidas' 
  }
];

export const OFFICIAL_BRANCHES_MENU = [
  { id: 'branch_urca_1', name: 'Urca Central', address: 'Av. José Roque Funes 1115', keywords: ['urca central', 'funes', 'urca 1', 'roque funes'] },
  { id: 'branch_urca_2', name: 'Urca 2 – Alto Tejeda', address: 'Av. Menéndez Pidal 3575', keywords: ['urca 2', 'alto tejeda', 'pidal', 'menendez pidal'] },
  { id: 'branch_intercountry', name: 'Intercountry – Corteza Mall', address: 'Av. Los Álamos 1015', keywords: ['intercountry', 'corteza mall', 'los alamos', 'alamos'] },
  { id: 'branch_duarte_quiros', name: 'Duarte Quirós', address: 'Av. Duarte Quirós 5130', keywords: ['duarte quiros', 'quiros', 'duarte'] },
  { id: 'branch_villa_allende', name: 'Villa Allende – Mercadito de la Villa', address: 'Av. Figueroa Alcorta 480', keywords: ['villa allende', 'allende', 'alcorta', 'figueroa alcorta'] },
  { id: 'branch_san_isidro', name: 'Country San Isidro – Alto Tejeda', address: 'Av. Padre Luchesse km 2', keywords: ['san isidro', 'luchesse', 'padre luchesse', 'country san isidro'] }
];

export function formatBranchMenu() {
  const numIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  return OFFICIAL_BRANCHES_MENU.map((b, idx) => `${numIcons[idx]} *${b.name}* (📍 ${b.address})`).join('\n');
}

/**
 * Parsea dinámicamente la opción de asesoramiento de asado recomendada (Opción 1, 2 o 3)
 * desde el mensaje previo del agente, extrayendo los cortes, cantidades exactas y total.
 */
export function parseAsadoOptionFromMessage(msg, optNum) {
  if (!msg || typeof msg !== 'string') return null;
  const parts = msg.split(/(?:1️⃣|2️⃣|3️⃣)/);
  if (parts.length <= optNum) return null;

  const rawBlock = parts[optNum];
  const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);

  let title = `Opción ${optNum}`;
  const firstLine = lines[0] || '';
  const titleClean = firstLine.replace(/^[*_#\s]+|[*_#:\s]+$/g, '').trim();
  if (titleClean) {
    title = titleClean;
  }

  const items = [];
  let total = 0;

  for (const line of lines) {
    const totalMatch = line.match(/(?:Total|Total acumulado)[\s\S]*?\$([\d.,]+)/i);
    if (totalMatch) {
      total = parseInt(totalMatch[1].replace(/\D/g, ''), 10);
    }

    if (line.startsWith('•') || line.startsWith('* ') || line.startsWith('- ')) {
      const clean = line.replace(/^[•*\-\s]+/, '').trim();
      if (/total|complemento|opcional|respondé|cómo seguimos/i.test(clean)) continue;
      
      let formatted = clean;
      const priceParens = clean.match(/\(\s*\$([\d.,]+)\s*\)/);
      if (priceParens) {
        formatted = clean.replace(/\s*\(\s*\$([\d.,]+)\s*\)/, (m, p1) => ` — $${p1}`);
      }
      items.push(`• ${formatted}`);
    }
  }

  if (total === 0 && items.length > 0) {
    for (const itm of items) {
      const pMatch = itm.match(/—\s*\$([\d.,]+)/);
      if (pMatch) {
        total += parseInt(pMatch[1].replace(/\D/g, ''), 10);
      }
    }
  }

  return { title, items, total };
}

/**
 * Detecta si la consulta del cliente menciona un corte de carne genérico o ambiguo
 * con 2 o más opciones disponibles en el catálogo activo (ej: "cuadril", "matambre", "chorizo", "milanesas", "costilla")
 * y retorna la lista de opciones para que el agente consulte y aclare antes de asumir un corte erróneo.
 */
export function findAmbiguousProducts(chunk, dynamicCatalog = null) {
  const c = (chunk || '').toLowerCase().trim();
  if (!c) return null;

  const rawList = (dynamicCatalog && dynamicCatalog.length > 0) ? dynamicCatalog : (db.getProducts() || MASTER_CATALOG);

  const eligibleCatalog = rawList.filter(p => {
    const price = Number(p.price) || 0;
    if (price <= 0 || price === 1) return false;
    if (p.isAvailable === false || p.showInWhatsApp === false) return false;
    if (/pehuamar|lays|doritos|3d queso|tryms|acelga|achicoria/i.test(p.name)) return false;
    return true;
  });

  const ambiguousPatterns = [
    {
      term: 'CUADRIL',
      matchRegex: /\b(?:cuadril|colita|tapita)\b/i,
      exactRegex: /\b(?:tapa de cuadril|tapa cuadril|colita de cuadril|tapita de cuadril|picanha)\b/i,
      filter: p => {
        const n = (p.name || '').toLowerCase();
        return n.includes('cuadril') || n.includes('picanha');
      }
    },
    {
      term: 'MATAMBRE',
      matchRegex: /\bmatambre\b/i,
      exactRegex: /\b(?:matambre vacuno|matambre cv|matambre de cerdo|matambrito|matambre arrollado)\b/i,
      filter: p => {
        const n = (p.name || '').toLowerCase();
        return n.includes('matambre') || n.includes('matambrito');
      }
    },
    {
      term: 'CHORIZO',
      matchRegex: /\b(?:chorizo|chorizos|chori|choris)\b/i,
      exactRegex: /\b(?:chorizo de cerdo|chorizo criollo|chorizo puro cerdo|chorizo con cheddar|chorizo gourmet|chorizo dubai|bife de chorizo)\b/i,
      filter: p => {
        const n = (p.name || '').toLowerCase();
        if (n.includes('bife de chorizo')) return false;
        return n.includes('chorizo') || n.includes('chori');
      }
    },
    {
      term: 'MILANESAS',
      matchRegex: /\b(?:milanesa|milanesas|mila|milas)\b/i,
      exactRegex: /\b(?:milanesas? de ternera|milanesas? de pollo|milanesas? de cerdo|milanesas? preparadas?)\b/i,
      filter: p => {
        const n = (p.name || '').toLowerCase();
        return n.includes('milanesa') || n.includes('mila');
      }
    },
    {
      term: 'COSTILLAS / COSTELETAS',
      matchRegex: /\b(?:costillas?|costeletas?)\b/i,
      exactRegex: /\b(?:asado de tira|costillar|costillar novillito|costeletas? de ternera|costeletas? de cerdo)\b/i,
      filter: p => {
        const n = (p.name || '').toLowerCase();
        if (n.includes('entraña')) return false;
        return n.includes('costillar') || n.includes('costilla') || n.includes('costeleta') || n.includes('asado de tira');
      }
    }
  ];

  for (const group of ambiguousPatterns) {
    if (group.matchRegex.test(c) && !group.exactRegex.test(c)) {
      const matches = eligibleCatalog.filter(group.filter);
      if (matches.length >= 2) {
        return {
          term: group.term,
          matches: matches.slice(0, 4)
        };
      }
    }
  }

  return null;
}

/**
 * Encuentra el producto que mejor encaja en un texto buscando coincidencia por PLU, código, número de opción o palabras clave
 * garantizando que NUNCA se seleccionen productos con precio $0, snacks o artículos de verdulería por error.
 */
export function matchBestProduct(chunk, dynamicCatalog = null) {
  const c = (chunk || '').toLowerCase().trim();
  if (!c) return null;

  const rawList = (dynamicCatalog && dynamicCatalog.length > 0) ? dynamicCatalog : (db.getProducts() || MASTER_CATALOG);

  // 1. Filtrar solo productos válidos para venta por WhatsApp (precio > 0, disponibles y carnicería)
  const isExplicitSnackMention = /papas?\s+pehuamar|pehuamar|lays|doritos|3d queso|tryms|chizitos|saladix/i.test(c);
  const isExplicitVerduraMention = /acelga|achicoria|lechuga|tomate|rucula|espinaca/i.test(c);

  const eligibleCatalog = rawList.filter(p => {
    const price = Number(p.price) || 0;
    if (price <= 0 || price === 1) return false;
    if (p.isAvailable === false) return false;

    const cat = p.category || '';
    if (cat === 'Snacks' && !isExplicitSnackMention) return false;
    if (cat === 'Verdulería y Frutas' && !isExplicitVerduraMention) return false;
    if (cat === 'General' && /bolsa|caja|rollo|seña|sea|tarjeta|carton/i.test(p.name)) return false;
    if (/pehuamar|lays|doritos|3d queso|tryms/i.test(p.name) && !isExplicitSnackMention) return false;

    return true;
  });

  // 2. Coincidencia directa por PLU ("PLU 4", "código 49", "#1")
  const pluMatch = c.match(/(?:plu|c[oó]digo|cod\.?|corte)\s*#?\s*([0-9]{1,5})/i);
  if (pluMatch) {
    const requestedPlu = pluMatch[1];
    const foundByPlu = eligibleCatalog.find(p => p.plu && (String(p.plu).trim() === requestedPlu || parseInt(p.plu, 10) === parseInt(requestedPlu, 10)));
    const isDirectPluCommand = /^(?:plu|c[oó]digo|cod\.?|corte)?\s*#?\s*[0-9]{1,5}\s*$/i.test(c) || /^(?:quiero|dame|pasame|precio\s+del?|el)\s+(?:plu|c[oó]digo|cod\.?)\s*#?\s*[0-9]{1,5}$/i.test(c);
    if (foundByPlu && (isDirectPluCommand || c.includes(foundByPlu.name.toLowerCase()))) {
      return foundByPlu;
    }
  }

  // 3. Coincidencia por número ordinal en menú ("opción 1", "combo 2")
  const explicitProductNumMatch = c.match(/(?:combo|item|opci[oó]n\s+de\s+corte|opci[oó]n)\s+([1-9]|1[0-9]|20)/i);
  if (explicitProductNumMatch) {
    const idx = parseInt(explicitProductNumMatch[1], 10) - 1;
    const featured = getFeaturedWhatsAppOffers(eligibleCatalog);
    if (idx >= 0 && idx < featured.length) {
      return featured[idx];
    }
  }

  // 4. Scoring semántico de relevancia
  let bestMatch = null;
  let bestScore = 0;

  for (const prod of eligibleCatalog) {
    const pName = (prod.name || '').toLowerCase();
    const pCat = (prod.category || '').toLowerCase();
    let score = 0;

    const isComboAsadazoQuery = /(?:combo\s+asadazo|asadazo)/i.test(c);
    const isCarbonQuery = /(?:carb[oó]n|bolsa\s+de\s+carb[oó]n|le[ñn]a)/i.test(c);
    const isChorizoQuery = /(?:chorizo|chorizos|chori|choris)/i.test(c);
    const isCerdoQuery = /(?:cerdo|puro cerdo)/i.test(c);
    const isMatambreQuery = /(?:matambre|matambrito)/i.test(c);
    const isVacioQuery = /(?:vacio|vacío)/i.test(c);
    const isCostillaQuery = /(?:asado de tira|costillar|tira novillito|costilla|\btira\b|\basado\b)/i.test(c) && !isComboAsadazoQuery;
    const isBifeChorizoQuery = /(?:bife de chorizo|bife chorizo|bifes)/i.test(c);
    const isTapaCuadrilQuery = /(?:tapa de cuadril|tapa cuadril|picanha)/i.test(c);
    const isEntranaQuery = /(?:entraña|entrana)/i.test(c);

    // Carbón
    if (isCarbonQuery) {
      if (pName.includes('carbón') || pName.includes('carbon') || prod.id === 'prod_carbon') {
        score += 850;
      }
    }

    // Combo Asadazo
    if (isComboAsadazoQuery) {
      if (pName.includes('asadazo') || prod.id === 'prod_asadazo') {
        score += 1000;
      }
    }

    // Evitar que "bife de chorizo" matchee como "chorizo embutido" y viceversa
    if (isChorizoQuery && !isBifeChorizoQuery && pName.includes('bife de chorizo')) {
      continue;
    }
    if (isBifeChorizoQuery && pName.includes('bife de chorizo')) {
      score += 500;
    }

    // Chorizo de cerdo vs otros chorizos
    if (isChorizoQuery && isCerdoQuery) {
      if (pName.includes('chorizo de cerdo') || pName.includes('chorizo criollo puro cerdo') || (pName.includes('chorizo') && pCat.includes('cerdo'))) {
        score += 600;
      }
    } else if (isChorizoQuery && !isBifeChorizoQuery) {
      if (pName.includes('chorizo criollo') || pName.includes('chorizo de cerdo') || pName === 'chorizo' || pName === 'chorizos') {
        score += 350;
      }
    }

    // Matambre vacuno vs matambre de cerdo vs arrollado
    if (isMatambreQuery) {
      if (isCerdoQuery || c.includes('cerdo') || c.includes('matambrito')) {
        if (pName.includes('matambre cerdo') || pName.includes('matambrito')) score += 600;
      } else if (c.includes('arrollado')) {
        if (pName.includes('arrollado')) score += 600;
      } else {
        if (pName.includes('arrollado')) {
          score += 150;
        } else if (pName === 'matambre cv' || pName === 'matambre vacuno' || pName === 'matambre' || (pName.includes('matambre') && !pName.includes('cerdo') && !pName.includes('arrollado'))) {
          score += 650;
        }
      }
    }

    // Vacío
    if (isVacioQuery && (pName.includes('vacio') || pName.includes('vacío'))) {
      score += 400;
    }

    // Costillar / Asado de Tira Novillito
    if (isCostillaQuery) {
      if (pName.includes('asado de tira') || pName.includes('costillar / asado de tira') || pName.includes('costillar') || (pName.includes('costilla') && !pName.includes('entraña'))) {
        score += 500;
        if (c.includes('asado') && pName.includes('asado')) score += 300;
        if (c.includes('novillito') && pName.includes('novillito')) score += 200;
        if (c.includes('tira') && pName.includes('tira')) score += 150;
      }
    }

    // Tapa de Cuadril / Tapita / Picanha
    if (isTapaCuadrilQuery) {
      if (c.includes('tapita') && pName.includes('tapita')) {
        score += 900;
      } else if (pName.includes('tapa de cuadril') || pName.includes('tapa cuadril') || pName.includes('picanha') || prod.id === 'prod_tapa_cuadril') {
        score += 850;
      } else if (pName.includes('cuadril')) {
        score += 50;
      }
    }

    // Entraña
    if (isEntranaQuery && (pName.includes('entraña') || pName.includes('entrana'))) {
      score += 450;
    }

    // Exact & base string containment
    const cleanPName = pName.replace(/\(.*?\)/g, '').replace(/[“”"']/g, '').trim();
    const basePName = cleanPName.replace(/\b(?:seleccionad[oa]|premium|tiernizad[oa]|especial|preparad[oa]s?|fresc[oa]s?)\b/gi, '').trim();
    if (cleanPName.length >= 3 && c.includes(cleanPName)) {
      score += cleanPName.length * 12;
    } else if (basePName.length >= 3 && c.includes(basePName)) {
      score += basePName.length * 10;
    }

    // Check keywords
    const keywords = prod.keywords || [cleanPName, pName];
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (c.includes(kwLower)) {
        score += kwLower.length * 5;
      }
    }

    // Bonus por categorías cárnicas prioritarias (solo si ya tuvo coincidencia positiva)
    if (score > 0 && ['parrilla y vacuno', 'cerdo', 'achuras y embutidos', 'elaborados y milanesas', 'pollo', 'combos y promociones'].includes(pCat)) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = prod;
    }
  }

  if (!bestMatch && dynamicCatalog !== MASTER_CATALOG) {
    return matchBestProduct(chunk, MASTER_CATALOG);
  }

  return bestMatch;
}

/**
 * Busca productos en el catálogo maestro por término o palabra clave
 */
export function searchCatalogProducts(query, catalog = null, limit = 8) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];

  const list = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || MASTER_CATALOG);
  const results = [];

  for (const p of list) {
    const name = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const plu = p.plu ? String(p.plu).trim() : '';

    if (name.includes(q) || cat.includes(q) || (plu && (plu === q || `plu ${plu}`.includes(q)))) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Encuentra todos los productos del catálogo mencionados en un texto
 */
export function findAllMentionedProducts(text, catalog = null) {
  if (!text || typeof text !== 'string') return [];
  const list = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || MASTER_CATALOG);
  const found = [];
  const lower = text.toLowerCase();

  // Dividir por conectores ("y", ",", "con", "más", "ademas", etc.)
  const chunks = lower.split(/[\n,]+|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+|\s+adem[aá]s\s+/i);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.length < 3) continue;
    const match = matchBestProduct(trimmed, list);
    if (match && !found.some(f => f.id === match.id || f.name === match.name)) {
      found.push(match);
    }
  }

  // Si por chunks no encontró o encontró pocos, probar con matchBestProduct directo
  if (found.length === 0) {
    const directMatch = matchBestProduct(text, list);
    if (directMatch) found.push(directMatch);
  }

  return found;
}

/**
 * Genera la consulta interactiva de cantidad (peso en kg vs unidades/bifes) según el tipo de producto solicitado
 */
export function formatProductQuantityPrompt(matchedProducts, clientName) {
  const prods = Array.isArray(matchedProducts) ? matchedProducts : [matchedProducts];
  if (prods.length === 0) return '';

  if (prods.length === 1) {
    const p = prods[0];
    const u = (p.unit || 'kg').toLowerCase();
    const name = p.name;
    const priceFormatted = `$${Number(p.price || 0).toLocaleString('es-AR')}`;
    const pluTag = p.plu ? ` [PLU ${p.plu}]` : '';

    // 1. Combos o Promociones
    if (u === 'combo' || /combo/i.test(name)) {
      return `¡Espectacular elección ${clientName}! ⭐ Te preparo *${name}*${pluTag} (${priceFormatted}).\n\n` +
        `👉 *¿Qué cantidad de combos te gustaría encargar?*\n` +
        `• Podés indicarme la cantidad de combos (ej: *1 combo*, *2 combos*).\n\n` +
        `¡Apenas me confirmes la cantidad te lo dejo registrado al instante! 🙌 [[STAGE:proposal]]`;
    }

    // 2. Almacén / Carbón / Vinos / Bebidas / Complementos
    if (u === 'bolsa' || u === 'botella' || u === 'paquete' || /carbón|carbon|vino|bebida|salsa|chimichurri/i.test(name)) {
      const unitName = u === 'bolsa' ? 'bolsas' : (u === 'botella' ? 'botellas' : 'unidades');
      return `¡Genial ${clientName}! 🪵 Sumamos *${name}*${pluTag} (${priceFormatted} / ${u}).\n\n` +
        `👉 *¿Cuántas ${unitName} te gustaría que te agreguemos?* (ej: *1*, *2*, *3*).\n\n` +
        `¡Avisame la cantidad para sumarlo a tu pedido! 🙌 [[STAGE:proposal]]`;
    }

    // 3. Embutidos / Achuras / Hamburguesas / Milanesas / Pollo / Costeletas
    if (/chorizo|chori|morcilla|hamburguesa|milanesa|costeleta|pata muslo|achura|molleja|chinchul/i.test(name)) {
      return `¡De diez ${clientName}! 🌭 Tenemos *${name}*${pluTag} súper fresco (${priceFormatted} / ${u}).\n\n` +
        `👉 *¿Qué cantidad te preparamos?*\n` +
        `• 🔢 **Por Unidades:** ¿Cuántas unidades precisás? (ej: *4 unidades*, *6 chorizos*, *8 milanesas*)\n` +
        `• ⚖️ **Por Kilos:** ¿O preferís por peso? (ej: *1 kg*, *1.5 kg*, *2 kg* o *medio kilo*)\n\n` +
        `¡Decime la cantidad que prefieras y te lo calculo al instante! 🙌 [[STAGE:proposal]]`;
    }

    // 4. Carnes y cortes tradicionales (Vacío, Asado, Costillar, Bife, Matambre, Entraña, Tapa, Lomo, etc.)
    return `¡Excelente elección ${clientName}! 🥩 Te preparo *${name}*${pluTag} (${priceFormatted} / ${u}).\n\n` +
      `👉 *¿Qué cantidad te gustaría que te separemos?*\n` +
      `• ⚖️ **Por Peso en Kilos:** ¿Cuántos kilos o gramos? (ej: *1 kg*, *1.5 kg*, *2 kg* o *medio kilo*)\n` +
      `• 🥩 **Por Unidades / Bifes / Porciones:** ¿Cuántos bifes o comensales? (ej: *4 bifes*, *6 tiras*, *para 4 personas*)\n\n` +
      `¡Apenas me indiques la cantidad te lo dejo registrado al instante! 🙌 [[STAGE:proposal]]`;
  }

  // Si el cliente nombró 2 o más productos sin cantidad (ej: "vacio y chorizos", "asado, matambre y carbon")
  const productQuestions = prods.map(p => {
    const u = (p.unit || 'kg').toLowerCase();
    const priceFormatted = `$${Number(p.price || 0).toLocaleString('es-AR')}`;
    if (/chorizo|chori|morcilla|hamburguesa|milanesa/i.test(p.name)) {
      return `• 🌭 *${p.name}* (${priceFormatted}/${u}) ➔ ¿Cuántas **unidades** (ej: *6 unidades*) o **kilos** (ej: *1 kg*)?`;
    }
    if (/carbón|carbon|vino|bebida/i.test(p.name)) {
      return `• 🪵 *${p.name}* (${priceFormatted}) ➔ ¿Cuántas **bolsas / botellas**? (ej: *1*, *2*)`;
    }
    if (/combo/i.test(p.name)) {
      return `• ⭐ *${p.name}* (${priceFormatted}) ➔ ¿Cuántos **combos**? (ej: *1 combo*)`;
    }
    return `• 🥩 *${p.name}* (${priceFormatted}/${u}) ➔ ¿Cuántos **kilos** (ej: *1.5 kg*, *2 kg*) o **bifes / porciones** (ej: *4 bifes*)?`;
  }).join('\n');

  return `¡Excelente selección ${clientName}! 🥩 Te anoto los productos pedidos:\n\n` +
    `${productQuestions}\n\n` +
    `👉 *Indicame las cantidades de cada uno* (ej: *2 kg de vacío y 6 chorizos*) y te armo el pedido con el total exacto. 🙌 [[STAGE:proposal]]`;
}

/**
 * Obtiene cortes y productos filtrados por categoría para venta en WhatsApp
 */
export function getCatalogByCategory(categoryQuery, catalog = null, limit = 8) {
  const cq = (categoryQuery || '').toLowerCase().trim();
  const rawList = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || MASTER_CATALOG);
  
  let validList = rawList.filter(p => {
    const price = Number(p.price) || 0;
    if (price <= 0 || price === 1) return false;
    if (p.isAvailable === false) return false;
    if (/pehuamar|lays|doritos|3d queso|tryms|acelga|achicoria/i.test(p.name)) return false;
    return true;
  });

  if (cq === 'chori' || cq === 'chorizo' || cq === 'embutido') {
    validList = validList.filter(p => !p.name.toLowerCase().includes('bife de chorizo'));
  }

  return validList.filter(p => {
    const cat = (p.category || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return cat.includes(cq) || name.includes(cq);
  }).slice(0, limit);
}

/**
 * Encuentra el último producto del catálogo mencionado en el historial de mensajes
 */
function findLastMentionedProduct(history) {
  if (!history || !Array.isArray(history) || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const content = msg.content || '';
    const chunks = content.split(/[\n,\.]+|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+/i);
    for (const chunk of chunks) {
      const prod = matchBestProduct(chunk);
      if (prod) {
        return prod;
      }
    }
  }
  return null;
}

/**
 * Parsea cantidades tanto en kilos como en unidades calculadas (ej: 6 chorizos = 0.75 kg aprox)
 */
export function parseQuantityAndMode(str, prod = null) {
  const s = (str || '').toLowerCase();
  
  // Detección explícita de kilos vs unidades
  const hasKgMention = /(?:kilo|kilos|kg|kgs|grs|gramos)\b/i.test(s);
  const isUnitMention = !hasKgMention && /(?:unidades?|\bun\b|chorizos?|chori|choris|morcillas?|bifes?|costeletas?|chuletas?|piezas?|patas?)/i.test(s);

  // Default units per kg map (promedio 7 a 9 para chorizos = 8)
  const unitsPerKg = prod?.unitsPerKg || (
    /chorizo|chori/i.test(prod?.name || s) ? 8 :
    /morcilla/i.test(prod?.name || s) ? 7 :
    /costeleta/i.test(prod?.name || s) ? 4 :
    /milanesa/i.test(prod?.name || s) ? 6 :
    /bife/i.test(prod?.name || s) ? 3 :
    /pollo|pata/i.test(prod?.name || s) ? 3 : 1
  );

  // Verificar si el número en el texto es en realidad una referencia a opción de menú (ej: "el combo 2", "combo 2", "opcion 3", "el corte 4", "el 8", "la 1")
  const isMenuOptionRef = /(?:el\s+combo|la\s+opci[oó]n|el\s+corte|la\s+promo|combo|opci[oó]n|corte|promo|el|la)\s+([1-9]|1[0-9]|20)\b/i.test(s) &&
    !/(?:\b(?:[2-9]|1[0-9])\s+(?:kg|kilos?|combos?|unidades?|piezas?|bolsas?|botellas?|de\s+los\s+combos?))/i.test(s);

  let num = 1;
  const numMatch = s.match(/([0-9]+(?:[\.,][0-9]+)?)/);

  if (/(?:medio\s+kilo|1\/2\s*kg|medio\b)/i.test(s)) {
    return { quantity: 0.5, isUnitMode: false, unitCount: 0, label: '0.5 kg' };
  } else if (isMenuOptionRef) {
    num = 1;
  } else if (numMatch) {
    const val = parseFloat(numMatch[1].replace(',', '.'));
    if (val <= 30 || /(?:kg|kilo|kilos|unidades|chorizo|morcilla|bife|costeleta)/i.test(s)) {
      num = val;
    }
  } else if (/(?:dos\s+solos|2\s+solos|\bdos\b)/i.test(s)) num = 2;
  else if (/(?:tres\b)/i.test(s)) num = 3;
  else if (/(?:cuatro\b)/i.test(s)) num = 4;
  else if (/(?:cinco\b)/i.test(s)) num = 5;
  else if (/(?:seis\b)/i.test(s)) num = 6;
  else if (/(?:siete\b)/i.test(s)) num = 7;
  else if (/(?:ocho\b)/i.test(s)) num = 8;
  else if (/(?:nueve\b)/i.test(s)) num = 9;
  else if (/(?:diez\b)/i.test(s)) num = 10;
  else if (/(?:doce\b)/i.test(s)) num = 12;
  else if (/(?:un\s+solo|una\s+sola|1\s+solo|uno\s+solo|solo\s+un|solo\s+1|\bun\b|\buno\b|\buna\b)/i.test(s)) num = 1;

  // Si se pidió por unidades y el producto se calcula por kg (ej: chorizos, morcillas)
  if (isUnitMention && unitsPerKg > 1 && prod?.unit !== 'combo' && prod?.unit !== 'bolsa' && prod?.unit !== 'botella') {
    const estimatedKg = Number((num / unitsPerKg).toFixed(2));
    return {
      quantity: estimatedKg,
      isUnitMode: true,
      unitCount: num,
      unitsPerKg,
      label: `${num} Unidades`
    };
  }

  const isCombo = (prod?.unit || '').toLowerCase() === 'combo' || /combo/i.test(prod?.name || '');
  const isBolsa = (prod?.unit || '').toLowerCase() === 'bolsa' || /bolsa|carb[oó]n/i.test(prod?.name || '');
  const isBotella = (prod?.unit || '').toLowerCase() === 'botella' || /botella|vino/i.test(prod?.name || '');

  let label = `${num} ${prod?.unit || 'kg'}`;
  if (isCombo) label = `${num} combo${num > 1 ? 's' : ''}`;
  else if (isBolsa) label = `${num} bolsa${num > 1 ? 's' : ''}`;
  else if (isBotella) label = `${num} botella${num > 1 ? 's' : ''}`;

  return {
    quantity: num,
    isUnitMode: isCombo || isBolsa || isBotella,
    unitCount: isCombo || isBolsa || isBotella ? num : 0,
    unitsPerKg,
    label
  };
}

function parseQuantity(str) {
  return parseQuantityAndMode(str).quantity;
}

/**
 * Validador de nombres reales vs palabras basura
 */
function isGarbageName(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.toLowerCase().trim();
  if (n.length < 3 || n.length > 40) return true;
  if (/[0-9]/.test(n)) return true;
  const blacklist = /domicilio|casa|repartidor|efectivo|transferencia|combo|asadazo|envio|pedido|asado|hola|gracias|confirmar|ok|quiero|tal cual|eso asi|contacto|desconocido|cliente|recuerda|funes|locelso|duarte|quiros|urca/i;
  return blacklist.test(n);
}

/**
 * Validador de direcciones reales vs intenciones genéricas
 */
function isGarbageAddress(addr) {
  if (!addr || typeof addr !== 'string') return true;
  const a = addr.toLowerCase().trim();
  if (a.length < 4) return true;
  if (!/[0-9]/.test(a) && !/funes|locelso|pidal|quiros|alamos|alcorta|colon|cerro|urca|tejeda/i.test(a)) return true;
  if (/^(?:mi domicilio|mi casa|a mi domicilio|domicilio|ok quiero|para envio|para envío)$/i.test(a)) return true;
  return false;
}

/**
 * Extrae y aísla con precisión exclusivamente la dirección real (Calle, Número, Piso, Barrio)
 * descartando introducciones conversacionales, saludos, nombres y frases accesorias.
 */
export function extractCleanAddress(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let a = rawText.trim();

  // 0. Extraer segmento específico si viene introducido en medio del texto conversacional
  const midMatch = a.match(/(?:(?:y\s+)?(?:la\s+direcci[oó]n|mi\s+direcci[oó]n|mi\s+domicilio|la\s+dir|mi\s+dir)(?:\s+(?:de\s+entrega|de\s+env[ií]o|para\s+el\s+env[ií]o))?\s*(?:es|ser[ií]a)?\s*[:=;\-–—]?|direcci[oó]n\s*[:=]|domicilio\s*[:=]|vivo\s+en|estoy\s+en|mand[aá]melo\s+a|mandamelo\s+a|envi[aá]melo\s+a|enviamelo\s+a|mandalo\s+a|mandar\s+a|enviar\s+a|envialo\s+a|mandame\s+a|enviame\s+a|entregar\s+en|para\s+el\s+env[ií]o\s+a|para\s+el\s+envio\s+a|para\s+el\s+repartidor\s+a)\s*[:=;\-–—]?\s*(.+)$/i);
  if (midMatch && midMatch[1]) {
    a = midMatch[1].trim();
  }

  // 1. Quitar saludos iniciales y menciones de Carlos
  a = a.replace(/^(?:hola,?\s*)?(?:buen(?:os)?\s*d[ií]as?|buenas\s*tardes|buenas\s*noches|buenas|carlos)?\s*[,:;-]?\s*/gi, '');

  // 2. Quitar frases conversacionales introductorias completas de dirección
  a = a.replace(/^(?:te\s+paso|te\s+dejo|te\s+mando|te\s+envio|te\s+envío|anot[aá]|anotame|guard[aá]|registra|registrame|cambia|cambiame|modifica|modificame|actualiza|actualizame)?\s*(?:mi|la)?\s*(?:nueva\s*)?(?:direcci[oó]n|domicilio|dir)\s*(?:de\s+entrega|de\s+env[ií]o|para\s+el\s+env[ií]o|para\s+el\s+repartidor)?\s*(?:es|ser[ií]a)?\s*[:=;\-–—]?\s*/gi, '');

  a = a.replace(/^(?:la\s+direcci[oó]n\s+(?:de\s+entrega\s+)?es|mi\s+direcci[oó]n\s+(?:de\s+entrega\s+)?es|mi\s+domicilio\s+es|vivo\s+en|estoy\s+en|mand[aá]melo\s+a|mandamelo\s+a|envi[aá]melo\s+a|enviamelo\s+a|mandalo\s+a|mandar\s+a|enviar\s+a|envialo\s+a|mandame\s+a|enviame\s+a|entregar\s+en|para\s+el\s+env[ií]o\s+a|para\s+el\s+envio\s+a|para\s+el\s+repartidor\s+a)\s*[:=;\-–—]?\s*/gi, '');

  a = a.replace(/^(?:ser[ií]a\s+en|ser[ií]a\s+a|seria\s+en|es\s+en|es\s+a|a\s+la\s+calle|calle)\s*[:=;\-–—]?\s*/gi, '');

  // 3. Quitar menciones de combos o pedidos al inicio
  a = a.replace(/^(?:quiero|mandame|enviame|traeme|armame)?\s*(?:un\s*)?(?:combo\s*)?(?:asadazo\s*)?(?:para|\ba\b)?\s*/gi, '');
  a = a.replace(/^(?:a\s+mi\s+domicilio|al\s+domicilio|para\s+env[ií]o|para\s+envio),?\s*/gi, '');

  // 4. Quitar datos del cliente o notas de pago que vengan al final
  a = a.replace(/[,.]?\s*(?:a\s+nombre\s+de|nombre:?|soy|para)\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/gi, '');
  a = a.replace(/[,.]?\s*(?:abono|pago|pagar|abonar)\s+(?:con|en|por)\s+.*$/gi, '');
  a = a.replace(/[,.]?\s*(?:en\s+efectivo|al\s+repartidor|por\s+transferencia|con\s+mp|con\s+tarjeta).*$/gi, '');
  a = a.replace(/[,.]?\s*(?:por\s+favor|gracias|muchas\s+gracias|joya|de\s+diez|avisame|ok).*$/gi, '');

  // 5. Limpieza de puntuación y espacios iniciales y finales
  a = a.replace(/^[:=;\-\s,–—!]+/, '').replace(/[:=;\-\s,–—!]+$/, '').trim();

  // Si después de la limpieza quedó una dirección válida
  if (a.length >= 4 && !isGarbageAddress(a)) {
    return a;
  }

  return rawText.trim();
}

/**
 * Extrae con precisión los cortes y cantidades pedidos a lo largo de la conversación actual, sin duplicar
 */
export function extractItemsFromHistoryAndText(history, text, products, lead = null) {
  const isCorrection = /corregi|corregí|corrije|corrijí|corregime|corrijeme|corregilo|corrijelo|arregla|arreglame|cambia|cambiame|modifica|modificame|solo quiero|un solo|una sola|no, solo|nada mas|en vez de|me equivoque|te equivocaste|te dije|te ped[ií]|era solo|dije/i.test(text || '');
  const isAddition = /agrega|agregá|agregar|agregame|agregale|suma|sumá|sumar|sumale|sumame|sumar|ademas|además|tambien|también|sumale también|mas los|más los|mas 1|mas 2|y los|y las|y 1|y 2/i.test(text || '');
  const isHardReset = /est[aá]\s+mal|no\s+es\s+eso|te\s+equivocaste|eso\s+no\s+es|nuevo ped|otro ped|empezar de cero|empecemos de nuevo|arranquemos de nuevo|borra todo|borrá todo|de cero|armar un nuevo|pedir otra cosa/i.test(text || '');

  const catalog = (products && products.length > 0) ? products : MASTER_CATALOG;
  const historyArr = history || [];

  // Encontrar el inicio de la sesión actual de pedido en el historial
  let lastBoundaryIdx = -1;
  let boundaryIsUserStart = false;
  for (let i = historyArr.length - 1; i >= 0; i--) {
    const m = historyArr[i];
    if (m.sender === 'bot' || m.sender === 'agent' || m.fromMe) {
      if (/(?:Ya generamos tu orden de compra|Hemos cancelado tu pedido|cancelado tu pedido|No registrás ningún pedido activo|Marcamos tu pedido .* como ✅ Entregado|¿Te gustaría armar otro pedido\?|disculpame la confusión)/i.test(m.content || '')) {
        lastBoundaryIdx = i;
        boundaryIsUserStart = false;
        break;
      }
    } else if (m.sender === 'user') {
      if (/est[aá]\s+mal|no\s+es\s+eso|te\s+equivocaste|cancela.*ped|cancelar.*ped|nuevo ped|otro ped|empezar de cero|de cero|pedir otra cosa/i.test(m.content || '')) {
        lastBoundaryIdx = i;
        boundaryIsUserStart = true;
        break;
      }
    }
  }

  // Tomar solo mensajes pertenecientes a la sesión activa
  const relevantHistory = isHardReset
    ? []
    : (lastBoundaryIdx >= 0 
        ? historyArr.slice(boundaryIsUserStart ? lastBoundaryIdx : lastBoundaryIdx + 1) 
        : historyArr.slice(-8));

  const userMessagesWithContext = [];
  for (let i = 0; i < relevantHistory.length; i++) {
    const m = relevantHistory[i];
    if (m.sender === 'user') {
      const prevMsg = i > 0 ? relevantHistory[i - 1] : null;
      userMessagesWithContext.push({
        content: (m.content || '').trim(),
        prevAgentMsg: (prevMsg && (prevMsg.sender === 'bot' || prevMsg.sender === 'agent' || prevMsg.fromMe)) ? (prevMsg.content || '') : ''
      });
    }
  }

  if (text && text.trim()) {
    const lastUserInContext = userMessagesWithContext[userMessagesWithContext.length - 1];
    if (!lastUserInContext || lastUserInContext.content !== text.trim()) {
      const lastAgentInHist = relevantHistory.slice().reverse().find(m => m.sender === 'bot' || m.sender === 'agent' || m.fromMe);
      userMessagesWithContext.push({
        content: text.trim(),
        prevAgentMsg: lastAgentInHist?.content || ''
      });
    }
  }

  const activeItemsMap = new Map(); // name -> { prod, quantity, isUnitMode, unitCount, label }

  for (let msgIdx = 0; msgIdx < userMessagesWithContext.length; msgIdx++) {
    const { content: msg, prevAgentMsg } = userMessagesWithContext[msgIdx];
    if (!msg) continue;
    const cleanMsg = msg.replace(/[,\.!\?]+/g, ' ').trim();
    const isPureGreeting = /^(hola|buen|buenas|que tal|saludos|hey|alo|buenos dias|buenas tardes|buenas noches)$/i.test(cleanMsg);
    const isPureConfirm = /^(s[ií]|correcto|confirmar|confirmo|dale|est[aá] bien|perfecto|de diez|avanza|ok|ok dale|si dale|s[ií] dale)$/i.test(cleanMsg);
    const isPureAddress = !isPureGreeting && !isPureConfirm && !/(?:kilo|kg|combo|asadazo|chori|morcilla|carne|corte|promo|costill|vacio|unidad|chorizo)/i.test(msg) && (/(?:calle|av\.|avenida|bv\.|funes|locelso|pidal|quiros|alamos|alcorta|luchesse)/i.test(msg) || /^[a-zA-Z\s]+\s+[0-9]{2,5}$/.test(msg));

    if (isPureGreeting || isPureConfirm || isPureAddress) {
      continue;
    }

    // Si el mensaje es un reinicio o cancelación de pedido anterior
    const isMsgReset = /est[aá]\s+mal|no\s+es\s+eso|te\s+equivocaste|nuevo ped|otro ped|empezar de cero|empecemos de nuevo|arranquemos de nuevo|borra todo|borrá todo|de cero|armar un nuevo|cancelar el pedido|cancela el pedido|pedir otra cosa/i.test(msg);
    if (isMsgReset) {
      activeItemsMap.clear();
      continue;
    }

    // Detección de reemplazo de ítems (ej: "cambiame el asado por 2 kg de vacío", "en vez de chorizos poneme morcillas")
    const isReplaceMatch = /(?:cambi[aá](?:me)?|en\s+vez\s+de)\s+(.+?)\s+(?:por|poneme|quiero)\s+(.+)/i.exec(cleanMsg);
    if (isReplaceMatch) {
      const oldQuery = isReplaceMatch[1].trim();
      const newQuery = isReplaceMatch[2].trim();
      const oldProd = matchBestProduct(oldQuery, catalog);
      if (oldProd) {
        for (const key of Array.from(activeItemsMap.keys())) {
          if (key === oldProd.name || key.toLowerCase().includes(oldProd.name.toLowerCase()) || oldProd.name.toLowerCase().includes(key.toLowerCase())) {
            activeItemsMap.delete(key);
          }
        }
      }
      const newProd = matchBestProduct(newQuery, catalog);
      if (newProd) {
        const parsedNew = parseQuantityAndMode(newQuery, newProd);
        activeItemsMap.set(newProd.name, {
          prod: newProd,
          quantity: parsedNew.quantity,
          isUnitMode: parsedNew.isUnitMode,
          unitCount: parsedNew.unitCount,
          unitsPerKg: parsedNew.unitsPerKg || 1,
          label: parsedNew.label
        });
      }
      continue;
    }

    // Detección de eliminación explícita de un ítem (ej: "sacá el carbón", "sin chorizos", "quitá la morcilla")
    const isRemoveMatch = /^(?:sac[aá]|sacame|quit[aá]|quitame|sin\s+|elimin[aá]|borr[aá])\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-zñáéíóú\s]+)$/i.exec(cleanMsg);
    if (isRemoveMatch && !/pedido|todo|nada/i.test(cleanMsg)) {
      const removeQuery = isRemoveMatch[1].trim();
      const prodToRemove = matchBestProduct(removeQuery, catalog);
      if (prodToRemove) {
        for (const key of Array.from(activeItemsMap.keys())) {
          if (key === prodToRemove.name || key.toLowerCase().includes(prodToRemove.name.toLowerCase()) || prodToRemove.name.toLowerCase().includes(key.toLowerCase())) {
            activeItemsMap.delete(key);
          }
        }
      }
      continue;
    }

    // Detección de selección de opciones de Asado / Menú Recomendado
    const isAsadoProposalInPrev = /1️⃣.*Opción Clásica|Te armé 3 opciones|¿Con cuál opción te gustaría avanzar/i.test(prevAgentMsg);
    if (isAsadoProposalInPrev && /^(?:1|2|3|1️⃣|2️⃣|3️⃣|la 1|el 1|opcion 1|opción 1|la 2|el 2|opcion 2|opción 2|la 3|el 3|opcion 3|opción 3|clasica|clásica|combo|asadazo|gourmet)$/i.test(cleanMsg)) {
      activeItemsMap.clear();
      if (/1|1️⃣|clasica|clásica/i.test(cleanMsg)) {
        const vacioProd = catalog.find(p => p.name.toLowerCase().includes('vacío') || p.name.toLowerCase().includes('vacio')) || MASTER_CATALOG[2];
        const choriProd = catalog.find(p => p.name.toLowerCase().includes('chorizo')) || MASTER_CATALOG[11];
        activeItemsMap.set(vacioProd.name, { prod: vacioProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 1, label: '1 kg' });
        activeItemsMap.set(choriProd.name, { prod: choriProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 8, label: '1 kg' });
      } else if (/2|2️⃣|combo|asadazo/i.test(cleanMsg)) {
        const comboProd = catalog.find(p => p.name.toLowerCase().includes('asadazo')) || MASTER_CATALOG[0];
        activeItemsMap.set(comboProd.name, { prod: comboProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 1, label: '1 combo' });
      } else if (/3|3️⃣|gourmet/i.test(cleanMsg)) {
        const tapaProd = catalog.find(p => p.name.toLowerCase().includes('tapa')) || MASTER_CATALOG[1];
        const matambreProd = catalog.find(p => p.name.toLowerCase().includes('matambre')) || MASTER_CATALOG[7];
        const choriProd = catalog.find(p => p.name.toLowerCase().includes('chorizo')) || MASTER_CATALOG[11];
        activeItemsMap.set(tapaProd.name, { prod: tapaProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 1, label: '1 kg' });
        activeItemsMap.set(matambreProd.name, { prod: matambreProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 1, label: '1 kg' });
        activeItemsMap.set(choriProd.name, { prod: choriProd, quantity: 1, isUnitMode: false, unitCount: 0, unitsPerKg: 8, label: '1 kg' });
      }
      continue;
    }

    // Detección de respuesta directa a consulta previa de cantidad de un producto
    const isQuantityPromptInPrev = /¿Qué cantidad|¿Cuántos kilos|¿Cuántas unidades|¿Qué cantidad de combos|¿Cuántas bolsas|¿Cuántas botellas|¿Qué cantidad te preparamos|Por Unidades:.*Por Kilos/i.test(prevAgentMsg);
    if (isQuantityPromptInPrev) {
      const targetProd = matchBestProduct(prevAgentMsg, catalog);
      const mentionedDifferentProd = matchBestProduct(msg, catalog);
      const isAdditionOrDifferentCut = (mentionedDifferentProd && mentionedDifferentProd.name !== targetProd?.name) || (/agrega|agregá|suma|sumá|sumale|sumame|ponele|y\b|tambien|también|mas\b/i.test(msg) && mentionedDifferentProd);

      if (targetProd && !isAdditionOrDifferentCut) {
        const parsed = parseQuantityAndMode(msg, targetProd);
        
        // Limpiar cualquier ítem genérico similar antes de asentar
        for (const key of Array.from(activeItemsMap.keys())) {
          const lowerKey = key.toLowerCase();
          const lowerTarget = targetProd.name.toLowerCase();
          if (key !== targetProd.name) {
            if ((/chorizo|chori/i.test(lowerKey) && /chorizo|chori/i.test(lowerTarget)) ||
                (/vacio|vacío/i.test(lowerKey) && /vacio|vacío/i.test(lowerTarget)) ||
                (/cuadril|tapa/i.test(lowerKey) && /cuadril|tapa/i.test(lowerTarget)) ||
                (/matambre/i.test(lowerKey) && /matambre/i.test(lowerTarget)) ||
                (/costilla|asado/i.test(lowerKey) && /costilla|asado/i.test(lowerTarget)) ||
                (/bife/i.test(lowerKey) && /bife/i.test(lowerTarget))) {
              activeItemsMap.delete(key);
            }
          }
        }

        activeItemsMap.set(targetProd.name, {
          prod: targetProd,
          quantity: parsed.quantity,
          isUnitMode: parsed.isUnitMode,
          unitCount: parsed.unitCount,
          unitsPerKg: parsed.unitsPerKg || 1,
          label: parsed.label
        });
        continue;
      } else if (targetProd && isAdditionOrDifferentCut) {
        // Si el cliente en vez de dar la cantidad del producto actual, pidió SUMAR otro producto (ej: "agrega 6 chorizos")
        // Asentamos el producto previo con su cantidad por defecto (1 combo / 1 kg) si no estaba ya asentado
        if (!activeItemsMap.has(targetProd.name)) {
          const isCombo = (targetProd.unit || '').toLowerCase() === 'combo';
          const isBolsa = (targetProd.unit || '').toLowerCase() === 'bolsa';
          const defaultParsed = {
            quantity: 1,
            isUnitMode: isCombo || isBolsa,
            unitCount: isCombo || isBolsa ? 1 : 0,
            unitsPerKg: targetProd.unitsPerKg || 1,
            label: isCombo ? '1 combo' : isBolsa ? '1 bolsa' : '1 kg'
          };
          activeItemsMap.set(targetProd.name, {
            prod: targetProd,
            ...defaultParsed
          });
        }
        // No hacemos continue para permitir que el resto del loop procese la suma del nuevo producto
      }
    }

    // Detección de selección por número de catálogo o desambiguación (ej: "1", "2", "la 1", "opción 1")
    const isSingleCatalogNumber = /^(?:[1-9]|1[0-9]|20|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|la\s+[1-9]|el\s+[1-9]|opci[oó]n\s+[1-9])$/i.test(cleanMsg);
    if (isSingleCatalogNumber && !isQuantityPromptInPrev) {
      const isCatalogOfferedInPrev = /1️⃣.*(?:Combo|Tapa|Vacío|Vacio|Costillar|Bife|Entraña|Matambrito|Matambre|Milanesa|Chorizo|Chori|Pata)|OFERTAS Y CORTES|cortes estrella|mejores promos|Mirá las opciones especiales|cortes y combos que están saliendo|En mostrador tenemos varias opciones|¿Cuál de estas opciones preferís/i.test(prevAgentMsg);
      const isNonCatalogPrompt = /¿Cómo preferís abonar|1️⃣.*Efectivo|FICHA DE REGISTRO|¿Confirmamos estos datos|¿Cómo preferís recibir tu pedido|1️⃣.*Env[ií]o a Domicilio|1️⃣.*Coordinar \*Envío a Domicilio\*|Elegí la sucursal|1️⃣.*Urca Central|¿Precisás algo de tu pedido\?|1️⃣.*Consultar estado|Opciones rápidas/i.test(prevAgentMsg);

      if (isCatalogOfferedInPrev && !isNonCatalogPrompt) {
        const numMatch = cleanMsg.match(/([1-9]|1[0-9]|20)/);
        const optIdx = numMatch ? (parseInt(numMatch[0], 10) - 1) : 0;
        
        // Extraer los productos que se le mostraron al usuario en el mensaje previo
        let displayedList = [];
        const lines = prevAgentMsg.split('\n');
        for (const line of lines) {
          if (/[1-9]️⃣|\[\d+\]/.test(line)) {
            const matchedProd = matchBestProduct(line, catalog);
            if (matchedProd && !displayedList.some(p => p.id === matchedProd.id || p.name === matchedProd.name)) {
              displayedList.push(matchedProd);
            }
          }
        }
        if (displayedList.length === 0) {
          displayedList = getFeaturedWhatsAppOffers(catalog);
        }

        const chosenProd = (optIdx >= 0 && optIdx < displayedList.length) ? displayedList[optIdx] : (catalog[optIdx] || null);
        if (chosenProd) {
          let hasExplicitQtyInMsg = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|tiras?|piezas?|combos?|bolsas?|botellas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg)/i.test(cleanMsg) && !isSingleCatalogNumber;
          let parsedQty = hasExplicitQtyInMsg 
            ? parseQuantityAndMode(cleanMsg, chosenProd) 
            : { quantity: 1, isUnitMode: (chosenProd.unit || '').toLowerCase() === 'combo', unitCount: 1, unitsPerKg: chosenProd.unitsPerKg || 1, label: (chosenProd.unit || '').toLowerCase() === 'combo' ? '1 combo' : '1 kg' };

          // Si no traía cantidad explícita en este mensaje, buscar si venía pidiendo una cantidad previa
          if (!hasExplicitQtyInMsg) {
            for (let uIdx = msgIdx - 1; uIdx >= 0; uIdx--) {
              const uMsg = userMessagesWithContext[uIdx].content || '';
              if (uMsg !== cleanMsg && /(?:kilo|kg|unidades?|un\b|chorizo|chori|morcilla|costeleta|milanesa|\d+)/i.test(uMsg)) {
                const prevParsed = parseQuantityAndMode(uMsg, chosenProd);
                if (prevParsed && (prevParsed.quantity !== 1 || prevParsed.isUnitMode)) {
                  parsedQty = prevParsed;
                  hasExplicitQtyInMsg = true;
                  break;
                }
              }
            }
          }

          // Si el mensaje fue solo el número de opción sin cantidad y es el último mensaje, no fijar 1 kg prematuro
          const isLastUserMsg = msgIdx === userMessagesWithContext.length - 1;
          if (!hasExplicitQtyInMsg && isLastUserMsg) {
            continue;
          }

          // Si en activeItemsMap había un producto genérico previo similar, reemplazarlo
          for (const key of Array.from(activeItemsMap.keys())) {
            if (key !== chosenProd.name && (/chorizo|chori/i.test(key) && /chorizo|chori/i.test(chosenProd.name))) {
              activeItemsMap.delete(key);
            }
          }

          activeItemsMap.set(chosenProd.name, {
            prod: chosenProd,
            quantity: parsedQty.quantity,
            isUnitMode: parsedQty.isUnitMode,
            unitCount: parsedQty.unitCount,
            unitsPerKg: parsedQty.unitsPerKg || 1,
            label: parsedQty.label
          });
          continue;
        }
      } else if (isNonCatalogPrompt) {
        continue;
      }
    }

    // Si el bot anterior ya tenía un resumen de pedido y el usuario está sumando productos o respondiendo a "sumar cortes"
    const isSumarCutsPrompt = /¿Qué te gustaría modificar|¿Qué otros cortes o complementos te gustaría sumar|Sumar más cortes o complementos|1️⃣.*Cambiar o sumar cortes/i.test(prevAgentMsg);
    if (isSumarCutsPrompt && activeItemsMap.size === 0) {
      // Buscar el último resumen de pedido en el historial del bot
      for (let hIdx = relevantHistory.length - 1; hIdx >= 0; hIdx--) {
        const histMsg = relevantHistory[hIdx];
        if (histMsg.sender === 'bot' || histMsg.sender === 'agent' || histMsg.fromMe) {
          const histContent = histMsg.content || '';
          if (/Detalle de tu pedido|Detalle de cortes/i.test(histContent)) {
            const lines = histContent.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('•') || line.trim().startsWith('*')) {
                const prod = matchBestProduct(line, catalog);
                if (prod && !activeItemsMap.has(prod.name)) {
                  const parsed = parseQuantityAndMode(line, prod);
                  activeItemsMap.set(prod.name, { prod, ...parsed });
                }
              }
            }
            if (activeItemsMap.size > 0) break;
          }
        }
      }
    }

    const isMsgAbsoluteOverride = /te dije|te ped[ií]|era solo|dije que|solo quiero|no entendes|no entendés|dije/i.test(msg);
    if (isMsgAbsoluteOverride) {
      activeItemsMap.clear();
    }

    const isMsgCorrection = /corregi|corregí|corrije|corrijí|corregime|corrijeme|solo quiero|un solo|una sola|no, solo|nada mas/i.test(msg);
    const chunks = msg.split(/\n+|(?:,\s*|\.\s+)(?![0-9])|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+/i);

    for (const chunk of chunks) {
      if (!chunk || !chunk.trim()) continue;
      const isChunkRemoval = /sacale|sacame|saca|sacá|sin el|sin la|sin los|sin las|quitale|quitame|quita|quitá|elimina|eliminame|no quiero el|no quiero la|no quiero los|no le pongas|cancela el|cancela la/i.test(chunk);
      const isChunkReplacement = /cambia|cambiame|en vez de|reemplaza/i.test(chunk);
      const isChunkAddition = /agrega|agregá|suma|sumá|sumar|ponele|más|mas|y\b/i.test(chunk || '');
      let prod = null;
      if (isChunkReplacement || isChunkRemoval) {
        for (const [existingName, existingItem] of activeItemsMap.entries()) {
          const lowerChunk = chunk.toLowerCase();
          const lowerExisting = existingName.toLowerCase();
          if (lowerChunk.includes(lowerExisting) || (lowerExisting.includes('costillar') && (lowerChunk.includes('asado') || lowerChunk.includes('costillar') || lowerChunk.includes('costilla'))) || (lowerExisting.includes('asadazo') && (lowerChunk.includes('combo') || lowerChunk.includes('asadazo')))) {
            prod = existingItem.prod;
            break;
          }
        }
      }
      if (!prod && prevAgentMsg) {
        const optionNumMatch = chunk.match(/(?:el\s+combo|la\s+opci[oó]n|el\s+corte|la\s+promo|combo|opci[oó]n|corte|promo|el|la)\s+([1-9]|1[0-9]|20)\b/i) ||
          chunk.trim().match(/^([1-9]|1[0-9]|20)$/);
        if (optionNumMatch) {
          const optIdx = parseInt(optionNumMatch[1], 10) - 1;
          let displayedList = [];
          const pLines = prevAgentMsg.split('\n');
          for (const pLine of pLines) {
            if (/[1-9]️⃣|\[\d+\]/.test(pLine)) {
              const matchedProd = matchBestProduct(pLine, catalog);
              if (matchedProd && !displayedList.some(p => p.id === matchedProd.id || p.name === matchedProd.name)) {
                displayedList.push(matchedProd);
              }
            }
          }
          if (displayedList.length === 0) {
            displayedList = getFeaturedWhatsAppOffers(catalog);
          }
          if (optIdx >= 0 && optIdx < displayedList.length) {
            prod = displayedList[optIdx];
          }
        }
      }
      if (!prod) {
        prod = matchBestProduct(chunk, catalog);
      }

      if (isChunkRemoval) {
        if (prod && activeItemsMap.has(prod.name)) {
          activeItemsMap.delete(prod.name);
        } else {
          for (const key of Array.from(activeItemsMap.keys())) {
            if (chunk.toLowerCase().includes(key.toLowerCase()) || (prod && key.toLowerCase().includes(prod.name.toLowerCase()))) {
              activeItemsMap.delete(key);
            }
          }
        }
      } else if (isChunkReplacement) {
        if (chunk.includes(' en vez de ')) {
          const parts = chunk.split(/ en vez de /i);
          const newProd = matchBestProduct(parts[0], catalog);
          const oldProd = matchBestProduct(parts[1], catalog);
          if (oldProd && activeItemsMap.has(oldProd.name)) activeItemsMap.delete(oldProd.name);
          if (newProd) {
            const parsed = parseQuantityAndMode(parts[0], newProd);
            activeItemsMap.set(newProd.name, { prod: newProd, ...parsed });
          }
        } else {
          const porMatch = chunk.match(/(?:cambia(?:me)?|reemplaza(?:me)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+por\s+(.+)/i);
          if (porMatch) {
            const oldProd = matchBestProduct(porMatch[1], catalog);
            const newProd = matchBestProduct(porMatch[2], catalog);
            if (oldProd && activeItemsMap.has(oldProd.name)) activeItemsMap.delete(oldProd.name);
            if (newProd) {
              const parsed = parseQuantityAndMode(porMatch[2], newProd);
              activeItemsMap.set(newProd.name, { prod: newProd, ...parsed });
            }
          } else if (prod) {
            // Ejemplo: "cambiame el asado a 1.5 kg"
            const parsed = parseQuantityAndMode(chunk, prod);
            activeItemsMap.set(prod.name, { prod, ...parsed });
          }
        }
      } else if (prod) {
        const parsed = parseQuantityAndMode(chunk, prod);
        if (activeItemsMap.has(prod.name) && isChunkAddition) {
          const existing = activeItemsMap.get(prod.name);
          existing.quantity += parsed.quantity;
          if (existing.isUnitMode && parsed.isUnitMode) {
            existing.unitCount += parsed.unitCount;
            existing.label = `${existing.unitCount} Unidades`;
          }
        } else {
          activeItemsMap.set(prod.name, { prod, ...parsed });
        }
      }
    }

    // Detectar si el mensaje actual menciona algún producto del catálogo
    const matchedAnyProdInMsg = matchBestProduct(msg, catalog);

    // Si el usuario responde solo con cantidad (ej: "2 kg", "1.5 kilos", "6 unidades", "medio kilo", "4 bifes")
    // y el producto fue propuesto/preguntado en el mensaje anterior del bot
    if (activeItemsMap.size === 0 && !matchedAnyProdInMsg && prevAgentMsg) {
      const isQuantityOnlyMsg = /(?:^|\s)(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?)|medio\s+kilo|1\/2\s*kg|dos|tres|cuatro|cinco|seis|ocho|diez|\d+)(?:\s|$)/i.test(msg);
      if (isQuantityOnlyMsg) {
        const lastProd = matchBestProduct(prevAgentMsg, catalog);
        if (lastProd) {
          const parsed = parseQuantityAndMode(msg, lastProd);
          activeItemsMap.set(lastProd.name, { prod: lastProd, ...parsed });
        }
      }
    }

    // Solo modificar cantidad del único ítem si el mensaje es una orden de cambio de cantidad y NO menciona otro producto distinto
    const singleItem = activeItemsMap.size === 1 ? Array.from(activeItemsMap.values())[0] : null;
    const isOnlyQuantityChange = singleItem && (!matchedAnyProdInMsg || matchedAnyProdInMsg.name === singleItem.prod.name);

    if (isOnlyQuantityChange && /(?:cambia(?:me)?|poneme|mejor|hacelo|que sean|dejame|quiero|pero quiero|dame|sumale|pasalo a|en total|total)?\s*(\d+(?:[\.,]\d+)?)\s*(?:kg|kilos?|unidades?|un\b|de\b)?/i.test(msg)) {
      const parsed = parseQuantityAndMode(msg, singleItem.prod);
      activeItemsMap.set(singleItem.prod.name, { prod: singleItem.prod, ...parsed });
    }
  }

  if (activeItemsMap.size === 0 && !isHardReset) {
    for (let hIdx = relevantHistory.length - 1; hIdx >= 0; hIdx--) {
      const histMsg = relevantHistory[hIdx];
      if (histMsg.sender === 'bot' || histMsg.sender === 'agent' || histMsg.fromMe) {
        const histContent = histMsg.content || '';
        if (/FICHA DE REGISTRO|Detalle del Pedido|Detalle de tu pedido|Detalle de cortes/i.test(histContent)) {
          const lines = histContent.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('•') || (cleanLine.startsWith('*') && !cleanLine.startsWith('**') && !cleanLine.startsWith('*FICHA') && !cleanLine.startsWith('*Destinatario') && !cleanLine.startsWith('*Teléfono') && !cleanLine.startsWith('*Dirección') && !cleanLine.startsWith('*Detalle') && !cleanLine.startsWith('*Total') && !cleanLine.startsWith('*Paso') && !cleanLine.startsWith('*Opciones'))) {
              const prod = matchBestProduct(cleanLine, catalog);
              if (prod && !activeItemsMap.has(prod.name)) {
                const parsed = parseQuantityAndMode(cleanLine, prod);
                activeItemsMap.set(prod.name, { prod, ...parsed });
              }
            }
          }
          if (activeItemsMap.size > 0) break;
        }
      }
    }
  }

  const items = [];
  const structuredProducts = [];
  let total = 0;

  for (const item of activeItemsMap.values()) {
    const { prod, quantity, isUnitMode, unitCount } = item;
    const dbProd = (catalog || []).find(p => (p.name || '').toLowerCase() === prod.name.toLowerCase());
    const unitPrice = dbProd ? Number(dbProd.price) : prod.price;
    const sub = Math.round(unitPrice * quantity);

    if (prod.unit === 'kg' && isUnitMode && unitCount > 0) {
      items.push(`• ${unitCount} Unidades de ${prod.name} — $${sub.toLocaleString('es-AR')}`);
    } else if (prod.unit !== 'kg') {
      const cleanProdName = prod.name.toLowerCase().startsWith(prod.unit.toLowerCase()) 
        ? prod.name 
        : `${prod.unit} ${prod.name}`;
      items.push(`• ${quantity} ${cleanProdName} — $${sub.toLocaleString('es-AR')}`);
    } else {
      items.push(`• ${quantity} kg ${prod.name} — $${sub.toLocaleString('es-AR')}`);
    }

    structuredProducts.push({
      id: prod.id || `prod-${prod.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: prod.name,
      price: unitPrice,
      quantity,
      unit: prod.unit,
      isUnitMode: Boolean(isUnitMode),
      unitCount: unitCount || 0,
      subtotal: sub
    });

    total += sub;
  }

  return { items, total, products: structuredProducts };
}

/**
 * Construye el prompt completo del sistema combinando instrucciones generales, contexto regional,
 * modismos locales, reglas de negocio y cortes vigentes del catálogo.
 */
export function buildFullSystemPrompt(settings, catalog = null) {
  const agentName = settings.agentName || 'Carlos';
  const agentRole = settings.agentRole || 'Maestro Carnicero de República de la Carne';
  const businessName = settings.businessName || 'República de la Carne';
  const country = settings.country || 'Argentina';
  const region = settings.region || 'Córdoba Capital y Alrededores';
  const currency = settings.currency || 'Pesos Argentinos ($ ARS)';
  const slang = settings.slang || 'Cordobés / Argentino amigable y experto (¡De diez!, ¡De una!, asado, achuras, cortes del día)';
  const businessRules = settings.businessRules || 'Envíos en el día dentro de Córdoba, 6 sucursales de retiro, novillito pesado y cerdo seleccionado, pagos en efectivo, transferencia o Mercado Pago.';
  const customPrompt = settings.systemPrompt || '';

  const activeProducts = (catalog || db.getProducts() || [])
    .filter(p => p.isAvailable !== false && p.price > 0)
    .slice(0, 35)
    .map(p => `• [PLU ${p.plu || '-'}] ${p.name}: $${Number(p.price).toLocaleString('es-AR')}/${p.unit || 'kg'}`)
    .join('\n');

  return `Eres ${agentName}, ${agentRole} de "${businessName}".

Contexto Regional y Negocio:
• País y Región: ${country} (${region})
• Moneda de Venta: ${currency} (todos los precios son exactos en moneda local)
• Tono y Modismos: ${slang}
• Directivas de Negocio: ${businessRules}

Directivas del Sistema:
${customPrompt}

Catálogo Oficial de Cortes y Precios Vigentes:
${activeProducts}

Reglas de Oro:
- Desambiguación: Si el cliente pide un corte general o ambiguo (ej: cuadril, matambre, chorizo, milanesas) con múltiples variedades, ofrece opciones numeradas con precios claros para que elija.
- Fraccionamiento por Unidades: Cuando el cliente pida productos que se pueden vender por unidad (como chorizos, morcillas, costeletas, milanesas) indicando unidades (ej: "6 chorizos", "4 costeletas"), en el detalle del pedido SIEMPRE debes mostrar "X Unidades de [Nombre]" y NUNCA mostrar "kg". Solo muestra kilos si el cliente pidió explícitamente por peso.
- Consulta de Pago Previa al Cierre: Antes de cerrar o dar por confirmado el pedido final, debes verificar si ya se abonó o consultar cómo pagará, ofreciendo las 3 opciones (1️⃣ Efectivo contraentrega, 2️⃣ Transferencia Alias: republica.carne.mp, 3️⃣ Link de Mercado Pago).
- Condiciones Obligatorias: No cierres un pedido sin validar que se tengan: (1) cortes o combo definidos con precio, (2) modalidad de entrega (Domicilio con dirección o Sucursal de retiro), (3) medio de pago y (4) nombre del cliente.
- Sé siempre preciso con los precios del catálogo y calcula 500g a 600g por persona para asados.`;
}

export class AIService {
  static async generateReply(param1, param2, param3, param4) {
    let jid = '';
    let incomingText = '';
    let isAudioInput = false;

    let lead = null;
    let history = [];

    if (typeof param1 === 'object' && param1 !== null) {
      jid = param1.jid || '';
      incomingText = param1.incomingText || param1.text || '';
      isAudioInput = Boolean(param1.isAudioInput);
      lead = param1.lead || null;
      history = Array.isArray(param1.history) ? param1.history : [];
    } else {
      incomingText = typeof param1 === 'string' ? param1 : '';
      jid = typeof param2 === 'string' ? param2 : (param2?.jid || param2?.id || '');
    }

    const settings = db.getSettings();
    if (!lead) {
      lead = (typeof param2 === 'object' && param2 !== null && !('jid' in param1)) ? param2 : (db.getLead(jid) || { name: 'Cliente', stage: 'new_lead', tags: [] });
    }
    if (!history || history.length === 0) {
      history = (Array.isArray(param3) && param3.length > 0) ? param3 : db.getMessages(jid, 8);
    }
    const knowledgeBase = db.getKnowledgeBase();
    const products = db.getProducts();

    // 1. Auto-aprendizaje continuo y extracción de perfil en tiempo real
    NeuralMemoryService.learnFromCustomerInteraction({ jid, lead, incomingText, history });

    // 2. Obtener Vector Cognitivo de la Red Neuronal / Mapa Mental
    const neuralContext = NeuralMemoryService.generateCognitiveContext({ jid, incomingText, lead });

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      const fullSystemPrompt = buildFullSystemPrompt(settings, products);

      const historyFormatted = (history || []).slice(-8).map(m => `${m.sender === 'user' ? 'Cliente' : (settings.agentName || 'Carlos')}: ${m.content}`).join('\n');

      // Si es un comando o selección transaccional directa (números, confirmaciones, cancelaciones, cambios de pedido, cantidades)
      const isDirectTransaction = /^(?:1|2|3|4|5|6|s[ií]|no|confirmar|confirmo|cancela|cancelar|ya pagu[eé]|ya me lleg[oó]|ac[aá] est[aá] el comprobante)$/i.test(incomingText.trim()) ||
        /(?:cancelar.*ped|cancela.*ped|cambiame|sacale|en vez de|ya transfer[ií]|ya me lo entregaron|recib[ií] el ped)/i.test(incomingText) ||
        /^(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?)|medio\s+kilo|1\/2\s*kg|dos|tres|cuatro|cinco|seis|ocho|diez|\d+)$/i.test(incomingText.trim());

      if (isDirectTransaction) {
        replyText = await this.generateDynamicReply(incomingText, lead, knowledgeBase, settings, history);
      } else if (settings.aiProvider === 'gemini' && isValidGeminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        let modelName = settings.aiModel || 'gemini-1.5-flash-latest';
        let model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `System Instruction:\n${fullSystemPrompt}\n\n${neuralContext.contextPrompt}\n\nHistorial de la conversación reciente:\n${historyFormatted}\n\nCliente: ${incomingText}\n\nResponde como ${settings.agentName || 'Carlos'} (manteniendo siempre consistencia total con los cortes y precios del catálogo):`;
        try {
          const result = await model.generateContent(prompt);
          replyText = result.response.text();
        } catch (geminiErr) {
          console.warn(`Error con modelo ${modelName}, usando motor inteligente directo:`, geminiErr.message);
          replyText = await this.generateDynamicReply(incomingText, lead, knowledgeBase, settings, history);
        }
      } else if (settings.aiProvider === 'openai' && isValidOpenAiKey) {
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const historyMessages = (history || []).slice(-8).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

        const completion = await openai.chat.completions.create({
          model: settings.aiModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `${fullSystemPrompt}\n\n${neuralContext.contextPrompt}` },
            ...historyMessages,
            { role: 'user', content: incomingText }
          ],
          temperature: 0.7,
          max_tokens: 450
        });
        replyText = completion.choices[0]?.message?.content || '';
      } else {
        replyText = await this.generateDynamicReply(incomingText, lead, knowledgeBase, settings, history);
      }
    } catch (error) {
      console.error('Error generando respuesta con IA:', error);
      replyText = await this.generateDynamicReply(incomingText, lead, knowledgeBase, settings, history);
    }

    let suggestedStage = null;
    const stageMatch = replyText.match(/\[\[STAGE:([a-zA-Z_]+)\]\]/);
    if (stageMatch) {
      suggestedStage = stageMatch[1];
      db.updateLeadStage(jid, suggestedStage);
    }

    // Limpiar COMPLETAMENTE cualquier tag interno [[...]] de la respuesta
    replyText = replyText.replace(/\[\[[A-Z_]+(?::[^\]]*)?\]\]/g, '').trim();

    const shouldSendAudio = Boolean(
      settings.alwaysVoiceReply || (isAudioInput && settings.voiceRepliesEnabled)
    );

    let audioOggPath = null;
    let audioMp3Path = null;
    let audioDuration = 0;

    if (shouldSendAudio && replyText) {
      try {
        const speech = await SpeechService.textToSpeech(replyText);
        audioOggPath = speech.oggPath;
        audioMp3Path = speech.mp3Path;
        audioDuration = speech.durationSeconds;
      } catch (err) {
        console.error('Error sintetizando respuesta de voz:', err);
      }
    }

    return {
      text: replyText,
      audioOggPath,
      audioMp3Path,
      audioDuration,
      shouldSendAudio,
      suggestedStage
    };
  }

  /**
   * Generador de respuestas dinámicas, ágiles, coherentes y altamente consultivas
   */
  static async generateDynamicReply(text, leadOrName, knowledgeBase, settings, historyOverride = null) {
    const t = (text || '').toLowerCase().trim();
    const rawText = text || '';
    const cleanConfirmText = t.replace(/[,\.!\?]+/g, ' ').replace(/\s+/g, ' ').trim();

    let lead = {};
    let customerName = '';
    if (typeof leadOrName === 'object' && leadOrName !== null) {
      lead = leadOrName;
      customerName = lead.pushName || lead.name || '';
    } else if (typeof leadOrName === 'string') {
      customerName = leadOrName;
      lead = { name: leadOrName, pushName: leadOrName, id: leadOrName, jid: leadOrName };
    }

    const nameGreeting = customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') ? ` ${customerName}` : '';
    const allArgs = [knowledgeBase, settings, historyOverride];
    const productsArg = allArgs.find(a => Array.isArray(a) && a.length > 0 && a[0]?.price);

    const products = productsArg || db.getProducts();
    let rawClientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting.trim() || 'estimado');
    rawClientName = rawClientName.replace(/^(?:de\s+|del\s+|para\s+|a\s+|el\s+|la\s+)/i, '').trim();
    const clientName = rawClientName || 'amigo';

    let history = [];
    if (Array.isArray(historyOverride) && historyOverride.length > 0 && (historyOverride[0]?.sender !== undefined || historyOverride[0]?.content !== undefined || historyOverride[0]?.fromMe !== undefined)) {
      history = historyOverride;
    } else if (Array.isArray(knowledgeBase) && knowledgeBase.length > 0 && (knowledgeBase[0]?.sender !== undefined || knowledgeBase[0]?.fromMe !== undefined || knowledgeBase[0]?.role !== undefined)) {
      history = knowledgeBase;
    } else if (Array.isArray(settings) && settings.length > 0 && (settings[0]?.sender !== undefined || settings[0]?.fromMe !== undefined)) {
      history = settings;
    } else if (lead.jid || lead.id) {
      history = db.getMessages(lead.jid || lead.id, 15);
    }

    const activeOrders = db.getActiveOrdersByJid(lead.jid || lead.id || lead);
    let currentActiveOrder = activeOrders[0] || null;
    const isLinkRequest = /link|link de pago|marcado pago|mercadopago|mercado pago|tarjeta|abonar con mp|pagar con mp/i.test(t);

    const getOrderStatusLabel = (st) => {
      switch (st) {
        case 'pending': return '⏳ Pendiente de preparación';
        case 'preparing': return '🥩 En preparación en carnicería';
        case 'ready':
        case 'ready_for_pickup': return '✨ ¡Listo y Preparado para retirar / despachar!';
        case 'in_transit': return '🛵 En camino con repartidor';
        case 'delivered': return '✅ Entregado';
        case 'cancelled': return '❌ Cancelado';
        default: return st;
      }
    };

    // =========================================================================
    // 0. GESTIÓN INTEGRAL DE PEDIDOS ACTIVOS: MODIFICACIÓN, SUCURSAL, PAGO, CANCELACIÓN Y ESTADO
    const rawLastAgent = (history || []).slice().reverse().find(m => m.sender === 'bot' || m.sender === 'agent' || m.fromMe)?.content || '';
    const lastAgentMessage = typeof rawLastAgent === 'object' ? (rawLastAgent.text || '') : String(rawLastAgent || '');

    // Detección contextual si el último mensaje fue un menú interactivo
    const wasWelcomeMenuOffered = /Opciones r[aá]pidas:[\s\S]*1️⃣.*Ver ofertas|¿Por d[oó]nde arrancamos\?/i.test(lastAgentMessage);
    const wasBranchMenuOffered = !wasWelcomeMenuOffered && (/Elegí la sucursal de retiro|SELECCIÓN DE SUCURSAL|1️⃣ \*URCA CENTRAL\*|2️⃣ \*URCA 2/i.test(lastAgentMessage));
    const wasModMenuOffered = /¿Qué te gustaría modificar de tu pedido|1️⃣ Cambiar o sumar cortes/i.test(lastAgentMessage);
    const wasDeliveryTypeOffered = /1️⃣ \*?Env[ií]o a Domicilio\*?|1️⃣.*Coordinar \*Envío a Domicilio\*|¿Cómo preferís recibir tu pedido|¿Cómo seguimos con tu pedido\?|¿Preferís que te lo enviemos a domicilio|¿Te lo mandamos a tu casa/i.test(lastAgentMessage);
    const wasInTransitChoiceOffered = /1️⃣ Cancelar el pedido|Opciones disponibles:[\s\S]*1️⃣ Cancelar/i.test(lastAgentMessage);
    const wasDataConfirmOffered = /FICHA DE REGISTRO|¿Confirmamos estos datos para agendarte|1️⃣ Confirmar datos/i.test(lastAgentMessage);
    const wasActiveOrderHelpOffered = !wasDataConfirmOffered && (/Tu pedido \*\*#ORD-.* ya está confirmado|Opciones:\s*\n?1️⃣\s*Modificar algún dato o cortes|¿Precisás algo de tu pedido\?/i.test(lastAgentMessage));
    const wasAsadoProposalOffered = /1️⃣\s*[*_]*Opción Clásica|[*_]*Te\s+arm[eé]\s+3\s+opciones|¿Con cu[aá]l opci[oó]n|Opción Combo|Opción Parrillera/i.test(lastAgentMessage);
    const wasPaymentMethodOffered = /(?:c[oó]mo prefer[ií]s abonar|1️⃣\s*\*?Efectivo|2️⃣\s*\*?Transferencia|3️⃣\s*\*?Mercado Pago|Paso 4 de 4|Decime c[oó]mo prefer[ií]s abonar)/i.test(lastAgentMessage);
    const wasReadyToDispatchQuestion = /(?:lo dejamos listo para despachar|lo dejamos listo|dejamos listo para despachar|¿Precisás realizar algún otro cambio)/i.test(lastAgentMessage);
    const wasMenuOffered = !wasAsadoProposalOffered && !wasPaymentMethodOffered && (/1️⃣|2️⃣|1\..*Combo|OFERTAS Y CORTES|cortes estrella del día|mejores promos/i.test(lastAgentMessage)) &&
      !wasDataConfirmOffered && !wasBranchMenuOffered && !wasModMenuOffered && !wasDeliveryTypeOffered && !wasInTransitChoiceOffered;

    // 0.0001 RESPUESTAS AL MENÚ DE BIENVENIDA / OPCIONES RÁPIDAS
    if (wasWelcomeMenuOffered) {
      if (/^(?:1|1️⃣|uno|el 1|la 1|opci[oó]n 1|ofertas?|combos?|promos?|ver ofertas|precios?)$/i.test(t.trim())) {
        const catalogToOffer = getFeaturedWhatsAppOffers(products);
        const formattedCatalog = formatNumberedCatalog(catalogToOffer);
        return `🔥 *OFERTAS Y CORTES DESTACADOS EN REPÚBLICA DE LA CARNE:* 🥩\n\n` +
          `${formattedCatalog}\n\n` +
          `👉 Decime qué número de opción o qué cortes te gustaría que te preparemos, o la cantidad en kilos/unidades. 🥩🚚 [[STAGE:proposal]]`;
      }

      if (/^(?:2|2️⃣|dos|el 2|la 2|opci[oó]n 2|asado|asesoramiento|personas?|calcular|calculo)$/i.test(t.trim())) {
        return `🥩 *ASESORAMIENTO EXPERTO PARA TU ASADO:* 🔥\n\n` +
          `Para que el asado salga perfecto y no sobre ni falte, calculamos **500g a 600g de carne por persona** (combinando cortes principales y achuras).\n\n` +
          `👉 *Ejemplo para 6 personas (3.5 kg total):*\n` +
          `• 1.5 kg Vacío Especial ($17.250)\n` +
          `• 1.5 kg Costillar / Asado de Tira ($14.700)\n` +
          `• 6 Chorizos Criollos Puro Cerdo (~0.75 kg - $3.750)\n` +
          `• 1 Bolsa de Carbón Quebracho ($2.200)\n\n` +
          `👉 Contame: **¿Para cuántas personas es tu comida?** (ej: 'somos 8', 'somos 12') y te armo la propuesta personalizada con el precio exacto. 🙌 [[STAGE:proposal]]`;
      }

      if (/^(?:3|3️⃣|tres|el 3|la 3|opci[oó]n 3|sucursales|sedes|direcciones|horarios|donde estan)$/i.test(t.trim())) {
        return `🏪 *NUESTRAS 6 SUCURSALES EN CÓRDOBA:* 🥩\n\n` +
          `1️⃣ **URCA CENTRAL:** Av. José Roque Funes 1115 (📞 +54 9 3513 906947)\n` +
          `   *Lunes a Sábado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `2️⃣ **URCA 2 – ALTO TEJEDA:** Av. Menéndez Pidal 3575 (📞 +54 9 3518 623195)\n` +
          `   *Lunes a Sábado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `3️⃣ **INTERCOUNTRY – CORTEZA MALL:** Av. Los Álamos 1015 (📞 +54 9 3518 623194)\n` +
          `   *Lunes a Domingo:* 9:00 a 21:00 hs\n\n` +
          `4️⃣ **DUARTE QUIRÓS:** Av. Duarte Quirós 5130 (📞 +54 9 3518 156595)\n` +
          `   *Lunes a Sábado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `5️⃣ **VILLA ALLENDE – MERCADITO DE LA VILLA:** Av. Figueroa Alcorta 480 (📞 +54 9 3513 540031)\n` +
          `   *Lunes a Sábado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `6️⃣ **COUNTRY SAN ISIDRO:** Av. Padre Luchesse km 2 (📞 +54 9 3518 769099)\n` +
          `   *Lunes a Miércoles:* 07:00 a 00:00 hs | *Jueves a Sábado:* 07:00 a 01:00 hs\n\n` +
          `🛵 *También hacemos envíos directos a domicilio en el día a todo Córdoba.* ¿Querés que te preparemos un pedido? 🙌 [[STAGE:proposal]]`;
      }
    }

    // 0.0002 RESPUESTAS A PROPUESTAS DE ASADO / MENÚS RECOMENDADOS (Opción 1, 2 o 3)
    if (wasAsadoProposalOffered) {
      const isOpt1 = /^(?:1|1️⃣|uno|el 1|la 1|opci[oó]n 1|clasica|clásica)$/i.test(t.trim());
      const isOpt2 = /^(?:2|2️⃣|dos|el 2|la 2|opci[oó]n 2|combo|asadazo)$/i.test(t.trim());
      const isOpt3 = /^(?:3|3️⃣|tres|el 3|la 3|opci[oó]n 3|gourmet)$/i.test(t.trim());

      if (isOpt1 || isOpt2 || isOpt3) {
        const optNum = isOpt1 ? 1 : isOpt2 ? 2 : 3;
        const parsedOpt = parseAsadoOptionFromMessage(lastAgentMessage, optNum);
        
        let optionTitle = isOpt1 ? 'Opción 1 (Clásica Equilibrada)' : isOpt2 ? 'Opción 2 (Combo Asadazo + Agregados)' : 'Opción 3 (Parrillera Gourmet)';
        let optionItems = [];
        let optionTotal = 0;

        if (parsedOpt && parsedOpt.items.length > 0) {
          optionTitle = parsedOpt.title || optionTitle;
          optionItems = parsedOpt.items;
          optionTotal = parsedOpt.total;
        } else {
          // Fallback con cálculos coherentes
          if (isOpt1) {
            optionItems = [
              '• 2 kg Vacío Especial Seleccionado — $23.000',
              '• 1 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) — $5.000'
            ];
            optionTotal = 28000;
          } else if (isOpt2) {
            optionItems = ['• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999'];
            optionTotal = 39999;
          } else {
            optionItems = [
              '• 1 kg Tapa de Cuadril Seleccionada — $26.407',
              '• 1 kg Matambre Vacuno — $9.500',
              '• 1 kg Chorizo Criollo Puro Cerdo — $5.000'
            ];
            optionTotal = 40907;
          }
        }

        // Crear o actualizar pedido en la base de datos
        if (currentActiveOrder) {
          db.updateOrder(currentActiveOrder.id, {
            items: optionItems,
            totalAmount: optionTotal,
            notes: (currentActiveOrder.notes ? currentActiveOrder.notes + '\n' : '') + `[Elegida ${optionTitle}]`
          });
        } else {
          currentActiveOrder = db.createOrder({
            jid: lead.jid || lead.id,
            phone: lead.phone || '',
            customerName: clientName,
            items: optionItems,
            totalAmount: optionTotal,
            channel: 'WHATSAPP',
            source: 'WHATSAPP',
            origin: 'WHATSAPP',
            notes: `[Elegida ${optionTitle}]`
          });
        }

        const itemsDisplay = optionItems.join('\n');
        return `¡De diez ${clientName}! 🥩 Ya tengo anotada la **${optionTitle}**:\n\n` +
          `📋 *Detalle de tu pedido:*\n` +
          `${itemsDisplay}\n` +
          `💰 *Total:* **$${Number(optionTotal).toLocaleString('es-AR')}**\n\n` +
          `👉 *¿Cómo seguimos con tu pedido?*\n` +
          `1️⃣ Coordinar *Envío a Domicilio* en el día 🛵\n` +
          `2️⃣ Elegir *Retiro por Sucursal* (6 sedes en Córdoba) 🏪\n` +
          `3️⃣ Sumar más cortes o complementos (carbón, vino) 🥩\n\n` +
          `👉 *Respondé 1, 2 o 3 (o escribí "delivery", "sucursal" o los cortes).* 🙌 [[STAGE:proposal]]`;
      }
    }

    // 0.00022 RESPUESTAS A SELECCIÓN DE OPCIONES DE DESAMBIGUACIÓN Y CATÁLOGO
    const wasAmbiguousOffered = /En mostrador tenemos varias opciones de|¿Cuál de estas opciones preferís que te preparemos y cuántos kilos o unidades/i.test(lastAgentMessage);
    const wasMenuOrAmbiguousOffered = wasAmbiguousOffered || (wasMenuOffered && !wasWelcomeMenuOffered);
    if (wasMenuOrAmbiguousOffered) {
      const isOptionNum = /^(?:[1-9]|1[0-9]|20|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|la\s+[1-9]|el\s+[1-9]|opci[oó]n\s+[1-9])$/i.test(cleanConfirmText);
      const isNamedOption = /(?:chorizo|chori|cuadril|matambre|milanesa|costilla|colorado|cheddar|criollo|dubai|tapa|colita|vacio|vacío|asado|bife|entraña|molida|pollo|carbon|carbón|vino)/i.test(t);

      if (isOptionNum || isNamedOption) {
        const hasExplicitQty = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|tiras?|piezas?|combos?|bolsas?|botellas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b\d+\s+(?:de\s+)?(?:kilos?|kg|unidades?))/i.test(t) && !isOptionNum;

        // Extraer los productos listados en lastAgentMessage
        let displayedList = [];
        const lines = lastAgentMessage.split('\n');
        for (const line of lines) {
          if (/[1-9]️⃣|\[\d+\]/.test(line)) {
            const matchedProd = matchBestProduct(line, products);
            if (matchedProd && !displayedList.some(p => p.id === matchedProd.id || p.name === matchedProd.name)) {
              displayedList.push(matchedProd);
            }
          }
        }
        if (displayedList.length === 0) {
          displayedList = getFeaturedWhatsAppOffers(products);
        }

        let chosenProduct = null;
        if (isOptionNum) {
          const numMatch = cleanConfirmText.match(/([1-9]|1[0-9]|20)/);
          const optIdx = numMatch ? (parseInt(numMatch[0], 10) - 1) : 0;
          if (optIdx >= 0 && optIdx < displayedList.length) {
            chosenProduct = displayedList[optIdx];
          }
        }
        if (!chosenProduct) {
          chosenProduct = matchBestProduct(rawText, displayedList.length > 0 ? displayedList : products);
        }

        // Si el cliente seleccionó la opción pero NO especificó cantidad (ej: dijo solo "7", "1", "el 3" o "matambre")
        if (chosenProduct && !hasExplicitQty && !/combo asadazo/i.test(chosenProduct.name || '')) {
          return formatProductQuantityPrompt(chosenProduct, clientName);
        }

        const { items: updatedItems, total: updatedTotal } = extractItemsFromHistoryAndText(history, rawText, products, lead);
        if (updatedItems.length > 0) {
          if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
            db.updateOrder(currentActiveOrder.id, {
              items: updatedItems,
              totalAmount: updatedTotal
            });
          } else {
            const newOrder = db.createOrder({
              jid: lead.jid || lead.id,
              customerName: clientName,
              phone: lead.phone || (lead.jid ? `+${lead.jid.split('@')[0]}` : ''),
              items: updatedItems,
              totalAmount: updatedTotal,
              status: 'pending',
              source: 'whatsapp',
              deliveryType: lead.deliveryType || 'pickup',
              address: lead.address || '',
              branch: lead.preferredBranch || ''
            });
            currentActiveOrder = newOrder;
          }

          const formattedTotal = `$${updatedTotal.toLocaleString('es-AR')}`;
          const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';

          return `¡Espectacular ${clientName}! 🥩 Dejamos anotada tu elección:\n\n` +
            `📋 *Detalle de tu pedido${orderNotice}:*\n` +
            `${updatedItems.join('\n')}\n` +
            `💰 *Subtotal acumulado:* *${formattedTotal}*\n\n` +
            `👉 *¿Cómo seguimos con tu pedido?*\n` +
            `1️⃣ Coordinar *Envío a Domicilio* en el día 🛵\n` +
            `2️⃣ Elegir *Retiro por Sucursal* (6 sedes en Córdoba) 🏪\n` +
            `3️⃣ Sumar más cortes o complementos (carbón, vino) 🥩\n\n` +
            `👉 *Respondé 1, 2 o 3 (o escribí "delivery", "sucursal" o los cortes).* 🙌 [[STAGE:proposal]]`;
        }
      }
    }

    // 0.00025 RESPUESTAS AL MENÚ DE MÉTODOS DE PAGO (1 Efectivo, 2 Transferencia, 3 Mercado Pago)
    if (wasPaymentMethodOffered) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const amount = (targetOrder && targetOrder.totalAmount > 0) ? targetOrder.totalAmount : (historyTotal > 0 ? historyTotal : 39999);
      const orderId = targetOrder ? targetOrder.id : `ORD-${Date.now().toString().slice(-4)}`;
      const isPickup = targetOrder?.deliveryType === 'pickup' || Boolean(targetOrder?.branch) || lead?.deliveryType === 'pickup' || Boolean(lead?.preferredBranch);
      const branchName = targetOrder?.branch || lead?.preferredBranch || 'la sucursal seleccionada';
      const destAddr = targetOrder?.address || lead?.address || 'tu domicilio';
      const destLocation = isPickup 
        ? `al retirar por la sucursal **${branchName}**`
        : `en **${destAddr}** en el día dentro de las 24 hs`;

      if (/^(?:1|1️⃣|uno|el 1|la 1|opci[oó]n 1|efectivo|cash|al repartidor|contraentrega)$/i.test(t.trim())) {
        if (targetOrder) {
          db.updateOrder(targetOrder.id, { paymentMethod: isPickup ? 'Efectivo en sucursal' : 'Efectivo contraentrega', status: 'preparing' });
        }
        return `¡Excelente elección ${clientName}! 🥩💵 Marcamos tu pedido **#${orderId}** como **Efectivo** (Total: **$${Number(amount).toLocaleString('es-AR')}**).\n\n` +
          `📍 Te esperamos ${destLocation}. ¡Ya está en marcha la preparación de tus cortes en carnicería! 🙌 [[STAGE:closed_won]]`;
      }

      if (/^(?:2|2️⃣|dos|el 2|la 2|opci[oó]n 2|transferencia|transferir|alias|banco|cbu)$/i.test(t.trim())) {
        if (targetOrder) {
          db.updateOrder(targetOrder.id, { paymentMethod: 'Transferencia Bancaria', status: 'pending' });
        }
        return `¡Excelente elección ${clientName}! 🥩🏦 Para abonar tu pedido **#${orderId}** por **Transferencia Bancaria**:\n\n` +
          `📱 *Alias Mercado Pago / Bancario:* \`republica.carne.mp\`\n` +
          `💰 *Monto exacto:* **$${Number(amount).toLocaleString('es-AR')}**\n\n` +
          `👉 En cuanto hagas la transferencia, pasame el comprobante o avisame por acá y lo despachamos al instante ${destLocation}. 🙌 [[STAGE:closed_won]]`;
      }

      if (/^(?:3|3️⃣|tres|el 3|la 3|opci[oó]n 3|mp|mercado|mercado pago|mercadopago|link|tarjeta|tarjetas)$/i.test(t.trim())) {
        let dynamicLink = targetOrder?.paymentLink || '';
        const creds = mercadoPagoService.getCredentials();
        try {
          if (targetOrder) {
            const pref = await mercadoPagoService.createPaymentPreference(targetOrder);
            dynamicLink = pref.checkoutUrl;
          } else {
            const pref = await mercadoPagoService.createPaymentPreference({
              id: orderId,
              totalAmount: amount,
              customerName: clientName,
              phone: lead.phone || '',
              items: ['Cortes de carne seleccionados']
            });
            dynamicLink = pref.checkoutUrl;
          }
        } catch (mpErr) {
          console.error('Error generando link MP:', mpErr);
          dynamicLink = dynamicLink || 'https://www.mercadopago.com.ar';
        }

        if (targetOrder) {
          db.updateOrder(targetOrder.id, { paymentMethod: 'Mercado Pago (Checkout Pro)', paymentLink: dynamicLink });
        }

        const modeTag = creds.isSandbox ? '\n🧪 *[MODO PRUEBAS - SANDBOX]*' : '';
        return `💳 *[MERCADO PAGO CHECKOUT OFICIAL]*\n¡De diez ${clientName}! 🥩💳 Acá tenés el link de pago oficial y seguro para tu pedido **#${orderId}** por **$${Number(amount).toLocaleString('es-AR')}**:${modeTag}\n\n` +
          `1️⃣ **Link de Pago Directo:**\n🔗 ${dynamicLink}\n\n` +
          `2️⃣ **Transferencia / Dinero en cuenta:**\n📱 *Alias Mercado Pago:* \`republica.carne.mp\`\n\n` +
          `Podés abonar con Dinero en cuenta, Débito, Crédito o Transferencia. En cuanto se acredite, ¡comenzamos el despacho hacia **${destAddr}**! 🙌 [[STAGE:closed_won]]`;
      }
    }

    // 0.00028 RESPUESTAS DE CONFORMIDAD / "LISTO PARA DESPACHAR" / "ESTÁ BIEN ASÍ"
    const isReadyAffirmation = /^(?:listo|dejalo listo|listo para despachar|as[ií] est[aá] bien|est[aá] bien as[ií]|no,? est[aá] bien|no,? est[aá] bien as[ií]|todo listo|dejalo as[ií]|nada m[aá]s|no nada m[aá]s|todo perfecto|as[ií] nom[aá]s|de diez as[ií]|est[aá] perfecto|no gracias|no por ahora|dale listo|si listo|s[ií] listo|as[ií] esta de diez|para despachar|bien as[ií]|no as[ií] est[aá] bien)$/i.test(cleanConfirmText);

    if (isReadyAffirmation) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      if (targetOrder) {
        const hasPaymentChosen = targetOrder.paymentMethod && !targetOrder.paymentMethod.includes('Pendiente') && targetOrder.paymentMethod !== 'Efectivo / Transferencia / Mercado Pago';
        const destAddr = targetOrder.address || lead.address || targetOrder.branch || 'tu domicilio';

        if (hasPaymentChosen || targetOrder.status === 'in_transit' || targetOrder.status === 'preparing') {
          return `¡De diez ${clientName}! 🙌 Queda todo confirmado con tu pedido **#${targetOrder.id}** tal como está. Te avisamos en cuanto el repartidor esté en viaje hacia **${destAddr}**. ¡Muchas gracias por elegirnos! 🥩🚚 [[STAGE:closed_won]]`;
        }

        const totalFormatted = `$${Number(targetOrder.totalAmount).toLocaleString('es-AR')}`;
        return `¡De diez ${clientName}! 🥩🚚 Tu pedido **#${targetOrder.id}** por **${totalFormatted}** queda listo para despacho en el día a **${destAddr}**.\n\n` +
          `👉 *Para finalizar, ¿cómo preferís abonar?*\n` +
          `1️⃣ *Efectivo* (al repartidor o en sucursal)\n` +
          `2️⃣ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
          `3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
          `👉 Respondé *1*, *2* o *3*. 🙌 [[STAGE:confirming_data]]`;
      }
    }

    // 0.0003 CORRECCIÓN / RECLAMO DE PEDIDO INCORRECTO POR PARTE DEL CLIENTE ("está mal", "te equivocaste", etc.)
    const isOrderCorrectionComplaint = /est[aá]\s+mal(?:\s+el\s+ped)?|no\s+es\s+lo\s+que\s+ped[ií]|te\s+equivocaste|eso\s+no\s+es|est[aá]\s+equivocado|se\s+equivoco|no\s+ped[ií]\s+eso|no\s+quiero\s+eso|corregilo|corrijanlo|nada\s+que\s+ver|no\s+es\s+ese\s+el\s+ped/i.test(t);

    if (isOrderCorrectionComplaint) {
      // Registrar aprendizaje en la Red Neuronal y base de datos
      NeuralMemoryService.recordLearningInsight({
        jid: lead.jid || lead.id,
        clientName,
        mistakeType: 'Corrección de Pedido por Cliente',
        clientFeedback: rawText,
        context: lastAgentMessage,
        learningRule: `Al recibir queja o corrección de ${clientName}, limpiar carrito y confirmar cortes exactos solicitados.`
      });

      return `¡Mil disculpas ${clientName}! 🥩 Tenés toda la razón, disculpame la confusión.\n\n` +
        `Contame por favor con exactitud: **¿qué cortes o combo te gustaría que te preparemos y cuántos kilos o unidades?** Te lo armo al instante, limpio y exactamente como querés. 🙌 [[STAGE:discovery]]`;
    }

    // Consulta general de sucursales, horarios o ubicaciones
    const isGeneralBranchQuery = /(?:nuestras\s+)?(?:6\s+)?sucursales|d[oó]nde\s+est[aá]n|d[oó]nde\s+quedan|d[oó]nde\s+hay|sedes|direcciones|ubicaci[oó]n|locales|horarios?|a\s+qu[eé]\s+hora|cierran|abren|abierto|atenci[oó]n/i.test(t) && !/cambiar|elegir|retirar/i.test(t);
    if (isGeneralBranchQuery) {
      return `🏪 *NUESTRAS 6 SUCURSALES EN CÓRDOBA:* 🥩\n\n` +
        `1️⃣ **URCA CENTRAL:** Av. José Roque Funes 1115 (📞 +54 9 3513 906947)\n` +
        `   *Lunes a Sábado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `2️⃣ **URCA 2 – ALTO TEJEDA:** Av. Menéndez Pidal 3575 (📞 +54 9 3518 623195)\n` +
        `   *Lunes a Sábado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `3️⃣ **INTERCOUNTRY – CORTEZA MALL:** Av. Los Álamos 1015 (📞 +54 9 3518 623194)\n` +
        `   *Lunes a Domingo:* 9:00 a 21:00 hs\n\n` +
        `4️⃣ **DUARTE QUIRÓS:** Av. Duarte Quirós 5130 (📞 +54 9 3518 156595)\n` +
        `   *Lunes a Sábado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `5️⃣ **VILLA ALLENDE – MERCADITO DE LA VILLA:** Av. Figueroa Alcorta 480 (📞 +54 9 3513 540031)\n` +
        `   *Lunes a Sábado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `6️⃣ **COUNTRY SAN ISIDRO:** Av. Padre Luchesse km 2 (📞 +54 9 3518 769099)\n` +
        `   *Lunes a Miércoles:* 07:00 a 00:00 hs | *Jueves a Sábado:* 07:00 a 01:00 hs\n\n` +
        `🛵 *También hacemos envíos directos en el día a domicilio a todo Córdoba.* ¿Querés que te preparemos un pedido? 🙌 [[STAGE:proposal]]`;
    }

    // 0.001 CONFIRMACIÓN DE RECEPCIÓN / ENTREGA POR PARTE DEL CLIENTE
    const isDeliveryReceivedConfirm = /recibi el ped|recibí el ped|me llego el ped|me llegó el ped|ya llego el repartidor|ya llegó el repartidor|ya me lo entregaron|pedido recibido|todo recibido|ya lo tengo|acaba de llegar|llego todo bien|llegó todo bien|ya llego|ya llegó|recibido todo de diez/i.test(t);

    if (isDeliveryReceivedConfirm && currentActiveOrder) {
      const isCash = currentActiveOrder.paymentMethod && currentActiveOrder.paymentMethod.toLowerCase().includes('efectivo');
      const isPaid = currentActiveOrder.paymentStatus === 'paid' || isCash;
      db.updateOrderStatus(currentActiveOrder.id, 'delivered', {
        paymentStatus: isPaid ? 'paid' : currentActiveOrder.paymentStatus,
        autoArchive: isPaid
      });
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { stage: 'closed_won' });
      }
      return `¡Qué gran noticia ${clientName}! 🎉🥩 Marcamos tu pedido **#${currentActiveOrder.id}** como **✅ Entregado con éxito**.\n\n¡Que disfruten mucho ese asado y esos cortes! Cualquier cosa que precises, estamos a tu entera disposición. ¡Muchas gracias por elegir República de la Carne! 🙌 [[STAGE:closed_won]]`;
    }

    // 0.002 CONFIRMACIÓN / COMPROBANTE DE PAGO ENVIADO POR EL CLIENTE
    const isPaymentProofSent = /ya pague|ya pagué|ya transferi|ya transferí|te pase el comprobante|te pasé el comprobante|aca esta el comprobante|acá está el comprobante|adjunto comprobante|pago realizado|ya mande la plata|ya mandé la plata|comprobante de pago/i.test(t);

    if (isPaymentProofSent) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      if (targetOrder) {
        const newStatus = targetOrder.status === 'pending' ? 'preparing' : targetOrder.status;
        db.updateOrder(targetOrder.id, {
          paymentStatus: 'paid',
          status: newStatus,
          notes: (targetOrder.notes ? targetOrder.notes + '\n' : '') + '[Pago informado y confirmado por cliente]'
        });
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { stage: 'closed_won' });
        }
        const statusLabel = getOrderStatusLabel(newStatus);
        return `¡Excelente ${clientName}! 💳 Registramos tu aviso y confirmación de pago para tu pedido **#${targetOrder.id}** por **$${Number(targetOrder.totalAmount).toLocaleString('es-AR')}**.\n\nTus cortes se encuentran **${statusLabel}** listos para su entrega. ¡Muchas gracias por tu compra! 🙌 [[STAGE:closed_won]]`;
      }
    }

    // 0.005 CONSULTA DE ESTADO DE PEDIDO ACTIVO O DETALLE
    const isStatusCheck = /estado|como viene|cómo viene|donde est[aá]|cu[aá]ndo llega|seguimiento|consultar el estado|consultar estado|detalle.*ped|ver.*ped|que ped[ií]|mis cortes|resumen.*ped|detalle|que pedi|ya est[aá] listo|est[aá] listo|ya lo prepararon|est[aá] preparado|est[aá] lista/i.test(t) ||
      (wasActiveOrderHelpOffered && /^(?:2|2️⃣|opci[oó]n 2|la 2|el 2|estado|detalle)$/i.test(t.trim()));

    if (isStatusCheck && currentActiveOrder) {
      const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
      const isPrep = Boolean(currentActiveOrder.isPrepared) || currentActiveOrder.status === 'ready' || currentActiveOrder.status === 'ready_for_pickup';
      const prepText = isPrep 
        ? `🔪 *Preparación:* ✅ *Cortes cortados y preparados* en carnicería`
        : `🔪 *Preparación:* ⏳ *En cola de corte y pesado*`;
      const itemsText = Array.isArray(currentActiveOrder.items) ? currentActiveOrder.items.join('\n') : currentActiveOrder.items;
      
      let readyNote = '';
      if (currentActiveOrder.status === 'ready' || currentActiveOrder.status === 'ready_for_pickup' || isPrep) {
        if (currentActiveOrder.deliveryType === 'pickup' || currentActiveOrder.branchName || currentActiveOrder.branch) {
          readyNote = `\n🎉 *¡Tu pedido ya está LISTO!* Podés pasar a retirarlo por **${currentActiveOrder.branchName || currentActiveOrder.branch || 'la sucursal'}** cuando gustes. 🙌\n`;
        } else {
          readyNote = `\n🎉 *¡Tu pedido ya está LISTO y preparado!* Aguardando el despacho del repartidor. 🛵\n`;
        }
      }

      return `📦 *ESTADO Y DETALLE DE TU PEDIDO #${currentActiveOrder.id}:*\n\n` +
        `👉 **${statusLabel}**\n` +
        `${prepText}\n\n` +
        `📋 *Cortes y Productos:* \n${itemsText}\n\n` +
        `💰 *Total:* **$${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}**\n` +
        `📍 *Destino:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n` +
        `💳 *Medio de pago:* ${currentActiveOrder.paymentMethod || 'Efectivo / Transferencia'}\n` +
        `🚚 *Entrega:* ${currentActiveOrder.status === 'ready' ? 'Listo en mostrador / En despacho' : 'Programado en el día (dentro de las 24 hs)'}\n` +
        readyNote +
        `\n👉 *Opciones:*\n` +
        `1️⃣ Modificar algún dato o cortes (o escribí "modificar")\n` +
        `2️⃣ Cancelar pedido (o escribí "cancelar")\n\n` +
        `¿Precisás algo más? 🙌`;
    }

    // 0.01 CANCELACIÓN DE PEDIDO (Válida en TODO momento, incluso in_transit)
    const isCancelRequest = /cancelar.*ped|cancela.*ped|anular.*ped|anula.*ped|no quiero el ped|cancelar mi orden|cancela mi orden|quiero cancelar|cancelame el ped|ya no quiero el ped/i.test(t) ||
      (wasInTransitChoiceOffered && /^(?:1|1️⃣|cancelar|cancela)$/i.test(t.trim())) ||
      (wasModMenuOffered && /^(?:6|6️⃣|cancelar)$/i.test(t.trim())) ||
      (wasActiveOrderHelpOffered && /^(?:3|3️⃣|cancelar)$/i.test(t.trim())) ||
      (wasDataConfirmOffered && /^(?:3|3️⃣|cancelar)$/i.test(t.trim()));

    if (isCancelRequest) {
      if (currentActiveOrder) {
        db.updateOrderStatus(currentActiveOrder.id, 'cancelled');
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { stage: 'qualified' });
        }
        if (currentActiveOrder.status === 'in_transit') {
          return `¡Entendido ${clientName}! 🛑 Hemos **cancelado** tu pedido **#${currentActiveOrder.id}** de inmediato y notificado al repartidor para suspender la entrega.\n\n¿Te gustaría armar otro pedido o necesitás que te asesore con algún corte? 🥩🔥 [[STAGE:qualified]]`;
        }
        return `¡Listo ${clientName}! 👍 Hemos **cancelado** tu pedido **#${currentActiveOrder.id}** de forma exitosa. No te preocupes.\n\n¿Te gustaría armar otro pedido o necesitás que te asesore con algún corte? 🥩🔥 [[STAGE:qualified]]`;
      } else {
        return `¡Hola ${clientName}! No registrás ningún pedido activo en este momento. Si querés armar un pedido nuevo o consultar precios, avisame y te ayudo con gusto. 🥩`;
      }
    }

    // 0.02 SELECCIÓN / CAMBIO DE SUCURSAL (1 al 6 o nombre de sucursal)
    const isBranchChangeIntent = /cambiar.*sucursal|retirar.*otra.*sucursal|elegir.*sucursal|cambiar.*sede|otra.*sede|cambio.*sucursal|seleccionar.*sucursal/i.test(t) ||
      (wasModMenuOffered && /^(?:3|3️⃣)$/i.test(t.trim()));

    if (isBranchChangeIntent) {
      const orderRef = currentActiveOrder ? ` para tu pedido **#${currentActiveOrder.id}**` : '';
      return `¡De diez ${clientName}! 🏪 Elegí la sucursal de retiro${orderRef}:\n\n` +
        `${formatBranchMenu()}\n\n` +
        `👉 Respondé con el número de sucursal (1 al 6) o el nombre de la sede. 🙌`;
    }

    const isBranchSelectionAnswer = wasBranchMenuOffered && (
      /^(?:1|2|3|4|5|6|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|urca|funes|pidal|tejeda|intercountry|alamos|quiros|allende|san isidro|luchesse)$/i.test(t.trim()) ||
      /(?:sucursal\s+[1-6]|sede\s+[1-6]|opci[oó]n\s+[1-6])/i.test(t)
    );

    if (isBranchSelectionAnswer) {
      let selectedBranch = OFFICIAL_BRANCHES_MENU[0];
      const numMatch = t.match(/[1-6]/);
      if (numMatch) {
        const idx = parseInt(numMatch[0], 10) - 1;
        selectedBranch = OFFICIAL_BRANCHES_MENU[idx] || OFFICIAL_BRANCHES_MENU[0];
      } else {
        for (const b of OFFICIAL_BRANCHES_MENU) {
          if (b.keywords.some(kw => t.includes(kw))) {
            selectedBranch = b;
            break;
          }
        }
      }

      const branchDesc = `${selectedBranch.name} (${selectedBranch.address})`;
      let targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);

      if (targetOrder) {
        targetOrder = db.updateOrder(targetOrder.id, {
          branch: branchDesc,
          deliveryType: 'pickup'
        });
      } else {
        const { items: historyItems, total: historyTotal, products: parsedProducts } = extractItemsFromHistoryAndText(history, '', products, lead);
        const finalItems = historyItems.length > 0 ? historyItems : [
          '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999'
        ];
        const finalTotal = historyTotal > 0 ? historyTotal : 39999;
        targetOrder = db.createOrder({
          jid: lead.jid || lead.id,
          customerName: clientName,
          phone: lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351 626-2475'),
          address: lead.address || '',
          items: finalItems,
          products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : undefined,
          totalAmount: finalTotal,
          paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
          status: 'pending',
          channel: 'WHATSAPP',
          source: 'WHATSAPP',
          origin: 'WHATSAPP',
          deliveryType: 'pickup',
          branch: branchDesc
        });
      }

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, {
          preferredBranch: selectedBranch.name,
          deliveryType: 'pickup'
        });
      }

      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const itemsList = (targetOrder?.items && targetOrder.items.length > 0)
        ? (Array.isArray(targetOrder.items) ? targetOrder.items.join('\n') : targetOrder.items)
        : (historyItems.length > 0 ? historyItems.join('\n') : '• Cortes seleccionados');
      const orderTotal = targetOrder?.totalAmount || historyTotal || 0;
      const totalFormatted = `$${Number(orderTotal).toLocaleString('es-AR')}`;
      const orderRef = targetOrder ? ` **#${targetOrder.id}**` : '';

      return `¡Excelente ${clientName}! 🏪 Registramos tu sucursal de retiro para tu pedido${orderRef} en:\n` +
        `👉 **${selectedBranch.name}** (📍 ${selectedBranch.address}).\n\n` +
        `📋 *Detalle de tu pedido:*\n${itemsList}\n` +
        `💰 *Total a abonar:* **${totalFormatted}**\n\n` +
        `💳 *Paso final — ¿Cómo preferís abonar?*\n` +
        `1️⃣ *Efectivo* (al retirar en sucursal)\n` +
        `2️⃣ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `👉 Respondé *1*, *2* o *3*. 🙌 [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 0.028 DISPARADOR DIRECTO DE PAGO ("pago", "coordinar pago", "pagar", etc.)
    // =========================================================================
    const isPaymentTrigger = /^(?:pago|pagar|pasar al pago|coordinar pago|coordinamos el pago|coordinemos el pago|hacer el pago|como pago|cómo pago|como se paga|cómo se paga|abonar|medio de pago|metodo de pago|método de pago|opciones de pago)$/i.test(t.trim()) ||
      (/(?:coordinamos el pago|coordinar el pago|pasar al pago|modificación o coordinamos)/i.test(lastAgentMessage) && /^(?:si|sí|dale|ok|listo|pago|pagar|pasemos al pago|avancemos|vamos)$/i.test(t.trim()));

    if (isPaymentTrigger) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const itemsList = (targetOrder?.items && targetOrder.items.length > 0)
        ? (Array.isArray(targetOrder.items) ? targetOrder.items.join('\n') : targetOrder.items)
        : (historyItems.length > 0 ? historyItems.join('\n') : '• Cortes seleccionados');
      const orderTotal = targetOrder?.totalAmount || historyTotal || 0;
      const totalFormatted = `$${Number(orderTotal).toLocaleString('es-AR')}`;
      const dest = targetOrder?.address || targetOrder?.branch || lead.address || 'Sucursal / Domicilio a coordinar';
      const orderIdTag = targetOrder ? ` **#${targetOrder.id}**` : '';

      return `¡De diez ${clientName}! 🥩💳 Dejamos listo tu pedido${orderIdTag} por **${totalFormatted}** con entrega/retiro en **${dest}**:\n\n` +
        `📋 *Detalle del pedido:*\n${itemsList}\n` +
        `💰 *Total a abonar:* **${totalFormatted}**\n\n` +
        `💳 *¿Cómo preferís abonar?*\n` +
        `1️⃣ *Efectivo* (en sucursal o al repartidor)\n` +
        `2️⃣ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `👉 Respondé *1*, *2* o *3*. 🙌 [[STAGE:confirming_data]]`;
    }

    // 0.03 CAMBIO O SELECCIÓN DE FORMA DE ENTREGA (DOMICILIO vs SUCURSAL)
    const isDeliveryModeChange = /cambiar.*(?:forma|modo).*entrega|cambiar.*env[ií]o|cambiar.*retiro|cambiar a domicilio|cambiar a sucursal|prefiero envio|prefiero envío|prefiero retiro|pasar a buscar/i.test(t) ||
      (wasModMenuOffered && /^(?:2|2️⃣)$/i.test(t.trim()));

    if (isDeliveryModeChange) {
      return `¡De diez ${clientName}! 🛵📦 ¿Cómo preferís recibir tu pedido${currentActiveOrder ? ` **#${currentActiveOrder.id}**` : ''}?\n\n` +
        `1️⃣ *Envío a Domicilio* (te lo llevamos en el día)\n` +
        `2️⃣ *Retiro por Sucursal* (en cualquiera de nuestras 6 sedes en Córdoba)\n\n` +
        `👉 Respondé *1* o *2*.`;
    }

    const isDeliveryIntentExplicit = /^(?:delivery|envio|envío|a domicilio|a mi casa|mandamelo|mandámelo|enviámelo|enviamelo|traemelo|traémelo)$/i.test(t.trim()) ||
      (wasDeliveryTypeOffered && /^(?:1|1️⃣|uno|el 1|la 1|opci[oó]n 1|envio|envío|domicilio|delivery)$/i.test(t.trim()));

    if (isDeliveryIntentExplicit) {
      if (currentActiveOrder) db.updateOrder(currentActiveOrder.id, { deliveryType: 'delivery' });
      if (lead.jid || lead.id) db.updateLead(lead.jid || lead.id, { deliveryType: 'delivery' });

      if (lead.address && lead.address.length >= 4 && !isGarbageAddress(lead.address)) {
        return `¡Excelente ${clientName}! 🛵 Coordinamos con envío a domicilio a tu dirección registrada:\n📍 **${lead.address}**\n\n💳 *¿Cómo preferís abonar?*\n1️⃣ *Efectivo* al repartidor\n2️⃣ *Transferencia* (Alias: \`republica.carne.mp\`)\n3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n👉 Respondé *1*, *2* o *3*. 🥩`;
      }
      return `¡Excelente ${clientName}! 🛵 Coordinamos con envío a domicilio en el día.\n\n📍 Por favor pasame tu **Calle, Número/Altura y Barrio** para el repartidor. 🙌`;
    }

    const isPickupIntentExplicit = /^(?:retiro|sucursal|en persona|paso a buscar|lo paso a buscar|voy al local|voy a la sucursal)$/i.test(t.trim()) ||
      (wasDeliveryTypeOffered && /^(?:2|2️⃣|dos|el 2|la 2|opci[oó]n 2|retiro|sucursal)$/i.test(t.trim()));

    if (isPickupIntentExplicit) {
      return `¡De diez ${clientName}! 🏪 Elegí la sucursal de retiro:\n\n${formatBranchMenu()}\n\n👉 Respondé con el número (1 al 6) o nombre de la sede. 🙌`;
    }

    const isAddMoreCutsChoice = (wasDeliveryTypeOffered && /^(?:3|3️⃣|tres|el 3|la 3|opci[oó]n 3|sumar|agregar|mas cortes|más cortes|complementos|otro corte)$/i.test(t.trim()));

    if (isAddMoreCutsChoice) {
      return `¡Buenísimo ${clientName}! 🥩 Contame qué otros cortes o complementos te gustaría sumar:\n\n` +
        `• 🌭 *Chorizo Criollo puro cerdo* (2kg x $10.000 promo o $5.000/kg)\n` +
        `• 🌭 *Morcillas Especiales Bombón* ($5.200/kg)\n` +
        `• 🔥 *Carbón Quebracho Blanco* ($2.200 la bolsa grande)\n` +
        `• 🍷 *Vino Selección Howlmande* ($5.500)\n\n` +
        `👉 Decime qué te agregamos y te actualizo el total al instante. 🙌 [[STAGE:proposal]]`;
    }

    const isQuantityOrCutModification = wasDeliveryTypeOffered && (
      /(?:kilos?|kg|unidades?|un\b|chorizo|chori|morcilla|vacio|vacío|asado|tapa|matambre|bife|entraña|combo|\d+\s*(?:kg|kilos?))/i.test(t) ||
      /(?:cambia|reemplaza|sacale|saca|agrega|suma|sumale|ponele|quiero|dame|mejor|dejame|pasalo)/i.test(t)
    );

    if (isQuantityOrCutModification) {
      const { items: updatedItems, total: newTotal } = extractItemsFromHistoryAndText(history, rawText, products, lead);
      if (updatedItems.length > 0) {
        if (currentActiveOrder) {
          db.updateOrder(currentActiveOrder.id, {
            items: updatedItems,
            totalAmount: newTotal > 0 ? newTotal : currentActiveOrder.totalAmount
          });
        }
        return `¡Anotado ${clientName}! 🥩 Actualizamos tu pedido:\n\n` +
          `📋 *Detalle de tu pedido:*\n` +
          `${updatedItems.join('\n')}\n` +
          `💰 *Subtotal acumulado:* **$${Number(newTotal > 0 ? newTotal : (currentActiveOrder?.totalAmount || 0)).toLocaleString('es-AR')}**\n\n` +
          `👉 *¿Cómo seguimos con tu pedido?*\n` +
          `1️⃣ Coordinar *Envío a Domicilio* en el día 🛵\n` +
          `2️⃣ Elegir *Retiro por Sucursal* (6 sedes en Córdoba) 🏪\n` +
          `3️⃣ Sumar más cortes o complementos (chorizos, carbón, vino) 🥩\n\n` +
          `👉 *Respondé 1, 2 o 3 (o escribí "delivery", "sucursal" o los cortes).* 🙌`;
      }
    }

    // 0.04 CAMBIO DE MÉTODO DE PAGO
    const isPaymentMethodChange = /cambia.*(?:metodo|medio|forma|modo).*pago|cambiar.*(?:metodo|medio|forma|modo)|pagar con|pago con|abonar con|quiero pagar en efectivo|prefiero efectivo|prefiero transferencia|prefiero mp|quiero transferir/i.test(t) ||
      (wasModMenuOffered && /^(?:4|4️⃣)$/i.test(t.trim()));

    if (isPaymentMethodChange) {
      const orderRef = currentActiveOrder ? ` para tu pedido **#${currentActiveOrder.id}**` : '';
      return `¡De diez ${clientName}! 💳 Decime cómo preferís abonar${orderRef}:\n\n` +
        `1️⃣ *Efectivo* (al repartidor o en sucursal)\n` +
        `2️⃣ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `👉 Respondé *1*, *2* o *3*. 🥩`;
    }

    // 0.05 MENÚ GENERAL DE MODIFICACIONES DE PEDIDO ACTIVO
    const isModifyRequest = /modificar.*ped|modificame.*ped|cambiar.*ped|cambiame.*ped|opciones.*ped|quiero cambiar|cambiar algo|cambiar pedido/i.test(t) ||
      (wasActiveOrderHelpOffered && /^(?:1|1️⃣|opci[oó]n 1|la 1|el 1|modificar)$/i.test(t.trim())) ||
      (wasDataConfirmOffered && /^(?:2|2️⃣|modificar)$/i.test(t.trim()));

    if (isModifyRequest) {
      if (currentActiveOrder) {
        if (currentActiveOrder.status === 'in_transit') {
          return `¡Hola ${clientName}! 🛵 Tu pedido **#${currentActiveOrder.id}** ya se encuentra **en camino a tu domicilio** con el repartidor, por lo que no es posible modificar los cortes ni la sucursal.\n\n` +
            `👉 *Opciones disponibles:*\n` +
            `1️⃣ Cancelar el pedido\n` +
            `2️⃣ Continuar con la entrega a domicilio\n\n` +
            `👉 Respondé *1* o *2*. 👍`;
        }

        return `¡De diez ${clientName}! 🛠️ ¿Qué te gustaría modificar de tu pedido **#${currentActiveOrder.id}**?\n\n` +
          `1️⃣ Cambiar o sumar cortes del catálogo (o escribí "cortes")\n` +
          `2️⃣ Cambiar forma de entrega (Envío a Domicilio ⇄ Retiro en Sucursal) (o escribí "entrega")\n` +
          `3️⃣ Cambiar Sucursal de retiro (o escribí "sucursal")\n` +
          `4️⃣ Cambiar Método de Pago (o escribí "pago")\n` +
          `5️⃣ Cambiar Dirección de entrega (o escribí "dirección")\n` +
          `6️⃣ Cancelar el pedido (o escribí "cancelar")\n\n` +
          `👉 Respondé con el número de opción (1 al 6) o la palabra. 👍`;
      } else {
        return `¡Hola ${clientName}! No tenés ningún pedido activo pendiente de modificación. Si querés armar un pedido nuevo o consultar precios, avisame y te ayudo con gusto. 🥩`;
      }
    }

    // Respuesta a opción 1 del menú de modificación (sumar/cambiar cortes)
    if ((wasModMenuOffered && /^(?:1|1️⃣|cortes|catalogo|catálogo|cambiar cortes|sumar cortes|productos|carne)$/i.test(t.trim())) || /quiero (?:sumar|cambiar|agregar) cortes/i.test(t)) {
      const catalogToOffer = (products && products.length > 0) ? products.slice(0, 8) : MASTER_CATALOG.slice(0, 8);
      return `¡De diez ${clientName}! 🥩 Acá tenés nuestras opciones y cortes del día:\n\n` +
        `${formatNumberedCatalog(catalogToOffer)}\n\n` +
        `👉 Decime qué número de opción o cortes querés sumar o cambiar a tu pedido. 🙌`;
    }

    // Respuesta a opción 5 del menú de modificación (cambiar dirección)
    if (wasModMenuOffered && /^(?:5|5️⃣|direccion|dirección|cambiar direccion|mi direccion|calle)$/i.test(t.trim())) {
      return `📍 Por favor pasame tu nueva calle, altura y barrio para actualizar la dirección de entrega de tu pedido. 🛵`;
    }

    // 0.051 MODIFICACIÓN DIRECTA DE CORTES EN PEDIDO ACTIVO (Sumar, reemplazar o quitar)
    if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
      const isItemModification = /(?:cambiame|cambia|cambiá|reemplaza|reemplazá|sacale|sacá|saca|quita|quitar|quitalo|agrega|agregá|suma|sumá|sumar|ponele|poné|agregale)\s+(?:el\s+|la\s+|un\s+|una\s+|los\s+|las\s+)?([a-záéíóúñ0-9\s]+)/i.test(t);
      if (isItemModification) {
        const { items: updatedItems, total: newTotal } = extractItemsFromHistoryAndText(history, rawText, products, lead);
        if (updatedItems.length > 0) {
          db.updateOrder(currentActiveOrder.id, {
            items: updatedItems,
            totalAmount: newTotal > 0 ? newTotal : currentActiveOrder.totalAmount
          });

          return `¡De diez ${clientName}! 🥩 Modificación registrada con éxito en tu pedido **#${currentActiveOrder.id}**:\n\n` +
            `📋 *Detalle actualizado de tu pedido:*\n` +
            `${updatedItems.join('\n')}\n\n` +
            `💰 *Nuevo Total a abonar:* **$${Number(newTotal > 0 ? newTotal : currentActiveOrder.totalAmount).toLocaleString('es-AR')}**\n` +
            `📍 *Destino:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n` +
            `💳 *Medio de pago:* ${currentActiveOrder.paymentMethod || 'Efectivo / Transferencia'}\n\n` +
            `👉 *Opciones:*\n` +
            `1️⃣ Confirmar pedido y continuar (o respondé "1" / "confirmar")\n` +
            `2️⃣ Sumar más cortes (o indicá qué corte querés)\n` +
            `3️⃣ Cancelar pedido (o respondé "3" / "cancelar") 🙌`;
        }
      }
    }

    // 0.06 GESTIÓN DE CLIENTES CON PEDIDO EN PREPARACIÓN / CAMINO (CONSULTAS GENERALES)
    if (currentActiveOrder && ['preparing', 'in_transit', 'ready_for_pickup'].includes(currentActiveOrder.status)) {
      const isExplicitNewOrder = /hacer otro ped|armar otro ped|nuevo ped|otro ped|quiero pedir otra cosa|armame otro ped/i.test(t);

      // Agradecimientos o saludos cortos / respuestas cortas de cortesía
      const isShortAck = /^(?:gracias|muchas gracias|joya|de diez|dale|perfecto|genial|ok|buen[ií]simo|listo|impecable|gracais|chas gracias|chau|adios|hasta luego|que andes bien|un abrazo|no gracias|no muchas gracias|no por ahora|nada mas|nada más|todo bien|no por el momento|todo en orden)$/i.test(cleanConfirmText);
      if (isShortAck) {
        return `¡De diez ${clientName}! 🙌 Quedamos a tu entera disposición. Te avisamos en cuanto el repartidor esté en viaje hacia tu domicilio. 🥩🚚`;
      }

      // Envío de dirección complementaria, calle, barrio o timbre
      const hasStreetKeyword = /(?:calle|av\b|av\.|avenida|bv\b|bv\.|bulevar|barrio|piso|dpto|departamento|timbre|entre|esquina|algarrobos|locelso|funes|quiros|pidal|cuesta colorada|colorada|altura|manzana|lote|san martin|colon|velez sarsfield)/i.test(t);
      const isExplicitAddressPhrase = /^(?:te paso mi direccion|mi direccion es|direccion:?|la direccion es|la direccion de entrega es|para el envio|para el envío|vivo en|enviar a|mandalo a|mandar a)\s+/i.test(t);
      const isAddressFollowUp = !/metodo|medio|forma|pago|pagar|abonar|precio|cuanto|hora|consulta|gracias|detalle|estado/i.test(t) &&
        (hasStreetKeyword || isExplicitAddressPhrase) &&
        !isStatusCheck && !isExplicitNewOrder && !isShortAck;

      if (isAddressFollowUp && currentActiveOrder.status !== 'in_transit') {
        const cleanAddr = extractCleanAddress(rawText);
        if (isGarbageAddress(cleanAddr) || cleanAddr.length < 4) {
          return `¡Hola ${clientName}! 📍 Para registrar correctamente tu entrega a domicilio, por favor escribí únicamente tu **Calle, Altura/Número y Barrio o timbre** (ej: *Av. Roque Funes 1115, Urca*). 🙌`;
        }

        db.updateOrder(currentActiveOrder.id, { address: cleanAddr });
        if (lead.jid || lead.id) db.updateLead(lead.jid || lead.id, { address: cleanAddr });

        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        return `¡Anotado ${clientName}! 📍 Registramos y actualizamos tu dirección de entrega a:\n👉 **${cleanAddr}** para tu pedido **#${currentActiveOrder.id}**.\n\nTus cortes ya se encuentran **${statusLabel}** en carnicería. 🙌`;
      }

      const isBranchOrInfoQuery = /sucursal|sucursales|horario|donde|dónde|direccion|dirección|urca|quiros|villa allende|san isidro|receta|guiso|milanesa|asado|cuanto|precio|promo/i.test(t);
      const isProductAddition = /agrega|agregá|suma|sumá|sumar|quiero|traeme|mandame|combo|vacio|vacío|costillar|matambre|chori/i.test(t);

      if (!isExplicitNewOrder && !isStatusCheck && !isLinkRequest && !isBranchOrInfoQuery && !isProductAddition && !wasAsadoProposalOffered && !wasMenuOffered && !wasDeliveryTypeOffered && !wasDataConfirmOffered) {
        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        const itemsText = Array.isArray(currentActiveOrder.items) ? currentActiveOrder.items.join('\n') : currentActiveOrder.items;
        return `¡Hola ${clientName}! 👋 Tu pedido **#${currentActiveOrder.id}** ya está confirmado y se encuentra:\n👉 **${statusLabel}** (Total: $${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}).\n\n📋 *Detalle de cortes:*\n${itemsText}\n\n📍 *Destino:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n\n👉 *Opciones:*\n1️⃣ Modificar algún dato o cortes (o escribí "modificar")\n2️⃣ Consultar estado y detalle (o escribí "estado" / "detalle")\n3️⃣ Cancelar pedido (o escribí "cancelar")\n\n¿En qué te puedo ayudar? 🙌`;
      }
    }

    // =========================================================================
    // 0. SOLICITUD DE LINK DE PAGO / MERCADO PAGO
    // =========================================================================
    if (isLinkRequest) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      const amount = targetOrder ? targetOrder.totalAmount : 49999;
      const orderId = targetOrder ? targetOrder.id : `ORD-${Date.now().toString().slice(-4)}`;
      const customerNum = lead.customerNumber || `CLI-${(lead.id || '0000').slice(-4).toUpperCase()}`;

      let dynamicLink = targetOrder?.paymentLink || '';
      const creds = mercadoPagoService.getCredentials();

      try {
        if (targetOrder) {
          const pref = await mercadoPagoService.createPaymentPreference(targetOrder);
          dynamicLink = pref.checkoutUrl;
        } else {
          const pref = await mercadoPagoService.createPaymentPreference({
            id: orderId,
            totalAmount: amount,
            customerName: clientName,
            phone: lead.phone || '',
            items: ['Cortes de carne seleccionados']
          });
          dynamicLink = pref.checkoutUrl;
        }
      } catch (mpErr) {
        console.error('Error generando link de Mercado Pago en IA:', mpErr);
        dynamicLink = dynamicLink || 'https://www.mercadopago.com.ar';
      }

      const modeTag = creds.isSandbox ? '\n🧪 *[MODO PRUEBAS - SANDBOX]*' : '';

      return `💳 *[MERCADO PAGO CHECKOUT OFICIAL]*\n¡De diez ${clientName}! 🥩💳 Acá tenés el link de pago oficial y seguro para tu pedido **#${orderId}** (Cliente N.° ${customerNum}) por **$${Number(amount).toLocaleString('es-AR')}**:${modeTag}\n\n1️⃣ **Link de Pago Directo:**\n🔗 ${dynamicLink}\n\n2️⃣ **Transferencia / Dinero en cuenta:**\n📱 *Alias Mercado Pago:* \`republica.carne.mp\`\n\nPodés abonar con Dinero en cuenta, Débito, Crédito o Transferencia. En cuanto se acredite, ¡comenzamos la preparación de tus cortes en carnicería! 🙌 [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.035 HISTORIAL Y ESTADO DE PEDIDOS ANTERIORES
    // =========================================================================
    const isOrderHistoryQuery = /historial.*ped|mis pedidos|mis compras|que pedi antes|que pedí antes|pedidos anteriores|compras anteriores|ver mis pedidos/i.test(t);
    if (isOrderHistoryQuery) {
      return ChatStrategyGraphService.handleOrderHistory(lead, clientName);
    }

    // =========================================================================
    // 0.04 SALUDO PROACTIVO CON OFERTAS Y MENÚ NUMERADO DE CORTES ESTRELLA
    // =========================================================================
    const cleanGreetingCheck = cleanConfirmText.replace(/[¡!¿\?,\.]+/g, '').trim();
    const isGreeting = /^(?:hola|holis|buenas|buen dia|buen día|buenos dias|buenos días|buenas tardes|buenas noches|que tal|qué tal|hola carlos|hola carnicero|hola amigo|hola don juan|hola!|buenas!|hola buenos dias|hola buenos días|hola buenas tardes|como estas|cómo estás|como va|cómo va|que onda|qué onda)$/i.test(cleanGreetingCheck) ||
      (t.length <= 25 && /^(?:hola|holis|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|que tal|qué tal)/i.test(t));

    if (isGreeting) {
      if (currentActiveOrder) {
        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        const greetingHeader = getContextualGreeting(rawText, clientName);
        return `${greetingHeader}\n\n` +
          `📌 *Tenés un pedido activo en curso:* **#${currentActiveOrder.id}** (${statusLabel}) por **$${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}**.\n\n` +
          `👉 ¿Querés consultar el estado / modificarlo, o te gustaría armar un **pedido nuevo**? 🥩🔥`;
      }

      const greetingHeader = getContextualGreeting(rawText, clientName);
      const welcomeIntros = [
        `Contame, ¿tenías ganas de preparar un asadito o buscás cortes frescos para la semana? Hacemos envíos directos en el día a todo Córdoba. 🛵🥩`,
        `¿Estás planeando un asadito o buscás cortes para la semana? Hacemos envíos directos en el día a todo Córdoba. 🛵🥩`,
        `¿Tenías ganas de prender el fuego para un asado o precisás cortes para el día a día? Hacemos envíos directos en el día a tu domicilio. 🛵🥩`
      ];
      const selectedIntro = pickRandom(welcomeIntros);

      return `${greetingHeader}\n\n` +
        `${selectedIntro}\n\n` +
        `👉 *Opciones rápidas:*\n` +
        `1️⃣ Ver ofertas del día y combos\n` +
        `2️⃣ Asesoramiento de asado por cantidad de personas\n` +
        `3️⃣ Consultar nuestras 6 sucursales\n\n` +
        `¿Por dónde arrancamos? 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    const isSingleMenuNumber = /^(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|la 1|la 2|la 3|la 4|la 5|la 6|la 7|la 8|el 1|el 2|el 3|el 4|el 5|el 6|el 7|el 8|opci[oó]n 1|opci[oó]n 2|opci[oó]n 3|opci[oó]n 4|opci[oó]n 5|opci[oó]n 6|opci[oó]n 7|opci[oó]n 8)$/i.test(t.trim());

    if (wasMenuOffered && isSingleMenuNumber && !/¿Cómo preferís abonar\?/i.test(lastAgentMessage)) {
      const numMatch = t.match(/([1-9]|1[0-9]|20)/);
      const optNum = numMatch ? parseInt(numMatch[0], 10) : 1;
      const catalogToOffer = getFeaturedWhatsAppOffers(products);
      const chosen = catalogToOffer[optNum - 1] || catalogToOffer[0];

      const itemText = `• 1 ${chosen.unit === 'kg' ? 'kg' : chosen.unit} ${chosen.name} — $${Number(chosen.price).toLocaleString('es-AR')}`;
      const subtotalAmount = chosen.price;
      const orderIntro = getVariedOrderIntro(clientName);
      const delivQ = getVariedDeliveryQuestion();

      return `${orderIntro}\n\n` +
        `📋 *Detalle de tu pedido:*\n` +
        `${itemText}\n` +
        `💰 *Subtotal acumulado:* **$${subtotalAmount.toLocaleString('es-AR')}**\n\n` +
        `${delivQ} [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 0.1 CONFIRMACIÓN DE MÉTODO DE PAGO (INCLUYE RESPUESTAS NUMÉRICAS 1, 2, 3, OPCIÓN 1, ETC.)
    // =========================================================================
    const isLastMsgPaymentPrompt = /¿Cómo preferís abonar\?|1️⃣.*Efectivo|2️⃣.*Transferencia|3️⃣.*Mercado Pago|Paso 4 de 4/i.test(lastAgentMessage);

    const isNumericPayment1 = /^(?:1|1️⃣|uno|opci[oó]n 1|la 1|el 1|1\.)$/i.test(t.trim());
    const isNumericPayment2 = /^(?:2|2️⃣|dos|opci[oó]n 2|la 2|el 2|2\.)$/i.test(t.trim());
    const isNumericPayment3 = /^(?:3|3️⃣|tres|opci[oó]n 3|la 3|el 3|3\.)$/i.test(t.trim());

    const isPaymentChoice = (isLastMsgPaymentPrompt && (isNumericPayment1 || isNumericPayment2 || isNumericPayment3)) ||
      (!wasDataConfirmOffered && !wasBranchMenuOffered && !wasModMenuOffered && !wasDeliveryTypeOffered && !wasInTransitChoiceOffered &&
        /^(?:efectivo|transferencia|transferir|al repartidor|contra entrega|contraentrega|por mp|mercado pago|pago al recibir|abono al repartidor|abono en efectivo|al retirar|abono al retirar|pago al retirar|en sucursal|en la sucursal|abono en sucursal|pago en sucursal|con debito|con débito|tarjeta al retirar|debito|débito|al buscarlo|efectivo al repartidor|por transferencia)$/i.test(t.trim())) ||
      /(?:efectivo al repartidor|por transferencia|abono en efectivo|al recibir|abono al retirar|pago al retirar|en sucursal|pago en sucursal)/i.test(t.trim());

    if (isPaymentChoice) {
      let lastOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      let payMethod = 'Efectivo contraentrega';

      if (isNumericPayment2 || /transferencia|transferir|alias/i.test(t)) {
        payMethod = 'Transferencia Bancaria (Alias: republica.carne.mp)';
      } else if (isNumericPayment3 || /mp|mercado|link|tarjeta/i.test(t)) {
        payMethod = 'Mercado Pago (Checkout Pro)';
      } else if (/debito|débito/i.test(t)) {
        payMethod = 'Débito / Tarjeta al retirar';
      } else if (/retirar|sucursal/i.test(t)) {
        payMethod = 'Efectivo / Débito al retirar';
      } else {
        payMethod = 'Efectivo contraentrega';
      }

      const branchName = lastOrder?.branch || lead.preferredBranch || 'Urca Central (Av. José Roque Funes 1115)';

      if (lastOrder) {
        lastOrder = db.updateOrder(lastOrder.id, {
          status: 'preparing',
          paymentMethod: payMethod,
          ...(lastOrder.deliveryType === 'pickup' || /retirar|sucursal/i.test(t) ? { branch: branchName, deliveryType: 'pickup' } : {})
        });
      } else {
        const { items: historyItems, total: historyTotal, products: parsedProducts } = extractItemsFromHistoryAndText(history, '', products, lead);
        const finalItems = historyItems.length > 0 ? historyItems : [
          '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999'
        ];
        const finalTotal = historyTotal > 0 ? historyTotal : 39999;
        lastOrder = db.createOrder({
          jid: lead.jid || lead.id,
          customerName: clientName,
          phone: lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351 626-2475'),
          address: lead.address || '',
          items: finalItems,
          products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : undefined,
          totalAmount: finalTotal,
          paymentMethod: payMethod,
          status: 'preparing',
          channel: 'WHATSAPP',
          source: 'WHATSAPP',
          origin: 'WHATSAPP',
          deliveryType: lead.deliveryType || 'pickup',
          branch: branchName
        });
      }

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, {
          stage: 'closed_won',
          ...(lastOrder?.deliveryType === 'pickup' || /retirar|sucursal/i.test(t) ? { preferredBranch: branchName, deliveryType: 'pickup' } : {})
        });
      }

      const destinationText = (lastOrder?.deliveryType === 'pickup' || /retirar|sucursal/i.test(t)) 
        ? `para que lo retires listo por nuestra sucursal **${branchName}**` 
        : 'para despacharlo dentro de las 24 hs a tu domicilio';

      let paymentExtraInfo = '';
      if (payMethod.includes('Transferencia')) {
        paymentExtraInfo = '\n📱 *Alias para transferir:* `republica.carne.mp` (Titular: República de la Carne). Enviame el comprobante por acá cuando lo realices. 👍';
      } else if (payMethod.includes('Mercado Pago')) {
        let dynamicLink = lastOrder?.paymentLink || '';
        try {
          if (lastOrder) {
            const pref = await mercadoPagoService.createPaymentPreference(lastOrder);
            dynamicLink = pref.checkoutUrl;
          }
        } catch (mpErr) {
          console.error('Error generando link de Mercado Pago al confirmar pago:', mpErr);
        }
        const creds = mercadoPagoService.getCredentials();
        const modeTag = creds.isSandbox ? ' (Modo Sandbox)' : '';
        paymentExtraInfo = `\n🔗 *Link de pago seguro de Mercado Pago${modeTag}:*\n${dynamicLink || 'https://www.mercadopago.com.ar'}\n\nPodés abonar con cualquier tarjeta de débito/crédito, dinero en cuenta de MP o transferencia.`;
      }

      return `¡De diez ${clientName}! 🥩🔥 Ya quedó 100% asentado tu pedido${lastOrder ? ` **#${lastOrder.id}**` : ''} con medio de pago **${payMethod}**.\n\nYa lo pasamos al sector de corte ${destinationText}.${paymentExtraInfo}\n\n¡Muchas gracias por tu compra en República de la Carne! 🙌 [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.2 CORRECCIÓN DE TOTAL / RECLAMO DE PEDIDO INCORRECTO ("esta mal el pedido", "esta mal el peddo", "esta mal el total")
    // =========================================================================
    const isOrderComplaint = /esta mal el ped|está mal el ped|el pedido esta mal|el pedido está mal|esta mal el total|está mal el total|el total esta mal|el total está mal|el precio esta mal|el precio está mal|cobraste mal|calculaste mal|corregi el total|corregí el total|no son tantos|por que tanto|falta el combo|eso no pedi|eso no pedí|no es lo que pedi|no es lo que pedí/i.test(t);
    if (isOrderComplaint) {
      const { items: fullItems, total: fullTotal } = extractItemsFromHistoryAndText(history, '', products);
      const itemsList = fullItems.length > 0 ? fullItems.join('\n') : '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999\n• 2 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) — $10.000';
      const realTotal = fullTotal > 0 ? fullTotal : 49999;
      const formattedTotal = `$${realTotal.toLocaleString('es-AR')}`;

      if (lead.jid || lead.id) {
        const activeOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
        if (activeOrder) {
          db.updateOrder(activeOrder.id, {
            items: fullItems.length > 0 ? fullItems : itemsList.split('\n'),
            totalAmount: realTotal
          });
        }
      }

      return `¡Mil disculpas ${clientName}! 🥩 Tenés toda la razón, se me había desfasado el resumen. Te dejo asentado el pedido completo con todos tus cortes:\n\n` +
        `📋 *Detalle corregido de tu pedido:*\n${itemsList}\n` +
        `💰 *Total correcto a abonar:* **${formattedTotal}**\n\n` +
        `📍 *Dirección de entrega:* ${lead.address || 'Locelso 7100'}\n\n` +
        `👉 ¿Confirmamos con este total correcto para despacharte en el día? (Respondé *SÍ* para finalizar) 🙌 [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 0.3 CONFIRMACIÓN EXPLÍCITA DE DATOS DE ENVÍO Y AGENDADO ("sí", "correcto", "1", "opción 1", etc.)
    // =========================================================================
    const isConfirmationReply = /^(?:s[ií]|correcto|confirmar|confirmo|dale|est[aá] bien|perfecto|de diez|avanza|avanzar|ok dale|s[ií] dale|s[ií] correcto|exacto|as[ií] es|s[ií] est[aá] bien|s[ií] perfecto|si confirmo|s[ií] confirmo)$/i.test(cleanConfirmText) ||
      (wasDataConfirmOffered && /^(?:1|1️⃣|opci[oó]n 1|la 1|el 1|si|s[ií])$/i.test(t.trim()));

    if (isConfirmationReply) {
      const { items: parsedItems, total: parsedTotal, products: parsedProducts } = extractItemsFromHistoryAndText(history, '', products);
      const finalItems = parsedItems.length > 0 ? parsedItems : [
        '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999',
        '• 2 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) — $10.000'
      ];
      const finalTotal = parsedTotal > 0 ? parsedTotal : 49999;
      const formattedTotal = `$${finalTotal.toLocaleString('es-AR')}`;
      const addressDest = lead.address || 'Locelso 7100';
      const clientPhone = lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351');

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { 
          name: clientName,
          pushName: clientName,
          address: addressDest,
          phone: clientPhone,
          isRegistered: true,
          isVerified: true,
          registeredAt: new Date().toISOString(),
          notes: `Cliente agendado y registrado. Dirección: ${addressDest} | Tel: ${clientPhone}`
        });
      }

      const newOrder = db.createOrder({
        jid: lead.jid || lead.id,
        phone: clientPhone,
        customerName: clientName,
        address: addressDest,
        items: finalItems,
        products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : undefined,
        totalAmount: finalTotal,
        paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
        status: 'pending'
      });

      const customerNum = lead.customerNumber || `CLI-${(lead.id || '0000').slice(-4).toUpperCase()}`;
      return `¡Excelente ${clientName}! 🎉 Datos confirmados y agendados con éxito. Ya generamos tu orden de compra:\n\n` +
        `🆔 *N° de Pedido:* #${newOrder.id}\n` +
        `👤 *Cliente:* ${clientName} (N.° ${customerNum})\n` +
        `📱 *Teléfono:* ${clientPhone}\n` +
        `📋 *RESUMEN DE TU PEDIDO:*\n${finalItems.join('\n')}\n` +
        `💰 *Total a abonar:* **${formattedTotal}**\n\n` +
        `📍 *Destino de Entrega:* ${addressDest}\n` +
        `🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n\n` +
        `💳 *Paso 4 de 4 — ¿Cómo preferís abonar?*\n` +
        `1️⃣ *Efectivo* al repartidor\n` +
        `2️⃣ *Transferencia* (Alias: \`republica.carne.mp\`)\n` +
        `3️⃣ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `👉 Respondé *1*, *2* o *3*. 🥩 [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.4 SALUDOS PUROS (Sin cortes ni pedidos)
    // =========================================================================
    const isPureGreetingMessage = /^(hola|buen|buenas|que tal|saludos|hey|alo|buenos dias|buenas tardes|buenas noches|hola que tal|hola carlos)$/i.test(cleanConfirmText);
    if (isPureGreetingMessage) {
      // Si el cliente tiene un pedido activo en curso, saludarlo mencionando su pedido
      if (currentActiveOrder) {
        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        const amountFormatted = `$${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}`;
        return `¡Hola ${clientName}! 👋 Carlos por acá, de República de la Carne. Veo que tenés un pedido activo **#${currentActiveOrder.id}** en estado **${statusLabel}** (Total: ${amountFormatted}).\n\n👉 ¿Querés consultar el estado / modificarlo, o te gustaría armar un **pedido nuevo**? 🥩🔥 [[STAGE:qualified]]`;
      }

      const isUnregistered = !lead.isRegistered && (isGarbageName(lead.name) || (!nameGreeting && (!lead.name || lead.name.startsWith('+'))));
      if (isUnregistered) {
        return `¡Hola! 👋 Carlos por acá, maestro carnicero de **República de la Carne**.\n\n` +
          `Para agendarte en nuestro sistema y coordinar tus envíos directos en el día, ¿me indicarías por favor:\n` +
          `👤 **Tu Nombre y Apellido**\n` +
          `📍 **Tu Dirección de Entrega y Barrio** (o si preferís retirar por sucursal)\n\n` +
          `¡Y contame qué cortes o promo tenías ganas de preparar hoy para armarte la propuesta perfecta! 🥩🔥 [[STAGE:qualified]]`;
      }

      return `¡Hola ${clientName}! 👋 Carlos por acá, maestro carnicero de República de la Carne. Te ayudo a armar tu pedido para que no te falte nada.\n\n¿Estás planeando un asado, comida familiar o querés aprovechar nuestras ofertas del día? Contame qué cortes estás buscando o para cuántas personas calculamos y te armo la propuesta perfecta. 🥩🔥 [[STAGE:qualified]]`;
    }

    // =========================================================================
    // 0.5 CONSULTA Y MODIFICACIÓN DE DATOS PERSONALES
    // =========================================================================
    const emailMatch = t.match(/^(?:mi email es|mi correo es|cambiar mi email a|email)\s*[:=]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                       t.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && (/email|correo|anota mi mail|guarda mi mail/i.test(t) || t.startsWith('mi email es') || t.startsWith('mi correo es'))) {
      const email = emailMatch[1].trim();
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { email });
      }
      return `¡Perfecto ${clientName}! 📧 Quedó guardado tu correo electrónico: **${email}** en tu ficha de cliente.\n\n¿En qué más te puedo ayudar hoy? 🙌 [[STAGE:proposal]]`;
    }

    const nameUpdateMatch = t.match(/^(?:cambiar mi nombre a|mi nombre es|me llamo|decime|anotame como)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]{2,30})$/i);
    if (nameUpdateMatch) {
      const newName = nameUpdateMatch[1].trim();
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { name: newName, pushName: newName, realName: newName });
      }
      return `¡De diez! 🥩 Ya actualicé tu nombre en el sistema como **${newName}**. ¡Un gusto atenderte! 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 1. RECHAZO DE COMPLEMENTOS / CIERRE DE ÍTEMS DEL PEDIDO ("solo eso, evio a domicilio", "nada más", "solo eos")
    // =========================================================================
    const isDeclineComplements = /^(?:no,? )?(?:solo eso|soo eso|solo eos|solo es|nada m[aá]s|eso solo|eso nada m[aá]s|ninguno|as[ií] est[aá] bien|dejalo as[ií]|dame mi pedido|pasemos directo|directo al env[ií]o|sin complementos|solo lo que ped[ií])/i.test(cleanConfirmText) ||
                                 /(?:solo eso|solo eos|nada m[aá]s|eso solo|solo para env[ií]o|solo para evio)/i.test(t);

    // =========================================================================
    // 2. DETECTOR DE DIRECCIÓN Y NOMBRE REAL (PRESENTACIÓN Y SOLICITUD DE CONFIRMACIÓN)
    // =========================================================================
    const isInformationalQuery = /(?:hora|horario|cierran|abren|cuanto|precio|costo|consulta|duda|donde|dónde|a que hora|tenes|tenés|vendes|vendés|abierto|atienden)\b/i.test(t);
    const hasAddressPatterns = /(?:calle|av\b|av\.|avenida|bv\b|bv\.|bulevar|barrio|piso|dpto|departamento|timbre|nro|n°|funes|locelso|pidal|alamos|alcorta|luchesse|quiros|colon|urca|cerro|entre|altura|manzana|lote|san martin)/i.test(t) ||
      /^(?:te paso mi direccion|mi direccion es|direccion:?|la direccion es|la direccion de entrega es|vivo en|estoy en|mandalo a|mandar a|enviar a|entregar en)\s+/i.test(t) ||
      (rawText.includes(',') && /[0-9]{2,5}/.test(rawText));
    const hasRealAddress = !isInformationalQuery && hasAddressPatterns && (/[0-9]{1,5}/.test(t) || /vivo en|enviar a|mandar a|entregar en/i.test(t) || ((/funes|locelso|pidal|quiros|alamos|alcorta|luchesse/i.test(t)) && /[0-9]{2,5}/.test(t)));

    if (hasRealAddress && t.length > 5) {
      let extractedName = '';
      let cleanAddress = extractCleanAddress(rawText);

      const comboMatch = rawText.match(/(?:mi nombre(?: es)?|me llamo|soy|nombre:?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+){0,3})(?:\s+y\b|\s+vivo|\s+en|,|\.|$|\bdireccion)/i);
      if (comboMatch && comboMatch[1].trim().length >= 3) {
        const cand = comboMatch[1].trim();
        if (!isGarbageName(cand)) extractedName = cand;
      }

      if (!cleanAddress || cleanAddress.length < 3 || isGarbageAddress(cleanAddress)) {
        cleanAddress = rawText.trim();
      }

      let finalClientName = extractedName || clientName;

      const phoneMatch = rawText.match(/(?:tel|cel|telefono|teléfono|wsp|whatsapp)?\s*[:\-\s]?\s*(\+?54\s*9?\s*\d{8,12}|\b351\d{7}\b|\b15\d{7,8}\b|\b\d{10,13}\b)/i);
      let clientPhone = lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351');
      if (phoneMatch && phoneMatch[1]) {
        clientPhone = phoneMatch[1].trim();
      }

      db.updateLead(lead.jid || lead.id, { 
        address: cleanAddress, 
        phone: clientPhone,
        ...(finalClientName ? { name: finalClientName, pushName: finalClientName } : {}),
        notes: `Dirección registrada: ${cleanAddress}${finalClientName ? ` | Nombre: ${finalClientName}` : ''} | Tel: ${clientPhone}`
      });

      // Evaluar si la dirección cumple con las condiciones y filtros de entrega
      const addressFilter = OrderFilterEngine.evaluateOrder({
        phone: clientPhone,
        address: cleanAddress,
        deliveryType: 'delivery'
      });

      if (!addressFilter.allowed && addressFilter.action === 'pickup_only') {
        return `¡Hola ${finalClientName}! 📍 Tomamos nota de tu ubicación en **${cleanAddress}**.\n\n` +
          `⚠️ *Aviso de Cobertura de Envíos:*\n${addressFilter.message}\n\n` +
          `🏪 *Podés retirar tus cortes frescos en cualquiera de nuestras 6 sucursales:*\n` +
          `1️⃣ *Urca Central* (📍 Av. José Roque Funes 1115)\n` +
          `2️⃣ *Urca 2 – Alto Tejeda* (📍 Av. Menéndez Pidal 3575)\n` +
          `3️⃣ *Intercountry – Corteza Mall* (📍 Av. Los Álamos 1015)\n` +
          `4️⃣ *Duarte Quirós* (📍 Av. Duarte Quirós 5130)\n` +
          `5️⃣ *Villa Allende – Mercadito de la Villa* (📍 Av. Figueroa Alcorta 480)\n` +
          `6️⃣ *Country San Isidro – Alto Tejeda* (📍 Av. Padre Luchesse km 2)\n\n` +
          `👉 *Respondé con el número (1 al 6) de tu sede preferida para dejártelo listo.* 🥩🙌 [[STAGE:proposal]]`;
      }

      const { items: parsedItems, total: parsedTotal } = extractItemsFromHistoryAndText(history, rawText, products, lead);
      const itemsList = parsedItems.length > 0 ? parsedItems : [
        '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999',
        '• 2 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) — $10.000'
      ];
      const finalTotal = parsedTotal > 0 ? parsedTotal : 49999;
      const formattedTotal = `$${finalTotal.toLocaleString('es-AR')}`;

      return `📋 *FICHA DE REGISTRO Y DATOS DE ENVÍO:*\n\n` +
        `👤 *Destinatario / Cliente:* **${finalClientName}**\n` +
        `📱 *Teléfono de Contacto:* **${clientPhone}**\n` +
        `📍 *Dirección de Entrega:* **${cleanAddress}**\n` +
        `🥩 *Detalle del Pedido:*\n${itemsList.join('\n')}\n` +
        `💰 *Total a abonar:* **${formattedTotal}**\n\n` +
        `👉 **¿Confirmamos estos datos para agendarte y guardarte en el sistema?**\n` +
        `1️⃣ Confirmar datos y pasar al pago\n` +
        `2️⃣ Modificar algún dato (nombre, teléfono o dirección)\n` +
        `3️⃣ Cancelar pedido\n\n` +
        `👉 Respondé *1*, *2* o *3* (o escribí *SÍ* para confirmar). 🥩🚚 [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 3. INTENCIÓN DE ENVÍO SIN DIRECCIÓN ESPECÍFICA (ej: "solo eso, evio a domicilio", "dale envíamelo", "te paso mi dirección")
    // =========================================================================
    const isDeliveryIntentWithoutAddress = /(?:a|para)\s+(?:mi\s+)?(?:domicilio|casa|depto|departamento)|(?:hacelo|mandamelo|mandámelo|enviame|envíame|envialo|envíalo|quiero\s+envio|quiero\s+envío|con\s+envio|con\s+envío|por\s+delivery|hacer\s+delivery|evio a domicilio|envio a domicilio|envío a domicilio|a domicilio|para envio|para envío|para evio|dale enviamelo|dale envíamelo|te paso mi direcci|te paso la direcci|te paso mi dir|paso mi direcci|paso direccion)/i.test(t) && 
      !/[0-9]{2,5}/.test(t) && 
      !/(?:funes|locelso|pidal|quiros|alamos|alcorta|luchesse|colon|urca|calle|av\.|avenida|barrio|altura)/i.test(t);

    if (isDeliveryIntentWithoutAddress || (isDeclineComplements && /domicilio|envio|envío|evio/i.test(t))) {
      if (lead.address && lead.address.length >= 5 && !isGarbageAddress(lead.address)) {
        const { items: parsedItems, total: parsedTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
        const finalItems = parsedItems.length > 0 ? parsedItems : ['• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999'];
        const formattedTotal = `$${(parsedTotal || 39999).toLocaleString('es-AR')}`;
        const clientPhone = lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351');

        return `📋 *FICHA DE REGISTRO Y DATOS DE ENVÍO:*\n\n` +
          `👤 *Destinatario / Cliente:* **${clientName}**\n` +
          `📱 *Teléfono de Contacto:* **${clientPhone}**\n` +
          `📍 *Dirección de Entrega:* **${lead.address}**\n` +
          `🥩 *Detalle del Pedido:*\n${finalItems.join('\n')}\n` +
          `💰 *Total a abonar:* **${formattedTotal}**\n\n` +
          `👉 **¿Confirmamos estos datos para agendarte y guardarte en el sistema?**\n` +
          `1️⃣ Confirmar datos y pasar al pago\n` +
          `2️⃣ Modificar algún dato (nombre, teléfono o dirección)\n` +
          `3️⃣ Cancelar pedido\n\n` +
          `👉 Respondé *1*, *2* o *3* (o escribí *SÍ* para confirmar). 🥩🚚 [[STAGE:confirming_data]]`;
      }
      return `¡De diez ${clientName}! 🛵 Programamos el envío directo a tu puerta en el día.\n\nPor favor, indícanos con precisión:\n📍 *Dirección de Entrega:* (Calle, Número/Altura y Barrio)\n👤 *Nombre y Apellido:* (Para la etiqueta del paquete)\n\n¡Así verificamos los datos y dejamos listo tu pedido! 🥩 [[STAGE:proposal]]`;
    }

    if (isDeclineComplements) {
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const itemsList = historyItems.length > 0 ? historyItems.join('\n') : '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999';
      const formattedTotal = `$${(historyTotal || 39999).toLocaleString('es-AR')}`;

      return `¡De diez ${clientName}! 🥩🚚 Cerramos con tu pedido confirmado:\n\n` +
        `📋 *Detalle de tu pedido:*\n${itemsList}\n` +
        `💰 *Total:* **${formattedTotal}**\n\n` +
        `👉 *Paso 3 de 4 — ¿Cómo preferís recibir tu pedido?*\n` +
        `1️⃣ *Envío a Domicilio* (te lo llevamos en el día)\n` +
        `2️⃣ *Retiro en Sucursal* (en cualquiera de nuestras 6 sedes en Córdoba)\n\n` +
        `👉 Respondé *1* o *2* (o pasame directamente tu dirección o sucursal). 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3.5 ASESORAMIENTO CULINARIO Y RECETAS (ASADOS, MILANESAS, GUISOS, HORNO)
    // =========================================================================
    const isCulinaryConsultation = /(?:para hacer|para preparar|recomendas para|recomendás para|que me recomendas|qué me recomendás|que corte|qué corte|para guiso|para estofado|para milanesas|para horno|para asado|hacer milanesas|hacer un asado|somos \d+|para \d+ personas)/i.test(t);
    if (isCulinaryConsultation) {
      const advice = ChatStrategyGraphService.handleCulinaryAndAsado(rawText, clientName, products);
      if (advice) return advice;
    }

    // =========================================================================
    // =========================================================================
    // 4. DETECCIÓN EXACTA DE ÍTEMS, CANTIDADES Y ADICIONES / CORRECCIONES
    // =========================================================================
    const isAdditionOrder = /agrega|agregá|agregar|agregame|agregale|suma|sumá|sumar|sumale|sumame|sumar|ademas|además|tambien|también|sumale también|mas los|más los|mas 1|mas 2|y los|y las|y 1|y 2/i.test(t);
    const isCorrectionOrder = /corregi|corregí|corrije|corrijí|corregime|corrijeme|solo quiero|un solo|una sola|no, solo|nada mas|en vez de/i.test(t);
    const hasOrderVerb = /(?:quiero|mandame|mandámelo|mandamelo|enviame|envíame|traeme|traéme|armame|armáme|anotame|anótame|dame|separame|sepárame|preparame|prepárame|haceme|llevame|llevale|tenes|tenés|vendes|vendés)/i.test(t);
    const hasQuantityExplicit = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|combo|bolsa|botella|bifes?|tiras?|piezas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b\d+\s+(?:de\s+)?(?:kilos?|kg|unidades?))/i.test(t);
    const isQuestionOrInquiry = /^(?:qu[eé]|cu[aá]l|cu[aá]les|mostrame|pasame|decime)\s+(?:opciones|cortes|tipos|variedades|precios|promo|ofertas?|de\s+)/i.test(t) || 
      /(?:qu[eé]\s+opciones|qu[eé]\s+hay|qu[eé]\s+cortes|qu[eé]\s+variedad|qu[eé]\s+tipos)/i.test(t);

    const mentionedProducts = findAllMentionedProducts(rawText, products);
    const matchedSingleProduct = matchBestProduct(rawText, products);
    const hasProductMention = (mentionedProducts && mentionedProducts.length > 0) || matchedSingleProduct !== null || /combo|asadazo|vacio|vacío|costillar|tapa|cuadril|entraña|matambre|milanesa|chori|morcilla|molida|costeleta|pata muslo|carbon|carbón|vino|pollo|peceto|lomo|nalga|bola|falda|asado|carne/i.test(t);
    const isQuantityOnlyMsg = /(?:^|\s)(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?)|medio\s+kilo|1\/2\s*kg|dos|tres|cuatro|cinco|seis|ocho|diez|\d+)(?:\s|$)/i.test(t);

    if (((hasProductMention || isAdditionOrder || isCorrectionOrder || isQuantityOnlyMsg) && !isQuestionOrInquiry) || (hasProductMention && (hasOrderVerb || hasQuantityExplicit))) {
      // 1. Si el cliente pide o menciona múltiples productos (ej: "quiero vacío y chorizos", "asado, matambre y carbón")
      if (mentionedProducts.length >= 2 && !hasQuantityExplicit && !isCorrectionOrder && !isQuantityOnlyMsg) {
        return formatProductQuantityPrompt(mentionedProducts, clientName);
      }

      // 2. Si el cliente pide un corte genérico con múltiples variedades (ej: "cuadril", "matambre", "chorizo", "milanesas")
      const ambiguous = findAmbiguousProducts(rawText, products);
      if (ambiguous && ambiguous.matches && ambiguous.matches.length >= 2 && !isCorrectionOrder && !isQuantityOnlyMsg && !hasQuantityExplicit) {
        const formattedAmbiguous = formatNumberedCatalog(ambiguous.matches);
        return `¡De diez ${clientName}! 🥩 En mostrador tenemos varias opciones de **${ambiguous.term}**: 👇\n\n` +
          `${formattedAmbiguous}\n\n` +
          `👉 *¿Cuál de estas opciones preferís que te preparemos y cuántos kilos o unidades te separamos?* 🥩🚚 [[STAGE:proposal]]`;
      }

      // 3. Si el cliente pide o menciona un producto específico pero NO indicó cantidad explícita (peso o unidad)
      if (!hasQuantityExplicit && !isCorrectionOrder && !isQuantityOnlyMsg) {
        const targetPromptProd = (mentionedProducts.length > 0 ? mentionedProducts[0] : null) || matchedSingleProduct;
        if (targetPromptProd && !/combo asadazo/i.test(targetPromptProd.name || '')) {
          return formatProductQuantityPrompt(targetPromptProd, clientName);
        }
      }

      const { items: detectedItems, total: detectedTotal, addedItems, products: detectedProducts } = extractItemsFromHistoryAndText(history, rawText, products, lead);
      
      if (detectedItems.length > 0) {
        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          db.updateOrder(currentActiveOrder.id, {
            items: detectedItems,
            products: detectedProducts,
            totalAmount: detectedTotal
          });
        } else if (!currentActiveOrder && detectedItems.length > 0) {
          const newOrder = db.createOrder({
            jid: lead.jid || lead.id,
            customerName: clientName,
            phone: lead.phone || (lead.jid ? `+${lead.jid.split('@')[0]}` : ''),
            items: detectedItems,
            products: detectedProducts,
            totalAmount: detectedTotal,
            status: 'pending',
            source: 'whatsapp',
            deliveryType: lead.deliveryType || 'pickup',
            address: lead.address || '',
            branch: lead.preferredBranch || ''
          });
          currentActiveOrder = newOrder;
        }
        const formattedTotal = `$${detectedTotal.toLocaleString('es-AR')}`;
        let prefixGreeting = `¡De diez ${clientName}! 🥩 Te separo los cortes solicitados:`;
        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          prefixGreeting = `¡Actualizado ${clientName}! 🥩 Modificamos y dejamos asentado tu pedido **#${currentActiveOrder.id}**:`;
        } else if (isAdditionOrder && addedItems && addedItems.length > 0) {
          const addedDesc = addedItems.map(a => `${a.quantity} ${a.prod.unit} ${a.prod.name}`).join(' y ');
          prefixGreeting = `¡De diez ${clientName}! 🥩 Sumamos *${addedDesc}* a tu pedido:`;
        } else if (isCorrectionOrder) {
          prefixGreeting = `¡Corregido ${clientName}! 👍 Dejamos asentado tu pedido actualizado:`;
        } else if (addedItems && addedItems.length > 0) {
          const addedDesc = addedItems.map(a => `${a.quantity} ${a.prod.unit} ${a.prod.name}`).join(' y ');
          prefixGreeting = `¡De diez ${clientName}! 🥩 Sumamos *${addedDesc}* a tu pedido:`;
        }

        const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';

        const crossSelling = getCrossSellingSuggestion(detectedItems, products);
        const crossSellingSection = crossSelling ? `${crossSelling}\n\n` : '';

        return `${prefixGreeting}\n\n` +
          `📋 *Detalle de tu pedido${orderNotice}:*\n` +
          `${detectedItems.join('\n')}\n` +
          `💰 *Total acumulado:* *${formattedTotal}*\n\n` +
          crossSellingSection +
          (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)
            ? `📍 *Entrega:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n\n¿Precisás realizar algún otro cambio o lo dejamos listo para despachar? 🙌 [[STAGE:proposal]]`
            : `👉 *¿Cómo seguimos con tu pedido?*\n` +
              `1️⃣ Coordinar *Envío a Domicilio* en el día 🛵\n` +
              `2️⃣ Elegir *Retiro por Sucursal* (6 sedes en Córdoba) 🏪\n` +
              `3️⃣ Sumar más cortes o complementos (chorizos, carbón, vino) 🥩\n\n` +
              `👉 *Respondé 1, 2 o 3 (o escribí "delivery", "sucursal" o los cortes).* 🙌 [[STAGE:proposal]]`);
      }
    }

    // =========================================================================
    // 5. CONSULTA DE OFERTAS, PRECIOS, CORTES ESPECÍFICOS Y CATÁLOGO DINÁMICO
    // =========================================================================
    const isCategoryQuery = /cerdo|porcino|achura|achuras|molleja|chinchulin|chinchulines|combo|combos|promo|promos|embutido|embutidos|chorizo|morcilla|pollo|aviar|bebida|bebidas|vino|vinos|almacen|almacén|carbon|carbón/i.test(t);

    // 5.1 Consulta por producto específico o PLU
    const isExplicitPriceOrAvailabilityAsk = /(?:cu[aá]nto|precio|costo|a cu[aá]nto|sale|cuesta|ten[eé]s|vendes|vend[eé]s)/i.test(t) || /^(?:plu|c[oó]digo|cod\.?)/i.test(t);

    if (matchedSingleProduct && isExplicitPriceOrAvailabilityAsk && !/combo asadazo/i.test(matchedSingleProduct.name) && !/(?:opciones|variedad|tipos)/i.test(t)) {
      return formatProductQuantityPrompt(matchedSingleProduct, clientName);
    }

    // 5.2 Consulta por categoría (ej: "cerdo", "achuras", "combos", "embutidos", "chorizo")
    if (isCategoryQuery || isQuestionOrInquiry) {
      let targetCategory = 'Parrilla y Vacuno';
      let catIcon = '🥩';
      let searchKey = '';
      if (/chorizo|chori/i.test(t)) { targetCategory = 'Achuras y Embutidos'; catIcon = '🌭'; searchKey = 'chori'; }
      else if (/cerdo|porcino/i.test(t)) { targetCategory = 'Cerdo'; catIcon = '🐷'; searchKey = 'cerdo'; }
      else if (/achura|molleja|chinchulin/i.test(t)) { targetCategory = 'Achuras'; catIcon = '🔥'; searchKey = 'achura'; }
      else if (/combo|promo/i.test(t)) { targetCategory = 'Combos en Oferta'; catIcon = '⭐'; searchKey = 'combo'; }
      else if (/embutido|morcilla/i.test(t)) { targetCategory = 'Embutidos Artesanales'; catIcon = '🌭'; searchKey = 'morcilla'; }
      else if (/matambre/i.test(t)) { targetCategory = 'Parrilla y Vacuno'; catIcon = '🥩'; searchKey = 'matambre'; }
      else if (/pollo|aviar/i.test(t)) { targetCategory = 'Pollo'; catIcon = '🍗'; searchKey = 'pollo'; }
      else if (/bebida|vino/i.test(t)) { targetCategory = 'Bebidas'; catIcon = '🍷'; searchKey = 'vino'; }
      else if (/almacen|carbon/i.test(t)) { targetCategory = 'Almacén Parrillero'; catIcon = '🪵'; searchKey = 'carbon'; }

      let catProducts = searchKey ? getCatalogByCategory(searchKey, products, 8) : getCatalogByCategory(targetCategory, products, 8);
      if (catProducts.length > 0) {
        const productLines = catProducts.map((cp, idx) => {
          const pluInfo = cp.plu ? ` [PLU ${cp.plu}]` : '';
          return `${idx + 1}️⃣ *${cp.name}*${pluInfo} ➔ *$${Number(cp.price).toLocaleString('es-AR')}* / ${cp.unit || 'kg'}`;
        }).join('\n');

        const titleHeader = searchKey ? searchKey.toUpperCase() : targetCategory.toUpperCase();
        return `¡Acá tenés nuestras mejores opciones en **${titleHeader}** ${catIcon}! 🥩\n\n` +
          `${productLines}\n\n` +
          `👉 Decime cuál te gustaría que te preparemos o cuántos kilos te separamos y te lo dejamos listo. 🚚 [[STAGE:proposal]]`;
      }
    }

    // 5.3 Consulta general de precios y catálogo
    const isOffersQuery = /oferta|ofertas|promo|promos|promocion|promociones|lista de precios|precios|precio|que tenes|que tenés|que hay|que cortes|carta|catalogo|catálogo/i.test(t);
    if (isOffersQuery) {
      return `¡Mirá ${clientName}! 🔥 Estas son nuestras **OFERTAS Y CORTES DESTACADOS** del día en República de la Carne:\n\n` +
        `🔥 **PROMO ESTRELLA - COMBO ASADAZO (4 kg):**\n` +
        `🥩 Bocado parrillero + Aguja tierna + Falda especial + Chorizos criollos puro cerdo + Morcillas bombón + 🎁 **1 Vino Howlmande de regalo** ➔ **$39.999**\n\n` +
        `🥩 **CORTES SELECCIONADOS DE NOVILLITO (x Kilo):**\n` +
        `• **Tapa de Cuadril Seleccionada [PLU 2]:** $12.800 / kg\n` +
        `• **Vacío Especial / Tierno [PLU 3]:** $11.500 / kg\n` +
        `• **Costillar / Asado de Tira [PLU 4]:** $9.800 / kg\n` +
        `• **Bife de Chorizo Premium [PLU 5]:** $14.500 / kg\n` +
        `• **Entraña Fina Seleccionada [PLU 6]:** $16.900 / kg\n` +
        `• **Carne Molida Especial Magra [PLU 11]:** $11.800 / kg\n` +
        `• **Costeletas de Cerdo [PLU 9] (2kg x $15.000 promo):** $7.500 / kg\n` +
        `• **Chorizo Criollo Puro Cerdo [PLU 7] (2kg x $10.000 promo):** $5.000 / kg\n` +
        `• **Morcilla Bombón Parrillera [PLU 8]:** $5.200 / kg\n` +
        `• **Milanesas de Ternera [PLU 12] (2kg x $24.990 promo):** $12.495 / kg\n` +
        `• **Carbón Quebracho Bolsa Grande [PLU 13]:** $2.200\n\n` +
        `👉 Contamos con más de 750 cortes frescos registrados con entrega en el día en Córdoba. ¿Qué corte te gustaría que te preparemos o para cuántas personas calculamos? 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 6. ASESORAMIENTO CULINARIO, RECETAS Y CÁLCULO DE ASADOS POR COMENSALES
    // =========================================================================
    const culinaryAdvice = ChatStrategyGraphService.handleCulinaryAndAsado(rawText, clientName, products);
    if (culinaryAdvice) {
      return culinaryAdvice;
    }

    // =========================================================================
    // 7. SUCURSALES Y HORARIOS
    // =========================================================================
    if (t.includes('sucursal') || t.includes('sucursales') || t.includes('donde') || t.includes('direccion') || t.includes('horario') || t.includes('urca') || t.includes('quiros') || t.includes('villa allende') || t.includes('san isidro')) {
      return `🏪 **Nuestras 6 Sucursales en Córdoba y Gran Córdoba:**\n\n` +
        `1. **Urca Central:** Av. José Roque Funes 1115 (📞 +54 9 3513 906947) — Lun a Sáb 9 a 21 hs | Dom 9 a 13:30 hs.\n` +
        `2. **Urca 2 (Alto Tejeda):** Av. Menéndez Pidal 3575 (📞 +54 9 3518 623195).\n` +
        `3. **Intercountry (Corteza Mall):** Av. Los Álamos 1015 (📞 +54 9 3518 623194) — Todos los días 9 a 21 hs.\n` +
        `4. **Duarte Quirós:** Av. Duarte Quirós 5130 (📞 +54 9 3518 156595) — 9 a 13:30 y 17 a 21 hs.\n` +
        `5. **Villa Allende (Mercadito de la Villa):** Av. Figueroa Alcorta 480 (📞 +54 9 3513 540031).\n` +
        `6. **Country San Isidro (Alto Tejeda):** Av. Padre Luchesse km 2 (📞 +54 9 3518 769099).\n\n` +
        `🛵 **¡También tenemos Delivery en el día a todo Córdoba!** ¿Por cuál sucursal preferís retirar o a qué dirección te lo enviamos? 🥩`;
    }

    // =========================================================================
    // 8. REENGANCHE CORDIAL FUERA DE FLUJO (SMALLTALK) & FALLBACK DINÁMICO
    // =========================================================================
    return ChatStrategyGraphService.handleOutOfFlow(rawText, clientName, lead);
  }
}
