# A1 지역(월드) 구조 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24개 빌트인 스테이지를 5개 지역(월드)으로 묶고, 지역 맵 화면 + 지역 범위 스테이지 선택 + 라우팅을 추가한다 (스펙: `docs/superpowers/specs/2026-06-21-region-structure-design.md`). 구조만 — 보상/업적/밸런스 제외.

**Architecture:** `stages.jsx`에 `REGIONS` 데이터(인덱스 범위) + 순수 해금/진행 헬퍼를 추가(HXS 노출). `screens.jsx`에 `RegionMap` 화면 추가 + `StageSelect`에 `region` 범위 스코프. `app.jsx`에 `'regions'` 스크린 + `curRegion` 상태 라우팅. 기존 `isUnlocked`(선형)가 이미 게이팅을 강제하므로 게임플레이/해금 로직은 불변 — 추가는 맵 표시용 헬퍼와 화면뿐.

**Tech Stack:** 브라우저 전역 JSX(React), node:test + vm 하니스(`loadGame`→{HX,HXS}), `node tests/_babelcheck.mjs`, `node tools/shot.mjs`.

## Global Constraints

- **구조만**: 지역 클리어 보상·업적·달성도·데일리/랭킹·밸런스 수치·지역 이름 확정·테마 비주얼 폴리시는 범위 밖.
- 지역은 **빌트인 24스테이지(인덱스 0..23)** 만 다룬다. 커스텀(에디터, id≥1000)·엔드리스·에디터 경로 무변경.
- 지역 이름/색은 **플레이스홀더**(나중 리소스 정리 때 교체).
- 지역 해금 = **이전 지역 보스 클리어(별 ≥1)**. 지역 내 스테이지 해금은 기존 `isUnlocked`(선형) 그대로.
- 인덱스 의미 유지: `onPick(globalIdx)`/`startStage(idx)`는 전역 STAGES 인덱스.
- 검증 게이트: `npm test`(기존 110 + 신규) + `node tests/_babelcheck.mjs` 8/8 + 인게임 스크린샷.

## 핵심 코드 지형 (실측)

- `stages.jsx`: `STAGES` 24개(보스 인덱스 5/10/14/18/23). `isUnlocked(idx, stars)` = `idx===0 || STAGES[idx].id>=1000 || !!stars[STAGES[idx-1].id]`. HXS export 목록 = `stages.jsx:507-511` (`...loadStars, saveStars, isUnlocked, rateStage, loadCoins, saveCoins, coinReward, TYPE_META`). `loadStars()`=localStorage `hex_stage_stars`, `loadCoins()`=`hex_coins`.
- `screens.jsx`: `Stars`, `MenuScreen`, `StageSelect`(`{stars,onPick,onBack}`, 전체 그리드, `isUnlocked(i,stars)`), Clear/Fail. 끝에 `Object.assign(window, { Stars, MenuScreen, StageSelect, ClearOverlay, FailOverlay })`.
- `app.jsx`: 상단 `const { MenuScreen, StageSelect, ClearOverlay, FailOverlay, Stars, EditorScreen, ... } = window;`. `App()`(`app.jsx:575-`): `screen` 상태('menu'|'select'|'editor'|'play'), `stars`/`hi`/`runId` 상태. `startStage(idx)`, `toMenu`, `toSelect`(screen 'select'+refresh stars), `toEditor`. 렌더 분기 `app.jsx:597-616`: menu→`onStage={toSelect}`; 'select'→`<StageSelect stars onPick={startStage} onBack={toMenu}/>`. GameView `onList`(비-test)=`toSelect`.

---

### Task 1: REGIONS 데이터 + 해금/진행 헬퍼 (stages.jsx)

**Files:**
- Modify: `stages.jsx` (REGIONS + 헬퍼 + HXS export)
- Test: `tests/regions.test.mjs` (신규)

**Interfaces:**
- Produces (HXS): `REGIONS` (배열 `{id,name,color,from,to}`), `regionStars(region, stars)→number`, `regionMax(region)→number`, `regionCleared(region, stars)→bool`, `regionUnlocked(regionIdx, stars)→bool`.

