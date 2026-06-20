# 보스 아바타 / 존재감 (스펙 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보스 스테이지에 보드 상단 스왑 가능 아바타 + "버티기" 게이지 프레이밍 + 페이즈 전환 배너를 추가해 존재감을 준다 (스펙: `docs/superpowers/specs/2026-06-13-boss-avatar-design.md`).

**Architecture:** 순수 프레젠테이션 레이어. 보스 def에 `boss:{sprite,title}` 데이터만 추가하고, app 렌더가 그걸 읽어 보드 SVG 상단에 `BossAvatarSprite`를 그린다(RES 폴백). 엔진/스테이지 순수 로직·`objText` 계산·fairness는 일절 변경하지 않는다.

**Tech Stack:** 브라우저 전역 JSX(React), 16/24×24 픽셀 RES 아트, node:test(엔진/스테이지/리소스만 — app/sprites는 stub) + `node tests/_babelcheck.mjs`(JSX 구문) + `node tools/shot.mjs`(인게임 스크린샷).

## Global Constraints

- **엔진·스테이지 순수 로직·fairness·승리 조건 변경 금지.** 변경 허용: resources.jsx / sprites.jsx / app.jsx / styles.css + stages.jsx의 보스 def에 `boss` 데이터 필드 추가뿐. `objText`의 `frac`/`left`/`total` 계산은 불변(다른 곳이 의존).
- 보스 아바타는 **24×24 그리드**(일반 16×16과 구분). 모든 픽셀 행은 정확히 24자, 모든 칠한 문자는 맵에 존재.
- 아바타 해석은 **방어적**: `boss.sprite`가 없거나 RES 미등록이면 `bossDefault`로 폴백, 크래시 없음.
- "버티기(endure)" 프레이밍: 보스 HP/데미지 개념 없음. 게이지는 버틴 비율(`1-frac` = `bossWaves/bossTotal`)로 차오름. 아바타 데미지 플래시 없음.
- 검증 게이트: `npm test`(현재 107 그린) 회귀 없음 + `node tests/_babelcheck.mjs` 8/8 + 스크린샷 육안.

## 핵심 코드 지형 (실측)

- 보드 SVG 스프라이트 레이어: [app.jsx:379-443](../../../app.jsx) `<g style={{pointerEvents:'none'}}>` 안. 셀은 `cellsEls`([app.jsx:377](../../../app.jsx)). 플레이어 렌더 [app.jsx:429](../../../app.jsx).
- HTML 오버레이(보드 위): `wave-flash`([app.jsx:446](../../../app.jsx)), `hint-badge`(448), `stage-intro`(450). 페이즈 배너는 이 패턴 재사용.
- 상단 `const { ...Sprite } = window` 구조분해: [app.jsx:11](../../../app.jsx). `HX`/`HXS` 구조분해도 상단.
- 좌표: `hc(r,c)` → `{x,y}` 픽셀 중심. `SW`/`SH`(보드 픽셀 크기), `HX.SZ`(헥스 반지름), `ROWS` 사용 중([app.jsx:370,436](../../../app.jsx)).
- StageHUD(보스 바 포함): [app.jsx:67-98](../../../app.jsx). 보스 바는 `o.frac`로 width, `o.hp ? left/total : value` 표기.
- `objText` boss 분기: [stages.jsx:445-449](../../../stages.jsx) → `{ label: bossPhaseName(...), value:'', frac: left/total, hp:true, left, total }`.
- `HXS.phaseFor(stage, w)` / `HXS.bossPhaseName(stage, w)` export됨([stages.jsx](../../../stages.jsx) HXS 목록). `phaseFor`는 0-based 페이즈 인덱스.
- 보스 def: id11 [stages.jsx:250](../../../stages.jsx), id15 [stages.jsx:289](../../../stages.jsx), id19 [stages.jsx:328](../../../stages.jsx).
- ART 레지스트리 패턴(스왑/픽셀): [resources.jsx](../../../resources.jsx) — `RES[name]={kind:'pixel',grid,map,px,...}`, `drawArt(name,opts)` (RES 미등록 시 null 반환), 16×16 그리드들. sprites.jsx 컴포넌트는 `drawArt`의 thin wrapper.
- resources-art 테스트: [tests/resources-art.test.mjs](../../../tests/resources-art.test.mjs) `EXPECTED_SIZE` + rectangular/맵 커버리지 자동 검사.

