# E2E Test Infrastructure & Specification (`TEST_INFRA.md`)

## 1. Overview & Philosophy

This document specifies the **Opaque-Box Requirement-Driven End-to-End (E2E) Test Suite** for **Slotbound Minimalist Dopamine Lab (《Slotbound》极简爽游衍生套件)**.

All E2E tests are designed strictly from `/home/antigravity/.agents/teamwork/ORIGINAL_REQUEST.md` and `/home/antigravity/PROJECT.md` (Interface Contracts & Feature Inventory), without depending on internal private implementation details. The suite verifies both:
1. **Deterministic Pure Engine & Contract Execution (Node ESM)**: Exercising `docs/gdd/*.md`, `src/core/*`, `src/audio/SoundEngine.js`, `src/ui/*`, `src/games/*/*Engine.js`, and `src/games/registry.js` against all mathematical, mechanical, timing, and state-transition requirements.
2. **Full Browser & DOM Integration (Headless Chromium)**: Booting the static server (`scripts/serve.js` or fallback local static server on an ephemeral port) and driving `/usr/bin/chromium --headless --no-sandbox --disable-gpu` to verify `index.html`, all required `data-testid` selectors, `window.__SLOTBOUND__` / `window.__SLOTBOUND_TEST__`, and `window.__AUDIO_LOG__`.

---

## 2. Test Runner & Progressive Tier Architecture

- **Master Runner**: `/home/antigravity/scripts/verify-e2e.js`
  - Run all tiers (Tiers 1–6 — `285` total cases):
    ```bash
    node scripts/verify-e2e.js
    ```
  - Run Round 1 baseline regression gate (Tiers 1–5 — `250` cases):
    ```bash
    node scripts/verify-e2e.js --tier=1 --tier=2 --tier=3 --tier=4 --tier=5
    ```
  - Run individual progressive tiers:
    ```bash
    node scripts/verify-e2e.js --tier=1
    node scripts/verify-e2e.js --tier=2
    node scripts/verify-e2e.js --tier=3
    node scripts/verify-e2e.js --tier=4
    node scripts/verify-e2e.js --tier=5
    node scripts/verify-e2e.js --tier=6
    ```
  - Run directly via Node's built-in test runner:
    ```bash
    node --test tests/e2e/tier1-feature-coverage.test.js
    node --test tests/e2e/tier2-boundary-corner.test.js
    node --test tests/e2e/tier3-cross-feature.test.js
    node --test tests/e2e/tier4-real-world-scenarios.test.js
    node --test tests/e2e/tier5-adversarial-hardening.test.js
    node --test tests/e2e/tier6-visual-gameplay-polish.test.js
    ```

### Test File Layout
- `/home/antigravity/tests/e2e/helpers/e2e-harness.js`: Shared opaque-box ESM loader (`loadProjectModule` with `AssertionError`-safe dynamic import wrapping, `requireExport`, `readProjectText`, `fileExists`), contract normalization adapters (`normalizeDamageBreakdown`, `normalizeGameState` with `ownedRelics` / `relics` / `pendingRelicDraft` aliases, `forceEngineState`, `createPRNGInstance`, `invokeCalculateSpinDamage`, `invokeSettleWaveClear`, `createEventBusInstance`, `createFlowTrackerInstance`, `createSoundEngineInstance`), deterministic mock DOM/Canvas2D/WebAudio environment (`installMockBrowserEnv` with `navigator.userAgent = 'SlotboundE2EMockBrowser'`, `rAF` timer tracking/cleanup, and `MockCanvas2DContext.getImageData`), and Headless Chromium WebSocket CDP runner (`startStaticServer`, `createHeadlessBrowserSession`, `withHeadlessBrowser` with `UNIX_PATH_MAX < 108`-safe isolated `TMPDIR` cleanup preventing `org.chromium.Chromium.*` leaks on `SIGKILL`, pre-boot HTTP `404` / `/favicon.ico` capture, CDP `Runtime` / `Network` / `Page` domains, and dynamic `setViewport`).
- `/home/antigravity/tests/e2e/tier1-feature-coverage.test.js`: **Tier 1 — Feature Coverage** (`5` happy-path tests per feature × 19 R1 features = **`95` tests**).
- `/home/antigravity/tests/e2e/tier2-boundary-corner.test.js`: **Tier 2 — Boundary & Corner Cases** (`5` boundary/edge/invalid-input tests per feature × 19 R1 features = **`95` tests**).
- `/home/antigravity/tests/e2e/tier3-cross-feature.test.js`: **Tier 3 — Cross-Feature Combinations** (**`20` pairwise interaction tests** across all 19 R1 features).
- `/home/antigravity/tests/e2e/tier4-real-world-scenarios.test.js`: **Tier 4 — Real-World Application Scenarios** (**`10` multi-wave / multi-scheme end-user gameplay & Headless Chromium E2E scenarios**).
- `/home/antigravity/tests/e2e/tier5-adversarial-hardening.test.js`: **Tier 5 — White-Box Adversarial Hardening** (**`30` white-box adversarial & Headless Chromium E2E cases** `T5-01`..`T5-30`).
- `/home/antigravity/tests/e2e/tier6-visual-gameplay-polish.test.js`: **Tier 6 — Round 2 Visual, Choreography, Spatial Geometry & Live Gameplay Polish** (**`35` live Headless Chromium & Node contract cases** `T6-01`..`T6-35`).

---

## 3. Feature-to-Tier Mapping Matrix (All 19 Features — 250 Total Cases)

