# B — 데일리 시드 챌린지 + 연속출석(streak) (디자인 스펙)

> 작성일: 2026-06-21 · 승인: 유저 (대화에서 디자인 승인)
> 메타게임 정리 기둥 B(리텐션). A1 지역 + A2 업적 위. 방침: **구조만 — 보상·밸런스(시드 난이도)·토스 SDK·리더보드(C)는 분리.**

## 목표

매일 돌아올 이유(리텐션)를 만든다. 날짜로 시드를 고정한 **"오늘의 도전"**(공유 시드 엔드리스)으로 그날 전국 동일 보드를 제공하고, **연속출석(streak)**으로 매일 플레이를 유도한다. 공유 시드는 점수 비교를 공정하게 해 C(리더보드)의 토대가 된다.

## 0. 현재 상태 (사실)

- 엔드리스: `HX.initState()`가 시작 상태 생성. 엔진은 **전역 `Math.random()`을 직접** 호출 — `rp`(패턴 풀, engine.jsx:81-84), `tryItem`(118/131/132), `tryCoin`(146/160), 스폰 인터벌(349). 결정론적 시드 없음.
- 테스트 하니스 `loadGame({seed})`는 vm sandbox의 `Math.random`을 Mulberry32로 교체해 시드 — 즉 엔진이 호출하는 `Math.random`을 런타임에 바꾸는 방식(실게임은 네이티브).
- 메뉴(`MenuScreen`): 스테이지/엔드리스/에디터 3모드. `app.jsx` `startEndless` = `setG(HX.initState())`. 엔드리스 HUD/오버레이 존재.
- 영속: 별(`hex_stage_stars`), 최고점(`hex_hi`), 코인(`hex_coins`), best턴(`hex_stage_best`). stages.jsx의 `load*`는 try/catch + `typeof localStorage==='undefined'` 가드 패턴.
- 도구는 argless `new Date()`/`Date.now()` 사용 불가(throw) — 테스트는 날짜/시드를 **인자 주입**. 실게임은 `new Date()` 사용.

## 1. 시드 가능한 RNG seam (엔진 — 핵심 토대)

엔진에 주입 가능한 RNG를 도입해 데일리 런을 결정론적으로 만든다. 기존 동작은 불변.
- 모듈 지역: `let _rng = null;`. 헬퍼 `const rnd = () => (_rng || Math.random)();`.
- 엔진의 모든 `Math.random()` 호출을 `rnd()`로 교체(`Math.floor(Math.random()*n)` → `Math.floor(rnd()*n)`). 대상: rp, tryItem, tryCoin, 스폰 인터벌(라인 81-84/118/131/132/146/160/349).
- Mulberry32 PRNG를 엔진에 추가(하니스의 것과 동일 알고리즘): `const mulberry32 = (a) => () => { ... }`.
- `initState(seed)`: `seed`(정수)가 주어지면 `_rng = mulberry32(seed)`, 아니면 `_rng = null`(→ `rnd`가 전역 Math.random 사용 = 기존과 동일, 하니스 시드도 그대로 작동).
- `initStageDef`(스테이지): `_rng = null` 리셋(스테이지는 데일리 아님 — 하니스 sandboxMath.random 시드에 의존하는 fairness 테스트 보존).
- **불변식**: seed 없는 엔드리스·스테이지·fairness 동작 100% 동일(기본 경로 = Math.random). 신규: 같은 seed → 동일 보드 시퀀스.

## 2. 데일리 모드

- **날짜→시드**: `dayKey()` = `YYYYMMDD` 문자열(실게임 `new Date()`); 시드 정수 = `Number(dayKey)`(예 20260621). 테스트는 dayKey/seed 주입.
- **데일리 런** = 시드 고정 엔드리스: `initState(seed)`로 시작, 죽을 때까지 점수 도전, 같은 보드. **무제한 재시도, 그날 최고점만 기록.**
- **저장** `hex_daily` = `{ day:'YYYYMMDD', best:number }` (오늘 것만; 날짜 바뀌면 best 리셋). stages.jsx 순수 함수:
  - `loadDaily()` → `{ day, best }` (없거나 손상 → `{ day:'', best:0 }`).
  - `saveDailyScore(day, score)` → 같은 day면 `best=max(best,score)`, 다른 day면 `{day, best:score}`로 교체. 갱신 맵 반환.

