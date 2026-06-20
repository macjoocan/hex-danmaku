# A1 — 지역(월드) 구조 + 진행/해금 + 지역 맵 (디자인 스펙)

> 작성일: 2026-06-21 · 승인: 유저 (대화에서 디자인 승인)
> 메타게임 정리(아웃게임)의 첫 조각. 전체 분해: **A 아웃게임 셸+목적성 / B 데일리+streak / C 리더보드+주간랭킹 / D 경제 사용처 / E 밸런스 패스.** A를 **A1(지역 구조/맵)** + A2(지역별 업적/달성도)로 분리, 본 스펙은 **A1**.
> 방침: 밸런스·리소스(이름/수치/보상)는 전체 개발 후 일괄 정리. **본 스펙은 구조만.**

## 목표

24개 스테이지가 평면 그리드 + 선형 해금이라 "왜 모으는지" 목적이 약하다. 스테이지를 **5개 지역(월드)**으로 묶고, 각 지역이 보스로 끝나며, 보스를 잡아 다음 지역을 여는 **레트로 월드맵 진행**을 도입해 진행 목적성을 만든다. 보상·업적·랭킹은 후속(A2/D/B/C). **본 스펙은 순수 구조: 데이터 모델 + 해금/클리어 로직 + 지역 맵 화면 + 라우팅.**

## 0. 현재 구조 (사실)

- `screens.jsx` `MenuScreen`(스테이지/엔드리스/에디터 3모드) → `StageSelect`(전체 `STAGES` 평면 그리드, `isUnlocked(i, stars)`로 잠금) → 플레이 → Clear/Fail 오버레이.
- `app.jsx`: `toSelect`→screen `'select'`가 `<StageSelect stars onPick={startStage} onBack={toMenu}/>`. `startStage(idx)`는 전역 STAGES 인덱스 사용.
- `stages.jsx`: `STAGES` 24개. 보스는 **인덱스 5, 10, 14, 18, 23**(id 6/11/15/19/24)에 위치 — 각 지역의 마지막. `isUnlocked(idx, stars)` = `idx===0 || STAGES[idx].id>=1000 || !!stars[STAGES[idx-1].id]` (선형). `loadStars()`=localStorage `hex_stage_stars`(id→0..3).
- **핵심**: 기존 `isUnlocked`가 이미 (a) 지역 게이팅(다음 지역 첫 스테이지는 이전 지역 보스 클리어 필요)과 (b) 지역 내 선형 해금을 둘 다 강제한다. 지역 맵은 **맵 레벨 잠금 표시**용 헬퍼만 추가하면 된다.
- 커스텀 스테이지(에디터)는 `applyOverrides`가 STAGES에 id≥1000으로 append — 빌트인 0..23 순서·인덱스는 불변. 지역은 빌트인 캠페인(0..23)만 다룸.

## 1. 지역 데이터 모델

`stages.jsx`에 `REGIONS` 추가(HXS로 노출). 0-based **인덱스 범위**로 정의(스테이지 연속, 보스는 항상 `to`):
```js
const REGIONS = [
  { id: 1, name: '여명의 평원',   color: '#5eead4', from: 0,  to: 5  },
  { id: 2, name: '강철 전선',     color: '#fbbf24', from: 6,  to: 10 },
  { id: 3, name: '군주의 성채',   color: '#c084fc', from: 11, to: 14 },
  { id: 4, name: '포식의 둥지',   color: '#34d399', from: 15, to: 18 },
  { id: 5, name: '심연',          color: '#fb7185', from: 19, to: 23 },
];
```
- `name`/`color`는 **플레이스홀더**(리소스 정리 시 교체). 보스는 `STAGES[region.to]`(항상 type 'boss').
- 인덱스 기반이라 `onPick(globalIdx)`/`startStage(idx)` 경로 무변경.

## 2. 해금/클리어 헬퍼 (순수 로직, HXS 노출)

