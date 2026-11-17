import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_ROOT,
  SCHEME_IDS,
  GDD_FILES,
  fileExists,
  readProjectText,
  loadProjectModule,
  createSoundEngineInstance,
  normalizeGameState,
  forceEngineState,
  installMockBrowserEnv,
  MockElement,
  createHeadlessBrowserSession,
  withHeadlessBrowser,
} from './helpers/e2e-harness.js';

// ============================================================================
// Tier 6 Shared Constants, SVG Validators & Live Browser Session Helpers
// ============================================================================

const buildIndexedTestIdSelector = (prefix, count) =>
  Array.from({ length: count }, (_, i) => `[data-testid="${prefix}${i}"]`).join(', ');

const SCHEME_UI_TARGETS = Object.freeze({
  'devour-reels': Object.freeze({
    navTestId: 'nav-scheme-1',
    ctaTestId: 'btn-spin-devour',
    stageTestId: 'devour-grid',
    entitySelector: buildIndexedTestIdSelector('devour-cell-', 9),
    expectedEntityCount: 9,
  }),
  'revolver-dungeon': Object.freeze({
    navTestId: 'nav-scheme-2',
    ctaTestId: 'btn-spin-fire',
    stageTestId: 'revolver-cylinder',
    entitySelector: buildIndexedTestIdSelector('chamber-', 6),
    expectedEntityCount: 6,
  }),
  'jackpot-td': Object.freeze({
    navTestId: 'nav-scheme-3',
    ctaTestId: 'btn-pull-lever',
    stageTestId: 'td-slot-bar',
    entitySelector: buildIndexedTestIdSelector('td-pedestal-', 5),
    expectedEntityCount: 5,
  }),
  'sigil-pachinko': Object.freeze({
    navTestId: 'nav-scheme-4',
    ctaTestId: 'btn-drop-orbs',
    stageTestId: 'pachinko-board',
    entitySelector: '[data-testid="pachinko-board"] .pachinko-peg',
    expectedEntityCount: 24,
  }),
  'abyssal-grid': Object.freeze({
    navTestId: 'nav-scheme-5',
    ctaTestId: 'btn-matrix-spin',
    stageTestId: 'abyssal-matrix',
    entitySelector: buildIndexedTestIdSelector('matrix-cell-', 16),
    expectedEntityCount: 16,
  }),
});

const FORBIDDEN_RAW_SYNERGY_IDS = Object.freeze([
  'fireball_powder_keg',
  'triple_iron_knights',
  'hero_banquet',
  'curse_transmutation',
  'full_board_gluttony',
]);

const SPRITE_FORGE_REQUIRED_IDS = Object.freeze({
  scheme1: [
    'goblin',
    'chest',
    'powder_keg',
    'curse_skull',
    'iron_knight',
    'fireball',
    'digestive_herb',
    'hero_berserker',
    'abyss_apostle',
    'abyssal_maw',
  ],
  scheme2: [
    'empty',
    'lead_bullet',
    'vampire_bullet',
    'scatter_bullet',
    'parasite_bullet',
    'powder_charge',
    'fuse_cord',
    'heavy_hammer',
    'demon_bullet',
    'revolver_spindle',
  ],
  scheme3: [
    'miner_pick',
    'gold_nugget',
    'cryo_prism',
    'tesla_coil',
    'prism_laser',
    'nuke_core',
    'gob_runner',
    'shield_bearer',
    'tunnel_berserker',
    'siege_dreadnought',
  ],
  scheme4: [
    'ember_orb',
    'gold_droplet',
    'frost_core',
    'lightning_sphere',
    'gold_stone',
    'volatile_mercury',
    'void_glutton_orb',
    'void_singularity',
    'philosopher_stone',
    'peg_ember',
    'ember',
    'peg_volt',
    'volt',
    'peg_gold',
    'gold',
    'peg_glutton',
    'glutton',
    'crucible',
  ],
  scheme5: [
    'skeleton_pawn',
    'skeleton',
    'slime_blob',
    'mana_crystal',
    'gold_mimic',
    'imp_scout',
    'mimic_chest',
    'cursed_urn',
    'abyssal_knight',
    'blood_archmage',
    'soul_cannon',
    'void_reaper',
    'golden_overlord',
  ],
  relics: [
    'greed_ledger',
    'gluttony_jaw',
    'acid_reflux_core',
    'pyro_catalyst',
    'russian_roulette_coin',
    'compound_vault',
    'chronos_lever',
    'abyssal_crown',
  ],
});

const HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clusterCoordinateBands(values, tolerancePx = 14) {
  const nums = (values || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (nums.length === 0) return [];
  const clusters = [[nums[0]]];
  for (let i = 1; i < nums.length; i++) {
    const cur = clusters[clusters.length - 1];
    const mean = cur.reduce((acc, x) => acc + x, 0) / cur.length;
    if (Math.abs(nums[i] - mean) <= tolerancePx) {
      cur.push(nums[i]);
    } else {
      clusters.push([nums[i]]);
    }
  }
  return clusters.map((c) => c.reduce((acc, x) => acc + x, 0) / c.length);
}

function extractRelicIds(state) {
  const list = state?.ownedRelics ?? state?.relics ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => (typeof r === 'string' ? r : r?.id || r?.relicId || ''))
    .filter(Boolean);
}

/**
 * Validates all 3 strict MockElement SVG rules from PROJECT.md § 6.1:
 *  1. Every childless SVG element (<path />, <circle />, <rect />, <polygon />, <line />,
 *     <ellipse />, <polyline />, <stop />, etc.) ends with explicit `/>` or matching closing tag.
 *  2. Zero `<text>` elements inside `<svg>`.
 *  3. Zero literal `>` characters inside any quoted HTML/SVG attribute value.
 *  4. Clean round-trip inside `MockElement` without corrupting sibling queries or `textContent`.
 */
function validateMockElementSafeSVG(svg, label = 'SVG') {
  assert.equal(typeof svg, 'string', `[${label}] Expected SVG string`);
  const trimmed = svg.trim();
  assert.ok(
    trimmed.startsWith('<svg') && trimmed.endsWith('</svg>'),
    `[${label}] Expected inline <svg>...</svg>, got: ${trimmed.slice(0, 120)}`
  );

  // Rule 3: Quote-aware scan for literal `>` inside attribute quotes
  let inTag = false;
  let quoteChar = null;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (!inTag) {
      if (ch === '<') {
        if (trimmed.slice(i, i + 4) === '<!--') {
          const endComment = trimmed.indexOf('-->', i + 4);
          i = endComment === -1 ? trimmed.length : endComment + 2;
          continue;
        }
        inTag = true;
      }
    } else if (quoteChar) {
      assert.notEqual(
        ch,
        '>',
        `[${label}] Forbidden literal '>' inside quoted SVG/HTML attribute at index ${i}`
      );
      if (ch === quoteChar) quoteChar = null;
    } else if (ch === '"' || ch === "'") {
      quoteChar = ch;
    } else if (ch === '>') {
      inTag = false;
    }
  }
  assert.equal(quoteChar, null, `[${label}] Unclosed attribute quote in SVG`);

  // Rule 2: Zero <text> elements & zero OS pictographic emojis inside <svg>
  assert.equal(
    /<text[\s>/]/i.test(trimmed),
    false,
    `[${label}] <svg> must not contain <text> elements (breaks MockElement.textContent)`
  );
  assert.equal(
    /\p{Extended_Pictographic}/u.test(trimmed),
    false,
    `[${label}] <svg> must not contain raw OS emojis`
  );

  // Rule 1: Strict LIFO XML/SVG tag balance check
  const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '');
  const tagRegex = /<\/([a-zA-Z0-9:_-]+)\s*>|<([a-zA-Z0-9:_-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  let m;
  while ((m = tagRegex.exec(withoutComments)) !== null) {
    const [, closeTag, openTag, , selfCloseSlash] = m;
    if (closeTag) {
      const lowerClose = closeTag.toLowerCase();
      assert.ok(
        stack.length > 0,
        `[${label}] Unexpected closing tag </${closeTag}> with empty stack`
      );
      const top = stack.pop();
      assert.equal(
        top,
        lowerClose,
        `[${label}] Unclosed childless/inner SVG tag <${top}> before </${closeTag}> (missing explicit '/>'?)`
      );
    } else if (openTag) {
      const lowerOpen = openTag.toLowerCase();
      if (!selfCloseSlash && !HTML_VOID_TAGS.has(lowerOpen)) {
        stack.push(lowerOpen);
      }
    }
  }
  assert.deepEqual(
    stack,
    [],
    `[${label}] Unclosed SVG tags remaining on stack: [${stack.join(', ')}]`
  );

  // Rule 4: MockElement round-trip proof
  const probe = new MockElement('div');
  probe.innerHTML = `<div class="forge-probe-card">${trimmed}<span data-testid="post-svg-sentinel">120 HP</span></div>`;
  assert.equal(
    probe.textContent.trim(),
    '120 HP',
    `[${label}] SVG leaked text into MockElement.textContent: "${probe.textContent}"`
  );
  const sentinel = probe.querySelector('[data-testid="post-svg-sentinel"]');
  assert.ok(sentinel, `[${label}] Sibling element after SVG was swallowed by MockElement parser`);
  assert.equal(
    sentinel.parentElement?.classList.contains('forge-probe-card'),
    true,
    `[${label}] Sibling element parent hierarchy corrupted by unclosed SVG tag`
  );
}

let sharedBrowser = null;
let sharedBootError = null;

async function getLiveBrowser() {
  if (sharedBootError) {
    assert.fail(`[Tier 6 Live Browser Boot Failed] ${sharedBootError.message}`);
  }
  if (!sharedBrowser) {
    try {
      sharedBrowser = await createHeadlessBrowserSession({
        path: '/',
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      });
    } catch (err) {
      sharedBootError = err;
      assert.fail(`[Tier 6 Live Browser Boot Failed] ${err.message}`);
    }
  }
  return sharedBrowser;
}

after(async () => {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
});

async function prepareLiveScheme(browser, schemeId = 'devour-reels', options = {}) {
  const width = options.width ?? 1440;
  const height = options.height ?? 900;
  const mobile = options.mobile ?? width <= 500;
  await browser.setViewport(width, height, {
    mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  await browser.eval(`new Promise((resolve) => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.switchScheme(${JSON.stringify(schemeId)});
    b.resetGame({ seed: ${Number(options.seed ?? 601)} });
    b.resumeRealtimeLoop?.();
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  })`);
  return await browser.getBridgeState();
}

function listFilesRecursively(dirPath, extFilter = null) {
  const out = [];
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursively(full, extFilter));
    } else if (!extFilter || extFilter(full)) {
      out.push(full);
    }
  }
  return out;
}

// ============================================================================
// PILLAR 1: Viewport Fit, Above-the-Fold Playability & Theme (T6-01 .. T6-04)
// ============================================================================

test('T6-01: [F-R2-01 / Pillar 1] Desktop 1440×900 zero horizontal overflow & above-the-fold primary CTA across all 5 schemes', async () => {
  const browser = await getLiveBrowser();
  for (const schemeId of SCHEME_IDS) {
    await prepareLiveScheme(browser, schemeId, { width: 1440, height: 900, seed: 601 });
    const { ctaTestId } = SCHEME_UI_TARGETS[schemeId];
    const metrics = await browser.eval(`(() => {
      const doc = document.documentElement;
      const el = document.querySelector('[data-testid="${ctaTestId}"]');
      if (!el) {
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          innerHeight: window.innerHeight,
          exists: false,
        };
      }
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        innerHeight: window.innerHeight,
        exists: true,
        disabled: Boolean(el.disabled),
        display: cs.display,
        visibility: cs.visibility,
        rect: {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        },
      };
    })()`);

    assert.ok(
      metrics.scrollWidth <= metrics.clientWidth + 2,
      `[${schemeId}] Desktop 1440×900 horizontal overflow: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`
    );
    assert.equal(metrics.exists, true, `[${schemeId}] Missing primary CTA [data-testid="${ctaTestId}"]`);
    assert.equal(metrics.disabled, false, `[${schemeId}] Primary CTA [data-testid="${ctaTestId}"] must be enabled`);
    assert.notEqual(metrics.display, 'none', `[${schemeId}] Primary CTA must be displayed`);
    assert.notEqual(metrics.visibility, 'hidden', `[${schemeId}] Primary CTA must be visible`);
    assert.ok(
      metrics.rect.width >= 80 && metrics.rect.height >= 28,
      `[${schemeId}] Primary CTA bounds too small: ${JSON.stringify(metrics.rect)}`
    );
    assert.ok(
      metrics.rect.top >= 0 && metrics.rect.bottom <= 900,
      `[${schemeId}] Primary CTA [data-testid="${ctaTestId}"] pushed below 1440×900 fold: bottom=${metrics.rect.bottom} (must be <= 900)`
    );
    assert.ok(
      metrics.rect.left >= 0 && metrics.rect.right <= metrics.clientWidth + 2,
      `[${schemeId}] Primary CTA horizontally clipped: ${JSON.stringify(metrics.rect)}`
    );
  }
});

test('T6-02: [F-R2-01 / Pillar 1] Desktop 1440×900 on-stage boss-arena-card & interactive stage above-the-fold fit across all 5 schemes', async () => {
  const browser = await getLiveBrowser();
  for (const schemeId of SCHEME_IDS) {
    await prepareLiveScheme(browser, schemeId, { width: 1440, height: 900, seed: 602 });
    const { stageTestId } = SCHEME_UI_TARGETS[schemeId];
    const info = await browser.eval(`(() => {
      const doc = document.documentElement;
      const bossEl = document.querySelector('[data-testid="boss-arena-card"]');
      const stageEl = document.querySelector('[data-testid="${stageTestId}"]');
      const toRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        };
      };
      return {
        clientWidth: doc.clientWidth,
        bossExists: Boolean(bossEl),
        bossRect: toRect(bossEl),
        stageExists: Boolean(stageEl),
        stageRect: toRect(stageEl),
      };
    })()`);

    assert.equal(
      info.bossExists,
      true,
      `[${schemeId}] Expected on-stage [data-testid="boss-arena-card"] per PROJECT.md § 6.4`
    );
    assert.ok(
      info.bossRect.width >= 120 && info.bossRect.height >= 50,
      `[${schemeId}] boss-arena-card bounds too small: ${JSON.stringify(info.bossRect)}`
    );
    assert.ok(
      info.bossRect.top >= 0 && info.bossRect.bottom <= 900,
      `[${schemeId}] boss-arena-card pushed outside 1440×900 viewport: ${JSON.stringify(info.bossRect)}`
    );
    assert.ok(
      info.bossRect.left >= 0 && info.bossRect.right <= info.clientWidth + 2,
      `[${schemeId}] boss-arena-card horizontally clipped: ${JSON.stringify(info.bossRect)}`
    );

    assert.equal(
      info.stageExists,
      true,
      `[${schemeId}] Missing interactive stage [data-testid="${stageTestId}"]`
    );
    assert.ok(
      info.stageRect.width >= 180 && info.stageRect.height >= 50,
      `[${schemeId}] Stage [${stageTestId}] bounds too small: ${JSON.stringify(info.stageRect)}`
    );
    assert.ok(
      info.stageRect.top >= 0 && info.stageRect.bottom <= 900,
      `[${schemeId}] Stage [${stageTestId}] overflows below y=900 on desktop: ${JSON.stringify(info.stageRect)}`
    );
  }
});

test('T6-03: [F-R2-01 / Pillar 1] Mobile 390×844 responsive layout, zero horizontal clipping & positive interactive bounds across all 5 schemes', async () => {
  const browser = await getLiveBrowser();
  try {
    for (const schemeId of SCHEME_IDS) {
      await prepareLiveScheme(browser, schemeId, {
        width: 390,
        height: 844,
        mobile: true,
        seed: 603,
      });
      const { ctaTestId, stageTestId } = SCHEME_UI_TARGETS[schemeId];
      const m = await browser.eval(`(() => {
        const doc = document.documentElement;
        const measure = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            disabled: Boolean(el.disabled),
            width: r.width,
            height: r.height,
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
          };
        };
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          boss: measure('[data-testid="boss-arena-card"]'),
          stage: measure('[data-testid="${stageTestId}"]'),
          cta: measure('[data-testid="${ctaTestId}"]'),
        };
      })()`);

      assert.ok(m.clientWidth <= 390, `[${schemeId}] Expected mobile clientWidth <= 390, got ${m.clientWidth}`);
      assert.ok(
        m.scrollWidth <= m.clientWidth + 2,
        `[${schemeId}] Mobile 390×844 horizontal overflow: scrollWidth=${m.scrollWidth} > clientWidth=${m.clientWidth}`
      );
      assert.ok(m.boss, `[${schemeId}] Missing [data-testid="boss-arena-card"] on mobile 390×844`);
      assert.ok(m.stage, `[${schemeId}] Missing [data-testid="${stageTestId}"] on mobile 390×844`);
      assert.ok(m.cta, `[${schemeId}] Missing [data-testid="${ctaTestId}"] on mobile 390×844`);

      for (const [name, rect] of [
        ['boss-arena-card', m.boss],
        [stageTestId, m.stage],
        [ctaTestId, m.cta],
      ]) {
        assert.ok(
          rect.width >= 44 && rect.height >= 28,
          `[${schemeId}] Mobile ${name} has collapsed bounds: ${JSON.stringify(rect)}`
        );
        assert.ok(
          rect.left >= -2 && rect.right <= m.clientWidth + 2,
          `[${schemeId}] Mobile ${name} clipped horizontally outside [0, ${m.clientWidth}]: ${JSON.stringify(rect)}`
        );
      }
      assert.equal(m.cta.disabled, false, `[${schemeId}] Mobile primary CTA must remain enabled`);
    }
  } finally {
    await browser.setViewport(1440, 900, { mobile: false, deviceScaleFactor: 1 });
  }
});

