// v0.8 "Clans" data. Pure game data and offer helpers; no DOM.
// SPEC-v0.8-CLANS.md: 5 clans x TFT thresholds (2/4/6), 5 tiers (d4..d12),
// combine-evolution, 10-fight ladder, shops at 3/6/9, pity-weighted drafts.

export const ACTIVE_CAP = 6;
export const STARTING_SLOTS = 3;
export const BENCH_CAP = 4;
export const FOCUS_CHARGES = 2; // legacy (Focus removed from play)
export const MAX_HEARTS = 4;

// Clan ids reuse the v0.7 element keys so the resolve pipeline and the
// el-* color system carry over (lesson #17: one dial, not a rebuild).
export const CLAN = Object.freeze({
  EMBER: 'fire',
  VENOM: 'venom',
  STORM: 'storm',
  STONE: 'stone',
  COIN: 'coin',
});

// Copy rules (writer pass 2026-06-11): mechanics text is imperative,
// numbers first, one read. Flavor never mixes into rules text. Rank-3
// names stay - they are the love objects.
export const CLANS = [
  {
    id: CLAN.EMBER, name: 'Fire', color: 'red', icon: 'FI',
    desc: 'Fire crits EXPLODE: roll again, add it.',
    ranks: [
      'Fire dice +1.',
      'Fire dice +2. Their crits explode.',
      'CHAIN DETONATION: +3. Explosions chain.',
    ],
  },
  {
    id: CLAN.VENOM, name: 'Poison', color: 'green', icon: 'PO',
    desc: 'Later dice add poison. Poison ignores Armor.',
    ranks: [
      'Each later die: +1 poison.',
      '+2 poison. Sticks between rolls.',
      'THE PLAGUE: 4 poison, double damage.',
    ],
  },
  {
    id: CLAN.STORM, name: 'Storm', color: 'blue', icon: 'ST',
    desc: 'Each storm die CHARGES the next - charge can push a die into a crit.',
    ranks: [
      'Charge next die +1.',
      'Charge next die +2.',
      'TEMPEST ECHO: charge +3. Your last die strikes twice.',
    ],
  },
  {
    id: CLAN.STONE, name: 'Stone', color: 'grey', icon: 'SN',
    desc: 'No low rolls.',
    ranks: [
      'Stone dice never roll under 3.',
      'No die of yours rolls under 2.',
      'MOUNTAIN LAW: nothing rolls under half its max.',
    ],
  },
  {
    id: CLAN.COIN, name: 'Gold', color: 'gold', icon: 'GO',
    desc: 'Kills pay extra gold. Luck rerolls your worst die.',
    ranks: [
      '+2 gold a kill. Lowest die rerolls once.',
      '+4 gold a kill. Overkill pays. Draft rerolls free.',
      'MIDAS: +7 gold a kill. +1 damage per 15 gold held (max +6). Wager asks ×1.25.',
    ],
  },
];

const CLAN_BY_ID = Object.fromEntries(CLANS.map(c => [c.id, c]));
export const clanInfo = id => CLAN_BY_ID[id] || CLAN_BY_ID[CLAN.STONE];
// Back-compat alias (UI imports elementInfo).
export const elementInfo = clanInfo;

// ---- Species: 2 named dice per clan (TFT heroes). Combine = SAME NAME. ----
// Ability rule: trigger on a VISIBLE face (max, even, a 1) - anticipation
// lives on the roll reveal. Power scales with tier; no hidden state.
export const speciesPower = size => Math.floor(size / 2);          // 2..6
export const speciesGoldPower = size => Math.max(1, tierIndex(size) + 1); // 1..5
export const bulwarkBonus = size => [1, 1, 2, 2, 3][Math.max(0, tierIndex(size))];

