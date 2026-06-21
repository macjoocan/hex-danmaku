# B 데일리 시드 챌린지 + 연속출석 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 날짜 고정 시드 "오늘의 도전"(공유 시드 엔드리스) + 연속출석(streak)을 추가한다 (스펙: `docs/superpowers/specs/2026-06-21-daily-challenge-design.md`). 구조만 — 보상/리더보드/밸런스 제외.

**Architecture:** 엔진에 주입 가능한 RNG seam(`Math.random`→`rnd()`)을 넣고 `initState(seed)`로 시드. 데일리 = 시드 엔드리스이며 **`g.seed`(number) 하나가 데일리 표식**(`String(seed)`=`YYYYMMDD`). 데일리/streak 영속은 stages.jsx 순수 함수, UI는 메뉴 "오늘의 도전" 버튼 + 엔드리스 화면 재사용. 기본(seed 없는) 엔드리스·스테이지·fairness 동작 불변.

**Tech Stack:** 브라우저 전역 JSX(React), node:test + vm 하니스(`loadGame({seed})`는 sandbox Math.random 교체), localStorage, `node tests/_babelcheck.mjs`.

## Global Constraints

- **구조만**: 보상·리더보드/주간랭킹(C)·시드 난이도 밸런스(E)·토스 SDK는 범위 밖.
- RNG seam: 기본(seed 없음) 경로 = 전역 `Math.random` → **기존 엔드리스/스테이지/fairness 100% 불변**(하니스 sandbox Math.random 시드도 그대로 작동). 데일리만 시드.
- 데일리 표식 = `g.seed != null`(number). `String(g.seed)` = `YYYYMMDD` dayKey. 데일리 점수는 `hex_daily`에만(일반 `hex_hi` 미오염).
- 무제한 재시도, 그날 최고점만. streak: 플레이=출석, 하루 갭이면 리셋.
- 날짜 계산(`new Date()`)은 app(실게임); 순수 헬퍼는 dayKey **문자열을 인자로** 받음(테스트 결정론).
- 검증 게이트: `npm test`(117 + 신규) + `node tests/_babelcheck.mjs` 8/8 + 스크린샷.

## 핵심 코드 지형 (실측)

- `engine.jsx`: `Math.random()` 사용 — `rp`(78-85: 라인 81/82/83 `<` 비교 + 84 `Math.floor(...*pool.length)`), `tryItem`(118 `>spawnChance`, 131 `cands[Math.floor(...)]`, 132 `roll`), `tryCoin`(146 `>cb.spawnChance`, 160 `cands[Math.floor(...)]`), 스폰 인터벌(349 `<(...)`). (596 `Math.floor(C/2)`는 비랜덤 — 유지.) `initState = () => ({...})`(593~). `Object.assign(window,{HX:{...}})` export(637 부근). 적 이동(stepToward 등)은 랜덤 미사용.
- `stages.jsx`: `initStageDef(def, idx)`(434~), `loadStars`/`saveStars`/`loadCoins`/`loadBest` 등 가드 패턴(try/catch + `typeof localStorage==='undefined'`). HXS export(526-528 부근). `shuffle`/`bossAtk`도 Math.random 쓰지만 **스테이지/보스 모드 전용**(데일리=엔드리스라 무관) — 단 `tryCoin`은 엔진에 있고 스테이지에서도 호출되므로 seam이 닿음 → initStageDef가 시드 리셋해야 함(아래).
- `tests/harness.mjs`: `loadGame({seed})` = sandbox `Math.random`을 Mulberry32로 교체 후 engine+stages 로드. `makeRng(seed)` 존재.
- `app.jsx`: `App()` 상태 `screen`('menu'|'regions'|'select'|'editor'|'play'), `stars`/`hi`/`coins`/`best`/`curRegion`. `startEndless`=`setG(HX.initState())`. `retry`(588~)=`cur.mode==='stage' ? HXS.initStageReplay(cur) : HX.initState()`. 고득점 효과(131-136): `if(!isStage && g.ov && g.sc>hi){ setHi; localStorage hex_hi }`. 메뉴 렌더(597-598): `<MenuScreen hi totalStars maxStars onStage onEndless onEditor/>`.
- `screens.jsx`: `MenuScreen({hi,totalStars,maxStars,onStage,onEndless,onEditor})` — 모드 버튼 3개(stage/endless/editor). export `Object.assign(window,{...MenuScreen...})`.

---

### Task 1: 시드 가능한 RNG seam (engine + stages 리셋) + 결정론 테스트

