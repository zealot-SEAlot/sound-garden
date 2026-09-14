/* Interface: garden tabs, the active-garden chip, instrument menu, dock controls, pointer + keyboard input, boot. */

const TOAST_MS = 4000;
const UNDO_TOAST_MS = 6000;
const STAGE_GAP = 8;
const MIN_STAGE_HEIGHT = 120;
const CHIP_INSET = 8;

const topbarEl = document.getElementById('topbar');
const dockEl = document.getElementById('dock');
const hintEl = document.getElementById('hint');
const tabListEl = document.getElementById('tabList');
const addGardenBtn = document.getElementById('addGarden');
const chipEl = document.getElementById('paneChip');
const chipNameEl = document.getElementById('paneChipName');
const instrumentMenuEl = document.getElementById('instrumentMenu');
const instrumentButton = document.getElementById('instrumentButton');
const instrumentLabelEl = document.getElementById('instrumentLabel');
const instrumentListEl = document.getElementById('instrumentList');
const playBtn = document.getElementById('play');
const loopInput = document.getElementById('loop');
const loopOut = document.getElementById('loopOut');
const scaleSelect = document.getElementById('scale');
const volumeInput = document.getElementById('volume');
const volumeOut = document.getElementById('volumeOut');
const volumeIcon = document.getElementById('volumeIcon');
const toastEl = document.getElementById('toast');
const toastTextEl = document.getElementById('toastText');
const toastActionEl = document.getElementById('toastAction');

/* ---------- feedback ---------- */
function hideHint() { hintEl.classList.add('gone'); }

let toastTimer = null;
function showToast(message, action = null) {
  toastTextEl.textContent = message;
  toastActionEl.hidden = !action;
  toastActionEl.textContent = action ? action.label : '';
  toastActionEl.onclick = action ? () => { hideToast(); action.onClick(); } : null;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? UNDO_TOAST_MS : TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
}

function setRunning(next) {
  running = next;
  const label = running ? 'Pause' : 'Play';
  playBtn.textContent = running ? '⏸' : '▶';
  playBtn.setAttribute('aria-label', label);
  playBtn.title = `${label} (Space)`;
}

function setVolume(level) {
  volumeLevel = clamp(level, 0, 100);
  volumeInput.value = volumeLevel;
  volumeOut.textContent = `${volumeLevel}%`;
  volumeIcon.textContent = volumeLevel === 0 ? '🔇' : volumeLevel < 50 ? '🔉' : '🔊';
  setOutputVolume(volumeLevel);
}

/* ---------- layout ---------- */
// Gardens share the space between the top bar and the dock; while recording they fill the whole screen.
function relayout() {
  const fullScreen = document.body.classList.contains('recording');
  const top = fullScreen ? 0 : topbarEl.getBoundingClientRect().bottom + STAGE_GAP;
  const bottom = fullScreen ? H : dockEl.getBoundingClientRect().top - STAGE_GAP;
  layoutPanes({ x: 0, y: top, w: W, h: Math.max(MIN_STAGE_HEIGHT, bottom - top) });
  positionChip();
}

function positionChip() {
  const index = gardenIndex(activeGardenId);
  const rect = paneRects[index];
  if (!rect) return;
  chipNameEl.textContent = gardens[index].name;
  chipEl.style.transform = `translate(${Math.round(rect.x + CHIP_INSET)}px, ${Math.round(rect.y + CHIP_INSET)}px)`;
}

/* ---------- garden tabs ---------- */
function makeTab(garden) {
  const isActive = garden.id === activeGardenId;
  const wrap = document.createElement('div');
  wrap.className = `tab${isActive ? ' active' : ''}`;
  wrap.setAttribute('role', 'presentation');
  const tab = document.createElement('button');
  tab.id = `garden-tab-${garden.id}`;
  tab.className = 'tab-name';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(isActive));
  tab.tabIndex = isActive ? 0 : -1;
  tab.textContent = garden.name;
  tab.addEventListener('click', () => setActiveGarden(garden.id));
  tab.addEventListener('keydown', onTabKeydown);
  wrap.append(tab);
  if (gardens.length > 1) {
    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = `Remove ${garden.name}`;
    close.setAttribute('aria-label', `Remove ${garden.name}`);
    close.addEventListener('click', () => removeGarden(garden.id));
    wrap.append(close);
  }
  return wrap;
}