| # | Feature ID | Feature Name | Tier 1 Cases | Tier 2 Cases | Tier 3 Pairwise | Tier 4 Scenarios | Tier 5 Adversarial |
|---|------------|--------------|--------------|--------------|-----------------|------------------|--------------------|
| 1 | `F-GDD-01` | Master & Iron Laws GDD Suite | `T1-F01-01..05` (5) | `T2-F01-01..05` (5) | `T3-01`, `T3-19` | `T4-01`, `T4-10` | `T5-07`, `T5-30` |
| 2 | `F-CORE-01` | Deterministic Seeded PRNG | `T1-F02-01..05` (5) | `T2-F02-01..05` (5) | `T3-02`, `T3-07`, `T3-10` | `T4-02`..`T4-09` | `T5-01`, `T5-30` |
| 3 | `F-CORE-02` | Exponential Number & Balatro Scoring Engine | `T1-F03-01..05` (5) | `T2-F03-01..05` (5) | `T3-02`, `T3-03`, `T3-06`, `T3-13` | `T4-02`..`T4-09` | `T5-02` |
| 4 | `F-CORE-03` | Risk & Greed Economy Engine | `T1-F04-01..05` (5) | `T2-F04-01..05` (5) | `T3-03`, `T3-04`, `T3-09`, `T3-15` | `T4-02`, `T4-04`, `T4-06`, `T4-08` | `T5-03`, `T5-10`, `T5-19` |
| 5 | `F-CORE-04` | 15-Second Flow & EventBus | `T1-F05-01..05` (5) | `T2-F05-01..05` (5) | `T3-04`, `T3-05`, `T3-08`, `T3-14` | `T4-02`..`T4-10` | `T5-04`, `T5-26` |
| 6 | `F-AUDIO-01` | Procedural Web Audio Synthesizer | `T1-F06-01..05` (5) | `T2-F06-01..05` (5) | `T3-05`, `T3-11`, `T3-16` | `T4-01`, `T4-02`, `T4-05`, `T4-09`, `T4-10` | `T5-05` |
| 7 | `F-UI-01` | Shared 2D VFX Canvas, Score HUD & GDD Reader | `T1-F07-01..05` (5) | `T2-F07-01..05` (5) | `T3-01`, `T3-06`, `T3-17`, `T3-20` | `T4-01`, `T4-09`, `T4-10` | `T5-06`, `T5-07`, `T5-27` |
| 8 | `F-S1-01` | Scheme 1 Core: 3×3 Grid & Central Abyssal Maw | `T1-F08-01..05` (5) | `T2-F08-01..05` (5) | `T3-07`, `T3-08` | `T4-02`, `T4-03`, `T4-09` | `T5-08`, `T5-09`, `T5-11` |
| 9 | `F-S1-02` | Scheme 1 Auto-Devour & 5 Stomach Chain Reactions | `T1-F09-01..05` (5) | `T2-F09-01..05` (5) | `T3-08`, `T3-09` | `T4-02`, `T4-03` | `T5-08`, `T5-09`, `T5-10` |
| 10 | `F-S1-03` | Scheme 1 Indigestion Meter, Probability Modder & 8 Bosses | `T1-F10-01..05` (5) | `T2-F10-01..05` (5) | `T3-09`, `T3-10` | `T4-02`, `T4-03` | `T5-10`, `T5-11` |
| 11 | `F-S2-01` | Scheme 2 Core: 6-Chamber Revolver & 2-Button Loop | `T1-F11-01..05` (5) | `T2-F11-01..05` (5) | `T3-11`, `T3-12` | `T4-04`, `T4-05`, `T4-09` | `T5-14` |
| 12 | `F-S2-02` | Scheme 2 Bullet Roster, Parasite Devour & Full Cylinder Dump | `T1-F12-01..05` (5) | `T2-F12-01..05` (5) | `T3-11`, `T3-12` | `T4-04`, `T4-05` | `T5-12`, `T5-13`, `T5-14` |
| 13 | `F-S2-03` | Scheme 2 Russian Roulette Demon Bullet & Grit | `T1-F13-01..05` (5) | `T2-F13-01..05` (5) | `T3-12`, `T3-13` | `T4-04`, `T4-05` | `T5-13`, `T5-15` |
| 14 | `F-S3-01` | Scheme 3 Core: 1×5 Slot Turret Wall & Real-Time March | `T1-F14-01..05` (5) | `T2-F14-01..05` (5) | `T3-14`, `T3-15` | `T4-06`, `T4-07`, `T4-09` | `T5-18`, `T5-26`, `T5-28` |
| 15 | `F-S3-02` | Scheme 3 Yahtzee Hand Evaluator & Clutch Ultimates | `T1-F15-01..05` (5) | `T2-F15-01..05` (5) | `T3-15`, `T3-16` | `T4-06`, `T4-07` | `T5-16`, `T5-17`, `T5-18`, `T5-28` |
| 16 | `F-S3-03` | Scheme 3 Real-Time Greed Interest & Red-Zone Adrenaline | `T1-F16-01..05` (5) | `T2-F16-01..05` (5) | `T3-15`, `T3-16` | `T4-06`, `T4-07` | `T5-19`, `T5-28` |
| 17 | `F-S4-01` | Scheme 4 Exploration: 《咒印弹珠台》(Sigil Pachinko) | `T1-F17-01..05` (5) | `T2-F17-01..05` (5) | `T3-17`, `T3-18` | `T4-08`, `T4-09` | `T5-20`, `T5-21`, `T5-26`, `T5-29` |
| 18 | `F-S5-01` | Scheme 5 Exploration: 《深渊矩阵》(Abyssal Grid) | `T1-F18-01..05` (5) | `T2-F18-01..05` (5) | `T3-18`, `T3-19` | `T4-08`, `T4-09` | `T5-22`, `T5-23`, `T5-26`, `T5-29` |
| 19 | `F-HUB-01` | Unified Arcade Hub, Live GDD Viewer, Audio Lab & Test Bridge | `T1-F19-01..05` (5) | `T2-F19-01..05` (5) | `T3-19`, `T3-20` | `T4-01`, `T4-09`, `T4-10` | `T5-24`, `T5-25`, `T5-27`, `T5-30` |
| **Total (R1)** | **19 R1 Features** | | **95 Cases** | **95 Cases** | **20 Cases** | **10 Cases** | **30 Cases (250 R1)** |

### Round 2 Feature-to-Tier Mapping Matrix (`F-R2-01` .. `F-R2-08` — 35 Tier 6 Cases, 285 Total E2E Cases)

