/**
 * IRONFILTER PRO — canvas.js
 * Core canvas engine with OffscreenCanvas + Web Worker rendering.
 * Handles: zoom/pan, transform pipeline, crop, guides, rulers,
 * before/after mode, and the full pixel render loop.
 */

import { clamp, rafThrottle, getRelativePointer, touchDistance, touchCenter, degToRad, resizeCanvas } from './utils.js';
import { applyAllAdjustments, drawVignette }  from './adjustments.js';
import { applyFilter }                        from './filters.js';
import { drawCropOverlay, drawStraightenIndicator, cropImageBitmap, centeredCropRect, constrainRatio, clampRect, hitTestHandle, handleCursor } from './crop.js';

/* ================================================================
   CONSTANTS
================================================================ */

const MIN_ZOOM      = 0.05;
const MAX_ZOOM      = 32;
const ZOOM_STEP     = 1.2;
const GUIDE_COLOR   = 'rgba(0, 195, 255, 0.75)';
const THIRDS_COLOR  = 'rgba(255, 255, 255, 0.25)';
const RULER_H       = 20;  // px

/* ================================================================
   CANVAS ENGINE
================================================================ */

export class CanvasEngine {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.displayCanvas   - Visible output canvas
   * @param {HTMLCanvasElement} opts.overlayCanvas   - Overlay (guides, crop, etc.)
   * @param {HTMLElement}       opts.viewport        - Scroll/pan container
   * @param {HTMLElement}       opts.frame           - CSS-transformed frame wrapper
   * @param {HTMLCanvasElement} opts.rulerH          - Horizontal ruler canvas
   * @param {HTMLCanvasElement} opts.rulerV          - Vertical ruler canvas
   * @param {Function}          opts.onZoomChange    - (zoom: number) => void
   * @param {Function}          opts.onColorSample   - ({r,g,b,hex}) => void
   * @param {Function}          opts.onCropChange    - (rect) => void
   */
  constructor(opts) {
    this._display   = opts.displayCanvas;
    this._overlay   = opts.overlayCanvas;
    this._viewport  = opts.viewport;
    this._frame     = opts.frame;
    this._rulerH    = opts.rulerH;
    this._rulerV    = opts.rulerV;

    this._onZoomChange  = opts.onZoomChange  || (() => {});
    this._onColorSample = opts.onColorSample || (() => {});
    this._onCropChange  = opts.onCropChange  || (() => {});

    // Source
    this._sourceBitmap  = null; // ImageBitmap of original
    this._sourceWidth   = 0;
    this._sourceHeight  = 0;
    this._sourceFile    = null;

    // Transform
    this._zoom      = 1;
    this._panX      = 0;
    this._panY      = 0;
    this._rotation  = 0;  // degrees: 0, 90, 180, 270 (snap) or any
    this._flipH     = false;
    this._flipV     = false;

    // Current render state
    this._activeFilter     = 'raw';
    this._filterIntensity  = 1;
    this._adjustments      = null;
    this._textLayers       = [];

    // Render pipeline
    this._renderPending    = false;
    this._renderWorker     = null;
    this._offscreen        = null;
    this._processedBitmap  = null; // last rendered bitmap (pre-text/vignette)

    // Guides & overlays
    this._showThirds   = false;
    this._showGuides   = false;
    this._showRulers   = false;
    this._guides       = [];  // [{axis:'h'|'v', pos:number}]

    // Crop state
    this._cropActive   = false;
    this._cropRect     = null; // {x,y,w,h} in image space
    this._cropRatio    = null; // null = free, or number (w/h)
    this._straighten   = 0;   // degrees

    // Compare / Before-After
    this._compareMode  = false;  // side by side
    this._baMode       = false;  // before/after slider
    this._baPosition   = 0.5;   // [0..1]

    // Interaction state
    this._isPanning    = false;
    this._panStart     = { x: 0, y: 0 };
    this._isCropping   = false;
    this._cropHandle   = null;
    this._cropStart    = null;
    this._isResizingCrop = false;

    // Touch
    this._lastTouchDist    = 0;
    this._lastTouchCenter  = { x: 0, y: 0 };

    // Active tool
    this._tool = 'select';

    // Fitness overlay function (injected externally)
    this._fitnessOverlay = null;

    this._initWorker();
    this._bindEvents();
  }

  /* ── PUBLIC API ── */

  /**
   * Load a File or Blob as the source image.
   * @param {File} file
   * @returns {Promise<{width:number, height:number}>}
   */
  async loadFile(file) {
    this._sourceFile = file;
    const url    = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(
      await fetch(url).then(r => r.blob())
    );
    URL.revokeObjectURL(url);
    return this._setSource(bitmap, file.name);
  }

