// REFERENCE: synth SFX (no asset files). UI-only. Lazy AudioContext (autoplay policy).
let actx = null, enabled = true, ambient = null;
export function setAudioEnabled(v) { enabled = v; if (!v) stopAmbient(); else startAmbient(); }

// Must run INSIDE a user gesture (autoplay policy): create + resume the context so SFX aren't silent (esp. iOS Safari).
export function resumeAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* no-op */ }
}

export function tone(freq, dur = .07, type = 'square', gain = .04) {
  if (!enabled) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* no-op */ }
}

// Foley layer (docs/ART-DIRECTION.md): noise-burst impacts over chiptune.
// Shared 1s white-noise buffer, filtered per hit. Nothing cute above ~700Hz
// except coin pings and the win sting.
let noiseBuf = null;
function noiseHit({ dur = .12, freq = 420, type = 'lowpass', q = .8, gain = .06, delay = 0 } = {}) {
  if (!enabled) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = actx.currentTime + delay;
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = actx.createGain();
    src.connect(f); f.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.start(t); src.stop(t + dur + .02);
  } catch (e) { /* no-op */ }
}

// One damage tick landing: filtered noise crack + sub thump, scaled by gain.
export function impact(power = 6) {
  const p = Math.min(1, power / 18);
  noiseHit({ dur: .08 + p * .08, freq: 360 + p * 260, gain: .045 + p * .05 });
  tone(66 + p * 42, .1 + p * .06, 'sine', .055 + p * .035);
}

// Dice tumbling onto the table: a scatter of tiny bandpassed ticks.
export function clatter() {
  for (let i = 0; i < 6; i++) {
    noiseHit({ delay: i * .05 + Math.random() * .03, dur: .022, freq: 1300 + Math.random() * 900, type: 'bandpass', q: 6, gain: .032 });
  }
}

// Gold payout ping - deliberately the brightest sound in the game.
export function coin(i = 0) {
  if (!enabled) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + i * .07;
    [1500 + i * 70, (1500 + i * 70) * 1.5].forEach((f, j) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(j ? .018 : .04, t); g.gain.exponentialRampToValueAtTime(.0001, t + .09);
      o.start(t); o.stop(t + .1);
    });
  } catch (e) { /* no-op */ }
}

// The miss: low drone with a cold noise swell underneath.
export function sting() {
  tone(118, .5, 'sine', .055);
  noiseHit({ dur: .55, freq: 230, gain: .028 });
}

export function boom() {
  if (!enabled) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + .4);
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + .5);
  } catch (e) { /* no-op */ }
}

// Background music: assets/music-soul-shell.mp3 on an endless loop, sitting
// low under the foley. Replaces the old synth drone. Must start inside a
// user gesture (autoplay policy) — startAmbient is called from the FIGHT
// tap and the audio toggle, both gestures; the play() catch covers the rest.
const MUSIC_VOL = 0.32;
let fadeTimer = null;

function fadeTo(target, ms = 1200) {
  clearInterval(fadeTimer);
  const el = ambient;
  if (!el) return;
  const step = (target - el.volume) / Math.max(1, ms / 60);
  fadeTimer = setInterval(() => {
    const v = el.volume + step;
    if ((step >= 0 && v >= target) || (step < 0 && v <= target)) {
      el.volume = target;
      clearInterval(fadeTimer);
      if (target === 0) el.pause();
      return;
    }
    el.volume = v;
  }, 60);
}

export function startAmbient() {
  if (!enabled) return;
  try {
    if (!ambient) {
      ambient = new Audio('assets/music-soul-shell.mp3');
      ambient.loop = true;
      ambient.volume = 0;
      ambient.preload = 'auto';
    }
    ambient.play().catch(() => { /* pre-gesture: the next tap retries */ });
    fadeTo(MUSIC_VOL);
  } catch (e) { /* no-op */ }
}

export function stopAmbient() {
  if (!ambient) return;
  fadeTo(0, 500);
}
