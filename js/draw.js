/* Drawing: the night sky, one pane per garden, flowers and sparkles. */

const HALO_SPRITE_SIZE = 128;
const FLOWER_SPRITE_RADIUS = 48;   // px: largest on-screen flower (max radius x glow x 2x DPR), so sprites barely upscale
const FLOWER_SPRITE_SCALE = 2.5;   // sprite width in flower radii (petals reach ~1.22 radii from the centre)
const LIGHTNESS_STEP = 4;          // flower sprites are cached per 4% lightness band

const canvas = document.getElementById('garden');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1;

const stars = Array.from({ length: 160 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, tw: Math.random() * TAU,
}));

// Pre-rendered images: drawing thousands of flowers as one image each is far cheaper than rebuilding their shapes every frame.
const haloSprites = new Map();     // hue -> soft glow
const flowerSprites = new Map();   // `${instrument}|${lightness}` -> petals + centre
const sparkleColors = new Map();   // hue -> colour string

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeSprite(size) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
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

function flowerSprite(instrument, lightness) {
  const key = `${instrument}|${lightness}`;
  if (flowerSprites.has(key)) return flowerSprites.get(key);
  const { hue, petals } = INSTRUMENTS[instrument];
  const r = FLOWER_SPRITE_RADIUS;
  const size = Math.ceil(r * FLOWER_SPRITE_SCALE);
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
  flowerSprites.set(key, sprite);
  return sprite;
}

function sparkleColor(hue) {
  if (!sparkleColors.has(hue)) sparkleColors.set(hue, `hsl(${hue},100%,80%)`);
  return sparkleColors.get(hue);
}

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

function drawFlower(f, cx, cy, radius) {
  const r = radius * (1 + f.glow * 0.7);
  const fade = f.leaving ? 0.3 : 1;
  const lightness = Math.round((50 + (1 - f.y) * 18 + f.glow * 20) / LIGHTNESS_STEP) * LIGHTNESS_STEP;   // higher notes glow brighter
  ctx.globalAlpha = fade * (0.2 + f.glow * 0.5);
  ctx.drawImage(haloSprite(hueOf(f)), cx - r * 3, cy - r * 3, r * 6, r * 6);
  const cos = Math.cos(f.spin) * dpr;
  const sin = Math.sin(f.spin) * dpr;
  const size = r * FLOWER_SPRITE_SCALE;
  ctx.setTransform(cos, sin, -sin, cos, cx * dpr, cy * dpr);
  ctx.globalAlpha = fade;
  ctx.drawImage(flowerSprite(f.instrument, lightness), -size / 2, -size / 2, size, size);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
}

function drawPane(garden, rect, { framed, active }) {
  if (!rect) return;
  const radius = flowerRadius(rect);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawRows(rect);
  drawBeam(rect);
  for (const f of garden.flowers) {
    if (f === drag?.flower) continue;
    drawFlower(f, rect.x + f.x * rect.w, rect.y + f.y * rect.h, radius);
  }
  ctx.restore();
  if (!framed) return;
  ctx.lineWidth = active ? 2 : 1;
  ctx.strokeStyle = active ? 'rgba(159,216,255,0.5)' : 'rgba(160,180,255,0.14)';
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
}

function drawSparkles() {
  for (const s of sparkles) {
    const size = 3.6 * s.life + 0.8;
    ctx.globalAlpha = s.life;
    ctx.fillStyle = sparkleColor(s.hue);
    ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

function render(now) {
  drawSky(now);
  const framed = gardens.length > 1;
  gardens.forEach((garden, i) => {
    drawPane(garden, paneRects[i], { framed, active: framed && !recording && garden.id === activeGardenId });
  });
  if (drag) {
    const rect = drag.over ? drag.over.rect : paneRects[gardenIndex(drag.from.id)];
    if (rect) drawFlower(drag.flower, drag.px, drag.py, flowerRadius(rect));
  }
  drawSparkles();
}
