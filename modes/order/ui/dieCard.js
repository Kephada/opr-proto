// The one die-card builder. Every die rendered anywhere (tray, bench, roll
// tumble, strike replay, inspector) goes through this so views never drift.
// Faces are PIPS (panel verdict: captions on dice read as stickers on chips).
import { elementInfo } from '../engine/config.js';
import { speciesGlyph } from './dieGlyphs.js';

// Classic pip layouts on a 3x3 grid (cells 1-9, row-major). Covers d8 max.
const PIP_CELLS = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
  7: [1, 3, 4, 5, 6, 7, 9],
  8: [1, 2, 3, 4, 6, 7, 8, 9],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

export function pipsHTML(value) {
  const cells = PIP_CELLS[value];
  if (!cells) return `<span class="face-text">${value}</span>`;
  return `<span class="pips">${cells.map(c => `<i class="pip c${c}"></i>`).join('')}</span>`;
}

// Rolled faces are NUMERALS (playtest: pips crowded the shaped dice and
// collided with the tier tag). Pips survive only in the tooltip face strip.
export function faceNumHTML(value) {
  return `<span class="face-num">${value}</span>`;
}

// face: numeric value -> pips (+ tiny numeral badge); 'LOCK' -> seal; '?' ->
// pips are flickered live by rollView; unrolled -> element gem + size tag.
export function dieCardHTML(d, { label = null, armed = false, tumbling = false } = {}) {
  const info = elementInfo(d.element);
  // Evolution stars (v0.8): the die's personal proc level.
  const orb = d.evo ? `<span class="slot-note evo-stars">${'★'.repeat(Math.min(3, d.evo))}</span>` : '';
  // No title attribute: the styled hover tooltip (arrange.js) owns hover.
  const cls = `die el-${d.element} tier-${d.size}${armed ? ' armed' : ''}${tumbling ? ' tumble' : ''}`;
  const title = '';
  const sizeTag = d.size ? `<span class="dsz t${d.size}">d${d.size}</span>` : '';

  let face;
  let badge = '';
  if (label == null) {
    // Idle face: the species' sigil (its portrait). Legacy dice without a
    // species keep the old clan gem.
    face = speciesGlyph(d.species) || `<span class="gem" aria-hidden="true"></span>`;
  } else if (label === 'LOCK') {
    face = `<span class="face-text">LOCK</span>`;
  } else {
    const m = /^(\d+)(\+\?)?$/.exec(String(label));
    if (m) {
      face = `${faceNumHTML(m[1])}${m[2] ? '<span class="fuse">+?</span>' : ''}`;
    } else {
      face = faceNumHTML('?'); // tumbling: rollView flickers the numeral live
    }
  }
  // The tier tag lives OUTSIDE the die (a clipped silhouette would cut it
  // off, and it collided with the face numeral on the d4 triangle).
  return `${orb}<div class="${cls}"${title}><span class="v">${face}</span>${badge}</div>${sizeTag}`;
}

// Adapter for diceRes rows (strike/roll replays).
export function dieCardFromRes(dr, opts = {}) {
  return dieCardHTML({ element: dr.element, orb: dr.orb, name: dr.short, size: dr.size }, opts);
}

// The die's faces unfolded as mini pip-faces (Dicey Dungeons read):
// what this die CAN roll, shown, not written.
export function faceStripHTML(d) {
  const faces = [];
  for (let n = 1; n <= d.size; n++) {
    faces.push(`<span class="mini-die el-${d.element}">${pipsHTML(n)}</span>`);
  }
  return `<div class="face-strip">${faces.join('')}</div>`;
}
