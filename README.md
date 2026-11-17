# 《Slotbound》极简爽游衍生套件 (Slotbound Minimalist Dopamine Lab)

> **在线即玩预览 (Live Public Preview — GitHub Pages)**：[**https://luca5702.github.io/slotbound-dopamine-lab/**](https://luca5702.github.io/slotbound-dopamine-lab/)  
> **GitHub 开源仓库 (Source Repository)**：[https://github.com/Luca5702/slotbound-dopamine-lab](https://github.com/Luca5702/slotbound-dopamine-lab)

> **核心破局理念：“砍掉中间商”** —— 将《Slotbound》中被“繁琐战前吞噬微操”与“冗长自动战斗”稀释的多巴胺摇奖体验彻底重构，把**抽卡 (Spin)**、**零操作合成 (Auto-Devour)**、**即时开火 (Slot-as-Combat)** 压缩到同一个 `< 1000ms` 瞬间，实现**“拉杆即结算、连线即秒杀”**的高频正反馈循环。

---

## 1. 在线预览与快速体验

无需安装任何构建工具或外部资产，直接访问公开部署地址即可在桌面或移动端浏览器完整体验 **五大独立可玩原型 + 内置实时 GDD 阅读器 + Web Audio 程序化合成实验室**：

- **公开试玩入口**：<https://luca5702.github.io/slotbound-dopamine-lab/>
- **街机机台视觉架构**：采用 **黑曜石底板 + 拉丝黄铜边框 + 猩红/翡翠赌桌绒布 (`Obsidian, Brushed Brass & Crimson Felt`)** 的 `100vh` 沉浸式机台布局，全套多图层矢量图标由 `src/ui/SpriteForge.js` 实时锻造（零原生系统 Emoji 依赖）。

---

## 2. 极简重构核心公式与三大视听数值铁律

### 极简重构核心公式 (Three Minimalist Core Formulas)
1. **零操作合成 (`Auto-Devour`)**：取消手动把杂兵喂给主力的拖拽操作。当老虎机停下时，场上的高阶图案**自动张嘴吃掉**周围相邻的低阶图案，直接跳数字涨属性并播放二次贝塞尔吞噬弧光特效，严格在 **1秒内完成结算 (`< 1000ms`)**。
2. **即时开火 (`Slot-as-Combat`)**：砍掉独立的“看小人慢吞吞走路打架”阶段。老虎机面板本身就是阵地，连线成功的瞬间，格子里的兵种直接向同屏首领竞技场 (`Boss Arena`) 发射彗尾弹幕或释放技能，摇一次打一轮。
3. **极简赌狗经济 (`Risk & Greed`)**：引入《小丑牌》（Balatro）式的过关底分、复利与非阻塞式三选一遗物 (`RelicDraftBanner.js`) 机制。每波怪物有固定的拉杆倒计时（默认限制 `5` 次拉杆内击杀），省下的每一次拉杆 $U$ 都会变成下一关的复利金币 ($1.25^U$) 与永久贪婪倍率 ($1.35^U$)，通关第 8 波后更可无缝进入 **Wave 9+ 无尽冲分模式 (`Endless Mode`)**。

### 把控“上头感”的三大视听与数值铁律 (Three Iron Laws)
- **15秒心流法则 (`15-Second Flow Rule`)**：从按下拉杆、触发 `< 800ms` 四拍视觉战斗编排、打出满屏暴击到拿奖励选遗物，单回合闭环严控在 `10–15秒` 以内，全程支持单手鼠标或空格键 (`Spacebar`，动画期间连按触发 `2.5x` 极速快进)。
- **指数级数字膨胀 (`Exponential Number Inflation`)**：采用《Balatro》式五维乘法公式记分牌 `TotalDamage = floor(BasePoints × LineMultiplier × DevourStacksMultiplier × ChainSynergyMultiplier × GreedMultiplier)`，5分钟内伤害从百位飙升至千万/破亿级并伴随 4 阶屏幕震动。
- **重度听觉锚点 (`Heavy Auditory Anchors`)**：零外部音频依赖，基于原生 Web Audio API 主母线动态压缩合成器 (`DynamicsCompressorNode` + 软削波抗爆音 + 缓存程序化粉红/白噪声) 实时生成：
  1. 老虎机停轮的黄铜机械棘轮卡顿声 (`playReelClack`)
  2. 吞噬低阶单位时的双层骨甲碎裂清脆咀嚼声 (`playDevourCrunch`)
  3. 达成连线时按 `55ms` 微琶音十二平均律升调的“叮—叮—叮—” ($f = 523.25 \times 2^{\min(\text{step}, 24)/12}\text{ Hz}$, `playComboChime`)

---

## 3. 游戏设计文档索引 (`docs/gdd/` Suite)

本项目遵循“设计文档先行、目录结构清晰”的工程规范，完整包含 6 份结构化中文游戏设计文档（支持在 Web 街机大厅内置阅读器 `GDDViewer` 中实时查阅并一键启动对应原型）：

| 编号 | 文档路径 | 核心内容 | 对应可玩原型 |
|------|----------|----------|--------------|
| **00** | [`docs/gdd/00-master-design-philosophy.md`](docs/gdd/00-master-design-philosophy.md) | 《Slotbound》核心矛盾解构、极简重构三公式、五大方案对比矩阵与 R2 街机机台工程架构 | 全局总纲 |
| **01** | [`docs/gdd/01-iron-laws-math-and-audio.md`](docs/gdd/01-iron-laws-math-and-audio.md) | 15秒心流四拍编排、Balatro 五乘区数学模型、非阻塞遗物三选一、无尽模式与主母线 Web Audio 合成规范 | 核心引擎 & 音效实验室 |
| **02** | [`docs/gdd/02-scheme1-devour-reels.md`](docs/gdd/02-scheme1-devour-reels.md) | **方案一：《吞噬转轮》(Devour Reels)** — 3×3 盘面 + 中央深渊巨口、9种食材、5大肚内连锁反应、主动喷吐胃酸与金币工坊改概率 | `devour-reels` |
| **03** | [`docs/gdd/03-scheme2-revolver-dungeon.md`](docs/gdd/03-scheme2-revolver-dungeon.md) | **方案二：《左轮地牢》(Revolver Dungeon)** — 60° 极坐标 6发环形弹巢、战术弹带定向装填、寄生吞噬、“火药+引信+重锤”清空弹巢与恶魔弹炸膛博弈 | `revolver-dungeon` |
| **04** | [`docs/gdd/04-scheme3-jackpot-td.md`](docs/gdd/04-scheme3-jackpot-td.md) | **方案三：《黄金矿工防线》(Jackpot TD)** — 1×5 单线峡谷即时塔防、底座点击锁塔、快艇骰子 (`Yahtzee`) 牌型、三连冰冻、5秒狂暴激光洗地与五连核弹 | `jackpot-td` |
| **05** | [`docs/gdd/05-explorations-pachinko-grid.md`](docs/gdd/05-explorations-pachinko-grid.md) | **拓展方案四/五：《咒印弹珠台》(Sigil Pachinko) 与《深渊矩阵》(Abyssal Grid)** — 偏角发射 + 钉阵升级碰撞吞噬弹珠台 + 4×4 手动/自动锁格吞噬战棋 Bingo | `sigil-pachinko` / `abyssal-grid` |

---

## 4. 五大可玩原型与战术交互指南

| 方案 | 名称 | 核心盘面 | 主操作 (`Space`) | 战术决策与次级操作 (`R` / 点击交互) | 核心爽点 |
|------|------|----------|------------------|-------------------------------------|----------|
| **方案一** | **《吞噬转轮》 (Devour Reels)** | `3×3` + 中央深渊巨口 + 首领台 | 拉杆摇奖并自动喂食巨口 | 消耗金币定向加权/剔除轮盘概率、主动喷吐胃酸 (`Belch`)、升级巨口等级 | `火球+炸药桶` 肚内连锁爆炸、`3个铁甲骑士` 重甲反伤、消化不良酸液海啸 |
| **方案二** | **《左轮地牢》 (Revolver Dungeon)** | `60°` 环形旋转 `6发` 左轮弹巢 | **旋转弹巢并开火 (`Spin & Fire`)** | 从 3 发战术弹带选弹并指定弹仓装填 (`Load [R]`) | `寄生弹` 吞噬左右相邻子弹翻倍、`火药+引信+重锤` 瞬间连发清空整个弹巢、`恶魔弹` 炸膛豪赌 |
| **方案三** | **《黄金矿工防线》 (Jackpot TD)** | 峡谷兵线 + `1×5` 单线防线底座 | 消耗金币狂按拉杆刷新防线并齐射 | 忍住不拉杆每 2.5s 吃 `+20%` 复利；点击底座**锁定最多 2 座主力塔**凑大牌 | 对子自动升二星 `★★`、`三连冰冻` 救场、顺子/五连触发 **5秒狂暴激光洗地** 与 **五连核弹** |
| **方案四** | **《咒印弹珠台》 (Sigil Pachinko)** | `1×3` 偏角发射 + `24` 钉阵 + `5` 坩埚 | 释放炼金法球下落弹跳吞噬 | 切换左/中/右发射偏角、花 `35G` 升级咒印钉、按下 **狂暴摇台 (`Chaos Tilt [R]`)** | 半空碰撞自动吞噬融合、钉板半音阶升调、落入中央 `×25 JACKPOT` 坩埚 |
| **方案五** | **《深渊矩阵》 (Abyssal Grid)** | `4×4` 十六格锁格战棋矩阵 | 矩阵重摇 (`Hold & Respin`) | 点击战棋格手动切换 `HOLD` 锁格、满斩杀线时按 **立即结算开火 (`Fire Now [R]`)** 存复利 | 统帅自动锁格十字吞噬杂兵、统帅升阶合体防卡死、凑齐 `10线 Bingo` 毁灭齐射 |

---

## 5. 工程目录结构

```text
/home/antigravity/
├── PROJECT.md                              # 全局架构契约、里程碑与接口定义
├── README.md                               # 在线预览入口、GDD索引与架构说明
├── package.json                            # 零外部依赖原生 ES Module 配置与脚本入口
├── index.html                              # 100vh 黑曜石与拉丝黄铜 Web 街机大厅入口
├── docs/
│   └── gdd/                                # 6份完整中文游戏设计文档 (00..05)
├── src/
│   ├── main.js                             # 街机大厅路由、快捷键绑定与 window.__SLOTBOUND__ 测试桥
│   ├── styles/                             # 赌场暗黑地牢视觉令牌与 <800ms 四拍战斗编排 (main.css, animations.css)
│   ├── core/                               # 纯确定性核心引擎 (零DOM依赖，100% Node可测)
│   │   ├── PRNG.js                         # 可设种子的 Mulberry32 确定性随机数生成器
│   │   ├── BigNumber.js                    # 指数级大数格式化 (K/M/B/T & 万/亿) 与震动分级
│   │   ├── ScoreFormula.js                 # Balatro式五维乘法公式引擎
│   │   ├── EconomyEngine.js                # 省杆复利、贪婪倍率、非阻塞遗物三选一与 Wave 9+ 无尽模式引擎
│   │   ├── EventBus.js                     # 同步/异步事件总线与环形日志缓冲区
│   │   └── FlowTracker.js                  # 15秒心流监控、<1000ms吞噬结算与2.5x空格快进
│   ├── audio/
│   │   └── SoundEngine.js                  # 主母线压缩 Web Audio 合成器 + 55ms 微琶音 + window.__AUDIO_LOG__
│   ├── ui/
│   │   ├── SpriteForge.js                  # 全套多图层程序化 SVG 实体/遗物图标与 40 尊首领立绘锻造厂
│   │   ├── RelicDraftBanner.js             # 非阻塞式波次通关三选一遗物、胜利无尽模式与败北重开横幅
│   │   ├── VFXCanvas.js                    # HiDPI 2D Canvas 特效层 (贝塞尔吞噬弧、彗尾弹幕、三层等离子激光、震屏)
│   │   ├── HUDController.js                # 共享五乘区 Balatro 记分牌、遗物徽章栏与中文协同词条 HUD
│   │   └── GDDViewer.js                    # 内置游戏设计文档典籍阅读器与一键试玩跳转
│   └── games/                              # 五大可玩原型模块 (devour-reels, revolver-dungeon, jackpot-td, sigil-pachinko, abyssal-grid)
├── scripts/
│   ├── serve.js                            # 零依赖 Node HTTP 静态服务器
│   └── verify-e2e.js                       # Headless Chromium 全量 E2E 验证脚本
└── tests/
    ├── unit/                               # 单元与集成测试套件 (node --test)
    └── e2e/                                # 黑盒端到端测试套件 (Tiers 1-6)
```

---

## 6. 本地启动与验证命令

```bash
# 1. 启动本地 Web 街机大厅服务器 (默认 http://127.0.0.1:3000)
npm start

# 2. 运行全部单元与核心契约测试 (Node.js 内置测试运行器)
npm test

# 3. 运行全量端到端验证套件 (含 Headless Chromium 真浏览器渲染与交互验证)
npm run test:e2e
```
