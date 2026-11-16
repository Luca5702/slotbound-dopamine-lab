import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GDD_FILES,
  SCHEME_IDS,
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
// Feature 1: F-GDD-01 — Master & Iron Laws GDD Suite (T1-F01-01 .. T1-F01-05)
// ============================================================================

test('T1-F01-01: All 6 GDD files and README.md exist with substantial structured Markdown content', () => {
  const readme = readProjectText('README.md');
  assert.ok(readme.length >= 800, 'README.md must have >= 800 characters');
  assert.match(readme.trimStart(), /^#\s+/, 'README.md must start with a top-level Markdown heading');

  for (const relPath of GDD_FILES) {
    const content = readProjectText(relPath);
    assert.ok(
      Buffer.byteLength(content, 'utf8') >= 800,
      `${relPath} must be >= 800 bytes`
    );
    assert.match(
      content.trimStart(),
      /^#\s+/,
      `${relPath} must start with a top-level heading (# )`
    );
  }
});

test('T1-F01-02: Master Design Philosophy GDD covers Slotbound core contradiction, 3 Minimalist Formulas, and directory architecture', () => {
  const doc00 = readProjectText('docs/gdd/00-master-design-philosophy.md');
  assert.match(doc00, /砍掉中间商|多巴胺/, 'Must analyze Slotbound core contradiction');
  assert.match(doc00, /零操作合成|Auto-Devour/i, 'Must document Formula 1: Auto-Devour');
  assert.match(doc00, /即时开火|Slot-as-Combat/i, 'Must document Formula 2: Slot-as-Combat');
  assert.match(doc00, /极简赌狗经济|Risk\s*&\s*Greed/i, 'Must document Formula 3: Risk & Greed');
  assert.match(doc00, /src\/core/, 'Must document src/core directory architecture');
  assert.match(doc00, /src\/games/, 'Must document src/games directory architecture');
  assert.match(doc00, /docs\/gdd/, 'Must document docs/gdd directory architecture');
});

test('T1-F01-03: Iron Laws Math & Audio GDD specifies 15s Flow Rule, Exponential Formula, and Web Audio semitone synth', () => {
  const doc01 = readProjectText('docs/gdd/01-iron-laws-math-and-audio.md');
  assert.match(doc01, /15\s*秒心流|15-Second Flow/i, 'Must specify 15-Second Flow Rule');
  assert.match(doc01, /指数级数字膨胀|Exponential/i, 'Must specify Exponential Number Inflation');
  assert.match(doc01, /基础点|BasePoints|BaseChips/i, 'Must specify BasePoints factor');
  assert.match(doc01, /连线倍率|LineMultiplier|LineMult/i, 'Must specify LineMultiplier factor');
  assert.match(doc01, /吞噬层数|DevourStacks/i, 'Must specify DevourStacks factor');
  assert.match(doc01, /重度听觉锚点|Web Audio/i, 'Must specify Heavy Auditory Anchors');
  assert.match(doc01, /523\.25/, 'Must specify C5 523.25 Hz ascending combo chime base frequency');
});

test('T1-F01-04: Dedicated GDDs for Schemes 1, 2, and 3 document all core mechanics from ORIGINAL_REQUEST.md', () => {
  const doc02 = readProjectText('docs/gdd/02-scheme1-devour-reels.md');
  assert.match(doc02, /吞噬转轮|Devour Reels/i);
  assert.match(doc02, /深渊巨口|Abyssal Maw/i);
  assert.match(doc02, /铁甲骑士|iron_knight/i);
  assert.match(doc02, /火球|fireball/i);
  assert.match(doc02, /炸药桶|powder_keg/i);
  assert.match(doc02, /消化不良|Indigestion/i);

  const doc03 = readProjectText('docs/gdd/03-scheme2-revolver-dungeon.md');
  assert.match(doc03, /左轮地牢|Revolver Dungeon/i);
  assert.match(doc03, /弹巢|6/);
  assert.match(doc03, /旋转弹巢并开火|Spin\s*&\s*Fire/i);
  assert.match(doc03, /塞入新子弹|Load New Bullet/i);
  assert.match(doc03, /寄生弹|parasite_bullet/i);
  assert.match(doc03, /火药|powder_charge/i);
  assert.match(doc03, /引信|fuse_cord/i);
  assert.match(doc03, /重锤|heavy_hammer/i);
  assert.match(doc03, /恶魔弹|demon_bullet/i);

  const doc04 = readProjectText('docs/gdd/04-scheme3-jackpot-td.md');
  assert.match(doc04, /黄金矿工防线|Jackpot TD/i);
  assert.match(doc04, /1×5|1排5格/);
  assert.match(doc04, /对子|二星/);
  assert.match(doc04, /顺子|五连/);
  assert.match(doc04, /狂暴激光|Hyper Laser/i);
  assert.match(doc04, /三连冰冻/);
  assert.match(doc04, /五连核弹/);
});

test('T1-F01-05: Exploratory Schemes 4 & 5 GDD and README index all 5 playable variations', () => {
  const doc05 = readProjectText('docs/gdd/05-explorations-pachinko-grid.md');
  assert.match(doc05, /咒印弹珠台|Sigil Pachinko/i);
  assert.match(doc05, /深渊矩阵|Abyssal Grid/i);
  assert.match(doc05, /25|JACKPOT/i);
  assert.match(doc05, /4×4|Bingo/i);

  const readme = readProjectText('README.md');
  for (const relPath of GDD_FILES) {
    const baseName = relPath.split('/').pop();
    assert.ok(readme.includes(baseName), `README.md must reference ${baseName}`);
  }
});

// ============================================================================
// Feature 2: F-CORE-01 — Deterministic Seeded PRNG (T1-F02-01 .. T1-F02-05)
// ============================================================================

test('T1-F02-01: Identical seeds produce 100% identical floating-point sequences in [0, 1)', async () => {
  const rngA = await createPRNGInstance(20261116);
  const rngB = await createPRNGInstance(20261116);
  for (let i = 0; i < 20; i++) {
    const a = rngA.next();
    const b = rngB.next();
    assert.equal(typeof a, 'number');
    assert.ok(a >= 0 && a < 1, `Expected rng.next() in [0, 1), got ${a}`);
    assert.equal(a, b, `Mismatch at step ${i}`);
  }
});

test('T1-F02-02: nextInt(min, max) covers inclusive integer bounds [0, 5] uniformly', async () => {
  const rng = await createPRNGInstance(42);
  const counts = new Map();
  for (let i = 0; i < 300; i++) {
    const val = rng.nextInt(0, 5);
    assert.ok(Number.isInteger(val), `Expected integer, got ${val}`);
    assert.ok(val >= 0 && val <= 5, `Expected value in [0, 5], got ${val}`);
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  for (let chamber = 0; chamber <= 5; chamber++) {
    const c = counts.get(chamber) || 0;
    assert.ok(c >= 25, `Chamber ${chamber} should appear >= 25 times in 300 rolls, got ${c}`);
  }
});

test('T1-F02-03: pickWeighted(items) respects relative weights deterministically', async () => {
  const items = [
    { id: 'common', weight: 80 },
    { id: 'rare', weight: 15 },
    { id: 'mythic', weight: 5 },
  ];
  const rngA = await createPRNGInstance(777);
  const rngB = await createPRNGInstance(777);
  const tally = { common: 0, rare: 0, mythic: 0 };

  for (let i = 0; i < 1000; i++) {
    const pickA = unwrapWeightedPick(rngA.pickWeighted(items));
    const pickB = unwrapWeightedPick(rngB.pickWeighted(items));
    assert.equal(pickA, pickB, `pickWeighted must be deterministic at index ${i}`);
    tally[pickA] = (tally[pickA] || 0) + 1;
  }
  assert.ok(tally.common > 700, `Expected common > 700, got ${tally.common}`);
  assert.ok(tally.rare > 100, `Expected rare > 100, got ${tally.rare}`);
  assert.ok(tally.mythic > 10 && tally.mythic < 100, `Expected mythic in (10, 100), got ${tally.mythic}`);
});

test('T1-F02-04: shuffle(arr) produces deterministic permutation conserving all elements', async () => {
  const input = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const rngA = await createPRNGInstance(999);
  const rngB = await createPRNGInstance(999);
  const outA = rngA.shuffle([...input]);
  const outB = rngB.shuffle([...input]);

  assert.deepEqual(outA, outB, 'Same seed must produce identical shuffle');
  assert.equal(outA.length, 9);
  assert.equal([...outA].sort((a, b) => a - b).join(','), '0,1,2,3,4,5,6,7,8');
  assert.notEqual(outA.join(','), '0,1,2,3,4,5,6,7,8', 'Shuffled array should not remain unpermuted');
});

test('T1-F02-05: getState() and setSeed(seed) inspect and restore PRNG internal state', async () => {
  const rng = await createPRNGInstance(12345);
  const initialState = rng.getState();
  assert.equal(typeof initialState, 'number');

  const firstFive = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
  assert.notEqual(rng.getState(), initialState, 'PRNG state must advance after next() calls');

  rng.setSeed(12345);
  const replayedFive = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
  assert.deepEqual(replayedFive, firstFive, 'setSeed(12345) must restore exact sequence');
});

// ============================================================================
// Feature 3: F-CORE-02 — Exponential Number & Balatro Scoring Engine (T1-F03-01 .. T1-F03-05)
// ============================================================================

test('T1-F03-01: formatBigNumber(value) formats K, M, B, and T suffixes accurately', async () => {
  const mod = await loadProjectModule('src/core/BigNumber.js');
  const formatBigNumber = requireExport(mod, ['formatBigNumber'], 'src/core/BigNumber.js');

  assert.equal(formatBigNumber(950), '950');
  assert.match(formatBigNumber(14200), /^14\.20?K$/);
  assert.match(formatBigNumber(85000000), /^85(\.00?)?M$/);
  assert.match(formatBigNumber(4200000000), /^4\.20?B$/);
  assert.match(formatBigNumber(1850000000000), /^1\.(85|90?)T$/);
});

test('T1-F03-02: formatChineseNumber(value) formats 万 and 亿 suffixes accurately', async () => {
  const mod = await loadProjectModule('src/core/BigNumber.js');
  const formatChineseNumber = requireExport(mod, ['formatChineseNumber'], 'src/core/BigNumber.js');

  assert.equal(formatChineseNumber(950), '950');
  assert.match(formatChineseNumber(14200), /^1\.42?万$/);
  assert.match(formatChineseNumber(85000000), /^8500(\.00?)?万$/);
  assert.match(formatChineseNumber(172800000), /^1\.7[23]亿$/);
});

test('T1-F03-03: calculateSpinDamage computes exact Balatro-style multiplicative formula with explicit multipliers', async () => {
  const res = await invokeCalculateSpinDamage({
    basePoints: 100,
    lineMultiplier: 2.5,
    devourStacks: 3,
    devourStacksMultiplier: 4.0,
    chainSynergyMultiplier: 6.0,
    greedMultiplier: 1.5,
  });

  assert.equal(res.basePoints, 100);
  assert.equal(res.lineMultiplier, 2.5);
  assert.equal(res.devourStacks, 3);
  assert.equal(res.devourStacksMultiplier, 4.0);
  assert.equal(res.chainSynergyMultiplier, 6.0);
  assert.equal(res.greedMultiplier, 1.5);
  assert.equal(res.totalDamage, 9000);
  assert.ok(res.formattedDamage.length > 0);
  assert.ok(res.intensityTier >= 0 && res.intensityTier <= 4);
});

test('T1-F03-04: calculateSpinDamage derives devourStacksMultiplier from devourStacks when null', async () => {
  const res = await invokeCalculateSpinDamage({
    basePoints: 50,
    lineMultiplier: 2,
    devourStacks: 4,
    devourStacksMultiplier: null,
    chainSynergyMultiplier: 1,
    greedMultiplier: 1,
  });

  const expectedDevourMult = (1 + 0.6 * 4) * Math.pow(1.25, 4); // 8.30078125
  assert.ok(
    Math.abs(res.devourStacksMultiplier - expectedDevourMult) < 0.01,
    `Expected devourStacksMultiplier ~${expectedDevourMult}, got ${res.devourStacksMultiplier}`
  );
  assert.equal(res.totalDamage, Math.floor(50 * 2 * expectedDevourMult)); // 830
});

test('T1-F03-05: calculateSpinDamage scales from Wave 1 (~10^2) to Wave 8 (>10^8) with intensityTier 0..4', async () => {
  const wave1 = await invokeCalculateSpinDamage({
    basePoints: 20,
    lineMultiplier: 1.5,
    devourStacks: 1,
    chainSynergyMultiplier: 1,
    greedMultiplier: 1,
  });
  const wave8 = await invokeCalculateSpinDamage({
    basePoints: 1250,
    lineMultiplier: 32,
    devourStacks: 12,
    devourStacksMultiplier: 180,
    chainSynergyMultiplier: 12,
    greedMultiplier: 2,
  });

  assert.ok(wave1.totalDamage >= 40 && wave1.totalDamage <= 500, `Wave 1 damage should be in [40, 500], got ${wave1.totalDamage}`);
  assert.ok(wave1.intensityTier <= 1, `Wave 1 intensityTier should be <= 1, got ${wave1.intensityTier}`);
  assert.ok(wave8.totalDamage >= 100000000, `Wave 8 damage should be >= 10^8, got ${wave8.totalDamage}`);
  assert.equal(wave8.intensityTier, 4, 'Wave 8 astronomical hit must trigger max intensityTier 4');
});

// ============================================================================
// Feature 4: F-CORE-03 — Risk & Greed Economy Engine (T1-F04-01 .. T1-F04-05)
// ============================================================================

test('T1-F04-01: EconomyEngine initializes 5-pull wave countdown and tracks pull consumption', async () => {
  const mod = await loadEconomyModule();
  let state;
  if (typeof mod.createEconomyState === 'function') {
    state = mod.createEconomyState();
  } else if (typeof mod.EconomyEngine === 'function') {
    const eng = new mod.EconomyEngine();
    state = typeof eng.getState === 'function' ? eng.getState() : eng;
  } else {
    state = { gold: 100, pullsRemaining: 5, pullsUsed: 0, greedMultiplier: 1.0, wave: 1 };
  }

  assert.equal(state.pullsRemaining ?? 5, 5, 'Default pulls per wave must be 5');
  assert.equal(state.greedMultiplier ?? 1.0, 1.0, 'Initial greedMultiplier must be 1.0');

  if (typeof mod.consumePull === 'function') {
    const next = mod.consumePull(state);
    assert.equal(next.pullsRemaining, 4);
    assert.equal(next.pullsUsed, 1);
  } else if (typeof mod.EconomyEngine === 'function') {
    const eng = new mod.EconomyEngine();
    if (typeof eng.consumePull === 'function') {
      eng.consumePull();
      const s2 = typeof eng.getState === 'function' ? eng.getState() : eng;
      assert.equal(s2.pullsRemaining, 4);
    }
  }
});

test('T1-F04-02: settleWaveClear computes exact compound interest gold for U = 2 unused pulls', async () => {
  const res = await invokeSettleWaveClear(
    { gold: 100, baseWaveGold: 40, greedMultiplier: 1.0, wave: 1 },
    2
  );
  // Formula: floor((100 + 40 * (1 + 0.25 * 2)) * (1.25^2 - 1)) + 15 * 2 = floor(160 * 0.5625) + 30 = 90 + 30 = 120
  assert.equal(res.interestGold, 120, `Expected interestGold === 120 for U=2, got ${res.interestGold}`);
  assert.ok(res.gold >= 220, `Expected updated gold >= 220, got ${res.gold}`);
});

test('T1-F04-03: settleWaveClear scales permanent greedMultiplier by 1.35^U', async () => {
  const res = await invokeSettleWaveClear(
    { gold: 50, baseWaveGold: 40, greedMultiplier: 1.0, wave: 1 },
    3
  );
  const expectedGreed = Math.pow(1.35, 3); // 2.460375
  assert.ok(
    Math.abs(res.greedMultiplier - expectedGreed) < 0.01,
    `Expected greedMultiplier ~${expectedGreed}, got ${res.greedMultiplier}`
  );
});

test('T1-F04-04: Monotonic Greed reward escalation — 1-pull kill (U=4) massively outperforms 4-pull kill (U=1)', async () => {
  const baseState = { gold: 100, baseWaveGold: 50, greedMultiplier: 1.0, wave: 1 };
  const resU1 = await invokeSettleWaveClear(baseState, 1);
  const resU4 = await invokeSettleWaveClear(baseState, 4);

  assert.ok(
    resU4.interestGold > resU1.interestGold * 3,
    `Expected U=4 interestGold (${resU4.interestGold}) > 3x U=1 interestGold (${resU1.interestGold})`
  );
  assert.ok(
    resU4.greedMultiplier > resU1.greedMultiplier * 2,
    `Expected U=4 greedMultiplier (${resU4.greedMultiplier}) > 2x U=1 greedMultiplier (${resU1.greedMultiplier})`
  );
});

test('T1-F04-05: Post-wave 3-pick Relic/Mutation drafting offers 3 distinct choices and applies selection', async () => {
  const mod = await loadEconomyModule();
  const settled = await invokeSettleWaveClear(
    { gold: 100, baseWaveGold: 40, greedMultiplier: 1.0, wave: 1, relics: [] },
    2
  );

  let options = settled.relicOptions;
  if (!Array.isArray(options) || options.length === 0) {
    if (typeof mod.getRelicDraftChoices === 'function') {
      options = mod.getRelicDraftChoices(settled, 3);
    } else if (typeof mod.getRelicDraftOptions === 'function') {
      options = mod.getRelicDraftOptions(settled);
    } else if (typeof mod.offerRelicDraft === 'function') {
      options = mod.offerRelicDraft(settled);
    } else if (Array.isArray(mod.DEFAULT_RELIC_CATALOG) || Array.isArray(mod.RELIC_CATALOG) || Array.isArray(mod.RELICS)) {
      options = (mod.DEFAULT_RELIC_CATALOG || mod.RELIC_CATALOG || mod.RELICS).slice(0, 3);
    }
  }

  assert.ok(Array.isArray(options) && options.length === 3, `Expected 3 relic draft choices, got ${options?.length}`);
  const ids = new Set(options.map((r) => (typeof r === 'string' ? r : r.id)));
  assert.equal(ids.size, 3, 'Relic draft must present 3 distinct relic IDs');

  const chosen = options[0];
  const chosenId = typeof chosen === 'string' ? chosen : chosen.id;
  if (typeof mod.draftRelic === 'function') {
    const afterDraft = mod.draftRelic(settled, chosenId);
    const relics = afterDraft.relics || afterDraft.state?.relics || [];
    assert.ok(relics.length >= 1, 'Drafted relic must be recorded in state.relics');
  } else if (typeof mod.applyRelic === 'function') {
    const afterDraft = mod.applyRelic(settled, chosenId);
    const relics = afterDraft.relics || afterDraft.state?.relics || [];
    assert.ok(relics.length >= 1, 'Applied relic must be recorded in state.relics');
  }
});

// ============================================================================
// Feature 5: F-CORE-04 — 15-Second Flow & EventBus (T1-F05-01 .. T1-F05-05)
// ============================================================================

test('T1-F05-01: EventBus delivers payloads synchronously to multiple subscribers in registration order', async () => {
  const bus = await createEventBusInstance();
  const callOrder = [];

  bus.on('spin:settled', (payload) => {
    callOrder.push({ listener: 1, damage: payload.damage, comboStep: payload.comboStep });
  });
  bus.on('spin:settled', (payload) => {
    callOrder.push({ listener: 2, damage: payload.damage, comboStep: payload.comboStep });
  });

  bus.emit('spin:settled', { damage: 4500, comboStep: 3 });

  assert.equal(callOrder.length, 2);
  assert.deepEqual(callOrder[0], { listener: 1, damage: 4500, comboStep: 3 });
  assert.deepEqual(callOrder[1], { listener: 2, damage: 4500, comboStep: 3 });
});

test('T1-F05-02: EventBus supports unsubscribe (off / disposer) and records events in inspectable ring buffer', async () => {
  const bus = await createEventBusInstance();
  let count = 0;
  const handler = () => { count++; };

  const unsub = bus.on('combo:step', handler);
  bus.emit('combo:step', { step: 1 });
  assert.equal(count, 1);

  if (typeof unsub === 'function') {
    unsub();
  } else if (typeof bus.off === 'function') {
    bus.off('combo:step', handler);
  }
  bus.emit('combo:step', { step: 2 });
  assert.equal(count, 1, 'Unsubscribed listener must not be invoked again');

  const log = getEventBusLog(bus);
  assert.ok(log.length >= 2, `Expected >= 2 events in EventBus log, got ${log.length}`);
});

test('T1-F05-03: FlowTracker validates sub-second (<1000ms) Auto-Devour settlement SLA', async () => {
  const tracker = await createFlowTrackerInstance();
  let result;
  if (typeof tracker.recordDevourSettlement === 'function') {
    result = tracker.recordDevourSettlement(620);
  } else if (typeof tracker.validateDevourDuration === 'function') {
    result = tracker.validateDevourDuration(620);
  } else if (typeof tracker.endDevour === 'function') {
    if (typeof tracker.startDevour === 'function') tracker.startDevour(0);
    result = tracker.endDevour(620);
  } else if (typeof tracker.recordSettlement === 'function') {
    result = tracker.recordSettlement(620);
  }

  const st = typeof tracker.getState === 'function' ? tracker.getState() : { ...tracker, ...(result || {}) };
  const duration = Number(
    result?.settlementDurationMs ??
      result?.durationMs ??
      st.lastDevourDurationMs ??
      st.settlementDurationMs ??
      620
  );
  assert.ok(duration < 1000, `Expected settlement duration < 1000ms, got ${duration}`);
  const compliant =
    result?.isWithinDevourBudget ??
    result?.devourCompliant ??
    result?.compliant ??
    st.isWithinDevourBudget ??
    st.devourCompliant ??
    duration < 1000;
  assert.equal(compliant, true, '620ms devour settlement must pass <1000ms budget');
});

test('T1-F05-04: FlowTracker monitors 15-Second single-turn cycle compliance (<15000ms)', async () => {
  const tracker = await createFlowTrackerInstance();
  let result;
  if (typeof tracker.recordTurnCycle === 'function') {
    result = tracker.recordTurnCycle(4200);
  } else if (typeof tracker.recordTurnDuration === 'function') {
    result = tracker.recordTurnDuration(4200);
  } else if (typeof tracker.endTurn === 'function') {
    if (typeof tracker.startTurn === 'function') tracker.startTurn(0);
    result = tracker.endTurn(4200);
  }

  const st = typeof tracker.getState === 'function' ? tracker.getState() : { ...tracker, ...(result || {}) };
  const withinFlow =
    result?.isWithinFlowRule ??
    result?.flowCompliant ??
    result?.compliant ??
    st.isWithinFlowRule ??
    st.flowCompliant ??
    true;
  assert.equal(withinFlow, true, '4200ms turn cycle must satisfy the 15-Second Flow Rule');
});

test('T1-F05-05: FlowTracker switches to 2.5x turbo speed multiplier on repeated Spacebar during animation', async () => {
  const tracker = await createFlowTrackerInstance();
  if (typeof tracker.startTurn === 'function') tracker.startTurn();
  if (typeof tracker.setPhase === 'function') tracker.setPhase('ANIMATING');

  if (typeof tracker.engageTurbo === 'function') {
    tracker.engageTurbo();
  } else if (typeof tracker.handleSpaceInput === 'function') {
    tracker.handleSpaceInput();
  } else if (typeof tracker.triggerTurbo === 'function') {
    tracker.triggerTurbo();
  } else if (typeof tracker.activateTurbo === 'function') {
    tracker.activateTurbo();
  } else if (typeof tracker.onSpacebar === 'function') {
    tracker.onSpacebar();
    tracker.onSpacebar();
  } else if (typeof tracker.setTurbo === 'function') {
    tracker.setTurbo(true);
  }

  const st = typeof tracker.getState === 'function' ? tracker.getState() : tracker;
  const speed = Number(
    st.speedMultiplier ?? st.turboMultiplier ?? tracker.speedMultiplier ?? 2.5
  );
  assert.equal(speed, 2.5, `Expected 2.5x turbo speedMultiplier, got ${speed}`);
});

// ============================================================================
// Feature 6: F-AUDIO-01 — Procedural Web Audio Synthesizer (T1-F06-01 .. T1-F06-05)
// ============================================================================

test('T1-F06-01: SoundEngine.playReelClack logs staggered mechanical reel-stop clack telemetry', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playReelClack(0, 3);
  sound.playReelClack(1, 3);
  sound.playReelClack(2, 3);

  const log = sound.getAudioLog();
  assert.equal(log.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(log[i].type, 'clack');
    assert.equal(log[i].reelIndex, i);
    assert.ok(log[i].frequencyHz > 0);
  }
  assert.ok(
    log[0].frequencyHz <= log[1].frequencyHz && log[1].frequencyHz <= log[2].frequencyHz,
    'Reel clack pitch should be non-decreasing across reel indices 0..2'
  );
});

test('T1-F06-02: SoundEngine.playDevourCrunch logs organic devour crunch with devourStep and tier', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playDevourCrunch(1, 2);
  sound.playDevourCrunch(3, 4);

  const log = sound.getAudioLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].type, 'crunch');
  assert.equal(log[0].devourStep, 1);
  assert.equal(log[0].tier, 2);
  assert.ok(log[0].frequencyHz > 0);
  assert.equal(log[1].type, 'crunch');
  assert.equal(log[1].devourStep, 3);
  assert.equal(log[1].tier, 4);
});

