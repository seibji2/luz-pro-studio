/**
 * IRONFILTER PRO — export.js
 * Export pipeline: download, clipboard, format/quality/scale selection.
 * Updates export info panel in real time.
 */

import { estimateFileSize, buildFilename, setText, formatBytes } from './utils.js';

/* ================================================================
   EXPORT STATE
================================================================ */

const DEFAULT_STATE = {
  format:  'jpeg',
  quality: 0.92,
  scale:   1,
};

/* ================================================================
   EXPORT MANAGER
================================================================ */

export class ExportManager {
  /**
   * @param {object} opts
   * @param {Function} opts.getCanvasEngine  - () => CanvasEngine
   * @param {Function} opts.getFilename      - () => string  (original file name)
   * @param {Function} opts.getFilterName    - () => string  (active filter name)
   * @param {Function} opts.onExportStart    - () => void
   * @param {Function} opts.onExportEnd      - () => void
   * @param {Function} opts.onToast          - (msg, type) => void
   */
  constructor(opts) {
    this._getEngine     = opts.getCanvasEngine || (() => null);
    this._getFilename   = opts.getFilename     || (() => 'photo');
    this._getFilterName = opts.getFilterName   || (() => 'edited');
    this._onStart       = opts.onExportStart   || (() => {});
    this._onEnd         = opts.onExportEnd     || (() => {});
    this._onToast       = opts.onToast         || (() => {});

    this._state = { ...DEFAULT_STATE };
    this._bindUI();
  }

  /* ── STATE ACCESSORS ── */

  get format()  { return this._state.format; }
  get quality() { return this._state.quality; }
  get scale()   { return this._state.scale; }

  /* ── PUBLIC ACTIONS ── */

  /**
   * Download the current canvas as a file.
   */
  async download() {
    const engine = this._getEngine();
    if (!engine?.hasImage) {
      this._onToast('Sube una imagen primero', 'error');
      return;
    }

    this._onStart();

    try {
      const blob     = await engine.exportBlob(this._state.format, this._state.quality, this._state.scale);
      const filename = buildFilename(
        this._getFilename(),
        this._getFilterName(),
        this._state.format
      );

      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      this._onToast(`✓ Descargado: ${filename}`, 'success');
    } catch (err) {
      console.error('[ExportManager] download error:', err);
      this._onToast('Error al exportar la imagen', 'error');
    } finally {
      this._onEnd();
    }
  }

  /**
   * Copy current canvas to clipboard as PNG.
   */
  async copyToClipboard() {
    const engine = this._getEngine();
    if (!engine?.hasImage) {
      this._onToast('Sube una imagen primero', 'error');
      return;
    }

    if (!navigator.clipboard?.write) {
      this._onToast('Portapapeles no disponible en este navegador', 'error');
      return;
    }

    this._onStart();

    try {
      await engine.copyToClipboard();
      this._onToast('✓ Copiado al portapapeles', 'success');
    } catch (err) {
      console.error('[ExportManager] clipboard error:', err);
      this._onToast('Error al copiar (se requiere HTTPS)', 'error');
    } finally {
      this._onEnd();
    }
  }

  /**
   * Update export info panel based on current engine state.
   */
  updateInfo() {
    const engine = this._getEngine();
    if (!engine?.hasImage) return;

    const { width, height } = engine.sourceDimensions;
    const sw = Math.round(width  * this._state.scale);
    const sh = Math.round(height * this._state.scale);
    const est = estimateFileSize(sw, sh, this._state.format, this._state.quality);

    setText('ei-format', this._state.format.toUpperCase());
    setText('ei-dims',   `${sw} × ${sh} px`);
    setText('ei-size',   est);
    setText('export-dims', `Salida: ${sw} × ${sh} px`);
  }

  /* ── PRIVATE: UI BINDING ── */

  _bindUI() {
    // Format buttons
    document.querySelectorAll('[data-format]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state.format = btn.dataset.format;
        document.querySelectorAll('[data-format]').forEach(b =>
          b.classList.toggle('active', b.dataset.format === this._state.format));
        this._onQualityVisibility();
        this.updateInfo();
      });
    });

    // Quality slider
    const slQ = document.getElementById('sl-export-quality');
    if (slQ) {
      slQ.addEventListener('input', () => {
        this._state.quality = parseInt(slQ.value) / 100;
        setText('v-export-quality', slQ.value + '%');
        this.updateInfo();
      });
    }

    // Scale buttons
    document.querySelectorAll('[data-scale]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state.scale = parseFloat(btn.dataset.scale);
        document.querySelectorAll('[data-scale]').forEach(b =>
          b.classList.toggle('active', b.dataset.scale === btn.dataset.scale));
        this.updateInfo();
      });
    });

    // Download button
    const btnDl = document.getElementById('btn-download');
    if (btnDl) btnDl.addEventListener('click', () => this.download());

    // Clipboard button
    const btnCp = document.getElementById('btn-copy-clipboard');
    if (btnCp) btnCp.addEventListener('click', () => this.copyToClipboard());
  }

  /**
   * PNG doesn't use quality — hide quality slider for PNG.
   */
  _onQualityVisibility() {
    const slQ = document.getElementById('sl-export-quality');
    if (!slQ) return;
    const row = slQ.closest('.panel-section');
    if (row) row.style.opacity = this._state.format === 'png' ? '0.35' : '1';
  }
}
