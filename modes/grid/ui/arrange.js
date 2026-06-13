// Camp input: drag-everywhere arrange, tap-to-inspect sheet, slot purchase,
// halt-phase tap-select. Talks to run state only through the io accessors
// handed in by app.js; engine transitions are the only game logic touched.
import {
  BENCH_CAP, GRID_H, GRID_W, KEYWORD_LEGEND, RANK_AT, canCombine, canPlaceAt,
  clanCounts, clanRanks, combinedDie, dieTitle, elementInfo, footprint,
  nextTier, sizeLabel, speciesAbilityText,
} from '../engine/config.js';
import { PHASE, combineDice, currentRewardOffers, currentShopOffers, demoteActive, moveActive, promoteBench, swapActiveWithBench } from '../engine/run.js';
import { resumeAudio, startAmbient, tone } from './audio.js';
import { cellEl, cellFromPoint, gridSlotAt } from './board.js';
import { dieCardHTML, faceStripHTML, footprintBadgeHTML } from './dieCard.js';

const $ = id => document.getElementById(id);

export function initArrange(io) {
  // io: { getRun, setRun, isBusy, refresh, setSelected }
  let dragFrom = -1;
  let dragMoved = false;

  const dieIn = (run, zone, idx) => zone === 'bench' ? run.build.bench[idx] : run.build.active[idx];

  const covers = (d, x, y) => {
    if (!d.cell) return false;
    const fp = footprint(d.size);
    return x >= d.cell.x && x < d.cell.x + fp.w && y >= d.cell.y && y < d.cell.y + fp.h;
  };

  // Resolve the pointer into a drop intent: {type, zone, idx?, origin?, size?,
  // ok}. `ok:false` intents still paint (red footprint) and deny on release.
  // Board targeting is geometric (cellFromPoint) - the footprint's top-left
  // anchors at the pointed cell, clamped into the 3x3.
  function dropAt(x, y, dragZone) {
    const run = io.getRun();
    const drag = dieIn(run, dragZone, dragFrom);
    if (!drag) return null;
    const benchEl = document.elementFromPoint(x, y)?.closest('.dice-slot[data-zone="bench"]');
    if (benchEl) {
      const idx = +benchEl.dataset.i;
      if (dragZone === 'bench' && idx === dragFrom) return null;
      const b = run.build.bench[idx];
      if (b && canCombine(drag, b)) return { type: 'combine', zone: 'bench', idx, ok: true };
      if (dragZone !== 'active') return null;
      if (b) {
        // Swap: the bench die must fit where the fielded die stood.
        return {
          type: 'swap', zone: 'bench', idx, origin: { ...drag.cell }, size: b.size,
          ok: canPlaceAt(run.build, b, drag.cell, drag.id),
        };
      }
      return {
        type: 'demote', zone: 'bench', idx,
        ok: run.build.active.length > 1 && run.build.bench.length < BENCH_CAP,
      };
    }
    const cell = cellFromPoint(x, y);
    if (!cell) return null;
    // A matching die under the pointer means COMBINE - the fused die keeps
    // the target's origin, so its new shape must fit there or it bounces.
    const over = run.build.active.find(d => d !== drag && covers(d, cell.x, cell.y));
    if (over && canCombine(drag, over)) {
      const fused = combinedDie(drag, over);
      return {
        type: 'combine', zone: 'active', idx: run.build.active.indexOf(over),
        origin: { ...over.cell }, size: fused.size,
        ok: canPlaceAt(run.build, fused, over.cell, [drag.id, over.id]),
      };
    }
    const fp = footprint(drag.size);
    const origin = {
      x: Math.max(0, Math.min(cell.x, GRID_W - fp.w)),
      y: Math.max(0, Math.min(cell.y, GRID_H - fp.h)),
    };
    if (dragZone === 'active' && drag.cell && origin.x === drag.cell.x && origin.y === drag.cell.y) return null;
    return { type: 'place', zone: 'active', origin, size: drag.size, ok: canPlaceAt(run.build, drag, origin) };
  }

  // Combine payoff: the fused die flares and throws sparks - longer and
  // louder the higher the resulting tier (a d12 birth is an event; a d6 is
  // a spark). Runs AFTER refresh so it lands on the rebuilt slot.
  const benchSlotEl = idx => document.querySelector(`.dice-slot[data-zone="bench"][data-i="${idx}"]`);

  function fuseJuice(t, fused) {
    if (!fused) return;
    const ti = Math.max(0, [6, 8, 10, 12].indexOf(fused.size)); // 0..3
    tone(840 + ti * 70, .12 + ti * .04, 'triangle', .06);
    tone(1220 + ti * 130, .08 + ti * .02, 'sine', .04);
    if (ti >= 2) tone(420, .22, 'sawtooth', .035);
    // After the re-sorting refresh the fused die is found by ORIGIN, not index.
    const slot = t.zone === 'bench' ? benchSlotEl(t.idx) : gridSlotAt(t.origin.x, t.origin.y);
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

  // Placement lands with a SLAM: the placed die pops (fuseFlare reuse) and
  // the rest of the board takes the jolt.
  function slamJuice(t, next) {
    tone(290, .07, 'square', .05);
    if (t.origin) {
      const slot = gridSlotAt(t.origin.x, t.origin.y);
      if (!slot) return;
      slot.classList.add('slammed');
      setTimeout(() => slot.classList.remove('slammed'), 420);
      document.querySelectorAll('#tray .dice-slot.grid-die').forEach(s => {
        if (s === slot) return;
        s.classList.add('jolt');
        setTimeout(() => s.classList.remove('jolt'), 380);
      });
    } else {
      const idx = t.type === 'demote' ? next.build.bench.length - 1 : t.idx;
      const slot = benchSlotEl(idx);
      slot?.classList.add('slammed');
      setTimeout(() => slot?.classList.remove('slammed'), 420);
    }
  }

  // An illegal drop bounces: the footprint flashes red and the target shakes.
  function denyFeedback(t) {
    tone(170, .1, 'square', .05);
    if (t.origin && t.size) {
      const fp = footprint(t.size);
      for (let dy = 0; dy < fp.h; dy++) {
        for (let dx = 0; dx < fp.w; dx++) {
          const c = cellEl(t.origin.x + dx, t.origin.y + dy);
          c?.classList.add('cell-deny');
          setTimeout(() => c?.classList.remove('cell-deny'), 450);
        }
      }
    }
    const slot = t.type === 'combine' && t.zone === 'active'
      ? gridSlotAt(t.origin.x, t.origin.y)
      : t.zone === 'bench' ? benchSlotEl(t.idx) : null;
    slot?.classList.add('deny');
    setTimeout(() => slot?.classList.remove('deny'), 400);
  }

  function applyDrop(dragZone, from, t) {
    const run = io.getRun();
    let next = run;
    if (t.type === 'combine') next = combineDice(run, dragZone, from, t.zone, t.idx);
    else if (t.type === 'place') next = dragZone === 'active' ? moveActive(run, from, t.origin) : promoteBench(run, from, t.origin);
    else if (t.type === 'swap') next = swapActiveWithBench(run, from, t.idx);
    else if (t.type === 'demote') next = demoteActive(run, from);
    if (next === run) {
      denyFeedback(t);
      return;
    }
    io.setRun(next);
    io.setSelected(null);
    io.refresh();
    if (t.type === 'combine') {
      const fused = t.zone === 'bench'
        ? next.build.bench[t.idx]
        : next.build.active.find(d => d.cell && d.cell.x === t.origin.x && d.cell.y === t.origin.y);
      fuseJuice(t, fused);
    } else {
      tone(520, .05, 'triangle', .045);
      slamJuice(t, next);
    }
  }

  // The drop ghost: the footprint's cells glow green when the drop is legal,
  // red when it isn't; a combine target gets the golden ring + arrow badge.
  function paintCells(origin, size, ok) {
    const fp = footprint(size);
    for (let dy = 0; dy < fp.h; dy++) {
      for (let dx = 0; dx < fp.w; dx++) {
        cellEl(origin.x + dx, origin.y + dy)?.classList.add(ok ? 'cell-ok' : 'cell-bad');
      }
    }
  }

  function markDropTarget(x, y, dragZone) {
    clearDropTargets();
    if (!dragMoved) return;
    const t = dropAt(x, y, dragZone);
    if (!t) return;
    if (t.origin && t.size) paintCells(t.origin, t.size, t.ok);
    if (t.type === 'combine') {
      const slot = t.zone === 'bench' ? benchSlotEl(t.idx) : gridSlotAt(t.origin.x, t.origin.y);
      if (!slot) return;
      if (t.ok) {
        const a = dieIn(io.getRun(), dragZone, dragFrom);
        slot.classList.add('combine-target');
        slot.dataset.combine = `COMBINE → ${sizeLabel(nextTier(a.size))}`;
      } else {
        slot.classList.add('drop-bad');
      }
    } else if (t.zone === 'bench') {
      benchSlotEl(t.idx)?.classList.add(t.ok ? 'drop-target' : 'drop-bad');
    }
  }

  function clearDropTargets() {
    document.querySelectorAll('.dice-slot.drop-target, .dice-slot.combine-target, .dice-slot.drop-bad')
      .forEach(el => el.classList.remove('drop-target', 'combine-target', 'drop-bad'));
    document.querySelectorAll('.grid-cell.cell-ok, .grid-cell.cell-bad')
      .forEach(el => el.classList.remove('cell-ok', 'cell-bad'));
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
      slot.classList.remove('dragging'); // deny/tap paths don't refresh
      const t = dropAt(ev.clientX, ev.clientY, dragZone);
      clearDropTargets();
      if (dragMoved && t?.ok) applyDrop(dragZone, dragFrom, t);
      else if (dragMoved && t) denyFeedback(t);
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
      slot.classList.remove('dragging');
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
        <div class="tip-title el-${d.element}">${dieTitle(d)}${footprintBadgeHTML(d.size)}</div>
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
