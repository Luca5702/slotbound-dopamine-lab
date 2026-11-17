# 把控“上头感”的三大视听与数值铁律 (Three Iron Laws of Flow, Exponential Math & Procedural Audio)

> **文档编号**：`GDD-01`  
> **所属模块**：核心数学模型、15秒心流控制与程序化音效合成规范 (`docs/gdd/01-iron-laws-math-and-audio.md`)  
> **代码映射**：`src/core/ScoreFormula.js`、`src/core/BigNumber.js`、`src/core/EconomyEngine.js`、`src/core/FlowTracker.js`、`src/audio/SoundEngine.js`

---

## 1. 铁律一：15秒心流法则 (`15-Second Flow Rule`)

> **设计铁律原文**：从按下拉杆、触发连锁吞噬、打出满屏暴击到拿奖励选遗物，整个单回合闭环严控在 **10 到 15 秒**以内，绝不让玩家的手从鼠标/空格键上移开。

### 1.1 单回合毫秒级时间预算表 (`FlowTracker.js`)
为了彻底消灭传统自走棋的等待垃圾时间，我们将单次拉杆及整波次闭环严格拆解为以下时间预算：

| 阶段代号 | 阶段名称 | 标准耗时 (`1.0x`) | 极速快进 (`2.5x Turbo`) | 关键视听反馈与约束 |
|----------|----------|-------------------|-------------------------|-------------------|
| **Phase 1** | **拉杆启动与高速滚轮 (`SPINNING`)** | `0ms – 350ms` | `0ms – 140ms` | 滚轮残影模糊，逐列停轮触发机械卡顿声 (`playReelClack`) |
| **Phase 2** | **零操作合成与连锁吞噬 (`SETTLING`)** | `350ms – 800ms` | `140ms – 320ms` | **铁律硬上限 `< 1000ms` (`1秒内完成结算`)**：高阶图案自动张嘴吞噬相邻低阶图案，播放 `playDevourCrunch` 与升调 `playComboChime` |
| **Phase 3** | **即时开火与暴击轰炸 (`COMBAT_VOLLEY`)** | `800ms – 1200ms` | `320ms – 480ms` | 盘面直接向 BOSS 倾泻弹幕/火焰/激光，跳出大号暴击数字并触发 `0..4` 阶屏幕震动 |
| **Phase 4** | **波次结算与三选一遗物 (`DRAFT_REWARD`)** | `1200ms – 3000ms` | 空格一键秒选 | 5次拉杆内完成击杀，单波总耗时严控在 **`10s – 15s`** 闭环内 (`MAX_TURN_CYCLE_MS = 15000`) |

### 1.2 单手空格键人体工学 (`Single-Key Spacebar Ergonomics`)
* **空闲就绪状态 (`IDLE_READY`)**：按 `Spacebar` 立即触发主操作（拉杆摇奖 / 旋转左轮开火 / 刷新防御塔 / 释放弹珠 / 矩阵重摇）。
* **动画播放状态 (`SPINNING` / `SETTLING`)**：再次按 `Spacebar` 立即激活 **`2.5x` 极速快进 (`TURBO_SPEED_MULTIPLIER = 2.5`)**，将所有吞噬与弹幕动画耗时压缩至 40%，且严格保证 `effectiveDurationMs < 1000ms`。
* **波次遗物三选一状态 (`DRAFT_REWARD`)**：按 `Spacebar` 直接确认推荐遗物并无缝进入下一波。

---

## 2. 铁律二：指数级数字膨胀 (`Exponential Number Inflation — Balatro Formula`)

> **设计铁律原文**：摒弃传统塔防“攻击力 +2”的保守数值。用“**基础点 × 连线倍率 × 吞噬层数**”的乘法公式（参考《Balatro》的筹码×倍率），让玩家在第 5 分钟就能体验到屏幕震动、数字突破天际的破格爽感。

### 2.1 核心多维乘法公式 (`src/core/ScoreFormula.js`)
所有五大游戏方案的每一次开火结算，均通过统一的指数级公式计算最终伤害：

