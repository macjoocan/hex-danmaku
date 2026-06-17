import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

// every non-terminal state must offer at least one move (stay or neighbor) that
// does NOT lead to game over. That is the "always dodgeable" fairness invariant.
function safeMoves(HX, s) {
  const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
  const res = [];
  for (const o of opts) {
    if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
    const n = HX.tick(s, o.r, o.c);
    if (n !== s && !n.ov) res.push(n);
  }
  return res;
}
const hasSafeMove = (HX, s) => safeMoves(HX, s).length > 0;

// smart dodge with 2-ply lookahead: among safe moves prefer ones that keep a
// 2-turn survival path open (so the sim respects telegraphed threats like the
// lunge dash and doesn't self-corner into a false "unfair" failure).
function bestNext(HX, s) {
  const moves = safeMoves(HX, s);
  if (!moves.length) return null;
  let best = moves[0], bestScore = -1;
  for (const n of moves) {
    const followups = safeMoves(HX, n);
    const survivable = followups.filter(m => hasSafeMove(HX, m)).length; // 2-turn-safe follow-ups
    const score = survivable * 100 + followups.length;                   // prioritize survival, then breadth
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

// drive a boss stage of a single attack type and assert a safe move always exists.
function bossSurvives(type, { seed = 11, turns = 20 } = {}) {
  const { HX, HXS } = loadGame({ seed });
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type, turns: 999, name: type }] };
  let s = { ...HX.initState(), mode: 'stage', stage, stageIdx: 0, obj: { type: 'boss' }, si: 1 };
  s.np = HXS.pickPattern(stage, 0, s);
  s.np2 = HXS.pickPattern(stage, 1, { ...s, bossWaves: 1 });
  for (let i = 0; i < turns && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `${type} turn ${s.t}: no safe move (unfair)`);
    s = bestNext(HX, s);
  }
}

// spiral/drift/mark exercise the full ping cycle; summon accumulates adds so use a
// phase-length horizon (in real stages summon is a short phase, never 20 turns).
test('boss attack spiral always leaves a safe move', () => bossSurvives('spiral', { turns: 24 }));
test('boss attack drift always leaves a safe move', () => bossSurvives('drift', { turns: 24 }));
test('boss attack mark always leaves a safe move', () => bossSurvives('mark', { turns: 24 }));
test('boss attack summon always leaves a safe move', () => bossSurvives('summon', { turns: 10 }));

// also re-validate the pre-existing always-dodgeable boss attacks under the same sim
test('boss attack sweepGap always leaves a safe move', () => bossSurvives('sweepGap', { turns: 24 }));
test('boss attack full always leaves a safe move', () => bossSurvives('full', { turns: 24 }));

// a placed beam emitter must never remove every safe move — the player can always leave its column
test('a single beam emitter stays dodgeable', () => {
  const { HX, HXS } = loadGame({ seed: 7 });
  const def = { type: 'survive', interval: 2, surviveTurns: 30,
    pool: [{ n: '중앙', c: [2, 3, 4] }],
    beams: [{ r: 0, c: 3, period: 4 }], start: { r: 10, c: 0 } };
  let s = HXS.initStageDef(def, 0);
  for (let i = 0; i < 30 && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `beam turn ${s.t}: no safe move (unfair)`);
    const n = bestNext(HX, s);
    if (!n) break;
    s = n;
  }
});

// drive a real stage (greedy smart-dodge) and assert a safe move always exists.
function stageSurvives(idx, { seed = 5, turns = 30 } = {}) {
  const { HX, HXS } = loadGame({ seed });
  let s = HXS.initStage(idx);
  for (let i = 0; i < turns && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `stage idx ${idx} turn ${s.t}: no safe move (unfair)`);
    const n = bestNext(HX, s);
    if (!n) break;
    s = n;
  }
}
// reworked general stages: ids 5,8,10,12 -> indexes 4,7,9,11. The pool is RNG-driven,
// so a few hand-picked seeds is NOT enough — a mobile-enemy stage can corner the player
// on only ~1-5% of seeds. Sweep a wide range so a rare unfair pool combination surfaces.
const FAIR_SEEDS = Array.from({ length: 40 }, (_, i) => i + 1); // 1..40
for (const idx of [4, 7, 9, 11])
  test(`reworked stage index ${idx} stays fair across ${FAIR_SEEDS.length} seeds`, () => {
    for (const seed of FAIR_SEEDS) stageSurvives(idx, { seed, turns: 30 });
  });
// reworked bosses: ids 11,19 -> indexes 10,18 (full fight ~ bossTotal*interval turns)
for (const idx of [10, 18]) for (const seed of [3, 9, 11])
  test(`reworked boss index ${idx} stays fair (seed ${seed})`, () => stageSurvives(idx, { seed, turns: 50 }));

// bomb phases carry a `mode`; drive a single-mode bomb boss and assert dodgeability
function bombSurvives(mode, { seed = 11, turns = 30 } = {}) {
  const { HX, HXS } = loadGame({ seed });
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode, turns: 999, name: mode }] };
  let s = { ...HX.initState(), mode: 'stage', stage, stageIdx: 0, obj: { type: 'boss' }, si: 1, bombs: [] };
  s.np = HXS.pickPattern(stage, 0, s);
  s.np2 = HXS.pickPattern(stage, 1, { ...s, bossWaves: 1 });
  for (let i = 0; i < turns && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `bomb/${mode} seed ${seed} turn ${s.t}: no safe move (unfair)`);
    const n = bestNext(HX, s);
    if (!n) break;
    s = n;
  }
}

// wide seed sweep — a rare unfair accumulation surfaces only on a fraction of seeds (memory lesson)
const BOMB_SEEDS = Array.from({ length: 60 }, (_, i) => i + 1); // 1..60
for (const mode of ['line', 'diag', 'scatter'])
  test(`boss bomb ${mode} stays dodgeable across ${BOMB_SEEDS.length} seeds`, () => {
    for (const seed of BOMB_SEEDS) bombSurvives(mode, { seed, turns: 30 });
  });

export { safeMoves, hasSafeMove, bestNext };
