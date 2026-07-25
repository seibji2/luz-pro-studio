/**
 * IRONFILTER PRO — crop.js
 * Crop utilities: ratio presets, geometry helpers, straighten.
 * This module is stateless — pure functions used by CanvasEngine and the UI.
 */

import { clamp, degToRad } from './utils.js';

/* ================================================================
   RATIO PRESETS
================================================================ */

/**
 * @typedef {{ id: string, label: string, ratio: number|null }} RatioPreset
 */

/** @type {RatioPreset[]} */
export const RATIO_PRESETS = [
  { id: 'free',  label: 'Libre',  ratio: null    },
  { id: '1:1',   label: '1:1',    ratio: 1       },
  { id: '4:3',   label: '4:3',    ratio: 4 / 3   },
  { id: '3:2',   label: '3:2',    ratio: 3 / 2   },
  { id: '16:9',  label: '16:9',   ratio: 16 / 9  },
  { id: '9:16',  label: '9:16',   ratio: 9 / 16  },
  { id: '4:5',   label: '4:5',    ratio: 4 / 5   },
  { id: '5:4',   label: '5:4',    ratio: 5 / 4   },
  { id: '2:3',   label: '2:3',    ratio: 2 / 3   },
  { id: '3:4',   label: '3:4',    ratio: 3 / 4   },
  { id: '21:9',  label: '21:9',   ratio: 21 / 9  },
  { id: 'A4',    label: 'A4',     ratio: 210/297  },
  { id: 'sq',    label: 'Cuadrado', ratio: 1     },
];

/**
 * Get a ratio preset by ID.
 * @param {string} id
 * @returns {RatioPreset|null}
 */
export function getRatioPreset(id) {
  return RATIO_PRESETS.find(p => p.id === id) || null;
}

/* ================================================================
   CROP RECTANGLE GEOMETRY
================================================================ */

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} CropRect
 */

/**
 * Constrain a crop rect to maintain a fixed aspect ratio.
 * Adjusts height to match width / ratio.
 * @param {CropRect} rect
 * @param {number}   ratio - width / height
 * @param {number}   imgW  - image width bound
 * @param {number}   imgH  - image height bound
 * @returns {CropRect}
 */
export function constrainRatio(rect, ratio, imgW, imgH) {
  if (!ratio) return { ...rect };

  let { x, y, w, h } = rect;
  h = Math.round(w / ratio);

  // If height exceeds bounds, adjust width
  if (y + h > imgH) {
    h = imgH - y;
    w = Math.round(h * ratio);
  }

  // Clamp to image bounds
  w = clamp(w, 4, imgW - x);
  h = clamp(h, 4, imgH - y);

  return { x, y, w, h };
}

/**
 * Clamp a crop rect to stay within image bounds.
 * @param {CropRect} rect
 * @param {number}   imgW
 * @param {number}   imgH
 * @returns {CropRect}
 */
export function clampRect(rect, imgW, imgH) {
  const x = clamp(rect.x, 0, imgW - 1);
  const y = clamp(rect.y, 0, imgH - 1);
  const w = clamp(rect.w, 1, imgW - x);
  const h = clamp(rect.h, 1, imgH - y);
  return { x, y, w, h };
}

/**
 * Compute a centered crop rect for given image dimensions and target ratio.
 * @param {number}      imgW
 * @param {number}      imgH
 * @param {number|null} ratio - w/h or null for original ratio
 * @param {number}      [margin=0.1] - fraction to inset from edges
 * @returns {CropRect}
 */
export function centeredCropRect(imgW, imgH, ratio = null, margin = 0.1) {
  const targetRatio = ratio || (imgW / imgH);
  const maxW        = imgW * (1 - 2 * margin);
  const maxH        = imgH * (1 - 2 * margin);

  let w, h;
  if (maxW / maxH > targetRatio) {
    h = maxH;
    w = h * targetRatio;
  } else {
    w = maxW;
    h = w / targetRatio;
  }

  const x = Math.round((imgW - w) / 2);
  const y = Math.round((imgH - h) / 2);

  return clampRect({ x, y, w: Math.round(w), h: Math.round(h) }, imgW, imgH);
}

