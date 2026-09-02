import { sqliteStorage } from './sqliteStorage.js';

class TaskQueueService {
  constructor() {
    this.handlers = new Map();
    this.concurrencyLimits = {
      ai_generation: 4,
      whatsapp_broadcast: 1,
      audio_synthesis: 2,
      system_maintenance: 1,
      default: 3
    };
    this.activeWorkers = new Map();
    this.isProcessing = false;
    this.init();
  }

  init() {
    // Inicializar contadores de workers activos
    for (const key of Object.keys(this.concurrencyLimits)) {
      this.activeWorkers.set(key, 0);
    }
    this.activeWorkers.set('default', 0);

    // Reanudar tareas pendientes al arrancar
    this.startWorkerLoop();
    console.log('⚡ [TaskQueueService] Sistema de colas asíncronas activo.');
  }

  registerHandler(type, handlerFn) {
    this.handlers.set(type, handlerFn);
  }

  /**
   * Encola una tarea para ejecución asíncrona no bloqueante
   */
  enqueue(type, payload, { priority = 0, maxAttempts = 3 } = {}) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const insertStmt = sqliteStorage.db.prepare(`
      INSERT INTO tasks (id, type, payload, status, priority, attempts, max_attempts, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?)
    `);

    insertStmt.run(
      taskId,
      type,
      JSON.stringify(payload),
      priority,
      maxAttempts,
      now,
      now
    );

    // Disparar ciclo de procesamiento
    this.triggerProcess();

    return {
      taskId,
      type,
      status: 'pending',
      priority,
      createdAt: now
    };
  }

  triggerProcess() {
    if (this.isProcessing) return;
    setImmediate(() => this.processNextJobs());
  }

  startWorkerLoop() {
    // Ciclo de inspección periódico cada 3 segundos
    setInterval(() => {
      this.processNextJobs();
    }, 3000);
  }

  async processNextJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Buscar tareas pendientes ordenadas por prioridad descendente y antigüedad
      const fetchStmt = sqliteStorage.db.prepare(`
        SELECT id, type, payload, priority, attempts, max_attempts
        FROM tasks
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 10
      `);

      const pendingTasks = fetchStmt.all();

      for (const task of pendingTasks) {
        const queueType = task.type;
        const limit = this.concurrencyLimits[queueType] || this.concurrencyLimits.default;
        const currentActive = this.activeWorkers.get(queueType) || 0;

        if (currentActive >= limit) {
          continue; // Capacidad máxima alcanzada para este tipo de cola
        }

        // Marcar tarea como en procesamiento
        this.activeWorkers.set(queueType, currentActive + 1);

        const markProcessingStmt = sqliteStorage.db.prepare(`
          UPDATE tasks
          SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
          WHERE id = ?
        `);
        markProcessingStmt.run(task.id);

        // Despachar en segundo plano sin esperar (Non-Blocking)
        this.executeTask(task, queueType);
      }
    } catch (err) {
      console.error('❌ [TaskQueueService] Error en ciclo de tareas:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  async executeTask(task, queueType) {
    const handler = this.handlers.get(task.type);

    try {
      let payload = null;
      try {
        payload = JSON.parse(task.payload);
      } catch {
        payload = task.payload;
      }

      let result = null;
      if (typeof handler === 'function') {
        result = await handler(payload);
      } else {
        // Handler por defecto o simulación
        result = { success: true, processedAt: new Date().toISOString() };
      }

      // Marcar como completada
      const completeStmt = sqliteStorage.db.prepare(`
        UPDATE tasks
        SET status = 'completed', result = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      completeStmt.run(JSON.stringify(result || {}), task.id);

    } catch (execErr) {
      console.error(`⚠️ [TaskQueueService] Fallo en tarea ${task.id} (${task.type}):`, execErr.message);

      const nextAttempts = task.attempts + 1;
      const isFailed = nextAttempts >= task.max_attempts;

      const failStmt = sqliteStorage.db.prepare(`
        UPDATE tasks
        SET status = ?, error = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      failStmt.run(isFailed ? 'failed' : 'pending', execErr.message, task.id);

    } finally {
      const active = this.activeWorkers.get(queueType) || 1;
      this.activeWorkers.set(queueType, Math.max(0, active - 1));
      // Re-evaluar tareas pendientes
      this.triggerProcess();
    }
  }

  getStats() {
    try {
      const statsStmt = sqliteStorage.db.prepare(`
        SELECT 
          status,
          COUNT(*) as count
        FROM tasks
        GROUP BY status
      `);
      const rows = statsStmt.all();
      
      const res = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0,
        activeWorkers: Object.fromEntries(this.activeWorkers)
      };

      for (const r of rows) {
        if (res[r.status] !== undefined) {
          res[r.status] = r.count;
          res.total += r.count;
        }
      }

      return res;
    } catch {
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0
      };
    }
  }
}

export const taskQueue = new TaskQueueService();
