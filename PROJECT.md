# Project: Slotbound Minimalist Dopamine Lab (《Slotbound》极简爽游衍生套件)

## Architecture

- **Tech Stack**:
  - **Runtime & Module System**: Zero-dependency Vanilla JavaScript (ES2024 ES Modules, `"type": "module"`) running natively in Browser (`Chromium 156`) and `Node.js v24.22.2` (`node --test`).
  - **Rendering & UI**: Hybrid HTML5 2D `<canvas>` + Modern CSS3 DOM (CSS Grid/Flexbox for Arcade Cabinet Shell, Slot Grids, Revolver Cylinder, Relic Drafts, and Live GDD Reader; 2D Canvas for 60fps projectiles, devour particle bursts, chain explosions, pachinko physics, 5s berserk laser sweeps, floating damage popups, and screen shake).
  - **Audio**: Zero-dependency Procedural Web Audio API Synthesizer (`src/audio/SoundEngine.js`) generating mechanical reel-stop clacks, crisp multi-layered devour crunches, ascending pitch combo chimes ($f = 523.25 \times 2^{\text{step}/12}\text{ Hz}$), chain explosions, revolver shots, and laser beams, with a deterministic ring buffer (`window.__AUDIO_LOG__` / `soundEngine.getAudioLog()`) and safe headless Node no-op fallback.
  - **Dev & Test Tooling**: Built-in `node --test` for unit/integration tests + `scripts/serve.js` (zero-dependency Node HTTP static server) + Headless Chromium (`chromium --headless --no-sandbox --disable-gpu`) for E2E verification.
- **Module Boundaries & Data Flow**:
  - **Pure Deterministic Core (`src/core/`)**: Seeded PRNG (`PRNG.js`), Exponential BigNumber & Balatro-style Score Formula (`BigNumber.js`, `ScoreFormula.js`), Risk & Greed Compound Interest & Relic Economy (`EconomyEngine.js`), EventBus (`EventBus.js`), and 15-Second Flow Tracker (`FlowTracker.js`). Strictly zero DOM dependencies so all engines run in both Node and Browser.
  - **Procedural Audio & Shared UI (`src/audio/`, `src/ui/`)**: `SoundEngine.js`, `VFXCanvas.js`, `HUDController.js`, and `GDDViewer.js`.
  - **Playable Game Modules (`src/games/<scheme-id>/`)**: Each of the 5 playable schemes exports a pure deterministic `*Engine.js` (implementing `IGameEngine`) and an interactive browser `*View.js` (implementing `IGameView`):
    1. **Scheme 1 (`src/games/devour-reels/`)**: 《吞噬转轮》(Devour Reels) — 3×3 Grid + Central Abyssal Maw, Auto-Devour adjacency predation, 5+ multi-step stomach chain reactions (`Fireball + Powder Keg`, `3× Iron Knights`, `Hero Banquet`, `Curse Transmutation`, `Full-Board Gluttony`), Indigestion meter (`0..100`) & Bile Eruption, live Wheel Probability Modder (`%` weights + presets), and 8 Siege Bosses.
    2. **Scheme 2 (`src/games/revolver-dungeon/`)**: 《左轮地牢》(Revolver Dungeon) — 6-Chamber Circular Revolver Cylinder, strict 2-button combat loop (`Spin & Fire [Space]` vs `Load New Bullet [R]`), 9 bullet types (`empty`, `lead_bullet`, `vampire_bullet`, `scatter_bullet`, `parasite_bullet`, `powder_charge`, `fuse_cord`, `heavy_hammer`, `demon_bullet`), `Parasite` neighbor devour, `Powder + Fuse + Heavy Hammer` instant 6-chamber full cylinder dump, and Russian Roulette Demon Bullet backfire risk vs 8 Dungeon Bosses.
    3. **Scheme 3 (`src/games/jackpot-td/`)**: 《黄金矿工防线》(Jackpot TD) — 1×5 Single-Line Slot Turret Barrier across the real-time monster invasion path, continuous real-time enemy wave march (`step(dtMs)`), instant Gold lever pull refreshing all 5 turrets + firing immediate burst volley, Yahtzee/Poker hand evaluator (`Pair` -> 2-star `★★` auto-merge, `Two Pair`, `Three of a Kind` -> 4s screen-wide `三连冰冻` Freeze clutch save, `Full House`, `Straight` -> `5秒狂暴激光洗地` 5s Hyper Laser Sweep, `Four of a Kind`, `Five of a Kind / Yahtzee` -> `五连核弹` Screen-Wiping Nuke + 5s Hyper Laser Sweep), pedestal Auto-Devour stack accumulation, and real-time Gold compound interest vs frantic lever-pulling tension.
    4. **Scheme 4 (`src/games/sigil-pachinko/`)**: 《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade) — Exploratory Variant A: Top 1×3 Alchemical Orb Spawner + 24-Peg Elemental Cascade Arena + Mid-Air Collision Auto-Devour + Ascending Peg Bounce Chimes + Bottom 5 Multiplier Crucibles (`×2 / ×5 / ×25 JACKPOT`) + Chaos Tilt risk mechanic.
    5. **Scheme 5 (`src/games/abyssal-grid/`)**: 《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo) — Exploratory Variant B: 4×4 Matrix Hold-&-Respin + Auto-Locking Apex Commanders that devour orthogonal fodder neighbors on every respin + 10-Line Row/Col/Diag Bingo Artillery Barrage.
  - **Unified Arcade Hub & Telemetry Bridge (`index.html`, `src/main.js`, `src/games/registry.js`)**: Top navigation switcher across all 5 schemes, in-app Live GDD Reader (`docs/gdd/*.md`), Audio & Math Lab soundboard, Sandbox Modifier toolbar, and deterministic E2E test bridges (`window.__SLOTBOUND__` and `window.__SLOTBOUND_TEST__`).

---

## Code Layout

