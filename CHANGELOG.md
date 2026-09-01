# Changelog — WAgent CRM

Todas las versiones notables y cambios de este proyecto se documentan en este archivo siguiendo [Semantic Versioning (SemVer)](https://semver.org/).

---

## [v1.2.0] — 2026-09-01

### 🥩 Catálogo Maestro & PLUs
- **Actualización Integral del Catálogo**: Importación y sincronización de 790 productos oficiales con precios actualizados al consumidor final, alícuotas de IVA y códigos PLU (`data/db.json` y `masterCatalogData.js`).
- **Disponibilidad Dinámica de Cortes**: Detección inteligente en el motor de IA (`server/services/ai.js`) para validar automáticamente el stock real de cortes emblemáticos (Vacío, Costilla, Lomo, Mollejas, Cerdo, Pollos, Carbón, Vinos).

### ⚖️ Gestión de Pesos y Gramos en POS
- **Steppers y Presets de Gramaje**: Soporte en tiempo real para modificar productos por kilo tanto en decimales (ej. `0.25 kg`) como en gramos directos (`250 g`).
- **Accesos Rápidos**: Botones de pesaje frecuente (`250 g`, `500 g`, `750 g`, `1 kg`, `1.5 kg`, `2 kg`, `3 kg`) con recálculo automático de subtotales.
- **Formateo Inteligente**: Las cantidades fraccionarias se presentan de forma clara y legible (`250 g (0.25 kg)`).

### 🏢 Logística y Asignación Directa desde la Tarjeta
- **Selector Inline de Sucursales**: Reemplazo de badges estáticos por selectores interactivos directos con guardado instantáneo en base de datos (`PUT /api/orders/:id`).
- **Selector Inline de Reparto**: Asignación de repartidores o modalidad *"🏪 Retiro en Sucursal / Local"* directamente desde la tarjeta del pedido con sincronización WebSocket.
- **Corrección de Combobox**: Normalización de alias para sucursales (`branch_urca_1` / `br-1` -> `URCA CENTRAL`) y eliminación de sugerencias de texto libre (`allowCustom={false}`).

### 📱 Experiencia de Usuario & Layout Anti-Desborde
- **Barra de Acciones Responsiva**: Reorganización de la botonera inferior de pedidos en dos filas con `flex-wrap gap-1.5` que elimina cualquier desborde horizontal.
- **Modal de Desglose Completo**: Vista detallada con desglose de cortes en gramos, dirección, datos del cliente y accesos rápidos a impresión térmica y edición POS.

### 👤 Contactos & Mensajería WhatsApp
- **Resolución de Identificadores @lid**: Mapeo bidireccional y persistencia entre identificadores de privacidad `@lid` y el número telefónico real del contacto.
- **Sincronización de Foto de Perfil**: Descarga y visualización de avatares reales de WhatsApp con caché local.

### 🔄 Sistema de Actualizaciones
- **Versionado Dinámico**: Integración del servicio de actualización con detección de versión desde `package.json` y `version.json`.

---

## [v1.1.0] — 2026-08-30

### 🎙️ Audio & Centro de Voz
- **Soporte de Notas de Voz**: Transcripción de audios entrantes con Whisper y síntesis de voz natural con EdgeTTS / ElevenLabs.
- **Telefonía e IA**: Módulo de llamadas y recepción de pedidos hablados.

### 🗺️ Logística & Impresión Térmica
- **Mapas Interactivos**: Integración de Leaflet y OpenStreetMap para localización de direcciones de entrega en Córdoba.
- **Tickets Térmicos**: Generación e impresión de comandas en formatos 80mm, 58mm y A4.

### 💳 Pasarela de Pago
- **Mercado Pago Checkout Pro**: Generación de links de pago automáticos y envío por WhatsApp.

---

## [v1.0.0] — 2026-08-25

### 🚀 Lanzamiento Inicial
- **Conexión Baileys WhatsApp Multi-Device**: Conexión por código QR en tiempo real.
- **Agente de Ventas IA**: Respuestas comerciales asistidas con Google Gemini / OpenAI.
- **Bandeja de Entrada Multicanal**: Chat en vivo con soporte de audios, imágenes y adjuntos.
- **Gestión Básica de Pedidos**: Estados, clientes y base de datos persistente.
