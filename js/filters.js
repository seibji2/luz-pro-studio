/**
 * IRONFILTER PRO — filters.js
 * 40+ professional filters organized by category.
 * Each filter is a pure function: (ImageData) => ImageData
 * LUT-based processing for maximum performance.
 */

import { clamp, buildLUT, applyLUTChannels, applyLUTAll, rgbToHsl, hslToRgb, copyPixels, makeImageData } from './utils.js';

/* ================================================================
   CORE LUT ENGINE
================================================================ */

/**
 * Base LUT processor: brightness, contrast, saturation, tint, channel shifts.
 * @param {ImageData} input
 * @param {object}    opts
 * @returns {ImageData}
 */
function applyBaseLUT(input, opts = {}) {
  const {
    brightness   = 0,    // [-100..100]
    contrast     = 0,    // [-100..100]
    saturation   = 0,    // [-100..100]
    tintR        = 0,    // red channel bias  [-30..30]
    tintG        = 0,    // green channel bias
    tintB        = 0,    // blue channel bias
    tintColor    = null, // [r,g,b] color tint
    tintAmount   = 0,    // [0..1] blend with tintColor
    shadowR      = 1, shadowG = 1, shadowB = 1, // shadow channel multipliers
    highlightR   = 1, highlightG = 1, highlightB = 1, // highlight channel multipliers
    gammaR       = 1, gammaG = 1, gammaB = 1,         // gamma per channel
    invert       = false,
    sepia        = 0,    // [0..1]
    blackWhite   = false,
  } = opts;

  const b  = brightness / 100;
  const c  = contrast   / 100;
  const s  = saturation / 100;

  // Build per-channel LUTs
  const rTable = buildLUT(i => {
    let v = i;
    // Gamma
    v = Math.pow(v / 255, 1 / gammaR) * 255;
    // Brightness
    v += b * 255;
    // Contrast
    v = (v - 128) * (1 + c) + 128;
    // Channel tint
    v += tintR;
    // Shadow/Highlight per channel
    const lum = i / 255;
    if (lum < 0.5) v *= shadowR;
    else            v = 255 - (255 - v) * (2 - highlightR);
    // Invert
    if (invert) v = 255 - v;
    return v;
  });

  const gTable = buildLUT(i => {
    let v = i;
    v = Math.pow(v / 255, 1 / gammaG) * 255;
    v += b * 255;
    v = (v - 128) * (1 + c) + 128;
    v += tintG;
    const lum = i / 255;
    if (lum < 0.5) v *= shadowG;
    else            v = 255 - (255 - v) * (2 - highlightG);
    if (invert) v = 255 - v;
    return v;
  });

  const bTable = buildLUT(i => {
    let v = i;
    v = Math.pow(v / 255, 1 / gammaB) * 255;
    v += b * 255;
    v = (v - 128) * (1 + c) + 128;
    v += tintB;
    const lum = i / 255;
    if (lum < 0.5) v *= shadowB;
    else            v = 255 - (255 - v) * (2 - highlightB);
    if (invert) v = 255 - v;
    return v;
  });

  // Apply LUTs and per-pixel saturation/tint/sepia
  const src = input.data;
  const out = new Uint8ClampedArray(src.length);
  const len = src.length;

  for (let i = 0; i < len; i += 4) {
    let r = rTable[src[i]];
    let g = gTable[src[i + 1]];
    let bl= bTable[src[i + 2]];

    // Saturation
    if (s !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
      r  = clamp(gray + (r  - gray) * (1 + s));
      g  = clamp(gray + (g  - gray) * (1 + s));
      bl = clamp(gray + (bl - gray) * (1 + s));
    }

    // Sepia
    if (sepia > 0) {
      const sr = clamp(r * 0.393 + g * 0.769 + bl * 0.189);
      const sg = clamp(r * 0.349 + g * 0.686 + bl * 0.168);
      const sb = clamp(r * 0.272 + g * 0.534 + bl * 0.131);
      r  = clamp(r  * (1 - sepia) + sr * sepia);
      g  = clamp(g  * (1 - sepia) + sg * sepia);
      bl = clamp(bl * (1 - sepia) + sb * sepia);
    }

    // Black & White
    if (blackWhite) {
      const bwVal = clamp(0.299 * r + 0.587 * g + 0.114 * bl);
      r = g = bl = bwVal;
    }

    // Color tint blend
    if (tintColor && tintAmount > 0) {
      r  = clamp(r  * (1 - tintAmount) + tintColor[0] * tintAmount);
      g  = clamp(g  * (1 - tintAmount) + tintColor[1] * tintAmount);
      bl = clamp(bl * (1 - tintAmount) + tintColor[2] * tintAmount);
    }

    out[i]     = r;
    out[i + 1] = g;
    out[i + 2] = bl;
    out[i + 3] = src[i + 3];
  }

  return makeImageData(out, input.width, input.height);
}

