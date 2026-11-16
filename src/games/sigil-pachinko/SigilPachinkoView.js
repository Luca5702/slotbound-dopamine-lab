/**
 * Scheme 4: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Interactive Browser View (`F-S4-01`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md:274`:
 *  - `data-testid="pachinko-board"`
 *  - `data-testid="pachinko-spawner"`
 *  - `data-testid="btn-drop-orbs"`
 *  - `data-testid="btn-chaos-tilt"`
 *  - `data-testid="pachinko-crucible-0"` .. `data-testid="pachinko-crucible-4"`
 */

import { formatBigNumber } from '../../core/BigNumber.js';
import { SigilPachinkoEngine } from './SigilPachinkoEngine.js';

export class SigilPachinkoView {
  constructor(engineOrOptions = null, sharedServices = {}) {
    if (engineOrOptions && typeof engineOrOptions.getState === 'function') {
      this.engine = engineOrOptions;
    } else {
      this.engine = new SigilPachinkoEngine(engineOrOptions || {});
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

  triggerDropOrbs(payload = {}) {
    this.engine.performPrimaryAction(payload);
    const state = this.engine.step(500);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      const bd = state.lastTurnBreakdown || {};
      for (const orb of state.orbs || []) {
        if (!orb.devoured) {
          this.vfx.spawnProjectile?.({
            fromX: orb.x,
            fromY: 80,
            toX: orb.x,
            toY: 440,
            color: '#f15bb5',
          });
        }
      }
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: 480,
          y: 200,
          text: `-${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 1,
        });
        this.vfx.triggerScreenShake?.(bd.intensityTier || 1, 280);
      }
    }

    this.render(state);
    return state;
  }

  triggerChaosTilt(payload = {}) {
    const state = this.engine.performSecondaryAction(payload);
    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }
    if (this.vfx) {
      this.vfx.triggerScreenShake?.(2, 220);
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
      this.triggerDropOrbs();
      if (event.repeat && this.engine.flowTracker) {
        this.engine.flowTracker.engageTurbo?.();
      }
      return true;
    }
    if (code === 'KeyR' || key === 'r' || key === 'R') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this.triggerChaosTilt();
      return true;
    }
    return false;
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();

    const spawnerHtml = (state.spawner || [])
      .map(
        (slot, idx) => `
          <div class="pachinko-spawner-slot" data-spawner-index="${idx}" data-orb-id="${slot.orbId}">
            <span class="spawner-orb-icon">${slot.icon}</span>
            <span class="spawner-orb-name">${slot.zhName} (T${slot.tier})</span>
            <span class="spawner-orb-pts">${slot.basePoints}pt ×${slot.mult}</span>
          </div>
        `
      )
      .join('');

    const pegsHtml = (state.pegs || [])
      .map(
        (peg) => `
          <div
            class="pachinko-peg ${peg.active ? 'peg-active' : ''}"
            data-peg-index="${peg.index}"
            style="left: ${Math.round((peg.x / 800) * 100)}%; top: ${Math.round((peg.y / 520) * 100)}%;"
            title="${peg.zhName}"
          >
            ${peg.icon}
          </div>
        `
      )
      .join('');

    const orbsHtml = (state.orbs || [])
      .map(
        (orb) => `
          <div
            class="pachinko-orb ${orb.devoured ? 'orb-devoured' : ''}"
            data-orb-id="${orb.orbId}"
            style="left: ${Math.round((orb.x / 800) * 100)}%; top: ${Math.round((orb.y / 520) * 100)}%;"
          >
            <span>${orb.icon}</span>
          </div>
        `
      )
      .join('');

    const cruciblesHtml = (state.crucibles || [])
      .map(
        (c, idx) => `
          <div
            class="pachinko-crucible ${c.isJackpot ? 'crucible-jackpot' : ''} ${
              c.capturedCount > 0 ? 'crucible-hit' : ''
            }"
            data-testid="pachinko-crucible-${idx}"
            data-multiplier="${c.multiplier}"
          >
            <div class="crucible-mult">×${c.multiplier}</div>
            <div class="crucible-name">${c.zhName}</div>
            <div class="crucible-count">入炉: ${c.capturedCount || 0}</div>
          </div>
        `
      )
      .join('');

    this.containerEl.innerHTML = `
      <section class="scheme-view sigil-pachinko-view" data-testid="sigil-pachinko-view">
        <div class="pachinko-spawner-bar" data-testid="pachinko-spawner">
          ${spawnerHtml}
        </div>

        <div class="pachinko-arena-board" data-testid="pachinko-board">
          <div class="pachinko-pegs-layer">
            ${pegsHtml}
          </div>
          <div class="pachinko-orbs-layer">
            ${orbsHtml}
          </div>
        </div>

        <div class="pachinko-crucibles-row">
          ${cruciblesHtml}
        </div>

        <div class="pachinko-controls-row">
          <button
            type="button"
            class="btn-arcade btn-primary-action"
            data-testid="btn-drop-orbs"
          >
            🔮 释放炼金法球 / Drop Alchemical Orbs [Space]
          </button>
          <button
            type="button"
            class="btn-arcade btn-secondary-action"
            data-testid="btn-chaos-tilt"
          >
            ⚡ 狂暴摇台 (×2.0 引力汇聚) / Chaos Tilt [R]
          </button>
        </div>
      </section>
    `;

    const dropBtn =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="btn-drop-orbs"]')
        : null;
    const tiltBtn =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="btn-chaos-tilt"]')
        : null;

    if (dropBtn && typeof dropBtn.addEventListener === 'function') {
      dropBtn.addEventListener('click', () => {
        this.triggerDropOrbs();
      });
    }
    if (tiltBtn && typeof tiltBtn.addEventListener === 'function') {
      tiltBtn.addEventListener('click', () => {
        this.triggerChaosTilt();
      });
    }
  }
}

export function createSigilPachinkoView(engineOrOptions = null, sharedServices = {}) {
  return new SigilPachinkoView(engineOrOptions, sharedServices);
}

export default SigilPachinkoView;
