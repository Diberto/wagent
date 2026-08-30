import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
    const history = db.getMessages(jid, 10);
    const knowledgeBase = db.getKnowledgeBase();

    // 1. Construir contexto de base de conocimiento (RAG ligero)
    const kbContext = knowledgeBase.map((item, index) => {
      let entry = `[KB-${index + 1}] ${item.title} (${item.category}):\n${item.content}`;
      if (item.productPrice) {
        entry += `\nPrecio: $${item.productPrice}`;
      }
      return entry;
    }).join('\n\n');

    // 2. Construir historial de mensajes
    const formattedHistory = history.map(msg => {
      const role = msg.sender === 'user' ? 'Cliente' : 'Asesor (Tú)';
      const typeNote = msg.type === 'audio' ? ' [Nota de voz]' : '';
      return `${role}${typeNote}: ${msg.content}`;
    }).join('\n');

    // 3. Prompt de sistema enriquecido
    const systemInstruction = `${settings.systemPrompt}

DATOS DEL CLIENTE:
- Nombre / Perfil: ${lead.pushName || lead.name || 'Cliente'}
- Número: ${lead.phone || jid.split('@')[0]}
- Etapa en CRM: ${lead.stage || 'Nuevo Lead'}
- Notas previas: ${lead.notes || 'Sin notas'}

BASE DE CONOCIMIENTOS DE LA EMPRESA:
${kbContext || 'No hay artículos específicos cargados en la base de conocimientos.'}

INSTRUCCIONES CLAVE DE FORMATO Y ESTILO:
- Responde de forma cordial, conversacional y directa.
- Máximo 1 o 2 párrafos cortos (ideal para lectura rápida en WhatsApp).
- Utiliza la información de la base de conocimientos para responder con exactitud sobre precios, horarios, envíos y políticas.
- Si el cliente pregunta algo fuera de catálogo o complejo, sé honesto y ofrece conectarlo con un asesor humano.
- Al final de tu respuesta, si detectas que la etapa del cliente cambió claramente (ej. pidió cotización -> 'proposal', confirmó compra -> 'closed_won', desinterés total -> 'closed_lost'), incluye al final de tu mensaje en una línea separada: [[STAGE:nuevo_estado]] (opciones válidas: new_lead, qualified, negotiating, proposal, closed_won, closed_lost).`;

    let replyText = '';

    try {
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');

      if (settings.aiProvider === 'gemini' && isValidGeminiKey) {
        // --- GOOGLE GEMINI ---
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const modelName = settings.aiModel || 'gemini-2.0-flash';
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const prompt = `HISTORIAL DE LA CONVERSACIÓN:\n${formattedHistory}\n\nÚLTIMO MENSAJE DEL CLIENTE: "${incomingText}"\n\nTu respuesta como Asesor:`;
        const result = await model.generateContent(prompt);
        replyText = result.response.text();
      } else if (settings.aiProvider === 'openai' && settings.openaiApiKey) {
        // --- OPENAI ---
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const messages = [
          { role: 'system', content: systemInstruction }
        ];

        // Añadir historial reciente
        history.forEach(m => {
          messages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
          });
        });

        // Asegurar que el mensaje entrante actual esté incluido
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
        // --- MODO DEMO ASISTENTE INTELIGENTE (Sin API Keys configuradas) ---
        replyText = AIService.generateDemoReply(incomingText, lead, knowledgeBase);
      }
    } catch (error) {
      console.error('Error generando respuesta con IA:', error);
      replyText = AIService.generateDemoReply(incomingText, lead, knowledgeBase);
    }

    // 4. Extraer posibles cambios de etapa [[STAGE:x]]
    let suggestedStage = null;
    const stageMatch = replyText.match(/\[\[STAGE:([a-z_]+)\]\]/i);
    if (stageMatch) {
      suggestedStage = stageMatch[1].toLowerCase();
      replyText = replyText.replace(/\[\[STAGE:[a-z_]+\]\]/gi, '').trim();
      
      // Actualizar etapa en DB si es válida
      const validStages = ['new_lead', 'qualified', 'negotiating', 'proposal', 'closed_won', 'closed_lost'];
      if (validStages.includes(suggestedStage)) {
        db.updateLeadStage(jid, suggestedStage);
      }
    }

    // 5. Decidir si generar respuesta en Audio (Voz)
    const shouldSendAudio = settings.alwaysVoiceReply || (settings.voiceRepliesEnabled && isAudioInput);
    let audioResult = null;

    if (shouldSendAudio) {
      try {
        audioResult = await SpeechService.textToSpeech(replyText);
      } catch (err) {
        console.error('No se pudo sintetizar audio para la respuesta:', err);
      }
    }

    return {
      text: replyText,
      audioPath: audioResult?.oggPath || null,
      audioMp3Path: audioResult?.mp3Path || null,
      audioDuration: audioResult?.durationSeconds || 0,
      shouldSendAudio,
      suggestedStage
    };
  }

  /**
   * Generador de respuestas heurísticas en modo demostración sin API Keys
   */
  static generateDemoReply(text, lead, knowledgeBase) {
    const lower = text.toLowerCase();

    if (lower.includes('hola') || lower.includes('buenos') || lower.includes('buenas') || lower.includes('saludos')) {
      return `¡Hola ${lead.pushName || lead.name || ''}! 👋 Un placer saludarte. Soy la asesora virtual de ventas y atención al cliente. ¿En qué producto o servicio te puedo ayudar hoy?`;
    }
    if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto') || lower.includes('plan') || lower.includes('tarifa')) {
      const paymentKb = knowledgeBase.find(k => k.keywords?.some(kw => lower.includes(kw)));
      if (paymentKb) {
        return `Con mucho gusto te comento: ${paymentKb.content} 🚀\n¿Te gustaría que te preparemos una propuesta personalizada o tienes alguna duda adicional? [[STAGE:negotiating]]`;
      }
      return `Tenemos excelentes planes y promociones vigentes adaptadas a lo que necesitas. 💼 ¿Te gustaría que te envíe los detalles de nuestros paquetes y facilidades de pago? [[STAGE:negotiating]]`;
    }
    if (lower.includes('horario') || lower.includes('hora') || lower.includes('abierto')) {
      const schedule = knowledgeBase.find(k => k.id === 'kb-1');
      return `${schedule ? schedule.content : 'Atendemos de Lunes a Viernes de 8:00 AM a 7:00 PM.'} Además, nuestro agente de WhatsApp está disponible 24/7 para asistirte. 😊`;
    }
    if (lower.includes('audio') || lower.includes('voz') || lower.includes('llamada') || lower.includes('hablar')) {
      return `¡Por supuesto! Nuestro sistema cuenta con soporte completo para notas de voz y llamadas automatizadas con Inteligencia Artificial. Puedes enviarme mensajes de audio en cualquier momento y te responderé con la misma fluidez. 🎙️✨`;
    }
    if (lower.includes('comprar') || lower.includes('quiero') || lower.includes('adquirir') || lower.includes('contratar') || lower.includes('pago')) {
      return `¡Excelente decisión! 🌟 Podemos procesar tu pedido inmediatamente con Transferencia, Tarjeta o PayPal. ¿A qué nombre preparamos tu orden para confirmarla? [[STAGE:proposal]]`;
    }

    return `Entendido. He registrado tu consulta y estoy aquí para resolver cualquier duda sobre nuestros productos, soporte técnico o ventas. ¿Deseas que profundicemos en algún detalle o prefieres que un asesor de nuestro equipo te llame? 😊`;
  }
}
