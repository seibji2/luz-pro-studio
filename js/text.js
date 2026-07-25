/**
 * IRONFILTER PRO — text.js
 * Multi-layer text system with full styling support.
 * Manages text layers, selection, drag/resize/rotate on canvas.
 */

import { uid, clamp, getRelativePointer, degToRad, radToDeg } from './utils.js';

/* ================================================================
   TEXT LAYER DEFAULTS
================================================================ */

/**
 * Create a new text layer with defaults.
 * @param {Partial<TextLayer>} overrides
 * @returns {TextLayer}
 */
export function createTextLayer(overrides = {}) {
  return {
    id:          uid('text'),
    content:     'TU TEXTO',
    visible:     true,
    locked:      false,

    // Position (in image space)
    x:           100,
    y:           100,

    // Typography
    fontFamily:  "'Barlow Condensed', Impact, sans-serif",
    fontWeight:  '900',
    fontStyle:   'normal',
    fontSize:    80,
    letterSpacing: 2,
    lineHeight:  1.15,
    textAlign:   'left',
    caps:        true,

    // Colors
    color:       '#ffffff',
    color2:      '#f5c400',

    // Transform
    rotation:    0,
    scaleX:      1,
    scaleY:      1,
    opacity:     100,

    // Blend
    blendMode:   'source-over',

    // Gradient
    gradient:    false,

    // Shadow
    shadow: {
      active:  true,
      color:   'rgba(0,0,0,0.8)',
      blur:    10,
      offsetX: 3,
      offsetY: 3,
    },

    // Stroke
    stroke: {
      active: false,
      color:  '#000000',
      width:  2,
    },

    // Background
    background: {
      active:  false,
      color:   '#000000',
      opacity: 80,
    },

    // Overlay gradient behind all text
    overlayGradient: false,

    ...overrides,
  };
}

/* ================================================================
   FITNESS PRESET TEXTS
================================================================ */

export const FITNESS_TEXT_PRESETS = [
  {
    id: 'be-stronger',
    name: 'Be Stronger',
    layers: [
      createTextLayer({ content: 'BE STRONGER', fontSize: 100, y: 60, color: '#ffffff', caps: true }),
      createTextLayer({ content: 'THAN YOUR EXCUSES', fontSize: 70, y: 175, color: '#f5c400', caps: true }),
      createTextLayer({ content: 'YOUR BODY. YOUR CHOICE.', fontSize: 28, y: 270, color: 'rgba(255,255,255,0.65)', caps: true }),
    ]
  },
  {
    id: 'no-pain',
    name: 'No Pain No Gain',
    layers: [
      createTextLayer({ content: 'NO PAIN', fontSize: 110, y: 50, color: '#e02020', caps: true }),
      createTextLayer({ content: 'NO GAIN', fontSize: 110, y: 170, color: '#ffffff', caps: true }),
    ]
  },
  {
    id: 'pr-breaker',
    name: 'PR Breaker',
    layers: [
      createTextLayer({ content: 'NEW', fontSize: 55, y: 40, color: '#f5c400', caps: true }),
      createTextLayer({ content: 'PERSONAL', fontSize: 95, y: 105, color: '#ffffff', caps: true }),
      createTextLayer({ content: 'RECORD', fontSize: 95, y: 205, color: '#ffffff', caps: true }),
      createTextLayer({ content: '🏆', fontSize: 60, y: 310, caps: false }),
    ]
  },
];

/* ================================================================
   TEXT MANAGER
================================================================ */

