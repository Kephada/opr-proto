// PATH 2 - UNITS engine smoke (DOM-free). Run: node modes/units/engine/smoke.js
// Proves: KO skip, front/dual/AoE targeting, dual<->AoE alternation, boss AoE,
// team-wipe-only heart loss (+revive), thorns into fightDmg, whetstone +1,
// shield maxHp, shop item equip flow.
import {
  PHASE, applyReward, createRun, currentFoe, equipShopItem, foeAttackPlan,
  rollCurrentFight, skipShop, strikeCurrentFight, unitHp, unitKO,
} from './run.js';
import { die, unitMaxHp } from './config.js';

const rng = seed => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};

const unitsLine = run => run.build.active.map((d, i) =>
  `${i + 1}:${d.name}d${d.size}${d.item ? `[${d.item[0]}]` : ''} ${unitHp(run, d)}/${unitMaxHp(d)}${unitKO(run, d) ? ' KO' : ''}`).join('  ');

function oneRoll(run, r, tag = '') {
  const plan = foeAttackPlan(run);
  const before = run;
  run = rollCurrentFight(run, r);
  run = strikeCurrentFight(run, r);
  const s = run.lastStrike;
  const c = s.counter;
  const counterTxt = c
    ? ` | counter ${c.pattern} per=${c.per} -> [${c.hits.map(h => `s${h.slot + 1} ${h.name} -${h.amount} ->${h.hpAfter}hp${h.ko ? ' KO' : ''}`).join('; ')}]`
      + (c.thorns ? ` thorns=${c.thorns}` : '') + (c.wipe ? ` TEAM WIPE hearts->${run.hearts}${c.revived ? ' (revived)' : ''}` : '')
    : '';
  console.log(`${tag}F${before.levelIdx + 1} roll#${(before.fightRolls || 0) + 1} plan=${plan.pattern}/${plan.attack} `
    + `total=${s.total}/${s.target} ${s.cleared ? 'KILL' : 'miss'}${counterTxt}`);
  if (!s.cleared && run.phase === PHASE.ARRANGE) console.log(`    units: ${unitsLine(run)} | foe keeps wounds: ${currentFoe(run).target} left`);
  return run;
}

// ---- scenario helper: a run forced to a fight with a chosen squad ----------
function scenario(levelIdx, dice, hearts = 4) {
  let run = createRun(rng(7));
  return { ...run, levelIdx, hearts, build: { slots: 6, active: dice, bench: [] }, unitDmg: {}, fightRolls: 0, fightDmg: 0 };
}

console.log('=== A) front targeting (fight 1, weak pair, forced misses) ===');
{
  const r = rng(11);
  let run = scenario(0, [die('stone', 4, { species: 'cornerstone' }), die('venom', 4, { species: 'fangling' })]);
  run.levels = run.levels.map(l => ({ ...l, target: 99 })); // unkillable: watch the pattern
  for (let i = 0; i < 3 && run.phase === PHASE.ARRANGE; i++) run = oneRoll(run, r, '  ');
  console.log('  hearts after:', run.hearts, '(front unit tanked it all, no wipe -> no heart loss)');
}

console.log('=== B) DUAL (fight 5) + team wipe revives and costs exactly 1 heart ===');
{
  const r = rng(13);
  let run = scenario(4, [die('stone', 4, { species: 'cornerstone' }), die('stone', 4, { species: 'bulwark' })]);
  while (run.phase === PHASE.ARRANGE && run.hearts === 4) run = oneRoll(run, r, '  ');
  console.log('  hearts after wipe:', run.hearts, '| units revived:', unitsLine(run));
}

console.log('=== C) fights 7-9 ALTERNATE dual <-> AoE ===');
{
  const r = rng(17);
  let run = scenario(6, [
    die('stone', 8, { species: 'cornerstone' }), die('stone', 8, { species: 'bulwark' }),
    die('venom', 6, { species: 'fangling' }), die('fire', 6, { species: 'cinder' }),
  ]);
  run.levels = run.levels.map(l => ({ ...l, target: 999 }));
  for (let i = 0; i < 4 && run.phase === PHASE.ARRANGE; i++) run = oneRoll(run, r, '  ');
  console.log('  hearts:', run.hearts);
}

