/**
 * IRONFILTER PRO — fitness.js
 * Fitness-specific overlay tools and templates.
 * Renders structured fitness content directly onto the canvas.
 */

import { uid, hexToRgb, clamp } from './utils.js';

/* ================================================================
   FITNESS TEMPLATE DEFINITIONS
================================================================ */

export const FITNESS_TEMPLATES = [
  {
    id:       'gym-poster',
    name:     'Gym Poster',
    category: 'poster',
    preview:  { bg: '#111', accent: '#f5c400' },
  },
  {
    id:       'bodybuilding',
    name:     'Bodybuilding',
    category: 'poster',
    preview:  { bg: '#0a0a0a', accent: '#e02020' },
  },
  {
    id:       'powerlifting',
    name:     'Powerlifting',
    category: 'poster',
    preview:  { bg: '#0d0d0d', accent: '#ffffff' },
  },
  {
    id:       'transformation',
    name:     'Transformación',
    category: 'overlay',
    preview:  { bg: '#0a1a0a', accent: '#00c853' },
  },
  {
    id:       'before-after',
    name:     'Antes / Después',
    category: 'overlay',
    preview:  { bg: '#0a0a1a', accent: '#2979ff' },
  },
  {
    id:       'workout-card',
    name:     'Workout Card',
    category: 'card',
    preview:  { bg: '#1a0a0a', accent: '#ff6600' },
  },
  {
    id:       'progress',
    name:     'Progress Photo',
    category: 'overlay',
    preview:  { bg: '#0d0d0d', accent: '#f5c400' },
  },
  {
    id:       'macros',
    name:     'Macros',
    category: 'card',
    preview:  { bg: '#0a1a10', accent: '#00c853' },
  },
  {
    id:       'pr',
    name:     'Personal Record',
    category: 'overlay',
    preview:  { bg: '#1a1000', accent: '#f5c400' },
  },
  {
    id:       'crossfit',
    name:     'CrossFit WOD',
    category: 'card',
    preview:  { bg: '#0a0a0a', accent: '#00bcd4' },
  },
];

/* ================================================================
   DEFAULT DATA FOR EACH TEMPLATE
================================================================ */

const TEMPLATE_DEFAULTS = {
  'gym-poster': {
    headline:   'BE STRONGER',
    subline:    'THAN YOUR EXCUSES',
    tagline:    'YOUR BODY. YOUR CHOICE. MAKE IT COUNT.',
    gym:        'IRON GYM',
    website:    'www.irongym.com',
    cta:        'JOIN TODAY',
    price:      '€29.99/MES',
    accentColor:'#f5c400',
    textColor:  '#ffffff',
    position:   'bottom',
    showLogo:   true,
  },
  'bodybuilding': {
    headline:   'SCULPTED',
    subline:    'BY IRON',
    athlete:    'JOHN DOE',
    federation: 'IFBB PRO',
    event:      'ARNOLD CLASSIC 2025',
    date:       'MARZO 2025',
    accentColor:'#e02020',
    textColor:  '#ffffff',
    position:   'bottom',
  },
  'powerlifting': {
    squat:      '300',
    bench:      '200',
    deadlift:   '350',
    total:      '850',
    weightClass:'93KG',
    athlete:    'ATLETA',
    federation: 'IPF',
    accentColor:'#ffffff',
    textColor:  '#ffffff',
    position:   'bottom',
  },
  'transformation': {
    startWeight: '95',
    endWeight:   '78',
    duration:    '6 MESES',
    label:       'MI TRANSFORMACIÓN',
    unit:        'KG',
    accentColor: '#00c853',
    textColor:   '#ffffff',
    position:    'bottom',
  },
  'before-after': {
    labelBefore: 'ANTES',
    labelAfter:  'DESPUÉS',
    duration:    '12 SEMANAS',
    accentColor: '#2979ff',
    textColor:   '#ffffff',
  },
  'workout-card': {
    title:     'WORKOUT OF THE DAY',
    date:      new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }).toUpperCase(),
    exercises: [
      { name: 'Sentadilla', sets: '5', reps: '5', weight: '120KG' },
      { name: 'Press Banca', sets: '5', reps: '5', weight: '100KG' },
      { name: 'Peso Muerto', sets: '1', reps: '5', weight: '180KG' },
      { name: 'Press Militar', sets: '5', reps: '5', weight: '60KG' },
    ],
    duration:  '90 MIN',
    volume:    '25.000 KG',
    accentColor:'#ff6600',
    textColor:  '#ffffff',
  },
  'progress': {
    week:       'SEMANA 8',
    program:    '12-WEEK SHRED',
    bodyweight: '82KG',
    bodyfat:    '12%',
    leanMass:   '72KG',
    accentColor:'#f5c400',
    textColor:  '#ffffff',
    position:   'bottom',
  },
  'macros': {
    calories:   '2850',
    protein:    '210',
    carbs:      '310',
    fat:        '85',
    label:      'MACROS DEL DÍA',
    goal:       'VOLUMEN',
    accentColor:'#00c853',
    textColor:  '#ffffff',
    position:   'bottom',
  },
  'pr': {
    lift:       'PESO MUERTO',
    weight:     '250',
    unit:       'KG',
    prevPR:     '240KG',
    date:       new Date().toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }).toUpperCase(),
    athlete:    'ATLETA',
    accentColor:'#f5c400',
    textColor:  '#ffffff',
    position:   'center',
  },
  'crossfit': {
    title:     'WOD',
    type:      'FOR TIME',
    rounds:    '5',
    exercises: [
      { name: 'Pull-ups',    reps: '10' },
      { name: 'Push-ups',   reps: '15' },
      { name: 'Air Squats', reps: '20' },
      { name: 'Burpees',    reps: '10' },
    ],
    timeCap:    '20 MIN',
    accentColor:'#00bcd4',
    textColor:  '#ffffff',
    position:   'bottom',
  },
};

