import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

// VM sandbox creates objects / arrays with null prototypes (or cross-realm Array),
// so deepEqual(sandboxValue, literalValue) fails under strict mode.
// Serialize both sides through JSON to produce same-realm primitives before comparing.
const toJson = (v) => JSON.stringify(v);

test('hd: same cell = 0, adjacency = 1', () => {
  const { HX } = loadGame();
  assert.equal(HX.hd(3, 3, 3, 3), 0);
  assert.equal(HX.hd(0, 0, 0, 1), 1);   // east neighbor
  assert.equal(HX.hd(0, 0, 1, 0), 1);   // SW neighbor (even row)
});

test('tick: straight bullet falls one row, no spawn when si high', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 3 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c); // stay
  // Compare via JSON: sandbox returns null-prototype objects, cross-realm Array — cannot
  // use deepEqual(sandboxArray, literal) under strict mode (different realm).
  assert.equal(toJson(n.bl), toJson([{ r: 6, c: 3 }]));
});

test('tick: bullet off bottom is removed', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: HX.R - 1, c: 2 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.bl.length, 0);
});

test('tick: stepping onto a bullet = game over', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 10, c: 3 }, bl: [{ r: 9, c: 3 }], si: 99 });
  const n = HX.tick(s, 9, 3); // move up onto current bullet
  assert.equal(n.ov, true);
});

test('safest returns a cell maximizing distance from bullets', () => {
  const { HX } = loadGame();
  const bl = [{ r: 0, c: 0 }];
  const best = HX.safest(bl, { r: 5, c: 3 }, []);
  assert.ok(best && HX.hd(best.r, best.c, 0, 0) >= 5);
});

test('ping moves by exactly 1 each step and stays in range', () => {
  const { HXS } = loadGame();
  // ping is internal; assert via sweepGap safe column drift instead.
  const stage = { type: 'boss', phases: [{ type: 'sweepGap', turns: 99, name: 'g' }] };
  let prev = null;
  for (let w = 0; w < 12; w++) {
    const p = HXS.pickPattern(stage, w, { bossWaves: w, pl: { r: 5, c: 3 } });
    const safe = [0,1,2,3,4,5,6].filter(c => !p.c.includes(c)); // gap column(s)
    assert.equal(safe.length, 1, `wave ${w} should leave exactly 1 safe column`);
    if (prev != null) assert.ok(Math.abs(safe[0] - prev) <= 1, `safe col jumped at wave ${w}`);
    prev = safe[0];
  }
});

test('bossAtk aimed targets player column ±1', () => {
  const { HXS } = loadGame();
  const stage = { type: 'boss', phases: [{ type: 'aimed', turns: 99 }] };
  const p = HXS.pickPattern(stage, 0, { bossWaves: 0, pl: { r: 5, c: 3 } });
  // p.c is a cross-realm Array from the VM sandbox; spread into same-realm array to compare.
  assert.deepEqual([...p.c], [2, 3, 4]);
});
