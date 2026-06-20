# 아트 리소스 데이터/코드 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `resources.jsx`의 아트 데이터(그리드·색맵·RES 레지스트리)를 순수 데이터 파일 `art-data.js`로 분리하고, 로직(`px`/`drawArt`/`isImage`)만 `resources.jsx`에 남긴다. 렌더·오버라이드·테스트 동작은 불변 (스펙: `docs/superpowers/specs/2026-06-21-art-data-split-design.md`).

**Architecture:** `art-data.js`(함수 0, JSX 0)가 모든 그리드/맵 상수 + `RES`를 정의하고 `window.HXR_DATA = { RES }`로 노출. `resources.jsx`는 `const { RES } = window.HXR_DATA`로 읽어 기존과 동일한 `window.HXR = { RES, drawArt, px, isImage }` API를 제공. RES 객체 참조 동일성이 유지되어 오버라이드 레이어(editor-core)는 무변경.

**Tech Stack:** 브라우저 전역 JS/JSX(빌드 없음), node:test + vm 하니스, `tools/res-data.mjs`(공용 RES 로더).

## Global Constraints

- `art-data.js`는 **순수 데이터**: 함수 0, JSX 0. 일반 `<script>`로 로드(babel 우회). `window.HXR_DATA = { RES }` 노출.
- 로드 순서: `art-data.js`가 `resources.jsx`보다 **먼저** (HTML·shot.mjs·vm 하니스 모두).
- **오버라이드/변경 레이어(editor-core.jsx)·렌더 동작·import/export는 코드 변경 없이 동일하게 동작**. RES 객체 참조 동일성 유지.
- 그리드/맵 상수의 소비자는 RES뿐 — 외부 노출 불필요(art-data.js 내부 지역 const).
- 범위: **아트(RES)만**. STAGES/BAL/PAT 외부화·JSON/fetch·원격 업데이트·오버라이드 재설계는 범위 밖.
- 검증 게이트: `npm test`(107 + 신규 가드) + `node tests/_babelcheck.mjs` 8/8 + extract-sprites/shot 정상 + 인게임 렌더 육안 불변.

## 핵심 코드 지형 (실측)

- `resources.jsx`: 1-45 레지스트리 포맷 doc 주석 · 47-68 `px`(로직) · **70(`// ─── Pixel grids + color maps`) ~ 677 직전 = 그리드/맵 상수 + `RES` 레지스트리(데이터)** · 677-703 `drawArt`/`707 `isImage`(로직) · 709 `window.HXR = { RES, drawArt, px, isImage }`.
- `tools/res-data.mjs`: 현재 resources.jsx를 `// ─── Pixel grids`~`// ─── drawArt` 마커로 잘라 `new Function(...)`로 eval → `loadRES()` 반환. extract-sprites + resources-art 테스트가 사용.
- `tools/shot.mjs`: HTML의 `type="text/babel" src=` JSX들을 node에서 transpile해 자급자족 HTML로 인라인(CDN → transpiled jsx 순).
- `tests/harness.mjs` `loadEditor`: `win.HXR = { RES: { player:{kind:'pixel',px:2.4}, drone:{kind:'pixel',px:2.3} } }`로 **RES를 2종 stub** 후 editor-core.jsx 로드.
- `editor-core.jsx`: `BASE_RES = {...window.HXR.RES}` 스냅샷 → `applyResOverrides` deep-merge → `applyOverrides`가 `window.HXR.RES`를 in-place 갱신. RES만 의존(drawArt 등 미사용).
- `Hex Danmaku.html`: CDN(react/react-dom/babel) → `<script type="text/babel" src="engine.jsx">` … `resources.jsx` … 순.

---

### Task 1: 데이터 분리 — art-data.js 생성 + resources.jsx 슬림화 + 로더/HTML/shot 갱신

**Files:**
- Create: `art-data.js`
- Modify: `resources.jsx` (데이터 제거, HXR_DATA에서 RES 읽기)
- Modify: `tools/res-data.mjs` (art-data.js 평가)
- Modify: `Hex Danmaku.html` (art-data.js 스크립트 추가)
- Modify: `tools/shot.mjs` (art-data.js 인라인)

**Interfaces:**
- Produces: `window.HXR_DATA = { RES }` (art-data.js); `window.HXR = { RES, drawArt, px, isImage }` (resources.jsx, RES === HXR_DATA.RES 동일 참조); `loadRES()` (res-data.mjs, art-data.js 기반).

