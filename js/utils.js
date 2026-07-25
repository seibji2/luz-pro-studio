/**
 * IRONFILTER PRO — utils.js
 * Pure utility functions. No DOM, no state, no side effects.
 * All functions are stateless and independently testable.
 */

/* ================================================================
   MATH UTILITIES
================================================================ */

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values.
 * @param {number} a - start
 * @param {number} b - end
 * @param {number} t - factor [0..1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another.
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function remap(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Convert radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
  return rad * (180 / Math.PI);
}

/**
 * Round to N decimal places.
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
export function roundTo(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/* ================================================================
   COLOR UTILITIES
================================================================ */

/**
 * Convert RGB to HSL.
 * @param {number} r - [0..255]
 * @param {number} g - [0..255]
 * @param {number} b - [0..255]
 * @returns {{ h: number, s: number, l: number }} h:[0..360], s,l:[0..100]
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r: h = ((g - b) / delta) % 6; break;
      case g: h = (b - r) / delta + 2;   break;
      case b: h = (r - g) / delta + 4;   break;
    }
    h = h * 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB.
 * @param {number} h - [0..360]
 * @param {number} s - [0..100]
 * @param {number} l - [0..100]
 * @returns {{ r: number, g: number, b: number }} [0..255]
 */
export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;

  const c  = (1 - Math.abs(2 * l - 1)) * s;
  const x  = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m  = l - c / 2;

  let r = 0, g = 0, b = 0;

  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

/**
 * Convert hex string to RGB object.
 * @param {string} hex - e.g. "#f5c400" or "f5c400"
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

/**
 * Convert RGB to hex string.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string} e.g. "#f5c400"
 */
export function rgbToHex(r, g, b) {
  const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Get luminance of an RGB triplet (0..1).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
export function luminance(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ================================================================
   PIXEL ARRAY UTILITIES
================================================================ */

/**
 * Build a lookup table (0-255) from a mapping function.
 * @param {function(number): number} fn - maps input [0..255] to output [0..255]
 * @returns {Uint8ClampedArray}
 */
export function buildLUT(fn) {
  const table = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    table[i] = clamp(Math.round(fn(i)));
  }
  return table;
}

/**
 * Apply a per-channel lookup table to ImageData in-place.
 * @param {ImageData} imageData
 * @param {Uint8ClampedArray} rTable
 * @param {Uint8ClampedArray} gTable
 * @param {Uint8ClampedArray} bTable
 * @returns {ImageData} same reference, mutated
 */
export function applyLUTChannels(imageData, rTable, gTable, bTable) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = rTable[d[i]];
    d[i + 1] = gTable[d[i + 1]];
    d[i + 2] = bTable[d[i + 2]];
    // d[i+3] alpha — untouched
  }
  return imageData;
}

/**
 * Apply a single lookup table to all RGB channels.
 * @param {ImageData} imageData
 * @param {Uint8ClampedArray} table
 * @returns {ImageData}
 */
export function applyLUTAll(imageData, table) {
  return applyLUTChannels(imageData, table, table, table);
}

/**
 * Copy ImageData pixels into a new Uint8ClampedArray.
 * @param {ImageData} imageData
 * @returns {Uint8ClampedArray}
 */
export function copyPixels(imageData) {
  return new Uint8ClampedArray(imageData.data);
}

/**
 * Create a new ImageData from a pixel buffer.
 * @param {Uint8ClampedArray} buffer
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function makeImageData(buffer, width, height) {
  return new ImageData(new Uint8ClampedArray(buffer), width, height);
}

/* ================================================================
   CUBIC BEZIER / SPLINE (for curves)
================================================================ */

/**
 * Evaluate a cubic spline through given control points.
 * Returns an array of 256 output values indexed by input [0..255].
 * @param {Array<{x: number, y: number}>} points - sorted by x [0..1]
 * @returns {Uint8ClampedArray}
 */
export function buildCurveTable(points) {
  const table = new Uint8ClampedArray(256);

  if (points.length < 2) {
    for (let i = 0; i < 256; i++) table[i] = i;
    return table;
  }

  // Sort by x
  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Ensure boundary points
  if (sorted[0].x > 0)   sorted.unshift({ x: 0, y: sorted[0].y });
  if (sorted[sorted.length - 1].x < 1) sorted.push({ x: 1, y: sorted[sorted.length - 1].y });

  // Cubic Hermite spline evaluation
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    table[i] = clamp(Math.round(evaluateSpline(sorted, t) * 255));
  }

  return table;
}

/**
 * Evaluate the spline at position t [0..1].
 * @param {Array<{x: number, y: number}>} pts
 * @param {number} t
 * @returns {number}
 */
function evaluateSpline(pts, t) {
  // Find segment
  let lo = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (t >= pts[i].x && t <= pts[i + 1].x) { lo = i; break; }
  }

  const p0 = pts[Math.max(lo - 1, 0)];
  const p1 = pts[lo];
  const p2 = pts[lo + 1];
  const p3 = pts[Math.min(lo + 2, pts.length - 1)];

  const u = (t - p1.x) / (p2.x - p1.x || 1);

  // Catmull-Rom
  const t0 = (p2.y - p0.y) / 2;
  const t1 = (p3.y - p1.y) / 2;

  const u2 = u * u;
  const u3 = u2 * u;

  return (
    (2 * u3 - 3 * u2 + 1) * p1.y +
    (u3 - 2 * u2 + u)     * t0   +
    (-2 * u3 + 3 * u2)    * p2.y +
    (u3 - u2)             * t1
  );
}

