// Tickline resolution, v0.8 Clans. Pure engine: roll, preview, strike cascade.
// Clan ranks (SPEC-v0.8 §2) gate the effects; thresholds count FIELDED dice.
import { CLAN, FOCUS_CHARGES, bulwarkBonus, clanRanks, cloneDie, dieTitle, speciesGoldPower, speciesPower } from './config.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rollRaw = (size, rng) => 1 + Math.min(size - 1, Math.floor(rng() * size));
// Bulwark's tradeoff: its own max face is dulled - it can never roll it.
const rollFace = (die, rng) => {
  const natural = rollRaw(die.size, rng);
  return die.species === 'bulwark' && natural >= die.size ? die.size - 1 : natural;
};
const armorValue = foe => foe.modifier?.type === 'armor' ? foe.modifier.value : 0;
const wardValue = foe => foe.modifier?.type === 'ward' ? foe.modifier.value : 0;
// MIDAS makes the Wager ask x1.25 instead of x1.5.
const targetFor = (foe, wager, ranks) =>
  wager ? Math.ceil(foe.target * (ranks?.[CLAN.COIN] >= 3 ? 1.25 : 1.5)) : foe.target;

// Stonewrought floors: r1 greys can't roll below 3 (+1 per evo on the die),
// r2 ALL dice floor at 2, MOUNTAIN LAW floors everything at half max.
export function effectiveFace(die, natural, ranks = {}) {
  const stone = ranks[CLAN.STONE] || 0;
  let floor = 1;
  if (stone >= 3) floor = Math.ceil(die.size / 2);
  else if (stone >= 2) floor = 2;
  if (die.element === CLAN.STONE && stone >= 1) {
    floor = Math.max(floor, 3 + (die.evo || 0));
  }
  return Math.max(natural, Math.min(floor, die.size));
}

export function faceLabel(roll) {
  if (!roll) return '0';
  if (roll.ko) return 'KO';
  if (roll.locked) return 'LOCK';
  return roll.armed ? `${roll.value}+?` : `${roll.value}`;
}

// Emberkin explosion gate: rank 2 arms max faces; an evolved red die arms
// its top (1+evo) faces even without the rank.
function emberArmed(die, value, ranks) {
  if (die.element !== CLAN.EMBER) return false;
  const threshold = die.size - (die.evo || 0);
  const unlocked = (ranks[CLAN.EMBER] || 0) >= 2 || (die.evo || 0) >= 1;
  return unlocked && value >= threshold;
}

export function rollTimeline(build, foe, wager = false, rng = Math.random) {
  const ranks = clanRanks(build);
  const rolls = build.active.map((d, slot) => {
    const natural = rollFace(d, rng);
    const value = effectiveFace(d, natural, ranks);
    return decorateRoll(d, slot, natural, value, foe, ranks);
  });
  const state = { rolls, wager: !!wager, focusSpent: 0, ranks };
  // Coinblood r1 luck: the lowest die rerolls itself once, keeping the better
  // face (luck must never feel bad - lesson #1).
  if ((ranks[CLAN.COIN] || 0) >= 1) {
    let low = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i].locked) continue;
      if (low < 0 || rolls[i].value < rolls[low].value) low = i;
    }
    if (low >= 0) {
      const r = rolls[low];
      const natural = rollFace(r.die, rng);
      const value = effectiveFace(r.die, natural, ranks);
      if (value > r.value) {
        state.coinReroll = { slot: low, from: r.value, to: value };
        rolls[low] = decorateRoll(r.die, low, natural, value, foe, ranks);
      } else {
        state.coinReroll = { slot: low, from: r.value, to: r.value };
      }
    }
  }
  return state;
}

