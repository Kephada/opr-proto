// Controller: run state, fight flow, overlays, boot. Rendering lives in
// render.js, Camp input in arrange.js; run transitions and rules in engine/.
import {
  PHASE, applyReward, applyShop, combineDice, createRun, currentRewardOffers,
  currentShopOffers, rerollDraft, rerollShop, rollCurrentFight, skipReward,
  skipShop, strikeCurrentFight, toggleWager,
} from '../engine/run.js';
import { CLAN, SHOP_REROLL_COST, clanRanks, sizeLabel } from '../engine/config.js';
import { setAudioEnabled, resumeAudio, tone, startAmbient } from './audio.js';
import { arenaReset, hideAltar, initArena, monsterRecoil, monsterReLoom, showAltar } from './arena.js';
import { initArrange } from './arrange.js';
import { dieCardHTML } from './dieCard.js';
import { initFx } from './fx.js';
import { initMenu } from './menu.js';
import { render } from './render.js';
import { accelerateCascade, animateThrow, flyGoldHome, resetCascade, setFast } from './throwView.js';
import { animateRoll, setRollFast, skipRoll } from './rollView.js';

const $ = id => document.getElementById(id);

let run = createRun();
let busy = false;
let selected = null;
let runSeq = 0;
let runStarted = false; // false until START/CONTINUE - the boot run is scenery

// ---- Run persistence: camp states only (offer stocks hold closures, and
// clearFightState nulls them at every camp, so the snapshot is plain data).
// Own key: nested builds (5-slot cap, sockets on dice) must never rehydrate
// into the base game or the sibling prototypes - same-origin localStorage.
const SAVE_KEY = 'opr-nested-save-v1';

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 1 || !s.run?.build) return null;
    return {
      ...s.run,
      phase: PHASE.ARRANGE,
      wager: false,
      draftStock: null,
      shopStock: null,
      pendingAdvance: null,
      pendingShop: false,
      lastRoll: null,
      lastPreview: null,
      lastStrike: null,
      lastReward: null,
      lastShop: null,
      ghostFix: null,
    };
  } catch (e) { return null; }
}

function persist() {
  try {
    if (runStarted && run.phase === PHASE.ARRANGE) {
      const { lastRoll, lastPreview, lastStrike, draftStock, shopStock, ghostFix, ...rest } = run;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, run: rest }));
    } else if (run.phase === PHASE.WON || run.phase === PHASE.OVER) {
      localStorage.removeItem(SAVE_KEY);
    }
  } catch (e) { /* storage denied - the run just isn't resumable */ }
}

const refs = {
  tray: $('tray'),
  total: $('total'),
  ovk: $('ovk'),
  result: $('result'),
  hpfill: $('hpfill'),
  hpghost: $('hpghost'),
  hplabel: $('hplabel'),
  hits: $('hits'),
  arena: $('arena'),
  flash: $('flash'),
  slam: $('slam'),
  readout: $('readout'),
  log: $('combatLog'),
  debuffs: $('debuffs'),
};

const arrange = initArrange({
  getRun: () => run,
  setRun: v => { run = v; },
  isBusy: () => busy,
  refresh: () => refresh(),
  setSelected: v => { selected = v; },
});

function refresh() {
  render({
    run,
    busy,
    selected,
    runSeq,
    on: {
      slotPointerDown: (e, zone, i) => arrange.startDrag(e, zone, i),
    },
  });
  renderShopPanel();
  persist();
}

function afterStrike() {
  if (run.phase === PHASE.REWARD) openReward();
  else if (run.phase === PHASE.SHOP) openShop();
  // Remainder only: a hero-fight WIN also lands on ARRANGE (advanced foe).
  else if (run.phase === PHASE.ARRANGE && run.lastStrike && !run.lastStrike.cleared) monsterReLoom();
  else if (run.phase === PHASE.WON) menu.showVictory(run);
  else if (run.phase === PHASE.OVER) menu.showDefeat(run);
  refresh();
}

