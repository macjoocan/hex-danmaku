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

test('폭발 반경(blast=1): 인접 칸도 같이 터진다, 거리 2는 안전, 텔레그래프는 유예', () => {
  const { HX } = loadGame();
  // 장판 (9,0) 옆 (10,0)에서 제자리 대기 = 반경 내 → 폭사
  const near = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 1, armed: true }] });
  assert.equal(HX.tick(near, 10, 0).ov, true, '인접 제자리 = 폭사');
  // 거리 2면 생존
  const far = boss(HX, { pl: { r: 10, c: 2 }, bombs: [{ r: 9, c: 0, age: 1, armed: true }] });
  assert.equal(HX.tick(far, 10, 2).ov, false, '반경 밖은 안전');
  // 미기폭(텔레그래프)은 반경 안이어도 아직 안전 — 피할 1턴 보장
  const tel = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 0, armed: false }] });
  assert.equal(HX.tick(tel, 10, 1).ov, false);
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

// --- Task 2: bomb pattern generator ---
const bombPat = (HXS, mode, s) => {
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode, turns: 999 }] };
  return plain(HXS.pickPattern(stage, 0, s));
};

test('bomb pattern returns empty falling cols (no rain during bomb phase)', () => {
  const { HX, HXS } = loadGame();
  const p = bombPat(HXS, 'scatter', baseState(HX, { pl: { r: 8, c: 3 } }));
  assert.deepEqual(p.c, []);
  assert.ok(Array.isArray(p.bombs));
});

test('bomb cells never land on player cell or its 6-ring (all modes)', () => {
  const { HX, HXS } = loadGame();
  for (const mode of ['line', 'diag', 'scatter']) {
    const pl = { r: 8, c: 3 };
    const p = bombPat(HXS, mode, baseState(HX, { pl }));
    for (const b of p.bombs)
      assert.ok(HX.hd(b.r, b.c, pl.r, pl.c) >= 2, `${mode}: bomb at ${b.r},${b.c} within ring of player`);
  }
});

test('bomb cell count respects bombsPerWave cap (all modes)', () => {
  const { HX, HXS } = loadGame();
  for (const mode of ['line', 'diag', 'scatter']) {
    const p = bombPat(HXS, mode, baseState(HX, { pl: { r: 8, c: 3 } }));
    assert.ok(p.bombs.length <= HX.bal().boss.bombsPerWave, `${mode}: ${p.bombs.length} > cap`);
  }
});

test('bomb cells avoid occupied cells (walls)', () => {
  const { HX, HXS } = loadGame();
  const walls = [];
  for (let r = 0; r < HX.R; r++) for (let c = 0; c < HX.C; c++) if (!(r === 2 && c === 6)) walls.push({ r, c });
  const p = bombPat(HXS, 'scatter', baseState(HX, { pl: { r: 10, c: 0 }, walls }));
  for (const b of p.bombs) assert.ok(b.r === 2 && b.c === 6, `bomb on occupied cell ${b.r},${b.c}`);
});

test('bomb phase honors per-phase count override', () => {
  const { HX, HXS } = loadGame();
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode: 'scatter', count: 1, turns: 999 }] };
  const p = plain(HXS.pickPattern(stage, 0, baseState(HX, { pl: { r: 8, c: 3 } })));
  assert.ok(p.bombs.length <= 1);
});
