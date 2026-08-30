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
    // Optimización de tokens: Sliding window reducida a los 6 mensajes más recientes y relevantes
    const history = db.getMessages(jid, 6);
    const knowledgeBase = db.getKnowledgeBase();
    const products = db.getProducts();

    // Optimización RAG: Filtrar productos relevantes a la consulta para no saturar el prompt
    const queryTokens = (incomingText || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let relevantProducts = products.filter(p => {
      const pText = `${p.name} ${p.category || ''} ${p.description || ''}`.toLowerCase();
      return queryTokens.some(tok => pText.includes(tok));
    });

    if (relevantProducts.length === 0) {
      // Si no hay coincidencia directa, enviar solo los productos principales / combos destacados
      relevantProducts = products.slice(0, 6);
    } else if (relevantProducts.length > 8) {
      relevantProducts = relevantProducts.slice(0, 8);
    }

    const productCatalogContext = relevantProducts.map((p, i) => {
      return `• ${p.name} ($${p.price}/${p.unit || 'kg'}) | ${p.description || 'Disponible'}`;
    }).join('\n');

    // Optimización RAG: Filtrar artículos KB relevantes
    let relevantKB = knowledgeBase.filter(item => {
      const kbText = `${item.title} ${item.category || ''} ${item.content || ''} ${(item.keywords || []).join(' ')}`.toLowerCase();
      return queryTokens.some(tok => kbText.includes(tok));
    });

    if (relevantKB.length === 0) {
      relevantKB = knowledgeBase.slice(0, 3);
    } else if (relevantKB.length > 4) {
      relevantKB = relevantKB.slice(0, 4);
    }

    const kbContext = relevantKB.map(item => `[${item.title}]: ${item.content}`).join('\n');

    // 2. Historial formateado token-efficient
    const formattedHistory = history.map(msg => {
      const role = msg.sender === 'user' ? 'Cliente' : 'Asesor';
      return `${role}: ${msg.content}`;
    }).join('\n');

    // 3. Prompt de sistema enriquecido
    const systemInstruction = `${settings.systemPrompt}

DATOS DEL CLIENTE EN ESTE CHAT:
- Nombre / Perfil: ${lead.pushName || lead.name || 'Cliente'}
- Número: ${lead.phone || jid.split('@')[0]}
- Etapa en CRM: ${lead.stage || 'Nuevo Lead'}
- Notas previas: ${lead.notes || 'Sin notas'}

CATÁLOGO OFICIAL DE PRODUCTOS Y PRECIOS DISPONIBLES:
${productCatalogContext || 'Consultar con asesor humano.'}

BASE DE CONOCIMIENTOS DE LA EMPRESA (HORARIOS, ENVÍOS, PAGOS, POLÍTICAS):
${kbContext || 'No hay artículos específicos cargados en la base de conocimientos.'}

INSTRUCCIONES CLAVE DE CIERRE DE VENTAS Y TOMA DE PEDIDOS:
1. SI EL CLIENTE CONSULTA POR UN PRODUCTO O CORTE: Bríndale el precio exacto del Catálogo de Productos, explícale para qué cocción es ideal y pregúntale: "¿Te lo enviamos a domicilio o pasás a retirarlo por sucursal? Pasame tu dirección y nombre así te preparo el pedido."
2. SI EL CLIENTE PIDE O CONFIRMA UN PRODUCTO/COMBO (ej: "quiero un combo asadazo", "dame 1kg de picada"):
   - Confirma de inmediato la reserva del producto y el precio total.
   - Pídele sus datos de entrega: "Pasame tu dirección de entrega y nombre completo para coordinar el despacho ahora mismo."
   - Incluye al final: [[STAGE:proposal]]
3. SI EL CLIENTE PROPORCIONA SU DIRECCIÓN O DATOS DE ENVÍO (ej: "Juan Perez, calle..."):
   - CIERRA Y CONFIRMA EL PEDIDO INMEDIATAMENTE con un Resumen Oficial estructurado:
     📋 *RESUMEN DE TU PEDIDO:*
     • [Productos pedidos, cantidades y precios]
     💰 *Total a abonar:* $[Monto total]
     📍 *Entrega:* [Dirección informada]
     🚚 *Despacho:* Programado para el día (dentro de las 24 hs).
     💳 *Medios de Pago:* Efectivo contraentrega o Transferencia al Alias: republica.carne.mp
   - Pregúntale si prefiere abonar en efectivo al repartidor o por transferencia.
   - Incluye al final: [[STAGE:closed_won]] [[PAYMENT_AMOUNT:monto_total]]
4. Si el cliente pregunta sucursal cercana, horarios o envíos, responde con precisión de la base de datos.`;

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      const isValidNvidiaKey = settings.nvidiaApiKey && settings.nvidiaApiKey.startsWith('nvapi-');
      const isValidCustom = settings.customBaseUrl && settings.customBaseUrl.startsWith('http');

      if (settings.aiProvider === 'nvidia' && isValidNvidiaKey) {
        // --- 1. NVIDIA NIM API ---
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
          max_tokens: 350
        });

        replyText = completion.choices[0]?.message?.content || '';
      } else if (settings.aiProvider === 'custom' && isValidCustom) {
        // --- 2. CUSTOM OPENAI-COMPATIBLE ENDPOINT (Ollama, LM Studio, Groq, DeepSeek) ---
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
          max_tokens: 350
        });

        replyText = completion.choices[0]?.message?.content || '';
      } else if (settings.aiProvider === 'gemini' && isValidGeminiKey) {
        // --- 3. GOOGLE GEMINI ---
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const configuredModel = settings.aiModel;
        const modelName = (configuredModel && (configuredModel.includes('latest') || configuredModel.includes('3.'))) 
          ? configuredModel 
          : 'gemini-flash-latest';
        
        let model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const prompt = `HISTORIAL DE LA CONVERSACIÓN:\n${formattedHistory}\n\nÚLTIMO MENSAJE DEL CLIENTE: "${incomingText}"\n\nTu respuesta como Asesor:`;
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
        // --- 4. OPENAI ---
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
          max_tokens: 350
        });

        replyText = completion.choices[0]?.message?.content || '';
      } else {
        // --- 5. RESPUESTA INTELIGENTE SIN API KEY (Contextual y Dinámica basada en KB) ---
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
   * Analiza imágenes recibidas por WhatsApp (Productos, Tickets, Comprobantes de Pago)
   */
  static async analyzeImageAndReply({ jid, imagePath, caption = '' }) {
    const settings = db.getSettings();
    const lead = db.getLead(jid) || { name: 'Cliente', stage: 'new_lead' };
    const knowledgeBase = db.getKnowledgeBase();

    const kbContext = knowledgeBase.map((k, i) => `[${i + 1}] ${k.title}: ${k.content}`).join('\n');

    const visionPrompt = `Eres el asistente de ventas y facturación de "${settings.businessName || 'nuestra empresa'}".
El cliente te acaba de enviar una imagen por WhatsApp con el comentario: "${caption || 'Sin comentario'}".

BASE DE CONOCIMIENTOS:
${kbContext}

INSTRUCCIONES DE ANÁLISIS DE LA IMAGEN:
1. SI ES UN COMPROBANTE DE PAGO, TICKET, TRANSFERENCIA O FACTURA:
   - Identifica el monto abonado, banco/medio de pago y número de transacción/referencia.
   - Responde confirmando que el comprobante fue recibido correctamente y agradece el pago.
   - Agrega al final de tu respuesta: [[STAGE:closed_won]] y [[PAYMENT_AMOUNT:monto]] (ej: [[PAYMENT_AMOUNT:1500]]).
2. SI ES LA FOTO DE UN PRODUCTO O ARTÍCULO:
   - Identifica qué producto es y ofrece información comercial, precios, disponibilidad o detalles basados en la base de conocimientos.
   - Sugiere el siguiente paso de compra.
3. SI ES OTRA IMAGEN:
   - Describe cordialmente lo que ves y pregunta en qué puedes ayudarle respecto a sus compras o consultas.

Responde en español de forma concisa (1 a 2 párrafos cortos para WhatsApp).`;

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');

      if (isValidGeminiKey) {
        // Gemini Flash Latest Vision
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Data = imageBuffer.toString('base64');

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          { text: visionPrompt }
        ]);
        replyText = result.response.text();
      } else if (isValidOpenAiKey) {
        // OpenAI GPT-4o Vision
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: visionPrompt },
                { type: 'image_url', image_url: { url: base64Image } }
              ]
            }
          ],
          max_tokens: 400
        });
        replyText = completion.choices[0]?.message?.content || '';
      } else {
        // Fallback si no hay API key de visión
        replyText = `¡Muchas gracias por enviarnos la imagen! 📸 He registrado tu foto en el sistema. ¿Deseas que verifiquemos este comprobante de pago o que te brindemos cotización sobre este producto?`;
      }
    } catch (err) {
      console.error('Error analizando imagen con IA:', err);
      replyText = `¡Imagen recibida con éxito! Nuestro equipo y sistema de ventas la han registrado. ¿En qué podemos asesorarte con respecto a esta imagen?`;
    }

    // Procesar pago detectado
    const paymentMatch = replyText.match(/\[\[PAYMENT_AMOUNT:([0-9.,]+)\]\]/);
    if (paymentMatch) {
      const amount = parseFloat(paymentMatch[1].replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        db.updateLead(jid, { value: amount, stage: 'closed_won' });
      }
      replyText = replyText.replace(/\[\[PAYMENT_AMOUNT:[0-9.,]+\]\]/, '').trim();
    }

    const stageMatch = replyText.match(/\[\[STAGE:([a-zA-Z_]+)\]\]/);
    if (stageMatch) {
      db.updateLeadStage(jid, stageMatch[1]);
      replyText = replyText.replace(/\[\[STAGE:[a-zA-Z_]+\]\]/, '').trim();
    }

    return { text: replyText };
  }

  /**
   * Generador de respuestas dinámicas e inteligentes cuando no hay API Key activa
   */
  static generateDynamicReply(text, lead, knowledgeBase, settings) {
    const t = (text || '').toLowerCase().trim();
    const rawText = text || '';
    const customerName = lead.pushName || lead.name || '';
    const nameGreeting = customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') ? ` ${customerName}` : '';
    const products = db.getProducts();

    // =========================================================================
    // 0.35 SOLICITUD DE LINK DE PAGO / MERCADO PAGO
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
    // 0.4 CONFIRMACIÓN DE MÉTODO DE PAGO (Ej: "efectivo", "abono al repartidor", "transferencia")
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
    // 0.5 CONSULTA DE PEDIDO REGISTRADO / RECORDATORIO DE PEDIDO
    // (Ej: "recuerda mi pedido?", "como va mi pedido?", "mi pedido", "que pedi?")
    // =========================================================================
    const isOrderInquiry = /recuerda|recordas|mi pedido|estado|cuando llega|que pedi|tienen mi pedido|pedido registrado/i.test(t);
    if (isOrderInquiry) {
      const existingOrder = db.getLatestOrderByJid(lead.jid || lead.id);
      if (existingOrder) {
        return `¡Hola ${existingOrder.customerName || nameGreeting}! 👋 Sí, acá tengo registrado tu pedido en el sistema:\n\n🆔 *N° de Pedido:* #${existingOrder.id}\n📋 *Detalle:*\n${existingOrder.items.join('\n')}\n💰 *Total:* $${existingOrder.totalAmount.toLocaleString('es-AR')}\n📍 *Entrega:* ${existingOrder.address}\n🚚 *Estado:* Programado para despacho en el día (dentro de las 24 hs).\n\n¿Precisás sumar algún otro corte antes de que salga el repartidor? 🥩`;
      } else if (lead.notes && lead.notes.includes('Dirección:')) {
        const address = lead.notes.replace('Dirección: ', '').split('|')[0].trim();
        return `¡Hola${nameGreeting}! 👋 Sí, tengo agendado tu pedido del Combo Asadazo ($39.999) para entrega en: **${address}**.\n\n¿Querés que te lo confirmemos para despacho ahora mismo? 🥩`;
      }
    }

    // =========================================================================
    // 1. DETECTOR DE DATOS DE ENVÍO / DIRECCIÓN / CONFIRMACIÓN DE PEDIDO
    // (Ej: "quiero un combo asadazo para roque funes 1704, a nombre de Juan Gonzalez, abono al repartidor")
    // =========================================================================
    const hasAddress = /calle|av\.|avenida|barrio|altura|piso|dpto|entre\s|nro|n°|funes|locelso|domicilio|[0-9]{3,5}/i.test(t) || 
                       (rawText.includes(',') && /[0-9]/.test(rawText));
    
    // Obtener historial previo
    const history = db.getMessages(lead.jid || lead.id, 10);
    const historyText = history.map(m => m.content).join(' ').toLowerCase();

    // 1.1 Extracción precisa de Nombre de Persona
    let extractedNameFromText = '';
    
    // a) "a nombre de Juan Gonzalez" o "para Juan Gonzalez" o "nombre: Juan Gonzalez"
    const explicitNameMatch = rawText.match(/(?:a nombre de|nombre:?|para)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:,|$|\.|\babono|\bpago|\ben efectivo|\bpor transferencia)/i);
    if (explicitNameMatch && explicitNameMatch[1].trim().length >= 3) {
      const candidate = explicitNameMatch[1].trim();
      if (!/funes|locelso|duarte|quiros|urca|calle|av|combo|asado|repartidor|efectivo/i.test(candidate)) {
        extractedNameFromText = candidate;
      }
    }

    // b) "Juan Gonzalez mi nombre completo" o "Juan Gonzalez es mi nombre"
    if (!extractedNameFromText) {
      const reverseNameMatch = rawText.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\s+(?:mi nombre(?: completo)?|es mi nombre|mi onmbre)/i);
      if (reverseNameMatch && reverseNameMatch[1].trim().length >= 3) {
        const candidate = reverseNameMatch[1].replace(/^(a|en|para|de)\s+/i, '').trim();
        if (!/funes|locelso|duarte|quiros|urca|calle|av|combo|asado|repartidor|efectivo/i.test(candidate)) {
          extractedNameFromText = candidate;
        }
      }
    }
    
    // c) "mi nombre Juan Gonzalez" o "soy Juan Gonzalez"
    if (!extractedNameFromText) {
      const forwardNameMatch = rawText.match(/(?:mi nombre(?: es| completo)?|mi onmbre|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+)/i);
      if (forwardNameMatch && forwardNameMatch[1].trim().length >= 3) {
        const candidate = forwardNameMatch[1].replace(/^(es|de)\s+/i, '').trim();
        if (!/funes|locelso|duarte|quiros|urca|calle|av|combo|asado|repartidor|efectivo/i.test(candidate)) {
          extractedNameFromText = candidate;
        }
      }
    }

    // d) Si hay comas, revisar si algún fragmento es puramente nombre (ej: "Locelso 7089, Juan Gonzalez")
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

    // 1.2 Limpiar la dirección quitando muletillas
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

    // 1.3 Si el usuario envía SOLO su nombre (ej: "Juan Gonzalez" o "Soy Juan Gonzalez")
    const isJustName = (extractedNameFromText || (t.split(/\s+/).length >= 1 && t.split(/\s+/).length <= 4 && !/[0-9]/.test(t) && !hasAddress && !/hola|buen|que|cuanto|precio|costo|combo|asado|carne|picada|oferta|gracias|ok|si|no|recuerda|recordas|pedido|como|efectivo|transferencia|repartidor|abono|pago/i.test(t)));

    if (isJustName && !hasAddress && t.length >= 3 && t.length <= 45) {
      const finalName = extractedNameFromText || rawText.replace(/^(soy|me llamo|mi nombre es|mi nombre|mi onmbre)\s+/i, '').trim();
      
      if (finalName.length >= 2 && !/efectivo|transferencia|repartidor|funes/i.test(finalName)) {
        // Recuperar dirección previa guardada
        let savedAddress = lead.address || lead.notes?.replace('Dirección: ', '').split('|')[0].trim() || '';
        if (!savedAddress || savedAddress === 'A coordinar') {
          const addressMsg = history.find(m => m.sender === 'user' && /locelso|funes|calle|av|[0-9]{3,5}/i.test(m.content));
          if (addressMsg) {
            savedAddress = addressMsg.content.replace(/a mi domicilio,?\s*/gi, '').trim();
          }
        }
        if (!savedAddress) savedAddress = 'A coordinar con delivery';

        let orderItems = [];
        let totalAmount = 0;
        if (historyText.includes('asadazo') || historyText.includes('combo') || t.includes('combo')) {
          orderItems.push('• 1x Combo “Asadazo” (4 kg cortes parrilleros + Vino de regalo) — $39.999');
          totalAmount += 39999;
        } else {
          orderItems.push('• 1x Combo Asadazo (4 kg cortes parrilleros + Vino de regalo) — $39.999');
          totalAmount += 39999;
        }

        // Crear Pedido Oficial en Base de Datos
        const newOrder = db.createOrder({
          jid: lead.jid || lead.id,
          phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
          customerName: finalName,
          address: savedAddress,
          items: orderItems,
          totalAmount: totalAmount,
          paymentMethod: 'Efectivo al repartidor',
          status: 'pending'
        });

        const formattedTotal = `$${totalAmount.toLocaleString('es-AR')}`;
        db.updateLead(lead.jid || lead.id, { 
          name: finalName, 
          pushName: finalName, 
          address: savedAddress,
          value: totalAmount, 
          stage: 'closed_won',
          notes: `Dirección: ${savedAddress} | Pedido #${newOrder.id}`
        });

        return `¡Perfecto ${finalName}! 🎉 Ya quedó 100% asentado y confirmado tu pedido:\n\n🆔 *N° de Pedido:* #${newOrder.id}\n📋 *RESUMEN DE TU PEDIDO:*\n${orderItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n👤 *Cliente:* ${finalName}\n📍 *Destino de Entrega:* ${savedAddress}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n💳 *Medios de Pago:* Podés abonar en Efectivo al repartidor o por Transferencia al Alias: \`republica.carne.mp\`\n\n¿Te gustaría abonar por transferencia ahora o preferís pagarle en efectivo al repartidor? 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${totalAmount}]]`;
      }
    }

    // 1.4 Si el mensaje contiene Dirección
    if (hasAddress && t.length > 5) {
      // Guardar dirección en notas del lead
      db.updateLead(lead.jid || lead.id, { address: cleanAddress, notes: `Dirección: ${cleanAddress}` });

      // Si se extrajo un nombre válido en este mismo mensaje
      let finalClientName = extractedNameFromText;
      if (!finalClientName && customerName && !customerName.includes('Contacto') && !customerName.startsWith('+') && customerName !== 'Don Juan' && !customerName.includes('recuerda') && !customerName.includes('efectivo') && !customerName.includes('funes')) {
        finalClientName = customerName;
      }

      // Si tenemos el nombre del cliente (ya sea en este mensaje o guardado)
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

        // Crear Pedido Oficial en Base de Datos
        const newOrder = db.createOrder({
          jid: lead.jid || lead.id,
          phone: lead.phone || (lead.jid ? lead.jid.split('@')[0] : ''),
          customerName: finalClientName,
          address: cleanAddress,
          items: orderItems,
          totalAmount: totalAmount,
          paymentMethod: 'Efectivo / Transferencia',
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

        return `¡Excelente ${finalClientName}! 🎉 Ya dejé asentado y confirmado tu pedido:\n\n🆔 *N° de Pedido:* #${newOrder.id}\n📋 *RESUMEN DE TU PEDIDO:*\n${orderItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n👤 *Cliente:* ${finalClientName}\n📍 *Destino de Entrega:* ${cleanAddress}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n💳 *Medios de Pago:* Podés abonar en Efectivo al recibir o por Transferencia a nuestro Alias: \`republica.carne.mp\`\n\n¿Te gustaría abonar por transferencia ahora o preferís pagarle en efectivo al repartidor? 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${totalAmount}]]`;
      }

      // Si NO hay nombre en absoluto
      db.updateLead(lead.jid || lead.id, { stage: 'proposal' });
      return `¡Excelente! Ya registré tu dirección: **${cleanAddress}** para la entrega del pedido 🥩🔥\n\nSolo me faltaría tu **Nombre y Apellido** para colocar en la etiqueta del envío del delivery. ¿A nombre de quién te lo dejamos? 😊 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 2. DETECTOR DE COMBOS Y OFERTAS (Prioridad Alta)
    // (Ej: "como viene el combo", "que trae el combo", "quiero el combo asadazo", "ofertas")
    // =========================================================================
    const isComboQuery = /combo|asadazo|azadado|asadado|azadazo/i.test(t);
    const isComboDetailsQuery = isComboQuery && (/como viene|que trae|que incluye|que tiene|detalle|contenido/i.test(t) || t.includes('?'));

    if (isComboDetailsQuery || (t.includes('como viene') && t.includes('combo'))) {
      return `¡El **Combo “Asadazo”** viene completísimo para la parrilla! 🔥\n\nIncluye **4 kg** de cortes seleccionados:\n🥩 Bocado\n🥩 Aguja parrillera\n🥩 Falda tierna\n🌭 Chorizo puro cerdo\n🌭 Morcilla bombón\n🎁 **De regalo:** 1 Vino Howlmande\n\n💰 **Precio Promo:** **$39.999** (hasta agotar stock).\n\n¿Te gustaría que te lo enviemos a domicilio? Pasame tu dirección y te lo preparamos ahora mismo 🥩 [[STAGE:proposal]]`;
    }

    if (isComboQuery) {
      return `¡De una${nameGreeting}! 🔥 Te anoto el *Combo Asadazo* (4 kg de Bocado, Chorizo, Aguja, Morcilla, Falda + Vino Howlmande de regalo) en promoción a solo **$39.999**.\n\nDecime, ¿te lo enviamos a domicilio o pasás a retirarlo por sucursal? Pasame tu dirección de entrega y nombre completo así te armo el pedido ahora mismo. 🥩 [[STAGE:proposal]]`;
    }

    if (t.includes('oferta') || t.includes('promocion') || t.includes('promo') || t.includes('descuento')) {
      return `¡Tenemos promociones tremendas este mes! 🔥\n\n🥩 *Combo Asadazo (4kg + Vino de regalo):* $39.999\n🥩 *Costeleta de Cerdo (2kg):* $15.000\n🥩 *Molida Intermedia (3kg):* $27.000\n🥩 *Milanesas de Ternera (2kg):* $24.990\n🌭 *Chori Criollo (2kg):* $10.000\n\n¿Cuál de estas promos te gustaría que te preparemos para entrega? 🥩 [[STAGE:negotiating]]`;
    }

    // =========================================================================
    // 3. DETECTOR DE CORTES POR KILO / PEDIDO DIRECTO
    // (Ej: "quiero 1 kilo de carne molida", "dame 2 kilos de costilla")
    // =========================================================================
    const kiloMatch = t.match(/([0-9]+)\s*(?:kilo|kg|quilo|kilos|kgs)/i);
    const kilos = kiloMatch ? parseInt(kiloMatch[1], 10) : 1;

    for (const prod of products) {
      const prodName = prod.name.toLowerCase();
      if (t.includes(prodName) || (prodName.includes('picada') && (t.includes('molida') || t.includes('picada'))) || (prodName.includes('costilla') && t.includes('costilla')) || (prodName.includes('vacio') && t.includes('vacio')) || (prodName.includes('matambre') && t.includes('matambre')) || (prodName.includes('entraña') && t.includes('entraña')) || (prodName.includes('milanesa') && t.includes('milanesa'))) {
        const itemTotal = prod.price * kilos;
        return `¡Excelente elección${nameGreeting}! 🥩 Ya te separo los ${kilos} ${prod.unit || 'kg'} de **${prod.name}** a **$${itemTotal.toLocaleString('es-AR')}** ($${prod.price}/${prod.unit || 'kg'}).\n\nDecime, ¿preferís que te lo enviemos a domicilio o pasás a retirarlo por sucursal? Pasame tu dirección y nombre así coordinamos la entrega. [[STAGE:proposal]]`;
      }
    }

    // =========================================================================
    // 4. CONSULTA DE ASADO / RECOMENDACIÓN
    // =========================================================================
    if (t.includes('asado') || t.includes('parrilla') || t.includes('brasa')) {
      return `¡Un buen asado nunca falla${nameGreeting}! 🔥 Para calcular bien, recomendamos unos 500g de carne por persona. Contamos con:\n• *Combo Asadazo (4 personas + vino):* $39.999\n• *Costilla de Novillito:* $7.800/kg\n• *Vacío Especial:* $8.900/kg\n• *Entraña Fina:* $9.900/kg\n• *Chorizo Criollo:* $4.500/kg\n\n¿Para cuántas personas vas a prender el fuego y te armamos el pedido a medida? 🥩 [[STAGE:qualified]]`;
    }

    // =========================================================================
    // 5. MÉTODOS DE PAGO / ALIAS CBU
    // =========================================================================
    if (t.includes('pago') || t.includes('transferencia') || t.includes('tarjeta') || t.includes('efectivo') || t.includes('pagar') || t.includes('cbu') || t.includes('alias')) {
      return `¡Excelente! Aceptamos Efectivo al recibir el pedido, Transferencias Bancarias, Mercado Pago y Tarjetas de Débito/Crédito.\n\n📱 *Alias de Transferencia:* \`republica.carne.mp\`\n\nSi realizás una transferencia, envianos el comprobante por acá en foto y lo acreditamos al instante. [[STAGE:negotiating]]`;
    }

    // =========================================================================
    // 6. SUCURSALES / UBICACIONES / HORARIOS
    // =========================================================================
    if (t.includes('sucursal') || t.includes('donde') || t.includes('direccion') || t.includes('horario') || t.includes('urca') || t.includes('quiros') || t.includes('villa allende')) {
      return `Contamos con 6 sucursales en Córdoba para atenderte:\n\n1. **Urca Central:** Av. José Roque Funes 1115 (9 a 21 hs)\n2. **Urca 2 - Alto Tejeda:** Av. Menéndez Pidal 3575\n3. **Corteza Mall:** Av. Los Álamos 1015 (9 a 21 hs)\n4. **Duarte Quirós:** Av. Duarte Quirós 5130\n5. **Villa Allende:** Av. Figueroa Alcorta 480\n6. **Country San Isidro:** Av. Padre Luchesse km 2\n\n¡Además hacemos envíos a domicilio en el día! ¿En qué barrio o zona estás así coordinamos tu entrega? 🚚`;
    }

    // =========================================================================
    // 7. CONFIRMACIONES / AFIRMACIONES ("si", "dale", "de una", "bueno")
    // =========================================================================
    if (/^(si|dale|de una|perfecto|ok|bueno|quiero|me interesa|anotame)/i.test(t)) {
      return `¡De diez${nameGreeting}! 🌟 Pasame por favor tu nombre completo y la dirección de entrega (o sucursal de retiro) así te dejo el pedido confirmado y preparado. 🥩 [[STAGE:proposal]]`;
    }

    // =========================================================================
    // 8. SALUDOS
    // =========================================================================
    if (/^(hola|buen|buenas|que tal|saludos|hey|alo)/i.test(t)) {
      return `¡Hola${nameGreeting}! 👋 Carlos por acá, carnicero de República de la Carne. Tenemos los mejores cortes parrilleros, combos de asado y ofertas del día. ¿En qué corte o comida te puedo dar una mano hoy? 🥩`;
    }

    // =========================================================================
    // 9. RESPUESTA ASISTIDA DE VENTA POR DEFECTO
    // =========================================================================
    return `¡Con gusto${nameGreeting}! Tenemos cortes de novillito fresco, picada especial ($5.800/kg), costeletas y nuestro Combo Asadazo ($39.999). Decime qué corte o cuántos kilos te gustaría llevar y te lo preparamos con envío a domicilio. 🥩`;
  }
}
