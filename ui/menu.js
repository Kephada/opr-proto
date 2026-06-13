// Main menu, options, and the run-victory screen. Pure chrome: run state
// stays in app.js (handed in via io hooks); rules stay in engine/.
// io: { hasContinue(), continueRun(), newRun(diffId), runAgain() }
import { DIFFICULTIES, MAX_HEARTS, difficultyInfo } from '../engine/config.js';
import { resumeAudio, setAudioEnabled, startAmbient, tone } from './audio.js';

const $ = id => document.getElementById(id);
const OPTS_KEY = 'opr-opts-v1';
const META_KEY = 'opr-meta-v1';

// ---- Meta resource: soul embers. EARN-ONLY for now - the spend (and the
// real meta design) is a later pass; the pile just grows so runs leave a mark.
function readMeta() {
  try { return { embers: 0, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch (e) { return { embers: 0 }; }
}

// Victory pays HARD (playtest note): a win is worth ~3 lost runs.
function earnEmbers(run, won) {
  const cleared = won ? (run.levels?.length || 10) : run.levelIdx;
  const gained = cleared + (won ? 15 : 0) + (won && run.difficulty === 'cruel' ? 10 : 0);
  const meta = readMeta();
  meta.embers += gained;
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* no-op */ }
  return { gained, total: meta.embers };
}

export function initMenu(io) {
  const menuEl = $('menuScreen');
  const victoryEl = $('victoryScreen');
  const defeatEl = $('defeatScreen');

  // ---- Options (persisted; sound + UI scale apply on boot) -----------------
  const opts = { sound: true, scale: 100 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch (e) { /* fresh */ }
  // Migrate legacy absolute scales (90/110) to the new multiplier set.
  if (![100, 125, 150].includes(opts.scale)) opts.scale = 100;

  function applyOpts() {
    setAudioEnabled(opts.sound);
    // The scale control MULTIPLIES the viewport auto-zoom (combat.css):
    // body zoom = --ui-auto x --ui-mult, so 100% = "just the auto-scale".
    document.documentElement.style.setProperty('--ui-mult', String(opts.scale / 100));
    const snd = $('optSound');
    snd.textContent = opts.sound ? 'On' : 'Off';
    snd.classList.toggle('on', opts.sound);
    menuEl.querySelectorAll('[data-scale]').forEach(b => {
      b.classList.toggle('on', +b.dataset.scale === opts.scale);
    });
    $('optFull').classList.toggle('on', !!document.fullscreenElement);
    $('optFull').textContent = document.fullscreenElement ? 'On' : 'Off';
  }

  function saveOpts() {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) { /* no-op */ }
  }

  $('optSound').addEventListener('click', () => {
    opts.sound = !opts.sound;
    saveOpts();
    applyOpts();
    if (opts.sound) { resumeAudio(); tone(540, .06, 'triangle', .04); }
  });
  menuEl.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
    opts.scale = +b.dataset.scale;
    saveOpts();
    applyOpts();
  }));
  $('optFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', applyOpts);

  // ---- Run setup (professional menu: difficulty + mode are SETTINGS) -------
  // The selected mode routes START/CONTINUE; each mode page keeps its own
  // save, so Continue always resumes the run of the mode you see selected.
  const MODES = [
    { id: 'classic', name: 'Classic', page: null, save: 'opr-save-v1' },
    { id: 'elements', name: 'I·Elements', page: 'elements.html', save: 'opr-elements-save-v1' },
    { id: 'units', name: 'II·Units', page: 'units.html', save: 'opr-units-save-v1' },
    { id: 'grid', name: 'III·Grid', page: 'grid.html', save: 'opr-grid-save-v1' },
    { id: 'nested', name: 'IV·Nested', page: 'nested.html', save: 'opr-nested-save-v1' },
  ];
  const SETUP_KEY = 'opr-setup-v1';
  const setup = { diff: 'normal', mode: 'classic' };
  try { Object.assign(setup, JSON.parse(localStorage.getItem(SETUP_KEY)) || {}); } catch (e) { /* fresh */ }
  const modeOf = id => MODES.find(m => m.id === id) || MODES[0];

  function saveSetup() {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) { /* no-op */ }
  }

  function renderSetup() {
    $('setupDiff').innerHTML = DIFFICULTIES.map(d =>
      `<button class="opt-toggle${setup.diff === d.id ? ' on' : ''}" type="button" data-sdiff="${d.id}" title="${d.desc}">${d.name}</button>`).join('');
    $('setupMode').innerHTML = MODES.map(m =>
      `<button class="opt-toggle${setup.mode === m.id ? ' on' : ''}" type="button" data-smode="${m.id}">${m.name}</button>`).join('');
    $('setupHint').textContent = `${difficultyInfo(setup.diff).desc}`;
    const mode = modeOf(setup.mode);
    const hasSave = mode.id === 'classic' ? io.hasContinue() : !!localStorage.getItem(mode.save);
    $('mContinue').disabled = !hasSave;
    $('mContinue').textContent = mode.id === 'classic' ? 'Continue Run' : `Continue · ${mode.name.split('·')[1]}`;
    $('mStart').textContent = mode.id === 'classic' ? 'Start Run' : `Start · ${mode.name.split('·')[1]}`;
    menuEl.querySelectorAll('[data-sdiff]').forEach(b => b.addEventListener('click', () => {
      setup.diff = b.dataset.sdiff;
      saveSetup();
      tone(440, .05, 'triangle', .035);
      renderSetup();
    }));
    menuEl.querySelectorAll('[data-smode]').forEach(b => b.addEventListener('click', () => {
      setup.mode = b.dataset.smode;
      saveSetup();
      tone(500, .05, 'triangle', .035);
      renderSetup();
    }));
  }

  function openMenu() {
    victoryEl.hidden = true;
    defeatEl.hidden = true;
    $('mOpts').hidden = true;
    renderSetup();
    $('mEmbers').hidden = false;
    $('mEmbers').textContent = `☄ ${readMeta().embers} soul embers`;
    menuEl.hidden = false;
    applyOpts();
  }

  function closeMenu() {
    menuEl.hidden = true;
  }

  $('mContinue').addEventListener('click', () => {
    const mode = modeOf(setup.mode);
    if (mode.page) {
      location.href = `./${mode.page}?continue=1`;
      return;
    }
    resumeAudio();
    startAmbient();
    tone(440, .06, 'triangle', .04);
    closeMenu();
    io.continueRun();
  });
  $('mStart').addEventListener('click', () => {
    const mode = modeOf(setup.mode);
    if (mode.page) {
      location.href = `./${mode.page}?start=1&diff=${setup.diff}`;
      return;
    }
    resumeAudio();
    startAmbient();
    tone(660, .08, 'triangle', .05);
    closeMenu();
    io.newRun(setup.diff);
  });
  $('mOptions').addEventListener('click', () => {
    resumeAudio();
    tone(440, .05, 'triangle', .035);
    $('mOpts').hidden = !$('mOpts').hidden;
  });
  $('menuBtn').addEventListener('click', () => {
    tone(380, .05, 'triangle', .035);
    openMenu();
  });
  // Exit: closes PWA/launcher windows; a plain tab can't be script-closed,
  // so the button owns up instead of silently failing.
  $('mExit').addEventListener('click', () => {
    window.close();
    setTimeout(() => { $('mExit').textContent = 'Close the tab to leave'; }, 120);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !victoryEl.hidden) return;
    if (menuEl.hidden) openMenu();
    else if (io.hasContinue()) { closeMenu(); io.continueRun(); }
  });

  // ---- Run end screens --------------------------------------------------------
  // The kill (or the killing blow) lands first, THEN the verdict screen.
  function showVictory(run) {
    const onePunch = !run.fightDmg; // the boss died to a single roll
    const e = earnEmbers(run, true);
    $('vPunch').hidden = !onePunch;
    $('vStats').innerHTML = `
      <div class="v-row"><span class="vl">Dungeon</span><span class="vv">${run.theme?.name || '-'}</span></div>
      <div class="v-row"><span class="vl">Difficulty</span><span class="vv">${difficultyInfo(run.difficulty).name}</span></div>
      <div class="v-row"><span class="vl">Hearts left</span><span class="vv hearts">${Math.max(0, run.hearts)} / ${MAX_HEARTS}</span></div>
      <div class="v-row"><span class="vl">Gold banked</span><span class="vv gold">${run.gold} g</span></div>
      <div class="v-row"><span class="vl">Soul embers</span><span class="vv embers">+${e.gained} ☄ (${e.total})</span></div>`;
    setTimeout(() => {
      victoryEl.hidden = false;
      tone(523, .14, 'triangle', .05);
      tone(784, .18, 'triangle', .05);
      setTimeout(() => tone(1046, .22, 'triangle', .045), 160);
    }, 1100);
  }

  function showDefeat(run) {
    const cleared = run.levelIdx;
    const e = earnEmbers(run, false);
    $('dStats').innerHTML = `
      <div class="v-row"><span class="vl">Dungeon</span><span class="vv">${run.theme?.name || '-'}</span></div>
      <div class="v-row"><span class="vl">Difficulty</span><span class="vv">${difficultyInfo(run.difficulty).name}</span></div>
      <div class="v-row"><span class="vl">Doors broken</span><span class="vv">${cleared} / ${run.levels?.length || 10}</span></div>
      <div class="v-row"><span class="vl">Soul embers</span><span class="vv embers">+${e.gained} ☄ (${e.total})</span></div>`;
    setTimeout(() => {
      defeatEl.hidden = false;
      tone(196, .4, 'sine', .05);
      tone(131, .55, 'sine', .045);
    }, 1300);
  }

  const closeEnd = () => {
    victoryEl.hidden = true;
    defeatEl.hidden = true;
  };
  $('vAgain').addEventListener('click', () => {
    tone(660, .08, 'triangle', .05);
    closeEnd();
    io.runAgain();
  });
  $('dAgain').addEventListener('click', () => {
    tone(660, .08, 'triangle', .05);
    closeEnd();
    io.runAgain();
  });
  $('vMenu').addEventListener('click', () => {
    tone(440, .06, 'triangle', .04);
    openMenu();
  });
  $('dMenu').addEventListener('click', () => {
    tone(440, .06, 'triangle', .04);
    openMenu();
  });

  applyOpts();
  return { openMenu, showVictory, showDefeat };
}
