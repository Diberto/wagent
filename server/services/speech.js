import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { AudioConverter } from './audioConverter.js';
import { db } from './database.js';
import { CONFIG } from '../config/index.js';

export class SpeechService {
  /**
   * Transcribe un archivo de audio a texto (Speech-to-Text)
   * @param {string} audioPath - Ruta al archivo de audio (mp3/wav/ogg)
   * @returns {Promise<string>} Texto transcrito
   */
  /**
   * Limpia emojis, tags internos y símbolos Markdown para que los sintetizadores de voz
   * NO lean los emojis ni caracteres especiales en voz alta.
   * @param {string} text - Texto original
   * @returns {string} Texto limpio fonético para TTS
   */
  static cleanTextForSpeech(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      // 1. Eliminar etiquetas de sistema internas [[STAGE:...]], [[PAYMENT:...]]
      .replace(/\[\[.*?\]\]/g, '')
      // 2. Eliminar URLs
      .replace(/https?:\/\/\S+/g, '')
      // 3. Eliminar caracteres Markdown (*negrita*, _cursiva_, ~tachado~, `codigo`, # titulos, > citas)
      .replace(/[*_~`#>•-]/g, '')
      // 4. Eliminar Emojis y Pictogramas Unicode completos
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Caritas / Emoticonos
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Símbolos y objetos
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transporte y mapas
      .replace(/[\u{1F700}-\u{1F77F}]/gu, '') // Símbolos alquímicos
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, '') // Formas geométricas extendidas
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, '') // Flechas suplementarias
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Símbolos suplementarios (ej: 🤖, 🎙️, 🧠)
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Símbolos de ajedrez y juegos
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Símbolos extendidos-A
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Símbolos varios (ej: 📞, ⚡, ☕, 🌟)
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats (ej: ✨, ❌, ❓)
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Selectores de variación
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '') // Banderas
      .replace(/[\u{200D}\u{200C}]/gu, '')   // Zero-width joiners
      // 5. Normalizar espacios
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Transcribe un archivo de audio a texto (Speech-to-Text)
   * @param {string} audioPath - Ruta al archivo de audio (.ogg o .mp3)
   * @returns {Promise<string>} Texto transcrito
   */
  static async transcribeAudio(audioPath) {
    const settings = db.getSettings();

    try {
      // Asegurar conversión a MP3 si es OGG
      let mp3Path = audioPath;
      if (audioPath.endsWith('.ogg')) {
        mp3Path = await AudioConverter.convertOggToMp3(audioPath);
      }

      // 1. Prioridad: ElevenLabs Scribe Speech-to-Text (Ultra precisión y comprensión de español)
      if (settings.elevenlabsApiKey) {
        try {
          const fileBuffer = fs.readFileSync(mp3Path);
          const formData = new FormData();
          const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
          formData.append('file', blob, 'audio.mp3');
          formData.append('model_id', 'scribe_v1');
          formData.append('language_code', 'es');

          const scribeRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: {
              'xi-api-key': settings.elevenlabsApiKey
            },
            body: formData
          });

          if (scribeRes.ok) {
            const scribeData = await scribeRes.json();
            if (scribeData.text && scribeData.text.trim()) {
              console.log(`🎙️ [ElevenLabs Scribe STT] Audio transcrito con éxito: "${scribeData.text.trim()}"`);
              return scribeData.text.trim();
            }
          } else {
            const errText = await scribeRes.text();
            console.warn(`[ElevenLabs STT] Status ${scribeRes.status}: ${errText}`);
          }
        } catch (elevenErr) {
          console.warn('[ElevenLabs STT] Error conectando:', elevenErr.message);
        }
      }

      // 2. Intentar con OpenAI Whisper si hay API key válida de OpenAI
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      if (isValidOpenAiKey) {
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(mp3Path),
          model: 'whisper-1',
          language: 'es'
        });

        if (transcription && transcription.text) {
          return transcription.text.trim();
        }
      }

      // 2.1 Intentar con Groq Whisper (alta velocidad y precisión)
      const groqKey = settings.groqApiKey || (settings.customApiKey && settings.customApiKey.startsWith('gsk_') ? settings.customApiKey : null);
      if (groqKey) {
        const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(mp3Path),
          model: 'whisper-large-v3',
          language: 'es'
        });

        if (transcription && transcription.text) {
          return transcription.text.trim();
        }
      }

      // 3. Intentar con Google Gemini Multimodal si hay API key válida de Gemini
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      if (isValidGeminiKey) {
        try {
          const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

          const audioBuffer = fs.readFileSync(mp3Path);
          const base64Audio = audioBuffer.toString('base64');

          const result = await model.generateContent([
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: base64Audio
              }
            },
            {
              text: 'Transcribe este audio en español con máxima fidelidad. Devuelve ÚNICAMENTE el texto transcrito sin explicaciones ni comillas adicionales.'
            }
          ]);

          const text = result.response.text();
          if (text) {
            return text.trim();
          }
        } catch (geminiErr) {
          console.warn('Gemini STT error:', geminiErr.message);
        }
      }

      // 4. Si no hay transcripción disponible, devolver aviso descriptivo
      console.log('Nota de voz recibida sin transcripción activa.');
      return '[Nota de voz recibida del cliente]';
    } catch (error) {
      console.warn('Advertencia en transcripción de audio:', error.message);
      return '[Nota de voz recibida del cliente]';
    }
  }

  /**
   * Convierte texto a audio / nota de voz de WhatsApp (Text-to-Speech)
   * @param {string} rawText - Texto a sintetizar
   * @param {string} customVoice - Voz opcional
   * @returns {Promise<{ oggPath: string, mp3Path: string, durationSeconds: number }>}
   */
  static async textToSpeech(rawText, customVoice = null) {
    const text = this.cleanTextForSpeech(rawText);
    if (!text) {
      return { oggPath: null, mp3Path: null, durationSeconds: 0 };
    }

    const settings = db.getSettings();
    let provider = settings.ttsProvider || 'edge';
    let voice = customVoice;

    if (!voice) {
      if (provider === 'elevenlabs') {
        voice = settings.elevenlabsVoiceId || '9rvdnhrYoXoUt4igKpBw';
      } else if (provider === 'openai') {
        voice = 'nova';
      } else {
        voice = settings.aiVoiceModel || 'es-AR-TomasNeural';
      }
    }

    const tempRawMp3 = path.join(CONFIG.MEDIA_DIR, `tts_raw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp3`);

    try {
      // 1. ElevenLabs TTS (Ultra-realista, clonación y voces premium)
      if (provider === 'elevenlabs' && settings.elevenlabsApiKey) {
        let voiceId = voice || settings.elevenlabsVoiceId || '9rvdnhrYoXoUt4igKpBw';
        const modelId = settings.elevenlabsModelId || 'eleven_turbo_v2_5';

        let elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': settings.elevenlabsApiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          })
        });

        // Si la voz de librería es rechazada en cuenta Free (400/402), reintentar con voz estándar oficial (Adam)
        if (!elevenRes.ok && (elevenRes.status === 400 || elevenRes.status === 402)) {
          console.warn(`⚠️ Voz ${voiceId} requiere plan pago en ElevenLabs. Usando voz estándar oficial Adam (pNInz6obpgDQGcFmaJgB)...`);
          voiceId = 'pNInz6obpgDQGcFmaJgB';
          elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
              'xi-api-key': settings.elevenlabsApiKey,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({
              text,
              model_id: modelId,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true
              }
            })
          });
        }

        if (elevenRes.ok) {
          const arrayBuffer = await elevenRes.arrayBuffer();
          fs.writeFileSync(tempRawMp3, Buffer.from(arrayBuffer));
          console.log(`🎙️ [ElevenLabs] Audio sintetizado con éxito (${voiceId})`);
        } else {
          const errText = await elevenRes.text();
          console.warn(`⚠️ ElevenLabs error (${elevenRes.status}): ${errText}. Usando Edge Neural como respaldo...`);
          await this.generateEdgeTts(text, settings.aiVoiceModel || 'es-AR-TomasNeural', tempRawMp3);
        }
      } else if (provider === 'openai' && settings.openaiApiKey) {
        // 2. OpenAI TTS si está configurado
        try {
          const openai = new OpenAI({ apiKey: settings.openaiApiKey });
          const validOpenAiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
          const openAiVoice = validOpenAiVoices.includes(voice) ? voice : 'nova';

          const mp3Response = await openai.audio.speech.create({
            model: 'tts-1',
            voice: openAiVoice,
            input: text
          });

          const buffer = Buffer.from(await mp3Response.arrayBuffer());
          fs.writeFileSync(tempRawMp3, buffer);
        } catch (openaiErr) {
          console.warn(`⚠️ OpenAI TTS error: ${openaiErr.message}. Usando Edge Neural como respaldo...`);
          await this.generateEdgeTts(text, 'es-MX-DaliaNeural', tempRawMp3);
        }
      } else {
        // 3. Microsoft Edge Neural TTS (Gratuito, ultra realista y rápido)
        const edgeVoice = voice.startsWith('es-') ? voice : 'es-MX-DaliaNeural';
        await this.generateEdgeTts(text, edgeVoice, tempRawMp3);
      }

      // Convertir a WhatsApp PTT (.ogg con codec libopus)
      const oggPath = await AudioConverter.convertToWhatsAppPtt(tempRawMp3);

      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.max(2, Math.round(wordCount / 2.5));

      return {
        oggPath,
        mp3Path: tempRawMp3,
        durationSeconds: estimatedDuration
      };
    } catch (error) {
      console.error('Error en Text-to-Speech:', error);
      // Último intento de contingencia garantizado
      try {
        await this.generateEdgeTts(text, 'es-MX-DaliaNeural', tempRawMp3);
        const oggPath = await AudioConverter.convertToWhatsAppPtt(tempRawMp3);
        return {
          oggPath,
          mp3Path: tempRawMp3,
          durationSeconds: 3
        };
      } catch (fallbackError) {
        throw error;
      }
    }
  }

  /**
   * Helper para generar audio con Microsoft Edge Neural TTS
   */
  static async generateEdgeTts(text, voice, targetMp3Path) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const tempDir = path.join(CONFIG.MEDIA_DIR, `tts_tmp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    await tts.toFile(tempDir, text);
    const generatedMp3 = path.join(tempDir, 'audio.mp3');
    
    if (fs.existsSync(generatedMp3)) {
      fs.copyFileSync(generatedMp3, targetMp3Path);
      try {
        fs.unlinkSync(generatedMp3);
        fs.rmdirSync(tempDir);
      } catch (e) {}
    }
  }

  /**
   * Obtiene la lista de voces personalizadas de la cuenta de ElevenLabs
   */
  static async fetchElevenLabsVoices(apiKey) {
    if (!apiKey) return [];
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.voices || []).map(v => ({
        id: v.voice_id,
        name: `${v.name} (${v.labels?.accent || v.category || 'ElevenLabs'})`,
        provider: 'elevenlabs',
        gender: v.labels?.gender || 'neutral',
        previewUrl: v.preview_url
      }));
    } catch (e) {
      console.error('Error obteniendo voces de ElevenLabs:', e);
      return [];
    }
  }

