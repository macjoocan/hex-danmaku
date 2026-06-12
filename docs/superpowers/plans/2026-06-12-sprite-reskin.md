# 스프라이트 전체 리스킨 (전설의검 스타일) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [resources.jsx](../../../resources.jsx)의 픽셀 스프라이트 18종을 8×8 → 16×16(히어로 16×20) 치비+아웃라인+셰이딩 스타일로 전면 교체한다 (스펙: `docs/superpowers/specs/2026-06-12-sprite-reskin-design.md`).

**Architecture:** 그리드+컬러맵 시스템은 그대로 두고 데이터(그리드/맵/px)만 교체. 공용 로더(`tools/res-data.mjs`)로 추출 스크립트와 신규 무결성 테스트가 같은 데이터를 읽는다. 카테고리당 1커밋(캐릭터·적 → 픽업 → 기믹), 각 커밋 전 추출 PNG 시각 확인 + 전체 테스트.

**Tech Stack:** 순수 JS 그리드 데이터, node:test, tools/extract-sprites.mjs(PNG 추출), Playwright(인게임 합성 확인, Task 5만).

**중요 — 시각 루프 규칙 (모든 리드로우 스텝 공통):** 그리드 수정 후 반드시 `node tools/extract-sprites.mjs` 실행 → `assets/extracted/<이름>.png`를 Read 도구로 직접 보고 판단 → 스펙 수용 기준(아웃라인, 2~3단 셰이딩, 표정, 색 정체성, 실루엣 구분)에 못 미치면 수정 반복. 그리드는 이 루프에서 완성하는 것이며 아래 초안/디렉션은 출발점이다.

---

### Task 1: 공용 RES 로더 + 그리드 무결성 테스트

**Files:**
- Create: `tools/res-data.mjs`
- Create: `tests/resources-art.test.mjs`
- Modify: `tools/extract-sprites.mjs` (로더 사용으로 리팩터)

- [ ] **Step 1: 로더 작성** — `tools/res-data.mjs`

```js
/* res-data.mjs — resources.jsx의 순수 JS 구간(그리드/맵/RES)을 평가해 RES를 돌려준다.
 * resources.jsx는 브라우저 전역 JSX 모듈이라 import 불가 — 마커 사이를 잘라 평가한다. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRES() {
  const src = readFileSync(join(root, 'resources.jsx'), 'utf8');
  const start = src.indexOf('// ─── Pixel grids');
  const end = src.indexOf('// ─── drawArt');
  if (start < 0 || end < 0) throw new Error('resources.jsx markers not found — file layout changed?');
  return new Function(`${src.slice(start, end)}; return RES;`)();
}
```

- [ ] **Step 2: extract-sprites.mjs 리팩터** — 파일 상단의 자체 슬라이스 로직(`const src = readFileSync(...)`부터 `const RES = new Function(...)();`까지)을 지우고 로더로 대체:

```js
import { loadRES } from './res-data.mjs';
// ...
const RES = loadRES();
```

`readFileSync` import가 더는 안 쓰이면 정리. 실행 확인: `node tools/extract-sprites.mjs` → 종전과 동일하게 18종 출력.

- [ ] **Step 3: 무결성 테스트 작성** — `tests/resources-art.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRES } from '../tools/res-data.mjs';

const RES = loadRES();
const pixels = Object.entries(RES).filter(([, e]) => e.kind === 'pixel');

// 리스킨이 끝난 키만 여기 추가한다 (Task 2~4에서 카테고리별로 확장)
const EXPECTED_SIZE = {};

test('every pixel grid is rectangular', () => {
  for (const [name, e] of pixels) {
    const w = e.grid[0].length;
    e.grid.forEach((row, i) => assert.equal(row.length, w, `${name} row ${i}: ${row.length} != ${w}`));
  }
});

test('every painted char has a map color', () => {
  for (const [name, e] of pixels) {
    for (const row of e.grid) {
      for (const ch of row) {
        if (ch === '.' || ch === ' ') continue;
        assert.ok(e.map[ch], `${name}: "${ch}" has no color in map`);
      }
    }
  }
});

test('reskinned grids have spec dimensions', () => {
  for (const [name, [w, h]] of Object.entries(EXPECTED_SIZE)) {
    assert.equal(RES[name].grid[0].length, w, `${name} width`);
    assert.equal(RES[name].grid.length, h, `${name} height`);
  }
});
```

- [ ] **Step 4: 테스트 실행** — `npm test` → 기존 68개 + 신규 3개 = **71개 전부 PASS** (무결성 2개는 현재 데이터도 만족해야 정상, EXPECTED_SIZE는 비어 있어 통과).

- [ ] **Step 5: 커밋**

```bash
git add tools/res-data.mjs tools/extract-sprites.mjs tests/resources-art.test.mjs
git commit -m "test: shared RES loader + pixel-grid integrity tests"
```

