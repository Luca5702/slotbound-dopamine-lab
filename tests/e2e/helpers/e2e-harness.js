import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PROJECT_ROOT = '/home/antigravity';

export const GDD_FILES = Object.freeze([
  'docs/gdd/00-master-design-philosophy.md',
  'docs/gdd/01-iron-laws-math-and-audio.md',
  'docs/gdd/02-scheme1-devour-reels.md',
  'docs/gdd/03-scheme2-revolver-dungeon.md',
  'docs/gdd/04-scheme3-jackpot-td.md',
  'docs/gdd/05-explorations-pachinko-grid.md',
]);

export const SCHEME_IDS = Object.freeze([
  'devour-reels',
  'revolver-dungeon',
  'jackpot-td',
  'sigil-pachinko',
  'abyssal-grid',
]);

/**
 * Resolves a project-relative path against `/home/antigravity`.
 * @param {string} relPath
 * @returns {string}
 */
export function resolveProjectPath(relPath) {
  return path.resolve(PROJECT_ROOT, String(relPath || '').replace(/^\/+/, ''));
}

/**
 * Returns true if the project-relative file exists on disk.
 * @param {string} relPath
 * @returns {boolean}
 */
export function fileExists(relPath) {
  return fs.existsSync(resolveProjectPath(relPath));
}

/**
 * Reads a project UTF-8 text file or fails with a clear E2E assertion message.
 * @param {string} relPath
 * @returns {string}
 */
export function readProjectText(relPath) {
  const fullPath = resolveProjectPath(relPath);
  assert.ok(
    fs.existsSync(fullPath),
    `[E2E Missing File] Expected file to exist at ${fullPath}`
  );
  return fs.readFileSync(fullPath, 'utf8');
}

let __mainImportSeq = 0;

/**
 * Dynamically imports a project ES module or fails with a clear E2E assertion message.
 * When `relPath` targets `src/main.js`, appends a cache-busting query string so each
 * test that installs a fresh `installMockBrowserEnv()` re-runs `src/main.js` bootstrap.
 * @param {string} relPath
 * @returns {Promise<any>}
 */
export async function loadProjectModule(relPath) {
  const fullPath = resolveProjectPath(relPath);
  assert.ok(
    fs.existsSync(fullPath),
    `[E2E Missing Module] Expected ESM module at ${fullPath}`
  );
  const baseHref = pathToFileURL(fullPath).href;
  const isMainEntry = /(^|\/)src\/main\.js$/.test(String(relPath));
  const fileUrl = isMainEntry ? `${baseHref}?instance=${++__mainImportSeq}` : baseHref;
  const mod = await import(fileUrl);
  if (
    isMainEntry &&
    globalThis.window &&
    !globalThis.window.__SLOTBOUND__ &&
    !globalThis.window.__SLOTBOUND_TEST__
  ) {
    const initFn =
      mod.initApp ||
      mod.bootstrap ||
      mod.mountApp ||
      (typeof mod.default === 'function' ? mod.default : null);
    if (typeof initFn === 'function') {
      await initFn();
    }
  }
  return mod;
}

/**
 * Extracts a required export from a loaded module by checking candidate names.
 * @param {any} mod
 * @param {string|string[]} candidateNames
 * @param {string} [relPath='module']
 * @returns {any}
 */
export function requireExport(mod, candidateNames, relPath = 'module') {
  const names = Array.isArray(candidateNames) ? candidateNames : [candidateNames];
  for (const name of names) {
    if (mod && mod[name] !== undefined) return mod[name];
    if (mod?.default && typeof mod.default === 'object' && mod.default[name] !== undefined) {
      return mod.default[name];
    }
  }
  if (mod?.default && typeof mod.default === 'function') {
    return mod.default;
  }
  assert.fail(
    `[E2E Missing Export] Expected one of [${names.join(', ')}] in ${relPath}, found exports: [${Object.keys(mod || {}).join(', ')}]`
  );
}

// ============================================================================
// Opaque-Box Contract Adapters (Normalizing documented PROJECT.md aliases)
// ============================================================================

/**
 * Instantiates a PRNG from `src/core/PRNG.js` using `createPRNG(seed)` or `new PRNG(seed)`.
 */
export async function createPRNGInstance(seed) {
  const mod = await loadProjectModule('src/core/PRNG.js');
  const factoryOrClass = requireExport(mod, ['createPRNG', 'PRNG'], 'src/core/PRNG.js');
  if (typeof factoryOrClass === 'function') {
    try {
      return factoryOrClass(seed);
    } catch {
      return new factoryOrClass(seed);
    }
  }
  assert.fail('[E2E Invalid Export] PRNG export is not callable');
}

/**
 * Extracts the string ID from a `pickWeighted` return value (handles object `{ id }` or primitive string).
 */
export function unwrapWeightedPick(picked) {
  if (picked && typeof picked === 'object') {
    return picked.id ?? picked.symbolId ?? picked.value ?? picked.name ?? picked;
  }
  return picked;
}

