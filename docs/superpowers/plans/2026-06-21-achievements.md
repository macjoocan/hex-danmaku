# A2 지역별 업적 + 달성도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지역(월드)마다 업적을 정의하고 달성도(%)를 지역 맵·스테이지 화면에 표시한다. 추적은 별점(기존) + 신규 스테이지별 최소턴 (스펙: `docs/superpowers/specs/2026-06-21-achievements-design.md`). 구조+표시만 — 보상 없음.

**Architecture:** `stages.jsx`에 최소턴 지갑(`loadBest`/`saveBest`) + `ACHIEVEMENTS` 데이터(순수 `check` predicate) + 달성도 헬퍼(`achvDone`/`regionAchv`/`totalAchv`)를 추가(HXS 노출). app의 기존 클리어 효과에서 최소턴 저장. `RegionMap` 카드에 업적 done/total, `StageSelect`에 지역 업적 리스트 표시. 보상·경제 무변경, 엔진/게임플레이 무변경.

**Tech Stack:** 브라우저 전역 JSX(React), node:test + vm 하니스(`loadGame`→{HX,HXS}), localStorage, `node tests/_babelcheck.mjs`, `node tools/shot.mjs`.

## Global Constraints

- **구조 + 표시만**: 보상(코인 claim)·데일리/랭킹·밸런스 수치 확정·이름 확정·전용 업적 화면·코인 올수집 업적은 범위 밖.
- 업적 `check`는 **순수 predicate**(별/최고턴만 읽음). 새 업적은 데이터 추가만으로 확장.
- 무스킬 = 별 3 (기존 인코딩). 속공 턴 임계값은 **플레이스홀더**(나중 튜닝).
- 최소턴 저장은 **더 빠를 때만** 갱신, 클리어 시 `_test` 제외. 엔진/게임플레이/경제 무변경.
- 검증 게이트: `npm test`(113 + 신규) + `node tests/_babelcheck.mjs` 8/8 + 인게임 스크린샷.

## 핵심 코드 지형 (실측)

- `stages.jsx`: `loadStars()`/`saveStars(id, stars)`(localStorage `hex_stage_stars`, id→0..3), `rateStage(s)`(0스킬→3/≤2→2/else1), `REGIONS`(`{id,name,color,from,to}`), `regionStars/regionMax/regionCleared/regionUnlocked`. HXS export 목록 `stages.jsx:526-528` (`REGIONS, regionStars, regionMax, regionCleared, regionUnlocked, loadStars, saveStars, isUnlocked, rateStage, loadCoins, saveCoins, coinReward, TYPE_META`).
- `app.jsx` 클리어 효과 `app.jsx:139-149`: `if (isStage && g.win && !g._test) { sNum=rateStage(g); ...saveStars(g.stage.id, sNum); ...saveCoins(...) }`. `g.t`=턴, `g.stage.id`.
- `screens.jsx`: `RegionMap({stars,coins,onPick,onBack})`(지역 카드, `★ got/max`), `StageSelect({stars,region,onPick,onBack})`(지역 스코프 그리드, select-bar). `Stars` 컴포넌트. 끝에 `Object.assign(window, { Stars, MenuScreen, StageSelect, ClearOverlay, FailOverlay, RegionMap })`.
- vm 하니스 `loadGame()`→{HX,HXS}; localStorage stub은 `loadEditor`에만 있음 — 순수 헬퍼 테스트는 `loadGame`이 아니라 직접 호출 가능한 함수가 localStorage를 try/catch로 감싸 `typeof localStorage==='undefined'`면 폴백하므로 vm `loadGame` 컨텍스트(localStorage 없음)에서도 `load*`는 폴백 반환. **단 best 저장/로드 라운드트립은 `loadEditor`(localStorage stub 보유) 또는 별도 stub로 테스트.** (loadStars도 같은 구조 — 기존 테스트 참고.)

---

### Task 1: 최소턴 지갑 (loadBest/saveBest) + 클리어 시 저장

**Files:**
- Modify: `stages.jsx` (loadBest/saveBest + HXS export)
- Modify: `app.jsx` (클리어 효과에서 saveBest)
- Test: `tests/achievements.test.mjs` (신규)

**Interfaces:**
- Produces (HXS): `loadBest()` → `{ [id]: { turns } }`, `saveBest(id, turns)` → 갱신된 맵(더 작은 turns만 반영).

- [ ] **Step 1: 실패 테스트 작성** — `tests/achievements.test.mjs`. best 라운드트립은 localStorage stub이 필요하므로 `loadEditor`(stub 보유)를 쓴다(기존 economy/overrides 테스트가 loadEditor의 localStorage stub을 쓰는 방식 참고):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor } from './harness.mjs';

