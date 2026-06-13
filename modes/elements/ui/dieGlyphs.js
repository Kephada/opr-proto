// Species portraits: one small geometric sigil per named die. Discipline
// over decoration - single-weight strokes, flat fills, icon-font shapes
// (a fang, a shield, an eye). Color comes from currentColor; the clan
// tint glows via CSS. 24x24 viewBox everywhere.
const G = inner => `<svg class="sglyph" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

const GLYPHS = {
  // Emberkin
  cinder: G('<path fill="currentColor" d="M12 2.5c-3 5-6.5 7.2-6.5 11.5a6.5 6.5 0 0 0 13 0c0-4.3-3.5-6.5-6.5-11.5z"/><path fill="#17130e" d="M12 11c-1.4 2.2-2.6 3.2-2.6 5a2.6 2.6 0 0 0 5.2 0c0-1.8-1.2-2.8-2.6-5z"/>'),
  fusewick: G('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4.5 20q7-2 9-9"/><path fill="currentColor" d="M16.5 4l1.2 3.3L21 8.5l-3.3 1.2L16.5 13l-1.2-3.3L12 8.5l3.3-1.2z"/>'),
  // Venombrood
  fangling: G('<path fill="currentColor" d="M9 3.5q7 3.5 7 10 0 5-3.5 7.5-1-6-4.5-10.5-2.5-4 1-7z"/>'),
  maw: G('<path fill="currentColor" d="M4 8.5l3.2 4.5 2.1-3.2 2.7 4 2.7-4 2.1 3.2L20 8.5l-1.6 8q-6.4 4.5-12.8 0z"/>'),
  // Stormbound
  stormeye: G('<ellipse cx="12" cy="12" rx="9" ry="5.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.7" fill="currentColor"/>'),
  galecaller: G('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 9h9.5a3 3 0 1 0-3-3M3.5 13h13a3 3 0 1 1-3 3M3.5 17h6.5"/>'),
  // Stonewrought
  cornerstone: G('<path fill="currentColor" d="M8.5 4h7l4 7-3 9h-9l-3-9z"/><path fill="#17130e" d="M11 9h2v6h-2z"/>'),
  bulwark: G('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 3l7.5 3v6.2c0 4.8-3.2 7.8-7.5 8.8-4.3-1-7.5-4-7.5-8.8V6z"/>'),
  // Coinblood
  gilded: G('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  tithe: G('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 4v15M5.5 6.5h13"/><path fill="currentColor" d="M2.5 12a3.2 3.2 0 0 0 6.4 0L5.7 6.8zM15.1 12a3.2 3.2 0 0 0 6.4 0l-3.2-5.2z"/>'),
};

export const speciesGlyph = id => GLYPHS[id] || '';
