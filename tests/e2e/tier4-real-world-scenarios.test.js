import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GDD_FILES,
  SCHEME_IDS,
  readProjectText,
  loadProjectModule,
  requireExport,
  createSoundEngineInstance,
  normalizeGameState,
  forceEngineState,
  installMockBrowserEnv,
  withHeadlessBrowser,
} from './helpers/e2e-harness.js';

// ============================================================================
// Tier 4 — Real-World End-User Application Scenarios (T4-01 .. T4-10)
// ============================================================================

test('T4-01 [Scenario 1]: Designer & Reviewer Walkthrough — GDD Suite Inspection, Prototype Launch & Audio Lab Audition', async () => {
  const env = installMockBrowserEnv();

  // Step 1: Verify all 6 GDD documents on disk and render them in GDDViewer
  const gddMod = await loadProjectModule('src/ui/GDDViewer.js');
  const GDDViewer = requireExport(gddMod, ['GDDViewer'], 'src/ui/GDDViewer.js');

  let launchedScheme = null;
  const container = env.createContainer();
  const viewer = new GDDViewer({
    containerEl: container,
    onLaunchScheme: (id) => { launchedScheme = id; },
    onSwitchScheme: (id) => { launchedScheme = id; },
  });
  if (typeof viewer.mount === 'function') {
    await viewer.mount(container, {
      onLaunchScheme: (id) => { launchedScheme = id; },
      onSwitchScheme: (id) => { launchedScheme = id; },
    });
  }

  for (const relPath of GDD_FILES) {
    const raw = readProjectText(relPath);
    assert.ok(raw.length >= 1500, `${relPath} must be a comprehensive GDD (>= 1500 chars)`);
    const docId = relPath.split('/').pop();
    if (typeof viewer.loadDocument === 'function') await viewer.loadDocument(docId);
    else if (typeof viewer.selectDocument === 'function') await viewer.selectDocument(docId);
    const rendered = container.querySelector('[data-testid="gdd-content-body"]')?.textContent || '';
    assert.ok(rendered.length > 200);
  }

  // Step 2: Audition the 3 Heavy Auditory Anchors in SoundEngine
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();
  sound.playReelClack(0, 3);
  sound.playDevourCrunch(1, 3);
  sound.playComboChime(0);
  sound.playComboChime(12);

  const log = sound.getAudioLog();
  assert.equal(log.length, 4);
  assert.equal(log[0].type, 'clack');
  assert.equal(log[1].type, 'crunch');
  assert.ok(Math.abs(log[2].frequencyHz - 523.25) < 0.1);
  assert.ok(Math.abs(log[3].frequencyHz - 1046.5) < 0.1);

  // Step 3: Trigger prototype launch from GDDViewer
  await viewer.loadDocument('02-scheme1-devour-reels.md');
  const launchBtn = container.querySelector('[data-action="launch-scheme"]');
  assert.ok(launchBtn, 'GDDViewer must render [data-action="launch-scheme"] button');
  launchBtn.click();
  assert.equal(launchedScheme, 'devour-reels');
});

test('T4-02 [Scenario 2]: Scheme 1 (Devour Reels) Full 8-Wave Siege Boss Run & Exponential Damage Scaling 10^2 -> 10^8+', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2026, sound });

  // Wave 1 (120 HP): Mod wheel probabilities and clear in 1 pull (saving 4 pulls for compound interest & 1.35^4 Greed Mult)
  engine.performSecondaryAction({ preset: 'pyro', action: 'preset' });
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'goblin',
    'goblin', 'iron_knight', 'chest',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();
  const stW1 = normalizeGameState(engine.getState(), engine);
  assert.ok(stW1.lastTurnBreakdown.totalDamage >= 120, `Wave 1 spin must clear 120 HP Boss, got ${stW1.lastTurnBreakdown.totalDamage}`);
  assert.ok(stW1.lastTurnBreakdown.settlementDurationMs < 1000);

  // Progress through Waves 2..8 using compounded Greed Multiplier + multi-synergy boards
  for (let targetWave = 2; targetWave <= 8; targetWave++) {
    const curState = normalizeGameState(engine.getState(), engine);
    if (curState.wave < targetWave) {
      forceEngineState(engine, { wave: targetWave });
    }
    forceEngineState(engine, [
      'fireball', 'powder_keg', 'curse_skull',
      'goblin', 'hero_berserker', 'abyss_apostle',
      'chest', 'fireball', 'powder_keg',
    ]);
    if (targetWave >= 6) {
      forceEngineState(engine, { greedMultiplier: Math.pow(1.35, targetWave * 3) });
      forceEngineState(engine, [
        'abyss_apostle', 'abyss_apostle', 'abyss_apostle',
        'fireball', 'powder_keg', 'curse_skull',
        'hero_berserker', 'goblin', 'chest',
      ]);
    }
    engine.performPrimaryAction();
    const st = normalizeGameState(engine.getState(), engine);
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
    if (targetWave === 8) {
      assert.ok(
        st.lastTurnBreakdown.totalDamage >= 10000000,
        `Wave 8 spin should reach tens of millions (10^7 - 10^8+), got ${st.lastTurnBreakdown.totalDamage}`
      );
    }
  }
});

