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
import { tokenTracker } from './tokenTracker.js';
import { embeddedLlama } from './embeddedLlama.js';
import { OrderSyncEngine } from './orderSyncEngine.js';
import { 
  getVariedGreeting, 
  getContextualGreeting,
  getVariedPromoIntro, 
  getVariedOrderIntro, 
  getVariedModificationIntro,
  getVariedCancellationMessage,
  getVariedDeliveryQuestion, 
  getVariedClosing, 
  formatNumberedCatalog, 
  getFeaturedWhatsAppOffers,
  getCrossSellingSuggestion,
  pickRandom 
} from './messageVariations.js';
import { 
  SYSTEM_AI_PROVIDERS, 
  SYSTEM_AI_MODELS, 
  getDefaultModelForProvider, 
  isSystemSupportedProvider, 
  isSystemSupportedModel 
} from '../config/aiModels.js';

/**
 * Mapa de keywords de bÃºsqueda para productos conocidos.
 * Se aplica como capa de mejora sobre los productos dinÃ¡micos de la DB.
 * Las keywords NO contienen precios ni nombres â€” solo alias de bÃºsqueda.
 */
const PRODUCT_KEYWORDS_MAP = {
  'combo asadazo': ['combo asadazo', 'combo "asadazo"', 'combo asado', 'asadazo', 'azadazo', 'asasazo', 'asadaso', 'azadaso', 'combo parrillero', 'combo 4kg', 'combo 4 kg', 'combo'],
  'tapa de cuadril': ['tapa de cuadril', 'tapa cuadril', 'colita de cuadril', 'cuadril', 'picanha'],
  'vacÃ­o': ['vacio especial', 'vacÃ­o especial', 'vacio tierno', 'vacÃ­o tierno', 'vacio', 'vacÃ­o'],
  'costillar': ['costillar de novillito', 'asado de tira novillito', 'costillar', 'asado de tira', 'tira de asado', 'costilla novillito', 'costillar novillito', 'tira novillito', 'costilla'],
  'bife de chorizo': ['bife de chorizo', 'bife chorizo', 'bifes de chorizo', 'ojo de bife', 'bife de lomo'],
  'entraÃ±a': ['entraÃ±a fina', 'entrana fina', 'entraÃ±a', 'entrana', 'entrecot', 'enrecor'],
  'matambrito de cerdo': ['matambre de cerdo', 'matambrito de cerdo', 'matambre cerdo', 'matambrito cerdo', 'matambrito'],
  'matambre vacuno': ['matambre de vaca', 'matambre vacuno', 'matambre'],
  'bondiola': ['bondiola de cerdo', 'bondiola cerdo', 'bondiola'],
  'costeletas de cerdo': ['costeleta de cerdo', 'costeletas de cerdo', 'costeleta cerdo', 'costeletas cerdo', 'chuleta de cerdo', 'chuletas de cerdo'],
  'costeletas de ternera': ['costeleta de ternera', 'costeletas de ternera', 'costeleta ternera', 'costeletas ternera', 'costeleta', 'costeletas'],
  'chorizo': ['chorizo criollo puro cerdo', 'chorizo de cerdo', 'chorizos de cerdo', 'chorizo cerdo', 'chorizos cerdo', 'chori de cerdo', 'choris de cerdo', 'chorizo criollo', 'chori criollo', 'chorizo puro cerdo', 'chorizo', 'chorizos', 'chori', 'choris'],
  'morcilla': ['morcilla bombon', 'morcilla bombÃ³n', 'morcillas bombon', 'morcillas bombÃ³n', 'morcilla', 'morcillas'],
  'mollejas': ['molleja de corazon', 'mollejas de corazon', 'molleja', 'mollejas'],
  'chinchulines': ['chinchulin', 'chinchulines', 'chinchu'],
  'molida especial': ['carne molida especial', 'molida especial', 'picada especial', 'carne picada especial', 'molida de primera', 'molida magra', 'picada de primera', 'picada magra'],
  'molida intermedia': ['carne molida intermedia', 'molida intermedia', 'carne molida comun', 'molida comun', 'carne molida comÃºn', 'molida comÃºn', 'carne molida', 'carne picada', 'molida', 'picada'],
  'milanesas': ['milanesas de ternera', 'milanesa de ternera', 'milanesas', 'milanesa'],
  'pata muslo': ['pata muslo', 'pollo fresco', 'pollo', 'suprema de pollo', 'pechuga'],
  'carbÃ³n': ['carbon quebracho', 'carbÃ³n quebracho', 'bolsa de carbon', 'bolsa de carbÃ³n', 'carbon', 'carbÃ³n'],
  'vino': ['vino howlmande', 'howlmande malbec', 'vino', 'howlmande', 'malbec']
};

/**
 * Obtiene el catÃ¡logo dinÃ¡mico de productos SIEMPRE desde la base de datos.
 * Enriquece cada producto con keywords de bÃºsqueda si tiene coincidencia en el mapa.
 * Esta es la ÃšNICA fuente de verdad para productos en todo el sistema.
 */
function getDynamicCatalog() {
  const products = db.getProducts() || [];
  return products.map(p => {
    // Si el producto ya tiene keywords, usarlas
    if (p.keywords && p.keywords.length > 0) return p;
    // Buscar keywords por nombre del producto
    const pName = (p.name || '').toLowerCase();
    for (const [key, kws] of Object.entries(PRODUCT_KEYWORDS_MAP)) {
      if (pName.includes(key)) {
        return { ...p, keywords: kws };
      }
    }
    return p;
  });
}

// Alias para compatibilidad â€” siempre lee de la DB dinÃ¡mica
const MASTER_CATALOG = null; // DEPRECATED: usar getDynamicCatalog()


export const OFFICIAL_BRANCHES_MENU = [
  { id: 'branch_urca_1', name: 'Urca Central', address: 'Av. JosÃ© Roque Funes 1115', keywords: ['urca central', 'funes', 'urca 1', 'roque funes'] },
  { id: 'branch_urca_2', name: 'Urca 2 â€“ Alto Tejeda', address: 'Av. MenÃ©ndez Pidal 3575', keywords: ['urca 2', 'alto tejeda', 'pidal', 'menendez pidal'] },
  { id: 'branch_intercountry', name: 'Intercountry â€“ Corteza Mall', address: 'Av. Los Ãlamos 1015', keywords: ['intercountry', 'corteza mall', 'los alamos', 'alamos'] },
  { id: 'branch_duarte_quiros', name: 'Duarte QuirÃ³s', address: 'Av. Duarte QuirÃ³s 5130', keywords: ['duarte quiros', 'quiros', 'duarte'] },
  { id: 'branch_villa_allende', name: 'Villa Allende â€“ Mercadito de la Villa', address: 'Av. Figueroa Alcorta 480', keywords: ['villa allende', 'allende', 'alcorta', 'figueroa alcorta'] },
  { id: 'branch_san_isidro', name: 'Country San Isidro â€“ Alto Tejeda', address: 'Av. Padre Luchesse km 2', keywords: ['san isidro', 'luchesse', 'padre luchesse', 'country san isidro'] }
];

export function formatBranchMenu() {
  const numIcons = ['1ï¸âƒ£', '2ï¸âƒ£', '3ï¸âƒ£', '4ï¸âƒ£', '5ï¸âƒ£', '6ï¸âƒ£'];
  return OFFICIAL_BRANCHES_MENU.map((b, idx) => `${numIcons[idx]} *${b.name}* (ðŸ“ ${b.address})`).join('\n');
}

/**
 * Parsea dinÃ¡micamente la opciÃ³n de asesoramiento de asado recomendada (OpciÃ³n 1, 2 o 3)
 * desde el mensaje previo del agente, extrayendo los cortes, cantidades exactas y total.
 */
export function parseAsadoOptionFromMessage(msg, optNum, catalog = null) {
  if (!msg || typeof msg !== 'string') return null;
  const parts = msg.split(/(?:1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£)/);
  if (parts.length <= optNum) return null;

  const catList = (catalog && catalog.length > 0) ? catalog : getDynamicCatalog();
  const rawBlock = parts[optNum];
  const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);

  let title = `OpciÃ³n ${optNum}`;
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

    if (line.startsWith('â€¢') || line.startsWith('* ') || line.startsWith('- ')) {
      const clean = line.replace(/^[â€¢*\-\s]+/, '').trim();
      if (/total|complemento|opcional|respondÃ©|cÃ³mo seguimos/i.test(clean)) continue;
      
      let formatted = clean;
      const priceParens = clean.match(/\(\s*\$([\d.,]+)\s*\)/);
      if (priceParens) {
        formatted = clean.replace(/\s*\(\s*\$([\d.,]+)\s*\)/, (m, p1) => ` â€” $${p1}`);
      } else if (!/(?:â€”|-|:)\s*\$?[\d.,]+/i.test(clean)) {
        const prod = matchBestProduct(clean, catList);
        if (prod) {
          const parsed = parseQuantityAndMode(clean, prod);
          const sub = Math.round((prod.price || 0) * (parsed.quantity || 1));
          formatted = `${clean} â€” $${sub.toLocaleString('es-AR')}`;
        }
      }
      items.push(`â€¢ ${formatted}`);
    }
  }

  if (total === 0 && items.length > 0) {
    for (const itm of items) {
      const pMatch = itm.match(/â€”\s*\$([\d.,]+)/);
      if (pMatch) {
        total += parseInt(pMatch[1].replace(/\D/g, ''), 10);
      }
    }
  }

  return { title, items, total };
}

/**
 * Detecta si la consulta del cliente menciona un corte de carne genÃ©rico o ambiguo
 * con 2 o mÃ¡s opciones disponibles en el catÃ¡logo activo (ej: "cuadril", "matambre", "chorizo", "milanesas", "costilla")
 * y retorna la lista de opciones para que el agente consulte y aclare antes de asumir un corte errÃ³neo.
 */
export function findAmbiguousProducts(chunk, dynamicCatalog = null) {
  const c = (chunk || '').toLowerCase().trim();
  if (!c) return null;

  // Si el texto contiene mÃºltiples productos o especificaciÃ³n clara de pedido con cantidades, no interrumpir con desambiguaciÃ³n genÃ©rica
  const hasMultipleProductsOrQuantities = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?|chorizos?|morcillas?))/i.test(c) && /(?:y\b|con\b|adem[aÃ¡]s|m[aÃ¡]s|,)/i.test(c);
  if (hasMultipleProductsOrQuantities) return null;

  const rawList = (dynamicCatalog && dynamicCatalog.length > 0) ? dynamicCatalog : getDynamicCatalog();

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
      exactRegex: /\b(?:chorizo.*(?:cerdo|cero|criollo|puro|colorado|cheddar|gourmet|dubai)|bife de chorizo)\b/i,
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
        if (n.includes('entraÃ±a')) return false;
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
 * Encuentra el producto que mejor encaja en un texto buscando coincidencia por PLU, cÃ³digo, nÃºmero de opciÃ³n o palabras clave
 * garantizando que NUNCA se seleccionen productos con precio $0, snacks o artÃ­culos de verdulerÃ­a por error.
 */
export function matchBestProduct(chunk, dynamicCatalog = null) {
  const c = (chunk || '').toLowerCase().trim();
  if (!c) return null;

  const rawList = (dynamicCatalog && dynamicCatalog.length > 0) ? dynamicCatalog : getDynamicCatalog();

  // 1. Filtrar solo productos vÃ¡lidos para venta por WhatsApp (precio > 0, disponibles y carnicerÃ­a)
  const isExplicitSnackMention = /papas?\s+pehuamar|pehuamar|lays|doritos|3d queso|tryms|chizitos|saladix/i.test(c);
  const isExplicitVerduraMention = /acelga|achicoria|lechuga|tomate|rucula|espinaca/i.test(c);

  const eligibleCatalog = rawList.filter(p => {
    const price = Number(p.price) || 0;
    if (price <= 0 || price === 1) return false;
    if (p.isAvailable === false) return false;

    const cat = p.category || '';
    if (cat === 'Snacks' && !isExplicitSnackMention) return false;
    if (cat === 'VerdulerÃ­a y Frutas' && !isExplicitVerduraMention) return false;
    if (cat === 'General' && /bolsa|caja|rollo|seÃ±a|sea|tarjeta|carton/i.test(p.name)) return false;
    if (/pehuamar|lays|doritos|3d queso|tryms/i.test(p.name) && !isExplicitSnackMention) return false;

    return true;
  });

  // 2. Coincidencia directa por PLU ("PLU 4", "cÃ³digo 49", "#1")
  const pluMatch = c.match(/(?:plu|c[oÃ³]digo|cod\.?|corte)\s*#?\s*([0-9]{1,5})/i);
  if (pluMatch) {
    const requestedPlu = pluMatch[1];
    const foundByPlu = eligibleCatalog.find(p => p.plu && (String(p.plu).trim() === requestedPlu || parseInt(p.plu, 10) === parseInt(requestedPlu, 10)));
    const isDirectPluCommand = /^(?:plu|c[oÃ³]digo|cod\.?|corte)?\s*#?\s*[0-9]{1,5}\s*$/i.test(c) || /^(?:quiero|dame|pasame|precio\s+del?|el)\s+(?:plu|c[oÃ³]digo|cod\.?)\s*#?\s*[0-9]{1,5}$/i.test(c);
    if (foundByPlu && (isDirectPluCommand || c.includes(foundByPlu.name.toLowerCase()))) {
      return foundByPlu;
    }
  }

  // 3. Coincidencia por nÃºmero ordinal en menÃº ("opciÃ³n 1", "combo 2")
  const explicitProductNumMatch = c.match(/(?:combo|item|opci[oÃ³]n\s+de\s+corte|opci[oÃ³]n)\s+([1-9]|1[0-9]|20)/i);
  if (explicitProductNumMatch) {
    const idx = parseInt(explicitProductNumMatch[1], 10) - 1;
    const featured = getFeaturedWhatsAppOffers(eligibleCatalog);
    if (idx >= 0 && idx < featured.length) {
      return featured[idx];
    }
  }

  // 4. Scoring semÃ¡ntico de relevancia
  let bestMatch = null;
  let bestScore = 0;

  for (const prod of eligibleCatalog) {
    const pName = (prod.name || '').toLowerCase();
    const pCat = (prod.category || '').toLowerCase();
    let score = 0;

    const isComboAsadazoQuery = /(?:combo\s+asadazo|asadazo)/i.test(c);
    const isCarbonQuery = /(?:carb[oÃ³]n|bolsa\s+de\s+carb[oÃ³]n|le[Ã±n]a)/i.test(c);
    const isChorizoQuery = /(?:chorizo|chorizos|chori|choris)/i.test(c);
    const isCerdoQuery = /(?:cerdo|cero|puro cerdo)/i.test(c);
    const isMatambreQuery = /(?:matambre|matambrito)/i.test(c);
    const isVacioQuery = /(?:vacio|vacÃ­o)/i.test(c);
    const isCostillaQuery = /(?:asado de tira|costillar|tira novillito|costilla|costillas|\btira\b|\basado\b)/i.test(c) && !isComboAsadazoQuery;
    const isBifeChorizoQuery = /(?:bife de chorizo|bife chorizo|bifes)/i.test(c);
    const isTapaCuadrilQuery = /(?:tapa de cuadril|tapa cuadril|picanha)/i.test(c);
    const isEntranaQuery = /(?:entraÃ±a|entrana)/i.test(c);

    // CarbÃ³n
    if (isCarbonQuery) {
      if (pName.includes('carbÃ³n') || pName.includes('carbon') || prod.id === 'prod_carbon') {
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

    // VacÃ­o
    if (isVacioQuery && (pName.includes('vacio') || pName.includes('vacÃ­o'))) {
      score += 400;
    }

    // Costillar / Asado de Tira Novillito
    if (isCostillaQuery) {
      if (pName.includes('asado de tira') || pName.includes('costillar / asado de tira') || pName.includes('costillar') || (pName.includes('costilla') && !pName.includes('entraÃ±a'))) {
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

    // EntraÃ±a
    if (isEntranaQuery && (pName.includes('entraÃ±a') || pName.includes('entrana'))) {
      score += 450;
    }

    // Exact & base string containment
    const cleanPName = pName.replace(/\(.*?\)/g, '').replace(/[â€œâ€"']/g, '').trim();
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

    // Bonus por categorÃ­as cÃ¡rnicas prioritarias (solo si ya tuvo coincidencia positiva)
    if (score > 0 && ['parrilla y vacuno', 'cerdo', 'achuras y embutidos', 'elaborados y milanesas', 'pollo', 'combos y promociones'].includes(pCat)) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = prod;
    }
  }

  // Ya no hay fallback a catÃ¡logo hardcodeado â€” db.getProducts() es la fuente Ãºnica de verdad

  return bestMatch;
}

/**
 * Busca productos en el catÃ¡logo maestro por tÃ©rmino o palabra clave
 */
export function searchCatalogProducts(query, catalog = null, limit = 8) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];

  const list = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || []);
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
 * Encuentra productos sustitutos o similares recomendados cuando un corte no estÃ¡ disponible o no existe en catÃ¡logo
 */
export function findSimilarProductOrAlternative(requestedText, catalog = null) {
  const currentCatalog = (Array.isArray(catalog) && catalog.length > 0) ? catalog : (db.getProducts() || []);
  const availableList = currentCatalog.filter(p => p.isAvailable !== false && Number(p.price) > 0);
  const t = (requestedText || '').toLowerCase().trim();

  // Mapeo experto de cortes cÃ¡rnicos similares / sustitutos ideales
  const SIMILARITY_RULES = [
    { pattern: /\b(?:lomo|bife de lomo|solomillo|filet mignon|filet)\b/i, targetKeywords: ['bife de chorizo', 'tapa de cuadril', 'colita de cuadril'] },
    { pattern: /\b(?:ojo de bife|bife ancho|t-bone|tbone|ribeye|tomahawk|bife angosto)\b/i, targetKeywords: ['bife de chorizo', 'costillar', 'asado de tira'] },
    { pattern: /\b(?:picanha|picaÃ±a|colita de cuadril|colita)\b/i, targetKeywords: ['tapa de cuadril', 'bife de chorizo'] },
    { pattern: /\b(?:tapa de asado|falda|asado con cuero|pecho|marucha)\b/i, targetKeywords: ['costillar', 'asado de tira', 'vacio'] },
    { pattern: /\b(?:entraÃ±a|entrana)\b/i, targetKeywords: ['vacio', 'matambrito de cerdo', 'bife de chorizo'] },
    { pattern: /\b(?:matambre vacuno|matambre de vaca)\b/i, targetKeywords: ['matambrito de cerdo', 'vacio'] },
    { pattern: /\b(?:matambre de cerdo|matambrito)\b/i, targetKeywords: ['matambre vacuno', 'bondiola de cerdo', 'costeletas de cerdo'] },
    { pattern: /\b(?:bondiola|carre|pechito de cerdo)\b/i, targetKeywords: ['matambrito de cerdo', 'costeletas de cerdo'] },
    { pattern: /\b(?:osobuco|garrÃ³n|peceto|roast beef|palomita|paleta)\b/i, targetKeywords: ['carne molida', 'matambre vacuno', 'tapa de cuadril'] },
    { pattern: /\b(?:suprema|pechuga|milanesas de pollo)\b/i, targetKeywords: ['milanesas de ternera', 'pata muslo'] },
    { pattern: /\b(?:molleja|chinchulin|riÃ±on|chinchulines|chunchullo)\b/i, targetKeywords: ['chorizo criollo', 'morcilla bombÃ³n', 'matambrito de cerdo'] },
    { pattern: /\b(?:morcilla|chori)\b/i, targetKeywords: ['chorizo criollo', 'morcilla bombÃ³n'] }
  ];

  for (const rule of SIMILARITY_RULES) {
    if (rule.pattern.test(t)) {
      for (const kw of rule.targetKeywords) {
        const found = availableList.find(p => p.name.toLowerCase().includes(kw));
        if (found) return found;
      }
    }
  }

  // Si existe en catÃ¡logo un producto con ese nombre pero no disponible o sin stock
  const unavailableMatch = currentCatalog.find(p => 
    (p.isAvailable === false || Number(p.stock) === 0) &&
    (p.name.toLowerCase().includes(t) || t.includes(p.name.toLowerCase()))
  );

  if (unavailableMatch) {
    const sameCategory = availableList.filter(p => p.category === unavailableMatch.category && p.id !== unavailableMatch.id);
    if (sameCategory.length > 0) return sameCategory[0];
  }

  // BÃºsqueda por palabras coincidentes
  for (const p of availableList) {
    const words = p.name.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length >= 4 && t.includes(w)) {
        return p;
      }
    }
  }

  return availableList[0] || null;
}

/**
 * Limpia y divide un mensaje con mÃºltiples productos de forma inteligente,
 * corrigiendo errores tipogrÃ¡ficos comunes y separando lÃ­mites numÃ©ricos.
 */
export function cleanAndSplitMultiProductMessage(text) {
  if (!text || typeof text !== 'string') return [];
  let s = text.trim();
  
  // Normalizar errores tipogrÃ¡ficos frecuentes
  s = s.replace(/\bchorizos?\s+de\s+cero\b/gi, 'chorizos de cerdo')
       .replace(/\bperonas\b/gi, 'personas')
       .replace(/\b(costillas?|tira\s+de\s+asado)\b/gi, 'costillar')
       .replace(/\bcarb[oÃ³]n\b/gi, 'carbÃ³n');

  // Insertar separador cuando un nuevo nÃºmero/cantidad comienza despuÃ©s de palabras de producto
  // Ej: "2 kilos de costillas 1 kilo de matambre" -> "2 kilos de costillas , 1 kilo de matambre"
  s = s.replace(/([a-zÃ¡Ã©Ã­Ã³ÃºÃ±]+)\s+(\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?))/gi, '$1 , $2');

  // Separar cuando aparece un nÃºmero solo seguido de nombre de corte comÃºn
  s = s.replace(/([a-zÃ¡Ã©Ã­Ã³ÃºÃ±]+)\s+(\d+)\s+(costillar|costillas?|vacio|vacÃ­o|matambre|matambrito|chorizo|chori|morcilla|milanesa|carbÃ³n|carbon|vino)/gi, '$1 , $2 $3');

  // Separar por conectores ("y", ",", ".", "con", "mÃ¡s", "mas", "ademÃ¡s", "ademas", saltos de lÃ­nea)
  const rawChunks = s.split(/\n+|(?:,\s*|\.\s+)(?![0-9])|\s+y\s+|\s+con\s+|\s+m[aÃ¡]s\s+|\s+mas\s+|\s+adem[aÃ¡]s\s+|\s+ademas\s+/i);

  const finalChunks = [];
  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed.length < 2) continue;
    finalChunks.push(trimmed);
  }

  return finalChunks;
}

/**
 * Encuentra todos los productos del catÃ¡logo mencionados en un texto
 */
export function findAllMentionedProducts(text, catalog = null) {
  if (!text || typeof text !== 'string') return [];
  const list = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || []);
  const found = [];

  const chunks = cleanAndSplitMultiProductMessage(text);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.length < 2) continue;
    const match = matchBestProduct(trimmed, list);
    if (match && !found.some(f => f.id === match.id || f.name === match.name)) {
      found.push(match);
    }
  }

  // Si por chunks no encontrÃ³ o encontrÃ³ pocos, probar con matchBestProduct directo
  if (found.length === 0) {
    const directMatch = matchBestProduct(text, list);
    if (directMatch) found.push(directMatch);
  }

  return found;
}

/**
 * Genera la consulta interactiva de cantidad (peso en kg vs unidades/bifes) segÃºn el tipo de producto solicitado
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
      return `Â¡Espectacular elecciÃ³n ${clientName}! â­ Te preparo *${name}*${pluTag} (${priceFormatted}).\n\n` +
        `ðŸ‘‰ *Â¿QuÃ© cantidad de combos te gustarÃ­a encargar?*\n` +
        `â€¢ PodÃ©s indicarme la cantidad de combos (ej: *1 combo*, *2 combos*).\n\n` +
        `Â¡Apenas me confirmes la cantidad te lo dejo registrado al instante! ðŸ™Œ [[STAGE:proposal]]`;
    }

    // 2. AlmacÃ©n / CarbÃ³n / Vinos / Bebidas / Complementos
    if (u === 'bolsa' || u === 'botella' || u === 'paquete' || /carbÃ³n|carbon|vino|bebida|salsa|chimichurri/i.test(name)) {
      const unitName = u === 'bolsa' ? 'bolsas' : (u === 'botella' ? 'botellas' : 'unidades');
      return `Â¡Genial ${clientName}! ðŸªµ Sumamos *${name}*${pluTag} (${priceFormatted} / ${u}).\n\n` +
        `ðŸ‘‰ *Â¿CuÃ¡ntas ${unitName} te gustarÃ­a que te agreguemos?* (ej: *1*, *2*, *3*).\n\n` +
        `Â¡Avisame la cantidad para sumarlo a tu pedido! ðŸ™Œ [[STAGE:proposal]]`;
    }

    // 3. Embutidos / Achuras / Hamburguesas / Milanesas / Pollo / Costeletas
    if (/chorizo|chori|morcilla|hamburguesa|milanesa|costeleta|pata muslo|achura|molleja|chinchul/i.test(name)) {
      return `Â¡De diez ${clientName}! ðŸŒ­ Tenemos *${name}*${pluTag} sÃºper fresco (${priceFormatted} / ${u}).\n\n` +
        `ðŸ‘‰ *Â¿QuÃ© cantidad te preparamos?*\n` +
        `â€¢ ðŸ”¢ **Por Unidades:** Â¿CuÃ¡ntas unidades precisÃ¡s? (ej: *4 unidades*, *6 chorizos*, *8 milanesas*)\n` +
        `â€¢ âš–ï¸ **Por Kilos:** Â¿O preferÃ­s por peso? (ej: *1 kg*, *1.5 kg*, *2 kg* o *medio kilo*)\n\n` +
        `Â¡Decime la cantidad que prefieras y te lo calculo al instante! ðŸ™Œ [[STAGE:proposal]]`;
    }

    // 4. Carnes y cortes tradicionales (VacÃ­o, Asado, Costillar, Bife, Matambre, EntraÃ±a, Tapa, Lomo, etc.)
    return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥© Te preparo *${name}*${pluTag} (${priceFormatted} / ${u}).\n\n` +
      `ðŸ‘‰ *Â¿QuÃ© cantidad te gustarÃ­a que te separemos?*\n` +
      `â€¢ âš–ï¸ **Por Peso en Kilos:** Â¿CuÃ¡ntos kilos o gramos? (ej: *1 kg*, *1.5 kg*, *2 kg* o *medio kilo*)\n` +
      `â€¢ ðŸ¥© **Por Unidades / Bifes / Porciones:** Â¿CuÃ¡ntos bifes o comensales? (ej: *4 bifes*, *6 tiras*, *para 4 personas*)\n\n` +
      `Â¡Apenas me indiques la cantidad te lo dejo registrado al instante! ðŸ™Œ [[STAGE:proposal]]`;
  }

  // Si el cliente nombrÃ³ 2 o mÃ¡s productos sin cantidad (ej: "vacio y chorizos", "asado, matambre y carbon")
  const productQuestions = prods.map(p => {
    const u = (p.unit || 'kg').toLowerCase();
    const priceFormatted = `$${Number(p.price || 0).toLocaleString('es-AR')}`;
    if (/chorizo|chori|morcilla|hamburguesa|milanesa/i.test(p.name)) {
      return `â€¢ ðŸŒ­ *${p.name}* (${priceFormatted}/${u}) âž” Â¿CuÃ¡ntas **unidades** (ej: *6 unidades*) o **kilos** (ej: *1 kg*)?`;
    }
    if (/carbÃ³n|carbon|vino|bebida/i.test(p.name)) {
      return `â€¢ ðŸªµ *${p.name}* (${priceFormatted}) âž” Â¿CuÃ¡ntas **bolsas / botellas**? (ej: *1*, *2*)`;
    }
    if (/combo/i.test(p.name)) {
      return `â€¢ â­ *${p.name}* (${priceFormatted}) âž” Â¿CuÃ¡ntos **combos**? (ej: *1 combo*)`;
    }
    return `â€¢ ðŸ¥© *${p.name}* (${priceFormatted}/${u}) âž” Â¿CuÃ¡ntos **kilos** (ej: *1.5 kg*, *2 kg*) o **bifes / porciones** (ej: *4 bifes*)?`;
  }).join('\n');

  return `Â¡Excelente selecciÃ³n ${clientName}! ðŸ¥© Te anoto los productos pedidos:\n\n` +
    `${productQuestions}\n\n` +
    `ðŸ‘‰ *Indicame las cantidades de cada uno* (ej: *2 kg de vacÃ­o y 6 chorizos*) y te armo el pedido con el total exacto. ðŸ™Œ [[STAGE:proposal]]`;
}

/**
 * Obtiene cortes y productos filtrados por categorÃ­a para venta en WhatsApp
 */
export function getCatalogByCategory(categoryQuery, catalog = null, limit = 8) {
  const cq = (categoryQuery || '').toLowerCase().trim();
  const rawList = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || []);
  
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
 * Encuentra el Ãºltimo producto del catÃ¡logo mencionado en el historial de mensajes
 */
