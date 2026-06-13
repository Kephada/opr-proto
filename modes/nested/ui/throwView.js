// UI-only strike replay. Consumes a precomputed strike result; never calls engine rules.
import { tone, boom, coin, impact, sting } from './audio.js';
import { debuffIcon, pulseDebuff } from './debuffIcons.js';
import { dieCardFromRes, pipsHTML } from './dieCard.js';
import { fxBurst, fxGold } from './fx.js';

let fast = false;
let accelerate = false;
export const setFast = v => { fast = !!v; };
export const accelerateCascade = () => { accelerate = true; };
// Called at the start of each fight action so a user skip never leaks into
// the next fight - but a skip requested DURING the roll still skips the
// cascade (superreview R4). Reduced-motion no longer means instant-resolve:
// CSS strips the motion, pacing stays so each die's beat remains readable.
export const resetCascade = () => { accelerate = false; };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = ms => fast || accelerate ? Promise.resolve() : sleep(ms);
const num = el => Math.round(parseFloat(el.textContent.replace(/,/g, '')) || 0);

function countUp(el, from, to, dur = 300) {
  if (fast || accelerate) {
    el.textContent = Math.round(to).toLocaleString();
    return Promise.resolve();
  }
  return new Promise(res => {
    const t0 = performance.now();
    (function step(t) {
      let k = Math.min(1, (t - t0) / dur);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * k).toLocaleString();
      k < 1 ? requestAnimationFrame(step) : res();
    })(performance.now());
  });
}

function bang(slam, txt, freq = 420) {
  if (fast || accelerate) return;
  slam.textContent = txt;
  slam.classList.remove('go');
  void slam.offsetWidth;
  slam.classList.add('go');
  tone(freq, .06, 'square', .045);
}

// Element identity: each tick flashes, floats, and drips in its element color.
const HITCOL = {
  stone: 'rgba(154,166,178,.38)',
  venom: 'rgba(88,199,131,.42)',
  fire: 'rgba(228,87,74,.5)',
  wind: 'rgba(101,212,200,.42)',
  storm: 'rgba(109,179,242,.45)',
  coin: 'rgba(232,196,85,.45)',
  crystal: 'rgba(219,147,240,.46)',
};

function flash(refs, col) {
  if (fast || accelerate) return;
  refs.flash.style.setProperty('--hitcol', col || 'rgba(255,255,255,.42)');
  refs.flash.classList.remove('go');
  void refs.flash.offsetWidth;
  refs.flash.classList.add('go');
}

function spawnHit(refs, tick) {
  if (fast || accelerate) return;
  const mon = refs.arena.querySelector('.mon-svg');
  mon.classList.remove('flinch');
  void mon.offsetWidth;
  mon.classList.add('flinch');
  spawnFloat(refs, tick.gain, tick.element, `${tick.repeat ? ' echo' : ''}${tick.gain >= 14 ? ' big' : ''}`);
}

