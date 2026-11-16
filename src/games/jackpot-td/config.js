/**
 * Scheme 3: 《黄金矿工防线》(Jackpot TD) — Configuration & Catalog (`F-S3-01..03`)
 * 1×5 Single-Line Slot Turret Wall, 6 Tower Symbols (Ranks 1..6),
 * Yahtzee/Poker Hand Evaluator Table, 4 Real-Time Enemy Archetypes, and 8 Siege Waves.
 *
 * Zero DOM dependencies — 100% Node & Browser compatible.
 */

export const TD_CONSTANTS = Object.freeze({
  PEDESTAL_COUNT: 5,
  RED_ZONE_THRESHOLD: 0.72,
  DEFENSE_LINE_Y: 0.85,
  BREACH_THRESHOLD: 1.0,
  INTEREST_INTERVAL_MS: 2500,
  INTEREST_RATE: 0.20,
  FREEZE_DURATION_MS: 4000,
  LASER_DURATION_MS: 5000,
  BASE_PULL_COST: 10,
  PULL_COST_ESCALATION: 2,
  RED_ZONE_CLUTCH_BOOST: 0.35,
});

export const TOWERS = Object.freeze([
  {
    id: 'miner_pick',
    rank: 1,
    tier: 1,
    name: 'Miner Pick Turret',
    zhName: '矿工飞镐塔',
    icon: '⛏️',
    basePoints: 20,
    shotsPerSec: 1.5,
    defaultWeight: 24,
    shotGold: 3,
    devourStacksYield: 2,
    devourBonusPoints: 15,
    isPredator: false,
    isFodder: true,
    color: '#ffca3a',
    description: 'High-speed pickaxe launcher; fodder unit eaten by high-rank towers for +2 Devour Stacks.',
  },
  {
    id: 'gold_nugget',
    rank: 2,
    tier: 1,
    name: 'Gold Nugget Turret',
    zhName: '暴富金砖塔',
    icon: '🪙',
    basePoints: 35,
    shotsPerSec: 1.2,
    defaultWeight: 20,
    spawnGold: 15,
    devourStacksYield: 4,
    devourBonusPoints: 25,
    isPredator: false,
    isFodder: true,
    color: '#ffd166',
    description: 'Generates +15 instant Gold; prime fodder eaten by adjacent high-rank towers for +4 Devour Stacks.',
  },
  {
    id: 'cryo_prism',
    rank: 3,
    tier: 2,
    name: 'Cryo Prism Turret',
    zhName: '极寒冰晶塔',
    icon: '❄️',
    basePoints: 50,
    shotsPerSec: 1.4,
    defaultWeight: 18,
    slowFactor: 0.40,
    devourStacksYield: 2,
    devourBonusPoints: 20,
    isPredator: false,
    isFodder: false,
    color: '#00bbf9',
    description: 'Fires chilling frost beams that slow marching enemies; 3x triggers 4s screen-wide Freeze.',
  },
  {
    id: 'tesla_coil',
    rank: 4,
    tier: 3,
    name: 'Tesla Coil Turret',
    zhName: '磁暴线圈塔',
    icon: '⚡',
    basePoints: 80,
    shotsPerSec: 1.8,
    defaultWeight: 16,
    chainTargets: 4,
    devourStacksYield: 2,
    devourBonusPoints: 30,
    isPredator: true,
    isFodder: false,
    color: '#9b5de5',
    description: 'Arc lightning predator tower that automatically devours adjacent Rank 1–2 fodder pedestals.',
  },
  {
    id: 'prism_laser',
    rank: 5,
    tier: 3,
    name: 'Prism Laser Turret',
    zhName: '聚能棱镜塔',
    icon: '🔦',
    basePoints: 130,
    shotsPerSec: 2.2,
    defaultWeight: 13,
    laserBoost: 1.5,
    devourStacksYield: 3,
    devourBonusPoints: 45,
    isPredator: true,
    isFodder: false,
    color: '#00f5d4',
    description: 'Continuous piercing beam predator that devours adjacent fodder and amplifies 5s Hyper Laser Sweeps.',
  },
  {
    id: 'nuke_core',
    rank: 6,
    tier: 4,
    name: 'Nuke Core Turret',
    zhName: '裂变核芯塔',
    icon: '☢️',
    basePoints: 250,
    shotsPerSec: 1.0,
    defaultWeight: 9,
    nukeBoost: 2.0,
    devourStacksYield: 4,
    devourBonusPoints: 80,
    isPredator: true,
    isFodder: false,
    color: '#ff3366',
    description: 'Apex nuclear predator that devours lower-rank neighbors and unleashes screen-wiping blasts.',
  },
]);

