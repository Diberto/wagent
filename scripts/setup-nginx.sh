#!/usr/bin/env bash
# ==============================================================================
# WAgent CRM - Autoconfigurador de Nginx con Soporte WebSockets & SSL
# ==============================================================================
set -e

DOMAIN="${1:-bot.republicadelacarne.com}"

echo "=================================================================="
echo "🌐 Configurando Nginx para WAgent en: $DOMAIN"
echo "=================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor ejecuta este script con permisos root o sudo:"
  echo "   sudo bash scripts/setup-nginx.sh $DOMAIN"
  exit 1
fi

NGINX_CONF="/etc/nginx/sites-available/wagent"

echo "📝 Generando archivo de configuración Nginx en $NGINX_CONF..."

cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 100M;

    # Proxy inverso principal hacia Node.js en puerto 3001
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Soporte crítico para WebSockets y Socket.IO en tiempo real
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Caché optimizada para archivos multimedia
    location /media/ {
        proxy_pass http://127.0.0.1:3001;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

# Habilitar sitio en sites-enabled
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/wagent

echo "🔍 Verificando sintaxis de Nginx..."
nginx -t

echo "🔄 Recargando Nginx..."
systemctl reload nginx

echo "🔒 Instalando certificado SSL gratuito con Certbot si no existe..."
if command -v certbot > /dev/null 2>&1; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m admin@republicadelacarne.com || true
    systemctl reload nginx
fi

echo "=================================================================="
echo "✅ ¡Nginx configurado exitosamente para $DOMAIN!"
echo "   Soporte WebSockets y proxy inverso en tiempo real activo."
echo "=================================================================="
