/**
 * Scheme 1: 《吞噬转轮》(Devour Reels) Pure Deterministic Game Engine (`F-S1-01`, `F-S1-02`, `F-S1-03`)
 * Zero DOM dependencies — runs in both Browser and Node.js (`node --test`).
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateLineMultiplier, calculateSpinDamage } from '../../core/ScoreFormula.js';
import { createEconomyState, consumePull, settleWaveClear } from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  SYMBOLS,
  SYMBOL_MAP,
  PAYLINES,
  ADJACENCY_MAP,
  DEFAULT_WHEEL_WEIGHTS,
  WHEEL_PRESETS,
  BOSSES,
  getBossForWave,
} from './config.js';

/**
 * Normalizes a wheel probability map so all 9 canonical symbols exist,
 * are clamped within `[0, 100]`, and sum to `100`.
 * @param {object} rawWeights
 * @returns {Record<string, number>}
 */
export function normalizeWheelWeights(rawWeights = {}) {
  const cleaned = {};
  let sum = 0;

  for (const sym of SYMBOLS) {
    const val = Math.max(0, sanitizeNumber(rawWeights?.[sym.id], 0));
    cleaned[sym.id] = val;
    sum += val;
  }

  if (sum <= 0) {
    return { ...DEFAULT_WHEEL_WEIGHTS };
  }

  const normalized = {};
  let runningSum = 0;
  let maxKey = SYMBOLS[0].id;
  let maxVal = -1;

  for (const sym of SYMBOLS) {
    const scaled = safeClamp(Number(((cleaned[sym.id] / sum) * 100).toFixed(2)), 0, 100);
    normalized[sym.id] = scaled;
    runningSum += scaled;
    if (scaled > maxVal) {
      maxVal = scaled;
      maxKey = sym.id;
    }
  }

  const diff = Number((100 - runningSum).toFixed(2));
  if (Math.abs(diff) > 0 && maxKey) {
    normalized[maxKey] = safeClamp(Number((normalized[maxKey] + diff).toFixed(2)), 0, 100);
  }

  return normalized;
}

export class DevourReelsEngine {
  constructor(options = {}) {
    this.id = 'devour-reels';
    this.schemeId = 'devour-reels';
    this.seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 12345;
    this.prng = createPRNG(this.seed);
    this.bus = options.bus || createEventBus();
    this.flowTracker = options.flowTracker || createFlowTracker({ bus: this.bus });
    this.sound = options.sound || null;

    this._initCoreState(options);
  }

