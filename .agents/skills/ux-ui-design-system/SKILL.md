---
name: ux-ui-design-system
description: >-
  Expert UI/UX design system and frontend ergonomics skill. Use for crafting state-of-the-art,
  accessible, visually stunning user interfaces (UI) and frictionless user experiences (UX)
  in React, TailwindCSS, and Vanilla CSS. Covers design tokens, color harmony, dark/light themes,
  glassmorphism, micro-interactions, responsive mobile/desktop layouts, POS touch interfaces,
  accessibility (WCAG 2.1 AAA), and component architecture.
---

# 🎨 UI/UX Design System & Ergonomics Skill

Esta skill proporciona principios de diseño visual de élite, heurísticas de usabilidad, patrones de componentes y guías de arquitectura UI/UX para crear aplicaciones web, paneles CRM, sistemas POS y tiendas modernas que deslumbren visualmente y ofrezcan una experiencia de usuario impecable.

---

## 🌟 1. Filosofía de Diseño & Estética "Premium"

1. **Jerarquía Visual y Regla 60-30-10**:
   - **60% Color Dominante (Fondo / Lienzo):** Dark modes profundos (`#0b141a`, `#111b21`, `#0f172a`) o Light modes limpios (`#f8fafc`, `#f1f5f9`).
   - **30% Color Secundario (Tarjetas, Paneles, Modales):** Superficies elevadas (`#182229`, `#1e293b`) con bordes sutiles (`border-slate-700/60`, `border-slate-800`).
   - **10% Color de Acento (Call to Action / Estados):** Esmeralda (`#10b981`), Azul Royal (`#2563eb`, `#3b82f6`), Ámbar (`#f59e0b`), Rosa/Carmesí (`#f43f5e`).

2. **Glassmorphism & Profundidad (Elevation & Depth)**:
   - Fondos translúcidos con desenfoque: `backdrop-blur-md bg-black/60` o `backdrop-blur-xl bg-[#111b21]/90`.
   - Sombras multicapa suaves: `shadow-2xl shadow-black/50`, `shadow-lg shadow-emerald-500/10`.
   - Bordes luminosos sutiles: `border border-white/10` o `border-t border-white/15` para simular bisel de luz superior.

3. **Tipografía Moderna & Legibilidad**:
   - Fuentes de alta legibilidad: *Inter*, *Plus Jakarta Sans*, *Outfit*, o *Geist*.
   - Monospace para valores numéricos, precios, PLUs y códigos: *JetBrains Mono*, *Fira Code*, *ui-monospace*.
   - Escala tipográfica estricta: `text-[10px]` (micro-labels), `text-xs` (secundario), `text-sm` (cuerpo principal), `text-base` (subtítulos), `text-lg`/`text-xl` (títulos de sección).

---

## 📱 2. Ergonomía & Heurísticas UX

1. **Touch Targets para Pantallas Táctiles (POS & Móviles)**:
   - Tamaño mínimo de interacción táctil: **44 x 44 px** (o `h-11 min-w-[44px]`).
   - Espaciado entre botones destructivos y de confirmación: mínimo `gap-2` para evitar toques accidentales.
   - Feedback háptico/visual instantáneo: `active:scale-95 transition-transform duration-100`.

2. **Navegación & Control con Teclado (Power Users)**:
   - `Escape (ESC)`: Cerrar modales, popovers y cancelar búsquedas activas.
   - `Enter`: Confirmar acciones primarias o enviar mensajes.
   - `Tab` / `Shift+Tab`: Navegación secuencial accesible por todos los elementos interactivos con `focus-visible:ring-2 focus-visible:ring-emerald-400`.

3. **Estados de Carga y Retroalimentación (Zero-Latency Perception)**:
   - **Skeletons animados** (`animate-pulse bg-slate-800 rounded`) en lugar de pantallas en blanco.
   - **Spinners sutiles** dentro del mismo botón de acción durante peticiones asíncronas (`disabled:opacity-50`).
   - **Toasts y Notificaciones no intrusivas** con auto-dismiss a los 3-4 segundos.

---

## 🧩 3. Patrones de Componentes de Alta Conversión

### A. Modales y Diálogos
```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in">
  <div className="relative w-full max-w-2xl bg-[#111b21] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#182229]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Título del Modal</h3>
          <p className="text-xs text-slate-400">Descripción clara y concisa</p>
        </div>
      </div>
      <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
        <X size={18} />
      </button>
    </div>
    {/* Body */}
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Contenido con scroll independiente */}
    </div>
    {/* Footer Acciones */}
    <div className="p-4 border-t border-slate-800 bg-[#111b21] flex justify-end gap-2">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#182229] text-xs font-semibold">
        Cancelar
      </button>
      <button className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95">
        Guardar Cambios
      </button>
    </div>
  </div>
</div>
```

### B. Badges de Estado Semánticos
- **Completado / Pagado:** `bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`
- **Pendiente / Alerta:** `bg-amber-500/20 text-amber-300 border border-amber-500/30`
- **Cancelado / Error:** `bg-rose-500/20 text-rose-400 border border-rose-500/30`
- **Informativo / Proceso:** `bg-blue-500/20 text-blue-400 border border-blue-500/30`

---

## ♿ 4. Accesibilidad (a11y) & Estándares WCAG 2.1 AAA

- **Contraste de Color:** Ratio mínimo de `4.5:1` para texto normal y `3:1` para texto grande / iconos clave.
- **Etiquetado Semántico:** Todos los inputs interactivos deben tener un `label` visible o atributo `aria-label`.
- **Iconos con Significado:** Acompañar iconos críticos con texto descriptivo o `title`/`tooltip`.
- **Estructura Semántica:** Usar `<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>`, `<section>` y jerarquía estricta `<h1>` a `<h6>`.
