/* Drawing: the night sky, one pane per garden, flowers and sparkles. */

const HALO_SPRITE_SIZE = 128;
const FLOWER_SPRITE_SCALE = 2.5;     // sprite width in flower radii (petals reach ~1.22 radii from the centre)
const LIGHTNESS_STEP = 4;            // flower sprites are cached per 4% lightness band...
const RADIUS_STEP = 0.5;             // ...and per half device pixel of radius, so each one draws 1:1 without resampling
const MAX_CACHED_SPRITES = 1500;
const LAYER_REFRESHES_PER_FRAME = 1; // resting layers repainted per frame, round-robin, so their slow spin keeps moving
const RESTING_HALO_ALPHA = 0.2;
const GLOW_HALO_ALPHA = 0.5;
const GLOW_GROWTH = 0.7;
const GLOW_EPSILON = 0.01;
const MUTED_PANE_ALPHA = 0.35;
const LEAVING_ALPHA = 0.3;

const canvas = document.getElementById('garden');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1;
let layerCursor = 0;

const stars = Array.from({ length: 160 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, tw: Math.random() * TAU,
}));

// Caches. With 2,400 flowers, drawing every flower (a soft glow plus rotated petals) each frame was the whole cost of a
// frame. Flowers use images made at their exact size, and each garden's resting flowers are painted into one layer
// that is repainted when the garden changes and otherwise one garden per frame; flowers lit by the beam draw live on top.
const haloSprites = new Map();       // hue -> soft glow
const flowerSprites = new Map();     // `${instrument}|${lightness}|${radius}` -> petals + centre at exact device size
const gardenLayers = new Map();      // garden id -> { canvas, flowers, dragged, rect, dpr, members, ox, oy }
const sparkleColors = new Map();     // hue -> colour string

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeSprite(width, height = width) {
  const sprite = document.createElement('canvas');
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

function haloSprite(hue) {
  if (!haloSprites.has(hue)) {
    const sprite = makeSprite(HALO_SPRITE_SIZE);
    const sctx = sprite.getContext('2d');
    const mid = HALO_SPRITE_SIZE / 2;
    const g = sctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, `hsla(${hue},90%,70%,1)`);
    g.addColorStop(1, `hsla(${hue},90%,60%,0)`);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, HALO_SPRITE_SIZE, HALO_SPRITE_SIZE);
    haloSprites.set(hue, sprite);
  }
  return haloSprites.get(hue);
}

function paintFlowerSprite({ hue, petals }, lightness, r) {
  const size = Math.ceil(r * FLOWER_SPRITE_SCALE) + 2;
  const sprite = makeSprite(size);
  const sctx = sprite.getContext('2d');
  const mid = size / 2;
  sctx.fillStyle = `hsl(${hue},85%,${lightness}%)`;
  sctx.beginPath();
  for (let i = 0; i < petals; i++) {
    const a = (i * TAU) / petals;
    const ex = mid + Math.cos(a) * r * 0.6;
    const ey = mid + Math.sin(a) * r * 0.6;
    sctx.moveTo(ex + Math.cos(a) * r * 0.62, ey + Math.sin(a) * r * 0.62);
    sctx.ellipse(ex, ey, r * 0.62, r * 0.3, a, 0, TAU);
  }
  sctx.fill();
  sctx.fillStyle = `hsl(${(hue + 40) % 360},100%,${Math.min(95, lightness + 30)}%)`;
  sctx.beginPath();
  sctx.arc(mid, mid, r * 0.28, 0, TAU);
  sctx.fill();
  return sprite;
}

function flowerSprite(instrument, lightness, radius) {
  const key = `${instrument}|${lightness}|${radius}`;
  let sprite = flowerSprites.get(key);
  if (!sprite) {
    if (flowerSprites.size >= MAX_CACHED_SPRITES) flowerSprites.clear();   // only after many resizes; rebuilt on demand
    sprite = paintFlowerSprite(INSTRUMENTS[instrument], lightness, radius);
    flowerSprites.set(key, sprite);
  }
  return sprite;
}