/**
 * Normalizes a `calculateSpinDamage` or `lastTurnBreakdown` / `lastFormula` object.
 */
export function normalizeDamageBreakdown(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      basePoints: 0,
      baseChips: 0,
      lineMultiplier: 1,
      lineMult: 1,
      devourStacks: 0,
      devourStacksMultiplier: 1,
      chainSynergyMultiplier: 1,
      greedMultiplier: 1,
      totalDamage: 0,
      formattedDamage: '0',
      intensityTier: 0,
      settlementDurationMs: 0,
      comboName: '',
      triggeredSynergies: [],
    };
  }
  const basePoints = Number(raw.basePoints ?? raw.baseChips ?? 0);
  const lineMultiplier = Number(raw.lineMultiplier ?? raw.lineMult ?? 1);
  const devourStacks = Number(raw.devourStacks ?? 0);
  const devourStacksMultiplier = Number(
    raw.devourStacksMultiplier ?? raw.devourMult ?? 1
  );
  const chainSynergyMultiplier = Number(
    raw.chainSynergyMultiplier ?? raw.chainMult ?? 1
  );
  const greedMultiplier = Number(raw.greedMultiplier ?? raw.greedMult ?? 1);
  const totalDamage = Number(raw.totalDamage ?? raw.damage ?? 0);
  const formattedDamage = String(raw.formattedDamage ?? raw.formatted ?? totalDamage);
  const intensityTier = Number(raw.intensityTier ?? raw.shakeTier ?? 0);
  const settlementDurationMs = Number(
    raw.settlementDurationMs ?? raw.devourSettlementMs ?? raw.durationMs ?? 0
  );
  const comboName = String(raw.comboName ?? raw.handName ?? '');
  const rawSynergies =
    raw.triggeredSynergies ?? raw.synergies ?? raw.chainReactions ?? [];
  const triggeredSynergies = Array.isArray(rawSynergies)
    ? rawSynergies.map((s) => (typeof s === 'string' ? s : s?.id || s?.name || JSON.stringify(s)))
    : [];

  return {
    ...raw,
    basePoints,
    baseChips: basePoints,
    lineMultiplier,
    lineMult: lineMultiplier,
    devourStacks,
    devourStacksMultiplier,
    chainSynergyMultiplier,
    greedMultiplier,
    totalDamage,
    formattedDamage,
    intensityTier,
    settlementDurationMs,
    comboName,
    triggeredSynergies,
  };
}

/**
 * Invokes `calculateSpinDamage` from `src/core/ScoreFormula.js` and returns normalized breakdown.
 */
export async function invokeCalculateSpinDamage(params = {}) {
  const mod = await loadProjectModule('src/core/ScoreFormula.js');
  const fn = requireExport(
    mod,
    ['calculateSpinDamage', 'computeSpinDamage', 'evaluateSpinDamage'],
    'src/core/ScoreFormula.js'
  );
  const raw = fn(params);
  return normalizeDamageBreakdown(raw);
}

/**
 * Creates or normalizes an Economy state/instance from `src/core/EconomyEngine.js`.
 */
export async function loadEconomyModule() {
  return await loadProjectModule('src/core/EconomyEngine.js');
}

export async function invokeSettleWaveClear(economyState = {}, unusedPulls = 0) {
  const mod = await loadEconomyModule();
  const settleFn = mod.settleWaveClear || mod.default?.settleWaveClear;
  if (typeof settleFn === 'function') {
    const res = settleFn({ ...economyState }, unusedPulls);
    const merged = res?.state ? { ...res.state, ...res } : res;
    const prevGold = Math.max(0, Number(economyState.gold ?? 0));
    const baseWaveGold = Math.max(0, Number(economyState.baseWaveGold ?? 40));
    const newGold = Number(merged.gold ?? prevGold);
    const interestGold = Number(
      merged.interestGold ??
        merged.settlement?.interestGold ??
        merged.breakdown?.interestGold ??
        Math.max(0, newGold - prevGold - baseWaveGold)
    );
    const greedMultiplier = Number(
      merged.greedMultiplier ??
        merged.state?.greedMultiplier ??
        economyState.greedMultiplier ??
        1
    );
    const relicOptions =
      merged.relicOptions ??
      merged.draftOptions ??
      merged.relicDraft ??
      (typeof mod.getRelicDraftChoices === 'function'
        ? mod.getRelicDraftChoices(merged, 3)
        : typeof mod.getRelicDraftOptions === 'function'
          ? mod.getRelicDraftOptions(merged)
          : Array.isArray(mod.DEFAULT_RELIC_CATALOG)
            ? mod.DEFAULT_RELIC_CATALOG.slice(0, 3)
            : []);
    return {
      ...merged,
      gold: newGold,
      interestGold,
      greedMultiplier,
      relicOptions,
    };
  }
  const EngineClass = requireExport(mod, ['EconomyEngine'], 'src/core/EconomyEngine.js');
  const inst = new EngineClass(economyState);
  const res = inst.settleWaveClear(unusedPulls);
  const st = typeof inst.getState === 'function' ? inst.getState() : inst;
  return {
    ...st,
    ...(res || {}),
    gold: Number(res?.gold ?? st?.gold ?? 0),
    interestGold: Number(res?.interestGold ?? st?.interestGold ?? 0),
    greedMultiplier: Number(res?.greedMultiplier ?? st?.greedMultiplier ?? 1),
  };
}

