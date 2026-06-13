// The grid board DOM: a 3x3 absolute-cell shell plus footprint-positioned
// die slots. Shared by the camp render (render.js) and both replays
// (rollView/throwView) so the cascade walks the same cells the player
// arranged. Geometry lives in proto.css via --gx/--gy/--gw/--gh.
import { GRID_H, GRID_W, cellUnlockFight, footprint } from '../engine/config.js';

// Rebuilds the tray as the cell board. `area` is remembered on the tray's
// dataset so the replays (which only get a result payload) reuse it.
export function boardShell(tray, area = null) {
  const aw = area?.w ?? +(tray.dataset.aw || 2);
  const ah = area?.h ?? +(tray.dataset.ah || 2);
  tray.dataset.aw = aw;
  tray.dataset.ah = ah;
  tray.innerHTML = '';
  tray.className = 'tray grid-board';
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cell = document.createElement('div');
      const locked = x >= aw || y >= ah;
      cell.className = `grid-cell${locked ? ' locked-cell' : ''}`;
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.style.setProperty('--gx', x);
      cell.style.setProperty('--gy', y);
      if (locked) cell.innerHTML = `<span class="cell-lock">⛓<b>FIGHT ${cellUnlockFight(x, y)}</b></span>`;
      tray.appendChild(cell);
    }
  }
}

// Stamps a die slot with its grid origin + footprint span (CSS does the rest).
export function positionGridSlot(slot, cell, size) {
  const fp = footprint(size);
  const x = cell?.x ?? 0;
  const y = cell?.y ?? 0;
  slot.classList.add('grid-die');
  slot.dataset.gx = x;
  slot.dataset.gy = y;
  slot.style.setProperty('--gx', x);
  slot.style.setProperty('--gy', y);
  slot.style.setProperty('--gw', fp.w);
  slot.style.setProperty('--gh', fp.h);
}

// Geometric cell hit-test (the dice sit ABOVE the cells, so elementFromPoint
// can't reach them; rects can). Half-gap slack keeps the seams droppable.
export function cellFromPoint(x, y) {
  const tray = document.getElementById('tray');
  if (!tray) return null;
  for (const c of tray.querySelectorAll('.grid-cell')) {
    const r = c.getBoundingClientRect();
    if (x >= r.left - 3 && x < r.right + 3 && y >= r.top - 3 && y < r.bottom + 3) {
      return { x: +c.dataset.x, y: +c.dataset.y };
    }
  }
  return null;
}

export const cellEl = (x, y) => document.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
export const gridSlotAt = (x, y) => document.querySelector(`.dice-slot[data-gx="${x}"][data-gy="${y}"]`);
