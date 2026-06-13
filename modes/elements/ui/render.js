// DOM writes only. Reads the ctx snapshot {run, busy, selected, on} built by
// app.js each refresh; input handlers arrive via ctx.on (wired in arrange.js).
// Layout law (panel 2026-06-10): the arena is the stage; chrome overlays or
// compresses; the action button says Fight and only its body changes state.
import { ACTIVE_CAP, BENCH_CAP, CLANS, LEVELS, MAX_HEARTS, RANK_AT, SLOT_MILESTONES, activeSlots, clanCounts, elementInfo, modifierLabel, rankFor } from '../engine/config.js';
import { PHASE, currentFoe } from '../engine/run.js';
import { showFoe } from './arena.js';
import { debuffIcon } from './debuffIcons.js';
import { dieCardHTML } from './dieCard.js';

const $ = id => document.getElementById(id);

export function setBtn(label) {
  $('throwBtn').querySelector('span').textContent = label;
}

function phaseActionLabel(ctx) {
  if (ctx.run.phase === PHASE.WON || ctx.run.phase === PHASE.OVER) return 'Run Again';
  return 'Roll';
}

function renderStats(ctx) {
  const { run } = ctx;
  const h = Math.max(0, run.hearts);
  $('heartStat').innerHTML = '♥'.repeat(h) + '<i>♥</i>'.repeat(Math.max(0, MAX_HEARTS - h));
  $('goldStat').textContent = `${run.gold} g`;
  $('runTheme').textContent = run.theme?.name || 'Theme';
  // Character sheet: HERO level - it rises after the dice-free fights
  // (1/3/5/7/9), not every door. Skill trees hang off this later.
  $('lvlVal').textContent = 1 + Math.ceil(run.levelIdx / 2);
  $('goldVal').textContent = run.gold;
  $('heartsVal').textContent = `${h}/${MAX_HEARTS}`;
}

// The ladder is eight ember pips: done, current (pulsing), ahead, boss.
function renderLadder(ctx) {
  const { run } = ctx;
  const levels = run.levels || LEVELS;
  $('ladder').innerHTML = levels.map((f, i) => {
    const cls = [
      'pip-rung',
      i < run.levelIdx ? 'done' : '',
      i === run.levelIdx ? 'current' : '',
      f.sealedSlot === 0 ? 'boss' : '',
    ].filter(Boolean).join(' ');
    return `<span class="${cls}" title="${f.name} - ${f.target}${modifierLabel(f.modifier) ? ' - ' + modifierLabel(f.modifier) : ''}"></span>`;
  }).join('');
}

function renderActive(ctx) {
  const { run, selected } = ctx;
  const tray = $('tray');
  tray.innerHTML = '';
  tray.className = 'tray dice-grid';
  const focusRows = null;
  const active = run.build.active;
  const slotsOpen = activeSlots(run.build);

  for (let i = 0; i < ACTIVE_CAP; i++) {
    const d = active[i];
    const dr = focusRows?.[i];
    const slot = document.createElement('div');
    slot.className = 'dice-slot';
    slot.dataset.zone = 'active';
    slot.dataset.i = i;
    if (i >= slotsOpen) {
      const fightNo = SLOT_MILESTONES[i + 1] != null ? SLOT_MILESTONES[i + 1] + 1 : null;
      slot.classList.add('empty', 'locked');
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-lock">${fightNo ? `UNLOCKS<b>FIGHT ${fightNo}</b>` : 'LOCKED'}</span>`;
      tray.appendChild(slot);
      continue;
    }
    if (!d) {
      slot.classList.add('empty');
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-lock">OPEN</span>`;
      tray.appendChild(slot);
      continue;
    }
    if (selected?.zone === 'active' && selected.idx === i) slot.classList.add('sel');
    if (run.phase === PHASE.ARRANGE) slot.classList.add('movable');
    if (dr) {
      slot.classList.add('rolled');
      if (dr.locked) slot.classList.add('locked');
      if (dr.focusHint) slot.classList.add('hint');
    }
    if (currentFoe(run).sealedSlot === i && run.phase === PHASE.ARRANGE) slot.classList.add('locked');
    const label = dr ? dr.label : null;
    slot.innerHTML = `<span class="slot-num">${i + 1}</span>${dieCardHTML(d, { label, armed: !!dr?.armed })}`;
    slot.addEventListener('pointerdown', e => ctx.on.slotPointerDown(e, 'active', i));
    tray.appendChild(slot);
  }
}

