# 보스 폭탄 패턴 + 파라미터화 패턴 시스템 (스펙 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보스 phase에 즉사 장판을 깔았다 사라지는 신규 `bomb` 패턴(3 mode: 직선/대각/무차별)을 추가하고, fairness 불변식을 유지한다 (스펙: `docs/superpowers/specs/2026-06-13-boss-bomb-pattern-design.md`).

**Architecture:** 폭탄은 낙하 탄막과 별개의 새 상태 필드 `s.bombs=[{r,c,age,armed}]`로 관리. `age` 카운터가 예고→활성→소멸을 구동(`armed = age >= telegraph`, `age >= telegraph+life`면 제거 — fencepost 없는 모델). `bossAtk`의 `case 'bomb'`이 현재 `s.pl` 기준으로 안전링을 제외한 셀을 계산해 `np.bombs`로 실어 보내고(기존 `mark` 선례 경로), 엔진 스폰 블록이 충돌 판정 後 `s.bombs`에 추가. fairness는 멀티시드 스윕으로 검증·튜닝.

**Tech Stack:** 순수 JS(engine/stages) + JSX(app/editor/sprites), node:test + vm 하니스(`loadGame`/`loadEditor`, `plain()` 래핑, Mulberry32 시드 RNG), localStorage.

**핵심 코드 지형 (실측)**
- 엔진 스폰 블록 `if (si<=0 && !bossDone)`: [engine.jsx:318-345](../../../engine.jsx) — `s.np.cells`/`s.np.c`/`s.np.laser`/`s.np.summon` 처리. `spawnedLasers`/`spawnedEnemies`는 [engine.jsx:293-294](../../../engine.jsx)에서 선언.
- 충돌: [engine.jsx:462-468](../../../engine.jsx) `hitBullet/hitEnemy/hitSpike → ov`. 스폰된 적은 충돌 後 머지([engine.jsx:472](../../../engine.jsx)).
- 보스 승리: [engine.jsx:481](../../../engine.jsx) `ty==='boss' && bossWaves>=bossTotal && mv.length===0`.
- 상태 반환: [engine.jsx:502-520](../../../engine.jsx). `DEFAULT_BAL`: [engine.jsx:43-49](../../../engine.jsx). `bal()`: [engine.jsx:52](../../../engine.jsx). window.HX export: [engine.jsx:608-618](../../../engine.jsx).
- `bossAtk`: [stages.jsx:22-103](../../../stages.jsx), `mark` 선례 [stages.jsx:83-93](../../../stages.jsx). stages.jsx 상단 구조분해 `const { C, R, PAT, D } = window.HX;` ([stages.jsx:5](../../../stages.jsx)) — `hd` 미포함(Task 2에서 추가). 보스 id 19: [stages.jsx:295-305](../../../stages.jsx).
- fairness 하니스: [tests/fairness.test.mjs](../../../tests/fairness.test.mjs) `bossSurvives(type,{seed,turns})` (단일 type 보스 구동, `hasSafeMove`/`bestNext` 2-ply).
- vm 하니스: `loadGame({seed})` → `{HX, HXS, setSeed}`; `baseState(HX, over)`; `plain(v)`. 각 .jsx는 별도 IIFE라 엔진 top-level const는 stages에서 안 보임(필요한 건 window.HX에서 구조분해).

**명명 주의(충돌 회피):** 기존에 `bomb` 픽업(RES key `bomb`, `BombSprite`, item ty `'bm'`)과 `doBomb` 스킬이 있음. 신규 보스 장판은 **상태 필드 `s.bombs`**(신규, 충돌 없음), **RES key `bombZone`**, **`BombZoneSprite`**, **이벤트 `ty:'bombzone'`**, **에디터 보스 atk 타입 문자열 `'bomb'`**(phase type만 — 픽업과 별개 네임스페이스)로 명명.

---

### Task 1: 폭탄 상태기계 + 충돌 + 승리조건 (engine.jsx)

**Files:**
- Modify: `engine.jsx` (DEFAULT_BAL.boss, tick의 bombs 진행/충돌/스폰스레딩/승리/반환, initState)
- Test: `tests/boss-bomb.test.mjs` (신규)

