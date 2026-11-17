/**
 * Shared Non-Blocking Post-Wave Relic Draft, Victory/Endless & Defeat Banner (`F-R2-02`, `PROJECT.md § 6.2`)
 * Renders inline/floating progression UI without disabling primary spin buttons so both human
 * players (`click` or `[1-3]` hotkeys) and headless multi-wave E2E loops (`T4-02..08`, `T5-28..30`)
 * advance seamlessly with zero modal deadlocks.
 */

import { sanitizeNumber, formatBigNumber } from '../core/BigNumber.js';
import { DEFAULT_RELIC_CATALOG } from '../core/EconomyEngine.js';
import { renderSprite, safeToString } from './SpriteForge.js';

export const RELIC_ZH_INFO = Object.freeze({
  greed_ledger: Object.freeze({
    zhName: '贪婪账本',
    rarityZh: '普通',
    tier: 2,
    zhDesc: '永久贪婪倍率 ×1.25，每波通关底薪额外 +25G。',
  }),
  gluttony_jaw: Object.freeze({
    zhName: '暴食颚骨',
    rarityZh: '普通',
    tier: 2,
    zhDesc: '每次触发零操作吞噬额外 +1 吞噬层数，贪婪倍率 ×1.20。',
  }),
  acid_reflux_core: Object.freeze({
    zhName: '胃酸狂暴核',
    rarityZh: '稀有',
    tier: 3,
    zhDesc: '消化不良满槽时化为 ×15.0 胃酸海啸倍率，贪婪倍率 ×1.35。',
  }),
  pyro_catalyst: Object.freeze({
    zhName: '爆破催化剂',
    rarityZh: '稀有',
    tier: 3,
    zhDesc: '火球与黑火药桶权重 +15%，且所有连锁倍率额外 ×1.40。',
  }),
  russian_roulette_coin: Object.freeze({
    zhName: '恶魔轮盘金币',
    rarityZh: '稀有',
    tier: 3,
    zhDesc: '空弹仓赌命与恶魔弹赋予 ×1.50 加成，永久贪婪倍率 ×1.50。',
  }),
  compound_vault: Object.freeze({
    zhName: '复利金库',
    rarityZh: '史诗',
    tier: 4,
    zhDesc: '过关复利利率提升 +10%，立即入账 +100G，贪婪倍率 ×1.30。',
  }),
  chronos_lever: Object.freeze({
    zhName: '时空拉杆',
    rarityZh: '史诗',
    tier: 4,
    zhDesc: '每波最大拉杆上限 +1（省杆结算可滚出更高 1.25^U 复利）。',
  }),
  abyssal_crown: Object.freeze({
    zhName: '深渊暴君王冠',
    rarityZh: '神话',
    tier: 4,
    zhDesc: '永久贪婪总倍率直接乘以 ×1.75，后期亿级爆发核心。',
  }),
});

const PROTOTYPE_KEY_SET = new Set([
  'constructor',
  'tostring',
  'valueof',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  'tolocalestring',
  '__proto__',
  '__definegetter__',
  '__definesetter__',
  '__lookupgetter__',
  '__lookupsetter__',
  'prototype',
]);

const ALLOWED_RARITIES = new Set(['common', 'rare', 'epic', 'mythic']);

function safeNum(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number' || typeof val === 'bigint') return sanitizeNumber(val, fallback);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? sanitizeNumber(trimmed, fallback) : fallback;
  }
  return fallback;
}

