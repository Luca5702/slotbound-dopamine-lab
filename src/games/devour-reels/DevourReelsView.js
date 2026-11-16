/**
 * Scheme 1: 《吞噬转轮》(Devour Reels) Interactive Browser & Mock-DOM View (`F-S1-01`, `F-S1-02`, `F-S1-03`)
 * Renders all required `data-testid` anchors per PROJECT.md:
 *  - `devour-grid`, `devour-cell-0`..`devour-cell-8`, `abyssal-maw`, `indigestion-meter`,
 *    `btn-spin-devour`, `prob-mod-panel`, `prob-boost-fireball`, `prob-boost-powder_keg`,
 *    `prob-preset-pyro`, `prob-preset-iron`, `prob-preset-gluttony`
 */

import { SYMBOLS } from './config.js';
import { DevourReelsEngine } from './DevourReelsEngine.js';

export class DevourReelsView {
  constructor(engineOrOptions = null, sharedServices = {}) {
    this.containerEl = null;
    if (engineOrOptions && typeof engineOrOptions.performPrimaryAction === 'function') {
      this.engine = engineOrOptions;
      this.services = { ...sharedServices };
    } else if (engineOrOptions && typeof engineOrOptions === 'object') {
      this.engine = engineOrOptions.engine || null;
      this.services = { ...engineOrOptions, ...sharedServices };
    } else {
      this.engine = null;
      this.services = { ...sharedServices };
    }
    this.sound = this.services.sound || this.engine?.sound || null;
    this.vfx = this.services.vfx || null;
    this.hud = this.services.hud || null;
    this.bus = this.services.bus || this.engine?.bus || null;
  }

