// PATH 4 NESTED - Playwright UX gate. Run: node modes/nested/uxcheck.mjs
// (serve the repo root on :8742 first). Drives a real run into each state
// the CLAUDE.md HARD RULE demands: camp, the after-EVERY-kill altar, a
// socketed vessel showing its jackpot pip, and the eject sheet - at
// 1280x800, 1600x1100 and 414x820 - then asserts the altar dice and the
// socket pip are visible and unoccluded. Zero console errors tolerated.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8742/nested.html?start=1&diff=normal';
const SHOTS = 'shots';
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { tag: '1280x800', width: 1280, height: 800 },
  { tag: '1600x1100', width: 1600, height: 1100 },
  { tag: '414x820', width: 414, height: 820 },
];

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

const intersects = (a, b) => a && b
  && a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;

async function rect(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
}

// Is the element at its own center (nothing painted over it)? Decorative
// elements ship pointer-events:none, which makes elementFromPoint skip them
// even when they paint on top - restore hit-testing for the probe so the
// answer reflects true paint order.
async function topAtCenter(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    const undo = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).pointerEvents === 'none') {
        undo.push([n, n.style.pointerEvents]);
        n.style.pointerEvents = 'auto';
      }
    }
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    for (const [n, v] of undo) n.style.pointerEvents = v;
    return !!hit && (el.contains(hit) || hit.contains(el));
  }, sel);
}

