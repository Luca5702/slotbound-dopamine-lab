/**
 * Scheme 1: 《吞噬转轮》(Devour Reels) Configuration & Catalog (`F-S1-01`, `F-S1-02`, `F-S1-03`)
 * Zero DOM dependencies — runs in both Browser and Node.js (`node --test`).
 */

/**
 * 9 Canonical Ingredient & Predator Symbols across Tiers 1..4 (GDD §2).
 * Note: Only `iron_knight` (T2), `fireball` (T2), `hero_berserker` (T3), and `abyss_apostle` (T4)
 * have `isPredator: true`. `digestive_herb` (T2) is a soothing purifier (`isPredator: false`).
 */
export const SYMBOLS = Object.freeze([
  Object.freeze({
    id: 'goblin',
    name: '哥布林杂兵 (Goblin)',
    zhName: '哥布林杂兵',
    enName: 'Goblin',
    icon: '👺',
    tier: 1,
    basePoints: 12,
    defaultWeight: 22,
    indigestion: 4,
    isPredator: false,
    devourBonusPoints: 15,
    devourExtraStacks: 1,
    description: '脆皮多汁的基础肉食；被吞噬时额外提供 +15 点数与 +1 吞噬层数。',
  }),
  Object.freeze({
    id: 'chest',
    name: '黄金宝箱 (Chest)',
    zhName: '黄金宝箱',
    enName: 'Chest',
    icon: '📦',
    tier: 1,
    basePoints: 10,
    defaultWeight: 14,
    indigestion: 3,
    isPredator: false,
    spawnGold: 12,
    devourGold: 25,
    description: '摇出即送 +12 Gold；被吞噬时额外爆出 +25 Gold 并可触发勇者盛宴。',
  }),
  Object.freeze({
    id: 'powder_keg',
    name: '黑火药桶 (Powder Keg)',
    zhName: '黑火药桶',
    enName: 'Powder Keg',
    icon: '🛢️',
    tier: 1,
    basePoints: 20,
    defaultWeight: 12,
    indigestion: 5,
    isPredator: false,
    description: '高危爆破食材；与烈焰火球同盘时引发肚内连锁大爆炸。',
  }),
  Object.freeze({
    id: 'curse_skull',
    name: '诅咒骨颅 (Curse Skull)',
    zhName: '诅咒骨颅',
    enName: 'Curse Skull',
    icon: '💀',
    tier: 1,
    basePoints: 5,
    defaultWeight: 10,
    indigestion: 18,
    isPredator: false,
    description: '剧毒异物 (+18 消化不良)；被深渊使徒吞噬时转化为 ×8.0 剧毒化魔倍率。',
  }),
  Object.freeze({
    id: 'iron_knight',
    name: '铁甲骑士 (Iron Knight)',
    zhName: '铁甲骑士',
    enName: 'Iron Knight',
    icon: '🛡️',
    tier: 2,
    basePoints: 35,
    defaultWeight: 13,
    indigestion: 8,
    isPredator: true,
    armorGain: 30,
    description: '自动吞噬 8 邻域 Tier 1 食材；每只赋予巨口 +30 护甲，凑齐 3 只触发重甲反伤风暴。',
  }),
  Object.freeze({
    id: 'fireball',
    name: '烈焰火球 (Fireball)',
    zhName: '烈焰火球',
    enName: 'Fireball',
    icon: '🔥',
    tier: 2,
    basePoints: 45,
    defaultWeight: 12,
    indigestion: -5,
    isPredator: true,
    description: '自动引燃并吞噬周围 Tier 1 食材，搭配黑火药桶触发 ×6.0+ 肚内连锁大爆炸。',
  }),
  Object.freeze({
    id: 'digestive_herb',
    name: '消食圣果 (Digestive Herb)',
    zhName: '消食圣果',
    enName: 'Digestive Herb',
    icon: '🌿',
    tier: 2,
    basePoints: 25,
    defaultWeight: 5,
    indigestion: -35,
    isPredator: false,
    mawAttackBoost: 12,
    lineMultBonus: 0.5,
    description: '立即净化巨口 -35 消化不良，并永久强化深渊巨口基础攻击力。',
  }),
  Object.freeze({
    id: 'hero_berserker',
    name: '狂战勇者 (Hero Berserker)',
    zhName: '狂战勇者',
    enName: 'Hero Berserker',
    icon: '⚔️',
    tier: 3,
    basePoints: 75,
    defaultWeight: 8,
    indigestion: 10,
    isPredator: true,
    devourExtraStacks: 1,
    description: '凶猛吞噬周围 Tier 1 & Tier 2 单位；搭配哥布林或宝箱触发勇者饕餮盛宴。',
  }),
  Object.freeze({
    id: 'abyss_apostle',
    name: '深渊使徒 (Abyss Apostle)',
    zhName: '深渊使徒',
    enName: 'Abyss Apostle',
    icon: '👁️',
    tier: 4,
    basePoints: 150,
    defaultWeight: 4,
    indigestion: -10,
    isPredator: true,
    devourExtraStacks: 1,
    description: '盘面最高阶主宰，通吃周围 Tier 1~3 一切单位（含诅咒骨颅），吞噬倍率翻倍。',
  }),
]);