function spawnFloat(refs, amount, element, cls = '') {
  if (fast || accelerate) return;
  const el = document.createElement('span');
  el.className = `dmg el-${element}${cls}`;
  el.textContent = amount;
  el.style.left = `${28 + Math.random() * 44}%`;
  refs.hits.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// One human-readable line per tick for the combat log.
const LOG_TEXT = {
  damage: e => `hits ${e.amount}`,
  'repeat-damage': e => `strikes again for ${e.amount}`,
  venom: e => `venom bites ${e.amount}`,
  'venom-apply': e => `applies ${e.amount} poison`,
  explosion: e => `explodes +${e.amount}`,
  charge: e => `charges the next die +${e.amount}`,
  'charge-bonus': e => `+${e.amount} charged`,
  'ember-bonus': e => `+${e.amount} ember`,
  midas: e => `MIDAS +${e.amount}`,
  'coin-max': e => `pays ${e.amount} gold`,
  'tempest-echo': () => 'TEMPEST ECHO',
  species: e => `${e.label} +${e.amount}`,
  'species-gold': e => `${e.label} pays ${e.amount}g`,
  'burst-roll': e => `${e.vessel} shows ${e.shown} → ${e.name} bursts out: ${e.value}!`,
  'burst-charge': e => `the burst charges die ${e.target + 1} +${e.amount}`,
  'pending-burst': e => `${e.name} stirs in its socket…`,
  armor: e => `${e.amount} blocked by armor`,
  ward: e => `${e.amount} turned by the ward`,
  sealed: () => 'sealed shut',
};

// The die itself flies tumbling out of the lane into the thing in the dark -
// certainty thrown at the Unnamed. Impact effects fire on arrival.
function flyDie(refs, slot, tick) {
  if (fast || accelerate || !slot || tick.locked) return Promise.resolve();
  const stage = refs.arena.querySelector('.monster-stage');
  if (!stage || !document.body.animate) return Promise.resolve();
  const s = slot.getBoundingClientRect();
  const t = stage.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `fly-die el-${tick.element}`;
  el.innerHTML = pipsHTML(tick.value);
  el.style.left = `${s.left + s.width / 2}px`;
  el.style.top = `${s.top + s.height / 2}px`;
  document.body.appendChild(el);
  const dx = (t.left + t.width / 2) - (s.left + s.width / 2);
  const dy = (t.top + t.height * 0.58) - (s.top + s.height / 2);
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1 },
    { transform: `translate(calc(-50% + ${(dx * 0.55).toFixed(0)}px), calc(-50% + ${(dy * 0.55 - 48).toFixed(0)}px)) rotate(220deg) scale(.9)`, opacity: 1, offset: 0.55 },
    { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) rotate(380deg) scale(.62)`, opacity: 0.85 },
  ], { duration: 230, easing: 'cubic-bezier(.45,.1,.85,.55)' });
  return (anim.finished || Promise.resolve()).catch(() => {}).then(() => el.remove());
}

// NESTED burst: a small die card pops out above the vessel slot, its numeral
// flickers (the roll is LIVE), settles on the value, then the bonus slams
// into the total. Chains stack their pops with a slight stagger.
function burstPop(refs, slot, ev) {
  if (fast || accelerate || !slot) return Promise.resolve();
  const r = slot.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `burst-die el-${ev.element}`;
  el.innerHTML = `<i class="bd-name">${ev.name}</i><b class="bd-val">?</b>`;
  el.style.left = `${r.left + r.width / 2 + (ev.depth - 1) * 14}px`;
  el.style.top = `${r.top - 6 - (ev.depth - 1) * 10}px`;
  document.body.appendChild(el);
  const val = el.querySelector('.bd-val');
  const flick = setInterval(() => { val.textContent = 1 + Math.floor(Math.random() * ev.size); }, 56);
  tone(700 + ev.depth * 130, .07, 'triangle', .05);
  return new Promise(res => setTimeout(() => {
    clearInterval(flick);
    val.textContent = ev.value;
    el.classList.add('settled');
    tone(880 + ev.value * 22, .08, 'square', .045);
    spawnFloat(refs, ev.dealt || ev.value, ev.element, ' small');
    setTimeout(() => { el.remove(); res(); }, 260);
  }, 320));
}

// V2 COMBO read: the burst's value flies ON as charge - the next slot pulses
// and a ⚡+N floater lands on it, so the causality is DRAWN, not implied
// (the player can't hover mid-cascade; the replay must narrate itself).
function chargeFloat(refs, slot, amount) {
  if (fast || accelerate || !slot) return;
  slot.classList.remove('charge-in');
  void slot.offsetWidth;
  slot.classList.add('charge-in');
  const el = document.createElement('span');
  el.className = 'charge-float';
  el.textContent = `⚡+${amount}`;
  const r = slot.getBoundingClientRect();
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top - 4}px`;
  document.body.appendChild(el);
  tone(980, .06, 'sine', .04);
  el.addEventListener('animationend', () => el.remove());
}

