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

  // ---- Main menu ------------------------------------------------------------
  $('mDiff').innerHTML = DIFFICULTIES.map(d => `
    <button class="m-btn diff ${d.id}" type="button" data-diff="${d.id}">
      ${d.name}<span class="dd">${d.desc}</span>
    </button>`).join('');

  function openMenu() {
    victoryEl.hidden = true;
    defeatEl.hidden = true;
    $('mDiff').hidden = true;
    $('mOpts').hidden = true;
    $('mContinue').disabled = !io.hasContinue();
    $('mEmbers').hidden = false;
    $('mEmbers').textContent = `â˜„ ${readMeta().embers} soul embers`;
    menuEl.hidden = false;
    applyOpts();
  }

  function closeMenu() {
    menuEl.hidden = true;
  }

  $('mContinue').addEventListener('click', () => {
    resumeAudio();
    startAmbient();
    tone(440, .06, 'triangle', .04);
    closeMenu();
    io.continueRun();
  });
  $('mStart').addEventListener('click', () => {
    resumeAudio();
    tone(540, .05, 'triangle', .04);
    $('mDiff').hidden = !$('mDiff').hidden;
  });
  $('mDiff').querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
    resumeAudio();
    startAmbient();
    tone(660, .08, 'triangle', .05);
    closeMenu();
    io.newRun(b.dataset.diff);
  }));
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
      <div class="v-row"><span class="vl">Soul embers</span><span class="vv embers">+${e.gained} â˜„ (${e.total})</span></div>`;
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
      <div class="v-row"><span class="vl">Soul embers</span><span class="vv embers">+${e.gained} â˜„ (${e.total})</span></div>`;
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


  // Routed launch from the hub menu (?start=1&diff=x boots straight into a
  // run; ?continue=1 resumes THIS mode's save). The page menu remains for
  // restarts. Audio waits for the first real gesture (autoplay policy).
  {
    const params = new URLSearchParams(location.search);
    if (params.get('start')) {
      closeMenu();
      io.newRun(params.get('diff') || 'normal');
    } else if (params.get('continue')) {
      closeMenu();
      io.continueRun();
    }
  }

  applyOpts();
  return { openMenu, showVictory, showDefeat };
}

