# 인게임 에디터 (밸런스 · 스테이지 · 리소스) — 설계 문서

> 작성일: 2026-05-31 · 대상: HEX DANMAKU (`d:\00.project\hex\hex-danmaku`)
> 상태: 설계 확정 대기 → 이후 writing-plans로 구현 계획 작성
> **의존**: 확장팩 1탄 스펙([2026-05-31-expansion-pack-1-design.md](2026-05-31-expansion-pack-1-design.md))의 엔진 메커니즘(crack/pad/bounce/lunge/보스 신패턴, 탄 `vc`/`fuse` 등)이 **먼저 존재**해야 편집 대상이 된다.

---

## 1. 목표 & 범위

코드를 직접 고치지 않고 게임의 **스테이지 · 밸런스 · 리소스(아트)**를 편집하는 인게임 에디터.
메뉴의 정식 항목으로 노출하고, 편집 결과는 localStorage에 저장되어 게임에 **즉시 반영**되며 JSON으로 export/import한다.

### 3개 편집 영역

1. **스테이지** — 헥스 그리드에 기믹/적/목표를 시각 배치 + 스테이지 속성·보스 페이즈 편집. 기본 24 오버라이드 + 커스텀 추가.
2. **밸런스** — 스킬 비용·지속, 점수 값, 아이템 확률, 적 속도, 난이도 임계값 등 파라미터 조정.
3. **리소스** — `RES` 아트 레지스트리 편집(픽셀 그리드/컬러맵 또는 이미지 스왑).

### 설계 원칙

1. **빌드 스텝 없음 유지** — localStorage + JSON. 소스 영구 반영은 export한 JSON을 사람이 붙여넣는다.
2. **데이터/오버레이 분리** — 게임 로직은 기본 데이터를 쓰고, 부팅 시 오버레이가 localStorage 패치를 병합한다. 에디터를 한 번도 안 열어도 게임은 정상 동작.
3. **순수 데이터 레이어는 테스트** — 병합·직렬화·검증은 순수 함수로 분리해 vm 하니스로 단위 테스트.
4. **공정성 검증 재사용** — 확장팩의 "매 턴 안전 셀 존재" 불변식을 런타임 "검증" 버튼으로 재사용.

### 비목표 (에디터 1탄 제외)

- 무제한 undo/redo 히스토리(간단한 1~수 단계만 고려, 필수 아님)
- 클라우드 공유/링크(JSON 복사로 갈음)
- 고급 드로잉 툴(리소스 픽셀 편집은 기본 페인트 수준)
- 보스 페이즈 비주얼 타임라인(폼 기반 편집)
- 엔드리스 모드 전용 편집(밸런스 탭에서 공용 파라미터만)

---

## 2. 아키텍처

### 2.1 파일 & 로드 순서

```
engine → stages → resources → sprites → editor-core → screens → editor → app
```

| 파일 | 종류 | 책임 |
|------|------|------|
| `editor-core.jsx` | 순수 JS (테스트 가능) | `BAL` 기본값, `applyOverrides()`, export/import 직렬화, `validateStage()` |
| `editor.jsx` | JSX UI | `EditorScreen` + 3탭(Stage/Balance/Resource) 컴포넌트, `window`에 노출 |

`editor-core.jsx`는 stages/resources **뒤에** 로드되어, 로드 시점에 localStorage 패치를 `window.HXS.STAGES`·`window.HXR.RES`·`window.HXB`(밸런스)에 병합한다. 따라서 game·editor 모두 병합된 데이터를 본다.

### 2.2 밸런스 설정 `window.HXB` (`BAL`)

현재 하드코딩된 튜닝 값들을 `BAL` 테이블로 이전하고, engine/stages/app이 이 값을 읽도록 한다.

```js
const BAL = {
  skill: { undoCost: 30, bombCost: 50, bombRadius: 2, freezeCost: 80, freezeTurns: 3 },
  score: { surviveBase: 10, comboCap: 10, gemBase: 80, gemCombo: 4, starBase: 50, starCombo: 3 },
  item:  { spawnChance: 0.24, max: 3, pSc: 0.45, pBm: 0.18, pTp: 0.12 /* ht = 나머지 */ },
  enemy: { chaseEvery: 2, lungeWindup: 1, lungeDash: 2 },
  endless: { diffEasy: 15, diffNormal: 35, diffHard: 60 },
};
```

- 이전 대상(예): `doUndo`/`doBomb`/`doFreeze`의 비용·반경·턴(engine), `tick`의 점수식·아이템 스폰·콤보, `DL` 임계값(engine), 적 cadence(engine `ENEMY_KINDS`). 
- 적용 방식: 각 함수가 모듈 상수 대신 `window.HXB.*`를 읽는다. `window.HXB`는 `editor-core`가 기본값으로 세팅하고 오버라이드를 병합. **engine 단독 로드(테스트)에서도 동작하도록** engine 내부에 `const BAL = window.HXB || DEFAULT_BAL;` 같은 폴백을 둔다.

