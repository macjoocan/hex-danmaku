# 확장팩 1탄 "심화 기믹" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 24 스테이지에 새 탄막 움직임·적 AI·필드 기믹·보스 패턴을 레지스트리 주도로 추가하고, 스테이지 6곳을 리워크한다.

**Architecture:** `engine.jsx`·`stages.jsx`는 순수 JS이므로 Node `vm` 하니스로 TDD한다. 탄은 `vc`/`bounce`/`fuse` 필드로 움직임을 데이터화하고, 적은 `ENEMY_KINDS` 테이블, 신규 기믹은 헬퍼 + `GIMMICKS` 메타로, 보스는 `bossAtk` case로 확장한다. 모든 신규 메커니즘은 "항상 회피 가능" 불변식을 단위 테스트로 보장한다.

**Tech Stack:** React 18 UMD + Babel-in-browser (no build), SVG 렌더링, `node:test` + `node:vm` (의존성 0) 테스트.

> **자매 서브프로젝트 — 인게임 에디터.** 별도 스펙([docs/superpowers/specs/2026-05-31-editor-design.md](../specs/2026-05-31-editor-design.md))으로 분리됨.
> 빌드 순서: **이 플랜의 Phase 1~6(엔진 메커니즘) → 에디터 전체 → 이 플랜의 Phase 7(스테이지 리워크)**.
> Phase 7의 6곳 리워크는 코드 직접 편집 대신 **에디터로 배치·튜닝·공정성 검증** 후 export JSON을 `stages.jsx`에 반영하는 흐름을 권장한다(에디터 완성 후). 에디터를 먼저 만들지 않기로 하면 Phase 7은 계획대로 데이터 직접 편집으로 진행해도 무방하다.

> 이 게임은 git 저장소가 아니다(`Is a git repository: false`). 각 Task의 "Commit" 스텝은 **`git init`을 먼저 한 경우에만** 적용된다. git을 쓰지 않으면 Commit 스텝은 건너뛰고, 대신 각 Task 종료 시 테스트 초록을 게이트로 삼는다. 첫 작업 전 사용자에게 `git init` 여부를 확인할 것.

---

## File Structure

| 파일 | 책임 | 생성/수정 |
|------|------|-----------|
| `tests/harness.mjs` | vm 샌드박스 로더 + 시드 PRNG + `baseState` 헬퍼 | 생성 |
| `tests/regression.test.mjs` | 현행 동작 고정 (hd/safest/stepToward/tick/bossAtk/ping) | 생성 |
| `tests/bullets.test.mjs` | 탄 움직임 (vc/bounce/fuse) | 생성 |
| `tests/enemies.test.mjs` | 적 AI (chase/bounce/lunge) | 생성 |
| `tests/gimmicks.test.mjs` | crack/pad | 생성 |
| `tests/boss.test.mjs` | bossAtk 신규 4종 + 패턴 스폰 일반화 | 생성 |
| `tests/fairness.test.mjs` | 공정성 불변식 (매 턴 안전 셀 존재) | 생성 |
| `engine.jsx` | 탄 이동/충돌 일반화, `ENEMY_KINDS`/`GIMMICKS`, 패턴 스폰 일반화, crack/pad 헬퍼 | 수정 |
| `stages.jsx` | `bossAtk` 4 case, `D` import, 리워크 6곳, `initStage` cracks/pads | 수정 |
| `resources.jsx` | `RES` 신규 5종 | 수정 |
| `sprites.jsx` | 신규 스프라이트 5종 | 수정 |
| `app.jsx` | 신규 배열·텔레그래프·범례·렌더 우선순위·미리보기 | 수정 |
| `styles.css` | 신규 애니메이션 | 수정 |
| `package.json` | `test` 스크립트 (없으면 생성) | 생성/수정 |
| `docs/hex-danmaku-dev.md` | 신규 메커니즘 문서화 | 수정 |

---

## Phase 1 — 테스트 하니스 + 회귀 (현행 고정)

### Task 1: 테스트 하니스

**Files:**
- Create: `tests/harness.mjs`
- Create/Modify: `package.json`

- [ ] **Step 1: 하니스 작성**

`tests/harness.mjs`:

```js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Mulberry32 — deterministic PRNG so Math.random is reproducible in tests
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Load engine.jsx + stages.jsx into one sandboxed context.
// They are pure JS (no JSX/React); they only touch `window`.
export function loadGame({ seed = 1 } = {}) {
  const win = {};
  const sandboxMath = Object.create(Math); // inherits sqrt/floor/PI..., own random
  sandboxMath.random = makeRng(seed);
  const sandbox = { window: win, Math: sandboxMath, console };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['engine.jsx', 'stages.jsx']) {
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return {
    HX: win.HX,
    HXS: win.HXS,
    setSeed: (s) => { sandboxMath.random = makeRng(s); },
  };
}

// Minimal full game state for tick() tests — override what you need.
export function baseState(HX, over = {}) {
  return { ...HX.initState(), ...over };
}
```

- [ ] **Step 2: package.json test 스크립트**

`package.json` (없으면 생성):

```json
{
  "name": "hex-danmaku",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

> 주의: `"type": "module"`은 `.mjs` 테스트에만 영향을 준다. 브라우저는 `.jsx`를 `<script type="text/babel">`로 직접 로드하므로 무관하다.

- [ ] **Step 3: 하니스 동작 확인용 임시 스크립트 실행**

Run: `node -e "import('./tests/harness.mjs').then(m=>{const {HX}=m.loadGame();console.log(typeof HX.tick, HX.C, HX.R)})"`
Expected: `function 7 11`

- [ ] **Step 4: Commit** *(git init 한 경우만)*

```bash
git add tests/harness.mjs package.json
git commit -m "test: add vm harness for engine/stages"
```

---

### Task 2: 회귀 테스트 (현행 동작 고정)

**Files:**
- Create: `tests/regression.test.mjs`

- [ ] **Step 1: 회귀 테스트 작성**

`tests/regression.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

test('hd: same cell = 0, adjacency = 1', () => {
  const { HX } = loadGame();
  assert.equal(HX.hd(3, 3, 3, 3), 0);
  assert.equal(HX.hd(0, 0, 0, 1), 1);   // east neighbor
  assert.equal(HX.hd(0, 0, 1, 0), 1);   // SW neighbor (even row)
});

test('tick: straight bullet falls one row, no spawn when si high', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 3 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c); // stay
  assert.deepEqual(n.bl, [{ r: 6, c: 3 }]);
});

test('tick: bullet off bottom is removed', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: HX.R - 1, c: 2 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.bl.length, 0);
});

test('tick: stepping onto a bullet = game over', () => {
  const { HX } = loadGame();
  // player at (10,3); bullet currently at neighbor (9,3) won't be there after move,
  // so place a bullet at the destination's pre-move cell to trigger stepIn.
  const s = baseState(HX, { pl: { r: 10, c: 3 }, bl: [{ r: 9, c: 3 }], si: 99 });
  const n = HX.tick(s, 9, 3); // move up onto current bullet
  assert.equal(n.ov, true);
});

test('safest returns a cell maximizing distance from bullets', () => {
  const { HX } = loadGame();
  const bl = [{ r: 0, c: 0 }];
  const best = HX.safest(bl, { r: 5, c: 3 }, []);
  assert.ok(best && HX.hd(best.r, best.c, 0, 0) >= 5);
});

