/**
 * Scheme 4: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Configuration & Catalog (`F-S4-01`, `F-R2-06`)
 * Top 1×3 Alchemical Orb Spawner, 24-Peg Elemental Cascade Arena (4 staggered rows × 6 pegs),
 * Mid-Air Collision Auto-Devour tiers, and Bottom 5 Multiplier Crucibles (`×2 / ×5 / ×25 JACKPOT`).
 *
 * Zero DOM dependencies — 100% Node & Browser compatible.
 */

import { computeEndlessBossHp } from '../../core/EconomyEngine.js';

export const ARENA_BOUNDS = Object.freeze({
  width: 800,
  height: 520,
  minX: 40,
  maxX: 760,
  spawnerY: 55,
  crucibleY: 455,
});

export const PEG_UPGRADE_COST = 35;

export const AIM_MODES = Object.freeze({
  left: { id: 'left', zhName: '左路瞄准', shiftX: -55, shiftVx: -48 },
  center: { id: 'center', zhName: '居中瞄准', shiftX: 0, shiftVx: 0 },
  right: { id: 'right', zhName: '右路瞄准', shiftX: 55, shiftVx: 48 },
});

export const ORB_LIST = Object.freeze([
  {
    id: 'ember_orb',
    name: 'Ember Orb',
    zhName: '火苗珠',
    icon: '🔥',
    tier: 1,
    basePoints: 15,
    mult: 1.2,
    goldBonus: 0,
    devourStacksBonus: 1,
    defaultWeight: 24,
    color: '#ff595e',
  },
  {
    id: 'gold_droplet',
    name: 'Gold Droplet',
    zhName: '金液珠',
    icon: '💧',
    tier: 1,
    basePoints: 12,
    mult: 1.3,
    goldBonus: 20,
    devourStacksBonus: 1,
    defaultWeight: 18,
    color: '#ffd166',
  },
  {
    id: 'frost_core',
    name: 'Frost Core',
    zhName: '霜寒晶核',
    icon: '❄️',
    tier: 1,
    basePoints: 18,
    mult: 1.3,
    goldBonus: 0,
    devourStacksBonus: 1,
    defaultWeight: 14,
    color: '#00bbf9',
  },
  {
    id: 'lightning_sphere',
    name: 'Lightning Sphere',
    zhName: '雷光球',
    icon: '⚡',
    tier: 2,
    basePoints: 40,
    mult: 1.8,
    goldBonus: 0,
    devourStacksBonus: 1,
    defaultWeight: 14,
    color: '#fee440',
  },
  {
    id: 'gold_stone',
    name: 'Alchemical Gold Stone',
    zhName: '炼金金石',
    icon: '🪙',
    tier: 2,
    basePoints: 45,
    mult: 2.0,
    goldBonus: 25,
    devourStacksBonus: 1,
    defaultWeight: 10,
    color: '#ffca3a',
  },
  {
    id: 'volatile_mercury',
    name: 'Volatile Mercury',
    zhName: '狂暴水银球',
    icon: '☿️',
    tier: 2,
    basePoints: 55,
    mult: 2.2,
    goldBonus: 0,
    devourStacksBonus: 2,
    defaultWeight: 8,
    color: '#c0c0ff',
  },
  {
    id: 'void_glutton_orb',
    name: 'Void Glutton Orb',
    zhName: '虚空暴食球',
    icon: '🕳️',
    tier: 3,
    basePoints: 85,
    mult: 3.0,
    goldBonus: 0,
    devourStacksBonus: 2,
    defaultWeight: 6,
    color: '#9b5de5',
  },
  {
    id: 'void_singularity',
    name: 'Void Singularity',
    zhName: '虚空奇点球',
    icon: '🌌',
    tier: 4,
    basePoints: 140,
    mult: 4.0,
    goldBonus: 0,
    devourStacksBonus: 2,
    defaultWeight: 3,
    color: '#f15bb5',
  },
  {
    id: 'philosopher_stone',
    name: 'Philosopher Stone',
    zhName: '贤者之石',
    icon: '💎',
    tier: 4,
    basePoints: 180,
    mult: 5.0,
    goldBonus: 30,
    devourStacksBonus: 3,
    defaultWeight: 3,
    color: '#00f5d4',
  },
]);

export const ORBS = ORB_LIST;
export const SYMBOLS = ORB_LIST;

export const ORB_MAP = Object.freeze(
  Object.fromEntries(ORB_LIST.map((orb) => [orb.id, orb]))
);

export const ORB_WEIGHTS = Object.freeze(
  ORB_LIST.map((orb) => ({ id: orb.id, weight: orb.defaultWeight }))
);

export const PEG_TYPES = Object.freeze([
  {
    id: 'fire_peg',
    name: 'Fire Sigil Peg',
    zhName: '火焰咒印钉',
    icon: '🔥',
    bonusPoints: 10,
    multBonus: 0.2,
    goldBonus: 0,
    devourBonus: 0,
  },
  {
    id: 'lightning_peg',
    name: 'Lightning Sigil Peg',
    zhName: '雷电咒印钉',
    icon: '⚡',
    bonusPoints: 15,
    multBonus: 0.35,
    goldBonus: 0,
    devourBonus: 0,
  },
  {
    id: 'gold_peg',
    name: 'Gold Sigil Peg',
    zhName: '黄金咒印钉',
    icon: '🪙',
    bonusPoints: 12,
    multBonus: 0.25,
    goldBonus: 5,
    devourBonus: 0,
  },
  {
    id: 'gluttony_peg',
    name: 'Gluttony Sigil Peg',
    zhName: '暴食咒印钉',
    icon: '👄',
    bonusPoints: 20,
    multBonus: 0.5,
    goldBonus: 0,
    devourBonus: 1,
  },
]);

