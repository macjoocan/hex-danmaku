import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState, plain } from './harness.mjs';

// minimal boss state; si=99 blocks auto-spawn unless a test sets si=1 + np.bombs
const boss = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'boss' }, si: 99,
  stage: { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode: 'scatter', turns: 999 }] },
  bossWaves: 0, bombs: [], ...over,
});

test('bomb advances telegraph -> armed -> removed by age (telegraph=1, life=2)', () => {
  const { HX } = loadGame();
  let s = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 5, c: 3, age: 0, armed: false }] });
  let n = HX.tick(s, 10, 0);                      // T1: age 1 -> armed (telegraph=1)
  assert.equal(plain(n.bombs)[0].armed, true);
  assert.equal(plain(n.bombs)[0].age, 1);
  n = HX.tick(n, 10, 0);                           // T2: age 2, still armed (life=2 -> age<3)
  assert.equal(plain(n.bombs)[0].armed, true);
  n = HX.tick(n, 10, 0);                           // T3: age 3 >= telegraph+life=3 -> removed
  assert.equal(plain(n.bombs).length, 0);
});

test('stepping onto an armed bomb is game over; telegraph cell is safe', () => {
  const { HX } = loadGame();
  const armed = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 1, armed: true }] });
  assert.equal(HX.tick(armed, 9, 0).ov, true);
  const tel = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 0, armed: false }] });
  assert.equal(HX.tick(tel, 9, 0).ov, false);
});

test('freeze pauses bomb age', () => {
  const { HX } = loadGame();
  const s = boss(HX, { pl: { r: 10, c: 0 }, fz: 2, bombs: [{ r: 5, c: 3, age: 0, armed: false }] });
  const n = HX.tick(s, 10, 0);
  assert.equal(plain(n.bombs)[0].age, 0);
  assert.equal(plain(n.bombs)[0].armed, false);
});

test('np.bombs spawns telegraph bombs after collision (not lethal on spawn turn)', () => {
  const { HX } = loadGame();
  const s = boss(HX, {
    pl: { r: 10, c: 0 }, si: 1,
    np: { n: '폭탄', c: [], bombs: [{ r: 10, c: 1 }] },
    np2: { n: '폭탄', c: [], bombs: [] },
  });
  const n = HX.tick(s, 10, 1);
  assert.equal(n.ov, false);
  assert.ok(plain(n.bombs).some(b => b.r === 10 && b.c === 1 && b.armed === false));
});

test('boss win requires no armed bombs remaining', () => {
  const { HX } = loadGame();
  const stage = { type: 'boss', interval: 2, bossTotal: 1, phases: [{ type: 'bomb', mode: 'scatter', turns: 1 }] };
  const s = baseState(HX, {
    mode: 'stage', obj: { type: 'boss' }, stage, si: 99, bossWaves: 1, bl: [],
    pl: { r: 10, c: 0 }, bombs: [{ r: 2, c: 3, age: 1, armed: true }],
  });
  assert.equal(HX.tick(s, 10, 0).win, false);
  const s2 = { ...s, bombs: [] };
  assert.equal(HX.tick(s2, 10, 0).win, true);
});
