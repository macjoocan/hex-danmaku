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
  const hist = stageState({ coins: 100, t: 2 });
  const cur = stageState({ coins: 70, t: 3, hist });
  const n = HX.doUndo(cur);
  assert.equal(plain(n).t, 2);
  assert.equal(plain(n).coins, 50);  // 70 - 20 (a refunding impl would yield 80)
});

test('initStageDef seeds coins from wallet', () => {
  const { HXS } = loadEditor();
  HXS.saveCoins(77);
  const g = HXS.initStageDef({ id: 1, type: 'survive', surviveTurns: 5, pool: [] });
  assert.equal(plain(g).coins, 77);
});

test('endless mode: undo restores hist and pays score from current', () => {
  const { HX } = loadEditor();
  const hist = stageState({ mode: 'endless', sc: 400, t: 2 });
  const cur = stageState({ mode: 'endless', sc: 500, t: 3, hist });
  const n = HX.doUndo(cur);
  assert.equal(plain(n).t, 2);
  assert.equal(plain(n).sc, 470);  // 500 - 30 (NOT 400 - 30 = 370)
});

test('stage mode: undo does not refund skill uses', () => {
  const { HX } = loadEditor();
  // Use bomb twice to exhaust the per-run limit (usesPerRun=2)
  const s = stageState({ coins: 1000 });
  const after1 = HX.doBomb(s);
  const after2 = HX.doBomb(after1);
  assert.equal(plain(after2.skillLeft).bomb, 0);  // both uses consumed

  // Simulate an undo: hist has fresh coins but undo returns ...s.hist spread with pay from current
  const cur = { ...after2, hist: stageState({ coins: 1000, t: 2 }) };
  const result = HX.doUndo(cur);

  // skillLeft comes from current (after2), not from hist — bomb is still 0
  assert.equal(plain(result.skillLeft).bomb, 0);

  // A further doBomb on the undo result must be a no-op (uses exhausted)
  const afterBomb = HX.doBomb(result);
  assert.equal(plain(afterBomb).coins, plain(result).coins);  // coins unchanged
});

test('stage mode: freeze smoke test', () => {
  const { HX } = loadEditor();
  const s = stageState();
  const n = HX.doFreeze(s);
  assert.equal(plain(n).coins, 60);  // 100 - 40
  assert.equal(plain(n).fz, 3);
  assert.equal(plain(n).sc, 500);    // score untouched
});

// ─── Coin pickup (cn) tests ────────────────────────────────────

// Minimal tick-ready stage state: si:99 prevents bullet spawn; obj/stage are
// the required stage-mode fields that tick accesses unconditionally.
const tickStageState = (over = {}) => ({
  ...stageState(),
  si: 99, np: { c: [], n: '' }, np2: { c: [], n: '' },
  cracks: [], pads: [], turrets: [], spikes: [], gems: [],
  lasers: [], beams: [],
  ht: 0, combo: 0, bossWaves: 0,
  obj: { type: 'survive', surviveTurns: 999 },
  stage: null,
  evts: [],
  ...over,
});

test('collecting a cn pickup adds pickupValue coins and pushes a cn event', () => {
  const { HX } = loadEditor();
  // player at (8,3), coin at (8,4) — that's a neighbor, so tick(s, 8, 4) moves there
  const s = tickStageState({ its: [{ r: 8, c: 4, ty: 'cn' }] });
  const result = HX.tick(s, 8, 4);
  assert.equal(plain(result).coins, 105);               // 100 + 5 (pickupValue)
  assert.ok(plain(result.evts).some(e => e.ty === 'cn'));
  assert.equal(plain(result.its).length, 0);            // item consumed
});

test('stage tick can spawn a cn coin (dedicated spawner)', () => {
  // Force spawnChance=1.0 via HXB so the coin spawn always triggers.
  // The sandboxed Math.random is seeded (seed=1) so candidate cell selection is deterministic.
  const { HX, win } = loadEditor({ seed: 1 });
  win.HXB = {
    ...HX.DEFAULT_BAL,
    coin: { ...HX.DEFAULT_BAL.coin, spawnChance: 1.0, max: 2 },
  };
  try {
    const s = tickStageState({ its: [] });
    const result = HX.tick(s, s.pl.r, s.pl.c); // stay in place
    const its = plain(result.its);
    assert.equal(its.length, 1);
    assert.equal(its[0].ty, 'cn');
  } finally {
    delete win.HXB;
  }
});

test('endless tick never spawns cn', () => {
  // tryItem has no pCoin branch, so cn can never appear regardless of the roll.
  // Force spawnChance=1.0 to guarantee an item does spawn, then verify it's not cn.
  const { HX, win } = loadEditor({ seed: 42 });
  win.HXB = {
    ...HX.DEFAULT_BAL,
    item: { ...HX.DEFAULT_BAL.item, spawnChance: 1.0, max: 3 },
  };
  try {
    const s = {
      ...HX.initState(),
      mode: 'endless',
      its: [],
      si: 99, np: { c: [], n: '' }, np2: { c: [], n: '' },
      cracks: [], pads: [], turrets: [], spikes: [], gems: [],
      lasers: [], beams: [],
      ht: 0, combo: 0, bossWaves: 0, fz: 0,
      obj: null, stage: null, evts: [],
    };
    const result = HX.tick(s, s.pl.r, s.pl.c);
    const its = plain(result.its);
    assert.equal(its.length, 1); // one item spawned
    assert.notEqual(its[0].ty, 'cn'); // never cn in endless
  } finally {
    delete win.HXB;
  }
});

test('tryCoin respects coin.max', () => {
  // Force spawnChance=1.0 — but with 2 cn items at max=2 it should bail out early.
  const { HX, win } = loadEditor({ seed: 1 });
  win.HXB = {
    ...HX.DEFAULT_BAL,
    coin: { ...HX.DEFAULT_BAL.coin, spawnChance: 1.0, max: 2 },
  };
  try {
    // 2 cn items already present — at coin.max
    const existingIts = [
      { r: 2, c: 0, ty: 'cn' },
      { r: 3, c: 0, ty: 'cn' },
    ];
    const result = HX.tryCoin(existingIts, { r: 8, c: 3 }, []);
    assert.equal(plain(result).length, 2); // unchanged — max reached
  } finally {
    delete win.HXB;
  }
});
