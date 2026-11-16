/**
 * Exponential BigNumber Formatter & Safe Math Utilities (`F-CORE-02`)
 * Supports Western (`K`, `M`, `B`, `T`, scientific) and Chinese (`万`, `亿`, `万亿`) notation,
 * plus Screen Shake Intensity Tier (`0..4`) calculation.
 */

export const MAX_SAFE_GAME_NUMBER = 1e300;

/**
 * Sanitizes any numeric input against NaN, null, undefined, or Infinity.
 * @param {any} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function sanitizeNumber(value, fallback = 0) {
  if (typeof value === 'bigint') {
    const num = Number(value);
    return Number.isFinite(num) ? num : MAX_SAFE_GAME_NUMBER;
  }
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  if (!Number.isFinite(num)) {
    return num > 0 ? MAX_SAFE_GAME_NUMBER : -MAX_SAFE_GAME_NUMBER;
  }
  return num;
}

/**
 * Clamps a numeric value safely into [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function safeClamp(value, min = 0, max = MAX_SAFE_GAME_NUMBER) {
  const lo = Math.min(sanitizeNumber(min, 0), sanitizeNumber(max, MAX_SAFE_GAME_NUMBER));
  const hi = Math.max(sanitizeNumber(min, 0), sanitizeNumber(max, MAX_SAFE_GAME_NUMBER));
  const v = sanitizeNumber(value, lo);
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Multiplies an arbitrary list of factors safely without overflowing to NaN.
 * @param  {...number} factors
 * @returns {number}
 */
export function safeMultiply(...factors) {
  if (factors.length === 0) return 0;
  let product = 1;
  for (const factor of factors) {
    const clean = sanitizeNumber(factor, 0);
    product *= clean;
    if (!Number.isFinite(product)) {
      product = product < 0 ? -MAX_SAFE_GAME_NUMBER : MAX_SAFE_GAME_NUMBER;
      break;
    }
  }
  return product;
}

/**
 * Computes base^exponent safely without returning NaN or Infinity.
 * @param {number} base
 * @param {number} exponent
 * @returns {number}
 */
export function safePower(base, exponent) {
  const b = sanitizeNumber(base, 1);
  const e = sanitizeNumber(exponent, 0);
  if (e === 0) return 1;
  const result = Math.pow(b, e);
  if (Number.isNaN(result)) return 1;
  if (!Number.isFinite(result)) return MAX_SAFE_GAME_NUMBER;
  return result;
}

/**
 * Formats numbers using K / M / B / T / scientific notation per PROJECT.md:
 *   950 -> "950"
 *   14200 -> "14.2K"
 *   85000000 -> "85.0M"
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatBigNumber(value, decimals = 1) {
  const num = sanitizeNumber(value, 0);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs < 1000) {
    if (Number.isInteger(abs) || abs >= 100) {
      return `${sign}${Math.round(abs)}`;
    }
    return `${sign}${Number(abs.toFixed(decimals))}`;
  }

  const d = safeClamp(Math.floor(decimals), 0, 4);

  if (abs < 1e6) {
    return `${sign}${(abs / 1e3).toFixed(d)}K`;
  }
  if (abs < 1e9) {
    return `${sign}${(abs / 1e6).toFixed(d)}M`;
  }
  if (abs < 1e12) {
    return `${sign}${(abs / 1e9).toFixed(d)}B`;
  }
  if (abs < 1e15) {
    return `${sign}${(abs / 1e12).toFixed(d)}T`;
  }

  return `${sign}${abs.toExponential(2).replace('+', '')}`;
}

/**
 * Alias for formatBigNumber for callers expecting formatNumber.
 */
export const formatNumber = formatBigNumber;

/**
 * Formats numbers into Chinese units (`万`, `亿`, `万亿`) per PROJECT.md:
 *   85000000 -> "8500.0万"
 *   172000000 -> "1.72亿"
 * @param {number} value
 * @returns {string}
 */
export function formatChineseNumber(value) {
  const num = sanitizeNumber(value, 0);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs < 1e4) {
    return `${sign}${Math.round(abs)}`;
  }
  if (abs < 1e8) {
    return `${sign}${(abs / 1e4).toFixed(1)}万`;
  }
  if (abs < 1e12) {
    return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  }
  if (abs < 1e16) {
    return `${sign}${(abs / 1e12).toFixed(2)}万亿`;
  }
  return `${sign}${abs.toExponential(2).replace('+', '')}`;
}

/**
 * Maps total turn damage to Screen Shake & Typography Intensity Tier (0..4):
 *   Tier 0: < 100 (Normal)
 *   Tier 1: 100 .. 4,999 (Super)
 *   Tier 2: 5,000 .. 249,999 (Mega)
 *   Tier 3: 250,000 .. 9,999,999 (Ultra)
 *   Tier 4: >= 10,000,000 (Cosmic / 千万-亿级 Jackpot)
 * @param {number} damage
 * @returns {0|1|2|3|4}
 */
export function getIntensityTier(damage) {
  const d = Math.abs(sanitizeNumber(damage, 0));
  if (d >= 10_000_000) return 4;
  if (d >= 250_000) return 3;
  if (d >= 5_000) return 2;
  if (d >= 100) return 1;
  return 0;
}

export default {
  sanitizeNumber,
  safeClamp,
  safeMultiply,
  safePower,
  formatBigNumber,
  formatNumber,
  formatChineseNumber,
  getIntensityTier,
};
