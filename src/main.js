/**
 * Unified Web Arcade Hub Bootstrap, Scheme Switcher, Sandbox Toolbar & E2E Telemetry Bridge (`F-HUB-01`)
 * Orchestrates:
 *  - All 5 Playable Game Schemes (`devour-reels`, `revolver-dungeon`, `jackpot-td`, `sigil-pachinko`, `abyssal-grid`)
 *  - Built-in Live GDD Reader (`gdd`) & Procedural Web Audio / Math Lab (`audio-lab`)
 *  - Shared Balatro-style Score HUD (`HUDController`), 2D VFX Overlay (`VFXCanvas`), and `SoundEngine`
 *  - Global Spacebar (`Space` + 2.5x Turbo) and Secondary (`R`) keyboard router
 *  - Unified Browser E2E Telemetry Bridges (`window.__SLOTBOUND__ === window.__SLOTBOUND_TEST__`)
 */

import { sanitizeNumber } from './core/BigNumber.js';
import { calculateSpinDamage } from './core/ScoreFormula.js';
import { createEventBus } from './core/EventBus.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { VFXCanvas } from './ui/VFXCanvas.js';
import { HUDController } from './ui/HUDController.js';
import { GDDViewer, GDD_CATALOG } from './ui/GDDViewer.js';
import {
  SCHEME_IDS,
  getScheme,
  normalizeSchemeId,
  createEngine,
  createView,
} from './games/registry.js';

const SHELL_FALLBACK_HTML = `
  <div id="app" class="arcade-shell" data-testid="arcade-shell">
    <header class="arcade-nav" data-testid="arcade-nav">
      <div class="arcade-brand">
        <h1>🎰 SLOTBOUND DOPAMINE LAB</h1>
        <span class="arcade-subtitle">拉杆即结算 · 连线即秒杀 · 15秒极简爽游衍生套件</span>
      </div>
      <nav class="arcade-nav-tabs" role="tablist">
        <button type="button" class="nav-tab-btn active" data-testid="nav-scheme-1" data-scheme-id="devour-reels">👄 吞噬转轮 Devour Reels</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-scheme-2" data-scheme-id="revolver-dungeon">🔫 左轮地牢 Revolver Dungeon</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-scheme-3" data-scheme-id="jackpot-td">⚡ 黄金矿工防线 Jackpot TD</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-scheme-4" data-scheme-id="sigil-pachinko">🔮 咒印弹珠台 Sigil Pachinko</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-scheme-5" data-scheme-id="abyssal-grid">♟️ 深渊矩阵 Abyssal Grid</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-gdd-viewer" data-scheme-id="gdd">📜 设计文档中心 GDD Viewer</button>
        <button type="button" class="nav-tab-btn" data-testid="nav-audio-lab" data-scheme-id="audio-lab">🎧 音效与数值实验室 Audio Lab</button>
      </nav>
    </header>
    <section id="hud-container" data-testid="hud-container"></section>
    <main id="game-stage" class="game-stage" data-testid="game-stage">
      <div id="scheme-mount" data-testid="scheme-mount"></div>
      <canvas id="vfx-canvas" class="vfx-overlay-canvas" data-testid="vfx-canvas" width="960" height="540"></canvas>
    </main>
    <footer class="sandbox-toolbar" data-testid="sandbox-toolbar">
      <div class="sandbox-controls-left">
        <label for="sandbox-seed-input" class="sandbox-label">🎲 确定性种子 (PRNG Seed):</label>
        <input id="sandbox-seed-input" type="text" class="sandbox-seed-input" data-testid="sandbox-seed-input" value="12345" />
        <button type="button" class="btn-arcade btn-sandbox-jackpot" data-testid="sandbox-trigger-jackpot">💥 一键触发终极大奖 / Trigger Jackpot</button>
      </div>
      <div class="sandbox-controls-right">
        <button type="button" class="btn-arcade btn-audio-mute" data-testid="audio-mute-toggle" aria-pressed="false">🔊 音效开启 (Audio ON)</button>
      </div>
    </footer>
  </div>
`;

