/**
 * Shared Balatro-Style Score & Economy HUD Controller (`F-UI-01`)
 * Renders and updates the 10 canonical `data-testid` HUD elements required by PROJECT.md:
 *  - `hud-wave`, `hud-enemy-hp`, `hud-pulls-left`, `hud-gold`
 *  - `hud-base-chips`, `hud-line-mult`, `hud-devour-stacks`, `hud-total-damage`,
 *    `hud-combo-name`, `hud-formula-breakdown`
 */

import {
  sanitizeNumber,
  formatBigNumber,
  formatChineseNumber,
  getIntensityTier,
} from '../core/BigNumber.js';

export class HUDController {
  constructor(containerEl = null) {
    this.containerEl = null;
    this.state = {
      wave: 1,
      maxWaves: 8,
      enemyName: 'Siege Boss',
      enemyHp: 120,
      enemyMaxHp: 120,
      pullsRemaining: 5,
      maxPullsPerWave: 5,
      gold: 100,
      interestRate: 0.25,
      greedMultiplier: 1.0,
      basePoints: 0,
      baseChips: 0,
      lineMultiplier: 1.0,
      lineMult: 1.0,
      devourStacks: 0,
      devourStacksMultiplier: 1.0,
      chainSynergyMultiplier: 1.0,
      totalDamage: 0,
      formattedDamage: '0',
      formattedChineseDamage: '0',
      comboName: 'READY TO SPIN',
      intensityTier: 0,
    };

    if (containerEl) {
      this.mount(containerEl);
    }
  }

