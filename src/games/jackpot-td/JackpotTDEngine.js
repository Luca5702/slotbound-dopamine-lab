/**
 * Scheme 3: 《黄金矿工防线》(Jackpot TD) — Deterministic Engine (`F-S3-01..03`)
 * Implements:
 *  - 1×5 Single-Line Slot Turret Wall across the monster invasion lane
 *  - Real-time enemy wave march (`step(dtMs)`) with Critical Red Zone (`y >= 0.72`)
 *  - Instant Gold Lever Pull refreshing all 5 turrets + firing immediate burst volley
 *  - Yahtzee / Poker Hand Evaluator:
 *      Pair / Two Pair -> 2-Star (★★) auto-merge
 *      Three of a Kind / Full House -> 3-Star (★★★) + 4s Screen-Wide Freeze (`三连冰冻`)
 *      Small / Large Straight -> 5s Berserk Hyper Laser Sweep (`长达5秒的狂暴激光洗地`)
 *      Four of a Kind -> 4s Freeze + 5s Hyper Laser Sweep
 *      Five of a Kind (Yahtzee) -> Screen-Wiping Tactical Nuke (`五连核弹`) + 5s Hyper Laser Sweep
 *  - `<1000ms` Pedestal Adjacency Auto-Devour
 *  - Real-Time `+20%` Compound Gold Interest & Greed Streak Multiplier
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
  accrueRealtimeInterest,
} from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  TD_CONSTANTS,
  TOWERS,
  TOWER_MAP,
  DEFAULT_TOWER_WEIGHTS,
  YAHTZEE_HANDS,
  ENEMIES,
  getBossForWave,
} from './config.js';

const DEFAULT_INITIAL_PEDESTALS = [
  'miner_pick',
  'gold_nugget',
  'cryo_prism',
  'tesla_coil',
  'prism_laser',
];

function sanitizeTowerId(rawId) {
  if (rawId && typeof rawId === 'object') {
    const candidate = rawId.symbolId || rawId.towerId || rawId.id;
    if (candidate && TOWER_MAP[candidate]) return candidate;
  }
  const str = String(rawId || '').trim();
  return TOWER_MAP[str] ? str : 'miner_pick';
}

/**
 * Evaluates a 1×5 array of tower symbol IDs (or pedestal objects) against Yahtzee / Poker rules.
 * Handles both ordered and unordered 4-straights and 5-straights (`T2-F15-04`).
 * @param {Array<string|object>} symbolIds
 * @returns {object}
 */
export function evaluateYahtzeeHand(symbolIds = []) {
  const ids = Array.from({ length: TD_CONSTANTS.PEDESTAL_COUNT }, (_, i) =>
    sanitizeTowerId(symbolIds[i])
  );
  const ranks = ids.map((id) => TOWER_MAP[id]?.rank || 1);

  const freqByRank = new Map();
  const freqById = {};
  for (let i = 0; i < ids.length; i++) {
    const r = ranks[i];
    const id = ids[i];
    freqByRank.set(r, (freqByRank.get(r) || 0) + 1);
    freqById[id] = (freqById[id] || 0) + 1;
  }

  const counts = [...freqByRank.values()].sort((a, b) => b - a);
  const uniqueSortedRanks = [...new Set(ranks)].sort((a, b) => a - b);

  let maxConsecutive = uniqueSortedRanks.length > 0 ? 1 : 0;
  let currentRun = uniqueSortedRanks.length > 0 ? 1 : 0;
  for (let i = 1; i < uniqueSortedRanks.length; i++) {
    if (uniqueSortedRanks[i] === uniqueSortedRanks[i - 1] + 1) {
      currentRun += 1;
      if (currentRun > maxConsecutive) {
        maxConsecutive = currentRun;
      }
    } else {
      currentRun = 1;
    }
  }

  let baseHand = YAHTZEE_HANDS.HIGH_CARD;
  if (counts[0] === 5) {
    baseHand = YAHTZEE_HANDS.YAHTZEE_FIVE;
  } else if (counts[0] === 4) {
    baseHand = YAHTZEE_HANDS.FOUR_OF_A_KIND;
  } else if (counts[0] === 3 && counts[1] === 2) {
    baseHand = YAHTZEE_HANDS.FULL_HOUSE;
  } else if (maxConsecutive >= 5) {
    baseHand = YAHTZEE_HANDS.LARGE_STRAIGHT;
  } else if (maxConsecutive === 4) {
    baseHand = YAHTZEE_HANDS.SMALL_STRAIGHT;
  } else if (counts[0] === 3) {
    baseHand = YAHTZEE_HANDS.THREE_OF_A_KIND;
  } else if (counts[0] === 2 && counts[1] === 2) {
    baseHand = YAHTZEE_HANDS.TWO_PAIR;
  } else if (counts[0] === 2) {
    baseHand = YAHTZEE_HANDS.ONE_PAIR;
  }

  return {
    ...baseHand,
    ids,
    ranks,
    counts,
    freqById,
    maxConsecutive,
  };
}