test('T6-04: [F-R2-01 / Pillar 1] Tactile Casino-Dungeon theme palette, tabular-nums alignment & compact non-crowding sandbox-toolbar', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 604 });
  const mainCss = readProjectText('src/styles/main.css');

  const styleInfo = await browser.eval(`(() => {
    const bodyCs = window.getComputedStyle(document.body);
    const activeTab = document.querySelector('.nav-tab-btn.active, [data-testid="nav-scheme-1"]');
    const tabCs = activeTab ? window.getComputedStyle(activeTab) : null;
    const totalDmg = document.querySelector('[data-testid="hud-total-damage"]');
    const dmgCs = totalDmg ? window.getComputedStyle(totalDmg) : null;
    const sandbox = document.querySelector('[data-testid="sandbox-toolbar"]');
    const seedInput = document.querySelector('[data-testid="sandbox-seed-input"]');
    const jackpotBtn = document.querySelector('[data-testid="sandbox-trigger-jackpot"]');
    const muteBtn = document.querySelector('[data-testid="audio-mute-toggle"]');
    const spinBtn = document.querySelector('[data-testid="btn-spin-devour"]');
    const spinRect = spinBtn ? spinBtn.getBoundingClientRect() : null;
    const sandboxRect = sandbox ? sandbox.getBoundingClientRect() : null;
    return {
      bodyBg: bodyCs.backgroundColor,
      tabBgColor: tabCs ? tabCs.backgroundColor : '',
      tabBgImage: tabCs ? tabCs.backgroundImage : '',
      dmgFontVariantNumeric: dmgCs ? dmgCs.fontVariantNumeric : '',
      hasSandbox: Boolean(sandbox),
      hasSeedInput: Boolean(seedInput),
      hasJackpotBtn: Boolean(jackpotBtn),
      hasMuteBtn: Boolean(muteBtn),
      spinBottom: spinRect ? spinRect.bottom : 9999,
      sandboxHeight: sandboxRect ? sandboxRect.height : 0,
    };
  })()`);

  assert.notEqual(
    styleInfo.bodyBg,
    'rgb(11, 9, 20)',
    'Body background must replace legacy R1 purple-black #0b0914 with Obsidian/Brass/Crimson Casino-Dungeon theme'
  );
  assert.equal(
    `${styleInfo.tabBgColor} ${styleInfo.tabBgImage}`.includes('rgb(155, 93, 229)'),
    false,
    'Active navigation tab must replace legacy R1 neon-purple #9b5de5 gradient'
  );
  assert.equal(
    mainCss.includes('--bg-slot-cell: #251e3e'),
    false,
    'src/styles/main.css must replace legacy purple slot-cell token #251e3e'
  );
  assert.ok(
    styleInfo.dmgFontVariantNumeric.includes('tabular-nums') ||
      mainCss.includes('tabular-nums'),
    'Scoreboard / numeric counters must enable tabular-nums alignment'
  );
  assert.equal(styleInfo.hasSandbox, true, 'Missing [data-testid="sandbox-toolbar"]');
  assert.equal(styleInfo.hasSeedInput, true, 'Missing [data-testid="sandbox-seed-input"]');
  assert.equal(styleInfo.hasJackpotBtn, true, 'Missing [data-testid="sandbox-trigger-jackpot"]');
  assert.equal(styleInfo.hasMuteBtn, true, 'Missing [data-testid="audio-mute-toggle"]');
  assert.ok(
    styleInfo.spinBottom <= 900,
    `Sandbox toolbar must not push [data-testid="btn-spin-devour"] below 900px fold (got bottom=${styleInfo.spinBottom})`
  );
});

// ============================================================================
// PILLAR 2: SpriteForge.js Procedural SVG & Zero Raw Debug Strings (T6-05..09)
// ============================================================================

test('T6-05: [F-R2-01 / Pillar 2] SpriteForge.renderSprite() complete 5-scheme entity, 8-relic & deterministic hash fallback contract', async () => {
  const spriteMod = await loadProjectModule('src/ui/SpriteForge.js');
  assert.equal(
    typeof spriteMod.renderSprite,
    'function',
    'src/ui/SpriteForge.js must export named function renderSprite(id, options)'
  );
  const { renderSprite } = spriteMod;

  const s1Cfg = await loadProjectModule('src/games/devour-reels/config.js');
  const s2Cfg = await loadProjectModule('src/games/revolver-dungeon/config.js');
  const s3Cfg = await loadProjectModule('src/games/jackpot-td/config.js');
  const s4Cfg = await loadProjectModule('src/games/sigil-pachinko/config.js');
  const s5Cfg = await loadProjectModule('src/games/abyssal-grid/config.js');
  const econMod = await loadProjectModule('src/core/EconomyEngine.js');

  const dynamicIds = [
    ...(s1Cfg.SYMBOLS || []).map((x) => x.id),
    ...(s2Cfg.BULLET_LIST || []).map((x) => x.id),
    ...(s3Cfg.TOWERS || []).map((x) => x.id),
    ...(s3Cfg.ENEMIES || []).map((x) => x.id),
    ...(s4Cfg.ORB_LIST || []).map((x) => x.id),
    ...(s4Cfg.PEG_TYPES || []).map((x) => x.id),
    ...(s5Cfg.UNIT_LIST || []).map((x) => x.id),
    ...(econMod.DEFAULT_RELIC_CATALOG || []).map((x) => x.id),
  ].filter(Boolean);

  const allIds = new Set([
    ...Object.values(SPRITE_FORGE_REQUIRED_IDS).flat(),
    ...dynamicIds,
  ]);

  for (const id of allIds) {
    const svgA = renderSprite(id, { size: 48, tier: 2 });
    const svgB = renderSprite(id, { size: 48, tier: 2 });
    assert.equal(svgA, svgB, `renderSprite('${id}') must be 100% deterministic`);
    assert.ok(
      svgA.includes('viewBox="0 0 64 64"'),
      `renderSprite('${id}') must include viewBox="0 0 64 64"`
    );
    const shapeMatches = svgA.match(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/gi) || [];
    assert.ok(
      shapeMatches.length >= 2,
      `renderSprite('${id}') must render multi-layered vector geometry (>=2 shapes), got ${shapeMatches.length}`
    );
  }

  // Verify custom size & className options
  const customSvg = renderSprite('fireball', {
    size: 56,
    tier: 3,
    className: 'forge-medallion-t3',
  });
  assert.ok(customSvg.includes('forge-medallion-t3'), 'renderSprite must apply options.className');
  assert.ok(customSvg.includes('56'), 'renderSprite must reflect options.size');

  // Verify all 9 canonical Scheme 1 symbols produce 9 distinct illustrations
  const s1Unique = new Set(
    SPRITE_FORGE_REQUIRED_IDS.scheme1.slice(0, 9).map((id) => renderSprite(id))
  );
  assert.equal(
    s1Unique.size,
    9,
    `All 9 Scheme 1 symbols must produce distinct SVG artwork, got ${s1Unique.size}`
  );

  // Verify deterministic fallback for unknown/edge IDs
  const fallbackAlpha1 = renderSprite('unknown_sigil_alpha');
  const fallbackAlpha2 = renderSprite('unknown_sigil_alpha');
  const fallbackBeta = renderSprite('unknown_sigil_beta');
  const fallbackEmpty = renderSprite('');
  assert.equal(fallbackAlpha1, fallbackAlpha2, 'Unknown ID fallback must be deterministic');
  assert.notEqual(
    fallbackAlpha1,
    fallbackBeta,
    'Different unknown IDs must produce distinct hash fallback SVGs'
  );
  assert.ok(
    fallbackEmpty.includes('viewBox="0 0 64 64"'),
    'Empty/unknown ID fallback must still return valid viewBox="0 0 64 64" SVG'
  );
});

test('T6-06: [F-R2-01 / Pillar 2] SpriteForge.renderBossPortrait() Waves 1..8 × all 5 schemes illustrated Boss portrait contract', async () => {
  const spriteMod = await loadProjectModule('src/ui/SpriteForge.js');
  assert.equal(
    typeof spriteMod.renderBossPortrait,
    'function',
    'src/ui/SpriteForge.js must export named function renderBossPortrait(boss, options)'
  );
  const { renderBossPortrait } = spriteMod;

  const cfgByScheme = {
    'devour-reels': await loadProjectModule('src/games/devour-reels/config.js'),
    'revolver-dungeon': await loadProjectModule('src/games/revolver-dungeon/config.js'),
    'jackpot-td': await loadProjectModule('src/games/jackpot-td/config.js'),
    'sigil-pachinko': await loadProjectModule('src/games/sigil-pachinko/config.js'),
    'abyssal-grid': await loadProjectModule('src/games/abyssal-grid/config.js'),
  };

  const defaultPortrait = renderBossPortrait();
  assert.ok(
    defaultPortrait.includes('viewBox="0 0 120 120"') &&
      defaultPortrait.includes('data-testid="boss-portrait-svg"'),
    'Default no-arg renderBossPortrait() must render viewBox="0 0 120 120" with data-testid="boss-portrait-svg"'
  );

  const wave1Set = new Set();
  for (const schemeId of SCHEME_IDS) {
    const cfg = cfgByScheme[schemeId];
    const portraitsForScheme = [];
    for (let wave = 1; wave <= 8; wave++) {
      const bossObj =
        cfg.getBossForWave?.(wave) ||
        cfg.getBossForFloor?.(wave) ||
        (cfg.BOSSES || cfg.DUNGEON_BOSSES || [])[wave - 1] || {
          id: `${schemeId}_boss_${wave}`,
          wave,
        };
      const p1 = renderBossPortrait(bossObj, { wave, schemeId, size: 96 });
      const p2 = renderBossPortrait(bossObj, { wave, schemeId, size: 96 });
      assert.equal(p1, p2, `renderBossPortrait(${schemeId}, wave=${wave}) must be deterministic`);
      assert.ok(
        p1.includes('viewBox="0 0 120 120"'),
        `[${schemeId} W${wave}] Boss portrait must use viewBox="0 0 120 120"`
      );
      assert.ok(
        p1.includes('data-testid="boss-portrait-svg"'),
        `[${schemeId} W${wave}] Boss portrait must carry data-testid="boss-portrait-svg"`
      );
      const shapes = p1.match(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/gi) || [];
      assert.ok(
        shapes.length >= 4,
        `[${schemeId} W${wave}] Boss portrait must contain >= 4 layered vector primitives, got ${shapes.length}`
      );
      portraitsForScheme.push(p1);
      if (wave === 1) wave1Set.add(p1);
    }
    assert.notEqual(
      portraitsForScheme[0],
      portraitsForScheme[7],
      `[${schemeId}] Wave 1 Boss portrait must visually differ from Wave 8 Final Boss portrait`
    );
  }

  assert.ok(
    wave1Set.size >= 3,
    `Wave 1 Boss portraits across the 5 schemes must be differentiated (expected >= 3 distinct SVGs, got ${wave1Set.size})`
  );
});

test('T6-07: [F-R2-01 / Pillar 2] Strict MockElement SVG parser safety audit across all SpriteForge sprites & Boss portraits', async () => {
  const spriteMod = await loadProjectModule('src/ui/SpriteForge.js');
  assert.equal(typeof spriteMod.renderSprite, 'function', 'Missing renderSprite export');
  assert.equal(typeof spriteMod.renderBossPortrait, 'function', 'Missing renderBossPortrait export');

  let checkedCount = 0;
  for (const [group, ids] of Object.entries(SPRITE_FORGE_REQUIRED_IDS)) {
    for (const id of ids) {
      for (const tier of [1, 2, 3, 4]) {
        const svg = spriteMod.renderSprite(id, { size: 48, tier });
        validateMockElementSafeSVG(svg, `renderSprite(${group}:${id}:T${tier})`);
        checkedCount++;
      }
    }
  }

  for (const fallbackId of ['unknown_probe_1', 'unknown_probe_2', '']) {
    validateMockElementSafeSVG(
      spriteMod.renderSprite(fallbackId),
      `renderSprite(fallback:${fallbackId})`
    );
    checkedCount++;
  }

  for (const schemeId of SCHEME_IDS) {
    for (let wave = 1; wave <= 8; wave++) {
      const portrait = spriteMod.renderBossPortrait(
        { id: `${schemeId}_w${wave}`, wave },
        { wave, schemeId, size: 96 }
      );
      validateMockElementSafeSVG(portrait, `renderBossPortrait(${schemeId}:W${wave})`);
      checkedCount++;
    }
  }

  assert.ok(checkedCount >= 120, `Expected >= 120 SVG safety validations, ran ${checkedCount}`);
});

test('T6-08: [F-R2-01 / Pillar 2] Live browser bespoke inline <svg> icons & boss-portrait-svg across all 5 schemes', async () => {
  const browser = await getLiveBrowser();
  for (const schemeId of SCHEME_IDS) {
    await prepareLiveScheme(browser, schemeId, { width: 1440, height: 900, seed: 608 });
    const { entitySelector, expectedEntityCount } = SCHEME_UI_TARGETS[schemeId];
    const art = await browser.eval(`(() => {
      const bossSvg = document.querySelector('[data-testid="boss-arena-card"] [data-testid="boss-portrait-svg"]');
      const bossRect = bossSvg ? bossSvg.getBoundingClientRect() : null;
      const entities = Array.from(document.querySelectorAll(${JSON.stringify(entitySelector)}));
      let entitiesWithRenderedSvg = 0;
      for (const el of entities) {
        const svg = el.querySelector('svg');
        if (svg) {
          const r = svg.getBoundingClientRect();
          if (r.width >= 10 && r.height >= 10) entitiesWithRenderedSvg++;
        }
      }
      const mawSvg = Boolean(document.querySelector('[data-testid="abyssal-maw"] svg'));
      const tdEnemySvgCount = document.querySelectorAll('.td-enemy-token svg').length;
      const spawnerSvgCount = document.querySelectorAll('[data-testid="pachinko-spawner"] svg').length;
      return {
        hasBossSvg: Boolean(bossSvg && bossSvg.tagName.toLowerCase() === 'svg'),
        bossViewBox: bossSvg ? bossSvg.getAttribute('viewBox') : null,
        bossWidth: bossRect ? bossRect.width : 0,
        bossHeight: bossRect ? bossRect.height : 0,
        entityCount: entities.length,
        entitiesWithRenderedSvg,
        mawSvg,
        tdEnemySvgCount,
        spawnerSvgCount,
      };
    })()`);

    assert.equal(
      art.hasBossSvg,
      true,
      `[${schemeId}] Expected [data-testid="boss-arena-card"] [data-testid="boss-portrait-svg"] inline <svg>`
    );
    assert.equal(
      art.bossViewBox,
      '0 0 120 120',
      `[${schemeId}] Expected boss-portrait-svg viewBox="0 0 120 120", got ${art.bossViewBox}`
    );
    assert.ok(
      art.bossWidth >= 40 && art.bossHeight >= 40,
      `[${schemeId}] Boss SVG portrait rendered too small: ${art.bossWidth}×${art.bossHeight}`
    );
    assert.equal(
      art.entityCount,
      expectedEntityCount,
      `[${schemeId}] Expected ${expectedEntityCount} entities for ${entitySelector}, got ${art.entityCount}`
    );
    assert.equal(
      art.entitiesWithRenderedSvg,
      expectedEntityCount,
      `[${schemeId}] Every entity slot must contain a rendered inline <svg> (${art.entitiesWithRenderedSvg}/${expectedEntityCount})`
    );
    if (schemeId === 'devour-reels') {
      assert.equal(art.mawSvg, true, '[devour-reels] [data-testid="abyssal-maw"] must render an inline <svg>');
    }
    if (schemeId === 'jackpot-td') {
      assert.ok(art.tdEnemySvgCount >= 1, '[jackpot-td] Marching .td-enemy-token elements must render inline <svg> sprites');
    }
    if (schemeId === 'sigil-pachinko') {
      assert.ok(art.spawnerSvgCount >= 3, '[sigil-pachinko] [data-testid="pachinko-spawner"] must render 3 orb <svg> sprites');
    }
  }
});

