# 보스 아바타 / 존재감 (스펙 2) — 디자인 스펙

> 작성일: 2026-06-13 · 승인: 유저 (대화에서 디자인 승인)
> 큰 그림: "데이터로 보스 만드는 시스템"의 **시각 레이어**. 스펙 1(폭탄 패턴/파라미터화)이 메커니즘 코어였고, 본 스펙은 보스에게 화면상 존재감을 준다. 메모리의 오랜 2탄 후보 "보스 존재감" 해소.

## 목표

보스전이 "위에서 탄이 떨어지는 추상적 버티기"로 느껴지는 문제를 해결한다. 보드 상단에 **스왑 가능한 보스 아바타**를 띄우고, 페이즈 전환을 **배너**로 연출하며, 진행 바를 **"버티기(endure)" 게이지**로 의도적으로 프레이밍한다. **엔진·fairness·게임플레이 로직은 일절 바꾸지 않는다** — 순수 프레젠테이션. 상태에 이미 `bossWaves`/`bossTotal`/페이즈 이름(`bossPhaseName`)이 있어 그대로 읽는다.

## 0. 현재 상태 (바꾸지 않는 것)

- 보스 HUD: `objText(s)`의 boss 분기가 `{ label: bossPhaseName(...), value:'', frac: left/total, hp:true, left, total }` 반환 → HUD([app.jsx:82-90](../../../app.jsx) `StageHUD`)가 페이즈 이름 + 바 + `left/total`을 이미 그림.
- 보스 승리: `bossWaves >= bossTotal && mv.length===0 && !armed bombs`([engine.jsx](../../../engine.jsx)). 본 스펙은 승리 조건을 건드리지 않음.
- `bossPhaseName(stage, w)` / `phaseFor(stage, w)`([stages.jsx](../../../stages.jsx))로 현재 페이즈를 알 수 있음.
- 보스 스테이지: id 11(idx10), id 15(idx14), id 19(idx18). 모두 `bossTotal===sum(turns)` 가드 통과.
- **엔진/스테이지 순수 로직은 변경 금지.** 변경은 resources/sprites/app/styles + 보스 def에 `boss` 필드 추가뿐.

## 1. 보스 아바타 (보드 상단 오버레이)

- 보스 스테이지 def에 신규 필드: `boss: { sprite: 'bossOverlord', title: '군주' }`. 엔진/`pickPattern`은 안 읽음 — app 렌더 전용.
- 보드 SVG 안, **row 0 위쪽 여백**에 큰 보스 스프라이트를 그림. 비상호작용(플레이 셀 차지 안 함, pointerEvents 없음). 탄막이 보스에서 쏟아지는 체감.
- **방어적 해석(스왑·추가 쉽게)**: 아바타 컴포넌트는 `boss.sprite`로 `RES`를 찾되, **없거나 RES에 미등록이면 기본 보스 스프라이트(`bossDefault`)로 폴백**. `boss` 필드 자체가 없는 보스도 폴백으로 렌더(크래시 없음).
- 신규 RES 엔트리: 보스는 featured 아바타라 **24×24 그리드**(일반 16×16보다 큼). 데모용 3종(보스 11/15/19) + 폴백 1종(`bossDefault`). 리스킨 때처럼 `node tools/extract-sprites.mjs` → PNG 직접 확인 시각 루프로 그림. (`extract-sprites`는 그리드 크기 동적이라 24×24 자동 처리.)
- 애니메이션: idle bob + 웨이브 스폰 턴마다 미세 공격 반동 + **페이즈 escalation마다 더 사납게**(글로우/색 강조 클래스). 보스 처치(다 버팀) 시 물러남/소멸 연출.

## 2. "버티기(endure)" 게이지 (HP 드레인 아님)

- **HP/데미지 개념을 쓰지 않는다.** 바는 보스 체력이 아니라 **플레이어의 생존 진행도**. "버텨내는" 것이지 "보스를 깎는" 것이 아님 — 게임의 survive=실력 정체성과 일치.
- HUD 표기를 endure 프레이밍으로: 라벨 "버티기"(또는 페이즈 이름 유지), 값 `남은 N웨이브`(기존 `left/total` 재사용), 바는 **버틴 비율로 차오름**(`bossWaves/bossTotal` = `1 - frac`). app 렌더에서 표시 방향(채움)만 결정하고 `objText`의 `frac`/`left`/`total` 계산은 그대로 둔다.
- **보스 아바타 데미지 플래시 없음**(보스는 체력 안 깎임). 아바타 반응은 공격 펄스 + 페이즈 escalation으로만.
- 다 버티면(`bossWaves>=bossTotal`) 클리어 — 기존 승리 조건 그대로, 아바타 소멸 연출만 추가.
- `objText`는 순수 로직(엔진 측)이라 신중히: 라벨/프레이밍 텍스트만 조정 가능하되, **`frac`/`left`/`total` 계산 의미는 유지**(다른 곳이 의존). endure "차오름"은 app 렌더에서 `frac`을 그대로 쓰거나 `1-frac`로 표시 방향만 정함 — 계산은 안 바꿈.

