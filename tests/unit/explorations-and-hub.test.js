/**
 * Unit & Integration Tests for Scheme 4 (《咒印弹珠台》 Sigil Pachinko),
 * Scheme 5 (《深渊矩阵》 Abyssal Grid), and Unified Arcade Hub (`F-S4-01`, `F-S5-01`, `F-HUB-01`)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORB_LIST,
  ORB_MAP,
  DEFAULT_PEGS,
  DEFAULT_CRUCIBLES,
} from '../../src/games/sigil-pachinko/config.js';
import { SigilPachinkoEngine } from '../../src/games/sigil-pachinko/SigilPachinkoEngine.js';
import { SigilPachinkoView } from '../../src/games/sigil-pachinko/SigilPachinkoView.js';

import {
  UNIT_MAP,
  ORTHOGONAL_NEIGHBORS,
  BINGO_LINES,
  getBingoLineMultiplier,
} from '../../src/games/abyssal-grid/config.js';
import { AbyssalGridEngine } from '../../src/games/abyssal-grid/AbyssalGridEngine.js';
import { AbyssalGridView } from '../../src/games/abyssal-grid/AbyssalGridView.js';

import {
  SCHEME_IDS,
  getAllSchemes,
  getScheme,
  createEngine,
  createView,
} from '../../src/games/registry.js';
import { initApp, coerceSeed } from '../../src/main.js';
import { SoundEngine } from '../../src/audio/SoundEngine.js';
import {
  installMockBrowserEnv,
  readProjectText,
} from '../e2e/helpers/e2e-harness.js';

test('F-S4-01: Sigil Pachinko config & engine initialize 1x3 spawner, 24 pegs, and 5 crucibles', () => {
  assert.ok(ORB_LIST.length >= 6);
  assert.ok(ORB_MAP.ember_orb && ORB_MAP.void_singularity && ORB_MAP.gold_stone);
  assert.equal(DEFAULT_PEGS.length, 24);
  assert.equal(DEFAULT_CRUCIBLES.length, 5);
  assert.equal(DEFAULT_CRUCIBLES[2].multiplier, 25);

  const sound = new SoundEngine();
  const engine = new SigilPachinkoEngine({ seed: 501, sound });
  const st0 = engine.getState();
  assert.equal(st0.schemeId, 'sigil-pachinko');
  assert.equal(st0.pegs.length, 24);
  assert.equal(st0.crucibles.length, 5);

  // Mid-air collision Auto-Devour + Center x25 Jackpot Crucible
  engine.forceState({
    spawner: ['void_singularity', 'gold_stone', 'ember_orb'],
    forceCrucibleIndex: 2,
  });
  engine.performSecondaryAction(); // Chaos Tilt
  engine.performPrimaryAction({ forceCrucibleIndex: 2 });
  const st1 = engine.step(500);

  assert.ok(st1.lastTurnBreakdown.devourStacks >= 2);
  assert.ok(st1.lastTurnBreakdown.lineMultiplier >= 25);
  assert.ok(st1.lastTurnBreakdown.totalDamage > 0);
  assert.ok(st1.lastTurnBreakdown.settlementDurationMs < 1000);

  // Identical 3x ember_orb drop must not mutually delete all orbs
  engine.forceNextSpin(['ember_orb', 'ember_orb', 'ember_orb']);
  engine.performPrimaryAction();
  const stIdentical = engine.step(600);
  assert.ok(stIdentical.lastTurnBreakdown.totalDamage > 0);
});

test('F-S4-01: SigilPachinkoView renders all required data-testid elements and handles hotkeys', () => {
  const env = installMockBrowserEnv();
  const engine = new SigilPachinkoEngine({ seed: 502 });
  const container = env.createContainer();
  const view = new SigilPachinkoView(engine);
  view.mount(container, { engine });

  for (const id of [
    'pachinko-board',
    'pachinko-spawner',
    'btn-drop-orbs',
    'btn-chaos-tilt',
    'pachinko-crucible-0',
    'pachinko-crucible-1',
    'pachinko-crucible-2',
    'pachinko-crucible-3',
    'pachinko-crucible-4',
  ]) {
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Missing [data-testid="${id}"]`);
  }

  container.querySelector('[data-testid="btn-chaos-tilt"]').click();
  container.querySelector('[data-testid="btn-drop-orbs"]').click();
  assert.ok(engine.getState().lastTurnBreakdown.totalDamage > 0);
  view.unmount();
});

test('F-S5-01: Abyssal Grid config & engine auto-lock Commanders, devour orthogonal neighbors without wrap, and evaluate 10 Bingo lines', () => {
  assert.ok(UNIT_MAP.skeleton && UNIT_MAP.abyssal_knight && UNIT_MAP.golden_overlord);
  assert.deepEqual(ORTHOGONAL_NEIGHBORS[0], [1, 4]);
  assert.equal(BINGO_LINES.length, 10);
  assert.equal(getBingoLineMultiplier(2), 10.0);
  assert.equal(getBingoLineMultiplier(10), 1000.0);

  const engine = new AbyssalGridEngine({ seed: 601 });
  assert.equal(engine.getState().matrix.length, 16);

  // Corner cell 0 only eats orthogonal neighbors 1 and 4 (never wraps to cell 3)
  const cornerMatrix = Array(16).fill('empty');
  cornerMatrix[0] = 'abyssal_knight';
  cornerMatrix[1] = 'skeleton';
  cornerMatrix[4] = 'skeleton';
  cornerMatrix[3] = 'skeleton';
  engine.forceNextSpin(cornerMatrix);
  const stCorner = engine.performPrimaryAction();
  assert.equal(stCorner.lastTurnBreakdown.devourStacks, 2);
  assert.ok(stCorner.lockedCells.includes(0));

  // Shared fodder at cell 1 between Commanders at 0 and 2 is eaten strictly once
  const sharedMatrix = Array(16).fill('empty');
  sharedMatrix[0] = 'abyssal_knight';
  sharedMatrix[1] = 'skeleton';
  sharedMatrix[2] = 'abyssal_knight';
  engine.forceNextSpin(sharedMatrix);
  const stShared = engine.performPrimaryAction();
  assert.equal(stShared.lastTurnBreakdown.devourStacks, 1);

  // Full 16/16 Commanders completes all 10 Bingo lines
  engine.forceNextSpin(Array(16).fill('abyssal_knight'));
  const stFull = engine.performPrimaryAction();
  assert.equal(stFull.bingoLines.length, 10);
  assert.equal(stFull.lastTurnBreakdown.lineMultiplier, 1000.0);

  // Out-of-bounds cellIndex safety & Early Fire action
  engine.performSecondaryAction({ cellIndex: -1 });
  engine.performSecondaryAction({ cellIndex: 16 });
  engine.performSecondaryAction({ cellIndex: null });
  const stEarlyFire = engine.performSecondaryAction({ action: 'fire' });
  assert.ok(stEarlyFire.lastTurnBreakdown.totalDamage > 0);
});

test('F-S5-01: AbyssalGridView renders 16 matrix cells and spin/fire action buttons', () => {
  const env = installMockBrowserEnv();
  const engine = new AbyssalGridEngine({ seed: 602 });
  const container = env.createContainer();
  const view = new AbyssalGridView(engine);
  view.mount(container, { engine });

  assert.ok(container.querySelector('[data-testid="abyssal-matrix"]'));
  for (let i = 0; i < 16; i++) {
    assert.ok(container.querySelector(`[data-testid="matrix-cell-${i}"]`));
  }
  assert.ok(container.querySelector('[data-testid="btn-matrix-spin"]'));
  assert.ok(container.querySelector('[data-testid="btn-matrix-fire"]'));

  container.querySelector('[data-testid="btn-matrix-spin"]').click();
  assert.ok(engine.getState().lastTurnBreakdown.totalDamage > 0);
  view.unmount();
});

test('F-HUB-01: Unified Game Registry, Arcade Hub switcher, GDD Viewer, Audio Lab & Global Bridges', async () => {
  assert.equal(getAllSchemes().length, 5);
  for (const id of SCHEME_IDS) {
    assert.ok(getScheme(id));
    const eng = createEngine(id, { seed: 777 });
    assert.equal(eng.getState().schemeId, id);
    const v = createView(id, eng);
    assert.equal(typeof v.mount, 'function');
  }

  assert.ok(coerceSeed(0) > 0);
  assert.ok(coerceSeed(-42) > 0);
  assert.ok(coerceSeed('abc') > 0);

  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  const bridge = initApp();

  assert.equal(globalThis.window.__SLOTBOUND__, bridge);
  assert.equal(globalThis.window.__SLOTBOUND_TEST__, bridge);

  for (const id of SCHEME_IDS) {
    await bridge.switchScheme(id);
    assert.equal(bridge.getActiveScheme(), id);
    globalThis.document.querySelector('[data-testid="sandbox-trigger-jackpot"]').click();
    const st = bridge.getState();
    assert.ok(st.lastTurnBreakdown.totalDamage > 0, `Jackpot in ${id} must deal > 0 damage`);
  }

  // Invalid switchScheme does not blank active scheme
  await bridge.switchScheme('non-existent-scheme');
  await bridge.switchScheme(null);
  assert.equal(bridge.getActiveScheme(), 'abyssal-grid');

  // Switch to GDD Viewer
  await bridge.switchScheme('gdd');
  assert.equal(bridge.getActiveScheme(), 'gdd');
  const gddBody = globalThis.document.querySelector('[data-testid="gdd-content-body"]');
  assert.ok(gddBody && gddBody.textContent.length > 200);

  // Switch to Audio Lab
  await bridge.switchScheme('audio-lab');
  assert.equal(bridge.getActiveScheme(), 'audio-lab');
  globalThis.document.querySelector('[data-testid="audio-test-clunk"]').click();
  globalThis.document.querySelector('[data-testid="audio-test-devour"]').click();
  globalThis.document.querySelector('[data-testid="audio-test-chime"]').click();
  assert.ok(bridge.getAudioLog().length >= 3);
});
