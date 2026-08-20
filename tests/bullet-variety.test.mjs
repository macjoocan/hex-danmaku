import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

// 변칙 탄막(zig/slow) — 엔드리스 전용. 스테이지 탄은 패턴 정의 그대로가 계약이다.

const fresh = () => {
  const { HX, HXS } = loadGame({ seed: 1 });
  const base = { ...HX.initState(1), si: 99, bl: [], its: [], enemies: [] };
  return { HX, HXS, base };
};

test('zig: 좌우를 번갈아 대각선으로 내려온다', () => {
  const { HX, base } = fresh();
  let s = { ...base, bl: [{ r: 0, c: 3, zig: 1, zdir: 1 }] };
  s = HX.tick(s, 10, 3); // (0,3)→(1,4)
  assert.deepEqual([s.bl[0].r, s.bl[0].c], [1, 4]);
  s = HX.tick(s, 10, 3); // →(2,3) 반대 방향
  assert.deepEqual([s.bl[0].r, s.bl[0].c], [2, 3]);
  s = HX.tick(s, 10, 3); // →(3,4)
  assert.deepEqual([s.bl[0].r, s.bl[0].c], [3, 4]);
});

test('zig: 모서리에서 반사된다', () => {
  const { HX, base } = fresh();
  let s = { ...base, bl: [{ r: 0, c: 6, zig: 1, zdir: 1 }] }; // 오른쪽 끝에서 우측 지그
  s = HX.tick(s, 10, 3);
  assert.deepEqual([s.bl[0].r, s.bl[0].c], [1, 5], '반사되어 왼쪽으로');
});

test('slow: 두 턴에 한 칸 내려온다 (held=true → 이동, false → 홀드 토글)', () => {
  const { HX, base } = fresh();
  let s = { ...base, bl: [{ r: 2, c: 3, slow: 1, held: true }] };
  s = HX.tick(s, 10, 3); // 이동 턴
  assert.equal(s.bl[0].r, 3);
  s = HX.tick(s, 10, 3); // 홀드 턴
  assert.equal(s.bl[0].r, 3);
  s = HX.tick(s, 10, 3); // 이동 턴
  assert.equal(s.bl[0].r, 4);
});

test('nextBulletPos가 tick의 실제 이동과 일치한다 (직선·드리프트·zig·slow)', () => {
  const { HX, base } = fresh();
  const cases = [
    { r: 2, c: 3 },
    { r: 2, c: 3, vc: 1 },
    { r: 2, c: 3, zig: 1, zdir: -1 },
    { r: 2, c: 3, slow: 1, held: true }, // held=true → 이번 턴 이동
    { r: 2, c: 3, slow: 1, held: false }, // → 홀드
  ];
  for (const b of cases) {
    const pred = HX.nextBulletPos(b);
    const s = HX.tick({ ...base, bl: [{ ...b }] }, 10, 3);
    assert.deepEqual([s.bl[0].r, s.bl[0].c], [pred.hold ? b.r : pred.r, pred.hold ? b.c : pred.c],
      JSON.stringify(b));
  }
});

test('스테이지 모드 스폰에는 변칙탄이 섞이지 않는다 (밸런스 불변)', () => {
  const { HX, HXS } = fresh();
  let s = HXS.initStage(0);
  for (let i = 0; i < 20 && !s.ov && !s.win; i++) {
    s = HX.tick(s, s.pl.r, s.pl.c);
    for (const b of s.bl) assert.ok(!b.zig && !b.slow, '스테이지 탄은 straight/패턴 정의만');
  }
});

test('엔드리스: diffEasy 이전에는 변칙탄이 없다', () => {
  const { HX } = fresh();
  let s = HX.initState(7);
  const easy = HX.DEFAULT_BAL.endless.diffEasy;
  for (let i = 0; i < easy - 1 && !s.ov; i++) {
    // 안전한 수 아무거나 (제자리 우선, 죽으면 옆으로)
    let n = HX.tick(s, s.pl.r, s.pl.c);
    if (n === s || n.ov) {
      for (const [dr, dc] of HX.D(s.pl.r)) {
        const t = HX.tick(s, s.pl.r + dr, s.pl.c + dc);
        if (t !== s && !t.ov) { n = t; break; }
      }
    }
    if (n === s || n.ov) break;
    s = n;
    for (const b of s.bl) assert.ok(!b.zig && !b.slow, `t${s.t}에 변칙탄 발견`);
  }
});

test('엔드리스: diffEasy 이후 지그재그탄이 실제로 섞인다', () => {
  const { HX } = fresh();
  // 여러 시드에서 t>=diffEasy 구간을 진행해 zig 등장을 확인
  let found = false;
  for (let seed = 1; seed <= 10 && !found; seed++) {
    const { HX: H } = loadGame({ seed });
    let s = { ...H.initState(seed) };
    for (let i = 0; i < 40 && !s.ov; i++) {
      let n = H.tick(s, s.pl.r, s.pl.c);
      if (n === s || n.ov) {
        for (const [dr, dc] of H.D(s.pl.r)) {
          const t = H.tick(s, s.pl.r + dr, s.pl.c + dc);
          if (t !== s && !t.ov) { n = t; break; }
        }
      }
      if (n === s || n.ov) break;
      s = n;
      if (s.bl.some(b => b.zig)) { found = true; break; }
    }
  }
  assert.ok(found, '10개 시드 40턴 내에 zig탄이 한 번은 나와야 한다 (zigChance 0.2)');
});

test('보스 웨이브 스폰 시 wave 이벤트가 나간다 (연출 훅)', () => {
  const { HX, HXS } = fresh();
  let s = HXS.initStage(5); // BOSS 파수꾼
  let seen = false;
  for (let i = 0; i < 6 && !s.ov; i++) {
    s = HX.tick(s, s.pl.r, s.pl.c);
    if (s.evts.some(e => e.ty === 'wave' && Array.isArray(e.cols))) { seen = true; break; }
  }
  assert.ok(seen, '보스 스폰 턴에 wave 이벤트');
});