test('ping moves by exactly 1 each step and stays in range', () => {
  const { HXS } = loadGame();
  // ping is internal; assert via sweepGap safe column drift instead.
  const stage = { type: 'boss', phases: [{ type: 'sweepGap', turns: 99, name: 'g' }] };
  let prev = null;
  for (let w = 0; w < 12; w++) {
    const p = HXS.pickPattern(stage, w, { bossWaves: w, pl: { r: 5, c: 3 } });
    const safe = [0,1,2,3,4,5,6].filter(c => !p.c.includes(c)); // gap column(s)
    assert.equal(safe.length, 1, `wave ${w} should leave exactly 1 safe column`);
    if (prev != null) assert.ok(Math.abs(safe[0] - prev) <= 1, `safe col jumped at wave ${w}`);
    prev = safe[0];
  }
});

test('bossAtk aimed targets player column ±1', () => {
  const { HXS } = loadGame();
  const stage = { type: 'boss', phases: [{ type: 'aimed', turns: 99 }] };
  const p = HXS.pickPattern(stage, 0, { bossWaves: 0, pl: { r: 5, c: 3 } });
  assert.deepEqual(p.c, [2, 3, 4]);
});
```

- [ ] **Step 2: 실행 → 전부 통과 확인**

Run: `npm test`
Expected: PASS (모든 회귀 테스트 통과). 실패하면 현행 코드 이해가 틀린 것이니 테스트를 코드 실제 동작에 맞춰 수정.

- [ ] **Step 3: Commit** *(git)*

```bash
git add tests/regression.test.mjs
git commit -m "test: lock current engine behavior (regression)"
```

---

## Phase 2 — 탄막 움직임 일반화 (vc / bounce / fuse)

### Task 3: 탄 이동·충돌·스폰 일반화

**Files:**
- Create: `tests/bullets.test.mjs`
- Modify: `engine.jsx` (탄 이동 블록 167-199 부근, 충돌 285, 스폰 180-198)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/bullets.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

test('drift bullet moves down-and-sideways, keeps vc', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 3, vc: 1 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.deepEqual(n.bl[0], { r: 6, c: 4, vc: 1 });
});

test('bounce bullet reflects at the right edge', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { bl: [{ r: 5, c: 6, vc: 1, bounce: true }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.deepEqual(n.bl[0], { r: 6, c: 5, vc: -1, bounce: true });
});

test('fuse bullet counts down, stays in place, not lethal while fuse>0', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 4, c: 3 }, bl: [{ r: 3, c: 3, fuse: 2 }], si: 99 });
  const n = HX.tick(s, 3, 3); // move onto it while it is still a telegraph
  assert.equal(n.ov, false);
  assert.equal(n.bl[0].fuse, 1);
  assert.deepEqual({ r: n.bl[0].r, c: n.bl[0].c }, { r: 3, c: 3 });
});

test('fuse bullet is lethal on the turn fuse reaches 0', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 4, c: 3 }, bl: [{ r: 3, c: 3, fuse: 1 }], si: 99 });
  const n = HX.tick(s, 3, 3); // fuse 1 -> 0 this turn, player on it
  assert.equal(n.ov, true);
});

test('fuse bullet is removed the turn after detonation', () => {
  const { HX } = loadGame();
  const s = baseState(HX, { pl: { r: 10, c: 0 }, bl: [{ r: 3, c: 3, fuse: 0 }], si: 99 });
  const n = HX.tick(s, s.pl.r, s.pl.c); // fuse 0 -> -1 -> filtered
  assert.equal(n.bl.length, 0);
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- tests/bullets.test.mjs` (또는 `node --test tests/bullets.test.mjs`)
Expected: FAIL (drift는 vc 무시되어 `{r:6,c:3}`; fuse는 그냥 낙하).

- [ ] **Step 3: 탄 이동 블록 교체 (engine.jsx)**

`engine.jsx`에서 현재 (170-178 부근):

```js
  } else {
    mv = s.bl
      .map(b => ({ r: b.r + 1, c: b.c }))
      .filter(b => b.r < R && !block.some(w => w.r === b.r && w.c === b.c));
    fz = 0;
```

를 다음으로 교체:

```js
  } else {
    mv = s.bl
      .map(b => {
        if (b.fuse != null) return { ...b, fuse: b.fuse - 1 }; // timed mine: counts down in place
        let vc = b.vc || 0;
        let nc = b.c + vc;
        if (b.bounce && (nc < 0 || nc >= C)) { vc = -vc; nc = b.c + vc; } // reflect at edge
        const out = { ...b, r: b.r + 1, c: nc };
        if (vc) out.vc = vc; // keep vc only if non-zero (clean equality in tests)
        return out;
      })
      .filter(b =>
        b.fuse != null
          ? b.fuse >= 0                                       // detonated (fuse 0) kept this turn, removed next
          : (b.r < R && b.c >= 0 && b.c < C && !block.some(w => w.r === b.r && w.c === b.c)));
    fz = 0;
```

- [ ] **Step 4: 충돌 판정 fuse 분기 (engine.jsx 285 부근)**

현재:

```js
  const hitBullet = mv.some(b => b.r === finalR && b.c === finalC);
```

교체:

```js
  const hitBullet = mv.some(b =>
    b.r === finalR && b.c === finalC && (b.fuse == null || b.fuse === 0));
```

- [ ] **Step 5: 스폰 일반화 — vc/cells (engine.jsx 180-186 부근)**

현재 spawn 본문:

```js
    if (si <= 0 && !bossDone) {
      const goalR = s.goal ? s.goal.r : -99;
      const goalC = s.goal ? s.goal.c : -99;
      const cols = s.np.c.filter(c =>
        !block.some(w => w.r === 0 && w.c === c) && !(goalR === 0 && c === goalC));
      mv = [...mv, ...cols.map(c => ({ r: 0, c }))];
      if (s.np.laser) s.np.laser.forEach(c => spawnedLasers.push({ c, charge: 2 }));
      ln = s.np.n;
```

교체:

```js
    if (si <= 0 && !bossDone) {
      const goalR = s.goal ? s.goal.r : -99;
      const goalC = s.goal ? s.goal.c : -99;
      if (s.np.cells) {
        // explicit cells (e.g., mark mines) — may carry fuse/vc
        mv = [...mv, ...s.np.cells
          .filter(cell => cell.r >= 0 && cell.r < R && cell.c >= 0 && cell.c < C
            && !block.some(w => w.r === cell.r && w.c === cell.c))
          .map(cell => ({ ...cell }))];
      } else {
        const cols = s.np.c.filter(c =>
          !block.some(w => w.r === 0 && w.c === c) && !(goalR === 0 && c === goalC));
        mv = [...mv, ...cols.map(c => (s.np.vc != null ? { r: 0, c, vc: s.np.vc } : { r: 0, c }))];
      }
      if (s.np.laser) s.np.laser.forEach(c => spawnedLasers.push({ c, charge: 2 }));
      if (s.np.summon) spawnedEnemies.push({ ...s.np.summon });
      ln = s.np.n;
```

- [ ] **Step 6: `spawnedEnemies` 선언 추가 (engine.jsx 167 부근, `spawnedLasers` 옆)**

