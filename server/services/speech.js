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
  static async transcribeAudio(audioPath) {
    const settings = db.getSettings();

    try {
      // 1. Intentar con OpenAI Whisper si hay API key válida de OpenAI
      const isValidOpenAiKey = settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-');
      if (isValidOpenAiKey) {
        const openai = new OpenAI({ apiKey: settings.openaiApiKey });
        let fileStreamPath = audioPath;

        // Asegurar que sea mp3 o wav
        if (audioPath.endsWith('.ogg')) {
          fileStreamPath = await AudioConverter.convertOggToMp3(audioPath);
        }

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(fileStreamPath),
          model: 'whisper-1',
          language: 'es'
        });

        if (transcription && transcription.text) {
          return transcription.text.trim();
        }
      }

      // 2. Intentar con Google Gemini Multimodal si hay API key válida de Gemini
      const isValidGeminiKey = settings.geminiApiKey && settings.geminiApiKey.length > 20 && settings.geminiApiKey.startsWith('AIza');
      if (isValidGeminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        let mp3Path = audioPath;
        if (audioPath.endsWith('.ogg')) {
          mp3Path = await AudioConverter.convertOggToMp3(audioPath);
        }

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
            text: 'Transcribe este audio palabra por palabra en español con máxima precisión. Devuelve ÚNICAMENTE el texto transcrito sin explicaciones ni introducciones.'
          }
        ]);

        const text = result.response.text();
        if (text) {
          return text.trim();
        }
      }

      console.warn('No hay API Key configurada para transcripción de audio. Utilizando modo demo.');
      return '[Audio recibido del cliente: Transcripción no disponible, configure su API Key de Gemini u OpenAI en Ajustes]';
    } catch (error) {
      console.error('Error en Speech-to-Text:', error);
      return '[Error procesando nota de voz]';
    }
  }

  /**
   * Convierte texto a audio / nota de voz de WhatsApp (Text-to-Speech)
   * @param {string} text - Texto a sintetizar
   * @param {string} customVoice - Voz opcional
   * @returns {Promise<{ oggPath: string, mp3Path: string, durationSeconds: number }>}
   */
  static async textToSpeech(text, customVoice = null) {
    const settings = db.getSettings();
    let provider = settings.ttsProvider || 'edge';
    let voice = customVoice || settings.aiVoiceModel || 'es-MX-DaliaNeural';

    // Auto-detectar proveedor si la voz específica lo indica
    if (voice.startsWith('es-')) {
      provider = 'edge';
    } else if (['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voice)) {
      provider = 'openai';
    } else if (voice.length >= 20 && !voice.startsWith('es-')) {
      provider = 'elevenlabs';
    }

    const tempRawMp3 = path.join(CONFIG.MEDIA_DIR, `tts_raw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp3`);

    try {
      // 1. ElevenLabs TTS (Ultra-realista, clonación y voces premium)
      if (provider === 'elevenlabs' && settings.elevenlabsApiKey) {
        const voiceId = voice || settings.elevenlabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
        const modelId = settings.elevenlabsModelId || 'eleven_multilingual_v2';

        const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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

        if (elevenRes.ok) {
          const arrayBuffer = await elevenRes.arrayBuffer();
          fs.writeFileSync(tempRawMp3, Buffer.from(arrayBuffer));
        } else {
          const errText = await elevenRes.text();
          console.warn(`⚠️ ElevenLabs error (${elevenRes.status}): ${errText}. Usando Edge Neural como respaldo...`);
          await this.generateEdgeTts(text, 'es-MX-DaliaNeural', tempRawMp3);
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
}
