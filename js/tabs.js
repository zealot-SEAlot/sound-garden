/* Garden tabs: the tab strip, adding / removing / muting gardens, and the active garden's corner chip. */

const CHIP_INSET = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

const tabListEl = document.getElementById('tabList');
const addGardenBtn = document.getElementById('addGarden');
const chipEl = document.getElementById('paneChip');
const chipNameEl = document.getElementById('paneChipName');
const chipMutedEl = document.getElementById('paneChipMuted');

function iconEl(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const use = document.createElementNS(SVG_NS, 'use');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function positionChip() {
  const index = gardenIndex(activeGardenId);
  const rect = paneRects[index];
  if (!rect) return;
  chipNameEl.textContent = gardens[index].name;
  chipMutedEl.hidden = !gardens[index].muted;
  chipEl.style.transform = `translate(${Math.round(rect.x + CHIP_INSET)}px, ${Math.round(rect.y + CHIP_INSET)}px)`;
}

/* ---------- tab strip ---------- */
function makeTabButton({ id, className, icon, label, title, onClick }) {
  const btn = document.createElement('button');
  if (id) btn.id = id;
  btn.className = className;
  btn.title = title;
  btn.setAttribute('aria-label', label);
  btn.append(iconEl(icon));
  btn.addEventListener('click', onClick);
  return btn;
}

function makeTab(garden) {
  const isActive = garden.id === activeGardenId;
  const wrap = document.createElement('div');
  wrap.className = ['tab', isActive && 'active', garden.muted && 'muted'].filter(Boolean).join(' ');
  wrap.setAttribute('role', 'presentation');
  const mute = makeTabButton({
    id: `garden-mute-${garden.id}`, className: 'tab-mute', icon: garden.muted ? 'volume-off' : 'volume',
    label: `Mute ${garden.name}`, title: garden.muted ? 'Unmute (M)' : 'Mute (M)',
    onClick: () => toggleGardenMute(garden.id),
  });
  mute.setAttribute('aria-pressed', String(garden.muted));
  const tab = document.createElement('button');
  tab.id = `garden-tab-${garden.id}`;
  tab.className = 'tab-name';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(isActive));
  tab.tabIndex = isActive ? 0 : -1;
  tab.textContent = garden.name;
  tab.addEventListener('click', () => setActiveGarden(garden.id));
  tab.addEventListener('keydown', onTabKeydown);
  wrap.append(mute, tab);
  if (gardens.length > 1) {
    wrap.append(makeTabButton({
      className: 'tab-close', icon: 'close', label: `Remove ${garden.name}`, title: `Remove ${garden.name}`,
      onClick: () => removeGarden(garden.id),
    }));
  }
  return wrap;
}

function renderTabs() {
  const focusedId = document.activeElement?.id;   // re-rendering replaces the buttons, so carry keyboard focus across
  tabListEl.replaceChildren(...gardens.map(makeTab));
  if (focusedId && focusedId.startsWith('garden-')) document.getElementById(focusedId)?.focus();
  const full = gardens.length >= MAX_GARDENS;
  addGardenBtn.disabled = full;
  addGardenBtn.title = full ? `Up to ${MAX_GARDENS} gardens for now` : 'Add a garden that plays alongside the others';
}

function onTabKeydown(e) {
  const index = gardenIndex(activeGardenId);
  const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: gardens.length - 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  const next = gardens[clamp(moves[e.key], 0, gardens.length - 1)];
  setActiveGarden(next.id);
  document.getElementById(`garden-tab-${next.id}`)?.focus();
}

/* ---------- garden actions ---------- */
function setActiveGarden(id) {
  if (gardenIndex(id) === -1) return;
  if (id !== activeGardenId) {
    activeGardenId = id;
    renderTabs();
    document.getElementById(`garden-tab-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    save();
  }
  positionChip();
}

function toggleGardenMute(id) {
  const garden = gardens[gardenIndex(id)];
  if (!garden) return;
  garden.muted = !garden.muted;
  setGardenMuted(garden);
  renderTabs();
  positionChip();
  save();
}

function addGarden() {
  if (gardens.length >= MAX_GARDENS || recording) return;
  const garden = makeGarden();
  gardens = [...gardens, garden];
  renderTabs();
  relayout();
  setActiveGarden(garden.id);
  save();
}

function removeGarden(id) {
  const index = gardenIndex(id);
  if (index === -1 || gardens.length <= 1) return;
  const removed = gardens[index];
  gardens = gardens.filter((g) => g.id !== id);
  if (activeGardenId === id) activeGardenId = gardens[Math.min(index, gardens.length - 1)].id;
  renderTabs();
  relayout();
  save();
  showToast(`${removed.name} removed`, { label: 'Undo', onClick: () => restoreGarden(removed, index) });
}

function restoreGarden(garden, index) {
  if (gardenIndex(garden.id) !== -1) return;
  if (gardens.length >= MAX_GARDENS) {
    showToast(`Couldn't bring back ${garden.name}: you already have ${MAX_GARDENS} gardens.`);
    return;
  }
  gardens = [...gardens.slice(0, index), garden, ...gardens.slice(index)];
  renderTabs();
  relayout();
  setActiveGarden(garden.id);
  save();
}

function surpriseInActiveGarden() {
  const index = gardenIndex(activeGardenId);
  const garden = gardens[index];
  const room = Math.min(SURPRISE_COUNT, MAX_FLOWERS_PER_GARDEN - garden.flowers.length);
  ensureAudio();
  hideHint();
  if (room <= 0) {
    showToast(`${garden.name} is full (${MAX_FLOWERS_PER_GARDEN} flowers).`);
    return;
  }
  const fresh = Array.from({ length: room }, () =>
    makeFlower(0.05 + Math.random() * 0.9, snapY(0.1 + Math.random() * 0.7), randomInstrument()));
  garden.flowers = [...garden.flowers, ...fresh];
  fresh.forEach((f) => {
    const p = flowerPoint(f, paneRects[index]);
    burst(p.x, p.y, hueOf(f), 8);
  });
  save();
}

function clearActiveGarden() {
  const index = gardenIndex(activeGardenId);
  const garden = gardens[index];
  if (!garden.flowers.length) return;
  const previous = garden.flowers;
  previous.forEach((f) => {
    const p = flowerPoint(f, paneRects[index]);
    burst(p.x, p.y, hueOf(f), 3, true);
  });
  garden.flowers = [];
  save();
  showToast(`Cleared ${garden.name}`, {
    label: 'Undo',
    onClick: () => {
      garden.flowers = [...previous, ...garden.flowers].slice(0, MAX_FLOWERS_PER_GARDEN);
      save();
    },
  });
}

addGardenBtn.addEventListener('click', addGarden);
document.getElementById('surprise').addEventListener('click', surpriseInActiveGarden);
document.getElementById('clear').addEventListener('click', clearActiveGarden);
