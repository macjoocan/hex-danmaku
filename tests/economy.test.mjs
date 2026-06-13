import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor, plain } from './harness.mjs';

test('wallet: saveCoins -> loadCoins round-trips, floors and clamps', () => {
  const { HXS } = loadEditor();
  HXS.saveCoins(123.7);
  assert.equal(HXS.loadCoins(), 123);
  HXS.saveCoins(-5);
  assert.equal(HXS.loadCoins(), 0);
});

test('wallet: corrupted storage value loads as 0', () => {
  const { HXS, store } = loadEditor();
  store.set('hex_coins', 'garbage');
  assert.equal(HXS.loadCoins(), 0);
});

test('coinReward: first clear pays clearPerStar per star, repeat pays repeatPerStar', () => {
  const { HXS } = loadEditor();
  assert.equal(HXS.coinReward(3, true), 60);   // 3 stars first clear = 3×20
  assert.equal(HXS.coinReward(2, false), 10);  // 2 stars repeat = 2×5
  assert.equal(HXS.coinReward(0, true), 0);
});

// ─── Stage mode skill payment tests ────────────────────────────

const stageState = (over = {}) => ({
  mode: 'stage', pl: { r: 8, c: 3 }, bl: [], walls: [], enemies: [], its: [],
  sc: 500, coins: 100, t: 3, fz: 0, ov: false, win: false, hist: null, skillUses: 0,
  ...over,
});

test('stage mode: bomb pays coins, score untouched', () => {
  const { HX } = loadEditor();
  const s = stageState();
  const n = HX.doBomb(s);
  assert.equal(plain(n).coins, 70);   // 100 - 30
  assert.equal(plain(n).sc, 500);     // score untouched
  assert.equal(plain(n).skillUses, 1);
});

test('stage mode: insufficient coins -> no-op even with high score', () => {
  const { HX } = loadEditor();
  const s = stageState({ coins: 10 });
  const n = HX.doBomb(s);
  assert.equal(plain(n).coins, 10);
  assert.equal(plain(n).skillUses, 0);
});

test('stage mode: third use of same skill is blocked (usesPerRun=2)', () => {
  const { HX } = loadEditor();
  const s = stageState({ coins: 1000 });
  const n1 = HX.doBomb(s);
  const n2 = HX.doBomb(n1);
  assert.equal(plain(n2).skillUses, 2);
  const n3 = HX.doBomb(n2);
  assert.equal(plain(n3).coins, plain(n2).coins);  // coins unchanged vs 2nd result
  assert.equal(plain(n3).skillUses, 2);             // skillUses stays 2
});

test('stage mode: usesPerRun=0 means unlimited', () => {
  const { HX, win } = loadEditor();
  // Clone DEFAULT_BAL with usesPerRun=0
  win.HXB = { ...HX.DEFAULT_BAL, skill: { ...HX.DEFAULT_BAL.skill, usesPerRun: 0 } };
  try {
    const s = stageState({ coins: 10000 });
    let cur = s;
    for (let i = 0; i < 5; i++) cur = HX.doBomb(cur);
    assert.equal(plain(cur).skillUses, 5);
  } finally {
    delete win.HXB;
  }
});

test('endless mode: bomb still pays score (regression)', () => {
  const { HX } = loadEditor();
  const s = { mode: 'endless', pl: { r: 8, c: 3 }, bl: [], walls: [], enemies: [], its: [],
    sc: 500, t: 3, fz: 0, ov: false, win: false, hist: null, skillUses: 0 };
  const n = HX.doBomb(s);
  assert.equal(plain(n).sc, 450);   // 500 - 50
});

test('stage mode: undo restores hist but charges undo coins from current, no refund', () => {
  const { HX } = loadEditor();
  const hist = stageState({ coins: 70, t: 2 });
  const cur = stageState({ coins: 70, t: 3, hist });
  const n = HX.doUndo(cur);
  assert.equal(plain(n).t, 2);
  assert.equal(plain(n).coins, 50);  // 70 - 20
});

test('initStageDef seeds coins from wallet', () => {
  const { HXS } = loadEditor();
  HXS.saveCoins(77);
  const g = HXS.initStageDef({ id: 1, type: 'survive', surviveTurns: 5, pool: [] });
  assert.equal(plain(g).coins, 77);
});
