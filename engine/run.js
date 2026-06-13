// Tickline run transitions, v0.8 Clans. Pure state helpers; UI owns DOM only.
import {
  CLAN, COIN_KILL_BONUS, DRAFT_REROLL_COST, LEVELS, MAX_HEARTS, SHOP_AFTER,
  SHOP_REROLL_COST, STARTER, activeSlots, canCombine, clanRanks, cloneBuild,
  combinedDie, difficultyInfo, draftOffers, killGold, overkillDivisor,
  pickTheme, shopOffers, slotsForFight, themedLevels,
} from './config.js';
import { findGhostFix, previewTimeline, rollTimeline, strikeTimeline } from './resolve.js';

export const PHASE = Object.freeze({
  ARRANGE: 'arrange',
  FOCUS: 'focus',
  REWARD: 'reward',
  SHOP: 'shop',
  WON: 'won',
  OVER: 'over',
});

export function createRun(rng = Math.random, difficulty = 'normal') {
  const theme = pickTheme(rng);
  const diff = difficultyInfo(difficulty);
  return {
    build: STARTER(rng),
    theme,
    levels: themedLevels(theme).map(l => ({ ...l, target: l.target + diff.bump })),
    difficulty: diff.id,
    levelIdx: 0,
    fightDmg: 0,
    fightVenom: 0,
    phase: PHASE.ARRANGE,
    hearts: MAX_HEARTS,
    gold: 0,
    wager: false,
    shopIndex: 0,
    draftStock: null,
    draftRerolled: false,
    draftsSinceDup: 0,
    shopStock: null,
    shopRerolled: false,
    pendingAdvance: null,
    pendingShop: false,
    lastRoll: null,
    lastPreview: null,
    lastStrike: null,
    lastReward: null,
    lastShop: null,
    ghostFix: null,
  };
}

// Remainder Fights: the effective target is what REMAINS of the foe's hp.
export function currentFoe(run) {
  const levels = run.levels || LEVELS;
  const level = levels[Math.min(run.levelIdx, levels.length - 1)];
  const dmg = run.fightDmg || 0;
  if (!dmg) return { ...level, baseTarget: level.target };
  return { ...level, baseTarget: level.target, target: Math.max(1, level.target - dmg) };
}

// Combat foe: the per-roll payload (gold context, venom carry, payout rates).
function combatFoe(run) {
  const ranks = clanRanks(run.build);
  return {
    ...currentFoe(run),
    playerGold: run.gold,
    carryVenom: run.fightVenom || 0,
    killGold: killGold(run.levelIdx),
    overkillDiv: overkillDivisor(run.levelIdx, ranks[CLAN.COIN] || 0),
  };
}

export const currentRewardOffers = run => run.draftStock || [];
export const currentShopOffers = run => run.shopStock || [];

export function toggleWager(run) {
  if (run.phase !== PHASE.ARRANGE) return run;
  return { ...run, wager: !run.wager };
}

export function rollCurrentFight(run, rng = Math.random) {
  if (run.phase !== PHASE.ARRANGE) return run;
  const foe = combatFoe(run);
  const lastRoll = rollTimeline(run.build, foe, run.wager, rng);
  const lastPreview = previewTimeline(run.build, foe, lastRoll);
  return { ...run, phase: PHASE.FOCUS, lastRoll, lastPreview, lastStrike: null, ghostFix: null };
}