**Files:**
- Modify: `engine.jsx` (mulberry32 + _rng/seedRng/rnd, Math.random→rnd 교체, initState(seed), export seedRng)
- Modify: `stages.jsx` (initStageDef가 seedRng(null) 리셋)
- Test: `tests/daily.test.mjs` (신규)

**Interfaces:**
- Produces (HX): `seedRng(seed|null)` (seed!=null → 결정론 PRNG, null → 전역 Math.random), `initState(seed?)` (seed 주면 시드+`state.seed=seed`, 없으면 기존 동작+`state.seed=null`).

- [ ] **Step 1: 실패 테스트 작성** — `tests/daily.test.mjs`. `loadGame()`(하니스)로 HX 확보. 결정론: 같은 seed로 두 번 초기화→여러 턴 진행→상태 동일; seed 없으면 기존(하니스 시드 영향).
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, plain } from './harness.mjs';

// 같은 입력으로 N턴 진행한 엔드리스 상태를 비교용으로 직렬화
function runEndless(HX, seed, moves) {
  let s = HX.initState(seed);
  for (const [r, c] of moves) { const n = HX.tick(s, r, c); if (n !== s) s = n; }
  return s;
}
const MOVES = Array.from({ length: 12 }, (_, i) => [10, (i % 7)]); // 임의 고정 입력

test('initState(seed) is deterministic — same seed yields identical run', () => {
  const { HX } = loadGame();
  const a = plain(runEndless(HX, 20260621, MOVES));
  const b = plain(runEndless(HX, 20260621, MOVES));
  assert.deepEqual(a.bl, b.bl);          // 동일 탄막
  assert.deepEqual(a.its, b.its);        // 동일 픽업
  assert.equal(a.sc, b.sc);
});

test('different seeds diverge', () => {
  const { HX } = loadGame();
  const a = plain(runEndless(HX, 20260621, MOVES));
  const b = plain(runEndless(HX, 19990101, MOVES));
  assert.notDeepEqual(a.bl, b.bl);       // 다른 보드 (충분히 진행하면 갈림)
});

test('initState() without seed records seed:null and uses global RNG', () => {
  const { HX } = loadGame();           // 하니스가 sandbox Math.random을 시드함
  const s = HX.initState();
  assert.equal(s.seed, null);
  // 시드 없는 두 런은 (하니스 시드 고정이라) 같지만, seed 필드만 확인
  assert.equal(HX.initState(20260621).seed, 20260621);
});
```
(`a.notDeepEqual`는 12턴 진행 후 보드가 갈린다는 가정 — 갈리지 않으면 MOVES/턴수를 늘려 갈림 확인. plain()으로 sandbox 객체 비교.)

- [ ] **Step 2: 실패 확인** — `node --test tests/daily.test.mjs` → FAIL(`initState`가 seed 무시, `s.seed` 없음).

- [ ] **Step 3: engine 구현** —
  (a) 파일 상단(상수 뒤, rp 앞 부근)에 RNG seam 추가:
```js
// ─── injectable RNG (daily challenge uses a date seed; default = global Math.random) ───
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let _rng = null;
const seedRng = (seed) => { _rng = (seed != null) ? mulberry32(seed >>> 0) : null; };
const rnd = () => (_rng || Math.random)();
```
  (b) 엔진의 모든 `Math.random()`을 `rnd()`로 교체: rp(81/82/83 `rnd() < ...`, 84 `Math.floor(rnd()*pool.length)`), tryItem(118 `rnd() > ...`, 131 `cands[Math.floor(rnd()*cands.length)]`, 132 `const roll = rnd()`), tryCoin(146 `rnd() > ...`, 160 `cands[Math.floor(rnd()*cands.length)]`), 인터벌(349 `rnd() < (...)`). **596 `Math.floor(C/2)`는 비랜덤이므로 그대로.**
  (c) `initState`를 seed 인자 + 시드 적용 + `seed` 필드로:
```js
const initState = (seed) => {
  seedRng(seed);
  return {
    mode: 'endless',
    seed: seed != null ? seed : null,
    stage: null,
    pl: { r: R - 1, c: Math.floor(C / 2) },
    // ... 기존 필드 전부 그대로 ...
  };
};
```
  (d) export 목록에 `seedRng` 추가.

- [ ] **Step 4: stages 리셋** — `stages.jsx` `initStageDef(def, idx)` 함수 본문 **첫 줄**에 추가(스테이지는 데일리 시드를 쓰면 안 됨 — 전역 RNG로):
```js
  window.HX.seedRng(null);
