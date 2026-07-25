/**
 * IRONFILTER PRO — adjustments.js
 * Professional photo adjustments pipeline.
 * Processes ImageData through ordered stages.
 * All operations are pure functions returning new ImageData.
 */

import { clamp, buildLUT, applyLUTAll, copyPixels, makeImageData, rgbToHsl, hslToRgb, buildCurveTable } from './utils.js';

/* ================================================================
   DEFAULT ADJUSTMENT STATE
================================================================ */

/**
 * Returns a fresh default adjustments object.
 * @returns {AdjustmentState}
 */
export function defaultAdjustments() {
  return {
    // Light
    exposure:    0,
    brightness:  0,
    contrast:    0,
    shadows:     0,
    highlights:  0,
    whites:      0,
    blacks:      0,

    // Color
    temperature: 0,
    tint:        0,
    saturation:  0,
    vibrance:    0,
    hue:         0,

    // Detail
    clarity:     0,
    texture:     0,
    sharpen:     0,
    blur:        0,
    grain:       0,
    vignette:    0,

    // HSL per-channel (h/s/l offsets for each hue range)
    hsl: {
      red:     { h: 0, s: 0, l: 0 },
      orange:  { h: 0, s: 0, l: 0 },
      yellow:  { h: 0, s: 0, l: 0 },
      green:   { h: 0, s: 0, l: 0 },
      aqua:    { h: 0, s: 0, l: 0 },
      blue:    { h: 0, s: 0, l: 0 },
      purple:  { h: 0, s: 0, l: 0 },
      magenta: { h: 0, s: 0, l: 0 },
    },

    // Color balance per tonal range
    colorBalance: {
      shadows:    { cr: 0, mg: 0, yb: 0 },
      midtones:   { cr: 0, mg: 0, yb: 0 },
      highlights: { cr: 0, mg: 0, yb: 0 },
    },

    // Curves (array of {x,y} points in [0..1])
    curves: {
      rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      r:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      g:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      b:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    },

    // Levels
    levels: {
      inBlack:  0,
      inWhite:  255,
      gamma:    1.0,
      outBlack: 0,
      outWhite: 255,
    },
  };
}

/* ================================================================
   CHECKS — skip stages with zero effect
================================================================ */

const hasAny = (obj, keys) => keys.some(k => obj[k] !== 0);

const isIdentityPoints = (pts) =>
  pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 1 && pts[1].y === 1;

const isDefaultLevels = (l) =>
  l.inBlack === 0 && l.inWhite === 255 && l.gamma === 1.0 &&
  l.outBlack === 0 && l.outWhite === 255;

const isDefaultHsl = (hsl) =>
  Object.values(hsl).every(ch => ch.h === 0 && ch.s === 0 && ch.l === 0);

const isDefaultColorBalance = (cb) =>
  Object.values(cb).every(r => r.cr === 0 && r.mg === 0 && r.yb === 0);

/* ================================================================
   STAGE 1 — LEVELS
================================================================ */

/**
 * Apply Levels (input/output remapping + gamma).
 * @param {ImageData} input
 * @param {object}    levels
 * @returns {ImageData}
 */
