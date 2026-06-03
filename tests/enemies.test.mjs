import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, loadEditor, baseState } from './harness.mjs';

const survive = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('chase moves only on odd turns (half speed)', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 10, c: 3 }, enemies: [{ r: 5, c: 3, kind: 'chase' }] });
  const n1 = HX.tick(s, s.pl.r, s.pl.c);   // s.t=0 even -> no move
  assert.equal(n1.enemies[0].r, 5);
  assert.equal(n1.enemies[0].c, 3);
  const n2 = HX.tick(n1, n1.pl.r, n1.pl.c); // s.t=1 odd -> moves toward player (downward)
  assert.ok(n2.enemies[0].r > 5);
});

test('bounce moves every turn and reflects at the edge', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 0, c: 0 }, enemies: [{ r: 5, c: 6, kind: 'bounce', dir: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  // east from (5,6) is out of range -> reflect to west -> (5,5), dir flips to 0
  assert.equal(n.enemies[0].r, 5);
  assert.equal(n.enemies[0].c, 5);
  assert.equal(n.enemies[0].dir, 0);
});

test('lunge telegraphs (cd=0, no move) then dashes', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 9, c: 3 }, enemies: [{ r: 4, c: 3, kind: 'lunge' }] });
  const n1 = HX.tick(s, s.pl.r, s.pl.c); // windup: cd -> 0, no move
  assert.equal(n1.enemies[0].cd, 0);
  assert.equal(n1.enemies[0].r, 4);
  assert.equal(n1.enemies[0].c, 3);
  assert.ok(HX.ENEMY_KINDS.lunge.telegraph(n1.enemies[0]).length > 0); // lane shown
  const n2 = HX.tick(n1, n1.pl.r, n1.pl.c); // dash
  assert.ok(n2.enemies[0].r > 4);           // moved downward toward player
  assert.equal(n2.enemies[0].cd, 1);        // windup reset
});

test('stepping onto an enemy cell = game over', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 6, c: 3 }, enemies: [{ r: 5, c: 3, kind: 'bounce', dir: 1 }] });
  const n = HX.tick(s, 5, 3); // (5,3) is NE of (6,3) on even row 6
  assert.equal(n.ov, true);
});

// #6: lungeWindup is editor-tunable down to 0 (and a cleared input yields 0). With windup 0 the
// enemy must dash immediately without crashing — previously e.face was undefined -> D(r)[undefined] threw.
test('lunge with windup=0 dashes immediately without crashing', () => {
  const { HX, win } = loadEditor();
  win.HXB.enemy.lungeWindup = 0; // applyOverrides already set win.HXB on load
  const s = baseState(HX, {
    mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
    stage: { type: 'survive', interval: 2 },
    t: 1, pl: { r: 9, c: 3 }, enemies: [{ r: 4, c: 3, kind: 'lunge' }],
  });
  let n;
  assert.doesNotThrow(() => { n = HX.tick(s, s.pl.r, s.pl.c); });
  assert.ok(n.enemies[0].r > 4); // dashed downward toward the player
});
