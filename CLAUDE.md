# HEX DANMAKU — 게임 개발 팀 규칙 (CLAUDE.md)

턴제 헥사 탄막(회피 액션) 웹 게임. **최종 권위자는 사람(당신)**이며, 단계 전환은 승인 게이트를 거친다.
기존 문서가 정본이다: 설계는 [docs/hex-danmaku-dev.md](docs/hex-danmaku-dev.md)(코드가 진실의 원천),
출시 계획은 [docs/toss-release-roadmap.md](docs/toss-release-roadmap.md). 이 파일은 팀 규칙만 담는다.

## 프로젝트 개요
- 장르: 턴제 탄막 · 헥사 그리드(7×11, odd-r) · 행동 트리거 방식
- 스택: 빌드리스 — React 18 UMD + Babel-in-browser. **빌드 스텝 없음(유지할 것)**
- 실행: `npx serve .` 후 `Hex Danmaku.html` · 테스트: `npm test` (node --test, 124개)
- 진행 상태: 코어+24스테이지 완성, 메타(지역/업적/일일도전) 진행 중, 토스 미니앱 출시 목표

## 팀 구성 (허브-앤-스포크 · game-dev-team 플러그인)
| 에이전트 | 언제 부르나 |
|---|---|
| `pm` | 로드맵 Phase → 태스크 분해·우선순위 |
| `game-designer` | 밸런스 설계, **게임성 지표 정의(미결)**, balance-sim 해석 |
| `developer` | 구현·시뮬 하네스 확장 (worktree 격리) |
| `qa` | 정확성·회귀 (`npm test` 통과 필수) |
| `artist` | 스프라이트·연출(P1) 디렉션, VISUAL_DESIGN.md(미결) |
| `meta-economy-designer` | 지역/업적/일일도전·리더보드·(향후)수익화 |

에이전트는 서로 직접 대화하지 않는다. 오케스트레이터가 결과를 모아 전달하고 게이트마다 사람 승인.

**상태 파일 (역할 분리)**
- `docs/pipeline/state.json` — **기계용 현재 상태**(현재 단계·열린 게이트·반복 예산). 플러그인의
  SessionStart 훅이 세션 시작마다 읽어 주입한다. 게이트가 열리고 닫힐 때 갱신 — 안 하면
  세션이 바뀔 때 게이트가 증발한다.
- [PIPELINE_STATE.md](PIPELINE_STATE.md) — **사람용 게이트 이력 장부**(백필·판정 근거·결정 이력).

**게이트 판정은 `/game-dev-team:gate`** — 증거(시드·판수·대상 커밋)가 실제 측정인지 확인하고
**미달**(→ 기획 반환)과 **측정 불가**(→ 하네스 수리)를 구분한다. 검증 완료 보고는 5섹션
(주장·증거·기준·공백·잔여 위험) 형식.

**플러그인 훅 4종이 자동 동작한다**(경고만, 차단 없음): 밸런스 하드코딩 감시 · 커밋 전 열린
게이트 알림 · 세션 시작 상태 주입 · 에이전트 감사 로그. 이 레포의 밸런스 정본은 engine.jsx의
`DEFAULT_BAL`이므로, 그 블록을 수정할 때 하드코딩 경고가 뜨면 정본 위치가 맞는지만 확인하고 진행.

## 파이프라인 현재 위치 (온보딩 판정 — 승인 대기)
- **⑧ 메타/리텐션 트랙 진행 중** (regions·achievements·daily 커밋 완료, 리더보드 예정)
- **④ 게임성 검증 병행 필요**: 공정성 불변식(fairness.test)은 있으나 **숫자 지표(목표 클리어율·
  평균 턴 수·스킬 픽률)가 미정의** — 하네스(tests/harness.mjs)가 이미 있어 balance-sim 저비용
- **P1 연출**은 로드맵 Phase 1-2(이펙트·사운드)와 동일 — artist+developer로 진행
- 게이트 모드: <미결 — 1인 개발+출시 목표라 `lean`(코어 확정·게임성 검증·머지) 제안>

## 코드 컨벤션 (기존 구조 유지 — 상세 규칙은 .claude/rules/)
- **스크립트 로드 순서 고정**: engine → stages → resources → sprites → screens → app.
  각 파일은 `window.*`(HX·HXS·HXR)에 export — Babel 스코프 격리 때문. 새 파일도 이 방식.
- **밸런스 수치는 `DEFAULT_BAL`**(engine.jsx, `window.HXB`로 오버라이드 가능)에 모은다. 로직에 하드코딩 금지.
- **RNG는 `rnd()`만** 사용(시드 주입형). `Math.random()` 직접 호출 금지 — 일일 도전·시뮬 재현성 전제.
- **engine.jsx·stages.jsx는 DOM/React 무참조 유지** — tests/harness.mjs가 vm 샌드박스로 헤드리스 로드한다.
- `art-data.js`는 순수 데이터(함수 금지 — 테스트가 강제). 렌더 로직은 resources.jsx의 px/drawArt.
- 변경 후 `npm test` — 124개 전부 통과가 머지 전제.

## 게임성 성공 지표 (game-designer가 채움 — 미결)
- 스테이지별 목표 클리어율(스마트 회피 봇 기준): <미결>
- 평균 클리어 턴 수 구간(스테이지 티어별): <미결>
- 스킬(undo/bomb/freeze) 픽률 편중 허용치: <미결>
- 공정성: "항상 회피 가능" 불변식 유지 (fairness.test — 이미 검증 중)

## 검증 방법
- 정확성: `npm test` (회귀 regression.test 포함) — 콘솔 에러 0.
- 게임성: tests/harness.mjs 기반 몬테카를로(시드 고정, 스마트 회피 봇) → 지표 대조. 지표 정의 후 가동.

## 사람(당신)의 승인 지점
- 온보딩 판정(이 문서+PIPELINE_STATE) 승인 · 게이트 모드 확정 · 게임성 지표 확정
- 밸런스 수치 변경(DEFAULT_BAL) · 머지 · 아트/연출(P1) 사인오프 · 토스 출시 Phase 전환
