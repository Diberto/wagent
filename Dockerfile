# ===================================================
# Etapa 1: Build del Frontend (Client)
# ===================================================
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ===================================================
# Etapa 2: Servidor en Producción
# ===================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Instalar dependencias del sistema necesarias (ffmpeg, git)
RUN apk add --no-cache ffmpeg git ca-certificates tzdata

ENV NODE_ENV=production
ENV PORT=3001

# Instalar dependencias del backend
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código del servidor y artefactos del frontend compilado
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

# Crear directorios para persistencia de datos
RUN mkdir -p /app/data/media /app/data/auth_info_baileys /app/logs

# Exponer puerto del CRM
EXPOSE 3001

# Comando de inicio
CMD ["node", "server/index.js"]
