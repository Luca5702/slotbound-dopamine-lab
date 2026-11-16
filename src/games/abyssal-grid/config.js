/**
 * Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Configuration & Catalog (`F-S5-01`)
 * 4×4 Matrix (16 cells), Fodder vs. Auto-Locking Apex Commanders (`🔒 HOLD`),
 * 4-Way Orthogonal Adjacency (`ORTHOGONAL_NEIGHBORS`), and 10-Line Row/Col/Diag Bingo Evaluator.
 *
 * Zero DOM dependencies — 100% Node & Browser compatible.
 */

export const UNIT_LIST = Object.freeze([
  {
    id: 'empty',
    name: 'Empty Cell',
    zhName: '空置战格',
    icon: '⬛',
    tier: 0,
    basePoints: 0,
    mult: 1.0,
    isCommander: false,
    isFodder: false,
    goldBonus: 0,
    defaultWeight: 0,
  },
  {
    id: 'skeleton',
    name: 'Skeleton Pawn',
    zhName: '骸骨卒',
    icon: '💀',
    tier: 1,
    basePoints: 15,
    mult: 1.0,
    isCommander: false,
    isFodder: true,
    goldBonus: 0,
    defaultWeight: 22,
  },
  {
    id: 'skeleton_pawn',
    name: 'Skeleton Pawn',
    zhName: '骸骨卒',
    icon: '💀',
    tier: 1,
    basePoints: 15,
    mult: 1.0,
    isCommander: false,
    isFodder: true,
    goldBonus: 0,
    defaultWeight: 0,
  },
  {
    id: 'slime_blob',
    name: 'Slime Blob',
    zhName: '史莱姆',
    icon: '🟢',
    tier: 1,
    basePoints: 12,
    mult: 1.0,
    isCommander: false,
    isFodder: true,
    goldBonus: 0,
    defaultWeight: 18,
  },
  {
    id: 'mana_crystal',
    name: 'Mana Crystal',
    zhName: '魔力晶簇',
    icon: '🔷',
    tier: 1,
    basePoints: 20,
    mult: 1.2,
    isCommander: false,
    isFodder: true,
    goldBonus: 0,
    defaultWeight: 16,
  },
  {
    id: 'gold_mimic',
    name: 'Gold Mimic',
    zhName: '宝箱怪',
    icon: '🧰',
    tier: 1,
    basePoints: 18,
    mult: 1.2,
    isCommander: false,
    isFodder: true,
    goldBonus: 20,
    defaultWeight: 14,
  },
  {
    id: 'abyssal_knight',
    name: 'Abyssal Knight Commander',
    zhName: '深渊黑骑',
    icon: '🗡️',
    tier: 2,
    basePoints: 45,
    mult: 2.0,
    isCommander: true,
    isFodder: false,
    goldBonus: 0,
    defaultWeight: 13,
  },
  {
    id: 'blood_archmage',
    name: 'Blood Archmage Commander',
    zhName: '鲜血大魔导',
    icon: '🩸',
    tier: 3,
    basePoints: 80,
    mult: 3.0,
    isCommander: true,
    isFodder: false,
    goldBonus: 0,
    defaultWeight: 8,
  },
  {
    id: 'soul_cannon',
    name: 'Soul Cannon Commander',
    zhName: '噬魂巨炮',
    icon: '💣',
    tier: 3,
    basePoints: 95,
    mult: 3.5,
    isCommander: true,
    isFodder: false,
    goldBonus: 0,
    defaultWeight: 6,
  },
  {
    id: 'golden_overlord',
    name: 'Golden Overlord Commander',
    zhName: '黄金霸主',
    icon: '👑',
    tier: 4,
    basePoints: 160,
    mult: 5.0,
    isCommander: true,
    isFodder: false,
    goldBonus: 25,
    defaultWeight: 3,
  },
]);

export const UNITS = UNIT_LIST;
export const SYMBOLS = UNIT_LIST;

export const UNIT_MAP = Object.freeze(
  Object.fromEntries(UNIT_LIST.map((u) => [u.id, u]))
);

export const SPAWNABLE_UNIT_WEIGHTS = Object.freeze(
  UNIT_LIST.filter((u) => u.defaultWeight > 0).map((u) => ({
    id: u.id,
    weight: u.defaultWeight,
  }))
);

/**
 * 4-Way Orthogonal Adjacency (`Up`, `Down`, `Left`, `Right`) for the 4×4 Matrix (`0..15`).
 * Strictly prevents row wrap-around (`cell 0` only touches `1` and `4`, NEVER `3`).
 */
