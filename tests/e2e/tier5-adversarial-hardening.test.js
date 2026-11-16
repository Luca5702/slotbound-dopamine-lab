import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  SCHEME_IDS,
  loadProjectModule,
  requireExport,
  createSoundEngineInstance,
  normalizeGameState,
  forceEngineState,
  installMockBrowserEnv,
  withHeadlessBrowser,
} from './helpers/e2e-harness.js';

function rawHttpRequest(port, method, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: rawPath },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ============================================================================
// Tier 5 — White-Box Adversarial Hardening Suite (T5-01 .. T5-30)
// Track A: T5-01 .. T5-15 (Core, Audio, UI, Scheme 1 Devour Reels, Scheme 2 Revolver Dungeon)
// Track B: T5-16 .. T5-30 (Scheme 3 Jackpot TD, Scheme 4 Sigil Pachinko, Scheme 5 Abyssal Grid, Hub, Server & Chromium E2E)
// ============================================================================

test('T5-01: [F-CORE-01] PRNG fork(salt) determinism, mid-stream getState/setState checkpointing & tuple/inverted bounds', async () => {
  const mod = await loadProjectModule('src/core/PRNG.js');
  const createPRNG = requireExport(mod, ['createPRNG', 'PRNG'], 'src/core/PRNG.js');

  const rng1 = createPRNG(77777);
  const rng2 = createPRNG(77777);
  rng1.next();
  rng2.next();

  const childA1 = rng1.fork('branch-alpha');
  const childA2 = rng2.fork('branch-alpha');
  const childB = createPRNG(77777);
  childB.next();
  const childBeta = childB.fork('branch-beta');

  const seqA1 = Array.from({ length: 8 }, () => childA1.next());
  const seqA2 = Array.from({ length: 8 }, () => childA2.next());
  const seqBeta = Array.from({ length: 8 }, () => childBeta.next());
  assert.deepEqual(seqA1, seqA2, 'Identical parent state + salt must fork bit-identical child PRNG streams');
  assert.notDeepEqual(seqA1, seqBeta, 'Distinct fork salts must diverge child PRNG streams');

  // Mid-stream checkpoint & replay via getState() / setState()
  const checkpoint = rng1.getState();
  const firstPass = Array.from({ length: 10 }, () => rng1.nextInt(100, 999));
  rng1.setState(checkpoint);
  assert.equal(rng1.getState(), checkpoint);
  const replayPass = Array.from({ length: 10 }, () => rng1.nextInt(100, 999));
  assert.deepEqual(firstPass, replayPass, 'setState(checkpoint) must replay exact mid-stream sequence');

  // Inverted & degenerate nextFloat bounds, pick(), and tuple pickWeighted([[id, weight]])
  for (let i = 0; i < 20; i++) {
    const val = rng1.nextFloat(10, 2);
    assert.ok(val >= 2 && val < 10, `Inverted nextFloat(10, 2) must stay within [2, 10), got ${val}`);
  }
  assert.equal(rng1.nextFloat(5.5, 5.5), 5.5);
  assert.equal(rng1.pick([42]), 42);
  assert.equal(rng1.pick([]), null);

  const tuplePicked = rng1.pickWeighted([
    ['zero_tuple', 0],
    ['winner_tuple', 50],
  ]);
  assert.deepEqual(tuplePicked, ['winner_tuple', 50]);
});

test('T5-02: [F-CORE-02] BigInt sanitization, ±1e300 overflow clamping, Chinese 万亿 notation & endless wave >8 extrapolation', async () => {
  const bnMod = await loadProjectModule('src/core/BigNumber.js');
  const sfMod = await loadProjectModule('src/core/ScoreFormula.js');

  const {
    MAX_SAFE_GAME_NUMBER,
    sanitizeNumber,
    safeMultiply,
    formatChineseNumber,
  } = bnMod;
  const { calculateDevourMultiplier, getWaveProgressionTarget } = sfMod;

  assert.equal(sanitizeNumber(10n ** 20n), 1e20);
  assert.equal(sanitizeNumber(10n ** 350n), MAX_SAFE_GAME_NUMBER);
  assert.equal(safeMultiply(1e200, 1e200), MAX_SAFE_GAME_NUMBER);
  assert.equal(safeMultiply(1e200, -1e200), -MAX_SAFE_GAME_NUMBER);
  assert.equal(safeMultiply(), 0);

  assert.equal(formatChineseNumber(2.5e12), '2.50万亿');
  assert.equal(formatChineseNumber(-2.5e12), '-2.50万亿');
  assert.equal(formatChineseNumber(2.5e16), '2.50e16');

  // Explicit devourBase > 1 and totalRunDevoured > 0: 2.0^3 * (1 + 0.15 * 10) = 8 * 2.5 = 20
  assert.equal(calculateDevourMultiplier(3, 10, 2.0), 20);

  // Endless wave > 8 extrapolation beyond WAVE_PROGRESSION_TABLE
  const wave8 = getWaveProgressionTarget(8);
  const wave10 = getWaveProgressionTarget(10);
  assert.equal(wave8.targetBossHp, 85_000_000);
  assert.equal(wave10.wave, 10);
  assert.equal(wave10.elapsedSec, 285 + 2 * 45);
  assert.equal(wave10.targetBossHp, Math.floor(85_000_000 * Math.pow(6.5, 2)));
});

test('T5-03: [F-CORE-03] Gold-spend pull escalation, overdraft rejection vs emergency overdraft & full 8-relic pool exhaustion', async () => {
  const econMod = await loadProjectModule('src/core/EconomyEngine.js');
  const {
    DEFAULT_RELIC_CATALOG,
    createEconomyState,
    consumePull,
    applyRelic,
    getRelicDraftChoices,
  } = econMod;

  const state = createEconomyState({ gold: 12, basePullCost: 10, maxPullsPerWave: 5 });

  // Pull 1 costs 10G -> succeeds, gold becomes 2G, next pullCost escalates to 15G
  const res1 = consumePull(state, { spendGold: true, costEscalation: 5, allowOverdraft: false });
  assert.equal(res1.canPull, true);
  assert.equal(res1.goldSpent, 10);
  assert.equal(state.gold, 2);
  assert.equal(state.pullCost, 15);
  assert.equal(state.pullsRemaining, 4);

  // Pull 2 with allowOverdraft: false when gold (2) < pullCost (15) -> rejected without state mutation
  const res2 = consumePull(state, { spendGold: true, costEscalation: 5, allowOverdraft: false });
  assert.equal(res2.canPull, false);
  assert.equal(res2.goldSpent, 0);
  assert.equal(state.gold, 2);
  assert.equal(state.pullsRemaining, 4);

  // Pull 3 with allowOverdraft: true -> emergency pull succeeds, clamping gold to 0
  const res3 = consumePull(state, { spendGold: true, costEscalation: 5, allowOverdraft: true });
  assert.equal(res3.canPull, true);
  assert.equal(res3.goldSpent, 2);
  assert.equal(state.gold, 0);
  assert.equal(state.pullCost, 20);
  assert.equal(state.pullsRemaining, 3);

  // Apply all 8 canonical relics and verify cumulative modifiers + fallback draft when pool is exhausted
  for (const relic of DEFAULT_RELIC_CATALOG) {
    applyRelic(state, relic.id);
  }
  assert.equal(state.relics.length, 8);
  assert.equal(state.bonusDevourStacks, 1);
  assert.equal(state.chainMultBonus, 1.4);
  assert.equal(state.maxPullsPerWave, 6);
  assert.equal(state.acidRefluxOverdrive, true);
  assert.equal(state.interestRate, 0.35);
  assert.ok(state.greedMultiplier > 5.0);

  const fallbackDraft = getRelicDraftChoices(state, 3);
  assert.equal(fallbackDraft.length, 3, 'Exhausted relic pool must still return 3 fallback relic choices');
});