## 3. 페이즈 배너 (전환 연출)

- 페이즈가 바뀌는 턴에 보드 위로 **트랜지언트 배너**("PHASE 2 · 조여오기") 슬라이드인 → 페이드아웃.
- app에서 직전 페이즈 인덱스를 `useRef`로 기억 → `phaseFor(stage, bossWaves)`가 바뀔 때만 트리거. 기존 `wave-flash`([app.jsx](../../../app.jsx)) 연출 패턴 재사용.
- 첫 페이즈 진입에도 배너(보스전 시작 임팩트). `_test`(에디터 테스트플레이)에서도 동작 무방.

## 4. 보스 추가 / 스왑 레시피 (구조 명문화)

- **아바타 스왑**: 해당 보스 def의 `boss.sprite` 문자열만 다른 RES 키로 교체. 끝.
- **신규 보스 추가**:
  1. `stages.jsx STAGES`에 `{ type:'boss', phases:[...], bossTotal:<sum of turns>, boss:{sprite,title}, ... }` 추가. `bossTotal===sum(turns)` 가드가 자동 검증.
  2. 새 페이즈 조합이면 **`tests/fairness.test.mjs`의 보스 인덱스 스윕에 새 인덱스 추가**(boss15 사건 교훈 — 스윕 누락 금지). 모바일/소환 적 + dense 낙하 패턴 조합은 금지([[fairness-mobile-enemy-pools]]).
  3. 아바타는 RES에 새 24×24 엔트리 추가하거나 기존 재사용. 미지정이면 `bossDefault` 폴백.
- 이 레시피를 `docs/hex-danmaku-dev.md`(또는 스펙) 보스 섹션에 적어둔다.

## 5. 통합 지점 (전부 프레젠테이션)

- **resources.jsx**: 보스 아바타 24×24 RES 엔트리 — `bossDefault` + 데모 3종(예 `bossGunner`/`bossPredator`/`bossOverlord`).
- **sprites.jsx**: `BossAvatarSprite({ x, y, sprite, phaseLevel, defeated })` — idle bob + 페이즈 escalation 글로우 + 소멸. RES 폴백 로직 포함.
- **app.jsx**: 보드 상단 아바타 렌더(`g.stage.boss` 읽고 폴백) + endure 게이지 프레이밍 + 페이즈 배너(useRef 비교) + 클리어 시 소멸 연출. `BossAvatarSprite` 구조분해 추가.
- **stages.jsx**: 보스 def 3곳에 `boss:{sprite,title}` 추가 (순수 데이터 — 엔진 로직 불변).
- **styles.css**: 배너 슬라이드/페이드, 아바타 bob/공격펄스/escalation 글로우/소멸 애니메이션 클래스.
- **tests**: `resources-art.test.mjs` EXPECTED_SIZE에 보스 아바타 24×24 케이스. 페이즈 전환 감지를 순수 헬퍼로 뺄 수 있으면(예 `phaseFor` 비교) 단위 테스트. 렌더는 `node tests/_babelcheck.mjs`(8/8) + `node tools/shot.mjs` 보스 스테이지 스크린샷으로 확인.

## 범위 밖 (명시)

- 보스 체력을 실제 데미지/플레이어 공격으로 깎는 시스템 — endure 추상 유지.
- 신규 보스 콘텐츠 자체(레시피만 잡고 실제 추가는 별도).
- 사운드.
- 보스 아바타의 정교한 멀티프레임 애니메이션(idle bob + 글로우 수준까지만).

## 수용 기준

- 보스 스테이지 진입 시 보드 상단에 보스 아바타가 보이고, `boss.sprite`로 스왑되며, 미지정/미등록이면 기본 아바타로 폴백(크래시 없음).
- 진행 바가 "버티기" 프레이밍으로 보이고, 보스 HP/데미지 개념이 없다(아바타 데미지 플래시 없음).
- 페이즈가 바뀌면 배너가 뜨고, escalation에 따라 아바타가 더 사나워진다.
- 다 버티면 아바타 소멸 연출 후 클리어(승리 조건 불변).
- 엔진/스테이지 순수 로직·fairness 테스트 전부 그대로 통과(`npm test` + `node tests/_babelcheck.mjs` 8/8).
- 신규 보스 추가/스왑 레시피가 문서화되어 있다.
