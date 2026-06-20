import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

test('REGIONS partition builtin stages exactly (contiguous, in order, boss at each end)', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES } = HXS;
  const N = STAGES.filter(s => s.id < 1000).length; // 24 builtins
  const covered = [];
  for (const r of REGIONS) for (let i = r.from; i <= r.to; i++) covered.push(i);
  assert.deepEqual(covered, Array.from({ length: N }, (_, i) => i)); // no gap/overlap/reorder
  for (const r of REGIONS) assert.equal(STAGES[r.to].type, 'boss', `region ${r.id} (to=${r.to}) must end in a boss`);
});

test('regionUnlocked: region 0 always open; region 1 needs region 0 boss cleared', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, regionUnlocked } = HXS;
  assert.equal(regionUnlocked(0, {}), true);
  assert.equal(regionUnlocked(1, {}), false);
  const bossId = STAGES[REGIONS[0].to].id;
  assert.equal(regionUnlocked(1, { [bossId]: 1 }), true);
});

test('regionCleared / regionStars / regionMax', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, regionCleared, regionStars, regionMax } = HXS;
  const r = REGIONS[0];
  assert.equal(regionCleared(r, {}), false);
  assert.equal(regionCleared(r, { [STAGES[r.to].id]: 2 }), true);
  assert.equal(regionMax(r), (r.to - r.from + 1) * 3);
  const stars = { [STAGES[r.from].id]: 2, [STAGES[r.to].id]: 3 };
  assert.equal(regionStars(r, stars), 5);
});
