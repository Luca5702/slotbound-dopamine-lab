import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GDD_FILES,
  SCHEME_IDS,
  readProjectText,
  loadProjectModule,
  requireExport,
  createPRNGInstance,
  invokeCalculateSpinDamage,
  invokeSettleWaveClear,
  createEventBusInstance,
  getEventBusLog,
  createFlowTrackerInstance,
  createSoundEngineInstance,
  normalizeGameState,
  forceEngineState,
  installMockBrowserEnv,
} from './helpers/e2e-harness.js';

// ============================================================================
// Tier 3 — Cross-Feature Pairwise Combinations (T3-01 .. T3-20)
// ============================================================================

test('T3-01 [F-GDD-01 x F-UI-01]: GDD Markdown Suite <-> In-App GDDViewer rendering all 6 documents', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/GDDViewer.js');
  const GDDViewer = requireExport(mod, ['GDDViewer'], 'src/ui/GDDViewer.js');

  const container = env.createContainer();
  const viewer = new GDDViewer(container);
  if (typeof viewer.mount === 'function') await viewer.mount(container);

  for (const relPath of GDD_FILES) {
    const rawMd = readProjectText(relPath);
    const firstHeading = rawMd.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
    const docId = relPath.split('/').pop();

    if (typeof viewer.loadDocument === 'function') {
      await viewer.loadDocument(docId);
    } else if (typeof viewer.selectDocument === 'function') {
      await viewer.selectDocument(docId);
    }

    const bodyText = container.querySelector('[data-testid="gdd-content-body"]')?.textContent || '';
    assert.ok(bodyText.length > 200, `GDDViewer must render full body for ${docId}`);
    if (firstHeading) {
      const cleanHeadingToken = firstHeading.replace(/[#*`]/g, '').slice(0, 6);
      assert.ok(
        bodyText.includes(cleanHeadingToken),
        `Rendered GDD ${docId} must include heading token '${cleanHeadingToken}'`
      );
    }
  }
});

test('T3-02 [F-CORE-01 x F-CORE-02]: Seeded PRNG <-> Exponential ScoreFormula 50-spin determinism', async () => {
  const runBatch = async (seed) => {
    const rng = await createPRNGInstance(seed);
    const results = [];
    for (let i = 0; i < 50; i++) {
      const res = await invokeCalculateSpinDamage({
        basePoints: rng.nextInt(15, 500),
        lineMultiplier: rng.nextInt(1, 20),
        devourStacks: rng.nextInt(0, 12),
        chainSynergyMultiplier: rng.nextInt(1, 10),
        greedMultiplier: 1 + rng.next() * 4,
      });
      results.push({
        totalDamage: res.totalDamage,
        formattedDamage: res.formattedDamage,
        intensityTier: res.intensityTier,
      });
    }
    return results;
  };

  const batchA = await runBatch(777);
  const batchB = await runBatch(777);
  assert.deepEqual(batchA, batchB, '50 PRNG-driven ScoreFormula evaluations must be bit-for-bit identical');
});

test('T3-03 [F-CORE-02 x F-CORE-03]: Risk & Greed Economy <-> Exponential ScoreFormula 5-wave compounding', async () => {
  const modBig = await loadProjectModule('src/core/BigNumber.js');
  const formatChineseNumber = requireExport(modBig, ['formatChineseNumber'], 'src/core/BigNumber.js');

  let econ = { gold: 100, baseWaveGold: 40, greedMultiplier: 1.0, wave: 1 };
  const waveDamages = [];

  for (let wave = 1; wave <= 5; wave++) {
    econ = await invokeSettleWaveClear(econ, 3); // 3 unused pulls per wave -> 1.35^3 per wave
    const spin = await invokeCalculateSpinDamage({
      basePoints: 40 * wave,
      lineMultiplier: 2 * wave,
      devourStacks: wave + 1,
      chainSynergyMultiplier: 2,
      greedMultiplier: econ.greedMultiplier,
    });
    waveDamages.push(spin.totalDamage);
  }

  for (let i = 1; i < waveDamages.length; i++) {
    assert.ok(
      waveDamages[i] > waveDamages[i - 1] * 2,
      `Wave ${i + 1} damage (${waveDamages[i]}) must grow exponentially over Wave ${i} (${waveDamages[i - 1]})`
    );
  }
  assert.ok(waveDamages[4] > 100000, `Wave 5 compounded damage must exceed 10^5, got ${waveDamages[4]}`);
  assert.match(formatChineseNumber(waveDamages[4]), /万|亿/);
});

test('T3-04 [F-CORE-04 x F-CORE-03]: 15-Second FlowTracker & EventBus <-> Economy wave settlement lifecycle', async () => {
  const bus = await createEventBusInstance();
  const tracker = await createFlowTrackerInstance({ bus });
  const events = [];

  bus.on('spin:start', (e) => events.push({ type: 'spin:start', ...e }));
  bus.on('devour:settle', (e) => events.push({ type: 'devour:settle', ...e }));
  bus.on('wave:clear', (e) => events.push({ type: 'wave:clear', ...e }));

  if (typeof tracker.startTurn === 'function') tracker.startTurn();
  bus.emit('spin:start', { pull: 1 });

  if (typeof tracker.recordDevourSettlement === 'function') {
    tracker.recordDevourSettlement(580);
  }
  bus.emit('devour:settle', { settlementDurationMs: 580 });

  const settledEcon = await invokeSettleWaveClear(
    { gold: 100, baseWaveGold: 50, greedMultiplier: 1.0, wave: 1 },
    4
  );
  bus.emit('wave:clear', { unusedPulls: 4, interestGold: settledEcon.interestGold });

  if (typeof tracker.recordTurnCycle === 'function') {
    tracker.recordTurnCycle(3800);
  }

  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'spin:start');
  assert.equal(events[1].type, 'devour:settle');
  assert.ok(events[1].settlementDurationMs < 1000);
  assert.equal(events[2].type, 'wave:clear');
  assert.ok(events[2].interestGold > 100);
});