export function strikeCurrentFight(run, rng = Math.random) {
  if (run.phase !== PHASE.FOCUS || !run.lastRoll) return run;
  const foe = combatFoe(run);
  const lastStrike = strikeTimeline(run.build, foe, run.lastRoll, rng);
  const finalFight = run.levelIdx >= (run.levels || LEVELS).length - 1;
  const won = lastStrike.cleared;
  const hearts = won ? run.hearts : run.hearts - 1;
  const ranks = clanRanks(run.build);
  const coinRank = ranks[CLAN.COIN] || 0;
  // Coinblood gold is FLAT per kill and never doubled by Wager (SPEC §2).
  const clanGold = won ? COIN_KILL_BONUS[coinRank] + (lastStrike.coinEvoGold || 0) : (lastStrike.coinEvoGold || 0);
  const base = {
    ...run,
    hearts,
    gold: run.gold + (won ? lastStrike.gold : 0) + clanGold,
    wager: false,
    lastStrike,
    ghostFix: null,
  };

  if (won && finalFight) return { ...base, phase: PHASE.WON, pendingAdvance: null, pendingShop: false };
  if (!won && hearts <= 0) return { ...base, phase: PHASE.OVER, pendingAdvance: null, pendingShop: false };
  if (won) {
    // Cadence (playtest 2026-06-11): dice arrive every SECOND door; the
    // other doors are the hero's - gold every fight, level-ups (and the
    // shops at 3/6/9) on the dice-free fights.
    const draftFight = run.levelIdx % 2 === 1;
    if (!draftFight) {
      return afterDraft({
        ...base,
        lastReward: null,
        pendingAdvance: run.levelIdx + 1,
        pendingShop: SHOP_AFTER.includes(run.levelIdx),
      }, rng);
    }
    const draftStock = draftOffers(run.levelIdx, base.build, rng, run.draftsSinceDup >= 1);
    const sawDup = draftStock.some(o => o.combinesWith);
    return {
      ...base,
      phase: PHASE.REWARD,
      draftStock,
      draftRerolled: false,
      draftsSinceDup: sawDup ? 0 : run.draftsSinceDup + 1,
      pendingAdvance: run.levelIdx + 1,
      pendingShop: SHOP_AFTER.includes(run.levelIdx),
    };
  }
  // The foe still stands: it strikes back and KEEPS its wounds; Venombrood
  // rank 2 carries the venom into the next roll.
  return {
    ...base,
    phase: PHASE.ARRANGE,
    fightDmg: (run.fightDmg || 0) + lastStrike.total,
    fightVenom: lastStrike.venomCarry || 0,
    lastRoll: null,
    lastPreview: null,
  };
}

// Draft reroll: 3g flat, once per draft; FREE at Coinblood rank 2.
export function rerollDraft(run, rng = Math.random) {
  if (run.phase !== PHASE.REWARD || run.draftRerolled) return run;
  const coinRank = clanRanks(run.build)[CLAN.COIN] || 0;
  const cost = coinRank >= 2 ? 0 : DRAFT_REROLL_COST;
  if (run.gold < cost) return run;
  const draftStock = draftOffers(run.levelIdx, run.build, rng, true);
  return { ...run, gold: run.gold - cost, draftStock, draftRerolled: true };
}

export function applyReward(run, offerIndex) {
  if (run.phase !== PHASE.REWARD) return run;
  const offer = currentRewardOffers(run)[offerIndex];
  if (!offer) throw new RangeError(`Invalid reward index: ${offerIndex}`);
  const build = cloneBuild(run.build);
  offer.apply(build);
  const next = { ...run, build, lastReward: { name: offer.name, tag: offer.tag } };
  return afterDraft(next);
}

export function skipReward(run) {
  if (run.phase !== PHASE.REWARD) return run;
  return afterDraft({ ...run, lastReward: null });
}

function afterDraft(run, rng = Math.random) {
  if (run.pendingShop) {
    return {
      ...run,
      phase: PHASE.SHOP,
      shopStock: shopOffers(run.shopIndex, run.build, rng),
      shopRerolled: false,
    };
  }
  return clearFightState({ ...run, phase: PHASE.ARRANGE, levelIdx: run.pendingAdvance });
}

