/**
 * Milestone 2 Unit & Integration Test Suite: Scheme 2 《左轮地牢》(Revolver Dungeon)
 * Covers:
 *  - `F-S2-01`: 6-Chamber Circular Revolver Cylinder, Strict 2-Button Loop & 8 Dungeon Boss Floors
 *  - `F-S2-02`: 9-Bullet Catalog, Parasite Circular Neighbor Devour & Powder+Fuse+Hammer Full Cylinder Dump
 *  - `F-S2-03`: Russian Roulette Demon Bullet Backfire/Blood Rage, Lone Bullet Roulette & Grit Bonus
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BULLETS,
  BULLET_TYPES,
  BULLET_CATALOG,
  BULLET_LIST,
  BULLET_MAP,
  BOSSES,
  DUNGEON_BOSSES,
  FLOORS,
  WAVES,
  getBossForFloor,
} from '../../src/games/revolver-dungeon/config.js';
import {
  RevolverDungeonEngine,
  createRevolverDungeonEngine,
} from '../../src/games/revolver-dungeon/RevolverDungeonEngine.js';
import {
  RevolverDungeonView,
  createRevolverDungeonView,
} from '../../src/games/revolver-dungeon/RevolverDungeonView.js';
import { SoundEngine } from '../../src/audio/SoundEngine.js';
import { VFXCanvas } from '../../src/ui/VFXCanvas.js';
import { HUDController } from '../../src/ui/HUDController.js';

describe('F-S2-01: Scheme 2 Core — 6-Chamber Revolver, 2-Button Loop & 8 Dungeon Floors', () => {
  it('defines all 9 canonical bullet types and 8 Dungeon Boss floors (150 HP to 95,000,000 HP)', () => {
    assert.equal(BULLET_LIST.length, 9);
    assert.equal(BULLETS, BULLET_MAP);
    assert.equal(BULLET_TYPES, BULLET_MAP);
    assert.equal(BULLET_CATALOG, BULLET_MAP);

    const expectedBullets = [
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
    for (const id of expectedBullets) {
      assert.ok(BULLET_MAP[id], `Missing bullet type ${id}`);
    }

    assert.equal(BOSSES.length, 8);
    assert.equal(DUNGEON_BOSSES, BOSSES);
    assert.equal(FLOORS, BOSSES);
    assert.equal(WAVES, BOSSES);
    assert.equal(BOSSES[0].hp, 150);
    assert.equal(BOSSES[7].hp, 95000000);
    assert.equal(getBossForFloor(1).maxHp, 150);
    assert.equal(getBossForFloor(8).maxHp, 95000000);
  });

  it('initializes 6-chamber cylinder, Floor 1 Boss, and separates Spin & Fire (consumes pull) from Load New Bullet (0 pulls consumed)', () => {
    const engine = createRevolverDungeonEngine({ seed: 501 });
    const st0 = engine.getState();

    assert.equal(st0.schemeId, 'revolver-dungeon');
    assert.equal(st0.chambers.length, 6);
    assert.equal(st0.wave, 1);
    assert.equal(st0.floor, 1);
    assert.equal(st0.enemyHp, 150);
    assert.equal(st0.playerHp, 100);
    assert.equal(st0.pullsRemaining, 5);

    // Button 2: Load New Bullet does NOT consume pullsRemaining
    engine.forceNextSpin(['lead_bullet', 'empty', 'empty', 'empty', 'empty', 'empty']);
    const afterLoad = engine.performSecondaryAction({ bulletId: 'vampire_bullet', chamberIndex: 1 });
    assert.equal(afterLoad.pullsRemaining, 5);
    assert.equal(afterLoad.chambers[1].id, 'vampire_bullet');

    // Loading into a full 6/6 cylinder keeps length strictly at 6
    engine.forceNextSpin(Array(6).fill('lead_bullet'));
    const afterFullLoad = engine.performSecondaryAction({ bulletId: 'heavy_hammer' });
    assert.equal(afterFullLoad.chambers.length, 6);

    // Button 1: Spin & Fire consumes 1 pull and deals > 0 damage
    const afterFire = engine.performPrimaryAction();
    assert.equal(afterFire.pullsRemaining, 4);
    assert.ok(afterFire.lastTurnBreakdown.totalDamage > 0);
    assert.ok(afterFire.lastTurnBreakdown.settlementDurationMs < 1000);
  });

  it('handles all-empty cylinder (6x empty), pull exhaustion clamping, and invalid bulletId payloads safely', () => {
    const engine = new RevolverDungeonEngine({ seed: 502 });
    engine.forceState({
      enemyHp: 99999999,
      pullsRemaining: 1,
      chambers: Array(6).fill('empty'),
    });

    const stDry = engine.performPrimaryAction();
    assert.equal(stDry.pullsRemaining, 0);
    assert.equal(stDry.lastTurnBreakdown.totalDamage, 0);

    // Firing again at 0 pullsRemaining stays clamped at 0
    const stExhausted = engine.performPrimaryAction();
    assert.equal(stExhausted.pullsRemaining, 0);

    // Invalid bulletId falls back to PRNG weighted pick without NaN
    const stFallback = engine.performSecondaryAction({ bulletId: 'unknown_bullet_999' });
    assert.equal(stFallback.chambers.length, 6);
    assert.ok(stFallback.chambers.some((c) => c.id !== 'empty'));
  });
});

describe('F-S2-02: Parasite Circular Neighbor Devour, Full Cylinder Dump, Vampire & Scatter Bullets', () => {
  it('executes parasite_bullet circular neighbor devour including wrap-around between Chamber 0 and Chamber 5', () => {
    const engine = new RevolverDungeonEngine({ seed: 601 });

    // Eat 2 neighbors (Chambers 0 and 2)
    engine.forceState({
      chambers: ['lead_bullet', 'parasite_bullet', 'lead_bullet', 'empty', 'empty', 'empty'],
      activeChamberIndex: 1,
      forcedChamberIndex: 1,
    });
    const stTwo = engine.performPrimaryAction({ targetChamber: 1 });
    assert.ok(stTwo.lastTurnBreakdown.devourStacks >= 2);
    assert.ok(stTwo.lastTurnBreakdown.devourStacksMultiplier >= 2.0);
    assert.equal(stTwo.chambers[0].id, 'empty');
    assert.equal(stTwo.chambers[2].id, 'empty');

    // Circular wrap-around: Chamber 0 devours Chamber 5
    engine.reset({ seed: 601 });
    engine.forceState({
      chambers: ['parasite_bullet', 'empty', 'empty', 'empty', 'empty', 'lead_bullet'],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stWrap = engine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stWrap.lastTurnBreakdown.devourStacks >= 1);
    assert.equal(stWrap.chambers[5].id, 'empty');

    // Surrounded by empty chambers -> 0 neighbors eaten, Lone Bullet bonus applies
    engine.reset({ seed: 601 });
    engine.forceState({
      chambers: ['parasite_bullet', 'empty', 'empty', 'empty', 'empty', 'empty'],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stSolo = engine.performPrimaryAction({ targetChamber: 0 });
    assert.equal(stSolo.lastTurnBreakdown.devourStacks, 0);
    assert.ok(stSolo.lastTurnBreakdown.totalDamage > 0);

    // Adjacent demon_bullet (higher tier) and 6x parasite_bullet resolve without infinite recursion
    engine.reset({ seed: 601 });
    engine.forceState({
      chambers: ['demon_bullet', 'parasite_bullet', 'parasite_bullet', 'empty', 'empty', 'empty'],
      activeChamberIndex: 1,
      forcedChamberIndex: 1,
    });
    const stNoDemonEat = engine.performPrimaryAction({ targetChamber: 1 });
    assert.equal(stNoDemonEat.chambers[0].id, 'demon_bullet');
    assert.ok(stNoDemonEat.lastTurnBreakdown.settlementDurationMs < 1000);

    engine.forceNextSpin(Array(6).fill('parasite_bullet'));
    const stSixParasites = engine.performPrimaryAction();
    assert.ok(stSixParasites.lastTurnBreakdown.settlementDurationMs < 1000);
    assert.ok(stSixParasites.lastTurnBreakdown.totalDamage > 0);
  });

  it('triggers instant 6-chamber Full Cylinder Dump on powder_charge + fuse_cord + heavy_hammer (contiguous and wrapped 4->5->0) and NOT on incomplete pairs', () => {
    const sound = new SoundEngine();
    sound.clearAudioLog();
    const engine = new RevolverDungeonEngine({ seed: 602, sound });

    // Contiguous 0 -> 1 -> 2
    engine.forceState({
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
    const stDump = engine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stDump.lastTurnBreakdown.chainSynergyMultiplier >= 12.0);
    assert.ok(
      stDump.lastTurnBreakdown.triggeredSynergies.some((s) => /dump|清空|连发/i.test(s))
    );
    assert.ok(sound.getAudioLog().some((e) => e.type === 'gunshot'));
    assert.ok(sound.getAudioLog().some((e) => e.type === 'explosion'));

    // Wrapped 4 -> 5 -> 0
    engine.reset({ seed: 602 });
    engine.forceState({
      chambers: ['heavy_hammer', 'lead_bullet', 'empty', 'empty', 'powder_charge', 'fuse_cord'],
      activeChamberIndex: 4,
      forcedChamberIndex: 4,
    });
    const stWrapped = engine.performPrimaryAction({ targetChamber: 4 });
    assert.ok(stWrapped.lastTurnBreakdown.chainSynergyMultiplier >= 12.0);

    // Incomplete sequence (powder_charge + fuse_cord without heavy_hammer) -> < 12.0
    engine.reset({ seed: 602 });
    engine.forceState({
      chambers: ['powder_charge', 'fuse_cord', 'lead_bullet', 'empty', 'empty', 'empty'],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stIncomplete = engine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stIncomplete.lastTurnBreakdown.chainSynergyMultiplier < 12.0);
  });

  it('applies vampire_bullet HP leech/overheal and scatter_bullet sympathetic multi-chamber burst', () => {
    const engine = new RevolverDungeonEngine({ seed: 603 });

    // Vampire heal from 70 HP -> 90 HP
    engine.forceState({
      playerHp: 70,
      chambers: Array(6).fill('vampire_bullet'),
    });
    const stHeal = engine.performPrimaryAction();
    assert.ok(stHeal.playerHp > 70);

    // Scatter solo vs Scatter with neighbors
    const engSolo = new RevolverDungeonEngine({ seed: 603 });
    engSolo.forceState({
      chambers: ['empty', 'scatter_bullet', 'empty', 'empty', 'empty', 'empty'],
      activeChamberIndex: 1,
      forcedChamberIndex: 1,
    });
    const dmgSolo = engSolo.performPrimaryAction({ targetChamber: 1 }).lastTurnBreakdown.totalDamage;

    const engAdj = new RevolverDungeonEngine({ seed: 603 });
    engAdj.forceState({
      chambers: ['lead_bullet', 'scatter_bullet', 'vampire_bullet', 'empty', 'empty', 'empty'],
      activeChamberIndex: 1,
      forcedChamberIndex: 1,
    });
    const dmgAdj = engAdj.performPrimaryAction({ targetChamber: 1 }).lastTurnBreakdown.totalDamage;
    assert.ok(dmgAdj > dmgSolo);
  });
});

describe('F-S2-03: Russian Roulette Demon Bullet, Lone Bullet Roulette, Grit & RevolverDungeonView', () => {
  it('calculates demon_bullet >= 8x damage, 25% backfire self-damage (clamped >= 0), Blood Rage, and live backfireRisk telemetry', () => {
    const engLead = new RevolverDungeonEngine({ seed: 701 });
    engLead.forceState({ chambers: Array(6).fill('lead_bullet') });
    const leadDmg = engLead.performPrimaryAction().lastTurnBreakdown.totalDamage;
    assert.equal(engLead.getState().backfireRisk, 0);

    const engDemon = new RevolverDungeonEngine({ seed: 701 });
    engDemon.forceState({ chambers: Array(6).fill('demon_bullet'), forceBackfire: false });
    assert.ok(engDemon.getState().backfireRisk >= 25);
    const demonDmg = engDemon.performPrimaryAction({ forceBackfire: false }).lastTurnBreakdown.totalDamage;
    assert.ok(demonDmg >= leadDmg * 8);

    // Forced backfire from 100 HP -> survivable (80 HP) + Blood Rage
    const engBf = new RevolverDungeonEngine({ seed: 702 });
    engBf.forceState({
      playerHp: 100,
      chambers: Array(6).fill('demon_bullet'),
      forceBackfire: true,
    });
    const stBf = engBf.performPrimaryAction({ forceBackfire: true });
    assert.equal(stBf.playerHp, 80);
    assert.equal(stBf.bloodRageActive, true);
    assert.ok(stBf.lastTurnBreakdown.totalDamage > 1000);

    // Backfire at 10 HP clamps strictly at 0
    engBf.forceState({ playerHp: 10, forceBackfire: true });
    const stLow = engBf.performPrimaryAction({ forceBackfire: true });
    assert.equal(stLow.playerHp, 0);
  });

  it('scales Lone Bullet Roulette with empty chambers and consumes/resets Russian Roulette Grit after a dry click', () => {
    const engFull = new RevolverDungeonEngine({ seed: 703 });
    engFull.forceState({
      chambers: Array(6).fill('lead_bullet'),
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const dmgFull = engFull.performPrimaryAction({ targetChamber: 0 }).lastTurnBreakdown.totalDamage;

    const engLone = new RevolverDungeonEngine({ seed: 703 });
    engLone.forceState({
      chambers: ['lead_bullet', 'empty', 'empty', 'empty', 'empty', 'empty'],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const dmgLone = engLone.performPrimaryAction({ targetChamber: 0 }).lastTurnBreakdown.totalDamage;
    assert.ok(dmgLone > dmgFull);

    // Dry click Grit bonus & single-shot consumption reset
    const engGrit = new RevolverDungeonEngine({ seed: 704, enemyHp: 500000, enemyMaxHp: 500000 });
    const gold0 = engGrit.getState().gold;
    engGrit.forceState({
      chambers: ['empty', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet', 'lead_bullet'],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stDry = engGrit.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stDry.gold > gold0);
    assert.equal(stDry.gritMultiplier, 2.0);

    // Next real shot consumes Grit
    const stBoosted = engGrit.performPrimaryAction({ targetChamber: 1 });
    assert.equal(stBoosted.gritMultiplier, 1.0);

    // Following real shot has normal (unboosted) multiplier
    const stNormal = engGrit.performPrimaryAction({ targetChamber: 1 });
    assert.ok(stBoosted.lastTurnBreakdown.totalDamage > stNormal.lastTurnBreakdown.totalDamage);
  });

  it('mounts RevolverDungeonView, renders all 11 required data-testid elements, and handles Space & R hotkeys', () => {
    const engine = new RevolverDungeonEngine({ seed: 705 });
    const sound = new SoundEngine();
    const vfx = new VFXCanvas();
    const hudContainer = { innerHTML: '' };
    const hud = new HUDController(hudContainer);
    const stageContainer = { innerHTML: '' };

    const view = createRevolverDungeonView(engine, { sound, vfx, hud });
    assert.ok(view instanceof RevolverDungeonView);
    view.mount(stageContainer, { engine, sound, vfx, hud });

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
      assert.ok(
        stageContainer.innerHTML.includes(`data-testid="${id}"`),
        `RevolverDungeonView missing data-testid="${id}"`
      );
    }

    view.onKeyDown({ code: 'KeyR', key: 'r', preventDefault() {} });
    view.onKeyDown({ code: 'Space', key: ' ', preventDefault() {} });
    view.onKeyDown({ code: 'Space', key: ' ', repeat: true, preventDefault() {} });

    view.unmount();
    assert.equal(stageContainer.innerHTML, '');
  });

  it('F-R2-04: supports 3-Bullet Tactical Ammo Belt shop, Click-any-Chamber (#0..#5) targeted loading, Floor 2 Hound dry-click pounce, Overtime counter-attacks, and Post-Wave Relic Draft + Endless Mode', () => {
    const engine = new RevolverDungeonEngine({ seed: 706, gold: 250 });
    engine.forceState({ chambers: Array(6).fill('empty') });

    // 1. Target Chamber #4 and purchase from Tactical Ammo Belt
    engine.selectChamber(4);
    const goldBefore = engine.getState().gold;
    const stLoaded = engine.buyAmmoBeltSlot(0);
    assert.ok(stLoaded.gold < goldBefore);
    assert.notEqual(stLoaded.chambers[4].id, 'empty');
    assert.equal(stLoaded.chambers[0].id, 'empty');

    // 2. Floor 2 Boss (twin_headed_hound) pounces on dry click
    const houndEngine = new RevolverDungeonEngine({ seed: 707 });
    houndEngine.forceState({
      wave: 2,
      floor: 2,
      enemyHp: 780,
      enemyMaxHp: 780,
      pullsRemaining: 4,
      playerHp: 100,
      chambers: Array(6).fill('empty'),
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stHoundDry = houndEngine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stHoundDry.playerHp < 100);

    // 3. Overtime Boss counter-attack on surviving Floor Boss
    const otEngine = new RevolverDungeonEngine({ seed: 708 });
    otEngine.forceState({
      wave: 3,
      floor: 3,
      enemyHp: 999999,
      enemyMaxHp: 999999,
      pullsRemaining: 0,
      playerHp: 100,
      chambers: Array(6).fill('lead_bullet'),
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stOt = otEngine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(stOt.playerHp < 100);

    // 4. Fatal Demon Bullet backfire sets gameOver === true
    const fatalEngine = new RevolverDungeonEngine({ seed: 709 });
    fatalEngine.forceState({
      playerHp: 10,
      enemyHp: 999999,
      chambers: Array(6).fill('demon_bullet'),
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
      forceBackfire: true,
    });
    const stFatal = fatalEngine.performPrimaryAction({ targetChamber: 0, forceBackfire: true });
    assert.equal(stFatal.playerHp, 0);
    assert.equal(stFatal.gameOver, true);

    // 5. Post-Wave 3-Card Relic Draft & Wave 9+ Endless Mode
    const draftEngine = new RevolverDungeonEngine({ seed: 710 });
    draftEngine.forceState({
      wave: 1,
      floor: 1,
      enemyHp: 10,
      enemyMaxHp: 150,
      pullsRemaining: 4,
      chambers: Array(6).fill('heavy_hammer'),
    });
    const stFloorClear = draftEngine.performPrimaryAction({ targetChamber: 0 });
    assert.equal(stFloorClear.wave, 2);
    assert.ok(Array.isArray(stFloorClear.pendingRelicDraft));
    assert.equal(stFloorClear.pendingRelicDraft.length, 3);
  });
});

