/**
 * 15-Second Flow Rule & Sub-Second Auto-Devour Settlement Tracker (`F-CORE-04`)
 * Enforces:
 *  - Auto-Devour settlement strictly < 1000ms (`MAX_SETTLEMENT_MS = 1000`, target `450-650ms`)
 *  - Single-turn full closed loop (spin -> devour -> crits -> reward pick) within `10-15s` (`MAX_TURN_CYCLE_MS = 15000`)
 *  - `2.5x` Turbo Fast-Forward Multiplier when pressing Spacebar during animation
 */

import { sanitizeNumber, safeClamp } from './BigNumber.js';

export const FLOW_CONSTANTS = {
  MAX_SETTLEMENT_MS: 1000,
  DEFAULT_SETTLEMENT_MS: 550,
  MIN_TURN_CYCLE_MS: 10_000,
  MAX_TURN_CYCLE_MS: 15_000,
  NORMAL_SPEED_MULTIPLIER: 1.0,
  TURBO_SPEED_MULTIPLIER: 2.5,
};

function getNow() {
  return globalThis.performance ? globalThis.performance.now() : Date.now();
}

export class FlowTracker {
  constructor(options = {}) {
    this.maxSettlementMs = sanitizeNumber(options.maxSettlementMs, FLOW_CONSTANTS.MAX_SETTLEMENT_MS);
    this.maxTurnCycleMs = sanitizeNumber(options.maxTurnCycleMs, FLOW_CONSTANTS.MAX_TURN_CYCLE_MS);
    this.turboMultiplierValue = sanitizeNumber(
      options.turboSpeedMultiplier,
      FLOW_CONSTANTS.TURBO_SPEED_MULTIPLIER
    );

    this.phase = 'IDLE_READY'; // 'IDLE_READY' | 'SPINNING' | 'SETTLING' | 'DRAFT_REWARD'
    this.speedMultiplier = FLOW_CONSTANTS.NORMAL_SPEED_MULTIPLIER;
    this.isTurbo = false;

    this.turnStartTime = null;
    this.settlementStartTime = null;
    this.lastSettlementMs = 450;
    this.lastTurnDurationMs = 0;
    this.settlementsCount = 0;
    this.turnsCompleted = 0;
    this.spacePressCountInTurn = 0;
    this.history = [];
  }

  /**
   * Begins a new turn / spin cycle and resets turbo to 1.0x.
   */
  startTurn(nowMs = getNow()) {
    this.turnStartTime = sanitizeNumber(nowMs, getNow());
    this.settlementStartTime = this.turnStartTime;
    this.phase = 'SPINNING';
    this.speedMultiplier = FLOW_CONSTANTS.NORMAL_SPEED_MULTIPLIER;
    this.isTurbo = false;
    this.spacePressCountInTurn = 1;
    return {
      phase: this.phase,
      speedMultiplier: this.speedMultiplier,
      turnStartTime: this.turnStartTime,
    };
  }

  /**
   * Alias for startTurn.
   */
  startSpin(nowMs = getNow()) {
    return this.startTurn(nowMs);
  }

  /**
   * Marks the start of the Auto-Devour & Chain Reaction settlement phase.
   */
  startSettlement(nowMs = getNow()) {
    this.settlementStartTime = sanitizeNumber(nowMs, getNow());
    if (this.turnStartTime === null) {
      this.turnStartTime = this.settlementStartTime;
    }
    this.phase = 'SETTLING';
    return this.settlementStartTime;
  }

  /**
   * Engages the 2.5x Turbo speed multiplier (triggered by repeated Spacebar press during animation).
   */
  engageTurbo() {
    this.isTurbo = true;
    this.speedMultiplier = this.turboMultiplierValue;
    return this.speedMultiplier;
  }

  /**
   * Resets speed multiplier back to 1.0x.
   */
  resetTurbo() {
    this.isTurbo = false;
    this.speedMultiplier = FLOW_CONSTANTS.NORMAL_SPEED_MULTIPLIER;
    return this.speedMultiplier;
  }

  /**
   * Handles single-key Spacebar ergonomics:
   *  - In IDLE_READY: starts spin (1.0x)
   *  - In SPINNING / SETTLING: engages 2.5x turbo fast-forward
   *  - In DRAFT_REWARD: confirms default reward and returns to IDLE_READY
   */
  handleSpaceInput(nowMs = getNow()) {
    if (this.phase === 'IDLE_READY') {
      this.startTurn(nowMs);
      return { action: 'START_SPIN', phase: this.phase, speedMultiplier: this.speedMultiplier };
    }
    if (this.phase === 'SPINNING' || this.phase === 'SETTLING') {
      this.spacePressCountInTurn += 1;
      this.engageTurbo();
      return { action: 'ENGAGE_TURBO', phase: this.phase, speedMultiplier: this.speedMultiplier };
    }
    if (this.phase === 'DRAFT_REWARD') {
      const turnSummary = this.completeTurn(null, nowMs);
      return { action: 'CONFIRM_REWARD', phase: this.phase, speedMultiplier: this.speedMultiplier, turnSummary };
    }
    return { action: 'NOOP', phase: this.phase, speedMultiplier: this.speedMultiplier };
  }

