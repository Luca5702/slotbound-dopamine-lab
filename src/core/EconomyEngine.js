/**
 * Risk & Greed Economy Engine (`F-CORE-03` & `F-R2-02`)
 * Implements:
 *  - Wave Pull Countdown (`5` pulls/wave)
 *  - Unused Pulls (U) compound interest:
 *      interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
 *  - Permanent Greed Multiplier scaling:
 *      greedMultiplier *= Math.pow(1.35, U)
 *  - Real-time Gold Interest ticker (`+20%`) & Greed Streak for Scheme 3 (Jackpot TD)
 *  - Non-blocking Post-Wave 3-Card Relic Draft (`startRelicDraft`, `resolvePendingRelicDraft`)
 *  - Wave 9+ Endless Mode scaling (`computeEndlessBossHp`, `enterEndlessMode`) & Gold shop spending
 */

import {
  MAX_SAFE_GAME_NUMBER,
  sanitizeNumber,
  safeClamp,
  safeMultiply,
  safePower,
} from './BigNumber.js';
import { createPRNG } from './PRNG.js';

export const DEFAULT_RELIC_CATALOG = [
  {
    id: 'greed_ledger',
    name: '贪婪账本 (Greed Ledger)',
    rarity: 'common',
    description: '永久贪婪倍率 ×1.25，每波通关底薪额外 +25G。',
    effect: { greedMultFactor: 1.25, baseWaveGoldBonus: 25 },
  },
  {
    id: 'gluttony_jaw',
    name: '暴食颚骨 (Gluttony Jaw)',
    rarity: 'common',
    description: '每次触发零操作自动吞噬额外 +1 吞噬层数，永久贪婪倍率 ×1.20。',
    effect: { bonusDevourStacks: 1, greedMultFactor: 1.2 },
  },
  {
    id: 'acid_reflux_core',
    name: '胃酸狂暴核 (Acid Reflux Core)',
    rarity: 'rare',
    description: '消化不良满 100% 时免疫护甲损耗，酸液喷发进化为 ×15.0 胃酸海啸。',
    effect: { acidRefluxOverdrive: true, greedMultFactor: 1.35 },
  },
  {
    id: 'pyro_catalyst',
    name: '爆破催化剂 (Pyro Catalyst)',
    rarity: 'rare',
    description: '火球与黑火药桶轮盘权重各 +15%，连锁反应倍率额外 ×1.40。',
    effect: { chainMultFactor: 1.4, wheelBoost: { fireball: 15, powder_keg: 15 } },
  },
  {
    id: 'russian_roulette_coin',
    name: '恶魔轮盘金币 (Demon Roulette Coin)',
    rarity: 'rare',
    description: '空弹仓赌命与契约恶魔弹加成 ×1.50，永久贪婪倍率 ×1.50。',
    effect: { greedMultFactor: 1.5, rouletteGritBonus: 1.5 },
  },
  {
    id: 'compound_vault',
    name: '复利金库 (Compound Vault)',
    rarity: 'epic',
    description: '过关复利利率提升 +10%，立即入账 +100G，永久贪婪倍率 ×1.30。',
    effect: { interestRateBonus: 0.1, instantGold: 100, greedMultFactor: 1.3 },
  },
  {
    id: 'chronos_lever',
    name: '时空拉杆 (Chronos Lever)',
    rarity: 'epic',
    description: '每波最大拉杆数 +1（提升省杆数 U 的复利与贪婪指数上限），贪婪倍率 ×1.25。',
    effect: { maxPullsBonus: 1, greedMultFactor: 1.25 },
  },
  {
    id: 'abyssal_crown',
    name: '深渊暴君王冠 (Abyssal Crown)',
    rarity: 'mythic',
    description: '全局永久贪婪倍率直接乘以 ×1.75。',
    effect: { greedMultFactor: 1.75 },
  },
];

export const GREED_STREAK_TIERS = [1.0, 1.5, 2.2, 3.5, 5.0];

function safeNumeric(value, fallback = 0) {
  if (value !== null && typeof value === 'object') return fallback;
  return sanitizeNumber(value, fallback);
}

function safeAdd(a, b) {
  return safeClamp(safeNumeric(a, 0) + safeNumeric(b, 0), 0, MAX_SAFE_GAME_NUMBER);
}