## 3. 연속출석 (streak)

- 데일리를 **1회라도 플레이하면 출석**(시작 시점). 저장 `hex_streak` = `{ lastDay:'YYYYMMDD', streak:number }`.
- 순수 헬퍼 **`bumpStreak(prev, today, yesterday)`** (prev=`{lastDay,streak}`, today/yesterday=dayKey 문자열) → 새 `{lastDay,streak:n}`. 날짜 인접 판정은 dayKey를 Date로 파싱하지 않고 **인자로 받은 `yesterday` 키와 비교**(테스트 결정론). 규칙:
  - `today === prev.lastDay` → 그대로 유지(이미 오늘 출석).
  - `prev.lastDay === yesterday` → `{ lastDay:today, streak:prev.streak+1 }`.
  - 그 외(갭/최초/손상) → `{ lastDay:today, streak:1 }`.
  - today/yesterday 계산은 실게임(`dayKey()`/`yesterdayKey()`)이 하고 헬퍼엔 주입.
- stages.jsx `loadStreak()`/`saveStreak(obj)`(load* 패턴).

## 4. UI / 홈

- `MenuScreen`에 **"오늘의 도전"** 모드 버튼 추가(스테이지/엔드리스/에디터와 동급). 메타: 오늘 최고점 + 🔥{streak}일.
- `app.jsx` `startDaily()`: `today=dayKey()`, `seed=Number(today)`; streak 갱신(`saveStreak(bumpStreak(loadStreak(), today, yesterdayKey()))`); `setG(HX.initState(seed))` + 데일리 표식(예 `g.daily=true` 또는 별도 플래그) → screen 'play'.
- 런 종료(사망): 그날 최고점 갱신 `saveDailyScore(today, g.sc)`. 엔드리스 UI 재사용 — HUD/오버레이에 "오늘의 도전" 라벨 + 오늘 최고점 표시(엔드리스 hi 자리 활용).
- 데일리 런은 일반 엔드리스 최고점(`hex_hi`)과 분리(데일리 점수는 `hex_daily`에만).

## 5. 범위 / 테스트

- **범위 밖**: 리더보드·주간랭킹(C), 보상, 시드 난이도 밸런스(E), 토스 SDK, 데일리 전용 종료조건(엔드리스 그대로 — 사망까지).
- **테스트**:
  - RNG 결정론: `initState(seed)` 두 번 → 동일 초기 상태 + 동일 틱 시퀀스(같은 입력); seed 없으면 기존 동작(하니스 시드 회귀).
  - fairness/엔드리스 회귀: 기존 테스트 전부 GREEN(기본 경로 불변).
  - `bumpStreak`: 어제 출석→+1, 오늘 재출석→유지, 갭→1, 최초→1.
  - `loadDaily`/`saveDailyScore`: 같은 날 더 높을 때만 갱신, 다른 날 리셋, 손상→기본.
  - `loadStreak`/`saveStreak` 라운드트립.
  - 화면(MenuScreen 버튼, 데일리 HUD)은 babelcheck + 스크린샷.

## 수용 기준

- 메뉴 "오늘의 도전" → 그날 시드 고정 엔드리스(같은 날 같은 보드), 오늘 최고점·🔥streak 표시.
- 같은 seed로 두 번 시작하면 동일 보드 시퀀스(결정론 테스트). seed 없는 엔드리스/스테이지/fairness는 기존과 동일(회귀 없음).
- 데일리 플레이 시 streak가 규칙대로 증가/유지/리셋, 그날 최고점이 더 높을 때만 갱신.
- `npm test`(기존 117 + 신규) + `node tests/_babelcheck.mjs` 8/8 통과, 보상·경제·리더보드 변경 없음.