---

### Task 1: 보스 아바타 RES 아트(24×24) + BossAvatarSprite (폴백)

**Files:**
- Modify: `resources.jsx` (BOSS_* 그리드/맵 + RES 4종)
- Modify: `sprites.jsx` (BossAvatarSprite + export)
- Modify: `tests/resources-art.test.mjs` (EXPECTED_SIZE 4종)

**Interfaces:**
- Produces: RES keys `bossDefault`, `bossGunner`, `bossPredator`, `bossOverlord` (각 `{kind:'pixel', grid:24×24, map, px}`); `window.BossAvatarSprite({ x, y, sprite, phaseLevel, defeated })` — `sprite` 미등록/누락이면 `bossDefault` 사용.

- [ ] **Step 1: 크기 테스트(RED)** — `tests/resources-art.test.mjs`의 EXPECTED_SIZE에 추가:
```js
  bossDefault: [24, 24], bossGunner: [24, 24], bossPredator: [24, 24], bossOverlord: [24, 24],
```
`node --test tests/resources-art.test.mjs` → FAIL(RES에 해당 키 없음 → grid undefined).

- [ ] **Step 2: 아바타 그리드 구현** — resources.jsx, 픽셀 그리드 섹션 끝(예: BOMBZONE 뒤)에 24×24 4종 추가. **모든 행 정확히 24자, 칠한 문자 전부 맵에 존재.** 4종은 실루엣이 서로 구분되게(폴백=중립 갑주형, gunner=포신/뿔, predator=송곳니/눈, overlord=왕관/위엄). 리스킨 톤(다크 아웃라인+2~3단 셰이딩). 초안 예시(`bossDefault`, 나머지는 같은 형식·다른 실루엣·팔레트로):
```js
// Boss avatars (24×24 board-top presence; swap via stage def boss.sprite)
const BOSS_DEFAULT_MAP = { o: '#1a1030', X: '#7c3aed', H: '#c4b5fd', d: '#4c1d95', e: '#fde047', m: '#312e81' };
const BOSS_DEFAULT = [
  '........oooooooo........',
  '......ooXXXXXXXXoo......',
  '.....oXXXHHHHHHXXXo.....',
  '....oXXHHXXXXXXHHXXo....',
  '....oXHHXXXXXXXXHHXo....',
  '...oXHXXXmmmmmmXXHXo....',
  '...oXHXmmXXXXXXmmXHXo...',
  '...oXHXmXeeXXeeXmXHXo...',
  '...oXHXmXeeXXeeXmXHXo...',
  '...oXHXmmXXXXXXmmXHXo...',
  '...oXHHXmmmmmmmmXHHXo...',
  '....oXHHXXdddddXXHHo....',
  '....oXXHHXdddddXHHXo....',
  '.....oXXHHXXXXXHHXo.....',
  '......oXXXHHHHHXXXo.....',
  '.......oXXXddddXXo......',
  '........oXXddddXo.......',
  '.........oXddddo........',
  '........odXXXXXdo.......',
  '.......odXXo.oXXdo......',
  '......odXXo...oXXdo.....',
  '.....oXXo.....o.oXXo....',
  '.....oo.........oo......',
  '........................',
];
```
RES에 4종 등록(px는 24×24를 보드 상단에 크게 — 시작값 `px: 1.6`, Task 2에서 시각 튜닝): 예 `bossDefault: { kind:'pixel', grid: BOSS_DEFAULT, map: BOSS_DEFAULT_MAP, px: 1.6 },` + gunner/predator/overlord 동일 형식.

- [ ] **Step 3: BossAvatarSprite** — sprites.jsx, 다른 sprite 옆에. RES 폴백 포함:
```js
// Boss avatar — board-top presence; idle bob + phase-escalation glow; swap/fallback via RES
const BossAvatarSprite = ({ x, y, sprite, phaseLevel = 0, defeated = false }) => {
  const key = (sprite && window.HXR.RES[sprite]) ? sprite : 'bossDefault';
  const cls = defeated ? 'boss-avatar boss-defeated' : `boss-avatar boss-bob boss-glow-${Math.min(phaseLevel, 4)}`;
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }} className={cls}>
      {window.HXR.drawArt(key)}
    </g>
  );
};
```
`Object.assign(window, {...})` export 목록에 `BossAvatarSprite` 추가.