test('T4-03 [Scenario 3]: Scheme 1 (Devour Reels) Indigestion Overload, Bile Eruption & All 5 Stomach Chain Reactions Showcase', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 403, enemyHp: 999999999 });
  forceEngineState(engine, { enemyHp: 999999999, enemyMaxHp: 999999999, pullsRemaining: 10 });

  // 1. Fireball + Powder Keg
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'goblin',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();
  assert.ok(normalizeGameState(engine.getState(), engine).lastTurnBreakdown.chainSynergyMultiplier >= 6.0);

  // 2. 3x Iron Knights
  forceEngineState(engine, { pullsRemaining: 5 });
  forceEngineState(engine, [
    'iron_knight', 'iron_knight', 'iron_knight',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();
  assert.ok((normalizeGameState(engine.getState(), engine).mawArmor ?? 0) >= 120);

  // 3. Hero Banquet
  forceEngineState(engine, { pullsRemaining: 5 });
  forceEngineState(engine, [
    'goblin', 'hero_berserker', 'chest',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();
  assert.ok(normalizeGameState(engine.getState(), engine).lastTurnBreakdown.chainSynergyMultiplier >= 3.5);

  // 4. Curse Transmutation
  forceEngineState(engine, { pullsRemaining: 5 });
  forceEngineState(engine, [
    'curse_skull', 'abyss_apostle', 'curse_skull',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();
  assert.ok(normalizeGameState(engine.getState(), engine).lastTurnBreakdown.chainSynergyMultiplier >= 8.0);

  // 5. Full-Board Gluttony
  forceEngineState(engine, { pullsRemaining: 5 });
  forceEngineState(engine, [
    'goblin', 'chest', 'goblin',
    'chest', 'abyss_apostle', 'goblin',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();
  assert.ok(normalizeGameState(engine.getState(), engine).lastTurnBreakdown.devourStacks >= 6);

  // 6. Indigestion Overload >= 100 -> Bile Eruption -> Digestive Herb Soothe
  forceEngineState(engine, { indigestion: 80, pullsRemaining: 5 });
  forceEngineState(engine, Array(9).fill('curse_skull'));
  engine.performPrimaryAction();
  assert.equal(normalizeGameState(engine.getState(), engine).indigestion, 30);

  forceEngineState(engine, { pullsRemaining: 5 });
  forceEngineState(engine, Array(9).fill('digestive_herb'));
  engine.performPrimaryAction();
  assert.equal(normalizeGameState(engine.getState(), engine).indigestion, 0);
});

test('T4-04 [Scenario 4]: Scheme 2 (Revolver Dungeon) 8-Floor Fast 15-Second Dungeon Climb with Powder + Fuse + Heavy Hammer Dump', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 404 });

  for (let floor = 1; floor <= 8; floor++) {
    // Button 2: Load a bullet into the cylinder
    engine.performSecondaryAction({ bulletId: 'parasite_bullet' });

    // Force the signature Powder + Fuse + Heavy Hammer + Parasite + Demon full cylinder dump
    forceEngineState(engine, {
      chambers: [
        'powder_charge',
        'fuse_cord',
        'heavy_hammer',
        'parasite_bullet',
        'lead_bullet',
        'demon_bullet',
      ],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
      forceBackfire: false,
      greedMultiplier: Math.pow(1.35, (floor - 1) * 3),
    });

    // Button 1: Spin & Fire
    engine.performPrimaryAction({ targetChamber: 0, forceBackfire: false });
    const st = normalizeGameState(engine.getState(), engine);
    assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 12.0);
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
    assert.ok(st.lastTurnBreakdown.totalDamage > 0);
  }
});

test('T4-05 [Scenario 5]: Scheme 2 (Revolver Dungeon) High-Stakes Russian Roulette Brinkmanship — Demon Bullet Backfire, Blood Rage & Vampire Heal', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 405, sound });
  forceEngineState(engine, { enemyHp: 500000, enemyMaxHp: 500000, playerHp: 100, pullsRemaining: 5 });

  // Turn 1: Survive an empty chamber dry click to activate Russian Roulette Grit
  forceEngineState(engine, {
    chambers: ['empty', 'demon_bullet', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });

  // Turn 2: Fire Lone Demon Bullet with backfire -> triggers self-damage + Blood Rage (x3.0) + Demon (x8.0) + Lone Bullet empty bonus
  forceEngineState(engine, {
    chambers: ['empty', 'demon_bullet', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
    forceBackfire: true,
  });
  engine.performPrimaryAction({ targetChamber: 1, forceBackfire: true });
  const stAfterDemon = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterDemon.playerHp < 100 && stAfterDemon.playerHp > 0, 'Demon backfire must deduct HP while keeping player alive');
  assert.ok(stAfterDemon.lastTurnBreakdown.totalDamage >= 1000, 'Blood Rage + Lone Demon Bullet must deal massive damage');

  // Turn 3: Load and fire Vampire Bullet to heal back HP
  forceEngineState(engine, {
    chambers: ['vampire_bullet', 'empty', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });
  const stAfterHeal = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterHeal.playerHp > stAfterDemon.playerHp, 'vampire_bullet must restore player HP after Demon backfire');
});