  /**
   * Mounts the Balatro-style HUD banner inside `containerEl`.
   * @param {HTMLElement|object} containerEl
   */
  mount(containerEl) {
    if (!containerEl) return this;
    this.containerEl = containerEl;
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
   * Normalizes and applies a game state or formula breakdown snapshot to the HUD.
   * @param {object} snapshot
   */
  update(snapshot = {}) {
    if (!snapshot || typeof snapshot !== 'object') return this.getState();

    const formula = snapshot.lastTurnBreakdown || snapshot.lastFormula || snapshot;

    const wave = Math.max(1, Math.floor(sanitizeNumber(snapshot.wave ?? this.state.wave, 1)));
    const enemyMaxHp = Math.max(
      1,
      sanitizeNumber(snapshot.enemyMaxHp ?? snapshot.bossMaxHp ?? this.state.enemyMaxHp, 120)
    );
    const enemyHp = Math.max(
      0,
      sanitizeNumber(snapshot.enemyHp ?? snapshot.bossHp ?? this.state.enemyHp, enemyMaxHp)
    );
    const pullsRemaining = Math.max(
      0,
      Math.floor(
        sanitizeNumber(
          snapshot.pullsRemaining ?? snapshot.pullsLeft ?? snapshot.spinsRemaining ?? this.state.pullsRemaining,
          5
        )
      )
    );
    const gold = Math.max(0, Math.floor(sanitizeNumber(snapshot.gold ?? this.state.gold, 100)));
    const interestRate = Math.max(
      0,
      sanitizeNumber(snapshot.interestRate ?? this.state.interestRate, 0.25)
    );
    const greedMultiplier = Math.max(
      0.1,
      sanitizeNumber(
        formula.greedMultiplier ?? snapshot.greedMultiplier ?? this.state.greedMultiplier,
        1.0
      )
    );

    const basePoints = Math.max(
      0,
      sanitizeNumber(formula.basePoints ?? formula.baseChips ?? this.state.basePoints, 0)
    );
    const lineMultiplier = Math.max(
      0,
      sanitizeNumber(formula.lineMultiplier ?? formula.lineMult ?? this.state.lineMultiplier, 1.0)
    );
    const devourStacks = Math.max(
      0,
      Math.floor(sanitizeNumber(formula.devourStacks ?? this.state.devourStacks, 0))
    );
    const devourStacksMultiplier = Math.max(
      0,
      sanitizeNumber(
        formula.devourStacksMultiplier ?? formula.devourMultiplier ?? this.state.devourStacksMultiplier,
        1.0
      )
    );
    const chainSynergyMultiplier = Math.max(
      0,
      sanitizeNumber(
        formula.chainSynergyMultiplier ?? formula.chainBonusMult ?? this.state.chainSynergyMultiplier,
        1.0
      )
    );
    const totalDamage = Math.max(
      0,
      Math.floor(sanitizeNumber(formula.totalDamage ?? formula.finalDamage ?? this.state.totalDamage, 0))
    );
    const comboName = String(
      formula.comboName ?? snapshot.comboName ?? this.state.comboName ?? 'READY TO SPIN'
    );
    const intensityTier =
      formula.intensityTier !== undefined
        ? sanitizeNumber(formula.intensityTier, 0)
        : getIntensityTier(totalDamage);

    this.state = {
      ...this.state,
      wave,
      enemyName: String(snapshot.enemyName ?? snapshot.bossName ?? this.state.enemyName),
      enemyHp,
      enemyMaxHp,
      pullsRemaining,
      gold,
      interestRate,
      greedMultiplier: Number(greedMultiplier.toFixed(2)),
      basePoints,
      baseChips: basePoints,
      lineMultiplier: Number(lineMultiplier.toFixed(2)),
      lineMult: Number(lineMultiplier.toFixed(2)),
      devourStacks,
      devourStacksMultiplier: Number(devourStacksMultiplier.toFixed(2)),
      chainSynergyMultiplier: Number(chainSynergyMultiplier.toFixed(2)),
      totalDamage,
      formattedDamage: formatBigNumber(totalDamage),
      formattedChineseDamage: formatChineseNumber(totalDamage),
      comboName,
      intensityTier,
    };

    this.render();
    return this.getState();
  }

  /**
   * Renders or updates all 10 required `data-testid` HUD elements inside `this.containerEl`.
   */
  render() {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const s = this.state;
    const hpPct = Math.min(100, Math.max(0, Math.round((s.enemyHp / Math.max(1, s.enemyMaxHp)) * 100)));
    const interestPct = Math.round(s.interestRate * 100);

    this.containerEl.innerHTML = `
      <div class="hud-banner" data-intensity-tier="${s.intensityTier}">
        <div class="hud-top-row">
          <div class="hud-stat-card hud-wave-card" data-testid="hud-wave">
            <span class="hud-label">WAVE / 波次</span>
            <strong class="hud-value">Wave ${s.wave} / ${s.maxWaves}</strong>
          </div>

          <div class="hud-stat-card hud-enemy-card" data-testid="hud-enemy-hp">
            <div class="hud-enemy-header">
              <span class="hud-label">${s.enemyName}</span>
              <strong class="hud-value">${formatBigNumber(s.enemyHp)} / ${formatBigNumber(s.enemyMaxHp)} HP</strong>
            </div>
            <div class="hud-hp-bar-track">
              <div class="hud-hp-bar-fill" style="width: ${hpPct}%"></div>
            </div>
          </div>

          <div class="hud-stat-card hud-pulls-card" data-testid="hud-pulls-left">
            <span class="hud-label">剩余拉杆 (Pulls Left)</span>
            <strong class="hud-value">${s.pullsRemaining} Pulls</strong>
          </div>

          <div class="hud-stat-card hud-gold-card" data-testid="hud-gold">
            <span class="hud-label">赌狗金库 (Greed ×${s.greedMultiplier})</span>
            <strong class="hud-value">${s.gold}G (+${interestPct}% 利息)</strong>
          </div>
        </div>

        <div class="hud-formula-bar" data-testid="hud-formula-breakdown">
          <div class="hud-formula-equation">
            <div class="hud-chip-box hud-box-chips" data-testid="hud-base-chips" title="基础点 Base Points">
              <span class="box-caption">基础点 CHIPS</span>
              <strong class="box-number">${formatBigNumber(s.baseChips)}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-mult" data-testid="hud-line-mult" title="连线倍率 Line Multiplier">
              <span class="box-caption">连线 MULT</span>
              <strong class="box-number">×${s.lineMult}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-devour" data-testid="hud-devour-stacks" title="吞噬层数倍率 Devour Stacks">
              <span class="box-caption">吞噬 DEVOUR (${s.devourStacks}层)</span>
              <strong class="box-number">×${s.devourStacksMultiplier}</strong>
            </div>
            <span class="formula-op">=</span>
            <div
              class="hud-chip-box hud-box-total"
              data-testid="hud-total-damage"
              data-intensity-tier="${s.intensityTier}"
              title="最终爆发伤害 Total Damage"
            >
              <span class="box-caption">总伤害 TOTAL (${s.formattedChineseDamage})</span>
              <strong class="box-number">${s.formattedDamage}</strong>
            </div>
          </div>
          <div class="hud-combo-banner" data-testid="hud-combo-name">
            ${s.comboName}
          </div>
        </div>
      </div>
    `;
  }

  getState() {
    return { ...this.state };
  }
}

export function createHUDController(containerEl = null) {
  return new HUDController(containerEl);
}

export default HUDController;