/**
 * Instantiates an `EventBus` from `src/core/EventBus.js`.
 */
export async function createEventBusInstance(options = {}) {
  const mod = await loadProjectModule('src/core/EventBus.js');
  if (typeof mod.createEventBus === 'function') {
    return mod.createEventBus(options);
  }
  const Cls = requireExport(mod, ['EventBus'], 'src/core/EventBus.js');
  return new Cls(options);
}

/**
 * Returns the event history array from an `EventBus` instance regardless of getter alias.
 */
export function getEventBusLog(bus) {
  if (!bus) return [];
  if (typeof bus.getHistory === 'function') return bus.getHistory();
  if (typeof bus.getLog === 'function') return bus.getLog();
  if (typeof bus.getEvents === 'function') return bus.getEvents();
  if (typeof bus.getRingBuffer === 'function') return bus.getRingBuffer();
  if (Array.isArray(bus.history)) return bus.history;
  if (Array.isArray(bus.log)) return bus.log;
  if (Array.isArray(bus.events)) return bus.events;
  if (Array.isArray(bus.ringBuffer)) return bus.ringBuffer;
  return [];
}

/**
 * Instantiates a `FlowTracker` from `src/core/FlowTracker.js`.
 */
export async function createFlowTrackerInstance(options = {}) {
  const mod = await loadProjectModule('src/core/FlowTracker.js');
  if (typeof mod.createFlowTracker === 'function') {
    return mod.createFlowTracker(options);
  }
  const Cls = requireExport(mod, ['FlowTracker'], 'src/core/FlowTracker.js');
  return new Cls(options);
}

/**
 * Instantiates `SoundEngine` from `src/audio/SoundEngine.js`.
 */
export async function createSoundEngineInstance(options = {}) {
  const mod = await loadProjectModule('src/audio/SoundEngine.js');
  if (typeof mod.createSoundEngine === 'function') {
    return mod.createSoundEngine(options);
  }
  const Cls = requireExport(mod, ['SoundEngine'], 'src/audio/SoundEngine.js');
  return new Cls(options);
}

/**
 * Normalizes a game engine state snapshot so tests can read consistent fields.
 */
export function normalizeGameState(rawState = {}, engine = null) {
  const st = rawState && typeof rawState === 'object' ? { ...rawState } : {};
  const rawBreakdown =
    st.lastTurnBreakdown ||
    st.lastFormula ||
    st.lastSpinResult ||
    st.lastResult ||
    {};
  const lastTurnBreakdown = normalizeDamageBreakdown(rawBreakdown);
  st.lastTurnBreakdown = lastTurnBreakdown;
  st.lastFormula = lastTurnBreakdown;
  st.schemeId = st.schemeId || st.id || engine?.id || '';
  st.wave = Number(st.wave ?? st.floor ?? 1);
  st.gold = Number(st.gold ?? 0);
  st.greedMultiplier = Number(
    st.greedMultiplier ?? st.economy?.greedMultiplier ?? lastTurnBreakdown.greedMultiplier ?? 1
  );
  st.pullsRemaining = Number(st.pullsRemaining ?? st.spinsRemaining ?? st.dropsRemaining ?? 5);
  st.pullsUsed = Number(st.pullsUsed ?? st.spinsUsed ?? 0);
  st.playerHp = Number(st.playerHp ?? st.baseHp ?? 100);
  st.enemyHp = Number(st.enemyHp ?? st.bossHp ?? 0);
  st.enemyMaxHp = Number(st.enemyMaxHp ?? st.bossMaxHp ?? st.enemyHp ?? 100);
  return st;
}

/**
 * Forces the next spin/grid/cylinder/pedestals/matrix on any `IGameEngine` instance.
 */