test('T5-04: [F-CORE-04] Async EventBus wildcard & re-entrant unsubscribe isolation + FlowTracker DRAFT_REWARD loop & 100-turn history cap', async () => {
  const busMod = await loadProjectModule('src/core/EventBus.js');
  const flowMod = await loadProjectModule('src/core/FlowTracker.js');
  const { EventBus } = busMod;
  const { FlowTracker } = flowMod;

  const bus = new EventBus({ maxLogSize: 20 });
  const order = [];

  bus.on('combat:hit', async (payload) => {
    await new Promise((r) => setTimeout(r, 5));
    order.push(`specific:${payload.dmg}`);
  });
  bus.on('*', async (payload, meta) => {
    order.push(`wildcard:${meta.event}:${payload.dmg}`);
  });

  await bus.emitAsync('combat:hit', { dmg: 777 });
  assert.deepEqual(order, ['specific:777', 'wildcard:combat:hit:777']);

  // Re-entrant unsubscribe + throwing listener isolation during synchronous emit
  let secondListenerCalled = false;
  const unsubSelf = bus.on('sync:test', () => {
    unsubSelf();
    throw new Error('Intentional listener error');
  });
  bus.on('sync:test', () => {
    secondListenerCalled = true;
  });
  bus.emit('sync:test', { ok: true });
  assert.equal(secondListenerCalled, true, 'Subsequent listener must run even if prior listener unsubscribes and throws');

  // FlowTracker 3-stage Spacebar state machine & 100-entry history ring buffer
  const tracker = new FlowTracker();
  const s1 = tracker.handleSpaceInput(1000);
  assert.equal(s1.action, 'START_SPIN');
  assert.equal(s1.phase, 'SPINNING');
  assert.equal(s1.speedMultiplier, 1.0);

  const s2 = tracker.handleSpaceInput(1100);
  assert.equal(s2.action, 'ENGAGE_TURBO');
  assert.equal(s2.speedMultiplier, 2.5);

  const settlement = tracker.completeSettlement(500, 1500);
  assert.equal(settlement.effectiveDurationMs, 200);
  assert.equal(settlement.withinOneSecondRule, true);

  assert.equal(tracker.enterRewardDraft(), 'DRAFT_REWARD');
  const s3 = tracker.handleSpaceInput(2200);
  assert.equal(s3.action, 'CONFIRM_REWARD');
  assert.equal(s3.phase, 'IDLE_READY');
  assert.equal(s3.speedMultiplier, 1.0);

  for (let i = 0; i < 115; i++) {
    tracker.startTurn(i * 100);
    tracker.completeSettlement(300, i * 100 + 50);
    tracker.completeTurn(600, i * 100 + 80);
  }
  const metrics = tracker.getMetrics();
  assert.equal(metrics.turnsCompleted, 116);
  assert.equal(metrics.history.length, 100, 'FlowTracker history must cap at 100 entries');
});

test('T5-05: [F-AUDIO-01] Web Audio synthesizer node graph execution with mock AudioContext & interactive soundboard cycling', async () => {
  const env = installMockBrowserEnv();
  const audioMod = await loadProjectModule('src/audio/SoundEngine.js');
  const { SoundEngine } = audioMod;

  const stats = {
    oscillators: 0,
    gains: 0,
    filters: 0,
    buffers: 0,
    bufferSources: 0,
  };

  class SpyAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 1.0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      stats.oscillators += 1;
      return {
        type: 'sine',
        frequency: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      stats.gains += 1;
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
      };
    }
    createBiquadFilter() {
      stats.filters += 1;
      return {
        type: 'lowpass',
        frequency: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        Q: { setValueAtTime() {} },
        connect() {},
      };
    }
    createBuffer(_channels, length) {
      stats.buffers += 1;
      return {
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      stats.bufferSources += 1;
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {},
      };
    }
  }

  globalThis.window.AudioContext = SpyAudioContext;
  const sound = new SoundEngine({ muted: false, volume: 0.5 });
  sound.clearAudioLog();

  sound.playReelClack(1, 3);
  sound.playDevourCrunch(2, 3);
  sound.playComboChime(12);
  sound.playChainExplosion(3);
  sound.playGunshot(true);
  sound.playLaserSweep(5000);
  sound.playMisfireBackfire();

  assert.ok(stats.oscillators >= 10, `Expected >= 10 oscillator nodes, got ${stats.oscillators}`);
  assert.ok(stats.gains >= 9, `Expected >= 9 gain nodes, got ${stats.gains}`);
  assert.ok(stats.filters >= 2, `Expected >= 2 biquad filter nodes, got ${stats.filters}`);
  assert.equal(sound.getAudioLog().length, 7);

  // Mount interactive soundboard and cycle chime button 26 times to verify modulo-25 wrap-around
  const container = env.createContainer();
  sound.renderSoundboard(container);
  const chimeBtn = container.querySelector('[data-testid="audio-test-chime"]');
  assert.ok(chimeBtn);

  for (let i = 0; i < 25; i++) {
    chimeBtn.click();
  }
  const logAt25 = sound.getAudioLog();
  assert.equal(logAt25[logAt25.length - 1].comboStep, 24);
  assert.equal(logAt25[logAt25.length - 1].frequencyHz, 2093);

  chimeBtn.click();
  const logAt26 = sound.getAudioLog();
  assert.equal(logAt26[logAt26.length - 1].comboStep, 0, '26th click must wrap _demoChimeStep back to 0');
  assert.equal(logAt26[logAt26.length - 1].frequencyHz, 523.25);
});