$$\text{TotalDamage} = \left\lfloor \text{BasePoints} \times \text{LineMultiplier} \times \text{DevourStacksMultiplier} \times \text{ChainSynergyMultiplier} \times \text{GreedMultiplier} \right\rfloor$$

其中各独立乘区的数学定义如下：
1. **基础筹码点 ($\text{BasePoints}$ / `baseChips`)**：盘面所有存活图案的基础点数之和 + 被吞噬食材贡献的额外点数。
2. **连线/牌型倍率 ($\text{LineMultiplier}$ / `lineMult`)**：由三连线、快艇骰子牌型（对子、三连、顺子、五连核弹）或 Bingo 连线数提供的独立倍率。
3. **吞噬层数指数项 ($\text{DevourStacksMultiplier}$)**：设本回合吞噬食材层数为 $S$（`devourStacks`），累计吞噬进化层数为 $R$（`totalRunDevoured`），则：
   $$\text{DevourStacksMultiplier}(S, R) = (1 + 0.6 \times S) \times 1.25^S \times (1 + 0.15 \times R)$$
   * 当 $S = 0, R = 0$ 时，倍率为 $1.0\times$；
   * 当单回合吞噬 $S = 5$ 个低阶单位时，仅此一项即放大 $(1 + 3.0) \times 1.25^5 \approx 12.21\times$！
   * 当单回合触发满盘吞噬 $S = 8$ 时，放大 $(1 + 4.8) \times 1.25^8 \approx 34.57\times$！
4. **连锁反应倍率 ($\text{ChainSynergyMultiplier}$)**：特定配方触发的质变乘区（如《吞噬转轮》的“火球+炸药桶” $\times 8.0$、《左轮地牢》的“火药+引信+重锤”清空弹巢 $\times 12.0$）。
5. **赌狗贪婪复利倍率 ($\text{GreedMultiplier}$)**：由前序波次省下的拉杆数 $U$ 按 $1.35^U$ 永久累乘的全局倍率 + 遗物倍率。

### 2.2 5分钟 8波次指数级数值膨胀基准表 (`WAVE_PROGRESSION_TABLE`)

| 波次 (`Wave`) | 游戏累计时长 | 目标 BOSS 血量 (`targetBossHp`) | 典型基础点 (`BasePoints`) | 典型连线倍率 (`LineMult`) | 典型吞噬倍率 (`DevourMult`) | 连锁×贪婪乘区 (`Chain×Greed`) | 单发预期伤害 (`TotalDamage`) | 震动等级 (`Tier`) |
|---------------|--------------|---------------------------------|---------------------------|---------------------------|-----------------------------|-------------------------------|------------------------------|-------------------|
| **Wave 1** | `0:15` | `120 HP` | `20` | `×1.5` | `×2.0` | `×1.0` | `60 – 180` | Tier 0–1 |
| **Wave 2** | `0:45` | `650 HP` | `35` | `×2.5` | `×3.5` | `×1.5` | `459 – 1.2K` | Tier 1 |
| **Wave 3** | `1:15` | `3,800 HP` (`3.8K`) | `60` | `×4.0` | `×6.0` | `×2.5` | `3.6K – 8.5K` | Tier 1–2 |
| **Wave 4** | `1:50` | `25,000 HP` (`25.0K`) | `110` | `×6.5` | `×11.0` | `×4.0` | `31.4K – 75.0K` | Tier 2 |
| **Wave 5** | `2:30` | `180,000 HP` (`180.0K`) | `200` | `×10.0` | `×22.0` | `×6.5` | `286.0K – 650.0K` | Tier 3 |
| **Wave 6** | `3:15` | `1,500,000 HP` (`1.5M`) | `380` | `×15.0` | `×45.0` | `×10.0` | `2.56M – 6.2M` | Tier 3 |
| **Wave 7** | `4:00` | `12,000,000 HP` (`12.0M`) | `700` | `×22.0` | `×90.0` | `×15.0` | `20.7M – 48.0M` | Tier 4 |
| **Wave 8** | `4:45` | `85,000,000 HP` (`85.0M`) | `1,250` | `×32.0` | `×180.0` | `×24.0` | `172.8M+` (`1.72亿+`) | Tier 4 (满屏狂震) |