export function forceEngineState(engine, forcedPayload) {
  if (!engine) return;
  if (Array.isArray(forcedPayload)) {
    if (typeof engine.forceNextSpin === 'function') {
      engine.forceNextSpin(forcedPayload);
      return;
    }
    if (typeof engine.forceGridOrCylinder === 'function') {
      engine.forceGridOrCylinder(forcedPayload);
      return;
    }
    if (typeof engine.forceState === 'function') {
      engine.forceState({
        grid: forcedPayload,
        chambers: forcedPayload,
        pedestals: forcedPayload,
        spawner: forcedPayload,
        orbs: forcedPayload,
        matrix: forcedPayload,
        nextSpin: forcedPayload,
      });
      return;
    }
  } else if (forcedPayload && typeof forcedPayload === 'object') {
    if (typeof engine.forceState === 'function') {
      engine.forceState(forcedPayload);
      return;
    }
    const arr =
      forcedPayload.grid ||
      forcedPayload.chambers ||
      forcedPayload.pedestals ||
      forcedPayload.spawner ||
      forcedPayload.orbs ||
      forcedPayload.matrix ||
      forcedPayload.nextSpin;
    if (arr && typeof engine.forceNextSpin === 'function') {
      engine.forceNextSpin(arr);
    } else if (arr && typeof engine.forceGridOrCylinder === 'function') {
      engine.forceGridOrCylinder(arr);
    }
    Object.assign(engine, forcedPayload);
  }
}

// ============================================================================
// Mock Browser / DOM / Canvas 2D / Web Audio Environment for Fast Node Tests
// ============================================================================

