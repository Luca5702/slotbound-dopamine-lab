/**
 * Unit & Integration Tests for Scheme 4 (《咒印弹珠台》 Sigil Pachinko),
 * Scheme 5 (《深渊矩阵》 Abyssal Grid), and Unified Arcade Hub (`F-S4-01`, `F-S5-01`, `F-HUB-01`, `F-R2-06`)
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

test('F-S4-01 / F-R2-06: Sigil Pachinko config & engine initialize 1x3 spawner, 24 pegs, 5 crucibles, Launch Aim & 35G Peg Upgrade', () => {
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

  // 35G Peg Upgrade
  const stUpgraded = engine.upgradeRandomPeg();
  assert.equal(stUpgraded.gold, 65);
  assert.equal(stUpgraded.pegs.some((p) => p.upgraded), true);

  // Mid-air collision Auto-Devour + Center x25 Jackpot Crucible
  engine.forceState({
    spawner: ['void_singularity', 'gold_stone', 'ember_orb'],
    forceCrucibleIndex: 2,
  });
  engine.performSecondaryAction(); // Chaos Tilt
  const stDrop0 = engine.performPrimaryAction({ forceCrucibleIndex: 2 });
  // Orbs start unsettled at 0ms before stepping
  assert.equal(stDrop0.orbs.some((o) => !o.devoured && !o.settled && o.y < 430), true);
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

test('F-S4-01 / F-R2-06: SigilPachinkoView renders all required data-testid elements, Launch Aim, Peg Upgrade, and multi-step cascade', () => {
  const env = installMockBrowserEnv();
  const engine = new SigilPachinkoEngine({ seed: 502 });
  const container = env.createContainer();
  const view = new SigilPachinkoView(engine);
  view.mount(container, { engine });

  for (const id of [
    'boss-arena-card',
    'boss-portrait-svg',
    'pachinko-board',
    'pachinko-spawner',
    'btn-drop-orbs',
    'btn-chaos-tilt',
    'btn-aim-left',
    'btn-aim-center',
    'btn-aim-right',
    'btn-upgrade-peg',
    'pachinko-crucible-0',
    'pachinko-crucible-1',
    'pachinko-crucible-2',
    'pachinko-crucible-3',
    'pachinko-crucible-4',
  ]) {
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Missing [data-testid="${id}"]`);
  }

  container.querySelector('[data-testid="btn-aim-left"]').click();
  assert.equal(engine.getState().launchAim, 'left');
  container.querySelector('[data-testid="btn-upgrade-peg"]').click();
  assert.equal(engine.getState().gold, 65);

  container.querySelector('[data-testid="btn-chaos-tilt"]').click();
  container.querySelector('[data-testid="btn-drop-orbs"]').click();
  assert.ok(engine.getState().lastTurnBreakdown.totalDamage > 0);
  view.unmount();
});

test('F-S5-01 / F-R2-06: Abyssal Grid config & engine auto-lock Commanders, devour orthogonal neighbors without wrap, evaluate 10 Bingo lines, guard non-lethal Early Fire & ascend Commanders on wave clear', () => {
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

  // Full 16/16 Commanders completes all 10 Bingo lines and triggers Wave-Transition Commander Ascension
  engine.forceNextSpin(Array(16).fill('abyssal_knight'));
  const stFull = engine.performPrimaryAction();
  assert.equal(stFull.bingoLines.length, 10);
  assert.equal(stFull.lastTurnBreakdown.lineMultiplier, 1000.0);
  assert.equal(stFull.matrix.some((c) => c.tier >= 3), true);
  assert.ok(stFull.lockedCells.length < 16);

  // Out-of-bounds cellIndex safety & Early Fire action
  engine.performSecondaryAction({ cellIndex: -1 });
  engine.performSecondaryAction({ cellIndex: 16 });
  engine.performSecondaryAction({ cellIndex: null });
  const stEarlyFire = engine.performSecondaryAction({ action: 'fire' });
  assert.ok(stEarlyFire.lastTurnBreakdown.totalDamage > 0);
});

test('F-S5-01 / F-R2-06: AbyssalGridView renders 16 clickable matrix cells and spin/fire action buttons', () => {
  const env = installMockBrowserEnv();
  const engine = new AbyssalGridEngine({ seed: 602 });
  const container = env.createContainer();
  const view = new AbyssalGridView(engine);
  view.mount(container, { engine });

  assert.ok(container.querySelector('[data-testid="boss-arena-card"]'));
  assert.ok(container.querySelector('[data-testid="abyssal-matrix"]'));
  for (let i = 0; i < 16; i++) {
    assert.ok(container.querySelector(`[data-testid="matrix-cell-${i}"]`));
  }
  assert.ok(container.querySelector('[data-testid="btn-matrix-spin"]'));
  assert.ok(container.querySelector('[data-testid="btn-matrix-fire"]'));

  // Click cell 0 to toggle manual HOLD lock
  container.querySelector('[data-testid="matrix-cell-0"]').click();
  assert.equal(engine.getState().lockedCells.includes(0), true);
  container.querySelector('[data-testid="matrix-cell-0"]').click();
  assert.equal(engine.getState().lockedCells.includes(0), false);

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

  // Trusted user keydown/pointerdown events reset _manualSimMode per PROJECT.md § 6.4
  await bridge.switchScheme('jackpot-td');
  bridge.stepSimulation(16.67, 1);
  assert.equal(bridge.hub._manualSimMode, true);
  bridge.hub.onKeyDown({ code: 'KeyA', key: 'a', isTrusted: true, target: { tagName: 'DIV' } });
  assert.equal(bridge.hub._manualSimMode, false);

  bridge.forceGridOrCylinder(['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  assert.equal(bridge.hub._manualSimMode, true);
  bridge.hub._boundPointerDown?.({ isTrusted: true });
  assert.equal(bridge.hub._manualSimMode, false);
});

test('F-R2-05 / F-R2-06 / F-R2-07: Non-blocking Relic Draft auto-advance (T6-31), manual HOLD fodder protection, Overtime Boss counter-attack & Wave 8 Victory', () => {
  // 1. T6-31 Non-blocking Relic Draft auto-advance on seed 6310 across jackpot-td, sigil-pachinko, abyssal-grid
  for (const schemeId of ['jackpot-td', 'sigil-pachinko', 'abyssal-grid']) {
    const scheme = getScheme(schemeId);
    const engine = scheme.createEngine({ seed: 6310, gold: 400 });
    scheme.jackpotSetup(engine);
    engine.forceState({ wave: 1, enemyHp: 10, enemyMaxHp: 120, pullsRemaining: 4 });
    const stClear = engine.performPrimaryAction(
      schemeId === 'sigil-pachinko' ? { forceCrucibleIndex: 2 } : {}
    );
    assert.equal(Array.isArray(stClear.pendingRelicDraft) && stClear.pendingRelicDraft.length === 3, true);
    const firstRelicId = stClear.pendingRelicDraft[0].id;

    engine.forceState({ enemyHp: 999_999, enemyMaxHp: 999_999 });
    const stNext = engine.performPrimaryAction();
    assert.equal(stNext.ownedRelics.some((r) => r.id === firstRelicId), true, `[${schemeId}] must auto-pick first relic`);
    assert.equal(
      Boolean(stNext.pendingRelicDraft && stNext.pendingRelicDraft.length > 0),
      false,
      `[${schemeId}] pendingRelicDraft must clear after auto-advance spin`
    );
    assert.ok(stNext.enemyHp < 999_999 && stNext.enemyHp > 0, `[${schemeId}] Wave 2 Boss must take non-lethal damage`);
  }

  // 2. AbyssalGridEngine manual HOLD lock on fodder cells is preserved across Orthogonal Cross Auto-Devour
  const gridEng = new AbyssalGridEngine({ seed: 603 });
  gridEng.performSecondaryAction({ cellIndex: 1, locked: true }); // lock fodder cell 1 (adjacent to Commander at cell 5)
  assert.equal(gridEng.getState().lockedCells.includes(1), true);
  const stAfterHoldSpin = gridEng.performPrimaryAction();
  assert.equal(stAfterHoldSpin.matrix[1].id !== 'empty', true, 'Manually HOLD-locked fodder at cell 1 must not be devoured to empty');
  assert.equal(stAfterHoldSpin.lockedCells.includes(1), true, 'Manually HOLD-locked fodder at cell 1 must remain in lockedCells');

  // 3. Overtime Boss counter-attack & Wave 8 Victory in SigilPachinkoEngine and AbyssalGridEngine
  for (const schemeId of ['sigil-pachinko', 'abyssal-grid']) {
    const eng = createEngine(schemeId, { seed: 6335 });
    eng.forceState({
      wave: 4,
      playerHp: 5,
      pullsRemaining: 0,
      enemyHp: 999_999,
      enemyMaxHp: 999_999,
    });
    const stOvertime = eng.performPrimaryAction();
    assert.equal(stOvertime.pullsRemaining, 0, `[${schemeId}] Overtime must keep pullsRemaining at 0`);
    assert.equal(stOvertime.playerHp, 0, `[${schemeId}] Fatal Overtime Boss counter-attack must reduce playerHp to 0`);
    assert.equal(stOvertime.gameOver, true, `[${schemeId}] Fatal Overtime Boss counter-attack must set gameOver === true`);

    const winEng = createEngine(schemeId, { seed: 6325 });
    getScheme(schemeId).jackpotSetup(winEng);
    winEng.forceState({
      wave: 8,
      enemyHp: 10,
      enemyMaxHp: 85_000_000,
      greedMultiplier: 5000,
      pullsRemaining: 3,
    });
    const stWin = winEng.performPrimaryAction(
      schemeId === 'sigil-pachinko' ? { forceCrucibleIndex: 2 } : {}
    );
    assert.equal(stWin.victory, true, `[${schemeId}] Clearing Wave 8 must set victory === true`);
    assert.equal(stWin.pendingRelicDraft, null, `[${schemeId}] Wave 8 victory must not leave pendingRelicDraft open`);
  }
});

