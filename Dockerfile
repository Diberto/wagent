# ===================================================
# Etapa 1: Build del Frontend (Client)
# ===================================================
FROM node:20-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ===================================================
# Etapa 2: Compilación de Binarios Nativos (node-llama-cpp / C++)
# ===================================================
FROM node:20-slim AS backend-builder
WORKDIR /app

# Instalar herramientas de compilación de C++ para node-llama-cpp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    cmake \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY .npmrc ./
# Compilamos dependencias completas y módulos nativos en entorno con build tools
RUN npm ci --omit=dev

# ===================================================
# Etapa 3: Contenedor Final Ligero para Hostinger / VPS
# ===================================================
FROM node:20-slim AS runner
WORKDIR /app

# Instalar dependencias esenciales de ejecución (ffmpeg, certs, timezone)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV LLAMA_CONTEXT_SIZE=256
ENV LLAMA_THREADS=1

# Copiar solo dependencias ya compiladas y código fuente
COPY --from=backend-builder /app/node_modules ./node_modules
COPY package*.json ./
COPY .npmrc ./
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

# Crear directorios para persistencia de datos y modelos
RUN mkdir -p /app/data/media /app/data/auth_info_baileys /app/data/models /app/logs

# Exponer puerto del CRM
EXPOSE 3001

# Iniciar servidor Express/WebSocket
CMD ["node", "server/index.js"]
