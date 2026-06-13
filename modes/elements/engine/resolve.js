// Tickline resolution, PATH 1 — ELEMENTS. Pure engine: roll, preview, strike.
// Every die that hits PAINTS the foe with its element; a hit on a DIFFERENT
// paint checks the directional reaction table (docs/proto/PATH-1-ELEMENTS.md).
// Clan ranks: r1 = clan dice +1, r2 = clan reactions +50%, r3 = the named
// specials. Species keep name + sigil only — no face triggers in this mode.
import { CLAN, FOCUS_CHARGES, clanRanks, cloneDie, dieTitle, tierIndex } from './config.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rollRaw = (size, rng) => 1 + Math.min(size - 1, Math.floor(rng() * size));
const armorValue = foe => foe.modifier?.type === 'armor' ? foe.modifier.value : 0;
const wardValue = foe => foe.modifier?.type === 'ward' ? foe.modifier.value : 0;
// MIDAS makes the Wager ask x1.25 instead of x1.5.
const targetFor = (foe, wager, ranks) =>
  wager ? Math.ceil(foe.target * (ranks?.[CLAN.COIN] >= 3 ? 1.25 : 1.5)) : foe.target;

// MOUNTAIN LAW (stone r3) floors everything at half max. The old r1/r2
// floors are gone — stone r1 is the generic clan +1 like everyone else.
export function effectiveFace(die, natural, ranks = {}) {
  const floor = (ranks[CLAN.STONE] || 0) >= 3 ? Math.ceil(die.size / 2) : 1;
  return Math.max(natural, Math.min(floor, die.size));
}

export function faceLabel(roll) {
  if (!roll) return '0';
  if (roll.locked) return 'LOCK';
  return roll.armed ? `${roll.value}+?` : `${roll.value}`;
}

// Ember explosion gate: rank 3 (CHAIN DETONATION) arms max faces; an evolved
// red die arms its top (1+evo) faces even without the rank.
function emberArmed(die, value, ranks) {
  if (die.element !== CLAN.EMBER) return false;
  const threshold = die.size - (die.evo || 0);
  const unlocked = (ranks[CLAN.EMBER] || 0) >= 3 || (die.evo || 0) >= 1;
  return unlocked && value >= threshold;
}

// The directional reaction table (paint → trigger). Direction matters:
// fire→storm OVERLOAD, storm→stone SHATTER, venom→fire IGNITE,
// stone→venom CORRODE, any→coin TRANSMUTE. Anything else: paint replaced.
function reactionName(paint, trigger) {
  if (trigger === CLAN.COIN) return 'TRANSMUTE';
  if (paint === CLAN.EMBER && trigger === CLAN.STORM) return 'OVERLOAD';
  if (paint === CLAN.STORM && trigger === CLAN.STONE) return 'SHATTER';
  if (paint === CLAN.VENOM && trigger === CLAN.EMBER) return 'IGNITE';
  if (paint === CLAN.STONE && trigger === CLAN.VENOM) return 'CORRODE';
  return null;
}

export function rollTimeline(build, foe, wager = false, rng = Math.random) {
  const ranks = clanRanks(build);
  const rolls = build.active.map((d, slot) => {
    const natural = rollRaw(d.size, rng);
    const value = effectiveFace(d, natural, ranks);
    return decorateRoll(d, slot, natural, value, foe, ranks);
  });
  return { rolls, wager: !!wager, focusSpent: 0, ranks };
}

function decorateRoll(sourceDie, slot, natural, value, foe, ranks = {}) {
  const die = cloneDie(sourceDie);
  const locked = foe.sealedSlot === slot;
  return {
    die,
    slot,
    natural,
    value,
    locked,
    armed: !locked && emberArmed(die, value, ranks),
  };
}

export function nudgeRoll(rollState, foe, slot, delta, spend = true) {
  if (!rollState?.rolls?.[slot] || rollState.rolls[slot].locked) return rollState;
  if (spend && rollState.focusSpent >= FOCUS_CHARGES) return rollState;
  const old = rollState.rolls[slot];
  const value = clamp(old.value + delta, 1, old.die.size);
  if (value === old.value) return rollState;
  return {
    ...rollState,
    focusSpent: spend ? rollState.focusSpent + 1 : rollState.focusSpent,
    rolls: rollState.rolls.map((r, i) => i === slot ? decorateRoll(r.die, i, r.natural, value, foe, rollState.ranks) : { ...r }),
  };
}

export function previewTimeline(build, foe, rollState, rng = Math.random) {
  return simulateTimeline(build, foe, rollState, { includeExplosions: false, rng });
}

