import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

const atk = (HXS, type, w, extra = {}) =>
  HXS.pickPattern({ type: 'boss', phases: [{ type, turns: 99, ...extra }] },
    w, { bossWaves: w, pl: { r: 5, c: 3 } });

test('spiral leaves rotating safe columns that drift <=1 per wave', () => {
  const { HXS } = loadGame();
  let prev = null;
  for (let w = 0; w < 14; w++) {
    const p = atk(HXS, 'spiral', w);
    const safe = [0,1,2,3,4,5,6].filter(c => !p.c.includes(c)).sort((a,b)=>a-b);
    assert.ok(safe.length >= 1, `wave ${w} has no safe column`);
    if (prev) assert.ok(safe.some(c => prev.some(q => Math.abs(c - q) <= 1)),
      `wave ${w} safe set jumped`);
    prev = safe;
  }
});

test('drift fires columns with a sideways velocity', () => {
  const { HXS } = loadGame();
  const p = atk(HXS, 'drift', 0);
  assert.ok(Array.isArray(p.c) && p.c.length > 0);
  assert.ok(p.vc === 1 || p.vc === -1);
});

test('mark returns telegraph cells with fuse=1', () => {
  const { HXS } = loadGame();
  const p = atk(HXS, 'mark', 0);
  assert.ok(Array.isArray(p.cells) && p.cells.length > 0);
  assert.ok(p.cells.every(c => c.fuse === 1));
});

test('summon spawns a bounce add on even waves, filler shot on odd', () => {
  const { HXS } = loadGame();
  const even = atk(HXS, 'summon', 0);
  assert.ok(even.summon && even.summon.kind === 'bounce');
  const odd = atk(HXS, 'summon', 1);
  assert.ok(!odd.summon && Array.isArray(odd.c) && odd.c.length > 0);
});
