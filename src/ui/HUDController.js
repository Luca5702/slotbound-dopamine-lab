/**
 * Shared 5-Factor Balatro Scoreboard & Economy HUD Controller (`F-UI-01` & `F-R2-02`)
 * Renders and updates:
 *  - All 10 original required `data-testid` HUD elements (`hud-wave`, `hud-enemy-hp`,
 *    `hud-pulls-left`, `hud-gold`, `hud-base-chips`, `hud-line-mult`, `hud-devour-stacks`,
 *    `hud-total-damage`, `hud-combo-name`, `hud-formula-breakdown`)
 *  - Round 2 5-Factor equation additions (`hud-chain-mult`, `hud-greed-mult`) + `hud-relic-strip`
 *    with `SpriteForge` medallions + localized Chinese synergy titles (zero raw snake_case IDs).
 */

import {
  sanitizeNumber,
  formatBigNumber,
  formatChineseNumber,
  getIntensityTier,
} from '../core/BigNumber.js';
import { DEFAULT_RELIC_CATALOG } from '../core/EconomyEngine.js';
import { renderSprite, safeToString } from './SpriteForge.js';

export const SYNERGY_ZH_MAP = Object.freeze({
  // Idle & Generic
  ready_to_spin: '待命：按下拉杆开战',
  'ready to spin': '待命：按下拉杆开战',
  'ready to spin & fire': '待命：旋转弹巢并开火',
  'ready to pull lever': '待命：拉杆刷新防线',
  'ready to drop orbs': '待命：释放炼金法球',
  'standard attack': '常规战阵齐射',
  standard_attack: '常规战阵齐射',

  // Scheme 1: Devour Reels
  fireball_powder_keg: '肚内连锁大爆炸',
  'fireball + powder keg': '肚内连锁大爆炸',
  triple_iron_knights: '重甲反伤风暴',
  hero_banquet: '勇者饕餮盛宴',
  curse_transmutation: '剧毒化魔炼成',
  full_board_gluttony: '满盘暴食·饕餮吞天',
  bile_eruption: '消化不良·酸液喷发',
  belch_bile_purge: '主动胃酸超载喷吐',
  bile_purge: '主动胃酸超载喷吐',
  overtime_boss_strike: '超时狂暴反击',

  // Scheme 2: Revolver Dungeon
  russian_roulette_grit: '空仓赌命存活 (下发×2.0)',
  full_cylinder_dump: '火药引信重锤·六连清空弹巢',
  scatter_burst: '邻仓协同齐射',
  powder_ignition: '火药增压引燃',
  parasite_feast: '寄生暴食双杀 (×4.0)',
  parasite_devour: '寄生吞噬翻倍 (×2.0)',
  vampire_overheal: '鲜血满血暴击 (×2.5)',
  vampire_leech: '猩红吸血回复',
  demon_backfire_blood_rage: '恶魔炸膛·血怒爆发 (×3.0)',
  demon_blood_gambit: '恶魔轮盘赌命暴击 (×2.0)',
  demon_overclock: '恶魔弹巢共鸣',
  lone_survivor_roulette: '孤胆轮盘空仓加成',
  grit_consumed: '孤胆赌徒勇气释放',
  boss_counter_attack: '地牢首领反扑',

  // Scheme 3: Jackpot TD
  high_card: '散牌齐射',
  one_pair: '对子升星 (二星 ★★)',
  two_pair: '双对联装 (双二星 ★★)',
  three_of_a_kind: '三连冰冻 (★★★ + 4秒冰封)',
  full_house: '满堂彩葫芦 (★★★ + ★★)',
  small_straight: '四顺狂暴激光 (5秒洗地)',
  four_of_a_kind: '四连轨道炮 (冰封+激光)',
  large_straight: '五顺狂暴激光 (5秒洗地)',
  yahtzee_five: '五连核弹 (Yahtzee 核爆洗地)',
  clutch_freeze_4s: '4秒全屏绝境冰封',
  hyper_laser_sweep_5s: '5秒狂暴激光洗地',
  yahtzee_tactical_nuke: '五连战术核弹清屏',
  overheat_scrap_pull: '缺钱过热强拉',
  red_zone_adrenaline: '红区绝境肾上腺素',

  // Scheme 4: Sigil Pachinko
  mid_air_orb_fusion: '半空炼金法球吞噬融合',
  crucible_jackpot_25x: '×25 深渊核心坩埚大奖',
  chaos_tilt_overdrive: '狂暴摇台 ×2.0 引力汇聚',

  // Scheme 5: Abyssal Grid
  full_matrix_blackout_10_lines: '十线全通·深渊神罚',
  single_bingo_line: '单线 Bingo 集火齐射',
  early_fire_compound_bank: '提前开火结余存息',
  commander_ascension: '统帅晋升合体',
});

