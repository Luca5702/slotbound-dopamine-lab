# 《Slotbound》极简爽游衍生套件 (Slotbound Minimalist Dopamine Lab)

> **核心破局理念：“砍掉中间商”** —— 将《Slotbound》中被“繁琐战前吞噬微操”与“冗长自动战斗”稀释的多巴胺摇奖体验彻底重构，把**抽卡 (Spin)**、**零操作合成 (Auto-Devour)**、**即时开火 (Slot-as-Combat)** 压缩到同一个 `< 1000ms` 瞬间，实现**“拉杆即结算、连线即秒杀”**的高频正反馈循环。

---

## 1. 极简重构核心公式与三大视听数值铁律

### 极简重构核心公式 (Three Minimalist Core Formulas)
1. **零操作合成 (`Auto-Devour`)**：取消手动把杂兵喂给主力的拖拽操作。当老虎机停下时，场上的高阶图案**自动张嘴吃掉**周围相邻的低阶图案，直接跳数字涨属性并播放暴食特效，严格在 **1秒内完成结算 (`< 1000ms`)**。
2. **即时开火 (`Slot-as-Combat`)**：砍掉独立的“看小人慢吞吞走路打架”阶段。老虎机面板本身就是阵地，连线成功的瞬间，格子里的兵种直接向屏幕上方的怪物发射弹幕或释放技能，摇一次打一轮。
3. **极简赌狗经济 (`Risk & Greed`)**：引入《小丑牌》（Balatro）式的过关底分与复利机制。每波怪物有固定的拉杆倒计时（默认限制 `5` 次拉杆内击杀），省下的每一次拉杆 $U$ 都会变成下一关的复利金币 ($1.25^U$) 与永久贪婪倍率 ($1.35^U$)，逼迫玩家在“稳健多拉一杆清场”和“极限少拉一杆贪利息”之间反复横跳。

### 把控“上头感”的三大视听与数值铁律 (Three Iron Laws)
- **15秒心流法则 (`15-Second Flow Rule`)**：从按下拉杆、触发连锁吞噬、打出满屏暴击到拿奖励选遗物，单回合闭环严控在 `10–15秒` 以内，全程支持单手鼠标或空格键 (`Spacebar`，动画期间连按触发 `2.5x` 极速快进)。
- **指数级数字膨胀 (`Exponential Number Inflation`)**：采用《Balatro》式多维乘法公式 `TotalDamage = floor(BasePoints × LineMultiplier × DevourStacksMultiplier × ChainSynergyMultiplier × GreedMultiplier)`，5分钟内伤害从百位飙升至千万/破亿级并伴随 4 阶屏幕震动。
- **重度听觉锚点 (`Heavy Auditory Anchors`)**：零外部音频依赖，基于原生 Web Audio API 实时程序化合成：
  1. 老虎机停轮的机械卡顿声 (`playReelClack`)
  2. 吞噬低阶单位时的双层清脆咀嚼声 (`playDevourCrunch`)
  3. 达成连线时按十二平均律升调的“叮—叮—叮—” ($f = 523.25 \times 2^{\min(\text{step}, 24)/12}\text{ Hz}$, `playComboChime`)

---

## 2. 游戏设计文档索引 (`docs/gdd/` Suite)

本项目遵循“设计文档先行、目录结构清晰”的工程规范，完整包含 6 份结构化中文游戏设计文档（支持在 Web 街机大厅内置阅读器 `GDDViewer` 中实时查阅并一键启动对应原型）：

| 编号 | 文档路径 | 核心内容 | 对应可玩原型 |
|------|----------|----------|--------------|
| **00** | [`docs/gdd/00-master-design-philosophy.md`](docs/gdd/00-master-design-philosophy.md) | 《Slotbound》核心矛盾解构、极简重构三公式、五大方案对比矩阵与工程目录架构 | 全局总纲 |
| **01** | [`docs/gdd/01-iron-laws-math-and-audio.md`](docs/gdd/01-iron-laws-math-and-audio.md) | 15秒心流时间轴、Balatro指数膨胀数学模型、复利经济公式与 Web Audio 合成器规范 | 核心引擎 & 音效实验室 |
| **02** | [`docs/gdd/02-scheme1-devour-reels.md`](docs/gdd/02-scheme1-devour-reels.md) | **方案一：《吞噬转轮》(Devour Reels)** — 3×3 盘面 + 中央深渊巨口、9种食材、5大肚内连锁反应、消化不良槽与改轮盘概率 | `devour-reels` |
| **03** | [`docs/gdd/03-scheme2-revolver-dungeon.md`](docs/gdd/03-scheme2-revolver-dungeon.md) | **方案二：《左轮地牢》(Revolver Dungeon)** — 6发左轮弹巢、双按钮极简循环、9种特种子弹、寄生吞噬、“火药+引信+重锤”清空弹巢与恶魔弹炸膛博弈 | `revolver-dungeon` |
| **04** | [`docs/gdd/04-scheme3-jackpot-td.md`](docs/gdd/04-scheme3-jackpot-td.md) | **方案三：《黄金矿工防线》(Jackpot TD)** — 1×5 单线即时塔防、怪物实时行军、快艇骰子 (`Yahtzee`) 牌型、三连冰冻、5秒狂暴激光洗地与五连核弹 | `jackpot-td` |
| **05** | [`docs/gdd/05-explorations-pachinko-grid.md`](docs/gdd/05-explorations-pachinko-grid.md) | **拓展方案四/五：《咒印弹珠台》(Sigil Pachinko) 与《深渊矩阵》(Abyssal Grid)** — 空中碰撞吞噬弹珠台 + 4×4 自动锁格吞噬战棋 Bingo | `sigil-pachinko` / `abyssal-grid` |