test('T5-06: [F-UI-01] VFXCanvas 2D context rendering pipeline, screen-shake decay class removal & HUDController extreme state sync', async () => {
  const env = installMockBrowserEnv();
  const vfxMod = await loadProjectModule('src/ui/VFXCanvas.js');
  const hudMod = await loadProjectModule('src/ui/HUDController.js');
  const { VFXCanvas } = vfxMod;
  const { HUDController } = hudMod;

  const drawCalls = {
    clearRect: 0,
    translate: 0,
    arc: 0,
    stroke: 0,
    fillText: 0,
  };

  const mockCtx = {
    clearRect() { drawCalls.clearRect += 1; },
    save() {},
    restore() {},
    translate() { drawCalls.translate += 1; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { drawCalls.stroke += 1; },
    arc() { drawCalls.arc += 1; },
    fill() {},
    fillText() { drawCalls.fillText += 1; },
  };

  const container = env.createContainer();
  const canvasEl = {
    width: 960,
    height: 540,
    parentElement: container,
    getContext: (type) => (type === '2d' ? mockCtx : null),
  };

  const vfx = new VFXCanvas(canvasEl);
  vfx.containerEl = container;
  vfx.spawnProjectile({ fromX: 100, fromY: 400, toX: 480, toY: 120, durationMs: 300 });
  vfx.spawnDevourEffect({ fromX: 200, fromY: 300, toX: 480, toY: 270, durationMs: 280 });
  vfx.spawnChainExplosion({ x: 480, y: 200, radius: 140, durationMs: 420 });
  vfx.spawnLaserSweep({ durationMs: 5000 });
  vfx.spawnFloatingText({ x: 480, y: 180, text: '-85.0M', tier: 4, durationMs: 700 });
  vfx.triggerScreenShake(4, 300);

  assert.equal(container.classList.contains('shake-tier-4'), true);

  vfx.step(50);
  assert.ok(drawCalls.translate >= 1, 'Active screen shake must invoke ctx.translate');
  assert.ok(drawCalls.arc >= 2, 'Projectiles and explosions must invoke ctx.arc');
  assert.ok(drawCalls.stroke >= 2, 'Lasers, devour trails, and explosions must invoke ctx.stroke');
  assert.ok(drawCalls.fillText >= 1, 'Floating damage popups must invoke ctx.fillText');

  // Step past remaining 250ms shake window -> verify shake-tier-4 class is automatically removed
  vfx.step(300);
  assert.equal(vfx.shakeState.remainingMs, 0);
  assert.equal(vfx.shakeState.intensityTier, 0);
  assert.equal(container.classList.contains('shake-tier-4'), false);

  const hudContainer = env.createContainer();
  const hud = new HUDController(hudContainer);
  const hudState = hud.update({
    wave: 8,
    enemyHp: 85_000_000,
    enemyMaxHp: 85_000_000,
    pullsRemaining: 4,
    gold: 12_500,
    greedMultiplier: 11.03,
    basePoints: 1250,
    lineMultiplier: 32,
    devourStacks: 18,
    devourStacksMultiplier: 180,
    chainSynergyMultiplier: 24,
    totalDamage: 85_000_000,
    comboName: '🌌 饕餮吞天 JACKPOT',
  });
  assert.equal(hudState.formattedDamage, '85.0M');
  assert.equal(hudState.formattedChineseDamage, '8500.0万');
  assert.equal(hudState.intensityTier, 4);
  const totalBox = hudContainer.querySelector('[data-testid="hud-total-damage"]');
  assert.equal(totalBox.getAttribute('data-intensity-tier'), '4');
});

test('T5-07: [F-UI-01 / F-GDD-01] GDDViewer renderMarkdownToHtml XSS escaping, unclosed code/table auto-close & interactive tab/prototype launch', async () => {
  const env = installMockBrowserEnv();
  const gddMod = await loadProjectModule('src/ui/GDDViewer.js');
  const { renderMarkdownToHtml, GDDViewer } = gddMod;

  const adversarialMd = [
    '# Title <script>alert("xss")</script>',
    '> Blockquote with **bold** and `inline_code`',
    '| Col1 | Col2 |',
    '|---|---|',
    '| Val1 | Val2 |',
    '```js',
    'const x = 1 < 2 && 3 > 1;',
  ].join('\n');

  const html = renderMarkdownToHtml(adversarialMd);
  assert.ok(!html.includes('<script>'), 'Raw <script> tags must be HTML-escaped');
  assert.ok(html.includes('&lt;script&gt;alert("xss")&lt;/script&gt;'));
  assert.ok(html.includes('<blockquote>Blockquote with <strong>bold</strong> and <code>inline_code</code></blockquote>'));
  assert.ok(html.includes('<table class="gdd-table"><tbody>'));
  assert.ok(html.includes('</tbody></table>'), 'Table before code block must auto-close');
  assert.ok(html.endsWith('</code></pre>'), 'Unclosed code fence at EOF must auto-close');

  let launchedId = null;
  const container = env.createContainer();
  const viewer = new GDDViewer({
    containerEl: container,
    onLaunchScheme: (schemeId) => {
      launchedId = schemeId;
    },
  });

  const tabBtn = container.querySelector('[data-doc-id="03-scheme2-revolver-dungeon"]');
  assert.ok(tabBtn);
  tabBtn.click();
  assert.equal(viewer.getActiveDocument().id, '03-scheme2-revolver-dungeon');

  const launchBtn = container.querySelector('[data-action="launch-scheme"]');
  assert.ok(launchBtn);
  launchBtn.click();
  assert.equal(launchedId, 'revolver-dungeon');
});

test('T5-08: [F-S1-01 / F-S1-02] DevourReelsEngine Food-Chain Apex Preemption (Tier 4 devours Tier 3 predator before Tier 3 can eat Tier 1 prey)', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const { DevourReelsEngine } = mod;

  const engine = new DevourReelsEngine({ seed: 508 });
  // Cell 0: Tier 4 abyss_apostle (adjacent to 1, 3, 4)
  // Cell 1: Tier 3 hero_berserker (adjacent to 0, 2, 3, 4, 5)
  // Cell 2: Tier 1 goblin (adjacent ONLY to 1, 4, 5 — NOT adjacent to 0!)
  // Cells 3..8: non-predator digestive_herb
  forceEngineState(engine, [
    'abyss_apostle', 'hero_berserker', 'goblin',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
  ]);

  const state = engine.performPrimaryAction();
  assert.equal(state.grid[0].symbolId, 'abyss_apostle');
  assert.equal(state.grid[1].symbolId, 'hero_berserker');
  assert.equal(state.grid[1].devoured, true, 'Tier 4 abyss_apostle at cell 0 must devour Tier 3 hero_berserker at cell 1');
  assert.equal(state.grid[1].devouredBy, 0);
  assert.equal(state.grid[1].devourCount, 0, 'Preemptively devoured Tier 3 predator must not execute its own predation');
  assert.equal(state.grid[2].symbolId, 'goblin');
  assert.equal(state.grid[2].devoured, false, 'Tier 1 goblin at cell 2 must survive because its only adjacent predator (cell 1) was eaten first');
});

test('T5-09: [F-S1-01 / F-S1-02] DevourReelsEngine Center Abyssal Maw (Cell 4) equal-tier tie-break priority over peripheral predators', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const { DevourReelsEngine } = mod;

  const engine = new DevourReelsEngine({ seed: 509 });
  // Cell 0 (iron_knight, Tier 2) and Center Maw Cell 4 (iron_knight, Tier 2) both border Cell 1 (goblin, Tier 1)
  forceEngineState(engine, [
    'iron_knight', 'goblin', 'digestive_herb',
    'digestive_herb', 'iron_knight', 'digestive_herb',
    'digestive_herb', 'digestive_herb', 'digestive_herb',
  ]);

  const state = engine.performPrimaryAction();
  assert.equal(state.grid[1].devoured, true);
  assert.equal(state.grid[1].devouredBy, 4, 'Center Abyssal Maw (cell 4) must win equal-tier tie-break over cell 0');
  assert.equal(state.grid[4].devourCount, 1);
  assert.equal(state.grid[0].devourCount, 0);
});

test('T5-10: [F-S1-02 / F-S1-03] DevourReelsEngine simultaneous 5-synergy mega-turn + acid_reflux_core Bile Tsunami (x15.0) + relic stacking', async () => {
  const econMod = await loadProjectModule('src/core/EconomyEngine.js');
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const { applyRelic } = econMod;
  const { DevourReelsEngine } = mod;

  const engine = new DevourReelsEngine({ seed: 510, enemyHp: 999_999_999 });
  applyRelic(engine.economy, 'acid_reflux_core');
  applyRelic(engine.economy, 'gluttony_jaw');
  applyRelic(engine.economy, 'pyro_catalyst');

  forceEngineState(engine, {
    indigestion: 95,
    enemyHp: 999_999_999,
    enemyMaxHp: 999_999_999,
    pullsRemaining: 5,
  });
  forceEngineState(engine, [
    'fireball', 'powder_keg', 'curse_skull',
    'iron_knight', 'abyss_apostle', 'hero_berserker',
    'iron_knight', 'iron_knight', 'goblin',
  ]);

  const state1 = engine.performPrimaryAction();
  const synergies1 = state1.lastTurnBreakdown.triggeredSynergies.join(' | ');

  // Verify all 5 stomach chain reactions triggered simultaneously in Spin 1
  assert.ok(synergies1.includes('fireball_powder_keg'));
  assert.ok(synergies1.includes('triple_iron_knights'));
  assert.ok(synergies1.includes('hero_banquet'));
  assert.ok(synergies1.includes('curse_transmutation'));
  assert.ok(synergies1.includes('full_board_gluttony'));
  assert.equal(state1.mawArmor, 120);
  assert.ok(
    state1.lastTurnBreakdown.chainSynergyMultiplier >= 1.4 * 6.0 * 4.5 * 3.5 * 8.0 * 10.0 - 1,
    `Expected massive 5-synergy compounded chainSynergyMultiplier, got ${state1.lastTurnBreakdown.chainSynergyMultiplier}`
  );

  // Spin 2: Overload indigestion >= 100 with 9x curse_skull -> triggers x15.0 acid_reflux_core Bile Tsunami & resets indigestion to 30
  forceEngineState(engine, Array(9).fill('curse_skull'));
  const state2 = engine.performPrimaryAction();
  const synergies2 = state2.lastTurnBreakdown.triggeredSynergies.join(' | ');
  assert.ok(synergies2.includes('bile_eruption'));
  assert.equal(state2.indigestion, 30);
  assert.equal(state2.mawArmor, 95, 'Bile Eruption must corrode 25 armor from 120 down to 95');
  assert.equal(state2.lastTurnBreakdown.chainSynergyMultiplier, Number((1.4 * 15.0).toFixed(4)));
});

