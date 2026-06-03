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

// #4: a boss def with no phases (reachable via the editor) must not crash init; fall back to a pattern.
test('boss stage with empty phases falls back to a pattern instead of crashing', () => {
  const { HXS } = loadGame();
  const def = { id: 1000, type: 'boss', name: 'x', interval: 2, phases: [],
    walls: [], enemies: [], gems: [], cracks: [], pads: [], spikes: [], turrets: [] };
  let s;
  assert.doesNotThrow(() => { s = HXS.initStageDef(def, 0); });
  assert.ok(s.np && Array.isArray(s.np.c));
});

// #8: a summoned add materializing on the player's cell must NOT kill on its spawn turn
// (the comment says adds "don't act on spawn turn"); otherwise it's an untelegraphed instant death.
test('a summoned add does not kill the player on its spawn turn', () => {
  const { HX, HXS } = loadGame();
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'summon', turns: 999 }] };
  let s = { ...HX.initState(), mode: 'stage', stage, obj: { type: 'boss' }, si: 1, pl: { r: 1, c: 0 }, bossWaves: 0 };
  s.np = HXS.pickPattern(stage, 0, s);                       // even wave, left corner -> summon at (1,0)
  s.np2 = HXS.pickPattern(stage, 1, { ...s, bossWaves: 1 });
  assert.ok(s.np.summon && s.np.summon.r === 1 && s.np.summon.c === 0); // precondition
  const n = HX.tick(s, 1, 0);                                // player stays on the spawn cell
  assert.equal(n.ov, false);                                 // not killed by the add appearing on top
  assert.ok(n.enemies.some(e => e.kind === 'bounce'));       // add still present
});