/**
 * Check if two crop rects are equal.
 * @param {CropRect} a
 * @param {CropRect} b
 * @returns {boolean}
 */
export function rectsEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/* ================================================================
   HANDLE HIT TESTING
================================================================ */

/**
 * Hit-test a point against crop handles.
 * Returns the handle name or null.
 *
 * Handle names: 'tl', 'tc', 'tr', 'lc', 'rc', 'bl', 'bc', 'br', 'move'
 *
 * @param {{ x: number, y: number }} point  - in image coords
 * @param {CropRect}                  rect
 * @param {number}                    zoom   - current canvas zoom (affects handle hit radius)
 * @returns {string|null}
 */
export function hitTestHandle(point, rect, zoom = 1) {
  const { x, y, w, h } = rect;
  const hs = Math.max(8, Math.round(12 / zoom)); // hit size in image pixels

  const handles = {
    tl: [x,         y        ],
    tc: [x + w / 2, y        ],
    tr: [x + w,     y        ],
    lc: [x,         y + h / 2],
    rc: [x + w,     y + h / 2],
    bl: [x,         y + h    ],
    bc: [x + w / 2, y + h    ],
    br: [x + w,     y + h    ],
  };

  for (const [name, [hx, hy]] of Object.entries(handles)) {
    if (Math.abs(point.x - hx) <= hs && Math.abs(point.y - hy) <= hs) {
      return name;
    }
  }

  // Interior = move
  if (
    point.x > x + hs && point.x < x + w - hs &&
    point.y > y + hs && point.y < y + h - hs
  ) {
    return 'move';
  }

  return null;
}

/**
 * Get the cursor style for a given handle.
 * @param {string} handle
 * @returns {string} CSS cursor value
 */
export function handleCursor(handle) {
  const cursors = {
    tl: 'nwse-resize', br: 'nwse-resize',
    tr: 'nesw-resize', bl: 'nesw-resize',
    tc: 'ns-resize',   bc: 'ns-resize',
    lc: 'ew-resize',   rc: 'ew-resize',
    move: 'move',
  };
  return cursors[handle] || 'crosshair';
}

/* ================================================================
   STRAIGHTEN
================================================================ */

/**
 * Compute the crop rect needed to fill the frame after a rotation,
 * avoiding transparent corners.
 *
 * Uses the largest inscribed rectangle algorithm.
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} angleDeg - rotation in degrees
 * @returns {CropRect}
 */
export function straightenCropRect(imgW, imgH, angleDeg) {
  if (angleDeg === 0) return { x: 0, y: 0, w: imgW, h: imgH };

  const angle = Math.abs(degToRad(angleDeg));
  const sin   = Math.sin(angle);
  const cos   = Math.cos(angle);

  // Largest rectangle inscribed in rotated rectangle
  let w, h;
  if (imgW <= imgH) {
    const tanA = sin / cos;
    w = imgW / (cos + sin * (imgH / imgW));
    h = w * (imgH / imgW);
  } else {
    const tanA = sin / cos;
    h = imgH / (cos + sin * (imgW / imgH));
    w = h * (imgW / imgH);
  }

  w = Math.floor(w);
  h = Math.floor(h);

  const x = Math.round((imgW - w) / 2);
  const y = Math.round((imgH - h) / 2);

  return clampRect({ x, y, w, h }, imgW, imgH);
}

/* ================================================================
   CROP DRAW HELPERS
================================================================ */

