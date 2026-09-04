import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AuditLoggerService {
  constructor() {
    this.logsDir = path.join(__dirname, '..', '..', 'data');
    this.logsFile = path.join(this.logsDir, 'audit_logs.json');
    this.maxLogs = 2000;
    this.io = null;
    this._saveTimeout = null;
    this.logs = [];

    this._initStorage();
  }

  _initStorage() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      if (fs.existsSync(this.logsFile)) {
        const raw = fs.readFileSync(this.logsFile, 'utf8');
        if (raw && raw.trim()) {
          this.logs = JSON.parse(raw);
          if (!Array.isArray(this.logs)) this.logs = [];
        }
      } else {
        this.logs = [];
        this._saveImmediately();
      }
    } catch (err) {
      console.error('[AuditLogger] Error inicializando almacenamiento:', err.message);
      this.logs = [];
    }
  }

  setIo(io) {
    this.io = io;
  }

  _scheduleSave() {
    if (this._saveTimeout) return;
    this._saveTimeout = setTimeout(() => {
      this._saveImmediately();
      this._saveTimeout = null;
    }, 500);
  }

  _saveImmediately() {
    try {
      fs.writeFileSync(this.logsFile, JSON.stringify(this.logs.slice(0, this.maxLogs), null, 2), 'utf8');
    } catch (err) {
      console.error('[AuditLogger] Error guardando logs en disco:', err.message);
    }
  }

  /**
   * Log an audit event
   * @param {Object} entry
   * @param {'orders'|'chats'|'agents'|'system'} entry.category
   * @param {'info'|'success'|'warn'|'error'} [entry.level='info']
   * @param {string} entry.action
   * @param {string} entry.title
   * @param {any} [entry.details]
   * @param {Object} [entry.metadata]
   */
  log({
    category = 'system',
    level = 'info',
    action = 'event',
    title = '',
    details = null,
    metadata = {}
  }) {
    const validCategories = ['orders', 'chats', 'agents', 'system'];
    const validLevels = ['info', 'success', 'warn', 'error'];

    const normalizedCategory = validCategories.includes(category) ? category : 'system';
    const normalizedLevel = validLevels.includes(level) ? level : 'info';

    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      category: normalizedCategory,
      level: normalizedLevel,
      action: String(action),
      title: String(title || action),
      details: details !== undefined ? details : null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this._scheduleSave();

    // Emit live to WebSocket clients
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit('audit:log:new', entry);
        this.io.emit('audit:stats', this.getStats());
      } catch (e) {
        console.warn('[AuditLogger] Error emitiendo evento socket:', e.message);
      }
    }

    return entry;
  }

  info(category, action, title, details = null, metadata = {}) {
    return this.log({ category, level: 'info', action, title, details, metadata });
  }

  success(category, action, title, details = null, metadata = {}) {
    return this.log({ category, level: 'success', action, title, details, metadata });
  }

  warn(category, action, title, details = null, metadata = {}) {
    return this.log({ category, level: 'warn', action, title, details, metadata });
  }

  error(category, action, title, details = null, metadata = {}) {
    return this.log({ category, level: 'error', action, title, details, metadata });
  }

  /**
   * Query logs with filtering and pagination
   */
  getLogs({
    category = 'all',
    level = 'all',
    search = '',
    limit = 100,
    offset = 0
  } = {}) {
    let filtered = this.logs;

    if (category && category !== 'all') {
      filtered = filtered.filter(l => l.category === category);
    }

    if (level && level !== 'all') {
      filtered = filtered.filter(l => l.level === level);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(l => {
        if (l.title && l.title.toLowerCase().includes(q)) return true;
        if (l.action && l.action.toLowerCase().includes(q)) return true;
        if (l.category && l.category.toLowerCase().includes(q)) return true;
        if (l.metadata) {
          const metaStr = JSON.stringify(l.metadata).toLowerCase();
          if (metaStr.includes(q)) return true;
        }
        if (l.details) {
          const detStr = typeof l.details === 'string' ? l.details.toLowerCase() : JSON.stringify(l.details).toLowerCase();
          if (detStr.includes(q)) return true;
        }
        return false;
      });
    }

    const total = filtered.length;
    const numLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const numOffset = Math.max(0, parseInt(offset, 10) || 0);
    const paginated = filtered.slice(numOffset, numOffset + numLimit);

    return {
      total,
      limit: numLimit,
      offset: numOffset,
      logs: paginated
    };
  }

  getStats() {
    const total = this.logs.length;
    const byCategory = {
      orders: 0,
      chats: 0,
      agents: 0,
      system: 0
    };
    const byLevel = {
      info: 0,
      success: 0,
      warn: 0,
      error: 0
    };

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let last24h = 0;

    for (const l of this.logs) {
      if (byCategory[l.category] !== undefined) byCategory[l.category]++;
      if (byLevel[l.level] !== undefined) byLevel[l.level]++;
      if (new Date(l.timestamp).getTime() >= oneDayAgo) last24h++;
    }

    return {
      total,
      last24h,
      byCategory,
      byLevel
    };
  }

  clearLogs() {
    this.logs = [];
    this._saveImmediately();
    if (this.io) {
      this.io.emit('audit:cleared');
      this.io.emit('audit:stats', this.getStats());
    }
    return { success: true, message: 'Logs de auditoría limpiados correctamente' };
  }

  exportLogs(format = 'json') {
    if (format === 'csv') {
      const headers = ['ID', 'Fecha y Hora', 'Categoría', 'Nivel', 'Acción', 'Título', 'Detalles', 'Metadatos'];
      const rows = this.logs.map(l => [
        `"${l.id}"`,
        `"${l.timestamp}"`,
        `"${l.category}"`,
        `"${l.level}"`,
        `"${l.action}"`,
        `"${(l.title || '').replace(/"/g, '""')}"`,
        `"${(typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || '')).replace(/"/g, '""')}"`,
        `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
    return JSON.stringify(this.logs, null, 2);
  }
}

export const auditLogger = new AuditLoggerService();
export default auditLogger;