- [ ] **Step 1: art-data.js 생성** — `resources.jsx`의 **70행(`// ─── Pixel grids + color maps`)부터 RES 레지스트리 끝(677행 `// ─── drawArt` 직전)까지**의 블록 전체(모든 그리드 상수·색맵 상수·`const RES = {...}`)를 그대로 잘라 `art-data.js`로 옮긴다. 상단에 레지스트리 포맷 설명 doc 주석(resources.jsx 1-45)도 함께 이동. 파일 맨 끝에 노출 추가:
```js
// 데이터/로직 분리: 렌더 로직(px/drawArt/isImage)은 resources.jsx에 있음. 여기는 순수 데이터.
window.HXR_DATA = { RES };
```
art-data.js에는 함수·JSX가 없어야 한다(px/drawArt/isImage는 옮기지 않음).

- [ ] **Step 2: resources.jsx 슬림화** — 데이터 블록(70~677 직전)을 제거하고, `px`(47-68)와 `drawArt`/`isImage`(677-707)만 남긴다. 파일 상단(px 정의 앞)에 RES를 데이터에서 읽는 줄 추가:
```js
// 아트 데이터(그리드·색맵·RES)는 art-data.js 참조. 여기는 렌더 로직만.
const { RES } = window.HXR_DATA;
```
맨 끝 export는 그대로 유지: `window.HXR = { RES, drawArt, px, isImage };` (RES는 HXR_DATA.RES와 동일 참조).

- [ ] **Step 3: res-data.mjs 로더 교체** — 마커 슬라이싱 대신 art-data.js를 통째로 평가:
```js
/* res-data.mjs — art-data.js(순수 데이터)를 평가해 RES를 돌려준다. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRES() {
  const src = readFileSync(join(root, 'art-data.js'), 'utf8');
  const win = {};
  new Function('window', src)(win); // art-data.js가 window.HXR_DATA = { RES } 할당
  if (!win.HXR_DATA || !win.HXR_DATA.RES) throw new Error('art-data.js did not set window.HXR_DATA.RES');
  return win.HXR_DATA.RES;
}
```

- [ ] **Step 4: HTML 스크립트 추가** — `Hex Danmaku.html`에서 `<script type="text/babel" src="resources.jsx"></script>` **줄 바로 앞**에 일반 스크립트 추가(plain `<script>`는 babel 스크립트보다 먼저 실행됨):
```html
  <script src="art-data.js"></script>
```

- [ ] **Step 5: shot.mjs 인라인** — `tools/shot.mjs`에서 transpiled jsx를 인라인하기 직전에 art-data.js(원본, transpile 불필요)를 인라인. `page1` 배열의 `...cdnUrls.map(...)` 다음, `...transpiled.map(...)` 앞에 추가:
```js
  `<script>\n${readFileSync(join(root, 'art-data.js'), 'utf8')}\n</script>`,
```
(`readFileSync`/`join`/`root`는 shot.mjs에 이미 import/정의됨.)

- [ ] **Step 6: 검증** —
  - `node --test tests/resources-art.test.mjs` → PASS(loadRES가 art-data.js 기반으로 모든 RES 엔트리·EXPECTED_SIZE 검증; 데이터 누락/오타면 여기서 실패).
  - `node tools/extract-sprites.mjs` → 모든 스프라이트 PNG 정상 생성(개수·크기 종전과 동일).
  - `npm test` → 107 GREEN(엔진/스테이지/오버라이드 무영향 — editor-core·loadEditor는 이 태스크에서 안 건드림).
  - `node tests/_babelcheck.mjs` → 8 ok(resources.jsx 여전히 JSX 대상; art-data.js는 babelcheck 목록에 없음 — 순수 JS).

- [ ] **Step 7: 커밋**
```bash
git add art-data.js resources.jsx tools/res-data.mjs "Hex Danmaku.html" tools/shot.mjs
git commit -m "refactor(art): split RES data into art-data.js (pure data) from resources.jsx logic

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: vm 하니스 실제 RES 사용 + 데이터 순수성 가드 테스트

**Files:**
- Modify: `tests/harness.mjs` (`loadEditor`가 art-data.js 로드 → 실제 RES)
- Modify: `tests/resources-art.test.mjs` (데이터 순수성/키 커버리지 가드 + 로직-누수 가드)

**Interfaces:**
- Consumes: `art-data.js`(window.HXR_DATA.RES), `loadRES()`(res-data.mjs).

- [ ] **Step 1: 가드 테스트 추가(RED 가능)** — `tests/resources-art.test.mjs` 상단 import에 fs/path 추가가 필요하면 추가하고, 테스트 추가:
```js
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ART_DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'art-data.js');