```text
/home/antigravity/
├── PROJECT.md                              # Global project architecture, milestones, interfaces & layout
├── README.md                               # Quickstart, GDD index, game controls & verification guide
├── package.json                            # {"type": "module", "scripts": {"start": "node scripts/serve.js", "test": "node --test tests/unit/*.test.js", "test:e2e": "node scripts/verify-e2e.js"}}
├── index.html                              # Unified Web Arcade Hub entry point
├── docs/
│   └── gdd/                                # Comprehensive Game Design Documents (GDDs)
│       ├── 00-master-design-philosophy.md  # Core contradiction analysis, 3 Minimalist Formulas, Directory Architecture
│       ├── 01-iron-laws-math-and-audio.md  # 15s Flow Rule, Exponential Math Formula, Web Audio Synth Spec, Risk & Greed Economy
│       ├── 02-scheme1-devour-reels.md      # Scheme 1 《吞噬转轮》(Devour Reels) Full GDD
│       ├── 03-scheme2-revolver-dungeon.md  # Scheme 2 《左轮地牢》(Revolver Dungeon) Full GDD
│       ├── 04-scheme3-jackpot-td.md        # Scheme 3 《黄金矿工防线》(Jackpot TD) Full GDD
│       └── 05-explorations-pachinko-grid.md# Scheme 4 《咒印弹珠台》 & Scheme 5 《深渊矩阵》 Full GDD
├── src/
│   ├── main.js                             # App bootstrap, Arcade Hub switcher, global Spacebar/hotkey router, window.__SLOTBOUND__ & window.__SLOTBOUND_TEST__ bridge
│   ├── styles/
│   │   ├── main.css                        # Arcade cabinet theme tokens, responsive layout, HUD cards, GDD drawer styling
│   │   └── animations.css                  # Screen shake, devour bite pulse, combo multiplier bounce, laser glow keyframes
│   ├── core/                               # Shared Deterministic Core Engine (100% Node-testable, zero DOM dependency)
│   │   ├── PRNG.js                         # Seeded Mulberry32 PRNG (next, nextInt, pickWeighted, shuffle, getState)
│   │   ├── BigNumber.js                    # Exponential number formatting (K, M, B, T, 万, 亿, scientific) & safe math
│   │   ├── ScoreFormula.js                 # Balatro-style exponential formula: BaseChips * LineMult * DevourMult * ChainMult * GreedMult
│   │   ├── EconomyEngine.js                # Risk & Greed wave pull countdown, unused pull compound interest, Greed Mult & Relic drafting
│   │   ├── EventBus.js                     # Synchronous/async event bus & inspectable ring buffer
│   │   └── FlowTracker.js                  # 15-Second Flow Rule timer, <1000ms auto-devour settlement tracker & turbo speed multiplier
│   ├── audio/
│   │   └── SoundEngine.js                  # Procedural Web Audio API synthesizer + window.__AUDIO_LOG__ telemetry
│   ├── ui/
│   │   ├── SpriteForge.js                  # Procedural multi-layered SVG icon & 8-wave Boss portrait forge (zero raw OS emojis)
│   │   ├── VFXCanvas.js                    # HiDPI 2D Canvas overlay: Bézier devour arcs, comet projectiles, explosions, 5s plasma laser, crit popups, shake
│   │   ├── HUDController.js                # 5-factor Balatro scoreboard (Chips × Line × Devour × Chain × Greed = Total) + Relic medallions
│   │   ├── RelicDraftBanner.js             # Non-blocking Wave Clear compound interest + 3-Card Relic Draft + Victory/Endless & Defeat UI
│   │   └── GDDViewer.js                    # Built-in GDD Library drawer/tab rendering docs/gdd/*.md with interactive "Launch Prototype" buttons
│   └── games/
│       ├── registry.js                     # Unified catalog & factory registry for all 5 game schemes
│       ├── devour-reels/                   # Scheme 1: 《吞噬转轮》(Devour Reels)
│       │   ├── config.js
│       │   ├── DevourReelsEngine.js
│       │   └── DevourReelsView.js
│       ├── revolver-dungeon/               # Scheme 2: 《左轮地牢》(Revolver Dungeon)
│       │   ├── config.js
│       │   ├── RevolverDungeonEngine.js
│       │   └── RevolverDungeonView.js
│       ├── jackpot-td/                     # Scheme 3: 《黄金矿工防线》(Jackpot TD)
│       │   ├── config.js
│       │   ├── JackpotTDEngine.js
│       │   └── JackpotTDView.js
│       ├── sigil-pachinko/                 # Scheme 4: 《咒印弹珠台》(Sigil Pachinko)
│       │   ├── config.js
│       │   ├── SigilPachinkoEngine.js
│       │   └── SigilPachinkoView.js
│       └── abyssal-grid/                   # Scheme 5: 《深渊矩阵：推运战棋》(Abyssal Grid)
│           ├── config.js
│           ├── AbyssalGridEngine.js
│           └── AbyssalGridView.js
├── scripts/
│   ├── serve.js                            # Zero-dependency Node HTTP static server (configurable port, clean MIME types)
│   └── verify-e2e.js                       # Headless Chromium runner executing full E2E verification suite (Tiers 1–6)
└── tests/
    ├── unit/                               # Unit & integration tests per module (run via node --test)
    │   ├── core-and-gdd.test.js
    │   ├── devour-reels.test.js
    │   ├── revolver-dungeon.test.js
    │   ├── jackpot-td.test.js
    │   ├── explorations-and-hub.test.js
    │   └── tier5-adversarial.test.js
    └── e2e/                                # Opaque-box & white-box adversarial E2E test suite (Tiers 1–6)
        ├── helpers/
        │   └── e2e-harness.js
        ├── tier1-feature-coverage.test.js
        ├── tier2-boundary-corner.test.js
        ├── tier3-cross-feature.test.js
        ├── tier4-real-world-scenarios.test.js
        ├── tier5-adversarial-hardening.test.js
        └── tier6-visual-gameplay-polish.test.js
```

---

## Feature Inventory

