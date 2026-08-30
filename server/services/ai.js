import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { SpeechService } from './speech.js';
import { mercadoPagoService } from './mercadopago.js';

export class AIService {
  /**
   * Genera la respuesta del agente de IA para un mensaje de WhatsApp
   * @param {Object} params
   * @param {string} params.jid - Identificador del cliente en WhatsApp
   * @param {string} params.incomingText - Texto del mensaje del cliente (o transcripción de audio)
   * @param {boolean} params.isAudioInput - Si el mensaje original del cliente fue una nota de voz
   * @returns {Promise<{ text: string, audioPath?: string, shouldSendAudio: boolean, suggestedStage?: string }>}
   */
  static async generateReply({ jid, incomingText, isAudioInput = false }) {
    const settings = db.getSettings();
    const lead = db.getLead(jid) || { name: 'Cliente', stage: 'new_lead', tags: [] };
    // Sliding window de mensajes para contexto
    const history = db.getMessages(jid, 8);
    const knowledgeBase = db.getKnowledgeBase();
    const products = db.getProducts();

    // RAG: Filtrar productos relevantes
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

    // RAG: Artículos de KB relevantes
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

    // System Prompt con Metodología Consultiva y Armado Paso a Paso
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
Actúa como un maestro carnicero y asesor consultivo experto que ayuda al cliente a armar su pedido ideal paso a paso:
1. PASO 1 (DESCUBRIMIENTO Y CÁLCULO DE COMENSALES):
   - Si el cliente pregunta qué llevar o menciona una ocasión (ej: "somos 6 para un asado", "qué me recomendás para 4", "quiero carne para la semana"):
     • Para Asado: Calcula entre 450g y 500g de carne por persona.
     • Para Comida Diaria / Semana: Calcula 300g a 350g por comida.
     • Evalúa los productos del catálogo y propone una combinación equilibrada con precios exactos y subtotal.
     • Pregúntale amablemente si le agrada esa propuesta o si prefiere cambiar algún corte.
2. PASO 2 (PERSONALIZACIÓN Y ADICIONALES / CROSS-SELLING):
   - Si el cliente acepta, agrega o pide modificar algo (ej: "sacame el cerdo", "sumá carbón", "agregale 1kg de picada"):
     • Confirma el cambio y muestra el subtotal acumulado.
     • Sugiere complementos lógicos (carbón quebracho, vino Howlmande, achuras, chimichurri) de forma natural.
3. PASO 3 (MODALIDAD DE ENTREGA O RETIRO):
   - Pregunta si prefiere envío a domicilio dentro de las 24 hs o retiro en alguna sucursal (Urca, Cerro, Gral Paz, Belgrano).
   - Si es a domicilio, solicita dirección exacta y nombre completo.
4. PASO 4 (RESUMEN OFICIAL Y FORMA DE PAGO):
   - Muestra el resumen estructurado:
     📋 *RESUMEN DE TU PEDIDO:*
     • [Productos, cantidades y precios]
     💰 *Total a abonar:* $[Monto total]
     📍 *Entrega / Retiro:* [Dirección o Sucursal]
     🚚 *Despacho:* Programado para el día (dentro de las 24 hs).
     💳 *Medios de Pago:* 1️⃣ Efectivo al recibir, 2️⃣ Transferencia (Alias: republica.carne.mp), 3️⃣ Mercado Pago.
   - Pregúntale cuál de los 3 medios de pago prefiere.
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
        // Fallback Inteligente y Consultivo local
        replyText = this.generateDynamicReply(incomingText, lead, knowledgeBase, settings);
      }
    } catch (error) {
      console.error('Error generando respuesta con IA:', error);
      replyText = this.generateDynamicReply(incomingText, lead, knowledgeBase, settings);
    }

    // Extraer y procesar cambio de etapa sugerido
    let suggestedStage = null;
    const stageMatch = replyText.match(/\[\[STAGE:([a-zA-Z_]+)\]\]/);
    if (stageMatch) {
      suggestedStage = stageMatch[1];
      replyText = replyText.replace(/\[\[STAGE:[a-zA-Z_]+\]\]/, '').trim();
      db.updateLeadStage(jid, suggestedStage);
    }

    // Determinar si debemos responder con Nota de Voz
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
      const sandboxTag = isSandbox ? '🧪 *[MODO PRUEBAS / SANDBOX]*\n' : '';
      const linkUrl = isSandbox 
        ? 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=2050924390-6312e69b-5204-487b-a44b-c792df651611' 
        : 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=2050924390-6312e69b-5204-487b-a44b-c792df651611';
      
      const sandboxNote = isSandbox ? '\n*(Enlace de prueba Sandbox - Usar tarjetas de test de Mercado Pago, no debita dinero real)*' : '';

      return `${sandboxTag}¡De diez ${clientName}! 🥩💳 Para abonar tu pedido **#${orderId}** por **$${amount.toLocaleString('es-AR')}** con Mercado Pago, podés hacerlo fácilmente:\n\n1️⃣ **Transferencia / Dinero en cuenta:**\n📱 *Alias Mercado Pago:* \`republica.carne.mp\`\n\n2️⃣ **Link de Pago Directo (Checkout Pro):**\n🔗 ${linkUrl}${sandboxNote}\n\nEn cuanto se acredite, ¡comenzamos la preparación de tus cortes en carnicería! 🙌`;
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
    // 1. EVALUACIÓN Y CÁLCULO DE COMENSALES (PASO 1: ASESORAMIENTO CONSULTIVO)
    // (Ej: "somos 6 para un asado", "asado para 8 personas", "somos 10", "que me recomiendas para 4")
    // =========================================================================
    const comensalesMatch = t.match(/(?:somos|para|comemos|seremos|calcular\s+para)?\s*([0-9]+)\s*(?:personas|personas\s+para|comensales|amigos|invitados|para\s+el\s+asado)?/i);
    const isAsadoContext = /asado|parrilla|fuego|carne|asadaso|asadazo|costilla|vacio/i.test(t) || comensalesMatch;

    if (comensalesMatch && isAsadoContext) {
      const count = parseInt(comensalesMatch[1], 10);
      if (count >= 2 && count <= 50) {
        // Cálculo experto: 500g por persona para asado
        const totalKg = (count * 0.5).toFixed(1).replace('.0', '');
        
        let recommendation = '';
        let estimatedPrice = 0;
        let breakdown = [];

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
    // 2. MODIFICACIONES AL CARRITO / QUITAR O SUMAR CORTES (PASO 2)
    // (Ej: "sacame el cerdo y poneme vacio", "sin morcilla", "agregale 2 bolsas de carbon", "sumale vino")
    // =========================================================================
    const isRemoval = /sacame|sin|quitar|eliminar|sacale|no quiero|cambiame/i.test(t);
    const isAddition = /agregale|sumale|ponele|ademas|tambien quiero|agregame|sumame/i.test(t);

    if (isRemoval || isAddition) {
      return `¡Entendido${nameGreeting}! 👍 Ya ajusté la selección de cortes a tu gusto.\n\n👉 **Paso 2:** ¿Te gustaría sumar carbón quebracho ($2.200), vino Howlmande ($5.500) o pasamos directamente a coordinar la **entrega a domicilio / retiro por sucursal**? 🥩 [[STAGE:negotiating]]`;
    }

    // =========================================================================
    // 3. DETECTOR DE DATOS DE ENVÍO / DIRECCIÓN (PASO 3 Y 4: CIERRE)
    // =========================================================================
    const hasAddress = /calle|av\.|avenida|barrio|altura|piso|dpto|entre\s|nro|n°|funes|locelso|domicilio|[0-9]{3,5}/i.test(t) || 
                       (rawText.includes(',') && /[0-9]/.test(rawText));
    
    const history = db.getMessages(lead.jid || lead.id, 10);
    const historyText = history.map(m => m.content).join(' ').toLowerCase();

    // Extracción de nombre
    let extractedNameFromText = '';
    const explicitNameMatch = rawText.match(/(?:a nombre de|nombre:?|para)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:,|$|\.|\babono|\bpago|\ben efectivo|\bpor transferencia)/i);
    if (explicitNameMatch && explicitNameMatch[1].trim().length >= 3) {
      const candidate = explicitNameMatch[1].trim();
      if (!/funes|locelso|duarte|quiros|urca|calle|av|combo|asado|repartidor|efectivo/i.test(candidate)) {
        extractedNameFromText = candidate;
      }
    }

    if (!extractedNameFromText && rawText.includes(',')) {
      const parts = rawText.split(',');
      for (const part of parts) {
        const clean = part.replace(/(?:mi nombre(?: completo)?|es mi nombre|mi onmbre|a nombre de|para)/gi, '').trim();
        if (clean.length >= 3 && clean.length <= 30 && !/[0-9]/.test(clean) && !/calle|av|funes|locelso|duarte|quiros|urca|domicilio|entrega|envio|esquina|casa|depto|piso|barrio|zona|abono|pago|efectivo|repartidor|transferencia|combo|asadazo/i.test(clean)) {
          extractedNameFromText = clean;
          break;
        }
      }
    }

    let cleanAddress = rawText
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

    if (hasAddress && t.length > 5) {
      db.updateLead(lead.jid || lead.id, { address: cleanAddress, notes: `Dirección: ${cleanAddress}` });

      let finalClientName = extractedNameFromText;
      if (!finalClientName && customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') && customerName !== 'Don Juan' && !customerName.includes('recuerda') && !customerName.includes('efectivo') && !customerName.includes('funes')) {
        finalClientName = customerName;
      }

      if (finalClientName) {
        let orderItems = [];
        let totalAmount = 0;

        if (historyText.includes('asadazo') || t.includes('asadazo') || historyText.includes('combo')) {
          orderItems.push('• 1x Combo “Asadazo” (4 kg cortes parrilleros + Vino de regalo) — $39.999');
          totalAmount += 39999;
        } else {
          orderItems.push('• 1x Combo Asadazo (4 kg cortes parrilleros + Vino de regalo) — $39.999');
          totalAmount += 39999;
        }

        const newOrder = db.createOrder({
          jid: lead.jid || lead.id,
          phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
          customerName: finalClientName,
          address: cleanAddress,
          items: orderItems,
          totalAmount: totalAmount,
          paymentMethod: 'Efectivo / Transferencia / Mercado Pago',
          status: 'pending'
        });

        const formattedTotal = `$${totalAmount.toLocaleString('es-AR')}`;
        db.updateLead(lead.jid || lead.id, { 
          name: finalClientName, 
          pushName: finalClientName, 
          address: cleanAddress, 
          value: totalAmount, 
          stage: 'closed_won',
          notes: `Dirección: ${cleanAddress} | Pedido #${newOrder.id}`
        });

        return `¡Excelente ${finalClientName}! 🎉 Ya dejamos asentado y confirmado tu pedido paso a paso:\n\n🆔 *N° de Pedido:* #${newOrder.id}\n📋 *RESUMEN DE TU PEDIDO:*\n${orderItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n👤 *Cliente:* ${finalClientName}\n📍 *Destino de Entrega:* ${cleanAddress}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n\n💳 *¿Cómo preferís abonar?*\n1️⃣ *Efectivo* al repartidor\n2️⃣ *Transferencia* (Alias: \`republica.carne.mp\`)\n3️⃣ *Mercado Pago* (Link directo con tarjetas)\n\nDecime cuál te queda más cómodo y te lo dejamos listo 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${totalAmount}]]`;
      }

      db.updateLead(lead.jid || lead.id, { stage: 'proposal' });
      return `¡Excelente! Ya registré tu dirección: **${cleanAddress}** para la entrega del pedido 🥩🔥\n\nSolo me faltaría tu **Nombre y Apellido** para colocar en la etiqueta del envío del delivery. ¿A nombre de quién te lo dejamos? 😊 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 4. DETECTOR DE COMBOS Y OFERTAS
    // =========================================================================
    const isComboQuery = /combo|asadazo|azadado|asadado|azadazo/i.test(t);
    if (isComboQuery) {
      return `¡El **Combo “Asadazo”** viene completísimo para la parrilla! 🔥\n\nIncluye **4 kg** de cortes seleccionados:\n🥩 Bocado parrillero\n🥩 Aguja tierna\n🥩 Falda especial\n🌭 Chorizo puro cerdo\n🌭 Morcilla bombón\n🎁 **De regalo:** 1 Vino Howlmande\n\n💰 **Precio Promo:** **$39.999**.\n\n👉 **Paso 1:** ¿Te gustaría sumar carbón ($2.200) o pasamos a coordinar la **entrega a domicilio / retiro por sucursal**? 🥩 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 5. DETECTOR DE CORTES ESPECÍFICOS POR KILO
    // =========================================================================
    const kiloMatch = t.match(/([0-9]+)\s*(?:kilo|kg|quilo|kilos|kgs)/i);
    const kilos = kiloMatch ? parseInt(kiloMatch[1], 10) : 1;

    for (const prod of products) {
      const prodName = prod.name.toLowerCase();
      if (t.includes(prodName) || (prodName.includes('picada') && (t.includes('molida') || t.includes('picada'))) || (prodName.includes('costilla') && t.includes('costilla')) || (prodName.includes('vacio') && t.includes('vacio')) || (prodName.includes('matambre') && t.includes('matambre')) || (prodName.includes('entraña') && t.includes('entraña')) || (prodName.includes('milanesa') && t.includes('milanesa'))) {
        const itemTotal = prod.price * kilos;
        return `¡Excelente elección${nameGreeting}! 🥩 Anoto los **${kilos} ${prod.unit || 'kg'} de ${prod.name}** a **$${itemTotal.toLocaleString('es-AR')}** ($${prod.price.toLocaleString('es-AR')}/${prod.unit || 'kg'}).\n\n👉 **Siguiente paso:** ¿Querés sumar algún otro corte para la semana (milanesas, carne picada, costeletas) o pasamos a coordinar si te lo enviamos a domicilio o retirás por sucursal? 🥩 [[STAGE:proposal]]`;
      }
    }

    // =========================================================================
    // 6. SUCURSALES / UBICACIONES
    // =========================================================================
    if (t.includes('sucursal') || t.includes('donde') || t.includes('direccion') || t.includes('horario') || t.includes('urca') || t.includes('quiros') || t.includes('villa allende')) {
      return `Contamos con 4 sucursales principales en Córdoba:\n\n1. **Urca Central:** Av. José Roque Funes 1115\n2. **Cerro de las Rosas:** Av. Rafael Núñez 4200\n3. **General Paz:** Av. 24 de Septiembre 1120\n4. **Villa Belgrano:** Av. Recta Martinolli 6500\n\n¡Además hacemos envíos a domicilio en el día! ¿En qué barrio o zona estás así coordinamos tu entrega? 🚚`;
    }

    // =========================================================================
    // 7. SALUDOS Y ATENCIÓN CONSULTIVA
    // =========================================================================
    if (/^(hola|buen|buenas|que tal|saludos|hey|alo)/i.test(t)) {
      return `¡Hola${nameGreeting}! 👋 Carlos por acá, maestro carnicero de República de la Carne. Te ayudo a armar tu pedido paso a paso para que no te falte nada.\n\n¿Estás buscando cortes para un asado con amigos, almuerzo familiar o carne para el freezer de la semana? Contame para cuántos comensales calculamos y te armo la mejor propuesta. 🥩🔥`;
    }

    return `¡Con gusto${nameGreeting}! Tenemos cortes de novillito fresco, picada especial ($5.800/kg), costeletas y nuestro Combo Asadazo ($39.999). Contame qué comida estás planeando y para cuántas personas, y armamos el pedido juntos paso a paso con envío en el día. 🥩`;
  }
}
