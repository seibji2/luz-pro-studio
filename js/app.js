/**
 * IRONFILTER PRO — app.js
 * Main application orchestrator.
 * Wires all modules: Canvas, Filters, Adjustments, Text, History,
 * Export, UI, Fitness. Manages global application state.
 */

import { CanvasEngine }     from './canvas.js';
import { TextManager }      from './text.js';
import { FitnessManager }   from './fitness.js';
import { ExportManager }    from './export.js';
import { resetHistory }     from './history.js';
import { defaultAdjustments, resetGroup, resetAllAdjustments, computeHistogram } from './adjustments.js';
import { getFilter, FILTERS }  from './filters.js';
import {
  ToastSystem, Loader, ContextMenu, PanelManager,
  FilterGrid, AdjustmentPanel, CurvesEditor, LevelsEditor,
  KeyboardShortcuts, FileDropZone, initShortcutsModal
} from './ui.js';
import { setText, deepClone } from './utils.js';

/* ================================================================
   GLOBAL APPLICATION STATE
================================================================ */

const state = {
  // Source
  sourceFile:    null,
  sourceName:    '',

  // Filter
  activeFilter:  'raw',
  filterIntensity: 1,

  // Adjustments
  adjustments:   defaultAdjustments(),

  // Text layers
  textLayers:    [],

  // UI
  activeTool:    'select',
  compareMode:   false,
  baMode:        false,
  showThirds:    false,
  showGuides:    false,
  showRulers:    false,
};

/* ================================================================
   BOOT
================================================================ */

async function boot() {
  const loader = new Loader();
  loader.progress(10, 'Cargando interfaz…');

  await domReady();
  loader.progress(30, 'Inicializando motor de canvas…');

  const engine = createCanvasEngine();
  loader.progress(50, 'Configurando módulos…');

  const history = createHistory(engine);
  loader.progress(60, 'Construyendo sistema de filtros…');

  const toast       = new ToastSystem();
  const panels      = new PanelManager(onPanelChange);
  const filterGrid  = createFilterGrid(engine, history, toast);
  const adjPanel    = createAdjPanel(engine, history);
  const curvesEd    = createCurvesEditor(engine, history);
  const levelsEd    = createLevelsEditor(engine, history);
  const textMgr     = createTextManager(engine, history, toast);
  const fitnessMgr  = createFitnessManager(engine, toast);
  const exportMgr   = createExportManager(engine, toast);
  loader.progress(75, 'Configurando atajos y UI…');

  createContextMenu(engine, history, toast, exportMgr);
  createKeyboardShortcuts(engine, history, toast, exportMgr, panels, textMgr);
  createFileDropZone(engine, history, filterGrid, adjPanel, curvesEd, levelsEd, textMgr, fitnessMgr, exportMgr, toast);
  createToolButtons(engine, history);
  createCompareButtons(engine);
  createZoomButtons(engine);
  bindUndoRedoButtons(history);
  bindHeaderNewImage();
  initShortcutsModal();

  loader.progress(100, '¡Listo!');
  setTimeout(() => loader.hide(), 300);
}

/* ================================================================
   DOM READY
================================================================ */