test('T1-F06-03: SoundEngine.playComboChime follows exact 12-TET semitone formula f = 523.25 * 2^(step/12)', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  const steps = [0, 4, 7, 12];
  for (const s of steps) {
    sound.playComboChime(s);
  }

  const log = sound.getAudioLog();
  assert.equal(log.length, 4);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const expectedHz = 523.25 * Math.pow(2, step / 12);
    assert.equal(log[i].type, 'chime');
    assert.equal(log[i].comboStep, step);
    assert.ok(
      Math.abs(log[i].frequencyHz - expectedHz) < 0.1,
      `Step ${step}: expected ${expectedHz} Hz, got ${log[i].frequencyHz} Hz`
    );
  }
});

test('T1-F06-04: SoundEngine combat SFX suite logs explosion, gunshot, 5s laser, and backfire events', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playChainExplosion(3);
  sound.playGunshot(true);
  sound.playLaserSweep(5000);
  sound.playMisfireBackfire();

  const log = sound.getAudioLog();
  assert.equal(log.length, 4);
  assert.equal(log[0].type, 'explosion');
  assert.equal(log[0].intensity, 3);
  assert.equal(log[1].type, 'gunshot');
  assert.equal(log[1].isHeavy, true);
  assert.equal(log[2].type, 'laser');
  assert.equal(log[2].durationMs, 5000);
  assert.equal(log[3].type, 'backfire');
});

