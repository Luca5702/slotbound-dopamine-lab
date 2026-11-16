/**
 * Scheme 2: 《左轮地牢》(Revolver Dungeon) Interactive Browser & Mock-DOM View (`F-S2-01`, `F-S2-02`, `F-S2-03`)
 * Renders all required `data-testid` anchors per PROJECT.md:
 *  - `revolver-cylinder`, `chamber-0`..`chamber-5`, `btn-spin-fire`,
 *    `btn-load-bullet`, `player-hp-bar`, `roulette-risk-badge`
 */

import { RevolverDungeonEngine } from './RevolverDungeonEngine.js';

export class RevolverDungeonView {
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
      this.engine = new RevolverDungeonEngine({
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

  handleSpinAndFire(payload = {}) {
    if (!this.engine) return null;
    const state = this.engine.performPrimaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      for (const evt of state.devourEvents || []) {
        this.vfx.spawnDevourEffect?.({
          fromCell: evt.fromChamber,
          toCell: evt.toChamber,
          label: '寄生吞噬×2',
        });
      }
      if ((state.lastTurnBreakdown?.totalDamage || 0) > 0) {
        this.vfx.spawnProjectile?.({
          fromX: 480,
          fromY: 360,
          toX: 480,
          toY: 110,
          color: '#ffca3a',
        });
        this.vfx.spawnFloatingText?.({
          x: 480,
          y: 160,
          text: `-${state.lastTurnBreakdown?.formattedDamage || state.lastTurnBreakdown?.totalDamage}`,
          tier: state.lastTurnBreakdown?.intensityTier || 1,
        });
      }
      if ((state.lastTurnBreakdown?.chainSynergyMultiplier || 1) >= 4) {
        this.vfx.spawnChainExplosion?.({
          x: 480,
          y: 220,
          intensity: Math.max(2, state.lastTurnBreakdown?.intensityTier || 2),
        });
      }
      this.vfx.triggerScreenShake?.(state.lastTurnBreakdown?.intensityTier || 1);
    }

    this.render(state);
    return state;
  }

  handleLoadBullet(payload = {}) {
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
      this.handleSpinAndFire();
      if (event.repeat && this.engine?.flowTracker?.engageTurbo) {
        this.engine.flowTracker.engageTurbo();
      }
      return true;
    } else if (code === 'KeyR' || key === 'r' || key === 'R') {
      event.preventDefault?.();
      this.handleLoadBullet();
      return true;
    }
    return false;
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || (this.engine ? this.engine.getState() : null);
    if (!state) return;

    const chambersHtml = (state.chambers || [])
      .map((chamber, idx) => {
        const isActive = idx === state.activeChamberIndex;
        const activeClass = isActive ? 'is-active-chamber anim-mult-bounce' : '';
        const emptyClass = chamber.id === 'empty' ? 'is-empty-chamber' : 'is-loaded-chamber';
        const prevIdx = (idx + 5) % 6;
        const nextIdx = (idx + 1) % 6;

        return `
          <div
            class="revolver-chamber ${activeClass} ${emptyClass}"
            data-testid="chamber-${idx}"
            data-chamber-index="${idx}"
            data-bullet-id="${chamber.id}"
            title="相邻弹仓: #${prevIdx} & #${nextIdx}"
          >
            <div class="chamber-top-meta">
              <span class="chamber-num">#${idx} ${idx === 0 ? '🔥击发位' : idx === 3 ? '⚙️装填位' : ''}</span>
              <span class="chamber-tier">T${chamber.tier}</span>
            </div>
            <div class="chamber-icon">${chamber.icon}</div>
            <div class="chamber-name">${chamber.zhName || chamber.name}</div>
            <div class="chamber-stats">
              <span>${chamber.basePoints + (chamber.bonusPoints || 0)} pts</span>
              <span>×${chamber.mult}</span>
              ${chamber.devourStacks > 0 ? `<span class="chamber-devour-tag">吞噬+${chamber.devourStacks}</span>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    const hpPct = Math.min(
      100,
      Math.max(0, Math.round(((state.playerHp || 0) / Math.max(1, state.playerMaxHp || 100)) * 100))
    );

    this.containerEl.innerHTML = `
      <div class="scheme-view revolver-dungeon-stage" data-scheme="revolver-dungeon">
        <div class="revolver-status-row">
          <div class="player-hp-widget" data-testid="player-hp-bar">
            <div class="hp-header">
              <span>❤️ 枪手生命 (Gunslinger HP)</span>
              <strong>${state.playerHp} / ${state.playerMaxHp || 100} HP</strong>
            </div>
            <div class="hud-hp-bar-track">
              <div class="hud-hp-bar-fill player-hp-fill" style="width: ${hpPct}%"></div>
            </div>
          </div>

          <div class="roulette-risk-widget" data-testid="roulette-risk-badge">
            <span>🎯 命中率 Hit: <strong>${state.hitOdds ?? 0}%</strong></span>
            <span>💥 连发率 Chain: <strong>${state.chainOdds ?? 0}%</strong></span>
            <span>😈 炸膛风险 Backfire Risk: <strong>${state.backfireRisk ?? 0}%</strong></span>
            ${(state.gritMultiplier || 1) > 1 ? `<span class="grit-active-pill">🎲 孤胆赌徒下发 ×${state.gritMultiplier}</span>` : ''}
          </div>
        </div>

        <div class="revolver-cylinder" data-testid="revolver-cylinder">
          ${chambersHtml}
        </div>

        <div class="revolver-controls-bar">
          <button
            type="button"
            class="btn-arcade btn-primary-action"
            data-testid="btn-spin-fire"
          >
            🔫 旋转弹巢并开火 / Spin &amp; Fire [Space]
          </button>
          <button
            type="button"
            class="btn-arcade btn-secondary-action"
            data-testid="btn-load-bullet"
          >
            ⚙️ 塞入新子弹 / Load New Bullet [R]
          </button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      return;
    }

    const fireBtn = this.containerEl.querySelector('[data-testid="btn-spin-fire"]');
    if (fireBtn && typeof fireBtn.addEventListener === 'function') {
      fireBtn.addEventListener('click', () => this.handleSpinAndFire());
    }

    const loadBtn = this.containerEl.querySelector('[data-testid="btn-load-bullet"]');
    if (loadBtn && typeof loadBtn.addEventListener === 'function') {
      loadBtn.addEventListener('click', () => this.handleLoadBullet());
    }
  }
}

export function createRevolverDungeonView(engineOrOptions = null, sharedServices = {}) {
  return new RevolverDungeonView(engineOrOptions, sharedServices);
}

export default RevolverDungeonView;