test('T6-09: [F-R2-01 / F-R2-02 / Pillar 2] Zero raw snake_case synergy IDs or debug placeholders in visible stage & HUD text', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 609 });

  const multiSynergyResult = await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.forceGridOrCylinder([
      'fireball',
      'powder_keg',
      'iron_knight',
      'iron_knight',
      'abyss_apostle',
      'iron_knight',
      'hero_berserker',
      'goblin',
      'curse_skull',
    ]);
    document.querySelector('[data-testid="btn-spin-devour"]')?.click();
    const st = b.getState();
    const hudText = document.querySelector('#hud-container')?.innerText || '';
    const stageText = document.querySelector('#game-stage, #scheme-mount')?.innerText || document.body.innerText || '';
    return {
      synergies: st.lastTurnBreakdown?.triggeredSynergies || [],
      visibleText: hudText + '\\n' + stageText,
    };
  })()`);

  assert.ok(
    multiSynergyResult.synergies.length >= 2,
    `Expected >= 2 synergies triggered on forced board, got: ${JSON.stringify(multiSynergyResult.synergies)}`
  );
  for (const rawId of FORBIDDEN_RAW_SYNERGY_IDS) {
    assert.equal(
      multiSynergyResult.visibleText.includes(rawId),
      false,
      `Raw snake_case synergy ID "${rawId}" leaked into visible HUD/stage text!`
    );
  }

  try {
    for (const schemeId of SCHEME_IDS) {
      await prepareLiveScheme(browser, schemeId, { width: 1440, height: 900, seed: 609 });
      const textSnap = await browser.eval(`(() => {
        const readVisible = () =>
          (document.querySelector('#hud-container')?.innerText || '') +
          '\\n' +
          (document.querySelector('#game-stage, #scheme-mount')?.innerText || '');
        const before = readVisible();
        document.querySelector('[data-testid="sandbox-trigger-jackpot"]')?.click();
        const after = readVisible();
        return before + '\\n' + after;
      })()`);

      for (const rawId of FORBIDDEN_RAW_SYNERGY_IDS) {
        assert.equal(
          textSnap.includes(rawId),
          false,
          `[${schemeId}] Raw snake_case synergy ID "${rawId}" visible after jackpot`
        );
      }
      for (const badToken of ['undefined', 'NaN', '[object Object]']) {
        assert.equal(
          textSnap.includes(badToken),
          false,
          `[${schemeId}] Debug placeholder "${badToken}" leaked into visible text`
        );
      }
    }
  } finally {
    await browser.eval(`(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).resumeRealtimeLoop?.()`);
  }
});

// ============================================================================
// PILLAR 3: Live 60fps VFXCanvas, 5-Factor HUD & Master-Bus Audio (T6-10..13)
// ============================================================================

test('T6-10: [F-R2-02 / F-R2-07 / Pillar 3] Live browser 60fps #vfx-canvas pixel proof (nonZeroPixels > 200 without stepSimulation) & shake class decay', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 610 });

  // Trigger Jackpot via real DOM button click WITHOUT calling stepSimulation()
  await browser.clickTestId('sandbox-trigger-jackpot');

  let maxNonZeroPixels = 0;
  let canvasSize = { width: 0, height: 0 };
  for (let i = 0; i < 10; i++) {
    await sleep(45);
    const sample = await browser.eval(`(() => {
      const c = document.querySelector('#vfx-canvas') || document.querySelector('[data-testid="vfx-canvas"]');
      if (!c || c.width <= 0 || c.height <= 0) {
        return { width: c ? c.width : 0, height: c ? c.height : 0, nonZeroPixels: 0 };
      }
      const ctx = c.getContext('2d');
      if (!ctx) return { width: c.width, height: c.height, nonZeroPixels: 0 };
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonZero = 0;
      for (let idx = 3; idx < data.length; idx += 4) {
        if (data[idx] > 0) nonZero++;
      }
      return { width: c.width, height: c.height, nonZeroPixels: nonZero };
    })()`);
    canvasSize = { width: sample.width, height: sample.height };
    if (sample.nonZeroPixels > maxNonZeroPixels) {
      maxNonZeroPixels = sample.nonZeroPixels;
    }
    if (maxNonZeroPixels > 200 && i >= 2) break;
  }

  assert.ok(
    canvasSize.width >= 400 && canvasSize.height >= 250,
    `Expected sized HiDPI #vfx-canvas, got ${canvasSize.width}×${canvasSize.height}`
  );
  assert.ok(
    maxNonZeroPixels > 200,
    `Expected live 60fps #vfx-canvas to paint > 200 non-zero pixels without stepSimulation(), got ${maxNonZeroPixels}`
  );

  // Verify real-time screen-shake CSS class decay without calling stepSimulation()
  let shakeCleared = false;
  let lastShakeClasses = '';
  for (let attempt = 0; attempt < 14; attempt++) {
    await sleep(80);
    const cls = await browser.eval(`(() => {
      const bodyCls = document.body?.className || '';
      const appCls = document.querySelector('#app')?.className || '';
      const stageCls = document.querySelector('#game-stage, #scheme-mount')?.className || '';
      return [bodyCls, appCls, stageCls].join(' ');
    })()`);
    lastShakeClasses = cls;
    if (!/(^|\s)shake-tier-[1-4](\s|$)/.test(cls)) {
      shakeCleared = true;
      break;
    }
  }
  assert.equal(
    shakeCleared,
    true,
    `Expected .shake-tier-* classes to decay in real time, still present: "${lastShakeClasses}"`
  );
});

test('T6-11: [F-R2-02 / Pillar 3] VFXCanvas.js syncDimensions(), resolveAnchor() coordinate mapping & T5-06 minimal 11-method spy safety', async () => {
  const env = installMockBrowserEnv();
  try {
    const vfxMod = await loadProjectModule('src/ui/VFXCanvas.js');
    const VFXCanvas = vfxMod.VFXCanvas || vfxMod.default;
    assert.equal(typeof VFXCanvas, 'function', 'src/ui/VFXCanvas.js must export VFXCanvas');

    // Part A: Real-browser HiDPI syncDimensions() & resolveAnchor() coordinate mapping
    env.window.navigator.userAgent = 'Mozilla/5.0 HeadlessChrome/156.0';
    env.window.devicePixelRatio = 2;
    const mockCanvas = env.document.createElement('canvas');
    mockCanvas.id = 'vfx-canvas';
    mockCanvas.getBoundingClientRect = () => ({
      x: 100,
      y: 80,
      left: 100,
      top: 80,
      width: 1200,
      height: 620,
      right: 1300,
      bottom: 700,
    });
    env.document.body.appendChild(mockCanvas);

    const anchorEl = env.document.createElement('div');
    anchorEl.setAttribute('data-testid', 'mock-cell-4');
    anchorEl.getBoundingClientRect = () => ({
      x: 250,
      y: 180,
      left: 250,
      top: 180,
      width: 100,
      height: 80,
      right: 350,
      bottom: 260,
    });
    env.document.body.appendChild(anchorEl);

    const vfx = new VFXCanvas(mockCanvas);
    assert.equal(typeof vfx.syncDimensions, 'function', 'VFXCanvas must implement syncDimensions()');
    assert.equal(typeof vfx.resolveAnchor, 'function', 'VFXCanvas must implement resolveAnchor()');

    vfx.syncDimensions();
    assert.equal(vfx.width, 1200, 'syncDimensions() must set logical width from getBoundingClientRect()');
    assert.equal(vfx.height, 620, 'syncDimensions() must set logical height from getBoundingClientRect()');
    assert.ok(
      mockCanvas.width >= 1200 && mockCanvas.height >= 620,
      `syncDimensions() must size physical canvas backing store (got ${mockCanvas.width}×${mockCanvas.height})`
    );

    const byElement = vfx.resolveAnchor(anchorEl, 480, 270);
    const bySelector = vfx.resolveAnchor('[data-testid="mock-cell-4"]', 480, 270);
    assert.ok(
      Math.abs(byElement.x - 200) <= 2 && Math.abs(byElement.y - 140) <= 2,
      `resolveAnchor(element) expected ~(200, 140), got (${byElement?.x}, ${byElement?.y})`
    );
    assert.ok(
      Math.abs(bySelector.x - 200) <= 2 && Math.abs(bySelector.y - 140) <= 2,
      `resolveAnchor(selector) expected ~(200, 140), got (${bySelector?.x}, ${bySelector?.y})`
    );
    const missingFallback = vfx.resolveAnchor('[data-testid="non-existent-anchor"]', 333, 222);
    const nullFallback = vfx.resolveAnchor(null, 333, 222);
    assert.deepEqual(missingFallback, { x: 333, y: 222 });
    assert.deepEqual(nullFallback, { x: 333, y: 222 });

    // Part B: SlotboundE2EMockBrowser 960×540 preservation & bare 11-method spy context safety (T5-06)
    env.window.navigator.userAgent = 'SlotboundE2EMockBrowser';
    const counts = {
      clearRect: 0,
      save: 0,
      restore: 0,
      translate: 0,
      beginPath: 0,
      moveTo: 0,
      lineTo: 0,
      stroke: 0,
      arc: 0,
      fill: 0,
      fillText: 0,
    };
    const bareSpyCtx = {
      clearRect: () => { counts.clearRect++; },
      save: () => { counts.save++; },
      restore: () => { counts.restore++; },
      translate: () => { counts.translate++; },
      beginPath: () => { counts.beginPath++; },
      moveTo: () => { counts.moveTo++; },
      lineTo: () => { counts.lineTo++; },
      stroke: () => { counts.stroke++; },
      arc: () => { counts.arc++; },
      fill: () => { counts.fill++; },
      fillText: () => { counts.fillText++; },
    };
    const spyCanvas = env.document.createElement('canvas');
    spyCanvas.width = 960;
    spyCanvas.height = 540;
    spyCanvas.getContext = (type) => (type === '2d' ? bareSpyCtx : null);
    env.document.body.appendChild(spyCanvas);

    const spyVfx = new VFXCanvas(spyCanvas);
    assert.equal(spyVfx.width, 960, 'SlotboundE2EMockBrowser must preserve 960 logical width');
    assert.equal(spyVfx.height, 540, 'SlotboundE2EMockBrowser must preserve 540 logical height');
    spyVfx.spawnProjectile({ fromX: 120, fromY: 400, toX: 480, toY: 140, color: '#ffbe0b' });
    spyVfx.spawnDevourEffect({ fromX: 200, fromY: 360, toX: 480, toY: 280, label: '+2 STACKS' });
    spyVfx.spawnChainExplosion({ x: 480, y: 200, radius: 140, intensity: 4 });
    spyVfx.spawnLaserSweep({ durationMs: 2500 });
    spyVfx.spawnFloatingText({ x: 480, y: 160, text: '-259.3K', tier: 4 });
    spyVfx.triggerScreenShake(4, 260);

    spyVfx.step(50);
    assert.ok(counts.clearRect >= 1, 'Expected clearRect on bare 11-method spy ctx');
    assert.ok(counts.translate >= 1, 'Expected shake translate on bare 11-method spy ctx');
    assert.ok(counts.arc >= 2, 'Expected arc calls fallback on bare 11-method spy ctx');
    assert.ok(counts.stroke >= 2, 'Expected stroke calls fallback on bare 11-method spy ctx');
    assert.ok(counts.fillText >= 1, 'Expected fillText call on bare 11-method spy ctx');
    spyVfx.step(300);
    assert.equal(
      env.document.body.classList.contains('shake-tier-4'),
      false,
      'shake-tier-4 must be removed after shake duration expires'
    );
  } finally {
    env.cleanup();
  }
});

test('T6-12: [F-R2-02 / Pillar 3] HUDController.js 5-factor multiplicative scoreboard, data-intensity-tier & hud-relic-strip medallions', async () => {
  const env = installMockBrowserEnv();
  try {
    const hudMod = await loadProjectModule('src/ui/HUDController.js');
    const HUDController = hudMod.HUDController || hudMod.default;
    assert.equal(typeof HUDController, 'function', 'src/ui/HUDController.js must export HUDController');

    const hudRoot = env.createContainer();
    const hud = new HUDController(hudRoot);
    hud.mount?.(hudRoot);

    hud.update({
      wave: 4,
      enemyHp: 12500,
      enemyMaxHp: 28000,
      pullsRemaining: 3,
      gold: 480,
      greedMultiplier: 2.46,
      relics: ['greed_ledger', 'pyro_catalyst'],
      ownedRelics: [
        { id: 'greed_ledger', name: '贪婪账本' },
        { id: 'pyro_catalyst', name: '爆破催化剂' },
      ],
      lastTurnBreakdown: {
        basePoints: 320,
        lineMultiplier: 4.5,
        devourStacks: 5,
        devourStacksMultiplier: 12.2,
        chainSynergyMultiplier: 6.0,
        greedMultiplier: 2.46,
        totalDamage: 259343,
        intensityTier: 3,
        comboName: '火药暴食连爆',
        triggeredSynergies: ['fireball_powder_keg', 'triple_iron_knights'],
      },
    });

    const requiredHudTestIds = [
      'hud-wave',
      'hud-enemy-hp',
      'hud-pulls-left',
      'hud-gold',
      'hud-base-chips',
      'hud-line-mult',
      'hud-devour-stacks',
      'hud-chain-mult',
      'hud-greed-mult',
      'hud-total-damage',
      'hud-combo-name',
      'hud-formula-breakdown',
      'hud-relic-strip',
    ];
    for (const tid of requiredHudTestIds) {
      assert.ok(
        hudRoot.querySelector(`[data-testid="${tid}"]`),
        `HUDController must render [data-testid="${tid}"]`
      );
    }

    assert.ok(
      hudRoot.querySelector('[data-testid="hud-chain-mult"]').textContent.includes('6'),
      `hud-chain-mult must display chainSynergyMultiplier 6, got "${hudRoot.querySelector('[data-testid="hud-chain-mult"]').textContent}"`
    );
    assert.ok(
      hudRoot.querySelector('[data-testid="hud-greed-mult"]').textContent.includes('2.46') ||
        hudRoot.querySelector('[data-testid="hud-greed-mult"]').textContent.includes('2.5'),
      `hud-greed-mult must display greedMultiplier 2.46, got "${hudRoot.querySelector('[data-testid="hud-greed-mult"]').textContent}"`
    );

    const totalDmgEl = hudRoot.querySelector('[data-testid="hud-total-damage"]');
    assert.equal(
      totalDmgEl.getAttribute('data-intensity-tier'),
      '3',
      'hud-total-damage must expose data-intensity-tier="3"'
    );

    const relicStrip = hudRoot.querySelector('[data-testid="hud-relic-strip"]');
    const relicSvgs = relicStrip.querySelectorAll('svg');
    assert.ok(
      relicSvgs.length >= 2 || relicStrip.children.length >= 2,
      'hud-relic-strip must render >= 2 owned relic badges/SVG medallions'
    );

    const fullHudText = hudRoot.textContent;
    assert.equal(fullHudText.includes('fireball_powder_keg'), false, 'HUD must localize fireball_powder_keg');
    assert.equal(fullHudText.includes('triple_iron_knights'), false, 'HUD must localize triple_iron_knights');
  } finally {
    env.cleanup();
  }

  // Also confirm live browser mounts all 5 factor testids & hud-relic-strip
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 612 });
  for (const tid of ['hud-chain-mult', 'hud-greed-mult', 'hud-relic-strip', 'hud-total-damage']) {
    assert.equal(
      await browser.hasTestId(tid),
      true,
      `Live browser HUD must mount [data-testid="${tid}"]`
    );
  }
});