// Keyword language (one vocabulary everywhere, UI bolds them):
// CRIT = the die shows its TOP FACE - and charge counts toward it, so a
// charged 4 on a d6+2 IS a crit. CHARGE = bonus to the next/named die.
// POISON = +N on every later hit. The synergy web hangs off three words.
export const KEYWORD_LEGEND = 'CRIT = the die shows its top face. Charge counts toward it.';
// Names stay SIMPLE (playtest rule): one concrete word a player repeats.
// The ids are save-format - they never change even when display names do.
export const SPECIES = [
  { id: 'cinder', clan: CLAN.EMBER, name: 'Ember', text: s => `Crit: +${speciesPower(s)} damage.` },
  { id: 'fusewick', clan: CLAN.EMBER, name: 'Fuse', text: s => `Crit: charge next die +${speciesPower(s)}.` },
  { id: 'fangling', clan: CLAN.VENOM, name: 'Fang', text: s => `Odd face: +${speciesPower(s)} poison.` },
  { id: 'maw', clan: CLAN.VENOM, name: 'Eater', text: s => `Each 1 rolled: +${speciesPower(s)} damage.` },
  { id: 'stormeye', clan: CLAN.STORM, name: 'Mirror', text: () => `Copies half the previous die.` },
  { id: 'galecaller', clan: CLAN.STORM, name: 'Gust', text: s => `Even face: charge next die +${speciesPower(s)}.` },
  { id: 'cornerstone', clan: CLAN.STONE, name: 'Anchor', text: s => `+${speciesPower(s)} in slot 1.` },
  { id: 'bulwark', clan: CLAN.STONE, name: 'Shield', text: s => `Never crits. Charges both neighbors +${bulwarkBonus(s)}.` },
  { id: 'gilded', clan: CLAN.COIN, name: 'Coin', text: s => `Beats the die before it: +${speciesGoldPower(s)} gold.` },
  { id: 'tithe', clan: CLAN.COIN, name: 'Taxman', text: s => `Neighbor crits: +${speciesGoldPower(s)} gold.` },
];
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
export const speciesInfo = id => SPECIES_BY_ID[id] || null;
export const clanSpeciesList = clan => SPECIES.filter(s => s.clan === clan);
export const speciesAbilityText = d => {
  const sp = speciesInfo(d.species);
  return sp ? sp.text(d.size) : '';
};
function pickSpecies(clan, rng) {
  const list = clanSpeciesList(clan);
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))].id;
}

// ---- Difficulty (v0.9 PLACEHOLDER: one flat knob so the demo has a choice;
// the real difficulty design pass is planned later — keep this dumb) --------
export const DIFFICULTIES = [
  { id: 'normal', name: 'Delver', desc: 'The standard delve.', bump: 0 },
  { id: 'cruel', name: 'Cruel Delve', desc: 'Every foe +3.', bump: 3 },
];
export const difficultyInfo = id => DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[0];

// ---- Tiers ----------------------------------------------------------------
export const TIERS = [4, 6, 8, 10, 12];
export const TIER_NAMES = { 4: 'Common', 6: 'Uncommon', 8: 'Rare', 10: 'Epic', 12: 'Legendary' };
export const TIER_PRICES = { 4: 10, 6: 16, 8: 26, 10: 42, 12: 65 };
export const sizeLabel = size => `d${size}`;
export const tierIndex = size => TIERS.indexOf(size);
export const nextTier = size => TIERS[Math.min(TIERS.length - 1, tierIndex(size) + 1)];

// ---- Dice -----------------------------------------------------------------
// species is OPT-IN: bare dice (legacy saves, tests, sim probes) carry no
// name and no ability; every player-facing source passes one explicitly.
// UNITS (PATH 2): every die is a creature with hp. maxHp = 2 + tierIndex
// (d4=2 .. d12=6); a TOWER SHIELD adds +2 on top (derived, so replacing the
// item never leaves stale hp math behind).
export const unitBaseHp = size => 2 + Math.max(0, tierIndex(size));
export const unitMaxHp = d => (d.maxHp ?? unitBaseHp(d.size)) + (d.item === 'shield' ? 2 : 0);

export function die(element = CLAN.STONE, size = 4, extra = {}) {
  const species = extra.species || null;
  return {
    id: extra.id || `${element}-${size}-${Math.random().toString(36).slice(2, 7)}`,
    name: extra.name || speciesInfo(species)?.name || clanInfo(element).name,
    element,
    species,
    size,
    evo: extra.evo || 0,
    orb: extra.orb || null, // parked in v0.8
    seed: !!extra.seed,
    item: extra.item || null, // one equipment slot per unit
    maxHp: unitBaseHp(size),
    hp: unitBaseHp(size), // persistent copy; per-fight wounds live on the run
  };
}

export const cloneDie = d => ({ ...d });

export function cloneBuild(build) {
  return {
    slots: build.slots ?? build.active.length,
    active: build.active.map(cloneDie),
    bench: build.bench.map(cloneDie),
  };
}

