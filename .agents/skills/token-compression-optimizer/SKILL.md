---
name: token-compression-optimizer
description: Guía y técnicas avanzadas para compresión sintáctica de prompts, optimización de contexto, reducción de tokens hasta un 88% y poda de memoria cognitiva sin pérdida de información para modelos LLM.
---

# Token Compression & Optimization Skill ⚡

Este skill proporciona metodologías y utilidades para reducir el consumo de tokens en llamadas a la API de Gemini / OpenAI / Anthropic manteniendo máxima precisión en entidades, montos, pedidos y reglas de negocio.

## Principios Fundamentales

1. **Poda Contextual Dinámica (Dynamic Context Pruning)**:
   - Eliminar saludos redundantes, emojis repetidos y transcripciones intermedias no informativas del historial.
   - Preservar anclajes clave: `Nombre del Cliente`, `Dirección`, `Sucursal`, `Items del Pedido`, `Estado de Pago`.

2. **Compresión Sintáctica & Micro-Vectores**:
   - En lugar de reinyectar todo el catálogo de 50+ productos, inyectar solo el subconjunto relevante mediante coincidencia de embedding o palabra clave.
   - Formato estructurado ultra-compacto:
     `[ID:prod-1|Tapa Cuadril|$12800/kg|Stock:OK]`

3. **Memoria Jerárquica & Grafo Cognitivo (Neural Memory)**:
   - Condensar conversaciones largas en un estado mental resumido (Mental Map) en lugar de enviar 40 mensajes completos.
   - El estado del pedido se envía como un objeto condensado: `{items:[{n:'vacio',q:1,p:11500}],tot:11500,dir:'Locelso 7100'}`.

4. **Cache de Prompt & Respuestas Determinísticas Rápidas**:
   - Para consultas exactas de catálogo, horarios o sucursales, responder directamente desde el motor local con variaciones naturales sin incurrir en costos de tokens externos.