  /**
   * Lista de voces disponibles para el selector del CRM
   */
  static getAvailableVoices() {
    return [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (ElevenLabs - Femenina Cálida / Multilingüe)', provider: 'elevenlabs', gender: 'female' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (ElevenLabs - Femenina Joven y Enérgica)', provider: 'elevenlabs', gender: 'female' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (ElevenLabs - Femenina Suave)', provider: 'elevenlabs', gender: 'female' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (ElevenLabs - Masculina Ejecutiva)', provider: 'elevenlabs', gender: 'male' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (ElevenLabs - Masculina Profunda)', provider: 'elevenlabs', gender: 'male' },
      { id: 'es-MX-DaliaNeural', name: 'Dalia (Edge Neural - México Femenina Comercial)', provider: 'edge', gender: 'female' },
      { id: 'es-MX-JorgeNeural', name: 'Jorge (Edge Neural - México Masculina Profesional)', provider: 'edge', gender: 'male' },
      { id: 'es-ES-ElviraNeural', name: 'Elvira (Edge Neural - España Femenina)', provider: 'edge', gender: 'female' },
      { id: 'es-ES-AlvaroNeural', name: 'Álvaro (Edge Neural - España Masculina)', provider: 'edge', gender: 'male' },
      { id: 'es-CO-GonzaloNeural', name: 'Gonzalo (Edge Neural - Colombia Masculina)', provider: 'edge', gender: 'male' },
      { id: 'es-CO-SalomeNeural', name: 'Salomé (Edge Neural - Colombia Femenina)', provider: 'edge', gender: 'female' },
      { id: 'es-AR-TomasNeural', name: 'Tomás (Edge Neural - Argentina Masculina)', provider: 'edge', gender: 'male' },
      { id: 'es-US-AlonsoNeural', name: 'Alonso (Edge Neural - Neutro Masculina)', provider: 'edge', gender: 'male' },
      { id: 'nova', name: 'Nova (OpenAI - Femenina)', provider: 'openai', gender: 'female' },
      { id: 'alloy', name: 'Alloy (OpenAI - Neutra)', provider: 'openai', gender: 'neutral' },
      { id: 'echo', name: 'Echo (OpenAI - Masculina)', provider: 'openai', gender: 'male' },
      { id: 'shimmer', name: 'Shimmer (OpenAI - Femenina)', provider: 'openai', gender: 'female' }
    ];
  }