현재:

```js
  const spawnedLasers = [];
```

교체:

```js
  const spawnedLasers = [];
  const spawnedEnemies = [];
```

> `spawnedEnemies` 병합은 Task 6(enemy 이동 블록)에서 처리한다. 이 Task 시점엔 summon 패턴이 없어 항상 빈 배열이므로 무해하다.

- [ ] **Step 7: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS (bullets + 기존 회귀 모두 통과).

- [ ] **Step 8: Commit** *(git)*

```bash
git add engine.jsx tests/bullets.test.mjs
git commit -m "feat(engine): generalize bullet motion (vc/bounce/fuse) + cells/vc/summon spawn"
```

---

## Phase 3 — 적 AI 레지스트리 (chase / bounce / lunge)

### Task 4: `ENEMY_KINDS` + 헬퍼 (REFLECT, pickFace)

**Files:**
- Modify: `engine.jsx` (`stepToward` 아래에 추가)

- [ ] **Step 1: 헬퍼 + 레지스트리 추가 (engine.jsx, `stepToward` 정의 직후 139행 부근)**

```js
// direction index opposites: [W,E,NW,NE,SW,SE] -> reflect
const REFLECT = [1, 0, 5, 4, 3, 2];
const LUNGE_WINDUP = 1; // turns telegraphing before a dash
const LUNGE_DASH = 2;   // hexes moved per dash

// pick the neighbor-direction index that most reduces distance to the player
const pickFace = (e, ctx) => {
  const dirs = D(e.r);
  let best = 1, bd = 999;
  for (let i = 0; i < dirs.length; i++) {
    const r = e.r + dirs[i][0], c = e.c + dirs[i][1];
    if (r < 0 || r >= R || c < 0 || c >= C) continue;
    const d = hd(r, c, ctx.player.r, ctx.player.c);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

const ENEMY_KINDS = {
  // half-speed greedy homing (existing behavior)
  chase: {
    step: (e, ctx) => {
      if (ctx.t % 2 !== 1) return;
      const p = stepToward(e, ctx.player, ctx.block, ctx.others);
      e.r = p.r; e.c = p.c;
    },
  },
  // constant-direction straight line, reflects off walls/edges
  bounce: {
    step: (e, ctx) => {
      if (e.dir == null) e.dir = 1; // default east
      const tryMove = (dir) => {
        const [dr, dc] = D(e.r)[dir];
        const r = e.r + dr, c = e.c + dc;
        const blocked = r < 0 || r >= R || c < 0 || c >= C
          || ctx.block.some(w => w.r === r && w.c === c)
          || ctx.others.some(o => o.r === r && o.c === c);
        return blocked ? null : { r, c };
      };
      let nxt = tryMove(e.dir);
      if (!nxt) { e.dir = REFLECT[e.dir]; nxt = tryMove(e.dir); }
      if (nxt) { e.r = nxt.r; e.c = nxt.c; }
    },
  },
  // wind up (telegraph) then dash several hexes toward the player
  lunge: {
    step: (e, ctx) => {
      if (e.cd == null) e.cd = LUNGE_WINDUP;
      if (e.cd > 0) { e.cd -= 1; e.face = pickFace(e, ctx); return; }
      for (let i = 0; i < LUNGE_DASH; i++) {
        const [dr, dc] = D(e.r)[e.face];
        const r = e.r + dr, c = e.c + dc;
        if (r < 0 || r >= R || c < 0 || c >= C
          || ctx.block.some(w => w.r === r && w.c === c)) break;
        e.r = r; e.c = c;
        ctx.passed.push({ r, c }); // mid-dash cells are lethal too
      }
      e.cd = LUNGE_WINDUP;
    },
    // cells the dash will sweep next turn (for the renderer warning lane)
    telegraph: (e) => {
      if (e.cd !== 0 || e.face == null) return [];
      const cells = []; let r = e.r, c = e.c;
      for (let i = 0; i < LUNGE_DASH; i++) {
        const [dr, dc] = D(r)[e.face]; r += dr; c += dc;
        if (r < 0 || r >= R || c < 0 || c >= C) break;
        cells.push({ r, c });
      }
      return cells;
    },
  },
};
```

- [ ] **Step 2: export에 추가 (engine.jsx `Object.assign(window, { HX: {...} })`)**

`safest, tryItem, stepToward, tick,` 줄을 다음으로 확장:

```js
    safest, tryItem, stepToward, tick,
    ENEMY_KINDS, pickFace,
```

- [ ] **Step 3: 실행 → 회귀 여전히 통과 (아직 tick은 미사용)**

Run: `npm test`
Expected: PASS (행동 변화 없음 — 레지스트리만 추가됨).

- [ ] **Step 4: Commit** *(git)*

```bash
git add engine.jsx
git commit -m "feat(engine): add ENEMY_KINDS registry (chase/bounce/lunge)"
```

---

### Task 5: 적 이동 블록을 레지스트리 디스패치로 교체

**Files:**
- Create: `tests/enemies.test.mjs`
- Modify: `engine.jsx` (적 이동 블록 261-268, summon 병합, 충돌 286)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/enemies.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

const survive = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('chase moves only on odd turns (half speed)', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 10, c: 3 }, enemies: [{ r: 5, c: 3, kind: 'chase' }] });
  const n1 = HX.tick(s, s.pl.r, s.pl.c);   // t 0 -> 1; moved this turn? guard checks s.t(0)%2 -> no move
  assert.deepEqual({ r: n1.enemies[0].r, c: n1.enemies[0].c }, { r: 5, c: 3 });
  const n2 = HX.tick(n1, n1.pl.r, n1.pl.c); // s.t now 1 -> moves
  assert.ok(n2.enemies[0].r > 5);
});

test('bounce moves every turn and reflects at the edge', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 0, c: 0 }, enemies: [{ r: 5, c: 6, kind: 'bounce', dir: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  // east from (5,6) is out of range -> reflect to west -> (5,5)
  assert.deepEqual({ r: n.enemies[0].r, c: n.enemies[0].c, dir: n.enemies[0].dir }, { r: 5, c: 5, dir: 0 });
});

test('lunge telegraphs (cd=0, no move) then dashes', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 9, c: 3 }, enemies: [{ r: 4, c: 3, kind: 'lunge' }] });
  const n1 = HX.tick(s, s.pl.r, s.pl.c); // windup: cd -> 0, no move
  assert.equal(n1.enemies[0].cd, 0);
  assert.deepEqual({ r: n1.enemies[0].r, c: n1.enemies[0].c }, { r: 4, c: 3 });
  assert.ok(HX.ENEMY_KINDS.lunge.telegraph(n1.enemies[0]).length > 0); // lane shown
  const n2 = HX.tick(n1, n1.pl.r, n1.pl.c); // dash
  assert.ok(n2.enemies[0].r > 4);           // moved downward toward player
  assert.equal(n2.enemies[0].cd, LUNGE_WINDUP_OR_1(n2)); // reset
});

// LUNGE_WINDUP is 1 in engine; reset value after a dash is 1.
function LUNGE_WINDUP_OR_1() { return 1; }