- [ ] **Step 1: 실패 테스트 작성** — `tests/regions.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

test('REGIONS partition builtin stages exactly (contiguous, in order, boss at each end)', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES } = HXS;
  const N = STAGES.filter(s => s.id < 1000).length; // 24 builtins
  const covered = [];
  for (const r of REGIONS) for (let i = r.from; i <= r.to; i++) covered.push(i);
  assert.deepEqual(covered, Array.from({ length: N }, (_, i) => i)); // no gap/overlap/reorder
  for (const r of REGIONS) assert.equal(STAGES[r.to].type, 'boss', `region ${r.id} (to=${r.to}) must end in a boss`);
});

test('regionUnlocked: region 0 always open; region 1 needs region 0 boss cleared', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, regionUnlocked } = HXS;
  assert.equal(regionUnlocked(0, {}), true);
  assert.equal(regionUnlocked(1, {}), false);
  const bossId = STAGES[REGIONS[0].to].id;
  assert.equal(regionUnlocked(1, { [bossId]: 1 }), true);
});

test('regionCleared / regionStars / regionMax', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, regionCleared, regionStars, regionMax } = HXS;
  const r = REGIONS[0];
  assert.equal(regionCleared(r, {}), false);
  assert.equal(regionCleared(r, { [STAGES[r.to].id]: 2 }), true);
  assert.equal(regionMax(r), (r.to - r.from + 1) * 3);
  const stars = { [STAGES[r.from].id]: 2, [STAGES[r.to].id]: 3 };
  assert.equal(regionStars(r, stars), 5);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/regions.test.mjs` → FAIL(`REGIONS`/헬퍼 미정의).

- [ ] **Step 3: 구현** — `stages.jsx`의 `STAGES` 배열 정의 **다음**(STAGES 인덱스를 참조하므로)에 추가:
```js
// ─── Regions (world grouping; builtin stages only) ─────────────
// 각 지역은 보스(STAGES[to])로 끝난다. name/color는 플레이스홀더(추후 리소스 정리 때 교체).
const REGIONS = [
  { id: 1, name: '여명의 평원', color: '#5eead4', from: 0,  to: 5  },
  { id: 2, name: '강철 전선',   color: '#fbbf24', from: 6,  to: 10 },
  { id: 3, name: '군주의 성채', color: '#c084fc', from: 11, to: 14 },
  { id: 4, name: '포식의 둥지', color: '#34d399', from: 15, to: 18 },
  { id: 5, name: '심연',        color: '#fb7185', from: 19, to: 23 },
];
const regionStars = (region, stars) => {
  let s = 0;
  for (let i = region.from; i <= region.to; i++) s += (stars[STAGES[i].id] || 0);
  return s;
};
const regionMax = (region) => (region.to - region.from + 1) * 3;
const regionCleared = (region, stars) => (stars[STAGES[region.to].id] || 0) > 0; // 보스 클리어 = 지역 클리어
const regionUnlocked = (ri, stars) => ri === 0 || regionCleared(REGIONS[ri - 1], stars);
```
그리고 HXS export 목록(`stages.jsx:507-511`)에 추가:
```js
    REGIONS, regionStars, regionMax, regionCleared, regionUnlocked,
```

- [ ] **Step 4: 통과 확인** — `node --test tests/regions.test.mjs` PASS → `npm test` 전체 GREEN(110 + 3).