export function dieTitle(d) {
  const evo = d.evo ? ` ${'★'.repeat(Math.min(3, d.evo))}` : '';
  const who = speciesInfo(d.species)?.name || clanInfo(d.element).name;
  return `${who} ${sizeLabel(d.size)}${evo}`;
}

export function dieDesc(d) {
  const c = clanInfo(d.element);
  const ability = speciesAbilityText(d);
  const evo = d.evo ? ` ★${d.evo}: its proc grows.` : '';
  return `${ability ? `${ability} ` : ''}${c.desc}${evo}`;
}

export const orbInfo = () => null; // orbs parked in v0.8

// ---- Clan ranks (thresholds count FIELDED dice only) -----------------------
export const RANK_AT = [2, 4, 6];

export function clanCounts(build) {
  const counts = {};
  for (const d of build.active) counts[d.element] = (counts[d.element] || 0) + 1;
  return counts;
}

export const rankFor = count => (count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0);

export function clanRanks(build) {
  const counts = clanCounts(build);
  const ranks = {};
  for (const c of CLANS) ranks[c.id] = rankFor(counts[c.id] || 0);
  return ranks;
}

// ---- Combine: 2 identical dice -> next tier + evolution --------------------
// TFT star-up rule: only the SAME NAME fuses (Cinder + Cinder, never
// Cinder + Fusewick) - the chase is for copies of YOUR hero.
export function canCombine(a, b) {
  return !!a && !!b && a !== b && a.element === b.element
    && a.species === b.species && a.size === b.size && a.size < 12;
}

export function combinedDie(a, b) {
  return die(a.element, nextTier(a.size), {
    evo: Math.max(a.evo || 0, b.evo || 0) + 1,
    species: a.species,
    item: a.item || b.item || null, // gear survives the fusion
  });
}

// ---- Starter: the Seed Clan pair (rank 1 alive from roll one) --------------
function pickIndex(rng, len) {
  return Math.min(len - 1, Math.floor(rng() * len));
}

export function STARTER(rng = Math.random) {
  const seedClan = CLANS[pickIndex(rng, CLANS.length)].id;
  const species = pickSpecies(seedClan, rng); // a PAIR - combinable from roll one
  return {
    slots: STARTING_SLOTS,
    active: [
      die(seedClan, 4, { seed: true, species }),
      die(seedClan, 4, { seed: true, species }),
    ],
    bench: [],
  };
}

export const SLOT_MILESTONES = Object.freeze({ 4: 2, 5: 4, 6: 6 });

export function slotsForFight(levelIdx) {
  let slots = STARTING_SLOTS;
  for (const [slot, idx] of Object.entries(SLOT_MILESTONES)) {
    if (levelIdx >= idx) slots = Math.max(slots, +slot);
  }
  return Math.min(ACTIVE_CAP, slots);
}

// ---- The ladder: 10 fights, boss at 10 (targets per SPEC v0.8 §3) ----------
// Ladder re-derived for v0.8.5 Named Dice (species add ~18% damage; 600-run
// smart-bot check landed 73.5% win - full T12-style revalidation still owed).
export const LEVELS = [
  { name: 'Mostly Bones', target: 5, art: 'skeleton', desc: 'The bones got back up.' },
  { name: 'The Grinning Thing', target: 6, art: 'goblin', desc: 'That grin has too many teeth in it.' },
  { name: 'The Tusked Thing', target: 8, art: 'orc', desc: 'Its armor is dented from the inside.' },
  { name: 'The Lantern Keeper', target: 13, art: 'lantern', desc: 'The light is for finding you.' },
  { name: 'It Marches', target: 16, art: 'skeleton', desc: 'It still remembers its orders.' },
  { name: 'The Horned Herald', target: 21, art: 'satyr', desc: 'It saw your dice. It laughed.' },
  { name: 'The Other One', target: 27, art: 'orc', desc: 'You killed its brother. It counted.' },
  { name: 'The Bigger One', target: 31, art: 'ogre', desc: 'You heard it three fights ago. It heard you first.' },
  { name: 'The Debt Collector', target: 36, art: 'lantern', desc: 'It holds a lantern for everyone you owe.' },
  { name: 'The Doorkeeper', target: 46, sealedSlot: 0, art: 'boss', desc: 'It knows your opening move. It has sealed it.' },
];

