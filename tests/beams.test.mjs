import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

// minimal stage state with an emitter; player parked safely unless noted
const stageState = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('beam counts down, telegraphs at cd=1, fires at cd<=0 then resets to period', () => {
  const { HX } = loadGame();
  // player sits in column 0 (never the beam column 3) so we observe cd over time
  let s = stageState(HX, { t: 0, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 4 }] });
  const cds = [];
  for (let i = 0; i < 5; i++) { s = HX.tick(s, s.pl.r, s.pl.c); cds.push(s.beams[0].cd); }
  // 4-1=3, 2, 1 (telegraph), fire at 0 -> reset to 4, then 3
  assert.deepEqual(cds, [3, 2, 1, 4, 3]);
});

test('beam kills the player who stays in its column on the fire turn', () => {
  const { HX } = loadGame();
  // cd:1 -> this tick decrements to 0 -> fires this turn
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c); // stay in column 3
  assert.equal(n.ov, true);
});

test('beam misses a player who left the column on the fire turn', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, 10, 2); // step west to column 2 (W neighbor of (10,3))
  assert.equal(n.ov, false);
});

test('beam pierces walls — same column kills even with a wall between', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, walls: [{ r: 5, c: 3 }], beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.ov, true);
});

test('freeze pauses the beam cooldown', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, fz: 2, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 2 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.beams[0].cd, 2); // unchanged while frozen
});

test('a fired beam pushes a beam event for its column', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.ok(n.evts.some(e => e.ty === 'beam' && e.c === 3));
});