function applyLevels(input, levels) {
  if (isDefaultLevels(levels)) return input;

  const { inBlack, inWhite, gamma, outBlack, outWhite } = levels;
  const inRange  = inWhite  - inBlack  || 1;
  const outRange = outWhite - outBlack;

  const table = buildLUT(i => {
    // Input remap
    let v = clamp((i - inBlack) / inRange * 255);
    // Gamma
    v = Math.pow(v / 255, 1 / gamma) * 255;
    // Output remap
    v = outBlack + (v / 255) * outRange;
    return v;
  });

  const data = new Uint8ClampedArray(input.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = table[data[i]];
    data[i + 1] = table[data[i + 1]];
    data[i + 2] = table[data[i + 2]];
  }
  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 2 — CURVES
================================================================ */

/**
 * Apply RGB curves.
 * @param {ImageData} input
 * @param {object}    curves
 * @returns {ImageData}
 */
function applyCurves(input, curves) {
  const allIdentity =
    isIdentityPoints(curves.rgb) &&
    isIdentityPoints(curves.r)   &&
    isIdentityPoints(curves.g)   &&
    isIdentityPoints(curves.b);

  if (allIdentity) return input;

  const rgbTable = buildCurveTable(curves.rgb);
  const rTable   = buildCurveTable(curves.r);
  const gTable   = buildCurveTable(curves.g);
  const bTable   = buildCurveTable(curves.b);

  const data = new Uint8ClampedArray(input.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = rTable[rgbTable[data[i]]];
    data[i + 1] = gTable[rgbTable[data[i + 1]]];
    data[i + 2] = bTable[rgbTable[data[i + 2]]];
  }
  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 3 — EXPOSURE & TONE
================================================================ */

/**
 * Apply exposure, brightness, contrast, whites, blacks, shadows, highlights.
 * @param {ImageData} input
 * @param {AdjustmentState} adj
 * @returns {ImageData}
 */
function applyTone(input, adj) {
  const {
    exposure, brightness, contrast,
    shadows, highlights, whites, blacks
  } = adj;

  const noOp = exposure === 0 && brightness === 0 && contrast === 0 &&
    shadows === 0 && highlights === 0 && whites === 0 && blacks === 0;
  if (noOp) return input;

  const exp = exposure / 100;
  const bri = brightness / 100;
  const con = contrast / 100;
  const sha = shadows / 100;
  const hil = highlights / 100;
  const whi = whites / 100;
  const bla = blacks / 100;

  const data = new Uint8ClampedArray(input.data);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    // Exposure (multiplicative EV stops)
    const expFactor = Math.pow(2, exp * 3);
    r *= expFactor; g *= expFactor; b *= expFactor;

    // Brightness
    r += bri * 255; g += bri * 255; b += bri * 255;

    // Contrast (pivot at 128)
    r = (r - 128) * (1 + con) + 128;
    g = (g - 128) * (1 + con) + 128;
    b = (b - 128) * (1 + con) + 128;

    // Tonal adjustments (applied after contrast)
    const lumR = clamp(r) / 255;
    const lumG = clamp(g) / 255;
    const lumB = clamp(b) / 255;

    // Blacks: affect very dark pixels
    if (bla !== 0) {
      const tR = Math.pow(Math.max(0, 1 - lumR), 2);
      const tG = Math.pow(Math.max(0, 1 - lumG), 2);
      const tB = Math.pow(Math.max(0, 1 - lumB), 2);
      r += bla * 80 * tR;
      g += bla * 80 * tG;
      b += bla * 80 * tB;
    }

    // Whites: affect very bright pixels
    if (whi !== 0) {
      const tR = Math.pow(lumR, 2);
      const tG = Math.pow(lumG, 2);
      const tB = Math.pow(lumB, 2);
      r += whi * 80 * tR;
      g += whi * 80 * tG;
      b += whi * 80 * tB;
    }

    // Shadows: midtone-to-shadow range
    if (sha !== 0) {
      const tR = Math.max(0, Math.min(1, (0.5 - lumR) / 0.5));
      const tG = Math.max(0, Math.min(1, (0.5 - lumG) / 0.5));
      const tB = Math.max(0, Math.min(1, (0.5 - lumB) / 0.5));
      r += sha * 80 * tR;
      g += sha * 80 * tG;
      b += sha * 80 * tB;
    }

    // Highlights: midtone-to-highlight range
    if (hil !== 0) {
      const tR = Math.max(0, Math.min(1, (lumR - 0.5) / 0.5));
      const tG = Math.max(0, Math.min(1, (lumG - 0.5) / 0.5));
      const tB = Math.max(0, Math.min(1, (lumB - 0.5) / 0.5));
      r += hil * 80 * tR;
      g += hil * 80 * tG;
      b += hil * 80 * tB;
    }

    data[i]     = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 4 — COLOR (Temperature, Tint, Saturation, Vibrance, Hue)
================================================================ */

/**
 * Apply color adjustments.
 * @param {ImageData} input
 * @param {AdjustmentState} adj
 * @returns {ImageData}
 */
function applyColor(input, adj) {
  const { temperature, tint, saturation, vibrance, hue } = adj;

  const noOp = temperature === 0 && tint === 0 &&
    saturation === 0 && vibrance === 0 && hue === 0;
  if (noOp) return input;

  const temp = temperature / 100;
  const ti   = tint / 100;
  const sat  = saturation / 100;
  const vib  = vibrance / 100;

  // Hue rotation matrix (simple Hue only, no full HSL conversion for perf)
  let cosH = 1, sinH = 0;
  if (hue !== 0) {
    const angle = (hue * Math.PI) / 180;
    cosH = Math.cos(angle);
    sinH = Math.sin(angle);
  }

  const data = new Uint8ClampedArray(input.data);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    // Temperature (warm/cool)
    if (temp !== 0) {
      r = clamp(r + temp * 40);
      b = clamp(b - temp * 40);
      if (temp > 0) g = clamp(g + temp * 8);
    }

    // Tint (magenta-green axis)
    if (ti !== 0) {
      r = clamp(r + ti * 20);
      b = clamp(b + ti * 20);
      g = clamp(g - ti * 20);
    }

    // Saturation (global)
    if (sat !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp(gray + (r - gray) * (1 + sat));
      g = clamp(gray + (g - gray) * (1 + sat));
      b = clamp(gray + (b - gray) * (1 + sat));
    }

    // Vibrance (protects already-saturated colors)
    if (vib !== 0) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const curSat = max === 0 ? 0 : (max - min) / max;
      const factor = vib * (1 - curSat) * 0.5;
      const gray2  = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp(gray2 + (r - gray2) * (1 + factor));
      g = clamp(gray2 + (g - gray2) * (1 + factor));
      b = clamp(gray2 + (b - gray2) * (1 + factor));
    }

    // Hue rotation
    if (hue !== 0) {
      const nr = clamp(
        r * (0.213 + cosH * 0.787 - sinH * 0.213) +
        g * (0.715 - cosH * 0.715 - sinH * 0.715) +
        b * (0.072 - cosH * 0.072 + sinH * 0.928)
      );
      const ng = clamp(
        r * (0.213 - cosH * 0.213 + sinH * 0.143) +
        g * (0.715 + cosH * 0.285 + sinH * 0.140) +
        b * (0.072 - cosH * 0.072 - sinH * 0.283)
      );
      const nb = clamp(
        r * (0.213 - cosH * 0.213 - sinH * 0.787) +
        g * (0.715 - cosH * 0.715 + sinH * 0.715) +
        b * (0.072 + cosH * 0.928 + sinH * 0.072)
      );
      r = nr; g = ng; b = nb;
    }

    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 5 — HSL PER CHANNEL
================================================================ */

/** Hue range definitions: [center, width] in degrees */
const HSL_RANGES = {
  red:     [0,    40],
  orange:  [30,   30],
  yellow:  [60,   35],
  green:   [120,  50],
  aqua:    [180,  40],
  blue:    [220,  50],
  purple:  [280,  45],
  magenta: [320,  40],
};

/**
 * Get influence weight of a hue for a given channel range.
 * @param {number} hue - [0..360]
 * @param {number} center
 * @param {number} width
 * @returns {number} [0..1]
 */
function hueWeight(hue, center, width) {
  let diff = Math.abs(hue - center);
  if (diff > 180) diff = 360 - diff;
  return Math.max(0, 1 - diff / width);
}

/**
 * Apply HSL adjustments per hue channel.
 * @param {ImageData} input
 * @param {object}    hsl - { red, orange, yellow, green, aqua, blue, purple, magenta }
 * @returns {ImageData}
 */
function applyHSL(input, hsl) {
  if (isDefaultHsl(hsl)) return input;

  const data = new Uint8ClampedArray(input.data);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);

    let dh = 0, ds = 0, dl = 0;

    for (const [channel, adj] of Object.entries(hsl)) {
      if (adj.h === 0 && adj.s === 0 && adj.l === 0) continue;
      const [center, width] = HSL_RANGES[channel];
      const w = hueWeight(h, center, width);
      if (w <= 0) continue;
      dh += adj.h * w;
      ds += adj.s * w;
      dl += adj.l * w;
    }

    if (dh === 0 && ds === 0 && dl === 0) continue;

    const newH = (h + dh + 360) % 360;
    const newS = clamp(s + ds, 0, 100);
    const newL = clamp(l + dl, 0, 100);

    const { r: nr, g: ng, b: nb } = hslToRgb(newH, newS, newL);
    data[i]     = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }

  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 6 — COLOR BALANCE
================================================================ */

/**
 * Apply color balance adjustments per tonal range.
 * @param {ImageData} input
 * @param {object}    colorBalance
 * @returns {ImageData}
 */
function applyColorBalance(input, colorBalance) {
  if (isDefaultColorBalance(colorBalance)) return input;

  const data = new Uint8ClampedArray(input.data);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3 / 255;

    // Shadow weight (dark areas)
    const wSha = Math.max(0, (0.45 - lum) / 0.45);
    // Highlight weight (bright areas)
    const wHil = Math.max(0, (lum - 0.55) / 0.45);
    // Midtone weight (remaining)
    const wMid = Math.max(0, 1 - wSha - wHil);

    const apply = (range, weight) => {
      if (weight <= 0) return;
      const { cr, mg, yb } = range;
      // Cian-Red axis: positive = more red, negative = more cyan
      r = clamp(r + cr * weight * 0.4);
      g = clamp(g - cr * weight * 0.2);
      // Magenta-Green: positive = more magenta, negative = more green
      r = clamp(r + mg * weight * 0.2);
      g = clamp(g - mg * weight * 0.4);
      b = clamp(b + mg * weight * 0.2);
      // Yellow-Blue: positive = more blue, negative = more yellow
      b = clamp(b + yb * weight * 0.4);
      g = clamp(g - yb * weight * 0.15);
      r = clamp(r - yb * weight * 0.1);
    };

    apply(colorBalance.shadows,    wSha);
    apply(colorBalance.midtones,   wMid);
    apply(colorBalance.highlights, wHil);

    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 7 — DETAIL (Clarity, Texture, Sharpen, Blur)
================================================================ */

/**
 * Apply an unsharp mask for sharpening/clarity.
 * @param {ImageData} input
 * @param {number}    amount   - sharpen strength [0..1]
 * @param {number}    radius   - blur radius for unsharp mask (1 or 2)
 * @returns {ImageData}
 */
function unsharpMask(input, amount, radius = 1) {
  if (amount <= 0) return input;

  const w   = input.width;
  const h   = input.height;
  const src = input.data;
  const out = new Uint8ClampedArray(src.length);

  // Box blur (fast approximation)
  const blurred = boxBlur(input, radius);
  const blur    = blurred.data;

  for (let i = 0; i < src.length; i += 4) {
    out[i]     = clamp(src[i]     + (src[i]     - blur[i])     * amount);
    out[i + 1] = clamp(src[i + 1] + (src[i + 1] - blur[i + 1]) * amount);
    out[i + 2] = clamp(src[i + 2] + (src[i + 2] - blur[i + 2]) * amount);
    out[i + 3] = src[i + 3];
  }

  return makeImageData(out, w, h);
}

/**
 * Fast box blur.
 * @param {ImageData} input
 * @param {number}    radius
 * @returns {ImageData}
 */
function boxBlur(input, radius) {
  const w   = input.width;
  const h   = input.height;
  const src = new Uint8ClampedArray(input.data);
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);

  const r = Math.max(1, Math.round(radius));

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = clamp(x + dx, 0, w - 1);
        const idx = (y * w + nx) * 4;
        sumR += src[idx]; sumG += src[idx + 1]; sumB += src[idx + 2];
        count++;
      }
      const tidx = (y * w + x) * 4;
      tmp[tidx]     = sumR / count;
      tmp[tidx + 1] = sumG / count;
      tmp[tidx + 2] = sumB / count;
      tmp[tidx + 3] = src[tidx + 3];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = clamp(y + dy, 0, h - 1);
        const idx = (ny * w + x) * 4;
        sumR += tmp[idx]; sumG += tmp[idx + 1]; sumB += tmp[idx + 2];
        count++;
      }
      const oidx = (y * w + x) * 4;
      out[oidx]     = sumR / count;
      out[oidx + 1] = sumG / count;
      out[oidx + 2] = sumB / count;
      out[oidx + 3] = tmp[oidx + 3];
    }
  }

  return makeImageData(out, w, h);
}