export const THEMES = [
  {
    id: 'armored',
    name: 'The Armored Host',
    modifiers: [null, null, { type: 'armor', value: 1 }, null, { type: 'armor', value: 1 }, { type: 'ward', value: 12 }, { type: 'armor', value: 1 }, null, { type: 'armor', value: 2 }, null],
  },
  {
    id: 'warded',
    name: 'The Warded Court',
    modifiers: [null, null, { type: 'ward', value: 8 }, { type: 'ward', value: 10 }, { type: 'armor', value: 1 }, { type: 'ward', value: 12 }, null, { type: 'armor', value: 1 }, { type: 'ward', value: 14 }, null],
  },
  {
    id: 'march',
    name: 'The Long March',
    modifiers: [null, null, { type: 'armor', value: 1 }, { type: 'ward', value: 10 }, { type: 'armor', value: 1 }, null, { type: 'ward', value: 12 }, null, { type: 'armor', value: 2 }, null],
  },
];

export function pickTheme(rng = Math.random) {
  return THEMES[pickIndex(rng, THEMES.length)];
}

export function themedLevels(theme) {
  const t = typeof theme === 'string' ? THEMES.find(x => x.id === theme) : theme;
  const selected = t || THEMES[2];
  return LEVELS.map((level, i) => ({
    ...level,
    modifier: selected.modifiers[i] || null,
    theme: selected.name,
  }));
}

export function modifierLabel(modifier) {
  if (!modifier) return '';
  if (modifier.type === 'armor') return `Armor ${modifier.value}`;
  if (modifier.type === 'ward') return `Ward ${modifier.value}`;
  return '';
}

// ---- Economy (SPEC v0.8 §4) -------------------------------------------------
export const GOLD_CURVE = [4, 5, 6, 7, 8, 9, 10, 12, 14, 20];
export const killGold = levelIdx => GOLD_CURVE[Math.min(levelIdx, GOLD_CURVE.length - 1)];
export const overkillDivisor = (levelIdx, coinRank = 0) => (coinRank >= 2 ? 3 : levelIdx >= 6 ? 4 : 5);
export const COIN_KILL_BONUS = [0, 2, 4, 7]; // by coin rank

export const SHOP_AFTER = [2, 5, 8]; // levelIdx of fights 3, 6, 9
export const DRAFT_REROLL_COST = 3;
export const SHOP_REROLL_COST = [5, 8, 12];

// Tier odds [d4,d6,d8,d10,d12]
const DRAFT_ODDS = [
  { upto: 2, odds: [0.45, 0.40, 0.15, 0, 0] },
  { upto: 5, odds: [0.25, 0.40, 0.25, 0.10, 0] },
  { upto: 9, odds: [0.05, 0.20, 0.35, 0.30, 0.10] },
];
const SHOP_ODDS = [
  [0.70, 0.25, 0.05, 0, 0],
  [0.35, 0.40, 0.20, 0.05, 0],
  [0.15, 0.30, 0.35, 0.15, 0.05],
];

function rollTier(odds, rng) {
  let r = rng();
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r <= 0) return TIERS[i];
  }
  return TIERS[odds.length - 1];
}

const draftOddsFor = levelIdx => (DRAFT_ODDS.find(b => levelIdx <= b.upto) || DRAFT_ODDS[2]).odds;

