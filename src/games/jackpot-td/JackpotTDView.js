/**
 * Scheme 3: 《黄金矿工防线》(Jackpot TD) — Interactive Browser View (`F-S3-01..03`, `F-R2-05`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md`:
 *  - `data-testid="boss-arena-card"` & `data-testid="boss-portrait-svg"`
 *  - `data-testid="td-lane-canvas"`
 *  - `data-testid="td-slot-bar"`
 *  - `data-testid="td-pedestal-0"` .. `data-testid="td-pedestal-4"`
 *  - `data-testid="btn-pull-lever"`
 *  - `data-testid="td-interest-ticker"`
 *  - `data-testid="td-base-hp"`
 *  - `data-testid="td-active-combo"`
 */

import { formatBigNumber } from '../../core/BigNumber.js';
import { renderSprite, renderBossPortrait } from '../../ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../ui/RelicDraftBanner.js';
import { JackpotTDEngine } from './JackpotTDEngine.js';

export class JackpotTDView {
  constructor(engineOrOptions = null, sharedServices = {}) {
    if (engineOrOptions && typeof engineOrOptions.getState === 'function') {
      this.engine = engineOrOptions;
    } else {
      this.engine = new JackpotTDEngine(engineOrOptions || {});
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

  triggerPullLever(payload = {}) {
    const state = this.engine.performPrimaryAction(payload);

    if (this.hud && typeof this.hud.update === 'function') {
      this.hud.update(state);
    }

    if (this.vfx) {
      const bd = state.lastTurnBreakdown || {};
      const bossAnchor =
        typeof this.vfx.resolveAnchor === 'function'
          ? this.vfx.resolveAnchor('[data-testid="boss-arena-card"]', 480, 160)
          : { x: 480, y: 160 };

      for (let i = 0; i < 5; i++) {
        const defaultPedX = 200 + i * 140;
        const pedAnchor =
          typeof this.vfx.resolveAnchor === 'function'
            ? this.vfx.resolveAnchor(`[data-testid="td-pedestal-${i}"]`, defaultPedX, 410)
            : { x: defaultPedX, y: 410 };
        this.vfx.spawnProjectile?.({
          fromX: pedAnchor.x,
          fromY: pedAnchor.y,
          toX: bossAnchor.x,
          toY: bossAnchor.y,
          color: '#00f5d4',
        });
      }
      for (const dev of state.lastDevourEvents || []) {
        const fromAnchor =
          typeof this.vfx.resolveAnchor === 'function'
            ? this.vfx.resolveAnchor(
                `[data-testid="td-pedestal-${dev.fromIndex}"]`,
                200 + dev.fromIndex * 140,
                410
              )
            : { x: 200 + dev.fromIndex * 140, y: 410 };
        const toAnchor =
          typeof this.vfx.resolveAnchor === 'function'
            ? this.vfx.resolveAnchor(
                `[data-testid="td-pedestal-${dev.toIndex}"]`,
                200 + dev.toIndex * 140,
                410
              )
            : { x: 200 + dev.toIndex * 140, y: 410 };
        this.vfx.spawnDevourEffect?.({
          fromX: fromAnchor.x,
          fromY: fromAnchor.y,
          toX: toAnchor.x,
          toY: toAnchor.y,
          label: `+${dev.stacksGain}吞噬`,
        });
      }
      if (state.laserRemainingMs > 0) {
        this.vfx.spawnLaserSweep?.({ durationMs: state.laserRemainingMs });
      }
      if (state.lastHand?.nuke) {
        this.vfx.spawnChainExplosion?.({
          x: bossAnchor.x,
          y: bossAnchor.y + 40,
          radius: 180,
          intensity: 4,
        });
      }
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: bossAnchor.x,
          y: bossAnchor.y + 20,
          text: `-${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 1,
        });
        this.vfx.triggerScreenShake?.(bd.intensityTier || 1, 320);
      }
    }

    this.render(state);
    return state;
  }

  triggerToggleHold(index) {
    const state = this.engine.toggleHoldPedestal(index);
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
      this.triggerPullLever();
      if (event.repeat && this.engine.flowTracker) {
        this.engine.flowTracker.engageTurbo?.();
      }
      return true;
    }
    if (code === 'KeyR' || key === 'r' || key === 'R') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const st = this.engine.performSecondaryAction({ action: 'wait_interest' });
      this.hud?.update?.(st);
      this.render(st);
      return true;
    }
    return false;
  }

  _buildEnemiesHtml(state) {
    return (state.enemies || [])
      .map((enemy) => {
        const topPct = Math.min(92, Math.max(6, Math.round((enemy.progress || 0) * 84)));
        const spriteSvg = renderSprite(enemy.archetypeId || 'gob_runner', {
          size: 20,
          tier: enemy.isBoss ? 4 : 2,
        });
        return `
          <div class="td-enemy-token ${enemy.isBoss ? 'td-enemy-boss' : ''}" style="top: ${topPct}%;">
            <span class="td-enemy-icon">${spriteSvg}</span>
            <span class="td-enemy-label">${enemy.zhName} (${Math.round((enemy.progress || 0) * 100)}%)</span>
          </div>
        `;
      })
      .join('');
  }

  _buildEffectsBadgesHtml(state) {
    return (state.activeEffects || [])
      .map(
        (eff) =>
          `<span class="td-effect-pill td-effect-${eff.type}">${eff.name} (${(
            (eff.remainingMs || 0) / 1000
          ).toFixed(1)}s)</span>`
      )
      .join(' ');
  }

  _paintLaneCanvas(canvas, state) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const isRedZone = Boolean(state.isRedZoneCritical);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isRedZone ? 'rgba(255, 51, 102, 0.16)' : 'rgba(0, 245, 212, 0.08)';
    ctx.fillRect(0, Math.round(canvas.height * 0.72), canvas.width, Math.round(canvas.height * 0.28));
    if (state.laserRemainingMs > 0) {
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, 90);
      ctx.lineTo(canvas.width, 90);
      ctx.stroke();
    }
  }

  /**
   * Non-destructive real-time DOM patcher (`T6-19`):
   * Updates marching `.td-enemy-token` positions, Red-Zone state, and interest/HP badges
   * without recreating `[data-testid="btn-pull-lever"]` or pedestal cards mid-click.
   */
  syncRealtimeDOM(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      return;
    }
    const state = stateSnapshot || this.engine.getState();

    const leverBtn = this.containerEl.querySelector('[data-testid="btn-pull-lever"]');
    if (!leverBtn) {
      this.render(state);
      return;
    }

    if (
      (state.gameOver && !this.containerEl.querySelector('[data-testid="run-defeat-banner"]')) ||
      (state.victory && !state.endlessMode && !this.containerEl.querySelector('[data-testid="run-victory-banner"]'))
    ) {
      this.render(state);
      return;
    }

    const closestPct = Math.round((state.closestEnemyProgress || 0) * 100);
    const isRedZone = Boolean(state.isRedZoneCritical);
    const isFrozen = Number(state.freezeRemainingMs || 0) > 0;
    const bd = state.lastTurnBreakdown || {};

    const viewEl = this.containerEl.querySelector('[data-testid="jackpot-td-view"]');
    if (viewEl && viewEl.classList) {
      viewEl.classList.toggle('red-zone-alert', isRedZone);
    }

    const baseHpEl = this.containerEl.querySelector('[data-testid="td-base-hp"]');
    if (baseHpEl) {
      baseHpEl.innerHTML = `防线生命 (Base HP): <strong>${state.playerHp} / ${state.playerMaxHp} HP</strong>`;
    }

    const interestEl = this.containerEl.querySelector('[data-testid="td-interest-ticker"]');
    if (interestEl) {
      interestEl.innerHTML = `实时复利 +20% (每2.5s) | 金库: <strong>${state.gold}G</strong> | 贪婪连击: <strong>×${Number(
        state.greedMultiplier || 1
      ).toFixed(2)}</strong>`;
    }

    const comboEl = this.containerEl.querySelector('[data-testid="td-active-combo"]');
    if (comboEl) {
      comboEl.innerHTML = `当前牌型: <strong>${bd.comboName || '散牌齐射'}</strong> ${this._buildEffectsBadgesHtml(
        state
      )}`;
    }

    const bossHpPct = Math.max(
      0,
      Math.min(100, Math.round((Number(state.enemyHp || 0) / Math.max(1, Number(state.enemyMaxHp || 1))) * 100))
    );
    const bossFillEl = this.containerEl.querySelector('[data-testid="boss-arena-card"] .boss-hp-fill');
    const bossBurnEl = this.containerEl.querySelector('[data-testid="boss-arena-card"] .boss-hp-burn-fill');
    const bossReadoutEl = this.containerEl.querySelector('[data-testid="boss-arena-card"] .boss-hp-readout');
    if (bossFillEl) bossFillEl.style.width = `${bossHpPct}%`;
    if (bossBurnEl) bossBurnEl.style.width = `${bossHpPct}%`;
    if (bossReadoutEl) {
      bossReadoutEl.textContent = `HP ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(
        state.enemyMaxHp
      )} (${bossHpPct}%)`;
    }

    const laneEl = this.containerEl.querySelector('[data-testid="td-lane-canvas"]');
    if (laneEl && laneEl.classList) {
      laneEl.classList.toggle('lane-critical', isRedZone);
      laneEl.classList.toggle('lane-frozen', isFrozen);
    }

    const telemetryEl = this.containerEl.querySelector('.td-lane-telemetry');
    if (telemetryEl) {
      telemetryEl.innerHTML = `
        <span>怪物推进进度: <strong>${closestPct}%</strong></span>
        <span>${
          isRedZone
            ? '警戒红区 (Red Zone >= 72% · 大招率 +35%!)'
            : '安全防区 (忍住不拉杆吃 +20% 复利)'
        }</span>
      `;
    }

    const enemiesLayer = this.containerEl.querySelector('.td-enemies-layer');
    if (enemiesLayer) {
      enemiesLayer.innerHTML = this._buildEnemiesHtml(state);
    }

    const canvas = this.containerEl.querySelector('canvas.td-lane-render-canvas');
    if (canvas) {
      this._paintLaneCanvas(canvas, state);
    }
  }

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();
    const closestPct = Math.round((state.closestEnemyProgress || 0) * 100);
    const isRedZone = Boolean(state.isRedZoneCritical);
    const isFrozen = Number(state.freezeRemainingMs || 0) > 0;
    const bd = state.lastTurnBreakdown || {};
    const effectsBadges = this._buildEffectsBadgesHtml(state);
    const enemiesHtml = this._buildEnemiesHtml(state);

    const bossHpPct = Math.max(
      0,
      Math.min(100, Math.round((Number(state.enemyHp || 0) / Math.max(1, Number(state.enemyMaxHp || 1))) * 100))
    );
    const bossPortraitSvg = renderBossPortrait(
      state.currentBoss || { id: state.bossId, name: state.enemyName, wave: state.wave },
      { wave: state.wave, schemeId: 'jackpot-td', size: 60 }
    );

    const relicBannerHtml = renderRelicDraftHTML(state);
    const heldCount = (state.heldPedestals || []).filter(Boolean).length;

    const pedestalsHtml = (state.pedestals || [])
      .map((ped, idx) => {
        const starStr = '★'.repeat(Math.max(1, ped.star || 1));
        const devouredClass = ped.devoured ? 'pedestal-devoured' : '';
        const starClass = `pedestal-star-${ped.star || 1}`;
        const isHeld = Boolean(ped.held || ped.locked);
        const heldClass = isHeld ? 'is-pedestal-locked pedestal-locked pedestal-held' : '';
        const towerSvg = renderSprite(ped.symbolId, { size: 34, tier: ped.tier || 1 });

        return `
          <div
            class="td-pedestal-card ${starClass} ${devouredClass} ${heldClass}"
            data-testid="td-pedestal-${idx}"
            data-symbol-id="${ped.symbolId}"
            data-star="${ped.star || 1}"
            data-held="${String(isHeld)}"
            data-locked="${String(isHeld)}"
            aria-pressed="${String(isHeld)}"
          >
            <div class="td-pedestal-header">
              <span class="td-pedestal-rank">#${ped.rank}</span>
              <span class="td-pedestal-stars">${starStr}</span>
              <button
                type="button"
                class="btn-arcade btn-pedestal-hold"
                data-action="hold-pedestal"
                data-pedestal-index="${idx}"
              >${isHeld ? '已锁' : '锁塔'}</button>
            </div>
            <div class="td-pedestal-icon">${towerSvg}</div>
            <div class="td-pedestal-name">${ped.zhName}</div>
            <div class="td-pedestal-stats">
              <span>基础 ${ped.effectiveBasePoints}</span>
              <span>吞噬 ${ped.permanentDevourStacks || 0}层</span>
            </div>
          </div>
        `;
      })
      .join('');

    const pullCost = Number(state.pullCost || 10);
    const isOverheat = Number(state.gold || 0) < pullCost;

    this.containerEl.innerHTML = `
      <section class="scheme-view jackpot-td-view ${isRedZone ? 'red-zone-alert' : ''}" data-testid="jackpot-td-view">
        <div class="boss-arena-card" data-testid="boss-arena-card">
          <div class="boss-portrait-frame">
            ${bossPortraitSvg}
          </div>
          <div class="boss-info-col">
            <div class="boss-header-row">
              <h3 class="boss-name-title">${state.enemyName || '锈铁钻探工头'}</h3>
              <span class="boss-wave-pill">第 ${state.wave} 波首领 · 锁定塔位 ${heldCount}/2</span>
            </div>
            <div class="boss-hp-dual-track">
              <div class="boss-hp-burn-fill" style="width: ${bossHpPct}%;"></div>
              <div class="boss-hp-fill" style="width: ${bossHpPct}%;"></div>
            </div>
            <div class="boss-hp-readout">HP ${formatBigNumber(state.enemyHp)} / ${formatBigNumber(state.enemyMaxHp)} (${bossHpPct}%)</div>
          </div>
        </div>

        ${relicBannerHtml}

        <div class="td-top-status-row">
          <div class="td-status-badge td-base-hp-badge" data-testid="td-base-hp">
            防线生命 (Base HP): <strong>${state.playerHp} / ${state.playerMaxHp} HP</strong>
          </div>
          <div class="td-status-badge td-interest-badge" data-testid="td-interest-ticker">
            实时复利 +20% (每2.5s) | 金库: <strong>${state.gold}G</strong> | 贪婪连击: <strong>×${Number(
              state.greedMultiplier || 1
            ).toFixed(2)}</strong>
          </div>
          <div class="td-status-badge td-combo-badge" data-testid="td-active-combo">
            当前牌型: <strong>${bd.comboName || '散牌齐射'}</strong> ${effectsBadges}
          </div>
        </div>

        <div class="td-battlefield-lane ${isRedZone ? 'lane-critical' : ''} ${isFrozen ? 'lane-frozen' : ''}" data-testid="td-lane-canvas">
          <div class="td-lane-telemetry">
            <span>怪物推进进度: <strong>${closestPct}%</strong></span>
            <span>${
              isRedZone
                ? '警戒红区 (Red Zone >= 72% · 大招率 +35%!)'
                : '安全防区 (忍住不拉杆吃 +20% 复利)'
            }</span>
          </div>
          <div class="td-lane-track">
            <div class="td-enemies-layer">
              ${enemiesHtml}
            </div>
            <div class="td-red-zone-line" title="Red Zone Threshold (72%)">
              <span>72% 绝境警戒红线 (Red-Zone Adrenaline +35% Clutch Odds)</span>
            </div>
          </div>
        </div>

        <div class="td-slot-bar" data-testid="td-slot-bar">
          ${pedestalsHtml}
        </div>

        <div class="td-controls-row">
          <button
            type="button"
            class="btn-arcade btn-primary-action btn-pull-lever"
            data-testid="btn-pull-lever"
          >
            ${
              isOverheat
                ? `过热强拉刷新防线 (0G 应急 · 耗血降伤) [Space]`
                : `狂按拉杆刷新防线 (${pullCost}G) / Pull Lever &amp; Fire [Space]`
            }
          </button>
        </div>
      </section>
    `;

    const laneEl =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="td-lane-canvas"]')
        : null;
    if (laneEl && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = 880;
      canvas.height = 180;
      canvas.className = 'td-lane-render-canvas';
      laneEl.appendChild(canvas);
      this._paintLaneCanvas(canvas, state);
    }

    const pullBtn =
      typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('[data-testid="btn-pull-lever"]')
        : null;
    if (pullBtn && typeof pullBtn.addEventListener === 'function') {
      pullBtn.addEventListener('click', () => {
        this.triggerPullLever();
      });
    }

    for (let idx = 0; idx < 5; idx++) {
      const cardEl = this.containerEl.querySelector?.(`[data-testid="td-pedestal-${idx}"]`);
      if (cardEl && typeof cardEl.addEventListener === 'function') {
        cardEl.addEventListener('click', () => {
          this.triggerToggleHold(idx);
        });
      }
      const holdSubBtn = cardEl?.querySelector?.('[data-action="hold-pedestal"]');
      if (holdSubBtn && typeof holdSubBtn.addEventListener === 'function') {
        holdSubBtn.addEventListener('click', (evt) => {
          evt?.stopPropagation?.();
          this.triggerToggleHold(idx);
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

export function createJackpotTDView(engineOrOptions = null, sharedServices = {}) {
  return new JackpotTDView(engineOrOptions, sharedServices);
}

export default JackpotTDView;
