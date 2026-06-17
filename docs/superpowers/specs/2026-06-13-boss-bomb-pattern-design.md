# 보스 폭탄 패턴 + 파라미터화 패턴 시스템 (스펙 1) — 디자인 스펙

> 작성일: 2026-06-13 · 승인: 유저 (대화에서 디자인 승인)
> 큰 그림: 보스를 "데이터로 만드는" 시스템 — 보스 = (조합된 패턴 phase 목록 + 밸런스 수치 + 스왑 가능한 이미지). 본 스펙은 **메커니즘 코어**(스펙 1): 파라미터화된 패턴 시스템 + 첫 신규 패턴인 폭탄. 보스 아바타·존재감은 **스펙 2(별도)** 로 분리. 메모리의 2탄 후보 "보스 존재감"과 연결.

## 목표

보스 phase를 데이터로 조합·튜닝할 수 있는 토대를 놓고, 그 모범 사례로 **폭탄 장판 패턴**을 추가한다. 폭탄은 필드에 즉사 장판을 깔아 이동을 방해하고 일정 턴 후 사라지며, 던지는 방식(직선/대각/무차별)을 phase로 조합한다. 게임의 핵심 불변식인 "항상 회피 가능"을 유지한다.

## 0. 현재 구조 (변경하지 않는 것)

- 보스 phase는 이미 데이터: `phases: [{type, turns, name}]` + `bossTotal`. `phaseFor(stage,w)`가 누적 turns로 wave→phase 매핑.
- `bossAtk(atk, s)` (stages.jsx)가 type별로 낙하 패턴 `{n, c, ...}` 반환. 일부 파라미터는 이미 phase에서 읽음(`atk.n`, `atk.aim`, `atk.name`).
- 엔진 스폰(`engine.jsx` `si<=0` 블록)이 `np.c`(컬럼), `np.cells`(명시 셀, fuse 포함), `np.laser`, `np.summon`을 처리.
- `mark` 패턴이 본 작업의 직접 선례: `s.pl` 기준 셀 계산 → `np.cells`로 실어 보냄 → fuse=1 예고 → 1턴 stale 상태로도 fairness 통과.
- 보드: 11행(R=11) × 7열(C=7).

**기존 패턴(rain/aimed/spiral/mark/spread/converge/…)은 그대로 둔다.** 이미 동작하고 fairness 검증을 통과한 자산. 파라미터화는 신규 폭탄 패턴으로만 실현하고, 기존 패턴 리라이트는 하지 않는다(YAGNI·리스크 회피).

## 1. 폭탄 메커니즘

신규 상태 필드 `s.bombs = [{ r, c, armed, t }]` (낙하 탄막 `s.bl`과 별개 — 이동하지 않고 제자리에 머무는 다른 생애주기).

**의도(턴 수 기준)** — 매 턴 `s.fz<=0`일 때만 진행(freeze 중 정지):
- **예고 단계**: 투척 후 정확히 `bombTelegraph`턴 동안 비치명(경고 표시). 던진 그 턴 포함.
- **활성 단계**: 예고가 끝나면 정확히 `bombLife`턴 동안 즉사 장판.
- **소멸**: 활성이 끝나면 제거.
- **치명 판정**: 활성 단계 셀에 플레이어가 위치 → 게임오버 (기존 가시 즉사 경로 재사용). 예고 셀은 안전.

정확한 카운터 산술(`armed`/`t` 전이 시점, 틱 vs 충돌 검사 순서)은 구현 계획에서 단위 테스트로 핀한다 — 핵심은 위 "예고 N턴 → 활성 M턴 → 소멸"이 정확히 그 턴 수로 성립하고, **던진 턴에는 절대 치명이 아닐 것**(예고가 1턴 이상 보장).

bomb phase 동안 **낙하 탄막 스폰을 건너뛴다** (`np.c`가 비어 있으므로 자연히 스킵 — bomb 패턴은 `c:[]` 반환). 두 위협을 분리해 fairness를 통제.

보스 승리 "화면 클리어" 조건(`bossWaves>=bossTotal && mv.length===0`)에 **활성 폭탄 0(`s.bombs`에 armed 없음)** 도 포함 — 장판이 남은 채 보스가 죽지 않도록.

## 2. 투척 패턴 3종 (mode)

phase가 `mode`로 지정: `{ type:'bomb', mode:'line'|'diag'|'scatter', turns, count?, life? }`.

**공통 안전장치 (fairness 백본)**: 모든 mode는 후보 셀에서 **플레이어 현재 셀 + 인접 6칸(hex 거리 ≤1)을 제외**한다(거리 2+만). 이미 점유된 셀(벽/가시/포대/기존 폭탄/플레이어)도 제외. 한 웨이브 최대 `count`개.

- **line(직선)**: 플레이어에게서 거리 2+ 떨어진 한 행을 골라 가로 띠로 최대 count개 배치.
- **diag(대각)**: 대각 계단형으로 거리 2+ 셀에 최대 count개 배치.
- **scatter(무차별)**: 거리 2+ 빈 셀 중 무작위 count개.

후보가 count보다 적으면 있는 만큼만(보드 포화 시 자연 감소).

## 3. 해결 타이밍 — `mark` 선례 준수