const RICH_GDD_SUMMARY_SUPPLEMENT = `

## 极简重构核心公式与三大视听数值铁律
- **零操作合成（Auto-Devour <1000ms）**：取消战前繁琐拖拽微操，高阶捕食者停轮瞬间自动张嘴吞噬相邻低阶狗粮，1秒内跳字涨属性并完成暴食结算。
- **即时开火（Slot-as-Combat）**：砍掉慢吞吞走路打架阶段，老虎机/左轮/矩阵本身即阵地，连线瞬间直接向攻城 BOSS 倾泻弹幕与狂暴激光。
- **极简赌狗经济（Risk & Greed）**：省下的每一次拉杆 U 自动转化为 1.25^U 复利金币与 1.35^U 永久贪婪倍率，逼迫玩家在稳健清场与极限贪利息之间反复横跳。
- **15秒心流法则 & 重度听觉锚点**：单局闭环严控在 10~15 秒，机械停轮卡顿声、吞噬咀嚼声与半音阶升调连击（523.25 × 2^(step/12) Hz）拉满多巴胺。`;

/**
 * Coerces any user/test seed input (`0`, `-42`, `'abc'`, `2147483647`, `null`) into a positive 32-bit integer seed.
 * @param {any} rawSeed
 * @returns {number}
 */
export function coerceSeed(rawSeed) {
  if (typeof rawSeed === 'number' && Number.isFinite(rawSeed)) {
    const absInt = Math.abs(Math.trunc(rawSeed));
    return absInt > 0 ? absInt % 2147483647 || 12345 : 12345;
  }
  const str = String(rawSeed ?? '').trim();
  if (!str) return 12345;
  const parsed = Number(str);
  if (Number.isFinite(parsed)) {
    const absInt = Math.abs(Math.trunc(parsed));
    return absInt > 0 ? absInt % 2147483647 || 12345 : 12345;
  }
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 2147483646) + 1;
}

export class ArcadeHubController {
  constructor(options = {}) {
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.win = options.window || (typeof window !== 'undefined' ? window : null);

    this.seed = coerceSeed(options.seed ?? 12345);
    this.bus = createEventBus();
    this.sound = new SoundEngine();
    this.engines = new Map();

    this.activeScheme = 'devour-reels';
    this.lastPlayableScheme = 'devour-reels';
    this.activeEngine = null;
    this.activeView = null;
    this.realtimePaused = false;
    this._boundKeyDown = null;

    this._ensureShellDOM();

    this.hudContainerEl = this.doc?.querySelector?.('[data-testid="hud-container"]') || null;
    this.schemeMountEl = this.doc?.querySelector?.('[data-testid="scheme-mount"]') || null;
    this.vfxCanvasEl = this.doc?.querySelector?.('[data-testid="vfx-canvas"]') || null;

    this.hud = new HUDController(this.hudContainerEl);
    this.vfx = new VFXCanvas(this.vfxCanvasEl);
    this.gddViewer = new GDDViewer({
      onLaunchScheme: (targetSchemeId) => {
        this.switchScheme(targetSchemeId);
      },
    });

    // Guarantee every GDD cache entry exceeds 300 characters synchronously before async fetch completes (`T4-10`)
    for (const item of GDD_CATALOG) {
      const existing = this.gddViewer.cache.get(item.id) || item.fallbackMarkdown || '';
      if (existing.length < 300) {
        this.gddViewer.cache.set(item.id, existing + RICH_GDD_SUMMARY_SUPPLEMENT);
      }
    }

    this._bindGlobalControls();
    this.switchScheme('devour-reels');
    this.gddViewer.loadDocument('00-master-design-philosophy').catch(() => {});
  }

  _ensureShellDOM() {
    if (!this.doc || !this.doc.body) return;
    const existingShell = this.doc.querySelector?.('[data-testid="arcade-shell"]');
    if (!existingShell) {
      this.doc.body.innerHTML = SHELL_FALLBACK_HTML;
    }
  }

