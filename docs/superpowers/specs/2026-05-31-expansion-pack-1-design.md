# 확장팩 1탄 "심화 기믹" — 설계 문서

> 작성일: 2026-05-31 · 대상: HEX DANMAKU (`d:\00.project\hex\hex-danmaku`)
> 상태: 설계 확정 대기 → 이후 writing-plans로 구현 계획 작성

---

## 1. 목표 & 범위

기존 24 스테이지에 새 메커니즘을 도입해 **기존 스테이지 일부를 리워크**한다. 새로 만들 "재료"는
네 카테고리 전부:

- 새 탄막 움직임 3종
- 새 적 AI 2종
- 새 필드 기믹 2종
- 새 보스 공격 4종

그리고 이를 시연하는 **스테이지 리워크 6곳**(일반 4 + 보스 2). 신규 메커니즘을 빠짐없이 노출하기 위한 최소 구성.

### 설계 철학 (불변 제약)

1. **항상 회피 가능 (순수 실력)** — 모든 신규 메커니즘은 이론상 완벽 회피가 가능해야 한다.
   불가피한 피해 없음. 매 턴 안전한 이동지가 최소 1개 보장된다.
2. **결정론 + 예고** — 위협은 결정론적이거나 한 턴 전 예고된다. RNG 즉사 없음.
3. **레지스트리 주도 확장** — 이 코드베이스가 이미 쓰는 테이블 관용구(`RES`·`PAT`·`STAGES`·`bossAtk`)를
   `tick`에 하드코딩된 병목(탄 이동·적 AI·기믹)까지 확장한다. 새 콘텐츠 = "테이블 항목 추가".
4. **테스트 먼저** — 리팩터링 전에 순수 함수 테스트를 깐다. 초록 상태에서만 리팩터링/추가.

### 비목표 (1탄 제외, 2탄 후보)

- 통합 액터 모델 전면 리팩터링 (오버엔지니어링)
- 신규 스테이지 추가 (25번~) — 1탄은 리워크만
- 엔드리스 모드 신규 콘텐츠 — 별도 작업
- 사운드·모바일 입력·빌드 파이프라인 전환
- **보스 존재감(2탄 후보)**: 현재 보스는 사실상 "스크립트된 버티기"라 생존 모드와 체감이 비슷하다. 2탄에서 보드 상단 보스 스프라이트 + 웨이브마다 줄어드는 두꺼운 HP바 + 페이즈 전환 배너("PHASE 2: 조준 사격")로 "쓰러뜨린다"는 존재감을 부여한다. 공격은 회피 전용 정체성 유지. (플레이테스트 피드백 2026-06-01)

---

## 2. 아키텍처 골격

### 2.1 테스트 하니스 (선행 작업)

`engine.jsx`·`stages.jsx`는 **React/JSX가 없는 순수 JS**다 (`window`에만 의존). 따라서 빌드 없이
Node `vm`으로 로드해 테스트할 수 있다.

- `tests/harness.mjs`: `engine.jsx` → `stages.jsx`를 읽어 stub된 `window`가 든 샌드박스에서 평가.
  `Math.random`을 시드 PRNG로 교체 주입(결정론적 테스트). `window.HX`·`window.HXS`를 반환.
- `tests/*.test.mjs`: `node --test`로 실행.
- 의존성 0. `package.json`에 `"test": "node --test tests/"` 스크립트만 추가(있으면).

**선행 테스트 대상(현행 동작 고정):** `hd`, `safest`, `stepToward`, `tick`(직하 낙하·소환·충돌·승리),
`bossAtk`(각 타입), `ping`. → 이게 초록이어야 리팩터링 시작.

### 2.2 레지스트리 3종

| 레지스트리 | 위치 | 항목 형태 | 신규 추가 비용 |
|-----------|------|-----------|----------------|
| 탄 movement | 탄 객체 필드 `vc`/`bounce`/`fuse` (+ 패턴 `vc`/`cells`) | 데이터 | 항목 0 (데이터만) |
| `ENEMY_KINDS` | `engine.jsx` | `{ step(e, ctx), telegraph?(e, ctx) }` | 항목 1개 |
| `GIMMICKS` | `engine.jsx` | `{ blocksMove?, blocksBullet?, lethal?, onEnter?(s,e,cell), posAt?(g,cell) }` | 항목 1개 |

