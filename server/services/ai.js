import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { SpeechService } from './speech.js';

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
    const history = db.getMessages(jid, 12);
    const knowledgeBase = db.getKnowledgeBase();

    // 1. Contexto de base de conocimiento (RAG) y Catálogo de Productos
    const products = db.getProducts();
    const productCatalogContext = products.map((p, i) => {
      return `• [PRODUCTO #${i + 1}] ${p.name} | Categoría: ${p.category || 'General'} | Precio: $${p.price} por ${p.unit || 'kg'} | Stock: ${p.isAvailable ? 'Disponible' : 'Agotado'} | Detalles: ${p.description || 'Calidad garantizada'}`;
    }).join('\n');

    const kbContext = knowledgeBase.map((item, index) => {
      let entry = `[INFO #${index + 1}] ${item.title} (${item.category}):\n${item.content}`;
      if (item.productPrice) {
        entry += `\nPrecio: $${item.productPrice}`;
      }
      return entry;
    }).join('\n\n');

    // 2. Historial formateado
    const formattedHistory = history.map(msg => {
      const role = msg.sender === 'user' ? 'Cliente' : 'Asesor (Tú)';
      const typeNote = msg.type === 'audio' ? ' [Nota de voz]' : '';
      return `${role}${typeNote}: ${msg.content}`;
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
    // 1. DETECTOR DE DATOS DE ENVÍO / DIRECCIÓN / CONFIRMACIÓN DE PEDIDO
    // (Ej: "Juan Gonzales, calle angel locelso 7100", "av siempre viva 123", "barrio...")
    // =========================================================================
    const hasAddress = /calle|av\.|avenida|barrio|altura|piso|dpto|entre\s|nro|n°|[0-9]{3,5}/i.test(t) || 
                       (rawText.includes(',') && /[0-9]/.test(rawText));
    
    if (hasAddress && t.length > 5) {
      // Extraer posible nombre si viene antes de la coma (ej: "Juan Gonzales, calle...")
      let clientName = customerName;
      if (rawText.includes(',')) {
        const parts = rawText.split(',');
        if (parts[0].trim().length > 3 && !/calle|av/i.test(parts[0])) {
          clientName = parts[0].trim();
          db.updateLead(lead.jid || lead.id, { name: clientName, pushName: clientName });
        }
      }

      // Guardar dirección en notas del lead
      db.updateLead(lead.jid || lead.id, { notes: `Dirección de entrega: ${rawText}` });

      // Buscar en el historial qué productos o combos se hablaron
      const history = db.getMessages(lead.jid || lead.id, 10);
      const historyText = history.map(m => m.content).join(' ').toLowerCase();

      let orderItems = [];
      let totalAmount = 0;

      if (historyText.includes('asadazo') || t.includes('asadazo')) {
        orderItems.push('• 1x Combo “Asadazo” (4 kg cortes parrilleros + Vino de regalo) — $39.999');
        totalAmount += 39999;
      } else if (historyText.includes('combo') || t.includes('combo')) {
        orderItems.push('• 1x Combo Asado Completo (4 Personas) — $24.000');
        totalAmount += 24000;
      }

      if (historyText.includes('molida') || historyText.includes('picada') || t.includes('molida') || t.includes('picada')) {
        orderItems.push('• 1 kg Carne Picada Especial (100% pulpa magra) — $5.800');
        totalAmount += 5800;
      }

      if (historyText.includes('costeleta') || t.includes('costeleta')) {
        orderItems.push('• 2 kg Costeleta de Cerdo en Promoción — $15.000');
        totalAmount += 15000;
      }

      if (historyText.includes('milanesa') || t.includes('milanesa')) {
        orderItems.push('• 2 kg Milanesas de Ternera Rebozadas — $24.990');
        totalAmount += 24990;
      }

      // Si no detectó productos específicos del historial, asignar pedido estándar
      if (orderItems.length === 0) {
        orderItems.push('• 1x Combo Asado Seleccionado — $24.000');
        totalAmount = 24000;
      }

      // Formatear Total
      const formattedTotal = `$${totalAmount.toLocaleString('es-AR')}`;

      // Actualizar CRM Lead a Ganado con el Monto del Trato
      db.updateLead(lead.jid || lead.id, { value: totalAmount, stage: 'closed_won' });

      return `¡Excelente${clientName ? ` ${clientName}` : ''}! 🎉 Ya dejé asentado y confirmado tu pedido:\n\n📋 *RESUMEN DE TU PEDIDO:*\n${orderItems.join('\n')}\n💰 *Total a abonar:* ${formattedTotal}\n\n📍 *Destino de Entrega:* ${rawText.trim()}\n🚚 *Envío:* Programado en el día (dentro de las 24 hs).\n💳 *Medios de Pago:* Podés abonar en Efectivo al recibir o por Transferencia a nuestro Alias: \`republica.carne.mp\`\n\n¿Te gustaría abonar por transferencia ahora o preferís pagarle en efectivo al repartidor? 🥩 [[STAGE:closed_won]] [[PAYMENT_AMOUNT:${totalAmount}]]`;
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