test('T5-11: [F-S1-01 / F-S1-03] DevourReelsEngine payline-conditional digestive_herb lineMultiplier boost & Wave 1->2 compound clear', async () => {
  const mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const { DevourReelsEngine } = mod;

  // Engine A: 3x digestive_herb forming a top-row payline (row_0) with non-predator lower rows
  const engPayline = new DevourReelsEngine({ seed: 511, enemyHp: 50000 });
  forceEngineState(engPayline, { enemyHp: 50000, enemyMaxHp: 50000 });
  forceEngineState(engPayline, [
    'digestive_herb', 'digestive_herb', 'digestive_herb',
    'goblin', 'chest', 'powder_keg',
    'chest', 'goblin', 'powder_keg',
  ]);
  const stPayline = engPayline.performPrimaryAction();

  // Engine B: 3x digestive_herb with 0 matched paylines and non-predator cells
  const engNoPayline = new DevourReelsEngine({ seed: 511, enemyHp: 50000 });
  forceEngineState(engNoPayline, { enemyHp: 50000, enemyMaxHp: 50000 });
  forceEngineState(engNoPayline, [
    'digestive_herb', 'goblin', 'digestive_herb',
    'goblin', 'digestive_herb', 'chest',
    'chest', 'goblin', 'powder_keg',
  ]);
  const stNoPayline = engNoPayline.performPrimaryAction();

  assert.equal(stPayline.mawBaseAttackBonus, 36, '3 herbs must grant +36 permanent Maw base attack');
  assert.equal(stNoPayline.mawBaseAttackBonus, 36, '3 herbs without payline still grant +36 Maw base attack');
  assert.equal(stNoPayline.lastTurnBreakdown.lineMultiplier, 1.0, 'Without matched paylines, herbs must not inflate lineMultiplier');
  assert.ok(stPayline.lastTurnBreakdown.lineMultiplier >= 4.0, 'With matched payline, 3 herbs must add +1.5 to lineMultiplier');

  // Lethal Wave 1 spin settles 4 unused pulls into compound interest and advances to Wave 2 (650 HP)
  const engClear = new DevourReelsEngine({ seed: 511 });
  forceEngineState(engClear, Array(9).fill('abyss_apostle'));
  const stCleared = engClear.performPrimaryAction();
  assert.equal(stCleared.wave, 2);
  assert.equal(stCleared.enemyMaxHp, 650);
  assert.ok(stCleared.gold > 250, 'Clearing Wave 1 in 1 pull (U=4) must bank substantial compound interest');
});

test('T5-12: [F-S2-02] RevolverDungeonEngine Full Cylinder Dump trio protection during Parasite circular neighbor devour', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const { RevolverDungeonEngine } = mod;

  const engine = new RevolverDungeonEngine({ seed: 512 });
  forceEngineState(engine, {
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    chambers: [
      'powder_charge',
      'parasite_bullet',
      'lead_bullet',
      'fuse_cord',
      'heavy_hammer',
      'empty',
    ],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });

  const state = engine.performPrimaryAction({ targetChamber: 1 });
  const synergies = state.lastTurnBreakdown.triggeredSynergies.join(' | ');

  // Parasite at chamber 1 must eat lead_bullet at chamber 2 while preserving powder_charge at chamber 0
  assert.equal(state.devourEvents.length, 1);
  assert.equal(state.devourEvents[0].fromChamber, 2);
  assert.equal(state.devourEvents[0].preyId, 'lead_bullet');
  assert.ok(synergies.includes('full_cylinder_dump'), 'Full Cylinder Dump must still trigger because powder_charge was protected');
  assert.ok(synergies.includes('parasite_devour'));
  assert.equal(state.lastTurnBreakdown.devourStacks, 2);
  assert.equal(state.lastTurnBreakdown.chainSynergyMultiplier, 24.0);
});

test('T5-13: [F-S2-02 / F-S2-03] RevolverDungeonEngine sympathetic scatter_bullet burst igniting adjacent vampire_bullet & demon_bullet', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const { RevolverDungeonEngine } = mod;

  const engine = new RevolverDungeonEngine({ seed: 513 });
  forceEngineState(engine, {
    playerHp: 70,
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    chambers: [
      'vampire_bullet',
      'scatter_bullet',
      'demon_bullet',
      'empty',
      'empty',
      'empty',
    ],
    activeChamberIndex: 1,
    forcedChamberIndex: 1,
  });

  const state = engine.performPrimaryAction({ targetChamber: 1, forceBackfire: true });
  const synergies = state.lastTurnBreakdown.triggeredSynergies.join(' | ');

  assert.ok(synergies.includes('scatter_burst'), 'scatter_bullet must trigger sympathetic neighbor burst');
  assert.ok(synergies.includes('vampire_leech'), 'Left neighbor vampire_bullet must heal +20 HP');
  assert.ok(synergies.includes('demon_backfire_blood_rage'), 'Right neighbor demon_bullet must trigger backfire blood rage (-20 HP)');
  assert.equal(state.playerHp, 70, 'Net playerHp after +20 vampire leech and -20 demon backfire must equal 70');
  assert.equal(state.bloodRageActive, true);
});

test('T5-14: [F-S2-01 / F-S2-02] RevolverDungeonEngine clockwise powder_charge wrap-around (Chamber 5->0) & full-cylinder lowest-tier replacement', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const { RevolverDungeonEngine } = mod;

  const engine = new RevolverDungeonEngine({ seed: 514 });
  forceEngineState(engine, {
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    chambers: [
      'heavy_hammer',
      'empty',
      'empty',
      'empty',
      'empty',
      'powder_charge',
    ],
    activeChamberIndex: 5,
    forcedChamberIndex: 5,
  });

  const stateAfterFire = engine.performPrimaryAction({ targetChamber: 5 });
  const synergies = stateAfterFire.lastTurnBreakdown.triggeredSynergies.join(' | ');
  assert.ok(synergies.includes('powder_ignition'));
  assert.equal(stateAfterFire.lastTurnBreakdown.basePoints, 30 + 90, 'powder_charge at 5 must wrap around to fire heavy_hammer at 0');
  assert.equal(stateAfterFire.lastTurnBreakdown.chainSynergyMultiplier, 2.0);

  // Fill all 6 chambers where chamber 3 is the sole Tier 1 bullet (lead_bullet) and others are Tier 2..4
  forceEngineState(engine, {
    chambers: [
      'heavy_hammer',
      'demon_bullet',
      'parasite_bullet',
      'lead_bullet',
      'vampire_bullet',
      'scatter_bullet',
    ],
  });
  const stateAfterLoad = engine.performSecondaryAction({ bulletId: 'demon_bullet' });
  assert.equal(stateAfterLoad.chambers.length, 6);
  assert.equal(stateAfterLoad.chambers[3].id, 'demon_bullet', 'Loading into a full 6/6 cylinder must replace the lowest-tier chamber (index 3)');
});

