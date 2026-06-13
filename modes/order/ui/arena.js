// Corridor viewport + monster staging. UI only: owns the crawler corridor,
// where the foe stands in it, and the charge/advance choreography.
// Resolution stays in engine/; throwView keeps toggling .mon-svg classes.
import { monsterMarkup, monsterScale } from './monsters.js';
import { tone } from './audio.js';

let arena = null;
let stage = null;
let actor = null;
let svg = null;
let dust = null;
let currentKey = null;
let lastDepth = 0;
let artScale = 1;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mscale = () => parseFloat(getComputedStyle(arena).getPropertyValue('--mscale')) || 0.8;

// The corridor is now the painted plate (assets/corridor-bg.png, 16:9):
// torches, wet flagstones, and the cold breath at the end live in the paint.
// object-fit:cover keeps the vanishing point centered at any window shape.
const CORRIDOR = `<img class="corridor" src="assets/corridor-bg.png" alt="" draggable="false">`;

// depth d in [0,1]: 0 = standing in the cold fog, 1 = in your face.
// Ground-line constants follow the painted floor (fog base ~42% up the plate).
function setDepth(d, animate = false) {
  if (!actor) return;
  actor.classList.toggle('gliding', animate);
  lastDepth = d;
  const s = (0.18 + 0.82 * d * d) * mscale() * artScale;
  // Ground line: proportional, with a MEASURED floor - the feet (and the
  // name/bar/readout stack riding under them, ~108px) must clear the real
  // player HUD, not a guessed height. Capped so tiny windows don't push
  // the monster into the fog.
  const h = stage?.clientHeight || 900;
  const hud = document.querySelector('.player-hud');
  const hudTop = hud && getComputedStyle(hud).position === 'absolute'
    ? hud.getBoundingClientRect().top : h;
  // Only the hp bar + readout live under the feet now (name moved above
  // the head), so the monster stands LOWER - grounded on the lit floor.
  const clearPx = Math.max(0, h - hudTop) + 40;
  const floorPct = Math.min(38, (clearPx / h) * 100);
  // Far monsters sit at the painted fog base (~36%), never above it - a
  // higher cap left them FLOATING mid-corridor on short windows.
  const dy = Math.max(12 + (1 - d) * 24, d > 0.5 ? floorPct : 0);
  actor.style.setProperty('--ds', s.toFixed(3));
  actor.style.setProperty('--dy', `${dy.toFixed(1)}%`);
  // Published at the ROOT so all chrome (hp bar in .monster, readout in
  // .combat) can ride UNDER the sprite's feet, wherever it lives. --head
  // marks the sprite's crown (actor box is 92% of stage, scaled by s) so
  // the damage counter can hover ABOVE the monster, not on it.
  document.documentElement.style.setProperty('--feet', `${dy.toFixed(1)}%`);
  document.documentElement.style.setProperty('--head', `${(dy + 92 * s).toFixed(1)}%`);
  actor.style.setProperty('--db', (0.55 + 0.45 * d).toFixed(3));
  actor.classList.toggle('far', d < 0.5);
}

function thud(step) {
  tone(58 + step * 8, .09, 'sine', .07);
  tone(130, .04, 'square', .025);
}

function puffDust(n = 9) {
  if (!dust) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'puff';
    p.style.left = `${42 + Math.random() * 16}%`;
    p.style.setProperty('--px', `${(Math.random() * 2 - 1) * 46}px`);
    p.style.animationDelay = `${Math.random() * 70}ms`;
    dust.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

// The foe stands here through the whole arrange phase (panel verdict: the
// loom IS the arrange-phase pressure; the roll pushes it back).
// Pulled back so the WHOLE body stands visible in the corridor.
const LOOM = 0.78;
// Generation token: every foe placement bumps it; any sleeping choreography
// from an older generation bails instead of mutating the new foe's stage.
let gen = 0;

export function initArena(arenaEl) {
  arena = arenaEl;
  stage = arena.querySelector('.monster-stage');
  actor = arena.querySelector('.mon-actor');
  svg = arena.querySelector('.mon-svg');
  dust = arena.querySelector('.dust');
  stage.insertAdjacentHTML('afterbegin', CORRIDOR);
  initEyes();
  // The ground-line pixel floor depends on stage height: re-apply on resize.
  let rsz = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => setDepth(lastDepth), 120);
  });
}