const RARITY_TIER_MAP = Object.freeze({
  common: 2,
  rare: 3,
  epic: 4,
  mythic: 4,
});

const PROTOTYPE_KEY_SET = new Set([
  'constructor',
  'tostring',
  'valueof',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  'tolocalestring',
  '__proto__',
  '__definegetter__',
  '__definesetter__',
  '__lookupgetter__',
  '__lookupsetter__',
  'prototype',
]);

const BOSS_ZH_MAP = Object.freeze({
  battering_ram: '攻城木槌车',
  iron_phalanx: '黑铁盾墙阵',
  alchemical_trebuchet: '炼金投石巨兽',
  steam_siege_tower: '蒸汽攻城塔',
  abyssal_siege_drake: '深渊破城龙',
  golden_titan_colossus: '黄金泰坦巨像',
  necro_bone_citadel: '冥界骸骨要塞',
  omega_siege_dreadnought: '神罚天穹母舰·奥米茄',
  dungeon_gate_skeleton: '地牢看守骸骨',
  twin_headed_hound: '双头猎犬',
  iron_maiden_executioner: '铁处女行刑官',
  vampire_archduke: '血族大公爵',
  powder_mad_alchemist: '黑火药炼金狂人',
  abyssal_croupier: '深渊赌局荷官',
  six_armed_hell_general: '炼狱六臂魔将',
  revolver_archfiend_azazel: '深渊左轮魔神·阿撒兹勒',
  wave_1_drill_foreman: '锈铁钻探工头',
  wave_2_armored_mole: '重甲穿山巨兽',
  wave_3_magma_crusher: '熔岩碎石机甲',
  wave_4_cryo_behemoth: '永冻深渊猛犸',
  wave_5_thunder_colossus: '雷霆矿脉泰坦',
  wave_6_void_excavator: '虚空掘星母舰',
  wave_7_nuclear_wyrm: '裂变地心魔龙',
  wave_8_jackpot_overlord: '黄金深渊主宰',
  pachinko_boss_1: '炼金泥偶守卫',
  pachinko_boss_2: '赤铜齿轮巨像',
  pachinko_boss_3: '水银秘仪奇美拉',
  pachinko_boss_4: '咒印熔炉魔神',
  pachinko_boss_5: '虚空引力大主教',
  pachinko_boss_6: '星界万有引力龙',
  pachinko_boss_7: '深渊翠玉录古神',
  pachinko_boss_8: '贤者终焉造物主',
  grid_boss_1: '深渊矩阵哨卫',
  grid_boss_2: '黑曜棋盘战车',
  grid_boss_3: '四维裂隙主教',
  grid_boss_4: '推运钢铁暴君',
  grid_boss_5: '百眼战棋督军',
  grid_boss_6: '星轨矩阵母体',
  grid_boss_7: '维度坍缩古龙',
  grid_boss_8: '十线全通神罚者',
});

function safeNum(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number' || typeof val === 'bigint') return sanitizeNumber(val, fallback);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? sanitizeNumber(trimmed, fallback) : fallback;
  }
  return fallback;
}

function stripLeadingEmoji(text = '') {
  return safeToString(text)
    .replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/gu, '')
    .trim();
}

