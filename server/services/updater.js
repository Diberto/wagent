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
      return data.version || '1.2.0';
    }
  } catch (e) {}
  return '1.2.0';
};

const getGitEnv = () => {
  const gitPaths = [
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\Git\\bin',
    'C:\\Program Files\\Git\\mingw64\\bin'
  ];
  return {
    ...process.env,
    PATH: `${gitPaths.join(';')};${process.env.PATH || ''}`
  };
};

export class UpdateService {
  static GITHUB_REPO = 'Diberto/wagent';
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
        env: getGitEnv()
      });
      return stdout.trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Consulta a GitHub para verificar si hay nuevos commits / releases
   */
  static async checkUpdates() {
    const localCommit = await this.getLocalCommit();

    try {
      const response = await fetch(`https://api.github.com/repos/${this.GITHUB_REPO}/commits/main`, {
        headers: {
          'User-Agent': 'WAgent-CRM-Updater',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        // Si el repositorio es nuevo o aún no tiene commits
        return {
          updateAvailable: false,
          currentVersion: this.CURRENT_VERSION,
          currentCommit: localCommit ? localCommit.substring(0, 7) : 'local',
          latestCommit: null,
          message: 'No se pudo consultar GitHub o el repositorio es privado/inexistente aún.'
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
   * Descarga y aplica la última actualización desde GitHub
   */
  static async applyUpdate() {
    const logs = [];

    try {
      logs.push('0. Creando respaldo completo de base de datos previo a la actualización...');
      try {
        const backup = BackupService.createBackup('pre-update');
        logs.push(`Respaldo de seguridad creado: ${backup.filename}`);
      } catch (bkpErr) {
        logs.push(`⚠️ Aviso: no se pudo completar respaldo previo: ${bkpErr.message}`);
      }

      logs.push('1. Obteniendo últimos cambios de GitHub (git pull)...');
      const gitPath = 'C:\\Program Files\\Git\\cmd';
      const env = { ...process.env, PATH: `${gitPath};${process.env.PATH}` };

      const { stdout: pullOut } = await execAsync('git pull origin main', {
        cwd: CONFIG.ROOT_DIR,
        env
      });
      logs.push(pullOut.trim());

      logs.push('2. Verificando dependencias del servidor...');
      await execAsync('npm install --production', {
        cwd: CONFIG.ROOT_DIR,
        env
      });

      logs.push('3. Recompilando panel web del CRM...');
      const clientDir = path.join(CONFIG.ROOT_DIR, 'client');
      if (fs.existsSync(clientDir)) {
        await execAsync('npm run build', {
          cwd: clientDir,
          env
        });
        logs.push('Compilación de frontend exitosa.');
      }

      logs.push('✅ Actualización completada con éxito.');

      // Programar reinicio ordenado si es necesario
      setTimeout(() => {
        console.log('Reiniciando proceso para aplicar actualización...');
      }, 1500);

      return {
        success: true,
        message: 'WAgent actualizado a la última versión de GitHub correctamente.',
        logs
      };
    } catch (error) {
      console.error('Error aplicando actualización:', error);
      logs.push(`❌ Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        logs
      };
    }
  }
}
