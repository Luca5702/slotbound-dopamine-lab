/**
 * Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Deterministic Engine (`F-S5-01`)
 * Implements:
 *  - 4×4 Tactical Hold-&-Respin Matrix (16 cells `0..15`)
 *  - Auto-Locking Apex Commanders (`tier >= 2` -> `🔒 HOLD`)
 *  - `<1000ms` 4-Way Orthogonal Cross Auto-Devour (`Up`, `Down`, `Left`, `Right` without row wrap)
 *  - Shared fodder deduplication (a fodder cell flanked by two Commanders is eaten strictly once)
 *  - 10-Line Row/Col/Diag Bingo Artillery Barrage Evaluator
 *  - Early Fire action (`performSecondaryAction({ action: 'fire' })`) banking unused respins into compound interest
 *
 * Zero DOM dependencies — runs natively in Node (`node --test`) and Browser.
 */

import { createPRNG } from '../../core/PRNG.js';
import { sanitizeNumber, safeClamp } from '../../core/BigNumber.js';
import { calculateSpinDamage } from '../../core/ScoreFormula.js';
import { createEconomyState, consumePull, settleWaveClear } from '../../core/EconomyEngine.js';
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
    this.enemyMaxHp = boss.maxHp;
    this.enemyHp = boss.hp;
    this.playerHp = 100;
    this.playerMaxHp = 100;

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
      comboName: 'READY TO SPIN MATRIX',
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
   * 1. Holds locked Commanders (`🔒 HOLD`) in place while respinning unlocked cells.
   * 2. Auto-locks any newly spun Apex Commanders (`tier >= 2`).
   * 3. Executes `<1000ms` 4-way Orthogonal Cross Auto-Devour (`Up`, `Down`, `Left`, `Right`),
   *    ensuring shared fodder cells are devoured strictly once (`T2-F18-03`).
   * 4. Evaluates 10 Row/Col/Diag Bingo lines and fires artillery barrage.
   */
  performPrimaryAction(payload = {}) {
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

    if (payload && typeof payload === 'object') {
      const arr = payload.matrix || payload.grid || payload.cells;
      if (Array.isArray(arr)) {
        this.forceNextSpin(arr);
      }
    }

    consumePull(this.economy, { spendGold: false });

    // 1. Populate or Hold-&-Respin 16 Matrix Cells
    if (Array.isArray(this._forcedNextMatrix) && this._forcedNextMatrix.length === 16) {
      const forced = [...this._forcedNextMatrix];
      this._forcedNextMatrix = null;
      this.matrix = forced.map((unitId, idx) => {
        const prev = this.matrix[idx];
        const preserveStacks =
          prev && prev.locked && prev.id === unitId ? prev.devourStacks : 0;
        const preserveBonus =
          prev && prev.locked && prev.id === unitId ? prev.bonusPoints : 0;
        return this._createCell(idx, unitId, false, preserveStacks, preserveBonus);
      });
    } else {
      this.matrix = this.matrix.map((cell, idx) => {
        if (cell && cell.locked && cell.tier >= 2 && cell.id !== 'empty') {
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
        if (!target || target.id === 'empty' || target.tier !== 1) continue;

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

    const effectiveDevourStacks =
      turnDevourStacks > 0 ? turnDevourStacks : totalPersistentStacks;

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

    const settlementDurationMs = Math.min(440, 140 + devourEvents.length * 45);
    this.flowTracker.completeSettlement(settlementDurationMs);

    const comboName =
      bingoCount >= 10
        ? '十线全通·深渊神罚 (10-Line Full Blackout!)'
        : bingoCount >= 3
          ? `矩阵歼灭网 (${bingoCount} Lines Bingo Barrage)`
          : bingoCount === 2
            ? '十字交叉火力 (2-Line Cross Bingo)'
            : bingoCount === 1
              ? '单线集火齐射 (1-Line Bingo Volley)'
              : '深渊战阵推进 (Tactical Matrix Volley)';

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: effectiveDevourStacks,
      chainSynergyMultiplier: Number(chainSynergyMultiplier.toFixed(2)),
      greedMultiplier: this.economy.greedMultiplier,
      comboName,
      triggeredSynergies,
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;

    // 6. Apply Damage to Boss & Settle Wave Clear
    this._applyBarrageDamage(breakdown.totalDamage);

    this.flowTracker.completeTurn?.();
    return this.getState();
  }

  _applyBarrageDamage(damageAmount) {
    const dmg = Math.max(0, sanitizeNumber(damageAmount, 0));
    if (dmg >= this.enemyHp) {
      const unusedPulls = Math.max(1, this.economy.pullsRemaining || 1);
      const clearedWave = this.economy.wave || 1;
      settleWaveClear(this.economy, unusedPulls, clearedWave);
      const nextWave = Math.min(8, this.economy.wave || clearedWave + 1);
      this.economy.wave = nextWave;
      const nextBoss = getBossForWave(nextWave);
      this.currentBoss = nextBoss;
      this.enemyMaxHp = nextBoss.maxHp;
      this.enemyHp = nextBoss.hp;
    } else {
      this.enemyHp = Math.max(0, this.enemyHp - dmg);
      if (this.economy.pullsRemaining <= 0) {
        this.economy.pullsRemaining = this.economy.maxPullsPerWave || 5;
      }
    }
  }

  /**
   * Secondary Action (`R` / `[🔥 立即结算开火 / Fire Barrage Now]` OR manual cell lock):
   * - If `payload.cellIndex !== undefined`: validates `0 <= cellIndex < 16` (`T2-F18-04`).
   * - Otherwise (`action: 'fire'`): immediately fires the current 4×4 matrix barrage and banks remaining spins for compound interest (`T2-F18-05`).
   */
  performSecondaryAction(payload = {}) {
    if (payload && typeof payload === 'object' && 'cellIndex' in payload) {
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

    // Early Fire Barrage (`T2-F18-05`)
    this.flowTracker.startTurn();
    this.flowTracker.startSettlement();

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

    const unusedSpins = Math.max(1, this.economy.pullsRemaining || 1);
    settleWaveClear(this.economy, unusedSpins, this.economy.wave || 1);
    this.economy.wave = Math.min(8, this.economy.wave || 1);

    const settlementDurationMs = 260;
    this.flowTracker.completeSettlement(settlementDurationMs);

    const breakdown = calculateSpinDamage({
      basePoints: Math.max(20, totalBasePoints),
      lineMultiplier,
      devourStacks: totalStacks,
      chainSynergyMultiplier: bingoCount >= 2 ? 2.5 : 1.5,
      greedMultiplier: this.economy.greedMultiplier,
      comboName: `立即齐射结算 (${bingoCount} Lines Bingo Early Fire)`,
      triggeredSynergies: ['EARLY_FIRE_COMPOUND_BANK'],
      settlementDurationMs,
    });

    this.lastTurnBreakdown = breakdown;
    this.enemyHp = Math.max(0, this.enemyHp - breakdown.totalDamage);
    if (this.enemyHp <= 0) {
      const nextBoss = getBossForWave(this.economy.wave || 1);
      this.currentBoss = nextBoss;
      this.enemyMaxHp = nextBoss.maxHp;
      this.enemyHp = nextBoss.hp;
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
      enemyName: this.currentBoss?.zhName || '深渊矩阵哨卫',
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: Math.round(this.enemyMaxHp),
      matrix: this.matrix.map((c) => ({ ...c })),
      lockedCells: [...this.lockedCells],
      bingoLines: this.bingoLines.map((l) => ({ ...l, indices: [...l.indices] })),
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
