# 헥스 턴제 탄막 게임 — 개발 문서

> Claude Code 개발용. 현재 코드 기준(엔드리스 + 24 스테이지 · 돌파/생존/수집/보스 멀티모드)의
> 구조·로직·상태·시스템을 정리한 문서. **이 문서는 코드를 따라간다 — 코드가 진실의 원천.**

---

## 목차

1. [게임 개요](#1-게임-개요)
2. [기술 스택 & 파일 구조](#2-기술-스택--파일-구조)
3. [헥사곤 그리드 시스템](#3-헥사곤-그리드-시스템)
4. [게임 상태 구조](#4-게임-상태-구조)
5. [메인 게임 루프 (tick)](#5-메인-게임-루프-tick)
6. [탄막 패턴 시스템](#6-탄막-패턴-시스템)
7. [스테이지 시스템 (4가지 모드)](#7-스테이지-시스템-4가지-모드)
8. [보스 공격 생성기](#8-보스-공격-생성기)
9. [기믹: 벽 · 포대 · 가시 · 광선 · 추적자 · 게이트 · 별](#9-기믹-벽--포대--가시--광선--추적자--게이트--별)
10. [아이템 시스템](#10-아이템-시스템)
11. [스킬 시스템](#11-스킬-시스템)
12. [난이도 스케일링 (엔드리스)](#12-난이도-스케일링-엔드리스)
13. [아트 레지스트리 & 스프라이트](#13-아트-레지스트리--스프라이트)
14. [화면 & 진행도 (localStorage)](#14-화면--진행도-localstorage)
15. [시각 효과 시스템](#15-시각-효과-시스템)
16. [컨트롤](#16-컨트롤)
17. [렌더링 우선순위](#17-렌더링-우선순위)
18. [알려진 이슈 및 TODO](#18-알려진-이슈-및-todo)
19. [부록: 주요 함수 요약](#19-부록-주요-함수-요약)

---

## 1. 게임 개요

**장르**: 턴제 탄막 (Turn-based Bullet Hell) · 회피 액션

**핵심 메카닉**: 플레이어가 행동(이동 또는 대기)할 때마다 탄막이 한 칸씩 내려온다. 실시간이 아니라
플레이어 행동이 트리거가 되는 방식. 탄막 패턴을 미리 보고 계산해서 피하는 전략 게임.

**그리드**: 헥사곤 오프셋 그리드 (7열 × 11행), odd-r 오프셋 좌표계

**이동 방향**: 6방향 (헥스 이웃 셀 기준) + 대기

**모드 (2개 진입점 · 4가지 목표 타입)**

| 모드 | 진입 | 목표 | 비고 |
|------|------|------|------|
| **엔드리스** | 메뉴 → ∞ | 생존하며 점수 최대화 | 승리 조건 없음. 유틸 아이템 스폰. 최고점(`hi`) 기록 |
| **스테이지** | 메뉴 → ◈ | 스테이지별 클리어 | 24개. 별점(★0~3) 기반 진행 잠금 해제 |

스테이지의 목표 타입은 4가지: `normal`(게이트 돌파) · `survive`(N턴 생존) · `collect`(별 수집) · `boss`(보스 페이즈 격파).

**패배 조건**: 플레이어 셀이 탄막/적/가시/광선과 겹치면 게임 오버 (`ov: true`).

**승리 조건**: 스테이지 모드에서 목표 타입별 조건 달성 시 (`win: true`). 엔드리스엔 승리 없음.

---

## 2. 기술 스택 & 파일 구조

- **React 18.3.1** (UMD 빌드) + **@babel/standalone 7.29.0** — 브라우저 내 JSX 변환, **빌드 스텝 없음**
- **SVG** — 헥스 그리드, 탄막, 아이템, 스프라이트(픽셀아트/이미지) 렌더링
- **HTML/CSS** — UI 패널, 스킬 버튼, 패턴 미리보기, 오버레이
- **CSS Keyframes** — 폭발(`xboom`), 플로팅 텍스트, 홉/호버/스핀 애니메이션
- **localStorage** — 최고점·스테이지 별점 저장
- **외부 의존성 없음** (React/ReactDOM/Babel CDN만 사용)

### CDN (실제 — `Hex Danmaku.html`)

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" ...></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" ...></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" ...></script>
```

### 파일 구조 & 로드 순서

`engine → stages → resources → sprites → screens → app` (순서 중요)

각 `<script type="text/babel">`는 Babel이 독립 스코프를 부여하므로, 파일 간 통신은 **`window`에 네임스페이스를 매다는 방식**으로 한다.

| 파일 | window 네임스페이스 | 역할 |
|------|---------------------|------|
| `engine.jsx` | `HX` | 그리드 수학 + `tick` 게임루프 + 스킬 + 엔드리스 init |
| `stages.jsx` | `HXS` | 24 스테이지 정의, 보스 공격 생성, 패턴 선택, 진행도(localStorage) |
| `resources.jsx` | `HXR` | **아트 레지스트리** — 모든 스프라이트 아트가 `RES` 테이블 한 곳에 |
| `sprites.jsx` | (각 컴포넌트) | 스프라이트 컴포넌트 — 그림자/애니/경고 래퍼만, 아트는 없음 |
| `screens.jsx` | (각 컴포넌트) | 메뉴 / 스테이지 선택 / 클리어·실패 오버레이 |
| `app.jsx` | — | 화면 오케스트레이션 + 보드/HUD 렌더링 + 입력 |
| `styles.css` | — | 전체 스타일 |
| `assets/` | — | 사용자 교체용 스프라이트 이미지 (`resources.jsx`에서 참조) |

---

## 3. 헥사곤 그리드 시스템

### 좌표계

**odd-r 오프셋** 방식. 홀수 행(row)은 오른쪽으로 W/2 만큼 시프트.

```
Row 0:  [0][1][2][3][4][5][6]
Row 1:   [0][1][2][3][4][5][6]   ← W/2 오른쪽 이동
Row 2:  [0][1][2][3][4][5][6]
```

### 상수 (engine.jsx)

```js
const C = 7;                  // 열 수 (COLS)
const R = 11;                 // 행 수 (ROWS)
const SZ = 23;                // 헥스 반지름 (center→vertex, px)
const W = Math.sqrt(3) * SZ;  // 헥스 너비 ≈ 39.8px
const RH = SZ * 1.5;          // 행 간격 ≈ 34.5px
const PD = 8;                 // SVG 패딩

const SW = Math.ceil(PD*2 + SZ*2 + W*(C-1) + W*0.5);  // SVG 너비
const SH = Math.ceil(PD*2 + SZ*2 + RH*(R-1));          // SVG 높이
```

### 핵심 함수

```js
// 헥스 중심 → SVG 좌표
const hc = (r, c) => ({
  x: PD + SZ + W * c + W * 0.5 * (r % 2),
  y: PD + SZ + RH * r,
});

// pointy-top 헥스 SVG path (각도 오프셋 -π/6)
const hp = (cx, cy, s = SZ - 1.2) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 - Math.PI / 6;
    return `${i ? 'L' : 'M'}${(cx + s*Math.cos(a)).toFixed(2)},${(cy + s*Math.sin(a)).toFixed(2)}`;
  }).join('') + 'Z';
```

### 6방향 이웃 (odd-r 오프셋)

인덱스 순서: `[W, E, NW, NE, SW, SE]`

```js
const DE = [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]]; // 짝수 행
const DO = [[0,-1],[0,1],[-1, 0],[-1,1],[1, 0],[1,1]]; // 홀수 행
const D = r => (r % 2 ? DO : DE);
```

| 인덱스 | 방향 | 키보드 |
|--------|------|--------|
| 0 | W (왼쪽) | A / ArrowLeft |
| 1 | E (오른쪽) | D / ArrowRight |
| 2 | NW (왼위) | Q |
| 3 | NE (오른위) | E |
| 4 | SW (왼아래) | Z |
| 5 | SE (오른아래) | X |

### 헥스 거리 계산 (큐브 좌표 변환)

```js
const hd = (r1, c1, r2, c2) => {
  const ax = c1 - (r1 - (r1 & 1)) / 2, az = r1, ay = -ax - az;
  const bx = c2 - (r2 - (r2 & 1)) / 2, bz = r2, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
};
```

---

## 4. 게임 상태 구조

`tick`은 순수 함수이고, 모든 게임 상태는 단일 객체 `g`로 관리된다. 엔드리스/스테이지 모두 같은 형태를 쓰며 `mode`로 분기.

```js
{
  // ── 모드 / 스테이지 ──
  mode:     'endless' | 'stage',
  stage:    StageDef | null,    // 스테이지 정의(STAGES[idx]) 참조
  stageIdx: number,             // STAGES 배열 인덱스 (스테이지 모드)
  obj:      Objective | null,   // 목표: { type, surviveTurns?, total? }

  // ── 플레이어 / 진행 ──
  pl:    { r, c },              // 플레이어 위치
  t:     number,                // 현재 턴
  sc:    number,                // 점수
  ov:    boolean,               // 게임 오버
  win:   boolean,               // 스테이지 클리어
  combo: number,                // 연속 이동 횟수 (대기 시 0, 최대 20)
  skillUses: number,            // 사용한 스킬 횟수 (별점 산정용)

  // ── 탄막 / 소환 ──
  bl:    Array<{ r, c }>,       // 활성 탄막(드론)
  np:    Pattern,               // 다음 소환 패턴
  np2:   Pattern,               // 그 다음 소환 패턴
  si:    number,                // 소환까지 남은 턴
  ln:    string,                // 방금 소환된 패턴 이름 (웨이브 플래시용)
  fz:    number,                // 정지 스킬 남은 턴
  ht:    number,                // 예지(foresight) 남은 턴

  // ── 기믹 (스테이지) ──
  walls:   Array<{ r, c }>,                       // 벽 (이동+탄막 차단)
  turrets: Array<{ r, c, period, phase }>,        // 포대 (주기 발사)
  spikes:  Array<{ r, c }>,                       // 가시 (즉사, 차단 안 함)
  lasers:  Array<{ c, charge }>,                  // 충전 중인 광선(열 단위)
  enemies: Array<{ r, c, kind }>,                 // 추적자
  goal:    { r, c } | null,                       // 게이트(normal 목표)
  gems:    Array<{ r, c }>,                       // 수집 별(collect 목표)
  bossWaves: number,                              // 발사된 보스 웨이브 수

  // ── 아이템 (주로 엔드리스) ──
  its:   Array<{ r, c, ty }>,   // ty: 'sc' | 'bm' | 'tp' | 'ht'

  // ── 시스템 ──
  hist:  GameState | null,      // 뒤로가기용 직전 상태 (1단계)
  evts:  Array<Event>,          // 이번 턴 이벤트 (시각 효과 트리거용, 로직엔 무영향)
}
```

### 이벤트 구조 (`evts`)

순수 시각 효과 트리거용. 게임 로직엔 영향 없음.

```js
{ ty: 'sc',  r, c, val }            // 점수 아이템 획득
{ ty: 'gem', r, c, val }            // 별 수집
{ ty: 'bm',  r, c, cells:string[] } // 폭탄 폭발 (cells = ['r,c', ...])
{ ty: 'tp',  r, c }                 // 순간이동 (목적지)
{ ty: 'ht',  r, c }                 // 예지 픽업
{ ty: 'idel', r, c }                // 아이템이 탄막에 파괴됨
{ ty: 'laser', c }                  // 광선 발사 (열)
```

---

## 5. 메인 게임 루프 (tick)

```js
const tick = (s, nr, nc) => GameState   // 순수 함수
```

현재 상태 `s` + 이동 목적지 `(nr, nc)` → 다음 상태 반환. 엔드리스/스테이지 모두 처리.

### 실행 순서 (engine.jsx)

```
1. 종료 가드        : ov 또는 win이면 그대로 반환
2. 유효성 검사      : 대기(stay) 또는 이웃 셀인지 / 그리드 범위 / 벽·포대 차단
3. 히스토리 저장    : hist = { ...s, evts: [] }  (뒤로가기용)
4. 콤보 계산        : 대기 → 0,  이동 → min(prev+1, 20)
5. stepIn 판정      : 목적지에 탄막(stepIn)·적(stepEnemy)이 있는지 (이동 시)

6. 탄막 이동 / 정지
   - fz > 0 : 탄막 유지, fz--
   - fz = 0 : 모든 탄막 r+1, (범위 밖 / 벽·포대) 제거, si--
       · si<=0 && !bossDone → np 패턴을 row 0에 소환
            (벽·게이트 칸은 제외), 광선 패턴이면 laser 충전 등록,
            보스면 bossWaves++, np=np2, np2=다음, si=재설정
       · si<=0 && bossDone   → si=1 (소환 없이 계속 틱: 잔탄 정리)

7. 포대 발사        : fz<=0이고 t % period === phase면 포대 아래 칸에 탄 생성

8. 아이템 파괴      : 탄막과 겹친 필드 아이템 제거 (idel 이벤트)
9. 아이템 획득      : 목적지 셀의 아이템 처리 (sc/bm/tp/ht)
10. 별 수집         : 목적지(또는 tp 후 최종 셀)의 gem 수집 (+80+combo*4)

11. 추적자 이동     : fz<=0이고 t가 홀수일 때만(半속도) 플레이어 최종 셀로 그리디 추적
12. 광선 처리       : charge-- (정지 중엔 멈춤), 0 이하면 그 열 발사
                      → finalC가 그 열이면 laserHit

13. 충돌 판정       : ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit
14. 승리 판정(스테이지·!ov)
     - normal  : 최종 셀 == goal
     - collect : gems.length === 0
     - survive : (t+1) >= surviveTurns
     - boss    : bossWaves >= bossTotal && 잔탄(mv) === 0
15. 점수        : !ov면 sc += (10 + min(combo,10)) + bonus
16. 아이템 스폰 : 엔드리스 & 생존 시에만 tryItem
17. 새 상태 반환
```

### 안전 셀 탐색 (순간이동 / `safest`)

```js
const safest = (bl, pl, walls = []) => { /* ... */ }
```

모든 빈 셀(탄막·벽 제외) 중, **가장 가까운 탄막까지 거리(×10) + 플레이어 근접도(최대 3)** 점수가
최대인 셀을 반환. 순간이동 아이템에서 사용.

### 추적자 1스텝 이동 (`stepToward`)

이웃 6칸 중 타깃(플레이어 최종 셀)까지 헥스 거리가 줄어드는 칸으로 그리디 이동.
벽·포대·다른 추적자는 회피.

---

## 6. 탄막 패턴 시스템

### 패턴 구조

```js
{ n: string, c: number[], laser?: number[] }
// n     : 패턴 이름
// c     : 탄막이 소환될 열 인덱스 배열 (낙하탄)
// laser : (선택) 광선을 충전할 열 — c가 비어 있고 laser만 있는 패턴은 낙하탄 없이 광선만
```

### 패턴 사전 (`PAT` — engine.jsx)

| key | 이름 | 열 |
|-----|------|-----|
| `twin` | 양날 | 0,1,5,6 |
| `rwall` | 우측 벽 | 4,5,6 |
| `lwall` | 좌측 벽 | 0,1,2 |
| `center` | 중앙 압박 | 2,3,4 |
| `diag` | 사선 | 0,2,4,6 |
| `rdiag` | 역사선 | 1,3,5 |
| `vshape` | V자 | 0,1,2,5,6 |
| `ivshape` | 역V자 | 2,3,4,5,6 |
| `focus` | 집중 포화 | 1,2,3,4,5 |
| `barrage` | 폭격 | 0,1,2,4,5,6 |
| `single` | 저격 | 3 |
| `edges` | 양끝 | 0,6 |
| `gapL` | 좁은 틈 | 0,1,2,3,4,5 |
| `gapR` | 좁은 틈 | 1,2,3,4,5,6 |
| `comb` | 빗살 | 0,2,4,6 |

### 엔드리스 패턴 선택 (`rp`)

레거시 풀 `EP`(쉬움: twin/rwall/lwall/center/diag/rdiag) · `HP`(어려움: vshape/ivshape/focus/barrage)에서 턴에 따라 선택.

```js
const rp = (t) => {
  const pool =
    t < 15 ? EP :
    t < 35 ? (Math.random() < 0.30 ? HP : EP) :
    t < 55 ? (Math.random() < 0.55 ? HP : EP) :
             (Math.random() < 0.75 ? HP : EP);
  return pool[Math.floor(Math.random() * pool.length)];
};
```

### 소환 주기 (엔드리스)

```js
si = t < 30 ? 2 : (Math.random() < (t < 50 ? 0.25 : 0.48) ? 1 : 2);
```

스테이지 모드는 `HXS.stageInterval(stage)` = `stage.interval || 2` 사용.

### 미리보기 (패턴 카드)

- **다음 소환** (`np`): 항상 표시. `si === 1 && fz === 0`이면 `imminent` 강조 (● 점)
- **그 다음** (`np2`): 흐리게 표시
- 정지(`fz > 0`) 중이면 "— 정지 중 —" 표시

> 참고: 보드 위 위험/예고 셀 하이라이트(`dangerSet`/`previewSet`)는 **예지(`ht > 0`)일 때만** 표시된다.

---

## 7. 스테이지 시스템 (4가지 모드)

스테이지 정의는 `stages.jsx`의 `STAGES` 배열(현재 **24개**). 진입 시 `initStage(idx)`가 상태를 생성.

### 목표 타입

| type | 클리어 조건 | 핵심 필드 |
|------|-------------|-----------|
| `normal` | 게이트(`goal`) 도달 | `goal: {r,c}` |
| `survive` | `surviveTurns`턴 생존 | `surviveTurns` |
| `collect` | 모든 `gems` 수집 | `gems: [{r,c}, ...]` |
| `boss` | 모든 보스 웨이브 격파 + 잔탄 정리 | `phases[]`, `bossTotal` |

### 공통/선택 필드

```js
{
  id, type, name, sub, tip,        // 메타
  interval,                        // 소환 주기 (기본 2)
  pool: [Pattern, ...],            // normal/survive/collect의 패턴 풀
  phases: [{type, turns, name, n?, aim?}], bossTotal,  // boss 전용
  // ── 선택 기믹 ──
  walls, turrets, spikes, enemies, // 배치 기믹
  start, firstDelay,               // 시작 위치 / 첫 소환 지연
}
```

### 24 스테이지 개요

| # | 타입 | 이름 | 기믹 |
|---|------|------|------|
| 1 | normal | 여명 | — |
| 2 | normal | 돌파 | 게이트 좌측 |
| 3 | survive | 버티기 (12턴) | — |
| 4 | collect | 수집가 (별 4) | — |
| 5 | normal | 미궁 | 벽 |
| 6 | **boss** | 파수꾼 (14) | 산탄·조준·협공 |
| 7 | normal | 강행 | 두꺼운 패턴 |
| 8 | survive | 추격전 (16턴) | 추적자 1 |
| 9 | collect | 보물고 (별 6) | — |
| 10 | normal | 봉쇄선 | 벽 + 추적자 |
| 11 | **boss** | 포격수 (18) | 조준·휩쓸기·협공·폭우 |
| 12 | survive | 폭풍전야 (20턴) | 추적자 2 |
| 13 | collect | 미로의 별 (별 7) | 벽 |
| 14 | normal | 최후의 관문 | 벽 + 추적자 2 |
| 15 | **boss** | 군주 (22) | 5페이즈 + 추적자 |
| 16 | normal | 가시밭 | 가시 |
| 17 | survive | 포대 (14턴) | 포대 2 |
| 18 | collect | 가시 보고 (별 6) | 가시 |
| 19 | **boss** | 포식자 (18) | 확산·조임·교차·조준 |
| 20 | normal | 광선 회랑 | 광선 패턴 |
| 21 | survive | 섬광 추격 (16턴) | 광선 + 추적자 |
| 22 | collect | 요새 (별 7) | 포대 + 벽 |
| 23 | normal | 시련의 길 | 가시·벽·포대·광선·추적자 총집결 |
| 24 | **boss** | 심연 (TRUE FINAL, 23) | 6페이즈 + 추적자 + 추적 광선 |

### `initStage(idx)`

`STAGES[idx]` 정의로 초기 상태를 만든다. 기믹 배열은 **얕은 복사**(`.map(x => ({...x}))`)해서
원본 정의를 변형하지 않는다. `np`/`np2`는 `pickPattern`으로 미리 채운다.
첫 소환 지연 `si = def.firstDelay ?? 1`.

### HUD 목표 텍스트 (`objText`)

| type | 라벨 | 값 | 진행바 |
|------|------|-----|--------|
| normal | 포탈까지 | `{거리}칸` | 없음 |
| survive | 생존 | `{남은}턴` | 1 - 남은/전체 |
| collect | 별 | `{획득}/{전체}` | 획득/전체 |
| boss | (현재 페이즈명) | `{남은}/{전체}` | 남은/전체 (HP 바) |

---

## 8. 보스 공격 생성기

보스는 `phases[]`를 순서대로 진행한다. `phaseFor(stage, w)`가 누적 `turns`로 현재 페이즈를
계산하고, `bossAtk(atk, s)`가 그 페이즈의 공격을 패턴 `{n, c, laser?}`로 생성한다.

`pickPattern(stage, t, s)` — 보스면 `bossAtk`, 아니면 `pool`에서 랜덤.

### 핑퐁 헬퍼 (`ping`)

```js
const ping = (w) => { const m = (C-1)*2; const x = ((w%m)+m)%m; return x < C ? x : m - x; };
```

0 → C-1 → 0 을 **매 웨이브 정확히 1칸씩** 오가는 인덱스. 안전 칸이 도약·랩어라운드 없이
1칸씩만 이동하게 해서 **항상 회피 가능**하도록 보장하는 핵심 장치.

### 공격 타입

| type | 이름(기본) | 동작 |
|------|-----------|------|
| `rain` | 산탄 | 랜덤 `n`개 열 (기본 3) |
| `aimed` | 조준 사격 | 플레이어 열 ±1 (3열) |
| `pincer` | 협공 | 0,1 과 끝 2열 |
| `sweep` | 휩쓸기 | `ping(w)`와 +1, 2열 벽이 좌우로 이동 |
| `sweepGap` | 빗장 | `ping(w)` 한 열만 안전, 나머지 전부 |
| `full` | 전탄 발사 | `ping(w)`·+1 두 인접 칸만 안전, 나머지 전부 |
| `converge` | 조여오기 | 대칭 열이 안쪽으로 step, 4웨이브마다 리셋 |
| `alternate` | 교차탄 | 홀/짝 열 번갈아 (체커보드) |
| `spread` | 확산탄 | 중앙에서 바깥으로 펄스, 가장자리 2열 항상 안전 |
| `laser` | 광선 | 낙하탄 없음 — `aim`이면 플레이어 열, 아니면 `ping(w)` 열에 광선 충전 |

> 설계 원칙: `sweepGap`/`full`/`converge`/`spread`는 모두 **안전 칸이 반드시 존재**하고
> 그 칸이 1턴에 1칸씩만 움직이도록 캡을 둬서, 이론상 완전 회피가 가능하다.

---

## 9. 기믹: 벽 · 포대 · 가시 · 광선 · 추적자 · 게이트 · 별

| 기믹 | 이동 차단 | 탄막 차단 | 충돌 시 | 비고 |
|------|:--------:|:--------:|---------|------|
| **벽** (`walls`) | ✅ | ✅ | — | 단단한 블록 |
| **포대** (`turrets`) | ✅ | ✅ | — | `t % period === phase`마다 아래로 발사. 발사 1턴 전 칸 경고 |
| **가시** (`spikes`) | ❌ | ❌ | 즉사 | 탄막은 가시 위를 그냥 지나감 |
| **광선** (`lasers`) | ❌ | ❌ | 즉사 | 충전(`charge`) 후 **세로 한 열 전체** 관통. 정지 중엔 충전 멈춤 |
| **추적자** (`enemies`) | — | — | 즉사 | 半속도(홀수 턴만) 그리디 추적. 폭탄으로 제거 가능 |
| **게이트** (`goal`) | ❌ | — | — | `normal` 목표. 도달 시 클리어. 게이트 열엔 탄막 미소환 |
| **별** (`gems`) | ❌ | ❌ | — | `collect` 목표. 도달 시 수집 (+80+combo×4). 탄막에 파괴 안 됨 |

**차단 집합**: `block = [...walls, ...turrets]`. 탄막 이동·소환·플레이어 이동 모두 이 집합으로 막힌다.
가시·광선·게이트·별은 `block`에 들어가지 않는다.

---

## 10. 아이템 시스템

> **엔드리스 전용.** 스테이지 모드에선 유틸 아이템이 스폰되지 않는다(별/게이트만).

### 아이템 타입 (4종)

| ty | 심볼 | 효과 |
|----|------|------|
| `'sc'` | ★ | +50 + combo×3 점수 |
| `'bm'` | ✸ | 반경 2칸 탄막 **+ 추적자** 제거 |
| `'tp'` | ✦ | `safest`로 계산한 가장 안전한 셀로 순간이동 |
| `'ht'` | ◉ | 예지(foresight) 5턴 — 다음 탄막·소환 예고를 보드에 표시 |

### 스폰 (`tryItem`)

```js
if (its.length >= 3) return its;          // 최대 3개
if (Math.random() > 0.24) return its;     // 24% 확률
// 탄막·플레이어·기존 아이템과 겹치지 않는 row 1 ~ R-2 칸에 배치
const roll = Math.random();
const ty = roll < 0.45 ? 'sc' : roll < 0.63 ? 'bm' : roll < 0.75 ? 'tp' : 'ht';
```

확률: sc 45% · bm 18% · tp 12% · ht 25%.

### 획득 / 파괴

- 플레이어가 아이템 셀에 도착하면 자동 획득.
- 탄막이 아이템 셀을 덮으면 아이템 **파괴**(`idel` 이벤트, ✕ 표시).
- 순간이동(`tp`)은 목적지에서 다시 `safest` 셀로 이동 후 충돌 판정.

---

## 11. 스킬 시스템

점수를 소모해 즉시 사용. 사용 시 `skillUses++` (스테이지 별점에 영향).

| 스킬 | 비용 | 효과 | 사용 조건 |
|------|------|------|-----------|
| ↶ 뒤로가기 (`doUndo`) | 30점 | 직전 이동 전 상태 복구 | `hist`존재 · `!ov` · `!win` |
| ✸ 폭탄 (`doBomb`) | 50점 | 반경 2칸 탄막+추적자 즉시 제거 | `!ov` · `!win` |
| ❄ 정지 (`doFreeze`) | 80점 | 3턴간 탄막+소환+광선충전 중단 | `fz === 0` · `!ov` · `!win` |

```js
const doUndo = (s) =>
  (!s.hist || s.sc < 30 || s.ov || s.win) ? s
  : { ...s.hist, sc: s.sc - 30, hist: null, ov: false, win: false, evts: [],
      skillUses: (s.skillUses || 0) + 1 };

const doBomb = (s) => {
  if (s.sc < 50 || s.ov || s.win) return s;
  const xc = s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) <= 2);
  return { ...s,
    bl: s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) > 2),
    enemies: (s.enemies||[]).filter(e => hd(s.pl.r, s.pl.c, e.r, e.c) > 2),
    sc: s.sc - 50, skillUses: (s.skillUses||0)+1,
    evts: [{ ty: 'bm', r: s.pl.r, c: s.pl.c, cells: xc.map(b => `${b.r},${b.c}`) }] };
};

const doFreeze = (s) =>
  (s.sc < 80 || s.fz > 0 || s.ov || s.win) ? s
  : { ...s, fz: 3, sc: s.sc - 80, skillUses: (s.skillUses||0)+1, evts: [] };
```

- **뒤로가기**: `hist`는 매 `tick` 시작 시 `{ ...s, evts: [] }`로 저장(1단계만). 게임오버 전이라도 `ov`/`win` 강제 해제. 점수는 현재 점수에서 30 차감.
- `tick` 내부에서 `fz > 0`이면 탄막 이동·`si` 감소·소환·광선 충전·포대 발사·추적자 이동이 모두 멈춘다.

---

## 12. 난이도 스케일링 (엔드리스)

| 구간 | 라벨 | 패턴 | 소환 주기 |
|------|------|------|-----------|
| 0~14턴 | EASY / 초급 | EP만 | 항상 2턴 |
| 15~34턴 | NORMAL / 중급 | HP 30% | 항상 2턴 |
| 35~59턴 | HARD / 고급 | HP 55% | 25% 확률로 1턴 |
| 60턴~ | CHAOS / 극한 | HP 75% | 48% 확률로 1턴 |

```js
const DL = (t) =>
  t < 15 ? { lb: 'EASY',   sub: '초급', c: '#5eead4' } :
  t < 35 ? { lb: 'NORMAL', sub: '중급', c: '#fbbf24' } :
  t < 60 ? { lb: 'HARD',   sub: '고급', c: '#fb7185' } :
           { lb: 'CHAOS',  sub: '극한', c: '#f43f5e' };
```

스테이지 모드의 난이도는 `STAGES` 정의(패턴 풀·기믹·보스 페이즈)로 결정되며 `DL`을 쓰지 않는다.

---

## 13. 아트 레지스트리 & 스프라이트

게임 로직과 아트가 **완전히 분리**돼 있다. 모든 그래픽은 `resources.jsx`의 `RES` 테이블 한 곳에서 정의/교체.

### 두 가지 아트 종류

```js
// 1) PIXEL — 문자 grid + 컬러 map
drone: { kind:'pixel', grid: DRONE, map: DRONE_MAP, px: 2.3, ox, oy },
//   grid: 등길이 문자열 배열 ('.'/' ' = 빈 픽셀),  map: char→색,  px: 픽셀 크기
//   ox/oy: 원점 셀(기본 중앙)

// 2) IMAGE — 직접 만든 PNG/SVG/GIF (assets/에 두고)
player: { kind:'image', src:'assets/hero.png', w:34, h:34, dx?, dy?, smooth? },
//   smooth:true → 일반 스케일,  생략 → pixelated (픽셀아트용)
```

### 레지스트리 키

| 키 | 대상 | 키 | 대상 |
|----|------|----|------|
| `player` | 용사(플레이어) | `gem` | 수집 별 |
| `drone` | 낙하 탄막 | `chaser` | 추적자 |
| `droneFz` | 정지 중 탄막 | `spike` | 가시(즉사) |
| `star` | 점수 픽업 ★ | `turret` | 포대 ▲ |
| `bomb` | 폭탄 픽업 ✸ | `portal` | 게이트(목표) |
| `tp` | 순간이동 픽업 ✦ | `wall` | 벽 (기본 vector) |
| `hint` | 예지 픽업 ◉ | `explode` | 폭발 버스트 |

- `drawArt(name, {warn})` — 레지스트리 항목을 SVG로 변환. `warn`이면 경고 처리
  (픽셀 빨강 외곽선 `warnStroke` / 포대 머즐 색 `warnMap` / 이미지 링).
- `isImage(name)` — 이미지로 교체됐는지 확인 (스프라이트가 벡터 장식 생략 판단용).

### 스프라이트 컴포넌트 (`sprites.jsx`)

아트는 없고 **그림자 + 애니메이션 + 경고 래퍼**만 담당. 종류: `PlayerSprite`(홉/페이싱/사망 포즈),
`BulletSprite`(호버), `Star/Bomb/Tp/HintSprite`(경고), `ExplodeSprite`(xboom), `PortalSprite`(스핀),
`WallSprite`(벡터 또는 이미지), `GemSprite`(링+bob), `ChaserSprite`(펄스), `SpikeSprite`, `TurretSprite`.

> 리스킨은 `resources.jsx`만 수정하면 끝. 스프라이트/엔진/앱은 건드릴 필요 없다.

---

## 14. 화면 & 진행도 (localStorage)

### 화면 흐름 (`app.jsx`)

```
menu ─┬─ ◈ 스테이지 → select → (스테이지 선택) → play
      └─ ∞ 엔드리스 ───────────────────────────→ play
```

`App`이 `screen`(`menu`|`select`|`play`)과 `g`를 관리. `GameView`는 `key={runId}`로 재도전 시 깨끗이 리마운트.

### 진행도 저장 (`stages.jsx`)

```js
localStorage 'hex_stage_stars' : { [stageId]: stars }   // 별점(최댓값 유지)
localStorage 'hex_hi'          : number                 // 엔드리스 최고점
```

- `loadStars()` / `saveStars(id, stars)` — 별점 저장(기존보다 높을 때만 갱신).
- `isUnlocked(idx, stars)` — 0번이거나 직전 스테이지에 별점이 있으면 잠금 해제.
- `rateStage(s)` — **3성: 스킬 0회 · 2성: ≤2회 · 1성: 클리어**.

### 화면 컴포넌트 (`screens.jsx`)

`Stars`(별 표시), `MenuScreen`(모드 선택), `StageSelect`(24타일 그리드, 잠금/별점),
`ClearOverlay`(클리어 — 별점·점수·턴·다음/재도전/목록), `FailOverlay`(실패 — 재도전/목록).

---

## 15. 시각 효과 시스템

게임 상태(`g`)와 분리된 로컬 상태(`GameView` 내부 `useState`)로 관리. `g.evts` 변화를
`useEffect`로 감지해 효과를 실행한다.

| 효과 | 상태 | 지속 | 트리거 |
|------|------|------|--------|
| 폭발 셀 | `xCells: Set` | 700ms | `bm` 이벤트 (`boom`) |
| 플로팅 텍스트 | `floats: []` | 1100ms | sc/gem/bm/tp/ht/idel 이벤트 (`addFloat`) |
| 광선 빔 플래시 | `beams: []` | 280ms | `laser` 이벤트 (`flashBeam`) |
| 웨이브 플래시 | `waveTxt` | 800ms | `g.ln` (소환된 패턴명) |

```js
useEffect(() => {
  (g.evts || []).forEach(ev => {
    const { x, y } = HX.hc(ev.r, ev.c);
    if (ev.ty === 'sc')   addFloat(`+${ev.val}`, x, y-6, '#fbbf24');
    else if (ev.ty === 'gem') addFloat(`+${ev.val}`, x, y-6, '#fde68a');
    else if (ev.ty === 'bm')  { boom(ev.cells); addFloat('BOOM!', x, y-6, '#34d399'); }
    else if (ev.ty === 'tp')  addFloat('WARP!', x, y-6, '#c084fc');
    else if (ev.ty === 'ht')  addFloat('+예지', x, y-6, '#f97316');
    else if (ev.ty === 'idel') addFloat('✕', x, y-4, '#7a82b0');
    else if (ev.ty === 'laser') flashBeam(ev.c);
  });
}, [g.evts]);
```

플레이어 페이싱/홉은 `pfxRef`로 **턴이 바뀔 때만** 재계산해 다른 리렌더에 흔들리지 않게 한다.

---

## 16. 컨트롤

### 키보드

| 키 | 동작 |
|----|------|
| Q | NW (↖) |
| E | NE (↗) |
| A / ArrowLeft | W (←) |
| D / ArrowRight | E (→) |
| Z | SW (↙) |
| X | SE (↘) |
| Space / S / W | 대기 |
| R | 재도전 / 재시작 |

키보드 핸들러는 `useEffect(..., [setG, onRetry])`로 등록. `setG(s => ...)` 패턴으로 stale closure 방지.

### 그리드 클릭/탭

플레이어의 6방향 이웃 셀(또는 자기 셀=대기) 클릭 → 이동. 게임오버/클리어 상태에선 무시.

---

## 17. 렌더링 우선순위

각 셀의 fill/stroke 결정 순서 (`Cell`, app.jsx — 위에서부터 우선):

```
1. 벽 / 포대            → 어두운 블록
2. 폭발 중 (xCells)      → 오렌지
3. 플레이어             → 사망 빨강 / 생존 파랑
4. 광선 발사 직전(laser1) → 빨강 + 빗금
5. 게이트(goal)          → 보라
6. 탄막(bullet)          → 빨강
7. 가시(spike)           → 진홍
8. 위험+예고 겹침         → 노랑(강)
9. 위험(danger)          → 빨강 (예지 시만)
10. 예고(preview)        → 노랑 (예지 시만)
11. 광선 경고(laser2)     → 청록
12. 포대 발사 경고        → 노랑
13. 이동 가능(move)       → 청록 + 점
14. 기본                 → 어두운 남색
```

스프라이트는 셀 위에 별도 `<g>` 레이어로 그려지며, 마지막에 플레이어 → 폭발 → 광선 빔 → 플로팅 텍스트 순.

---

## 18. 알려진 이슈 및 TODO

### 알려진 이슈 / 설계상 주의점

- **보스 종료 타이밍**: `boss` 승리는 `bossWaves >= bossTotal && 잔탄 === 0`. 광선 위주 페이즈로 끝나면 낙하탄이 없어 거의 즉시 클리어될 수 있음. (의도 확인 필요)
- **순간이동 연쇄 없음**: `tp` 목적지에 아이템이 있어도 추가 획득하지 않음(무한 루프 방지).
- **광선 회피 난이도**: 광선은 열 전체 즉사라, 해당 열에 한 칸이라도 있으면 사망 — 회피 창이 좁다.
- **Safari 호환성**: SVG CSS transform 애니메이션이 일부 환경에서 미작동 가능.

### TODO

#### 게임플레이
- [ ] 탄막 드리프트(대각 낙하) 패턴
- [ ] 방어막 아이템 — 1회 피격 방어
- [ ] 스코어 부스터 — N턴 점수 2배
- [ ] 추적자 종류 다양화(`kind` 활용 — 현재 `chase`만)

#### UI/UX
- [ ] 폭탄 스킬 사용 전 반경 2 미리보기(마우스 오버)
- [ ] 아이템/기믹 효과 툴팁
- [ ] 사운드 이펙트(Web Audio API)
- [ ] 모바일 터치 스와이프 → 방향 매핑

#### 기술
- [ ] JSX + Babel 빌드 파이프라인으로 전환(가독성/성능)
- [ ] 상태 관리 `useReducer`로 리팩터링
- [ ] 순수 함수 단위 테스트 — `tick`, `hd`, `safest`, `stepToward`, `bossAtk`, `ping`

---

## 19. 부록: 주요 함수 요약

### engine.jsx (`window.HX`)

| 함수 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `hc(r,c)` | 행, 열 | `{x,y}` | 헥스 중심 SVG 좌표 |
| `hp(cx,cy,s?)` | 중심, 반지름 | path 문자열 | 헥스 패스 생성 |
| `hd(r1,c1,r2,c2)` | 두 셀 | number | 헥스 거리 |
| `D(r)` | 행 | 방향 배열 | odd/even 행 6방향 |
| `safest(bl,pl,walls?)` | 탄막/플레이어/벽 | `{r,c}` | 가장 안전한 빈 셀 |
| `tryItem(its,pl,bl)` | 아이템/플레이어/탄막 | 아이템 배열 | 엔드리스 아이템 스폰 |
| `stepToward(e,target,walls,others)` | 적/타깃/벽/타적 | `{r,c}` | 추적자 1스텝 |
| `rp(t)` | 턴 | Pattern | 엔드리스 패턴 선택 |
| `DL(t)` | 턴 | `{lb,sub,c}` | 엔드리스 난이도 라벨 |
| `tick(s,nr,nc)` | 상태,목적지 | GameState | **메인 게임 루프** |
| `doUndo/doBomb/doFreeze(s)` | 상태 | GameState | 스킬 |
| `initState()` | — | GameState | 엔드리스 초기 상태 |

### stages.jsx (`window.HXS`)

| 함수 | 설명 |
|------|------|
| `STAGES` | 24 스테이지 정의 배열 |
| `pickPattern(stage,t,s)` | 다음 웨이브 패턴 선택(보스=`bossAtk`) |
| `bossAtk` / `phaseFor` / `bossPhaseName` | 보스 공격 생성 / 페이즈 계산 / 페이즈명 |
| `stageInterval(stage)` | 소환 주기 |
| `initStage(idx)` | 스테이지 초기 상태 생성 |
| `objText(s)` | HUD 목표 텍스트/진행도 |
| `loadStars/saveStars/isUnlocked/rateStage` | 진행도(localStorage)·잠금·별점 |
| `TYPE_META` | 목표 타입별 아이콘/라벨/색 |

### resources.jsx (`window.HXR`)

| 함수/값 | 설명 |
|---------|------|
| `RES` | 아트 레지스트리 테이블 |
| `drawArt(name,{warn})` | 레지스트리 항목 → SVG |
| `px(grid,map,p,cx,cy,stroke)` | 픽셀 grid → `<rect>` 배열 |
| `isImage(name)` | 이미지 교체 여부 |
