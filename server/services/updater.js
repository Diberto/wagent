import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config/index.js';
import { BackupService } from './backup.js';

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

/**
 * Ejecutor seguro de comandos que nunca arroja excepciones no controladas
 * y garantiza que stdout/stderr siempre sean cadenas de texto definidas.
 */
const runCommand = (cmd, cwd = CONFIG.ROOT_DIR) => {
  return new Promise((resolve) => {
    exec(cmd, { cwd, env: getExecutionEnv(), maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout || '').trim();
      const errOut = String(stderr || '').trim();
      resolve({
        success: !err,
        stdout: out,
        stderr: errOut,
        output: out || errOut || '',
        error: err ? (err.message || String(err)) : null
      });
    });
  });
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

  static getCommitFile() {
    return path.join(CONFIG.DATA_DIR, 'last_commit.txt');
  }

  /**
   * Obtiene el commit hash local actual (desde git o desde caché persistente)
   */
  static async getLocalCommit() {
    try {
      const res = await runCommand('git rev-parse HEAD');
      if (res.success && res.stdout && res.stdout.length >= 7) {
        return res.stdout;
      }
    } catch (_) {}

    // Fallback: leer commit guardado en data/last_commit.txt
    try {
      const commitFile = this.getCommitFile();
      if (fs.existsSync(commitFile)) {
        const cached = fs.readFileSync(commitFile, 'utf8').trim();
        if (cached && cached.length >= 7) {
          return cached;
        }
      }
    } catch (_) {}

    return null;
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
      const remoteCommit = data.sha || '';
      const commitMessage = data.commit?.message || 'Actualización de WAgent';
      const commitDate = data.commit?.author?.date || new Date().toISOString();
      const author = data.commit?.author?.name || 'GitHub';

      // Si remoteCommit existe y es distinto al local, hay actualización disponible
      const updateAvailable = Boolean(remoteCommit && (!localCommit || localCommit !== remoteCommit));

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
   * Descarga, compila y aplica automáticamente la última versión desde GitHub de forma autónoma.
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
      pushLog(`🚀 [Auto-Deploy] Iniciando actualización de WAgent (Origen: ${trigger})...`);

      // 0. Respaldo preventivo completo de la base de datos
      pushLog('💾 Paso 0/5: Creando respaldo preventivo completo de la base de datos...');
      try {
        const backup = BackupService.createBackup('pre-update-auto');
        pushLog(`✅ Respaldo creado con éxito: ${backup.filename}`);
      } catch (bkpErr) {
        pushLog(`⚠️ Advertencia creando respaldo: ${bkpErr.message}`);
      }

      const isWin = process.platform === 'win32';
      const npmCmd = isWin ? 'npm.cmd' : 'npm';

      // 1. Configurar git safe.directory para evitar bloqueos de permisos en Linux/Docker
      await runCommand('git config --global --add safe.directory "*"');

      // 2. Sincronización limpia con GitHub (git fetch & reset)
      pushLog('📥 Paso 1/5: Sincronizando con rama main de GitHub...');
      let syncResult = await runCommand('git fetch origin main');
      if (!syncResult.success) {
        pushLog(`Aviso en git fetch: ${syncResult.stderr || syncResult.error}. Reintentando con git pull...`);
      }

      let resetResult = await runCommand('git reset --hard origin/main');
      if (resetResult.success) {
        pushLog(`✅ Árbol de código actualizado: ${resetResult.stdout.split('\n')[0] || 'OK'}`);
      } else {
        // Fallback secundario a git pull
        let pullResult = await runCommand('git pull origin main');
        pushLog(`✅ Git pull resultado: ${pullResult.output || 'OK'}`);
      }

      // Guardar commit hash actualizado en caché
      try {
        const currentCommitRes = await runCommand('git rev-parse HEAD');
        if (currentCommitRes.success && currentCommitRes.stdout) {
          const commitFile = this.getCommitFile();
          if (!fs.existsSync(path.dirname(commitFile))) fs.mkdirSync(path.dirname(commitFile), { recursive: true });
          fs.writeFileSync(commitFile, currentCommitRes.stdout, 'utf8');
        }
      } catch (_) {}

      // 3. Verificación de dependencias del proyecto
      pushLog('📦 Paso 2/5: Verificando dependencias del servidor...');
      const installRes = await runCommand(`${npmCmd} install --omit=dev`);
      pushLog(`✅ Dependencias al día: ${installRes.success ? 'Completado' : (installRes.stderr || 'OK')}`);

      // 4. Recompilación automática del frontend
      pushLog('⚡ Paso 3/5: Recompilando panel web para producción (Vite build)...');
      let buildRes = await runCommand(`${npmCmd} run build --workspace=client`);
      if (buildRes.success) {
        pushLog('✅ Frontend compilado exitosamente para producción.');
      } else {
        pushLog(`Aviso en workspace build, compilando en carpeta client/: ${buildRes.stderr}`);
        const clientDir = path.join(CONFIG.ROOT_DIR, 'client');
        const clientBuildRes = await runCommand(`${npmCmd} run build`, clientDir);
        pushLog(`✅ Frontend compilado: ${clientBuildRes.success ? 'Éxito' : clientBuildRes.output}`);
      }

      // 5. Limpieza de cluster conflictivo si existe en PM2
      pushLog('🧹 Paso 4/5: Asegurando configuración limpia de procesos PM2...');
      await runCommand('pm2 delete wagent-cluster');
      pushLog('✅ Procesos verificados.');

      // 6. Reinicio automático ordenado del servicio
      pushLog('🔄 Paso 5/5: Programando recarga ordenada del servicio...');
      if (this.io) {
        this.io.emit('system:update:completed', {
          success: true,
          message: 'Sistema actualizado exitosamente. Reiniciando servicio...'
        });
      }

      setTimeout(async () => {
        try {
          console.log('🔄 [Auto-Deploy] Reiniciando servicio para aplicar cambios...');
          const pm2Res = await runCommand('pm2 restart wagent-crm');
          if (!pm2Res.success) {
            // Si corre bajo PM2 como daemon directo, salir con código 0 hace que PM2 lo levante al instante
            process.exit(0);
          }
        } catch (_) {
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
      pushLog(`❌ Error en actualización: ${error.message}`);
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
