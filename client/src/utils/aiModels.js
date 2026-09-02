/**
 * Catálogo Canónico de Proveedores y Modelos de Inteligencia Artificial para el Frontend
 * wagent-client
 */

export const SYSTEM_AI_PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '♊',
    badge: 'Tier Gratuito + Oficial',
    color: 'emerald',
    desc: 'Modelos Flash & Pro de Google con visión multimodal, audios y cuota gratuita en aistudio.google.com',
    requiresKey: true,
    keyField: 'geminiApiKey',
    keyPlaceholder: 'AIzaSy...',
    keyHelpUrl: 'https://aistudio.google.com'
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: '🟣',
    badge: 'Claude 3.7 / 3.5',
    color: 'purple',
    desc: 'Modelos Claude 3.7 y 3.5 Sonnet / Haiku con tono humano, empatía y redacción superior',
    requiresKey: true,
    keyField: 'anthropicApiKey',
    keyPlaceholder: 'sk-ant-...',
    keyHelpUrl: 'https://console.anthropic.com'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    icon: '🟢',
    badge: 'GPT-4o / o3-mini',
    color: 'sky',
    desc: 'GPT-4o, GPT-4o Mini y modelos de razonamiento avanzado para atención comercial',
    requiresKey: true,
    keyField: 'openaiApiKey',
    keyPlaceholder: 'sk-proj-...',
    keyHelpUrl: 'https://platform.openai.com'
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    icon: '🚀',
    badge: 'Créditos Gratuitos',
    color: 'green',
    desc: 'Microservicios NVIDIA NIM (Llama 3.3, DeepSeek R1, Nemotron, Mistral) con créditos en build.nvidia.com',
    requiresKey: true,
    keyField: 'nvidiaApiKey',
    keyPlaceholder: 'nvapi-...',
    keyHelpUrl: 'https://build.nvidia.com'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek AI',
    icon: '🔵',
    badge: 'V3 / R1 Reasoner',
    color: 'blue',
    desc: 'Modelos DeepSeek V3 y DeepSeek R1 de alto rendimiento a una fracción del costo',
    requiresKey: true,
    keyField: 'deepseekApiKey',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    icon: '⚡',
    badge: 'Tier Gratuito Ultra LPU',
    color: 'amber',
    desc: 'Procesamiento en chips LPU a 500+ tokens/segundo con cuota gratuita en console.groq.com',
    requiresKey: true,
    keyField: 'groqApiKey',
    keyPlaceholder: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🌐',
    badge: 'Modelos Gratuitos + 100 LLMs',
    color: 'indigo',
    desc: 'Acceso unificado a 100+ modelos incluyendo tiers gratuitos sin tarjeta',
    requiresKey: true,
    keyField: 'openrouterApiKey',
    keyPlaceholder: 'sk-or-...',
    keyHelpUrl: 'https://openrouter.ai'
  },
  {
    id: 'cohere',
    name: 'Cohere',
    icon: '🟤',
    badge: 'Command R+ RAG',
    color: 'orange',
    desc: 'Command R+ y Command R optimizados para empresas, catálogos y atención contextual',
    requiresKey: true,
    keyField: 'cohereApiKey',
    keyPlaceholder: 'co-...',
    keyHelpUrl: 'https://dashboard.cohere.com'
  },
  {
    id: 'local',
    name: 'Servidor Local (Ollama / LM Studio)',
    icon: '🖥️',
    badge: '100% Gratis - Sin API Key',
    color: 'cyan',
    desc: 'Modelos ejecutados en tu propio servidor o PC local sin costo, sin internet y sin límites',
    requiresKey: false,
    keyField: null,
    keyPlaceholder: 'No requerida',
    keyHelpUrl: 'https://ollama.com'
  },
  {
    id: 'custom',
    name: 'Endpoint Custom OpenAI-Compatible',
    icon: '🛠️',
    badge: 'API Personalizada',
    color: 'rose',
    desc: 'Cualquier servidor o proveedor compatible con la API de OpenAI (vLLM, TGI, LocalAI)',
    requiresKey: true,
    keyField: 'customApiKey',
    keyPlaceholder: 'API Key del endpoint',
    keyHelpUrl: null
  }
];