### 2.3 大数格式化与屏幕震动分级 (`src/core/BigNumber.js`)
* **国际缩写格式化 (`formatBigNumber`)**：
  * `< 1,000`：整数直显（如 `950 -> "950"`）
  * `1,000 .. 999,999`：`K`（如 `14200 -> "14.2K"`）
  * `1,000,000 .. 999,999,999`：`M`（如 `85000000 -> "85.0M"`）
  * `10^9 .. 10^12`：`B`；`10^12 .. 10^15`：`T`；`>= 10^15`：科学计数法（如 `"1.25e16"`）。
* **中文单位格式化 (`formatChineseNumber`)**：
  * `10^4 .. 10^8`：`万`（如 `85000000 -> "8500.0万"`）
  * `>= 10^8`：`亿`（如 `172000000 -> "1.72亿"`）。
* **屏幕震动分级 (`getIntensityTier(damage)`)**：
  * `Tier 0` (`< 100`)：无震动 (`0px`)
  * `Tier 1` (`100 .. 4,999`)：微震 (`3px`)
  * `Tier 2` (`5,000 .. 249,999`)：中震 (`7px`)
  * `Tier 3` (`250,000 .. 9,999,999`)：强震 (`14px`)
  * `Tier 4` (`>= 10,000,000`)：破天际狂震 (`24px` + 霓虹暴击闪光)。

---

## 3. 铁律三：重度听觉锚点 (`Heavy Auditory Anchors — Procedural Web Audio Spec`)

> **设计铁律原文**：**老虎机停轮的机械卡顿声**、**吞噬低阶单位时的清脆咀嚼声**、**达成连线时音调逐级升高的“叮—叮—叮—”**，这三套音效的爽脆程度直接决定了玩家能不能进入“无脑再来一局”的催眠状态。

### 3.1 零外部依赖 Web Audio API 实时合成器 (`src/audio/SoundEngine.js`)
为了保证加载零延迟与音高绝对精确，`SoundEngine.js` 使用原生 `AudioContext` 振荡器与滤波器实时合成全部 7 类核心音效，并将每一次触发同步记录至 `window.__AUDIO_LOG__` 遥测数组：

| 音效方法 | 日志类型 (`type`) | 物理声学合成模型 | 频率公式与关键参数 |
|----------|-------------------|------------------|--------------------|
| `playReelClack(reelIndex, totalReels)` | `'clack'` | **停轮机械卡顿声**：三角波低频机械顿挫 (`140Hz -> 45Hz`, `35ms`) + 带通滤波方波棘轮脉冲 (`Q = 6.0`) | $f = 950 + 120 \times \text{reelIndex}\text{ Hz}$ |
| `playDevourCrunch(devourStep, tier)` | `'crunch'` | **双层清脆咀嚼声**：Layer A 锯齿波骨甲碎裂扫频 (`2400Hz -> 420Hz`) + Layer B 正弦波咽下低频下潜 (`180Hz -> 55Hz`) | $f = 320 + 45 \times \text{step} + 30 \times \text{tier}\text{ Hz}$ |
| `playComboChime(comboStep)` | `'chime'` | **逐级升调“叮—叮—叮—”**：C5 基准三角波载波 + 二倍频正弦泛音叠加，按十二平均律半音阶指数爬升 | $f(\text{step}) = 523.25 \times 2^{\min(\text{step}, 24) / 12}\text{ Hz}$ |
| `playChainExplosion(intensity)` | `'explosion'` | **肚内连锁大爆炸**：超低频锯齿波下潜轰鸣 (`90Hz -> 22Hz`, `350ms`) | $f = 90 / \sqrt{\text{intensity}}\text{ Hz}$ |
| `playGunshot(isHeavy)` | `'gunshot'` | **左轮击发爆鸣**：瞬态高频击锤瞬变 + 低频火药喷发 (`280Hz/160Hz -> 38Hz`) | 普通弹 `280Hz` / 重锤弹 `160Hz` |
| `playLaserSweep(durationMs)` | `'laser'` | **5秒狂暴激光洗地**：调制锯齿波高频能量束扫频 (`440Hz -> 880Hz -> 660Hz`) | 中心频率 `880Hz`，默认持续 `5000ms` |
| `playMisfireBackfire()` | `'backfire'` | **恶魔弹炸膛警报**：不协和方波双音阶骤降 (`195Hz -> 110Hz`) | 告警基频 `110Hz` |