- [ ] **Step 1: 실패 테스트 작성** — `tests/boss-bomb.test.mjs`. `loadGame`/`baseState`/`plain` 사용. 폭탄은 직접 `s.bombs`/`s.np.bombs`를 주입해 검증(스폰은 si<=0일 때 일어남).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState, plain } from './harness.mjs';

// 최소 보스 상태. si=99로 자동 스폰을 막고, 필요한 케이스에서만 si=1 + np.bombs로 투척.
const boss = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'boss' }, si: 99,
  stage: { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode: 'scatter', turns: 999 }] },
  bossWaves: 0, bombs: [], ...over,
});

test('bomb advances telegraph -> armed -> removed by age (telegraph=1, life=2)', () => {
  const { HX } = loadGame();
  // 갓 던져진 폭탄: age 0, armed false (예고)
  let s = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 5, c: 3, age: 0, armed: false }] });
  let n = HX.tick(s, 10, 0);                      // T1: age 1 -> armed (telegraph=1)
  assert.equal(plain(n.bombs)[0].armed, true);
  assert.equal(plain(n.bombs)[0].age, 1);
  n = HX.tick(n, 10, 0);                           // T2: age 2, 여전히 armed (life=2 → age<3)
  assert.equal(plain(n.bombs)[0].armed, true);
  n = HX.tick(n, 10, 0);                           // T3: age 3 >= telegraph+life=3 → 제거
  assert.equal(plain(n.bombs).length, 0);
});

test('stepping onto an armed bomb is game over; telegraph cell is safe', () => {
  const { HX } = loadGame();
  // armed 폭탄이 (9,0)에 있음 → 인접 (10,0)→(9,0) 이동 시 즉사
  const armed = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 1, armed: true }] });
  assert.equal(HX.tick(armed, 9, 0).ov, true);
  // 예고(armed:false) 셀로 이동은 안전 (그 턴엔 치명 아님)
  const tel = boss(HX, { pl: { r: 10, c: 0 }, bombs: [{ r: 9, c: 0, age: 0, armed: false }] });
  assert.equal(HX.tick(tel, 9, 0).ov, false);
});

test('freeze pauses bomb age', () => {
  const { HX } = loadGame();
  const s = boss(HX, { pl: { r: 10, c: 0 }, fz: 2, bombs: [{ r: 5, c: 3, age: 0, armed: false }] });
  const n = HX.tick(s, 10, 0);
  assert.equal(plain(n.bombs)[0].age, 0);          // 정지
  assert.equal(plain(n.bombs)[0].armed, false);
});

test('np.bombs spawns telegraph bombs after collision (not lethal on spawn turn)', () => {
  const { HX } = loadGame();
  // si=1 → 이번 턴 스폰. np는 bomb 패턴(c:[], bombs:[플레이어 도착 셀]). 도착 셀에 떨어져도 그 턴 즉사 아님.
  const s = boss(HX, {
    pl: { r: 10, c: 0 }, si: 1,
    np: { n: '폭탄', c: [], bombs: [{ r: 10, c: 1 }] },
    np2: { n: '폭탄', c: [], bombs: [] },
  });
  const n = HX.tick(s, 10, 1);                     // 플레이어가 (10,1)로 이동, 거기에 폭탄 투척
  assert.equal(n.ov, false);                       // 스폰 턴엔 치명 아님
  assert.ok(plain(n.bombs).some(b => b.r === 10 && b.c === 1 && b.armed === false));
});

