/* Interface: feedback, layout, instrument menu, shortcuts panel, dock controls, pointer + keyboard input, boot. */

const TOAST_MS = 4000;
const UNDO_TOAST_MS = 6000;
const STAGE_GAP = 8;
const MIN_STAGE_HEIGHT = 120;

const topbarEl = document.getElementById('topbar');
const dockEl = document.getElementById('dock');
const hintEl = document.getElementById('hint');
const instrumentMenuEl = document.getElementById('instrumentMenu');
const instrumentButton = document.getElementById('instrumentButton');
const instrumentLabelEl = document.getElementById('instrumentLabel');
const instrumentListEl = document.getElementById('instrumentList');
const helpButton = document.getElementById('helpButton');
const helpPanel = document.getElementById('helpPanel');
const playBtn = document.getElementById('play');
const playIcon = document.getElementById('playIcon');
const loopInput = document.getElementById('loop');
const loopOut = document.getElementById('loopOut');
const scaleSelect = document.getElementById('scale');
const volumeInput = document.getElementById('volume');
const volumeOut = document.getElementById('volumeOut');
const volumeToggle = document.getElementById('volumeToggle');
const volumeIcon = document.getElementById('volumeIcon');
const toastEl = document.getElementById('toast');
const toastTextEl = document.getElementById('toastText');
const toastActionEl = document.getElementById('toastAction');

let toastTimer = null;
let volumeBeforeMute = DEFAULT_VOLUME;

const setIcon = (useEl, name) => useEl.setAttribute('href', `#i-${name}`);

/* ---------- feedback ---------- */
function hideHint() { hintEl.classList.add('gone'); }

// Panels and messages sit just under the top bar, which grows to two rows on narrow screens.
function placeBelowTopbar(el) {
  el.style.top = `${Math.round(topbarEl.getBoundingClientRect().bottom + STAGE_GAP)}px`;
}

function showToast(message, action = null) {
  toastTextEl.textContent = message;
  toastActionEl.hidden = !action;
  toastActionEl.textContent = action ? action.label : '';
  toastActionEl.onclick = action ? () => { hideToast(); action.onClick(); } : null;
  placeBelowTopbar(toastEl);
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
  setIcon(playIcon, running ? 'pause' : 'play');
  playBtn.setAttribute('aria-label', label);
  playBtn.title = `${label} (Space)`;
}

function setVolume(level) {
  volumeLevel = clamp(level, 0, 100);
  if (volumeLevel > 0) volumeBeforeMute = volumeLevel;
  volumeInput.value = volumeLevel;
  volumeOut.textContent = `${volumeLevel}%`;
  setIcon(volumeIcon, volumeLevel === 0 ? 'volume-off' : volumeLevel < 50 ? 'volume-low' : 'volume');
  volumeToggle.setAttribute('aria-pressed', String(volumeLevel === 0));
  volumeToggle.title = volumeLevel === 0 ? 'Unmute all' : 'Mute all (speakers only)';
  setOutputVolume(volumeLevel);
}

function syncMusicControls() {
  scaleSelect.value = scaleName;
  loopInput.value = loopSeconds;
  loopOut.textContent = `${loopSeconds}s`;
  renderRecordLoopOptions();
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
  closeHelp();
  closeLibrary();
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

/* ---------- shortcuts panel ---------- */
function openHelp() {
  closeInstrumentMenu();
  closeLibrary();
  placeBelowTopbar(helpPanel);
  helpPanel.hidden = false;
  helpButton.setAttribute('aria-expanded', 'true');
}

function closeHelp({ focusButton = false } = {}) {
  if (helpPanel.hidden) return;
  helpPanel.hidden = true;
  helpButton.setAttribute('aria-expanded', 'false');
  if (focusButton) helpButton.focus();
}

function toggleHelp() {
  if (helpPanel.hidden) openHelp(); else closeHelp();
}

/* ---------- pointer input ---------- */
function plantAt({ garden, rect }, px, py) {
  if (garden.flowers.length >= MAX_FLOWERS_PER_GARDEN) {
    showToast(`${garden.name} is full (${MAX_FLOWERS_PER_GARDEN} flowers). Add another garden with ＋.`);
    return;
  }
  const f = makeFlower((px - rect.x) / rect.w, snapY((py - rect.y) / rect.h));
  garden.flowers = [...garden.flowers, f];
  trigger(f, rect, garden);
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
  trigger(placed, over.rect, over.garden);
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
  else if (!libraryPanel.hidden) closeLibrary({ focusButton: true });
  else if (!helpPanel.hidden) closeHelp({ focusButton: true });
  else closeResult();
}

function handleShortcut(key) {
  const lower = key.toLowerCase();
  if (lower === 'r') {
    if (recording) stopRecording(); else startCountdown();
  } else if (lower === 'm') {
    toggleGardenMute(activeGardenId);
  } else if (lower === 'l') {
    toggleLibrary();
  } else if (key === '?') {
    toggleHelp();
  } else if (INSTRUMENT_NAMES[Number(key) - 1]) {
    selectInstrument(INSTRUMENT_NAMES[Number(key) - 1], { preview: true });
  } else {
    return false;
  }
  return true;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    handleEscape();
    return;
  }
  const el = e.target instanceof Element ? e.target : document.body;
  if (el.closest('input, select, textarea, [role="option"]')) return;
  if (handleShortcut(e.key)) return;
  if (e.code !== 'Space' || recording || el.closest('button, a')) return;   // let focused buttons handle Space
  e.preventDefault();
  ensureAudio();
  setRunning(!running);
});

/* ---------- controls ---------- */
instrumentButton.addEventListener('click', () => {
  if (instrumentListEl.hidden) openInstrumentMenu(); else closeInstrumentMenu();
});
instrumentButton.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  openInstrumentMenu();
});
instrumentListEl.addEventListener('keydown', onInstrumentListKeydown);
helpButton.addEventListener('click', toggleHelp);
document.addEventListener('pointerdown', (e) => {
  if (!instrumentMenuEl.contains(e.target)) closeInstrumentMenu();
  if (!helpPanel.contains(e.target) && !helpButton.contains(e.target)) closeHelp();
  if (!libraryPanel.contains(e.target) && !libraryButton.contains(e.target)) closeLibrary();
});

playBtn.addEventListener('click', () => { ensureAudio(); setRunning(!running); });

volumeToggle.addEventListener('click', () => {
  ensureAudio();
  setVolume(volumeLevel === 0 ? volumeBeforeMute : 0);
  save();
});

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
loopInput.min = MIN_LOOP_SECONDS;
loopInput.max = MAX_LOOP_SECONDS;
syncMusicControls();
setVolume(volumeLevel);
renderInstrumentMenu();
selectInstrument(currentInstrument);
renderTabs();
if (gardens.some((g) => g.flowers.length)) {
  document.getElementById('hintText').textContent = 'Welcome back — click anywhere to wake your gardens.';
}
resizeCanvas();
relayout();
window.addEventListener('resize', () => { resizeCanvas(); relayout(); });
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
if (window.ResizeObserver) {
  const barObserver = new ResizeObserver(relayout);
  barObserver.observe(topbarEl);
  barObserver.observe(dockEl);
}
requestAnimationFrame(frame);