### 3.2 连线升调“叮—叮—叮—”十二平均律频率对照表
当单回合发生连续吞噬或连线时，`comboStep` 从 `0` 递增至 `24`（跨越整整两个八度 C5 -> C7）：
* `step = 0` (C5): `523.25 Hz`
* `step = 4` (E5): `659.26 Hz`
* `step = 7` (G5): `783.99 Hz`
* `step = 12` (C6, 高八度): `1046.50 Hz`
* `step = 19` (G6): `1567.98 Hz`
* `step = 24` (C7, 双八度封顶): `2093.00 Hz`

---

## 4. 极简赌狗经济与遗物构筑数学规范 (`src/core/EconomyEngine.js`)

### 4.1 省下拉杆复利与永久贪婪倍率公式 (`settleWaveClear`)
每波默认提供 `maxPullsPerWave = 5` 次拉杆机会。设击杀 BOSS 时剩余未使用的拉杆数为 $U = \text{pullsRemaining}$ ($0 \le U \le 5$)：

1. **复利金币结算 (`interestGold`)**：
   $$\text{interestGold} = \left\lfloor \left(\text{gold} + \text{baseWaveGold} \times (1 + 0.25 U)\right) \times \left(1.25^U - 1\right) \right\rfloor + 15 U$$
2. **永久贪婪倍率累乘 (`greedMultiplier`)**：
   $$\text{greedMultiplier}_{\text{new}} = \text{greedMultiplier}_{\text{old}} \times 1.35^U$$
3. **稀有遗物保底奖励 (`rareRelicGuaranteed`)**：
   当玩家一击或两击秒杀 BOSS（省下 $U \ge 2$ 次拉杆）时，波次结束后的三选一遗物必定保底出现至少 1 件 `rare` / `epic` / `mythic` 品质遗物！


### 4.2 波次通关三选一遗物图鉴表 (`DEFAULT_RELIC_CATALOG`)

每当玩家在限定拉杆数内击杀当前波次首领，不仅立即结算省下拉杆的复利金币与 $1.35^U$ 贪婪倍率，还会弹出以下 **8 件核心构筑遗物** 的三选一抽选界面：

| 遗物 ID (`id`) | 中文名称 | 稀有度 (`rarity`) | 核心词条与数值加成 (`effect`) | 适配流派 |
|----------------|----------|-------------------|-------------------------------|----------|
| `greed_ledger` | **贪婪账本 (Greed Ledger)** | `common` | 永久贪婪倍率 `×1.25`，每波基础通关赏金 `+25 Gold` | 全方案通用经济流 |
| `gluttony_jaw` | **暴食颚骨 (Gluttony Jaw)** | `common` | 每次触发零操作自动吞噬额外 `+1 DevourStack`，贪婪倍率 `×1.20` | 方案一/四/五暴食流 |
| `acid_reflux_core` | **胃酸狂暴核 (Acid Reflux Core)** | `rare` | 消化不良达到 `100%` 时免疫拉杆惩罚，酸液喷发进化为 `×15.0` 胃酸海啸 | 方案一极限过载流 |
| `pyro_catalyst` | **爆破催化剂 (Pyro Catalyst)** | `rare` | 火球与炸药桶轮盘权重各 `+15%`，连锁反应倍率额外 `×1.40` | 方案一火药爆破流 |
| `russian_roulette_coin` | **恶魔轮盘金币 (Demon Roulette Coin)** | `rare` | 空弹仓与恶魔弹额外提供 `×1.50` 赌命倍率，永久贪婪倍率 `×1.50` | 方案二俄罗斯轮盘流 |
| `compound_vault` | **复利金库 (Compound Vault)** | `epic` | 复利利率额外 `+10%`，立即获得 `+100 Gold`，贪婪倍率 `×1.30` | 方案三实时憋利息流 |
| `chronos_lever` | **时空拉杆 (Chronos Lever)** | `epic` | 每波最大拉杆次数上限 `+1`（大幅提高省下拉杆数 $U$ 的复利指数上限！） | 全方案极限秒杀流 |
| `abyssal_crown` | **深渊暴君王冠 (Abyssal Crown)** | `mythic` | 全局永久贪婪倍率直接乘以 `×1.75` | 后期破亿冲分核心 |