```js
const regionStars   = (region, stars) => { let s=0; for (let i=region.from;i<=region.to;i++) s+=(stars[STAGES[i].id]||0); return s; };
const regionMax      = (region) => (region.to - region.from + 1) * 3;
const regionCleared  = (region, stars) => (stars[STAGES[region.to].id] || 0) > 0;   // 보스 클리어 = 지역 클리어
const regionUnlocked = (ri, stars) => ri === 0 || regionCleared(REGIONS[ri-1], stars); // 지역1 항상 열림
```
- 지역 내 스테이지 해금은 기존 `isUnlocked`(선형) 그대로 사용.

## 3. 지역 맵 화면 (신규 `RegionMap`, screens.jsx)

`<RegionMap stars coins onPick onBack/>` — 5개 지역 카드 + 상단 헤더(코인 🪙, 전체 ★ 합/최대). 각 카드:
- **잠김**(`!regionUnlocked`): 🔒 + "이전 지역 클리어 시 해금"(또는 이전 보스명), 이름 가림(？？？). 클릭 불가.
- **열림/현재**: 이름·테마색·**★ regionStars/regionMax**. 클릭 → `onPick(regionIdx)`.
- **클리어**(`regionCleared`): ✓ 배지 추가.
`Stars` 컴포넌트·`TYPE_META` 재사용. 레이아웃은 기존 `select`/`menu` 화면 톤.

## 4. StageSelect 지역 스코프 (screens.jsx)

`StageSelect`에 `region` prop 추가:
- `region`이 있으면 `STAGES`를 `[region.from..region.to]`로 슬라이스해 그 지역 스테이지만 렌더(전역 인덱스로 `isUnlocked`/`onPick` 호출 — 인덱스 의미 유지).
- 타이틀에 지역명, `onBack`은 지역맵으로.
- `region` 없이 호출되면(하위호환) 기존 전체 그리드 동작 유지 — 단 A1에서는 항상 region을 넘긴다.

## 5. 라우팅 (app.jsx)

- 메뉴 "스테이지" → 신규 스크린 `'regions'`: `<RegionMap stars coins onPick={enterRegion} onBack={toMenu}/>`.
- `enterRegion(ri)` → 현재 지역 인덱스 상태 저장 + screen `'select'`.
- screen `'select'` → `<StageSelect stars region={REGIONS[curRegion]} onPick={startStage} onBack={toRegions}/>`.
- 신규 상태: `curRegion`(useState). `toRegions`/`enterRegion` 콜백 추가. 엔드리스·에디터·플레이·오버레이 경로 무변경.

## 6. 범위 / 테스트

- **범위 밖**: 업적/달성도(A2), 지역 클리어 보상(경제/A2 — A1은 보상 무관), 데일리/랭킹(B/C), 밸런스 수치·지역 이름 확정·테마 비주얼 폴리시(E/리소스 정리), 엔드리스/에디터 변경.
- **테스트**(vm 하니스, 순수 로직):
  - REGIONS 무결성: from/to가 **인덱스 0..23을 정확히 1회씩, 연속·비중첩**으로 커버; 각 region의 `STAGES[to]`가 type 'boss'.
  - `regionUnlocked`: 지역1 항상 true; 지역N은 지역N-1 보스 별≥1일 때만 true(별 없으면 false).
  - `regionCleared`/`regionStars`/`regionMax`: 별 데이터에 따른 계산 정확.
  - 화면(RegionMap/StageSelect)은 `node tests/_babelcheck.mjs` 8/8 + 인게임 스크린샷 육안.

## 수용 기준

- 메뉴 "스테이지" → 5개 지역 맵 → 지역 선택 → 그 지역 스테이지만 표시 → 플레이. 엔드리스/에디터 무변경.
- 지역 N+1은 지역 N 보스 클리어 전까지 맵에서 잠겨 보이고 진입 불가.
- 지역 맵이 코인·전체 진행도·지역별 별 진행도를 노출한다.
- `REGIONS`가 빌트인 24스테이지를 5지역으로 정확히 분할(무결성 테스트 통과).
- `npm test`(기존 110 + 신규 지역 테스트) + `node tests/_babelcheck.mjs` 8/8 통과, 스크린샷에서 지역 맵·지역 스테이지 정상.
