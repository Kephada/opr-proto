// Tickline run transitions, PATH 3 THE GRID. Pure state helpers; UI owns DOM
// only. Placement legality (footprints, unlocked area) lives in config.js;
// every transition that touches the board re-sorts active into reading order.
import {
  BENCH_CAP, CLAN, COIN_KILL_BONUS, DRAFT_REROLL_COST, LEVELS, MAX_HEARTS,
  SHOP_AFTER, SHOP_REROLL_COST, STARTER, START_AREA, areaForFight, canCombine,
  canPlaceAt, clanRanks, cloneBuild, combinedDie, difficultyInfo, draftOffers,
  findFreeOrigin, killGold, overkillDivisor, pickTheme, shopOffers, sortActive,
  themedLevels,
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

// Move a fielded die to a new grid origin. Bounces (returns run unchanged)
// if the footprint doesn't fit in unlocked, empty cells.
export function moveActive(run, from, origin) {
  if (run.phase !== PHASE.ARRANGE) return run;
  const d = run.build.active[from];
  if (!d || !origin) return run;
  if (d.cell && d.cell.x === origin.x && d.cell.y === origin.y) return run;
  if (!canPlaceAt(run.build, d, origin)) return run;
  const build = cloneBuild(run.build);
  build.active[from].cell = { x: origin.x, y: origin.y };
  sortActive(build);
  return { ...run, build };
}

// COMBINE: two identical dice (same name + tier) fuse into the next tier
// with evolution +1. The fused die keeps the TARGET's origin - if its new
// shape doesn't fit there (both parents ignored), the combine bounces.
export function combineDice(run, zoneA, idxA, zoneB, idxB) {
  if (run.phase !== PHASE.ARRANGE && run.phase !== PHASE.REWARD && run.phase !== PHASE.SHOP) return run;
  if (zoneA === zoneB && idxA === idxB) return run;
  const build = cloneBuild(run.build);
  const listA = zoneA === 'bench' ? build.bench : build.active;
  const listB = zoneB === 'bench' ? build.bench : build.active;
  const a = listA[idxA];
  const b = listB[idxB];
  if (!canCombine(a, b)) return run;
  const fused = combinedDie(a, b);
  if (zoneB === 'active') {
    if (!canPlaceAt(build, fused, b.cell, [a.id, b.id])) return run;
    fused.cell = { x: b.cell.x, y: b.cell.y };
  }
  listB[idxB] = fused;
  listA.splice(idxA, 1);
  sortActive(build);
  return { ...run, build };
}

// Field a bench die at a grid origin (or the first free one when omitted).
export function promoteBench(run, benchIdx, origin = null) {
  if (run.phase !== PHASE.ARRANGE) return run;
  const d = run.build.bench[benchIdx];
  if (!d) return run;
  const target = origin || findFreeOrigin(run.build, d);
  if (!target || !canPlaceAt(run.build, d, target)) return run;
  const build = cloneBuild(run.build);
  const [moved] = build.bench.splice(benchIdx, 1);
  moved.cell = { x: target.x, y: target.y };
  build.active.push(moved);
  sortActive(build);
  return { ...run, build };
}

// Swap: the bench die takes the fielded die's origin - only if it fits there
// once the outgoing die is ignored (a tall d6 can't take a cornered d4's spot
// when the cell below is occupied).
export function swapActiveWithBench(run, activeIdx, benchIdx) {
  if (run.phase !== PHASE.ARRANGE) return run;
  const a = run.build.active[activeIdx];
  const b = run.build.bench[benchIdx];
  if (!a || !b) return run;
  if (!canPlaceAt(run.build, b, a.cell, a.id)) return run;
  const build = cloneBuild(run.build);
  const a2 = build.active[activeIdx];
  const b2 = build.bench[benchIdx];
  b2.cell = { x: a2.cell.x, y: a2.cell.y };
  a2.cell = null;
  build.active[activeIdx] = b2;
  build.bench[benchIdx] = a2;
  sortActive(build);
  return { ...run, build };
}

// Pull a fielded die back to the bench (frees its cells). The board never
// empties: the last fielded die stays.
export function demoteActive(run, activeIdx) {
  if (run.phase !== PHASE.ARRANGE) return run;
  if (!run.build.active[activeIdx] || run.build.active.length <= 1) return run;
  if (run.build.bench.length >= BENCH_CAP) return run;
  const build = cloneBuild(run.build);
  const [d] = build.active.splice(activeIdx, 1);
  d.cell = null;
  build.bench.push(d);
  return { ...run, build };
}

// Entering a new fight unlocks board area at the milestones and resets
// fight state (fight 3: third column; fight 5: third row).
function clearFightState(run) {
  let build = run.build;
  const area = areaForFight(run.levelIdx);
  const cur = build.area || START_AREA;
  if (area.w * area.h > cur.w * cur.h) {
    build = cloneBuild(build);
    build.area = area;
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