export function strikeTimeline(build, foe, rollState, rng = Math.random) {
  return simulateTimeline(build, foe, rollState, { includeExplosions: true, rng });
}

export function resolveProto(build, foe, rng = Math.random, options = {}) {
  const rolled = rollTimeline(build, foe, !!options.wager, rng);
  return strikeTimeline(build, foe, rolled, rng);
}

export function oddsProto(build, foe, n = 4000, rng = Math.random) {
  let clears = 0, sum = 0, gold = 0;
  for (let i = 0; i < n; i++) {
    const r = resolveProto(build, foe, rng);
    sum += r.total;
    gold += r.gold;
    if (r.cleared) clears++;
  }
  return { clearRate: clears / n, mean: Math.round(sum / n), meanGold: Math.round(gold / n) };
}

function simulateTimeline(build, foe, rollState, opts) {
  const ranks = rollState.ranks || clanRanks(build);
  const rolls = rollState.rolls.map((r, slot) => decorateRoll(r.die, slot, r.natural, r.value, foe, ranks));
  let armor = armorValue(foe);
  let ward = wardValue(foe);
  const target = targetFor(foe, rollState.wager, ranks);
  const focusSpent = rollState.focusSpent || 0;
  const emberRank = ranks[CLAN.EMBER] || 0;
  const venomRank = ranks[CLAN.VENOM] || 0;
  const stormRank = ranks[CLAN.STORM] || 0;
  const coinRank = ranks[CLAN.COIN] || 0;
  // Per-fight resist: this element's reactions fizzle (painting still works).
  const immune = foe.immuneElement || null;
  const venomStacks = [];
  // Poison the foe already carries (Remainder Fights keep wounds AND venom).
  if (foe.carryVenom > 0) {
    venomStacks.push({ source: 0, amount: foe.carryVenom, carried: true });
  }
  const rawContrib = rolls.map(() => 0);
  const resolveCounts = rolls.map(() => 0);
  const repeatQueue = rolls.map(() => 0);
  const ticks = [];
  let total = 0;
  let coinEvoGold = 0;
  let midasSpent = false;
  let paint = null;      // the element the foe currently wears
  let shattered = false; // SHATTER holds for the rest of the fight

  // ---- THE BOOST PASS (kept from v0.8): CHARGE counts toward the top face,
  // and top faces are CRITS — a charged die can crit, and crits DOUBLE
  // reactions. Deterministic: computed left to right from visible faces.
  // Charge sources in this mode: TEMPEST ECHO (storm r3, +3) and a storm
  // die's own evolution (+evo).
  const stormCharge = d => d.element === CLAN.STORM ? (stormRank >= 3 ? 3 : 0) + (d.evo || 0) : 0;
  const boost = rolls.map(() => 0);
  const shown = rolls.map(() => 0);   // face + every charge that reached it
  const topped = rolls.map(() => false); // reached its top face (boosts count)
  const armedAt = rolls.map(() => false);
  rolls.forEach((r, i) => {
    if (r.locked) return;
    const d = r.die;
    shown[i] = r.value + boost[i];
    topped[i] = shown[i] >= d.size;
    const unlocked = emberRank >= 3 || (d.evo || 0) >= 1;
    armedAt[i] = d.element === CLAN.EMBER && unlocked && shown[i] >= d.size - (d.evo || 0);
    const next = rolls[i + 1];
    if (!next || next.locked) return;
    const c = stormCharge(d);
    if (c) boost[i + 1] += c;
  });

  const addDamage = (tick, amount, source, flags = {}) => {
    const raw = Math.max(0, Math.floor(amount));
    if (!raw) return 0;
    // A die that connects always lands at least 1 (armor can blunt a d4
    // era hit, never erase it - the early game stays winnable).
    const floor = flags.minOne ? 1 : 0;
    const dealt = flags.ignoreArmor ? raw : Math.max(floor, raw - armor);
    const blocked = raw - dealt;
    if (blocked) tick.events.push({ type: 'armor', amount: blocked });
    if (dealt) {
      total += dealt;
      rawContrib[source] += dealt;
      tick.events.push({ type: flags.type || 'damage', amount: dealt, source });
    }
    return dealt;
  };

  const tickVenom = tick => {
    const mult = venomRank >= 3 ? 2 : 1; // THE PLAGUE
    for (const stack of venomStacks) {
      if (stack.amount > 0) addDamage(tick, stack.amount * mult, stack.source, { ignoreArmor: true, type: 'venom' });
    }
  };

  const finishTick = tick => {
    if (ward && total - tick.start > ward) {
      const clipped = total - (tick.start + ward);
      total = tick.start + ward;
      tick.events.push({ type: 'ward', amount: clipped });
    }
    tick.totalAfter = total;
    tick.gain = tick.totalAfter - tick.start;
    ticks.push(tick);
  };

  const resolveOne = (i, repeat = false) => {
    if (resolveCounts[i] >= 2) return;
    resolveCounts[i]++;
    const r = rolls[i];
    const d = r.die;
    const tick = {
      slot: i,
      name: dieTitle(d),
      element: d.element,
      orb: d.orb,
      label: faceLabel(r),
      value: r.value,
      repeat,
      locked: r.locked,
      start: total,
      events: [],
    };

    if (r.locked) {
      tick.events.push({ type: 'sealed' });
      finishTick(tick);
      return;
    }

    if (!repeat) tickVenom(tick);

    // Boost lands once: a repeat strike neither re-collects the charge nor
    // mints a second one.
    const charge = repeat ? 0 : boost[i];
    // Clan rank 1 (every clan): that clan's dice hit +1.
    const clanBonus = (ranks[d.element] || 0) >= 1 ? 1 : 0;
    // MIDAS: gold is power - once per roll, on the first Coinblood tick.
    let midas = 0;
    if (!repeat && !midasSpent && coinRank >= 3 && d.element === CLAN.COIN) {
      midas = Math.min(6, Math.floor((foe.playerGold || 0) / 15));
      midasSpent = true;
    }

    const base = r.value + charge + clanBonus + midas;
    addDamage(tick, base, i, { type: repeat ? 'repeat-damage' : 'damage', minOne: true });
    if (charge) tick.events.push({ type: 'charge-bonus', amount: charge });
    if (clanBonus) tick.events.push({ type: 'clan-bonus', amount: clanBonus });
    if (midas) tick.events.push({ type: 'midas', amount: midas });

    // ---- PAINT → REACT. The hit lands, then if the foe wears a DIFFERENT
    // paint and the (paint → trigger) pair matches, the reaction fires, the
    // old paint is consumed, and this die repaints the foe. A CRIT trigger
    // (charge counts) DOUBLES it; trigger-clan rank 2 adds +50% (round up).
    // The foe's immune element: its reactions do nothing — paint still works.
    if (paint && paint !== d.element) {
      const name = reactionName(paint, d.element);
      if (name && d.element === immune) {
        tick.events.push({ type: 'immune', name });
      } else if (name) {
        const crit = topped[i];
        const r2 = (ranks[d.element] || 0) >= 2;
        const power = n => Math.ceil(n * (crit ? 2 : 1) * (r2 ? 1.5 : 1));
        let amount = 0;
        if (name === 'OVERLOAD') {
          amount = power(r.value);
          addDamage(tick, amount, i, { type: 'reaction-damage', ignoreArmor: true });
        } else if (name === 'SHATTER') {
          amount = power(2);
          armor = 0;
          ward = 0;
          shattered = true;
          addDamage(tick, amount, i, { type: 'reaction-damage', ignoreArmor: true });
        } else if (name === 'IGNITE') {
          const stackSum = venomStacks.reduce((s, v) => s + Math.max(0, v.amount), 0);
          venomStacks.length = 0; // stacks consumed
          amount = power(stackSum * 2);
          if (amount) addDamage(tick, amount, i, { type: 'reaction-damage', ignoreArmor: true });
        } else if (name === 'CORRODE') {
          amount = power(Math.ceil(r.value / 2));
          venomStacks.push({ source: i, amount });
        } else if (name === 'TRANSMUTE') {
          amount = power(tierIndex(d.size) + 1);
          coinEvoGold += amount;
        }
        tick.events.push({ type: 'reaction', name, amount, crit });
      }
    }
    paint = d.element;
    tick.events.push({ type: 'paint', element: d.element });

    // Coinblood evolution: an evolved coin die pays gold on its max face.
    if (d.element === CLAN.COIN && (d.evo || 0) > 0 && r.value === d.size) {
      coinEvoGold += d.evo;
      tick.events.push({ type: 'coin-max', amount: d.evo });
    }

    // THE PLAGUE (venom r3): venom dice apply poison themselves again.
    if (d.element === CLAN.VENOM && venomRank >= 3) {
      const amount = 4 + (d.evo || 0);
      venomStacks.push({ source: i, amount });
      tick.events.push({ type: 'venom-apply', amount });
    }

    if (armedAt[i]) {
      if (opts.includeExplosions) {
        let guard = 0;
        let keepGoing = true;
        while (keepGoing && guard++ < 24) {
          const natural = rollRaw(d.size, opts.rng);
          const value = effectiveFace(d, natural, ranks);
          const dealt = addDamage(tick, value, i, { type: 'explosion' });
          tick.events.push({ type: 'explosion-roll', natural, value, dealt });
          // CHAIN DETONATION: only rank 3 keeps the fuse lit.
          keepGoing = emberRank >= 3 && value >= d.size - (d.evo || 0);
        }
      } else {
        tick.events.push({ type: 'pending-explosion' });
      }
    }

    // Source-side log line for the charge that already flowed forward in
    // the boost pass.
    const chargeOut = stormCharge(d);
    if (!repeat && chargeOut && rolls[i + 1] && !rolls[i + 1].locked) {
      tick.events.push({ type: 'charge', amount: chargeOut, target: i + 1 });
    }

    finishTick(tick);
  };

  for (let i = 0; i < rolls.length; i++) {
    resolveOne(i, false);
    while (repeatQueue[i] > 0 && resolveCounts[i] < 2) {
      repeatQueue[i]--;
      resolveOne(i, true);
    }
  }

  // TEMPEST ECHO: the last die strikes twice.
  if (stormRank >= 3 && rolls.length) {
    const last = rolls.length - 1;
    if (!rolls[last].locked && resolveCounts[last] < 2) {
      ticks[ticks.length - 1]?.events?.push({ type: 'tempest-echo', target: last });
      resolveOne(last, true);
    }
  }

  const cleared = total >= target;
  const overkill = cleared ? total - target : 0;
  const killGold = foe.killGold ?? 5;
  const overkillDiv = foe.overkillDiv ?? 5;
  const goldBase = cleared ? killGold + Math.floor(overkill / overkillDiv) : 0;
  // Wager doubles BASE kill gold only - clan gold never doubles (SPEC §2).
  const gold = rollState.wager && cleared ? goldBase * 2 : goldBase;
  const mvpSlot = rawContrib.reduce((best, n, i) => n > rawContrib[best] ? i : best, 0);
  const venomCarry = venomStacks.reduce((s, v) => s + v.amount, 0);

  return {
    target,
    poolLeft: foe.target,
    baseTarget: foe.baseTarget || foe.target,
    wager: rollState.wager,
    armor: armorValue(foe),
    ward: wardValue(foe),
    focusSpent,
    ranks,
    coinReroll: rollState.coinReroll || null,
    immuneElement: immune,
    shattered,
    rolls,
    diceRes: rolls.map((r, i) => ({
      slot: i,
      name: dieTitle(r.die),
      short: r.die.name,
      species: r.die.species,
      element: r.die.element,
      orb: r.die.orb,
      size: r.die.size,
      evo: r.die.evo || 0,
      value: r.value,
      label: faceLabel(r),
      armed: armedAt[i],
      locked: r.locked,
      contribution: rawContrib[i],
      focusHint: '',
    })),
    ticks,
    total,
    cleared,
    short: cleared ? 0 : target - total,
    overkill,
    gold,
    coinEvoGold,
    venomCarry: cleared ? 0 : venomCarry,
    mvp: {
      slot: mvpSlot,
      name: rolls[mvpSlot] ? dieTitle(rolls[mvpSlot].die) : '',
      contribution: rawContrib[mvpSlot] || 0,
    },
  };
}

function movedRollState(rollState, foe, from, to) {
  const rolls = rollState.rolls.map(r => ({ ...r }));
  const [moved] = rolls.splice(from, 1);
  rolls.splice(to, 0, moved);
  return {
    ...rollState,
    rolls: rolls.map((r, slot) => decorateRoll(r.die, slot, r.natural, r.value, foe, rollState.ranks)),
  };
}

// Post-miss recap helper (kept for sim/diagnostics; UI no longer shows it).
export function findGhostFix(build, foe, rollState) {
  if (!rollState) return null;
  for (let from = 0; from < rollState.rolls.length; from++) {
    for (let to = 0; to < rollState.rolls.length; to++) {
      if (from === to) continue;
      const moved = movedRollState(rollState, foe, from, to);
      const movedBuild = { ...build, active: moved.rolls.map(r => r.die) };
      const p = previewTimeline(movedBuild, foe, moved);
      if (p.cleared) {
        const die = moved.rolls[to].die;
        return { text: `${die.name} to slot ${to + 1} wins by ${p.overkill}.` };
      }
    }
  }
  return null;
}
