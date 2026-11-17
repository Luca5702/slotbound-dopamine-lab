/**
 * Unified Game Scheme Catalog & Factory Registry (`F-HUB-01`)
 * Catalogs and instantiates all 5 playable game schemes:
 *  1. `devour-reels`: 《吞噬转轮》(Devour Reels)
 *  2. `revolver-dungeon`: 《左轮地牢》(Revolver Dungeon)
 *  3. `jackpot-td`: 《黄金矿工防线》(Jackpot TD)
 *  4. `sigil-pachinko`: 《咒印弹珠台》(Sigil Pachinko)
 *  5. `abyssal-grid`: 《深渊矩阵：推运战棋》(Abyssal Grid)
 */

import { DevourReelsEngine } from './devour-reels/DevourReelsEngine.js';
import { DevourReelsView } from './devour-reels/DevourReelsView.js';
import { RevolverDungeonEngine } from './revolver-dungeon/RevolverDungeonEngine.js';
import { RevolverDungeonView } from './revolver-dungeon/RevolverDungeonView.js';
import { JackpotTDEngine } from './jackpot-td/JackpotTDEngine.js';
import { JackpotTDView } from './jackpot-td/JackpotTDView.js';
import { SigilPachinkoEngine } from './sigil-pachinko/SigilPachinkoEngine.js';
import { SigilPachinkoView } from './sigil-pachinko/SigilPachinkoView.js';
import { AbyssalGridEngine } from './abyssal-grid/AbyssalGridEngine.js';
import { AbyssalGridView } from './abyssal-grid/AbyssalGridView.js';

export const SCHEME_IDS = Object.freeze([
  'devour-reels',
  'revolver-dungeon',
  'jackpot-td',
  'sigil-pachinko',
  'abyssal-grid',
]);

export const SCHEMES = Object.freeze([
  Object.freeze({
    id: 'devour-reels',
    schemeId: 'devour-reels',
    navTestId: 'nav-scheme-1',
    boardTestId: 'devour-grid',
    primaryBtnTestId: 'btn-spin-devour',
    title: '吞噬转轮 Devour Reels',
    zhTitle: '方案一：《吞噬转轮》',
    subtitle: '3×3 巨口养成与弹幕直伤',
    gddId: '02-scheme1-devour-reels',
    Engine: DevourReelsEngine,
    View: DevourReelsView,
    createEngine: (options = {}) => new DevourReelsEngine(options),
    createView: (engineOrOptions = null, sharedServices = {}) =>
      new DevourReelsView(engineOrOptions, sharedServices),
    jackpotSetup(engine) {
      if (!engine) return;
      engine.forceState?.({
        pullsRemaining: Math.max(1, engine.economy?.pullsRemaining || 5),
        enemyHp: Math.max(120, engine.enemyHp || 120),
      });
      engine.forceNextSpin?.([
        'fireball',
        'powder_keg',
        'curse_skull',
        'goblin',
        'abyss_apostle',
        'hero_berserker',
        'iron_knight',
        'iron_knight',
        'iron_knight',
      ]);
    },
  }),
  Object.freeze({
    id: 'revolver-dungeon',
    schemeId: 'revolver-dungeon',
    navTestId: 'nav-scheme-2',
    boardTestId: 'revolver-cylinder',
    primaryBtnTestId: 'btn-spin-fire',
    title: '左轮地牢 Revolver Dungeon',
    zhTitle: '方案二：《左轮地牢》',
    subtitle: '6发左轮俄罗斯轮盘 + 极简爬塔',
    gddId: '03-scheme2-revolver-dungeon',
    Engine: RevolverDungeonEngine,
    View: RevolverDungeonView,
    createEngine: (options = {}) => new RevolverDungeonEngine(options),
    createView: (engineOrOptions = null, sharedServices = {}) =>
      new RevolverDungeonView(engineOrOptions, sharedServices),
    jackpotSetup(engine) {
      if (!engine) return;
      engine.forceState?.({
        pullsRemaining: Math.max(1, engine.economy?.pullsRemaining || 5),
        enemyHp: Math.max(150, engine.enemyHp || 150),
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
      });
    },
  }),
  Object.freeze({
    id: 'jackpot-td',
    schemeId: 'jackpot-td',
    navTestId: 'nav-scheme-3',
    boardTestId: 'td-slot-bar',
    primaryBtnTestId: 'btn-pull-lever',
    title: '黄金矿工防线 Jackpot TD',
    zhTitle: '方案三：《黄金矿工防线》',
    subtitle: '1×5 单线极速塔防 + 快艇骰子激光洗地',
    gddId: '04-scheme3-jackpot-td',
    Engine: JackpotTDEngine,
    View: JackpotTDView,
    createEngine: (options = {}) => new JackpotTDEngine(options),
    createView: (engineOrOptions = null, sharedServices = {}) =>
      new JackpotTDView(engineOrOptions, sharedServices),
    jackpotSetup(engine) {
      if (!engine) return;
      engine.forceState?.({
        gold: Math.max(200, engine.economy?.gold ?? 200),
        pullsRemaining: Math.max(1, engine.economy?.pullsRemaining ?? 5),
        heldPedestals: [false, false, false, false, false],
      });
      engine.forceNextSpin?.([
        'nuke_core',
        'nuke_core',
        'nuke_core',
        'nuke_core',
        'nuke_core',
      ]);
    },
  }),
  Object.freeze({
    id: 'sigil-pachinko',
    schemeId: 'sigil-pachinko',
    navTestId: 'nav-scheme-4',
    boardTestId: 'pachinko-board',
    primaryBtnTestId: 'btn-drop-orbs',
    title: '咒印弹珠台 Sigil Pachinko',
    zhTitle: '方案四：《咒印弹珠台》',
    subtitle: '1×3 炼金落球 + 24钉碰撞吞噬 + ×25坩埚',
    gddId: '05-explorations-pachinko-grid',
    Engine: SigilPachinkoEngine,
    View: SigilPachinkoView,
    createEngine: (options = {}) => new SigilPachinkoEngine(options),
    createView: (engineOrOptions = null, sharedServices = {}) =>
      new SigilPachinkoView(engineOrOptions, sharedServices),
    jackpotSetup(engine) {
      if (!engine) return;
      engine.forceState?.({
        pullsRemaining: Math.max(1, engine.economy?.pullsRemaining ?? 5),
        spawner: ['void_singularity', 'gold_stone', 'ember_orb'],
        forceCrucibleIndex: 2,
      });
    },
  }),
  Object.freeze({
    id: 'abyssal-grid',
    schemeId: 'abyssal-grid',
    navTestId: 'nav-scheme-5',
    boardTestId: 'abyssal-matrix',
    primaryBtnTestId: 'btn-matrix-spin',
    title: '深渊矩阵 Abyssal Grid',
    zhTitle: '方案五：《深渊矩阵：推运战棋》',
    subtitle: '4×4 统帅自动锁格十字吞噬 + 10线 Bingo 齐射',
    gddId: '05-explorations-pachinko-grid',
    Engine: AbyssalGridEngine,
    View: AbyssalGridView,
    createEngine: (options = {}) => new AbyssalGridEngine(options),
    createView: (engineOrOptions = null, sharedServices = {}) =>
      new AbyssalGridView(engineOrOptions, sharedServices),
    jackpotSetup(engine) {
      if (!engine) return;
      const matrix16 = Array(16).fill('abyssal_knight');
      matrix16[1] = 'skeleton';
      matrix16[4] = 'skeleton';
      engine.forceState?.({
        pullsRemaining: Math.max(1, engine.economy?.pullsRemaining ?? 5),
        lockedCells: [],
      });
      engine.forceNextSpin?.(matrix16);
    },
  }),
]);