---

### Task 2: 캐릭터·적 7종 리드로우 (player, drone, droneFz, chaser, bouncer, lunger, turret)

**Files:**
- Modify: `resources.jsx` (HERO/DRONE/CHASER/BOUNCER/LUNGER/TURRET 그리드·맵 + RES의 px/ox/oy)
- Modify: `tests/resources-art.test.mjs` (EXPECTED_SIZE 확장)

- [ ] **Step 1: 실패하는 크기 테스트** — EXPECTED_SIZE에 추가:

```js
const EXPECTED_SIZE = {
  player: [16, 20],
  drone: [16, 16], droneFz: [16, 16], chaser: [16, 16],
  bouncer: [16, 16], lunger: [16, 16], turret: [16, 16],
};
```

- [ ] **Step 2: 실패 확인** — `node --test tests/resources-art.test.mjs` → `reskinned grids have spec dimensions` **FAIL** (현재 8×8/12×15).

- [ ] **Step 3: 드론 리드로우 (예시 초안 — 시각 루프로 완성)**. 새 팔레트(아웃라인=짙은 와인, 3단 램프):

```js
const DRONE_MAP = {
  o: '#4a0d18',                    // outline (deep wine)
  R: '#fb7185', r: '#fda4af',      // body, highlight
  d: '#be123c',                    // shade
  E: '#fff1f2', e: '#1f0a0e',      // eye white, pupil
  w: '#e11d48',                    // accent fin
};
const DRONE_FZ = {
  o: '#0f2f52', R: '#93c5fd', r: '#dbeafe',
  d: '#2563eb', E: '#eff6ff', e: '#0a1a33', w: '#3b82f6',
};
const DRONE = [
  '......oooo......',
  '....oorrrroo....',
  '...orrrRRrrro...',
  '..orRRRRRRRRro..',
  '.orRRRRRRRRRRro.',
  'owRREEEEEEEERRwo',
  'owRREeeEEeeERRwo',
  'oRRREEEEEEEERRRo',
  'oRRRRRRRRRRRRRRo',
  'oRdRRRRRRRRRRdRo',
  '.odRRdddddddRdo.',
  '.oddRRRRRRRRddo.',
  '..oddddddddddo..',
  '...od......do...',
  '....o......o....',
  '................',
];
```

- [ ] **Step 4: 드론 시각 루프** — `node tools/extract-sprites.mjs` → `assets/extracted/drone.png`·`droneFz.png` Read로 확인 → 둥근 실루엣/바이저 눈/아웃라인이 레퍼런스 톤이 될 때까지 수정.

- [ ] **Step 5: 나머지 6종 리드로우 (각각 그리드+맵, 같은 시각 루프).** 아트 디렉션:
  - **player (16×20)**: 현재 컨셉 유지(주황 머리·하늘 튜닉·파란 망토) + 머리 비중 50%(약 10행), 큰 눈 2px, 셰이드 추가. 맵은 기존 HERO_MAP에 셰이드 2색(머리 `#c2410c`, 튜닉 `#0284c7`) 추가.
  - **chaser**: 마젠타 블롭 + 성난 눈썹 V자 눈 + 이빨. 맵: `o '#4a1052', X '#c026d3', H '#f0abfc', d '#86198f', W '#fdf4ff', e '#2e0a33'`.
  - **bouncer**: 시안 다이아몬드 유지 + 중앙에 졸린/무표정 눈. 맵: `o '#0c2f3f', X '#22d3ee', H '#a5f3fc', d '#0e7490', W '#ecfeff', e '#083344'`.
  - **lunger**: 오렌지 화살촉 + 앞을 노려보는 눈(돌격 방향성 강조). 맵: `o '#431407', X '#fb923c', H '#fed7aa', d '#c2410c', W '#fff7ed', e '#27100a'`.
  - **turret**: 기계라 표정 없음. 강철 포신+포구, 리벳 디테일. 맵: `o '#0f172a', G '#64748b', H '#cbd5e1', M '#334155', B '#94a3b8'` + RES의 `warnMap: { B: '#fca5a5' }` 유지.
  - **droneFz**: DRONE 그리드 공유, DRONE_FZ 팔레트만 (기존 구조 그대로).

- [ ] **Step 6: RES 렌더 파라미터 갱신** —

```js
player:  { kind: 'pixel', grid: HERO,  map: HERO_MAP,  px: 1.6, ox: 8, oy: 11 },
drone:   { kind: 'pixel', grid: DRONE, map: DRONE_MAP, px: 1.5 },   // ox/oy 기본값=중앙(8,8)
droneFz: { kind: 'pixel', grid: DRONE, map: DRONE_FZ,  px: 1.5 },
chaser:  { ... px: 1.5 }, bouncer: { ... px: 1.5 }, lunger: { ... px: 1.5 }, turret: { ... px: 1.5 },
```