function roundSafeMultiplier(value, min = 0.1) {
  const clamped = safeClamp(safeNumeric(value, min), min, MAX_SAFE_GAME_NUMBER);
  return clamped < 1e15 ? Number(clamped.toFixed(4)) : clamped;
}

function extractRelicId(r) {
  if (typeof r === 'string') return r.trim();
  if (r && typeof r === 'object' && typeof r.id === 'string') return r.id.trim();
  return '';
}

function sanitizeRelicEntry(r) {
  if (typeof r === 'string') {
    const id = r.trim();
    return id || null;
  }
  if (r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string') {
    const id = r.id.trim();
    if (!id) return null;
    return { ...r, id };
  }
  return null;
}

/**
 * Creates a fresh Risk & Greed economy state object.
 * @param {object} [options={}]
 */
export function createEconomyState(options = {}) {
  const safeOpts = options && typeof options === 'object' ? options : {};
  const maxPulls = Math.max(
    1,
    Math.floor(
      safeClamp(
        safeNumeric(safeOpts.maxPullsPerWave ?? safeOpts.maxSpinsPerWave ?? 5, 5),
        1,
        MAX_SAFE_GAME_NUMBER
      )
    )
  );
  const initialGold = Math.floor(
    safeClamp(safeNumeric(safeOpts.gold ?? safeOpts.initialGold ?? 100, 100), 0, MAX_SAFE_GAME_NUMBER)
  );
  const wave = Math.max(
    1,
    Math.floor(safeClamp(safeNumeric(safeOpts.wave ?? 1, 1), 1, MAX_SAFE_GAME_NUMBER))
  );
  const basePullCost = Math.max(
    1,
    Math.floor(
      safeClamp(safeNumeric(safeOpts.basePullCost ?? safeOpts.pullCost ?? 10, 10), 1, MAX_SAFE_GAME_NUMBER)
    )
  );

  return {
    wave,
    gold: initialGold,
    baseWaveGold: Math.max(
      10,
      Math.floor(safeClamp(safeNumeric(safeOpts.baseWaveGold ?? 40, 40), 10, MAX_SAFE_GAME_NUMBER))
    ),
    maxPullsPerWave: maxPulls,
    pullsRemaining: Math.floor(
      safeClamp(safeNumeric(safeOpts.pullsRemaining ?? maxPulls, maxPulls), 0, MAX_SAFE_GAME_NUMBER)
    ),
    pullsUsed: Math.floor(safeClamp(safeNumeric(safeOpts.pullsUsed ?? 0, 0), 0, MAX_SAFE_GAME_NUMBER)),
    interestRate: safeClamp(safeNumeric(safeOpts.interestRate ?? 0.25, 0.25), 0, MAX_SAFE_GAME_NUMBER),
    interestCap: safeClamp(safeNumeric(safeOpts.interestCap ?? 10000, 10000), 50, MAX_SAFE_GAME_NUMBER),
    greedMultiplier: safeClamp(safeNumeric(safeOpts.greedMultiplier ?? 1.0, 1.0), 0.1, MAX_SAFE_GAME_NUMBER),
    greedStreak: Math.floor(safeClamp(safeNumeric(safeOpts.greedStreak ?? 0, 0), 0, MAX_SAFE_GAME_NUMBER)),
    greedStreakMultiplier: 1.0,
    basePullCost,
    pullCost: basePullCost,
    bonusDevourStacks: 0,
    chainMultBonus: 1.0,
    acidRefluxOverdrive: false,
    rouletteGritBonus: 1.0,
    wheelBoostMap: {},
    pendingRelicDraft: Array.isArray(safeOpts.pendingRelicDraft)
      ? safeOpts.pendingRelicDraft.map(sanitizeRelicEntry).filter(Boolean)
      : null,
    endlessMode: Boolean(safeOpts.endlessMode ?? false),
    relics: Array.isArray(safeOpts.relics) ? safeOpts.relics.map(sanitizeRelicEntry).filter(Boolean) : [],
    lastSettlement: null,
  };
}

/**
 * Consumes 1 pull (or spends Gold for a real-time lever pull in Scheme 3).
 * Mutates economyState in place and returns it.
 * @param {object} economyState
 * @param {object} [options={}]
 */