test('T6-13: [F-R2-02 / Pillar 3] SoundEngine.js master DynamicsCompressorNode feature-detection & 55ms combo chime micro-arpeggiator', async () => {
  const env = installMockBrowserEnv();
  try {
    const audioMod = await loadProjectModule('src/audio/SoundEngine.js');
    const SoundEngine = audioMod.SoundEngine || audioMod.default;
    assert.equal(typeof SoundEngine, 'function', 'src/audio/SoundEngine.js must export SoundEngine');

    // Part A: Full Web Audio spy recording DynamicsCompressorNode, noise buffers & osc.start(when)
    let compressorsCreated = 0;
    let buffersCreated = 0;
    let bufferSourcesCreated = 0;
    const oscStartTimes = [];

    class RecordingAudioContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 2.0;
        this.sampleRate = 44100;
        this.destination = {};
      }
      resume() { return Promise.resolve(); }
      createDynamicsCompressor() {
        compressorsCreated++;
        return {
          threshold: { value: -18, setValueAtTime() {} },
          knee: { value: 20, setValueAtTime() {} },
          ratio: { value: 8, setValueAtTime() {} },
          attack: { value: 0.003, setValueAtTime() {} },
          release: { value: 0.2, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
        };
      }
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
            linearRampToValueAtTime() {},
            setTargetAtTime() {},
          },
          connect() { return this; },
          disconnect() {},
        };
      }
      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: {
            value: 1000,
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
            linearRampToValueAtTime() {},
          },
          Q: { value: 1, setValueAtTime() {} },
          gain: { value: 0, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
        };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: {
            value: 440,
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
            linearRampToValueAtTime() {},
          },
          detune: { value: 0, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
          start(when = 2.0) {
            oscStartTimes.push(Number(when));
          },
          stop() {},
        };
      }
      createBuffer(channels = 1, length = 2205, sampleRate = 44100) {
        buffersCreated++;
        const arr = new Float32Array(length);
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: () => arr,
        };
      }
      createBufferSource() {
        bufferSourcesCreated++;
        return {
          buffer: null,
          loop: false,
          playbackRate: { value: 1, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
          start() {},
          stop() {},
        };
      }
    }

    env.window.AudioContext = RecordingAudioContext;
    globalThis.AudioContext = RecordingAudioContext;

    const sound = new SoundEngine({ muted: false, volume: 0.5 });
    sound.clearAudioLog();
    oscStartTimes.length = 0;

    // 4 rapid synchronous combo chimes at currentTime = 2.0
    sound.playComboChime(0);
    sound.playComboChime(4);
    sound.playComboChime(7);
    sound.playComboChime(12);

    const chimeLogs = sound.getAudioLog();
    assert.equal(chimeLogs.length, 4, 'playComboChime must log synchronously to getAudioLog()');
    const expectedHz = [523.25, 659.26, 783.99, 1046.5];
    for (let i = 0; i < 4; i++) {
      assert.equal(chimeLogs[i].type, 'chime');
      assert.ok(
        Math.abs(chimeLogs[i].frequencyHz - expectedHz[i]) <= 0.1,
        `Chime ${i} expected ~${expectedHz[i]}Hz, got ${chimeLogs[i].frequencyHz}`
      );
    }

    // Cluster harmonic oscillators started within 5ms (0.005s) into distinct per-chime start slots
    const chimeSlots = clusterCoordinateBands(oscStartTimes, 0.005);
    assert.equal(
      chimeSlots.length,
      4,
      `4 rapid playComboChime calls must micro-arpeggiate into 4 distinct start slots (~55ms apart), got slots=${JSON.stringify(chimeSlots)} from raw=${JSON.stringify(oscStartTimes)}`
    );
    for (let i = 1; i < chimeSlots.length; i++) {
      const delta = chimeSlots[i] - chimeSlots[i - 1];
      assert.ok(
        delta >= 0.035 && delta <= 0.08,
        `Expected ~55ms ([0.035s, 0.080s]) step between chime slots ${i - 1} and ${i}, got ${delta.toFixed(4)}s`
      );
    }

    // Trigger transient SFX and verify master compressor + procedural noise buffers
    sound.playReelClack(0, 3);
    sound.playDevourCrunch(1, 2);
    sound.playGunshot(true);
    sound.playChainExplosion(2);
    assert.ok(compressorsCreated >= 1, 'SoundEngine must route through a master DynamicsCompressorNode');
    assert.ok(
      buffersCreated >= 1 && bufferSourcesCreated >= 1,
      `SoundEngine must layer procedural noise transients (buffers=${buffersCreated}, sources=${bufferSourcesCreated})`
    );

    // Part B: SpyAudioContext WITHOUT createDynamicsCompressor (T5-05 safety)
    class MinimalSpyAudioContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 1.0;
        this.sampleRate = 44100;
        this.destination = {};
      }
      resume() { return Promise.resolve(); }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          detune: { value: 0, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} },
          connect() { return this; },
          disconnect() {},
        };
      }
      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: { value: 1000, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          Q: { value: 1, setValueAtTime() {} },
          gain: { value: 0, setValueAtTime() {} },
          connect() { return this; },
          disconnect() {},
        };
      }
    }

    env.window.AudioContext = MinimalSpyAudioContext;
    globalThis.AudioContext = MinimalSpyAudioContext;

    const soundNoComp = new SoundEngine({ muted: false, volume: 0.5 });
    soundNoComp.clearAudioLog();
    soundNoComp.playReelClack(0, 3);
    soundNoComp.playDevourCrunch(1, 2);
    soundNoComp.playComboChime(3);
    soundNoComp.playChainExplosion(2);
    soundNoComp.playGunshot(true);
    soundNoComp.playLaserSweep(5000);
    soundNoComp.playMisfireBackfire();
    assert.equal(soundNoComp.getAudioLog().length, 7, 'All 7 SFX methods must succeed without createDynamicsCompressor');
  } finally {
    env.cleanup();
  }
});

// ============================================================================
// PILLAR 4: Live Browser Spatial Geometry (getBoundingClientRect) (T6-14..18)
// ============================================================================

test('T6-14: [F-R2-04 / Pillar 4] Scheme 2 (revolver-dungeon) true 60° circular/radial 6-chamber drum geometry', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'revolver-dungeon', { width: 1440, height: 900, seed: 614 });

  const chambers = await browser.eval(`(() => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const el = document.querySelector('[data-testid="chamber-' + i + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      out.push({
        index: i,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
      });
    }
    return out;
  })()`);

  assert.ok(Array.isArray(chambers) && chambers.length === 6, 'Expected 6 chambers [data-testid="chamber-0..5"]');
  for (const ch of chambers) {
    assert.ok(
      ch.width >= 44 && ch.height >= 44,
      `Chamber ${ch.index} too small: ${ch.width}×${ch.height}`
    );
  }

  const distinctYRows = clusterCoordinateBands(chambers.map((c) => c.cy), 16).length;
  const distinctXCols = clusterCoordinateBands(chambers.map((c) => c.cx), 16).length;
  assert.ok(
    distinctYRows >= 3 && distinctXCols >= 3,
    `Revolver chambers must form a circular radial drum (>=3 Y rows & >=3 X cols, NOT a 2×3 flat grid); got YRows=${distinctYRows}, XCols=${distinctXCols}`
  );

  const centerX = chambers.reduce((s, c) => s + c.cx, 0) / 6;
  const centerY = chambers.reduce((s, c) => s + c.cy, 0) / 6;
  const radii = chambers.map((c) => Math.hypot(c.cx - centerX, c.cy - centerY));
  const meanR = radii.reduce((s, r) => s + r, 0) / 6;
  const maxRadialRelError = Math.max(...radii.map((r) => Math.abs(r - meanR) / Math.max(1, meanR)));

  assert.ok(meanR >= 55, `Expected circular drum radius >= 55px, got ${meanR.toFixed(1)}px`);
  assert.ok(
    maxRadialRelError <= 0.16,
    `Chambers must sit equidistantly on a circle (maxRadialRelError <= 0.16, got ${maxRadialRelError.toFixed(3)})`
  );

  for (let i = 0; i < 6; i++) {
    const a = chambers[i];
    const b = chambers[(i + 1) % 6];
    const angA = Math.atan2(a.cy - centerY, a.cx - centerX);
    const angB = Math.atan2(b.cy - centerY, b.cx - centerX);
    let diff = Math.abs(angB - angA);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    assert.ok(
      Math.abs(diff - Math.PI / 3) <= 0.35,
      `Adjacent chambers ${i}->${(i + 1) % 6} must be ~60° apart, got ${((diff * 180) / Math.PI).toFixed(1)}°`
    );
  }
});

test('T6-15: [F-R2-05 / Pillar 4] Scheme 3 (jackpot-td) styled horizontal 1×5 .td-pedestal-card row & positioned .td-enemy-token lane bounds', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'jackpot-td', { width: 1440, height: 900, seed: 615 });

  const layout = await browser.eval(`(() => {
    const lane = document.querySelector('[data-testid="td-lane-canvas"]');
    const laneRect = lane ? lane.getBoundingClientRect() : null;
    const laneCs = lane ? window.getComputedStyle(lane) : null;

    const pedestals = [];
    for (let i = 0; i < 5; i++) {
      const el = document.querySelector('[data-testid="td-pedestal-' + i + '"]');
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      pedestals.push({
        index: i,
        hasCardClass: el.classList.contains('td-pedestal-card'),
        hasStarClass: /pedestal-star-[123]/.test(el.className),
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
        bgColor: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        borderTopWidth: parseFloat(cs.borderTopWidth || '0'),
        boxShadow: cs.boxShadow,
      });
    }

    const tokens = Array.from(document.querySelectorAll('.td-enemy-token')).map((t) => {
      const r = t.getBoundingClientRect();
      const cs = window.getComputedStyle(t);
      return {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
        position: cs.position,
        transform: cs.transform,
      };
    });

    return {
      laneExists: Boolean(lane),
      lanePosition: laneCs ? laneCs.position : 'static',
      laneRect: laneRect
        ? {
            left: laneRect.left,
            right: laneRect.right,
            top: laneRect.top,
            bottom: laneRect.bottom,
            width: laneRect.width,
            height: laneRect.height,
          }
        : null,
      pedestals,
      tokens,
    };
  })()`);

  assert.equal(layout.pedestals.length, 5, 'Expected 5 [data-testid="td-pedestal-0..4"] cards');
  for (let i = 0; i < 5; i++) {
    const p = layout.pedestals[i];
    assert.equal(p.hasCardClass, true, `Pedestal ${i} must preserve .td-pedestal-card`);
    assert.equal(p.hasStarClass, true, `Pedestal ${i} must preserve .pedestal-star-{1..3}`);
    assert.ok(
      p.width >= 60 && p.height >= 50,
      `Pedestal ${i} must have styled card bounds (w>=60, h>=50), got ${p.width}×${p.height}`
    );
    const hasSurface =
      (p.bgColor !== 'rgba(0, 0, 0, 0)' && p.bgColor !== 'transparent') ||
      p.bgImage !== 'none' ||
      p.borderTopWidth >= 1 ||
      p.boxShadow !== 'none';
    assert.equal(hasSurface, true, `Pedestal ${i} must have visible card surface styling`);
    if (i > 0) {
      assert.ok(
        p.cx > layout.pedestals[i - 1].cx + 50,
        `Pedestals must sit side-by-side horizontally (${i - 1} cx=${layout.pedestals[i - 1].cx}, ${i} cx=${p.cx})`
      );
    }
  }
  const pedYSpread =
    Math.max(...layout.pedestals.map((p) => p.cy)) -
    Math.min(...layout.pedestals.map((p) => p.cy));
  assert.ok(pedYSpread <= 14, `1×5 pedestals must share a single horizontal row (Y spread=${pedYSpread})`);

  assert.equal(layout.laneExists, true, 'Missing [data-testid="td-lane-canvas"]');
  assert.ok(
    layout.laneRect.width >= 240 && layout.laneRect.height >= 80,
    `TD battlefield lane too small: ${JSON.stringify(layout.laneRect)}`
  );
  assert.notEqual(layout.lanePosition, 'static', 'TD lane container must be non-static positioned');
  assert.ok(layout.tokens.length >= 1, 'Expected >= 1 marching .td-enemy-token in lane');

  for (const tok of layout.tokens) {
    assert.ok(
      tok.position !== 'static' || tok.transform !== 'none',
      `.td-enemy-token must use positioned/transformed spatial layout (not R1 static block stacking), got position=${tok.position}`
    );
    assert.ok(
      tok.width >= 16 && tok.height >= 16 && tok.width < layout.laneRect.width * 0.85,
      `.td-enemy-token must have compact sprite bounds inside lane, got ${tok.width}×${tok.height} vs lane width ${layout.laneRect.width}`
    );
    assert.ok(
      tok.cx >= layout.laneRect.left - 12 &&
        tok.cx <= layout.laneRect.right + 12 &&
        tok.cy >= layout.laneRect.top - 12 &&
        tok.cy <= layout.laneRect.bottom + 12,
      `.td-enemy-token center (${tok.cx}, ${tok.cy}) outside lane bounds ${JSON.stringify(layout.laneRect)}`
    );
  }
});

test('T6-16: [F-R2-06 / Pillar 4] Scheme 4 (sigil-pachinko) 24-peg 2D staggered arena (>=4 Y rows × >=5 X cols) & horizontal 5-crucible bar', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'sigil-pachinko', { width: 1440, height: 900, seed: 616 });

  const geo = await browser.eval(`(() => {
    const board = document.querySelector('[data-testid="pachinko-board"]');
    const br = board ? board.getBoundingClientRect() : null;
    const bcs = board ? window.getComputedStyle(board) : null;
    const pegs = Array.from(document.querySelectorAll('[data-testid="pachinko-board"] .pachinko-peg')).map((p) => {
      const r = p.getBoundingClientRect();
      const cs = window.getComputedStyle(p);
      return {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
        position: cs.position,
      };
    });
    const crucibles = [];
    for (let i = 0; i < 5; i++) {
      const c = document.querySelector('[data-testid="pachinko-crucible-' + i + '"]');
      if (!c) continue;
      const r = c.getBoundingClientRect();
      crucibles.push({
        index: i,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
      });
    }
    return {
      boardExists: Boolean(board),
      boardPosition: bcs ? bcs.position : 'static',
      boardRect: br
        ? {
            left: br.left,
            right: br.right,
            top: br.top,
            bottom: br.bottom,
            width: br.width,
            height: br.height,
          }
        : null,
      pegs,
      crucibles,
    };
  })()`);

  assert.equal(geo.boardExists, true, 'Missing [data-testid="pachinko-board"]');
  assert.ok(
    geo.boardRect.width >= 260 && geo.boardRect.height >= 140,
    `Pachinko board bounds too small: ${JSON.stringify(geo.boardRect)}`
  );
  assert.notEqual(geo.boardPosition, 'static', 'Pachinko board must be non-static positioned');

  assert.equal(geo.pegs.length, 24, `Expected 24 .pachinko-peg elements, got ${geo.pegs.length}`);
  for (const peg of geo.pegs) {
    assert.ok(peg.width >= 10 && peg.height >= 10, `Peg collapsed: ${peg.width}×${peg.height}`);
    assert.ok(
      peg.cx >= geo.boardRect.left - 10 &&
        peg.cx <= geo.boardRect.right + 10 &&
        peg.cy >= geo.boardRect.top - 10 &&
        peg.cy <= geo.boardRect.bottom + 10,
      `Peg center (${peg.cx}, ${peg.cy}) leaked outside pachinko-board ${JSON.stringify(geo.boardRect)}`
    );
  }

  const pegYRows = clusterCoordinateBands(geo.pegs.map((p) => p.cy), 14).length;
  const pegXCols = clusterCoordinateBands(geo.pegs.map((p) => p.cx), 14).length;
  assert.ok(
    pegYRows >= 4 && pegXCols >= 5,
    `24 Pachinko pegs must span >= 4 Y rows and >= 5 X columns (not R1 1-column collapse); got YRows=${pegYRows}, XCols=${pegXCols}`
  );

  assert.equal(geo.crucibles.length, 5, 'Expected 5 [data-testid="pachinko-crucible-0..4"] slots');
  const crucYSpread =
    Math.max(...geo.crucibles.map((c) => c.cy)) -
    Math.min(...geo.crucibles.map((c) => c.cy));
  assert.ok(crucYSpread <= 16, `5 crucibles must sit horizontally side-by-side (Y spread=${crucYSpread})`);
  for (let i = 1; i < 5; i++) {
    assert.ok(
      geo.crucibles[i].cx > geo.crucibles[i - 1].cx + 35,
      `Crucibles ${i - 1} and ${i} must increase left-to-right`
    );
  }
});

test('T6-17: [F-R2-06 / Pillar 4] Scheme 5 (abyssal-grid) true 4×4 CSS Grid tactical matrix geometry', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'abyssal-grid', { width: 1440, height: 900, seed: 617 });

  const cells = await browser.eval(`(() => {
    const out = [];
    for (let i = 0; i < 16; i++) {
      const el = document.querySelector('[data-testid="matrix-cell-' + i + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      out.push({
        index: i,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        width: r.width,
        height: r.height,
        bgColor: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        borderTopWidth: parseFloat(cs.borderTopWidth || '0'),
      });
    }
    return out;
  })()`);

  assert.ok(Array.isArray(cells) && cells.length === 16, 'Expected 16 [data-testid="matrix-cell-0..15"]');
  for (const cell of cells) {
    assert.ok(
      cell.width >= 44 && cell.height >= 36,
      `Matrix cell ${cell.index} bounds too small: ${cell.width}×${cell.height}`
    );
  }

  const xCols = clusterCoordinateBands(cells.map((c) => c.cx), 14).length;
  const yRows = clusterCoordinateBands(cells.map((c) => c.cy), 14).length;
  assert.equal(
    xCols,
    4,
    `Abyssal Matrix must form 4 distinct X columns (not R1 1×16 vertical stack); got ${xCols}`
  );
  assert.equal(
    yRows,
    4,
    `Abyssal Matrix must form 4 distinct Y rows (not R1 1×16 vertical stack); got ${yRows}`
  );

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cur = cells[row * 4 + col];
      const rowStart = cells[row * 4];
      assert.ok(
        Math.abs(cur.cy - rowStart.cy) <= 10,
        `Row ${row} cell ${cur.index} misaligned vertically: cy=${cur.cy} vs ${rowStart.cy}`
      );
      if (col > 0) {
        const prev = cells[row * 4 + col - 1];
        assert.ok(cur.cx > prev.cx + 35, `Row ${row} cells must advance left-to-right`);
      }
    }
    if (row > 0) {
      assert.ok(
        cells[row * 4].cy > cells[(row - 1) * 4].cy + 30,
        `Row ${row} must sit below row ${row - 1}`
      );
    }
  }
});