// Shop: buy any number you can afford; leave with skipShop.
export function applyShop(run, offerIndex) {
  if (run.phase !== PHASE.SHOP) return run;
  const offer = currentShopOffers(run)[offerIndex];
  if (!offer) throw new RangeError(`Invalid shop index: ${offerIndex}`);
  if (run.gold < offer.cost) return run;
  const build = cloneBuild(run.build);
  offer.apply(build);
  return {
    ...run,
    build,
    gold: run.gold - offer.cost,
    shopStock: run.shopStock.filter((_, i) => i !== offerIndex),
    lastShop: { name: offer.name, cost: offer.cost },
  };
}

export function rerollShop(run, rng = Math.random) {
  if (run.phase !== PHASE.SHOP || run.shopRerolled) return run;
  const cost = SHOP_REROLL_COST[Math.min(run.shopIndex, SHOP_REROLL_COST.length - 1)];
  if (run.gold < cost) return run;
  return {
    ...run,
    gold: run.gold - cost,
    shopStock: shopOffers(run.shopIndex, run.build, rng),
    shopRerolled: true,
  };
}

export function skipShop(run) {
  if (run.phase !== PHASE.SHOP) return run;
  return clearFightState({
    ...run,
    shopIndex: run.shopIndex + 1,
    phase: PHASE.ARRANGE,
    levelIdx: run.pendingAdvance,
  });
}

export function moveActive(run, from, to) {
  if (run.phase !== PHASE.ARRANGE) return run;
  const active = run.build.active;
  if (from === to || !active[from] || to < 0 || to >= active.length) return run;
  const build = cloneBuild(run.build);
  const [moved] = build.active.splice(from, 1);
  build.active.splice(to, 0, moved);
  return { ...run, build };
}

// COMBINE: two identical dice (same clan + tier) fuse into the next tier
// with evolution +1. Allowed at camp (and during draft/shop arranging).
export function combineDice(run, zoneA, idxA, zoneB, idxB) {
  if (run.phase !== PHASE.ARRANGE && run.phase !== PHASE.REWARD && run.phase !== PHASE.SHOP) return run;
  if (zoneA === zoneB && idxA === idxB) return run;
  const build = cloneBuild(run.build);
  const listA = zoneA === 'bench' ? build.bench : build.active;
  const listB = zoneB === 'bench' ? build.bench : build.active;
  const a = listA[idxA];
  const b = listB[idxB];
  if (!canCombine(a, b)) return run;
  listB[idxB] = combinedDie(a, b);
  listA.splice(idxA, 1);
  return { ...run, build };
}

export function promoteBench(run, benchIdx) {
  if (run.phase !== PHASE.ARRANGE) return run;
  if (!run.build.bench[benchIdx] || run.build.active.length >= activeSlots(run.build)) return run;
  const build = cloneBuild(run.build);
  const [d] = build.bench.splice(benchIdx, 1);
  build.active.push(d);
  return { ...run, build };
}

export function swapActiveWithBench(run, activeIdx, benchIdx) {
  if (run.phase !== PHASE.ARRANGE) return run;
  if (!run.build.active[activeIdx] || !run.build.bench[benchIdx]) return run;
  const build = cloneBuild(run.build);
  [build.active[activeIdx], build.bench[benchIdx]] = [build.bench[benchIdx], build.active[activeIdx]];
  return { ...run, build };
}

// Entering a new fight grants level-up slots and resets fight state.
function clearFightState(run) {
  let build = run.build;
  const slots = slotsForFight(run.levelIdx);
  if (slots > activeSlots(build)) {
    build = cloneBuild(build);
    build.slots = slots;
  }
  return {
    ...run,
    build,
    fightDmg: 0,
    fightVenom: 0,
    draftStock: null,
    draftRerolled: false,
    shopStock: null,
    shopRerolled: false,
    pendingAdvance: null,
    pendingShop: false,
    lastRoll: null,
    lastPreview: null,
    // lastStrike survives the camp transition: hero fights advance straight
    // here and the sim/UI still need the final strike (cleared recaps gate
    // on !cleared, so a won strike never leaks into the next fight's copy).
    ghostFix: null,
  };
}

export { findGhostFix };
