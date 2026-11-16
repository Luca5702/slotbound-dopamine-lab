/**
 * Scheme 3: 《黄金矿工防线》(Jackpot TD) — Interactive Browser View (`F-S3-01..03`)
 * Renders all required `data-testid` attributes specified in `PROJECT.md:272`:
 *  - `data-testid="td-lane-canvas"`
 *  - `data-testid="td-slot-bar"`
 *  - `data-testid="td-pedestal-0"` .. `data-testid="td-pedestal-4"`
 *  - `data-testid="btn-pull-lever"`
 *  - `data-testid="td-interest-ticker"`
 *  - `data-testid="td-base-hp"`
 *  - `data-testid="td-active-combo"`
 */

import { formatBigNumber } from '../../core/BigNumber.js';
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
      for (let i = 0; i < 5; i++) {
        const pedX = 200 + i * 140;
        this.vfx.spawnProjectile?.({
          fromX: pedX,
          fromY: 410,
          toX: 480,
          toY: 160,
          color: '#00f5d4',
        });
      }
      for (const dev of state.lastDevourEvents || []) {
        this.vfx.spawnDevourEffect?.({
          fromX: 200 + dev.fromIndex * 140,
          fromY: 410,
          toX: 200 + dev.toIndex * 140,
          toY: 410,
          label: `+${dev.stacksGain} STACKS`,
        });
      }
      if (state.laserRemainingMs > 0) {
        this.vfx.spawnLaserSweep?.({ durationMs: state.laserRemainingMs });
      }
      if (state.lastHand?.nuke) {
        this.vfx.spawnChainExplosion?.({ x: 480, y: 210, radius: 180, intensity: 4 });
      }
      if (bd.totalDamage > 0) {
        this.vfx.spawnFloatingText?.({
          x: 480,
          y: 180,
          text: `-${formatBigNumber(bd.totalDamage)}`,
          tier: bd.intensityTier || 1,
        });
        this.vfx.triggerScreenShake?.(bd.intensityTier || 1, 320);
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

  render(stateSnapshot = null) {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const state = stateSnapshot || this.engine.getState();
    const closestPct = Math.round((state.closestEnemyProgress || 0) * 100);
    const isRedZone = Boolean(state.isRedZoneCritical);
    const bd = state.lastTurnBreakdown || {};

    const effectsBadges = (state.activeEffects || [])
      .map(
        (eff) =>
          `<span class="td-effect-pill td-effect-${eff.type}">⚡ ${eff.name} (${(
            (eff.remainingMs || 0) / 1000
          ).toFixed(1)}s)</span>`
      )
      .join(' ');

    const enemiesHtml = (state.enemies || [])
      .map((enemy) => {
        const topPct = Math.min(92, Math.max(4, Math.round((enemy.progress || 0) * 85)));
        return `
          <div class="td-enemy-token ${enemy.isBoss ? 'td-enemy-boss' : ''}" style="top: ${topPct}%;">
            <span class="td-enemy-icon">${enemy.icon}</span>
            <span class="td-enemy-label">${enemy.zhName} (${Math.round((enemy.progress || 0) * 100)}%)</span>
          </div>
        `;
      })
      .join('');

    const pedestalsHtml = (state.pedestals || [])
      .map((ped, idx) => {
        const starStr = '★'.repeat(Math.max(1, ped.star || 1));
        const devouredClass = ped.devoured ? 'pedestal-devoured' : '';
        const starClass = `pedestal-star-${ped.star || 1}`;
        return `
          <div
            class="td-pedestal-card ${starClass} ${devouredClass}"
            data-testid="td-pedestal-${idx}"
            data-symbol-id="${ped.symbolId}"
            data-star="${ped.star || 1}"
          >
            <div class="td-pedestal-header">
              <span class="td-pedestal-rank">#${ped.rank}</span>
              <span class="td-pedestal-stars">${starStr}</span>
            </div>
            <div class="td-pedestal-icon">${ped.icon}</div>
            <div class="td-pedestal-name">${ped.zhName}</div>
            <div class="td-pedestal-stats">
              <span>基础 ${ped.effectiveBasePoints}</span>
              <span>吞噬 ${ped.permanentDevourStacks || 0}层</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.containerEl.innerHTML = `
      <section class="scheme-view jackpot-td-view ${isRedZone ? 'red-zone-alert' : ''}" data-testid="jackpot-td-view">
        <div class="td-top-status-row">
          <div class="td-status-badge td-base-hp-badge" data-testid="td-base-hp">
            🏰 防线生命 (Base HP): <strong>${state.playerHp} / ${state.playerMaxHp} HP</strong>
          </div>
          <div class="td-status-badge td-interest-badge" data-testid="td-interest-ticker">
            💰 实时复利 +20% (每2.5s) | 金库: <strong>${state.gold}G</strong> | 贪婪连击: <strong>×${Number(
              state.greedMultiplier || 1
            ).toFixed(2)}</strong>
          </div>
          <div class="td-status-badge td-combo-badge" data-testid="td-active-combo">
            🎯 当前牌型: <strong>${bd.comboName || '散牌齐射'}</strong> ${effectsBadges}
          </div>
        </div>

        <div class="td-battlefield-lane ${isRedZone ? 'lane-critical' : ''}" data-testid="td-lane-canvas">
          <div class="td-lane-telemetry">
            <span>👾 怪物推进进度: <strong>${closestPct}%</strong></span>
            <span>${
              isRedZone
                ? '🚨 警戒红区 (Red Zone >= 72% · 大招率 +35%!)'
                : '🛡️ 安全防区 (忍住不拉杆吃 +20% 复利)'
            }</span>
          </div>
          <div class="td-lane-track">
            ${enemiesHtml}
            <div class="td-red-zone-line" title="Red Zone Threshold (72%)">
              <span>⚠️ 72% 绝境警戒红线 (Red-Zone Adrenaline +35% Clutch Odds)</span>
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
            🎰 狂按拉杆刷新防线 (${state.pullCost || 10}G) / Pull Lever &amp; Fire [Space]
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
      const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (ctx) {
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
  }
}

export function createJackpotTDView(engineOrOptions = null, sharedServices = {}) {
  return new JackpotTDView(engineOrOptions, sharedServices);
}

export default JackpotTDView;