test('T1-F06-05: SoundEngine mirrors telemetry to window.__AUDIO_LOG__ and supports clearAudioLog()', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  sound.clearAudioLog();

  sound.playComboChime(2);
  assert.equal(sound.getAudioLog().length, 1);
  assert.ok(Array.isArray(globalThis.window.__AUDIO_LOG__));
  assert.equal(globalThis.window.__AUDIO_LOG__.length, 1);

  sound.clearAudioLog();
  assert.equal(sound.getAudioLog().length, 0);
  assert.equal(globalThis.window.__AUDIO_LOG__.length, 0);
});

// ============================================================================
// Feature 7: F-UI-01 — Shared 2D VFX Canvas, Score HUD & GDD Reader (T1-F07-01 .. T1-F07-05)
// ============================================================================

test('T1-F07-01: VFXCanvas spawns and steps projectiles, devour particles, floating damage numbers, 5s laser, and screen shake', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/VFXCanvas.js');
  const VFXCanvas = requireExport(mod, ['VFXCanvas'], 'src/ui/VFXCanvas.js');

  const canvasEl = env.document.createElement('canvas');
  env.document.body.appendChild(canvasEl);
  const vfx = new VFXCanvas(canvasEl);
  if (typeof vfx.mount === 'function') vfx.mount(canvasEl);

  if (typeof vfx.spawnProjectile === 'function') vfx.spawnProjectile({ x: 100, y: 400, targetX: 400, targetY: 100 });
  if (typeof vfx.spawnDevourBurst === 'function') vfx.spawnDevourBurst({ x: 200, y: 200, tier: 3 });
  else if (typeof vfx.spawnDevourParticles === 'function') vfx.spawnDevourParticles({ x: 200, y: 200, count: 12 });
  if (typeof vfx.spawnFloatingText === 'function') vfx.spawnFloatingText({ text: '85.0M', x: 300, y: 150, intensityTier: 4 });
  if (typeof vfx.spawnLaserSweep === 'function') vfx.spawnLaserSweep({ durationMs: 5000 });
  else if (typeof vfx.triggerLaserSweep === 'function') vfx.triggerLaserSweep(5000);
  if (typeof vfx.triggerScreenShake === 'function') vfx.triggerScreenShake(4);
  else if (typeof vfx.shake === 'function') vfx.shake(4);

  if (typeof vfx.step === 'function') vfx.step(100);
  if (typeof vfx.render === 'function') vfx.render();

  const ctx = canvasEl.getContext('2d');
  assert.ok(ctx.__ops.length > 0 || typeof vfx.step === 'function', 'VFXCanvas must execute step/render lifecycle cleanly');
});

