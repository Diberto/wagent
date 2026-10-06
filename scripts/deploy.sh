#!/usr/bin/env bash
# ==============================================================================
# WAgent CRM - Script de Despliegue y Actualización Automática en Servidor
# ==============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "=================================================================="
echo "🚀 [WAgent] Iniciando Despliegue / Actualización Automática..."
echo "📁 Directorio: $APP_DIR"
echo "⏰ Fecha: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================================="

# 1. Asegurar repositorio limpio y sincronizado con main de GitHub
echo "📥 1. Obteniendo últimos cambios de GitHub..."
git fetch origin main
git reset --hard origin/main

# 2. Instalar dependencias esenciales
echo "📦 2. Verificando dependencias de Node.js..."
npm install --omit=dev

# 3. Compilar el Frontend para producción
echo "⚡ 3. Compilando panel web con Vite..."
npm run build --workspace=client

# 4. Limpieza de procesos viejos / conflictivos en PM2
echo "🧹 4. Purgando procesos conflictivos..."
pm2 delete wagent-cluster 2>/dev/null || true

# 5. Iniciar o reiniciar WAgent CRM con PM2
echo "🔄 5. Reiniciando servicio wagent-crm..."
if pm2 describe wagent-crm > /dev/null 2>&1; then
    pm2 restart ecosystem.config.cjs --env production
else
    pm2 start ecosystem.config.cjs --env production
fi

# 6. Guardar estado de PM2 para supervivencia ante reinicios del VPS
pm2 save

echo "=================================================================="
echo "✅ ¡Despliegue completado exitosamente!"
echo "📡 WAgent CRM está en línea y operando en el puerto 3001"
echo "=================================================================="
