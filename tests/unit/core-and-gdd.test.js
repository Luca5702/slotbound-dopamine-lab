/**
 * Milestone 1 & Milestone 5 Unit & Integration Test Suite (`tests/unit/core-and-gdd.test.js`)
 * Covers:
 *  - `F-GDD-01`: All 6 Chinese GDD Markdown files (`docs/gdd/00..05-*.md`) & `README.md`
 *  - `F-CORE-01`: Deterministic Seeded PRNG (`src/core/PRNG.js`)
 *  - `F-CORE-02`: BigNumber & Exponential Balatro ScoreFormula (`src/core/BigNumber.js`, `src/core/ScoreFormula.js`)
 *  - `F-CORE-03`: Risk & Greed Compound Interest & Relic Economy (`src/core/EconomyEngine.js`)
 *  - `F-CORE-04`: 15-Second Flow Rule & EventBus (`src/core/FlowTracker.js`, `src/core/EventBus.js`)
 *  - `F-AUDIO-01`: Procedural Web Audio Synthesizer & Telemetry (`src/audio/SoundEngine.js`)
 *  - `F-UI-01`: Shared 2D VFXCanvas, HUDController, GDDViewer & Static Server (`scripts/serve.js`)
 *  - `F-R2-01` & `F-R2-02`: SpriteForge, RelicDraftBanner, HiDPI VFXCanvas, 5-Factor HUD, Master-Bus SoundEngine & Endless Economy
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PRNG, createPRNG } from '../../src/core/PRNG.js';
import {
  MAX_SAFE_GAME_NUMBER,
  formatBigNumber,
  formatChineseNumber,
  getIntensityTier,
  sanitizeNumber,
  safeClamp,
  safeMultiply,
  safePower,
} from '../../src/core/BigNumber.js';
import {
  calculateDevourMultiplier,
  calculateLineMultiplier,
  calculateSpinDamage,
  getWaveProgressionTarget,
  WAVE_PROGRESSION_TABLE,
} from '../../src/core/ScoreFormula.js';
import {
  DEFAULT_RELIC_CATALOG,
  createEconomyState,
  consumePull,
  settleWaveClear,
  accrueRealtimeInterest,
  getRelicDraftChoices,
  applyRelic,
  computeEndlessBossHp,
  enterEndlessMode,
  startRelicDraft,
  resolvePendingRelicDraft,
  hasRelic,
  getRelicModifiers,
  spendEconomyGold,
} from '../../src/core/EconomyEngine.js';
import { EventBus, createEventBus } from '../../src/core/EventBus.js';
import { FlowTracker, createFlowTracker, FLOW_CONSTANTS } from '../../src/core/FlowTracker.js';
import { SoundEngine, computeComboFrequency } from '../../src/audio/SoundEngine.js';
import { VFXCanvas } from '../../src/ui/VFXCanvas.js';
import { HUDController, localizeSynergy, localizeComboName } from '../../src/ui/HUDController.js';
import { GDDViewer, GDD_CATALOG } from '../../src/ui/GDDViewer.js';
import { renderSprite, renderBossPortrait } from '../../src/ui/SpriteForge.js';
import {
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
} from '../../src/ui/RelicDraftBanner.js';
import { SYMBOLS as DEVOUR_SYMBOLS, BOSSES as DEVOUR_BOSSES } from '../../src/games/devour-reels/config.js';
import { BULLET_LIST, BOSSES as REVOLVER_BOSSES } from '../../src/games/revolver-dungeon/config.js';
import { TOWERS, ENEMIES as TD_ENEMIES, BOSSES as TD_BOSSES } from '../../src/games/jackpot-td/config.js';
import {
  ORB_LIST,
  PEG_TYPES,
  CRUCIBLE_TEMPLATES,
  BOSSES as PACHINKO_BOSSES,
} from '../../src/games/sigil-pachinko/config.js';
import { UNIT_LIST, BOSSES as GRID_BOSSES } from '../../src/games/abyssal-grid/config.js';
import { installMockBrowserEnv } from '../e2e/helpers/e2e-harness.js';
import { startServer } from '../../scripts/serve.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

describe('F-GDD-01: Comprehensive Chinese GDD Suite & README', () => {
  const expectedFiles = [
    {
      relPath: 'docs/gdd/00-master-design-philosophy.md',
      requiredTerms: ['砍掉中间商', '零操作合成', 'Auto-Devour', '即时开火', 'Slot-as-Combat', '极简赌狗经济', 'Risk & Greed'],
    },
    {
      relPath: 'docs/gdd/01-iron-laws-math-and-audio.md',
      requiredTerms: ['15秒心流法则', '指数级数字膨胀', '重度听觉锚点', '523.25', '1.25^U', '1.35^U'],
    },
    {
      relPath: 'docs/gdd/02-scheme1-devour-reels.md',
      requiredTerms: ['吞噬转轮', 'Devour Reels', '深渊巨口', '3个铁甲骑士', '火球', '炸药桶', '消化不良', '改轮盘概率'],
    },
    {
      relPath: 'docs/gdd/03-scheme2-revolver-dungeon.md',
      requiredTerms: ['左轮地牢', 'Revolver Dungeon', '6发弹巢', '旋转弹巢并开火', '塞入新子弹', '寄生弹', '火药', '引信', '重锤', '恶魔弹'],
    },
    {
      relPath: 'docs/gdd/04-scheme3-jackpot-td.md',
      requiredTerms: ['黄金矿工防线', 'Jackpot TD', '1排5格', '对子', '二星', '三连冰冻', '长达 5 秒的狂暴激光洗地', '五连核弹'],
    },
    {
      relPath: 'docs/gdd/05-explorations-pachinko-grid.md',
      requiredTerms: ['咒印弹珠台', 'Sigil Pachinko', '深渊矩阵', 'Abyssal Grid', 'HOLD', 'Bingo'],
    },
  ];

  for (const item of expectedFiles) {
    it(`verifies ${item.relPath} exists, is well-structured, and contains required domain specifications`, async () => {
      const fullPath = path.join(ROOT_DIR, item.relPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      assert.ok(content.length >= 1800, `Expected ${item.relPath} to be >= 1800 chars, got ${content.length}`);
      assert.ok(content.includes('# '), `Expected markdown headings in ${item.relPath}`);
      assert.ok(content.includes('|'), `Expected markdown tables in ${item.relPath}`);
      for (const term of item.requiredTerms) {
        assert.ok(
          content.includes(term),
          `Expected ${item.relPath} to contain term "${term}"`
        );
      }
    });
  }

  it('verifies README.md indexes all 6 GDD files and quickstart scripts', async () => {
    const readme = await fs.readFile(path.join(ROOT_DIR, 'README.md'), 'utf-8');
    for (const item of expectedFiles) {
      assert.ok(readme.includes(item.relPath), `README.md missing reference to ${item.relPath}`);
    }
    assert.ok(readme.includes('npm start'));
    assert.ok(readme.includes('npm test'));
  });
});

describe('F-CORE-01: Deterministic Seeded PRNG (src/core/PRNG.js)', () => {
  it('produces 100% identical sequences given the same seed', () => {
    const rngA = createPRNG(987654);
    const rngB = createPRNG(987654);

    const seqA = Array.from({ length: 25 }, () => rngA.next());
    const seqB = Array.from({ length: 25 }, () => rngB.next());
    assert.deepEqual(seqA, seqB);
    assert.equal(rngA.getState(), rngB.getState());
  });

  it('respects integer bounds in nextInt(min, max) and handles inverted bounds safely', () => {
    const rng = new PRNG(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextInt(3, 8);
      assert.ok(v >= 3 && v <= 8 && Number.isInteger(v));
    }
    // Inverted bounds
    const inv = rng.nextInt(10, 5);
    assert.ok(inv >= 5 && inv <= 10);
    // Equal bounds
    assert.equal(rng.nextInt(7, 7), 7);
  });

  it('supports pickWeighted for both array-of-objects and weight maps, plus zero-weight edge cases', () => {
    const rng = createPRNG(12345);
    const items = [
      { id: 'rare', weight: 0 },
      { id: 'guaranteed', weight: 100 },
    ];
    for (let i = 0; i < 15; i++) {
      assert.equal(rng.pickWeighted(items).id, 'guaranteed');
    }

    const weightMap = { goblin: 0, fireball: 100 };
    assert.equal(rng.pickWeighted(weightMap), 'fireball');

    // All-zero fallback should not throw
    const zeroItems = [{ id: 'a', weight: 0 }, { id: 'b', weight: -5 }];
    const fallbackPick = rng.pickWeighted(zeroItems);
    assert.ok(fallbackPick.id === 'a' || fallbackPick.id === 'b');
    assert.equal(rng.pickWeighted([]), null);
  });

  it('shuffles arrays deterministically without mutating the input array', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng1 = createPRNG(777);
    const rng2 = createPRNG(777);

    const s1 = rng1.shuffle(source);
    const s2 = rng2.shuffle(source);
    assert.deepEqual(s1, s2);
    assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(s1.length, source.length);
  });
});

describe('F-CORE-02: BigNumber & Balatro Exponential ScoreFormula', () => {
  it('formats numbers using Western (K/M/B/T) and Chinese (万/亿) notation per PROJECT.md', () => {
    assert.equal(formatBigNumber(950), '950');
    assert.equal(formatBigNumber(14200), '14.2K');
    assert.equal(formatBigNumber(85000000), '85.0M');
    assert.equal(formatBigNumber(2500000000), '2.5B');
    assert.equal(formatBigNumber(1e16), '1.00e16');

    assert.equal(formatChineseNumber(950), '950');
    assert.equal(formatChineseNumber(85000000), '8500.0万');
    assert.equal(formatChineseNumber(172000000), '1.72亿');
  });

  it('computes screen shake intensity tiers 0..4 accurately', () => {
    assert.equal(getIntensityTier(0), 0);
    assert.equal(getIntensityTier(85), 0);
    assert.equal(getIntensityTier(250), 1);
    assert.equal(getIntensityTier(15000), 2);
    assert.equal(getIntensityTier(800000), 3);
    assert.equal(getIntensityTier(85000000), 4);
  });

  it('calculates exponential spin damage and supports all aliased keys', () => {
    // Default devourStacksMultiplier = (1 + 0.6 * S) * 1.25^S
    // For S = 4: (1 + 2.4) * 1.25^4 = 3.4 * 2.44140625 = 8.30078125
    const res = calculateSpinDamage({
      basePoints: 100,
      lineMultiplier: 2,
      devourStacks: 4,
      chainSynergyMultiplier: 3,
      greedMultiplier: 1.5,
      comboName: 'Fireball + Powder Keg',
    });

    const expectedDevourMult = calculateDevourMultiplier(4);
    const expectedTotal = Math.floor(100 * 2 * expectedDevourMult * 3 * 1.5);
    assert.equal(res.totalDamage, expectedTotal);
    assert.equal(res.basePoints, 100);
    assert.equal(res.baseChips, 100);
    assert.equal(res.lineMultiplier, 2);
    assert.equal(res.lineMult, 2);
    assert.equal(res.devourStacks, 4);
    assert.ok(res.settlementDurationMs < 1000);
  });

  it('scales from ~10^2 in Wave 1 to >10^8 in Wave 8 and handles NaN/negative inputs safely', () => {
    assert.equal(WAVE_PROGRESSION_TABLE.length, 8);
    const w1 = getWaveProgressionTarget(1);
    const w8 = getWaveProgressionTarget(8);
    assert.equal(w1.targetBossHp, 120);
    assert.equal(w8.targetBossHp, 85_000_000);

    const safeRes = calculateSpinDamage({
      basePoints: NaN,
      lineMultiplier: -5,
      devourStacks: -3,
    });
    assert.equal(safeRes.totalDamage, 0);
    assert.equal(sanitizeNumber(NaN, 42), 42);
    assert.equal(safeClamp(500, 0, 100), 100);
    assert.equal(safeMultiply(2, 3, 4), 24);
    assert.equal(safePower(2, 10), 1024);
    assert.ok(calculateLineMultiplier([{ matchCount: 3 }, { matchCount: 4 }]) > 1);
  });
});

describe('F-CORE-03: Risk & Greed EconomyEngine (src/core/EconomyEngine.js)', () => {
  it('settles wave clear with exact compound interest and 1.35^U Greed Multiplier', () => {
    const state = createEconomyState({ gold: 100, baseWaveGold: 40, maxPullsPerWave: 5 });
    consumePull(state); // 4 pulls remaining
    consumePull(state); // 3 pulls remaining
    assert.equal(state.pullsRemaining, 3);
    assert.equal(state.pullsUsed, 2);

    const U = 3;
    const expectedPrincipal = 100 + 40 * (1 + 0.25 * U); // 100 + 70 = 170
    const expectedInterest = Math.floor(expectedPrincipal * (Math.pow(1.25, U) - 1)) + 15 * U;
    const expectedGreed = Number(Math.pow(1.35, U).toFixed(4));

    const updated = settleWaveClear(state);
    assert.equal(updated.settlement.unusedPulls, 3);
    assert.equal(updated.settlement.interestGold, expectedInterest);
    assert.equal(updated.gold, 100 + 40 + expectedInterest);
    assert.equal(updated.greedMultiplier, expectedGreed);
    assert.equal(updated.wave, 2);
    assert.equal(updated.pullsRemaining, 5);
    assert.equal(updated.settlement.rareRelicGuaranteed, true);
  });

  it('accrues real-time +20% interest & Greed Streak and drafts/applies Relics', () => {
    const state = createEconomyState({ gold: 100 });
    const tick1 = accrueRealtimeInterest(state, 0.2);
    assert.equal(tick1.interestEarned, 20);
    assert.equal(state.gold, 120);
    assert.equal(state.greedStreak, 1);
    assert.equal(state.greedStreakMultiplier, 1.5);

    const choices = getRelicDraftChoices(state, 3, createPRNG(99));
    assert.equal(choices.length, 3);
    const prevGreed = state.greedMultiplier;
    applyRelic(state, 'abyssal_crown');
    assert.ok(state.greedMultiplier > prevGreed);
    assert.equal(state.relics.length, 1);
  });
});

describe('F-CORE-04: 15-Second FlowTracker & EventBus', () => {
  it('enforces <1000ms Auto-Devour settlement, 15s turn budget, and 2.5x Spacebar turbo', () => {
    const tracker = createFlowTracker();
    assert.equal(tracker.phase, 'IDLE_READY');

    // 1st Spacebar press -> starts spin at 1.0x
    const s1 = tracker.handleSpaceInput(1000);
    assert.equal(s1.action, 'START_SPIN');
    assert.equal(tracker.speedMultiplier, 1.0);

    // 2nd Spacebar press during animation -> engages 2.5x turbo
    const s2 = tracker.handleSpaceInput(1150);
    assert.equal(s2.action, 'ENGAGE_TURBO');
    assert.equal(tracker.speedMultiplier, FLOW_CONSTANTS.TURBO_SPEED_MULTIPLIER);
    assert.equal(tracker.isTurbo, true);

    const settlement = tracker.completeSettlement(900);
    assert.ok(settlement.effectiveDurationMs < 1000);
    assert.equal(settlement.withinOneSecondRule, true);

    const turnRecord = tracker.completeTurn(11500);
    assert.equal(turnRecord.within15SecondRule, true);
    assert.equal(tracker.speedMultiplier, 1.0);
  });

  it('supports EventBus on, once, off, emit, ring buffer logging, and listener error isolation', () => {
    const bus = createEventBus({ maxLogSize: 20 });
    const received = [];

    const unsub = bus.on('devour:step', (payload) => received.push(payload.pts));
    bus.once('devour:step', (payload) => received.push(payload.pts * 10));
    bus.on('devour:step', () => {
      throw new Error('Simulated UI listener error');
    });

    bus.emit('devour:step', { pts: 5 });
    bus.emit('devour:step', { pts: 7 });
    unsub();
    bus.emit('devour:step', { pts: 9 });

    assert.deepEqual(received, [5, 50, 7]);
    assert.equal(bus.getLog('devour:step').length, 3);
    const drained = bus.drainLog();
    assert.equal(drained.length, 3);
    assert.equal(bus.getLog().length, 0);
  });
});

describe('F-AUDIO-01 & F-UI-01: SoundEngine, VFXCanvas, HUDController, GDDViewer & Static Server', () => {
  it('logs clack, crunch, ascending chime, explosion, gunshot, laser, and backfire in SoundEngine', () => {
    const sound = new SoundEngine();
    sound.clearAudioLog();

    const clack = sound.playReelClack(1, 3);
    assert.equal(clack.type, 'clack');
    assert.equal(clack.frequencyHz, 1070);

    const crunch = sound.playDevourCrunch(2, 3);
    assert.equal(crunch.type, 'crunch');

    const chime0 = sound.playComboChime(0);
    const chime12 = sound.playComboChime(12);
    const chime24 = sound.playComboChime(30); // Clamped at 24 semitones (2093Hz)
    assert.equal(chime0.frequencyHz, 523.25);
    assert.equal(chime12.frequencyHz, 1046.5);
    assert.equal(chime24.frequencyHz, 2093);
    assert.ok(chime12.frequencyHz > chime0.frequencyHz);
    assert.equal(computeComboFrequency(-5), 523.25);

    sound.playChainExplosion(2);
    sound.playGunshot(true);
    sound.playLaserSweep(5000);
    sound.playMisfireBackfire();

    const log = sound.getAudioLog();
    assert.equal(log.length, 9);

    const mockBoard = { innerHTML: '' };
    sound.renderSoundboard(mockBoard);
    assert.ok(mockBoard.innerHTML.includes('data-testid="audio-mute-toggle"'));
    assert.ok(mockBoard.innerHTML.includes('data-testid="audio-test-clunk"'));
    assert.ok(mockBoard.innerHTML.includes('data-testid="audio-test-devour"'));
    assert.ok(mockBoard.innerHTML.includes('data-testid="audio-test-chime"'));
    assert.ok(mockBoard.innerHTML.includes('data-testid="audio-last-event"'));
  });

  it('simulates projectiles, devour trails, 5s laser sweeps, and screen shake in VFXCanvas', () => {
    const vfx = new VFXCanvas();
    vfx.spawnProjectile({ fromX: 100, fromY: 400, toX: 480, toY: 120, durationMs: 200 });
    vfx.spawnDevourEffect({ fromCell: 0, toCell: 4, durationMs: 300 });
    vfx.spawnChainExplosion({ intensity: 3, durationMs: 400 });
    vfx.spawnLaserSweep({ durationMs: 5000 });
    vfx.spawnFloatingText({ text: '+85.0M', tier: 4, durationMs: 500 });
    vfx.triggerScreenShake(4, 400);

    assert.equal(vfx.getActiveCounts().projectiles, 1);
    assert.equal(vfx.getActiveCounts().lasers, 1);
    assert.equal(vfx.getShakeState().intensityTier, 4);

    vfx.step(250);
    assert.equal(vfx.getActiveCounts().projectiles, 0);
    assert.equal(vfx.getActiveCounts().lasers, 1);

    vfx.clear();
    assert.equal(vfx.getActiveCounts().lasers, 0);
    assert.equal(vfx.getShakeState().intensityTier, 0);
  });

  it('renders all 10 required data-testid elements in HUDController and GDDViewer', async () => {
    const hudContainer = { innerHTML: '' };
    const hud = new HUDController(hudContainer);
    hud.update({
      wave: 3,
      enemyHp: 1850,
      enemyMaxHp: 3800,
      pullsRemaining: 4,
      gold: 260,
      basePoints: 120,
      lineMultiplier: 4,
      devourStacks: 3,
      devourStacksMultiplier: 5.47,
      totalDamage: 14200,
      comboName: 'Fireball + Powder Keg',
    });

    const requiredHudIds = [
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
    for (const id of requiredHudIds) {
      assert.ok(
        hudContainer.innerHTML.includes(`data-testid="${id}"`),
        `HUDController missing data-testid="${id}"`
      );
    }
    assert.ok(hudContainer.innerHTML.includes('14.2K'));

    const gddContainer = { innerHTML: '' };
    const gdd = new GDDViewer({ containerEl: gddContainer });
    assert.equal(GDD_CATALOG.length, 6);
    await gdd.loadDocument('02-scheme1-devour-reels');
    assert.ok(gddContainer.innerHTML.includes('data-testid="gdd-viewer-panel"'));
    assert.ok(gddContainer.innerHTML.includes('data-testid="gdd-doc-selector"'));
    assert.ok(gddContainer.innerHTML.includes('data-testid="gdd-content-body"'));
    assert.ok(gddContainer.innerHTML.includes('吞噬转轮'));
  });

  it('serves static files with clean MIME types, query strings, and path traversal protection via scripts/serve.js', async () => {
    const srv = await startServer({ port: 0, rootDir: ROOT_DIR });
    try {
      const resGdd = await fetch(`${srv.url}/docs/gdd/00-master-design-philosophy.md?scheme=devour-reels`);
      assert.equal(resGdd.status, 200);
      assert.ok((resGdd.headers.get('content-type') || '').includes('text/markdown'));
      const text = await resGdd.text();
      assert.ok(text.includes('砍掉中间商'));

      const resJs = await fetch(`${srv.url}/src/core/PRNG.js`);
      assert.equal(resJs.status, 200);
      assert.ok((resJs.headers.get('content-type') || '').includes('text/javascript'));

      const resCss = await fetch(`${srv.url}/src/styles/main.css`);
      assert.equal(resCss.status, 200);
      assert.ok((resCss.headers.get('content-type') || '').includes('text/css'));

      const resJson = await fetch(`${srv.url}/package.json`);
      assert.equal(resJson.status, 200);
      assert.ok((resJson.headers.get('content-type') || '').includes('application/json'));

      const resTraversalEncoded = await fetch(`${srv.url}/%252e%252e/%252e%252e/etc/passwd`);
      assert.equal(resTraversalEncoded.status, 403);

      const http = await import('node:http');
      const rawTraversalStatus = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: srv.port,
            path: '/../../etc/passwd',
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
      assert.equal(rawTraversalStatus, 403);
    } finally {
      await srv.close();
    }
  });
});

describe('M5 Round 2: SpriteForge, RelicDraftBanner, HiDPI VFXCanvas, 5-Factor HUD, Master-Bus SoundEngine & Economy Helpers', () => {
  it('verifies README.md contains live GitHub Pages preview URL, R2 modules, and balanced fences across all GDD docs', async () => {
    const readme = await fs.readFile(path.join(ROOT_DIR, 'README.md'), 'utf-8');
    assert.ok(readme.includes('https://luca5702.github.io/slotbound-dopamine-lab/'));
    assert.ok(readme.includes('SpriteForge.js'));
    assert.ok(readme.includes('RelicDraftBanner.js'));
    assert.ok(!/\b(TODO|FIXME|TBD|lorem ipsum)\b/i.test(readme));

    const gddDir = path.join(ROOT_DIR, 'docs/gdd');
    const files = await fs.readdir(gddDir);
    assert.equal(files.length, 6);
    for (const f of files) {
      const text = await fs.readFile(path.join(gddDir, f), 'utf-8');
      const fences = (text.match(/^```/gm) || []).length;
      assert.equal(fences % 2, 0, `Unbalanced code fences in ${f}`);
      assert.ok(!/\b(TODO|FIXME|TBD|lorem ipsum)\b|\[insert\s/i.test(text), `Placeholder marker found in ${f}`);
    }
  });

  it('forges MockElement-safe SVG sprites & Boss portraits across 100% of game catalogs, relics, and aliases', () => {
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    const env = installMockBrowserEnv();
    try {
      const allEntityIds = new Set([
        ...DEVOUR_SYMBOLS.map((s) => s.id),
        ...BULLET_LIST.map((b) => b.id),
        ...TOWERS.map((t) => t.id),
        ...TD_ENEMIES.map((e) => e.id),
        ...ORB_LIST.map((o) => o.id),
        ...PEG_TYPES.map((p) => p.id),
        ...CRUCIBLE_TEMPLATES.map((c) => c.id),
        ...UNIT_LIST.map((u) => u.id),
        ...DEFAULT_RELIC_CATALOG.map((r) => r.id),
        // PROJECT.md § 6.1 canonical aliases & special parts
        'abyssal_maw',
        'revolver_spindle',
        'smoking_casing',
        'frost_core',
        'gold_stone',
        'void_singularity',
        'peg_ember',
        'ember',
        'peg_volt',
        'volt',
        'peg_gold',
        'gold',
        'peg_glutton',
        'glutton',
        'crucible',
        'skeleton',
        'imp_scout',
        'mimic_chest',
        'cursed_urn',
        'void_reaper',
        'unknown_future_entity_xyz',
      ]);

      const validateSvgInMockDom = (svg, expectedTestId = null) => {
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'SVG must start with <svg and end with </svg>');
        assert.ok(!/<\s*text\b/i.test(svg), 'SVG must contain zero <text> nodes');
        assert.ok(!/[\p{Extended_Pictographic}]/u.test(svg), 'SVG must contain zero raw OS emojis');
        assert.ok(!/#9b5de5|#5e35b1|#161224|#1f1933/i.test(svg), 'SVG must contain zero purple SaaS hexes');
        assert.ok(!/="[^"]*>/.test(svg), 'SVG must contain zero literal > inside attributes');

        // Verify all void SVG tags self-close with />
        const voidTagMatches = svg.match(/<(?:path|circle|rect|polygon|polyline|line|ellipse|stop)\b[^>]*>/gi) || [];
        for (const tag of voidTagMatches) {
          assert.ok(tag.endsWith('/>'), `Unclosed childless SVG primitive: ${tag}`);
        }

        const wrap = env.createContainer();
        wrap.innerHTML = `<div data-testid="probe-parent">${svg}<span data-testid="after-probe">OK</span></div>`;
        const afterProbe = wrap.querySelector('[data-testid="after-probe"]');
        assert.ok(afterProbe, 'Sibling after SVG must parse cleanly in MockElement');
        assert.equal(
          afterProbe.parentElement?.getAttribute('data-testid'),
          'probe-parent',
          'Unclosed SVG tag corrupted MockElement parent stack!'
        );
        if (expectedTestId) {
          assert.ok(wrap.querySelector(`[data-testid="${expectedTestId}"]`), `Missing ${expectedTestId}`);
        }
      };

      for (const id of allEntityIds) {
        const svg = renderSprite(id, { size: 48, tier: 2 });
        validateSvgInMockDom(svg);
      }

      // Deterministic empty disambiguation & deterministic unknown fallback
      const emptyRevolver = renderSprite('empty', { schemeId: 'revolver-dungeon' });
      const emptyMatrix = renderSprite('empty', { schemeId: 'abyssal-grid' });
      assert.notEqual(emptyRevolver, emptyMatrix);
      assert.equal(renderSprite('mystery_unit_99'), renderSprite('mystery_unit_99'));
      validateSvgInMockDom(renderSprite(''));

      // Validate all 40 Bosses across all 5 schemes + Wave 9 Endless Boss
      const bossCatalogs = [
        { schemeId: 'devour-reels', list: DEVOUR_BOSSES },
        { schemeId: 'revolver-dungeon', list: REVOLVER_BOSSES },
        { schemeId: 'jackpot-td', list: TD_BOSSES },
        { schemeId: 'sigil-pachinko', list: PACHINKO_BOSSES },
        { schemeId: 'abyssal-grid', list: GRID_BOSSES },
      ];
      for (const { schemeId, list } of bossCatalogs) {
        for (const boss of list) {
          const portrait = renderBossPortrait(boss, {
            wave: boss.wave || boss.floor || 1,
            schemeId,
            size: 96,
          });
          assert.ok(portrait.includes('viewBox="0 0 120 120"'));
          validateSvgInMockDom(portrait, 'boss-portrait-svg');
        }
        const endlessPortrait = renderBossPortrait({ id: `${schemeId}_omega_endless` }, { wave: 9, schemeId });
        validateSvgInMockDom(endlessPortrait, 'boss-portrait-svg');
      }
    } finally {
      env.cleanup();
      globalThis.window = prevWin;
      globalThis.document = prevDoc;
    }
  });

  it('renders and binds RelicDraftBanner across Idle, 3-Card Draft, Victory/Endless, and Defeat states', () => {
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    const env = installMockBrowserEnv();
    try {
      assert.equal(renderRelicDraftHTML({ wave: 1, pendingRelicDraft: null }), '');

      // 1. 3-Card Relic Draft state + click & hotkey [2]
      const choices = DEFAULT_RELIC_CATALOG.slice(0, 3);
      const draftState = {
        wave: 2,
        gold: 185,
        greedMultiplier: 1.82,
        pendingRelicDraft: choices,
        lastSettlement: { unusedPulls: 2, interestGold: 45, totalGoldEarned: 95 },
      };
      const draftHtml = renderRelicDraftHTML(draftState);
      assert.ok(!/[\p{Extended_Pictographic}]/u.test(draftHtml), 'Zero raw emojis in RelicDraftBanner');

      const host = env.createContainer();
      host.innerHTML = draftHtml;
      assert.ok(host.querySelector('[data-testid="relic-draft-banner"]'));
      assert.ok(host.querySelector('[data-testid="relic-pick-0"]'));
      assert.ok(host.querySelector('[data-testid="relic-pick-1"]'));
      assert.ok(host.querySelector('[data-testid="relic-pick-2"]'));

      let pickedId = null;
      bindRelicDraftEvents(host, {
        onPickRelic: (id) => {
          pickedId = id;
        },
      });
      host.querySelector('[data-testid="relic-pick-1"]').click();
      assert.equal(pickedId, choices[1].id);

      let hotkeyPicked = null;
      const handled = handleRelicDraftKeyDown(
        { key: '3', preventDefault() {} },
        draftState,
        { onPickRelic: (id) => { hotkeyPicked = id; } }
      );
      assert.equal(handled, true);
      assert.equal(hotkeyPicked, choices[2].id);

      // 2. Victory state (omitted once endlessMode === true)
      assert.equal(renderRelicDraftHTML({ victory: true, endlessMode: true }), '');
      host.innerHTML = renderRelicDraftHTML({
        wave: 8,
        gold: 1200,
        greedMultiplier: 6.4,
        relics: choices,
        victory: true,
        endlessMode: false,
      });
      assert.ok(host.querySelector('[data-testid="run-victory-banner"]'));
      let endlessClicked = false;
      let resetClicked = false;
      bindRelicDraftEvents(host, {
        onEnterEndless: () => { endlessClicked = true; },
        onResetRun: () => { resetClicked = true; },
      });
      host.querySelector('[data-testid="btn-endless-mode"]').click();
      host.querySelector('[data-testid="btn-new-run"]').click();
      assert.equal(endlessClicked, true);
      assert.equal(resetClicked, true);

      // 3. Defeat state
      resetClicked = false;
      host.innerHTML = renderRelicDraftHTML({ wave: 4, gameOver: true, totalDamage: 12500 });
      assert.ok(host.querySelector('[data-testid="run-defeat-banner"]'));
      bindRelicDraftEvents(host, {
        onResetRun: () => { resetClicked = true; },
      });
      host.querySelector('[data-testid="btn-retry-run"]').click();
      assert.equal(resetClicked, true);
    } finally {
      env.cleanup();
      globalThis.window = prevWin;
      globalThis.document = prevDoc;
    }
  });

  it('supports resolveAnchor, distinct Bezier devour cell coordinates, T5-06 minimal mockCtx, and zero-leak GC in VFXCanvas', () => {
    const drawCalls = { translate: 0, arc: 0, stroke: 0, fill: 0, fillText: 0 };
    const minimalMockCanvas = {
      width: 960,
      height: 540,
      getContext() {
        return {
          clearRect() {},
          save() {},
          restore() {},
          translate() { drawCalls.translate += 1; },
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() { drawCalls.stroke += 1; },
          arc() { drawCalls.arc += 1; },
          fill() { drawCalls.fill += 1; },
          fillText() { drawCalls.fillText += 1; },
        };
      },
    };

    const vfx = new VFXCanvas(minimalMockCanvas);
    assert.deepEqual(vfx.resolveAnchor('#nonexistent-node', 310, 205), { x: 310, y: 205 });

    const d1 = vfx.spawnDevourEffect({ fromCell: 0, toCell: 4, durationMs: 320 });
    const d2 = vfx.spawnDevourEffect({ fromCell: 8, toCell: 4, durationMs: 320 });
    assert.ok(d1.fromX !== d2.fromX || d1.fromY !== d2.fromY, 'Distinct cells must resolve to distinct devour origins');

    vfx.spawnProjectile({ fromCell: 1, toX: 480, toY: 90, durationMs: 240 });
    vfx.spawnChainExplosion({ intensity: 4, durationMs: 420 });
    vfx.spawnLaserSweep({ durationMs: 5000 });
    vfx.spawnFloatingText({ text: '85.0M', tier: 4, durationMs: 600 });
    vfx.triggerScreenShake(4, 360);

    vfx.step(50);
    assert.ok(drawCalls.translate >= 1);
    assert.ok(drawCalls.arc >= 2);
    assert.ok(drawCalls.stroke >= 3);
    assert.ok(drawCalls.fillText >= 1);

    // Particle burst + full GC drain check (T2-F07-01)
    for (let i = 0; i < 200; i++) {
      vfx.spawnProjectile({ fromX: 200, fromY: 400, toX: 480, toY: 100 });
    }
    assert.ok(vfx.projectiles.length <= 96);
    vfx.step(6000);
    assert.equal(vfx.getActiveCount(), 0);
  });

  it('renders 5-Factor HUD equation, Relic medallions, and localized Chinese synergies with zero snake_case', () => {
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    const env = installMockBrowserEnv();
    try {
      const container = env.createContainer();
      const hud = new HUDController(container);
      hud.update({
        wave: 6,
        enemyName: '黄金泰坦巨像',
        enemyHp: 450_000,
        enemyMaxHp: 1_500_000,
        pullsRemaining: 3,
        gold: 540,
        greedMultiplier: 2.46,
        relics: ['greed_ledger', { id: 'abyssal_crown', name: '深渊暴君王冠', rarity: 'mythic' }],
        lastTurnBreakdown: {
          basePoints: 380,
          lineMultiplier: 15,
          devourStacks: 5,
          devourStacksMultiplier: 12.21,
          chainSynergyMultiplier: 6.0,
          greedMultiplier: 2.46,
          totalDamage: 1_026_000,
          comboName: 'fireball_powder_keg',
          triggeredSynergies: [
            'fireball_powder_keg (🔥 肚内连锁爆炸: Fireball + Powder Keg)',
            'triple_iron_knights',
            'EARLY_FIRE_COMPOUND_BANK',
          ],
        },
      });

      assert.ok(container.querySelector('[data-testid="hud-chain-mult"]'));
      assert.ok(container.querySelector('[data-testid="hud-greed-mult"]'));
      assert.ok(container.querySelector('[data-testid="hud-relic-strip"]'));
      assert.equal(
        container.querySelector('[data-testid="hud-total-damage"]').getAttribute('data-intensity-tier'),
        '3'
      );

      const text = container.textContent;
      assert.ok(text.includes('肚内连锁'));
      assert.ok(!/fireball_powder_keg|triple_iron_knights|EARLY_FIRE_COMPOUND_BANK/.test(text));
      assert.ok(!/undefined|NaN/.test(text));
      assert.equal(localizeSynergy('MID_AIR_ORB_FUSION'), '半空炼金法球吞噬融合');
      assert.equal(localizeComboName('肚内连锁爆炸'), '肚内连锁爆炸');
    } finally {
      env.cleanup();
      globalThis.window = prevWin;
      globalThis.document = prevDoc;
    }
  });

  it('schedules 55ms micro-arpeggio chimes, caches noise buffers, and survives minimal SpyAudioContext in SoundEngine', () => {
    const prevWindow = globalThis.window;
    const oscStarts = [];
    let buffersCreated = 0;

    // 1. Minimal SpyAudioContext (missing compressor, waveShaper, bufferSource, detune)
    globalThis.window = {
      __AUDIO_LOG__: [],
      AudioContext: class MinimalSpyAudioContext {
        constructor() {
          this.state = 'running';
          this.currentTime = 2.0;
          this.destination = {};
        }
        createOscillator() {
          return {
            type: 'sine',
            frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
            start(t) { oscStarts.push(t); },
            stop() {},
          };
        }
        createGain() {
          return {
            gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
          };
        }
        createBiquadFilter() {
          return {
            type: 'lowpass',
            frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
            Q: { setValueAtTime() {} },
            connect() {},
          };
        }
      },
    };

    try {
      const sound = new SoundEngine();
      sound.playComboChime(0);
      sound.playComboChime(4);
      sound.playComboChime(7);
      sound.playComboChime(12);

      const log = sound.getAudioLog();
      assert.equal(log.length, 4);
      assert.deepEqual(
        log.map((e) => e.frequencyHz),
        [523.25, 659.25, 783.99, 1046.5]
      );
      // 3 oscillators per chime; group starts at 2.0, 2.055, 2.11, 2.165
      assert.ok(Math.abs(oscStarts[0] - 2.0) < 1e-6);
      assert.ok(Math.abs(oscStarts[3] - 2.055) < 1e-6);
      assert.ok(Math.abs(oscStarts[6] - 2.11) < 1e-6);
      assert.ok(Math.abs(oscStarts[9] - 2.165) < 1e-6);

      // 2. Full AudioContext mock verifying Master Compressor + Soft-Clipper + Cached Noise + R2 Stingers
      globalThis.window.AudioContext = class FullMockAudioContext extends globalThis.window.AudioContext {
        constructor() {
          super();
          this.sampleRate = 44100;
        }
        createWaveShaper() {
          return { curve: null, oversample: 'none', connect() {} };
        }
        createDynamicsCompressor() {
          const p = { setValueAtTime() {} };
          return { threshold: p, knee: p, ratio: p, attack: p, release: p, connect() {} };
        }
        createBuffer(_ch, len) {
          buffersCreated += 1;
          const arr = new Float32Array(len);
          return { getChannelData: () => arr };
        }
        createBufferSource() {
          return { buffer: null, loop: false, connect() {}, start() {}, stop() {} };
        }
      };

      const fullSound = new SoundEngine();
      for (let i = 0; i < 6; i++) {
        fullSound.playDevourCrunch(i + 1, 3);
        fullSound.playChainExplosion(2);
        fullSound.playGunshot(true);
      }
      assert.equal(buffersCreated, 2, 'White and pink noise buffers must be cached and reused');

      assert.equal(fullSound.playRelicPick().type, 'relic');
      assert.equal(fullSound.playVictoryFanfare().type, 'victory');
      assert.equal(fullSound.playDefeatStinger().type, 'defeat');
      fullSound.dispose();
    } finally {
      globalThis.window = prevWindow;
    }
  });

  it('supports non-blocking Relic Draft resolution, Wave 9+ Endless scaling, and safe Gold spending in EconomyEngine', () => {
    const eco = createEconomyState({ gold: 80 });
    const draft = startRelicDraft(eco, 3, createPRNG(2026));
    assert.equal(draft.length, 3);
    assert.equal(eco.pendingRelicDraft.length, 3);

    // Explicit pick of choice #2
    const picked = resolvePendingRelicDraft(eco, draft[2].id);
    assert.equal(picked.applied, true);
    assert.equal(picked.autoPicked, false);
    assert.equal(eco.pendingRelicDraft, null);
    assert.equal(hasRelic(eco, draft[2].id), true);

    // Non-blocking auto-advance on next spin (`relicId = null`)
    const draft2 = startRelicDraft(eco, 3, createPRNG(2027));
    const autoRes = resolvePendingRelicDraft(eco, null);
    assert.equal(autoRes.applied, true);
    assert.equal(autoRes.autoPicked, true);
    assert.equal(autoRes.relic.id, draft2[0].id);
    assert.equal(eco.pendingRelicDraft, null);

    // Endless scaling & transition
    assert.equal(computeEndlessBossHp(85_000_000, 9), Math.floor(85_000_000 * 6.5));
    eco.wave = 8;
    const endless = enterEndlessMode(eco, 85_000_000);
    assert.equal(endless.endlessMode, true);
    assert.equal(eco.wave, 9);
    assert.equal(eco.pullsRemaining, eco.maxPullsPerWave);

    // Gold shop spending guard
    const curGold = eco.gold;
    assert.equal(spendEconomyGold(eco, curGold + 500).ok, false);
    assert.equal(eco.gold, curGold);
    assert.equal(spendEconomyGold(eco, 25).ok, true);
    assert.equal(eco.gold, curGold - 25);

    const mods = getRelicModifiers(eco);
    assert.equal(mods.relicCount, 2);
    assert.ok(mods.greedMultiplier >= 1);
  });

  it('hardens all 8 Challenger R2 edge cases across EconomyEngine, HUDController, RelicDraftBanner, SpriteForge, and VFXCanvas', () => {
    // 1. EconomyEngine: chaotic relics array (null, undefined, '', numbers, Object.create(null)) never throws TypeError
    const nullProtoRelic = Object.assign(Object.create(null), { id: 'abyssal_crown' });
    const chaoticEco = createEconomyState({
      relics: ['greed_ledger', null, undefined, '', '   ', 42, Object.create(null), nullProtoRelic],
    });
    // Also inject raw corrupt entries post-construction to test direct array mutation resilience
    chaoticEco.relics.push(null, undefined, '', 99, Object.create(null));

    const safeChoices = startRelicDraft(chaoticEco, 3, createPRNG(2028));
    assert.equal(safeChoices.length, 3);
    assert.ok(safeChoices.every((c) => c.id !== 'greed_ledger' && c.id !== 'abyssal_crown'));
    assert.equal(hasRelic(chaoticEco, 'greed_ledger'), true);
    assert.equal(hasRelic(chaoticEco, 'abyssal_crown'), true);
    assert.equal(hasRelic(chaoticEco, Object.create(null)), false);
    assert.equal(hasRelic(chaoticEco, null), false);

    const chaoticMods = getRelicModifiers(chaoticEco);
    assert.deepEqual(chaoticMods.relicIds, ['greed_ledger', 'abyssal_crown']);
    assert.equal(chaoticMods.relicCount, 2);

    applyRelic(chaoticEco, null);
    applyRelic(chaoticEco, '');
    applyRelic(chaoticEco, 123);
    applyRelic(chaoticEco, Object.create(null));
    assert.equal(getRelicModifiers(chaoticEco).relicCount, 2);

    chaoticEco.pendingRelicDraft = [null, undefined, Object.create(null), { id: 'pyro_catalyst' }];
    const resolvedChaotic = resolvePendingRelicDraft(chaoticEco, null);
    assert.equal(resolvedChaotic.applied, true);
    assert.equal(resolvedChaotic.relic.id, 'pyro_catalyst');

    // 2. EconomyEngine: 500+ Endless waves at U = 5 + near-cap 1e300 finiteness (<= MAX_SAFE_GAME_NUMBER)
    const endlessEco = createEconomyState({ gold: 100, wave: 1, maxPullsPerWave: 6 });
    for (let w = 1; w <= 520; w++) {
      settleWaveClear(endlessEco, 5, w);
    }
    assert.ok(Number.isFinite(endlessEco.gold) && endlessEco.gold > 0 && endlessEco.gold <= MAX_SAFE_GAME_NUMBER);
    assert.ok(
      Number.isFinite(endlessEco.greedMultiplier) &&
        endlessEco.greedMultiplier > 1 &&
        endlessEco.greedMultiplier <= MAX_SAFE_GAME_NUMBER
    );
    assert.ok(
      Number.isFinite(endlessEco.settlement.interestGold) &&
        endlessEco.settlement.interestGold <= MAX_SAFE_GAME_NUMBER
    );

    endlessEco.gold = MAX_SAFE_GAME_NUMBER;
    settleWaveClear(endlessEco, 5, 521);
    accrueRealtimeInterest(endlessEco, 0.25);
    applyRelic(endlessEco, 'abyssal_crown');
    assert.ok(Number.isFinite(endlessEco.gold) && endlessEco.gold <= MAX_SAFE_GAME_NUMBER);
    assert.ok(Number.isFinite(endlessEco.greedMultiplier) && endlessEco.greedMultiplier <= MAX_SAFE_GAME_NUMBER);

    const hp500 = computeEndlessBossHp(85_000_000, 500);
    assert.ok(Number.isFinite(hp500) && hp500 > 0 && hp500 <= MAX_SAFE_GAME_NUMBER);

    // 3, 4, 5 & 6. HUDController (XSS quote escape, null relic filtering, Object.prototype safety) & RelicDraftBanner sanitization
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    const env = installMockBrowserEnv();
    try {
      const container = env.createContainer();
      const hud = new HUDController(container);

      assert.equal(typeof localizeSynergy('constructor'), 'string');
      assert.equal(typeof localizeSynergy('toString'), 'string');
      assert.ok(!localizeSynergy('constructor').includes('[native code]'));
      assert.equal(typeof localizeComboName('constructor', ['toString']), 'string');

      hud.update({
        wave: 5,
        enemyName: 'omega_siege_dreadnought',
        enemyHp: 1000,
        enemyMaxHp: 2000,
        relics: [
          { id: 'evil" onmouseover="alert(1)" data-injected="pwned', name: 'Evil"Relic', rarity: 'toString' },
          'greed_ledger',
          null,
          undefined,
          '',
          Object.create(null),
        ],
        lastTurnBreakdown: {
          basePoints: 100,
          lineMultiplier: 2,
          devourStacks: 1,
          chainSynergyMultiplier: 1.5,
          greedMultiplier: 1.2,
          totalDamage: 360,
          comboName: 'constructor',
          triggeredSynergies: ['constructor', 'toString', 'valueOf'],
        },
      });

      assert.equal(
        container.querySelector('[data-injected="pwned"]'),
        null,
        'Unescaped quote in relic ID must never break out into injected DOM attributes'
      );
      assert.ok(!container.innerHTML.includes('onmouseover="alert(1)"'));
      assert.equal(
        container.querySelectorAll('.hud-relic-badge').length,
        2,
        'Null/empty/prototype-less relic items must be filtered without rendering ghost badges'
      );
      assert.ok(!container.textContent.includes('[native code]'));
      assert.ok(!container.querySelector('[data-testid="hud-enemy-hp"]').textContent.includes('omega_siege_dreadnought'));

      // 6. RelicDraftBanner: null/custom snake_case & undefined/NaN sanitization
      const bannerHtml = renderRelicDraftHTML({
        wave: 3,
        gold: 200,
        greedMultiplier: 1.5,
        pendingRelicDraft: [
          null,
          { id: 'custom_snake_relic', description: 'Bonus undefined NaN +25%', rarity: 'constructor' },
          Object.create(null),
        ],
      });
      const bannerHost = env.createContainer();
      bannerHost.innerHTML = bannerHtml;
      assert.ok(!/\b(?:undefined|NaN)\b/i.test(bannerHost.textContent));
      assert.ok(!/relic_0|custom_snake_relic|\[native code\]/.test(bannerHost.textContent));
    } finally {
      env.cleanup();
      globalThis.window = prevWin;
      globalThis.document = prevDoc;
    }

    // 7. SpriteForge: Object.create(null) safety & entity object ID extraction
    const nullProtoSprite = renderSprite(Object.create(null));
    assert.ok(nullProtoSprite.startsWith('<svg') && nullProtoSprite.endsWith('</svg>'));
    assert.equal(renderSprite({ id: 'goblin' }), renderSprite('goblin'));
    assert.equal(
      renderSprite(Object.assign(Object.create(null), { id: 'fireball' })),
      renderSprite('fireball')
    );
    assert.ok(renderSprite('constructor').startsWith('<svg'));

    // 8. VFXCanvas: numeric-string / invalid selector SyntaxError safety & Infinity rect guard
    const clearRectCalls = [];
    const strictParent = {
      querySelector(sel) {
        if (/^(?:#?\d)|\[\[/.test(String(sel))) {
          throw new SyntaxError(`Failed to execute 'querySelector': '${sel}' is not a valid selector`);
        }
        return null;
      },
    };
    const infCanvas = {
      width: 960,
      height: 540,
      parentElement: strictParent,
      getBoundingClientRect() {
        return { left: NaN, top: NaN, width: Infinity, height: Infinity };
      },
      getContext() {
        return {
          clearRect(x, y, w, h) {
            clearRectCalls.push([x, y, w, h]);
          },
          save() {},
          restore() {},
          translate() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          arc() {},
          fill() {},
          fillText() {},
        };
      },
    };

    const safeVfx = new VFXCanvas(infCanvas);
    assert.ok(Number.isFinite(safeVfx.width) && Number.isFinite(safeVfx.height));
    assert.deepEqual(safeVfx.resolveAnchor('0', 111, 222), safeVfx.resolveAnchor(0, 111, 222));
    assert.deepEqual(safeVfx.resolveAnchor('#0', 111, 222), { x: 111, y: 222 });
    assert.deepEqual(safeVfx.resolveAnchor('invalid[[selector', 111, 222), { x: 111, y: 222 });
    assert.deepEqual(safeVfx.resolveAnchor(Object.create(null), 111, 222), { x: 111, y: 222 });
    safeVfx.step(16);
    assert.ok(
      clearRectCalls.length >= 1 && clearRectCalls.every((args) => args.every(Number.isFinite)),
      'clearRect dimensions must remain strictly finite even when getBoundingClientRect returns Infinity'
    );
  });
});