export const SYSTEM_AI_MODELS = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Recomendado', desc: 'Ultra rápido, óptimo para ventas conversacionales y pedidos', isFree: false },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Máxima Inteligencia', desc: 'Máximo razonamiento, comprensión profunda y análisis', isFree: false },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tag: 'Nueva Generación', desc: 'Respuestas ágiles con soporte multimodal', isFree: false },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', tag: 'Baja Latencia', desc: 'Latencia mínima para alto volumen de mensajes', isFree: false },
    { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', tag: 'Contexto 2M', desc: 'Enorme ventana de contexto para catálogos gigantescos', isFree: false },
    { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', tag: 'Estable', desc: 'Modelo clásico de Google de alta disponibilidad', isFree: false }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', tag: 'Última Generación', desc: 'Razonamiento híbrido de última generación y empatía humana máxima', isFree: false },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', tag: 'Recomendado', desc: 'El modelo con mejor redacción, calidez y tono natural del mercado', isFree: false },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tag: 'Ultra Rápido', desc: 'Velocidad relámpago y redacción fluida', isFree: false },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tag: 'Razonamiento Profundo', desc: 'Análisis minucioso y atención ejecutiva de alto nivel', isFree: false }
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tag: 'Recomendado', desc: 'Rápido, económico y de alta precisión para ventas y reservas', isFree: false },
    { id: 'gpt-4o', name: 'GPT-4o', tag: 'Insignia Multimodal', desc: 'Máxima capacidad cognitiva, visión de comprobantes y fotos', isFree: false },
    { id: 'o3-mini', name: 'o3-mini', tag: 'Razonamiento Lógico', desc: 'Especialista en cálculos, precios y promociones compuestas', isFree: false },
    { id: 'o1', name: 'o1', tag: 'Pensamiento Profundo', desc: 'Razonamiento reflexivo para situaciones complejas', isFree: false },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tag: 'Estable', desc: 'Gran ventana de contexto y consistencia comercial', isFree: false },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', tag: 'Económico', desc: 'Modelo básico clásico de OpenAI', isFree: false }
  ],
  nvidia: [
    { id: 'meta/llama-3.3-70b-instruct', name: 'NVIDIA Llama 3.3 70B Instruct', tag: 'Recomendado', desc: 'Potencia de 70B parámetros optimizada por NVIDIA TensorRT-LLM', isFree: false },
    { id: 'deepseek-ai/deepseek-r1', name: 'NVIDIA DeepSeek R1', tag: 'Razonamiento R1', desc: 'DeepSeek R1 alojado en la infraestructura de alta velocidad de NVIDIA', isFree: false },
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B Instruct', tag: 'NVIDIA Nemotron', desc: 'Optimizado específicamente para alineación de diálogo comercial', isFree: false },
    { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', tag: 'Meta AI', desc: 'Gran capacidad de redacción y comprensión en español', isFree: false },
    { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', tag: 'Ultra Rápido', desc: 'Máxima velocidad para respuestas en menos de 500ms', isFree: false },
    { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2', tag: 'Mistral AI', desc: 'Excelente dominio multilingüe y razonamiento fluido', isFree: false },
    { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B Instruct', tag: 'MoE', desc: 'Arquitectura Mixture-of-Experts de alto rendimiento', isFree: false },
    { id: 'nvidia/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision', tag: 'Visión Multimodal', desc: 'Comprensión de imágenes y comprobantes de pago', isFree: false }
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3 Chat', tag: 'Recomendado', desc: 'Conversacional avanzado, inteligente y ultra accesible', isFree: false },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 Reasoner', tag: 'Pensamiento Cadena', desc: 'Razonamiento paso a paso con máxima precisión matemática', isFree: false }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Groq Llama 3.3 70B', tag: 'Recomendado', desc: 'Velocidad de 500+ tokens/segundo con inteligencia de 70B', isFree: false },
    { id: 'llama-3.1-8b-instant', name: 'Groq Llama 3.1 8B Instant', tag: 'Extrema Velocidad', desc: 'La respuesta más rápida del planeta (<200ms)', isFree: false },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', tag: 'Groq LPU', desc: 'Razonamiento R1 acelerado por hardware Groq', isFree: false },
    { id: 'mixtral-8x7b-32768', name: 'Groq Mixtral 8x7B', tag: 'MoE Rápido', desc: 'Gran ventana de contexto y alta fluidez', isFree: false },
    { id: 'gemma2-9b-it', name: 'Groq Gemma 2 9B', tag: 'Google/Groq', desc: 'Modelo compacto de Google acelerado en Groq', isFree: false }
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'OpenRouter Llama 3.3 70B', tag: 'Recomendado', desc: 'Ruteo inteligente con alta disponibilidad', isFree: false },
    { id: 'deepseek/deepseek-r1', name: 'OpenRouter DeepSeek R1', tag: 'Razonamiento', desc: 'R1 completo en OpenRouter', isFree: false },
    { id: 'deepseek/deepseek-chat', name: 'OpenRouter DeepSeek V3', tag: 'Económico', desc: 'V3 accesible para mensajería masiva', isFree: false },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', tag: 'Gratis Sin Tarjeta', desc: 'Nivel gratuito disponible en OpenRouter', isFree: true },
    { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', tag: 'Gratis Sin Tarjeta', desc: 'Modelo gratuito sin costo en OpenRouter', isFree: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'OpenRouter Claude 3.5 Sonnet', tag: 'Claude', desc: 'Acceso a Claude con facturación unificada', isFree: false },
    { id: 'openai/gpt-4o-mini', name: 'OpenRouter GPT-4o Mini', tag: 'OpenAI', desc: 'Acceso a GPT-4o Mini', isFree: false }
  ],
  cohere: [
    { id: 'command-r-plus', name: 'Cohere Command R+', tag: 'Recomendado', desc: 'Diseñado para empresas y recuperación de información precisa', isFree: false },
    { id: 'command-r', name: 'Cohere Command R', tag: 'Ágil', desc: 'Conversación ágil y consultas de catálogo', isFree: false },
    { id: 'command-light', name: 'Cohere Command Light', tag: 'Baja Latencia', desc: 'Ultra liviano para tareas rápidas', isFree: false }
  ],
  local: [
    { id: 'llama3.2', name: 'Ollama - Llama 3.2 (3B / 1B)', tag: 'Local Gratis', desc: 'Ejecutado en tu PC via Ollama (http://localhost:11434)', isFree: true },
    { id: 'deepseek-r1:8b', name: 'Ollama - DeepSeek R1 (8B)', tag: 'Local Razonamiento', desc: 'Razonamiento local privado sin enviar datos a la nube', isFree: true },
    { id: 'mistral', name: 'Ollama - Mistral (7B)', tag: 'Local Gratis', desc: 'Modelo potente y liviano en Ollama', isFree: true },
    { id: 'qwen2.5:7b', name: 'Ollama - Qwen 2.5 (7B)', tag: 'Local Español', desc: 'Excelente español y razonamiento comercial local', isFree: true },
    { id: 'gemma2:9b', name: 'Ollama - Gemma 2 (9B)', tag: 'Local Google', desc: 'Modelo abierto de Google de alto rendimiento', isFree: true },
    { id: 'local-model', name: 'LM Studio / LocalAI', tag: 'Local GUI', desc: 'Conecta con cualquier modelo cargado en LM Studio (http://localhost:1234)', isFree: true }
  ],
  custom: [
    { id: 'custom-model', name: 'Modelo Personalizado (Definido en Agente)', tag: 'Personalizado', desc: 'Utiliza el nombre de modelo y endpoint especificado en el agente', isFree: false }
  ]
};

export const getDefaultModelForProvider = (providerId) => {
  const models = SYSTEM_AI_MODELS[providerId];
  if (!models || models.length === 0) return 'gemini-2.5-flash';
  const rec = models.find(m => m.tag === 'Recomendado');
  return rec ? rec.id : models[0].id;
};
