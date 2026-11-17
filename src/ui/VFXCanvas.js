/**
 * Shared HiDPI 2D Canvas Visual Effects Engine (`F-UI-01` & `F-R2-02`)
 * Renders 60fps comet-trail projectiles, quadratic Bézier Auto-Devour suction arcs & chomp shockwaves,
 * dual-ring chain explosions, 3-sheath 5-second plasma laser sweeps, outlined crit damage popups,
 * and Screen Shake (Tiers 0..4).
 *
 * Dual-environment & `T5-06` Spy-Safe:
 *  - Works in real Browser (`<canvas>` + HiDPI `devicePixelRatio` + `resolveAnchor`)
 *    and headless Node / `MockElement` (`node --test`).
 *  - Every Canvas2D call outside `{ clearRect, save, restore, translate, beginPath, moveTo, lineTo, stroke, arc, fill, fillText }`
 *    is feature-detected with graceful fallback drawing calls.
 */

import { safeClamp } from '../core/BigNumber.js';

export const SHAKE_AMPLITUDE_BY_TIER = Object.freeze({
  0: 0,
  1: 3,
  2: 7,
  3: 14,
  4: 24,
});

const MAX_PROJECTILES = 96;
const MAX_DEVOUR_EFFECTS = 64;
const MAX_EXPLOSIONS = 32;
const MAX_LASERS = 8;
const MAX_FLOATING_TEXTS = 96;
const MAX_SPARKS = 96;

function pushCapped(arr, item, maxLen) {
  if (arr.length >= maxLen) {
    arr.shift();
  }
  arr.push(item);
  return item;
}

function evalQuadBezier(p0, p1, p2, t) {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
}

function finiteOr(val, fallback) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof val === 'bigint') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function safeText(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : fallback;
  if (typeof val === 'boolean' || typeof val === 'bigint') return String(val);
  if (typeof val === 'symbol') return fallback;
  try {
    return String(val);
  } catch {
    return fallback;
  }
}

function isValidClientRect(rect) {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height)
  );
}

export class VFXCanvas {
  constructor(containerOrCanvas = null) {
    this.containerEl = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 960;
    this.height = 540;
    this.dpr = 1;

    this.projectiles = [];
    this.devourEffects = [];
    this.explosions = [];
    this.lasers = [];
    this.floatingTexts = [];
    this.sparks = [];

    this.shakeState = {
      intensityTier: 0,
      amplitudePx: 0,
      remainingMs: 0,
      durationMs: 0,
      offsetX: 0,
      offsetY: 0,
    };

    this._rafId = null;
    this._lastFrameTime = null;

    if (containerOrCanvas) {
      this.mount(containerOrCanvas);
    }
  }

  /**
   * Mounts or attaches the 2D VFX overlay canvas into `containerEl`.
   * @param {HTMLElement|HTMLCanvasElement|object} containerEl
   */
  mount(containerEl) {
    if (!containerEl || typeof containerEl !== 'object') return this;

    // If a <canvas> element (or mock canvas with getContext) is passed directly
    if (typeof containerEl.getContext === 'function') {
      this.canvas = containerEl;
      this.containerEl = containerEl.parentElement || containerEl.parentNode || null;
      try {
        this.ctx = containerEl.getContext('2d');
      } catch {
        this.ctx = null;
      }
      const initW = finiteOr(containerEl.width, 960);
      const initH = finiteOr(containerEl.height, 540);
      this.width = initW > 0 ? Math.round(initW) : 960;
      this.height = initH > 0 ? Math.round(initH) : 540;
      this.syncDimensions();
      return this;
    }

    this.containerEl = containerEl;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      let existing = null;
      if (typeof containerEl.querySelector === 'function') {
        try {
          existing = containerEl.querySelector('canvas[data-testid="vfx-canvas"]');
        } catch {
          existing = null;
        }
      }

      this.canvas = existing || document.createElement('canvas');
      this.canvas.className = 'vfx-overlay-canvas';
      if (typeof this.canvas.setAttribute === 'function') {
        this.canvas.setAttribute('data-testid', 'vfx-canvas');
      }
      this.canvas.width = this.width;
      this.canvas.height = this.height;

      if (!existing && typeof containerEl.appendChild === 'function') {
        containerEl.appendChild(this.canvas);
      }

      try {
        this.ctx = this.canvas.getContext('2d');
      } catch {
        this.ctx = null;
      }
      this.syncDimensions();
    }

