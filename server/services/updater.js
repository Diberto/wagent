import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config/index.js';
import { BackupService } from './backup.js';

const execAsync = promisify(exec);

const getAppVersion = () => {
  try {
    const pkgPath = path.join(CONFIG.ROOT_DIR, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return data.version || '1.3.3';
    }
  } catch (e) {}
  return '1.3.3';
};

const getExecutionEnv = () => {
  const isWin = process.platform === 'win32';
  if (isWin) {
    const gitPaths = [
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\nodejs'
    ];
    return {
      ...process.env,
      PATH: `${gitPaths.join(';')};${process.env.PATH || ''}`
    };
  }
  return {
    ...process.env,
    PATH: `/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games:${process.env.PATH || ''}`
  };
};

export class UpdateService {
  static GITHUB_REPO = 'Diberto/wagent';
  static isUpdating = false;
  static lastCheckTime = null;
  static lastUpdateLogs = [];
  static autoUpdateTimer = null;
  static io = null;

  static setSocketIO(ioInstance) {
    this.io = ioInstance;
  }

  static get CURRENT_VERSION() {
    return getAppVersion();
  }

  /**
   * Obtiene el commit hash local actual
   */
  static async getLocalCommit() {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { 
        cwd: CONFIG.ROOT_DIR,
        env: getExecutionEnv()
      });
      return stdout.trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Consulta a GitHub para verificar si hay nuevos commits en la rama main
   */
  static async checkUpdates() {
    const localCommit = await this.getLocalCommit();
    this.lastCheckTime = new Date().toISOString();

    try {
      const response = await fetch(`https://api.github.com/repos/${this.GITHUB_REPO}/commits/main`, {
        headers: {
          'User-Agent': 'WAgent-CRM-AutoUpdater',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        return {
          updateAvailable: false,
          currentVersion: this.CURRENT_VERSION,
          currentCommit: localCommit ? localCommit.substring(0, 7) : 'local',
          latestCommit: null,
          message: `Respuesta de GitHub: HTTP ${response.status}`
        };
      }

      const data = await response.json();
      const remoteCommit = data.sha;
      const commitMessage = data.commit?.message || 'Actualización de WAgent';
      const commitDate = data.commit?.author?.date || new Date().toISOString();
      const author = data.commit?.author?.name || 'GitHub';

      const updateAvailable = Boolean(localCommit && remoteCommit && localCommit !== remoteCommit);

      return {
        updateAvailable,
        currentVersion: this.CURRENT_VERSION,
        currentCommit: localCommit ? localCommit.substring(0, 7) : 'local',
        latestCommit: remoteCommit.substring(0, 7),
        fullRemoteCommit: remoteCommit,
        latestCommitMessage: commitMessage,
        latestCommitDate: commitDate,
        author,
        lastCheckTime: this.lastCheckTime,
        repoUrl: `https://github.com/${this.GITHUB_REPO}`
      };
    } catch (error) {
      console.error('Error verificando actualizaciones en GitHub:', error);
      return {
        updateAvailable: false,
        currentVersion: this.CURRENT_VERSION,
        currentCommit: localCommit ? localCommit.substring(0, 7) : 'local',
        error: error.message
      };
    }
  }

  /**
   * Descarga, compila y aplica automáticamente la última versión desde GitHub
   */
  static async applyUpdate({ trigger = 'manual' } = {}) {
    if (this.isUpdating) {
      return {
        success: false,
        message: 'Ya hay una actualización en curso. Espera a que finalice.',
        logs: this.lastUpdateLogs
      };
    }

    this.isUpdating = true;
    const logs = [];
    const pushLog = (msg) => {
      console.log(`[Updater] ${msg}`);
      logs.push(msg);
      this.lastUpdateLogs = [...logs];
      if (this.io) {
        this.io.emit('system:update:progress', { message: msg, logs });
      }
    };

    try {
      pushLog(`🚀 Iniciando actualización automática de WAgent (Origen: ${trigger})...`);

      // 0. Respaldo preventivo completo de la base de datos
      pushLog('💾 Paso 0/5: Creando respaldo preventivo completo de la base de datos...');
      try {
        const backup = BackupService.createBackup('pre-update-auto');
        pushLog(`✅ Respaldo de seguridad creado: ${backup.filename}`);
      } catch (bkpErr) {
        pushLog(`⚠️ Advertencia creando respaldo: ${bkpErr.message}`);
      }

      const env = getExecutionEnv();
      const isWin = process.platform === 'win32';
      const npmCmd = isWin ? 'npm.cmd' : 'npm';

      // 1. Sincronización limpia con GitHub
      pushLog('📥 Paso 1/5: Descargando últimos cambios desde GitHub (git fetch & reset)...');
      try {
        await execAsync('git fetch origin main', { cwd: CONFIG.ROOT_DIR, env });
        const { stdout: resetOut } = await execAsync('git reset --hard origin/main', { cwd: CONFIG.ROOT_DIR, env });
        pushLog(`✅ Sincronización Git completa: ${resetOut.trim().split('\n')[0] || 'OK'}`);
      } catch (gitErr) {
        pushLog(`Aviso en reset, ejecutando git pull: ${gitErr.message}`);
        const { stdout: pullOut } = await execAsync('git pull origin main', { cwd: CONFIG.ROOT_DIR, env });
        pushLog(`✅ Git pull exitoso: ${pullOut.trim()}`);
      }

      // 2. Verificación de dependencias del proyecto
      pushLog('📦 Paso 2/5: Verificando dependencias...');
      try {
        await execAsync(`${npmCmd} install --omit=dev`, { cwd: CONFIG.ROOT_DIR, env });
        pushLog('✅ Dependencias verificadas y al día.');
      } catch (npmErr) {
        pushLog(`⚠️ Advertencia verificando dependencias: ${npmErr.message}`);
      }

      // 3. Recompilación automática del frontend
      pushLog('⚡ Paso 3/5: Recompilando panel web para producción (Vite build)...');
      try {
        await execAsync(`${npmCmd} run build --workspace=client`, { cwd: CONFIG.ROOT_DIR, env });
        pushLog('✅ Frontend compilado exitosamente para producción.');
      } catch (buildErr) {
        pushLog(`Compilando desde client/: ${buildErr.message}`);
        const clientDir = path.join(CONFIG.ROOT_DIR, 'client');
        await execAsync(`${npmCmd} run build`, { cwd: clientDir, env });
        pushLog('✅ Frontend compilado en directorio client.');
      }

      // 4. Limpieza de cluster conflictivo si existe en PM2
      pushLog('🧹 Paso 4/5: Asegurando configuración limpia de PM2...');
      try {
        await execAsync('pm2 delete wagent-cluster', { cwd: CONFIG.ROOT_DIR, env });
        pushLog('✅ Proceso conflictivo wagent-cluster purgado de PM2.');
      } catch (_) {}

      // 5. Reinicio automático ordenado
      pushLog('🔄 Paso 5/5: Programando recarga ordenada del servicio...');
      if (this.io) {
        this.io.emit('system:update:completed', {
          success: true,
          message: 'Sistema actualizado exitosamente. Reiniciando servicio...'
        });
      }

      setTimeout(async () => {
        try {
          console.log('🔄 [Updater] Reiniciando servicio para aplicar cambios...');
          try {
            await execAsync('pm2 restart wagent-crm', { cwd: CONFIG.ROOT_DIR, env });
          } catch (_) {
            process.exit(0);
          }
        } catch (restartErr) {
          console.error('Error durante el reinicio:', restartErr);
          process.exit(0);
        }
      }, 2000);

      this.isUpdating = false;
      return {
        success: true,
        message: 'WAgent actualizado y compilado con éxito a la última versión de GitHub.',
        logs
      };
    } catch (error) {
      console.error('❌ Error aplicando actualización:', error);
      pushLog(`❌ Error crítico en actualización: ${error.message}`);
      this.isUpdating = false;
      if (this.io) {
        this.io.emit('system:update:error', { error: error.message, logs });
      }
      return {
        success: false,
        error: error.message,
        logs
      };
    }
  }

  /**
   * Planificador periódico de auto-actualización en segundo plano.
   * Consulta GitHub cada X minutos. Si detecta un nuevo commit en origin/main, actualiza automáticamente.
   */
  static initAutoUpdateScheduler(intervalMinutes = 10) {
    if (this.autoUpdateTimer) {
      clearInterval(this.autoUpdateTimer);
      this.autoUpdateTimer = null;
    }

    const intervalMs = Math.max(5, intervalMinutes) * 60 * 1000;
    console.log(`🤖 [Auto-Updater] Servicio de auto-actualización continuo activado (Chequeo cada ${intervalMinutes} minutos).`);

    // Primera verificación preventiva tras 45 segundos de arrancar
    setTimeout(async () => {
      await this.runScheduledCheck();
    }, 45 * 1000);

    // Verificación periódica recurrente
    this.autoUpdateTimer = setInterval(async () => {
      await this.runScheduledCheck();
    }, intervalMs);
  }

  static async runScheduledCheck() {
    try {
      const check = await this.checkUpdates();
      if (check.updateAvailable) {
        console.log(`🚀 [Auto-Updater] ¡Nueva versión detectada en GitHub!`);
        console.log(`   Commit: ${check.latestCommit} - "${check.latestCommitMessage}"`);
        console.log(`   Descargando, compilando y reiniciando automáticamente...`);
        await this.applyUpdate({ trigger: 'auto-scheduler' });
      }
    } catch (err) {
      console.warn('Aviso en chequeo automático de actualizaciones:', err.message);
    }
  }
}
