/**
 * Scheme 1: 《吞噬转轮》(Devour Reels) Pure Deterministic Game Engine (`F-S1-01`, `F-S1-02`, `F-S1-03`, `F-R2-03`)
 * Zero DOM dependencies — runs in both Browser and Node.js (`node --test`).
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateLineMultiplier, calculateSpinDamage } from '../../core/ScoreFormula.js';
import {
  createEconomyState,
  consumePull,
  settleWaveClear,
  startRelicDraft,
  resolvePendingRelicDraft,
  enterEndlessMode,
  spendEconomyGold,
} from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  SYMBOLS,
  SYMBOL_MAP,
  PAYLINES,
  ADJACENCY_MAP,
  DEFAULT_WHEEL_WEIGHTS,
  WHEEL_PRESETS,
  WHEEL_MOD_COSTS,
  MAW_WORKSHOP_ITEMS,
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
    this.relicPrng = createPRNG((this.seed ^ 0x9e3779b9) >>> 0 || 54321);
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
    this.bilePurgeActive = false;

    this.wheelProbabilities = normalizeWheelWeights(options.wheelProbabilities || DEFAULT_WHEEL_WEIGHTS);
    this.activePreset = 'baseline';

    this._forcedNextGrid = null;
    this.lastDevourEvents = [];
    this.lastMatchedPaylines = [];
    this.victory = Boolean(options.victory ?? false);
    this.gameOver = Boolean(options.gameOver ?? false);
    this.endlessMode = Boolean(options.endlessMode ?? initialWave > BOSSES.length);
    this.economy.endlessMode = this.endlessMode;

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

  _applyPendingWheelBoosts() {
    const map = this.economy?.wheelBoostMap;
    if (!map || typeof map !== 'object') return;
    const raw = { ...this.wheelProbabilities };
    let changed = false;
    for (const [symId, delta] of Object.entries(map)) {
      if (SYMBOL_MAP[symId] && Number.isFinite(Number(delta)) && Number(delta) !== 0) {
        raw[symId] = Math.max(0, (raw[symId] || 0) + Number(delta));
        changed = true;
      }
    }
    if (changed) {
      this.wheelProbabilities = normalizeWheelWeights(raw);
      this.economy.wheelBoostMap = {};
    }
  }

  setSeed(seed) {
    this.seed = this.prng.setSeed(seed);
    this.relicPrng = createPRNG((this.seed ^ 0x9e3779b9) >>> 0 || 54321);
    this._forcedNextGrid = null;
    return this.seed;
  }

  reset(options = {}) {
    if (options.seed !== undefined) {
      this.seed = this.prng.setSeed(options.seed);
    } else {
      this.prng.setSeed(this.seed);
    }
    this.relicPrng = createPRNG((this.seed ^ 0x9e3779b9) >>> 0 || 54321);
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
      if (this.playerHp > 0 && forcedConfig.gameOver === undefined) {
        this.gameOver = false;
      }
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

    if (forcedConfig.victory !== undefined) {
      this.victory = Boolean(forcedConfig.victory);
    }

    if (forcedConfig.gameOver !== undefined) {
      this.gameOver = Boolean(forcedConfig.gameOver);
    }

    if (forcedConfig.endlessMode !== undefined) {
      this.endlessMode = Boolean(forcedConfig.endlessMode);
      this.economy.endlessMode = this.endlessMode;
    }

    if (forcedConfig.pendingRelicDraft !== undefined) {
      this.economy.pendingRelicDraft = forcedConfig.pendingRelicDraft;
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
   * Active `[R]` Belch Bile Purge (`indigestion >= 50`):
   * Vents 45 Indigestion, sprays corrosive stomach acid onto the Siege Boss,
   * and supercharges the next spin's chain synergy multiplier (`×2.5`).
   */
  purgeBile() {
    if (this.indigestion < 50) {
      return this.getState();
    }
    this.indigestion = safeClamp(this.indigestion - 45, 0, 100);
    this.bilePurgeActive = true;
    const acidSplash = Math.max(
      250,
      Math.floor((240 + this.mawLevel * 60 + this.mawBaseAttackBonus) * this.economy.greedMultiplier)
    );
    if (this.enemyHp > 1) {
      this.enemyHp = Math.max(1, this.enemyHp - acidSplash);
    }
    this.sound?.playChainExplosion(2);
    this.bus?.emit('maw:bile-purged', {
      indigestion: this.indigestion,
      acidSplash,
      enemyHp: this.enemyHp,
    });
    return this.getState();
  }

  /**
   * Gold-Backed Maw Upgrade Workshop (`buy_herb` 30G, `buy_armor` 40G, `temper_maw` 60G).
   * @param {string} [itemId='buy_herb']
   */
  upgradeMaw(itemId = 'buy_herb') {
    const cleanId = String(itemId || 'buy_herb').toLowerCase();
    const item =
      MAW_WORKSHOP_ITEMS.find(
        (it) =>
          it.id === cleanId ||
          it.action === cleanId ||
          it.testid === cleanId ||
          cleanId.includes(it.id.replace('buy_', ''))
      ) || MAW_WORKSHOP_ITEMS[0];

    const spent = spendEconomyGold(this.economy, item.cost);
    if (!spent.ok) {
      return this.getState();
    }

    if (item.indigestionDelta) {
      this.indigestion = safeClamp(this.indigestion + item.indigestionDelta, 0, 100);
    }
    if (item.attackBonus) {
      this.mawBaseAttackBonus += item.attackBonus;
    }
    if (item.armorBonus) {
      this.mawArmor += item.armorBonus;
    }
    if (item.levelBonus) {
      this.mawLevel += item.levelBonus;
    }
    this.sound?.playComboChime(3);
    this.bus?.emit('maw:upgraded', {
      itemId: item.id,
      gold: this.economy.gold,
      mawLevel: this.mawLevel,
      mawArmor: this.mawArmor,
      indigestion: this.indigestion,
    });
    return this.getState();
  }

  /**
   * Explicit 3-Card Relic Draft selection (`relic-pick-0..2`).
   * @param {string|null} relicId
   */
  pickRelic(relicId = null) {
    resolvePendingRelicDraft(this.economy, relicId);
    this._applyPendingWheelBoosts();
    return this.getState();
  }

  /**
   * Transitions from Wave 8 Victory into Wave 9+ Endless Mode (`btn-endless-mode`).
   */
  enterEndless() {
    const res = enterEndlessMode(this.economy, BOSSES[BOSSES.length - 1].maxHp);
    this.endlessMode = true;
    this.victory = false;
    this.gameOver = false;
    const nextBoss = getBossForWave(this.economy.wave);
    this.enemyName = nextBoss.name;
    this.enemyMaxHp = res.nextBossHp;
    this.enemyHp = res.nextBossHp;
    return this.getState();
  }

  /**
   * Primary Action (`[Space]`): Spins the 3×3 grid, executes `<1000ms` 8-way adjacency Auto-Devour,
   * evaluates 8 paylines + 5 stomach chain reactions + Indigestion/Bile Eruption, and damages Siege Boss.
   * @param {object} [payload={}]
   */
  performPrimaryAction(payload = {}) {
    // Non-blocking Relic Draft auto-advance rule (`PROJECT.md § 6.2`, `T6-31`)
    if (Array.isArray(this.economy.pendingRelicDraft) && this.economy.pendingRelicDraft.length > 0) {
      resolvePendingRelicDraft(this.economy, null);
      this._applyPendingWheelBoosts();
    }

    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    const wasOvertime = this.economy.pullsRemaining <= 0;
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
        const tierFactor = symMeta.tier <= 1 ? 0.45 : 1 + symMeta.tier * 0.25;
        matchedPaylines.push({
          id: line.id,
          name: line.name,
          symbolId: symA,
          cells: [...line.cells],
          matchCount: 3,
          weight: Number((line.weight * tierFactor).toFixed(3)),
        });
      }
    }
    this.lastMatchedPaylines = matchedPaylines;
    let lineMultiplier = calculateLineMultiplier(matchedPaylines);
    if (matchedPaylines.length >= 8 && this.grid.every((c) => c.tier <= 1 && !c.isPredator)) {
      lineMultiplier = Math.min(lineMultiplier, 36);
    }

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
          const stacksGained = 1;
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

    // Consume active [R] Belch Bile Purge buff if primed
    if (this.bilePurgeActive) {
      this.bilePurgeActive = false;
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 3.5).toFixed(4));
      triggeredSynergies.push('belch_bile_purge (主动胃酸超载喷吐 ×3.5)');
      comboLabels.push('主动胃酸超载喷吐');
    }

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
        devourStacks += 1;
      }
      triggeredSynergies.push('hero_banquet (🍖 勇者饕餮盛宴: Hero Banquet)');
      comboLabels.push('🍖 勇者饕餮盛宴');
    }

    // Chain Reaction 4: Curse Transmutation (abyss_apostle + curse_skull)
    const hasCurseTransmutation = devourEvents.some(
      (e) => e.predatorId === 'abyss_apostle' && e.preyId === 'curse_skull'
    );
    if (hasCurseTransmutation) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 8.0).toFixed(4));
      synergyIndigestionDelta -= 25;
      triggeredSynergies.push('curse_transmutation (☠️ 剧毒化魔炼成: Abyss Curse Transmutation)');
      comboLabels.push('☠️ 剧毒化魔炼成');
    }

    // Chain Reaction 5: Full-Board Gluttony (>= 6 devoured prey cells)
    if (devourEvents.length >= 6) {
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

    // 8. Apply Damage to Siege Boss, Execute Boss Traits & Settle Wave Clear / Overtime Strike
    const currentBoss = getBossForWave(this.economy.wave);
    this.enemyHp = Math.max(0, this.enemyHp - this.lastTurnBreakdown.totalDamage);

    if (this.enemyHp <= 0) {
      const clearedWave = this.economy.wave;
      settleWaveClear(this.economy, this.economy.pullsRemaining, clearedWave);

      if ((currentBoss.goldMultiplier || 1) > 1) {
        this.economy.gold += 80;
      }

      if (clearedWave === BOSSES.length && !this.endlessMode) {
        this.economy.wave = BOSSES.length;
        this.victory = true;
        this.enemyHp = 0;
        this.economy.pendingRelicDraft = null;
      } else {
        const nextBoss = getBossForWave(this.economy.wave);
        this.enemyName = nextBoss.name;
        this.enemyMaxHp = nextBoss.maxHp;
        this.enemyHp = nextBoss.maxHp;
        startRelicDraft(this.economy, 3, this.relicPrng);
      }

      this.bus?.emit('wave:clear', {
        waveCleared: clearedWave,
        nextWave: this.economy.wave,
        settlement: this.economy.lastSettlement,
        pendingRelicDraft: this.economy.pendingRelicDraft,
      });
    } else {
      // Surviving Boss executes active trait (e.g., W3 Alchemical Trebuchet +12 Indigestion)
      if (currentBoss.indigestionHazard > 0) {
        this.indigestion = safeClamp(
          Math.min(99, this.indigestion + currentBoss.indigestionHazard),
          0,
          100
        );
      }
      if (currentBoss.armorShred > 0 && !wasOvertime) {
        this.mawArmor = Math.max(0, this.mawArmor - currentBoss.armorShred);
      }

      // Overtime Boss Counter-Attack (`pullsRemaining <= 0` prior to pull & Boss survives)
      if (wasOvertime) {
        const bossStrike = Math.max(10, sanitizeNumber(currentBoss.attack, 25));
        const absorbed = Math.min(this.mawArmor, bossStrike);
        this.mawArmor = Math.max(0, this.mawArmor - absorbed);
        const unblockedDamage = Math.max(0, bossStrike - absorbed);
        this.playerHp = safeClamp(this.playerHp - unblockedDamage, 0, this.playerMaxHp);
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
      }
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
   * Secondary Action:
   *  - Active `[R]` Belch Bile Purge (`action: 'purge_bile'`)
   *  - Maw Upgrade Workshop (`action: 'buy_herb' | 'buy_armor' | 'temper_maw' | 'upgrade_maw'`)
   *  - Post-Wave Relic Draft pick (`action: 'pick_relic'`) & Endless Mode (`action: 'enter_endless'`)
   *  - Gold-Backed Wheel Probability Modder (`boost`: 25G, `banish`: 20G, `preset`: 35G)
   * @param {object} [payload={}]
   */
  performSecondaryAction(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return this.getState();
    }

    const actionType = String(payload.action || payload.type || '').toLowerCase();

    if (actionType === 'purge_bile' || actionType === 'bile_purge' || actionType === 'belch') {
      return this.purgeBile();
    }

    if (
      actionType === 'buy_herb' ||
      actionType === 'buy_armor' ||
      actionType === 'temper_maw' ||
      actionType === 'upgrade_maw' ||
      actionType === 'workshop'
    ) {
      return this.upgradeMaw(payload.itemId || payload.upgradeId || actionType);
    }

    if (actionType === 'pick_relic') {
      return this.pickRelic(payload.relicId || payload.id);
    }

    if (actionType === 'enter_endless') {
      return this.enterEndless();
    }

    const presetName =
      payload.preset || (actionType === 'preset' ? payload.presetId || payload.id : null);
    if (presetName) {
      if (WHEEL_PRESETS[presetName]) {
        if (!payload.free && this.economy.gold > 0) {
          const cost = Math.min(this.economy.gold, WHEEL_MOD_COSTS.preset);
          spendEconomyGold(this.economy, cost);
        }
        this.activePreset = presetName;
        this.wheelProbabilities = normalizeWheelWeights(WHEEL_PRESETS[presetName]);
      }
      return this.getState();
    }

    const modAction = actionType || 'boost';
    const symbolId = payload.symbolId || payload.id;

    if (!symbolId || !SYMBOL_MAP[symbolId]) {
      return this.getState();
    }

    if (!payload.free && this.economy.gold > 0) {
      const targetCost =
        modAction === 'banish' || modAction === 'decrease'
          ? WHEEL_MOD_COSTS.banish
          : WHEEL_MOD_COSTS.boost;
      const cost = Math.min(this.economy.gold, targetCost);
      spendEconomyGold(this.economy, cost);
    }

    const raw = { ...this.wheelProbabilities };
    const delta = Math.max(1, sanitizeNumber(payload.delta, modAction === 'banish' ? 10 : 15));

    if (modAction === 'banish' || modAction === 'decrease') {
      raw[symbolId] = Math.max(0, (raw[symbolId] || 0) - delta);
    } else if (modAction === 'boost' || modAction === 'increase') {
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
    const boss = getBossForWave(this.economy.wave);
    const ownedRelics = Array.isArray(this.economy.relics)
      ? this.economy.relics.map((r) =>
          r && typeof r === 'object' ? { ...r } : { id: String(r), name: String(r) }
        )
      : [];
    const pendingRelicDraft =
      Array.isArray(this.economy.pendingRelicDraft) && this.economy.pendingRelicDraft.length > 0
        ? this.economy.pendingRelicDraft.map((r) => ({ ...r }))
        : null;

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
      boss: {
        ...boss,
        hp: this.enemyHp,
        maxHp: this.enemyMaxHp,
        enemyMaxHp: this.enemyMaxHp,
      },
      indigestion: this.indigestion,
      mawArmor: this.mawArmor,
      mawLevel: this.mawLevel,
      mawBaseAttackBonus: this.mawBaseAttackBonus,
      totalRunDevoured: this.totalRunDevoured,
      bilePurgeActive: this.bilePurgeActive,
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
      ownedRelics,
      pendingRelicDraft,
      lastSettlement: this.economy.lastSettlement ? { ...this.economy.lastSettlement } : null,
      victory: this.victory,
      gameOver: this.gameOver,
      endlessMode: Boolean(this.endlessMode || this.economy.endlessMode),
    };
  }
}

export function createDevourReelsEngine(options = {}) {
  return new DevourReelsEngine(options);
}

export default DevourReelsEngine;
