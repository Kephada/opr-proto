// UI art only: layered monster silhouettes for the .mon-svg (viewBox 0 0 100 100).
// Style contract (docs/ART-DIRECTION.md): hard angles, asymmetric poses, menace
// from negative space; .mon-body mass, .mon-mid accents, .mon-rim torch edge,
// .mon-eye / .mon-glyph glow. Ground line sits at y≈92.
export const MONSTERS = {
  // Cinder Rat — dog-sized vermin mid-prowl: arched spiked spine, head slung
  // low and forward, ears pinned, whip tail rising behind.
  rat: `
    <path class="mon-body" d="M14 92 Q7 82 13 71 Q16 60 28 57 L33 47 L38 55 L45 45 L50 54 L57 46 L61 55 Q70 57 77 67 L93 80 L92 85 L79 83 Q80 92 70 92 L63 92 L59 85 Q51 84 46 87 L40 92 Z"/>
    <path class="mon-body" d="M17 90 Q-1 83 7 63 Q9 57 13 60 Q5 76 21 84 Z"/>
    <path class="mon-body" d="M68 60 L61 45 L73 55 Z"/>
    <path class="mon-body" d="M76 62 L79 47 L84 59 Z"/>
    <path class="mon-mid" d="M77 67 L90 79 L80 81 Q79 73 73 68 Z"/>
    <path class="mon-rim" d="M28 57 L33 47 L38 55 L45 45 L50 54 L57 46 L61 55"/>
    <ellipse class="mon-eye" cx="74" cy="69" rx="2.4" ry="2.1"/>
    <ellipse class="mon-eye" cx="81" cy="72" rx="2.2" ry="1.9"/>`,
  // Gate Goblin — hunched cutthroat, bent hood peak, jagged cleaver raised.
  goblin: `
    <path class="mon-body" d="M36 92 L32 80 Q25 72 30 62 Q27 50 40 45 Q52 40 60 47 Q69 52 66 64 L71 75 L65 92 L56 92 L58 81 Q50 85 44 80 L44 92 Z"/>
    <path class="mon-body" d="M40 48 Q37 32 49 28 L47 15 L56 27 Q67 30 64 45 Q53 38 40 48 Z"/>
    <path class="mon-body" d="M60 50 L76 34 L80 40 L66 56 Z"/>
    <path class="mon-mid" d="M73 11 L93 29 L81 37 L70 22 Z"/>
    <path class="mon-rim" d="M49 28 L47 15 L56 27 M73 11 L93 29"/>
    <ellipse class="mon-eye" cx="46" cy="40" rx="2.9" ry="1.7" transform="rotate(-14 46 40)"/>
    <ellipse class="mon-eye" cx="56" cy="42" rx="2.6" ry="1.6" transform="rotate(-10 56 42)"/>`,
  // Armored Host — a wall of slab pauldrons, sunk head, down-hooked horns,
  // knuckles resting on the ground.
  brute: `
    <path class="mon-body" d="M50 95 C26 95 17 84 21 66 Q10 60 15 47 Q22 38 33 42 Q35 27 50 27 Q65 27 67 42 Q78 38 85 47 Q90 60 79 66 C83 84 74 95 50 95 Z"/>
    <path class="mon-body" d="M30 39 L17 17 L39 33 Z"/>
    <path class="mon-body" d="M70 39 L83 17 L61 33 Z"/>
    <path class="mon-body" d="M21 83 Q12 83 14 92 L27 92 Q27 85 21 83 Z"/>
    <path class="mon-body" d="M79 83 Q88 83 86 92 L73 92 Q73 85 79 83 Z"/>
    <path class="mon-mid" d="M17 50 L35 43 L37 57 L19 61 Z"/>
    <path class="mon-mid" d="M83 50 L65 43 L63 57 L81 61 Z"/>
    <path class="mon-mid" d="M42 38 L58 38 L56 51 L44 51 Z"/>
    <path class="mon-rim" d="M17 17 L39 33 M21 66 Q10 60 15 47"/>
    <ellipse class="mon-eye" cx="46" cy="45" rx="2.7" ry="2.4"/>
    <ellipse class="mon-eye" cx="54" cy="45" rx="2.7" ry="2.4"/>`,
  // Warded Court wraith — leaning cowl, hollow face, hem torn into streamers
  // dragged sideways by a draft that is not there.
  wraith: `
    <path class="mon-body" d="M54 7 Q36 11 37 31 Q37 47 32 61 Q28 77 17 88 Q28 83 31 91 Q37 84 41 92 Q47 85 51 93 Q57 86 63 92 Q68 82 80 87 Q70 72 68 55 Q66 41 65 29 Q64 10 54 7 Z"/>
    <path class="mon-ink" d="M45 24 Q53 20 60 26 Q59 38 52 39 Q45 37 45 24 Z"/>
    <path class="mon-mid" d="M17 88 Q28 83 31 91 L27 92 Q22 90 17 88 Z"/>
    <path class="mon-rim" d="M54 7 Q36 11 37 31 Q37 47 32 61"/>
    <ellipse class="mon-eye" cx="49" cy="30" rx="1.8" ry="4.2"/>
    <ellipse class="mon-eye" cx="56" cy="31" rx="1.6" ry="3.8"/>
    <ellipse class="mon-eye" cx="52" cy="22" rx="1.3" ry="2.8"/>`,
  // The Gravelord — a cloak as wide as the corridor, jagged crown, a grave
  // glyph burning in the sternum.
  lord: `
    <path class="mon-body" d="M50 94 C20 94 10 84 14 66 Q7 56 16 48 Q12 36 26 34 Q24 21 38 24 Q42 12 50 13 Q58 12 62 24 Q76 21 74 34 Q88 36 84 48 Q93 56 86 66 C90 84 80 94 50 94 Z"/>
    <path class="mon-body" d="M26 34 L21 11 L34 28 L38 7 L44 26 L50 3 L56 26 L62 7 L66 28 L79 11 L74 34 Z"/>
    <path class="mon-mid" d="M30 60 Q50 52 70 60 L66 88 Q50 82 34 88 Z"/>
    <path class="mon-rim" d="M21 11 L34 28 M50 3 L56 26 M14 66 Q7 56 16 48"/>
    <path class="mon-glyph" d="M50 58 L56 66 L50 76 L44 66 Z"/>
    <ellipse class="mon-eye" cx="40" cy="44" rx="3.2" ry="3"/>
    <ellipse class="mon-eye" cx="60" cy="44" rx="3.2" ry="3"/>
    <ellipse class="mon-eye" cx="25" cy="72" rx="1.4" ry="1.3"/>
    <ellipse class="mon-eye" cx="73" cy="76" rx="1.2" ry="1.1"/>`,
};
export const monsterArt = art => MONSTERS[art] || MONSTERS.goblin;

