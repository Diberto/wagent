/**
 * Notificador automático de despliegue
 * Dispara el webhook de actualización continua en el servidor en producción (bot.republicadelacarne.com)
 * para que se actualice, compile y reinicie sin intervención manual.
 */

const DEPLOY_URL = process.env.DEPLOY_URL || 'https://bot.republicadelacarne.com/api/system/webhook-deploy';

async function notifyDeploy() {
  console.log(`📡 [Auto-Deploy] Notificando a producción en ${DEPLOY_URL}...`);
  try {
    const res = await fetch(DEPLOY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WAgent-AutoDeploy-Client'
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'local-git-push'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      console.log(`✅ [Auto-Deploy] Despliegue en producción disparado con éxito:`, data.message || 'En progreso');
    } else {
      console.log(`⚠️ [Auto-Deploy] Respuesta del servidor (${res.status}):`, data);
    }
  } catch (err) {
    console.warn(`⚠️ [Auto-Deploy] No se pudo conectar inmediatamente al servidor: ${err.message}. El planificador en segundo plano del servidor se sincronizará automáticamente.`);
  }
}

notifyDeploy();