Every Survey feature is assigned a milestone (none unassigned).

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `F-GDD-01` Master & Iron Laws GDD Suite | Comprehensive Chinese GDDs (`docs/gdd/00-master-design-philosophy.md` through `05-explorations-pachinko-grid.md`) detailing Slotbound's core contradiction, the 3 Minimalist Formulas, 3 Iron Laws, all 5 game schemes, math tables, and directory layout. | M1 | survey |
| 2 | `F-CORE-01` Deterministic Seeded PRNG | Seedable Mulberry32 PRNG (`src/core/PRNG.js`) supporting `next()`, `nextInt(min, max)`, `pickWeighted(items)`, `shuffle(arr)`, and state inspection for 100% reproducible spins and E2E tests. | M1 | survey |
| 3 | `F-CORE-02` Exponential Number & Balatro Scoring Engine | Multiplicative damage engine (`src/core/BigNumber.js`, `src/core/ScoreFormula.js`): `TotalDamage = floor(BasePoints * LineMultiplier * DevourStacksMultiplier * ChainSynergyMultiplier * GreedMultiplier)` scaling from `~10^2` (Wave 1) to `10^8+` (Wave 8) with formatted notation (`K`, `M`, `B`, `T`, `万`, `亿`) and shake intensity tiers `0..4`. | M1 | survey |
| 4 | `F-CORE-03` Risk & Greed Economy Engine | Balatro-style wave pull countdown (`5` pulls/wave), unused pulls $U$ conversion into Compound Interest Gold + permanent $1.35^U$ Greed Multiplier stacks, and post-wave 3-pick Relic/Mutation drafting (`src/core/EconomyEngine.js`). | M1 | survey |
| 5 | `F-CORE-04` 15-Second Flow & EventBus | Sub-second (`<1000ms`) Auto-Devour settlement tracker, `10-15s` single-turn cycle monitor, `2.5x` turbo fast-forward on repeated `Space`, and synchronous/async `EventBus.js` (`src/core/FlowTracker.js`, `src/core/EventBus.js`). | M1 | survey |
| 6 | `F-AUDIO-01` Procedural Web Audio Synthesizer | Zero-asset `SoundEngine.js` (`src/audio/SoundEngine.js`) synthesizing: (1) mechanical reel-stop clack, (2) dual-layer organic devour crunch, (3) ascending pitch combo chimes ($f = 523.25 \times 2^{\text{step}/12}\text{ Hz}$), plus explosions, gunshots, and 5s laser hums, pushing structured telemetry to `window.__AUDIO_LOG__`. | M1 | survey |
| 7 | `F-UI-01` Shared 2D VFX Canvas, Score HUD & GDD Reader | `VFXCanvas.js` (projectiles, devour suction trails, floating damage numbers, laser sweeps, screen shake), `HUDController.js` (Balatro-style `Base × Line Mult × Devour Stacks = Total Damage` live banner), and `GDDViewer.js` (`src/ui/`). | M1 | survey |
| 8 | `F-S1-01` Scheme 1 Core: 3×3 Grid & Central Abyssal Maw | 《吞噬转轮》(Devour Reels) (`src/games/devour-reels/`): 3×3 slot grid feeding a central Abyssal Maw (`深渊巨口`), 8-line payline evaluator, and 9 distinct symbols across 4 tiers (`goblin`, `chest`, `powder_keg`, `curse_skull`, `iron_knight`, `fireball`, `hero_berserker`, `digestive_herb`, `abyss_apostle`). | M2 | survey |
| 9 | `F-S1-02` Scheme 1 Auto-Devour & 5 Stomach Chain Reactions | Automatic 8-way adjacency predation on reel stop (`<1000ms` settlement) + 5 chain reactions: `Fireball + Powder Keg` (internal chain detonation & full-screen flame breath), `3× Iron Knights` (heavy armor + thorns spike volley), `Hero Banquet`, `Curse Transmutation`, and `Full-Board Gluttony`. | M2 | survey |
| 10 | `F-S1-03` Scheme 1 Indigestion Meter, Probability Modder & 8 Bosses | `0..100` Indigestion gauge (`消化不良槽`) with Bile Eruption overload/purge mechanics, interactive Wheel Probability Modder (`%` weight boost/banish + 3 build presets: Pyro Chain, Iron Fortress, Gluttony Feast), and 8 Siege Bosses scaling from `120 HP` to `85,000,000 HP`. | M2 | survey |
| 11 | `F-S2-01` Scheme 2 Core: 6-Chamber Revolver & 2-Button Loop | 《左轮地牢》(Revolver Dungeon) (`src/games/revolver-dungeon/`): 6-chamber circular cylinder (`Chambers 0..5`) with strict 2-button ergonomics: `[旋转弹巢并开火 / Spin & Fire (Space)]` and `[塞入新子弹 / Load New Bullet (R)]` across an 8-floor fast 15-second dungeon climb. | M2 | survey |
| 12 | `F-S2-02` Scheme 2 Bullet Roster, Parasite Devour & Full Cylinder Dump | 9 bullet types (`empty`, `lead_bullet`, `vampire_bullet`, `scatter_bullet`, `parasite_bullet`, `powder_charge`, `fuse_cord`, `heavy_hammer`, `demon_bullet`), `Parasite Bullet` automatic circular neighbor devour (`×2.0` damage per bullet eaten), and `Powder + Fuse + Heavy Hammer` sequence chain triggering instant 6-chamber Full Cylinder Dump (`连发清空整个弹巢`). | M2 | survey |
| 13 | `F-S2-03` Scheme 2 Russian Roulette Demon Bullet & Grit | High-multiplier `Demon Bullet` (`×8.0` mult with `25%` backfire self-damage risk & Blood Rage bonus), `Lone Bullet Roulette` empty-chamber multiplier bonus, and live Russian Roulette odds HUD (`Hit %`, `Chain %`, `Backfire Risk %`). | M2 | survey |
| 14 | `F-S3-01` Scheme 3 Core: 1×5 Slot Turret Wall & Real-Time March | 《黄金矿工防线》(Jackpot TD) (`src/games/jackpot-td/`): 1×5 single-line slot barrier across the monster lane, continuous real-time monster wave march (`step(dtMs)` with Gob-Runners, Shieldbearers, Tunnel Berserkers, and Siege Dreadnought Bosses), and instant Gold lever refresh + synchronized burst volley. | M3 | survey |
| 15 | `F-S3-02` Scheme 3 Yahtzee Hand Evaluator & Clutch Ultimates | 1×5 Yahtzee/Poker combo engine: `One Pair` / `Two Pair` automatic merge into `★★ 2-Star` towers, `Three of a Kind` (`三连冰冻` 4s screen-wide freeze clutch save + `★★★` merge), `Full House`, `Small/Large Straight` (`顺子` 5-second continuous screen-wiping Hyper Laser Sweep `长达5秒的狂暴激光洗地`), `Four of a Kind`, and `Five of a Kind / Yahtzee` (`五连核弹` Tactical Nuke + 5s Hyper Laser Sweep) + pedestal Auto-Devour stacks. | M3 | survey |
| 16 | `F-S3-03` Scheme 3 Real-Time Greed Interest & Red-Zone Adrenaline | Real-time `+20%` compound Gold interest ticker & Greed Streak Multiplier while resisting lever pulls vs frantic rapid-fire lever mashing when monsters enter the Critical Red Zone (`y >= 0.72`, boosting clutch hand odds by `+35%`). | M3 | survey |
| 17 | `F-S4-01` Scheme 4 Exploration: 《咒印弹珠台》(Sigil Pachinko) | Exploratory Gameplay Prototype A (`src/games/sigil-pachinko/`): 1×3 top Alchemical Orb Spawner + 24-Peg Elemental Cascade Arena + mid-air collision Auto-Devour (`<1s` orb fusion) + ascending peg bounce chimes + bottom 5 Multiplier Crucibles (`×2 / ×5 / ×25 JACKPOT`) + Chaos Tilt nudge mechanic. | M3 | survey |
| 18 | `F-S5-01` Scheme 5 Exploration: 《深渊矩阵》(Abyssal Grid) | Exploratory Gameplay Prototype B (`src/games/abyssal-grid/`): 4×4 Tactical Hold-&-Respin Matrix where Apex Commanders auto-lock (`🔒 HOLD`) and devour orthogonal fodder neighbors on every respin to complete 10-line Row/Col/Diag Bingo artillery barrages. | M3 | survey |
| 19 | `F-HUB-01` Unified Arcade Hub, Live GDD Viewer, Audio Lab & Test Bridge | `index.html`, `src/main.js`, `src/games/registry.js`, and `scripts/serve.js`: Persistent top switcher for all 5 schemes + In-App Live GDD Reader + Audio & Math Soundboard + Sandbox Toolbar (seed/combo injection) + unified deterministic E2E telemetry bridge (`window.__SLOTBOUND__` & `window.__SLOTBOUND_TEST__`). | M3 | survey |
| 20 | `F-R2-01` Obsidian, Brushed Brass & Crimson Felt `100vh` Design System & `SpriteForge` SVG Art | Replace purple-dashboard clichés & raw OS emojis with tactile Casino-Dungeon theme (`index.html`, `src/styles/main.css`, `src/styles/animations.css`) fitting `100vh` (`1440×900` desktop & `390×844` mobile) with complete styles for all 5 schemes, plus `src/ui/SpriteForge.js` multi-layered procedural SVG icons & 8-wave Boss portraits (`MockElement`-safe self-closing SVG tags). | M5 | r2_survey |
| 21 | `F-R2-02` HiDPI `VFXCanvas`, 5-Factor `HUDController`, `RelicDraftBanner` & Master-Compressed `SoundEngine` | Upgrade `VFXCanvas.js` (`resolveAnchor`, Bézier devour suction arcs, comet projectiles, plasma laser, crit popups, `T5-06` spy-safe), `HUDController.js` (all 5 factors: `Chips × Line × Devour × Chain × Greed = Total` + Relic medallions + localized synergies), `src/ui/RelicDraftBanner.js` (non-blocking Wave Clear interest + 3-Card Relic Draft + Victory/Endless & Defeat UI), `SoundEngine.js` (`DynamicsCompressorNode`, procedural noise transients, `55ms` chime micro-arpeggiator, `T5-05` spy-safe), and `README.md`/GDDs with public GitHub Pages link. | M5 | r2_survey |
| 22 | `F-R2-03` Scheme 1 (`devour-reels`) R2 Visual & Gameplay Overhaul | 3-column `100vh` cockpit + on-stage SVG Siege Boss & animated Abyssal Maw, `<800ms` staggered reel-spin -> predator-lunge-bite -> Boss HP chunking choreography, Gold-backed Wheel Modding & Maw Upgrade Workshop, active `[R] Belch Bile Purge` (`indigestion >= 50`), real Boss traits & `mawArmor` hit absorption on Overtime, and wired 3-Card Relic Draft + Victory/Endless/Defeat. | M6 | r2_survey |
| 23 | `F-R2-04` Scheme 2 (`revolver-dungeon`) R2 Visual & Gameplay Overhaul | True radial `60°` circular 6-chamber rotating drum (`cos/sin` around brass spindle + top `12 o'clock` hammer reticle), 3-Bullet Tactical Ammo Belt shop + Click-any-Chamber (`#0..#5`) targeted loading, smoking casings & muzzle flash choreography, active Boss traits & Overtime/dry-click counter-attacks, and wired 3-Card Relic Draft + Victory/Endless/Defeat. | M6 | r2_survey |
| 24 | `F-R2-05` Scheme 3 (`jackpot-td`) R2 Real-Time Loop, Visual Lane & Tactical Hold Overhaul | Positioned Canyon Siege Lane with marching SVG enemies that take real individual damage & die for Gold (fixing `Math.max(1, ...)` bug), continuous turret auto-fire (`shotsPerSec`), clickable Pedestal `🔒 HOLD` (`up to 2` towers), Overheated Scrap Pull penalty when `gold < pullCost`, distinct Freeze/Laser/Nuke visuals, and non-destructive 60fps `syncRealtimeDOM(state)`. | M7 | r2_survey |
| 25 | `F-R2-06` Scheme 4 (`sigil-pachinko`) & Scheme 5 (`abyssal-grid`) R2 Physics, Grid & Tactical Overhaul | Scheme 4: Styled `2D` 24-peg arena, deterministic 60fps pinball bounce & mid-air fusion trajectory replayed smoothly in browser (fixing `0ms` `step(500)` teleport while keeping `crucible-hit` instant), Launch Aim control (`◀/居中/▶`), and `35G` Sigil Peg Upgrade. Scheme 5: Fixed `4×4` `.abyssal-matrix-grid` tactical board, clickable cell `🔒 HOLD` toggling, fixed non-lethal `[R]` wave-clear exploit, SVG Bingo sightlines, and wave-transition Commander Ascension merge. | M7 | r2_survey |
| 26 | `F-R2-07` Unified 60fps Browser `requestAnimationFrame` Runtime (`ArcadeHubController`) | Activate real-browser `rAF` loop in `src/main.js` (guarded for `SlotboundE2EMockBrowser`, `realtimePaused`, and `_manualSimMode` on programmatic `stepSimulation`/`forceGridOrCylinder`) driving `vfx.step(dt)` across all schemes and `activeEngine.step(dt)` + `syncRealtimeDOM()` on real-time/cascade schemes, plus collapsible Sandbox drawer. | M7 | r2_survey |
| 27 | `F-R2-08` Tier 6 Live Browser Visual/Gameplay E2E Suite & GitHub Pages (`origin main`) Deployment | Add `Tier 6` (`tests/e2e/tier6-visual-gameplay-polish.test.js`, `>=30` live Headless Chromium & integration checks for `100vh` fit, non-zero `#vfx-canvas` pixels, autonomous real-time TD march, radial/2D/4×4 geometry, Relic Draft, exploit fixes & zero 404s), clean untracked `Luca5702/`, pass 100% unit + Tiers 1–6 E2E + Whole-Project Audit, and commit & push to `origin main` updating `https://luca5702.github.io/slotbound-dopamine-lab/`. | M8 | r2_survey |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | **M1: GDD Suite, Shared Core Engine, Procedural Web Audio & Base UI** | Initial Round 1 core, audio, UI & GDD baseline (`F-GDD-01`, `F-CORE-01..04`, `F-AUDIO-01`, `F-UI-01`). | none | DONE (`R1 Gate PASS`) |
| 2 | **M2: Scheme 1 (《吞噬转轮》 Devour Reels) & Scheme 2 (《左轮地牢》 Revolver Dungeon)** | Initial Round 1 Scheme 1 & Scheme 2 engines, views & unit tests (`F-S1-01..03`, `F-S2-01..03`). | M1 | DONE (`R1 Gate PASS`) |
| 3 | **M3: Scheme 3 (《黄金矿工防线》 Jackpot TD), Schemes 4–5 Explorations & Unified Arcade Hub** | Initial Round 1 Schemes 3–5, Hub & unit tests (`F-S3-01..03`, `F-S4-01`, `F-S5-01`, `F-HUB-01`). | M1, M2 | DONE (`R1 Gate PASS`) |
| 4 | **M4: Round 1 Final Milestone — Tiers 1–5 E2E Pass & Hardening** | Round 1 `72/72` unit + `250/250` Tiers 1–5 E2E baseline. | M1..M3, E2E R1 | DONE (`R1 Gate PASS`) |
| 5 | **M5 (R2): Design System, `SpriteForge` SVG Art, HiDPI `VFXCanvas`, 5-Factor HUD, `RelicDraftBanner`, Master-Bus `SoundEngine` & Docs** | Overhaul `index.html`, `src/styles/{main.css,animations.css}`, `src/ui/{SpriteForge.js,VFXCanvas.js,HUDController.js,RelicDraftBanner.js,GDDViewer.js}`, `src/audio/SoundEngine.js`, `src/core/EconomyEngine.js`, `docs/gdd/*`, `README.md`, and `tests/unit/core-and-gdd.test.js`. (`F-R2-01`, `F-R2-02`) | none | DONE (`R2 Gate PASS`) |
| 6 | **M6 (R2): Scheme 1 (`devour-reels`) & Scheme 2 (`revolver-dungeon`) Visual, Choreography & Gameplay Overhaul** | Overhaul `src/games/devour-reels/*`, `src/games/revolver-dungeon/*`, `tests/unit/devour-reels.test.js`, and `tests/unit/revolver-dungeon.test.js` with `SpriteForge` Bosses/icons, `<800ms` spin/devour/shot choreography, Gold-backed wheel/ammo shops, active Bile Purge & chamber targeting, Boss traits/counter-attacks, and 3-Card Relic Draft. (`F-R2-03`, `F-R2-04`) | M5 | DONE (`R2 Gate PASS`) |
| 7 | **M7 (R2): Schemes 3–5 (`jackpot-td`, `sigil-pachinko`, `abyssal-grid`) & 60fps `ArcadeHubController` Overhaul** | Overhaul `src/games/jackpot-td/*`, `src/games/sigil-pachinko/*`, `src/games/abyssal-grid/*`, `src/main.js`, `src/games/registry.js`, `tests/unit/jackpot-td.test.js`, and `tests/unit/explorations-and-hub.test.js` with unified 60fps browser `rAF` loop, real-time TD auto-fire/minion kills/pedestal hold, 2D Pachinko bounce physics & aiming, `4×4` Matrix click-lock/ascension/exploit-fix, and 3-Card Relic Draft. (`F-R2-05`, `F-R2-06`, `F-R2-07`) | M5 | DONE (`R2 Gate PASS`) |
| 8 | **M8 (R2): Final Milestone — Tiers 1–6 Full E2E Pass, Live Browser Visual Inspection, Adversarial Hardening & GitHub Pages Push (`origin main`)** | Pass 100% of Unit + Tiers 1–6 E2E suites (`TEST_READY.md`), inspect live Headless Chromium screenshots (`1440×900` & `390×844`), run Phase 2 Challenger -> Worker -> Reviewer + Whole-Project Forensic Audit loop, clean untracked `Luca5702/` (and `.gitignore`), commit & push to `origin main`, and verify live `https://luca5702.github.io/slotbound-dopamine-lab/`. (`F-R2-08`) | M5, M6, M7, E2E Track R2 | DONE (`R2 Gate PASS`) |