- [ ] **Step 4: 시각 확인 + 테스트** — `node --test tests/resources-art.test.mjs` PASS → `node tools/extract-sprites.mjs`로 `assets/extracted/bossDefault.png` 등 4종 생성, Read로 실루엣 구분 확인(부족하면 그리드 수정 반복). `npm test` 전체 GREEN + `node tests/_babelcheck.mjs` 8/8.

- [ ] **Step 5: 커밋**
```bash
git add resources.jsx sprites.jsx tests/resources-art.test.mjs
git commit -m "feat(boss): 24x24 boss avatar sprites (4, with fallback) + BossAvatarSprite

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 보드 상단 아바타 렌더 + 보스 def 연결 + 애니메이션 스타일

**Files:**
- Modify: `app.jsx` (구조분해 + 보드 SVG 상단 아바타 렌더)
- Modify: `stages.jsx` (보스 def 3곳에 `boss:{sprite,title}`)
- Modify: `styles.css` (boss-bob / boss-glow-N / boss-defeated)

**Interfaces:**
- Consumes: `window.BossAvatarSprite`, `HXS.phaseFor(stage,w)`.
- Produces: 보스 스테이지에서 보드 상단에 아바타가 그려짐. 보스 def에 `boss` 필드 존재.

- [ ] **Step 1: 보스 def에 데이터 추가** — stages.jsx (순수 데이터, 로직 불변):
  - id11([stages.jsx:250](../../../stages.jsx))에 `boss: { sprite: 'bossGunner', title: '포격수' },`
  - id15([stages.jsx:289](../../../stages.jsx))에 `boss: { sprite: 'bossOverlord', title: '군주' },`
  - id19([stages.jsx:328](../../../stages.jsx))에 `boss: { sprite: 'bossPredator', title: '포식자' },`
  `npm test` → 여전히 GREEN(데이터 추가만, `bossTotal===sum` 가드·fairness 무영향).

- [ ] **Step 2: 구조분해 + 렌더** — app.jsx:
  - 상단 `const { ... } = window;`([app.jsx:11](../../../app.jsx))에 `BossAvatarSprite` 추가.
  - 보드 SVG `<g pointerEvents:none>` 안, **셀 직후·다른 스프라이트보다 먼저**(뒤쪽 레이어가 되도록) 보스 아바타를 렌더. [app.jsx:379](../../../app.jsx) `<g ...>` 여는 직후에:
```jsx
            {g.stage && g.stage.type === 'boss' && !g.win && (() => {
              const b = g.stage.boss || {};
              return <BossAvatarSprite x={SW / 2} y={HX.SZ * 1.4} sprite={b.sprite} phaseLevel={HXS.phaseFor(g.stage, g.bossWaves)} />;
            })()}