export const DEVOUR_SYMBOLS = SYMBOLS;

export const SYMBOL_MAP = Object.freeze(
  Object.fromEntries(SYMBOLS.map((sym) => [sym.id, sym]))
);

export const SYMBOL_CATALOG = SYMBOL_MAP;

/**
 * 8 Standard 3×3 Paylines (3 horizontal, 3 vertical, 2 diagonal).
 */
export const PAYLINES = Object.freeze([
  Object.freeze({ id: 'row_0', name: '上排横线 (Top Row)', cells: Object.freeze([0, 1, 2]), weight: 1.2 }),
  Object.freeze({ id: 'row_1', name: '中排巨口线 (Center Maw Row)', cells: Object.freeze([3, 4, 5]), weight: 1.5 }),
  Object.freeze({ id: 'row_2', name: '下排横线 (Bottom Row)', cells: Object.freeze([6, 7, 8]), weight: 1.2 }),
  Object.freeze({ id: 'col_0', name: '左列竖线 (Left Col)', cells: Object.freeze([0, 3, 6]), weight: 1.2 }),
  Object.freeze({ id: 'col_1', name: '中列巨口线 (Center Maw Col)', cells: Object.freeze([1, 4, 7]), weight: 1.5 }),
  Object.freeze({ id: 'col_2', name: '右列竖线 (Right Col)', cells: Object.freeze([2, 5, 8]), weight: 1.2 }),
  Object.freeze({ id: 'diag_main', name: '主对角线 (Main Diagonal)', cells: Object.freeze([0, 4, 8]), weight: 1.6 }),
  Object.freeze({ id: 'diag_anti', name: '副对角线 (Anti Diagonal)', cells: Object.freeze([2, 4, 6]), weight: 1.6 }),
]);

/**
 * 8-Way Moore Neighborhood Adjacency Map for 3×3 Grid (`0..8`).
 * Cell `0` only reaches `[1, 3, 4]` and NEVER reaches cell `8`.
 * Central Cell `4` reaches all 8 surrounding cells `[0, 1, 2, 3, 5, 6, 7, 8]`.
 */
export const ADJACENCY_MAP = Object.freeze({
  0: Object.freeze([1, 3, 4]),
  1: Object.freeze([0, 2, 3, 4, 5]),
  2: Object.freeze([1, 4, 5]),
  3: Object.freeze([0, 1, 4, 6, 7]),
  4: Object.freeze([0, 1, 2, 3, 5, 6, 7, 8]),
  5: Object.freeze([1, 2, 4, 7, 8]),
  6: Object.freeze([3, 4, 7]),
  7: Object.freeze([3, 4, 5, 6, 8]),
  8: Object.freeze([4, 5, 7]),
});

/**
 * Initial Wheel Probability Weights summing strictly to 100%.
 */
export const DEFAULT_WHEEL_WEIGHTS = Object.freeze({
  goblin: 22,
  chest: 14,
  powder_keg: 12,
  curse_skull: 10,
  iron_knight: 13,
  fireball: 12,
  digestive_herb: 5,
  hero_berserker: 8,
  abyss_apostle: 4,
});

/**
 * One-Click Build Presets for the Wheel Probability Modder (`F-S1-03`).
 */
export const WHEEL_PRESETS = Object.freeze({
  baseline: Object.freeze({ ...DEFAULT_WHEEL_WEIGHTS }),
  pyro: Object.freeze({
    goblin: 12,
    chest: 8,
    powder_keg: 30,
    curse_skull: 4,
    iron_knight: 5,
    fireball: 30,
    digestive_herb: 4,
    hero_berserker: 4,
    abyss_apostle: 3,
  }),
  iron: Object.freeze({
    goblin: 12,
    chest: 22,
    powder_keg: 5,
    curse_skull: 3,
    iron_knight: 38,
    fireball: 5,
    digestive_herb: 6,
    hero_berserker: 6,
    abyss_apostle: 3,
  }),
  gluttony: Object.freeze({
    goblin: 32,
    chest: 12,
    powder_keg: 4,
    curse_skull: 4,
    iron_knight: 4,
    fireball: 4,
    digestive_herb: 0,
    hero_berserker: 24,
    abyss_apostle: 16,
  }),
});