`bossAtk`는 이미 사실상 레지스트리(switch) — 새 case만 추가하고, 가독성을 위해 맵으로 전환은 선택.

---

## 3. 새 탄막 움직임 (3종)

탄 객체를 `{ r, c }` → `{ r, c, vc?, bounce?, fuse? }`로 확장. 필드가 없으면 **기존 직하와 100% 동일**.

### 3.1 이동 로직 변경 (`tick` 내 탄 이동 블록)

```js
mv = s.bl
  .map(b => {
    // 지연 지뢰: 제자리에서 카운트다운 (낙하 안 함)
    if (b.fuse != null) return { ...b, fuse: b.fuse - 1 };
    // 일반/드리프트/지그재그
    let vc = b.vc || 0;
    let nc = b.c + vc;
    if (b.bounce && (nc < 0 || nc >= C)) { vc = -vc; nc = b.c + vc; } // 가장자리 반사
    return { ...b, r: b.r + 1, c: nc, vc };
  })
  .filter(b =>
    b.fuse != null
      ? b.fuse >= 0                                   // 폭발(0) 다음 턴 제거
      : (b.r < R && b.c >= 0 && b.c < C && !block.some(w => w.r === b.r && w.c === b.c)));
```

### 3.2 충돌 판정 변경

지뢰는 `fuse === 0`인 턴에만 치명. 일반 탄은 기존대로.

```js
const hitBullet = mv.some(b =>
  b.r === finalR && b.c === finalC && (b.fuse == null || b.fuse === 0));
```

### 3.3 종류 요약

| 이름 | 필드 | 동작 | 회피 보장 |
|------|------|------|-----------|
| 드리프트 | `vc:±1` | 매 턴 아래+옆 1칸 | 1행/턴 낙하 유지 → 반응창 동일, 열만 추적 |
| 지그재그 | `vc + bounce:true` | 가장자리에서 부호 반전 | 경로 완전 결정론적 |
| 지연 지뢰 | `fuse:N` | fuse>0 무해 예고 → fuse=0 1턴 치명 후 소멸 | 한 턴 전 예고된 칸만 회피 |

### 3.4 렌더링 (app.jsx / resources)

- 드리프트/지그재그: 기존 드론 아트 재사용, `vc` 부호로 미세 기울임/꼬리 표시(선택).
- 지뢰: `fuse>0` → 경고 마커(점멸 테두리), `fuse=0` → 치명(폭발색). `bulletSet`/`dangerSet` 계산 시 fuse 분기.

---

## 4. 새 적 AI (2종) — `ENEMY_KINDS`

기존 `chase`도 테이블에 합류시켜 통일. `tick`의 추적자 블록은 디스패치로 교체.

```js
const ENEMY_KINDS = {
  chase: {  // 기존: 반속(홀수 턴) 그리디 추적
    step: (e, ctx) => { if (ctx.t % 2 === 1) { const p = stepToward(e, ctx.player, ctx.block, ctx.others); e.r = p.r; e.c = p.c; } },
  },
  bounce: { // 신규: 고정 방향 직선 + 반사
    step: (e, ctx) => { /* e.dir 방향 1칸, 벽·가장자리면 방향 반전 후 이동 */ },
  },
  lunge: {  // 신규: 2턴 예고 → 3턴째 2칸 돌진
    step: (e, ctx) => { /* e.cd 카운트다운, 0이면 e.face 방향 2칸 돌진 후 재충전 */ },
    telegraph: (e, ctx) => [/* 돌진 예정 레인 셀들 (cd===1일 때만) */],
  },
};
```