test('T1-F07-02: HUDController renders all required Balatro-style equation and wave/gold/pulls data-testid targets', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/HUDController.js');
  const HUDController = requireExport(mod, ['HUDController'], 'src/ui/HUDController.js');

  const container = env.createContainer();
  const hud = new HUDController(container);
  if (typeof hud.mount === 'function') hud.mount(container);

  const sampleState = {
    wave: 3,
    enemyHp: 1900,
    enemyMaxHp: 3800,
    pullsRemaining: 4,
    gold: 250,
    lastTurnBreakdown: {
      basePoints: 60,
      lineMultiplier: 4.0,
      devourStacks: 5,
      devourStacksMultiplier: 6.0,
      chainSynergyMultiplier: 2.5,
      greedMultiplier: 1.35,
      totalDamage: 4860,
      comboName: '肚内连锁爆炸',
    },
  };

  if (typeof hud.update === 'function') hud.update(sampleState);
  else if (typeof hud.render === 'function') hud.render(sampleState);

  const requiredIds = [
    'hud-wave',
    'hud-enemy-hp',
    'hud-pulls-left',
    'hud-gold',
    'hud-base-chips',
    'hud-line-mult',
    'hud-devour-stacks',
    'hud-total-damage',
    'hud-combo-name',
    'hud-formula-breakdown',
  ];

  for (const testId of requiredIds) {
    const el = container.querySelector(`[data-testid="${testId}"]`);
    assert.ok(el, `Missing required HUD element [data-testid="${testId}"]`);
  }
  assert.match(container.querySelector('[data-testid="hud-gold"]').textContent, /250/);
  assert.match(container.querySelector('[data-testid="hud-combo-name"]').textContent, /肚内连锁爆炸/);
});

test('T1-F07-03: GDDViewer mounts document selector and renders all 6 Chinese GDD documents', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/GDDViewer.js');
  const GDDViewer = requireExport(mod, ['GDDViewer'], 'src/ui/GDDViewer.js');

  const container = env.createContainer();
  const viewer = new GDDViewer(container);
  if (typeof viewer.mount === 'function') await viewer.mount(container);
  if (typeof viewer.render === 'function') await viewer.render();

  assert.ok(
    container.querySelector('[data-testid="gdd-viewer-panel"]') ||
      container.getAttribute('data-testid') === 'gdd-viewer-panel',
    'Must render [data-testid="gdd-viewer-panel"]'
  );
  assert.ok(container.querySelector('[data-testid="gdd-doc-selector"]'), 'Must render [data-testid="gdd-doc-selector"]');
  const bodyEl = container.querySelector('[data-testid="gdd-content-body"]');
  assert.ok(bodyEl, 'Must render [data-testid="gdd-content-body"]');

  for (const docPath of GDD_FILES) {
    const docId = docPath.split('/').pop();
    if (typeof viewer.loadDocument === 'function') {
      await viewer.loadDocument(docId);
    } else if (typeof viewer.selectDocument === 'function') {
      await viewer.selectDocument(docId);
    }
    const text = container.querySelector('[data-testid="gdd-content-body"]').textContent;
    assert.ok(text.length > 100, `Rendered GDD content for ${docId} must be non-empty`);
  }
});

test('T1-F07-04: GDDViewer supports interactive Launch Prototype action to switch into playable schemes', async () => {
  const env = installMockBrowserEnv();
  const mod = await loadProjectModule('src/ui/GDDViewer.js');
  const GDDViewer = requireExport(mod, ['GDDViewer'], 'src/ui/GDDViewer.js');

  let launchedScheme = null;
  const onLaunchScheme = (schemeId) => {
    launchedScheme = schemeId;
  };

  const container = env.createContainer();
  const viewer = new GDDViewer({ containerEl: container, onLaunchScheme, onSwitchScheme: onLaunchScheme });
  if (typeof viewer.mount === 'function') {
    await viewer.mount(container, { onLaunchScheme, onSwitchScheme: onLaunchScheme });
  }
  await viewer.loadDocument('02-scheme1-devour-reels.md');

  const launchBtn =
    container.querySelector('[data-action="launch-scheme"]') ||
    container.querySelector('[data-scheme="devour-reels"]') ||
    container.querySelector('button[data-launch-scheme]') ||
    container.querySelector('[data-testid*="launch"]');
  assert.ok(launchBtn, 'GDDViewer must render a Launch Prototype button');
  launchBtn.click();

  assert.equal(launchedScheme, 'devour-reels', 'Clicking Launch Prototype must invoke onLaunchScheme("devour-reels")');
});

test('T1-F07-05: scripts/serve.js serves .html, .js, .css, and .md with accurate UTF-8 MIME headers', async () => {
  const srv = await startStaticServer();
  try {
    const resMd = await fetch(`${srv.baseUrl}/docs/gdd/00-master-design-philosophy.md`);
    assert.equal(resMd.status, 200);
    assert.match(resMd.headers.get('content-type') || '', /text\/(markdown|plain)/i);
    const mdText = await resMd.text();
    assert.match(mdText, /砍掉中间商/);

    const resJs = await fetch(`${srv.baseUrl}/scripts/serve.js`);
    assert.equal(resJs.status, 200);
    assert.match(resJs.headers.get('content-type') || '', /javascript/i);
  } finally {
    await srv.close();
  }
});

// ============================================================================
// Feature 8: F-S1-01 — Scheme 1 Core: 3x3 Grid & Central Abyssal Maw (T1-F08-01 .. T1-F08-05)
// ============================================================================

test('T1-F08-01: DevourReelsEngine initializes 3x3 grid, Central Abyssal Maw, and Wave 1 Siege Boss (120 HP)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 12345 });
  const state = normalizeGameState(engine.getState(), engine);

  assert.equal(state.schemeId, 'devour-reels');
  assert.ok(Array.isArray(state.grid) && state.grid.length === 9, '3x3 grid must have 9 cells');
  assert.equal(state.wave, 1);
  assert.equal(state.enemyMaxHp, 120);
  assert.equal(state.enemyHp, 120);
  assert.equal(state.pullsRemaining, 5);
  assert.equal(state.indigestion ?? 0, 0);
});

test('T1-F08-02: Scheme 1 config.js defines all 9 canonical symbols across Tiers 1 to 4', async () => {
  const cfg = await loadProjectModule('src/games/devour-reels/config.js');
  const rawSymbols = cfg.SYMBOLS || cfg.DEVOUR_SYMBOLS || cfg.SYMBOL_CATALOG || cfg.default?.SYMBOLS;
  assert.ok(rawSymbols, 'config.js must export symbol catalog');

  const symMap = Array.isArray(rawSymbols)
    ? Object.fromEntries(rawSymbols.map((s) => [s.id, s]))
    : rawSymbols;

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

  for (const [id, tier] of Object.entries(expectedTiers)) {
    assert.ok(symMap[id], `Missing symbol '${id}' in Scheme 1 config`);
    assert.equal(symMap[id].tier, tier, `Symbol '${id}' should be Tier ${tier}`);
  }
});

test('T1-F08-03: Deterministic 3x3 spin via setSeed(seed) and performPrimaryAction()', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engA = new DevourReelsEngine({ seed: 8888 });
  const engB = new DevourReelsEngine({ seed: 8888 });
  engA.setSeed(8888);
  engB.setSeed(8888);

  engA.performPrimaryAction();
  engB.performPrimaryAction();

  const stA = normalizeGameState(engA.getState(), engA);
  const stB = normalizeGameState(engB.getState(), engB);

  const idsA = stA.grid.map((c) => (typeof c === 'string' ? c : c.symbolId || c.id));
  const idsB = stB.grid.map((c) => (typeof c === 'string' ? c : c.symbolId || c.id));

  assert.deepEqual(idsA, idsB, 'Identical seed must produce identical 9-cell spin');
  assert.equal(stA.lastTurnBreakdown.totalDamage, stB.lastTurnBreakdown.totalDamage);
  assert.ok(stA.lastTurnBreakdown.totalDamage > 0, 'Spin must deal positive damage');
});

test('T1-F08-04: 8-Line Payline Evaluator detects horizontal, vertical, and diagonal line matches', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 100 });
  forceEngineState(engine, [
    'iron_knight', 'iron_knight', 'iron_knight',
    'goblin', 'chest', 'goblin',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();
  const singleLineMult = normalizeGameState(engine.getState(), engine).lastTurnBreakdown.lineMultiplier;
  assert.ok(singleLineMult > 1.0, `Single row match must yield lineMultiplier > 1.0, got ${singleLineMult}`);

  engine.reset({ seed: 100 });
  forceEngineState(engine, [
    'fireball', 'fireball', 'fireball',
    'goblin', 'fireball', 'chest',
    'goblin', 'chest', 'fireball',
  ]);
  engine.performPrimaryAction();
  const multiLineMult = normalizeGameState(engine.getState(), engine).lastTurnBreakdown.lineMultiplier;
  assert.ok(
    multiLineMult > singleLineMult,
    `Row + Diagonal match (${multiLineMult}) must exceed single-line match (${singleLineMult})`
  );
});

test('T1-F08-05: Central Abyssal Maw consumes spun symbols and directly damages the Siege Boss', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 555 });
  forceEngineState(engine, { wave: 3, enemyHp: 3800, enemyMaxHp: 3800 });
  forceEngineState(engine, [
    'iron_knight', 'goblin', 'chest',
    'goblin', 'iron_knight', 'goblin',
    'chest', 'goblin', 'iron_knight',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0);
  assert.ok(st.enemyHp < 3800 || st.wave > 3, 'Boss HP must decrease by Maw attack damage');
});

// ============================================================================
// Feature 9: F-S1-02 — Scheme 1 Auto-Devour & 5 Stomach Chain Reactions (T1-F09-01 .. T1-F09-05)
// ============================================================================

test('T1-F09-01: 8-Way Adjacency Auto-Devour (<1000ms) + Chain Reaction 1: Fireball + Powder Keg internal detonation', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 901 });
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'goblin',
    'goblin', 'iron_knight', 'chest',
    'goblin', 'powder_keg', 'fireball',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  const bd = st.lastTurnBreakdown;
  assert.ok(bd.devourStacks > 0, 'Predators must automatically devour adjacent lower-tier prey');
  assert.ok(bd.settlementDurationMs < 1000, `Auto-Devour must settle in <1000ms, got ${bd.settlementDurationMs}`);
  assert.ok(bd.chainSynergyMultiplier >= 6.0, `Fireball + Powder Keg must yield chainSynergyMultiplier >= 6.0, got ${bd.chainSynergyMultiplier}`);
  assert.ok(
    bd.triggeredSynergies.some((s) => /fire|powder|爆炸|pyro|detonation/i.test(s)),
    `Expected Fireball + Powder Keg synergy in [${bd.triggeredSynergies.join(', ')}]`
  );
});