function sparkleColor(hue) {
  if (!sparkleColors.has(hue)) sparkleColors.set(hue, `hsl(${hue},100%,80%)`);
  return sparkleColors.get(hue);
}

/* ---------- flowers ---------- */
// (ox, oy) shifts drawing into a layer whose top-left sits at that device pixel.
function paintPetals(target, f, cx, cy, r, ox = 0, oy = 0) {
  const lightness = Math.round((50 + (1 - f.y) * 18 + f.glow * 20) / LIGHTNESS_STEP) * LIGHTNESS_STEP;   // higher notes glow brighter
  const radius = Math.max(1, Math.round((r * dpr) / RADIUS_STEP) * RADIUS_STEP);
  const sprite = flowerSprite(f.instrument, lightness, radius);
  const half = sprite.width / 2;
  const cos = Math.cos(f.spin);
  const sin = Math.sin(f.spin);
  target.setTransform(cos, sin, -sin, cos, cx * dpr - ox, cy * dpr - oy);   // device pixels, so the sprite lands 1:1
  target.drawImage(sprite, -half, -half);
  target.setTransform(dpr, 0, 0, dpr, -ox, -oy);
}

function drawHalo(f, cx, cy, r, alpha) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(haloSprite(hueOf(f)), cx - r * 3, cy - r * 3, r * 6, r * 6);
}

function drawFlower(f, cx, cy, radius, alpha = 1) {
  const r = radius * (1 + f.glow * GLOW_GROWTH);
  drawHalo(f, cx, cy, r, alpha * (RESTING_HALO_ALPHA + f.glow * GLOW_HALO_ALPHA));
  ctx.globalAlpha = alpha;
  paintPetals(ctx, f, cx, cy, r);
  ctx.globalAlpha = 1;
}

/* ---------- resting layers ---------- */
function paintRestingLayer(garden, rect) {
  const ox = Math.round(rect.x * dpr);
  const oy = Math.round(rect.y * dpr);
  const w = Math.max(1, Math.ceil((rect.x + rect.w) * dpr) - ox);
  const h = Math.max(1, Math.ceil((rect.y + rect.h) * dpr) - oy);
  const dragged = drag?.from === garden ? drag.flower : null;
  const previous = gardenLayers.get(garden.id);
  const layerCanvas = previous ? previous.canvas : makeSprite(w, h);
  layerCanvas.width = w;    // setting the size also clears it
  layerCanvas.height = h;
  const lctx = layerCanvas.getContext('2d');
  const radius = flowerRadius(rect);
  const resting = garden.flowers.filter((f) => f !== dragged && f.glow <= GLOW_EPSILON);
  lctx.setTransform(dpr, 0, 0, dpr, -ox, -oy);
  lctx.globalAlpha = RESTING_HALO_ALPHA;
  for (const f of resting) {
    const x = rect.x + f.x * rect.w;
    const y = rect.y + f.y * rect.h;
    lctx.drawImage(haloSprite(hueOf(f)), x - radius * 3, y - radius * 3, radius * 6, radius * 6);
  }
  lctx.globalAlpha = 1;
  for (const f of resting) paintPetals(lctx, f, rect.x + f.x * rect.w, rect.y + f.y * rect.h, radius, ox, oy);
  gardenLayers.set(garden.id, {
    canvas: layerCanvas, flowers: garden.flowers, dragged, rect: { ...rect }, dpr, members: new Set(resting), ox, oy,
  });
}

function layerIsCurrent(layer, garden, rect) {
  if (!layer || layer.flowers !== garden.flowers || layer.dpr !== dpr) return false;
  if (layer.dragged !== (drag?.from === garden ? drag.flower : null)) return false;
  const r = layer.rect;
  return r.x === rect.x && r.y === rect.y && r.w === rect.w && r.h === rect.h;
}