| # | Feature ID | Round 2 Feature Name | Milestone | Tier 6 Verification Cases |Regression Guard in Tiers 1–5 |
|---|------------|----------------------|-----------|---------------------------|------------------------------|
| 20 | `F-R2-01` | Obsidian, Brushed Brass & Crimson Felt `100vh` Design System & `SpriteForge` SVG Art | M5 | `T6-01`, `T6-02`, `T6-03`, `T6-04`, `T6-05`, `T6-06`, `T6-07`, `T6-08`, `T6-09`, `T6-34` | `T1-F07-*`, `T4-09`, `T5-06`, `T5-30` |
| 21 | `F-R2-02` | HiDPI `VFXCanvas`, 5-Factor `HUDController`, `RelicDraftBanner` & Master-Compressed `SoundEngine` | M5 | `T6-09`, `T6-10`, `T6-11`, `T6-12`, `T6-13`, `T6-29`, `T6-30`, `T6-31`, `T6-32`, `T6-33`, `T6-35` | `T1-F06-*`, `T1-F07-*`, `T5-05`, `T5-06` |
| 22 | `F-R2-03` | Scheme 1 (`devour-reels`) R2 Visual & Gameplay Overhaul | M6 | `T6-01..03`, `T6-08`, `T6-09`, `T6-18`, `T6-23`, `T6-24`, `T6-29..33` | `T1-F08..10`, `T2-F08..10`, `T4-02..03`, `T5-08..11` |
| 23 | `F-R2-04` | Scheme 2 (`revolver-dungeon`) R2 Visual & Gameplay Overhaul | M6 | `T6-01..03`, `T6-08`, `T6-14`, `T6-25`, `T6-29`, `T6-31`, `T6-33` | `T1-F11..13`, `T2-F11..13`, `T4-04..05`, `T5-12..15` |
| 24 | `F-R2-05` | Scheme 3 (`jackpot-td`) R2 Real-Time Loop, Visual Lane & Tactical Hold Overhaul | M7 | `T6-01..03`, `T6-08`, `T6-15`, `T6-19`, `T6-20`, `T6-21`, `T6-22`, `T6-29`, `T6-31`, `T6-33` | `T1-F14..16`, `T2-F14..16`, `T4-06..07`, `T5-16..19`, `T5-28` |
| 25 | `F-R2-06` | Scheme 4 (`sigil-pachinko`) & Scheme 5 (`abyssal-grid`) R2 Physics, Grid & Tactical Overhaul | M7 | `T6-01..03`, `T6-08`, `T6-16`, `T6-17`, `T6-26`, `T6-27`, `T6-28`, `T6-29`, `T6-31` | `T1-F17..18`, `T2-F17..18`, `T4-08`, `T5-20..23`, `T5-29` |
| 26 | `F-R2-07` | Unified 60fps Browser `requestAnimationFrame` Runtime (`ArcadeHubController`) | M7 | `T6-10`, `T6-19`, `T6-34` | `T1-F19-*`, `T2-F19-*`, `T4-09..10`, `T5-25`, `T5-28..30` |
| 27 | `F-R2-08` | Tier 6 Live Browser Visual/Gameplay E2E Suite & GitHub Pages Deployment Readiness | M8 | `T6-01` .. `T6-35` (All 35 Cases) | Full 6-Tier Suite (`285 / 285` Cases) |

---

## 4. Complete Test Case ID Catalog (`285 Cases` Across Tiers 1–6)

### 4.1 Tier 1 — Feature Coverage (`tests/e2e/tier1-feature-coverage.test.js` — `95 Cases`)
- **`F-GDD-01` (`T1-F01-01..05`)**:
  - `T1-F01-01`: All 6 GDD files (`00`..`05`) and `README.md` exist with substantial structured Markdown content (`>= 800` bytes).
  - `T1-F01-02`: `00-master-design-philosophy.md` covers Slotbound's core contradiction, 3 Minimalist Formulas (`Auto-Devour`, `Slot-as-Combat`, `Risk & Greed`), and directory layout.
  - `T1-F01-03`: `01-iron-laws-math-and-audio.md` specifies the 15-Second Flow Rule, Exponential Formula, and Web Audio 12-TET semitone synth (`523.25 Hz`).
  - `T1-F01-04`: Dedicated GDDs (`02`, `03`, `04`) cover Scheme 1 (`吞噬转轮`), Scheme 2 (`左轮地牢`), and Scheme 3 (`黄金矿工防线`) mechanics.
  - `T1-F01-05`: `05-explorations-pachinko-grid.md` and `README.md` index Scheme 4 (`咒印弹珠台`) and Scheme 5 (`深渊矩阵`).
- **`F-CORE-01` (`T1-F02-01..05`)**:
  - `T1-F02-01`: Identical seeds produce 100% identical `next()` sequences in `[0, 1)`.
  - `T1-F02-02`: `nextInt(0, 5)` covers inclusive integer bounds uniformly.
  - `T1-F02-03`: `pickWeighted(items)` respects relative weights deterministically.
  - `T1-F02-04`: `shuffle(arr)` produces deterministic permutation conserving all elements.
  - `T1-F02-05`: `getState()` and `setSeed(seed)` inspect and restore PRNG state.
- **`F-CORE-02` (`T1-F03-01..05`)**:
  - `T1-F03-01`: `formatBigNumber` formats `K`, `M`, `B`, and `T` suffixes accurately.
  - `T1-F03-02`: `formatChineseNumber` formats `万` and `亿` suffixes accurately.
  - `T1-F03-03`: `calculateSpinDamage` computes exact Balatro-style multiplicative formula with explicit multipliers.
  - `T1-F03-04`: `calculateSpinDamage` derives `devourStacksMultiplier` from `devourStacks` when `null`.
  - `T1-F03-05`: `calculateSpinDamage` scales from Wave 1 (`~10^2`) to Wave 8 (`>10^8`) with `intensityTier 0..4`.
- **`F-CORE-03` (`T1-F04-01..05`)**:
  - `T1-F04-01`: `EconomyEngine` initializes 5-pull wave countdown and tracks pull consumption.
  - `T1-F04-02`: `settleWaveClear` computes exact compound interest gold for `U = 2` unused pulls (`120` interest gold).
  - `T1-F04-03`: `settleWaveClear` scales permanent `greedMultiplier` by $1.35^U$.
  - `T1-F04-04`: Monotonic Greed reward escalation (`U = 4` beats `U = 1`).
  - `T1-F04-05`: Post-wave 3-pick Relic/Mutation drafting offers 3 distinct choices and applies selection.
- **`F-CORE-04` (`T1-F05-01..05`)**:
  - `T1-F05-01`: `EventBus` delivers payloads synchronously to multiple subscribers in registration order.
  - `T1-F05-02`: `EventBus` supports unsubscribe (`off` / disposer) and records events in inspectable ring buffer.
  - `T1-F05-03`: `FlowTracker` validates sub-second (`<1000ms`) Auto-Devour settlement SLA.
  - `T1-F05-04`: `FlowTracker` monitors 15-Second single-turn cycle compliance (`<15000ms`).
  - `T1-F05-05`: `FlowTracker` switches to `2.5x` turbo speed multiplier on repeated Spacebar.
- **`F-AUDIO-01` (`T1-F06-01..05`)**:
  - `T1-F06-01`: `SoundEngine.playReelClack` logs staggered mechanical reel-stop clack telemetry.
  - `T1-F06-02`: `SoundEngine.playDevourCrunch` logs organic devour crunch with `devourStep` and `tier`.
  - `T1-F06-03`: `SoundEngine.playComboChime` follows exact semitone formula $f = 523.25 \times 2^{\text{step}/12}$.
  - `T1-F06-04`: `SoundEngine` combat SFX suite logs `explosion`, `gunshot`, `laser` (`5000ms`), and `backfire` events.
  - `T1-F06-05`: `SoundEngine` mirrors telemetry to `window.__AUDIO_LOG__` and supports `clearAudioLog()`.