```js
// tick 내 교체 (적 이동)
if (s.fz <= 0 && enemies.length) {
  const moved = [];
  const ctx = { t: s.t, player: { r: finalR, c: finalC }, block, others: moved, R, C, D };
  for (const e of enemies) { (ENEMY_KINDS[e.kind] || ENEMY_KINDS.chase).step(e, ctx); moved.push(e); }
}
```

| 이름 | kind | 상태 필드 | 동작 | 회피 보장 |
|------|------|-----------|------|-----------|
| 반사체 | `bounce` | `dir`(방향 인덱스) | 1칸/턴 직선, 벽·가장자리 반사 | 플레이어와 무관한 예측 경로 |
| 돌격수 | `lunge` | `cd`(카운트), `face`(방향) | 2턴 정지+예고 → 2칸 돌진 | 돌진 레인 한 턴 전 예고 |

- 폭탄 스킬의 적 제거 로직(`doBomb`)·`stepEnemy`/`hitEnemy` 충돌은 공통 유지.
- 돌진은 **1칸씩 2스텝**으로 구현해 중간 통과 셀도 충돌 판정에 포함(플레이어 셀을 지나가면 사망). 이게 canonical 구현.
- `telegraph`는 app.jsx의 memo에서 호출해 경고 셀(`dangerSet`류)에 합침.

---

## 5. 새 필드 기믹 (2종) — `GIMMICKS`

신규 기믹만 레지스트리로 라우팅하고, 기존 wall/turret/spike/laser는 1탄에서 건드리지 않는다(위험 최소).
단, `GIMMICKS` 테이블에 기존 타입의 선언적 속성도 함께 기재해 미래 통합 기반을 만든다.

```js
const GIMMICKS = {
  wall:   { blocksMove: true,  blocksBullet: true },
  turret: { blocksMove: true,  blocksBullet: true },
  spike:  { lethal: true },
  crack:  { blocksMove: (g, cell) => cell.broken, blocksBullet: false, lethal: false,
            onLeave: (s, cell) => { cell.broken = true; } },
  pad:    { blocksMove: false, lethal: false,
            onEnter: (s, cell, finalRef) => { /* finalRef를 dir 방향 1칸으로 밀기 */ } },
};
```

### 5.1 부서지는 발판 `crack`

- 상태: `cracks: [{ r, c, broken: false }]`.
- 플레이어가 crack 셀에서 **떠나는 순간** `broken=true` → 이후 `block`에 포함되어 이동 차단(벽처럼).
  탄막은 통과(`blocksBullet:false`).
- 구현: tick 시작 시 `s.pl`이 crack 셀이고 이동(stay=false)이면 해당 crack을 broken으로 표시한 새 배열 반환.
  `block` 구성: `[...walls, ...turrets, ...cracks.filter(c=>c.broken)]`.
- 공정성: 그 자체로 치명 아님. 순수 루팅 퍼즐. **스테이지 설계 시 항상 통로 존재를 테스트로 보장.**

### 5.2 컨베이어 발판 `pad`

- 상태: `pads: [{ r, c, dir }]` (`dir` = 6방향 인덱스).
- 플레이어의 이동 목적지가 pad면, **충돌/아이템 판정 전에** `dir` 방향 이웃으로 1칸 밀어 `finalR/finalC` 갱신.
  밀린 칸이 벽/범위 밖이면 밀지 않음. 밀림은 **1회만**(연쇄 금지, 무한 루프 방지).
- 화살표 상시 표시 + 예지로 착지 칸 예측 가능 → 결정론적.
- 공정성: 레벨 설계 시 "pad에 강제로 들어가 죽는 경로만 남지 않음"을 테스트로 보장.

> 대안(보류): `ice`(미끄러짐), `mwall`(주기적 이동벽). 컨베이어 유지로 확정.

---

## 6. 새 보스 공격 (4종) — `bossAtk` case 추가

각각 다른 신규 시스템을 시연. 모두 ping/안전칸 보존 원칙 유지.

### 6.1 패턴 스폰 일반화 (선행)

현재 소환은 `np.c`(열) → row 0 탄. 두 가지를 추가:

1. 패턴에 `vc` 있으면 스폰 탄에 전달: `cols.map(c => ({ r: 0, c, vc: np.vc }))`.
2. 패턴에 `cells`(명시 셀 배열) 있으면 그걸 스폰: `np.cells.map(cell => ({ ...cell }))`.
   (mark의 임의 위치 지뢰, 미래 임의 배치 패턴에 사용)
3. 패턴에 `summon` 있으면 탄 대신 적을 `spawnedEnemies`에 추가 → 적 클론 후 병합.

### 6.2 종류

| 이름 | type | 반환/효과 | 시연 | 회피 보장 |
|------|------|-----------|------|-----------|
| 나선탄 | `spiral` | `ping` 기반 회전 발사열 (대각 휩쓸기) | ping 회전 | 안전 칸 1칸/턴 이동 |
| 소환 | `summon` | `{ n, c:[], summon:{kind:'bounce', r, c, dir} }` | 적 레지스트리 | add가 공정 → 공정 |
| 각인탄 | `mark` | `{ n, cells:[{r,c,fuse:1}...] }` (플레이어 주변 등) | 지연 지뢰 | 예고 칸만 회피 |
| 사선 포화 | `drift` | `{ n, c:[cols], vc:+1 }` | 드리프트 | 결정론적 대각 경로 |

- `spiral` 안전칸 이동 ≤1/턴, `mark`는 마킹 칸 외 안전지 존재 — 둘 다 단위 테스트로 보장.
- `summon`은 동시 add 수 상한(예: 1~2기)을 둬 과밀 방지.
- 보스 승리 조건(`bossWaves >= bossTotal && mv.length === 0`)은 1탄에서 **변경하지 않음** — 남아 있는 add는 승리를 막지 않는다(add는 일시적 압박). summon 웨이브도 `bossWaves`를 증가시킨다.

---

## 7. 스테이지 리워크 (6곳: 일반 4 + 보스 2)

"가르치고(쉬운 도입) 시험한다" 원칙. 기존 정의는 `STAGES` 데이터 편집 위주.

| 스테이지 | 현재 | 추가 | 도입 메커니즘 |
|---------|------|------|---------------|
| 5 미궁 | walls | `cracks` 배치 | `crack` 첫 도입 |
| 8 추격전 (survive) | chase×1 | `bounce` 적 1기 추가 | `bouncer` 첫 도입 |
| 10 봉쇄선 | walls + chase | `pads` 배치 | `pad` 첫 도입 |
| 12 폭풍전야 (survive) | chase×2 | 1기를 `lunge`로 교체 | `lunger` 첫 도입 |
| 11 포격수 (boss) | 4페이즈 | 한 페이즈를 `summon`으로 / `drift` 페이즈 추가 | `summon`·`drift` |
| 19 포식자 (boss) | 4페이즈 | `mark`·`spiral` 페이즈 추가/교체 | `mark`·`spiral` |

> 보스는 두 곳(11, 19)을 손대 신규 4패턴을 모두 노출. `bossTotal`은 페이즈 turns 합에 맞춰 재계산.
> 축소가 필요하면 보스 한 곳(19)에 4패턴을 몰아 5곳으로 줄일 수 있음.

리워크 시 난이도 재튜닝 필요. 각 리워크 스테이지에 대해 §9 공정성 테스트 통과를 게이트로 둔다.

---

## 8. 아트 & 렌더링 추가

### resources.jsx (`RES` 신규 항목)

| 키 | 종류 | 비고 |
|----|------|------|
| `bouncer` | pixel | 반사체 적 (chaser와 구분되는 색/형태) |
| `lunger` | pixel | 돌격수 적 (방향 표시 가능한 형태) |
| `crack` | vector/pixel | 정상/붕괴 2상태 (붕괴=구멍) |
| `pad` | vector | 방향 화살표 (dir별 회전) |
| `mine` | pixel | 지뢰 예고 마커 (fuse>0) / 폭발(fuse=0은 explode 재사용) |

드리프트/지그재그 탄은 `drone` 재사용.

### sprites.jsx (신규 컴포넌트)