*(Note: **E2E Testing Track R2** (`sub_orch_r2_e2e_gen1` `8c620ac610a60c782d3d34fce977a934` — **`DONE (R2 Gate PASS)`**) completed `TEST_INFRA.md`, `tests/e2e/helpers/e2e-harness.js`, `scripts/verify-e2e.js`, `tests/e2e/tier6-visual-gameplay-polish.test.js` (`35` live visual/choreography/real-time/geometry E2E tests `T6-01`..`T6-35`), and published updated `TEST_READY.md` (`285` total cases across Tiers 1–6).)*

---

## Interface Contracts

### 1. `src/core/` ↔ `src/games/*` (Pure Engine & Scoring Contracts)

```js
// src/core/PRNG.js
export function createPRNG(seed = 12345) {
  // Returns { next(): number, nextInt(min, max): number, pickWeighted(items): any, shuffle(arr): any[], getState(): number, setSeed(seed): void }
}

// src/core/BigNumber.js
export function formatBigNumber(value) // e.g., 950 -> "950", 14200 -> "14.2K", 85000000 -> "85.0M"
export function formatChineseNumber(value) // e.g., "8500.0万", "1.72亿"

// src/core/ScoreFormula.js
export function calculateSpinDamage({
  basePoints,
  lineMultiplier = 1,
  devourStacks = 0,
  devourStacksMultiplier = null, // If null, computed from devourStacks: (1 + 0.6 * devourStacks) * Math.pow(1.25, devourStacks)
  chainSynergyMultiplier = 1,
  greedMultiplier = 1,
}) {
  // Returns {
  //   basePoints, lineMultiplier, devourStacks, devourStacksMultiplier,
  //   chainSynergyMultiplier, greedMultiplier, totalDamage, formattedDamage, intensityTier (0..4)
  // }
}

// src/core/EconomyEngine.js
export function settleWaveClear(economyState, unusedPulls) {
  // Applies compound interest on unusedPulls (U):
  // interestGold = floor((gold + baseWaveGold * (1 + 0.25 * U)) * (Math.pow(1.25, U) - 1)) + 15 * U
  // greedMultiplier *= Math.pow(1.35, U)
  // Returns updated state + settlement breakdown
}
```

