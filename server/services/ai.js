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
  { keywords: ['tapa de cuadril', 'tapa cuadril', 'cuadril', 'colita de cuadril'], name: 'Tapa de Cuadril Seleccionada', price: 12800, unit: 'kg', category: 'Parrilla y Horno' },
  { keywords: ['vacio', 'vacío', 'vacio tierno'], name: 'Vacío Especial Seleccionado', price: 11500, unit: 'kg', category: 'Parrilla' },
  { keywords: ['costilla', 'costillar', 'asado de tira', 'tira de asado', 'asado'], name: 'Costillar / Asado de Tira Novillito', price: 9800, unit: 'kg', category: 'Parrilla' },
  { keywords: ['bife de chorizo', 'bife chorizo', 'ojo de bife', 'bife de lomo'], name: 'Bife de Chorizo Premium', price: 14500, unit: 'kg', category: 'Cortes Premium' },
  { keywords: ['entraña', 'entrana', 'entrecot', 'enrecor'], name: 'Entraña Fina Seleccionada', price: 16900, unit: 'kg', category: 'Cortes Premium' },
  { keywords: ['matambre de cerdo', 'matambrito de cerdo', 'matambre cerdo'], name: 'Matambrito de Cerdo Tiernizado', price: 8500, unit: 'kg', category: 'Cerdo y Parrilla' },
  { keywords: ['matambre de vaca', 'matambre vacuno', 'matambre'], name: 'Matambre Vacuno', price: 9500, unit: 'kg', category: 'Parrilla y Horno' },
  { keywords: ['bondiola', 'bondiola de cerdo'], name: 'Bondiola de Cerdo sin Hueso', price: 8900, unit: 'kg', category: 'Cerdo' },
  { keywords: ['costeleta de cerdo', 'costeletas de cerdo', 'cerdo'], name: 'Costeletas de Cerdo (2kg x $15.000 promo)', price: 7500, unit: 'kg', category: 'Cerdo' },
  { keywords: ['costeleta de ternera', 'costeletas de ternera', 'costeleta', 'costeletas'], name: 'Costeletas de Ternera (2kg x $35.000 promo)', price: 17500, unit: 'kg', category: 'Cortes Tradicionales' },
  { keywords: ['chori criollo', 'chorizo criollo', 'chorizo', 'chorizos', 'chori'], name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', price: 5000, unit: 'kg', category: 'Embutidos' },
  { keywords: ['morcilla', 'morcillas', 'morcilla bombon', 'morcilla bombón'], name: 'Morcilla Bombón Parrillera', price: 5200, unit: 'kg', category: 'Embutidos' },
  { keywords: ['molleja', 'mollejas'], name: 'Mollejas de Corazón', price: 14800, unit: 'kg', category: 'Achuras' },
  { keywords: ['chinchulin', 'chinchulines', 'chinchu'], name: 'Chinchulines Crocantes', price: 4800, unit: 'kg', category: 'Achuras' },
  { keywords: ['molida intermedia', 'picada especial', 'molida', 'picada', 'carne picada'], name: 'Carne Molida Intermedia (3kg x $27.000 promo)', price: 9000, unit: 'kg', category: 'Diario y Preparados' },
  { keywords: ['milanesas de ternera', 'milanesa de ternera', 'milanesas', 'milanesa'], name: 'Milanesas de Ternera preparadas (2kg x $24.990)', price: 12495, unit: 'kg', category: 'Diario y Preparados' },
  { keywords: ['pata muslo', 'pollo', 'suprema de pollo', 'pechuga'], name: 'Pata Muslo Fresca (3kg x $13.990 promo)', price: 4660, unit: 'kg', category: 'Pollo' },
  { keywords: ['carbon', 'carbón', 'bolsa de carbon'], name: 'Carbón Quebracho Blanco (Bolsa Grande)', price: 2200, unit: 'bolsa', category: 'Almacén Parrillero' },
  { keywords: ['vino', 'vino howlmande', 'howlmande', 'malbec'], name: 'Vino Howlmande Malbec Reserva', price: 5500, unit: 'botella', category: 'Bebidas' },
  { keywords: ['combo asadazo', 'asadazo', 'combo asado', 'combo 4kg'], name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', price: 39999, unit: 'combo', category: 'Combos en Oferta' }
];

/**
 * Extrae con precisión los cortes y cantidades pedidos a lo largo de la conversación
 */
function extractItemsFromHistoryAndText(history, text, products) {
  const allUserTexts = [
    ...history.filter(m => m.sender === 'user').map(m => m.content),
    text
  ].join('\n');

  const items = [];
  let total = 0;
  const processedCuts = new Set();

  // 1. Combo Asadazo
  if (/asadazo|combo asado|combo “asadazo”/i.test(allUserTexts)) {
    const qtyMatch = allUserTexts.match(/([0-9]+)\s*(?:x|combo|combos)?\s*asadazo/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const price = 39999 * qty;
    items.push(`• ${qty}x Combo “Asadazo” (4 kg cortes parrilleros + Vino de regalo) — $${price.toLocaleString('es-AR')}`);
    total += price;
    processedCuts.add('asadazo');
  }

  // 2. Búsqueda y cotejo frase por frase (separando por saltos, comas, puntos y conectores "y", "con", "más")
  const chunks = allUserTexts.split(/[\n,\.]+|\s+y\s+|\s+con\s+|\s+más\s+|\s+mas\s+/i);
  for (const chunk of chunks) {
    const c = chunk.toLowerCase().trim();
    if (!c) continue;

    // Buscar cantidad (ej: 2 kilos, 2kg, 2.5 kg, 3 bolsas)
    const qtyMatch = c.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(?:kilo|kg|quilo|kilos|kgs|bolsa|bolsas|botella|botellas|x)?/i);
    const quantity = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;

    for (const prod of MASTER_CATALOG) {
      if (prod.keywords.some(kw => c.includes(kw)) && !processedCuts.has(prod.name)) {
        // Encontrar precio actualizado de DB si existe
        const dbProd = (products || []).find(p => (p.name || '').toLowerCase() === prod.name.toLowerCase());
        const unitPrice = dbProd ? Number(dbProd.price) : prod.price;
        const sub = Math.round(unitPrice * quantity);

        items.push(`• ${quantity} ${prod.unit} ${prod.name} — $${sub.toLocaleString('es-AR')}`);
        total += sub;
        processedCuts.add(prod.name);
        break;
      }
    }
  }

  // Fallback a Combo Asadazo si no se detectó ningún corte en específico
  if (items.length === 0) {
    items.push('• 1x Combo “Asadazo” (4 kg cortes parrilleros + Vino de regalo) — $39.999');
    total = 39999;
  }

  return { items, total };
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

    const queryTokens = (incomingText || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let relevantProducts = products.filter(p => {
      const pText = `${p.name} ${p.category || ''} ${p.description || ''}`.toLowerCase();
      return queryTokens.some(tok => pText.includes(tok));
    });

    if (relevantProducts.length === 0) {
      relevantProducts = products.slice(0, 8);
    } else if (relevantProducts.length > 10) {
      relevantProducts = relevantProducts.slice(0, 10);
    }

    const productCatalogContext = relevantProducts.map((p) => {
      return `• ${p.name} ($${p.price.toLocaleString('es-AR')}/${p.unit || 'kg'}) | ${p.description || 'Disponible'}`;
    }).join('\n');

    let relevantKB = knowledgeBase.filter(item => {
      const kbText = `${item.title} ${item.category || ''} ${item.content || ''} ${(item.keywords || []).join(' ')}`.toLowerCase();
      return queryTokens.some(tok => kbText.includes(tok));
    });

    if (relevantKB.length === 0) {
      relevantKB = knowledgeBase.slice(0, 4);
    } else if (relevantKB.length > 5) {
      relevantKB = relevantKB.slice(0, 5);
    }

    const kbContext = relevantKB.map(item => `[${item.title}]: ${item.content}`).join('\n');

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      const isValidNvidiaKey = settings.nvidiaApiKey && settings.nvidiaApiKey.startsWith('nvapi-');
      const isValidCustom = settings.customBaseUrl && settings.customBaseUrl.startsWith('http');

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
    const historyText = history.map(m => m.content).join('\n').toLowerCase();

    // =========================================================================
    // 0. SOLICITUD DE LINK DE PAGO / MERCADO PAGO
    // =========================================================================
    const isLinkRequest = /link|link de pago|marcado pago|mercadopago|mercado pago|tarjeta|abonar con mp|pagar con mp/i.test(t);
    if (isLinkRequest) {
      const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      const amount = lastOrder ? lastOrder.totalAmount : 39999;
      const orderId = lastOrder ? lastOrder.id : `ORD-${Date.now().toString().slice(-4)}`;
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes') && !lead.name.includes('domicilio')) ? lead.name : (nameGreeting || 'Don Juan');
      
      const isSandbox = (settings.mercadopagoMode || 'sandbox') === 'sandbox';
      const sandboxTag = isSandbox ? '💳 *[MERCADO PAGO CHECKOUT PRO]*\n' : '';
      const linkUrl = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=2050924390-6312e69b-5204-487b-a44b-c792df651611';
      
      return `${sandboxTag}¡De diez ${clientName}! 🥩💳 Para abonar tu pedido **#${orderId}** por **$${amount.toLocaleString('es-AR')}** con Mercado Pago, podés hacerlo fácilmente:\n\n1️⃣ **Transferencia / Dinero en cuenta:**\n📱 *Alias Mercado Pago:* \`republica.carne.mp\`\n\n2️⃣ **Link de Pago Directo (Checkout Pro):**\n🔗 ${linkUrl}\n\nEn cuanto se acredite, ¡comenzamos la preparación de tus cortes en carnicería! 🙌`;
    }

    // =========================================================================
    // 0.1 CONFIRMACIÓN DE MÉTODO DE PAGO
    // =========================================================================
    const isPaymentChoice = /^(efectivo|transferencia|transferir|al repartidor|contra entrega|contraentrega|por mp|mercado pago|pago al recibir|abono al repartidor|abono en efectivo)$/i.test(t.trim()) ||
                           /^(efectivo al repartidor|por transferencia|abono en efectivo|al recibir)$/i.test(t.trim());
    if (isPaymentChoice) {
      const lastOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      const payMethod = /transferencia|transferir|mp|mercado/i.test(t) ? 'Transferencia Bancaria' : 'Efectivo contraentrega';
      if (lastOrder) {
        db.updateOrderStatus(lastOrder.id, 'preparing');
      }
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes') && !lead.name.includes('domicilio')) ? lead.name : (nameGreeting || 'Don Juan');
      return `¡De diez ${clientName}! 🥩🔥 Ya quedó asentado tu medio de pago: **${payMethod}**${lastOrder ? ` para tu pedido **#${lastOrder.id}**` : ''}.\n\nYa lo pasamos al sector de corte para despacharlo dentro de las 24 hs a tu domicilio. ¡Muchas gracias por tu compra en República de la Carne! 🙌`;
    }

    // =========================================================================
    // 0.2 CONSULTA DIRECTA DE OFERTAS, PRECIOS, PROMOCIONES Y CORTES DISPONIBLES
    // =========================================================================
    const isOffersQuery = /oferta|ofertas|ofeta|ofetas|promo|promos|promocion|promociones|lista de precios|precios|precio|que tenes|que tenés|que hay|que cortes|que corte|que cortes hay|cortes en oferta|cortes tenes|cortes tenés|carta|catalogo|catálogo|opciones/i.test(t);
    const hasAddressOrOrderClose = /calle|av\.|avenida|barrio|funes|locelso|tupac|yupanqui|altura|dpto|domicilio/i.test(t);

    if (isOffersQuery && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes') && !lead.name.includes('domicilio')) ? lead.name : (nameGreeting || 'Don Juan');

      return `¡Mirá ${clientName}! 🔥 Estas son nuestras **OFERTAS Y CORTES DESTACADOS** del día en República de la Carne:\n\n` +
        `🔥 **PROMO ESTRELLA - COMBO ASADAZO (4 kg):**\n` +
        `🥩 Bocado parrillero + Aguja tierna + Falda especial + Chorizos criollos puro cerdo + Morcillas bombón + 🎁 **1 Vino Howlmande de regalo** ➔ **$39.999**\n\n` +
        `🥩 **CORTES SELECCIONADOS DE NOVILLITO (x Kilo):**\n` +
        `• **Tapa de Cuadril Seleccionada:** $12.800 / kg\n` +
        `• **Vacío Especial / Tierno:** $11.500 / kg\n` +
        `• **Costillar / Asado de Tira:** $9.800 / kg\n` +
        `• **Bife de Chorizo Premium:** $14.500 / kg\n` +
        `• **Entraña Fina:** $16.900 / kg\n` +
        `• **Costeletas de Cerdo (2kg x $15.000 promo):** $7.500 / kg\n` +
        `• **Chorizo Criollo Puro Cerdo (2kg x $10.000 promo):** $5.000 / kg\n` +
        `• **Morcilla Bombón Parrillera:** $5.200 / kg\n` +
        `• **Picada / Molida (3kg x $27.000 promo):** $9.000 / kg\n` +
        `• **Milanesas de Ternera (2kg x $24.990 promo):** $12.495 / kg\n` +
        `• **Pata Muslo de Pollo (3kg x $13.990 promo):** $4.660 / kg\n` +
        `• **Carbón Quebracho (bolsa grande):** $2.200\n\n` +
        `👉 ¿Cuál de estos cortes te gustaría que te preparemos o cuántos kilos te separamos? 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 1. CÁLCULO DE COMENSALES (SOLO SI DICE EXPLÍCITAMENTE "PERSONAS", "COMENSALES", "INVITADOS")
    // =========================================================================
    const explicitPeopleMatch = t.match(/(?:somos|para|comemos|seremos|calcular\s+para)\s*([0-9]+)\s*(?:personas|comensales|amigos|invitados|bocas)/i) ||
                                t.match(/([0-9]+)\s+(?:personas|comensales|amigos|invitados|bocas)/i);

    if (explicitPeopleMatch) {
      const count = parseInt(explicitPeopleMatch[1], 10);
      if (count >= 2 && count <= 50) {
        const totalKg = (count * 0.5).toFixed(1).replace('.0', '');
        
        let recommendation = '';
        if (count <= 4) {
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

        return `¡De diez${nameGreeting}! 🥩 ${recommendation}\n\n👉 **Paso 1:** ¿Te gusta esta combinación de cortes o preferís cambiar o sumar algún corte específico (tapa de cuadril, entraña, achuras)? [[STAGE:qualified]]`;
      }
    }

    // =========================================================================
    // 2. DETECCIÓN EXACTA DE ÍTEMS Y CANTIDADES (INDIVIDUALES O MÚLTIPLES)
    // (Ej: "Estoy buscando tapa de cuadril 2 kilos", "dame 1kg de vacio y 2 bolsas de carbon")
    // =========================================================================
    const { items: detectedItems, total: detectedTotal } = extractItemsFromHistoryAndText([], rawText, products);
    const hasRealItems = (detectedItems.length > 0 && !detectedItems[0].includes('• 1x Combo “Asadazo”')) || (detectedItems.length > 0 && /asadazo/i.test(rawText));

    if (hasRealItems && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes') && !lead.name.includes('domicilio')) ? lead.name : (nameGreeting || 'Don Juan');
      const formattedTotal = `$${detectedTotal.toLocaleString('es-AR')}`;

      return `¡De diez ${clientName}! 🥩 Te separo los cortes solicitados:\n\n` +
        `📋 **Detalle de tu pedido:**\n` +
        `${detectedItems.join('\n')}\n` +
        `💰 **Subtotal acumulado:** **${formattedTotal}**\n\n` +
        `👉 **¿Te gustaría sumar algún complemento?**\n` +
        `• 1 kg Chorizo Criollo puro cerdo ($5.000 / 2kg x $10.000 promo) o Morcillas ($5.200/kg)\n` +
        `• 1 bolsa de Carbón Quebracho ($2.200) o Vino Howlmande ($5.500)\n` +
        `• O pasamos directo a coordinar si te lo **enviamos a domicilio** o **retirás por sucursal** 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 2.1 CONSULTA DE PRECIO DE UN CORTE ESPECÍFICO SIN CANTIDAD ("cuanto sale la entraña")
    // =========================================================================
    const matchedCatalogItem = MASTER_CATALOG.find(item => 
      item.keywords.some(kw => t.includes(kw))
    );

    if (matchedCatalogItem && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes') && !lead.name.includes('domicilio')) ? lead.name : (nameGreeting || 'Don Juan');
      const formattedUnit = `$${matchedCatalogItem.price.toLocaleString('es-AR')}`;
      return `¡Sí, ${clientName}! 🥩 Tenemos **${matchedCatalogItem.name}** fresca y de excelente terneza a **${formattedUnit} por ${matchedCatalogItem.unit}**.\n\n¿Cuántos ${matchedCatalogItem.unit} te gustaría que te separemos para tu pedido? 🙌 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3. DETECTOR DE DATOS DE ENVÍO / DIRECCIÓN / CIERRE DE PEDIDO (PASO 3 Y 4)
    // =========================================================================
    const hasAddress = (/calle|av\.|avenida|barrio|altura|piso|dpto|entre\s|nro|n°|funes|locelso|tupac|yupanqui|domicilio/i.test(t) || (rawText.includes(',') && /[0-9]/.test(rawText))) && !/(?:kilo|kg|quilo|bolsa|botella)/i.test(t);

    if (hasAddress && t.length > 5) {
      let extractedName = '';
      let cleanAddress = rawText;

      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const line1 = lines[0];
        const line2 = lines.slice(1).join(', ');
        if (!/[0-9]/.test(line1) && line1.length >= 3 && line1.length <= 35) {
          extractedName = line1;
          cleanAddress = line2;
        }
      }

      if (!extractedName) {
        const explicitNameMatch = rawText.match(/(?:a nombre de|nombre:?|para|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:,|$|\.|\babono|\bpago|\ben efectivo|\bpor transferencia)/i);
        if (explicitNameMatch && explicitNameMatch[1].trim().length >= 3) {
          const candidate = explicitNameMatch[1].trim();
          if (!/funes|locelso|duarte|quiros|urca|calle|av|combo|asado|repartidor|efectivo|tupac|yupanqui/i.test(candidate)) {
            extractedName = candidate;
          }
        }
      }

      cleanAddress = cleanAddress
        .replace(/^(?:hola,?\s*)?(?:quiero|mandame|enviame|traeme|armame)?\s*(?:un\s*)?(?:combo\s*)?(?:asadazo\s*)?(?:para|a)?\s*/gi, '')
        .replace(/a mi domicilio,?\s*/gi, '')
        .replace(/(?:a nombre de|nombre:?|para|soy)?\s*[A-Za-zÁÉÍÓÚáéíóúñÑ ]*(?:mi nombre(?: completo)?|mi onmbre)/gi, '')
        .replace(/,\s*a nombre de\s+[A-Za-zÁÉÍÓÚáéíóúñÑ ]+/gi, '')
        .replace(/,\s*(?:abono|pago|en efectivo|al repartidor|por transferencia)[^,]*/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '')
        .trim();
      if (!cleanAddress || cleanAddress.length < 3) cleanAddress = rawText.trim();

      db.updateLead(lead.jid || lead.id, { address: cleanAddress, notes: `Dirección: ${cleanAddress}` });

      let finalClientName = extractedName;
      if (!finalClientName && customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') && customerName !== 'Don Juan' && !customerName.includes('recuerda') && !customerName.includes('efectivo') && !customerName.includes('funes') && !customerName.includes('domicilio')) {
        finalClientName = customerName;
      }

      if (finalClientName) {
        const { items: parsedItems, total: parsedTotal } = extractItemsFromHistoryAndText(history, rawText, products);

        const newOrder = db.createOrder({
          jid: lead.jid || lead.id,
          phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
          customerName: finalClientName,
          address: cleanAddress,
          items: parsedItems,
          totalAmount: parsedTotal,
          paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
          status: 'pending'
        });

        const formattedTotal = `$${parsedTotal.toLocaleString('es-AR')}`;
        db.updateLead(lead.jid || lead.id, { 
          name: finalClientName, 
          pushName: finalClientName, 
          address: cleanAddress, 
          value: parsedTotal, 
          stage: 'closed_won',
          notes: `Dirección: ${cleanAddress} | Pedido #${newOrder.id}`
        });

        return `¡Excelente ${finalClientName}! 🎉 Ya dejamos asentado y confirmado tu pedido paso a paso:\n\n🆔 *N° de Pedido:* #${newOrder.id}\n📋 *RESUMEN DE TU PEDIDO:*\n${parsedItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n👤 *Cliente:* ${finalClientName}\n📍 *Destino de Entrega:* ${cleanAddress}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n\n💳 *¿Cómo preferís abonar?*\n1️⃣ *Efectivo* al repartidor\n2️⃣ *Transferencia* (Alias: \`republica.carne.mp\`)\n3️⃣ *Mercado Pago* (Link directo con tarjetas)\n\nDecime cuál te queda más cómodo y te lo dejamos listo 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${parsedTotal}]]`;
      }

      db.updateLead(lead.jid || lead.id, { stage: 'proposal' });
      return `¡Excelente! Ya registré tu dirección: **${cleanAddress}** para la entrega del pedido 🥩🔥\n\nSolo me faltaría tu **Nombre y Apellido** para colocar en la etiqueta del envío del delivery. ¿A nombre de quién te lo dejamos? 😊 [[STAGE:proposal]]`;
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
    // 5. ACLARACIONES, CORRECCIONES Y OBJECIONES
    // =========================================================================
    if (/no te pedí|no pedi|otra cosa|eso no|no es eso|te equivocaste|para nada|te dije|no gracias|no quiero eso/i.test(t)) {
      return `¡Tenés toda la razón${nameGreeting}, disculpame la confusión! 🥩 Contame exactamente qué corte o pedido tenías en mente, o qué te gustaría cambiar, y te lo armo a tu medida paso a paso. 🙌`;
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
