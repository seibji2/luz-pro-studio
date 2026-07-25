/**
 * IRONFILTER PRO — ui.js
 * UI controller: panels, tabs, filter grid, curves canvas,
 * toast system, context menu, keyboard shortcuts, loader.
 * Decoupled from business logic — calls callbacks only.
 */

import { $, $$, setText, debounce, rafThrottle, buildCurveTable } from './utils.js';
import { FILTERS, CATEGORIES, getFiltersByCategory } from './filters.js';
import { computeHistogram, drawHistogram } from './adjustments.js';

/* ================================================================
   TOAST
================================================================ */

export class ToastSystem {
  constructor() {
    this._container = document.getElementById('toast-container');
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'} [type='info']
   * @param {number} [duration=2500]
   */
  show(message, type = 'info', duration = 2500) {
    if (!this._container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;

    this._container.appendChild(el);

    requestAnimationFrame(() => el.classList.add('show'));

    setTimeout(() => {
      el.classList.add('hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
}

/* ================================================================
   LOADER
================================================================ */

export class Loader {
  constructor() {
    this._el     = document.getElementById('app-loader');
    this._bar    = document.getElementById('loader-bar');
    this._status = document.getElementById('loader-status');
    this._app    = document.getElementById('app');
  }

  /**
   * Update loader progress.
   * @param {number} pct - [0..100]
   * @param {string} [message]
   */
  progress(pct, message) {
    if (this._bar)    this._bar.style.width = `${pct}%`;
    if (this._status && message) this._status.textContent = message;
  }

  /** Hide loader and show app. */
  hide() {
    if (!this._el) return;
    this._el.style.opacity = '0';
    this._el.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      this._el.style.display = 'none';
      if (this._app) this._app.classList.remove('hidden');
    }, 400);
  }
}

/* ================================================================
   CONTEXT MENU
================================================================ */

export class ContextMenu {
  /**
   * @param {object} actions - { undo, redo, copy, download, 'zoom-fit', 'zoom-100', 'flip-h', 'flip-v' }
   */
  constructor(actions) {
    this._el      = document.getElementById('context-menu');
    this._actions = actions || {};
    this._bind();
  }

  _bind() {
    if (!this._el) return;

    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._show(e.clientX, e.clientY);
    });

    document.addEventListener('click', () => this._hide());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hide();
    });

    this._el.querySelectorAll('.ctx-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (this._actions[action]) this._actions[action]();
        this._hide();
      });
    });
  }

  _show(x, y) {
    if (!this._el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 220, mh = 280;

    this._el.style.left = `${Math.min(x, vw - mw - 10)}px`;
    this._el.style.top  = `${Math.min(y, vh - mh - 10)}px`;
    this._el.classList.remove('hidden');
  }

  _hide() {
    if (this._el) this._el.classList.add('hidden');
  }

  /** Update disabled state of undo/redo. */
  setUndoState(canUndo, canRedo) {
    const undoBtn = this._el?.querySelector('[data-action="undo"]');
    const redoBtn = this._el?.querySelector('[data-action="redo"]');
    if (undoBtn) undoBtn.style.opacity = canUndo ? '1' : '0.4';
    if (redoBtn) redoBtn.style.opacity = canRedo ? '1' : '0.4';
  }
}

/* ================================================================
   PANEL MANAGER
================================================================ */

export class PanelManager {
  /**
   * @param {Function} onPanelChange - (panelId: string) => void
   */
  constructor(onPanelChange) {
    this._onPanelChange = onPanelChange || (() => {});
    this._activePanel   = 'filters';
    this._bind();
  }

  _bind() {
    $$('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const panelId = tab.dataset.panel;
        this.activate(panelId);
      });
    });
  }

  /**
   * Activate a panel by ID.
   * @param {string} panelId
   */
  activate(panelId) {
    this._activePanel = panelId;

    $$('.panel-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.panel === panelId));

    $$('.panel[data-panel]').forEach(p =>
      p.classList.toggle('hidden', p.dataset.panel !== panelId));

    this._onPanelChange(panelId);
  }

  get active() { return this._activePanel; }
}

/* ================================================================
   FILTER GRID
================================================================ */