  _initCoreState(options = {}) {
    const initialWave = Math.max(1, Math.floor(sanitizeNumber(options.wave, 1)));
    const boss = getBossForWave(initialWave);

    this.economy = createEconomyState({
      wave: initialWave,
      gold: sanitizeNumber(options.gold, 100),
      baseWaveGold: 40,
      maxPullsPerWave: 5,
      pullsRemaining: sanitizeNumber(options.pullsRemaining, 5),
      greedMultiplier: sanitizeNumber(options.greedMultiplier, 1.0),
    });

    this.playerHp = safeClamp(sanitizeNumber(options.playerHp, 100), 0, 100);
    this.playerMaxHp = 100;

    this.enemyName = boss.name;
    this.enemyMaxHp = Math.max(1, sanitizeNumber(options.enemyMaxHp ?? options.enemyHp, boss.maxHp));
    this.enemyHp = Math.max(0, sanitizeNumber(options.enemyHp, this.enemyMaxHp));

    this.indigestion = safeClamp(sanitizeNumber(options.indigestion, 0), 0, 100);
    this.mawArmor = Math.max(0, sanitizeNumber(options.mawArmor, 0));
    this.mawLevel = 1;
    this.mawBaseAttackBonus = 0;
    this.totalRunDevoured = 0;

    this.wheelProbabilities = normalizeWheelWeights(options.wheelProbabilities || DEFAULT_WHEEL_WEIGHTS);
    this.activePreset = 'baseline';

    this._forcedNextGrid = null;
    this.lastDevourEvents = [];
    this.lastMatchedPaylines = [];
    this.victory = false;

    const defaultIds = [
      'goblin', 'iron_knight', 'goblin',
      'chest', 'fireball', 'powder_keg',
      'goblin', 'chest', 'goblin',
    ];
    this.grid = this._buildGridCells(defaultIds);

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1,
      devourStacks: 0,
      chainSynergyMultiplier: 1,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: 'READY TO SPIN (拉杆喂食巨口)',
      triggeredSynergies: [],
      settlementDurationMs: 1,
    });
  }

  /**
   * Sanitizes any array of symbol IDs or cell objects into an array of 9 valid symbol IDs.
   * Replaces unknown/null entries with `'goblin'` and pads `< 9` length with `'goblin'`.
   * @param {Array<any>} arr
   * @returns {string[]}
   */
  _sanitizeSymbolIds(arr) {
    const raw = Array.isArray(arr) ? arr : [];
    const result = [];
    for (let i = 0; i < 9; i++) {
      const item = raw[i];
      const candidateId =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object'
            ? item.symbolId || item.id
            : null;
      result.push(candidateId && SYMBOL_MAP[candidateId] ? candidateId : 'goblin');
    }
    return result;
  }

  /**
   * Builds 9 structured cell state objects from 9 canonical symbol IDs.
   * @param {string[]} symbolIds
   */
  _buildGridCells(symbolIds) {
    const cleanIds = this._sanitizeSymbolIds(symbolIds);
    return cleanIds.map((symId, index) => {
      const meta = SYMBOL_MAP[symId] || SYMBOL_MAP.goblin;
      return {
        index,
        row: Math.floor(index / 3),
        col: index % 3,
        id: meta.id,
        symbolId: meta.id,
        name: meta.name,
        zhName: meta.zhName,
        icon: meta.icon,
        tier: meta.tier,
        basePoints: meta.basePoints,
        indigestion: meta.indigestion,
        isPredator: Boolean(meta.isPredator),
        devoured: false,
        devouredBy: null,
        devourCount: 0,
        bonusPoints: 0,
      };
    });
  }

  setSeed(seed) {
    this.seed = this.prng.setSeed(seed);
    this._forcedNextGrid = null;
    return this.seed;
  }

  reset(options = {}) {
    if (options.seed !== undefined) {
      this.seed = this.prng.setSeed(options.seed);
    } else {
      this.prng.setSeed(this.seed);
    }
    this._initCoreState(options);
    return this.getState();
  }

  forceNextSpin(idsOrMatrix) {
    if (Array.isArray(idsOrMatrix)) {
      const flat = Array.isArray(idsOrMatrix[0]) ? idsOrMatrix.flat() : idsOrMatrix;
      const cleanIds = this._sanitizeSymbolIds(flat);
      this._forcedNextGrid = cleanIds;
      this.grid = this._buildGridCells(cleanIds);
      return this.getState();
    }
    if (idsOrMatrix && typeof idsOrMatrix === 'object') {
      return this.forceState(idsOrMatrix);
    }
    return this.getState();
  }

  forceGridOrCylinder(idsOrMatrix) {
    return this.forceNextSpin(idsOrMatrix);
  }

  forceState(forcedConfig = {}) {
    if (!forcedConfig) return this.getState();
    if (Array.isArray(forcedConfig)) {
      return this.forceNextSpin(forcedConfig);
    }
    if (typeof forcedConfig !== 'object') return this.getState();

    if (forcedConfig.seed !== undefined) {
      this.setSeed(forcedConfig.seed);
    }

    if (forcedConfig.wave !== undefined || forcedConfig.floor !== undefined) {
      const targetWave = Math.max(
        1,
        Math.floor(sanitizeNumber(forcedConfig.wave ?? forcedConfig.floor, this.economy.wave))
      );
      this.economy.wave = targetWave;
      const boss = getBossForWave(targetWave);
      this.enemyName = boss.name;
      if (forcedConfig.enemyMaxHp === undefined && forcedConfig.bossMaxHp === undefined) {
        this.enemyMaxHp = boss.maxHp;
      }
      if (forcedConfig.enemyHp === undefined && forcedConfig.bossHp === undefined) {
        this.enemyHp = boss.maxHp;
      }
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
      this.playerHp = safeClamp(sanitizeNumber(forcedConfig.playerHp, this.playerHp), 0, this.playerMaxHp);
    }

    if (forcedConfig.indigestion !== undefined) {
      this.indigestion = safeClamp(sanitizeNumber(forcedConfig.indigestion, this.indigestion), 0, 100);
    }

    if (forcedConfig.mawArmor !== undefined) {
      this.mawArmor = Math.max(0, sanitizeNumber(forcedConfig.mawArmor, this.mawArmor));
    }

    if (forcedConfig.pullsRemaining !== undefined || forcedConfig.spinsRemaining !== undefined) {
      this.economy.pullsRemaining = Math.max(
        0,
        Math.floor(sanitizeNumber(forcedConfig.pullsRemaining ?? forcedConfig.spinsRemaining, 5))
      );
    }

    if (forcedConfig.pullsUsed !== undefined) {
      this.economy.pullsUsed = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.pullsUsed, 0)));
    }

    if (forcedConfig.gold !== undefined) {
      this.economy.gold = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.gold, this.economy.gold)));
    }

    if (forcedConfig.greedMultiplier !== undefined) {
      this.economy.greedMultiplier = Math.max(
        0.1,
        sanitizeNumber(forcedConfig.greedMultiplier, this.economy.greedMultiplier)
      );
    }

    if (forcedConfig.wheelProbabilities && typeof forcedConfig.wheelProbabilities === 'object') {
      this.wheelProbabilities = normalizeWheelWeights({
        ...this.wheelProbabilities,
        ...forcedConfig.wheelProbabilities,
      });
    }

    const gridArr = forcedConfig.grid || forcedConfig.nextSpin || forcedConfig.forcedGrid;
    if (Array.isArray(gridArr)) {
      this.forceNextSpin(gridArr);
    }

    return this.getState();
  }

  /**
   * Primary Action (`[Space]`): Spins the 3×3 grid, executes `<1000ms` 8-way adjacency Auto-Devour,
   * evaluates 8 paylines + 5 stomach chain reactions + Indigestion/Bile Eruption, and damages Siege Boss.
   * @param {object} [payload={}]
   */
  performPrimaryAction(payload = {}) {
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    consumePull(this.economy);

    // 1. Determine 9 spun symbols (from forced grid or weighted PRNG)
    let spunIds;
    if (Array.isArray(payload?.grid) || Array.isArray(payload?.forcedGrid)) {
      spunIds = this._sanitizeSymbolIds(payload.grid || payload.forcedGrid);
      this._forcedNextGrid = null;
    } else if (Array.isArray(this._forcedNextGrid)) {
      spunIds = this._sanitizeSymbolIds(this._forcedNextGrid);
      this._forcedNextGrid = null;
    } else {
      spunIds = [];
      for (let i = 0; i < 9; i++) {
        const picked = this.prng.pickWeighted(this.wheelProbabilities);
        const symId = typeof picked === 'string' ? picked : picked?.id || 'goblin';
        spunIds.push(SYMBOL_MAP[symId] ? symId : 'goblin');
      }
    }

    if (this.sound) {
      this.sound.playReelClack(0, 3);
      this.sound.playReelClack(1, 3);
      this.sound.playReelClack(2, 3);
    }

    this.grid = this._buildGridCells(spunIds);

    // Count initial ingredients before adjacency predation
    const initialCounts = {};
    for (const sym of SYMBOLS) {
      initialCounts[sym.id] = 0;
    }
    for (const cell of this.grid) {
      initialCounts[cell.symbolId] = (initialCounts[cell.symbolId] || 0) + 1;
    }

    // 2. Evaluate 8 Paylines on the 3×3 Grid
    const matchedPaylines = [];
    for (const line of PAYLINES) {
      const [a, b, c] = line.cells;
      const symA = this.grid[a].symbolId;
      const symB = this.grid[b].symbolId;
      const symC = this.grid[c].symbolId;

      if (symA === symB && symB === symC) {
        const symMeta = SYMBOL_MAP[symA] || SYMBOL_MAP.goblin;
        matchedPaylines.push({
          id: line.id,
          name: line.name,
          symbolId: symA,
          cells: [...line.cells],
          matchCount: 3,
          weight: Number((line.weight * (1 + symMeta.tier * 0.25)).toFixed(3)),
        });
      }
    }
    this.lastMatchedPaylines = matchedPaylines;
    let lineMultiplier = calculateLineMultiplier(matchedPaylines);

    // 3. Execute <1000ms 8-Way Adjacency Auto-Devour (Tier 4 -> Tier 3 -> Tier 2)
    const predators = this.grid
      .filter((cell) => cell.isPredator)
      .sort((a, b) => {
        if (b.tier !== a.tier) return b.tier - a.tier;
        if (a.index === 4) return -1;
        if (b.index === 4) return 1;
        return a.index - b.index;
      });

    const devourEvents = [];
    let devourStacks = 0;

    for (const predator of predators) {
      if (predator.devoured) continue;
      const neighborIndices = ADJACENCY_MAP[predator.index] || [];

      for (const nIdx of neighborIndices) {
        const prey = this.grid[nIdx];
        if (!prey || prey.devoured) continue;

        // Strictly lower-tier predation (prevents equal-tier recursion and respects non-predator herbs)
        if (prey.tier < predator.tier) {
          prey.devoured = true;
          prey.devouredBy = predator.index;
          predator.devourCount += 1;

          const preyMeta = SYMBOL_MAP[prey.symbolId] || SYMBOL_MAP.goblin;
          const predMeta = SYMBOL_MAP[predator.symbolId] || SYMBOL_MAP.iron_knight;

          const stacksGained =
            1 +
            (preyMeta.devourExtraStacks ? 1 : 0) +
            (predMeta.devourExtraStacks ? 1 : 0);
          devourStacks += stacksGained;

          const bonusPts = prey.basePoints + (preyMeta.devourBonusPoints || 0);
          predator.bonusPoints += bonusPts;

          if (prey.symbolId === 'chest') {
            this.economy.gold += preyMeta.devourGold || 25;
          }

          devourEvents.push({
            step: devourEvents.length + 1,
            fromCell: prey.index,
            toCell: predator.index,
            preyId: prey.symbolId,
            predatorId: predator.symbolId,
            tier: predator.tier,
            stacksGained,
            bonusPoints: bonusPts,
          });

          if (this.sound) {
            this.sound.playDevourCrunch(devourEvents.length, predator.tier);
            this.sound.playComboChime(devourEvents.length - 1);
          }
        }
      }
    }

    if (devourEvents.length > 0 && this.economy.bonusDevourStacks > 0) {
      devourStacks += this.economy.bonusDevourStacks;
    }
    this.lastDevourEvents = devourEvents;
    this.totalRunDevoured += devourEvents.length;

    // 4. Apply Direct Ingredient Feeding Effects into Central Abyssal Maw
    if (initialCounts.chest > 0) {
      this.economy.gold += initialCounts.chest * (SYMBOL_MAP.chest.spawnGold || 12);
    }
    if (initialCounts.iron_knight > 0) {
      this.mawArmor += initialCounts.iron_knight * (SYMBOL_MAP.iron_knight.armorGain || 30);
    }
    if (initialCounts.digestive_herb > 0) {
      this.mawBaseAttackBonus +=
        initialCounts.digestive_herb * (SYMBOL_MAP.digestive_herb.mawAttackBoost || 12);
      if (matchedPaylines.length > 0) {
        lineMultiplier = Number(
          (lineMultiplier + initialCounts.digestive_herb * 0.5).toFixed(4)
        );
      }
    }

    // 5. Evaluate All 5 Stomach Chain Reactions (Multiplicative Stacking)
    let chainSynergyMultiplier = Math.max(1.0, sanitizeNumber(this.economy.chainMultBonus, 1.0));
    const triggeredSynergies = [];
    const comboLabels = [];
    let synergyIndigestionDelta = 0;

    // Chain Reaction 1: Fireball + Powder Keg Internal Detonation
    if (initialCounts.fireball >= 1 && initialCounts.powder_keg >= 1) {
      const extraPyro = Math.max(0, initialCounts.fireball + initialCounts.powder_keg - 2);
      const pyroMult = Math.min(12.0, 6.0 + 2.0 * extraPyro);
      chainSynergyMultiplier = Number((chainSynergyMultiplier * pyroMult).toFixed(4));
      synergyIndigestionDelta -= 15;
      triggeredSynergies.push('fireball_powder_keg (🔥 肚内连锁爆炸: Fireball + Powder Keg Detonation)');
      comboLabels.push('🔥 肚内连锁大爆炸');
      this.sound?.playChainExplosion(3);
    }

    // Chain Reaction 2: 3× Iron Knights Fortress & Thorns Volley
    if (initialCounts.iron_knight >= 3) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 4.5).toFixed(4));
      if (this.mawArmor < 120) {
        this.mawArmor = 120;
      } else {
        this.mawArmor += 30;
      }
      triggeredSynergies.push('triple_iron_knights (🛡️ 铁甲反伤风暴: 3x Iron Knights Fortress)');
      comboLabels.push('🛡️ 重甲反伤风暴');
    }

    // Chain Reaction 3: Hero Banquet (hero_berserker + goblin/chest)
    if (
      initialCounts.hero_berserker >= 1 &&
      (initialCounts.goblin >= 1 || initialCounts.chest >= 1)
    ) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 3.5).toFixed(4));
      this.economy.gold += 50;
      if (devourEvents.length > 0) {
        devourStacks += 3;
      }
      triggeredSynergies.push('hero_banquet (🍖 勇者饕餮盛宴: Hero Banquet)');
      comboLabels.push('🍖 勇者饕餮盛宴');
    }

    // Chain Reaction 4: Curse Transmutation (abyss_apostle + curse_skull)
    const hasCurseTransmutation =
      initialCounts.abyss_apostle >= 1 && initialCounts.curse_skull >= 1;
    if (hasCurseTransmutation) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 8.0).toFixed(4));
      synergyIndigestionDelta -= 25;
      triggeredSynergies.push('curse_transmutation (☠️ 剧毒化魔炼成: Abyss Curse Transmutation)');
      comboLabels.push('☠️ 剧毒化魔炼成');
    }

    // Chain Reaction 5: Full-Board Gluttony (>= 6 devourStacks or >= 5 devoured prey)
    if (devourStacks >= 6 || devourEvents.length >= 5) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 10.0).toFixed(4));
      this.mawLevel += 1;
      this.mawBaseAttackBonus += 25;
      triggeredSynergies.push('full_board_gluttony (🌌 满盘暴食饕餮吞天: Full-Board Gluttony)');
      comboLabels.push('🌌 饕餮吞天');
    }

    // 6. Update Indigestion Meter (0..100) & Evaluate Bile Eruption (>= 100)
    let rawIndigestionGain = synergyIndigestionDelta;
    for (const cell of this.grid) {
      if (cell.symbolId === 'curse_skull' && hasCurseTransmutation) {
        continue;
      }
      rawIndigestionGain += cell.indigestion;
    }

    const nextIndigestion = this.indigestion + rawIndigestionGain;
    if (nextIndigestion >= 100) {
      this.indigestion = 30;
      const bileMult = this.economy.acidRefluxOverdrive ? 15.0 : 3.0;
      chainSynergyMultiplier = Number((chainSynergyMultiplier * bileMult).toFixed(4));
      this.mawArmor = Math.max(0, this.mawArmor - 25);
      triggeredSynergies.push('bile_eruption (🤮 消化不良酸液喷发: Acid Bile Eruption)');
      comboLabels.push('🤮 酸液超载喷发');
      this.sound?.playChainExplosion(2);
    } else {
      this.indigestion = safeClamp(Math.round(nextIndigestion), 0, 100);
    }

    // 7. Compute Exponential Damage Breakdown via ScoreFormula.js
    let gridPointsSum = 0;
    for (const cell of this.grid) {
      gridPointsSum += cell.basePoints + cell.bonusPoints;
    }
    const basePoints = Math.max(
      10,
      Math.floor(gridPointsSum + this.mawBaseAttackBonus + this.mawArmor * 0.5)
    );

    const rawSettlementMs = Math.min(890, 360 + devourEvents.length * 42 + triggeredSynergies.length * 35);
    const settlementResult = this.flowTracker.completeSettlement(rawSettlementMs);

    const comboName =
      comboLabels.length > 0
        ? comboLabels.join(' + ')
        : matchedPaylines.length > 0
          ? `${matchedPaylines.length}连线巨口齐射 (${matchedPaylines[0].name})`
          : devourEvents.length > 0
            ? `深渊吞噬弹幕 (${devourStacks}层吞噬)`
            : '深渊巨口基础啃噬 (Abyssal Maw Bite)';

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints,
      lineMultiplier,
      devourStacks,
      totalRunDevoured: this.totalRunDevoured,
      chainSynergyMultiplier,
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs: settlementResult.effectiveDurationMs,
    });

    // 8. Apply Damage to Siege Boss & Settle Wave Clear
    this.enemyHp = Math.max(0, this.enemyHp - this.lastTurnBreakdown.totalDamage);

    if (this.enemyHp <= 0) {
      const clearedWave = this.economy.wave;
      settleWaveClear(this.economy, this.economy.pullsRemaining, clearedWave);

      if (this.economy.wave <= BOSSES.length) {
        const nextBoss = getBossForWave(this.economy.wave);
        this.enemyName = nextBoss.name;
        this.enemyMaxHp = nextBoss.maxHp;
        this.enemyHp = nextBoss.maxHp;
      } else {
        this.economy.wave = BOSSES.length;
        this.victory = true;
        this.enemyHp = 0;
      }

      this.bus?.emit('wave:clear', {
        waveCleared: clearedWave,
        nextWave: this.economy.wave,
        settlement: this.economy.lastSettlement,
      });
    }

    this.flowTracker.completeTurn();
    this.bus?.emit('spin:settled', {
      schemeId: this.id,
      breakdown: this.lastTurnBreakdown,
      devourEvents: this.lastDevourEvents,
      indigestion: this.indigestion,
    });

    return this.getState();
  }

  /**
   * Secondary Action: Modifies Wheel Probabilities (`boost`, `banish`, or `preset` switching).
   * @param {object} [payload={}]
   */
  performSecondaryAction(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return this.getState();
    }

    const presetName = payload.preset || (payload.action === 'preset' ? payload.presetId || payload.id : null);
    if (presetName) {
      if (WHEEL_PRESETS[presetName]) {
        this.activePreset = presetName;
        this.wheelProbabilities = normalizeWheelWeights(WHEEL_PRESETS[presetName]);
      }
      return this.getState();
    }

    const actionType = String(payload.action || payload.type || 'boost').toLowerCase();
    const symbolId = payload.symbolId || payload.id;

    if (!symbolId || !SYMBOL_MAP[symbolId]) {
      return this.getState();
    }

    const raw = { ...this.wheelProbabilities };
    const delta = Math.max(1, sanitizeNumber(payload.delta, actionType === 'banish' ? 10 : 15));

    if (actionType === 'banish' || actionType === 'decrease') {
      raw[symbolId] = Math.max(0, (raw[symbolId] || 0) - delta);
    } else if (actionType === 'boost' || actionType === 'increase') {
      raw[symbolId] = Math.min(1000, (raw[symbolId] || 0) + delta);
    }

    this.activePreset = 'custom';
    this.wheelProbabilities = normalizeWheelWeights(raw);
    return this.getState();
  }

  step(dtMs = 16.67) {
    return this.getState();
  }

  getState() {
    return {
      schemeId: this.id,
      id: this.id,
      seed: this.prng.getSeed(),
      wave: this.economy.wave,
      floor: this.economy.wave,
      maxWaves: BOSSES.length,
      gold: this.economy.gold,
      interestRate: this.economy.interestRate,
      greedMultiplier: this.economy.greedMultiplier,
      pullsRemaining: this.economy.pullsRemaining,
      pullsUsed: this.economy.pullsUsed,
      maxPullsPerWave: this.economy.maxPullsPerWave,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      enemyName: this.enemyName,
      enemyHp: this.enemyHp,
      enemyMaxHp: this.enemyMaxHp,
      indigestion: this.indigestion,
      mawArmor: this.mawArmor,
      mawLevel: this.mawLevel,
      mawBaseAttackBonus: this.mawBaseAttackBonus,
      totalRunDevoured: this.totalRunDevoured,
      wheelProbabilities: { ...this.wheelProbabilities },
      activePreset: this.activePreset,
      grid: this.grid.map((cell) => ({ ...cell })),
      devourEvents: this.lastDevourEvents.map((e) => ({ ...e })),
      matchedPaylines: this.lastMatchedPaylines.map((p) => ({ ...p })),
      lastTurnBreakdown: {
        ...this.lastTurnBreakdown,
        triggeredSynergies: [...(this.lastTurnBreakdown.triggeredSynergies || [])],
      },
      lastFormula: {
        ...this.lastTurnBreakdown,
        triggeredSynergies: [...(this.lastTurnBreakdown.triggeredSynergies || [])],
      },
      relics: [...(this.economy.relics || [])],
      lastSettlement: this.economy.lastSettlement ? { ...this.economy.lastSettlement } : null,
      victory: this.victory,
    };
  }
}

export function createDevourReelsEngine(options = {}) {
  return new DevourReelsEngine(options);
}

export default DevourReelsEngine;