// One tap = the whole round: roll, cascade, strike. No halt, no nudges -
// if the foe still stands you simply roll again (Remainder Fights).
async function doFight() {
  resumeAudio();
  startAmbient();
  arrange.closeSheet();
  resetCascade();
  busy = true;
  $('throwBtn').classList.add('spent');
  $('wagerBtn').disabled = true;
  selected = null;
  run = rollCurrentFight(run);
  await Promise.all([
    animateRoll(refs, run.lastPreview),
    monsterRecoil({ instant: $('fast').checked }),
  ]);
  const goldBefore = run.gold;
  run = strikeCurrentFight(run);
  // Hero fights advance straight to camp, which nulls lastStrike - hold it.
  const struck = run.lastStrike;
  await animateThrow(refs, struck);
  busy = false;
  afterStrike();
  // After the refresh (which writes the final number) the coins fly home
  // and the ledger rewinds, counting up as each one lands.
  if (struck?.cleared) flyGoldHome(refs, goldBefore, run.gold);
}

function restart(difficulty = run.difficulty) {
  run = createRun(Math.random, difficulty);
  runStarted = true;
  selected = null;
  runSeq++;
  arenaReset(); // also clears any standing altar
  arrange.closeSheet();
  refresh();
}

function onAction() {
  if (busy) {
    skipRoll();
    accelerateCascade();
    return;
  }
  if (run.phase === PHASE.ARRANGE) doFight();
  else if (run.phase === PHASE.WON || run.phase === PHASE.OVER) restart();
}

// The reward is the ALTAR: it rises from the deep with three glowing dice
// in its sockets (small delay so the kill lands first). Hover = tooltip,
// click = take, the faint line beneath = leave them.
const ALTAR_X = [23.5, 49.7, 76];

function altarMounts(offers) {
  return offers.map((o, i) => {
    const pos = `left:${ALTAR_X[i]}%;--stagger:${0.5 + i * 0.09}s`;
    const badge = o.combinesWith
      ? `<span class="combine-badge">COMBINE → ${sizeLabel(o.combinesWith)}</span>` : '';
    return `<button class="altar-die" type="button" data-zone="altar" data-i="${i}" style="${pos}">${dieCardHTML(o.die)}${badge}</button>`;
  }).join('');
}

function wireAltar(el) {
  el.querySelectorAll('.altar-die').forEach(b => b.addEventListener('click', () => {
    if (run.phase !== PHASE.REWARD) return;
    tone(660, .08, 'triangle', .05);
    run = applyReward(run, +b.dataset.i);
    hideAltar();
    if (run.phase === PHASE.SHOP) openShop();
    refresh();
  }));
}

function openReward() {
  setTimeout(() => {
    if (run.phase !== PHASE.REWARD) return;
    const coinFree = clanRanks(run.build)[CLAN.COIN] >= 2;
    const rerollLabel = coinFree ? 'reroll · free' : 'reroll · 3g';
    const el = showAltar(`<div class="altar-dice-row">${altarMounts(currentRewardOffers(run))}</div>
      <button class="altar-reroll" type="button">${rerollLabel}</button>
      <button class="altar-skip" type="button">leave them</button>`);
    wireAltar(el);
    el.querySelector('.altar-reroll').addEventListener('click', () => {
      if (run.phase !== PHASE.REWARD || run.draftRerolled) return;
      const before = run;
      run = rerollDraft(run);
      if (run === before) { tone(200, .07, 'square', .04); return; }
      tone(540, .07, 'triangle', .05);
      const row = el.querySelector('.altar-dice-row');
      row.innerHTML = altarMounts(currentRewardOffers(run));
      wireAltar(el);
      el.querySelector('.altar-reroll').classList.add('spent-reroll');
      refresh();
    });
    el.querySelector('.altar-skip').addEventListener('click', () => {
      if (run.phase !== PHASE.REWARD) return;
      run = skipReward(run);
      hideAltar();
      if (run.phase === PHASE.SHOP) openShop();
      refresh();
    });
  }, 450);
}