### 2. `src/audio/SoundEngine.js` (Procedural Web Audio & Telemetry Contract)

```js
export class SoundEngine {
  constructor() // Initializes window.__AUDIO_LOG__ = [] if in browser, plus internal ring buffer
  setMuted(muted)
  playReelClack(reelIndex = 0, totalReels = 3)      // logs { type: 'clack', reelIndex, frequencyHz, timestamp }
  playDevourCrunch(devourStep = 1, tier = 2)        // logs { type: 'crunch', devourStep, tier, frequencyHz, timestamp }
  playComboChime(comboStep = 0)                     // frequencyHz = 523.25 * Math.pow(2, Math.min(comboStep, 24) / 12); logs { type: 'chime', comboStep, frequencyHz, timestamp }
  playChainExplosion(intensity = 1)                 // logs { type: 'explosion', intensity, frequencyHz, timestamp }
  playGunshot(isHeavy = false)                      // logs { type: 'gunshot', isHeavy, frequencyHz, timestamp }
  playLaserSweep(durationMs = 5000)                 // logs { type: 'laser', durationMs, frequencyHz, timestamp }
  playMisfireBackfire()                             // logs { type: 'backfire', frequencyHz, timestamp }
  getAudioLog()                                     // Returns array of logged audio events (also mirrored on window.__AUDIO_LOG__)
  clearAudioLog()
}
```

