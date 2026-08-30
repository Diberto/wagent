import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { SpeechService } from './speech.js';
import { mercadoPagoService } from './mercadopago.js';

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

  // 1. Combo Asadazo
  if (/asadazo|combo asado|combo “asadazo”/i.test(allUserTexts)) {
    const qtyMatch = allUserTexts.match(/([0-9]+)\s*(?:x|combo|combos)?\s*asadazo/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const price = 39999 * qty;
    items.push(`• ${qty}x Combo “Asadazo” (4 kg cortes + Vino de regalo) — $${price.toLocaleString('es-AR')}`);
    total += price;
  }

  // 2. Línea por línea para detectar cortes y cantidades
  const lines = allUserTexts.split('\n');
  for (const line of lines) {
    const l = line.toLowerCase().trim();
    if (!l) continue;

    const kgMatch = l.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(?:kilo|kg|quilo|kilos|kgs|bolsa|bolsas|botella|botellas|x)?/i);
    const quantity = kgMatch ? parseFloat(kgMatch[1].replace(',', '.')) : 1;

    // Vacío
    if (/vacio|vacío/i.test(l) && !items.some(i => i.toLowerCase().includes('vacío') || i.toLowerCase().includes('vacio'))) {
      const p = products.find(x => /vacio|vacío/i.test(x.name)) || { price: 11500, unit: 'kg', name: 'Vacío Seleccionado' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Chorizo
    if (/chori|chorizo|chorizos/i.test(l) && !items.some(i => i.toLowerCase().includes('chori'))) {
      const p = products.find(x => /chori/i.test(x.name)) || { price: 6500, unit: 'kg', name: 'Chorizo Criollo Puro Cerdo' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Costilla / Asado
    if (/costilla|costillar|tira de asado|asado de tira/i.test(l) && !items.some(i => i.toLowerCase().includes('costilla') || i.toLowerCase().includes('costillar'))) {
      const p = products.find(x => /costilla|costillar/i.test(x.name)) || { price: 9800, unit: 'kg', name: 'Costillar de Novillito' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Picada / Molida
    if (/picada|molida/i.test(l) && !items.some(i => i.toLowerCase().includes('picada') || i.toLowerCase().includes('molida'))) {
      const p = products.find(x => /picada|molida/i.test(x.name)) || { price: 5800, unit: 'kg', name: 'Picada Especial' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Milanesas
    if (/milanesa|milanesas/i.test(l) && !items.some(i => i.toLowerCase().includes('milanesa'))) {
      const p = products.find(x => /milanesa/i.test(x.name)) || { price: 9200, unit: 'kg', name: 'Milanesas de Novillito' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Costeletas / Cerdo
    if (/costeleta|costeletas|cerdo/i.test(l) && !items.some(i => i.toLowerCase().includes('costeleta') || i.toLowerCase().includes('cerdo'))) {
      const p = products.find(x => /costeleta|cerdo/i.test(x.name)) || { price: 7500, unit: 'kg', name: 'Costeletas de Cerdo' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Morcilla
    if (/morcilla|morcillas/i.test(l) && !items.some(i => i.toLowerCase().includes('morcilla'))) {
      const p = products.find(x => /morcilla/i.test(x.name)) || { price: 5200, unit: 'kg', name: 'Morcilla Bombón' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Matambre
    if (/matambre/i.test(l) && !items.some(i => i.toLowerCase().includes('matambre'))) {
      const p = products.find(x => /matambre/i.test(x.name)) || { price: 9500, unit: 'kg', name: 'Matambre de Cerdo / Vaca' };
      const sub = p.price * quantity;
      items.push(`• ${quantity} ${p.unit || 'kg'} ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Carbón
    if (/carbon|carbón/i.test(l) && !items.some(i => i.toLowerCase().includes('carbón') || i.toLowerCase().includes('carbon'))) {
      const p = products.find(x => /carbon|carbón/i.test(x.name)) || { price: 2200, unit: 'bolsa', name: 'Carbón Quebracho Blanco' };
      const sub = p.price * quantity;
      items.push(`• ${quantity}x ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
    }

    // Vino
    if (/vino/i.test(l) && !items.some(i => i.toLowerCase().includes('vino'))) {
      const p = products.find(x => /vino/i.test(x.name)) || { price: 5500, unit: 'botella', name: 'Vino Howlmande Malbec' };
      const sub = p.price * quantity;
      items.push(`• ${quantity}x ${p.name} — $${sub.toLocaleString('es-AR')}`);
      total += sub;
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

    const formattedHistory = history.map(msg => {
      const role = msg.sender === 'user' ? 'Cliente' : 'Asesor Carnicero';
      return `${role}: ${msg.content}`;
    }).join('\n');

    const systemInstruction = `${settings.systemPrompt}

DATOS DEL CLIENTE EN ESTE CHAT:
- Nombre / Perfil: ${lead.pushName || lead.name || 'Cliente'}
- Teléfono: ${lead.phone || jid.split('@')[0]}
- Etapa en CRM: ${lead.stage || 'Nuevo Lead'}
- Notas previas: ${lead.notes || 'Sin notas'}

CATÁLOGO OFICIAL DE PRODUCTOS Y PRECIOS DISPONIBLES (República de la Carne):
${productCatalogContext || 'Consultar con asesor.'}

BASE DE CONOCIMIENTOS DE LA EMPRESA (HORARIOS, SUCURSALES, ENVÍOS, PAGOS):
${kbContext || 'Envíos en el día dentro de las 24 hs. Sucursales: Urca, Cerro de las Rosas, General Paz, Villa Belgrano.'}

METODOLOGÍA DE ASESORAMIENTO Y ARMADO DE PEDIDO PASO A PASO:
1. PASO 1 (EVALUACIÓN Y CÁLCULO DE COMENSALES):
   - Si el cliente pregunta qué llevar o menciona cuántos comensales son:
     • Calcula 500g por persona para asado (o 300g para diario).
     • Propone una combinación equilibrada con precios exactos y subtotal.
     • Pregúntale si le gusta la propuesta o si prefiere cambiar algún corte.
2. PASO 2 (PERSONALIZACIÓN Y ADICIONALES):
   - Si el cliente confirma o modifica cortes (ej: "2kg de vacio y 2kg de chorizos", "sacame el cerdo", "sumá carbón"):
     • Confirma los cortes, calcula el subtotal exacto y sugiere complementos (carbón, vino Howlmande, achuras).
     • Pregunta si prefiere entrega a domicilio o retiro por sucursal.
3. PASO 3 (DATOS DE ENTREGA):
   - Pide la dirección exacta y nombre completo para la entrega.
4. PASO 4 (RESUMEN OFICIAL Y PAGO):
   - Muestra el resumen estructurado con total en ARS y opciones de pago:
     📋 *RESUMEN DE TU PEDIDO:*
     • [Productos pedidos, cantidades y precios]
     💰 *Total a abonar:* $[Monto total]
     📍 *Entrega:* [Dirección informada]
     🚚 *Despacho:* Programado para el día (dentro de las 24 hs).
     💳 *Medios de Pago:* 1️⃣ Efectivo al recibir, 2️⃣ Transferencia (Alias: republica.carne.mp), 3️⃣ Mercado Pago.
   - Incluye al final: [[STAGE:closed_won]] [[PAYMENT_AMOUNT:monto_total]]`;

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      const isValidNvidiaKey = settings.nvidiaApiKey && settings.nvidiaApiKey.startsWith('nvapi-');
      const isValidCustom = settings.customBaseUrl && settings.customBaseUrl.startsWith('http');

      if (settings.aiProvider === 'nvidia' && isValidNvidiaKey) {
        const nvidia = new OpenAI({
          apiKey: settings.nvidiaApiKey,
          baseURL: 'https://integrate.api.nvidia.com/v1'
        });

        const messages = [{ role: 'system', content: systemInstruction }];
        history.forEach(m => {
          messages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
          });
        });
        if (messages[messages.length - 1]?.content !== incomingText) {
          messages.push({ role: 'user', content: incomingText });
        }

        const completion = await nvidia.chat.completions.create({
          model: settings.nvidiaModel || 'meta/llama-3.3-70b-instruct',
          messages,
          temperature: 0.6,
          max_tokens: 450
        });

        replyText = completion.choices[0]?.message?.content || '';
      } else if (settings.aiProvider === 'custom' && isValidCustom) {
        const customClient = new OpenAI({
          apiKey: settings.customApiKey || 'dummy-key',
          baseURL: settings.customBaseUrl
        });

        const messages = [{ role: 'system', content: systemInstruction }];
        history.forEach(m => {
          messages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
          });
        });
        if (messages[messages.length - 1]?.content !== incomingText) {
          messages.push({ role: 'user', content: incomingText });
        }

        const completion = await customClient.chat.completions.create({
          model: settings.customModel || 'llama3',
          messages,
          temperature: 0.6,
          max_tokens: 450
        });

        replyText = completion.choices[0]?.message?.content || '';
      } else if (settings.aiProvider === 'gemini' && isValidGeminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const configuredModel = settings.aiModel;
        const modelName = (configuredModel && (configuredModel.includes('latest') || configuredModel.includes('3.'))) 
          ? configuredModel 
          : 'gemini-flash-latest';
        
        let model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const prompt = `HISTORIAL DE LA CONVERSACIÓN:\n${formattedHistory}\n\nÚLTIMO MENSAJE DEL CLIENTE: "${incomingText}"\n\nTu respuesta como Asesor Carnicero:`;
        try {
          const result = await model.generateContent(prompt);
          replyText = result.response.text();
        } catch (mErr) {
          console.warn(`⚠️ Error con modelo ${modelName}, reintentando con gemini-flash-latest:`, mErr.message);
          const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest', systemInstruction });
          const result = await fallbackModel.generateContent(prompt);
          replyText = result.response.text();
        }
      } else if (settings.aiProvider === 'openai' && isValidOpenAiKey) {
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const messages = [{ role: 'system', content: systemInstruction }];
        history.forEach(m => {
          messages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
          });
        });
        if (messages[messages.length - 1]?.content !== incomingText) {
          messages.push({ role: 'user', content: incomingText });
        }

        const completion = await openai.chat.completions.create({
          model: settings.aiModel || 'gpt-4o-mini',
          messages,
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
   * Generador de respuestas dinámicas e inteligentes paso a paso cuando no hay API Key externa
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
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes')) ? lead.name : (nameGreeting || 'Don Juan');
      
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
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes')) ? lead.name : (nameGreeting || 'Don Juan');
      return `¡De diez ${clientName}! 🥩🔥 Ya quedó asentado tu medio de pago: **${payMethod}**${lastOrder ? ` para tu pedido **#${lastOrder.id}**` : ''}.\n\nYa lo pasamos al sector de corte para despacharlo dentro de las 24 hs a tu domicilio. ¡Muchas gracias por tu compra en República de la Carne! 🙌`;
    }

    // =========================================================================
    // 0.2 CONSULTA DIRECTA DE OFERTAS, PRECIOS, PROMOCIONES Y CORTES DISPONIBLES
    // (Ej: "que tenes en oferta para asado", "que cortes hay en oferta", "que cortes hay en ofeta", "precios", "ofertas")
    // =========================================================================
    const isOffersQuery = /oferta|ofertas|ofeta|ofetas|promo|promos|promocion|promociones|lista de precios|precios|precio|que tenes|que tenés|que hay|que cortes|que corte|que cortes hay|cortes en oferta|cortes tenes|cortes tenés|carta|catalogo|catálogo|opciones/i.test(t);
    const hasAddressOrOrderClose = /calle|av\.|avenida|barrio|funes|locelso|altura|dpto|domicilio/i.test(t) || /(?:quiero|dame|traeme|mandame|anotame)\s+[0-9]+/i.test(t);

    if (isOffersQuery && !hasAddressOrOrderClose) {
      const clientName = (lead.name && !lead.name.includes('recuerda') && !lead.name.includes('efectivo') && !lead.name.includes('funes')) ? lead.name : (nameGreeting || 'Don Juan');

      return `¡Mirá ${clientName}! 🔥 Estas son nuestras **OFERTAS Y CORTES DESTACADOS** del día en República de la Carne:\n\n` +
        `🔥 **PROMO ESTRELLA - COMBO ASADAZO (4 kg):**\n` +
        `🥩 Bocado parrillero + Aguja tierna + Falda especial + Chorizos criollos puro cerdo + Morcillas bombón + 🎁 **1 Vino Howlmande de regalo** ➔ **$39.999**\n\n` +
        `🥩 **CORTES SELECCIONADOS DE NOVILLITO (x Kilo):**\n` +
        `• **Vacío Especial / Tierno:** $11.500 / kg\n` +
        `• **Costillar / Asado de Tira:** $9.800 / kg\n` +
        `• **Matambre de Cerdo:** $8.500 / kg\n` +
        `• **Costeletas de Cerdo:** $7.500 / kg\n` +
        `• **Chorizo Criollo Puro Cerdo:** $6.500 / kg\n` +
        `• **Morcilla Bombón Parrillera:** $5.200 / kg\n` +
        `• **Picada Especial:** $5.800 / kg\n` +
        `• **Milanesas de Nalga preparadas:** $8.900 / kg\n` +
        `• **Carbón Quebracho (bolsa grande):** $2.200\n\n` +
        `👉 ¿Cuál de estos cortes te gustaría que te preparemos o cuántos kilos te separamos? 🥩🚚 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 1. EVALUACIÓN Y CÁLCULO DE COMENSALES (PASO 1: ASESORAMIENTO CONSULTIVO)
    // =========================================================================
    const comensalesMatch = t.match(/(?:somos|para|comemos|seremos|calcular\s+para)?\s*([0-9]+)\s*(?:personas|personas\s+para|comensales|amigos|invitados|para\s+el\s+asado)?/i);
    const isAsadoContext = /asado|parrilla|fuego|carne|asadaso|asadazo|costilla|vacio/i.test(t) || comensalesMatch;

    if (comensalesMatch && isAsadoContext) {
      const count = parseInt(comensalesMatch[1], 10);
      if (count >= 2 && count <= 50) {
        const totalKg = (count * 0.5).toFixed(1).replace('.0', '');
        
        let recommendation = '';
        if (count <= 4) {
          recommendation = `🔥 Para **${count} personas**, calculamos unos **2 a 2.5 kg de carne** en total. Te recomiendo:\n\n` +
            `• **1x Combo Asadazo (4 kg):** Incluye Bocado, Aguja, Falda, Chori criollo, Morcilla + Vino de regalo ➔ **$39.999** (¡Te queda abundante y con vino incluido!).\n` +
            `o si preferís cortes a elección:\n` +
            `• 1.5 kg Vacío Seleccionado ($17.250)\n` +
            `• 1.0 kg Costeletas de Cerdo ($7.500)\n` +
            `• 0.5 kg Chorizo Criollo ($3.250)\n` +
            `💰 Total a elección: **$28.000**`;
        } else if (count <= 8) {
          recommendation = `🔥 Para **${count} personas**, calculamos unos **${totalKg} kg de carne** para que coman de diez. Te armo esta propuesta equilibrada:\n\n` +
            `• 2.0 kg Costillar de Novillito ($19.600)\n` +
            `• 1.5 kg Vacío Seleccionado ($17.250)\n` +
            `• 1.0 kg Chorizo Criollo Puro Cerdo ($6.500)\n` +
            `• 1.0 kg Morcilla Bombón ($5.200)\n` +
            `💰 *Subtotal estimado (${totalKg} kg):* **$48.550**\n` +
            `🎁 ¡Sumamos 1 bolsa de carbón quebracho ($2.200) o Vino Howlmande si lo confirmamos hoy!`;
        } else {
          recommendation = `🔥 ¡Tremendo asado para **${count} personas**! Calculamos unos **${totalKg} kg de carne** en total. Te recomiendo armar:\n\n` +
            `• 4.0 kg Costillar / Asado de Tira ($39.200)\n` +
            `• 3.0 kg Vacío Especial ($34.500)\n` +
            `• 2.0 kg Chorizo Criollo ($13.000)\n` +
            `• 1.5 kg Morcilla Bombón ($7.800)\n` +
            `• 1.5 kg Matambre de Cerdo ($12.750)\n` +
            `💰 *Total estimado (${totalKg} kg):* **$107.250**`;
        }

        return `¡De diez${nameGreeting}! 🥩 ${recommendation}\n\n👉 **Paso 1:** ¿Te gusta esta combinación de cortes o preferís cambiar o sumar algún corte específico (entraña, achuras, mollejas)? [[STAGE:qualified]]`;
      }
    }

    // =========================================================================
    // 2. DETECTOR DE LISTA DE CORTES / ÍTEMS SOLICITADOS (PASO 2: CONSTRUCCIÓN)
    // (Ej: "Quiero 2kg de chorizos, 2kg de vacio", "dame 1kg de picada")
    // =========================================================================
    const hasCutsMention = /vacio|vacío|chori|chorizo|costilla|costillar|picada|molida|milanesa|milanesas|costeleta|cerdo|morcilla|matambre|asadazo|combo/i.test(t);
    const hasAddress = /calle|av\.|avenida|barrio|altura|piso|dpto|entre\s|nro|n°|funes|locelso|tupac|yupanqui|domicilio|[0-9]{3,5}/i.test(t) || 
                       (rawText.includes(',') && /[0-9]/.test(rawText));

    if (hasCutsMention && !hasAddress) {
      const { items, total } = extractItemsFromHistoryAndText(history, rawText, products);
      const formattedTotal = `$${total.toLocaleString('es-AR')}`;

      return `¡Anotado${nameGreeting}! 🥩 Te separo los cortes solicitados:\n\n${items.join('\n')}\n💰 *Subtotal acumulado:* **${formattedTotal}**\n\n👉 **Siguiente paso:** ¿Te gustaría sumar 1 bolsa de carbón quebracho ($2.200) o vino Howlmande ($5.500), o pasamos a coordinar si te lo **enviamos a domicilio** o **retirás por sucursal**? 🥩 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 3. DETECTOR DE DATOS DE ENVÍO / DIRECCIÓN / CIERRE DE PEDIDO (PASO 3 Y 4)
    // =========================================================================
    if (hasAddress && t.length > 5) {
      // Extracción inteligente de nombre y dirección
      let extractedName = '';
      let cleanAddress = rawText;

      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        // Formato multilínea: Línea 1 = Nombre, Línea 2 = Dirección
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

      if (!extractedName && rawText.includes(',')) {
        const parts = rawText.split(',');
        for (const part of parts) {
          const clean = part.replace(/(?:mi nombre(?: completo)?|es mi nombre|mi onmbre|a nombre de|para)/gi, '').trim();
          if (clean.length >= 3 && clean.length <= 30 && !/[0-9]/.test(clean) && !/calle|av|funes|locelso|duarte|quiros|urca|tupac|yupanqui|domicilio|entrega|envio|esquina|casa|depto|piso|barrio|zona|abono|pago|efectivo|repartidor|transferencia|combo|asadazo/i.test(clean)) {
            extractedName = clean;
            break;
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
      if (!finalClientName && customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') && customerName !== 'Don Juan' && !customerName.includes('recuerda') && !customerName.includes('efectivo') && !customerName.includes('funes')) {
        finalClientName = customerName;
      }

      if (finalClientName) {
        // Extraer los ítems y totales reales de la conversación
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
    // 4. COMBOS Y OFERTAS
    // =========================================================================
    const isComboQuery = /combo|asadazo|azadado|asadado|azadazo/i.test(t);
    if (isComboQuery) {
      return `¡El **Combo “Asadazo”** viene completísimo para la parrilla! 🔥\n\nIncluye **4 kg** de cortes seleccionados:\n🥩 Bocado parrillero\n🥩 Aguja tierna\n🥩 Falda especial\n🌭 Chorizo puro cerdo\n🌭 Morcilla bombón\n🎁 **De regalo:** 1 Vino Howlmande\n\n💰 **Precio Promo:** **$39.999**.\n\n👉 **Paso 1:** ¿Te gustaría sumar carbón ($2.200) o pasamos a coordinar la **entrega a domicilio / retiro por sucursal**? 🥩 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 5. SUCURSALES / UBICACIONES
    // =========================================================================
    if (t.includes('sucursal') || t.includes('donde') || t.includes('direccion') || t.includes('horario') || t.includes('urca') || t.includes('quiros') || t.includes('villa allende')) {
      return `Contamos con 4 sucursales principales en Córdoba:\n\n1. **Urca Central:** Av. José Roque Funes 1115\n2. **Cerro de las Rosas:** Av. Rafael Núñez 4200\n3. **General Paz:** Av. 24 de Septiembre 1120\n4. **Villa Belgrano:** Av. Recta Martinolli 6500\n\n¡Además hacemos envíos a domicilio en el día! ¿En qué barrio o zona estás así coordinamos tu entrega? 🚚`;
    }

    // =========================================================================
    // 5.5 ACLARACIONES, CORRECCIONES Y OBJECIONES ("no te pedí eso", "eso no", "espera")
    // =========================================================================
    if (/no te pedí|no pedi|otra cosa|eso no|no es eso|te equivocaste|para nada|te dije|no gracias|no quiero eso/i.test(t)) {
      return `¡Tenés toda la razón${nameGreeting}, disculpame la confusión! 🥩 Contame exactamente qué corte o pedido tenías en mente, o qué te gustaría cambiar, y te lo armo a tu medida paso a paso. 🙌`;
    }

    // =========================================================================
    // 5.6 PREGUNTAS POR CORTES ESPECÍFICOS (CATÁLOGO EN TIEMPO REAL)
    // =========================================================================
    const matchedProduct = products.find(p => t.includes((p.name || '').toLowerCase()) || ((p.aliases || []).some(a => t.includes(a.toLowerCase()))));
    if (matchedProduct) {
      const unit = matchedProduct.unit || 'kg';
      const formattedPrice = `$${Number(matchedProduct.price).toLocaleString('es-AR')}`;
      return `¡Sí, tenemos **${matchedProduct.name}** fresco de novillito de primera! 🥩\n\nEstá a **${formattedPrice} / ${unit}**.\n\n¿Cuántos ${unit} te gustaría que te preparemos o querés combinarlo con algún otro corte?`;
    }

    // =========================================================================
    // 6. SALUDOS Y ATENCIÓN CONSULTIVA
    // =========================================================================
    if (/^(hola|buen|buenas|que tal|saludos|hey|alo|buenos dias|buenas tardes|buenas noches)/i.test(t)) {
      const greetings = [
        `¡Hola${nameGreeting}! 👋 Carlos por acá, maestro carnicero de República de la Carne. Te ayudo a armar tu pedido para que no te falte nada.\n\n¿Estás planeando un asado, comida familiar o querés abastecer el freezer de la semana? Contame para cuántos comensales calculamos y te armo la propuesta perfecta. 🥩🔥`,
        `¡Buenas${nameGreeting}! ¿Cómo estás? Te atiende la carnicería República de la Carne. Contame qué cortes estás buscando hoy o para qué ocasión, y te paso precios y disponibilidad al toque. 🥩`,
        `¡Hola${nameGreeting}! Qué lindo saludarte. Tenemos ingresos frescos de costillares, vacíos, achuras y milanesas preparadas. ¿Qué tenías ganas de preparar hoy? 🥩🙌`
      ];
      const selected = greetings[Math.floor(Math.random() * greetings.length)];
      return selected;
    }

    // =========================================================================
    // 7. RESPUESTA DINÁMICA CONTEXTUAL POR DEFECTO (NUNCA ROBÓTICA)
    // =========================================================================
    const fallbackVariations = [
      `¡Excelente${nameGreeting}! Te leí atentamente. En República de la Carne tenemos novillito seleccionado, cortes para parrilla, horno y embutidos propios.\n\nDecime qué cortes o kilos tenías pensado llevar y te paso el presupuesto exacto con envío a domicilio en el día. 🥩`,
      `¡Tomado nota${nameGreeting}! Para dejarlo perfecto: ¿te gustaría que te reservemos algún corte en especial (como vacío, costillar, picada o costeletas) o querés que te recomiende un combo para la cantidad de personas que van a comer? 🥩🔥`,
      `¡De diez${nameGreeting}! Contame qué cortes estás buscando o si preferís que te pase nuestra lista de ofertas del día para aprovechar. Hacemos envíos directos a tu puerta. 🛵🥩`
    ];
    return fallbackVariations[Math.floor(Math.random() * fallbackVariations.length)];
  }
}