### 2.3 오버라이드 저장 모델

| localStorage 키 | 내용 |
|-----------------|------|
| `hex_edit_stages` | `{ overrides: { [id]: PartialStageDef }, custom: StageDef[] }` |
| `hex_edit_balance` | `BAL` 부분 패치 |
| `hex_edit_res` | `{ [resKey]: PartialResEntry }` |

`applyOverrides()` (editor-core, 순수):
- `STAGES`: 각 기본 스테이지에 `overrides[id]` 얕은 병합, 끝에 `custom[]` append.
- **커스텀 스테이지 id/잠금**: 커스텀은 `id >= 1000` 공간을 쓴다(기본 1~24와 분리). 진행 잠금 체인을 꼬이게 하지 않도록 **커스텀 스테이지는 항상 잠금 해제**(`isUnlocked`가 `id >= 1000`이면 true 반환)이며, 별점은 기존과 동일하게 클리어 시 저장된다.
- `RES`: 각 키에 `res[key]` 병합.
- `BAL`: 기본값에 balance 패치 깊은 병합.

`serializeOverrides()` / `parseOverrides(json)`: export/import. parse는 스키마 검증(필수 필드·타입) 후 적용.

### 2.4 화면 통합

- `app.jsx` 화면 상태에 `editor` 추가: `menu | select | play | editor`.
- `screens.jsx` `MenuScreen`에 "에디터" 버튼 추가 → `setScreen('editor')`.
- `EditorScreen`은 탭 전환 + 각 탭 컴포넌트 렌더, "← 메뉴"로 복귀. 편집 저장 시 `applyOverrides()` 재실행 후 관련 상태 새로고침.

---

## 3. 스테이지 탭

### 3.1 좌측: 스테이지 목록

- 기본 24 (수정됨 배지 표시) + 커스텀 목록. "새 커스텀" 버튼.
- 선택 시 캔버스 + 속성 패널 로드.

### 3.2 중앙: 헥스 그리드 캔버스

- 게임 보드 SVG 렌더를 재사용(읽기전용 하이라이트 대신 편집 클릭). 셀 클릭 = 현재 팔레트 도구 적용.
- **팔레트 도구**: 선택/지우개, 벽(`wall`), 부서지는 발판(`crack`), 컨베이어(`pad`+방향), 가시(`spike`), 포대(`turret`+period/phase), 적(`enemy`+kind[chase/bounce/lunge]+dir), 별(`gem`), 게이트(`goal`), 시작 위치(`start`).
- pad/turret/enemy는 배치 후 인라인으로 부가 속성(방향·주기·kind) 편집.
- 단일 셀 점유 규칙: 한 셀에 한 종류만(겹치면 교체). goal/start는 각 1개.

### 3.3 우측: 속성 패널

- 공통: `id`(읽기전용/자동), `name`, `sub`, `tip`, `type`(normal/survive/collect/boss), `interval`.
- type별:
  - normal: `goal`(캔버스에서 배치)
  - survive: `surviveTurns`
  - collect: `gems`(캔버스 배치, 개수 자동)
  - boss: **페이즈 에디터** — `{type, turns, name}` 행 추가/삭제/순서변경, `bossTotal`은 turns 합으로 자동 계산. type은 기존+신규(rain/aimed/pincer/sweep/sweepGap/full/converge/alternate/spread/laser/spiral/summon/mark/drift) 드롭다운.
  - normal/survive/collect: `pool`(패턴 다중 선택; 광선 `L([...])` 포함).

### 3.4 액션

- **테스트 ▶**: 현재 편집 def로 즉시 플레이(`mode:'stage'`, 임시 def). 종료/클리어 시 **에디터로 복귀**하며, 테스트 플레이는 **별점을 저장하지 않는다**(진행도 오염 방지 — `App`에 테스트 플레이 플래그를 둬 클리어 시 `saveStars`를 건너뜀).
- **검증**: `validateStage(def)` — 공정성 시뮬레이션 N턴 실행해 "매 턴 안전 셀 존재" 확인 + 도달 가능성(normal은 goal 경로) 점검 → 경고 리포트.
- **저장**: `hex_edit_stages.overrides[id]`(기본) 또는 `custom[]`(커스텀)에 기록 후 `applyOverrides()`.
- **되돌리기**: 기본 스테이지면 오버라이드 삭제(원본 복귀), 커스텀이면 삭제.

---

## 4. 밸런스 탭

- `BAL` 그룹별 폼(숫자 입력/슬라이더): skill / score / item / enemy / endless.
- 변경 즉시 `window.HXB`에 반영 + localStorage 저장(디바운스). "기본값 복원" 버튼.
- 각 항목에 현재값·기본값 표시. item 확률은 합 검증(sc+bm+tp ≤ 1, 나머지 ht).