export class JackpotTDEngine {
  constructor(options = {}) {
    this.id = 'jackpot-td';
    this.schemeId = 'jackpot-td';
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
    const startGold = Math.max(0, Math.floor(sanitizeNumber(options.gold, 100)));

    this.economy = createEconomyState({
      wave: startWave,
      gold: startGold,
      baseWaveGold: 45,
      maxPullsPerWave: 5,
      pullsRemaining: 5,
      interestRate: TD_CONSTANTS.INTEREST_RATE,
      greedMultiplier: Math.max(0.1, sanitizeNumber(options.greedMultiplier, 1.0)),
      basePullCost: TD_CONSTANTS.BASE_PULL_COST,
    });

    this.playerMaxHp = 100;
    this.playerHp = safeClamp(sanitizeNumber(options.playerHp ?? 100, 100), 1, this.playerMaxHp);

    this.permanentPedestalStacks = [0, 0, 0, 0, 0];
    this.pedestals = DEFAULT_INITIAL_PEDESTALS.map((id, idx) => this._createPedestal(idx, id, 1, 0));

    this.freezeRemainingMs = 0;
    this.laserRemainingMs = 0;
    this.interestTimerMs = 0;
    this.activeEffects = [];
    this.lastDevourEvents = [];
    this.lastHand = { ...YAHTZEE_HANDS.HIGH_CARD };
    this._forcedNextPedestals = null;

    this._initWaveEnemies(startWave, { initialSpawn: true });

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1.0,
      devourStacks: 0,
      chainSynergyMultiplier: 1.0,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: 'READY TO PULL LEVER',
      triggeredSynergies: [],
      settlementDurationMs: 0,
    });

    return this.getState();
  }

  _createPedestal(index, rawSymbolId, star = 1, permanentStacks = 0) {
    const id = sanitizeTowerId(rawSymbolId);
    const meta = TOWER_MAP[id] || TOWERS[0];
    const clampedStar = safeClamp(Math.floor(sanitizeNumber(star, 1)), 1, 3);
    const starMult = clampedStar === 3 ? 4.5 : clampedStar === 2 ? 2.2 : 1.0;

    return {
      index,
      id: meta.id,
      symbolId: meta.id,
      towerId: meta.id,
      name: meta.name,
      zhName: meta.zhName,
      icon: meta.icon,
      rank: meta.rank,
      tier: meta.tier,
      basePoints: meta.basePoints,
      effectiveBasePoints: Math.round(meta.basePoints * starMult),
      shotsPerSec: meta.shotsPerSec,
      star: clampedStar,
      stars: clampedStar,
      level: clampedStar,
      starMultiplier: starMult,
      isPredator: Boolean(meta.isPredator),
      isFodder: Boolean(meta.isFodder),
      devourStacks: Math.max(0, Math.floor(sanitizeNumber(permanentStacks, 0))),
      permanentDevourStacks: Math.max(0, Math.floor(sanitizeNumber(permanentStacks, 0))),
      devourCount: 0,
      devoured: false,
      devouredBy: null,
      bonusPoints: 0,
      color: meta.color,
    };
  }

  _initWaveEnemies(waveNumber = 1, opts = {}) {
    const bossMeta = getBossForWave(waveNumber);
    this.currentBoss = bossMeta;
    this.enemyMaxHp = bossMeta.maxHp;
    this.enemyHp = bossMeta.hp;

    const leadProgress = opts.initialSpawn ? 0.14 : 0.08;
    this.enemies = [
      {
        id: `enemy_${waveNumber}_runner`,
        archetypeId: 'gob_runner',
        name: ENEMIES[0].name,
        zhName: ENEMIES[0].zhName,
        icon: ENEMIES[0].icon,
        speed: ENEMIES[0].speed,
        hp: Math.max(20, Math.round(bossMeta.maxHp * 0.25)),
        maxHp: Math.max(20, Math.round(bossMeta.maxHp * 0.25)),
        progress: leadProgress,
        breachDamage: ENEMIES[0].breachDamage,
        isBoss: false,
      },
      {
        id: `enemy_${waveNumber}_shield`,
        archetypeId: 'shield_bearer',
        name: ENEMIES[1].name,
        zhName: ENEMIES[1].zhName,
        icon: ENEMIES[1].icon,
        speed: ENEMIES[1].speed,
        hp: Math.max(40, Math.round(bossMeta.maxHp * 0.5)),
        maxHp: Math.max(40, Math.round(bossMeta.maxHp * 0.5)),
        progress: Math.max(0.02, leadProgress - 0.04),
        breachDamage: ENEMIES[1].breachDamage,
        isBoss: false,
      },
      {
        id: `enemy_${waveNumber}_berserker`,
        archetypeId: 'tunnel_berserker',
        name: ENEMIES[2].name,
        zhName: ENEMIES[2].zhName,
        icon: ENEMIES[2].icon,
        speed: ENEMIES[2].speed,
        enragedSpeed: ENEMIES[2].enragedSpeed,
        hp: Math.max(30, Math.round(bossMeta.maxHp * 0.4)),
        maxHp: Math.max(30, Math.round(bossMeta.maxHp * 0.4)),
        progress: Math.max(0.01, leadProgress - 0.07),
        breachDamage: ENEMIES[2].breachDamage,
        isBoss: false,
      },
      {
        id: `enemy_${waveNumber}_boss`,
        archetypeId: 'siege_dreadnought',
        name: bossMeta.zhName || ENEMIES[3].name,
        zhName: bossMeta.zhName || ENEMIES[3].zhName,
        icon: ENEMIES[3].icon,
        speed: ENEMIES[3].speed,
        hp: bossMeta.hp,
        maxHp: bossMeta.maxHp,
        progress: Math.max(0.01, leadProgress - 0.10),
        breachDamage: ENEMIES[3].breachDamage,
        isBoss: true,
      },
    ];

    this._recomputeClosestEnemyProgress();
  }

  _recomputeClosestEnemyProgress() {
    if (!Array.isArray(this.enemies) || this.enemies.length === 0) {
      this.closestEnemyProgress = 0;
    } else {
      let maxProg = 0;
      for (const enemy of this.enemies) {
        const p = safeClamp(sanitizeNumber(enemy.progress, 0), 0, 1);
        enemy.progress = p;
        if (p > maxProg) maxProg = p;
      }
      this.closestEnemyProgress = Number(maxProg.toFixed(4));
    }
    this.isRedZoneCritical = this.closestEnemyProgress >= TD_CONSTANTS.RED_ZONE_THRESHOLD;
    return this.closestEnemyProgress;
  }

  _syncActiveEffects() {
    const effects = [];
    if (this.freezeRemainingMs > 0) {
      effects.push({
        id: 'freeze_4s',
        type: 'freeze',
        name: '三连冰冻 (4s Screen-Wide Freeze)',
        remainingMs: Math.round(this.freezeRemainingMs),
      });
    }
    if (this.laserRemainingMs > 0) {
      effects.push({
        id: 'hyper_laser_5s',
        type: 'laser',
        name: '5秒狂暴激光洗地 (5s Berserk Hyper Laser)',
        remainingMs: Math.round(this.laserRemainingMs),
      });
    }
    this.activeEffects = effects;
    return effects;
  }

  setSeed(seed) {
    const numeric = Number(seed);
    this.seed = Number.isFinite(numeric) ? Math.abs(Math.trunc(numeric)) || 1 : 12345;
    this.prng.setSeed(this.seed);
    return this.seed;
  }

  forceNextSpin(idsOrConfig) {
    if (Array.isArray(idsOrConfig)) {
      const sanitized = Array.from({ length: TD_CONSTANTS.PEDESTAL_COUNT }, (_, idx) =>
        sanitizeTowerId(idsOrConfig[idx])
      );
      this._forcedNextPedestals = sanitized;
      this.pedestals = sanitized.map((id, idx) =>
        this._createPedestal(idx, id, 1, this.permanentPedestalStacks[idx] || 0)
      );
      return this.getState();
    }
    if (idsOrConfig && typeof idsOrConfig === 'object') {
      return this.forceState(idsOrConfig);
    }
    return this.getState();
  }

  forceGridOrCylinder(idsOrConfig) {
    return this.forceNextSpin(idsOrConfig);
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
      this._initWaveEnemies(w, { initialSpawn: true });
    }
    if (forcedConfig.gold !== undefined) {
      this.economy.gold = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.gold, 0)));
    }
    if (forcedConfig.greedMultiplier !== undefined) {
      this.economy.greedMultiplier = Math.max(0.1, sanitizeNumber(forcedConfig.greedMultiplier, 1.0));
    }
    if (forcedConfig.pullsRemaining !== undefined) {
      this.economy.pullsRemaining = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.pullsRemaining, 5)));
    }
    if (forcedConfig.pullsUsed !== undefined) {
      this.economy.pullsUsed = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.pullsUsed, 0)));
    }
    if (forcedConfig.playerHp !== undefined || forcedConfig.baseHp !== undefined) {
      this.playerHp = safeClamp(
        sanitizeNumber(forcedConfig.playerHp ?? forcedConfig.baseHp, this.playerHp),
        0,
        this.playerMaxHp
      );
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
    if (forcedConfig.freezeRemainingMs !== undefined) {
      this.freezeRemainingMs = Math.max(0, sanitizeNumber(forcedConfig.freezeRemainingMs, 0));
    }
    if (forcedConfig.laserRemainingMs !== undefined) {
      this.laserRemainingMs = Math.max(0, sanitizeNumber(forcedConfig.laserRemainingMs, 0));
    }

    if (forcedConfig.closestEnemyProgress !== undefined) {
      const targetProg = safeClamp(sanitizeNumber(forcedConfig.closestEnemyProgress, 0), 0, 1);
      if (!Array.isArray(this.enemies) || this.enemies.length === 0) {
        this._initWaveEnemies(this.economy.wave || 1);
      }
      for (const enemy of this.enemies) {
        if (enemy.progress > targetProg) {
          enemy.progress = Math.max(0, targetProg - 0.02);
        }
      }
      this.enemies[0].progress = targetProg;
      this._recomputeClosestEnemyProgress();
    }

    const arr =
      forcedConfig.pedestals ||
      forcedConfig.grid ||
      forcedConfig.chambers ||
      forcedConfig.nextSpin ||
      forcedConfig.symbols;
    if (Array.isArray(arr)) {
      this.forceNextSpin(arr);
    }

    this._syncActiveEffects();
    return this.getState();
  }

  _rollFivePedestals() {
    if (Array.isArray(this._forcedNextPedestals) && this._forcedNextPedestals.length === TD_CONSTANTS.PEDESTAL_COUNT) {
      const forced = [...this._forcedNextPedestals];
      this._forcedNextPedestals = null;
      return forced;
    }

    const weightedItems = TOWERS.map((t) => ({
      id: t.id,
      weight: DEFAULT_TOWER_WEIGHTS[t.id] || t.defaultWeight || 10,
    }));

    // Red-Zone Adrenaline (`F-S3-03`): when closestEnemyProgress >= 0.72, boost clutch hand odds (+35%)
    if (this.closestEnemyProgress >= TD_CONSTANTS.RED_ZONE_THRESHOLD) {
      const clutchRoll = this.prng.next();
      if (clutchRoll < 0.55) {
        const modeRoll = this.prng.next();
        if (modeRoll < 0.45) {
          // Guaranteed Three of a Kind Freeze / High-rank triplet
          const clutchIds = ['cryo_prism', 'tesla_coil', 'prism_laser', 'nuke_core'];
          const chosen = clutchIds[this.prng.nextInt(0, clutchIds.length - 1)];
          const f1 = this.prng.pickWeighted(weightedItems);
          const f2 = this.prng.pickWeighted(weightedItems);
          return [chosen, chosen, chosen, f1, f2];
        } else if (modeRoll < 0.82) {
          // Guaranteed 5-reel Straight (Hyper Laser Sweep)
          return ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser'];
        } else {
          // Guaranteed Five of a Kind Yahtzee Nuke
          const chosen = this.prng.next() < 0.5 ? 'nuke_core' : 'prism_laser';
          return [chosen, chosen, chosen, chosen, chosen];
        }
      }
    }

    const spun = [];
    for (let i = 0; i < TD_CONSTANTS.PEDESTAL_COUNT; i++) {
      const picked = this.prng.pickWeighted(weightedItems);
      spun.push(sanitizeTowerId(picked));
    }
    return spun;
  }

  /**
   * Primary Action (`Space` / `[🎰 狂按拉杆刷新防线]`):
   * Spends Gold, refreshes all 5 pedestals, evaluates Yahtzee combos, merges 2-star / 3-star towers,
   * executes `<1000ms` Pedestal Adjacency Auto-Devour, activates Freeze / 5s Hyper Laser / Nuke,
   * and fires synchronized burst volley at marching enemies.
   */
  performPrimaryAction(payload = {}) {
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    if (payload && typeof payload === 'object') {
      const forcedArr = payload.pedestals || payload.grid || payload.symbols;
      if (Array.isArray(forcedArr)) {
        this.forceNextSpin(forcedArr);
      }
    }

    // Preserve accumulated Greed Streak Multiplier before consumePull resets streak (`T1-F16-03`, `T2-F16-02`)
    const greedMultiplierAtPull = Math.max(
      0.1,
      sanitizeNumber(this.economy.greedMultiplier, 1.0),
      sanitizeNumber(this.economy.greedStreakMultiplier, 1.0)
    );

    consumePull(this.economy, {
      spendGold: true,
      costEscalation: TD_CONSTANTS.PULL_COST_ESCALATION,
      allowOverdraft: true,
    });
    this.economy.gold = Math.max(0, Math.floor(sanitizeNumber(this.economy.gold, 0)));
    this.economy.greedMultiplier = greedMultiplierAtPull;
    this.interestTimerMs = 0;

    const spunIds = this._rollFivePedestals();

    // 1. Play 5 mechanical reel clacks
    for (let i = 0; i < TD_CONSTANTS.PEDESTAL_COUNT; i++) {
      this.sound?.playReelClack?.(i, TD_CONSTANTS.PEDESTAL_COUNT);
    }

    // 2. Evaluate 1×5 Yahtzee Hand
    const hand = evaluateYahtzeeHand(spunIds);
    this.lastHand = hand;

    // 3. Build Pedestals & Apply Star Auto-Merge (`★ -> ★★ -> ★★★`)
    const freqMap = hand.freqById || {};
    this.pedestals = spunIds.map((symbolId, idx) => {
      const count = freqMap[symbolId] || 1;
      let star = 1;
      if (
        count >= 3 ||
        hand.id === 'LARGE_STRAIGHT' ||
        hand.id === 'FOUR_OF_A_KIND' ||
        hand.id === 'YAHTZEE_FIVE'
      ) {
        star = 3;
      } else if (count === 2 || hand.id === 'SMALL_STRAIGHT') {
        star = 2;
      }
      return this._createPedestal(idx, symbolId, star, this.permanentPedestalStacks[idx] || 0);
    });

    // Spawn gold bonus for any Gold Nugget Turrets spun
    let instantSpinGold = 0;
    for (const p of this.pedestals) {
      const meta = TOWER_MAP[p.symbolId];
      if (meta?.spawnGold) {
        instantSpinGold += meta.spawnGold;
      }
      if (meta?.shotGold) {
        instantSpinGold += meta.shotGold;
      }
    }
    if (instantSpinGold > 0) {
      this.economy.gold += instantSpinGold;
    }

    // 4. Execute `<1000ms` Pedestal Adjacency Auto-Devour
    let turnDevourStacks = 0;
    const devourEvents = [];
    const predatorOrder = [...this.pedestals]
      .filter((p) => p.rank >= 4)
      .sort((a, b) => b.rank - a.rank || a.index - b.index);

    for (const predator of predatorOrder) {
      if (predator.devoured) continue;
      const reach = predator.star >= 3 || predator.rank === 6 ? 2 : 1;
      for (let offset = -reach; offset <= reach; offset++) {
        if (offset === 0) continue;
        const targetIdx = predator.index + offset;
        if (targetIdx < 0 || targetIdx >= TD_CONSTANTS.PEDESTAL_COUNT) continue;
        const prey = this.pedestals[targetIdx];
        if (!prey || prey.devoured) continue;

        const canEat =
          prey.isFodder || (prey.rank < predator.rank && prey.rank <= 2);
        if (!canEat) continue;

        const preyMeta = TOWER_MAP[prey.symbolId] || TOWERS[0];
        const stacksGain = Math.max(1, preyMeta.devourStacksYield || 2);
        const bonusPts = Math.max(10, preyMeta.devourBonusPoints || 15);

        prey.devoured = true;
        prey.devouredBy = predator.index;
        predator.devourCount += 1;
        predator.bonusPoints += bonusPts;
        this.permanentPedestalStacks[predator.index] =
          (this.permanentPedestalStacks[predator.index] || 0) + stacksGain;
        predator.permanentDevourStacks = this.permanentPedestalStacks[predator.index];
        predator.devourStacks = predator.permanentDevourStacks;
        turnDevourStacks += stacksGain;

        devourEvents.push({
          fromIndex: prey.index,
          toIndex: predator.index,
          preyId: prey.symbolId,
          predatorId: predator.symbolId,
          stacksGain,
          bonusPoints: bonusPts,
        });

        this.sound?.playDevourCrunch?.(devourEvents.length, predator.tier);
        this.sound?.playComboChime?.(devourEvents.length - 1);
      }
    }
    this.lastDevourEvents = devourEvents;

    // 5. Activate Clutch Ultimates & Heavy Auditory Anchors
    const triggeredSynergies = [hand.id];
    if (hand.starUpgrade >= 2) {
      triggeredSynergies.push(`STAR_MERGE_${hand.starUpgrade}X`);
    }
    if (turnDevourStacks > 0) {
      triggeredSynergies.push(`PEDESTAL_AUTO_DEVOUR_${turnDevourStacks}`);
    }

    if (hand.freezeMs > 0) {
      this.freezeRemainingMs = Math.max(this.freezeRemainingMs, hand.freezeMs);
      triggeredSynergies.push('CLUTCH_FREEZE_4S');
      this.sound?.playComboChime?.(6);
    }
    if (hand.laserMs > 0) {
      this.laserRemainingMs = Math.max(this.laserRemainingMs, hand.laserMs);
      triggeredSynergies.push('HYPER_LASER_SWEEP_5S');
      this.sound?.playLaserSweep?.(hand.laserMs);
    }
    if (hand.nuke) {
      triggeredSynergies.push('YAHTZEE_TACTICAL_NUKE');
      this.sound?.playChainExplosion?.(4);
      this.sound?.playComboChime?.(12);
    }

    this._syncActiveEffects();

    // 6. Compute Balatro-style Exponential Spin Damage
    let totalBasePoints = 0;
    for (const p of this.pedestals) {
      const stackPts = (p.permanentDevourStacks || 0) * 12;
      totalBasePoints += p.effectiveBasePoints + p.bonusPoints + stackPts;
    }

    let chainSynergyMultiplier = 1.0;
    if (hand.nuke) {
      chainSynergyMultiplier = 5.0;
    } else if (hand.laserMs > 0 && hand.freezeMs > 0) {
      chainSynergyMultiplier = 3.5;
    } else if (hand.laserMs > 0) {
      chainSynergyMultiplier = 2.5;
    } else if (hand.freezeMs > 0) {
      chainSynergyMultiplier = 2.0;
    }

    const deterministicSettlementMs = Math.min(480, 120 + devourEvents.length * 65);
    this.flowTracker.completeSettlement(deterministicSettlementMs);

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier: hand.lineMultiplier,
      devourStacks: turnDevourStacks,
      chainSynergyMultiplier,
      greedMultiplier: greedMultiplierAtPull,
      comboName: `${hand.zhName} (${hand.name})`,
      triggeredSynergies,
      settlementDurationMs: deterministicSettlementMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 7. Apply Synchronized Burst Volley Damage to Active Wave Enemies
    this._applyDamageToWave(breakdown.totalDamage, { isNuke: Boolean(hand.nuke) });

    this.flowTracker.completeTurn?.();
    this.bus?.emit?.('td:pull', {
      hand,
      breakdown,
      pedestals: this.pedestals,
      devourEvents,
    });

    return this.getState();
  }

  _applyDamageToWave(damageAmount, options = {}) {
    const dmg = Math.max(0, sanitizeNumber(damageAmount, 0));
    const isNuke = Boolean(options.isNuke);

    if (isNuke || dmg >= this.enemyHp) {
      // Wave cleared! Settle compound interest & advance to next wave
      const unusedPulls = Math.max(1, this.economy.pullsRemaining || 1);
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedPulls, clearedWave);
      const nextWave = Math.min(8, this.economy.wave || clearedWave + 1);
      this.economy.wave = nextWave;
      this._initWaveEnemies(nextWave, { initialSpawn: false });
      return;
    }

    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    if (Array.isArray(this.enemies) && this.enemies.length > 0) {
      const share = dmg / this.enemies.length;
      for (const enemy of this.enemies) {
        enemy.hp = Math.max(1, enemy.hp - share);
      }
    }
  }

  /**
   * Secondary Action: Manual Greed Overcharge / Turret Focus Boost
   */
  performSecondaryAction(payload = {}) {
    if (payload && payload.action === 'wait_interest') {
      return this.step(TD_CONSTANTS.INTEREST_INTERVAL_MS);
    }
    accrueRealtimeInterest(this.economy, TD_CONSTANTS.INTEREST_RATE);
    return this.getState();
  }

  /**
   * Advances real-time monster wave march, `+20%` compound Gold interest ticker,
   * 4s Freeze window, and 5s Berserk Hyper Laser Sweep.
   * @param {number} [dtMs=16.67]
   */
  step(dtMs = 16.67) {
    const rawDt = Number(dtMs);
    if (!Number.isFinite(rawDt) || rawDt <= 0) {
      return this.getState();
    }
    const dt = Math.min(60000, rawDt);

    // 1. Real-Time +20% Compound Gold Interest & Greed Streak Ticker (`F-S3-03`)
    this.interestTimerMs += dt;
    while (this.interestTimerMs >= TD_CONSTANTS.INTEREST_INTERVAL_MS) {
      this.interestTimerMs -= TD_CONSTANTS.INTEREST_INTERVAL_MS;
      accrueRealtimeInterest(this.economy, TD_CONSTANTS.INTEREST_RATE);
    }

    // 2. 4-Second Screen-Wide Freeze Window (`F-S3-02` & `T1-F15-02`)
    let moveDt = dt;
    if (this.freezeRemainingMs > 0) {
      const frozenSlice = Math.min(dt, this.freezeRemainingMs);
      this.freezeRemainingMs = Math.max(0, this.freezeRemainingMs - frozenSlice);
      moveDt = Math.max(0, dt - frozenSlice);
    }

    // 3. 5-Second Continuous Hyper Laser Sweep (`F-S3-02` & `T2-F15-05`)
    if (this.laserRemainingMs > 0) {
      const laserSlice = Math.min(dt, this.laserRemainingMs);
      this.laserRemainingMs = Math.max(0, this.laserRemainingMs - laserSlice);
      const laserDps = Math.max(50, this.enemyMaxHp * 0.08);
      const laserDmg = laserDps * (laserSlice / 1000);
      this.enemyHp = Math.max(1, this.enemyHp - laserDmg);
    }

    // 4. Advance Real-Time Enemy March along the Lane (`moveDt > 0`)
    if (moveDt > 0 && Array.isArray(this.enemies)) {
      const hasCryoTurret = this.pedestals.some((p) => p.symbolId === 'cryo_prism' && !p.devoured);
      const slowMultiplier = hasCryoTurret ? 0.78 : 1.0;

      const surviving = [];
      for (const enemy of this.enemies) {
        const isEnraged =
          enemy.archetypeId === 'tunnel_berserker' && enemy.hp < enemy.maxHp * 0.5;
        const speed = (isEnraged ? enemy.enragedSpeed || enemy.speed : enemy.speed) * slowMultiplier;
        const nextProgress = enemy.progress + speed * (moveDt / 1000);

        if (nextProgress >= TD_CONSTANTS.BREACH_THRESHOLD) {
          // Enemy breached the bottom defense line -> deduct Base HP (`T2-F14-03`)
          const breachDmg = Math.max(1, sanitizeNumber(enemy.breachDamage, 10));
          this.playerHp = safeClamp(this.playerHp - breachDmg, 0, this.playerMaxHp);
        } else {
          enemy.progress = safeClamp(nextProgress, 0, 1);
          surviving.push(enemy);
        }
      }

      this.enemies = surviving;
      if (this.enemies.length === 0) {
        this._initWaveEnemies(this.economy.wave || 1, { initialSpawn: false });
      }
    }

    this._recomputeClosestEnemyProgress();
    this._syncActiveEffects();
    return this.getState();
  }

  getState() {
    this._recomputeClosestEnemyProgress();
    this._syncActiveEffects();

    const breakdown = this.lastTurnBreakdown || calculateSpinDamage({ basePoints: 0 });
    return {
      schemeId: this.id,
      id: this.id,
      seed: this.seed,
      wave: this.economy.wave,
      gold: this.economy.gold,
      pullCost: this.economy.pullCost,
      interestRate: this.economy.interestRate,
      greedStreak: this.economy.greedStreak,
      greedMultiplier: this.economy.greedMultiplier,
      pullsRemaining: this.economy.pullsRemaining,
      pullsUsed: this.economy.pullsUsed,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      baseHp: this.playerHp,
      enemyName: this.currentBoss?.zhName || '锈铁钻探工头',
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: Math.round(this.enemyMaxHp),
      activeEnemiesCount: this.enemies.length,
      enemies: this.enemies.map((e) => ({ ...e })),
      closestEnemyProgress: this.closestEnemyProgress,
      isRedZoneCritical: this.isRedZoneCritical,
      freezeRemainingMs: Math.round(this.freezeRemainingMs),
      laserRemainingMs: Math.round(this.laserRemainingMs),
      activeEffects: this.activeEffects.map((eff) => ({ ...eff })),
      pedestals: this.pedestals.map((p) => ({ ...p })),
      lastHand: { ...this.lastHand },
      lastDevourEvents: this.lastDevourEvents.map((d) => ({ ...d })),
      lastTurnBreakdown: { ...breakdown },
      lastFormula: { ...breakdown },
    };
  }
}

export function createJackpotTDEngine(options = {}) {
  return new JackpotTDEngine(options);
}

export default JackpotTDEngine;