export function consumePull(economyState, options = {}) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }
  const safeOpts = options && typeof options === 'object' ? options : {};
  const { spendGold = false, costEscalation = 2, allowOverdraft = false } = safeOpts;

  let goldSpent = 0;
  if (spendGold) {
    const cost = Math.floor(safeClamp(safeNumeric(economyState.pullCost ?? 10, 10), 0, MAX_SAFE_GAME_NUMBER));
    const curGold = safeClamp(safeNumeric(economyState.gold, 0), 0, MAX_SAFE_GAME_NUMBER);
    if (curGold < cost && !allowOverdraft) {
      return {
        ...economyState,
        canPull: false,
        goldSpent: 0,
      };
    }
    goldSpent = Math.min(curGold, cost);
    economyState.gold = Math.max(0, curGold - cost);
    economyState.pullCost = safeAdd(cost, Math.max(0, safeNumeric(costEscalation, 2)));
  }

  const rem = Math.floor(safeClamp(safeNumeric(economyState.pullsRemaining ?? 0, 0), 0, MAX_SAFE_GAME_NUMBER));
  const hadPulls = rem > 0;
  economyState.pullsRemaining = Math.max(0, Math.floor(safeNumeric(economyState.pullsRemaining ?? 1, 1)) - 1);
  economyState.pullsUsed = Math.floor(safeAdd(economyState.pullsUsed ?? 0, 1));
  economyState.greedStreak = 0;
  economyState.greedStreakMultiplier = 1.0;

  return Object.assign(economyState, {
    canPull: spendGold ? true : hadPulls,
    goldSpent,
  });
}

/**
 * Settles a cleared wave using the exact compound interest & Greed Multiplier formulas in PROJECT.md:
 *   interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
 *   greedMultiplier *= Math.pow(1.35, U)
 * Mutates economyState in-place AND returns it with `.settlement` details attached.
 *
 * @param {object} economyState
 * @param {number|null} [unusedPulls=null]
 * @param {number|null} [waveIndex=null]
 */
export function settleWaveClear(economyState, unusedPulls = null, waveIndex = null) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }

  const rawUnused =
    unusedPulls !== null && unusedPulls !== undefined
      ? unusedPulls
      : economyState.pullsRemaining ?? 0;
  const U = Math.floor(safeClamp(safeNumeric(rawUnused, 0), 0, MAX_SAFE_GAME_NUMBER));

  const currentGold = safeClamp(safeNumeric(economyState.gold, 0), 0, MAX_SAFE_GAME_NUMBER);
  const currentWave = Math.floor(
    safeClamp(safeNumeric(waveIndex ?? economyState.wave ?? 1, 1), 1, MAX_SAFE_GAME_NUMBER)
  );
  const defaultWaveGold = safeAdd(30, safeMultiply(currentWave, 10));
  const baseWaveGold = Math.max(
    10,
    Math.floor(
      safeClamp(safeNumeric(economyState.baseWaveGold ?? defaultWaveGold, 40), 10, MAX_SAFE_GAME_NUMBER)
    )
  );

  // Canonical PROJECT.md compound interest formula:
  // interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
  const compoundRateFactor = Math.max(0, safePower(1.25, U) - 1);
  const effectivePrincipal = safeAdd(
    currentGold,
    safeMultiply(baseWaveGold, safeAdd(1, safeMultiply(0.25, U)))
  );
  const interestGold =
    U > 0
      ? Math.floor(
          safeAdd(
            Math.floor(
              safeClamp(safeMultiply(effectivePrincipal, compoundRateFactor), 0, MAX_SAFE_GAME_NUMBER)
            ),
            safeMultiply(15, U)
          )
        )
      : 0;

  const totalGoldEarned = safeAdd(baseWaveGold, interestGold);
  const newGold = safeAdd(currentGold, totalGoldEarned);
  const previousGreedMultiplier = safeClamp(
    safeNumeric(economyState.greedMultiplier, 1.0),
    0.1,
    MAX_SAFE_GAME_NUMBER
  );
  const rawGreedGain = safePower(1.35, U);
  const greedMultiplierGain = roundSafeMultiplier(rawGreedGain, 1.0);
  const newGreedMultiplier = roundSafeMultiplier(
    safeMultiply(previousGreedMultiplier, rawGreedGain),
    0.1
  );

  const settlement = {
    waveCleared: currentWave,
    unusedPulls: U,
    baseWaveGold,
    interestGold,
    totalGoldEarned,
    previousGold: currentGold,
    newGold,
    previousGreedMultiplier,
    greedMultiplierGain,
    newGreedMultiplier,
    rareRelicGuaranteed: U >= 2,
  };

  economyState.gold = settlement.newGold;
  economyState.greedMultiplier = newGreedMultiplier;
  economyState.wave = Math.floor(safeAdd(currentWave, 1));
  economyState.pullsRemaining = Math.floor(
    safeClamp(safeNumeric(economyState.maxPullsPerWave ?? 5, 5), 1, MAX_SAFE_GAME_NUMBER)
  );
  economyState.pullsUsed = 0;
  economyState.pullCost = Math.floor(
    safeClamp(safeNumeric(economyState.basePullCost ?? 10, 10), 1, MAX_SAFE_GAME_NUMBER)
  );
  economyState.lastSettlement = settlement;
  economyState.settlement = settlement;

  return economyState;
}