test('standing on a summoned/standing enemy cell = game over', () => {
  const { HX } = loadGame();
  const s = survive(HX, { t: 0, pl: { r: 6, c: 3 }, enemies: [{ r: 5, c: 3, kind: 'bounce', dir: 1 }] });
  // move onto the enemy's current cell (5,3) is NE of (6,3) on even row 6: NE=[-1,0] -> (5,3)
  const n = HX.tick(s, 5, 3);
  assert.equal(n.ov, true); // stepEnemy
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- tests/enemies.test.mjs`
Expected: FAIL (bounce/lunge 미동작 — 아직 chase 하드코딩).

- [ ] **Step 3: 적 이동 블록 교체 (engine.jsx 260-268 부근)**

현재:

```js
  // ── enemies chase player's final cell (half-speed: every other turn) ──
  if (s.fz <= 0 && enemies.length && (s.t % 2 === 1)) {
    const moved = [];
    for (const e of enemies) {
      const np2pos = stepToward(e, { r: finalR, c: finalC }, block, moved);
      e.r = np2pos.r; e.c = np2pos.c;
      moved.push(e);
    }
  }
```

교체:

```js
  // ── enemies act via ENEMY_KINDS registry; freeze pauses them ──
  const dashCells = []; // cells swept by lunge dashes this turn (lethal)
  if (s.fz <= 0 && enemies.length) {
    const moved = [];
    const ctx = { t: s.t, player: { r: finalR, c: finalC }, block, others: moved, passed: dashCells };
    for (const e of enemies) {
      (ENEMY_KINDS[e.kind] || ENEMY_KINDS.chase).step(e, ctx);
      moved.push(e);
    }
  }
  // merge boss-summoned adds AFTER movement (they don't act on spawn turn)
  if (spawnedEnemies.length) enemies = [...enemies, ...spawnedEnemies];
```

- [ ] **Step 4: 충돌에 dash 경로 포함 (engine.jsx 286 부근)**

현재:

```js
  const hitEnemy = enemies.some(e => e.r === finalR && e.c === finalC);
```

교체:

```js
  const hitEnemy = enemies.some(e => e.r === finalR && e.c === finalC)
    || dashCells.some(p => p.r === finalR && p.c === finalC);
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS (enemies + 전체 통과).

- [ ] **Step 6: Commit** *(git)*

```bash
git add engine.jsx tests/enemies.test.mjs
git commit -m "feat(engine): dispatch enemies via ENEMY_KINDS; lunge dash collision; summon merge"
```

---

## Phase 4 — 필드 기믹 (crack / pad)

### Task 6: crack/pad 헬퍼 + GIMMICKS 메타 + tick 통합

**Files:**
- Create: `tests/gimmicks.test.mjs`
- Modify: `engine.jsx` (block 구성 153, finalR/C 초기화 213, 반환 306, GIMMICKS 추가, initState)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/gimmicks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

const stage = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('crack breaks when the player leaves it', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, cracks: [{ r: 6, c: 3, broken: false }] });
  const n = HX.tick(s, 5, 3); // move off the crack (NE on even row 6)
  assert.equal(n.cracks[0].broken, true);
});

test('a broken crack blocks movement onto it', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, cracks: [{ r: 5, c: 3, broken: true }] });
  const n = HX.tick(s, 5, 3); // (5,3) is broken -> blocked -> state unchanged
  assert.equal(n, s);
});

test('a broken crack blocks falling bullets', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 10, c: 0 }, bl: [{ r: 4, c: 3 }], cracks: [{ r: 5, c: 3, broken: true }] });
  const n = HX.tick(s, s.pl.r, s.pl.c); // bullet would fall to (5,3) -> blocked -> removed
  assert.equal(n.bl.length, 0);
});

test('pad pushes the player one hex in its direction', () => {
  const { HX } = loadGame();
  // pad at (5,3) pushing east (dir 1); player steps onto it from (6,3)
  const s = stage(HX, { pl: { r: 6, c: 3 }, pads: [{ r: 5, c: 3, dir: 1 }] });
  const n = HX.tick(s, 5, 3); // NE onto pad, then pushed east
  // (5,3) east on odd row 5: [0,1] -> (5,4)
  assert.deepEqual(n.pl, { r: 5, c: 4 });
});