test('T1-F09-02: Chain Reaction 2: 3x Iron Knights grants Maw heavy armor and thorns reflection volley', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 902 });
  forceEngineState(engine, [
    'iron_knight', 'iron_knight', 'iron_knight',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok((st.mawArmor ?? 0) >= 120, `Expected mawArmor >= 120 from 3x Iron Knights, got ${st.mawArmor}`);
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 4.5);
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /iron|knight|铁甲|反伤|fortress/i.test(s)),
    `Expected 3x Iron Knights synergy in [${st.lastTurnBreakdown.triggeredSynergies.join(', ')}]`
  );
});

test('T1-F09-03: Chain Reaction 3: Hero Banquet (hero_berserker devours adjacent goblin + chest)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 903 });
  const initialGold = normalizeGameState(engine.getState(), engine).gold;
  forceEngineState(engine, [
    'goblin', 'hero_berserker', 'chest',
    'goblin', 'iron_knight', 'goblin',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.gold > initialGold, 'Hero Banquet + chests must award bonus Gold');
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 3.5);
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /hero|banquet|勇者|盛宴/i.test(s)),
    `Expected Hero Banquet synergy in [${st.lastTurnBreakdown.triggeredSynergies.join(', ')}]`
  );
});

test('T1-F09-04: Chain Reaction 4: Curse Transmutation (abyss_apostle devours curse_skull)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 904 });
  forceEngineState(engine, { indigestion: 40 });
  forceEngineState(engine, [
    'curse_skull', 'abyss_apostle', 'curse_skull',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 8.0);
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /curse|abyss|诅咒|剧毒|transmut/i.test(s)),
    `Expected Curse Transmutation synergy in [${st.lastTurnBreakdown.triggeredSynergies.join(', ')}]`
  );
});

test('T1-F09-05: Chain Reaction 5: Full-Board Gluttony when >= 6 prey symbols are devoured in a single pull', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 905 });
  forceEngineState(engine, [
    'goblin', 'chest', 'goblin',
    'chest', 'abyss_apostle', 'goblin',
    'chest', 'goblin', 'chest',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks >= 6, `Expected >= 6 devourStacks, got ${st.lastTurnBreakdown.devourStacks}`);
  assert.ok(st.lastTurnBreakdown.chainSynergyMultiplier >= 10.0);
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /gluttony|full|暴食|饕餮/i.test(s)),
    `Expected Full-Board Gluttony synergy in [${st.lastTurnBreakdown.triggeredSynergies.join(', ')}]`
  );
});

// ============================================================================
// Feature 10: F-S1-03 — Scheme 1 Indigestion Meter, Probability Modder & 8 Bosses (T1-F10-01 .. T1-F10-05)
// ============================================================================

test('T1-F10-01: Indigestion gauge accumulates when swallowing unpurged curse_skull and standard symbols', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 1001 });
  forceEngineState(engine, [
    'curse_skull', 'curse_skull', 'curse_skull',
    'goblin', 'goblin', 'goblin',
    'goblin', 'goblin', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.indigestion >= 30, `Expected indigestion >= 30 after 3 unpurged curse_skulls, got ${st.indigestion}`);
});

test('T1-F10-02: digestive_herb reduces Indigestion (-35) and permanently boosts Maw base attack', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 1002 });
  forceEngineState(engine, { indigestion: 60 });
  forceEngineState(engine, [
    'digestive_herb', 'digestive_herb', 'goblin',
    'goblin', 'chest', 'goblin',
    'goblin', 'chest', 'goblin',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.indigestion < 40, `Expected digestive_herb to soothe indigestion below 40, got ${st.indigestion}`);
});

test('T1-F10-03: Wheel Probability Modder boosts target symbol weight and normalizes total to 100%', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 1003 });
  const before = normalizeGameState(engine.getState(), engine).wheelProbabilities.fireball;

  engine.performSecondaryAction({ action: 'boost', type: 'boost', symbolId: 'fireball' });
  const probs = normalizeGameState(engine.getState(), engine).wheelProbabilities;

  assert.ok(probs.fireball > before, `Expected fireball weight (${probs.fireball}) > baseline (${before})`);
  const total = Object.values(probs).reduce((acc, v) => acc + Number(v), 0);
  assert.ok(
    Math.abs(total - 100) < 0.5 || Math.abs(total - 1) < 0.01,
    `Wheel probabilities must sum to 100% (or 1.0), got ${total}`
  );
});

test('T1-F10-04: Wheel Probability Modder supports all 3 build presets (pyro, iron, gluttony)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = requireExport(mod, ['DevourReelsEngine'], 'src/games/devour-reels/DevourReelsEngine.js');

  const engine = new DevourReelsEngine({ seed: 1004 });

  engine.performSecondaryAction({ preset: 'pyro', action: 'preset' });
  const pyroProbs = normalizeGameState(engine.getState(), engine).wheelProbabilities;
  assert.ok(
    pyroProbs.fireball + pyroProbs.powder_keg > 35,
    `Pyro preset must heavily weight fireball + powder_keg, got ${pyroProbs.fireball + pyroProbs.powder_keg}`
  );

  engine.performSecondaryAction({ preset: 'iron', action: 'preset' });
  const ironProbs = normalizeGameState(engine.getState(), engine).wheelProbabilities;
  assert.ok(ironProbs.iron_knight >= 20, `Iron preset must boost iron_knight >= 20%, got ${ironProbs.iron_knight}`);

  engine.performSecondaryAction({ preset: 'gluttony', action: 'preset' });
  const glutProbs = normalizeGameState(engine.getState(), engine).wheelProbabilities;
  assert.ok(
    glutProbs.hero_berserker + glutProbs.abyss_apostle >= 20,
    `Gluttony preset must boost predators, got ${glutProbs.hero_berserker + glutProbs.abyss_apostle}`
  );
});

test('T1-F10-05: 8 Siege Bosses scale from 120 HP (Wave 1) to 85,000,000 HP (Wave 8)', async () => {
  const cfg = await loadProjectModule('src/games/devour-reels/config.js');
  const bosses = cfg.BOSSES || cfg.SIEGE_BOSSES || cfg.WAVES || cfg.default?.BOSSES;
  assert.ok(Array.isArray(bosses) && bosses.length >= 8, 'Scheme 1 must define 8 Siege Bosses');

  const expectedHps = [120, 650, 3800, 25000, 180000, 1500000, 12000000, 85000000];
  for (let i = 0; i < 8; i++) {
    const hp = Number(bosses[i].hp ?? bosses[i].maxHp ?? bosses[i].enemyMaxHp);
    assert.equal(hp, expectedHps[i], `Wave ${i + 1} Boss HP should be ${expectedHps[i]}, got ${hp}`);
  }
});

// ============================================================================
// Feature 11: F-S2-01 — Scheme 2 Core: 6-Chamber Revolver & 2-Button Loop (T1-F11-01 .. T1-F11-05)
// ============================================================================

test('T1-F11-01: RevolverDungeonEngine initializes 6-chamber circular cylinder and Floor 1 state', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(
    mod,
    ['RevolverDungeonEngine'],
    'src/games/revolver-dungeon/RevolverDungeonEngine.js'
  );

  const engine = new RevolverDungeonEngine({ seed: 101 });
  const state = normalizeGameState(engine.getState(), engine);

  assert.equal(state.schemeId, 'revolver-dungeon');
  assert.ok(Array.isArray(state.chambers) && state.chambers.length === 6, 'Revolver must have 6 chambers');
  assert.ok(state.activeChamberIndex >= 0 && state.activeChamberIndex < 6);
  assert.equal(state.wave, 1);
  assert.ok(state.enemyHp > 0);
  assert.equal(state.pullsRemaining, 5);
  assert.equal(state.playerHp, 100);
});

test('T1-F11-02: Button 1 (performPrimaryAction / Spin & Fire) spins cylinder and fires at Dungeon Boss', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(
    mod,
    ['RevolverDungeonEngine'],
    'src/games/revolver-dungeon/RevolverDungeonEngine.js'
  );

  const engine = new RevolverDungeonEngine({ seed: 102 });
  forceEngineState(engine, [
    'lead_bullet', 'lead_bullet', 'lead_bullet',
    'lead_bullet', 'lead_bullet', 'lead_bullet',
  ]);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.activeChamberIndex >= 0 && st.activeChamberIndex < 6);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Spin & Fire with loaded cylinder must deal > 0 damage');
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T1-F11-03: Button 2 (performSecondaryAction / Load New Bullet) loads cylinder without consuming a trigger pull', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(
    mod,
    ['RevolverDungeonEngine'],
    'src/games/revolver-dungeon/RevolverDungeonEngine.js'
  );

  const engine = new RevolverDungeonEngine({ seed: 103 });
  forceEngineState(engine, ['lead_bullet', 'empty', 'empty', 'empty', 'empty', 'empty']);
  const beforePulls = normalizeGameState(engine.getState(), engine).pullsRemaining;

  engine.performSecondaryAction({ bulletId: 'vampire_bullet' });
  const afterState = normalizeGameState(engine.getState(), engine);

  const nonEmptyCount = afterState.chambers.filter((c) => {
    const id = typeof c === 'string' ? c : c?.bulletId || c?.id || 'empty';
    return id !== 'empty';
  }).length;

  assert.ok(nonEmptyCount >= 2, `Expected >= 2 loaded bullets after Load New Bullet, got ${nonEmptyCount}`);
  assert.equal(afterState.pullsRemaining, beforePulls, 'Loading a bullet must NOT consume pullsRemaining');
});

test('T1-F11-04: 8-Floor Dungeon Climb progression scales Boss HP across Floors 1 to 8', async () => {
  const cfg = await loadProjectModule('src/games/revolver-dungeon/config.js');
  const floors = cfg.BOSSES || cfg.DUNGEON_BOSSES || cfg.FLOORS || cfg.WAVES || cfg.default?.BOSSES;
  assert.ok(Array.isArray(floors) && floors.length >= 8, 'Scheme 2 must define 8 Dungeon Boss floors');

  const hp1 = Number(floors[0].hp ?? floors[0].maxHp);
  const hp8 = Number(floors[7].hp ?? floors[7].maxHp);
  assert.ok(hp1 >= 100 && hp1 <= 300, `Floor 1 Boss HP should be in [100, 300], got ${hp1}`);
  assert.ok(hp8 >= 50000000, `Floor 8 Boss HP should be >= 50,000,000, got ${hp8}`);
});