- **`F-UI-01` (`T1-F07-01..05`)**:
  - `T1-F07-01`: `VFXCanvas` spawns and steps projectiles, devour particles, floating damage numbers, 5s laser, and screen shake.
  - `T1-F07-02`: `HUDController` renders all required Balatro-style equation and wave/gold/pulls `data-testid` targets.
  - `T1-F07-03`: `GDDViewer` mounts document selector and renders all 6 Chinese GDD documents.
  - `T1-F07-04`: `GDDViewer` supports interactive "Launch Prototype" action to switch into playable schemes.
  - `T1-F07-05`: `scripts/serve.js` serves `.html`, `.js`, `.css`, and `.md` with accurate UTF-8 MIME headers.
- **`F-S1-01` (`T1-F08-01..05`)**:
  - `T1-F08-01`: `DevourReelsEngine` initializes 3×3 grid, Central Abyssal Maw, and Wave 1 Siege Boss (`120 HP`).
  - `T1-F08-02`: Scheme 1 `config.js` defines all 9 canonical symbols across Tiers 1 to 4.
  - `T1-F08-03`: Deterministic 3×3 spin via `setSeed(seed)` and `performPrimaryAction()`.
  - `T1-F08-04`: 8-Line Payline Evaluator detects horizontal, vertical, and diagonal line matches.
  - `T1-F08-05`: Central Abyssal Maw consumes spun symbols and directly damages the Siege Boss.
- **`F-S1-02` (`T1-F09-01..05`)**:
  - `T1-F09-01`: 8-Way Adjacency Auto-Devour (`<1000ms`) + Chain Reaction 1: `Fireball + Powder Keg` internal detonation.
  - `T1-F09-02`: Chain Reaction 2: `3× Iron Knights` grants Maw heavy armor and thorns reflection volley.
  - `T1-F09-03`: Chain Reaction 3: `Hero Banquet` (`hero_berserker` devours adjacent `goblin + chest`).
  - `T1-F09-04`: Chain Reaction 4: `Curse Transmutation` (`abyss_apostle` devours `curse_skull`).
  - `T1-F09-05`: Chain Reaction 5: `Full-Board Gluttony` when `>= 6` prey symbols are devoured in a single pull.
- **`F-S1-03` (`T1-F10-01..05`)**:
  - `T1-F10-01`: Indigestion gauge accumulates when swallowing unpurged `curse_skull` and standard symbols.
  - `T1-F10-02`: `digestive_herb` reduces Indigestion (`-35`) and permanently boosts Maw base attack.
  - `T1-F10-03`: Wheel Probability Modder boosts target symbol weight and normalizes total to `100%`.
  - `T1-F10-04`: Wheel Probability Modder supports all 3 build presets (`pyro`, `iron`, `gluttony`).
  - `T1-F10-05`: 8 Siege Bosses scale from `120 HP` (Wave 1) to `85,000,000 HP` (Wave 8).
- **`F-S2-01` (`T1-F11-01..05`)**:
  - `T1-F11-01`: `RevolverDungeonEngine` initializes 6-chamber circular cylinder and Floor 1 state.
  - `T1-F11-02`: Button 1 (`performPrimaryAction` / Spin & Fire) spins cylinder and fires at Dungeon Boss.
  - `T1-F11-03`: Button 2 (`performSecondaryAction` / Load New Bullet) loads cylinder without consuming a trigger pull.
  - `T1-F11-04`: 8-Floor Dungeon Climb progression scales Boss HP across Floors 1 to 8.
  - `T1-F11-05`: `RevolverDungeonView` renders 6 chambers, 2 action buttons, and responds to `Space` & `R` hotkeys.
- **`F-S2-02` (`T1-F12-01..05`)**:
  - `T1-F12-01`: Complete 9-bullet roster catalog is defined in Scheme 2 `config.js`.
  - `T1-F12-02`: `parasite_bullet` automatically devours circular neighbors and scales damage `>= 2.0x`.
  - `T1-F12-03`: `powder_charge + fuse_cord + heavy_hammer` triggers instant 6-chamber Full Cylinder Dump.
  - `T1-F12-04`: `vampire_bullet` leeches HP on hit and converts overheal at full HP.
  - `T1-F12-05`: `scatter_bullet` sympathetically triggers adjacent chambers for multi-chamber burst.
- **`F-S2-03` (`T1-F13-01..05`)**:
  - `T1-F13-01`: `demon_bullet` applies high-multiplier (`>= 8.0x`) Russian Roulette damage.
  - `T1-F13-02`: `demon_bullet` `25%` backfire risk inflicts self-damage and activates Blood Rage bonus.
  - `T1-F13-03`: Lone Bullet Roulette empty-chamber bonus scales damage with empty chambers.
  - `T1-F13-04`: Live Russian Roulette odds HUD calculates `backfireRisk` accurately.
  - `T1-F13-05`: Surviving an empty-chamber dry click awards Russian Roulette Grit bonus.
- **`F-S3-01` (`T1-F14-01..05`)**:
  - `T1-F14-01`: `JackpotTDEngine` initializes 1×5 slot turret barrier, Base HP, Gold, and Wave 1 enemies.
  - `T1-F14-02`: Continuous real-time enemy march advances `closestEnemyProgress` on `step(dtMs)`.
  - `T1-F14-03`: Instant Gold lever pull refreshes all 5 pedestals and fires burst volley.
  - `T1-F14-04`: Scheme 3 `config.js` defines all 6 tower symbols and 4 enemy archetypes.
  - `T1-F14-05`: `JackpotTDView` renders 1×5 pedestals, lane canvas, lever button, and interest ticker.
- **`F-S3-02` (`T1-F15-01..05`)**:
  - `T1-F15-01`: `One Pair` and `Two Pair` automatically merge into 2-Star (`★★`) towers.
  - `T1-F15-02`: `Three of a Kind` triggers 4s screen-wide Freeze (`三连冰冻`) halting enemy march.
  - `T1-F15-03`: `Straight` (`顺子`) triggers 5-second continuous Hyper Laser Sweep (`5秒狂暴激光洗地`).
  - `T1-F15-04`: `Five of a Kind / Yahtzee` triggers Tactical Nuke (`五连核弹`) + 5s Hyper Laser Sweep.
  - `T1-F15-05`: High-rank turrets automatically devour adjacent Rank 1–2 fodder pedestals in `<1000ms`.