function domReady() {
  return new Promise(resolve => {
    if (document.readyState !== 'loading') resolve();
    else document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

/* ================================================================
   CANVAS ENGINE
================================================================ */

function createCanvasEngine() {
  const engine = new CanvasEngine({
    displayCanvas: document.getElementById('display-canvas'),
    overlayCanvas: document.getElementById('overlay-canvas'),
    viewport:      document.getElementById('canvas-viewport'),
    frame:         document.getElementById('canvas-frame'),
    rulerH:        document.getElementById('ruler-h'),
    rulerV:        document.getElementById('ruler-v'),

    onZoomChange: (zoom) => {
      setText('zoom-display', `${Math.round(zoom * 100)}%`);
    },

    onColorSample: ({ r, g, b, hex }) => {
      setText('status-color', `R:${r} G:${g} B:${b}  ${hex}`);
    },

    onCropChange: (rect) => {
      const x = document.getElementById('crop-x');
      const y = document.getElementById('crop-y');
      const w = document.getElementById('crop-w');
      const h = document.getElementById('crop-h');
      if (x) x.value = rect.x;
      if (y) y.value = rect.y;
      if (w) w.value = rect.w;
      if (h) h.value = rect.h;
    },
  });

  return engine;
}

/* ================================================================
   HISTORY
================================================================ */

function createHistory(engine) {
  const history = resetHistory({
    maxSize: 200,

    onCapture: () => deepClone({
      filter:      state.activeFilter,
      intensity:   state.filterIntensity,
      adjustments: state.adjustments,
      textLayers:  state.textLayers,
    }),

    onRestore: (snapshot) => {
      state.activeFilter    = snapshot.filter;
      state.filterIntensity = snapshot.intensity;
      state.adjustments     = snapshot.adjustments;
      state.textLayers      = snapshot.textLayers;

      engine.setFilter(state.activeFilter, state.filterIntensity);
      engine.setAdjustments(state.adjustments);
      engine.setTextLayers(state.textLayers);
      engine.scheduleRender();
    },

    onUpdate: ({ canUndo, canRedo, size, undoLabel, redoLabel, snapshots }) => {
      const btnUndo = document.getElementById('btn-undo');
      const btnRedo = document.getElementById('btn-redo');
      if (btnUndo) { btnUndo.disabled = !canUndo; btnUndo.title = canUndo ? `Deshacer: ${undoLabel}` : 'Deshacer'; }
      if (btnRedo) { btnRedo.disabled = !canRedo; btnRedo.title = canRedo ? `Rehacer: ${redoLabel}` : 'Rehacer'; }
      setText('history-counter', size);
      setText('stat-edits', `${size} edits`);
      renderHistoryDots(snapshots);
    },
  });

  return history;
}

function renderHistoryDots(snapshots) {
  const row = document.getElementById('history-row');
  if (!row) return;
  const { getHistory } = window._ironHistory || {};
  row.innerHTML = '';
  snapshots.forEach((snap, idx) => {
    const dot = document.createElement('div');
    dot.className = 'hist-dot filled';
    dot.title     = snap.label;
    dot.style.cssText = `cursor:pointer; width:8px; height:8px; border-radius:50%; background:var(--border-strong); flex-shrink:0`;
    dot.addEventListener('click', () => {
      const h = window._ironHistory;
      if (h) h.jumpTo(idx);
    });
    row.appendChild(dot);
  });
}

/* ================================================================
   FILTER GRID
================================================================ */

function createFilterGrid(engine, history, toast) {
  const grid = new FilterGrid({
    gridEl:      document.getElementById('filters-grid'),
    categoryEl:  document.getElementById('filter-categories'),
    searchEl:    document.getElementById('filter-search'),

    onSelect: (filterId) => {
      state.activeFilter = filterId;
      setText('stat-filter', getFilter(filterId)?.name || filterId);
      engine.setFilter(filterId, state.filterIntensity);
      history.push(`Filtro: ${getFilter(filterId)?.name || filterId}`);
    },

    onIntensity: (value) => {
      state.filterIntensity = value;
      engine.setFilter(state.activeFilter, value);
    },
  });

  return grid;
}

/* ================================================================
   ADJUSTMENT PANEL
================================================================ */

function createAdjPanel(engine, history) {
  const panel = new AdjustmentPanel({
    onChange: (key, value) => {
      // Support nested keys: 'hsl.red.h', 'colorBalance.shadows.cr'
      const parts = key.split('.');
      let obj = state.adjustments;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
        if (!obj) return;
      }
      obj[parts[parts.length - 1]] = value;
      engine.setAdjustments(state.adjustments);
    },

    onCommit: (label) => {
      history.push(label || 'Ajuste');
    },
  });

  return panel;
}

/* ================================================================
   CURVES EDITOR
================================================================ */

function createCurvesEditor(engine, history) {
  const curves = new CurvesEditor({
    canvas: document.getElementById('curves-canvas'),

    onChange: (channel, curvesState) => {
      state.adjustments.curves = curvesState;
      engine.setAdjustments(state.adjustments);
    },

    onCommit: () => {
      history.push('Curvas');
    },
  });

  return curves;
}

/* ================================================================
   LEVELS EDITOR
================================================================ */

function createLevelsEditor(engine, history) {
  const levels = new LevelsEditor(
    document.getElementById('levels-canvas'),
    (levelsState) => {
      state.adjustments.levels = levelsState;
      engine.setAdjustments(state.adjustments);
    },
    () => history.push('Niveles')
  );

  return levels;
}

/* ================================================================
   TEXT MANAGER
================================================================ */

function createTextManager(engine, history, toast) {
  const mgr = new TextManager({
    layerListEl:     document.getElementById('text-layers'),
    editorSectionEl: document.getElementById('text-editor-section'),

    onLayersChange: (layers) => {
      state.textLayers = layers;
      engine.setTextLayers(layers);
      history.pushDebounced('Texto', 600);
    },
  });

  return mgr;
}

/* ================================================================
   FITNESS MANAGER
================================================================ */

function createFitnessManager(engine, toast) {
  const mgr = new FitnessManager({
    editorEl: document.getElementById('fitness-template-editor'),
    gridEl:   document.getElementById('templates-grid'),

    onOverlay: (renderFn) => {
      // Inject fitness overlay as a post-render draw
      engine._fitnessOverlay = renderFn;
      engine.scheduleRender();
    },

    onClear: () => {
      engine._fitnessOverlay = null;
      engine.scheduleRender();
    },
  });

  return mgr;
}

/* ================================================================
   EXPORT MANAGER
================================================================ */

function createExportManager(engine, toast) {
  const mgr = new ExportManager({
    getCanvasEngine: () => engine,
    getFilename:     () => state.sourceName,
    getFilterName:   () => getFilter(state.activeFilter)?.name || 'edited',
    onExportStart:   () => { /* could show spinner */ },
    onExportEnd:     () => { /* hide spinner */ },
    onToast:         (msg, type) => toast.show(msg, type),
  });

  // Also hook header export button to open export panel
  const btnExportOpen = document.getElementById('btn-export-open');
  if (btnExportOpen) {
    btnExportOpen.addEventListener('click', () => {
      // Activate export panel
      document.querySelector('[data-panel="export"]')?.click();
    });
  }

  return mgr;
}

/* ================================================================
   CONTEXT MENU
================================================================ */

function createContextMenu(engine, history, toast, exportMgr) {
  new ContextMenu({
    undo:       () => history.undo(),
    redo:       () => history.redo(),
    copy:       () => exportMgr.copyToClipboard(),
    download:   () => exportMgr.download(),
    'zoom-fit': () => engine.zoomFit(),
    'zoom-100': () => engine.zoom100(),
    'flip-h':   () => { engine.flipH(); history.push('Voltear H'); },
    'flip-v':   () => { engine.flipV(); history.push('Voltear V'); },
  });
}

/* ================================================================
   KEYBOARD SHORTCUTS
================================================================ */

function createKeyboardShortcuts(engine, history, toast, exportMgr, panels, textMgr) {
  const shortcuts = new KeyboardShortcuts({
    undo:         () => history.undo(),
    redo:         () => history.redo(),
    save:         () => exportMgr.download(),
    copy:         () => exportMgr.copyToClipboard(),
    openFile:     () => document.getElementById('file-input')?.click(),
    zoomIn:       () => engine.zoomIn(),
    zoomOut:      () => engine.zoomOut(),
    zoomFit:      () => engine.zoomFit(),
    zoom100:      () => engine.zoom100(),
    compare:      () => toggleCompare(engine),
    beforeAfter:  () => toggleBA(engine),
    selectTool:   () => activateTool('select', engine),
    textTool:     () => {
      activateTool('text', engine);
      panels.activate('text');
      textMgr.addLayer();
    },
    cropTool:     () => {
      activateTool('crop', engine);
      showCropPanel(engine, history);
    },
    flipH:        () => { engine.flipH(); history.push('Voltear H'); },
    escape:       () => {
      if (engine._cropActive) {
        engine.cancelCrop();
        hideCropPanel();
      }
      textMgr.deselect();
    },
    showShortcuts: () => document.getElementById('shortcuts-modal')?.classList.remove('hidden'),
  });

  // Disable shortcuts when typing
  document.addEventListener('focusin',  () => { shortcuts.disabled = true;  });
  document.addEventListener('focusout', () => { shortcuts.disabled = false; });
}

/* ================================================================
   FILE DROP ZONE
================================================================ */

function createFileDropZone(engine, history, filterGrid, adjPanel, curvesEd, levelsEd, textMgr, fitnessMgr, exportMgr, toast) {
  new FileDropZone({
    stageEl:    document.getElementById('canvas-stage'),
    dropZoneEl: document.getElementById('drop-zone'),
    fileInputEl:document.getElementById('file-input'),
    openBtnEl:  document.getElementById('btn-open-image'),
    newImgBtnEl:document.getElementById('btn-new-image'),

    onFile: async (file) => {
      try {
        toast.show('Cargando imagen…', 'info', 1500);

        const { width, height } = await engine.loadFile(file);

        // Update state
        state.sourceFile  = file;
        state.sourceName  = file.name;
        state.adjustments = defaultAdjustments();
        state.textLayers  = [];
        state.activeFilter= 'raw';
        state.filterIntensity = 1;

        // Reset all UI
        adjPanel.sync(state.adjustments);
        curvesEd.sync(state.adjustments.curves);
        textMgr.clear();
        fitnessMgr._activeTemplate = null;
        if (fitnessMgr._editorEl) fitnessMgr._editorEl.innerHTML = '';

        // Reset filter grid
        filterGrid.setActiveFilter('raw');
        document.getElementById('sl-filter-intensity').value = 100;
        setText('v-filter-intensity', '100%');

        // Push thumbnails source
        filterGrid.setSource(engine._sourceBitmap);

        // Compute histogram
        const ctx = engine._display.getContext('2d', { willReadFrequently: true });
        const imgData = ctx.getImageData(0, 0, Math.min(width, 400), Math.min(height, 400));
        const histogram = computeHistogram(imgData);
        curvesEd.setHistogram(histogram);
        levelsEd.setHistogram(histogram);

        // Init history
        const h = resetHistory({
          maxSize: 200,
          onCapture: () => deepClone({ filter: state.activeFilter, intensity: state.filterIntensity, adjustments: state.adjustments, textLayers: state.textLayers }),
          onRestore: (snap) => {
            state.activeFilter    = snap.filter;
            state.filterIntensity = snap.intensity;
            state.adjustments     = snap.adjustments;
            state.textLayers      = snap.textLayers;
            engine.setFilter(state.activeFilter, state.filterIntensity);
            engine.setAdjustments(state.adjustments);
            engine.setTextLayers(state.textLayers);
            adjPanel.sync(state.adjustments);
            engine.scheduleRender();
          },
          onUpdate: ({ canUndo, canRedo, size, undoLabel, redoLabel, snapshots }) => {
            const bu = document.getElementById('btn-undo');
            const br = document.getElementById('btn-redo');
            if (bu) bu.disabled = !canUndo;
            if (br) br.disabled = !canRedo;
            setText('history-counter', size);
            setText('stat-edits', `${size} edits`);
          },
        });

        window._ironHistory = h;
        h.push('Imagen abierta');

        // Update UI status
        setText('file-name', file.name.slice(0, 30));
        setText('file-meta', `${width} × ${height} px · ${(file.size / 1024 / 1024).toFixed(1)} MB`);
        setText('stat-dims', `${width} × ${height}`);

        // Export info
        exportMgr.updateInfo();

        // Show canvas area
        document.getElementById('drop-zone').classList.add('hidden');
        document.getElementById('canvas-container').style.display = '';

        toast.show(`✓ ${file.name} cargado`, 'success');

      } catch (err) {
        console.error('[App] loadFile error:', err);
        toast.show('Error al cargar la imagen', 'error');
      }
    },
  });
}

/* ================================================================
   TOOL BUTTONS
================================================================ */

function createToolButtons(engine, history) {
  // Left sidebar tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      activateTool(tool, engine);

      if (tool === 'crop') {
        showCropPanel(engine, history);
      }
    });
  });

  // Rotate / flip
  document.getElementById('tool-rotate-cw')?.addEventListener('click', () => {
    engine.rotateCW(); history.push('Rotar 90° derecha');
  });
  document.getElementById('tool-rotate-ccw')?.addEventListener('click', () => {
    engine.rotateCCW(); history.push('Rotar 90° izquierda');
  });
  document.getElementById('tool-flip-h')?.addEventListener('click', () => {
    engine.flipH(); history.push('Voltear horizontal');
  });
  document.getElementById('tool-flip-v')?.addEventListener('click', () => {
    engine.flipV(); history.push('Voltear vertical');
  });

  // Guide toggles
  document.getElementById('tool-thirds')?.addEventListener('click', (e) => {
    state.showThirds = !state.showThirds;
    e.currentTarget.classList.toggle('on', state.showThirds);
    engine.setShowThirds(state.showThirds);
  });
  document.getElementById('tool-guides')?.addEventListener('click', (e) => {
    state.showGuides = !state.showGuides;
    e.currentTarget.classList.toggle('on', state.showGuides);
    engine.setShowGuides(state.showGuides);
  });
  document.getElementById('tool-ruler')?.addEventListener('click', (e) => {
    state.showRulers = !state.showRulers;
    e.currentTarget.classList.toggle('on', state.showRulers);
    engine.setShowRulers(state.showRulers);
  });

  // Crop panel actions
  document.getElementById('btn-crop-apply')?.addEventListener('click', async () => {
    await engine.applyCrop();
    hideCropPanel();
    activateTool('select', engine);
    history.push('Recortar');
  });

  document.getElementById('btn-crop-cancel')?.addEventListener('click', () => {
    engine.cancelCrop();
    hideCropPanel();
    activateTool('select', engine);
  });

  // Crop ratio buttons
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const ratio = btn.dataset.ratio;
      if (ratio === 'free') {
        engine.setCropRatio(null);
      } else {
        const [w, h] = ratio.split(':').map(Number);
        engine.setCropRatio(w / h);
      }
    });
  });

  // Straighten slider
  document.getElementById('sl-straighten')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    setText('v-straighten', val.toFixed(1) + '°');
    engine.setStraighten(val);
  });
}

