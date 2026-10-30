import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from './database.js';
import { matchBestProduct } from './ai.js';

function cleanJsonResponse(raw = '') {
  const s = String(raw || '').trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : s;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function normalizeUnit(rawUnit = '') {
  const u = String(rawUnit || '').toLowerCase().trim();
  if (/^k|kilo/.test(u)) return 'kg';
  if (/^g|gram/.test(u)) return 'gr';
  if (/media\s*res|medias?\s*reses?/.test(u)) return 'media_res';
  if (/caja/.test(u)) return 'caja';
  if (/bolsa/.test(u)) return 'bolsa';
  if (/horma/.test(u)) return 'horma';
  if (/tira/.test(u)) return 'tira';
  if (/penca/.test(u)) return 'penca';
  if (/gancho/.test(u)) return 'gancho';
  if (/bandeja/.test(u)) return 'bandeja';
  if (/pack/.test(u)) return 'pack';
  return 'un';
}

function matchBranchFromText(text = '', branches = []) {
  if (!text) return null;
  const lower = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const aliasRules = [
    { id: 'br-6', rx: /\b(?:san\s*isidro|luchesse|country\s*san\s*isidro)\b/i },
    { id: 'br-5', rx: /\b(?:villa\s*allende|allende|mercadito|alcorta)\b/i },
    { id: 'br-4', rx: /\b(?:duarte\s*quiros|quiros|las\s*palmas)\b/i },
    { id: 'br-3', rx: /\b(?:intercountry|corteza|los\s*alamos)\b/i },
    { id: 'br-2', rx: /\b(?:urca\s*2|alto\s*tejeda|menendez\s*pidal|pidal)\b/i },
    { id: 'br-1', rx: /\b(?:urca\s*central|urca\s*1|roque\s*funes|\burca\b)\b/i }
  ];

  for (const rule of aliasRules) {
    if (rule.rx.test(lower)) {
      const found = branches.find(b => b.id === rule.id);
      if (found) return found;
    }
  }

  for (const b of branches) {
    const bNorm = String(b.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (bNorm && lower.includes(bNorm)) return b;
  }
  return null;
}

export class InternalOrderOcrService {
  /**
   * Analiza imágenes (planillas manuscritas, pizarras, capturas, notas), PDFs, audios transcriptos o mensajes de texto
   * enviados en un grupo silencioso de WhatsApp y determina si corresponde a:
   * - 'internal_order' (pedido de Sucursal -> Administración o Administración -> Sucursal)
   * - 'supplier_invoice' (factura/remito fiscal externo de proveedor con precios/CUIT)
   * - 'ignore' (saludos casuales o mensajes sin pedido)
   */
  static async analyzeGroupPayload({
    imagePath = null,
    mimeType = 'image/jpeg',
    text = '',
    senderPhone = '',
    senderName = '',
    isFromMe = false,
    groupConfig = {}
  } = {}) {
    const branches = db.getBranches() || [];
    const products = db.getProducts() || [];
    const settings = db.getSettings() || {};

    const senderBranch = senderPhone ? db.getBranchByPhone(senderPhone) : null;
    const configuredBranch = groupConfig?.branchId
      ? branches.find(b => b.id === groupConfig.branchId) || null
      : null;

    let aiParsed = null;

    // 1. Intentar extracción estructurada con IA Multimodal (Gemini Vision -> OpenAI Vision/Chat fallback)
    try {
      aiParsed = await this._analyzeWithMultimodalAI({
        imagePath,
        mimeType,
        text,
        senderName,
        senderBranchName: senderBranch?.name || configuredBranch?.name || '',
        isFromMe,
        branches,
        settings
      });
    } catch (err) {
      console.warn('[InternalOrderOCR] Aviso IA multimodal, aplicando parser determinístico:', err.message);
    }

    // 2. Fallback determinístico si no hubo respuesta IA o si es texto/audio directo
    if (!aiParsed && text) {
      aiParsed = this.parseTextHeuristic({
        text,
        senderBranch,
        configuredBranch,
        isFromMe,
        branches
      });
    }

    if (!aiParsed) {
      return { classification: 'ignore', reason: 'no_extractable_content' };
    }

    if (aiParsed.classification === 'supplier_invoice') {
      return { classification: 'supplier_invoice', rawAi: aiParsed };
    }

    if (aiParsed.classification !== 'internal_order' || !Array.isArray(aiParsed.items) || aiParsed.items.length === 0) {
      // Si el texto tiene ítems claros pero la IA dudó, intentar heurística antes de descartar
      if (text) {
        const fallback = this.parseTextHeuristic({
          text,
          senderBranch,
          configuredBranch,
          isFromMe,
          branches
        });
        if (fallback && fallback.classification === 'internal_order' && fallback.items.length > 0) {
          aiParsed = fallback;
        } else {
          return { classification: 'ignore', reason: 'not_an_internal_order' };
        }
      } else {
        return { classification: 'ignore', reason: 'empty_items' };
      }
    }

    // 3. Normalizar dirección (Sucursal -> Administración vs Administración -> Sucursal) y sucursales involucradas
    let direction = aiParsed.direction;
    if (groupConfig?.defaultDirection === 'branch_to_admin' || groupConfig?.defaultDirection === 'admin_to_branch') {
      if (!direction || direction === 'auto') direction = groupConfig.defaultDirection;
    }

    const textCombined = `${text || ''} ${aiParsed.rawText || ''} ${aiParsed.sourceBranch || ''} ${aiParsed.targetUnit || ''}`;
    const mentionedBranch =
      matchBranchFromText(aiParsed.sourceBranch, branches) ||
      matchBranchFromText(aiParsed.targetUnit, branches) ||
      matchBranchFromText(textCombined, branches) ||
      senderBranch ||
      configuredBranch ||
      branches[0];

    if (direction !== 'branch_to_admin' && direction !== 'admin_to_branch') {
      const adminToBranchCue =
        /\b(?:sale\s+para|enviamos\s+a|despacho\s+para|administraci[oó]n\s+a|central\s+a|mandamos\s+a|reparto\s+para|asignado\s+a)\b/i.test(textCombined) ||
        (isFromMe && !senderBranch);
      direction = adminToBranchCue ? 'admin_to_branch' : 'branch_to_admin';
    }

    let sourceBranchId = null;
    let sourceBranchName = '';
    let targetBranchId = null;
    let targetUnitName = '';

    if (direction === 'branch_to_admin') {
      sourceBranchId = (senderBranch || mentionedBranch)?.id || 'br-1';
      sourceBranchName = (senderBranch || mentionedBranch)?.name || aiParsed.sourceBranch || 'Sucursal';
      targetBranchId = null;
      targetUnitName = aiParsed.targetUnit && !/sucursal/i.test(aiParsed.targetUnit)
        ? aiParsed.targetUnit
        : 'Administración Central / Desposte';
    } else {
      sourceBranchId = null;
      sourceBranchName = 'Administración Central';
      targetBranchId = mentionedBranch?.id || 'br-1';
      targetUnitName = mentionedBranch?.name || aiParsed.targetUnit || 'Sucursal Destino';
    }

    // 4. Enriquecer cada ítem contra el catálogo real (PLU, categoría, nombre canónico)
    const enrichedItems = aiParsed.items
      .map((rawItem, idx) => {
        const rawName = String(rawItem.name || rawItem.description || '').trim();
        if (!rawName) return null;
        const matchedProd = typeof matchBestProduct === 'function'
          ? matchBestProduct(rawName, products)
          : products.find(p => p.name.toLowerCase().includes(rawName.toLowerCase()));

        let qty = Number(String(rawItem.quantity ?? 1).replace(',', '.'));
        if (Number.isNaN(qty) || qty <= 0) qty = 1;
        let unit = normalizeUnit(rawItem.unit || matchedProd?.unit || 'kg');
        if (unit === 'gr' && qty >= 100) {
          qty = Number((qty / 1000).toFixed(3));
          unit = 'kg';
        }

        return {
          lineNumber: idx + 1,
          name: rawName,
          canonicalName: matchedProd?.name || rawName,
          matchedProductId: matchedProd?.id || null,
          plu: rawItem.plu || matchedProd?.plu || '',
          category: matchedProd?.category || rawItem.category || 'Mercadería General',
          quantity: qty,
          unit,
          notes: String(rawItem.notes || '').trim()
        };
      })
      .filter(Boolean);

    if (enrichedItems.length === 0) {
      return { classification: 'ignore', reason: 'no_valid_items_after_enrichment' };
    }

    const dirArrow = direction === 'branch_to_admin'
      ? `${sourceBranchName} → ${targetUnitName}`
      : `${sourceBranchName} → ${targetUnitName}`;

    const summary =
      aiParsed.summary ||
      `${dirArrow}: ${enrichedItems.slice(0, 4).map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}${enrichedItems.length > 4 ? ` (+${enrichedItems.length - 4} más)` : ''}`;

    return {
      classification: 'internal_order',
      direction,
      sourceBranchId,
      sourceBranchName,
      targetBranchId,
      targetUnitName,
      priority: /urgente|ya\b|hoy\s+temprano|faltante\s+cr[ií]tico|sin\s+stock/i.test(`${textCombined} ${aiParsed.priority || ''}`)
        ? 'urgent'
        : 'normal',
      requestedFor: aiParsed.requestedFor || '',
      rawText: aiParsed.rawText || text || '',
      summary,
      notes: aiParsed.notes || '',
      confidence: Number(aiParsed.confidence ?? 0.92),
      items: enrichedItems
    };
  }

  static async _analyzeWithMultimodalAI({
    imagePath,
    mimeType,
    text,
    senderName,
    senderBranchName,
    isFromMe,
    branches,
    settings
  }) {
    const branchListStr = branches.map(b => `${b.id}: ${b.name} (${b.address})`).join(' | ');
    const systemInstruction = `Sos un motor experto de OCR y Logística Frigorífica para "República de la Carne" (Córdoba, Argentina).
Analizá el mensaje/imagen/documento de un grupo interno entre Sucursales y Administración Central.
Sucursales oficiales: ${branchListStr}.
Emisor en WhatsApp: "${senderName || 'Operador'}" ${senderBranchName ? `(Asociado a: ${senderBranchName})` : ''} ${isFromMe ? '(Enviado desde línea central/administración)' : ''}.

Clasificá estrictamente en JSON puro (sin bloques markdown):
{
  "classification": "internal_order" | "supplier_invoice" | "ignore",
  "direction": "branch_to_admin" | "admin_to_branch",
  "sourceBranch": "Nombre de sucursal o Administración",
  "targetUnit": "Administración Central o Nombre de sucursal destino",
  "priority": "normal" | "urgent",
  "requestedFor": "Ej: Mañana primera hora / Turno tarde / vacío",
  "rawText": "Transcripción fiel del texto manuscrito/impreso/escrito",
  "summary": "Resumen ejecutivo de 1 línea del pedido interno",
  "notes": "Observaciones adicionales",
  "confidence": 0.95,
  "items": [
    {
      "name": "Nombre del corte, insumo o producto",
      "quantity": 10,
      "unit": "kg | un | media_res | caja | bolsa | tira | penca | horma | bandeja",
      "notes": "Detalle opcional (ej: sin hueso, envasado al vacío)"
    }
  ]
}

Reglas:
1. Si es una FACTURA FISCAL o TICKET CON PRECIOS, IVA, CUIT o TOTAL EN PESOS de un proveedor externo (frigorífico/avícola/insumos), devolvé "classification": "supplier_invoice" (items puede ir vacío).
2. Si es un PEDIDO INTERNO de mercadería/cortes/insumos/reposición (foto de papel manuscrito, planilla, pizarra o lista de texto) que pide una Sucursal a Administración ("branch_to_admin") o que Administración envía/asigna a una Sucursal ("admin_to_branch"), devolvé "classification": "internal_order" y extraé TODOS los renglones en "items".
3. Si es solo charla casual ("buen día", "ok recibido", "gracias", foto irrelevante), devolvé "classification": "ignore".`;

    let base64Data = null;
    let resolvedMime = mimeType || 'image/jpeg';
    if (imagePath && fs.existsSync(imagePath)) {
      base64Data = fs.readFileSync(imagePath).toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      if (ext === '.png') resolvedMime = 'image/png';
      else if (ext === '.webp') resolvedMime = 'image/webp';
      else if (ext === '.pdf') resolvedMime = 'application/pdf';
      else resolvedMime = 'image/jpeg';
    }

    // A) Gemini Vision / Flash
    const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
    if (geminiKey && geminiKey.length > 15) {
      const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const mName of modelsToTry) {
        try {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: mName });
          const parts = [
            `${systemInstruction}\n\nTexto adjunto en el chat: "${text || '(sin texto adjunto)'}"`
          ];
          if (base64Data) {
            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: resolvedMime
              }
            });
          }
          const result = await model.generateContent(parts);
          const raw = result?.response?.text?.() || '';
          if (raw) {
            return JSON.parse(cleanJsonResponse(raw));
          }
        } catch (gErr) {
          console.warn(`[InternalOrderOCR] Gemini (${mName}) fallo:`, gErr.message);
        }
      }
    }

    // B) OpenAI Vision / GPT-4o-mini fallback
    const openaiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY || '';
    if (openaiKey && openaiKey.startsWith('sk-') && resolvedMime !== 'application/pdf') {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const userContent = [
          { type: 'text', text: `Texto adjunto en el chat: "${text || '(sin texto adjunto)'}"` }
        ];
        if (base64Data) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${resolvedMime};base64,${base64Data}` }
          });
        }
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userContent }
          ]
        });
        const raw = completion.choices?.[0]?.message?.content || '';
        if (raw) {
          return JSON.parse(cleanJsonResponse(raw));
        }
      } catch (oErr) {
        console.warn('[InternalOrderOCR] OpenAI fallback fallo:', oErr.message);
      }
    }

    return null;
  }

  /**
   * Parser determinístico de alta precisión para listas de pedidos internos por texto o transcripción de voz.
   */
  static parseInternalOrderFast(text = '', opts = {}) {
    return this.parseTextHeuristic({ text, ...opts });
  }

  static parseTextHeuristic({ text = '', senderBranch = null, configuredBranch = null, isFromMe = false, branches = [] }) {
    const clean = String(text || '').trim();
    if (!clean || clean.length < 5) return null;

    // Descartar saludos cortos sin números ni mercadería
    if (!/\d/.test(clean) && clean.split(/\s+/).length < 5) {
      return { classification: 'ignore' };
    }

    // Si parece factura fiscal con CUIT o "Factura A/B" y montos grandes
    if (/\b(?:factura\s+[abc]|cuit\s*\d{2}-?\d{8}|\$\s*\d{2,3}\.\d{3})\b/i.test(clean) && !/\b(?:pedido|necesitamos|mandar|enviar\s+a\s+sucursal|reposici[oó]n)\b/i.test(clean)) {
      return { classification: 'supplier_invoice' };
    }

    const lines = clean
      .split(/[\r\n;]+|(?:\s+-\s+)|(?:,\s*(?=\d+\s*(?:kg|kilos?|un|cajas?|bolsas?|medias?|tiras?|hormas?)\b))/i)
      .map(l => l.replace(/^[•*\-–—\s]+/, '').trim())
      .filter(Boolean);

    const items = [];
    const qtyFirstRx = /^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|grs?|gramos|un|unidades?|cajas?|bolsas?|medias?\s*res(?:es)?|tiras?|pencas?|hormas?|ganchos?|bandejas?|packs?)?\s*(?:de\s+)?([a-záéíóúñ0-9\s/().-]{2,60})$/i;
    const nameFirstRx = /^([a-záéíóúñ\s/().-]{3,50}?)\s*[:\-–=]?\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|grs?|gramos|un|unidades?|cajas?|bolsas?|medias?\s*res(?:es)?|tiras?|pencas?|hormas?|ganchos?|bandejas?|packs?)\b/i;

    for (const line of lines) {
      // Ignorar encabezados puros ("Pedido Urca 2 para mañana:")
      if (/^(?:hola|buen\s*d[ií]a|buenas|pedido|reposici[oó]n|sucursal|admin|administraci[oó]n|para\s+ma[ñn]ana|sale\s+para)\b/i.test(line) && !/\d+\s*(?:kg|kilo|caja|bolsa|media|un|tira)/i.test(line)) {
        continue;
      }

      const subLine = line.replace(/^(?:necesitamos|mandar|enviar|falta|pedimos|agrega|sumar)\s+/i, '').trim();
      const m1 = subLine.match(qtyFirstRx);
      if (m1) {
        const nameClean = m1[3].replace(/\b(?:para\s+sucursal.*|urgente.*)$/i, '').trim();
        if (nameClean.length >= 2) {
          items.push({
            name: nameClean,
            quantity: parseFloat(m1[1].replace(',', '.')),
            unit: normalizeUnit(m1[2] || 'kg'),
            notes: ''
          });
          continue;
        }
      }

      const m2 = subLine.match(nameFirstRx);
      if (m2) {
        const nameClean = m2[1].trim();
        if (nameClean.length >= 2) {
          items.push({
            name: nameClean,
            quantity: parseFloat(m2[2].replace(',', '.')),
            unit: normalizeUnit(m2[3] || 'kg'),
            notes: ''
          });
        }
      }
    }

    if (items.length === 0) {
      return { classification: 'ignore' };
    }

    const adminToBranch =
      /\b(?:sale\s+para|enviamos\s+a|despacho\s+(?:a|para)|administraci[oó]n\s+a|central\s+a|mandamos\s+a|reparto\s+para)\b/i.test(clean) ||
      (isFromMe && !senderBranch);

    const detectedBranch = matchBranchFromText(clean, branches) || senderBranch || configuredBranch;

    return {
      classification: 'internal_order',
      direction: adminToBranch ? 'admin_to_branch' : 'branch_to_admin',
      sourceBranch: adminToBranch ? 'Administración Central' : (detectedBranch?.name || 'Sucursal'),
      targetUnit: adminToBranch ? (detectedBranch?.name || 'Sucursal') : 'Administración Central',
      priority: /urgente|ya\b|sin\s+stock/i.test(clean) ? 'urgent' : 'normal',
      rawText: clean,
      confidence: 0.85,
      items
    };
  }

  /**
   * Construye un detalle consolidado analítico de todos los pedidos internos (por dirección, sucursal y corte).
   */
  static buildConsolidatedSummary(orders = []) {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const byBranch = new Map();
    const byProduct = new Map();

    let branchToAdminCount = 0;
    let adminToBranchCount = 0;
    let pendingCount = 0;
    let dispatchedCount = 0;
    let urgentCount = 0;
    let totalKgRequested = 0;
    let totalUnitsRequested = 0;

    for (const ord of safeOrders) {
      if (ord.status === 'cancelled') continue;
      if (ord.direction === 'admin_to_branch') adminToBranchCount++;
      else branchToAdminCount++;

      if (ord.status === 'detected' || ord.status === 'approved' || ord.status === 'preparing') pendingCount++;
      if (ord.status === 'dispatched' || ord.status === 'received') dispatchedCount++;
      if (ord.priority === 'urgent') urgentCount++;

      const branchKey = ord.direction === 'branch_to_admin'
        ? (ord.sourceBranchName || 'Sucursal')
        : (ord.targetUnitName || 'Sucursal');

      if (!byBranch.has(branchKey)) {
        byBranch.set(branchKey, {
          branchName: branchKey,
          branchId: ord.sourceBranchId || ord.targetBranchId || null,
          ordersFromBranch: 0,
          ordersFromAdmin: 0,
          pendingOrders: 0,
          totalItems: 0,
          totalKg: 0
        });
      }
      const bStat = byBranch.get(branchKey);
      if (ord.direction === 'admin_to_branch') bStat.ordersFromAdmin++;
      else bStat.ordersFromBranch++;
      if (['detected', 'approved', 'preparing'].includes(ord.status)) bStat.pendingOrders++;

      for (const it of (ord.items || [])) {
        const qty = Number(it.quantity) || 0;
        const unit = it.unit || 'kg';
        if (unit === 'kg') {
          totalKgRequested += qty;
          bStat.totalKg = Number((bStat.totalKg + qty).toFixed(2));
        } else {
          totalUnitsRequested += qty;
        }
        bStat.totalItems++;

        const prodKey = `${(it.canonicalName || it.name || '').toLowerCase().trim()}__${unit}`;
        if (!byProduct.has(prodKey)) {
          byProduct.set(prodKey, {
            name: it.canonicalName || it.name,
            plu: it.plu || '',
            category: it.category || 'General',
            unit,
            totalQuantity: 0,
            branchToAdminQty: 0,
            adminToBranchQty: 0,
            pendingQty: 0,
            occurrences: 0,
            branches: new Set()
          });
        }
        const pStat = byProduct.get(prodKey);
        pStat.totalQuantity = Number((pStat.totalQuantity + qty).toFixed(2));
        if (ord.direction === 'admin_to_branch') {
          pStat.adminToBranchQty = Number((pStat.adminToBranchQty + qty).toFixed(2));
        } else {
          pStat.branchToAdminQty = Number((pStat.branchToAdminQty + qty).toFixed(2));
        }
        if (['detected', 'approved', 'preparing'].includes(ord.status)) {
          pStat.pendingQty = Number((pStat.pendingQty + qty).toFixed(2));
        }
        pStat.occurrences++;
        pStat.branches.add(branchKey);
      }
    }

    return {
      totals: {
        totalOrders: safeOrders.filter(o => o.status !== 'cancelled').length,
        branchToAdminCount,
        adminToBranchCount,
        pendingCount,
        dispatchedCount,
        urgentCount,
        totalKgRequested: Number(totalKgRequested.toFixed(2)),
        totalUnitsRequested: Number(totalUnitsRequested.toFixed(2))
      },
      branchBreakdown: [...byBranch.values()].sort((a, b) => (b.ordersFromBranch + b.ordersFromAdmin) - (a.ordersFromBranch + a.ordersFromAdmin)),
      productBreakdown: [...byProduct.values()]
        .map(p => ({ ...p, branches: [...p.branches] }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
    };
  }
}

export default InternalOrderOcrService;