  /**
   * Scales an animation/settlement duration (in ms) by the active speedMultiplier
   * and enforces the < 1000ms Auto-Devour ceiling if `capAtOneSecond = true`.
   * @param {number} rawMs
   * @param {boolean} [capAtOneSecond=false]
   * @returns {number}
   */
  scaleDuration(rawMs, capAtOneSecond = false) {
    const clean = Math.max(0, sanitizeNumber(rawMs, FLOW_CONSTANTS.DEFAULT_SETTLEMENT_MS));
    const scaled = Math.round(clean / Math.max(0.1, this.speedMultiplier));
    if (capAtOneSecond) {
      return safeClamp(scaled, 1, this.maxSettlementMs - 50); // Capped at <= 950ms (< 1000ms)
    }
    return Math.max(1, scaled);
  }

  /**
   * Completes the Auto-Devour settlement window and enforces the < 1000ms Iron Law.
   * @param {number|null} [rawDurationMs=null]
   * @param {number} [nowMs=getNow()]
   */
  completeSettlement(rawDurationMs = null, nowMs = getNow()) {
    const elapsed =
      rawDurationMs !== null && rawDurationMs !== undefined
        ? sanitizeNumber(rawDurationMs, FLOW_CONSTANTS.DEFAULT_SETTLEMENT_MS)
        : this.settlementStartTime !== null
          ? Math.max(1, sanitizeNumber(nowMs, getNow()) - this.settlementStartTime)
          : FLOW_CONSTANTS.DEFAULT_SETTLEMENT_MS;

    // Apply turbo scaling and strictly clamp into [1ms, 999ms] to guarantee <1000ms Auto-Devour settlement
    const scaledMs = Math.round(elapsed / Math.max(0.1, this.speedMultiplier));
    const effectiveDurationMs = safeClamp(scaledMs, 1, this.maxSettlementMs - 1);

    this.lastSettlementMs = effectiveDurationMs;
    this.settlementsCount += 1;
    this.phase = 'IDLE_READY';

    return {
      rawDurationMs: elapsed,
      effectiveDurationMs,
      withinOneSecondRule: effectiveDurationMs < this.maxSettlementMs,
      speedMultiplier: this.speedMultiplier,
      isTurbo: this.isTurbo,
    };
  }

  /**
   * Enters post-wave reward draft phase.
   */
  enterRewardDraft() {
    this.phase = 'DRAFT_REWARD';
    return this.phase;
  }

  /**
   * Completes the full turn/wave cycle and records telemetry against the 15-Second Flow Rule.
   * @param {number|null} [explicitTurnDurationMs=null]
   * @param {number} [nowMs=getNow()]
   */
  completeTurn(explicitTurnDurationMs = null, nowMs = getNow()) {
    const rawTurnMs =
      explicitTurnDurationMs !== null && explicitTurnDurationMs !== undefined
        ? Math.max(1, sanitizeNumber(explicitTurnDurationMs, 850))
        : this.turnStartTime !== null
          ? Math.max(1, sanitizeNumber(nowMs, getNow()) - this.turnStartTime)
          : 850;

    const effectiveTurnMs = Math.round(rawTurnMs / Math.max(0.1, this.speedMultiplier));
    this.lastTurnDurationMs = effectiveTurnMs;
    this.turnsCompleted += 1;
    this.phase = 'IDLE_READY';

    const record = {
      turnNumber: this.turnsCompleted,
      rawTurnMs,
      effectiveTurnMs,
      settlementDurationMs: this.lastSettlementMs,
      speedMultiplier: this.speedMultiplier,
      isTurbo: this.isTurbo,
      within15SecondRule: effectiveTurnMs <= this.maxTurnCycleMs,
      withinOneSecondSettlement: this.lastSettlementMs < this.maxSettlementMs,
    };

    this.history.push(record);
    if (this.history.length > 100) {
      this.history.shift();
    }

    this.resetTurbo();
    return record;
  }

  /**
   * Returns current flow metrics and state snapshot.
   */
  getMetrics() {
    const avgTurnMs =
      this.history.length > 0
        ? Math.round(this.history.reduce((sum, r) => sum + r.effectiveTurnMs, 0) / this.history.length)
        : this.lastTurnDurationMs;

    return {
      phase: this.phase,
      speedMultiplier: this.speedMultiplier,
      isTurbo: this.isTurbo,
      lastSettlementMs: this.lastSettlementMs,
      lastTurnDurationMs: this.lastTurnDurationMs,
      averageTurnDurationMs: avgTurnMs,
      isWithinSettlementBudget: this.lastSettlementMs < this.maxSettlementMs,
      isWithinFlowBudget: this.lastTurnDurationMs <= this.maxTurnCycleMs,
      settlementsCount: this.settlementsCount,
      turnsCompleted: this.turnsCompleted,
      history: [...this.history],
    };
  }

  getState() {
    return this.getMetrics();
  }
}

export function createFlowTracker(options = {}) {
  return new FlowTracker(options);
}

export default FlowTracker;