### 3. `src/games/*` ↔ `src/main.js` (Standardized Game Module & View Contract)

Every game module in `src/games/<scheme-id>/` must export an `*Engine` class and a `*View` class:

```js
export class GameEngine {
  id; // 'devour-reels' | 'revolver-dungeon' | 'jackpot-td' | 'sigil-pachinko' | 'abyssal-grid'
  getState(); // Serializable state snapshot conforming to window.__SLOTBOUND__.getState()
  performPrimaryAction(payload); // Spacebar / Main Action (Spin & Devour / Spin & Fire / Pull Lever / Drop Orbs / Spin Matrix)
  performSecondaryAction(payload); // Secondary Action (Mod Probability / Load New Bullet / Toggle Tilt / Lock Cell)
  step(dtMs); // Advances real-time simulation (enemies in Jackpot TD, orbs in Sigil Pachinko, timers)
  setSeed(seed);
  forceState(forcedConfig); // Supports forceGridOrCylinder / forceNextSpin for deterministic E2E testing
  reset(options);
}

export class GameView {
  mount(containerEl, sharedServices); // sharedServices: { sound, vfx, hud, bus }
  unmount();
  render();
  onKeyDown(event); // Spacebar triggers primary action or 2.5x fast-forward; R / 1 / 2 / 3 trigger secondary/draft actions
}
```

### 4. Global Browser E2E & Telemetry Bridges (`window.__SLOTBOUND__` & `window.__SLOTBOUND_TEST__`)

To support both E2E test conventions discovered during the survey (`window.__SLOTBOUND__` and `window.__SLOTBOUND_TEST__`, aliased to the same unified bridge controller on `window`, plus `window.__AUDIO_LOG__`):

```js
window.__SLOTBOUND__ = window.__SLOTBOUND_TEST__ = {
  getActiveScheme(), // 'devour-reels' | 'revolver-dungeon' | 'jackpot-td' | 'sigil-pachinko' | 'abyssal-grid' | 'gdd' | 'audio-lab'
  switchScheme(schemeId),
  resetGame(options),
  setSeed(seed),
  forceNextSpin(idsOrMatrix),
  forceGridOrCylinder(idsOrMatrix), // Alias for forceNextSpin
  pauseRealtimeLoop(),
  resumeRealtimeLoop(),
  stepSimulation(dtMs, steps = 1),
  triggerPrimaryAction(payload),
  triggerSecondaryAction(payload),
  getAudioLog(),
  getState() // Returns unified snapshot including:
  // {
  //   schemeId, seed, wave, gold, interestRate, greedMultiplier,
  //   pullsRemaining, pullsUsed, playerHp, enemyHp, enemyMaxHp,
  //   activeEnemiesCount, closestEnemyProgress,
  //   lastTurnBreakdown / lastFormula: {
  //     basePoints, baseChips, lineMultiplier, lineMult, devourStacks,
  //     devourStacksMultiplier, chainSynergyMultiplier, greedMultiplier,
  //     totalDamage, settlementDurationMs, comboName, triggeredSynergies
  //   },
  //   // Scheme-specific fields:
  //   indigestion, mawArmor, wheelProbabilities, grid,
  //   activeChamberIndex, chambers, backfireRisk,
  //   pedestals, activeEffects,
  //   orbs, pegs, crucibles,
  //   matrix, lockedCells, bingoLines,
  //   audioEvents
  // }
};
```