test('T5-15: [F-S2-03] RevolverDungeonEngine 5-empty-chamber Lone Survivor Demon Bullet Gambit + Grit consumption', async () => {
  const mod = await loadProjectModule('src/games/revolver-dungeon/RevolverDungeonEngine.js');
  const { RevolverDungeonEngine } = mod;

  const engine = new RevolverDungeonEngine({ seed: 515 });
  forceEngineState(engine, {
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    chambers: ['empty', 'lead_bullet', 'empty', 'empty', 'empty', 'empty'],
    activeChamberIndex: 0,
    forcedChamberIndex: 0,
  });

  // Step 1: Survive dry click on chamber 0 to earn Grit (x2.0 next shot + 15G)
  const stDry = engine.performPrimaryAction({ targetChamber: 0 });
  assert.equal(stDry.gritMultiplier, 2.0);
  assert.equal(stDry.gold, 115);

  // Step 2: Replace chamber 1 with demon_bullet (5 empty chambers + 1 demon_bullet) and fire without backfire
  engine.performSecondaryAction({ chamberIndex: 1, bulletId: 'demon_bullet' });
  const stLoneDemon = engine.performPrimaryAction({ targetChamber: 1, forceBackfire: false });
  const synergies = stLoneDemon.lastTurnBreakdown.triggeredSynergies.join(' | ');

  assert.ok(synergies.includes('demon_blood_gambit'));
  assert.ok(synergies.includes('lone_survivor_roulette'));
  assert.ok(synergies.includes('grit_consumed'));
  assert.equal(stLoneDemon.gritMultiplier, 1.0, 'Grit bonus must reset to 1.0 after being consumed');
  // Expected lineMultiplier: 8.0 (demon mult) * ((1 + 0.65*5) * 1.5 * 2.5 = 15.9375) * 2.0 (grit) = 255
  assert.equal(stLoneDemon.lastTurnBreakdown.lineMultiplier, 255);
  assert.equal(stLoneDemon.lastTurnBreakdown.chainSynergyMultiplier, 2.0);
});

test('T5-16: [F-S3-02] JackpotTDEngine exhaustive 6^5 = 7,776 Yahtzee permutation partition & malformed hand resilience', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const cfgMod = await loadProjectModule('src/games/jackpot-td/config.js');
  const { evaluateYahtzeeHand } = mod;
  const towerIds = cfgMod.TOWERS.map((t) => t.id);

  assert.equal(towerIds.length, 6);
  const countsByHand = {};
  let totalPermutations = 0;

  for (const a of towerIds) {
    for (const b of towerIds) {
      for (const c of towerIds) {
        for (const d of towerIds) {
          for (const e of towerIds) {
            const hand = evaluateYahtzeeHand([a, b, c, d, e]);
            countsByHand[hand.id] = (countsByHand[hand.id] || 0) + 1;
            totalPermutations += 1;
          }
        }
      }
    }
  }

  assert.equal(totalPermutations, 7776);
  assert.equal(countsByHand.YAHTZEE_FIVE, 6);
  assert.equal(countsByHand.FOUR_OF_A_KIND, 150);
  assert.equal(countsByHand.FULL_HOUSE, 300);
  assert.equal(countsByHand.LARGE_STRAIGHT, 240);
  assert.equal(countsByHand.SMALL_STRAIGHT, 960);
  assert.equal(countsByHand.THREE_OF_A_KIND, 1200);
  assert.equal(countsByHand.TWO_PAIR, 1800);
  assert.equal(countsByHand.ONE_PAIR, 2880);
  assert.equal(countsByHand.HIGH_CARD, 240);

  // Mixed object/null/undefined/oversized array -> 3x nuke_core + 2x default miner_pick = FULL_HOUSE
  const mixedHand = evaluateYahtzeeHand([
    { symbolId: 'nuke_core' },
    { towerId: 'nuke_core' },
    { id: 'nuke_core' },
    null,
    undefined,
    'extra_ignored',
  ]);
  assert.equal(mixedHand.id, 'FULL_HOUSE');
});

test('T5-17: [F-S3-02] JackpotTDEngine Pedestal Reach-1 vs Reach-2 Auto-Devour & Cross-Pull Permanent Stack Persistence', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const { JackpotTDEngine } = mod;

  const engine = new JackpotTDEngine({ seed: 517, enemyHp: 9_999_999 });
  forceEngineState(engine, { enemyHp: 9_999_999, enemyMaxHp: 9_999_999, gold: 500 });

  // Pull 1: tesla_coil at index 2 (1-star, rank 4 -> reach = 1) devours only indices 1 and 3
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'tesla_coil', 'miner_pick', 'gold_nugget']);
  const st1 = engine.performPrimaryAction();
  assert.equal(st1.pedestals[2].devourCount, 2);
  assert.equal(st1.pedestals[2].permanentDevourStacks, 6);
  assert.equal(st1.pedestals[0].devoured, false, 'Index 0 is distance 2 from reach-1 predator and must survive');
  assert.equal(st1.pedestals[4].devoured, false, 'Index 4 is distance 2 from reach-1 predator and must survive');

  // Pull 2: nuke_core at index 2 (rank 6 -> reach = 2) reaches ±2 to devour indices 0, 1, 4 while skipping rank-3 cryo_prism at 3
  forceEngineState(engine, ['miner_pick', 'gold_nugget', 'nuke_core', 'cryo_prism', 'gold_nugget']);
  const st2 = engine.performPrimaryAction();
  assert.equal(st2.pedestals[0].devoured, true);
  assert.equal(st2.pedestals[1].devoured, true);
  assert.equal(st2.pedestals[3].devoured, false, 'Rank-3 cryo_prism is not fodder and must not be devoured');
  assert.equal(st2.pedestals[4].devoured, true);
  assert.equal(st2.pedestals[2].permanentDevourStacks, 16, 'Permanent stacks on pedestal 2 must accumulate across pulls (6 + 10 = 16)');
});

test('T5-18: [F-S3-01 / F-S3-02] JackpotTDEngine partial freeze slice thaw, Cryo slow aura & Tunnel Berserker enrage physics', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const { JackpotTDEngine } = mod;

  // 1. Partial freeze slice thaw: 1500ms frozen + 1000ms marching in a 2500ms step
  const engFreeze = new JackpotTDEngine({ seed: 518 });
  const initialProgress = engFreeze.getState().closestEnemyProgress;
  forceEngineState(engFreeze, { freezeRemainingMs: 1500, laserRemainingMs: 2000 });
  const stAfterThaw = engFreeze.step(2500);
  assert.equal(stAfterThaw.freezeRemainingMs, 0);
  assert.equal(stAfterThaw.laserRemainingMs, 0);
  assert.ok(stAfterThaw.closestEnemyProgress > initialProgress, 'Enemies must advance during the 1000ms post-thaw slice');

  // 2. Tunnel Berserker Enrage (< 50% HP moves at enragedSpeed = 0.18 vs normal 0.12)
  const engNormal = new JackpotTDEngine({ seed: 518 });
  const engEnraged = new JackpotTDEngine({ seed: 518 });
  engEnraged.enemies[2].hp = Math.floor(engEnraged.enemies[2].maxHp * 0.3);
  engNormal.step(1000);
  engEnraged.step(1000);
  assert.ok(
    engEnraged.enemies[2].progress > engNormal.enemies[2].progress,
    'Enraged tunnel_berserker (<50% HP) must march faster than full-HP berserker'
  );

  // 3. Cryo Prism passive slow aura (slowMultiplier = 0.78)
  const engNoCryo = new JackpotTDEngine({ seed: 518 });
  const engCryo = new JackpotTDEngine({ seed: 518 });
  engNoCryo.pedestals = engNoCryo.pedestals.map((p) => ({ ...p, symbolId: 'miner_pick', devoured: false }));
  engCryo.pedestals = engCryo.pedestals.map((p, idx) => ({
    ...p,
    symbolId: idx === 0 ? 'cryo_prism' : 'miner_pick',
    devoured: false,
  }));
  const stNoCryo = engNoCryo.step(1000);
  const stWithCryo = engCryo.step(1000);
  assert.ok(stWithCryo.closestEnemyProgress < stNoCryo.closestEnemyProgress, 'Undevoured cryo_prism must slow enemy progress');
});