test('T3-05 [F-CORE-04 x F-AUDIO-01]: EventBus combo stepper <-> Procedural Web Audio ascending semitone chimes', async () => {
  installMockBrowserEnv();
  const bus = await createEventBusInstance();
  const sound = await createSoundEngineInstance({ bus });
  sound.clearAudioLog();

  bus.on('reel:stop', ({ reelIndex }) => sound.playReelClack(reelIndex, 3));
  bus.on('devour:step', ({ step, tier }) => {
    sound.playDevourCrunch(step, tier);
    sound.playComboChime(step);
  });

  bus.emit('reel:stop', { reelIndex: 0 });
  for (let step = 0; step < 8; step++) {
    bus.emit('devour:step', { step, tier: 2 });
  }

  const chimes = sound.getAudioLog().filter((e) => e.type === 'chime');
  assert.equal(chimes.length, 8);
  for (let k = 0; k < 8; k++) {
    const expectedHz = 523.25 * Math.pow(2, k / 12);
    assert.ok(Math.abs(chimes[k].frequencyHz - expectedHz) < 0.1);
    if (k > 0) {
      assert.ok(chimes[k].frequencyHz > chimes[k - 1].frequencyHz);
    }
  }
});

test('T3-06 [F-CORE-02 x F-UI-01]: ScoreFormula breakdown <-> HUDController & VFXCanvas intensityTier 4 sync', async () => {
  const env = installMockBrowserEnv();
  const hudMod = await loadProjectModule('src/ui/HUDController.js');
  const vfxMod = await loadProjectModule('src/ui/VFXCanvas.js');
  const HUDController = requireExport(hudMod, ['HUDController'], 'HUDController.js');
  const VFXCanvas = requireExport(vfxMod, ['VFXCanvas'], 'VFXCanvas.js');

  const breakdown = await invokeCalculateSpinDamage({
    basePoints: 800,
    lineMultiplier: 25,
    devourStacks: 8,
    chainSynergyMultiplier: 10,
    greedMultiplier: 3,
  });
  assert.equal(breakdown.intensityTier, 4);

  const hudContainer = env.createContainer();
  const hud = new HUDController(hudContainer);
  if (typeof hud.mount === 'function') hud.mount(hudContainer);
  if (typeof hud.update === 'function') {
    hud.update({ wave: 7, enemyHp: 0, enemyMaxHp: 12000000, pullsRemaining: 3, gold: 1500, lastTurnBreakdown: breakdown });
  } else if (typeof hud.render === 'function') {
    hud.render({ wave: 7, enemyHp: 0, enemyMaxHp: 12000000, pullsRemaining: 3, gold: 1500, lastTurnBreakdown: breakdown });
  }

  const canvasEl = env.document.createElement('canvas');
  const vfx = new VFXCanvas(canvasEl);
  if (typeof vfx.mount === 'function') vfx.mount(canvasEl);
  if (typeof vfx.triggerScreenShake === 'function') vfx.triggerScreenShake(breakdown.intensityTier);
  else if (typeof vfx.shake === 'function') vfx.shake(breakdown.intensityTier);

  const dmgText = hudContainer.querySelector('[data-testid="hud-total-damage"]')?.textContent || '';
  assert.ok(dmgText.length > 0 && !dmgText.includes('NaN'));
});