- **`F-S3-03` (`T1-F16-01..05`)**:
  - `T1-F16-01`: Real-time `+20%` compound Gold interest accrues while resisting lever pulls.
  - `T1-F16-02`: Greed Streak Multiplier escalates while holding Gold across interest ticks.
  - `T1-F16-03`: Accumulated Greed Streak Multiplier multiplies the next lever pull burst damage.
  - `T1-F16-04`: Critical Red-Zone (`closestEnemyProgress >= 0.72`) activates Red-Zone Adrenaline state.
  - `T1-F16-05`: Red-Zone Adrenaline boosts clutch hand odds (`+35%`) when enemies reach `y >= 0.72`.
- **`F-S4-01` (`T1-F17-01..05`)**:
  - `T1-F17-01`: `SigilPachinkoEngine` initializes 1×3 spawner, 24 pegs, and 5 multiplier crucibles.
  - `T1-F17-02`: `performPrimaryAction` drops 3 alchemical orbs through pegs into bottom crucibles.
  - `T1-F17-03`: Mid-air collision Auto-Devour fuses high-tier and low-tier orbs in `<1000ms`.
  - `T1-F17-04`: Center `×25 JACKPOT` crucible applies `>= 25x` multiplier and triggers ascending peg chimes.
  - `T1-F17-05`: `Chaos Tilt` (`performSecondaryAction`) nudges orbs and `SigilPachinkoView` renders required DOM testids.
- **`F-S5-01` (`T1-F18-01..05`)**:
  - `T1-F18-01`: `AbyssalGridEngine` initializes 4×4 tactical matrix (16 cells) and lock tracking.
  - `T1-F18-02`: Apex Commander auto-locks (`HOLD`) and devours orthogonal fodder neighbors in `<1000ms`.
  - `T1-F18-03`: Locked cells persist their Commander and `devourStacks` across Hold-&-Respin.
  - `T1-F18-04`: 10-Line Row/Col/Diag Bingo Evaluator computes artillery barrage multipliers.
  - `T1-F18-05`: `AbyssalGridView` renders 16 matrix cells and spin/fire action buttons.
- **`F-HUB-01` (`T1-F19-01..05`)**:
  - `T1-F19-01`: Unified Game Registry (`src/games/registry.js`) catalogs and instantiates all 5 game schemes.
  - `T1-F19-02`: Unified Arcade Hub switches across all 5 schemes, GDD Viewer, and Audio Lab.
  - `T1-F19-03`: In-App Live GDD Viewer in Unified Hub renders all 6 GDD documents.
  - `T1-F19-04`: Audio & Math Lab soundboard triggers `clack`, `crunch`, and `chime` events into `window.__AUDIO_LOG__`.
  - `T1-F19-05`: Global bridge equivalence (`window.__SLOTBOUND__ === window.__SLOTBOUND_TEST__`) and Sandbox Jackpot trigger.

### 4.2 Tier 2 — Boundary & Corner Cases (`tests/e2e/tier2-boundary-corner.test.js` — `95 Cases`)
- **`F-GDD-01` (`T2-F01-01..05`)**: Zero placeholder/TODO markers, balanced code fences & Markdown tables, exact case-sensitive path alignment, symbol ID/formula alignment, and UTF-8 integrity.
- **`F-CORE-01` (`T2-F02-01..05`)**: Zero/negative/float/MAX_SAFE_INTEGER seeds, degenerate `nextInt(k, k)` & inverted bounds, zero-weight exclusion in `pickWeighted`, empty/all-zero weight fallback, and `shuffle([])` / `shuffle([42])`.
- **`F-CORE-02` (`T2-F03-01..05`)**: `0`/negative/`NaN`/`Infinity` formatting, scientific notation `>= 10^15`, zero basePoints/default multipliers, 60-stack intensityTier 4 clamp, and negative input clamping.
- **`F-CORE-03` (`T2-F04-01..05`)**: `unusedPulls = 0` zero interest, `gold = 0` flat `+15*U` floor, negative `unusedPulls` clamping, 8-wave `U=4` compounding safety, and invalid relic ID resilience.
- **`F-CORE-04` (`T2-F05-01..05`)**: `EventBus` 2,000-event ring buffer cap, zero-listener emit/off safety, `>1000ms` devour duration clamping/violation detection, `15000ms` vs `18000ms` flow boundary, and `2.5x` turbo reset on new turn.
- **`F-AUDIO-01` (`T2-F06-01..05`)**: `comboStep = 24` vs `100` pitch ceiling clamp (`2093.0 Hz`), negative/default `comboStep`, headless Node execution without `AudioContext`, `setMuted(true)` telemetry continuity, and 1,000-call ring buffer cap.
- **`F-UI-01` (`T2-F07-01..05`)**: `VFXCanvas` 300-particle cap & `step(6000)` cleanup, `HUDController` null/idle & `1.85T` rendering without `NaN`/`undefined`, `GDDViewer` unknown doc fallback, `scripts/serve.js` `../` path traversal block, and `VFXCanvas` null 2D context safety.
- **`F-S1-01` (`T2-F08-01..05`)**: Full-board `9× abyss_apostle` 8-line jackpot, zero-payline rainbow board base damage, invalid symbol array sanitization, `pullsRemaining = 0` defeat boundary, and `reset()` full state restoration.
- **`F-S1-02` (`T2-F09-01..05`)**: All-fodder `9× goblin` zero-predator pass, all-apex `9× abyss_apostle` equal-tier non-recursion, corner cell `0` vs cell `8` adjacency boundary, simultaneous multi-synergy stacking, and single `powder_keg` without `fireball` non-trigger.
- **`F-S1-03` (`T2-F10-01..05`)**: Indigestion `>= 100` Bile Eruption & reset to `30`, `9× digestive_herb` floor clamp at `0`, repeated banish/boost `[0, 100]` clamping, unknown symbol/preset resilience, and Wave 8 Final Boss clear transition.
- **`F-S2-01` (`T2-F11-01..05`)**: Circular wrap-around between Chambers `0` and `5`, loading into full `6/6` cylinder, firing `6× empty` cylinder, `pullsRemaining = 0` boundary, and rapid consecutive invalid payload resilience.
- **`F-S2-02` (`T2-F12-01..05`)**: `parasite_bullet` surrounded by `empty`, `parasite_bullet` adjacent to equal/higher tier bullets, wrapped `Chambers 4->5->0` `Powder+Fuse+Hammer` sequence, incomplete `Powder+Fuse` trio non-trigger, and `6× parasite_bullet` cylinder termination.
- **`F-S2-03` (`T2-F13-01..05`)**: `0` `demon_bullet` -> `0%` backfire risk, `6× demon_bullet` overclock cap, low HP (`10 HP`) backfire clamping `>= 0`, Grit bonus reset after consumption, and synchronous `backfireRisk` recalculation.
- **`F-S3-01` (`T2-F14-01..05`)**: `step(0)` and `step(-100)` non-regression, `step(60000)` large delta clamping, bottom defense line breach despawn, `0 Gold` emergency lever pull, and 30 rapid-fire lever mashes in `<1s`.
- **`F-S3-02` (`T2-F15-01..05`)**: `High Card` non-sequential evaluation, `Full House` vs `Three of a Kind` priority, `Four of a Kind` evaluation, unordered Straight `[5,3,1,4,2]` detection, and `4000ms`/`5000ms` Freeze/Laser expiration after `step(6000)`.
- **`F-S3-03` (`T2-F16-01..05`)**: Red-Zone exact `0.71` vs `0.72` boundary, lever pull interest timer reset, `0 Gold` and `1,000,000 Gold` interest safety, Red-Zone deactivation after Nuke clear, and `td-interest-ticker` DOM sync.
- **`F-S4-01` (`T2-F17-01..05`)**: Left/right wall bounce boundaries, `3× ember_orb` identical drop resolution, 10× Chaos Tilt spam cap, guaranteed crucible capture across 10 seeds within `1500ms`, and unused drop interest conversion.
- **`F-S5-01` (`T2-F18-01..05`)**: Corner cell `0` orthogonal neighbor boundary (cells `1, 4` only, never `3`), `16/16` full blackout 10-line Bingo, shared orthogonal fodder single-devour conservation, out-of-bounds `cellIndex` ignore, and Early Fire Greed banking.
- **`F-HUB-01` (`T2-F19-01..05`)**: Unknown/null `switchScheme` fallback, 20× rapid scheme switch cleanup, edge seed inputs (`0, -42, "abc", 2147483647`), audio mute toggle telemetry continuity, and encoded `%2e%2e%2f` path traversal / `POST` rejection.