test('T5-19: [F-S3-03] JackpotTDEngine fractional interest accumulation, 5.0x Greed Streak cap & cash-in reset', async () => {
  const mod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const { JackpotTDEngine } = mod;

  const engine = new JackpotTDEngine({ seed: 519, gold: 100, enemyHp: 9_999_999 });
  forceEngineState(engine, { enemyHp: 9_999_999, enemyMaxHp: 9_999_999 });

  for (let i = 0; i < 10; i++) {
    engine.step(250);
  }
  const stTick1 = engine.getState();
  assert.equal(stTick1.gold, 120);
  assert.equal(stTick1.greedStreak, 1);
  assert.equal(stTick1.greedMultiplier, 1.5);

  // Step 4 more intervals (10,000ms) -> 5 total ticks -> capped at 5.0x GREED_STREAK_TIERS ceiling
  const stTick5 = engine.step(10000);
  assert.equal(stTick5.greedStreak, 5);
  assert.equal(stTick5.greedMultiplier, 5.0);

  // Pull lever against high-HP boss -> cashes in 5.0x Greed Multiplier and resets greedStreak to 0
  const stPull = engine.performPrimaryAction();
  assert.equal(stPull.lastTurnBreakdown.greedMultiplier, 5.0);
  assert.equal(stPull.greedStreak, 0);
});

test('T5-20: [F-S4-01] SigilPachinkoEngine multi-tier mid-air Auto-Devour hierarchy (equal-apex survival vs dual-prey fusion)', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const { SigilPachinkoEngine } = mod;

  // Case 1: Two Tier-4 apex orbs + one Tier-1 orb -> both Tier-4 orbs survive, Tier-1 orb is devoured
  const engEqualApex = new SigilPachinkoEngine({ seed: 520, enemyHp: 9_999_999 });
  const initialGold = engEqualApex.getState().gold;
  forceEngineState(engEqualApex, {
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    spawner: ['philosopher_stone', 'void_singularity', 'gold_droplet'],
  });
  const st1 = engEqualApex.performPrimaryAction();
  const surviving1 = st1.orbs.filter((o) => !o.devoured);
  assert.equal(surviving1.length, 2, 'Two equal highest-tier orbs must never devour each other');
  assert.equal(st1.lastDevourEvents.length, 1);
  assert.ok(st1.gold >= initialGold + 50, 'Gold bonuses from eaten gold_droplet (+20G) and philosopher_stone (+30G) must both credit');

  // Case 2: Tier 4 + Tier 3 + Tier 2 -> Tier 4 devours both lower-tier orbs
  const engCascade = new SigilPachinkoEngine({ seed: 520, enemyHp: 9_999_999 });
  forceEngineState(engCascade, {
    enemyHp: 9_999_999,
    enemyMaxHp: 9_999_999,
    spawner: ['philosopher_stone', 'void_glutton_orb', 'gold_stone'],
  });
  const st2 = engCascade.performPrimaryAction();
  const surviving2 = st2.orbs.filter((o) => !o.devoured);
  assert.equal(surviving2.length, 1);
  assert.equal(surviving2[0].eatenCount, 2);
  assert.equal(st2.lastDevourEvents.length, 2);
});

test('T5-21: [F-S4-01] SigilPachinkoEngine sub-400ms incremental wall reflection damping & crucible settle', async () => {
  const mod = await loadProjectModule('src/games/sigil-pachinko/SigilPachinkoEngine.js');
  const cfgMod = await loadProjectModule('src/games/sigil-pachinko/config.js');
  const { SigilPachinkoEngine } = mod;
  const { ARENA_BOUNDS } = cfgMod;

  const engine = new SigilPachinkoEngine({ seed: 521, enemyHp: 9_999_999 });
  forceEngineState(engine, {
    enemyHp: 9_999_999,
    spawner: ['ember_orb', 'frost_core', 'gold_droplet'],
  });
  engine.performPrimaryAction();

  // Place orb 0 heading past left wall (minX = 40) and orb 1 heading past right wall (maxX = 760)
  engine.orbs[0].x = 42;
  engine.orbs[0].y = 100;
  engine.orbs[0].vx = -200;
  engine.orbs[0].vy = 200;
  engine.orbs[0].settled = false;

  engine.orbs[1].x = 758;
  engine.orbs[1].y = 100;
  engine.orbs[1].vx = 200;
  engine.orbs[1].vy = 200;
  engine.orbs[1].settled = false;

  const stBounce = engine.step(100);
  assert.equal(stBounce.orbs[0].settled, false);
  assert.ok(stBounce.orbs[0].x >= ARENA_BOUNDS.minX);
  assert.equal(stBounce.orbs[0].vx, 170, 'Left wall reflection must invert and damp vx by 0.85 (-200 -> +170)');
  assert.ok(stBounce.orbs[1].x <= ARENA_BOUNDS.maxX);
  assert.equal(stBounce.orbs[1].vx, -170, 'Right wall reflection must invert and damp vx by 0.85 (+200 -> -170)');

  const stSettled = engine.step(450);
  for (const orb of stSettled.orbs) {
    assert.equal(orb.settled, true);
    assert.equal(orb.y, ARENA_BOUNDS.crucibleY);
    assert.equal(orb.vx, 0);
    assert.equal(orb.vy, 0);
  }
});

test('T5-22: [F-S5-01] AbyssalGridEngine multi-turn locked Commander stack persistence & manual lock/unlock toggle', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const { AbyssalGridEngine } = mod;

  const engine = new AbyssalGridEngine({ seed: 522, enemyHp: 999_999_999 });
  const matrix = Array(16).fill('empty');
  matrix[5] = 'golden_overlord';
  matrix[1] = 'skeleton';
  matrix[4] = 'slime_blob';
  matrix[6] = 'mana_crystal';
  matrix[9] = 'gold_mimic';
  forceEngineState(engine, {
    enemyHp: 999_999_999,
    enemyMaxHp: 999_999_999,
    matrix,
  });

  const stSpin1 = engine.performPrimaryAction();
  assert.equal(stSpin1.matrix[5].id, 'golden_overlord');
  assert.equal(stSpin1.matrix[5].locked, true);
  assert.equal(stSpin1.matrix[5].devourStacks, 4);
  const bonusAfterSpin1 = stSpin1.matrix[5].bonusPoints;
  assert.ok(bonusAfterSpin1 > 0);

  // Spin 2: Hold-&-Respin must preserve locked Commander at cell 5 along with its accumulated devourStacks & bonusPoints
  const stSpin2 = engine.performPrimaryAction();
  assert.equal(stSpin2.matrix[5].id, 'golden_overlord');
  assert.equal(stSpin2.matrix[5].locked, true);
  assert.ok(stSpin2.matrix[5].devourStacks >= 4);
  assert.ok(stSpin2.matrix[5].bonusPoints >= bonusAfterSpin1);

  // Manual unlock and re-lock via performSecondaryAction
  const stUnlocked = engine.performSecondaryAction({ cellIndex: 5, locked: false });
  assert.equal(stUnlocked.lockedCells.includes(5), false);
  const stRelocked = engine.performSecondaryAction({ cellIndex: 5 });
  assert.equal(stRelocked.lockedCells.includes(5), true);
});