function buildDefault24Pegs() {
  const pegs = [];
  const rowsY = [130, 210, 290, 370];
  let index = 0;

  for (let row = 0; row < 4; row++) {
    const y = rowsY[row];
    const rowOffset = row % 2 === 1 ? 26 : -26;
    for (let col = 0; col < 6; col++) {
      const x = Math.round(135 + col * 106 + rowOffset);
      const pegType = PEG_TYPES[(row + col) % PEG_TYPES.length];
      pegs.push(
        Object.freeze({
          index,
          id: `peg_${index}`,
          row,
          col,
          x,
          y,
          radius: 10,
          type: pegType.id,
          name: pegType.name,
          zhName: pegType.zhName,
          icon: pegType.icon,
          bonusPoints: pegType.bonusPoints,
          multBonus: pegType.multBonus,
          goldBonus: pegType.goldBonus,
          devourBonus: pegType.devourBonus,
          level: 1,
          upgraded: false,
        })
      );
      index += 1;
    }
  }
  return Object.freeze(pegs);
}

export const DEFAULT_PEGS = buildDefault24Pegs();

export const CRUCIBLE_TEMPLATES = Object.freeze([
  {
    index: 0,
    id: 'crucible_left_outer',
    name: '×2 Alchemical Crucible',
    zhName: '×2 基础熔炉',
    multiplier: 2,
    mult: 2,
    isJackpot: false,
    xMin: 40,
    xMax: 184,
    centerX: 112,
  },
  {
    index: 1,
    id: 'crucible_left_inner',
    name: '×5 Flame Crucible',
    zhName: '×5 烈焰熔炉',
    multiplier: 5,
    mult: 5,
    isJackpot: false,
    xMin: 184,
    xMax: 328,
    centerX: 256,
  },
  {
    index: 2,
    id: 'crucible_center_jackpot',
    name: '×25 JACKPOT Abyssal Core',
    zhName: '×25 JACKPOT 深渊核心',
    multiplier: 25,
    mult: 25,
    isJackpot: true,
    xMin: 328,
    xMax: 472,
    centerX: 400,
  },
  {
    index: 3,
    id: 'crucible_right_inner',
    name: '×5 Thunder Crucible',
    zhName: '×5 雷霆熔炉',
    multiplier: 5,
    mult: 5,
    isJackpot: false,
    xMin: 472,
    xMax: 616,
    centerX: 544,
  },
  {
    index: 4,
    id: 'crucible_right_outer',
    name: '×2 Alchemical Crucible',
    zhName: '×2 基础熔炉',
    multiplier: 2,
    mult: 2,
    isJackpot: false,
    xMin: 616,
    xMax: 760,
    centerX: 688,
  },
]);

export const DEFAULT_CRUCIBLES = CRUCIBLE_TEMPLATES;

export const BOSSES = Object.freeze([
  { wave: 1, id: 'pachinko_boss_1', name: '炼金泥偶守卫', zhName: '炼金泥偶守卫', hp: 120, maxHp: 120 },
  { wave: 2, id: 'pachinko_boss_2', name: '赤铜齿轮巨像', zhName: '赤铜齿轮巨像', hp: 650, maxHp: 650 },
  { wave: 3, id: 'pachinko_boss_3', name: '水银秘仪奇美拉', zhName: '水银秘仪奇美拉', hp: 3800, maxHp: 3800 },
  { wave: 4, id: 'pachinko_boss_4', name: '咒印熔炉魔神', zhName: '咒印熔炉魔神', hp: 25000, maxHp: 25000 },
  { wave: 5, id: 'pachinko_boss_5', name: '虚空引力大主教', zhName: '虚空引力大主教', hp: 180000, maxHp: 180000 },
  { wave: 6, id: 'pachinko_boss_6', name: '星界万有引力龙', zhName: '星界万有引力龙', hp: 1500000, maxHp: 1500000 },
  { wave: 7, id: 'pachinko_boss_7', name: '深渊翠玉录古神', zhName: '深渊翠玉录古神', hp: 12000000, maxHp: 12000000 },
  { wave: 8, id: 'pachinko_boss_8', name: '贤者终焉造物主', zhName: '贤者终焉造物主', hp: 85000000, maxHp: 85000000 },
]);

export const WAVES = BOSSES;

export function getBossForWave(waveIndex = 1) {
  const w = Math.max(1, Math.floor(Number(waveIndex || 1)));
  if (w <= BOSSES.length) {
    return { ...BOSSES[w - 1] };
  }
  const base8 = BOSSES[BOSSES.length - 1];
  const endlessHp = computeEndlessBossHp(base8.maxHp, w);
  return {
    ...base8,
    wave: w,
    name: `${base8.zhName}·无尽W${w}`,
    zhName: `${base8.zhName}·无尽W${w}`,
    hp: endlessHp,
    maxHp: endlessHp,
  };
}

export default {
  ARENA_BOUNDS,
  PEG_UPGRADE_COST,
  AIM_MODES,
  ORB_LIST,
  ORBS,
  SYMBOLS,
  ORB_MAP,
  ORB_WEIGHTS,
  PEG_TYPES,
  DEFAULT_PEGS,
  CRUCIBLE_TEMPLATES,
  DEFAULT_CRUCIBLES,
  BOSSES,
  WAVES,
  getBossForWave,
};
