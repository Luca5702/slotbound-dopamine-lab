/**
 * Milestone 1 Unit & Integration Test Suite (`tests/unit/core-and-gdd.test.js`)
 * Covers:
 *  - `F-GDD-01`: All 6 Chinese GDD Markdown files (`docs/gdd/00..05-*.md`) & `README.md`
 *  - `F-CORE-01`: Deterministic Seeded PRNG (`src/core/PRNG.js`)
 *  - `F-CORE-02`: BigNumber & Exponential Balatro ScoreFormula (`src/core/BigNumber.js`, `src/core/ScoreFormula.js`)
 *  - `F-CORE-03`: Risk & Greed Compound Interest & Relic Economy (`src/core/EconomyEngine.js`)
 *  - `F-CORE-04`: 15-Second Flow Rule & EventBus (`src/core/FlowTracker.js`, `src/core/EventBus.js`)
 *  - `F-AUDIO-01`: Procedural Web Audio Synthesizer & Telemetry (`src/audio/SoundEngine.js`)
 *  - `F-UI-01`: Shared 2D VFXCanvas, HUDController, GDDViewer & Static Server (`scripts/serve.js`)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PRNG, createPRNG } from '../../src/core/PRNG.js';
import {
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
  createEconomyState,
  consumePull,
  settleWaveClear,
  accrueRealtimeInterest,
  getRelicDraftChoices,
  applyRelic,
} from '../../src/core/EconomyEngine.js';
import { EventBus, createEventBus } from '../../src/core/EventBus.js';
import { FlowTracker, createFlowTracker, FLOW_CONSTANTS } from '../../src/core/FlowTracker.js';
import { SoundEngine, computeComboFrequency } from '../../src/audio/SoundEngine.js';
import { VFXCanvas } from '../../src/ui/VFXCanvas.js';
import { HUDController } from '../../src/ui/HUDController.js';
import { GDDViewer, GDD_CATALOG } from '../../src/ui/GDDViewer.js';
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
