/**
 * Built-In Interactive Game Design Document (GDD) Library Viewer (`F-UI-01` & `F-GDD-01`)
 * Renders all 6 Chinese GDD Markdown files from `docs/gdd/00..05-*.md` inside the Web Arcade Hub
 * with required `data-testid` attributes (`gdd-viewer-panel`, `gdd-doc-selector`, `gdd-content-body`)
 * and interactive "🚀 立即试玩此方案 (Launch Prototype)" buttons.
 *
 * Dual-environment safe: Loads directly from disk in Node (`node --test`) and via `fetch()`
 * with rich pre-cached fallback content in Browser.
 */

export const GDD_CATALOG = Object.freeze([
  {
    id: '00-master-design-philosophy',
    filename: '00-master-design-philosophy.md',
    path: 'docs/gdd/00-master-design-philosophy.md',
    title: '00 总纲：砍掉中间商与极简重构核心公式',
    launchSchemeId: 'devour-reels',
    launchLabel: '🚀 试玩方案一：《吞噬转轮》',
    fallbackMarkdown: `# 《Slotbound》极简爽游衍生套件 — 总纲设计哲学
- **核心破局思路（砍掉中间商）**：把抽卡、零操作合成（Auto-Devour <1000ms）、即时开火（Slot-as-Combat）压缩到同一瞬间。
- **极简赌狗经济（Risk & Greed）**：省下每一次拉杆 U 转化为 1.25^U 复利金币与 1.35^U 永久贪婪倍率。`,
  },
  {
    id: '01-iron-laws-math-and-audio',
    filename: '01-iron-laws-math-and-audio.md',
    path: 'docs/gdd/01-iron-laws-math-and-audio.md',
    title: '01 铁律：15秒心流、指数级数字膨胀与重度听觉锚点',
    launchSchemeId: 'audio-lab',
    launchLabel: '🎧 打开音效与数值实验室',
    fallbackMarkdown: `# 把控“上头感”的三大视听与数值铁律
- **15秒心流法则**：单回合闭环严控在 10~15 秒，空格键支持 2.5x 极速快进。
- **指数级数字膨胀**：基础点 × 连线倍率 × 吞噬层数，5分钟突破千万/亿级。
- **重度听觉锚点**：停轮机械卡顿声、吞噬清脆咀嚼声、半音阶升调 523.25 * 2^(step/12) Hz。`,
  },
  {
    id: '02-scheme1-devour-reels',
    filename: '02-scheme1-devour-reels.md',
    path: 'docs/gdd/02-scheme1-devour-reels.md',
    title: '02 方案一：《吞噬转轮》(Devour Reels) 怪兽养成与弹幕直伤',
    launchSchemeId: 'devour-reels',
    launchLabel: '🚀 立即试玩：《吞噬转轮》',
    fallbackMarkdown: `# 方案一：《吞噬转轮》(Devour Reels)
- **核心循环**：3×3 盘面喂养正中央“深渊巨口”（Abyssal Maw）。
- **连锁反应**：3个铁甲骑士重甲反伤；火球+炸药桶肚内连锁大爆炸秒杀攻城 BOSS；消化不良槽 (0..100) 与改轮盘概率。`,
  },
  {
    id: '03-scheme2-revolver-dungeon',
    filename: '03-scheme2-revolver-dungeon.md',
    path: 'docs/gdd/03-scheme2-revolver-dungeon.md',
    title: '03 方案二：《左轮地牢》(Revolver Dungeon) 俄罗斯轮盘爬塔',
    launchSchemeId: 'revolver-dungeon',
    launchLabel: '🚀 立即试玩：《左轮地牢》',
    fallbackMarkdown: `# 方案二：《左轮地牢》(Revolver Dungeon)
- **核心循环**：6发弹巢左轮手枪，双按钮“旋转弹巢并开火”与“塞入新子弹”。
- **连锁与轮盘**：寄生弹吞噬相邻子弹翻倍；火药+引信+重锤瞬间连发清空整个弹巢；恶魔弹 25% 炸膛豪赌。`,
  },
  {
    id: '04-scheme3-jackpot-td',
    filename: '04-scheme3-jackpot-td.md',
    path: 'docs/gdd/04-scheme3-jackpot-td.md',
    title: '04 方案三：《黄金矿工防线》(Jackpot TD) 1×5 单线极速塔防',
    launchSchemeId: 'jackpot-td',
    launchLabel: '🚀 立即试玩：《黄金矿工防线》',
    fallbackMarkdown: `# 方案三：《黄金矿工防线》(Jackpot TD)
- **核心循环**：1排5格单线老虎机横在怪物进攻路径上，既是摇奖机也是防御塔底座。
- **快艇骰子大招**：对子自动合成二星 (★★)；三连冰冻救场；顺子或五连触发长达 5 秒的狂暴激光洗地与五连核弹。`,
  },
  {
    id: '05-explorations-pachinko-grid',
    filename: '05-explorations-pachinko-grid.md',
    path: 'docs/gdd/05-explorations-pachinko-grid.md',
    title: '05 拓展方案：《咒印弹珠台》与《深渊矩阵：推运战棋》',
    launchSchemeId: 'sigil-pachinko',
    launchLabel: '🚀 立即试玩：《咒印弹珠台》',
    fallbackMarkdown: `# 拓展玩法探索：《咒印弹珠台》与《深渊矩阵》
- **方案四《咒印弹珠台》**：1×3 炼金落球 + 24 咒印钉碰撞自动吞噬 + ×25 JACKPOT 坩埚。
- **方案五《深渊矩阵》**：4×4 Hold-&-Respin 统帅自动锁格十字吞噬 + 10线 Bingo 矩阵齐射。`,
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
            <h2>📜 《Slotbound》极简爽游游戏设计文档中心 (Live GDD Library)</h2>
            <span class="gdd-file-badge">${activeDoc.path}</span>
          </div>
          <button
            type="button"
            class="btn-arcade btn-launch-prototype"
            data-action="launch-scheme"
            data-scheme-id="${activeDoc.launchSchemeId}"
          >
            ${activeDoc.launchLabel}
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
