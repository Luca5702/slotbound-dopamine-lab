# 拓展玩法探索：《咒印弹珠台》(Sigil Pachinko) 与《深渊矩阵》(Abyssal Grid) 游戏设计文档

> **文档编号**：`GDD-05`  
> **所属模块**：方案四与方案五探索原型设计文档 (`docs/gdd/05-explorations-pachinko-grid.md`)  
> **代码映射**：`src/games/sigil-pachinko/*`、`src/games/abyssal-grid/*`、`src/main.js`

---

## 1. 拓展设计初衷：多维空间与推运机制的极简爽感延伸

为全面响应“**各种方案的都做，探索不同的玩法**”的设计目标，在验证了《吞噬转轮》（3×3 巨口养成）、《左轮地牢》（6发左轮轮盘）与《黄金矿工防线》（1×5 实时塔防）之后，我们进一步将“零操作合成 (`Auto-Devour`) + 即时开火 (`Slot-as-Combat`) + 极简赌狗经济 (`Risk & Greed`)”三大核心公式拓展至两个全新的空间维度：
* **方案四：《咒印弹珠台》(Sigil Pachinko)** —— 探索 **“柏青哥二维物理弹射 + 空中碰撞自动吞噬”** 的视觉连锁爽感；
* **方案五：《深渊矩阵：推运战棋》(Abyssal Grid)** —— 探索 **“4×4 Hold-&-Respin 自动锁格吞噬 + 10线 Bingo 矩阵齐射”** 的推运策略爽感。

---

## 2. 方案四：《咒印弹珠台》(Sigil Pachinko / Alchemical Cascade)

### 2.1 核心循环与盘面拓扑 (`src/games/sigil-pachinko/`)
* **顶部 `1×3` 炼金法球发射器 (`data-testid="pachinko-spawner"`)**：每次按下拉杆 (`data-testid="btn-drop-orbs"`)，顶部 3 个槽位同时摇出元素法球并受重力向下方钉板阵列坠落。
* **中部 `24` 枚元素咒印钉板阵列 (`data-testid="pachinko-board"`)**：分 4 行交错排列的 24 枚炼金咒印钉（火焰钉、雷电钉、黄金钉、暴食钉）。法球每次撞击咒印钉都会反弹充能，累加基础点 (`+BasePoints`) 并触发音调逐级升高的“叮—叮—叮—” (`playComboChime`)！
* **底部 `5` 口倍率坩埚 (`data-testid="pachinko-crucible-0"` .. `4`)**：
  * 坩埚 0（左翼）：`×2` 基础熔炉
  * 坩埚 1（次左）：`×5` 烈焰熔炉
  * **坩埚 2（正中大奖槽）：`×25 JACKPOT` 深渊核心熔炉**
  * 坩埚 3（次右）：`×5` 雷霆熔炉
  * 坩埚 4（右翼）：`×2` 基础熔炉

### 2.2 空中碰撞自动吞噬 (`Mid-Air Collision Auto-Devour`)
* **6 种炼金法球图鉴**：
  1. `ember_orb`（火苗珠, Tier 1, 15 pts）
  2. `gold_droplet`（金液珠, Tier 1, 12 pts, `+20 Gold`）
  3. `lightning_sphere`（雷光球, Tier 2, 40 pts）
  4. `void_glutton_orb`（虚空暴食球, Tier 3, 85 pts — 碰撞半径翻倍，吞噬一切低阶球）
  5. `philosopher_stone`（贤者之石, Tier 4, 180 pts — 顶级法球，每次碰撞吞噬提供 `+3 DevourStacks`）
  6. `volatile_mercury`（狂暴水银球, Tier 2, 55 pts — 撞钉分裂弹射）
* **零操作空中合体**：当两颗法球在下落弹跳途中距离小于碰撞阈值（`< 36px`）时，高阶法球在半空中**直接张嘴吃掉**低阶法球，球体体积膨胀、发光强度升级，并在 `< 1000ms` 内完成吞噬结算与弹幕齐射！

### 2.3 狂暴摇台博弈 (`Chaos Tilt` — `data-testid="btn-chaos-tilt"`)
* 玩家可以随时按下 **`[狂暴摇台 / Chaos Tilt (R)]`**：给全场法球施加指向正中央 `×25 JACKPOT` 坩埚的强力横向冲量，并赋予 `×2.0` 摇台赌徒倍率；但连续摇台超过 2 次会有 `20%` 概率触发“熔炉过载震荡”，完美还原街机弹珠台的推台刺激感。

---

## 3. 方案五：《深渊矩阵：推运战棋》(Abyssal Grid: Hold-&-Spin Tactical Bingo)