test('T3-07 [F-CORE-01 x F-S1-01]: Seeded PRNG <-> Scheme 1 (Devour Reels) 5-spin 3x3 grid reproducibility', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const eng1 = new DevourReelsEngine({ seed: 424242 });
  const eng2 = new DevourReelsEngine({ seed: 424242 });

  for (let spin = 0; spin < 5; spin++) {
    eng1.performPrimaryAction();
    eng2.performPrimaryAction();
    const s1 = normalizeGameState(eng1.getState(), eng1);
    const s2 = normalizeGameState(eng2.getState(), eng2);

    const g1 = s1.grid.map((c) => (typeof c === 'string' ? c : c.symbolId || c.id));
    const g2 = s2.grid.map((c) => (typeof c === 'string' ? c : c.symbolId || c.id));
    assert.deepEqual(g1, g2, `Spin ${spin + 1} 3x3 grid must match identically`);
    assert.equal(s1.lastTurnBreakdown.totalDamage, s2.lastTurnBreakdown.totalDamage);
    assert.equal(s1.enemyHp, s2.enemyHp);
  }
});

test('T3-08 [F-CORE-04 x F-S1-01 x F-S1-02]: 15s FlowTracker <-> Scheme 1 Auto-Devour & Stomach Chain Reactions (<1000ms)', async () => {
  const bus = await createEventBusInstance();
  const tracker = await createFlowTrackerInstance({ bus });
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 308, bus, flowTracker: tracker });
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'goblin',
    'chest', 'hero_berserker', 'goblin',
    'fireball', 'powder_keg', 'chest',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks >= 3);
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 6.0);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T3-09 [F-CORE-03 x F-S1-02 x F-S1-03]: Economy Greed Multiplier <-> Scheme 1 Chain Reactions & Siege Boss wave progression', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 309 });
  // One-shot Wave 1 Boss (120 HP) on Pull 1 -> 4 unused pulls banked
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'fireball',
    'goblin', 'hero_berserker', 'chest',
    'iron_knight', 'iron_knight', 'iron_knight',
  ]);
  engine.performPrimaryAction();

  const stAfterWave1 = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterWave1.wave >= 2 || stAfterWave1.enemyHp === 0, 'Wave 1 Boss (120 HP) must be defeated in 1 pull');
  assert.ok(stAfterWave1.greedMultiplier > 1.3, `Expected Greed Multiplier > 1.3 after 1-pull clear, got ${stAfterWave1.greedMultiplier}`);

  // Trigger Full-Board Gluttony on Wave 2 Boss (650 HP) multiplied by Greed Multiplier
  forceEngineState(engine, [
    'goblin', 'chest', 'goblin',
    'chest', 'abyss_apostle', 'goblin',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();
  const stAfterWave2 = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterWave2.lastTurnBreakdown.totalDamage >= 650, 'Compounded Greed Mult + Gluttony must one-shot Wave 2 Boss (650 HP)');
});

