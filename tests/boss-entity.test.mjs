import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, plain } from './harness.mjs';

// 보스 온그리드 엔티티 — 보스가 상단 셀을 실제 점유하고, N웨이브마다 순간이동(1웨이브 전 예고),
// 착지 직후 자유탄 burst. 몸통 셀 진입은 피격.

const run = (seed, turns, idx = 5) => {
  const { HX, HXS } = loadGame({ seed });
  let s = HXS.initStage(idx);
  const trace = [];
  for (let i = 0; i < turns && !s.ov; i++) {
    s = HX.tick(s, s.pl.r, s.pl.c);
    trace.push({ w: s.bossWaves, pos: plain(s.bossPos), next: plain(s.bossNext), fbN: s.fb.length });
  }
  return { HX, HXS, s, trace };
};

test('보스 스테이지는 bossPos를 갖고, 일반 스테이지·엔드리스는 없다', () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  assert.deepEqual(plain(HXS.initStage(5).bossPos), { r: 1, c: 3 });
  assert.equal(HXS.initStage(0).bossPos, null);
  assert.ok(!HX.initState(1).bossPos);
});

test('blinkEvery 웨이브마다 착지점 예고 → 다음 웨이브에 이동', () => {
  const { HX, trace } = run(3, 14);
  const every = HX.DEFAULT_BAL.boss.blinkEvery;
  // 예고가 발생한 첫 지점
  const telIdx = trace.findIndex(t => t.next);
  assert.ok(telIdx >= 0, '착지점 예고 발생');
  assert.equal(trace[telIdx].w % every, 0, '예고는 blinkEvery 배수 웨이브에서');
  // 예고 후 다음 웨이브에서 그 위치로 이동
  const tel = trace[telIdx];
  const moveStep = trace.slice(telIdx + 1).find(t => t.w > tel.w);
  assert.ok(moveStep, '다음 웨이브 존재');
  assert.deepEqual(moveStep.pos, tel.next, '예고 지점으로 순간이동');
  assert.equal(moveStep.next, null);
});

test('순간이동 착지 웨이브에 자유탄 burst가 추가된다', () => {
  const { HX, trace } = run(3, 14);
  const every = HX.DEFAULT_BAL.boss.blinkEvery;
  const telIdx = trace.findIndex(t => t.next);
  const before = trace[telIdx].fbN;
  const moveStep = trace.slice(telIdx + 1).find(t => t.w > trace[telIdx].w);
  // 착지 웨이브: 일반 웨이브 fb(≤2) + blinkShots(4) — 전진 소멸 감안해 최소 +3 증가 확인
  assert.ok(moveStep.fbN >= Math.min(before + 3, HX.DEFAULT_BAL.freeBullets.cap),
    `착지 burst로 자유탄 증가 (${before} → ${moveStep.fbN})`);
});

test('보스 몸통 셀에 들어가면 피격', () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  const s0 = HXS.initStage(5);
  const s = { ...s0, si: 99, bl: [], pl: { r: 2, c: 3 } }; // 보스(1,3) 바로 아래
  const n = HX.tick(s, 1, 3);
  assert.equal(n.ov, true, '보스 몸통 진입 = 게임오버');
});

test('결정론: 같은 시드 = 같은 순간이동 시퀀스', () => {
  const a = run(7, 12).trace.map(t => t.pos);
  const b = run(7, 12).trace.map(t => t.pos);
  assert.deepEqual(a, b);
});