test('pad does not push into a wall (stays on pad)', () => {
  const { HX } = loadGame();
  const s = stage(HX, { pl: { r: 6, c: 3 }, pads: [{ r: 5, c: 3, dir: 1 }], walls: [{ r: 5, c: 4 }] });
  const n = HX.tick(s, 5, 3);
  assert.deepEqual(n.pl, { r: 5, c: 3 });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- tests/gimmicks.test.mjs`
Expected: FAIL (cracks/pads 미처리).

- [ ] **Step 3: GIMMICKS 메타 + block 구성 (engine.jsx 150-154 부근)**

현재:

```js
  const walls = s.walls || [];
  const turrets = s.turrets || [];
  const spikes = s.spikes || [];
  const block = turrets.length ? [...walls, ...turrets] : walls;
  if (!stay && block.some(w => w.r === nr && w.c === nc)) return s; // blocked by wall/turret
```

교체:

```js
  const walls = s.walls || [];
  const turrets = s.turrets || [];
  const spikes = s.spikes || [];
  const cracks = s.cracks || [];
  const pads = s.pads || [];
  const brokenCracks = cracks.filter(cr => cr.broken);
  const block = [...walls, ...turrets, ...brokenCracks];
  if (!stay && block.some(w => w.r === nr && w.c === nc)) return s; // blocked by wall/turret/hole
```

GIMMICKS 메타 테이블은 `stepToward`/`ENEMY_KINDS` 인근에 선언(문서·미래 통합용):

```js
// declarative terrain/hazard properties. crack/pad logic uses small helpers below;
// existing wall/turret/spike handling is unchanged in vol.1.
const GIMMICKS = {
  wall:   { blocksMove: true,  blocksBullet: true,  lethal: false },
  turret: { blocksMove: true,  blocksBullet: true,  lethal: false },
  spike:  { blocksMove: false, blocksBullet: false, lethal: true },
  crack:  { blocksMove: 'whenBroken', blocksBullet: 'whenBroken', lethal: false },
  pad:    { blocksMove: false, blocksBullet: false, lethal: false, push: true },
};
```

export에 `GIMMICKS` 추가 (engine.jsx export 블록):

```js
    ENEMY_KINDS, pickFace, GIMMICKS,
```

- [ ] **Step 4: pad 밀기 (engine.jsx 213 `let finalR = nr, finalC = nc;` 직후)**

현재:

```js
  // ── items / gems ──
  let finalR = nr, finalC = nc;
```

교체:

```js
  // ── pad: shove one hex before any item/gem/collision resolves (once, no chaining) ──
  let finalR = nr, finalC = nc;
  if (!stay) {
    const padAt = pads.find(p => p.r === finalR && p.c === finalC);
    if (padAt) {
      const [pdr, pdc] = D(finalR)[padAt.dir];
      const pr = finalR + pdr, pc = finalC + pdc;
      if (pr >= 0 && pr < R && pc >= 0 && pc < C && !block.some(w => w.r === pr && w.c === pc)) {
        finalR = pr; finalC = pc;
      }
    }
  }
  // ── items / gems ──
```

> 메모: 필드 아이템 획득은 기존대로 `nr/nc`로 판정한다(엔드리스 전용이라 pad와 공존하지 않음). gem·충돌·승리는 `finalR/finalC`(밀린 칸)를 쓰므로 일관적이다.

- [ ] **Step 5: crack 붕괴 + 반환 (engine.jsx 반환 객체 306 부근)**

반환 직전에 newCracks 계산을 추가하고, 반환 객체에 `cracks`를 명시한다. 반환 `return { ...s, ... }` 위에:

```js
  // crack collapses when the player leaves it
  let newCracks = cracks;
  if (!stay) {
    const left = cracks.find(cr => cr.r === s.pl.r && cr.c === s.pl.c && !cr.broken);
    if (left) newCracks = cracks.map(cr => (cr === left ? { ...cr, broken: true } : cr));
  }
```

반환 객체에서 `gems,` 다음 줄 등 적당한 위치에 추가:

```js
    cracks: newCracks,
```

(`pads`는 `...s`로 그대로 전달되어 변경 불필요.)

- [ ] **Step 6: initState에 cracks/pads (engine.jsx initState)**

`gems: [],` 다음에:

```js
  cracks: [],
  pads: [],
```

- [ ] **Step 7: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit** *(git)*

```bash
git add engine.jsx tests/gimmicks.test.mjs
git commit -m "feat(engine): crack (breakable floor) + pad (conveyor) gimmicks"
```

---

## Phase 5 — 보스 패턴 (spiral / summon / mark / drift)

### Task 7: bossAtk 신규 4종

**Files:**
- Create: `tests/boss.test.mjs`
- Modify: `stages.jsx` (`D` import 5행, `bossAtk` switch 22-75)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/boss.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

const atk = (HXS, type, w, extra = {}) =>
  HXS.pickPattern({ type: 'boss', phases: [{ type, turns: 99, ...extra }] },
    w, { bossWaves: w, pl: { r: 5, c: 3 } });

test('spiral leaves rotating safe columns that drift <=1 per wave', () => {
  const { HXS } = loadGame();
  let prev = null;
  for (let w = 0; w < 14; w++) {
    const p = atk(HXS, 'spiral', w);
    const safe = [0,1,2,3,4,5,6].filter(c => !p.c.includes(c)).sort((a,b)=>a-b);
    assert.ok(safe.length >= 1, `wave ${w} has no safe column`);
    if (prev) assert.ok(safe.some(c => prev.some(q => Math.abs(c - q) <= 1)),
      `wave ${w} safe set jumped`);
    prev = safe;
  }
});

test('drift fires columns with a sideways velocity', () => {
  const { HXS } = loadGame();
  const p = atk(HXS, 'drift', 0);
  assert.ok(Array.isArray(p.c) && p.c.length > 0);
  assert.ok(p.vc === 1 || p.vc === -1);
});

test('mark returns telegraph cells with fuse=1', () => {
  const { HXS } = loadGame();
  const p = atk(HXS, 'mark', 0);
  assert.ok(Array.isArray(p.cells) && p.cells.length > 0);
  assert.ok(p.cells.every(c => c.fuse === 1));
});

test('summon spawns a bounce add on even waves, filler shot on odd', () => {
  const { HXS } = loadGame();
  const even = atk(HXS, 'summon', 0);
  assert.ok(even.summon && even.summon.kind === 'bounce');
  const odd = atk(HXS, 'summon', 1);
  assert.ok(!odd.summon && Array.isArray(odd.c) && odd.c.length > 0);
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- tests/boss.test.mjs`
Expected: FAIL (default case가 `{n:'산탄', c:[1,3,5]}` 반환).

- [ ] **Step 3: `D` import 추가 (stages.jsx 5행)**

현재:

```js
const { C, R, PAT } = window.HX;
```

교체:

```js
const { C, R, PAT, D } = window.HX;
```

- [ ] **Step 4: bossAtk에 4 case 추가 (stages.jsx, `default:` 직전)**

```js
    case 'spiral': {
      // rotating "comb": every 3rd column (offset by ping) is safe; safe set drifts 1/wave
      const ph = ping(w);
      return { n: atk.name || '나선탄', c: allCols.filter(c => (((c - ph) % 3) + 3) % 3 !== 0) };
    }
    case 'drift': {
      // diagonal volley: alternating comb with a sideways velocity
      const cols = (w % 2) ? [1, 3, 5] : [0, 2, 4, 6];
      return { n: atk.name || '사선 포화', c: cols, vc: (w % 2) ? 1 : -1 };
    }
    case 'mark': {
      // telegraph the player's cell + neighbors as fuse mines (detonate next wave)
      const pr = s.pl.r, pc = s.pl.c;
      const spots = [{ r: pr, c: pc }, ...D(pr).map(([dr, dc]) => ({ r: pr + dr, c: pc + dc }))]
        .filter(p => p.r >= 0 && p.r < R && p.c >= 0 && p.c < C);
      return { n: atk.name || '각인탄', cells: spots.map(p => ({ ...p, fuse: 1 })) };
    }
    case 'summon': {
      // even waves: spawn a bouncer from a top corner; odd waves: light aimed shot (caps adds)
      if (w % 2 === 1) return { n: atk.name || '소환', c: [clampC(s.pl.c)] };
      const left = (w % 4) === 0;
      return { n: atk.name || '소환', c: [], summon: { r: 1, c: left ? 0 : C - 1, kind: 'bounce', dir: left ? 1 : 0 } };
    }
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit** *(git)*

```bash
git add stages.jsx tests/boss.test.mjs
git commit -m "feat(stages): boss attacks spiral/drift/mark/summon"
```

---

## Phase 6 — 아트 · 스프라이트 · 렌더링

> 이 Phase는 단위 테스트 대상이 아니라 **브라우저 실행으로 시각 검증**한다. 각 Task 종료 시 `Hex Danmaku.html`을 정적 서버로 열어 확인한다(`npx serve .`).

### Task 8: 신규 아트 (resources.jsx)

**Files:**
- Modify: `resources.jsx` (픽셀 그리드/맵 + `RES` 테이블)

- [ ] **Step 1: 픽셀 그리드/맵 추가 (resources.jsx, 기존 그리드 정의 구역)**

```js
// Bouncer enemy (sharp diamond, distinct from the magenta chaser blob)
const BOUNCER_MAP = { o: '#0c2a3a', X: '#22d3ee', H: '#a5f3fc', e: '#0e7490' };
const BOUNCER = [
  '...XX...', '..XHHX..', '.XHXXHX.', 'XHXeeXHX',
  'XHXeeXHX', '.XHXXHX.', '..XHHX..', '...XX...',
];

// Lunger enemy (arrow-like charger)
const LUNGER_MAP = { o: '#3a1a0a', X: '#fb923c', H: '#fed7aa', e: '#7c2d12' };
const LUNGER = [
  '...XX...', '..XHHX..', '.XHHHHX.', 'XHHeeHHX',
  'XHHHHHHX', '.XXHHXX.', '..X..X..', '.X....X.',
];

// Conveyor pad arrow (drawn pointing east at dir 1; rotated per dir in the sprite)
const PAD_MAP = { o: '#1e3a2a', A: '#34d399', H: '#bbf7d0' };
const PAD = [
  '........', '...A....', '...AA...', 'AAAAAAH.',
  'AAAAAAH.', '...AA...', '...A....', '........',
];

// Fuse mine (telegraph marker, pulses while armed)
const MINE_MAP = { o: '#3a0a14', X: '#fbbf24', H: '#fde68a', e: '#7c2d12' };
const MINE = [
  '..o..o..', '.oXXXXo.', 'oXHHHHXo', 'oXHeeHXo',
  'oXHeeHXo', 'oXHHHHXo', '.oXXXXo.', '..o..o..',
];
```

- [ ] **Step 2: `RES` 테이블 항목 추가 (resources.jsx RES 객체)**

`chaser:` 줄 아래 등에 추가:

```js
  bouncer: { kind: 'pixel', grid: BOUNCER, map: BOUNCER_MAP, px: 2.5 },
  lunger:  { kind: 'pixel', grid: LUNGER,  map: LUNGER_MAP,  px: 2.5 },
  pad:     { kind: 'pixel', grid: PAD,     map: PAD_MAP,     px: 2.4 },
  mine:    { kind: 'pixel', grid: MINE,    map: MINE_MAP,    px: 2.4, warnStroke: true },
  // crack is vector (drawn in the sprite by broken state)
  crack:   { kind: 'vector' },
```

- [ ] **Step 3: 시각 확인** — 브라우저에서 콘솔 오류 없는지 (아직 미사용이라 화면 변화 없음).

- [ ] **Step 4: Commit** *(git)*

```bash
git add resources.jsx
git commit -m "feat(art): add bouncer/lunger/pad/mine/crack registry entries"
```

---

### Task 9: 신규 스프라이트 컴포넌트 (sprites.jsx)

**Files:**
- Modify: `sprites.jsx`

- [ ] **Step 1: 컴포넌트 추가 (sprites.jsx, 기존 컴포넌트 구역)**

```js
// Bouncer — pixel diamond + shadow + spin
const BouncerSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#06121f" opacity="0.4" />
    <g className="chaser-pulse">{drawArt('bouncer')}</g>
  </g>
);

// Lunger — pixel + shadow; charging class when about to dash
const LungerSprite = ({ x, y, charging }) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#2a1206" opacity="0.4" />
    <g className={charging ? 'lunger-charge' : undefined}>{drawArt('lunger')}</g>
  </g>
);

