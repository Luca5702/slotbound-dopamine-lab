/**
 * Balatro-Style Exponential Scoring Engine (`F-CORE-02`)
 * Canonical Formula (PROJECT.md):
 *   TotalDamage = floor(BasePoints * LineMultiplier * DevourStacksMultiplier * ChainSynergyMultiplier * GreedMultiplier)
 *   Default DevourStacksMultiplier = (1 + 0.6 * devourStacks) * Math.pow(1.25, devourStacks)
 */

import {
  sanitizeNumber,
  safeMultiply,
  safePower,
  formatBigNumber,
  formatChineseNumber,
  getIntensityTier,
} from './BigNumber.js';

/**
 * 5-Minute Exponential Wave Progression Table (Waves 1..8) from GDD 01.
 */
export const WAVE_PROGRESSION_TABLE = [
  { wave: 1, elapsedSec: 15, targetBossHp: 120, typicalBase: 20, typicalLineMult: 1.5, typicalDevourMult: 2.0, typicalChainGreed: 1.0 },
  { wave: 2, elapsedSec: 45, targetBossHp: 650, typicalBase: 35, typicalLineMult: 2.5, typicalDevourMult: 3.5, typicalChainGreed: 1.5 },
  { wave: 3, elapsedSec: 75, targetBossHp: 3_800, typicalBase: 60, typicalLineMult: 4.0, typicalDevourMult: 6.0, typicalChainGreed: 2.5 },
  { wave: 4, elapsedSec: 110, targetBossHp: 25_000, typicalBase: 110, typicalLineMult: 6.5, typicalDevourMult: 11.0, typicalChainGreed: 4.0 },
  { wave: 5, elapsedSec: 150, targetBossHp: 180_000, typicalBase: 200, typicalLineMult: 10.0, typicalDevourMult: 22.0, typicalChainGreed: 6.5 },
  { wave: 6, elapsedSec: 195, targetBossHp: 1_500_000, typicalBase: 380, typicalLineMult: 15.0, typicalDevourMult: 45.0, typicalChainGreed: 10.0 },
  { wave: 7, elapsedSec: 240, targetBossHp: 12_000_000, typicalBase: 700, typicalLineMult: 22.0, typicalDevourMult: 90.0, typicalChainGreed: 15.0 },
  { wave: 8, elapsedSec: 285, targetBossHp: 85_000_000, typicalBase: 1250, typicalLineMult: 32.0, typicalDevourMult: 180.0, typicalChainGreed: 24.0 },
];

/**
 * Computes the canonical Devour Stacks Multiplier per PROJECT.md:
 *   (1 + 0.6 * devourStacks) * (1.25 ^ devourStacks) * (1 + 0.15 * totalRunDevoured)
 * @param {number} devourStacks
 * @param {number} [totalRunDevoured=0]
 * @param {number|null} [devourBase=null]
 * @returns {number}
 */
export function calculateDevourMultiplier(devourStacks = 0, totalRunDevoured = 0, devourBase = null) {
  const stacks = Math.max(0, sanitizeNumber(devourStacks, 0));
  const runTotal = Math.max(0, sanitizeNumber(totalRunDevoured, 0));
  if (stacks === 0 && runTotal === 0) return 1;

  if (devourBase !== null && devourBase !== undefined && sanitizeNumber(devourBase, 0) > 1) {
    return safePower(sanitizeNumber(devourBase, 1.5), stacks) * (1 + 0.15 * runTotal);
  }

  const turnFactor = (1 + 0.6 * stacks) * safePower(1.25, stacks);
  const runFactor = 1 + 0.15 * runTotal;
  return Number((turnFactor * runFactor).toFixed(6));
}

/**
 * Computes payline multiplier from a list of line matches.
 * @param {Array<{ matchCount?: number, weight?: number }>} matches
 * @returns {number}
 */
export function calculateLineMultiplier(matches = []) {
  if (!Array.isArray(matches) || matches.length === 0) return 1;
  let additive = 1;
  for (const m of matches) {
    const count = Math.max(2, sanitizeNumber(m?.matchCount ?? 3, 3));
    const weight = Math.max(0.5, sanitizeNumber(m?.weight ?? 1, 1));
    additive += weight * safePower(2, count - 2);
  }
  const resonance = matches.length > 1 ? safePower(1.5, matches.length - 1) : 1;
  return Number((additive * resonance).toFixed(4));
}

/**
 * Calculates exponential spin/turn damage and returns full breakdown with all aliased keys
 * required by PROJECT.md and window.__SLOTBOUND__ / window.__SLOTBOUND_TEST__.
 *
 * @param {object} params
 * @returns {object}
 */