### 4.3 Tier 3 — Cross-Feature Pairwise Combinations (`tests/e2e/tier3-cross-feature.test.js` — `20 Cases`)
- `T3-01` (`F-GDD-01 × F-UI-01`), `T3-02` (`F-CORE-01 × F-CORE-02`), `T3-03` (`F-CORE-02 × F-CORE-03`), `T3-04` (`F-CORE-04 × F-CORE-03`), `T3-05` (`F-CORE-04 × F-AUDIO-01`), `T3-06` (`F-CORE-02 × F-UI-01`), `T3-07` (`F-CORE-01 × F-S1-01`), `T3-08` (`F-CORE-04 × F-S1-01 × F-S1-02`), `T3-09` (`F-CORE-03 × F-S1-02 × F-S1-03`), `T3-10` (`F-CORE-01 × F-S1-03`), `T3-11` (`F-AUDIO-01 × F-S2-01 × F-S2-02`), `T3-12` (`F-S2-01 × F-S2-02 × F-S2-03`), `T3-13` (`F-CORE-02 × F-S2-03`), `T3-14` (`F-CORE-04 × F-S3-01`), `T3-15` (`F-CORE-03 × F-S3-01 × F-S3-02 × F-S3-03`), `T3-16` (`F-AUDIO-01 × F-S3-02 × F-S3-03`), `T3-17` (`F-UI-01 × F-S4-01`), `T3-18` (`F-S4-01 × F-S5-01`), `T3-19` (`F-GDD-01 × F-S5-01 × F-HUB-01`), `T3-20` (`F-UI-01 × F-HUB-01`).

### 4.4 Tier 4 — Real-World End-User Scenarios (`tests/e2e/tier4-real-world-scenarios.test.js` — `10 Scenarios`)
- `T4-01`: Scenario 1 — Designer & Reviewer Walkthrough (GDD Suite Inspection, Prototype Launch & Audio Lab Audition).
- `T4-02`: Scenario 2 — Scheme 1 (`《吞噬转轮》 Devour Reels`) Full 8-Wave Siege Boss Run & Exponential Damage Scaling `10^2 -> 10^8+`.
- `T4-03`: Scenario 3 — Scheme 1 (`《吞噬转轮》`) Indigestion Overload, Bile Eruption & All 5 Stomach Chain Reactions Showcase.
- `T4-04`: Scenario 4 — Scheme 2 (`《左轮地牢》 Revolver Dungeon`) 8-Floor Fast 15-Second Dungeon Climb with `Powder + Fuse + Heavy Hammer` Full Cylinder Dump.
- `T4-05`: Scenario 5 — Scheme 2 (`《左轮地牢》`) High-Stakes Russian Roulette Brinkmanship (`Demon Bullet` Backfire, Blood Rage & Vampire Heal).
- `T4-06`: Scenario 6 — Scheme 3 (`《黄金矿工防线》 Jackpot TD`) Real-Time Greed Waiting vs. Last-Second Red-Zone `三连冰冻` & `五连核弹` Comeback.
- `T4-07`: Scenario 7 — Scheme 3 (`《黄金矿工防线》`) Multi-Wave Pedestal Evolution (`★ -> ★★ -> ★★★`), Auto-Devour Stacking & `顺子` 5s Laser Sweep.
- `T4-08`: Scenario 8 — Exploratory Gameplay Tour: Scheme 4 (`《咒印弹珠台》 Sigil Pachinko`) & Scheme 5 (`《深渊矩阵》 Abyssal Grid`) Multi-Wave Mastery.
- `T4-09`: Scenario 9 — Full Headless Chromium Browser E2E: Unified Arcade Hub Switching Across All 5 Playable Schemes + Live DOM Verification.
- `T4-10`: Scenario 10 — 15-Second Flow Ergonomics (`Spacebar` Loop + `2.5x` Turbo) & Telemetry Bridge Stress Test in Headless Chromium.

