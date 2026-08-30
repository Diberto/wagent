# WAgent - WhatsApp CRM con Inteligencia Artificial

Un CRM moderno y completo para WhatsApp que permite vincular tu cuenta mediante **Código QR (Baileys Multi-Device)**, atender clientes y cerrar ventas con un **Agente de IA Multimodal**, recibir y enviar **mensajes de texto y notas de voz (Speech-to-Text & Text-to-Speech)**, y gestionar **llamadas de voz de WhatsApp**.

---

## 🚀 Características Principales

1. **Vinculación por Código QR en Tiempo Real**:
   - Conexión oficial Multi-Device usando Baileys WebSocket.
   - Sincronización automática de credenciales para no perder la sesión al reiniciar.

2. **Agente de IA para Ventas & Soporte al Cliente**:
   - Integración con **Google Gemini (2.0 Flash / 1.5 Flash)** y **OpenAI (GPT-4o / GPT-4o-mini)**.
   - Modo demostración sin costo incluido para probar de inmediato sin necesidad inicial de API Keys.
   - **Base de Conocimiento RAG**: Entrena al agente con productos, precios, horarios, métodos de pago y políticas de tu empresa.

3. **Soporte Completo de Audio & Notas de Voz PTT**:
   - **Recepción y Transcripción (STT)**: Transcribe audios entrantes de clientes palabra por palabra.
   - **Respuesta con Voz Neural (TTS)**: Síntesis de voz ultra-realista en español (México, España, Colombia, Argentina) en formato nativo Opus OGG de WhatsApp.
   - **Grabador de Notas de Voz Web**: Graba audios directamente desde el CRM con el micrófono de tu computadora.

4. **Gestión de Llamadas & Asistente de Voz**:
   - Registro en tiempo real de llamadas entrantes de WhatsApp (perdidas, atendidas, duración).
   - **Auto-seguimiento por Nota de Voz**: Envía un audio automático cuando un cliente llama, ofreciendo atención virtual inmediata.
   - **Simulador Interactivo de Voz en Vivo WebRTC**: Habla con el agente por voz directamente desde el navegador.

5. **Embudo de Ventas Kanban**:
   - Columnas interactivas: *Nuevo Lead, Calificado, En Negociación, Propuesta Enviada, Venta Cerrada (Ganado), Perdido*.
   - Arrastrar y soltar (Drag & Drop) con cálculo de valor en pipeline e ingresos generados.
   - Switch de **Control Manual / Agente IA** por cada cliente individual.

6. **Métricas & Analíticas**:
   - Tasa de conversión, volumen de mensajes, notas de voz procesadas y eficiencia del agente.

---

## 💻 Cómo Iniciar el Proyecto

### Opción 1: Inicio Rápido (Windows)
Haz doble clic en el archivo **`start.bat`**. Abrirá automáticamente el navegador en `http://localhost:3001`.

### Opción 2: Desde la Terminal
```bash
# Iniciar servidor y panel CRM
npm start
```
Luego abre en tu navegador: **`http://localhost:3001`**

---

## 📱 Cómo Vincular tu WhatsApp

1. Abre el CRM en tu navegador.
2. Haz clic en el botón superior **"Conectar QR"** o **"Escanear QR"**.
3. Abre **WhatsApp** en tu teléfono celular:
   - En Android: Toca los tres puntos `⋮` > **Dispositivos vinculados** > **Vincular un dispositivo**.
   - En iPhone: Ve a **Configuración** > **Dispositivos vinculados** > **Vincular un dispositivo**.
4. Apunta la cámara al código QR que aparece en pantalla y ¡listo!

---

## ⚙️ Configuración de API Keys y Voces

Haz clic en el ícono de **Ajustes** (⚙️) en la barra superior del CRM para:
- Ingresar tu clave de **Google Gemini API** o **OpenAI API**.
- Elegir el modelo de IA (`gemini-2.0-flash`, `gpt-4o-mini`, etc.).
- Probar y seleccionar la voz neural de tu preferencia (*Dalia México, Álvaro España, Gonzalo Colombia, Tomás Argentina, etc.*).
- Personalizar el **Prompt de Ventas y Atención al Cliente**.
