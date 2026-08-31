import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';
import { db } from './database.js';

export class BackupService {
  static getBackupsDir() {
    const dir = CONFIG.BACKUPS_DIR || path.join(CONFIG.DATA_DIR, 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Crea un nuevo respaldo completo de la base de datos
   * @param {string} label - Etiqueta descriptiva ('manual', 'auto', 'pre-restore', etc.)
   * @returns {object} Metadata del respaldo creado
   */
  static createBackup(label = 'manual') {
    const backupsDir = this.getBackupsDir();
    const dbData = db.readDb();

    const timestamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}_${pad(timestamp.getHours())}-${pad(timestamp.getMinutes())}-${pad(timestamp.getSeconds())}`;
    
    const filename = `backup_${label}_${dateStr}.json`;
    const filePath = path.join(backupsDir, filename);

    const backupPayload = {
      app: 'WAgent CRM',
      version: '1.0.0',
      backupId: `bkp_${Date.now()}`,
      createdAt: timestamp.toISOString(),
      label,
      stats: {
        totalLeads: (dbData.leads || []).length,
        totalMessages: (dbData.messages || []).length,
        totalProducts: (dbData.products || []).length,
        totalCalls: (dbData.calls || []).length,
        totalKnowledgeItems: (dbData.knowledgeBase || []).length
      },
      data: dbData
    };

    fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');
    console.log(`💾 Respaldo creado exitosamente: ${filename}`);

    // Limpieza y rotación: conservar los últimos 20 respaldos
    this.rotateBackups(20);

    const stats = fs.statSync(filePath);
    return {
      filename,
      sizeBytes: stats.size,
      createdAt: timestamp.toISOString(),
      label,
      stats: backupPayload.stats
    };
  }

  /**
   * Lista todos los respaldos disponibles en la carpeta de respaldos
   * @returns {Array<object>}
   */
  static listBackups() {
    const backupsDir = this.getBackupsDir();
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'));

    const list = [];
    for (const file of files) {
      try {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);

        list.push({
          filename: file,
          sizeBytes: stats.size,
          createdAt: parsed.createdAt || stats.mtime.toISOString(),
          label: parsed.label || 'manual',
          version: parsed.version || '1.0.0',
          stats: parsed.stats || {
            totalLeads: (parsed.data?.leads || []).length,
            totalMessages: (parsed.data?.messages || []).length,
            totalProducts: (parsed.data?.products || []).length,
            totalCalls: (parsed.data?.calls || []).length
          }
        });
      } catch (err) {
        console.warn(`Error leyendo archivo de respaldo ${file}:`, err.message);
      }
    }

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Obtiene la ruta física de un archivo de respaldo validando seguridad
   */
  static getBackupFilePath(filename) {
    const backupsDir = this.getBackupsDir();
    const safeFilename = path.basename(filename);
    const filePath = path.join(backupsDir, safeFilename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo de respaldo "${safeFilename}" no existe.`);
    }
    return filePath;
  }

  /**
   * Restaura la base de datos a partir de un archivo o contenido JSON
   * @param {object|string} backupPayload
   * @returns {object}
   */
  static restoreBackup(backupPayload) {
    let payload = backupPayload;
    if (typeof backupPayload === 'string') {
      payload = JSON.parse(backupPayload);
    }

    const dataToRestore = payload.data || payload;

    if (!dataToRestore || typeof dataToRestore !== 'object') {
      throw new Error('El archivo de respaldo no tiene una estructura válida.');
    }

    // 1. Crear respaldo de seguridad automático previo a la restauración
    this.createBackup('pre-restore-safety');

    // 2. Aplicar restauración asegurando todas las colecciones del sistema
    const currentDb = db.readDb();
    const newDb = {
      settings: { ...currentDb.settings, ...(dataToRestore.settings || {}) },
      knowledgeBase: Array.isArray(dataToRestore.knowledgeBase) ? dataToRestore.knowledgeBase : currentDb.knowledgeBase,
      products: Array.isArray(dataToRestore.products) ? dataToRestore.products : currentDb.products,
      leads: Array.isArray(dataToRestore.leads) ? dataToRestore.leads : currentDb.leads,
      messages: Array.isArray(dataToRestore.messages) ? dataToRestore.messages : currentDb.messages,
      calls: Array.isArray(dataToRestore.calls) ? dataToRestore.calls : currentDb.calls,
      orders: Array.isArray(dataToRestore.orders) ? dataToRestore.orders : currentDb.orders,
      branches: Array.isArray(dataToRestore.branches) ? dataToRestore.branches : currentDb.branches,
      drivers: Array.isArray(dataToRestore.drivers) ? dataToRestore.drivers : currentDb.drivers,
      users: Array.isArray(dataToRestore.users) ? dataToRestore.users : currentDb.users,
      automations: Array.isArray(dataToRestore.automations) ? dataToRestore.automations : currentDb.automations,
      broadcastCampaigns: Array.isArray(dataToRestore.broadcastCampaigns) ? dataToRestore.broadcastCampaigns : currentDb.broadcastCampaigns
    };

    db.writeDb(newDb);
    console.log('✅ Base de datos restaurada exitosamente.');

    return {
      success: true,
      restoredAt: new Date().toISOString(),
      stats: {
        leads: (newDb.leads || []).length,
        messages: (newDb.messages || []).length,
        products: (newDb.products || []).length,
        orders: (newDb.orders || []).length,
        branches: (newDb.branches || []).length,
        drivers: (newDb.drivers || []).length,
        calls: (newDb.calls || []).length,
        knowledgeBase: (newDb.knowledgeBase || []).length
      }
    };
  }

  /**
   * Elimina un archivo de respaldo específico
   */
  static deleteBackup(filename) {
    const filePath = this.getBackupFilePath(filename);
    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * Conserva únicamente los N respaldos más recientes
   */
  static rotateBackups(maxKeep = 20) {
    const list = this.listBackups();
    if (list.length > maxKeep) {
      const toDelete = list.slice(maxKeep);
      for (const item of toDelete) {
        try {
          const filePath = path.join(this.getBackupsDir(), item.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}
      }
    }
  }

  /**
   * Inicializa el programador de respaldos automáticos diarios
   */
  static initAutoBackupScheduler() {
    // Generar un respaldo al iniciar si no hay ninguno hoy
    try {
      const backups = this.listBackups();
      const todayStr = new Date().toISOString().split('T')[0];
      const hasTodayBackup = backups.some(b => b.createdAt.startsWith(todayStr));
      if (!hasTodayBackup) {
        this.createBackup('auto-startup');
      }
    } catch (e) {}

    // Respaldo cada 24 horas
    setInterval(() => {
      try {
        console.log('⏰ Ejecutando respaldo automático programado...');
        this.createBackup('auto-daily');
      } catch (err) {
        console.error('Error en respaldo automático:', err);
      }
    }, 24 * 60 * 60 * 1000);
  }
}
