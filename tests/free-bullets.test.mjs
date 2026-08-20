import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, plain } from './harness.mjs';

// 자유탄(fb) — 보스 전용 실탄. 곡선 궤적을 턴 동기로 내려오고, 맞으면 게임오버.
// 시드 RNG만 사용(결정론) — 데일리 공정성·봇 시뮬 전제.

const bossRun = (seed, turns) => {
  const { HX, HXS } = loadGame({ seed });
  let s = HXS.initStage(5); // #6 BOSS 파수꾼
  const snaps = [];
  for (let i = 0; i < turns && !s.ov; i++) {
    s = HX.tick(s, s.pl.r, s.pl.c);
    snaps.push(plain(s.fb));
  }
  return { s, snaps };
};

test('보스 웨이브마다 자유탄이 분출된다', () => {
  const { s } = bossRun(3, 4);
  assert.ok(s.fb.length > 0, '자유탄 존재');
  for (const f of s.fb) {
    assert.ok(f.step >= 0.14 && f.step <= 0.34 + 1e-9, `탄마다 랜덤 보폭: ${f.step}`);
    assert.ok(f.id > 0);
  }
});

test('자유탄은 턴마다 자기 보폭만큼 전진하고, 끝나면 사라진다', () => {
  const { HX, HXS } = loadGame({ seed: 3 });
  let s = HXS.initStage(5);
  for (let i = 0; i < 2 && !s.ov; i++) s = HX.tick(s, s.pl.r, s.pl.c);
  const before = s.fb.map(f => ({ id: f.id, p: f.p, step: f.step }));
  assert.ok(before.length > 0);
  const n = HX.tick(s, s.pl.r, s.pl.c);
  for (const b of before) {
    const after = n.fb.find(f => f.id === b.id);
    if (b.p + b.step > 1.05) assert.ok(!after, '수명 끝 = 제거');
    else assert.ok(Math.abs(after.p - (b.p + b.step)) < 1e-9, '보폭만큼 전진');
  }
});

test('자유탄에 맞으면 게임오버', () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  const s0 = HXS.initStage(5);
  const px = HX.hc(s0.pl.r, s0.pl.c); // 플레이어 셀 픽셀 중심
  // 궤적 전체가 플레이어 셀 중심을 지나는 자유탄 — 다음 턴 어떤 p여도 플레이어 셀
  const killer = { id: 999, x0: px.x, y0: px.y, cx1: px.x, cy1: px.y, cx2: px.x, cy2: px.y, x1: px.x, y1: px.y, p: 0.2, step: 0.2 };
  const s = { ...s0, si: 99, bl: [], fb: [killer] };
  const n = HX.tick(s, s.pl.r, s.pl.c); // 제자리 대기
  assert.equal(n.ov, true, '자유탄 피격 = 게임오버');
});

test('프리즈 중에는 자유탄도 멈춘다', () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  const s0 = HXS.initStage(5);
  const f = { id: 1, x0: 0, y0: 0, cx1: 0, cy1: 0, cx2: 0, cy2: 0, x1: 0, y1: 300, p: 0.3, step: 0.2 };
  const s = { ...s0, si: 99, bl: [], fb: [f], fz: 2 };
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.fb[0].p, 0.3, '프리즈 동안 전진 없음');
});

test('결정론: 같은 시드 = 같은 자유탄 궤적', () => {
  const a = bossRun(11, 6), b = bossRun(11, 6);
  assert.deepEqual(a.snaps, b.snaps);
});

test('보스가 아니면 자유탄이 생기지 않는다 (일반 스테이지·엔드리스)', () => {
  const { HX, HXS } = loadGame({ seed: 2 });
  let s = HXS.initStage(0); // normal
  for (let i = 0; i < 8 && !s.ov && !s.win; i++) {
    s = HX.tick(s, s.pl.r, s.pl.c);
    assert.equal((s.fb || []).length, 0);
  }
  let e = HX.initState(2); // endless
  for (let i = 0; i < 8 && !e.ov; i++) {
    e = HX.tick(e, e.pl.r, e.pl.c);
    assert.equal((e.fb || []).length, 0);
  }
});

test('undo가 자유탄도 되돌린다', () => {
  const { HX, HXS } = loadGame({ seed: 3 });
  let s = HXS.initStage(5);
  for (let i = 0; i < 2; i++) s = HX.tick(s, s.pl.r, s.pl.c);
  const beforeUndo = plain(s.hist.fb);
  const u = HX.doUndo({ ...s, coins: 999, sc: 999 });
  assert.ok(u, 'undo 가능');
  assert.deepEqual(plain(u.fb), beforeUndo);
});