function decorateRoll(sourceDie, slot, natural, value, foe, ranks = {}) {
  const die = cloneDie(sourceDie);
  // UNITS: a knocked-out unit skips the rest of the fight - its roll locks
  // like a sealed slot (no damage, no charge given or taken, no triggers).
  const ko = !!(foe.koSlots && foe.koSlots.includes(slot));
  const locked = foe.sealedSlot === slot || ko;
  return {
    die,
    slot,
    natural,
    value,
    locked,
    ko,
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
  const armor = armorValue(foe);
  const ward = wardValue(foe);
  const target = targetFor(foe, rollState.wager, ranks);
  const focusSpent = rollState.focusSpent || 0;
  const emberRank = ranks[CLAN.EMBER] || 0;
  const venomRank = ranks[CLAN.VENOM] || 0;
  const stormRank = ranks[CLAN.STORM] || 0;
  const coinRank = ranks[CLAN.COIN] || 0;
  const venomStacks = [];
  // Venombrood r2: venom carried from earlier rolls of this fight.
  if (venomRank >= 2 && foe.carryVenom > 0) {
    venomStacks.push({ source: 0, amount: foe.carryVenom, carried: true });
  }
  const rawContrib = rolls.map(() => 0);
  const resolveCounts = rolls.map(() => 0);
  const repeatQueue = rolls.map(() => 0);
  const ticks = [];
  let total = 0;
  let coinEvoGold = 0;
  let midasSpent = false;

  // ---- THE BOOST PASS (one rule, many doors): CHARGE counts toward the
  // top face. Every charge source - Storm ranks, Galecaller, Fusewick,
  // Bulwark's aura - can push a die into its top face, and top faces are
  // what crits, Cinder, Fangling, Gilded and Tithe all trigger on.
  // Deterministic: computed left to right from the visible faces.
  const boost = rolls.map(() => 0);
  // WHETSTONE (UNITS item): +1 to every face - seeded like a charge, so it
  // counts toward the top face exactly as the keyword legend promises.
  rolls.forEach((r, i) => {
    if (!r.locked && r.die.item === 'whetstone') boost[i] += 1;
  });
  // Bulwark's aura is unconditional and reaches BOTH ways - seed it first
  // so a left-hand neighbor is judged with its push included.
  rolls.forEach((r, i) => {
    if (r.locked || r.die.species !== 'bulwark') return;
    [i - 1, i + 1].forEach(j => {
      if (rolls[j] && !rolls[j].locked) boost[j] += bulwarkBonus(r.die.size);
    });
  });
  const shown = rolls.map(() => 0);   // face + every charge that reached it
  const topped = rolls.map(() => false); // reached its top face (boosts count)
  const armedAt = rolls.map(() => false);
  rolls.forEach((r, i) => {
    if (r.locked) return;
    const d = r.die;
    shown[i] = r.value + boost[i];
    topped[i] = shown[i] >= d.size;
    const unlocked = emberRank >= 2 || (d.evo || 0) >= 1;
    armedAt[i] = d.element === CLAN.EMBER && unlocked && shown[i] >= d.size - (d.evo || 0);
    const next = rolls[i + 1];
    if (!next || next.locked) return;
    // Forward charge: Storm rank (unconditional), Galecaller on an even
    // face, Fusewick when it reaches its own top.
    if (d.element === CLAN.STORM && stormRank >= 1) boost[i + 1] += stormRank + (d.evo || 0);
    if (d.species === 'galecaller' && r.value % 2 === 0) boost[i + 1] += speciesPower(d.size);
    if (d.species === 'fusewick' && topped[i]) boost[i + 1] += speciesPower(d.size);
  });
  const onesRolled = rolls.filter(r => !r.locked && r.value === 1).length;

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
      ko: r.ko || false,
      start: total,
      events: [],
    };

    if (r.locked) {
      tick.events.push({ type: r.ko ? 'ko' : 'sealed' });
      finishTick(tick);
      return;
    }

    if (!repeat) tickVenom(tick);

    // Boost lands once: a repeat strike neither re-collects the charge nor
    // mints a second one.
    const charge = repeat ? 0 : boost[i];
    const emberBonus = d.element === CLAN.EMBER ? emberRank : 0;
    // MIDAS: gold is power - once per roll, on the first Coinblood tick.
    let midas = 0;
    if (!repeat && !midasSpent && coinRank >= 3 && d.element === CLAN.COIN) {
      midas = Math.min(6, Math.floor((foe.playerGold || 0) / 15));
      midasSpent = true;
    }
    // ---- Species hooks (named dice): self bonuses on THIS tick.
    // Top-face triggers read `topped` - a charged die counts as topped.
    let spBonus = 0;
    const spEvents = [];
    if (!repeat) {
      if (d.species === 'cinder' && topped[i]) {
        const p = speciesPower(d.size);
        spBonus += p;
        spEvents.push({ type: 'species', amount: p, label: 'Cinder crits' });
      }
      if (d.species === 'stormeye' && i > 0 && !rolls[i - 1].locked) {
        const p = Math.ceil(shown[i - 1] / 2);
        spBonus += p;
        spEvents.push({ type: 'species', amount: p, label: 'Stormeye copies' });
      }
      if (d.species === 'cornerstone' && i === 0) {
        const p = speciesPower(d.size);
        spBonus += p;
        spEvents.push({ type: 'species', amount: p, label: 'Cornerstone' });
      }
      if (d.species === 'maw' && onesRolled) {
        const p = speciesPower(d.size) * onesRolled;
        spBonus += p;
        spEvents.push({ type: 'species', amount: p, label: `Maw eats ${onesRolled}×1` });
      }
    }

    const base = r.value + charge + emberBonus + midas + spBonus;
    addDamage(tick, base, i, { type: repeat ? 'repeat-damage' : 'damage', minOne: true });
    if (charge) tick.events.push({ type: 'charge-bonus', amount: charge });
    if (emberBonus) tick.events.push({ type: 'ember-bonus', amount: emberBonus });
    if (midas) tick.events.push({ type: 'midas', amount: midas });
    tick.events.push(...spEvents);

    // Species gold: paid on the roll itself (kill or no kill), like evo gold.
    if (!repeat) {
      // Coin pays for ASCENDING order: its face beats the face before it.
      if (d.species === 'gilded' && i > 0 && !rolls[i - 1].locked && r.value > rolls[i - 1].value) {
        const g = speciesGoldPower(d.size);
        coinEvoGold += g;
        tick.events.push({ type: 'species-gold', amount: g, label: 'Coin' });
      }
      if (d.species === 'tithe') {
        const paying = [topped[i - 1], topped[i + 1]].filter(Boolean).length;
        if (paying) {
          const g = speciesGoldPower(d.size) * paying;
          coinEvoGold += g;
          tick.events.push({ type: 'species-gold', amount: g, label: 'Taxman' });
        }
      }
      // Fang bites on ODD faces (Gust answers on even - the parity puzzle).
      if (d.species === 'fangling' && r.value % 2 === 1) {
        const p = speciesPower(d.size);
        venomStacks.push({ source: i, amount: p });
        tick.events.push({ type: 'venom-apply', amount: p });
      }
    }

    // Coinblood evolution: an evolved coin die pays gold on its max face.
    if (d.element === CLAN.COIN && (d.evo || 0) > 0 && r.value === d.size) {
      coinEvoGold += d.evo;
      tick.events.push({ type: 'coin-max', amount: d.evo });
    }

    if (d.element === CLAN.VENOM && venomRank >= 1) {
      const amount = [0, 1, 2, 4][venomRank] + (d.evo || 0);
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
    if (!repeat && d.element === CLAN.STORM && stormRank >= 1 && rolls[i + 1] && !rolls[i + 1].locked) {
      tick.events.push({ type: 'charge', amount: stormRank + (d.evo || 0), target: i + 1 });
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
  const venomCarry = venomRank >= 2
    ? venomStacks.reduce((s, v) => s + v.amount, 0)
    : 0;

  return {
    target,
    poolLeft: foe.target,
    baseTarget: foe.baseTarget || foe.target,
    wager: rollState.wager,
    armor,
    ward,
    focusSpent,
    ranks,
    coinReroll: rollState.coinReroll || null,
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
      ko: r.ko || false,
      item: r.die.item || null,
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