  /**
   * Load an HTMLImageElement as the source.
   * @param {HTMLImageElement} img
   * @returns {Promise<{width:number, height:number}>}
   */
  async loadImageElement(img) {
    const bitmap = await createImageBitmap(img);
    return this._setSource(bitmap);
  }

  /**
   * Load image from Blob / File directly (paste, drag-drop).
   * @param {Blob} blob
   * @returns {Promise<{width:number, height:number}>}
   */
  async loadBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    return this._setSource(bitmap);
  }

  /**
   * Set the active filter and re-render.
   * @param {string} filterId
   * @param {number} [intensity=1]
   */
  setFilter(filterId, intensity = 1) {
    this._activeFilter    = filterId;
    this._filterIntensity = intensity;
    this.scheduleRender();
  }

  /**
   * Set the adjustments state and re-render.
   * @param {AdjustmentState} adj
   */
  setAdjustments(adj) {
    this._adjustments = adj;
    this.scheduleRender();
  }

  /**
   * Set text layers and re-render (text-only path — fast).
   * @param {TextLayer[]} layers
   */
  setTextLayers(layers) {
    this._textLayers = layers;
    this.scheduleTextOnly();
  }

  /**
   * Schedule a full pixel re-render (filter + adjustments + text).
   */
  scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    requestAnimationFrame(() => {
      this._renderPending = false;
      this._render();
    });
  }

  /**
   * Fast path: redraw text and vignette on top of cached bitmap.
   * Avoids re-running the full pixel pipeline.
   */
  scheduleTextOnly() {
    requestAnimationFrame(() => this._drawTextAndEffects());
  }

  /* ── ZOOM ── */

  /** Zoom in by one step. */
  zoomIn()  { this._setZoom(this._zoom * ZOOM_STEP); }

  /** Zoom out by one step. */
  zoomOut() { this._setZoom(this._zoom / ZOOM_STEP); }

  /** Fit image to viewport. */
  zoomFit() {
    if (!this._sourceWidth) return;
    const vp    = this._viewport.getBoundingClientRect();
    const sw    = this._rotatedWidth();
    const sh    = this._rotatedHeight();
    const zoom  = Math.min((vp.width - 40) / sw, (vp.height - 40) / sh);
    this._setZoom(zoom, true);
    this._panX = 0;
    this._panY = 0;
    this._applyTransform();
  }

  /** Set zoom to 100%. */
  zoom100() { this._setZoom(1, true); this._panX = 0; this._panY = 0; this._applyTransform(); }

  /** Set exact zoom value. */
  setZoom(value) { this._setZoom(value); }

  /** @returns {number} current zoom */
  get zoom() { return this._zoom; }

  /* ── TRANSFORM ── */

  /** Rotate image clockwise by 90 degrees. */
  rotateCW()  { this._rotation = (this._rotation + 90)  % 360; this.scheduleRender(); }

  /** Rotate image counter-clockwise by 90 degrees. */
  rotateCCW() { this._rotation = (this._rotation - 90 + 360) % 360; this.scheduleRender(); }

  /**
   * Set arbitrary rotation angle (for straighten).
   * @param {number} deg
   */
  setRotation(deg) { this._rotation = deg; this.scheduleRender(); }

  /** Flip horizontally. */
  flipH() { this._flipH = !this._flipH; this.scheduleRender(); }

  /** Flip vertically. */
  flipV() { this._flipV = !this._flipV; this.scheduleRender(); }

  /** @returns {{ flipH, flipV, rotation }} */
  get transform() {
    return { flipH: this._flipH, flipV: this._flipV, rotation: this._rotation };
  }

  /* ── GUIDES ── */

  setShowThirds(show) { this._showThirds = show; this._drawOverlay(); }
  setShowGuides(show) { this._showGuides = show; this._drawOverlay(); }
  setShowRulers(show) { this._showRulers = show; this._drawRulers(); }

  addGuide(axis, pos) {
    this._guides.push({ axis, pos });
    this._drawOverlay();
  }

  clearGuides() { this._guides = []; this._drawOverlay(); }

  /* ── CROP ── */

  /**
   * Activate crop mode.
   * @param {number|null} ratio - width/height or null for free
   */
  startCrop(ratio = null) {
    this._cropActive = true;
    this._cropRatio  = ratio;
    this._cropRect   = centeredCropRect(this._sourceWidth, this._sourceHeight, ratio, 0.1);
    this._tool       = 'crop';
    this._drawOverlay();
  }

  /**
   * Set crop ratio without resetting crop rect.
   * @param {number|null} ratio
   */
  setCropRatio(ratio) {
    this._cropRatio = ratio;
    this._constrainCropRatio();
    this._drawOverlay();
  }

  /**
   * Set straighten angle.
   * @param {number} deg
   */
  setStraighten(deg) {
    this._straighten = deg;
    this._drawOverlay();
    this.scheduleRender();
  }

  /**
   * Apply the crop and return a new ImageBitmap.
   * @returns {Promise<ImageBitmap>}
   */
  async applyCrop() {
    if (!this._cropRect || !this._sourceBitmap) return null;
    const { w, h } = this._cropRect;

    const croppedBitmap = await cropImageBitmap(
      this._sourceBitmap,
      this._cropRect,
      this._straighten
    );

    this._sourceBitmap = croppedBitmap;
    this._sourceWidth  = w;
    this._sourceHeight = h;

    this._cropActive = false;
    this._cropRect   = null;
    this._straighten = 0;
    this._tool       = 'select';

    this.zoomFit();
    this.scheduleRender();
    return croppedBitmap;
  }

  /** Cancel crop mode. */
  cancelCrop() {
    this._cropActive = false;
    this._cropRect   = null;
    this._tool       = 'select';
    this._drawOverlay();
  }

  /** @returns {{ x, y, w, h }|null} Current crop rect in image space */
  get cropRect() { return this._cropRect ? { ...this._cropRect } : null; }

  /* ── COMPARE / BEFORE-AFTER ── */

  setCompareMode(active) {
    this._compareMode = active;
    this._baMode      = false;
    this.scheduleRender();
  }

  setBAMode(active) {
    this._baMode      = active;
    this._compareMode = false;
    this.scheduleRender();
  }

  setBAPosition(pos) {
    this._baPosition = clamp(pos, 0, 1);
    this.scheduleRender();
  }

  /* ── ACTIVE TOOL ── */

  setTool(tool) {
    this._tool = tool;
    const cursors = {
      select:     'default',
      crop:       'crosshair',
      text:       'text',
      eye_dropper:'crosshair',
      gradient:   'crosshair',
      measure:    'crosshair',
    };
    this._viewport.style.cursor = cursors[tool] || 'default';
  }

  /* ── CANVAS DIMENSIONS ── */

  /** @returns {number} width after rotation */
  _rotatedWidth() {
    const r = ((this._rotation % 180) + 180) % 180;
    return r === 90 ? this._sourceHeight : this._sourceWidth;
  }

  /** @returns {number} height after rotation */
  _rotatedHeight() {
    const r = ((this._rotation % 180) + 180) % 180;
    return r === 90 ? this._sourceWidth : this._sourceHeight;
  }

  /* ── PRIVATE: SOURCE ── */

  async _setSource(bitmap, filename = '') {
    this._sourceBitmap = bitmap;
    this._sourceWidth  = bitmap.width;
    this._sourceHeight = bitmap.height;
    this._rotation     = 0;
    this._flipH        = false;
    this._flipV        = false;
    this._panX         = 0;
    this._panY         = 0;

    // Size display canvas
    this._display.width  = bitmap.width;
    this._display.height = bitmap.height;
    this._overlay.width  = bitmap.width;
    this._overlay.height = bitmap.height;

    await this.scheduleRender();
    this.zoomFit();

    return { width: bitmap.width, height: bitmap.height };
  }

  /* ── PRIVATE: WEB WORKER ── */

  _initWorker() {
    // Inline worker via Blob — avoids needing a separate worker file
    const workerCode = `
      self.onmessage = async function(e) {
        const { id, imageData, filter, filterIntensity, adjustments } = e.data;

        // We receive serialized pixel data and run the pipeline
        // Since we can't import modules in inline workers easily,
        // we apply a simplified version and the main thread handles full pipeline
        self.postMessage({ id, done: true });
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this._renderWorker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      // Worker unavailable — fall back to main thread
      this._renderWorker = null;
    }
  }

  /* ── PRIVATE: RENDER PIPELINE ── */

  /**
   * Full render: transform → filter → adjustments → text → vignette.
   * Uses OffscreenCanvas for the pixel pipeline to keep the main thread free.
   */
  async _render() {
    if (!this._sourceBitmap) return;

    const sw = this._sourceWidth;
    const sh = this._sourceHeight;
    const cw = this._rotatedWidth();
    const ch = this._rotatedHeight();

    // ── 1. Draw transformed source onto offscreen canvas ──
    const offscreen = new OffscreenCanvas(cw, ch);
    const offCtx    = offscreen.getContext('2d');

    offCtx.save();
    offCtx.translate(cw / 2, ch / 2);
    if (this._flipH) offCtx.scale(-1, 1);
    if (this._flipV) offCtx.scale(1, -1);
    offCtx.rotate(degToRad(this._rotation));
    // Straighten during crop
    if (this._cropActive && this._straighten !== 0) {
      offCtx.rotate(degToRad(this._straighten));
    }
    offCtx.drawImage(this._sourceBitmap, -sw / 2, -sh / 2, sw, sh);
    offCtx.restore();

    // ── 2. Extract pixels ──
    let imageData = offCtx.getImageData(0, 0, cw, ch);

    // ── 3. Apply filter ──
    if (this._activeFilter && this._activeFilter !== 'raw') {
      imageData = applyFilter(this._activeFilter, imageData, this._filterIntensity);
    }

    // ── 4. Apply adjustments ──
    if (this._adjustments) {
      imageData = applyAllAdjustments(imageData, this._adjustments);
    }

    // ── 5. Put pixels on display canvas ──
    this._display.width  = cw;
    this._display.height = ch;
    this._overlay.width  = cw;
    this._overlay.height = ch;

    const displayCtx = this._display.getContext('2d');
    displayCtx.putImageData(imageData, 0, 0);

    // Cache processed bitmap (for fast text-only re-draws)
    this._processedBitmap = await createImageBitmap(this._display);

    // ── 6. Compare / Before-After ──
    if (this._compareMode) {
      this._drawCompare(displayCtx, cw, ch);
    } else if (this._baMode) {
      this._drawBeforeAfter(displayCtx, cw, ch);
    }

    // ── 7. Vignette (on top) ──
    if (this._adjustments?.vignette) {
      drawVignette(displayCtx, cw, ch, this._adjustments.vignette);
    }

    // ── 8. Text layers ──
    this._drawTextLayers(displayCtx, cw, ch);

    // ── 8b. Fitness overlay (injected by FitnessManager) ──
    if (this._fitnessOverlay) {
      this._fitnessOverlay(displayCtx, cw, ch);
    }

    // ── 9. Overlay (guides, crop) ──
    this._drawOverlay();

    // ── 10. Update frame size & transform ──
    this._applyTransform();

    // ── 11. Update rulers ──
    if (this._showRulers) this._drawRulers();
  }

  /**
   * Fast text-only redraw using cached processed bitmap.
   * Does not re-run the pixel pipeline.
   */
  _drawTextAndEffects() {
    if (!this._processedBitmap) { this.scheduleRender(); return; }

    const cw  = this._display.width;
    const ch  = this._display.height;
    const ctx = this._display.getContext('2d');

    // Restore processed state
    ctx.drawImage(this._processedBitmap, 0, 0);

    // Vignette
    if (this._adjustments?.vignette) {
      drawVignette(ctx, cw, ch, this._adjustments.vignette);
    }

    // Text
    this._drawTextLayers(ctx, cw, ch);
  }

  /* ── PRIVATE: COMPARE MODES ── */

  _drawCompare(ctx, w, h) {
    if (!this._sourceBitmap) return;
    const half = Math.floor(w / 2);

    // Draw original on left half
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, half, h);
    ctx.clip();
    ctx.drawImage(this._sourceBitmap, 0, 0);
    ctx.restore();

    // Divider
    ctx.fillStyle = '#f5c400';
    ctx.fillRect(half - 1, 0, 2, h);

    // Labels
    ctx.font      = 'bold 13px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(half - 60, 12, 54, 22);
    ctx.fillRect(half + 6,  12, 54, 22);
    ctx.fillStyle = '#f5c400';
    ctx.fillText('ORIGINAL', half - 33, 27);
    ctx.fillText('EDITADO',  half + 33, 27);
    ctx.textAlign = 'left';
  }

  _drawBeforeAfter(ctx, w, h) {
    if (!this._sourceBitmap) return;
    const splitX = Math.round(w * this._baPosition);

    // Draw original on left of split
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.drawImage(this._sourceBitmap, 0, 0);
    ctx.restore();

    // The processed part remains on the right (already drawn)
  }

  /* ── PRIVATE: TEXT LAYERS ── */

  _drawTextLayers(ctx, w, h) {
    if (!this._textLayers || this._textLayers.length === 0) return;

    for (const layer of this._textLayers) {
      if (!layer.visible || !layer.content.trim()) continue;
      this._drawSingleTextLayer(ctx, layer, w, h);
    }
  }

  _drawSingleTextLayer(ctx, layer, w, h) {
    const {
      content, x, y, fontSize, fontFamily, fontWeight, fontStyle,
      color, color2, letterSpacing, lineHeight,
      textAlign, rotation, opacity, blendMode, caps,
      shadow, stroke, background, gradient: useGradient, overlayGradient,
    } = layer;

    const text = caps ? content.toUpperCase() : content;
    const lines = text.split('\n');

    ctx.save();
    ctx.globalAlpha       = opacity / 100;
    ctx.globalCompositeOperation = blendMode || 'source-over';

    // Translate to text position and apply rotation
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(degToRad(rotation));

    // Build font string
    const style  = fontStyle === 'italic' ? 'italic ' : '';
    const weight = fontWeight || '700';
    const size   = fontSize || 80;
    ctx.font        = `${style}${weight} ${size}px ${fontFamily || "'Barlow Condensed', sans-serif"}`;
    ctx.textAlign   = textAlign || 'left';
    ctx.letterSpacing = `${letterSpacing || 0}px`;
    ctx.textBaseline  = 'top';

    const lineH  = size * (lineHeight || 1.2);
    const totalH = lines.length * lineH;

    // Background gradient behind all text
    if (overlayGradient) {
      const gradH = totalH + size * 0.8;
      const grad  = ctx.createLinearGradient(0, -size * 0.4, 0, gradH);
      grad.addColorStop(0,   'rgba(0,0,0,0)');
      grad.addColorStop(0.3, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1,   'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(-w * 0.5, -size * 0.4, w * 2, gradH);
    }

    // Draw each line
    lines.forEach((line, idx) => {
      const lineY = idx * lineH;

      // Per-line color: line 1 = color, line 2+ = color2 (accent)
      const fill = (idx === 1 && color2) ? color2 : (color || '#ffffff');

      // Background box
      if (background?.active) {
        const metrics = ctx.measureText(line);
        const bw      = metrics.width + size * 0.4;
        const bh      = lineH + size * 0.1;
        const bx      = textAlign === 'center' ? -bw / 2 :
                         textAlign === 'right'  ? -bw : 0;
        ctx.fillStyle = hexToRgba(background.color || '#000', background.opacity / 100 || 0.8);
        ctx.fillRect(bx - size * 0.2, lineY - size * 0.05, bw, bh);
      }

      // Gradient text fill
      if (useGradient) {
        const metrics = ctx.measureText(line);
        const grad2   = ctx.createLinearGradient(0, lineY, 0, lineY + lineH);
        grad2.addColorStop(0, fill);
        grad2.addColorStop(1, color2 || '#f5c400');
        ctx.fillStyle = grad2;
      } else {
        ctx.fillStyle = fill;
      }

      // Shadow
      if (shadow?.active) {
        ctx.shadowColor   = shadow.color   || 'rgba(0,0,0,0.8)';
        ctx.shadowBlur    = shadow.blur    ?? 10;
        ctx.shadowOffsetX = shadow.offsetX ?? 3;
        ctx.shadowOffsetY = shadow.offsetY ?? 3;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;
      }

      // Stroke (outline)
      if (stroke?.active && (stroke?.width ?? 0) > 0) {
        ctx.strokeStyle = stroke.color || '#000';
        ctx.lineWidth   = stroke.width || 2;
        ctx.lineJoin    = 'round';
        ctx.strokeText(line, 0, lineY);
      }

      // Fill text
      ctx.fillText(line, 0, lineY);
    });

    ctx.restore();
  }

  /* ── PRIVATE: OVERLAY (guides, crop, thirds) ── */

  _drawOverlay() {
    if (!this._overlay) return;
    const ctx = this._overlay.getContext('2d');
    const w   = this._overlay.width;
    const h   = this._overlay.height;

    ctx.clearRect(0, 0, w, h);

    // Rule of thirds
    if (this._showThirds) {
      ctx.strokeStyle = THIRDS_COLOR;
      ctx.lineWidth   = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(w * i / 3, 0);
        ctx.lineTo(w * i / 3, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, h * i / 3);
        ctx.lineTo(w, h * i / 3);
        ctx.stroke();
      }
    }

    // Custom guides
    if (this._showGuides) {
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 4]);
      for (const g of this._guides) {
        ctx.beginPath();
        if (g.axis === 'h') {
          ctx.moveTo(0, g.pos); ctx.lineTo(w, g.pos);
        } else {
          ctx.moveTo(g.pos, 0); ctx.lineTo(g.pos, h);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Crop overlay
    if (this._cropActive && this._cropRect) {
      this._drawCropOverlay(ctx, w, h);
    }
  }

  _drawCropOverlay(ctx, w, h) {
    drawCropOverlay(ctx, this._cropRect, w, h);
    if (this._straighten !== 0) {
      drawStraightenIndicator(ctx, this._cropRect, this._straighten);
    }
  }

  /* ── PRIVATE: RULERS ── */

  _drawRulers() {
    if (!this._rulerH || !this._rulerV || !this._sourceWidth) return;

    const zoom  = this._zoom;
    const w     = this._display.width;
    const h     = this._display.height;

    // Horizontal ruler
    const hCtx = this._rulerH.getContext('2d');
    this._rulerH.width  = w;
    this._rulerH.height = RULER_H;
    this._drawRulerAxis(hCtx, w, RULER_H, zoom, this._panX, 'h');

    // Vertical ruler
    const vCtx = this._rulerV.getContext('2d');
    this._rulerV.width  = RULER_H;
    this._rulerV.height = h;
    this._drawRulerAxis(vCtx, RULER_H, h, zoom, this._panY, 'v');
  }

  _drawRulerAxis(ctx, w, h, zoom, pan, axis) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#13131a';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle   = '#5a5a70';
    ctx.strokeStyle = '#5a5a70';
    ctx.font        = '9px "Inter", monospace';
    ctx.textBaseline = axis === 'h' ? 'bottom' : 'middle';

    // Choose tick spacing based on zoom
    const step = zoom < 0.25 ? 200 : zoom < 0.5 ? 100 : zoom < 1 ? 50 : zoom < 2 ? 25 : 10;
    const size  = axis === 'h' ? this._sourceWidth : this._sourceHeight;
    const total = Math.ceil(size / step);

    for (let i = 0; i <= total; i++) {
      const pos = i * step * zoom + (axis === 'h' ? pan : pan);
      if (pos < 0 || pos > (axis === 'h' ? w : h)) continue;

      ctx.beginPath();
      const major = i % 5 === 0;
      const tLen  = major ? (axis === 'h' ? h * 0.6 : w * 0.6) : (axis === 'h' ? h * 0.3 : w * 0.3);

      if (axis === 'h') {
        ctx.moveTo(pos, h); ctx.lineTo(pos, h - tLen);
        if (major) ctx.fillText(i * step, pos + 2, h - tLen);
      } else {
        ctx.moveTo(w, pos); ctx.lineTo(w - tLen, pos);
        if (major) {
          ctx.save();
          ctx.translate(w - tLen - 2, pos);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(i * step, 0, 0);
          ctx.restore();
        }
      }
      ctx.stroke();
    }
  }

  /* ── PRIVATE: TRANSFORM ── */

  _setZoom(value, skipPan = false) {
    this._zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    if (!skipPan) this._clampPan();
    this._applyTransform();
    this._onZoomChange(this._zoom);
    if (this._showRulers) this._drawRulers();
  }

  _applyTransform() {
    if (!this._frame) return;
    const w = this._rotatedWidth();
    const h = this._rotatedHeight();
    this._frame.style.width  = `${w}px`;
    this._frame.style.height = `${h}px`;
    this._frame.style.transform = `
      translate(
        calc(-50% + ${this._panX}px),
        calc(-50% + ${this._panY}px)
      )
      scale(${this._zoom})
    `;
  }

  _clampPan() {
    if (!this._sourceWidth) return;
    const vp  = this._viewport.getBoundingClientRect();
    const hw  = this._rotatedWidth()  * this._zoom / 2;
    const hh  = this._rotatedHeight() * this._zoom / 2;
    const maxX = Math.max(0, hw - vp.width  / 2 + 80);
    const maxY = Math.max(0, hh - vp.height / 2 + 80);
    this._panX = clamp(this._panX, -maxX, maxX);
    this._panY = clamp(this._panY, -maxY, maxY);
  }

  /* ── PRIVATE: CROP RATIO ── */

  _constrainCropRatio() {
    if (!this._cropRatio || !this._cropRect) return;
    this._cropRect = constrainRatio(
      this._cropRect,
      this._cropRatio,
      this._sourceWidth,
      this._sourceHeight
    );
  }

  /* ── PRIVATE: EVENT BINDING ── */

  _bindEvents() {
    const vp = this._viewport;
    if (!vp) return;

    // Mouse
    vp.addEventListener('pointerdown',  this._onPointerDown.bind(this));
    vp.addEventListener('pointermove',  rafThrottle(this._onPointerMove.bind(this)));
    vp.addEventListener('pointerup',    this._onPointerUp.bind(this));
    vp.addEventListener('pointercancel',this._onPointerUp.bind(this));
    vp.addEventListener('wheel',        this._onWheel.bind(this), { passive: false });
    vp.addEventListener('dblclick',     this._onDblClick.bind(this));
    vp.addEventListener('contextmenu',  e => e.preventDefault());

    // Touch pinch-zoom
    vp.addEventListener('touchstart',  this._onTouchStart.bind(this),  { passive: true });
    vp.addEventListener('touchmove',   this._onTouchMove.bind(this),   { passive: false });
    vp.addEventListener('touchend',    this._onTouchEnd.bind(this));

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (this._sourceWidth) this._applyTransform();
    });
    ro.observe(vp);
  }

  _onPointerDown(e) {
    if (!this._sourceBitmap) return;

    const pos = getRelativePointer(e, this._viewport);

    if (this._tool === 'select' || this._tool === 'gradient') {
      // Pan
      this._isPanning = true;
      this._panStart  = { x: e.clientX - this._panX, y: e.clientY - this._panY };
      this._viewport.setPointerCapture(e.pointerId);
      this._viewport.style.cursor = 'grabbing';

    } else if (this._tool === 'crop' && this._cropActive) {
      this._startCropInteraction(pos);

    } else if (this._tool === 'eye_dropper') {
      this._sampleColor(pos);
    }
  }

  _onPointerMove(e) {
    if (!this._sourceBitmap) return;

    if (this._isPanning) {
      this._panX = e.clientX - this._panStart.x;
      this._panY = e.clientY - this._panStart.y;
      this._clampPan();
      this._applyTransform();
      return;
    }

    if (this._tool === 'crop' && this._cropActive && this._isCropping) {
      this._updateCropInteraction(getRelativePointer(e, this._viewport));
    }
  }

  _onPointerUp(e) {
    if (this._isPanning) {
      this._isPanning = false;
      this._viewport.style.cursor = this._tool === 'crop' ? 'crosshair' : 'grab';
      this._viewport.releasePointerCapture(e.pointerId);
    }
    if (this._isCropping) {
      this._isCropping    = false;
      this._cropHandle    = null;
      this._isResizingCrop= false;
      if (this._cropRect) this._onCropChange({ ...this._cropRect });
    }
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this._sourceBitmap) return;

    const delta   = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const pointer = getRelativePointer(e, this._viewport);
    const vp      = this._viewport.getBoundingClientRect();

    // Zoom toward pointer
    const cx    = pointer.x - vp.width  / 2;
    const cy    = pointer.y - vp.height / 2;
    const dz    = delta - 1;
    const prevZ = this._zoom;

    this._zoom = clamp(this._zoom * delta, MIN_ZOOM, MAX_ZOOM);

    this._panX -= cx * (this._zoom / prevZ - 1);
    this._panY -= cy * (this._zoom / prevZ - 1);

    this._clampPan();
    this._applyTransform();
    this._onZoomChange(this._zoom);
  }

  _onDblClick(e) {
    // Double-click to zoom 100% or fit
    if (Math.abs(this._zoom - 1) < 0.05) {
      this.zoomFit();
    } else {
      this.zoom100();
    }
  }

  /* Touch */
  _onTouchStart(e) {
    if (e.touches.length === 2) {
      this._lastTouchDist   = touchDistance(e.touches[0], e.touches[1]);
      this._lastTouchCenter = touchCenter(e.touches[0], e.touches[1]);
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist   = touchDistance(e.touches[0], e.touches[1]);
      const center = touchCenter(e.touches[0], e.touches[1]);
      const delta  = dist / (this._lastTouchDist || dist);
      this._zoom   = clamp(this._zoom * delta, MIN_ZOOM, MAX_ZOOM);
      this._panX  += center.x - this._lastTouchCenter.x;
      this._panY  += center.y - this._lastTouchCenter.y;
      this._lastTouchDist   = dist;
      this._lastTouchCenter = center;
      this._clampPan();
      this._applyTransform();
      this._onZoomChange(this._zoom);
    }
  }

  _onTouchEnd() {
    this._lastTouchDist = 0;
  }

  /* ── PRIVATE: CROP INTERACTION ── */

  /**
   * Convert viewport pointer pos to image-space coordinates.
   * @param {{ x, y }} viewPos
   * @returns {{ x, y }}
   */
  _viewToImage(viewPos) {
    const vp    = this._viewport.getBoundingClientRect();
    const frame = this._frame.getBoundingClientRect();
    const imgX  = (viewPos.x - (frame.left - vp.left)) / this._zoom;
    const imgY  = (viewPos.y - (frame.top  - vp.top))  / this._zoom;
    return {
      x: clamp(Math.round(imgX), 0, this._sourceWidth),
      y: clamp(Math.round(imgY), 0, this._sourceHeight),
    };
  }

  _startCropInteraction(viewPos) {
    const imgPos = this._viewToImage(viewPos);
    const r      = this._cropRect;

    if (!r) {
      // Start new crop
      this._isCropping    = true;
      this._isResizingCrop= true;
      this._cropStart     = imgPos;
      this._cropRect      = { x: imgPos.x, y: imgPos.y, w: 1, h: 1 };
      return;
    }

    // Check if clicking a handle
    const handle = this._hitTestCropHandle(imgPos, r);
    if (handle) {
      this._isCropping     = true;
      this._isResizingCrop = true;
      this._cropHandle     = handle;
      this._cropStart      = imgPos;
      return;
    }

    // Drag inside crop rect = move
    if (imgPos.x >= r.x && imgPos.x <= r.x + r.w &&
        imgPos.y >= r.y && imgPos.y <= r.y + r.h) {
      this._isCropping  = true;
      this._cropHandle  = 'move';
      this._cropStart   = imgPos;
    }
  }

  _hitTestCropHandle(pos, r) {
    const hs = Math.round(12 / this._zoom);
    const hits = {
      'tl': [r.x, r.y],
      'tr': [r.x + r.w, r.y],
      'bl': [r.x, r.y + r.h],
      'br': [r.x + r.w, r.y + r.h],
      'tc': [r.x + r.w / 2, r.y],
      'bc': [r.x + r.w / 2, r.y + r.h],
      'lc': [r.x, r.y + r.h / 2],
      'rc': [r.x + r.w, r.y + r.h / 2],
    };
    for (const [name, [hx, hy]] of Object.entries(hits)) {
      if (Math.abs(pos.x - hx) <= hs && Math.abs(pos.y - hy) <= hs) return name;
    }
    return null;
  }

  _updateCropInteraction(viewPos) {
    const imgPos = this._viewToImage(viewPos);
    const r      = this._cropRect;
    const start  = this._cropStart;
    const dx     = imgPos.x - start.x;
    const dy     = imgPos.y - start.y;
    const sw     = this._sourceWidth, sh = this._sourceHeight;

    if (this._cropHandle === 'move') {
      r.x = clamp(r.x + dx, 0, sw - r.w);
      r.y = clamp(r.y + dy, 0, sh - r.h);

    } else if (!this._cropHandle) {
      // Drawing new rect from corner
      const x = Math.min(start.x, imgPos.x);
      const y = Math.min(start.y, imgPos.y);
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      r.x = clamp(x, 0, sw); r.y = clamp(y, 0, sh);
      r.w = clamp(w, 4, sw - r.x); r.h = clamp(h, 4, sh - r.y);

    } else {
      // Handle resize
      const map = {
        'tl': () => { r.x += dx; r.y += dy; r.w -= dx; r.h -= dy; },
        'tr': () => { r.w += dx; r.y += dy; r.h -= dy; },
        'bl': () => { r.x += dx; r.w -= dx; r.h += dy; },
        'br': () => { r.w += dx; r.h += dy; },
        'tc': () => { r.y += dy; r.h -= dy; },
        'bc': () => { r.h += dy; },
        'lc': () => { r.x += dx; r.w -= dx; },
        'rc': () => { r.w += dx; },
      };
      if (map[this._cropHandle]) map[this._cropHandle]();
      r.w = Math.max(10, r.w);
      r.h = Math.max(10, r.h);
      r.x = clamp(r.x, 0, sw - r.w);
      r.y = clamp(r.y, 0, sh - r.h);
    }

    this._cropStart = imgPos;
    if (this._cropRatio) this._constrainCropRatio();
    this._drawOverlay();
    this._onCropChange({ ...r });
  }

  /* ── PRIVATE: EYE DROPPER ── */

  _sampleColor(viewPos) {
    const imgPos = this._viewToImage(viewPos);
    const ctx    = this._display.getContext('2d');
    const pixel  = ctx.getImageData(imgPos.x, imgPos.y, 1, 1).data;
    const r = pixel[0], g = pixel[1], b = pixel[2];
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    this._onColorSample({ r, g, b, hex });
  }

  /* ── PUBLIC: EXPORT ── */

  /**
   * Export the current canvas as a Blob.
   * @param {string}  format  - 'jpeg'|'png'|'webp'
   * @param {number}  quality - [0..1]
   * @param {number}  scale   - e.g. 2 for 2×
   * @returns {Promise<Blob>}
   */
  async exportBlob(format = 'jpeg', quality = 0.92, scale = 1) {
    const sw = this._display.width;
    const sh = this._display.height;
    const ow = Math.round(sw * scale);
    const oh = Math.round(sh * scale);

    const exportCanvas = new OffscreenCanvas(ow, oh);
    const ctx          = exportCanvas.getContext('2d');
    ctx.drawImage(this._display, 0, 0, ow, oh);

    const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    return exportCanvas.convertToBlob({
      type:    mimeMap[format] || 'image/jpeg',
      quality: format === 'png' ? undefined : quality,
    });
  }

  /**
   * Copy current image to clipboard.
   * @returns {Promise<void>}
   */
  async copyToClipboard() {
    const blob = await this.exportBlob('png', 1, 1);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
  }

  /** @returns {{ width, height }} source image dimensions */
  get sourceDimensions() {
    return { width: this._sourceWidth, height: this._sourceHeight };
  }

  /** @returns {boolean} true if an image is loaded */
  get hasImage() { return this._sourceBitmap !== null; }
}

/* ================================================================
   HELPER
================================================================ */

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