function renderBench(ctx) {
  const { run } = ctx;
  const bench = $('bench');
  bench.innerHTML = '';
  for (let i = 0; i < BENCH_CAP; i++) {
    const d = run.build.bench[i];
    const slot = document.createElement('div');
    slot.className = `dice-slot bench-slot${d ? ' movable' : ' empty'}`;
    slot.dataset.zone = 'bench';
    slot.dataset.i = i;
    slot.innerHTML = `<span class="slot-num">B${i + 1}</span>${d ? dieCardHTML(d) : ''}`;
    if (d) slot.addEventListener('pointerdown', e => ctx.on.slotPointerDown(e, 'bench', i));
    bench.appendChild(slot);
  }
}

const setHpWidth = w => {
  $('hpfill').style.width = w;
  $('hpghost').style.width = w;
};

const setTarget = v => {
  $('hpBadge').textContent = v;
  $('ecTarget').textContent = v;
};

// One status line under the arena: readout, verdict, recap, and tip all
// timeshare it - they are never meaningful simultaneously.
function renderStatus(ctx) {
  const { run } = ctx;
  const foe = currentFoe(run);
  if (run.lastStrike && run.phase !== PHASE.ARRANGE) {
    const r = run.lastStrike;
    $('total').textContent = r.total.toLocaleString();
    $('total').parentElement.classList.remove('idle');
    setTarget(r.target);
    $('hplabel').textContent = r.cleared ? 'CLEARED' : `${r.short} short`;
    // pool semantics: the bar shows what remains of the FULL hp, never refills
    setHpWidth(`${r.cleared ? 0 : Math.max(0, (((r.poolLeft ?? r.target) - r.total) / (r.baseTarget || r.target)) * 100)}%`);
    $('readout').innerHTML = r.cleared
      ? `<span class="good">cleared</span>&nbsp; <i class="coin"></i>${r.gold}`
      : `<span class="bad">it stands</span>&nbsp; ${r.short} left · roll again`;
    return;
  }
  const target = run.wager ? Math.ceil(foe.target * 1.5) : foe.target;
  $('total').textContent = '0';
  $('total').parentElement.classList.add('idle'); // counter exists only once damage lands
  $('ovk').textContent = '';
  $('ovk').className = 'ovk hint';
  const wounded = (run.fightDmg || 0) > 0;
  // No duplicate target line - the hp bar label carries the number. The
  // readout speaks only when something happened (strike-back / wager).
  const recap = run.lastStrike && !run.lastStrike.cleared
    ? `<span class="bad">short by ${run.lastStrike.short} — it struck back ♥−1</span> · roll again`
    : '';
  $('readout').innerHTML = [recap, run.wager ? 'wager ×2' : ''].filter(Boolean).join(' · ');
  setTarget(target);
  $('hplabel').textContent = wounded ? `${foe.target} / ${foe.baseTarget}` : `${target} target`;
  setHpWidth(`${(foe.target / (foe.baseTarget || foe.target)) * 100}%`);
}

// Clan tracker: a chip per fielded clan - count, next threshold, rank pips.
function renderTracker(ctx) {
  const counts = clanCounts(ctx.run.build);
  const chips = CLANS.filter(c => counts[c.id]).map(c => {
    const n = counts[c.id];
    const rank = rankFor(n);
    const next = RANK_AT.find(t => t > n);
    const pips = [1, 2, 3].map(r => `<i class="${r <= rank ? 'on' : ''}"></i>`).join('');
    // No title attribute: the styled hover tooltip (arrange.js) owns hover.
    return `<span class="clan-chip c-${c.color}${rank ? ' ranked' : ''}" data-clan="${c.id}">
      ${c.name} ${n}${next ? `/${next}` : ''}<span class="pips">${pips}</span></span>`;
  });
  $('clanTracker').innerHTML = chips.join('');
}