const VOID_TAGS = new Set([
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

function decodeEntities(str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export class MockCanvas2DContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.__ops = [];
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '12px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
  }
  _record(op, args) {
    if (this.__ops.length < 2000) {
      this.__ops.push({ op, args });
    }
  }
  fillRect(...args) { this._record('fillRect', args); }
  strokeRect(...args) { this._record('strokeRect', args); }
  clearRect(...args) { this._record('clearRect', args); }
  beginPath(...args) { this._record('beginPath', args); }
  closePath(...args) { this._record('closePath', args); }
  moveTo(...args) { this._record('moveTo', args); }
  lineTo(...args) { this._record('lineTo', args); }
  arc(...args) { this._record('arc', args); }
  arcTo(...args) { this._record('arcTo', args); }
  ellipse(...args) { this._record('ellipse', args); }
  quadraticCurveTo(...args) { this._record('quadraticCurveTo', args); }
  bezierCurveTo(...args) { this._record('bezierCurveTo', args); }
  rect(...args) { this._record('rect', args); }
  roundRect(...args) { this._record('roundRect', args); }
  fill(...args) { this._record('fill', args); }
  stroke(...args) { this._record('stroke', args); }
  clip(...args) { this._record('clip', args); }
  fillText(...args) { this._record('fillText', args); }
  strokeText(...args) { this._record('strokeText', args); }
  measureText(text) { return { width: String(text || '').length * 8 }; }
  drawImage(...args) { this._record('drawImage', args); }
  save() { this._record('save', []); }
  restore() { this._record('restore', []); }
  translate(...args) { this._record('translate', args); }
  rotate(...args) { this._record('rotate', args); }
  scale(...args) { this._record('scale', args); }
  setTransform(...args) { this._record('setTransform', args); }
  resetTransform() { this._record('resetTransform', []); }
  setLineDash(...args) { this._record('setLineDash', args); }
  getLineDash() { return []; }
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
}

export class MockElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.id = '';
    this._className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this._textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.width = 800;
    this.height = 600;
    this._listeners = new Map();
    this._ctx2d = null;
    const self = this;
    this.classList = {
      add(...tokens) {
        const set = new Set(self._className.split(/\s+/).filter(Boolean));
        for (const t of tokens) if (t) set.add(t);
        self._className = [...set].join(' ');
        self.attributes.set('class', self._className);
      },
      remove(...tokens) {
        const set = new Set(self._className.split(/\s+/).filter(Boolean));
        for (const t of tokens) set.delete(t);
        self._className = [...set].join(' ');
        self.attributes.set('class', self._className);
      },
      toggle(token, force) {
        const set = new Set(self._className.split(/\s+/).filter(Boolean));
        const has = set.has(token);
        const shouldHave = force !== undefined ? Boolean(force) : !has;
        if (shouldHave) set.add(token);
        else set.delete(token);
        self._className = [...set].join(' ');
        self.attributes.set('class', self._className);
        return shouldHave;
      },
      contains(token) {
        return self._className.split(/\s+/).filter(Boolean).includes(token);
      },
    };
  }

  get className() {
    return this._className;
  }
  set className(val) {
    this._className = String(val || '');
    this.attributes.set('class', this._className);
  }

  setAttribute(name, value) {
    const attrName = String(name).toLowerCase();
    const strVal = String(value ?? '');
    this.attributes.set(attrName, strVal);
    if (attrName === 'id') this.id = strVal;
    else if (attrName === 'class') this._className = strVal;
    else if (attrName === 'value') this.value = strVal;
    else if (attrName === 'disabled') this.disabled = strVal !== 'false';
    else if (attrName.startsWith('data-')) {
      const camel = attrName
        .slice(5)
        .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = strVal;
    }
  }

  getAttribute(name) {
    const attrName = String(name).toLowerCase();
    if (attrName === 'id' && this.id) return this.id;
    if (attrName === 'class' && this._className) return this._className;
    if (attrName.startsWith('data-')) {
      const camel = attrName
        .slice(5)
        .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      if (this.dataset[camel] !== undefined) return String(this.dataset[camel]);
    }
    return this.attributes.has(attrName) ? this.attributes.get(attrName) : null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  removeAttribute(name) {
    const attrName = String(name).toLowerCase();
    this.attributes.delete(attrName);
    if (attrName === 'id') this.id = '';
    if (attrName === 'class') this._className = '';
    if (attrName === 'disabled') this.disabled = false;
    if (attrName.startsWith('data-')) {
      const camel = attrName
        .slice(5)
        .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      delete this.dataset[camel];
    }
  }

  appendChild(child) {
    if (!child) return child;
    if (child.nodeType === 11 && Array.isArray(child.children)) {
      for (const c of [...child.children]) {
        this.appendChild(c);
      }
      return child;
    }
    if (child.parentElement && child.parentElement !== this) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    child.parentNode = this;
    if (!this.children.includes(child)) {
      this.children.push(child);
    }
    return child;
  }

  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const span = new MockElement('span', this.ownerDocument);
        span.textContent = n;
        this.appendChild(span);
      } else if (n) {
        this.appendChild(n);
      }
    }
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...nodes) {
    for (const c of this.children) {
      c.parentElement = null;
      c.parentNode = null;
    }
    this.children = [];
    this._textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent;
    }
    return (
      this._textContent +
      this.children.map((c) => c.textContent || '').join('')
    );
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val ?? '');
    this._innerHTML = this._textContent;
  }

  get innerText() {
    return this.textContent;
  }
  set innerText(val) {
    this.textContent = val;
  }

  get innerHTML() {
    if (this.children.length === 0) {
      return this._innerHTML || this._textContent;
    }
    return this.children.map((c) => c.outerHTML).join('');
  }

  set innerHTML(html) {
    const str = String(html ?? '');
    this._innerHTML = str;
    this._textContent = '';
    this.children = [];
    if (!str) return;
    if (!str.includes('<')) {
      this._textContent = decodeEntities(str);
      return;
    }
    parseHTMLIntoElement(str, this, this.ownerDocument);
  }

  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = [];
    for (const [k, v] of this.attributes.entries()) {
      attrs.push(`${k}="${v}"`);
    }
    for (const [camel, v] of Object.entries(this.dataset)) {
      const dash =
        'data-' + camel.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
      if (!this.attributes.has(dash)) {
        attrs.push(`${dash}="${v}"`);
      }
    }
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    return `<${tag}${attrStr}>${this.innerHTML}</${tag}>`;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }
  get lastElementChild() {
    return this.children[this.children.length - 1] || null;
  }
  get childNodes() {
    return this.children;
  }

  matches(selector) {
    return matchSelector(this, selector);
  }

  closest(selector) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const groups = String(selector || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const visit = (node) => {
      for (const child of node.children) {
        if (groups.some((g) => matchComplexSelector(child, g))) {
          results.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') return;
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this._listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    const evt =
      typeof event === 'string'
        ? { type: event, bubbles: true }
        : event || { type: 'unknown', bubbles: true };
    if (!evt.target) evt.target = this;
    evt.currentTarget = this;
    evt.preventDefault = evt.preventDefault || (() => { evt.defaultPrevented = true; });
    evt.stopPropagation =
      evt.stopPropagation || (() => { evt._stopped = true; });

    const set = this._listeners.get(evt.type);
    if (set) {
      for (const fn of [...set]) {
        fn.call(this, evt);
      }
    }
    if (typeof this[`on${evt.type}`] === 'function') {
      this[`on${evt.type}`](evt);
    }
    if (evt.bubbles !== false && !evt._stopped) {
      if (this.parentElement) {
        this.parentElement.dispatchEvent(evt);
      } else if (this.ownerDocument && this !== this.ownerDocument) {
        this.ownerDocument.dispatchEvent(evt);
      }
    }
    return !evt.defaultPrevented;
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent({
      type: 'click',
      bubbles: true,
      target: this,
      button: 0,
    });
  }

  focus() {}
  blur() {}
  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: this.width || 800,
      bottom: this.height || 600,
      width: this.width || 800,
      height: this.height || 600,
    };
  }

  getContext(type) {
    if (type === '2d') {
      if (!this._ctx2d) {
        this._ctx2d = new MockCanvas2DContext(this);
      }
      return this._ctx2d;
    }
    return null;
  }
}