async function dragSlot(page, fromSel, toSel) {
  const a = await rect(page, fromSel);
  const b = await rect(page, toSel);
  if (!a || !b) throw new Error(`drag: missing ${!a ? fromSel : toSel}`);
  const cx = r => r.x + r.width / 2;
  const cy = r => r.y + r.height / 2;
  await page.mouse.move(cx(a), cy(a));
  await page.mouse.down();
  await page.mouse.move(cx(a) + 12, cy(a) + 12, { steps: 3 }); // pass the 7px drag gate
  await page.mouse.move(cx(b), cy(b), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

// Fight until the altar rises (Remainder Fights may need several rolls).
async function fightToAltar(page, tag) {
  for (let i = 0; i < 8; i++) {
    if (await page.locator('.altar.risen .altar-die').count()) return true;
    await page.locator('#throwBtn').dispatchEvent('pointerdown');
    await page.waitForTimeout(400);
    await page.locator('#throwBtn').dispatchEvent('pointerdown'); // accelerate the cascade
    try {
      await page.waitForSelector('.altar.risen .altar-die', { timeout: 6000 });
      return true;
    } catch { /* remainder miss - roll again */ }
  }
  console.log(`      [${tag}] altar never rose after 8 rolls`);
  return false;
}

const server = { errors: [] };
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  // The checkbox input is styled away; flip it directly and fire change.
  await page.evaluate(() => {
    const f = document.getElementById('fast');
    f.checked = true;
    f.dispatchEvent(new Event('change'));
  });

  // ---- 1: camp -------------------------------------------------------------
  await page.waitForSelector('.dice-slot[data-zone="active"][data-i="1"]');
  await page.screenshot({ path: `${SHOTS}/${vp.tag}-1-camp.png` });
  const hud = await rect(page, '.player-hud');
  const btn = await rect(page, '#throwBtn');
  // The action button lives INSIDE the HUD by design; the gate is that both
  // exist and nothing paints over the button.
  ok(hud && btn && await topAtCenter(page, '#throwBtn'), `[${vp.tag}] camp: action button visible + unoccluded`);

  // ---- 2: the altar (draft now fires after EVERY kill - fight 1 included) --
  const rose = await fightToAltar(page, vp.tag);
  ok(rose, `[${vp.tag}] altar rises after the FIRST kill (every-kill cadence)`);
  if (!rose) { await ctx.close(); continue; }
  await page.waitForTimeout(600); // let the rise settle
  await page.screenshot({ path: `${SHOTS}/${vp.tag}-2-altar.png` });
  // First-draft teach: a d4 of the seed clan must be on the altar.
  const seedClan = await page.evaluate(() =>
    [...document.querySelector('.dice-slot[data-zone="active"][data-i="0"] .die').classList]
      .find(c => c.startsWith('el-')));
  const teachSel = `.altar-die .die.tier-4.${seedClan}`;
  ok(await page.locator(teachSel).count() >= 1, `[${vp.tag}] altar offers a seed-clan d4 (the teach)`);
  for (const i of [0, 1, 2]) {
    const aRect = await rect(page, `.altar-die[data-i="${i}"]`);
    ok(!intersects(aRect, hud) && !intersects(aRect, btn),
      `[${vp.tag}] altar die ${i} clear of HUD + action button`);
    ok(await topAtCenter(page, `.altar-die[data-i="${i}"]`), `[${vp.tag}] altar die ${i} unoccluded`);
  }

  // ---- 3: take the teach d4, fuse a d6, socket the d4 inside ---------------
  await page.locator(`.altar-die:has(${teachSel.replace('.altar-die ', '')})`).first().click();
  await page.waitForTimeout(700); // altar sinks
  const slots = () => page.evaluate(() =>
    [...document.querySelectorAll('.dice-slot[data-zone="active"] .die')].map(d => d.className));
  const before = await slots();
  ok(before.length === 3, `[${vp.tag}] teach d4 joined the board (3 active, got ${before.length})`);
  // Drags right after the altar sinks can race the relayout - retry up to 3x.
  let afterFuse = before;
  for (let t = 0; t < 3 && afterFuse.length !== 2; t++) {
    await dragSlot(page, '.dice-slot[data-zone="active"][data-i="2"]', '.dice-slot[data-zone="active"][data-i="0"]');
    afterFuse = await slots();
  }
  ok(afterFuse.length === 2 && afterFuse[0].includes('tier-6'),
    `[${vp.tag}] drag-combine fused a d6 (got ${afterFuse.map(c => c.match(/tier-\d+/)?.[0]).join(',')})`);
  for (let t = 0; t < 3 && (await slots()).length !== 1; t++) {
    await dragSlot(page, '.dice-slot[data-zone="active"][data-i="1"]', '.dice-slot[data-zone="active"][data-i="0"]');
  }
  // Park the cursor off the tray: headless always reports hover-capable, so
  // the Diablo tooltip (absent on real phones) would sit over the pip.
  await page.mouse.move(2, vp.height / 2);
  await page.waitForTimeout(150);
  const pipSel = '.dice-slot[data-zone="active"][data-i="0"] .socket-pip';
  ok(await page.locator(pipSel).count() === 1, `[${vp.tag}] drag-socket: d4 climbed inside the d6`);
  // The fused d6 is ★1, so the widened jackpot must read ⬡5+, not ⬡6.
  const pipText = await page.locator(`${pipSel} b`).textContent().catch(() => '');
  ok(pipText === '⬡5+', `[${vp.tag}] socket pip shows the widened window (got "${pipText}")`);
  const pipTop = await topAtCenter(page, pipSel);
  if (!pipTop) {
    const hit = await page.evaluate(s => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, hit: h ? `${h.tagName}.${h.className}` : 'null' };
    }, pipSel);
    console.log(`      [${vp.tag}] pip rect ${hit.rect}; covered by: ${hit.hit}`);
  }
  ok(pipTop, `[${vp.tag}] socket pip visible + unoccluded`);
  const pipRect = await rect(page, pipSel);
  ok(!intersects(pipRect, btn), `[${vp.tag}] socket pip clear of the action button`);
  await page.screenshot({ path: `${SHOTS}/${vp.tag}-3-socketed.png` });

  // ---- 4: the sheet - socket rows + EJECT -----------------------------------
  await page.locator('.dice-slot[data-zone="active"][data-i="0"]').click();
  await page.waitForSelector('#sheet:not([hidden])');
  ok(await page.locator('#sheet .socket-row').count() === 2, `[${vp.tag}] sheet lists both sockets`);
  ok(await page.locator('#sheet .eject-btn').count() === 1, `[${vp.tag}] sheet offers EJECT for the passenger`);
  ok(await topAtCenter(page, '#sheet .eject-btn'), `[${vp.tag}] EJECT button unoccluded`);
  await page.screenshot({ path: `${SHOTS}/${vp.tag}-4-sheet.png` });
  // Eject round-trips: the passenger lands on the bench.
  await page.locator('#sheet .eject-btn').click();
  await page.waitForTimeout(250);
  ok(await page.locator('.dice-slot[data-zone="bench"] .die').count() === 1,
    `[${vp.tag}] EJECT returns the passenger to the bench`);

  ok(errs.length === 0, `[${vp.tag}] zero console errors${errs.length ? ` - got: ${errs.join(' | ')}` : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
process.exit(failures ? 1 : 0);