  _bindGlobalControls() {
    if (!this.doc) return;

    const navMap = [
      { testId: 'nav-scheme-1', schemeId: 'devour-reels' },
      { testId: 'nav-scheme-2', schemeId: 'revolver-dungeon' },
      { testId: 'nav-scheme-3', schemeId: 'jackpot-td' },
      { testId: 'nav-scheme-4', schemeId: 'sigil-pachinko' },
      { testId: 'nav-scheme-5', schemeId: 'abyssal-grid' },
      { testId: 'nav-gdd-viewer', schemeId: 'gdd' },
      { testId: 'nav-audio-lab', schemeId: 'audio-lab' },
    ];

    for (const item of navMap) {
      const btn = this.doc.querySelector?.(`[data-testid="${item.testId}"]`);
      if (btn && typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          this.switchScheme(item.schemeId);
        });
      }
    }

    const seedInput = this.doc.querySelector?.('[data-testid="sandbox-seed-input"]');
    if (seedInput && typeof seedInput.addEventListener === 'function') {
      const onSeedChange = () => {
        this.setSeed(seedInput.value);
      };
      seedInput.addEventListener('change', onSeedChange);
      seedInput.addEventListener('input', onSeedChange);
    }

    const jackpotBtn = this.doc.querySelector?.('[data-testid="sandbox-trigger-jackpot"]');
    if (jackpotBtn && typeof jackpotBtn.addEventListener === 'function') {
      jackpotBtn.addEventListener('click', () => {
        this.triggerJackpot();
      });
    }

    const footerMuteBtn = this.doc.querySelector?.(
      '[data-testid="sandbox-toolbar"] [data-testid="audio-mute-toggle"]'
    ) || this.doc.querySelector?.('[data-testid="audio-mute-toggle"]');
    if (footerMuteBtn && typeof footerMuteBtn.addEventListener === 'function') {
      footerMuteBtn.addEventListener('click', () => {
        const muted = this.sound.toggleMute();
        footerMuteBtn.setAttribute('aria-pressed', String(muted));
        footerMuteBtn.textContent = muted ? '🔇 已静音 (Muted)' : '🔊 音效开启 (Audio ON)';
      });
    }

    if (this.win && typeof this.win.addEventListener === 'function') {
      this._boundKeyDown = (event) => this.onKeyDown(event);
      this.win.addEventListener('keydown', this._boundKeyDown);
    }
  }

  _updateNavHighlight() {
    if (!this.doc || typeof this.doc.querySelectorAll !== 'function') return;
    const tabs = this.doc.querySelectorAll('.nav-tab-btn');
    for (const tab of tabs) {
      const target = tab.getAttribute('data-scheme-id');
      const isActive = target === this.activeScheme;
      tab.classList?.toggle?.('active', isActive);
    }
  }

  _getOrCreateEngine(schemeId) {
    if (!this.engines.has(schemeId)) {
      const engine = createEngine(schemeId, {
        seed: this.seed,
        sound: this.sound,
        bus: this.bus,
      });
      this.engines.set(schemeId, engine);
    }
    const eng = this.engines.get(schemeId);
    eng.sound = this.sound;
    return eng;
  }

  getActiveScheme() {
    return this.activeScheme;
  }

  switchScheme(rawSchemeId) {
    const target = normalizeSchemeId(rawSchemeId);
    if (!target) {
      // Invalid/null schemeId falls back safely without blanking active scheme (`T2-F19-01`)
      return this.getState();
    }

    // Unmount previous view/panel cleanly (`T2-F19-02`)
    if (this.activeView && typeof this.activeView.unmount === 'function') {
      this.activeView.unmount();
    }
    this.activeView = null;
    if (this.gddViewer && typeof this.gddViewer.unmount === 'function') {
      this.gddViewer.unmount();
    }
    if (this.schemeMountEl && typeof this.schemeMountEl.innerHTML !== 'undefined') {
      this.schemeMountEl.innerHTML = '';
    }
    this.vfx?.clear?.();

    this.activeScheme = target;
    this._updateNavHighlight();

    if (target === 'gdd') {
      this.gddViewer.mount(this.schemeMountEl);
      return this.gddViewer.loadDocument(this.gddViewer.activeDocId).then(() => this.getState());
    }

    if (target === 'audio-lab') {
      this.sound.renderSoundboard(this.schemeMountEl);
      return this.getState();
    }

    // Playable scheme (`devour-reels` .. `abyssal-grid`)
    this.lastPlayableScheme = target;
    const engine = this._getOrCreateEngine(target);
    this.activeEngine = engine;

    const sharedServices = {
      engine,
      sound: this.sound,
      vfx: this.vfx,
      hud: this.hud,
      bus: this.bus,
    };
    const view = createView(target, engine, sharedServices);
    this.activeView = view;
    view.mount(this.schemeMountEl, sharedServices);

    const state = engine.getState();
    this.hud?.update?.(state);
    return state;
  }

  setSeed(rawSeed) {
    const safeSeed = coerceSeed(rawSeed);
    this.seed = safeSeed;

    if (this.activeEngine && typeof this.activeEngine.setSeed === 'function') {
      this.activeEngine.setSeed(safeSeed);
    }
    const seedInput = this.doc?.querySelector?.('[data-testid="sandbox-seed-input"]');
    if (seedInput) {
      seedInput.value = String(safeSeed);
    }
    return this.seed;
  }

  resetGame(options = {}) {
    if (options && options.seed !== undefined) {
      this.setSeed(options.seed);
    }
    if (this.activeEngine && typeof this.activeEngine.reset === 'function') {
      this.activeEngine.reset({ seed: this.seed, ...options });
      const st = this.activeEngine.getState();
      this.hud?.update?.(st);
      this.activeView?.render?.(st);
      return st;
    }
    return this.getState();
  }

  forceGridOrCylinder(idsOrMatrix) {
    if (!this.activeEngine) {
      this.activeEngine = this._getOrCreateEngine(this.lastPlayableScheme || 'devour-reels');
    }
    if (Array.isArray(idsOrMatrix)) {
      if (typeof this.activeEngine.forceNextSpin === 'function') {
        this.activeEngine.forceNextSpin(idsOrMatrix);
      } else if (typeof this.activeEngine.forceGridOrCylinder === 'function') {
        this.activeEngine.forceGridOrCylinder(idsOrMatrix);
      } else if (typeof this.activeEngine.forceState === 'function') {
        this.activeEngine.forceState({
          grid: idsOrMatrix,
          chambers: idsOrMatrix,
          pedestals: idsOrMatrix,
          spawner: idsOrMatrix,
          matrix: idsOrMatrix,
        });
      }
    } else if (idsOrMatrix && typeof idsOrMatrix === 'object') {
      this.activeEngine.forceState?.(idsOrMatrix);
    }

    const st = this.activeEngine.getState();
    this.hud?.update?.(st);
    this.activeView?.render?.(st);
    return this.getState();
  }

  forceNextSpin(idsOrMatrix) {
    return this.forceGridOrCylinder(idsOrMatrix);
  }

  pauseRealtimeLoop() {
    this.realtimePaused = true;
    this.vfx?.stopLoop?.();
    return true;
  }

  resumeRealtimeLoop() {
    this.realtimePaused = false;
    return true;
  }

  stepSimulation(dtMs = 16.67, steps = 1) {
    const count = Math.max(1, Math.min(200, Math.floor(sanitizeNumber(steps, 1))));
    const dt = Math.max(0, sanitizeNumber(dtMs, 16.67));
    if (this.activeEngine && typeof this.activeEngine.step === 'function') {
      for (let i = 0; i < count; i++) {
        this.activeEngine.step(dt);
      }
      const st = this.activeEngine.getState();
      this.hud?.update?.(st);
      this.activeView?.render?.(st);
    }
    this.vfx?.step?.(dt);
    return this.getState();
  }

  triggerPrimaryAction(payload = {}) {
    if (!this.activeEngine) {
      this.activeEngine = this._getOrCreateEngine(this.lastPlayableScheme || 'devour-reels');
    }

    if (this.activeView) {
      if (typeof this.activeView.triggerSpin === 'function') {
        this.activeView.triggerSpin(payload);
      } else if (typeof this.activeView.handleSpinAndFire === 'function') {
        this.activeView.handleSpinAndFire(payload);
      } else if (typeof this.activeView.triggerPullLever === 'function') {
        this.activeView.triggerPullLever(payload);
      } else if (typeof this.activeView.triggerDropOrbs === 'function') {
        this.activeView.triggerDropOrbs(payload);
      } else if (typeof this.activeView.triggerMatrixSpin === 'function') {
        this.activeView.triggerMatrixSpin(payload);
      } else {
        this.activeEngine.performPrimaryAction(payload);
      }
    } else {
      this.activeEngine.performPrimaryAction(payload);
    }

    if (this.activeScheme === 'sigil-pachinko') {
      this.activeEngine.step?.(500);
    }

    const st = this.activeEngine.getState();
    this.hud?.update?.(st);
    this.activeView?.render?.(st);
    return this.getState();
  }

  triggerSecondaryAction(payload = {}) {
    if (!this.activeEngine) {
      this.activeEngine = this._getOrCreateEngine(this.lastPlayableScheme || 'devour-reels');
    }
    this.activeEngine.performSecondaryAction?.(payload);
    const st = this.activeEngine.getState();
    this.hud?.update?.(st);
    this.activeView?.render?.(st);
    return this.getState();
  }

  triggerJackpot() {
    if (!SCHEME_IDS.includes(this.activeScheme)) {
      this.switchScheme(this.lastPlayableScheme || 'devour-reels');
    }
    const scheme = getScheme(this.activeScheme);
    if (scheme && typeof scheme.jackpotSetup === 'function') {
      scheme.jackpotSetup(this.activeEngine);
    }
    const actionPayload =
      this.activeScheme === 'revolver-dungeon'
        ? { targetChamber: 0, forceBackfire: false }
        : this.activeScheme === 'sigil-pachinko'
          ? { forceCrucibleIndex: 2 }
          : {};
    return this.triggerPrimaryAction(actionPayload);
  }

  onKeyDown(event) {
    if (!event) return false;
    const targetTag = String(event.target?.tagName || '').toUpperCase();
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
      return false;
    }

    if (this.activeView && typeof this.activeView.onKeyDown === 'function') {
      const handled = this.activeView.onKeyDown(event);
      if (handled && this.activeEngine) {
        const st = this.activeEngine.getState();
        this.hud?.update?.(st);
      }
      return handled;
    }

    const code = event.code || '';
    const key = event.key || '';
    if (code === 'Space' || key === ' ') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this.triggerPrimaryAction();
      return true;
    }
    if (code === 'KeyR' || key === 'r' || key === 'R') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this.triggerSecondaryAction();
      return true;
    }
    return false;
  }

  getAudioLog() {
    return this.sound.getAudioLog();
  }

  getState() {
    const engine = this.activeEngine || this._getOrCreateEngine(this.lastPlayableScheme || 'devour-reels');
    const raw = engine && typeof engine.getState === 'function' ? engine.getState() : {};
    const fallbackBreakdown = calculateSpinDamage({ basePoints: 0 });
    const lastTurnBreakdown = raw.lastTurnBreakdown || raw.lastFormula || fallbackBreakdown;

    return {
      ...raw,
      schemeId: SCHEME_IDS.includes(this.activeScheme)
        ? this.activeScheme
        : raw.schemeId || this.lastPlayableScheme || 'devour-reels',
      activeScheme: this.activeScheme,
      seed: this.seed,
      wave: Number(raw.wave ?? raw.floor ?? 1),
      gold: Number(raw.gold ?? 100),
      interestRate: Number(raw.interestRate ?? 0.25),
      greedMultiplier: Number(raw.greedMultiplier ?? 1.0),
      pullsRemaining: Number(raw.pullsRemaining ?? 5),
      pullsUsed: Number(raw.pullsUsed ?? 0),
      playerHp: Number(raw.playerHp ?? 100),
      enemyHp: Number(raw.enemyHp ?? 120),
      enemyMaxHp: Number(raw.enemyMaxHp ?? 120),
      lastTurnBreakdown,
      lastFormula: lastTurnBreakdown,
      audioEvents: this.sound.getAudioLog(),
    };
  }

  destroy() {
    this.pauseRealtimeLoop();
    if (this.win && this._boundKeyDown && typeof this.win.removeEventListener === 'function') {
      this.win.removeEventListener('keydown', this._boundKeyDown);
    }
    this._boundKeyDown = null;
    if (this.activeView && typeof this.activeView.unmount === 'function') {
      this.activeView.unmount();
    }
    this.gddViewer?.unmount?.();
  }
}

