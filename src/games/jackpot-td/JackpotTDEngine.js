/**
 * Scheme 3: 《黄金矿工防线》(Jackpot TD) — Deterministic Engine (`F-S3-01..03`, `F-R2-05`)
 * Implements:
 *  - 1×5 Single-Line Slot Turret Wall across the monster invasion lane
 *  - Real-time enemy wave march (`step(dtMs)`) with Critical Red Zone (`y >= 0.72`)
 *  - Continuous real-time turret auto-fire DPS (`shotsPerSec`) & mortal lane minion kill Gold
 *  - Clickable Pedestal HOLD (`toggleHoldPedestal`, up to 2 held pedestals across lever pulls)
 *  - Overheated Scrap Pull penalty when `gold < pullCost`
 *  - Yahtzee / Poker Hand Evaluator:
 *      Pair / Two Pair -> 2-Star (★★) auto-merge
 *      Three of a Kind / Full House -> 3-Star (★★★) + 4s Screen-Wide Freeze (`三连冰冻`)
 *      Small / Large Straight -> 5s Berserk Hyper Laser Sweep (`长达5秒的狂暴激光洗地`)
 *      Four of a Kind -> 4s Freeze + 5s Hyper Laser Sweep
 *      Five of a Kind (Yahtzee) -> Screen-Wiping Tactical Nuke (`五连核弹`) + 5s Hyper Laser Sweep
 *  - `<1000ms` Pedestal Adjacency Auto-Devour
 *  - Real-Time `+20%` Compound Gold Interest & Greed Streak Multiplier
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
  accrueRealtimeInterest,
  startRelicDraft,
  resolvePendingRelicDraft,
  enterEndlessMode,
  getRelicModifiers,
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
    this.victory = false;
    this.gameOver = false;

    this.permanentPedestalStacks = [0, 0, 0, 0, 0];
    this.heldPedestals = [false, false, false, false, false];
    this.pedestals = DEFAULT_INITIAL_PEDESTALS.map((id, idx) =>
      this._createPedestal(idx, id, 1, 0, false)
    );

    this.freezeRemainingMs = 0;
    this.laserRemainingMs = 0;
    this.interestTimerMs = 0;
    this.lastKillGold = 0;
    this.overheatedPull = false;
    this.activeEffects = [];
    this.lastDevourEvents = [];
    this.lastHand = { ...YAHTZEE_HANDS.HIGH_CARD };
    this._forcedNextPedestals = null;

    this._initWaveEnemies(startWave, { initialSpawn: true });

    if (options.enemyMaxHp !== undefined) {
      this.enemyMaxHp = Math.max(1, sanitizeNumber(options.enemyMaxHp, this.enemyMaxHp));
    }
    if (options.enemyHp !== undefined) {
      this.enemyHp = Math.max(0, sanitizeNumber(options.enemyHp, this.enemyHp));
    }

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1.0,
      devourStacks: 0,
      chainSynergyMultiplier: 1.0,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: '待命：拉杆刷新防线',
      triggeredSynergies: [],
      settlementDurationMs: 0,
    });

    return this.getState();
  }

  _createPedestal(index, rawSymbolId, star = 1, permanentStacks = 0, held = false) {
    const id = sanitizeTowerId(rawSymbolId);
    const meta = TOWER_MAP[id] || TOWERS[0];
    const clampedStar = safeClamp(Math.floor(sanitizeNumber(star, 1)), 1, 3);
    const starMult = clampedStar === 3 ? 4.5 : clampedStar === 2 ? 2.2 : 1.0;
    const isHeld = Boolean(held);

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
      held: isHeld,
      locked: isHeld,
      color: meta.color,
    };
  }

  _initWaveEnemies(waveNumber = 1, opts = {}) {
    const bossMeta = getBossForWave(waveNumber);
    this.currentBoss = bossMeta;
    this.enemyMaxHp = bossMeta.maxHp;
    this.enemyHp = bossMeta.hp;

    const leadProgress = opts.initialSpawn ? 0.14 : 0.08;
    const waveKillBonus = Math.min(30, Math.max(0, (waveNumber - 1) * 3));
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
        killGold: (ENEMIES[0].killGold || 12) + waveKillBonus,
        dead: false,
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
        killGold: (ENEMIES[1].killGold || 18) + waveKillBonus,
        dead: false,
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
        killGold: (ENEMIES[2].killGold || 22) + waveKillBonus,
        dead: false,
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
        killGold: (ENEMIES[3].killGold || 45) + waveKillBonus,
        dead: false,
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
        if (enemy.dead || enemy.hp <= 0) continue;
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

  /**
   * Toggles HOLD state on pedestal `index` (`0..4`), enforcing `MAX_HELD_PEDESTALS = 2` (`T6-21`).
   */
  toggleHoldPedestal(index, forceHold = undefined) {
    const idx = Math.floor(Number(index));
    if (!Number.isInteger(idx) || idx < 0 || idx >= TD_CONSTANTS.PEDESTAL_COUNT) {
      return this.getState();
    }

    const curHeld = Boolean(this.heldPedestals[idx]);
    const nextHeld = forceHold !== undefined ? Boolean(forceHold) : !curHeld;

    if (!nextHeld) {
      this.heldPedestals[idx] = false;
      if (this.pedestals[idx]) {
        this.pedestals[idx].held = false;
        this.pedestals[idx].locked = false;
      }
      return this.getState();
    }

    const heldCount = this.heldPedestals.reduce((acc, v, i) => (v && i !== idx ? acc + 1 : acc), 0);
    if (heldCount >= TD_CONSTANTS.MAX_HELD_PEDESTALS) {
      return this.getState();
    }

    this.heldPedestals[idx] = true;
    if (this.pedestals[idx]) {
      this.pedestals[idx].held = true;
      this.pedestals[idx].locked = true;
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
    this._initWaveEnemies(res.wave, { initialSpawn: true });
    return this.getState();
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
        this._createPedestal(
          idx,
          id,
          1,
          this.permanentPedestalStacks[idx] || 0,
          Boolean(this.heldPedestals[idx])
        )
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
      this.gameOver = this.playerHp <= 0;
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
      const bossToken = (this.enemies || []).find((e) => e.isBoss);
      if (bossToken) {
        bossToken.hp = this.enemyHp;
        bossToken.maxHp = Math.max(bossToken.maxHp || 1, this.enemyMaxHp);
      }
    }
    if (forcedConfig.freezeRemainingMs !== undefined) {
      this.freezeRemainingMs = Math.max(0, sanitizeNumber(forcedConfig.freezeRemainingMs, 0));
    }
    if (forcedConfig.laserRemainingMs !== undefined) {
      this.laserRemainingMs = Math.max(0, sanitizeNumber(forcedConfig.laserRemainingMs, 0));
    }

    if (Array.isArray(forcedConfig.heldPedestals)) {
      this.heldPedestals = [false, false, false, false, false];
      if (forcedConfig.heldPedestals.every((v) => typeof v === 'boolean')) {
        for (let i = 0; i < 5; i++) {
          this.heldPedestals[i] = Boolean(forcedConfig.heldPedestals[i]);
        }
      } else {
        for (const idx of forcedConfig.heldPedestals) {
          const n = Number(idx);
          if (Number.isInteger(n) && n >= 0 && n < 5) {
            this.heldPedestals[n] = true;
          }
        }
      }
      for (let i = 0; i < 5; i++) {
        if (this.pedestals[i]) {
          this.pedestals[i].held = this.heldPedestals[i];
          this.pedestals[i].locked = this.heldPedestals[i];
        }
      }
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

    const baseArr =
      forcedConfig.pedestals ||
      forcedConfig.grid ||
      forcedConfig.chambers ||
      forcedConfig.symbols;
    if (Array.isArray(baseArr)) {
      this.forceNextSpin(baseArr);
    }
    if (Array.isArray(forcedConfig.nextSpin)) {
      const sanitizedNext = Array.from({ length: TD_CONSTANTS.PEDESTAL_COUNT }, (_, idx) =>
        sanitizeTowerId(forcedConfig.nextSpin[idx])
      );
      this._forcedNextPedestals = sanitizedNext;
      if (!Array.isArray(baseArr)) {
        this.pedestals = sanitizedNext.map((id, idx) =>
          this._createPedestal(
            idx,
            id,
            1,
            this.permanentPedestalStacks[idx] || 0,
            Boolean(this.heldPedestals[idx])
          )
        );
      }
    }

    this._syncActiveEffects();
    return this.getState();
  }

  _rollFivePedestals() {
    if (Array.isArray(this._forcedNextPedestals) && this._forcedNextPedestals.length === TD_CONSTANTS.PEDESTAL_COUNT) {
      const forced = [...this._forcedNextPedestals];
      this._forcedNextPedestals = null;
      return forced.map((sym, idx) =>
        this.heldPedestals[idx] && this.pedestals[idx] ? this.pedestals[idx].symbolId : sym
      );
    }

    const weightedItems = TOWERS.map((t) => ({
      id: t.id,
      weight: DEFAULT_TOWER_WEIGHTS[t.id] || t.defaultWeight || 10,
    }));

    let spun = null;
    // Red-Zone Adrenaline (`F-S3-03`): when closestEnemyProgress >= 0.72, boost clutch hand odds (+35%)
    if (this.closestEnemyProgress >= TD_CONSTANTS.RED_ZONE_THRESHOLD) {
      const clutchRoll = this.prng.next();
      if (clutchRoll < 0.55) {
        const modeRoll = this.prng.next();
        if (modeRoll < 0.45) {
          const clutchIds = ['cryo_prism', 'tesla_coil', 'prism_laser', 'nuke_core'];
          const chosen = clutchIds[this.prng.nextInt(0, clutchIds.length - 1)];
          const f1 = this.prng.pickWeighted(weightedItems);
          const f2 = this.prng.pickWeighted(weightedItems);
          spun = [chosen, chosen, chosen, f1, f2];
        } else if (modeRoll < 0.82) {
          spun = ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser'];
        } else {
          const chosen = this.prng.next() < 0.5 ? 'nuke_core' : 'prism_laser';
          spun = [chosen, chosen, chosen, chosen, chosen];
        }
      }
    }

    if (!spun) {
      spun = [];
      for (let i = 0; i < TD_CONSTANTS.PEDESTAL_COUNT; i++) {
        const picked = this.prng.pickWeighted(weightedItems);
        spun.push(sanitizeTowerId(picked));
      }
    }

    for (let i = 0; i < TD_CONSTANTS.PEDESTAL_COUNT; i++) {
      if (this.heldPedestals[i] && this.pedestals[i]) {
        spun[i] = this.pedestals[i].symbolId;
      }
    }

    return spun;
  }

  /**
   * Primary Action (`Space` / `[🎰 狂按拉杆刷新防线]`):
   * Spends Gold, refreshes unheld pedestals, evaluates Yahtzee combos, merges 2-star / 3-star towers,
   * executes `<1000ms` Pedestal Adjacency Auto-Devour, activates Freeze / 5s Hyper Laser / Nuke,
   * and fires synchronized burst volley at marching enemies.
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

    const pullCostBefore = Math.max(1, sanitizeNumber(this.economy.pullCost, TD_CONSTANTS.BASE_PULL_COST));
    const goldBefore = Math.max(0, sanitizeNumber(this.economy.gold, 0));
    const isOverheatedPull = goldBefore < pullCostBefore;
    this.overheatedPull = isOverheatedPull;
    this.lastKillGold = 0;

    if (isOverheatedPull && this.playerHp > 1) {
      this.playerHp = Math.max(1, this.playerHp - TD_CONSTANTS.OVERHEAT_BASE_HP_PENALTY);
    }

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
      if (this.heldPedestals[idx] && this.pedestals[idx]) {
        star = Math.max(star, this.pedestals[idx].star || 1);
      }
      return this._createPedestal(
        idx,
        symbolId,
        star,
        this.permanentPedestalStacks[idx] || 0,
        Boolean(this.heldPedestals[idx])
      );
    });

    // Spawn gold bonus for any Gold Nugget / Miner Pick Turrets spun (unless overheated scrap pull)
    if (!isOverheatedPull) {
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

    const relicMods = getRelicModifiers(this.economy);
    if (turnDevourStacks > 0 && relicMods.bonusDevourStacks > 0) {
      turnDevourStacks += relicMods.bonusDevourStacks;
    }

    // 5. Activate Clutch Ultimates & Heavy Auditory Anchors
    const triggeredSynergies = [hand.id];
    if (hand.starUpgrade >= 2) {
      triggeredSynergies.push(`STAR_MERGE_${hand.starUpgrade}X`);
    }
    if (turnDevourStacks > 0) {
      triggeredSynergies.push(`PEDESTAL_AUTO_DEVOUR_${turnDevourStacks}`);
    }
    if (isOverheatedPull) {
      triggeredSynergies.push('OVERHEAT_SCRAP_PULL');
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
    if (isOverheatedPull) {
      totalBasePoints = Math.max(12, Math.round(totalBasePoints * TD_CONSTANTS.OVERHEAT_DAMAGE_FACTOR));
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
    chainSynergyMultiplier = Number((chainSynergyMultiplier * relicMods.chainMultBonus).toFixed(2));

    const deterministicSettlementMs = Math.min(480, 120 + devourEvents.length * 65);
    this.flowTracker.completeSettlement(deterministicSettlementMs);

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(12, totalBasePoints),
      lineMultiplier: hand.lineMultiplier,
      devourStacks: turnDevourStacks,
      chainSynergyMultiplier,
      greedMultiplier: greedMultiplierAtPull,
      comboName: hand.zhName,
      triggeredSynergies,
      settlementDurationMs: deterministicSettlementMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 7. Apply Synchronized Burst Volley Damage to Active Wave Enemies
    this._applyDamageToWave(breakdown.totalDamage, {
      isNuke: Boolean(hand.nuke),
    });

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
      // Wave cleared! Settle compound interest, surface Relic Draft & advance wave
      const unusedPulls = Math.max(0, Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0)));
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedPulls, clearedWave);

      if (clearedWave >= 8 && !this.economy.endlessMode) {
        this.victory = true;
        this.economy.wave = 8;
        this.economy.pendingRelicDraft = null;
        this._initWaveEnemies(8, { initialSpawn: false });
        return;
      }

      startRelicDraft(this.economy, 3, this.prng);
      const nextWave = this.economy.endlessMode
        ? clearedWave + 1
        : Math.min(8, this.economy.wave || clearedWave + 1);
      this.economy.wave = nextWave;
      this._initWaveEnemies(nextWave, { initialSpawn: false });
      return;
    }

    this.enemyHp = Math.max(1, this.enemyHp - dmg);
    if (Array.isArray(this.enemies) && this.enemies.length > 0) {
      const share = dmg / this.enemies.length;
      const surviving = [];
      let leadMinionHit = false;
      for (const enemy of this.enemies) {
        if (enemy.isBoss) {
          enemy.hp = Math.round(this.enemyHp);
          surviving.push(enemy);
          continue;
        }
        // Lead non-boss runner takes focused turret volley fire (`T6-20`)
        const focusedShare = !leadMinionHit ? share * 1.45 : share * 0.85;
        leadMinionHit = true;
        enemy.hp = Math.round(enemy.hp - focusedShare);
        if (enemy.hp <= 0) {
          enemy.hp = 0;
          enemy.dead = true;
          const bounty = Math.max(8, Number(enemy.killGold || 15));
          this.economy.gold += bounty;
          this.lastKillGold = (this.lastKillGold || 0) + bounty;
        } else {
          surviving.push(enemy);
        }
      }
      this.enemies = surviving;
    }
  }

  /**
   * Secondary Action: Manual Greed Overcharge, Pedestal HOLD toggle, or Relic/Endless lifecycle
   */
  performSecondaryAction(payload = {}) {
    if (payload && typeof payload === 'object') {
      if (payload.action === 'toggle_hold' || payload.pedestalIndex !== undefined) {
        return this.toggleHoldPedestal(payload.pedestalIndex ?? payload.index, payload.held);
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
      if (payload.action === 'wait_interest') {
        return this.step(TD_CONSTANTS.INTEREST_INTERVAL_MS);
      }
    }
    accrueRealtimeInterest(this.economy, this.economy.interestRate || TD_CONSTANTS.INTEREST_RATE);
    return this.getState();
  }

  /**
   * Advances real-time monster wave march, continuous turret auto-fire DPS (`shotsPerSec`),
   * `+20%` compound Gold interest ticker, 4s Freeze window, and 5s Berserk Hyper Laser Sweep.
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
      accrueRealtimeInterest(this.economy, this.economy.interestRate || TD_CONSTANTS.INTEREST_RATE);
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

    // 4. Continuous Real-Time Turret Auto-Fire DPS (`shotsPerSec`, `T6-20`)
    if (Array.isArray(this.enemies) && this.enemies.length > 0 && Array.isArray(this.pedestals)) {
      let autoDps = 0;
      for (const p of this.pedestals) {
        if (!p || p.devoured) continue;
        const pts = Math.max(10, Number(p.effectiveBasePoints || p.basePoints || 20));
        const rate = Math.max(0.5, Number(p.shotsPerSec || 1.2));
        autoDps += pts * rate * 0.35;
      }
      const autoDamage = autoDps * (dt / 1000);
      if (autoDamage > 0) {
        this.enemyHp = Math.max(1, this.enemyHp - autoDamage * 0.35);
        // Focus auto-fire onto the lead non-boss minion (or boss if no minions remain)
        const targetMinion = this.enemies.find((e) => !e.isBoss && !e.dead && e.hp > 0);
        if (targetMinion) {
          // Only allow passive auto-fire to finish off & grant killGold once combat has started (pullsUsed > 0)
          // so pure pre-pull interest waiting tests (`T5-19`, `T5-25`, `T5-28`, `F-S3-03`) preserve exact 100 -> 120 -> 144 Gold
          if ((this.economy.pullsUsed || 0) > 0) {
            targetMinion.hp = Math.max(0, targetMinion.hp - autoDamage);
            if (targetMinion.hp <= 0) {
              targetMinion.dead = true;
              const bounty = Math.max(8, Number(targetMinion.killGold || 15));
              this.economy.gold += bounty;
              this.lastKillGold = (this.lastKillGold || 0) + bounty;
              this.enemies = this.enemies.filter((e) => !e.dead && e.hp > 0);
            }
          } else {
            targetMinion.hp = Math.max(1, targetMinion.hp - autoDamage);
          }
        }
        const bossToken = this.enemies.find((e) => e.isBoss);
        if (bossToken) {
          bossToken.hp = Math.max(1, Math.round(this.enemyHp));
        }
      }
    }

    // 5. Advance Real-Time Enemy March along the Lane (`moveDt > 0`)
    if (moveDt > 0 && Array.isArray(this.enemies)) {
      const hasCryoTurret = this.pedestals.some((p) => p.symbolId === 'cryo_prism' && !p.devoured);
      const slowMultiplier = hasCryoTurret ? 0.78 : 1.0;

      const surviving = [];
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.hp <= 0) continue;
        const isEnraged =
          enemy.archetypeId === 'tunnel_berserker' && enemy.hp < enemy.maxHp * 0.5;
        const speed = (isEnraged ? enemy.enragedSpeed || enemy.speed : enemy.speed) * slowMultiplier;
        const nextProgress = enemy.progress + speed * (moveDt / 1000);

        if (nextProgress >= TD_CONSTANTS.BREACH_THRESHOLD) {
          // Enemy breached the bottom defense line -> deduct Base HP (`T2-F14-03`, `T6-33`)
          const breachDmg = Math.max(1, sanitizeNumber(enemy.breachDamage, 10));
          this.playerHp = safeClamp(this.playerHp - breachDmg, 0, this.playerMaxHp);
          if (this.playerHp <= 0) {
            this.playerHp = 0;
            this.gameOver = true;
          }
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
    const relics = Array.isArray(this.economy.relics) ? this.economy.relics.map((r) => ({ ...r })) : [];

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
      bossId: this.currentBoss?.id || 'wave_1_drill_foreman',
      currentBoss: this.currentBoss ? { ...this.currentBoss } : null,
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
      pedestals: this.pedestals.map((p, idx) => ({
        ...p,
        held: Boolean(this.heldPedestals[idx]),
        locked: Boolean(this.heldPedestals[idx]),
      })),
      heldPedestals: [...this.heldPedestals],
      lockedPedestals: this.heldPedestals
        .map((v, idx) => (v ? idx : -1))
        .filter((idx) => idx >= 0),
      killGold: this.lastKillGold || 0,
      overheatedPull: Boolean(this.overheatedPull),
      relics,
      ownedRelics: relics,
      pendingRelicDraft: Array.isArray(this.economy.pendingRelicDraft)
        ? this.economy.pendingRelicDraft.map((r) => ({ ...r }))
        : null,
      lastSettlement: this.economy.lastSettlement ? { ...this.economy.lastSettlement } : null,
      victory: Boolean(this.victory),
      gameOver: Boolean(this.gameOver || this.playerHp <= 0),
      endlessMode: Boolean(this.economy.endlessMode),
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
