import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { SpeechService } from './speech.js';
import { mercadoPagoService } from './mercadopago.js';

/**
 * Catálogo Maestro de Cortes y Precios de República de la Carne
 */
const MASTER_CATALOG = [
  { 
    keywords: ['combo asadazo', 'combo “asadazo”', 'combo asado', 'asadazo', 'azadazo', 'asasazo', 'asadaso', 'azadaso', 'combo parrillero', 'combo 4kg', 'combo 4 kg', 'combo'], 
    name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', 
    price: 39999, 
    unit: 'combo', 
    category: 'Combos en Oferta' 
  },
  { 
    keywords: ['tapa de cuadril', 'tapa cuadril', 'colita de cuadril', 'cuadril'], 
    name: 'Tapa de Cuadril Seleccionada', 
    price: 12800, 
    unit: 'kg', 
    category: 'Parrilla y Horno' 
  },
  { 
    keywords: ['vacio especial', 'vacío especial', 'vacio tierno', 'vacío tierno', 'vacio', 'vacío'], 
    name: 'Vacío Especial Seleccionado', 
    price: 11500, 
    unit: 'kg', 
    category: 'Parrilla' 
  },
  { 
    keywords: ['costillar de novillito', 'asado de tira novillito', 'costillar', 'asado de tira', 'tira de asado', 'costilla novillito', 'costillar novillito', 'tira novillito'], 
    name: 'Costillar / Asado de Tira Novillito', 
    price: 9800, 
    unit: 'kg', 
    category: 'Parrilla' 
  },
  { 
    keywords: ['bife de chorizo', 'bife chorizo', 'bifes de chorizo', 'ojo de bife', 'bife de lomo'], 
    name: 'Bife de Chorizo Premium', 
    price: 14500, 
    unit: 'kg', 
    category: 'Cortes Premium' 
  },
  { 
    keywords: ['entraña fina', 'entrana fina', 'entraña', 'entrana', 'entrecot', 'enrecor'], 
    name: 'Entraña Fina Seleccionada', 
    price: 16900, 
    unit: 'kg', 
    category: 'Cortes Premium' 
  },
  { 
    keywords: ['matambre de cerdo', 'matambrito de cerdo', 'matambre cerdo', 'matambrito cerdo', 'matambrito'], 
    name: 'Matambrito de Cerdo Tiernizado', 
    price: 8500, 
    unit: 'kg', 
    category: 'Cerdo y Parrilla' 
  },
  { 
    keywords: ['matambre de vaca', 'matambre vacuno', 'matambre'], 
    name: 'Matambre Vacuno', 
    price: 9500, 
    unit: 'kg', 
    category: 'Parrilla y Horno' 
  },
  { 
    keywords: ['bondiola de cerdo', 'bondiola cerdo', 'bondiola'], 
    name: 'Bondiola de Cerdo sin Hueso', 
    price: 8900, 
    unit: 'kg', 
    category: 'Cerdo' 
  },
  { 
    keywords: ['costeleta de cerdo', 'costeletas de cerdo', 'costeleta cerdo', 'costeletas cerdo', 'chuleta de cerdo', 'chuletas de cerdo'], 
    name: 'Costeletas de Cerdo (2kg x $15.000 promo)', 
    price: 7500, 
    unit: 'kg', 
    category: 'Cerdo' 
  },
  { 
    keywords: ['costeleta de ternera', 'costeletas de ternera', 'costeleta ternera', 'costeletas ternera', 'costeleta', 'costeletas'], 
    name: 'Costeletas de Ternera (2kg x $35.000 promo)', 
    price: 17500, 
    unit: 'kg', 
    category: 'Cortes Tradicionales' 
  },
  { 
    keywords: ['chorizo criollo puro cerdo', 'chorizo de cerdo', 'chorizos de cerdo', 'chorizo cerdo', 'chorizos cerdo', 'chori de cerdo', 'choris de cerdo', 'chorizo criollo', 'chori criollo', 'chorizo puro cerdo', 'chorizo', 'chorizos', 'chori', 'choris'], 
    name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', 
    price: 5000, 
    unit: 'kg', 
    category: 'Embutidos' 
  },
  { 
    keywords: ['morcilla bombon', 'morcilla bombón', 'morcillas bombon', 'morcillas bombón', 'morcilla', 'morcillas'], 
    name: 'Morcilla Bombón Parrillera', 
    price: 5200, 
    unit: 'kg', 
    category: 'Embutidos' 
  },
  { 
    keywords: ['molleja de corazon', 'mollejas de corazon', 'molleja', 'mollejas'], 
    name: 'Mollejas de Corazón', 
    price: 14800, 
    unit: 'kg', 
    category: 'Achuras' 
  },
  { 
    keywords: ['chinchulin', 'chinchulines', 'chinchu'], 
    name: 'Chinchulines Crocantes', 
    price: 4800, 
    unit: 'kg', 
    category: 'Achuras' 
  },
  { 
    keywords: ['carne molida especial', 'molida especial', 'picada especial', 'carne picada especial', 'molida de primera', 'molida magra', 'picada de primera', 'picada magra'], 
    name: 'Carne Molida Especial Seleccionada (Magra)', 
    price: 11800, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    keywords: ['carne molida intermedia', 'molida intermedia', 'carne molida comun', 'molida comun', 'carne molida común', 'molida común', 'carne molida', 'carne picada', 'molida', 'picada'], 
    name: 'Carne Molida Intermedia (3kg x $27.000 promo)', 
    price: 9000, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    keywords: ['milanesas de ternera', 'milanesa de ternera', 'milanesas', 'milanesa'], 
    name: 'Milanesas de Ternera preparadas (2kg x $24.990)', 
    price: 12495, 
    unit: 'kg', 
    category: 'Diario y Preparados' 
  },
  { 
    keywords: ['pata muslo', 'pollo fresco', 'pollo', 'suprema de pollo', 'pechuga'], 
    name: 'Pata Muslo Fresca (3kg x $13.990 promo)', 
    price: 4660, 
    unit: 'kg', 
    category: 'Pollo' 
  },
  { 
    keywords: ['carbon quebracho', 'carbón quebracho', 'bolsa de carbon', 'bolsa de carbón', 'carbon', 'carbón'], 
    name: 'Carbón Quebracho Blanco (Bolsa Grande)', 
    price: 2200, 
    unit: 'bolsa', 
    category: 'Almacén Parrillero' 
  },
  { 
    keywords: ['vino howlmande', 'howlmande malbec', 'vino', 'howlmande', 'malbec'], 
    name: 'Vino Howlmande Malbec Reserva', 
    price: 5500, 
    unit: 'botella', 
    category: 'Bebidas' 
  }
];

/**
 * Encuentra el producto que mejor encaja en un texto buscando la coincidencia de palabra clave más larga/específica
 */
