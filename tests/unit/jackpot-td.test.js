/**
 * Unit & Integration Tests for Scheme 3: 《黄金矿工防线》(Jackpot TD)
 * Features covered: `F-S3-01`, `F-S3-02`, `F-S3-03`
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TD_CONSTANTS,
  TOWERS,
  TOWER_MAP,
  YAHTZEE_HANDS,
  ENEMIES,
  BOSSES,
} from '../../src/games/jackpot-td/config.js';
import {
  JackpotTDEngine,
  evaluateYahtzeeHand,
} from '../../src/games/jackpot-td/JackpotTDEngine.js';
import { JackpotTDView } from '../../src/games/jackpot-td/JackpotTDView.js';
import { SoundEngine } from '../../src/audio/SoundEngine.js';
import { HUDController } from '../../src/ui/HUDController.js';
import { VFXCanvas } from '../../src/ui/VFXCanvas.js';
import { installMockBrowserEnv } from '../e2e/helpers/e2e-harness.js';

test('F-S3-01: config.js defines all 6 canonical tower symbols, 4 enemy archetypes, and 8 waves', () => {
  assert.equal(TOWERS.length, 6);
  const expectedIds = [
    'miner_pick',
    'gold_nugget',
    'cryo_prism',
    'tesla_coil',
    'prism_laser',
    'nuke_core',
  ];
  for (let i = 0; i < expectedIds.length; i++) {
    const id = expectedIds[i];
    assert.ok(TOWER_MAP[id], `Expected tower symbol ${id}`);
    assert.equal(TOWER_MAP[id].rank, i + 1);
  }
  assert.equal(ENEMIES.length, 4);
  assert.equal(BOSSES.length, 8);
  assert.equal(BOSSES[0].hp, 120);
  assert.equal(BOSSES[7].hp, 85000000);
});

test('F-S3-01: JackpotTDEngine initializes 1x5 slot barrier, Wave 1 enemies, and advances real-time march', () => {
  const engine = new JackpotTDEngine({ seed: 101 });
  const st0 = engine.getState();

  assert.equal(st0.schemeId, 'jackpot-td');
  assert.equal(st0.pedestals.length, 5);
  assert.equal(st0.wave, 1);
  assert.equal(st0.playerHp, 100);
  assert.equal(st0.gold, 100);
  assert.ok(st0.closestEnemyProgress > 0 && st0.closestEnemyProgress < 0.72);

  engine.step(500);
  const st1 = engine.getState();
  assert.ok(st1.closestEnemyProgress > st0.closestEnemyProgress);

  // Boundary: step(0) and step(-200) must not move enemies backward or corrupt state
  engine.step(0);
  engine.step(-200);
  const st2 = engine.getState();
  assert.equal(st2.closestEnemyProgress, st1.closestEnemyProgress);
});

test('F-S3-01: Enemy breaching bottom defense line reduces Base HP and 0-Gold emergency pull remains safe', () => {
  const engine = new JackpotTDEngine({ seed: 102 });
  engine.forceState({ closestEnemyProgress: 0.98, gold: 0 });

  for (let i = 0; i < 8; i++) {
    engine.step(500);
  }
  const stAfterBreach = engine.getState();
  assert.ok(stAfterBreach.playerHp < 100 && stAfterBreach.playerHp >= 0);

  // Pull lever at 0 Gold -> emergency pull without negative gold
  engine.forceState({ gold: 0 });
  const stAfterPull = engine.performPrimaryAction();
  assert.ok(stAfterPull.gold >= 0);
  assert.equal(stAfterPull.pedestals.length, 5);
  assert.ok(stAfterPull.lastTurnBreakdown.totalDamage > 0);
});

test('F-S3-02: evaluateYahtzeeHand accurately classifies all 9 poker/Yahtzee combinations', () => {
  assert.equal(
    evaluateYahtzeeHand(['miner_pick', 'gold_nugget', 'tesla_coil', 'prism_laser', 'nuke_core']).id,
    'HIGH_CARD'
  );
  assert.equal(
    evaluateYahtzeeHand(['miner_pick', 'miner_pick', 'cryo_prism', 'tesla_coil', 'prism_laser']).id,
    'ONE_PAIR'
  );
  assert.equal(
    evaluateYahtzeeHand(['miner_pick', 'miner_pick', 'tesla_coil', 'tesla_coil', 'nuke_core']).id,
    'TWO_PAIR'
  );
  assert.equal(
    evaluateYahtzeeHand(['cryo_prism', 'cryo_prism', 'cryo_prism', 'miner_pick', 'nuke_core']).id,
    'THREE_OF_A_KIND'
  );
  assert.equal(
    evaluateYahtzeeHand(['tesla_coil', 'tesla_coil', 'tesla_coil', 'gold_nugget', 'gold_nugget']).id,
    'FULL_HOUSE'
  );
  assert.equal(
    evaluateYahtzeeHand(['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'miner_pick']).id,
    'SMALL_STRAIGHT'
  );
  assert.equal(
    evaluateYahtzeeHand(['prism_laser', 'cryo_prism', 'miner_pick', 'tesla_coil', 'gold_nugget']).id,
    'LARGE_STRAIGHT'
  );
  assert.equal(
    evaluateYahtzeeHand(['prism_laser', 'prism_laser', 'prism_laser', 'prism_laser', 'miner_pick']).id,
    'FOUR_OF_A_KIND'
  );
  assert.equal(
    evaluateYahtzeeHand(['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']).id,
    'YAHTZEE_FIVE'
  );
});

test('F-S3-02: Star auto-merge (★★ / ★★★), 4s Freeze, 5s Hyper Laser, Yahtzee Nuke & <1000ms Auto-Devour', () => {
  const sound = new SoundEngine();
  const engine = new JackpotTDEngine({ seed: 202, sound });

  // 1. One Pair -> 2-Star (★★) merge
  engine.forceNextSpin(['tesla_coil', 'tesla_coil', 'miner_pick', 'cryo_prism', 'nuke_core']);
  const stPair = engine.performPrimaryAction();
  assert.equal(stPair.lastTurnBreakdown.lineMultiplier, YAHTZEE_HANDS.ONE_PAIR.lineMultiplier);
  assert.ok(stPair.pedestals.some((p) => p.star >= 2));
  assert.ok(stPair.lastTurnBreakdown.devourStacks > 0);
  assert.ok(stPair.lastTurnBreakdown.settlementDurationMs < 1000);

  // 2. Three of a Kind -> 3-Star (★★★) + 4s Freeze halting enemy march
  engine.forceNextSpin(['cryo_prism', 'cryo_prism', 'cryo_prism', 'miner_pick', 'gold_nugget']);
  const stFreeze = engine.performPrimaryAction();
  assert.equal(stFreeze.lastTurnBreakdown.lineMultiplier, 20.0);
  assert.ok(stFreeze.pedestals.some((p) => p.star === 3));
  const frozenProgress = stFreeze.closestEnemyProgress;
  engine.step(1500);
  assert.equal(engine.getState().closestEnemyProgress, frozenProgress);

  // 3. Large Straight -> 5s Hyper Laser Sweep and clean expiration after 6s
  engine.forceNextSpin(['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  const stStraight = engine.performPrimaryAction();
  assert.equal(stStraight.lastTurnBreakdown.lineMultiplier, 200.0);
  assert.ok(stStraight.activeEffects.some((e) => e.type === 'laser'));
  assert.ok(sound.getAudioLog().some((e) => e.type === 'laser'));

  for (let i = 0; i < 6; i++) {
    engine.step(1000);
  }
  assert.equal(
    engine.getState().activeEffects.some((e) => e.type === 'laser'),
    false
  );

  // 4. Five of a Kind Yahtzee Nuke -> >= 100,000 damage and resets Red-Zone progress
  engine.forceState({ closestEnemyProgress: 0.84, gold: 500 });
  engine.forceNextSpin(['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
  const stNuke = engine.performPrimaryAction();
  assert.equal(stNuke.lastTurnBreakdown.lineMultiplier, 1000.0);
  assert.ok(stNuke.lastTurnBreakdown.totalDamage >= 100000);
  assert.ok(stNuke.closestEnemyProgress < TD_CONSTANTS.RED_ZONE_THRESHOLD);
});

test('F-S3-03: Real-time +20% compound Gold interest, Greed Streak multiplier & Red-Zone Adrenaline', () => {
  const engine = new JackpotTDEngine({ seed: 303 });
  assert.equal(engine.getState().gold, 100);

  engine.step(3000);
  const stAfter1Tick = engine.getState();
  assert.equal(stAfter1Tick.gold, 120);
  assert.equal(stAfter1Tick.greedMultiplier, 1.5);

  engine.step(3000);
  const stAfter2Ticks = engine.getState();
  assert.equal(stAfter2Ticks.gold, 144);
  assert.equal(stAfter2Ticks.greedMultiplier, 2.2);

  // Red-Zone boundary check (0.71 vs 0.72)
  engine.forceState({ closestEnemyProgress: 0.71 });
  assert.equal(engine.getState().isRedZoneCritical, false);
  engine.forceState({ closestEnemyProgress: 0.72 });
  assert.equal(engine.getState().isRedZoneCritical, true);
});

test('F-S3-01..03: JackpotTDView renders all 11 required data-testid anchors and handles Space/click', () => {
  const env = installMockBrowserEnv();
  const sound = new SoundEngine();
  const hudContainer = env.createContainer();
  const hud = new HUDController(hudContainer);
  const canvasEl = env.document.createElement('canvas');
  const vfx = new VFXCanvas(canvasEl);

  const engine = new JackpotTDEngine({ seed: 404, sound });
  const container = env.createContainer();
  const view = new JackpotTDView(engine, { sound, hud, vfx });
  view.mount(container, { engine, sound, hud, vfx });

  const requiredIds = [
    'td-lane-canvas',
    'td-slot-bar',
    'td-pedestal-0',
    'td-pedestal-1',
    'td-pedestal-2',
    'td-pedestal-3',
    'td-pedestal-4',
    'btn-pull-lever',
    'td-interest-ticker',
    'td-base-hp',
    'td-active-combo',
  ];

  for (const id of requiredIds) {
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Expected [data-testid="${id}"]`);
  }

  container.querySelector('[data-testid="btn-pull-lever"]').click();
  assert.ok(engine.getState().lastTurnBreakdown.totalDamage > 0);

  view.onKeyDown(new globalThis.KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true }));
  view.unmount();
});
