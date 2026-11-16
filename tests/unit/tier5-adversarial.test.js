import test from 'node:test';
import assert from 'node:assert/strict';
import { createPRNG } from '../../src/core/PRNG.js';
import {
  MAX_SAFE_GAME_NUMBER,
  sanitizeNumber,
  safeMultiply,
  formatChineseNumber,
} from '../../src/core/BigNumber.js';
import {
  calculateDevourMultiplier,
  getWaveProgressionTarget,
} from '../../src/core/ScoreFormula.js';
import {
  DEFAULT_RELIC_CATALOG,
  createEconomyState,
  consumePull,
  applyRelic,
  getRelicDraftChoices,
} from '../../src/core/EconomyEngine.js';
import { EventBus } from '../../src/core/EventBus.js';
import { FlowTracker } from '../../src/core/FlowTracker.js';
import { renderMarkdownToHtml } from '../../src/ui/GDDViewer.js';
import { DevourReelsEngine } from '../../src/games/devour-reels/DevourReelsEngine.js';
import { RevolverDungeonEngine } from '../../src/games/revolver-dungeon/RevolverDungeonEngine.js';
import {
  JackpotTDEngine,
  evaluateYahtzeeHand,
} from '../../src/games/jackpot-td/JackpotTDEngine.js';
import { TOWERS } from '../../src/games/jackpot-td/config.js';
import { SigilPachinkoEngine } from '../../src/games/sigil-pachinko/SigilPachinkoEngine.js';
import { ARENA_BOUNDS } from '../../src/games/sigil-pachinko/config.js';
import { AbyssalGridEngine } from '../../src/games/abyssal-grid/AbyssalGridEngine.js';
import { getBingoLineMultiplier } from '../../src/games/abyssal-grid/config.js';
import {
  normalizeSchemeId,
  isValidSchemeId,
  getAllSchemes,
} from '../../src/games/registry.js';
import { coerceSeed } from '../../src/main.js';

// ============================================================================
// Tier 5 White-Box Adversarial Unit Test Suite (15 Deep Invariant Tests)
// ============================================================================

test('U-T5-01: PRNG fork(salt) isolation, mid-stream checkpointing & tuple pickWeighted', () => {
  const rngA = createPRNG(98765);
  const rngB = createPRNG(98765);
  rngA.next();
  rngB.next();

  const forkA1 = rngA.fork('alpha');
  const forkA2 = rngB.fork('alpha');
  assert.deepEqual(
    Array.from({ length: 6 }, () => forkA1.next()),
    Array.from({ length: 6 }, () => forkA2.next())
  );

  const savedState = rngA.getState();
  const sample1 = Array.from({ length: 8 }, () => rngA.nextInt(10, 99));
  rngA.setState(savedState);
  const sample2 = Array.from({ length: 8 }, () => rngA.nextInt(10, 99));
  assert.deepEqual(sample1, sample2);

  const f = rngA.nextFloat(20, 5);
  assert.ok(f >= 5 && f < 20);
  assert.deepEqual(rngA.pickWeighted([['skip', 0], ['take', 100]]), ['take', 100]);
});

test('U-T5-02: BigNumber BigInt sanitization, ±1e300 clamp, 万亿 formatting & endless wave >8 targets', () => {
  assert.equal(sanitizeNumber(10n ** 18n), 1e18);
  assert.equal(sanitizeNumber(10n ** 340n), MAX_SAFE_GAME_NUMBER);
  assert.equal(safeMultiply(1e220, -1e220), -MAX_SAFE_GAME_NUMBER);
  assert.equal(formatChineseNumber(4.2e12), '4.20万亿');
  assert.equal(calculateDevourMultiplier(3, 10, 2.0), 20);

  const w9 = getWaveProgressionTarget(9);
  assert.equal(w9.wave, 9);
  assert.equal(w9.targetBossHp, Math.floor(85_000_000 * 6.5));
});

