/**
 * Procedural Multi-Layered SVG Artwork & Boss Portrait Forge (`F-R2-01`, `PROJECT.md § 6.1`)
 * Zero external assets, zero raw OS emojis, zero duplicate `<defs>` IDs, and 100% `MockElement`-safe:
 *  1. Every childless SVG primitive (`<path />`, `<circle />`, `<rect />`, `<polygon />`, `<polyline />`, `<line />`, `<ellipse />`)
 *     explicitly self-closes with `/>`.
 *  2. Zero `<text>` nodes inside `<svg>` (preserving clean `element.textContent` in cards/HUD).
 *  3. Zero literal `>` characters inside any HTML/SVG attribute value.
 *  4. Strictly Obsidian, Brushed Brass, Crimson, Molten Amber, Sapphire & Alchemical Jade palette (zero purple).
 */

export const TIER_FRAME_PALETTE = Object.freeze({
  0: Object.freeze({ rim: '#5a4d41', inner: '#14110f', well: '#0d0b09', glow: '#8a7968', accent: '#9c8b7a' }),
  1: Object.freeze({ rim: '#9aa5b1', inner: '#1b1613', well: '#100d0b', glow: '#cbd2d9', accent: '#e4e7eb' }),
  2: Object.freeze({ rim: '#2ec4f1', inner: '#111d24', well: '#0a1217', glow: '#72ddf7', accent: '#06d6a0' }),
  3: Object.freeze({ rim: '#f77f00', inner: '#24150d', well: '#140c08', glow: '#fcbf49', accent: '#ef476f' }),
  4: Object.freeze({ rim: '#ffd166', inner: '#291a0c', well: '#160e07', glow: '#fff3b0', accent: '#ef476f' }),
});

const FALLBACK_PALETTE = Object.freeze([
  '#ef476f',
  '#f77f00',
  '#ffd166',
  '#06d6a0',
  '#2ec4f1',
  '#c89b3c',
]);

const ENTITY_ID_KEYS = Object.freeze([
  'id',
  'symbolId',
  'bulletId',
  'orbId',
  'unitId',
  'relicId',
  'towerId',
  'pegId',
  'type',
]);

/**
 * Safely coerces any arbitrary value (including `Object.create(null)`, entity objects,
 * numbers, `Symbol`, `Function`, `null`, `undefined`) to a clean string without ever throwing.
 * @param {any} val
 * @returns {string}
 */
export function safeToString(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
  if (typeof val === 'boolean' || typeof val === 'bigint') return String(val);
  if (typeof val === 'symbol') return val.description ? String(val.description) : '';
  if (typeof val === 'function') return '';
  if (typeof val === 'object') {
    for (const key of ENTITY_ID_KEYS) {
      try {
        const prop = val[key];
        if (typeof prop === 'string' && prop.trim().length > 0) {
          return prop;
        }
        if (typeof prop === 'number' && Number.isFinite(prop)) {
          return String(prop);
        }
      } catch {
        // Ignore hostile getters
      }
    }
    try {
      if (typeof val.toString === 'function' && val.toString !== Object.prototype.toString) {
        const str = val.toString();
        if (typeof str === 'string' && !str.startsWith('[object ')) {
          return str;
        }
      }
    } catch {
      // Ignore Object.create(null) or throwing custom toString
    }
    return '';
  }
  return '';
}

