// WoW-style status icons on the foe: square icon, type-colored border,
// stack count bottom-right. Shared by render.js (persistent state) and
// throwView.js (live stacks + tick pulses during the cascade).
const ICONS = {
  poison: '<path fill="currentColor" d="M12 3c-3.4 4.6-5.5 7-5.5 10a5.5 5.5 0 0 0 11 0c0-3-2.1-5.4-5.5-10z"/>',
  armor: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 3l7.5 3v6.2c0 4.8-3.2 7.8-7.5 8.8-4.3-1-7.5-4-7.5-8.8V6z"/>',
  ward: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 19a8 8 0 0 1 16 0M12 11V4M9 6.5L12 4l3 2.5"/>',
};

export function debuffIcon(type, count, title = '') {
  return `<span class="debuff ${type}" data-type="${type}" title="${title}">
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[type] || ''}</svg>
    ${count ? `<b>${count}</b>` : ''}
  </span>`;
}

// Flash a status icon when it TICKS (deals or blocks something).
export function pulseDebuff(container, type) {
  const el = container?.querySelector(`.debuff.${type}`);
  if (!el) return;
  el.classList.remove('tickflash');
  void el.offsetWidth;
  el.classList.add('tickflash');
}
