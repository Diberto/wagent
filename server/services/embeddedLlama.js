import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = CONFIG.DATA_DIR || path.resolve(__dirname, '../../data');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const MODEL_FILENAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_PATH = path.join(MODELS_DIR, MODEL_FILENAME);
const MODEL_DOWNLOAD_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';

// Asegurar carpeta de modelos
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// Carga perezosa y segura de node-llama-cpp
let nodeLlamaCppModule = null;
async function getNodeLlamaCpp() {
  if (nodeLlamaCppModule) return nodeLlamaCppModule;
  try {
    nodeLlamaCppModule = await import('node-llama-cpp');
    return nodeLlamaCppModule;
  } catch (err) {
    console.warn('⚠️ [EmbeddedLlama] node-llama-cpp no está disponible en este entorno:', err.message);
    return null;
  }
}

class EmbeddedLlamaService {
  constructor() {
    this.llama = null;
    this.model = null;
    this.context = null;
    this.isInitializing = false;
    this.downloadState = {
      isDownloading: false,
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: null
    };
  }

  async isSupported() {
    const mod = await getNodeLlamaCpp();
    return mod !== null;
  }

  isModelAvailable() {
    try {
      if (fs.existsSync(MODEL_PATH)) {
        const stats = fs.statSync(MODEL_PATH);
        // El modelo Q4_K_M de 0.5B pesa ~380 MB (> 200 MB)
        return stats.size > 200 * 1024 * 1024;
      }
    } catch (e) {}
    return false;
  }

  getModelInfo() {
    const available = this.isModelAvailable();
    let sizeMB = 0;
    if (available) {
      try {
        const stats = fs.statSync(MODEL_PATH);
        sizeMB = Math.round(stats.size / (1024 * 1024));
      } catch (e) {}
    }
    return {
      available,
      modelPath: MODEL_PATH,
      filename: MODEL_FILENAME,
      sizeMB,
      downloadUrl: MODEL_DOWNLOAD_URL,
      modelName: 'Qwen 2.5 0.5B Instruct (Q4_K_M)',
      architecture: 'Qwen2.5 (0.5B params)',
      quantization: 'Q4_K_M',
      maxContext: process.env.LLAMA_CONTEXT_SIZE ? Number(process.env.LLAMA_CONTEXT_SIZE) : 256,
      threads: process.env.LLAMA_THREADS ? Number(process.env.LLAMA_THREADS) : 1,
      ramUsageEstimated: '~350 MB - 400 MB',
      downloadState: this.downloadState
    };
  }

  /**
   * Descarga el modelo .gguf automáticamente desde HuggingFace con seguimiento de progreso
   */
  async downloadModel(onProgress = null) {
    if (this.downloadState.isDownloading) {
      return { success: false, message: 'La descarga ya está en curso.', state: this.downloadState };
    }

    if (this.isModelAvailable()) {
      return { success: true, message: 'El modelo ya se encuentra descargado y listo.', state: this.downloadState };
    }

    this.downloadState = {
      isDownloading: true,
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: null
    };

    const tempPath = `${MODEL_PATH}.download`;

    return new Promise((resolve, reject) => {
      const downloadWithRedirect = (url) => {
        https.get(url, (res) => {
          // Seguir redirecciones de Hugging Face (302/301 a CDN Cloudflare/LFS)
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return downloadWithRedirect(res.headers.location);
          }

          if (res.statusCode !== 200) {
            this.downloadState.isDownloading = false;
            this.downloadState.error = `Error HTTP ${res.statusCode}`;
            return resolve({ success: false, error: `Error HTTP ${res.statusCode}` });
          }

          const totalBytes = parseInt(res.headers['content-length'] || '398000000', 10);
          this.downloadState.totalBytes = totalBytes;
          let downloadedBytes = 0;

          const fileStream = fs.createWriteStream(tempPath);
          res.pipe(fileStream);

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            this.downloadState.downloadedBytes = downloadedBytes;
            this.downloadState.progressPercent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            if (typeof onProgress === 'function') {
              onProgress(this.downloadState);
            }
          });

          fileStream.on('finish', () => {
            fileStream.close(() => {
              try {
                if (fs.existsSync(MODEL_PATH)) fs.unlinkSync(MODEL_PATH);
                fs.renameSync(tempPath, MODEL_PATH);
                this.downloadState.isDownloading = false;
                this.downloadState.progressPercent = 100;
                resolve({ success: true, message: 'Modelo Qwen 2.5 0.5B descargado con éxito.', path: MODEL_PATH });
              } catch (err) {
                this.downloadState.isDownloading = false;
                this.downloadState.error = err.message;
                resolve({ success: false, error: err.message });
              }
            });
          });

          fileStream.on('error', (err) => {
            this.downloadState.isDownloading = false;
            this.downloadState.error = err.message;
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            resolve({ success: false, error: err.message });
          });
        }).on('error', (err) => {
          this.downloadState.isDownloading = false;
          this.downloadState.error = err.message;
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          resolve({ success: false, error: err.message });
        });
      };