/**
 * 5 Canonical Stomach Chain Reactions (`F-S1-02`).
 */
export const STOMACH_SYNERGIES = Object.freeze([
  Object.freeze({
    id: 'fireball_powder_keg',
    name: '🔥 肚内连锁大爆炸 (Fireball + Powder Keg)',
    baseMultiplier: 6.0,
    maxMultiplier: 12.0,
    indigestionDelta: -15,
  }),
  Object.freeze({
    id: 'triple_iron_knights',
    name: '🛡️ 重甲反伤风暴 (3× Iron Knights Fortress)',
    baseMultiplier: 4.5,
    armorBonus: 120,
  }),
  Object.freeze({
    id: 'hero_banquet',
    name: '🍖 勇者饕餮盛宴 (Hero Banquet)',
    baseMultiplier: 3.5,
    goldBonus: 50,
    bonusStacks: 3,
  }),
  Object.freeze({
    id: 'curse_transmutation',
    name: '☠️ 剧毒化魔炼成 (Curse Transmutation)',
    baseMultiplier: 8.0,
    indigestionDelta: -25,
  }),
  Object.freeze({
    id: 'full_board_gluttony',
    name: '🌌 饕餮吞天 (Full-Board Gluttony)',
    baseMultiplier: 10.0,
  }),
]);

export const WHEEL_MOD_COSTS = Object.freeze({
  boost: 25,
  banish: 20,
  preset: 35,
});

export const MAW_WORKSHOP_ITEMS = Object.freeze([
  Object.freeze({
    id: 'buy_herb',
    action: 'buy_herb',
    testid: 'btn-maw-herb',
    zhName: '吞服圣果',
    label: '吞服圣果 30G (-35消化/+15攻)',
    cost: 30,
    indigestionDelta: -35,
    attackBonus: 15,
    armorBonus: 0,
    levelBonus: 0,
    spriteId: 'digestive_herb',
    tier: 2,
  }),
  Object.freeze({
    id: 'buy_armor',
    action: 'buy_armor',
    testid: 'btn-maw-armor',
    zhName: '锻造重甲',
    label: '锻造重甲 40G (+60巨口护甲)',
    cost: 40,
    indigestionDelta: 0,
    attackBonus: 10,
    armorBonus: 60,
    levelBonus: 0,
    spriteId: 'iron_knight',
    tier: 2,
  }),
  Object.freeze({
    id: 'temper_maw',
    action: 'temper_maw',
    testid: 'btn-maw-temper',
    zhName: '淬炼巨口',
    label: '淬炼巨口 60G (Lv+1/+40攻/+30甲)',
    cost: 60,
    indigestionDelta: -15,
    attackBonus: 40,
    armorBonus: 30,
    levelBonus: 1,
    spriteId: 'abyss_apostle',
    tier: 4,
  }),
]);

/**
 * 8 Escalating Siege Bosses (`120 HP` to `85,000,000 HP`) (`F-S1-03`).
 */