test('T6-18: [F-R2-03 / Pillar 4] Scheme 1 (devour-reels) multi-column 1440×900 cockpit layout (3×3 grid + side-by-side probability modder)', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 618 });

  const cockpit = await browser.eval(`(() => {
    const toRect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    };
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const cr = toRect('[data-testid="devour-cell-' + i + '"]');
      if (cr) cells.push(cr);
    }
    return {
      boss: toRect('[data-testid="boss-arena-card"]'),
      grid: toRect('[data-testid="devour-grid"]'),
      mod: toRect('[data-testid="prob-mod-panel"]'),
      spin: toRect('[data-testid="btn-spin-devour"]'),
      cells,
    };
  })()`);

  assert.equal(cockpit.cells.length, 9, 'Expected 9 [data-testid="devour-cell-0..8"] cells');
  assert.equal(
    clusterCoordinateBands(cockpit.cells.map((c) => c.cx), 14).length,
    3,
    'Devour Reels must render 3 X columns'
  );
  assert.equal(
    clusterCoordinateBands(cockpit.cells.map((c) => c.cy), 14).length,
    3,
    'Devour Reels must render 3 Y rows'
  );

  assert.ok(cockpit.boss, 'Missing [data-testid="boss-arena-card"] in Scheme 1');
  assert.ok(cockpit.grid, 'Missing [data-testid="devour-grid"] in Scheme 1');
  assert.ok(cockpit.mod, 'Missing [data-testid="prob-mod-panel"] in Scheme 1');
  assert.ok(cockpit.spin, 'Missing [data-testid="btn-spin-devour"] in Scheme 1');

  assert.ok(
    cockpit.mod.width >= 180 && cockpit.mod.height >= 140 && cockpit.mod.bottom <= 900,
    `prob-mod-panel must fit inside 1440×900 desktop cockpit (got ${JSON.stringify(cockpit.mod)})`
  );
  const sideBySide =
    cockpit.mod.left >= cockpit.grid.right - 16 ||
    cockpit.grid.left >= cockpit.mod.right - 16;
  const verticalOverlap =
    Math.min(cockpit.grid.bottom, cockpit.mod.bottom) -
    Math.max(cockpit.grid.top, cockpit.mod.top);
  assert.equal(
    sideBySide,
    true,
    `devour-grid (${cockpit.grid.left}..${cockpit.grid.right}) and prob-mod-panel (${cockpit.mod.left}..${cockpit.mod.right}) must sit in separate horizontal columns`
  );
  assert.ok(
    verticalOverlap >= 100,
    `devour-grid and prob-mod-panel must overlap vertically >= 100px in cockpit band (got ${verticalOverlap}px)`
  );
  assert.ok(cockpit.spin.bottom <= 900, `btn-spin-devour must fit above y=900 (got ${cockpit.spin.bottom})`);
});

// ============================================================================
// PILLAR 5: Autonomous Real-Time Loop, Tactical Depth, Exploit Fixes,
//           Relic Draft Progression & Network Cleanliness (T6-19 .. T6-35)
// ============================================================================

test('T6-19: [F-R2-05 / F-R2-07 / Pillar 5] Live browser Scheme 3 autonomous 60fps rAF enemy march, pause/resume & non-destructive syncRealtimeDOM', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'jackpot-td', { width: 1440, height: 900, seed: 6190 });

  // Initialize on Wave 5 (45,000 HP lead runner so continuous turret auto-fire cannot kill it mid-march)
  // and explicitly call resumeRealtimeLoop() AFTER forceGridOrCylinder() to clear _manualSimMode.
  await browser.eval(`new Promise((resolve) => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.switchScheme('jackpot-td');
    b.resetGame({ seed: 6190, wave: 5 });
    b.forceGridOrCylinder({ wave: 5 });
    b.resumeRealtimeLoop();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  })`);

  // Capture initial enemy progress & button DOM node identity WITHOUT calling stepSimulation()
  const before = await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    window.__t6LeverBtnRef = document.querySelector('[data-testid="btn-pull-lever"]');
    return {
      prog0: Number(b.getState().closestEnemyProgress || 0),
      hasBtn: Boolean(window.__t6LeverBtnRef),
    };
  })()`);
  assert.equal(before.hasBtn, true, 'Missing [data-testid="btn-pull-lever"]');

  await sleep(420);

  const afterMarch = await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    const currentBtn = document.querySelector('[data-testid="btn-pull-lever"]');
    return {
      prog1: Number(b.getState().closestEnemyProgress || 0),
      sameBtnNode: currentBtn === window.__t6LeverBtnRef,
    };
  })()`);

  assert.ok(
    afterMarch.prog1 > before.prog0 + 0.012,
    `Scheme 3 closestEnemyProgress must advance autonomously via real-time rAF without stepSimulation() (prog0=${before.prog0}, prog1=${afterMarch.prog1})`
  );
  assert.equal(
    afterMarch.sameBtnNode,
    true,
    'syncRealtimeDOM(state) must update lane tokens without destroying/recreating [data-testid="btn-pull-lever"] mid-click'
  );

  // Verify pauseRealtimeLoop() halts autonomous stepping and resumeRealtimeLoop() resumes it
  const pausedProgA = await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.pauseRealtimeLoop();
    return Number(b.getState().closestEnemyProgress || 0);
  })()`);
  await sleep(220);
  const pausedProgB = await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    return Number(b.getState().closestEnemyProgress || 0);
  })()`);
  assert.ok(
    Math.abs(pausedProgB - pausedProgA) < 0.002,
    `pauseRealtimeLoop() must freeze autonomous march (pausedProgA=${pausedProgA}, pausedProgB=${pausedProgB})`
  );

  await browser.eval(`(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).resumeRealtimeLoop()`);
  await sleep(260);
  const resumedProg = await browser.eval(
    `Number((window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).getState().closestEnemyProgress || 0)`
  );
  assert.ok(
    resumedProg > pausedProgB + 0.01,
    `resumeRealtimeLoop() must resume autonomous march (paused=${pausedProgB}, resumed=${resumedProg})`
  );
});

test('T6-20: [F-R2-05 / Pillar 5] Scheme 3 continuous turret auto-fire DPS (shotsPerSec) & mortal lane minions dying for Gold', async () => {
  const tdMod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = tdMod.JackpotTDEngine || tdMod.default;
  assert.equal(typeof JackpotTDEngine, 'function', 'Missing JackpotTDEngine export');

  // Part 1: Continuous turret auto-fire DPS during step(dtMs) with laserRemainingMs === 0
  const autoFireEngine = new JackpotTDEngine({ seed: 6200, wave: 3, gold: 100 });
  forceEngineState(autoFireEngine, {
    pedestals: ['nuke_core', 'prism_laser', 'tesla_coil', 'cryo_prism', 'miner_pick'],
    closestEnemyProgress: 0.06,
    laserRemainingMs: 0,
    freezeRemainingMs: 0,
  });
  const stBeforeAuto = autoFireEngine.getState();
  const sumEnemyHp = (st) =>
    (st.enemies || []).reduce((acc, e) => acc + Math.max(0, Number(e.hp || 0)), 0);
  const laneHpBefore = sumEnemyHp(stBeforeAuto);
  const bossHpBefore = stBeforeAuto.enemyHp;

  // Step 2000ms (< 2500ms interest tick) so any HP drop & Gold gain come purely from turret shots
  for (let i = 0; i < 10; i++) {
    autoFireEngine.step(200);
  }
  const stAfterAuto = autoFireEngine.getState();
  const laneHpAfter = sumEnemyHp(stAfterAuto);

  assert.ok(
    laneHpAfter < laneHpBefore || stAfterAuto.enemyHp < bossHpBefore,
    `Turrets must continuously auto-fire (shotsPerSec) during step(dtMs): laneHp ${laneHpBefore} -> ${laneHpAfter}, bossHp ${bossHpBefore} -> ${stAfterAuto.enemyHp}`
  );

  // Part 2: Mortal lane minions die (fixing Math.max(1, ...) immortal minion bug) & grant kill Gold
  const killEngine = new JackpotTDEngine({ seed: 6201, wave: 3, gold: 100 });
  const initialMinions = (killEngine.getState().enemies || []).filter((e) => !e.isBoss).length;
  assert.ok(initialMinions >= 2, `Expected >= 2 non-boss lane minions on Wave 3, got ${initialMinions}`);

  // Pull a controlled non-Yahtzee turret line so Wave 3 Boss (3800 HP) survives while weaker minions take lethal fire
  forceEngineState(killEngine, {
    gold: 100,
    pedestals: ['prism_laser', 'tesla_coil', 'cryo_prism', 'miner_pick', 'gold_nugget'],
    nextSpin: ['prism_laser', 'prism_laser', 'tesla_coil', 'cryo_prism', 'miner_pick'],
  });
  const afterPull = killEngine.performPrimaryAction();
  const goldRightAfterPull = afterPull.gold;

  // Step up to 2200ms (< 2500ms interest tick since pull reset interest timer) to let auto-fire finish off wounded minions
  let minionKilledWhileWaveActive = false;
  let goldFromMinionKill = goldRightAfterPull;
  const checkMinionDeath = (st) => {
    if (st.wave !== 3 || st.enemyHp <= 0) return false;
    const aliveNonBoss = (st.enemies || []).filter((e) => !e.isBoss && Number(e.hp) > 0 && !e.dead);
    return aliveNonBoss.length < initialMinions;
  };
  if (checkMinionDeath(afterPull)) {
    minionKilledWhileWaveActive = true;
  }
  for (let s = 0; s < 11 && killEngine.getState().wave === 3; s++) {
    const st = killEngine.step(200);
    if (st.wave === 3) {
      goldFromMinionKill = Math.max(goldFromMinionKill, st.gold);
      if (checkMinionDeath(st)) {
        minionKilledWhileWaveActive = true;
      }
    }
  }

  assert.equal(
    minionKilledWhileWaveActive,
    true,
    'Non-boss lane minions must actually die/despawn when HP reaches <= 0 instead of clamping at Math.max(1, ...)'
  );
  assert.ok(
    goldFromMinionKill > goldRightAfterPull || afterPull.killGold > 0 || afterPull.gold > 90,
    `Killing lane minions must award Gold (goldRightAfterPull=${goldRightAfterPull}, maxGoldBeforeInterestTick=${goldFromMinionKill})`
  );
});

test('T6-21: [F-R2-05 / Pillar 5] Scheme 3 clickable Pedestal HOLD (up to 2 towers) persists held towers across lever pulls', async () => {
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');
    const scheme = regMod.getScheme('jackpot-td');
    const engine = scheme.createEngine({ seed: 6210, gold: 800, sound });
    forceEngineState(engine, {
      gold: 800,
      enemyHp: 9_999_999,
      enemyMaxHp: 9_999_999,
      pedestals: ['nuke_core', 'prism_laser', 'miner_pick', 'gold_nugget', 'cryo_prism'],
    });

    const container = env.createContainer();
    const view = scheme.createView(engine, { sound });
    view.mount(container, { engine, sound });

    const clickPedestalHold = (idx) => {
      const card = container.querySelector(`[data-testid="td-pedestal-${idx}"]`);
      assert.ok(card, `Missing [data-testid="td-pedestal-${idx}"]`);
      const subBtn =
        card.querySelector('[data-testid*="hold"]') ||
        card.querySelector('[data-testid*="lock"]') ||
        card.querySelector('[data-action*="hold"]') ||
        card.querySelector('[data-action*="lock"]') ||
        card.querySelector('button');
      if (subBtn) subBtn.click();
      else card.click();
    };

    const normalizePedestalIdxList = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return [];
      if (arr.every((v) => typeof v === 'boolean')) {
        return arr.map((v, idx) => (v ? idx : -1)).filter((idx) => idx >= 0 && idx < 5);
      }
      return arr
        .map((v) => (typeof v === 'object' && v !== null ? Number(v.index ?? v.idx ?? -1) : Number(v)))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < 5);
    };

    const getHeldIndices = (st) => {
      if (Array.isArray(st.heldPedestals)) {
        const fromHeld = normalizePedestalIdxList(st.heldPedestals);
        if (fromHeld.length > 0 || st.heldPedestals.every((v) => typeof v === 'boolean')) {
          return fromHeld;
        }
      }
      if (Array.isArray(st.lockedPedestals)) {
        const fromLocked = normalizePedestalIdxList(st.lockedPedestals);
        if (fromLocked.length > 0 || st.lockedPedestals.every((v) => typeof v === 'boolean')) {
          return fromLocked;
        }
      }
      const fromPedestalObjs = (st.pedestals || [])
        .map((p, idx) => (p?.held || p?.locked ? idx : -1))
        .filter((idx) => idx >= 0 && idx < 5);
      if (fromPedestalObjs.length > 0) return fromPedestalObjs;
      return [0, 1, 2, 3, 4].filter((idx) => {
        const card = container.querySelector(`[data-testid="td-pedestal-${idx}"]`);
        if (!card) return false;
        const cls = card.className || '';
        return (
          /(^|\s)(pedestal-held|pedestal-locked|is-held|is-locked|held|locked)(\s|$)/i.test(cls) ||
          card.getAttribute('data-held') === 'true' ||
          card.getAttribute('data-locked') === 'true' ||
          card.getAttribute('aria-pressed') === 'true'
        );
      });
    };

    clickPedestalHold(0);
    clickPedestalHold(1);
    const heldAfterTwo = getHeldIndices(engine.getState());
    assert.equal(
      heldAfterTwo.length,
      2,
      `Clicking HOLD on pedestals 0 and 1 must lock 2 pedestals, got ${JSON.stringify(heldAfterTwo)}`
    );

    // Attempting to hold a 3rd pedestal must enforce the max-2 HOLD cap (either rejecting 3rd or rotating oldest)
    clickPedestalHold(2);
    const stLocked = engine.getState();
    const heldIndices = getHeldIndices(stLocked);
    assert.ok(
      heldIndices.length === 2,
      `Pedestal HOLD must cap held towers at 2 (got ${JSON.stringify(heldIndices)})`
    );

    const expectedSymbols = new Map(
      heldIndices.map((idx) => [idx, stLocked.pedestals[idx].symbolId || stLocked.pedestals[idx].id])
    );

    let unheldChanged = false;
    const initialUnheld = [0, 1, 2, 3, 4]
      .filter((i) => !heldIndices.includes(i))
      .map((i) => stLocked.pedestals[i].symbolId || stLocked.pedestals[i].id);

    for (let pull = 0; pull < 5; pull++) {
      const pullBtn = container.querySelector('[data-testid="btn-pull-lever"]');
      pullBtn.click();
      const st = engine.getState();
      for (const [idx, sym] of expectedSymbols.entries()) {
        const actual = st.pedestals[idx].symbolId || st.pedestals[idx].id;
        assert.equal(
          actual,
          sym,
          `Held pedestal #${idx} must keep tower "${sym}" on pull ${pull + 1}, got "${actual}"`
        );
      }
      const curUnheld = [0, 1, 2, 3, 4]
        .filter((i) => !heldIndices.includes(i))
        .map((i) => st.pedestals[i].symbolId || st.pedestals[i].id);
      if (curUnheld.some((sym, k) => sym !== initialUnheld[k])) {
        unheldChanged = true;
      }
    }
    assert.equal(unheldChanged, true, 'Unheld pedestals must continue rerolling across lever pulls');
    view.unmount();
  } finally {
    env.cleanup();
  }
});