### 3.1 核心循环与 4×4 锁格战棋拓扑 (`src/games/abyssal-grid/`)
* **盘面结构**：`4×4` 十六格深渊战棋矩阵（`Cells 0..15`，绑定 `data-testid="abyssal-matrix"` 及 `data-testid="matrix-cell-0"` .. `15`）。
* **双按钮推运循环**：
  1. **`[矩阵重摇 / Hold & Respin (Space)]` (`data-testid="btn-matrix-spin"`)**：高阶统帅自动锁定 (`🔒 HOLD`)，仅重摇未锁定的格子刷新食材与新统帅；
  2. **`[立即结算开火 / Fire Barrage Now (R)]` (`data-testid="btn-matrix-fire"`)**：不等拉杆耗尽，立即触发当前矩阵的 `10线 Bingo` 毁灭齐射，并将剩余重摇次数 $U$ 全额转化为 $1.25^U$ 复利金币与 $1.35^U$ 贪婪倍率！

### 3.2 统帅自动锁格与十字正交吞噬 (`Auto-Locking Apex Commanders`)
* **8 种矩阵单位图鉴**：
  * **杂兵食材 (`Tier 1`, 不自动锁格)**：`skeleton_pawn`（骸骨卒, 15 pts）、`slime_blob`（史莱姆, 12 pts）、`mana_crystal`（魔力晶簇, 20 pts）、`gold_mimic`（宝箱怪, 18 pts, `+20 Gold`）。
  * **高阶统帅 (`Tier 2–4`, 摇出即自动 `🔒 HOLD` 锁格)**：
    * `abyssal_knight`（深渊黑骑, Tier 2, 45 pts）
    * `blood_archmage`（鲜血大魔导, Tier 3, 80 pts）
    * `soul_cannon`（噬魂巨炮, Tier 3, 95 pts）
    * `golden_overlord`（黄金霸主, Tier 4, 160 pts）
* **十字正交自动吞噬 (`Orthogonal Cross Auto-Devour`)**：
  每次重摇停下时，所有已锁定的高阶统帅 (`🔒 HOLD`) 自动向**上、下、左、右**四个正交方向张开深渊巨口，吃掉所有相邻的 Tier 1 杂兵食材：
  * 统帅自身直接叠加 `+DevourStacks` 与基础点数；
  * 被吃掉的杂兵格子瞬间清空解锁，在下一发重摇中继续刷出新食材或新统帅！

### 3.3 十线 Bingo 矩阵齐射倍率表 (`10-Line Bingo Artillery`)
矩阵共有 **4 条横线 + 4 条竖线 + 2 条对角线 = 10 条 Bingo 战线**。每有一条战线被非空统帅/单位填满，连线倍率呈指数级跃升：

| 达成 Bingo 线数 (`bingoLines.length`) | 战线称号 | 连线倍率 (`LineMultiplier`) | 齐射火力表现 |
|---------------------------------------|----------|-----------------------------|--------------|
| `0 线` | 散阵齐射 | `×1.0` | 各格子独立发射魔弹 |
| `1 线` | 单线集火 (`Single Bingo`) | `×3.5` | 集火光束贯穿 BOSS |
| `2 线` | 十字交叉火力 (`Cross Bingo`) | `×10.0` | 触发十字激光斩 |
| `3–4 线` | 矩阵歼灭网 (`Matrix Gridlock`) | `×35.0` | 多重能量炮轰炸 |
| `5–7 线` | 深渊天罗地网 (`Abyssal Dominance`) | `×120.0` | 触发 Tier 4 屏幕狂震 |
| `8–10 线 (满盘)` | **十线全通·深渊神罚 (`Full Matrix Blackout`)** | `×1000.0` | 全屏毁灭光柱秒杀一切 |

---

## 4. 统一街机大厅 (`Unified Arcade Hub`) 与全模式确定性测试桥接 (`window.__SLOTBOUND__`)

### 4.1 街机大厅全局导航与沙盒工具栏
`index.html` 与 `src/main.js` 将上述全部 5 款原型、内置设计文档中心 (`GDDViewer`) 与音效数值实验室 (`Audio Lab`) 整合在同一座霓虹暗黑街机机台内：
* **顶部模式切换栏**：`nav-scheme-1` .. `nav-scheme-5`、`nav-gdd-viewer`、`nav-audio-lab`；
* **底部沙盒调试工具栏 (`data-testid="sandbox-toolbar"`)**：支持实时输入确定性随机种子 (`data-testid="sandbox-seed-input"`) 与一键触发当前方案终极大奖 (`data-testid="sandbox-trigger-jackpot"`)。


### 4.2 方案四与方案五专属 DOM `data-testid` 与确定性测试接口规范