function renderTabs() {
  tabListEl.replaceChildren(...gardens.map(makeTab));
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

/* ---------- instrument menu ---------- */
function renderInstrumentMenu() {
  instrumentListEl.replaceChildren(...INSTRUMENT_NAMES.map((name, i) => {
    const { label, hue } = INSTRUMENTS[name];
    const item = document.createElement('li');
    const dot = document.createElement('span');
    const text = document.createElement('span');
    const key = document.createElement('kbd');
    item.id = `instrument-${name}`;
    item.dataset.instrument = name;
    item.tabIndex = -1;
    item.setAttribute('role', 'option');
    item.style.setProperty('--c', `hsl(${hue},85%,65%)`);
    dot.className = 'dot';
    text.textContent = label;
    key.textContent = String(i + 1);
    item.append(dot, text, key);
    item.addEventListener('click', () => chooseInstrument(name));
    return item;
  }));
}

function selectInstrument(name, { preview = false } = {}) {
  currentInstrument = name;
  const { label, hue } = INSTRUMENTS[name];
  instrumentLabelEl.textContent = label;
  instrumentButton.style.setProperty('--c', `hsl(${hue},85%,65%)`);
  instrumentListEl.querySelectorAll('[role="option"]').forEach((item) => {
    item.setAttribute('aria-selected', String(item.dataset.instrument === name));
  });
  if (preview) {
    ensureAudio();
    playNote({ x: 0.5, y: 0.5, instrument: name });
  }
  save();
}

function chooseInstrument(name) {
  selectInstrument(name, { preview: true });
  closeInstrumentMenu({ focusButton: true });
}

function openInstrumentMenu() {
  instrumentListEl.hidden = false;
  instrumentButton.setAttribute('aria-expanded', 'true');
  document.getElementById(`instrument-${currentInstrument}`)?.focus();
}

function closeInstrumentMenu({ focusButton = false } = {}) {
  if (instrumentListEl.hidden) return;
  instrumentListEl.hidden = true;
  instrumentButton.setAttribute('aria-expanded', 'false');
  if (focusButton) instrumentButton.focus();
}

function onInstrumentListKeydown(e) {
  const options = [...instrumentListEl.querySelectorAll('[role="option"]')];
  const index = options.indexOf(document.activeElement);
  const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 };
  if (e.key in moves) {
    options[(moves[e.key] + options.length) % options.length].focus();
  } else if ((e.key === 'Enter' || e.key === ' ') && index !== -1) {
    chooseInstrument(options[index].dataset.instrument);
  } else if (e.key === 'Escape') {
    closeInstrumentMenu({ focusButton: true });
  } else {
    if (e.key === 'Tab') closeInstrumentMenu();
    return;
  }
  e.preventDefault();
  e.stopPropagation();
}

/* ---------- pointer input ---------- */
function plantAt({ garden, rect }, px, py) {
  if (garden.flowers.length >= MAX_FLOWERS_PER_GARDEN) {
    showToast(`${garden.name} is full (${MAX_FLOWERS_PER_GARDEN} flowers). Add another garden with ＋.`);
    return;
  }
  const f = makeFlower((px - rect.x) / rect.w, snapY((py - rect.y) / rect.h));
  garden.flowers = [...garden.flowers, f];
  trigger(f, rect);
  save();
}