```
  (위치 `x=SW/2, y=HX.SZ*1.4`는 시작값 — Step 4 스크린샷으로 튜닝. row 0 위 여백에 보스가 군림하는 느낌.)

- [ ] **Step 3: 애니메이션 스타일** — styles.css에 (기존 애니 클래스 톤에 맞춰):
```css
.boss-avatar { transform-box: fill-box; transform-origin: center; }
.boss-bob { animation: bossBob 2.6s ease-in-out infinite; }
@keyframes bossBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.boss-glow-1 { filter: drop-shadow(0 0 3px #a78bfa); }
.boss-glow-2 { filter: drop-shadow(0 0 4px #c084fc); }
.boss-glow-3 { filter: drop-shadow(0 0 6px #f472b6); }
.boss-glow-4 { filter: drop-shadow(0 0 8px #fb7185); }
.boss-defeated { animation: bossDefeat 0.8s ease-in forwards; }
@keyframes bossDefeat { to { transform: scale(0.2) rotate(20deg); opacity: 0; } }
```
(`boss-glow-0`은 정의 없음 = 글로우 없음 — 첫 페이즈는 담백. `Math.min(phaseLevel,4)`라 0~4만.)

- [ ] **Step 4: 인게임 확인** — `node tests/_babelcheck.mjs` 8/8 → 보스 스테이지 스크린샷. `tools/shot.mjs`가 보스까지 못 가면, 임시 스크립트로 보스 스테이지(예 idx18)를 `initStage`로 부팅해 캡처(아래 Task 3 Step 4 방식). 아바타가 상단에 보이고 잘리지 않는지 확인 → 안 맞으면 `x`/`y`/`px` 튜닝. `npm test` GREEN.

- [ ] **Step 5: 커밋**
```bash
git add app.jsx stages.jsx styles.css
git commit -m "feat(boss): board-top avatar render + boss def sprites + bob/glow styles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 버티기 게이지 프레이밍 + 페이즈 배너 + 격파 연출

**Files:**
- Modify: `app.jsx` (StageHUD 보스 바 endure 프레이밍 + 페이즈 배너 useRef + 격파 연출)
- Modify: `styles.css` (phase-banner 슬라이드/페이드)

**Interfaces:**
- Consumes: `HXS.phaseFor`, `HXS.bossPhaseName`, `BossAvatarSprite`(defeated prop).

- [ ] **Step 1: 버티기 게이지 프레이밍** — app.jsx `StageHUD`([app.jsx:82-90](../../../app.jsx)). **`objText`는 안 건드림.** 보스일 때만 바를 "버틴 비율"로 채우고 endure 라벨/색으로 표기. 기존 `sh-obj` 블록을 보스 분기로:
```jsx
      <div className="sh-obj">
        {st.type === 'boss' ? (
          <>
            <span className="sh-obj-label">버티기 · {o.label}</span>
            <div className="sh-bar boss-endure">
              <div className="sh-fill" style={{ width: `${Math.round((1 - Math.max(0, Math.min(1, o.frac))) * 100)}%`, background: m.color }}></div>
            </div>
            <span className="sh-val" style={{ color: m.color }}>남은 {o.left}</span>
          </>
        ) : (
          <>
            <span className="sh-obj-label">{o.label}</span>
            {o.frac != null && (
              <div className="sh-bar">
                <div className="sh-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, o.frac)) * 100)}%`, background: m.color }}></div>
              </div>
            )}
            <span className="sh-val" style={{ color: m.color }}>{o.hp ? `${o.left}/${o.total}` : o.value}</span>
          </>
        )}
      </div>
```
(`o.frac`=`left/total`이므로 `1-frac`=버틴 비율 → 바가 차오름. `o.label`은 페이즈 이름. 계산 로직은 objText 그대로.)

- [ ] **Step 2: 페이즈 배너 (useRef 전환 감지)** — GameView 안. 기존 상태 훅 옆에 `phase-banner` 상태 + ref 추가, `g.bossWaves` 변화에 반응하는 effect:
```js
  const [phaseBanner, setPhaseBanner] = useState('');
  const phaseRef = useRef(-1);
  useEffect(() => {
    if (!isStage || g.stage.type !== 'boss' || g.win || g.ov) return;
    const ph = HXS.phaseFor(g.stage, g.bossWaves);
    if (ph !== phaseRef.current) {
      phaseRef.current = ph;
      setPhaseBanner(`PHASE ${ph + 1} · ${HXS.bossPhaseName(g.stage, g.bossWaves)}`);
    }
  }, [g.bossWaves]);
```
(훅 순서 안정: 기존 훅들 뒤에 추가. `isStage`는 이미 GameView에 있음 — 없으면 `g.mode==='stage'`로.) `useRef`가 상단 import에 없으면 React 구조분해에 추가(파일에서 `useState`/`useEffect` 가져오는 방식 확인 후 동일하게).

- [ ] **Step 3: 배너 렌더 + 격파 연출 + 스타일** —
  - `wave-flash` div 옆([app.jsx:446](../../../app.jsx))에 배너 렌더(자동 사라짐은 CSS 애니 또는 key 기반):
```jsx
        {phaseBanner && <div className="phase-banner" key={phaseBanner}>{phaseBanner}</div>}
```
  - 격파 연출: Task 2의 아바타 렌더 조건 `!g.win`을 빼고, `defeated={g.win}`를 전달하도록 변경(승리 시 소멸 애니 1회). 즉 Task 2의 렌더를:
```jsx
            {g.stage && g.stage.type === 'boss' && (() => {
              const b = g.stage.boss || {};
              return <BossAvatarSprite x={SW / 2} y={HX.SZ * 1.4} sprite={b.sprite} phaseLevel={HXS.phaseFor(g.stage, g.bossWaves)} defeated={g.win} />;
            })()}
```
  - styles.css:
```css
.phase-banner { position: absolute; top: 38%; left: 50%; transform: transl(-50%,-50%); /* see note */
  font-family: 'Press Start 2P', monospace; font-size: 13px; color: #fde047; text-shadow: 0 2px 0 #7c2d12;
  white-space: nowrap; pointer-events: none; animation: phaseBanner 1.6s ease-out forwards; }
@keyframes phaseBanner { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.7); } 20% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.05); } }
.boss-endure .sh-fill { transition: width 0.3s ease-out; }
```
  (배너 transform은 `translate(-50%,-50%)` 정확히 — 위 keyframe과 일치시킬 것. `.grid-wrap`이 `position:relative`인지 확인하고 아니면 배너를 `wave-flash`와 같은 컨테이너에 둔다 — `wave-flash`가 이미 그 위치에 뜨므로 동일 부모 사용.)

- [ ] **Step 4: 인게임 확인(스크린샷)** — `node tests/_babelcheck.mjs` 8/8. 보스 스테이지를 캡처해 ① 상단 아바타 ② 버티기 바가 차오름 ③ 페이즈 배너를 육안 확인. `tools/shot.mjs`가 보스 미도달이면 임시 스크립트(커밋 안 함, 검증 후 삭제)로 보스 부팅+턴 진행 후 스크린샷:
```js
// scratch: boot a boss stage and step a few turns for a screenshot via shot-style harness
// (use the same self-contained HTML approach as tools/shot.mjs, but navigate/boot the boss stage)
```
  (간단히는 `tools/shot.mjs`에 보스 스테이지 진입 경로를 임시로 더해 캡처 → 확인 후 원복. 핵심은 육안 확인 1회.)

- [ ] **Step 5: 최종 검증 + 커밋** — `npm test` 107 GREEN + `node tests/_babelcheck.mjs` 8/8.
```bash
git add app.jsx styles.css
git commit -m "feat(boss): endure-framed gauge + phase banner + avatar defeat anim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 보스 추가/스왑 레시피 (스펙 §4 — 구현 후 문서화)

