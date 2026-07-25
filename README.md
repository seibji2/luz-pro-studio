# IRONFILTER PRO

> Editor fotográfico profesional orientado al mundo fitness.  
> Comparable a Lightroom Web, Snapseed y Photopea.  
> 100% navegador. Zero backend. Zero dependencias.

---

## Arquitectura

```
IRONFILTER_PRO/
├── index.html              # Entrada HTML — estructura completa de la UI
├── css/
│   ├── styles.css          # Design system completo, tokens CSS, todos los componentes
│   ├── animations.css      # Animaciones, transiciones, keyframes
│   └── responsive.css      # Breakpoints: 1440, 1200, 960, 768, 480px
├── js/
│   ├── app.js              # Orquestador principal — conecta todos los módulos
│   ├── canvas.js           # Motor de canvas: zoom/pan, pipeline de render, crop, guías
│   ├── filters.js          # 40+ filtros con motor LUT, categorías, thumbnails
│   ├── adjustments.js      # Pipeline completo: exposición, curvas, HSL, balance de color
│   ├── text.js             # Sistema multi-capa de texto con estilos completos
│   ├── fitness.js          # Herramientas fitness: 10 templates, overlays, Gym Poster, PR...
│   ├── export.js           # Exportación: PNG/JPEG/WebP, escala, calidad, portapapeles
│   ├── history.js          # Undo/redo ilimitado con deduplicación inteligente
│   ├── ui.js               # Controladores UI: paneles, filtros, curvas, niveles, atajos
│   └── utils.js            # Utilidades puras: math, color, canvas, DOM, debounce
└── assets/
    ├── icons/
    ├── fonts/
    └── templates/
```

---

## Stack técnico

| Tecnología       | Uso                                      |
|------------------|------------------------------------------|
| HTML5            | Estructura semántica                     |
| CSS3             | Design system con Custom Properties      |
| JavaScript ES2024| Módulos ES nativos, async/await          |
| Canvas API       | Renderizado de imagen y texto            |
| OffscreenCanvas  | Pipeline de píxeles sin bloquear UI      |
| createImageBitmap| Carga y transformación de imágenes       |
| Web Workers      | Procesamiento pesado fuera del hilo main |
| Clipboard API    | Copiar al portapapeles como PNG          |
| File API         | Carga de imágenes locales                |
| Pointer Events   | Pan, zoom, crop, arrastre unificado      |
| ResizeObserver   | Adaptación de canvas al viewport         |

---

## Cómo usar

1. Abre `index.html` en cualquier navegador moderno (Chrome 90+, Firefox 90+, Edge 90+, Safari 15+).
2. No se requiere servidor. Funciona con `file://` para desarrollo local.
3. Para producción, sirve desde cualquier servidor estático (Nginx, Apache, Netlify, Vercel...).

---

## Módulos

### `canvas.js` — CanvasEngine
- Zoom infinito con `wheel` y pinch touch
- Pan con drag y momentum
- Pipeline: transform → filter → adjustments → text → vignette
- OffscreenCanvas para el procesamiento de píxeles
- Caché del bitmap procesado para redraws rápidos de texto
- Modo comparar (lado a lado) y Before/After deslizable
- Regla de tercios, guías personalizadas, reglas métricas
- Crop con handles, ratio fijo/libre, enderezar
- Flip horizontal/vertical, rotación libre y por pasos
- Eye-dropper para muestrear color

### `filters.js` — 40+ Filtros
**Fitness:** Iron, Beast Mode, Sweat, Champion, Powerlifting, CrossFit, Gym Raw, Bodybuilding, Golden Hour  
**Dark:** Midnight, Noir, Danger, Shadow, Abyss, Carbon  
**Cinema:** Cinema, Teal & Orange, Moody, Analog, Epic  
**Vintage:** Vintage, Kodak, Faded, Lomo, Polaroid  
**B&W:** Monolith, Silver, Dramatic, Agfa, Infrared  
**HDR:** HDR, Clarity+, Vivid  
**Color:** Warm, Cold, Natural, Pop, Fade, Urban, Street, Soft, Hard, Tokyo, Concrete, Neon  