export const SYMBOLS = TOWERS;
export const TURRET_SYMBOLS = TOWERS;

export const TOWER_MAP = Object.freeze(
  Object.fromEntries(TOWERS.map((tower) => [tower.id, tower]))
);
export const SYMBOL_MAP = TOWER_MAP;
export const TURRET_MAP = TOWER_MAP;
export const TOWER_CATALOG = TOWER_MAP;

export const DEFAULT_TOWER_WEIGHTS = Object.freeze({
  miner_pick: 24,
  gold_nugget: 20,
  cryo_prism: 18,
  tesla_coil: 16,
  prism_laser: 13,
  nuke_core: 9,
});

export const YAHTZEE_HANDS = Object.freeze({
  HIGH_CARD: {
    id: 'HIGH_CARD',
    name: 'High Card Volley',
    zhName: '散牌齐射',
    lineMultiplier: 1.0,
    starUpgrade: 1,
    freezeMs: 0,
    laserMs: 0,
    nuke: false,
  },
  ONE_PAIR: {
    id: 'ONE_PAIR',
    name: 'One Pair 2-Star Merge',
    zhName: '对子升星 (二星 ★★)',
    lineMultiplier: 3.0,
    starUpgrade: 2,
    freezeMs: 0,
    laserMs: 0,
    nuke: false,
  },
  TWO_PAIR: {
    id: 'TWO_PAIR',
    name: 'Two Pair Twin 2-Star',
    zhName: '双对联装 (双二星 ★★)',
    lineMultiplier: 8.0,
    starUpgrade: 2,
    freezeMs: 0,
    laserMs: 0,
    nuke: false,
  },
  THREE_OF_A_KIND: {
    id: 'THREE_OF_A_KIND',
    name: 'Three of a Kind Freeze',
    zhName: '三连冰冻 (三星 ★★★ + 4秒全屏冰封)',
    lineMultiplier: 20.0,
    starUpgrade: 3,
    freezeMs: 4000,
    laserMs: 0,
    nuke: false,
  },
  FULL_HOUSE: {
    id: 'FULL_HOUSE',
    name: 'Full House Fortress',
    zhName: '满堂彩葫芦 (★★★ + ★★ + 4秒冰封)',
    lineMultiplier: 45.0,
    starUpgrade: 3,
    freezeMs: 4000,
    laserMs: 0,
    nuke: false,
  },
  SMALL_STRAIGHT: {
    id: 'SMALL_STRAIGHT',
    name: 'Small Straight Laser',
    zhName: '四顺狂暴激光 (5秒狂暴激光洗地)',
    lineMultiplier: 80.0,
    starUpgrade: 2,
    freezeMs: 0,
    laserMs: 5000,
    nuke: false,
  },
  FOUR_OF_A_KIND: {
    id: 'FOUR_OF_A_KIND',
    name: 'Four of a Kind Railgun',
    zhName: '四连轨道炮 (4秒冰冻 + 5秒狂暴激光)',
    lineMultiplier: 150.0,
    starUpgrade: 3,
    freezeMs: 4000,
    laserMs: 5000,
    nuke: false,
  },
  LARGE_STRAIGHT: {
    id: 'LARGE_STRAIGHT',
    name: 'Large Straight Hyper Laser',
    zhName: '五顺狂暴激光 (长达5秒的狂暴激光洗地)',
    lineMultiplier: 200.0,
    starUpgrade: 3,
    freezeMs: 0,
    laserMs: 5000,
    nuke: false,
  },
  YAHTZEE_FIVE: {
    id: 'YAHTZEE_FIVE',
    name: 'Yahtzee Five-of-a-Kind Nuke',
    zhName: '五连核弹 (Yahtzee 五连核弹 + 5秒狂暴激光洗地)',
    lineMultiplier: 1000.0,
    starUpgrade: 3,
    freezeMs: 4000,
    laserMs: 5000,
    nuke: true,
  },
});

