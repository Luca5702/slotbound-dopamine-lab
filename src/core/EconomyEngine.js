/**
 * Risk & Greed Economy Engine (`F-CORE-03`)
 * Implements:
 *  - Wave Pull Countdown (`5` pulls/wave)
 *  - Unused Pulls (U) compound interest:
 *      interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
 *  - Permanent Greed Multiplier scaling:
 *      greedMultiplier *= Math.pow(1.35, U)
 *  - Real-time Gold Interest ticker (`+20%`) & Greed Streak for Scheme 3 (Jackpot TD)
 *  - Post-wave 3-pick Relic/Mutation drafting
 */

import { sanitizeNumber, safePower } from './BigNumber.js';
import { createPRNG } from './PRNG.js';

export const DEFAULT_RELIC_CATALOG = [
  {
    id: 'greed_ledger',
    name: '贪婪账本 (Greed Ledger)',
    rarity: 'common',
    description: 'Permanent Greed Multiplier ×1.25 and +25 Starting Wave Gold.',
    effect: { greedMultFactor: 1.25, baseWaveGoldBonus: 25 },
  },
  {
    id: 'gluttony_jaw',
    name: '暴食颚骨 (Gluttony Jaw)',
    rarity: 'common',
    description: '+1 Bonus Devour Stack on every Auto-Devour and ×1.20 Greed Multiplier.',
    effect: { bonusDevourStacks: 1, greedMultFactor: 1.2 },
  },
  {
    id: 'acid_reflux_core',
    name: '胃酸狂暴核 (Acid Reflux Core)',
    rarity: 'rare',
    description: 'Turns 100% Indigestion into a ×15.0 Bile Tsunami with zero pull penalty.',
    effect: { acidRefluxOverdrive: true, greedMultFactor: 1.35 },
  },
  {
    id: 'pyro_catalyst',
    name: '爆破催化剂 (Pyro Catalyst)',
    rarity: 'rare',
    description: 'Boosts Fireball & Powder Keg weight by +15% and Chain Mult ×1.40.',
    effect: { chainMultFactor: 1.4, wheelBoost: { fireball: 15, powder_keg: 15 } },
  },
  {
    id: 'russian_roulette_coin',
    name: '恶魔轮盘金币 (Demon Roulette Coin)',
    rarity: 'rare',
    description: 'Empty chambers & Demon Bullets grant ×1.50 bonus Greed Multiplier.',
    effect: { greedMultFactor: 1.5, rouletteGritBonus: 1.5 },
  },
  {
    id: 'compound_vault',
    name: '复利金库 (Compound Vault)',
    rarity: 'epic',
    description: 'Increases compound interest rate by +10% and grants +100 instant Gold.',
    effect: { interestRateBonus: 0.1, instantGold: 100, greedMultFactor: 1.3 },
  },
  {
    id: 'chronos_lever',
    name: '时空拉杆 (Chronos Lever)',
    rarity: 'epic',
    description: 'Grants +1 Max Pull per wave (increases unused pull compound potential!).',
    effect: { maxPullsBonus: 1, greedMultFactor: 1.25 },
  },
  {
    id: 'abyssal_crown',
    name: '深渊暴君王冠 (Abyssal Crown)',
    rarity: 'mythic',
    description: 'Multiplies permanent Greed Multiplier by ×1.75.',
    effect: { greedMultFactor: 1.75 },
  },
];

export const GREED_STREAK_TIERS = [1.0, 1.5, 2.2, 3.5, 5.0];

/**
 * Creates a fresh Risk & Greed economy state object.
 * @param {object} [options={}]
 */