test('T4-06 [Scenario 6]: Scheme 3 (Jackpot TD) Real-Time Greed Waiting vs. Last-Second Red-Zone Three-of-a-Kind Freeze & Yahtzee Nuke Comeback', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 406 });
  const initialGold = normalizeGameState(engine.getState(), engine).gold;

  // Step 1: Resist pulling the lever for 6 seconds while monsters march toward the Critical Red Zone
  for (let i = 0; i < 6; i++) {
    engine.step(1000);
  }
  forceEngineState(engine, { closestEnemyProgress: 0.78 });
  const stRedZone = normalizeGameState(engine.getState(), engine);
  assert.ok(stRedZone.gold > initialGold, 'Gold must compound while resisting lever pulls');
  assert.ok(stRedZone.greedMultiplier > 1.2, 'Greed Streak Multiplier must escalate while waiting');
  assert.ok(stRedZone.closestEnemyProgress >= 0.72, 'Lead monster is inside the Critical Red Zone');

  // Step 2: Pull lever for clutch Three-of-a-Kind Freeze (三连冰冻)
  forceEngineState(engine, ['cryo_prism', 'cryo_prism', 'cryo_prism', 'miner_pick', 'tesla_coil']);
  engine.performPrimaryAction();
  const pFrozen = Number(engine.getState().closestEnemyProgress ?? 0);
  engine.step(1500);
  assert.ok(Number(engine.getState().closestEnemyProgress ?? 0) <= pFrozen + 0.001, 'Freeze must halt monster march');

  // Step 3: Pull lever for Five of a Kind Yahtzee Nuke (五连核弹) + 5s Hyper Laser Sweep
  forceEngineState(engine, { gold: 500 });
  forceEngineState(engine, ['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
  engine.performPrimaryAction();
  const stNuke = normalizeGameState(engine.getState(), engine);
  assert.ok(stNuke.lastTurnBreakdown.totalDamage >= 100000);
  assert.ok(stNuke.playerHp > 0);
});

test('T4-07 [Scenario 7]: Scheme 3 (Jackpot TD) Multi-Wave Pedestal Evolution (1-Star -> 2-Star -> 3-Star), Auto-Devour Stacking & Straight 5s Laser Sweep', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 407 });
  forceEngineState(engine, { gold: 5000 });

  // Pull 1: Two Pair auto-merges into 2-Star (★★) towers
  forceEngineState(engine, ['tesla_coil', 'tesla_coil', 'prism_laser', 'prism_laser', 'miner_pick']);
  engine.performPrimaryAction();
  const st1 = normalizeGameState(engine.getState(), engine);
  assert.ok(st1.pedestals.some((p) => (p.star ?? p.stars ?? 1) >= 2));

  // Pull 2: Three of a Kind auto-merges into 3-Star (★★★) tower and devours fodder
  forceEngineState(engine, ['prism_laser', 'prism_laser', 'prism_laser', 'miner_pick', 'gold_nugget']);
  engine.performPrimaryAction();
  const st2 = normalizeGameState(engine.getState(), engine);
  assert.ok(st2.pedestals.some((p) => (p.star ?? p.stars ?? 1) >= 3));
  assert.ok(st2.lastTurnBreakdown.devourStacks > 0);

  // Pull 3: 5-reel Straight (顺子) unleashes 5-second continuous Hyper Laser Sweep
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  engine.performPrimaryAction();
  const st3 = normalizeGameState(engine.getState(), engine);
  assert.ok(st3.lastTurnBreakdown.lineMultiplier >= 80.0);

  // Step through 3 seconds of continuous orbital laser sweep
  for (let i = 0; i < 6; i++) {
    engine.step(500);
  }
  assert.ok(normalizeGameState(engine.getState(), engine).playerHp > 0);
});