export const HAND_TABLE = YAHTZEE_HANDS;

export const ENEMIES = Object.freeze([
  {
    id: 'gob_runner',
    name: 'Gob-Runner',
    zhName: '疾行哥布林',
    icon: '👾',
    speed: 0.14,
    hpFactor: 0.25,
    breachDamage: 8,
    isBoss: false,
  },
  {
    id: 'shield_bearer',
    name: 'Shieldbearer',
    zhName: '重甲铁盾卫',
    icon: '🛡️',
    speed: 0.08,
    hpFactor: 0.50,
    breachDamage: 12,
    isBoss: false,
  },
  {
    id: 'tunnel_berserker',
    name: 'Tunnel Berserker',
    zhName: '狂暴掘地者',
    icon: '🐗',
    speed: 0.12,
    enragedSpeed: 0.18,
    hpFactor: 0.40,
    breachDamage: 15,
    isBoss: false,
  },
  {
    id: 'siege_dreadnought',
    name: 'Siege Dreadnought Boss',
    zhName: '攻城巨无霸 BOSS',
    icon: '👹',
    speed: 0.06,
    hpFactor: 1.0,
    breachDamage: 25,
    isBoss: true,
  },
]);

export const ENEMY_ARCHETYPES = ENEMIES;
export const ENEMY_TYPES = ENEMIES;
export const ENEMY_MAP = Object.freeze(
  Object.fromEntries(ENEMIES.map((enemy) => [enemy.id, enemy]))
);

export const BOSSES = Object.freeze([
  { wave: 1, id: 'wave_1_drill_foreman', name: '锈铁钻探工头', zhName: '锈铁钻探工头', hp: 120, maxHp: 120, rewardGold: 45 },
  { wave: 2, id: 'wave_2_armored_mole', name: '重甲穿山巨兽', zhName: '重甲穿山巨兽', hp: 650, maxHp: 650, rewardGold: 60 },
  { wave: 3, id: 'wave_3_magma_crusher', name: '熔岩碎石机甲', zhName: '熔岩碎石机甲', hp: 3800, maxHp: 3800, rewardGold: 80 },
  { wave: 4, id: 'wave_4_cryo_behemoth', name: '永冻深渊猛犸', zhName: '永冻深渊猛犸', hp: 25000, maxHp: 25000, rewardGold: 110 },
  { wave: 5, id: 'wave_5_thunder_colossus', name: '雷霆矿脉泰坦', zhName: '雷霆矿脉泰坦', hp: 180000, maxHp: 180000, rewardGold: 150 },
  { wave: 6, id: 'wave_6_void_excavator', name: '虚空掘星母舰', zhName: '虚空掘星母舰', hp: 1500000, maxHp: 1500000, rewardGold: 200 },
  { wave: 7, id: 'wave_7_nuclear_wyrm', name: '裂变地心魔龙', zhName: '裂变地心魔龙', hp: 12000000, maxHp: 12000000, rewardGold: 260 },
  { wave: 8, id: 'wave_8_jackpot_overlord', name: '黄金深渊主宰', zhName: '黄金深渊主宰', hp: 85000000, maxHp: 85000000, rewardGold: 400 },
]);

export const TD_BOSSES = BOSSES;
export const WAVES = BOSSES;

export function getBossForWave(waveIndex = 1) {
  const idx = Math.max(0, Math.min(BOSSES.length - 1, Math.floor(Number(waveIndex || 1)) - 1));
  return { ...BOSSES[idx] };
}

export default {
  TD_CONSTANTS,
  TOWERS,
  SYMBOLS,
  TURRET_SYMBOLS,
  TOWER_MAP,
  SYMBOL_MAP,
  TURRET_MAP,
  TOWER_CATALOG,
  DEFAULT_TOWER_WEIGHTS,
  YAHTZEE_HANDS,
  HAND_TABLE,
  ENEMIES,
  ENEMY_ARCHETYPES,
  ENEMY_TYPES,
  ENEMY_MAP,
  BOSSES,
  TD_BOSSES,
  WAVES,
  getBossForWave,
};