(ox/oy는 16×16 중앙이 기본이라 제거. player만 발이 셀 중심 근처에 오도록 oy를 중앙(10)보다 +1.)

- [ ] **Step 7: 전체 검증** — `npm test` 71개 PASS + `npm install --no-save @babel/standalone && node tests/_babelcheck.mjs` 8/8 PASS.

- [ ] **Step 8: 커밋**

```bash
git add resources.jsx tests/resources-art.test.mjs
git commit -m "feat(art): reskin characters+enemies to 16x16 chibi style (outline+shading+faces)"
```

---

### Task 3: 픽업 5종 리드로우 (star, bomb, tp, hint, gem)

**Files:**
- Modify: `resources.jsx`, `tests/resources-art.test.mjs`

- [ ] **Step 1: 실패하는 크기 테스트** — EXPECTED_SIZE에 추가:

```js
star: [16, 16], bomb: [16, 16], tp: [16, 16], hint: [16, 16], gem: [16, 16],
```

- [ ] **Step 2: 실패 확인** — `node --test tests/resources-art.test.mjs` → FAIL.

- [ ] **Step 3: 5종 리드로우 (시각 루프).** 아트 디렉션 — 픽업은 표정 없음, 대신 광택 하이라이트로 "먹고 싶게":
  - **star**: 5각 별 + 좌상단 광택. 맵: `o '#7c4a03', X '#fbbf24', H '#fde68a', d '#d97706'`.
  - **gem**: 보석 컷팅 면이 보이는 다이아 + 반짝 점 2개. 맵: `o '#854d0e', X '#fbbf24', H '#fffbeb', d '#ca8a04'`. (star와 실루엣 구분: star=뾰족 5각, gem=팔각 컷)
  - **bomb**: 둥근 폭탄+심지 불꽃. 맵: `o '#064e3b', X '#34d399', H '#a7f3d0', d '#059669', F '#fbbf24', f '#f97316'`.
  - **tp**: 소용돌이 포탈 링. 맵: `o '#4c1d95', X '#c084fc', H '#ede9fe', d '#7e22ce'`.
  - **hint**: 눈동자(망원경 렌즈) 모티프 유지. 맵: `o '#431407', W '#fff7ed', I '#f97316', P '#1c1917', d '#c2410c'`.
  - RES: 5종 모두 `px: 1.5`, `warnStroke: true` 유지, ox/oy 제거(중앙 기본).

- [ ] **Step 4: 시각 확인** — 추출 → 5종 PNG Read. 특히 star vs gem 실루엣이 한눈에 구분되는지.

- [ ] **Step 5: 전체 검증** — `npm test` PASS + `node tests/_babelcheck.mjs` 8/8.

- [ ] **Step 6: 커밋**

```bash
git add resources.jsx tests/resources-art.test.mjs
git commit -m "feat(art): reskin pickups to 16x16 (outline + gloss highlights)"
```

---

### Task 4: 기믹·오브젝트 6종 리드로우 + 벡터 2종 톤 보정

**Files:**
- Modify: `resources.jsx` (portal, spike, pad, mine, beam, explode)
- Modify: `sprites.jsx` (WallSprite/CrackSprite 색상만)
- Modify: `tests/resources-art.test.mjs`

- [ ] **Step 1: 실패하는 크기 테스트** — EXPECTED_SIZE에 추가:

```js
portal: [16, 16], spike: [16, 16], pad: [16, 16],
mine: [16, 16], beam: [16, 16], explode: [16, 16],
```

- [ ] **Step 2: 실패 확인** — `node --test tests/resources-art.test.mjs` → FAIL.

- [ ] **Step 3: 6종 리드로우 (시각 루프).** 아트 디렉션:
  - **portal**: 이중 링+중앙 시안 코어, 소용돌이 결. 맵: `o '#3b0764', X '#6d28d9', H '#a78bfa', W '#ede9fe', I '#22d3ee', d '#5b21b6'`. (`portal-spin` 애니가 도니까 회전 대칭이 어색하지 않게)
  - **spike**: 바닥 베이스 + 삐죽 가시 4~5개, 끝만 밝게. 맵: `o '#450a0a', X '#b91c1c', T '#fca5a5', d '#7f1d1d'`.
  - **pad**: 동쪽(→) 큰 화살표 + 트랙 라인. 맵: `o '#052e16', A '#34d399', H '#bbf7d0', d '#059669'`. **반드시 동쪽 기준으로 그릴 것** (스프라이트가 `PAD_DEG`로 회전).
  - **mine**: 노란 경고 몸체 + 십자 돌기 + 중앙 코어. 맵: `o '#451a03', X '#fbbf24', H '#fde68a', e '#7c2d12', d '#d97706'` + `warnStroke: true` 유지.
  - **beam**: 틸 렌즈 장치, 세로 발사구 강조(세로 컬럼 일격임을 암시). 맵: `o '#042f3c', X '#0e7490', H '#67e8f9', e '#a5f3fc', d '#155e75'`.
  - **explode**: 방사형 버스트 + 흰 코어, 16×16로 더 화려하게. 맵: `X '#ff7a3d', H '#fff7ed', d '#c2410c'` (아웃라인 없음 — 이펙트는 빛이라 예외).
  - RES: 6종 `px: 1.5` (explode/portal은 셀을 더 채우게 `px: 1.7` 시작), mine `warnStroke: true` 유지.

