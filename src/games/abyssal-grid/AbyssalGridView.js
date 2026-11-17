/**
 * Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Interactive Browser View (`F-S5-01`, `F-R2-06`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md`:
 *  - `data-testid="boss-arena-card"` & `data-testid="boss-portrait-svg"`
 *  - `data-testid="abyssal-matrix"`
 *  - `data-testid="matrix-cell-0"` .. `data-testid="matrix-cell-15"` (clickable for manual HOLD toggle)
 *  - `data-testid="btn-matrix-spin"`
 *  - `data-testid="btn-matrix-fire"`
 */

import { formatBigNumber } from '../../core/BigNumber.js';
import { renderSprite, renderBossPortrait } from '../../ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../ui/RelicDraftBanner.js';
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
      const bossAnchor =
        typeof this.vfx.resolveAnchor === 'function'
          ? this.vfx.resolveAnchor('[data-testid="boss-arena-card"]', 480, 150)
          : { x: 480, y: 150 };

      for (const dev of state.lastDevourEvents || []) {
        const defaultFromX = 280 + (dev.fromIndex % 4) * 110;
        const defaultFromY = 160 + Math.floor(dev.fromIndex / 4) * 85;
        const defaultToX = 280 + (dev.toIndex % 4) * 110;
        const defaultToY = 160 + Math.floor(dev.toIndex / 4) * 85;
        const fromAnchor =
          typeof this.vfx.resolveAnchor === 'function'
            ? this.vfx.resolveAnchor(`[data-testid="matrix-cell-${dev.fromIndex}"]`, defaultFromX, defaultFromY)
            : { x: defaultFromX, y: defaultFromY };
        const toAnchor =
          typeof this.vfx.resolveAnchor === 'function'
            ? this.vfx.resolveAnchor(`[data-testid="matrix-cell-${dev.toIndex}"]`, defaultToX, defaultToY)
            : { x: defaultToX, y: defaultToY };

        this.vfx.spawnDevourEffect?.({
          fromX: fromAnchor.x,
          fromY: fromAnchor.y,
          toX: toAnchor.x,
          toY: toAnchor.y,
          label: '+1吞噬',
        });
      }
      if ((state.bingoLines || []).length > 0) {
        this.vfx.spawnChainExplosion?.({
          x: bossAnchor.x,
          y: bossAnchor.y + 40,
          radius: 150,
          intensity: 3,
        });
      }
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: bossAnchor.x,
          y: bossAnchor.y + 20,
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
      const bossAnchor =
        typeof this.vfx.resolveAnchor === 'function'
          ? this.vfx.resolveAnchor('[data-testid="boss-arena-card"]', 480, 150)
          : { x: 480, y: 150 };
      this.vfx.spawnChainExplosion?.({ x: bossAnchor.x, y: bossAnchor.y + 30, radius: 160, intensity: 3 });
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: bossAnchor.x,
          y: bossAnchor.y + 10,
          text: `-${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 2,
        });
      }
    }

    this.render(state);
    return state;
  }

  triggerToggleCellLock(cellIndex) {
    const state = this.engine.performSecondaryAction({ cellIndex });
    this.hud?.update?.(state);
    this.render(state);
    return state;
  }

  onKeyDown(event) {
    if (!event) return false;
    const stateNow = this.engine.getState();
    if (
      handleRelicDraftKeyDown(event, stateNow, {
        onPickRelic: (relicId) => {
          const st = this.engine.pickRelic(relicId);
          this.hud?.update?.(st);
          this.render(st);
        },
      })
    ) {
      return true;
    }

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

  _buildSightlinesSvg(bingoLines = []) {
    if (!Array.isArray(bingoLines) || bingoLines.length === 0) return '';
    const coords = (idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      return { x: 12.5 + col * 25, y: 12.5 + row * 25 };
    };
    const linesMarkup = bingoLines
      .map((line) => {
        const indices = line.indices || [];
        if (indices.length < 2) return '';
        const p1 = coords(indices[0]);
        const p2 = coords(indices[indices.length - 1]);
        return `<line x1="${p1.x}%" y1="${p1.y}%" x2="${p2.x}%" y2="${p2.y}%" stroke="#ffd166" stroke-width="2.5" stroke-dasharray="4 3" opacity="0.82" />`;
      })
      .join('');
    return `<svg class="bingo-sightlines-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${linesMarkup}</svg>`;
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();
    const bingoLines = state.bingoLines || [];

    const bossHpPct = Math.max(
      0,
      Math.min(100, Math.round((Number(state.enemyHp || 0) / Math.max(1, Number(state.enemyMaxHp || 1))) * 100))
    );
    const bossPortraitSvg = renderBossPortrait(
      state.currentBoss || { id: state.bossId, name: state.enemyName, wave: state.wave },
      { wave: state.wave, schemeId: 'abyssal-grid', size: 58 }
    );
    const relicBannerHtml = renderRelicDraftHTML(state);

    const cellsHtml = (state.matrix || [])
      .map((cell, idx) => {
        const isLocked = Boolean(cell.locked);
        const lockedClass = isLocked ? 'matrix-cell-locked' : '';
        const cmdClass = cell.isCommander ? 'matrix-cell-commander' : '';
        const emptyClass = cell.id === 'empty' ? 'matrix-cell-empty' : '';
        const unitSvg = renderSprite(cell.id, {
          size: 30,
          tier: Math.max(1, cell.tier || 1),
        });
        return `
          <div
            class="matrix-cell-card ${lockedClass} ${cmdClass} ${emptyClass}"
            data-testid="matrix-cell-${idx}"
            data-cell-index="${idx}"
            data-unit-id="${cell.id}"
            data-locked="${String(isLocked)}"
            aria-pressed="${String(isLocked)}"
          >
            <div class="matrix-cell-top">
              <span class="matrix-cell-idx">#${idx}</span>
              ${isLocked ? '<span class="matrix-hold-badge">HOLD</span>' : '<span class="matrix-hold-hint">点击锁</span>'}
            </div>
            <div class="matrix-cell-icon">${unitSvg}</div>
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
        ? bingoLines.map((l) => `<span class="bingo-line-pill">${l.zhName}</span>`).join(' ')
        : '<span class="bingo-line-empty">凑齐横/纵/对角4名统帅触发 10线 Bingo 毁灭齐射 · 点击任意战格手动锁留</span>';

    const sightlinesHtml = this._buildSightlinesSvg(bingoLines);

    this.containerEl.innerHTML = `
      <section class="scheme-view abyssal-grid-view" data-testid="abyssal-grid-view">
        <div class="boss-arena-card" data-testid="boss-arena-card">
          <div class="boss-portrait-frame">
            ${bossPortraitSvg}
          </div>
          <div class="boss-info-col">
            <div class="boss-header-row">
              <h3 class="boss-name-title">${state.enemyName || '深渊矩阵哨卫'}</h3>
              <span class="boss-wave-pill">第 ${state.wave} 波首领 · 已锁战格 ${(state.lockedCells || []).length}/16</span>
            </div>
            <div class="boss-hp-dual-track">
              <div class="boss-hp-burn-fill" style="width: ${bossHpPct}%;"></div>
              <div class="boss-hp-fill" style="width: ${bossHpPct}%;"></div>
            </div>
            <div class="boss-hp-readout">HP ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(state.enemyMaxHp)} (${bossHpPct}%)</div>
          </div>
        </div>

        ${relicBannerHtml}

        <div class="abyssal-status-header">
          <span>已锁战格 (Locked Cells): <strong>${(state.lockedCells || []).length} / 16</strong></span>
          <span>已激活 Bingo 战线: <strong>${bingoLines.length} / 10 线</strong></span>
        </div>

        <div class="abyssal-bingo-banner">
          ${bingoBadgesHtml}
        </div>

        <div class="abyssal-matrix-grid" data-testid="abyssal-matrix">
          ${cellsHtml}
          ${sightlinesHtml}
        </div>

        <div class="abyssal-controls-row">
          <button
            type="button"
            class="btn-arcade btn-primary-action"
            data-testid="btn-matrix-spin"
          >
            矩阵重摇 (统帅锁格十字吞噬) / Hold &amp; Respin [Space]
          </button>
          <button
            type="button"
            class="btn-arcade btn-secondary-action"
            data-testid="btn-matrix-fire"
          >
            立即结算开火 (击破首领享结余存息) / Fire Barrage Now [R]
          </button>
        </div>
      </section>
    `;

    const spinBtn = this.containerEl.querySelector?.('[data-testid="btn-matrix-spin"]');
    const fireBtn = this.containerEl.querySelector?.('[data-testid="btn-matrix-fire"]');

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

    for (let idx = 0; idx < 16; idx++) {
      const cellEl = this.containerEl.querySelector?.(`[data-testid="matrix-cell-${idx}"]`);
      if (cellEl && typeof cellEl.addEventListener === 'function') {
        cellEl.addEventListener('click', () => {
          this.triggerToggleCellLock(idx);
        });
      }
    }

    bindRelicDraftEvents(this.containerEl, {
      onPickRelic: (relicId) => {
        const st = this.engine.pickRelic(relicId);
        this.hud?.update?.(st);
        this.render(st);
      },
      onEnterEndless: () => {
        const st = this.engine.enterEndless();
        this.hud?.update?.(st);
        this.render(st);
      },
      onResetRun: () => {
        const st = this.engine.reset({ seed: this.engine.seed });
        this.hud?.update?.(st);
        this.render(st);
      },
    });
  }
}

export function createAbyssalGridView(engineOrOptions = null, sharedServices = {}) {
  return new AbyssalGridView(engineOrOptions, sharedServices);
}

export default AbyssalGridView;