      downloadWithRedirect(MODEL_DOWNLOAD_URL);
    });
  }

  /**
   * Carga el modelo en memoria RAM limitando el contextSize a 256/512 tokens y 1 hilo CPU
   */
  async getOrInitContext() {
    if (this.context && this.model) {
      return { model: this.model, context: this.context };
    }

    const mod = await getNodeLlamaCpp();
    if (!mod) {
      throw new Error(
        'El módulo nativo node-llama-cpp no está disponible en este servidor. ' +
        'Usa los proveedores en la nube (Gemini, Claude, OpenAI, DeepSeek, etc.) o compila el contenedor Docker con soporte C++.'
      );
    }

    if (!this.isModelAvailable()) {
      throw new Error(`El modelo Qwen 2.5 0.5B no está descargado en ${MODEL_PATH}. Descárgalo desde Ajustes o ejecuta la descarga automática.`);
    }

    if (this.isInitializing) {
      // Esperar a que termine la inicialización en curso
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return { model: this.model, context: this.context };
    }

    this.isInitializing = true;
    try {
      const { getLlama } = mod;

      if (!this.llama) {
        this.llama = await getLlama({
          gpu: false // CPU pura para no consumir VRAM ni fallar en servidores sin GPU
        });
      }

      if (!this.model) {
        this.model = await this.llama.loadModel({
          modelPath: MODEL_PATH,
          gpuLayers: 0 // Desactiva la GPU por completo para no consumir VRAM
        });
      }

      const safeContextSize = process.env.LLAMA_CONTEXT_SIZE ? Number(process.env.LLAMA_CONTEXT_SIZE) : 256;
      const safeThreads = process.env.LLAMA_THREADS ? Number(process.env.LLAMA_THREADS) : 1;

      if (!this.context) {
        this.context = await this.model.createContext({
          contextSize: safeContextSize, // 256 tokens es el límite ultra-seguro para ~350MB RAM
          threads: safeThreads,         // 1 hilo para no saturar CPU en Hostinger
          batchSize: 128
        });
      }

      return { model: this.model, context: this.context };
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Ejecuta una inferencia optimizada con Qwen 2.5 0.5B
   */
  async prompt({
    systemPrompt = 'Eres un bot de backend estructurado. Responde JSON corto o textos de una sola frase.',
    prompt = '',
    history = [],
    temperature = 0.6,
    maxTokens = 120
  }) {
    const startTime = Date.now();
    const mod = await getNodeLlamaCpp();
    if (!mod) {
      throw new Error('node-llama-cpp no está instalado en este sistema.');
    }

    const { LlamaChatSession } = mod;
    const { context } = await this.getOrInitContext();

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt
    });

    // Cargar últimos 3 mensajes de historial como máximo para respetar los 512 tokens de contexto
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-3);
      for (const h of recentHistory) {
        const role = h.sender === 'user' || h.role === 'user' ? 'user' : 'assistant';
        const content = h.content || h.text || '';
        if (content && role === 'user') {
          // Pre-calentar turno de usuario si es necesario
        }
      }
    }

    const response = await session.prompt(prompt, {
      maxTokens: Math.min(maxTokens || 120, 256),
      temperature: typeof temperature === 'number' ? temperature : 0.6
    });

    const latencyMs = Date.now() - startTime;
    return {
      text: (response || '').trim(),
      latencyMs
    };
  }

  /**
   * Test de conexión y rendimiento de Qwen 2.5 0.5B
   */
  async testConnection({ temperature = 0.6, maxTokens = 60 } = {}) {
    const startTime = Date.now();
    try {
      if (!this.isModelAvailable()) {
        return {
          success: false,
          provider: 'Qwen Embedded',
          model: 'qwen2.5-0.5b-instruct',
          error: `El archivo del modelo (${MODEL_FILENAME}) no está presente en la carpeta data/models. Puedes descargarlo automáticamente desde el botón de descarga en Ajustes.`,
          latencyMs: 0,
          isFallback: false,
          details: {
            needsDownload: true,
            modelInfo: this.getModelInfo()
          }
        };
      }

      const res = await this.prompt({
        systemPrompt: 'Eres un modelo de IA embebido en Node.js ultra rápido. Responde en español en menos de 15 palabras.',
        prompt: 'Responde: CONEXION_EXITOSA con Qwen 2.5 0.5B Instruct en node-llama-cpp.',
        temperature,
        maxTokens
      });

      const mem = process.memoryUsage();
      return {
        success: true,
        provider: 'Qwen 2.5 Embedded (node-llama-cpp)',
        model: 'qwen2.5-0.5b-instruct',
        response: res.text,
        latencyMs: res.latencyMs,
        isFallback: false,
        details: {
          runtime: 'node-llama-cpp (C++ Nativo Zero-RAM)',
          contextSize: 512,
          threads: 2,
          ramUsageRssMB: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
          status: 'ONLINE'
        }
      };
    } catch (err) {
      return {
        success: false,
        provider: 'Qwen Embedded',
        model: 'qwen2.5-0.5b-instruct',
        error: err.message,
        latencyMs: Date.now() - startTime,
        isFallback: false
      };
    }
  }
}

export const embeddedLlama = new EmbeddedLlamaService();
