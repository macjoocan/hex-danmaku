# 아트 리소스 데이터/코드 분리 — 디자인 스펙

> 작성일: 2026-06-21 · 승인: 유저 (대화에서 디자인 승인)
> 목표: 라이브 운영에 맞게 **데이터/코드 분리(외부화)**. 1차 범위는 **아트(RES)만**. 포맷은 **JS 데이터 모듈**.

## 목표

`resources.jsx`에 로직(`px`/`drawArt`/`isImage`)과 데이터(픽셀 그리드·색맵·`RES` 레지스트리)가 섞여 있다. 데이터를 순수 데이터 파일로 분리해 (1) 로직과 독립적으로 아트를 보고/수정/버전관리하고, (2) 토스 정적 빌드·향후 JSON화·STAGES/BAL 동일 패턴 확장의 토대를 만든다. **렌더 동작·오버라이드(변경) 시스템·테스트 결과는 불변**이어야 한다.

## 0. 현재 구조 (사실)

- `resources.jsx`: ① 픽셀 렌더러 `px(grid,map,p,cx,cy,stroke)` (로직) ② ~30개 그리드 상수 + 색맵 상수 (데이터) ③ `RES` 레지스트리 객체 (데이터, 그리드/맵 상수를 참조) ④ `drawArt(name,opts)`/`isImage(name)` (로직) ⑤ 상단 레지스트리 포맷 설명 주석. 끝에서 `window.HXR = { RES, drawArt, px, isImage }`.
- 그리드/맵 상수의 유일한 소비자는 `RES` 레지스트리뿐 — 스프라이트 컴포넌트(sprites.jsx)는 `drawArt('name')`만 호출하고 상수를 직접 참조하지 않는다(분리 안전).
- 오버라이드 레이어 `editor-core.jsx`: `BASE_RES = {...window.HXR.RES}` 스냅샷 후 localStorage 패치(`hex_edit_res`)를 `applyResOverrides`로 deep-merge, `window.HXR.RES`를 in-place 갱신. import/export는 `version:1` JSON(stages/balance/res).
- 툴링: `tools/res-data.mjs`가 resources.jsx를 마커(`// ─── Pixel grids` ~ `// ─── drawArt`)로 잘라 eval → `loadRES()`. `tools/extract-sprites.mjs`·`tests/resources-art.test.mjs`가 이 로더 사용. `tools/shot.mjs`는 HTML의 `type="text/babel" src=` JSX들을 인라인. vm 하니스 `loadEditor`는 현재 `win.HXR.RES`를 stub(player/drone 2종)로 채움.
- HTML(`Hex Danmaku.html`)은 CDN(react/babel) → `type="text/babel"` JSX들을 순서대로 로드.

## 1. 분리 구조

**신규 `art-data.js` (순수 데이터, 함수 0, JSX 0):**
- 모든 픽셀 그리드 상수(HERO, DRONE, …) + 색맵 상수 + `RES` 레지스트리(현재 resources.jsx의 ②③) + 레지스트리 포맷 설명 주석(현재 ⑤)을 그대로 이동.
- 끝에서 `window.HXR_DATA = { RES };`로 노출. (그리드/맵 상수는 이 파일 내부 지역 const로 유지 — 외부 노출 불필요, RES가 참조.)

**`resources.jsx` (로직만):**
- `px`, `drawArt`, `isImage` 유지(①④). 상단에 `const { RES } = window.HXR_DATA;`. 끝에서 기존과 동일하게 `window.HXR = { RES, drawArt, px, isImage };`.
- 짧은 포인터 주석만 남김("아트 데이터는 art-data.js 참조").

**로드 순서:** `art-data.js` → `resources.jsx` → (기존 순서 유지). `art-data.js`는 JSX가 없으므로 HTML에서 **일반 `<script src="art-data.js">`**로 로드(babel 우회), `resources.jsx`보다 먼저.

## 2. 오버라이드/변경 레이어 — 변경 없음