export function createEconomyState(options = {}) {
  const maxPulls = Math.max(
    1,
    Math.floor(sanitizeNumber(options.maxPullsPerWave ?? options.maxSpinsPerWave ?? 5, 5))
  );
  const initialGold = Math.max(0, Math.floor(sanitizeNumber(options.gold ?? options.initialGold ?? 100, 100)));
  const wave = Math.max(1, Math.floor(sanitizeNumber(options.wave ?? 1, 1)));
  const basePullCost = Math.max(1, Math.floor(sanitizeNumber(options.basePullCost ?? options.pullCost ?? 10, 10)));

  return {
    wave,
    gold: initialGold,
    baseWaveGold: Math.max(10, Math.floor(sanitizeNumber(options.baseWaveGold ?? 40, 40))),
    maxPullsPerWave: maxPulls,
    pullsRemaining: Math.max(0, Math.floor(sanitizeNumber(options.pullsRemaining ?? maxPulls, maxPulls))),
    pullsUsed: Math.max(0, Math.floor(sanitizeNumber(options.pullsUsed ?? 0, 0))),
    interestRate: Math.max(0, sanitizeNumber(options.interestRate ?? 0.25, 0.25)),
    interestCap: Math.max(50, sanitizeNumber(options.interestCap ?? 10000, 10000)),
    greedMultiplier: Math.max(0.1, sanitizeNumber(options.greedMultiplier ?? 1.0, 1.0)),
    greedStreak: Math.max(0, Math.floor(sanitizeNumber(options.greedStreak ?? 0, 0))),
    greedStreakMultiplier: 1.0,
    basePullCost,
    pullCost: basePullCost,
    bonusDevourStacks: 0,
    chainMultBonus: 1.0,
    acidRefluxOverdrive: false,
    relics: Array.isArray(options.relics) ? [...options.relics] : [],
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
  const { spendGold = false, costEscalation = 2, allowOverdraft = false } = options;

  let goldSpent = 0;
  if (spendGold) {
    const cost = Math.max(0, Math.floor(sanitizeNumber(economyState.pullCost ?? 10, 10)));
    if (economyState.gold < cost && !allowOverdraft) {
      return {
        ...economyState,
        canPull: false,
        goldSpent: 0,
      };
    }
    goldSpent = Math.min(economyState.gold, cost);
    economyState.gold = Math.max(0, economyState.gold - cost);
    economyState.pullCost = cost + Math.max(0, sanitizeNumber(costEscalation, 2));
  }

  const hadPulls = (economyState.pullsRemaining ?? 0) > 0;
  economyState.pullsRemaining = Math.max(0, (economyState.pullsRemaining ?? 1) - 1);
  economyState.pullsUsed = (economyState.pullsUsed ?? 0) + 1;
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
  const U = Math.max(0, Math.floor(sanitizeNumber(rawUnused, 0)));

  const currentGold = Math.max(0, sanitizeNumber(economyState.gold, 0));
  const currentWave = Math.max(1, Math.floor(sanitizeNumber(waveIndex ?? economyState.wave ?? 1, 1)));
  const baseWaveGold = Math.max(
    10,
    Math.floor(sanitizeNumber(economyState.baseWaveGold ?? 30 + currentWave * 10, 40))
  );

  // Canonical PROJECT.md compound interest formula:
  // interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
  const compoundRateFactor = safePower(1.25, U) - 1;
  const effectivePrincipal = currentGold + baseWaveGold * (1 + 0.25 * U);
  const interestGold =
    U > 0 ? Math.floor(effectivePrincipal * compoundRateFactor) + 15 * U : 0;

  const totalGoldEarned = baseWaveGold + interestGold;
  const previousGreedMultiplier = Math.max(0.1, sanitizeNumber(economyState.greedMultiplier, 1.0));
  const greedMultiplierGain = safePower(1.35, U);
  const newGreedMultiplier = Number((previousGreedMultiplier * greedMultiplierGain).toFixed(4));

  const settlement = {
    waveCleared: currentWave,
    unusedPulls: U,
    baseWaveGold,
    interestGold,
    totalGoldEarned,
    previousGold: currentGold,
    newGold: currentGold + totalGoldEarned,
    previousGreedMultiplier,
    greedMultiplierGain: Number(greedMultiplierGain.toFixed(4)),
    newGreedMultiplier,
    rareRelicGuaranteed: U >= 2,
  };

  economyState.gold = settlement.newGold;
  economyState.greedMultiplier = newGreedMultiplier;
  economyState.wave = currentWave + 1;
  economyState.pullsRemaining = economyState.maxPullsPerWave ?? 5;
  economyState.pullsUsed = 0;
  economyState.pullCost = economyState.basePullCost ?? 10;
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
  const rate = Math.max(0, sanitizeNumber(rateOverride, 0.20));
  const currentGold = Math.max(0, sanitizeNumber(economyState.gold, 0));
  const interestEarned = currentGold > 0 ? Math.max(1, Math.floor(currentGold * rate)) : 0;

  economyState.gold = currentGold + interestEarned;
  economyState.greedStreak = Math.max(0, (economyState.greedStreak ?? 0) + 1);
  const tierIdx = Math.min(economyState.greedStreak, GREED_STREAK_TIERS.length - 1);
  economyState.greedStreakMultiplier = GREED_STREAK_TIERS[tierIdx];
  economyState.greedMultiplier = Math.max(
    sanitizeNumber(economyState.greedMultiplier, 1.0),
    economyState.greedStreakMultiplier
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
 * @param {object} economyState
 * @param {number} [count=3]
 * @param {object|null} [prng=null]
 */
export function getRelicDraftChoices(economyState = {}, count = 3, prng = null) {
  const rng = prng && typeof prng.shuffle === 'function' ? prng : createPRNG(12345 + (economyState?.wave || 1));
  const ownedIds = new Set((economyState?.relics || []).map((r) => (typeof r === 'string' ? r : r.id)));
  const pool = DEFAULT_RELIC_CATALOG.filter((r) => !ownedIds.has(r.id));
  const available = pool.length >= count ? pool : [...DEFAULT_RELIC_CATALOG];

  const shuffled = rng.shuffle(available);
  const numChoices = Math.max(1, Math.min(count, shuffled.length));
  const choices = shuffled.slice(0, numChoices);

  const guaranteeRare = Boolean(economyState?.lastSettlement?.rareRelicGuaranteed || (economyState?.pullsRemaining ?? 0) >= 2);
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
  const relic =
    typeof relicIdOrObj === 'string'
      ? DEFAULT_RELIC_CATALOG.find((r) => r.id === relicIdOrObj) || {
          id: relicIdOrObj,
          name: relicIdOrObj,
          rarity: 'common',
          effect: { greedMultFactor: 1.2 },
        }
      : relicIdOrObj;

  if (!relic || typeof relic !== 'object') return economyState;

  economyState.relics = Array.isArray(economyState.relics) ? economyState.relics : [];
  economyState.relics.push(relic);

  const eff = relic.effect || {};
  if (eff.greedMultFactor) {
    economyState.greedMultiplier = Number(
      (sanitizeNumber(economyState.greedMultiplier, 1) * sanitizeNumber(eff.greedMultFactor, 1)).toFixed(4)
    );
  }
  if (eff.baseWaveGoldBonus) {
    economyState.baseWaveGold = (economyState.baseWaveGold ?? 40) + eff.baseWaveGoldBonus;
  }
  if (eff.instantGold) {
    economyState.gold = (economyState.gold ?? 0) + eff.instantGold;
  }
  if (eff.interestRateBonus) {
    economyState.interestRate = Number(((economyState.interestRate ?? 0.25) + eff.interestRateBonus).toFixed(4));
  }
  if (eff.maxPullsBonus) {
    economyState.maxPullsPerWave = (economyState.maxPullsPerWave ?? 5) + eff.maxPullsBonus;
    economyState.pullsRemaining = (economyState.pullsRemaining ?? 5) + eff.maxPullsBonus;
  }
  if (eff.bonusDevourStacks) {
    economyState.bonusDevourStacks = (economyState.bonusDevourStacks ?? 0) + eff.bonusDevourStacks;
  }
  if (eff.chainMultFactor) {
    economyState.chainMultBonus = Number(((economyState.chainMultBonus ?? 1) * eff.chainMultFactor).toFixed(4));
  }
  if (eff.acidRefluxOverdrive) {
    economyState.acidRefluxOverdrive = true;
  }

  return economyState;
}

export const draftRelic = applyRelic;

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
};
