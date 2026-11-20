import { UPGRADE_LINES } from './upgrades.js';

function lineCard(line, onSelect) {
  const card = document.createElement('div');
  card.className = 'up-card';
  card.dataset.key = line.key;

  const head = document.createElement('div');
  head.className = 'up-head';
  head.innerHTML = '<span class="up-name">' + line.name + '</span>' +
    '<span class="up-detail" data-detail></span>';
  card.appendChild(head);

  const seg = document.createElement('div');
  seg.className = 'up-seg';
  line.levels.forEach((lv, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.level = String(idx);
    b.dataset.buy = '';
    b.textContent = lv.short || lv.label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onSelect(line.key, idx);
    });
    seg.appendChild(b);
  });
  card.appendChild(seg);

  return card;
}

export function initUpgradeUI({ store, onSelect, onPreset }) {
  const list = document.getElementById('upgrade-list');
  const totalEl = document.getElementById('upgrade-total');
  const resetBtn = document.getElementById('btn-ug-reset');
  const minBtn = document.getElementById('btn-ug-min');
  const maxBtn = document.getElementById('btn-ug-max');
  const toggle = document.getElementById('btn-ug-toggle');
  const panel = document.getElementById('upgrade-panel');
  const hud = document.getElementById('hud');
  const hudToggle = document.getElementById('btn-hud-toggle');
  const cards = new Map();

  for (const line of UPGRADE_LINES) {
    const card = lineCard(line, onSelect);
    list.appendChild(card);
    cards.set(line.key, card);
  }

  function syncToggleText() {
    if (!toggle || !panel) return;
    const isCollapsed = panel.classList.contains('collapsed');
    toggle.textContent = isCollapsed ? 'Buka' : 'Lipat';
  }

  function syncHudToggle() {
    if (!hud || !hudToggle) return;
    const isCompact = hud.classList.contains('compact');
    hudToggle.textContent = isCompact ? 'Detail' : 'Ringkas';
  }

  // On smaller/split screens, collapse workshop & compact HUD by default so 3D gameplay stays unobstructed
  function syncResponsiveLayout() {
    if (panel && window.innerWidth <= 1024 && !panel.dataset.userToggled) {
      panel.classList.add('collapsed');
    }
    if (hud && (window.innerWidth <= 768 || window.innerHeight <= 600) && !hud.dataset.userToggled) {
      hud.classList.add('compact');
    }
    syncToggleText();
    syncHudToggle();
  }
  syncResponsiveLayout();
  window.addEventListener('resize', syncResponsiveLayout);

  if (hud && hudToggle) {
    hudToggle.addEventListener('click', (e) => {
      e.preventDefault();
      hud.dataset.userToggled = '1';
      hud.classList.toggle('compact');
      syncHudToggle();
    });
  }

  if (toggle && panel) {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      panel.dataset.userToggled = '1';
      panel.classList.toggle('collapsed');
      syncToggleText();
    });
  }
  if (resetBtn) resetBtn.addEventListener('click', (e) => { e.preventDefault(); onPreset('default'); });
  if (minBtn) minBtn.addEventListener('click', (e) => { e.preventDefault(); onPreset('min'); });
  if (maxBtn) maxBtn.addEventListener('click', (e) => { e.preventDefault(); onPreset('max'); });

  function refresh() {
    let total = 0;
    for (const line of UPGRADE_LINES) {
      const card = cards.get(line.key);
      const lvl = store.levels[line.key] ?? 0;
      total += lvl + 1;
      const detail = card.querySelector('[data-detail]');
      detail.textContent = line.levels[lvl].detail;
      card.querySelectorAll('.seg-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === lvl);
      });
    }
    if (totalEl) totalEl.textContent = 'Bebas Pilih • ' + total + '/' + (UPGRADE_LINES.length * 3);
    syncToggleText();
  }

  refresh();
  return { refresh, syncToggleText };
}
