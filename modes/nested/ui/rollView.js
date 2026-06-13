// UI-only roll replay. Tumbles dice onto already-computed rollTimeline() faces; never calls engine rules.
// Flicker values are cosmetic randomness only — the settled faces come from the engine preview.
import { clatter, tone } from './audio.js';
import { dieCardFromRes, faceNumHTML } from './dieCard.js';

let fast = false;
let skip = false;
export const setRollFast = v => { fast = !!v; };
export const skipRoll = () => { skip = true; };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function tumblingDieHtml(dr) {
  return `<span class="slot-num">${dr.slot + 1}</span>${dieCardFromRes(dr, { label: dr.locked ? 'LOCK' : '?', tumbling: !dr.locked })}`;
}

function settle(slot, dr, idx) {
  slot.innerHTML = `<span class="slot-num">${dr.slot + 1}</span>${dieCardFromRes(dr, { label: dr.label, armed: dr.armed })}`;
  slot.querySelector('.die').classList.add('show');
  const ring = document.createElement('span');
  ring.className = 'impact';
  slot.appendChild(ring);
  if (dr.locked) {
    slot.classList.add('clank');
    tone(96, .14, 'square', .06);
    return;
  }
  tone(190 + idx * 28 + dr.value * 7, .06, 'square', .05);
  if (dr.armed) setTimeout(() => tone(932, .1, 'sine', .04), 90);
}

// Replays the cast: dice rattle airborne, then land left to right so the
// timeline order is read physically. Verdict tone waits for the last die.
export async function animateRoll(refs, preview) {
  skip = false;
  const { tray, total, ovk, readout } = refs;
  tray.innerHTML = '';
  tray.className = 'tray dice-grid rolling';
  total.textContent = '·';
  ovk.textContent = '';
  ovk.className = 'ovk';
  readout.innerHTML = '<i>the dice are cast&hellip;</i>';
  if (refs.log) refs.log.innerHTML = '';
  if (refs.debuffs) refs.debuffs.innerHTML = '';

  const slots = preview.diceRes.map(dr => {
    const slot = document.createElement('div');
    slot.className = `dice-slot rolled${dr.locked ? ' locked' : ''}`;
    slot.innerHTML = tumblingDieHtml(dr);
    tray.appendChild(slot);
    return slot;
  });
  // Reduced-motion keeps the pacing (CSS strips the tumble); fast skips.
  if (fast) {
    tray.classList.remove('rolling');
    return;
  }
  const rm = reducedMotion();

  clatter();
  const flickers = preview.diceRes.map((dr, i) => dr.locked || rm ? null : setInterval(() => {
    slots[i].querySelector('.v').innerHTML = faceNumHTML(1 + Math.floor(Math.random() * dr.size));
  }, 64));

  for (let i = 0; i < slots.length; i++) {
    if (!skip) await sleep(i === 0 ? 380 : 150);
    if (flickers[i]) clearInterval(flickers[i]);
    settle(slots[i], preview.diceRes[i], i);
  }
  if (!skip) await sleep(180);
  tray.classList.remove('rolling');
  if (preview.cleared) {
    tone(523, .08, 'triangle', .05);
    setTimeout(() => tone(659, .12, 'triangle', .05), 90);
  } else {
    tone(140, .28, 'sine', .05);
  }
}
