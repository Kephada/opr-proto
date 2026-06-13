// Canvas particle layer inside the monster stage. UI only; fed by replay
// views. Pooled, hard-capped, and the rAF loop stops when nothing is alive.
// Taste (docs/ART-DIRECTION.md): 2-4px shards, gravity, opacity-out, no blur.

const COLORS = {
  stone: '#aeb8c2',
  venom: '#58c783',
  fire: '#ff7b66',
  wind: '#65d4c8',
  storm: '#f0d06a',
  crystal: '#db93f0',
  gold: '#f2c84b',
};

const CAP = 256;
const pool = [];
let canvas = null;
let ctx = null;
let raf = 0;
let last = 0;
let W = 0;
let H = 0;

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width));
  H = Math.max(1, Math.round(r.height));
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function initFx(stage) {
  canvas = document.createElement('canvas');
  canvas.className = 'fx';
  stage.querySelector('.dust')?.after(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function spawn(p) {
  if (pool.length >= CAP) return;
  pool.push(p);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
}

function step(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  ctx.clearRect(0, 0, W, H);
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    p.life -= dt;
    if (p.life <= 0) {
      pool.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.min(1, p.life / p.fade);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  raf = pool.length ? requestAnimationFrame(step) : 0;
}

// One element impact: a fistful of shards kicked off the monster.
export function fxBurst(element, x01 = .5, y01 = .55, power = 6) {
  if (!ctx) return;
  const n = Math.round(8 + Math.min(6, power / 3));
  const color = COLORS[element] || COLORS.stone;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.1 + Math.random() * 0.8); // up-ish fan
    const v = 90 + Math.random() * 170 + power * 4;
    spawn({
      x: x01 * W + (Math.random() * 18 - 9),
      y: y01 * H + (Math.random() * 12 - 6),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      grav: 520,
      size: 2 + Math.random() * 2,
      life: .4 + Math.random() * .3,
      fade: .3,
      color,
    });
  }
}

// Victory: gold sparks fountain out of the kill.
export function fxGold(gold = 5) {
  if (!ctx) return;
  const n = Math.min(40, 10 + gold * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.15 + Math.random() * 0.7);
    const v = 130 + Math.random() * 210;
    spawn({
      x: .5 * W + (Math.random() * 26 - 13),
      y: .5 * H,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      grav: 460,
      size: 2 + Math.random() * 2.5,
      life: .55 + Math.random() * .45,
      fade: .4,
      color: COLORS.gold,
    });
  }
}
