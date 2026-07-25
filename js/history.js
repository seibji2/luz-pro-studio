/**
 * IRONFILTER PRO — history.js
 * Unlimited undo/redo with intelligent snapshot deduplication.
 * Uses structural diffing to avoid storing duplicate states.
 */

import { deepClone, shallowEqual } from './utils.js';

/* ================================================================
   HISTORY MANAGER
================================================================ */

/**
 * @typedef {object} Snapshot
 * @property {string}   id          - Unique snapshot identifier
 * @property {number}   timestamp   - Unix ms
 * @property {string}   label       - Human-readable description
 * @property {object}   state       - Cloned application state
 */

export class HistoryManager {
  /**
   * @param {object} options
   * @param {number}   [options.maxSize=200]        - Max number of snapshots
   * @param {Function} [options.onUpdate]           - Called after push/undo/redo
   * @param {Function} [options.onCapture]          - Called to obtain current state
   * @param {Function} [options.onRestore]          - Called to restore a snapshot state
   */
  constructor({ maxSize = 200, onUpdate, onCapture, onRestore } = {}) {
    /** @type {Snapshot[]} */
    this._stack    = [];
    this._cursor   = -1;
    this._maxSize  = maxSize;
    this._onUpdate  = onUpdate  || (() => {});
    this._onCapture = onCapture || (() => ({}));
    this._onRestore = onRestore || (() => {});
    this._locked   = false;  // prevent recursive push during restore
    this._groupId  = null;   // for grouping rapid changes
    this._groupTimer = null;
  }

  /* ── PUBLIC API ── */