/**
 * Accrues real-time +20% compound Gold interest & Greed Streak Multiplier (Scheme 3 Jackpot TD).
 * @param {object} economyState
 * @param {number} [rateOverride=0.20]
 */
export function accrueRealtimeInterest(economyState, rateOverride = 0.20) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }
  const rate = safeClamp(safeNumeric(rateOverride, 0.20), 0, MAX_SAFE_GAME_NUMBER);
  const currentGold = safeClamp(safeNumeric(economyState.gold, 0), 0, MAX_SAFE_GAME_NUMBER);
  const rawInterest = Math.floor(safeClamp(safeMultiply(currentGold, rate), 0, MAX_SAFE_GAME_NUMBER));
  const interestEarned = currentGold > 0 ? Math.max(1, rawInterest) : 0;

  economyState.gold = safeAdd(currentGold, interestEarned);
  economyState.greedStreak = Math.floor(safeAdd(Math.max(0, safeNumeric(economyState.greedStreak ?? 0, 0)), 1));
  const tierIdx = Math.min(economyState.greedStreak, GREED_STREAK_TIERS.length - 1);
  economyState.greedStreakMultiplier = GREED_STREAK_TIERS[tierIdx];
  economyState.greedMultiplier = safeClamp(
    Math.max(safeNumeric(economyState.greedMultiplier, 1.0), economyState.greedStreakMultiplier),
    0.1,
    MAX_SAFE_GAME_NUMBER
  );

  return {
    interestEarned,
    gold: economyState.gold,
    greedStreak: economyState.greedStreak,
    greedStreakMultiplier: economyState.greedStreakMultiplier,
    greedMultiplier: economyState.greedMultiplier,
  };
}

/**
 * Generates 3 distinct post-wave Relic draft choices.
 * Guarantees at least one rare/epic/mythic relic if lastSettlement had unusedPulls >= 2.
 * @param {object} [economyState={}]
 * @param {number} [count=3]
 * @param {object|null} [prng=null]
 */
export function getRelicDraftChoices(economyState = {}, count = 3, prng = null) {
  const safeWave = Math.max(1, Math.floor(safeNumeric(economyState?.wave, 1)));
  const rng = prng && typeof prng.shuffle === 'function' ? prng : createPRNG(12345 + safeWave);
  const rawRelics = Array.isArray(economyState?.relics) ? economyState.relics : [];
  const ownedIds = new Set(rawRelics.map(extractRelicId).filter(Boolean));
  const pool = DEFAULT_RELIC_CATALOG.filter((r) => !ownedIds.has(r.id));
  const available = pool.length >= count ? pool : [...DEFAULT_RELIC_CATALOG];

  const shuffled = rng.shuffle(available);
  const safeCount = Math.max(1, Math.floor(safeNumeric(count, 3)));
  const numChoices = Math.max(1, Math.min(safeCount, shuffled.length));
  const choices = shuffled.slice(0, numChoices);

  const guaranteeRare = Boolean(
    economyState?.lastSettlement?.rareRelicGuaranteed ||
      safeNumeric(economyState?.pullsRemaining ?? 0, 0) >= 2
  );
  if (guaranteeRare && !choices.some((c) => c.rarity !== 'common')) {
    const rareCandidate = shuffled.find((c) => c.rarity !== 'common');
    if (rareCandidate) {
      choices[0] = rareCandidate;
    }
  }

  return choices.map((c) => ({ ...c, effect: { ...c.effect } }));
}

/**
 * Applies a drafted Relic (by ID or Relic object) to economyState.
 * @param {object} economyState
 * @param {string|object} relicIdOrObj
 */