test('saveBest records turns; loadBest reads them; only faster updates', () => {
  const { HXS, store } = loadEditor();
  store.delete?.('hex_stage_best');
  HXS.saveBest(3, 20);
  assert.equal(HXS.loadBest()[3].turns, 20);
  HXS.saveBest(3, 25);                       // slower → ignored
  assert.equal(HXS.loadBest()[3].turns, 20);
  HXS.saveBest(3, 12);                       // faster → updates
  assert.equal(HXS.loadBest()[3].turns, 12);
});

test('loadBest returns {} on missing/corrupt storage', () => {
  const { HXS, store } = loadEditor();
  store.delete?.('hex_stage_best');
  assert.deepEqual(HXS.loadBest(), {});
  store.set('hex_stage_best', 'garbage');
  assert.deepEqual(HXS.loadBest(), {});
});
```
(하니스의 `loadEditor` 반환 객체에 `store`가 노출되는지 확인 — economy/overrides 테스트가 store/win을 쓰는 방식과 동일하게. 없으면 win.localStorage 경유.)

- [ ] **Step 2: 실패 확인** — `node --test tests/achievements.test.mjs` → FAIL(`saveBest`/`loadBest` 미정의).

- [ ] **Step 3: 구현** — `stages.jsx`, `saveStars` 정의 근처(같은 localStorage 패턴)에 추가:
```js
// ─── Per-stage best (min turns) — for speed achievements ───────
const loadBest = () => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const v = JSON.parse(localStorage.getItem('hex_stage_best') || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
};
const saveBest = (id, turns) => {
  const all = loadBest();
  if (!all[id] || turns < all[id].turns) {
    all[id] = { turns };
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('hex_stage_best', JSON.stringify(all)); } catch {}
  }
  return loadBest();
};
```
HXS export 목록(`stages.jsx:526-528`)에 `loadBest, saveBest` 추가.

- [ ] **Step 4: app 클리어 효과에서 저장** — `app.jsx:147`(`HXS.saveCoins(...)`) 다음 줄에 추가:
```js
      HXS.saveBest(g.stage.id, g.t);
```
(같은 `if (isStage && g.win && !g._test)` 블록 안 — `_test` 제외.)

- [ ] **Step 5: 통과 확인** — `node --test tests/achievements.test.mjs` PASS → `npm test` 전체 GREEN(113 + 2) → `node tests/_babelcheck.mjs` 8/8(app.jsx JSX).

- [ ] **Step 6: 커밋**
```bash
git add stages.jsx app.jsx tests/achievements.test.mjs
git commit -m "feat(meta): per-stage best-turns store (loadBest/saveBest) + save on clear

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 업적 데이터 + 달성도 헬퍼 (stages.jsx)

**Files:**
- Modify: `stages.jsx` (ACHIEVEMENTS + achvDone/regionAchv/totalAchv + HXS export)
- Test: `tests/achievements.test.mjs` (확장)

**Interfaces:**
- Consumes: `REGIONS`, `STAGES`, `loadBest` (Task 1).
- Produces (HXS): `ACHIEVEMENTS` (배열 `{id, region, name, desc, check}`), `achvDone(achv, stars, best)→bool`, `regionAchv(regionId, stars, best)→{done,total}`, `totalAchv(stars, best)→{done,total,pct}`.

- [ ] **Step 1: 실패 테스트 추가** — `tests/achievements.test.mjs`:
```js
import { loadGame } from './harness.mjs'; // (상단 import에 추가; loadGame은 localStorage 불필요 — 인자로 stars/best 주입)

test('achievement checks: 완주/정복/속공 (region 1)', () => {
  const { HXS } = loadGame();
  const { REGIONS, STAGES, ACHIEVEMENTS, achvDone } = HXS;
  const r = REGIONS[0]; // from..to
  const ids = []; for (let i = r.from; i <= r.to; i++) ids.push(STAGES[i].id);
  const allStars = (n) => Object.fromEntries(ids.map(id => [id, n]));
  const find = (suffix) => ACHIEVEMENTS.find(a => a.region === r.id && a.id.endsWith(suffix));
  // 완주: 전부 별≥1
  assert.equal(achvDone(find('clear'), {}, {}), false);
  assert.equal(achvDone(find('clear'), allStars(1), {}), true);
  // 정복: 전부 별===3
  assert.equal(achvDone(find('master'), allStars(2), {}), false);
  assert.equal(achvDone(find('master'), allStars(3), {}), true);
  // 속공: 보스 best.turns <= 임계 (임계값 자체는 플레이스홀더 — 충분히 큰/작은 값으로 양쪽 검증)
  const bossId = STAGES[r.to].id;
  assert.equal(achvDone(find('speed'), allStars(3), {}), false);            // best 없음
  assert.equal(achvDone(find('speed'), allStars(3), { [bossId]: { turns: 1 } }), true); // 아주 빠름 → 달성
});

test('regionAchv / totalAchv aggregate', () => {
  const { HXS } = loadGame();
  const { REGIONS, regionAchv, totalAchv } = HXS;
  const ra = regionAchv(REGIONS[0].id, {}, {});
  assert.ok(ra.total >= 3 && ra.done === 0);
  const ta = totalAchv({}, {});
  assert.ok(ta.total >= ra.total && ta.done === 0 && ta.pct === 0);
});
```
(`a.id.endsWith('clear'|'master'|'speed')` — 업적 id 컨벤션 `r{n}-clear`/`-master`/`-speed`로 둔다. find가 null이면 컨벤션 불일치이므로 실패로 드러남.)

