# E2E Test Suite Ready (`TEST_READY.md`)

- **Status**: `READY` (6-Tier Suite — `285` Total E2E Cases = `250` R1 Baseline + `35` R2 Tier 6 Visual, Choreography, Spatial Geometry & Live Gameplay Polish)
- **Round 2 Test Author**: `test_writer_r2_e2e_1` & `test_writer_r2_e2e_2` (under `sub_orch_r2_e2e` `44499ce778241a2206697e48fa49a3ef`)
- **Specification Reference**: [`/home/antigravity/TEST_INFRA.md`](file:///home/antigravity/TEST_INFRA.md)
- **Project Contract Reference**: [`/home/antigravity/PROJECT.md`](file:///home/antigravity/PROJECT.md)

---

## 1. Execution Commands

### Run Full 6-Tier E2E Verification Suite (`285` Test Cases)
```bash
node scripts/verify-e2e.js
```
*(Or via npm script: `npm run test:e2e`)*

### Run Round 1 Baseline Regression Gate (Tiers 1–5 — `250` Test Cases)
```bash
node scripts/verify-e2e.js --tier=1 --tier=2 --tier=3 --tier=4 --tier=5
```

### Run Progressive Tiers Individually
```bash
# Tier 1 — Feature Coverage (95 happy-path cases, 5 per feature × 19 R1 features)
node scripts/verify-e2e.js --tier=1

# Tier 2 — Boundary & Corner Cases (95 edge/boundary/invalid-input cases, 5 per feature × 19 R1 features)
node scripts/verify-e2e.js --tier=2

# Tier 3 — Cross-Feature Pairwise Combinations (20 pairwise interaction cases across all 19 R1 features)
node scripts/verify-e2e.js --tier=3

# Tier 4 — Real-World End-User Scenarios & Headless Chromium E2E (10 multi-wave / browser scenarios)
node scripts/verify-e2e.js --tier=4

# Tier 5 — White-Box Adversarial Hardening (30 white-box adversarial & Headless Chromium E2E cases)
node scripts/verify-e2e.js --tier=5

# Tier 6 — Round 2 Visual, Choreography, Spatial Geometry & Live Gameplay Polish (35 cases)
node scripts/verify-e2e.js --tier=6
```

### Run Directly via Node v24 Built-In Test Runner (`node --test`)
```bash
node --test tests/e2e/tier1-feature-coverage.test.js
node --test tests/e2e/tier2-boundary-corner.test.js
node --test tests/e2e/tier3-cross-feature.test.js
node --test tests/e2e/tier4-real-world-scenarios.test.js
node --test tests/e2e/tier5-adversarial-hardening.test.js
node --test tests/e2e/tier6-visual-gameplay-polish.test.js
```

---

## 2. Suite Summary & Coverage Matrix

| Tier | Test File | Test Cases | Coverage Scope |
| :--- | :--- | :---: | :--- |
| **Tier 1** | [`tests/e2e/tier1-feature-coverage.test.js`](file:///home/antigravity/tests/e2e/tier1-feature-coverage.test.js) | **`95`** | `5` happy-path cases per feature × all `19` R1 features (`T1-F01-01..05` through `T1-F19-01..05`) |
| **Tier 2** | [`tests/e2e/tier2-boundary-corner.test.js`](file:///home/antigravity/tests/e2e/tier2-boundary-corner.test.js) | **`95`** | `5` boundary/corner/overflow/invalid-input cases per feature × all `19` R1 features (`T2-F01-01..05` through `T2-F19-01..05`) |
| **Tier 3** | [`tests/e2e/tier3-cross-feature.test.js`](file:///home/antigravity/tests/e2e/tier3-cross-feature.test.js) | **`20`** | Pairwise cross-feature interactions (`T3-01` through `T3-20`) spanning all `19` R1 features |
| **Tier 4** | [`tests/e2e/tier4-real-world-scenarios.test.js`](file:///home/antigravity/tests/e2e/tier4-real-world-scenarios.test.js) | **`10`** | Multi-wave / multi-scheme end-user journeys & live Headless Chromium 156 CDP DOM/bridge scenarios (`T4-01` through `T4-10`) |
| **Tier 5** | [`tests/e2e/tier5-adversarial-hardening.test.js`](file:///home/antigravity/tests/e2e/tier5-adversarial-hardening.test.js) | **`30`** | White-box adversarial coverage hardening across Core, Audio, UI, Schemes 1–5, Static Server & Headless Chromium (`T5-01` through `T5-30`) |
| **Tier 6** | [`tests/e2e/tier6-visual-gameplay-polish.test.js`](file:///home/antigravity/tests/e2e/tier6-visual-gameplay-polish.test.js) | **`35`** | Round 2 viewport fit (`1440×900` & `390×844`), `SpriteForge` SVG art, live 60fps `#vfx-canvas` pixel proof, spatial `getBoundingClientRect()` geometry, autonomous `rAF`, tactical depth, exploit fixes, Relic Draft & network cleanliness (`T6-01` through `T6-35`) |
| **Total** | **All 6 Tiers (`scripts/verify-e2e.js`)** | **`285`** | **100% coverage of all 27 R1 + R2 features (`F-GDD-01`..`F-HUB-01` + `F-R2-01`..`F-R2-08`) across Tiers 1–6** |

---

## 3. Feature Inventory Coverage (`PROJECT.md § Feature Inventory`)

### 3.1 Round 1 Baseline Features (`F-GDD-01` .. `F-HUB-01` — `250` Cases)

| # | Feature ID | Feature Name | Milestone | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|------------|--------------|-----------|--------|--------|--------|--------|--------|
| 1 | `F-GDD-01` | Master & Iron Laws GDD Suite | M1 | `T1-F01-01..05` | `T2-F01-01..05` | `T3-01`, `T3-19` | `T4-01`, `T4-10` | `T5-07`, `T5-30` |
| 2 | `F-CORE-01` | Deterministic Seeded PRNG | M1 | `T1-F02-01..05` | `T2-F02-01..05` | `T3-02`, `T3-07`, `T3-10` | `T4-02..09` | `T5-01`, `T5-30` |
| 3 | `F-CORE-02` | Exponential Number & Balatro Scoring Engine | M1 | `T1-F03-01..05` | `T2-F03-01..05` | `T3-02`, `T3-03`, `T3-06`, `T3-13` | `T4-02..09` | `T5-02` |
| 4 | `F-CORE-03` | Risk & Greed Economy Engine | M1 | `T1-F04-01..05` | `T2-F04-01..05` | `T3-03`, `T3-04`, `T3-09`, `T3-15` | `T4-02`, `T4-04`, `T4-06`, `T4-08` | `T5-03`, `T5-10`, `T5-19` |
| 5 | `F-CORE-04` | 15-Second Flow & EventBus | M1 | `T1-F05-01..05` | `T2-F05-01..05` | `T3-04`, `T3-05`, `T3-08`, `T3-14` | `T4-02..10` | `T5-04`, `T5-26` |
| 6 | `F-AUDIO-01` | Procedural Web Audio Synthesizer | M1 | `T1-F06-01..05` | `T2-F06-01..05` | `T3-05`, `T3-11`, `T3-16` | `T4-01`, `T4-02`, `T4-05`, `T4-09`, `T4-10` | `T5-05` |
| 7 | `F-UI-01` | Shared 2D VFX Canvas, Score HUD & GDD Reader | M1 | `T1-F07-01..05` | `T2-F07-01..05` | `T3-01`, `T3-06`, `T3-17`, `T3-20` | `T4-01`, `T4-09`, `T4-10` | `T5-06`, `T5-07`, `T5-27` |
| 8 | `F-S1-01` | Scheme 1 Core: 3×3 Grid & Central Abyssal Maw | M2 | `T1-F08-01..05` | `T2-F08-01..05` | `T3-07`, `T3-08` | `T4-02`, `T4-03`, `T4-09` | `T5-08`, `T5-09`, `T5-11` |
| 9 | `F-S1-02` | Scheme 1 Auto-Devour & 5 Stomach Chain Reactions | M2 | `T1-F09-01..05` | `T2-F09-01..05` | `T3-08`, `T3-09` | `T4-02`, `T4-03` | `T5-08`, `T5-09`, `T5-10` |
| 10 | `F-S1-03` | Scheme 1 Indigestion Meter, Probability Modder & 8 Bosses | M2 | `T1-F10-01..05` | `T2-F10-01..05` | `T3-09`, `T3-10` | `T4-02`, `T4-03` | `T5-10`, `T5-11` |
| 11 | `F-S2-01` | Scheme 2 Core: 6-Chamber Revolver & 2-Button Loop | M2 | `T1-F11-01..05` | `T2-F11-01..05` | `T3-11`, `T3-12` | `T4-04`, `T4-05`, `T4-09` | `T5-14` |
| 12 | `F-S2-02` | Scheme 2 Bullet Roster, Parasite Devour & Full Cylinder Dump | M2 | `T1-F12-01..05` | `T2-F12-01..05` | `T3-11`, `T3-12` | `T4-04`, `T4-05` | `T5-12`, `T5-13`, `T5-14` |
| 13 | `F-S2-03` | Scheme 2 Russian Roulette Demon Bullet & Grit | M2 | `T1-F13-01..05` | `T2-F13-01..05` | `T3-12`, `T3-13` | `T4-04`, `T4-05` | `T5-13`, `T5-15` |
| 14 | `F-S3-01` | Scheme 3 Core: 1×5 Slot Turret Wall & Real-Time March | M3 | `T1-F14-01..05` | `T2-F14-01..05` | `T3-14`, `T3-15` | `T4-06`, `T4-07`, `T4-09` | `T5-18`, `T5-26`, `T5-28` |
| 15 | `F-S3-02` | Scheme 3 Yahtzee Hand Evaluator & Clutch Ultimates | M3 | `T1-F15-01..05` | `T2-F15-01..05` | `T3-15`, `T3-16` | `T4-06`, `T4-07` | `T5-16`, `T5-17`, `T5-18`, `T5-28` |
| 16 | `F-S3-03` | Scheme 3 Real-Time Greed Interest & Red-Zone Adrenaline | M3 | `T1-F16-01..05` | `T2-F16-01..05` | `T3-15`, `T3-16` | `T4-06`, `T4-07` | `T5-19`, `T5-28` |
| 17 | `F-S4-01` | Scheme 4 Exploration: 《咒印弹珠台》(Sigil Pachinko) | M3 | `T1-F17-01..05` | `T2-F17-01..05` | `T3-17`, `T3-18` | `T4-08`, `T4-09` | `T5-20`, `T5-21`, `T5-26`, `T5-29` |
| 18 | `F-S5-01` | Scheme 5 Exploration: 《深渊矩阵》(Abyssal Grid) | M3 | `T1-F18-01..05` | `T2-F18-01..05` | `T3-18`, `T3-19` | `T4-08`, `T4-09` | `T5-22`, `T5-23`, `T5-26`, `T5-29` |
| 19 | `F-HUB-01` | Unified Arcade Hub, Live GDD Viewer, Audio Lab & Test Bridge | M3 | `T1-F19-01..05` | `T2-F19-01..05` | `T3-19`, `T3-20` | `T4-01`, `T4-09`, `T4-10` | `T5-24`, `T5-25`, `T5-27`, `T5-30` |

### 3.2 Round 2 Overhaul Features (`F-R2-01` .. `F-R2-08` — `35` Tier 6 Cases)

| # | Feature ID | Feature Name | Milestone | Tier 6 Verification Cases |
|---|------------|--------------|-----------|---------------------------|
| 20 | `F-R2-01` | Obsidian, Brushed Brass & Crimson Felt `100vh` Design System & `SpriteForge` SVG Art | M5 | `T6-01..09`, `T6-34` |
| 21 | `F-R2-02` | HiDPI `VFXCanvas`, 5-Factor `HUDController`, `RelicDraftBanner` & Master-Compressed `SoundEngine` | M5 | `T6-09..13`, `T6-29..33`, `T6-35` |
| 22 | `F-R2-03` | Scheme 1 (`devour-reels`) R2 Visual & Gameplay Overhaul | M6 | `T6-01..03`, `T6-08..09`, `T6-18`, `T6-23..24`, `T6-29..33` |
| 23 | `F-R2-04` | Scheme 2 (`revolver-dungeon`) R2 Visual & Gameplay Overhaul | M6 | `T6-01..03`, `T6-08`, `T6-14`, `T6-25`, `T6-29`, `T6-31`, `T6-33` |
| 24 | `F-R2-05` | Scheme 3 (`jackpot-td`) R2 Real-Time Loop, Visual Lane & Tactical Hold Overhaul | M7 | `T6-01..03`, `T6-08`, `T6-15`, `T6-19..22`, `T6-29`, `T6-31`, `T6-33` |
| 25 | `F-R2-06` | Scheme 4 (`sigil-pachinko`) & Scheme 5 (`abyssal-grid`) R2 Physics, Grid & Tactical Overhaul | M7 | `T6-01..03`, `T6-08`, `T6-16..17`, `T6-26..29`, `T6-31` |
| 26 | `F-R2-07` | Unified 60fps Browser `requestAnimationFrame` Runtime (`ArcadeHubController`) | M7 | `T6-10`, `T6-19`, `T6-34` |
| 27 | `F-R2-08` | Tier 6 Live Browser Visual/Gameplay E2E Suite & GitHub Pages Deployment Readiness | M8 | `T6-01` .. `T6-35` (All 35 Cases) |

---

## 4. Verification Status

- **Round 1 Regression Gate (`Tiers 1–5`)**: **`250 / 250 PASS (100%)`** verified via `node scripts/verify-e2e.js --tier=1 --tier=2 --tier=3 --tier=4 --tier=5` (`0` regressions from R2 harness & runner upgrades).
- **Round 2 Tier 6 Suite (`tests/e2e/tier6-visual-gameplay-polish.test.js`)**: **`35` distinct top-level `test()` cases (`T6-01`..`T6-35`)** registered in `scripts/verify-e2e.js` (`expectedMinTests: 35, expectedCases: 35`, enforcing `skipped === 0 && todo === 0`). All unmerged M6/M7 features fail strictly via clean `AssertionError` diagnostics with zero harness crashes, zero skipped tests, zero tautological assertions, and zero `org.chromium.Chromium.*` `TMPDIR` leaks. Once Milestones M5, M6, and M7 complete, `node scripts/verify-e2e.js` enforces **`285 / 285 PASS`**.