export class TextManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.layerListEl     - DOM container for layer list
   * @param {HTMLElement} opts.editorSectionEl - DOM section for editing fields
   * @param {Function}    opts.onLayersChange  - (layers) => void
   */
  constructor({ layerListEl, editorSectionEl, onLayersChange }) {
    /** @type {TextLayer[]} */
    this._layers     = [];
    this._selectedId = null;

    this._listEl     = layerListEl;
    this._editorEl   = editorSectionEl;
    this._onChange   = onLayersChange || (() => {});

    this._bindEditorEvents();
  }

  /* ── PUBLIC API ── */

  /** Add a new text layer. */
  addLayer(overrides = {}) {
    const layer = createTextLayer({
      x: 80,
      y: 80 + this._layers.length * 100,
      ...overrides,
    });
    this._layers.push(layer);
    this._select(layer.id);
    this._renderList();
    this._notifyChange();
    return layer;
  }

  /** Add layers from a preset. */
  applyPreset(preset) {
    this._layers = preset.layers.map(l => ({ ...l, id: uid('text') }));
    if (this._layers.length > 0) this._select(this._layers[0].id);
    this._renderList();
    this._notifyChange();
  }

  /** Remove a layer by ID. */
  removeLayer(id) {
    this._layers = this._layers.filter(l => l.id !== id);
    if (this._selectedId === id) {
      this._selectedId = this._layers.length > 0 ? this._layers[0].id : null;
    }
    this._renderList();
    this._syncEditorToSelected();
    this._notifyChange();
  }

  /** Duplicate the selected layer. */
  duplicateSelected() {
    const layer = this._getSelected();
    if (!layer) return;
    const dupe = { ...layer, id: uid('text'), x: layer.x + 20, y: layer.y + 20 };
    this._layers.push(dupe);
    this._select(dupe.id);
    this._renderList();
    this._notifyChange();
  }

  /** Toggle layer visibility. */
  toggleVisibility(id) {
    const layer = this._getById(id);
    if (!layer) return;
    layer.visible = !layer.visible;
    this._renderList();
    this._notifyChange();
  }

  /** Move layer in z-order. */
  moveLayerUp(id) {
    const idx = this._layers.findIndex(l => l.id === id);
    if (idx > 0) {
      [this._layers[idx - 1], this._layers[idx]] = [this._layers[idx], this._layers[idx - 1]];
      this._renderList();
      this._notifyChange();
    }
  }

  moveLayerDown(id) {
    const idx = this._layers.findIndex(l => l.id === id);
    if (idx < this._layers.length - 1) {
      [this._layers[idx], this._layers[idx + 1]] = [this._layers[idx + 1], this._layers[idx]];
      this._renderList();
      this._notifyChange();
    }
  }

  /** Update position of a layer (from canvas drag). */
  updatePosition(id, x, y) {
    const layer = this._getById(id);
    if (!layer) return;
    layer.x = Math.round(x);
    layer.y = Math.round(y);
    this._notifyChange();
  }

  /** Update rotation of a layer. */
  updateRotation(id, deg) {
    const layer = this._getById(id);
    if (!layer) return;
    layer.rotation = Math.round(deg);
    this._syncEditorToSelected();
    this._notifyChange();
  }

  /** Select a layer by ID. */
  selectLayer(id) {
    this._select(id);
    this._renderList();
    this._syncEditorToSelected();
  }

  /** Deselect all layers. */
  deselect() {
    this._selectedId = null;
    this._renderList();
    this._hideEditor();
  }

  /** Clear all layers. */
  clear() {
    this._layers     = [];
    this._selectedId = null;
    this._renderList();
    this._hideEditor();
    this._notifyChange();
  }

  /** @returns {TextLayer[]} All layers (copy). */
  get layers() { return [...this._layers]; }

  /** @returns {TextLayer|null} Selected layer. */
  get selected() { return this._getSelected(); }

  /** @returns {string|null} Selected layer ID. */
  get selectedId() { return this._selectedId; }

  /* ── HIT TESTING (canvas interaction) ── */

  /**
   * Find the topmost layer at image coordinates (x, y).
   * @param {number} x
   * @param {number} y
   * @param {CanvasRenderingContext2D} ctx
   * @returns {TextLayer|null}
   */
  hitTest(x, y, ctx) {
    // Test in reverse order (top layer first)
    for (let i = this._layers.length - 1; i >= 0; i--) {
      const layer = this._layers[i];
      if (!layer.visible) continue;

      // Simple bounding box test (approximate)
      const size    = layer.fontSize || 80;
      const lines   = (layer.content || '').split('\n');
      const maxLine = Math.max(...lines.map(l => l.length));
      const approxW = maxLine * size * 0.55;
      const approxH = lines.length * size * (layer.lineHeight || 1.2);

      // Account for rotation
      const dx  = x - layer.x;
      const dy  = y - layer.y;
      const rad = -degToRad(layer.rotation || 0);
      const rx  = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry  = dx * Math.sin(rad) + dy * Math.cos(rad);

      if (rx >= -20 && rx <= approxW + 20 && ry >= -size && ry <= approxH + 20) {
        return layer;
      }
    }
    return null;
  }

  /* ── PRIVATE: LAYER MANAGEMENT ── */

  _getById(id) {
    return this._layers.find(l => l.id === id) || null;
  }

  _getSelected() {
    return this._selectedId ? this._getById(this._selectedId) : null;
  }

  _select(id) {
    this._selectedId = id;
    this._syncEditorToSelected();
    this._showEditor();
  }

  _notifyChange() {
    this._onChange([...this._layers]);
  }

  /* ── PRIVATE: LIST RENDERING ── */

  _renderList() {
    if (!this._listEl) return;

    if (this._layers.length === 0) {
      this._listEl.innerHTML =
        '<div class="text-layers-empty">Sin capas de texto.<br>Haz clic en + para añadir.</div>';
      return;
    }

    this._listEl.innerHTML = '';

    // Render in reverse order (top layer first in UI)
    [...this._layers].reverse().forEach(layer => {
      const item = document.createElement('div');
      item.className = 'text-layer-item' + (layer.id === this._selectedId ? ' active' : '');
      item.dataset.id = layer.id;

      const preview = document.createElement('div');
      preview.className = 'text-layer-preview';
      preview.textContent = (layer.caps ? layer.content.toUpperCase() : layer.content).slice(0, 20);

      const visBtn = document.createElement('button');
      visBtn.className    = 'text-layer-visibility';
      visBtn.textContent  = layer.visible ? '👁' : '🙈';
      visBtn.title        = layer.visible ? 'Ocultar capa' : 'Mostrar capa';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleVisibility(layer.id);
      });

      item.appendChild(preview);
      item.appendChild(visBtn);

      item.addEventListener('click', () => {
        this._select(layer.id);
        this._renderList();
      });

      this._listEl.appendChild(item);
    });
  }

  /* ── PRIVATE: EDITOR ── */

  _showEditor() {
    if (this._editorEl) this._editorEl.style.display = '';
  }

  _hideEditor() {
    if (this._editorEl) this._editorEl.style.display = 'none';
  }

  /**
   * Sync all editor fields to the currently selected layer.
   */
  _syncEditorToSelected() {
    const layer = this._getSelected();
    if (!layer) { this._hideEditor(); return; }
    this._showEditor();

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val ?? '';
    };

    set('txt-content',       layer.content);
    set('txt-font',          layer.fontFamily);
    set('txt-size',          layer.fontSize);
    set('txt-color',         layer.color);
    set('txt-color2',        layer.color2);
    set('txt-spacing',       layer.letterSpacing);
    set('txt-leading',       layer.lineHeight);
    set('txt-opacity',       layer.opacity);
    set('txt-rotation',      layer.rotation);
    set('txt-blend',         layer.blendMode);
    set('txt-shadow-on',     layer.shadow?.active);
    set('txt-shadow-blur',   layer.shadow?.blur ?? 10);
    set('txt-shadow-x',      layer.shadow?.offsetX ?? 3);
    set('txt-shadow-y',      layer.shadow?.offsetY ?? 3);
    set('txt-shadow-color',  this._rgbaToHex(layer.shadow?.color || '#000000'));
    set('txt-stroke-on',     layer.stroke?.active);
    set('txt-stroke-width',  layer.stroke?.width ?? 2);
    set('txt-stroke-color',  layer.stroke?.color ?? '#000000');
    set('txt-bg-on',         layer.background?.active);
    set('txt-bg-opacity',    layer.background?.opacity ?? 80);
    set('txt-bg-color',      layer.background?.color ?? '#000000');
    set('txt-gradient-on',   layer.gradient);
    set('txt-overlay-gradient', layer.overlayGradient);

    // Style buttons
    this._updateStyleBtn('txt-bold',   layer.fontWeight === '900' || layer.fontWeight === 'bold');
    this._updateStyleBtn('txt-italic', layer.fontStyle === 'italic');
    this._updateStyleBtn('txt-caps',   layer.caps);

    // Alignment
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === layer.textAlign);
    });

    // Value labels
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setVal('v-txt-spacing',  layer.letterSpacing);
    setVal('v-txt-leading',  layer.lineHeight);
    setVal('v-txt-opacity',  layer.opacity + '%');
    setVal('v-txt-rotation', layer.rotation + '°');
    setVal('v-shadow-blur',  layer.shadow?.blur ?? 10);
    setVal('v-shadow-x',     layer.shadow?.offsetX ?? 3);
    setVal('v-shadow-y',     layer.shadow?.offsetY ?? 3);
    setVal('v-stroke-width', layer.stroke?.width ?? 2);
    setVal('v-bg-opacity',   (layer.background?.opacity ?? 80) + '%');
  }

  _updateStyleBtn(id, active) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', active);
  }

  _rgbaToHex(rgba) {
    if (!rgba || rgba.startsWith('#')) return rgba || '#000000';
    const m = rgba.match(/[\d.]+/g);
    if (!m || m.length < 3) return '#000000';
    const r = parseInt(m[0]).toString(16).padStart(2, '0');
    const g = parseInt(m[1]).toString(16).padStart(2, '0');
    const b = parseInt(m[2]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  /* ── PRIVATE: EDITOR EVENTS ── */

  /**
   * Bind all text editor input events.
   * Each event reads from the DOM and writes to the selected layer.
   */
  _bindEditorEvents() {
    const on = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    const update = (prop, getValue) => {
      const layer = this._getSelected();
      if (!layer) return;
      const val = getValue();
      // Support nested props (e.g. 'shadow.blur')
      const parts = prop.split('.');
      if (parts.length === 1) {
        layer[prop] = val;
      } else {
        let obj = layer;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) return;
        }
        obj[parts[parts.length - 1]] = val;
      }
      this._notifyChange();
    };

    // Content
    on('txt-content', 'input', () => {
      update('content', () => document.getElementById('txt-content').value);
      this._renderList();
    });

    // Font
    on('txt-font', 'change', () =>
      update('fontFamily', () => document.getElementById('txt-font').value));

    // Size
    on('txt-size', 'input', () => {
      const val = parseInt(document.getElementById('txt-size').value) || 80;
      update('fontSize', () => clamp(val, 8, 500));
    });

    // Size steppers
    on('txt-size-down', 'click', () => {
      const layer = this._getSelected();
      if (!layer) return;
      layer.fontSize = Math.max(8, layer.fontSize - 6);
      const el = document.getElementById('txt-size');
      if (el) el.value = layer.fontSize;
      this._notifyChange();
    });

    on('txt-size-up', 'click', () => {
      const layer = this._getSelected();
      if (!layer) return;
      layer.fontSize = Math.min(500, layer.fontSize + 6);
      const el = document.getElementById('txt-size');
      if (el) el.value = layer.fontSize;
      this._notifyChange();
    });

    // Style buttons
    on('txt-bold', 'click', () => {
      const layer = this._getSelected();
      if (!layer) return;
      const isBold = layer.fontWeight === '900';
      layer.fontWeight = isBold ? '400' : '900';
      document.getElementById('txt-bold').classList.toggle('active', !isBold);
      this._notifyChange();
    });

    on('txt-italic', 'click', () => {
      const layer = this._getSelected();
      if (!layer) return;
      const isItalic = layer.fontStyle === 'italic';
      layer.fontStyle = isItalic ? 'normal' : 'italic';
      document.getElementById('txt-italic').classList.toggle('active', !isItalic);
      this._notifyChange();
    });

    on('txt-caps', 'click', () => {
      const layer = this._getSelected();
      if (!layer) return;
      layer.caps = !layer.caps;
      document.getElementById('txt-caps').classList.toggle('active', layer.caps);
      this._renderList();
      this._notifyChange();
    });

    // Alignment
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = this._getSelected();
        if (!layer) return;
        layer.textAlign = btn.dataset.align;
        document.querySelectorAll('[data-align]').forEach(b =>
          b.classList.toggle('active', b.dataset.align === btn.dataset.align));
        this._notifyChange();
      });
    });

    // Colors
    on('txt-color',  'input', () => update('color',  () => document.getElementById('txt-color').value));
    on('txt-color2', 'input', () => update('color2', () => document.getElementById('txt-color2').value));

    // Sliders with value display
    const bindSlider = (id, prop, displayId, suffix = '', transform = v => v) => {
      on(id, 'input', () => {
        const raw = document.getElementById(id).value;
        const val = transform(parseFloat(raw));
        update(prop, () => val);
        const disp = document.getElementById(displayId);
        if (disp) disp.textContent = val + suffix;
      });
    };

    bindSlider('txt-spacing',  'letterSpacing',   'v-txt-spacing');
    bindSlider('txt-leading',  'lineHeight',       'v-txt-leading', '',  v => parseFloat(v.toFixed(1)));
    bindSlider('txt-opacity',  'opacity',          'v-txt-opacity',  '%');
    bindSlider('txt-rotation', 'rotation',         'v-txt-rotation', '°', v => Math.round(v));

    // Blend mode
    on('txt-blend', 'change', () =>
      update('blendMode', () => document.getElementById('txt-blend').value));

    // Shadow
    on('txt-shadow-on', 'change', () =>
      update('shadow.active', () => document.getElementById('txt-shadow-on').checked));
    bindSlider('txt-shadow-blur', 'shadow.blur',    'v-shadow-blur', '', v => Math.round(v));
    bindSlider('txt-shadow-x',   'shadow.offsetX', 'v-shadow-x',   '', v => Math.round(v));
    bindSlider('txt-shadow-y',   'shadow.offsetY', 'v-shadow-y',   '', v => Math.round(v));
    on('txt-shadow-color', 'input', () =>
      update('shadow.color', () => document.getElementById('txt-shadow-color').value));

    // Stroke
    on('txt-stroke-on', 'change', () =>
      update('stroke.active', () => document.getElementById('txt-stroke-on').checked));
    bindSlider('txt-stroke-width', 'stroke.width', 'v-stroke-width', '', v => Math.round(v));
    on('txt-stroke-color', 'input', () =>
      update('stroke.color', () => document.getElementById('txt-stroke-color').value));

    // Background
    on('txt-bg-on', 'change', () =>
      update('background.active', () => document.getElementById('txt-bg-on').checked));
    bindSlider('txt-bg-opacity', 'background.opacity', 'v-bg-opacity', '%', v => Math.round(v));
    on('txt-bg-color', 'input', () =>
      update('background.color', () => document.getElementById('txt-bg-color').value));

    // Gradient & overlay
    on('txt-gradient-on', 'change', () =>
      update('gradient', () => document.getElementById('txt-gradient-on').checked));
    on('txt-overlay-gradient', 'change', () =>
      update('overlayGradient', () => document.getElementById('txt-overlay-gradient').checked));

    // Delete / Duplicate
    on('btn-delete-text', 'click', () => {
      if (this._selectedId) this.removeLayer(this._selectedId);
    });

    on('btn-duplicate-text', 'click', () => this.duplicateSelected());

    on('btn-add-text', 'click', () => this.addLayer());
  }
}