```
(initStageDef가 `const base = {...}` 만들기 전에 호출. initStageReplay→initStageDef 경유라 retry도 커버.)

- [ ] **Step 5: 통과 확인** — `node --test tests/daily.test.mjs` PASS → **`npm test` 전체 GREEN(117 + 신규)**. 특히 `tests/fairness.test.mjs`·엔드리스 관련 테스트가 그대로 통과해야 함(기본 경로 = 전역 Math.random, 하니스 시드 불변). `node tests/_babelcheck.mjs` 8/8.

- [ ] **Step 6: 커밋**
```bash
git add engine.jsx stages.jsx tests/daily.test.mjs
git commit -m "feat(daily): injectable seeded RNG (rnd/seedRng) + initState(seed); default unchanged"
```
(커밋 메시지에 한글 미사용 — 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가. 한글이 필요하면 `git commit -F`로 파일 경유.)

---

### Task 2: 데일리/streak 영속 + bumpStreak (stages.jsx)

**Files:**
- Modify: `stages.jsx` (loadDaily/saveDailyScore, loadStreak/saveStreak, bumpStreak + HXS export)
- Test: `tests/daily.test.mjs` (확장)

**Interfaces:**
- Produces (HXS): `loadDaily()→{day,best}`, `saveDailyScore(day, score)→{day,best}`, `loadStreak()→{lastDay,streak}`, `saveStreak(obj)→obj`, `bumpStreak(prev, today, yesterday)→{lastDay,streak}`.

- [ ] **Step 1: 실패 테스트 추가** — `tests/daily.test.mjs`. 영속은 localStorage stub 필요 → `loadEditor`(store 보유); `bumpStreak`은 순수라 `loadGame`로 충분.
```js
import { loadEditor } from './harness.mjs'; // 상단 import에 추가

test('saveDailyScore keeps best for the day; resets on new day', () => {
  const { HXS, store } = loadEditor();
  store.delete('hex_daily');
  HXS.saveDailyScore('20260621', 100);
  assert.equal(HXS.loadDaily().best, 100);
  HXS.saveDailyScore('20260621', 80);   // lower → ignored
  assert.equal(HXS.loadDaily().best, 100);
  HXS.saveDailyScore('20260621', 150);  // higher → updates
  assert.equal(HXS.loadDaily().best, 150);
  HXS.saveDailyScore('20260622', 5);    // new day → reset
  assert.deepEqual({ day: HXS.loadDaily().day, best: HXS.loadDaily().best }, { day: '20260622', best: 5 });
});

test('loadDaily returns {day:"",best:0} on missing/corrupt', () => {
  const { HXS, store } = loadEditor();
  store.delete('hex_daily');
  assert.deepEqual({ ...HXS.loadDaily() }, { day: '', best: 0 });
  store.set('hex_daily', 'garbage');
  assert.deepEqual({ ...HXS.loadDaily() }, { day: '', best: 0 });
});

test('bumpStreak: consecutive +1, same-day hold, gap resets', () => {
  const { HXS } = loadGame();
  const { bumpStreak } = HXS;
  // 어제 출석(streak 3) + 오늘 → +1
  assert.deepEqual(bumpStreak({ lastDay: '20260620', streak: 3 }, '20260621', '20260620'), { lastDay: '20260621', streak: 4 });
  // 오늘 이미 출석 → 유지
  assert.deepEqual(bumpStreak({ lastDay: '20260621', streak: 4 }, '20260621', '20260620'), { lastDay: '20260621', streak: 4 });
  // 갭(어제가 lastDay 아님) → 1
  assert.deepEqual(bumpStreak({ lastDay: '20260615', streak: 9 }, '20260621', '20260620'), { lastDay: '20260621', streak: 1 });
  // 최초(빈 prev) → 1
  assert.deepEqual(bumpStreak({ lastDay: '', streak: 0 }, '20260621', '20260620'), { lastDay: '20260621', streak: 1 });
});

