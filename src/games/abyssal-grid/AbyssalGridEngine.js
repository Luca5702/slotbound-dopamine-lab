/**
 * Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Deterministic Engine (`F-S5-01`, `F-R2-06`)
 * Implements:
 *  - 4×4 Tactical Hold-&-Respin Matrix (16 cells `0..15`)
 *  - Auto-Locking Apex Commanders (`tier >= 2` -> `🔒 HOLD`) + Clickable Manual Cell Lock/Unlock
 *  - `<1000ms` 4-Way Orthogonal Cross Auto-Devour (`Up`, `Down`, `Left`, `Right` without row wrap)
 *  - Shared fodder deduplication (a fodder cell flanked by two Commanders is eaten strictly once)
 *  - 10-Line Row/Col/Diag Bingo Artillery Barrage Evaluator
 *  - Early Fire action (`performSecondaryAction({ action: 'fire' })`) banking unused respins into compound interest on lethal kill
 *  - Wave-Transition Commander Ascension Merge (`T6-28`) reopening unlocked fodder slots on wave clear
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
  startRelicDraft,
  resolvePendingRelicDraft,
  enterEndlessMode,
  getRelicModifiers,
} from '../../core/EconomyEngine.js';
import { createEventBus } from '../../core/EventBus.js';
import { createFlowTracker } from '../../core/FlowTracker.js';
import {
  UNIT_LIST,
  UNIT_MAP,
  SPAWNABLE_UNIT_WEIGHTS,
  ORTHOGONAL_NEIGHBORS,
  BINGO_LINES,
  getBingoLineMultiplier,
  getBossForWave,
} from './config.js';

function sanitizeUnitId(rawId) {
  if (rawId === null || rawId === undefined) return 'skeleton';
  if (typeof rawId === 'object') {
    const candidate = rawId.unitId || rawId.symbolId || rawId.id;
    if (candidate && UNIT_MAP[candidate]) {
      return candidate === 'skeleton_pawn' ? 'skeleton' : candidate;
    }
  }
  const str = String(rawId).trim();
  if (str === 'empty') return 'empty';
  if (str === 'skeleton_pawn') return 'skeleton';
  return UNIT_MAP[str] ? str : 'skeleton';
}

export class AbyssalGridEngine {
  constructor(options = {}) {
    this.id = 'abyssal-grid';
    this.schemeId = 'abyssal-grid';
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
    const boss = getBossForWave(startWave);
    this.currentBoss = boss;
    this.enemyMaxHp = options.enemyMaxHp !== undefined
      ? Math.max(1, sanitizeNumber(options.enemyMaxHp, boss.maxHp))
      : boss.maxHp;
    this.enemyHp = options.enemyHp !== undefined
      ? Math.max(0, sanitizeNumber(options.enemyHp, boss.hp))
      : boss.hp;
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.victory = false;
    this.gameOver = false;

    this.economy = createEconomyState({
      wave: startWave,
      gold: Math.max(0, Math.floor(sanitizeNumber(options.gold, 100))),
      baseWaveGold: 45,
      maxPullsPerWave: 5,
      pullsRemaining: 5,
      interestRate: 0.25,
      greedMultiplier: Math.max(0.1, sanitizeNumber(options.greedMultiplier, 1.0)),
    });

    this.matrix = Array.from({ length: 16 }, (_, idx) => {
      const defaultId = idx === 5 || idx === 10 ? 'abyssal_knight' : 'skeleton';
      const isCmd = defaultId === 'abyssal_knight';
      return this._createCell(idx, defaultId, isCmd, 0, 0);
    });

    this._syncLockedCells();
    this.bingoLines = [];
    this.lastDevourEvents = [];
    this._forcedNextMatrix = null;

    this.lastTurnBreakdown = calculateSpinDamage({
      basePoints: 0,
      lineMultiplier: 1.0,
      devourStacks: 0,
      chainSynergyMultiplier: 1.0,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: '待命：按下拉杆开战',
      triggeredSynergies: [],
      settlementDurationMs: 0,
    });

    return this.getState();
  }

  _createCell(index, rawUnitId, locked = false, devourStacks = 0, bonusPoints = 0) {
    const id = sanitizeUnitId(rawUnitId);
    const meta = UNIT_MAP[id] || UNIT_LIST[1];
    const isCommander = Boolean(meta.isCommander);
    const isLocked = Boolean(locked || isCommander);

    return {
      index,
      row: Math.floor(index / 4),
      col: index % 4,
      id: meta.id,
      unitId: meta.id,
      symbolId: meta.id,
      name: meta.name,
      zhName: meta.zhName,
      icon: meta.icon,
      tier: meta.tier,
      basePoints: meta.basePoints,
      bonusPoints: Math.max(0, Math.floor(sanitizeNumber(bonusPoints, 0))),
      mult: meta.mult,
      goldBonus: meta.goldBonus || 0,
      isCommander,
      isFodder: Boolean(meta.isFodder),
      locked: isLocked,
      devourStacks: Math.max(0, Math.floor(sanitizeNumber(devourStacks, 0))),
    };
  }

  _syncLockedCells() {
    this.lockedCells = this.matrix
      .filter((cell) => Boolean(cell && cell.locked && cell.id !== 'empty'))
      .map((cell) => cell.index)
      .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < 16)
      .sort((a, b) => a - b);
    return this.lockedCells;
  }

  _evaluateBingoLines() {
    const completed = [];
    for (const line of BINGO_LINES) {
      const isComplete = line.indices.every((idx) => {
        const cell = this.matrix[idx];
        return cell && cell.tier >= 2 && cell.id !== 'empty';
      });
      if (isComplete) {
        completed.push({
          id: line.id,
          type: line.type,
          name: line.name,
          zhName: line.zhName,
          indices: [...line.indices],
        });
      }
    }
    this.bingoLines = completed;
    return completed;
  }

  /**
   * Wave-Transition Commander Ascension Merge (`T6-28`):
   * When the matrix has >=10 locked Commanders on wave clear, merges pairs of Tier-2/Tier-3 Commanders
   * into higher-tier Commanders (`blood_archmage` / `golden_overlord`) while reopening unlocked fodder
   * slots so the next wave never deadlocks at 16/16 locked cells.
   */
  _ascendCommandersOnWaveClear() {
    this._syncLockedCells();
    if (this.lockedCells.length < 10) return;

    const tier2Indices = this.matrix
      .filter((c) => c && c.locked && c.tier === 2)
      .map((c) => c.index);
    const tier3Indices = this.matrix
      .filter((c) => c && c.locked && c.tier === 3)
      .map((c) => c.index);

    const mergeCandidates = tier2Indices.length >= 2 ? tier2Indices : tier3Indices;
    const maxPairs = Math.min(2, Math.floor(mergeCandidates.length / 2));
    const promotedIndices = new Set();

    for (let p = 0; p < maxPairs; p++) {
      const idxA = mergeCandidates[p * 2];
      const idxB = mergeCandidates[p * 2 + 1];
      const cellA = this.matrix[idxA];
      const cellB = this.matrix[idxB];
      if (!cellA || !cellB) continue;

      const promotedId = cellA.tier === 2 ? 'blood_archmage' : 'golden_overlord';
      const combinedStacks = (cellA.devourStacks || 0) + (cellB.devourStacks || 0) + 2;
      const combinedBonus = (cellA.bonusPoints || 0) + (cellB.bonusPoints || 0) + 45;

      this.matrix[idxA] = this._createCell(idxA, promotedId, true, combinedStacks, combinedBonus);
      promotedIndices.add(idxA);
      // Reopen idxB as an unlocked fodder slot for fresh respins on the next wave
      this.matrix[idxB] = this._createCell(idxB, 'skeleton', false, 0, 0);
    }

    // Reopen remaining locked candidate slots back to unlocked fodder so Wave 2 starts with 2 ascended Elite Commanders
    for (const idx of mergeCandidates) {
      if (!promotedIndices.has(idx)) {
        this.matrix[idx] = this._createCell(idx, 'skeleton', false, 0, 0);
      }
    }

    this._syncLockedCells();
  }

  pickRelic(relicId = null) {
    resolvePendingRelicDraft(this.economy, relicId);
    return this.getState();
  }

  enterEndless() {
    this.victory = false;
    const res = enterEndlessMode(this.economy, 85_000_000);
    const nextBoss = getBossForWave(res.wave);
    this.currentBoss = nextBoss;
    this.enemyMaxHp = nextBoss.maxHp;
    this.enemyHp = nextBoss.hp;
    return this.getState();
  }

  setSeed(seed) {
    const numeric = Number(seed);
    this.seed = Number.isFinite(numeric) ? Math.abs(Math.trunc(numeric)) || 1 : 12345;
    this.prng.setSeed(this.seed);
    return this.seed;
  }

  forceNextSpin(matrixOrConfig) {
    if (Array.isArray(matrixOrConfig)) {
      const flat = Array.isArray(matrixOrConfig[0]) ? matrixOrConfig.flat() : matrixOrConfig;
      const sanitized = Array.from({ length: 16 }, (_, idx) => sanitizeUnitId(flat[idx]));
      this._forcedNextMatrix = [...sanitized];
      this.matrix = sanitized.map((id, idx) => this._createCell(idx, id));
      this._syncLockedCells();
      this._evaluateBingoLines();
      return this.getState();
    }
    if (matrixOrConfig && typeof matrixOrConfig === 'object') {
      return this.forceState(matrixOrConfig);
    }
    return this.getState();
  }

  forceGridOrCylinder(matrixOrConfig) {
    return this.forceNextSpin(matrixOrConfig);
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
      const boss = getBossForWave(w);
      this.currentBoss = boss;
      this.enemyMaxHp = boss.maxHp;
      this.enemyHp = boss.hp;
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
      this.playerHp = safeClamp(sanitizeNumber(forcedConfig.playerHp, 100), 0, this.playerMaxHp);
      this.gameOver = this.playerHp <= 0;
    }
    if (forcedConfig.gold !== undefined) {
      this.economy.gold = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.gold, 0)));
    }
    if (forcedConfig.pullsRemaining !== undefined) {
      this.economy.pullsRemaining = Math.max(0, Math.floor(sanitizeNumber(forcedConfig.pullsRemaining, 5)));
    }
    if (forcedConfig.greedMultiplier !== undefined) {
      this.economy.greedMultiplier = Math.max(0.1, sanitizeNumber(forcedConfig.greedMultiplier, 1.0));
    }

    const matrixArr =
      forcedConfig.matrix ||
      forcedConfig.grid ||
      forcedConfig.cells ||
      forcedConfig.nextSpin ||
      forcedConfig.symbols;
    if (Array.isArray(matrixArr)) {
      this.forceNextSpin(matrixArr);
    }

    if (Array.isArray(forcedConfig.lockedCells)) {
      const validSet = new Set(
        forcedConfig.lockedCells.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < 16)
      );
      for (let i = 0; i < 16; i++) {
        this.matrix[i].locked = validSet.has(i) || Boolean(this.matrix[i].isCommander);
      }
      this._syncLockedCells();
    }

    return this.getState();
  }

  /**
   * Primary Action (`Space` / `[🔄 矩阵重摇 / Hold & Respin]`):
   * 1. Holds locked cells (`🔒 HOLD`) in place while respinning unlocked cells.
   * 2. Auto-locks any newly spun Apex Commanders (`tier >= 2`).
   * 3. Executes `<1000ms` 4-way Orthogonal Cross Auto-Devour (`Up`, `Down`, `Left`, `Right`),
   *    ensuring shared fodder cells are devoured strictly once (`T2-F18-03`).
   * 4. Evaluates 10 Row/Col/Diag Bingo lines and fires artillery barrage.
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
      const arr = payload.matrix || payload.grid || payload.cells;
      if (Array.isArray(arr)) {
        this.forceNextSpin(arr);
      }
    }

    const wasOvertime = (this.economy.pullsRemaining || 0) <= 0;
    consumePull(this.economy, { spendGold: false });

    // 1. Populate or Hold-&-Respin 16 Matrix Cells
    if (Array.isArray(this._forcedNextMatrix) && this._forcedNextMatrix.length === 16) {
      const forced = [...this._forcedNextMatrix];
      this._forcedNextMatrix = null;
      this.matrix = forced.map((unitId, idx) => {
        const prev = this.matrix[idx];
        const preserveLocked = Boolean(prev && prev.locked && prev.id === unitId);
        const preserveStacks = preserveLocked ? prev.devourStacks : 0;
        const preserveBonus = preserveLocked ? prev.bonusPoints : 0;
        return this._createCell(idx, unitId, preserveLocked, preserveStacks, preserveBonus);
      });
    } else {
      this.matrix = this.matrix.map((cell, idx) => {
        if (cell && cell.locked && cell.id !== 'empty') {
          return { ...cell };
        }
        const rolledId = sanitizeUnitId(this.prng.pickWeighted(SPAWNABLE_UNIT_WEIGHTS));
        return this._createCell(idx, rolledId, false, 0, 0);
      });
    }

    for (let r = 0; r < 4; r++) {
      this.sound?.playReelClack?.(r, 4);
    }

    // 2. Auto-Lock Apex Commanders (`tier >= 2`)
    for (const cell of this.matrix) {
      if (cell.tier >= 2) {
        cell.locked = true;
        cell.isCommander = true;
      }
      if (cell.goldBonus > 0 && cell.tier >= 2) {
        this.economy.gold += cell.goldBonus;
      }
    }
    this._syncLockedCells();

    // 3. Orthogonal Cross Auto-Devour (`<1000ms`)
    let turnDevourStacks = 0;
    const devourEvents = [];

    for (let idx = 0; idx < 16; idx++) {
      const commander = this.matrix[idx];
      if (!commander || commander.tier < 2 || commander.id === 'empty') continue;

      const neighbors = ORTHOGONAL_NEIGHBORS[idx] || [];
      for (const nIdx of neighbors) {
        const target = this.matrix[nIdx];
        if (!target || target.id === 'empty' || target.tier !== 1 || target.locked) continue;

        // Immediately replace devoured fodder cell with 'empty' so shared fodder is NEVER eaten twice (`T2-F18-03`)
        const eatenId = target.id;
        const eatenPts = target.basePoints || 15;
        const eatenGold = target.goldBonus || 0;

        this.matrix[nIdx] = this._createCell(nIdx, 'empty', false, 0, 0);

        turnDevourStacks += 1;
        commander.devourStacks += 1;
        commander.bonusPoints += eatenPts;
        if (eatenGold > 0) {
          this.economy.gold += eatenGold;
        }

        devourEvents.push({
          fromIndex: nIdx,
          toIndex: idx,
          preyId: eatenId,
          commanderId: commander.id,
          stacksGain: 1,
        });

        this.sound?.playDevourCrunch?.(devourEvents.length, commander.tier);
        this.sound?.playComboChime?.(Math.min(24, devourEvents.length - 1));
      }
    }

    this.lastDevourEvents = devourEvents;
    this._syncLockedCells();

    const relicMods = getRelicModifiers(this.economy);

    // 4. Evaluate 10 Row/Col/Diag Bingo Artillery Lines
    const completedLines = this._evaluateBingoLines();
    const bingoCount = completedLines.length;
    const lineMultiplier = getBingoLineMultiplier(bingoCount);

    // 5. Compute Balatro-style Exponential Barrage Damage
    let totalBasePoints = 0;
    let totalPersistentStacks = 0;
    for (const cell of this.matrix) {
      if (!cell || cell.id === 'empty') continue;
      totalBasePoints += Math.round((cell.basePoints + cell.bonusPoints) * (cell.mult || 1));
      totalPersistentStacks += cell.devourStacks || 0;
    }

    const baseDevourStacks =
      turnDevourStacks > 0
        ? Math.min(4, turnDevourStacks)
        : Math.min(4, totalPersistentStacks);
    const effectiveDevourStacks =
      baseDevourStacks > 0 && relicMods.bonusDevourStacks > 0
        ? baseDevourStacks + relicMods.bonusDevourStacks
        : baseDevourStacks;

    const triggeredSynergies = [];
    let chainSynergyMultiplier = 1.0;

    if (devourEvents.length > 0) {
      triggeredSynergies.push(`ORTHOGONAL_CROSS_DEVOUR_${devourEvents.length}`);
      chainSynergyMultiplier *= 1.8;
    }
    if (bingoCount >= 10) {
      triggeredSynergies.push('FULL_MATRIX_BLACKOUT_10_LINES');
      chainSynergyMultiplier *= 5.0;
      this.sound?.playChainExplosion?.(4);
      this.sound?.playComboChime?.(16);
    } else if (bingoCount >= 2) {
      triggeredSynergies.push(`CROSS_BINGO_${bingoCount}_LINES`);
      chainSynergyMultiplier *= 2.5;
      this.sound?.playChainExplosion?.(2);
    } else if (bingoCount === 1) {
      triggeredSynergies.push('SINGLE_BINGO_LINE');
      chainSynergyMultiplier *= 1.5;
    }
    chainSynergyMultiplier = Number((chainSynergyMultiplier * relicMods.chainMultBonus).toFixed(2));

    const settlementDurationMs = Math.min(440, 140 + devourEvents.length * 45);
    this.flowTracker.completeSettlement(settlementDurationMs);

    const comboName =
      bingoCount >= 10
        ? '十线全通·深渊神罚'
        : bingoCount >= 3
          ? `矩阵歼灭网 (${bingoCount}线齐射)`
          : bingoCount === 2
            ? '十字交叉火力'
            : bingoCount === 1
              ? '单线集火齐射'
              : '深渊战阵推进';

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: effectiveDevourStacks,
      chainSynergyMultiplier,
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 6. Apply Damage to Boss & Settle Wave Clear
    this._applyBarrageDamage(breakdown.totalDamage, { wasOvertime });

    this.flowTracker.completeTurn?.();
    return this.getState();
  }

  _applyBarrageDamage(damageAmount, options = {}) {
    const dmg = Math.max(0, sanitizeNumber(damageAmount, 0));
    const wasOvertime = Boolean(options.wasOvertime);

    if (dmg >= this.enemyHp) {
      const unusedPulls = Math.max(0, Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0)));
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedPulls, clearedWave);
      this._ascendCommandersOnWaveClear();

      if (clearedWave >= 8 && !this.economy.endlessMode) {
        this.victory = true;
        this.economy.wave = 8;
        this.enemyHp = 0;
        this.economy.pendingRelicDraft = null;
        return;
      }

      startRelicDraft(this.economy, 3, this.prng);
      const nextWave = this.economy.endlessMode
        ? clearedWave + 1
        : Math.min(8, this.economy.wave || clearedWave + 1);
      this.economy.wave = nextWave;
      const nextBoss = getBossForWave(nextWave);
      this.currentBoss = nextBoss;
      this.enemyMaxHp = nextBoss.maxHp;
      this.enemyHp = nextBoss.hp;
    } else {
      this.enemyHp = Math.max(0, this.enemyHp - dmg);
      this.economy.pullsRemaining = Math.max(
        0,
        Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0))
      );

      if (wasOvertime && this.enemyHp > 0) {
        const bossStrike = Math.max(15, sanitizeNumber(this.currentBoss?.attack, 25));
        this.playerHp = safeClamp(this.playerHp - bossStrike, 0, this.playerMaxHp);
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
      }
    }
  }

  /**
   * Secondary Action (`R` / `[🔥 立即结算开火 / Fire Barrage Now]` OR manual cell lock):
   * - If `payload.cellIndex !== undefined`: validates `0 <= cellIndex < 16` (`T2-F18-04`, `T6-27`).
   * - Otherwise (`action: 'fire'`): fires the current 4×4 matrix barrage (`T2-F18-05`, `T5-26`, `T6-27`).
   *   Only settles wave clear & compound interest if the barrage actually defeats the Boss (`damage >= enemyHp`).
   */
  performSecondaryAction(payload = {}) {
    if (payload && typeof payload === 'object') {
      if (payload.action === 'pick_relic' || payload.relicId !== undefined) {
        return this.pickRelic(payload.relicId);
      }
      if (payload.action === 'enter_endless') {
        return this.enterEndless();
      }
      if (payload.action === 'reset_run') {
        return this.reset();
      }
      if ('cellIndex' in payload) {
        const idx = payload.cellIndex;
        if (!Number.isInteger(idx) || idx < 0 || idx >= 16) {
          this._syncLockedCells();
          return this.getState();
        }
        const cell = this.matrix[idx];
        if (cell && cell.id !== 'empty') {
          cell.locked = payload.locked !== undefined ? Boolean(payload.locked) : !cell.locked;
        }
        this._syncLockedCells();
        return this.getState();
      }
    }

    // Early Fire Barrage (`T2-F18-05`, `T5-26`, `T6-27`)
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    if (Array.isArray(this.economy.pendingRelicDraft) && this.economy.pendingRelicDraft.length > 0) {
      resolvePendingRelicDraft(this.economy, null);
    }

    const wasOvertime = (this.economy.pullsRemaining || 0) <= 0;

    for (const cell of this.matrix) {
      if (cell && cell.tier >= 2) {
        cell.locked = true;
      }
    }
    this._syncLockedCells();
    const completedLines = this._evaluateBingoLines();
    const bingoCount = completedLines.length;
    const lineMultiplier = getBingoLineMultiplier(bingoCount);

    let totalBasePoints = 0;
    let totalStacks = 0;
    for (const cell of this.matrix) {
      if (!cell || cell.id === 'empty') continue;
      totalBasePoints += Math.round((cell.basePoints + cell.bonusPoints) * (cell.mult || 1));
      totalStacks += cell.devourStacks || 0;
    }

    const relicMods = getRelicModifiers(this.economy);
    const settlementDurationMs = 260;
    this.flowTracker.completeSettlement(settlementDurationMs);

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: totalStacks,
      chainSynergyMultiplier: Number(((bingoCount >= 2 ? 2.5 : 1.5) * relicMods.chainMultBonus).toFixed(2)),
      greedMultiplier: this.economy.greedMultiplier,
      comboName: `立即齐射结算 (${bingoCount}线齐射)`,
      triggeredSynergies: ['EARLY_FIRE_COMPOUND_BANK'],
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;

    if (breakdown.totalDamage >= this.enemyHp) {
      // Lethal Early Fire -> bank remaining spins into compound interest & advance wave
      const unusedSpins = Math.max(0, Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0)));
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedSpins, clearedWave);
      this._ascendCommandersOnWaveClear();

      if (clearedWave >= 8 && !this.economy.endlessMode) {
        this.victory = true;
        this.economy.wave = 8;
        this.enemyHp = 0;
        this.economy.pendingRelicDraft = null;
      } else {
        startRelicDraft(this.economy, 3, this.prng);
        const nextWave = this.economy.endlessMode
          ? clearedWave + 1
          : Math.min(8, this.economy.wave || clearedWave + 1);
        this.economy.wave = nextWave;
        const nextBoss = getBossForWave(nextWave);
        this.currentBoss = nextBoss;
        this.enemyMaxHp = nextBoss.maxHp;
        this.enemyHp = nextBoss.hp;
      }
    } else {
      // Non-lethal Early Fire -> deal damage and consume 1 pull WITHOUT skipping wave or awarding free interest (`T6-27`)
      this.enemyHp = Math.max(0, this.enemyHp - breakdown.totalDamage);
      consumePull(this.economy, { spendGold: false });
      this.economy.pullsRemaining = Math.max(
        0,
        Math.floor(sanitizeNumber(this.economy.pullsRemaining, 0))
      );

      if (wasOvertime && this.enemyHp > 0) {
        const bossStrike = Math.max(15, sanitizeNumber(this.currentBoss?.attack, 25));
        this.playerHp = safeClamp(this.playerHp - bossStrike, 0, this.playerMaxHp);
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.gameOver = true;
        }
      }
    }

    this.sound?.playChainExplosion?.(2);
    this.flowTracker.completeTurn?.();
    return this.getState();
  }

  step(dtMs = 16.67) {
    const rawDt = Number(dtMs);
    if (!Number.isFinite(rawDt) || rawDt <= 0) {
      return this.getState();
    }
    return this.getState();
  }

  getState() {
    this._syncLockedCells();
    const breakdown = this.lastTurnBreakdown || calculateSpinDamage({ basePoints: 0 });
    const relics = Array.isArray(this.economy.relics) ? this.economy.relics.map((r) => ({ ...r })) : [];

    return {
      schemeId: this.id,
      id: this.id,
      seed: this.seed,
      wave: this.economy.wave,
      gold: this.economy.gold,
      interestRate: this.economy.interestRate,
      greedMultiplier: this.economy.greedMultiplier,
      pullsRemaining: this.economy.pullsRemaining,
      pullsUsed: this.economy.pullsUsed,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      bossId: this.currentBoss?.id || 'grid_boss_1',
      currentBoss: this.currentBoss ? { ...this.currentBoss } : null,
      enemyName: this.currentBoss?.zhName || '深渊矩阵哨卫',
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: Math.round(this.enemyMaxHp),
      matrix: this.matrix.map((c) => ({ ...c })),
      lockedCells: [...this.lockedCells],
      bingoLines: this.bingoLines.map((l) => ({ ...l, indices: [...l.indices] })),
      relics,
      ownedRelics: relics,
      pendingRelicDraft: Array.isArray(this.economy.pendingRelicDraft)
        ? this.economy.pendingRelicDraft.map((r) => ({ ...r }))
        : null,
      lastSettlement: this.economy.lastSettlement ? { ...this.economy.lastSettlement } : null,
      victory: Boolean(this.victory),
      gameOver: Boolean(this.gameOver || this.playerHp <= 0),
      endlessMode: Boolean(this.economy.endlessMode),
      lastDevourEvents: this.lastDevourEvents.map((d) => ({ ...d })),
      lastTurnBreakdown: { ...breakdown },
      lastFormula: { ...breakdown },
    };
  }
}

export function createAbyssalGridEngine(options = {}) {
  return new AbyssalGridEngine(options);
}

export default AbyssalGridEngine;