  mount(containerEl, sharedServices = {}) {
    if (!containerEl) return this;
    this.containerEl = containerEl;

    if (sharedServices && typeof sharedServices === 'object') {
      this.services = { ...this.services, ...sharedServices };
      if (sharedServices.engine) this.engine = sharedServices.engine;
      if (sharedServices.sound) this.sound = sharedServices.sound;
      if (sharedServices.vfx) this.vfx = sharedServices.vfx;
      if (sharedServices.hud) this.hud = sharedServices.hud;
      if (sharedServices.bus) this.bus = sharedServices.bus;
    }

    if (!this.engine) {
      this.engine = new DevourReelsEngine({
        sound: this.sound,
        bus: this.bus,
      });
    } else if (this.sound && !this.engine.sound) {
      this.engine.sound = this.sound;
    }

    this.render();
    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(this.engine.getState());
    }
    return this;
  }

  unmount() {
    if (this.containerEl && typeof this.containerEl.innerHTML !== 'undefined') {
      this.containerEl.innerHTML = '';
    }
    this.containerEl = null;
  }

  triggerSpin(payload = {}) {
    if (!this.engine) return null;
    const state = this.engine.performPrimaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      for (const evt of state.devourEvents || []) {
        this.vfx.spawnDevourEffect?.({
          fromCell: evt.fromCell,
          toCell: evt.toCell,
          label: `+${evt.stacksGained}吞噬`,
        });
      }
      this.vfx.spawnProjectile?.({
        fromX: 480,
        fromY: 320,
        toX: 480,
        toY: 110,
        color: '#ff3366',
      });
      if ((state.lastTurnBreakdown?.triggeredSynergies || []).length > 0) {
        this.vfx.spawnChainExplosion?.({
          x: 480,
          y: 220,
          intensity: Math.max(2, state.lastTurnBreakdown.intensityTier || 2),
        });
      }
      this.vfx.spawnFloatingText?.({
        x: 480,
        y: 160,
        text: `-${state.lastTurnBreakdown?.formattedDamage || state.lastTurnBreakdown?.totalDamage || 0}`,
        tier: state.lastTurnBreakdown?.intensityTier || 1,
      });
      this.vfx.triggerScreenShake?.(state.lastTurnBreakdown?.intensityTier || 1);
    }

    this.render(state);
    return state;
  }

  triggerModProbability(payload = {}) {
    if (!this.engine) return null;
    const state = this.engine.performSecondaryAction(payload);
    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }
    this.render(state);
    return state;
  }

  onKeyDown(event) {
    if (!event) return;
    const code = event.code || '';
    const key = event.key || '';

    if (code === 'Space' || key === ' ') {
      event.preventDefault?.();
      if (event.repeat && this.engine?.flowTracker?.engageTurbo) {
        this.engine.flowTracker.engageTurbo();
      }
      this.triggerSpin();
      if (event.repeat && this.engine?.flowTracker?.engageTurbo) {
        this.engine.flowTracker.engageTurbo();
      }
      return true;
    } else if (key === '1') {
      this.triggerModProbability({ preset: 'pyro', action: 'preset' });
    } else if (key === '2') {
      this.triggerModProbability({ preset: 'iron', action: 'preset' });
    } else if (key === '3') {
      this.triggerModProbability({ preset: 'gluttony', action: 'preset' });
    }
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || (this.engine ? this.engine.getState() : null);
    if (!state) return;

    const cellsHtml = (state.grid || [])
      .map((cell, idx) => {
        const isCenterMaw = idx === 4;
        const devouredClass = cell.devoured ? 'is-devoured anim-devour-bite' : '';
        const predatorClass = cell.devourCount > 0 ? 'is-predator-fed anim-devour-bite' : '';
        const centerClass = isCenterMaw ? 'is-center-maw-cell' : '';
        const totalCellPts = (cell.basePoints || 0) + (cell.bonusPoints || 0);

        return `
          <div
            class="devour-cell ${devouredClass} ${predatorClass} ${centerClass}"
            data-testid="devour-cell-${idx}"
            data-symbol-id="${cell.symbolId}"
            data-tier="${cell.tier}"
          >
            <div class="cell-header">
              <span class="cell-tier-badge">T${cell.tier}</span>
              ${isCenterMaw ? '<span class="cell-maw-crown">👄 巨口核心</span>' : `<span class="cell-index">#${idx}</span>`}
            </div>
            <div class="cell-icon">${cell.icon}</div>
            <div class="cell-name">${cell.zhName || cell.name}</div>
            <div class="cell-stats">
              <span class="cell-pts">${totalCellPts} pts</span>
              ${cell.devourCount > 0 ? `<span class="cell-devour-badge">吞噬×${cell.devourCount}</span>` : ''}
              ${cell.devoured ? '<span class="cell-eaten-tag">已被吞食</span>' : ''}
            </div>
          </div>
        `;
      })
      .join('');

    const probs = state.wheelProbabilities || {};
    const probRowsHtml = SYMBOLS.map((sym) => {
      const weight = Number(probs[sym.id] ?? sym.defaultWeight ?? 0);
      return `
        <div class="prob-mod-row" data-symbol="${sym.id}">
          <span class="prob-sym-label">${sym.icon} ${sym.zhName} (T${sym.tier})</span>
          <strong class="prob-sym-weight">${weight.toFixed(1)}%</strong>
          <div class="prob-row-actions">
            <button
              type="button"
              class="btn-arcade btn-prob-boost"
              data-testid="prob-boost-${sym.id}"
              data-prob-action="boost"
              data-symbol-id="${sym.id}"
            >+概率</button>
            <button
              type="button"
              class="btn-arcade btn-prob-banish"
              data-testid="prob-banish-${sym.id}"
              data-prob-action="banish"
              data-symbol-id="${sym.id}"
            >-剔除</button>
          </div>
        </div>
      `;
    }).join('');

    const indigestionPct = Math.min(100, Math.max(0, Math.round(state.indigestion || 0)));
    const synergiesList = (state.lastTurnBreakdown?.triggeredSynergies || []).join(' | ') || '等待拉杆投喂...';

    this.containerEl.innerHTML = `
      <div class="scheme-view devour-reels-stage" data-scheme="devour-reels">
        <div class="devour-main-column">
          <div class="abyssal-maw-banner" data-testid="abyssal-maw">
            <div class="maw-title">
              <strong>👄 深渊巨口 (Abyssal Maw Lv.${state.mawLevel || 1})</strong>
              <span class="maw-armor-badge">🛡️ 巨口重甲: ${state.mawArmor || 0}</span>
              <span class="maw-devoured-badge">🍖 累计吞噬: ${state.totalRunDevoured || 0}</span>
            </div>
            <div class="maw-synergy-ticker">${synergiesList}</div>
          </div>

          <div class="indigestion-bar-wrapper" data-testid="indigestion-meter">
            <div class="indigestion-header">
              <span>🤢 消化不良槽 (Indigestion Meter — 满100触发酸液喷发!)</span>
              <strong>${indigestionPct} / 100</strong>
            </div>
            <div class="hud-hp-bar-track">
              <div class="hud-hp-bar-fill indigestion-fill" style="width: ${indigestionPct}%"></div>
            </div>
          </div>

          <div class="devour-grid" data-testid="devour-grid">
            ${cellsHtml}
          </div>

          <div class="devour-action-bar">
            <button
              type="button"
              class="btn-arcade btn-primary-action"
              data-testid="btn-spin-devour"
            >
              🎰 拉杆喂食巨口 / Spin &amp; Devour [Space]
            </button>
          </div>
        </div>

        <aside class="prob-mod-panel" data-testid="prob-mod-panel">
          <div class="prob-panel-header">
            <h3>🎲 轮盘概率改装台 (Wheel Probability Modder)</h3>
            <p>一键流派预设或定向加权食材概率 (总和恒为 100%)</p>
          </div>

          <div class="prob-preset-bar">
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-pyro"
              data-preset="pyro"
            >🔥 爆破流预设 (Pyro)</button>
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-iron"
              data-preset="iron"
            >🛡️ 铁甲反伤流 (Iron)</button>
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-gluttony"
              data-preset="gluttony"
            >🩸 狂战暴食流 (Gluttony)</button>
          </div>

          <div class="prob-symbol-list">
            ${probRowsHtml}
          </div>
        </aside>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      return;
    }

    const spinBtn = this.containerEl.querySelector('[data-testid="btn-spin-devour"]');
    if (spinBtn && typeof spinBtn.addEventListener === 'function') {
      spinBtn.addEventListener('click', () => this.triggerSpin());
    }

    const presetPyro = this.containerEl.querySelector('[data-testid="prob-preset-pyro"]');
    if (presetPyro && typeof presetPyro.addEventListener === 'function') {
      presetPyro.addEventListener('click', () =>
        this.triggerModProbability({ preset: 'pyro', action: 'preset' })
      );
    }

    const presetIron = this.containerEl.querySelector('[data-testid="prob-preset-iron"]');
    if (presetIron && typeof presetIron.addEventListener === 'function') {
      presetIron.addEventListener('click', () =>
        this.triggerModProbability({ preset: 'iron', action: 'preset' })
      );
    }

    const presetGluttony = this.containerEl.querySelector('[data-testid="prob-preset-gluttony"]');
    if (presetGluttony && typeof presetGluttony.addEventListener === 'function') {
      presetGluttony.addEventListener('click', () =>
        this.triggerModProbability({ preset: 'gluttony', action: 'preset' })
      );
    }

    for (const sym of SYMBOLS) {
      const boostBtn = this.containerEl.querySelector(`[data-testid="prob-boost-${sym.id}"]`);
      if (boostBtn && typeof boostBtn.addEventListener === 'function') {
        boostBtn.addEventListener('click', () =>
          this.triggerModProbability({ action: 'boost', type: 'boost', symbolId: sym.id })
        );
      }

      const banishBtn = this.containerEl.querySelector(`[data-testid="prob-banish-${sym.id}"]`);
      if (banishBtn && typeof banishBtn.addEventListener === 'function') {
        banishBtn.addEventListener('click', () =>
          this.triggerModProbability({ action: 'banish', type: 'banish', symbolId: sym.id })
        );
      }
    }
  }
}

export function createDevourReelsView(engineOrOptions = null, sharedServices = {}) {
  return new DevourReelsView(engineOrOptions, sharedServices);
}

export default DevourReelsView;