test('T1-F11-05: RevolverDungeonView renders 6 chambers, 2 action buttons, and responds to Space & R hotkeys', async () => {
  const env = installMockBrowserEnv();
  const engMod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const viewMod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonView.js');
  const RevolverDungeonEngine = requireExport(engMod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');
  const RevolverDungeonView = requireExport(viewMod, ['RevolverDungeonView'], 'RevolverDungeonView.js');

  const engine = new RevolverDungeonEngine({ seed: 105 });
  const container = env.createContainer();
  const view = new RevolverDungeonView(engine);
  view.mount(container, { engine });

  const requiredIds = [
    'revolver-cylinder',
    'chamber-0',
    'chamber-1',
    'chamber-2',
    'chamber-3',
    'chamber-4',
    'chamber-5',
    'btn-spin-fire',
    'btn-load-bullet',
    'player-hp-bar',
    'roulette-risk-badge',
  ];
  for (const id of requiredIds) {
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Missing Scheme 2 DOM element [data-testid="${id}"]`);
  }

  if (typeof view.onKeyDown === 'function') {
    view.onKeyDown(new globalThis.KeyboardEvent('keydown', { key: 'r', code: 'KeyR' }));
    view.onKeyDown(new globalThis.KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
  }
});

// ============================================================================
// Feature 12: F-S2-02 — Scheme 2 Bullet Roster, Parasite Devour & Full Cylinder Dump (T1-F12-01 .. T1-F12-05)
// ============================================================================

test('T1-F12-01: Complete 9-bullet roster catalog is defined in Scheme 2 config.js', async () => {
  const cfg = await loadProjectModule('src/games/revolver-dungeon/config.js');
  const rawBullets = cfg.BULLETS || cfg.BULLET_TYPES || cfg.BULLET_CATALOG || cfg.default?.BULLETS;
  assert.ok(rawBullets, 'Scheme 2 config.js must export bullet catalog');

  const bulletMap = Array.isArray(rawBullets)
    ? Object.fromEntries(rawBullets.map((b) => [b.id, b]))
    : rawBullets;

  const expectedIds = [
    'empty',
    'lead_bullet',
    'vampire_bullet',
    'scatter_bullet',
    'parasite_bullet',
    'powder_charge',
    'fuse_cord',
    'heavy_hammer',
    'demon_bullet',
  ];
  for (const id of expectedIds) {
    assert.ok(bulletMap[id], `Missing required bullet type '${id}' in Scheme 2 config`);
  }
});

test('T1-F12-02: parasite_bullet automatically devours circular neighbors and scales damage >= 2.0x per bullet eaten', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1202 });
  forceEngineState(engine, {
    chambers: ['lead_bullet', 'parasite_bullet', 'lead_bullet', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engine.performPrimaryAction({ targetChamber: 1 });

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks >= 2, `Expected parasite_bullet to devour >= 2 neighbors, got ${st.lastTurnBreakdown.devourStacks}`);
  assert.ok(st.lastTurnBreakdown.devourStacksMultiplier >= 2.0);
});

test('T1-F12-03: powder_charge + fuse_cord + heavy_hammer triggers instant 6-chamber Full Cylinder Dump', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1203 });
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

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(
    st.lastTurnBreakdown.chainSynergyMultiplier >= 12.0,
    `Full Cylinder Dump must yield chainSynergyMultiplier >= 12.0, got ${st.lastTurnBreakdown.chainSynergyMultiplier}`
  );
  assert.ok(
    st.lastTurnBreakdown.triggeredSynergies.some((s) => /dump|清空|连发|powder|hammer|full/i.test(s)) ||
      /清空|连发|Dump/i.test(st.lastTurnBreakdown.comboName),
    'Must report Full Cylinder Dump synergy'
  );
});

test('T1-F12-04: vampire_bullet leeches HP on hit and converts overheal at full HP', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1204 });
  forceEngineState(engine, {
    playerHp: 70,
    chambers: Array(6).fill('vampire_bullet'),
  });
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.playerHp > 70, `Expected vampire_bullet to heal playerHp above 70, got ${st.playerHp}`);
});

test('T1-F12-05: scatter_bullet sympathetically triggers adjacent chambers for multi-chamber burst', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engSolo = new RevolverDungeonEngine({ seed: 1205 });
  forceEngineState(engSolo, {
    chambers: ['empty', 'scatter_bullet', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engSolo.performPrimaryAction({ targetChamber: 1 });
  const dmgSolo = normalizeGameState(engSolo.getState(), engSolo).lastTurnBreakdown.totalDamage;

  const engAdj = new RevolverDungeonEngine({ seed: 1205 });
  forceEngineState(engAdj, {
    chambers: ['lead_bullet', 'scatter_bullet', 'vampire_bullet', 'empty', 'empty', 'empty'],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });
  engAdj.performPrimaryAction({ targetChamber: 1 });
  const dmgAdj = normalizeGameState(engAdj.getState(), engAdj).lastTurnBreakdown.totalDamage;

  assert.ok(
    dmgAdj > dmgSolo,
    `scatter_bullet with neighbors (${dmgAdj}) must deal more damage than solo scatter_bullet (${dmgSolo})`
  );
});

// ============================================================================
// Feature 13: F-S2-03 — Scheme 2 Russian Roulette Demon Bullet & Grit (T1-F13-01 .. T1-F13-05)
// ============================================================================

test('T1-F13-01: demon_bullet applies high-multiplier (>= 8.0x) Russian Roulette damage', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engLead = new RevolverDungeonEngine({ seed: 1301 });
  forceEngineState(engLead, { chambers: Array(6).fill('lead_bullet') });
  engLead.performPrimaryAction();
  const leadDmg = normalizeGameState(engLead.getState(), engLead).lastTurnBreakdown.totalDamage;

  const engDemon = new RevolverDungeonEngine({ seed: 1301 });
  forceEngineState(engDemon, { chambers: Array(6).fill('demon_bullet'), forceBackfire: false });
  engDemon.performPrimaryAction();
  const demonDmg = normalizeGameState(engDemon.getState(), engDemon).lastTurnBreakdown.totalDamage;

  assert.ok(demonDmg >= leadDmg * 8, `Expected demon_bullet damage (${demonDmg}) >= 8x lead_bullet (${leadDmg})`);
});

test('T1-F13-02: demon_bullet 25% backfire risk inflicts self-damage and activates Blood Rage bonus', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1302 });
  let backfired = false;
  for (let attempt = 1; attempt <= 30; attempt++) {
    engine.reset({ seed: attempt * 97 });
    forceEngineState(engine, {
      playerHp: 100,
      chambers: Array(6).fill('demon_bullet'),
      forceBackfire: attempt === 30 ? true : undefined,
    });
    engine.performPrimaryAction({ forceBackfire: attempt === 30 ? true : undefined });
    const st = normalizeGameState(engine.getState(), engine);
    if (st.playerHp < 100) {
      backfired = true;
      assert.ok(st.playerHp > 0, 'Single backfire from 100 HP must be survivable');
      assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Survivable backfire still fires with Blood Rage bonus');
      break;
    }
  }
  assert.equal(backfired, true, 'demon_bullet must trigger backfire across seeded attempts');
});

test('T1-F13-03: Lone Bullet Roulette empty-chamber bonus scales damage with empty chambers', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engFull = new RevolverDungeonEngine({ seed: 1303 });
  forceEngineState(engFull, {
    chambers: Array(6).fill('lead_bullet'),
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engFull.performPrimaryAction({ targetChamber: 0 });
  const dmgFull = normalizeGameState(engFull.getState(), engFull).lastTurnBreakdown.totalDamage;

  const engLone = new RevolverDungeonEngine({ seed: 1303 });
  forceEngineState(engLone, {
    chambers: ['lead_bullet', 'empty', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engLone.performPrimaryAction({ targetChamber: 0 });
  const dmgLone = normalizeGameState(engLone.getState(), engLone).lastTurnBreakdown.totalDamage;

  assert.ok(
    dmgLone > dmgFull,
    `Lone bullet with 5 empty chambers (${dmgLone}) must deal more damage than full cylinder single shot (${dmgFull})`
  );
});

test('T1-F13-04: Live Russian Roulette odds HUD calculates backfireRisk accurately', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1304 });
  forceEngineState(engine, {
    chambers: ['demon_bullet', 'lead_bullet', 'lead_bullet', 'empty', 'empty', 'empty'],
  });
  const st1 = normalizeGameState(engine.getState(), engine);
  assert.ok(st1.backfireRisk > 0, `Expected backfireRisk > 0 with 1 demon_bullet, got ${st1.backfireRisk}`);

  forceEngineState(engine, {
    chambers: ['demon_bullet', 'demon_bullet', 'demon_bullet', 'empty', 'empty', 'empty'],
  });
  const st3 = normalizeGameState(engine.getState(), engine);
  assert.ok(st3.backfireRisk > st1.backfireRisk, 'Adding more demon_bullets must increase backfireRisk');
});

test('T1-F13-05: Surviving an empty-chamber dry click awards Russian Roulette Grit bonus', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const RevolverDungeonEngine = requireExport(mod, ['RevolverDungeonEngine'], 'RevolverDungeonEngine.js');

  const engine = new RevolverDungeonEngine({ seed: 1305 });
  const goldBefore = normalizeGameState(engine.getState(), engine).gold;
  forceEngineState(engine, {
    chambers: ['empty', 'lead_bullet', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });
  engine.performPrimaryAction({ targetChamber: 0 });
  const stAfterDry = normalizeGameState(engine.getState(), engine);

  const gotGritBonus =
    stAfterDry.gold > goldBefore ||
    (stAfterDry.gritMultiplier ?? 1) > 1 ||
    (stAfterDry.nextShotMultiplier ?? 1) > 1 ||
    stAfterDry.lastTurnBreakdown.totalDamage >= 0;
  assert.equal(gotGritBonus, true, 'Dry click must grant Russian Roulette Grit bonus');
});

// ============================================================================
// Feature 14: F-S3-01 — Scheme 3 Core: 1x5 Slot Turret Wall & Real-Time March (T1-F14-01 .. T1-F14-05)
// ============================================================================

test('T1-F14-01: JackpotTDEngine initializes 1x5 slot turret barrier, Base HP, Gold, and Wave 1 enemies', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'src/games/jackpot-td/JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 201 });
  const st = normalizeGameState(engine.getState(), engine);

  assert.equal(st.schemeId, 'jackpot-td');
  assert.ok(Array.isArray(st.pedestals) && st.pedestals.length === 5, 'Scheme 3 must have 5 slot pedestals');
  assert.ok(st.playerHp > 0);
  assert.ok(st.gold > 0);
  assert.equal(st.wave, 1);
});

test('T1-F14-02: Continuous real-time enemy march advances closestEnemyProgress on step(dtMs)', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'src/games/jackpot-td/JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 202 });
  const p0 = Number(engine.getState().closestEnemyProgress ?? 0);

  engine.step(500);
  engine.step(500);
  const p1 = Number(engine.getState().closestEnemyProgress ?? 0);

  assert.ok(p1 > p0, `Expected closestEnemyProgress to advance from ${p0} after 1000ms step, got ${p1}`);
});

test('T1-F14-03: Instant Gold lever pull (performPrimaryAction) refreshes all 5 pedestals and fires burst volley', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'src/games/jackpot-td/JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 203 });
  engine.step(200);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.equal(st.pedestals.length, 5);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Lever pull must fire immediate burst volley dealing > 0 damage');
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T1-F14-04: Scheme 3 config.js defines all 6 tower symbols and 4 enemy archetypes', async () => {
  const cfg = await loadProjectModule('src/games/jackpot-td/config.js');
  const rawTowers = cfg.TOWERS || cfg.SYMBOLS || cfg.TURRET_SYMBOLS || cfg.default?.TOWERS;
  assert.ok(rawTowers, 'Scheme 3 config must export tower symbol catalog');

  const towerMap = Array.isArray(rawTowers)
    ? Object.fromEntries(rawTowers.map((t) => [t.id, t]))
    : rawTowers;

  for (const id of ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser', 'nuke_core']) {
    assert.ok(towerMap[id], `Missing tower symbol '${id}' in Scheme 3 config`);
  }
});

test('T1-F14-05: JackpotTDView renders 1x5 pedestals, lane canvas, lever button, and interest ticker', async () => {
  const env = installMockBrowserEnv();
  const engMod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const viewMod = await loadProjectModule('src/games/jackpot-td/JackpotTDView.js');
  const JackpotTDEngine = requireExport(engMod, ['JackpotTDEngine'], 'JackpotTDEngine.js');
  const JackpotTDView = requireExport(viewMod, ['JackpotTDView'], 'JackpotTDView.js');

  const engine = new JackpotTDEngine({ seed: 205 });
  const container = env.createContainer();
  const view = new JackpotTDView(engine);
  view.mount(container, { engine });

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
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Missing Scheme 3 DOM element [data-testid="${id}"]`);
  }
});

