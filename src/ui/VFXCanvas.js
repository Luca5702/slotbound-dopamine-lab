/**
 * Shared 2D Canvas Visual Effects Engine (`F-UI-01`)
 * Renders 60fps projectiles, Auto-Devour suction particles, stomach chain explosions,
 * 5-second Berserk Hyper Laser sweeps, floating damage popups, and Screen Shake (Tiers 0..4).
 *
 * Dual-environment safe: Works both in Browser (`<canvas>` + `requestAnimationFrame`)
 * and in headless Node (`node --test`) via deterministic `step(dtMs)` simulation.
 */

import { sanitizeNumber, safeClamp } from '../core/BigNumber.js';

export const SHAKE_AMPLITUDE_BY_TIER = Object.freeze({
  0: 0,
  1: 3,
  2: 7,
  3: 14,
  4: 24,
});

export class VFXCanvas {
  constructor(containerOrCanvas = null) {
    this.containerEl = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 960;
    this.height = 540;

    this.projectiles = [];
    this.devourEffects = [];
    this.explosions = [];
    this.lasers = [];
    this.floatingTexts = [];

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
    if (!containerEl) return this;

    // If a <canvas> element (or mock canvas with getContext) is passed directly
    if (typeof containerEl.getContext === 'function') {
      this.canvas = containerEl;
      this.ctx = containerEl.getContext('2d');
      this.width = Number(containerEl.width) || 960;
      this.height = Number(containerEl.height) || 540;
      return this;
    }

    this.containerEl = containerEl;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const existing =
        typeof containerEl.querySelector === 'function'
          ? containerEl.querySelector('canvas[data-testid="vfx-canvas"]')
          : null;

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
    }