export const BOSSES = Object.freeze([
  Object.freeze({
    wave: 1,
    id: 'battering_ram',
    name: '攻城木槌车 (Battering Ram Cart)',
    zhName: '攻城木槌车',
    hp: 120,
    maxHp: 120,
    enemyMaxHp: 120,
    attack: 10,
    trait: '基础靶机，适合测试首轮吞噬',
    traitCode: 'tutorial_target',
    indigestionHazard: 0,
    armorShred: 0,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 2,
    id: 'iron_phalanx',
    name: '黑铁盾墙阵 (Iron Phalanx)',
    zhName: '黑铁盾墙阵',
    hp: 650,
    maxHp: 650,
    enemyMaxHp: 650,
    attack: 15,
    trait: '高甲推进 · 每轮磨损 10 点巨口护甲',
    traitCode: 'armor_pierce',
    indigestionHazard: 0,
    armorShred: 10,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 3,
    id: 'alchemical_trebuchet',
    name: '炼金投石巨兽 (Alchemical Trebuchet)',
    zhName: '炼金投石巨兽',
    hp: 3800,
    maxHp: 3800,
    enemyMaxHp: 3800,
    attack: 22,
    trait: '投掷诅咒骨颅增加消化不良 (+12)',
    traitCode: 'curse_hazard',
    indigestionHazard: 12,
    armorShred: 0,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 4,
    id: 'steam_siege_tower',
    name: '蒸汽攻城塔 (Steam Siege Tower)',
    zhName: '蒸汽攻城塔',
    hp: 25000,
    maxHp: 25000,
    enemyMaxHp: 25000,
    attack: 30,
    trait: '重装护盾 · 撞击削减 15 点巨口护甲',
    traitCode: 'heavy_shield',
    indigestionHazard: 0,
    armorShred: 15,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 5,
    id: 'abyssal_siege_drake',
    name: '深渊破城龙 (Abyssal Siege Drake)',
    zhName: '深渊破城龙',
    hp: 180000,
    maxHp: 180000,
    enemyMaxHp: 180000,
    attack: 42,
    trait: '烈焰吐息 · 灼烧胃袋 (+8 消化不良)',
    traitCode: 'flame_breath',
    indigestionHazard: 8,
    armorShred: 15,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 6,
    id: 'golden_titan_colossus',
    name: '黄金泰坦巨像 (Golden Titan Colossus)',
    zhName: '黄金泰坦巨像',
    hp: 1500000,
    maxHp: 1500000,
    enemyMaxHp: 1500000,
    attack: 55,
    trait: '击破奖励双倍金币 (+80G 泰坦金库)',
    traitCode: 'double_gold',
    indigestionHazard: 0,
    armorShred: 0,
    goldMultiplier: 2,
  }),
  Object.freeze({
    wave: 7,
    id: 'necro_bone_citadel',
    name: '冥界骸骨要塞 (Necro Bone Citadel)',
    zhName: '冥界骸骨要塞',
    hp: 12000000,
    maxHp: 12000000,
    enemyMaxHp: 12000000,
    attack: 70,
    trait: '千万级骸骨壁垒 · 死灵瘴气 (+10 消化不良)',
    traitCode: 'bone_fortress',
    indigestionHazard: 10,
    armorShred: 20,
    goldMultiplier: 1,
  }),
  Object.freeze({
    wave: 8,
    id: 'omega_siege_dreadnought',
    name: '神罚天穹母舰·奥米茄 (Omega Siege Dreadnought)',
    zhName: '神罚天穹母舰·奥米茄',
    hp: 85000000,
    maxHp: 85000000,
    enemyMaxHp: 85000000,
    attack: 95,
    trait: '8500万终极攻城 BOSS · 歼星威压',
    traitCode: 'omega_annihilation',
    indigestionHazard: 12,
    armorShred: 25,
    goldMultiplier: 2,
  }),
]);

export const SIEGE_BOSSES = BOSSES;
export const WAVES = BOSSES;

/**
 * Returns the Siege Boss configuration for a 1-indexed wave (`1..8+`).
 * Supports Wave 9+ Endless Mode exponential scaling (`85,000,000 * 6.5^(wave - 8)`).
 * @param {number} [wave=1]
 */
export function getBossForWave(wave = 1) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  if (w <= BOSSES.length) {
    return { ...BOSSES[w - 1] };
  }
  const base8 = BOSSES[BOSSES.length - 1];
  const endlessHp = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(base8.maxHp * Math.pow(6.5, w - BOSSES.length))
  );
  return {
    ...base8,
    wave: w,
    id: 'omega_siege_dreadnought',
    name: `无尽神罚母舰 W${w} (Endless Dreadnought)`,
    zhName: `无尽神罚母舰 W${w}`,
    hp: endlessHp,
    maxHp: endlessHp,
    enemyMaxHp: endlessHp,
    attack: base8.attack + (w - BOSSES.length) * 20,
    trait: `无尽冲分模式 W${w} · 指数级生命膨胀`,
  };
}

export default {
  SYMBOLS,
  DEVOUR_SYMBOLS,
  SYMBOL_MAP,
  SYMBOL_CATALOG,
  PAYLINES,
  ADJACENCY_MAP,
  DEFAULT_WHEEL_WEIGHTS,
  WHEEL_PRESETS,
  WHEEL_MOD_COSTS,
  MAW_WORKSHOP_ITEMS,
  STOMACH_SYNERGIES,
  BOSSES,
  SIEGE_BOSSES,
  WAVES,
  getBossForWave,
};
