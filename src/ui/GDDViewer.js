/**
 * Built-In Interactive Game Design Document (GDD) Library Viewer (`F-UI-01`, `F-GDD-01` & `F-R2-01`)
 * Renders all 6 Chinese GDD Markdown files from `docs/gdd/00..05-*.md` inside the Web Arcade Hub
 * with required `data-testid` attributes (`gdd-viewer-panel`, `gdd-doc-selector`, `gdd-content-body`),
 * brushed-brass SVG tome iconography (zero raw OS emojis), and interactive Launch Prototype buttons.
 *
 * Dual-environment safe: Loads directly from disk in Node (`node --test`) and via `fetch()`
 * with rich `>= 360`-character pre-cached fallback content in Browser.
 */

export const GDD_CATALOG = Object.freeze([
  {
    id: '00-master-design-philosophy',
    filename: '00-master-design-philosophy.md',
    path: 'docs/gdd/00-master-design-philosophy.md',
    title: '00 总纲：砍掉中间商与极简重构核心公式',
    launchSchemeId: 'devour-reels',
    launchLabel: '试玩方案一：《吞噬转轮》',
    fallbackMarkdown: `# 《Slotbound》极简爽游衍生套件 — 总纲设计哲学
- **核心破局思路（砍掉中间商）**：把抽卡（Spin）、零操作合成（Auto-Devour <1000ms）、即时开火（Slot-as-Combat）压缩到同一个瞬间，实现“拉杆即结算、连线即秒杀”的高频正反馈循环。
- **极简赌狗经济（Risk & Greed）**：每波默认 5 次拉杆倒计时，省下的每一次拉杆 U 自动转化为 1.25^U 复利金币与 1.35^U 永久贪婪倍率，并触发非阻塞式三选一遗物构筑。
- **街机机台视觉规范**：采用黑曜石底板、拉丝黄铜边框与猩红赌桌绒布 100vh 机台设计，全矢量 SpriteForge 图标与 60fps Canvas 特效协同呈现。`,
  },
  {
    id: '01-iron-laws-math-and-audio',
    filename: '01-iron-laws-math-and-audio.md',
    path: 'docs/gdd/01-iron-laws-math-and-audio.md',
    title: '01 铁律：15秒心流、指数级数字膨胀与重度听觉锚点',
    launchSchemeId: 'audio-lab',
    launchLabel: '打开音效与数值实验室',
    fallbackMarkdown: `# 把控“上头感”的三大视听与数值铁律
- **15秒心流法则**：单回合闭环严控在 10~15 秒以内，小于 800ms 四拍视觉编排与空格键 2.5x 极速快进无缝衔接，绝不让手离开空格或鼠标。
- **指数级数字膨胀**：采用五乘区 Balatro 公式（基础点 × 连线倍率 × 吞噬层数 × 连锁倍率 × 贪婪倍率），5分钟从百位飙升至千万/破亿并驱动 0..4 阶震屏。
- **重度听觉锚点**：主母线动态压缩合成器实时生成停轮机械卡顿声、双层清脆咀嚼声与 55ms 微琶音十二平均律升调 523.25 * 2^(step/12) Hz。`,
  },
  {
    id: '02-scheme1-devour-reels',
    filename: '02-scheme1-devour-reels.md',
    path: 'docs/gdd/02-scheme1-devour-reels.md',
    title: '02 方案一：《吞噬转轮》(Devour Reels) 怪兽养成与弹幕直伤',
    launchSchemeId: 'devour-reels',
    launchLabel: '立即试玩：《吞噬转轮》',
    fallbackMarkdown: `# 方案一：《吞噬转轮》(Devour Reels)
- **核心循环**：3×3 九宫格转轮直接投喂盘面正中央的“深渊巨口”（Abyssal Maw），高阶捕食者停轮瞬间自动张嘴吞噬 8 邻域低阶食材。
- **肚内连锁反应**：摇出 3个铁甲骑士叠加重甲反伤风暴；火球+炸药桶引发肚内连锁大爆炸秒杀攻城 BOSS；满盘暴食永久进化巨口等级。
- **消化不良与工坊改装**：管理 0..100 消化不良槽并支持主动胃酸喷吐，消耗金币改轮盘概率或升级巨口工坊，正面迎战八大攻城首领。`,
  },
  {
    id: '03-scheme2-revolver-dungeon',
    filename: '03-scheme2-revolver-dungeon.md',
    path: 'docs/gdd/03-scheme2-revolver-dungeon.md',
    title: '03 方案二：《左轮地牢》(Revolver Dungeon) 俄罗斯轮盘爬塔',
    launchSchemeId: 'revolver-dungeon',
    launchLabel: '立即试玩：《左轮地牢》',
    fallbackMarkdown: `# 方案二：《左轮地牢》(Revolver Dungeon)
- **核心循环**：将老虎机降维成一把 60 度极坐标环形 6发弹巢左轮手枪，保留“旋转弹巢并开火”与“塞入新子弹”的极简双键快节奏博弈。
- **寄生吞噬与六连清空**：寄生弹装填或停轮时自动吞噬左右相邻子弹使伤害翻倍；凑齐火药+引信+重锤瞬间触发连发清空整个弹巢（×12.0 倍率）。
- **俄罗斯轮盘赌命**：契约恶魔弹提供 ×8.0 毁灭倍率与 25% 炸膛自伤心跳博弈，搭配战术弹带定向装填在 15 秒内速通八层地牢。`,
  },
  {
    id: '04-scheme3-jackpot-td',
    filename: '04-scheme3-jackpot-td.md',
    path: 'docs/gdd/04-scheme3-jackpot-td.md',
    title: '04 方案三：《黄金矿工防线》(Jackpot TD) 1×5 单线极速塔防',
    launchSchemeId: 'jackpot-td',
    launchLabel: '立即试玩：《黄金矿工防线》',
    fallbackMarkdown: `# 方案三：《黄金矿工防线》(Jackpot TD)
- **核心循环**：1排5格单线老虎机横跨峡谷兵线底部，既是摇奖机也是实时自动开火的防御塔底座，怪物沿通道 60fps 持续向下推进。
- **快艇骰子绝境大招**：摇出对子自动合成为二星（★★）；三连触发 4 秒三连冰冻控场；顺子或五连触发长达 5 秒的狂暴激光洗地与五连核弹清屏。
- **贪婪憋息与锁塔**：忍住不拉杆每 2.5 秒吃 +20% 实时复利，支持点击底座锁定最多 2 座主力塔并在 72% 警戒红区绝境翻盘。`,
  },
  {
    id: '05-explorations-pachinko-grid',
    filename: '05-explorations-pachinko-grid.md',
    path: 'docs/gdd/05-explorations-pachinko-grid.md',
    title: '05 拓展方案：《咒印弹珠台》与《深渊矩阵：推运战棋》',
    launchSchemeId: 'sigil-pachinko',
    launchLabel: '立即试玩：《咒印弹珠台》',
    fallbackMarkdown: `# 拓展玩法探索：《咒印弹珠台》与《深渊矩阵》
- **方案四《咒印弹珠台》（Sigil Pachinko）**：顶部 1×3 炼金发射器配合偏角瞄准，法球在 24 枚元素咒印钉阵中弹跳升调、半空碰撞自动吞噬融合，狂暴摇台冲刺底部 ×25 JACKPOT 核心坩埚。
- **方案五《深渊矩阵》（Abyssal Grid）**：4×4 十六格推运战棋矩阵，高阶统帅自动或手动 HOLD 锁格并在每次重摇时十字正交吞噬相邻杂兵，连成横竖斜 10 线 Bingo 毁灭齐射。`,
  },
]);