  /**
   * Push a new snapshot onto the history stack.
   * Drops all redo states above current cursor.
   * Deduplicates if the new state is identical to the current one.
   *
   * @param {string} [label='Edit'] - Description for this change
   * @param {object} [stateOverride] - If provided, use this state instead of calling onCapture
   */
  push(label = 'Edit', stateOverride = null) {
    if (this._locked) return;

    const state = stateOverride ?? this._onCapture();
    if (!state) return;

    // Deduplicate: skip if state is structurally identical to current
    if (this._cursor >= 0) {
      const current = this._stack[this._cursor];
      if (this._isIdentical(current.state, state)) return;
    }

    // Drop future history (redo states)
    this._stack = this._stack.slice(0, this._cursor + 1);

    /** @type {Snapshot} */
    const snapshot = {
      id:        `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      label,
      state:     deepClone(state)
    };

    this._stack.push(snapshot);
    this._cursor = this._stack.length - 1;

    // Evict oldest if over max size
    if (this._stack.length > this._maxSize) {
      this._stack.shift();
      this._cursor = this._stack.length - 1;
    }

    this._notify();
  }

  /**
   * Undo one step. Restores the previous snapshot.
   * @returns {boolean} true if undo was performed
   */
  undo() {
    if (!this.canUndo()) return false;

    this._cursor--;
    this._restore(this._stack[this._cursor]);
    this._notify();
    return true;
  }

  /**
   * Redo one step. Restores the next snapshot.
   * @returns {boolean} true if redo was performed
   */
  redo() {
    if (!this.canRedo()) return false;

    this._cursor++;
    this._restore(this._stack[this._cursor]);
    this._notify();
    return true;
  }

  /**
   * Jump to a specific history index.
   * @param {number} index
   * @returns {boolean}
   */
  jumpTo(index) {
    if (index < 0 || index >= this._stack.length) return false;
    if (index === this._cursor) return false;

    this._cursor = index;
    this._restore(this._stack[this._cursor]);
    this._notify();
    return true;
  }

  /**
   * Clear all history.
   */
  clear() {
    this._stack  = [];
    this._cursor = -1;
    this._notify();
  }

  /**
   * Replace the current snapshot's state without creating a new one.
   * Useful for continuous adjustments (e.g. slider drag).
   * @param {string} [label]
   * @param {object} [stateOverride]
   */
  replace(label, stateOverride = null) {
    if (this._cursor < 0) {
      this.push(label, stateOverride);
      return;
    }

    const state = stateOverride ?? this._onCapture();
    if (!state) return;

    const snap = this._stack[this._cursor];
    snap.state     = deepClone(state);
    snap.timestamp = Date.now();
    if (label) snap.label = label;

    this._notify();
  }

  /**
   * Begin a named group: rapid changes will be merged until endGroup().
   * @param {string} label
   */
  beginGroup(label) {
    this._groupId    = label;
    this._groupTimer = null;
  }

  /**
   * End the current group. Pushes one snapshot for the whole group.
   * @param {object} [stateOverride]
   */
  endGroup(stateOverride = null) {
    const label  = this._groupId || 'Edit';
    this._groupId = null;
    this.push(label, stateOverride);
  }

  /**
   * Push with debouncing — groups rapid changes within `delay` ms.
   * @param {string} label
   * @param {number} [delay=400]
   * @param {object} [stateOverride]
   */
  pushDebounced(label = 'Edit', delay = 400, stateOverride = null) {
    clearTimeout(this._groupTimer);
    this._groupTimer = setTimeout(() => {
      this.push(label, stateOverride);
    }, delay);
  }

  /* ── ACCESSORS ── */

  /** @returns {boolean} */
  canUndo() { return this._cursor > 0; }

  /** @returns {boolean} */
  canRedo() { return this._cursor < this._stack.length - 1; }

  /** @returns {number} Total number of snapshots */
  get size() { return this._stack.length; }

  /** @returns {number} Current cursor index */
  get cursor() { return this._cursor; }

  /** @returns {Snapshot|null} Current snapshot */
  get current() {
    return this._cursor >= 0 ? this._stack[this._cursor] : null;
  }

  /** @returns {Snapshot[]} Read-only copy of the stack */
  get snapshots() { return [...this._stack]; }

  /**
   * Get the label of the next undo action.
   * @returns {string}
   */
  get undoLabel() {
    if (!this.canUndo()) return '';
    return this._stack[this._cursor].label;
  }

  /**
   * Get the label of the next redo action.
   * @returns {string}
   */
  get redoLabel() {
    if (!this.canRedo()) return '';
    return this._stack[this._cursor + 1].label;
  }

  /* ── PRIVATE ── */

  /**
   * Check if two state objects are structurally identical.
   * Uses shallow equality on top-level keys, deep for nested objects.
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  _isIdentical(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      const va = a[key], vb = b[key];
      if (typeof va === 'object' && va !== null &&
          typeof vb === 'object' && vb !== null) {
        if (!shallowEqual(va, vb)) return false;
      } else {
        if (va !== vb) return false;
      }
    }

    return true;
  }

  /**
   * Restore a snapshot's state using the onRestore callback.
   * Locks history during restore to prevent recursive pushes.
   * @param {Snapshot} snapshot
   */
  _restore(snapshot) {
    this._locked = true;
    try {
      this._onRestore(deepClone(snapshot.state));
    } finally {
      this._locked = false;
    }
  }

  /**
   * Call the onUpdate callback with current history status.
   */
  _notify() {
    this._onUpdate({
      canUndo:    this.canUndo(),
      canRedo:    this.canRedo(),
      size:       this.size,
      cursor:     this._cursor,
      undoLabel:  this.undoLabel,
      redoLabel:  this.redoLabel,
      snapshots:  this._stack.map(s => ({
        id:        s.id,
        label:     s.label,
        timestamp: s.timestamp
      }))
    });
  }
}

/* ================================================================
   FACTORY — Create a singleton HistoryManager for the app
================================================================ */

let _instance = null;

/**
 * Get or create the global HistoryManager instance.
 * @param {object} [options]
 * @returns {HistoryManager}
 */
export function getHistory(options = {}) {
  if (!_instance) {
    _instance = new HistoryManager(options);
  }
  return _instance;
}

/**
 * Reset the global instance (used on new image load).
 * @param {object} [options]
 * @returns {HistoryManager}
 */
export function resetHistory(options = {}) {
  _instance = new HistoryManager(options);
  return _instance;
}
