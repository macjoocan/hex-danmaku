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

// smart dodge: among safe moves pick the one with the MOST safe follow-ups
// (1-ply lookahead) so a greedy sim doesn't corner itself into a false failure.
function bestNext(HX, s) {
  const moves = safeMoves(HX, s);
  if (!moves.length) return null;
  let best = moves[0], bestScore = -1;
  for (const n of moves) {
    const score = safeMoves(HX, n).length;
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

export { safeMoves, hasSafeMove, bestNext };