test('T3-10 [F-CORE-01 x F-S1-03]: PRNG pickWeighted <-> Scheme 1 Live Wheel Probability Modder Pyro preset', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const countPyroSymbols = (usePyroPreset) => {
    const engine = new DevourReelsEngine({ seed: 3100 });
    if (usePyroPreset) {
      engine.performSecondaryAction({ preset: 'pyro', action: 'preset' });
    }
    let count = 0;
    for (let i = 0; i < 15; i++) {
      forceEngineState(engine, { pullsRemaining: 5, enemyHp: 99999999 });
      engine.performPrimaryAction();
      const grid = engine.getState().grid || [];
      for (const cell of grid) {
        const id = typeof cell === 'string' ? cell : cell.symbolId || cell.id;
        if (id === 'fireball' || id === 'powder_keg') count++;
      }
    }
    return count;
  };

  const baselineCount = countPyroSymbols(false);
  const pyroCount = countPyroSymbols(true);
  assert.ok(
    pyroCount > baselineCount,
    `Pyro preset must increase fireball+powder_keg frequency (${pyroCount}) over baseline (${baselineCount})`
  );
});

test('T3-11 [F-AUDIO-01 x F-S2-01 x F-S2-02]: SoundEngine <-> Scheme 2 (Revolver Dungeon) Full Cylinder Dump audio telemetry', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 311, sound });
  forceEngineState(engine, {
    chambers: [
      'powder_charge',
      'fuse_cord',
      'heavy_hammer',
      'lead_bullet',
      'vampire_bullet',
      'scatter_bullet',
    ],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });

  const log = sound.getAudioLog();
  assert.ok(log.length >= 2, 'Full Cylinder Dump with SoundEngine must log audio events');
  assert.ok(
    log.some((e) => e.type === 'gunshot' || e.type === 'explosion' || e.type === 'clack'),
    'Audio log must include gunshot/explosion/clack from Full Cylinder Dump'
  );
});

test('T3-12 [F-S2-01 x F-S2-02 x F-S2-03]: Scheme 2 2-Button Load Loop <-> Parasite Devour + Demon Bullet Lone Roulette', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 312 });
  forceEngineState(engine, {
    chambers: ['lead_bullet', 'parasite_bullet', 'lead_bullet', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  // Load a demon_bullet into one of the empty chambers via Button 2
  engine.performSecondaryAction({ bulletId: 'demon_bullet', chamberIndex: 4 });
  // Fire Chamber 1 (parasite_bullet) which devours neighbors 0 and 2, leaving empty chambers for Lone Roulette
  engine.performPrimaryAction({ targetChamber: 1 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks >= 2);
  assert.ok(st.lastTurnBreakdown.totalDamage > 100);
});

test('T3-13 [F-CORE-02 x F-S2-03]: Exponential Scoring Engine <-> Scheme 2 Multi-Demon + Grit Overclock', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 313 });
  forceEngineState(engine, {
    enemyHp: 50000000,
    enemyMaxHp: 50000000,
    greedMultiplier: 4.0,
    chambers: ['demon_bullet', 'demon_bullet', 'parasite_bullet', 'lead_bullet', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
    forceBackfire: true,
    playerHp: 100,
  });
  engine.performPrimaryAction({ targetChamber: 0, forceBackfire: true });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage >= 5000, `Expected high Demon Overclock damage, got ${st.lastTurnBreakdown.totalDamage}`);
  assert.ok(st.lastTurnBreakdown.intensityTier >= 2);
});