function matchBestProduct(chunk) {
  const c = (chunk || '').toLowerCase().trim();
  if (!c) return null;

  let bestMatch = null;
  let maxKeywordLength = 0;

  for (const prod of MASTER_CATALOG) {
    for (const kw of prod.keywords) {
      if (c.includes(kw)) {
        if (kw.length > maxKeywordLength) {
          maxKeywordLength = kw.length;
          bestMatch = prod;
        }
      }
    }
  }

  return bestMatch;
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
 * Parsea cantidades tanto en dígitos ("2", "1.5") como en texto en español ("un solo", "dos", "medio")
 */
function parseQuantity(str) {
  const s = (str || '').toLowerCase();
  if (/(?:un\s+solo|una\s+sola|1\s+solo|uno\s+solo|solo\s+un|solo\s+1|\bun\b|\buno\b|\buna\b)/i.test(s)) return 1;
  if (/(?:dos\s+solos|2\s+solos|\bdos\b)/i.test(s)) return 2;
  if (/(?:tres\b)/i.test(s)) return 3;
  if (/(?:cuatro\b)/i.test(s)) return 4;
  if (/(?:cinco\b)/i.test(s)) return 5;
  if (/(?:medio\s+kilo|1\/2\s*kg|medio\b)/i.test(s)) return 0.5;
  const numMatch = s.match(/([0-9]+(?:[\.,][0-9]+)?)/);
  if (numMatch) return parseFloat(numMatch[1].replace(',', '.'));
  return 1;
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
  if (a.length < 5) return true;
  if (!/[0-9]/.test(a) && !/funes|locelso|pidal|quiros|alamos|alcorta|colon/i.test(a)) return true;
  if (/^(?:mi domicilio|mi casa|a mi domicilio|domicilio|ok quiero)/i.test(a)) return true;
  return false;
}

/**
 * Extrae con precisión los cortes y cantidades pedidos a lo largo de la conversación, sin duplicar
 * Soporta adición acumulativa ("quisiera agregar 1 kilo de chorizo") y corrección ("un solo combo")
 */
function extractItemsFromHistoryAndText(history, text, products, lead = null) {
  const isCorrection = /corregi|corregí|corrije|corrijí|corregime|corrijeme|corregilo|corrijelo|arregla|arreglame|cambia|cambiame|modifica|modificame|solo quiero|un solo|una sola|no, solo|nada mas|en vez de|me equivoque|te equivocaste/i.test(text || '');
  const isAddition = /agrega|agregá|agregar|agregame|agregale|suma|sumá|sumar|sumale|sumame|sumar|ademas|además|tambien|también|sumale también|mas los|más los/i.test(text || '');

  // 1. Extraer los ítems del mensaje actual
  const currentChunks = (text || '').split(/[\n,\.]+|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+/i);
  const currentItemsMap = new Map(); // name -> { prod, quantity }

  for (const chunk of currentChunks) {
    const prod = matchBestProduct(chunk);
    if (prod) {
      const qty = parseQuantity(chunk);
      if (currentItemsMap.has(prod.name)) {
        currentItemsMap.get(prod.name).quantity += qty;
      } else {
        currentItemsMap.set(prod.name, { prod, quantity: qty });
      }
    }
  }

  // Si el mensaje actual solo contiene cantidad (ej: "2 kilos") sin nombre de corte explícito,
  // buscar en el mensaje anterior del historial qué corte se estaba conversando
  if (currentItemsMap.size === 0 && /(?:kilo|kg|quilo|[0-9]+)/i.test(text || '')) {
    const lastProd = findLastMentionedProduct(history);
    if (lastProd) {
      const qty = parseQuantity(text);
      currentItemsMap.set(lastProd.name, { prod: lastProd, quantity: qty });
    }
  }

  // 2. Si es una adición o corrección parcial, traemos los ítems previos de la orden activa o historial
  const finalItemsMap = new Map();

  // Recuperar ítems previos
  let previousItemsFound = false;
  if (lead && (lead.jid || lead.id)) {
    const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
    if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
      for (const itemStr of lastOrder.items) {
        const prod = matchBestProduct(itemStr);
        if (prod) {
          const qty = parseQuantity(itemStr);
          finalItemsMap.set(prod.name, { prod, quantity: qty });
          previousItemsFound = true;
        }
      }
    }
  }

  if (!previousItemsFound) {
    const prevTexts = (history || [])
      .filter(m => m.sender === 'user' && m.content.trim() !== (text || '').trim())
      .map(m => m.content)
      .join('\n');

    const prevChunks = prevTexts.split(/[\n,\.]+|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+/i);
    for (const chunk of prevChunks) {
      const prod = matchBestProduct(chunk);
      if (prod && !finalItemsMap.has(prod.name)) {
        const qty = parseQuantity(chunk);
        finalItemsMap.set(prod.name, { prod, quantity: qty });
      }
    }
  }

  if (isAddition || currentItemsMap.size > 0 && finalItemsMap.size > 0 && !isCorrection) {
    // Sumar o actualizar los ítems del mensaje actual
    for (const [name, itemObj] of currentItemsMap.entries()) {
      if (finalItemsMap.has(name) && isAddition) {
        finalItemsMap.get(name).quantity += itemObj.quantity;
      } else {
        finalItemsMap.set(name, itemObj);
      }
    }
  } else if (isCorrection) {
    // Si es corrección específica (ej: "un solo combo asadazo"), actualizar el combo y mantener los otros ítems
    if (currentItemsMap.size > 0) {
      for (const [name, itemObj] of currentItemsMap.entries()) {
        finalItemsMap.set(name, itemObj);
      }
    } else {
      for (const [name, itemObj] of currentItemsMap.entries()) {
        finalItemsMap.set(name, itemObj);
      }
    }
  } else {
    // Flujo normal: usar los ítems detectados en la conversación
    if (currentItemsMap.size > 0) {
      for (const [name, itemObj] of currentItemsMap.entries()) {
        finalItemsMap.set(name, itemObj);
      }
    }
  }

  if (finalItemsMap.size === 0) {
    for (const [name, itemObj] of currentItemsMap.entries()) {
      finalItemsMap.set(name, itemObj);
    }
  }

  const items = [];
  let total = 0;

  for (const { prod, quantity } of finalItemsMap.values()) {
    const dbProd = (products || []).find(p => (p.name || '').toLowerCase() === prod.name.toLowerCase());
    const unitPrice = dbProd ? Number(dbProd.price) : prod.price;
    const sub = Math.round(unitPrice * quantity);
    items.push(`• ${quantity} ${prod.unit} ${prod.name} — $${sub.toLocaleString('es-AR')}`);
    total += sub;
  }

  if (items.length === 0) {
    items.push('• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999');
    total = 39999;
  }

  // Sincronizar en base de datos si hay una orden activa
  if (lead && (lead.jid || lead.id)) {
    const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
    if (lastOrder && (isAddition || isCorrection || currentItemsMap.size > 0)) {
      db.updateOrder(lastOrder.id, {
        items,
        totalAmount: total
      });
    }
  }

  return { items, total, addedItems: Array.from(currentItemsMap.values()) };
}