폭탄 셀은 `bossAtk`가 **현재 `s.pl` 기준**으로 계산해 반환 형태 `{ n, c:[], bombs:[{r,c}] }`로 실어 보낸다. 엔진 스폰 블록에 `np.bombs` 처리를 추가: 각 셀을 `{r,c,armed:false,t:telegraph}`로 `s.bombs`에 push.

`np`는 한 웨이브 미리 계산되어 1턴 stale하지만, 이는 `mark`·`aimed`와 동일하며 1턴 예고로 보완되고 fairness 스윕이 커버한다. **새 해결 경로를 만들지 않아** 기존 아키텍처와 일관.

## 4. 파라미터화 / 밸런스 노브

신규 `BAL.boss` 섹션 (engine.jsx DEFAULT_BAL): `{ bombsPerWave: 2, bombLife: 2, bombTelegraph: 1 }`.
- phase가 `count`/`life`를 주면 phase 값 우선, 없으면 `BAL.boss.bombsPerWave`/`bombLife` 폴백. telegraph는 항상 `BAL.boss.bombTelegraph`.
- 에디터 밸런스 탭(`BAL_FIELDS`)에 3필드 노출. `buildBalance`에 boss 섹션 음수→0 클램프(telegraph/life는 ≥1 권장이나 0 허용 시 즉시 활성/즉시 소멸 — 클램프는 ≥0, 엔진은 안전 처리).

## 5. 통합 지점

- **engine.jsx**: `s.bombs` 틱(상태기계)·충돌(armed=즉사)·`np.bombs` 스폰 스레딩·`initState`/boss 승리조건. `DEFAULT_BAL.boss` + export에 필요 시 헬퍼.
- **stages.jsx `bossAtk`**: `case 'bomb'` — mode별 셀 계산(안전링 제외 + count 상한), `{n, c:[], bombs}` 반환. 데모: 보스 스테이지 id 19("BOSS · 포식자", sub "새로운 공격")의 phases에 bomb phase를 끼워 넣음(예: line/diag/scatter 3 phase). bossTotal 조정.
- **resources.jsx/sprites.jsx**: 폭탄 스프라이트 — 예고(점멸 경고색) / 활성(즉사 장판색). 기존 mine·spike 톤 재활용, 16×16 신규 1종 + 상태별 표현(예고는 warnStroke, 활성은 별도 grid 또는 색).
- **app.jsx**: `s.bombs` 렌더(예고/활성 구분) + 셀 상태(Cell state) 반영 + 범례.
- **editor.jsx**: `BOSS_ATKS`에 'bomb' 추가 + mode 선택 UI(라디오/드롭다운), `BAL_FIELDS`에 boss 3필드.

## 6. fairness 검증 (필수)

- `tests/fairness.test.mjs`에 bomb 3모드 각각 케이스 추가 (단일 보스에서 멀티시드 + 2-ply 룩어헤드 "매 턴 안전 이동 존재" 검증).
- **200~1000 시드 스윕으로 0 실패가 될 때까지 수치 튜닝**: 시작 `bombsPerWave:2, bombLife:2`. 실패 시 우선 life↓ → count↓ → 안전링 거리 2로 확대 순. 소수 시드는 1~5% 트랩을 놓치므로 넓게 돌린다(메모리 [[fairness-mobile-enemy-pools]] 교훈).
- 누적 폭탄 + 예고/활성 혼재 상태에서도 불변식 유지 확인.

## 7. 엔진 단위 테스트 (RED→GREEN)

- 폭탄 상태기계: 투척(armed=false, t=telegraph) → 예고 동안 비치명 → 활성 전이(armed=true) → 활성 중 치명 → life 후 소멸.
- 활성 폭탄 셀로 이동 = 게임오버. 예고 셀로 이동 = 안전.
- freeze 중 폭탄 t 정지.
- bomb phase에서 낙하 탄막 미스폰.
- bossAtk 3모드: 플레이어 인접 6칸·점유 셀 제외, count 상한, 후보 부족 시 감소.
- 보스 승리조건: 활성 폭탄 남으면 미승리.

## 범위 밖 (명시)

- 보스 아바타 스프라이트·페이즈 배너·HP 드레인 연출 → **스펙 2**.
- 기존 패턴 리라이트/파라미터 확장 → 하지 않음.
- mode 자동 순환(한 phase 안에서 매 웨이브 mode 변경) → 하지 않음. 다양성은 phase를 더 엮어서 표현.

## 수용 기준

- 보스 phase에 `{type:'bomb', mode, turns}`를 넣으면 해당 mode대로 즉사 장판이 예고→활성→소멸하며, 낙하 탄막은 그 phase 동안 안 나온다.
- 3모드 모두 플레이어 인접 6칸엔 절대 안 깔리고, `count`/`life` 상한이 지켜진다.
- `tests/fairness.test.mjs` bomb 케이스가 200~1000 시드에서 0 실패.
- `npm test` 전체 + `node tests/_babelcheck.mjs` 8/8 통과.
- 에디터에서 bomb 패턴·mode·boss 밸런스 수치를 조정할 수 있다.
- 폭탄이 예고/활성 상태가 시각적으로 구분되어 렌더된다.