function matchSingleSelector(el, sel) {
  if (!el || el.nodeType !== 1 || !sel) return false;
  let remaining = sel.trim();
  if (!remaining) return false;
  if (remaining === '*') return true;

  // Extract attribute selectors: [attr="val"], [attr^='val'], [attr]
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(remaining)) !== null) {
    const attrName = attrMatch[1];
    const op = attrMatch[2];
    const expected = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
    const actual = el.getAttribute(attrName);
    if (actual === null) return false;
    if (op === '=') {
      if (actual !== expected) return false;
    } else if (op === '^=') {
      if (!actual.startsWith(expected)) return false;
    } else if (op === '$=') {
      if (!actual.endsWith(expected)) return false;
    } else if (op === '*=') {
      if (!actual.includes(expected)) return false;
    }
  }
  remaining = remaining.replace(attrRegex, '');

  // Extract #id
  const idMatch = remaining.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    remaining = remaining.replace(idMatch[0], '');
  }

  // Extract .class
  const classMatches = [...remaining.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
    remaining = remaining.replace(cm[0], '');
  }

  // Remaining tag name
  remaining = remaining.trim();
  if (remaining) {
    if (el.tagName.toLowerCase() !== remaining.toLowerCase()) return false;
  }
  return true;
}

function matchComplexSelector(el, selector) {
  const parts = String(selector || '')
    .trim()
    .split(/\s+/)
    .filter((p) => p && p !== '>');
  if (parts.length === 0) return false;
  if (!matchSingleSelector(el, parts[parts.length - 1])) return false;
  let cur = el.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cur && !matchSingleSelector(cur, parts[i])) {
      cur = cur.parentElement;
    }
    if (!cur) return false;
    cur = cur.parentElement;
  }
  return true;
}

function matchSelector(el, selector) {
  const groups = String(selector || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return groups.some((g) => matchComplexSelector(el, g));
}

function parseHTMLIntoElement(html, rootEl, ownerDocument) {
  const stack = [rootEl];
  const tokenRegex = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    const [, closeTag, openTag, attrString, selfCloseSlash, textNode] = match;
    const currentParent = stack[stack.length - 1] || rootEl;

    if (closeTag) {
      const lowerClose = closeTag.toLowerCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName.toLowerCase() === lowerClose) {
          stack.length = i;
          break;
        }
      }
    } else if (openTag) {
      const lowerOpen = openTag.toLowerCase();
      const el = new MockElement(lowerOpen, ownerDocument);
      if (attrString) {
        const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let am;
        while ((am = attrRegex.exec(attrString)) !== null) {
          const aName = am[1];
          const aVal = am[2] ?? am[3] ?? am[4] ?? '';
          el.setAttribute(aName, decodeEntities(aVal));
        }
      }
      currentParent.appendChild(el);
      if (!selfCloseSlash && !VOID_TAGS.has(lowerOpen)) {
        stack.push(el);
      }
    } else if (textNode) {
      const decoded = decodeEntities(textNode);
      if (decoded.trim().length > 0 || currentParent.children.length === 0) {
        currentParent._textContent += decoded;
        if (currentParent.tagName === 'OPTION' && !currentParent.attributes.has('value')) {
          currentParent.value = decoded.trim();
        }
      }
    }
  }
}

export class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createOscillator() {
    this.currentTime += 0.01;
    return {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: (v) => { this.frequency = v; },
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      detune: { value: 0, setValueAtTime: () => {} },
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
         setTargetAtTime: () => {},
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
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      Q: { value: 1, setValueAtTime: () => {} },
      gain: { value: 0, setValueAtTime: () => {} },
      connect() { return this; },
      disconnect() {},
    };
  }
  createBuffer(channels = 1, length = 4410, sampleRate = 44100) {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => data,
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      playbackRate: { value: 1, setValueAtTime: () => {} },
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: { value: -24, setValueAtTime: () => {} },
      knee: { value: 30, setValueAtTime: () => {} },
      ratio: { value: 12, setValueAtTime: () => {} },
      attack: { value: 0.003, setValueAtTime: () => {} },
      release: { value: 0.25, setValueAtTime: () => {} },
      connect() { return this; },
      disconnect() {},
    };
  }
}

/**
 * Installs a deterministic mock Browser / DOM / Canvas 2D / WebAudio environment in Node.
 */