`BouncerSprite`, `LungerSprite`(+ 돌진 레인 텔레그래프), `CrackSprite`(broken 분기),
`PadSprite`(dir 회전 화살표), `MineSprite`(fuse 점멸).

### app.jsx

- 신규 상태 배열 렌더: `cracks`, `pads`, 지뢰(`bl` 중 `fuse!=null`).
- 텔레그래프 셋: 돌격수 레인(`ENEMY_KINDS.lunge.telegraph`), 지뢰 칸(fuse>0), pad 화살표.
  → `dangerSet`/별도 셋에 합쳐 `Cell` 하이라이트.
- 충돌·이동 미리보기(`moveSet`)에 broken crack을 `block`으로 반영.
- 범례(legend)에 신규 기믹 항목 추가.
- 렌더링 우선순위(§ Cell)에서 신규 항목 위치 결정(지뢰 경고/돌진 레인은 danger 계열).

### styles.css

신규 스프라이트 애니메이션(점멸/펄스) 필요 시 keyframe 추가.

---

## 9. 검증 (테스트 계획)

### 9.1 회귀 (선행 — 현행 고정)

`hd`, `safest`, `stepToward`, `tick`(직하·소환·충돌·승리 4모드), `bossAtk` 각 타입, `ping`.

### 9.2 신규 단위 테스트

- 탄: 드리프트 대각 이동 / 지그재그 가장자리 반사 / 지뢰 fuse 감소·`fuse===0`만 치명·다음 턴 제거.
- 적: bouncer 경로 결정론·반사 / lunger cd 카운트·예고(`telegraph`)·돌진(통과 셀 포함 충돌).
- 기믹: crack 떠날 때 broken·이후 block 포함 / pad 진입 시 1칸 밀림·연쇄 없음·벽이면 안 밀림.
- 보스: spiral/summon/mark/drift 각 반환 형태.

### 9.3 공정성 불변식 (핵심)

각 신규 보스 패턴·기믹 스테이지에 대해, 대표 상황을 시뮬레이션하며
**"매 턴 플레이어가 이동 가능한 안전 셀이 최소 1개 존재"**를 단언한다.
(안전 = 다음 상태에서 `ov`가 되지 않는 이웃/대기 셀이 존재)

---

## 10. 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `tests/harness.mjs`, `tests/*.test.mjs` | 신규 — 하니스 + 회귀/신규/공정성 테스트 |
| `engine.jsx` | 탄 이동/충돌 일반화(vc/bounce/fuse), `ENEMY_KINDS`·`GIMMICKS` 레지스트리, 패턴 스폰 일반화(vc/cells/summon), crack/pad 처리 |
| `stages.jsx` | `bossAtk` 신규 4 case, 리워크 5스테이지 데이터(cracks/pads/enemies kind/보스 phases), `initStage`에 cracks/pads 초기화 |
| `resources.jsx` | `RES` 신규 항목 5종 |
| `sprites.jsx` | 신규 스프라이트 컴포넌트 5종 |
| `app.jsx` | 신규 배열·텔레그래프·범례·렌더 우선순위·미리보기 반영 |
| `styles.css` | 신규 애니메이션(필요 시) |
| `docs/hex-danmaku-dev.md` | 신규 메커니즘 문서화 |

---

## 11. 구현 순서 (개요 — 상세는 writing-plans에서)

1. 테스트 하니스 + 현행 회귀 테스트 (초록 확인)
2. 탄 movement 일반화 (vc/bounce/fuse) + 테스트
3. `ENEMY_KINDS` 도입(chase 이전 + bounce/lunge) + 테스트
4. `GIMMICKS` + crack/pad + 테스트
5. 패턴 스폰 일반화(vc/cells/summon) + `bossAtk` 4종 + 테스트
6. 아트/스프라이트/렌더(app·resources·sprites·styles)
7. 스테이지 리워크 6곳 + 공정성 테스트
8. 개발 문서 갱신

각 단계는 테스트 초록을 게이트로 다음 단계 진행.