- [ ] **Step 4: 벡터 톤 보정** — [sprites.jsx](../../../sprites.jsx) WallSprite: `#3a3f6e/#565c98` → 새 톤 `#434a85/#6b74b8` (밝기 한 단계 ↑, 아웃라인 대비 ↑). CrackSprite intact: `#2a2440/#6b5e3a` → `#332b4d/#8a7a4d`, broken: 유지. 추출 불가하므로 Task 5 인게임 스크린샷에서 확인.

- [ ] **Step 5: 전체 검증** — `npm test` PASS + `node tests/_babelcheck.mjs` 8/8.

- [ ] **Step 6: 커밋**

```bash
git add resources.jsx sprites.jsx tests/resources-art.test.mjs
git commit -m "feat(art): reskin gimmicks/objects to 16x16 + retone vector wall/crack"
```

---

### Task 5: 인게임 합성 확인 (Playwright 스크린샷) + 배율 튜닝

**Files:**
- Create: `tools/shot.mjs`

- [ ] **Step 1: Playwright 설치 (로컬, no-save)**

```bash
npm install --no-save playwright
npx playwright install chromium
```

- [ ] **Step 2: 스크린샷 스크립트** — `tools/shot.mjs`

```js
/* shot.mjs — 게임을 헤드리스로 띄워 화면별 스크린샷을 찍는다.
 * 선행: 별도 셸에서 `npx serve . -l 3210` 실행 중이어야 함.
 * 사용: node tools/shot.mjs [outDir]   (기본 assets/extracted/shots) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'assets/extracted/shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 860 } });
await page.goto('http://localhost:3210/Hex%20Danmaku.html');
await page.waitForTimeout(2500); // in-browser babel transform
await page.screenshot({ path: `${out}/01-menu.png` });

// 메뉴에서 첫 번째 스테이지로 진입 시도 (버튼 텍스트는 실행 시 실제 DOM에 맞춰 조정)
const start = page.locator('button', { hasText: /시작|start/i }).first();
if (await start.count()) {
  await start.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/02-stage.png` });
}
await browser.close();
console.log(`screenshots → ${out}`);
```

- [ ] **Step 3: 실행 및 확인** — `npx serve . -l 3210` (백그라운드) → `node tools/shot.mjs` → 스크린샷을 Read로 확인. 진입 셀렉터가 안 맞으면 `01-menu.png`에서 실제 버튼을 보고 스크립트 수정. 체크리스트:
  - 스프라이트가 헥스 셀을 60% 내외로 채우고 서로 겹치지 않는가 (답답하면 해당 RES `px`만 ±0.1 조정)
  - 워닝 글로우(빨강), 프로즌 팔레트(파랑 드론), pad 회전, 벽/크랙 새 톤 정상인가
  - 다크 아웃라인 덕에 어두운 보드에서 실루엣이 또렷한가

- [ ] **Step 4: 배율 튜닝 반영** — Step 3에서 조정한 `px` 값을 resources.jsx에 확정, 재추출·재촬영으로 재확인.

- [ ] **Step 5: 최종 전체 검증** — `npm test` 71개 PASS + `node tests/_babelcheck.mjs` 8/8 PASS.

- [ ] **Step 6: 커밋**

```bash
git add resources.jsx tools/shot.mjs
git commit -m "feat(art): in-game screenshot tool + final scale tuning for reskin"
```

---

## 완료 기준 (스펙 수용 기준과 동일)

- 18종 모두 16×16(히어로 16×20), 보드에서 실루엣·색 정체성 한눈에 구분
- 전 스프라이트 아웃라인+2~3단 셰이딩, 살아있는 5종(player/drone/chaser/bouncer/lunger) 표정
- `npm test` 71개 + JSX 체크 8/8 통과, 에디터에서 새 그리드 편집 가능(에디터는 그리드 크기 동적 — 수정 불필요 확인됨, [editor.jsx:155-165](../../../editor.jsx))
- 인게임 스크린샷에서 warn/프로즌/pad 회전/벡터 톤 정상