### `adjustments.js` — Pipeline de 9 etapas
1. Niveles (input/output/gamma)
2. Curvas RGB (Catmull-Rom spline)
3. Tono (exposición, brillo, contraste, sombras, altas luces, blancos, negros)
4. Color (temperatura, matiz, saturación, vibrance, hue)
5. HSL por canal (8 rangos de color)
6. Balance de color (sombras/medios/altas luces)
7. Detalle (claridad, textura, nitidez, desenfoque)
8. Grano de película
9. Viñeta (renderizada sobre el canvas)

### `text.js` — TextManager
- Capas múltiples con z-order
- Tipografía: fuente, peso, estilo, tamaño, espaciado, interlineado
- Efectos: sombra, contorno, fondo, degradado, overlay gradient
- Blend modes (11 modos)
- Rotación, opacidad, alineación
- Presetes de texto fitness

### `fitness.js` — FitnessManager
Templates integrados con editor en tiempo real:
- Gym Poster
- Bodybuilding
- Powerlifting (SQ/BP/DL/Total)
- Transformación
- Antes/Después
- Workout Card
- Progress Photo
- Macros (con barras de progreso)
- Personal Record
- CrossFit WOD

### `history.js` — HistoryManager
- Undo/redo ilimitado (máx 200 snapshots)
- Deduplicación: no guarda estados idénticos
- pushDebounced: agrupa cambios rápidos
- beginGroup/endGroup: agrupa operaciones como una
- jumpTo: saltar a cualquier punto del historial
- Callbacks: onCapture / onRestore / onUpdate

### `export.js` — ExportManager
- PNG, JPEG, WebP
- Calidad configurable (10–100%)
- Escala: 0.5×, 0.75×, 1×, 1.5×, 2×, 4K
- Estimación de tamaño de archivo en tiempo real
- Copiar al portapapeles (requiere HTTPS)
- Nombre de archivo automático con filtro y fecha

---

## Atajos de teclado

| Atajo       | Acción                     |
|-------------|----------------------------|
| Ctrl+Z      | Deshacer                   |
| Ctrl+Y      | Rehacer                    |
| Ctrl+S      | Descargar imagen           |
| Ctrl+C      | Copiar al portapapeles     |
| O           | Abrir imagen               |
| F           | Ajustar a pantalla         |
| 1           | Zoom 100%                  |
| + / -       | Zoom in / out              |
| C           | Modo comparar              |
| B           | Antes / Después            |
| V           | Herramienta seleccionar    |
| T           | Herramienta texto          |
| R           | Herramienta recortar       |
| H           | Voltear horizontal         |
| Escape      | Cancelar / Deseleccionar   |
| ?           | Mostrar atajos             |

---

## Rendimiento

- **OffscreenCanvas** para todo el pipeline de píxeles
- **createImageBitmap** para transformaciones de imagen
- **requestAnimationFrame** para todos los renders
- **Render diferenciado**: texto y viñeta no re-ejecutan el pipeline de píxeles
- **LUT precomputadas**: O(256) en lugar de O(W×H) para filtros basados en tablas
- **Thumbnails escalonados**: 6ms de stagger para no bloquear el hilo principal
- **Debounce en sliders**: commit al historial solo al soltar, preview inmediato
- **Skip de etapas**: las etapas de ajuste se saltan si sus valores son 0 (identidad)

---

## Compatibilidad

| Navegador | Versión mínima |
|-----------|----------------|
| Chrome    | 90+            |
| Edge      | 90+            |
| Firefox   | 90+            |
| Safari    | 15+            |

Requisitos: `OffscreenCanvas`, `createImageBitmap`, `ES Modules`, `CSS Custom Properties`.

---

## Licencia

IRONFILTER PRO — Proyecto interno. Todos los derechos reservados.