test('T6-22: [F-R2-05 / Pillar 5] Scheme 3 Overheated Scrap Pull penalty when gold < pullCost', async () => {
  const tdMod = await loadProjectModule('src/games/jackpot-td/JackpotTDEngine.js');
  const JackpotTDEngine = tdMod.JackpotTDEngine || tdMod.default;

  const forcedSpin = ['tesla_coil', 'tesla_coil', 'cryo_prism', 'miner_pick', 'prism_laser'];

  const funded = new JackpotTDEngine({ seed: 6220, wave: 3, gold: 200 });
  forceEngineState(funded, {
    gold: 200,
    playerHp: 100,
    enemyHp: 50_000,
    enemyMaxHp: 50_000,
    nextSpin: forcedSpin,
  });

  const broke = new JackpotTDEngine({ seed: 6220, wave: 3, gold: 0 });
  forceEngineState(broke, {
    gold: 0,
    playerHp: 100,
    enemyHp: 50_000,
    enemyMaxHp: 50_000,
    nextSpin: forcedSpin,
  });

  const stFunded = normalizeGameState(funded.performPrimaryAction(), funded);
  const stBroke = normalizeGameState(broke.performPrimaryAction(), broke);

  assert.equal(stBroke.pedestals.length, 5, '0-Gold emergency Scrap Pull must still refresh 5 pedestals');
  assert.ok(stBroke.gold >= 0, 'Gold must never go negative on Overheated Scrap Pull');

  const penalized =
    stBroke.lastTurnBreakdown.totalDamage < stFunded.lastTurnBreakdown.totalDamage ||
    stBroke.playerHp < stFunded.playerHp;
  assert.equal(
    penalized,
    true,
    `Overheated Scrap Pull (gold < pullCost) must incur reduced volley damage or Base HP overheat penalty (funded dmg=${stFunded.lastTurnBreakdown.totalDamage}/hp=${stFunded.playerHp} vs broke dmg=${stBroke.lastTurnBreakdown.totalDamage}/hp=${stBroke.playerHp})`
  );
});

test('T6-23: [F-R2-03 / Pillar 5] Scheme 1 active [R] Belch Bile Purge (indigestion >= 50), Gold-backed Wheel Modding & Maw Upgrade Workshop', async () => {
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');
    const scheme = regMod.getScheme('devour-reels');

    // Baseline comparison engine without Bile Purge
    const baselineEngine = scheme.createEngine({ seed: 6230, gold: 300, sound });
    forceEngineState(baselineEngine, {
      indigestion: 70,
      enemyHp: 50_000,
      enemyMaxHp: 50_000,
      grid: Array(9).fill('goblin'),
    });
    const stBaseAfterSpin = baselineEngine.performPrimaryAction();
    const baselineDamage = 50_000 - stBaseAfterSpin.enemyHp;

    // Mounted View + Engine for [R] Belch Bile Purge & Gold Workshop
    const engine = scheme.createEngine({ seed: 6230, gold: 300, sound });
    const container = env.createContainer();
    const view = scheme.createView(engine, { sound });
    view.mount(container, { engine, sound });

    // 1. Below threshold (indigestion = 25 < 50): KeyR must NOT trigger Bile Purge
    forceEngineState(engine, { indigestion: 25, enemyHp: 50_000, enemyMaxHp: 50_000 });
    view.render();
    view.onKeyDown({ code: 'KeyR', key: 'r', preventDefault() {} });
    assert.equal(
      engine.getState().indigestion,
      25,
      '[R] Belch Bile Purge must NOT trigger when indigestion < 50'
    );

    // 2. At/above threshold (indigestion = 70 >= 50): KeyR triggers active Belch Bile Purge
    forceEngineState(engine, {
      indigestion: 70,
      enemyHp: 50_000,
      enemyMaxHp: 50_000,
    });
    view.render();
    view.onKeyDown({ code: 'KeyR', key: 'r', preventDefault() {} });
    const stAfterPurge = engine.getState();
    assert.ok(
      stAfterPurge.indigestion < 70,
      `Active [R] Belch Bile Purge at indigestion=70 must vent indigestion (< 70), got ${stAfterPurge.indigestion}`
    );

    forceEngineState(engine, Array(9).fill('goblin'));
    container.querySelector('[data-testid="btn-spin-devour"]').click();
    const stPurgedAfterSpin = engine.getState();
    const totalPurgedDamage = 50_000 - stPurgedAfterSpin.enemyHp;
    assert.ok(
      totalPurgedDamage > baselineDamage,
      `[R] Belch Bile Purge must deal acid damage or amplify spin damage (${totalPurgedDamage} vs unpurged ${baselineDamage})`
    );

    // 3. Gold-backed Wheel Modding & Maw Upgrade Workshop
    forceEngineState(engine, { gold: 300, indigestion: 45 });
    view.render();
    const goldStart = engine.getState().gold;

    // Click prob-boost-fireball twice (accommodating optional 1-free-tweak designs)
    for (let modClick = 0; modClick < 2; modClick++) {
      const boostFireballBtn = container.querySelector('[data-testid="prob-boost-fireball"]');
      assert.ok(boostFireballBtn, 'Missing [data-testid="prob-boost-fireball"]');
      boostFireballBtn.click();
    }
    const goldAfterMod = engine.getState().gold;
    assert.ok(
      goldAfterMod < goldStart,
      `Gold-backed Wheel Modding (2× prob-boost-fireball) must spend Gold (start=${goldStart}, afterMod=${goldAfterMod})`
    );

    // Locate leaf enabled Maw Upgrade Workshop <button> in DOM (never matching container <div>/<section>)
    const EXCLUDED_S1_BTNS = new Set([
      'btn-spin-devour',
      'btn-endless-mode',
      'btn-new-run',
      'btn-retry-run',
    ]);
    const workshopBtn = container
      .querySelectorAll('button')
      .filter((el) => !el.disabled)
      .find((el) => {
        const tid = el.getAttribute('data-testid') || '';
        const act = el.getAttribute('data-action') || '';
        const cls = el.className || '';
        const txt = el.textContent || '';
        const meta = `${tid} ${act} ${cls} ${txt}`;
        if (
          EXCLUDED_S1_BTNS.has(tid) ||
          tid.startsWith('prob-') ||
          tid.startsWith('relic-') ||
          /prob[-_]|banish|boost|preset/i.test(`${tid} ${act}`)
        ) {
          return false;
        }
        if (/bile|purge|belch|喷吐|喷射|反刍|排毒/i.test(meta)) {
          return false;
        }
        return (
          /workshop|upgrade|maw[-_]|herb|armor|temper|tooth|fang|stomach|digest/i.test(`${tid} ${act} ${cls}`) ||
          /工坊|强化|升级|锻造|消食|护甲|巨口|利齿|胃袋|淬炼/i.test(txt)
        );
      });
    assert.ok(
      workshopBtn,
      'Scheme 1 View must render an enabled Gold-backed Maw Upgrade Workshop <button>'
    );
    workshopBtn.click();
    const goldAfterWorkshop = engine.getState().gold;

    assert.ok(
      goldAfterWorkshop < goldAfterMod,
      `Maw Upgrade Workshop <button> purchase must spend Gold (beforeWorkshop=${goldAfterMod}, afterWorkshop=${goldAfterWorkshop})`
    );

    view.unmount();
  } finally {
    env.cleanup();
  }
});

test('T6-24: [F-R2-03 / Pillar 5] Scheme 1 real Boss traits & mawArmor hit absorption on Overtime', async () => {
  const s1Mod = await loadProjectModule('src/games/devour-reels/DevourReelsEngine.js');
  const DevourReelsEngine = s1Mod.DevourReelsEngine || s1Mod.default;

  // Part 1: Overtime Boss attack & mawArmor hit absorption
  const unarmored = new DevourReelsEngine({ seed: 6240 });
  forceEngineState(unarmored, {
    wave: 4,
    enemyHp: 999_999,
    enemyMaxHp: 999_999,
    pullsRemaining: 0,
    playerHp: 100,
    mawArmor: 0,
    grid: Array(9).fill('goblin'),
  });
  const stUnarmored = unarmored.performPrimaryAction();

  const armored = new DevourReelsEngine({ seed: 6240 });
  forceEngineState(armored, {
    wave: 4,
    enemyHp: 999_999,
    enemyMaxHp: 999_999,
    pullsRemaining: 0,
    playerHp: 100,
    mawArmor: 80,
    grid: Array(9).fill('goblin'),
  });
  const stArmored = armored.performPrimaryAction();

  assert.equal(stUnarmored.pullsRemaining, 0, 'pullsRemaining must stay clamped at 0 on Overtime');
  assert.ok(
    stUnarmored.playerHp < 100,
    `Overtime spin with 0 mawArmor must take Boss counter-attack damage (playerHp=${stUnarmored.playerHp})`
  );
  assert.ok(
    stArmored.playerHp > stUnarmored.playerHp && stArmored.mawArmor < 80,
    `mawArmor must absorb Overtime Boss strike before playerHp (unarmored HP=${stUnarmored.playerHp}, armored HP=${stArmored.playerHp}, remaining armor=${stArmored.mawArmor})`
  );

  // Part 2: Active Boss traits across waves (e.g., Wave 3 alchemical_trebuchet indigestion/curse hazard or Wave 6 double gold)
  const w1 = new DevourReelsEngine({ seed: 6241 });
  forceEngineState(w1, {
    wave: 1,
    enemyHp: 99_999,
    enemyMaxHp: 99_999,
    pullsRemaining: 4,
    indigestion: 0,
    grid: Array(9).fill('chest'),
  });
  const stW1 = w1.performPrimaryAction();

  const w3 = new DevourReelsEngine({ seed: 6241 });
  forceEngineState(w3, {
    wave: 3,
    enemyHp: 99_999,
    enemyMaxHp: 99_999,
    pullsRemaining: 4,
    indigestion: 0,
    grid: Array(9).fill('chest'),
  });
  const stW3 = w3.performPrimaryAction();

  const w1Kill = new DevourReelsEngine({ seed: 6242, gold: 100 });
  forceEngineState(w1Kill, {
    wave: 1,
    gold: 100,
    enemyHp: 10,
    enemyMaxHp: 120,
    pullsRemaining: 4,
    grid: Array(9).fill('fireball'),
  });
  const stW1Kill = w1Kill.performPrimaryAction();

  const w6Kill = new DevourReelsEngine({ seed: 6242, gold: 100 });
  forceEngineState(w6Kill, {
    wave: 6,
    gold: 100,
    enemyHp: 10,
    enemyMaxHp: 1_200_000,
    pullsRemaining: 4,
    grid: Array(9).fill('fireball'),
  });
  const stW6Kill = w6Kill.performPrimaryAction();

  const bossTraitActive =
    stW3.indigestion > stW1.indigestion ||
    (stW3.grid || []).some((c) => c.id === 'curse_skull') ||
    stW6Kill.gold > stW1Kill.gold + 40;
  assert.equal(
    bossTraitActive,
    true,
    `Scheme 1 Boss traits must execute actively (W3 indigestion=${stW3.indigestion} vs W1=${stW1.indigestion}; W6 kill gold=${stW6Kill.gold} vs W1=${stW1Kill.gold})`
  );
});