export class FilterGrid {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.gridEl       - Container for filter thumbnails
   * @param {HTMLElement} opts.categoryEl   - Container for category buttons
   * @param {HTMLElement} opts.searchEl     - Search input element
   * @param {Function}    opts.onSelect     - (filterId: string) => void
   * @param {Function}    opts.onIntensity  - (value: number [0..1]) => void
   */
  constructor({ gridEl, categoryEl, searchEl, onSelect, onIntensity }) {
    this._gridEl     = gridEl;
    this._categoryEl = categoryEl;
    this._searchEl   = searchEl;
    this._onSelect   = onSelect   || (() => {});
    this._onIntensity= onIntensity|| (() => {});

    this._activeFilter   = 'raw';
    this._activeCategory = 'all';
    this._searchQuery    = '';
    this._sourceImage    = null;

    this._buildGrid();
    this._bindEvents();
  }

  /** Set source image for thumbnail rendering. */
  setSource(imageOrBitmap) {
    this._sourceImage = imageOrBitmap;
    this._renderThumbs();
  }

  /** Set the active filter (highlight in grid). */
  setActiveFilter(id) {
    this._activeFilter = id;
    this._updateActiveState();
  }

  /* ── PRIVATE ── */

  _buildGrid() {
    if (!this._gridEl) return;
    this._gridEl.innerHTML = '';

    const filters = getFiltersByCategory(this._activeCategory, this._searchQuery);

    filters.forEach(filter => {
      const thumb = document.createElement('div');
      thumb.className  = 'filter-thumb' + (filter.id === this._activeFilter ? ' active' : '');
      thumb.dataset.id = filter.id;
      thumb.title      = filter.name;

      const preview = document.createElement('div');
      preview.className = 'filter-preview';

      const canvas  = document.createElement('canvas');
      canvas.id     = `fthumb-${filter.id}`;
      canvas.width  = 74;
      canvas.height = 52;

      // Fill placeholder
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(0, 0, 74, 52);

      preview.appendChild(canvas);

      const label = document.createElement('div');
      label.className   = 'filter-label';
      label.textContent = filter.name;

      thumb.appendChild(preview);
      thumb.appendChild(label);

      thumb.addEventListener('click', () => {
        this._activeFilter = filter.id;
        this._updateActiveState();
        this._onSelect(filter.id);
      });

      this._gridEl.appendChild(thumb);
    });

    // Render thumbs if source exists
    if (this._sourceImage) this._renderThumbs();
  }