// Identities the player holds UNPAIRED (combine candidates) - the pity pool.
// Identity = clan + SPECIES + tier (same-name combine demands species pity,
// or the chase starves at 1-in-10 per draft slot).
export function unpairedIdentities(build) {
  const tally = {};
  for (const d of [...build.active, ...build.bench]) {
    if (d.size >= 12) continue;
    const key = `${d.element}:${d.species || ''}:${d.size}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  return Object.entries(tally)
    .filter(([, n]) => n % 2 === 1)
    .map(([key]) => {
      const [element, species, size] = key.split(':');
      return { element, species: species || null, size: +size };
    });
}

export function holdsIdentical(build, d) {
  return [...build.active, ...build.bench].some(x =>
    x.element === d.element && x.species === d.species && x.size === d.size && x.size < 12);
}

// 3-die draft with duplicate pity: each held unpaired identity adds weight;
// forceDup hard-pities one exact duplicate (run tracks droughts).
export function draftOffers(levelIdx, build = { active: [], bench: [] }, rng = Math.random, forceDup = false) {
  const odds = draftOddsFor(levelIdx);
  const pity = unpairedIdentities(build);
  const offers = [];
  for (let i = 0; i < 3; i++) {
    let d;
    const pityChance = Math.min(0.45, 0.15 * pity.length);
    if (pity.length && rng() < pityChance) {
      const pick = pity[pickIndex(rng, pity.length)];
      d = die(pick.element, pick.size, { species: pick.species });
    } else {
      const clan = CLANS[pickIndex(rng, CLANS.length)].id;
      d = die(clan, rollTier(odds, rng), { species: pickSpecies(clan, rng) });
    }
    offers.push(d);
  }
  if (forceDup && pity.length && !offers.some(d => holdsIdentical(build, d))) {
    const pick = pity[pickIndex(rng, pity.length)];
    offers[pickIndex(rng, offers.length)] = die(pick.element, pick.size, { species: pick.species });
  }
  return offers.map(d => ({
    type: 'recruit',
    name: dieTitle(d),
    tag: d.element,
    cost: 0,
    die: d,
    desc: dieDesc(d),
    combinesWith: holdsIdentical(build, d) ? nextTier(d.size) : null,
    apply: build2 => addDieToBuild(build2, d),
  }));
}

// ---- Items (UNITS): one equipment slot per unit, sold flat at 8g ----------
export const ITEMS = [
  { id: 'whetstone', name: 'Whetstone', letter: 'W', cost: 8, desc: '+1 to every face this unit rolls.' },
  { id: 'shield', name: 'Tower Shield', letter: 'S', cost: 8, desc: '+2 max hp.' },
  { id: 'thorns', name: 'Thorns', letter: 'T', cost: 8, desc: 'The foe takes 2 whenever this unit is hit.' },
];
export const itemInfo = id => ITEMS.find(i => i.id === id) || null;

const itemOffer = it => ({
  type: 'item',
  item: it,
  name: it.name,
  tag: 'item',
  cost: it.cost,
  desc: it.desc,
  apply: d => { d.item = it.id; }, // equips onto ONE die (replaces its item)
});

// Shop: 3 dice priced by tier (+20% for Coinblood, pity applies) PLUS the
// flat item shelf (UNITS rule 5).
export function shopOffers(shopNo = 0, build = { active: [], bench: [] }, rng = Math.random) {
  const odds = SHOP_ODDS[Math.min(shopNo, SHOP_ODDS.length - 1)];
  const pity = unpairedIdentities(build);
  const offers = [];
  for (let i = 0; i < 3; i++) {
    let d;
    if (pity.length && rng() < Math.min(0.3, 0.1 * pity.length)) {
      const pick = pity[pickIndex(rng, pity.length)];
      d = die(pick.element, pick.size, { species: pick.species });
    } else {
      const clan = CLANS[pickIndex(rng, CLANS.length)].id;
      d = die(clan, rollTier(odds, rng), { species: pickSpecies(clan, rng) });
    }
    const base = TIER_PRICES[d.size];
    const cost = d.element === CLAN.COIN ? Math.round(base * 1.2) : base;
    offers.push({
      type: 'recruit',
      name: dieTitle(d),
      tag: d.element,
      cost,
      die: d,
      desc: dieDesc(d),
      combinesWith: holdsIdentical(build, d) ? nextTier(d.size) : null,
      apply: build2 => addDieToBuild(build2, d),
    });
  }
  for (const it of ITEMS) offers.push(itemOffer(it));
  return offers;
}

// Back-compat alias for the old draft entry point.
export const rewardOffers = (pick = 0) => draftOffers(pick);

// ---- Build helpers ----------------------------------------------------------
export function activeSlots(build) {
  return Math.min(ACTIVE_CAP, build.slots ?? build.active.length);
}

export function addDieToBuild(build, sourceDie) {
  const d = cloneDie(sourceDie);
  if (build.active.length < activeSlots(build)) build.active.push(d);
  else if (build.bench.length < BENCH_CAP) build.bench.push(d);
  else if (activeSlots(build) >= ACTIVE_CAP && build.active.length >= ACTIVE_CAP) build.active[weakestActiveIndex(build.active)] = d;
  else build.active[build.active.length - 1] = d;
}

function weakestActiveIndex(active) {
  return active.reduce((best, d, i) =>
    (d.size + (d.evo || 0) * 2) < (active[best].size + (active[best].evo || 0) * 2) ? i : best, 0);
}