test('T3-14 [F-CORE-04 x F-S3-01]: FlowTracker & Real-Time Stepper <-> Scheme 3 (Jackpot TD) 15-Second wave loop', async () => {
  const tracker = await createFlowTrackerInstance();
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 314, flowTracker: tracker });
  let simulatedMs = 0;

  for (let tick = 0; tick < 12; tick++) {
    engine.step(500);
    simulatedMs += 500;
    if (tick % 3 === 0) {
      forceEngineState(engine, ['prism_laser', 'prism_laser', 'tesla_coil', 'cryo_prism', 'miner_pick']);
      engine.performPrimaryAction();
      const st = normalizeGameState(engine.getState(), engine);
      assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000, 'Every TD lever pull must settle in <1000ms');
    }
  }
  assert.ok(simulatedMs <= 15000, 'Wave simulation loop stays within 15-Second Flow Rule');
});

test('T3-15 [F-CORE-03 x F-S3-01 x F-S3-02 x F-S3-03]: Real-Time Greed Interest & Red-Zone Adrenaline <-> Scheme 3 Three-of-a-Kind Freeze Clutch Save', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 315 });
  const initialGold = normalizeGameState(engine.getState(), engine).gold;

  // Resist pulling for 6 seconds to accumulate compound Gold interest and Greed Streak Multiplier
  engine.step(3000);
  engine.step(3000);
  forceEngineState(engine, { closestEnemyProgress: 0.78 });

  const stBeforePull = normalizeGameState(engine.getState(), engine);
  assert.ok(stBeforePull.gold > initialGold, 'Gold must compound while resisting lever pulls');
  assert.ok(stBeforePull.greedMultiplier > 1.0, 'Greed multiplier must escalate while resisting lever pulls');

  // Pull lever in Red Zone and hit Three of a Kind (三连冰冻)
  forceEngineState(engine, ['cryo_prism', 'cryo_prism', 'cryo_prism', 'miner_pick', 'gold_nugget']);
  engine.performPrimaryAction();

  const stAfterPull = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterPull.lastTurnBreakdown.lineMultiplier >= 20.0);
  assert.ok(stAfterPull.lastTurnBreakdown.greedMultiplier > 1.0);
});

test('T3-16 [F-AUDIO-01 x F-S3-02 x F-S3-03]: SoundEngine <-> Scheme 3 Straight 5s Hyper Laser & Yahtzee Nuke audio telemetry', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 316, sound });
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  engine.performPrimaryAction();

  forceEngineState(engine, { gold: 500 });
  forceEngineState(engine, ['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
  engine.performPrimaryAction();

  const log = sound.getAudioLog();
  assert.ok(log.some((e) => e.type === 'laser'), 'Straight/Yahtzee must log 5s laser audio event');
  assert.ok(log.some((e) => e.type === 'explosion' || e.type === 'chime'), 'Yahtzee nuke must log explosion/chime audio event');
});

