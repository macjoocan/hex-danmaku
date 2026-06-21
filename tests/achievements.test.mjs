import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor, plain } from './harness.mjs';

test('saveBest records turns; loadBest reads them; only faster updates', () => {
  const { HXS, store } = loadEditor();
  store.delete?.('hex_stage_best');
  HXS.saveBest(3, 20);
  assert.equal(HXS.loadBest()[3].turns, 20);
  HXS.saveBest(3, 25);                       // slower → ignored
  assert.equal(HXS.loadBest()[3].turns, 20);
  HXS.saveBest(3, 12);                       // faster → updates
  assert.equal(HXS.loadBest()[3].turns, 12);
});

test('loadBest returns {} on missing/corrupt storage', () => {
  const { HXS, store } = loadEditor();
  store.delete?.('hex_stage_best');
  assert.deepEqual(plain(HXS.loadBest()), {});
  store.set('hex_stage_best', 'garbage');
  assert.deepEqual(plain(HXS.loadBest()), {});
});