export function installMockBrowserEnv() {
  const docListeners = new Map();
  const winListeners = new Map();

  const mockDocument = {
    readyState: 'complete',
    documentElement: null,
    head: null,
    body: null,
    createElement(tag) {
      return new MockElement(tag, mockDocument);
    },
    createDocumentFragment() {
      const frag = new MockElement('fragment', mockDocument);
      frag.nodeType = 11;
      return frag;
    },
    createTextNode(text) {
      const span = new MockElement('span', mockDocument);
      span.textContent = text;
      return span;
    },
    getElementById(id) {
      return mockDocument.body.querySelector(`#${id}`);
    },
    querySelector(sel) {
      return mockDocument.body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return mockDocument.body.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatchEvent(evt) {
      const e = typeof evt === 'string' ? { type: evt, bubbles: true } : evt;
      e.target = e.target || mockDocument.body;
      e.preventDefault = e.preventDefault || (() => { e.defaultPrevented = true; });
      e.stopPropagation = e.stopPropagation || (() => { e._stopped = true; });
      const set = docListeners.get(e.type);
      if (set) {
        for (const fn of [...set]) fn.call(mockDocument, e);
      }
      if (e.bubbles !== false && !e._stopped && globalThis.window) {
        globalThis.window.dispatchEvent(e);
      }
      return !e.defaultPrevented;
    },
  };

  mockDocument.documentElement = new MockElement('html', mockDocument);
  mockDocument.head = new MockElement('head', mockDocument);
  mockDocument.body = new MockElement('body', mockDocument);
  mockDocument.documentElement.appendChild(mockDocument.head);
  mockDocument.documentElement.appendChild(mockDocument.body);

  const storageMap = new Map();
  const mockLocalStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  const nativeFetch = globalThis.fetch;
  const mockFetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : String(input?.url || '');
    if (
      urlStr.startsWith('http://127.0.0.1') ||
      urlStr.startsWith('http://localhost') ||
      urlStr.startsWith('https://')
    ) {
      return nativeFetch(input, init);
    }
    const cleanRel = urlStr.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    const fullPath = resolveProjectPath(cleanRel);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath, 'utf8');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/markdown; charset=utf-8']]),
        text: async () => content,
        json: async () => JSON.parse(content),
      };
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => `404 Not Found: ${urlStr}`,
    };
  };

  const mockWindow = {
    document: mockDocument,
    localStorage: mockLocalStorage,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    __AUDIO_LOG__: [],
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    fetch: mockFetch,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent(evt) {
      const e = typeof evt === 'string' ? { type: evt } : evt;
      e.target = e.target || mockWindow;
      e.preventDefault = e.preventDefault || (() => { e.defaultPrevented = true; });
      e.stopPropagation = e.stopPropagation || (() => { e._stopped = true; });
      const set = winListeners.get(e.type);
      if (set) {
        for (const fn of [...set]) fn.call(mockWindow, e);
      }
      return !e.defaultPrevented;
    },
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.localStorage = mockLocalStorage;
  globalThis.AudioContext = MockAudioContext;
  globalThis.webkitAudioContext = MockAudioContext;
  globalThis.HTMLElement = MockElement;
  globalThis.Element = MockElement;
  globalThis.requestAnimationFrame = mockWindow.requestAnimationFrame;
  globalThis.cancelAnimationFrame = mockWindow.cancelAnimationFrame;
  globalThis.fetch = mockFetch;

  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail ?? null;
        this.bubbles = params.bubbles ?? true;
        this.cancelable = params.cancelable ?? true;
      }
    };
  }
  if (typeof globalThis.KeyboardEvent !== 'function') {
    globalThis.KeyboardEvent = class KeyboardEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.key = params.key ?? '';
        this.code = params.code ?? '';
        this.repeat = Boolean(params.repeat);
        this.bubbles = params.bubbles ?? true;
        this.cancelable = params.cancelable ?? true;
      }
      preventDefault() { this.defaultPrevented = true; }
      stopPropagation() { this._stopped = true; }
    };
  }

  return {
    window: mockWindow,
    document: mockDocument,
    createContainer() {
      const container = new MockElement('div', mockDocument);
      mockDocument.body.appendChild(container);
      return container;
    },
    cleanup() {
      mockDocument.body.replaceChildren();
    },
  };
}

// ============================================================================
// Static Server & Headless Chromium CDP Runner
// ============================================================================

const FALLBACK_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Starts the project's static HTTP server (`scripts/serve.js` if present, else fallback) on an ephemeral port.
 */