/* ================================================================
   FILE UTILITIES
================================================================ */

/**
 * Format bytes into human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)  return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * Estimate the file size of a canvas export.
 * @param {number} width
 * @param {number} height
 * @param {string} format - 'jpeg'|'png'|'webp'
 * @param {number} quality - [0..1]
 * @returns {string}
 */
export function estimateFileSize(width, height, format, quality) {
  const pixels = width * height;
  let bytesPerPixel;

  if (format === 'png') {
    bytesPerPixel = 3.5; // rough average with compression
  } else if (format === 'jpeg') {
    bytesPerPixel = quality * 2.5;
  } else {
    bytesPerPixel = quality * 2.0;
  }

  return formatBytes(pixels * bytesPerPixel);
}

/**
 * Extract file extension from filename.
 * @param {string} filename
 * @returns {string}
 */
export function getExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Build an output filename with filter and timestamp.
 * @param {string} originalName
 * @param {string} filterName
 * @param {string} format
 * @returns {string}
 */
export function buildFilename(originalName, filterName, format) {
  const base = originalName.replace(/\.[^.]+$/, '') || 'ironfilter';
  const stamp = new Date().toISOString().slice(0, 10);
  const filter = filterName.toLowerCase().replace(/\s+/g, '-');
  return `${base}-${filter}-${stamp}.${format}`;
}

/* ================================================================
   DOM UTILITIES
================================================================ */

/**
 * Shorthand querySelector.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {Element|null}
 */
export function $(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Shorthand querySelectorAll.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {NodeList}
 */
export function $$(selector, root = document) {
  return root.querySelectorAll(selector);
}

/**
 * Set element text content safely.
 * @param {string} id
 * @param {string} text
 */
export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Toggle a CSS class on an element.
 * @param {Element} el
 * @param {string} cls
 * @param {boolean} [force]
 */
export function toggleClass(el, cls, force) {
  if (!el) return;
  el.classList.toggle(cls, force);
}

/**
 * Add event listener with automatic cleanup function returned.
 * @param {EventTarget} target
 * @param {string} event
 * @param {Function} handler
 * @param {object} [options]
 * @returns {Function} cleanup
 */
export function on(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}

/* ================================================================
   DEBOUNCE / THROTTLE
================================================================ */

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} delay - ms
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle a function call using requestAnimationFrame.
 * @param {Function} fn
 * @returns {Function}
 */
export function rafThrottle(fn) {
  let rafId = null;
  return function (...args) {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}

/* ================================================================
   CANVAS UTILITIES
================================================================ */

/**
 * Get canvas 2D context with optimal settings.
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
export function getContext2D(canvas) {
  return canvas.getContext('2d', {
    willReadFrequently: true,
    alpha: false
  });
}

/**
 * Resize a canvas to given dimensions, returning the context.
 * @param {HTMLCanvasElement} canvas
 * @param {number} width
 * @param {number} height
 * @returns {CanvasRenderingContext2D}
 */
export function resizeCanvas(canvas, width, height) {
  canvas.width  = width;
  canvas.height = height;
  return getContext2D(canvas);
}

/**
 * Load an image URL into an HTMLImageElement.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Get pixel color at canvas coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function samplePixel(ctx, x, y) {
  const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
}

/* ================================================================
   POINTER / MOUSE UTILITIES
================================================================ */

/**
 * Get pointer coordinates relative to an element.
 * @param {PointerEvent|MouseEvent} event
 * @param {Element} element
 * @returns {{ x: number, y: number }}
 */
export function getRelativePointer(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

/**
 * Get distance between two points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Get the center point between two touch points.
 * @param {Touch} t1
 * @param {Touch} t2
 * @returns {{ x: number, y: number }}
 */
export function touchCenter(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}

/**
 * Get the distance between two touch points.
 * @param {Touch} t1
 * @param {Touch} t2
 * @returns {number}
 */
export function touchDistance(t1, t2) {
  return Math.sqrt(
    (t1.clientX - t2.clientX) ** 2 +
    (t1.clientY - t2.clientY) ** 2
  );
}

/* ================================================================
   ID GENERATOR
================================================================ */

/** Simple monotonically increasing ID generator. */
let _idCounter = 0;

/**
 * Generate a unique ID string.
 * @param {string} [prefix='id']
 * @returns {string}
 */
export function uid(prefix = 'id') {
  return `${prefix}_${++_idCounter}_${Date.now()}`;
}

/* ================================================================
   DEEP CLONE
================================================================ */

/**
 * Deep-clone a plain object or array (no functions, no DOM).
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Uint8ClampedArray) return new Uint8ClampedArray(obj);
  if (Array.isArray(obj)) return obj.map(deepClone);
  const clone = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}

/* ================================================================
   OBJECT COMPARISON
================================================================ */

/**
 * Shallow equality check between two plain objects.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function shallowEqual(a, b) {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => a[key] === b[key]);
}

/* ================================================================
   NUMBER FORMATTING
================================================================ */

/**
 * Format a number as a signed string (e.g. +15, -3, 0).
 * @param {number} value
 * @returns {string}
 */
export function signed(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

/**
 * Format a percentage value.
 * @param {number} value - [0..100]
 * @returns {string}
 */
export function pct(value) {
  return `${Math.round(value)}%`;
}

/**
 * Format a degree value.
 * @param {number} value
 * @returns {string}
 */
export function deg(value) {
  return `${Math.round(value)}°`;
}
