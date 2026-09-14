/* Garden state: gardens and their flowers, the shared loop clock, split-screen layout, and saving. */

const MAX_GARDENS = 8;
const MAX_FLOWERS_PER_GARDEN = 300;
const MAX_NAME_LENGTH = 24;
const FLOWER_RADIUS_MAX = 14;
const FLOWER_RADIUS_MIN = 7;
const FLOWER_HIT_SCALE = 1.8;         // how far from a flower's centre a click still grabs it, in radii
const EDGE_MARGIN = 16;               // px from the window edge that counts as "off-screen"
const SURPRISE_COUNT = 9;
const STORAGE_KEY = 'sound-garden-v1'; // original key kept so older saves still load (see load)
const SAVE_DELAY_MS = 400;            // batch quick changes into one write: saving 2,400 flowers takes ~10 ms
const MAX_FRAME_SECONDS = 0.25;       // keeps tempo steady when frames drop without jumping after a long stall
const MAX_NOTES_PER_FRAME = 32;       // past this, flowers still glow but stay silent so audio can't overload
const MAX_SPARKLES = 1200;
const MIN_LOOP_SECONDS = 4;
const MAX_LOOP_SECONDS = 32;          // long enough for a short song at a relaxed tempo
const TARGET_PANE_ASPECT = 2.4;       // favour wide panes: the loop runs left to right, so width is time
const EMPTY_CELL_PENALTY = 0.35;
const MIN_COMFORTABLE_PANE_HEIGHT = 220;
const SHORT_PANE_PENALTY = 1;

let gardens = [];
let activeGardenId = null;
let nextGardenId = 1;
let paneRects = [];
let sparkles = [];
let currentInstrument = DEFAULT_INSTRUMENT;
let loopSeconds = 8;
let phase = 0;
let running = true;
let drag = null;                      // { flower, from, over, px, py, moved }
let saveTimer = null;

const hueOf = (f) => INSTRUMENTS[f.instrument].hue;
const validInstrument = (name) => (INSTRUMENTS[name] ? name : DEFAULT_INSTRUMENT);
const randomInstrument = () => INSTRUMENT_NAMES[Math.floor(Math.random() * INSTRUMENT_NAMES.length)];
const gardenIndex = (id) => gardens.findIndex((g) => g.id === id);
const flowerRadius = (rect) => clamp(Math.min(rect.w, rect.h) / 36, FLOWER_RADIUS_MIN, FLOWER_RADIUS_MAX);
const flowerPoint = (f, rect) => ({ x: rect.x + f.x * rect.w, y: rect.y + f.y * rect.h });

function makeFlower(x, y, instrument = currentInstrument) {
  return { x, y, instrument, petals: INSTRUMENTS[instrument].petals, glow: 0, spin: Math.random() * TAU, leaving: false };
}

function nextGardenName() {
  const taken = new Set(gardens.map((g) => g.name));
  let n = 1;
  while (taken.has(`Garden ${n}`)) n += 1;
  return `Garden ${n}`;
}

function makeGarden(name = nextGardenName(), flowers = [], muted = false) {
  return { id: nextGardenId++, name, flowers, muted };
}

/* ---------- split-screen layout ---------- */
// Pick the grid whose panes are wide (width is time) yet tall enough to read the notes, with few empty cells.
function gridFor(count, area) {
  let best = { cols: 1, rows: count, score: Infinity };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const paneHeight = area.h / rows;
    const aspect = (area.w / cols) / paneHeight;
    const score = Math.abs(Math.log(aspect / TARGET_PANE_ASPECT))
      + (cols * rows - count) * EMPTY_CELL_PENALTY
      + (paneHeight < MIN_COMFORTABLE_PANE_HEIGHT ? SHORT_PANE_PENALTY : 0);
    if (score < best.score) best = { cols, rows, score };
  }
  return best;
}

function layoutPanes(area) {
  const { cols, rows } = gridFor(gardens.length, area);
  const rowHeight = area.h / rows;
  const lastRowCount = gardens.length - cols * (rows - 1);
  paneRects = gardens.map((_, i) => {
    const row = Math.floor(i / cols);
    const width = area.w / (row === rows - 1 ? lastRowCount : cols);   // last row stretches to fill
    return { x: area.x + (i - row * cols) * width, y: area.y + row * rowHeight, w: width, h: rowHeight };
  });
}

