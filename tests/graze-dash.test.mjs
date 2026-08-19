import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

// 액티브 기믹 1차 세트(그레이즈+대시) — 엔드리스 전용, 스테이지 모드 불변이 계약이다.
// 기획: docs/design-active-growth-roguelike.md

const fresh = () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  // si를 높여 스폰을 멀리 보내 테스트 중 새 탄이 안 들어오게 한다
  const base = { ...HX.initState(1), si: 99, bl: [], its: [], enemies: [] };
  return { HX, HXS, base };
};

test('dash: 게이지가 충분하면 2칸 도약하고 게이지가 차감된다 (엔드리스)', () => {
  const { HX, base } = fresh();
  const cost = HX.DEFAULT_BAL.dash.cost;
  const s = { ...base, gz: cost };
  const n = HX.tick(s, 8, 3); // (10,3) -> (8,3) = hex dist 2
  assert.notEqual(n, s, 'dash 이동이 거부되면 안 된다');
  assert.equal(n.pl.r, 8);
  assert.equal(n.pl.c, 3);
  assert.equal(n.gz, 0, `게이지 ${cost} 차감`);
});

test('dash: 게이지가 부족하면 2칸 이동은 무효', () => {
  const { HX, base } = fresh();
  const s = { ...base, gz: HX.DEFAULT_BAL.dash.cost - 1 };
  assert.equal(HX.tick(s, 8, 3), s);
});

test('dash: 스테이지 모드에서는 게이지가 있어도 안 된다 (기존 밸런스 보존)', () => {
  const { HX, HXS } = fresh();
  const s = { ...HXS.initStage(0), gz: 99 };
  assert.equal(HX.tick(s, 8, 3), s, '스테이지 모드 2칸 이동은 거부');
});

test('dash: 착지 칸 충돌 판정은 일반 이동과 동일 (탄 위로 도약 착지 = 피격)', () => {
  const { HX, base } = fresh();
  const s = { ...base, gz: 9, bl: [{ r: 8, c: 3 }] };
  const n = HX.tick(s, 8, 3);
  assert.equal(n.ov, true, '탄이 있던 칸에 착지하면 죽는다 — 대시는 무적이 아니다');
});

test('graze: 이동 후 인접한 탄이 게이지를 채우고 보너스 점수를 준다', () => {
  const { HX, base } = fresh();
  const gb = HX.DEFAULT_BAL.graze;
  // (8,3) 탄은 tick 후 (9,3) — 제자리(10,3) 플레이어와 인접 1칸 = 스침
  const s = { ...base, gz: 0, bl: [{ r: 8, c: 3 }] };
  const n = HX.tick(s, 10, 3);
  assert.equal(n.ov, false);
  assert.equal(n.gz, gb.gaugePerBullet);
  assert.ok(n.evts.some(e => e.ty === 'graze'), 'graze 이벤트 발생');
  assert.ok(n.sc >= s.sc + gb.scoreBonus, '스침 보너스 점수');
});

test('graze: 게이지는 상한을 넘지 않는다', () => {
  const { HX, base } = fresh();
  const gb = HX.DEFAULT_BAL.graze;
  const s = { ...base, gz: gb.gaugeMax, bl: [{ r: 8, c: 3 }] };
  const n = HX.tick(s, 10, 3);
  assert.equal(n.gz, gb.gaugeMax);
});

test('graze: 스테이지 모드에서는 동작하지 않는다', () => {
  const { HX, HXS } = fresh();
  const s = HXS.initStage(0); // (10,3) 시작, 탄 없음
  const withBullet = { ...s, bl: [{ r: 8, c: 3 }], si: 99 };
  const n = HX.tick(withBullet, 10, 3);
  assert.ok(!n.gz, '스테이지 모드는 게이지가 차지 않는다');
});

test('undo: 대시/그레이즈 게이지도 되돌린다', () => {
  const { HX, base } = fresh();
  const cost = HX.DEFAULT_BAL.dash.cost;
  const s = { ...base, gz: cost, sc: 500 };
  const dashed = HX.tick(s, 8, 3);
  assert.equal(dashed.gz, 0);
  const undone = HX.doUndo(dashed);
  assert.ok(undone, 'undo 가능');
  assert.equal(undone.gz, cost, 'undo 후 게이지 복원');
  assert.equal(undone.pl.r, 10);
});