  /**
   * Analiza una imagen recibida por WhatsApp (comprobantes de pago, fotos de cortes, listas)
   */
  static async analyzeImageWithAI({ imagePath, caption = '', jid = '' }) {
    const settings = db.getSettings();
    let lead = null;
    if (jid) {
      const leads = db.getLeads();
      lead = leads.find(l => l.jid === jid || (l.altJids && l.altJids.includes(jid)));
    }
    const customerName = lead?.name || 'Cliente';

    // 1. Intentar con Gemini Vision si hay API Key
    const geminiKey = settings.ai?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          const ext = path.extname(imagePath).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

          const prompt = `Sos Carlos, maestro carnicero de "República de la Carne" (Córdoba).
El cliente ${customerName} te envió esta imagen por WhatsApp junto con el texto: "${caption || ''}".
Analizá la imagen:
- Si es un comprobante de transferencia o pago bancario/Mercado Pago, confirmale con entusiasmo que el comprobante fue recibido y que su pedido pasa inmediatamente a corte y despacho.
- Si es una foto de una lista de cortes de carne o asado, transcribile lo que pide y armale el presupuesto.
- Si es una foto de carne o corte, elogiale el corte y asesoralo como experto carnicero cordobés.
Respondé en 2 a 4 líneas cálidas, profesionales y cordobesas.`;

          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType
              }
            }
          ]);

          const text = result.response.text();
          if (text && text.trim()) {
            return { text: text.trim(), isComprobante: text.toLowerCase().includes('comprobante') || text.toLowerCase().includes('transferencia') };
          }
        }
      } catch (err) {
        console.warn('Fallo visión Gemini, usando respuesta inteligente directa:', err.message);
      }
    }

    // 2. Respuesta inteligente de carnicería por defecto para comprobantes e imágenes
    const isLikelyTransfer = caption.toLowerCase().includes('pago') || caption.toLowerCase().includes('transfe') || caption.toLowerCase().includes('comprobante') || true;

    return {
      text: `¡Recibido ${customerName}! 🥩📸 Muchas gracias por enviarme la imagen${caption ? ` (${caption})` : ''}. Si es el comprobante de transferencia, ya queda registrado y pasamos tu pedido directo al sector de corte para preparar el despacho. 🙌`,
      isComprobante: isLikelyTransfer
    };
  }
}