function paneAt(px, py) {
  return paneRects.findIndex((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
}

function pointerTarget(px, py) {
  const nearWindowEdge = px < EDGE_MARGIN || py < EDGE_MARGIN || px > W - EDGE_MARGIN || py > H - EDGE_MARGIN;
  const index = paneAt(px, py);
  if (index === -1 || nearWindowEdge || !gardens[index]) return null;
  return { garden: gardens[index], rect: paneRects[index] };
}

function flowerAt({ garden, rect }, px, py) {
  const reach = flowerRadius(rect) * FLOWER_HIT_SCALE;
  const reachSq = reach * reach;
  for (let i = garden.flowers.length - 1; i >= 0; i--) {
    const f = garden.flowers[i];
    const dx = rect.x + f.x * rect.w - px;
    const dy = rect.y + f.y * rect.h - py;
    if (dx * dx + dy * dy < reachSq) return f;
  }
  return null;
}

/* ---------- flowers and effects ---------- */
function burst(x, y, hue, count, fall = false) {
  const room = Math.min(count, MAX_SPARKLES - sparkles.length);
  for (let i = 0; i < room; i++) {
    const a = Math.random() * TAU;
    const s = 20 + Math.random() * 60;
    sparkles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (fall ? 40 : -30), life: 1, hue });
  }
}

function trigger(f, rect, garden, withSound = true) {
  f.glow = 1;
  const p = flowerPoint(f, rect);
  burst(p.x, p.y, hueOf(f), 6);
  if (withSound) playNote(f, garden);
}

function removeFlower(garden, flower, x, y) {
  burst(x, y, hueOf(flower), 14, true);
  garden.flowers = garden.flowers.filter((f) => f !== flower);
}

/* ---------- shared loop clock ---------- */
function advance(dt) {
  const prev = phase;
  const next = phase + dt / loopSeconds;
  const wrapped = next >= 1;
  const finishing = wrapped && isFinalRecordedLoop();   // don't start the next loop's notes in a recording
  phase = finishing ? 0 : next % 1;
  const crossed = (f) => (wrapped ? f.x > prev || (!finishing && f.x <= phase) : f.x > prev && f.x <= phase);
  let notes = 0;
  gardens.forEach((garden, i) => {
    const rect = paneRects[i];
    if (!rect) return;
    for (const f of garden.flowers) {
      if (f === drag?.flower || !crossed(f)) continue;
      const audible = !garden.muted && notes < MAX_NOTES_PER_FRAME;   // muted gardens glow without using the note budget
      trigger(f, rect, garden, audible);
      if (audible) notes += 1;
    }
  });
  if (wrapped) onLoopWrapped();
}

function update(dt) {
  const decay = Math.exp(-dt * 3);
  for (const garden of gardens) {
    for (const f of garden.flowers) {
      f.glow *= decay;
      f.spin += dt * (0.15 + f.glow);
    }
  }
  // Sparkles update in place: copying hundreds of short-lived particles every frame churns memory for no benefit.
  let kept = 0;
  for (const s of sparkles) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 30 * dt;
    s.life -= dt * 1.2;
    if (s.life > 0) sparkles[kept++] = s;
  }
  sparkles.length = kept;
}

/* ---------- saving ---------- */
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

function flushSave() {
  if (saveTimer) saveNow();
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const data = {
      version: 2, scaleName, loopSeconds, volume: volumeLevel, recordLoops, instrument: currentInstrument,
      activeGarden: Math.max(0, gardenIndex(activeGardenId)),
      gardens: gardens.map(({ name, muted, flowers }) => ({
        name, muted, flowers: flowers.map(({ x, y, instrument }) => ({ x, y, instrument })),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage unavailable (private window) — gardens just won't persist */ }
}

function parseGarden(saved, index) {
  const rawName = typeof saved?.name === 'string' ? saved.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const flowers = (Array.isArray(saved?.flowers) ? saved.flowers : [])
    .filter((f) => Number.isFinite(f?.x) && Number.isFinite(f?.y))
    .slice(0, MAX_FLOWERS_PER_GARDEN)
    .map((f) => makeFlower(clamp(f.x, 0, 1), clamp(f.y, 0, 1), validInstrument(f.instrument)));
  return makeGarden(rawName || `Garden ${index + 1}`, flowers, saved?.muted === true);
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data) return;
    if (SCALES[data.scaleName]) scaleName = data.scaleName;
    if (Number.isFinite(data.loopSeconds)) loopSeconds = clamp(data.loopSeconds, MIN_LOOP_SECONDS, MAX_LOOP_SECONDS);
    if (Number.isFinite(data.volume)) volumeLevel = clamp(data.volume, 0, 100);
    if (RECORD_LOOP_CHOICES.includes(data.recordLoops)) recordLoops = data.recordLoops;
    currentInstrument = validInstrument(data.instrument);
    // Older (v1) saves held a single `flowers` list; v2 saves hold `gardens`.
    const saved = Array.isArray(data.gardens) ? data.gardens : [{ flowers: data.flowers }];
    const restored = saved.slice(0, MAX_GARDENS).map(parseGarden);
    if (!restored.length) return;
    gardens = restored;
    activeGardenId = restored[clamp(Number(data.activeGarden) || 0, 0, restored.length - 1)].id;
  } catch { /* corrupt or blocked storage — start fresh */ }
}