export function applyRelic(economyState, relicIdOrObj) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }

  let relic = null;
  if (typeof relicIdOrObj === 'string') {
    const trimmedId = relicIdOrObj.trim();
    if (!trimmedId) return economyState;
    const found = DEFAULT_RELIC_CATALOG.find((r) => r.id === trimmedId);
    relic = found
      ? { ...found, effect: { ...found.effect } }
      : {
          id: trimmedId,
          name: trimmedId,
          rarity: 'common',
          effect: { greedMultFactor: 1.2 },
        };
  } else if (relicIdOrObj && typeof relicIdOrObj === 'object' && !Array.isArray(relicIdOrObj)) {
    const trimmedId = extractRelicId(relicIdOrObj);
    if (!trimmedId) return economyState;
    const found = DEFAULT_RELIC_CATALOG.find((r) => r.id === trimmedId);
    const rawEff =
      relicIdOrObj.effect && typeof relicIdOrObj.effect === 'object' && !Array.isArray(relicIdOrObj.effect)
        ? { ...relicIdOrObj.effect }
        : found?.effect
          ? { ...found.effect }
          : {};
    relic = {
      ...relicIdOrObj,
      id: trimmedId,
      name:
        typeof relicIdOrObj.name === 'string' && relicIdOrObj.name.trim()
          ? relicIdOrObj.name.trim()
          : found?.name || trimmedId,
      rarity:
        typeof relicIdOrObj.rarity === 'string' && relicIdOrObj.rarity.trim()
          ? relicIdOrObj.rarity.trim()
          : found?.rarity || 'common',
      effect: rawEff,
    };
  }

  if (!relic) return economyState;

  economyState.relics = Array.isArray(economyState.relics)
    ? economyState.relics.map(sanitizeRelicEntry).filter(Boolean)
    : [];
  economyState.relics.push(relic);

  const eff = relic.effect && typeof relic.effect === 'object' ? relic.effect : {};
  if (eff.greedMultFactor) {
    economyState.greedMultiplier = roundSafeMultiplier(
      safeMultiply(
        safeNumeric(economyState.greedMultiplier, 1),
        safeNumeric(eff.greedMultFactor, 1)
      ),
      0.1
    );
  }
  if (eff.baseWaveGoldBonus) {
    economyState.baseWaveGold = Math.max(
      10,
      Math.floor(safeAdd(economyState.baseWaveGold ?? 40, eff.baseWaveGoldBonus))
    );
  }
  if (eff.instantGold) {
    economyState.gold = Math.floor(safeAdd(economyState.gold ?? 0, eff.instantGold));
  }
  if (eff.interestRateBonus) {
    economyState.interestRate = roundSafeMultiplier(
      safeClamp(
        safeNumeric(economyState.interestRate ?? 0.25, 0.25) + safeNumeric(eff.interestRateBonus, 0),
        0,
        MAX_SAFE_GAME_NUMBER
      ),
      0
    );
  }
  if (eff.maxPullsBonus) {
    const bonusPulls = Math.floor(safeNumeric(eff.maxPullsBonus, 0));
    economyState.maxPullsPerWave = Math.max(
      1,
      Math.floor(
        safeClamp(safeNumeric(economyState.maxPullsPerWave ?? 5, 5) + bonusPulls, 1, MAX_SAFE_GAME_NUMBER)
      )
    );
    economyState.pullsRemaining = Math.max(
      0,
      Math.floor(
        safeClamp(safeNumeric(economyState.pullsRemaining ?? 5, 5) + bonusPulls, 0, MAX_SAFE_GAME_NUMBER)
      )
    );
  }
  if (eff.bonusDevourStacks) {
    economyState.bonusDevourStacks = Math.max(
      0,
      Math.floor(safeAdd(economyState.bonusDevourStacks ?? 0, eff.bonusDevourStacks))
    );
  }
  if (eff.chainMultFactor) {
    economyState.chainMultBonus = roundSafeMultiplier(
      safeMultiply(
        safeNumeric(economyState.chainMultBonus ?? 1, 1),
        safeNumeric(eff.chainMultFactor, 1)
      ),
      0.1
    );
  }
  if (eff.acidRefluxOverdrive) {
    economyState.acidRefluxOverdrive = true;
  }
  if (eff.rouletteGritBonus) {
    economyState.rouletteGritBonus = roundSafeMultiplier(
      safeMultiply(
        safeNumeric(economyState.rouletteGritBonus ?? 1, 1),
        safeNumeric(eff.rouletteGritBonus, 1)
      ),
      0.1
    );
  }
  if (eff.wheelBoost && typeof eff.wheelBoost === 'object' && !Array.isArray(eff.wheelBoost)) {
    economyState.wheelBoostMap = { ...(economyState.wheelBoostMap || {}) };
    for (const [symId, delta] of Object.entries(eff.wheelBoost)) {
      economyState.wheelBoostMap[symId] = safeClamp(
        safeNumeric(economyState.wheelBoostMap[symId] ?? 0, 0) + safeNumeric(delta, 0),
        -MAX_SAFE_GAME_NUMBER,
        MAX_SAFE_GAME_NUMBER
      );
    }
  }

  return economyState;
}

