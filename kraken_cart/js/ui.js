import { HC } from './hc.js';
import { UPGRADE_LINES, MATERIAL_DEFS } from './upgrades.js';
import { t } from './i18n.js';

/**
 * Village Cart Workshop bottom-bar UI controller.
 * Features category tabs, interactive 3D part slide carousel, live cart preview,
 * and direct non-sequential tier upgrades using Gold + Materials.
 */
export function initUpgradeUI({ store, quests, onUpgrade, onPreview, onRefill, onClose }) {
  const bar = document.getElementById('workshop-bar');
  const titleEl = document.getElementById('ws-title');
  const goldEl = document.getElementById('ws-gold');
  const matsEl = document.getElementById('ws-mats');
  const itemsEl = document.getElementById('ws-items');
  const refillBtn = document.getElementById('btn-ws-refill');
  const closeBtn = document.getElementById('btn-ws-close');

  let isOpen = false;
  let currentWorkshop = null;
  let activeKey = UPGRADE_LINES[1]?.key || UPGRADE_LINES[0].key; // default 'wheels'
  let selectedTier = store.levels[activeKey] ?? 0;

  function activeLine() {
    return UPGRADE_LINES.find((l) => l.key === activeKey) || UPGRADE_LINES[0];
  }

  function emitPreview() {
    if (!isOpen || !onPreview) return;
    onPreview(store.previewConfig({ [activeKey]: selectedTier }));
  }

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

  function selectCategory(key) {
    activeKey = key;
    selectedTier = store.levels[key] ?? 0;
    refresh();
    emitPreview();
  }

  function selectTier(idx, scrollCard = true) {
    const line = activeLine();
    const clamped = Math.max(0, Math.min(line.levels.length - 1, idx | 0));
    selectedTier = clamped;
    refresh();
    emitPreview();
    if (scrollCard && itemsEl) {
      const card = itemsEl.querySelector(`.ws-slide-card[data-tier="${clamped}"]`);
      if (card && card.scrollIntoView) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  function renderWorkshopBody(gold) {
    if (!itemsEl) return;
    itemsEl.innerHTML = '';

    const line = activeLine();
    const equippedIdx = store.levels[line.key] ?? 0;
    const maxIdx = line.levels.length - 1;
    selectedTier = Math.max(0, Math.min(maxIdx, selectedTier | 0));

    // 1. Category Tabs
    const tabs = document.createElement('div');
    tabs.className = 'ws-cat-tabs';
    for (const l of UPGRADE_LINES) {
      const curLv = (store.levels[l.key] ?? 0) + 1;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `ws-cat-tab${l.key === activeKey ? ' is-active' : ''}`;
      tab.dataset.key = l.key;
      tab.innerHTML = `<span class="ws-tab-ico">${l.icon}</span><span class="ws-tab-name">${t(l.nameKey)}</span><span class="ws-tab-lv">Lv.${curLv}</span>`;
      tab.addEventListener('click', () => selectCategory(l.key));
      tabs.appendChild(tab);
    }
    itemsEl.appendChild(tabs);

    // 2. Interactive 3D Part Slide Carousel
    const carousel = document.createElement('div');
    carousel.className = 'ws-carousel';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'ws-nav-btn ws-nav-prev';
    prevBtn.textContent = '◀';
    prevBtn.disabled = selectedTier <= 0;
    prevBtn.addEventListener('click', () => selectTier(selectedTier - 1));

    const track = document.createElement('div');
    track.className = 'ws-slide-track';

    for (let idx = 0; idx < line.levels.length; idx++) {
      const lvObj = line.levels[idx];
      const isEquipped = idx === equippedIdx;
      const isUnlocked = store.isUnlocked(line.key, idx);
      const isSelected = idx === selectedTier;
      const chk = store.canAffordLevel(line.key, idx, gold);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `ws-slide-card${isSelected ? ' is-selected' : ''}${isEquipped ? ' is-equipped' : ''}${!isUnlocked && !chk.ok ? ' is-locked-short' : ''}`;
      card.dataset.key = line.key;
      card.dataset.tier = String(idx);

      // Top status badge
      const badge = document.createElement('span');
      badge.className = `ws-slide-badge${isEquipped ? ' equipped' : isUnlocked ? ' owned' : ''}`;
      badge.textContent = isEquipped
        ? t('ws_equipped')
        : isUnlocked
          ? t('ws_owned')
          : `Lv.${idx + 1}`;

      // Real 3D Model Thumbnail
      const stage = document.createElement('div');
      stage.className = 'ws-part-stage';
      const thumbSrc = HC.renderCartPartThumbnail ? HC.renderCartPartThumbnail(line.key, idx) : '';
      if (thumbSrc) {
        const img = document.createElement('img');
        img.className = 'ws-part-img';
        img.src = thumbSrc;
        img.alt = lvObj.shortKey ? t(lvObj.shortKey) : lvObj.short;
        img.draggable = false;
        stage.appendChild(img);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'ws-part-fallback';
        fallback.textContent = line.icon;
        stage.appendChild(fallback);
      }

      const title = document.createElement('div');
      title.className = 'ws-slide-title';
      title.textContent = lvObj.shortKey ? t(lvObj.shortKey) : lvObj.short;

      const detail = document.createElement('div');
      detail.className = 'ws-slide-detail';
      detail.textContent = lvObj.shortKey ? t(`${lvObj.shortKey}_detail`) : (lvObj.detail || '');

      card.append(badge, stage, title, detail);
      card.addEventListener('click', () => selectTier(idx));
      track.appendChild(card);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'ws-nav-btn ws-nav-next';
    nextBtn.textContent = '▶';
    nextBtn.disabled = selectedTier >= maxIdx;
    nextBtn.addEventListener('click', () => selectTier(selectedTier + 1));

    carousel.append(prevBtn, track, nextBtn);
    itemsEl.appendChild(carousel);

    // 3. Bottom Action Bar (below slide)
    const selObj = line.levels[selectedTier];
    const selLabel = selObj.shortKey ? t(selObj.shortKey) : selObj.short;
    const isEquipped = selectedTier === equippedIdx;
    const isUnlocked = store.isUnlocked(line.key, selectedTier);
    const chk = store.canAffordLevel(line.key, selectedTier, gold);

    const actionBar = document.createElement('div');
    actionBar.className = 'ws-action-bar';

    const meta = document.createElement('div');
    meta.className = 'ws-action-meta';

    const selName = document.createElement('div');
    selName.className = 'ws-action-name';
    selName.innerHTML = `${line.icon} <b>${selLabel}</b>${!isEquipped ? ` <span class="ws-preview-pill">${t('ws_previewing')}</span>` : ''}`;

    const hintOrCost = document.createElement('div');
    hintOrCost.className = 'ws-cost-row';
    if (isUnlocked) {
      const hint = document.createElement('span');
      hint.className = 'ws-slide-hint';
      hint.textContent = t('ws_slide_hint');
      hintOrCost.appendChild(hint);
    } else if (chk.cost) {
      const gChip = document.createElement('span');
      gChip.className = `ws-cost-chip${chk.missingGold > 0 ? ' short' : ''}`;
      gChip.textContent = `🪙 ${chk.cost.gold} G`;
      hintOrCost.appendChild(gChip);
      for (const [mk, req] of Object.entries(chk.cost.items || {})) {
        const mDef = MATERIAL_DEFS[mk];
        const have = store.materials[mk] || 0;
        const mChip = document.createElement('span');
        mChip.className = `ws-cost-chip${have < req ? ' short' : ''}`;
        mChip.textContent = `${mDef ? mDef.icon : ''} ${have}/${req}`;
        mChip.title = mDef ? t(mDef.nameKey) : mk;
        hintOrCost.appendChild(mChip);
      }
    }
    meta.append(selName, hintOrCost);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'vintage-pill-btn ws-action-btn';
    if (isEquipped) {
      actionBtn.disabled = true;
      actionBtn.textContent = t('ws_equipped');
    } else if (isUnlocked) {
      actionBtn.textContent = t('ws_equip_btn');
      actionBtn.addEventListener('click', () => {
        const res = store.upgradeToLevelWithCost(line.key, selectedTier, quests);
        if (res.ok) {
          refresh();
          if (onUpgrade) onUpgrade(line.key, true, t('ws_upgraded', { name: t(line.nameKey), lv: selLabel }));
        }
      });
    } else {
      actionBtn.textContent = chk.ok
        ? t('ws_upgrade_to', { lv: selectedTier + 1 })
        : (chk.missingGold > 0
          ? t('not_enough_gold', { g: chk.cost.gold })
          : t('ws_upgrade_to', { lv: selectedTier + 1 }));
      actionBtn.addEventListener('click', () => {
        const res = store.upgradeToLevelWithCost(line.key, selectedTier, quests);
        if (!res.ok) {
          const msg = res.reason === 'gold'
            ? t('ws_need_gold', { g: res.check.cost.gold })
            : t('ws_need_items', { items: formatMissingItems(res.check.missingItems) });
          if (onUpgrade) onUpgrade(line.key, false, msg);
          refresh();
          return;
        }
        const msg = t('ws_upgraded', { name: t(line.nameKey), lv: selLabel });
        if (HC.VintageGUI && HC.VintageGUI.playSfx) HC.VintageGUI.playSfx('confirm');
        refresh();
        if (onUpgrade) onUpgrade(line.key, true, msg);
      });
    }

    actionBar.append(meta, actionBtn);
    itemsEl.appendChild(actionBar);
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
    renderWorkshopBody(gold);
  }

  function open(workshopRec = null) {
    currentWorkshop = workshopRec;
    isOpen = true;
    selectedTier = store.levels[activeKey] ?? 0;
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
    selectCategory,
    selectTier,
    setDisabled() { /* no-op */ },
  };
}
