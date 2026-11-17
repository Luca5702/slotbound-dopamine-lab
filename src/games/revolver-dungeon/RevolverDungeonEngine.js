/**
 * Scheme 2: 《左轮地牢》(Revolver Dungeon) Pure Deterministic Game Engine (`F-S2-01`, `F-S2-02`, `F-S2-03`, `F-R2-04`)
 * Zero DOM dependencies — runs in both Browser and Node.js (`node --test`).
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateDevourMultiplier, calculateSpinDamage } from '../../core/ScoreFormula.js';
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
  BULLET_MAP,
  LOADABLE_BULLET_WEIGHTS,
  BOSSES,
  getBossForFloor,
} from './config.js';

export class RevolverDungeonEngine {
  constructor(options = {}) {
    this.id = 'revolver-dungeon';
    this.schemeId = 'revolver-dungeon';
    this.seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 12345;
    this.prng = createPRNG(this.seed);
    this.shopPrng = createPRNG((this.seed ^ 0x5a5a5a5a) >>> 0 || 54321);
    this.bus = options.bus || createEventBus();
    this.flowTracker = options.flowTracker || createFlowTracker({ bus: this.bus });
    this.sound = options.sound || null;

    this._initCoreState(options);
  }

  _initCoreState(options = {}) {
    const initialFloor = Math.max(1, Math.floor(sanitizeNumber(options.floor ?? options.wave, 1)));
    const boss = getBossForFloor(initialFloor);

    this.economy = createEconomyState({
      wave: initialFloor,
      gold: sanitizeNumber(options.gold, 100),
      baseWaveGold: 45,
      maxPullsPerWave: 5,
      pullsRemaining: sanitizeNumber(options.pullsRemaining, 5),
      greedMultiplier: sanitizeNumber(options.greedMultiplier, 1.0),
    });

    this.playerHp = safeClamp(sanitizeNumber(options.playerHp, 100), 0, 100);
    this.playerMaxHp = 100;

    this.enemyName = boss.name;
    this.enemyMaxHp = Math.max(1, sanitizeNumber(options.enemyMaxHp ?? options.enemyHp, boss.maxHp));
    this.enemyHp = Math.max(0, sanitizeNumber(options.enemyHp, this.enemyMaxHp));

    this.activeChamberIndex = safeClamp(Math.floor(sanitizeNumber(options.activeChamberIndex, 0)), 0, 5);
    this._forcedChamberIndex = null;
    this._forcedBackfire = undefined;

    this.selectedChamberIndex = null;
    this._lastBeltLoaded = null;

    this.gritMultiplier = 1.0;
    this.nextShotMultiplier = 1.0;
    this.bloodRageActive = false;
    this.totalRunDevoured = 0;
    this.lastDevourEvents = [];
    this.victory = Boolean(options.victory ?? false);
    this.gameOver = Boolean(options.gameOver ?? false);
    this.endlessMode = Boolean(options.endlessMode ?? initialFloor > BOSSES.length);
    this.economy.endlessMode = this.endlessMode;

    const initialBulletIds = Array.isArray(options.chambers)
      ? options.chambers
      : ['lead_bullet', 'vampire_bullet', 'empty', 'lead_bullet', 'empty', 'scatter_bullet'];
    this.chambers = this._buildChambers(initialBulletIds);
    this.ammoBelt = this._generateAmmoBelt();

    this.backfireRisk = 0;
    this.hitOdds = 0;
    this.chainOdds = 0;
    this._recalculateOdds();

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1,
      devourStacks: 0,
      chainSynergyMultiplier: 1,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: 'READY TO SPIN & FIRE (旋转弹巢并开火)',
      triggeredSynergies: [],
      settlementDurationMs: 1,
    });
  }

  _rollShopBulletObject(slotIndex = 0) {
    const picked = this.shopPrng.pickWeighted(LOADABLE_BULLET_WEIGHTS);
    const id = typeof picked === 'string' && BULLET_MAP[picked] ? picked : 'lead_bullet';
    const meta = BULLET_MAP[id] || BULLET_MAP.lead_bullet;
    return {
      slotIndex,
      id: meta.id,
      bulletId: meta.id,
      name: meta.name,
      zhName: meta.zhName,
      icon: meta.icon,
      tier: meta.tier,
      basePoints: meta.basePoints,
      mult: meta.mult,
      cost: Math.max(10, sanitizeNumber(meta.cost, 20)),
    };
  }

  _generateAmmoBelt() {
    const belt = [];
    for (let i = 0; i < 3; i++) {
      belt.push(this._rollShopBulletObject(i));
    }
    return belt;
  }

  _createChamberObject(index, bulletIdOrObj) {
    const rawId =
      typeof bulletIdOrObj === 'string'
        ? bulletIdOrObj
        : bulletIdOrObj && typeof bulletIdOrObj === 'object'
          ? bulletIdOrObj.bulletId || bulletIdOrObj.id
          : 'empty';
    const meta = BULLET_MAP[rawId] || BULLET_MAP.empty;
    const prevStacks =
      bulletIdOrObj && typeof bulletIdOrObj === 'object' && bulletIdOrObj.id === meta.id
        ? Math.max(0, sanitizeNumber(bulletIdOrObj.devourStacks, 0))
        : 0;
    const prevBonus =
      bulletIdOrObj && typeof bulletIdOrObj === 'object' && bulletIdOrObj.id === meta.id
        ? Math.max(0, sanitizeNumber(bulletIdOrObj.bonusPoints, 0))
        : 0;

    return {
      index,
      id: meta.id,
      bulletId: meta.id,
      name: meta.name,
      zhName: meta.zhName,
      icon: meta.icon,
      tier: meta.tier,
      basePoints: meta.basePoints,
      mult: meta.mult,
      cost: meta.cost || 0,
      devourStacks: prevStacks,
      bonusPoints: prevBonus,
    };
  }

  _buildChambers(arr) {
    const raw = Array.isArray(arr) ? arr : [];
    const chambers = [];
    for (let i = 0; i < 6; i++) {
      chambers.push(this._createChamberObject(i, raw[i] ?? 'empty'));
    }
    return chambers;
  }

  /**
   * Synchronously updates Russian Roulette odds (`hitOdds`, `chainOdds`, `backfireRisk`).
   */
  _recalculateOdds() {
    let nonEmptyCount = 0;
    let demonCount = 0;
    let hasPowder = false;
    let hasFuse = false;
    let hasHammer = false;
    let chainCapable = 0;

    for (const c of this.chambers) {
      const id = c?.id || 'empty';
      if (id !== 'empty') nonEmptyCount += 1;
      if (id === 'demon_bullet') demonCount += 1;
      if (id === 'powder_charge') hasPowder = true;
      if (id === 'fuse_cord') hasFuse = true;
      if (id === 'heavy_hammer') hasHammer = true;
      if (['scatter_bullet', 'fuse_cord', 'powder_charge', 'parasite_bullet'].includes(id)) {
        chainCapable += 1;
      }
    }

    this.hitOdds = Number(((nonEmptyCount / 6) * 100).toFixed(1));
    this.hitRate = this.hitOdds;
    this.chainOdds =
      hasPowder && hasFuse && hasHammer
        ? 100
        : Number(((chainCapable / 6) * 100).toFixed(1));
    this.chainRate = this.chainOdds;
    this.backfireRisk =
      demonCount === 0
        ? 0
        : safeClamp(Number(((demonCount * 25) / 6).toFixed(2)), 0, 100);
  }

  setSeed(seed) {
    this.seed = this.prng.setSeed(seed);
    this.shopPrng.setSeed((this.seed ^ 0x5a5a5a5a) >>> 0 || 54321);
    this._forcedChamberIndex = null;
    this._forcedBackfire = undefined;
    return this.seed;
  }

  reset(options = {}) {
    if (options.seed !== undefined) {
      this.seed = this.prng.setSeed(options.seed);
      this.shopPrng.setSeed((this.seed ^ 0x5a5a5a5a) >>> 0 || 54321);
    } else {
      this.prng.setSeed(this.seed);
      this.shopPrng.setSeed((this.seed ^ 0x5a5a5a5a) >>> 0 || 54321);
    }
    this._initCoreState(options);
    return this.getState();
  }

  forceNextSpin(chambersOrConfig) {
    if (Array.isArray(chambersOrConfig)) {
      this.chambers = this._buildChambers(chambersOrConfig);
      this._lastBeltLoaded = null;
      this._recalculateOdds();
      return this.getState();
    }
    if (chambersOrConfig && typeof chambersOrConfig === 'object') {
      return this.forceState(chambersOrConfig);
    }
    return this.getState();
  }

  forceGridOrCylinder(chambersOrConfig) {
    return this.forceNextSpin(chambersOrConfig);
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
      const targetFloor = Math.max(
        1,
        Math.floor(sanitizeNumber(forcedConfig.floor ?? forcedConfig.wave, this.economy.wave))
      );
      this.economy.wave = targetFloor;
      const boss = getBossForFloor(targetFloor);
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

    if (forcedConfig.gritMultiplier !== undefined) {
      this.gritMultiplier = Math.max(1.0, sanitizeNumber(forcedConfig.gritMultiplier, 1.0));
      this.nextShotMultiplier = this.gritMultiplier;
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

    if (forcedConfig.activeChamberIndex !== undefined) {
      this.activeChamberIndex = safeClamp(
        Math.floor(sanitizeNumber(forcedConfig.activeChamberIndex, 0)),
        0,
        5
      );
    }

    if (
      forcedConfig.forcedChamberIndex !== undefined ||
      forcedConfig.targetChamber !== undefined
    ) {
      const idx = Math.floor(
        sanitizeNumber(forcedConfig.forcedChamberIndex ?? forcedConfig.targetChamber, 0)
      );
      this._forcedChamberIndex = safeClamp(idx, 0, 5);
      this.activeChamberIndex = this._forcedChamberIndex;
    }

    if (forcedConfig.forceBackfire !== undefined) {
      this._forcedBackfire = forcedConfig.forceBackfire;
    }

    const chamberArr = forcedConfig.chambers || forcedConfig.grid || forcedConfig.nextSpin;
    if (Array.isArray(chamberArr)) {
      this.chambers = this._buildChambers(chamberArr);
      this._lastBeltLoaded = null;
    }

    this._recalculateOdds();
    return this.getState();
  }

  /**
   * Targets a specific chamber (`#0..#5`) for tactical ammo belt loading (`T6-25`).
   * Supports both `(Click Chamber -> Click Belt Slot)` and `(Click Belt Slot -> Click Chamber)`.
   * @param {number} chamberIndex
   */
  selectChamber(chamberIndex) {
    const idx = safeClamp(Math.floor(sanitizeNumber(chamberIndex, 0)), 0, 5);
    this.selectedChamberIndex = idx;

    // If a belt slot was just loaded into the default chamber (#0) before clicking Chamber #idx,
    // relocate that newly bought bullet into Chamber #idx so both click orders work seamlessly.
    if (
      this._lastBeltLoaded &&
      this._lastBeltLoaded.chamberIndex !== idx &&
      this.chambers[idx]?.id === 'empty' &&
      this.chambers[this._lastBeltLoaded.chamberIndex]?.id === this._lastBeltLoaded.bulletId
    ) {
      const movedBulletId = this._lastBeltLoaded.bulletId;
      const oldIdx = this._lastBeltLoaded.chamberIndex;
      this.chambers[oldIdx] = this._createChamberObject(oldIdx, 'empty');
      this.chambers[idx] = this._createChamberObject(idx, movedBulletId);
      this._lastBeltLoaded = null;
      this.sound?.playReelClack(idx, 6);
      this._recalculateOdds();
    }

    return this.getState();
  }

  /**
   * Purchases a bullet from the 3-Bullet Tactical Ammo Belt (`slotIndex: 0..2`) and loads it into
   * the targeted chamber (`selectedChamberIndex` or first empty chamber) (`T6-25`).
   * @param {number} [slotIndex=0]
   * @param {number|null} [targetChamberIndex=null]
   */
  buyAmmoBeltSlot(slotIndex = 0, targetChamberIndex = null) {
    const sIdx = safeClamp(Math.floor(sanitizeNumber(slotIndex, 0)), 0, 2);
    if (!Array.isArray(this.ammoBelt) || this.ammoBelt.length < 3) {
      this.ammoBelt = this._generateAmmoBelt();
    }
    const slot = this.ammoBelt[sIdx] || this._rollShopBulletObject(sIdx);
    const bulletCost = Math.max(10, sanitizeNumber(slot.cost, 20));

    if (this.economy.gold <= 0) {
      return this.getState();
    }
    const deductAmount = Math.min(this.economy.gold, bulletCost);
    spendEconomyGold(this.economy, deductAmount);

    let targetIdx = -1;
    let hadExplicitTarget = false;
    if (Number.isInteger(targetChamberIndex) && targetChamberIndex >= 0 && targetChamberIndex < 6) {
      targetIdx = targetChamberIndex;
      hadExplicitTarget = true;
    } else if (
      Number.isInteger(this.selectedChamberIndex) &&
      this.selectedChamberIndex >= 0 &&
      this.selectedChamberIndex < 6
    ) {
      targetIdx = this.selectedChamberIndex;
      hadExplicitTarget = true;
    } else {
      targetIdx = this.chambers.findIndex((c) => c.id === 'empty');
      if (targetIdx === -1) {
        let minTier = Infinity;
        let minIdx = 0;
        for (let i = 0; i < 6; i++) {
          if (this.chambers[i].tier < minTier) {
            minTier = this.chambers[i].tier;
            minIdx = i;
          }
        }
        targetIdx = minIdx;
      }
    }

    this.chambers[targetIdx] = this._createChamberObject(targetIdx, slot.bulletId);
    this.ammoBelt[sIdx] = this._rollShopBulletObject(sIdx);
    this._lastBeltLoaded = hadExplicitTarget
      ? null
      : { chamberIndex: targetIdx, bulletId: slot.bulletId };

    this.sound?.playReelClack(targetIdx, 6);
    this._recalculateOdds();

    this.bus?.emit('chamber:loaded', {
      chamberIndex: targetIdx,
      bulletId: slot.bulletId,
      backfireRisk: this.backfireRisk,
      gold: this.economy.gold,
    });

    return this.getState();
  }

  /**
   * Explicit 3-Card Relic Draft selection (`relic-pick-0..2`).
   * @param {string|null} relicId
   */
  pickRelic(relicId = null) {
    resolvePendingRelicDraft(this.economy, relicId);
    return this.getState();
  }

  /**
   * Transitions from Floor 8 Victory into Floor 9+ Endless Mode (`btn-endless-mode`).
   */
  enterEndless() {
    const res = enterEndlessMode(this.economy, BOSSES[BOSSES.length - 1].maxHp);
    this.endlessMode = true;
    this.victory = false;
    this.gameOver = false;
    const nextBoss = getBossForFloor(this.economy.wave);
    this.enemyName = nextBoss.name;
    this.enemyMaxHp = res.nextBossHp;
    this.enemyHp = res.nextBossHp;
    return this.getState();
  }

  /**
   * Button 2 (`[R]`): Load New Bullet into the 6-chamber cylinder without consuming a pull.
   * Also routes Tactical Ammo Belt & Chamber Target actions.
   * @param {object|string} [payload={}]
   */
  performSecondaryAction(payload = {}) {
    if (payload && typeof payload === 'object') {
      const actionType = String(payload.action || payload.type || '').toLowerCase();
      if (actionType === 'select_chamber' || actionType === 'target_chamber') {
        return this.selectChamber(payload.chamberIndex ?? payload.index ?? 0);
      }
      if (actionType === 'buy_ammo' || actionType === 'select_ammo' || payload.ammoIndex !== undefined) {
        return this.buyAmmoBeltSlot(
          payload.ammoIndex ?? payload.slotIndex ?? 0,
          payload.chamberIndex ?? null
        );
      }
      if (actionType === 'pick_relic') {
        return this.pickRelic(payload.relicId || payload.id);
      }
      if (actionType === 'enter_endless') {
        return this.enterEndless();
      }
    }

    const candidateId =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object'
          ? payload.bulletId || payload.id
          : null;

    let bulletId;
    if (candidateId && BULLET_MAP[candidateId] && candidateId !== 'empty') {
      bulletId = candidateId;
    } else {
      const picked = this.prng.pickWeighted(LOADABLE_BULLET_WEIGHTS);
      bulletId = typeof picked === 'string' && BULLET_MAP[picked] ? picked : 'lead_bullet';
    }

    let targetIdx = -1;
    if (
      payload &&
      typeof payload === 'object' &&
      Number.isInteger(payload.chamberIndex) &&
      payload.chamberIndex >= 0 &&
      payload.chamberIndex < 6
    ) {
      targetIdx = payload.chamberIndex;
    } else if (
      Number.isInteger(this.selectedChamberIndex) &&
      this.selectedChamberIndex >= 0 &&
      this.selectedChamberIndex < 6 &&
      this.chambers[this.selectedChamberIndex]?.id === 'empty'
    ) {
      targetIdx = this.selectedChamberIndex;
    } else {
      targetIdx = this.chambers.findIndex((c) => c.id === 'empty');
      if (targetIdx === -1) {
        // Cylinder is 6/6 full: replace lowest-tier chamber to keep length strictly at 6
        let minTier = Infinity;
        let minIdx = 0;
        for (let i = 0; i < 6; i++) {
          if (this.chambers[i].tier < minTier) {
            minTier = this.chambers[i].tier;
            minIdx = i;
          }
        }
        targetIdx = minIdx;
      }
    }

    this.chambers[targetIdx] = this._createChamberObject(targetIdx, bulletId);
    this.sound?.playReelClack(targetIdx, 6);
    this._recalculateOdds();

    this.bus?.emit('chamber:loaded', {
      chamberIndex: targetIdx,
      bulletId,
      backfireRisk: this.backfireRisk,
    });

    return this.getState();
  }

  /**
   * Button 1 (`[Space]`): Spin the 6-chamber cylinder and fire!
   * Handles Dry Click Grit, Full Cylinder Dump (`powder_charge + fuse_cord + heavy_hammer`),
   * Parasite circular neighbor devour, Scatter burst, Vampire heal, Demon backfire, and Lone Bullet Roulette.
   * @param {object} [payload={}]
   */
  performPrimaryAction(payload = {}) {
    // Non-blocking Relic Draft auto-advance rule (`PROJECT.md § 6.2`, `T6-31`)
    if (Array.isArray(this.economy.pendingRelicDraft) && this.economy.pendingRelicDraft.length > 0) {
      resolvePendingRelicDraft(this.economy, null);
    }

    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    const wasOvertime = this.economy.pullsRemaining <= 0;
    const currentBoss = getBossForFloor(this.economy.wave);
    consumePull(this.economy);
    this.sound?.playReelClack(0, 6);

    // 1. Select active chamber index (0..5)
    let chosenIdx = null;
    if (
      payload &&
      typeof payload === 'object' &&
      Number.isInteger(payload.targetChamber ?? payload.chamberIndex ?? payload.forcedChamberIndex)
    ) {
      chosenIdx = safeClamp(
        Math.floor(payload.targetChamber ?? payload.chamberIndex ?? payload.forcedChamberIndex),
        0,
        5
      );
      this._forcedChamberIndex = null;
    } else if (Number.isInteger(this._forcedChamberIndex)) {
      chosenIdx = safeClamp(this._forcedChamberIndex, 0, 5);
      this._forcedChamberIndex = null;
    } else {
      chosenIdx = this.prng.nextInt(0, 5);
    }
    this.activeChamberIndex = chosenIdx;

    // 2. Check for Full Cylinder Dump (powder_charge + fuse_cord + heavy_hammer)
    const presentIds = new Set(this.chambers.map((c) => c.id));
    const isFullCylinderDump =
      presentIds.has('powder_charge') &&
      presentIds.has('fuse_cord') &&
      presentIds.has('heavy_hammer');

    const activeChamber =
      this.chambers[this.activeChamberIndex] ||
      this._createChamberObject(this.activeChamberIndex, 'empty');

    // 3. Dry Click Resolution (when landing on 'empty' and not triggering Full Cylinder Dump)
    if (activeChamber.id === 'empty' && !isFullCylinderDump) {
      const rouletteRelicFactor = Math.max(1.0, sanitizeNumber(this.economy.rouletteGritBonus, 1.0));
      this.economy.gold += 15;
      this.gritMultiplier = Number((2.0 * rouletteRelicFactor).toFixed(2));
      this.nextShotMultiplier = this.gritMultiplier;
      this.lastDevourEvents = [];

      const drySynergies = ['russian_roulette_grit (空仓赌命存活)'];

      // Floor 2 Boss (`twin_headed_hound`) dry-click pounce OR Overtime counter-attack
      if (currentBoss.traitCode === 'dry_click_pounce' || this.economy.wave === 2 || wasOvertime) {
        const counterDmg = Math.max(8, sanitizeNumber(currentBoss.counterAttack, 12));
        this.playerHp = safeClamp(this.playerHp - counterDmg, 0, this.playerMaxHp);
        drySynergies.push('boss_counter_attack (首领空仓反扑)');
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
      }

      const settlementObj = this.flowTracker.completeSettlement(210);
      this.lastTurnBreakdown = calculateSpinDamage({
        basePoints: 0,
        lineMultiplier: 1.0,
        devourStacks: 0,
        chainSynergyMultiplier: 1.0,
        greedMultiplier: this.economy.greedMultiplier,
        comboName: '🎲 空仓赌命存活! (Russian Roulette Grit: Next Shot ×2.0 + 15G)',
        triggeredSynergies: drySynergies,
        settlementDurationMs: settlementObj.effectiveDurationMs,
      });

      this._recalculateOdds();
      this.flowTracker.completeTurn();
      return this.getState();
    }

    // 4. Execute Parasite Circular Neighbor Devour (< 400ms non-recursive pass)
    const devourEvents = [];
    let devourStacks = 0;
    let bulletsEaten = 0;

    const parasiteIndices = isFullCylinderDump
      ? this.chambers.filter((c) => c.id === 'parasite_bullet').map((c) => c.index)
      : activeChamber.id === 'parasite_bullet'
        ? [this.activeChamberIndex]
        : [];

    for (const pIdx of parasiteIndices) {
      const parasite = this.chambers[pIdx];
      if (!parasite || parasite.id !== 'parasite_bullet') continue;

      const leftIdx = (pIdx + 5) % 6;
      const rightIdx = (pIdx + 1) % 6;

      for (const nIdx of [leftIdx, rightIdx]) {
        if (nIdx === pIdx) continue;
        const neighbor = this.chambers[nIdx];
        if (!neighbor || neighbor.id === 'empty') continue;

        // Do not eat higher-tier demon_bullet (T2-F12-02)
        if (neighbor.tier > parasite.tier) continue;

        // If equal-tier parasite_bullet, allow at most 1 bite to prevent circular recursion (T2-F12-02, T2-F12-05)
        if (neighbor.id === 'parasite_bullet' && bulletsEaten >= 1) continue;

        // Preserve Full Cylinder Dump trio pieces during Full Dump
        if (
          isFullCylinderDump &&
          ['powder_charge', 'fuse_cord', 'heavy_hammer'].includes(neighbor.id)
        ) {
          continue;
        }

        const eatenId = neighbor.id;
        const eatenTier = neighbor.tier;
        const eatenPts = neighbor.basePoints;

        bulletsEaten += 1;
        devourStacks += 2;
        parasite.devourStacks = (parasite.devourStacks || 0) + 2;
        parasite.bonusPoints = (parasite.bonusPoints || 0) + parasite.basePoints + eatenPts;

        this.chambers[nIdx] = this._createChamberObject(nIdx, 'empty');

        devourEvents.push({
          step: devourEvents.length + 1,
          fromChamber: nIdx,
          toChamber: pIdx,
          preyId: eatenId,
          predatorId: 'parasite_bullet',
          tier: eatenTier,
        });

        if (this.sound) {
          this.sound.playDevourCrunch(devourEvents.length, Math.max(1, eatenTier));
          this.sound.playComboChime(devourEvents.length - 1);
        }
      }
    }

    if (devourEvents.length > 0 && this.economy.bonusDevourStacks > 0) {
      devourStacks += this.economy.bonusDevourStacks;
    }

    this.lastDevourEvents = devourEvents;
    this.totalRunDevoured += bulletsEaten;

    // 5. Determine Fired Chambers & Sympathetic Multi-Chamber Chains
    let firedIndices = [];
    let chainSynergyMultiplier = Math.max(1.0, sanitizeNumber(this.economy.chainMultBonus, 1.0));
    const triggeredSynergies = [];
    const comboLabels = [];

    if (isFullCylinderDump) {
      firedIndices = this.chambers
        .filter((c) => c.id !== 'empty')
        .map((c) => c.index);
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 12.0).toFixed(4));
      triggeredSynergies.push(
        'full_cylinder_dump (💥 火药+引信+重锤：连发清空整个弹巢 Full Cylinder Dump)'
      );
      comboLabels.push('💥 连发清空整个弹巢 / Full Cylinder Dump');

      if (this.sound) {
        this.sound.playGunshot(true);
        for (let step = 0; step < Math.min(6, firedIndices.length); step++) {
          this.sound.playComboChime(step);
        }
        this.sound.playChainExplosion(3);
      }
    } else {
      firedIndices = [this.activeChamberIndex];
      const leftIdx = (this.activeChamberIndex + 5) % 6;
      const rightIdx = (this.activeChamberIndex + 1) % 6;

      if (activeChamber.id === 'scatter_bullet' || activeChamber.id === 'fuse_cord') {
        if (this.chambers[leftIdx].id !== 'empty' && !firedIndices.includes(leftIdx)) {
          firedIndices.push(leftIdx);
        }
        if (this.chambers[rightIdx].id !== 'empty' && !firedIndices.includes(rightIdx)) {
          firedIndices.push(rightIdx);
        }
        if (firedIndices.length > 1) {
          chainSynergyMultiplier = Number(
            (chainSynergyMultiplier * (1.5 + 0.4 * (firedIndices.length - 1))).toFixed(4)
          );
          triggeredSynergies.push('scatter_burst (💥 邻仓协同齐射 Sympathetic Burst)');
          comboLabels.push('💥 邻仓协同齐射');
        }
      } else if (activeChamber.id === 'powder_charge') {
        if (this.chambers[rightIdx].id !== 'empty' && !firedIndices.includes(rightIdx)) {
          firedIndices.push(rightIdx);
        }
        chainSynergyMultiplier = Number((chainSynergyMultiplier * 2.0).toFixed(4));
        triggeredSynergies.push('powder_ignition (🧨 火药增压引燃)');
      }

      this.sound?.playGunshot(
        activeChamber.id === 'heavy_hammer' || activeChamber.id === 'demon_bullet'
      );
    }

    // 6. Evaluate Fired Bullets, Parasite Feast, Vampire Leech, Demon Roulette & Lone Bullet Bonus
    let basePoints = 0;
    let bulletMultSum = 0;
    let firedDemonCount = 0;
    let firedVampireCount = 0;
    let firedArmorPiercing = false;

    for (const idx of firedIndices) {
      const c = this.chambers[idx];
      if (!c || c.id === 'empty') continue;
      basePoints += c.basePoints + (c.bonusPoints || 0);
      bulletMultSum += c.mult;
      if (c.id === 'demon_bullet') firedDemonCount += 1;
      if (c.id === 'vampire_bullet') firedVampireCount += 1;
      if (c.id === 'parasite_bullet' || c.id === 'heavy_hammer') firedArmorPiercing = true;
    }

    if (bulletsEaten >= 2) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 4.0).toFixed(4));
      triggeredSynergies.push('parasite_feast (🐛 寄生暴食双杀 ×4.0)');
      comboLabels.push('🐛 寄生暴食双杀');
    } else if (bulletsEaten === 1) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 2.0).toFixed(4));
      triggeredSynergies.push('parasite_devour (🐛 寄生吞噬 ×2.0)');
      comboLabels.push('🐛 寄生吞噬');
    }

    // Vampire Bullet Healing & Overheal Conversion
    if (firedVampireCount > 0) {
      const healTotal = firedVampireCount * 20;
      const prevHp = this.playerHp;
      this.playerHp = safeClamp(this.playerHp + healTotal, 0, this.playerMaxHp);
      if (prevHp >= this.playerMaxHp) {
        chainSynergyMultiplier = Number((chainSynergyMultiplier * 2.5).toFixed(4));
        triggeredSynergies.push('vampire_overheal (🩸 鲜血大公爵满血暴击 ×2.5)');
        comboLabels.push('🩸 鲜血溢出暴击');
      } else {
        triggeredSynergies.push(`vampire_leech (🩸 猩红吸血回复 +${this.playerHp - prevHp} HP)`);
      }
      if (currentBoss.traitCode === 'vampire_weakness') {
        chainSynergyMultiplier = Number((chainSynergyMultiplier * 1.5).toFixed(4));
      }
    }

    if (currentBoss.traitCode === 'iron_armor' && firedArmorPiercing) {
      chainSynergyMultiplier = Number((chainSynergyMultiplier * 1.25).toFixed(4));
    }

    // Demon Bullet Russian Roulette (25% Backfire Risk + Blood Rage Overclock)
    const totalDemonInCylinder = this.chambers.filter((c) => c.id === 'demon_bullet').length;
    if (firedDemonCount > 0) {
      const forcedBf =
        payload && typeof payload === 'object' && payload.forceBackfire !== undefined
          ? payload.forceBackfire
          : this._forcedBackfire;
      this._forcedBackfire = undefined;

      const didBackfire =
        forcedBf !== undefined ? Boolean(forcedBf) : this.prng.next() < 0.25;
      const rouletteRelicFactor = Math.max(1.0, sanitizeNumber(this.economy.rouletteGritBonus, 1.0));

      if (didBackfire) {
        this.playerHp = safeClamp(this.playerHp - 20, 0, this.playerMaxHp);
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
        this.bloodRageActive = true;
        chainSynergyMultiplier = Number(
          (chainSynergyMultiplier * 3.0 * rouletteRelicFactor).toFixed(4)
        );
        triggeredSynergies.push('demon_backfire_blood_rage (😈 恶魔弹炸膛·血怒爆发 ×3.0)');
        comboLabels.push('😈 恶魔炸膛·血怒爆发');
        this.sound?.playMisfireBackfire();
      } else {
        this.bloodRageActive = false;
        chainSynergyMultiplier = Number(
          (chainSynergyMultiplier * 2.0 * rouletteRelicFactor).toFixed(4)
        );
        triggeredSynergies.push('demon_blood_gambit (😈 恶魔轮盘赌命成功 ×2.0)');
        comboLabels.push('😈 恶魔轮盘暴击');
      }

      if (totalDemonInCylinder > 1) {
        const overclockFactor = 1 + 0.5 * (totalDemonInCylinder - 1);
        chainSynergyMultiplier = Number((chainSynergyMultiplier * overclockFactor).toFixed(4));
        triggeredSynergies.push(`demon_overclock (😈 ${totalDemonInCylinder}发恶魔共鸣 ×${overclockFactor.toFixed(1)})`);
      }

      if (currentBoss.traitCode === 'croupier_double_demon') {
        chainSynergyMultiplier = Number((chainSynergyMultiplier * 2.0).toFixed(4));
      }
    }

    // Lone Bullet Roulette Empty-Chamber Scaling
    const emptyCount = this.chambers.filter((c) => c.id === 'empty').length;
    let emptyBonusFactor = 1 + 0.65 * emptyCount;
    if (emptyCount >= 4) {
      emptyBonusFactor *= 1.5;
      triggeredSynergies.push(`lone_survivor_roulette (🎲 孤胆轮盘 ${emptyCount}空仓加成)`);
      if (emptyCount === 5 && firedDemonCount > 0) {
        emptyBonusFactor *= 2.5;
        comboLabels.push('🎲 绝命赌徒独头恶魔弹');
      }
    }

    // Consume Russian Roulette Grit Bonus (resets after 1 real shot)
    let gritFactor = 1.0;
    if (this.gritMultiplier > 1.0) {
      gritFactor = this.gritMultiplier;
      triggeredSynergies.push(`grit_consumed (🎲 空仓赌徒勇气释放 ×${gritFactor.toFixed(1)})`);
      this.gritMultiplier = 1.0;
      this.nextShotMultiplier = 1.0;
    }

    const lineMultiplier = Number(
      (Math.max(1.0, bulletMultSum) * emptyBonusFactor * gritFactor).toFixed(4)
    );

    const devourStacksMultiplier =
      devourStacks > 0
        ? Math.max(
            Math.pow(2, bulletsEaten),
            calculateDevourMultiplier(devourStacks, this.totalRunDevoured)
          )
        : 1.0;

    // If Full Cylinder Dump triggered, empty all fired chambers after firing and reload 2 starter bullets
    if (isFullCylinderDump) {
      this.chambers = this._buildChambers([
        'lead_bullet',
        'empty',
        'vampire_bullet',
        'empty',
        'empty',
        'empty',
      ]);
    }

    const rawSettlementMs = isFullCylinderDump ? 540 : 340 + devourEvents.length * 60;
    const settlementObj = this.flowTracker.completeSettlement(rawSettlementMs);

    const comboName =
      comboLabels.length > 0
        ? comboLabels.join(' + ')
        : `${activeChamber.zhName || activeChamber.name} 精准击发`;

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: Math.max(10, basePoints),
      lineMultiplier,
      devourStacks,
      devourStacksMultiplier,
      chainSynergyMultiplier,
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs: settlementObj.effectiveDurationMs,
    });

    // 7. Apply Damage to Dungeon Boss & Settle Floor Clear / Overtime Boss Counter-Attack
    this.enemyHp = Math.max(0, this.enemyHp - this.lastTurnBreakdown.totalDamage);

    if (this.enemyHp <= 0) {
      const clearedFloor = this.economy.wave;
      settleWaveClear(this.economy, this.economy.pullsRemaining, clearedFloor);
      this.ammoBelt = this._generateAmmoBelt();
      this.selectedChamberIndex = null;
      this._lastBeltLoaded = null;

      if (clearedFloor === BOSSES.length && !this.endlessMode) {
        this.economy.wave = BOSSES.length;
        this.victory = true;
        this.enemyHp = 0;
        this.economy.pendingRelicDraft = null;
      } else {
        const nextBoss = getBossForFloor(this.economy.wave);
        this.enemyName = nextBoss.name;
        this.enemyMaxHp = nextBoss.maxHp;
        this.enemyHp = nextBoss.maxHp;
        startRelicDraft(this.economy, 3, this.prng);
      }

      this.bus?.emit('wave:clear', {
        floorCleared: clearedFloor,
        nextFloor: this.economy.wave,
        settlement: this.economy.lastSettlement,
        pendingRelicDraft: this.economy.pendingRelicDraft,
      });
    } else if (wasOvertime) {
      const counterDmg = Math.max(10, sanitizeNumber(currentBoss.counterAttack, 16));
      this.playerHp = safeClamp(this.playerHp - counterDmg, 0, this.playerMaxHp);
      if (this.playerHp <= 0) {
        this.playerHp = 0;
        this.gameOver = true;
      }
    }

    this._recalculateOdds();
    this.flowTracker.completeTurn();
    this.bus?.emit('shot:settled', {
      schemeId: this.id,
      activeChamberIndex: this.activeChamberIndex,
      breakdown: this.lastTurnBreakdown,
      playerHp: this.playerHp,
      backfireRisk: this.backfireRisk,
    });

    return this.getState();
  }

  step(dtMs = 16.67) {
    return this.getState();
  }

  getState() {
    const boss = getBossForFloor(this.economy.wave);
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
      activeChamberIndex: this.activeChamberIndex,
      selectedChamberIndex: this.selectedChamberIndex,
      chambers: this.chambers.map((c) => ({ ...c })),
      ammoBelt: (this.ammoBelt || []).map((b) => ({ ...b })),
      backfireRisk: this.backfireRisk,
      hitOdds: this.hitOdds,
      chainOdds: this.chainOdds,
      gritMultiplier: this.gritMultiplier,
      nextShotMultiplier: this.nextShotMultiplier,
      bloodRageActive: this.bloodRageActive,
      totalRunDevoured: this.totalRunDevoured,
      devourEvents: this.lastDevourEvents.map((e) => ({ ...e })),
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

export function createRevolverDungeonEngine(options = {}) {
  return new RevolverDungeonEngine(options);
}

export default RevolverDungeonEngine;
