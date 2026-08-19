import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

// 2차 세트(B1 영구 업그레이드 + C3 사망 환원) — 전부 엔드리스 전용.
// 스테이지 밸런스 불변이 계약이다. 기획: docs/design-active-growth-roguelike.md

const fresh = () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  const base = { ...HX.initState(1), si: 99, bl: [], its: [], enemies: [] };
  return { HX, HXS, base };
};

test('업그레이드: gaugeCap이 그레이즈 게이지 상한을 올린다', () => {
  const { HX, base } = fresh();
  const gb = HX.DEFAULT_BAL.graze;
  const s = { ...base, up: { gaugeCap: 1 }, gz: gb.gaugeMax, bl: [{ r: 8, c: 3 }] };
  const n = HX.tick(s, 10, 3); // 스침 발생
  assert.equal(n.gz, gb.gaugeMax + 1, '상한 +1 반영');
});

test('업그레이드: dashCost가 대시 비용을 줄인다', () => {
  const { HX, base } = fresh();
  const cost = HX.DEFAULT_BAL.dash.cost; // 3
  const s = { ...base, up: { dashCost: 1 }, gz: cost - 1 }; // 게이지 2로도
  const n = HX.tick(s, 8, 3);
  assert.notEqual(n, s, '비용 -1이면 게이지 2로 대시 가능');
  assert.equal(n.gz, 0);
});

test('업그레이드: grazeBonus가 스침 점수를 올린다', () => {
  const { HX, base } = fresh();
  const gb = HX.DEFAULT_BAL.graze;
  const plain = HX.tick({ ...base, bl: [{ r: 8, c: 3 }] }, 10, 3);
  const upped = HX.tick({ ...base, up: { grazeBonus: 2 }, bl: [{ r: 8, c: 3 }] }, 10, 3);
  assert.equal(upped.sc - plain.sc, 10, 'Lv2 = +10점 추가');
});

test('업그레이드 레벨은 max를 넘겨도 max로 캡', () => {
  const { HX, base } = fresh();
  const s = { ...base, up: { gaugeCap: 99 }, gz: 0, bl: [{ r: 8, c: 3 }] };
  assert.equal(HX.effGaugeMax(s), HX.DEFAULT_BAL.graze.gaugeMax + HX.UPGRADES.gaugeCap.max);
});

test('C3: 엔드리스 사망 시 점수 일부가 코인(cv)으로 환원된다', () => {
  const { HX, base } = fresh();
  // 탄이 있는 칸으로 걸어 들어가 사망
  const s = { ...base, sc: 1000, bl: [{ r: 9, c: 3 }] };
  const n = HX.tick(s, 9, 3);
  assert.equal(n.ov, true);
  assert.equal(n.cv, Math.floor(n.sc * HX.DEFAULT_BAL.meta.convertBase));
  assert.ok(n.evts.some(e => e.ty === 'cv'));
});

test('C3: convert 업그레이드가 전환율을 올린다', () => {
  const { HX, base } = fresh();
  const m = HX.DEFAULT_BAL.meta;
  const s = { ...base, up: { convert: 2 }, sc: 1000, bl: [{ r: 9, c: 3 }] };
  const n = HX.tick(s, 9, 3);
  assert.equal(n.cv, Math.floor(n.sc * (m.convertBase + 2 * m.convertPerLv)));
});

test('C3: 스테이지 모드 사망은 환원이 없다 (스테이지 경제 불변)', () => {
  const { HX, HXS } = fresh();
  const s = { ...HXS.initStage(0), sc: 1000, si: 99, bl: [{ r: 9, c: 3 }] };
  const n = HX.tick(s, 9, 3);
  assert.equal(n.ov, true);
  assert.ok(!n.cv, '스테이지에서 cv 없음');
});

test('생존 중에는 환원되지 않는다', () => {
  const { HX, base } = fresh();
  const n = HX.tick({ ...base, sc: 1000 }, 10, 3);
  assert.equal(n.cv, 0);
});