// Horror eyes, panel-spec behavior: idle drift that IGNORES you, then a
// discrete NOTICE - a fast snap to the cursor, a held lock, disinterest.
// The snap is the scare; constant tracking is a toy.
function initEyes() {
  if (reducedMotion()) return;
  let lastMove = 0;
  let lockUntil = 0;
  let cooldownUntil = 0;
  let raf = 0;
  const setEyes = (nx, ny) => {
    svg.style.setProperty('--eyex', `${(nx * 1.7).toFixed(2)}px`);
    svg.style.setProperty('--eyey', `${(ny * 1.3).toFixed(2)}px`);
  };
  window.addEventListener('pointermove', e => {
    lastMove = performance.now();
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const now = performance.now();
      if (now > lockUntil && now < cooldownUntil) return; // disinterested
      if (now > lockUntil) {
        // NOTICE: acquire the cursor, hold the stare 1.5-4s, then lose interest.
        lockUntil = now + 1500 + Math.random() * 2500;
        cooldownUntil = lockUntil + 900 + Math.random() * 1500;
        svg.classList.add('locked');
        setTimeout(() => svg.classList.remove('locked'), lockUntil - now);
      }
      const r = stage.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - .5) * 2));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - .5) * 2));
      setEyes(nx, ny);
    });
  }, { passive: true });
  // Idle saccade: the gaze drifts on its own when it isn't watching you.
  setInterval(() => {
    if (performance.now() - lastMove > 2600) {
      setEyes(Math.random() * 1.4 - .7, Math.random() * 1 - .3);
    }
  }, 2200 + Math.random() * 1400);
}

// Ignition: the shape arrives dark, then the eyes OPEN - desynced, with an
// overshoot. Inscryption's Leshy rule: the light beginning is the scare.
function igniteEyes(instant = false) {
  const eyes = svg.querySelectorAll('.eye-g');
  eyes.forEach((el, i) => {
    el.classList.remove('on');
    if (instant || reducedMotion()) {
      el.classList.add('on');
      return;
    }
    setTimeout(() => el.classList.add('on'), 240 + Math.random() * 320 + i * 70);
  });
  if (eyes.length && !instant && !reducedMotion()) {
    setTimeout(() => tone(1180, .04, 'sine', .018), 420);
  }
}

function placeFar(art, boss) {
  svg.classList.remove('dead', 'loom', 'flinch');
  actor.classList.remove('loomed');
  artScale = monsterScale(art);
  svg.innerHTML = monsterMarkup(art);
  stage.classList.toggle('boss', !!boss);
  actor.style.opacity = '1';
  setDepth(0);
}

// Encounter-start charge: discrete crawler strides out of the fog, one
// animated lunge to the loom, then it breathes over you while you arrange.
async function chargeToLoom(g) {
  await sleep(140);
  if (g !== gen) return;
  const strides = [0.32, 0.6];
  for (let i = 0; i < strides.length; i++) {
    setDepth(strides[i]);
    actor.classList.toggle('stride-l', i % 2 === 0);
    actor.classList.toggle('stride-r', i % 2 === 1);
    thud(i);
    await sleep(185);
    if (g !== gen) return;
  }
  actor.classList.remove('stride-l', 'stride-r');
  setDepth(LOOM, true);
  await sleep(240);
  if (g !== gen) return;
  actor.classList.remove('gliding');
  puffDust();
  stage.classList.remove('slam-in');
  void stage.offsetWidth;
  stage.classList.add('slam-in');
  tone(46, .16, 'sine', .09);
  tone(170, .05, 'square', .03);
  actor.classList.add('loomed');
  igniteEyes();
}