test('loadStreak/saveStreak round-trip', () => {
  const { HXS, store } = loadEditor();
  store.delete('hex_streak');
  assert.deepEqual({ ...HXS.loadStreak() }, { lastDay: '', streak: 0 });
  HXS.saveStreak({ lastDay: '20260621', streak: 7 });
  assert.equal(HXS.loadStreak().streak, 7);
});
```
(deepEqual은 sandbox realm 경계로 `{...x}`/`plain()` 래핑 — economy.test.mjs 패턴.)

- [ ] **Step 2: 실패 확인** — FAIL(미정의).

- [ ] **Step 3: 구현** — `stages.jsx`, 영속 함수들 근처(loadStars 패턴)에:
```js
// ─── Daily challenge + attendance streak (localStorage) ───
const loadDaily = () => {
  try {
    if (typeof localStorage === 'undefined') return { day: '', best: 0 };
    const v = JSON.parse(localStorage.getItem('hex_daily') || 'null');
    return (v && typeof v === 'object' && typeof v.day === 'string') ? { day: v.day, best: v.best || 0 } : { day: '', best: 0 };
  } catch { return { day: '', best: 0 }; }
};
const saveDailyScore = (day, score) => {
  const cur = loadDaily();
  const next = (cur.day === day) ? { day, best: Math.max(cur.best, score) } : { day, best: score };
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('hex_daily', JSON.stringify(next)); } catch {}
  return next;
};
const loadStreak = () => {
  try {
    if (typeof localStorage === 'undefined') return { lastDay: '', streak: 0 };
    const v = JSON.parse(localStorage.getItem('hex_streak') || 'null');
    return (v && typeof v === 'object' && typeof v.lastDay === 'string') ? { lastDay: v.lastDay, streak: v.streak || 0 } : { lastDay: '', streak: 0 };
  } catch { return { lastDay: '', streak: 0 }; }
};
const saveStreak = (obj) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('hex_streak', JSON.stringify(obj)); } catch {}
  return obj;
};
// 순수: today/yesterday는 dayKey 문자열(인자 주입 — 테스트 결정론)
const bumpStreak = (prev, today, yesterday) => {
  if (prev && prev.lastDay === today) return { lastDay: today, streak: prev.streak };
  if (prev && prev.lastDay === yesterday) return { lastDay: today, streak: (prev.streak || 0) + 1 };
  return { lastDay: today, streak: 1 };
};
```
HXS export에 `loadDaily, saveDailyScore, loadStreak, saveStreak, bumpStreak` 추가.

- [ ] **Step 4: 통과 확인** — `node --test tests/daily.test.mjs` PASS → `npm test` 전체 GREEN.

- [ ] **Step 5: 커밋**
```bash
git add stages.jsx tests/daily.test.mjs
git commit -m "feat(daily): daily best + attendance streak persistence + bumpStreak"
```
(`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가.)

---

### Task 3: UI/라우팅 — 오늘의 도전 버튼 + 데일리 런 + HUD (app.jsx, screens.jsx, styles.css)

**Files:**
- Modify: `screens.jsx` (MenuScreen에 오늘의 도전 버튼)
- Modify: `app.jsx` (dayKey/yesterdayKey, startDaily, retry 시드 보존, 데일리 점수/고득점 분기, 메뉴 props)
- Modify: `styles.css` (필요 시 버튼 톤 — 기존 .mode-btn 재사용 가능하면 최소)

**Interfaces:**
- Consumes (HX/HXS): `initState(seed)`, `loadDaily`/`saveDailyScore`/`loadStreak`/`saveStreak`/`bumpStreak`.

- [ ] **Step 1: app — 날짜 헬퍼 + 데일리 상태** — `app.jsx` `App()` 내, 상태 옆:
```js
  const dayKey = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = () => dayKey(new Date());
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const [daily, setDaily] = useState(() => HXS.loadDaily());
  const [streak, setStreak] = useState(() => HXS.loadStreak());
```

- [ ] **Step 2: startDaily + retry 시드 보존** — `app.jsx`:
```js
  const startDaily = useCallback(() => {
    const today = todayKey();
    const st = HXS.saveStreak(HXS.bumpStreak(HXS.loadStreak(), today, yesterdayKey()));
    setStreak(st);
    setDaily(HXS.loadDaily());
    setG(HX.initState(Number(today)));   // seed = YYYYMMDD; g.seed marks daily
    setScreen('play'); setRunId(n => n + 1);
  }, []);
```
`retry`(588~)의 엔드리스 분기에서 시드 보존:
```js
    setG(cur => (cur ? (cur.mode === 'stage' ? HXS.initStageReplay(cur) : HX.initState(cur.seed)) : cur));
```
(`cur.seed`가 null이면 일반 엔드리스, number면 데일리 — 같은 보드 재도전.)

- [ ] **Step 3: 데일리 점수 저장 + 고득점 분기** — `app.jsx` 고득점 효과(131-136)를 데일리 제외 + 데일리 저장으로:
```js
  // high score (normal endless only — daily score goes to hex_daily, not hex_hi)
  useEffect(() => {
    if (isStage || !g.ov) return;
    if (g.seed != null) {                      // daily run
      setDaily(HXS.saveDailyScore(String(g.seed), g.sc));
    } else if (g.sc > hi) {                    // normal endless
      setHi(g.sc); setNewRec(true);
      try { localStorage.setItem('hex_hi', String(g.sc)); } catch {}
    }
  }, [g.ov]);
```