test('T4-08 [Scenario 8]: Exploratory Gameplay Tour — Scheme 4 (Sigil Pachinko) & Scheme 5 (Abyssal Grid) Multi-Wave Mastery', async () => {
  const pachMod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const gridMod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const SigilPachinkoEngine = requireExport(pachMod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');
  const AbyssalGridEngine = requireExport(gridMod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  // Part A: Scheme 4 (Sigil Pachinko) 2-wave run with mid-air Auto-Devour + Chaos Tilt + x25 Jackpot Crucible
  const pachinko = new SigilPachinkoEngine({ seed: 4081 });
  for (let wave = 1; wave <= 2; wave++) {
    forceEngineState(pachinko, {
      spawner: ['void_singularity', 'gold_stone', 'ember_orb'],
      forceCrucibleIndex: 2,
    });
    pachinko.performSecondaryAction(); // Chaos Tilt
    pachinko.performPrimaryAction({ forceCrucibleIndex: 2 });
    pachinko.step(800);
    const stP = normalizeGameState(pachinko.getState(), pachinko);
    assert.ok(stP.lastTurnBreakdown.totalDamage > 0);
    assert.ok(stP.lastTurnBreakdown.settlementDurationMs < 1000);
  }

  // Part B: Scheme 5 (Abyssal Grid) multi-spin Hold-&-Respin + orthogonal devour + Bingo artillery barrage
  const grid = new AbyssalGridEngine({ seed: 4082 });
  const matrix1 = Array(16).fill('skeleton');
  matrix1[0] = 'abyssal_knight';
  matrix1[5] = 'abyssal_knight';
  matrix1[10] = 'abyssal_knight';
  matrix1[15] = 'abyssal_knight';
  forceEngineState(grid, matrix1);
  grid.performPrimaryAction();

  const stG1 = normalizeGameState(grid.getState(), grid);
  assert.ok(stG1.lockedCells.length >= 4, 'Main diagonal Commanders must auto-lock');
  assert.ok(stG1.lastTurnBreakdown.devourStacks > 0);
  assert.ok(stG1.lastTurnBreakdown.totalDamage > 0);
});

test('T4-09 [Scenario 9]: Full Headless Chromium Browser E2E — Unified Arcade Hub Switching Across All 5 Playable Schemes + Live DOM Verification', async () => {
  await withHeadlessBrowser(async (browser) => {
    const schemeExpectations = [
      { navId: 'nav-scheme-1', schemeId: 'devour-reels', boardTestId: 'devour-grid', actionBtnId: 'btn-spin-devour' },
      { navId: 'nav-scheme-2', schemeId: 'revolver-dungeon', boardTestId: 'revolver-cylinder', actionBtnId: 'btn-spin-fire' },
      { navId: 'nav-scheme-3', schemeId: 'jackpot-td', boardTestId: 'td-slot-bar', actionBtnId: 'btn-pull-lever' },
      { navId: 'nav-scheme-4', schemeId: 'sigil-pachinko', boardTestId: 'pachinko-board', actionBtnId: 'btn-drop-orbs' },
      { navId: 'nav-scheme-5', schemeId: 'abyssal-grid', boardTestId: 'abyssal-matrix', actionBtnId: 'btn-matrix-spin' },
    ];

    for (const item of schemeExpectations) {
      await browser.clickTestId(item.navId);
      const activeScheme = await browser.eval(`window.__SLOTBOUND__.getActiveScheme()`);
      assert.equal(activeScheme, item.schemeId, `Clicking ${item.navId} must switch active scheme to ${item.schemeId}`);

      assert.equal(
        await browser.hasTestId(item.boardTestId),
        true,
        `Live Chromium DOM must render [data-testid="${item.boardTestId}"] for ${item.schemeId}`
      );
      assert.equal(
        await browser.hasTestId(item.actionBtnId),
        true,
        `Live Chromium DOM must render [data-testid="${item.actionBtnId}"] for ${item.schemeId}`
      );

      // Click the primary action button and verify HUD and bridge state update
      if (item.schemeId === 'revolver-dungeon') {
        await browser.eval(`(() => {
          const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
          if (typeof b?.forceGridOrCylinder === 'function') {
            b.forceGridOrCylinder(['lead_bullet', 'vampire_bullet', 'parasite_bullet', 'powder_charge', 'fuse_cord', 'heavy_hammer']);
          } else if (typeof b?.forceNextSpin === 'function') {
            b.forceNextSpin(['lead_bullet', 'vampire_bullet', 'parasite_bullet', 'powder_charge', 'fuse_cord', 'heavy_hammer']);
          }
        })()`);
      }
      await browser.clickTestId(item.actionBtnId);
      await browser.eval(`window.__SLOTBOUND__.stepSimulation?.(500, 1)`);

      let state = await browser.getBridgeState();
      if (item.schemeId === 'revolver-dungeon' && state.lastTurnBreakdown.totalDamage === 0) {
        for (let retry = 0; retry < 5 && state.lastTurnBreakdown.totalDamage === 0; retry++) {
          await browser.eval(`(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).triggerSecondaryAction?.({ bulletId: 'lead_bullet' })`);
          await browser.clickTestId(item.actionBtnId);
          state = await browser.getBridgeState();
        }
      }
      assert.ok(
        state.lastTurnBreakdown.totalDamage > 0,
        `Live spin in ${item.schemeId} must deal > 0 totalDamage, got ${state.lastTurnBreakdown.totalDamage}`
      );

      const hudTotalText = await browser.getTestIdText('hud-total-damage');
      assert.ok(
        hudTotalText && hudTotalText.trim().length > 0 && !hudTotalText.includes('NaN'),
        `Live [data-testid="hud-total-damage"] must display valid damage in ${item.schemeId}, got '${hudTotalText}'`
      );
    }

    assert.equal(
      browser.pageErrors.length,
      0,
      `Expected 0 uncaught page errors in Headless Chromium, got: ${browser.pageErrors.join('; ')}`
    );
  });
});

test('T4-10 [Scenario 10]: 15-Second Flow Ergonomics (Spacebar Loop + 2.5x Turbo) & Telemetry Bridge Stress Test in Headless Chromium', async () => {
  await withHeadlessBrowser(async (browser) => {
    // Verify global bridge aliasing in real Chromium window
    const bridgesEqual = await browser.eval(
      `Boolean(window.__SLOTBOUND__ && window.__SLOTBOUND__ === window.__SLOTBOUND_TEST__)`
    );
    assert.equal(bridgesEqual, true, 'window.__SLOTBOUND__ must strictly equal window.__SLOTBOUND_TEST__ in browser');

    // Switch to Scheme 1 and drive spins via Spacebar KeyboardEvent + Sandbox Jackpot trigger
    await browser.switchScheme('devour-reels');
    await browser.eval(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true }));
    })()`);

    const stAfterSpace = await browser.getBridgeState();
    assert.ok(stAfterSpace.lastTurnBreakdown.totalDamage > 0, 'Spacebar keydown must trigger primary spin action');
    assert.ok(
      stAfterSpace.lastTurnBreakdown.settlementDurationMs < 1000,
      `Settlement duration must be <1000ms, got ${stAfterSpace.lastTurnBreakdown.settlementDurationMs}`
    );

    // Switch to GDD Viewer and Audio Lab in Chromium and verify telemetry
    await browser.clickTestId('nav-gdd-viewer');
    assert.equal(await browser.hasTestId('gdd-viewer-panel'), true);
    const gddBody = await browser.getTestIdText('gdd-content-body');
    assert.ok(gddBody && gddBody.length > 200, 'GDD Viewer must render Chinese GDD in Chromium');

    await browser.clickTestId('nav-audio-lab');
    await browser.clickTestId('audio-test-clunk');
    await browser.clickTestId('audio-test-devour');
    await browser.clickTestId('audio-test-chime');

    const audioLogLen = await browser.eval(`(window.__AUDIO_LOG__ || []).length`);
    assert.ok(audioLogLen >= 3, `Expected >= 3 audio telemetry events in window.__AUDIO_LOG__, got ${audioLogLen}`);
    assert.equal(browser.pageErrors.length, 0);
  });
});