/**
 * Draw crop overlay on a canvas context.
 * (Pure drawing function — no state)
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CropRect}                 rect    - in image pixels
 * @param {number}                   imgW
 * @param {number}                   imgH
 * @param {object}                   [opts]
 * @param {boolean}                  [opts.showGrid=true]
 * @param {number}                   [opts.handleSize=10]
 * @param {string}                   [opts.borderColor='rgba(255,255,255,0.9)']
 * @param {string}                   [opts.dimColor='rgba(0,0,0,0.55)']
 */
export function drawCropOverlay(ctx, rect, imgW, imgH, opts = {}) {
  const {
    showGrid    = true,
    handleSize  = 10,
    borderColor = 'rgba(255,255,255,0.9)',
    dimColor    = 'rgba(0,0,0,0.55)',
  } = opts;

  const { x, y, w, h } = rect;

  // Dim outside
  ctx.fillStyle = dimColor;
  ctx.fillRect(0,     0,     imgW, y          );  // top
  ctx.fillRect(0,     y + h, imgW, imgH - y - h); // bottom
  ctx.fillRect(0,     y,     x,    h          );  // left
  ctx.fillRect(x + w, y,     imgW - x - w, h );  // right

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);

  // Inner thirds grid
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = 0.8;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + w * i / 3, y);
      ctx.lineTo(x + w * i / 3, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x,     y + h * i / 3);
      ctx.lineTo(x + w, y + h * i / 3);
      ctx.stroke();
    }
  }

  // Corner handles (L-shaped)
  const hs  = handleSize;
  const hs2 = hs / 2;
  const corners = [
    { px: x,     py: y,     dx: 1,  dy: 1  },
    { px: x + w, py: y,     dx: -1, dy: 1  },
    { px: x,     py: y + h, dx: 1,  dy: -1 },
    { px: x + w, py: y + h, dx: -1, dy: -1 },
  ];

  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';

  corners.forEach(({ px, py, dx, dy }) => {
    ctx.beginPath();
    ctx.moveTo(px + dx * hs, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * hs);
    ctx.stroke();
  });

  // Edge mid handles (bars)
  const midHandles = [
    [x + w / 2, y,     hs, 3   ],  // top
    [x + w / 2, y + h, hs, 3   ],  // bottom
    [x,     y + h / 2, 3,  hs  ],  // left
    [x + w, y + h / 2, 3,  hs  ],  // right
  ];

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  midHandles.forEach(([mx, my, mw, mh]) => {
    ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
  });
}

/**
 * Draw a straighten angle indicator on the crop area.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CropRect}                 rect
 * @param {number}                   angle - degrees
 * @param {string}                   [color='#f5c400']
 */
export function drawStraightenIndicator(ctx, rect, angle, color = '#f5c400') {
  if (angle === 0) return;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const len = Math.min(rect.w, rect.h) * 0.4;
  const rad = degToRad(angle);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);

  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(len,  0);
  ctx.stroke();
  ctx.setLineDash([]);

  // Angle label
  ctx.rotate(-rad);
  ctx.font      = `600 12px 'Barlow Condensed', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(`${angle > 0 ? '+' : ''}${angle.toFixed(1)}°`, 0, -len * 0.3);

  ctx.restore();
}

/* ================================================================
   CROP EXPORT HELPER
================================================================ */

/**
 * Apply a crop to an OffscreenCanvas source and return a new ImageBitmap.
 * Supports straightening.
 *
 * @param {ImageBitmap|HTMLCanvasElement} source
 * @param {CropRect} rect
 * @param {number}   [straightenDeg=0]
 * @returns {Promise<ImageBitmap>}
 */
export async function cropImageBitmap(source, rect, straightenDeg = 0) {
  const { x, y, w, h } = rect;
  const off = new OffscreenCanvas(w, h);
  const ctx = off.getContext('2d');

  if (straightenDeg !== 0) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(degToRad(straightenDeg));
    ctx.drawImage(source, -x - w / 2, -y - h / 2);
    ctx.restore();
  } else {
    ctx.drawImage(source, -x, -y);
  }

  return createImageBitmap(off);
}