test('T6-25: [F-R2-04 / Pillar 5] Scheme 2 3-Bullet Tactical Ammo Belt shop, Click-any-Chamber (#0..#5) targeted loading & Boss counter-attacks', async () => {
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');
    const scheme = regMod.getScheme('revolver-dungeon');
    const engine = scheme.createEngine({ seed: 6250, gold: 250, sound });
    forceEngineState(engine, {
      gold: 250,
      chambers: Array(6).fill('empty'),
    });

    const container = env.createContainer();
    const view = scheme.createView(engine, { sound });
    view.mount(container, { engine, sound });

    // 1. Verify 3-Bullet Tactical Ammo Belt shop exists as leaf interactive slot controls in DOM
    const EXCLUDED_S2_TIDS = new Set([
      'revolver-dungeon-view',
      'revolver-cylinder',
      'ammo-belt',
      'ammo-belt-bar',
      'ammo-shop',
      'btn-spin-fire',
      'btn-load-bullet',
      'player-hp-bar',
      'roulette-risk-badge',
      'boss-arena-card',
      'relic-draft-banner',
      'run-victory-banner',
      'run-defeat-banner',
      'btn-endless-mode',
      'btn-new-run',
      'btn-retry-run',
    ]);
    const getAmmoSlotButtons = () =>
      container
        .querySelectorAll('button, [data-ammo-index], [data-ammo-id]')
        .filter((el) => {
          if (el.disabled) return false;
          if (el.tagName !== 'BUTTON' && el.querySelector('button')) return false;
          const tid = el.getAttribute('data-testid') || '';
          const act = el.getAttribute('data-action') || '';
          const cls = el.className || '';
          const txt = el.textContent || '';
          if (
            EXCLUDED_S2_TIDS.has(tid) ||
            tid.startsWith('chamber-') ||
            tid.startsWith('relic-') ||
            el.closest('[data-testid^="chamber-"]') ||
            el.closest('[data-testid="revolver-cylinder"]')
          ) {
            return false;
          }
          if (/reroll|refresh|刷新弹药|换一批/i.test(`${tid} ${act} ${txt}`)) {
            return false;
          }
          return (
            el.hasAttribute('data-ammo-index') ||
            el.hasAttribute('data-ammo-id') ||
            /^ammo[-_]|belt[-_]?slot|ammo[-_]?slot|buy[-_]?ammo|select[-_]?ammo/i.test(`${tid} ${act} ${cls}`) ||
            /ammo|belt|弹药带|战术弹|购弹/i.test(`${tid} ${act} ${cls}`)
          );
        });

    const pickPaidAmmoSlot = () => {
      const slots = getAmmoSlotButtons();
      const paid = slots.find((el) => {
        const meta = `${el.getAttribute('data-cost') || ''} ${el.getAttribute('data-price') || ''} ${el.textContent || ''}`;
        return /[1-9]\d*\s*g|💰\s*[1-9]\d*|[1-9]\d*\s*金/i.test(meta);
      });
      return paid || slots[0] || null;
    };

    const clickChamberTarget = (idx) => {
      const ch = container.querySelector(`[data-testid="chamber-${idx}"]`);
      assert.ok(ch, `Missing [data-testid="chamber-${idx}"]`);
      const target = ch.querySelector('button') || ch;
      target.click();
    };

    const beltControls = getAmmoSlotButtons();
    assert.ok(
      beltControls.length >= 3,
      `Scheme 2 View must render a 3-Bullet Tactical Ammo Belt shop (>=3 leaf belt controls, found ${beltControls.length})`
    );

    // 2. Click-any-Chamber (#4) targeted loading + Gold spend
    const goldStart = engine.getState().gold;
    assert.ok(container.querySelector('[data-testid="chamber-4"]'), 'Missing [data-testid="chamber-4"]');

    // Support both UX flows cleanly: (Click Chamber #4 -> Select Belt Slot) and (Select Belt Slot -> Click Chamber #4)
    clickChamberTarget(4);
    if (engine.getState().chambers[4].id === 'empty') {
      const slotBtn = pickPaidAmmoSlot();
      assert.ok(slotBtn, 'Expected enabled Tactical Ammo Belt slot button');
      slotBtn.click();
      if (engine.getState().chambers[4].id === 'empty') {
        if (engine.getState().chambers[0].id !== 'empty') {
          forceEngineState(engine, { gold: 250, chambers: Array(6).fill('empty') });
          view.render();
          clickChamberTarget(4);
          const retrySlot = pickPaidAmmoSlot();
          if (retrySlot) retrySlot.click();
        } else {
          clickChamberTarget(4);
        }
      }
    }

    const stLoaded = engine.getState();
    assert.notEqual(
      stLoaded.chambers[4].id,
      'empty',
      `Clicking chamber-4 with Tactical Ammo Belt must load Chamber #4, got ${JSON.stringify(stLoaded.chambers.map((c) => c.id))}`
    );
    assert.equal(
      stLoaded.chambers[0].id,
      'empty',
      'Targeted loading into Chamber #4 must leave Chamber #0 empty'
    );

    // If the 1st load consumed a free wave reload token, perform a 2nd paid belt load into Chamber #3
    let goldAfterBeltLoad = stLoaded.gold;
    if (goldAfterBeltLoad >= goldStart) {
      clickChamberTarget(3);
      const secondSlot = pickPaidAmmoSlot();
      if (secondSlot) secondSlot.click();
      if (engine.getState().chambers[3].id === 'empty') {
        clickChamberTarget(3);
      }
      goldAfterBeltLoad = engine.getState().gold;
    }
    assert.ok(
      goldAfterBeltLoad < goldStart,
      `Purchasing/loading from Tactical Ammo Belt must spend Gold (expected < ${goldStart}, got ${goldAfterBeltLoad})`
    );

    // 3. Overtime counter-attack & Floor 2 Boss (twin_headed_hound) dry-click pounce
    const otEngine = scheme.createEngine({ seed: 6251, sound });
    forceEngineState(otEngine, {
      wave: 3,
      floor: 3,
      enemyHp: 999_999,
      enemyMaxHp: 999_999,
      pullsRemaining: 0,
      playerHp: 100,
      chambers: Array(6).fill('lead_bullet'),
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
    });
    const stOt = otEngine.performPrimaryAction({ targetChamber: 0 });
    assert.equal(stOt.pullsRemaining, 0);
    assert.ok(
      stOt.playerHp < 100,
      `Scheme 2 Overtime shot must trigger Boss counter-attack damage (playerHp=${stOt.playerHp})`
    );

    const houndEngine = scheme.createEngine({ seed: 6252, sound });
    forceEngineState(houndEngine, {
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
    const stDry = houndEngine.performPrimaryAction({ targetChamber: 0 });
    assert.ok(
      stDry.playerHp < 100,
      `Floor 2 Boss (twin_headed_hound) must counter-attack on empty-chamber dry click (playerHp=${stDry.playerHp})`
    );

    view.unmount();
  } finally {
    env.cleanup();
  }
});

test('T6-26: [F-R2-06 / Pillar 5] Scheme 4 multi-step browser cascade (no 0ms teleport), Launch Aim (◀/居中/▶) & 35G Sigil Peg Upgrade', async () => {
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');
    const scheme = regMod.getScheme('sigil-pachinko');
    const engine = scheme.createEngine({ seed: 6260, gold: 100, sound });
    const container = env.createContainer();
    const view = scheme.createView(engine, { sound });
    view.mount(container, { engine, sound });

    // 1. Multi-step cascade: instant .crucible-hit at 0ms WITHOUT 0ms step(500) orb teleport
    forceEngineState(engine, {
      spawner: ['philosopher_stone', 'gold_stone', 'ember_orb'],
      forceCrucibleIndex: 2,
    });
    view.render();
    container.querySelector('[data-testid="btn-drop-orbs"]').click();

    const crucible2 = container.querySelector('[data-testid="pachinko-crucible-2"]');
    assert.equal(
      Boolean(crucible2 && crucible2.classList.contains('crucible-hit')),
      true,
      'pachinko-crucible-2 must immediately carry .crucible-hit upon drop'
    );

    const stAt0ms = engine.getState();
    const activeOrbs0 = (stAt0ms.orbs || []).filter((o) => !o.devoured);
    assert.ok(activeOrbs0.length >= 1, 'Expected >= 1 surviving orb after drop');
    assert.equal(
      activeOrbs0.some((o) => !o.settled && Number(o.y) < 430),
      true,
      `SigilPachinkoView must NOT synchronously step(500) teleport orbs to bottom in 0ms; got orbs=${JSON.stringify(activeOrbs0.map((o) => ({ y: o.y, settled: o.settled })))}`
    );

    const y0 = activeOrbs0[0].y;
    engine.step(90);
    const y1 = (engine.getState().orbs || []).filter((o) => !o.devoured)[0].y;
    engine.step(90);
    const y2 = (engine.getState().orbs || []).filter((o) => !o.devoured)[0].y;
    assert.ok(
      y1 > y0 && y2 >= y1,
      `Orbs must fall progressively across sub-400ms steps (y0=${y0}, y1=${y1}, y2=${y2})`
    );

    for (let i = 0; i < 10; i++) engine.step(90);
    const settledOrbs = (engine.getState().orbs || []).filter((o) => !o.devoured);
    assert.equal(
      settledOrbs.every((o) => o.settled && Number(o.y) >= 450),
      true,
      'All surviving orbs must settle cleanly at crucible bottom within ~900ms'
    );

    // 2. Launch Aim control (◀ / 居中 / ▶) — leaf enabled <button> elements only
    const EXCLUDED_PACHINKO_BTNS = new Set([
      'btn-drop-orbs',
      'btn-chaos-tilt',
      'btn-endless-mode',
      'btn-new-run',
      'btn-retry-run',
    ]);
    const getPachinkoAuxButtons = () =>
      container.querySelectorAll('button').filter((el) => {
        if (el.disabled) return false;
        const tid = el.getAttribute('data-testid') || '';
        if (EXCLUDED_PACHINKO_BTNS.has(tid) || tid.startsWith('relic-')) return false;
        return true;
      });

    const isPegUpgradeMeta = (meta) =>
      /35\s*g|peg.*upgrade|upgrade.*peg|upgrade-peg|点化|咒印钉|强化钉|升级钉/i.test(meta);

    const findAimBtn = (pattern) =>
      getPachinkoAuxButtons().find((el) => {
        const meta = `${el.getAttribute('data-aim') || ''} ${el.getAttribute('data-testid') || ''} ${el.getAttribute('data-action') || ''} ${el.textContent || ''}`;
        if (isPegUpgradeMeta(meta)) return false;
        return pattern.test(meta);
      });

    const leftAimBtn = findAimBtn(/left|◀|左/i);
    const rightAimBtn = findAimBtn(/right|▶|右/i);
    assert.ok(
      leftAimBtn && rightAimBtn,
      'SigilPachinkoView must render Launch Aim <button> controls (◀ / 居中 / ▶)'
    );
    assert.notEqual(
      leftAimBtn,
      rightAimBtn,
      'Left Aim and Right Aim must be distinct leaf <button> elements'
    );

    engine.reset({ seed: 6261 });
    view.render();
    findAimBtn(/left|◀|左/i).click();
    forceEngineState(engine, { spawner: ['ember_orb', 'frost_core', 'gold_droplet'] });
    container.querySelector('[data-testid="btn-drop-orbs"]').click();
    const leftOrb = engine.getState().orbs[0];

    engine.reset({ seed: 6261 });
    view.render();
    findAimBtn(/right|▶|右/i).click();
    forceEngineState(engine, { spawner: ['ember_orb', 'frost_core', 'gold_droplet'] });
    container.querySelector('[data-testid="btn-drop-orbs"]').click();
    const rightOrb = engine.getState().orbs[0];

    assert.ok(
      Number(leftOrb.x) < Number(rightOrb.x) || Number(leftOrb.vx) < Number(rightOrb.vx),
      `Left Aim vs Right Aim must shift initial orb X or VX (left=${JSON.stringify({ x: leftOrb.x, vx: leftOrb.vx })}, right=${JSON.stringify({ x: rightOrb.x, vx: rightOrb.vx })})`
    );

    // 3. 35G Sigil Peg Upgrade — leaf enabled <button> only
    forceEngineState(engine, { gold: 100 });
    view.render();
    const pegsBefore = JSON.stringify(engine.getState().pegs);
    const pegUpgradeBtn = getPachinkoAuxButtons().find((el) => {
      const meta = `${el.getAttribute('data-testid') || ''} ${el.getAttribute('data-action') || ''} ${el.textContent || ''}`;
      return isPegUpgradeMeta(meta);
    });
    assert.ok(pegUpgradeBtn, 'SigilPachinkoView must render an enabled 35G Sigil Peg Upgrade <button>');
    pegUpgradeBtn.click();

    const stAfterPegUpgrade = engine.getState();
    assert.equal(
      stAfterPegUpgrade.gold,
      65,
      `35G Sigil Peg Upgrade must deduct 35 Gold (100 -> 65), got ${stAfterPegUpgrade.gold}`
    );
    assert.notEqual(
      JSON.stringify(stAfterPegUpgrade.pegs),
      pegsBefore,
      '35G Sigil Peg Upgrade must upgrade at least one peg in state.pegs'
    );

    view.unmount();
  } finally {
    env.cleanup();
  }
});

test('T6-27: [F-R2-06 / Pillar 5] Live browser Scheme 5 clickable matrix-cell-0..15 HOLD toggle & non-lethal [R] Early Fire exploit fix', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'abyssal-grid', { width: 1440, height: 900, seed: 6270 });

  // 1. Click matrix-cell-0 in live browser to lock, then click again to unlock
  const beforeLock = await browser.eval(`(() => {
    const c0 = document.querySelector('[data-testid="matrix-cell-0"]');
    return {
      exists: Boolean(c0),
      lockedClass: Boolean(c0?.classList.contains('matrix-cell-locked')),
      lockedState: ((window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).getState().lockedCells || []).includes(0),
    };
  })()`);
  assert.equal(beforeLock.exists, true, 'Missing [data-testid="matrix-cell-0"]');
  assert.equal(beforeLock.lockedClass, false, 'matrix-cell-0 should start unlocked');

  await browser.clickTestId('matrix-cell-0');
  const afterLock = await browser.eval(`(() => {
    const c0 = document.querySelector('[data-testid="matrix-cell-0"]');
    return {
      lockedClass: Boolean(c0?.classList.contains('matrix-cell-locked')),
      lockedState: ((window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).getState().lockedCells || []).includes(0),
    };
  })()`);
  assert.equal(afterLock.lockedClass, true, 'Clicking matrix-cell-0 must add .matrix-cell-locked');
  assert.equal(afterLock.lockedState, true, 'Clicking matrix-cell-0 must add 0 to state.lockedCells');

  await browser.clickTestId('matrix-cell-0');
  const afterUnlock = await browser.eval(`(() => {
    const c0 = document.querySelector('[data-testid="matrix-cell-0"]');
    return {
      lockedClass: Boolean(c0?.classList.contains('matrix-cell-locked')),
      lockedState: ((window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).getState().lockedCells || []).includes(0),
    };
  })()`);
  assert.equal(afterUnlock.lockedClass, false, 'Clicking locked matrix-cell-0 must unlock it');
  assert.equal(afterUnlock.lockedState, false, 'Clicking locked matrix-cell-0 must remove 0 from lockedCells');

  // 2. Non-lethal [R] / btn-matrix-fire MUST NOT skip wave or award free compound interest
  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    const m = Array(16).fill('skeleton');
    m[0] = 'abyssal_knight';
    b.forceGridOrCylinder({
      wave: 2,
      gold: 100,
      greedMultiplier: 1.0,
      pullsRemaining: 4,
      enemyHp: 250000,
      enemyMaxHp: 250000,
      matrix: m,
    });
  })()`);
  await browser.clickTestId('btn-matrix-fire');
  const stNonLethal = await browser.getBridgeState();

  assert.ok(
    stNonLethal.enemyHp < 250_000 && stNonLethal.enemyHp > 0,
    `Non-lethal Early Fire must deal barrage damage while leaving Boss alive (enemyHp=${stNonLethal.enemyHp})`
  );
  assert.equal(
    stNonLethal.wave,
    2,
    `Non-lethal [R] Early Fire must NOT skip Wave 2 (got wave=${stNonLethal.wave})`
  );
  assert.equal(
    stNonLethal.gold,
    100,
    `Non-lethal [R] Early Fire must NOT grant free wave-clear compound interest Gold (got gold=${stNonLethal.gold})`
  );
  assert.equal(
    stNonLethal.greedMultiplier,
    1.0,
    `Non-lethal [R] Early Fire must NOT grant free 1.35^U greedMultiplier (got ${stNonLethal.greedMultiplier})`
  );
  assert.ok(
    stNonLethal.lastTurnBreakdown.totalDamage > 0,
    `Non-lethal Early Fire must record positive barrage totalDamage in lastTurnBreakdown (got ${stNonLethal.lastTurnBreakdown.totalDamage})`
  );

  // 3. Lethal [R] Early Fire DOES clear wave & bank compound interest
  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.forceGridOrCylinder({
      wave: 2,
      gold: 100,
      greedMultiplier: 1.0,
      pullsRemaining: 4,
      enemyHp: 20,
      enemyMaxHp: 650,
      matrix: Array(16).fill('abyssal_knight'),
    });
  })()`);
  await browser.clickTestId('btn-matrix-fire');
  const stLethal = await browser.getBridgeState();

  assert.equal(stLethal.wave, 3, 'Lethal Early Fire must advance Wave 2 -> Wave 3');
  assert.ok(stLethal.gold > 145, `Lethal Early Fire must award compound interest Gold (got ${stLethal.gold})`);
  assert.ok(
    stLethal.greedMultiplier > 1.3,
    `Lethal Early Fire must scale greedMultiplier (got ${stLethal.greedMultiplier})`
  );
});

test('T6-28: [F-R2-06 / Pillar 5] Scheme 5 wave-transition Commander Ascension merge prevents 16/16 locked board stagnation', async () => {
  const s5Mod = await loadProjectModule('src/games/abyssal-grid/AbyssalGridEngine.js');
  const AbyssalGridEngine = s5Mod.AbyssalGridEngine || s5Mod.default;

  const engine = new AbyssalGridEngine({ seed: 6280 });
  forceEngineState(engine, {
    wave: 1,
    enemyHp: 50,
    enemyMaxHp: 120,
    pullsRemaining: 4,
    matrix: Array(16).fill('abyssal_knight'),
  });

  const st = normalizeGameState(engine.performPrimaryAction(), engine);
  assert.equal(st.wave, 2, 'Lethal 16/16 Knight barrage must advance Wave 1 -> Wave 2');
  assert.ok(
    st.lastTurnBreakdown.lineMultiplier >= 100,
    `10-line Bingo multiplier must evaluate before wave-transition ascension (got ${st.lastTurnBreakdown.lineMultiplier})`
  );
  assert.equal(
    (st.matrix || []).some((cell) => Number(cell?.tier || 0) >= 3),
    true,
    'Wave-transition Commander Ascension must merge pairs of Tier-2 Knights into >=1 Tier-3+ Commander'
  );
  assert.ok(
    (st.lockedCells || []).length < 16,
    `Commander Ascension must reopen unlocked fodder slots (<16 locked cells), got ${(st.lockedCells || []).length}`
  );
});

test('T6-29: [F-R2-02 / Pillar 5] RelicDraftBanner.js contract & post-wave 3-Card Relic Draft surfacing across all 5 schemes', async () => {
  const bannerMod = await loadProjectModule('src/ui/RelicDraftBanner.js');
  assert.equal(
    typeof bannerMod.renderRelicDraftHTML,
    'function',
    'src/ui/RelicDraftBanner.js must export renderRelicDraftHTML(state, options)'
  );
  assert.equal(
    typeof bannerMod.bindRelicDraftEvents,
    'function',
    'src/ui/RelicDraftBanner.js must export bindRelicDraftEvents(containerEl, callbacks)'
  );

  // Verify MockElement safety of renderRelicDraftHTML output
  const sampleHtml = bannerMod.renderRelicDraftHTML({
    wave: 2,
    gold: 240,
    greedMultiplier: 1.82,
    pendingRelicDraft: [
      { id: 'greed_ledger', name: '贪婪账本', description: '利息收益提升' },
      { id: 'gluttony_jaw', name: '暴食颚骨', description: '吞噬层数提升' },
      { id: 'pyro_catalyst', name: '爆破催化剂', description: '连锁倍率提升' },
    ],
  });
  const probe = new MockElement('div');
  probe.innerHTML = sampleHtml;
  assert.ok(probe.querySelector('[data-testid="relic-draft-banner"]'), 'renderRelicDraftHTML must render [data-testid="relic-draft-banner"]');
  for (const svgEl of probe.querySelectorAll('svg')) {
    validateMockElementSafeSVG(svgEl.outerHTML, 'RelicDraftBanner SVG');
  }

  // Verify Wave 1 clear surfaces pendingRelicDraft (3 choices) & relic-draft-banner across all 5 schemes
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');

    for (const schemeId of SCHEME_IDS) {
      const scheme = regMod.getScheme(schemeId);
      const engine = scheme.createEngine({ seed: 6290, sound });
      const container = env.createContainer();
      const view = scheme.createView(engine, { sound });
      view.mount(container, { engine, sound });

      scheme.jackpotSetup(engine);
      forceEngineState(engine, { wave: 1, enemyHp: 10, enemyMaxHp: 120, pullsRemaining: 4 });
      container.querySelector(`[data-testid="${SCHEME_UI_TARGETS[schemeId].ctaTestId}"]`).click();

      const st = normalizeGameState(engine.getState(), engine);
      assert.ok(
        Array.isArray(st.pendingRelicDraft) && st.pendingRelicDraft.length === 3,
        `[${schemeId}] Clearing Wave 1 must populate state.pendingRelicDraft with 3 choices, got ${JSON.stringify(st.pendingRelicDraft)}`
      );
      const uniqueIds = new Set(st.pendingRelicDraft.map((r) => r.id));
      assert.equal(uniqueIds.size, 3, `[${schemeId}] 3 Relic Draft choices must be distinct`);

      assert.ok(
        container.querySelector('[data-testid="relic-draft-banner"]'),
        `[${schemeId}] View must render [data-testid="relic-draft-banner"] after Wave 1 clear`
      );
      for (let i = 0; i < 3; i++) {
        const pickEl = container.querySelector(`[data-testid="relic-pick-${i}"]`);
        assert.ok(pickEl, `[${schemeId}] Missing [data-testid="relic-pick-${i}"]`);
        assert.equal(
          pickEl.getAttribute('data-relic-id'),
          st.pendingRelicDraft[i].id,
          `[${schemeId}] relic-pick-${i} data-relic-id must match pendingRelicDraft[${i}].id`
        );
      }

      view.unmount();
    }
  } finally {
    env.cleanup();
  }
});