test('boss win requires no armed bombs remaining', () => {
  const { HX } = loadGame();
  // 모든 웨이브 소진 + 화면 탄막 없음 + 그러나 armed 폭탄 잔존 → 미승리
  const stage = { type: 'boss', interval: 2, bossTotal: 1, phases: [{ type: 'bomb', mode: 'scatter', turns: 1 }] };
  const s = baseState(HX, {
    mode: 'stage', obj: { type: 'boss' }, stage, si: 99, bossWaves: 1, bl: [],
    pl: { r: 10, c: 0 }, bombs: [{ r: 2, c: 3, age: 1, armed: true }],
  });
  assert.equal(HX.tick(s, 10, 0).win, false);
  // armed 폭탄 없으면 승리
  const s2 = { ...s, bombs: [] };
  assert.equal(HX.tick(s2, 10, 0).win, true);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/boss-bomb.test.mjs` → FAIL (bombs 미처리: armed 안 생기고 ov/ win 안 맞음).

- [ ] **Step 3: 구현** — engine.jsx 편집:

(a) DEFAULT_BAL에 boss 섹션 추가 ([engine.jsx:43-49](../../../engine.jsx) 객체 내):
```js
  boss: { bombsPerWave: 2, bombLife: 2, bombTelegraph: 1 },
```

(b) `spawnedLasers`/`spawnedEnemies` 선언 옆([engine.jsx:293-294](../../../engine.jsx))에 추가:
```js
  const spawnedBombs = [];
```

(c) 폭탄 생애주기 진행 — 불릿 motion 직후(`fz`/`mv` 확정 후, 스폰 블록 부근). `s.fz>0`이면 정지, 아니면 age++ & 만료 제거:
```js
  // ── bomb zones: age up, arm after telegraph, expire after life (paused while frozen) ──
  const bcfg = bal().boss;
  let bombs = (s.bombs || []).map(b => ({ ...b }));
  if (s.fz <= 0) {
    bombs = bombs
      .map(b => { const age = b.age + 1; return { ...b, age, armed: age >= bcfg.bombTelegraph }; })
      .filter(b => b.age < bcfg.bombTelegraph + bcfg.bombLife);
  }
```
(주의: `armed`는 age 증가 후 재계산. 갓 스폰된 age:0 폭탄은 telegraph>=1이면 armed:false 유지.)

(d) 스폰 블록([engine.jsx:318-345](../../../engine.jsx)) 안, `if (s.np.summon) ...` 뒤에:
```js
      if (s.np.bombs) s.np.bombs.forEach(cell => {
        if (cell.r >= 0 && cell.r < R && cell.c >= 0 && cell.c < C
          && !block.some(w => w.r === cell.r && w.c === cell.c))
          spawnedBombs.push({ r: cell.r, c: cell.c, age: 0, armed: false });
      });
```

(e) 충돌([engine.jsx:462-468](../../../engine.jsx))에 폭탄 추가:
```js
  const hitBomb = bombs.some(b => b.armed && b.r === finalR && b.c === finalC);
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit || beamHit || hitBomb;
```

(f) 충돌 後 스폰 폭탄 머지([engine.jsx:472](../../../engine.jsx) `spawnedEnemies` 머지 부근):
```js
  if (spawnedBombs.length) bombs = [...bombs, ...spawnedBombs];
```

(g) 보스 승리([engine.jsx:481](../../../engine.jsx)) 조건에 armed 폭탄 0 추가:
```js
    else if (ty === 'boss' && bossWaves >= bossTotal && mv.length === 0 && !bombs.some(b => b.armed)) win = true;
```

(h) 반환 객체([engine.jsx:502-520](../../../engine.jsx))에 `bombs` 추가:
```js
    bombs,
```

(i) `initState`([engine.jsx:573-605](../../../engine.jsx))에 `bombs: [],` 추가(엔드리스에도 빈 배열로 존재해 일관).

- [ ] **Step 4: 통과 확인** — `node --test tests/boss-bomb.test.mjs` PASS, 그다음 `npm test` 전체 GREEN(기존 보스/탄막 회귀 없음).

- [ ] **Step 5: 커밋**
```bash
git add engine.jsx tests/boss-bomb.test.mjs
git commit -m "feat(boss): bomb-zone state machine (telegraph->armed->expire) + collision + win gating

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: bomb 패턴 생성기 — 3 mode + np.bombs (stages.jsx)

**Files:**
- Modify: `stages.jsx` (상단 구조분해에 `hd` 추가, `bossAtk`에 `case 'bomb'`)
- Test: `tests/boss-bomb.test.mjs` (확장)

- [ ] **Step 1: 실패 테스트 추가** — `bossAtk`를 직접 부르긴 어려우니(미export) `pickPattern`을 통해 검증. bomb phase 보스에서 `pickPattern(stage, t, s)` → `{ n, c:[], bombs:[...] }` 반환을 확인.

```js
// helper: bomb 패턴 한 장 뽑기
const bombPat = (HXS, mode, s) => {
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode, turns: 999 }] };
  return plain(HXS.pickPattern(stage, 0, s));
};
const HXdist = (HX, r1, c1, r2, c2) => HX.hd(r1, c1, r2, c2);

test('bomb pattern returns empty falling cols (no rain during bomb phase)', () => {
  const { HX, HXS } = loadGame();
  const p = bombPat(HXS, 'scatter', baseState(HX, { pl: { r: 8, c: 3 } }));
  assert.deepEqual(p.c, []);
  assert.ok(Array.isArray(p.bombs));
});

test('bomb cells never land on player cell or its 6-ring (all modes)', () => {
  const { HX, HXS } = loadGame();
  for (const mode of ['line', 'diag', 'scatter']) {
    const pl = { r: 8, c: 3 };
    const p = bombPat(HXS, mode, baseState(HX, { pl }));
    for (const b of p.bombs) {
      assert.ok(HXdist(HX, b.r, b.c, pl.r, pl.c) >= 2, `${mode}: bomb at ${b.r},${b.c} within ring of player`);
    }
  }
});

test('bomb cell count respects bombsPerWave cap', () => {
  const { HX, HXS } = loadGame();
  for (const mode of ['line', 'diag', 'scatter']) {
    const p = bombPat(HXS, mode, baseState(HX, { pl: { r: 8, c: 3 } }));
    assert.ok(p.bombs.length <= HX.bal().boss.bombsPerWave, `${mode}: ${p.bombs.length} > cap`);
  }
});

test('bomb cells avoid occupied cells (walls)', () => {
  const { HX, HXS } = loadGame();
  // 보드 거의 전체를 벽으로 막고 빈 칸 1개만 → 그 칸 외엔 안 깔림
  const walls = [];
  for (let r = 0; r < HX.R; r++) for (let c = 0; c < HX.C; c++) if (!(r === 2 && c === 6)) walls.push({ r, c });
  const p = bombPat(HXS, 'scatter', baseState(HX, { pl: { r: 10, c: 0 }, walls }));
  for (const b of p.bombs) assert.ok(b.r === 2 && b.c === 6, `bomb on occupied cell ${b.r},${b.c}`);
});
```

(주: bossAtk가 `s.walls`/`s.bombs` 등 점유를 보려면 `pickPattern`/`bossAtk`가 `s`를 받음 — 이미 받음. occupied 집합에 walls/turrets/spikes/cracks/pads/gems/기존 bombs/플레이어를 포함.)

- [ ] **Step 2: 실패 확인** — `node --test tests/boss-bomb.test.mjs` → 신규 케이스 FAIL (`case 'bomb'` 없어 default 산탄 반환).

- [ ] **Step 3: 구현** — stages.jsx:

(a) 상단 구조분해에 `hd` 추가([stages.jsx:5](../../../stages.jsx)):
```js
const { C, R, PAT, D, hd } = window.HX;
```

(b) `bossAtk` switch([stages.jsx:22-103](../../../stages.jsx))에 `case 'bomb'` 추가(`default` 앞). `mark` 선례처럼 `s.pl` 기준, 안전링+점유 제외, count 상한:
```js
    case 'bomb': {
      const cfg = window.HX.bal().boss;
      const count = atk.count != null ? atk.count : cfg.bombsPerWave;
      const pr = s.pl.r, pc = s.pl.c;
      // 점유 셀: 벽/포대/가시/크랙/패드/별/기존 폭탄/플레이어 (장판이 못 박혀 무의미해지는 걸 방지)
      const occ = new Set([
        ...(s.walls || []), ...(s.turrets || []), ...(s.spikes || []), ...(s.cracks || []),
        ...(s.pads || []), ...(s.gems || []), ...(s.bombs || []),
      ].map(o => `${o.r},${o.c}`));
      occ.add(`${pr},${pc}`);
      // 후보: 플레이어와 hex거리 2+ 이고 점유 안 된 셀 (행 0은 비워 둠: 낙하 탄막 영역과 분리)
      const free = (r, c) => r >= 1 && r < R && c >= 0 && c < C
        && hd(r, c, pr, pc) >= 2 && !occ.has(`${r},${c}`);
      let cells = [];
      if (atk.mode === 'line') {
        // 플레이어와 2행 이상 떨어진 행 중 하나를 골라 가로로 채움
        const rows = allCols.length ? Array.from({ length: R - 1 }, (_, i) => i + 1).filter(r => Math.abs(r - pr) >= 2) : [];
        const row = rows.length ? rows[Math.floor(Math.random() * rows.length)] : Math.max(1, pr - 2);
        cells = allCols.map(c => ({ r: row, c })).filter(p => free(p.r, p.c));
      } else if (atk.mode === 'diag') {
        // 대각 계단: 한 시작 열에서 (r, r±offset) 사선
        const dir = Math.random() < 0.5 ? 1 : -1;
        const start = Math.floor(Math.random() * C);
        cells = Array.from({ length: R - 1 }, (_, i) => ({ r: i + 1, c: clampC(start + dir * (i)) }))
          .filter(p => free(p.r, p.c));
      } else { // scatter (기본)
        const cand = [];
        for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) if (free(r, c)) cand.push({ r, c });
        cells = shuffle(cand);
      }
      return { n: atk.name || '폭탄', c: [], bombs: cells.slice(0, count) };
    }
```

- [ ] **Step 4: 통과 확인** — `node --test tests/boss-bomb.test.mjs` PASS, `npm test` 전체 GREEN.

- [ ] **Step 5: 커밋**
```bash
git add stages.jsx tests/boss-bomb.test.mjs
git commit -m "feat(boss): bomb attack generator (line/diag/scatter, safe-ring + cap)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: fairness 검증 + 튜닝 (tests/fairness.test.mjs)

**Files:**
- Modify: `tests/fairness.test.mjs` (bomb mode 케이스), 필요시 `engine.jsx`(BAL.boss 튜닝) 또는 `stages.jsx`(안전링 거리)

- [ ] **Step 1: bomb fairness 케이스 추가** — 기존 `bossSurvives(type, opts)`는 phase `{type, turns, name}`만 넘김. bomb은 `mode`가 필요하므로 phase에 mode를 주입할 수 있게 헬퍼를 확장(또는 전용 헬퍼 추가):

```js
// bomb 전용: mode를 phase에 실어 단일 보스 구동
function bombSurvives(mode, { seed = 11, turns = 30 } = {}) {
  const { HX, HXS } = loadGame({ seed });
  const stage = { type: 'boss', interval: 2, bossTotal: 999, phases: [{ type: 'bomb', mode, turns: 999, name: mode }] };
  let s = { ...HX.initState(), mode: 'stage', stage, stageIdx: 0, obj: { type: 'boss' }, si: 1, bombs: [] };
  s.np = HXS.pickPattern(stage, 0, s);
  s.np2 = HXS.pickPattern(stage, 1, { ...s, bossWaves: 1 });
  for (let i = 0; i < turns && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `bomb/${mode} turn ${s.t}: no safe move (unfair)`);
    const n = bestNext(HX, s);
    if (!n) break;
    s = n;
  }
}

// 넓은 시드 스윕 — 소수 시드는 1~5% 트랩을 놓침 (메모리 교훈)
const BOMB_SEEDS = Array.from({ length: 60 }, (_, i) => i + 1); // 1..60
for (const mode of ['line', 'diag', 'scatter'])
  test(`boss bomb ${mode} stays dodgeable across ${BOMB_SEEDS.length} seeds`, () => {
    for (const seed of BOMB_SEEDS) bombSurvives(mode, { seed, turns: 30 });
  });
```

- [ ] **Step 2: 실행 — 실패 시 튜닝** — `node --test tests/fairness.test.mjs`.
  - 통과하면 Step 3로.
  - **실패하면**(특정 시드 turn에서 no safe move): 우선순위대로 조정 후 재실행 — ① `engine.jsx` `DEFAULT_BAL.boss.bombLife` 2→1, ② `bombsPerWave` 2→ (그대로/감소는 강도와 트레이드오프이므로 마지막), ③ `stages.jsx` bomb 안전링 거리 `hd>=2`를 `>=3`으로 확대(가장 강한 보장). 각 조정 후 60시드 0 실패 될 때까지. **조정한 값과 이유를 커밋 메시지에 기록.**
  - 만약 line/diag가 구조적으로 특정 시드에서 막히면(누적 + 통로 차단), 해당 mode의 후보를 "플레이어 열 기준 한쪽 절반만" 또는 "행 0~상단만"으로 더 제약하는 것도 허용(스펙의 fairness 우선 원칙).

- [ ] **Step 3: 200시드 광역 재확인** — 통과 후 `BOMB_SEEDS`를 1..200로 일시 확대해 1회 수동 실행(`Array.from({length:200}...)`), 0 실패 확인 후 커밋 버전은 60시드로 되돌림(테스트 시간 관리; 200은 검증용 1회). 결과를 커밋 메시지에 명시.

- [ ] **Step 4: 전체 확인** — `npm test` GREEN.

- [ ] **Step 5: 커밋**
```bash
git add tests/fairness.test.mjs engine.jsx stages.jsx
git commit -m "test(boss): bomb-mode fairness sweep (60 seeds, verified 200) + tuned to 0 failures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
(engine.jsx/stages.jsx는 튜닝이 있었을 때만 add.)

---

### Task 4: 폭탄 스프라이트 + 렌더 (resources.jsx, sprites.jsx, app.jsx)

**Files:**
- Modify: `resources.jsx` (BOMBZONE 그리드/맵 + RES `bombZone`), `sprites.jsx` (BombZoneSprite), `app.jsx` (렌더 + Cell state + 범례)
- Test: `tests/resources-art.test.mjs` (EXPECTED_SIZE에 bombZone)

- [ ] **Step 1: 크기 테스트 추가(RED)** — `tests/resources-art.test.mjs`의 EXPECTED_SIZE에:
```js
  bombZone: [16, 16],
```
`node --test tests/resources-art.test.mjs` → FAIL(RES에 bombZone 없음).

- [ ] **Step 2: 스프라이트 구현** — resources.jsx, MINE 블록 부근에 16×16 추가(전부 16자, 리스킨 톤: 다크 아웃라인 + 즉사 위험 적색/주황):
```js
// Boss bomb zone (temporary instant-death tile) — armed look; telegraph is rendered via warnStroke
const BOMBZONE_MAP = { o: '#450a0a', X: '#dc2626', H: '#fca5a5', d: '#7f1d1d', e: '#fef2f2' };
const BOMBZONE = [
  '................',
  '..XX........XX..',
  '.oXXo......oXXo.',
  '..oXXo....oXXo..',
  '...oXXo..oXXo...',
  '....oXXddXXo....',
  '.....oXHHXo.....',
  '....oXHeeHXo....',
  '....oXHeeHXo....',
  '.....oXHHXo.....',
  '....oXXddXXo....',
  '...oXXo..oXXo...',
  '..oXXo....oXXo..',
  '.oXXo......oXXo.',
  '..XX........XX..',
  '................',
];
```
RES에 등록(MINE 부근): `bombZone: { kind: 'pixel', grid: BOMBZONE, map: BOMBZONE_MAP, px: 1.5, warnStroke: true },`

- [ ] **Step 3: BombZoneSprite** — sprites.jsx, MineSprite 부근에. 예고는 `warn`(점멸 경고), 활성은 본 색:
```js
// Boss bomb zone — telegraph (warn pulse) vs armed (solid lethal tile)
const BombZoneSprite = ({ x, y, armed }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g className={armed ? 'mine-armed' : 'mine-pulse'}>{drawArt('bombZone', { warn: !armed })}</g>
  </g>
);
```
`Object.assign(window, {...})` export 목록에 `BombZoneSprite` 추가.

- [ ] **Step 4: app.jsx 렌더 + Cell state + 범례** —
  (a) 게임 보드에서 `s.bombs`를 그림. 기존 스프라이트 렌더 루프(예: bullets/its 매핑 부근)에 추가:
```jsx
{(g.bombs || []).map((b, i) => {
  const { x, y } = HX.hc(b.r, b.c);
  return <BombZoneSprite key={`bz${i}`} x={x} y={y} armed={b.armed} />;
})}
```
  (b) Cell 상태 색(선택, [app.jsx:19-31](../../../app.jsx) 류의 state 분기): armed 폭탄 셀에 위험 배경. `GameView`에서 셀 state 계산하는 곳에 `bomb`/`bombArmed` 플래그를 추가하고 Cell에서 `state.bombArmed`면 `fill='#2e1217' stroke='#dc2626'`. (구현 위치는 기존 spike/laser1 state 패턴을 따름.)
  (c) 범례(footer)에 보스 스테이지일 때: `{isStage && (g.bombs || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#dc2626' }}></span>폭탄 장판</div>}`
  (d) `BombZoneSprite`를 app.jsx 상단 `const { ... } = window;` 구조분해에 추가.

- [ ] **Step 5: 검증** — `node --test tests/resources-art.test.mjs` PASS → `npm test` GREEN → `node tests/_babelcheck.mjs` 8 ok → `node tools/extract-sprites.mjs`로 `assets/extracted/bombZone.png` 생성 후 시각 확인(spike/star와 구분되는 위험 타일인지).

- [ ] **Step 6: 커밋**
```bash
git add resources.jsx sprites.jsx app.jsx tests/resources-art.test.mjs
git commit -m "feat(boss): bomb-zone sprite (telegraph/armed) + board render + legend

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 에디터 노출 + 데모 보스 + 최종 검증

**Files:**
- Modify: `editor.jsx` (BOSS_ATKS에 'bomb', mode 선택 UI, BAL_FIELDS boss 3필드), `editor-core.jsx` (buildBalance boss 클램프), `stages.jsx` (보스 id 19 데모 phase)
- Test: `tests/overrides.test.mjs` (boss 섹션 클램프)

- [ ] **Step 1: buildBalance 클램프 테스트(RED)** — `tests/overrides.test.mjs`:
```js
test('buildBalance merges boss section and clamps negatives to 0', () => {
  const b = plain(HXE.buildBalance({ boss: { bombsPerWave: -3, bombLife: 4 } }));
  assert.equal(b.boss.bombsPerWave, 0);
  assert.equal(b.boss.bombLife, 4);
  assert.equal(b.boss.bombTelegraph, 1); // 미지정 기본값
});
```
`node --test tests/overrides.test.mjs` → FAIL.

- [ ] **Step 2: buildBalance 구현** — editor-core.jsx의 코인 클램프 옆에 boss 클램프 추가(코인이 `Object.keys(...DEFAULT_BAL.coin)` 방식이면 동일 패턴):
```js
if (b.boss) Object.keys(window.HX.DEFAULT_BAL.boss).forEach(k => { b.boss[k] = Math.max(0, Number(b.boss[k]) || 0); });
```
`node --test tests/overrides.test.mjs` PASS.

- [ ] **Step 3: 에디터 BAL_FIELDS + BOSS_ATKS + mode UI** — editor.jsx:
  (a) `BAL_FIELDS`에 추가:
```js
['boss', 'bombsPerWave', '폭탄 개수/웨이브', 0, 6, 1],
['boss', 'bombLife', '폭탄 수명(턴)', 0, 6, 1],
['boss', 'bombTelegraph', '폭탄 예고(턴)', 0, 4, 1],
```
  (b) `BOSS_ATKS` 배열([editor.jsx:192](../../../editor.jsx) 부근 `BOSS_ATKS = [...]`)에 `'bomb'` 추가.
  (c) 보스 phase 편집 UI에서 type이 'bomb'일 때 mode(line/diag/scatter) 선택 드롭다운을 노출. 기존 phase 편집 UI 패턴을 따라 `phase.mode`를 set/get(없으면 'scatter' 기본). type이 'bomb'이 아니면 mode UI 숨김.

- [ ] **Step 4: 데모 보스 phase** — stages.jsx 보스 id 19([stages.jsx:295-305](../../../stages.jsx))의 phases를 폭탄 시연이 보이도록 갱신(예: 기존 4 phase 사이에 bomb 3종 삽입), bossTotal을 phases turns 합으로 맞춤:
```js
    phases: [
      { type: 'spread', turns: 4, name: '확산탄' },
      { type: 'bomb', mode: 'line', turns: 4, name: '폭탄 직선' },
      { type: 'converge', turns: 4, name: '조여오기' },
      { type: 'bomb', mode: 'diag', turns: 4, name: '폭탄 대각' },
      { type: 'mark', turns: 4, name: '각인탄' },
      { type: 'bomb', mode: 'scatter', turns: 4, name: '폭탄 무차별' },
      { type: 'spiral', turns: 4, name: '나선탄' },
    ],
```
`bossTotal: 28` (=4×7)로 갱신. tip도 폭탄 언급 추가.

- [ ] **Step 5: 데모 보스 fairness 재확인** — 보스 id 19는 index 18. 기존 fairness 테스트가 idx 18을 seeds 3,9,11 turns 50으로 검증함. bomb phase가 들어갔으니 이 테스트가 자동으로 폭탄 phase를 포함해 돈다. `node --test tests/fairness.test.mjs` → idx 18 케이스 PASS 확인. **실패 시**: 데모 phase의 bomb turns를 줄이거나 mode 순서 조정(메커니즘 자체는 Task 3에서 검증됨 — 여기선 조합 길이 문제일 수 있음). 추가로 idx 18 시드를 3,9,11 외 몇 개 더 확대해도 좋음.

- [ ] **Step 6: 최종 전체 검증** — `npm test` 전체 GREEN(기존 + boss-bomb + fairness + overrides 신규) → `node tests/_babelcheck.mjs` 8 ok → `node tools/shot.mjs`로 보스 스테이지 진입 스크린샷(폭탄 장판 렌더 육안 확인; 셀렉터가 보스까지 못 가면 메뉴/스테이지 1만이라도 정상 확인).

- [ ] **Step 7: 커밋**
```bash
git add editor.jsx editor-core.jsx stages.jsx tests/overrides.test.mjs
git commit -m "feat(boss): editor bomb-phase + mode UI + BAL.boss fields; demo bombs in boss 19

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (스펙 수용 기준)

- 보스 phase `{type:'bomb', mode, turns}` → 해당 mode대로 즉사 장판이 예고→활성→소멸, bomb phase 동안 낙하 탄막 없음.
- 3모드 모두 플레이어 인접 6칸 미배치 + count/life 상한 준수.
- `tests/fairness.test.mjs` bomb 케이스 60시드(200 검증) 0 실패 + 데모 보스 idx 18 통과.
- `npm test` 전체 + `node tests/_babelcheck.mjs` 8/8 통과.
- 에디터에서 bomb 패턴·mode·boss 밸런스 조정 가능.
- 폭탄 예고/활성이 시각 구분 렌더.

## 자기검토 메모

- **스펙 커버리지**: 폭탄 메커니즘(T1)·3모드(T2)·해결 타이밍 mark 선례(T2)·BAL.boss(T1+T5)·통합 5지점(T1,T2,T4,T5)·fairness 스윕(T3)·엔진 단위테스트(T1)·에디터(T5) 모두 태스크 존재. 보스 아바타는 스펙상 범위 밖(스펙2) — 미포함 정상.
- **명명 일관성**: 상태 `s.bombs`, RES `bombZone`, `BombZoneSprite`, phase type `'bomb'`, mode `line|diag|scatter`, BAL `boss.{bombsPerWave,bombLife,bombTelegraph}` — 전 태스크 동일 사용. age 모델(`armed = age>=telegraph`, 제거 `age>=telegraph+life`)도 T1 테스트와 구현 일치.
- **YAGNI**: 기존 패턴 리라이트 없음, mode 자동순환 없음, 아바타 없음 — 전부 범위 밖 명시.