export const GAME_REGISTRY = Object.freeze(
  Object.fromEntries(SCHEMES.map((s) => [s.id, s]))
);

const SCHEME_ALIAS_MAP = Object.freeze({
  'scheme-1': 'devour-reels',
  'nav-scheme-1': 'devour-reels',
  'devour_reels': 'devour-reels',
  'scheme-2': 'revolver-dungeon',
  'nav-scheme-2': 'revolver-dungeon',
  'revolver_dungeon': 'revolver-dungeon',
  'scheme-3': 'jackpot-td',
  'nav-scheme-3': 'jackpot-td',
  'jackpot_td': 'jackpot-td',
  'scheme-4': 'sigil-pachinko',
  'nav-scheme-4': 'sigil-pachinko',
  'sigil_pachinko': 'sigil-pachinko',
  'scheme-5': 'abyssal-grid',
  'nav-scheme-5': 'abyssal-grid',
  'abyssal_grid': 'abyssal-grid',
});

export function normalizeSchemeId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const trimmed = rawId.trim().toLowerCase();
  if (GAME_REGISTRY[trimmed]) return trimmed;
  if (SCHEME_ALIAS_MAP[trimmed]) return SCHEME_ALIAS_MAP[trimmed];
  if (trimmed === 'gdd' || trimmed === 'gdd-viewer' || trimmed === 'nav-gdd-viewer') {
    return 'gdd';
  }
  if (trimmed === 'audio-lab' || trimmed === 'audio' || trimmed === 'nav-audio-lab') {
    return 'audio-lab';
  }
  return null;
}

export function isValidSchemeId(rawId) {
  return normalizeSchemeId(rawId) !== null;
}

export function getAllSchemes() {
  return SCHEMES.map((s) => ({ ...s }));
}

export const getSchemes = getAllSchemes;
export const listSchemes = getAllSchemes;

export function getScheme(schemeId) {
  const canonical = normalizeSchemeId(schemeId);
  if (!canonical || !GAME_REGISTRY[canonical]) return null;
  return GAME_REGISTRY[canonical];
}

export function createEngine(schemeId = 'devour-reels', options = {}) {
  const entry = getScheme(schemeId) || GAME_REGISTRY['devour-reels'];
  return entry.createEngine(options);
}

export function createView(schemeId = 'devour-reels', engineOrOptions = null, sharedServices = {}) {
  const entry = getScheme(schemeId) || GAME_REGISTRY['devour-reels'];
  return entry.createView(engineOrOptions, sharedServices);
}

export default GAME_REGISTRY;