function cleanBannerText(val = '') {
  return safeToString(val)
    .replace(/function\s*[a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{\s*\[native code\]\s*\}/gi, '')
    .replace(/\[native code\]/gi, '')
    .replace(/\b(?:undefined|NaN)\b/gi, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeHtmlSafe(val = '') {
  return safeToString(val)
    .replace(/function\s*[a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{\s*\[native code\]\s*\}/gi, '')
    .replace(/\[native code\]/gi, '')
    .replace(/\b(?:undefined|NaN)\b/gi, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

/**
 * Renders non-blocking HTML for Defeat (`run-defeat-banner`), Victory (`run-victory-banner`),
 * or 3-Card Post-Wave Relic Draft (`relic-draft-banner`). Returns `''` when idle.
 * @param {object} [state={}]
 * @param {object} [options={}]
 * @returns {string}
 */
export function renderRelicDraftHTML(state = {}, options = {}) {
  if (!state || typeof state !== 'object') return '';

  const wave = Math.max(1, Math.floor(safeNum(state.wave, 1)));
  const gold = Math.max(0, Math.floor(safeNum(state.gold, 0)));
  const greedMult = Number(Math.max(0.1, safeNum(state.greedMultiplier, 1)).toFixed(2));
  const lastDamage = Math.max(
    0,
    safeNum(
      state.lastTurnBreakdown?.totalDamage ?? state.lastFormula?.totalDamage ?? state.totalDamage ?? 0,
      0
    )
  );
  const relicCount = Array.isArray(state.relics)
    ? state.relics.filter((r) => {
        if (typeof r === 'string') return r.trim().length > 0;
        return Boolean(
          r &&
            typeof r === 'object' &&
            !Array.isArray(r) &&
            safeToString(r.id ?? r.relicId).trim().length > 0
        );
      }).length
    : 0;

  // 1. Run Defeat State (`playerHp <= 0` on Overtime / Backfire / Leak)
  if (state.gameOver === true || state.defeat === true) {
    return `
      <section class="relic-overlay-banner run-defeat-banner" data-testid="run-defeat-banner">
        <div class="run-banner-row">
          <div class="gdd-title-group">
            ${renderSprite('curse_skull', { size: 38, tier: 4 })}
            <div>
              <strong class="relic-card-name">防线失守 · 赌命败北</strong>
              <div class="relic-card-desc">止步第 ${wave} 波 · 最近爆发伤害 ${formatBigNumber(lastDamage)}</div>
            </div>
          </div>
          <div class="run-banner-actions">
            <button type="button" class="btn-arcade btn-primary-action btn-retry-run" data-testid="btn-retry-run">
              立即重开本局
            </button>
          </div>
        </div>
      </section>
    `.trim();
  }

  // 2. Run Victory State (Wave 8 Cleared & not yet in Endless Mode)
  if (state.victory === true && !state.endlessMode) {
    return `
      <section class="relic-overlay-banner run-victory-banner" data-testid="run-victory-banner">
        <div class="run-banner-row">
          <div class="gdd-title-group">
            ${renderSprite('abyssal_crown', { size: 40, tier: 4 })}
            <div>
              <strong class="relic-card-name">八波全破 · 终极头奖达成</strong>
              <div class="relic-card-desc">金库 ${gold}G · 永久贪婪 ×${greedMult} · 已收集 ${relicCount} 件遗物</div>
            </div>
          </div>
          <div class="run-banner-actions">
            <button type="button" class="btn-arcade btn-primary-action btn-endless-mode" data-testid="btn-endless-mode">
              进入无尽冲分模式 (Wave 9+)
            </button>
            <button type="button" class="btn-arcade btn-secondary-action btn-new-run" data-testid="btn-new-run">
              开启新一局
            </button>
          </div>
        </div>
      </section>
    `.trim();
  }

  // 3. Non-Blocking 3-Card Post-Wave Relic Draft
  if (Array.isArray(state.pendingRelicDraft) && state.pendingRelicDraft.length > 0) {
    const settlement = state.lastSettlement || state.economy?.lastSettlement || options.settlement || null;
    const unusedPulls = Math.max(0, Math.floor(safeNum(settlement?.unusedPulls, 0)));
    const interestGold = Math.max(0, Math.floor(safeNum(settlement?.interestGold, 0)));
    const totalGoldEarned = Math.max(0, Math.floor(safeNum(settlement?.totalGoldEarned, 0)));

    const summaryText = settlement
      ? `波次击破结算：省下 ${unusedPulls} 杆 → 复利赏金 +${totalGoldEarned || interestGold}G（含利息 +${interestGold}G）· 贪婪 ×${greedMult}`
      : `波次击破奖励：三选一构筑遗物 · 当前贪婪 ×${greedMult}`;

    const cardsHtml = state.pendingRelicDraft
      .slice(0, 3)
      .map((relic, idx) => {
        const candidateId =
          typeof relic === 'string'
            ? relic.replace(/[<>"']/g, '').trim()
            : relic && typeof relic === 'object'
              ? safeToString(relic.id ?? relic.relicId)
                  .replace(/[<>"']/g, '')
                  .trim()
              : '';
        const rawId = candidateId || `relic_${idx}`;
        const catalogEntry = Array.isArray(DEFAULT_RELIC_CATALOG)
          ? DEFAULT_RELIC_CATALOG.find((c) => c && Object.hasOwn(c, 'id') && c.id === rawId)
          : null;
        const info = Object.hasOwn(RELIC_ZH_INFO, rawId) ? RELIC_ZH_INFO[rawId] : null;
        const rawRarity = safeToString(
          (relic && typeof relic === 'object' ? relic.rarity : '') ||
            catalogEntry?.rarity ||
            'common'
        )
          .trim()
          .toLowerCase();
        const rarity = ALLOWED_RARITIES.has(rawRarity) ? rawRarity : 'common';

        const rawNameCandidate =
          info?.zhName ||
          cleanBannerText(
            (relic && typeof relic === 'object' ? safeToString(relic.zhName ?? relic.name) : '') ||
              safeToString(catalogEntry?.zhName ?? catalogEntry?.name)
          )
            .split('(')[0]
            .trim();
        const isInvalidOrSnakeName =
          !rawNameCandidate ||
          rawNameCandidate.includes('_') ||
          /^relic[_\-\s]*\d+$/i.test(rawNameCandidate) ||
          PROTOTYPE_KEY_SET.has(rawNameCandidate.toLowerCase());
        const zhName = isInvalidOrSnakeName ? '深渊秘宝遗物' : rawNameCandidate;

        const rarityZh =
          info?.rarityZh ||
          (rarity === 'mythic' ? '神话' : rarity === 'epic' ? '史诗' : rarity === 'rare' ? '稀有' : '普通');
        const tier =
          info?.tier || (rarity === 'mythic' || rarity === 'epic' ? 4 : rarity === 'rare' ? 3 : 2);

        const rawDescCandidate =
          info?.zhDesc ||
          cleanBannerText(
            (relic && typeof relic === 'object'
              ? safeToString(relic.zhDesc ?? relic.description)
              : '') || safeToString(catalogEntry?.zhDesc ?? catalogEntry?.description)
          );
        const isInvalidOrSnakeDesc =
          !rawDescCandidate ||
          /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(rawDescCandidate) ||
          PROTOTYPE_KEY_SET.has(rawDescCandidate.toLowerCase());
        const zhDesc = isInvalidOrSnakeDesc
          ? '永久强化本局赌狗倍率与构筑收益。'
          : rawDescCandidate;

        return `
          <button
            type="button"
            class="relic-draft-card relic-pick-card rarity-${rarity}"
            data-testid="relic-pick-${idx}"
            data-relic-id="${escapeHtmlSafe(rawId)}"
            data-relic-index="${idx}"
          >
            <div class="relic-pick-top">
              <span class="relic-key-hint">[${idx + 1}] ${escapeHtmlSafe(rarityZh)}</span>
              <span class="relic-card-icon">${renderSprite(rawId, { size: 32, tier })}</span>
            </div>
            <strong class="relic-card-name">${escapeHtmlSafe(zhName)}</strong>
            <span class="relic-card-desc">${escapeHtmlSafe(zhDesc)}</span>
          </button>
        `;
      })
      .join('');

    return `
      <section class="relic-overlay-banner relic-draft-banner" data-testid="relic-draft-banner">
        <div class="relic-draft-header" data-testid="relic-settlement-summary">
          <span class="relic-interest-summary">${escapeHtmlSafe(summaryText)}</span>
          <span class="relic-flow-hint">点击选取或按 [1-3]；直接拉杆将自动收入 1 号遗物</span>
        </div>
        <div class="relic-draft-cards">
          ${cardsHtml}
        </div>
      </section>
    `.trim();
  }

  return '';
}

/**
 * Binds click listeners for `relic-pick-0..2`, `btn-endless-mode`, `btn-new-run`, and `btn-retry-run`.
 * Works identically in real browser DOM and `e2e-harness.js` `MockElement`.
 * @param {HTMLElement|object} containerEl
 * @param {object} [callbacks={}]
 */
export function bindRelicDraftEvents(containerEl, callbacks = {}) {
  if (!containerEl || typeof containerEl.querySelector !== 'function') {
    return;
  }

  for (let i = 0; i < 3; i++) {
    const pickBtn = containerEl.querySelector(`[data-testid="relic-pick-${i}"]`);
    if (pickBtn && typeof pickBtn.addEventListener === 'function') {
      pickBtn.addEventListener('click', () => {
        const relicId =
          typeof pickBtn.getAttribute === 'function' ? pickBtn.getAttribute('data-relic-id') : null;
        if (typeof callbacks.onPickRelic === 'function') {
          callbacks.onPickRelic(relicId, i);
        }
      });
    }
  }

  const endlessBtn = containerEl.querySelector('[data-testid="btn-endless-mode"]');
  if (endlessBtn && typeof endlessBtn.addEventListener === 'function') {
    endlessBtn.addEventListener('click', () => {
      if (typeof callbacks.onEnterEndless === 'function') {
        callbacks.onEnterEndless();
      }
    });
  }

  const newRunBtn = containerEl.querySelector('[data-testid="btn-new-run"]');
  if (newRunBtn && typeof newRunBtn.addEventListener === 'function') {
    newRunBtn.addEventListener('click', () => {
      if (typeof callbacks.onResetRun === 'function') {
        callbacks.onResetRun();
      }
    });
  }

  const retryBtn = containerEl.querySelector('[data-testid="btn-retry-run"]');
  if (retryBtn && typeof retryBtn.addEventListener === 'function') {
    retryBtn.addEventListener('click', () => {
      if (typeof callbacks.onResetRun === 'function') {
        callbacks.onResetRun();
      }
    });
  }
}

/**
 * Optional hotkey helper (`[1]`, `[2]`, `[3]`) for game views while `pendingRelicDraft` is active.
 * @param {KeyboardEvent|object} event
 * @param {object} state
 * @param {object} [callbacks={}]
 * @returns {boolean}
 */
export function handleRelicDraftKeyDown(event, state, callbacks = {}) {
  if (!event || !Array.isArray(state?.pendingRelicDraft) || state.pendingRelicDraft.length === 0) {
    return false;
  }
  const key = safeToString(event.key);
  if (key === '1' || key === '2' || key === '3') {
    const idx = Number(key) - 1;
    const target = state.pendingRelicDraft[idx];
    if (target) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof callbacks.onPickRelic === 'function') {
        const pickedId =
          typeof target === 'string'
            ? target.trim()
            : safeToString(target.id ?? target.relicId).trim() || `relic_${idx}`;
        callbacks.onPickRelic(pickedId, idx);
      }
      return true;
    }
  }
  return false;
}

export default {
  RELIC_ZH_INFO,
  renderRelicDraftHTML,
  bindRelicDraftEvents,
  handleRelicDraftKeyDown,
};