// Painted bestiary (docs/ASSET-PROMPTS.md): bodies are eyeless voids; the
// LIVING eyes are composited here as SVG ellipses at per-asset anchors so
// cursor tracking, saccades, gleam, and boss-red all keep working.
// eyes: [cx, cy, rx, ry] in the 100x100 viewBox (image fit: xMidYMax meet).
// size: creature-scale identity (1 = man-height). Every painted plate fills
// its canvas, so without this a goblin renders as tall as an ogre; the
// sprite carries the creature's size, the fight index no longer does.
// Eye spec per the /perspective panel (2026-06-11): far eye 70-80% of the
// near eye (3/4 views), sizes small (underbright beats overbright), and the
// glow is built from layered radial gradients screen-blended over the paint
// so it ILLUMINATES the socket instead of sticking onto it.
export const IMAGE_MONSTERS = {
  skeleton: {
    src: 'assets/mon-skeleton.png',
    size: 0.92,
    eyes: [[48.8, 13.2, 1.1, 0.8], [51.3, 12.8, 0.85, 0.62]],
  },
  goblin: {
    src: 'assets/goblin-grinning.png',
    size: 0.78,
    eyes: [[45.6, 27.6, 1.7, 1.2], [53.9, 28.2, 1.3, 0.95]],
  },
  orc: {
    src: 'assets/mon-orc.png',
    size: 1,
    eyes: [[44.6, 14.0, 1.3, 1.0], [47.8, 14.0, 1.0, 0.8]],
  },
  lantern: {
    src: 'assets/mon-lantern.png',
    size: 0.95,
    eyes: [[49.3, 9.5, 1.1, 0.9], [53.9, 9.5, 0.85, 0.7]],
  },
  satyr: {
    src: 'assets/mon-satyr.png',
    size: 1,
    eyes: [[43.9, 15.5, 1.2, 1.0], [48.1, 15.5, 0.95, 0.8]],
  },
  ogre: {
    src: 'assets/mon-ogre.png',
    size: 1.1,
    eyes: [[46.2, 13.5, 1.3, 0.95], [51.5, 13.5, 1.05, 0.8]],
  },
  boss: {
    src: 'assets/mon-boss.png',
    size: 1.14,
    eyes: [[45.4, 11.5, 1.3, 1.0], [50.0, 12.0, 1.05, 0.85]],
  },
  // The Peddler: the shop encounter. Painted eyes (he is KNOWN - the one
  // thing down here that isn't an Unnamed); a golden die floats over his
  // open palm trailing lazy sparks.
  peddler: {
    src: 'assets/peddler.png',
    eyes: [],
    extras: `
      <image class="palm-die" href="assets/golden-die.png" x="76" y="29.5" width="13" height="14.4"/>
      <g class="palm-sparks">
        <circle cx="80" cy="39" r=".8" style="--sd:0s"/>
        <circle cx="86" cy="36.5" r=".6" style="--sd:.6s"/>
        <circle cx="83" cy="41.5" r=".7" style="--sd:1.2s"/>
        <circle cx="88" cy="40.5" r=".5" style="--sd:1.7s"/>
      </g>`,
  },
};