---

## 5. 第二轮视听编排与无尽膨胀升级规范 (`Round 2 Choreography, Master Audio Bus & Endless Math`)

### 5.1 `< 800ms` 四拍微秒级战斗视觉编排 (`4-Beat Sub-Second Combat Choreography`)
在坚守 `< 1000ms` 零操作结算硬上限与同步状态机契约的前提下，渲染层通过 CSS 关键帧 (`src/styles/animations.css`) 与 HiDPI `VFXCanvas.js` 将单次拉杆拆解为肉眼清晰可读的四拍节奏：
1. **第一拍 (`0–220ms`) · 滚轮急停与错峰机械落锁**：各列按 `60ms` 错峰播放 `.is-reel-stopping` 弹簧回弹与 `playReelClack` 黄铜棘轮声；
2. **第二拍 (`220–500ms`) · 捕食扑咬与二次贝塞尔吞噬弧**：捕食者向相邻食材突进 (`.is-predator-lunging`)，`VFXCanvas` 沿真实 DOM 坐标绘制二次贝塞尔曲线吸入流光与咬合冲击波环；
3. **第三拍 (`500–720ms`) · 彗尾齐射与首领顿帧受击 (`Hit-Stop`)**：弹幕拖带渐变彗尾轰向首领立绘 (`boss-portrait-svg`)，触发高光受击闪白 (`.is-hit-flash`) 与双层血条残影缓降 (`.boss-hp-burn-fill`)；
4. **第四拍 (`720–800ms`) · 五乘区记分牌翻牌跳字**：`HUDController` 同步点亮 `基础 × 连线 × 吞噬 × 连锁 × 贪婪 = 总伤` 五乘区筹码盒并弹出描边暴击飘字。

### 5.2 主母线防爆音动态压缩与 `55ms` 微琶音调度 (`Master Dynamics Bus & 55ms Micro-Arpeggiator`)
* **主母线链路**：所有合成声部统一接入 `MasterGain -> WaveShaper (tanh 软削波器) -> DynamicsCompressorNode (-10dB, 6:1) -> destination`，配合缓存复用的程序化白噪声/粉红噪声瞬态采样，彻底消除多段连锁爆炸时的数字削波杂音。
* **`55ms` 半音阶微琶音器**：当同一结算帧同步触发多次 `playComboChime(step)` 或 `playDevourCrunch` 时，`SoundEngine` 在保持 `window.__AUDIO_LOG__` 同步写入的同时，将底层 Web Audio 振荡器按 `55ms` 步进排入晶莹剔透的十二平均律上行琶音队列，并新增遗物拾取 (`playRelicPick`)、通关凯歌 (`playVictoryFanfare`) 与败北低音号角 (`playDefeatStinger`)。

### 5.3 Wave 9+ 无尽冲分模式指数血量公式 (`Endless Mode Scaling`)
击败第 8 波终极首领后，玩家可在胜利横幅中点击开启无尽模式 (`enterEndlessMode`)，后续波次首领血量按 `6.5` 倍指数攀升：

$$\text{EndlessBossHP}(w) = \left\lfloor \text{BaseWave8HP} \times 6.5^{(w - 8)} \right\rfloor \quad (w \ge 9)$$