export class AIService {
  /**
   * Genera la respuesta del agente de IA para un mensaje de WhatsApp
   */
  static async generateReply({ jid, incomingText, isAudioInput = false }) {
    const settings = db.getSettings();
    const lead = db.getLead(jid) || { name: 'Cliente', stage: 'new_lead', tags: [] };
    const history = db.getMessages(jid, 8);
    const knowledgeBase = db.getKnowledgeBase();
    const products = db.getProducts();

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');

      if (settings.aiProvider === 'gemini' && isValidGeminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        let modelName = settings.aiModel || 'gemini-pro-latest';
        let model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `System Instruction:\n${settings.systemPrompt}\n\nCliente: ${incomingText}\n\nResponde como el carnicero Carlos:`;
        try {
          const result = await model.generateContent(prompt);
          replyText = result.response.text();
        } catch (geminiErr) {
          console.warn(`Error con modelo ${modelName}, usando motor inteligente directo:`, geminiErr.message);
          replyText = this.generateDynamicReply(incomingText, lead, knowledgeBase, settings);
        }
      } else if (settings.aiProvider === 'openai' && isValidOpenAiKey) {
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const completion = await openai.chat.completions.create({
          model: settings.aiModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: incomingText }
          ],
          temperature: 0.7,
          max_tokens: 450
        });
        replyText = completion.choices[0]?.message?.content || '';
      } else {
        replyText = this.generateDynamicReply(incomingText, lead, knowledgeBase, settings);
      }
    } catch (error) {
      console.error('Error generando respuesta con IA:', error);
      replyText = this.generateDynamicReply(incomingText, lead, knowledgeBase, settings);
    }

    let suggestedStage = null;
    const stageMatch = replyText.match(/\[\[STAGE:([a-zA-Z_]+)\]\]/);
    if (stageMatch) {
      suggestedStage = stageMatch[1];
      replyText = replyText.replace(/\[\[STAGE:[a-zA-Z_]+\]\]/, '').trim();
      db.updateLeadStage(jid, suggestedStage);
    }

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
  static generateDynamicReply(text, lead, knowledgeBase, settings) {
    const t = (text || '').toLowerCase().trim();
    const rawText = text || '';
    const customerName = lead.pushName || lead.name || '';
    const nameGreeting = customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') ? ` ${customerName}` : '';
    const products = db.getProducts();
    const history = db.getMessages(lead.jid || lead.id, 10);

    // =========================================================================
    // 0. SOLICITUD DE LINK DE PAGO / MERCADO PAGO
    // =========================================================================
    const isLinkRequest = /link|link de pago|marcado pago|mercadopago|mercado pago|tarjeta|abonar con mp|pagar con mp/i.test(t);
    if (isLinkRequest) {
      const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      const amount = lastOrder ? lastOrder.totalAmount : 39999;
      const orderId = lastOrder ? lastOrder.id : `ORD-${Date.now().toString().slice(-4)}`;
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      
      const isSandbox = (settings?.mercadopagoMode || 'sandbox') === 'sandbox';
      const sandboxTag = isSandbox ? '💳 *[MERCADO PAGO CHECKOUT PRO]*\n' : '';
      const linkUrl = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=2050924390-6312e69b-5204-487b-a44b-c792df651611';
      
      return `${sandboxTag}¡De diez ${clientName}! 🥩💳 Para abonar tu pedido **#${orderId}** por **$${amount.toLocaleString('es-AR')}** con Mercado Pago, podés hacerlo fácilmente:\n\n1️⃣ **Transferencia / Dinero en cuenta:**\n📱 *Alias Mercado Pago:* \`republica.carne.mp\`\n\n2️⃣ **Link de Pago Directo (Checkout Pro):**\n🔗 ${linkUrl}\n\nEn cuanto se acredite, ¡comenzamos la preparación de tus cortes en carnicería! 🙌`;
    }

    // =========================================================================
    // 0.1 CONFIRMACIÓN DE MÉTODO DE PAGO
    // =========================================================================
    const isPaymentChoice = /^(efectivo|transferencia|transferir|al repartidor|contra entrega|contraentrega|por mp|mercado pago|pago al recibir|abono al repartidor|abono en efectivo|al retirar|abono al retirar|pago al retirar|en sucursal|en la sucursal|abono en sucursal|pago en sucursal|con debito|con débito|tarjeta al retirar|debito|débito|al buscarlo)$/i.test(t.trim()) ||
                           /(?:efectivo al repartidor|por transferencia|abono en efectivo|al recibir|abono al retirar|pago al retirar|al retirar|en sucursal|pago en sucursal)/i.test(t.trim());
    if (isPaymentChoice) {
      const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      let payMethod = 'Efectivo';
      if (/transferencia|transferir|mp|mercado/i.test(t)) {
        payMethod = 'Transferencia Bancaria';
      } else if (/debito|débito|tarjeta/i.test(t)) {
        payMethod = 'Débito / Tarjeta al retirar';
      } else if (/retirar|sucursal/i.test(t)) {
        payMethod = 'Efectivo / Débito al retirar';
      } else {
        payMethod = 'Efectivo contraentrega';
      }

      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      const branchName = lastOrder?.branch || lead.preferredBranch || 'Urca Central (Av. José Roque Funes 1115)';

      if (lastOrder) {
        db.updateOrder(lastOrder.id, {
          status: 'preparing',
          paymentMethod: payMethod,
          ...(lastOrder.deliveryType === 'pickup' || /retirar|sucursal/i.test(t) ? { branch: branchName, deliveryType: 'pickup' } : {})
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

      return `¡De diez ${clientName}! 🥩🔥 Ya quedó 100% asentado tu pedido${lastOrder ? ` **#${lastOrder.id}**` : ''} con medio de pago **${payMethod}**.\n\nYa lo pasamos al sector de corte ${destinationText}. ¡Muchas gracias por tu compra en República de la Carne! 🙌 [[STAGE:closed_won]]`;
    }

    // =========================================================================
    // 0.15 RECORDAR ÚLTIMO PEDIDO / MEMORIA DE HISTORIAL DE COMPRA
    // =========================================================================
    const isOrderRecall = /recuerdas mi pedido|recordar mi pedido|mi ultimo pedido|mi último pedido|que te pedi|que te pedí|que compre|que compré|mi pedido anterior|mi pedido/i.test(t);
    if (isOrderRecall) {
      const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');

      if (lastOrder) {
        const itemsList = (lastOrder.items || []).join('\n') || '• 1x Combo Asadazo (4 kg) — $39.999';
        const formattedTotal = `$${(lastOrder.totalAmount || 39999).toLocaleString('es-AR')}`;
        const statusMap = {
          pending: 'Pendiente de despacho',
          preparing: 'En preparación en carnicería',
          in_transit: 'En camino con repartidor',
          delivered: 'Entregado con éxito',
          cancelled: 'Cancelado'
        };
        const statusText = statusMap[lastOrder.status] || 'Registrado';

        return `¡Sí ${clientName}! 🥩🙌 Tengo registrado tu último pedido **#${lastOrder.id}**:\n\n` +
          `📋 *Detalle del Pedido:*\n${itemsList}\n` +
          `💰 *Total:* **${formattedTotal}**\n` +
          `📍 *Destino de Entrega:* ${lastOrder.address || 'Domicilio'}\n` +
          `📦 *Estado:* ${statusText}\n\n` +
          `👉 ¿Querés que te repitamos exactamente este mismo pedido para despacharte hoy o preferís armar una combinación distinta? 🥩🔥 [[STAGE:proposal]]`;
      } else {
        return `¡Hola ${clientName}! 🥩 No tengo un pedido previo registrado todavía con este número. ¡Contame qué cortes estás buscando hoy o para cuántos comensales calculamos y te armo el pedido al toque! 🙌`;
      }
    }

    // =========================================================================
    // 0.18 ELECCIÓN DE SUCURSAL PARA RETIRO Y CORROBORACIÓN
    // =========================================================================
    const isSingleDigitBranch = /^[1-6]$/.test(t.trim()) || /^(?:opci[oó]n|sucursal|la|el)?\s*([1-6])$/i.test(t.trim());
    const branchDirectMatch = t.match(/^(?:opci[oó]n|sucursal|la|el)?\s*([1-6])\b/i) || 
                              t.match(/(?:retiro|retirar|paso|buscar)?\s*(?:por|en)?\s*(?:la\s*)?(?:sucursal\s*)?(urca|roque funes|funes|pidal|tejeda|intercountry|corteza|alamos|álamos|duarte quiros|quiros|quirós|villa allende|figueroa alcorta|san isidro|luchesse)/i);

    if (isSingleDigitBranch || (/retiro por sucursal|retirar en sucursal|paso a retirar|retiro en/i.test(t) && branchDirectMatch)) {
      const choice = branchDirectMatch ? branchDirectMatch[1].toLowerCase() : '1';
      let branchName = 'Urca Central (Av. José Roque Funes 1115)';
      let branchAddress = 'Av. José Roque Funes 1115, Barrio Urca, Córdoba';
      let branchPhone = '+54 9 3513 906947';
      let branchHours = 'Lunes a Sábado de 9:00 a 21:00 hs | Domingo de 9:00 a 13:30 hs';

      if (choice === '1' || choice.includes('roque funes') || choice.includes('funes') || choice === 'urca') {
        branchName = 'Urca Central (Av. José Roque Funes 1115)';
        branchAddress = 'Av. José Roque Funes 1115, Barrio Urca, Córdoba';
        branchPhone = '+54 9 3513 906947';
        branchHours = 'Lun a Sáb 9:00 a 21:00 hs | Dom 9:00 a 13:30 hs';
      } else if (choice === '2' || choice.includes('pidal') || choice.includes('tejeda')) {
        branchName = 'Urca 2 - Alto Tejeda (Av. Menéndez Pidal 3575)';
        branchAddress = 'Av. Menéndez Pidal 3575, Urca, Córdoba';
        branchPhone = '+54 9 3518 623195';
        branchHours = 'Lun a Sáb 9:00 a 21:00 hs';
      } else if (choice === '3' || choice.includes('intercountry') || choice.includes('corteza') || choice.includes('alamos')) {
        branchName = 'Intercountry Corteza Mall (Av. Los Álamos 1015)';
        branchAddress = 'Av. Los Álamos 1015, Corteza Mall, Córdoba';
        branchPhone = '+54 9 3518 623194';
        branchHours = 'Todos los días 9:00 a 21:00 hs';
      } else if (choice === '4' || choice.includes('quiros') || choice.includes('quirós') || choice.includes('duarte')) {
        branchName = 'Duarte Quirós (Av. Duarte Quirós 5130)';
        branchAddress = 'Av. Duarte Quirós 5130, Córdoba';
        branchPhone = '+54 9 3518 156595';
        branchHours = 'Lun a Sáb 9:00 a 13:30 y 17:00 a 21:00 hs';
      } else if (choice === '5' || choice.includes('villa allende') || choice.includes('alcorta')) {
        branchName = 'Villa Allende - Mercadito de la Villa (Av. Figueroa Alcorta 480)';
        branchAddress = 'Av. Figueroa Alcorta 480, Villa Allende';
        branchPhone = '+54 9 3513 540031';
        branchHours = 'Lun a Sáb 9:00 a 21:00 hs';
      } else if (choice === '6' || choice.includes('san isidro') || choice.includes('luchesse')) {
        branchName = 'Country San Isidro (Av. Padre Luchesse km 2)';
        branchAddress = 'Av. Padre Luchesse km 2, San Isidro';
        branchPhone = '+54 9 3518 769099';
        branchHours = 'Lun a Sáb 9:00 a 21:00 hs';
      }

      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      const { items: orderItems, total: orderTotal } = extractItemsFromHistoryAndText(history, '', products);
      const itemsList = orderItems.length > 0 ? orderItems.join('\n') : '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999';
      const formattedTotal = `$${(orderTotal || 39999).toLocaleString('es-AR')}`;

      // 1. Asentar inmediatamente los datos en la base de datos del sistema y en el Lead
      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, {
          preferredBranch: branchName,
          deliveryType: 'pickup',
          address: `Retiro en sucursal: ${branchName}`,
          notes: `Sucursal seleccionada para retiro: ${branchName}`
        });

        const activeOrder = db.getLatestOrderByJid(lead.jid || lead.id);
        if (activeOrder) {
          db.updateOrder(activeOrder.id, {
            branch: branchName,
            deliveryType: 'pickup',
            address: `Retiro en sucursal: ${branchName}`,
            items: orderItems.length > 0 ? orderItems : activeOrder.items,
            totalAmount: orderTotal || activeOrder.totalAmount
          });
        } else {
          db.createOrder({
            jid: lead.jid || lead.id,
            phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
            customerName: clientName,
            address: `Retiro en sucursal: ${branchName}`,
            branch: branchName,
            items: orderItems,
            totalAmount: orderTotal || 39999,
            deliveryType: 'pickup',
            paymentMethod: 'Efectivo / Débito al retirar',
            status: 'pending'
          });
        }
      }

      // 2. Presentar ficha de corroboración para que el cliente confirme la sucursal asignada
      return `📋 *FICHA DE RETIRO Y ASIGNACIÓN DE SUCURSAL:*\n\n` +
        `👤 *Cliente:* **${clientName}**\n` +
        `🏪 *Sucursal Asignada:* **${branchName}**\n` +
        `📍 *Dirección:* ${branchAddress}\n` +
        `⏰ *Horario de Atención:* ${branchHours}\n` +
        `📞 *Teléfono:* ${branchPhone}\n\n` +
        `🥩 *Detalle de tu Pedido:*\n${itemsList}\n` +
        `💰 *Total a abonar:* **${formattedTotal}**\n\n` +
        `👉 **¿Confirmamos el retiro por esta sucursal?** (Respondé *SÍ* para confirmar y decime si abonás en **efectivo / débito al retirar** o te paso el link de **Mercado Pago**) 🥩🏪 [[STAGE:confirming_data]]`;
    }

    // =========================================================================
    // 0.25 CONSULTA DE BENEFICIOS / DIFERENCIALES / VENTAJAS DE LA EMPRESA
    // =========================================================================
    const isBenefitsQuery = /beneficio|beneficios|ventaja|ventajas|por que comprar|por qué comprar|que diferencia|diferencial|por que ustedes|que gano/i.test(t);
    if (isBenefitsQuery) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      return `¡Mirá ${clientName}! 🥩✨ En **República de la Carne** te ofrecemos beneficios únicos:\n\n` +
        `🥩 **1. Calidad & Terneza Premium:** Trabajamos novillito seleccionado y cerdo fresco con corte artesanal del día. ¡La calidad nos hace diferentes!\n\n` +
        `🎁 **2. Regalos & Promociones Reales:** En combos como el *Asadazo (4 kg)* te llevás **1 Vino Howlmande Malbec Reserva de regalo** ($5.500 bonificado).\n\n` +
        `💰 **3. Ahorro por Cantidad:** Promos exclusivas en 2 y 3 kg (Chorizo puro cerdo 2kg x $10.000, Costeletas 2kg x $15.000, Molida 3kg x $27.000).\n\n` +
        `🚚 **4. Envío en el Día a tu Puerta:** Despacho rápido en Córdoba dentro de las 24 hs.\n\n` +
        `🏪 **5. 6 Sucursales para Retiro Directo:** En Urca, Alto Tejeda, Intercountry Mall, Duarte Quirós, Villa Allende y San Isidro.\n\n` +
        `💳 **6. Todos los Medios de Pago:** Mercado Pago (Checkout Pro / Transferencia al instante), débito o efectivo.\n\n` +
        `👉 ¿Te gustaría que te preparemos algún corte o combo hoy? 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 0.26 PRODUCTO NO DISPONIBLE O FUERA DE CATÁLOGO
    // =========================================================================
    const isUnavailableProduct = /pescado|pescados|salmon|salmón|merluza|mariscos|marisco|sushi|cerdo vivo|helado|helados|cerveza artesanal|whisky|vino tinto suelto/i.test(t);
    if (isUnavailableProduct) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      return `¡Hola ${clientName}! 🥩 En **República de la Carne** nos especializamos exclusivamente en **cortes vacunos de novillito seleccionado, cerdo fresco, pollo y embutidos parrilleros propios** (además de carbón quebracho y vino Howlmande).\n\nNo contamos con ese producto en particular, pero decime qué tenés pensado cocinar o para cuántos comensales calculamos y te recomiendo la mejor alternativa parrillera o de cocina diaria. 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 0.2 CONSULTA DIRECTA DE OFERTAS, PRECIOS, PROMOCIONES Y CORTES DISPONIBLES
    // =========================================================================
    const isOffersQuery = /oferta|ofertas|ofeta|ofetas|promo|promos|promocion|promociones|lista de precios|precios|precio|que tenes|que tenés|que hay|que cortes|que corte|que cortes hay|cortes en oferta|cortes tenes|cortes tenés|carta|catalogo|catálogo|opciones/i.test(t);
    const hasAddressOrOrderClose = /calle|av\.|avenida|barrio|funes|locelso|tupac|yupanqui|altura|dpto|domicilio/i.test(t);

    if (isOffersQuery && !hasAddressOrOrderClose && !/un solo|una sola|corregi|corrije/i.test(t)) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');

      return `¡Mirá ${clientName}! 🔥 Estas son nuestras **OFERTAS Y CORTES DESTACADOS** del día en República de la Carne:\n\n` +
        `🔥 **PROMO ESTRELLA - COMBO ASADAZO (4 kg):**\n` +
        `🥩 Bocado parrillero + Aguja tierna + Falda especial + Chorizos criollos puro cerdo + Morcillas bombón + 🎁 **1 Vino Howlmande de regalo** ➔ **$39.999**\n\n` +
        `🥩 **CORTES SELECCIONADOS DE NOVILLITO (x Kilo):**\n` +
        `• **Tapa de Cuadril Seleccionada:** $12.800 / kg\n` +
        `• **Vacío Especial / Tierno:** $11.500 / kg\n` +
        `• **Costillar / Asado de Tira:** $9.800 / kg\n` +
        `• **Bife de Chorizo Premium:** $14.500 / kg\n` +
        `• **Entraña Fina:** $16.900 / kg\n` +
        `• **Carne Molida Especial (Magra):** $11.800 / kg\n` +
        `• **Carne Molida Intermedia (3kg x $27.000 promo):** $9.000 / kg\n` +
        `• **Costeletas de Cerdo (2kg x $15.000 promo):** $7.500 / kg\n` +
        `• **Chorizo Criollo Puro Cerdo (2kg x $10.000 promo):** $5.000 / kg\n` +
        `• **Morcilla Bombón Parrillera:** $5.200 / kg\n` +
        `• **Milanesas de Ternera (2kg x $24.990 promo):** $12.495 / kg\n` +
        `• **Pata Muslo de Pollo (3kg x $13.990 promo):** $4.660 / kg\n` +
        `• **Carbón Quebracho (bolsa grande):** $2.200\n\n` +
        `👉 ¿Cuál de estos cortes te gustaría que te preparemos o cuántos kilos te separamos? 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 1. CÁLCULO DE COMENSALES Y ASADOS A MEDIDA (CON TOLERANCIA A TIPOS Y ECONÓMICOS)
    // =========================================================================
    const peopleWordToNum = { uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
    const explicitPeopleMatch = t.match(/(?:somos|para|comemos|seremos|calcular\s+para)\s*([0-9]+|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:personas?|personar|persoans?|comensales?|amigos?|invitados?|bocas?)/i) ||
                                t.match(/(?:asado|carne|comida|asadaso|asadazo|fuego|parrilla)?\s*(?:para|somos)\s*([0-9]+|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:personas?|personar|persoans?|comensales?|amigos?|invitados?|bocas?|en\s+la\s+mesa)?/i) ||
                                t.match(/([0-9]+)\s+(?:personas?|personar|persoans?|comensales?|amigos?|invitados?|bocas?)/i);

    if (explicitPeopleMatch) {
      const rawCount = explicitPeopleMatch[1].toLowerCase();
      const count = parseInt(rawCount, 10) || peopleWordToNum[rawCount] || 4;
      const isEconomico = /economico|económico|barato|barata|precio bajo|rendidor|que rinda|rinde mas|rinde más|ahorrar|ahorro/i.test(t);

      if (count >= 2 && count <= 50) {
        const totalKg = (count * 0.5).toFixed(1).replace('.0', '');
        
        let recommendation = '';
        if (isEconomico) {
          recommendation = `🔥 Para **${count} personas opción económica**, calculamos **${totalKg} kg de carne en total** (500g por comensal). Te armo una propuesta rendidora y súper accesible:\n\n` +
            `• 1.0 kg Costeletas de Cerdo ($7.500)\n` +
            `• 1.0 kg Falda Especial novillito ($9.800)\n` +
            `• 0.5 kg Chorizo Criollo puro cerdo ($2.500)\n` +
            `💰 *Total súper económico (${totalKg} kg):* **$19.800** (¡Solo $${Math.round(19800 / count).toLocaleString('es-AR')} por persona!)\n\n` +
            `o si preferís la promo estrella completa:\n` +
            `🔥 **Combo Asadazo (4 kg):** Incluye Bocado, Aguja, Falda, Chori criollo, Morcilla + 🎁 **Vino Howlmande de regalo** ➔ **$39.999**`;
        } else if (count <= 4) {
          recommendation = `🔥 Para **${count} personas**, calculamos unos **2 a 2.5 kg de carne** en total. Te recomiendo:\n\n` +
            `• **1x Combo Asadazo (4 kg):** Incluye Bocado, Aguja, Falda, Chori criollo, Morcilla + Vino de regalo ➔ **$39.999** (¡Te queda abundante y con vino incluido!).\n` +
            `o si preferís cortes a elección:\n` +
            `• 1.5 kg Vacío Seleccionado ($17.250)\n` +
            `• 1.0 kg Costeletas de Cerdo ($7.500)\n` +
            `• 0.5 kg Chorizo Criollo ($2.500)\n` +
            `💰 Total a elección: **$27.250**`;
        } else if (count <= 8) {
          recommendation = `🔥 Para **${count} personas**, calculamos unos **${totalKg} kg de carne** para que coman de diez. Te armo esta propuesta equilibrada:\n\n` +
            `• 2.0 kg Costillar de Novillito ($19.600)\n` +
            `• 1.5 kg Vacío Seleccionado ($17.250)\n` +
            `• 1.0 kg Chorizo Criollo Puro Cerdo ($5.000)\n` +
            `• 1.0 kg Morcilla Bombón ($5.200)\n` +
            `💰 *Subtotal estimado (${totalKg} kg):* **$47.050**\n` +
            `🎁 ¡Sumamos 1 bolsa de carbón quebracho ($2.200) o Vino Howlmande si lo confirmamos hoy!`;
        } else {
          recommendation = `🔥 ¡Tremendo asado para **${count} personas**! Calculamos unos **${totalKg} kg de carne** en total. Te recomiendo armar:\n\n` +
            `• 4.0 kg Costillar / Asado de Tira ($39.200)\n` +
            `• 3.0 kg Vacío Especial ($34.500)\n` +
            `• 2.0 kg Chorizo Criollo ($10.000)\n` +
            `• 1.5 kg Morcilla Bombón ($7.800)\n` +
            `• 1.5 kg Matambre de Cerdo ($12.750)\n` +
            `💰 *Total estimado (${totalKg} kg):* **$104.250**`;
        }

        return `¡De diez${nameGreeting}! 🥩 ${recommendation}\n\n👉 **Paso 1:** ¿Te reservo esta propuesta o preferís cambiar o sumar algún corte en particular? [[STAGE:qualified]]`;
      }
    }

    // =========================================================================
    // 2. DETECCIÓN EXACTA DE ÍTEMS, CANTIDADES Y CORRECCIONES / ADICIONES
    // (Ej: "quisiera agregar 1 kilo de chorizo de cerdo", "corrije, quiero un solo combo", "dame 1kg de vacio")
    // =========================================================================
    const isAdditionOrder = /agrega|agregá|agregar|agregame|agregale|suma|sumá|sumar|sumale|sumame|sumar|ademas|además|tambien|también|sumale también|mas los|más los|mas el|más el|mas 1|más 1|mas 2|más 2|mas un|más un|mas una|más una|y los|y las|y 1|y 2|sumando/i.test(t);
    const isCorrectionOrder = /corregi|corregí|corrije|corrijí|corregime|corrijeme|corregilo|corrijelo|arregla|arreglame|cambia|cambiame|modifica|modificame|solo quiero|un solo|una sola|no, solo|nada mas|en vez de|me equivoque|te equivocaste/i.test(t);
    
    const { items: detectedItems, total: detectedTotal, addedItems } = extractItemsFromHistoryAndText(history, rawText, products, lead);
    const hasRealItems = (detectedItems.length > 0 && !detectedItems[0].includes('• 1 combo Combo “Asadazo”')) || 
                         (detectedItems.length > 0 && /asadazo|combo|asasazo|azadazo/i.test(rawText)) || 
                         (detectedItems.length > 0 && /kilo|kg|quilo|[0-9]+/i.test(rawText)) ||
                         isAdditionOrder || 
                         isCorrectionOrder;

    if (hasRealItems && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      const formattedTotal = `$${detectedTotal.toLocaleString('es-AR')}`;
      
      let prefixGreeting = `¡De diez ${clientName}! 🥩 Te separo los cortes solicitados:`;
      if (isAdditionOrder && addedItems && addedItems.length > 0) {
        const addedDesc = addedItems.map(a => `${a.quantity} ${a.prod.unit} ${a.prod.name}`).join(' y ');
        prefixGreeting = `¡De diez ${clientName}! 🥩 Sumamos **${addedDesc}** a tu pedido:`;
      } else if (isCorrectionOrder) {
        prefixGreeting = `¡Corregido ${clientName}! 👍 Dejamos asentado tu pedido actualizado:`;
      }

      return `${prefixGreeting}\n\n` +
        `📋 **Detalle de tu pedido:**\n` +
        `${detectedItems.join('\n')}\n` +
        `💰 **Subtotal acumulado:** **${formattedTotal}**\n\n` +
        `👉 **¿Te gustaría sumar algún complemento?**\n` +
        `• 1 kg Chorizo Criollo puro cerdo ($5.000 / 2kg x $10.000 promo) o Morcillas ($5.200/kg)\n` +
        `• 1 bolsa de Carbón Quebracho ($2.200) o Vino Howlmande ($5.500)\n` +
        `• O pasamos directo a coordinar si te lo **enviamos a domicilio** o **retirás por sucursal** 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 2.05 RECHAZO DE COMPLEMENTOS / CIERRE DE ÍTEMS DEL PEDIDO ("no, solo eso", "nada más")
    // =========================================================================
    const isDeclineComplements = /^(?:no,? )?(?:solo eso|soo eso|nada m[aá]s|eso solo|eso nada m[aá]s|ninguno|as[ií] est[aá] bien|dejalo as[ií]|dame mi pedido|pasemos directo|directo al env[ií]o|sin complementos)$/i.test(t.trim()) ||
                                /(?:no,? )?(?:solo eso|nada m[aá]s|eso solo|dame mi pedido)/i.test(t);

    if (isDeclineComplements && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      const { items: historyItems, total: historyTotal } = extractItemsFromHistoryAndText(history, '', products);
      const itemsList = historyItems.length > 0 ? historyItems.join('\n') : '• 1 combo Combo “Asadazo” (4 kg cortes + Vino de regalo) — $39.999';
      const formattedTotal = `$${(historyTotal || 39999).toLocaleString('es-AR')}`;

      return `¡De diez ${clientName}! 🥩🚚 Cerramos con tu pedido confirmado:\n\n` +
        `📋 **Detalle de tu pedido:**\n${itemsList}\n` +
        `💰 **Total:** **${formattedTotal}**\n\n` +
        `👉 ¿Preferís que te lo **enviemos a domicilio** o **retirás por alguna de nuestras 6 sucursales**?\n` +
        `(Si es con envío, pasame tu **dirección y barrio**; si retirás, decime por cuál de nuestras sucursales pasás) 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 2.1 CONSULTA DE PRECIO DE UN CORTE ESPECÍFICO SIN CANTIDAD ("cuanto sale la entraña")
    // =========================================================================
    const matchedCatalogItem = MASTER_CATALOG.find(item => 
      item.keywords.some(kw => t.includes(kw))
    );

    if (matchedCatalogItem && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      const formattedUnit = `$${matchedCatalogItem.price.toLocaleString('es-AR')}`;
      return `¡Sí, ${clientName}! 🥩 Tenemos **${matchedCatalogItem.name}** fresca y de excelente terneza a **${formattedUnit} por ${matchedCatalogItem.unit}**.\n\n¿Cuántos ${matchedCatalogItem.unit} te gustaría que te separemos para tu pedido? 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3. INTENCIÓN DE ENVÍO SIN DIRECCIÓN ESPECÍFICA (ej: "quiero eso para mi domicilio")
    // =========================================================================
    const isDeliveryIntentWithoutAddress = /(?:a|para)\s+(?:mi\s+)?(?:domicilio|casa|depto|departamento)|(?:hacelo|mandamelo|enviame|envialo|quiero\s+envio|con\s+envio|por\s+delivery|hacer\s+delivery)/i.test(t) && 
      !/[0-9]{2,5}/.test(t) && 
      !/(?:funes|locelso|pidal|quiros|alamos|alcorta|luchesse|colon|urca|calle|av\.|avenida|barrio|altura)/i.test(t);

    if (isDeliveryIntentWithoutAddress) {
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');
      return `¡De diez ${clientName}! 🛵 Programamos el envío directo a tu puerta en el día.\n\nPor favor, indícanos con precisión:\n📍 **Dirección de Entrega:** (Calle, Número/Altura y Barrio)\n👤 **Nombre y Apellido:** (Para la etiqueta del paquete)\n\n¡Así verificamos los datos y dejamos listo tu pedido! 🥩 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3.1 CORRECCIÓN DE DATOS ("no, la dirección es...", "mi nombre es...")
    // =========================================================================
    const isCorrection = /no,? (?:mi nombre|la direccion|la calle|es|me llamo|vivo en)|(?:corregi|corrije|cambia|modifica|te equivocaste)/i.test(t);
    if (isCorrection) {
      let currentAddress = lead.address || 'Pendiente';
      let currentName = (!isGarbageName(lead.name)) ? lead.name : (nameGreeting || 'Don Juan');

      const explicitNameMatch = rawText.match(/(?:mi nombre(?: es)?|me llamo|nombre:?|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:,|$|\.|\by vivo|\bla direccion)/i);
      if (explicitNameMatch && !isGarbageName(explicitNameMatch[1].trim())) {
        currentName = explicitNameMatch[1].trim();
        if (lead.jid || lead.id) {
          db.updateLead(lead.jid || lead.id, { name: currentName, pushName: currentName });
        }
      }

      const hasAddressInCorrection = (/(?:calle|av\.|avenida|bv\.|funes|locelso|pidal|quiros|colon|urca|martinolli)/i.test(t) || /[0-9]{2,5}/.test(t)) && !/(?:kilo|kg|quilo)/i.test(t);
      if (hasAddressInCorrection) {
        let cleanAddr = rawText.replace(/^no,?\s*(?:la direccion es|la calle es|vivo en)?\s*/gi, '').trim();
        if (!isGarbageAddress(cleanAddr)) {
          currentAddress = cleanAddr;
          if (lead.jid || lead.id) {
            db.updateLead(lead.jid || lead.id, { address: cleanAddr, notes: `Dirección corregida: ${cleanAddr}` });
          }
        }
      }

      return `¡Entendido ${currentName}, datos corregidos! 👍\n\n📋 *DATOS ACTUALIZADOS:*\n👤 *Nombre:* **${currentName}**\n📍 *Dirección:* **${currentAddress}**\n\n👉 ¿Está todo correcto ahora para avanzar? (Respondé *Sí / Correcto* para finalizar el pedido) 🥩`;
    }

    // =========================================================================
    // 3.2 CONFIRMACIÓN EXPLÍCITA DE DATOS DE ENVÍO Y AGENDADO ("sí", "correcto", "dale", "de diez")
    // =========================================================================
    const cleanConfirmText = t.replace(/[,\.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const isConfirmationReply = /^(?:s[ií]|correcto|confirmar|confirmo|dale|est[aá] bien|perfecto|de diez|avanza|avanzar|ok dale|s[ií] dale|s[ií] correcto|exacto|as[ií] es|s[ií] est[aá] bien|s[ií] perfecto)$/i.test(cleanConfirmText);
    const hasPendingAddressOnLead = lead.address && lead.address.length >= 6 && !isGarbageAddress(lead.address);

    if (isConfirmationReply && hasPendingAddressOnLead) {
      const { items: parsedItems, total: parsedTotal } = extractItemsFromHistoryAndText(history, rawText, products);
      const clientName = (lead.name && !isGarbageName(lead.name)) ? lead.name : (lead.pushName || 'Don Juan');
      const allHistoryText = (history || []).map(m => m.content).join(' ');

      if (lead.jid || lead.id) {
        db.updateLead(lead.jid || lead.id, { 
          name: clientName,
          pushName: clientName,
          address: lead.address,
          isRegistered: true,
          isVerified: true,
          registeredAt: new Date().toISOString(),
          notes: `Cliente agendado y registrado. Dirección: ${lead.address}`
        });
      }

      // Si no ha seleccionado cortes todavía, confirmamos agenda y ofrecemos el catálogo
      const hasRealCuts = parsedItems.length > 0 && !parsedItems[0].includes('• 1 combo Combo “Asadazo”');
      if (!hasRealCuts && !/combo|asadazo|vacio|costillar|tapa|matambre|milanesa|chori|morcilla/i.test(allHistoryText)) {
        return `¡Excelente ${clientName}! 🎉 Ya quedaste agendado y registrado con éxito en nuestro sistema con entrega en **${lead.address}**.\n\n` +
          `🥩 **¿Qué cortes o promo te gustaría preparar hoy?**\n` +
          `• **Combo Asadazo (4 kg):** Cortes parrilleros + Vino de regalo ➔ **$39.999**\n` +
          `• **Cortes Selección Novillito:** Tapa de cuadril ($12.800/kg), Vacío tierno ($11.500/kg), Costillar ($9.800/kg), Entraña ($16.900/kg)\n` +
          `• **Comidas Diarias:** Milanesas de ternera (2kg x $24.990 promo), Picada especial (3kg x $27.000 promo)\n\n` +
          `👉 Contame qué te preparamos o cuántos kilos te separamos 🙌 [[STAGE:proposal]]`;
      }

      const newOrder = db.createOrder({
        jid: lead.jid || lead.id,
        phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
        customerName: clientName,
        address: lead.address,
        items: parsedItems,
        totalAmount: parsedTotal,
        paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
        status: 'pending'
      });

      const formattedTotal = `$${parsedTotal.toLocaleString('es-AR')}`;
      return `¡Excelente ${clientName}! 🎉 Datos confirmados y agendados con éxito. Ya generamos tu orden de compra:\n\n🆔 *N° de Pedido:* #${newOrder.id}\n📋 *RESUMEN DE TU PEDIDO:*\n${parsedItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n👤 *Cliente:* ${clientName}\n📍 *Destino de Entrega:* ${lead.address}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n\n💳 *¿Cómo preferís abonar?*\n1️⃣ *Efectivo* al repartidor\n2️⃣ *Transferencia* (Alias: \`republica.carne.mp\`)\n3️⃣ *Mercado Pago* (Link directo con tarjetas)\n\nDecime cuál te queda más cómodo y te lo dejamos listo 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${parsedTotal}]]`;
    }

    // =========================================================================
    // 3.3 DETECTOR DE DIRECCIÓN Y NOMBRE REAL (PRESENTACIÓN Y SOLICITUD DE CONFIRMACIÓN)
    // =========================================================================
    const hasRealAddress = (/(?:calle|av\.|avenida|bv\.|bulevar|barrio|piso|dpto|nro|n°|funes|locelso|pidal|alamos|alcorta|luchesse|quiros|colon|urca|cerro)/i.test(t) || (rawText.includes(',') && /[0-9]{2,5}/.test(rawText))) && /[0-9]{1,5}/.test(t) && !/(?:kilo|kg|quilo|bolsa|botella)/i.test(t);

    if (hasRealAddress && t.length > 5) {
      let extractedName = '';
      let cleanAddress = rawText;

      // 1. Detección explícita de nombre combinado con dirección ("me llamo Marcos Rossi y vivo en...")
      const comboMatch = rawText.match(/(?:mi nombre(?: es)?|me llamo|soy|nombre:?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:\s+(?:y\s+)?vivo en|\s+en\s+la\s+calle|\s+calle|,|$|\.|\bdireccion)/i);
      if (comboMatch && comboMatch[1].trim().length >= 3) {
        const cand = comboMatch[1].trim();
        if (!isGarbageName(cand)) {
          extractedName = cand;
        }
      }

      const comboAddrMatch = rawText.match(/(?:vivo en|la direccion(?: es)?|direccion:?|mi direccion es)\s+(.+)$/i) ||
                             rawText.match(/(?:calle|av\.|avenida|bv\.|bulevar|barrio)\s+.+$/i);
      if (comboAddrMatch) {
        const candAddr = (comboAddrMatch[1] || comboAddrMatch[0]).trim();
        if (!isGarbageAddress(candAddr)) {
          cleanAddress = candAddr;
        }
      }

      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2 && !extractedName) {
        const line1 = lines[0];
        const line2 = lines.slice(1).join(', ');
        if (!/[0-9]/.test(line1) && line1.length >= 3 && line1.length <= 35 && !isGarbageName(line1)) {
          extractedName = line1;
          cleanAddress = line2;
        }
      }

      if (!extractedName) {
        const explicitNameMatch = rawText.match(/(?:a nombre de|nombre:?|para|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:,|$|\.|\babono|\bpago|\ben efectivo|\bpor transferencia|\bdireccion|\bcalle)/i);
        if (explicitNameMatch && explicitNameMatch[1].trim().length >= 3) {
          const candidate = explicitNameMatch[1].trim();
          if (!isGarbageName(candidate)) {
            extractedName = candidate;
          }
        }
      }

      if (!extractedName && rawText.includes(',')) {
        const parts = rawText.split(',');
        for (const part of parts) {
          const clean = part.replace(/(?:mi nombre(?: completo)?|es mi nombre|mi onmbre|a nombre de|para)/gi, '').trim();
          if (!isGarbageName(clean)) {
            extractedName = clean;
            break;
          }
        }
      }

      cleanAddress = cleanAddress
        .replace(/^(?:hola,?\s*)?(?:quiero|mandame|enviame|traeme|armame)?\s*(?:un\s*)?(?:combo\s*)?(?:asadazo\s*)?(?:para|\ba\b)?\s*/gi, '')
        .replace(/a mi domicilio,?\s*/gi, '')
        .replace(/(?:a nombre de|nombre:?|para|soy)?\s*[A-Za-zÁÉÍÓÚáéíóúñÑ ]*(?:mi nombre(?: completo)?|mi onmbre)/gi, '')
        .replace(/,\s*a nombre de\s+[A-Za-zÁÉÍÓÚáéíóúñÑ ]+/gi, '')
        .replace(/,\s*(?:abono|pago|en efectivo|al repartidor|por transferencia)[^,]*/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '')
        .trim();
      if (!cleanAddress || cleanAddress.length < 3 || isGarbageAddress(cleanAddress)) cleanAddress = rawText.trim();

      let finalClientName = extractedName;
      if (!finalClientName && customerName && !isGarbageName(customerName)) {
        finalClientName = customerName;
      }

      db.updateLead(lead.jid || lead.id, { 
        address: cleanAddress, 
        ...(finalClientName ? { name: finalClientName, pushName: finalClientName } : {}),
        notes: `Dirección registrada: ${cleanAddress}${finalClientName ? ` | Nombre: ${finalClientName}` : ''}`
      });

      const { items: parsedItems, total: parsedTotal } = extractItemsFromHistoryAndText(history, rawText, products);
      const formattedTotal = `$${parsedTotal.toLocaleString('es-AR')}`;
      const allHistoryText = (history || []).map(m => m.content).join(' ');
      const hasRealCuts = parsedItems.length > 0 && !parsedItems[0].includes('• 1 combo Combo “Asadazo”');

      if (finalClientName) {
        return `📋 *FICHA DE REGISTRO Y DATOS DE ENVÍO:*\n\n` +
          `👤 *Destinatario / Cliente:* **${finalClientName}**\n` +
          `📍 *Dirección de Entrega:* **${cleanAddress}**\n` +
          `📱 *Contacto:* ${lead.phone || 'WhatsApp'}\n` +
          (hasRealCuts || /combo|asadazo/i.test(allHistoryText) ? `🥩 *Detalle del Pedido:*\n${parsedItems.join('\n')}\n💰 *Total a abonar:* **${formattedTotal}**\n\n` : '\n') +
          `👉 **¿Confirmamos estos datos para agendarte y guardarte en el sistema?** (Respondé *SÍ* para confirmar o corregime cualquier dato) 🥩🚚 [[STAGE:confirming_data]]`;
      } else {
        return `¡Excelente! Ya registré tu dirección: **${cleanAddress}** para la entrega del pedido 🥩🔥\n\nSolo me faltaría tu **Nombre y Apellido** para agendarte en el sistema y colocar en la etiqueta del envío. ¿A nombre de quién te lo dejamos? 😊 [[STAGE:proposal]]`;
      }
    }

    // =========================================================================
    // 4. SUCURSALES, HORARIOS Y UBICACIONES (BASE DE CONOCIMIENTO OFICIAL)
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
    // 5. SALUDO INICIAL / ASESORAMIENTO DE ENTRADA CON REGISTRO DE CLIENTE
    // =========================================================================
    const isUnregistered = !lead.isRegistered && (isGarbageName(lead.name) || (!nameGreeting && (!lead.name || lead.name.startsWith('+'))));
    if (isUnregistered && /^(hola|buen|buenas|que tal|saludos|hey|alo|buenos dias|buenas tardes|buenas noches|quiero comprar|quiero hacer un pedido)/i.test(t)) {
      return `¡Hola! 👋 Carlos por acá, maestro carnicero de **República de la Carne**.\n\n` +
        `Para agendarte en nuestro sistema y coordinar tus envíos directos en el día, ¿me indicarías por favor:\n` +
        `👤 **Tu Nombre y Apellido**\n` +
        `📍 **Tu Dirección de Entrega y Barrio** (o si preferís retirar por sucursal)\n\n` +
        `¡Y contame qué cortes o promo tenías ganas de preparar hoy para armarte la propuesta perfecta! 🥩🔥 [[STAGE:qualified]]`;
    }

    // =========================================================================
    // 6. SALUDOS
    // =========================================================================
    if (/^(hola|buen|buenas|que tal|saludos|hey|alo|buenos dias|buenas tardes|buenas noches)/i.test(t)) {
      const greetings = [
        `¡Hola${nameGreeting}! 👋 Carlos por acá, maestro carnicero de República de la Carne. Te ayudo a armar tu pedido para que no te falte nada.\n\n¿Estás planeando un asado, comida familiar o querés abastecer el freezer de la semana? Contame qué cortes estás buscando o para cuántas personas calculamos y te armo la propuesta perfecta. 🥩🔥`,
        `¡Buenas${nameGreeting}! ¿Cómo estás? Te atiende la carnicería República de la Carne. Contame qué cortes estás buscando hoy o para qué ocasión, y te paso precios y disponibilidad al toque. 🥩`,
        `¡Hola${nameGreeting}! Qué lindo saludarte. Tenemos ingresos frescos de costillares, tapa de cuadril, vacíos, achuras y milanesas preparadas. ¿Qué tenías ganas de preparar hoy? 🥩🙌`
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }

    // =========================================================================
    // 7. RESPUESTA DINÁMICA CONTEXTUAL POR DEFECTO
    // =========================================================================
    const fallbackVariations = [
      `¡Excelente${nameGreeting}! Te leí atentamente. En República de la Carne tenemos novillito seleccionado, cortes para parrilla, horno y embutidos propios.\n\nDecime qué cortes o kilos tenías pensado llevar y te paso el presupuesto exacto con envío a domicilio en el día. 🥩`,
      `¡Tomado nota${nameGreeting}! Para dejarlo perfecto: ¿te gustaría que te reservemos algún corte en especial (como tapa de cuadril, vacío, costillar, picada o costeletas) o querés que te recomiende un combo para la cantidad de personas que van a comer? 🥩🔥`,
      `¡De diez${nameGreeting}! Contame qué cortes estás buscando o si preferís que te pase nuestra lista de ofertas del día para aprovechar. Hacemos envíos directos a tu puerta. 🛵🥩`
    ];
    return fallbackVariations[Math.floor(Math.random() * fallbackVariations.length)];
  }
}
