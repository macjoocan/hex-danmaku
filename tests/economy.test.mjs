import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor } from './harness.mjs';

test('wallet: saveCoins -> loadCoins round-trips, floors and clamps', () => {
  const { HXS } = loadEditor();
  HXS.saveCoins(123.7);
  assert.equal(HXS.loadCoins(), 123);
  HXS.saveCoins(-5);
  assert.equal(HXS.loadCoins(), 0);
});

test('wallet: corrupted storage value loads as 0', () => {
  const { win } = loadEditor();
  // Access localStorage from the sandbox context indirectly via win
  // loadEditor exposes the store Map; set a garbage value directly
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
