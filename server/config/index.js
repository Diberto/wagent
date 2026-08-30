import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const AUTH_DIR = path.join(DATA_DIR, 'auth_info_baileys');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export const CONFIG = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ROOT_DIR,
  DATA_DIR,
  MEDIA_DIR,
  AUTH_DIR,
  BACKUPS_DIR,
  
  DEFAULT_SETTINGS: {
    aiProvider: process.env.AI_PROVIDER || 'gemini', // 'gemini' | 'openai' | 'nvidia' | 'custom'
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
    nvidiaModel: process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct',
    customBaseUrl: process.env.CUSTOM_BASE_URL || '',
    customApiKey: process.env.CUSTOM_API_KEY || '',
    customModel: process.env.CUSTOM_MODEL || 'llama3',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    aiModel: process.env.AI_MODEL || 'gemini-1.5-flash',
    aiVoiceModel: process.env.AI_VOICE_MODEL || 'es-MX-DaliaNeural',
    ttsProvider: process.env.TTS_PROVIDER || 'edge', // 'edge' | 'openai' | 'elevenlabs'
    mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-963262173359779-083015-7a288c6669f44248572a6202c5de2fb0-2050924390',
    mercadopagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY || 'APP_USR-f2e52862-ab7d-411d-a43f-3e6c417eff9e',
    mercadopagoAppId: process.env.MERCADOPAGO_APP_ID || '963262173359779',
    mercadopagoUserId: process.env.MERCADOPAGO_USER_ID || '2050924390',
    mercadopagoTestUser: process.env.MERCADOPAGO_TEST_USER || 'TESTUSER1028937958',
    mercadopagoEnabled: true,
    mercadopagoAutoSendLink: true,
    agentName: 'Sara - Asesora Virtual',
    businessName: 'Mi Empresa',
    autoReplyEnabled: true,
    voiceRepliesEnabled: true, // Si el usuario manda audio, responder con audio
    alwaysVoiceReply: false,   // Siempre responder con audio, incluso a texto
    autoCallFollowUp: true,    // Enviar nota de voz automática cuando entra una llamada
    callFollowUpMessage: '¡Hola! He visto que intentaste llamarnos. En este momento todas nuestras líneas están atendiendo clientes, pero soy tu asistente virtual inteligente. ¿En qué puedo ayudarte el día de hoy?',
    
    systemPrompt: `Eres Sara, una asesora comercial y especialista en atención al cliente de alta eficiencia para WhatsApp.
Tu objetivo es brindar una atención cálida, resolver dudas rápidamente y guiar al cliente hacia la compra o cierre comercial de manera cordial y persuasiva.

Directrices principales:
1. Respuestas concisas, humanas y empáticas (máximo 2 a 3 párrafos cortos, ideales para WhatsApp).
2. Usa un tono cercano y profesional con uso moderado de emojis.
3. Si el cliente pregunta por productos o precios, consulta la Base de Conocimiento y responde con precisión.
4. Si el cliente muestra interés claro, ofrece un llamado a la acción claro (ej: agendar llamada, confirmar pedido, método de pago).
5. Si no sabes un dato específico, ofrece derivarlo con un asesor humano amablemente.
6. Nunca inventes información que no esté en la base de conocimiento.`
  },

  DEFAULT_KNOWLEDGE_BASE: [
    {
      id: 'kb-1',
      title: 'Horarios de Atención',
      category: 'Información General',
      content: 'Atendemos de Lunes a Viernes de 8:00 AM a 7:00 PM y Sábados de 9:00 AM a 2:00 PM. Soporte automatizado 24/7.',
      keywords: ['horario', 'atencion', 'abierto', 'hora']
    },
    {
      id: 'kb-2',
      title: 'Métodos de Pago Aceptados',
      category: 'Ventas y Finanzas',
      content: 'Aceptamos Transferencias Bancarias, Tarjetas de Crédito/Débito (Visa, Mastercard, Amex), PayPal, MercadoPago y Efectivo/Contraentrega.',
      keywords: ['pago', 'tarjeta', 'transferencia', 'efectivo', 'metodo de pago', 'mercadopago']
    },
    {
      id: 'kb-3',
      title: 'Envíos y Entregas',
      category: 'Logística',
      content: 'Realizamos envíos a todo el país. Tiempo de entrega estándar de 24 a 48 horas hábiles. Envío gratuito en compras superiores a $50.',
      keywords: ['envio', 'entrega', 'delivery', 'costo de envio', 'paquete', 'tiempo']
    },
    {
      id: 'kb-4',
      title: 'Garantía y Devoluciones',
      category: 'Políticas',
      content: 'Todos nuestros productos cuentan con 30 días de garantía por defectos de fábrica y 7 días para cambios o devoluciones sin costo.',
      keywords: ['garantia', 'devolucion', 'cambio', 'falla']
    }
  ]
};