// The cost of falling short is UNMISSABLE: a red vignette pulse, a -1 heart
// floater off the character sheet, and the hearts value bleeding.
function playerHit(refs) {
  let v = document.querySelector('.hurt-vignette');
  if (!v) {
    v = document.createElement('div');
    v.className = 'hurt-vignette';
    document.body.appendChild(v);
  }
  setTimeout(() => {
    v.classList.remove('go');
    void v.offsetWidth;
    v.classList.add('go');
    const sheet = document.querySelector('.char-panel');
    const anchor = sheet?.offsetParent ? sheet : document.getElementById('heartStat');
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const f = document.createElement('span');
      f.className = 'heart-float';
      f.textContent = '−1 ♥';
      f.style.left = `${r.left + r.width / 2}px`;
      f.style.top = `${r.top - 4}px`;
      document.body.appendChild(f);
      f.addEventListener('animationend', () => f.remove());
    }
    ['heartsVal', 'heartStat'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('bleed');
      void el.offsetWidth;
      el.classList.add('bleed');
    });
  }, fast || accelerate ? 0 : 240);
}

// The payout flies home: coins arc from the kill to the character sheet's
// gold plaque, the ledger counting up as each one lands. Called AFTER the
// reward refresh, so it rewinds the displayed value and catches up to truth.
export function flyGoldHome(refs, goldFrom, goldTo) {
  const els = ['goldVal', 'goldStat'].map(id => document.getElementById(id)).filter(Boolean);
  const sheet = document.querySelector('.char-panel');
  const target = sheet?.offsetParent ? document.getElementById('goldVal') : document.getElementById('goldStat');
  const stage = refs.arena.querySelector('.monster-stage');
  if (!target || !stage || goldTo <= goldFrom) return;
  const setGold = v => els.forEach(el => { el.textContent = el.id === 'goldStat' ? `${v} g` : v; });
  if (fast || accelerate || !document.body.animate) {
    setGold(goldTo);
    return;
  }
  setGold(goldFrom);
  const s = stage.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const n = Math.max(3, Math.min(8, Math.ceil((goldTo - goldFrom) / 3)));
  let landed = 0;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'coin-fly';
    const sx = s.left + s.width * (0.42 + Math.random() * 0.16);
    const sy = s.top + s.height * (0.5 + Math.random() * 0.12);
    const tx = t.left + t.width / 2;
    const ty = t.top + t.height / 2;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    document.body.appendChild(el);
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${((tx - sx) * 0.35).toFixed(0)}px), calc(-50% + ${((ty - sy) * 0.25 - 70).toFixed(0)}px)) scale(1.05)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${(tx - sx).toFixed(0)}px, ${(ty - sy).toFixed(0)}px) translate(-50%,-50%) scale(.7)`, opacity: 0.95 },
    ], { duration: 620, delay: i * 95, easing: 'cubic-bezier(.4,.1,.6,.9)', fill: 'backwards' });
    (anim.finished || Promise.resolve()).catch(() => {}).then(() => {
      el.remove();
      landed++;
      setGold(Math.round(goldFrom + (goldTo - goldFrom) * (landed / n)));
      coin(landed);
      els.forEach(p => {
        p.classList.remove('gold-pop');
        void p.offsetWidth;
        p.classList.add('gold-pop');
      });
    });
  }
}

function logTick(refs, tick) {
  if (!refs.log) return;
  const parts = tick.events.map(e => LOG_TEXT[e.type]?.(e)).filter(Boolean);
  if (!parts.length) return;
  refs.log.insertAdjacentHTML('beforeend',
    `<div class="log-line el-${tick.element}"><b>${tick.slot + 1} ${tick.name}</b> ${parts.join(' · ')}</div>`);
  refs.log.scrollTop = refs.log.scrollHeight;
}

function punch(slot) {
  if (fast || accelerate || !slot) return;
  slot.classList.remove('punch');
  void slot.offsetWidth;
  slot.classList.add('punch');
}

function quake(arena) {
  if (fast || accelerate) return;
  arena.classList.remove('shake');
  void arena.offsetWidth;
  arena.classList.add('shake');
}

function eventText(events) {
  const venom = events.filter(e => e.type === 'venom').reduce((s, e) => s + e.amount, 0);
  const boomSum = events.filter(e => e.type === 'explosion' || e.type === 'burst').reduce((s, e) => s + e.amount, 0);
  const crystal = events.find(e => e.type === 'crystal');
  const ward = events.find(e => e.type === 'ward');
  const wind = events.find(e => e.type === 'wind');
  const sealed = events.find(e => e.type === 'sealed');
  if (sealed) return 'LOCK';
  if (ward) return 'WARD';
  if (crystal?.amount > 0) return `x${crystal.mult.toFixed(1)}`;
  if (boomSum) return `+${boomSum}`;
  if (venom) return `V${venom}`;
  if (wind) return 'WIND';
  return '';
}

function dieHtml(dr) {
  return `<span class="slot-num">${dr.slot + 1}</span>${dieCardFromRes(dr, { label: dr.label, armed: dr.armed })}`;
}

export async function animateThrow(refs, r) {
  const { tray, total, ovk, result, hpfill, hpghost, hplabel, arena, slam, hits } = refs;
  const mon = arena.querySelector('.mon-svg');
  mon.classList.remove('dead', 'loom', 'flinch');
  hits.innerHTML = '';
  tray.innerHTML = '';
  tray.className = 'tray dice-grid';
  total.textContent = '0';
  ovk.textContent = '';
  ovk.className = 'ovk';
  result.className = 'result';
  // The hp bar is a POOL: it starts at what remains of the foe and only
  // ever goes down - it never refills between rolls (Remainder Fights).
  const pool = r.baseTarget || r.target;
  const poolLeft = r.poolLeft ?? r.target;
  hpfill.style.background = '';
  hpfill.style.width = `${(poolLeft / pool) * 100}%`;
  total.parentElement.classList.remove('idle'); // damage starts landing
  hpghost.style.width = '100%';
  hplabel.textContent = `${r.target} target`;

  const slots = [];
  for (const dr of r.diceRes) {
    const slot = document.createElement('div');
    slot.className = `dice-slot rolled${dr.locked ? ' locked' : ''}`;
    slot.innerHTML = dieHtml(dr);
    tray.appendChild(slot);
    slots[dr.slot] = slot;
  }
  // The activation sweep: tunnel lights, not a traveling ball - the live
  // slot lights up (.ignite) and the chevron to the next die flashes.
  tray.classList.add('cascading');
  const pacing = !fast && !accelerate;

  const drain = value => {
    const left = Math.max(0, r.target - value);
    const w = `${Math.max(0, ((poolLeft - value) / pool) * 100)}%`;
    hpfill.style.width = w;
    hpghost.style.width = w;
    hplabel.textContent = value >= r.target ? 'CLEARED' : `${left} left`;
  };

  // Accelerando: uniform timing is the tell of programmer animation.
  let beat = 90;
  // Carried poison (Remainder fights) is already on the icon - count on.
  let venomStacks = +(refs.debuffs?.querySelector('.debuff.poison b')?.textContent || 0);
  for (const tick of r.ticks) {
    const slot = slots[tick.slot];
    const finale = tick.events.some(e => e.type === 'crystal');
    if (pacing) await wait(tick.repeat ? 110 : 150);
    slot?.querySelector('.die')?.classList.add('show');
    slot?.classList.add('ignite');
    if (tick.repeat) slot?.classList.add('hint');
    logTick(refs, tick);
    // The monster wears its statuses: poison stacks tick UP as they apply,
    // and every icon PULSES when its effect actually fires (WoW-style).
    const venomDmg = tick.events.filter(e => e.type === 'venom').reduce((s, e) => s + e.amount, 0);
    if (venomDmg) {
      spawnFloat(refs, venomDmg, 'venom', ' small');
      pulseDebuff(refs.debuffs, 'poison');
    }
    const applied = tick.events.filter(e => e.type === 'venom-apply').reduce((s, e) => s + e.amount, 0);
    if (applied && refs.debuffs) {
      venomStacks += applied;
      const poison = refs.debuffs.querySelector('.debuff.poison');
      if (poison) poison.querySelector('b').textContent = venomStacks;
      else refs.debuffs.insertAdjacentHTML('beforeend', debuffIcon('poison', venomStacks, `Poison: +${venomStacks} on every later hit`));
      pulseDebuff(refs.debuffs, 'poison');
    }
    if (tick.events.some(e => e.type === 'armor')) pulseDebuff(refs.debuffs, 'armor');
    if (tick.events.some(e => e.type === 'ward')) pulseDebuff(refs.debuffs, 'ward');
    const txt = eventText(tick.events);
    if (txt) bang(slam, txt, txt === 'LOCK' ? 160 : 460);
    if (tick.events.some(e => e.type === 'explosion-roll')) {
      const boomTotal = tick.events.filter(e => e.type === 'explosion').reduce((s, e) => s + e.amount, 0);
      const fn = slot.querySelector('.face-num');
      if (boomTotal && fn) fn.textContent = `${tick.value}+${boomTotal}`;
    }
    // NESTED: each burst (and chained burst) pops its own little die above
    // the vessel before the combined gain slams into the total.
    for (const b of tick.events.filter(e => e.type === 'burst-roll')) {
      await burstPop(refs, slot, b);
    }
    // ...and each burst's charge lands visibly on the die it feeds.
    for (const c of tick.events.filter(e => e.type === 'burst-charge')) {
      chargeFloat(refs, slots[c.target], c.amount);
    }
    if (tick.gain > 0) {
      if (!fast && !accelerate && tick.gain >= 14) await sleep(70); // hit-stop on the attacker
      await flyDie(refs, slot, tick);
      flash(refs, HITCOL[tick.element]);
      spawnHit(refs, tick);
      punch(slot);
      if (!fast && !accelerate) {
        impact(tick.gain);
        fxBurst(tick.element, .5, .55, tick.gain);
      }
      await countUp(total, num(total), tick.totalAfter, tick.repeat ? 160 : 200);
      drain(tick.totalAfter);
    } else {
      if (!tick.locked) await flyDie(refs, slot, tick);
      await wait(tick.locked ? 200 : 110);
    }
    if (finale || tick.events.some(e => e.type === 'explosion-roll' || e.type === 'ward')) quake(arena);
    if (!tick.repeat) setTimeout(() => slot?.classList.remove('ignite'), 200);
    await wait(finale ? 260 : beat);
    beat = Math.max(40, Math.round(beat * 0.88));
  }
  tray.classList.remove('cascading');

  await wait(120);
  if (refs.debuffs) refs.debuffs.innerHTML = '';
  if (refs.log) {
    refs.log.insertAdjacentHTML('beforeend', r.cleared
      ? `<div class="log-line verdict win">slain · <i class="coin"></i>${r.gold} paid${r.overkill ? ` · ${r.overkill} overkill` : ''}</div>`
      : `<div class="log-line verdict lose">it stands - ${r.short} left · strikes back ♥-1</div>`);
    refs.log.scrollTop = refs.log.scrollHeight;
  }
  if (r.cleared) {
    hpfill.style.background = '#1a2120';
    if (!fast && !accelerate) mon.classList.add('dead');
    flash(refs, 'rgba(242,200,75,.4)');
    result.textContent = 'SLAIN';
    result.className = 'result show win';
    ovk.innerHTML = `<i class="coin"></i>+${r.gold}${r.overkill ? `, over ${r.overkill}` : ''}`;
    boom();
    if (!fast && !accelerate) {
      fxGold(r.gold);
      const pings = Math.min(6, Math.ceil(r.gold / 3));
      for (let i = 0; i < pings; i++) coin(i);
    }
  } else {
    // It still stands: the eyes FLARE and freeze dead-ahead (the telegraph),
    // then the foe LUNGES at the camera and strikes back - red flash,
    // ground shake, and the hit lands on the character sheet.
    mon.classList.add('eyes-flare');
    setTimeout(() => mon.classList.remove('eyes-flare'), 1100);
    if (!fast && !accelerate) mon.classList.add('loom');
    flash(refs, 'rgba(216,69,58,.3)');
    const stage = refs.arena.querySelector('.monster-stage');
    if (stage && !fast && !accelerate) {
      stage.classList.remove('slam-in');
      void stage.offsetWidth;
      stage.classList.add('slam-in');
    }
    const sheet = document.querySelector('.char-panel');
    if (sheet) {
      setTimeout(() => {
        sheet.classList.remove('hit');
        void sheet.offsetWidth;
        sheet.classList.add('hit');
      }, fast || accelerate ? 0 : 220);
    }
    playerHit(refs);
    result.textContent = `SHORT BY ${r.short} · ♥ −1`;
    result.className = 'result show lose';
    ovk.textContent = '';
    sting();
    if (!fast && !accelerate) boom();
  }
}