`window.HXR.RES`는 여전히 `HXR_DATA.RES`와 동일한 객체 참조다. `editor-core.jsx`의 `BASE_RES` 스냅샷·`applyResOverrides`·in-place 갱신·import/export·에디터 리소스 탭은 **코드 변경 없이 그대로 동작**한다. ("아트만" 범위 — 오버라이드 레이어 재설계는 범위 밖.)

## 3. 툴링 갱신

- **`tools/res-data.mjs`**: 마커 슬라이싱 제거. `art-data.js`를 sandbox(`window` stub)에서 통째로 평가 → `window.HXR_DATA.RES` 반환. 순수 데이터라 안전·견고.
- **`tools/extract-sprites.mjs`**: `loadRES()` 그대로 사용(res-data.mjs가 바뀌므로 자동 호환).
- **`tools/shot.mjs`**: 인라인 스크립트 목록 맨 앞(다른 jsx보다 먼저)에 `art-data.js`를 추가(순수 JS라 babel transform 불필요, 그대로 인라인).
- **vm 하니스 `loadEditor`**: HXR.RES stub 대신 실제 `art-data.js`를 로드해 `win.HXR_DATA`/실제 RES 사용으로 교체(순수 JS라 vm에서 그대로 평가 가능). editor-core 테스트가 실제 RES로 돌아 더 정확.
- HTML(`Hex Danmaku.html`): `<script src="art-data.js"></script>`를 resources.jsx 줄 앞에 추가.

## 4. 테스트

- `npm test`(107) + `tests/resources-art.test.mjs` 전부 그대로 통과(추출·렌더·EXPECTED_SIZE 불변).
- 신규 가드 테스트(`tests/resources-art.test.mjs`에 추가 — 이미 `loadRES()` 사용):
  - `art-data.js` 평가 시 `window.HXR_DATA.RES`가 존재하고 기존 RES 키 전부 포함(예: player, drone, …, bossOverlord).
  - art-data.js는 순수 데이터: 평가 결과 `HXR_DATA`에 함수가 없다(렌더 로직이 새지 않았는지).
  - 회귀: `loadRES()`가 art-data.js 기반으로도 동일한 엔트리 수/크기를 반환(EXPECTED_SIZE 검사가 이미 커버).
- `node tests/_babelcheck.mjs` 8/8 (resources.jsx는 여전히 JSX이므로 체크 대상; art-data.js는 순수 JS).
- 인게임 스크린샷(`tools/shot.mjs`)으로 스프라이트 렌더가 분리 전과 동일한지 육안 확인.

## 5. 마이그레이션 안전성

- 그리드/맵 상수는 RES만 참조 → 이동해도 다른 코드 깨지지 않음(확인됨).
- `window.HXR.RES` 객체 참조 동일성 유지 → 오버라이드·게임 렌더 경로 무영향.
- 로드 순서 의존: art-data.js가 resources.jsx보다 먼저 로드되지 않으면 `window.HXR_DATA` undefined → 명확히 깨짐(즉시 발견). HTML·하니스·shot 모두 순서 보장.

## 범위 밖 (명시)

- STAGES / DEFAULT_BAL / PAT 외부화 — 동일 패턴으로 추후(별도 작업).
- JSON 파일 + 런타임 fetch, 원격 콘텐츠 업데이트.
- 오버라이드/변경 레이어 재설계.
- 토스 정적 빌드 파이프라인 자체(이건 그 토대만 마련).

## 수용 기준

- `resources.jsx`에 그리드/맵/RES 데이터가 없고, `art-data.js`가 그 데이터를 `window.HXR_DATA.RES`로 노출한다.
- `resources.jsx`는 `window.HXR_DATA.RES`를 읽어 기존과 동일한 `window.HXR` API를 노출한다.
- 게임 렌더·에디터 리소스 변경·import/export가 분리 전과 동일하게 동작한다(육안 + 기존 테스트).
- `npm test`(107 + 신규 가드) + `node tests/_babelcheck.mjs` 8/8 통과, extract-sprites/shot 정상.
- art-data.js는 순수 데이터(함수 없음), 일반 `<script>`로 로드된다.