  _renderThumbs() {
    if (!this._sourceImage) return;

    const filters = getFiltersByCategory(this._activeCategory, this._searchQuery);

    // Stagger renders to avoid blocking
    filters.forEach((filter, idx) => {
      setTimeout(() => {
        const canvas = document.getElementById(`fthumb-${filter.id}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(this._sourceImage, 0, 0, 74, 52);
        if (filter.id === 'raw') return;
        const imgData = ctx.getImageData(0, 0, 74, 52);
        const result  = filter.apply(imgData);
        ctx.putImageData(result, 0, 0);
      }, idx * 6); // 6ms stagger
    });
  }

  _updateActiveState() {
    $$('.filter-thumb', this._gridEl).forEach(t => {
      t.classList.toggle('active', t.dataset.id === this._activeFilter);
    });
  }

  _bindEvents() {
    // Categories
    if (this._categoryEl) {
      this._categoryEl.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeCategory = btn.dataset.cat;
          this._categoryEl.querySelectorAll('.cat-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.cat === this._activeCategory));
          this._buildGrid();
        });
      });
    }

    // Search
    if (this._searchEl) {
      this._searchEl.addEventListener('input', debounce(() => {
        this._searchQuery = this._searchEl.value;
        this._buildGrid();
      }, 200));
    }

    // Intensity slider
    const slInt = document.getElementById('sl-filter-intensity');
    if (slInt) {
      slInt.addEventListener('input', () => {
        const val = parseInt(slInt.value) / 100;
        setText('v-filter-intensity', slInt.value + '%');
        this._onIntensity(val);
      });
    }
  }
}

/* ================================================================
   ADJUSTMENT SLIDERS
================================================================ */

export class AdjustmentPanel {
  /**
   * @param {object} opts
   * @param {Function} opts.onChange  - (key: string, value: number) => void
   * @param {Function} opts.onCommit  - (label: string) => void  (push to history)
   */
  constructor({ onChange, onCommit }) {
    this._onChange = onChange || (() => {});
    this._onCommit = onCommit || (() => {});
    this._bindSliders();
    this._bindSectionResets();
    this._bindHSL();
    this._bindColorBalance();
  }

  /**
   * Sync all sliders to given adjustment values.
   * @param {AdjustmentState} adj
   */
  sync(adj) {
    const keys = [
      'exposure','brightness','contrast','shadows','highlights','whites','blacks',
      'temperature','tint','saturation','vibrance','hue',
      'clarity','texture','sharpen','blur','grain','vignette'
    ];
    keys.forEach(key => {
      const el   = document.getElementById(`sl-${key}`);
      const disp = document.getElementById(`v-${key}`);
      if (el)   el.value   = adj[key] ?? 0;
      if (disp) disp.textContent = this._formatValue(key, adj[key] ?? 0);
    });
  }

  _formatValue(key, val) {
    if (key === 'hue') return `${Math.round(val)}°`;
    if (['sharpen','blur','grain','vignette'].includes(key)) return Math.round(val);
    return Math.round(val);
  }

  _bindSliders() {
    const keys = [
      'exposure','brightness','contrast','shadows','highlights','whites','blacks',
      'temperature','tint','saturation','vibrance','hue',
      'clarity','texture','sharpen','blur','grain','vignette'
    ];

    keys.forEach(key => {
      const el = document.getElementById(`sl-${key}`);
      if (!el) return;

      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        const disp = document.getElementById(`v-${key}`);
        if (disp) disp.textContent = this._formatValue(key, val);
        this._onChange(key, val);
      });

      // Commit on mouseup / touchend
      const commit = () => this._onCommit(`Ajuste: ${key}`);
      el.addEventListener('mouseup',  commit);
      el.addEventListener('touchend', commit);
    });
  }

  _bindSectionResets() {
    document.querySelectorAll('.section-reset[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.dataset.group;
        const keys = {
          light:  ['exposure','brightness','contrast','shadows','highlights','whites','blacks'],
          color:  ['temperature','tint','saturation','vibrance','hue'],
          detail: ['clarity','texture','sharpen','blur','grain','vignette'],
        }[group] || [];

        keys.forEach(key => {
          const el   = document.getElementById(`sl-${key}`);
          const disp = document.getElementById(`v-${key}`);
          if (el)   { el.value = 0; }
          if (disp) { disp.textContent = 0; }
          this._onChange(key, 0);
        });

        this._onCommit(`Reset: ${group}`);
      });
    });
  }

  _bindHSL() {
    let activeChannel = 'all';

    $$('.hsl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeChannel = tab.dataset.hsl;
        $$('.hsl-tab').forEach(t => t.classList.toggle('active', t.dataset.hsl === activeChannel));
      });
    });

    const sliders = ['sl-hsl-h', 'sl-hsl-s', 'sl-hsl-l'];
    sliders.forEach((slId, idx) => {
      const el = document.getElementById(slId);
      if (!el) return;
      const dispId = ['v-hsl-h', 'v-hsl-s', 'v-hsl-l'][idx];
      const propKey= ['h','s','l'][idx];

      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        const disp = document.getElementById(dispId);
        if (disp) disp.textContent = Math.round(val);
        this._onChange(`hsl.${activeChannel}.${propKey}`, val);
      });

      el.addEventListener('mouseup', () =>
        this._onCommit(`HSL ${activeChannel} ${propKey}`));
    });
  }

  _bindColorBalance() {
    let activeRange = 'shadows';

    $$('.cb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeRange = tab.dataset.range;
        $$('.cb-tab').forEach(t => t.classList.toggle('active', t.dataset.range === activeRange));
      });
    });

    ['sl-cb-cr', 'sl-cb-mg', 'sl-cb-yb'].forEach((slId, idx) => {
      const el = document.getElementById(slId);
      if (!el) return;
      const dispId  = ['v-cb-cr','v-cb-mg','v-cb-yb'][idx];
      const propKey = ['cr','mg','yb'][idx];

      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        const disp = document.getElementById(dispId);
        if (disp) disp.textContent = Math.round(val);
        this._onChange(`colorBalance.${activeRange}.${propKey}`, val);
      });

      el.addEventListener('mouseup', () =>
        this._onCommit(`Color balance ${activeRange}`));
    });
  }
}

/* ================================================================
   CURVES EDITOR
================================================================ */

export class CurvesEditor {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {Function} opts.onChange  - (channel, points) => void
   * @param {Function} opts.onCommit  - () => void
   */
  constructor({ canvas, onChange, onCommit }) {
    this._canvas   = canvas;
    this._onChange = onChange || (() => {});
    this._onCommit = onCommit || (() => {});

    this._channel  = 'rgb';
    this._curves   = {
      rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      r:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      g:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      b:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    };

    this._dragging  = null; // index of dragged point
    this._histogram = null;

    if (canvas) this._bindCanvas();
    this._bindChannelTabs();
    this._bindReset();
    this._draw();
  }

  /**
   * Set histogram data for background display.
   * @param {object} histogram
   */
  setHistogram(histogram) {
    this._histogram = histogram;
    this._draw();
  }

  /**
   * Get current curves state.
   * @returns {object}
   */
  get curves() {
    return {
      rgb: [...this._curves.rgb],
      r:   [...this._curves.r],
      g:   [...this._curves.g],
      b:   [...this._curves.b],
    };
  }

  /**
   * Reset all curves to identity.
   */
  reset() {
    ['rgb','r','g','b'].forEach(ch => {
      this._curves[ch] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    });
    this._draw();
    this._onChange(this._channel, this._curves);
  }

  /**
   * Sync curves from external state.
   * @param {object} curvesState
   */
  sync(curvesState) {
    if (!curvesState) return;
    ['rgb','r','g','b'].forEach(ch => {
      if (curvesState[ch]) this._curves[ch] = [...curvesState[ch]];
    });
    this._draw();
  }

  /* ── PRIVATE ── */

  _bindChannelTabs() {
    $$('.curve-ch-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._channel = tab.dataset.ch;
        $$('.curve-ch-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.ch === this._channel));
        this._draw();
      });
    });
  }

  _bindReset() {
    const btn = document.getElementById('curves-reset');
    if (btn) btn.addEventListener('click', () => { this.reset(); this._onCommit(); });
  }

  _bindCanvas() {
    this._canvas.addEventListener('pointerdown', this._onDown.bind(this));
    this._canvas.addEventListener('pointermove', this._onMove.bind(this));
    this._canvas.addEventListener('pointerup',   this._onUp.bind(this));
    this._canvas.addEventListener('pointerleave',this._onUp.bind(this));
    this._canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._removePoint(this._getCanvasPos(e));
    });
  }

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width,  0, 1),
      y: clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  _hitTestPoint(pos, pts) {
    const hitR = 0.04;
    return pts.findIndex(p =>
      Math.abs(p.x - pos.x) < hitR && Math.abs(p.y - pos.y) < hitR
    );
  }

  _onDown(e) {
    e.preventDefault();
    const pos = this._getCanvasPos(e);
    const pts = this._curves[this._channel];

    const hit = this._hitTestPoint(pos, pts);
    if (hit !== -1) {
      this._dragging = hit;
    } else {
      // Add point
      pts.push({ x: pos.x, y: pos.y });
      pts.sort((a, b) => a.x - b.x);
      this._dragging = pts.findIndex(p => p.x === pos.x && p.y === pos.y);
    }

    this._canvas.setPointerCapture(e.pointerId);
    this._draw();
  }

  _onMove(e) {
    if (this._dragging === null) return;
    const pos = this._getCanvasPos(e);
    const pts = this._curves[this._channel];

    pts[this._dragging].x = clamp(pos.x, 0, 1);
    pts[this._dragging].y = clamp(pos.y, 0, 1);
    pts.sort((a, b) => a.x - b.x);
    this._dragging = pts.findIndex(p => p.x === pts[this._dragging]?.x);

    this._draw();
    this._onChange(this._channel, { ...this._curves });
  }

  _onUp() {
    if (this._dragging !== null) {
      this._dragging = null;
      this._onCommit();
    }
  }

  _removePoint(pos) {
    const pts = this._curves[this._channel];
    if (pts.length <= 2) return;
    const hit = this._hitTestPoint(pos, pts);
    if (hit !== -1 && pts[hit].x !== 0 && pts[hit].x !== 1) {
      pts.splice(hit, 1);
      this._draw();
      this._onChange(this._channel, { ...this._curves });
      this._onCommit();
    }
  }

  _draw() {
    if (!this._canvas) return;
    const canvas = this._canvas;
    const ctx    = canvas.getContext('2d');
    const w      = canvas.width;
    const h      = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h);
      ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4);
      ctx.stroke();
    }

    // Diagonal reference
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Histogram background
    if (this._histogram) {
      ctx.globalAlpha = 0.25;
      const data  = this._histogram.lum;
      const maxV  = Math.max(...data);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * w;
        const y = h - (data[i] / maxV) * h * 0.9;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw curves for all channels (dim)
    const dimColors = { r: 'rgba(255,60,60,0.25)', g: 'rgba(60,200,60,0.25)', b: 'rgba(60,100,255,0.25)' };
    if (this._channel === 'rgb') {
      ['r','g','b'].forEach(ch => {
        this._drawCurve(ctx, this._curves[ch], w, h, dimColors[ch], 1);
      });
    }

    // Active curve
    const activeColors = { rgb: '#ffffff', r: '#ff4444', g: '#44ff44', b: '#4488ff' };
    this._drawCurve(ctx, this._curves[this._channel], w, h, activeColors[this._channel], 2.5);

    // Control points
    this._curves[this._channel].forEach((pt, idx) => {
      const cx = pt.x * w;
      const cy = (1 - pt.y) * h;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle   = this._dragging === idx ? '#f5c400' : '#ffffff';
      ctx.strokeStyle = this._dragging === idx ? '#f5c400' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    });
  }

  _drawCurve(ctx, pts, w, h, color, lineWidth) {
    if (pts.length < 2) return;
    const table = buildCurveTable(pts);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineJoin    = 'round';

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = (1 - table[i] / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/* ================================================================
   LEVELS EDITOR
================================================================ */

export class LevelsEditor {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Function} onChange  - (levels) => void
   * @param {Function} onCommit  - () => void
   */
  constructor(canvas, onChange, onCommit) {
    this._canvas   = canvas;
    this._onChange = onChange || (() => {});
    this._onCommit = onCommit || (() => {});
    this._histogram= null;
    this._bindInputs();
  }

  setHistogram(histogram) {
    this._histogram = histogram;
    this._draw();
  }

  _getLevels() {
    return {
      inBlack:  parseInt(document.getElementById('levels-in-black')?.value ?? 0),
      inWhite:  parseInt(document.getElementById('levels-in-white')?.value ?? 255),
      gamma:    parseFloat(document.getElementById('levels-gamma')?.value  ?? 1.0),
      outBlack: parseInt(document.getElementById('levels-out-black')?.value ?? 0),
      outWhite: parseInt(document.getElementById('levels-out-white')?.value ?? 255),
    };
  }

  _bindInputs() {
    ['levels-in-black','levels-in-white','levels-gamma',
     'levels-out-black','levels-out-white'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        this._onChange(this._getLevels());
        this._draw();
      });
      el.addEventListener('change', () => this._onCommit());
    });
  }

  _draw() {
    if (!this._canvas || !this._histogram) return;
    const ctx = this._canvas.getContext('2d');
    const w   = this._canvas.width;
    const h   = this._canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, w, h);

    drawHistogram(this._canvas, this._histogram, 'lum');

    // Input black/white markers
    const levels = this._getLevels();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;

    const drawMarker = (pos255, color) => {
      const x = (pos255 / 255) * w;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.stroke();
    };

    drawMarker(levels.inBlack,  '#6af');
    drawMarker(levels.inWhite,  '#f5c400');
    drawMarker(levels.outBlack, 'rgba(100,180,255,0.5)');
    drawMarker(levels.outWhite, 'rgba(245,196,0,0.5)');
  }
}

/* ================================================================
   KEYBOARD SHORTCUTS
================================================================ */

export class KeyboardShortcuts {
  /**
   * @param {object} handlers - { undo, redo, save, copy, openFile,
   *   zoomIn, zoomOut, zoomFit, zoom100, compare, beforeAfter,
   *   selectTool, textTool, cropTool, flipH, escape, showShortcuts }
   */
  constructor(handlers) {
    this._handlers = handlers || {};
    this._disabled = false;
    this._bind();
  }

  /** Temporarily disable shortcuts (e.g. while typing in inputs). */
  set disabled(val) { this._disabled = val; }

  _bind() {
    document.addEventListener('keydown', (e) => {
      // Don't fire in inputs/textareas
      const tag = e.target.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag) && !['Escape'].includes(e.key)) return;
      if (this._disabled) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const h    = this._handlers;

      switch (true) {
        case ctrl && e.key === 'z' && !e.shiftKey: e.preventDefault(); h.undo?.(); break;
        case ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey)):
          e.preventDefault(); h.redo?.(); break;
        case ctrl && e.key === 's': e.preventDefault(); h.save?.(); break;
        case ctrl && e.key === 'c': h.copy?.(); break;
        case ctrl && e.key === 'v': /* handled by paste event */ break;
        case e.key === 'o' && !ctrl: h.openFile?.(); break;
        case e.key === '+' || e.key === '=': h.zoomIn?.(); break;
        case e.key === '-': h.zoomOut?.(); break;
        case e.key.toLowerCase() === 'f': h.zoomFit?.(); break;
        case e.key === '1': h.zoom100?.(); break;
        case e.key.toLowerCase() === 'c' && !ctrl: h.compare?.(); break;
        case e.key.toLowerCase() === 'b': h.beforeAfter?.(); break;
        case e.key.toLowerCase() === 'v': h.selectTool?.(); break;
        case e.key.toLowerCase() === 't': h.textTool?.(); break;
        case e.key.toLowerCase() === 'r': h.cropTool?.(); break;
        case e.key.toLowerCase() === 'h': h.flipH?.(); break;
        case e.key === 'Escape': h.escape?.(); break;
        case e.key === '?': h.showShortcuts?.(); break;
      }
    });
  }
}

/* ================================================================
   FILE DROPZONE
================================================================ */

export class FileDropZone {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.stageEl    - The canvas stage element
   * @param {HTMLElement} opts.dropZoneEl - Initial drop zone element
   * @param {HTMLElement} opts.fileInputEl- Hidden file input
   * @param {HTMLButtonElement} opts.openBtnEl - Open button
   * @param {HTMLButtonElement} opts.newImgBtnEl - Header open button
   * @param {Function}  opts.onFile      - (File) => void
   */
  constructor({ stageEl, dropZoneEl, fileInputEl, openBtnEl, newImgBtnEl, onFile }) {
    this._stage    = stageEl;
    this._dropZone = dropZoneEl;
    this._input    = fileInputEl;
    this._onFile   = onFile || (() => {});

    this._bindDrop(stageEl);
    this._bindPaste();

    if (openBtnEl)  openBtnEl.addEventListener('click',  () => fileInputEl?.click());
    if (newImgBtnEl) newImgBtnEl.addEventListener('click', () => fileInputEl?.click());
    if (fileInputEl) {
      fileInputEl.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this._handle(file);
        fileInputEl.value = '';
      });
    }
  }

  _bindDrop(el) {
    if (!el) return;
    el.addEventListener('dragover',  (e) => { e.preventDefault(); el.classList.add('drag-active'); });
    el.addEventListener('dragleave', ()  => el.classList.remove('drag-active'));
    el.addEventListener('drop',      (e) => {
      e.preventDefault();
      el.classList.remove('drag-active');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) this._handle(file);
    });
  }

  _bindPaste() {
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          this._handle(item.getAsFile());
          break;
        }
      }
    });
  }

  _handle(file) {
    if (!file) return;
    if (this._dropZone) this._dropZone.classList.add('hidden');
    this._onFile(file);
  }
}

/* ================================================================
   SHORTCUT MODAL
================================================================ */

export function initShortcutsModal() {
  const modal    = document.getElementById('shortcuts-modal');
  const closeBtn = document.getElementById('shortcuts-close');

  const show = () => modal?.classList.remove('hidden');
  const hide = () => modal?.classList.add('hidden');

  if (closeBtn) closeBtn.addEventListener('click', hide);
  modal?.addEventListener('click', (e) => { if (e.target === modal) hide(); });

  return { show, hide };
}

/* ================================================================
   HELPERS
================================================================ */

/** Simple clamp (local copy to avoid circular deps) */
function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}