### 4.5 Tier 5 — White-Box Adversarial Hardening (`tests/e2e/tier5-adversarial-hardening.test.js` — `30 Cases`)
- **Track A (`T5-01` .. `T5-15` — Core, Audio, UI, Scheme 1 & Scheme 2)**:
  - `T5-01` (`F-CORE-01`): PRNG `fork(salt)` determinism, mid-stream `getState()`/`setState()` checkpointing & tuple/inverted bounds.
  - `T5-02` (`F-CORE-02`): `BigInt` sanitization, `±1e300` overflow clamping, Chinese `万亿` notation & endless wave `>8` extrapolation.
  - `T5-03` (`F-CORE-03`): Gold-spend pull escalation, overdraft rejection vs emergency overdraft & full 8-relic pool exhaustion.
  - `T5-04` (`F-CORE-04`): Async `EventBus` wildcard & re-entrant unsubscribe isolation + `FlowTracker` `DRAFT_REWARD` loop & 100-turn history cap.
  - `T5-05` (`F-AUDIO-01`): Web Audio synthesizer node graph execution with mock `AudioContext` & interactive soundboard cycling (`_demoChimeStep` modulo 25).
  - `T5-06` (`F-UI-01`): `VFXCanvas` 2D context rendering pipeline, screen-shake decay class removal & `HUDController` extreme state sync.
  - `T5-07` (`F-UI-01`, `F-GDD-01`): `GDDViewer` `renderMarkdownToHtml` XSS escaping, unclosed code/table auto-close & interactive tab/prototype launch.
  - `T5-08` (`F-S1-01`, `F-S1-02`): `DevourReelsEngine` Food-Chain Apex Preemption (Tier 4 devours Tier 3 predator before Tier 3 can eat Tier 1 prey).
  - `T5-09` (`F-S1-01`, `F-S1-02`): `DevourReelsEngine` Center Abyssal Maw (Cell 4) equal-tier tie-break priority over peripheral predators.
  - `T5-10` (`F-S1-02`, `F-S1-03`): `DevourReelsEngine` simultaneous 5-synergy mega-turn + `acid_reflux_core` Bile Tsunami (`×15.0`) + relic stacking.
  - `T5-11` (`F-S1-01`, `F-S1-03`): `DevourReelsEngine` payline-conditional `digestive_herb` `lineMultiplier` boost & Wave `1 -> 2` compound clear.
  - `T5-12` (`F-S2-02`): `RevolverDungeonEngine` Full Cylinder Dump trio protection during Parasite circular neighbor devour.
  - `T5-13` (`F-S2-02`, `F-S2-03`): `RevolverDungeonEngine` sympathetic `scatter_bullet` burst igniting adjacent `vampire_bullet` & `demon_bullet`.
  - `T5-14` (`F-S2-01`, `F-S2-02`): `RevolverDungeonEngine` clockwise `powder_charge` wrap-around (`Chamber 5 -> 0`) & full-cylinder lowest-tier replacement.
  - `T5-15` (`F-S2-03`): `RevolverDungeonEngine` 5-empty-chamber Lone Survivor Demon Bullet Gambit + Grit consumption.
- **Track B (`T5-16` .. `T5-30` — Scheme 3, Scheme 4, Scheme 5, Unified Hub, Server & Live Headless Chromium E2E)**:
  - `T5-16` (`F-S3-02`): `JackpotTDEngine` exhaustive $6^5 = 7,776$ Yahtzee permutation partition & malformed hand resilience.
  - `T5-17` (`F-S3-02`): `JackpotTDEngine` Pedestal Reach-1 vs Reach-2 Auto-Devour & cross-pull permanent stack persistence.
  - `T5-18` (`F-S3-01`, `F-S3-02`): `JackpotTDEngine` partial freeze slice thaw, Cryo slow aura & Tunnel Berserker enrage physics.
  - `T5-19` (`F-S3-03`): `JackpotTDEngine` fractional interest accumulation, `5.0x` Greed Streak cap & cash-in reset.
  - `T5-20` (`F-S4-01`): `SigilPachinkoEngine` multi-tier mid-air Auto-Devour hierarchy (equal-apex survival vs dual-prey fusion).
  - `T5-21` (`F-S4-01`): `SigilPachinkoEngine` sub-400ms incremental wall reflection damping & crucible settle.
  - `T5-22` (`F-S5-01`): `AbyssalGridEngine` multi-turn locked Commander stack persistence & manual lock/unlock toggle.
  - `T5-23` (`F-S5-01`): `AbyssalGridEngine` exact Bingo line multiplier ladder (`0, 1, 2, 3, 4, 5, 8, 10` lines) & cross-line geometry.
  - `T5-24` (`F-HUB-01`): Game Registry alias normalization & per-scheme `jackpotSetup` determinism.
  - `T5-25` (`F-HUB-01`): `ArcadeHubController` cross-scheme engine state preservation & input focus hotkey guard.
  - `T5-26` (`F-S3`, `F-S4`, `F-S5`): Track B Views (`JackpotTDView`, `SigilPachinkoView`, `AbyssalGridView`) keyboard, `2.5x` turbo & unmount lifecycle.
  - `T5-27` (`F-UI-01`, `F-HUB-01`): Static server (`scripts/serve.js`) multi-encoded traversal, null-byte, bad URI & `HEAD` hardening.
  - `T5-28` (`Chromium E2E`): Live Headless Chromium Scheme 3 (`Jackpot TD`) Red-Zone Clutch Nuke, 3-Star Merge & DOM Sync.
  - `T5-29` (`Chromium E2E`): Live Headless Chromium Scheme 4 (`Sigil Pachinko`) & Scheme 5 (`Abyssal Grid`) Interactive DOM & Crucible/Bingo Sync.
  - `T5-30` (`Chromium E2E`): Live Headless Chromium Sandbox Seed Coercion, 5-Scheme Jackpot Sweep & GDD Prototype Launch Round-Trip.

### 4.6 Tier 6 — Round 2 Visual, Choreography, Spatial Geometry & Live Gameplay Polish (`tests/e2e/tier6-visual-gameplay-polish.test.js` — `35 Cases`)
- **Pillar 1 — Viewport Fit, Above-the-Fold Playability & Theme (`T6-01` .. `T6-04`)**:
  - `T6-01` (`F-R2-01`): Desktop `1440×900` zero horizontal overflow (`scrollWidth <= clientWidth + 2`) & above-the-fold primary CTA (`bottom <= 900`) across all 5 schemes.
  - `T6-02` (`F-R2-01`): Desktop `1440×900` on-stage `[data-testid="boss-arena-card"]` & interactive stage above-the-fold fit across all 5 schemes.
  - `T6-03` (`F-R2-01`): Mobile `390×844` responsive layout, zero horizontal clipping & positive interactive bounds across all 5 schemes.
  - `T6-04` (`F-R2-01`): Tactile Casino-Dungeon theme palette (non-`#0b0914`/`#9b5de5`), `tabular-nums` numeric alignment & compact non-crowding `sandbox-toolbar`.