### 5. Required DOM `data-testid` Attributes

- **Navigation & Global Shell**:
  - `data-testid="nav-scheme-1"` (`吞噬转轮 Devour Reels`)
  - `data-testid="nav-scheme-2"` (`左轮地牢 Revolver Dungeon`)
  - `data-testid="nav-scheme-3"` (`黄金矿工防线 Jackpot TD`)
  - `data-testid="nav-scheme-4"` (`咒印弹珠台 Sigil Pachinko`)
  - `data-testid="nav-scheme-5"` (`深渊矩阵 Abyssal Grid`)
  - `data-testid="nav-gdd-viewer"` (`设计文档中心 GDD Viewer`)
  - `data-testid="nav-audio-lab"` (`音效与数值实验室 Audio Lab`)
- **Shared Balatro-Style HUD**:
  - `data-testid="hud-wave"`, `data-testid="hud-enemy-hp"`, `data-testid="hud-pulls-left"`, `data-testid="hud-gold"`
  - `data-testid="hud-base-chips"`, `data-testid="hud-line-mult"`, `data-testid="hud-devour-stacks"`, `data-testid="hud-total-damage"`, `data-testid="hud-combo-name"`, `data-testid="hud-formula-breakdown"`
- **Scheme 1 (`devour-reels`)**:
  - `data-testid="devour-grid"`, `data-testid="devour-cell-0"` .. `data-testid="devour-cell-8"`, `data-testid="abyssal-maw"`, `data-testid="indigestion-meter"`, `data-testid="btn-spin-devour"`, `data-testid="prob-mod-panel"`, `data-testid="prob-boost-fireball"`, `data-testid="prob-boost-powder_keg"`, `data-testid="prob-preset-pyro"`, `data-testid="prob-preset-iron"`, `data-testid="prob-preset-gluttony"`
- **Scheme 2 (`revolver-dungeon`)**:
  - `data-testid="revolver-cylinder"`, `data-testid="chamber-0"` .. `data-testid="chamber-5"`, `data-testid="btn-spin-fire"`, `data-testid="btn-load-bullet"`, `data-testid="player-hp-bar"`, `data-testid="roulette-risk-badge"`
- **Scheme 3 (`jackpot-td`)**:
  - `data-testid="td-lane-canvas"`, `data-testid="td-slot-bar"`, `data-testid="td-pedestal-0"` .. `data-testid="td-pedestal-4"`, `data-testid="btn-pull-lever"`, `data-testid="td-interest-ticker"`, `data-testid="td-base-hp"`, `data-testid="td-active-combo"`
- **Scheme 4 (`sigil-pachinko`)**:
  - `data-testid="pachinko-board"`, `data-testid="pachinko-spawner"`, `data-testid="btn-drop-orbs"`, `data-testid="btn-chaos-tilt"`, `data-testid="pachinko-crucible-0"` .. `data-testid="pachinko-crucible-4"`
- **Scheme 5 (`abyssal-grid`)**:
  - `data-testid="abyssal-matrix"`, `data-testid="matrix-cell-0"` .. `data-testid="matrix-cell-15"`, `data-testid="btn-matrix-spin"`, `data-testid="btn-matrix-fire"`
- **GDD Viewer, Audio Lab & Sandbox**:
  - `data-testid="gdd-viewer-panel"`, `data-testid="gdd-doc-selector"`, `data-testid="gdd-content-body"`
  - `data-testid="audio-mute-toggle"`, `data-testid="audio-test-clunk"`, `data-testid="audio-test-devour"`, `data-testid="audio-test-chime"`, `data-testid="audio-last-event"`
  - `data-testid="sandbox-toolbar"`, `data-testid="sandbox-seed-input"`, `data-testid="sandbox-trigger-jackpot"`

### 6. Round 2 Visual, Choreography, Progression & Test-Safety Contracts

#### 6.1 `src/ui/SpriteForge.js` (Zero-Emoji Procedural Multi-Layered SVG Artwork)
```js
export function renderSprite(id, options = {})
// options: { size = 48, tier = 1, className = '' }
// Returns inline '<svg viewBox="0 0 64 64" ...>...</svg>' covering:
// - Scheme 1: 'goblin', 'chest', 'powder_keg', 'curse_skull', 'iron_knight', 'fireball', 'digestive_herb', 'hero_berserker', 'abyss_apostle', 'abyssal_maw'
// - Scheme 2: 'empty', 'lead_bullet', 'vampire_bullet', 'scatter_bullet', 'parasite_bullet', 'powder_charge', 'fuse_cord', 'heavy_hammer', 'demon_bullet', 'revolver_spindle'
// - Scheme 3: 'miner_pick', 'gold_nugget', 'cryo_prism', 'tesla_coil', 'prism_laser', 'nuke_core', 'gob_runner', 'shield_bearer', 'tunnel_berserker', 'siege_dreadnought'
// - Scheme 4: all orb IDs, 'peg_ember' / 'ember', 'peg_volt' / 'volt', 'peg_gold' / 'gold', 'peg_glutton' / 'glutton', 'crucible' (plus deterministic hash fallback for any unknown ID)
// - Scheme 5: 'skeleton_pawn', 'imp_scout', 'mimic_chest', 'cursed_urn', 'abyssal_knight', 'blood_archmage', 'soul_cannon', 'void_reaper', 'golden_overlord' (plus deterministic fallback)
// - Relics: 'greed_ledger', 'gluttony_jaw', 'acid_reflux_core', 'pyro_catalyst', 'russian_roulette_coin', 'compound_vault', 'chronos_lever', 'abyssal_crown'

export function renderBossPortrait(boss = {}, options = {})
// options: { wave = 1, schemeId = 'devour-reels', size = 96 }
// Returns multi-layered illustrated '<svg viewBox="0 0 120 120" data-testid="boss-portrait-svg" ...>...</svg>'
```
- **STRICT `MockElement` SVG Rules (`tests/e2e/helpers/e2e-harness.js:931`)**:
  1. Every childless SVG element (`<path ... />`, `<circle ... />`, `<rect ... />`, `<polygon ... />`, `<line ... />`, `<ellipse ... />`, `<polyline ... />`, `<stop ... />`) **MUST** end with explicit `/>` or a matching closing tag.
  2. Never render `<text>` inside `<svg>` (so `MockElement.textContent` on cards stays clean).
  3. Never place a literal `>` character inside any HTML/SVG attribute value (use `→` or `≥` or `&gt;`).

