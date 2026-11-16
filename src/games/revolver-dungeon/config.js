/**
 * Scheme 2: 《左轮地牢》(Revolver Dungeon) Configuration & Catalog (`F-S2-01`, `F-S2-02`, `F-S2-03`)
 * Zero DOM dependencies — runs in both Browser and Node.js (`node --test`).
 */

/**
 * 9 Canonical Revolver Bullet Types across Tiers 0..4 (GDD §2).
 */
export const BULLET_LIST = Object.freeze([
  Object.freeze({
    id: 'empty',
    bulletId: 'empty',
    name: '空弹仓 (Empty Chamber)',
    zhName: '空弹仓',
    enName: 'Empty Chamber',
    icon: '⚪',
    tier: 0,
    basePoints: 0,
    mult: 1.0,
    defaultWeight: 0,
    description: '扣中空仓获得孤胆赌徒加成 (下发伤害×2.0 + 15G)；每个空仓为实弹提供孤胆轮盘倍率加成。',
  }),
  Object.freeze({
    id: 'lead_bullet',
    bulletId: 'lead_bullet',
    name: '普通铅弹 (Lead Bullet)',
    zhName: '普通铅弹',
    enName: 'Lead Bullet',
    icon: '🔫',
    tier: 1,
    basePoints: 25,
    mult: 1.2,
    defaultWeight: 26,
    description: '稳定可靠的基础实弹；也是深渊寄生弹最优质的吞噬口粮。',
  }),
  Object.freeze({
    id: 'vampire_bullet',
    bulletId: 'vampire_bullet',
    name: '猩红吸血弹 (Vampire Bullet)',
    zhName: '猩红吸血弹',
    enName: 'Vampire Bullet',
    icon: '🩸',
    tier: 2,
    basePoints: 40,
    mult: 1.8,
    healAmount: 20,
    overhealMult: 2.5,
    defaultWeight: 14,
    description: '击发时立即回复玩家 +20 HP；若生命已满则将溢出治疗转化为 ×2.5 鲜血暴击倍率。',
  }),
  Object.freeze({
    id: 'scatter_bullet',
    bulletId: 'scatter_bullet',
    name: '霰弹散射弹 (Scatter Bullet)',
    zhName: '霰弹散射弹',
    enName: 'Scatter Bullet',
    icon: '💥',
    tier: 2,
    basePoints: 35,
    mult: 2.5,
    defaultWeight: 14,
    description: '喷射扇形弹幕，并同时引燃左右相邻两个弹仓 (i-1, i+1) 协同开火。',
  }),
  Object.freeze({
    id: 'parasite_bullet',
    bulletId: 'parasite_bullet',
    name: '深渊寄生弹 (Parasite Bullet)',
    zhName: '深渊寄生弹',
    enName: 'Parasite Bullet',
    icon: '🐛',
    tier: 3,
    basePoints: 60,
    mult: 3.0,
    devourStacksPerPrey: 2,
    devourDamageFactor: 2.0,
    defaultWeight: 12,
    description: '零操作吞噬核心：自动吞噬左右环形相邻弹仓的子弹，每吞 1 颗伤害翻倍 (×2.0) 并叠加 +2 吞噬层数。',
  }),
  Object.freeze({
    id: 'powder_charge',
    bulletId: 'powder_charge',
    name: '浓缩火药弹 (Powder Charge)',
    zhName: '浓缩火药弹',
    enName: 'Powder Charge',
    icon: '🧨',
    tier: 2,
    basePoints: 30,
    mult: 2.0,
    defaultWeight: 11,
    description: '强化顺时针下一格弹仓 +100% 伤害；“火药+引信+重锤”六连发清空弹巢组件 A。',
  }),
  Object.freeze({
    id: 'fuse_cord',
    bulletId: 'fuse_cord',
    name: '导爆引信弹 (Fuse Cord)',
    zhName: '导爆引信弹',
    enName: 'Fuse Cord',
    icon: '🧵',
    tier: 2,
    basePoints: 30,
    mult: 2.2,
    defaultWeight: 11,
    description: '串联前后相邻弹仓协同击发；“火药+引信+重锤”六连发清空弹巢组件 B。',
  }),
  Object.freeze({
    id: 'heavy_hammer',
    bulletId: 'heavy_hammer',
    name: '破城重锤弹 (Heavy Hammer)',
    zhName: '破城重锤弹',
    enName: 'Heavy Hammer',
    icon: '🔨',
    tier: 3,
    basePoints: 90,
    mult: 3.5,
    isHeavy: true,
    defaultWeight: 7,
    description: '重型穿甲弹；“火药+引信+重锤”六连发清空弹巢组件 C。',
  }),
  Object.freeze({
    id: 'demon_bullet',
    bulletId: 'demon_bullet',
    name: '契约恶魔弹 (Demon Bullet)',
    zhName: '契约恶魔弹',
    enName: 'Demon Bullet',
    icon: '😈',
    tier: 4,
    basePoints: 220,
    mult: 8.0,
    backfireChance: 0.25,
    backfireDamage: 20,
    bloodRageMult: 3.0,
    defaultWeight: 5,
    description: '俄罗斯轮盘核心：提供 ×8.0 毁灭倍率，但有 25% 概率炸膛自伤 (-20 HP) 并激活 ×3.0 血怒加成！',
  }),
]);