function stripTaintedTokens(text = '') {
  return safeToString(text)
    .replace(/function\s*[a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{\s*\[native code\]\s*\}/gi, '')
    .replace(/\[native code\]/gi, '')
    .replace(/\b(?:undefined|NaN)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeSafeText(text = '') {
  return stripTaintedTokens(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

function extractValidRelicId(r) {
  if (typeof r === 'string') {
    const trimmed = r.replace(/[<>"']/g, '').trim();
    return trimmed.length > 0 ? trimmed : '';
  }
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const rawId = safeToString(r.id ?? r.relicId)
      .replace(/[<>"']/g, '')
      .trim();
    return rawId.length > 0 ? rawId : '';
  }
  return '';
}

function localizeEnemyName(rawEnemyName) {
  const cleaned = stripLeadingEmoji(stripTaintedTokens(rawEnemyName));
  if (!cleaned) return '攻城首领';
  const lower = cleaned.toLowerCase();
  if (Object.hasOwn(BOSS_ZH_MAP, lower)) {
    return BOSS_ZH_MAP[lower];
  }
  if (PROTOTYPE_KEY_SET.has(lower)) {
    return '攻城首领';
  }
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    const noSnake = cleaned.replace(/^[a-z0-9]+(?:_[a-z0-9]+)+\s*/i, '').trim();
    return stripLeadingEmoji(noSnake) || '攻城首领';
  }
  if (cleaned.includes('_')) {
    return '攻城首领';
  }
  return cleaned;
}

/**
 * Converts any raw engine synergy string (`'fireball_powder_keg (...)'`, `'EARLY_FIRE_COMPOUND_BANK'`, etc.)
 * into clean localized Chinese text with zero raw `snake_case` identifiers.
 * @param {any} raw
 * @returns {string}
 */
export function localizeSynergy(raw) {
  if (raw === null || raw === undefined || typeof raw === 'function') return '';
  const extracted =
    raw && typeof raw === 'object'
      ? safeToString(raw) || safeToString(raw.zhName) || safeToString(raw.name)
      : safeToString(raw);
  const cleaned = stripTaintedTokens(extracted);
  if (!cleaned) return '';

  // 1. Handle `id (Chinese detail: English...)` emitted by engines
  const wrappedMatch = /^([a-z0-9_]+)\s*\((.+)\)$/i.exec(cleaned);
  if (wrappedMatch) {
    const key = wrappedMatch[1].toLowerCase();
    const inner = stripLeadingEmoji(wrappedMatch[2]);
    const mapped = Object.hasOwn(SYNERGY_ZH_MAP, key) ? SYNERGY_ZH_MAP[key] : null;
    if (/[\u4e00-\u9fff]/.test(inner)) {
      const beforeColon = inner.split(':')[0].trim();
      const hasDynamicNum = /[+×]\s*\d|\d+\s*(?:HP|空仓|发|层)/i.test(beforeColon);
      if (hasDynamicNum) {
        return beforeColon;
      }
      return mapped || beforeColon;
    }
    if (typeof mapped === 'string' && mapped) return mapped;
    if (PROTOTYPE_KEY_SET.has(key) || key.includes('_')) return '连锁共鸣触发';
  }

  // 2. Direct dictionary lookup (strictly own properties)
  const lowerKey = cleaned.toLowerCase();
  if (Object.hasOwn(SYNERGY_ZH_MAP, lowerKey)) {
    return SYNERGY_ZH_MAP[lowerKey];
  }
  if (PROTOTYPE_KEY_SET.has(lowerKey)) {
    return '连锁共鸣触发';
  }

  // 3. Parameterized uppercase engine tokens
  let m = /^STAR_MERGE_(\d+)X$/i.exec(cleaned);
  if (m) return `炮台升至 ${m[1]}星`;
  m = /^PEDESTAL_AUTO_DEVOUR_(\d+)$/i.exec(cleaned);
  if (m) return `底座吞噬 +${m[1]}层`;
  m = /^ORTHOGONAL_CROSS_DEVOUR_(\d+)$/i.exec(cleaned);
  if (m) return `十字统帅吞噬 ×${m[1]}`;
  m = /^CROSS_BINGO_(\d+)_LINES$/i.exec(cleaned);
  if (m) return `${m[1]}线交叉 Bingo 齐射`;

  // 4. Preserve existing Chinese strings (stripping any leading snake_case prefix or leading emoji)
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    const noSnake = cleaned.replace(/^[a-z]+(?:_[a-z0-9]+)+\s*/i, '');
    return stripLeadingEmoji(noSnake) || stripLeadingEmoji(cleaned);
  }

  // 5. Fallback for any unknown snake_case identifier so underscores never leak into DOM
  if (cleaned.includes('_')) {
    return '连锁共鸣触发';
  }

  return stripLeadingEmoji(cleaned);
}

/**
 * Localizes an array of synergy strings, deduplicating empty/identical entries.
 * @param {any[]} [list=[]]
 * @returns {string[]}
 */
export function localizeSynergies(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const zh = localizeSynergy(item);
    if (zh && !seen.has(zh)) {
      seen.add(zh);
      out.push(zh);
    }
  }
  return out;
}

/**
 * Localizes a turn's primary `comboName` while preserving exact Chinese phrases expected by tests.
 * @param {any} rawCombo
 * @param {any[]} [triggeredSynergies=[]]
 * @returns {string}
 */
export function localizeComboName(rawCombo, triggeredSynergies = []) {
  const localized = localizeSynergy(rawCombo);
  if (localized && localized !== '常规战阵齐射') {
    return localized;
  }
  const synList = localizeSynergies(triggeredSynergies);
  if (synList.length > 0) {
    return synList[0];
  }
  return localized || '待命：按下拉杆开战';
}

export class HUDController {
  constructor(containerEl = null) {
    this.containerEl = null;
    this.state = {
      wave: 1,
      maxWaves: 8,
      endlessMode: false,
      enemyName: '攻城首领',
      enemyHp: 120,
      enemyMaxHp: 120,
      prevEnemyHpPct: 100,
      pullsRemaining: 5,
      maxPullsPerWave: 5,
      gold: 100,
      interestRate: 0.25,
      greedMultiplier: 1.0,
      basePoints: 0,
      baseChips: 0,
      lineMultiplier: 1.0,
      lineMult: 1.0,
      devourStacks: 0,
      devourStacksMultiplier: 1.0,
      chainSynergyMultiplier: 1.0,
      totalDamage: 0,
      formattedDamage: '0',
      formattedChineseDamage: '0',
      comboName: '待命：按下拉杆开战',
      triggeredSynergies: [],
      relics: [],
      intensityTier: 0,
    };

    if (containerEl) {
      this.mount(containerEl);
    }
  }

  /**
   * Mounts the Balatro-style HUD banner inside `containerEl`.
   * @param {HTMLElement|object} containerEl
   */
  mount(containerEl) {
    if (!containerEl) return this;
    this.containerEl = containerEl;
    this.render();
    return this;
  }

  unmount() {
    if (this.containerEl && typeof this.containerEl.innerHTML !== 'undefined') {
      this.containerEl.innerHTML = '';
    }
    this.containerEl = null;
  }

  /**
   * Normalizes and applies a game state or formula breakdown snapshot to the HUD.
   * @param {object} snapshot
   */
  update(snapshot = {}) {
    if (!snapshot || typeof snapshot !== 'object') return this.getState();

    const formula =
      (snapshot.lastTurnBreakdown && typeof snapshot.lastTurnBreakdown === 'object'
        ? snapshot.lastTurnBreakdown
        : null) ||
      (snapshot.lastFormula && typeof snapshot.lastFormula === 'object' ? snapshot.lastFormula : null) ||
      snapshot;

    const prevHpPct = Math.min(
      100,
      Math.max(0, Math.round((this.state.enemyHp / Math.max(1, this.state.enemyMaxHp)) * 100))
    );

    const wave = Math.max(1, Math.floor(safeNum(snapshot.wave ?? this.state.wave, 1)));
    const maxWaves = Math.max(1, Math.floor(safeNum(snapshot.maxWaves ?? this.state.maxWaves, 8)));
    const endlessMode = Boolean(snapshot.endlessMode ?? (wave > maxWaves ? true : this.state.endlessMode));

    const enemyMaxHp = Math.max(
      1,
      safeNum(snapshot.enemyMaxHp ?? snapshot.bossMaxHp ?? this.state.enemyMaxHp, 120)
    );
    const enemyHp = Math.max(
      0,
      safeNum(snapshot.enemyHp ?? snapshot.bossHp ?? this.state.enemyHp, enemyMaxHp)
    );
    const maxPullsPerWave = Math.max(
      1,
      Math.floor(safeNum(snapshot.maxPullsPerWave ?? this.state.maxPullsPerWave, 5))
    );
    const pullsRemaining = Math.max(
      0,
      Math.floor(
        safeNum(
          snapshot.pullsRemaining ?? snapshot.pullsLeft ?? snapshot.spinsRemaining ?? this.state.pullsRemaining,
          5
        )
      )
    );
    const gold = Math.max(0, Math.floor(safeNum(snapshot.gold ?? this.state.gold, 100)));
    const interestRate = Math.max(
      0,
      safeNum(snapshot.interestRate ?? this.state.interestRate, 0.25)
    );
    const greedMultiplier = Math.max(
      0.1,
      safeNum(
        formula.greedMultiplier ?? snapshot.greedMultiplier ?? this.state.greedMultiplier,
        1.0
      )
    );

    const basePoints = Math.max(
      0,
      safeNum(formula.basePoints ?? formula.baseChips ?? this.state.basePoints, 0)
    );
    const lineMultiplier = Math.max(
      0,
      safeNum(formula.lineMultiplier ?? formula.lineMult ?? this.state.lineMultiplier, 1.0)
    );
    const devourStacks = Math.max(
      0,
      Math.floor(safeNum(formula.devourStacks ?? this.state.devourStacks, 0))
    );
    const devourStacksMultiplier = Math.max(
      0,
      safeNum(
        formula.devourStacksMultiplier ?? formula.devourMultiplier ?? this.state.devourStacksMultiplier,
        1.0
      )
    );
    const chainSynergyMultiplier = Math.max(
      0,
      safeNum(
        formula.chainSynergyMultiplier ?? formula.chainBonusMult ?? this.state.chainSynergyMultiplier,
        1.0
      )
    );
    const totalDamage = Math.max(
      0,
      Math.floor(safeNum(formula.totalDamage ?? formula.finalDamage ?? this.state.totalDamage, 0))
    );

    const rawSynergies = Array.isArray(formula.triggeredSynergies)
      ? formula.triggeredSynergies
      : Array.isArray(snapshot.triggeredSynergies)
        ? snapshot.triggeredSynergies
        : [];
    const triggeredSynergies = localizeSynergies(rawSynergies);

    const rawCombo = formula.comboName ?? snapshot.comboName ?? this.state.comboName ?? 'READY TO SPIN';
    const comboName = localizeComboName(rawCombo, rawSynergies);

    const rawTier =
      formula.intensityTier !== undefined
        ? safeNum(formula.intensityTier, 0)
        : getIntensityTier(totalDamage);
    const intensityTier = Math.max(0, Math.min(4, Math.floor(rawTier)));

    const rawEnemyName =
      snapshot.enemyName ??
      snapshot.bossName ??
      snapshot.boss?.zhName ??
      snapshot.boss?.name ??
      snapshot.boss?.id ??
      this.state.enemyName;
    const enemyName = localizeEnemyName(rawEnemyName);

    const rawRelics = Array.isArray(snapshot.relics)
      ? snapshot.relics
      : Array.isArray(snapshot.ownedRelics)
        ? snapshot.ownedRelics
        : Array.isArray(snapshot.economy?.relics)
          ? snapshot.economy.relics
          : this.state.relics;
    const validRelics = Array.isArray(rawRelics)
      ? rawRelics.filter((r) => extractValidRelicId(r).length > 0)
      : [];

    this.state = {
      ...this.state,
      wave,
      maxWaves,
      endlessMode,
      enemyName,
      enemyHp,
      enemyMaxHp,
      prevEnemyHpPct: prevHpPct,
      pullsRemaining,
      maxPullsPerWave: Math.max(maxPullsPerWave, pullsRemaining),
      gold,
      interestRate,
      greedMultiplier: Number(greedMultiplier.toFixed(2)),
      basePoints,
      baseChips: basePoints,
      lineMultiplier: Number(lineMultiplier.toFixed(2)),
      lineMult: Number(lineMultiplier.toFixed(2)),
      devourStacks,
      devourStacksMultiplier: Number(devourStacksMultiplier.toFixed(2)),
      chainSynergyMultiplier: Number(chainSynergyMultiplier.toFixed(2)),
      totalDamage,
      formattedDamage: formatBigNumber(totalDamage),
      formattedChineseDamage: formatChineseNumber(totalDamage),
      comboName,
      triggeredSynergies,
      relics: validRelics,
      intensityTier,
    };

    this.render();
    return this.getState();
  }

  /**
   * Renders all required 5-factor & economy `data-testid` HUD elements inside `this.containerEl`.
   */
  render() {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const s = this.state;
    const hpPct = Math.min(100, Math.max(0, Math.round((s.enemyHp / Math.max(1, s.enemyMaxHp)) * 100)));
    const ghostPct = Math.max(hpPct, Math.min(100, s.prevEnemyHpPct || hpPct));
    const interestPct = Math.round(s.interestRate * 100);
    const waveLabel =
      s.endlessMode || s.wave > s.maxWaves
        ? `Wave ${s.wave} · 无尽`
        : `Wave ${s.wave} / ${s.maxWaves}`;

    const totalPips = Math.min(8, Math.max(1, s.maxPullsPerWave || 5));
    const activePips = Math.min(totalPips, s.pullsRemaining);
    let pipsHtml = '';
    for (let i = 0; i < totalPips; i++) {
      pipsHtml += `<span class="hud-pull-pip ${i < activePips ? 'is-active' : ''}"></span>`;
    }

    const validRelics = Array.isArray(s.relics)
      ? s.relics.filter((r) => extractValidRelicId(r).length > 0)
      : [];
    const relicsHtml =
      validRelics.length > 0
        ? validRelics
            .map((r) => {
              const id = extractValidRelicId(r);
              const catalogHit = Array.isArray(DEFAULT_RELIC_CATALOG)
                ? DEFAULT_RELIC_CATALOG.find((c) => c && Object.hasOwn(c, 'id') && c.id === id)
                : null;
              const objName =
                r && typeof r === 'object' ? stripTaintedTokens(r.zhName ?? r.name) : '';
              const catName = stripTaintedTokens(catalogHit?.name);
              const rawTitle = (objName || catName || '深渊秘宝遗物').replace(/[<>"']/g, '').trim();
              const cleanTitle =
                !rawTitle || rawTitle.includes('_') || PROTOTYPE_KEY_SET.has(rawTitle.toLowerCase())
                  ? '深渊秘宝遗物'
                  : rawTitle;
              const safeTitle = escapeSafeText(cleanTitle) || '深渊秘宝遗物';
              const rawRarity =
                (r && typeof r === 'object' ? safeToString(r.rarity) : '') ||
                safeToString(catalogHit?.rarity) ||
                'common';
              const rarityKey = rawRarity.trim().toLowerCase();
              const tier = Object.hasOwn(RARITY_TIER_MAP, rarityKey)
                ? RARITY_TIER_MAP[rarityKey]
                : 2;
              return `<span class="hud-relic-badge" data-relic-id="${escapeSafeText(id)}" title="${safeTitle}">${renderSprite(id, { size: 20, tier, className: 'hud-relic-svg' })}</span>`;
            })
            .join('')
        : '<span class="hud-relic-empty">尚无遗物</span>';

    const synergyPillsHtml = (s.triggeredSynergies || [])
      .filter((txt) => txt !== s.comboName)
      .slice(0, 2)
      .map((txt) => `<span class="hud-synergy-pill">${escapeSafeText(txt)}</span>`)
      .join('');

    this.containerEl.innerHTML = `
      <div class="hud-banner" data-intensity-tier="${s.intensityTier}">
        <div class="hud-top-row">
          <div class="hud-stat-card hud-wave-card" data-testid="hud-wave">
            <span class="hud-label">波次进度 WAVE</span>
            <strong class="hud-value">${escapeSafeText(waveLabel)}</strong>
          </div>

          <div class="hud-stat-card hud-enemy-card" data-testid="hud-enemy-hp">
            <div class="hud-enemy-header">
              <span class="hud-label">${escapeSafeText(s.enemyName)}</span>
              <strong class="hud-value">${formatBigNumber(s.enemyHp)} / ${formatBigNumber(s.enemyMaxHp)} HP</strong>
            </div>
            <div class="hud-hp-bar-track">
              <div class="hud-hp-bar-ghost" style="width: ${ghostPct}%"></div>
              <div class="hud-hp-bar-fill" style="width: ${hpPct}%"></div>
            </div>
          </div>

          <div class="hud-stat-card hud-pulls-card" data-testid="hud-pulls-left">
            <span class="hud-label">剩余拉杆 PULLS</span>
            <div class="hud-pulls-row">
              <strong class="hud-value">${s.pullsRemaining} 杆</strong>
              <span class="hud-pull-pips" aria-hidden="true">${pipsHtml}</span>
            </div>
          </div>

          <div class="hud-stat-card hud-gold-card" data-testid="hud-gold">
            <span class="hud-label">赌狗金库 (+${interestPct}% 复利)</span>
            <strong class="hud-value">${s.gold}G · 贪婪 ×${s.greedMultiplier}</strong>
          </div>

          <div class="hud-stat-card hud-relics-card">
            <span class="hud-label">遗物构筑 (${validRelics.length})</span>
            <div class="hud-relic-strip" data-testid="hud-relic-strip">${relicsHtml}</div>
          </div>
        </div>

        <div class="hud-formula-bar" data-testid="hud-formula-breakdown">
          <div class="hud-formula-equation">
            <div class="hud-chip-box hud-box-chips" data-testid="hud-base-chips" title="基础筹码 Base Chips">
              <span class="box-caption">基础 CHIPS</span>
              <strong class="box-number">${formatBigNumber(s.baseChips)}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-mult" data-testid="hud-line-mult" title="连线牌型倍率 Line Mult">
              <span class="box-caption">连线 LINE</span>
              <strong class="box-number">×${s.lineMult}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-devour" data-testid="hud-devour-stacks" title="吞噬层数倍率 Devour Mult">
              <span class="box-caption">吞噬 (${s.devourStacks}层)</span>
              <strong class="box-number">×${s.devourStacksMultiplier}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-chain" data-testid="hud-chain-mult" title="连锁反应倍率 Chain Mult">
              <span class="box-caption">连锁 CHAIN</span>
              <strong class="box-number">×${s.chainSynergyMultiplier}</strong>
            </div>
            <span class="formula-op">×</span>
            <div class="hud-chip-box hud-box-greed" data-testid="hud-greed-mult" title="赌狗贪婪倍率 Greed Mult">
              <span class="box-caption">贪婪 GREED</span>
              <strong class="box-number">×${s.greedMultiplier}</strong>
            </div>
            <span class="formula-op">=</span>
            <div
              class="hud-chip-box hud-box-total"
              data-testid="hud-total-damage"
              data-intensity-tier="${s.intensityTier}"
              title="本轮最终爆发总伤害 Total Damage"
            >
              <span class="box-caption">总伤 (${escapeSafeText(s.formattedChineseDamage)})</span>
              <strong class="box-number">${escapeSafeText(s.formattedDamage)}</strong>
            </div>
          </div>
          <div class="hud-combo-cluster">
            <div class="hud-combo-banner" data-testid="hud-combo-name">${escapeSafeText(s.comboName)}</div>
            ${synergyPillsHtml}
          </div>
        </div>
      </div>
    `;
  }

  getState() {
    return { ...this.state };
  }
}

export function createHUDController(containerEl = null) {
  return new HUDController(containerEl);
}

export default HUDController;