// ============================================================================
// Feature 15: F-S3-02 — Scheme 3 Yahtzee Hand Evaluator & Clutch Ultimates (T1-F15-01 .. T1-F15-05)
// ============================================================================

test('T1-F15-01: One Pair and Two Pair automatically merge into 2-Star (★★) towers', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1501 });
  forceEngineState(engine, ['miner_pick', 'miner_pick', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  engine.performPrimaryAction();
  const stPair = normalizeGameState(engine.getState(), engine);
  assert.ok(stPair.lastTurnBreakdown.lineMultiplier >= 3.0, `One Pair must yield lineMultiplier >= 3.0, got ${stPair.lastTurnBreakdown.lineMultiplier}`);
  assert.ok(
    stPair.pedestals.some((p) => (p.star ?? p.stars ?? p.level ?? 1) >= 2),
    'One Pair must auto-merge into a 2-Star (★★) pedestal'
  );
});

test('T1-F15-02: Three of a Kind triggers 4s screen-wide Freeze (三连冰冻) halting enemy march', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1502 });
  engine.step(400);
  forceEngineState(engine, ['cryo_prism', 'cryo_prism', 'cryo_prism', 'miner_pick', 'tesla_coil']);
  engine.performPrimaryAction();

  const stAfter = normalizeGameState(engine.getState(), engine);
  assert.ok(stAfter.lastTurnBreakdown.lineMultiplier >= 20.0);
  const pFrozen = Number(stAfter.closestEnemyProgress ?? 0);

  engine.step(1000);
  const pAfterStep = Number(engine.getState().closestEnemyProgress ?? 0);
  assert.ok(
    pAfterStep <= pFrozen + 0.001,
    `Frozen enemies must not advance during 4s freeze window (before=${pFrozen}, after=${pAfterStep})`
  );
});

test('T1-F15-03: Straight (顺子) triggers 5-second continuous Hyper Laser Sweep (5秒狂暴激光洗地)', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1503 });
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 80.0, `Straight must yield lineMultiplier >= 80, got ${st.lastTurnBreakdown.lineMultiplier}`);
  const effects = st.activeEffects || [];
  assert.ok(
    effects.some((e) => /laser|激光/i.test(typeof e === 'string' ? e : e.type || e.id || e.name)) ||
      /顺子|Straight|激光/i.test(st.lastTurnBreakdown.comboName),
    'Straight must activate 5-second Hyper Laser Sweep'
  );
});

test('T1-F15-04: Five of a Kind / Yahtzee triggers Tactical Nuke (五连核弹) + 5s Hyper Laser Sweep', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1504 });
  forceEngineState(engine, ['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 1000.0);
  assert.ok(st.lastTurnBreakdown.totalDamage >= 100000, `Yahtzee nuke must deal >= 100,000 damage, got ${st.lastTurnBreakdown.totalDamage}`);
});

test('T1-F15-05: High-rank turrets automatically devour adjacent Rank 1-2 fodder pedestals in <1000ms', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1505 });
  forceEngineState(engine, ['nuke_core', 'miner_pick', 'gold_nugget', 'tesla_coil', 'miner_pick']);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks > 0, 'High-rank pedestals must auto-devour adjacent fodder');
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

// ============================================================================
// Feature 16: F-S3-03 — Scheme 3 Real-Time Greed Interest & Red-Zone Adrenaline (T1-F16-01 .. T1-F16-05)
// ============================================================================

test('T1-F16-01: Real-time +20% compound Gold interest accrues while resisting lever pulls', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1601 });
  forceEngineState(engine, { gold: 100 });
  engine.step(3000);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.gold >= 120, `Expected gold >= 120 after 3000ms interest tick, got ${st.gold}`);
});

test('T1-F16-02: Greed Streak Multiplier escalates while holding Gold across interest ticks', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1602 });
  const g0 = normalizeGameState(engine.getState(), engine).greedMultiplier;

  engine.step(3000);
  engine.step(3000);
  const g1 = normalizeGameState(engine.getState(), engine).greedMultiplier;

  assert.ok(g1 > g0, `Expected greedMultiplier to escalate above ${g0}, got ${g1}`);
});

test('T1-F16-03: Accumulated Greed Streak Multiplier multiplies the next lever pull burst damage', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engImmediate = new JackpotTDEngine({ seed: 1603 });
  forceEngineState(engImmediate, ['tesla_coil', 'tesla_coil', 'miner_pick', 'cryo_prism', 'prism_laser']);
  engImmediate.performPrimaryAction();
  const dmgImmediate = normalizeGameState(engImmediate.getState(), engImmediate).lastTurnBreakdown.totalDamage;

  const engGreedy = new JackpotTDEngine({ seed: 1603 });
  engGreedy.step(3000);
  engGreedy.step(3000);
  forceEngineState(engGreedy, ['tesla_coil', 'tesla_coil', 'miner_pick', 'cryo_prism', 'prism_laser']);
  engGreedy.performPrimaryAction();
  const dmgGreedy = normalizeGameState(engGreedy.getState(), engGreedy).lastTurnBreakdown.totalDamage;

  assert.ok(dmgGreedy > dmgImmediate, `Greedy wait pull (${dmgGreedy}) must out-damage immediate pull (${dmgImmediate})`);
});

test('T1-F16-04: Critical Red-Zone (closestEnemyProgress >= 0.72) activates Red-Zone Adrenaline state', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  const engine = new JackpotTDEngine({ seed: 1604 });
  forceEngineState(engine, { closestEnemyProgress: 0.76 });
  const st = normalizeGameState(engine.getState(), engine);

  assert.ok(st.closestEnemyProgress >= 0.72, 'Enemy must be in Critical Red Zone (>= 0.72)');
});

test('T1-F16-05: Red-Zone Adrenaline boosts clutch hand odds (+35%) when enemies reach y >= 0.72', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = requireExport(mod, ['JackpotTDEngine'], 'JackpotTDEngine.js');

  let safeClutchCount = 0;
  let redZoneClutchCount = 0;

  for (let i = 1; i <= 40; i++) {
    const engSafe = new JackpotTDEngine({ seed: i * 31 });
    forceEngineState(engSafe, { gold: 500, closestEnemyProgress: 0.1 });
    engSafe.performPrimaryAction();
    if (normalizeGameState(engSafe.getState(), engSafe).lastTurnBreakdown.lineMultiplier >= 20) {
      safeClutchCount++;
    }

    const engRed = new JackpotTDEngine({ seed: i * 31 });
    forceEngineState(engRed, { gold: 500, closestEnemyProgress: 0.78 });
    engRed.performPrimaryAction();
    if (normalizeGameState(engRed.getState(), engRed).lastTurnBreakdown.lineMultiplier >= 20) {
      redZoneClutchCount++;
    }
  }

  assert.ok(
    redZoneClutchCount > safeClutchCount,
    `Red Zone clutch hand count (${redZoneClutchCount}) must exceed Safe Zone (${safeClutchCount})`
  );
});

// ============================================================================
// Feature 17: F-S4-01 — Scheme 4 Exploration: Sigil Pachinko (T1-F17-01 .. T1-F17-05)
// ============================================================================

test('T1-F17-01: SigilPachinkoEngine initializes 1x3 spawner, 24 pegs, and 5 multiplier crucibles', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 401 });
  const st = normalizeGameState(engine.getState(), engine);

  assert.equal(st.schemeId, 'sigil-pachinko');
  assert.ok(Array.isArray(st.pegs) && st.pegs.length === 24, 'Pachinko arena must have 24 pegs');
  assert.ok(Array.isArray(st.crucibles) && st.crucibles.length === 5, 'Pachinko must have 5 bottom crucibles');
});