function endDrag() {
  if (!drag) return;
  const { flower, from, over, px, py, moved } = drag;
  drag = null;
  canvas.style.cursor = 'crosshair';
  flower.leaving = false;
  if (!over) {
    removeFlower(from, flower, px, py);
    save();
    return;
  }
  if (!moved) return;
  if (over.garden !== from && over.garden.flowers.length >= MAX_FLOWERS_PER_GARDEN) {
    showToast(`${over.garden.name} is full (${MAX_FLOWERS_PER_GARDEN} flowers).`);
    return;
  }
  const placed = { ...flower, x: clamp((px - over.rect.x) / over.rect.w, 0, 1), y: snapY((py - over.rect.y) / over.rect.h) };
  from.flowers = from.flowers.filter((f) => f !== flower);
  over.garden.flowers = [...over.garden.flowers, placed];
  setActiveGarden(over.garden.id);
  trigger(placed, over.rect);
  save();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  ensureAudio();
  hideHint();
  const target = pointerTarget(e.clientX, e.clientY);
  if (!target) return;
  setActiveGarden(target.garden.id);
  const hit = flowerAt(target, e.clientX, e.clientY);
  if (!hit) {
    plantAt(target, e.clientX, e.clientY);
    return;
  }
  drag = { flower: hit, from: target.garden, over: target, px: e.clientX, py: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (e) => {
  const over = pointerTarget(e.clientX, e.clientY);
  if (!drag) {
    canvas.style.cursor = over && flowerAt(over, e.clientX, e.clientY) ? 'grab' : 'crosshair';
    return;
  }
  drag = { ...drag, over, px: e.clientX, py: e.clientY, moved: true };
  drag.flower.leaving = !over;
});

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const target = pointerTarget(e.clientX, e.clientY);
  const hit = target && flowerAt(target, e.clientX, e.clientY);
  if (!hit) return;
  removeFlower(target.garden, hit, e.clientX, e.clientY);
  save();
});

/* ---------- keyboard ---------- */
function handleEscape() {
  if (recording) stopRecording();
  else if (!instrumentListEl.hidden) closeInstrumentMenu({ focusButton: true });
  else closeResult();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    handleEscape();
    return;
  }
  const el = e.target instanceof Element ? e.target : document.body;
  if (el.closest('input, select, textarea, [role="option"]')) return;
  if (e.key === 'r' || e.key === 'R') {
    if (recording) stopRecording(); else startCountdown();
    return;
  }
  const numbered = INSTRUMENT_NAMES[Number(e.key) - 1];
  if (numbered) {
    selectInstrument(numbered, { preview: true });
    return;
  }
  if (e.code !== 'Space' || recording || el.closest('button, a')) return;   // let focused buttons handle Space
  e.preventDefault();
  ensureAudio();
  setRunning(!running);
});

/* ---------- controls ---------- */
addGardenBtn.addEventListener('click', addGarden);
document.getElementById('surprise').addEventListener('click', surpriseInActiveGarden);
document.getElementById('clear').addEventListener('click', clearActiveGarden);

instrumentButton.addEventListener('click', () => {
  if (instrumentListEl.hidden) openInstrumentMenu(); else closeInstrumentMenu();
});
instrumentButton.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  openInstrumentMenu();
});
instrumentListEl.addEventListener('keydown', onInstrumentListKeydown);
document.addEventListener('pointerdown', (e) => {
  if (!instrumentMenuEl.contains(e.target)) closeInstrumentMenu();
});

playBtn.addEventListener('click', () => { ensureAudio(); setRunning(!running); });

volumeInput.addEventListener('input', () => {
  setVolume(Number(volumeInput.value));
  save();
});

loopInput.addEventListener('input', () => {
  loopSeconds = Number(loopInput.value);
  loopOut.textContent = `${loopSeconds}s`;
  renderRecordLoopOptions();
  save();
});

scaleSelect.addEventListener('change', () => {
  scaleName = scaleSelect.value;
  gardens.forEach((garden) => { garden.flowers = garden.flowers.map((f) => ({ ...f, y: snapY(f.y) })); });
  save();
});

/* ---------- boot ---------- */
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) advance(dt);
  update(dt);
  render(now);
  requestAnimationFrame(frame);
}

gardens = [makeGarden('Garden 1')];
activeGardenId = gardens[0].id;
load();
Object.keys(SCALES).forEach((name) => scaleSelect.add(new Option(name, name)));
scaleSelect.value = scaleName;
loopInput.value = loopSeconds;
loopOut.textContent = `${loopSeconds}s`;
setVolume(volumeLevel);
renderRecordLoopOptions();
renderInstrumentMenu();
selectInstrument(currentInstrument);
renderTabs();
if (gardens.some((g) => g.flowers.length)) {
  document.getElementById('hintText').textContent = 'Welcome back — click anywhere to wake your gardens.';
}
resizeCanvas();
relayout();
window.addEventListener('resize', () => { resizeCanvas(); relayout(); });
if (window.ResizeObserver) {
  const barObserver = new ResizeObserver(relayout);
  barObserver.observe(topbarEl);
  barObserver.observe(dockEl);
}
requestAnimationFrame(frame);