/* ================================================================
   COMPARE / BEFORE-AFTER BUTTONS
================================================================ */

function createCompareButtons(engine) {
  const btnCompare = document.getElementById('btn-compare');
  const btnBA      = document.getElementById('btn-before-after');

  btnCompare?.addEventListener('click', () => {
    state.compareMode = !state.compareMode;
    if (state.compareMode) state.baMode = false;
    engine.setCompareMode(state.compareMode);
    engine.setBAMode(false);
    btnCompare.classList.toggle('active', state.compareMode);
    btnBA?.classList.remove('active');

    // BA slider
    document.getElementById('ba-slider')?.classList.toggle('hidden', !state.baMode);
  });

  btnBA?.addEventListener('click', () => {
    state.baMode = !state.baMode;
    if (state.baMode) state.compareMode = false;
    engine.setBAMode(state.baMode);
    engine.setCompareMode(false);
    btnBA.classList.toggle('active', state.baMode);
    btnCompare?.classList.remove('active');

    const baSlider = document.getElementById('ba-slider');
    baSlider?.classList.toggle('hidden', !state.baMode);
    if (state.baMode) initBASlider(engine);
  });
}

function initBASlider(engine) {
  const slider = document.getElementById('ba-slider');
  const line   = slider?.querySelector('.ba-line');
  const handle = slider?.querySelector('.ba-handle');
  if (!slider || !line || !handle) return;

  let dragging = false;

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = slider.getBoundingClientRect();
    const pos  = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0.05, Math.min(0.95, pos));
    engine.setBAPosition(clamped);
    const pct = (clamped * 100).toFixed(1) + '%';
    line.style.left   = pct;
    handle.style.left = pct;
  });

  handle.addEventListener('pointerup', () => { dragging = false; });
}