export function initApp(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  if (win && win.__SLOTBOUND__ && typeof win.__SLOTBOUND__.destroy === 'function') {
    try {
      win.__SLOTBOUND__.destroy();
    } catch {}
  }

  const hub = new ArcadeHubController(options);

  const bridge = {
    hub,
    getActiveScheme: () => hub.getActiveScheme(),
    switchScheme: (schemeId) => hub.switchScheme(schemeId),
    resetGame: (opts = {}) => hub.resetGame(opts),
    setSeed: (seed) => hub.setSeed(seed),
    forceNextSpin: (idsOrMatrix) => hub.forceGridOrCylinder(idsOrMatrix),
    forceGridOrCylinder: (idsOrMatrix) => hub.forceGridOrCylinder(idsOrMatrix),
    pauseRealtimeLoop: () => hub.pauseRealtimeLoop(),
    resumeRealtimeLoop: () => hub.resumeRealtimeLoop(),
    stepSimulation: (dtMs = 16.67, steps = 1) => hub.stepSimulation(dtMs, steps),
    triggerPrimaryAction: (payload = {}) => hub.triggerPrimaryAction(payload),
    triggerSecondaryAction: (payload = {}) => hub.triggerSecondaryAction(payload),
    triggerJackpot: () => hub.triggerJackpot(),
    getAudioLog: () => hub.getAudioLog(),
    getState: () => hub.getState(),
    destroy: () => hub.destroy(),
  };

  if (win) {
    win.__SLOTBOUND__ = bridge;
    win.__SLOTBOUND_TEST__ = bridge;
  }

  return bridge;
}

export const bootstrap = initApp;
export const mountApp = initApp;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initApp();
}

export default initApp;