/**
 * Simple zero-dependency Markdown-to-HTML converter for headings, tables, lists, code blocks, and bold text.
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdownToHtml(markdown = '') {
  const raw = String(markdown || '');
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const htmlLines = [];
  let inCodeBlock = false;
  let inTable = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        htmlLines.push('<pre class="gdd-code-block"><code>');
      } else {
        inCodeBlock = false;
        htmlLines.push('</code></pre>');
      }
      continue;
    }

    if (inCodeBlock) {
      htmlLines.push(line);
      continue;
    }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (line.includes('---')) continue;
      if (!inTable) {
        inTable = true;
        htmlLines.push('<table class="gdd-table"><tbody>');
      }
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => `<td>${formatInlineMarkdown(c.trim())}</td>`)
        .join('');
      htmlLines.push(`<tr>${cells}</tr>`);
      continue;
    } else if (inTable) {
      inTable = false;
      htmlLines.push('</tbody></table>');
    }

    if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${formatInlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${formatInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${formatInlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      htmlLines.push(`<li>${formatInlineMarkdown(line.trim().slice(2))}</li>`);
    } else if (line.trim().startsWith('&gt;')) {
      htmlLines.push(`<blockquote>${formatInlineMarkdown(line.trim().slice(4).trim())}</blockquote>`);
    } else if (line.trim() === '---') {
      htmlLines.push('<hr class="gdd-divider" />');
    } else if (line.trim().length > 0) {
      htmlLines.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inTable) htmlLines.push('</tbody></table>');
  if (inCodeBlock) htmlLines.push('</code></pre>');

  return htmlLines.join('\n');
}

function formatInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const TOME_ICON_SVG =
  '<svg class="gdd-tome-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2.5" fill="#241c15" stroke="#f3cf7a" stroke-width="1.8" /><line x1="8" y1="7.5" x2="16" y2="7.5" stroke="#f3cf7a" stroke-width="1.6" /><line x1="8" y1="11.5" x2="16" y2="11.5" stroke="#c89b3c" stroke-width="1.6" /><line x1="8" y1="15.5" x2="13" y2="15.5" stroke="#c89b3c" stroke-width="1.6" /></svg>';

const PLAY_ICON_SVG =
  '<svg class="gdd-launch-svg" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><polygon points="5,3.5 16.5,10 5,16.5" fill="#fff3b0" /></svg>';

export class GDDViewer {
  constructor(options = {}) {
    this.containerEl = null;
    this.onLaunchScheme = typeof options.onLaunchScheme === 'function' ? options.onLaunchScheme : null;
    this.activeDocId = GDD_CATALOG[0].id;
    this.cache = new Map();

    for (const item of GDD_CATALOG) {
      this.cache.set(item.id, item.fallbackMarkdown);
    }

    if (options.containerEl) {
      this.mount(options.containerEl);
    }
  }

  getCatalog() {
    return GDD_CATALOG.map((item) => ({ ...item }));
  }

  getActiveDocument() {
    const meta = GDD_CATALOG.find((d) => d.id === this.activeDocId) || GDD_CATALOG[0];
    return {
      ...meta,
      content: this.cache.get(meta.id) || meta.fallbackMarkdown,
    };
  }

  /**
   * Loads a GDD document by ID or filename from disk (in Node) or via fetch (in Browser).
   * @param {string} docIdOrFilename
   * @returns {Promise<string>}
   */
  async loadDocument(docIdOrFilename) {
    const meta =
      GDD_CATALOG.find(
        (d) => d.id === docIdOrFilename || d.filename === docIdOrFilename || d.path === docIdOrFilename
      ) || GDD_CATALOG[0];

    this.activeDocId = meta.id;

    // 1. Node environment: read directly from disk
    if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const fullPath = path.resolve(process.cwd(), meta.path);
        const diskText = await fs.readFile(fullPath, 'utf-8');
        if (diskText && diskText.trim().length > 0) {
          this.cache.set(meta.id, diskText);
        }
      } catch {
        // Keep fallback cache
      }
      this.render();
      return this.cache.get(meta.id);
    }

    // 2. Browser environment: render cached immediately, then fetch full Markdown file
    this.render();
    if (typeof fetch === 'function') {
      try {
        const response = await fetch(`./${meta.path}`);
        if (response && response.ok) {
          const text = await response.text();
          if (text && text.trim().length > 0) {
            this.cache.set(meta.id, text);
            this.render();
          }
        }
      } catch {
        // Keep pre-cached fallback content
      }
    }

    return this.cache.get(meta.id);
  }

  selectDocument(docIdOrFilename) {
    const meta =
      GDD_CATALOG.find(
        (d) => d.id === docIdOrFilename || d.filename === docIdOrFilename || d.path === docIdOrFilename
      ) || GDD_CATALOG[0];
    this.activeDocId = meta.id;
    this.render();
    this.loadDocument(meta.id).catch(() => {});
    return this.getActiveDocument();
  }

  mount(containerEl) {
    if (!containerEl) return this;
    this.containerEl = containerEl;
    this.render();
    this.loadDocument(this.activeDocId).catch(() => {});
    return this;
  }

  unmount() {
    if (this.containerEl && typeof this.containerEl.innerHTML !== 'undefined') {
      this.containerEl.innerHTML = '';
    }
    this.containerEl = null;
  }

  render() {
    if (!this.containerEl || typeof this.containerEl.innerHTML === 'undefined') {
      return;
    }

    const activeDoc = this.getActiveDocument();
    const renderedBody = renderMarkdownToHtml(activeDoc.content);

    const tabsHtml = GDD_CATALOG.map((doc) => {
      const isActive = doc.id === activeDoc.id;
      return `
        <button
          type="button"
          class="btn-gdd-tab ${isActive ? 'active' : ''}"
          data-doc-id="${doc.id}"
          aria-selected="${String(isActive)}"
        >
          ${doc.title}
        </button>
      `;
    }).join('');

    this.containerEl.innerHTML = `
      <section class="gdd-viewer-panel" data-testid="gdd-viewer-panel">
        <header class="gdd-viewer-header">
          <div class="gdd-title-group">
            ${TOME_ICON_SVG}
            <h2>《Slotbound》极简爽游游戏设计文档中心 (Live GDD Library)</h2>
            <span class="gdd-file-badge">${activeDoc.path}</span>
          </div>
          <button
            type="button"
            class="btn-arcade btn-launch-prototype"
            data-action="launch-scheme"
            data-scheme-id="${activeDoc.launchSchemeId}"
          >
            ${PLAY_ICON_SVG}
            <span>${activeDoc.launchLabel}</span>
          </button>
        </header>

        <nav class="gdd-doc-selector" data-testid="gdd-doc-selector" role="tablist">
          ${tabsHtml}
        </nav>

        <article class="gdd-content-body" data-testid="gdd-content-body">
          ${renderedBody}
        </article>
      </section>
    `;

    if (typeof this.containerEl.querySelectorAll === 'function') {
      const tabButtons = this.containerEl.querySelectorAll('[data-doc-id]');
      for (const btn of tabButtons) {
        if (typeof btn.addEventListener === 'function') {
          btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-doc-id');
            if (targetId) this.selectDocument(targetId);
          });
        }
      }
    }

    if (typeof this.containerEl.querySelector === 'function') {
      const launchBtn = this.containerEl.querySelector('[data-action="launch-scheme"]');
      if (launchBtn && typeof launchBtn.addEventListener === 'function') {
        launchBtn.addEventListener('click', () => {
          const schemeId = launchBtn.getAttribute('data-scheme-id') || activeDoc.launchSchemeId;
          if (this.onLaunchScheme) {
            this.onLaunchScheme(schemeId);
          }
        });
      }
    }
  }
}

export function createGDDViewer(options = {}) {
  return new GDDViewer(options);
}

export default GDDViewer;