export async function startStaticServer() {
  if (fileExists('scripts/serve.js')) {
    const serveMod = await loadProjectModule('scripts/serve.js');
    if (typeof serveMod.startServer === 'function') {
      const started = await serveMod.startServer({ port: 0, host: '127.0.0.1', rootDir: PROJECT_ROOT });
      return {
        server: started.server,
        port: started.port,
        baseUrl: started.url || `http://127.0.0.1:${started.port}`,
        close: started.close,
      };
    }
    if (typeof serveMod.createServer === 'function') {
      const srv = serveMod.createServer(PROJECT_ROOT);
      return await new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
          const port = srv.address().port;
          resolve({
            server: srv,
            port,
            baseUrl: `http://127.0.0.1:${port}`,
            close: () => new Promise((r) => srv.close(() => r())),
          });
        });
      });
    }
  }

  const srv = http.createServer((req, res) => {
    const rawUrl = String(req.url || '/').split('?')[0];
    if (rawUrl.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const rel = rawUrl === '/' ? 'index.html' : rawUrl.replace(/^\/+/, '');
    const full = resolveProjectPath(rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': FALLBACK_MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(full));
  });

  return await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({
        server: srv,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(() => r())),
      });
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Launches Headless Chromium against `index.html`, connects via native WebSocket CDP,
 * executes `fn(browser)`, and guarantees cleanup of temporary user-data-dir and processes.
 */
export async function withHeadlessBrowser(fn, options = {}) {
  assert.ok(
    fileExists('index.html'),
    `[E2E Missing File] Expected /home/antigravity/index.html for Headless Chromium E2E test`
  );
  const serverInfo = await startStaticServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slotbound-e2e-'));
  let proc = null;
  let ws = null;

  const killChromiumGroup = () => {
    if (!proc) return;
    if (proc.pid) {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {}
    }
    try {
      if (!proc.killed) proc.kill('SIGKILL');
    } catch {}
  };

  const cleanupTmpSync = () => {
    killChromiumGroup();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
    } catch {}
  };
  process.once('exit', cleanupTmpSync);

  try {
    const targetUrl = `${serverInfo.baseUrl}${options.path || '/index.html'}`;
    proc = spawn(
      '/usr/bin/chromium',
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=${tmpDir}`,
        '--remote-debugging-port=0',
        targetUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
    );

    const wsEndpoint = await new Promise((resolve, reject) => {
      let stderrBuf = '';
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Chromium DevTools endpoint. stderr: ${stderrBuf}`));
      }, 10000);
      const onData = (chunk) => {
        stderrBuf += chunk.toString();
        const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      proc.stderr.on('data', onData);
      proc.stdout.on('data', onData);
      proc.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited prematurely with code ${code}: ${stderrBuf}`));
      });
    });

    const devtoolsUrl = new URL(wsEndpoint);
    const listUrl = `http://${devtoolsUrl.host}/json/list`;

    let pageWsUrl = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const res = await fetch(listUrl);
        const targets = await res.json();
        const pageTarget = targets.find(
          (t) => t.type === 'page' && t.webSocketDebuggerUrl
        );
        if (pageTarget) {
          pageWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await sleep(75);
    }
    assert.ok(pageWsUrl, 'Failed to discover Chromium page target via /json/list');

    ws = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 5000);
      ws.addEventListener('open', () => {
        clearTimeout(t);
        resolve();
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    let nextMsgId = 1;
    const pending = new Map();
    const consoleErrors = [];
    const pageErrors = [];

    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          pageErrors.push(
            msg.params?.exceptionDetails?.text || 'Runtime.exceptionThrown'
          );
        } else if (
          msg.method === 'Runtime.consoleAPICalled' &&
          msg.params?.type === 'error'
        ) {
          consoleErrors.push(
            (msg.params.args || []).map((a) => a.value || a.description || '').join(' ')
          );
        }
      } catch {}
    });

    const sendCDP = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextMsgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });

    await sendCDP('Runtime.enable');

    const evalInPage = async (expression) => {
      const wrapped = `(async () => { return (${expression}); })()`;
      const res = await sendCDP('Runtime.evaluate', {
        expression: wrapped,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res?.exceptionDetails) {
        const desc =
          res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text ||
          'Eval exception';
        throw new Error(`[CDP Eval Error] ${desc}`);
      }
      return res?.result?.value;
    };

    // Poll from Node side until document.readyState === 'complete' and bridge is ready
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const isReady = await evalInPage(
          `document.readyState === 'complete' && Boolean(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__)`
        );
        if (isReady) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(80);
    }
    assert.ok(
      ready,
      `Timed out waiting for index.html and window.__SLOTBOUND__ bridge in Headless Chromium. Page errors: ${pageErrors.join('; ')}`
    );

    const browser = {
      baseUrl: serverInfo.baseUrl,
      consoleErrors,
      pageErrors,
      eval: evalInPage,
      async hasTestId(testId) {
        return Boolean(
          await evalInPage(
            `Boolean(document.querySelector('[data-testid="${testId}"]'))`
          )
        );
      },
      async getTestIdText(testId) {
        return await evalInPage(
          `document.querySelector('[data-testid="${testId}"]')?.textContent ?? null`
        );
      },
      async clickTestId(testId) {
        return await evalInPage(`(() => {
          const el = document.querySelector('[data-testid="${testId}"]');
          if (!el) throw new Error('Missing element [data-testid="${testId}"]');
          el.click();
          return true;
        })()`);
      },
      async getBridgeState() {
        const raw = await evalInPage(
          `(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).getState()`
        );
        return normalizeGameState(raw);
      },
      async switchScheme(schemeId) {
        await evalInPage(
          `(window.__SLOTBOUND__ || window.__SLOTBOUND_TEST__).switchScheme(${JSON.stringify(schemeId)})`
        );
        return await browser.getBridgeState();
      },
    };

    return await fn(browser);
  } finally {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch {}
    killChromiumGroup();
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 500);
        proc.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    await sleep(40);
    cleanupTmpSync();
    process.removeListener('exit', cleanupTmpSync);
    try {
      await serverInfo.close();
    } catch {}
  }
}
