import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor, loadGame, plain } from './harness.mjs';

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

test('achievement checks: 완주/정복/속공 (region 1)', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, ACHIEVEMENTS, achvDone } = HXS;
  const r = REGIONS[0]; // from..to
  const ids = []; for (let i = r.from; i <= r.to; i++) ids.push(STAGES[i].id);
  const allStars = (n) => Object.fromEntries(ids.map(id => [id, n]));
  const find = (suffix) => ACHIEVEMENTS.find(a => a.region === r.id && a.id.endsWith(suffix));
  // 완주: 전부 별≥1
  assert.equal(achvDone(find('clear'), {}, {}), false);
  assert.equal(achvDone(find('clear'), allStars(1), {}), true);
  // 정복: 전부 별===3
  assert.equal(achvDone(find('master'), allStars(2), {}), false);
  assert.equal(achvDone(find('master'), allStars(3), {}), true);
  // 속공: 보스 best.turns <= 임계 (임계값 자체는 플레이스홀더 — 충분히 큰/작은 값으로 양쪽 검증)
  const bossId = STAGES[r.to].id;
  assert.equal(achvDone(find('speed'), allStars(3), {}), false);            // best 없음
  assert.equal(achvDone(find('speed'), allStars(3), { [bossId]: { turns: 1 } }), true); // 아주 빠름 → 달성
});

test('regionAchv / totalAchv aggregate', () => {
  const { HXS } = loadGame();
  const { REGIONS, regionAchv, totalAchv } = HXS;
  const ra = regionAchv(REGIONS[0].id, {}, {});
  assert.ok(ra.total >= 3 && ra.done === 0);
  const ta = totalAchv({}, {});
  assert.ok(ta.total >= ra.total && ta.done === 0 && ta.pct === 0);
});