---

## 5. 리소스 탭

- 좌측: `RES` 키 목록(player/drone/.../신규 bouncer/lunger/pad/mine/crack). 수정됨 배지.
- 우측: 선택 항목 편집
  - `kind: 'pixel'`: 컬러맵 편집(문자→색), 그리드 페인트(셀 클릭 시 선택 색 칠/지움), `px`/`ox`/`oy`. 라이브 미리보기.
  - `kind: 'image'`로 전환: `src`(assets/ 경로), `w`/`h`/`dx`/`dy`/`smooth`. (실제 파일은 사용자가 assets/에 둠)
  - `kind: 'vector'`(wall/crack): 편집 불가 안내(또는 image 스왑만).
- 저장: `hex_edit_res[key]` 패치 후 `applyOverrides()`. 되돌리기 = 패치 삭제.

> 픽셀 그리드 편집은 기본 수준(단일 색 페인트). 행/열 추가·복잡 도구는 비목표.

---

## 6. Export / Import

- **Export**: `serializeOverrides()` → 하나의 JSON(스테이지+밸런스+리소스 패치). 다운로드(Blob) + 클립보드 복사 버튼.
- **Import**: 텍스트 영역 붙여넣기 → `parseOverrides()` 스키마 검증 → localStorage 반영 → `applyOverrides()` → 화면 새로고침. 실패 시 사유 표시(원자적: 실패면 미적용).
- 소스 영구 반영 가이드: export JSON의 stages를 `stages.jsx` STAGES에, res를 `resources.jsx` RES에 수동 반영(문서에 절차 명시).

---

## 7. 검증 (테스트)

`editor-core.jsx`는 순수 JS이므로 vm 하니스로 테스트한다(확장팩의 `tests/harness.mjs` 재사용).

- `applyOverrides`: 기본 병합·커스텀 append·RES 패치·BAL 깊은 병합.
- `serializeOverrides`/`parseOverrides`: 왕복(round-trip) 동일성, 잘못된 JSON/스키마 거부.
- `validateStage`: 명백히 불공정한 def(예: 사방 벽으로 갇힘) → 경고, 정상 def → 통과.
- `BAL` 폴백: `window.HXB` 미설정 시 기본값으로 engine 동작(회귀).

UI(editor.jsx)는 단위 테스트 대신 브라우저 수동 검증.

---

## 8. 변경/생성 파일 요약

| 파일 | 변경 |
|------|------|
| `editor-core.jsx` | 신규 — `BAL` 기본값, applyOverrides, serialize/parse, validateStage |
| `editor.jsx` | 신규 — `EditorScreen` + 3탭 UI |
| `engine.jsx` | `BAL` 폴백 + 튜닝 값 읽기로 전환(skill/score/item/enemy/DL) |
| `stages.jsx` | (필요 시) interval 등 BAL 참조 |
| `app.jsx` | `editor` 화면 라우팅, 테스트 플레이 진입/복귀 |
| `screens.jsx` | `MenuScreen`에 에디터 버튼 |
| `Hex Danmaku.html` | `editor-core.jsx`·`editor.jsx` script 태그(순서 준수) |
| `styles.css` | 에디터 UI 스타일 |
| `tests/overrides.test.mjs` | 신규 — 데이터 레이어 테스트 |
| `docs/hex-danmaku-dev.md` | 에디터·오버라이드·BAL 문서화 |

---

## 9. 빌드 순서 (개요 — 상세는 writing-plans에서)

1. `BAL` 도입 + engine/stages를 BAL 읽기로 전환(+회귀 테스트 초록 유지)
2. `editor-core` 오버라이드/직렬화/검증 + 테스트, 부팅 시 applyOverrides 적용
3. `EditorScreen` 골격 + 메뉴 진입/복귀 + 탭 전환
4. 밸런스 탭(가장 단순) → 리소스 탭 → 스테이지 탭(가장 복잡)
5. 테스트 플레이/검증 버튼, Export/Import
6. 문서 갱신

각 단계는 순수 레이어 테스트 초록 + 브라우저 수동 검증을 게이트로 한다.

---

## 10. 전체 프로젝트 순서 (확장팩 ↔ 에디터)

```
확장팩 Phase 1~6 (엔진 메커니즘)      ← 편집 대상 데이터 형태 확보
        │
        ▼
에디터 전체 (이 스펙)                  ← 스테이지/밸런스/리소스 편집 도구
        │
        ▼
확장팩 Phase 7 (스테이지 6곳 리워크)   ← 에디터로 배치·튜닝·공정성 검증
        │
        ▼
확장팩 Phase 8 / 에디터 문서           ← 문서 갱신
```
