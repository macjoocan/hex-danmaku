import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState, plain } from './harness.mjs';

const stage = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('crack breaks when the player leaves it', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, cracks: [{ r: 6, c: 3, broken: false }] });
  const n = HX.tick(s, 5, 3); // move off the crack (NE on even row 6)
  assert.equal(n.cracks[0].broken, true);
});

test('a broken crack blocks movement onto it', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, cracks: [{ r: 5, c: 3, broken: true }] });
  const n = HX.tick(s, 5, 3); // (5,3) is broken -> blocked -> state unchanged
  assert.equal(n, s);
});

test('a broken crack blocks falling bullets', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 10, c: 0 }, bl: [{ r: 4, c: 3 }], cracks: [{ r: 5, c: 3, broken: true }] });
  const n = HX.tick(s, s.pl.r, s.pl.c); // bullet would fall to (5,3) -> blocked -> removed
  assert.equal(n.bl.length, 0);
});

test('pad pushes the player one hex in its direction', () => {
  const { HX } = loadGame();
  // pad at (5,3) pushing east (dir 1); player steps onto it from (6,3)
  const s = stage(HX, { pl: { r: 6, c: 3 }, pads: [{ r: 5, c: 3, dir: 1 }] });
  const n = HX.tick(s, 5, 3); // NE onto pad, then pushed east -> (5,4)
  assert.deepEqual(plain(n.pl), { r: 5, c: 4 });
});

test('pad does not push into a wall (stays on pad)', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, pads: [{ r: 5, c: 3, dir: 1 }], walls: [{ r: 5, c: 4 }] });
  const n = HX.tick(s, 5, 3);
  assert.deepEqual(plain(n.pl), { r: 5, c: 3 });
});