test('U-T5-03: EconomyEngine spendGold escalation, overdraft guard vs emergency overdraft & 8-relic pool exhaustion', () => {
  const state = createEconomyState({ gold: 14, basePullCost: 10 });
  const p1 = consumePull(state, { spendGold: true, costEscalation: 6, allowOverdraft: false });
  assert.equal(p1.canPull, true);
  assert.equal(state.gold, 4);
  assert.equal(state.pullCost, 16);

  const p2 = consumePull(state, { spendGold: true, costEscalation: 6, allowOverdraft: false });
  assert.equal(p2.canPull, false);
  assert.equal(state.gold, 4);

  const p3 = consumePull(state, { spendGold: true, costEscalation: 6, allowOverdraft: true });
  assert.equal(p3.canPull, true);
  assert.equal(state.gold, 0);

  for (const r of DEFAULT_RELIC_CATALOG) {
    applyRelic(state, r.id);
  }
  assert.equal(state.relics.length, 8);
  assert.equal(getRelicDraftChoices(state, 3).length, 3);
});

test('U-T5-04: EventBus async wildcard & error isolation + FlowTracker 3-stage Spacebar cycle', async () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('wave:win', async (p) => { seen.push(`direct:${p.wave}`); });
  bus.on('*', async (p, meta) => { seen.push(`wild:${meta.event}:${p.wave}`); });
  await bus.emitAsync('wave:win', { wave: 4 });
  assert.deepEqual(seen, ['direct:4', 'wild:wave:win:4']);

  const tracker = new FlowTracker();
  assert.equal(tracker.handleSpaceInput(100).action, 'START_SPIN');
  assert.equal(tracker.handleSpaceInput(150).action, 'ENGAGE_TURBO');
  assert.equal(tracker.speedMultiplier, 2.5);
  tracker.enterRewardDraft();
  assert.equal(tracker.handleSpaceInput(300).action, 'CONFIRM_REWARD');
  assert.equal(tracker.phase, 'IDLE_READY');
});

test('U-T5-05: GDDViewer renderMarkdownToHtml XSS entity escaping & unclosed code/table auto-close', () => {
  const html = renderMarkdownToHtml('# Test <img src=x onerror=alert(1)>\n| H1 | H2 |\n|---|---|\n| A | B |\n```js\nlet a = 1;');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('</tbody></table>'));
  assert.ok(html.endsWith('</code></pre>'));
});

test('U-T5-06: DevourReelsEngine Food-Chain Apex Preemption & Center Maw cell-4 equal-tier tie-breaker', () => {
  const engine = new DevourReelsEngine({ seed: 601 });
  engine.forceNextSpin([
    'abyss_apostle', 'hero_berserker', 'goblin',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
  ]);
  const st1 = engine.performPrimaryAction();
  assert.equal(st1.grid[1].devouredBy, 0);
  assert.equal(st1.grid[2].devoured, false);

  engine.forceNextSpin([
    'iron_knight', 'goblin', 'digestive_herb',
    'digestive_herb', 'iron_knight', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
  ]);
  const st2 = engine.performPrimaryAction();
  assert.equal(st2.grid[1].devouredBy, 4);
  assert.equal(st2.grid[4].devourCount, 1);
  assert.equal(st2.grid[0].devourCount, 0);
});

test('U-T5-07: DevourReelsEngine simultaneous 5-synergy + acid_reflux_core Bile Tsunami (x15.0)', () => {
  const engine = new DevourReelsEngine({ seed: 602, enemyHp: 999_999_999 });
  applyRelic(engine.economy, 'acid_reflux_core');
  engine.forceState({
    indigestion: 95,
    enemyHp: 999_999_999,
    enemyMaxHp: 999_999_999,
  });
  engine.forceNextSpin([
    'fireball', 'powder_keg', 'curse_skull',
    'iron_knight', 'abyss_apostle', 'hero_berserker',
    'iron_knight', 'iron_knight', 'goblin',
  ]);
  const st1 = engine.performPrimaryAction();
  assert.equal(st1.lastTurnBreakdown.triggeredSynergies.length, 5);
  assert.equal(st1.mawArmor, 120);

  engine.forceNextSpin(Array(9).fill('curse_skull'));
  const st2 = engine.performPrimaryAction();
  assert.equal(st2.indigestion, 30);
  assert.equal(st2.mawArmor, 95);
  assert.equal(st2.lastTurnBreakdown.chainSynergyMultiplier, 15.0);
});