function refreshLayers() {
  const repainted = new Set();
  gardens.forEach((garden, i) => {   // changed gardens repaint straight away so edits show immediately
    const rect = paneRects[i];
    if (rect && !layerIsCurrent(gardenLayers.get(garden.id), garden, rect)) {
      paintRestingLayer(garden, rect);
      repainted.add(garden.id);
    }
  });
  for (let n = 0; n < LAYER_REFRESHES_PER_FRAME && gardens.length; n++) {
    layerCursor = (layerCursor + 1) % gardens.length;
    const garden = gardens[layerCursor];
    if (!repainted.has(garden.id) && paneRects[layerCursor]) paintRestingLayer(garden, paneRects[layerCursor]);
  }
  if (gardenLayers.size > gardens.length) {
    for (const id of gardenLayers.keys()) if (gardenIndex(id) === -1) gardenLayers.delete(id);
  }
}

/* ---------- scene ---------- */
function drawSky(time) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060818');
  g.addColorStop(1, '#1b1542');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const s of stars) {
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time * 0.001 + s.tw);
    ctx.fillRect(s.x * W - s.r, s.y * H - s.r, s.r * 2, s.r * 2);
  }
  ctx.globalAlpha = 1;
}

function drawRows(rect) {
  ctx.strokeStyle = 'rgba(160,180,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < rowCount(); i++) {
    const y = Math.round(rect.y + (rect.h * i) / rowCount()) + 0.5;
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
  }
  ctx.stroke();
}

function drawBeam(rect) {
  const x = rect.x + phase * rect.w;
  const g = ctx.createLinearGradient(x - 60, 0, x + 2, 0);
  g.addColorStop(0, 'rgba(170,210,255,0)');
  g.addColorStop(0.85, 'rgba(170,210,255,0.12)');
  g.addColorStop(1, 'rgba(225,240,255,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 60, rect.y, 62, rect.h);
}

function drawPane(garden, rect, { framed, active }) {
  const layer = gardenLayers.get(garden.id);
  if (!rect || !layer) return;
  const radius = flowerRadius(rect);
  const alpha = garden.muted ? MUTED_PANE_ALPHA : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawRows(rect);
  drawBeam(rect);
  ctx.globalAlpha = alpha;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, layer.ox, layer.oy);   // whole device pixels, so the layer is never resampled
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const f of garden.flowers) {
    if (f === drag?.flower) continue;
    const inLayer = layer.members.has(f);
    const glowing = f.glow > GLOW_EPSILON;
    if (inLayer && !glowing) continue;
    const x = rect.x + f.x * rect.w;
    const y = rect.y + f.y * rect.h;
    const r = radius * (1 + f.glow * GLOW_GROWTH);
    drawHalo(f, x, y, r, alpha * ((inLayer ? 0 : RESTING_HALO_ALPHA) + f.glow * GLOW_HALO_ALPHA));
    ctx.globalAlpha = alpha;
    paintPetals(ctx, f, x, y, r);
  }
  ctx.restore();
  if (!framed) return;
  ctx.lineWidth = active ? 2 : 1;
  ctx.strokeStyle = active ? 'rgba(159,216,255,0.5)' : 'rgba(160,180,255,0.14)';
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
}

function drawSparkles() {
  let hue = null;
  for (const s of sparkles) {
    if (s.hue !== hue) {
      hue = s.hue;
      ctx.fillStyle = sparkleColor(hue);
    }
    const size = 3.6 * s.life + 0.8;
    ctx.globalAlpha = s.life;
    ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

function render(now) {
  drawSky(now);
  refreshLayers();
  const framed = gardens.length > 1;
  gardens.forEach((garden, i) => {
    drawPane(garden, paneRects[i], { framed, active: framed && !recording && garden.id === activeGardenId });
  });
  if (drag) {
    const rect = drag.over ? drag.over.rect : paneRects[gardenIndex(drag.from.id)];
    if (rect) drawFlower(drag.flower, drag.px, drag.py, flowerRadius(rect), drag.flower.leaving ? LEAVING_ALPHA : 1);
  }
  drawSparkles();
}
