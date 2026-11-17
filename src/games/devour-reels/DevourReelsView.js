/**
 * Scheme 1: 《吞噬转轮》(Devour Reels) Interactive Browser & Mock-DOM View (`F-S1-01`, `F-S1-02`, `F-S1-03`, `F-R2-03`)
 * Renders all required `data-testid` anchors per PROJECT.md:
 *  - `boss-arena-card`, `boss-portrait-svg`, `devour-grid`, `devour-cell-0`..`devour-cell-8`,
 *    `abyssal-maw`, `indigestion-meter`, `btn-spin-devour`, `prob-mod-panel`,
 *    `prob-boost-fireball`, `prob-boost-powder_keg`, `prob-preset-pyro`, `prob-preset-iron`,
 *    `prob-preset-gluttony`, plus `relic-draft-banner`, `run-victory-banner`, `run-defeat-banner`.
 */

import { SYMBOLS, MAW_WORKSHOP_ITEMS, WHEEL_MOD_COSTS, getBossForWave } from './config.js';
import { DevourReelsEngine } from './DevourReelsEngine.js';
import { formatBigNumber } from '../../core/BigNumber.js';
import { renderSprite, renderBossPortrait } from '../../ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../ui/RelicDraftBanner.js';
import { localizeSynergies } from '../../ui/HUDController.js';

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
    this._prevEnemyHpPct = 100;
    this._justSpun = false;
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

  triggerSpin(payload = {}) {
    if (!this.engine) return null;
    const prevState = this.engine.getState();
    this._prevEnemyHpPct = Math.min(
      100,
      Math.max(0, Math.round(((prevState.enemyHp || 0) / Math.max(1, prevState.enemyMaxHp || 120)) * 100))
    );
    this._justSpun = true;

    const state = this.engine.performPrimaryAction(payload);
    this._syncHudAndRender(state);
    this._justSpun = false;

    if (this.vfx) {
      const isMockEnv =
        typeof navigator !== 'undefined' && navigator.userAgent === 'SlotboundE2EMockBrowser';
      if (!isMockEnv) {
        this.vfx.syncDimensions?.();
        this.vfx.startLoop?.();
      }

      const bossPt =
        this.vfx.resolveAnchor?.('[data-testid="boss-arena-card"]', 480, 110) || { x: 480, y: 110 };
      const mawPt =
        this.vfx.resolveAnchor?.('[data-testid="devour-cell-4"]', 480, 320) || { x: 480, y: 320 };

      for (const evt of state.devourEvents || []) {
        const fromPt = this.vfx.resolveAnchor?.(
          `[data-testid="devour-cell-${evt.fromCell}"]`,
          360,
          340
        );
        const toPt = this.vfx.resolveAnchor?.(
          `[data-testid="devour-cell-${evt.toCell}"]`,
          mawPt.x,
          mawPt.y
        );
        this.vfx.spawnDevourEffect?.({
          fromCell: evt.fromCell,
          toCell: evt.toCell,
          fromX: fromPt?.x ?? 360,
          fromY: fromPt?.y ?? 340,
          toX: toPt?.x ?? mawPt.x,
          toY: toPt?.y ?? mawPt.y,
          label: `+${evt.stacksGained}吞噬`,
        });
      }

      this.vfx.spawnProjectile?.({
        fromX: mawPt.x,
        fromY: mawPt.y,
        toX: bossPt.x,
        toY: bossPt.y,
        color: '#ef476f',
      });

      if ((state.lastTurnBreakdown?.triggeredSynergies || []).length > 0) {
        this.vfx.spawnChainExplosion?.({
          x: bossPt.x,
          y: bossPt.y,
          intensity: Math.max(2, state.lastTurnBreakdown.intensityTier || 2),
        });
      }

      this.vfx.spawnFloatingText?.({
        x: bossPt.x,
        y: bossPt.y,
        text: `-${state.lastTurnBreakdown?.formattedDamage || state.lastTurnBreakdown?.totalDamage || 0}`,
        tier: state.lastTurnBreakdown?.intensityTier || 1,
      });
      this.vfx.triggerScreenShake?.(state.lastTurnBreakdown?.intensityTier || 1);
    }

    return state;
  }

  triggerModProbability(payload = {}) {
    if (!this.engine) return null;
    const state = this.engine.performSecondaryAction(payload);
    return this._syncHudAndRender(state);
  }

  triggerBilePurge() {
    if (!this.engine) return null;
    const before = this.engine.getState().indigestion;
    const state =
      typeof this.engine.purgeBile === 'function'
        ? this.engine.purgeBile()
        : this.engine.performSecondaryAction({ action: 'purge_bile' });
    if (state.indigestion < before && this.vfx) {
      const bossPt =
        this.vfx.resolveAnchor?.('[data-testid="boss-arena-card"]', 480, 140) || { x: 480, y: 140 };
      this.vfx.spawnChainExplosion?.({ x: bossPt.x, y: bossPt.y, intensity: 2 });
      this.vfx.spawnFloatingText?.({ x: bossPt.x, y: bossPt.y, text: '胃酸喷吐 ×2.5!', tier: 2 });
    }
    return this._syncHudAndRender(state);
  }

  triggerMawUpgrade(itemId) {
    if (!this.engine) return null;
    const state =
      typeof this.engine.upgradeMaw === 'function'
        ? this.engine.upgradeMaw(itemId)
        : this.engine.performSecondaryAction({ action: itemId, itemId });
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
      this.triggerSpin();
      if (event.repeat && this.engine?.flowTracker?.engageTurbo) {
        this.engine.flowTracker.engageTurbo();
      }
      return true;
    } else if (code === 'KeyR' || key === 'r' || key === 'R') {
      event.preventDefault?.();
      this.triggerBilePurge();
      return true;
    } else if (key === '1') {
      this.triggerModProbability({ preset: 'pyro', action: 'preset' });
      return true;
    } else if (key === '2') {
      this.triggerModProbability({ preset: 'iron', action: 'preset' });
      return true;
    } else if (key === '3') {
      this.triggerModProbability({ preset: 'gluttony', action: 'preset' });
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

    const bossObj = state.boss || getBossForWave(state.wave || 1);
    const bossHpPct = Math.min(
      100,
      Math.max(0, Math.round(((state.enemyHp || 0) / Math.max(1, state.enemyMaxHp || 120)) * 100))
    );
    const burnHpPct = Math.max(bossHpPct, Math.min(100, this._prevEnemyHpPct || bossHpPct));
    const bossHitClass =
      this._justSpun && (state.lastTurnBreakdown?.totalDamage || 0) > 0
        ? 'is-hit-flash anim-boss-hit'
        : '';

    const cellsHtml = (state.grid || [])
      .map((cell, idx) => {
        const isCenterMaw = idx === 4;
        const reelStopClass = this._justSpun ? 'is-reel-stopping anim-reel-clack' : '';
        const devouredClass = cell.devoured
          ? 'is-devoured is-prey-crunched anim-devour-bite'
          : '';
        const predatorClass =
          cell.devourCount > 0 ? 'is-predator-fed is-predator-lunging anim-devour-bite' : '';
        const centerClass = isCenterMaw ? 'is-center-maw-cell' : '';
        const totalCellPts = (cell.basePoints || 0) + (cell.bonusPoints || 0);

        return `
          <div
            class="devour-cell ${reelStopClass} ${devouredClass} ${predatorClass} ${centerClass}"
            data-testid="devour-cell-${idx}"
            data-symbol-id="${cell.symbolId}"
            data-tier="${cell.tier}"
            style="--col-idx: ${idx % 3}; --devour-order: ${idx}"
          >
            <div class="cell-header">
              <span class="cell-tier-badge">T${cell.tier}</span>
              ${isCenterMaw ? '<span class="cell-maw-crown">巨口核心</span>' : `<span class="cell-index">#${idx}</span>`}
            </div>
            <div class="cell-icon">${renderSprite(cell.symbolId, { size: 32, tier: cell.tier })}</div>
            <div class="cell-name">${cell.zhName || cell.name}</div>
            <div class="cell-stats">
              <span class="cell-pts">${totalCellPts} pts</span>
              ${cell.devourCount > 0 ? `<span class="cell-devour-badge">吞噬×${cell.devourCount}</span>` : ''}
              ${cell.devoured ? '<span class="cell-eaten-tag">已吞食</span>' : ''}
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
          <span class="prob-sym-label">
            ${renderSprite(sym.id, { size: 16, tier: sym.tier })}
            <span>${sym.zhName} (T${sym.tier})</span>
          </span>
          <strong class="prob-sym-weight">${weight.toFixed(1)}%</strong>
          <div class="prob-row-actions">
            <button
              type="button"
              class="btn-arcade btn-prob-boost"
              data-testid="prob-boost-${sym.id}"
              data-prob-action="boost"
              data-symbol-id="${sym.id}"
              title="花费 ${WHEEL_MOD_COSTS.boost}G 提升 ${sym.zhName} 权重"
            >+概率</button>
            <button
              type="button"
              class="btn-arcade btn-prob-banish"
              data-testid="prob-banish-${sym.id}"
              data-prob-action="banish"
              data-symbol-id="${sym.id}"
              title="花费 ${WHEEL_MOD_COSTS.banish}G 削减 ${sym.zhName} 权重"
            >-剔除</button>
          </div>
        </div>
      `;
    }).join('');

    const workshopButtonsHtml = MAW_WORKSHOP_ITEMS.map((item) => {
      const canAfford = (state.gold || 0) >= item.cost;
      return `
        <button
          type="button"
          class="btn-arcade btn-secondary-action btn-maw-workshop"
          data-testid="${item.testid}"
          data-action="${item.action}"
          data-cost="${item.cost}"
          ${canAfford ? '' : 'disabled'}
        >
          ${renderSprite(item.spriteId, { size: 16, tier: item.tier })}
          <span>${item.zhName} ${item.cost}G</span>
        </button>
      `;
    }).join('');

    const indigestionPct = Math.min(100, Math.max(0, Math.round(state.indigestion || 0)));
    const localizedSynergies = localizeSynergies(state.lastTurnBreakdown?.triggeredSynergies || []);
    const synergiesList =
      localizedSynergies.length > 0 ? localizedSynergies.join(' · ') : '等待拉杆投喂深渊巨口...';
    const mawChompClass =
      this._justSpun && (state.devourEvents || []).length > 0 ? 'is-maw-chomping anim-maw-chomp' : '';
    const overlayBannerHtml = renderRelicDraftHTML(state);

    this.containerEl.innerHTML = `
      <div class="scheme-view devour-reels-stage devour-reels-stage--3col" data-scheme="devour-reels">
        ${overlayBannerHtml}

        <div class="devour-boss-column">
          <section class="boss-arena-card ${bossHitClass}" data-testid="boss-arena-card">
            <div class="boss-portrait-frame">
              ${renderBossPortrait(bossObj, { wave: state.wave || 1, schemeId: 'devour-reels', size: 78 })}
            </div>
            <div class="boss-info-col">
              <div class="boss-header-row">
                <h3 class="boss-name-title">${bossObj.zhName || '攻城首领'}</h3>
                <span class="boss-wave-pill">第 ${state.wave || 1} 波</span>
              </div>
              <div class="boss-trait-badge">${bossObj.trait || '重装攻城机械'}</div>
              <div class="boss-hp-dual-track">
                <div class="boss-hp-burn-fill" style="width: ${burnHpPct}%"></div>
                <div class="boss-hp-fill" style="width: ${bossHpPct}%"></div>
              </div>
              <div class="boss-hp-readout">
                ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(state.enemyMaxHp)} HP
              </div>
            </div>
          </section>

          <div class="abyssal-maw-banner ${mawChompClass}" data-testid="abyssal-maw">
            <div class="maw-title">
              ${renderSprite('abyss_apostle', { size: 22, tier: 4 })}
              <strong>深渊巨口 Lv.${state.mawLevel || 1}</strong>
              <span class="maw-armor-badge">重甲 ${state.mawArmor || 0}</span>
              <span class="maw-devoured-badge">吞噬 ${state.totalRunDevoured || 0} · HP ${state.playerHp ?? 100}/${state.playerMaxHp || 100}</span>
            </div>
            <div class="maw-synergy-ticker">${synergiesList}</div>
          </div>

          <div class="indigestion-bar-wrapper" data-testid="indigestion-meter">
            <div class="indigestion-header">
              <span>消化不良槽 (满50按[R]喷吐胃酸)</span>
              <strong>${indigestionPct} / 100</strong>
            </div>
            <div class="hud-hp-bar-track">
              <div class="hud-hp-bar-fill indigestion-fill" style="width: ${indigestionPct}%"></div>
            </div>
            <button
              type="button"
              class="btn-arcade btn-secondary-action"
              data-testid="btn-purge-bile"
              data-action="purge_bile"
              ${indigestionPct < 50 ? 'disabled' : ''}
            >
              胃酸超载喷吐 [R] (${state.bilePurgeActive ? '已蓄力 ×2.5' : '需≥50消化'})
            </button>
          </div>

          <div class="maw-workshop-bar" data-testid="maw-workshop-bar">
            ${workshopButtonsHtml}
          </div>
        </div>

        <div class="devour-main-column">
          <div class="devour-grid" data-testid="devour-grid">
            ${cellsHtml}
          </div>

          <div class="devour-action-bar">
            <button
              type="button"
              class="btn-arcade btn-primary-action"
              data-testid="btn-spin-devour"
            >
              拉杆喂食巨口 / Spin &amp; Devour [Space]
            </button>
          </div>
        </div>

        <aside class="prob-mod-panel" data-testid="prob-mod-panel">
          <div class="prob-panel-header">
            <h3>轮盘概率改装台 (+${WHEEL_MOD_COSTS.boost}G / -${WHEEL_MOD_COSTS.banish}G)</h3>
            <p>流派预设 (${WHEEL_MOD_COSTS.preset}G) 或定向加权食材概率 (总和恒为 100%)</p>
          </div>

          <div class="prob-preset-bar">
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-pyro"
              data-preset="pyro"
            >爆破流 (Pyro)</button>
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-iron"
              data-preset="iron"
            >重甲流 (Iron)</button>
            <button
              type="button"
              class="btn-arcade"
              data-testid="prob-preset-gluttony"
              data-preset="gluttony"
            >暴食流 (Gluttony)</button>
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

    bindRelicDraftEvents(this.containerEl, {
      onPickRelic: (relicId) => this.handlePickRelic(relicId),
      onEnterEndless: () => this.handleEnterEndless(),
      onResetRun: () => this.handleResetRun(),
    });

    const spinBtn = this.containerEl.querySelector('[data-testid="btn-spin-devour"]');
    if (spinBtn && typeof spinBtn.addEventListener === 'function') {
      spinBtn.addEventListener('click', () => this.triggerSpin());
    }

    const purgeBtn = this.containerEl.querySelector('[data-testid="btn-purge-bile"]');
    if (purgeBtn && typeof purgeBtn.addEventListener === 'function') {
      purgeBtn.addEventListener('click', () => this.triggerBilePurge());
    }

    for (const item of MAW_WORKSHOP_ITEMS) {
      const wBtn = this.containerEl.querySelector(`[data-testid="${item.testid}"]`);
      if (wBtn && typeof wBtn.addEventListener === 'function') {
        wBtn.addEventListener('click', () => this.triggerMawUpgrade(item.action));
      }
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
