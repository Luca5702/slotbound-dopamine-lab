/**
 * Milestone 2 Unit & Integration Test Suite: Scheme 1 《吞噬转轮》(Devour Reels)
 * Covers:
 *  - `F-S1-01`: 3×3 Grid, Central Abyssal Maw, 9 Canonical Symbols across 4 Tiers & 8 Paylines
 *  - `F-S1-02`: <1000ms 8-Way Adjacency Auto-Devour & 5 Stomach Chain Reactions
 *  - `F-S1-03`: Indigestion Meter (0..100), Bile Eruption, Wheel Probability Modder & 8 Siege Bosses
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYMBOLS,
  DEVOUR_SYMBOLS,
  SYMBOL_MAP,
  SYMBOL_CATALOG,
  PAYLINES,
  ADJACENCY_MAP,
  DEFAULT_WHEEL_WEIGHTS,
  WHEEL_PRESETS,
  BOSSES,
  SIEGE_BOSSES,
  WAVES,
  getBossForWave,
} from '../../src/games/devour-reels/config.js';
import {
  DevourReelsEngine,
  createDevourReelsEngine,
  normalizeWheelWeights,
} from '../../src/games/devour-reels/DevourReelsEngine.js';
import {
  DevourReelsView,
  createDevourReelsView,
} from '../../src/games/devour-reels/DevourReelsView.js';
import { SoundEngine } from '../../src/audio/SoundEngine.js';
import { VFXCanvas } from '../../src/ui/VFXCanvas.js';
import { HUDController } from '../../src/ui/HUDController.js';
import { applyRelic } from '../../src/core/EconomyEngine.js';

describe('F-S1-01: Scheme 1 Core — 3×3 Grid, Central Abyssal Maw & 9 Symbols Catalog', () => {
  it('defines all 9 canonical symbols across Tiers 1..4 with weights summing to 100%', () => {
    assert.equal(SYMBOLS.length, 9);
    assert.equal(DEVOUR_SYMBOLS, SYMBOLS);
    assert.equal(SYMBOL_CATALOG, SYMBOL_MAP);

    const expectedTiers = {
      goblin: 1,
      chest: 1,
      powder_keg: 1,
      curse_skull: 1,
      iron_knight: 2,
      fireball: 2,
      digestive_herb: 2,
      hero_berserker: 3,
      abyss_apostle: 4,
    };

    let weightSum = 0;
    for (const [id, tier] of Object.entries(expectedTiers)) {
      assert.ok(SYMBOL_MAP[id], `Missing symbol ${id}`);
      assert.equal(SYMBOL_MAP[id].tier, tier);
      weightSum += DEFAULT_WHEEL_WEIGHTS[id];
    }
    assert.equal(weightSum, 100);
    assert.equal(SYMBOL_MAP.digestive_herb.isPredator, false);
    assert.equal(SYMBOL_MAP.iron_knight.isPredator, true);
    assert.equal(SYMBOL_MAP.fireball.isPredator, true);
    assert.equal(SYMBOL_MAP.hero_berserker.isPredator, true);
    assert.equal(SYMBOL_MAP.abyss_apostle.isPredator, true);
  });

  it('defines 8 paylines and 8-way Moore neighborhood adjacency map', () => {
    assert.equal(PAYLINES.length, 8);
    assert.deepEqual(ADJACENCY_MAP[0], [1, 3, 4]);
    assert.deepEqual(ADJACENCY_MAP[4], [0, 1, 2, 3, 5, 6, 7, 8]);
    assert.deepEqual(ADJACENCY_MAP[8], [4, 5, 7]);
  });

  it('initializes Wave 1 Siege Boss (120 HP), 9-cell grid, 0 indigestion, and deterministic PRNG spins', () => {
    const engA = createDevourReelsEngine({ seed: 7777 });
    const engB = new DevourReelsEngine({ seed: 7777 });

    const st0 = engA.getState();
    assert.equal(st0.schemeId, 'devour-reels');
    assert.equal(st0.grid.length, 9);
    assert.equal(st0.wave, 1);
    assert.equal(st0.enemyHp, 120);
    assert.equal(st0.enemyMaxHp, 120);
    assert.equal(st0.pullsRemaining, 5);
    assert.equal(st0.indigestion, 0);

    const afterA = engA.performPrimaryAction();
    const afterB = engB.performPrimaryAction();
    assert.deepEqual(
      afterA.grid.map((c) => c.symbolId),
      afterB.grid.map((c) => c.symbolId)
    );
    assert.equal(afterA.lastTurnBreakdown.totalDamage, afterB.lastTurnBreakdown.totalDamage);
    assert.ok(afterA.lastTurnBreakdown.totalDamage > 0);
  });

  it('evaluates 8 paylines (single line, multi-line, 8-line full board, and 0-line board)', () => {
    const engine = new DevourReelsEngine({ seed: 100 });

    // Single row payline
    engine.forceNextSpin([
      'iron_knight', 'iron_knight', 'iron_knight',
      'goblin', 'chest', 'goblin',
      'chest', 'goblin', 'chest',
    ]);
    const stSingle = engine.performPrimaryAction();
    assert.ok(stSingle.lastTurnBreakdown.lineMultiplier > 1.0);

    // Multi-line (Row 0 + Main Diagonal)
    engine.reset({ seed: 100 });
    engine.forceNextSpin([
      'fireball', 'fireball', 'fireball',
      'goblin', 'fireball', 'chest',
      'goblin', 'chest', 'fireball',
    ]);
    const stMulti = engine.performPrimaryAction();
    assert.ok(stMulti.lastTurnBreakdown.lineMultiplier > stSingle.lastTurnBreakdown.lineMultiplier);

    // Full 9x identical board -> all 8 paylines
    engine.reset({ seed: 100 });
    engine.forceNextSpin(Array(9).fill('abyss_apostle'));
    const stFull = engine.performPrimaryAction();
    assert.equal(stFull.matchedPaylines.length, 8);
    assert.ok(stFull.lastTurnBreakdown.lineMultiplier >= 10);

    // Zero-payline board still feeds Maw for > 0 damage
    engine.reset({ seed: 100 });
    engine.forceNextSpin([
      'goblin', 'chest', 'goblin',
      'chest', 'goblin', 'chest',
      'chest', 'goblin', 'chest',
    ]);
    const stZero = engine.performPrimaryAction();
    assert.equal(stZero.lastTurnBreakdown.lineMultiplier, 1.0);
    assert.ok(stZero.lastTurnBreakdown.totalDamage > 0);
  });

  it('sanitizes invalid or short symbol arrays in forceState / forceNextSpin and clamps pullsRemaining >= 0', () => {
    const engine = new DevourReelsEngine({ seed: 200 });
    engine.forceState({ enemyHp: 99999999, enemyMaxHp: 99999999, pullsRemaining: 1 });
    engine.forceNextSpin(['invalid_symbol_xyz', 'goblin', null]);
    const st = engine.performPrimaryAction();
    assert.equal(st.grid.length, 9);
    assert.equal(st.grid[0].symbolId, 'goblin');
    assert.equal(st.pullsRemaining, 0);

    // Extra pull at 0 pullsRemaining stays clamped at 0
    const stAfter = engine.performPrimaryAction();
    assert.equal(stAfter.pullsRemaining, 0);
  });
});

describe('F-S1-02: Scheme 1 Auto-Devour (<1000ms) & 5 Stomach Chain Reactions', () => {
  it('enforces strict 8-way adjacency boundaries (corner cell 0 only reaches 1, 3, 4 and never 8)', () => {
    const engine = new DevourReelsEngine({ seed: 301 });
    engine.forceNextSpin([
      'iron_knight', 'digestive_herb', 'digestive_herb',
      'digestive_herb', 'digestive_herb', 'digestive_herb',
      'digestive_herb', 'digestive_herb', 'goblin',
    ]);
    const st = engine.performPrimaryAction();
    assert.equal(st.lastTurnBreakdown.devourStacks, 0);
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  });

  it('triggers Chain Reaction 1: Fireball + Powder Keg internal detonation (>= 6.0x) and logs audio events', () => {
    const sound = new SoundEngine();
    sound.clearAudioLog();
    const engine = new DevourReelsEngine({ seed: 302, sound });

    engine.forceNextSpin([
      'fireball', 'powder_keg', 'goblin',
      'goblin', 'iron_knight', 'chest',
      'goblin', 'powder_keg', 'fireball',
    ]);
    const st = engine.performPrimaryAction();
    const bd = st.lastTurnBreakdown;

    assert.ok(bd.devourStacks > 0);
    assert.ok(bd.settlementDurationMs < 1000);
    assert.ok(bd.chainSynergyMultiplier >= 6.0);
    assert.ok(bd.triggeredSynergies.some((s) => /fire|powder|爆炸|pyro|detonation/i.test(s)));

    const audioLog = sound.getAudioLog();
    assert.ok(audioLog.some((e) => e.type === 'clack'));
    assert.ok(audioLog.some((e) => e.type === 'crunch'));
    assert.ok(audioLog.some((e) => e.type === 'chime'));
    assert.ok(audioLog.some((e) => e.type === 'explosion'));

    // Verify powder_keg without fireball does NOT trigger Fireball + Powder Keg
    engine.reset({ seed: 302 });
    engine.forceNextSpin([
      'powder_keg', 'chest', 'chest',
      'chest', 'chest', 'chest',
      'chest', 'chest', 'chest',
    ]);
    const stNoFire = engine.performPrimaryAction();
    assert.equal(
      stNoFire.lastTurnBreakdown.triggeredSynergies.some((s) => /fireball|肚内连锁爆炸/i.test(s)),
      false
    );
  });

  it('triggers Chain Reaction 2 (3x Iron Knights), Chain Reaction 3 (Hero Banquet), Chain Reaction 4 (Curse Transmutation), and Chain Reaction 5 (Full-Board Gluttony)', () => {
    const engine = new DevourReelsEngine({ seed: 303, enemyHp: 99999999, enemyMaxHp: 99999999 });

    // Chain 2: 3x Iron Knights
    engine.forceNextSpin([
      'iron_knight', 'iron_knight', 'iron_knight',
      'goblin', 'chest', 'goblin',
      'goblin', 'chest', 'goblin',
    ]);
    const stIron = engine.performPrimaryAction();
    assert.ok(stIron.mawArmor >= 120);
    assert.ok(stIron.lastTurnBreakdown.chainSynergyMultiplier >= 4.5);
    assert.ok(stIron.lastTurnBreakdown.triggeredSynergies.some((s) => /iron|knight|铁甲/i.test(s)));

    // Chain 3: Hero Banquet
    const goldBefore = stIron.gold;
    engine.forceNextSpin([
      'goblin', 'hero_berserker', 'chest',
      'goblin', 'iron_knight', 'goblin',
      'chest', 'goblin', 'chest',
    ]);
    const stHero = engine.performPrimaryAction();
    assert.ok(stHero.gold > goldBefore);
    assert.ok(stHero.lastTurnBreakdown.chainSynergyMultiplier >= 3.5);
    assert.ok(stHero.lastTurnBreakdown.triggeredSynergies.some((s) => /hero|banquet|勇者/i.test(s)));

    // Chain 4: Curse Transmutation
    engine.forceState({ indigestion: 50, pullsRemaining: 5 });
    engine.forceNextSpin([
      'curse_skull', 'abyss_apostle', 'curse_skull',
      'goblin', 'chest', 'goblin',
      'goblin', 'chest', 'goblin',
    ]);
    const stCurse = engine.performPrimaryAction();
    assert.ok(stCurse.lastTurnBreakdown.chainSynergyMultiplier >= 8.0);
    assert.ok(stCurse.lastTurnBreakdown.triggeredSynergies.some((s) => /curse|诅咒|transmut/i.test(s)));

    // Chain 5: Full-Board Gluttony
    engine.forceState({ pullsRemaining: 5 });
    engine.forceNextSpin([
      'goblin', 'chest', 'goblin',
      'chest', 'abyss_apostle', 'goblin',
      'chest', 'goblin', 'chest',
    ]);
    const stGluttony = engine.performPrimaryAction();
    assert.ok(stGluttony.lastTurnBreakdown.devourStacks >= 6);
    assert.ok(stGluttony.lastTurnBreakdown.chainSynergyMultiplier >= 10.0);
    assert.ok(stGluttony.lastTurnBreakdown.triggeredSynergies.some((s) => /gluttony|full|暴食|饕餮/i.test(s)));
  });

  it('stacks multiple simultaneous stomach chain reactions multiplicatively in a single spin', () => {
    const engine = new DevourReelsEngine({ seed: 304, enemyHp: 99999999 });
    engine.forceNextSpin([
      'fireball', 'powder_keg', 'curse_skull',
      'goblin', 'hero_berserker', 'abyss_apostle',
      'chest', 'goblin', 'goblin',
    ]);
    const st = engine.performPrimaryAction();
    assert.ok(st.lastTurnBreakdown.triggeredSynergies.length >= 2);
    assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 15.0);
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  });
});

describe('F-S1-03: Indigestion Meter, Bile Eruption, Probability Modder, 8 Siege Bosses & DevourReelsView', () => {
  it('accumulates indigestion, triggers Bile Eruption at >= 100 (resetting to 30), supports acid_reflux_core relic, and clamps at 0 on digestive_herb', () => {
    const engine = new DevourReelsEngine({ seed: 401, enemyHp: 99999999 });

    // Accumulate indigestion >= 30 from 3x curse_skull + 6x goblin
    engine.forceNextSpin([
      'curse_skull', 'curse_skull', 'curse_skull',
      'goblin', 'goblin', 'goblin',
      'goblin', 'goblin', 'goblin',
    ]);
    const st1 = engine.performPrimaryAction();
    assert.ok(st1.indigestion >= 30);

    // Trigger Bile Eruption at >= 100 -> resets to 30
    engine.forceState({ indigestion: 85, pullsRemaining: 5 });
    engine.forceNextSpin(Array(9).fill('curse_skull'));
    const stErupt = engine.performPrimaryAction();
    assert.equal(stErupt.indigestion, 30);
    assert.ok(stErupt.lastTurnBreakdown.triggeredSynergies.some((s) => /bile|acid|酸液/i.test(s)));

    // Acid Reflux Core relic upgrades Bile Eruption to x15.0
    applyRelic(engine.economy, 'acid_reflux_core');
    engine.forceState({ indigestion: 90, pullsRemaining: 5 });
    engine.forceNextSpin(Array(9).fill('curse_skull'));
    const stOverdrive = engine.performPrimaryAction();
    assert.equal(stOverdrive.indigestion, 30);
    assert.ok(stOverdrive.lastTurnBreakdown.chainSynergyMultiplier >= 15.0);

    // 9x digestive_herb clamps indigestion strictly at 0
    engine.forceState({ indigestion: 15, pullsRemaining: 5 });
    engine.forceNextSpin(Array(9).fill('digestive_herb'));
    const stHerb = engine.performPrimaryAction();
    assert.equal(stHerb.indigestion, 0);
  });

  it('mods wheel probabilities via boost, banish, and 3 presets while preserving 100% sum and ignoring invalid inputs', () => {
    const engine = new DevourReelsEngine({ seed: 402 });
    const baseFireball = engine.getState().wheelProbabilities.fireball;

    engine.performSecondaryAction({ action: 'boost', symbolId: 'fireball' });
    const boosted = engine.getState().wheelProbabilities;
    assert.ok(boosted.fireball > baseFireball);

    for (let i = 0; i < 25; i++) {
      engine.performSecondaryAction({ action: 'banish', symbolId: 'goblin' });
      engine.performSecondaryAction({ action: 'boost', symbolId: 'fireball' });
    }
    const clamped = engine.getState().wheelProbabilities;
    assert.ok(clamped.goblin >= 0);
    assert.ok(clamped.fireball <= 100);
    const total = Object.values(clamped).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 0.2);

    // Presets: pyro, iron, gluttony
    engine.performSecondaryAction({ preset: 'pyro' });
    const pyro = engine.getState().wheelProbabilities;
    assert.ok(pyro.fireball + pyro.powder_keg > 35);

    engine.performSecondaryAction({ preset: 'iron' });
    const iron = engine.getState().wheelProbabilities;
    assert.ok(iron.iron_knight >= 20);

    engine.performSecondaryAction({ preset: 'gluttony' });
    const glut = engine.getState().wheelProbabilities;
    assert.ok(glut.hero_berserker + glut.abyss_apostle >= 20);

    // Unknown symbol/preset ignored safely
    engine.performSecondaryAction({ action: 'boost', symbolId: 'non_existent_999' });
    engine.performSecondaryAction({ preset: 'invalid_preset' });
    assert.equal(engine.getState().wheelProbabilities.non_existent_999, undefined);
    assert.deepEqual(normalizeWheelWeights({}), DEFAULT_WHEEL_WEIGHTS);
  });

  it('verifies all 8 Siege Bosses (120 HP to 85,000,000 HP) and clean Wave 8 victory transition', () => {
    assert.equal(BOSSES.length, 8);
    assert.equal(SIEGE_BOSSES, BOSSES);
    assert.equal(WAVES, BOSSES);
    const expectedHps = [120, 650, 3800, 25000, 180000, 1500000, 12000000, 85000000];
    for (let i = 0; i < 8; i++) {
      assert.equal(BOSSES[i].hp, expectedHps[i]);
      assert.equal(getBossForWave(i + 1).maxHp, expectedHps[i]);
    }

    const engine = new DevourReelsEngine({ seed: 403 });
    engine.forceState({ wave: 8, enemyHp: 100, enemyMaxHp: 85000000, greedMultiplier: 1000 });
    engine.forceNextSpin(Array(9).fill('abyss_apostle'));
    const stClear = engine.performPrimaryAction();
    assert.equal(stClear.enemyHp, 0);
    assert.equal(stClear.victory, true);
  });

  it('mounts DevourReelsView, renders all required data-testid attributes, and handles spin & probability actions', () => {
    const engine = new DevourReelsEngine({ seed: 404 });
    const sound = new SoundEngine();
    const vfx = new VFXCanvas();
    const hudContainer = { innerHTML: '' };
    const hud = new HUDController(hudContainer);
    const stageContainer = { innerHTML: '' };

    const view = createDevourReelsView(engine, { sound, vfx, hud });
    assert.ok(view instanceof DevourReelsView);
    view.mount(stageContainer, { engine, sound, vfx, hud });

    const requiredTestIds = [
      'devour-grid',
      'devour-cell-0',
      'devour-cell-1',
      'devour-cell-2',
      'devour-cell-3',
      'devour-cell-4',
      'devour-cell-5',
      'devour-cell-6',
      'devour-cell-7',
      'devour-cell-8',
      'abyssal-maw',
      'indigestion-meter',
      'btn-spin-devour',
      'prob-mod-panel',
      'prob-boost-fireball',
      'prob-boost-powder_keg',
      'prob-preset-pyro',
      'prob-preset-iron',
      'prob-preset-gluttony',
    ];

    for (const id of requiredTestIds) {
      assert.ok(
        stageContainer.innerHTML.includes(`data-testid="${id}"`),
        `DevourReelsView missing data-testid="${id}"`
      );
    }

    // Trigger Spacebar spin & hotkey presets
    view.onKeyDown({ code: 'Space', key: ' ', preventDefault() {} });
    view.onKeyDown({ code: 'Space', key: ' ', repeat: true, preventDefault() {} });
    view.onKeyDown({ key: '1' });
    view.onKeyDown({ key: '2' });
    view.onKeyDown({ key: '3' });
    assert.ok(engine.getState().lastTurnBreakdown.totalDamage > 0);

    view.unmount();
    assert.equal(stageContainer.innerHTML, '');
  });

  it('F-R2-03: supports active [R] Belch Bile Purge, Gold-backed Maw Upgrade Workshop, Overtime Boss counter-attacks with mawArmor absorption, and Post-Wave Relic Draft + Endless Mode', () => {
    const engine = new DevourReelsEngine({ seed: 405, gold: 300 });

    // 1. Active [R] Belch Bile Purge only triggers when indigestion >= 50
    engine.forceState({ indigestion: 30, enemyHp: 10000, enemyMaxHp: 10000 });
    engine.purgeBile();
    assert.equal(engine.getState().indigestion, 30);

    engine.forceState({ indigestion: 75, enemyHp: 10000, enemyMaxHp: 10000 });
    const stPurged = engine.purgeBile();
    assert.equal(stPurged.indigestion, 30);
    assert.equal(stPurged.bilePurgeActive, true);
    assert.ok(stPurged.enemyHp < 10000);

    // 2. Gold-backed Maw Upgrade Workshop
    const goldBeforeWorkshop = stPurged.gold;
    const stUpgraded = engine.upgradeMaw('buy_armor');
    assert.ok(stUpgraded.gold < goldBeforeWorkshop);
    assert.ok(stUpgraded.mawArmor >= 60);

    // 3. Overtime Boss Counter-Attack & mawArmor hit absorption
    const unarmored = new DevourReelsEngine({ seed: 406 });
    unarmored.forceState({
      wave: 4,
      enemyHp: 500000,
      enemyMaxHp: 500000,
      pullsRemaining: 0,
      playerHp: 100,
      mawArmor: 0,
      grid: Array(9).fill('goblin'),
    });
    const stUnarmored = unarmored.performPrimaryAction();
    assert.ok(stUnarmored.playerHp < 100);

    const armored = new DevourReelsEngine({ seed: 406 });
    armored.forceState({
      wave: 4,
      enemyHp: 500000,
      enemyMaxHp: 500000,
      pullsRemaining: 0,
      playerHp: 100,
      mawArmor: 80,
      grid: Array(9).fill('goblin'),
    });
    const stArmored = armored.performPrimaryAction();
    assert.equal(stArmored.playerHp, 100);
    assert.ok(stArmored.mawArmor < 80);

    // 4. Post-Wave 3-Card Relic Draft, Non-Blocking Auto-Advance, and Wave 9+ Endless Mode
    const draftEngine = new DevourReelsEngine({ seed: 407 });
    draftEngine.forceState({ wave: 1, enemyHp: 10, enemyMaxHp: 120, pullsRemaining: 4 });
    draftEngine.forceNextSpin(Array(9).fill('fireball'));
    const stWaveClear = draftEngine.performPrimaryAction();
    assert.equal(stWaveClear.wave, 2);
    assert.ok(Array.isArray(stWaveClear.pendingRelicDraft));
    assert.equal(stWaveClear.pendingRelicDraft.length, 3);

    // Non-blocking auto-advance on next spin (with surviving Wave 2 Boss)
    draftEngine.forceState({ enemyHp: 99999999, enemyMaxHp: 99999999, grid: Array(9).fill('goblin') });
    const stAutoAdvance = draftEngine.performPrimaryAction();
    assert.equal(stAutoAdvance.pendingRelicDraft, null);
    assert.equal(stAutoAdvance.ownedRelics.length, 1);

    // Wave 8 Clear -> Victory -> Enter Wave 9+ Endless Mode
    draftEngine.forceState({ wave: 8, enemyHp: 10, enemyMaxHp: 85000000, greedMultiplier: 5000 });
    draftEngine.forceNextSpin(Array(9).fill('abyss_apostle'));
    const stVictory = draftEngine.performPrimaryAction();
    assert.equal(stVictory.victory, true);

    const stEndless = draftEngine.enterEndless();
    assert.equal(stEndless.endlessMode, true);
    assert.equal(stEndless.wave, 9);
    assert.ok(stEndless.enemyMaxHp > 85000000);
  });
});

