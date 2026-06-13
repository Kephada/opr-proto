// Camp input: drag-everywhere arrange, tap-to-inspect sheet, slot purchase,
// halt-phase tap-select. Talks to run state only through the io accessors
// handed in by app.js; engine transitions are the only game logic touched.
import { KEYWORD_LEGEND, RANK_AT, activeSlots, canCombine, clanCounts, clanRanks, dieTitle, elementInfo, sizeLabel, speciesAbilityText } from '../engine/config.js';
import { PHASE, combineDice, currentRewardOffers, currentShopOffers, moveActive, promoteBench, swapActiveWithBench } from '../engine/run.js';
import { resumeAudio, startAmbient, tone } from './audio.js';
import { dieCardHTML, faceStripHTML } from './dieCard.js';

const $ = id => document.getElementById(id);

export function initArrange(io) {
  // io: { getRun, setRun, isBusy, refresh, setSelected }
  let dragFrom = -1;
  let dragMoved = false;

  function dropAt(x, y, dragZone) {
    const run = io.getRun();
    const el = document.elementFromPoint(x, y)?.closest('.dice-slot[data-zone]');
    if (!el) return null;
    const zone = el.dataset.zone;
    const idx = +el.dataset.i;
    if (zone === 'active') {
      if (idx < run.build.active.length) return dragZone === 'active' && idx === dragFrom ? null : { zone, idx };
      if (dragZone === 'bench' && idx < activeSlots(run.build)) return { zone, idx, grow: true };
      return null;
    }
    if (zone === 'bench') {
      if (dragZone === 'active' && run.build.bench[idx]) return { zone, idx };
      return null;
    }
    return null;
  }

  const dieIn = (run, zone, idx) => zone === 'bench' ? run.build.bench[idx] : run.build.active[idx];

  // Combine payoff: the fused die flares and throws sparks - longer and
  // louder the higher the resulting tier (a d12 birth is an event; a d6 is
  // a spark). Runs AFTER refresh so it lands on the rebuilt slot.
  function fuseJuice(t, fused) {
    if (!fused) return;
    const ti = Math.max(0, [6, 8, 10, 12].indexOf(fused.size)); // 0..3
    tone(840 + ti * 70, .12 + ti * .04, 'triangle', .06);
    tone(1220 + ti * 130, .08 + ti * .02, 'sine', .04);
    if (ti >= 2) tone(420, .22, 'sawtooth', .035);
    const slot = document.querySelector(`.dice-slot[data-zone="${t.zone}"][data-i="${t.idx}"]`);
    if (!slot) return;
    const fz = `${(0.32 + ti * 0.17).toFixed(2)}s`;
    slot.style.setProperty('--fz', fz);
    slot.classList.remove('fused');
    void slot.offsetWidth;
    slot.classList.add('fused');
    const n = 5 + ti * 3;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'fuse-spark';
      s.style.setProperty('--fa', `${Math.round((360 / n) * i + Math.random() * 24)}deg`);
      s.style.setProperty('--fd', `${Math.round(22 + ti * 9 + Math.random() * 12)}px`);
      s.style.setProperty('--fz', fz);
      slot.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }

  function applyDrop(dragZone, from, t) {
    const run = io.getRun();
    let next = run;
    const a = dieIn(run, dragZone, from);
    const b = dieIn(run, t.zone, t.idx);
    // Two identical dice FUSE: next tier + evolution (SPEC v0.8 combine).
    if (canCombine(a, b)) {
      next = combineDice(run, dragZone, from, t.zone, t.idx);
      io.setRun(next);
      io.setSelected(null);
      io.refresh();
      fuseJuice(t, dieIn(next, t.zone, t.idx));
      return;
    }
    if (dragZone === 'active' && t.zone === 'active') next = moveActive(run, from, t.idx);
    else if (dragZone === 'active' && t.zone === 'bench') next = swapActiveWithBench(run, from, t.idx);
    else if (dragZone === 'bench' && t.zone === 'active') {
      next = t.grow ? promoteBench(run, from) : swapActiveWithBench(run, t.idx, from);
    }
    io.setRun(next);
    io.setSelected(null);
    tone(520, .05, 'triangle', .045);
    io.refresh();
  }

  function markDropTarget(x, y, dragZone) {
    clearDropTargets();
    if (!dragMoved) return;
    const t = dropAt(x, y, dragZone);
    if (!t) return;
    const slot = document.querySelector(`.dice-slot[data-zone="${t.zone}"][data-i="${t.idx}"]`);
    if (!slot) return;
    const run = io.getRun();
    const a = dieIn(run, dragZone, dragFrom);
    const b = dieIn(run, t.zone, t.idx);
    if (canCombine(a, b)) {
      slot.classList.add('combine-target');
      slot.dataset.combine = `COMBINE → ${sizeLabel(a.size === 12 ? 12 : [6, 8, 10, 12][[4, 6, 8, 10].indexOf(a.size)])}`;
    } else {
      slot.classList.add('drop-target');
    }
  }

  function clearDropTargets() {
    document.querySelectorAll('.dice-slot.drop-target, .dice-slot.combine-target').forEach(el => el.classList.remove('drop-target', 'combine-target'));
  }

  function startDrag(e, zone, i) {
    if (io.isBusy()) return;
    const run = io.getRun();
    if (run.phase !== PHASE.ARRANGE) {
      if (zone === 'active') tapSlot(zone, i);
      return;
    }
    e.preventDefault();
    resumeAudio();
    startAmbient();
    dragFrom = i;
    dragMoved = false;
    const dragZone = zone;
    const slot = e.currentTarget;
    try { slot.setPointerCapture?.(e.pointerId); } catch {}
    slot.classList.add('dragging');
    const ghost = slot.cloneNode(true);
    ghost.classList.remove('dragging', 'movable', 'drop-target');
    ghost.classList.add('drag-ghost');
    document.body.appendChild(ghost);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const moveGhost = (x, y) => { ghost.style.left = `${x}px`; ghost.style.top = `${y}px`; };
    moveGhost(e.clientX, e.clientY);
    const onMove = ev => {
      dragMoved ||= Math.hypot(ev.clientX - x0, ev.clientY - y0) > 7;
      moveGhost(ev.clientX, ev.clientY);
      markDropTarget(ev.clientX, ev.clientY, dragZone);
    };
    const onUp = ev => {
      try { slot.releasePointerCapture?.(ev.pointerId); } catch {}
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerup', onUp);
      slot.removeEventListener('pointercancel', onCancel);
      ghost.remove();
      const t = dropAt(ev.clientX, ev.clientY, dragZone);
      clearDropTargets();
      if (dragMoved && t) applyDrop(dragZone, dragFrom, t);
      else if (!dragMoved) tapSlot(zone, i);
      dragFrom = -1;
      dragMoved = false;
    };
    const onCancel = ev => {
      try { slot.releasePointerCapture?.(ev.pointerId); } catch {}
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerup', onUp);
      slot.removeEventListener('pointercancel', onCancel);
      ghost.remove();
      clearDropTargets();
      dragFrom = -1;
      dragMoved = false;
      io.refresh();
    };
    slot.addEventListener('pointermove', onMove);
    slot.addEventListener('pointerup', onUp);
    slot.addEventListener('pointercancel', onCancel);
  }

  function tapSlot(zone, idx) {
    if (io.isBusy()) return;
    resumeAudio();
    startAmbient();
    const run = io.getRun();
    if (run.phase !== PHASE.ARRANGE) return;
    const d = zone === 'bench' ? run.build.bench[idx] : run.build.active[idx];
    openSheet(d);
  }

  function openSheet(d) {
    if (!d) return;
    const info = elementInfo(d.element);
    $('sheetDie').innerHTML = dieCardHTML(d);
    $('sheetTitle').textContent = dieTitle(d);
    $('sheetDesc').textContent = info.desc;
    $('sheetMeta').innerHTML = faceStripHTML(d);
    $('sheet').hidden = false;
    tone(420, .05, 'triangle', .035);
  }

  function closeSheet() {
    $('sheet').hidden = true;
  }

  // Diablo-style hover tooltip on hover-capable devices (Steam-first).
  // Touch keeps the bottom sheet; hover gets the item card.
  const hoverable = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  if (hoverable) {
    const tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.hidden = true;
    document.body.appendChild(tip);
    const dieAt = el => {
      const run = io.getRun();
      const idx = +el.dataset.i;
      if (el.classList.contains('shop-row')) return currentShopOffers(run)[idx]?.die;
      if (el.dataset.zone === 'altar') return currentRewardOffers(run)[idx]?.die;
      return el.dataset.zone === 'bench' ? run.build.bench[idx] : run.build.active[idx];
    };
    // Keywords read as KEYWORDS: bolded and tinted wherever rules text
    // shows. The engine stays plain-text; presentation happens here.
    const kw = t => t
      .replace(/\bcrits?\b/gi, m => `<b class="kw kw-crit">${m}</b>`)
      .replace(/\bcharges?d?\b/gi, m => `<b class="kw kw-charge">${m}</b>`)
      .replace(/\bpoison\b/gi, m => `<b class="kw kw-poison">${m}</b>`)
      .replace(/\bexplo(de|des|sions?)\b/gi, m => `<b class="kw kw-crit">${m}</b>`);
    const legendIf = (...texts) => texts.join(' ').toLowerCase().includes('crit')
      ? `<div class="tip-legend">${kw(KEYWORD_LEGEND)}</div>` : '';
    // The clan roadmap, shared by die and chip cards: every rank tier with
    // its 2/4/6 threshold - reached tiers lit, the active one boxed,
    // unreached tiers waiting greyed out.
    const tiersHTML = info => {
      const rank = clanRanks(io.getRun().build)[info.id] || 0;
      return `<div class="clan-tiers c-${info.color}">${info.ranks.map((fx, i) =>
        `<div class="clan-tier ${rank === i + 1 ? 'on now' : rank > i ? 'on' : 'off'}"><span class="ct-th">${RANK_AT[i]}</span><span class="ct-fx">${kw(fx)}</span></div>`).join('')}</div>`;
    };
    const showTip = el => {
      const d = dieAt(el);
      if (!d) return;
      const run = io.getRun();
      const info = elementInfo(d.element);
      const ability = speciesAbilityText(d);
      // Die hover = what THIS die does, in two beats: its ability and the
      // clan's CURRENT standing. The full 3-tier roadmap lives on the clan
      // chip - stacking it here drowned the ability (playtest note).
      const rank = clanRanks(run.build)[d.element] || 0;
      const n = clanCounts(run.build)[d.element] || 0;
      const clanLine = rank
        ? `${info.name} rank ${rank}: ${info.ranks[rank - 1]}`
        : `${info.name}: field ${Math.max(1, RANK_AT[0] - n)} more to awaken the clan.`;
      tip.innerHTML = `
        <div class="tip-title el-${d.element}">${dieTitle(d)}</div>
        ${faceStripHTML(d)}
        ${ability ? `<div class="tip-ability">${kw(ability)}</div>` : ''}
        <div class="tip-clan c-${info.color}">${kw(clanLine)}</div>
        ${legendIf(ability, clanLine)}`;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
      tip.style.left = `${left}px`;
      const th = tip.offsetHeight;
      tip.style.top = r.top - th - 10 > 8 ? `${r.top - th - 10}px` : `${r.bottom + 10}px`;
    };
    // TFT-style clan card: every rank tier listed, thresholds 2/4/6 as
    // medallions; reached tiers burn in the clan color, the active tier is
    // boxed, unreached tiers wait greyed-out — the build's roadmap.
    const showClanTip = el => {
      const info = elementInfo(el.dataset.clan);
      const run = io.getRun();
      const n = clanCounts(run.build)[info.id] || 0;
      const rank = clanRanks(run.build)[info.id] || 0;
      tip.innerHTML = `
        <div class="tip-title el-${info.id}">${info.name}</div>
        <div class="tip-count c-${info.color}">${n} fielded${rank ? ` · rank ${rank}` : ` · ${RANK_AT[0] - n} more to awaken`}</div>
        <div class="tip-desc">${kw(info.desc)}</div>
        ${tiersHTML(info)}
        ${legendIf(info.desc, info.ranks.join(' '))}`;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
      const th = tip.offsetHeight;
      tip.style.top = r.top - th - 10 > 8 ? `${r.top - th - 10}px` : `${r.bottom + 10}px`;
    };
    const hideTip = () => { tip.hidden = true; };
    document.addEventListener('mouseover', e => {
      const el = e.target.closest?.('.dice-slot[data-zone], .altar-die[data-zone], .shop-row[data-i]');
      const chip = e.target.closest?.('.clan-chip[data-clan]');
      if (el && !io.isBusy()) showTip(el);
      else if (chip) showClanTip(chip);
      else if (!e.target.closest?.('#tooltip')) hideTip();
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest?.('.dice-slot[data-zone], .altar-die[data-zone], .shop-row[data-i], .clan-chip[data-clan]')) hideTip();
    });
    document.addEventListener('pointerdown', hideTip, true);
  }

  // Sheet chrome: scrim tap or a >=40px downward swipe closes it.
  const sheetEl = $('sheet');
  sheetEl.addEventListener('pointerdown', e => { if (e.target === sheetEl) closeSheet(); });
  const sheetCard = sheetEl.querySelector('.sheet-card');
  let sheetY0 = null;
  sheetCard.addEventListener('pointerdown', e => { sheetY0 = e.clientY; });
  sheetCard.addEventListener('pointermove', e => {
    if (sheetY0 != null && e.clientY - sheetY0 > 40) {
      closeSheet();
      sheetY0 = null;
    }
  });
  window.addEventListener('pointerup', () => { sheetY0 = null; });

  return { startDrag, tapSlot, closeSheet };
}