---

## 3. 五大可玩原型与操作指南

| 方案 | 名称 | 核心盘面 | 主操作 (`Space`) | 次级操作 (`R` / 面板) | 核心爽点 |
|------|------|----------|------------------|-----------------------|----------|
| **方案一** | **《吞噬转轮》 (Devour Reels)** | `3×3` + 中央深渊巨口 | 拉杆摇奖并自动喂食巨口 | 调整轮盘概率权重 / 切换流派预设 | `火球+炸药桶` 肚内连锁爆炸、`3个铁甲骑士` 重甲反伤、消化不良酸液喷发 |
| **方案二** | **《左轮地牢》 (Revolver Dungeon)** | `6发` 环形左轮弹巢 | **旋转弹巢并开火 (`Spin & Fire`)** | **塞入新子弹 (`Load New Bullet`)** | `寄生弹` 吞噬相邻子弹翻倍、`火药+引信+重锤` 瞬间连发清空弹巢、`恶魔弹` 炸膛豪赌 |
| **方案三** | **《黄金矿工防线》 (Jackpot TD)** | `1×5` 单线防线底座 | 消耗金币狂按拉杆刷新5塔并齐射 | 忍住不拉杆吃 `+20%` 实时复利 | 对子自动升二星 `★★`、`三连冰冻` 救场、顺子/五连触发 **5秒狂暴激光洗地** 与 **五连核弹** |
| **方案四** | **《咒印弹珠台》 (Sigil Pachinko)** | `1×3` 落球 + `24` 钉板 + `5` 坩埚 | 释放炼金法球下落碰撞吞噬 | **狂暴摇台 (`Chaos Tilt`)** 推向大奖槽 | 空中碰撞自动吞噬、钉板半音阶升调、落入中央 `×25 JACKPOT` 坩埚 |
| **方案五** | **《深渊矩阵》 (Abyssal Grid)** | `4×4` 锁格战棋矩阵 | 矩阵重摇 (`Hold & Respin`) | **立即结算开火 (`Fire Now`)** 贪复利 | 统帅自动锁定 (`🔒 HOLD`) 并十字吞噬杂兵、凑齐 `10线 Bingo` 毁灭齐射 |

---

## 4. 工程目录结构

```text
/home/antigravity/
├── PROJECT.md                              # 全局架构契约、里程碑与接口定义
├── README.md                               # 项目启动指南、GDD索引与架构说明
├── package.json                            # 原生 ES Module 配置与脚本入口
├── index.html                              # 统一 Web 街机大厅入口
├── docs/
│   └── gdd/                                # 6份完整中文游戏设计文档 (00..05)
├── src/
│   ├── main.js                             # 街机大厅路由、快捷键绑定与 window.__SLOTBOUND__ 测试桥
│   ├── styles/                             # 街机霓虹暗黑主题样式与屏幕震动/激光动画 (main.css, animations.css)
│   ├── core/                               # 纯确定性核心引擎 (零DOM依赖，100% Node可测)
│   │   ├── PRNG.js                         # 可设种子的 Mulberry32 确定性随机数生成器
│   │   ├── BigNumber.js                    # 指数级大数格式化 (K/M/B/T & 万/亿) 与震动分级
│   │   ├── ScoreFormula.js                 # Balatro式多维乘法公式引擎
│   │   ├── EconomyEngine.js                # 极简赌狗经济：剩余拉杆复利、贪婪倍率与三选一遗物
│   │   ├── EventBus.js                     # 同步/异步事件总线与环形日志缓冲区
│   │   └── FlowTracker.js                  # 15秒心流监控、<1000ms吞噬结算与2.5x空格快进
│   ├── audio/
│   │   └── SoundEngine.js                  # 程序化 Web Audio API 音效合成器 + window.__AUDIO_LOG__
│   ├── ui/
│   │   ├── VFXCanvas.js                    # 60fps 2D Canvas 特效层 (弹幕、吞噬粒子、5秒激光、飘字、震屏)
│   │   ├── HUDController.js                # 共享 Balatro 风格公式分解横幅与波次/金币 HUD
│   │   └── GDDViewer.js                    # 内置游戏设计文档阅读器与一键试玩跳转
│   └── games/                              # 五大可玩原型模块 (devour-reels, revolver-dungeon, jackpot-td, sigil-pachinko, abyssal-grid)
├── scripts/
│   ├── serve.js                            # 零依赖 Node HTTP 静态服务器
│   └── verify-e2e.js                       # Headless Chromium 全量 E2E 验证脚本
└── tests/
    ├── unit/                               # 单元与集成测试套件 (node --test)
    └── e2e/                                # 黑盒端到端测试套件 (Tiers 1-4)
```

---

## 5. 快速启动与测试命令

```bash
# 1. 启动本地 Web 街机大厅服务器 (默认 http://127.0.0.1:3000)
npm start

# 2. 运行全部单元与核心契约测试 (Node.js 内置测试运行器)
npm test

# 3. 运行全量端到端验证套件
npm run test:e2e
```
