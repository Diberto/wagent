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

INSTRUCCIONES CLAVE DE FORMATO Y ESTILO:
- Responde de forma cálida, humana, conversacional y persuasiva (hablando en primera persona con la personalidad asignada).
- Máximo 1 o 2 párrafos cortos (ideal para WhatsApp).
- Utiliza la información del Catálogo de Productos para dar precios exactos, recomendar cortes/artículos y armar pedidos según lo que el cliente busque.
- Si el cliente pregunta qué cortes llevar para un asado o comida, asesóralo con cantidades por persona (aprox 500g de carne por persona para asado) y sugiere combos o cortes rendidores.
- Si detectas que la etapa del cliente cambió claramente (ej. pidió cotización -> 'proposal', confirmó compra/pago -> 'closed_won', desinterés -> 'closed_lost'), incluye al final de tu mensaje: [[STAGE:nuevo_estado]] (opciones: new_lead, qualified, negotiating, proposal, closed_won, closed_lost).`;

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
    const customerName = lead.pushName || lead.name || '';
    const nameGreeting = customerName && !customerName.includes('Contacto') ? ` ${customerName}` : '';

    // 0. Nota de voz recibida
    if (t.includes('nota de voz recibida') || t.includes('audio recibido')) {
      return `¡Hola${nameGreeting}! He recibido tu nota de voz con éxito. Estoy a tu entera disposición para resolver tus dudas sobre nuestros productos, precios, envíos o formas de pago. ¿En qué podemos ayudarte el día de hoy?`;
    }

    // 1. Saludos
    if (/^(hola|buen|buenas|que tal|saludos|hey|alo)/i.test(t)) {
      return `¡Hola${nameGreeting}! 👋 Un gusto saludarte. Soy la asesora virtual de ${settings.businessName || 'nuestra empresa'}. ¿En qué producto o servicio te podemos ayudar hoy?`;
    }

    // 2. Búsqueda directa en Catálogo de Productos
    const products = db.getProducts();
    for (const prod of products) {
      if (t.includes(prod.name.toLowerCase()) || (prod.category && t.includes(prod.category.toLowerCase()))) {
        return `¡Excelente elección! Tenemos ${prod.name} (${prod.category}) a $${prod.price} por ${prod.unit || 'kg'}. ${prod.description || 'De primera calidad y súper tierno.'}\n\n¿Cuántos ${prod.unit || 'kilos'} te gustaría encargar o para cuántas personas vas a cocinar? 🥩`;
      }
    }

    // 2.1 Asado específico
    if (t.includes('asado') || t.includes('parrilla') || t.includes('brasa')) {
      return `¡Un buen asado nunca falla! 🔥 Para calcular bien, recomendamos unos 500g de carne por persona. Contamos con Costilla ($7.800/kg), Vacío ($8.900/kg), Entraña ($9.900/kg) y Chorizo criollo ($4.500/kg).\n\n¿Para cuántas personas sería el asado y te armamos el pedido a medida? 🥩`;
    }

    // 2.2 Búsqueda en Base de Conocimientos (Horarios, Envíos, Pagos)
    for (const item of knowledgeBase) {
      const match = (item.keywords || []).some(k => t.includes(k.toLowerCase())) ||
                    t.includes(item.title.toLowerCase()) ||
                    (item.content && item.content.toLowerCase().includes(t));
      if (match) {
        let reply = `${item.content}`;
        if (item.productPrice) {
          reply += `\n💰 *Precio:* $${item.productPrice}`;
        }
        reply += `\n\n¿Te gustaría realizar tu pedido o necesitas más detalles? 😊`;
        return reply;
      }
    }

    // 3. Consultas de catálogo general ("qué productos tienen", "qué venden", "catálogo", "lista")
    if (t.includes('producto') || t.includes('venden') || t.includes('catalogo') || t.includes('ofrecen') || t.includes('tienen') || t.includes('servicio') || t.includes('precio') || t.includes('cuanto') || t.includes('carne') || t.includes('corte')) {
      const productItems = products.length > 0
        ? products.slice(0, 6).map(p => `• *${p.name}*: $${p.price}/${p.unit || 'kg'}`).join('\n')
        : knowledgeBase.map(k => `• *${k.title}*: ${k.content.substring(0, 75)}...`).join('\n');
      
      return `¡Con gusto! Contamos con los mejores cortes y productos frescos:\n\n${productItems}\n\n¿Cuál de estos te gustaría llevar hoy? Podés pedirnos por kilo o indicarnos para cuántas personas es la comida. 🥩`;
    }

    // 4. Métodos de Pago
    if (t.includes('pago') || t.includes('transferencia') || t.includes('tarjeta') || t.includes('efectivo') || t.includes('pagar') || t.includes('cbu') || t.includes('alias')) {
      return `¡Excelente! Aceptamos Transferencias Bancarias, Tarjetas de Crédito/Débito y Efectivo. Si realizas una transferencia, puedes enviarnos el comprobante por aquí en foto y lo confirmaremos de inmediato. [[STAGE:negotiating]]`;
    }

    // 5. Solicitud de llamada o atención humana
    if (t.includes('llamar') || t.includes('llames') || t.includes('llamada') || t.includes('humano') || t.includes('asesor') || t.includes('telefono')) {
      return `¡Por supuesto! He registrado tu solicitud para que uno de nuestros asesores comerciales se comunique contigo a la brevedad. También puedes llamarnos directamente por este mismo WhatsApp cuando gustes. 📞 [[STAGE:qualified]]`;
    }

    // 6. Afirmaciones ("si", "dale", "de acuerdo", "quiero")
    if (/^(si|dale|de una|perfecto|ok|bueno|quiero|me interesa)/i.test(t)) {
      return `¡Excelente decisión! 🌟 Por favor indícanos tus datos de envío o nombre completo para preparar tu pedido y confirmarte el total a abonar. [[STAGE:proposal]]`;
    }

    // 7. Respuesta por defecto enriquecida
    return `He registrado tu mensaje: "${text}". ¿Deseas consultar sobre alguno de nuestros productos, formas de pago, envíos o prefieres que un asesor te asista personalmente? 😊`;
  }
}