- **Pillar 2 — Bespoke Procedural SVG Artwork (`SpriteForge.js`) & Zero Raw Debug Strings (`T6-05` .. `T6-09`)**:
  - `T6-05` (`F-R2-01`): `SpriteForge.renderSprite()` complete 5-scheme entity, 8-relic & deterministic hash fallback contract (`viewBox="0 0 64 64"`).
  - `T6-06` (`F-R2-01`): `SpriteForge.renderBossPortrait()` Waves `1..8` × all 5 schemes illustrated Boss portrait contract (`viewBox="0 0 120 120"`, `data-testid="boss-portrait-svg"`).
  - `T6-07` (`F-R2-01`): Strict `MockElement` SVG parser safety audit across `120+` `SpriteForge` sprites & Boss portraits (explicit self-closing tags, zero `<text>`, zero literal `>` in attribute quotes, clean `textContent`).
  - `T6-08` (`F-R2-01`): Live browser bespoke inline `<svg>` icons & `[data-testid="boss-portrait-svg"]` across all 5 schemes.
  - `T6-09` (`F-R2-01`, `F-R2-02`): Zero raw `snake_case` synergy IDs (`fireball_powder_keg`, etc.) or `undefined`/`NaN` placeholders in visible stage & HUD text before & after synergies.
- **Pillar 3 — Live 60fps `VFXCanvas`, 5-Factor `HUDController` & Master-Bus `SoundEngine` (`T6-10` .. `T6-13`)**:
  - `T6-10` (`F-R2-02`, `F-R2-07`): Live Headless Chromium 60fps `#vfx-canvas` pixel proof (`nonZeroPixels > 200` without calling `stepSimulation()`) & real-time `.shake-tier-*` decay.
  - `T6-11` (`F-R2-02`): `VFXCanvas.js` `syncDimensions()`, `resolveAnchor()` coordinate mapping & `T5-06` minimal 11-method spy context safety.
  - `T6-12` (`F-R2-02`): `HUDController.js` 5-factor multiplicative scoreboard (`hud-chain-mult`, `hud-greed-mult`), `data-intensity-tier` & `hud-relic-strip` medallions.
  - `T6-13` (`F-R2-02`): `SoundEngine.js` master `DynamicsCompressorNode` feature-detection (`T5-05` spy-safe), procedural noise transients & `55ms` combo chime micro-arpeggiator.
- **Pillar 4 — True Spatial Geometry in Live Browser (`getBoundingClientRect()`) (`T6-14` .. `T6-18`)**:
  - `T6-14` (`F-R2-04`): Scheme 2 (`revolver-dungeon`) true `60°` circular/radial 6-chamber drum geometry (`>=3` Y rows × `>=3` X cols, circular radius consistency).
  - `T6-15` (`F-R2-05`): Scheme 3 (`jackpot-td`) styled horizontal `1×5` `.td-pedestal-card` row (`height >= 50`) & positioned `.td-enemy-token` lane bounds.
  - `T6-16` (`F-R2-06`): Scheme 4 (`sigil-pachinko`) 24-peg `2D` staggered arena (`>=4` Y rows × `>=5` X cols inside board) & horizontal 5-crucible bar.
  - `T6-17` (`F-R2-06`): Scheme 5 (`abyssal-grid`) true `4×4` CSS Grid tactical matrix geometry (`4` X columns × `4` Y rows).
  - `T6-18` (`F-R2-03`): Scheme 1 (`devour-reels`) multi-column `1440×900` cockpit layout (`3×3` `devour-grid` side-by-side with `prob-mod-panel`).
- **Pillar 5 — Autonomous Real-Time Loop, Tactical Depth, Exploit Fixes, Relic Draft & Network Cleanliness (`T6-19` .. `T6-35`)**:
  - `T6-19` (`F-R2-05`, `F-R2-07`): Live browser Scheme 3 autonomous 60fps `rAF` enemy march (`prog1 > prog0` without `stepSimulation()`), `pauseRealtimeLoop`/`resumeRealtimeLoop` & non-destructive `syncRealtimeDOM`.
  - `T6-20` (`F-R2-05`): Scheme 3 continuous turret auto-fire DPS (`shotsPerSec`) & mortal lane minions dying for Gold (fixing `Math.max(1, ...)` clamping).
  - `T6-21` (`F-R2-05`): Scheme 3 clickable Pedestal `🔒 HOLD` (`up to 2` towers) persists held towers across lever pulls.
  - `T6-22` (`F-R2-05`): Scheme 3 Overheated Scrap Pull penalty when `gold < pullCost`.
  - `T6-23` (`F-R2-03`): Scheme 1 active `[R] Belch Bile Purge` (`indigestion >= 50`), Gold-backed Wheel Modding & Maw Upgrade Workshop.
  - `T6-24` (`F-R2-03`): Scheme 1 real Boss traits & `mawArmor` hit absorption on Overtime.
  - `T6-25` (`F-R2-04`): Scheme 2 3-Bullet Tactical Ammo Belt shop, Click-any-Chamber (`#0..#5`) targeted loading & Overtime/dry-click Boss counter-attacks.
  - `T6-26` (`F-R2-06`): Scheme 4 multi-step browser cascade (no `0ms` teleport while preserving instant `.crucible-hit`), Launch Aim (`◀/居中/▶`) & `35G` Sigil Peg Upgrade.
  - `T6-27` (`F-R2-06`): Live browser Scheme 5 clickable `matrix-cell-0..15` `🔒 HOLD` toggle & non-lethal `[R]` Early Fire wave-clear exploit fix.
  - `T6-28` (`F-R2-06`): Scheme 5 wave-transition Commander Ascension merge prevents `16/16` locked board stagnation.
  - `T6-29` (`F-R2-02`): `RelicDraftBanner.js` contract & post-wave 3-Card Relic Draft surfacing across all 5 schemes.
  - `T6-30` (`F-R2-02`): Live browser interactive Relic Draft pick (`relic-pick-1`) updates owned relics & `hud-relic-strip`.
  - `T6-31` (`F-R2-02`): Non-blocking Relic Draft auto-advance rule (`pendingRelicDraft[0]`) across all 5 schemes.
  - `T6-32` (`F-R2-02`): Wave 8 Final Boss clear renders `run-victory-banner` & `btn-endless-mode` enters Wave 9+ Endless scaling (`btn-new-run` resets run).
  - `T6-33` (`F-R2-02`): Fatal `playerHp <= 0` renders `run-defeat-banner` & `btn-retry-run` restores fresh run.
  - `T6-34` (`F-R2-01`, `F-R2-08`): Live browser zero `404` network responses (including `/favicon.ico`), zero `pageerror`s & zero `console.error`s across all 7 tabs.
  - `T6-35` (`F-R2-02`, `F-R2-08`): Public GitHub Pages URL (`https://luca5702.github.io/slotbound-dopamine-lab/`) in `README.md`, subpath-safe relative asset paths & `.nojekyll` presence.