test('U-T5-08: RevolverDungeonEngine Full Cylinder Dump trio protection during Parasite neighbor devour', () => {
  const engine = new RevolverDungeonEngine({ seed: 603 });
  engine.forceState({
    enemyHp: 9_999_999,
    chambers: [
      'powder_charge',
      'parasite_bullet',
      'lead_bullet',
      'fuse_cord',
      'heavy_hammer',
      'empty',
    ],
  });
  const st = engine.performPrimaryAction({ targetChamber: 1 });
  assert.equal(st.devourEvents.length, 1);
  assert.equal(st.devourEvents[0].fromChamber, 2);
  assert.equal(st.lastTurnBreakdown.chainSynergyMultiplier, 24.0);
});

test('U-T5-09: RevolverDungeonEngine sympathetic scatter burst + Lone Survivor 5-empty Demon Gambit', () => {
  const engine = new RevolverDungeonEngine({ seed: 604 });
  engine.forceState({
    playerHp: 70,
    enemyHp: 9_999_999,
    chambers: ['vampire_bullet', 'scatter_bullet', 'demon_bullet', 'empty', 'empty', 'empty'],
  });
  const st1 = engine.performPrimaryAction({ targetChamber: 1, forceBackfire: true });
  assert.equal(st1.playerHp, 70);
  assert.equal(st1.bloodRageActive, true);

  engine.forceState({
    chambers: ['empty', 'lead_bullet', 'empty', 'empty', 'empty', 'empty'],
  });
  engine.performPrimaryAction({ targetChamber: 0 });
  engine.performSecondaryAction({ chamberIndex: 1, bulletId: 'demon_bullet' });
  const st2 = engine.performPrimaryAction({ targetChamber: 1, forceBackfire: false });
  assert.equal(st2.lastTurnBreakdown.lineMultiplier, 255);
  assert.equal(st2.lastTurnBreakdown.chainSynergyMultiplier, 2.0);
  assert.equal(st2.gritMultiplier, 1.0);
});

test('U-T5-10: JackpotTDEngine exhaustive 6^5 = 7,776 Yahtzee combinatorial hand partition', () => {
  const towerIds = TOWERS.map((t) => t.id);
  const dist = {};
  for (const a of towerIds) {
    for (const b of towerIds) {
      for (const c of towerIds) {
        for (const d of towerIds) {
          for (const e of towerIds) {
            const h = evaluateYahtzeeHand([a, b, c, d, e]);
            dist[h.id] = (dist[h.id] || 0) + 1;
          }
        }
      }
    }
  }
  assert.deepEqual(dist, {
    YAHTZEE_FIVE: 6,
    FOUR_OF_A_KIND: 150,
    FULL_HOUSE: 300,
    LARGE_STRAIGHT: 240,
    SMALL_STRAIGHT: 960,
    THREE_OF_A_KIND: 1200,
    TWO_PAIR: 1800,
    ONE_PAIR: 2880,
    HIGH_CARD: 240,
  });
});

test('U-T5-11: JackpotTDEngine Reach-1 vs Reach-2 pedestal predation & partial freeze slice thaw', () => {
  const engine = new JackpotTDEngine({ seed: 605, enemyHp: 9_999_999 });
  engine.forceState({ enemyHp: 9_999_999, gold: 500 });

  engine.forceNextSpin(['miner_pick', 'gold_nugget', 'tesla_coil', 'miner_pick', 'gold_nugget']);
  const st1 = engine.performPrimaryAction();
  assert.equal(st1.pedestals[2].permanentDevourStacks, 6);
  assert.equal(st1.pedestals[0].devoured, false);

  engine.forceNextSpin(['miner_pick', 'gold_nugget', 'nuke_core', 'cryo_prism', 'gold_nugget']);
  const st2 = engine.performPrimaryAction();
  assert.equal(st2.pedestals[2].permanentDevourStacks, 16);
  assert.equal(st2.pedestals[0].devoured, true);
  assert.equal(st2.pedestals[3].devoured, false);

  const pBefore = engine.getState().closestEnemyProgress;
  engine.forceState({ freezeRemainingMs: 1200 });
  const stThawed = engine.step(2000);
  assert.equal(stThawed.freezeRemainingMs, 0);
  assert.ok(stThawed.closestEnemyProgress > pBefore);
});