- [ ] **Step 2: 실패 확인** — FAIL(ACHIEVEMENTS/헬퍼 미정의).

- [ ] **Step 3: 구현** — `stages.jsx`, `REGIONS`/`regionUnlocked` 뒤에:
```js
// ─── Achievements (per-region + global; pure checks over stars + best) ───
// id 컨벤션: 'r{regionId}-clear|master|speed', 글로벌 'g-*'. 수치는 플레이스홀더(E에서 튜닝).
const SPEED_TURNS = 30; // placeholder boss speed-clear threshold
const ACHIEVEMENTS = [
  ...REGIONS.flatMap(r => [
    { id: `r${r.id}-clear`,  region: r.id, name: `${r.name} 돌파`, desc: '모든 스테이지 클리어',
      check: ({ stars, region, STAGES }) => { for (let i = region.from; i <= region.to; i++) if (!(stars[STAGES[i].id] > 0)) return false; return true; } },
    { id: `r${r.id}-master`, region: r.id, name: `${r.name} 정복`, desc: '모든 스테이지 ★3 (무스킬)',
      check: ({ stars, region, STAGES }) => { for (let i = region.from; i <= region.to; i++) if ((stars[STAGES[i].id] || 0) !== 3) return false; return true; } },
    { id: `r${r.id}-speed`,  region: r.id, name: `${r.name} 속공`, desc: `보스를 ${SPEED_TURNS}턴 이하로`,
      check: ({ best, region, STAGES }) => { const b = best[STAGES[region.to].id]; return !!b && b.turns <= SPEED_TURNS; } },
  ]),
  { id: 'g-allclear', region: 'global', name: '세계 정복', desc: '전 지역 클리어',
    check: ({ stars, STAGES }) => REGIONS.every(r => (stars[STAGES[r.to].id] || 0) > 0) },
];
const achvCtx = (achv, stars, best) => ({
  stars, best, STAGES,
  region: achv.region === 'global' ? null : REGIONS.find(r => r.id === achv.region),
});
const achvDone = (achv, stars, best) => !!achv && achv.check(achvCtx(achv, stars, best));
const regionAchv = (regionId, stars, best) => {
  const list = ACHIEVEMENTS.filter(a => a.region === regionId);
  return { done: list.filter(a => achvDone(a, stars, best)).length, total: list.length };
};
const totalAchv = (stars, best) => {
  const done = ACHIEVEMENTS.filter(a => achvDone(a, stars, best)).length;
  const total = ACHIEVEMENTS.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};
```
HXS export에 `ACHIEVEMENTS, achvDone, regionAchv, totalAchv` 추가. (`ACHIEVEMENTS`는 `REGIONS` 뒤에 정의 — REGIONS 참조.)

- [ ] **Step 4: 통과 확인** — `node --test tests/achievements.test.mjs` PASS → `npm test` 전체 GREEN.

