/**
 * Deterministic Seeded Mulberry32 PRNG (`F-CORE-01`)
 * Pure ES Module — Zero DOM dependencies.
 */

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.floor(seed) >>> 0) || 1;
  }
  if (typeof seed === 'string' && seed.length > 0) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash || 1;
  }
  return 12345;
}

export class PRNG {
  constructor(seed = 12345) {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed;
  }

  /**
   * Resets the PRNG seed and internal state.
   * @param {number|string} seed
   * @returns {number} Normalized 32-bit unsigned seed
   */
  setSeed(seed) {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed;
    return this.state;
  }

  /**
   * Restores exact internal 32-bit state.
   * @param {number} state
   */
  setState(state) {
    this.state = normalizeSeed(state);
    return this.state;
  }

  /**
   * Returns current 32-bit unsigned state integer.
   * @returns {number}
   */
  getState() {
    return this.state >>> 0;
  }

  /**
   * Returns the initial normalized seed.
   * @returns {number}
   */
  getSeed() {
    return this.initialSeed >>> 0;
  }

  /**
   * Mulberry32 step returning a deterministic float in [0, 1).
   * @returns {number}
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    this.state = t >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloat(min = 0, max = 1) {
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) ? max : 1;
    if (lo === hi) return lo;
    const actualMin = Math.min(lo, hi);
    const actualMax = Math.max(lo, hi);
    return actualMin + this.next() * (actualMax - actualMin);
  }

  /**
   * Returns a deterministic integer in [min, max] (inclusive).
   * Handles single-argument nextInt(max) as [0, max] and swaps if min > max.
   * @param {number} min
   * @param {number} [max]
   * @returns {number}
   */
  nextInt(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    const a = Number.isFinite(Number(min)) ? Math.trunc(Number(min)) : 0;
    const b = Number.isFinite(Number(max)) ? Math.trunc(Number(max)) : 0;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo === hi) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /**
   * Uniformly picks a random item from a non-empty array.
   * @template T
   * @param {T[]} arr
   * @returns {T|null}
   */
  pick(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /**
   * Picks an item using weighted probabilities.
   * Accepts:
   *  - Array of objects: [{ id: 'a', weight: 10 }, { id: 'b', probability: 20 }] -> returns the chosen object
   *  - Object map: { goblin: 22, fireball: 12 } -> returns the chosen key string
   * @param {Array<object>|Record<string, number>} items
   * @returns {any}
   */
  pickWeighted(items) {
    if (!items) return null;

    // Support plain object weight dictionary { goblin: 22, chest: 14 }
    if (!Array.isArray(items) && typeof items === 'object') {
      const entries = Object.entries(items).filter(
        ([, w]) => typeof w === 'number' && Number.isFinite(w) && w > 0
      );
      if (entries.length === 0) {
        const allKeys = Object.keys(items);
        return allKeys.length > 0 ? allKeys[0] : null;
      }
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = this.next() * total;
      for (const [key, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return key;
      }
      return entries[entries.length - 1][0];
    }

    if (!Array.isArray(items) || items.length === 0) return null;

    const getWeight = (entry) => {
      if (typeof entry === 'number') return entry > 0 && Number.isFinite(entry) ? entry : 0;
      if (Array.isArray(entry)) {
        const w = Number(entry[1]);
        return Number.isFinite(w) && w > 0 ? w : 0;
      }
      if (entry && typeof entry === 'object') {
        const raw = entry.weight ?? entry.probability ?? entry.chance ?? entry.pct ?? 1;
        const w = Number(raw);
        return Number.isFinite(w) && w > 0 ? w : 0;
      }
      return 0;
    };

    const weights = items.map(getWeight);
    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    if (totalWeight <= 0) {
      // Fallback to uniform random pick if all weights are 0 or negative
      return items[this.nextInt(0, items.length - 1)];
    }

    let threshold = this.next() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      if (weights[i] <= 0) continue;
      threshold -= weights[i];
      if (threshold <= 0) {
        return items[i];
      }
    }

    // Fallback to last positive-weight item
    for (let i = items.length - 1; i >= 0; i--) {
      if (weights[i] > 0) return items[i];
    }
    return items[items.length - 1];
  }

  /**
   * Returns a new Fisher-Yates shuffled copy of the input array.
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  shuffle(arr) {
    if (!Array.isArray(arr)) return [];
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Creates a deterministic child PRNG instance derived from current state.
   * @param {number} [salt=1]
   * @returns {PRNG}
   */
  fork(salt = 1) {
    const childSeed = (this.nextInt(1, 0x7fffffff) ^ normalizeSeed(salt)) >>> 0;
    return new PRNG(childSeed || 1);
  }
}

/**
 * Factory function creating a seeded PRNG controller conforming to PROJECT.md § Interface Contracts.
 * @param {number|string} [seed=12345]
 */
export function createPRNG(seed = 12345) {
  const prng = new PRNG(seed);
  return {
    next: () => prng.next(),
    nextFloat: (min, max) => prng.nextFloat(min, max),
    nextInt: (min, max) => prng.nextInt(min, max),
    pick: (arr) => prng.pick(arr),
    pickWeighted: (items) => prng.pickWeighted(items),
    shuffle: (arr) => prng.shuffle(arr),
    getState: () => prng.getState(),
    setState: (state) => prng.setState(state),
    setSeed: (newSeed) => prng.setSeed(newSeed),
    getSeed: () => prng.getSeed(),
    fork: (salt) => prng.fork(salt),
  };
}

export default createPRNG;
