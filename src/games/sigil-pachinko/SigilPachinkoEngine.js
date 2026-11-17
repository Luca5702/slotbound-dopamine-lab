/**
 * Scheme 4: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Deterministic Engine (`F-S4-01`, `F-R2-06`)
 * Implements:
 *  - Top 1×3 Alchemical Orb Spawner with Launch Aim (`left` / `center` / `right`)
 *  - 24-Peg Elemental Cascade Arena (4 staggered rows × 6 pegs) with 35G Sigil Peg Upgrade
 *  - Mid-Air Collision Auto-Devour (`<1000ms` orb fusion when higher-tier orb collides with lower-tier orb)
 *  - Ascending Pitch Peg Bounce Chimes (`523.25 * 2^(step/12) Hz`)
 *  - Bottom 5 Multiplier Crucibles (`×2`, `×5`, `×25 JACKPOT`, `×5`, `×2`)
 *  - Chaos Tilt (`performSecondaryAction`) lateral nudge & multiplier boost
 *  - Non-blocking Post-Wave 3-Card Relic Draft, Wave 8 Victory & Wave 9+ Endless Mode
 *
 * Zero DOM dependencies — runs natively in Node (`node --test`) and Browser.
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateSpinDamage } from '../../core/ScoreFormula.js';
import {
  createEconomyState,
  consumePull,
  settleWaveClear,
  startRelicDraft,
  resolvePendingRelicDraft,
  enterEndlessMode,
  getRelicModifiers,
  spendEconomyGold,
} from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  ARENA_BOUNDS,
  PEG_UPGRADE_COST,
  AIM_MODES,
  ORB_LIST,
  ORB_MAP,
  ORB_WEIGHTS,
  DEFAULT_PEGS,
  DEFAULT_CRUCIBLES,
  getBossForWave,
} from './config.js';

const DEFAULT_SPAWNER_IDS = ['ember_orb', 'lightning_sphere', 'void_glutton_orb'];
const SPAWNER_X_COORDS = [260, 400, 540];

function sanitizeOrbId(rawId) {
  if (rawId && typeof rawId === 'object') {
    const candidate = rawId.orbId || rawId.symbolId || rawId.id;
    if (candidate && ORB_MAP[candidate]) return candidate;
  }
  const str = String(rawId || '').trim();
  return ORB_MAP[str] ? str : 'ember_orb';
}

export class SigilPachinkoEngine {
  constructor(options = {}) {
    this.id = 'sigil-pachinko';
    this.schemeId = 'sigil-pachinko';
    this.sound = options.sound || null;
    this.bus = options.bus || createEventBus();
    this.flowTracker = options.flowTracker || createFlowTracker();
    this.reset(options);
  }

  reset(options = {}) {
    const rawSeed = options.seed !== undefined ? Number(options.seed) : 12345;
    this.seed = Number.isFinite(rawSeed) ? Math.abs(Math.trunc(rawSeed)) || 1 : 12345;
    this.prng = createPRNG(this.seed);

    const startWave = Math.max(1, Math.floor(sanitizeNumber(options.wave, 1)));
    const boss = getBossForWave(startWave);
    this.currentBoss = boss;
    this.enemyMaxHp = options.enemyMaxHp !== undefined
      ? Math.max(1, sanitizeNumber(options.enemyMaxHp, boss.maxHp))
      : boss.maxHp;
    this.enemyHp = options.enemyHp !== undefined
      ? Math.max(0, sanitizeNumber(options.enemyHp, boss.hp))
      : boss.hp;
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.victory = false;
    this.gameOver = false;

    this.economy = createEconomyState({
      wave: startWave,
      gold: Math.max(0, Math.floor(sanitizeNumber(options.gold, 100))),
      baseWaveGold: 45,
      maxPullsPerWave: 5,
      pullsRemaining: 5,
      interestRate: 0.25,
      greedMultiplier: Math.max(0.1, sanitizeNumber(options.greedMultiplier, 1.0)),
    });

    this.pegs = DEFAULT_PEGS.map((peg) => ({
      ...peg,
      hitCount: 0,
      active: false,
      level: 1,
      upgraded: false,
    }));

    this.crucibles = DEFAULT_CRUCIBLES.map((c) => ({
      ...c,
      capturedCount: 0,
      capturedOrbs: [],
    }));

    this.launchAim = 'center';
    this.spawner = DEFAULT_SPAWNER_IDS.map((id, idx) => this._createSpawnerSlot(idx, id));
    this.orbs = [];
    this.lastDevourEvents = [];

    this.chaosTiltCount = 0;
    this.chaosTiltActive = false;
    this.chaosTiltMultiplier = 1.0;
    this.overloadTriggered = false;

    this._forcedSpawner = null;
    this._forcedCrucibleIndex = null;

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1.0,
      devourStacks: 0,
      chainSynergyMultiplier: 1.0,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: '待命：释放炼金法球',
      triggeredSynergies: [],
      settlementDurationMs: 0,
    });

    return this.getState();
  }

  _createSpawnerSlot(index, rawOrbId) {
    const id = sanitizeOrbId(rawOrbId);
    const meta = ORB_MAP[id] || ORB_LIST[0];
    const aimSpec = AIM_MODES[this.launchAim] || AIM_MODES.center;
    const baseX = SPAWNER_X_COORDS[index] || 400;
    return {
      index,
      id: meta.id,
      orbId: meta.id,
      name: meta.name,
      zhName: meta.zhName,
      icon: meta.icon,
      tier: meta.tier,
      basePoints: meta.basePoints,
      mult: meta.mult,
      goldBonus: meta.goldBonus,
      x: safeClamp(baseX + aimSpec.shiftX, ARENA_BOUNDS.minX + 20, ARENA_BOUNDS.maxX - 20),
      y: ARENA_BOUNDS.spawnerY,
      color: meta.color,
    };
  }

  setLaunchAim(rawAim = 'center') {
    const normalized = String(rawAim || 'center').trim().toLowerCase();
    if (normalized === 'left' || normalized === 'center' || normalized === 'right') {
      this.launchAim = normalized;
    } else {
      this.launchAim = 'center';
    }
    this.spawner = this.spawner.map((slot, idx) => this._createSpawnerSlot(idx, slot.orbId));
    return this.getState();
  }

  /**
   * 35G Sigil Peg Upgrade (`T6-26`): spends 35 Gold to upgrade an arena peg into a high-yield sigil peg.
   */
  upgradeRandomPeg(pegIndex = null) {
    const paid = spendEconomyGold(this.economy, PEG_UPGRADE_COST);
    if (!paid.ok) {
      return this.getState();
    }

    let target = null;
    if (Number.isInteger(pegIndex) && pegIndex >= 0 && pegIndex < this.pegs.length) {
      target = this.pegs[pegIndex];
    } else {
      target = this.pegs.find((p) => !p.upgraded) || this.pegs[0];
    }

    if (target) {
      target.upgraded = true;
      target.level = (target.level || 1) + 1;
      target.bonusPoints = (target.bonusPoints || 10) + 18;
      target.multBonus = Number(((target.multBonus || 0.25) + 0.35).toFixed(2));
      target.goldBonus = (target.goldBonus || 0) + 5;
      target.devourBonus = (target.devourBonus || 0) + 1;
      target.zhName = `真印·${target.zhName.replace(/^真印·/, '')}`;
      this.sound?.playComboChime?.(8);
    }

    return this.getState();
  }

  pickRelic(relicId = null) {
    resolvePendingRelicDraft(this.economy, relicId);
    return this.getState();
  }

  enterEndless() {
    this.victory = false;
    const res = enterEndlessMode(this.economy, 85_000_000);
    const nextBoss = getBossForWave(res.wave);
    this.currentBoss = nextBoss;
    this.enemyMaxHp = nextBoss.maxHp;
    this.enemyHp = nextBoss.hp;
    return this.getState();
  }

  setSeed(seed) {
    const numeric = Number(seed);
    this.seed = Number.isFinite(numeric) ? Math.abs(Math.trunc(numeric)) || 1 : 12345;
    this.prng.setSeed(this.seed);
    return this.seed;
  }

  forceNextSpin(spawnerOrConfig) {
    if (Array.isArray(spawnerOrConfig)) {
      const ids = Array.from({ length: 3 }, (_, idx) => sanitizeOrbId(spawnerOrConfig[idx]));
      this._forcedSpawner = [...ids];
      this.spawner = ids.map((id, idx) => this._createSpawnerSlot(idx, id));
      return this.getState();
    }
    if (spawnerOrConfig && typeof spawnerOrConfig === 'object') {
      return this.forceState(spawnerOrConfig);
    }
    return this.getState();
  }

  forceGridOrCylinder(spawnerOrConfig) {
    return this.forceNextSpin(spawnerOrConfig);
  }

  forceState(forcedConfig = {}) {
    if (Array.isArray(forcedConfig)) {
      return this.forceNextSpin(forcedConfig);
    }
    if (!forcedConfig || typeof forcedConfig !== 'object') {
      return this.getState();
    }

    if (forcedConfig.seed !== undefined) {
      this.setSeed(forcedConfig.seed);
    }
    if (forcedConfig.wave !== undefined || forcedConfig.floor !== undefined) {
      const w = Math.max(1, Math.floor(sanitizeNumber(forcedConfig.wave ?? forcedConfig.floor, 1)));
      this.economy.wave = w;
      const boss = getBossForWave(w);
      this.currentBoss = boss;
      this.enemyMaxHp = boss.maxHp;
      this.enemyHp = boss.hp;
    }
    if (forcedConfig.enemyMaxHp !== undefined || forcedConfig.bossMaxHp !== undefined) {
      this.enemyMaxHp = Math.max(
        1,
        sanitizeNumber(forcedConfig.enemyMaxHp ?? forcedConfig.bossMaxHp, this.enemyMaxHp)
      );
    }
    if (forcedConfig.enemyHp !== undefined || forcedConfig.bossHp !== undefined) {
      this.enemyHp = Math.max(
        0,
        sanitizeNumber(forcedConfig.enemyHp ?? forcedConfig.bossHp, this.enemyHp)
      );
    }
    if (forcedConfig.playerHp !== undefined) {
      this.playerHp = safeClamp(sanitizeNumber(forcedConfig.playerHp, 100), 0, this.playerMaxHp);
      this.gameOver = this.playerHp <= 0;
    }
    if (forcedConfig.gold !== undefined) {
      this.economy.gold = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.gold, 0)));
    }
    if (forcedConfig.pullsRemaining !== undefined) {
      this.economy.pullsRemaining = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.pullsRemaining, 5)));
    }
    if (forcedConfig.greedMultiplier !== undefined) {
      this.economy.greedMultiplier = Math.max(0.1, sanitizeNumber(forcedConfig.greedMultiplier, 1.0));
    }
    if (forcedConfig.launchAim !== undefined) {
      this.setLaunchAim(forcedConfig.launchAim);
    }

    const spawnerArr =
      forcedConfig.spawner ||
      forcedConfig.orbs ||
      forcedConfig.grid ||
      forcedConfig.nextSpin ||
      forcedConfig.symbols;
    if (Array.isArray(spawnerArr)) {
      this.forceNextSpin(spawnerArr);
    }

    const forcedCrucible =
      forcedConfig.forceCrucibleIndex ??
      forcedConfig.targetCrucible ??
      forcedConfig.crucibleIndex;
    if (forcedCrucible !== undefined && forcedCrucible !== null) {
      this._forcedCrucibleIndex = safeClamp(Math.floor(sanitizeNumber(forcedCrucible, 2)), 0, 4);
    }

    return this.getState();
  }

  /**
   * Primary Action (`Space` / `[🔮 释放炼金法球]`):
   * Spawns 3 alchemical orbs from the 1×3 top spawner, resolves mid-air collision Auto-Devour
   * (`<1000ms`), bounces through the 24-peg elemental cascade with ascending chimes,
   * and targets the 5 bottom multiplier crucibles (`×2 / ×5 / ×25 JACKPOT`).
   */
  performPrimaryAction(payload = {}) {
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    // Non-blocking Relic Draft Auto-Advance (`T6-31`)
    const autoResolvedDraft =
      Array.isArray(this.economy.pendingRelicDraft) && this.economy.pendingRelicDraft.length > 0;
    if (autoResolvedDraft) {
      resolvePendingRelicDraft(this.economy, null);
    }

    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.spawner)) {
        this.forceNextSpin(payload.spawner);
      }
      if (payload.forceCrucibleIndex !== undefined && payload.forceCrucibleIndex !== null) {
        this._forcedCrucibleIndex = safeClamp(
          Math.floor(sanitizeNumber(payload.forceCrucibleIndex, 2)),
          0,
          4
        );
      }
      if (payload.launchAim) {
        this.setLaunchAim(payload.launchAim);
      }
    }

    const wasOvertime = (this.economy.pullsRemaining || 0) <= 0;
    consumePull(this.economy, { spendGold: false });

    // 1. Roll or consume forced 1×3 Spawner Orbs
    let spawnedIds;
    if (Array.isArray(this._forcedSpawner) && this._forcedSpawner.length === 3) {
      spawnedIds = [...this._forcedSpawner];
      this._forcedSpawner = null;
    } else {
      spawnedIds = [
        sanitizeOrbId(this.prng.pickWeighted(ORB_WEIGHTS)),
        sanitizeOrbId(this.prng.pickWeighted(ORB_WEIGHTS)),
        sanitizeOrbId(this.prng.pickWeighted(ORB_WEIGHTS)),
      ];
    }

    this.spawner = spawnedIds.map((id, idx) => this._createSpawnerSlot(idx, id));
    for (let i = 0; i < 3; i++) {
      this.sound?.playReelClack?.(i, 3);
    }

    const aimSpec = AIM_MODES[this.launchAim] || AIM_MODES.center;

    // 2. Instantiate 3 Falling Orb Entities (`T6-26` progressive cascade: start at y=80, settled=false)
    const activeOrbs = this.spawner.map((slot, idx) => {
      const baseVx = idx === 0 ? 42 : idx === 2 ? -42 : (this.prng.next() - 0.5) * 35;
      return {
        id: `orb_${idx}_${slot.orbId}`,
        index: idx,
        orbId: slot.orbId,
        name: slot.name,
        zhName: slot.zhName,
        icon: slot.icon,
        tier: slot.tier,
        basePoints: slot.basePoints,
        bonusPoints: 0,
        mult: slot.mult,
        goldBonus: slot.goldBonus || 0,
        x: slot.x,
        y: ARENA_BOUNDS.spawnerY + 25,
        vx: safeClamp(baseVx + aimSpec.shiftVx, -220, 220),
        vy: 280,
        radius: 14,
        devourStacks: 0,
        eatenCount: 0,
        bounceCount: 0,
        targetCrucibleIndex: 2,
        crucibleIndex: 2,
        settled: false,
        devoured: false,
      };
    });

    // 3. Mid-Air Collision Auto-Devour (`<1000ms` Orb Fusion)
    let turnDevourStacks = 0;
    const devourEvents = [];
    const sortedByTier = [...activeOrbs].sort((a, b) => b.tier - a.tier || a.index - b.index);
    const highestOrb = sortedByTier[0];

    for (let i = 1; i < sortedByTier.length; i++) {
      const candidate = sortedByTier[i];
      if (highestOrb.tier > candidate.tier) {
        candidate.devoured = true;
        const preyMeta = ORB_MAP[candidate.orbId] || ORB_LIST[0];
        const stacksGain = Math.max(1, preyMeta.devourStacksBonus || 1);
        highestOrb.eatenCount += 1;
        highestOrb.devourStacks += stacksGain;
        highestOrb.bonusPoints += candidate.basePoints + 20;
        highestOrb.mult = Number((highestOrb.mult + Math.max(0.2, candidate.mult - 1)).toFixed(2));
        highestOrb.radius += 4;
        turnDevourStacks += stacksGain;

        if (candidate.goldBonus > 0) {
          this.economy.gold += candidate.goldBonus;
        }

        devourEvents.push({
          predatorOrbId: highestOrb.orbId,
          preyOrbId: candidate.orbId,
          stacksGain,
        });

        this.sound?.playDevourCrunch?.(devourEvents.length, highestOrb.tier);
      }
    }
    this.lastDevourEvents = devourEvents;

    // Guarantee at least 1 surviving orb reaches the bottom crucibles (`T2-F17-02`)
    const survivingOrbs = activeOrbs.filter((o) => !o.devoured);
    if (survivingOrbs.length === 0 && activeOrbs.length > 0) {
      activeOrbs[0].devoured = false;
      survivingOrbs.push(activeOrbs[0]);
    }

    // 4. 24-Peg Elemental Cascade Bounces & Ascending Chimes (`T1-F17-04`)
    for (const peg of this.pegs) {
      peg.active = false;
    }

    let pegMultAccumulator = 0;
    let chimeStep = 0;
    let unupgradedPegDevourCount = 0;
    for (const orb of survivingOrbs) {
      if (orb.goldBonus > 0) {
        this.economy.gold += orb.goldBonus;
      }
      for (let row = 0; row < 4; row++) {
        const colIdx = safeClamp(
          Math.floor(((orb.x - 100) / 600) * 6 + (this.prng.next() - 0.5) * 1.5),
          0,
          5
        );
        const pegIdx = row * 6 + colIdx;
        const peg = this.pegs[pegIdx];
        if (peg) {
          peg.hitCount += 1;
          peg.active = true;
          orb.bounceCount += 1;
          orb.bonusPoints += peg.bonusPoints;
          pegMultAccumulator += peg.multBonus;
          if (peg.goldBonus > 0) {
            this.economy.gold += peg.goldBonus;
          }
          if (peg.devourBonus > 0 && (peg.upgraded || unupgradedPegDevourCount < 1)) {
            const gain = peg.upgraded ? peg.devourBonus : 1;
            if (!peg.upgraded) unupgradedPegDevourCount += 1;
            turnDevourStacks += gain;
            orb.devourStacks += gain;
          }
          this.sound?.playComboChime?.(chimeStep);
          chimeStep = Math.min(24, chimeStep + 1);
        }
      }
    }

    const relicMods = getRelicModifiers(this.economy);
    if (turnDevourStacks > 0 && relicMods.bonusDevourStacks > 0) {
      turnDevourStacks += relicMods.bonusDevourStacks;
    }

    // 5. Bottom 5 Multiplier Crucible Capture (`×2 / ×5 / ×25 JACKPOT`)
    for (const c of this.crucibles) {
      c.capturedCount = 0;
      c.capturedOrbs = [];
    }

    const forcedCrucible = this._forcedCrucibleIndex;
    this._forcedCrucibleIndex = null;

    let maxCrucibleMult = 2;
    let crucibleMultSum = 0;
    let hitJackpotCrucible = false;

    for (const orb of survivingOrbs) {
      let cIdx;
      if (forcedCrucible !== null && forcedCrucible !== undefined) {
        cIdx = safeClamp(forcedCrucible, 0, 4);
      } else if (this.chaosTiltActive) {
        const r = this.prng.next();
        cIdx = r < 0.55 ? 2 : r < 0.78 ? 1 : 3;
      } else if (this.launchAim === 'left') {
        const r = this.prng.next();
        cIdx = r < 0.35 ? 1 : r < 0.65 ? 0 : 2;
      } else if (this.launchAim === 'right') {
        const r = this.prng.next();
        cIdx = r < 0.35 ? 3 : r < 0.65 ? 4 : 2;
      } else {
        const r = this.prng.next();
        if (r < 0.08) cIdx = 2;
        else if (r < 0.45) cIdx = 1;
        else if (r < 0.82) cIdx = 3;
        else if (r < 0.91) cIdx = 0;
        else cIdx = 4;
      }

      const targetCrucible = this.crucibles[cIdx] || this.crucibles[2];
      orb.targetCrucibleIndex = cIdx;
      orb.crucibleIndex = cIdx;
      orb.vx = safeClamp((targetCrucible.centerX - orb.x) * 1.4 + aimSpec.shiftVx * 0.5, -200, 200);
      orb.vy = 320;

      targetCrucible.capturedCount += 1;
      targetCrucible.capturedOrbs.push(orb.orbId);

      if (targetCrucible.multiplier > maxCrucibleMult) {
        maxCrucibleMult = targetCrucible.multiplier;
      }
      crucibleMultSum += targetCrucible.multiplier;
      if (targetCrucible.isJackpot || cIdx === 2) {
        hitJackpotCrucible = true;
      }
    }

    this.orbs = activeOrbs;

    // 6. Compute Balatro-style Exponential Damage Breakdown
    let totalBasePoints = 0;
    for (const orb of survivingOrbs) {
      totalBasePoints += Math.round((orb.basePoints + orb.bonusPoints) * orb.mult);
    }

    const lineMultiplier = Number(
      Math.max(maxCrucibleMult, crucibleMultSum + pegMultAccumulator).toFixed(2)
    );

    const triggeredSynergies = [];
    let chainSynergyMultiplier = 1.0;

    if (devourEvents.length > 0) {
      triggeredSynergies.push('MID_AIR_ORB_FUSION');
      chainSynergyMultiplier *= 2.5;
    }
    if (hitJackpotCrucible) {
      triggeredSynergies.push('CRUCIBLE_JACKPOT_25X');
      chainSynergyMultiplier *= 3.0;
      this.sound?.playChainExplosion?.(3);
      this.sound?.playComboChime?.(12);
    }
    if (this.chaosTiltActive) {
      triggeredSynergies.push('CHAOS_TILT_OVERDRIVE');
      chainSynergyMultiplier *= this.chaosTiltMultiplier;
    }
    chainSynergyMultiplier = Number((chainSynergyMultiplier * relicMods.chainMultBonus).toFixed(2));

    const settlementDurationMs = Math.min(460, 180 + devourEvents.length * 70);
    this.flowTracker.completeSettlement(settlementDurationMs);

    const comboName = hitJackpotCrucible
      ? '×25 深渊核心坩埚大奖'
      : devourEvents.length > 0
        ? '半空炼金吞噬融合'
        : '咒印弹珠共鸣齐射';

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: turnDevourStacks,
      chainSynergyMultiplier,
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 7. Apply Damage to Alchemical Boss & Settle Wave Clear Interest (`T2-F17-05`, `T6-29..33`)
    if (breakdown.totalDamage >= this.enemyHp) {
      const unusedDrops = Math.max(0, Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0)));
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedDrops, clearedWave);

      if (clearedWave >= 8 && !this.economy.endlessMode) {
        this.victory = true;
        this.economy.wave = 8;
        this.enemyHp = 0;
        this.economy.pendingRelicDraft = null;
      } else {
        startRelicDraft(this.economy, 3, this.prng);
        const nextWave = this.economy.endlessMode
          ? clearedWave + 1
          : Math.min(8, this.economy.wave || clearedWave + 1);
        this.economy.wave = nextWave;
        const nextBoss = getBossForWave(nextWave);
        this.currentBoss = nextBoss;
        this.enemyMaxHp = nextBoss.maxHp;
        this.enemyHp = nextBoss.hp;
      }
    } else {
      this.enemyHp = Math.max(0, this.enemyHp - breakdown.totalDamage);
      this.economy.pullsRemaining = Math.max(
        0,
        Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0))
      );

      if (wasOvertime && this.enemyHp > 0) {
        const bossStrike = Math.max(15, sanitizeNumber(this.currentBoss?.attack, 25));
        this.playerHp = safeClamp(this.playerHp - bossStrike, 0, this.playerMaxHp);
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
      }
    }

    this.chaosTiltActive = false;
    this.chaosTiltMultiplier = 1.0;
    this.flowTracker.completeTurn?.();

    return this.getState();
  }

  /**
   * Secondary Action (`R` / `[⚡ 狂暴摇台 / Chaos Tilt]`, Launch Aim, or 35G Peg Upgrade):
   * Applies lateral impulse toward the center ×25 JACKPOT crucible and boosts multiplier,
   * while capping instability so repeated spam never produces NaN velocities (`T2-F17-03`).
   */
  performSecondaryAction(payload = {}) {
    if (payload && typeof payload === 'object') {
      if (payload.action === 'aim' || payload.aim) {
        return this.setLaunchAim(payload.aim);
      }
      if (payload.action === 'upgrade_peg' || payload.upgradePeg) {
        return this.upgradeRandomPeg(payload.pegIndex);
      }
      if (payload.action === 'pick_relic' || payload.relicId !== undefined) {
        return this.pickRelic(payload.relicId);
      }
      if (payload.action === 'enter_endless') {
        return this.enterEndless();
      }
      if (payload.action === 'reset_run') {
        return this.reset();
      }
    }

    this.chaosTiltCount = Math.min(10, (this.chaosTiltCount || 0) + 1);
    this.chaosTiltActive = true;
    this.chaosTiltMultiplier = 2.0;

    if (this.chaosTiltCount > 2 && this.prng.next() < 0.2) {
      this.overloadTriggered = true;
    }

    for (const orb of this.orbs) {
      if (!orb || orb.devoured) continue;
      const nudge = (400 - sanitizeNumber(orb.x, 400)) * 0.35;
      orb.vx = safeClamp(sanitizeNumber(orb.vx, 0) + nudge, -220, 220);
      orb.vy = safeClamp(sanitizeNumber(orb.vy, 260), 120, 420);
      orb.x = safeClamp(sanitizeNumber(orb.x, 400), ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);
      orb.y = safeClamp(sanitizeNumber(orb.y, 180), 40, ARENA_BOUNDS.crucibleY);
    }

    this.sound?.playReelClack?.(1, 3);
    this.bus?.emit?.('pachinko:tilt', {
      chaosTiltCount: this.chaosTiltCount,
      overloadTriggered: this.overloadTriggered,
    });

    return this.getState();
  }

  /**
   * Steps 2D orb trajectories, left/right wall reflections (`T2-F17-01`), and crucible capture (`T2-F17-04`).
   * @param {number} [dtMs=16.67]
   */
  step(dtMs = 16.67) {
    const rawDt = Number(dtMs);
    if (!Number.isFinite(rawDt) || rawDt <= 0) {
      return this.getState();
    }
    const dt = safeClamp(rawDt, 0, 10000);
    const dtSec = dt / 1000;

    for (const orb of this.orbs) {
      if (!orb) continue;
      if (orb.devoured || orb.settled) {
        orb.x = safeClamp(sanitizeNumber(orb.x, 400), ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);
        orb.y = safeClamp(sanitizeNumber(orb.y, ARENA_BOUNDS.crucibleY), 40, ARENA_BOUNDS.crucibleY);
        orb.vx = 0;
        orb.vy = 0;
        continue;
      }

      orb.vx = safeClamp(sanitizeNumber(orb.vx, 0), -240, 240);
      orb.vy = safeClamp(sanitizeNumber(orb.vy, 300) + 180 * dtSec, 150, 480);

      let nextX = sanitizeNumber(orb.x, 400) + orb.vx * dtSec;
      let nextY = sanitizeNumber(orb.y, 80) + orb.vy * dtSec;

      // Arena Left/Right Wall Reflection (`T2-F17-01`)
      if (nextX < ARENA_BOUNDS.minX) {
        nextX = ARENA_BOUNDS.minX + (ARENA_BOUNDS.minX - nextX) * 0.5;
        orb.vx = Math.abs(orb.vx) * 0.85;
      } else if (nextX > ARENA_BOUNDS.maxX) {
        nextX = ARENA_BOUNDS.maxX - (nextX - ARENA_BOUNDS.maxX) * 0.5;
        orb.vx = -Math.abs(orb.vx) * 0.85;
      }

      orb.x = safeClamp(nextX, ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);

      if (nextY >= ARENA_BOUNDS.crucibleY || dt >= 400) {
        const targetCrucible =
          this.crucibles[orb.targetCrucibleIndex] || this.crucibles[2];
        orb.x = safeClamp(targetCrucible.centerX, ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);
        orb.y = ARENA_BOUNDS.crucibleY;
        orb.vx = 0;
        orb.vy = 0;
        orb.settled = true;
      } else {
        orb.y = safeClamp(nextY, 40, ARENA_BOUNDS.crucibleY);
      }
    }

    return this.getState();
  }

  getState() {
    const breakdown = this.lastTurnBreakdown || calculateSpinDamage({ basePoints: 0 });
    const relics = Array.isArray(this.economy.relics) ? this.economy.relics.map((r) => ({ ...r })) : [];

    return {
      schemeId: this.id,
      id: this.id,
      seed: this.seed,
      wave: this.economy.wave,
      gold: this.economy.gold,
      interestRate: this.economy.interestRate,
      greedMultiplier: this.economy.greedMultiplier,
      pullsRemaining: this.economy.pullsRemaining,
      pullsUsed: this.economy.pullsUsed,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      bossId: this.currentBoss?.id || 'pachinko_boss_1',
      currentBoss: this.currentBoss ? { ...this.currentBoss } : null,
      enemyName: this.currentBoss?.zhName || '炼金泥偶守卫',
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: Math.round(this.enemyMaxHp),
      launchAim: this.launchAim || 'center',
      chaosTiltCount: this.chaosTiltCount,
      chaosTiltActive: this.chaosTiltActive,
      overloadTriggered: this.overloadTriggered,
      spawner: this.spawner.map((s) => ({ ...s })),
      pegs: this.pegs.map((p) => ({ ...p })),
      crucibles: this.crucibles.map((c) => ({ ...c, capturedOrbs: [...(c.capturedOrbs || [])] })),
      orbs: this.orbs.map((o) => ({ ...o })),
      relics,
      ownedRelics: relics,
      pendingRelicDraft: Array.isArray(this.economy.pendingRelicDraft)
        ? this.economy.pendingRelicDraft.map((r) => ({ ...r }))
        : null,
      lastSettlement: this.economy.lastSettlement ? { ...this.economy.lastSettlement } : null,
      victory: Boolean(this.victory),
      gameOver: Boolean(this.gameOver || this.playerHp <= 0),
      endlessMode: Boolean(this.economy.endlessMode),
      lastDevourEvents: this.lastDevourEvents.map((d) => ({ ...d })),
      lastTurnBreakdown: { ...breakdown },
      lastFormula: { ...breakdown },
    };
  }
}

export function createSigilPachinkoEngine(options = {}) {
  return new SigilPachinkoEngine(options);
}

export default SigilPachinkoEngine;
