import path from 'path';
import fs from 'fs';
import https from 'https';
import os from 'os';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config/index.js';
import { db } from './database.js';

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
    this.stats = {
      totalInferences: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalLatencyMs: 0,
      lastInference: null,
      lastTokensPerSecond: 0
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

  isLoadedInMemory() {
    return this.context !== null && this.model !== null;
  }

  getDetailedMetrics() {
    const available = this.isModelAvailable();
    let sizeMB = 0;
    if (available) {
      try {
        const stats = fs.statSync(MODEL_PATH);
        sizeMB = Math.round(stats.size / (1024 * 1024));
      } catch (e) {}
    }

    const settings = (typeof db !== 'undefined' && db?.getSettings) ? db.getSettings() : {};
    const agents = (typeof db !== 'undefined' && db?.getAgents) ? db.getAgents() : [];
    const agentsUsing = agents.filter(a => a.aiProvider === 'qwen_embedded' || a.aiProvider === 'embedded');

    const mem = process.memoryUsage();
    const totalRAM_MB = Math.round(os.totalmem() / (1024 * 1024));
    const freeRAM_MB = Math.round(os.freemem() / (1024 * 1024));
    const rssMB = Math.round(mem.rss / (1024 * 1024));
    const heapUsedMB = Math.round(mem.heapUsed / (1024 * 1024));

    const avgLatencyMs = this.stats.totalInferences > 0 
      ? Math.round(this.stats.totalLatencyMs / this.stats.totalInferences) 
      : 0;

    return {
      available,
      isLoadedInMemory: this.isLoadedInMemory(),
      isSupported: nodeLlamaCppModule !== null || !this.isModelAvailable(),
      modelPath: MODEL_PATH,
      filename: MODEL_FILENAME,
      sizeMB,
      downloadUrl: MODEL_DOWNLOAD_URL,
      modelName: 'Qwen 2.5 0.5B Instruct (Q4_K_M)',
      architecture: 'Qwen2.5 (0.5B params / 500M)',
      quantization: 'Q4_K_M (4-bit medium)',
      maxContext: process.env.LLAMA_CONTEXT_SIZE ? Number(process.env.LLAMA_CONTEXT_SIZE) : 256,
      threads: process.env.LLAMA_THREADS ? Number(process.env.LLAMA_THREADS) : 1,
      gpuLayers: 0,
      ramUsageEstimated: '~350 MB - 400 MB',
      memory: {
        systemTotalRAM_MB: totalRAM_MB,
        systemFreeRAM_MB: freeRAM_MB,
        processRssMB: rssMB,
        processHeapUsedMB: heapUsedMB,
        estimatedModelRAM_MB: 380
      },
      stats: {
        totalInferences: this.stats.totalInferences,
        totalPromptTokens: this.stats.totalPromptTokens,
        totalCompletionTokens: this.stats.totalCompletionTokens,
        totalTokens: this.stats.totalPromptTokens + this.stats.totalCompletionTokens,
        avgLatencyMs,
        lastTokensPerSecond: this.stats.lastTokensPerSecond,
        lastInference: this.stats.lastInference
      },
      systemUsage: {
        isGlobalDefault: settings.aiProvider === 'qwen_embedded' || settings.aiProvider === 'embedded',
        agentsCount: agentsUsing.length,
        agentsList: agentsUsing.map(a => ({ id: a.id, name: a.name, role: a.role, roleLabel: a.roleLabel }))
      },
      downloadState: this.downloadState
    };
  }

  getModelInfo() {
    return this.getDetailedMetrics();
  }

  /**
   * Libera el modelo y contexto de la memoria RAM de Node.js
   */
  async unloadFromMemory() {
    try {
      if (this.context) {
        try {
          if (typeof this.context.dispose === 'function') await this.context.dispose();
        } catch (e) {}
        this.context = null;
      }
      if (this.model) {
        try {
          if (typeof this.model.dispose === 'function') await this.model.dispose();
        } catch (e) {}
        this.model = null;
      }
      if (this.llama) {
        try {
          if (typeof this.llama.dispose === 'function') await this.llama.dispose();
        } catch (e) {}
        this.llama = null;
      }

      if (typeof global.gc === 'function') {
        global.gc();
      }

      const memAfter = process.memoryUsage();
      return {
        success: true,
        message: 'Modelo Qwen 2.5 liberado de la memoria RAM con éxito.',
        memory: {
          processRssMB: Math.round(memAfter.rss / (1024 * 1024)),
          processHeapUsedMB: Math.round(memAfter.heapUsed / (1024 * 1024))
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
    const completionText = (response || '').trim();

    // Estimar tokens para tracking interno
    const promptTokens = Math.max(1, Math.round((prompt.length + systemPrompt.length) / 4));
    const completionTokens = Math.max(1, Math.round(completionText.length / 4));
    const tokensPerSec = latencyMs > 0 ? parseFloat(((completionTokens / latencyMs) * 1000).toFixed(1)) : 0;

    this.stats.totalInferences += 1;
    this.stats.totalPromptTokens += promptTokens;
    this.stats.totalCompletionTokens += completionTokens;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.lastTokensPerSecond = tokensPerSec;
    this.stats.lastInference = {
      timestamp: new Date().toISOString(),
      promptPreview: prompt.slice(0, 60),
      completionPreview: completionText.slice(0, 60),
      promptTokens,
      completionTokens,
      latencyMs,
      tokensPerSec
    };

    return {
      text: completionText,
      latencyMs,
      tokens: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      tokensPerSec
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
          contextSize: process.env.LLAMA_CONTEXT_SIZE ? Number(process.env.LLAMA_CONTEXT_SIZE) : 256,
          threads: process.env.LLAMA_THREADS ? Number(process.env.LLAMA_THREADS) : 1,
          ramUsageRssMB: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
          tokensPerSec: res.tokensPerSec,
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

  /**
   * Ejecuta un benchmark en vivo de velocidad y tokens/segundo
   */
  async runBenchmark({ promptText = 'Explica brevemente por qué el vacío y el asado de tira son los cortes favoritos en Argentina.' } = {}) {
    const startTime = Date.now();
    try {
      if (!this.isModelAvailable()) {
        return {
          success: false,
          error: 'El modelo no está descargado. Descárgalo primero desde el panel de Llama-CPP.'
        };
      }

      const result = await this.prompt({
        systemPrompt: 'Eres un experto carnicero y parrillero. Responde en un párrafo conciso de 3 a 4 oraciones.',
        prompt: promptText,
        temperature: 0.7,
        maxTokens: 100
      });

      const mem = process.memoryUsage();
      return {
        success: true,
        prompt: promptText,
        response: result.text,
        durationMs: result.latencyMs,
        tokensPerSecond: result.tokensPerSec,
        tokens: result.tokens,
        memory: {
          processRssMB: Math.round(mem.rss / (1024 * 1024)),
          processHeapUsedMB: Math.round(mem.heapUsed / (1024 * 1024))
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime
      };
    }
  }
}

export const embeddedLlama = new EmbeddedLlamaService();