export const draftRelic = applyRelic;

/**
 * Computes exponential Endless Mode Boss HP for Wave 9+ (`baseWave8Hp * 6.5^(wave - 8)`),
 * matching `ScoreFormula.getWaveProgressionTarget` (`T5-02`) and clamping at `MAX_SAFE_GAME_NUMBER`.
 */
export function computeEndlessBossHp(baseWave8Hp = 85_000_000, wave = 9, growthBase = 6.5) {
  const baseHp = safeClamp(safeNumeric(baseWave8Hp, 85_000_000), 1, MAX_SAFE_GAME_NUMBER);
  const w = Math.max(1, Math.floor(safeNumeric(wave, 9)));
  if (w <= 8) return Math.floor(baseHp);
  const extra = w - 8;
  const factor = safePower(Math.max(1.1, safeNumeric(growthBase, 6.5)), extra);
  return Math.floor(safeClamp(safeMultiply(baseHp, factor), 1, MAX_SAFE_GAME_NUMBER));
}

/**
 * Transitions economyState into Wave 9+ Endless Mode after Wave 8 Victory (`PROJECT.md § 6.2`).
 */
export function enterEndlessMode(economyState, baseWave8Hp = 85_000_000) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }
  economyState.endlessMode = true;
  const curWave = Math.floor(safeClamp(safeNumeric(economyState.wave ?? 8, 8), 1, MAX_SAFE_GAME_NUMBER));
  economyState.wave = curWave <= 8 ? 9 : curWave;
  economyState.pullsRemaining = Math.floor(
    safeClamp(safeNumeric(economyState.maxPullsPerWave ?? 5, 5), 1, MAX_SAFE_GAME_NUMBER)
  );
  economyState.pullsUsed = 0;
  economyState.pullCost = Math.floor(
    safeClamp(safeNumeric(economyState.basePullCost ?? 10, 10), 1, MAX_SAFE_GAME_NUMBER)
  );
  economyState.pendingRelicDraft = null;

  const nextBossHp = computeEndlessBossHp(baseWave8Hp, economyState.wave);
  return {
    economyState,
    wave: economyState.wave,
    endlessMode: true,
    nextBossHp,
  };
}

/**
 * Generates and stores a non-blocking 3-Card Relic Draft on `economyState.pendingRelicDraft`.
 */
export function startRelicDraft(economyState, count = 3, prng = null) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }
  const choices = getRelicDraftChoices(economyState, count, prng);
  economyState.pendingRelicDraft = choices;
  return choices;
}

/**
 * Resolves `economyState.pendingRelicDraft` either via explicit `relicId` click (`PROJECT.md § 6.2`)
 * or via Non-Blocking Auto-Advance (`relicId = null` -> auto-applies `pendingRelicDraft[0]`).
 */
export function resolvePendingRelicDraft(economyState, relicId = null) {
  if (!economyState || typeof economyState !== 'object') {
    economyState = createEconomyState();
  }
  const validPending = Array.isArray(economyState.pendingRelicDraft)
    ? economyState.pendingRelicDraft.map(sanitizeRelicEntry).filter(Boolean)
    : [];
  const targetId = extractRelicId(relicId);

  if (validPending.length === 0) {
    economyState.pendingRelicDraft = null;
    if (targetId) {
      const prevLen = Array.isArray(economyState.relics)
        ? economyState.relics.map(sanitizeRelicEntry).filter(Boolean).length
        : 0;
      applyRelic(economyState, targetId);
      const applied =
        Array.isArray(economyState.relics) && economyState.relics.length > prevLen
          ? economyState.relics[economyState.relics.length - 1]
          : null;
      return { applied: Boolean(applied), relic: applied, autoPicked: false };
    }
    return { applied: false, relic: null, autoPicked: false };
  }

  let chosen = null;
  let autoPicked = false;
  if (targetId) {
    chosen =
      validPending.find((c) => extractRelicId(c) === targetId) ||
      DEFAULT_RELIC_CATALOG.find((r) => r.id === targetId) ||
      validPending[0];
  } else {
    chosen = validPending[0];
    autoPicked = true;
  }

  economyState.pendingRelicDraft = null;
  const prevLen = Array.isArray(economyState.relics)
    ? economyState.relics.map(sanitizeRelicEntry).filter(Boolean).length
    : 0;
  applyRelic(economyState, chosen);
  const appliedRelic =
    Array.isArray(economyState.relics) && economyState.relics.length > prevLen
      ? economyState.relics[economyState.relics.length - 1]
      : chosen;
  return { applied: Boolean(appliedRelic), relic: appliedRelic, autoPicked };
}