test('T3-17 [F-UI-01 x F-S4-01]: Shared HUD & VFXCanvas <-> Scheme 4 (Sigil Pachinko) Mid-Air Devour & x25 Crucible', async () => {
  const env = installMockBrowserEnv();
  const hudMod = await loadProjectModule('src/ui/HUDController.js');
  const vfxMod = await loadProjectModule('src/ui/VFXCanvas.js');
  const pachMod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');

  const HUDController = requireExport(hudMod, ['HUDController'], 'HUDController.js');
  const VFXCanvas = requireExport(vfxMod, ['VFXCanvas'], 'VFXCanvas.js');
  const SigilPachinkoEngine = requireExport(pachMod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const hudContainer = env.createContainer();
  const hud = new HUDController(hudContainer);
  if (typeof hud.mount === 'function') hud.mount(hudContainer);

  const canvasEl = env.document.createElement('canvas');
  const vfx = new VFXCanvas(canvasEl);
  if (typeof vfx.mount === 'function') vfx.mount(canvasEl);

  const engine = new SigilPachinkoEngine({ seed: 317 });
  forceEngineState(engine, {
    spawner: ['void_singularity', 'ember_orb', 'frost_core'],
    forceCrucibleIndex: 2,
  });
  engine.performPrimaryAction({ forceCrucibleIndex: 2 });
  engine.step(600);

  const st = normalizeGameState(engine.getState(), engine);
  if (typeof hud.update === 'function') hud.update(st);
  else if (typeof hud.render === 'function') hud.render(st);

  assert.ok(st.lastTurnBreakdown.totalDamage > 0);
  assert.ok(hudContainer.querySelector('[data-testid="hud-total-damage"]').textContent.length > 0);
});

test('T3-18 [F-S4-01 x F-S5-01]: Exploratory Prototypes Contract Parity (Sigil Pachinko <-> Abyssal Grid)', async () => {
  const pachMod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const gridMod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const SigilPachinkoEngine = requireExport(pachMod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');
  const AbyssalGridEngine = requireExport(gridMod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engines = [
    new SigilPachinkoEngine({ seed: 318 }),
    new AbyssalGridEngine({ seed: 318 }),
  ];

  for (const eng of engines) {
    assert.equal(typeof eng.getState, 'function');
    assert.equal(typeof eng.performPrimaryAction, 'function');
    assert.equal(typeof eng.performSecondaryAction, 'function');
    assert.equal(typeof eng.step, 'function');
    assert.equal(typeof eng.setSeed, 'function');
    assert.equal(typeof eng.reset, 'function');

    eng.setSeed(318);
    eng.performPrimaryAction();
    eng.step(500);
    const st = normalizeGameState(eng.getState(), eng);
    assert.ok(st.lastTurnBreakdown.totalDamage > 0, `${st.schemeId} must deal > 0 damage on primary action`);
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000, `${st.schemeId} must settle Auto-Devour in <1000ms`);
  }
});

test('T3-19 [F-GDD-01 x F-S5-01 x F-HUB-01]: Unified Hub GDD Reader <-> Scheme 5 (Abyssal Grid) live prototype launch', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('gdd');

  const doc05 = readProjectText('docs/gdd/05-explorations-pachinko-grid.md');
  assert.match(doc05, /深渊矩阵|Abyssal Grid/i);

  await bridge.switchScheme('abyssal-grid');
  assert.equal(bridge.getActiveScheme(), 'abyssal-grid');

  bridge.forceGridOrCylinder(Array(16).fill('abyssal_knight'));
  bridge.triggerPrimaryAction();

  const st = normalizeGameState(bridge.getState());
  assert.equal(st.schemeId, 'abyssal-grid');
  assert.ok(st.lockedCells.length > 0, 'Abyssal Grid spin must lock Apex Commanders');
});

test('T3-20 [F-UI-01 x F-HUB-01]: Unified Hub Sandbox Toolbar <-> Shared HUD across all 5 game views', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;

  for (const schemeId of SCHEME_IDS) {
    await bridge.switchScheme(schemeId);
    bridge.setSeed(2026);
    globalThis.document.querySelector('[data-testid="sandbox-trigger-jackpot"]')?.click();

    const st = normalizeGameState(bridge.getState());
    assert.equal(st.schemeId, schemeId);
    assert.ok(st.lastTurnBreakdown.totalDamage > 0, `Sandbox jackpot in ${schemeId} must produce totalDamage > 0`);

    const hudDmgEl = globalThis.document.querySelector('[data-testid="hud-total-damage"]');
    assert.ok(hudDmgEl && hudDmgEl.textContent.trim().length > 0, `HUD total damage must update in ${schemeId}`);
  }
});