/* ================================================================
   FITNESS MANAGER
================================================================ */

export class FitnessManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.editorEl    - Container for template editor UI
   * @param {HTMLElement} opts.gridEl      - Container for template preview cards
   * @param {Function}    opts.onOverlay   - (overlayFn: (ctx, w, h) => void) => void
   * @param {Function}    opts.onClear     - () => void
   */
  constructor({ editorEl, gridEl, onOverlay, onClear }) {
    this._editorEl   = editorEl;
    this._gridEl     = gridEl;
    this._onOverlay  = onOverlay || (() => {});
    this._onClear    = onClear   || (() => {});

    this._activeTemplate = null;
    this._data           = {};

    this._buildGrid();
    this._bindToolButtons();
  }

  /* ── PUBLIC ── */

  /**
   * Apply a template by ID.
   * @param {string} templateId
   */
  applyTemplate(templateId) {
    const tmpl = FITNESS_TEMPLATES.find(t => t.id === templateId);
    if (!tmpl) return;

    this._activeTemplate = templateId;
    this._data = { ...TEMPLATE_DEFAULTS[templateId] };

    this._renderEditor(templateId);
    this._applyOverlay();
    this._highlightCard(templateId);
  }

  /** Clear active fitness overlay. */
  clear() {
    this._activeTemplate = null;
    this._data = {};
    if (this._editorEl) this._editorEl.innerHTML = '';
    this._onClear();
  }

  /* ── PRIVATE: GRID ── */

  _buildGrid() {
    if (!this._gridEl) return;
    this._gridEl.innerHTML = '';

    FITNESS_TEMPLATES.forEach(tmpl => {
      const card = document.createElement('div');
      card.className    = 'template-card';
      card.dataset.id   = tmpl.id;
      card.style.background = tmpl.preview.bg;

      // Mini visual preview
      const preview = document.createElement('canvas');
      preview.width  = 120;
      preview.height = 150;
      preview.style.width  = '100%';
      preview.style.height = '100%';
      preview.style.display= 'block';
      this._drawCardPreview(preview, tmpl);
      card.appendChild(preview);

      const label = document.createElement('div');
      label.className   = 'template-card-label';
      label.textContent = tmpl.name;
      card.appendChild(label);

      card.addEventListener('click', () => this.applyTemplate(tmpl.id));
      this._gridEl.appendChild(card);
    });
  }

  _drawCardPreview(canvas, tmpl) {
    const ctx    = canvas.getContext('2d');
    const w      = canvas.width;
    const h      = canvas.height;
    const accent = tmpl.preview.accent;

    ctx.fillStyle = tmpl.preview.bg;
    ctx.fillRect(0, 0, w, h);

    // Decorative bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, h - 4, w, 4);

    // Text mockup
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(10, h - 40, w - 20, 8);
    ctx.fillRect(10, h - 28, w * 0.6 - 20, 6);

    ctx.fillStyle = accent;
    ctx.fillRect(10, h - 60, w * 0.4, 3);
  }

  _highlightCard(id) {
    this._gridEl?.querySelectorAll('.template-card').forEach(c => {
      c.style.outline = c.dataset.id === id ? '2px solid var(--accent)' : '';
    });
  }

  /* ── PRIVATE: TOOL BUTTONS ── */

  _bindToolButtons() {
    document.querySelectorAll('.fitness-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tmplId = btn.dataset.template;
        if (tmplId) this.applyTemplate(tmplId);
      });
    });
  }

  /* ── PRIVATE: EDITOR ── */

  /**
   * Build the dynamic editor UI for the given template.
   * @param {string} templateId
   */
  _renderEditor(templateId) {
    if (!this._editorEl) return;

    const builders = {
      'gym-poster':     () => this._buildGymPosterEditor(),
      'bodybuilding':   () => this._buildBodybuildingEditor(),
      'powerlifting':   () => this._buildPowerliftingEditor(),
      'transformation': () => this._buildTransformationEditor(),
      'before-after':   () => this._buildBeforeAfterEditor(),
      'workout-card':   () => this._buildWorkoutCardEditor(),
      'progress':       () => this._buildProgressEditor(),
      'macros':         () => this._buildMacrosEditor(),
      'pr':             () => this._buildPREditor(),
      'crossfit':       () => this._buildCrossFitEditor(),
    };

    const builder = builders[templateId];
    if (builder) {
      this._editorEl.innerHTML = '';
      builder();
    }
  }

  /* ── GENERIC FIELD BUILDER ── */

  _field(label, key, type = 'text', opts = {}) {
    const wrap  = document.createElement('div');
    wrap.className = 'field-row';
    wrap.style.cssText = 'padding: 4px 12px; display:flex; align-items:center; gap:8px;';

    const lbl = document.createElement('label');
    lbl.className   = 'field-lbl';
    lbl.textContent = label;

    let input;
    if (type === 'color') {
      input = document.createElement('input');
      input.type  = 'color';
      input.className = 'color-pick';
      input.value = this._data[key] || '#ffffff';
    } else if (type === 'select') {
      input = document.createElement('select');
      input.className = 'field-select';
      input.style.flex = '1';
      (opts.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.label;
        if (opt.value === this._data[key]) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type      = type === 'number' ? 'number' : 'text';
      input.className = 'field-input';
      input.style.flex= '1';
      input.value     = this._data[key] || '';
      input.placeholder = opts.placeholder || '';
      if (opts.min !== undefined) input.min = opts.min;
      if (opts.max !== undefined) input.max = opts.max;
    }

    input.addEventListener('input', () => {
      this._data[key] = input.value;
      this._applyOverlay();
    });

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return wrap;
  }

  _section(title) {
    const sec = document.createElement('div');
    sec.className = 'panel-section';
    const hdr = document.createElement('div');
    hdr.className   = 'section-hdr';
    hdr.textContent = title;
    sec.appendChild(hdr);
    return sec;
  }

  _clearBtn() {
    const btn = document.createElement('button');
    btn.className   = 'btn-secondary';
    btn.style.cssText = 'margin:8px 12px; width:calc(100% - 24px)';
    btn.textContent = '✕ Quitar overlay';
    btn.addEventListener('click', () => this.clear());
    return btn;
  }

  /* ── TEMPLATE EDITORS ── */

  _buildGymPosterEditor() {
    const sec = this._section('Gym Poster');
    const fields = this._editorEl;
    fields.appendChild(sec);

    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Titular',    'headline'));
    inner.appendChild(this._field('Subtítulo',  'subline'));
    inner.appendChild(this._field('Tagline',    'tagline'));
    inner.appendChild(this._field('Gym Name',   'gym'));
    inner.appendChild(this._field('CTA',        'cta'));
    inner.appendChild(this._field('Precio',     'price'));
    inner.appendChild(this._field('Website',    'website'));
    inner.appendChild(this._field('Acento',     'accentColor', 'color'));
    sec.appendChild(inner);
    fields.appendChild(this._clearBtn());
  }

  _buildBodybuildingEditor() {
    const sec = this._section('Bodybuilding');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Titular',    'headline'));
    inner.appendChild(this._field('Subtítulo',  'subline'));
    inner.appendChild(this._field('Atleta',     'athlete'));
    inner.appendChild(this._field('Federación', 'federation'));
    inner.appendChild(this._field('Evento',     'event'));
    inner.appendChild(this._field('Fecha',      'date'));
    inner.appendChild(this._field('Acento',     'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildPowerliftingEditor() {
    const sec = this._section('Powerlifting');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Squat (KG)',   'squat',   'number'));
    inner.appendChild(this._field('Bench (KG)',   'bench',   'number'));
    inner.appendChild(this._field('Deadlift (KG)','deadlift','number'));
    inner.appendChild(this._field('Total (KG)',   'total',   'number'));
    inner.appendChild(this._field('Categoría',    'weightClass'));
    inner.appendChild(this._field('Atleta',       'athlete'));
    inner.appendChild(this._field('Federación',   'federation'));
    inner.appendChild(this._field('Acento',       'accentColor','color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildTransformationEditor() {
    const sec = this._section('Transformación');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Título',        'label'));
    inner.appendChild(this._field('Peso inicial',  'startWeight', 'number'));
    inner.appendChild(this._field('Peso final',    'endWeight',   'number'));
    inner.appendChild(this._field('Unidad',        'unit'));
    inner.appendChild(this._field('Duración',      'duration'));
    inner.appendChild(this._field('Acento',        'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildBeforeAfterEditor() {
    const sec = this._section('Antes / Después');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Label Antes',    'labelBefore'));
    inner.appendChild(this._field('Label Después',  'labelAfter'));
    inner.appendChild(this._field('Duración',       'duration'));
    inner.appendChild(this._field('Acento',         'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildWorkoutCardEditor() {
    const sec = this._section('Workout Card');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Título',    'title'));
    inner.appendChild(this._field('Fecha',     'date'));
    inner.appendChild(this._field('Duración',  'duration'));
    inner.appendChild(this._field('Volumen',   'volume'));
    inner.appendChild(this._field('Acento',    'accentColor', 'color'));
    // Exercise editor (simplified)
    const exSec = document.createElement('div');
    exSec.style.cssText = 'padding:4px 12px';
    const exLabel = document.createElement('div');
    exLabel.className   = 'field-lbl';
    exLabel.style.cssText='padding:6px 0 4px; color:var(--text-muted)';
    exLabel.textContent = 'Ejercicios (nombre, series×reps, kg)';
    exSec.appendChild(exLabel);
    (this._data.exercises || []).forEach((ex, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:4px; margin-bottom:4px';
      const nameI = this._miniInput(ex.name, v => { this._data.exercises[idx].name = v; this._applyOverlay(); });
      const setsI = this._miniInput(ex.sets, v => { this._data.exercises[idx].sets = v; this._applyOverlay(); }, '30px');
      const repsI = this._miniInput(ex.reps, v => { this._data.exercises[idx].reps = v; this._applyOverlay(); }, '30px');
      const wgtI  = this._miniInput(ex.weight, v => { this._data.exercises[idx].weight = v; this._applyOverlay(); }, '50px');
      row.appendChild(nameI); row.appendChild(setsI);
      row.appendChild(repsI); row.appendChild(wgtI);
      exSec.appendChild(row);
    });
    inner.appendChild(exSec);
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildProgressEditor() {
    const sec = this._section('Progress Photo');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Semana',      'week'));
    inner.appendChild(this._field('Programa',    'program'));
    inner.appendChild(this._field('Peso',        'bodyweight'));
    inner.appendChild(this._field('Grasa corp.', 'bodyfat'));
    inner.appendChild(this._field('Masa magra',  'leanMass'));
    inner.appendChild(this._field('Acento',      'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildMacrosEditor() {
    const sec = this._section('Macros');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Título',     'label'));
    inner.appendChild(this._field('Objetivo',   'goal'));
    inner.appendChild(this._field('Calorías',   'calories', 'number'));
    inner.appendChild(this._field('Proteína (g)','protein',  'number'));
    inner.appendChild(this._field('Carbos (g)', 'carbs',    'number'));
    inner.appendChild(this._field('Grasa (g)',  'fat',      'number'));
    inner.appendChild(this._field('Acento',     'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildPREditor() {
    const sec = this._section('Personal Record');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Levantamiento', 'lift'));
    inner.appendChild(this._field('Nuevo PR',     'weight', 'number'));
    inner.appendChild(this._field('Unidad',       'unit'));
    inner.appendChild(this._field('PR anterior',  'prevPR'));
    inner.appendChild(this._field('Atleta',       'athlete'));
    inner.appendChild(this._field('Fecha',        'date'));
    inner.appendChild(this._field('Acento',       'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _buildCrossFitEditor() {
    const sec = this._section('CrossFit WOD');
    const inner = document.createElement('div');
    inner.style.cssText = 'padding:6px 0';
    inner.appendChild(this._field('Tipo',     'type'));
    inner.appendChild(this._field('Rondas',   'rounds', 'number'));
    inner.appendChild(this._field('Time Cap', 'timeCap'));
    inner.appendChild(this._field('Acento',   'accentColor', 'color'));
    sec.appendChild(inner);
    this._editorEl.appendChild(sec);
    this._editorEl.appendChild(this._clearBtn());
  }

  _miniInput(value, onChange, width = '100%') {
    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'field-input';
    input.style.cssText = `width:${width}; font-size:0.7rem; padding:3px 5px`;
    input.value     = value || '';
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  /* ── PRIVATE: OVERLAY RENDERER ── */

  _applyOverlay() {
    if (!this._activeTemplate) return;

    const renderers = {
      'gym-poster':     (ctx, w, h) => this._renderGymPoster(ctx, w, h),
      'bodybuilding':   (ctx, w, h) => this._renderBodybuilding(ctx, w, h),
      'powerlifting':   (ctx, w, h) => this._renderPowerlifting(ctx, w, h),
      'transformation': (ctx, w, h) => this._renderTransformation(ctx, w, h),
      'before-after':   (ctx, w, h) => this._renderBeforeAfter(ctx, w, h),
      'workout-card':   (ctx, w, h) => this._renderWorkoutCard(ctx, w, h),
      'progress':       (ctx, w, h) => this._renderProgress(ctx, w, h),
      'macros':         (ctx, w, h) => this._renderMacros(ctx, w, h),
      'pr':             (ctx, w, h) => this._renderPR(ctx, w, h),
      'crossfit':       (ctx, w, h) => this._renderCrossFit(ctx, w, h),
    };

    const fn = renderers[this._activeTemplate];
    if (fn) this._onOverlay(fn);
  }

  /* ── CANVAS RENDERERS ── */

  _renderGymPoster(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#f5c400';
    const baseSize = Math.max(24, w * 0.095);

    // Bottom gradient
    const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, h - 5, w, 5);

    let y = h * 0.58;
    const mx = w * 0.06;

    // Gym name
    if (d.gym) {
      ctx.font      = `700 ${baseSize * 0.38}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'left';
      ctx.fillText(d.gym.toUpperCase(), mx, y);
      y += baseSize * 0.5;
    }

    // Headline
    this._drawShadowText(ctx, d.headline?.toUpperCase() || '', mx, y, baseSize * 1.1, '#ffffff', '900 italic');
    y += baseSize * 1.15;

    // Subline
    this._drawShadowText(ctx, d.subline?.toUpperCase() || '', mx, y, baseSize * 0.8, accent, '900 italic');
    y += baseSize * 0.9;

    // Tagline
    if (d.tagline) {
      ctx.font      = `500 ${baseSize * 0.3}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(d.tagline.toUpperCase(), mx, y);
      y += baseSize * 0.45;
    }

    // CTA button
    if (d.cta) {
      const ctaW = baseSize * 3.5;
      const ctaH = baseSize * 0.65;
      ctx.fillStyle = accent;
      ctx.fillRect(mx, y, ctaW, ctaH);
      ctx.font      = `800 ${baseSize * 0.36}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(d.cta.toUpperCase(), mx + ctaW / 2, y + ctaH * 0.67);
      ctx.textAlign = 'left';

      // Price next to CTA
      if (d.price) {
        ctx.font      = `700 ${baseSize * 0.38}px 'Barlow Condensed', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(d.price, mx + ctaW + baseSize * 0.3, y + ctaH * 0.67);
      }
    }

    // Website bottom
    if (d.website) {
      ctx.font      = `400 ${baseSize * 0.28}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText(d.website.toLowerCase(), w / 2, h - baseSize * 0.35);
      ctx.textAlign = 'left';
    }
  }

  _renderBodybuilding(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#e02020';
    const baseSize = Math.max(24, w * 0.1);

    // Bottom gradient
    const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Side accent stripe
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 5, h);

    let y = h * 0.56;
    const mx = w * 0.07;

    if (d.federation) {
      ctx.font = `600 ${baseSize * 0.32}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(d.federation, mx, y);
      y += baseSize * 0.45;
    }

    this._drawShadowText(ctx, d.headline || '', mx, y, baseSize * 1.05, '#ffffff', '900 italic');
    y += baseSize * 1.1;
    this._drawShadowText(ctx, d.subline  || '', mx, y, baseSize * 0.72, accent, '900');
    y += baseSize * 0.9;

    if (d.athlete) {
      ctx.font = `700 ${baseSize * 0.38}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(d.athlete.toUpperCase(), mx, y);
      y += baseSize * 0.48;
    }

    if (d.event) {
      ctx.font = `400 ${baseSize * 0.28}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`${d.event} · ${d.date || ''}`, mx, y);
    }
  }

  _renderPowerlifting(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#ffffff';
    const baseSize = Math.max(20, w * 0.09);

    const grad = ctx.createLinearGradient(0, h * 0.4, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.94)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Three-lift display
    const lifts = [
      { label: 'SQ', value: d.squat    || '—' },
      { label: 'BP', value: d.bench    || '—' },
      { label: 'DL', value: d.deadlift || '—' },
    ];
    const colW = w / 3;
    const y0   = h * 0.55;

    lifts.forEach((lift, i) => {
      const cx = colW * i + colW / 2;
      ctx.textAlign = 'center';

      // Divider
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(colW * i, y0 - baseSize * 0.5);
        ctx.lineTo(colW * i, y0 + baseSize * 1.8);
        ctx.stroke();
      }

      // Label
      ctx.font      = `600 ${baseSize * 0.35}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(lift.label, cx, y0);

      // Value
      ctx.font      = `900 ${baseSize * 0.95}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lift.value, cx, y0 + baseSize * 0.95);

      // Unit
      ctx.font      = `500 ${baseSize * 0.28}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('KG', cx, y0 + baseSize * 1.2);
    });

    // Total
    ctx.textAlign = 'center';
    const totalY  = y0 + baseSize * 1.55;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(w * 0.1, totalY - baseSize * 0.38, w * 0.8, baseSize * 0.55);
    ctx.font      = `700 ${baseSize * 0.35}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText(`TOTAL: ${d.total || '—'} KG · ${d.weightClass || ''} · ${d.federation || ''}`, w / 2, totalY);

    if (d.athlete) {
      ctx.font      = `500 ${baseSize * 0.28}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(d.athlete.toUpperCase(), w / 2, totalY + baseSize * 0.45);
    }

    ctx.textAlign = 'left';
  }

  _renderTransformation(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#00c853';
    const baseSize = Math.max(20, w * 0.09);

    const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    let y = h * 0.6;
    const mx = w * 0.06;

    if (d.label) {
      ctx.font = `700 ${baseSize * 0.38}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(d.label.toUpperCase(), mx, y);
      y += baseSize * 0.52;
    }

    // Weight comparison
    const startW = d.startWeight || '0';
    const endW   = d.endWeight   || '0';
    const diff   = parseFloat(startW) - parseFloat(endW);
    const unit   = d.unit || 'KG';

    ctx.font = `900 italic ${baseSize * 0.9}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${startW}${unit}`, mx, y);
    const m1 = ctx.measureText(`${startW}${unit}`);

    ctx.fillStyle = accent;
    ctx.fillText(' → ', mx + m1.width, y);
    const m2 = ctx.measureText(' → ');

    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${endW}${unit}`, mx + m1.width + m2.width, y);
    y += baseSize * 1.0;

    // Diff badge
    if (diff > 0) {
      const badge = `-${diff.toFixed(1)} ${unit}`;
      ctx.font      = `800 ${baseSize * 0.55}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(badge, mx, y);
      y += baseSize * 0.72;
    }

    if (d.duration) {
      ctx.font      = `400 ${baseSize * 0.3}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`EN ${d.duration}`, mx, y);
    }
  }

  _renderBeforeAfter(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#2979ff';
    const labelSize = Math.max(16, w * 0.065);

    // Center divider
    ctx.fillStyle = accent;
    ctx.fillRect(w / 2 - 2, 0, 4, h);

    // Before label
    ctx.font      = `900 italic ${labelSize}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = 'center';

    // Background pills
    const pillH = labelSize * 1.4;
    const pillW = labelSize * 4;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(w / 4 - pillW / 2, 20, pillW, pillH);
    ctx.fillRect(w * 3 / 4 - pillW / 2, 20, pillW, pillH);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText((d.labelBefore || 'ANTES').toUpperCase(),  w / 4,      20 + pillH * 0.72);
    ctx.fillStyle = accent;
    ctx.fillText((d.labelAfter  || 'DESPUÉS').toUpperCase(), w * 3 / 4, 20 + pillH * 0.72);

    // Duration bottom center
    if (d.duration) {
      const dW = w * 0.6;
      const dH = labelSize * 1.3;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(w / 2 - dW / 2, h - dH - 20, dW, dH);
      ctx.font      = `700 ${labelSize * 0.72}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(d.duration.toUpperCase(), w / 2, h - 20 - dH * 0.25);
    }

    ctx.textAlign = 'left';
  }

  _renderWorkoutCard(ctx, w, h) {
    const d = this._data;
    const accent  = d.accentColor || '#ff6600';
    const baseSize= Math.max(16, w * 0.065);
    const mx      = w * 0.06;

    const cardH = Math.min(h * 0.72, baseSize * 12);
    const cardY = h - cardH - h * 0.04;

    // Card background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(mx - baseSize * 0.3, cardY - baseSize * 0.4, w - mx * 2 + baseSize * 0.6, cardH + baseSize * 0.7);

    // Accent top bar
    ctx.fillStyle = accent;
    ctx.fillRect(mx - baseSize * 0.3, cardY - baseSize * 0.4, w - mx * 2 + baseSize * 0.6, 3);

    let y = cardY;

    // Title + Date
    ctx.font      = `900 ${baseSize * 0.8}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText((d.title || 'WOD').toUpperCase(), mx, y);
    y += baseSize * 0.95;

    if (d.date) {
      ctx.font      = `400 ${baseSize * 0.35}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(d.date, mx, y);
      y += baseSize * 0.55;
    }

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(mx, y); ctx.lineTo(w - mx, y);
    ctx.stroke();
    y += baseSize * 0.4;

    // Exercises
    (d.exercises || []).forEach(ex => {
      ctx.font      = `700 ${baseSize * 0.52}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ex.name?.toUpperCase() || '', mx, y);

      const detail = `${ex.sets}×${ex.reps}  ${ex.weight || ''}`;
      ctx.textAlign = 'right';
      ctx.font      = `600 ${baseSize * 0.48}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(detail, w - mx, y);
      ctx.textAlign = 'left';

      y += baseSize * 0.72;
    });

    // Stats row
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(mx, y); ctx.lineTo(w - mx, y);
    ctx.stroke();
    y += baseSize * 0.38;

    ctx.font      = `600 ${baseSize * 0.36}px 'Barlow', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`⏱ ${d.duration || '—'}`, mx, y);
    ctx.textAlign = 'right';
    ctx.fillText(`📦 ${d.volume || '—'}`, w - mx, y);
    ctx.textAlign = 'left';
  }

  _renderProgress(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#f5c400';
    const baseSize = Math.max(16, w * 0.065);
    const mx = w * 0.06;

    const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    let y = h * 0.62;

    if (d.program) {
      ctx.font = `600 ${baseSize * 0.35}px 'Barlow', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(d.program.toUpperCase(), mx, y);
      y += baseSize * 0.5;
    }

    this._drawShadowText(ctx, d.week || '', mx, y, baseSize * 0.95, '#ffffff', '900');
    y += baseSize * 1.05;

    const stats = [
      { label: 'PESO',      value: d.bodyweight || '—' },
      { label: 'GRASA',     value: d.bodyfat    || '—' },
      { label: 'M. MAGRA',  value: d.leanMass   || '—' },
    ];

    const colW = (w - mx * 2) / stats.length;
    stats.forEach((s, i) => {
      const cx = mx + colW * i + colW / 2;
      ctx.textAlign = 'center';
      ctx.font      = `700 ${baseSize * 0.72}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s.value, cx, y);
      ctx.font      = `500 ${baseSize * 0.3}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(s.label, cx, y + baseSize * 0.45);
    });

    ctx.textAlign = 'left';
  }

  _renderMacros(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#00c853';
    const baseSize = Math.max(16, w * 0.068);
    const mx = w * 0.06;

    const cardH = baseSize * 7;
    const cardY = h - cardH - h * 0.05;

    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, cardY - baseSize * 0.5, w, cardH + baseSize * 0.8);

    ctx.fillStyle = accent;
    ctx.fillRect(0, cardY - baseSize * 0.5, w, 3);

    let y = cardY;

    if (d.label) {
      ctx.font      = `700 ${baseSize * 0.42}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(d.label.toUpperCase(), mx, y);
      y += baseSize * 0.58;
    }

    if (d.goal) {
      ctx.font      = `400 ${baseSize * 0.3}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(d.goal.toUpperCase(), mx, y);
      y += baseSize * 0.52;
    }

    // Calories big
    ctx.font      = `900 ${baseSize * 1.1}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(d.calories || '0', mx, y);
    ctx.font      = `500 ${baseSize * 0.38}px 'Barlow', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(' KCAL', mx + ctx.measureText(d.calories || '0').width * (baseSize * 1.1) / (baseSize * 0.38), y - baseSize * 0.35);
    y += baseSize * 1.15;

    // Macros bars
    const macros = [
      { label: 'PROTEÍNA', value: d.protein || '0', color: '#e02020', max: 300 },
      { label: 'CARBOS',   value: d.carbs   || '0', color: '#f5c400', max: 500 },
      { label: 'GRASA',    value: d.fat     || '0', color: '#2979ff', max: 200 },
    ];

    macros.forEach(macro => {
      const barW = w - mx * 2;
      const pct  = Math.min(1, parseFloat(macro.value) / macro.max);

      ctx.font      = `600 ${baseSize * 0.38}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(macro.label, mx, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = macro.color;
      ctx.fillText(`${macro.value}g`, w - mx, y);
      ctx.textAlign = 'left';

      y += baseSize * 0.28;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(mx, y, barW, baseSize * 0.18);
      ctx.fillStyle = macro.color;
      ctx.fillRect(mx, y, barW * pct, baseSize * 0.18);
      y += baseSize * 0.46;
    });
  }

  _renderPR(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#f5c400';
    const baseSize = Math.max(24, w * 0.1);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.3)');
    grad.addColorStop(0.5,'rgba(0,0,0,0.65)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    let y = h * 0.28;

    ctx.font      = `700 ${baseSize * 0.42}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText('🏆 NUEVO RÉCORD PERSONAL 🏆', w / 2, y);
    y += baseSize * 0.65;

    if (d.lift) {
      ctx.font      = `800 ${baseSize * 0.6}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(d.lift.toUpperCase(), w / 2, y);
      y += baseSize * 0.72;
    }

    ctx.font      = `900 italic ${baseSize * 1.55}px 'Barlow Condensed', sans-serif`;
    this._setTextShadow(ctx, accent, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${d.weight || '0'} ${d.unit || 'KG'}`, w / 2, y);
    this._clearShadow(ctx);
    y += baseSize * 1.6;

    if (d.prevPR) {
      ctx.font      = `500 ${baseSize * 0.35}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(`ANTERIOR: ${d.prevPR}`, w / 2, y);
      y += baseSize * 0.5;
    }

    if (d.athlete) {
      ctx.font      = `700 ${baseSize * 0.42}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(d.athlete.toUpperCase(), w / 2, y);
      y += baseSize * 0.52;
    }

    if (d.date) {
      ctx.font      = `400 ${baseSize * 0.28}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(d.date, w / 2, y);
    }

    ctx.textAlign = 'left';
  }

  _renderCrossFit(ctx, w, h) {
    const d = this._data;
    const accent = d.accentColor || '#00bcd4';
    const baseSize = Math.max(16, w * 0.065);
    const mx = w * 0.06;

    const grad = ctx.createLinearGradient(0, h * 0.35, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    let y = h * 0.45;

    this._drawShadowText(ctx, d.title || 'WOD', mx, y, baseSize * 1.1, accent, '900');
    y += baseSize * 1.2;

    if (d.type) {
      ctx.font = `700 ${baseSize * 0.45}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(d.type.toUpperCase(), mx, y);
      y += baseSize * 0.6;
    }

    if (d.rounds && parseInt(d.rounds) > 0) {
      ctx.font = `600 ${baseSize * 0.38}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`${d.rounds} ROUNDS`, mx, y);
      y += baseSize * 0.55;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(w - mx, y); ctx.stroke();
    y += baseSize * 0.38;

    (d.exercises || []).forEach(ex => {
      ctx.font      = `700 ${baseSize * 0.52}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ex.name?.toUpperCase() || '', mx, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = accent;
      ctx.fillText(`× ${ex.reps}`, w - mx, y);
      ctx.textAlign = 'left';
      y += baseSize * 0.68;
    });

    if (d.timeCap) {
      y += baseSize * 0.1;
      ctx.font      = `500 ${baseSize * 0.32}px 'Barlow', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`⏱ TIME CAP: ${d.timeCap}`, mx, y);
    }
  }

  /* ── DRAWING HELPERS ── */

  _drawShadowText(ctx, text, x, y, size, color, weight = '900') {
    ctx.save();
    ctx.font        = `${weight} ${size}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle   = color;
    this._setTextShadow(ctx, 'rgba(0,0,0,0.8)', size * 0.12);
    ctx.fillText(text?.toUpperCase() || '', x, y);
    ctx.restore();
  }

  _setTextShadow(ctx, color, blur) {
    ctx.shadowColor   = color;
    ctx.shadowBlur    = blur;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }

  _clearShadow(ctx) {
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}