- [ ] **Step 5: 커밋**
```bash
git add stages.jsx tests/regions.test.mjs
git commit -m "feat(meta): REGIONS data + region unlock/progress helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 지역 맵 화면 + StageSelect 스코프 + 라우팅 (screens.jsx, app.jsx, styles.css)

**Files:**
- Modify: `screens.jsx` (RegionMap 추가 + StageSelect region prop + export)
- Modify: `app.jsx` (구조분해 + curRegion/coins 상태 + 라우팅)
- Modify: `styles.css` (지역 카드 스타일)

**Interfaces:**
- Consumes (HXS): `REGIONS`, `regionUnlocked`, `regionCleared`, `regionStars`, `regionMax`, `loadCoins`, `loadStars`, `STAGES`, `isUnlocked`, `TYPE_META`.

- [ ] **Step 1: RegionMap 컴포넌트** — `screens.jsx`, StageSelect 앞에 추가:
```jsx
// ─── Region map (world select) ─────────────────────────────────
const RegionMap = ({ stars, coins, onPick, onBack }) => {
  const { REGIONS, STAGES, regionUnlocked, regionCleared, regionStars, regionMax } = window.HXS;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  return (
    <div className="screen select">
      <div className="select-bar">
        <button className="back-btn" onClick={onBack}>← 메뉴</button>
        <span className="select-title">지역 선택</span>
        <span className="select-prog">🪙 {coins} · ★ {total}</span>
      </div>
      <div className="region-list">
        {REGIONS.map((r, ri) => {
          const open = regionUnlocked(ri, stars);
          const cleared = regionCleared(r, stars);
          const got = regionStars(r, stars), max = regionMax(r);
          const prevBoss = ri > 0 ? STAGES[REGIONS[ri - 1].to].name : '';
          return (
            <button
              key={r.id}
              className={`region-card ${open ? '' : 'locked'} ${cleared ? 'cleared' : ''}`}
              disabled={!open}
              onClick={() => open && onPick(ri)}
              style={{ borderColor: open ? r.color : undefined }}
            >
              <span className="rc-id">지역 {r.id}</span>
              <span className="rc-name" style={{ color: open ? r.color : undefined }}>{open ? r.name : '？？？'}</span>
              {open
                ? <span className="rc-prog">★ {got}/{max}{cleared ? ' ✓' : ''}</span>
                : <span className="rc-lock">🔒 {prevBoss} 클리어 시 해금</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: StageSelect 지역 스코프** — `screens.jsx`의 `StageSelect`를 `region` prop 지원으로 교체:
```jsx
const StageSelect = ({ stars, region, onPick, onBack }) => {
  const { STAGES, isUnlocked, TYPE_META, regionStars, regionMax } = window.HXS;
  const from = region ? region.from : 0;
  const to = region ? region.to : STAGES.length - 1;
  const got = region ? regionStars(region, stars) : Object.values(stars).reduce((a, b) => a + b, 0);
  const max = region ? regionMax(region) : STAGES.length * 3;
  return (
    <div className="screen select">
      <div className="select-bar">
        <button className="back-btn" onClick={onBack}>← {region ? '지역' : '메뉴'}</button>
        <span className="select-title">{region ? region.name : '스테이지 선택'}</span>
        <span className="select-prog">★ {got}/{max}</span>
      </div>
      <div className="stage-grid">
        {STAGES.slice(from, to + 1).map((st, j) => {
          const i = from + j;                 // global index (isUnlocked/onPick use it)
          const open = isUnlocked(i, stars);
          const g = stars[st.id] || 0;
          const m = TYPE_META[st.type];
          return (
            <button
              key={st.id}
              className={`stage-tile ${open ? '' : 'locked'} t-${st.type}`}
              disabled={!open}
              onClick={() => open && onPick(i)}
            >
              <span className="st-num">{String(st.id).padStart(2, '0')}</span>
              <span className="st-ico" style={{ color: m.color }}>{m.icon}</span>
              <span className="st-name">{open ? st.name : '？？？'}</span>
              <span className="st-type" style={{ color: m.color }}>{m.label}</span>
              {open ? <Stars n={g} /> : <span className="st-lock">🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```
(전역 인덱스 `i`로 `isUnlocked`/`onPick` 호출 — 인덱스 의미 유지. region 없으면 기존 전체 동작 폴백.)

- [ ] **Step 3: export + 구조분해** — `screens.jsx` 끝 `Object.assign(window, {...})`에 `RegionMap` 추가. `app.jsx` 상단 `const { ... } = window;`에 `RegionMap` 추가.

- [ ] **Step 4: app.jsx 라우팅** —
  (a) 상태 추가(`app.jsx:580` 부근, 기존 useState들 옆):
```js
  const [curRegion, setCurRegion] = useState(0);
  const [coins, setCoins] = useState(() => HXS.loadCoins());
```
  (b) 콜백 추가/수정(기존 `toSelect` 옆):
```js
  const toRegions = useCallback(() => { setG(null); setScreen('regions'); setStars(HXS.loadStars()); setCoins(HXS.loadCoins()); }, []);
  const enterRegion = useCallback((ri) => { setCurRegion(ri); setStars(HXS.loadStars()); setScreen('select'); }, []);
```
  (c) `screen` 주석을 `// menu | regions | select | editor | play`로 갱신.
  (d) 메뉴 렌더에서 `onStage={toSelect}` → `onStage={toRegions}`.
  (e) `'regions'` 스크린 렌더 추가(`'select'` 분기 앞):
```jsx
  if (screen === 'regions') {
    return <RegionMap stars={stars} coins={coins} onPick={enterRegion} onBack={toMenu} />;
  }
```
  (f) `'select'` 렌더를 지역 스코프로:
```jsx
  if (screen === 'select') {
    return <StageSelect stars={stars} region={HXS.REGIONS[curRegion]} onPick={startStage} onBack={toRegions} />;
  }
```
  (GameView `onList` 비-test = `toSelect`는 그대로 — 'select'로 가며 `curRegion`이 유지돼 그 지역 목록을 보여줌. `toSelect`는 onList용으로 남겨둔다.)

- [ ] **Step 5: 지역 카드 스타일** — `styles.css`에 (기존 `.stage-tile`/`.select` 톤 참고):
```css
.region-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.region-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; text-align: left;
  background: var(--bg-1); border: 2px solid var(--bd-1); border-radius: 8px; cursor: pointer; color: var(--tx-1); }
.region-card.locked { opacity: 0.5; cursor: not-allowed; }
.region-card.cleared { background: var(--bg-2, #15182f); }
.region-card .rc-id { font-family: 'Press Start 2P', monospace; font-size: 10px; color: var(--tx-2); }
.region-card .rc-name { flex: 1; font-size: 15px; font-weight: 700; }
.region-card .rc-prog { font-size: 12px; color: var(--gold); white-space: nowrap; }
.region-card .rc-lock { font-size: 11px; color: var(--tx-2); white-space: nowrap; }
```
(존재하지 않는 CSS var는 기존 styles.css에서 실제 변수명 확인 후 맞춤 — 최소 스타일이면 충분.)

- [ ] **Step 6: 검증** —
  - `node tests/_babelcheck.mjs` → 8 ok, 0 fail(app.jsx/screens.jsx JSX 구문).
  - `npm test` → 110 + 3(Task 1) GREEN(screens/app은 stub이라 무영향).
  - 인게임: `node tools/shot.mjs`는 메뉴/엔드리스/스테이지1만 가므로, 임시 캡처(localStorage `hex_stage_stars` 시드해 해금) 또는 컨트롤러 확인으로 ① 메뉴→지역맵(5지역, 잠김/현재) ② 지역 진입→그 지역 스테이지만 ③ 잠긴 지역 진입 불가 육안 확인. (임시 스크립트는 커밋 안 함.)

- [ ] **Step 7: 커밋**
```bash
git add screens.jsx app.jsx styles.css
git commit -m "feat(meta): region map screen + region-scoped stage select + routing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (스펙 수용 기준)

- 메뉴 "스테이지" → 5지역 맵 → 지역 선택 → 그 지역 스테이지만 → 플레이. 엔드리스/에디터 무변경.
- 지역 N+1은 지역 N 보스 클리어 전까지 맵에서 잠겨 보이고 진입 불가.
- 지역 맵이 코인·전체 진행도·지역별 별 진행도 노출.
- `REGIONS`가 빌트인 24스테이지를 5지역으로 정확히 분할(무결성 테스트 통과).
- `npm test`(110+3) + `node tests/_babelcheck.mjs` 8/8 통과.

## 자기검토 메모

- **스펙 커버리지**: 지역 데이터(T1), 해금/클리어/진행 헬퍼(T1), 무결성·해금 테스트(T1), 지역 맵 화면(T2 S1), StageSelect 스코프(T2 S2), 라우팅(T2 S4), 스타일(T2 S5) — 전부 태스크 있음. 보상/업적/밸런스/이름확정은 범위 밖(스펙 일치).
- **명명 일관성**: `REGIONS`(`{id,name,color,from,to}`), `regionStars/regionMax/regionCleared/regionUnlocked`, `RegionMap({stars,coins,onPick,onBack})`, `StageSelect`의 `region` prop, app `curRegion`/`coins`/`toRegions`/`enterRegion` — T1↔T2 동일.
- **하위호환**: StageSelect는 region 없으면 전체 폴백(에디터 등 다른 호출 없음 확인 — app만 호출). isUnlocked/startStage 인덱스 의미 불변.
- **YAGNI**: 보상 훅·업적·데일리·랭킹·지역 비주얼 폴리시 전부 범위 밖.