export const BULLET_MAP = Object.freeze(
  Object.fromEntries(BULLET_LIST.map((b) => [b.id, b]))
);

export const BULLETS = BULLET_MAP;
export const BULLET_TYPES = BULLET_MAP;
export const BULLET_CATALOG = BULLET_MAP;

export const LOADABLE_BULLET_WEIGHTS = Object.freeze(
  Object.fromEntries(
    BULLET_LIST.filter((b) => b.id !== 'empty').map((b) => [b.id, b.defaultWeight])
  )
);

/**
 * 8 Escalating Dungeon Boss Floors (`150 HP` to `95,000,000 HP`) (GDD §4.2).
 */
export const BOSSES = Object.freeze([
  Object.freeze({
    floor: 1,
    wave: 1,
    id: 'dungeon_gate_skeleton',
    name: '地牢看守骸骨 (Dungeon Gate Skeleton)',
    hp: 150,
    maxHp: 150,
    enemyMaxHp: 150,
    counterAttack: 8,
    trait: '15秒极速教学关',
  }),
  Object.freeze({
    floor: 2,
    wave: 2,
    id: 'twin_headed_hound',
    name: '双头猎犬 (Twin-Headed Hound)',
    hp: 780,
    maxHp: 780,
    enemyMaxHp: 780,
    counterAttack: 12,
    trait: '闪避空仓时反扑',
  }),
  Object.freeze({
    floor: 3,
    wave: 3,
    id: 'iron_maiden_executioner',
    name: '铁处女行刑官 (Iron Maiden Executioner)',
    hp: 4200,
    maxHp: 4200,
    enemyMaxHp: 4200,
    counterAttack: 16,
    trait: '需寄生弹或重锤破甲',
  }),
  Object.freeze({
    floor: 4,
    wave: 4,
    id: 'vampire_archduke',
    name: '血族大公爵 (Vampire Archduke)',
    hp: 28000,
    maxHp: 28000,
    enemyMaxHp: 28000,
    counterAttack: 20,
    trait: '吸血弹克制',
  }),
  Object.freeze({
    floor: 5,
    wave: 5,
    id: 'powder_mad_alchemist',
    name: '黑火药炼金狂人 (Powder Mad Alchemist)',
    hp: 210000,
    maxHp: 210000,
    enemyMaxHp: 210000,
    counterAttack: 25,
    trait: '鼓励火药+引信+重锤连发',
  }),
  Object.freeze({
    floor: 6,
    wave: 6,
    id: 'abyssal_croupier',
    name: '深渊赌局荷官 (Abyssal Croupier)',
    hp: 1800000,
    maxHp: 1800000,
    enemyMaxHp: 1800000,
    counterAttack: 32,
    trait: '恶魔弹倍率翻倍',
  }),
  Object.freeze({
    floor: 7,
    wave: 7,
    id: 'six_armed_hell_general',
    name: '炼狱六臂魔将 (Six-Armed Hell General)',
    hp: 14500000,
    maxHp: 14500000,
    enemyMaxHp: 14500000,
    counterAttack: 40,
    trait: '千万级高压地牢',
  }),
  Object.freeze({
    floor: 8,
    wave: 8,
    id: 'revolver_archfiend_azazel',
    name: '深渊左轮魔神·阿撒兹勒 (Revolver Archfiend Azazel)',
    hp: 95000000,
    maxHp: 95000000,
    enemyMaxHp: 95000000,
    counterAttack: 50,
    trait: '9500万终极轮盘决战',
  }),
]);

export const DUNGEON_BOSSES = BOSSES;
export const FLOORS = BOSSES;
export const WAVES = BOSSES;

export function getBossForFloor(floor = 1) {
  const idx = Math.max(0, Math.min(BOSSES.length - 1, Math.floor(Number(floor) || 1) - 1));
  return { ...BOSSES[idx] };
}

export default {
  BULLET_LIST,
  BULLET_MAP,
  BULLETS,
  BULLET_TYPES,
  BULLET_CATALOG,
  LOADABLE_BULLET_WEIGHTS,
  BOSSES,
  DUNGEON_BOSSES,
  FLOORS,
  WAVES,
  getBossForFloor,
};