/**
 * Apply detail adjustments: clarity, texture, sharpen, blur.
 * @param {ImageData} input
 * @param {AdjustmentState} adj
 * @returns {ImageData}
 */
function applyDetail(input, adj) {
  const { clarity, texture, sharpen, blur } = adj;
  let result = input;

  // Blur (applied first if needed)
  if (blur > 0) {
    result = boxBlur(result, blur / 10);
  }

  // Clarity: large-radius unsharp mask (macro-contrast)
  if (clarity > 0) {
    result = unsharpMask(result, clarity / 100 * 1.5, 3);
  } else if (clarity < 0) {
    // Negative clarity = soften
    result = blendImageData2(result, boxBlur(result, 3), -clarity / 100);
  }

  // Texture: medium-radius (mid-frequency detail)
  if (texture !== 0) {
    if (texture > 0) {
      result = unsharpMask(result, texture / 100 * 1.2, 2);
    } else {
      result = blendImageData2(result, boxBlur(result, 2), -texture / 100 * 0.8);
    }
  }

  // Sharpen: fine detail
  if (sharpen > 0) {
    result = unsharpMask(result, sharpen / 100 * 2.5, 1);
  }

  return result;
}

/** Blend original and processed at given blend amount [0..1] */
function blendImageData2(base, processed, amount) {
  const src = base.data;
  const prc = processed.data;
  const out = new Uint8ClampedArray(src.length);
  const a   = clamp(amount, 0, 1);
  const b   = 1 - a;
  for (let i = 0; i < src.length; i += 4) {
    out[i]     = clamp(src[i]     * b + prc[i]     * a);
    out[i + 1] = clamp(src[i + 1] * b + prc[i + 1] * a);
    out[i + 2] = clamp(src[i + 2] * b + prc[i + 2] * a);
    out[i + 3] = src[i + 3];
  }
  return makeImageData(out, base.width, base.height);
}