// Conveyor pad — arrow rotated to its direction
// dir index [W,E,NW,NE,SW,SE] -> approx degrees (art points east=0deg)
const PAD_DEG = [180, 0, -120, -60, 120, 60];
const PadSprite = ({ x, y, dir = 1 }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g transform={`rotate(${PAD_DEG[dir] || 0})`}>{drawArt('pad')}</g>
  </g>
);

// Fuse mine telegraph
const MineSprite = ({ x, y, armed }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g className={armed ? 'mine-armed' : 'mine-pulse'}>{drawArt('mine', { warn: armed })}</g>
  </g>
);

// Breakable floor — intact (cracked lines) vs broken (hole)
const CrackSprite = ({ x, y, broken }) => {
  const { hp, SZ } = window.HX;
  if (broken) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <path d={hp(x, y, SZ - 2)} fill="#0a0c1c" stroke="#2a2e58" strokeWidth="2" strokeLinejoin="miter" />
        <path d={hp(x, y, SZ - 7)} fill="#05060f" />
      </g>
    );
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      <path d={hp(x, y, SZ - 3)} fill="#2a2440" stroke="#6b5e3a" strokeWidth="1.5" strokeDasharray="3 2" strokeLinejoin="miter" />
      <path d={`M${x - 8},${y - 6} L${x + 2},${y + 1} L${x - 3},${y + 8}`} fill="none" stroke="#6b5e3a" strokeWidth="1" />
    </g>
  );
};
```

- [ ] **Step 2: export 추가 (sprites.jsx `Object.assign(window, {...})`)**

```js
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite,
```

- [ ] **Step 3: 시각 확인** — 콘솔 오류 없는지.

- [ ] **Step 4: Commit** *(git)*

```bash
git add sprites.jsx
git commit -m "feat(sprites): bouncer/lunger/pad/mine/crack components"
```

---

### Task 10: 보드 렌더링 통합 (app.jsx + styles.css)

**Files:**
- Modify: `app.jsx` (import, memo 셋, 셀 상태, 스프라이트 레이어, 범례)
- Modify: `styles.css` (애니메이션)

- [ ] **Step 1: import 추가 (app.jsx 상단 구조분해)**

`SpikeSprite, TurretSprite,` 다음에:

```js
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite,
```

- [ ] **Step 2: blockSet에 broken crack 포함 + pad/crack/lunge 텔레그래프 memo (app.jsx, 기존 memo 구역)**

```js
  const crackSet = useMemo(() =>
    new Set((g.cracks || []).filter(c => c.broken).map(c => `${c.r},${c.c}`)), [g.cracks]);
  // existing blockSet:  add broken cracks so move-preview + bullets respect holes
  // find the blockSet useMemo and include crackSet:
  // const blockSet = useMemo(() => { const s = new Set(wallSet); turretSet.forEach(k=>s.add(k)); crackSet.forEach(k=>s.add(k)); return s; }, [wallSet, turretSet, crackSet]);

  const padSet = useMemo(() =>
    new Set((g.pads || []).map(p => `${p.r},${p.c}`)), [g.pads]);

  // fuse mines live inside g.bl; split armed (fuse===0) vs telegraph (fuse>0)
  const mineMap = useMemo(() => {
    const m = new Map();
    g.bl.forEach(b => { if (b.fuse != null) m.set(`${b.r},${b.c}`, b.fuse); });
    return m;
  }, [g.bl]);

  // lunge dash lanes (warning) from enemies about to dash
  const lungeWarn = useMemo(() => {
    const set = new Set();
    (g.enemies || []).forEach(e => {
      if (e.kind === 'lunge') {
        (HX.ENEMY_KINDS.lunge.telegraph(e) || []).forEach(p => set.add(`${p.r},${p.c}`));
      }
    });
    return set;
  }, [g.enemies]);
```

> `blockSet` useMemo 한 줄을 위 주석대로 `crackSet` 포함하도록 수정한다.

- [ ] **Step 3: 셀 상태에 신규 위험/기믹 반영 (app.jsx Cell state 객체)**

`bulletSet.has(k)`는 fuse 텔레그래프 칸을 치명 탄으로 표시하면 안 된다. 셀 상태 빌드에서:

```js
    const mineFuse = mineMap.get(k);            // undefined | 0 | >0
    const isArmedMine = mineFuse === 0;          // lethal this turn
    const isTeleMine = mineFuse > 0;             // telegraph only
    const st = {
      player, dead: player && g.ov,
      bullet: bulletSet.has(k) && !isTeleMine,   // telegraph mines aren't "bullet" red
      // ...existing fields...
      danger: dangerSet.has(k) || lungeWarn.has(k) || isTeleMine,
      // ...
      crack: crackSet.has(k),                    // broken hole
      pad: padSet.has(k),
    };
```

`Cell`의 fill 우선순위(app.jsx 18-31)에 추가 — `state.spike` 분기 인근:

```js
  else if (state.crack) { fill = '#05060f'; stroke = '#2a2e58'; strokeW = 1.8; }
  else if (state.pad) { fill = '#13402c'; stroke = '#34d399'; strokeW = 1.6; }