test('art-data.js exposes RES with all expected entries', () => {
  const res = loadRES();
  for (const k of ['player', 'drone', 'star', 'gem', 'bombZone', 'bossOverlord', 'wall', 'crack'])
    assert.ok(res[k], `RES missing ${k}`);
});

test('art-data.js is pure data — RES contains no functions', () => {
  const res = loadRES();
  const hasFn = (v) => typeof v === 'function'
    || (v && typeof v === 'object' && Object.values(v).some(hasFn));
  assert.equal(hasFn(res), false, 'RES data must contain no functions');
});

test('art-data.js contains no render logic (px/drawArt stay in resources.jsx)', () => {
  const src = readFileSync(ART_DATA, 'utf8');
  assert.ok(!/\bdrawArt\b/.test(src), 'drawArt leaked into art-data.js');
  assert.ok(!/\bconst\s+px\s*=/.test(src), 'px renderer leaked into art-data.js');
});
```
`node --test tests/resources-art.test.mjs` → art-data.js가 Task 1에서 생성됐으면 PASS(이 태스크는 Task 1 이후). 만약 art-data.js가 없으면(잘못된 순서) FAIL로 즉시 드러남.

- [ ] **Step 2: loadEditor가 실제 RES 사용** — `tests/harness.mjs` `loadEditor`에서 stub 줄
```js
  win.HXR = { RES: { player: { kind: 'pixel', px: 2.4 }, drone: { kind: 'pixel', px: 2.3 } } };
```
을 art-data.js 로드로 교체(engine/stages 로드 다음, editor-core 로드 앞):
```js
  vm.runInContext(`(function(){\n${readFileSync(join(ROOT, 'art-data.js'), 'utf8')}\n})();`, ctx, { filename: 'art-data.js' });
  win.HXR = { RES: win.HXR_DATA.RES };
```
(art-data.js는 IIFE 안에서 `window.HXR_DATA = {RES}`를 ctx의 window=win에 할당. 그 뒤 win.HXR.RES를 실제 RES로 세팅 → editor-core의 BASE_RES 스냅샷·in-place 갱신이 실제 데이터로 동작.)

- [ ] **Step 3: 검증** —
  - `node --test tests/resources-art.test.mjs` → 신규 3 가드 PASS.
  - `node --test tests/overrides.test.mjs` → PASS(loadEditor가 실제 RES로 바뀌어도 applyResOverrides/import/export 테스트가 그대로 통과; 깨지면 실제 RES와 stub의 차이를 드러낸 것이므로 테스트 기대값을 실제 RES 기준으로 정정).
  - `npm test` → 전체 GREEN(107 + 신규 3 = 110).
  - `node tests/_babelcheck.mjs` → 8 ok.

- [ ] **Step 4: 커밋**
```bash
git add tests/harness.mjs tests/resources-art.test.mjs
git commit -m "test(art): loadEditor uses real RES from art-data.js + data-purity guards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (스펙 수용 기준)

- `resources.jsx`에 그리드/맵/RES 데이터가 없고, `art-data.js`가 `window.HXR_DATA.RES`로 노출한다.
- `resources.jsx`가 `window.HXR_DATA.RES`를 읽어 동일한 `window.HXR` API를 제공한다.
- 게임 렌더·에디터 리소스 변경·import/export가 분리 전과 동일하게 동작한다(육안 + 기존 테스트).
- `npm test`(110) + `node tests/_babelcheck.mjs` 8/8 통과, extract-sprites/shot 정상.
- art-data.js는 순수 데이터(함수 없음), 일반 `<script>`로 로드된다.

## 자기검토 메모

- **스펙 커버리지**: 분리 구조(T1 S1-2), 로드 순서(T1 S4 HTML), 오버라이드 무변경(editor-core 미수정 — T1/T2 어디서도 안 건드림), 툴링 갱신(T1 S3 res-data, S5 shot; T2 loadEditor), 가드 테스트(T2 S1), 마이그레이션 안전성(resources-art가 누락/오타 검출) — 전부 태스크 있음.
- **명명 일관성**: `window.HXR_DATA = { RES }`(art-data.js), `const { RES } = window.HXR_DATA`(resources.jsx), `loadRES()`(art-data.js 평가), `loadEditor`가 `win.HXR_DATA.RES` 사용 — 전 태스크 동일.
- **인게임 육안 확인**: Task 1 완료 후 `node tools/shot.mjs`로 스프라이트 렌더가 분리 전과 동일한지 컨트롤러가 확인(자동 테스트 외 게이트).
- **YAGNI**: STAGES/BAL/PAT·JSON/fetch·원격·오버라이드 재설계 전부 범위 밖(스펙 일치).
