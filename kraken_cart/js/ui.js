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
  const toggleTop = document.getElementById('btn-ug-toggle-top');
  const panel = document.getElementById('upgrade-panel');
  const cards = new Map();

  for (const line of UPGRADE_LINES) {
    const card = lineCard(line, onSelect);
    list.appendChild(card);
    cards.set(line.key, card);
  }

  function syncToggleText() {
    if (!panel) return;
    const isCollapsed = panel.classList.contains('collapsed');
    if (toggle) toggle.textContent = isCollapsed ? 'Buka' : 'Tutup';
    if (toggleTop) toggleTop.classList.toggle('active', !isCollapsed);
  }

  // Bengkel selalu dimulai terlipat supaya layar lega baik di PC maupun Mobile
  if (panel && !panel.dataset.userToggled) {
    panel.classList.add('collapsed');
  }
  syncToggleText();

  const onToggleClick = (e) => {
    e.preventDefault();
    if (!panel) return;
    panel.dataset.userToggled = '1';
    panel.classList.toggle('collapsed');
    syncToggleText();
  };
  if (toggle && panel) toggle.addEventListener('click', onToggleClick);
  if (toggleTop && panel) toggleTop.addEventListener('click', onToggleClick);
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
