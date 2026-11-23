import { UPGRADE_LINES, MATERIAL_DEFS } from './upgrades.js';
import { t } from './i18n.js';

/**
 * Village Cart Workshop bottom-bar UI controller.
 * Upgrades only happen inside a village workshop using Gold + Materials.
 */
export function initUpgradeUI({ store, quests, onUpgrade, onRefill, onClose }) {
  const bar = document.getElementById('workshop-bar');
  const titleEl = document.getElementById('ws-title');
  const goldEl = document.getElementById('ws-gold');
  const matsEl = document.getElementById('ws-mats');
  const itemsEl = document.getElementById('ws-items');
  const refillBtn = document.getElementById('btn-ws-refill');
  const closeBtn = document.getElementById('btn-ws-close');

  let isOpen = false;
  let currentWorkshop = null;

  function renderMaterials(gold) {
    if (goldEl) goldEl.textContent = `💰 ${gold} G`;
    if (!matsEl) return;
    matsEl.innerHTML = '';
    for (const [key, def] of Object.entries(MATERIAL_DEFS)) {
      const pill = document.createElement('span');
      pill.className = 'ws-mat-pill';
      pill.textContent = `${def.icon} ${t(def.nameKey)}: ${store.materials[key] || 0}`;
      matsEl.appendChild(pill);
    }
  }

  function formatMissingItems(missingMap) {
    return Object.entries(missingMap || {})
      .map(([mk, miss]) => {
        const def = MATERIAL_DEFS[mk];
        const name = def ? `${def.icon} ${t(def.nameKey)}` : mk;
        return `${name} ×${miss}`;
      })
      .join(', ');
  }

  function renderCards(gold) {
    if (!itemsEl) return;
    itemsEl.innerHTML = '';

    for (const line of UPGRADE_LINES) {
      const curIdx = store.levels[line.key] ?? 0;
      const maxIdx = line.levels.length - 1;
      const curLv = curIdx + 1;
      const isMax = curIdx >= maxIdx;
      const chk = store.canAffordNext(line.key, gold);
      const nextTier = !isMax ? line.levels[curIdx + 1] : line.levels[curIdx];

      const card = document.createElement('div');
      card.className = `ws-card${isMax ? ' maxed' : ''}`;
      card.dataset.key = line.key;

      const top = document.createElement('div');
      top.className = 'ws-card-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ws-card-name';
      nameSpan.textContent = `${line.icon} ${t(line.nameKey)}`;
      const lvSpan = document.createElement('span');
      lvSpan.className = 'ws-card-lv';
      lvSpan.textContent = `Lv.${curLv}/${maxIdx + 1}`;
      top.append(nameSpan, lvSpan);

      const nextEl = document.createElement('div');
      nextEl.className = 'ws-card-next';
      const tierLabel = nextTier ? (nextTier.shortKey ? t(nextTier.shortKey) : nextTier.short) : '';
      nextEl.textContent = isMax
        ? `✓ ${tierLabel}`
        : `→ ${tierLabel} (${nextTier.detail})`;

      const costRow = document.createElement('div');
      costRow.className = 'ws-cost-row';
      if (!isMax && chk.cost) {
        const gChip = document.createElement('span');
        gChip.className = `ws-cost-chip${chk.missingGold > 0 ? ' short' : ''}`;
        gChip.textContent = `🪙 ${chk.cost.gold} G`;
        costRow.appendChild(gChip);

        for (const [mk, req] of Object.entries(chk.cost.items || {})) {
          const mDef = MATERIAL_DEFS[mk];
          const have = store.materials[mk] || 0;
          const mChip = document.createElement('span');
          mChip.className = `ws-cost-chip${have < req ? ' short' : ''}`;
          mChip.textContent = `${mDef ? mDef.icon : ''} ${have}/${req}`;
          mChip.title = mDef ? t(mDef.nameKey) : mk;
          costRow.appendChild(mChip);
        }
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-up-btn';
      if (isMax) {
        btn.disabled = true;
        btn.textContent = t('max_btn');
      } else {
        btn.textContent = chk.ok
          ? t('ws_upgrade_btn')
          : (chk.missingGold > 0
            ? t('not_enough_gold', { g: chk.cost.gold })
            : t('ws_upgrade_btn'));
        btn.addEventListener('click', () => {
          const res = store.upgradeNextWithCost(line.key, quests);
          if (!res.ok) {
            const msg = res.reason === 'gold'
              ? t('ws_need_gold', { g: res.check.cost.gold })
              : t('ws_need_items', { items: formatMissingItems(res.check.missingItems) });
            if (onUpgrade) onUpgrade(line.key, false, msg);
            refresh();
            return;
          }
          const upgradedTier = line.levels[res.newLevel];
          const lvName = upgradedTier.shortKey ? t(upgradedTier.shortKey) : upgradedTier.short;
          const msg = t('ws_upgraded', { name: t(line.nameKey), lv: lvName });
          refresh();
          if (onUpgrade) onUpgrade(line.key, true, msg);
        });
      }

      card.append(top, nextEl, costRow, btn);
      itemsEl.appendChild(card);
    }
  }

  function refresh() {
    const gold = quests ? Math.floor(quests.gold || 0) : 0;
    if (titleEl) {
      titleEl.textContent = t('ws_title', {
        village: currentWorkshop ? currentWorkshop.villageName : 'Village',
      });
    }
    if (refillBtn) refillBtn.textContent = t('ws_refill_btn');
    if (closeBtn) closeBtn.textContent = t('ws_exit');
    renderMaterials(gold);
    renderCards(gold);
  }

  function open(workshopRec = null) {
    currentWorkshop = workshopRec;
    isOpen = true;
    document.body.classList.add('workshop-open');
    if (bar) bar.hidden = false;
    refresh();
  }

  function close() {
    isOpen = false;
    document.body.classList.remove('workshop-open');
    if (bar) bar.hidden = true;
  }

  if (refillBtn) {
    refillBtn.addEventListener('click', () => {
      if (onRefill) onRefill();
      refresh();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      close();
      if (onClose) onClose();
    });
  }

  return {
    open,
    close,
    refresh,
    refreshLang: refresh,
    isOpen: () => isOpen,
    currentWorkshop: () => currentWorkshop,
    setDisabled() { /* no-op */ },
  };
}