마지막 커밋 후 `docs/hex-danmaku-dev.md` 보스 섹션에 1문단 추가(별도 docs 커밋):
- **스왑**: 보스 def의 `boss.sprite`를 다른 RES 키로 교체.
- **신규 보스**: ① `STAGES`에 `{type:'boss', phases, bossTotal:<sum of turns>, boss:{sprite,title}}` 추가 ② `tests/fairness.test.mjs` 보스 인덱스 스윕에 새 인덱스 추가(필수) ③ RES에 24×24 아바타 추가 또는 기존 재사용(미지정 시 `bossDefault` 폴백).

## 완료 기준 (스펙 수용 기준)

- 보스 스테이지 진입 시 보드 상단 아바타가 보이고 `boss.sprite`로 스왑되며, 미지정/미등록이면 `bossDefault` 폴백(크래시 없음).
- 게이지가 "버티기"로 차오르고, 보스 HP/데미지 개념·아바타 데미지 플래시가 없다.
- 페이즈 변경 시 배너가 뜨고, escalation에 따라 아바타 글로우가 강해진다.
- 다 버티면 아바타 소멸 연출 후 클리어(승리 조건 불변).
- `npm test` 107 + `node tests/_babelcheck.mjs` 8/8 통과(엔진/fairness 무영향).
- 보스 추가/스왑 레시피 문서화.

## 자기검토 메모

- **스펙 커버리지**: 아바타(T1 아트+컴포넌트, T2 렌더), 폴백(T1 컴포넌트), 24×24(T1), 버티기 게이지(T3), 페이즈 배너(T3), escalation 글로우(T1 클래스+T2 phaseLevel), 격파 연출(T3), 보스 def 연결(T2), 레시피 문서(말미). 전부 태스크 있음. 엔진/objText 불변 명시.
- **명명 일관성**: RES `bossDefault/bossGunner/bossPredator/bossOverlord`, `BossAvatarSprite({x,y,sprite,phaseLevel,defeated})`, def 필드 `boss:{sprite,title}`, CSS `boss-bob/boss-glow-{0..4}/boss-defeated/phase-banner/boss-endure` — T1~T3 동일 사용.
- **YAGNI**: 실제 데미지 시스템·신규 보스 콘텐츠·사운드·멀티프레임 애니 전부 범위 밖(스펙과 일치).