// Hot core -> saturated mid -> deep ember falloff (inverse-square-ish).
const EYE_DEFS = `
<defs>
  <radialGradient id="egA">
    <stop offset="0%" stop-color="#fff4d6"/><stop offset="18%" stop-color="#ffc95e"/>
    <stop offset="45%" stop-color="#e07820" stop-opacity=".55"/>
    <stop offset="75%" stop-color="#b33a00" stop-opacity=".18"/>
    <stop offset="100%" stop-color="#b33a00" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="egR">
    <stop offset="0%" stop-color="#ffd9c0"/><stop offset="18%" stop-color="#ff7050"/>
    <stop offset="45%" stop-color="#c8281a" stop-opacity=".6"/>
    <stop offset="75%" stop-color="#5a0010" stop-opacity=".2"/>
    <stop offset="100%" stop-color="#5a0010" stop-opacity="0"/>
  </radialGradient>
</defs>`;

export const monsterScale = art => IMAGE_MONSTERS[art]?.size || 1;

export function monsterMarkup(art) {
  const img = IMAGE_MONSTERS[art];
  if (!img) return monsterArt(art);
  const grad = art === 'boss' ? 'egR' : 'egA';
  // Per eye: a low socket-spill (light catches the lower rim), a halo, and
  // the hot core. The group carries tracking + behavior states.
  const eyes = img.eyes.map(([x, y, rx, ry], i) => `
    <g class="eye-g" style="--ei:${i}">
      <ellipse class="eye-spill" cx="${x}" cy="${(y + ry * 0.9).toFixed(1)}" rx="${(rx * 3.1).toFixed(1)}" ry="${(ry * 2.5).toFixed(1)}" fill="url(#${grad})" opacity=".16"/>
      <ellipse class="eye-halo" cx="${x}" cy="${y}" rx="${(rx * 2.3).toFixed(1)}" ry="${(ry * 2.1).toFixed(1)}" fill="url(#${grad})" opacity=".55"/>
      <ellipse class="eye-core" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${grad})"/>
    </g>`).join('');
  return `${EYE_DEFS}<image href="${img.src}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMax meet"/>${img.extras || ''}${eyes}`;
}
