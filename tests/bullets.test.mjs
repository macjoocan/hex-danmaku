import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState, plain } from './harness.mjs';

test('drift bullet moves down-and-sideways, keeps vc', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 3, vc: 1 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.deepEqual(plain(n.bl[0]), { r: 6, c: 4, vc: 1 });
});

test('bounce bullet reflects at the right edge', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 6, vc: 1, bounce: true }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.deepEqual(plain(n.bl[0]), { r: 6, c: 5, vc: -1, bounce: true });
});

test('fuse bullet counts down, stays in place, not lethal while fuse>0', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 4, c: 3 }, bl: [{ r: 3, c: 3, fuse: 2 }], si: 99 });
  const n = HX.tick(s, 3, 3); // move onto it while it is still a telegraph
  assert.equal(n.ov, false);
  assert.equal(n.bl[0].fuse, 1);
  assert.equal(n.bl[0].r, 3);
  assert.equal(n.bl[0].c, 3);
});

test('fuse bullet is lethal on the turn fuse reaches 0', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 4, c: 3 }, bl: [{ r: 3, c: 3, fuse: 1 }], si: 99 });
  const n = HX.tick(s, 3, 3); // fuse 1 -> 0 this turn, player on it
  assert.equal(n.ov, true);
});

test('fuse bullet is removed the turn after detonation', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 10, c: 0 }, bl: [{ r: 3, c: 3, fuse: 0 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c); // fuse 0 -> -1 -> filtered
  assert.equal(n.bl.length, 0);
});