- [ ] **Step 5: 커밋**
```bash
git add stages.jsx tests/achievements.test.mjs
git commit -m "feat(meta): ACHIEVEMENTS data + pure done/region/total helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 표시 — 지역 카드 업적 + 스테이지 화면 업적 리스트 (screens.jsx, app.jsx, styles.css)

**Files:**
- Modify: `screens.jsx` (RegionMap 카드에 업적 done/total, StageSelect에 업적 리스트 패널)
- Modify: `app.jsx` (best 로드 + RegionMap/StageSelect에 best 전달)
- Modify: `styles.css` (업적 리스트 스타일)

**Interfaces:**
- Consumes (HXS): `ACHIEVEMENTS`, `achvDone`, `regionAchv`, `loadBest`.

- [ ] **Step 1: app — best 상태 + 전달** — `app.jsx`:
  (a) 상태 추가(`App()`의 stars/coins 옆): `const [best, setBest] = useState(() => HXS.loadBest());`
  (b) `toRegions`/`enterRegion` 콜백에서 best 새로고침: 각 콜백에 `setBest(HXS.loadBest());` 추가(stars 새로고침 옆).
  (c) 렌더 분기에 best 전달: `'regions'` → `<RegionMap stars={stars} coins={coins} best={best} onPick={enterRegion} onBack={toMenu} />`; `'select'` → `<StageSelect stars={stars} best={best} region={HXS.REGIONS[curRegion]} onPick={startStage} onBack={toRegions} />`.

- [ ] **Step 2: RegionMap 카드 업적** — `screens.jsx` `RegionMap({stars,coins,best,onPick,onBack})`: `regionAchv` 구조분해 추가. 열린 카드의 진행 표시에 업적 추가(잠긴 카드는 미표시):
```jsx
// (rc-prog 라인에서, open일 때)
const ach = regionAchv(r.id, stars, best || {});
// ...
<span className="rc-prog">★ {got}/{max}{cleared ? ' ✓' : ''} · 업적 {ach.done}/{ach.total}</span>
```
(`best`가 없을 수 있으니 `best || {}`.)

- [ ] **Step 3: StageSelect 업적 리스트** — `screens.jsx` `StageSelect({stars,best,region,onPick,onBack})`: `ACHIEVEMENTS`/`achvDone` 구조분해. `region`이 있을 때 select-bar 다음에 그 지역 업적 리스트 패널 렌더:
```jsx
{region && (
  <div className="achv-list">
    {window.HXS.ACHIEVEMENTS.filter(a => a.region === region.id).map(a => {
      const done = window.HXS.achvDone(a, stars, best || {});
      return (
        <div key={a.id} className={`achv-item ${done ? 'done' : ''}`}>
          <span className="achv-mark">{done ? '✓' : '○'}</span>
          <span className="achv-name">{a.name}</span>
          <span className="achv-desc">{a.desc}</span>
        </div>
      );
    })}
  </div>
)}
```
(stage-grid 위에 위치. `best || {}` 가드.)

- [ ] **Step 4: 스타일** — `styles.css`에(기존 `.region-card`/`.select` 톤):
```css
.achv-list { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; }
.achv-item { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--tx-2); }
.achv-item.done { color: var(--gold); }
.achv-item .achv-mark { width: 14px; }
.achv-item .achv-name { font-weight: 700; }
.achv-item .achv-desc { color: var(--tx-2); font-size: 11px; }
```

- [ ] **Step 5: 검증** —
  - `node tests/_babelcheck.mjs` → 8 ok(screens.jsx/app.jsx JSX).
  - `npm test` → 113 + Task1/2 신규 GREEN(screens/app stub이라 무영향).
  - 인게임: 임시 캡처(localStorage `hex_stage_stars` + `hex_stage_best` 시드) 또는 컨트롤러 확인으로 ① 지역 카드에 "업적 done/total" ② 지역 스테이지 화면에 업적 리스트(✓/○) 육안. (임시 스크립트 커밋 안 함.)

- [ ] **Step 6: 커밋**
```bash
git add screens.jsx app.jsx styles.css
git commit -m "feat(meta): show region achievements (card count + stage-screen list)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (스펙 수용 기준)

- 클리어 시 최소턴이 `hex_stage_best`에 저장(더 빠를 때만, `_test` 제외).
- `ACHIEVEMENTS`가 지역별 완주·정복·속공 + 글로벌을 정의, 각 check가 별/최고턴으로 순수 판정.
- 지역 맵 카드가 업적 done/total, 지역 스테이지 화면이 업적 리스트(✓/○) 표시.
- `regionAchv`/`totalAchv` 정확 집계(단위 테스트).
- `npm test`(113+신규) + `node tests/_babelcheck.mjs` 8/8, 보상·경제 무변경.
- 새 업적은 `ACHIEVEMENTS` 데이터 추가만으로 확장.

## 자기검토 메모

- **스펙 커버리지**: 최소턴 추적+클리어 저장(T1), ACHIEVEMENTS+순수 check(T2), 달성도 헬퍼(T2), 지역카드/스테이지화면 표시(T3), 데이터 확장성(T2 flatMap+filter) — 전부 태스크. 보상/데일리/랭킹/전용화면/코인올수집 범위 밖(스펙 일치).
- **명명 일관성**: `loadBest`/`saveBest`(`{[id]:{turns}}`), `ACHIEVEMENTS`(`{id,region,name,desc,check}`), `achvDone(achv,stars,best)`/`regionAchv(regionId,stars,best)→{done,total}`/`totalAchv(stars,best)→{done,total,pct}`, id 컨벤션 `r{n}-clear|master|speed`/`g-*` — T1↔T2↔T3 동일. RegionMap/StageSelect에 `best` prop 추가.
- **테스트 격리**: best 라운드트립은 localStorage stub 필요 → `loadEditor` 사용; 순수 check/집계는 `loadGame` + 인자 주입(localStorage 불요).
- **YAGNI**: 보상·전용 업적 화면·풍부 메트릭·이름확정 전부 범위 밖.