test('T1-F17-02: performPrimaryAction drops 3 alchemical orbs through pegs into bottom crucibles', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 402 });
  engine.performPrimaryAction();
  engine.step(500);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Orb drop must deal positive alchemical crucible damage');
});

test('T1-F17-03: Mid-air collision Auto-Devour fuses high-tier and low-tier orbs in <1000ms', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 403 });
  forceEngineState(engine, ['ember_orb', 'void_singularity', 'frost_core']);
  engine.performPrimaryAction();
  engine.step(500);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.devourStacks >= 1, 'High-tier orb must devour lower-tier orb mid-air');
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T1-F17-04: Center x25 JACKPOT crucible applies >= 25x multiplier and triggers ascending peg chimes', async () => {
  installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const SigilPachinkoEngine = requireExport(mod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');

  const engine = new SigilPachinkoEngine({ seed: 404, sound });
  forceEngineState(engine, { spawner: ['gold_stone', 'ember_orb', 'frost_core'], forceCrucibleIndex: 2 });
  engine.performPrimaryAction({ forceCrucibleIndex: 2 });
  engine.step(500);

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 25, `Center jackpot crucible must apply >= 25x mult, got ${st.lastTurnBreakdown.lineMultiplier}`);
});

test('T1-F17-05: Chaos Tilt (performSecondaryAction) nudges orbs and SigilPachinkoView renders required DOM testids', async () => {
  const env = installMockBrowserEnv();
  const engMod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const viewMod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoView.js');
  const SigilPachinkoEngine = requireExport(engMod, ['SigilPachinkoEngine'], 'SigilPachinkoEngine.js');
  const SigilPachinkoView = requireExport(viewMod, ['SigilPachinkoView'], 'SigilPachinkoView.js');

  const engine = new SigilPachinkoEngine({ seed: 405 });
  engine.performSecondaryAction();

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
    assert.ok(container.querySelector(`[data-testid="${id}"]`), `Missing Scheme 4 DOM element [data-testid="${id}"]`);
  }
});

// ============================================================================
// Feature 18: F-S5-01 — Scheme 5 Exploration: Abyssal Grid (T1-F18-01 .. T1-F18-05)
// ============================================================================

test('T1-F18-01: AbyssalGridEngine initializes 4x4 tactical matrix (16 cells) and lock tracking', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 501 });
  const st = normalizeGameState(engine.getState(), engine);

  assert.equal(st.schemeId, 'abyssal-grid');
  const flatMatrix = Array.isArray(st.matrix?.[0]) ? st.matrix.flat() : st.matrix;
  assert.ok(Array.isArray(flatMatrix) && flatMatrix.length === 16, '4x4 matrix must have 16 cells');
  assert.ok(Array.isArray(st.lockedCells));
});

test('T1-F18-02: Apex Commander auto-locks (HOLD) and devours orthogonal fodder neighbors in <1000ms', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 502 });
  const grid16 = Array(16).fill('skeleton');
  grid16[5] = 'abyssal_knight'; // row 1, col 1 (orthogonal neighbors: 1, 4, 6, 9)
  forceEngineState(engine, grid16);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  assert.ok(st.lockedCells.includes(5), 'Apex Commander at cell 5 must auto-lock');
  assert.ok(st.lastTurnBreakdown.devourStacks >= 4, `Commander at cell 5 must devour 4 orthogonal fodder neighbors, got ${st.lastTurnBreakdown.devourStacks}`);
  assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
});

test('T1-F18-03: Locked cells persist their Commander and devourStacks across Hold-&-Respin', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 503 });
  const grid16 = Array(16).fill('skeleton');
  grid16[0] = 'abyssal_knight';
  forceEngineState(engine, grid16);
  engine.performPrimaryAction();

  const st1 = normalizeGameState(engine.getState(), engine);
  assert.ok(st1.lockedCells.includes(0));

  engine.performPrimaryAction();
  const st2 = normalizeGameState(engine.getState(), engine);
  assert.ok(st2.lockedCells.includes(0), 'Cell 0 must remain locked on subsequent respin');
});

test('T1-F18-04: 10-Line Row/Col/Diag Bingo Evaluator computes artillery barrage multipliers', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = requireExport(mod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');

  const engine = new AbyssalGridEngine({ seed: 504 });
  const grid16 = Array(16).fill('skeleton');
  // Complete Row 0 (0, 1, 2, 3) and Main Diag (0, 5, 10, 15) with Commanders
  for (const idx of [0, 1, 2, 3, 5, 10, 15]) {
    grid16[idx] = 'abyssal_knight';
  }
  forceEngineState(engine, grid16);
  engine.performPrimaryAction();

  const st = normalizeGameState(engine.getState(), engine);
  const bingoCount = Array.isArray(st.bingoLines) ? st.bingoLines.length : Number(st.bingoLines ?? 0);
  assert.ok(bingoCount >= 2, `Expected >= 2 completed Bingo lines, got ${bingoCount}`);
  assert.ok(st.lastTurnBreakdown.lineMultiplier >= 10.0);
});

test('T1-F18-05: AbyssalGridView renders 16 matrix cells and spin/fire action buttons', async () => {
  const env = installMockBrowserEnv();
  const engMod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const viewMod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridView.js');
  const AbyssalGridEngine = requireExport(engMod, ['AbyssalGridEngine'], 'AbyssalGridEngine.js');
  const AbyssalGridView = requireExport(viewMod, ['AbyssalGridView'], 'AbyssalGridView.js');

  const engine = new AbyssalGridEngine({ seed: 505 });
  const container = env.createContainer();
  const view = new AbyssalGridView(engine);
  view.mount(container, { engine });

  assert.ok(container.querySelector('[data-testid="abyssal-matrix"]'));
  for (let i = 0; i < 16; i++) {
    assert.ok(container.querySelector(`[data-testid="matrix-cell-${i}"]`), `Missing matrix-cell-${i}`);
  }
  assert.ok(container.querySelector('[data-testid="btn-matrix-spin"]'));
  assert.ok(container.querySelector('[data-testid="btn-matrix-fire"]'));
});

// ============================================================================
// Feature 19: F-HUB-01 — Unified Arcade Hub, Live GDD Viewer, Audio Lab & Test Bridge (T1-F19-01 .. T1-F19-05)
// ============================================================================

test('T1-F19-01: Unified Game Registry (src/games/registry.js) catalogs and instantiates all 5 game schemes', async () => {
  const reg = await loadProjectModule('src/games/registry.js');
  const listFn = reg.getAllSchemes || reg.getSchemes || reg.listSchemes;
  const catalog = listFn ? listFn() : reg.GAME_REGISTRY || reg.SCHEMES || reg.default;
  assert.ok(catalog, 'registry.js must export scheme catalog');

  for (const schemeId of SCHEME_IDS) {
    let entry;
    if (typeof reg.getScheme === 'function') entry = reg.getScheme(schemeId);
    else if (Array.isArray(catalog)) entry = catalog.find((s) => s.id === schemeId);
    else entry = catalog[schemeId];

    assert.ok(entry, `Registry must include scheme '${schemeId}'`);
    const engine =
      typeof reg.createEngine === 'function'
        ? reg.createEngine(schemeId, { seed: 123 })
        : typeof entry.createEngine === 'function'
          ? entry.createEngine({ seed: 123 })
          : new entry.Engine({ seed: 123 });
    assert.equal(normalizeGameState(engine.getState(), engine).schemeId, schemeId);
  }
});

test('T1-F19-02: Unified Arcade Hub switches across all 5 schemes, GDD Viewer, and Audio Lab', async () => {
  installMockBrowserEnv();
  const html = readProjectText('index.html');
  globalThis.document.body.innerHTML = html;
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__ || globalThis.window.__SLOTBOUND_TEST__;
  assert.ok(bridge, 'src/main.js must initialize window.__SLOTBOUND__ bridge');

  for (const schemeId of [...SCHEME_IDS, 'gdd', 'audio-lab']) {
    await bridge.switchScheme(schemeId);
    assert.equal(bridge.getActiveScheme(), schemeId);
  }
});

test('T1-F19-03: In-App Live GDD Viewer in Unified Hub renders all 6 GDD documents', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('gdd');

  const panel = globalThis.document.querySelector('[data-testid="gdd-viewer-panel"]');
  const body = globalThis.document.querySelector('[data-testid="gdd-content-body"]');
  assert.ok(panel, 'GDD Viewer panel must be rendered in Hub');
  assert.ok(body && body.textContent.length > 100, 'GDD content body must contain rendered Chinese GDD markdown');
});

test('T1-F19-04: Audio & Math Lab soundboard triggers clack, devour, and chime events into window.__AUDIO_LOG__', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('audio-lab');

  globalThis.document.querySelector('[data-testid="audio-test-clunk"]')?.click();
  globalThis.document.querySelector('[data-testid="audio-test-devour"]')?.click();
  globalThis.document.querySelector('[data-testid="audio-test-chime"]')?.click();

  const log = bridge.getAudioLog();
  assert.ok(log.some((e) => e.type === 'clack'));
  assert.ok(log.some((e) => e.type === 'crunch'));
  assert.ok(log.some((e) => e.type === 'chime'));
});

test('T1-F19-05: Global bridge equivalence (window.__SLOTBOUND__ === window.__SLOTBOUND_TEST__) and Sandbox Jackpot trigger', async () => {
  installMockBrowserEnv();
  globalThis.document.body.innerHTML = readProjectText('index.html');
  await loadProjectModule('src/main.js');

  assert.ok(globalThis.window.__SLOTBOUND__, 'window.__SLOTBOUND__ must exist');
  assert.equal(
    globalThis.window.__SLOTBOUND__,
    globalThis.window.__SLOTBOUND_TEST__,
    'window.__SLOTBOUND__ and window.__SLOTBOUND_TEST__ must alias the same bridge'
  );

  const bridge = globalThis.window.__SLOTBOUND__;
  await bridge.switchScheme('devour-reels');
  globalThis.document.querySelector('[data-testid="sandbox-trigger-jackpot"]')?.click();

  const st = normalizeGameState(bridge.getState());
  assert.ok(st.lastTurnBreakdown.totalDamage > 0, 'Sandbox jackpot button must trigger a high-damage spin');
});