console.log('=== D) boss: AoE every roll + KO units are SKIPPED by the roll ===');
{
  const r = rng(23);
  let run = scenario(9, [
    die('stone', 10, { species: 'cornerstone' }), die('fire', 4, { species: 'cinder' }),
    die('stone', 10, { species: 'bulwark' }),
  ]);
  for (let i = 0; i < 3 && run.phase === PHASE.ARRANGE; i++) {
    run = oneRoll(run, r, '  ');
    if (run.lastStrike) {
      const koRows = run.lastStrike.diceRes.filter(d => d.ko);
      if (koRows.length) console.log(`    KO rows in the roll: [${koRows.map(d => `s${d.slot + 1} label=${d.label} contribution=${d.contribution}`).join('; ')}]`);
    }
  }
}

console.log('=== E) thorns: foe takes 2 per hit on the wearer (sticks as fightDmg) ===');
{
  const r = rng(29);
  let run = scenario(3, [die('stone', 6, { species: 'cornerstone', item: 'thorns' }), die('stone', 6, { species: 'bulwark' })]);
  run.levels = run.levels.map(l => ({ ...l, target: 60 }));
  const before = currentFoe(run).target;
  run = oneRoll(run, r, '  ');
  console.log(`  foe hp: ${before} -> ${currentFoe(run).target} (roll total ${run.lastStrike.total} + thorns ${run.lastStrike.counter.thorns})`);
}

console.log('=== F) whetstone: +1 face on the wearer (same seed, with vs without) ===');
{
  const mk = item => scenario(0, [die('stone', 6, { species: 'cornerstone', item }), die('venom', 6, { species: 'fangling' })]);
  const a = strikeCurrentFight(rollCurrentFight(mk(null), rng(31)), rng(32));
  const b = strikeCurrentFight(rollCurrentFight(mk('whetstone'), rng(31)), rng(32));
  console.log(`  total without=${a.lastStrike.total} with=${b.lastStrike.total} (expect +1 or better via top-face procs)`);
}

console.log('=== G) shield: +2 maxHp, derived (replace-safe) ===');
{
  const d = die('fire', 4, { species: 'cinder' });
  const base = unitMaxHp(d);
  d.item = 'shield';
  const shielded = unitMaxHp(d);
  d.item = 'whetstone';
  console.log(`  d4 maxHp base=${base} shield=${shielded} after replace=${unitMaxHp(d)} (expect 2/4/2)`);
}

console.log('=== H) wipe at 1 heart = run OVER ===');
{
  const r = rng(37);
  let run = scenario(5, [die('coin', 4, { species: 'gilded' })], 1);
  run.levels = run.levels.map(l => ({ ...l, target: 99 }));
  run = oneRoll(run, r, '  ');
  console.log('  phase:', run.phase, '| hearts:', run.hearts);
}

console.log('=== I) seeded full run: shop items buy+equip, drafts, ladder ===');
{
  const r = rng(42);
  let run = createRun(r);
  let guard = 0;
  let equipped = false;
  while (![PHASE.WON, PHASE.OVER].includes(run.phase) && guard++ < 300) {
    if (run.phase === PHASE.ARRANGE) run = oneRoll(run, r, '  ');
    else if (run.phase === PHASE.REWARD) run = applyReward(run, 0);
    else if (run.phase === PHASE.SHOP) {
      if (!equipped) {
        const i = run.shopStock.findIndex(o => o.type === 'item' && o.item.id === 'thorns');
        const goldBefore = run.gold;
        const next = equipShopItem(run, i, 'active', 0);
        if (next !== run) {
          run = next;
          equipped = true;
          console.log(`  SHOP: bought+equipped thorns on slot 1 (${run.build.active[0].name}) gold ${goldBefore}->${run.gold}, item=${run.build.active[0].item}`);
        }
      }
      run = skipShop(run);
    }
  }
  console.log(`  end: ${run.phase} at fight ${run.levelIdx + 1}, hearts ${run.hearts}, gold ${run.gold}, dice ${run.build.active.length}+${run.build.bench.length}`);
}
console.log('smoke done.');