export function calculateSpinDamage(params = {}) {
  const {
    basePoints,
    baseChips,
    lineMultiplier,
    lineMult,
    devourStacks = 0,
    totalRunDevoured = 0,
    devourBase = null,
    devourStacksMultiplier = null,
    devourMultiplier = null,
    chainSynergyMultiplier,
    chainBonusMult,
    chainMult,
    greedMultiplier,
    relicMult,
    greedMult,
    comboName = 'Standard Attack',
    triggeredSynergies = [],
    settlementDurationMs = 450,
  } = params || {};

  const resolvedBase = Math.max(0, sanitizeNumber(basePoints ?? baseChips ?? 0, 0));
  const resolvedLineMult = Math.max(0, sanitizeNumber(lineMultiplier ?? lineMult ?? 1, 1));
  const resolvedStacks = Math.max(0, sanitizeNumber(devourStacks, 0));

  let resolvedDevourMult;
  if (devourStacksMultiplier !== null && devourStacksMultiplier !== undefined) {
    resolvedDevourMult = Math.max(0, sanitizeNumber(devourStacksMultiplier, 1));
  } else if (devourMultiplier !== null && devourMultiplier !== undefined) {
    resolvedDevourMult = Math.max(0, sanitizeNumber(devourMultiplier, 1));
  } else {
    resolvedDevourMult = calculateDevourMultiplier(resolvedStacks, totalRunDevoured, devourBase);
  }

  const resolvedChainMult = Math.max(
    0,
    sanitizeNumber(chainSynergyMultiplier ?? chainBonusMult ?? chainMult ?? 1, 1)
  );
  const resolvedGreedMult = Math.max(
    0,
    sanitizeNumber(greedMultiplier ?? relicMult ?? greedMult ?? 1, 1)
  );

  const rawProduct = safeMultiply(
    resolvedBase,
    resolvedLineMult,
    resolvedDevourMult,
    resolvedChainMult,
    resolvedGreedMult
  );
  const totalDamage = Math.max(0, Math.floor(rawProduct));
  const totalMult = Number(
    safeMultiply(resolvedLineMult, resolvedDevourMult, resolvedChainMult, resolvedGreedMult).toFixed(4)
  );
  const formattedDamage = formatBigNumber(totalDamage);
  const formattedChineseDamage = formatChineseNumber(totalDamage);
  const intensityTier = getIntensityTier(totalDamage);
  const safeDuration = Math.min(999, Math.max(1, sanitizeNumber(settlementDurationMs, 450)));

  return {
    // Canonical PROJECT.md keys
    basePoints: resolvedBase,
    lineMultiplier: resolvedLineMult,
    devourStacks: resolvedStacks,
    devourStacksMultiplier: resolvedDevourMult,
    chainSynergyMultiplier: resolvedChainMult,
    greedMultiplier: resolvedGreedMult,
    totalDamage,
    formattedDamage,
    formattedChineseDamage,
    intensityTier,
    // Aliased keys for HUD & E2E bridges (window.__SLOTBOUND__ / window.__SLOTBOUND_TEST__)
    baseChips: resolvedBase,
    rawBase: resolvedBase,
    lineMult: resolvedLineMult,
    devourMultiplier: resolvedDevourMult,
    chainBonusMult: resolvedChainMult,
    relicMult: resolvedGreedMult,
    totalMult,
    finalDamage: totalDamage,
    comboName: String(comboName || 'Standard Attack'),
    triggeredSynergies: Array.isArray(triggeredSynergies) ? [...triggeredSynergies] : [],
    settlementDurationMs: safeDuration,
  };
}

/**
 * Returns the target progression benchmark for a given wave index (1..8+).
 * @param {number} waveIndex
 */
export function getWaveProgressionTarget(waveIndex = 1) {
  const w = Math.max(1, Math.floor(sanitizeNumber(waveIndex, 1)));
  if (w <= WAVE_PROGRESSION_TABLE.length) {
    return { ...WAVE_PROGRESSION_TABLE[w - 1] };
  }
  const last = WAVE_PROGRESSION_TABLE[WAVE_PROGRESSION_TABLE.length - 1];
  const extra = w - last.wave;
  return {
    wave: w,
    elapsedSec: last.elapsedSec + extra * 45,
    targetBossHp: Math.floor(last.targetBossHp * safePower(6.5, extra)),
    typicalBase: Math.floor(last.typicalBase * safePower(1.6, extra)),
    typicalLineMult: Number((last.typicalLineMult * safePower(1.4, extra)).toFixed(2)),
    typicalDevourMult: Number((last.typicalDevourMult * safePower(1.8, extra)).toFixed(2)),
    typicalChainGreed: Number((last.typicalChainGreed * safePower(1.5, extra)).toFixed(2)),
  };
}

export default {
  WAVE_PROGRESSION_TABLE,
  calculateDevourMultiplier,
  calculateLineMultiplier,
  calculateSpinDamage,
  getWaveProgressionTarget,
};
