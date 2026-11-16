/**
 * Scheme 4: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Deterministic Engine (`F-S4-01`)
 * Implements:
 *  - Top 1×3 Alchemical Orb Spawner
 *  - 24-Peg Elemental Cascade Arena (4 staggered rows × 6 pegs)
 *  - Mid-Air Collision Auto-Devour (`<1000ms` orb fusion when higher-tier orb collides with lower-tier orb)
 *  - Ascending Pitch Peg Bounce Chimes (`523.25 * 2^(step/12) Hz`)
 *  - Bottom 5 Multiplier Crucibles (`×2`, `×5`, `×25 JACKPOT`, `×5`, `×2`)
 *  - Chaos Tilt (`performSecondaryAction`) lateral nudge & multiplier boost
 *
 * Zero DOM dependencies — runs natively in Node (`node --test`) and Browser.
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateSpinDamage } from '../../core/ScoreFormula.js';
import { createEconomyState, consumePull, settleWaveClear } from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  ARENA_BOUNDS,
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
    this.enemyMaxHp = boss.maxHp;
    this.enemyHp = boss.hp;
    this.playerHp = 100;
    this.playerMaxHp = 100;

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
    }));

    this.crucibles = DEFAULT_CRUCIBLES.map((c) => ({
      ...c,
      capturedCount: 0,
      capturedOrbs: [],
    }));

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
      comboName: 'READY TO DROP ORBS',
      triggeredSynergies: [],
      settlementDurationMs: 0,
    });

    return this.getState();
  }

  _createSpawnerSlot(index, rawOrbId) {
    const id = sanitizeOrbId(rawOrbId);
    const meta = ORB_MAP[id] || ORB_LIST[0];
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
      x: SPAWNER_X_COORDS[index] || 400,
      y: ARENA_BOUNDS.spawnerY,
      color: meta.color,
    };
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
   * and settles into the 5 bottom multiplier crucibles (`×2 / ×5 / ×25 JACKPOT`).
   */
  performPrimaryAction(payload = {}) {
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

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
    }

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

    // 2. Instantiate 3 Falling Orb Entities
    const activeOrbs = this.spawner.map((slot, idx) => ({
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
      x: SPAWNER_X_COORDS[idx] || 400,
      y: ARENA_BOUNDS.spawnerY + 25,
      vx: idx === 0 ? 42 : idx === 2 ? -42 : (this.prng.next() - 0.5) * 35,
      vy: 280,
      radius: 14,
      devourStacks: 0,
      eatenCount: 0,
      bounceCount: 0,
      targetCrucibleIndex: 2,
      crucibleIndex: 2,
      settled: false,
      devoured: false,
    }));

    // 3. Mid-Air Collision Auto-Devour (`<1000ms` Orb Fusion)
    // Higher-tier orbs devour lower-tier orbs mid-air.
    // Note: Identical-tier orbs NEVER mutually delete all orbs (`T2-F17-02`).
    let turnDevourStacks = 0;
    const devourEvents = [];
    const sortedByTier = [...activeOrbs].sort((a, b) => b.tier - a.tier || a.index - b.index);
    const highestOrb = sortedByTier[0];

    for (let i = 1; i < sortedByTier.length; i++) {
      const candidate = sortedByTier[i];
      if (highestOrb.tier > candidate.tier) {
        candidate.devoured = true;
        const meta = ORB_MAP[highestOrb.orbId] || ORB_LIST[0];
        const stacksGain = Math.max(1, (meta.devourStacksBonus || 1) + 1);
        highestOrb.eatenCount += 1;
        highestOrb.devourStacks += stacksGain;
        highestOrb.bonusPoints += candidate.basePoints + 20;
        highestOrb.mult = Number((highestOrb.mult * candidate.mult).toFixed(2));
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
          if (peg.devourBonus > 0) {
            turnDevourStacks += peg.devourBonus;
            orb.devourStacks += peg.devourBonus;
          }
          this.sound?.playComboChime?.(chimeStep);
          chimeStep = Math.min(24, chimeStep + 1);
        }
      }
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
        // Chaos Tilt biases orbs toward Center ×25 Jackpot Crucible (index 2) or Inner ×5 (1, 3)
        const r = this.prng.next();
        cIdx = r < 0.55 ? 2 : r < 0.78 ? 1 : 3;
      } else {
        const r = this.prng.next();
        if (r < 0.22) cIdx = 2;
        else if (r < 0.52) cIdx = 1;
        else if (r < 0.82) cIdx = 3;
        else if (r < 0.91) cIdx = 0;
        else cIdx = 4;
      }

      const targetCrucible = this.crucibles[cIdx] || this.crucibles[2];
      orb.targetCrucibleIndex = cIdx;
      orb.crucibleIndex = cIdx;
      orb.vx = safeClamp((targetCrucible.centerX - orb.x) * 1.4, -200, 200);
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

    const settlementDurationMs = Math.min(460, 180 + devourEvents.length * 70);
    this.flowTracker.completeSettlement(settlementDurationMs);

    const comboName = hitJackpotCrucible
      ? '×25 深渊核心坩埚大奖 (JACKPOT CRUCIBLE!)'
      : devourEvents.length > 0
        ? '半空炼金吞噬融合 (Mid-Air Alchemical Fusion)'
        : '咒印弹珠共鸣齐射 (Sigil Cascade Volley)';

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: turnDevourStacks,
      chainSynergyMultiplier: Number(chainSynergyMultiplier.toFixed(2)),
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 7. Apply Damage to Alchemical Boss & Settle Wave Clear Interest (`T2-F17-05`)
    if (breakdown.totalDamage >= this.enemyHp) {
      const unusedDrops = Math.max(1, this.economy.pullsRemaining || 1);
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedDrops, clearedWave);
      const nextWave = Math.min(8, this.economy.wave || clearedWave + 1);
      this.economy.wave = nextWave;
      const nextBoss = getBossForWave(nextWave);
      this.currentBoss = nextBoss;
      this.enemyMaxHp = nextBoss.maxHp;
      this.enemyHp = nextBoss.hp;
    } else {
      this.enemyHp = Math.max(0, this.enemyHp - breakdown.totalDamage);
      if (this.economy.pullsRemaining <= 0) {
        this.economy.pullsRemaining = this.economy.maxPullsPerWave || 5;
      }
    }

    this.chaosTiltActive = false;
    this.chaosTiltMultiplier = 1.0;
    this.flowTracker.completeTurn?.();

    return this.getState();
  }

  /**
   * Secondary Action (`R` / `[⚡ 狂暴摇台 / Chaos Tilt]`):
   * Applies lateral impulse toward the center ×25 JACKPOT crucible and boosts multiplier,
   * while capping instability so repeated spam never produces NaN velocities (`T2-F17-03`).
   */
  performSecondaryAction(payload = {}) {
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
      enemyName: this.currentBoss?.zhName || '炼金泥偶守卫',
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: Math.round(this.enemyMaxHp),
      chaosTiltCount: this.chaosTiltCount,
      chaosTiltActive: this.chaosTiltActive,
      overloadTriggered: this.overloadTriggered,
      spawner: this.spawner.map((s) => ({ ...s })),
      pegs: this.pegs.map((p) => ({ ...p })),
      crucibles: this.crucibles.map((c) => ({ ...c, capturedOrbs: [...(c.capturedOrbs || [])] })),
      orbs: this.orbs.map((o) => ({ ...o })),
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