/**
 * Returns true if `economyState.relics` includes `relicId`.
 */
export function hasRelic(economyState, relicId) {
  const targetId = extractRelicId(relicId);
  if (!targetId || !Array.isArray(economyState?.relics)) return false;
  return economyState.relics.some((r) => extractRelicId(r) === targetId);
}

/**
 * Returns a normalized snapshot of all active Relic & Economy modifiers for Engines and HUD.
 */
export function getRelicModifiers(economyState = {}) {
  const relics = Array.isArray(economyState?.relics) ? economyState.relics : [];
  const relicIds = relics.map(extractRelicId).filter(Boolean);
  return {
    greedMultiplier: safeClamp(safeNumeric(economyState?.greedMultiplier, 1.0), 0.1, MAX_SAFE_GAME_NUMBER),
    bonusDevourStacks: Math.floor(
      safeClamp(safeNumeric(economyState?.bonusDevourStacks, 0), 0, MAX_SAFE_GAME_NUMBER)
    ),
    chainMultBonus: safeClamp(safeNumeric(economyState?.chainMultBonus, 1.0), 1.0, MAX_SAFE_GAME_NUMBER),
    acidRefluxOverdrive: Boolean(economyState?.acidRefluxOverdrive),
    interestRate: safeClamp(safeNumeric(economyState?.interestRate, 0.25), 0, MAX_SAFE_GAME_NUMBER),
    maxPullsPerWave: Math.floor(
      safeClamp(safeNumeric(economyState?.maxPullsPerWave, 5), 1, MAX_SAFE_GAME_NUMBER)
    ),
    baseWaveGold: Math.floor(
      safeClamp(safeNumeric(economyState?.baseWaveGold, 40), 10, MAX_SAFE_GAME_NUMBER)
    ),
    rouletteGritBonus: safeClamp(
      safeNumeric(economyState?.rouletteGritBonus, 1.0),
      1.0,
      MAX_SAFE_GAME_NUMBER
    ),
    wheelBoostMap: { ...(economyState?.wheelBoostMap || {}) },
    relicIds,
    relicCount: relicIds.length,
  };
}

/**
 * Deducts `cost` Gold for tactical shop actions (Wheel Mod, Maw Upgrade, Ammo Belt, Lock, Peg Upgrade)
 * only if `economyState.gold >= cost`. Never produces negative Gold.
 */
export function spendEconomyGold(economyState, cost = 0) {
  if (!economyState || typeof economyState !== 'object') {
    return { ok: false, spent: 0, gold: 0 };
  }
  const safeCost = Math.floor(safeClamp(safeNumeric(cost, 0), 0, MAX_SAFE_GAME_NUMBER));
  const curGold = Math.floor(safeClamp(safeNumeric(economyState.gold, 0), 0, MAX_SAFE_GAME_NUMBER));
  if (curGold < safeCost) {
    return { ok: false, spent: 0, gold: curGold };
  }
  economyState.gold = curGold - safeCost;
  return { ok: true, spent: safeCost, gold: economyState.gold };
}

export default {
  DEFAULT_RELIC_CATALOG,
  GREED_STREAK_TIERS,
  createEconomyState,
  consumePull,
  settleWaveClear,
  accrueRealtimeInterest,
  getRelicDraftChoices,
  applyRelic,
  draftRelic,
  computeEndlessBossHp,
  enterEndlessMode,
  startRelicDraft,
  resolvePendingRelicDraft,
  hasRelic,
  getRelicModifiers,
  spendEconomyGold,
};