test('T5-23: [F-S5-01] AbyssalGridEngine exact Bingo line multiplier ladder (0, 1, 2, 3, 4, 5, 8, 10 lines) & cross-line geometry', async () => {
  const mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const cfgMod = await loadProjectModule('src/games/abyssal-grid/config.js');
  const { AbyssalGridEngine } = mod;
  const { getBingoLineMultiplier } = cfgMod;

  assert.equal(getBingoLineMultiplier(0), 1.0);
  assert.equal(getBingoLineMultiplier(1), 3.5);
  assert.equal(getBingoLineMultiplier(2), 10.0);
  assert.equal(getBingoLineMultiplier(3), 35.0);
  assert.equal(getBingoLineMultiplier(4), 50.0);
  assert.equal(getBingoLineMultiplier(5), 120.0);
  assert.equal(getBingoLineMultiplier(8), 450.0);
  assert.equal(getBingoLineMultiplier(10), 1000.0);

  // Force 3 intersecting lines: row_0 (0,1,2,3), col_0 (0,4,8,12), diag_main (0,5,10,15)
  const engine = new AbyssalGridEngine({ seed: 523, enemyHp: 999_999_999 });
  const matrix = Array(16).fill('empty');
  for (const idx of [0, 1, 2, 3, 4, 8, 12, 5, 10, 15]) {
    matrix[idx] = 'abyssal_knight';
  }
  forceEngineState(engine, {
    enemyHp: 999_999_999,
    enemyMaxHp: 999_999_999,
    matrix,
  });

  const state = engine.performPrimaryAction();
  const lineIds = state.bingoLines.map((l) => (typeof l === 'string' ? l : l.id)).sort();
  assert.deepEqual(lineIds, ['col_0', 'diag_main', 'row_0']);
  assert.equal(state.lastTurnBreakdown.lineMultiplier, 35.0);
});

test('T5-24: [F-HUB-01] Game Registry alias normalization & per-scheme jackpotSetup determinism', async () => {
  const regMod = await loadProjectModule('src/games/registry.js');
  const { normalizeSchemeId, isValidSchemeId, getAllSchemes } = regMod;

  assert.equal(normalizeSchemeId('scheme-1'), 'devour-reels');
  assert.equal(normalizeSchemeId('nav-scheme-1'), 'devour-reels');
  assert.equal(normalizeSchemeId('DEVOUR_REELS'), 'devour-reels');
  assert.equal(normalizeSchemeId('  scheme-2  '), 'revolver-dungeon');
  assert.equal(normalizeSchemeId('nav-scheme-3'), 'jackpot-td');
  assert.equal(normalizeSchemeId('jackpot_td'), 'jackpot-td');
  assert.equal(normalizeSchemeId('scheme-4'), 'sigil-pachinko');
  assert.equal(normalizeSchemeId('sigil_pachinko'), 'sigil-pachinko');
  assert.equal(normalizeSchemeId('scheme-5'), 'abyssal-grid');
  assert.equal(normalizeSchemeId('abyssal_grid'), 'abyssal-grid');
  assert.equal(normalizeSchemeId('nav-gdd-viewer'), 'gdd');
  assert.equal(normalizeSchemeId('nav-audio-lab'), 'audio-lab');

  assert.equal(normalizeSchemeId(''), null);
  assert.equal(normalizeSchemeId('unknown-scheme'), null);
  assert.equal(isValidSchemeId(null), false);
  assert.equal(isValidSchemeId(123), false);

  for (const scheme of getAllSchemes()) {
    const engine = scheme.createEngine({ seed: 524 });
    scheme.jackpotSetup(engine);
    const payload =
      scheme.id === 'revolver-dungeon'
        ? { targetChamber: 0, forceBackfire: false }
        : scheme.id === 'sigil-pachinko'
          ? { forceCrucibleIndex: 2 }
          : {};
    const st = engine.performPrimaryAction(payload);
    assert.ok(
      st.lastTurnBreakdown.totalDamage >= 1000,
      `jackpotSetup for ${scheme.id} must deal >= 1000 damage, got ${st.lastTurnBreakdown.totalDamage}`
    );
    assert.ok(st.lastTurnBreakdown.settlementDurationMs < 1000);
  }
});

test('T5-25: [F-HUB-01] ArcadeHubController cross-scheme engine state preservation & input focus hotkey guard', async () => {
  installMockBrowserEnv();
  const mainMod = await loadProjectModule('src/main.js');
  const { initApp } = mainMod;

  const bridge = initApp({ seed: 525 });
  bridge.switchScheme('jackpot-td');
  bridge.stepSimulation(2500, 2);
  const tdStateAfterInterest = bridge.getState();
  assert.equal(tdStateAfterInterest.gold, 144);

  // Switch to sigil-pachinko and gdd, then verify jackpot-td state was preserved in hub.engines
  bridge.switchScheme('sigil-pachinko');
  bridge.triggerPrimaryAction();
  await bridge.switchScheme('gdd');
  assert.equal(bridge.getState().activeScheme, 'gdd');
  assert.equal(bridge.getState().schemeId, 'sigil-pachinko');

  bridge.switchScheme('jackpot-td');
  assert.equal(bridge.getState().gold, 144, 'Switching back to jackpot-td must preserve accumulated 144G');

  // Verify keyboard events originating from INPUT / TEXTAREA / SELECT are ignored
  const pullsBefore = bridge.getState().pullsUsed;
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const handled = bridge.hub.onKeyDown({
      key: ' ',
      code: 'Space',
      target: { tagName },
    });
    assert.equal(handled, false, `Spacebar inside <${tagName}> must not trigger game actions`);
  }
  assert.equal(bridge.getState().pullsUsed, pullsBefore);
});

test('T5-26: [F-S3 / F-S4 / F-S5] Track B Views (JackpotTDView, SigilPachinkoView, AbyssalGridView) keyboard, turbo & unmount lifecycle', async () => {
  const env = installMockBrowserEnv();
  const sound = await createSoundEngineInstance();
  const hudMod = await loadProjectModule('src/ui/HUDController.js');
  const vfxMod = await loadProjectModule('src/ui/VFXCanvas.js');
  const regMod = await loadProjectModule('src/games/registry.js');

  const hud = new hudMod.HUDController(env.createContainer());
  const vfx = new vfxMod.VFXCanvas(null);

  for (const schemeId of ['jackpot-td', 'sigil-pachinko', 'abyssal-grid']) {
    const scheme = regMod.getScheme(schemeId);
    const engine = scheme.createEngine({ seed: 526, sound });
    const container = env.createContainer();
    const view = scheme.createView(engine, { sound, hud, vfx });
    view.mount(container, { engine, sound, hud, vfx });

    // KeyR secondary action
    const rHandled = view.onKeyDown({ code: 'KeyR', key: 'r', preventDefault() {} });
    assert.equal(rHandled, true);

    if (schemeId === 'jackpot-td') {
      assert.equal(engine.getState().gold, 120, 'KeyR in JackpotTDView must accrue +20% interest');
    } else if (schemeId === 'sigil-pachinko') {
      assert.equal(engine.getState().chaosTiltActive, true, 'KeyR in SigilPachinkoView must engage Chaos Tilt');
    } else if (schemeId === 'abyssal-grid') {
      assert.ok(
        engine.getState().lastTurnBreakdown.triggeredSynergies.includes('EARLY_FIRE_COMPOUND_BANK'),
        'KeyR in AbyssalGridView must trigger Early Fire compound bank'
      );
      // Also verify Wave 8 Early Fire wave clamp (Observation B-1)
      engine.forceState({ wave: 8, pullsRemaining: 3 });
      view.onKeyDown({ code: 'KeyR', key: 'r', preventDefault() {} });
      assert.equal(engine.getState().wave, 8, 'Early Fire on Wave 8 must clamp wave to 8');
    }

    // Repeat Spacebar primary action + 2.5x Turbo verification (Observation B-2)
    const spaceHandled = view.onKeyDown({
      code: 'Space',
      key: ' ',
      repeat: true,
      preventDefault() {},
    });
    assert.equal(spaceHandled, true);
    assert.equal(engine.flowTracker.getMetrics().speedMultiplier, 2.5);

    assert.equal(view.onKeyDown({ code: 'Escape', key: 'Escape' }), false);
    view.unmount();
    assert.equal(container.innerHTML, '');
  }
});

