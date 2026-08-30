# 🚀 Guía de Despliegue en Producción (Production Deployment Guide)

Esta guía detalla cómo poner en producción tu **WhatsApp CRM con Agente de IA, Notas de Voz y Llamadas** tanto en servidores Linux (Ubuntu/Debian VPS) como con Docker o en Windows.

---

## 📋 Requisitos Previos

- **Node.js**: v18.x, v20.x o superior
- **Git** y **FFmpeg** (vienen configurados automáticamente con Docker y npm)
- **Dominio o IP Pública** (Opcional, para acceder remotamente)

---

## Opción 1: Despliegue con Docker (Recomendado para la Nube / VPS)

El despliegue con Docker es el más rápido, seguro y aislado.

### 1. Clonar o subir tu proyecto al servidor:
```bash
git clone <tu-repositorio>
cd WAgent
```

### 2. Configurar variables de entorno:
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```
Edita `.env` para agregar tus claves (opcional, también puedes hacerlo desde la interfaz web):
```env
PORT=3001
NODE_ENV=production
AI_PROVIDER=gemini
GEMINI_API_KEY=tu_clave_aqui
```

### 3. Iniciar con Docker Compose:
```bash
docker compose up -d --build
```

¡Listo! El contenedor mantendrá persistentes tus sesiones de WhatsApp QR, base de datos y archivos de audio en la carpeta local `./data`.

Para ver los logs en tiempo real:
```bash
docker compose logs -f
```

---

## Opción 2: Despliegue en Servidor VPS Linux (Ubuntu con PM2 y Nginx)

### 1. Instalar Node.js 20, PM2 y FFmpeg en el VPS:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ffmpeg git build-essential

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2
```

### 2. Instalar dependencias y compilar el frontend:
```bash
npm install
npm run build
```

### 3. Iniciar el servicio con PM2 (Autoreinicio y 24/7):
```bash
npm run pm2:start

# Configurar para que inicie automáticamente al reiniciar el servidor
pm2 startup
pm2 save
```

### 4. Configurar Nginx con Dominio y SSL (HTTPS):
Crea la configuración del sitio en `/etc/nginx/sites-available/wagent`:
```nginx
server {
    server_name crm.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Habilitar y obtener certificado SSL gratuito con Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/wagent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Instalar Certbot y activar HTTPS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.tudominio.com
```

---

## Opción 3: Ejecución en Producción Local (Windows)

Simplemente ejecuta el script:
👉 **`start-production.bat`**

Este script compila el frontend, activa las cabeceras de seguridad Helmet, la compresión Gzip y lanza la aplicación en `http://localhost:3001`.

---

## 🛡️ Buenas Prácticas para WhatsApp en Producción

1. **Calentamiento de Cuenta (Warm-up)**: Si usas un número de WhatsApp nuevo, no envíes cientos de mensajes el primer día. Comienza respondiendo mensajes orgánicos durante la primera semana.
2. **Uso de Respuestas Humanas**: Configura tiempos de delay naturales y respuestas empáticas.
3. **Persistencia**: La carpeta `data/auth_info_baileys` contiene las llaves criptográficas de tu sesión; nunca la borres a menos que quieras vincular un nuevo número de teléfono.