test('T6-30: [F-R2-02 / Pillar 5] Live browser interactive Relic Draft pick updates owned relics & hud-relic-strip', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 6300 });

  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.forceGridOrCylinder({ wave: 1, enemyHp: 15, enemyMaxHp: 120, pullsRemaining: 4 });
  })()`);
  await browser.clickTestId('sandbox-trigger-jackpot');

  const draftDom = await browser.eval(`(() => {
    const banner = document.querySelector('[data-testid="relic-draft-banner"]');
    const pick1 = document.querySelector('[data-testid="relic-pick-1"]');
    const r = pick1 ? pick1.getBoundingClientRect() : null;
    return {
      hasBanner: Boolean(banner),
      hasPick1: Boolean(pick1),
      relicId: pick1 ? pick1.getAttribute('data-relic-id') : null,
      width: r ? r.width : 0,
      height: r ? r.height : 0,
    };
  })()`);

  assert.equal(draftDom.hasBanner, true, 'Expected [data-testid="relic-draft-banner"] in live DOM after Wave 1 clear');
  assert.equal(draftDom.hasPick1, true, 'Expected [data-testid="relic-pick-1"] in live DOM');
  assert.ok(draftDom.relicId, 'Expected non-empty data-relic-id on relic-pick-1');
  assert.ok(draftDom.width > 0 && draftDom.height > 0, 'relic-pick-1 must have visible bounds');

  await browser.clickTestId('relic-pick-1');

  const afterPick = await browser.eval(`(() => {
    const banner = document.querySelector('[data-testid="relic-draft-banner"]');
    const strip = document.querySelector('[data-testid="hud-relic-strip"]');
    const stripBadges = strip ? strip.querySelectorAll('svg, [data-relic-id]').length : 0;
    return {
      bannerDismissed: !banner,
      stripBadges,
    };
  })()`);
  const stAfter = await browser.getBridgeState();

  assert.equal(afterPick.bannerDismissed, true, 'Clicking relic-pick-1 must dismiss [data-testid="relic-draft-banner"]');
  assert.equal(
    Boolean(stAfter.pendingRelicDraft && stAfter.pendingRelicDraft.length > 0),
    false,
    'pendingRelicDraft must clear after picking a relic'
  );
  assert.ok(
    extractRelicIds(stAfter).includes(draftDom.relicId),
    `Picked relic "${draftDom.relicId}" must be added to ownedRelics/relics, got ${JSON.stringify(extractRelicIds(stAfter))}`
  );
  assert.ok(
    afterPick.stripBadges >= 1,
    'hud-relic-strip must render the newly drafted relic medallion in live DOM'
  );
});

test('T6-31: [F-R2-02 / Pillar 5] Non-blocking Relic Draft auto-advance rule across all 5 schemes', async () => {
  const env = installMockBrowserEnv();
  try {
    const sound = await createSoundEngineInstance();
    const regMod = await loadProjectModule('src/games/registry.js');

    for (const schemeId of SCHEME_IDS) {
      const scheme = regMod.getScheme(schemeId);
      const engine = scheme.createEngine({ seed: 6310, gold: 400, sound });
      const container = env.createContainer();
      const view = scheme.createView(engine, { sound });
      view.mount(container, { engine, sound });

      const { ctaTestId } = SCHEME_UI_TARGETS[schemeId];
      scheme.jackpotSetup(engine);
      forceEngineState(engine, { wave: 1, enemyHp: 10, enemyMaxHp: 120, pullsRemaining: 4 });
      container.querySelector(`[data-testid="${ctaTestId}"]`).click();

      const stWaveClear = normalizeGameState(engine.getState(), engine);
      assert.ok(
        Array.isArray(stWaveClear.pendingRelicDraft) && stWaveClear.pendingRelicDraft.length === 3,
        `[${schemeId}] Expected pendingRelicDraft after Wave 1 clear`
      );
      const autoRelicId = stWaveClear.pendingRelicDraft[0].id;

      const ctaAfterClear = container.querySelector(`[data-testid="${ctaTestId}"]`);
      assert.ok(ctaAfterClear, `[${schemeId}] Primary CTA must remain mounted during Relic Draft`);
      assert.equal(
        ctaAfterClear.disabled,
        false,
        `[${schemeId}] Primary CTA [${ctaTestId}] must remain enabled (non-blocking) while relic-draft-banner is shown`
      );

      // Keep Wave 2 Boss alive on next spin so we verify pendingRelicDraft cleared cleanly
      forceEngineState(engine, { enemyHp: 999_999, enemyMaxHp: 999_999 });
      ctaAfterClear.click();

      const stNextTurn = normalizeGameState(engine.getState(), engine);
      assert.ok(
        extractRelicIds(stNextTurn).includes(autoRelicId),
        `[${schemeId}] Spinning without manual pick must auto-apply pendingRelicDraft[0] ("${autoRelicId}"), got ${JSON.stringify(extractRelicIds(stNextTurn))}`
      );
      assert.equal(
        Boolean(stNextTurn.pendingRelicDraft && stNextTurn.pendingRelicDraft.length > 0),
        false,
        `[${schemeId}] pendingRelicDraft must clear after auto-advance spin`
      );
      assert.ok(
        stNextTurn.enemyHp < 999_999 || schemeId === 'revolver-dungeon',
        `[${schemeId}] Auto-advance spin must immediately execute Wave 2 turn`
      );

      view.unmount();
    }
  } finally {
    env.cleanup();
  }
});

test('T6-32: [F-R2-02 / Pillar 5] Wave 8 Final Boss clear renders run-victory-banner & btn-endless-mode enters Wave 9+ Endless scaling', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'devour-reels', { width: 1440, height: 900, seed: 6320 });

  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.forceGridOrCylinder({
      wave: 8,
      enemyHp: 50,
      enemyMaxHp: 85000000,
      greedMultiplier: 5000,
      pullsRemaining: 4,
    });
  })()`);
  await browser.clickTestId('sandbox-trigger-jackpot');

  const stVictory = await browser.getBridgeState();
  assert.equal(stVictory.victory, true, 'Clearing Wave 8 Final Boss must set state.victory === true');
  assert.equal(Boolean(stVictory.endlessMode), false, 'endlessMode must be false prior to clicking btn-endless-mode');
  assert.equal(
    await browser.hasTestId('run-victory-banner'),
    true,
    'Wave 8 clear must render [data-testid="run-victory-banner"]'
  );
  assert.equal(
    await browser.hasTestId('btn-endless-mode'),
    true,
    'run-victory-banner must include [data-testid="btn-endless-mode"]'
  );
  assert.equal(
    await browser.hasTestId('btn-new-run'),
    true,
    'run-victory-banner must include [data-testid="btn-new-run"]'
  );

  // Enter Endless Mode (Wave 9+)
  await browser.clickTestId('btn-endless-mode');
  const stEndless = await browser.getBridgeState();
  assert.equal(stEndless.endlessMode, true, 'Clicking btn-endless-mode must set endlessMode === true');
  assert.ok(stEndless.wave >= 9, `Endless Mode must advance to Wave >= 9 (got ${stEndless.wave})`);
  assert.ok(
    stEndless.enemyMaxHp > 85_000_000,
    `Wave 9+ Endless Boss HP must scale beyond 85,000,000 (got ${stEndless.enemyMaxHp})`
  );
  assert.equal(
    await browser.hasTestId('run-victory-banner'),
    false,
    'run-victory-banner must dismiss when entering Endless Mode'
  );

  // Verify btn-new-run resets cleanly to Wave 1
  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.resetGame({ seed: 6321 });
    b.forceGridOrCylinder({
      wave: 8,
      enemyHp: 20,
      enemyMaxHp: 85000000,
      greedMultiplier: 5000,
      pullsRemaining: 4,
    });
  })()`);
  await browser.clickTestId('sandbox-trigger-jackpot');
  assert.equal(await browser.hasTestId('btn-new-run'), true, 'Expected btn-new-run on second victory');
  await browser.clickTestId('btn-new-run');
  const stNewRun = await browser.getBridgeState();
  assert.equal(stNewRun.wave, 1, 'Clicking btn-new-run must reset wave to 1');
  assert.equal(Boolean(stNewRun.victory), false, 'btn-new-run must clear victory flag');
  assert.equal(Boolean(stNewRun.endlessMode), false, 'btn-new-run must clear endlessMode flag');
});

test('T6-33: [F-R2-02 / Pillar 5] Fatal playerHp <= 0 renders run-defeat-banner & btn-retry-run restores fresh run', async () => {
  const browser = await getLiveBrowser();
  await prepareLiveScheme(browser, 'revolver-dungeon', { width: 1440, height: 900, seed: 6330 });

  await browser.eval(`(() => {
    const b = window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__;
    b.forceGridOrCylinder({
      playerHp: 10,
      chambers: [
        'demon_bullet',
        'demon_bullet',
        'demon_bullet',
        'demon_bullet',
        'demon_bullet',
        'demon_bullet',
      ],
      activeChamberIndex: 0,
      forcedChamberIndex: 0,
      forceBackfire: true,
    });
  })()`);
  await browser.clickTestId('btn-spin-fire');

  const stDefeat = await browser.getBridgeState();
  assert.equal(stDefeat.playerHp, 0, `Fatal Demon Bullet backfire must drop playerHp to 0 (got ${stDefeat.playerHp})`);
  assert.equal(stDefeat.gameOver, true, 'playerHp <= 0 must set state.gameOver === true');
  assert.equal(
    await browser.hasTestId('run-defeat-banner'),
    true,
    'Fatal defeat must render [data-testid="run-defeat-banner"]'
  );
  assert.equal(
    await browser.hasTestId('btn-retry-run'),
    true,
    'run-defeat-banner must render [data-testid="btn-retry-run"]'
  );

  await browser.clickTestId('btn-retry-run');
  const stRetry = await browser.getBridgeState();
  assert.equal(Boolean(stRetry.gameOver), false, 'Clicking btn-retry-run must clear gameOver');
  assert.equal(stRetry.playerHp, 100, 'Clicking btn-retry-run must restore playerHp to 100');
  assert.equal(stRetry.wave, 1, 'Clicking btn-retry-run must reset wave/floor to 1');
  assert.equal(
    await browser.hasTestId('run-defeat-banner'),
    false,
    'run-defeat-banner must be removed after clicking btn-retry-run'
  );

  // Also verify Scheme 1 Overtime fatal hit & Scheme 3 breach fatal hit set gameOver === true
  const regMod = await loadProjectModule('src/games/registry.js');
  const s1 = regMod.createEngine('devour-reels', { seed: 6331 });
  forceEngineState(s1, {
    wave: 4,
    playerHp: 5,
    mawArmor: 0,
    pullsRemaining: 0,
    enemyHp: 999_999,
    enemyMaxHp: 999_999,
    grid: Array(9).fill('goblin'),
  });
  const stS1Fatal = s1.performPrimaryAction();
  assert.equal(stS1Fatal.playerHp, 0, 'Scheme 1 fatal Overtime strike must clamp playerHp to 0');
  assert.equal(stS1Fatal.gameOver, true, 'Scheme 1 fatal Overtime strike must set gameOver === true');

  const s3 = regMod.createEngine('jackpot-td', { seed: 6332, wave: 4 });
  forceEngineState(s3, {
    wave: 4,
    playerHp: 5,
    closestEnemyProgress: 0.99,
  });
  let stS3Fatal = s3.getState();
  for (let i = 0; i < 6 && !stS3Fatal.gameOver; i++) {
    stS3Fatal = s3.step(500);
  }
  assert.equal(stS3Fatal.playerHp, 0, 'Scheme 3 fatal enemy breach must drop playerHp to 0');
  assert.equal(stS3Fatal.gameOver, true, 'Scheme 3 fatal enemy breach must set gameOver === true');
});

test('T6-34: [F-R2-01 / F-R2-08 / Pillar 5] Live browser zero 404 network responses (including /favicon.ico), zero pageerrors & zero console.errors across all 7 tabs', async () => {
  await withHeadlessBrowser(
    async (browser) => {
      const hasFaviconLink = await browser.eval(`(() => {
        const icon = document.querySelector('link[rel*="icon"]');
        return Boolean(icon && (icon.getAttribute('href') || '').trim().length > 0);
      })()`);

      for (const schemeId of SCHEME_IDS) {
        const { navTestId, ctaTestId } = SCHEME_UI_TARGETS[schemeId];
        await browser.clickTestId(navTestId);
        await browser.clickTestId(ctaTestId);
      }

      // Exercise GDD Viewer & all 6 GDD docs
      await browser.clickTestId('nav-gdd-viewer');
      await browser.eval(`(async () => {
        const tabs = Array.from(document.querySelectorAll('[data-doc-id]'));
        for (const tab of tabs) {
          tab.click();
          await new Promise((r) => setTimeout(r, 25));
        }
        return tabs.length;
      })()`);

      // Exercise Audio & Math Lab soundboard
      await browser.clickTestId('nav-audio-lab');
      for (const audioBtn of ['audio-test-clunk', 'audio-test-devour', 'audio-test-chime']) {
        if (await browser.hasTestId(audioBtn)) {
          await browser.clickTestId(audioBtn);
        }
      }
      await sleep(80);

      assert.equal(
        hasFaviconLink,
        true,
        'index.html must include a non-empty <link rel="icon"> (e.g., inline SVG data URI) to prevent /favicon.ico 404s'
      );
      assert.deepEqual(
        browser.http404s,
        [],
        `Expected 0 HTTP 404 responses on local static server (including /favicon.ico), got: ${JSON.stringify(browser.http404s)}`
      );
      assert.deepEqual(
        browser.httpErrors,
        [],
        `Expected 0 HTTP >=400 responses on local static server, got: ${JSON.stringify(browser.httpErrors)}`
      );
      assert.deepEqual(
        browser.network404s,
        [],
        `Expected 0 CDP Network 404 responses on local origin, got: ${JSON.stringify(browser.network404s)}`
      );
      assert.deepEqual(
        browser.pageErrors,
        [],
        `Expected 0 uncaught page errors across all 7 tabs, got: ${browser.pageErrors.join('; ')}`
      );
      assert.deepEqual(
        browser.consoleErrors,
        [],
        `Expected 0 console.error messages across all 7 tabs, got: ${browser.consoleErrors.join('; ')}`
      );
    },
    {
      path: '/',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    }
  );
});

test('T6-35: [F-R2-02 / F-R2-08 / Pillar 5] Public GitHub Pages URL in README.md, subpath-safe relative asset paths & .nojekyll presence', async () => {
  const readme = readProjectText('README.md');
  assert.ok(
    readme.includes('https://luca5702.github.io/slotbound-dopamine-lab/'),
    'README.md must prominently document the public GitHub Pages demo URL https://luca5702.github.io/slotbound-dopamine-lab/'
  );
  for (const gddPath of GDD_FILES) {
    const baseName = path.basename(gddPath);
    assert.ok(readme.includes(baseName), `README.md must reference ${baseName}`);
  }
  for (const cmd of ['npm start', 'npm test', 'npm run test:e2e']) {
    assert.ok(readme.includes(cmd), `README.md must document "${cmd}"`);
  }
  assert.equal(
    /\b(TODO|FIXME|TBD)\b/.test(readme),
    false,
    'README.md must not contain TODO/FIXME/TBD placeholders'
  );
  assert.equal(
    fileExists('.nojekyll'),
    true,
    'Project root must include .nojekyll for GitHub Pages deployment'
  );

  // Scan index.html, src/**/*.js, and src/styles/*.css for forbidden root-relative local asset URLs
  const filesToScan = [
    path.join(PROJECT_ROOT, 'index.html'),
    ...listFilesRecursively(path.join(PROJECT_ROOT, 'src'), (f) => /\.(js|mjs|css)$/.test(f)),
  ];

  const violations = [];
  for (const fullFile of filesToScan) {
    const rel = path.relative(PROJECT_ROOT, fullFile);
    const raw = fs.readFileSync(fullFile, 'utf8');
    // Strip JS/CSS block comments and JS full-line comments to avoid false-positive doc comments
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    if (/(?:src|href)\s*=\s*["']\/(?!\/)/.test(stripped)) {
      violations.push(`${rel}: root-relative src="/..." or href="/..." breaks /slotbound-dopamine-lab/ subpath`);
    }
    if (/fetch\s*\(\s*["'`]\/(?!\/)/.test(stripped)) {
      violations.push(`${rel}: root-relative fetch("/...") breaks /slotbound-dopamine-lab/ subpath`);
    }
    if (/url\(\s*["']?\/(?!\/)/.test(stripped)) {
      violations.push(`${rel}: root-relative CSS url(/...) breaks /slotbound-dopamine-lab/ subpath`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `All asset/module/fetch/CSS paths must be relative for GitHub Pages subpath safety:\n${violations.join('\n')}`
  );
});