```

- [ ] **Step 4: 스프라이트 레이어 렌더 (app.jsx `<g style={{pointerEvents:'none'}}>` 내부)**

벽 렌더 위/아래 적절한 z-순서로 추가. cracks·pads는 바닥이므로 walls 앞(먼저)에, mines/enemies는 탄막 구역에:

```js
            {(g.cracks || []).map((cr, i) => { const { x, y } = hc(cr.r, cr.c); return <CrackSprite key={`cr-${i}`} x={x} y={y} broken={cr.broken} />; })}

            {(g.pads || []).map((p, i) => { const { x, y } = hc(p.r, p.c); return <PadSprite key={`pad-${i}`} x={x} y={y} dir={p.dir} />; })}
```

탄막 렌더 부분(`g.bl.map(...)`)을 fuse 분기로 교체:

```js
            {g.bl.map((b, i) => {
              const k = `${b.r},${b.c}`; if (xCells.has(k)) return null;
              const { x, y } = hc(b.r, b.c);
              if (b.fuse != null) return <MineSprite key={`b-${i}`} x={x} y={y} armed={b.fuse === 0} />;
              return <BulletSprite key={`b-${i}`} x={x} y={y} fz={g.fz > 0} />;
            })}
```

적 렌더(`g.enemies.map(...)`)를 kind 분기로 교체:

```js
            {(g.enemies || []).map((en, i) => {
              const { x, y } = hc(en.r, en.c);
              if (en.kind === 'bounce') return <BouncerSprite key={`e-${i}`} x={x} y={y} />;
              if (en.kind === 'lunge')  return <LungerSprite key={`e-${i}`} x={x} y={y} charging={en.cd === 0} />;
              return <ChaserSprite key={`e-${i}`} x={x} y={y} />;
            })}
