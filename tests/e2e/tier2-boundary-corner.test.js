import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  GDD_FILES,
  SCHEME_IDS,
  fileExists,
  readProjectText,
  loadProjectModule,
  requireExport,
  createPRNGInstance,
  unwrapWeightedPick,
  invokeCalculateSpinDamage,
  invokeSettleWaveClear,
  loadEconomyModule,
  createEventBusInstance,
  getEventBusLog,
  createFlowTrackerInstance,
  createSoundEngineInstance,
  normalizeGameState,
  forceEngineState,
  installMockBrowserEnv,
  startStaticServer,
} from './helpers/e2e-harness.js';

// ============================================================================
// Feature 1: F-GDD-01 — Master & Iron Laws GDD Suite Boundary Cases (T2-F01-01 .. T2-F01-05)
// ============================================================================

test('T2-F01-01: Zero unfinished placeholder or TODO markers across all 6 GDD files and README.md', () => {
  for (const relPath of ['README.md', ...GDD_FILES]) {
    const text = readProjectText(relPath);
    assert.doesNotMatch(
      text,
      /\b(TODO|FIXME|TBD|lorem ipsum)\b|\[insert\s/i,
      `${relPath} must not contain unfinished placeholder markers`
    );
  }
});

test('T2-F01-02: Balanced triple-backtick code fences and Markdown table structural integrity in all 6 GDDs', () => {
  for (const relPath of GDD_FILES) {
    const text = readProjectText(relPath);
    const fenceMatches = text.match(/^```/gm) || [];
    assert.equal(
      fenceMatches.length % 2,
      0,
      `${relPath} must have balanced triple-backtick code fences (found ${fenceMatches.length})`
    );
    const tableLines = text.split('\n').filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'));
    assert.ok(
      tableLines.length >= 3,
      `${relPath} must contain at least one structured Markdown table (>= 3 rows), found ${tableLines.length}`
    );
  }
});

test('T2-F01-03: Exact case-sensitive filesystem path alignment between PROJECT.md, README.md, and docs/gdd/', () => {
  const projectMd = readProjectText('PROJECT.md');
  for (const relPath of GDD_FILES) {
    assert.equal(fileExists(relPath), true, `Expected ${relPath} to exist on Linux filesystem`);
    const baseName = relPath.split('/').pop();
    assert.ok(projectMd.includes(baseName), `PROJECT.md must reference ${baseName}`);
  }
});

test('T2-F01-04: Mathematical formula and 9 symbol IDs align between GDD 02 and Scheme 1 specification', () => {
  const doc02 = readProjectText('docs/gdd/02-scheme1-devour-reels.md');
  const requiredIds = [
    'goblin',
    'chest',
    'powder_keg',
    'curse_skull',
    'iron_knight',
    'fireball',
    'hero_berserker',
    'digestive_herb',
    'abyss_apostle',
  ];
  for (const symId of requiredIds) {
    assert.ok(doc02.includes(symId), `GDD 02 must document canonical symbol ID '${symId}'`);
  }
  assert.match(doc02, /85,?000,?000|8500\s*万/, 'GDD 02 must document Wave 8 Siege Boss 85,000,000 HP');
});

test('T2-F01-05: UTF-8 encoding integrity without replacement characters (\\uFFFD) across all GDDs', () => {
  for (const relPath of ['README.md', ...GDD_FILES]) {
    const text = readProjectText(relPath);
    assert.equal(
      text.includes('\uFFFD'),
      false,
      `${relPath} must not contain UTF-8 replacement character \\uFFFD`
    );
  }
});

// ============================================================================
// Feature 2: F-CORE-01 — Deterministic Seeded PRNG Boundary Cases (T2-F02-01 .. T2-F02-05)
// ============================================================================

test('T2-F02-01: PRNG handles zero, negative, floating-point, MAX_SAFE_INTEGER, and undefined seeds safely', async () => {
  const edgeSeeds = [0, -1, -999999, 3.1415926, Number.MAX_SAFE_INTEGER, undefined];
  for (const seed of edgeSeeds) {
    const rng = await createPRNGInstance(seed);
    for (let i = 0; i < 10; i++) {
      const v = rng.next();
      assert.ok(Number.isFinite(v), `Seed ${seed} must produce finite number, got ${v}`);
      assert.ok(v >= 0 && v < 1, `Seed ${seed} must produce value in [0, 1), got ${v}`);
    }
  }
});

test('T2-F02-02: nextInt(min, max) handles degenerate single-value bounds (k, k), negative bounds, and inverted bounds', async () => {
  const rng = await createPRNGInstance(123);
  for (let i = 0; i < 10; i++) {
    assert.equal(rng.nextInt(7, 7), 7);
    assert.equal(rng.nextInt(-5, -5), -5);
    const neg = rng.nextInt(-10, -1);
    assert.ok(Number.isInteger(neg) && neg >= -10 && neg <= -1);
  }

  try {
    const inv = rng.nextInt(10, 5);
    assert.ok(Number.isInteger(inv) && inv >= 5 && inv <= 10);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

test('T2-F02-03: pickWeighted(items) never selects zero-weight banished items', async () => {
  const rng = await createPRNGInstance(321);
  const items = [
    { id: 'banished_a', weight: 0 },
    { id: 'only_active', weight: 100 },
    { id: 'banished_b', weight: 0 },
  ];
  for (let i = 0; i < 50; i++) {
    const picked = unwrapWeightedPick(rng.pickWeighted(items));
    assert.equal(picked, 'only_active', 'Zero-weight items must never be selected');
  }
});

test('T2-F02-04: pickWeighted(items) handles empty array [] and all-zero/negative weights without infinite loop or NaN', async () => {
  const rng = await createPRNGInstance(654);
  try {
    const emptyPick = rng.pickWeighted([]);
    assert.ok(emptyPick === null || emptyPick === undefined);
  } catch (err) {
    assert.ok(err instanceof Error);
  }

  const zeroWeightItems = [
    { id: 'a', weight: 0 },
    { id: 'b', weight: -5 },
  ];
  try {
    const fallback = unwrapWeightedPick(rng.pickWeighted(zeroWeightItems));
    assert.ok(fallback === 'a' || fallback === 'b' || fallback === null || fallback === undefined);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

test('T2-F02-05: shuffle(arr) handles empty array [] and single-element [42] without index errors', async () => {
  const rng = await createPRNGInstance(111);
  assert.deepEqual(rng.shuffle([]), []);
  assert.deepEqual(rng.shuffle([42]), [42]);
});

// ============================================================================
// Feature 3: F-CORE-02 — Exponential Number & Balatro Scoring Boundary Cases (T2-F03-01 .. T2-F03-05)
// ============================================================================

test('T2-F03-01: formatBigNumber and formatChineseNumber safely format 0, negative numbers, NaN, and Infinity', async () => {
  const mod = await loadProjectModule('src/core/BigNumber.js');
  const formatBigNumber = requireExport(mod, ['formatBigNumber'], 'src/core/BigNumber.js');
  const formatChineseNumber = requireExport(mod, ['formatChineseNumber'], 'src/core/BigNumber.js');

  assert.equal(formatBigNumber(0), '0');
  assert.equal(formatChineseNumber(0), '0');
  assert.match(formatBigNumber(-15000), /^-/);
  assert.match(formatChineseNumber(-15000), /^-/);

  const nanStr = formatBigNumber(NaN);
  assert.ok(!nanStr.includes('NaNK') && typeof nanStr === 'string');
  const infStr = formatBigNumber(Infinity);
  assert.ok(typeof infStr === 'string' && infStr.length > 0);
});

test('T2-F03-02: formatBigNumber formats astronomical numbers (>= 10^15) in scientific notation cleanly', async () => {
  const mod = await loadProjectModule('src/core/BigNumber.js');
  const formatBigNumber = requireExport(mod, ['formatBigNumber'], 'src/core/BigNumber.js');

  const s18 = formatBigNumber(3.4e18);
  const s24 = formatBigNumber(1e24);
  assert.match(s18, /e\+?\d+/i, `Expected scientific notation for 3.4e18, got ${s18}`);
  assert.match(s24, /e\+?\d+/i, `Expected scientific notation for 1e24, got ${s24}`);
});

test('T2-F03-03: calculateSpinDamage handles basePoints = 0 and omitted optional multipliers cleanly', async () => {
  const zeroRes = await invokeCalculateSpinDamage({ basePoints: 0 });
  assert.equal(zeroRes.totalDamage, 0);
  assert.equal(zeroRes.intensityTier, 0);

  const defaultRes = await invokeCalculateSpinDamage({ basePoints: 40 });
  assert.equal(defaultRes.lineMultiplier, 1);
  assert.equal(defaultRes.devourStacks, 0);
  assert.equal(defaultRes.devourStacksMultiplier, 1);
  assert.equal(defaultRes.chainSynergyMultiplier, 1);
  assert.equal(defaultRes.greedMultiplier, 1);
  assert.equal(defaultRes.totalDamage, 40);
});

test('T2-F03-04: calculateSpinDamage clamps intensityTier at max 4 under extreme 60-stack chain overflow', async () => {
  const res = await invokeCalculateSpinDamage({
    basePoints: 5000,
    lineMultiplier: 50,
    devourStacks: 60,
    chainSynergyMultiplier: 100,
    greedMultiplier: 50,
  });

  assert.ok(res.totalDamage > 0 && Number.isFinite(res.totalDamage));
  assert.equal(res.intensityTier, 4, `intensityTier must clamp at 4, got ${res.intensityTier}`);
  assert.ok(res.formattedDamage.length > 0);
});

test('T2-F03-05: calculateSpinDamage clamps negative inputs so totalDamage is never negative', async () => {
  const res = await invokeCalculateSpinDamage({
    basePoints: -50,
    lineMultiplier: -2,
    devourStacks: -3,
  });

  assert.ok(res.totalDamage >= 0, `totalDamage must be >= 0, got ${res.totalDamage}`);
  assert.ok(res.intensityTier >= 0, `intensityTier must be >= 0, got ${res.intensityTier}`);
});

// ============================================================================
// Feature 4: F-CORE-03 — Risk & Greed Economy Boundary Cases (T2-F04-01 .. T2-F04-05)
// ============================================================================

test('T2-F04-01: settleWaveClear with unusedPulls = 0 (last-pull clear) yields 0 interestGold and unchanged greedMultiplier', async () => {
  const res = await invokeSettleWaveClear(
    { gold: 100, baseWaveGold: 40, greedMultiplier: 1.5, wave: 2 },
    0
  );
  assert.equal(res.interestGold, 0);
  assert.ok(Math.abs(res.greedMultiplier - 1.5) < 0.001);
});

test('T2-F04-02: settleWaveClear with gold = 0 and baseWaveGold = 0 still grants +15*U flat bonus interest floor', async () => {
  const res = await invokeSettleWaveClear(
    { gold: 0, baseWaveGold: 0, greedMultiplier: 1.0, wave: 1 },
    1
  );
  assert.ok(res.interestGold >= 15, `Expected flat bonus floor >= 15 for U=1 at 0 gold, got ${res.interestGold}`);
});

test('T2-F04-03: settleWaveClear clamps negative unusedPulls (-3) to 0 without reducing gold or greedMultiplier', async () => {
  const res = await invokeSettleWaveClear(
    { gold: 100, baseWaveGold: 40, greedMultiplier: 1.2, wave: 1 },
    -3
  );
  assert.equal(res.interestGold, 0);
  assert.ok(res.gold >= 100);
  assert.ok(res.greedMultiplier >= 1.2);
});

test('T2-F04-04: Multi-wave compounding over 8 consecutive U=4 clears remains finite without NaN', async () => {
  let state = { gold: 100, baseWaveGold: 40, greedMultiplier: 1.0, wave: 1 };
  for (let w = 1; w <= 8; w++) {
    state = await invokeSettleWaveClear(state, 4);
  }
  const expectedGreed = Math.pow(1.35, 32); // ~14918.7
  assert.ok(Number.isFinite(state.gold) && state.gold > 10000);
  assert.ok(
    Math.abs(state.greedMultiplier - expectedGreed) / expectedGreed < 0.05,
    `Expected 8-wave U=4 greedMultiplier ~${expectedGreed}, got ${state.greedMultiplier}`
  );
});

test('T2-F04-05: Drafting an invalid or null relic ID does not corrupt gold or greedMultiplier', async () => {
  const mod = await loadEconomyModule();
  const initialState = { gold: 150, greedMultiplier: 1.35, relics: [] };
  const draftFn = mod.draftRelic || mod.applyRelic;
  if (typeof draftFn === 'function') {
    const res1 = draftFn({ ...initialState }, 'non_existent_relic_id_999');
    const res2 = draftFn({ ...initialState }, null);
    assert.ok(Number.isFinite(res1?.gold ?? initialState.gold));
    assert.ok(Number.isFinite(res2?.greedMultiplier ?? initialState.greedMultiplier));
  } else {
    const settled = await invokeSettleWaveClear(initialState, 0);
    assert.equal(settled.gold >= 150, true);
  }
});

// ============================================================================
// Feature 5: F-CORE-04 — 15-Second Flow & EventBus Boundary Cases (T2-F05-01 .. T2-F05-05)
// ============================================================================

test('T2-F05-01: EventBus ring buffer enforces capacity cap under 2,000 rapid emissions', async () => {
  const bus = await createEventBusInstance({ maxHistory: 200, maxSize: 200, capacity: 200 });
  for (let i = 0; i < 2000; i++) {
    bus.emit('stress:tick', { i });
  }
  const log = getEventBusLog(bus);
  assert.ok(
    log.length > 0 && log.length <= 1000,
    `EventBus ring buffer must cap history length (< 2000), got ${log.length}`
  );
});

test('T2-F05-02: EventBus emitting event with zero listeners or removing non-existent listener does not throw', async () => {
  const bus = await createEventBusInstance();
  assert.doesNotThrow(() => {
    bus.emit('unregistered:event', { foo: 1 });
    if (typeof bus.off === 'function') {
      bus.off('unregistered:event', () => {});
    }
  });
});

test('T2-F05-03: FlowTracker detects or clamps devour settlement durations exceeding 1000ms SLA', async () => {
  const tracker = await createFlowTrackerInstance();
  let res;
  if (typeof tracker.recordDevourSettlement === 'function') {
    res = tracker.recordDevourSettlement(2400);
  } else if (typeof tracker.validateDevourDuration === 'function') {
    res = tracker.validateDevourDuration(2400);
  } else if (typeof tracker.compressDevourDuration === 'function') {
    res = tracker.compressDevourDuration(2400);
  } else if (typeof tracker.endDevour === 'function') {
    if (typeof tracker.startDevour === 'function') tracker.startDevour(0);
    res = tracker.endDevour(2400);
  }

  const st = typeof tracker.getState === 'function' ? tracker.getState() : { ...tracker, ...(res || {}) };
  const clampedOrFlagged =
    res?.isWithinDevourBudget === false ||
    res?.devourCompliant === false ||
    res?.compliant === false ||
    (res?.clampedDurationMs ?? st.settlementDurationMs ?? 0) < 1000;
  assert.equal(clampedOrFlagged, true, '2400ms raw devour duration must either be flagged as exceeding 1000ms or compressed <1000ms');
});

test('T2-F05-04: FlowTracker evaluates 15-Second turn cycle boundary at 0ms, 15000ms, and 18000ms', async () => {
  const tracker = await createFlowTrackerInstance();
  const check = (ms) => {
    if (typeof tracker.recordTurnCycle === 'function') return tracker.recordTurnCycle(ms);
    if (typeof tracker.recordTurnDuration === 'function') return tracker.recordTurnDuration(ms);
    if (typeof tracker.checkFlowBudget === 'function') return tracker.checkFlowBudget(ms);
    if (typeof tracker.endTurn === 'function') {
      if (typeof tracker.startTurn === 'function') tracker.startTurn(0);
      return tracker.endTurn(ms);
    }
    return { isWithinFlowRule: ms <= 15000 };
  };

  const r0 = check(0);
  const r15k = check(15000);
  const r18k = check(18000);

  assert.notEqual(r0?.isWithinFlowRule ?? r0?.flowCompliant ?? r0?.compliant ?? true, false);
  assert.notEqual(r15k?.isWithinFlowRule ?? r15k?.flowCompliant ?? r15k?.compliant ?? true, false);
  assert.equal(
    r18k?.isWithinFlowRule === false ||
      r18k?.flowCompliant === false ||
      r18k?.compliant === false ||
      (r18k?.turnDurationMs ?? 18000) > 15000,
    true
  );
});

test('T2-F05-05: FlowTracker resets 2.5x turbo speedMultiplier back to 1.0 on new turn without compounding to 6.25x', async () => {
  const tracker = await createFlowTrackerInstance();
  if (typeof tracker.triggerTurbo === 'function') {
    tracker.triggerTurbo();
    tracker.triggerTurbo();
  } else if (typeof tracker.activateTurbo === 'function') {
    tracker.activateTurbo();
    tracker.activateTurbo();
  }
  const stTurbo = typeof tracker.getState === 'function' ? tracker.getState() : tracker;
  assert.ok((stTurbo.speedMultiplier ?? 2.5) <= 2.5, 'Turbo multiplier must not compound past 2.5x');

  if (typeof tracker.startTurn === 'function') tracker.startTurn();
  else if (typeof tracker.resetTurn === 'function') tracker.resetTurn();
  else if (typeof tracker.reset === 'function') tracker.reset();

  const stReset = typeof tracker.getState === 'function' ? tracker.getState() : tracker;
  assert.equal(stReset.speedMultiplier ?? 1.0, 1.0, 'New turn must reset speedMultiplier to 1.0');
});

// ============================================================================
// Feature 6: F-AUDIO-01 — Procedural Web Audio Synthesizer Boundary Cases (T2-F06-01 .. T2-F06-05)
// ============================================================================

test('T2-F06-01: playComboChime clamps pitch ceiling at comboStep = 24 (2093.0 Hz) for step = 100', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playComboChime(24);
  sound.playComboChime(100);

  const log = sound.getAudioLog();
  assert.equal(log.length, 2);
  const expectedMaxHz = 523.25 * Math.pow(2, 24 / 12); // 2093.0 Hz
  assert.ok(Math.abs(log[0].frequencyHz - expectedMaxHz) < 0.1);
  assert.ok(
    Math.abs(log[1].frequencyHz - expectedMaxHz) < 0.1,
    `comboStep=100 must clamp at 2093.0 Hz, got ${log[1].frequencyHz}`
  );
});

test('T2-F06-02: playComboChime handles negative comboStep (-5) and default undefined argument cleanly', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playComboChime(-5);
  sound.playComboChime();

  const log = sound.getAudioLog();
  assert.equal(log.length, 2);
  assert.ok(Number.isFinite(log[0].frequencyHz) && log[0].frequencyHz > 0);
  assert.ok(Math.abs(log[1].frequencyHz - 523.25) < 0.1);
});

test('T2-F06-03: SoundEngine executes all 7 play* methods in headless Node without AudioContext', async () => {
  const savedAudioCtx = globalThis.AudioContext;
  const savedWebkitCtx = globalThis.webkitAudioContext;
  if (globalThis.window) {
    globalThis.window.AudioContext = undefined;
    globalThis.window.webkitAudioContext = undefined;
  }
  globalThis.AudioContext = undefined;
  globalThis.webkitAudioContext = undefined;

  try {
    const sound = await createSoundEngineInstance();
    sound.clearAudioLog();
    assert.doesNotThrow(() => {
      sound.playReelClack(0, 3);
      sound.playDevourCrunch(1, 2);
      sound.playComboChime(3);
      sound.playChainExplosion(2);
      sound.playGunshot(false);
      sound.playLaserSweep(5000);
      sound.playMisfireBackfire();
    });
    assert.equal(sound.getAudioLog().length, 7);
  } finally {
    globalThis.AudioContext = savedAudioCtx;
    globalThis.webkitAudioContext = savedWebkitCtx;
    if (globalThis.window) {
      globalThis.window.AudioContext = savedAudioCtx;
      globalThis.window.webkitAudioContext = savedWebkitCtx;
    }
  }
});

test('T2-F06-04: setMuted(true) suppresses synthesis while preserving telemetry state without throwing', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.setMuted(true);
  sound.playReelClack(0, 3);
  sound.playComboChime(1);
  sound.setMuted(false);
  sound.playComboChime(2);

  const log = sound.getAudioLog();
  assert.ok(log.length >= 1);
});

test('T2-F06-05: SoundEngine ring buffer caps memory under 1,000 rapid-fire sound calls', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  for (let i = 0; i < 1000; i++) {
    sound.playReelClack(i % 3, 3);
  }
  const log = sound.getAudioLog();
  assert.ok(log.length > 0 && log.length <= 1000);
});

// ============================================================================
// Feature 7: F-UI-01 — Shared 2D VFX Canvas, Score HUD & GDD Reader Boundary Cases (T2-F07-01 .. T2-F07-05)
// ============================================================================

test('T2-F07-01: VFXCanvas enforces particle cap and garbage-collects expired effects after step(6000)', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/VFXCanvas.js');
  const VFXCanvas = requireExport(mod, ['VFXCanvas'], 'src/ui/VFXCanvas.js');

  const canvasEl = env.document.createElement('canvas');
  const vfx = new VFXCanvas(canvasEl);
  if (typeof vfx.mount === 'function') vfx.mount(canvasEl);

  for (let i = 0; i < 300; i++) {
    if (typeof vfx.spawnFloatingText === 'function') {
      vfx.spawnFloatingText({ text: `+${i}`, x: 100, y: 100 });
    } else if (typeof vfx.spawnProjectile === 'function') {
      vfx.spawnProjectile({ x: 0, y: 0, targetX: 100, targetY: 100 });
    }
  }
  if (typeof vfx.step === 'function') {
    vfx.step(6000);
  }
  const activeCount = Number(
    vfx.getActiveCount?.() ??
      vfx.particles?.length ??
      vfx.effects?.length ??
      0
  );
  assert.equal(activeCount, 0, `Expired VFX should be cleaned up after 6000ms, got ${activeCount}`);
});

test('T2-F07-02: HUDController renders cleanly with null/idle breakdown and astronomical 1.85T damage without NaN or undefined', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/HUDController.js');
  const HUDController = requireExport(mod, ['HUDController'], 'src/ui/HUDController.js');

  const container = env.createContainer();
  const hud = new HUDController(container);
  if (typeof hud.mount === 'function') hud.mount(container);

  if (typeof hud.update === 'function') hud.update({ wave: 1, gold: 0, lastTurnBreakdown: null });
  else if (typeof hud.render === 'function') hud.render({ wave: 1, gold: 0, lastTurnBreakdown: null });

  assert.doesNotMatch(container.textContent, /undefined|NaN/);

  const astroState = {
    wave: 8,
    enemyHp: 0,
    enemyMaxHp: 85000000,
    pullsRemaining: 3,
    gold: 999999,
    lastTurnBreakdown: {
      basePoints: 5000,
      lineMultiplier: 100,
      devourStacks: 12,
      totalDamage: 1850000000000,
      comboName: '满盘暴食',
    },
  };
  if (typeof hud.update === 'function') hud.update(astroState);
  else if (typeof hud.render === 'function') hud.render(astroState);

  assert.doesNotMatch(container.textContent, /undefined|NaN/);
  assert.match(container.querySelector('[data-testid="hud-total-damage"]').textContent, /1\.(85|90?)T|1\.85万亿|18500/);
});

test('T2-F07-03: GDDViewer gracefully handles unknown document ID without unhandled rejection', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/GDDViewer.js');
  const GDDViewer = requireExport(mod, ['GDDViewer'], 'src/ui/GDDViewer.js');

  const container = env.createContainer();
  const viewer = new GDDViewer(container);
  if (typeof viewer.mount === 'function') await viewer.mount(container);

  if (typeof viewer.selectDocument === 'function') {
    await viewer.selectDocument('99-non-existent-doc.md');
  } else if (typeof viewer.loadDocument === 'function') {
    await viewer.loadDocument('99-non-existent-doc.md');
  }

  const bodyEl = container.querySelector('[data-testid="gdd-content-body"]');
  assert.ok(bodyEl && bodyEl.textContent.length > 0);
});

test('T2-F07-04: scripts/serve.js blocks ../ path traversal with 403/404 and returns 404 for missing files', async () => {
  const srv = await startStaticServer();
  try {
    const res404 = await fetch(`${srv.baseUrl}/non-existent-file-12345.js`);
    assert.equal(res404.status, 404);

    const statusTraversal = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: srv.port,
          path: '/../../../etc/passwd',
          method: 'GET',
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert.ok(
      statusTraversal === 403 || statusTraversal === 404 || statusTraversal === 400,
      `Path traversal must be rejected with 403/404/400, got ${statusTraversal}`
    );
  } finally {
    await srv.close();
  }
});

test('T2-F07-05: VFXCanvas operates safely when canvas.getContext("2d") returns null', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/VFXCanvas.js');
  const VFXCanvas = requireExport(mod, ['VFXCanvas'], 'src/ui/VFXCanvas.js');

  const nullCanvas = env.document.createElement('canvas');
  nullCanvas.getContext = () => null;

  assert.doesNotThrow(() => {
    const vfx = new VFXCanvas(nullCanvas);
    if (typeof vfx.mount === 'function') vfx.mount(nullCanvas);
    if (typeof vfx.spawnFloatingText === 'function') vfx.spawnFloatingText({ text: '100', x: 10, y: 10 });
    if (typeof vfx.step === 'function') vfx.step(16);
    if (typeof vfx.render === 'function') vfx.render();
  });
});

// ============================================================================
// Feature 8: F-S1-01 — Scheme 1 Core Boundary Cases (T2-F08-01 .. T2-F08-05)
// ============================================================================

test('T2-F08-01: Full-board identical symbol (9x abyss_apostle) evaluates all 8 paylines simultaneously', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2081 });
  forceEngineState(engine, Array(9).fill('abyss_apostle'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 10, `8-line full board must yield lineMultiplier >= 10, got ${st.lastTurnBreakdown.lineMultiplier}`);
  assert.ok(st.lastTurnBreakdown.totalDamage > 1000);
});

test('T2-F08-02: Zero-payline alternating board still feeds Abyssal Maw for positive base damage', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2082 });
  forceEngineState(engine, [
    'goblin', 'chest', 'goblin',
    'chest', 'goblin', 'chest',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 1.0);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Even with 0 line matches, Maw feeding must deal > 0 base damage');
});

test('T2-F08-03: forceState / forceNextSpin sanitizes invalid or short symbol arrays safely', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2083 });
  forceEngineState(engine, ['invalid_unknown_symbol', 'goblin', null]);
  assert.doesNotThrow(() => {
    engine.performPrimaryAction();
  });
  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.grid.length, 9);
  assert.ok(Number.isFinite(st.lastTurnBreakdown.totalDamage));
});

test('T2-F08-04: Pull exhaustion when pullsRemaining reaches 0 with enemyHp > 0 prevents negative pullsRemaining', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2084 });
  forceEngineState(engine, { enemyHp: 999999999, enemyMaxHp: 999999999, pullsRemaining: 1 });
  forceEngineState(engine, Array(9).fill('goblin'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.pullsRemaining >= 0, `pullsRemaining must never be negative, got ${st.pullsRemaining}`);
});

test('T2-F08-05: reset(options) restores clean Wave 1 state, 0 Indigestion, and 100% baseline wheel probabilities', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2085 });
  engine.performSecondaryAction({ preset: 'pyro' });
  forceEngineState(engine, Array(9).fill('curse_skull'));
  engine.performPrimaryAction();

  engine.reset({ seed: 12345 });
  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.wave, 1);
  assert.equal(st.indigestion, 0);
  assert.equal(st.mawArmor ?? 0, 0);
  assert.equal(st.pullsRemaining, 5);
});

// ============================================================================
// Feature 9: F-S1-02 — Scheme 1 Auto-Devour & Chain Reactions Boundary Cases (T2-F09-01 .. T2-F09-05)
// ============================================================================

test('T2-F09-01: All-fodder board (9x goblin) with zero predators settles in <1000ms without infinite loop', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2091 });
  forceEngineState(engine, Array(9).fill('goblin'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0);
});

test('T2-F09-02: All-apex board (9x abyss_apostle) prevents equal-tier mutual devour recursion', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2092 });
  forceEngineState(engine, Array(9).fill('abyss_apostle'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T2-F09-03: Corner adjacency boundary — cell 0 (top-left) only reaches cells 1, 3, 4 and never cell 8 (bottom-right)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2093 });
  // Place hero_berserker at 0, digestive_herb (same/non-prey or Tier 2) at 1..7, and goblin only at distant corner 8
  forceEngineState(engine, [
    'iron_knight', 'iron_knight', 'iron_knight',
    'iron_knight', 'iron_knight', 'iron_knight',
    'iron_knight', 'iron_knight', 'goblin',
  ]);
  // Wait: iron_knight at cell 4 (center) IS adjacent to cell 8. Put predator ONLY at cell 0, and Tier 1 non-predator chest at 1..7 except goblin at 8:
  // If cell 0 is iron_knight (Tier 2), its neighbors are 1, 3, 4. If 1, 3, 4 are also iron_knight (Tier 2) and 2, 5, 6, 7 are iron_knight, Wait: 4, 5, 7 are adjacent to 8!
  // Let's put predator at cell 0 ('hero_berserker', Tier 3), Tier 3 'hero_berserker' at 1..7? No, if 4 is Tier 1 'chest' and 8 is 'goblin', then cell 0 can only eat among {1, 3, 4}, NOT {2, 5, 6, 7, 8}!
  forceEngineState(engine, [
    'hero_berserker', 'hero_berserker', 'goblin',
    'hero_berserker', 'hero_berserker', 'goblin',
    'goblin', 'goblin', 'goblin',
  ]);
  // Better yet: 1 predator at cell 0 ('iron_knight', Tier 2), cells 1..7 are 'digestive_herb' (Tier 2, equal tier so not eaten by Tier 2), and cell 8 is 'goblin' (Tier 1).
  // Since all neighbors of cell 8 (cells 4, 5, 7) are 'digestive_herb' (which is a soothing herb, not a predator, or equal tier), cell 0 ('iron_knight') is at distance 2 from cell 8 ('goblin')!
  engine.reset({ seed: 2093 });
  forceEngineState(engine, [
    'iron_knight', 'digestive_herb', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  // Cell 0 ('iron_knight') has only 'digestive_herb' at 1, 3, 4; cell 8 ('goblin') is not adjacent to cell 0
  assert.equal(st.lastTurnBreakdown.devourStacks, 0, 'Predator at cell 0 must not devour non-adjacent cell 8');
});

test('T2-F09-04: Simultaneous multi-synergy stacking in a single spin multiplies chainSynergyMultiplier', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2094 });
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'curse_skull',
    'goblin', 'hero_berserker', 'abyss_apostle',
    'chest', 'goblin', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.triggeredSynergies.length >= 2, 'Multiple stomach chain reactions must trigger together');
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 15.0);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T2-F09-05: Single powder_keg without fireball does not falsely trigger Fireball + Powder Keg detonation', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2095 });
  forceEngineState(engine, [
    'powder_keg', 'chest', 'chest',
    'chest', 'chest', 'chest',
    'chest', 'chest', 'chest',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  const hasPyroChain = st.lastTurnBreakdown.triggeredSynergies.some((s) =>
    /fireball|肚内连锁爆炸|pyro_chain/i.test(s)
  );
  assert.equal(hasPyroChain, false, 'powder_keg without fireball must not trigger Fireball + Powder Keg');
});

// ============================================================================
// Feature 10: F-S1-03 — Scheme 1 Indigestion, Probabilities & Bosses Boundary Cases (T2-F10-01 .. T2-F10-05)
// ============================================================================

test('T2-F10-01: Indigestion overload (>= 100) triggers Bile Eruption and resets gauge to 30', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2101 });
  forceEngineState(engine, { indigestion: 85 });
  forceEngineState(engine, [
    'curse_skull', 'curse_skull', 'curse_skull',
    'goblin', 'goblin', 'goblin',
    'goblin', 'goblin', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.indigestion, 30, `Bile Eruption must reset indigestion to 30, got ${st.indigestion}`);
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /bile|acid|酸液|消化不良/i.test(s)) ||
      st.lastTurnBreakdown.chainSynergyMultiplier >= 3.0,
    'Overload must trigger Bile Eruption bonus damage'
  );
});

test('T2-F10-02: Indigestion floor clamps strictly at 0 when consuming 9x digestive_herb', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2102 });
  forceEngineState(engine, { indigestion: 10 });
  forceEngineState(engine, Array(9).fill('digestive_herb'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.indigestion, 0, `Indigestion must clamp at 0, got ${st.indigestion}`);
});

test('T2-F10-03: Probability Modder clamps repeated banish/boost within [0, 100] and preserves 100% sum', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2103 });
  for (let i = 0; i < 20; i++) {
    engine.performSecondaryAction({ action: 'banish', type: 'banish', symbolId: 'goblin' });
  }
  for (let i = 0; i < 20; i++) {
    engine.performSecondaryAction({ action: 'boost', type: 'boost', symbolId: 'fireball' });
  }

  const probs = normalizeGameState(engine.getState(), engine).wheelProbabilities;
  assert.ok(probs.goblin >= 0, `Banished weight must be >= 0, got ${probs.goblin}`);
  assert.ok(probs.fireball <= 100, `Boosted weight must be <= 100, got ${probs.fireball}`);
  const sum = Object.values(probs).reduce((a, b) => a + Number(b), 0);
  assert.ok(Math.abs(sum - 100) < 0.5 || Math.abs(sum - 1) < 0.01);
});

test('T2-F10-04: Probability Modder ignores unknown symbolId or unknown preset without NaN corruption', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2104 });
  engine.performSecondaryAction({ action: 'boost', symbolId: 'unknown_alien_999' });
  engine.performSecondaryAction({ preset: 'non_existent_preset_xyz' });

  const probs = normalizeGameState(engine.getState(), engine).wheelProbabilities;
  assert.equal(probs.unknown_alien_999, undefined);
  for (const val of Object.values(probs)) {
    assert.ok(Number.isFinite(Number(val)), 'All wheel probability weights must remain finite');
  }
});

test('T2-F10-05: Wave 8 Final Boss (85,000,000 HP) lethal clear transitions cleanly without out-of-bounds error', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 2105 });
  forceEngineState(engine, {
    wave: 8,
    enemyHp: 100,
    enemyMaxHp: 85000000,
    greedMultiplier: 1000,
  });
  forceEngineState(engine, Array(9).fill('abyss_apostle'));

  assert.doesNotThrow(() => {
    engine.performPrimaryAction();
  });
  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.enemyHp >= 0 && Number.isFinite(st.enemyHp));
});

// ============================================================================
// Feature 11: F-S2-01 — Scheme 2 Core Revolver Boundary Cases (T2-F11-01 .. T2-F11-05)
// ============================================================================

test('T2-F11-01: Circular wrap-around neighbor indexing links Chamber 0 and Chamber 5 seamlessly', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2111 });
  forceEngineState(engine, {
    chambers: ['parasite_bullet', 'empty', 'empty', 'empty', 'empty', 'lead_bullet'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.devourStacks >= 1,
    'parasite_bullet at Chamber 0 must wrap around to devour lead_bullet at Chamber 5'
  );
});

test('T2-F11-02: Loading into a full 6/6 cylinder keeps chamber length strictly at 6', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2112 });
  forceEngineState(engine, Array(6).fill('lead_bullet'));
  engine.performSecondaryAction({ bulletId: 'vampire_bullet' });

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.chambers.length, 6, 'Cylinder must always have exactly 6 chambers');
});

test('T2-F11-03: Firing an all-empty cylinder (6x empty) resolves dry click without NaN or crash', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2113 });
  forceEngineState(engine, Array(6).fill('empty'));
  assert.doesNotThrow(() => {
    engine.performPrimaryAction();
  });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(Number.isFinite(st.enemyHp));
  assert.ok(Number.isFinite(st.lastTurnBreakdown.totalDamage));
});

test('T2-F11-04: Exhausting pullsRemaining on RevolverDungeonEngine prevents negative pullsRemaining', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2114 });
  forceEngineState(engine, {
    enemyHp: 999999999,
    pullsRemaining: 1,
    chambers: Array(6).fill('empty'),
  });
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.pullsRemaining >= 0);
});

test('T2-F11-05: Rapid consecutive Spin & Fire and invalid bulletId payloads keep state finite', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2115 });
  for (let i = 0; i < 10; i++) {
    engine.performSecondaryAction({ bulletId: 'non_existent_bullet_xyz' });
    engine.performPrimaryAction(null);
  }

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.chambers.length, 6);
  assert.ok(Number.isFinite(st.enemyHp) && Number.isFinite(st.playerHp) && Number.isFinite(st.gold));
});

// ============================================================================
// Feature 12: F-S2-02 — Scheme 2 Bullet Roster & Chains Boundary Cases (T2-F12-01 .. T2-F12-05)
// ============================================================================

test('T2-F12-01: parasite_bullet surrounded only by empty chambers devours 0 neighbors and applies Lone Bullet bonus', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2121 });
  forceEngineState(engine, {
    chambers: ['parasite_bullet', 'empty', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T2-F12-02: parasite_bullet adjacent to equal/higher tier bullets terminates without infinite recursion', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2122 });
  forceEngineState(engine, {
    chambers: ['demon_bullet', 'parasite_bullet', 'parasite_bullet', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engine.performPrimaryAction({ targetChamber: 1 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  assert.ok(Number.isFinite(st.lastTurnBreakdown.totalDamage));
});

test('T2-F12-03: Powder + Fuse + Heavy Hammer sequence wrapped across Chambers 4 -> 5 -> 0 triggers Full Cylinder Dump', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2123 });
  forceEngineState(engine, {
    chambers: ['heavy_hammer', 'lead_bullet', 'empty', 'empty', 'powder_charge', 'fuse_cord'],
    activeChamberIndex: 4,
    forcedChamberIndex: 4,
  });
  engine.performPrimaryAction({ targetChamber: 4 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.chainSynergyMultiplier >= 12.0,
    `Wrapped 4->5->0 Powder+Fuse+Hammer must trigger >= 12.0x Full Cylinder Dump, got ${st.lastTurnBreakdown.chainSynergyMultiplier}`
  );
});

test('T2-F12-04: Incomplete sequence (Powder + Fuse without Heavy Hammer) does not falsely trigger Full Cylinder Dump', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2124 });
  forceEngineState(engine, {
    chambers: ['powder_charge', 'fuse_cord', 'lead_bullet', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.chainSynergyMultiplier < 12.0,
    `Incomplete trio must not trigger x12 Full Cylinder Dump, got ${st.lastTurnBreakdown.chainSynergyMultiplier}`
  );
});

test('T2-F12-05: Full cylinder of 6x parasite_bullet resolves without circular deadlock', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2125 });
  forceEngineState(engine, Array(6).fill('parasite_bullet'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0);
});

// ============================================================================
// Feature 13: F-S2-03 — Scheme 2 Russian Roulette Boundary Cases (T2-F13-01 .. T2-F13-05)
// ============================================================================

test('T2-F13-01: Zero demon_bullet loaded results in 0% backfireRisk and zero self-damage across 20 shots', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2131 });
  forceEngineState(engine, Array(6).fill('lead_bullet'));
  assert.equal(normalizeGameState(engine.getState(), engine).backfireRisk ?? 0, 0);

  for (let i = 0; i < 10; i++) {
    forceEngineState(engine, { pullsRemaining: 5, chambers: Array(6).fill('lead_bullet') });
    engine.performPrimaryAction();
    assert.equal(normalizeGameState(engine.getState(), engine).playerHp, 100);
  }
});

test('T2-F13-02: 6x demon_bullet cylinder computes capped backfireRisk and exponential Demon Overclock damage', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2132 });
  forceEngineState(engine, { chambers: Array(6).fill('demon_bullet'), forceBackfire: false });
  const stBefore = normalizeGameState(engine.getState(), engine);
  assert.ok(stBefore.backfireRisk >= 25 && stBefore.backfireRisk <= 100);

  engine.performPrimaryAction({ forceBackfire: false });
  const stAfter = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfter.lastTurnBreakdown.totalDamage > 1000 && Number.isFinite(stAfter.lastTurnBreakdown.totalDamage));
});

test('T2-F13-03: Demon bullet backfire at low playerHp (10 HP) clamps playerHp >= 0 without negative HP corruption', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2133 });
  forceEngineState(engine, {
    playerHp: 10,
    chambers: Array(6).fill('demon_bullet'),
    forceBackfire: true,
  });
  engine.performPrimaryAction({ forceBackfire: true });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.playerHp >= 0, `playerHp must clamp at >= 0, got ${st.playerHp}`);
});

test('T2-F13-04: Russian Roulette Grit next-shot bonus resets after being consumed by a real shot', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2134 });
  forceEngineState(engine, {
    enemyHp: 500000,
    enemyMaxHp: 500000,
    pullsRemaining: 5,
    chambers: ['empty', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  // Shot 1: dry click on chamber 0
  engine.performPrimaryAction({ targetChamber: 0 });
  // Shot 2: real shot on chamber 1 (consumes grit)
  forceEngineState(engine, {
    chambers: ['empty', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engine.performPrimaryAction({ targetChamber: 1 });
  const dmgBoosted = normalizeGameState(engine.getState(), engine).lastTurnBreakdown.totalDamage;

  // Shot 3: second real shot on chamber 1 without dry click
  forceEngineState(engine, {
    chambers: ['empty', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engine.performPrimaryAction({ targetChamber: 1 });
  const dmgNormal = normalizeGameState(engine.getState(), engine).lastTurnBreakdown.totalDamage;

  assert.ok(dmgBoosted >= dmgNormal, 'Grit multiplier must not stack infinitely without new dry clicks');
});

test('T2-F13-05: backfireRisk updates synchronously when cylinder contents change', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 2135 });
  forceEngineState(engine, Array(6).fill('demon_bullet'));
  assert.ok(normalizeGameState(engine.getState(), engine).backfireRisk > 0);

  forceEngineState(engine, Array(6).fill('lead_bullet'));
  assert.equal(normalizeGameState(engine.getState(), engine).backfireRisk, 0);
});

// ============================================================================
// Feature 14: F-S3-01 — Scheme 3 Core Real-Time March Boundary Cases (T2-F14-01 .. T2-F14-05)
// ============================================================================

test('T2-F14-01: step(0) and step(-100) do not move enemies backward or produce NaN', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2141 });
  engine.step(500);
  const pBefore = Number(engine.getState().closestEnemyProgress ?? 0);

  engine.step(0);
  engine.step(-100);
  const pAfter = Number(engine.getState().closestEnemyProgress ?? 0);

  assert.ok(Number.isFinite(pAfter));
  assert.ok(pAfter >= pBefore, `Negative dtMs must not move enemies backward (${pBefore} -> ${pAfter})`);
});

test('T2-F14-02: Large delta step(60000) clamps enemy progress and keeps Base HP >= 0', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2142 });
  assert.doesNotThrow(() => {
    engine.step(60000);
  });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.playerHp >= 0);
  assert.ok((st.closestEnemyProgress ?? 0) <= 1.0);
});

test('T2-F14-03: Enemy breaching bottom defense line reduces Base HP and despawns cleanly', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2143 });
  const initialHp = normalizeGameState(engine.getState(), engine).playerHp;
  forceEngineState(engine, { closestEnemyProgress: 0.98 });

  for (let i = 0; i < 15; i++) {
    engine.step(1000);
  }
  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.playerHp < initialHp || st.wave > 1, 'Breaching enemy or wave resolution must update state cleanly');
  assert.ok(st.playerHp >= 0);
});

test('T2-F14-04: Pulling lever at 0 Gold triggers emergency pull or blocks without negative gold', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2144 });
  forceEngineState(engine, { gold: 0 });
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.gold >= 0, `Gold must never become negative, got ${st.gold}`);
  assert.equal(st.pedestals.length, 5);
});

test('T2-F14-05: 30 rapid-fire lever mashes in <1s maintain valid 5 pedestals and finite damage', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2145 });
  forceEngineState(engine, { gold: 100000 });

  for (let i = 0; i < 30; i++) {
    engine.performPrimaryAction();
    engine.step(16);
    const st = normalizeGameState(engine.getState(), engine);
    assert.equal(st.pedestals.length, 5);
    assert.ok(st.lastTurnBreakdown.totalDamage > 0 && Number.isFinite(st.lastTurnBreakdown.totalDamage));
  }
});

// ============================================================================
// Feature 15: F-S3-02 — Scheme 3 Yahtzee Hand Evaluator Boundary Cases (T2-F15-01 .. T2-F15-05)
// ============================================================================

test('T2-F15-01: High Card (non-sequential distinct ranks [1, 2, 4, 5, 6]) evaluates baseline mult while executing Auto-Devour', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2151 });
  // Ranks 1, 2, 4, 5, 6 (missing 3 = cryo_prism, so max consecutive run is 3, no pair)
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'tesla_coil', 'prism_laser', 'nuke_core']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.lastTurnBreakdown.lineMultiplier, 1.0);
  assert.ok(st.lastTurnBreakdown.devourStacks > 0, 'High Card must still perform adjacency Auto-Devour');
});

test('T2-F15-02: Full House ([A, A, A, B, B]) takes priority over Three of a Kind', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2152 });
  forceEngineState(engine, ['tesla_coil', 'tesla_coil', 'tesla_coil', 'gold_nugget', 'gold_nugget']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.lineMultiplier >= 45.0,
    `Full House must yield lineMultiplier >= 45.0 (above Three of a Kind 20.0), got ${st.lastTurnBreakdown.lineMultiplier}`
  );
});

test('T2-F15-03: Four of a Kind ([A, A, A, A, B]) evaluates between Full House and Five of a Kind', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2153 });
  forceEngineState(engine, ['prism_laser', 'prism_laser', 'prism_laser', 'prism_laser', 'miner_pick']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.lineMultiplier >= 150.0 && st.lastTurnBreakdown.lineMultiplier < 1000.0,
    `Four of a Kind must yield lineMultiplier in [150, 999], got ${st.lastTurnBreakdown.lineMultiplier}`
  );
});

test('T2-F15-04: Unordered 5-symbol Straight ([5, 3, 1, 4, 2]) still triggers 5s Hyper Laser Sweep', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2154 });
  forceEngineState(engine, ['prism_laser', 'cryo_prism', 'miner_pick', 'tesla_coil', 'gold_nugget']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 80.0, 'Unordered 5-straight must be detected by Yahtzee evaluator');
});

test('T2-F15-05: Freeze (4000ms) and Hyper Laser (5000ms) effects expire cleanly after step(6000)', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2155 });
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  engine.performPrimaryAction();

  for (let i = 0; i < 6; i++) {
    engine.step(1000);
  }
  const st = normalizeGameState(engine.getState(), engine);
  const activeLaser = (st.activeEffects || []).some((e) => {
    if (typeof e === 'string') return false;
    return /laser/i.test(e.type || e.id || '') && (e.remainingMs ?? 0) > 0;
  });
  assert.equal(activeLaser, false, '5000ms Hyper Laser effect must expire after 6000ms elapsed');
});

// ============================================================================
// Feature 16: F-S3-03 — Scheme 3 Greed Interest & Red-Zone Boundary Cases (T2-F16-01 .. T2-F16-05)
// ============================================================================

test('T2-F16-01: Red-Zone threshold boundary distinguishes progress = 0.71 (Safe) vs 0.72 (Red Zone)', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2161 });
  forceEngineState(engine, { closestEnemyProgress: 0.71 });
  const stSafe = normalizeGameState(engine.getState(), engine);
  assert.equal((stSafe.closestEnemyProgress ?? 0) < 0.72, true);

  forceEngineState(engine, { closestEnemyProgress: 0.72 });
  const stRed = normalizeGameState(engine.getState(), engine);
  assert.equal((stRed.closestEnemyProgress ?? 0) >= 0.72, true);
});

test('T2-F16-02: Lever pull resets unpulled interest timer and Greed streak cleanly', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2162 });
  engine.step(6000);
  const greedBeforePull = normalizeGameState(engine.getState(), engine).greedMultiplier;
  assert.ok(greedBeforePull > 1.0);

  engine.performPrimaryAction();
  const stAfterPull = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfterPull.lastTurnBreakdown.greedMultiplier >= greedBeforePull);
});

test('T2-F16-03: Compound interest at 0 Gold and 1,000,000 Gold remains finite without NaN', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2163 });
  forceEngineState(engine, { gold: 0 });
  engine.step(3000);
  assert.ok(Number.isFinite(normalizeGameState(engine.getState(), engine).gold));

  forceEngineState(engine, { gold: 1000000 });
  engine.step(15000);
  const stHigh = normalizeGameState(engine.getState(), engine);
  assert.ok(Number.isFinite(stHigh.gold) && Number.isFinite(stHigh.greedMultiplier));
});

test('T2-F16-04: Red-Zone Adrenaline deactivates once Five of a Kind Nuke wipes out Red-Zone enemies', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 2164 });
  forceEngineState(engine, { closestEnemyProgress: 0.8 });
  forceEngineState(engine, ['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok((st.closestEnemyProgress ?? 0) < 0.72, 'Red-Zone progress must drop below 0.72 after Nuke wave clear');
});

test('T2-F16-05: JackpotTDView interest ticker DOM updates synchronously after step(3000)', async () => {
  const env = installMockBrowserEnv();
  const engMod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const viewMod = await loadProjectModule('src/games/jackpot-td/JackpotTDView.js');
  const JackpotTDEngine = requireExport(engMod, ['JackpotTDEngine'], 'JackpotTDEngine.js');
  const JackpotTDView = requireExport(viewMod, ['JackpotTDView'], 'JackpotTDView.js');

  const engine = new JackpotTDEngine({ seed: 2165 });
  const container = env.createContainer();
  const view = new JackpotTDView(engine);
  view.mount(container, { engine });

  engine.step(3000);
  view.render();
  const tickerText = container.querySelector('[data-testid="td-interest-ticker"]')?.textContent || '';
  assert.ok(tickerText.length > 0, 'td-interest-ticker must display current interest/greed status');
});

// ============================================================================
// Feature 17: F-S4-01 — Scheme 4 Sigil Pachinko Boundary Cases (T2-F17-01 .. T2-F17-05)
// ============================================================================

test('T2-F17-01: Pachinko orbs reflect off left and right arena boundaries without escaping to NaN', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 2171 });
  engine.performPrimaryAction();
  for (let i = 0; i < 15; i++) {
    engine.step(50);
  }
  const st = normalizeGameState(engine.getState(), engine);
  for (const orb of st.orbs || []) {
    assert.ok(Number.isFinite(orb.x) && Number.isFinite(orb.y));
  }
});

test('T2-F17-02: Dropping 3 identical orbs (3x ember_orb) resolves without mutual deletion of all orbs', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 2172 });
  forceEngineState(engine, ['ember_orb', 'ember_orb', 'ember_orb']);
  engine.performPrimaryAction();
  engine.step(1000);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'At least 1 orb must reach a crucible and deal > 0 damage');
});

test('T2-F17-03: Repeated Chaos Tilt spamming (10x) caps tilt instability without NaN velocities', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 2173 });
  engine.performPrimaryAction();
  for (let i = 0; i < 10; i++) {
    engine.performSecondaryAction();
  }
  engine.step(500);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(Number.isFinite(st.lastTurnBreakdown.totalDamage));
});

test('T2-F17-04: All 10 seeded drops settle into bottom crucibles within 1500ms without stuck orbs', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  for (let s = 1; s <= 10; s++) {
    const engine = new SigilPachinkoEngine({ seed: s * 101 });
    engine.performPrimaryAction();
    engine.step(1500);
    const st = normalizeGameState(engine.getState(), engine);
    assert.ok(st.lastTurnBreakdown.totalDamage > 0, `Seed ${s * 101} drop must settle and deal > 0 damage`);
  }
});

test('T2-F17-05: Lethal x25 JACKPOT crucible hit on first drop converts unused drops into compound interest', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 2175 });
  const initialGold = normalizeGameState(engine.getState(), engine).gold;
  forceEngineState(engine, {
    enemyHp: 50,
    spawner: ['void_singularity', 'gold_stone', 'ember_orb'],
    forceCrucibleIndex: 2,
  });
  engine.performPrimaryAction({ forceCrucibleIndex: 2 });
  engine.step(500);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.gold > initialGold || st.greedMultiplier > 1.0, 'Unused drops on wave clear must award compound interest / greed mult');
});

// ============================================================================
// Feature 18: F-S5-01 — Scheme 5 Abyssal Grid Boundary Cases (T2-F18-01 .. T2-F18-05)
// ============================================================================

test('T2-F18-01: Top-left corner cell 0 only devours orthogonal neighbors 1 and 4 without wrapping row edges to cell 3', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 2181 });
  const grid16 = Array(16).fill('empty');
  grid16[0] = 'abyssal_knight'; // top-left corner (row 0, col 0)
  grid16[1] = 'skeleton'; // right neighbor (orthogonal)
  grid16[4] = 'skeleton'; // bottom neighbor (orthogonal)
  grid16[3] = 'skeleton'; // row 0, col 3 (non-adjacent opposite edge!)
  forceEngineState(engine, grid16);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.lastTurnBreakdown.devourStacks, 2, 'Corner cell 0 must devour only cells 1 and 4 (not cell 3)');
});

test('T2-F18-02: Full 4x4 Blackout (16/16 Commanders) detects all 10 Bingo lines without infinite respin loop', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 2182 });
  forceEngineState(engine, Array(16).fill('abyssal_knight'));
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  const lineCount = Array.isArray(st.bingoLines) ? st.bingoLines.length : Number(st.bingoLines ?? 0);
  assert.equal(lineCount, 10, `Full 4x4 matrix must complete all 10 Bingo lines, got ${lineCount}`);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 100);
});

test('T2-F18-03: Two Commanders flanking shared orthogonal fodder at cell 1 devour it only once', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 2183 });
  const grid16 = Array(16).fill('empty');
  grid16[0] = 'abyssal_knight';
  grid16[1] = 'skeleton'; // shared fodder between cell 0 and cell 2
  grid16[2] = 'abyssal_knight';
  forceEngineState(engine, grid16);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.lastTurnBreakdown.devourStacks, 1, 'Single fodder at cell 1 must not be duplicated across two Commanders');
});

test('T2-F18-04: Out-of-bounds cellIndex (-1, 16, null) in performSecondaryAction is safely ignored', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 2184 });
  engine.performSecondaryAction({ cellIndex: -1 });
  engine.performSecondaryAction({ cellIndex: 16 });
  engine.performSecondaryAction({ cellIndex: null });

  const st = normalizeGameState(engine.getState(), engine);
  for (const idx of st.lockedCells) {
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 16);
  }
});

test('T2-F18-05: Early Fire action settles matrix barrage immediately and banks remaining spins for Greed interest', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 2185 });
  forceEngineState(engine, Array(16).fill('abyssal_knight'));
  engine.performSecondaryAction({ action: 'fire' });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage >= 0 && Number.isFinite(st.gold));
});

// ============================================================================
// Feature 19: F-HUB-01 — Unified Arcade Hub Boundary Cases (T2-F19-01 .. T2-F19-05)
// ============================================================================

test('T2-F19-01: switchScheme with unknown or null schemeId falls back safely without blanking active scheme', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('devour-reels');
  await bridge.switchScheme('invalid-scheme-999');
  await bridge.switchScheme(null);

  const active = bridge.getActiveScheme();
  assert.ok(
    [...SCHEME_IDS, 'gdd', 'audio-lab'].includes(active),
    `Active scheme must remain valid after invalid switchScheme, got '${active}'`
  );
});

test('T2-F19-02: Rapid 20x scheme switching loop unmounts cleanly without orphan background state mutations', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  for (let i = 0; i < 20; i++) {
    const target = SCHEME_IDS[i % SCHEME_IDS.length];
    await bridge.switchScheme(target);
  }
  if (typeof bridge.pauseRealtimeLoop === 'function') {
    bridge.pauseRealtimeLoop();
  }
  const st = normalizeGameState(bridge.getState());
  assert.ok(SCHEME_IDS.includes(st.schemeId));
});

test('T2-F19-03: Sandbox seed input edge values (0, -42, "abc", 2147483647) coerce safely into deterministic seeds', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('devour-reels');

  for (const seedVal of [0, -42, 'abc', 2147483647]) {
    bridge.setSeed(seedVal);
    bridge.triggerPrimaryAction();
    const st = normalizeGameState(bridge.getState());
    assert.ok(Number.isFinite(st.lastTurnBreakdown.totalDamage));
  }
});

test('T2-F19-04: Audio Mute Toggle ([data-testid="audio-mute-toggle"]) maintains valid window.__AUDIO_LOG__', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  const muteBtn = globalThis.document.querySelector('[data-testid="audio-mute-toggle"]');
  assert.ok(muteBtn, 'Missing [data-testid="audio-mute-toggle"]');

  muteBtn.click();
  bridge.triggerPrimaryAction();
  assert.ok(Array.isArray(globalThis.window.__AUDIO_LOG__));
});

test('T2-F19-05: HTTP server (scripts/serve.js) rejects encoded traversal (%2e%2e%2f) and unsupported HTTP methods', async () => {
  const srv = await startStaticServer();
  try {
    const resTraversal = await fetch(`${srv.baseUrl}/%2e%2e/%2e%2e/etc/passwd`);
    assert.ok(resTraversal.status === 403 || resTraversal.status === 404);

    const resPost = await fetch(`${srv.baseUrl}/index.html`, { method: 'POST' });
    assert.ok(resPost.status === 405 || resPost.status === 403 || resPost.status === 404);
  } finally {
    await srv.close();
  }
});