/**
 * Blend two ImageDatas at a given opacity.
 * @param {ImageData} base
 * @param {ImageData} overlay
 * @param {number}    amount - [0..1]
 * @returns {ImageData}
 */
function blendImageData(base, overlay, amount) {
  if (amount >= 1) return overlay;
  if (amount <= 0) return base;

  const src = base.data;
  const ovr = overlay.data;
  const out = new Uint8ClampedArray(src.length);
  const t   = amount;
  const u   = 1 - t;

  for (let i = 0; i < src.length; i += 4) {
    out[i]     = clamp(src[i]     * u + ovr[i]     * t);
    out[i + 1] = clamp(src[i + 1] * u + ovr[i + 1] * t);
    out[i + 2] = clamp(src[i + 2] * u + ovr[i + 2] * t);
    out[i + 3] = src[i + 3];
  }

  return makeImageData(out, base.width, base.height);
}

/* ================================================================
   FILTER DEFINITIONS — 40+ Filters
================================================================ */

/** @type {FilterDefinition[]} */
export const FILTERS = [

  /* ── NONE / RAW ── */
  {
    id: 'raw',
    name: 'Original',
    category: 'all',
    apply: (img) => img,
  },

  /* ════════════════════════════════════════
     FITNESS CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'iron',
    name: 'Iron',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 8,
      contrast:   45,
      saturation: -20,
      tintR:      12, tintG: 4,
      tintColor:  [255, 190, 140],
      tintAmount: 0.07,
      shadowG:    0.92, shadowB: 0.88,
      highlightR: 1.06,
    }),
  },

  {
    id: 'beast',
    name: 'Beast Mode',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: -8,
      contrast:   65,
      saturation: 18,
      tintR:      18, tintG: 4, tintB: -8,
      tintColor:  [255, 90, 0],
      tintAmount: 0.09,
      shadowR:    0.85, shadowG: 0.80, shadowB: 0.75,
      highlightR: 1.1,
    }),
  },

  {
    id: 'sweat',
    name: 'Sweat',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 20,
      contrast:   28,
      saturation: -12,
      tintColor:  [255, 215, 100],
      tintAmount: 0.14,
      highlightR: 1.04, highlightG: 1.02,
    }),
  },

  {
    id: 'champion',
    name: 'Champion',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 15,
      contrast:   38,
      saturation: 10,
      tintColor:  [245, 196, 0],
      tintAmount: 0.16,
      tintR:      8, tintG: 4,
      highlightR: 1.08,
    }),
  },

  {
    id: 'powerlifting',
    name: 'Powerlifting',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: -12,
      contrast:   70,
      saturation: -35,
      tintColor:  [50, 30, 10],
      tintAmount: 0.08,
      shadowR:    0.80, shadowG: 0.78, shadowB: 0.72,
      gammaR:     0.9, gammaG: 0.92, gammaB: 0.95,
    }),
  },

  {
    id: 'crossfit',
    name: 'CrossFit',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 5,
      contrast:   55,
      saturation: 25,
      tintColor:  [0, 220, 200],
      tintAmount: 0.08,
      tintR:      -5, tintB: 8,
    }),
  },

  {
    id: 'gym-raw',
    name: 'Gym Raw',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   60,
      saturation: -50,
      tintColor:  [80, 70, 60],
      tintAmount: 0.1,
      shadowR:    0.88, shadowG: 0.86, shadowB: 0.80,
    }),
  },

  {
    id: 'bodybuilding',
    name: 'Bodybuilding',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 12,
      contrast:   50,
      saturation: -15,
      tintColor:  [255, 180, 100],
      tintAmount: 0.1,
      highlightR: 1.1, highlightG: 1.05,
      shadowB:    0.85,
    }),
  },

  {
    id: 'golden-hour',
    name: 'Golden Hour',
    category: 'fitness',
    apply: (img) => applyBaseLUT(img, {
      brightness: 18,
      contrast:   25,
      saturation: 15,
      tintColor:  [255, 200, 80],
      tintAmount: 0.18,
      tintR:      15, tintG: 8, tintB: -10,
      highlightR: 1.06,
    }),
  },

  /* ════════════════════════════════════════
     DARK CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'midnight',
    name: 'Midnight',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -22,
      contrast:   52,
      saturation: -30,
      tintColor:  [0, 50, 180],
      tintAmount: 0.14,
      shadowR:    0.75, shadowG: 0.75, shadowB: 0.90,
      gammaB:     1.12,
    }),
  },

  {
    id: 'noir',
    name: 'Noir',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -10,
      contrast:   60,
      blackWhite: true,
      shadowR:    0.78, shadowG: 0.78, shadowB: 0.78,
      highlightR: 1.08,
    }),
  },

  {
    id: 'danger',
    name: 'Danger',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   58,
      saturation: -15,
      tintColor:  [200, 0, 0],
      tintAmount: 0.14,
      shadowR:    1.1, shadowG: 0.72, shadowB: 0.72,
    }),
  },

  {
    id: 'shadow',
    name: 'Shadow',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -25,
      contrast:   45,
      saturation: -40,
      tintColor:  [20, 20, 30],
      tintAmount: 0.06,
      gammaR:     0.85, gammaG: 0.88, gammaB: 0.92,
    }),
  },

  {
    id: 'abyss',
    name: 'Abyss',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -30,
      contrast:   55,
      saturation: -60,
      tintColor:  [0, 0, 40],
      tintAmount: 0.1,
      shadowR:    0.60, shadowG: 0.62, shadowB: 0.70,
    }),
  },

  {
    id: 'carbon',
    name: 'Carbon',
    category: 'dark',
    apply: (img) => applyBaseLUT(img, {
      brightness: -8,
      contrast:   65,
      saturation: -80,
      tintColor:  [30, 30, 40],
      tintAmount: 0.08,
      gammaR:     0.9, gammaG: 0.92, gammaB: 0.95,
    }),
  },

  /* ════════════════════════════════════════
     CINEMA CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'cinema',
    name: 'Cinema',
    category: 'cinema',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   42,
      saturation: -22,
      tintColor:  [60, 50, 80],
      tintAmount: 0.1,
      shadowB:    1.15, shadowG: 0.95,
      highlightR: 1.05, highlightG: 0.98,
      gammaR:     0.95, gammaG: 0.96,
    }),
  },

  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    category: 'cinema',
    apply: (img) => {
      const src   = img.data;
      const out   = new Uint8ClampedArray(src.length);
      for (let i = 0; i < src.length; i += 4) {
        let r = src[i], g = src[i + 1], b = src[i + 2];
        const lum = (r + g + b) / 3 / 255;
        // Shadows → teal
        const tealStrength = Math.max(0, 0.4 - lum) * 2;
        // Highlights → orange
        const warmStrength = Math.max(0, lum - 0.5) * 2;
        r = clamp(r + warmStrength * 30  - tealStrength * 15);
        g = clamp(g + warmStrength * 10  - tealStrength * 5);
        b = clamp(b - warmStrength * 20  + tealStrength * 20);
        // Contrast
        r = clamp((r - 128) * 1.35 + 128);
        g = clamp((g - 128) * 1.30 + 128);
        b = clamp((b - 128) * 1.30 + 128);
        out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = src[i+3];
      }
      return makeImageData(out, img.width, img.height);
    },
  },

  {
    id: 'moody',
    name: 'Moody',
    category: 'cinema',
    apply: (img) => applyBaseLUT(img, {
      brightness: -12,
      contrast:   38,
      saturation: -28,
      tintColor:  [100, 80, 140],
      tintAmount: 0.12,
      shadowB:    1.12, shadowG: 0.92,
    }),
  },

  {
    id: 'analog',
    name: 'Analog',
    category: 'cinema',
    apply: (img) => applyBaseLUT(img, {
      brightness: 5,
      contrast:   20,
      saturation: -15,
      tintColor:  [255, 230, 180],
      tintAmount: 0.1,
      shadowR:    0.95, shadowG: 0.90, shadowB: 0.82,
      highlightR: 1.05, highlightG: 1.02,
      gammaB:     1.08,
    }),
  },

  {
    id: 'epic',
    name: 'Epic',
    category: 'cinema',
    apply: (img) => applyBaseLUT(img, {
      brightness: 0,
      contrast:   60,
      saturation: 10,
      tintColor:  [255, 150, 0],
      tintAmount: 0.08,
      shadowB:    1.1,
      highlightR: 1.08,
      gammaR:     0.92,
    }),
  },

  /* ════════════════════════════════════════
     VINTAGE CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'vintage',
    name: 'Vintage',
    category: 'vintage',
    apply: (img) => applyBaseLUT(img, {
      brightness: 8,
      contrast:   18,
      saturation: -20,
      sepia:      0.3,
      tintColor:  [255, 240, 200],
      tintAmount: 0.1,
      gammaR:     0.95, gammaG: 0.97, gammaB: 1.05,
    }),
  },

  {
    id: 'kodak',
    name: 'Kodak',
    category: 'vintage',
    apply: (img) => applyBaseLUT(img, {
      brightness: 12,
      contrast:   22,
      saturation: 5,
      tintColor:  [255, 235, 190],
      tintAmount: 0.08,
      shadowR:    0.95, shadowG: 0.88, shadowB: 0.80,
      highlightR: 1.04, highlightG: 1.02,
    }),
  },

  {
    id: 'faded',
    name: 'Faded',
    category: 'vintage',
    apply: (img) => applyBaseLUT(img, {
      brightness: 18,
      contrast:   -15,
      saturation: -35,
      tintColor:  [220, 210, 195],
      tintAmount: 0.12,
      shadowR:    1.1, shadowG: 1.05, shadowB: 0.95,
    }),
  },

  {
    id: 'lomo',
    name: 'Lomo',
    category: 'vintage',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   50,
      saturation: 20,
      tintColor:  [255, 200, 100],
      tintAmount: 0.08,
      shadowR:    1.1, shadowB: 0.8,
    }),
  },

  {
    id: 'polaroid',
    name: 'Polaroid',
    category: 'vintage',
    apply: (img) => applyBaseLUT(img, {
      brightness: 15,
      contrast:   10,
      saturation: -8,
      sepia:      0.15,
      tintColor:  [255, 245, 220],
      tintAmount: 0.1,
      highlightR: 1.06, highlightG: 1.04, highlightB: 0.96,
    }),
  },

  /* ════════════════════════════════════════
     BLACK & WHITE CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'monolith',
    name: 'Monolith',
    category: 'bw',
    apply: (img) => applyBaseLUT(img, {
      contrast:   55,
      blackWhite: true,
      shadowR:    0.75,
      highlightR: 1.08,
    }),
  },

  {
    id: 'silver',
    name: 'Silver',
    category: 'bw',
    apply: (img) => applyBaseLUT(img, {
      brightness: 8,
      contrast:   30,
      blackWhite: true,
      tintColor:  [200, 210, 220],
      tintAmount: 0.08,
    }),
  },

  {
    id: 'dramatic-bw',
    name: 'Dramatic',
    category: 'bw',
    apply: (img) => applyBaseLUT(img, {
      brightness: -8,
      contrast:   75,
      blackWhite: true,
      shadowR:    0.65,
      highlightR: 1.12,
      gammaR:     0.88,
    }),
  },

  {
    id: 'agfa',
    name: 'Agfa',
    category: 'bw',
    apply: (img) => applyBaseLUT(img, {
      contrast:   40,
      blackWhite: true,
      tintColor:  [180, 175, 165],
      tintAmount: 0.1,
      sepia:      0.12,
    }),
  },

  {
    id: 'infrared',
    name: 'Infrared',
    category: 'bw',
    apply: (img) => {
      const src = img.data;
      const out = new Uint8ClampedArray(src.length);
      for (let i = 0; i < src.length; i += 4) {
        const r = src[i], g = src[i + 1], b = src[i + 2];
        // Infrared: swap green luminance emphasis, blow out highlights
        const ir = clamp(r * 0.2 + g * 0.9 + b * 0.1);
        const v  = clamp((ir - 128) * 1.6 + 180);
        out[i] = out[i+1] = out[i+2] = v;
        out[i+3] = src[i+3];
      }
      return makeImageData(out, img.width, img.height);
    },
  },

  /* ════════════════════════════════════════
     HDR CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'hdr',
    name: 'HDR',
    category: 'hdr',
    apply: (img) => {
      // HDR: local tone-mapping simulation via clarity boost
      const base = applyBaseLUT(img, {
        brightness: 5,
        contrast:   50,
        saturation: 20,
      });
      return base;
    },
  },

  {
    id: 'clarity-boost',
    name: 'Clarity+',
    category: 'hdr',
    apply: (img) => applyBaseLUT(img, {
      brightness: 0,
      contrast:   45,
      saturation: 15,
      shadowR:    0.90, shadowG: 0.90, shadowB: 0.88,
      highlightR: 1.06, highlightG: 1.05, highlightB: 1.04,
    }),
  },

  {
    id: 'vivid',
    name: 'Vivid',
    category: 'hdr',
    apply: (img) => applyBaseLUT(img, {
      brightness: 8,
      contrast:   40,
      saturation: 45,
      highlightR: 1.05, highlightG: 1.04, highlightB: 1.05,
    }),
  },

  /* ════════════════════════════════════════
     COLOR CATEGORY
  ════════════════════════════════════════ */

  {
    id: 'warm',
    name: 'Warm',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 8,
      contrast:   18,
      saturation: 10,
      tintR:      20, tintG: 8, tintB: -15,
      tintColor:  [255, 210, 140],
      tintAmount: 0.1,
    }),
  },

  {
    id: 'cold',
    name: 'Cold',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 0,
      contrast:   20,
      saturation: -5,
      tintR:      -15, tintB: 20,
      tintColor:  [140, 180, 255],
      tintAmount: 0.1,
    }),
  },

  {
    id: 'natural',
    name: 'Natural',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 5,
      contrast:   12,
      saturation: 8,
      tintColor:  [240, 255, 240],
      tintAmount: 0.04,
    }),
  },

  {
    id: 'pop',
    name: 'Pop',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 10,
      contrast:   35,
      saturation: 40,
      highlightR: 1.04, highlightG: 1.04, highlightB: 1.05,
    }),
  },

  {
    id: 'fade',
    name: 'Fade',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 20,
      contrast:   -20,
      saturation: -25,
      shadowR:    1.15, shadowG: 1.1, shadowB: 1.05,
    }),
  },

  {
    id: 'urban',
    name: 'Urban',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   42,
      saturation: -18,
      tintColor:  [70, 90, 110],
      tintAmount: 0.1,
      shadowB:    1.08,
    }),
  },

  {
    id: 'street',
    name: 'Street',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: -8,
      contrast:   55,
      saturation: -30,
      tintColor:  [80, 80, 80],
      tintAmount: 0.06,
      gammaR:     0.92, gammaG: 0.94,
    }),
  },

  {
    id: 'soft',
    name: 'Soft',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 15,
      contrast:   -8,
      saturation: 8,
      tintColor:  [255, 240, 240],
      tintAmount: 0.08,
      highlightR: 1.03, highlightG: 1.02,
    }),
  },

  {
    id: 'hard',
    name: 'Hard',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: -8,
      contrast:   68,
      saturation: -10,
      shadowR:    0.80, shadowG: 0.78, shadowB: 0.75,
      highlightR: 1.1,
    }),
  },

  {
    id: 'tokyo',
    name: 'Tokyo',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: 5,
      contrast:   30,
      saturation: 20,
      tintColor:  [255, 50, 100],
      tintAmount: 0.07,
      shadowB:    1.1,
    }),
  },

  {
    id: 'concrete',
    name: 'Concrete',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: -5,
      contrast:   35,
      saturation: -55,
      tintColor:  [100, 115, 130],
      tintAmount: 0.1,
    }),
  },

  {
    id: 'neon',
    name: 'Neon',
    category: 'color',
    apply: (img) => applyBaseLUT(img, {
      brightness: -10,
      contrast:   50,
      saturation: 55,
      tintColor:  [0, 255, 200],
      tintAmount: 0.06,
      shadowB:    1.15,
    }),
  },

];