    return this;
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
   * Spawns a Slot-as-Combat projectile flying from a slot cell/turret toward the enemy target.
   */
  spawnProjectile(opts = {}) {
    const fromX = sanitizeNumber(opts.fromX ?? opts.from?.x ?? 480, 480);
    const fromY = sanitizeNumber(opts.fromY ?? opts.from?.y ?? 380, 380);
    const toX = sanitizeNumber(opts.toX ?? opts.to?.x ?? 480, 480);
    const toY = sanitizeNumber(opts.toY ?? opts.to?.y ?? 110, 110);
    const durationMs = Math.max(50, sanitizeNumber(opts.durationMs, 260));

    const item = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fromX,
      fromY,
      toX,
      toY,
      x: fromX,
      y: fromY,
      color: String(opts.color || '#ffca3a'),
      radius: Math.max(2, sanitizeNumber(opts.radius, 6)),
      style: String(opts.style || 'orb'),
      elapsedMs: 0,
      durationMs,
    };
    this.projectiles.push(item);
    return item;
  }

  /**
   * Spawns an Auto-Devour bite & suction particle trail from prey cell to predator/maw.
   */
  spawnDevourEffect(opts = {}) {
    const fromX = sanitizeNumber(opts.fromX ?? opts.from?.x ?? 360, 360);
    const fromY = sanitizeNumber(opts.fromY ?? opts.from?.y ?? 300, 300);
    const toX = sanitizeNumber(opts.toX ?? opts.to?.x ?? 480, 480);
    const toY = sanitizeNumber(opts.toY ?? opts.to?.y ?? 260, 260);
    const durationMs = Math.max(60, sanitizeNumber(opts.durationMs, 320));

    const effect = {
      id: `devour_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fromX,
      fromY,
      toX,
      toY,
      fromCell: opts.fromCell ?? null,
      toCell: opts.toCell ?? null,
      label: String(opts.label || '+DEVOUR'),
      color: String(opts.color || '#ff3366'),
      elapsedMs: 0,
      durationMs,
    };
    this.devourEffects.push(effect);
    return effect;
  }

  /**
   * Spawns a stomach chain explosion or tactical nuke shockwave.
   */
  spawnChainExplosion(opts = {}) {
    const x = sanitizeNumber(opts.x, 480);
    const y = sanitizeNumber(opts.y, 220);
    const radius = Math.max(10, sanitizeNumber(opts.radius, 110));
    const intensity = safeClamp(sanitizeNumber(opts.intensity, 2), 1, 4);
    const durationMs = Math.max(80, sanitizeNumber(opts.durationMs, 450));

    const explosion = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      radius,
      intensity,
      color: String(opts.color || '#ff595e'),
      elapsedMs: 0,
      durationMs,
    };
    this.explosions.push(explosion);
    return explosion;
  }

  spawnExplosion(opts = {}) {
    return this.spawnChainExplosion(opts);
  }

  /**
   * Spawns a 5-Second Berserk Hyper Laser Sweep across the battlefield (Scheme 3 Straight / Yahtzee).
   */
  spawnLaserSweep(opts = {}) {
    const durationMs = Math.max(100, sanitizeNumber(opts.durationMs, 5000));
    const laser = {
      id: `laser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      y: sanitizeNumber(opts.y, 200),
      width: Math.max(6, sanitizeNumber(opts.width, 32)),
      color: String(opts.color || '#00f5d4'),
      elapsedMs: 0,
      durationMs,
    };
    this.lasers.push(laser);
    return laser;
  }

  /**
   * Spawns a floating damage/multiplier text popup.
   */
  spawnFloatingText(opts = {}) {
    const popup = {
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      x: sanitizeNumber(opts.x, 480),
      y: sanitizeNumber(opts.y, 180),
      text: String(opts.text ?? '+100'),
      tier: safeClamp(Math.floor(sanitizeNumber(opts.tier, 1)), 0, 4),
      color: String(opts.color || '#fee440'),
      elapsedMs: 0,
      durationMs: Math.max(100, sanitizeNumber(opts.durationMs, 650)),
    };
    this.floatingTexts.push(popup);
    return popup;
  }

  /**
   * Triggers Screen Shake with Intensity Tier `0..4`.
   * @param {number} [intensityTier=1]
   * @param {number} [durationMs=300]
   */
  triggerScreenShake(intensityTier = 1, durationMs = 300) {
    const tier = safeClamp(Math.floor(sanitizeNumber(intensityTier, 1)), 0, 4);
    const dur = tier === 0 ? 0 : Math.max(50, sanitizeNumber(durationMs, 300));
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

  /**
   * Deterministically advances all active visual effects and screen shake by `dtMs`.
   * @param {number} [dtMs=16.67]
   */
  step(dtMs = 16.67) {
    const dt = Math.max(0, sanitizeNumber(dtMs, 16.67));

    // Advance projectiles
    this.projectiles = this.projectiles.filter((p) => {
      p.elapsedMs += dt;
      const t = Math.min(1, p.elapsedMs / p.durationMs);
      p.x = p.fromX + (p.toX - p.fromX) * t;
      p.y = p.fromY + (p.toY - p.fromY) * t;
      return p.elapsedMs < p.durationMs;
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
      l.y = 80 + Math.sin(progress * Math.PI * 6) * 140 + 140;
      return l.elapsedMs < l.durationMs;
    });

    // Advance floating texts
    this.floatingTexts = this.floatingTexts.filter((f) => {
      f.elapsedMs += dt;
      f.y -= dt * 0.05;
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
   * Renders all active VFX onto the 2D canvas context if mounted in a browser.
   */
  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    if (this.shakeState.remainingMs > 0) {
      ctx.translate(this.shakeState.offsetX, this.shakeState.offsetY);
    }

    // 1. Render 5s Berserk Laser Sweeps
    for (const l of this.lasers) {
      ctx.save();
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(this.width, l.y);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render Devour Suction Trails
    for (const d of this.devourEffects) {
      const t = Math.min(1, d.elapsedMs / d.durationMs);
      const cx = d.fromX + (d.toX - d.fromX) * t;
      const cy = d.fromY + (d.toY - d.fromY) * t;
      ctx.save();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 4 * (1 - t * 0.5);
      ctx.beginPath();
      ctx.moveTo(d.fromX, d.fromY);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Render Projectiles
    for (const p of this.projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Render Chain Explosions
    for (const e of this.explosions) {
      const t = Math.min(1, e.elapsedMs / e.durationMs);
      ctx.save();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 6 * (1 - t);
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Render Floating Damage Popups
    for (const f of this.floatingTexts) {
      const t = Math.min(1, f.elapsedMs / f.durationMs);
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.font = `bold ${16 + f.tier * 5}px monospace`;
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
    this.triggerScreenShake(0, 0);
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  getActiveCounts() {
    return {
      projectiles: this.projectiles.length,
      devourEffects: this.devourEffects.length,
      explosions: this.explosions.length,
      lasers: this.lasers.length,
      floatingTexts: this.floatingTexts.length,
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
