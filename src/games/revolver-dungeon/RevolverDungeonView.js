/**
 * Scheme 2: 《左轮地牢》(Revolver Dungeon) Interactive Browser & Mock-DOM View (`F-S2-01`, `F-S2-02`, `F-S2-03`, `F-R2-04`)
 * Renders all required `data-testid` anchors per PROJECT.md:
 *  - `boss-arena-card`, `boss-portrait-svg`, `revolver-cylinder`, `chamber-0`..`chamber-5`,
 *    `ammo-belt`, `ammo-slot-0`..`ammo-slot-2`, `btn-spin-fire`, `btn-load-bullet`,
 *    `player-hp-bar`, `roulette-risk-badge`, plus `relic-draft-banner`, `run-victory-banner`, `run-defeat-banner`.
 */

import { getBossForFloor } from './config.js';
import { RevolverDungeonEngine } from './RevolverDungeonEngine.js';
import { formatBigNumber } from '../../core/BigNumber.js';
import { renderSprite, renderBossPortrait } from '../../ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../ui/RelicDraftBanner.js';

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
    this._prevEnemyHpPct = 100;
    this._justFired = false;
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

    const isMockEnv =
      typeof navigator !== 'undefined' && navigator.userAgent === 'SlotboundE2EMockBrowser';
    if (!isMockEnv) {
      this.vfx?.syncDimensions?.();
      this.vfx?.startLoop?.();
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

  _syncHudAndRender(state) {
    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }
    this.render(state);
    return state;
  }

  handleSpinAndFire(payload = {}) {
    if (!this.engine) return null;
    const prevState = this.engine.getState();
    this._prevEnemyHpPct = Math.min(
      100,
      Math.max(0, Math.round(((prevState.enemyHp || 0) / Math.max(1, prevState.enemyMaxHp || 150)) * 100))
    );
    this._justFired = true;

    const state = this.engine.performPrimaryAction(payload);
    this._syncHudAndRender(state);
    this._justFired = false;

    if (this.vfx) {
      const isMockEnv =
        typeof navigator !== 'undefined' && navigator.userAgent === 'SlotboundE2EMockBrowser';
      if (!isMockEnv) {
        this.vfx.syncDimensions?.();
        this.vfx.startLoop?.();
      }

      const bossPt =
        this.vfx.resolveAnchor?.('[data-testid="boss-arena-card"]', 480, 110) || { x: 480, y: 110 };
      const chamberPt =
        this.vfx.resolveAnchor?.(
          `[data-testid="chamber-${state.activeChamberIndex ?? 0}"]`,
          480,
          360
        ) || { x: 480, y: 360 };

      for (const evt of state.devourEvents || []) {
        const fromPt = this.vfx.resolveAnchor?.(
          `[data-testid="chamber-${evt.fromChamber}"]`,
          420,
          360
        );
        const toPt = this.vfx.resolveAnchor?.(
          `[data-testid="chamber-${evt.toChamber}"]`,
          480,
          360
        );
        this.vfx.spawnDevourEffect?.({
          fromCell: evt.fromChamber,
          toCell: evt.toChamber,
          fromX: fromPt?.x ?? 420,
          fromY: fromPt?.y ?? 360,
          toX: toPt?.x ?? 480,
          toY: toPt?.y ?? 360,
          label: '寄生吞噬×2',
        });
      }

      if ((state.lastTurnBreakdown?.totalDamage || 0) > 0) {
        this.vfx.spawnProjectile?.({
          fromX: chamberPt.x,
          fromY: chamberPt.y,
          toX: bossPt.x,
          toY: bossPt.y,
          color: '#ffd166',
        });
        this.vfx.spawnFloatingText?.({
          x: bossPt.x,
          y: bossPt.y,
          text: `-${state.lastTurnBreakdown?.formattedDamage || state.lastTurnBreakdown?.totalDamage}`,
          tier: state.lastTurnBreakdown?.intensityTier || 1,
        });
      }

      if ((state.lastTurnBreakdown?.chainSynergyMultiplier || 1) >= 4) {
        this.vfx.spawnChainExplosion?.({
          x: bossPt.x,
          y: bossPt.y,
          intensity: Math.max(2, state.lastTurnBreakdown?.intensityTier || 2),
        });
      }
      this.vfx.triggerScreenShake?.(state.lastTurnBreakdown?.intensityTier || 1);
    }

    return state;
  }

  handleLoadBullet(payload = {}) {
    if (!this.engine) return null;
    const state = this.engine.performSecondaryAction(payload);
    return this._syncHudAndRender(state);
  }

  handleSelectChamber(chamberIndex) {
    if (!this.engine) return null;
    const state =
      typeof this.engine.selectChamber === 'function'
        ? this.engine.selectChamber(chamberIndex)
        : this.engine.performSecondaryAction({ action: 'select_chamber', chamberIndex });
    return this._syncHudAndRender(state);
  }

  handleBuyAmmoSlot(slotIndex) {
    if (!this.engine) return null;
    const state =
      typeof this.engine.buyAmmoBeltSlot === 'function'
        ? this.engine.buyAmmoBeltSlot(slotIndex)
        : this.engine.performSecondaryAction({ action: 'buy_ammo', ammoIndex: slotIndex });
    return this._syncHudAndRender(state);
  }

  handlePickRelic(relicId) {
    if (!this.engine) return null;
    const state =
      typeof this.engine.pickRelic === 'function'
        ? this.engine.pickRelic(relicId)
        : this.engine.performSecondaryAction({ action: 'pick_relic', relicId });
    return this._syncHudAndRender(state);
  }

  handleEnterEndless() {
    if (!this.engine) return null;
    const state =
      typeof this.engine.enterEndless === 'function'
        ? this.engine.enterEndless()
        : this.engine.performSecondaryAction({ action: 'enter_endless' });
    return this._syncHudAndRender(state);
  }

  handleResetRun() {
    if (!this.engine) return null;
    const state = this.engine.reset({ seed: this.engine.seed });
    return this._syncHudAndRender(state);
  }

  onKeyDown(event) {
    if (!event) return false;
    const state = this.engine ? this.engine.getState() : null;
    if (
      state &&
      handleRelicDraftKeyDown(event, state, {
        onPickRelic: (relicId) => this.handlePickRelic(relicId),
      })
    ) {
      return true;
    }

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

    const bossObj = state.boss || getBossForFloor(state.wave || 1);
    const bossHpPct = Math.min(
      100,
      Math.max(0, Math.round(((state.enemyHp || 0) / Math.max(1, state.enemyMaxHp || 150)) * 100))
    );
    const burnHpPct = Math.max(bossHpPct, Math.min(100, this._prevEnemyHpPct || bossHpPct));
    const bossHitClass =
      this._justFired && (state.lastTurnBreakdown?.totalDamage || 0) > 0
        ? 'is-hit-flash anim-boss-hit'
        : '';
    const muzzleFlashClass =
      this._justFired && (state.lastTurnBreakdown?.totalDamage || 0) > 0
        ? 'is-muzzle-flashing anim-muzzle-flash'
        : '';
    const backfireStageClass = this._justFired && state.bloodRageActive ? 'is-backfired' : '';

    const chambersHtml = (state.chambers || [])
      .map((chamber, idx) => {
        const isActive = idx === state.activeChamberIndex;
        const isTargeted = idx === state.selectedChamberIndex;
        const activeClass = isActive ? 'is-active-chamber anim-mult-bounce' : '';
        const targetClass = isTargeted ? 'is-targeted-chamber' : '';
        const emptyClass = chamber.id === 'empty' ? 'is-empty-chamber' : 'is-loaded-chamber';
        const prevIdx = (idx + 5) % 6;
        const nextIdx = (idx + 1) % 6;
        const pts = (chamber.basePoints || 0) + (chamber.bonusPoints || 0);

        return `
          <div
            class="revolver-chamber ${activeClass} ${targetClass} ${emptyClass}"
            data-testid="chamber-${idx}"
            data-chamber-index="${idx}"
            data-bullet-id="${chamber.id}"
            title="点击锁定装填位 #${idx} (相邻: #${prevIdx} & #${nextIdx})"
          >
            <div class="chamber-top-meta">
              <span class="chamber-num">#${idx}</span>
              <span class="chamber-tier">T${chamber.tier}</span>
            </div>
            <div class="chamber-icon">${renderSprite(chamber.id, { size: 26, tier: chamber.tier })}</div>
            <div class="chamber-name">${chamber.zhName || chamber.name}</div>
            <div class="chamber-stats">
              <span>${pts}p</span>
              <span>×${chamber.mult}</span>
              ${chamber.devourStacks > 0 ? `<span class="chamber-devour-tag">+${chamber.devourStacks}</span>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    const ammoBelt = Array.isArray(state.ammoBelt) ? state.ammoBelt : [];
    const targetChamberLabel = Number.isInteger(state.selectedChamberIndex)
      ? `已锁弹仓 #${state.selectedChamberIndex}`
      : '点击任意弹仓 (#0-#5) 定向装填';

    const ammoBeltHtml = ammoBelt
      .slice(0, 3)
      .map((slot, sIdx) => {
        const cost = slot.cost || 20;
        const canAfford = (state.gold || 0) > 0;
        return `
          <button
            type="button"
            class="btn-arcade ammo-belt-slot"
            data-testid="ammo-slot-${sIdx}"
            data-action="buy_ammo"
            data-ammo-index="${sIdx}"
            data-ammo-id="${slot.id}"
            data-cost="${cost}"
            ${canAfford ? '' : 'disabled'}
          >
            ${renderSprite(slot.id, { size: 18, tier: slot.tier })}
            <span>${slot.zhName} (×${slot.mult}) · ${cost}G</span>
          </button>
        `;
      })
      .join('');

    const hpPct = Math.min(
      100,
      Math.max(0, Math.round(((state.playerHp || 0) / Math.max(1, state.playerMaxHp || 100)) * 100))
    );
    const overlayBannerHtml = renderRelicDraftHTML(state);

    this.containerEl.innerHTML = `
      <div class="scheme-view revolver-dungeon-stage ${backfireStageClass}" data-scheme="revolver-dungeon">
        ${overlayBannerHtml}

        <div class="revolver-arena-grid">
          <div class="devour-boss-column">
            <section class="boss-arena-card ${bossHitClass}" data-testid="boss-arena-card">
              <div class="boss-portrait-frame">
                ${renderBossPortrait(bossObj, { wave: state.wave || 1, schemeId: 'revolver-dungeon', size: 78 })}
              </div>
              <div class="boss-info-col">
                <div class="boss-header-row">
                  <h3 class="boss-name-title">${bossObj.zhName || '地牢首领'}</h3>
                  <span class="boss-wave-pill">第 ${state.wave || 1} 层</span>
                </div>
                <div class="boss-trait-badge">${bossObj.trait || '地牢守卫'}</div>
                <div class="boss-hp-dual-track">
                  <div class="boss-hp-burn-fill" style="width: ${burnHpPct}%"></div>
                  <div class="boss-hp-fill" style="width: ${bossHpPct}%"></div>
                </div>
                <div class="boss-hp-readout">
                  ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(state.enemyMaxHp)} HP
                </div>
              </div>
            </section>

            <div class="revolver-status-row">
              <div class="player-hp-widget" data-testid="player-hp-bar">
                <div class="hp-header">
                  <span>枪手生命 (Gunslinger HP)</span>
                  <strong>${state.playerHp} / ${state.playerMaxHp || 100} HP</strong>
                </div>
                <div class="hud-hp-bar-track">
                  <div class="hud-hp-bar-fill player-hp-fill" style="width: ${hpPct}%"></div>
                </div>
              </div>

              <div class="roulette-risk-widget" data-testid="roulette-risk-badge">
                <span>命中率: <strong>${state.hitOdds ?? 0}%</strong></span>
                <span>连发率: <strong>${state.chainOdds ?? 0}%</strong></span>
                <span>炸膛风险: <strong>${state.backfireRisk ?? 0}%</strong></span>
                ${(state.gritMultiplier || 1) > 1 ? `<span class="grit-active-pill">孤胆赌徒下发 ×${state.gritMultiplier}</span>` : ''}
              </div>
            </div>

            <div class="ammo-belt-bar" data-testid="ammo-belt">
              <span class="relic-flow-hint">战术弹药带 (${targetChamberLabel}):</span>
              ${ammoBeltHtml}
            </div>
          </div>

          <div class="devour-main-column">
            <div class="revolver-drum-assembly">
              <div class="revolver-cylinder ${muzzleFlashClass}" data-testid="revolver-cylinder">
                ${chambersHtml}
              </div>
            </div>

            <div class="revolver-controls-bar">
              <button
                type="button"
                class="btn-arcade btn-primary-action"
                data-testid="btn-spin-fire"
              >
                旋转弹巢并开火 / Spin &amp; Fire [Space]
              </button>
              <button
                type="button"
                class="btn-arcade btn-secondary-action"
                data-testid="btn-load-bullet"
              >
                随机塞入新弹 / Load Bullet [R]
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      return;
    }

    bindRelicDraftEvents(this.containerEl, {
      onPickRelic: (relicId) => this.handlePickRelic(relicId),
      onEnterEndless: () => this.handleEnterEndless(),
      onResetRun: () => this.handleResetRun(),
    });

    const fireBtn = this.containerEl.querySelector('[data-testid="btn-spin-fire"]');
    if (fireBtn && typeof fireBtn.addEventListener === 'function') {
      fireBtn.addEventListener('click', () => this.handleSpinAndFire());
    }

    const loadBtn = this.containerEl.querySelector('[data-testid="btn-load-bullet"]');
    if (loadBtn && typeof loadBtn.addEventListener === 'function') {
      loadBtn.addEventListener('click', () => this.handleLoadBullet());
    }

    for (let i = 0; i < 6; i++) {
      const chEl = this.containerEl.querySelector(`[data-testid="chamber-${i}"]`);
      if (chEl && typeof chEl.addEventListener === 'function') {
        chEl.addEventListener('click', () => this.handleSelectChamber(i));
      }
    }

    for (let s = 0; s < 3; s++) {
      const slotBtn = this.containerEl.querySelector(`[data-testid="ammo-slot-${s}"]`);
      if (slotBtn && typeof slotBtn.addEventListener === 'function') {
        slotBtn.addEventListener('click', () => this.handleBuyAmmoSlot(s));
      }
    }
  }
}

export function createRevolverDungeonView(engineOrOptions = null, sharedServices = {}) {
  return new RevolverDungeonView(engineOrOptions, sharedServices);
}

export default RevolverDungeonView;
