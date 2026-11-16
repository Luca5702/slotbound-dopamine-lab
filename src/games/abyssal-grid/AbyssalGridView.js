/**
 * Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Interactive Browser View (`F-S5-01`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md:276`:
 *  - `data-testid="abyssal-matrix"`
 *  - `data-testid="matrix-cell-0"` .. `data-testid="matrix-cell-15"`
 *  - `data-testid="btn-matrix-spin"`
 *  - `data-testid="btn-matrix-fire"`
 */

import { formatBigNumber } from '../../core/BigNumber.js';
import { AbyssalGridEngine } from './AbyssalGridEngine.js';

export class AbyssalGridView {
  constructor(engineOrOptions = null, sharedServices = {}) {
    if (engineOrOptions && typeof engineOrOptions.getState === 'function') {
      this.engine = engineOrOptions;
    } else {
      this.engine = new AbyssalGridEngine(engineOrOptions || {});
    }
    this.containerEl = null;
    this.sound = sharedServices.sound || this.engine.sound || null;
    this.vfx = sharedServices.vfx || null;
    this.hud = sharedServices.hud || null;
    this.bus = sharedServices.bus || this.engine.bus || null;
  }

  mount(containerEl, sharedServices = {}) {
    if (!containerEl) return this;
    this.containerEl = containerEl;
    if (sharedServices.engine) this.engine = sharedServices.engine;
    if (sharedServices.sound) {
      this.sound = sharedServices.sound;
      this.engine.sound = sharedServices.sound;
    }
    if (sharedServices.vfx) this.vfx = sharedServices.vfx;
    if (sharedServices.hud) this.hud = sharedServices.hud;
    if (sharedServices.bus) this.bus = sharedServices.bus;

    this.render();
    return this;
  }

  unmount() {
    if (this.containerEl && typeof this.containerEl.innerHTML !== 'undefined') {
      this.containerEl.innerHTML = '';
    }
    this.containerEl = null;
  }

  triggerMatrixSpin(payload = {}) {
    const state = this.engine.performPrimaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      const bd = state.lastTurnBreakdown || {};
      for (const dev of state.lastDevourEvents || []) {
        this.vfx.spawnDevourEffect?.({
          fromX: 280 + (dev.fromIndex % 4) * 110,
          fromY: 160 + Math.floor(dev.fromIndex / 4) * 85,
          toX: 280 + (dev.toIndex % 4) * 110,
          toY: 160 + Math.floor(dev.toIndex / 4) * 85,
          label: '+1 DEVOUR',
        });
      }
      if ((state.bingoLines || []).length > 0) {
        this.vfx.spawnChainExplosion?.({ x: 480, y: 220, radius: 150, intensity: 3 });
      }
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: 480,
          y: 170,
          text: `-${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 1,
        });
        this.vfx.triggerScreenShake?.(bd.intensityTier || 1, 280);
      }
    }

    this.render(state);
    return state;
  }

  triggerMatrixFire(payload = { action: 'fire' }) {
    const state = this.engine.performSecondaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      const bd = state.lastTurnBreakdown || {};
      this.vfx.spawnChainExplosion?.({ x: 480, y: 180, radius: 160, intensity: 3 });
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: 480,
          y: 150,
          text: `🔥 -${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 2,
        });
      }
    }

    this.render(state);
    return state;
  }

  onKeyDown(event) {
    if (!event) return false;
    const code = event.code || '';
    const key = event.key || '';

    if (code === 'Space' || key === ' ') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (event.repeat && this.engine.flowTracker) {
        this.engine.flowTracker.engageTurbo?.();
      }
      this.triggerMatrixSpin();
      if (event.repeat && this.engine.flowTracker) {
        this.engine.flowTracker.engageTurbo?.();
      }
      return true;
    }
    if (code === 'KeyR' || key === 'r' || key === 'R') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this.triggerMatrixFire({ action: 'fire' });
      return true;
    }
    return false;
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();
    const bingoLines = state.bingoLines || [];

    const cellsHtml = (state.matrix || [])
      .map((cell, idx) => {
        const lockedClass = cell.locked ? 'matrix-cell-locked' : '';
        const cmdClass = cell.isCommander ? 'matrix-cell-commander' : '';
        const emptyClass = cell.id === 'empty' ? 'matrix-cell-empty' : '';
        return `
          <div
            class="matrix-cell-card ${lockedClass} ${cmdClass} ${emptyClass}"
            data-testid="matrix-cell-${idx}"
            data-cell-index="${idx}"
            data-unit-id="${cell.id}"
            data-locked="${String(Boolean(cell.locked))}"
          >
            <div class="matrix-cell-top">
              <span class="matrix-cell-idx">#${idx}</span>
              ${cell.locked ? '<span class="matrix-hold-badge">🔒 HOLD</span>' : ''}
            </div>
            <div class="matrix-cell-icon">${cell.icon}</div>
            <div class="matrix-cell-name">${cell.zhName}</div>
            <div class="matrix-cell-meta">
              <span>${cell.basePoints + (cell.bonusPoints || 0)}pt</span>
              ${cell.devourStacks > 0 ? `<span class="matrix-devour-tag">吞噬+${cell.devourStacks}</span>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    const bingoBadgesHtml =
      bingoLines.length > 0
        ? bingoLines.map((l) => `<span class="bingo-line-pill">🎯 ${l.zhName}</span>`).join(' ')
        : '<span class="bingo-line-empty">凑齐横/纵/对角4名统帅触发 10线 Bingo 毁灭齐射</span>';

    this.containerEl.innerHTML = `
      <section class="scheme-view abyssal-grid-view" data-testid="abyssal-grid-view">
        <div class="abyssal-status-header">
          <span>🔒 已锁统帅格 (Locked Commanders): <strong>${(state.lockedCells || []).length} / 16</strong></span>
          <span>💥 已激活 Bingo 战线: <strong>${bingoLines.length} / 10 线</strong></span>
        </div>

        <div class="abyssal-bingo-banner">
          ${bingoBadgesHtml}
        </div>

        <div class="abyssal-matrix-grid" data-testid="abyssal-matrix">
          ${cellsHtml}
        </div>

        <div class="abyssal-controls-row">
          <button
            type="button"
            class="btn-arcade btn-primary-action"
            data-testid="btn-matrix-spin"
          >
            🔄 矩阵重摇 (统帅锁格十字吞噬) / Hold &amp; Respin [Space]
          </button>
          <button
            type="button"
            class="btn-arcade btn-secondary-action"
            data-testid="btn-matrix-fire"
          >
            🔥 立即结算开火 (结余存息) / Fire Barrage Now [R]
          </button>
        </div>
      </section>
    `;

    const spinBtn =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="btn-matrix-spin"]')
        : null;
    const fireBtn =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="btn-matrix-fire"]')
        : null;

    if (spinBtn && typeof spinBtn.addEventListener === 'function') {
      spinBtn.addEventListener('click', () => {
        this.triggerMatrixSpin();
      });
    }
    if (fireBtn && typeof fireBtn.addEventListener === 'function') {
      fireBtn.addEventListener('click', () => {
        this.triggerMatrixFire({ action: 'fire' });
      });
    }
  }
}

export function createAbyssalGridView(engineOrOptions = null, sharedServices = {}) {
  return new AbyssalGridView(engineOrOptions, sharedServices);
}

export default AbyssalGridView;