// THE PEDDLER: the shop is an encounter. The shopkeeper takes the corridor
// (render stages him), the painted panel opens at his right hand.
function renderShopPanel() {
  const panel = $('shopPanel');
  if (run.phase !== PHASE.SHOP) {
    panel.classList.remove('show');
    return;
  }
  const offers = currentShopOffers(run);
  const rerollCost = SHOP_REROLL_COST[Math.min(run.shopIndex, SHOP_REROLL_COST.length - 1)];
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const o = offers[i];
    if (!o) {
      rows.push(`<div class="shop-row sold" style="--row:${i}"><span class="sr-sold">SOLD</span></div>`);
      continue;
    }
    const broke = run.gold < o.cost ? ' broke' : '';
    const badge = o.combinesWith ? `<span class="combine-badge">COMBINE → ${sizeLabel(o.combinesWith)}</span>` : '';
    rows.push(`<button class="shop-row${broke}" type="button" data-i="${i}" data-desc="${o.desc.replace(/"/g, '&quot;')}" style="--row:${i}">
      <span class="sr-die">${dieCardHTML(o.die)}</span>
      <span class="sr-name">${o.name}${badge}</span>
      <span class="sr-cost">${o.cost}</span>
    </button>`);
  }
  rows.push(`<button class="shop-row shop-reroll${run.shopRerolled ? ' spent-reroll' : ''}" type="button" style="--row:3">
    <span class="sr-name">Reroll the stock</span>
    <span class="sr-cost">${rerollCost}</span>
  </button>`);
  panel.innerHTML = `${rows.join('')}
    <div class="shop-desc" id="shopDesc">"Looted fair and square."</div>
    <button class="shop-leave" type="button" aria-label="Leave"></button>`;
  panel.classList.add('show');
  panel.querySelectorAll('.shop-row[data-i]').forEach(b => {
    b.addEventListener('click', () => {
      const before = run;
      run = applyShop(run, +b.dataset.i);
      if (run === before) { tone(200, .07, 'square', .04); return; }
      tone(740, .09, 'triangle', .05);
      refresh();
    });
    b.addEventListener('mouseenter', () => { $('shopDesc').textContent = b.dataset.desc; });
  });
  panel.querySelector('.shop-reroll').addEventListener('click', () => {
    const before = run;
    run = rerollShop(run);
    if (run === before) { tone(200, .07, 'square', .04); return; }
    tone(540, .07, 'triangle', .05);
    refresh();
  });
  panel.querySelector('.shop-leave').addEventListener('click', () => {
    run = skipShop(run);
    tone(380, .08, 'triangle', .04);
    refresh();
  });
}

function openShop() {
  refresh(); // render stages the Peddler + panel via phase
}

$('game').hidden = false;
initArena($('arena'));
initFx($('arena').querySelector('.monster-stage'));
// The enemy card surfaces beside the sprite while you study the thing;
// the sprite itself catches the light.
{
  const monActor = document.querySelector('.mon-actor');
  const enemyCard = document.querySelector('.enemy-card');
  monActor.addEventListener('pointerenter', () => {
    enemyCard.classList.add('show');
    monActor.classList.add('inspect');
  });
  monActor.addEventListener('pointerleave', () => {
    enemyCard.classList.remove('show');
    monActor.classList.remove('inspect');
  });
}
const throwBtn = $('throwBtn');
throwBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  onAction();
});
throwBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onAction();
  }
});
$('wagerBtn').onclick = () => {
  resumeAudio();
  startAmbient();
  run = toggleWager(run);
  tone(run.wager ? 640 : 240, .06, 'triangle', .04);
  refresh();
};
// VIEW DICE: the satchel lives in a popover, off the main HUD.
$('viewDiceBtn').onclick = () => {
  resumeAudio();
  document.querySelector('.player-hud').classList.toggle('satchel-open');
  tone(440, .05, 'triangle', .04);
};
$('snd').onchange = e => setAudioEnabled(e.target.checked);
$('fast').onchange = e => { setFast(e.target.checked); setRollFast(e.target.checked); };

// Boot: the corridor breathes behind the main menu. CONTINUE resumes the
// live run, or rehydrates the last camp snapshot after a reload.
const menu = initMenu({
  hasContinue: () => (runStarted
    ? ![PHASE.WON, PHASE.OVER].includes(run.phase)
    : !!loadSave()),
  continueRun: () => {
    if (!runStarted) {
      const saved = loadSave();
      if (saved) {
        run = saved;
        runSeq++;
        arenaReset();
      }
      runStarted = true;
    }
    refresh();
  },
  newRun: diffId => restart(diffId),
  runAgain: () => restart(),
});
refresh();
// A hub-routed launch (?start / ?continue) already closed the menu and is
// mid-run - reopening it here buried the live game under the menu scrim.
const routed = ['start', 'continue'].some(k => new URLSearchParams(location.search).has(k));
if (!routed) menu.openMenu();