test('T5-27: [F-UI-01 / F-HUB-01] Static server (scripts/serve.js) multi-encoded traversal, null-byte, bad URI & HEAD hardening', async () => {
  const serveMod = await loadProjectModule('scripts/serve.js');
  const started = await serveMod.startServer({ port: 0, host: '127.0.0.1' });

  try {
    // 1. Double-encoded path traversal
    const resTraversal = await rawHttpRequest(started.port, 'GET', '/%252e%252e%252fpackage.json');
    assert.equal(resTraversal.statusCode, 403);

    // 2. Null-byte injection
    const resNullByte = await rawHttpRequest(started.port, 'GET', '/index.html%00.png');
    assert.equal(resNullByte.statusCode, 403);

    // 3. Malformed percent-encoding
    const resBadUri = await rawHttpRequest(started.port, 'GET', '/%E0%A4%A');
    assert.equal(resBadUri.statusCode, 400);

    // 4. HEAD /index.html returns 200 OK with Content-Length > 500 and empty body
    const resHead = await rawHttpRequest(started.port, 'HEAD', '/index.html');
    assert.equal(resHead.statusCode, 200);
    assert.ok(Number(resHead.headers['content-length']) > 500);
    assert.equal(resHead.body, '');

    // 5. Unsupported HTTP methods (PUT, DELETE) return 405 Method Not Allowed
    const resPut = await rawHttpRequest(started.port, 'PUT', '/index.html');
    assert.equal(resPut.statusCode, 405);
    const resDelete = await rawHttpRequest(started.port, 'DELETE', '/index.html');
    assert.equal(resDelete.statusCode, 405);
  } finally {
    await started.close();
  }
});

test('T5-28: [Chromium E2E] Live Headless Chromium Scheme 3 (Jackpot TD) Red-Zone Clutch Nuke, 3-Star Merge & DOM Sync', async () => {
  await withHeadlessBrowser(async (browser) => {
    await browser.clickTestId('nav-scheme-3');
    await browser.eval(`(() => {
      const b = window.__SLOTBOUND__;
      b.resetGame({ seed: 528, gold: 100 });
      b.stepSimulation(2500, 2);
      b.forceGridOrCylinder({ closestEnemyProgress: 0.80 });
      b.forceNextSpin(['nuke_core', 'nuke_core', 'nuke_core', 'nuke_core', 'nuke_core']);
    })()`);

    const stBeforePull = await browser.getBridgeState();
    assert.equal(stBeforePull.gold, 144);
    assert.equal(stBeforePull.greedMultiplier, 2.2);
    assert.equal(stBeforePull.isRedZoneCritical, true);

    await browser.clickTestId('btn-pull-lever');
    const domCheck = await browser.eval(`(() => {
      const star3Count = document.querySelectorAll('#scheme-mount .pedestal-star-3').length;
      const comboText = document.querySelector('[data-testid="td-active-combo"]')?.textContent || '';
      const state = window.__SLOTBOUND__.getState();
      return {
        star3Count,
        comboText,
        totalDamage: state.lastTurnBreakdown.totalDamage,
      };
    })()`);

    assert.equal(domCheck.star3Count, 5, '5-of-a-kind Nuke Core must render 5 .pedestal-star-3 DOM elements');
    assert.ok(domCheck.comboText.includes('五连核弹'), `Expected td-active-combo to include 五连核弹, got ${domCheck.comboText}`);
    assert.ok(domCheck.totalDamage >= 100_000, `Expected Yahtzee Nuke damage >= 100,000, got ${domCheck.totalDamage}`);
    assert.equal(browser.pageErrors.length, 0);
  });
});

test('T5-29: [Chromium E2E] Live Headless Chromium Scheme 4 (Sigil Pachinko) & Scheme 5 (Abyssal Grid) Interactive DOM & Crucible/Bingo Sync', async () => {
  await withHeadlessBrowser(async (browser) => {
    // Part 1: Scheme 4 (Sigil Pachinko) Chaos Tilt + Center x25 Jackpot Crucible hit
    await browser.clickTestId('nav-scheme-4');
    await browser.clickTestId('btn-chaos-tilt');
    await browser.eval(`(() => {
      window.__SLOTBOUND__.forceGridOrCylinder({
        spawner: ['philosopher_stone', 'gold_stone', 'ember_orb'],
        forceCrucibleIndex: 2,
      });
    })()`);
    await browser.clickTestId('btn-drop-orbs');

    const pachinkoCheck = await browser.eval(`(() => {
      const crucible2 = document.querySelector('[data-testid="pachinko-crucible-2"]');
      const st = window.__SLOTBOUND__.getState();
      return {
        hasHitClass: Boolean(crucible2 && crucible2.classList.contains('crucible-hit')),
        lineMultiplier: st.lastTurnBreakdown.lineMultiplier,
        totalDamage: st.lastTurnBreakdown.totalDamage,
      };
    })()`);
    assert.equal(pachinkoCheck.hasHitClass, true, 'Center crucible-2 must have class crucible-hit');
    assert.ok(pachinkoCheck.lineMultiplier >= 25);
    assert.ok(pachinkoCheck.totalDamage > 1000);

    // Part 2: Scheme 5 (Abyssal Grid) 15x Commander + 1x Fodder devour -> 8 Bingo lines + Early Fire button
    await browser.clickTestId('nav-scheme-5');
    await browser.eval(`(() => {
      const m = Array(16).fill('golden_overlord');
      m[1] = 'gold_mimic';
      window.__SLOTBOUND__.forceGridOrCylinder({
        enemyHp: 999999999,
        enemyMaxHp: 999999999,
        matrix: m,
      });
    })()`);
    await browser.clickTestId('btn-matrix-spin');

    const gridCheck = await browser.eval(`(() => {
      const lockedDomCount = document.querySelectorAll('#scheme-mount .matrix-cell-locked').length;
      const st = window.__SLOTBOUND__.getState();
      return {
        lockedDomCount,
        bingoLinesCount: (st.bingoLines || []).length,
      };
    })()`);
    assert.equal(gridCheck.lockedDomCount, 15);
    assert.equal(gridCheck.bingoLinesCount, 8);

    await browser.clickTestId('btn-matrix-fire');
    const stAfterFire = await browser.getBridgeState();
    assert.ok(stAfterFire.lastTurnBreakdown.triggeredSynergies.includes('EARLY_FIRE_COMPOUND_BANK'));
    assert.equal(browser.pageErrors.length, 0);
  });
});

test('T5-30: [Chromium E2E] Live Headless Chromium Sandbox Seed Coercion, 5-Scheme Jackpot Sweep & GDD Prototype Launch Round-Trip', async () => {
  await withHeadlessBrowser(async (browser) => {
    const coercedSeed = await browser.eval(`(() => {
      const input = document.querySelector('[data-testid="sandbox-seed-input"]');
      input.value = 'adversarial-seed-999';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return window.__SLOTBOUND__.getState().seed;
    })()`);
    assert.ok(Number.isInteger(coercedSeed) && coercedSeed > 0 && coercedSeed !== 12345);

    for (const schemeId of SCHEME_IDS) {
      await browser.switchScheme(schemeId);
      await browser.clickTestId('sandbox-trigger-jackpot');
      const st = await browser.getBridgeState();
      assert.ok(
        st.lastTurnBreakdown.totalDamage >= 1000,
        `Sandbox Trigger Jackpot in ${schemeId} must deal >= 1000 damage, got ${st.lastTurnBreakdown.totalDamage}`
      );
    }

    // Switch to GDD Viewer, select 04-scheme3-jackpot-td, and click Launch Prototype button
    await browser.clickTestId('nav-gdd-viewer');
    const launchedScheme = await browser.eval(`(() => {
      const tab = document.querySelector('[data-doc-id="04-scheme3-jackpot-td"]');
      if (tab) tab.click();
      const launchBtn = document.querySelector('[data-action="launch-scheme"]');
      if (launchBtn) launchBtn.click();
      return {
        activeScheme: window.__SLOTBOUND__.getActiveScheme(),
        bridgesIdentical: window.__SLOTBOUND__ === window.__SLOTBOUND_TEST__,
      };
    })()`);
    assert.equal(launchedScheme.activeScheme, 'jackpot-td');
    assert.equal(launchedScheme.bridgesIdentical, true);
    assert.equal(browser.pageErrors.length, 0);
  });
});