/* ================================================================
   FILTER REGISTRY
================================================================ */

/** Fast lookup map by filter ID. */
const FILTER_MAP = new Map(FILTERS.map(f => [f.id, f]));

/**
 * Get a filter definition by ID.
 * @param {string} id
 * @returns {FilterDefinition|null}
 */
export function getFilter(id) {
  return FILTER_MAP.get(id) || null;
}

/**
 * Get all filters for a given category.
 * @param {string} category
 * @param {string} [search] - optional name search
 * @returns {FilterDefinition[]}
 */
export function getFiltersByCategory(category, search = '') {
  let list = category === 'all'
    ? FILTERS
    : FILTERS.filter(f => f.category === category || f.id === 'raw');

  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(f => f.name.toLowerCase().includes(q));
  }

  return list;
}

/**
 * Apply a filter by ID to ImageData.
 * @param {string}    filterId
 * @param {ImageData} imageData
 * @param {number}    [intensity=1] - blend [0..1] with original
 * @returns {ImageData}
 */
export function applyFilter(filterId, imageData, intensity = 1) {
  const filter = getFilter(filterId);
  if (!filter) return imageData;

  const filtered = filter.apply(imageData);

  if (intensity >= 1) return filtered;
  if (intensity <= 0) return imageData;

  return blendImageData(imageData, filtered, intensity);
}

