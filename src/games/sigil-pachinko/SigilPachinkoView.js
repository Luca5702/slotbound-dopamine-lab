/**
 * Scheme 4: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Interactive Browser View (`F-S4-01`, `F-R2-06`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md`:
 *  - `data-testid="boss-arena-card"` & `data-testid="boss-portrait-svg"`
 *  - `data-testid="pachinko-board"`
 *  - `data-testid="pachinko-spawner"`
 *  - `data-testid="btn-drop-orbs"`
 *  - `data-testid="btn-chaos-tilt"`
 *  - `data-testid="pachinko-crucible-0"` .. `data-testid="pachinko-crucible-4"`
 *  - Launch Aim controls (`◀` / `居中` / `▶`) & 35G Sigil Peg Upgrade button
 */

import { formatBigNumber } from '../../core/BigNumber.js';
import { renderSprite, renderBossPortrait } from '../../ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../ui/RelicDraftBanner.js';
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

  /**
   * Drops 3 alchemical orbs from the top spawner WITHOUT synchronously calling `step(500)` (`T6-26`),
   * allowing the real-time rAF loop (or incremental test steps) to animate the multi-step cascade.
   */
  triggerDropOrbs(payload = {}) {
    const state = this.engine.performPrimaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      const bd = state.lastTurnBreakdown || {};
      const boardAnchor =
        typeof this.vfx.resolveAnchor === 'function'
          ? this.vfx.resolveAnchor('[data-testid="pachinko-board"]', 480, 260)
          : { x: 480, y: 260 };

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
          x: boardAnchor.x,
          y: boardAnchor.y - 40,
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

  triggerAimChange(aim) {
    const state = this.engine.setLaunchAim(aim);
    this.hud?.update?.(state);
    this.render(state);
    return state;
  }

  triggerUpgradePeg(pegIndex = null) {
    const state = this.engine.upgradeRandomPeg(pegIndex);
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

  _buildOrbsHtml(state) {
    return (state.orbs || [])
      .map((orb) => {
        const orbSvg = renderSprite(orb.orbId, { size: 20, tier: orb.tier || 2 });
        return `
          <div
            class="pachinko-orb ${orb.devoured ? 'orb-devoured' : ''}"
            data-orb-id="${orb.orbId}"
            style="left: ${Math.round((orb.x / 800) * 100)}%; top: ${Math.round((orb.y / 520) * 100)}%;"
          >
            <span>${orbSvg}</span>
          </div>
        `;
      })
      .join('');
  }

  /**
   * Non-destructive real-time DOM patcher for falling orbs during rAF cascade.
   */
  syncRealtimeDOM(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      return;
    }
    const state = stateSnapshot || this.engine.getState();
    const orbsLayer = this.containerEl.querySelector('.pachinko-orbs-layer');
    if (orbsLayer) {
      orbsLayer.innerHTML = this._buildOrbsHtml(state);
    }
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();
    const bossHpPct = Math.max(
      0,
      Math.min(100, Math.round((Number(state.enemyHp || 0) / Math.max(1, Number(state.enemyMaxHp || 1))) * 100))
    );
    const bossPortraitSvg = renderBossPortrait(
      state.currentBoss || { id: state.bossId, name: state.enemyName, wave: state.wave },
      { wave: state.wave, schemeId: 'sigil-pachinko', size: 58 }
    );
    const relicBannerHtml = renderRelicDraftHTML(state);

    const spawnerHtml = (state.spawner || [])
      .map((slot, idx) => {
        const orbSvg = renderSprite(slot.orbId, { size: 24, tier: slot.tier || 1 });
        return `
          <div class="pachinko-spawner-slot" data-spawner-index="${idx}" data-orb-id="${slot.orbId}">
            <span class="spawner-orb-icon">${orbSvg}</span>
            <span class="spawner-orb-name">${slot.zhName} (T${slot.tier})</span>
            <span class="spawner-orb-pts">${slot.basePoints}pt ×${slot.mult}</span>
          </div>
        `;
      })
      .join('');

    const pegsHtml = (state.pegs || [])
      .map((peg) => {
        const pegSvg = renderSprite(peg.type, {
          size: 18,
          tier: peg.upgraded ? 3 : 2,
        });
        return `
          <div
            class="pachinko-peg ${peg.active ? 'peg-active' : ''} ${peg.upgraded ? 'peg-upgraded' : ''}"
            data-peg-index="${peg.index}"
            style="left: ${Math.round((peg.x / 800) * 100)}%; top: ${Math.round((peg.y / 520) * 100)}%;"
            title="${peg.zhName} (Lv.${peg.level || 1})"
          >
            ${pegSvg}
          </div>
        `;
      })
      .join('');

    const orbsHtml = this._buildOrbsHtml(state);

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

    const curAim = state.launchAim || 'center';
    const upgradedPegCount = (state.pegs || []).filter((p) => p.upgraded).length;

    this.containerEl.innerHTML = `
      <section class="scheme-view sigil-pachinko-view" data-testid="sigil-pachinko-view">
        <div class="boss-arena-card" data-testid="boss-arena-card">
          <div class="boss-portrait-frame">
            ${bossPortraitSvg}
          </div>
          <div class="boss-info-col">
            <div class="boss-header-row">
              <h3 class="boss-name-title">${state.enemyName || '炼金泥偶守卫'}</h3>
              <span class="boss-wave-pill">第 ${state.wave} 波首领 · 真印钉 ${upgradedPegCount}/24</span>
            </div>
            <div class="boss-hp-dual-track">
              <div class="boss-hp-burn-fill" style="width: ${bossHpPct}%;"></div>
              <div class="boss-hp-fill" style="width: ${bossHpPct}%;"></div>
            </div>
            <div class="boss-hp-readout">HP ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(state.enemyMaxHp)} (${bossHpPct}%)</div>
          </div>
        </div>

        ${relicBannerHtml}

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
            class="btn-arcade btn-aim ${curAim === 'left' ? 'active' : ''}"
            data-testid="btn-aim-left"
            data-action="aim-left"
            data-aim="left"
          >
            ◀ 左路瞄准
          </button>
          <button
            type="button"
            class="btn-arcade btn-aim ${curAim === 'center' ? 'active' : ''}"
            data-testid="btn-aim-center"
            data-action="aim-center"
            data-aim="center"
          >
            居中瞄准
          </button>
          <button
            type="button"
            class="btn-arcade btn-aim ${curAim === 'right' ? 'active' : ''}"
            data-testid="btn-aim-right"
            data-action="aim-right"
            data-aim="right"
          >
            右路瞄准 ▶
          </button>
          <button
            type="button"
            class="btn-arcade btn-primary-action"
            data-testid="btn-drop-orbs"
          >
            释放炼金法球 / Drop Orbs [Space]
          </button>
          <button
            type="button"
            class="btn-arcade btn-secondary-action"
            data-testid="btn-chaos-tilt"
          >
            狂暴摇台 (×2.0 引力汇聚) [R]
          </button>
          <button
            type="button"
            class="btn-arcade btn-upgrade-peg"
            data-testid="btn-upgrade-peg"
            data-action="upgrade-peg"
          >
            点化咒印钉 (35G)
          </button>
        </div>
      </section>
    `;

    const dropBtn = this.containerEl.querySelector?.('[data-testid="btn-drop-orbs"]');
    const tiltBtn = this.containerEl.querySelector?.('[data-testid="btn-chaos-tilt"]');
    const aimLeftBtn = this.containerEl.querySelector?.('[data-testid="btn-aim-left"]');
    const aimCenterBtn = this.containerEl.querySelector?.('[data-testid="btn-aim-center"]');
    const aimRightBtn = this.containerEl.querySelector?.('[data-testid="btn-aim-right"]');
    const upgradePegBtn = this.containerEl.querySelector?.('[data-testid="btn-upgrade-peg"]');

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
    if (aimLeftBtn && typeof aimLeftBtn.addEventListener === 'function') {
      aimLeftBtn.addEventListener('click', () => {
        this.triggerAimChange('left');
      });
    }
    if (aimCenterBtn && typeof aimCenterBtn.addEventListener === 'function') {
      aimCenterBtn.addEventListener('click', () => {
        this.triggerAimChange('center');
      });
    }
    if (aimRightBtn && typeof aimRightBtn.addEventListener === 'function') {
      aimRightBtn.addEventListener('click', () => {
        this.triggerAimChange('right');
      });
    }
    if (upgradePegBtn && typeof upgradePegBtn.addEventListener === 'function') {
      upgradePegBtn.addEventListener('click', () => {
        this.triggerUpgradePeg();
      });
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

export function createSigilPachinkoView(engineOrOptions = null, sharedServices = {}) {
  return new SigilPachinkoView(engineOrOptions, sharedServices);
}

export default SigilPachinkoView;