/* ================================================================
   ZOOM BUTTONS
================================================================ */

function createZoomButtons(engine) {
  document.getElementById('btn-zoom-in')?.addEventListener('click',  () => engine.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => engine.zoomOut());
  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => engine.zoomFit());
  document.getElementById('zoom-display')?.addEventListener('click', () => engine.zoom100());
}

/* ================================================================
   UNDO/REDO BUTTONS
================================================================ */

function bindUndoRedoButtons(history) {
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    if (window._ironHistory) window._ironHistory.undo();
    else history.undo();
  });
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    if (window._ironHistory) window._ironHistory.redo();
    else history.redo();
  });
}

/* ================================================================
   HEADER NEW IMAGE
================================================================ */

function bindHeaderNewImage() {
  document.getElementById('btn-new-image')?.addEventListener('click', () => {
    document.getElementById('file-input')?.click();
  });
}

/* ================================================================
   PANEL CHANGE HANDLER
================================================================ */

function onPanelChange(panelId) {
  // Nothing extra needed — PanelManager handles show/hide
}

/* ================================================================
   HELPERS
================================================================ */

function activateTool(tool, engine) {
  state.activeTool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  engine.setTool(tool);
  setText('status-tool', toolName(tool));
}

function toolName(tool) {
  const names = { select: 'Seleccionar', crop: 'Recortar', text: 'Texto',
    heal: 'Parche', gradient: 'Degradado', eye_dropper: 'Cuentagotas', measure: 'Medir' };
  return names[tool] || tool;
}

function toggleCompare(engine) {
  document.getElementById('btn-compare')?.click();
}

function toggleBA(engine) {
  document.getElementById('btn-before-after')?.click();
}

function showCropPanel(engine, history) {
  document.getElementById('crop-panel')?.classList.remove('hidden');
  engine.startCrop();
}

function hideCropPanel() {
  document.getElementById('crop-panel')?.classList.add('hidden');
}

/* ================================================================
   START
================================================================ */

boot().catch(err => console.error('[IRONFILTER PRO] Boot error:', err));