/* ================================================================
   THUMBNAIL RENDERER
================================================================ */

/**
 * Render all filter thumbnails into their <canvas> elements.
 * Uses createImageBitmap for off-thread acceleration.
 * @param {HTMLImageElement|ImageBitmap} source
 * @param {string} [category='all']
 * @param {string} [search='']
 */
export async function renderFilterThumbnails(source, category = 'all', search = '') {
  const filters = getFiltersByCategory(category, search);

  for (const filter of filters) {
    const canvas = document.getElementById(`fthumb-${filter.id}`);
    if (!canvas) continue;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w   = canvas.width;
    const h   = canvas.height;

    ctx.drawImage(source, 0, 0, w, h);

    if (filter.id === 'raw') continue;

    const imageData = ctx.getImageData(0, 0, w, h);
    const result    = filter.apply(imageData);
    ctx.putImageData(result, 0, 0);
  }
}

/* ================================================================
   CATEGORY LABELS
================================================================ */

export const CATEGORIES = [
  { id: 'all',     label: 'Todos'   },
  { id: 'fitness', label: 'Fitness' },
  { id: 'dark',    label: 'Dark'    },
  { id: 'cinema',  label: 'Cinema'  },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bw',      label: 'B&W'     },
  { id: 'hdr',     label: 'HDR'     },
  { id: 'color',   label: 'Color'   },
];