/* ================================================================
   STAGE 8 — GRAIN
================================================================ */

/**
 * Add film grain to ImageData.
 * @param {ImageData} input
 * @param {number}    amount - [0..100]
 * @returns {ImageData}
 */
function applyGrain(input, amount) {
  if (amount <= 0) return input;

  const strength = (amount / 100) * 55;
  const data = new Uint8ClampedArray(input.data);

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * strength;
    // Apply grain with slight luminance bias (more visible in midtones)
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    const factor = 4 * lum * (1 - lum); // peaks at lum=0.5
    const n = noise * factor;
    data[i]     = clamp(data[i]     + n);
    data[i + 1] = clamp(data[i + 1] + n);
    data[i + 2] = clamp(data[i + 2] + n);
  }

  return makeImageData(data, input.width, input.height);
}

/* ================================================================
   STAGE 9 — VIGNETTE (canvas-level, not pixel-level)
================================================================ */

/**
 * Draw vignette effect onto a canvas context.
 * Kept separate from pixel pipeline so it's not baked into grain.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number} amount - [-100..100] (negative = light vignette)
 */
export function drawVignette(ctx, w, h, amount) {
  if (amount === 0) return;

  const strength  = Math.abs(amount) / 100;
  const color     = amount > 0 ? `rgba(0,0,0,${0.95 * strength})` : `rgba(255,255,255,${0.85 * strength})`;
  const innerR    = Math.min(w, h) * 0.15;
  const outerR    = Math.max(w, h) * 0.78;

  const gradient = ctx.createRadialGradient(w / 2, h / 2, innerR, w / 2, h / 2, outerR);
  gradient.addColorStop(0,   'rgba(0,0,0,0)');
  gradient.addColorStop(1,   color);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ================================================================
   MASTER PIPELINE
================================================================ */

/**
 * Run the full adjustment pipeline on an ImageData.
 * Stages are skipped if their values are at defaults (performance).
 *
 * @param {ImageData}       input
 * @param {AdjustmentState} adj
 * @returns {ImageData}
 */
export function applyAllAdjustments(input, adj) {
  let result = input;

  // Stage 1: Levels
  if (!isDefaultLevels(adj.levels)) {
    result = applyLevels(result, adj.levels);
  }

  // Stage 2: Curves
  if (adj.curves) {
    result = applyCurves(result, adj.curves);
  }

  // Stage 3: Tone (exposure, brightness, contrast, shadows, highlights, whites, blacks)
  result = applyTone(result, adj);

  // Stage 4: Color (temperature, tint, saturation, vibrance, hue)
  result = applyColor(result, adj);

  // Stage 5: HSL per channel
  if (adj.hsl && !isDefaultHsl(adj.hsl)) {
    result = applyHSL(result, adj.hsl);
  }

  // Stage 6: Color balance
  if (adj.colorBalance && !isDefaultColorBalance(adj.colorBalance)) {
    result = applyColorBalance(result, adj.colorBalance);
  }

  // Stage 7: Detail (clarity, texture, sharpen, blur)
  if (adj.clarity !== 0 || adj.texture !== 0 || adj.sharpen > 0 || adj.blur > 0) {
    result = applyDetail(result, adj);
  }

  // Stage 8: Grain (stochastic — always last before vignette)
  if (adj.grain > 0) {
    result = applyGrain(result, adj.grain);
  }

  // Vignette is drawn on the canvas directly in canvas.js (not baked here)

  return result;
}

/* ================================================================
   GROUPS — for reset by section
================================================================ */

export const ADJUSTMENT_GROUPS = {
  light:  ['exposure', 'brightness', 'contrast', 'shadows', 'highlights', 'whites', 'blacks'],
  color:  ['temperature', 'tint', 'saturation', 'vibrance', 'hue'],
  detail: ['clarity', 'texture', 'sharpen', 'blur', 'grain', 'vignette'],
};

/**
 * Reset a group of adjustment values to zero.
 * @param {AdjustmentState} adj
 * @param {string}          group - 'light'|'color'|'detail'
 * @returns {AdjustmentState} mutated adj
 */
export function resetGroup(adj, group) {
  const keys = ADJUSTMENT_GROUPS[group] || [];
  for (const key of keys) {
    if (key in adj) adj[key] = 0;
  }
  return adj;
}

/**
 * Reset all adjustments to defaults.
 * @returns {AdjustmentState}
 */
export function resetAllAdjustments() {
  return defaultAdjustments();
}

/* ================================================================
   HISTOGRAM
================================================================ */

/**
 * Compute RGB histogram from ImageData.
 * @param {ImageData} imageData
 * @returns {{ r: Uint32Array, g: Uint32Array, b: Uint32Array, lum: Uint32Array }}
 */
export function computeHistogram(imageData) {
  const r   = new Uint32Array(256);
  const g   = new Uint32Array(256);
  const b   = new Uint32Array(256);
  const lum = new Uint32Array(256);
  const d   = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    lum[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }

  return { r, g, b, lum };
}

/**
 * Draw a histogram onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ r, g, b, lum }} histogram
 * @param {string} [channel='lum'] - 'r'|'g'|'b'|'lum'
 */
export function drawHistogram(canvas, histogram, channel = 'lum') {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  const h   = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const data   = histogram[channel];
  const maxVal = Math.max(...data);
  if (maxVal === 0) return;

  const colors = {
    r:   'rgba(255, 60, 60, 0.7)',
    g:   'rgba(60, 200, 60, 0.7)',
    b:   'rgba(60, 100, 255, 0.7)',
    lum: 'rgba(200, 200, 200, 0.6)',
  };

  ctx.fillStyle = colors[channel] || colors.lum;
  ctx.beginPath();
  ctx.moveTo(0, h);

  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w;
    const y = h - (data[i] / maxVal) * h * 0.95;
    if (i === 0) ctx.lineTo(x, y);
    else         ctx.lineTo(x, y);
  }

  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}