function findLastMentionedProduct(history) {
  if (!history || !Array.isArray(history) || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const content = msg.content || '';
    const chunks = content.split(/[\n,\.]+|\s+y\s+|\s+con\s+|\s+mÃ¡s\s+|\s+mas\s+/i);
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
  const rawS = (str || '').toLowerCase();
  // Limpiar precios y notas explicativas entre parÃ©ntesis (ej: "(~0.75 kg - $3.750)", "($17.250)")
  const s = rawS.replace(/\([^\)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  
  // DetecciÃ³n explÃ­cita de kilos vs unidades
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

  // Verificar si el nÃºmero en el texto es en realidad una referencia a opciÃ³n de menÃº (ej: "el combo 2", "combo 2", "opcion 3", "el corte 4", "el 8", "la 1")
  const isMenuOptionRef = /(?:el\s+combo|la\s+opci[oÃ³]n|el\s+corte|la\s+promo|combo|opci[oÃ³]n|corte|promo|el|la)\s+([1-9]|1[0-9]|20)\b/i.test(s) &&
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

  // Si se pidiÃ³ por unidades y el producto se calcula por kg (ej: chorizos, morcillas)
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
  const isBolsa = (prod?.unit || '').toLowerCase() === 'bolsa' || /bolsa|carb[oÃ³]n/i.test(prod?.name || '');
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
export function isGarbageName(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.toLowerCase().trim();
  if (n.length < 3 || n.length > 40) return true;
  if (/[0-9]/.test(n)) return true;
  const blacklist = /domicilio|casa|repartidor|efectivo|transferencia|combo|asadazo|envio|pedido|asado|hola|gracias|confirmar|ok|quiero|tal cual|eso asi|contacto|desconocido|cliente|recuerda|funes|locelso|duarte|quiros|urca|cocinar|familia|somos|para|kilo|kg|opcion|opciÃ³n/i;
  return blacklist.test(n);
}

/**
 * Validador de direcciones reales vs intenciones genÃ©ricas
 */
export function isGarbageAddress(addr) {
  if (!addr || typeof addr !== 'string') return true;
  const a = addr.toLowerCase().trim();
  if (a.length < 4) return true;

  // Frases conversacionales, intenciones de comida, recetas o charlas cotidianas
  if (/(?:quisiera|quiero\s+cocinar|cocinar|hacer\s+algo|comer|receta|plato|comida|familia|somos\s+\d+|comemos|personas|amigos|invitados|asado|asadito|parrilla|fuego|bife|milanesa|guiso|carne|kilo|kilos|kg|precio|cuanto|cuÃ¡nto|horario|hola|buenas|gracias|chau|opcion|opciÃ³n|combo|promo|abierto|delivery|envio|envÃ­o|solo|nada\s+mas)\b/i.test(a)) {
    // Solo permitir si explÃ­citamente tiene prefijo formal de calle/altura como 'calle', 'av', 'barrio' con nÃºmero de calle
    const hasExplicitStreetPrefix = /(?:calle|av\b|av\.|avenida|bv\b|bv\.|bulevar|barrio|piso|dpto|departamento|timbre|nro|nÂ°|funes|locelso|pidal|alamos|alcorta|luchesse|quiros|colon|urca|cerro)\b/i.test(a);
    if (!hasExplicitStreetPrefix || !/[0-9]{2,5}/.test(a)) {
      return true;
    }
  }

  // Si no contiene nÃºmero de calle (altura) ni calles reconocidas de CÃ³rdoba
  if (!/[0-9]{1,5}/.test(a) && !/funes|locelso|pidal|quiros|alamos|alcorta|colon|cerro|urca|tejeda/i.test(a)) {
    return true;
  }

  // Si es solo una palabra o texto genÃ©rico
  if (/^(?:mi domicilio|mi casa|a mi domicilio|domicilio|ok quiero|para envio|para envÃ­o|en mi casa|a casa|para casa)$/i.test(a)) {
    return true;
  }

  return false;
}

/**
 * Extrae y aÃ­sla con precisiÃ³n exclusivamente la direcciÃ³n real (Calle, NÃºmero, Piso, Barrio)
 * descartando introducciones conversacionales, saludos, nombres y frases accesorias.
 */
export function extractCleanAddress(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  if (isGarbageAddress(rawText)) return '';

  let a = rawText.trim();

  // 0. Extraer segmento especÃ­fico si viene introducido en medio del texto conversacional
  const midMatch = a.match(/(?:(?:y\s+)?(?:la\s+direcci[oÃ³]n|mi\s+direcci[oÃ³]n|mi\s+domicilio|la\s+dir|mi\s+dir)(?:\s+(?:de\s+entrega|de\s+env[iÃ­]o|para\s+el\s+env[iÃ­]o))?\s*(?:es|ser[iÃ­]a)?\s*[:=;\-â€“â€”]?|direcci[oÃ³]n\s*[:=]|domicilio\s*[:=]|vivo\s+en|estoy\s+en|mand[aÃ¡]melo\s+a|mandamelo\s+a|envi[aÃ¡]melo\s+a|enviamelo\s+a|mandalo\s+a|mandar\s+a|enviar\s+a|envialo\s+a|mandame\s+a|enviame\s+a|entregar\s+en|para\s+el\s+env[iÃ­]o\s+a|para\s+el\s+envio\s+a|para\s+el\s+repartidor\s+a)\s*[:=;\-â€“â€”]?\s*(.+)$/i);
  if (midMatch && midMatch[1]) {
    a = midMatch[1].trim();
  }

  // 1. Quitar saludos iniciales y menciones de Carlos
  a = a.replace(/^(?:hola,?\s*)?(?:buen(?:os)?\s*d[iÃ­]as?|buenas\s*tardes|buenas\s*noches|buenas|carlos)?\s*[,:;-]?\s*/gi, '');

  // 2. Quitar frases conversacionales introductorias completas de direcciÃ³n
  a = a.replace(/^(?:te\s+paso|te\s+dejo|te\s+mando|te\s+envio|te\s+envÃ­o|anot[aÃ¡]|anotame|guard[aÃ¡]|registra|registrame|cambia|cambiame|modifica|modificame|actualiza|actualizame)?\s*(?:mi|la)?\s*(?:nueva\s*)?(?:direcci[oÃ³]n|domicilio|dir)\s*(?:de\s+entrega|de\s+env[iÃ­]o|para\s+el\s+env[iÃ­]o|para\s+el\s+repartidor)?\s*(?:es|ser[iÃ­]a)?\s*[:=;\-â€“â€”]?\s*/gi, '');

  a = a.replace(/^(?:la\s+direcci[oÃ³]n\s+(?:de\s+entrega\s+)?es|mi\s+direcci[oÃ³]n\s+(?:de\s+entrega\s+)?es|mi\s+domicilio\s+es|vivo\s+en|estoy\s+en|mand[aÃ¡]melo\s+a|mandamelo\s+a|envi[aÃ¡]melo\s+a|enviamelo\s+a|mandalo\s+a|mandar\s+a|enviar\s+a|envialo\s+a|mandame\s+a|enviame\s+a|entregar\s+en|para\s+el\s+env[iÃ­]o\s+a|para\s+el\s+envio\s+a|para\s+el\s+repartidor\s+a)\s*[:=;\-â€“â€”]?\s*/gi, '');

  a = a.replace(/^(?:ser[iÃ­]a\s+en|ser[iÃ­]a\s+a|seria\s+en|es\s+en|es\s+a|a\s+la\s+calle|calle)\s*[:=;\-â€“â€”]?\s*/gi, '');

  // 3. Quitar menciones de combos o pedidos al inicio
  a = a.replace(/^(?:quiero|mandame|enviame|traeme|armame)?\s*(?:un\s*)?(?:combo\s*)?(?:asadazo\s*)?(?:para|\ba\b)?\s*/gi, '');
  a = a.replace(/^(?:a\s+mi\s+domicilio|al\s+domicilio|para\s+env[iÃ­]o|para\s+envio),?\s*/gi, '');

  // 4. Quitar datos del cliente o notas de pago que vengan al final
  a = a.replace(/[,.]?\s*(?:a\s+nombre\s+de|nombre:?|soy|para)\s+[A-Za-zÃÃ‰ÃÃ“ÃšÃ¡Ã©Ã­Ã³ÃºÃ±Ã‘\s]+$/gi, '');
  a = a.replace(/[,.]?\s*(?:abono|pago|pagar|abonar)\s+(?:con|en|por)\s+.*$/gi, '');
  a = a.replace(/[,.]?\s*(?:en\s+efectivo|al\s+repartidor|por\s+transferencia|con\s+mp|con\s+tarjeta).*$/gi, '');
  a = a.replace(/[,.]?\s*(?:por\s+favor|gracias|muchas\s+gracias|joya|de\s+diez|avisame|ok).*$/gi, '');

  // 5. Limpieza de puntuaciÃ³n y espacios iniciales y finales
  a = a.replace(/^[:=;\-\s,â€“â€”!]+/, '').replace(/[:=;\-\s,â€“â€”!]+$/, '').trim();

  // Si despuÃ©s de la limpieza quedÃ³ una direcciÃ³n vÃ¡lida
  if (a.length >= 4 && !isGarbageAddress(a)) {
    return a;
  }

  return '';
}

/**
 * Parsea y reconstruye productos estructurados a partir de strings formateados de items
 */
export function parseProductsFromItems(items, catalog = null) {
  const catList = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || []);
  const prods = [];
  if (!Array.isArray(items)) return prods;

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'string') continue;
    const cleanItem = rawItem.replace(/^(?:[â€¢*\-\s]+|(?:\d+\.\s*))/, '').trim();
    if (!cleanItem) continue;

    // 1. Unidades (ej: "4 Unidades de CHORIZO DE CERDO â€” $7.380" o "6 chorizos â€” $3.000")
    const unitMatch = cleanItem.match(/^(\d+(?:[\.,]\d+)?)\s+(?:Unidades\s+de\s+|unidades?\s+de\s+|un\s+de\s+|unidades?\s+|un\s+)?(.+?)\s+(?:â€”|-|:)\s+\$?([0-9\.]+)/i);
    if (unitMatch && /(?:Unidades|unidades|un\b)/i.test(cleanItem.slice(0, 20))) {
      const unitCount = parseFloat(unitMatch[1].replace(',', '.'));
      const name = unitMatch[2].trim();
      const subtotal = parseInt(unitMatch[3].replace(/\./g, ''), 10);
      const catProd = matchBestProduct(name, catList) || { name, price: Math.round(subtotal / (unitCount * 0.125)), unit: 'kg' };
      const unitsPerKg = catProd.unitsPerKg || 8;
      const quantity = unitCount / unitsPerKg;
      prods.push({
        id: catProd.id || `prod-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name: catProd.name || name,
        price: catProd.price || Math.round(subtotal / quantity),
        quantity,
        unit: catProd.unit || 'kg',
        isUnitMode: true,
        unitCount,
        subtotal
      });
      continue;
    }

    // 2. Kilos (ej: "1 kg VacÃ­o Especial Seleccionado â€” $11.500" o "1.5 kilos de asado â€” $15.000")
    const kgMatch = cleanItem.match(/^(\d+(?:[\.,]\d+)?)\s+(?:kg|kilos?|kilo)\s+(?:de\s+)?(.+?)\s+(?:â€”|-|:)\s+\$?([0-9\.]+)/i);
    if (kgMatch) {
      const quantity = parseFloat(kgMatch[1].replace(',', '.'));
      const name = kgMatch[2].trim();
      const subtotal = parseInt(kgMatch[3].replace(/\./g, ''), 10);
      const catProd = matchBestProduct(name, catList) || { name, price: Math.round(subtotal / quantity), unit: 'kg' };
      prods.push({
        id: catProd.id || `prod-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name: catProd.name || name,
        price: catProd.price || Math.round(subtotal / quantity),
        quantity,
        unit: 'kg',
        isUnitMode: false,
        unitCount: 0,
        subtotal
      });
      continue;
    }

    // 3. GenÃ©rico / Combos / Bolsas / Botellas (ej: "1 bolsa CarbÃ³n Quebracho Blanco (Bolsa Grande) â€” $2.200", "1 combo Asadazo â€” $39.999")
    const genericMatch = cleanItem.match(/^(\d+(?:[\.,]\d+)?)\s+(?:([a-zÃ¡Ã©Ã­Ã³ÃºÃ±]+)\s+)?(.+?)\s+(?:â€”|-|:)\s+\$?([0-9\.]+)/i);
    if (genericMatch) {
      const quantity = parseFloat(genericMatch[1].replace(',', '.'));
      const unit = (genericMatch[2] || 'unidad').trim();
      const name = genericMatch[3].trim();
      const subtotal = parseInt(genericMatch[4].replace(/\./g, ''), 10);
      const catProd = matchBestProduct(name, catList) || { name, price: Math.round(subtotal / quantity), unit };
      prods.push({
        id: catProd.id || `prod-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name: catProd.name || name,
        price: catProd.price || Math.round(subtotal / quantity),
        quantity,
        unit: catProd.unit || unit,
        isUnitMode: false,
        unitCount: 0,
        subtotal
      });
      continue;
    }

    // 4. Formato con precio entre parÃ©ntesis: (ej: "1 kg de VacÃ­o Especial Seleccionado ($11.500)")
    const parenMatch = cleanItem.match(/^(\d+(?:[\.,]\d+)?)\s*(?:(kg|kilos?|unidades?|bolsas?|combos?)\s+(?:de\s+)?)?(.+?)\s*\(\s*\$?([0-9\.]+)\s*\)/i);
    if (parenMatch) {
      const quantity = parseFloat(parenMatch[1].replace(',', '.'));
      const unit = (parenMatch[2] || 'kg').trim();
      const name = parenMatch[3].trim();
      const subtotal = parseInt(parenMatch[4].replace(/\./g, ''), 10);
      const catProd = matchBestProduct(name, catList) || { name, price: Math.round(subtotal / quantity), unit };
      prods.push({
        id: catProd.id || `prod-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name: catProd.name || name,
        price: catProd.price || Math.round(subtotal / quantity),
        quantity,
        unit: catProd.unit || unit,
        isUnitMode: /unidad/i.test(unit),
        unitCount: /unidad/i.test(unit) ? quantity : 0,
        subtotal
      });
      continue;
    }

    // 5. Formato sin precio explÃ­cito (ej: "1.5 kg de VacÃ­o Especial", "6 Chorizos Criollos", "1 Bolsa de CarbÃ³n")
    const catProd = matchBestProduct(cleanItem, catList);
    if (catProd) {
      const parsed = parseQuantityAndMode(cleanItem, catProd);
      const subtotal = Math.round((catProd.price || 0) * (parsed.quantity || 1));
      prods.push({
        id: catProd.id || `prod-${catProd.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: catProd.name,
        price: catProd.price || 0,
        quantity: parsed.quantity || 1,
        unit: catProd.unit || 'kg',
        isUnitMode: parsed.isUnitMode || false,
        unitCount: parsed.unitCount || 0,
        unitsPerKg: parsed.unitsPerKg || 1,
        subtotal
      });
    }
  }
  return prods;
}

/**
 * Modifica atÃ³micamente los cortes de un pedido existente preservando los cortes previos,
 * incrementando cantidades en caso de suma o quitando/reemplazando segÃºn la solicitud.
 */
export function applyItemModificationToOrder(existingOrder, rawText, catalog = null, lead = null) {
  const catList = (catalog && catalog.length > 0) ? catalog : (db.getProducts() || []);
  const currentProds = (existingOrder.products && existingOrder.products.length > 0)
    ? JSON.parse(JSON.stringify(existingOrder.products))
    : parseProductsFromItems(existingOrder.items || [], catList);

  const t = (rawText || '').toLowerCase().trim();
  const isAddition = /(?:agrega|agreg[aÃ¡]|agregar|agregame|agregale|suma|sum[aÃ¡]|sumar|sumale|sumame|ponele|pon[eÃ©]|sumar\s+\d+|mas\s+\d+|mÃ¡s\s+\d+|sumar\s+\d+\s+chorizo|mas\s+chorizo|mÃ¡s\s+chorizo|sumale\s+tambiÃ©n)/i.test(t);
  const isRemoval = /(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sac[aÃ¡](?:le|lo|me)?|quit[aÃ¡](?:le|lo|me)?|sin|elimin[aÃ¡](?:r|le|lo|me)?|borr[aÃ¡](?:r|le|lo|me)?|tach[aÃ¡](?:r|le|lo|me)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-zÃ±Ã¡Ã©Ã­Ã³Ãº\s]+)/i.test(t);

  // DetecciÃ³n exhaustiva de reemplazos
  let oldQuery = null;
  let newQuery = null;

  const replacePattern1 = t.match(/(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:cambi[aÃ¡](?:me|le|lo)?|reemplaz[aÃ¡](?:me|le|lo)?)\s+(?:por|poneme|quiero)\s+(.+)/i);
  const replacePattern2 = t.match(/(?:cambi[aÃ¡](?:me|le|lo)?|reemplaz[aÃ¡](?:me|le|lo)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:por|poneme|quiero)\s+(.+)/i);
  const replacePattern3 = t.match(/en\s+vez\s+de\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:poneme|quiero|dame|ponele|por)\s+(.+)/i);
  const replacePattern4 = t.match(/(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:quiero\s+que\s+sea|que\s+sea)\s+(?:de\s+)?(.+)/i);
  const replacePattern5 = t.match(/(?:cambialo|reemplazalo)\s+por\s+(.+)/i);

  if (replacePattern1 && replacePattern1[1].length > 1 && replacePattern1[2].length > 1 && !/^(?:cambia|cambiame)$/i.test(replacePattern1[1])) {
    oldQuery = replacePattern1[1].trim();
    newQuery = replacePattern1[2].trim();
  } else if (replacePattern2 && replacePattern2[1].length > 1 && replacePattern2[2].length > 1) {
    oldQuery = replacePattern2[1].trim();
    newQuery = replacePattern2[2].trim();
  } else if (replacePattern3 && replacePattern3[1].length > 1 && replacePattern3[2].length > 1) {
    oldQuery = replacePattern3[1].trim();
    newQuery = replacePattern3[2].trim();
  } else if (replacePattern4 && replacePattern4[1].length > 1 && replacePattern4[2].length > 1 && !/^(?:hola|si|no|quiero|el|la)$/i.test(replacePattern4[1])) {
    oldQuery = replacePattern4[1].trim();
    newQuery = replacePattern4[2].trim();
  } else if (replacePattern5 && replacePattern5[1].length > 1) {
    newQuery = replacePattern5[1].trim();
  }

  const isSameProductOrCut = (p1, p2) => {
    if (!p1 || !p2) return false;
    if (p1.id && p2.id && p1.id === p2.id) return true;
    if (p1.plu && p2.plu && p1.plu === p2.plu) return true;
    const n1 = (p1.name || '').toLowerCase().trim();
    const n2 = (p2.name || '').toLowerCase().trim();
    if (n1 === n2) return true;

    // Distinguir explÃ­citamente Bife de Chorizo de Chorizo criollo/embutido
    const isBife1 = /bife\s+de\s+chorizo/i.test(n1);
    const isBife2 = /bife\s+de\s+chorizo/i.test(n2);
    if (isBife1 !== isBife2) return false;

    // Distinguir Costillar de Costeletas
    const isCosteleta1 = /costeleta/i.test(n1);
    const isCosteleta2 = /costeleta/i.test(n2);
    if (isCosteleta1 !== isCosteleta2) return false;

    // Distinguir Bola de Lomo de Lomo
    const isBolaLomo1 = /bola\s+de\s+lomo/i.test(n1);
    const isBolaLomo2 = /bola\s+de\s+lomo/i.test(n2);
    if (isBolaLomo1 !== isBolaLomo2) return false;

    // Distinguir Matambrito de cerdo vs Matambre vacuno
    const isMatambreCerdo1 = /matambr(?:o|ito)?\s+de\s+cerdo/i.test(n1);
    const isMatambreCerdo2 = /matambr(?:o|ito)?\s+de\s+cerdo/i.test(n2);
    if (isMatambreCerdo1 !== isMatambreCerdo2) return false;

    if (n1.includes(n2) || n2.includes(n1)) return true;

    const cutFamilies = [
      /chorizo(?!\s*de\s*bife)/i,
      /morcill/i,
      /vac[iÃ­]o/i,
      /costillar|asado\s+de\s+tira/i,
      /costelet/i,
      /bife\s+de\s+chorizo/i,
      /matambre\s+vacuno/i,
      /matambrito\s+de\s+cerdo/i,
      /tapa\s+de\s+cuadril|picanha/i,
      /entra[Ã±n]a/i,
      /peceto/i,
      /nalga/i,
      /bola\s+de\s+lomo/i,
      /falda/i,
      /milanes/i,
      /carb[oÃ³]n/i,
      /vino/i
    ];
    for (const fam of cutFamilies) {
      if (fam.test(n1) && fam.test(n2)) return true;
    }
    return false;
  };

  if (newQuery) {
    // Caso Reemplazo especÃ­fico (preservando el resto de los productos intactos)
    let oldProd = null;
    let oldIdx = -1;

    if (oldQuery) {
      oldProd = matchBestProduct(oldQuery, currentProds.length > 0 ? currentProds : catList);
      if (oldProd) {
        oldIdx = currentProds.findIndex(p => isSameProductOrCut(p, oldProd));
      }
    } else {
      // Reemplazo sin especificar antiguo (reemplazar producto de categorÃ­a similar o primer corte)
      const targetNewProd = matchBestProduct(newQuery, catList);
      if (targetNewProd) {
        oldIdx = currentProds.findIndex(p => isSameProductOrCut(p, targetNewProd));
        if (oldIdx < 0 && currentProds.length > 0) oldIdx = 0;
        if (oldIdx >= 0) oldProd = currentProds[oldIdx];
      }
    }

    const extractedNew = extractItemsFromHistoryAndText([], newQuery, catList, lead);
    if (extractedNew.products.length > 0) {
      const newProdToAdd = extractedNew.products[0];

      // Si el cliente no indicÃ³ cantidad para el nuevo corte, heredar la cantidad del corte anterior
      const hasExplicitQtyInNewQuery = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?)|medio\s+kilo|1\/2\s*kg)/i.test(newQuery);
      if (oldProd && !hasExplicitQtyInNewQuery) {
        newProdToAdd.quantity = oldProd.quantity || 1;
        newProdToAdd.isUnitMode = Boolean(oldProd.isUnitMode);
        newProdToAdd.unitCount = oldProd.unitCount || 0;
        newProdToAdd.subtotal = Math.round((newProdToAdd.price || 0) * newProdToAdd.quantity);
      }

      if (oldIdx >= 0) {
        currentProds[oldIdx] = newProdToAdd;
      } else {
        currentProds.push(newProdToAdd);
      }
    }
  } else if (isAddition) {
    const extracted = extractItemsFromHistoryAndText([], rawText, catList, lead);
    for (const np of extracted.products) {
      const existing = currentProds.find(p => isSameProductOrCut(p, np));

      if (existing) {
        if (np.isUnitMode || existing.isUnitMode) {
          const prevUnitCount = existing.unitCount || Math.round((existing.quantity || 0) * (existing.unitsPerKg || 8));
          const newUnitCount = np.unitCount || Math.round((np.quantity || 0) * (np.unitsPerKg || 8));
          existing.isUnitMode = true;
          existing.unitCount = prevUnitCount + newUnitCount;
          existing.quantity = (existing.quantity || 0) + (np.quantity || 0);
          existing.subtotal = Math.round(existing.price * existing.quantity);
        } else {
          existing.quantity = (existing.quantity || 0) + (np.quantity || 0);
          existing.subtotal = Math.round(existing.price * existing.quantity);
        }
      } else {
        currentProds.push(np);
      }
    }
  } else if (isRemoval) {
    const removeQuery = t.replace(/(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sac[aÃ¡](?:le|lo|me)?|quit[aÃ¡](?:le|lo|me)?|sin|elimin[aÃ¡](?:r|le|lo|me)?|borr[aÃ¡](?:r|le|lo|me)?|tach[aÃ¡](?:r|le|lo|me)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?/i, '').trim();
    const cleanRemove = removeQuery.toLowerCase();
    let idx = currentProds.findIndex(p => {
      const pn = (p.name || '').toLowerCase();
      if (pn.includes(cleanRemove) || cleanRemove.includes(pn)) return true;
      if (/bife.*chorizo/i.test(cleanRemove) && /bife.*chorizo/i.test(pn)) return true;
      if (/costilla|costillar/i.test(cleanRemove) && /costilla|costillar/i.test(pn)) return true;
      if (/matambre.*cerdo|matambrito/i.test(cleanRemove) && /matambre.*cerdo|matambrito/i.test(pn)) return true;
      if (/matambre.*vaca|matambre.*vacuno/i.test(cleanRemove) && /matambre.*vaca|matambre.*vacuno/i.test(pn)) return true;
      if (/chorizo/i.test(cleanRemove) && !/bife/i.test(cleanRemove) && /chorizo/i.test(pn) && !/bife/i.test(pn)) return true;
      if (/carbon|carbÃ³n/i.test(cleanRemove) && /carbon|carbÃ³n/i.test(pn)) return true;
      return false;
    });

    if (idx < 0) {
      const prodToRemove = matchBestProduct(removeQuery, currentProds.length > 0 ? currentProds : catList);
      if (prodToRemove) {
        idx = currentProds.findIndex(p => isSameProductOrCut(p, prodToRemove));
      }
    }

    if (idx >= 0) {
      currentProds.splice(idx, 1);
    }
  } else {
    // Ajuste de producto existente o reemplazo especÃ­fico
    const extracted = extractItemsFromHistoryAndText([], rawText, catList, lead);
    if (extracted.products.length > 0 && currentProds.length > 0) {
      for (const np of extracted.products) {
        const existing = currentProds.find(p => isSameProductOrCut(p, np));
        if (existing) {
          existing.name = np.name;
          existing.price = np.price;
          existing.quantity = np.quantity;
          existing.unitCount = np.unitCount;
          existing.isUnitMode = np.isUnitMode;
          existing.subtotal = np.subtotal || Math.round(existing.price * np.quantity);
        } else {
          currentProds.push(np);
        }
      }
    } else if (extracted.products.length > 0) {
      return {
        items: extracted.items,
        products: extracted.products,
        total: extracted.total
      };
    }
  }

  // Reconstruir items y total
  const items = [];
  let total = 0;
  for (const prod of currentProds) {
    const sub = prod.subtotal || Math.round((prod.price || 0) * (prod.quantity || 1));
    if (prod.unit === 'kg' && prod.isUnitMode && prod.unitCount > 0) {
      items.push(`â€¢ ${prod.unitCount} Unidades de ${prod.name} â€” $${sub.toLocaleString('es-AR')}`);
    } else if (prod.unit !== 'kg') {
      const cleanProdName = prod.name.toLowerCase().startsWith(prod.unit.toLowerCase()) 
        ? prod.name 
        : `${prod.unit} ${prod.name}`;
      items.push(`â€¢ ${prod.quantity} ${cleanProdName} â€” $${sub.toLocaleString('es-AR')}`);
    } else {
      items.push(`â€¢ ${prod.quantity} kg ${prod.name} â€” $${sub.toLocaleString('es-AR')}`);
    }
    total += sub;
  }

  return { items, products: currentProds, total };
}

/**
 * Extrae los productos y cantidades definidos dentro de una opciÃ³n numerada del mensaje previo del bot
 */
export function extractOptionItemsFromAgentMessage(optionNum, agentMessage, catalog) {
  if (!agentMessage || !optionNum) return [];
  const lines = agentMessage.split('\n');
  const optEmoji = ['1ï¸âƒ£', '2ï¸âƒ£', '3ï¸âƒ£', '4ï¸âƒ£', '5ï¸âƒ£', '6ï¸âƒ£', '7ï¸âƒ£', '8ï¸âƒ£', '9ï¸âƒ£', 'ðŸ”Ÿ'][optionNum - 1] || `${optionNum}ï¸âƒ£`;
  const optHeaderRegex = new RegExp(`(?:${optEmoji}|\\b${optionNum}[\\.\\)\\:\\-]|\\bOpci[oÃ³]n\\s+${optionNum}\\b)`, 'i');
  
  let inOptionBlock = false;
  let optionLines = [];

  for (const line of lines) {
    const isHeaderOfThisOption = optHeaderRegex.test(line);
    const isHeaderOfOtherOption = /(?:[1-9]|1[0-9])ï¸âƒ£|\b(?:[1-9]|1[0-9])[\\.\\)\\:\\-]\s+\*|\bOpci[oÃ³]n\s+[1-9]\b/i.test(line) && !isHeaderOfThisOption;
    const isClosingOrTotal = /ðŸ’°|\bTotal:|\bSubtotal:|\bÂ¿Con cu[aÃ¡]l\b|\bÂ¿Por d[oÃ³]nde\b|\bÂ¿C[oÃ³]mo prefer[iÃ­]s\b/i.test(line);

    if (isHeaderOfThisOption) {
      inOptionBlock = true;
      optionLines.push(line);
      continue;
    }

    if (inOptionBlock) {
      if (isHeaderOfOtherOption || isClosingOrTotal) {
        break;
      }
      optionLines.push(line);
    }
  }

  const items = [];
  // 1. Extraer Ã­tems con viÃ±etas dentro del bloque de esta opciÃ³n
  for (const line of optionLines) {
    const cleanLine = line.replace(/^[â€¢\-\*\s]+/, '').trim();
    if (!cleanLine) continue;
    const prod = matchBestProduct(cleanLine, catalog);
    if (prod && !items.some(it => it.prod.id === prod.id || it.prod.name.toLowerCase() === prod.name.toLowerCase())) {
      const parsed = parseQuantityAndMode(cleanLine, prod);
      items.push({
        prod,
        quantity: parsed.quantity || 1,
        isUnitMode: parsed.isUnitMode,
        unitCount: parsed.unitCount || 0,
        unitsPerKg: parsed.unitsPerKg || 1,
        label: parsed.label || `${parsed.quantity || 1} ${prod.unit || 'kg'}`
      });
    }
  }

  // 2. Si no habÃ­a viÃ±etas internas pero el encabezado contenÃ­a un producto (ej: 1ï¸âƒ£ [PLU 4] Costillar...)
  if (items.length === 0 && optionLines.length > 0) {
    const headerLine = optionLines[0].replace(/^(?:[1-9]ï¸âƒ£|\b[1-9][\.\)\:\-]\s*|\bOpci[oÃ³]n\s+[1-9]\b)/i, '').trim();
    const prod = matchBestProduct(headerLine, catalog);
    if (prod) {
      const parsed = parseQuantityAndMode(headerLine, prod);
      items.push({
        prod,
        quantity: parsed.quantity || 1,
        isUnitMode: parsed.isUnitMode,
        unitCount: parsed.unitCount || 0,
        unitsPerKg: parsed.unitsPerKg || 1,
        label: parsed.label || `${parsed.quantity || 1} ${prod.unit || 'kg'}`
      });
    }
  }

  return items;
}

/**
 * Extrae con precisiÃ³n los cortes y cantidades pedidos a lo largo de la conversaciÃ³n actual, sin duplicar
 */
export function extractItemsFromHistoryAndText(history, text, products, lead = null) {
  const isCorrection = /corregi|corregÃ­|corrije|corrijÃ­|corregime|corrijeme|corregilo|corrijelo|arregla|arreglame|cambia|cambiame|modifica|modificame|solo quiero|quiero solo|un solo|una sola|no, solo|nada mas|en vez de|me equivoque|te equivocaste|te dije|te ped[iÃ­]|era solo|dije/i.test(text || '');
  const isAddition = /agrega|agregÃ¡|agregar|agregame|agregale|suma|sumÃ¡|sumar|sumale|sumame|sumar|ademas|ademÃ¡s|tambien|tambiÃ©n|sumale tambiÃ©n|mas los|mÃ¡s los|mas 1|mas 2|y los|y las|y 1|y 2/i.test(text || '');
  const isHardReset = /est[aÃ¡]\s+mal|no\s+es\s+eso|te\s+equivocaste|eso\s+no\s+es|nuevo ped|otro ped|(?:empezar|empecemos|arrancar|arranquemos|hacer|hacelo)\s+de\s+cero|empecemos de nuevo|arranquemos de nuevo|borra todo|borrÃ¡ todo|armar un nuevo|pedir otra cosa/i.test(text || '');

  const catalog = (products && products.length > 0) ? products : getDynamicCatalog();
  const historyArr = history || [];

  // Encontrar el inicio de la sesiÃ³n actual de pedido en el historial
  let lastBoundaryIdx = -1;
  let boundaryIsUserStart = false;
  for (let i = historyArr.length - 1; i >= 0; i--) {
    const m = historyArr[i];
    if (m.sender === 'bot' || m.sender === 'agent' || m.fromMe) {
      if (/(?:Ya generamos tu orden de compra|Hemos cancelado tu pedido|cancelado tu pedido|No registrÃ¡s ningÃºn pedido activo|Marcamos tu pedido .* como âœ… Entregado|Â¿Te gustarÃ­a armar otro pedido\?|disculpame la confusiÃ³n)/i.test(m.content || '')) {
        lastBoundaryIdx = i;
        boundaryIsUserStart = false;
        break;
      }
    } else if (m.sender === 'user') {
      if (/est[aÃ¡]\s+mal|no\s+es\s+eso|te\s+equivocaste|cancela.*ped|cancelar.*ped|nuevo ped|otro ped|(?:empezar|empecemos|arrancar|arranquemos|hacer|hacelo)\s+de\s+cero|pedir otra cosa/i.test(m.content || '')) {
        lastBoundaryIdx = i;
        boundaryIsUserStart = true;
        break;
      }
    }
  }

  // Tomar solo mensajes pertenecientes a la sesiÃ³n activa
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
    const isPureConfirm = /^(s[iÃ­]|correcto|confirmar|confirmo|dale|est[aÃ¡] bien|perfecto|de diez|avanza|ok|ok dale|si dale|s[iÃ­] dale)$/i.test(cleanMsg);
    const isPureAddress = !isPureGreeting && !isPureConfirm && !/(?:kilo|kg|combo|asadazo|chori|morcilla|carne|corte|promo|costill|vacio|unidad|chorizo)/i.test(msg) && (/(?:calle|av\.|avenida|bv\.|funes|locelso|pidal|quiros|alamos|alcorta|luchesse)/i.test(msg) || /^[a-zA-Z\s]+\s+[0-9]{2,5}$/.test(msg));

    if (isPureGreeting || isPureConfirm || isPureAddress) {
      continue;
    }

    // Si el mensaje es un reinicio o cancelaciÃ³n de pedido anterior
    const isMsgReset = /est[aÃ¡]\s+mal|no\s+es\s+eso|te\s+equivocaste|nuevo ped|otro ped|(?:empezar|empecemos|arrancar|arranquemos|hacer|hacelo)\s+de\s+cero|empecemos de nuevo|arranquemos de nuevo|borra todo|borrÃ¡ todo|armar un nuevo|cancelar el pedido|cancela el pedido|pedir otra cosa/i.test(msg);
    if (isMsgReset) {
      activeItemsMap.clear();
      continue;
    }

    // DetecciÃ³n de aceptaciÃ³n de propuesta de sustituciÃ³n (bot ofreciÃ³ alternativa disponible ante corte no disponible)
    const isSubOfferInPrev = /no tenemos .* pero te podemos ofrecer|en su reemplazo\?/i.test(prevAgentMsg);
    if (isSubOfferInPrev) {
      const isAffirmativeSub = /^(?:s[iÃ­]|dale|bueno|perfecto|joya|de diez|si dale|dale si|si quiero|ese me sirve|quiero ese|si por favor|si claro|avanza|anotamelo|anÃ³tamelo|pasame ese|cambiame por ese|si ese|ese est[aÃ¡] bien|me sirve ese|dale pasame|si preparame|preparame ese)$/i.test(cleanMsg) ||
        /(?:si quiero|dale si|si dale|pasame ese|quiero ese|cambiame por ese|anotame ese|anÃ³tame ese|prepÃ¡rame ese|preparame ese|si dale, preparame|preparame \d+)/i.test(cleanMsg);
      const isNegativeSub = /^(?:no|no gracias|no dej[aÃ¡]|no deja|dejalo as[iÃ­]|no por ahora|paso|ninguno|no ese no|solo lo otro|dejame solo lo otro|no, solo lo otro)\b/i.test(cleanMsg);

      // Eliminar de activeItemsMap cualquier corte no disponible previo
      for (const [key] of activeItemsMap.entries()) {
        const lowerKey = key.toLowerCase();
        if (/lomo|ojo de bife|bife ancho|t-bone|picanha|colita de cuadril|osobuco|molleja/i.test(lowerKey)) {
          activeItemsMap.delete(key);
        }
      }

      const mentionedDifferentProd = matchBestProduct(cleanMsg, catalog);
      const offeredProd = matchBestProduct(prevAgentMsg, catalog);
      const isAcceptingOffered = !isNegativeSub && (isAffirmativeSub || (/^(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|tiras?)|medio\s+kilo|1\/2\s*kg)$/i.test(cleanMsg))) &&
        (!mentionedDifferentProd || (offeredProd && (mentionedDifferentProd.name === offeredProd.name || mentionedDifferentProd.id === offeredProd.id)));

      if (isAcceptingOffered && offeredProd) {
        let parsedQty = parseQuantityAndMode(cleanMsg, offeredProd);
        if ((!parsedQty.quantity || parsedQty.quantity === 1) && !/(?:\d|medio)/.test(cleanMsg)) {
          const prevUserMsg = msgIdx > 0 ? userMessagesWithContext[msgIdx - 1].content : '';
          const prevParsed = parseQuantityAndMode(prevUserMsg, offeredProd);
          if (prevParsed && prevParsed.quantity > 0) parsedQty = prevParsed;
        }

        for (const key of Array.from(activeItemsMap.keys())) {
          if (key !== offeredProd.name && (/bife de chorizo/i.test(key) && /bife de chorizo/i.test(offeredProd.name))) {
            activeItemsMap.delete(key);
          }
        }

        activeItemsMap.set(offeredProd.name, {
          prod: offeredProd,
          quantity: parsedQty.quantity || 1,
          isUnitMode: parsedQty.isUnitMode,
          unitCount: parsedQty.unitCount || 0,
          unitsPerKg: parsedQty.unitsPerKg || 1,
          label: parsedQty.label || `${parsedQty.quantity || 1} kg`
        });
        continue;
      }
    }

    // Si el mensaje es una consulta o pedido inicial de un corte fuera de catÃ¡logo / no disponible
    const isUnavailableInquiry = /^(?:hola|buenas|que tal|buen d[iÃ­]a)?\s*(?:ten[eÃ©]s|hay|tenes|tenÃ©s|vendes|vend[eÃ©]s)?\s*(?:\d+\s*(?:kg|kilos?)?\s+de\s+)?(?:lomo|ojo de bife|bife ancho|t-bone|picanha|colita de cuadril|osobuco|molleja)\??$/i.test(cleanMsg) ||
      (/(?:lomo|ojo de bife|bife ancho|t-bone|picanha|colita de cuadril|osobuco|molleja)/i.test(cleanMsg) && /(?:ten[eÃ©]s|vendes|vend[eÃ©]s|hay|cuanto|precio|sale|cuesta)\b/i.test(cleanMsg));
    if (isUnavailableInquiry) {
      continue;
    }

    // DetecciÃ³n de reemplazo de Ã­tems (ej: "cambiame el asado por 2 kg de vacÃ­o", "en vez de chorizos poneme morcillas")
    const isReplaceMatch = /(?:cambi[aÃ¡](?:me)?|en\s+vez\s+(?:de|del)?)\s+(.+?)\s+(?:por|poneme|quiero)\s+(.+)/i.exec(cleanMsg);
    if (isReplaceMatch) {
      const oldQuery = isReplaceMatch[1].trim().toLowerCase().replace(/^(?:el|la|los|las)\s+/, '').trim();
      const newQuery = isReplaceMatch[2].trim();
      const oldProd = matchBestProduct(oldQuery, catalog);
      
      for (const key of Array.from(activeItemsMap.keys())) {
        const lowerKey = key.toLowerCase();
        if (
          (oldProd && (key === oldProd.name || lowerKey.includes(oldProd.name.toLowerCase()) || oldProd.name.toLowerCase().includes(lowerKey))) ||
          lowerKey.includes(oldQuery) ||
          oldQuery.includes(lowerKey) ||
          (/matambre/i.test(oldQuery) && /matambre/i.test(lowerKey)) ||
          (/costilla|costillar|asado/i.test(oldQuery) && /costilla|costillar|asado/i.test(lowerKey)) ||
          (/chorizo/i.test(oldQuery) && !/bife/i.test(oldQuery) && /chorizo/i.test(lowerKey) && !/bife/i.test(lowerKey)) ||
          (/vacio|vacÃ­o/i.test(oldQuery) && /vacio|vacÃ­o/i.test(lowerKey)) ||
          (/carbon|carbÃ³n/i.test(oldQuery) && /carbon|carbÃ³n/i.test(lowerKey))
        ) {
          activeItemsMap.delete(key);
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

    // DetecciÃ³n de eliminaciÃ³n explÃ­cita de un Ã­tem (ej: "sacÃ¡ el carbÃ³n", "sin chorizos", "no quiero el bife de chorizo")
    const isRemoveMatch = /^(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sac[aÃ¡]|sacame|quit[aÃ¡]|quitame|sin\s+|elimin[aÃ¡]|borr[aÃ¡])\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-zÃ±Ã¡Ã©Ã­Ã³Ãº\s]+)$/i.exec(cleanMsg);
    if (isRemoveMatch && !/pedido|todo|nada/i.test(cleanMsg)) {
      const removeQuery = isRemoveMatch[1].trim();
      const cleanRemove = removeQuery.toLowerCase();
      for (const key of Array.from(activeItemsMap.keys())) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes(cleanRemove) || cleanRemove.includes(lowerKey) ||
            (/bife.*chorizo/i.test(cleanRemove) && /bife.*chorizo/i.test(lowerKey)) ||
            (/costilla|costillar/i.test(cleanRemove) && /costilla|costillar/i.test(lowerKey)) ||
            (/matambre.*cerdo|matambrito/i.test(cleanRemove) && /matambre.*cerdo|matambrito/i.test(lowerKey)) ||
            (/matambre.*vaca|matambre.*vacuno/i.test(cleanRemove) && /matambre.*vaca|matambre.*vacuno/i.test(lowerKey)) ||
            (/chorizo/i.test(cleanRemove) && !/bife/i.test(cleanRemove) && /chorizo/i.test(lowerKey) && !/bife/i.test(lowerKey)) ||
            (/carbon|carbÃ³n/i.test(cleanRemove) && /carbon|carbÃ³n/i.test(lowerKey))) {
          activeItemsMap.delete(key);
        }
      }
      continue;
    }

    // DetecciÃ³n de selecciÃ³n de opciones de Asado / MenÃº Recomendado / CatÃ¡logo numerado
    const optionSelectionMatch = /(?:quiero\s+|dame\s+|vamos\s+con\s+|me\s+gusta\s+|elijo\s+|pasame\s+|anotame\s+|preparame\s+)?(?:la\s+|el\s+)?opci[oÃ³]n\s*([1-9]|1[0-9]|20)\b|^(?:[1-9]|1[0-9]|20|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|7ï¸âƒ£|8ï¸âƒ£|9ï¸âƒ£|ðŸ”Ÿ|la\s+[1-9]|el\s+[1-9]|clasica|clÃ¡sica|combo|asadazo|gourmet)$/i.exec(cleanMsg);
    const isOptionsOfferedInPrev = /1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|\[PLU \d+\]|OFERTAS Y CORTES|cortes estrella|mejores promos|MirÃ¡ las opciones|Te armÃ© 3 opciones|Â¿Con cuÃ¡l opciÃ³n/i.test(prevAgentMsg);

    if (optionSelectionMatch && isOptionsOfferedInPrev) {
      let selectedOptionNum = 1;
      if (optionSelectionMatch[1]) {
        selectedOptionNum = parseInt(optionSelectionMatch[1], 10);
      } else if (/2|2ï¸âƒ£|combo|asadazo/i.test(cleanMsg)) {
        selectedOptionNum = 2;
      } else if (/3|3ï¸âƒ£|gourmet/i.test(cleanMsg)) {
        selectedOptionNum = 3;
      } else {
        const numMatch = cleanMsg.match(/([1-9]|1[0-9]|20)/);
        selectedOptionNum = numMatch ? parseInt(numMatch[0], 10) : 1;
      }

      const optionItems = extractOptionItemsFromAgentMessage(selectedOptionNum, prevAgentMsg, catalog);
      if (optionItems && optionItems.length > 0) {
        activeItemsMap.clear();
        for (const itm of optionItems) {
          activeItemsMap.set(itm.prod.name, itm);
        }

        // Â¿El mensaje tiene instrucciones adicionales de suma, resta o modificaciÃ³n combinada?
        // Ejemplo: "quiero la opcion 1 pero suma 2 chorizos de cerdo", "la 1 y sacale el carbon", "la 1 pero en vez de vacÃ­o poneme matambre"
        const hasExtraClause = /(?:pero\s+|y\s+|mas\s+|mÃ¡s\s+|con\s+|ademas\s+|ademÃ¡s\s+|sin\s+|en\s+vez|cambia)/i.test(cleanMsg);
        if (hasExtraClause) {
          // 1. DetecciÃ³n de reemplazo en la misma frase (ej: "en vez de vacio poneme 2 kg de matambre", "cambia el vacio por matambre")
          const replaceSubMatch = /(?:pero\s+|y\s+)?(?:en\s+vez\s+(?:de|del)?|cambia(?:me)?)\s+(.+?)\s+(?:por|poneme|quiero)\s+(.+)/i.exec(cleanMsg);
          if (replaceSubMatch) {
            const oldQ = replaceSubMatch[1].trim().toLowerCase().replace(/^(?:el|la|los|las)\s+/, '').trim();
            const newQ = replaceSubMatch[2].trim();
            const oldProd = matchBestProduct(oldQ, catalog);
            for (const key of Array.from(activeItemsMap.keys())) {
              const lowerKey = key.toLowerCase();
              if ((oldProd && (key === oldProd.name || lowerKey.includes(oldProd.name.toLowerCase()) || oldProd.name.toLowerCase().includes(lowerKey))) ||
                  lowerKey.includes(oldQ) || oldQ.includes(lowerKey) ||
                  (/vacio|vacÃ­o/i.test(oldQ) && /vacio|vacÃ­o/i.test(lowerKey)) ||
                  (/costilla|asado/i.test(oldQ) && /costilla|asado/i.test(lowerKey)) ||
                  (/chorizo/i.test(oldQ) && /chorizo/i.test(lowerKey)) ||
                  (/carbon|carbÃ³n/i.test(oldQ) && /carbon|carbÃ³n/i.test(lowerKey))) {
                activeItemsMap.delete(key);
              }
            }

            const newProd = matchBestProduct(newQ, catalog);
            if (newProd) {
              const parsedNew = parseQuantityAndMode(newQ, newProd);
              activeItemsMap.set(newProd.name, {
                prod: newProd,
                quantity: parsedNew.quantity,
                isUnitMode: parsedNew.isUnitMode,
                unitCount: parsedNew.unitCount || 0,
                unitsPerKg: parsedNew.unitsPerKg || 1,
                label: parsedNew.label
              });
            }
          }

          // 2. DetecciÃ³n de remociÃ³n adicional en la misma frase (ej: "pero sin carbÃ³n", "sacale los chorizos")
          const removeSubMatch = /(?:pero\s+|y\s+)?(?:sacale|sacame|sin|quitar|quita|quitale|quitame|no\s+le\s+pongas|no\s+quiero)\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-zÃ±Ã¡Ã©Ã­Ã³Ãº\s]+)/i.exec(cleanMsg);
          if (removeSubMatch) {
            const cutToRemove = removeSubMatch[1].trim().toLowerCase();
            for (const key of Array.from(activeItemsMap.keys())) {
              const lowerKey = key.toLowerCase();
              if (lowerKey.includes(cutToRemove) || cutToRemove.includes(lowerKey) ||
                  (/carbon|carbÃ³n/i.test(cutToRemove) && /carbon|carbÃ³n/i.test(lowerKey)) ||
                  (/chorizo/i.test(cutToRemove) && !/bife/i.test(cutToRemove) && /chorizo/i.test(lowerKey) && !/bife/i.test(lowerKey)) ||
                  (/vacio|vacÃ­o/i.test(cutToRemove) && /vacio|vacÃ­o/i.test(lowerKey))) {
                activeItemsMap.delete(key);
              }
            }
          }

          // 3. DetecciÃ³n de suma/adiciÃ³n en la misma frase (ej: "pero suma 2 chorizos de cerdo", "y agregale 1 bolsa de carbÃ³n")
          const addSubMatch = /(?:pero\s+|y\s+|con\s+|ademas\s+|ademÃ¡s\s+)?(?:suma|sumale|sumame|sumar|agrega|agregale|agregame|agregar|ponele|poneme|mas|mÃ¡s)\s+(.+)/i.exec(cleanMsg);
          if (addSubMatch) {
            const addQuery = addSubMatch[1].trim();
            const addedProd = matchBestProduct(addQuery, catalog);
            if (addedProd) {
              const parsedAdd = parseQuantityAndMode(addQuery, addedProd);
              if (activeItemsMap.has(addedProd.name)) {
                const existing = activeItemsMap.get(addedProd.name);
                if (existing.isUnitMode && parsedAdd.isUnitMode) {
                  existing.unitCount += (parsedAdd.unitCount || 0);
                  existing.quantity = existing.unitsPerKg ? Number((existing.unitCount / existing.unitsPerKg).toFixed(2)) : existing.unitCount;
                  existing.label = `${existing.unitCount} Unidades`;
                } else if (!existing.isUnitMode && !parsedAdd.isUnitMode) {
                  existing.quantity += parsedAdd.quantity;
                  existing.label = `${existing.quantity} kg`;
                } else {
                  existing.quantity += parsedAdd.quantity;
                }
              } else {
                activeItemsMap.set(addedProd.name, {
                  prod: addedProd,
                  quantity: parsedAdd.quantity,
                  isUnitMode: parsedAdd.isUnitMode,
                  unitCount: parsedAdd.unitCount || 0,
                  unitsPerKg: parsedAdd.unitsPerKg || 1,
                  label: parsedAdd.label
                });
              }
            }
          }
        }

        continue;
      }
    }

    // DetecciÃ³n de respuesta directa a consulta previa de cantidad de un producto
    const isQuantityPromptInPrev = /Â¿QuÃ© cantidad|Â¿CuÃ¡ntos kilos|Â¿CuÃ¡ntas unidades|Â¿QuÃ© cantidad de combos|Â¿CuÃ¡ntas bolsas|Â¿CuÃ¡ntas botellas|Â¿QuÃ© cantidad te preparamos|Por Unidades:.*Por Kilos/i.test(prevAgentMsg);
    if (isQuantityPromptInPrev) {
      const targetProd = matchBestProduct(prevAgentMsg, catalog);
      const mentionedDifferentProd = matchBestProduct(msg, catalog);
      const isAdditionOrDifferentCut = (mentionedDifferentProd && mentionedDifferentProd.name !== targetProd?.name) || (/agrega|agregÃ¡|suma|sumÃ¡|sumale|sumame|ponele|y\b|tambien|tambiÃ©n|mas\b/i.test(msg) && mentionedDifferentProd);

      if (targetProd && !isAdditionOrDifferentCut) {
        const parsed = parseQuantityAndMode(msg, targetProd);
        
        // Limpiar cualquier Ã­tem genÃ©rico similar antes de asentar
        for (const key of Array.from(activeItemsMap.keys())) {
          const lowerKey = key.toLowerCase();
          const lowerTarget = targetProd.name.toLowerCase();
          if (key !== targetProd.name) {
            if ((/chorizo|chori/i.test(lowerKey) && /chorizo|chori/i.test(lowerTarget)) ||
                (/vacio|vacÃ­o/i.test(lowerKey) && /vacio|vacÃ­o/i.test(lowerTarget)) ||
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
        // Si el cliente en vez de dar la cantidad del producto actual, pidiÃ³ SUMAR otro producto (ej: "agrega 6 chorizos")
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

    // DetecciÃ³n de selecciÃ³n por nÃºmero de catÃ¡logo o desambiguaciÃ³n (ej: "1", "2", "la 1", "opciÃ³n 1")
    const isSingleCatalogNumber = /^(?:[1-9]|1[0-9]|20|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|7ï¸âƒ£|8ï¸âƒ£|9ï¸âƒ£|ðŸ”Ÿ|la\s+[1-9]|el\s+[1-9]|opci[oÃ³]n\s+[1-9])$/i.test(cleanMsg);
    if (isSingleCatalogNumber && !isQuantityPromptInPrev) {
      const isCatalogOfferedInPrev = /1ï¸âƒ£.*(?:Combo|Tapa|VacÃ­o|Vacio|Costillar|Bife|EntraÃ±a|Matambrito|Matambre|Milanesa|Chorizo|Chori|Pata)|OFERTAS Y CORTES|cortes estrella|mejores promos|MirÃ¡ las opciones especiales|cortes y combos que estÃ¡n saliendo|En mostrador tenemos varias opciones|Â¿CuÃ¡l de estas opciones preferÃ­s/i.test(prevAgentMsg);
      const isNonCatalogPrompt = /Â¿CÃ³mo preferÃ­s abonar|1ï¸âƒ£.*Efectivo|FICHA DE REGISTRO|Â¿Confirmamos estos datos|Â¿CÃ³mo preferÃ­s recibir tu pedido|1ï¸âƒ£.*Env[iÃ­]o a Domicilio|1ï¸âƒ£.*Coordinar \*EnvÃ­o a Domicilio\*|ElegÃ­ la sucursal|1ï¸âƒ£.*Urca Central|Â¿PrecisÃ¡s algo de tu pedido\?|1ï¸âƒ£.*Consultar estado|Opciones rÃ¡pidas/i.test(prevAgentMsg);

      if (isCatalogOfferedInPrev && !isNonCatalogPrompt) {
        const numMatch = cleanMsg.match(/([1-9]|1[0-9]|20)/);
        const optIdx = numMatch ? (parseInt(numMatch[0], 10) - 1) : 0;
        
        // Extraer los productos que se le mostraron al usuario en el mensaje previo
        let displayedList = [];
        const lines = prevAgentMsg.split('\n');
        for (const line of lines) {
          if (/[1-9]ï¸âƒ£|\[\d+\]/.test(line)) {
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

          // Si no traÃ­a cantidad explÃ­cita en este mensaje, buscar si venÃ­a pidiendo una cantidad previa
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

          // Si el mensaje fue solo el nÃºmero de opciÃ³n sin cantidad y es el Ãºltimo mensaje, no fijar 1 kg prematuro
          const isLastUserMsg = msgIdx === userMessagesWithContext.length - 1;
          if (!hasExplicitQtyInMsg && isLastUserMsg) {
            continue;
          }

          // Si en activeItemsMap habÃ­a un producto genÃ©rico previo similar, reemplazarlo
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

    // Si el bot anterior ya tenÃ­a un resumen de pedido y el usuario estÃ¡ sumando productos o respondiendo a "sumar cortes"
    const isSumarCutsPrompt = /Â¿QuÃ© te gustarÃ­a modificar|Â¿QuÃ© otros cortes o complementos te gustarÃ­a sumar|Sumar mÃ¡s cortes o complementos|1ï¸âƒ£.*Cambiar o sumar cortes/i.test(prevAgentMsg);
    if (isSumarCutsPrompt && activeItemsMap.size === 0) {
      // Buscar el Ãºltimo resumen de pedido en el historial del bot
      for (let hIdx = relevantHistory.length - 1; hIdx >= 0; hIdx--) {
        const histMsg = relevantHistory[hIdx];
        if (histMsg.sender === 'bot' || histMsg.sender === 'agent' || histMsg.fromMe) {
          const histContent = histMsg.content || '';
          if (/Detalle de tu pedido|Detalle de cortes/i.test(histContent)) {
            const lines = histContent.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('â€¢') || line.trim().startsWith('*')) {
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

    const isMsgAbsoluteOverride = /te dije|te ped[iÃ­]|era solo|dije que|solo quiero|quiero solo|no entendes|no entendÃ©s|dije/i.test(msg);
    if (isMsgAbsoluteOverride) {
      activeItemsMap.clear();
    }

    const isMsgCorrection = /corregi|corregÃ­|corrije|corrijÃ­|corregime|corrijeme|solo quiero|quiero solo|un solo|una sola|no, solo|nada mas/i.test(msg);
    const chunks = cleanAndSplitMultiProductMessage(msg);

    for (const chunk of chunks) {
      if (!chunk || !chunk.trim()) continue;
      const isChunkRemoval = /(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sacale|sacame|saca|sacÃ¡|sin\s+|sin\s+el|sin\s+la|sin\s+los|sin\s+las|quitale|quitame|quita|quitÃ¡|elimina|eliminame|borra|borrame|cancela\s+el|cancela\s+la)/i.test(chunk);
      const isChunkReplacement = /cambia|cambiame|en vez de|reemplaza/i.test(chunk);
      const isChunkAddition = /agrega|agregÃ¡|suma|sumÃ¡|sumar|ponele|mÃ¡s|mas|y\b/i.test(chunk || '');
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
        const optionNumMatch = chunk.match(/(?:el\s+combo|la\s+opci[oÃ³]n|el\s+corte|la\s+promo|combo|opci[oÃ³]n|corte|promo|el|la)\s+([1-9]|1[0-9]|20)\b/i) ||
          chunk.trim().match(/^([1-9]|1[0-9]|20)$/);
        if (optionNumMatch) {
          const optIdx = parseInt(optionNumMatch[1], 10) - 1;
          let displayedList = [];
          const pLines = prevAgentMsg.split('\n');
          for (const pLine of pLines) {
            if (/[1-9]ï¸âƒ£|\[\d+\]/.test(pLine)) {
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
        if (chunk.includes(' en vez de ') || chunk.includes(' en vez del ') || chunk.includes('en vez de ') || chunk.includes('en vez del ')) {
          const parts = chunk.split(/\s*en\s+vez\s+(?:de|del)\s*/i);
          const newQuery = (parts[0] || '').trim();
          const oldQuery = (parts[1] || '').trim().toLowerCase().replace(/^(?:el|la|los|las)\s+/, '').trim();
          const newProd = matchBestProduct(newQuery, catalog);
          const oldProd = matchBestProduct(oldQuery, catalog);

          for (const key of Array.from(activeItemsMap.keys())) {
            const lowerKey = key.toLowerCase();
            if (
              (oldProd && (key === oldProd.name || lowerKey.includes(oldProd.name.toLowerCase()) || oldProd.name.toLowerCase().includes(lowerKey))) ||
              lowerKey.includes(oldQuery) ||
              oldQuery.includes(lowerKey) ||
              (/matambre/i.test(oldQuery) && /matambre/i.test(lowerKey)) ||
              (/costilla|costillar|asado/i.test(oldQuery) && /costilla|costillar|asado/i.test(lowerKey)) ||
              (/chorizo/i.test(oldQuery) && !/bife/i.test(oldQuery) && /chorizo/i.test(lowerKey) && !/bife/i.test(lowerKey)) ||
              (/vacio|vacÃ­o/i.test(oldQuery) && /vacio|vacÃ­o/i.test(lowerKey)) ||
              (/carbon|carbÃ³n/i.test(oldQuery) && /carbon|carbÃ³n/i.test(lowerKey))
            ) {
              activeItemsMap.delete(key);
            }
          }

          if (newProd) {
            const parsed = parseQuantityAndMode(newQuery, newProd);
            activeItemsMap.set(newProd.name, { prod: newProd, ...parsed });
          }
        } else {
          const porMatch = chunk.match(/(?:cambia(?:me)?|reemplaza(?:me)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+por\s+(.+)/i);
          if (porMatch) {
            const oldQuery = porMatch[1].trim().toLowerCase().replace(/^(?:el|la|los|las)\s+/, '').trim();
            const newQuery = porMatch[2].trim();
            const oldProd = matchBestProduct(oldQuery, catalog);
            const newProd = matchBestProduct(newQuery, catalog);

            for (const key of Array.from(activeItemsMap.keys())) {
              const lowerKey = key.toLowerCase();
              if (
                (oldProd && (key === oldProd.name || lowerKey.includes(oldProd.name.toLowerCase()) || oldProd.name.toLowerCase().includes(lowerKey))) ||
                lowerKey.includes(oldQuery) ||
                oldQuery.includes(lowerKey) ||
                (/matambre/i.test(oldQuery) && /matambre/i.test(lowerKey)) ||
                (/costilla|costillar|asado/i.test(oldQuery) && /costilla|costillar|asado/i.test(lowerKey)) ||
                (/chorizo/i.test(oldQuery) && !/bife/i.test(oldQuery) && /chorizo/i.test(lowerKey) && !/bife/i.test(lowerKey)) ||
                (/vacio|vacÃ­o/i.test(oldQuery) && /vacio|vacÃ­o/i.test(lowerKey)) ||
                (/carbon|carbÃ³n/i.test(oldQuery) && /carbon|carbÃ³n/i.test(lowerKey))
              ) {
                activeItemsMap.delete(key);
              }
            }

            if (newProd) {
              const parsed = parseQuantityAndMode(newQuery, newProd);
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

    // Detectar si el mensaje actual menciona algÃºn producto del catÃ¡logo
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

    // Solo modificar cantidad del Ãºnico Ã­tem si el mensaje es una orden de cambio de cantidad y NO menciona otro producto distinto
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
            if (cleanLine.startsWith('â€¢') || (cleanLine.startsWith('*') && !cleanLine.startsWith('**') && !cleanLine.startsWith('*FICHA') && !cleanLine.startsWith('*Destinatario') && !cleanLine.startsWith('*TelÃ©fono') && !cleanLine.startsWith('*DirecciÃ³n') && !cleanLine.startsWith('*Detalle') && !cleanLine.startsWith('*Total') && !cleanLine.startsWith('*Paso') && !cleanLine.startsWith('*Opciones'))) {
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
      items.push(`â€¢ ${unitCount} Unidades de ${prod.name} â€” $${sub.toLocaleString('es-AR')}`);
    } else if (prod.unit !== 'kg') {
      const cleanProdName = prod.name.toLowerCase().startsWith(prod.unit.toLowerCase()) 
        ? prod.name 
        : `${prod.unit} ${prod.name}`;
      items.push(`â€¢ ${quantity} ${cleanProdName} â€” $${sub.toLocaleString('es-AR')}`);
    } else {
      items.push(`â€¢ ${quantity} kg ${prod.name} â€” $${sub.toLocaleString('es-AR')}`);
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
 * Obtiene el Carrito CanÃ³nico del Grafo de Memoria (Working Memory Cart State)
 * Garantiza coherencia absoluta entre turnos sin alucinaciones ni productos fantasma.
 */
export function getCanonicalCart(lead, history = [], rawText = '', products = null) {
  const catList = (products && products.length > 0) ? products : (db.getProducts() || []);
  
  const tClean = (rawText || '').toLowerCase();
  const isCancel = /(?:cancelar|cancelo|cancela|cancelame|anular|anula|anulame|no quiero nada|cancelar el pedido|cancelar mi pedido|cancelo el pedido|ya no quiero el pedido)/i.test(tClean) ||
    (/(?:cancelar el pedido|cancelo el pedido|ya no quiero el pedido)/i.test((history && history.length > 0 ? (history[history.length - 1]?.content || '') : '')) && !/(?:1|2|si|sÃ­|confirmar|volver|no|dale)/i.test(tClean));

  if (isCancel) {
    if (lead) {
      lead.draftCart = null;
      lead.currentOrder = null;
    }
    return { items: [], total: 0, products: [], addedItems: [] };
  }

  // 1. Extraer del turno actual y del historial
  let { items, total, products: structuredProducts, addedItems } = extractItemsFromHistoryAndText(history, rawText, catList, lead);

  // 2. Si la extracciÃ³n del turno no encontrÃ³ nada (ej: el usuario solo enviÃ³ su direcciÃ³n o dijo "sÃ­"),
  // recurrir al estado guardado en el nodo de memoria del lead o al pedido activo
  if ((!items || items.length === 0) && lead) {
    if (lead.draftCart && Array.isArray(lead.draftCart.items) && lead.draftCart.items.length > 0) {
      items = lead.draftCart.items;
      total = lead.draftCart.total || 0;
      structuredProducts = lead.draftCart.products || [];
    } else if (lead.currentOrder && Array.isArray(lead.currentOrder.items) && lead.currentOrder.items.length > 0) {
      items = lead.currentOrder.items;
      total = lead.currentOrder.totalAmount || lead.currentOrder.total || 0;
      structuredProducts = lead.currentOrder.products || [];
    } else {
      // Intentar buscar pedido activo en DB
      const dbOrder = (db.getOrders() || []).find(o => 
        (o.jid === lead.jid || o.phone === lead.phone) && 
        ['pending', 'preparing'].includes(o.status)
      );
      if (dbOrder && Array.isArray(dbOrder.items) && dbOrder.items.length > 0) {
        items = dbOrder.items;
        total = dbOrder.totalAmount || 0;
        structuredProducts = dbOrder.products || [];
      }
    }
  }

  // 3. Si tenemos Ã­tems vÃ¡lidos, persistir en el nodo del lead para los siguientes pasos
  if (items && items.length > 0 && lead) {
    lead.draftCart = {
      items,
      total,
      products: structuredProducts,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    items: items || [],
    total: total || 0,
    products: structuredProducts || [],
    addedItems: addedItems || []
  };
}

/**
 * Construye el prompt completo del sistema combinando instrucciones generales, contexto regional,
 * modismos locales, reglas de negocio y cortes vigentes del catÃ¡logo.
 */
export function buildFullSystemPrompt(settings, catalog = null) {
  const agentName = settings.agentName || 'Carlos';
  const agentRole = settings.agentRole || 'Maestro Carnicero de RepÃºblica de la Carne';
  const businessName = settings.businessName || 'RepÃºblica de la Carne';
  const country = settings.country || 'Argentina';
  const region = settings.region || 'CÃ³rdoba Capital y Alrededores';
  const currency = settings.currency || 'Pesos Argentinos ($ ARS)';
  const slang = settings.slang || 'CordobÃ©s / Argentino amigable y experto (Â¡De diez!, Â¡De una!, asado, achuras, cortes del dÃ­a)';
  const businessRules = settings.businessRules || 'EnvÃ­os en el dÃ­a dentro de CÃ³rdoba, 6 sucursales de retiro, novillito pesado y cerdo seleccionado, pagos en efectivo, transferencia o Mercado Pago.';
  const customPrompt = settings.systemPrompt || '';

  const activeProducts = (catalog || db.getProducts() || [])
    .filter(p => p.isAvailable !== false && p.price > 0)
    .slice(0, 45)
    .map(p => `â€¢ [PLU ${p.plu || '-'}] ${p.name}: $${Number(p.price).toLocaleString('es-AR')}/${p.unit || 'kg'}`)
    .join('\n');

  // Obtener recetas tradicionales activas
  const recipesList = (db.getRecipes ? db.getRecipes() : [])
    .slice(0, 8)
    .map(r => `â€¢ ${r.title} (${r.category}): Cortes: ${r.suggestedCuts.map(c => c.name).join(', ')} | PorciÃ³n: ~${r.gramsPerPerson || 250}g/pers`)
    .join('\n');

  // ConfiguraciÃ³n de Personalidad del Agente
  const personalityMode = settings.agentPersonalityMode || 'balanced';
  let personalityDirective = '';
  if (personalityMode === 'strict_sales') {
    personalityDirective = `â€¢ MODO BOT DE VENTAS ESTRICTO (100% Comercial): SÃ© directo, conciso y enfocado en la cotizaciÃ³n, elecciÃ³n de cortes y confirmaciÃ³n del pedido. Evita saludos largos o desvÃ­os informales.`;
  } else if (personalityMode === 'human_empathetic') {
    personalityDirective = `â€¢ MODO HUMANO EMPÃTICO (ConversaciÃ³n CÃ¡lida con Encauce): Si el cliente comparte anÃ©cdotas, habla del clima, su familia o situaciones cotidianas, responde primero con 1 o 2 frases cÃ¡lidas y humanas, y luego retoma de forma natural y fluida el asesoramiento carnicero para ayudarlo con su comida.`;
  } else {
    personalityDirective = `â€¢ MODO ASESOR EQUILIBRADO (Experto CordobÃ©s): Trato cordial, enÃ©rgico y amable de mostrador carnicero. Asesora con paciencia en recetas y cortes, guiando con naturalidad hacia la propuesta de compra.`;
  }

  // Contexto en Tiempo Real del Servidor
  const now = new Date();
  const timeOptions = { timeZone: 'America/Argentina/Cordoba', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const dateOptions = { timeZone: 'America/Argentina/Cordoba', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const currentTimeStr = now.toLocaleTimeString('es-AR', timeOptions);
  const currentDateStr = now.toLocaleDateString('es-AR', dateOptions);

  return `Eres ${agentName}, ${agentRole} de "${businessName}".

Contexto Regional y Negocio:
â€¢ PaÃ­s y RegiÃ³n: ${country} (${region})
â€¢ Fecha y Hora Actual: ${currentTimeStr} (${currentDateStr}) [Zona Horaria: America/Argentina/Cordoba, Argentina / UTC-3]
â€¢ Moneda de Venta: ${currency} (todos los precios son exactos en moneda local)
â€¢ Tono y Modismos: ${slang}
â€¢ Directivas de Negocio: ${businessRules}

Directiva de Personalidad:
${personalityDirective}

Directivas del Sistema:
${customPrompt}

CatÃ¡logo Oficial de Cortes y Precios Vigentes:
${activeProducts}

Recetas Tradicionales Argentinas y Cortes Vinculados:
${recipesList}

Reglas de Oro y Asesoramiento de Ã‰lite:
- Asesoramiento Consultivo y Combos Estructurados: Cuando el cliente consulte por "ofertas", "juntada con amigos", "comida", "asado" o quÃ© llevar, compÃ³rtate como un verdadero maestro carnicero de mostrador. Proponle opciones ricas y estructuradas con formato prolijo (negrita, viÃ±etas y emojis):
  * OpciÃ³n 1: Combo Asadazo Parrillero (Costillar / Tira + VacÃ­o + Chorizos + Morcillas).
  * OpciÃ³n 2: Combo Cerdo & Achuras (Pechito con manta + Matambre de cerdo + Chorizos).
  * OpciÃ³n 3: Promo MenÃº Semanal / Cocina Diaria (Nalga para milanesas + Carne picada especial + Costeletas).
- CÃ¡lculo Preciso de Raciones: Para asados calcula entre 500g y 600g por persona (sumando cortes y achuras). Para comidas de olla, horno o milanesas calcula 250g a 300g por persona. Explica la distribuciÃ³n en: (1) La Previa / Achuras, (2) El Plato Fuerte y (3) AcompaÃ±amientos / Bebidas / CarbÃ³n.
- AtenciÃ³n Consultiva Integral y Reenganche de Ventas: Si el cliente hace cualquier pregunta (la hora, pedidos pendientes, medios de pago, sucursales, envÃ­os a domicilio, o charla casual), responde PRIMERO a su consulta con total amabilidad, precisiÃ³n y empatÃ­a, y LUEGO reengancha con entusiasmo hacia la propuesta de compra para armar su pedido.
- Consulta de la Hora: Si el cliente pregunta quÃ© hora es o si estÃ¡n abiertos, indÃ­cale la hora actual exacta (${currentTimeStr}) y comenta alegremente que estÃ¡s firme en mostrador para prepararle los mejores cortes.
- AclaraciÃ³n de Precios por Kilo y Pesaje Variable: En todo detalle de pedido o resumen de compra, aclara al inicio que los precios son por kilo ("ðŸ“‹ Detalle de tu pedido (precios por kilo segÃºn corte):") e incluye obligatoriamente luego del monto final la nota: "*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*".
- SustituciÃ³n de Cortes Agotados o Fuera de CatÃ¡logo: Si el cliente solicita un producto que no estÃ¡ disponible, ofrÃ©cele de inmediato una alternativa similar del catÃ¡logo con su precio por kilo.
- DesambiguaciÃ³n: Si el cliente pide un corte general o ambiguo con mÃºltiples variedades, ofrece opciones numeradas con precios claros para que elija.
- Fraccionamiento por Unidades: Cuando el cliente pida productos que se venden por unidad (chorizos, morcillas, costeletas, milanesas) indicando unidades (ej: "6 chorizos", "4 costeletas"), en el detalle del pedido SIEMPRE muestra "X Unidades de [Nombre]" y NUNCA "kg".
- Consulta de Pago Previa al Cierre: Antes de cerrar el pedido final, consulta cÃ³mo pagarÃ¡ (1ï¸âƒ£ Efectivo contraentrega, 2ï¸âƒ£ Transferencia Alias: republica.carne.mp, 3ï¸âƒ£ Link de Mercado Pago).
- Condiciones Obligatorias: No cierres un pedido sin validar: (1) cortes o combo definidos con precio, (2) modalidad de entrega (Domicilio o Sucursal), (3) medio de pago y (4) nombre del cliente.`;
}

export class AIService {
  /**
   * Ejecuta un test real directo contra el proveedor y modelo especificado
   * Devuelve latencia, texto de respuesta, tokens y detalles tÃ©cnicos reales.
   * Si falla, devuelve el error exacto del API (cÃ³digo HTTP, mensaje, detalles) sin enmascararlo con fallbacks.
   */
  static async testModelConnection({ provider, model, apiKey, customEndpoint, temperature = 0.7, maxTokens = 150 }) {
    const s = db.getSettings() || {};
    let effectiveProvider = provider || s.aiProvider || 'gemini';
    if (effectiveProvider === 'system_default') {
      effectiveProvider = s.aiProvider || 'gemini';
    }
    let effectiveModel = model || s.aiModel || getDefaultModelForProvider(effectiveProvider);
    if (effectiveModel === 'default') {
      effectiveModel = s.aiModel || getDefaultModelForProvider(effectiveProvider);
    }
    const effectiveTemp = typeof temperature === 'number' ? temperature : 0.7;
    const testPrompt = "Hola, responde Ãºnicamente con: 'CONEXION_EXITOSA: [Nombre del modelo] funcionando correctamente.' y una frase corta de saludo.";

    const startTime = Date.now();

    try {
      // 0. Qwen 2.5 0.5B Embebido con node-llama-cpp (Zero-RAM, Offline)
      if (effectiveProvider === 'qwen_embedded' || effectiveProvider === 'embedded') {
        const res = await embeddedLlama.testConnection({ temperature: effectiveTemp, maxTokens });
        if (res.success) {
          tokenTracker.recordUsage({
            provider: 'qwen_embedded',
            model: 'qwen2.5-0.5b-instruct',
            promptText: testPrompt,
            completionText: res.response,
            latencyMs: res.latencyMs,
            caller: 'agent_test'
          });
        }
        return res;
      }

      // 1. Google Gemini
      if (effectiveProvider === 'gemini') {
        const key = apiKey || s.geminiApiKey || process.env.GEMINI_API_KEY;
        if (!key || !key.startsWith('AIza')) {
          return {
            success: false,
            provider: 'Google Gemini',
            model: effectiveModel,
            error: 'API Key de Google Gemini invÃ¡lida o faltante (debe comenzar con "AIzaSy..."). ConfigÃºrala en Ajustes o en el Agente.',
            latencyMs: Date.now() - startTime,
            isFallback: false
          };
        }

        const genAI = new GoogleGenerativeAI(key);
        const generativeModel = genAI.getGenerativeModel({
          model: effectiveModel,
          generationConfig: {
            temperature: effectiveTemp,
            maxOutputTokens: maxTokens
          }
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con Google Gemini (Timeout 7s)')), 7000)
        );

        const result = await Promise.race([
          generativeModel.generateContent(testPrompt),
          timeoutPromise
        ]);
        const text = result.response.text();
        const latencyMs = Date.now() - startTime;

        return {
          success: true,
          provider: 'Google Gemini',
          model: effectiveModel,
          response: text.trim(),
          latencyMs,
          isFallback: false,
          details: {
            providerId: 'gemini',
            requiresKey: true,
            status: 'ONLINE'
          }
        };
      }

      // 2. Anthropic Claude
      if (effectiveProvider === 'anthropic') {
        const key = apiKey || s.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
        if (!key || !key.startsWith('sk-ant-')) {
          return {
            success: false,
            provider: 'Anthropic Claude',
            model: effectiveModel,
            error: 'API Key de Anthropic Claude invÃ¡lida o faltante (debe comenzar con "sk-ant-..."). ConfigÃºrala en Ajustes o en el Agente.',
            latencyMs: Date.now() - startTime,
            isFallback: false
          };
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: AbortSignal.timeout(7000),
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: effectiveModel,
            max_tokens: maxTokens,
            temperature: effectiveTemp,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });

        const data = await response.json();
        const latencyMs = Date.now() - startTime;

        if (!response.ok || data.error) {
          return {
            success: false,
            provider: 'Anthropic Claude',
            model: effectiveModel,
            error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
            latencyMs,
            isFallback: false
          };
        }

        const text = data.content?.[0]?.text || '';
        return {
          success: true,
          provider: 'Anthropic Claude',
          model: effectiveModel,
          response: text.trim(),
          latencyMs,
          isFallback: false,
          details: {
            providerId: 'anthropic',
            usage: data.usage,
            status: 'ONLINE'
          }
        };
      }

      // 3. Modelos Gratuitos Online (Pollinations.AI / Cero API Key)
      if (effectiveProvider === 'free_online') {
        const cleanModelName = effectiveModel.replace(/^free:pollinations\//, '');
        const url = `https://text.pollinations.ai/${encodeURIComponent(testPrompt)}?model=${cleanModelName}&seed=42`;
        const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(7000) });
        const latencyMs = Date.now() - startTime;

        if (!res.ok) {
          return {
            success: false,
            provider: 'Modelos Gratuitos Online (Pollinations)',
            model: effectiveModel,
            error: `Error HTTP ${res.status} conectando al servicio pÃºblico de IA gratuita.`,
            latencyMs,
            isFallback: false
          };
        }

        const text = await res.text();
        return {
          success: true,
          provider: 'Modelos Gratuitos Online (Pollinations AI)',
          model: effectiveModel,
          response: text.trim(),
          latencyMs,
          isFallback: false,
          details: {
            providerId: 'free_online',
            isZeroCost: true,
            status: 'ONLINE'
          }
        };
      }

      // 4. OpenAI y Proveedores Compatibles (OpenAI, NVIDIA NIM, DeepSeek, Groq, OpenRouter, Cohere, Local, Custom)
      let baseURL = customEndpoint;
      let effectiveKey = apiKey;

      if (effectiveProvider === 'openai') {
        effectiveKey = effectiveKey || s.openaiApiKey || process.env.OPENAI_API_KEY;
        baseURL = baseURL || undefined;
      } else if (effectiveProvider === 'nvidia') {
        effectiveKey = effectiveKey || s.nvidiaApiKey || process.env.NVIDIA_API_KEY;
        baseURL = baseURL || 'https://integrate.api.nvidia.com/v1';
      } else if (effectiveProvider === 'deepseek') {
        effectiveKey = effectiveKey || s.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
        baseURL = baseURL || 'https://api.deepseek.com';
      } else if (effectiveProvider === 'groq') {
        effectiveKey = effectiveKey || s.groqApiKey || process.env.GROQ_API_KEY;
        baseURL = baseURL || 'https://api.groq.com/openai/v1';
      } else if (effectiveProvider === 'openrouter') {
        effectiveKey = effectiveKey || s.openrouterApiKey || process.env.OPENROUTER_API_KEY;
        baseURL = baseURL || 'https://openrouter.ai/api/v1';
      } else if (effectiveProvider === 'cohere') {
        effectiveKey = effectiveKey || s.cohereApiKey || process.env.COHERE_API_KEY;
        baseURL = baseURL || 'https://api.cohere.ai/v1';
      } else if (effectiveProvider === 'local') {
        baseURL = baseURL || (effectiveModel.includes('lmstudio') ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1');
        effectiveKey = effectiveKey || 'ollama';
      } else if (effectiveProvider === 'custom') {
        baseURL = baseURL || s.customBaseUrl || 'http://localhost:11434/v1';
        effectiveKey = effectiveKey || s.customApiKey || 'custom-key';
      }

      const requiresKey = !['local'].includes(effectiveProvider);
      if (requiresKey && (!effectiveKey || effectiveKey.trim() === '')) {
        return {
          success: false,
          provider: effectiveProvider,
          model: effectiveModel,
          error: `API Key faltante para el proveedor ${effectiveProvider}. ConfigÃºrala en Ajustes o en el Agente.`,
          latencyMs: Date.now() - startTime,
          isFallback: false
        };
      }

      const cleanModel = effectiveModel.replace(/^free:(?:ollama|lmstudio)\//, '');

      const openai = new OpenAI({
        apiKey: effectiveKey || 'dummy-key',
        baseURL: baseURL || undefined,
        timeout: 6000,
        maxRetries: 0
      });

      const completion = await openai.chat.completions.create({
        model: cleanModel,
        messages: [{ role: 'user', content: testPrompt }],
        temperature: effectiveTemp,
        max_tokens: maxTokens
      });

      const latencyMs = Date.now() - startTime;
      const text = completion.choices[0]?.message?.content || '';

      return {
        success: true,
        provider: effectiveProvider.toUpperCase(),
        model: effectiveModel,
        response: text.trim(),
        latencyMs,
        isFallback: false,
        details: {
          providerId: effectiveProvider,
          usage: completion.usage,
          status: 'ONLINE'
        }
      };

    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        provider: effectiveProvider,
        model: effectiveModel,
        error: err.message || String(err),
        latencyMs,
        isFallback: false,
        details: {
          code: err.code || err.status,
          type: err.type || err.name
        }
      };
    }
  }

  /**
   * Ejecutor Universal de Modelos de Inteligencia Artificial
   * Admite Google Gemini, Anthropic Claude, OpenAI, NVIDIA NIM, DeepSeek, Groq, OpenRouter, Cohere, Pollinations (Gratis), Ollama y Custom
   */
  static async callLLMGeneric({
    provider = 'gemini',
    model = 'gemini-2.5-flash',
    systemPrompt = '',
    prompt = '',
    history = [],
    temperature = 0.7,
    maxTokens = 600,
    settings = null,
    apiKey = '',
    customEndpoint = ''
  }) {
    const s = settings || db.getSettings();
    const effectiveProvider = provider || s.aiProvider || 'gemini';
    const effectiveModel = model || s.aiModel || getDefaultModelForProvider(effectiveProvider);
    const effectiveTemp = typeof temperature === 'number' ? temperature : (typeof s.aiTemperature === 'number' ? s.aiTemperature : 0.7);
    const effectiveMaxTokens = maxTokens || s.aiMaxTokens || 600;

    const cleanHistory = (history || []).slice(-10).map(m => ({
      role: (m.sender === 'user' || m.sender === 'client') ? 'user' : 'assistant',
      content: m.content || m.text || ''
    }));

    // 0. Qwen 2.5 0.5B Embebido con node-llama-cpp (Zero-RAM, Offline)
    if (effectiveProvider === 'qwen_embedded' || effectiveProvider === 'embedded') {
      try {
        if (embeddedLlama.isModelAvailable()) {
          const res = await embeddedLlama.prompt({
            systemPrompt,
            prompt,
            history: cleanHistory,
            temperature: effectiveTemp,
            maxTokens: Math.min(effectiveMaxTokens, 150)
          });
          if (res.text && res.text.trim()) {
            tokenTracker.recordUsage({
              provider: 'qwen_embedded',
              model: 'qwen2.5-0.5b-instruct',
              promptText: prompt + (systemPrompt || ''),
              completionText: res.text,
              latencyMs: res.latencyMs,
              caller: 'whatsapp'
            });
            return res.text.trim();
          }
        } else {
          console.warn('[AIService] Qwen 2.5 0.5B no estÃ¡ descargado aÃºn en data/models/.');
        }
      } catch (qwenErr) {
        console.warn(`[AIService] Fallo con Qwen Embebido:`, qwenErr.message);
      }
    }

    // 1. Google Gemini
    if (effectiveProvider === 'gemini') {
      const geminiKey = apiKey || s.apiKeyOverride || s.geminiApiKey || process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey.startsWith('AIza')) {
        const candidateModels = [effectiveModel, 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'].filter(Boolean);
        const uniqueModels = [...new Set(candidateModels)];

        for (const mName of uniqueModels) {
          try {
            const startGemini = Date.now();
            const genAI = new GoogleGenerativeAI(geminiKey);
            const genModel = genAI.getGenerativeModel({
              model: mName,
              generationConfig: {
                temperature: effectiveTemp,
                maxOutputTokens: effectiveMaxTokens
              }
            });

            const conversationText = cleanHistory.map(h => `${h.role === 'user' ? 'Cliente/Usuario' : 'Asistente'}: ${h.content}`).join('\n');
            const fullPrompt = `${systemPrompt ? `Instrucciones del Sistema:\n${systemPrompt}\n\n` : ''}${conversationText ? `Historial:\n${conversationText}\n\n` : ''}Entrada:\n${prompt}\n\nRespuesta:`;

            const result = await genModel.generateContent(fullPrompt);
            const responseText = result.response.text();
            if (responseText && responseText.trim()) {
              tokenTracker.recordUsage({
                provider: 'gemini',
                model: mName,
                promptText: fullPrompt,
                completionText: responseText,
                latencyMs: Date.now() - startGemini,
                caller: 'whatsapp'
              });
              return responseText.trim();
            }
          } catch (geminiErr) {
            console.warn(`[AIService] Fallo con Gemini ${mName}:`, geminiErr.message);
          }
        }
      }
    }

    // 2. Anthropic Claude
    if (effectiveProvider === 'anthropic') {
      const anthropicKey = apiKey || s.apiKeyOverride || s.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
        try {
          const startClaude = Date.now();
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model: effectiveModel,
              max_tokens: effectiveMaxTokens,
              temperature: effectiveTemp,
              system: systemPrompt || undefined,
              messages: [
                ...cleanHistory,
                { role: 'user', content: prompt }
              ]
            })
          });
          const data = await response.json();
          if (data.content?.[0]?.text) {
            const resp = data.content[0].text.trim();
            tokenTracker.recordUsage({
              provider: 'anthropic',
              model: effectiveModel,
              promptTokens: data.usage?.input_tokens,
              completionTokens: data.usage?.output_tokens,
              promptText: prompt + (systemPrompt || ''),
              completionText: resp,
              latencyMs: Date.now() - startClaude,
              caller: 'whatsapp'
            });
            return resp;
          }
        } catch (claudeErr) {
          console.warn(`[AIService] Fallo con Claude:`, claudeErr.message);
        }
      }
    }

    // 3. Modelos Gratuitos Online (Pollinations.AI)
    if (effectiveProvider === 'free_online') {
      try {
        const startPoll = Date.now();
        const cleanModelName = effectiveModel.replace(/^free:pollinations\//, '');
        const combinedPrompt = `${systemPrompt ? `[SYSTEM: ${systemPrompt}]\n` : ''}${cleanHistory.map(h => `${h.role}: ${h.content}`).join('\n')}\nUser: ${prompt}`;
        const url = `https://text.pollinations.ai/${encodeURIComponent(combinedPrompt)}?model=${cleanModelName}&seed=${Math.floor(Math.random() * 1000)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) {
            tokenTracker.recordUsage({
              provider: 'free_online',
              model: cleanModelName,
              promptText: combinedPrompt,
              completionText: text,
              latencyMs: Date.now() - startPoll,
              caller: 'whatsapp'
            });
            return text.trim();
          }
        }
      } catch (pollErr) {
        console.warn(`[AIService] Fallo con Pollinations Free:`, pollErr.message);
      }
    }

    // 4. OpenAI y Proveedores OpenAI-compatibles (OpenAI, NVIDIA, DeepSeek, Groq, OpenRouter, Cohere, Local, Custom)
    let baseURL = customEndpoint || s.customEndpoint;
    let effectiveKey = apiKey || s.apiKeyOverride;

    if (effectiveProvider === 'openai') {
      effectiveKey = effectiveKey || s.openaiApiKey || process.env.OPENAI_API_KEY;
    } else if (effectiveProvider === 'nvidia') {
      effectiveKey = effectiveKey || s.nvidiaApiKey || process.env.NVIDIA_API_KEY;
      baseURL = baseURL || 'https://integrate.api.nvidia.com/v1';
    } else if (effectiveProvider === 'deepseek') {
      effectiveKey = effectiveKey || s.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      baseURL = baseURL || 'https://api.deepseek.com';
    } else if (effectiveProvider === 'groq') {
      effectiveKey = effectiveKey || s.groqApiKey || process.env.GROQ_API_KEY;
      baseURL = baseURL || 'https://api.groq.com/openai/v1';
    } else if (effectiveProvider === 'openrouter') {
      effectiveKey = effectiveKey || s.openrouterApiKey || process.env.OPENROUTER_API_KEY;
      baseURL = baseURL || 'https://openrouter.ai/api/v1';
    } else if (effectiveProvider === 'cohere') {
      effectiveKey = effectiveKey || s.cohereApiKey || process.env.COHERE_API_KEY;
      baseURL = baseURL || 'https://api.cohere.ai/v1';
    } else if (effectiveProvider === 'local') {
      baseURL = baseURL || (effectiveModel.includes('lmstudio') ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1');
      effectiveKey = effectiveKey || 'ollama';
    } else if (effectiveProvider === 'custom') {
      baseURL = baseURL || s.customBaseUrl || 'http://localhost:11434/v1';
      effectiveKey = effectiveKey || s.customApiKey || 'custom-key';
    }

    if (effectiveKey || effectiveProvider === 'local') {
      try {
        const startOpenAI = Date.now();
        const cleanModel = effectiveModel.replace(/^free:(?:ollama|lmstudio)\//, '');
        const openai = new OpenAI({
          apiKey: effectiveKey || 'dummy-key',
          baseURL: baseURL || undefined,
          timeout: 8000,
          maxRetries: 1
        });

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push(...cleanHistory);
        messages.push({ role: 'user', content: prompt });

        const completion = await openai.chat.completions.create({
          model: cleanModel,
          messages,
          temperature: effectiveTemp,
          max_tokens: effectiveMaxTokens
        });

        const content = completion.choices[0]?.message?.content;
        if (content && content.trim()) {
          tokenTracker.recordUsage({
            provider: effectiveProvider,
            model: cleanModel,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            promptText: prompt + (systemPrompt || ''),
            completionText: content,
            latencyMs: Date.now() - startOpenAI,
            caller: 'whatsapp'
          });
          return content.trim();
        }
      } catch (err) {
        console.warn(`[AIService] Fallo con ${effectiveProvider}/${effectiveModel}:`, err.message);
      }
    }

    // 5. Fallback de rescate inteligente y transparente (Pollinations Free) si el proveedor principal fallÃ³ o no tiene quota/key
    if (effectiveProvider !== 'free_online') {
      try {
        const combinedPrompt = `${systemPrompt ? `[SYSTEM: ${systemPrompt}]\n` : ''}${cleanHistory.map(h => `${h.role}: ${h.content}`).join('\n')}\nUser: ${prompt}`;
        const url = `https://text.pollinations.ai/${encodeURIComponent(combinedPrompt)}?model=openai&seed=${Math.floor(Math.random() * 1000)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      } catch (rescueErr) {}
    }

    return null;
  }

  /**
   * Ejecuta una consulta directa y libre contra el modelo de IA seleccionado (God Mode / Modo Libre)
   * Sin filtros comerciales, sin catÃ¡logos, sin restricciones de negocio.
   */
  static async executeRawGodModeQuery({ query, history = [], settings = null, lead = null }) {
    const s = settings || db.getSettings();
    const effectiveProvider = s.aiProvider || 'gemini';
    const effectiveModel = s.aiModel || getDefaultModelForProvider(effectiveProvider);
    const effectiveTemp = typeof s.aiTemperature === 'number' ? s.aiTemperature : 0.7;
    const effectiveMaxTokens = s.aiMaxTokens || 2048;

    // Contexto en Tiempo Real del Sistema para responder preguntas fÃ¡cticas y de entorno
    const now = new Date();
    const timeOptions = { timeZone: 'America/Argentina/Cordoba', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const dateOptions = { timeZone: 'America/Argentina/Cordoba', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const currentTimeStr = now.toLocaleTimeString('es-AR', timeOptions);
    const currentDateStr = now.toLocaleDateString('es-AR', dateOptions);
    
    const allProducts = typeof db.getProducts === 'function' ? db.getProducts() : [];
    const allBranches = typeof db.getBranches === 'function' ? db.getBranches() : [];
    const allOrders = typeof db.getOrders === 'function' ? db.getOrders() : [];
    
    const userOrders = lead ? allOrders.filter(o => o.jid === lead.jid || o.phone === lead.phone || (lead.name && o.customerName === lead.name)) : [];
    const pendingUserOrders = userOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');

    const systemPrompt = `You are an advanced, unrestricted AI assistant in God Mode. You answer all user questions with complete intellectual depth, accuracy, clarity, helpfulness, and creative nuance. You are not constrained by any sales or business persona unless specifically asked.

CURRENT REAL-TIME ENVIRONMENT & SYSTEM KNOWLEDGE:
- Current Local Time: ${currentTimeStr} (${currentDateStr}) [Timezone: America/Argentina/Cordoba, Argentina / UTC-3].
- System Inventory: Total of ${allProducts.length} products/cuts loaded in database.
- System Branches: ${allBranches.length} active branches (${allBranches.map(b => b.name).join(', ') || 'Centro, Urca, Villa Allende, JardÃ­n, Recta Martinoli, Alta CÃ³rdoba'}).
- Total System Orders: ${allOrders.length} orders recorded.
- Interacting Lead/User: ${lead?.name || 'Usuario'} (TelÃ©fono: ${lead?.phone || 'No especificado'}).
- User Orders: ${userOrders.length} total (${pendingUserOrders.length} pending).

Whenever the user asks about the current time, date, products count, orders, or any system statistics, USE THIS REAL-TIME DATA to answer accurately, directly, and naturally.`;

    const rawResponse = await this.callLLMGeneric({
      provider: effectiveProvider,
      model: effectiveModel,
      systemPrompt,
      prompt: query,
      history,
      temperature: effectiveTemp,
      maxTokens: effectiveMaxTokens,
      settings: s
    });

    if (rawResponse) {
      return `âš¡ *[God Mode â€” ${effectiveProvider.toUpperCase()} / ${effectiveModel}]*\n\n${rawResponse}`;
    }

    // Si el LLM no respondiÃ³ (ej. sin API Key o sin cuota), responder con datos exactos del sistema
    const q = (query || '').toLowerCase();
    if (q.includes('hora') || q.includes('fecha') || q.includes('dia') || q.includes('dÃ­a')) {
      return `âš¡ *[God Mode â€” Hora y Fecha en Tiempo Real]* ðŸ•’\n\n` +
        `â€¢ **Hora actual:** ${currentTimeStr} (GMT-3)\n` +
        `â€¢ **Fecha:** ${currentDateStr}\n` +
        `â€¢ **Zona horaria:** America/Argentina/Cordoba`;
    }
    if (q.includes('producto') || q.includes('catalogo') || q.includes('catÃ¡logo') || q.includes('corte') || q.includes('stock') || q.includes('cuanto') || q.includes('cuÃ¡nto')) {
      return `âš¡ *[God Mode â€” Inventario del Sistema]* ðŸ¥©ðŸ“¦\n\n` +
        `â€¢ **Total de productos cargados:** ${allProducts.length} cortes/artÃ­culos en catÃ¡logo.\n` +
        `â€¢ **Sucursales activas:** ${allBranches.length} (${allBranches.map(b => b.name).join(', ') || 'Centro, Urca, Villa Allende, JardÃ­n, Recta Martinoli, Alta CÃ³rdoba'})\n` +
        `â€¢ **Base de datos:** SQLite WAL nativo sincronizado en tiempo real.`;
    }
    if (q.includes('pedido') || q.includes('orden') || q.includes('pendiente')) {
      return `âš¡ *[God Mode â€” Estado de Pedidos]* ðŸ§¾\n\n` +
        `â€¢ **Total de pedidos en sistema:** ${allOrders.length}\n` +
        `â€¢ **Pedidos del usuario (${lead?.name || 'Cliente'}):** ${userOrders.length} registrados (${pendingUserOrders.length} pendientes).`;
    }

    // Fallback descriptivo si no hay conexiÃ³n al LLM
    return `âš¡ *[God Mode Activo]* ðŸ§ ðŸ”“\n\n` +
      `He recibido tu consulta libre:\n` +
      `> *"${query}"*\n\n` +
      `ðŸ’¡ *Consejo:* PodÃ©s activar un modelo gratuito online (Pollinations AI) o ingresar una API Key de Gemini / NVIDIA / OpenAI / Claude / DeepSeek / Groq en **Ajustes âš™ï¸** o en tu **Agente** para respuestas generativas ultra veloces.`;
  }

  static async generateSalesResponse({ rawText, text, lead, history, settings, knowledgeBase, products } = {}) {
    const incomingText = rawText || text || '';
    const activeLead = lead || { name: 'Cliente', stage: 'new_lead', tags: [] };
    const activeSettings = settings || db.getSettings();
    const activeHistory = Array.isArray(history) ? history : [];
    const activeKb = knowledgeBase || [];

    if (/^\/godmode/i.test((incomingText || '').trim()) || Boolean(activeLead.godMode)) {
      const res = await this.generateReply({
        incomingText,
        lead: activeLead,
        history: activeHistory,
        settings: activeSettings
      });
      return res.text;
    }

    const reply = await this.generateDynamicReply(incomingText, activeLead, activeKb, activeSettings, activeHistory);
    try {
      OrderSyncEngine.syncOrderFromTurn({
        jid: activeLead.jid || activeLead.id,
        lead: activeLead,
        customerText: incomingText,
        aiReplyText: reply,
        products: products || db.getProducts()
      });
    } catch (orderSyncErr) {}

    try {
      tokenTracker.recordUsage({
        provider: activeSettings.aiProvider || 'gemini',
        model: activeSettings.aiModel || 'gemini-2.5-flash',
        promptText: incomingText,
        completionText: reply,
        caller: 'simulator'
      });
    } catch (tokErr) {}

    return reply;
  }

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
      lead = (typeof param2 === 'object' && param2 !== null) ? param2 : (db.getLead(jid) || { name: 'Cliente', stage: 'new_lead', tags: [] });
    }
    if (!history || history.length === 0) {
      history = (Array.isArray(param3) && param3.length > 0) ? param3 : db.getMessages(jid, 8);
    }
    const knowledgeBase = db.getKnowledgeBase();
    const products = db.getProducts();

    // =========================================================================
    // 0. DETECCIÃ“N Y PROCESAMIENTO DE COMANDOS /godmode Y MODO LIBRE DE IA
    // =========================================================================
    const trimmedInput = (incomingText || '').trim();
    const isGodModeCommand = /^\/godmode(?:\s+.*)?$/i.test(trimmedInput);
    const isGodModeActiveForLead = Boolean(lead?.godMode);

    if (isGodModeCommand) {
      const match = trimmedInput.match(/^\/godmode(?:\s+(.*))?$/i);
      const subCommand = (match && match[1]) ? match[1].trim() : '';

      // 0.1 Toggle o ActivaciÃ³n ExplÃ­cita (/godmode on, /godmode activar, etc.)
      if (/^(?:on|activar|enable|start|1|si|sÃ­)$/i.test(subCommand)) {
        if (lead) {
          lead.godMode = true;
          if (lead.jid || lead.id) {
            db.updateLead(lead.jid || lead.id, { godMode: true });
          }
        }
        const effectiveProvider = (settings.aiProvider || 'gemini').toUpperCase();
        const effectiveModel = settings.aiModel || 'gemini-2.5-flash';
        return {
          text: `âš¡ *MODO DIOS (GOD MODE) ACTIVADO* ðŸ§ ðŸ”“\n\n` +
            `Has desbloqueado la comunicaciÃ³n directa y sin restricciones con el modelo de IA (**${effectiveProvider} / ${effectiveModel}**).\n\n` +
            `âœ¨ *Capacidades habilitadas:*\n` +
            `â€¢ ConversaciÃ³n libre sobre cualquier temÃ¡tica (programaciÃ³n, ciencia, redacciÃ³n, cocina general, filosofÃ­a, anÃ¡lisis, etc.).\n` +
            `â€¢ Sin restricciones comerciales, ni embudos de ventas, ni catÃ¡logo obligatorio de carnicerÃ­a.\n` +
            `â€¢ Memoria contextual completa de la conversaciÃ³n.\n\n` +
            `ðŸ‘‰ *Para desactivar y volver al modo vendedor comercial:* enviÃ¡ */godmode off* o */godmode salir*.\n` +
            `ðŸ‘‰ *Para ver estado y modelo:* enviÃ¡ */godmode info*.\n\n` +
            `Â¿De quÃ© te gustarÃ­a hablar hoy? ðŸš€`,
          shouldSendAudio: false
        };
      }

      // 0.2 DesactivaciÃ³n ExplÃ­cita (/godmode off, /godmode salir, etc.)
      if (/^(?:off|desactivar|disable|stop|salir|0|no)$/i.test(subCommand)) {
        if (lead) {
          lead.godMode = false;
          if (lead.jid || lead.id) {
            db.updateLead(lead.jid || lead.id, { godMode: false });
          }
        }
        return {
          text: `ðŸ”’ *MODO DIOS DESACTIVADO*\n\n` +
            `Se ha restablecido el asistente comercial oficial de RepÃºblica de la Carne. ðŸ¥©\n\n` +
            `Â¡Estoy a tu disposiciÃ³n para asesorarte en cortes, combos o envÃ­os! ðŸ™Œ`,
          shouldSendAudio: false
        };
      }

      // 0.3 InformaciÃ³n de Estado (/godmode info, /godmode status)
      if (/^(?:info|status|estado|config)$/i.test(subCommand)) {
        const effectiveProvider = (settings.aiProvider || 'gemini').toUpperCase();
        const effectiveModel = settings.aiModel || (settings.aiProvider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');
        return {
          text: `â„¹ï¸ *ESTADO DE MODO DIOS:* ðŸ§ \n\n` +
            `â€¢ **Estado:** ${lead?.godMode ? 'ðŸŸ¢ ACTIVO (ConversaciÃ³n Libre)' : 'ðŸ”´ INACTIVO (Modo Comercial)'}\n` +
            `â€¢ **Proveedor IA:** ${effectiveProvider}\n` +
            `â€¢ **Modelo:** ${effectiveModel}\n` +
            `â€¢ **Temperatura:** ${settings.aiTemperature ?? 0.7}\n` +
            `â€¢ **Tokens MÃ¡ximos:** ${settings.aiMaxTokens || 2048}\n\n` +
            `ðŸ‘‰ EnviÃ¡ */godmode on* para activar o */godmode off* para desactivar.`,
          shouldSendAudio: false
        };
      }

      // 0.4 Si el usuario solo escribiÃ³ "/godmode" sin argumentos -> Toggle automÃ¡tico
      if (!subCommand) {
        const nextState = !Boolean(lead?.godMode);
        if (lead) {
          lead.godMode = nextState;
          if (lead.jid || lead.id) {
            db.updateLead(lead.jid || lead.id, { godMode: nextState });
          }
        }
        if (nextState) {
          const effectiveProvider = (settings.aiProvider || 'gemini').toUpperCase();
          const effectiveModel = settings.aiModel || 'gemini-2.5-flash';
          return {
            text: `âš¡ *MODO DIOS ACTIVADO* ðŸ§ ðŸ”“\n\n` +
              `EstÃ¡s conectado libremente con **${effectiveProvider} (${effectiveModel})**.\n` +
              `PodÃ©s hablar de cualquier tema sin restricciones comerciales.\n\n` +
              `ðŸ‘‰ Para salir enviÃ¡ */godmode off*.`,
            shouldSendAudio: false
          };
        } else {
          return {
            text: `ðŸ”’ *MODO DIOS DESACTIVADO*\n\n` +
              `Se ha reactivado el asistente comercial de RepÃºblica de la Carne. ðŸ¥©`,
            shouldSendAudio: false
          };
        }
      }

      // 0.5 Si el usuario escribiÃ³ "/godmode <pregunta o prompt>" -> EjecuciÃ³n On-the-Fly libre
      const directQuery = subCommand;
      const rawGodModeReply = await this.executeRawGodModeQuery({
        query: directQuery,
        history,
        settings,
        lead
      });
      return {
        text: rawGodModeReply,
        shouldSendAudio: false
      };
    }

    // 0.6 Si el Modo Dios ya estÃ¡ activo para este Lead/Chat, procesar TODO libremente con el LLM
    if (isGodModeActiveForLead) {
      const rawGodModeReply = await this.executeRawGodModeQuery({
        query: incomingText,
        history,
        settings,
        lead
      });
      return {
        text: rawGodModeReply,
        shouldSendAudio: false
      };
    }

    // 1. Auto-aprendizaje continuo y extracciÃ³n de perfil en tiempo real
    NeuralMemoryService.learnFromCustomerInteraction({ jid, lead, incomingText, history });

    // 2. Obtener Vector Cognitivo de la Red Neuronal / Mapa Mental
    const neuralContext = NeuralMemoryService.generateCognitiveContext({ jid, incomingText, lead });

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      const fullSystemPrompt = buildFullSystemPrompt(settings, products);

      const historyFormatted = (history || []).slice(-8).map(m => `${m.sender === 'user' ? 'Cliente' : (settings.agentName || 'Carlos')}: ${m.content}`).join('\n');

      const activeLeadOrders = db.getOrdersByJid(jid || lead?.id || lead) || [];
      const activeOrd = db.getActiveOrdersByJid(jid || lead?.id || lead)[0] || null;
      let orderStatusContext = 'Estado de Pedidos del Cliente: No tiene pedidos activos ni pendientes registrados en carnicerÃ­a.';
      if (activeOrd) {
        orderStatusContext = `Estado de Pedidos del Cliente: Tiene el Pedido Activo #${activeOrd.id} (${activeOrd.status}) con los cortes: ${Array.isArray(activeOrd.items) ? activeOrd.items.join(', ') : activeOrd.items}, Total: $${activeOrd.totalAmount}.`;
      } else if (lead?.draftCart && Array.isArray(lead.draftCart.items) && lead.draftCart.items.length > 0) {
        orderStatusContext = `Estado de Pedidos del Cliente: Tiene un borrador de pedido pendiente de confirmar con: ${lead.draftCart.items.join(', ')}, Total: $${lead.draftCart.total}.`;
      } else if (activeLeadOrders.length > 0) {
        orderStatusContext = `Estado de Pedidos del Cliente: No tiene pedidos pendientes actuales. Su Ãºltima compra registrada fue el Pedido #${activeLeadOrders[0].id} (entregado).`;
      }

      // Si es un comando estrictamente atÃ³mico (ej: solo un dÃ­gito o palabra clave de confirmaciÃ³n/cancelaciÃ³n directa)
      const isPureAtomicAction = /^(?:1|2|3|4|5|6|s[iÃ­]|no|confirmar|confirmo|cancela|cancelar|ya pagu[eÃ©]|ya me lleg[oÃ³]|ac[aÃ¡] est[aÃ¡] el comprobante)$/i.test(incomingText.trim());

      let effectiveProvider = settings.aiProvider || 'gemini';
      if (effectiveProvider === 'system_default') {
        effectiveProvider = db.getSettings()?.aiProvider || 'gemini';
      }
      let effectiveModel = settings.aiModel || getDefaultModelForProvider(effectiveProvider);
      if (effectiveModel === 'default') {
        effectiveModel = db.getSettings()?.aiModel || getDefaultModelForProvider(effectiveProvider);
      }
      const effectiveTemp = typeof settings.aiTemperature === 'number' ? settings.aiTemperature : 0.7;
      const effectiveMaxTokens = settings.aiMaxTokens || 2048;

      const combinedSystemPrompt = `${fullSystemPrompt}\n\n${orderStatusContext}\n\n${neuralContext.contextPrompt}`;

      const llmResponse = await this.callLLMGeneric({
        provider: effectiveProvider,
        model: effectiveModel,
        systemPrompt: combinedSystemPrompt,
        prompt: incomingText,
        history,
        temperature: effectiveTemp,
        maxTokens: effectiveMaxTokens,
        settings
      });

      if (llmResponse && llmResponse.trim()) {
        replyText = llmResponse.trim();
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

    // SincronizaciÃ³n garantizada del pedido y persistencia en DB y SQLite WAL
    try {
      OrderSyncEngine.syncOrderFromTurn({
        jid,
        lead,
        customerText: incomingText,
        aiReplyText: replyText,
        products,
        stage: suggestedStage
      });
    } catch (orderSyncErr) {
      console.warn('âš ï¸ [AIService] Error en sincronizaciÃ³n de pedido:', orderSyncErr.message);
    }

    // Registro garantizado de consumo de tokens en turnos de IA
    try {
      tokenTracker.recordUsage({
        provider: settings.aiProvider || 'gemini',
        model: settings.aiModel || 'gemini-2.5-flash',
        promptText: incomingText,
        completionText: replyText,
        caller: Boolean(lead?.godMode) ? 'god_mode' : 'whatsapp'
      });
    } catch (tokErr) {}

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
   * Generador de respuestas dinÃ¡micas, Ã¡giles, coherentes y altamente consultivas
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
        case 'pending': return 'â³ Pendiente de preparaciÃ³n';
        case 'preparing': return 'ðŸ¥© En preparaciÃ³n en carnicerÃ­a';
        case 'ready':
        case 'ready_for_pickup': return 'âœ¨ Â¡Listo y Preparado para retirar / despachar!';
        case 'in_transit': return 'ðŸ›µ En camino con repartidor';
        case 'delivered': return 'âœ… Entregado';
        case 'cancelled': return 'âŒ Cancelado';
        default: return st;
      }
    };

    // =========================================================================
    // 0. GESTIÃ“N INTEGRAL DE PEDIDOS ACTIVOS: MODIFICACIÃ“N, SUCURSAL, PAGO, CANCELACIÃ“N Y ESTADO
    const rawLastAgent = (history || []).slice().reverse().find(m => m.sender === 'bot' || m.sender === 'agent' || m.fromMe)?.content || '';
    const lastAgentMessage = typeof rawLastAgent === 'object' ? (rawLastAgent.text || '') : String(rawLastAgent || '');

    // DetecciÃ³n contextual si el Ãºltimo mensaje fue un menÃº interactivo
    const wasWelcomeMenuOffered = /Opciones r[aÃ¡]pidas:[\s\S]*1ï¸âƒ£.*Ver ofertas|Â¿Por d[oÃ³]nde arrancamos\?/i.test(lastAgentMessage);
    const wasBranchMenuOffered = !wasWelcomeMenuOffered && (/ElegÃ­ la sucursal de retiro|SELECCIÃ“N DE SUCURSAL|1ï¸âƒ£ \*URCA CENTRAL\*|2ï¸âƒ£ \*URCA 2/i.test(lastAgentMessage));
    const wasModMenuOffered = /Â¿QuÃ© te gustarÃ­a modificar de tu pedido|1ï¸âƒ£ Cambiar o sumar cortes/i.test(lastAgentMessage);
    const wasDeliveryTypeOffered = /1ï¸âƒ£ \*?Env[iÃ­]o a Domicilio\*?|1ï¸âƒ£.*Coordinar \*EnvÃ­o a Domicilio\*|Â¿CÃ³mo preferÃ­s recibir tu pedido|Â¿CÃ³mo seguimos con tu pedido\?|Â¿PreferÃ­s que te lo enviemos a domicilio|Â¿Te lo mandamos a tu casa/i.test(lastAgentMessage);
    const wasInTransitChoiceOffered = /1ï¸âƒ£ Cancelar el pedido|Opciones disponibles:[\s\S]*1ï¸âƒ£ Cancelar/i.test(lastAgentMessage);
    const wasDataConfirmOffered = /FICHA DE REGISTRO|Â¿Confirmamos estos datos para agendarte|1ï¸âƒ£ Confirmar datos/i.test(lastAgentMessage);
    const wasActiveOrderHelpOffered = !wasDataConfirmOffered && (
      /Tu pedido \*\*#ORD-.* ya estÃ¡ confirmado|Opciones:\s*\n?1ï¸âƒ£\s*Modificar algÃºn dato o cortes|Â¿PrecisÃ¡s algo de tu pedido\?|TenÃ©s un pedido activo en curso|Â¿QuerÃ©s consultar el estado \/ modificarlo/i.test(lastAgentMessage)
    );
    const wasAsadoProposalOffered = /1ï¸âƒ£\s*[*_]*(?:OpciÃ³n|Milanesas|Bifes|Pastel|Plato|Guiso|Asado)|[*_]*Te\s+arm[eÃ©]\s+3\s+opciones|[*_]*Te\s+propongo\s+3\s+platazos|Â¿Cu[aÃ¡]l de estas opciones te gustar[iÃ­]a|Â¿Con cu[aÃ¡]l opci[oÃ³]n|OpciÃ³n ClÃ¡sica|OpciÃ³n Combo|OpciÃ³n Parrillera/i.test(lastAgentMessage);
    const wasSubstitutionOffered = /no tenemos .* pero te podemos ofrecer|en su reemplazo\?/i.test(lastAgentMessage);
    const wasQuantityPrompt = /Â¿QuÃ© cantidad|Â¿CuÃ¡ntos kilos|Â¿CuÃ¡ntas unidades|Â¿QuÃ© cantidad te preparamos|Â¿CuÃ¡ntas bolsas|Â¿CuÃ¡ntas botellas|Â¿QuÃ© cantidad de combos|Por Unidades:.*Por Kilos/i.test(lastAgentMessage);
    const wasPaymentMethodOffered = /(?:c[oÃ³]mo prefer[iÃ­]s abonar|1ï¸âƒ£\s*\*?Efectivo|2ï¸âƒ£\s*\*?Transferencia|3ï¸âƒ£\s*\*?Mercado Pago|Paso 4 de 4|Decime c[oÃ³]mo prefer[iÃ­]s abonar)/i.test(lastAgentMessage);
    const wasReadyToDispatchQuestion = /(?:lo dejamos listo para despachar|lo dejamos listo|dejamos listo para despachar|Â¿PrecisÃ¡s realizar algÃºn otro cambio)/i.test(lastAgentMessage);
    const wasMenuOffered = !wasAsadoProposalOffered && !wasSubstitutionOffered && !wasQuantityPrompt && !wasPaymentMethodOffered && (/1ï¸âƒ£|2ï¸âƒ£|1\..*Combo|OFERTAS Y CORTES|cortes estrella del dÃ­a|mejores promos/i.test(lastAgentMessage)) &&
      !wasDataConfirmOffered && !wasBranchMenuOffered && !wasModMenuOffered && !wasDeliveryTypeOffered && !wasInTransitChoiceOffered && !wasActiveOrderHelpOffered;

    // 0.00000 ACLARACIÃ“N DE EQUIVOCACIÃ“N O DESACUERDO DEL CLIENTE ("pero yo no te pedÃ­ eso", "no pedÃ­ nada", etc.)
    const isBotCorrectionOrMisunderstanding = /(?:yo\s+no\s+(?:te\s+)?ped[iÃ­]|no\s+(?:te\s+)?ped[iÃ­]\s+eso|no\s+es\s+lo\s+que\s+ped[iÃ­]|no\s+te\s+ped[iÃ­]\s+nada|te\s+equivocaste|no\s+dije\s+eso|yo\s+no\s+dije|no\s+quiero\s+eso|no\s+te\s+encargu[eÃ©]|no\s+compr[eÃ©]\s+nada|no\s+ped[iÃ­]\s+nada|no\s+era\s+eso|pero\s+yo\s+no|yo\s+no\s+pedi)/i.test(t);

    if (isBotCorrectionOrMisunderstanding) {
      if (currentActiveOrder && ['pending', 'preparing', 'draft'].includes(currentActiveOrder.status)) {
        db.updateOrder(currentActiveOrder.id, { status: 'cancelled' });
      }
      if (lead) {
        lead.draftCart = null;
        lead.currentOrder = null;
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { draftCart: null, currentOrder: null });
        }
      }
      return `Â¡TenÃ©s toda la razÃ³n ${clientName}, mil disculpas! ðŸ™ Me adelantÃ© sin querer. Quedate sÃºper tranquilo que no hay ningÃºn pedido agendado ni cobrado, solo te estaba dando ideas de cortes y precios.\n\n` +
        `Contame con calma quÃ© tenÃ­as en mente para cocinar o compartir (Â¿preferÃ­s asado, milanesas, bifes o algÃºn corte en particular?) y lo armamos juntos a tu gusto y sin ningÃºn apuro. ðŸ˜‰ðŸ¥©`;
    }

    // 0.00001 CANCELACIÃ“N GENERAL DE PEDIDO / PROCESO
    const isCancelIntent = /(?:cancelar|cancelo|cancela|cancelame|anular|anula|anulame|no quiero nada|no quiero comprar nada|cancelar el pedido|cancelar mi pedido|cancelo el pedido|ya no quiero el pedido|no voy a querer|no quiero nada gracias)/i.test(t) ||
      (wasDataConfirmOffered && /^(?:3|3ï¸âƒ£|cancelar|cancelo)$/i.test(t.trim())) ||
      (wasInTransitChoiceOffered && /^(?:1|1ï¸âƒ£|cancelar)$/i.test(t.trim()));

    if (isCancelIntent) {
      if (currentActiveOrder) {
        db.updateOrder(currentActiveOrder.id, { status: 'cancelled' });
      }
      if (lead) {
        lead.draftCart = null;
        lead.currentOrder = null;
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { draftCart: null, currentOrder: null });
        }
      }
      return getVariedCancellationMessage(clientName);
    }

    // 0.00005 CONSULTAS DE ESTADO DE PEDIDOS / PENDIENTES / HISTORIAL
    const isOrderQueryEarly = /(?:que|quÃ©|cuales|cuÃ¡les|tengo|hay)\s+(?:mis\s+|el\s+|alg[uÃº]n\s+)?(?:pedidos?|compras?|ordenes?|Ã³rdenes?).*(?:pendiente|activos?|en curso|tengo|hice|anotado|guardado|listo)/i.test(t) ||
      /(?:consultar|ver|estado|seguimiento|donde est[aÃ¡]|dÃ³nde est[aÃ¡]|cuando llega|a que hora llega|como va|mis|mi)\s+(?:de\s+mi\s+|el\s+)?(?:pedidos?|compras?|ordenes?|Ã³rdenes?|env[iÃ­]o|despacho)/i.test(t) ||
      /(?:que|quÃ©)\s+(?:pedidos?\s+tengo|tengo\s+pedid[oa]|te\s+ped[iÃ­]|ped[iÃ­]|tengo\s+pendiente)/i.test(t) ||
      /^(?:mis pedidos|mi pedido|estado del pedido|pedido pendiente|pedidos pendientes|ver pedido|ver orden)$/i.test(t);

    if (isOrderQueryEarly) {
      return ChatStrategyGraphService.handleOrderHistory(lead, clientName);
    }

    // 0.00006 CONSULTAS DIRECTAS DE HORA Y ESTADO DEL MOSTRADOR
    if (/(?:qu[eÃ©]\s+hora\s+es|qu[eÃ©]\s+hora\s+ten[eÃ©]s|hora\s+actual|a\s+qu[eÃ©]\s+hora\s+abren|est[aÃ¡]n\s+abiertos|horarios?|a\s+que\s+hora\s+cierran)/i.test(t)) {
      const now = new Date();
      const currentTimeStr = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Cordoba', hour12: false, hour: '2-digit', minute: '2-digit' });
      return `Â¡Hola ${clientName}! ðŸ‘‹ AcÃ¡ en mostrador son las **${currentTimeStr} hs** y estamos a pleno atendiendo y preparando pedidos.\n\n` +
        `ðŸ¥© Contame: Â¿tenÃ­as ganas de prender el fuego para un asadito o buscÃ¡s cortes para la comida de hoy? Â¡Te dejamos todo listo para entrega en el dÃ­a o retiro por sucursal! ðŸ›µðŸ”ª [[STAGE:proposal]]`;
    }

    // 0.00007 CONSULTAS DIRECTAS DE OFERTAS, COMBOS Y CARTELERA
    if (/(?:ofertas?|promos?|promociones?|lista\s+de\s+ofertas?|qu[eÃ©]\s+ofertas?\s+hay|qu[eÃ©]\s+promos?\s+ten[eÃ©]s|cartelera|pizarra|combos?\s+parrilleros?|combos?)/i.test(t) && !wasBranchMenuOffered && !wasModMenuOffered) {
      const catalogToOffer = getFeaturedWhatsAppOffers(products);
      const formattedCatalog = formatNumberedCatalog(catalogToOffer);
      return `ðŸ”¥ *OFERTAS Y COMBOS DESTACADOS EN REPÃšBLICA DE LA CARNE:* ðŸ¥©\n\n` +
        `${formattedCatalog}\n\n` +
        `ðŸ‘‰ *Â¿Para cuÃ¡ntas personas estÃ¡s calculando o quÃ© cortes te gustarÃ­a que te preparemos?* Te dejamos el combo listo para entrega en el dÃ­a o retiro por sucursal. ðŸ›µðŸ™Œ [[STAGE:proposal]]`;
    }

    // 0.00008 JUNTADAS, COMIDA CON AMIGOS Y PLANES DE ASADO
    if (/(?:comida\s+con\s+(?:unos\s+)?amigos|juntada\s+con\s+amigos|juntada|asado\s+con\s+amigos|reuni[oÃ³]n|hacer\s+un\s+asado|armar\s+un\s+asado|asado\s+para\s+amigos)/i.test(t)) {
      return `Â¡QuÃ© lindo plan ${clientName}! ðŸ¥©ðŸ”¥ La juntada con amigos es sagrada y acÃ¡ en RepÃºblica de la Carne te armamos la combinaciÃ³n perfecta para quedar de diez:\n\n` +
        `ðŸ”¥ *1. Combo Asadazo Parrillero:* Costillar / Tira de asado + VacÃ­o seleccionado + Chorizos criollos + Morcillas bombÃ³n.\n` +
        `ðŸ– *2. Combo Cerdo & Achuras:* Pechito con manta + Matambre tierno de cerdo + Chorizos caseros.\n` +
        `ðŸ¥© *3. Cortes Premium a la Carta:* Ojo de bife, entraÃ±a fresca o matambrito crocante.\n\n` +
        `ðŸ’¡ *CÃ¡lculo parrillero:* Calculamos **500g a 600g por persona** para que coman abundante y no falte nada.\n\n` +
        `ðŸ‘‰ Contame: **Â¿CuÃ¡ntos son en total para la comida?** (ej: 'somos 4', 'somos 6', 'somos 10') y te calculo los kilos exactos y el total para dejÃ¡rtelo listo. ðŸ”ªðŸ›µ [[STAGE:proposal]]`;
    }

    // 0.000085 COMIDA CASERA / COCINAR EN CASA / PLATOS FAMILIARES
    const isHomeCooking = /(?:cocinar\s+(?:algo\s+)?en\s+casa|comida\s+casera|platos?\s+familiares?|no\s+quiero\s+asado|cocinar\s+con\s+mi\s+familia|comida\s+para\s+mi\s+familia|men[uÃº]\s+semanal)/i.test(t);
    if (isHomeCooking) {
      return `Â¡QuÃ© linda idea ${clientName}! ðŸ ðŸ¥˜ Para cocinar en casa y compartir con la familia calculamos **~250g a 300g por persona**. Te propongo 3 platazos caseros espectaculares:\n\n` +
        `1ï¸âƒ£ **Milanesas Caseras:** Nalga tierna o Bola de Lomo cortadas finitas listas para empanar.\n` +
        `2ï¸âƒ£ **Bifes a la Plancha:** Costeletas con hueso o Bife de Chorizo jugoso con papas o ensalada.\n` +
        `3ï¸âƒ£ **Pastel de Papa o Guiso Carrero:** Picada especial magra, Roast Beef o Osobuco tierno de novillito.\n\n` +
        `ðŸ‘‰ Contame cuÃ¡l de estas opciones te gustarÃ­a armar o cuÃ¡ntos kilos te preparamos. Â¡Hacemos envÃ­os directos en el dÃ­a! ðŸ›µðŸ¥© [[STAGE:proposal]]`;
    }

    // 0.00009 CÃLCULO DE COMENSALES ("somos 4", "somos 6", "para 4 personas", etc. sin pedido explÃ­cito de cortes)
    const comensalesMatch = t.match(/(?:somos|para|seremos|calculo|calculamos|vamos\s+a\s+ser)\s+(\d{1,2})\s*(?:personas?|amigos?|comensales?|adultos?)?/) || t.match(/^(\d{1,2})\s*(?:personas?|amigos?|comensales?|adultos?)$/);
    const hasExplicitProductOrder = /(?:kilos?|kg|unidades?|\d+\s*(?:chorizos?|matambre|costilla|vacio|vacÃ­o|bifes?|tira|carbon|carbÃ³n))/i.test(t);
    if (comensalesMatch && !hasExplicitProductOrder && !isHomeCooking) {
      const cantPersonas = parseInt(comensalesMatch[1], 10);
      if (cantPersonas > 0 && cantPersonas <= 50) {
        const kgTotal = ((cantPersonas * 0.55)).toFixed(1);
        const choris = cantPersonas;
        const morcis = Math.max(1, Math.round(cantPersonas / 2));
        const tiraKg = ((cantPersonas * 0.25)).toFixed(1);
        const vacioKg = ((cantPersonas * 0.20)).toFixed(1);

        return `Â¡Espectacular ${clientName}! ðŸ¥©ðŸ”¥ Para **${cantPersonas} personas** el cÃ¡lculo clÃ¡sico para comer abundante y que nadie se quede con las ganas es **~${kgTotal} kg en total**:\n\n` +
          `ðŸ”¥ *La DistribuciÃ³n Parrillera Recomendada:*\n` +
          `1ï¸âƒ£ **La Previa / Achuras:**\n` +
          `   â€¢ ${choris} Chorizos criollos puro cerdo\n` +
          `   â€¢ ${morcis} Morcillas bombÃ³n de la casa\n\n` +
          `2ï¸âƒ£ **El Plato Fuerte:**\n` +
          `   â€¢ ${tiraKg} kg de Costillar / Asado de Tira de novillito\n` +
          `   â€¢ ${vacioKg} kg de VacÃ­o especial tierno\n\n` +
          `3ï¸âƒ£ **AcompaÃ±amiento:**\n` +
          `   â€¢ 1 Bolsa de CarbÃ³n vegetal de primera calidad\n\n` +
          `ðŸ‘‰ Â¿Te gustarÃ­a que te preparemos este combo para entrega a domicilio o retiro por sucursal? ðŸ›µðŸª [[STAGE:proposal]]`;
      }
    }

    // 0.0001 RESPUESTAS AL MENÃš DE BIENVENIDA / OPCIONES RÃPIDAS
    if (wasWelcomeMenuOffered) {
      if (/^(?:1|1ï¸âƒ£|uno|el 1|la 1|opci[oÃ³]n 1|ofertas?|combos?|promos?|ver ofertas|precios?)$/i.test(t.trim())) {
        const catalogToOffer = getFeaturedWhatsAppOffers(products);
        const formattedCatalog = formatNumberedCatalog(catalogToOffer);
        return `ðŸ”¥ *OFERTAS Y CORTES DESTACADOS EN REPÃšBLICA DE LA CARNE:* ðŸ¥©\n\n` +
          `${formattedCatalog}\n\n` +
          `ðŸ‘‰ Decime quÃ© nÃºmero de opciÃ³n o quÃ© cortes te gustarÃ­a que te preparemos, o la cantidad en kilos/unidades. ðŸ¥©ðŸšš [[STAGE:proposal]]`;
      }

      if (/^(?:2|2ï¸âƒ£|dos|el 2|la 2|opci[oÃ³]n 2|asado|asesoramiento|personas?|calcular|calculo)$/i.test(t.trim())) {
        return `ðŸ¥© *ASESORAMIENTO EXPERTO PARA TU ASADO:* ðŸ”¥\n\n` +
          `Para que el asado salga perfecto y no sobre ni falte, calculamos **500g a 600g de carne por persona** (combinando cortes principales y achuras).\n\n` +
          `ðŸ‘‰ *Ejemplo para 6 personas (3.5 kg total):*\n` +
          `â€¢ 1.5 kg VacÃ­o Especial ($17.250)\n` +
          `â€¢ 1.5 kg Costillar / Asado de Tira ($14.700)\n` +
          `â€¢ 6 Chorizos Criollos Puro Cerdo (~0.75 kg - $3.750)\n` +
          `â€¢ 1 Bolsa de CarbÃ³n Quebracho ($2.200)\n\n` +
          `ðŸ‘‰ Contame: **Â¿Para cuÃ¡ntas personas es tu comida?** (ej: 'somos 8', 'somos 12') y te armo la propuesta personalizada con el precio exacto. ðŸ™Œ [[STAGE:proposal]]`;
      }

      if (/^(?:3|3ï¸âƒ£|tres|el 3|la 3|opci[oÃ³]n 3|sucursales|sedes|direcciones|horarios|donde estan)$/i.test(t.trim())) {
        return `ðŸª *NUESTRAS 6 SUCURSALES EN CÃ“RDOBA:* ðŸ¥©\n\n` +
          `1ï¸âƒ£ **URCA CENTRAL:** Av. JosÃ© Roque Funes 1115 (ðŸ“ž +54 9 3513 906947)\n` +
          `   *Lunes a SÃ¡bado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `2ï¸âƒ£ **URCA 2 â€“ ALTO TEJEDA:** Av. MenÃ©ndez Pidal 3575 (ðŸ“ž +54 9 3518 623195)\n` +
          `   *Lunes a SÃ¡bado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `3ï¸âƒ£ **INTERCOUNTRY â€“ CORTEZA MALL:** Av. Los Ãlamos 1015 (ðŸ“ž +54 9 3518 623194)\n` +
          `   *Lunes a Domingo:* 9:00 a 21:00 hs\n\n` +
          `4ï¸âƒ£ **DUARTE QUIRÃ“S:** Av. Duarte QuirÃ³s 5130 (ðŸ“ž +54 9 3518 156595)\n` +
          `   *Lunes a SÃ¡bado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `5ï¸âƒ£ **VILLA ALLENDE â€“ MERCADITO DE LA VILLA:** Av. Figueroa Alcorta 480 (ðŸ“ž +54 9 3513 540031)\n` +
          `   *Lunes a SÃ¡bado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
          `6ï¸âƒ£ **COUNTRY SAN ISIDRO:** Av. Padre Luchesse km 2 (ðŸ“ž +54 9 3518 769099)\n` +
          `   *Lunes a MiÃ©rcoles:* 07:00 a 00:00 hs | *Jueves a SÃ¡bado:* 07:00 a 01:00 hs\n\n` +
          `ðŸ›µ *TambiÃ©n hacemos envÃ­os directos a domicilio en el dÃ­a a todo CÃ³rdoba.* Â¿QuerÃ©s que te preparemos un pedido? ðŸ™Œ [[STAGE:proposal]]`;
      }
    }

    // 0.00012 RESPUESTAS A PROPUESTAS DE SUSTITUCIÃ“N / CORTE SIMILAR
    if (wasSubstitutionOffered) {
      const isAffirmative = /^(?:s[iÃ­]|dale|bueno|perfecto|joya|de diez|si dale|dale si|si quiero|ese me sirve|quiero ese|si por favor|si claro|avanza|anotamelo|anÃ³tamelo|pasame ese|cambiame por ese|si ese|ese est[aÃ¡] bien|me sirve ese|dale pasame|si preparame)$/i.test(cleanConfirmText) ||
        /(?:si quiero|dale si|si dale|pasame ese|quiero ese|cambiame por ese|anotame ese|anÃ³tame ese|prepÃ¡rame ese|preparame ese)/i.test(t);
      const isNegative = /^(?:no|no gracias|no dej[aÃ¡]|no deja|dejalo as[iÃ­]|no por ahora|paso|ninguno|no ese no|solo lo otro|dejame solo lo otro|no, solo lo otro)$/i.test(cleanConfirmText);
      const hasQtyExplicit = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?)|medio\s+kilo|1\/2\s*kg)/i.test(t);

      if (isAffirmative || hasQtyExplicit) {
        // Encontrar el producto que se ofreciÃ³ como sustituto en lastAgentMessage
        const offeredProd = matchBestProduct(lastAgentMessage, products);
        if (offeredProd) {
          let parsedQty = parseQuantityAndMode(rawText, offeredProd);
          // Si el usuario dijo solo "sÃ­" sin nÃºmero, buscar si en el mensaje anterior del usuario o en lastAgentMessage habÃ­a una cantidad propuesta
          if ((!parsedQty.quantity || parsedQty.quantity === 1) && !/(?:\d|medio)/.test(t)) {
            const rawUserPrev = (history || []).slice().reverse().find(m => m.sender === 'user')?.content || '';
            const prevUserQty = parseQuantityAndMode(rawUserPrev, offeredProd);
            if (prevUserQty && prevUserQty.quantity > 0) {
              parsedQty = prevUserQty;
            }
          }

          let finalItems = [], finalTotal = 0, finalProducts = [];
          if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
            const modRes = applyItemModificationToOrder(currentActiveOrder, `agrega ${parsedQty.quantity} ${parsedQty.isUnitMode ? `${parsedQty.unitCount} unidades de` : (offeredProd.unit || 'kg')} ${offeredProd.name}`, products, lead);
            finalItems = modRes.items;
            finalTotal = modRes.total;
            finalProducts = modRes.products;
            db.updateOrder(currentActiveOrder.id, {
              items: finalItems,
              products: finalProducts,
              totalAmount: finalTotal > 0 ? finalTotal : currentActiveOrder.totalAmount
            });
          } else {
            const extRes = extractItemsFromHistoryAndText(history, `agrega ${parsedQty.quantity} ${parsedQty.isUnitMode ? `${parsedQty.unitCount} unidades de` : (offeredProd.unit || 'kg')} ${offeredProd.name}`, products, lead);
            finalItems = extRes.items;
            finalTotal = extRes.total;
            finalProducts = extRes.products;
            if (finalItems.length > 0) {
              currentActiveOrder = db.createOrder({
                jid: lead.jid || lead.id,
                customerName: clientName,
                phone: lead.phone || (lead.jid ? `+${lead.jid.split('@')[0]}` : ''),
                items: finalItems,
                products: finalProducts,
                totalAmount: finalTotal,
                status: 'pending',
                source: 'whatsapp',
                deliveryType: lead.deliveryType || 'pickup',
                address: lead.address || '',
                branch: lead.preferredBranch || ''
              });
            }
          }

          const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';
          const formattedTotal = `$${Number(finalTotal > 0 ? finalTotal : (currentActiveOrder?.totalAmount || 0)).toLocaleString('es-AR')}`;

          return `Â¡De diez ${clientName}! ðŸ¥© Sumamos *${offeredProd.name}* a tu pedido:\n\n` +
            `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte)${orderNotice}:*\n` +
            `${finalItems.join('\n')}\n\n` +
            `ðŸ’° *Subtotal acumulado:* **${formattedTotal}**\n` +
            `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
            `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
            `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
            `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
            `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (chorizos, carbÃ³n, vino) ðŸ¥©\n\n` +
            `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ [[STAGE:proposal]]`;
        }
      } else if (isNegative) {
        const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
        if (historyItems.length > 0) {
          const formattedTotal = `$${Number(historyTotal).toLocaleString('es-AR')}`;
          return `Â¡Entendido ${clientName}! ðŸ‘ Mantenemos tu pedido con los cortes seleccionados:\n\n` +
            `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n` +
            `${historyItems.join('\n')}\n\n` +
            `ðŸ’° *Subtotal acumulado:* **${formattedTotal}**\n` +
            `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
            `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
            `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
            `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
            `3ï¸âƒ£ Sumar otros cortes o complementos ðŸ¥©\n\n` +
            `ðŸ‘‰ *RespondÃ© 1, 2 o 3.* ðŸ™Œ [[STAGE:proposal]]`;
        }
        return `Â¡De diez ${clientName}! Â¿QuÃ© otro corte te gustarÃ­a que te preparemos o consultamos del catÃ¡logo? ðŸ¥©`;
      }
    }

    // 0.00013 RESPUESTAS DIRECTAS A CONSULTAS DE CANTIDAD O PESO DE UN PRODUCTO
    if (wasQuantityPrompt) {
      const hasQtyInText = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\b)/i.test(t);
      if (hasQtyInText && !/(?:cancelar|anular|estado|donde est[aÃ¡]|dÃ³nde est[aÃ¡]|cambiar sucursal)/i.test(t)) {
        const targetProd = matchBestProduct(lastAgentMessage, products);
        if (targetProd) {
          const parsedQty = parseQuantityAndMode(rawText, targetProd);
          let finalItems = [], finalTotal = 0, finalProducts = [];

          if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
            const modRes = applyItemModificationToOrder(currentActiveOrder, `${parsedQty.quantity} ${parsedQty.isUnitMode ? `${parsedQty.unitCount} unidades de` : (targetProd.unit || 'kg')} ${targetProd.name}`, products, lead);
            finalItems = modRes.items;
            finalTotal = modRes.total;
            finalProducts = modRes.products;
            db.updateOrder(currentActiveOrder.id, {
              items: finalItems,
              products: finalProducts,
              totalAmount: finalTotal > 0 ? finalTotal : currentActiveOrder.totalAmount
            });
          } else {
            const extRes = extractItemsFromHistoryAndText(history, `${parsedQty.quantity} ${parsedQty.isUnitMode ? `${parsedQty.unitCount} unidades de` : (targetProd.unit || 'kg')} ${targetProd.name}`, products, lead);
            finalItems = extRes.items;
            finalTotal = extRes.total;
            finalProducts = extRes.products;
            if (finalItems.length > 0) {
              currentActiveOrder = db.createOrder({
                jid: lead.jid || lead.id,
                customerName: clientName,
                phone: lead.phone || (lead.jid ? `+${lead.jid.split('@')[0]}` : ''),
                items: finalItems,
                products: finalProducts,
                totalAmount: finalTotal,
                status: 'pending',
                source: 'whatsapp',
                deliveryType: lead.deliveryType || 'pickup',
                address: lead.address || '',
                branch: lead.preferredBranch || ''
              });
            }
          }

          const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';
          const formattedTotal = `$${Number(finalTotal > 0 ? finalTotal : (currentActiveOrder?.totalAmount || 0)).toLocaleString('es-AR')}`;

          return `Â¡Anotado ${clientName}! ðŸ¥© Actualizamos tu pedido:\n\n` +
            `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte)${orderNotice}:*\n` +
            `${finalItems.join('\n')}\n\n` +
            `ðŸ’° *Subtotal acumulado:* **${formattedTotal}**\n` +
            `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
            `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
            `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
            `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
            `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (chorizos, carbÃ³n, vino) ðŸ¥©\n\n` +
            `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ [[STAGE:proposal]]`;
        }
      }
    }

    // 0.00014 DETECCIÃ“N DE PRODUCTO SOLICITADO NO DISPONIBLE O FUERA DE CATÃLOGO + SUGERENCIA DE REEMPLAZO SIMILAR
    const outOfCatalogCuts = [
      { pattern: /\b(?:ojo de bife|bife ancho|t-bone|tbone|ribeye|bife angosto)\b/i, name: 'Ojo de Bife / Ribeye' },
      { pattern: /\b(?:picanha|picaÃ±a)\b/i, name: 'Picanha' },
      { pattern: /\b(?:asado con cuero|pecho)\b/i, name: 'Asado con Cuero' },
      { pattern: /\b(?:garrÃ³n)\b/i, name: 'GarrÃ³n' },
      { pattern: /\b(?:chunchullo)\b/i, name: 'Chunchullo' }
    ];

    const requestedUnavailable = outOfCatalogCuts.find(c => c.pattern.test(t) && !products.some(p => c.pattern.test(p.name) && p.price > 0));
    const isExplicitCutsOrOrderAsk = /(?:ten[eÃ©]s|vendes|vend[eÃ©]s|hay|quiero|mandame|mandÃ¡melo|traeme|armame|separame|preparame|cuanto|precio|sale|cuesta|kilos?|kg)\b/i.test(t) || requestedUnavailable;

    if (requestedUnavailable && isExplicitCutsOrOrderAsk && !wasAsadoProposalOffered && !wasSubstitutionOffered) {
      const similarProd = findSimilarProductOrAlternative(t, products);
      if (similarProd) {
        const hasQty = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?)|medio\s+kilo|1\/2\s*kg)/i.test(t);
        const qtyMatch = t.match(/(\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?)|medio\s+kilo|1\/2\s*kg)/i);
        const qtyText = qtyMatch ? qtyMatch[1] : '';

        return `Â¡Hola ${clientName}! ðŸ¥© DisculpÃ¡, en este momento no tenemos **${requestedUnavailable.name}**, pero te podemos ofrecer **${similarProd.name}** a **$${Number(similarProd.price).toLocaleString('es-AR')}/${similarProd.unit || 'kg'}** que estÃ¡ excelente y reciÃ©n ingresado de cÃ¡mara.\n\n` +
          `ðŸ‘‰ *Â¿Te gustarÃ­a llevar ${similarProd.name} en su reemplazo?* ${hasQty ? `Â¿Te preparamos los **${qtyText}**?` : 'Contame quÃ© cantidad te preparamos (kilos o unidades) y te lo sumo a tu pedido.'} ðŸ™Œ [[STAGE:proposal]]`;
      }
    }

    // 0.00015 ASESORAMIENTO CULINARIO Y CÃLCULO DE ASADO POR COMENSALES
    const peopleMatchEarly = t.match(/(?:para|somos|comemos|seremos|seriamos|calculale|asadito\s+para|asado\s+para|un\s+asado\s+para|un\s+asadito\s+para)\s+(?:unos\s+|unas\s+)?(\d{1,3})\s*(?:personas?|comensales|amigos|invitados|familiares|bocas|peronas)?/i) ||
      t.match(/(\d{1,3})\s*(?:personas|comensales|invitados|amigos|peronas)/i);
    const isAsadoIntentEarly = /(?:asado|asadito|asadaso|asadazo|parrilla|parrillada|parrillita|fuego|brasas)/i.test(t);
    const isCulinaryQueryEarly = /(?:recomendas|recomendÃ¡s|para guiso|para estofado|para milanesas|para horno)/i.test(t);

    const isAsadoCalcRequestEarly = (peopleMatchEarly && isAsadoIntentEarly) || 
      (peopleMatchEarly && /(?:cuanto|cuÃ¡nto|calculo|calcular|para comer|para hacer|somos|es para)/i.test(t)) ||
      /^(?:un\s+)?asadito\s+para\s+\d+/i.test(t) ||
      isCulinaryQueryEarly;

    const hasSpecificCutsWithQtyEarly = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b(?:una|un|dos|tres|cuatro|cinco|seis)\s+bolsas?)\s+(?:de\s+)?(?:costillar|costilla|vacio|vacÃ­o|matambre|chorizo|chori|morcilla|milanesa|cuadril|tapa|lomo|bife|molida|pollo|carbon|carbÃ³n|cerdo|novillito)/i.test(t) ||
      (/(?:quiero|dame|mandame|anotame|separame|preparame)\s+(?:\d+|medio|un|una)\s*(?:kg|kilo|unidades?|bolsa|botella|paquete|tira|bife|de)/i.test(t) && /(?:costilla|matambre|chorizo|vacio|carbon|cuadril|milanesa|bife)/i.test(t));

    if (isAsadoCalcRequestEarly && !hasSpecificCutsWithQtyEarly) {
      const advice = ChatStrategyGraphService.handleCulinaryAndAsado(rawText, clientName, products);
      if (advice) return advice;
    }

    // 0.0002 RESPUESTAS A PROPUESTAS DE ASADO / MENÃšS RECOMENDADOS (OpciÃ³n 1, 2 o 3)
    if (wasAsadoProposalOffered) {
      let selectedOptNum = null;
      let modificationText = '';

      // 1. Validar que NO sea una cantidad de producto (ej: "1 kilo...", "1 kg...", "2 bolsas...", "1 de matambre...", "1 tira...")
      const isProductQuantityDictation = /^(?:quiero\s+|dame\s+|anotame\s+|separame\s+)?([1-3]|uno|dos|tres)\s*(?:kilos?|kg|k\b|bolsas?|botellas?|paquetes?|combos?|tiras?|bifes?|unidades?|un\b|de\s+[a-zÃ±Ã¡Ã©Ã­Ã³Ãº]+|[a-zÃ±Ã¡Ã©Ã­Ã³Ãº]+\s+de\s+[a-zÃ±Ã¡Ã©Ã­Ã³Ãº]+)/i.test(t);
      const isDirectOptionChoice = !isProductQuantityDictation && (
        /^(?:[1-3]|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|uno|dos|tres)$/i.test(t.trim()) ||
        /^(?:opci[oÃ³]n|la|el|elijo\s+la|voy\s+con\s+la|me\s+quedo\s+con\s+la|la\s+opci[oÃ³]n)\s*([1-3]|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|uno|dos|tres)\b/i.test(t.trim()) ||
        /^(?:quiero\s+la|dame\s+la)\s+(?:opci[oÃ³]n\s*)?([1-3]|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|uno|dos|tres)\b/i.test(t.trim()) ||
        /(?:opci[oÃ³]n\s+(?:cl[aÃ¡]sica|combo|asadazo|gourmet)|la\s+cl[aÃ¡]sica|el\s+combo|la\s+gourmet)/i.test(t)
      );

      const optLeadMatch = isDirectOptionChoice ? t.match(/^(?:era\s+(?:la\s+)?)?(?:opci[oÃ³]n\s*|la\s+|el\s+|elegimos\s+|voy\s+con\s+|me\s+quedo\s+con\s+|dame\s+(?:la\s+)?|quiero\s+la\s*)?([1-3]|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|uno|dos|tres)\b(.*)$/i) : null;
      const namedOptMatch = isDirectOptionChoice ? t.match(/(?:clasica|clÃ¡sica|combo|asadazo|gourmet)/i) : null;

      if (optLeadMatch) {
        const rawNum = optLeadMatch[1].toLowerCase();
        if (rawNum === '1' || rawNum === 'uno' || rawNum === '1ï¸âƒ£') selectedOptNum = 1;
        else if (rawNum === '2' || rawNum === 'dos' || rawNum === '2ï¸âƒ£') selectedOptNum = 2;
        else if (rawNum === '3' || rawNum === 'tres' || rawNum === '3ï¸âƒ£') selectedOptNum = 3;

        const restText = (optLeadMatch[2] || '').trim();
        if (restText && /(?:pero|con|mas|mÃ¡s|y\s+|sumale|agregale|cambiame|sacale|sin|en\s+vez\s+de|suma|agrega|ponele|\+)/i.test(restText)) {
          modificationText = restText.replace(/^(?:pero|y|\+)\s+/i, '').trim();
        }
      } else if (namedOptMatch) {
        if (/clasica|clÃ¡sica/i.test(namedOptMatch[0])) selectedOptNum = 1;
        else if (/combo|asadazo/i.test(namedOptMatch[0])) selectedOptNum = 2;
        else if (/gourmet/i.test(namedOptMatch[0])) selectedOptNum = 3;
      }

      if (selectedOptNum !== null) {
        const optNum = selectedOptNum;
        const parsedOpt = parseAsadoOptionFromMessage(lastAgentMessage, optNum, products);
        
        let optionTitle = optNum === 1 ? 'OpciÃ³n 1 (ClÃ¡sica Equilibrada)' : optNum === 2 ? 'OpciÃ³n 2 (Combo Asadazo + Agregados)' : 'OpciÃ³n 3 (Parrillera Gourmet)';
        let optionItems = [];
        let optionTotal = 0;

        if (parsedOpt && parsedOpt.items.length > 0) {
          optionTitle = parsedOpt.title || optionTitle;
          optionItems = parsedOpt.items;
          optionTotal = parsedOpt.total;
        } else {
          // Fallback con cÃ¡lculos coherentes
          if (optNum === 1) {
            optionItems = [
              'â€¢ 2 kg VacÃ­o Especial Seleccionado â€” $23.000',
              'â€¢ 1 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) â€” $5.000'
            ];
            optionTotal = 28000;
          } else if (optNum === 2) {
            optionItems = ['â€¢ 1 combo Combo â€œAsadazoâ€ (4 kg cortes + Vino de regalo) â€” $39.999'];
            optionTotal = 39999;
          } else {
            optionItems = [
              'â€¢ 1 kg Tapa de Cuadril Seleccionada â€” $26.407',
              'â€¢ 1 kg Matambre Vacuno â€” $9.500',
              'â€¢ 1 kg Chorizo Criollo Puro Cerdo â€” $5.000'
            ];
            optionTotal = 40907;
          }
        }

        let finalProducts = parseProductsFromItems(optionItems, products);
        let finalItems = [...optionItems];
        let finalTotal = optionTotal;

        // Si el cliente solicitÃ³ modificaciones adicionales sobre la opciÃ³n elegida (ej: "pero con 2 kilos de chorizo de cerdo")
        if (modificationText) {
          const modRes = applyItemModificationToOrder({ items: finalItems, products: finalProducts }, modificationText, products, lead);
          if (modRes && modRes.items && modRes.items.length > 0) {
            finalItems = modRes.items;
            finalProducts = modRes.products;
            finalTotal = modRes.total > 0 ? modRes.total : finalTotal;
          }
        }

        // Crear o actualizar pedido en la base de datos
        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          db.updateOrder(currentActiveOrder.id, {
            items: finalItems,
            products: finalProducts,
            totalAmount: finalTotal,
            notes: (currentActiveOrder.notes ? currentActiveOrder.notes + '\n' : '') + `[Elegida ${optionTitle}${modificationText ? ` con modificaciÃ³n: "${modificationText}"` : ''}]`
          });
        } else {
          currentActiveOrder = db.createOrder({
            jid: lead.jid || lead.id,
            phone: lead.phone || '',
            customerName: clientName,
            items: finalItems,
            products: finalProducts,
            totalAmount: finalTotal,
            channel: 'WHATSAPP',
            source: 'WHATSAPP',
            origin: 'WHATSAPP',
            notes: `[Elegida ${optionTitle}${modificationText ? ` con modificaciÃ³n: "${modificationText}"` : ''}]`
          });
        }

        const itemsDisplay = finalItems.join('\n');
        const modNotice = modificationText ? ' con tu modificaciÃ³n' : '';
        return `Â¡De diez ${clientName}! ðŸ¥© Ya tengo anotada la **${optionTitle}**${modNotice}:\n\n` +
          `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n` +
          `${itemsDisplay}\n\n` +
          `ðŸ’° *Total estimado:* **$${Number(finalTotal).toLocaleString('es-AR')}**\n` +
          `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
          `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
          `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
          `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
          `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (carbÃ³n, vino) ðŸ¥©\n\n` +
          `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ [[STAGE:proposal]]`;
      }
    }

    // 0.00022 RESPUESTAS A SELECCIÃ“N DE OPCIONES DE DESAMBIGUACIÃ“N Y CATÃLOGO
    const wasAmbiguousOffered = /En mostrador tenemos varias opciones de|Â¿CuÃ¡l de estas opciones preferÃ­s que te preparemos y cuÃ¡ntos kilos o unidades/i.test(lastAgentMessage);
    const isRemovalOrReplacement = /(?:sac[aÃ¡]|quit[aÃ¡]|sin\s+|elimin[aÃ¡]|borr[aÃ¡]|cambi[aÃ¡]|reemplaz[aÃ¡]|en\s+vez\s+de)/i.test(t);
    const wasMenuOrAmbiguousOffered = (wasAmbiguousOffered || (wasMenuOffered && !wasWelcomeMenuOffered)) && !isRemovalOrReplacement;
    if (wasMenuOrAmbiguousOffered) {
      const isOptionNum = /^(?:[1-9]|1[0-9]|20|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|7ï¸âƒ£|8ï¸âƒ£|9ï¸âƒ£|ðŸ”Ÿ|la\s+[1-9]|el\s+[1-9]|opci[oÃ³]n\s+[1-9])$/i.test(cleanConfirmText);
      const isNamedOption = /(?:chorizo|chori|cuadril|matambre|milanesa|costilla|colorado|cheddar|criollo|dubai|tapa|colita|vacio|vacÃ­o|asado|bife|entraÃ±a|molida|pollo|carbon|carbÃ³n|vino)/i.test(t);

      if (isOptionNum || isNamedOption) {
        const hasExplicitQty = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|tiras?|piezas?|combos?|bolsas?|botellas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b\d+\s+(?:de\s+)?(?:kilos?|kg|unidades?))/i.test(t) && !isOptionNum;

        // Extraer los productos listados en lastAgentMessage
        let displayedList = [];
        const lines = lastAgentMessage.split('\n');
        for (const line of lines) {
          if (/[1-9]ï¸âƒ£|\[\d+\]/.test(line)) {
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

        // Si el cliente seleccionÃ³ la opciÃ³n pero NO especificÃ³ cantidad (ej: dijo solo "7", "1", "el 3" o "matambre")
        if (chosenProduct && !hasExplicitQty && !/combo asadazo/i.test(chosenProduct.name || '') && !isRemovalOrReplacement) {
          return formatProductQuantityPrompt(chosenProduct, clientName);
        }

        let updatedItems = [], updatedTotal = 0, updatedProducts = [];
        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          const modRes = applyItemModificationToOrder(currentActiveOrder, rawText, products, lead);
          updatedItems = modRes.items;
          updatedTotal = modRes.total;
          updatedProducts = modRes.products;
          db.updateOrder(currentActiveOrder.id, {
            items: updatedItems,
            products: updatedProducts,
            totalAmount: updatedTotal > 0 ? updatedTotal : currentActiveOrder.totalAmount
          });
        } else {
          const extRes = extractItemsFromHistoryAndText(history, rawText, products, lead);
          updatedItems = extRes.items;
          updatedTotal = extRes.total;
          updatedProducts = extRes.products;
          if (updatedItems.length > 0) {
            const newOrder = db.createOrder({
              jid: lead.jid || lead.id,
              customerName: clientName,
              phone: lead.phone || (lead.jid ? `+${lead.jid.split('@')[0]}` : ''),
              items: updatedItems,
              products: updatedProducts,
              totalAmount: updatedTotal,
              status: 'pending',
              source: 'whatsapp',
              deliveryType: lead.deliveryType || 'pickup',
              address: lead.address || '',
              branch: lead.preferredBranch || ''
            });
            currentActiveOrder = newOrder;
          }
        }

        if (updatedItems.length > 0) {
          const formattedTotal = `$${updatedTotal.toLocaleString('es-AR')}`;
          const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';

          return `Â¡Espectacular ${clientName}! ðŸ¥© Dejamos anotada tu elecciÃ³n:\n\n` +
            `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte)${orderNotice}:*\n` +
            `${updatedItems.join('\n')}\n\n` +
            `ðŸ’° *Subtotal acumulado:* *${formattedTotal}*\n` +
            `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
            `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
            `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
            `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
            `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (carbÃ³n, vino) ðŸ¥©\n\n` +
            `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ [[STAGE:proposal]]`;
        }
      }
    }

    // 0.00025 RESPUESTAS AL MENÃš DE MÃ‰TODOS DE PAGO (1 Efectivo, 2 Transferencia, 3 Mercado Pago)
    if (wasPaymentMethodOffered) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const amount = (targetOrder && targetOrder.totalAmount > 0) ? targetOrder.totalAmount : (historyTotal > 0 ? historyTotal : 39999);
      const orderId = targetOrder ? targetOrder.id : `ORD-${Date.now().toString().slice(-4)}`;
      const isDelivery = targetOrder?.deliveryType === 'delivery' || lead?.deliveryType === 'delivery' || Boolean(targetOrder?.address && !targetOrder?.branch);
      const isPickup = !isDelivery && (targetOrder?.deliveryType === 'pickup' || lead?.deliveryType === 'pickup' || Boolean(targetOrder?.branch));
      const branchName = targetOrder?.branch || lead?.preferredBranch || 'Urca Central (Av. JosÃ© Roque Funes 1115)';
      const destAddr = targetOrder?.address || lead?.address || 'tu domicilio';
      const destLocation = isPickup 
        ? `al retirar por la sucursal **${branchName}**`
        : `a tu domicilio en **${destAddr}** en el dÃ­a (dentro de las 24 hs)`;

      const deliveryCalc = db.calculateDeliverySlotAndCost({
        orderDate: new Date(),
        deliveryType: isPickup ? 'pickup' : 'delivery',
        subtotal: amount
      });

      const isMissingAddress = isDelivery && (!destAddr || destAddr === 'tu domicilio' || destAddr.length < 4 || isGarbageAddress(destAddr));

      if (/^(?:1|1ï¸âƒ£|uno|el 1|la 1|opci[oÃ³]n 1|efectivo|cash|al repartidor|contraentrega)$/i.test(t.trim())) {
        if (targetOrder) {
          db.updateOrder(targetOrder.id, { 
            paymentMethod: isPickup ? 'Efectivo en sucursal' : 'Efectivo al repartidor', 
            status: isMissingAddress ? 'pending' : 'preparing',
            deliveryType: isPickup ? 'pickup' : 'delivery',
            deliverySlot: deliveryCalc.suggestedSlotId,
            deliverySlotName: deliveryCalc.suggestedSlotName,
            estimatedDelivery: deliveryCalc.estimatedDeliveryLabel,
            shippingCost: deliveryCalc.shippingCost,
            isFreeShipping: deliveryCalc.isFreeShipping,
            ...(isPickup ? { branch: branchName } : { branch: '', address: destAddr })
          });
        }

        if (isMissingAddress) {
          return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥©ðŸ’µ Marcamos tu pedido **#${orderId}** como **Efectivo al repartidor** (Total: **$${Number(amount).toLocaleString('es-AR')}**).\n\n` +
            `ðŸ“ *Paso obligatorio:* Para asignarte el repartidor y coordinar la entrega (${deliveryCalc.estimatedDeliveryLabel}), por favor pasame tu **Calle, Altura/NÃºmero y Barrio**. ðŸ™Œ [[STAGE:confirming_data]]`;
        }

        if (isPickup) {
          return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥©ðŸ’µ Marcamos tu pedido **#${orderId}** como **Efectivo en sucursal** (Total: **$${Number(amount).toLocaleString('es-AR')}**).\n\n` +
            `ðŸ“ Te esperamos al retirar por la sucursal **${branchName}** (${deliveryCalc.businessHours?.open || '08:00'} a ${deliveryCalc.businessHours?.close || '20:00'} hs). Â¡Ya estÃ¡ en marcha la preparaciÃ³n de tus cortes en carnicerÃ­a! ðŸ™Œ [[STAGE:closed_won]]`;
        } else {
          return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥©ðŸ’µ Marcamos tu pedido **#${orderId}** como **Efectivo al repartidor** (Total: **$${Number(amount).toLocaleString('es-AR')}**).\n\n` +
            `ðŸ›µ *Entrega programada:* **${deliveryCalc.estimatedDeliveryLabel}** hacia **${destAddr}**.\n` +
            `Â¡PodÃ©s abonar en efectivo directo al repartidor al recibir tu pedido! ðŸ™Œ [[STAGE:closed_won]]`;
        }
      }

      if (/^(?:2|2ï¸âƒ£|dos|el 2|la 2|opci[oÃ³]n 2|transferencia|transferir|alias|banco|cbu)$/i.test(t.trim())) {
        if (targetOrder) {
          db.updateOrder(targetOrder.id, { 
            paymentMethod: 'Transferencia Bancaria', 
            status: 'pending',
            deliverySlot: deliveryCalc.suggestedSlotId,
            deliverySlotName: deliveryCalc.suggestedSlotName,
            estimatedDelivery: deliveryCalc.estimatedDeliveryLabel,
            shippingCost: deliveryCalc.shippingCost,
            isFreeShipping: deliveryCalc.isFreeShipping
          });
        }

        if (isMissingAddress) {
          return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥©ðŸ¦ Para abonar tu pedido **#${orderId}** por **Transferencia Bancaria**:\n\n` +
            `ðŸ“± *Alias Mercado Pago / Bancario:* \`republica.carne.mp\`\n` +
            `ðŸ’° *Monto exacto:* **$${Number(amount).toLocaleString('es-AR')}**\n\n` +
            `ðŸ“ *Paso obligatorio:* Para coordinar el envÃ­o (${deliveryCalc.estimatedDeliveryLabel}), por favor pasame tambiÃ©n tu **Calle, Altura/NÃºmero y Barrio**. ðŸ™Œ [[STAGE:confirming_data]]`;
        }

        return `Â¡Excelente elecciÃ³n ${clientName}! ðŸ¥©ðŸ¦ Para abonar tu pedido **#${orderId}** por **Transferencia Bancaria**:\n\n` +
          `ðŸ“± *Alias Mercado Pago / Bancario:* \`republica.carne.mp\`\n` +
          `ðŸ’° *Monto exacto:* **$${Number(amount).toLocaleString('es-AR')}**\n` +
          `â° *Entrega:* ${deliveryCalc.estimatedDeliveryLabel}\n\n` +
          `ðŸ‘‰ En cuanto hagas la transferencia, pasame el comprobante o avisame por acÃ¡ y lo despachamos al instante ${destLocation}. ðŸ™Œ [[STAGE:closed_won]]`;
      }

      if (/^(?:3|3ï¸âƒ£|tres|el 3|la 3|opci[oÃ³]n 3|mp|mercado|mercado pago|mercadopago|link|tarjeta|tarjetas)$/i.test(t.trim())) {
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
          db.updateOrder(targetOrder.id, { 
            paymentMethod: 'Mercado Pago (Checkout Pro)', 
            paymentLink: dynamicLink,
            deliverySlot: deliveryCalc.suggestedSlotId,
            deliverySlotName: deliveryCalc.suggestedSlotName,
            estimatedDelivery: deliveryCalc.estimatedDeliveryLabel,
            shippingCost: deliveryCalc.shippingCost,
            isFreeShipping: deliveryCalc.isFreeShipping
          });
        }

        const modeTag = creds.isSandbox ? '\nðŸ§ª *[MODO PRUEBAS - SANDBOX]*' : '';
        const addressReminder = isMissingAddress ? `\n\nðŸ“ *RecordÃ¡ indicarnos tu Calle, Altura y Barrio para la entrega.*` : '';
        return `ðŸ’³ *[MERCADO PAGO CHECKOUT OFICIAL]*\nÂ¡De diez ${clientName}! ðŸ¥©ðŸ’³ AcÃ¡ tenÃ©s el link de pago oficial y seguro para tu pedido **#${orderId}** por **$${Number(amount).toLocaleString('es-AR')}**:${modeTag}\n\n` +
          `1ï¸âƒ£ **Link de Pago Directo:**\nðŸ”— ${dynamicLink}\n\n` +
          `2ï¸âƒ£ **Transferencia / Dinero en cuenta:**\nðŸ“± *Alias Mercado Pago:* \`republica.carne.mp\`\n\n` +
          `â° *Entrega:* ${deliveryCalc.estimatedDeliveryLabel}\n` +
          `PodÃ©s abonar con Dinero en cuenta, DÃ©bito, CrÃ©dito o Transferencia. En cuanto se acredite, Â¡comenzamos el despacho hacia **${destAddr}**! ðŸ™Œ${addressReminder} [[STAGE:closed_won]]`;
      }
    }

    // 0.00028 RESPUESTAS DE CONFORMIDAD / "LISTO PARA DESPACHAR" / "ESTÃ BIEN ASÃ"
    const isReadyAffirmation = /^(?:listo|dejalo listo|listo para despachar|as[iÃ­] est[aÃ¡] bien|est[aÃ¡] bien as[iÃ­]|no,? est[aÃ¡] bien|no,? est[aÃ¡] bien as[iÃ­]|todo listo|dejalo as[iÃ­]|nada m[aÃ¡]s|no nada m[aÃ¡]s|todo perfecto|as[iÃ­] nom[aÃ¡]s|de diez as[iÃ­]|est[aÃ¡] perfecto|no gracias|no por ahora|dale listo|si listo|s[iÃ­] listo|as[iÃ­] esta de diez|para despachar|bien as[iÃ­]|no as[iÃ­] est[aÃ¡] bien)$/i.test(cleanConfirmText);

    if (isReadyAffirmation) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      if (targetOrder) {
        const hasPaymentChosen = targetOrder.paymentMethod && !targetOrder.paymentMethod.includes('Pendiente') && targetOrder.paymentMethod !== 'Efectivo / Transferencia / Mercado Pago';
        const destAddr = targetOrder.address || lead.address || targetOrder.branch || 'tu domicilio';

        if (hasPaymentChosen || targetOrder.status === 'in_transit' || targetOrder.status === 'preparing') {
          return `Â¡De diez ${clientName}! ðŸ™Œ Queda todo confirmado con tu pedido **#${targetOrder.id}** tal como estÃ¡. Te avisamos en cuanto el repartidor estÃ© en viaje hacia **${destAddr}**. Â¡Muchas gracias por elegirnos! ðŸ¥©ðŸšš [[STAGE:closed_won]]`;
        }

        const totalFormatted = `$${Number(targetOrder.totalAmount).toLocaleString('es-AR')}`;
        return `Â¡De diez ${clientName}! ðŸ¥©ðŸšš Tu pedido **#${targetOrder.id}** por **${totalFormatted}** queda listo para despacho en el dÃ­a a **${destAddr}**.\n\n` +
          `ðŸ‘‰ *Para finalizar, Â¿cÃ³mo preferÃ­s abonar?*\n` +
          `1ï¸âƒ£ *Efectivo* (al repartidor o en sucursal)\n` +
          `2ï¸âƒ£ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
          `3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
          `ðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ™Œ [[STAGE:confirming_data]]`;
      }
    }

    // 0.0003 CORRECCIÃ“N / RECLAMO DE PEDIDO INCORRECTO POR PARTE DEL CLIENTE ("estÃ¡ mal", "te equivocaste", etc.)
    const isOrderCorrectionComplaint = /est[aÃ¡]\s+mal(?:\s+el\s+ped)?|no\s+es\s+lo\s+que\s+ped[iÃ­]|te\s+equivocaste|eso\s+no\s+es|est[aÃ¡]\s+equivocado|se\s+equivoco|no\s+ped[iÃ­]\s+eso|no\s+quiero\s+eso|corregilo|corrijanlo|nada\s+que\s+ver|no\s+es\s+ese\s+el\s+ped/i.test(t);

    if (isOrderCorrectionComplaint) {
      // Registrar aprendizaje en la Red Neuronal y base de datos
      NeuralMemoryService.recordLearningInsight({
        jid: lead.jid || lead.id,
        clientName,
        mistakeType: 'CorrecciÃ³n de Pedido por Cliente',
        clientFeedback: rawText,
        context: lastAgentMessage,
        learningRule: `Al recibir queja o correcciÃ³n de ${clientName}, limpiar carrito y confirmar cortes exactos solicitados.`
      });

      return `Â¡Mil disculpas ${clientName}! ðŸ¥© TenÃ©s toda la razÃ³n, disculpame la confusiÃ³n.\n\n` +
        `Contame por favor con exactitud: **Â¿quÃ© cortes o combo te gustarÃ­a que te preparemos y cuÃ¡ntos kilos o unidades?** Te lo armo al instante, limpio y exactamente como querÃ©s. ðŸ™Œ [[STAGE:discovery]]`;
    }

    // Consulta general de sucursales, horarios o ubicaciones
    const isGeneralBranchQuery = /(?:nuestras\s+)?(?:6\s+)?sucursales|d[oÃ³]nde\s+est[aÃ¡]n|d[oÃ³]nde\s+quedan|d[oÃ³]nde\s+hay|sedes|direcciones|ubicaci[oÃ³]n|locales|horarios?|a\s+qu[eÃ©]\s+hora|cierran|abren|abierto|atenci[oÃ³]n/i.test(t) && !/cambiar|elegir|retirar/i.test(t);
    if (isGeneralBranchQuery) {
      return `ðŸª *NUESTRAS 6 SUCURSALES EN CÃ“RDOBA:* ðŸ¥©\n\n` +
        `1ï¸âƒ£ **URCA CENTRAL:** Av. JosÃ© Roque Funes 1115 (ðŸ“ž +54 9 3513 906947)\n` +
        `   *Lunes a SÃ¡bado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `2ï¸âƒ£ **URCA 2 â€“ ALTO TEJEDA:** Av. MenÃ©ndez Pidal 3575 (ðŸ“ž +54 9 3518 623195)\n` +
        `   *Lunes a SÃ¡bado:* 9:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `3ï¸âƒ£ **INTERCOUNTRY â€“ CORTEZA MALL:** Av. Los Ãlamos 1015 (ðŸ“ž +54 9 3518 623194)\n` +
        `   *Lunes a Domingo:* 9:00 a 21:00 hs\n\n` +
        `4ï¸âƒ£ **DUARTE QUIRÃ“S:** Av. Duarte QuirÃ³s 5130 (ðŸ“ž +54 9 3518 156595)\n` +
        `   *Lunes a SÃ¡bado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `5ï¸âƒ£ **VILLA ALLENDE â€“ MERCADITO DE LA VILLA:** Av. Figueroa Alcorta 480 (ðŸ“ž +54 9 3513 540031)\n` +
        `   *Lunes a SÃ¡bado:* 9:00 a 13:30 y 17:00 a 21:00 hs | *Domingo:* 9:00 a 13:30 hs\n\n` +
        `6ï¸âƒ£ **COUNTRY SAN ISIDRO:** Av. Padre Luchesse km 2 (ðŸ“ž +54 9 3518 769099)\n` +
        `   *Lunes a MiÃ©rcoles:* 07:00 a 00:00 hs | *Jueves a SÃ¡bado:* 07:00 a 01:00 hs\n\n` +
        `ðŸ›µ *TambiÃ©n hacemos envÃ­os directos en el dÃ­a a domicilio a todo CÃ³rdoba.* Â¿QuerÃ©s que te preparemos un pedido? ðŸ™Œ [[STAGE:proposal]]`;
    }

    // 0.001 CONFIRMACIÃ“N DE RECEPCIÃ“N / ENTREGA POR PARTE DEL CLIENTE
    const isDeliveryReceivedConfirm = /recibi el ped|recibÃ­ el ped|me llego el ped|me llegÃ³ el ped|ya llego el repartidor|ya llegÃ³ el repartidor|ya me lo entregaron|pedido recibido|todo recibido|ya lo tengo|acaba de llegar|llego todo bien|llegÃ³ todo bien|ya llego|ya llegÃ³|recibido todo de diez/i.test(t);

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
      return `Â¡QuÃ© gran noticia ${clientName}! ðŸŽ‰ðŸ¥© Marcamos tu pedido **#${currentActiveOrder.id}** como **âœ… Entregado con Ã©xito**.\n\nÂ¡Que disfruten mucho ese asado y esos cortes! Cualquier cosa que precises, estamos a tu entera disposiciÃ³n. Â¡Muchas gracias por elegir RepÃºblica de la Carne! ðŸ™Œ [[STAGE:closed_won]]`;
    }

    // 0.002 CONFIRMACIÃ“N / COMPROBANTE DE PAGO ENVIADO POR EL CLIENTE
    const isPaymentProofSent = /ya pague|ya paguÃ©|ya transferi|ya transferÃ­|te pase el comprobante|te pasÃ© el comprobante|aca esta el comprobante|acÃ¡ estÃ¡ el comprobante|adjunto comprobante|pago realizado|ya mande la plata|ya mandÃ© la plata|comprobante de pago/i.test(t);

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
        return `Â¡Excelente ${clientName}! ðŸ’³ Registramos tu aviso y confirmaciÃ³n de pago para tu pedido **#${targetOrder.id}** por **$${Number(targetOrder.totalAmount).toLocaleString('es-AR')}**.\n\nTus cortes se encuentran **${statusLabel}** listos para su entrega. Â¡Muchas gracias por tu compra! ðŸ™Œ [[STAGE:closed_won]]`;
      }
    }

    // 0.005 CONSULTA DE ESTADO DE PEDIDO ACTIVO O DETALLE DE ORDEN COMPLETA
    const isStatusCheck = /estado|como viene|cÃ³mo viene|donde est[aÃ¡]|dÃ³nde est[aÃ¡]|cu[aÃ¡]ndo llega|seguimiento|status|consultar el estado|consultar estado|detalle.*ped|ver.*ped|ver.*orden|orden completa|ver la orden|ver mi orden|ver orden completa|resumen completo|qu[eÃ©]\s+ped[iÃ­]|que ped[iÃ­]|que pedi|mis cortes|resumen.*ped|detalle|ya est[aÃ¡] listo|est[aÃ¡] listo|ya lo prepararon|est[aÃ¡] preparado|est[aÃ¡] lista/i.test(t) ||
      /(?:ver|mostrar|mostrame|consultar|pasame|cual es|cuÃ¡l es|cÃ³mo es|como es|dame|decime)\s+(?:la\s+|el\s+|mi\s+)?(?:orden|pedido|resumen|detalle)(?:\s+completo|\s+completa)?/i.test(t) ||
      /^(?:ver\s+pedido|ver\s+orden|ver\s+detalle|detalle\s+del\s+pedido|qu[eÃ©]\s+ped[iÃ­]|orden\s+completa|resumen)$/i.test(cleanConfirmText) ||
      (wasActiveOrderHelpOffered && /^(?:2|2ï¸âƒ£|opci[oÃ³]n 2|la 2|el 2|dos|estado|detalle|ver orden|orden completa)$/i.test(t.trim()));

    if (isStatusCheck && currentActiveOrder) {
      const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
      const isPrep = Boolean(currentActiveOrder.isPrepared) || currentActiveOrder.status === 'ready' || currentActiveOrder.status === 'ready_for_pickup';
      const prepText = isPrep 
        ? `ðŸ”ª *PreparaciÃ³n:* âœ… *Cortes cortados y preparados* en carnicerÃ­a`
        : `ðŸ”ª *PreparaciÃ³n:* â³ *En cola de corte y pesado*`;
      const itemsText = Array.isArray(currentActiveOrder.items) ? currentActiveOrder.items.join('\n') : currentActiveOrder.items;
      const destination = currentActiveOrder.deliveryType === 'delivery'
        ? `Domicilio (${currentActiveOrder.address || lead.address || 'A coordinar'})`
        : `Sucursal (${currentActiveOrder.branch || lead.preferredBranch || 'A coordinar'})`;
      
      let readyNote = '';
      if (currentActiveOrder.status === 'ready' || currentActiveOrder.status === 'ready_for_pickup' || isPrep) {
        if (currentActiveOrder.deliveryType === 'pickup' || currentActiveOrder.branchName || currentActiveOrder.branch) {
          readyNote = `\nðŸŽ‰ *Â¡Tu pedido ya estÃ¡ LISTO!* PodÃ©s pasar a retirarlo por **${currentActiveOrder.branchName || currentActiveOrder.branch || 'la sucursal'}** cuando gustes. ðŸ™Œ\n`;
        } else {
          readyNote = `\nðŸŽ‰ *Â¡Tu pedido ya estÃ¡ LISTO y preparado!* Aguardando el despacho del repartidor. ðŸ›µ\n`;
        }
      }

      return `ðŸ“¦ *ESTADO Y DETALLE DE TU PEDIDO #${currentActiveOrder.id}:*\n\n` +
        `ðŸ‘‰ **${statusLabel}**\n` +
        `${prepText}\n\n` +
        `ðŸ“‹ *Cortes y Productos:* \n${itemsText}\n\n` +
        `ðŸ’° *Total:* **$${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}**\n` +
        `ðŸ“ *Destino:* ${destination}\n` +
        `ðŸ’³ *Medio de pago:* ${currentActiveOrder.paymentMethod || 'Efectivo / Transferencia'}\n` +
        `ðŸšš *Entrega:* ${currentActiveOrder.status === 'ready' ? 'Listo en mostrador / En despacho' : 'Programado en el dÃ­a (dentro de las 24 hs)'}\n` +
        readyNote +
        `\nðŸ‘‰ *Opciones:*\n` +
        `1ï¸âƒ£ Modificar algÃºn dato o cortes (o escribÃ­ "modificar")\n` +
        `2ï¸âƒ£ Cancelar pedido (o escribÃ­ "cancelar")\n\n` +
        `Â¿PrecisÃ¡s algo mÃ¡s? ðŸ™Œ`;
    }

    // 0.01 CANCELACIÃ“N DE PEDIDO (VÃ¡lida en TODO momento, incluso in_transit)
    const isCancelRequest = /cancelar.*ped|cancela.*ped|anular.*ped|anula.*ped|no quiero el ped|cancelar mi orden|cancela mi orden|quiero cancelar|cancelame el ped|ya no quiero el ped/i.test(t) ||
      (wasInTransitChoiceOffered && /^(?:1|1ï¸âƒ£|cancelar|cancela)$/i.test(t.trim())) ||
      (wasModMenuOffered && /^(?:6|6ï¸âƒ£|cancelar)$/i.test(t.trim())) ||
      (wasActiveOrderHelpOffered && /^(?:3|3ï¸âƒ£|cancelar)$/i.test(t.trim())) ||
      (wasDataConfirmOffered && /^(?:3|3ï¸âƒ£|cancelar)$/i.test(t.trim()));

    if (isCancelRequest) {
      if (currentActiveOrder) {
        db.updateOrderStatus(currentActiveOrder.id, 'cancelled');
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { stage: 'qualified' });
        }
        if (currentActiveOrder.status === 'in_transit') {
          return `Â¡Entendido ${clientName}! ðŸ›‘ Hemos **cancelado** tu pedido **#${currentActiveOrder.id}** de inmediato y notificado al repartidor para suspender la entrega.\n\nÂ¿Te gustarÃ­a armar otro pedido o necesitÃ¡s que te asesore con algÃºn corte? ðŸ¥©ðŸ”¥ [[STAGE:qualified]]`;
        }
        return `Â¡Listo ${clientName}! ðŸ‘ Hemos **cancelado** tu pedido **#${currentActiveOrder.id}** de forma exitosa. No te preocupes.\n\nÂ¿Te gustarÃ­a armar otro pedido o necesitÃ¡s que te asesore con algÃºn corte? ðŸ¥©ðŸ”¥ [[STAGE:qualified]]`;
      } else {
        return `Â¡Hola ${clientName}! No registrÃ¡s ningÃºn pedido activo en este momento. Si querÃ©s armar un pedido nuevo o consultar precios, avisame y te ayudo con gusto. ðŸ¥©`;
      }
    }

    // 0.02 SELECCIÃ“N / CAMBIO DE SUCURSAL (1 al 6 o nombre de sucursal)
    const isBranchChangeIntent = /cambiar.*sucursal|retirar.*otra.*sucursal|elegir.*sucursal|cambiar.*sede|otra.*sede|cambio.*sucursal|seleccionar.*sucursal/i.test(t) ||
      (wasModMenuOffered && /^(?:3|3ï¸âƒ£)$/i.test(t.trim()));

    if (isBranchChangeIntent) {
      const orderRef = currentActiveOrder ? ` para tu pedido **#${currentActiveOrder.id}**` : '';
      return `Â¡De diez ${clientName}! ðŸª ElegÃ­ la sucursal de retiro${orderRef}:\n\n` +
        `${formatBranchMenu()}\n\n` +
        `ðŸ‘‰ RespondÃ© con el nÃºmero de sucursal (1 al 6) o el nombre de la sede. ðŸ™Œ`;
    }

    const isBranchSelectionAnswer = wasBranchMenuOffered && (
      /^(?:1|2|3|4|5|6|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|urca|funes|pidal|tejeda|intercountry|alamos|quiros|allende|san isidro|luchesse)$/i.test(t.trim()) ||
      /(?:sucursal\s+[1-6]|sede\s+[1-6]|opci[oÃ³]n\s+[1-6])/i.test(t)
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
          'â€¢ 1 combo Combo â€œAsadazoâ€ (4 kg cortes + Vino de regalo) â€” $39.999'
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
        : (historyItems.length > 0 ? historyItems.join('\n') : 'â€¢ Cortes seleccionados');
      const orderTotal = targetOrder?.totalAmount || historyTotal || 0;
      const totalFormatted = `$${Number(orderTotal).toLocaleString('es-AR')}`;
      const orderRef = targetOrder ? ` **#${targetOrder.id}**` : '';

      return `Â¡Excelente ${clientName}! ðŸª Registramos tu sucursal de retiro para tu pedido${orderRef} en:\n` +
        `ðŸ‘‰ **${selectedBranch.name}** (ðŸ“ ${selectedBranch.address}).\n\n` +
        `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n${itemsList}\n\n` +
        `ðŸ’° *Total estimado a abonar:* **${totalFormatted}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ’³ *Paso final â€” Â¿CÃ³mo preferÃ­s abonar?*\n` +
        `1ï¸âƒ£ *Efectivo* (al retirar en sucursal)\n` +
        `2ï¸âƒ£ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `ðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ™Œ [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 0.028 DISPARADOR DIRECTO DE PAGO ("pago", "coordinar pago", "pagar", etc.)
    // =========================================================================
    const isPaymentTrigger = /^(?:pago|pagar|pasar al pago|coordinar pago|coordinamos el pago|coordinemos el pago|hacer el pago|como pago|cÃ³mo pago|como se paga|cÃ³mo se paga|abonar|medio de pago|metodo de pago|mÃ©todo de pago|opciones de pago)$/i.test(t.trim()) ||
      (/(?:coordinamos el pago|coordinar el pago|pasar al pago|modificaciÃ³n o coordinamos)/i.test(lastAgentMessage) && /^(?:si|sÃ­|dale|ok|listo|pago|pagar|pasemos al pago|avancemos|vamos)$/i.test(t.trim()));

    if (isPaymentTrigger) {
      const targetOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products, lead);
      const itemsList = (targetOrder?.items && targetOrder.items.length > 0)
        ? (Array.isArray(targetOrder.items) ? targetOrder.items.join('\n') : targetOrder.items)
        : (historyItems.length > 0 ? historyItems.join('\n') : 'â€¢ Cortes seleccionados');
      const orderTotal = targetOrder?.totalAmount || historyTotal || 0;
      const totalFormatted = `$${Number(orderTotal).toLocaleString('es-AR')}`;
      const dest = targetOrder?.address || targetOrder?.branch || lead.address || 'Sucursal / Domicilio a coordinar';
      const orderIdTag = targetOrder ? ` **#${targetOrder.id}**` : '';

      return `Â¡De diez ${clientName}! ðŸ¥©ðŸ’³ Dejamos listo tu pedido${orderIdTag} por **${totalFormatted}** con entrega/retiro en **${dest}**:\n\n` +
        `ðŸ“‹ *Detalle del pedido (precios por kilo segÃºn corte):*\n${itemsList}\n\n` +
        `ðŸ’° *Total estimado a abonar:* **${totalFormatted}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ’³ *Â¿CÃ³mo preferÃ­s abonar?*\n` +
        `1ï¸âƒ£ *Efectivo* (en sucursal o al repartidor)\n` +
        `2ï¸âƒ£ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `ðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ™Œ [[STAGE:confirming_data]]`;
    }

    // 0.03 CAMBIO O SELECCIÃ“N DE FORMA DE ENTREGA (DOMICILIO vs SUCURSAL)
    const isDeliveryModeChange = /cambiar.*(?:forma|modo).*entrega|cambiar.*env[iÃ­]o|cambiar.*retiro|cambiar a domicilio|cambiar a sucursal|prefiero envio|prefiero envÃ­o|prefiero retiro|pasar a buscar/i.test(t) ||
      (wasModMenuOffered && /^(?:2|2ï¸âƒ£)$/i.test(t.trim()));

    if (isDeliveryModeChange) {
      return `Â¡De diez ${clientName}! ðŸ›µðŸ“¦ Â¿CÃ³mo preferÃ­s recibir tu pedido${currentActiveOrder ? ` **#${currentActiveOrder.id}**` : ''}?\n\n` +
        `1ï¸âƒ£ *EnvÃ­o a Domicilio* (te lo llevamos en el dÃ­a)\n` +
        `2ï¸âƒ£ *Retiro por Sucursal* (en cualquiera de nuestras 6 sedes en CÃ³rdoba)\n\n` +
        `ðŸ‘‰ RespondÃ© *1* o *2*.`;
    }

    const isDeliveryIntentExplicit = /^(?:delivery|envio|envÃ­o|a domicilio|a mi casa|a mi domicilio|lo quiero a mi domicilio|quiero que lo envien a mi domicilio|lo envian a mi domicilio|mandamelo|mandÃ¡melo|enviÃ¡melo|enviamelo|traemelo|traÃ©melo)$/i.test(t.trim()) ||
      /(?:lo\s+quiero\s+a\s+mi\s+domicilio|quiero\s+que\s+lo\s+envien\s+a\s+mi\s+domicilio|a\s+mi\s+domicilio|por\s+delivery|con\s+env[iÃ­]o|para\s+env[iÃ­]o)/i.test(t.trim()) ||
      (wasDeliveryTypeOffered && /^(?:1|1ï¸âƒ£|uno|el 1|la 1|opci[oÃ³]n 1|envio|envÃ­o|domicilio|delivery)$/i.test(t.trim()));

    if (isDeliveryIntentExplicit) {
      if (currentActiveOrder) db.updateOrder(currentActiveOrder.id, { deliveryType: 'delivery', branch: '' });
      if (lead.jid || lead.id) db.updateLead(lead.jid || lead.id, { deliveryType: 'delivery' });

      if (lead.address && lead.address.length >= 4 && !isGarbageAddress(lead.address)) {
        return `Â¡Excelente ${clientName}! ðŸ›µ Coordinamos con envÃ­o a domicilio a tu direcciÃ³n registrada:\nðŸ“ **${lead.address}**\n\nðŸ’³ *Â¿CÃ³mo preferÃ­s abonar?*\n1ï¸âƒ£ *Efectivo* al repartidor\n2ï¸âƒ£ *Transferencia* (Alias: \`republica.carne.mp\`)\n3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\nðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ¥©`;
      }
      return `Â¡Excelente ${clientName}! ðŸ›µ Coordinamos con envÃ­o a domicilio en el dÃ­a.\n\nðŸ“ Por favor pasame tu **Calle, NÃºmero/Altura y Barrio** para el repartidor. ðŸ™Œ`;
    }

    const isPickupIntentExplicit = /^(?:retiro|sucursal|en persona|paso a buscar|lo paso a buscar|voy al local|voy a la sucursal)$/i.test(t.trim()) ||
      (wasDeliveryTypeOffered && /^(?:2|2ï¸âƒ£|dos|el 2|la 2|opci[oÃ³]n 2|retiro|sucursal)$/i.test(t.trim()));

    if (isPickupIntentExplicit) {
      return `Â¡De diez ${clientName}! ðŸª ElegÃ­ la sucursal de retiro:\n\n${formatBranchMenu()}\n\nðŸ‘‰ RespondÃ© con el nÃºmero (1 al 6) o nombre de la sede. ðŸ™Œ`;
    }

    const isAddMoreCutsChoice = (wasDeliveryTypeOffered && /^(?:3|3ï¸âƒ£|tres|el 3|la 3|opci[oÃ³]n 3|sumar|agregar|mas cortes|mÃ¡s cortes|complementos|otro corte)$/i.test(t.trim()));

    if (isAddMoreCutsChoice) {
      return `Â¡BuenÃ­simo ${clientName}! ðŸ¥© Contame quÃ© otros cortes o complementos te gustarÃ­a sumar:\n\n` +
        `â€¢ ðŸŒ­ *Chorizo Criollo puro cerdo* (2kg x $10.000 promo o $5.000/kg)\n` +
        `â€¢ ðŸŒ­ *Morcillas Especiales BombÃ³n* ($5.200/kg)\n` +
        `â€¢ ðŸ”¥ *CarbÃ³n Quebracho Blanco* ($2.200 la bolsa grande)\n` +
        `â€¢ ðŸ· *Vino SelecciÃ³n Howlmande* ($5.500)\n\n` +
        `ðŸ‘‰ Decime quÃ© te agregamos y te actualizo el total al instante. ðŸ™Œ [[STAGE:proposal]]`;
    }

    const isQuantityOrCutModification = wasDeliveryTypeOffered && (
      /(?:kilos?|kg|unidades?|un\b|chorizo|chori|morcilla|vacio|vacÃ­o|asado|tapa|matambre|bife|entraÃ±a|combo|\d+\s*(?:kg|kilos?))/i.test(t) ||
      /(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sin\s+|cambia|reemplaza|sacale|saca|quita|elimina|agrega|suma|sumale|ponele|quiero|dame|mejor|dejame|pasalo)/i.test(t)
    );

    if (isQuantityOrCutModification) {
      let updatedItems = [], newTotal = 0, updatedProducts = [];
      if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status) && currentActiveOrder.items && currentActiveOrder.items.length > 0) {
        const modRes = applyItemModificationToOrder(currentActiveOrder, rawText, products, lead);
        updatedItems = modRes.items;
        newTotal = modRes.total;
        updatedProducts = modRes.products;
        db.updateOrder(currentActiveOrder.id, {
          items: updatedItems,
          products: updatedProducts,
          totalAmount: newTotal > 0 ? newTotal : currentActiveOrder.totalAmount
        });
      } else {
        const extRes = extractItemsFromHistoryAndText(history, rawText, products, lead);
        updatedItems = extRes.items;
        newTotal = extRes.total;
        updatedProducts = extRes.products;
        if (updatedItems.length > 0 && currentActiveOrder) {
          db.updateOrder(currentActiveOrder.id, {
            items: updatedItems,
            products: updatedProducts,
            totalAmount: newTotal > 0 ? newTotal : currentActiveOrder.totalAmount
          });
        }
      }

      if (updatedItems.length > 0) {
        return `Â¡Anotado ${clientName}! ðŸ¥© Actualizamos tu pedido:\n\n` +
          `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n` +
          `${updatedItems.join('\n')}\n\n` +
          `ðŸ’° *Subtotal acumulado:* **$${Number(newTotal > 0 ? newTotal : (currentActiveOrder?.totalAmount || 0)).toLocaleString('es-AR')}**\n` +
          `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
          `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
          `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
          `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
          `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (chorizos, carbÃ³n, vino) ðŸ¥©\n\n` +
          `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ`;
      }
    }

    // 0.04 CAMBIO DE MÃ‰TODO DE PAGO
    const isPaymentMethodChange = /cambia.*(?:metodo|medio|forma|modo).*pago|cambiar.*(?:metodo|medio|forma|modo)|pagar con|pago con|abonar con|quiero pagar en efectivo|prefiero efectivo|prefiero transferencia|prefiero mp|quiero transferir/i.test(t) ||
      (wasModMenuOffered && /^(?:4|4ï¸âƒ£)$/i.test(t.trim()));

    if (isPaymentMethodChange) {
      const orderRef = currentActiveOrder ? ` para tu pedido **#${currentActiveOrder.id}**` : '';
      return `Â¡De diez ${clientName}! ðŸ’³ Decime cÃ³mo preferÃ­s abonar${orderRef}:\n\n` +
        `1ï¸âƒ£ *Efectivo* (al repartidor o en sucursal)\n` +
        `2ï¸âƒ£ *Transferencia Bancaria* (Alias: \`republica.carne.mp\`)\n` +
        `3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `ðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ¥©`;
    }

    // 0.05 MENÃš GENERAL DE MODIFICACIONES DE PEDIDO ACTIVO
    const isModifyRequest = /modificar.*ped|modificame.*ped|cambiar.*ped|cambiame.*ped|opciones.*ped|quiero cambiar|cambiar algo|cambiar pedido/i.test(t) ||
      (wasActiveOrderHelpOffered && /^(?:1|1ï¸âƒ£|opci[oÃ³]n 1|la 1|el 1|modificar)$/i.test(t.trim())) ||
      (wasDataConfirmOffered && /^(?:2|2ï¸âƒ£|modificar)$/i.test(t.trim()));

    if (isModifyRequest) {
      if (currentActiveOrder) {
        if (currentActiveOrder.status === 'in_transit') {
          return `Â¡Hola ${clientName}! ðŸ›µ Tu pedido **#${currentActiveOrder.id}** ya se encuentra **en camino a tu domicilio** con el repartidor, por lo que no es posible modificar los cortes ni la sucursal.\n\n` +
            `ðŸ‘‰ *Opciones disponibles:*\n` +
            `1ï¸âƒ£ Cancelar el pedido\n` +
            `2ï¸âƒ£ Continuar con la entrega a domicilio\n\n` +
            `ðŸ‘‰ RespondÃ© *1* o *2*. ðŸ‘`;
        }

        return `Â¡De diez ${clientName}! ðŸ› ï¸ Â¿QuÃ© te gustarÃ­a modificar de tu pedido **#${currentActiveOrder.id}**?\n\n` +
          `1ï¸âƒ£ Cambiar o sumar cortes del catÃ¡logo (o escribÃ­ "cortes")\n` +
          `2ï¸âƒ£ Cambiar forma de entrega (EnvÃ­o a Domicilio â‡„ Retiro en Sucursal) (o escribÃ­ "entrega")\n` +
          `3ï¸âƒ£ Cambiar Sucursal de retiro (o escribÃ­ "sucursal")\n` +
          `4ï¸âƒ£ Cambiar MÃ©todo de Pago (o escribÃ­ "pago")\n` +
          `5ï¸âƒ£ Cambiar DirecciÃ³n de entrega (o escribÃ­ "direcciÃ³n")\n` +
          `6ï¸âƒ£ Cancelar el pedido (o escribÃ­ "cancelar")\n\n` +
          `ðŸ‘‰ RespondÃ© con el nÃºmero de opciÃ³n (1 al 6) o la palabra. ðŸ‘`;
      } else {
        return `Â¡Hola ${clientName}! No tenÃ©s ningÃºn pedido activo pendiente de modificaciÃ³n. Si querÃ©s armar un pedido nuevo o consultar precios, avisame y te ayudo con gusto. ðŸ¥©`;
      }
    }

    // Respuesta a opciÃ³n 1 del menÃº de modificaciÃ³n (sumar/cambiar cortes)
    if ((wasModMenuOffered && /^(?:1|1ï¸âƒ£|cortes|catalogo|catÃ¡logo|cambiar cortes|sumar cortes|productos|carne)$/i.test(t.trim())) || /quiero (?:sumar|cambiar|agregar) cortes/i.test(t)) {
      const catalogToOffer = (products && products.length > 0) ? products.slice(0, 8) : getDynamicCatalog().slice(0, 8);
      return `Â¡De diez ${clientName}! ðŸ¥© AcÃ¡ tenÃ©s nuestras opciones y cortes del dÃ­a:\n\n` +
        `${formatNumberedCatalog(catalogToOffer)}\n\n` +
        `ðŸ‘‰ Decime quÃ© nÃºmero de opciÃ³n o cortes querÃ©s sumar o cambiar a tu pedido. ðŸ™Œ`;
    }

    // Respuesta a opciÃ³n 5 del menÃº de modificaciÃ³n (cambiar direcciÃ³n)
    if (wasModMenuOffered && /^(?:5|5ï¸âƒ£|direccion|direcciÃ³n|cambiar direccion|mi direccion|calle)$/i.test(t.trim())) {
      return `ðŸ“ Por favor pasame tu nueva calle, altura y barrio para actualizar la direcciÃ³n de entrega de tu pedido. ðŸ›µ`;
    }

    // 0.051 MODIFICACIÃ“N DIRECTA DE CORTES EN PEDIDO ACTIVO (Sumar, reemplazar o quitar)
    const isOptionsOfferedInPrevGlobal = /1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|\[PLU \d+\]|OFERTAS Y CORTES|cortes estrella|mejores promos|MirÃ¡ las opciones|Te armÃ© 3 opciones|Â¿Con cuÃ¡l opciÃ³n/i.test(lastAgentMessage?.content || '');
    const isOptionSelectionDirect = /(?:quiero\s+|dame\s+|vamos\s+con\s+|me\s+gusta\s+|elijo\s+|pasame\s+|anotame\s+|preparame\s+)?(?:la\s+|el\s+)?opci[oÃ³]n\s*([1-9]|1[0-9]|20)\b|^(?:[1-9]|1[0-9]|20|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|7ï¸âƒ£|8ï¸âƒ£|9ï¸âƒ£|ðŸ”Ÿ)$/i.test(t);

    if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status) && !(isOptionSelectionDirect && isOptionsOfferedInPrevGlobal)) {
      const isItemModification = /(?:no\s+quiero|no\s+le\s+pongas|no\s+pongas|no\s+me\s+pongas|sin\s+|cambiame|cambia|cambiÃ¡|reemplaza|reemplazÃ¡|sacale|sacÃ¡|saca|quita|quitar|quitalo|quitame|elimina|eliminame|borra|borrame|agrega|agregÃ¡|suma|sumÃ¡|sumar|ponele|ponÃ©|agregale)\s+(?:el\s+|la\s+|un\s+|una\s+|los\s+|las\s+)?([a-zÃ¡Ã©Ã­Ã³ÃºÃ±0-9\s]+)/i.test(t) ||
        /(?:quiero|mandame|traeme|sumar|agregar)\s+(?:sumar|agregar|mas|mÃ¡s|\d+)\s+([a-zÃ¡Ã©Ã­Ã³ÃºÃ±0-9\s]+)/i.test(t);
      if (isItemModification) {
        const { items: updatedItems, products: updatedProducts, total: newTotal } = applyItemModificationToOrder(currentActiveOrder, rawText, products, lead);
        if (updatedItems.length > 0) {
          db.updateOrder(currentActiveOrder.id, {
            items: updatedItems,
            products: updatedProducts,
            totalAmount: newTotal > 0 ? newTotal : currentActiveOrder.totalAmount
          });

          return `Â¡De diez ${clientName}! ðŸ¥© ModificaciÃ³n registrada con Ã©xito en tu pedido **#${currentActiveOrder.id}**:\n\n` +
            `ðŸ“‹ *Detalle actualizado de tu pedido (precios por kilo segÃºn corte):*\n` +
            `${updatedItems.join('\n')}\n\n` +
            `ðŸ’° *Nuevo Total estimado a abonar:* **$${Number(newTotal > 0 ? newTotal : currentActiveOrder.totalAmount).toLocaleString('es-AR')}**\n` +
            `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
            `ðŸ“ *Destino:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n` +
            `ðŸ’³ *Medio de pago:* ${currentActiveOrder.paymentMethod || 'Efectivo / Transferencia'}\n\n` +
            `ðŸ‘‰ *Opciones:*\n` +
            `1ï¸âƒ£ Confirmar pedido y continuar (o respondÃ© "1" / "confirmar")\n` +
            `2ï¸âƒ£ Sumar mÃ¡s cortes (o indicÃ¡ quÃ© corte querÃ©s)\n` +
            `3ï¸âƒ£ Cancelar pedido (o respondÃ© "3" / "cancelar") ðŸ™Œ`;
        }
      }
    }



    // 0.06 GESTIÃ“N DE CLIENTES CON PEDIDO EN PREPARACIÃ“N / CAMINO (CONSULTAS GENERALES)
    if (currentActiveOrder && ['preparing', 'in_transit', 'ready_for_pickup'].includes(currentActiveOrder.status)) {
      const isExplicitNewOrder = /hacer otro ped|armar otro ped|nuevo ped|otro ped|quiero pedir otra cosa|armame otro ped/i.test(t);

      // Agradecimientos o saludos cortos / respuestas cortas de cortesÃ­a
      const isShortAck = /^(?:gracias|muchas gracias|joya|de diez|dale|perfecto|genial|ok|buen[iÃ­]simo|listo|impecable|gracais|chas gracias|chau|adios|hasta luego|que andes bien|un abrazo|no gracias|no muchas gracias|no por ahora|nada mas|nada mÃ¡s|todo bien|no por el momento|todo en orden)$/i.test(cleanConfirmText);
      if (isShortAck) {
        return `Â¡De diez ${clientName}! ðŸ™Œ Quedamos a tu entera disposiciÃ³n. Te avisamos en cuanto el repartidor estÃ© en viaje hacia tu domicilio. ðŸ¥©ðŸšš`;
      }

      // EnvÃ­o de direcciÃ³n complementaria, calle, barrio o timbre
      const hasStreetKeyword = /(?:calle|av\b|av\.|avenida|bv\b|bv\.|bulevar|barrio|piso|dpto|departamento|timbre|entre|esquina|algarrobos|locelso|funes|quiros|pidal|cuesta colorada|colorada|altura|manzana|lote|san martin|colon|velez sarsfield)/i.test(t);
      const isExplicitAddressPhrase = /^(?:te paso mi direccion|mi direccion es|direccion:?|la direccion es|la direccion de entrega es|para el envio|para el envÃ­o|vivo en|enviar a|mandalo a|mandar a)\s+/i.test(t);
      const isAddressFollowUp = !/metodo|medio|forma|pago|pagar|abonar|precio|cuanto|hora|consulta|gracias|detalle|estado/i.test(t) &&
        (hasStreetKeyword || isExplicitAddressPhrase) &&
        !isStatusCheck && !isExplicitNewOrder && !isShortAck;

      if (isAddressFollowUp && currentActiveOrder.status !== 'in_transit') {
        const cleanAddr = extractCleanAddress(rawText);
        if (isGarbageAddress(cleanAddr) || cleanAddr.length < 4) {
          return `Â¡Hola ${clientName}! ðŸ“ Para registrar correctamente tu entrega a domicilio, por favor escribÃ­ Ãºnicamente tu **Calle, Altura/NÃºmero y Barrio o timbre** (ej: *Av. Roque Funes 1115, Urca*). ðŸ™Œ`;
        }

        db.updateOrder(currentActiveOrder.id, { address: cleanAddr });
        if (lead.jid || lead.id) db.updateLead(lead.jid || lead.id, { address: cleanAddr });

        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        return `Â¡Anotado ${clientName}! ðŸ“ Registramos y actualizamos tu direcciÃ³n de entrega a:\nðŸ‘‰ **${cleanAddr}** para tu pedido **#${currentActiveOrder.id}**.\n\nTus cortes ya se encuentran **${statusLabel}** en carnicerÃ­a. ðŸ™Œ`;
      }

      const isBranchOrInfoQuery = /sucursal|sucursales|horario|donde|dÃ³nde|direccion|direcciÃ³n|urca|quiros|villa allende|san isidro|receta|guiso|milanesa|asado|cuanto|precio|promo/i.test(t);
      const isProductAddition = /agrega|agregÃ¡|suma|sumÃ¡|sumar|quiero|traeme|mandame|combo|vacio|vacÃ­o|costillar|matambre|chori/i.test(t);

      if (!isExplicitNewOrder && !isStatusCheck && !isLinkRequest && !isBranchOrInfoQuery && !isProductAddition && !wasAsadoProposalOffered && !wasMenuOffered && !wasDeliveryTypeOffered && !wasDataConfirmOffered) {
        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        const itemsText = Array.isArray(currentActiveOrder.items) ? currentActiveOrder.items.join('\n') : currentActiveOrder.items;
        return `Â¡Hola ${clientName}! ðŸ‘‹ Tu pedido **#${currentActiveOrder.id}** ya estÃ¡ confirmado y se encuentra:\nðŸ‘‰ **${statusLabel}** (Total: $${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}).\n\nðŸ“‹ *Detalle de cortes:*\n${itemsText}\n\nðŸ“ *Destino:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n\nðŸ‘‰ *Opciones:*\n1ï¸âƒ£ Modificar algÃºn dato o cortes (o escribÃ­ "modificar")\n2ï¸âƒ£ Consultar estado y detalle (o escribÃ­ "estado" / "detalle")\n3ï¸âƒ£ Cancelar pedido (o escribÃ­ "cancelar")\n\nÂ¿En quÃ© te puedo ayudar? ðŸ™Œ`;
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

      const modeTag = creds.isSandbox ? '\nðŸ§ª *[MODO PRUEBAS - SANDBOX]*' : '';

      return `ðŸ’³ *[MERCADO PAGO CHECKOUT OFICIAL]*\nÂ¡De diez ${clientName}! ðŸ¥©ðŸ’³ AcÃ¡ tenÃ©s el link de pago oficial y seguro para tu pedido **#${orderId}** (Cliente N.Â° ${customerNum}) por **$${Number(amount).toLocaleString('es-AR')}**:${modeTag}\n\n1ï¸âƒ£ **Link de Pago Directo:**\nðŸ”— ${dynamicLink}\n\n2ï¸âƒ£ **Transferencia / Dinero en cuenta:**\nðŸ“± *Alias Mercado Pago:* \`republica.carne.mp\`\n\nPodÃ©s abonar con Dinero en cuenta, DÃ©bito, CrÃ©dito o Transferencia. En cuanto se acredite, Â¡comenzamos la preparaciÃ³n de tus cortes en carnicerÃ­a! ðŸ™Œ [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.035 HISTORIAL Y ESTADO DE PEDIDOS ANTERIORES
    // =========================================================================
    const isOrderHistoryQuery = /historial.*ped|mis pedidos|mis compras|que pedi antes|que pedÃ­ antes|pedidos anteriores|compras anteriores|ver mis pedidos/i.test(t);
    if (isOrderHistoryQuery) {
      return ChatStrategyGraphService.handleOrderHistory(lead, clientName);
    }

    // =========================================================================
    // 0.04 SALUDO PROACTIVO CON OFERTAS Y MENÃš NUMERADO DE CORTES ESTRELLA
    // =========================================================================
    const cleanGreetingCheck = cleanConfirmText.replace(/[Â¡!Â¿\?,\.]+/g, '').trim();
    const isGreeting = /^(?:hola|holis|buenas|buen dia|buen dÃ­a|buenos dias|buenos dÃ­as|buenas tardes|buenas noches|que tal|quÃ© tal|hola carlos|hola carnicero|hola amigo|hola don juan|hola!|buenas!|hola buenos dias|hola buenos dÃ­as|hola buenas tardes|como estas|cÃ³mo estÃ¡s|como va|cÃ³mo va|que onda|quÃ© onda)$/i.test(cleanGreetingCheck) ||
      (t.length <= 25 && /^(?:hola|holis|buenas|buen d[iÃ­]a|buenos d[iÃ­]as|buenas tardes|buenas noches|que tal|quÃ© tal)/i.test(t));

    if (isGreeting) {
      if (currentActiveOrder) {
        const statusLabel = getOrderStatusLabel(currentActiveOrder.status);
        const greetingHeader = getContextualGreeting(rawText, clientName);
        return `${greetingHeader}\n\n` +
          `ðŸ“Œ *TenÃ©s un pedido activo en curso:* **#${currentActiveOrder.id}** (${statusLabel}) por **$${Number(currentActiveOrder.totalAmount).toLocaleString('es-AR')}**.\n\n` +
          `ðŸ‘‰ Â¿QuerÃ©s consultar el estado / modificarlo, o te gustarÃ­a armar un **pedido nuevo**? ðŸ¥©ðŸ”¥`;
      }

      const greetingHeader = getContextualGreeting(rawText, clientName);
      const welcomeIntros = [
        `Contame, Â¿tenÃ­as ganas de preparar un asadito o buscÃ¡s cortes frescos para la semana? Hacemos envÃ­os directos en el dÃ­a a todo CÃ³rdoba. ðŸ›µðŸ¥©`,
        `Â¿EstÃ¡s planeando un asadito o buscÃ¡s cortes para la semana? Hacemos envÃ­os directos en el dÃ­a a todo CÃ³rdoba. ðŸ›µðŸ¥©`,
        `Â¿TenÃ­as ganas de prender el fuego para un asado o precisÃ¡s cortes para el dÃ­a a dÃ­a? Hacemos envÃ­os directos en el dÃ­a a tu domicilio. ðŸ›µðŸ¥©`
      ];
      const selectedIntro = pickRandom(welcomeIntros);

      return `${greetingHeader}\n\n` +
        `${selectedIntro}\n\n` +
        `ðŸ‘‰ *Opciones rÃ¡pidas:*\n` +
        `1ï¸âƒ£ Ver ofertas del dÃ­a y combos\n` +
        `2ï¸âƒ£ Asesoramiento de asado por cantidad de personas\n` +
        `3ï¸âƒ£ Consultar nuestras 6 sucursales\n\n` +
        `Â¿Por dÃ³nde arrancamos? ðŸ™Œ [[STAGE:proposal]]`;
    }

    // =========================================================================
    const isSingleMenuNumber = /^(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|1ï¸âƒ£|2ï¸âƒ£|3ï¸âƒ£|4ï¸âƒ£|5ï¸âƒ£|6ï¸âƒ£|7ï¸âƒ£|8ï¸âƒ£|9ï¸âƒ£|ðŸ”Ÿ|la 1|la 2|la 3|la 4|la 5|la 6|la 7|la 8|el 1|el 2|el 3|el 4|el 5|el 6|el 7|el 8|opci[oÃ³]n 1|opci[oÃ³]n 2|opci[oÃ³]n 3|opci[oÃ³]n 4|opci[oÃ³]n 5|opci[oÃ³]n 6|opci[oÃ³]n 7|opci[oÃ³]n 8)$/i.test(t.trim());

    if (wasMenuOffered && isSingleMenuNumber && !/Â¿CÃ³mo preferÃ­s abonar\?/i.test(lastAgentMessage)) {
      const numMatch = t.match(/([1-9]|1[0-9]|20)/);
      const optNum = numMatch ? parseInt(numMatch[0], 10) : 1;
      const catalogToOffer = getFeaturedWhatsAppOffers(products);
      const chosen = catalogToOffer[optNum - 1] || catalogToOffer[0];

      const itemText = `â€¢ 1 ${chosen.unit === 'kg' ? 'kg' : chosen.unit} ${chosen.name} â€” $${Number(chosen.price).toLocaleString('es-AR')}`;
      const subtotalAmount = chosen.price;
      const orderIntro = getVariedOrderIntro(clientName);
      const delivQ = getVariedDeliveryQuestion();

      return `${orderIntro}\n\n` +
        `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n` +
        `${itemText}\n\n` +
        `ðŸ’° *Subtotal acumulado:* **$${subtotalAmount.toLocaleString('es-AR')}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `${delivQ} [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 0.1 CONFIRMACIÃ“N DE MÃ‰TODO DE PAGO (INCLUYE RESPUESTAS NUMÃ‰RICAS 1, 2, 3, OPCIÃ“N 1, ETC.)
    // =========================================================================
    const isLastMsgPaymentPrompt = /Â¿CÃ³mo preferÃ­s abonar\?|1ï¸âƒ£.*Efectivo|2ï¸âƒ£.*Transferencia|3ï¸âƒ£.*Mercado Pago|Paso 4 de 4/i.test(lastAgentMessage);

    const isNumericPayment1 = /^(?:1|1ï¸âƒ£|uno|opci[oÃ³]n 1|la 1|el 1|1\.)$/i.test(t.trim());
    const isNumericPayment2 = /^(?:2|2ï¸âƒ£|dos|opci[oÃ³]n 2|la 2|el 2|2\.)$/i.test(t.trim());
    const isNumericPayment3 = /^(?:3|3ï¸âƒ£|tres|opci[oÃ³]n 3|la 3|el 3|3\.)$/i.test(t.trim());

    const isPaymentChoice = (isLastMsgPaymentPrompt && (isNumericPayment1 || isNumericPayment2 || isNumericPayment3)) ||
      (!wasDataConfirmOffered && !wasBranchMenuOffered && !wasModMenuOffered && !wasDeliveryTypeOffered && !wasInTransitChoiceOffered &&
        /^(?:efectivo|transferencia|transferir|al repartidor|contra entrega|contraentrega|por mp|mercado pago|pago al recibir|abono al repartidor|abono en efectivo|al retirar|abono al retirar|pago al retirar|en sucursal|en la sucursal|abono en sucursal|pago en sucursal|con debito|con dÃ©bito|tarjeta al retirar|debito|dÃ©bito|al buscarlo|efectivo al repartidor|por transferencia)$/i.test(t.trim())) ||
      /(?:efectivo al repartidor|por transferencia|abono en efectivo|al recibir|abono al retirar|pago al retirar|en sucursal|pago en sucursal)/i.test(t.trim());

    if (isPaymentChoice) {
      let lastOrder = currentActiveOrder || db.getLatestOrderByJid(lead.jid || lead.id);
      let payMethod = 'Efectivo contraentrega';

      if (isNumericPayment2 || /transferencia|transferir|alias/i.test(t)) {
        payMethod = 'Transferencia Bancaria (Alias: republica.carne.mp)';
      } else if (isNumericPayment3 || /mp|mercado|link|tarjeta/i.test(t)) {
        payMethod = 'Mercado Pago (Checkout Pro)';
      } else if (/debito|dÃ©bito/i.test(t)) {
        payMethod = 'DÃ©bito / Tarjeta al retirar';
      } else if (/retirar|sucursal/i.test(t)) {
        payMethod = 'Efectivo / DÃ©bito al retirar';
      } else {
        payMethod = 'Efectivo contraentrega';
      }

      const isDelivery = lastOrder?.deliveryType === 'delivery' || lead?.deliveryType === 'delivery' || Boolean(lastOrder?.address && !lastOrder?.branch);
      const isPickup = !isDelivery && (lastOrder?.deliveryType === 'pickup' || lead?.deliveryType === 'pickup' || Boolean(lastOrder?.branch) || /retirar|sucursal/i.test(t));
      const branchName = lastOrder?.branch || lead.preferredBranch || 'Urca Central (Av. JosÃ© Roque Funes 1115)';
      const destAddr = lastOrder?.address || lead.address || 'tu domicilio';

      if (lastOrder) {
        lastOrder = db.updateOrder(lastOrder.id, {
          status: 'preparing',
          paymentMethod: payMethod,
          deliveryType: isPickup ? 'pickup' : 'delivery',
          ...(isPickup ? { branch: branchName } : { branch: '', address: destAddr })
        });
      } else {
        const { items: historyItems, total: historyTotal, products: parsedProducts } = extractItemsFromHistoryAndText(history, '', products, lead);
        const finalItems = historyItems.length > 0 ? historyItems : [
          'â€¢ 1 combo Combo â€œAsadazoâ€ (4 kg cortes + Vino de regalo) â€” $39.999'
        ];
        const finalTotal = historyTotal > 0 ? historyTotal : 39999;
        lastOrder = db.createOrder({
          jid: lead.jid || lead.id,
          customerName: clientName,
          phone: lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351 626-2475'),
          address: isPickup ? '' : destAddr,
          items: finalItems,
          products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : undefined,
          totalAmount: finalTotal,
          paymentMethod: payMethod,
          status: 'preparing',
          channel: 'WHATSAPP',
          source: 'WHATSAPP',
          origin: 'WHATSAPP',
          deliveryType: isPickup ? 'pickup' : 'delivery',
          branch: isPickup ? branchName : ''
        });
      }

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, {
          stage: 'closed_won',
          deliveryType: isPickup ? 'pickup' : 'delivery',
          ...(isPickup ? { preferredBranch: branchName } : { address: destAddr })
        });
      }

      const destinationText = isPickup 
        ? `para que lo retires listo por nuestra sucursal **${branchName}**` 
        : `para despacharlo dentro de las 24 hs a tu domicilio (**${destAddr}**)`;

      let paymentExtraInfo = '';
      if (payMethod.includes('Transferencia')) {
        paymentExtraInfo = '\nðŸ“± *Alias para transferir:* `republica.carne.mp` (Titular: RepÃºblica de la Carne). Enviame el comprobante por acÃ¡ cuando lo realices. ðŸ‘';
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
        paymentExtraInfo = `\nðŸ”— *Link de pago seguro de Mercado Pago${modeTag}:*\n${dynamicLink || 'https://www.mercadopago.com.ar'}\n\nPodÃ©s abonar con cualquier tarjeta de dÃ©bito/crÃ©dito, dinero en cuenta de MP o transferencia.`;
      }

      return `Â¡De diez ${clientName}! ðŸ¥©ðŸ”¥ Ya quedÃ³ 100% asentado tu pedido${lastOrder ? ` **#${lastOrder.id}**` : ''} con medio de pago **${payMethod}**.\n\nYa lo pasamos al sector de corte ${destinationText}.${paymentExtraInfo}\n\nÂ¡Muchas gracias por tu compra en RepÃºblica de la Carne! ðŸ™Œ [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.2 CORRECCIÃ“N DE TOTAL / RECLAMO DE PEDIDO INCORRECTO ("esta mal el pedido", "esta mal el peddo", "esta mal el total")
    // =========================================================================
    const isOrderComplaint = /esta mal el ped|estÃ¡ mal el ped|el pedido esta mal|el pedido estÃ¡ mal|esta mal el total|estÃ¡ mal el total|el total esta mal|el total estÃ¡ mal|el precio esta mal|el precio estÃ¡ mal|cobraste mal|calculaste mal|corregi el total|corregÃ­ el total|no son tantos|por que tanto|falta el combo|eso no pedi|eso no pedÃ­|no es lo que pedi|no es lo que pedÃ­/i.test(t);
    if (isOrderComplaint) {
      const { items: fullItems, total: fullTotal } = extractItemsFromHistoryAndText(history, '', products);
      const itemsList = fullItems.length > 0 ? fullItems.join('\n') : 'â€¢ 1 combo Combo â€œAsadazoâ€ (4 kg cortes + Vino de regalo) â€” $39.999\nâ€¢ 2 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) â€” $10.000';
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

      return `Â¡Mil disculpas ${clientName}! ðŸ¥© TenÃ©s toda la razÃ³n, se me habÃ­a desfasado el resumen. Te dejo asentado el pedido completo con todos tus cortes:\n\n` +
        `ðŸ“‹ *Detalle corregido de tu pedido (precios por kilo segÃºn corte):*\n${itemsList}\n\n` +
        `ðŸ’° *Total correcto estimado a abonar:* **${formattedTotal}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ“ *DirecciÃ³n de entrega:* ${lead.address || 'Locelso 7100'}\n\n` +
        `ðŸ‘‰ Â¿Confirmamos con este total correcto para despacharte en el dÃ­a? (RespondÃ© *SÃ* para finalizar) ðŸ™Œ [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 0.3 CONFIRMACIÃ“N EXPLÃCITA DE DATOS DE ENVÃO Y AGENDADO ("sÃ­", "correcto", "1", "opciÃ³n 1", etc.)
    // =========================================================================
    const isConfirmationReply = /^(?:s[iÃ­]|correcto|confirmar|confirmo|dale|est[aÃ¡] bien|perfecto|de diez|avanza|avanzar|ok dale|s[iÃ­] dale|s[iÃ­] correcto|exacto|as[iÃ­] es|s[iÃ­] est[aÃ¡] bien|s[iÃ­] perfecto|si confirmo|s[iÃ­] confirmo)$/i.test(cleanConfirmText) ||
      (wasDataConfirmOffered && /^(?:1|1ï¸âƒ£|opci[oÃ³]n 1|la 1|el 1|si|s[iÃ­])$/i.test(t.trim()));

    if (isConfirmationReply) {
      const { items: parsedItems, total: parsedTotal, products: parsedProducts } = extractItemsFromHistoryAndText(history, '', products);
      const finalItems = parsedItems.length > 0 ? parsedItems : [
        'â€¢ 1 combo Combo â€œAsadazoâ€ (4 kg cortes + Vino de regalo) â€” $39.999',
        'â€¢ 2 kg Chorizo Criollo Puro Cerdo (2kg x $10.000 promo) â€” $10.000'
      ];
      const finalTotal = parsedTotal > 0 ? parsedTotal : 49999;
      const formattedTotal = `$${finalTotal.toLocaleString('es-AR')}`;
      const freshLead = db.getLead(lead.jid || lead.id) || lead;
      const addressDest = currentActiveOrder?.address || freshLead.address || lead.address || 'Locelso 7100';
      let clientPhone = (lead.phone && !lead.phone.includes('@lid')) ? lead.phone : (freshLead.phone && !freshLead.phone.includes('@lid') ? freshLead.phone : (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351 626-2475'));

      lead.address = addressDest;
      lead.deliveryType = 'delivery';

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { 
          name: clientName,
          pushName: clientName,
          address: addressDest,
          deliveryType: 'delivery',
          phone: clientPhone,
          isRegistered: true,
          isVerified: true,
          registeredAt: new Date().toISOString(),
          notes: `Cliente agendado y registrado. DirecciÃ³n: ${addressDest} | Tel: ${clientPhone}`
        });
      }

      let orderObj;
      if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
        orderObj = db.updateOrder(currentActiveOrder.id, {
          customerName: clientName,
          address: addressDest,
          deliveryType: 'delivery',
          branch: '',
          items: finalItems,
          products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : currentActiveOrder.products,
          totalAmount: finalTotal,
          paymentMethod: 'Efectivo / Transferencia / Mercado Pago'
        }) || currentActiveOrder;
      } else {
        orderObj = db.createOrder({
          jid: lead.jid || lead.id,
          phone: clientPhone,
          customerName: clientName,
          address: addressDest,
          deliveryType: 'delivery',
          branch: '',
          items: finalItems,
          products: parsedProducts && parsedProducts.length > 0 ? parsedProducts : undefined,
          totalAmount: finalTotal,
          paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
          status: 'pending'
        });
        currentActiveOrder = orderObj;
      }

      const customerNum = lead.customerNumber || `CLI-${(lead.id || '0000').slice(-4).toUpperCase()}`;
      return `Â¡Excelente ${clientName}! ðŸŽ‰ Datos confirmados y agendados con Ã©xito. Ya generamos tu orden de compra:\n\n` +
        `ðŸ†” *NÂ° de Pedido:* #${orderObj.id}\n` +
        `ðŸ‘¤ *Cliente:* ${clientName} (N.Â° ${customerNum})\n` +
        `ðŸ“± *TelÃ©fono:* ${clientPhone}\n` +
        `ðŸ“‹ *RESUMEN DE TU PEDIDO (precios por kilo segÃºn corte):*\n${finalItems.join('\n')}\n\n` +
        `ðŸ’° *Total estimado a abonar:* **${formattedTotal}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ“ *Destino de Entrega:* ${addressDest}\n` +
        `ðŸšš *EnvÃ­o:* Programado en el dÃ­a (dentro de las 24 hs).\n\n` +
        `ðŸ’³ *Paso 4 de 4 â€” Â¿CÃ³mo preferÃ­s abonar?*\n` +
        `1ï¸âƒ£ *Efectivo* al repartidor\n` +
        `2ï¸âƒ£ *Transferencia* (Alias: \`republica.carne.mp\`)\n` +
        `3ï¸âƒ£ *Mercado Pago* (Link directo con tarjetas / dinero en cuenta)\n\n` +
        `ðŸ‘‰ RespondÃ© *1*, *2* o *3*. ðŸ¥© [[STAGE:closed_won]]`;
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
        return `Â¡Hola ${clientName}! ðŸ‘‹ Carlos por acÃ¡, de RepÃºblica de la Carne. Veo que tenÃ©s un pedido activo **#${currentActiveOrder.id}** en estado **${statusLabel}** (Total: ${amountFormatted}).\n\nðŸ‘‰ Â¿QuerÃ©s consultar el estado / modificarlo, o te gustarÃ­a armar un **pedido nuevo**? ðŸ¥©ðŸ”¥ [[STAGE:qualified]]`;
      }

      const isUnregistered = !lead.isRegistered && (isGarbageName(lead.name) || (!nameGreeting && (!lead.name || lead.name.startsWith('+'))));
      if (isUnregistered) {
        return `Â¡Hola! ðŸ‘‹ Carlos por acÃ¡, maestro carnicero de **RepÃºblica de la Carne**.\n\n` +
          `Para agendarte en nuestro sistema y coordinar tus envÃ­os directos en el dÃ­a, Â¿me indicarÃ­as por favor:\n` +
          `ðŸ‘¤ **Tu Nombre y Apellido**\n` +
          `ðŸ“ **Tu DirecciÃ³n de Entrega y Barrio** (o si preferÃ­s retirar por sucursal)\n\n` +
          `Â¡Y contame quÃ© cortes o promo tenÃ­as ganas de preparar hoy para armarte la propuesta perfecta! ðŸ¥©ðŸ”¥ [[STAGE:qualified]]`;
      }

      return `Â¡Hola ${clientName}! ðŸ‘‹ Carlos por acÃ¡, maestro carnicero de RepÃºblica de la Carne. Te ayudo a armar tu pedido para que no te falte nada.\n\nÂ¿EstÃ¡s planeando un asado, comida familiar o querÃ©s aprovechar nuestras ofertas del dÃ­a? Contame quÃ© cortes estÃ¡s buscando o para cuÃ¡ntas personas calculamos y te armo la propuesta perfecta. ðŸ¥©ðŸ”¥ [[STAGE:qualified]]`;
    }

    // =========================================================================
    // 0.5 CONSULTA Y MODIFICACIÃ“N DE DATOS PERSONALES
    // =========================================================================
    const emailMatch = t.match(/^(?:mi email es|mi correo es|cambiar mi email a|email)\s*[:=]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                       t.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && (/email|correo|anota mi mail|guarda mi mail/i.test(t) || t.startsWith('mi email es') || t.startsWith('mi correo es'))) {
      const email = emailMatch[1].trim();
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { email });
      }
      return `Â¡Perfecto ${clientName}! ðŸ“§ QuedÃ³ guardado tu correo electrÃ³nico: **${email}** en tu ficha de cliente.\n\nÂ¿En quÃ© mÃ¡s te puedo ayudar hoy? ðŸ™Œ [[STAGE:proposal]]`;
    }

    const nameUpdateMatch = t.match(/^(?:cambiar mi nombre a|mi nombre es|me llamo|decime|anotame como)\s+([a-zÃ¡Ã©Ã­Ã³ÃºÃ±A-ZÃÃ‰ÃÃ“ÃšÃ‘\s]{2,30})$/i);
    if (nameUpdateMatch) {
      const newName = nameUpdateMatch[1].trim();
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { name: newName, pushName: newName, realName: newName });
      }
      return `Â¡De diez! ðŸ¥© Ya actualicÃ© tu nombre en el sistema como **${newName}**. Â¡Un gusto atenderte! ðŸ™Œ [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 1. RECHAZO DE COMPLEMENTOS / CIERRE DE ÃTEMS DEL PEDIDO ("solo eso, evio a domicilio", "nada mÃ¡s", "solo eos")
    // =========================================================================
    const isDeclineComplements = /^(?:no,? )?(?:solo eso|soo eso|solo eos|solo es|nada m[aÃ¡]s|eso solo|eso nada m[aÃ¡]s|ninguno|as[iÃ­] est[aÃ¡] bien|dejalo as[iÃ­]|dame mi pedido|pasemos directo|directo al env[iÃ­]o|sin complementos|solo lo que ped[iÃ­])/i.test(cleanConfirmText) ||
                                 /(?:solo eso|solo eos|nada m[aÃ¡]s|eso solo|solo para env[iÃ­]o|solo para evio)/i.test(t);

    // =========================================================================
    // 2. DETECTOR DE DIRECCIÃ“N Y NOMBRE REAL (PRESENTACIÃ“N Y SOLICITUD DE CONFIRMACIÃ“N)
    // =========================================================================
    const isInformationalQuery = /(?:hora|horario|cierran|abren|cuanto|precio|costo|consulta|duda|donde|dÃ³nde|a que hora|tenes|tenÃ©s|vendes|vendÃ©s|abierto|atienden|cocinar|comer|comida|receta|familia|somos|personas|comensales|amigos|invitados|asado|parrilla|fuego|bife|milanesa|guiso|carne|kilo|kilos|kg|opcion|opciÃ³n|combo|promo)\b/i.test(t);
    const hasAddressPatterns = /(?:calle|av\b|av\.|avenida|bv\b|bv\.|bulevar|barrio|piso|dpto|departamento|timbre|nro|nÂ°|funes|locelso|pidal|alamos|alcorta|luchesse|quiros|colon|urca|cerro|entre|altura|manzana|lote|san martin)\b/i.test(t) ||
      /^(?:te paso mi direccion|mi direccion es|direccion:?|la direccion es|la direccion de entrega es|vivo en|estoy en|mandalo a|mandar a|enviar a|entregar en)\s+/i.test(t) ||
      (/^[a-zÃ¡Ã©Ã­Ã³ÃºÃ±ÃÃ‰ÃÃ“ÃšÃ‘\s\.\-]+\s+[0-9]{2,5}$/i.test(cleanConfirmText) && !/(?:somos|para|kilo|kilos|kg|cocinar|comer|familia|personas|bifes|platos|opcion|opciÃ³n|combos?|hacer)/i.test(cleanConfirmText));
    const hasRealAddress = !isInformationalQuery && hasAddressPatterns && (/[0-9]{1,5}/.test(t) || /vivo en|enviar a|mandar a|entregar en/i.test(t) || ((/funes|locelso|pidal|quiros|alamos|alcorta|luchesse/i.test(t)) && /[0-9]{2,5}/.test(t)));

    if (hasRealAddress && t.length > 5 && !isGarbageAddress(rawText)) {
      let extractedName = '';
      let cleanAddress = extractCleanAddress(rawText);

      const comboMatch = rawText.match(/(?:mi nombre(?: es)?|me llamo|soy|nombre:?)\s+([A-Za-zÃÃ‰ÃÃ“ÃšÃ¡Ã©Ã­Ã³ÃºÃ±Ã‘]+(?:\s+[A-Za-zÃÃ‰ÃÃ“ÃšÃ¡Ã©Ã­Ã³ÃºÃ±Ã‘]+){0,3})(?:\s+y\b|\s+vivo|\s+en|,|\.|$|\bdireccion)/i);
      if (comboMatch && comboMatch[1].trim().length >= 3) {
        const cand = comboMatch[1].trim();
        if (!isGarbageName(cand)) extractedName = cand;
      }

      if (cleanAddress && cleanAddress.length >= 4 && !isGarbageAddress(cleanAddress)) {
        let finalClientName = extractedName || clientName;

      const phoneMatch = rawText.match(/(?:tel|cel|telefono|telÃ©fono|wsp|whatsapp)?\s*[:\-\s]?\s*(\+?54\s*9?\s*\d{8,12}|\b351\d{7}\b|\b15\d{7,8}\b|\b\d{10,13}\b)/i);
      let clientPhone = (lead.phone && !lead.phone.includes('@lid')) ? lead.phone : (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351 626-2475');
      if (phoneMatch && phoneMatch[1]) {
        clientPhone = phoneMatch[1].trim();
      }

      if (currentActiveOrder) {
        db.updateOrder(currentActiveOrder.id, {
          address: cleanAddress,
          deliveryType: 'delivery',
          branch: ''
        });
      }

      db.updateLead(lead.jid || lead.id, { 
        address: cleanAddress, 
        phone: clientPhone,
        deliveryType: 'delivery',
        ...(finalClientName ? { name: finalClientName, pushName: finalClientName } : {}),
        notes: `DirecciÃ³n registrada: ${cleanAddress}${finalClientName ? ` | Nombre: ${finalClientName}` : ''} | Tel: ${clientPhone}`
      });

      // Evaluar si la direcciÃ³n cumple con las condiciones y filtros de entrega
      const addressFilter = OrderFilterEngine.evaluateOrder({
        phone: clientPhone,
        address: cleanAddress,
        deliveryType: 'delivery'
      });

      if (!addressFilter.allowed && addressFilter.action === 'pickup_only') {
        return `Â¡Hola ${finalClientName}! ðŸ“ Tomamos nota de tu ubicaciÃ³n en **${cleanAddress}**.\n\n` +
          `âš ï¸ *Aviso de Cobertura de EnvÃ­os:*\n${addressFilter.message}\n\n` +
          `ðŸª *PodÃ©s retirar tus cortes frescos en cualquiera de nuestras 6 sucursales:*\n` +
          `1ï¸âƒ£ *Urca Central* (ðŸ“ Av. JosÃ© Roque Funes 1115)\n` +
          `2ï¸âƒ£ *Urca 2 â€“ Alto Tejeda* (ðŸ“ Av. MenÃ©ndez Pidal 3575)\n` +
          `3ï¸âƒ£ *Intercountry â€“ Corteza Mall* (ðŸ“ Av. Los Ãlamos 1015)\n` +
          `4ï¸âƒ£ *Duarte QuirÃ³s* (ðŸ“ Av. Duarte QuirÃ³s 5130)\n` +
          `5ï¸âƒ£ *Villa Allende â€“ Mercadito de la Villa* (ðŸ“ Av. Figueroa Alcorta 480)\n` +
          `6ï¸âƒ£ *Country San Isidro â€“ Alto Tejeda* (ðŸ“ Av. Padre Luchesse km 2)\n\n` +
          `ðŸ‘‰ *RespondÃ© con el nÃºmero (1 al 6) de tu sede preferida para dejÃ¡rtelo listo.* ðŸ¥©ðŸ™Œ [[STAGE:proposal]]`;
      }

      const canonical = getCanonicalCart(lead, history, rawText, products);
      const itemsList = canonical.items.length > 0 ? canonical.items : ['â€¢ 1 kg VacÃ­o Especial Seleccionado â€” $11.500'];
      const finalTotal = canonical.total > 0 ? canonical.total : 11500;
      const formattedTotal = `$${finalTotal.toLocaleString('es-AR')}`;

        return `ðŸ“‹ *FICHA DE REGISTRO Y DATOS DE ENVÃO:*\n\n` +
        `ðŸ‘¤ *Destinatario / Cliente:* **${finalClientName}**\n` +
        `ðŸ“± *TelÃ©fono de Contacto:* **${clientPhone}**\n` +
        `ðŸ“ *DirecciÃ³n de Entrega:* **${cleanAddress}**\n` +
        `ðŸ¥© *Detalle del Pedido (precios por kilo segÃºn corte):*\n${itemsList.join('\n')}\n\n` +
        `ðŸ’° *Total estimado a abonar:* **${formattedTotal}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ‘‰ **Â¿Confirmamos estos datos para agendarte y guardarte en el sistema?**\n` +
        `1ï¸âƒ£ Confirmar datos y pasar al pago\n` +
        `2ï¸âƒ£ Modificar algÃºn dato (nombre, telÃ©fono o direcciÃ³n)\n` +
        `3ï¸âƒ£ Cancelar pedido\n\n` +
        `ðŸ‘‰ RespondÃ© *1*, *2* o *3* (o escribÃ­ *SÃ* para confirmar). ðŸ¥©ðŸšš [[STAGE:confirming_data]]`;
      }
    }

    // =========================================================================
    // 3. INTENCIÃ“N DE ENVÃO SIN DIRECCIÃ“N ESPECÃFICA (ej: "solo eso, evio a domicilio", "dale envÃ­amelo", "te paso mi direcciÃ³n")
    // =========================================================================
    const isDeliveryIntentWithoutAddress = /(?:a|para)\s+(?:mi\s+)?(?:domicilio|casa|depto|departamento)|(?:hacelo|mandamelo|mandÃ¡melo|enviame|envÃ­ame|envialo|envÃ­alo|quiero\s+envio|quiero\s+envÃ­o|con\s+envio|con\s+envÃ­o|por\s+delivery|hacer\s+delivery|evio a domicilio|envio a domicilio|envÃ­o a domicilio|a domicilio|para envio|para envÃ­o|para evio|dale enviamelo|dale envÃ­amelo|te paso mi direcci|te paso la direcci|te paso mi dir|paso mi direcci|paso direccion)/i.test(t) && 
      !/[0-9]{2,5}/.test(t) && 
      !/(?:funes|locelso|pidal|quiros|alamos|alcorta|luchesse|colon|urca|calle|av\.|avenida|barrio|altura)/i.test(t);

    if (isDeliveryIntentWithoutAddress || (isDeclineComplements && /domicilio|envio|envÃ­o|evio/i.test(t))) {
      if (lead.address && lead.address.length >= 5 && !isGarbageAddress(lead.address)) {
        const canonical = getCanonicalCart(lead, history, '', products);
        const finalItems = canonical.items.length > 0 ? canonical.items : ['â€¢ 1 kg VacÃ­o Especial Seleccionado â€” $11.500'];
        const formattedTotal = `$${(canonical.total || 11500).toLocaleString('es-AR')}`;
        const clientPhone = lead.phone || (lead.jid && !lead.jid.includes('@lid') ? `+${lead.jid.split('@')[0]}` : '+54 9 351');

        return `ðŸ“‹ *FICHA DE REGISTRO Y DATOS DE ENVÃO:*\n\n` +
          `ðŸ‘¤ *Destinatario / Cliente:* **${clientName}**\n` +
          `ðŸ“± *TelÃ©fono de Contacto:* **${clientPhone}**\n` +
          `ðŸ“ *DirecciÃ³n de Entrega:* **${lead.address}**\n` +
          `ðŸ¥© *Detalle del Pedido (precios por kilo segÃºn corte):*\n${finalItems.join('\n')}\n\n` +
          `ðŸ’° *Total estimado a abonar:* **${formattedTotal}**\n` +
          `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
          `ðŸ‘‰ **Â¿Confirmamos estos datos para agendarte y guardarte en el sistema?**\n` +
          `1ï¸âƒ£ Confirmar datos y pasar al pago\n` +
          `2ï¸âƒ£ Modificar algÃºn dato (nombre, telÃ©fono o direcciÃ³n)\n` +
          `3ï¸âƒ£ Cancelar pedido\n\n` +
          `ðŸ‘‰ RespondÃ© *1*, *2* o *3* (o escribÃ­ *SÃ* para confirmar). ðŸ¥©ðŸšš [[STAGE:confirming_data]]`;
      }
      return `Â¡De diez ${clientName}! ðŸ›µ Programamos el envÃ­o directo a tu puerta en el dÃ­a.\n\nPor favor, indÃ­canos con precisiÃ³n:\nðŸ“ *DirecciÃ³n de Entrega:* (Calle, NÃºmero/Altura y Barrio)\nðŸ‘¤ *Nombre y Apellido:* (Para la etiqueta del paquete)\n\nÂ¡AsÃ­ verificamos los datos y dejamos listo tu pedido! ðŸ¥© [[STAGE:proposal]]`;
    }

    if (isDeclineComplements) {
      const canonical = getCanonicalCart(lead, history, '', products);
      const itemsList = canonical.items.length > 0 ? canonical.items.join('\n') : 'â€¢ 1 kg VacÃ­o Especial Seleccionado â€” $11.500';
      const formattedTotal = `$${(canonical.total || 11500).toLocaleString('es-AR')}`;

      return `Â¡De diez ${clientName}! ðŸ¥©ðŸšš Cerramos con tu pedido confirmado:\n\n` +
        `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte):*\n${itemsList}\n\n` +
        `ðŸ’° *Total estimado:* **${formattedTotal}**\n` +
        `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
        `ðŸ‘‰ *Paso 3 de 4 â€” Â¿CÃ³mo preferÃ­s recibir tu pedido?*\n` +
        `1ï¸âƒ£ *EnvÃ­o a Domicilio* (te lo llevamos en el dÃ­a)\n` +
        `2ï¸âƒ£ *Retiro en Sucursal* (en cualquiera de nuestras 6 sedes en CÃ³rdoba)\n\n` +
        `ðŸ‘‰ RespondÃ© *1* o *2* (o pasame directamente tu direcciÃ³n o sucursal). ðŸ™Œ [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3.5 ASESORAMIENTO CULINARIO Y RECETAS (ASADOS, MILANESAS, GUISOS, HORNO)
    // =========================================================================
    const isCulinaryConsultation = /(?:para hacer|para preparar|recomendas para|recomendÃ¡s para|que me recomendas|quÃ© me recomendÃ¡s|que corte|quÃ© corte|para guiso|para estofado|para milanesas|para horno|para asado|para un asado|para el asado|para asadito|para un asadito|hacer milanesas|hacer un asado|hacer un asadito|hacer asado|hacer asadito|preparar un asado|preparar asadito|somos \d+|para (?:los\s+)?\d+|asado para|asadito para|asado con|cocinar|cocinar en casa|comida en casa|plato familiar|almorzar|cenar)/i.test(t) && !hasSpecificCutsWithQtyEarly;
    if (isCulinaryConsultation) {
      const advice = ChatStrategyGraphService.handleCulinaryAndAsado(rawText, clientName, products);
      if (advice) return advice;
    }

    // =========================================================================
    // 4. DETECCIÃ“N EXACTA DE ÃTEMS, CANTIDADES Y ADICIONES / CORRECCIONES
    // =========================================================================
    const isAdditionOrder = /agrega|agregÃ¡|agregar|agregame|agregale|suma|sumÃ¡|sumar|sumale|sumame|sumar|ademas|ademÃ¡s|tambien|tambiÃ©n|sumale tambiÃ©n|mas los|mÃ¡s los|mas 1|mas 2|y los|y las|y 1|y 2/i.test(t);
    const isCorrectionOrder = /corregi|corregÃ­|corrije|corrijÃ­|corregime|corrijeme|solo quiero|quiero solo|un solo|una sola|no, solo|nada mas|en vez de|sacale|sacÃ¡|saca|quita|quitar|quitalo|quitame|cambiame|cambia|cambiÃ¡|reemplaza|reemplazÃ¡/i.test(t);
    const hasOrderVerb = /(?:quiero|mandame|mandÃ¡melo|mandamelo|enviame|envÃ­ame|traeme|traÃ©me|armame|armÃ¡me|anotame|anÃ³tame|dame|separame|sepÃ¡rame|preparame|prepÃ¡rame|haceme|llevame|llevale|tenes|tenÃ©s|vendes|vendÃ©s)/i.test(t);
    const hasQuantityExplicit = /(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|combo|bolsa|botella|bifes?|tiras?|piezas?|chorizos?|morcillas?|milanesas?|costeletas?)|medio\s+kilo|1\/2\s*kg|\b\d+\s+(?:de\s+)?(?:kilos?|kg|unidades?))/i.test(t);
    const isQuestionOrInquiry = /^(?:qu[eÃ©]|cu[aÃ¡]l|cu[aÃ¡]les|mostrame|pasame|decime)\s+(?:opciones|cortes|tipos|variedades|precios|promo|ofertas?|de\s+)/i.test(t) || 
      /(?:qu[eÃ©]\s+opciones|qu[eÃ©]\s+hay|qu[eÃ©]\s+cortes|qu[eÃ©]\s+variedad|qu[eÃ©]\s+tipos)/i.test(t);

    const mentionedProducts = findAllMentionedProducts(rawText, products);
    const matchedSingleProduct = matchBestProduct(rawText, products);
    const hasProductMention = (mentionedProducts && mentionedProducts.length > 0) || matchedSingleProduct !== null || /combo|asadazo|vacio|vacÃ­o|costillar|tapa|cuadril|entraÃ±a|matambre|milanesa|chori|morcilla|molida|costeleta|pata muslo|carbon|carbÃ³n|vino|pollo|peceto|lomo|nalga|bola|falda|asado|carne/i.test(t);
    const isQuantityOnlyMsg = /(?:^|\s)(?:\d+(?:[\.,]\d+)?\s*(?:kg|kilos?|unidades?|un\b|bifes?|piezas?|combos?|bolsas?|botellas?)|medio\s+kilo|1\/2\s*kg|dos|tres|cuatro|cinco|seis|ocho|diez|\d+)(?:\s|$)/i.test(t);

    if (((hasProductMention || isAdditionOrder || isCorrectionOrder || isQuantityOnlyMsg) && !isQuestionOrInquiry) || (hasProductMention && (hasOrderVerb || hasQuantityExplicit))) {
      // 1. Si el cliente pide o menciona mÃºltiples productos (ej: "quiero vacÃ­o y chorizos", "asado, matambre y carbÃ³n")
      if (mentionedProducts.length >= 2 && !hasQuantityExplicit && !isCorrectionOrder && !isQuantityOnlyMsg) {
        return formatProductQuantityPrompt(mentionedProducts, clientName);
      }

      // 2. Si el cliente pide un corte genÃ©rico con mÃºltiples variedades (ej: "cuadril", "matambre", "chorizo", "milanesas")
      const ambiguous = findAmbiguousProducts(rawText, products);
      if (ambiguous && ambiguous.matches && ambiguous.matches.length >= 2 && !isCorrectionOrder && !isQuantityOnlyMsg && !hasQuantityExplicit) {
        const formattedAmbiguous = formatNumberedCatalog(ambiguous.matches);
        return `Â¡De diez ${clientName}! ðŸ¥© En mostrador tenemos varias opciones de **${ambiguous.term}**: ðŸ‘‡\n\n` +
          `${formattedAmbiguous}\n\n` +
          `ðŸ‘‰ *Â¿CuÃ¡l de estas opciones preferÃ­s que te preparemos y cuÃ¡ntos kilos o unidades te separamos?* ðŸ¥©ðŸšš [[STAGE:proposal]]`;
      }

      // 3. Si el cliente pide o menciona un producto especÃ­fico pero NO indicÃ³ cantidad explÃ­cita (peso o unidad)
      if (!hasQuantityExplicit && !isCorrectionOrder && !isQuantityOnlyMsg) {
        const targetPromptProd = (mentionedProducts.length > 0 ? mentionedProducts[0] : null) || matchedSingleProduct;
        if (targetPromptProd && !/combo asadazo/i.test(targetPromptProd.name || '')) {
          return formatProductQuantityPrompt(targetPromptProd, clientName);
        }
      }

      const { items: detectedItems, total: detectedTotal, addedItems, products: detectedProducts } = extractItemsFromHistoryAndText(history, rawText, products, lead);
      
      if (detectedItems.length > 0) {
        if (lead) {
          lead.draftCart = {
            items: detectedItems,
            total: detectedTotal,
            products: detectedProducts,
            updatedAt: new Date().toISOString()
          };
          if (lead.jid || lead.id) {
            db.updateLead(lead.jid || lead.id, { draftCart: lead.draftCart });
          }
        }
        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          db.updateOrder(currentActiveOrder.id, {
            items: detectedItems,
            products: detectedProducts,
            totalAmount: detectedTotal
          });
        }
        const formattedTotal = `$${detectedTotal.toLocaleString('es-AR')}`;
        let prefixGreeting = `Â¡De diez ${clientName}! ðŸ¥© Te separo los cortes solicitados:`;
        
        // CÃ¡lculo y asesoramiento de comensales / personas si el cliente lo mencionÃ³
        const peopleOrderMatch = rawText.match(/(?:para|somos|comemos|seremos|seriamos|calculale|asado\s+para|un\s+asado\s+para)\s+(?:unos\s+|unas\s+)?(\d{1,3})\s*(?:personas?|comensales|amigos|invitados|familiares|bocas|peronas)?/i) ||
          rawText.match(/(\d{1,3})\s*(?:personas|comensales|invitados|amigos|peronas)/i);

        let peopleAdviceNote = '';
        if (peopleOrderMatch) {
          const peopleCount = parseInt(peopleOrderMatch[1], 10);
          if (peopleCount > 0 && peopleCount <= 100) {
            const recommendedKg = Number((peopleCount * 0.5).toFixed(1));
            let totalMeatKg = 0;
            for (const itm of detectedProducts || []) {
              if ((itm.unit || '').toLowerCase() === 'kg') {
                totalMeatKg += Number(itm.quantity) || 0;
              } else if (itm.isUnitMode && itm.unitCount > 0) {
                totalMeatKg += Number((itm.unitCount / (itm.unitsPerKg || 8)).toFixed(2));
              } else if ((itm.unit || '').toLowerCase() === 'combo') {
                totalMeatKg += 4;
              }
            }

            if (totalMeatKg >= recommendedKg) {
              prefixGreeting = `Â¡Excelente ${clientName}! ðŸ¥© Para *${peopleCount} personas* calculamos un promedio de *${recommendedKg} kg en total* (~500g por comensal) y con tu selecciÃ³n tenÃ©s un asado de diez:`;
            } else {
              const diffKg = (recommendedKg - totalMeatKg).toFixed(1);
              peopleAdviceNote = `\nðŸ’¡ *Sugerencia opcional:* Para *${peopleCount} personas* solemos calcular ~${recommendedKg} kg en total (~500g por comensal). Tu pedido suma ~${totalMeatKg.toFixed(1)} kg. Â¿Te gustarÃ­a sumar ${diffKg} kg mÃ¡s de algÃºn corte (como vacÃ­o o mÃ¡s costilla), o preferÃ­s avanzar directamente con este pedido? ðŸ™Œ\n`;
            }
          }
        }

        if (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)) {
          prefixGreeting = `Â¡Actualizado ${clientName}! ðŸ¥© Modificamos y dejamos asentado tu pedido **#${currentActiveOrder.id}**:`;
        } else if (isAdditionOrder && addedItems && addedItems.length > 0) {
          const addedDesc = addedItems.map(a => `${a.quantity} ${a.prod.unit} ${a.prod.name}`).join(' y ');
          prefixGreeting = `Â¡De diez ${clientName}! ðŸ¥© Sumamos *${addedDesc}* a tu pedido:`;
        } else if (isCorrectionOrder) {
          prefixGreeting = `Â¡Corregido ${clientName}! ðŸ‘ Dejamos asentado tu pedido actualizado:`;
        } else if (addedItems && addedItems.length > 0) {
          const addedDesc = addedItems.map(a => `${a.quantity} ${a.prod.unit} ${a.prod.name}`).join(' y ');
          prefixGreeting = `Â¡De diez ${clientName}! ðŸ¥© Sumamos *${addedDesc}* a tu pedido:`;
        }

        const orderNotice = currentActiveOrder ? ` (Pedido #${currentActiveOrder.id})` : '';

        const crossSelling = getCrossSellingSuggestion(detectedItems, products);
        const crossSellingSection = crossSelling ? `${crossSelling}\n\n` : '';

        return `${prefixGreeting}\n\n` +
          `ðŸ“‹ *Detalle de tu pedido (precios por kilo segÃºn corte)${orderNotice}:*\n` +
          `${detectedItems.join('\n')}\n\n` +
          `ðŸ’° *Total acumulado estimado:* **${formattedTotal}**\n` +
          `*(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variaciÃ³n segÃºn el pesaje exacto final en balanza).*\n\n` +
          peopleAdviceNote +
          crossSellingSection +
          (currentActiveOrder && ['pending', 'preparing'].includes(currentActiveOrder.status)
            ? `ðŸ“ *Entrega:* ${currentActiveOrder.address || lead.address || currentActiveOrder.branch || 'A coordinar'}\n\nÂ¿PrecisÃ¡s realizar algÃºn otro cambio o lo dejamos listo para despachar? ðŸ™Œ [[STAGE:proposal]]`
            : `ðŸ‘‰ *Â¿CÃ³mo seguimos con tu pedido?*\n` +
              `1ï¸âƒ£ Coordinar *EnvÃ­o a Domicilio* en el dÃ­a ðŸ›µ\n` +
              `2ï¸âƒ£ Elegir *Retiro por Sucursal* (6 sedes en CÃ³rdoba) ðŸª\n` +
              `3ï¸âƒ£ Sumar mÃ¡s cortes o complementos (chorizos, carbÃ³n, vino) ðŸ¥©\n\n` +
              `ðŸ‘‰ *RespondÃ© 1, 2 o 3 (o escribÃ­ "delivery", "sucursal" o los cortes).* ðŸ™Œ [[STAGE:proposal]]`);
      }
    }

    // =========================================================================
    // 5. CONSULTA DE OFERTAS, PRECIOS, CORTES ESPECÃFICOS Y CATÃLOGO DINÃMICO
    // =========================================================================
    const isCategoryQuery = /cerdo|porcino|achura|achuras|molleja|chinchulin|chinchulines|combo|combos|promo|promos|embutido|embutidos|chorizo|morcilla|pollo|aviar|bebida|bebidas|vino|vinos|almacen|almacÃ©n|carbon|carbÃ³n/i.test(t);

    // 5.1 Consulta por producto especÃ­fico o PLU
    const isExplicitPriceOrAvailabilityAsk = /(?:cu[aÃ¡]nto|precio|costo|a cu[aÃ¡]nto|sale|cuesta|ten[eÃ©]s|vendes|vend[eÃ©]s)/i.test(t) || /^(?:plu|c[oÃ³]digo|cod\.?)/i.test(t);

    if (matchedSingleProduct && isExplicitPriceOrAvailabilityAsk && !/combo asadazo/i.test(matchedSingleProduct.name) && !/(?:opciones|variedad|tipos)/i.test(t)) {
      return formatProductQuantityPrompt(matchedSingleProduct, clientName);
    }

    // 5.2 Consulta por categorÃ­a (ej: "cerdo", "achuras", "combos", "embutidos", "chorizo")
    if (isCategoryQuery || isQuestionOrInquiry) {
      let targetCategory = 'Parrilla y Vacuno';
      let catIcon = 'ðŸ¥©';
      let searchKey = '';
      if (/chorizo|chori/i.test(t)) { targetCategory = 'Achuras y Embutidos'; catIcon = 'ðŸŒ­'; searchKey = 'chori'; }
      else if (/cerdo|porcino/i.test(t)) { targetCategory = 'Cerdo'; catIcon = 'ðŸ·'; searchKey = 'cerdo'; }
      else if (/achura|molleja|chinchulin/i.test(t)) { targetCategory = 'Achuras'; catIcon = 'ðŸ”¥'; searchKey = 'achura'; }
      else if (/combo|promo/i.test(t)) { targetCategory = 'Combos en Oferta'; catIcon = 'â­'; searchKey = 'combo'; }
      else if (/embutido|morcilla/i.test(t)) { targetCategory = 'Embutidos Artesanales'; catIcon = 'ðŸŒ­'; searchKey = 'morcilla'; }
      else if (/matambre/i.test(t)) { targetCategory = 'Parrilla y Vacuno'; catIcon = 'ðŸ¥©'; searchKey = 'matambre'; }
      else if (/pollo|aviar/i.test(t)) { targetCategory = 'Pollo'; catIcon = 'ðŸ—'; searchKey = 'pollo'; }
      else if (/bebida|vino/i.test(t)) { targetCategory = 'Bebidas'; catIcon = 'ðŸ·'; searchKey = 'vino'; }
      else if (/almacen|carbon/i.test(t)) { targetCategory = 'AlmacÃ©n Parrillero'; catIcon = 'ðŸªµ'; searchKey = 'carbon'; }

      let catProducts = searchKey ? getCatalogByCategory(searchKey, products, 8) : getCatalogByCategory(targetCategory, products, 8);
      if (catProducts.length > 0) {
        const productLines = catProducts.map((cp, idx) => {
          const pluInfo = cp.plu ? ` [PLU ${cp.plu}]` : '';
          return `${idx + 1}ï¸âƒ£ *${cp.name}*${pluInfo} âž” *$${Number(cp.price).toLocaleString('es-AR')}* / ${cp.unit || 'kg'}`;
        }).join('\n');

        const titleHeader = searchKey ? searchKey.toUpperCase() : targetCategory.toUpperCase();
        return `Â¡AcÃ¡ tenÃ©s nuestras mejores opciones en **${titleHeader}** ${catIcon}! ðŸ¥©\n\n` +
          `${productLines}\n\n` +
          `ðŸ‘‰ Decime cuÃ¡l te gustarÃ­a que te preparemos o cuÃ¡ntos kilos te separamos y te lo dejamos listo. ðŸšš [[STAGE:proposal]]`;
      }
    }

    // 5.3 Consulta general de precios y catÃ¡logo
    const isOffersQuery = /oferta|ofertas|promo|promos|promocion|promociones|lista de precios|precios|precio|que tenes|que tenÃ©s|que hay|que cortes|carta|catalogo|catÃ¡logo/i.test(t);
    if (isOffersQuery) {
      // Generar ofertas DINÃMICAMENTE desde db.getProducts() â€” fuente Ãºnica de verdad
      const featuredProducts = getFeaturedWhatsAppOffers(products);
      const productLines = featuredProducts.map((cp, idx) => {
        const pluInfo = cp.plu ? ` [PLU ${cp.plu}]` : '';
        const promoTag = /promo|x \$/i.test(cp.name) ? ' ðŸ”¥' : '';
        return `â€¢ **${cp.name}${pluInfo}:** $${Number(cp.price).toLocaleString('es-AR')} / ${cp.unit || 'kg'}${promoTag}`;
      }).join('\n');

      const totalAvailable = (products && products.length > 0) ? products.length : featuredProducts.length;

      return `Â¡MirÃ¡ ${clientName}! ðŸ”¥ Estas son nuestras **OFERTAS Y CORTES DESTACADOS** del dÃ­a en RepÃºblica de la Carne:\n\n` +
        `ðŸ¥© **CORTES Y PROMOS SELECCIONADOS:**\n` +
        `${productLines}\n\n` +
        `ðŸ‘‰ Contamos con ${totalAvailable} cortes y productos frescos registrados con entrega en el dÃ­a en CÃ³rdoba. Â¿QuÃ© corte te gustarÃ­a que te preparemos o para cuÃ¡ntas personas calculamos? ðŸ¥©ðŸšš [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 6. ASESORAMIENTO CULINARIO, RECETAS Y CÃLCULO DE ASADOS POR COMENSALES
    // =========================================================================
    const culinaryAdvice = ChatStrategyGraphService.handleCulinaryAndAsado(rawText, clientName, products);
    if (culinaryAdvice) {
      return culinaryAdvice;
    }

    // =========================================================================
    // 7. SUCURSALES Y HORARIOS
    // =========================================================================
    if (t.includes('sucursal') || t.includes('sucursales') || t.includes('donde') || t.includes('direccion') || t.includes('horario') || t.includes('urca') || t.includes('quiros') || t.includes('villa allende') || t.includes('san isidro')) {
      return `ðŸª **Nuestras 6 Sucursales en CÃ³rdoba y Gran CÃ³rdoba:**\n\n` +
        `1. **Urca Central:** Av. JosÃ© Roque Funes 1115 (ðŸ“ž +54 9 3513 906947) â€” Lun a SÃ¡b 9 a 21 hs | Dom 9 a 13:30 hs.\n` +
        `2. **Urca 2 (Alto Tejeda):** Av. MenÃ©ndez Pidal 3575 (ðŸ“ž +54 9 3518 623195).\n` +
        `3. **Intercountry (Corteza Mall):** Av. Los Ãlamos 1015 (ðŸ“ž +54 9 3518 623194) â€” Todos los dÃ­as 9 a 21 hs.\n` +
        `4. **Duarte QuirÃ³s:** Av. Duarte QuirÃ³s 5130 (ðŸ“ž +54 9 3518 156595) â€” 9 a 13:30 y 17 a 21 hs.\n` +
        `5. **Villa Allende (Mercadito de la Villa):** Av. Figueroa Alcorta 480 (ðŸ“ž +54 9 3513 540031).\n` +
        `6. **Country San Isidro (Alto Tejeda):** Av. Padre Luchesse km 2 (ðŸ“ž +54 9 3518 769099).\n\n` +
        `ðŸ›µ **Â¡TambiÃ©n tenemos Delivery en el dÃ­a a todo CÃ³rdoba!** Â¿Por cuÃ¡l sucursal preferÃ­s retirar o a quÃ© direcciÃ³n te lo enviamos? ðŸ¥©`;
    }

    // =========================================================================
    // 8. REENGANCHE CORDIAL FUERA DE FLUJO (SMALLTALK) & FALLBACK DINÃMICO
    // =========================================================================
    return ChatStrategyGraphService.handleOutOfFlow(rawText, clientName, lead);
  }
}

