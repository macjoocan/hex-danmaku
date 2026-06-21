import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, plain } from './harness.mjs';

// 같은 입력으로 N턴 진행한 엔드리스 상태를 비교용으로 직렬화
function runEndless(HX, seed, moves) {
  let s = HX.initState(seed);
  for (const [r, c] of moves) { const n = HX.tick(s, r, c); if (n !== s) s = n; }
  return s;
}
const MOVES = Array.from({ length: 12 }, (_, i) => [10, (i % 7)]); // 임의 고정 입력

test('initState(seed) is deterministic — same seed yields identical run', () => {
  const { HX } = loadGame();
  const a = plain(runEndless(HX, 20260621, MOVES));
  const b = plain(runEndless(HX, 20260621, MOVES));
  assert.deepEqual(a.bl, b.bl);          // 동일 탄막
  assert.deepEqual(a.its, b.its);        // 동일 픽업
  assert.equal(a.sc, b.sc);
});

test('different seeds diverge', () => {
  const { HX } = loadGame();
  const a = plain(runEndless(HX, 20260621, MOVES));
  const b = plain(runEndless(HX, 19990101, MOVES));
  assert.notDeepEqual(a.bl, b.bl);       // 다른 보드 (충분히 진행하면 갈림)
});

test('initState() without seed records seed:null and uses global RNG', () => {
  const { HX } = loadGame();           // 하니스가 sandbox Math.random을 시드함
  const s = HX.initState();
  assert.equal(s.seed, null);
  // 시드 없는 두 런은 (하니스 시드 고정이라) 같지만, seed 필드만 확인
  assert.equal(HX.initState(20260621).seed, 20260621);
});