function renderFoe(ctx) {
  const { run, runSeq } = ctx;
  // THE PEDDLER takes the corridor during the shop phase.
  if (run.phase === PHASE.SHOP) {
    $('roomname').textContent = 'The Peddler';
    $('ecName').textContent = 'The Peddler';
    $('ecDesc').textContent = 'Looted fair and square. Probably.';
    $('ecFight').textContent = `Shop ${Math.min(run.shopIndex + 1, 3)} / 3`;
    $('ecMod').textContent = 'No refunds';
    $('arena').classList.add('shopping');
    // Not a kill: the SLAIN verdict yields to an encounter greeting.
    $('result').textContent = 'A PEDDLER APPROACHES';
    $('result').className = 'result show meet';
    showFoe(`shop:${run.shopIndex}:${ctx.runSeq}`, 'peddler', {});
    return;
  }
  $('arena').classList.remove('shopping');
  const foe = currentFoe(run);
  $('roomname').textContent = foe.name;
  const levels = run.levels || LEVELS;
  $('roomprop').textContent = `${Math.min(run.levelIdx + 1, levels.length)}/${levels.length}`;
  $('roomdesc').textContent = foe.desc;
  // Enemy card (painted panel, landscape).
  $('ecName').textContent = foe.name;
  $('ecDesc').textContent = foe.desc;
  $('ecFight').textContent = `Fight ${Math.min(run.levelIdx + 1, levels.length)} / ${levels.length}`;
  // Per-fight resist on the card: that element's reactions do nothing here.
  const immuneName = foe.immuneElement ? elementInfo(foe.immuneElement).name : '';
  $('ecMod').textContent = [
    foe.sealedSlot === 0 ? 'Seals slot 1' : (modifierLabel(foe.modifier) || ''),
    immuneName ? `Immune: ${immuneName}` : '',
  ].filter(Boolean).join(' · ') || 'No modifier';
  // Camera pulled back (playtest note): the whole body stands in the
  // corridor. Creature SIZE lives in the sprite (monsters.js size), so the
  // per-fight ramp is only a faint deepening-dungeon pressure, not growth.
  $('arena').style.setProperty('--mscale', (0.52 + run.levelIdx * 0.015).toFixed(3));
  const mod = modifierLabel(foe.modifier);
  $('modBadge').textContent = mod;
  $('modBadge').hidden = !mod;
  // Wounded foes gutter: the eyes flicker irregularly while hp is missing.
  $('arena').classList.toggle('wounded', (run.fightDmg || 0) > 0);
  // Status icons (WoW target-frame): the element it RESISTS, armor/ward it
  // WEARS, poison it CARRIES.
  const statuses = [];
  if (foe.immuneElement) statuses.push(debuffIcon('immune', 0, `Immune: ${immuneName} reactions do nothing`, `el-${foe.immuneElement}`));
  if (foe.modifier?.type === 'armor') statuses.push(debuffIcon('armor', foe.modifier.value, `Armor: every hit blunted by ${foe.modifier.value}`));
  if (foe.modifier?.type === 'ward') statuses.push(debuffIcon('ward', foe.modifier.value, `Ward: a single hit caps at ${foe.modifier.value}`));
  if (run.fightVenom > 0) statuses.push(debuffIcon('poison', run.fightVenom, `Poison: +${run.fightVenom} on every later hit`));
  $('debuffs').innerHTML = statuses.join('');
  showFoe(`${runSeq}:${run.levelIdx}`, foe.art, { boss: foe.sealedSlot === 0 });
  if (run.lastStrike && run.phase !== PHASE.ARRANGE) {
    $('result').textContent = run.lastStrike.cleared ? 'SLAIN' : `SHORT ${run.lastStrike.short}`;
    $('result').className = `result show ${run.lastStrike.cleared ? 'win' : 'lose'}`;
  } else {
    $('result').className = 'result';
  }
}

export function render(ctx) {
  renderStats(ctx);
  renderLadder(ctx);
  renderTracker(ctx);
  renderFoe(ctx);
  renderActive(ctx);
  renderBench(ctx);
  renderStatus(ctx);
  setBtn(phaseActionLabel(ctx));
  const btn = $('throwBtn');
  btn.classList.toggle('baked', phaseActionLabel(ctx) === 'Roll'); // painted plate has ROLL baked in
  btn.classList.toggle('spent', ctx.busy);
  const wager = $('wagerBtn');
  wager.hidden = ctx.run.phase !== PHASE.ARRANGE;
  wager.disabled = ctx.busy;
  wager.classList.toggle('on', ctx.run.wager);
  wager.textContent = ctx.run.wager ? 'Wager ×2' : 'Wager';
  // Between fights (altar / Peddler) the verb is gone - choosing IS the turn.
  document.querySelector('.roll-row').classList.toggle('parked',
    [PHASE.REWARD, PHASE.SHOP].includes(ctx.run.phase));
}