    return this;
  }

  /**
   * Synchronizes logical CSS dimensions (`this.width`, `this.height`) and HiDPI backing-store pixels.
   * Preserves `960×540` (`dpr = 1`) in Node / `SlotboundE2EMockBrowser`.
   */
  syncDimensions() {
    this.width = Number.isFinite(this.width) && this.width > 0 ? this.width : 960;
    this.height = Number.isFinite(this.height) && this.height > 0 ? this.height : 540;

    if (!this.canvas || typeof this.canvas !== 'object') {
      return { width: this.width, height: this.height, dpr: this.dpr };
    }

    const isMockEnv =
      typeof navigator !== 'undefined' && navigator.userAgent === 'SlotboundE2EMockBrowser';

    if (!isMockEnv && typeof this.canvas.getBoundingClientRect === 'function') {
      let rect = null;
      try {
        rect = this.canvas.getBoundingClientRect();
      } catch {
        rect = null;
      }
      if (isValidClientRect(rect) && rect.width >= 60 && rect.height >= 60) {
        const cssW = Math.round(rect.width);
        const cssH = Math.round(rect.height);
        const rawDpr =
          typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
            ? window.devicePixelRatio
            : 1;
        const dpr = safeClamp(rawDpr, 1, 2);
        const bufW = Math.round(cssW * dpr);
        const bufH = Math.round(cssH * dpr);
        if (this.canvas.width !== bufW || this.canvas.height !== bufH) {
          try {
            this.canvas.width = bufW;
            this.canvas.height = bufH;
          } catch {
            // Read-only mock canvas property safe
          }
        }
        this.width = cssW;
        this.height = cssH;
        this.dpr = dpr;
        return { width: this.width, height: this.height, dpr: this.dpr };
      }
    }

    const attrW = finiteOr(this.canvas.width, 960);
    const attrH = finiteOr(this.canvas.height, 540);
    this.width = attrW > 0 ? Math.round(attrW) : 960;
    this.height = attrH > 0 ? Math.round(attrH) : 540;
    if (!Number.isFinite(this.canvas.width) || this.canvas.width <= 0) {
      try {
        this.canvas.width = this.width;
      } catch {
        // Read-only mock canvas property safe
      }
    }
    if (!Number.isFinite(this.canvas.height) || this.canvas.height <= 0) {
      try {
        this.canvas.height = this.height;
      } catch {
        // Read-only mock canvas property safe
      }
    }
    this.dpr = 1;
    return { width: this.width, height: this.height, dpr: this.dpr };
  }

  /**
   * Resolves a DOM element, CSS selector, shorthand keyword (`'maw'`, `'boss'`), or cell index (`0..15` / `'0'..'15'`)
   * into canvas-local `{ x, y }` CSS coordinates.
   * @param {HTMLElement|string|number|object|null} elOrSelector
   * @param {number|null} [fallbackX=null]
   * @param {number|null} [fallbackY=null]
   * @returns {{ x: number, y: number }}
   */
  resolveAnchor(elOrSelector, fallbackX = null, fallbackY = null) {
    const safeW = Number.isFinite(this.width) && this.width > 0 ? this.width : 960;
    const safeH = Number.isFinite(this.height) && this.height > 0 ? this.height : 540;
    const defX = finiteOr(fallbackX, safeW * 0.5);
    const defY = finiteOr(fallbackY, safeH * 0.5);

    if (
      elOrSelector === null ||
      elOrSelector === undefined ||
      typeof elOrSelector === 'boolean' ||
      typeof elOrSelector === 'symbol' ||
      typeof elOrSelector === 'function'
    ) {
      return { x: defX, y: defY };
    }

    if (
      typeof elOrSelector === 'object' &&
      typeof elOrSelector.x === 'number' &&
      typeof elOrSelector.y === 'number'
    ) {
      return {
        x: finiteOr(elOrSelector.x, defX),
        y: finiteOr(elOrSelector.y, defY),
      };
    }

    const isMockEnv =
      typeof navigator !== 'undefined' && navigator.userAgent === 'SlotboundE2EMockBrowser';
    const root =
      this.containerEl ||
      this.canvas?.parentElement ||
      (typeof document !== 'undefined' ? document : null);

    const safeQuery = (scope, sel) => {
      if (!scope || typeof scope.querySelector !== 'function') return null;
      try {
        return scope.querySelector(sel);
      } catch {
        return null;
      }
    };

    const measureCenter = (el) => {
      if (
        !el ||
        isMockEnv ||
        typeof el.getBoundingClientRect !== 'function' ||
        !this.canvas ||
        typeof this.canvas.getBoundingClientRect !== 'function'
      ) {
        return null;
      }
      let cRect = null;
      let eRect = null;
      try {
        cRect = this.canvas.getBoundingClientRect();
        eRect = el.getBoundingClientRect();
      } catch {
        return null;
      }
      if (
        isValidClientRect(cRect) &&
        isValidClientRect(eRect) &&
        cRect.width > 0 &&
        cRect.height > 0 &&
        eRect.width > 0 &&
        eRect.height > 0
      ) {
        return {
          x: safeClamp(eRect.left - cRect.left + eRect.width * 0.5, 0, safeW),
          y: safeClamp(eRect.top - cRect.top + eRect.height * 0.5, 0, safeH),
        };
      }
      return null;
    };

    let cellIndex = null;
    if (typeof elOrSelector === 'number') {
      if (!Number.isFinite(elOrSelector)) {
        return { x: defX, y: defY };
      }
      cellIndex = Math.max(0, Math.floor(elOrSelector));
    } else if (typeof elOrSelector === 'string') {
      const trimmed = elOrSelector.trim();
      if (!trimmed) {
        return { x: defX, y: defY };
      }
      if (/^\d+$/.test(trimmed)) {
        const parsedIdx = Number.parseInt(trimmed, 10);
        if (Number.isSafeInteger(parsedIdx) && parsedIdx >= 0) {
          cellIndex = parsedIdx;
        } else {
          return { x: defX, y: defY };
        }
      }
    }

    if (cellIndex !== null) {
      const idx = cellIndex;
      const selector = `[data-testid="devour-cell-${idx}"], [data-testid="chamber-${idx}"], [data-testid="td-pedestal-${idx}"], [data-testid="matrix-cell-${idx}"], [data-testid="pachinko-crucible-${idx}"]`;
      const targetEl =
        safeQuery(root, selector) ||
        (typeof document !== 'undefined' ? safeQuery(document, selector) : null);

      const measured = measureCenter(targetEl);
      if (measured) {
        return measured;
      }

      // Deterministic grid coordinate fallback for Node / MockElement so distinct cells produce distinct arcs
      const cols = idx >= 9 ? 4 : 3;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        x: Math.round(safeW * 0.3 + col * (safeW * 0.18)),
        y: Math.round(safeH * 0.34 + row * (safeH * 0.17)),
      };
    }

    let targetEl = null;
    if (typeof elOrSelector === 'string') {
      let selector = elOrSelector.trim();
      if (!selector) return { x: defX, y: defY };
      if (selector === 'maw' || selector === 'abyssal-maw') {
        selector = '[data-testid="abyssal-maw"]';
      } else if (selector === 'boss') {
        selector =
          '[data-testid="boss-portrait-svg"], [data-testid="boss-arena-card"], [data-testid="hud-enemy-hp"]';
      }
      targetEl =
        safeQuery(root, selector) ||
        (typeof document !== 'undefined' ? safeQuery(document, selector) : null);
    } else if (typeof elOrSelector === 'object') {
      targetEl = elOrSelector;
    }

    const measured = measureCenter(targetEl);
    if (measured) {
      return measured;
    }

    return { x: defX, y: defY };
  }

  resolveElementCenter(elOrSelector, fallbackX = null, fallbackY = null) {
    return this.resolveAnchor(elOrSelector, fallbackX, fallbackY);
  }

  /**
   * Stops any active animation loop and detaches the canvas element.
   */
  unmount() {
    this.stopLoop();
    if (this.canvas && this.canvas.parentNode && typeof this.canvas.parentNode.removeChild === 'function') {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.containerEl = null;
  }

  startLoop() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    if (this._rafId !== null) return;

    this._lastFrameTime = performance.now();
    const tick = (now) => {
      const dt = Math.min(100, Math.max(1, now - (this._lastFrameTime || now)));
      this._lastFrameTime = now;
      this.step(dt);
      this._rafId = window.requestAnimationFrame(tick);
    };
    this._rafId = window.requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this._rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
  }

  /**
   * Spawns a Slot-as-Combat comet projectile flying from a slot cell/turret toward the enemy target.
   */
  spawnProjectile(rawOpts = {}) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    let fromX;
    let fromY;
    if (opts.fromX !== undefined || opts.x !== undefined || opts.from?.x !== undefined) {
      fromX = finiteOr(opts.fromX ?? opts.x ?? opts.from?.x, 480);
      fromY = finiteOr(opts.fromY ?? opts.y ?? opts.from?.y, 380);
    } else if (opts.fromEl || opts.fromSelector || opts.fromCell !== undefined) {
      const pt = this.resolveAnchor(opts.fromEl ?? opts.fromSelector ?? opts.fromCell, 480, 380);
      fromX = pt.x;
      fromY = pt.y;
    } else {
      fromX = 480;
      fromY = 380;
    }

    let toX;
    let toY;
    if (opts.toX !== undefined || opts.targetX !== undefined || opts.to?.x !== undefined) {
      toX = finiteOr(opts.toX ?? opts.targetX ?? opts.to?.x, 480);
      toY = finiteOr(opts.toY ?? opts.targetY ?? opts.to?.y, 110);
    } else if (opts.toEl || opts.toSelector || opts.toCell !== undefined) {
      const pt = this.resolveAnchor(opts.toEl ?? opts.toSelector ?? opts.toCell, 480, 110);
      toX = pt.x;
      toY = pt.y;
    } else {
      toX = 480;
      toY = 110;
    }

    const durationMs = Math.max(50, finiteOr(opts.durationMs, 260));

    const item = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fromX,
      fromY,
      toX,
      toY,
      x: fromX,
      y: fromY,
      trail: [{ x: fromX, y: fromY }],
      color: safeText(opts.color, '#ffd166') || '#ffd166',
      radius: Math.max(2, finiteOr(opts.radius, 6)),
      style: safeText(opts.style, 'orb') || 'orb',
      elapsedMs: 0,
      durationMs,
    };
    return pushCapped(this.projectiles, item, MAX_PROJECTILES);
  }

  /**
   * Spawns a curved quadratic Bézier Auto-Devour suction arc + morsels from prey cell to predator/maw.
   */
  spawnDevourEffect(rawOpts = {}) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    let fromX;
    let fromY;
    if (opts.fromX !== undefined || opts.from?.x !== undefined) {
      fromX = finiteOr(opts.fromX ?? opts.from?.x, 360);
      fromY = finiteOr(opts.fromY ?? opts.from?.y, 300);
    } else if (opts.fromEl || opts.fromSelector || opts.fromCell !== undefined) {
      const pt = this.resolveAnchor(opts.fromEl ?? opts.fromSelector ?? opts.fromCell, 360, 300);
      fromX = pt.x;
      fromY = pt.y;
    } else {
      fromX = 360;
      fromY = 300;
    }

    let toX;
    let toY;
    if (opts.toX !== undefined || opts.to?.x !== undefined) {
      toX = finiteOr(opts.toX ?? opts.to?.x, 480);
      toY = finiteOr(opts.toY ?? opts.to?.y, 260);
    } else if (opts.toEl || opts.toSelector || opts.toCell !== undefined) {
      const pt = this.resolveAnchor(opts.toEl ?? opts.toSelector ?? opts.toCell, 480, 260);
      toX = pt.x;
      toY = pt.y;
    } else {
      toX = 480;
      toY = 260;
    }

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const curveSign = this.devourEffects.length % 2 === 0 ? -1 : 1;
    const bend = Math.min(72, Math.max(24, dist * 0.28)) * curveSign;
    const ctrlX = (fromX + toX) * 0.5 + (-dy / dist) * bend;
    const ctrlY = (fromY + toY) * 0.5 + (dx / dist) * bend;

    const durationMs = Math.max(60, finiteOr(opts.durationMs, 320));

    const effect = {
      id: `devour_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fromX,
      fromY,
      ctrlX,
      ctrlY,
      toX,
      toY,
      fromCell: opts.fromCell ?? null,
      toCell: opts.toCell ?? null,
      label: safeText(opts.label, '+DEVOUR') || '+DEVOUR',
      color: safeText(opts.color, '#f77f00') || '#f77f00',
      elapsedMs: 0,
      durationMs,
    };
    return pushCapped(this.devourEffects, effect, MAX_DEVOUR_EFFECTS);
  }

  spawnDevourBurst(opts = {}) {
    return this.spawnDevourEffect(opts);
  }

  spawnDevourParticles(opts = {}) {
    return this.spawnDevourEffect(opts);
  }

  /**
   * Spawns a stomach chain explosion or tactical nuke shockwave.
   */
  spawnChainExplosion(rawOpts = {}) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    let x = finiteOr(opts.x, 480);
    let y = finiteOr(opts.y, 220);
    if (opts.x === undefined && (opts.anchorEl || opts.selector)) {
      const pt = this.resolveAnchor(opts.anchorEl ?? opts.selector, 480, 220);
      x = pt.x;
      y = pt.y;
    }
    const radius = Math.max(10, finiteOr(opts.radius, 110));
    const intensity = safeClamp(finiteOr(opts.intensity, 2), 1, 4);
    const durationMs = Math.max(80, finiteOr(opts.durationMs, 450));

    const explosion = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      radius,
      intensity,
      color: safeText(opts.color, '#ef476f') || '#ef476f',
      elapsedMs: 0,
      durationMs,
    };
    return pushCapped(this.explosions, explosion, MAX_EXPLOSIONS);
  }

  spawnExplosion(opts = {}) {
    return this.spawnChainExplosion(opts);
  }

  /**
   * Spawns a 5-Second Berserk Hyper Laser Sweep across the battlefield (Scheme 3 Straight / Yahtzee).
   */
  spawnLaserSweep(rawOpts = {}) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    const durationMs = Math.max(100, finiteOr(opts.durationMs, 5000));
    const laser = {
      id: `laser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      y: finiteOr(opts.y, 200),
      width: Math.max(6, finiteOr(opts.width, 32)),
      color: safeText(opts.color, '#06d6a0') || '#06d6a0',
      elapsedMs: 0,
      durationMs,
    };
    return pushCapped(this.lasers, laser, MAX_LASERS);
  }

  triggerLaserSweep(durationMs = 5000) {
    return this.spawnLaserSweep({ durationMs });
  }

  /**
   * Spawns a floating crit-scaled damage/multiplier text popup.
   */
  spawnFloatingText(rawOpts = {}) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    let x = finiteOr(opts.x, 480);
    let y = finiteOr(opts.y, 180);
    if (opts.x === undefined && (opts.anchorEl || opts.selector)) {
      const pt = this.resolveAnchor(opts.anchorEl ?? opts.selector, 480, 180);
      x = pt.x;
      y = pt.y;
    }
    const tier = safeClamp(
      Math.floor(finiteOr(opts.tier ?? opts.intensityTier, 1)),
      0,
      4
    );

    const popup = {
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      text: safeText(opts.text, '+100'),
      tier,
      color: safeText(opts.color, '#ffd166') || '#ffd166',
      elapsedMs: 0,
      durationMs: Math.max(100, finiteOr(opts.durationMs, 650)),
    };
    return pushCapped(this.floatingTexts, popup, MAX_FLOATING_TEXTS);
  }

  /**
   * Triggers Screen Shake with Intensity Tier `0..4`.
   * @param {number} [intensityTier=1]
   * @param {number} [durationMs=300]
   */
  triggerScreenShake(intensityTier = 1, durationMs = 300) {
    const tier = safeClamp(Math.floor(finiteOr(intensityTier, 1)), 0, 4);
    const dur = tier === 0 ? 0 : Math.max(50, finiteOr(durationMs, 300));
    const amplitudePx = SHAKE_AMPLITUDE_BY_TIER[tier] ?? 0;

    this.shakeState = {
      intensityTier: tier,
      amplitudePx,
      remainingMs: dur,
      durationMs: dur,
      offsetX: amplitudePx > 0 ? amplitudePx * 0.7 : 0,
      offsetY: amplitudePx > 0 ? -amplitudePx * 0.7 : 0,
    };

    const targetEl =
      this.containerEl || (typeof document !== 'undefined' ? document.body : null);
    if (targetEl && targetEl.classList && typeof targetEl.classList.remove === 'function') {
      targetEl.classList.remove('shake-tier-1', 'shake-tier-2', 'shake-tier-3', 'shake-tier-4');
      if (tier > 0) {
        targetEl.classList.add(`shake-tier-${tier}`);
      }
    }

    return { ...this.shakeState };
  }

  triggerShake(intensityTier = 1, durationMs = 300) {
    return this.triggerScreenShake(intensityTier, durationMs);
  }

  shake(intensityTier = 1, durationMs = 300) {
    return this.triggerScreenShake(intensityTier, durationMs);
  }

  _spawnImpactSparks(x, y, color, overrunMs = 0) {
    const sparkLifeMs = 220;
    if (overrunMs >= sparkLifeMs) return;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.35;
      const speed = 95 + (i % 2) * 45;
      pushCapped(
        this.sparks,
        {
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          color,
          elapsedMs: overrunMs,
          durationMs: sparkLifeMs,
        },
        MAX_SPARKS
      );
    }
  }

  /**
   * Deterministically advances all active visual effects and screen shake by `dtMs`.
   * @param {number} [dtMs=16.67]
   */
  step(dtMs = 16.67) {
    const dt = Math.max(0, finiteOr(dtMs, 16.67));

    // Advance projectiles & emit impact sparks when still within active frame window
    const nextProjectiles = [];
    for (const p of this.projectiles) {
      p.elapsedMs += dt;
      const t = Math.min(1, p.elapsedMs / p.durationMs);
      p.x = p.fromX + (p.toX - p.fromX) * t;
      p.y = p.fromY + (p.toY - p.fromY) * t;
      if (Array.isArray(p.trail)) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
      if (p.elapsedMs < p.durationMs) {
        nextProjectiles.push(p);
      } else {
        this._spawnImpactSparks(p.toX, p.toY, p.color, p.elapsedMs - p.durationMs);
      }
    }
    this.projectiles = nextProjectiles;

    // Advance impact sparks
    const dtSec = dt / 1000;
    this.sparks = this.sparks.filter((s) => {
      s.elapsedMs += dt;
      s.x += s.vx * dtSec;
      s.y += s.vy * dtSec;
      s.vy += 220 * dtSec;
      return s.elapsedMs < s.durationMs;
    });

    // Advance devour suction trails
    this.devourEffects = this.devourEffects.filter((d) => {
      d.elapsedMs += dt;
      return d.elapsedMs < d.durationMs;
    });

    // Advance explosions
    this.explosions = this.explosions.filter((e) => {
      e.elapsedMs += dt;
      return e.elapsedMs < e.durationMs;
    });

    // Advance 5s laser sweeps
    this.lasers = this.lasers.filter((l) => {
      l.elapsedMs += dt;
      const progress = l.elapsedMs / l.durationMs;
      l.y = this.height * 0.16 + (Math.sin(progress * Math.PI * 6) * 0.5 + 0.5) * (this.height * 0.56);
      return l.elapsedMs < l.durationMs;
    });

    // Advance floating texts
    this.floatingTexts = this.floatingTexts.filter((f) => {
      f.elapsedMs += dt;
      const decel = Math.max(0.25, 1 - f.elapsedMs / f.durationMs);
      f.y -= dt * 0.065 * decel;
      return f.elapsedMs < f.durationMs;
    });

    // Advance screen shake
    if (this.shakeState.remainingMs > 0) {
      this.shakeState.remainingMs = Math.max(0, this.shakeState.remainingMs - dt);
      if (this.shakeState.remainingMs === 0) {
        this.shakeState.intensityTier = 0;
        this.shakeState.amplitudePx = 0;
        this.shakeState.offsetX = 0;
        this.shakeState.offsetY = 0;
        const targetEl =
          this.containerEl || (typeof document !== 'undefined' ? document.body : null);
        if (targetEl && targetEl.classList && typeof targetEl.classList.remove === 'function') {
          targetEl.classList.remove('shake-tier-1', 'shake-tier-2', 'shake-tier-3', 'shake-tier-4');
        }
      } else {
        const decay = this.shakeState.remainingMs / Math.max(1, this.shakeState.durationMs);
        const phase = this.shakeState.remainingMs * 0.15;
        this.shakeState.offsetX = Math.cos(phase) * this.shakeState.amplitudePx * decay;
        this.shakeState.offsetY = Math.sin(phase * 1.3) * this.shakeState.amplitudePx * decay;
      }
    }

    this.render();
    return this.getActiveCounts();
  }

  /**
   * Renders all active VFX onto the 2D canvas context (`100% T5-06 mockCtx safe`).
   */
  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.syncDimensions();

    ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);

    ctx.save();
    if (this.dpr !== 1 && typeof ctx.scale === 'function') {
      ctx.scale(this.dpr, this.dpr);
    }
    if (this.shakeState.remainingMs > 0) {
      ctx.translate(this.shakeState.offsetX, this.shakeState.offsetY);
    }

    // 1. Render 3-Sheath 5s Plasma Laser Sweeps
    for (const l of this.lasers) {
      ctx.save();
      // Outer plasma halo
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width * 1.65;
      ctx.globalAlpha = 0.26;
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(this.width, l.y);
      ctx.stroke();

      // Golden thermal sheath
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = l.width * 0.72;
      ctx.globalAlpha = 0.68;
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(this.width, l.y);
      ctx.stroke();

      // Incandescent core
      ctx.strokeStyle = '#fffdf7';
      ctx.lineWidth = Math.max(3, l.width * 0.25);
      ctx.globalAlpha = 0.96;
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(this.width, l.y);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render Curved Quadratic Bézier Devour Suction Arcs + Morsels + Chomp Ring
    for (const d of this.devourEffects) {
      const t = Math.min(1, d.elapsedMs / d.durationMs);
      const ctrlX = d.ctrlX ?? (d.fromX + d.toX) * 0.5;
      const ctrlY = d.ctrlY ?? (d.fromY + d.toY) * 0.5 - 32;

      ctx.save();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = Math.max(1.5, 4.5 * (1 - t * 0.45));
      ctx.globalAlpha = Math.max(0.15, 1 - t * 0.6);
      ctx.beginPath();
      ctx.moveTo(d.fromX, d.fromY);
      if (typeof ctx.quadraticCurveTo === 'function') {
        const curCtrlX = d.fromX + (ctrlX - d.fromX) * t;
        const curCtrlY = d.fromY + (ctrlY - d.fromY) * t;
        const endX = evalQuadBezier(d.fromX, ctrlX, d.toX, t);
        const endY = evalQuadBezier(d.fromY, ctrlY, d.toY, t);
        ctx.quadraticCurveTo(curCtrlX, curCtrlY, endX, endY);
      } else {
        for (let seg = 1; seg <= 4; seg++) {
          const st = (t * seg) / 4;
          ctx.lineTo(
            evalQuadBezier(d.fromX, ctrlX, d.toX, st),
            evalQuadBezier(d.fromY, ctrlY, d.toY, st)
          );
        }
      }
      ctx.stroke();

      // Traveling morsel orbs along Bézier arc
      for (let m = 0; m < 3; m++) {
        const mt = safeClamp(t - m * 0.14, 0, 1);
        const mx = evalQuadBezier(d.fromX, ctrlX, d.toX, mt);
        const my = evalQuadBezier(d.fromY, ctrlY, d.toY, mt);
        ctx.fillStyle = m === 0 ? '#fff3b0' : d.color;
        ctx.globalAlpha = Math.max(0.2, 0.92 - m * 0.22);
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(2, 5 - m), 0, Math.PI * 2);
        ctx.fill();
      }

      // Chomp shockwave ring at predator/maw target
      if (t >= 0.32) {
        const ct = (t - 0.32) / 0.68;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = Math.max(1, 3 * (1 - ct));
        ctx.globalAlpha = Math.max(0, 0.85 * (1 - ct));
        ctx.beginPath();
        ctx.arc(d.toX, d.toY, 6 + ct * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Render Comet-Trail Projectiles & Impact Sparks
    for (const p of this.projectiles) {
      ctx.save();
      if (Array.isArray(p.trail) && p.trail.length >= 2) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2, p.radius * 0.9);
        ctx.globalAlpha = 0.48;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) {
          ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        ctx.stroke();
      }

      // Outer energy halo
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // White-hot core
      ctx.fillStyle = '#fff9db';
      ctx.globalAlpha = 0.96;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, p.radius * 0.85), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const s of this.sparks) {
      const st = Math.min(1, s.elapsedMs / s.durationMs);
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.max(0, 1 - st);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Render Multi-Ring Chain Explosions
    for (const e of this.explosions) {
      const t = Math.min(1, e.elapsedMs / e.durationMs);
      ctx.save();
      if (t < 0.55) {
        const flashR = Math.max(4, e.radius * (0.25 + t * 0.7));
        if (typeof ctx.createRadialGradient === 'function') {
          const grad = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, flashR);
          grad.addColorStop(0, '#fff9db');
          grad.addColorStop(0.5, '#f77f00');
          grad.addColorStop(1, 'rgba(239, 71, 111, 0)');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = e.color;
        }
        ctx.globalAlpha = Math.max(0, (1 - t / 0.55) * 0.65);
        ctx.beginPath();
        ctx.arc(e.x, e.y, flashR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer blast ring
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(1, 6 * (1 - t));
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(2, e.radius * t), 0, Math.PI * 2);
      ctx.stroke();

      // Inner brass Mach shockwave
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(1, 3.5 * (1 - t));
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.85);
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(1.5, e.radius * t * 0.62), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Render Crit-Scaled Outlined Damage Popups
    for (const f of this.floatingTexts) {
      const t = Math.min(1, f.elapsedMs / f.durationMs);
      const popScale = t < 0.18 ? 1 + 0.3 * (1 - t / 0.18) : 1;
      const fontSize = Math.round((16 + f.tier * 5) * popScale);
      ctx.save();
      ctx.globalAlpha = Math.max(0, t > 0.7 ? (1 - t) / 0.3 : 1);
      ctx.font = `800 ${fontSize}px "JetBrains Mono", monospace`;
      if (typeof ctx.strokeText === 'function') {
        ctx.strokeStyle = '#090807';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y);
      }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Clears all active visual effects and resets screen shake.
   */
  clear() {
    this.projectiles.length = 0;
    this.devourEffects.length = 0;
    this.explosions.length = 0;
    this.lasers.length = 0;
    this.floatingTexts.length = 0;
    this.sparks.length = 0;
    this.triggerScreenShake(0, 0);
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
    }
  }

  getActiveCount() {
    return (
      this.projectiles.length +
      this.devourEffects.length +
      this.explosions.length +
      this.lasers.length +
      this.floatingTexts.length +
      this.sparks.length
    );
  }

  getActiveCounts() {
    return {
      projectiles: this.projectiles.length,
      devourEffects: this.devourEffects.length,
      explosions: this.explosions.length,
      lasers: this.lasers.length,
      floatingTexts: this.floatingTexts.length,
      sparks: this.sparks.length,
      shakeTier: this.shakeState.intensityTier,
    };
  }

  getShakeState() {
    return { ...this.shakeState };
  }

  getState() {
    return {
      ...this.getActiveCounts(),
      shakeState: { ...this.shakeState },
    };
  }
}

export function createVFXCanvas(containerOrCanvas = null) {
  return new VFXCanvas(containerOrCanvas);
}

export default VFXCanvas;