function buildOrthogonalNeighbors() {
  const map = {};
  for (let idx = 0; idx < 16; idx++) {
    const row = Math.floor(idx / 4);
    const col = idx % 4;
    const neighbors = [];
    if (row > 0) neighbors.push((row - 1) * 4 + col);
    if (row < 3) neighbors.push((row + 1) * 4 + col);
    if (col > 0) neighbors.push(row * 4 + (col - 1));
    if (col < 3) neighbors.push(row * 4 + (col + 1));
    neighbors.sort((a, b) => a - b);
    map[idx] = Object.freeze(neighbors);
  }
  return Object.freeze(map);
}

export const ORTHOGONAL_NEIGHBORS = buildOrthogonalNeighbors();

/**
 * 10 Bingo Artillery Lines across the 4×4 Matrix (4 Rows + 4 Columns + 2 Diagonals).
 */
export const BINGO_LINES = Object.freeze([
  { id: 'row_0', type: 'row', name: 'Row 1 Barrage', zhName: '第1横排战线', indices: Object.freeze([0, 1, 2, 3]) },
  { id: 'row_1', type: 'row', name: 'Row 2 Barrage', zhName: '第2横排战线', indices: Object.freeze([4, 5, 6, 7]) },
  { id: 'row_2', type: 'row', name: 'Row 3 Barrage', zhName: '第3横排战线', indices: Object.freeze([8, 9, 10, 11]) },
  { id: 'row_3', type: 'row', name: 'Row 4 Barrage', zhName: '第4横排战线', indices: Object.freeze([12, 13, 14, 15]) },
  { id: 'col_0', type: 'col', name: 'Col 1 Barrage', zhName: '第1纵列战线', indices: Object.freeze([0, 4, 8, 12]) },
  { id: 'col_1', type: 'col', name: 'Col 2 Barrage', zhName: '第2纵列战线', indices: Object.freeze([1, 5, 9, 13]) },
  { id: 'col_2', type: 'col', name: 'Col 3 Barrage', zhName: '第3纵列战线', indices: Object.freeze([2, 6, 10, 14]) },
  { id: 'col_3', type: 'col', name: 'Col 4 Barrage', zhName: '第4纵列战线', indices: Object.freeze([3, 7, 11, 15]) },
  { id: 'diag_main', type: 'diag', name: 'Main Diagonal Barrage', zhName: '主对角毁灭线', indices: Object.freeze([0, 5, 10, 15]) },
  { id: 'diag_anti', type: 'diag', name: 'Anti-Diagonal Barrage', zhName: '副对角毁灭线', indices: Object.freeze([3, 6, 9, 12]) },
]);

export function getBingoLineMultiplier(lineCount = 0) {
  const count = Math.max(0, Math.floor(Number(lineCount) || 0));
  if (count >= 10) return 1000.0;
  if (count >= 8) return 450.0;
  if (count >= 5) return 120.0;
  if (count === 4) return 50.0;
  if (count === 3) return 35.0;
  if (count === 2) return 10.0;
  if (count === 1) return 3.5;
  return 1.0;
}

export const BOSSES = Object.freeze([
  { wave: 1, id: 'grid_boss_1', name: '深渊矩阵哨卫', zhName: '深渊矩阵哨卫', hp: 120, maxHp: 120 },
  { wave: 2, id: 'grid_boss_2', name: '黑曜棋盘战车', zhName: '黑曜棋盘战车', hp: 650, maxHp: 650 },
  { wave: 3, id: 'grid_boss_3', name: '四维裂隙主教', zhName: '四维裂隙主教', hp: 3800, maxHp: 3800 },
  { wave: 4, id: 'grid_boss_4', name: '推运钢铁暴君', zhName: '推运钢铁暴君', hp: 25000, maxHp: 25000 },
  { wave: 5, id: 'grid_boss_5', name: '百眼战棋督军', zhName: '百眼战棋督军', hp: 180000, maxHp: 180000 },
  { wave: 6, id: 'grid_boss_6', name: '星轨矩阵母体', zhName: '星轨矩阵母体', hp: 1500000, maxHp: 1500000 },
  { wave: 7, id: 'grid_boss_7', name: '维度坍缩古龙', zhName: '维度坍缩古龙', hp: 12000000, maxHp: 12000000 },
  { wave: 8, id: 'grid_boss_8', name: '十线全通神罚者', zhName: '十线全通神罚者', hp: 85000000, maxHp: 85000000 },
]);

export const WAVES = BOSSES;

export function getBossForWave(waveIndex = 1) {
  const idx = Math.max(0, Math.min(BOSSES.length - 1, Math.floor(Number(waveIndex || 1)) - 1));
  return { ...BOSSES[idx] };
}

export default {
  UNIT_LIST,
  UNITS,
  SYMBOLS,
  UNIT_MAP,
  SPAWNABLE_UNIT_WEIGHTS,
  ORTHOGONAL_NEIGHBORS,
  BINGO_LINES,
  getBingoLineMultiplier,
  BOSSES,
  WAVES,
  getBossForWave,
};