function safeAttr(val = '') {
  return safeToString(val)
    .replace(/[<>"'&\p{Extended_Pictographic}\uFE0F]/gu, '')
    .trim();
}

function compactSvg(rawSvg) {
  return safeToString(rawSvg).replace(/>\s+</g, '><').trim();
}

/**
 * Deterministic 32-bit FNV-1a string hash.
 * @param {any} [str='']
 * @returns {number}
 */
export function hashSpriteId(str = '') {
  const s = safeToString(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ALIAS_MAP = Object.freeze({
  // Scheme 1
  maw: 'abyssal_maw',
  central_maw: 'abyssal_maw',
  // Scheme 2
  spindle: 'revolver_spindle',
  spent_casing: 'smoking_casing',
  // Scheme 4 Pegs
  fire_peg: 'peg_ember',
  ember: 'peg_ember',
  lightning_peg: 'peg_volt',
  volt: 'peg_volt',
  gold_peg: 'peg_gold',
  gold: 'peg_gold',
  gluttony_peg: 'peg_glutton',
  glutton: 'peg_glutton',
  // Scheme 4 Crucibles
  crucible_left_outer: 'crucible',
  crucible_right_outer: 'crucible',
  crucible_2x: 'crucible',
  crucible_left_inner: 'crucible_5x',
  crucible_right_inner: 'crucible_5x',
  crucible_center_jackpot: 'crucible_jackpot',
  jackpot_crucible: 'crucible_jackpot',
  // Scheme 5 Units
  skeleton: 'skeleton_pawn',
  mimic_chest: 'gold_mimic',
});

/**
 * Normalizes any entity/peg/crucible/unit/relic ID across all 5 schemes and `PROJECT.md § 6.1`.
 * Disambiguates `'empty'` between Scheme 2 (`'empty_chamber'`) and Scheme 5 (`'empty_cell'`).
 * @param {string} rawId
 * @param {object} [options={}]
 * @returns {string}
 */
export function normalizeSpriteId(rawId, options = {}) {
  const raw = safeToString(rawId).trim().toLowerCase();
  if (!raw) return 'unknown_sigil';

  if (raw === 'empty') {
    return options?.schemeId === 'abyssal-grid' ? 'empty_cell' : 'empty_chamber';
  }

  const pegMatch = /^peg_(\d+)$/.exec(raw);
  if (pegMatch) {
    const cycle = ['peg_ember', 'peg_volt', 'peg_gold', 'peg_glutton'];
    const idx = Number(pegMatch[1]);
    return cycle[Number.isFinite(idx) ? idx % 4 : 0];
  }

  return Object.hasOwn(ALIAS_MAP, raw) ? ALIAS_MAP[raw] : raw;
}

const DEFAULT_TIER_BY_ID = Object.freeze({
  // Scheme 1
  goblin: 1,
  chest: 1,
  powder_keg: 1,
  curse_skull: 1,
  iron_knight: 2,
  fireball: 2,
  digestive_herb: 2,
  hero_berserker: 3,
  abyss_apostle: 4,
  abyssal_maw: 4,
  // Scheme 2
  empty_chamber: 0,
  smoking_casing: 1,
  lead_bullet: 1,
  vampire_bullet: 2,
  scatter_bullet: 2,
  powder_charge: 2,
  fuse_cord: 2,
  parasite_bullet: 3,
  heavy_hammer: 3,
  demon_bullet: 4,
  revolver_spindle: 3,
  // Scheme 3
  miner_pick: 1,
  gold_nugget: 1,
  cryo_prism: 2,
  tesla_coil: 3,
  prism_laser: 3,
  nuke_core: 4,
  gob_runner: 1,
  shield_bearer: 2,
  tunnel_berserker: 3,
  siege_dreadnought: 4,
  // Scheme 4
  ember_orb: 1,
  gold_droplet: 1,
  frost_core: 1,
  lightning_sphere: 2,
  gold_stone: 2,
  volatile_mercury: 2,
  void_glutton_orb: 3,
  void_singularity: 4,
  philosopher_stone: 4,
  peg_ember: 2,
  peg_volt: 2,
  peg_gold: 2,
  peg_glutton: 3,
  crucible: 1,
  crucible_5x: 3,
  crucible_jackpot: 4,
  // Scheme 5
  empty_cell: 0,
  skeleton_pawn: 1,
  slime_blob: 1,
  mana_crystal: 1,
  gold_mimic: 1,
  imp_scout: 1,
  cursed_urn: 1,
  abyssal_knight: 2,
  blood_archmage: 3,
  soul_cannon: 3,
  void_reaper: 3,
  golden_overlord: 4,
  // Relics
  greed_ledger: 2,
  gluttony_jaw: 2,
  acid_reflux_core: 3,
  pyro_catalyst: 3,
  russian_roulette_coin: 3,
  compound_vault: 4,
  chronos_lever: 4,
  abyssal_crown: 4,
});

function renderMedallionFrame(frame, tierNum) {
  const cornerGlow =
    tierNum >= 3
      ? `<polygon points="32,3 35,8 29,8" fill="${frame.glow}" /><polygon points="32,61 35,56 29,56" fill="${frame.glow}" />`
      : '';
  return (
    `<rect x="4" y="4" width="56" height="56" rx="13" fill="${frame.inner}" stroke="${frame.rim}" stroke-width="2.2" />` +
    `<rect x="8" y="8" width="48" height="48" rx="9" fill="${frame.well}" stroke="#3b2e22" stroke-width="1" />` +
    cornerGlow
  );
}

const SPRITE_RECIPES = Object.freeze({
  // ================= SCHEME 1: DEVOUR REELS =================
  goblin: () =>
    '<polygon points="8,24 20,20 18,33" fill="#4f772d" stroke="#90a955" stroke-width="1.5" />' +
    '<polygon points="56,24 44,20 46,33" fill="#4f772d" stroke="#90a955" stroke-width="1.5" />' +
    '<ellipse cx="32" cy="34" rx="15" ry="14" fill="#6a994e" stroke="#a7c957" stroke-width="1.6" />' +
    '<polygon points="22,29 29,32 23,34" fill="#ef476f" />' +
    '<polygon points="42,29 35,32 41,34" fill="#ef476f" />' +
    '<path d="M23,41 L41,41 L38,45 L26,45 Z" fill="#16110e" />' +
    '<polygon points="25,44 27,39 29,44" fill="#f7f1e5" />' +
    '<polygon points="35,44 37,39 39,44" fill="#f7f1e5" />' +
    '<circle cx="32" cy="37" r="2.4" fill="none" stroke="#ffd166" stroke-width="1.5" />',

  chest: () =>
    '<rect x="13" y="25" width="38" height="24" rx="3" fill="#5c3a21" stroke="#c89b3c" stroke-width="2" />' +
    '<path d="M13,26 C13,16 51,16 51,26 Z" fill="#7f4f24" stroke="#f3cf7a" stroke-width="2" />' +
    '<rect x="12" y="25" width="40" height="4" fill="#ffd166" />' +
    '<rect x="20" y="18" width="4" height="31" fill="#c89b3c" />' +
    '<rect x="40" y="18" width="4" height="31" fill="#c89b3c" />' +
    '<rect x="28" y="23" width="8" height="10" rx="2" fill="#f3cf7a" stroke="#5a4114" stroke-width="1.4" />' +
    '<circle cx="32" cy="28" r="1.8" fill="#14100d" />',

  powder_keg: () =>
    '<path d="M20,16 L44,16 C49,26 49,38 44,50 L20,50 C15,38 15,26 20,16 Z" fill="#332924" stroke="#9aa5b1" stroke-width="1.8" />' +
    '<rect x="17" y="22" width="30" height="3.5" rx="1" fill="#8d99ae" />' +
    '<rect x="17" y="40" width="30" height="3.5" rx="1" fill="#8d99ae" />' +
    '<polygon points="32,26 40,33 32,40 24,33" fill="#ef476f" stroke="#ffd166" stroke-width="1.4" />' +
    '<path d="M32,16 C33,11 38,10 41,12" fill="none" stroke="#f3cf7a" stroke-width="2" />' +
    '<polygon points="42,8 44,12 48,12 45,14 46,18 42,15 39,17 40,13" fill="#ffd166" />',

  curse_skull: () =>
    '<path d="M18,22 C12,14 14,9 21,13" fill="none" stroke="#c89b3c" stroke-width="3" />' +
    '<path d="M46,22 C52,14 50,9 43,13" fill="none" stroke="#c89b3c" stroke-width="3" />' +
    '<path d="M20,28 C20,16 44,16 44,28 C44,35 40,38 39,46 L25,46 C24,38 20,35 20,28 Z" fill="#e5dccb" stroke="#8a7968" stroke-width="1.6" />' +
    '<circle cx="27" cy="29" r="4" fill="#06d6a0" />' +
    '<circle cx="37" cy="29" r="4" fill="#06d6a0" />' +
    '<polygon points="32,33 29.5,38 34.5,38" fill="#171310" />' +
    '<line x1="28" y1="41" x2="28" y2="46" stroke="#171310" stroke-width="1.8" />' +
    '<line x1="32" y1="41" x2="32" y2="46" stroke="#171310" stroke-width="1.8" />' +
    '<line x1="36" y1="41" x2="36" y2="46" stroke="#171310" stroke-width="1.8" />',

  iron_knight: () =>
    '<path d="M16,14 L48,14 L48,32 C48,44 38,51 32,55 C26,51 16,44 16,32 Z" fill="#4a5568" stroke="#cbd2d9" stroke-width="2.2" />' +
    '<path d="M21,19 L43,19 L43,31 C43,40 36,46 32,49 C28,46 21,40 21,31 Z" fill="#1f2933" />' +
    '<rect x="30" y="18" width="4" height="30" fill="#f3cf7a" />' +
    '<rect x="21" y="28" width="22" height="4" fill="#f3cf7a" />' +
    '<rect x="24" y="23" width="16" height="3" rx="1" fill="#2ec4f1" />',

  fireball: () =>
    '<path d="M32,9 C44,18 51,28 47,41 C44,50 37,55 32,55 C24,55 16,48 17,37 C18,27 26,22 32,9 Z" fill="#ef476f" />' +
    '<path d="M32,17 C40,24 44,32 41,42 C39,48 35,51 32,51 C27,51 22,46 23,39 C24,31 28,27 32,17 Z" fill="#f77f00" />' +
    '<circle cx="32" cy="40" r="7.5" fill="#ffd166" />' +
    '<circle cx="32" cy="41" r="3.8" fill="#fff9db" />',

  digestive_herb: () =>
    '<path d="M32,49 L32,20" stroke="#c89b3c" stroke-width="2.5" />' +
    '<path d="M32,36 C20,36 14,26 18,18 C26,18 32,26 32,36 Z" fill="#06d6a0" stroke="#9bf6ff" stroke-width="1.3" />' +
    '<path d="M32,36 C44,36 50,26 46,18 C38,18 32,26 32,36 Z" fill="#06d6a0" stroke="#9bf6ff" stroke-width="1.3" />' +
    '<path d="M32,28 C26,20 28,11 32,9 C36,11 38,20 32,28 Z" fill="#38b000" stroke="#ffd166" stroke-width="1.3" />' +
    '<circle cx="26" cy="43" r="3.6" fill="#ffd166" />' +
    '<circle cx="38" cy="43" r="3.6" fill="#ffd166" />',

  hero_berserker: () =>
    '<polygon points="32,12 46,24 41,46 23,46 18,24" fill="#3b161b" stroke="#c89b3c" stroke-width="2" />' +
    '<line x1="14" y1="50" x2="48" y2="16" stroke="#ef476f" stroke-width="4.5" />' +
    '<polygon points="49,13 52,19 45,17" fill="#ffd166" />' +
    '<line x1="50" y1="50" x2="16" y2="16" stroke="#f77f00" stroke-width="4.5" />' +
    '<polygon points="15,13 19,17 12,19" fill="#ffd166" />' +
    '<circle cx="32" cy="33" r="6" fill="#f3cf7a" stroke="#5c0c1a" stroke-width="2" />',

  abyss_apostle: () =>
    '<path d="M12,32 C20,18 44,18 52,32 C44,46 20,46 12,32 Z" fill="#2c1116" stroke="#ffd166" stroke-width="2.2" />' +
    '<circle cx="32" cy="32" r="9.5" fill="#f77f00" stroke="#fff3b0" stroke-width="1.5" />' +
    '<ellipse cx="32" cy="32" rx="2.6" ry="7.5" fill="#0d0908" />' +
    '<line x1="32" y1="9" x2="32" y2="16" stroke="#ef476f" stroke-width="2.2" />' +
    '<line x1="32" y1="48" x2="32" y2="55" stroke="#ef476f" stroke-width="2.2" />' +
    '<line x1="16" y1="16" x2="21" y2="21" stroke="#c89b3c" stroke-width="2" />' +
    '<line x1="48" y1="16" x2="43" y2="21" stroke="#c89b3c" stroke-width="2" />' +
    '<line x1="16" y1="48" x2="21" y2="43" stroke="#c89b3c" stroke-width="2" />' +
    '<line x1="48" y1="48" x2="43" y2="43" stroke="#c89b3c" stroke-width="2" />',

  abyssal_maw: () =>
    '<circle cx="32" cy="32" r="21" fill="#4a121b" stroke="#f3cf7a" stroke-width="2.4" />' +
    '<circle cx="32" cy="32" r="15" fill="#12080a" stroke="#ef476f" stroke-width="1.6" />' +
    '<polygon points="22,19 25,27 28,18" fill="#fff3d6" />' +
    '<polygon points="30,17 32,26 35,17" fill="#fff3d6" />' +
    '<polygon points="36,18 39,27 42,19" fill="#fff3d6" />' +
    '<polygon points="22,45 25,37 28,46" fill="#fff3d6" />' +
    '<polygon points="30,47 32,38 35,47" fill="#fff3d6" />' +
    '<polygon points="36,46 39,37 42,45" fill="#fff3d6" />' +
    '<circle cx="32" cy="32" r="5" fill="#f77f00" />',

  // ================= SCHEME 2: REVOLVER DUNGEON =================
  empty_chamber: () =>
    '<circle cx="32" cy="32" r="18" fill="#0d0a08" stroke="#6b4c18" stroke-width="2.4" />' +
    '<circle cx="32" cy="32" r="12" fill="#060504" stroke="#3d2e1e" stroke-width="1.4" />' +
    '<circle cx="32" cy="32" r="3" fill="#221a14" />',

  smoking_casing: () =>
    '<rect x="25" y="26" width="14" height="22" rx="2" fill="#7a5a24" stroke="#c89b3c" stroke-width="1.6" />' +
    '<rect x="23" y="45" width="18" height="4" rx="1" fill="#c89b3c" />' +
    '<path d="M29,24 C26,18 33,15 30,10" fill="none" stroke="#cbd2d9" stroke-width="2" />' +
    '<path d="M35,23 C38,18 34,14 37,9" fill="none" stroke="#8d99ae" stroke-width="1.8" />',

  lead_bullet: () =>
    '<path d="M25,26 C25,15 39,15 39,26 Z" fill="#cbd2d9" stroke="#e4e7eb" stroke-width="1.4" />' +
    '<rect x="25" y="26" width="14" height="21" rx="1.5" fill="#c89b3c" stroke="#f3cf7a" stroke-width="1.5" />' +
    '<rect x="23" y="45" width="18" height="4" rx="1" fill="#f3cf7a" />' +
    '<line x1="29" y1="28" x2="29" y2="43" stroke="#fff3b0" stroke-width="1.4" />',

  vampire_bullet: () =>
    '<polygon points="12,30 25,26 25,38 15,40" fill="#3d1118" stroke="#ef476f" stroke-width="1.3" />' +
    '<polygon points="52,30 39,26 39,38 49,40" fill="#3d1118" stroke="#ef476f" stroke-width="1.3" />' +
    '<path d="M25,26 L32,11 L39,26 Z" fill="#d90429" stroke="#ff8fa3" stroke-width="1.4" />' +
    '<rect x="25" y="26" width="14" height="21" fill="#2b1719" stroke="#c89b3c" stroke-width="1.6" />' +
    '<circle cx="32" cy="36" r="3.5" fill="#ef476f" />',

  scatter_bullet: () =>
    '<rect x="23" y="26" width="18" height="17" rx="2" fill="#b51d36" stroke="#ef476f" stroke-width="1.5" />' +
    '<rect x="22" y="42" width="20" height="7" rx="1.5" fill="#c89b3c" stroke="#f3cf7a" stroke-width="1.4" />' +
    '<circle cx="24" cy="17" r="3" fill="#ffd166" />' +
    '<circle cx="32" cy="13" r="3.4" fill="#fff3b0" />' +
    '<circle cx="40" cy="17" r="3" fill="#ffd166" />' +
    '<circle cx="28" cy="21" r="2.5" fill="#f77f00" />' +
    '<circle cx="36" cy="21" r="2.5" fill="#f77f00" />',

  parasite_bullet: () =>
    '<path d="M26,18 L22,10 L29,15 Z" fill="#06d6a0" />' +
    '<path d="M38,18 L42,10 L35,15 Z" fill="#06d6a0" />' +
    '<ellipse cx="32" cy="25" rx="9" ry="8" fill="#06d6a0" stroke="#f3cf7a" stroke-width="1.5" />' +
    '<ellipse cx="32" cy="36" rx="8" ry="6" fill="#f77f00" stroke="#ffd166" stroke-width="1.4" />' +
    '<rect x="25" y="41" width="14" height="8" rx="2" fill="#c89b3c" />' +
    '<circle cx="29" cy="24" r="2" fill="#120f0c" />' +
    '<circle cx="35" cy="24" r="2" fill="#120f0c" />',

  powder_charge: () =>
    '<rect x="17" y="20" width="9" height="28" rx="2" fill="#d90429" stroke="#ffd166" stroke-width="1.3" />' +
    '<rect x="27.5" y="18" width="9" height="30" rx="2" fill="#ef476f" stroke="#ffd166" stroke-width="1.3" />' +
    '<rect x="38" y="20" width="9" height="28" rx="2" fill="#d90429" stroke="#ffd166" stroke-width="1.3" />' +
    '<rect x="15" y="31" width="34" height="5" fill="#c89b3c" />' +
    '<polygon points="32,9 35,15 29,15" fill="#fff3b0" />',

  fuse_cord: () =>
    '<circle cx="29" cy="36" r="12" fill="none" stroke="#c89b3c" stroke-width="4" />' +
    '<circle cx="29" cy="36" r="7" fill="none" stroke="#f3cf7a" stroke-width="2" />' +
    '<path d="M38,28 C42,22 44,18 46,15" fill="none" stroke="#f3cf7a" stroke-width="2.5" />' +
    '<polygon points="46,8 48,13 53,15 48,17 46,22 44,17 39,15 44,13" fill="#ffd166" />' +
    '<circle cx="46" cy="15" r="2.6" fill="#ef476f" />',

  heavy_hammer: () =>
    '<rect x="15" y="14" width="34" height="14" rx="2.5" fill="#8d99ae" stroke="#f3cf7a" stroke-width="1.8" />' +
    '<rect x="28" y="28" width="8" height="22" rx="1.5" fill="#c89b3c" stroke="#ffd166" stroke-width="1.4" />' +
    '<polygon points="32,17 37,21 32,25 27,21" fill="#f77f00" />',

  demon_bullet: () =>
    '<path d="M22,22 C14,16 15,10 23,13" fill="none" stroke="#ffd166" stroke-width="2.6" />' +
    '<path d="M42,22 C50,16 49,10 41,13" fill="none" stroke="#ffd166" stroke-width="2.6" />' +
    '<path d="M24,25 L32,11 L40,25 Z" fill="#ef476f" stroke="#ffd166" stroke-width="1.5" />' +
    '<rect x="24" y="25" width="16" height="23" rx="2" fill="#1e1114" stroke="#ffd166" stroke-width="1.8" />' +
    '<polygon points="32,30 35,36 41,37 36,41 37,46 32,43 27,46 28,41 23,37 29,36" fill="#ef476f" />',

  revolver_spindle: () =>
    '<circle cx="32" cy="32" r="19" fill="#2a2016" stroke="#f3cf7a" stroke-width="2.4" />' +
    '<polygon points="32,13 36,26 49,23 39,32 49,41 36,38 32,51 28,38 15,41 25,32 15,23 28,26" fill="#c89b3c" />' +
    '<circle cx="32" cy="32" r="5.5" fill="#14100d" stroke="#ffd166" stroke-width="1.8" />',

  // ================= SCHEME 3: JACKPOT TD =================
  miner_pick: () =>
    '<rect x="18" y="42" width="28" height="8" rx="2" fill="#5c4316" stroke="#c89b3c" stroke-width="1.5" />' +
    '<line x1="32" y1="16" x2="32" y2="44" stroke="#c89b3c" stroke-width="4" />' +
    '<path d="M13,24 C22,13 42,13 51,24 C42,20 22,20 13,24 Z" fill="#cbd2d9" stroke="#ffffff" stroke-width="1.4" />' +
    '<circle cx="32" cy="20" r="3" fill="#ffd166" />',

  gold_nugget: () =>
    '<polygon points="22,14 43,16 50,32 40,48 20,47 14,30" fill="#ffd166" stroke="#fff3b0" stroke-width="2" />' +
    '<polygon points="25,20 39,21 44,32 37,42 24,41 20,30" fill="#f77f00" opacity="0.45" />' +
    '<polygon points="28,22 36,23 32,33" fill="#fff9db" />',

  cryo_prism: () =>
    '<polygon points="32,9 45,24 40,50 24,50 19,24" fill="#2ec4f1" stroke="#caf0f8" stroke-width="2" />' +
    '<polygon points="32,14 39,26 32,45 25,26" fill="#90e0ef" />' +
    '<polygon points="14,28 20,24 18,40" fill="#48cae4" />' +
    '<polygon points="50,28 44,24 46,40" fill="#48cae4" />',

  tesla_coil: () =>
    '<rect x="22" y="44" width="20" height="6" rx="2" fill="#5c4316" stroke="#c89b3c" stroke-width="1.5" />' +
    '<rect x="27" y="22" width="10" height="22" fill="#b07d2b" />' +
    '<ellipse cx="32" cy="18" rx="13" ry="5" fill="#cbd2d9" stroke="#2ec4f1" stroke-width="1.8" />' +
    '<polyline points="16,16 11,24 17,26 12,35" fill="none" stroke="#ffd166" stroke-width="2.2" />' +
    '<polyline points="48,16 53,24 47,26 52,35" fill="none" stroke="#2ec4f1" stroke-width="2.2" />',

  prism_laser: () =>
    '<rect x="18" y="43" width="28" height="7" rx="2" fill="#3b2e22" stroke="#c89b3c" stroke-width="1.6" />' +
    '<polygon points="22,43 32,20 42,43" fill="#261e18" stroke="#f3cf7a" stroke-width="1.8" />' +
    '<circle cx="32" cy="24" r="6.5" fill="#ef476f" stroke="#ffd166" stroke-width="1.8" />' +
    '<line x1="32" y1="9" x2="32" y2="18" stroke="#06d6a0" stroke-width="3.5" />',

  nuke_core: () =>
    '<circle cx="32" cy="32" r="19" fill="#1e1812" stroke="#ffd166" stroke-width="2.2" />' +
    '<polygon points="32,28 22,16 42,16" fill="#ffd166" />' +
    '<polygon points="29,34 15,40 23,49" fill="#f77f00" />' +
    '<polygon points="35,34 49,40 41,49" fill="#f77f00" />' +
    '<circle cx="32" cy="32" r="5" fill="#ef476f" stroke="#fff3b0" stroke-width="1.6" />',

  gob_runner: () =>
    '<polygon points="14,22 25,24 21,32" fill="#06d6a0" />' +
    '<polygon points="50,22 39,24 43,32" fill="#06d6a0" />' +
    '<circle cx="32" cy="30" r="11" fill="#2b9348" stroke="#9bf6ff" stroke-width="1.4" />' +
    '<circle cx="28" cy="29" r="2.2" fill="#ffd166" />' +
    '<circle cx="36" cy="29" r="2.2" fill="#ffd166" />' +
    '<polygon points="16,46 28,38 24,49" fill="#cbd2d9" />' +
    '<polygon points="48,46 36,38 40,49" fill="#cbd2d9" />',

  shield_bearer: () =>
    '<rect x="16" y="13" width="32" height="38" rx="6" fill="#3e4c59" stroke="#cbd2d9" stroke-width="2.2" />' +
    '<rect x="22" y="20" width="20" height="4" rx="1" fill="#ef476f" />' +
    '<circle cx="32" cy="35" r="6" fill="#c89b3c" stroke="#f3cf7a" stroke-width="1.6" />',

  tunnel_berserker: () =>
    '<circle cx="32" cy="33" r="14" fill="#5c2c16" stroke="#f77f00" stroke-width="1.8" />' +
    '<polygon points="32,10 38,24 26,24" fill="#cbd2d9" stroke="#ffd166" stroke-width="1.4" />' +
    '<path d="M18,38 C11,34 12,26 18,28" fill="none" stroke="#fff3d6" stroke-width="3" />' +
    '<path d="M46,38 C53,34 52,26 46,28" fill="none" stroke="#fff3d6" stroke-width="3" />' +
    '<circle cx="27" cy="32" r="2.4" fill="#ef476f" />' +
    '<circle cx="37" cy="32" r="2.4" fill="#ef476f" />',

  siege_dreadnought: () =>
    '<rect x="14" y="18" width="36" height="30" rx="4" fill="#2c1618" stroke="#ffd166" stroke-width="2.2" />' +
    '<polygon points="14,18 10,9 22,18" fill="#c89b3c" />' +
    '<polygon points="50,18 54,9 42,18" fill="#c89b3c" />' +
    '<rect x="21" y="25" width="22" height="5" fill="#ef476f" />' +
    '<rect x="20" y="35" width="6" height="9" fill="#f77f00" />' +
    '<rect x="29" y="35" width="6" height="9" fill="#f77f00" />' +
    '<rect x="38" y="35" width="6" height="9" fill="#f77f00" />',

  // ================= SCHEME 4: SIGIL PACHINKO =================
  ember_orb: () =>
    '<circle cx="32" cy="32" r="17" fill="#b51d36" stroke="#ffd166" stroke-width="2" />' +
    '<path d="M32,19 C38,25 40,33 36,40 C34,44 29,44 27,40 C24,34 27,26 32,19 Z" fill="#ffd166" />' +
    '<circle cx="26" cy="24" r="3" fill="#fff9db" />',

  gold_droplet: () =>
    '<path d="M32,12 C42,24 47,32 45,41 C43,48 37,51 32,51 C27,51 21,48 19,41 C17,32 22,24 32,12 Z" fill="#ffd166" stroke="#fff3b0" stroke-width="2" />' +
    '<circle cx="28" cy="36" r="4" fill="#fff9db" />',

  frost_core: () =>
    '<circle cx="32" cy="32" r="17" fill="#0a2e3d" stroke="#2ec4f1" stroke-width="2" />' +
    '<polygon points="32,15 36,28 49,32 36,36 32,49 28,36 15,32 28,28" fill="#90e0ef" />' +
    '<circle cx="32" cy="32" r="4" fill="#ffffff" />',

  lightning_sphere: () =>
    '<circle cx="32" cy="32" r="17" fill="#132a38" stroke="#2ec4f1" stroke-width="2" />' +
    '<polygon points="35,15 23,33 32,33 28,49 41,30 32,30" fill="#ffd166" />',

  gold_stone: () =>
    '<polygon points="24,14 40,14 50,24 50,40 40,50 24,50 14,40 14,24" fill="#c89b3c" stroke="#fff3b0" stroke-width="2" />' +
    '<polygon points="32,20 43,40 21,40" fill="none" stroke="#fff9db" stroke-width="2" />',

  volatile_mercury: () =>
    '<circle cx="32" cy="32" r="13" fill="#cbd2d9" stroke="#ffffff" stroke-width="1.8" />' +
    '<circle cx="17" cy="20" r="4" fill="#9aa5b1" />' +
    '<circle cx="47" cy="22" r="3.5" fill="#e4e7eb" />' +
    '<circle cx="44" cy="45" r="4.2" fill="#9aa5b1" />',

  void_glutton_orb: () =>
    '<circle cx="32" cy="32" r="18" fill="#181112" stroke="#ef476f" stroke-width="2.2" />' +
    '<path d="M18,32 C24,42 40,42 46,32 C40,26 24,26 18,32 Z" fill="#ef476f" />' +
    '<polygon points="24,30 26,35 28,30" fill="#fff3d6" />' +
    '<polygon points="31,29 33,35 35,29" fill="#fff3d6" />' +
    '<polygon points="37,30 39,35 41,30" fill="#fff3d6" />',

  void_singularity: () =>
    '<ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(-24 32 32)" fill="none" stroke="#ffd166" stroke-width="3" />' +
    '<circle cx="32" cy="32" r="11" fill="#090807" stroke="#ef476f" stroke-width="2.4" />' +
    '<circle cx="32" cy="32" r="3" fill="#fff3b0" />',

  philosopher_stone: () =>
    '<polygon points="32,10 47,19 52,32 47,45 32,54 17,45 12,32 17,19" fill="#ef476f" stroke="#ffd166" stroke-width="2.2" />' +
    '<polygon points="32,17 44,32 32,47 20,32" fill="#06d6a0" stroke="#fff3b0" stroke-width="1.5" />' +
    '<circle cx="32" cy="32" r="4.5" fill="#fff9db" />',

  peg_ember: () =>
    '<circle cx="32" cy="32" r="17" fill="#2c1416" stroke="#f77f00" stroke-width="2.5" />' +
    '<path d="M32,19 C38,25 39,34 32,42 C25,34 26,25 32,19 Z" fill="#ffd166" />',

  peg_volt: () =>
    '<circle cx="32" cy="32" r="17" fill="#112430" stroke="#2ec4f1" stroke-width="2.5" />' +
    '<polygon points="34,18 25,33 32,33 29,45 39,30 32,30" fill="#ffd166" />',

  peg_gold: () =>
    '<circle cx="32" cy="32" r="17" fill="#2e2210" stroke="#ffd166" stroke-width="2.5" />' +
    '<polygon points="32,19 43,32 32,45 21,32" fill="#ffd166" />',

  peg_glutton: () =>
    '<circle cx="32" cy="32" r="17" fill="#321117" stroke="#ef476f" stroke-width="2.5" />' +
    '<polygon points="22,26 27,34 32,26 37,34 42,26 40,40 24,40" fill="#f3cf7a" />',

  crucible: () =>
    '<path d="M16,24 L48,24 L44,46 C42,51 22,51 20,46 Z" fill="#2b2118" stroke="#c89b3c" stroke-width="2" />' +
    '<ellipse cx="32" cy="24" rx="16" ry="4.5" fill="#06d6a0" stroke="#f3cf7a" stroke-width="1.6" />',

  crucible_5x: () =>
    '<path d="M15,24 L49,24 L44,47 C41,52 23,52 20,47 Z" fill="#3b1b14" stroke="#f77f00" stroke-width="2.2" />' +
    '<ellipse cx="32" cy="24" rx="17" ry="5" fill="#ffd166" stroke="#ef476f" stroke-width="1.8" />',

  crucible_jackpot: () =>
    '<polygon points="20,16 26,23 32,14 38,23 44,16 46,25 18,25" fill="#ffd166" />' +
    '<path d="M14,25 L50,25 L44,48 C41,53 23,53 20,48 Z" fill="#5c3d10" stroke="#fff3b0" stroke-width="2.4" />' +
    '<circle cx="32" cy="37" r="5.5" fill="#ef476f" stroke="#fff3b0" stroke-width="1.5" />',

  // ================= SCHEME 5: ABYSSAL GRID =================
  empty_cell: () =>
    '<rect x="14" y="14" width="36" height="36" rx="4" fill="#0c0a08" stroke="#5a4d41" stroke-width="1.6" />' +
    '<polyline points="18,24 18,18 24,18" fill="none" stroke="#c89b3c" stroke-width="1.8" />' +
    '<polyline points="40,18 46,18 46,24" fill="none" stroke="#c89b3c" stroke-width="1.8" />' +
    '<polyline points="18,40 18,46 24,46" fill="none" stroke="#c89b3c" stroke-width="1.8" />' +
    '<polyline points="40,46 46,46 46,40" fill="none" stroke="#c89b3c" stroke-width="1.8" />',

  skeleton_pawn: () =>
    '<line x1="18" y1="48" x2="46" y2="16" stroke="#cbd2d9" stroke-width="2.6" />' +
    '<polygon points="42,14 50,14 48,23" fill="#e4e7eb" />' +
    '<circle cx="30" cy="30" r="10" fill="#e5dccb" stroke="#8a7968" stroke-width="1.5" />' +
    '<circle cx="27" cy="29" r="2.2" fill="#14100d" />' +
    '<circle cx="33" cy="29" r="2.2" fill="#14100d" />' +
    '<rect x="26" y="38" width="8" height="5" fill="#d8cbb8" />',

  slime_blob: () =>
    '<path d="M14,44 C14,24 22,18 32,18 C42,18 50,24 50,44 C44,48 20,48 14,44 Z" fill="#06d6a0" stroke="#9bf6ff" stroke-width="1.8" />' +
    '<circle cx="26" cy="32" r="2.5" fill="#090807" />' +
    '<circle cx="38" cy="32" r="2.5" fill="#090807" />' +
    '<circle cx="24" cy="24" r="3" fill="#fff9db" opacity="0.7" />',

  mana_crystal: () =>
    '<polygon points="32,11 40,28 36,48 28,48 24,28" fill="#2ec4f1" stroke="#caf0f8" stroke-width="1.6" />' +
    '<polygon points="18,22 25,32 23,48 16,44" fill="#0096c7" />' +
    '<polygon points="46,22 39,32 41,48 48,44" fill="#0096c7" />',

  gold_mimic: () =>
    '<rect x="14" y="28" width="36" height="20" rx="3" fill="#5c3a21" stroke="#ffd166" stroke-width="1.8" />' +
    '<path d="M14,26 L50,18 L48,28 L14,28 Z" fill="#7f4f24" stroke="#ffd166" stroke-width="1.8" />' +
    '<polygon points="19,28 22,33 25,28" fill="#fff3d6" />' +
    '<polygon points="39,28 42,33 45,28" fill="#fff3d6" />' +
    '<path d="M28,29 C30,40 36,40 38,33" fill="none" stroke="#ef476f" stroke-width="4" />',

  imp_scout: () =>
    '<polygon points="10,26 23,28 18,38" fill="#9e1427" />' +
    '<polygon points="54,26 41,28 46,38" fill="#9e1427" />' +
    '<circle cx="32" cy="28" r="9" fill="#ef476f" />' +
    '<polygon points="26,20 23,12 30,19" fill="#ffd166" />' +
    '<polygon points="38,20 41,12 34,19" fill="#ffd166" />' +
    '<circle cx="32" cy="44" r="4.5" fill="#ffd166" />',

  cursed_urn: () =>
    '<rect x="25" y="14" width="14" height="5" rx="1" fill="#c89b3c" />' +
    '<path d="M24,19 L40,19 C47,27 46,41 39,49 L25,49 C18,41 17,27 24,19 Z" fill="#3a231c" stroke="#c89b3c" stroke-width="1.8" />' +
    '<circle cx="32" cy="34" r="5" fill="#06d6a0" />',

  abyssal_knight: () =>
    '<path d="M20,48 L22,24 C22,15 42,15 42,24 L44,48 Z" fill="#1e2229" stroke="#c89b3c" stroke-width="2" />' +
    '<polygon points="22,22 14,12 26,18" fill="#ef476f" />' +
    '<polygon points="42,22 50,12 38,18" fill="#ef476f" />' +
    '<rect x="25" y="28" width="14" height="3.5" fill="#ef476f" />' +
    '<line x1="32" y1="24" x2="32" y2="44" stroke="#f3cf7a" stroke-width="2" />',

  blood_archmage: () =>
    '<polygon points="32,10 45,30 41,49 23,49 19,30" fill="#6b0f1a" stroke="#ffd166" stroke-width="1.8" />' +
    '<polygon points="32,20 39,32 32,44 25,32" fill="#ef476f" stroke="#fff3b0" stroke-width="1.5" />' +
    '<circle cx="32" cy="32" r="3.5" fill="#fff9db" />',

  soul_cannon: () =>
    '<circle cx="22" cy="44" r="6" fill="#3b2e22" stroke="#c89b3c" stroke-width="2" />' +
    '<polygon points="16,38 42,16 50,25 26,45" fill="#2b333b" stroke="#f3cf7a" stroke-width="2" />' +
    '<circle cx="47" cy="18" r="5" fill="#06d6a0" stroke="#fff3b0" stroke-width="1.5" />',

  void_reaper: () =>
    '<path d="M16,20 C28,10 46,12 50,24 C38,20 28,22 16,20 Z" fill="#ef476f" stroke="#ffd166" stroke-width="1.5" />' +
    '<line x1="20" y1="49" x2="42" y2="16" stroke="#c89b3c" stroke-width="3" />' +
    '<polygon points="24,48 32,26 40,48" fill="#181310" stroke="#9aa5b1" stroke-width="1.4" />',

  golden_overlord: () =>
    '<polygon points="14,22 22,32 27,16 32,28 37,16 42,32 50,22 46,47 18,47" fill="#ffd166" stroke="#fff3b0" stroke-width="2" />' +
    '<polygon points="32,29 37,37 32,44 27,37" fill="#ef476f" />' +
    '<circle cx="24" cy="38" r="2.5" fill="#06d6a0" />' +
    '<circle cx="40" cy="38" r="2.5" fill="#06d6a0" />',

  // ================= SHARED RELICS (8) =================
  greed_ledger: () =>
    '<rect x="17" y="13" width="30" height="38" rx="3" fill="#6b1420" stroke="#ffd166" stroke-width="2" />' +
    '<line x1="22" y1="13" x2="22" y2="51" stroke="#f3cf7a" stroke-width="2" />' +
    '<polyline points="26,38 32,30 36,34 42,23" fill="none" stroke="#ffd166" stroke-width="2.6" />' +
    '<polygon points="42,20 45,26 39,25" fill="#06d6a0" />',

  gluttony_jaw: () =>
    '<path d="M15,26 C18,46 46,46 49,26 L42,24 C39,36 25,36 22,24 Z" fill="#f3cf7a" stroke="#c89b3c" stroke-width="1.8" />' +
    '<polygon points="23,26 26,18 29,27" fill="#fff9db" />' +
    '<polygon points="35,27 38,18 41,26" fill="#fff9db" />' +
    '<polygon points="29,28 32,20 35,28" fill="#ef476f" />',

  acid_reflux_core: () =>
    '<rect x="27" y="12" width="10" height="6" rx="1" fill="#c89b3c" />' +
    '<circle cx="32" cy="35" r="15" fill="#132620" stroke="#f3cf7a" stroke-width="2" />' +
    '<path d="M18,36 C25,32 39,40 46,35 C45,44 39,49 32,49 C25,49 19,44 18,36 Z" fill="#06d6a0" />' +
    '<circle cx="28" cy="31" r="2.5" fill="#ffd166" />' +
    '<circle cx="36" cy="28" r="2" fill="#9bf6ff" />',

  pyro_catalyst: () =>
    '<circle cx="32" cy="35" r="14" fill="#2c1416" stroke="#f77f00" stroke-width="2.2" />' +
    '<path d="M32,22 C38,28 39,37 32,44 C25,37 26,28 32,22 Z" fill="#ef476f" />' +
    '<circle cx="32" cy="36" r="4.5" fill="#ffd166" />' +
    '<polygon points="32,10 35,17 29,17" fill="#fff3b0" />',

  russian_roulette_coin: () =>
    '<circle cx="32" cy="32" r="18" fill="#c89b3c" stroke="#fff3b0" stroke-width="2.2" />' +
    '<circle cx="32" cy="32" r="12" fill="#241911" />' +
    '<circle cx="32" cy="24" r="2.5" fill="#ef476f" />' +
    '<circle cx="39" cy="28" r="2.5" fill="#ffd166" />' +
    '<circle cx="39" cy="36" r="2.5" fill="#ffd166" />' +
    '<circle cx="32" cy="40" r="2.5" fill="#ffd166" />' +
    '<circle cx="25" cy="36" r="2.5" fill="#ffd166" />' +
    '<circle cx="25" cy="28" r="2.5" fill="#ffd166" />',

  compound_vault: () =>
    '<rect x="14" y="14" width="36" height="36" rx="6" fill="#2c241d" stroke="#ffd166" stroke-width="2.2" />' +
    '<circle cx="32" cy="32" r="11" fill="#14100d" stroke="#f3cf7a" stroke-width="2" />' +
    '<line x1="32" y1="21" x2="32" y2="43" stroke="#ffd166" stroke-width="2" />' +
    '<line x1="21" y1="32" x2="43" y2="32" stroke="#ffd166" stroke-width="2" />' +
    '<circle cx="32" cy="32" r="3.5" fill="#06d6a0" />',

  chronos_lever: () =>
    '<polygon points="22,16 42,16 35,32 42,48 22,48 29,32" fill="#132a38" stroke="#2ec4f1" stroke-width="2" />' +
    '<line x1="46" y1="46" x2="50" y2="20" stroke="#f3cf7a" stroke-width="3" />' +
    '<circle cx="50" cy="18" r="4.2" fill="#ef476f" stroke="#fff3b0" stroke-width="1.4" />',

  abyssal_crown: () =>
    '<polygon points="12,44 15,20 24,31 32,14 40,31 49,20 52,44" fill="#ffd166" stroke="#fff3b0" stroke-width="2.2" />' +
    '<rect x="13" y="42" width="38" height="6" rx="2" fill="#c89b3c" />' +
    '<circle cx="32" cy="33" r="4.5" fill="#d90429" stroke="#fff9db" stroke-width="1.3" />',
});

function renderFallbackSprite(normId, frame) {
  const h = hashSpriteId(normId);
  const c1 = FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
  const c2 = FALLBACK_PALETTE[(h >>> 3) % FALLBACK_PALETTE.length];
  const pointsCount = 4 + (h % 5);
  const pts = [];
  for (let i = 0; i < pointsCount * 2; i++) {
    const r = i % 2 === 0 ? 18 : 9;
    const angle = (i * Math.PI) / pointsCount - Math.PI / 2;
    const px = (32 + Math.cos(angle) * r).toFixed(1);
    const py = (32 + Math.sin(angle) * r).toFixed(1);
    pts.push(`${px},${py}`);
  }
  return (
    renderMedallionFrame(frame, 2) +
    `<polygon points="${pts.join(' ')}" fill="${c1}" stroke="${c2}" stroke-width="1.8" />` +
    `<circle cx="32" cy="32" r="4.5" fill="#fff3b0" />`
  );
}

/**
 * Renders a crisp inline `64×64` multi-layered SVG icon for any entity, bullet, turret, orb, peg, cell, or relic.
 * @param {string} id
 * @param {object} [options={}]
 * @returns {string}
 */
export function renderSprite(id, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const rawSize =
    typeof opts.size === 'number' || typeof opts.size === 'string' ? Number(opts.size) : 48;
  const size = Math.max(12, Math.floor(Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 48));
  const normId = normalizeSpriteId(id, opts);
  const defaultTier = Object.hasOwn(DEFAULT_TIER_BY_ID, normId) ? DEFAULT_TIER_BY_ID[normId] : 1;
  const hasOptTier =
    opts.tier !== undefined &&
    opts.tier !== null &&
    (typeof opts.tier === 'number' || typeof opts.tier === 'string');
  const rawTier = hasOptTier ? Number(opts.tier) : defaultTier;
  const tierNum = Math.max(0, Math.min(4, Number.isFinite(rawTier) ? Math.floor(rawTier) : 1));
  const frame = Object.hasOwn(TIER_FRAME_PALETTE, tierNum)
    ? TIER_FRAME_PALETTE[tierNum]
    : TIER_FRAME_PALETTE[1];
  const extraClass = safeAttr(opts.className);
  const cls = `forge-sprite forge-tier-${tierNum}${extraClass ? ` ${extraClass}` : ''}`;

  const recipe =
    Object.hasOwn(SPRITE_RECIPES, normId) && typeof SPRITE_RECIPES[normId] === 'function'
      ? SPRITE_RECIPES[normId]
      : null;
  const innerArt = recipe
    ? renderMedallionFrame(frame, tierNum) + recipe()
    : renderFallbackSprite(normId, frame);

  return compactSvg(
    `<svg class="${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" data-sprite-id="${safeAttr(normId)}" aria-hidden="true">${innerArt}</svg>`
  );
}

const BOSS_MOTIFS = Object.freeze({
  // Scheme 1 (8)
  battering_ram: { chassis: 'ram', pri: '#8d5b34', sec: '#c89b3c', eye: '#ffd166' },
  iron_phalanx: { chassis: 'fortress', pri: '#4a5568', sec: '#cbd2d9', eye: '#2ec4f1' },
  alchemical_trebuchet: { chassis: 'construct', pri: '#5c4316', sec: '#06d6a0', eye: '#ffd166' },
  steam_siege_tower: { chassis: 'fortress', pri: '#6b4c18', sec: '#f77f00', eye: '#ffd166' },
  abyssal_siege_drake: { chassis: 'drake', pri: '#7a1628', sec: '#f77f00', eye: '#fff3b0' },
  golden_titan_colossus: { chassis: 'sovereign', pri: '#c89b3c', sec: '#ffd166', eye: '#2ec4f1' },
  necro_bone_citadel: { chassis: 'skull_lord', pri: '#d8cbb8', sec: '#06d6a0', eye: '#ef476f' },
  omega_siege_dreadnought: { chassis: 'omega', pri: '#9e1427', sec: '#ffd166', eye: '#fff9db' },

  // Scheme 2 (8)
  dungeon_gate_skeleton: { chassis: 'skull_lord', pri: '#cbd2d9', sec: '#8d99ae', eye: '#ef476f' },
  twin_headed_hound: { chassis: 'drake', pri: '#5c2c16', sec: '#ef476f', eye: '#ffd166' },
  iron_maiden_executioner: { chassis: 'fortress', pri: '#3e4c59', sec: '#ef476f', eye: '#ffd166' },
  vampire_archduke: { chassis: 'sovereign', pri: '#6b0f1a', sec: '#f3cf7a', eye: '#ef476f' },
  powder_mad_alchemist: { chassis: 'construct', pri: '#7f4f24', sec: '#f77f00', eye: '#06d6a0' },
  abyssal_croupier: { chassis: 'sovereign', pri: '#241911', sec: '#ffd166', eye: '#06d6a0' },
  six_armed_hell_general: { chassis: 'drake', pri: '#9e1427', sec: '#f77f00', eye: '#ffd166' },
  revolver_archfiend_azazel: { chassis: 'omega', pri: '#4a121b', sec: '#ffd166', eye: '#ef476f' },

  // Scheme 3 (8)
  wave_1_drill_foreman: { chassis: 'ram', pri: '#7f4f24', sec: '#cbd2d9', eye: '#ffd166' },
  wave_2_armored_mole: { chassis: 'ram', pri: '#4a5568', sec: '#c89b3c', eye: '#f77f00' },
  wave_3_magma_crusher: { chassis: 'construct', pri: '#9e1427', sec: '#f77f00', eye: '#ffd166' },
  wave_4_cryo_behemoth: { chassis: 'drake', pri: '#133c55', sec: '#2ec4f1', eye: '#ffffff' },
  wave_5_thunder_colossus: { chassis: 'sovereign', pri: '#2b3a4a', sec: '#ffd166', eye: '#2ec4f1' },
  wave_6_void_excavator: { chassis: 'construct', pri: '#2b2118', sec: '#06d6a0', eye: '#ef476f' },
  wave_7_nuclear_wyrm: { chassis: 'drake', pri: '#3b2e10', sec: '#ffd166', eye: '#06d6a0' },
  wave_8_jackpot_overlord: { chassis: 'omega', pri: '#c89b3c', sec: '#fff3b0', eye: '#ef476f' },

  // Scheme 4 (8)
  pachinko_boss_1: { chassis: 'construct', pri: '#6c584c', sec: '#c89b3c', eye: '#06d6a0' },
  pachinko_boss_2: { chassis: 'fortress', pri: '#9c6644', sec: '#f3cf7a', eye: '#ffd166' },
  pachinko_boss_3: { chassis: 'drake', pri: '#8d99ae', sec: '#2ec4f1', eye: '#ef476f' },
  pachinko_boss_4: { chassis: 'construct', pri: '#9e1427', sec: '#f77f00', eye: '#fff3b0' },
  pachinko_boss_5: { chassis: 'sovereign', pri: '#1b263b', sec: '#ffd166', eye: '#2ec4f1' },
  pachinko_boss_6: { chassis: 'drake', pri: '#132a38', sec: '#ffd166', eye: '#06d6a0' },
  pachinko_boss_7: { chassis: 'skull_lord', pri: '#133c2e', sec: '#06d6a0', eye: '#ffd166' },
  pachinko_boss_8: { chassis: 'omega', pri: '#b51d36', sec: '#ffd166', eye: '#06d6a0' },

  // Scheme 5 (8)
  grid_boss_1: { chassis: 'fortress', pri: '#2b303a', sec: '#c89b3c', eye: '#ef476f' },
  grid_boss_2: { chassis: 'ram', pri: '#1f1a17', sec: '#f3cf7a', eye: '#f77f00' },
  grid_boss_3: { chassis: 'sovereign', pri: '#3d1620', sec: '#2ec4f1', eye: '#ffd166' },
  grid_boss_4: { chassis: 'fortress', pri: '#4a5568', sec: '#ffd166', eye: '#ef476f' },
  grid_boss_5: { chassis: 'skull_lord', pri: '#4a121b', sec: '#f77f00', eye: '#fff3b0' },
  grid_boss_6: { chassis: 'construct', pri: '#142834', sec: '#2ec4f1', eye: '#ffd166' },
  grid_boss_7: { chassis: 'drake', pri: '#5c1622', sec: '#ffd166', eye: '#2ec4f1' },
  grid_boss_8: { chassis: 'omega', pri: '#c89b3c', sec: '#ef476f', eye: '#fff9db' },
});

function renderBossChassisSvg(chassis, pri, sec, eye) {
  switch (chassis) {
    case 'ram':
      return (
        `<rect x="26" y="42" width="68" height="40" rx="6" fill="${pri}" stroke="${sec}" stroke-width="2.6" />` +
        `<polygon points="60,22 82,46 38,46" fill="${sec}" stroke="#fff3b0" stroke-width="2" />` +
        `<circle cx="34" cy="84" r="9" fill="#181310" stroke="${sec}" stroke-width="2.4" />` +
        `<circle cx="86" cy="84" r="9" fill="#181310" stroke="${sec}" stroke-width="2.4" />` +
        `<polygon points="42,56 54,60 44,64" fill="${eye}" />` +
        `<polygon points="78,56 66,60 76,64" fill="${eye}" />`
      );
    case 'fortress':
      return (
        `<polygon points="28,28 40,28 40,36 52,36 52,28 68,28 68,36 80,36 80,28 92,28 90,88 30,88" fill="${pri}" stroke="${sec}" stroke-width="2.6" />` +
        `<rect x="40" y="48" width="40" height="8" rx="2" fill="#0d0a08" />` +
        `<circle cx="49" cy="52" r="3.4" fill="${eye}" />` +
        `<circle cx="71" cy="52" r="3.4" fill="${eye}" />` +
        `<rect x="46" y="66" width="28" height="18" rx="3" fill="#16110e" stroke="${sec}" stroke-width="2" />`
      );
    case 'construct':
      return (
        `<circle cx="60" cy="60" r="30" fill="${pri}" stroke="${sec}" stroke-width="2.8" />` +
        `<polygon points="60,24 66,34 54,34" fill="${sec}" />` +
        `<polygon points="60,96 66,86 54,86" fill="${sec}" />` +
        `<polygon points="24,60 34,54 34,66" fill="${sec}" />` +
        `<polygon points="96,60 86,54 86,66" fill="${sec}" />` +
        `<circle cx="60" cy="58" r="11" fill="#120e0b" stroke="${sec}" stroke-width="2" />` +
        `<circle cx="60" cy="58" r="5.5" fill="${eye}" />`
      );
    case 'drake':
      return (
        `<polygon points="30,38 16,18 42,30" fill="${sec}" />` +
        `<polygon points="90,38 104,18 78,30" fill="${sec}" />` +
        `<polygon points="60,26 88,48 80,86 40,86 32,48" fill="${pri}" stroke="${sec}" stroke-width="2.5" />` +
        `<polygon points="42,50 55,56 44,60" fill="${eye}" />` +
        `<polygon points="78,50 65,56 76,60" fill="${eye}" />` +
        `<polygon points="44,74 49,84 54,74 60,85 66,74 71,84 76,74" fill="#fff3d6" />`
      );
    case 'skull_lord':
      return (
        `<path d="M32,52 C32,26 88,26 88,52 C88,65 80,71 77,86 L43,86 C40,71 32,65 32,52 Z" fill="${pri}" stroke="${sec}" stroke-width="2.5" />` +
        `<circle cx="48" cy="54" r="7" fill="#0d0a08" />` +
        `<circle cx="72" cy="54" r="7" fill="#0d0a08" />` +
        `<circle cx="48" cy="54" r="3.6" fill="${eye}" />` +
        `<circle cx="72" cy="54" r="3.6" fill="${eye}" />` +
        `<polygon points="60,61 55,70 65,70" fill="#0d0a08" />` +
        `<line x1="50" y1="76" x2="50" y2="86" stroke="#0d0a08" stroke-width="2.5" />` +
        `<line x1="60" y1="76" x2="60" y2="86" stroke="#0d0a08" stroke-width="2.5" />` +
        `<line x1="70" y1="76" x2="70" y2="86" stroke="#0d0a08" stroke-width="2.5" />`
      );
    case 'sovereign':
      return (
        `<polygon points="32,40 38,20 50,34 60,16 70,34 82,20 88,40" fill="${sec}" stroke="#fff3b0" stroke-width="1.8" />` +
        `<polygon points="32,40 88,40 82,86 38,86" fill="${pri}" stroke="${sec}" stroke-width="2.6" />` +
        `<polygon points="43,54 55,58 45,62" fill="${eye}" />` +
        `<polygon points="77,54 65,58 75,62" fill="${eye}" />` +
        `<polygon points="60,64 68,75 60,84 52,75" fill="${sec}" />`
      );
    case 'omega':
    default:
      return (
        `<polygon points="22,36 12,14 38,28 60,12 82,28 108,14 98,36" fill="${sec}" stroke="#fff9db" stroke-width="2" />` +
        `<polygon points="24,36 96,36 88,88 32,88" fill="${pri}" stroke="#ffd166" stroke-width="2.8" />` +
        `<polygon points="38,50 54,56 40,61" fill="${eye}" />` +
        `<polygon points="82,50 66,56 80,61" fill="${eye}" />` +
        `<circle cx="60" cy="48" r="5" fill="${eye}" />` +
        `<polygon points="40,72 47,84 54,72 60,85 66,72 73,84 80,72" fill="#fff9db" />`
      );
  }
}

/**
 * Renders an illustrated `120×120` multi-layered SVG Boss Portrait (`data-testid="boss-portrait-svg"`).
 * Supports `(bossObj, { wave, schemeId, size, className })` AND `(bossIdStr, waveOrOpts, schemeIdOpt)`.
 * @param {object|string} [boss={}]
 * @param {object|number} [options={}]
 * @param {string} [schemeIdFallback='devour-reels']
 * @returns {string}
 */
export function renderBossPortrait(boss = {}, options = {}, schemeIdFallback = 'devour-reels') {
  const bossObj = boss && typeof boss === 'object' ? boss : { id: safeToString(boss) };
  const opts =
    options && typeof options === 'object'
      ? options
      : { wave: options, schemeId: schemeIdFallback };

  const rawWaveCandidate = opts.wave ?? bossObj.wave ?? bossObj.floor ?? 1;
  const parsedWave =
    typeof rawWaveCandidate === 'number' || typeof rawWaveCandidate === 'string'
      ? Number(rawWaveCandidate)
      : 1;
  const wave = Math.max(1, Math.floor(Number.isFinite(parsedWave) && parsedWave > 0 ? parsedWave : 1));
  const schemeId =
    safeAttr(opts.schemeId) ||
    safeAttr(bossObj.schemeId) ||
    safeAttr(schemeIdFallback) ||
    'devour-reels';
  const rawSize =
    typeof opts.size === 'number' || typeof opts.size === 'string' ? Number(opts.size) : 96;
  const size = Math.max(32, Math.floor(Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 96));
  const extractedBossId = safeToString(bossObj);
  const rawBossId = (extractedBossId || `${schemeId}_wave_${wave}`).trim().toLowerCase();
  const bossId = safeAttr(rawBossId) || `${schemeId}_wave_${wave}`;
  const extraClass = safeAttr(opts.className);

  const h = hashSpriteId(`${bossId}:${schemeId}:${wave}`);
  const chassisPool = ['ram', 'fortress', 'construct', 'drake', 'skull_lord', 'sovereign', 'omega'];
  const motif = Object.hasOwn(BOSS_MOTIFS, rawBossId)
    ? BOSS_MOTIFS[rawBossId]
    : {
        chassis: wave >= 8 ? 'omega' : chassisPool[h % chassisPool.length],
        pri: FALLBACK_PALETTE[h % FALLBACK_PALETTE.length],
        sec: '#ffd166',
        eye: '#fff9db',
      };

  const rimColor = wave >= 7 ? '#ffd166' : wave >= 4 ? '#f77f00' : '#c89b3c';
  const waveHalo =
    wave >= 5
      ? `<polygon points="60,6 114,60 60,114 6,60" fill="none" stroke="${rimColor}" stroke-width="1.6" opacity="0.65" />`
      : '';
  const mythicRing =
    wave >= 7
      ? `<circle cx="60" cy="60" r="52" fill="none" stroke="#ef476f" stroke-width="1.8" />`
      : '';

  const backing =
    `<rect x="4" y="4" width="112" height="112" rx="18" fill="#120d0b" stroke="${rimColor}" stroke-width="3" />` +
    `<rect x="10" y="10" width="100" height="100" rx="13" fill="#1f1214" stroke="#5a4114" stroke-width="1.4" />` +
    waveHalo +
    mythicRing;

  const rivets =
    '<circle cx="15" cy="15" r="2.5" fill="#c89b3c" />' +
    '<circle cx="105" cy="15" r="2.5" fill="#c89b3c" />' +
    '<circle cx="15" cy="105" r="2.5" fill="#c89b3c" />' +
    '<circle cx="105" cy="105" r="2.5" fill="#c89b3c" />';

  const cls = `boss-portrait-svg${extraClass ? ` ${extraClass}` : ''}`;
  const body = renderBossChassisSvg(motif.chassis, motif.pri, motif.sec, motif.eye);

  return compactSvg(
    `<svg class="${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" data-testid="boss-portrait-svg" data-boss-id="${bossId}" data-wave="${wave}" data-scheme-id="${schemeId}" aria-hidden="true">${backing}${body}${rivets}</svg>`
  );
}

export default {
  TIER_FRAME_PALETTE,
  safeToString,
  hashSpriteId,
  normalizeSpriteId,
  renderSprite,
  renderBossPortrait,
};
