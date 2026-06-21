# A2 — 지역별 업적 + 달성도 시스템 (디자인 스펙)

> 작성일: 2026-06-21 · 승인: 유저 (대화에서 디자인 승인)
> 메타게임 정리(아웃게임) A의 두 번째 조각. A1(지역 구조/맵, 병합 완료) 위에 얹히는 **완성도 깊이 레이어**.
> 방침: **구조 + 표시만. 보상·밸런스 수치·이름 확정은 나중 일괄 정리.**

## 목표

지역(월드)마다 **업적**을 두고 **달성도(%)**를 보여줘 "더 잘 깰" 목적성을 더한다. 별점만으론 표현 못 하는 도전(속공 등)을 업적으로 노출. **보상 없음**(코인 지급은 경제 D/밸런스 E로 분리 — A2는 판정 + 표시 시스템만).

## 0. 현재 상태 (사실)

- A1: `HXS.REGIONS`(5지역 `{id,name,color,from,to}` 인덱스 범위), `regionStars/regionMax/regionCleared/regionUnlocked`. 흐름 메뉴→지역맵(`RegionMap`)→지역 스코프 `StageSelect`→플레이.
- 별점: `hex_stage_stars`(id→0..3). `rateStage(s)` = 0스킬→3, ≤2스킬→2, else 1. **즉 별 3 = 무스킬 클리어**(별점에 이미 인코딩).
- 클리어 시점 상태 `s`: `skillUses`, `t`(턴), `sc`, `win`. app의 클리어 효과(별 저장하는 useEffect)가 `HXS.saveStars(stage.id, rateStage(s))` 호출.
- **속공(턴 수)은 어디에도 저장 안 됨** → 추가 추적 필요. "코인 올수집"은 코인이 랜덤 스폰이라 정의 모호 → 채택 안 함.

## 1. 추적 (클리어 저장 경로에 최소 추가)

- 별점은 기존 그대로(무스킬=3성).
- **신규 `hex_stage_best`** (localStorage, id→`{ turns }`): 스테이지 클리어 시 그 스테이지 **최소 턴** 기록. stages.jsx에 순수 함수 추가(`loadStars` 패턴):
  - `loadBest()` → `{ id: { turns } }` (없으면 `{}`; 손상값 가드).
  - `saveBest(id, turns)` → 기존 turns보다 작을 때만 갱신, 갱신된 맵 반환.
- app의 기존 클리어 효과(별 저장 옆)에서 `HXS.saveBest(g.stage.id, g.t)` 호출(비-`_test`만). best 저장 추상화는 향후 Native Storage 이관 대상.

## 2. 업적 정의 (데이터, 확장 용이)

`stages.jsx`에 `ACHIEVEMENTS` 배열(HXS 노출). 각:
```js
{ id, region, name, desc, check(ctx) }   // region = 지역 id(1..5) 또는 'global'
```
- `check(ctx)`는 **순수 predicate**, `ctx = { stars, best, region, STAGES }` 받아 달성 여부(bool) 반환. (region 업적은 해당 region 객체를 ctx.region에 주입.)
- 대표 세트(지역마다 3종 + 글로벌, **수치는 플레이스홀더 — E에서 튜닝**):
  - **완주**(region): 지역 전 스테이지 클리어(모든 stageId 별≥1).
  - **정복**(region): 지역 전 스테이지 올3성(모든 stageId 별===3) — 무스킬과 동치.
  - **속공**(region): 지역 보스(`STAGES[region.to]`)를 `best.turns ≤ THRESHOLD`로 클리어(THRESHOLD 플레이스홀더).
  - **글로벌 예**: 전 지역 클리어 / 총 별 ≥ N.
- 새 업적은 배열에 항목 추가만 하면 됨.

## 3. 달성도 계산 (순수 헬퍼, HXS)

- `achvDone(achv, stars, best)` → bool (region 업적은 내부에서 REGIONS[region] 조회해 ctx 구성).
- `regionAchv(regionId, stars, best)` → `{ done, total }` (그 지역 업적 집계).
- `totalAchv(stars, best)` → `{ done, total, pct }` (전체, pct=round(done/total*100)).
- 전부 순수 → vm 단위 테스트.

## 4. 표시

- **지역 맵 카드**(`RegionMap`): 기존 `★ got/max` 옆/아래에 **업적 done/total** 추가(잠긴 지역은 표시 안 함).
- **지역 스테이지 화면**(`StageSelect`): 상단(select-bar 아래)에 **그 지역 업적 리스트** — 이름·설명·달성(✓)/미달성(○). `loadBest()`도 읽어 ctx 구성.
- 전용 업적 화면은 만들지 않음(지역 단위로 충분, YAGNI).

## 5. 범위 / 테스트

- **범위 밖**: 보상(코인 claim)·데일리/랭킹·밸런스 수치(턴 임계값 등 플레이스홀더)·업적 이름 확정·전용 업적 화면·코인 올수집 업적.
- **테스트**(vm 하니스, 순수 로직):
  - `loadBest`/`saveBest`: 라운드트립, 더 작은 턴만 갱신, 손상값→`{}`.
  - 각 대표 업적 `check`: 별/최고턴 픽스처로 달성·미달성 양쪽.
  - `regionAchv`/`totalAchv`: 집계 정확(done/total/pct).
  - 화면(RegionMap/StageSelect 패널)은 `node tests/_babelcheck.mjs` 8/8 + 인게임 스크린샷.

## 수용 기준

- 클리어 시 그 스테이지 최소 턴이 `hex_stage_best`에 저장된다(더 빠를 때만 갱신, `_test` 제외).
- `ACHIEVEMENTS`가 지역별 완주·정복·속공 + 글로벌을 정의하고, 각 `check`가 별/최고턴으로 순수 판정된다.
- 지역 맵 카드가 업적 done/total을, 지역 스테이지 화면이 업적 리스트(달성/미달성)를 보여준다.
- `regionAchv`/`totalAchv`가 정확히 집계된다(단위 테스트).
- `npm test`(기존 113 + 신규) + `node tests/_babelcheck.mjs` 8/8 통과, 보상·경제 변경 없음.
- 새 업적을 데이터에 추가하는 것만으로 확장된다.