#### 方案四：《咒印弹珠台》(Sigil Pachinko) 测试锚点表
| `data-testid` 属性值 | 对应 UI 组件 | 交互行为与状态验证 |
|----------------------|--------------|--------------------|
| `pachinko-board` | 24枚元素咒印钉板与法球物理下落竞技场 | 渲染法球下落轨迹、钉板弹跳充能与空中碰撞自动吞噬 (`Auto-Devour`) |
| `pachinko-spawner` | 顶部 `1×3` 炼金法球发射器 | 显示本轮生成的 3 颗炼金法球类型与初始点数 |
| `btn-drop-orbs` | 主按钮 `[释放炼金法球 (Space)]` | 消耗 1 次拉杆释放法球进入钉板阵列并结算碰撞吞噬与坩埚倍率 |
| `btn-chaos-tilt` | 次按钮 `[狂暴摇台 Chaos Tilt (R)]` | 给下落法球施加指向中央 `×25 JACKPOT` 坩埚的推力并赋予摇台倍率 |
| `pachinko-crucible-0` .. `pachinko-crucible-4` | 底部 5 口炼金倍率坩埚 (`×2 / ×5 / ×25 / ×5 / ×2`) | 记录法球落入数量并结算对应坩埚连线倍率 |

#### 方案五：《深渊矩阵：推运战棋》(Abyssal Grid) 测试锚点表
| `data-testid` 属性值 | 对应 UI 组件 | 交互行为与状态验证 |
|----------------------|--------------|--------------------|
| `abyssal-matrix` | `4×4` 十六格推运战棋矩阵容器 | 包含 `matrix-cell-0` .. `matrix-cell-15` 及 10 条横/竖/斜 Bingo 指示线 |
| `matrix-cell-0` .. `matrix-cell-15` | 矩阵第 0~15 号战棋格 | 显示单位图标、阶位、是否已自动锁格 (`🔒 HOLD`) 及当前吞噬层数 |
| `btn-matrix-spin` | 主按钮 `[矩阵重摇 Hold & Respin (Space)]` | 保持已锁定的高阶统帅不动，重摇其余格子并立即触发十字正交自动吞噬 |
| `btn-matrix-fire` | 次按钮 `[立即结算开火 Fire Now (R)]` | 提前引爆当前矩阵的 `10线 Bingo` 齐射，将剩余重摇次数转化为贪婪复利 |

#### 全局导航、文档中心、音效实验室与沙盒测试锚点表
| `data-testid` 属性值 | 对应 UI 组件 | 交互行为与状态验证 |
|----------------------|--------------|--------------------|
| `nav-scheme-1` .. `nav-scheme-5` | 顶部五大可玩方案切换按钮 | 一键切换方案一至方案五并同步更新 `window.__SLOTBOUND__.getActiveScheme()` |
| `nav-gdd-viewer` / `nav-audio-lab` | 设计文档中心 / 音效实验室切换按钮 | 切换至内置 GDD 阅读器或 Web Audio 合成测试台 |
| `gdd-viewer-panel` / `gdd-doc-selector` / `gdd-content-body` | 内置 GDD 阅读器组件 | 支持实时切换并渲染 `docs/gdd/00..05-*.md` 全部 6 份设计文档 |
| `audio-mute-toggle` / `audio-test-clunk` / `audio-test-devour` / `audio-test-chime` / `audio-last-event` | 音效实验室交互组件 | 实时测试停轮卡顿声、吞噬咀嚼声、半音升调叮声并回显最新频率 |
| `sandbox-toolbar` / `sandbox-seed-input` / `sandbox-trigger-jackpot` | 底部沙盒调试工具栏 | 支持注入确定性随机种子与一键触发当前方案终极连锁大奖 |

---

## 5. 第二轮弹道微操与推运战棋防卡死进化 (`Round 2 Alchemical Aiming & Commander Ascension`)

### 5.1 方案四《咒印弹珠台》：三维发射偏角与咒印钉点石成金
* **三档发射偏角控制 (`pachinko-aim-left` / `center` / `right`)**：释放炼金法球前可自由选择左倾（`-18°`）、垂直（`0°`）或右倾（`+18°`）入射角，瞄准高密度元素钉群；
* **点击升级咒印钉 (`35G`)**：直接点击钉阵中的任意 `.pachinko-peg` 即可消耗 `35G` 将其永久点化为高倍 **黄金/暴食咒印钉**，配合 Canvas 2D 动态流光轨迹与坩埚溅射波纹放大半空吞噬收益。

### 5.2 方案五《深渊矩阵》：手动锁格、斩杀结余铁律与统帅升阶合体
* **手动切换统帅锁格 (`Click-to-Toggle HOLD`)**：点击任意非空 `matrix-cell-0..15` 可手动锁定关键战线支点或解锁冗余棋子腾出十字吞噬口粮位，矩阵上层叠加 SVG 激光瞄准线实时高亮全部已激活的横/竖/斜 Bingo 战线；
* **斩杀结余存息铁律**：提前按下 `[立即结算开火 (R)]` 时，唯有本轮齐射真正击破当前波次首领方可兑现 $1.25^U$ 省杆复利与 $1.35^U$ 贪婪倍率，杜绝无伤刷钱漏洞；
* **统帅升阶合体 (`Commander Ascension Merge`)**：当 `4×4` 全部 16 格均被锁定统帅填满时，继续重摇会自动将低阶统帅两两融合晋升并腾出新口粮槽位，保证推运引擎永不僵死！

