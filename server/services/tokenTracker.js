import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = CONFIG.DATA_DIR || path.resolve(__dirname, '../../data');
const TOKEN_USAGE_FILE = path.join(DATA_DIR, 'token_usage.json');

class TokenTrackerService {
  constructor() {
    this.stats = {
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      byProvider: {},
      byModel: {},
      recentLogs: []
    };
    this.loadStats();
  }

  loadStats() {
    try {
      if (fs.existsSync(TOKEN_USAGE_FILE)) {
        const raw = fs.readFileSync(TOKEN_USAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.stats = {
            totalTokens: parsed.totalTokens || 0,
            totalPromptTokens: parsed.totalPromptTokens || 0,
            totalCompletionTokens: parsed.totalCompletionTokens || 0,
            totalRequests: parsed.totalRequests || 0,
            byProvider: parsed.byProvider || {},
            byModel: parsed.byModel || {},
            recentLogs: Array.isArray(parsed.recentLogs) ? parsed.recentLogs : []
          };
        }
      }
    } catch (err) {
      console.warn('⚠️ [TokenTracker] Error leyendo token_usage.json:', err.message);
    }
  }

  saveStats() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(TOKEN_USAGE_FILE, JSON.stringify(this.stats, null, 2), 'utf-8');
    } catch (err) {
      console.warn('⚠️ [TokenTracker] Error guardando token_usage.json:', err.message);
    }
  }

  /**
   * Estima los tokens de un texto si la API externa no provee el conteo exacto de usage.
   * Regla estándar LLM: ~4 caracteres por token en español/inglés.
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Registra un consumo de tokens de una inferencia
   */
  recordUsage({
    provider = 'unknown',
    model = 'default',
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    promptText = '',
    completionText = '',
    latencyMs = 0,
    caller = 'whatsapp' // 'whatsapp' | 'simulator' | 'agent_test' | 'god_mode' | 'embedded'
  }) {
    // Si no vienen tokens explícitos de la API, estimarlos
    let pTokens = Number(promptTokens) || (promptText ? this.estimateTokens(promptText) : 0);
    let cTokens = Number(completionTokens) || (completionText ? this.estimateTokens(completionText) : 0);
    let tTokens = Number(totalTokens) || (pTokens + cTokens);
    if (tTokens === 0) tTokens = pTokens + cTokens;

    this.stats.totalTokens += tTokens;
    this.stats.totalPromptTokens += pTokens;
    this.stats.totalCompletionTokens += cTokens;
    this.stats.totalRequests += 1;

    // Métricas por Proveedor
    const provKey = String(provider).toLowerCase();
    if (!this.stats.byProvider[provKey]) {
      this.stats.byProvider[provKey] = {
        name: provider,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0
      };
    }
    const provStat = this.stats.byProvider[provKey];
    provStat.totalTokens += tTokens;
    provStat.promptTokens += pTokens;
    provStat.completionTokens += cTokens;
    provStat.requests += 1;
    provStat.totalLatencyMs += (latencyMs || 0);
    provStat.avgLatencyMs = Math.round(provStat.totalLatencyMs / provStat.requests);

    // Métricas por Modelo
    const modelKey = String(model).toLowerCase();
    if (!this.stats.byModel[modelKey]) {
      this.stats.byModel[modelKey] = {
        name: model,
        provider: provider,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0
      };
    }
    const modelStat = this.stats.byModel[modelKey];
    modelStat.totalTokens += tTokens;
    modelStat.promptTokens += pTokens;
    modelStat.completionTokens += cTokens;
    modelStat.requests += 1;
    modelStat.totalLatencyMs += (latencyMs || 0);
    modelStat.avgLatencyMs = Math.round(modelStat.totalLatencyMs / modelStat.requests);

    // Historial de Logs Recientes (máximo 60 registros)
    const logEntry = {
      id: `tok_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
      promptTokens: pTokens,
      completionTokens: cTokens,
      totalTokens: tTokens,
      latencyMs: Math.round(latencyMs || 0),
      caller
    };

    this.stats.recentLogs.unshift(logEntry);
    if (this.stats.recentLogs.length > 60) {
      this.stats.recentLogs = this.stats.recentLogs.slice(0, 60);
    }

    this.saveStats();
    return logEntry;
  }

  getStats() {
    return {
      ...this.stats,
      serverTime: new Date().toISOString()
    };
  }

  resetStats() {
    this.stats = {
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      byProvider: {},
      byModel: {},
      recentLogs: []
    };
    this.saveStats();
    return this.getStats();
  }
}

export const tokenTracker = new TokenTrackerService();