```

- [ ] **Step 5: 범례 추가 (app.jsx legend 구역)**

```js
          {isStage && (g.cracks || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#2a2440' }}></span>부서지는 발판</div>}
          {isStage && (g.pads || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#34d399' }}></span>컨베이어</div>}
```

- [ ] **Step 6: styles.css 애니메이션 추가**

```css
@keyframes lungerCharge { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
.lunger-charge { animation: lungerCharge 0.4s ease-in-out infinite; transform-origin: center; }
@keyframes minePulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.mine-pulse { animation: minePulse 0.7s ease-in-out infinite; }
.mine-armed { animation: minePulse 0.2s ease-in-out infinite; }
```

- [ ] **Step 7: 시각 확인** — 임시 디버그로 `HXS.initStage` 대신 cracks/pads/enemies가 든 상태를 만들어 렌더 확인하거나, Phase 7 리워크 후 확인.

- [ ] **Step 8: Commit** *(git)*

```bash
git add app.jsx styles.css
git commit -m "feat(render): cracks/pads/mines/new-enemies on board + legend + telegraphs"
```

---

## Phase 7 — 스테이지 리워크 + 공정성 테스트

### Task 11: initStage에 cracks/pads 초기화

**Files:**
- Modify: `stages.jsx` (`initStage`)

- [ ] **Step 1: 초기화 추가 (stages.jsx initStage base 객체, `gems:` 인근)**

```js
    cracks: (def.cracks || []).map(cr => ({ ...cr, broken: false })),
    pads: (def.pads || []).map(p => ({ ...p })),
```

- [ ] **Step 2: 실행 → 회귀 통과 (기존 스테이지 무변화)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit** *(git)*

```bash
git add stages.jsx
git commit -m "feat(stages): init cracks/pads from stage defs"
```

---

### Task 12: 공정성 불변식 테스트 (선행 게이트)

**Files:**
- Create: `tests/fairness.test.mjs`

- [ ] **Step 1: 공정성 헬퍼 + 테스트 작성**

`tests/fairness.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

// from any non-terminal state, at least one action (stay or a neighbor move)
// leads to a state where the player is NOT game over.
function hasSafeMove(HX, s) {
  const options = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
  return options.some(o => {
    if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) return false;
    const n = HX.tick(s, o.r, o.c);
    return n === s ? false : !n.ov; // blocked move (n===s) doesn't count
  });
}

// drive a stage for N turns always picking a safe move; assert one always exists.
function survivable(HX, HXS, idx, turns, seed = 7) {
  let s = HXS.initStage(idx);
  for (let i = 0; i < turns && !s.win && !s.ov; i++) {
    assert.ok(hasSafeMove(HX, s), `stage ${idx} turn ${s.t}: no safe move`);
    // take the first safe option deterministically
    const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
    let moved = false;
    for (const o of opts) {
      if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
      const n = HX.tick(s, o.r, o.c);
      if (n !== s && !n.ov) { s = n; moved = true; break; }
    }
    assert.ok(moved, `stage ${idx} turn ${s.t}: failed to advance`);
  }
}

for (const type of ['spiral', 'drift', 'mark', 'summon']) {
  test(`boss attack ${type} always leaves a safe move`, () => {
    const { HX, HXS } = loadGame({ seed: 11 });
    const stage = { type: 'boss', interval: 2, bossTotal: 30,
      phases: [{ type, turns: 30, name: type }] };
    let s = { ...HX.initState(), mode: 'stage', stage, stageIdx: 0,
      obj: { type: 'boss' }, si: 1 };
    s.np = HXS.pickPattern(stage, 0, s);
    s.np2 = HXS.pickPattern(stage, 1, { ...s, bossWaves: 1 });
    for (let i = 0; i < 25 && !s.ov && !s.win; i++) {
      assert.ok(hasSafeMove(HX, s), `${type} turn ${s.t}: no safe move`);
      const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
      for (const o of opts) {
        if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
        const n = HX.tick(s, o.r, o.c);
        if (n !== s && !n.ov) { s = n; break; }
      }
    }
  });
}
```

- [ ] **Step 2: 실행 → 신규 보스 패턴 공정성 확인**

Run: `npm test -- tests/fairness.test.mjs`
Expected: PASS. 실패하면 해당 `bossAtk` case를 조정(예: `drift`가 특정 시드에서 막히면 발사 열 수를 줄이거나 vc 부호 교대 방식을 완화). **테스트가 통과할 때까지 패턴을 튜닝**한다.

- [ ] **Step 3: Commit** *(git)*

```bash
git add tests/fairness.test.mjs stages.jsx
git commit -m "test: fairness invariant for new boss attacks (tune until green)"
```

---

### Task 13: 일반 스테이지 4곳 리워크 (5/8/10/12)

**Files:**
- Modify: `stages.jsx` (`STAGES` 항목 5, 8, 10, 12)

- [ ] **Step 1: 스테이지 5 — 부서지는 발판 도입**

`STAGES` id 5 항목에 `cracks` 추가(기존 walls 유지). 통로 보장을 위해 발판은 분산 배치:

```js
    spikes: undefined, // (없으면 생략)
    cracks: [{ r: 7, c: 1 }, { r: 7, c: 5 }, { r: 5, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 4 }],
```

`tip`도 갱신:

```js
    tip: '◇ 발판은 한 번 밟고 떠나면 무너집니다. 길을 미리 계획하세요.',
```

- [ ] **Step 2: 스테이지 8 — 반사체 적 추가**

id 8 `enemies`를 교체:

```js
    enemies: [{ r: 1, c: 0, kind: 'chase' }, { r: 5, c: 6, kind: 'bounce', dir: 0 }],
    tip: '추적자 + 반사체. 반사체는 직선으로 튕겨다니니 경로를 읽으세요.',
```

- [ ] **Step 3: 스테이지 10 — 컨베이어 도입**

id 10에 `pads` 추가(기존 walls/enemies 유지):

```js
    pads: [{ r: 6, c: 2, dir: 1 }, { r: 4, c: 4, dir: 0 }],
    tip: '벽·추적자에 더해 ⇒ 컨베이어가 당신을 밀어냅니다. 화살표를 보고 착지 칸을 계산하세요.',
```

- [ ] **Step 4: 스테이지 12 — 돌격수 도입**

id 12 `enemies` 중 하나를 lunge로 교체:

```js
    enemies: [{ r: 1, c: 0, kind: 'chase' }, { r: 1, c: 6, kind: 'lunge' }],
    tip: '추적자 + 돌격수. 돌격수는 충전 후 직선 돌진합니다(레인 경고).',
```

- [ ] **Step 5: 공정성 테스트에 일반 스테이지 추가**

`tests/fairness.test.mjs` 하단에:

```js
for (const idx of [4, 7, 9, 11]) { // STAGES indexes for ids 5,8,10,12
  test(`stage index ${idx} is survivable for many turns`, () => {
    const { HX, HXS } = loadGame({ seed: 5 });
    survivable(HX, HXS, idx, 30);
  });
}
```

> 참고: `STAGES`는 0-기반 인덱스. id 5 → index 4, id 8 → 7, id 10 → 9, id 12 → 11.

- [ ] **Step 6: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS. 실패 시 기믹 배치를 조정(통로 확보)한 뒤 재실행.

- [ ] **Step 7: 브라우저 시각 검증** — 5/8/10/12 진입해 발판 붕괴·반사체·컨베이어·돌격수 동작 확인.

- [ ] **Step 8: Commit** *(git)*

```bash
git add stages.jsx tests/fairness.test.mjs
git commit -m "feat(stages): rework 5/8/10/12 with crack/bounce/pad/lunge"
```

---

### Task 14: 보스 2곳 리워크 (11/19)

**Files:**
- Modify: `stages.jsx` (`STAGES` 항목 11, 19)

- [ ] **Step 1: 스테이지 11 (포격수) — summon + drift 페이즈**

id 11 `phases`/`bossTotal` 교체:

```js
    id: 11, type: 'boss', name: 'BOSS · 포격수', sub: '공격을 견뎌라',
    interval: 2, bossTotal: 22,
    phases: [
      { type: 'aimed', turns: 5, name: '조준 사격' },
      { type: 'sweep', turns: 5, name: '휩쓸기' },
      { type: 'pincer', turns: 4, name: '협공' },
      { type: 'summon', turns: 4, name: '소환' },
      { type: 'drift', turns: 4, name: '사선 포화' },
    ],
    tip: '5단계. 조준→휩쓸기→협공→소환(반사체)→사선 포화.',
```

- [ ] **Step 2: 스테이지 19 (포식자) — mark + spiral 페이즈**

id 19 `phases`/`bossTotal` 교체:

```js
    id: 19, type: 'boss', name: 'BOSS · 포식자', sub: '새로운 공격',
    interval: 2, bossTotal: 20,
    phases: [
      { type: 'spread', turns: 5, name: '확산탄' },
      { type: 'converge', turns: 5, name: '조여오기' },
      { type: 'mark', turns: 5, name: '각인탄' },
      { type: 'spiral', turns: 5, name: '나선탄' },
    ],
    tip: '확산→조임→각인(지연 폭발)→나선. 예고된 칸을 비키세요.',
```

- [ ] **Step 3: 공정성 테스트에 보스 11/19 추가**

`tests/fairness.test.mjs`의 일반 스테이지 루프 아래에:

```js
for (const idx of [10, 18]) { // STAGES indexes for ids 11, 19
  test(`boss stage index ${idx} is survivable through its waves`, () => {
    const { HX, HXS } = loadGame({ seed: 9 });
    survivable(HX, HXS, idx, 60);
  });
}
```

- [ ] **Step 4: 실행 → 통과 확인**

Run: `npm test`
Expected: PASS. 실패 시 페이즈 turns/구성 조정.

- [ ] **Step 5: 브라우저 시각 검증** — 11/19 클리어 가능한지 플레이.

- [ ] **Step 6: Commit** *(git)*

```bash
git add stages.jsx tests/fairness.test.mjs
git commit -m "feat(stages): rework bosses 11/19 with summon/drift/mark/spiral"
```

---

## Phase 8 — 문서

### Task 15: 개발 문서 갱신

**Files:**
- Modify: `docs/hex-danmaku-dev.md`

- [ ] **Step 1: 신규 메커니즘 반영**

다음을 추가/갱신:
- §4 상태 구조: `cracks`, `pads`, 탄 필드 `vc`/`bounce`/`fuse`, 적 `kind`/`dir`/`cd`/`face`.
- §6 패턴: 패턴이 `vc`/`cells`/`summon`/`laser`를 가질 수 있음.
- §8 보스 공격: `spiral`/`summon`/`mark`/`drift` 행 추가.
- §9 기믹 표: 부서지는 발판(`crack`)·컨베이어(`pad`) 행 추가.
- 신규 §: 적 AI 레지스트리(`ENEMY_KINDS`)·기믹 메타(`GIMMICKS`)·테스트(`tests/`) 설명.
- §13 알려진 이슈: pad와 아이템 픽업 셀 차이(엔드리스 미공존), 보스 승리 시 잔존 add 무시.

- [ ] **Step 2: 함수 요약(§19) 갱신** — `ENEMY_KINDS`, `pickFace`, `GIMMICKS` 추가.

- [ ] **Step 3: Commit** *(git)*

```bash
git add docs/hex-danmaku-dev.md
git commit -m "docs: document expansion pack 1 mechanics"
```

---

## Self-Review 결과 (작성자 점검)

**Spec coverage:** 스펙 §3(탄 3종)→Task3, §4(적 2종)→Task4-5, §5(기믹 2종)→Task6, §6(보스 4종)→Task7, §7(리워크 6곳)→Task13-14, §8(아트/렌더)→Task8-10, §9(검증)→Task2/12, §2.1(테스트 먼저)→Task1. 누락 없음.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. `tip: spikes: undefined` 같은 표기는 "있으면 생략"으로 명시.

**Type consistency:** 탄 필드 `vc`/`bounce`/`fuse`, 패턴 `cells`/`vc`/`summon`, 적 `kind`/`dir`/`cd`/`face`, 상태 `cracks`(`{r,c,broken}`)/`pads`(`{r,c,dir}`), `ENEMY_KINDS[kind].step(e, ctx)`·`telegraph(e)`, `ctx={t,player,block,others,passed}` — 전 Task에서 일관.

**알려진 튜닝 포인트:** `drift`/`spiral`의 공정성은 구성상 100% 보장이 아니라 Task12 공정성 테스트가 게이트. 시드 의존 실패 시 발사 열을 줄이는 방향으로 튜닝(테스트에 명시됨).