test('U-T5-12: SigilPachinkoEngine equal-apex survival vs dual-prey fusion & wall bounce damping', () => {
  const engine = new SigilPachinkoEngine({ seed: 606, enemyHp: 9_999_999 });
  engine.forceState({
    enemyHp: 9_999_999,
    spawner: ['philosopher_stone', 'void_singularity', 'gold_droplet'],
  });
  const st = engine.performPrimaryAction();
  assert.equal(st.orbs.filter((o) => !o.devoured).length, 2);
  assert.equal(st.lastDevourEvents.length, 1);

  engine.orbs[0].x = 42;
  engine.orbs[0].y = 100;
  engine.orbs[0].vx = -200;
  engine.orbs[0].vy = 200;
  engine.orbs[0].settled = false;
  const stStep = engine.step(100);
  assert.equal(stStep.orbs[0].vx, 170);
  assert.ok(stStep.orbs[0].x >= ARENA_BOUNDS.minX);
});

test('U-T5-13: AbyssalGridEngine locked Commander stack persistence, Early Fire Wave 8 clamp & Bingo multiplier ladder', () => {
  assert.equal(getBingoLineMultiplier(0), 1.0);
  assert.equal(getBingoLineMultiplier(3), 35.0);
  assert.equal(getBingoLineMultiplier(10), 1000.0);

  const engine = new AbyssalGridEngine({ seed: 607, enemyHp: 999_999_999 });
  const m = Array(16).fill('empty');
  m[5] = 'golden_overlord';
  m[1] = 'skeleton';
  m[4] = 'slime_blob';
  m[6] = 'mana_crystal';
  m[9] = 'gold_mimic';
  engine.forceState({ enemyHp: 999_999_999, matrix: m });

  const s1 = engine.performPrimaryAction();
  assert.equal(s1.matrix[5].devourStacks, 4);
  assert.equal(s1.matrix[5].locked, true);

  engine.forceState({ wave: 8, pullsRemaining: 3 });
  const sEarlyFire = engine.performSecondaryAction({ action: 'fire' });
  assert.equal(sEarlyFire.wave, 8, 'Early Fire on Wave 8 must clamp wave at 8');
});

test('U-T5-14: Game Registry alias normalization & 5-scheme jackpotSetup determinism', () => {
  assert.equal(normalizeSchemeId('  NAV-SCHEME-3 '), 'jackpot-td');
  assert.equal(normalizeSchemeId('ABYSSAL_GRID'), 'abyssal-grid');
  assert.equal(isValidSchemeId('invalid-id'), false);

  for (const scheme of getAllSchemes()) {
    const eng = scheme.createEngine({ seed: 608 });
    scheme.jackpotSetup(eng);
    const payload =
      scheme.id === 'revolver-dungeon'
        ? { targetChamber: 0, forceBackfire: false }
        : scheme.id === 'sigil-pachinko'
          ? { forceCrucibleIndex: 2 }
          : {};
    const st = eng.performPrimaryAction(payload);
    assert.ok(st.lastTurnBreakdown.totalDamage >= 1000);
  }
});

test('U-T5-15: coerceSeed deterministic hashing across numeric, negative, zero, and string seeds', () => {
  assert.equal(coerceSeed(0), 12345);
  assert.equal(coerceSeed(''), 12345);
  assert.equal(coerceSeed(-42), 42);
  const strSeed1 = coerceSeed('slotbound-tier5');
  const strSeed2 = coerceSeed('slotbound-tier5');
  assert.equal(strSeed1, strSeed2);
  assert.ok(strSeed1 > 0 && strSeed1 < 2147483647);
});