// Foe staging per run position. Same key = no-op (refresh() calls repeatedly);
// a changed key walks the corridor forward, then the next shape charges in
// and looms BEFORE the roll phase.
export function showFoe(key, art, opts = {}) {
  if (!stage || key === currentKey) return;
  const firstShow = currentKey === null;
  currentKey = key;
  const g = ++gen;
  if (opts.instant || reducedMotion()) {
    placeFar(art, opts.boss);
    setDepth(LOOM);
    actor.classList.add('loomed');
    igniteEyes(true);
    return;
  }
  if (firstShow) {
    placeFar(art, opts.boss);
    chargeToLoom(g);
    return;
  }
  stage.classList.add('advancing');
  actor.style.opacity = '0';
  thud(1);
  setTimeout(() => { if (g === gen) thud(2); }, 220);
  setTimeout(() => {
    if (g !== gen) return;
    placeFar(art, opts.boss);
    chargeToLoom(g);
  }, 300);
  setTimeout(() => { if (g === gen) stage.classList.remove('advancing'); }, 600);
}

export function arenaReset() {
  currentKey = null;
  gen++;
  hideAltar(true);
}

// The die altar rises out of the deep after a kill - smaller and growing
// fast, the same depth illusion the monsters use. Caller provides the three
// glowing dice as markup and wires their clicks on the returned element.
let altar = null;

export function showAltar(contentHTML) {
  hideAltar(true);
  arena.classList.add('altared'); // the stage clears: plate/score/hpbar yield
  altar = document.createElement('div');
  altar.className = 'altar';
  altar.innerHTML = `<img class="altar-img" src="assets/dice-altar.png" alt="" draggable="false">
    <div class="altar-title">Take one</div>
    <div class="altar-dice">${contentHTML}</div>`;
  stage.appendChild(altar);
  void altar.offsetWidth;
  if (reducedMotion()) {
    altar.classList.add('risen', 'instant');
    return altar;
  }
  thud(0);
  setTimeout(() => { if (altar) thud(2); }, 260);
  altar.classList.add('risen');
  setTimeout(() => {
    if (!altar) return;
    puffDust(6);
    stage.classList.remove('slam-in');
    void stage.offsetWidth;
    stage.classList.add('slam-in');
    tone(46, .14, 'sine', .08);
  }, 520);
  return altar;
}

export function hideAltar(immediate = false) {
  arena?.classList.remove('altared');
  if (!altar) return;
  const el = altar;
  altar = null;
  if (immediate || reducedMotion()) {
    el.remove();
    return;
  }
  el.classList.add('sinking');
  setTimeout(() => el.remove(), 380);
}

// Roll tap payoff: the foe presses in for the cascade — but capped short of
// the camera (CLOSE < 1); full depth was swallowing the frame.
const CLOSE = 0.86;

export async function monsterRecoil(opts = {}) {
  if (!actor) return;
  const g = gen;
  if (opts.instant || reducedMotion()) {
    setDepth(CLOSE);
    return;
  }
  actor.classList.remove('loomed');
  setDepth(0.74, true);
  tone(120, .07, 'square', .04);
  await sleep(220);
  if (g !== gen) return;
  setDepth(CLOSE, true);
  await sleep(240);
  if (g !== gen) return;
  actor.classList.remove('gliding');
}

// Remainder fights: the foe survived the cascade. It settles back to the
// loom for the next arrange instead of staying parked on the camera (the
// counter-attack's .loom settle goes with it).
export function monsterReLoom() {
  if (!actor || currentKey === null) return;
  const g = gen;
  svg.classList.remove('loom', 'flinch');
  if (reducedMotion()) {
    setDepth(LOOM);
    actor.classList.add('loomed');
    return;
  }
  setDepth(LOOM, true);
  setTimeout(() => {
    if (g !== gen) return;
    actor.classList.remove('gliding');
    actor.classList.add('loomed');
  }, 280);
}