- [ ] **Step 4: 메뉴 버튼** — `screens.jsx` `MenuScreen` 시그니처에 `onDaily, dailyBest, streak` 추가, 엔드리스 버튼 아래(또는 위)에:
```jsx
      <button className="mode-btn daily" onClick={onDaily}>
        <span className="mb-ico">🔥</span>
        <span className="mb-text">
          <span className="mb-name">오늘의 도전</span>
          <span className="mb-desc">매일 바뀌는 시드 · 전국 동일 보드</span>
        </span>
        <span className="mb-meta">오늘 {String(dailyBest).padStart(5, '0')} · 🔥{streak}</span>
      </button>
```
`app.jsx` 메뉴 렌더(597-598)에 prop 전달: `onDaily={startDaily}` + `dailyBest={daily.day === todayKey() ? daily.best : 0}` + `streak={streak.streak}`. (날짜 바뀌면 오늘 best 0 표시.)

- [ ] **Step 5: 데일리 HUD 라벨(선택, 최소)** — 엔드리스 HUD에 `g.seed != null`이면 "오늘의 도전" 라벨/오늘 최고점 표시. 기존 엔드리스 HUD에서 `g.seed != null ? '오늘의 도전' : '엔드리스'` 정도로 라벨 분기(과하면 생략 — 핵심은 메뉴+런 동작). styles.css는 `.mode-btn.daily` 색만 필요 시 추가(없으면 기본 .mode-btn 톤).

- [ ] **Step 6: 검증** —
  - `node tests/_babelcheck.mjs` → 8 ok(app.jsx/screens.jsx JSX).
  - `npm test` → 전체 GREEN(Task1/2 신규 포함).
  - 인게임: 임시 캡처(localStorage `hex_daily`/`hex_streak` 시드) 또는 컨트롤러 확인으로 ① 메뉴 "오늘의 도전"(오늘 최고점·🔥streak) ② 진입→엔드리스 보드(데일리) ③ 같은 날 재진입 시 같은 보드 육안. (임시 스크립트 커밋 안 함.)

- [ ] **Step 7: 커밋**
```bash
git add screens.jsx app.jsx styles.css
git commit -m "feat(daily): 오늘의 도전 menu entry + daily run wiring + HUD"
```
(한글 포함 → `git commit -F <msgfile>` 사용. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가.)

---

## 완료 기준 (스펙 수용 기준)

- 메뉴 "오늘의 도전" → 그날 시드 고정 엔드리스(같은 날 같은 보드), 오늘 최고점·🔥streak 표시.
- 같은 seed 두 번 시작 = 동일 보드 시퀀스(결정론 테스트). seed 없는 엔드리스/스테이지/fairness 기존과 동일(회귀 없음).
- 데일리 플레이 시 streak 규칙대로 증가/유지/리셋; 그날 최고점 더 높을 때만 갱신; 데일리 점수는 hex_hi 미오염.
- `npm test`(117+신규) + `node tests/_babelcheck.mjs` 8/8, 보상·경제·리더보드 무변경.

## 자기검토 메모

- **스펙 커버리지**: RNG seam(T1), initState(seed)+결정론(T1), initStageDef 리셋(T1), daily/streak 영속(T2), bumpStreak(T2), 메뉴/런/HUD/retry-시드보존/점수분기(T3) — 전부 태스크. 리더보드/보상/밸런스/SDK 범위 밖(스펙 일치).
- **명명 일관성**: `seedRng`/`rnd`/`_rng`/`mulberry32`, `initState(seed)`+`state.seed`, `loadDaily`/`saveDailyScore`/`loadStreak`/`saveStreak`/`bumpStreak(prev,today,yesterday)`, `g.seed`=데일리 표식(`String(g.seed)`=day), 메뉴 `onDaily`/`dailyBest`/`streak` — T1↔T2↔T3 동일.
- **회귀 안전**: 기본 경로 rnd→Math.random 불변; initStageDef가 seedRng(null) 리셋(스테이지/보스/tryCoin이 데일리 시드 안 물게); retry가 cur.seed로 데일리 재시드. fairness/엔드리스 테스트 그대로 통과 예상.
- **테스트 격리**: 결정론/bumpStreak은 loadGame(인자 주입); daily/streak 영속은 loadEditor(localStorage stub). deepEqual은 sandbox realm 경계로 `{...}`/plain 래핑.
- **YAGNI**: 리더보드·보상·시드 난이도·전용 종료조건·SDK 전부 범위 밖.