#### 6.2 `src/ui/RelicDraftBanner.js` & Non-Blocking Post-Wave Progression Contract
```js
export function renderRelicDraftHTML(state, options = {})
// Renders non-blocking HTML when state has:
// - state.pendingRelicDraft (array of up to 3 relic objects { id, name, description }): renders data-testid="relic-draft-banner" with [data-testid="relic-pick-0..2"][data-relic-id="..."] and compound interest summary
// - state.victory === true && !state.endlessMode: renders data-testid="run-victory-banner" with [data-testid="btn-endless-mode"] and [data-testid="btn-new-run"]
// - state.gameOver === true (playerHp <= 0 on Overtime/backfire/leak): renders data-testid="run-defeat-banner" with [data-testid="btn-retry-run"]

export function bindRelicDraftEvents(containerEl, callbacks = {})
// callbacks: { onPickRelic(relicId), onEnterEndless(), onResetRun() }
```
- **Non-Blocking Auto-Advance Rule**: Primary action buttons (`btn-spin-devour`, `btn-spin-fire`, `btn-pull-lever`, `btn-drop-orbs`, `btn-matrix-spin`) MUST remain enabled even when `pendingRelicDraft` is visible. If `engine.performPrimaryAction()` is called while `pendingRelicDraft` is non-empty, the engine automatically applies `pendingRelicDraft[0]` (`applyRelic`) and clears `pendingRelicDraft` before running the spin, so automated multi-wave E2E loops (`T4-02..08`, `T5-28..30`) never block. Engines also handle `performSecondaryAction({ action: 'pick_relic', relicId })` and `performSecondaryAction({ action: 'enter_endless' })`.

#### 6.3 HiDPI `VFXCanvas`, 5-Factor `HUDController`, & Spy-Safe `SoundEngine`
- **`VFXCanvas.js`**: Adds `syncDimensions()` and `resolveAnchor(elOrSelector, fallbackX, fallbackY)` for real DOM-to-Canvas coordinate mapping. All Canvas2D methods beyond `{ clearRect, save, restore, translate, beginPath, moveTo, lineTo, stroke, arc, fill, fillText }` **MUST** use optional chaining (`typeof ctx.createRadialGradient === 'function'`, `ctx.quadraticCurveTo?.(...)`, `ctx.closePath?.()`) with fallback to `moveTo`/`lineTo`/`arc`/`stroke`/`fill` so `T5-06` passes 100%.
- **`HUDController.js`**: Displays all 5 multiplicative factors (`hud-base-chips`, `hud-line-mult`, `hud-devour-stacks`, `hud-chain-mult`, `hud-greed-mult`, `hud-total-damage` carrying `data-intensity-tier="${0..4}"`), owned Relic badges (`hud-relic-strip`), and localized Chinese synergy titles (never raw snake_case IDs like `fireball_powder_keg`).
- **`SoundEngine.js`**: Routes synth voices through a master `DynamicsCompressorNode` (feature-detected via `typeof ctx.createDynamicsCompressor === 'function'` so `T5-05` `SpyAudioContext` never throws), layers procedural white/pink noise buffers on clacks/crunches/gunshots/explosions, and micro-arpeggiates rapid `playComboChime` Web Audio `startTime`s by `55ms` while still recording exact synchronous `window.__AUDIO_LOG__` entries with unchanged `frequencyHz` formulas.

#### 6.4 Live Browser 60fps `requestAnimationFrame` Loop & Geometry Requirements
- **`ArcadeHubController` (`src/main.js`)**: Starts a unified `requestAnimationFrame` loop ONLY in real browsers (`typeof win?.requestAnimationFrame === 'function' && win?.navigator?.userAgent !== 'SlotboundE2EMockBrowser'`), calling `vfx.step(dt)` every frame across all schemes and stepping `activeEngine.step(dt)` + `activeView.syncRealtimeDOM?.(state)` when `!realtimePaused && !_manualSimMode` on real-time/cascade schemes (`jackpot-td`, active `sigil-pachinko` cascade). Calling `stepSimulation()` or `forceGridOrCylinder()` sets `_manualSimMode = true` (cleared on `resumeRealtimeLoop()`, `switchScheme()`, or trusted user pointer/key events `e.isTrusted === true`) to prevent `T5-28` timing races.
- **Viewport & Spatial Geometry (`1440×900` Desktop & `390×844` Mobile)**:
  - All 5 schemes render an on-stage `[data-testid="boss-arena-card"]` with `renderBossPortrait(...)` and dual-layer chunking HP bar, fitting cleanly within desktop `1440×900` (`scrollWidth <= clientWidth` on both desktop and mobile; primary CTA button `100%` visible above `y = 900` on desktop).
  - Scheme 2 `[data-testid="chamber-0..5"]` arranged radially at `60°` intervals around a circular drum (`6` distinct `(x, y)` coordinates, not a `2×3` rectangle).
  - Scheme 3 `.td-pedestal-card` preserves `.pedestal-star-{1..3}`, renders positioned `.td-enemy-token` SVG monsters marching inside `.td-battlefield-lane`, and updates via `syncRealtimeDOM(state)` without destroying `btn-pull-lever` mid-click.
  - Scheme 4 `.pachinko-arena-board` renders `24` positioned `.pachinko-peg` SVGs across 4 staggered rows + 5 horizontal `.pachinko-crucible` slots (preserving `.crucible-hit` immediately upon `performPrimaryAction`), animating falling `.pachinko-orb` trajectories over `~650ms` in browser instead of synchronous `step(500)`.
  - Scheme 5 `.abyssal-matrix-grid` renders a true `4×4` CSS Grid (`4` distinct X columns × `4` distinct Y rows), preserves `.matrix-cell-locked`, binds click-to-lock on `matrix-cell-0..15`, and fixes non-lethal `[R]` so `settleWaveClear` only runs when `enemyHp <= 0`.

