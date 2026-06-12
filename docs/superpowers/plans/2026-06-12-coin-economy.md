# 코인 경제 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스테이지 모드의 스킬 결제를 점수에서 "런 간 지속 코인"으로 전환한다 (스펙: `docs/superpowers/specs/2026-06-12-coin-economy-design.md`). 엔드리스는 현행 점수 차감 유지.

**Architecture:** 코인을 게임 상태(`s.coins`)로 운반해 엔진 순수성 유지. 지갑(`loadCoins/saveCoins`)은 stages.jsx의 `loadStars` 패턴. 스킬 3종은 `skillPay()` 헬퍼로 모드 분기(stage=코인+회수제한, endless=점수). 신규 픽업 `cn`(코인)은 스테이지 모드에서만 스폰.

**Tech Stack:** 순수 JS(엔진/스테이지) + React JSX(앱/에디터), node:test + vm 하니스(`plain()` 래핑), localStorage.

**참고 — 기존 코드 지형**
- 스킬: [engine.jsx:488-513](../../../engine.jsx) `doUndo/doBomb/doFreeze` (점수 차감), BAL은 engine.jsx:43-49 `DEFAULT_BAL`, `bal()` = `window.HXB || DEFAULT_BAL`
- 아이템 스폰: engine.jsx:113-136 `tryItem` (pSc/pBm/pTp, ht=나머지), 수집: engine.jsx:363-382
- 지속 저장: stages.jsx:419-431 `loadStars/saveStars` (`hex_stage_stars`), `rateStage`: stages.jsx:436-439
- 앱: app.jsx:55-64 `SkillBtn3`(비용 하드코딩 30/50/80), 472-483 스킬 패널, 120-127 클리어 효과, 441-448 ClearOverlay 호출(본체는 screens.jsx)
- 에디터: editor.jsx:35-58 `BAL_FIELDS`
- vm 하니스: sandbox가 별도 realm — 객체 비교는 `plain()` 래핑, localStorage는 sandbox에 stub 필요

---

### Task 1: 지갑 + 클리어 보상 헬퍼 (stages.jsx)

**Files:**
- Modify: `stages.jsx` (loadStars 근처 + exports)
- Modify: `engine.jsx` (window.HX exports에 `bal` 추가 — 1곳)
- Test: `tests/economy.test.mjs` (신규)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/economy.test.mjs` 신규. 기존 테스트 파일들의 하니스 로딩 방식을 그대로 따르되(파일 상단 import 패턴은 `tests/overrides.test.mjs` 참고), sandbox에 localStorage stub을 넣는다:

```js
// tests/economy.test.mjs — 코인 경제 (지갑, 스킬 모드 분기, 픽업, 보상)
import { test } from 'node:test';
import assert from 'node:assert/strict';
// 하니스 로딩은 tests/overrides.test.mjs와 동일 패턴 사용 (engine+stages 로드).
// sandbox.localStorage = (() => { let m = {}; return {
//   getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _reset: () => { m = {}; },
// }; })();   ← 하니스 생성부에 주입

test('wallet: saveCoins -> loadCoins round-trips, floors and clamps', () => {
  sandbox.localStorage._reset();
  HXS.saveCoins(123.7);
  assert.equal(HXS.loadCoins(), 123);
  HXS.saveCoins(-5);
  assert.equal(HXS.loadCoins(), 0);
});

test('wallet: corrupted storage value loads as 0', () => {
  sandbox.localStorage.setItem('hex_coins', 'garbage');
  assert.equal(HXS.loadCoins(), 0);
});

test('coinReward: first clear pays clearPerStar per star, repeat pays repeatPerStar', () => {
  assert.equal(HXS.coinReward(3, true), 60);   // 3성 첫 클리어 = 3×20
  assert.equal(HXS.coinReward(2, false), 10);  // 2성 재클리어 = 2×5
  assert.equal(HXS.coinReward(0, true), 0);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/economy.test.mjs` → FAIL (`loadCoins is not a function`).

- [ ] **Step 3: 구현** — stages.jsx의 `loadStars/saveStars` 바로 아래에:

```js
// ─── Coin wallet (run-persistent currency; stage-mode skill payment) ───
const loadCoins = () => {
  try {
    const n = Number(localStorage.getItem('hex_coins'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
};
const saveCoins = (n) => {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  try { localStorage.setItem('hex_coins', String(v)); } catch {}
  return v;
};
// 클리어 보상: 별 × (첫 클리어 clearPerStar | 재클리어 repeatPerStar)
const coinReward = (stars, isFirst) => {
  const c = window.HX.bal().coin;
  return Math.max(0, stars) * (isFirst ? c.clearPerStar : c.repeatPerStar);
};
```

stages.jsx 하단 exports(`Object.assign(window, { HXS: { ... } })`)에 `loadCoins, saveCoins, coinReward` 추가.
engine.jsx의 `Object.assign(window, { HX: { ... } })`에 `bal` 추가 (앱/스테이지가 밸런스 수치를 읽는 단일 통로).
engine.jsx `DEFAULT_BAL`에 coin 섹션 추가 (Task 2에서 skill 필드도 추가하지만, coinReward가 의존하므로 여기서 먼저):

```js
coin: { clearPerStar: 20, repeatPerStar: 5, pickupValue: 5 },
```

- [ ] **Step 4: 통과 확인** — `node --test tests/economy.test.mjs` → PASS. `npm test` 전체 회귀 없음.

- [ ] **Step 5: 커밋**

```bash
git add stages.jsx engine.jsx tests/economy.test.mjs
git commit -m "feat(economy): coin wallet (loadCoins/saveCoins) + clear-reward helper"
```

---

### Task 2: 스킬 모드 분기 — 코인 결제 + 회수 제한 (engine.jsx)

**Files:**
- Modify: `engine.jsx` (DEFAULT_BAL skill 필드, doUndo/doBomb/doFreeze, skillPay 헬퍼)
- Modify: `stages.jsx` (`initStageDef`의 base에 coins 초기값)
- Test: `tests/economy.test.mjs`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
// 스테이지 상태 헬퍼: 최소 stage 모드 상태 (기존 테스트들의 state 구성 방식 참고)
const stageState = (over = {}) => plain({
  mode: 'stage', pl: { r: 8, c: 3 }, bl: [], walls: [], enemies: [], its: [],
  sc: 500, coins: 100, t: 3, fz: 0, ov: false, win: false, hist: null, skillUses: 0,
  ...over,
});

test('stage mode: bomb pays coins, score untouched', () => {
  const s = HX.doBomb(stageState());
  assert.equal(s.coins, 100 - 30);
  assert.equal(s.sc, 500);
  assert.equal(s.skillUses, 1);
});

test('stage mode: insufficient coins -> no-op even with high score', () => {
  const before = stageState({ coins: 10 });
  const s = HX.doBomb(before);
  assert.equal(s.coins, 10);
  assert.equal(s.skillUses, 0);
});

test('stage mode: third use of same skill is blocked (usesPerRun=2)', () => {
  let s = stageState({ coins: 1000 });
  s = HX.doBomb(s); s = HX.doBomb(s);
  const third = HX.doBomb(s);
  assert.equal(third.coins, s.coins);       // 차감 없음
  assert.equal(third.skillUses, 2);
});

test('stage mode: usesPerRun=0 means unlimited', () => {
  sandbox.window.HXB = plainToSandbox({ ...DEFAULT_BAL_COPY, skill: { ...DEFAULT_BAL_COPY.skill, usesPerRun: 0 } });
  let s = stageState({ coins: 1000 });
  for (let i = 0; i < 5; i++) s = HX.doBomb(s);
  assert.equal(s.skillUses, 5);
  delete sandbox.window.HXB;
});

test('endless mode: bomb still pays score (regression)', () => {
  const s = HX.doBomb(stageState({ mode: 'endless', coins: undefined }));
  assert.equal(s.sc, 500 - 50);
});

test('stage mode: undo restores hist but charges undo coins, no refund of past spends', () => {
  const hist = stageState({ coins: 70, t: 2 });           // 폭탄 사용 후 스냅샷이라 가정
  const cur = stageState({ coins: 70, t: 3, hist });
  const s = HX.doUndo(cur);
  assert.equal(s.t, 2);                                    // 상태는 hist로 복원
  assert.equal(s.coins, 70 - 20);                          // 현재 코인 - undo 비용 (환불 없음)
});

test('initStageDef seeds coins from wallet and no skillLeft yet (lazy init)', () => {
  sandbox.localStorage._reset();
  HXS.saveCoins(77);
  const g = plain(HXS.initStageDef(plainToSandbox({ id: 1, type: 'survive', surviveTurns: 5, pool: [] }), 0));
  assert.equal(g.coins, 77);
});
```

(`plainToSandbox`/`DEFAULT_BAL_COPY`는 기존 하니스 유틸 명칭에 맞춰 조정 — overrides 테스트가 sandbox로 객체를 넘기는 방식을 그대로 쓴다.)

- [ ] **Step 2: 실패 확인** — `node --test tests/economy.test.mjs` → 신규 케이스 FAIL.

- [ ] **Step 3: 구현** — engine.jsx:

`DEFAULT_BAL.skill`에 추가: `undoCoin: 20, bombCoin: 30, freezeCoin: 40, usesPerRun: 2`.

스킬 섹션(`// ─── Skills`) 상단에 헬퍼:

```js
// 모드별 스킬 결제. 성공 시 차감 패치(코인 or 점수)를, 불가 시 null을 돌려준다.
// stage: 코인 + 런당 회수 제한(usesPerRun, 0=무제한) / endless: 점수 차감(현행).
const skillPay = (s, key) => {
  const k = bal().skill;
  if (s.mode === 'stage') {
    const cost = k[key + 'Coin'];
    const lim = k.usesPerRun;
    const left = (s.skillLeft && key in s.skillLeft) ? s.skillLeft[key] : lim;
    if ((s.coins || 0) < cost) return null;
    if (lim > 0 && left <= 0) return null;
    return {
      coins: s.coins - cost,
      skillLeft: lim > 0 ? { ...s.skillLeft, [key]: left - 1 } : s.skillLeft,
    };
  }
  const cost = k[key + 'Cost'];
  return s.sc < cost ? null : { sc: s.sc - cost };
};
```

세 함수 교체 (발동 로직은 그대로, 지불부만 skillPay로):

```js
const doUndo = (s) => {
  if (!s.hist || s.ov || s.win) return s;
  const pay = skillPay(s, 'undo');
  if (!pay) return s;
  return { ...s.hist, ...pay, hist: null, ov: false, win: false, evts: [], skillUses: (s.skillUses || 0) + 1 };
};

const doBomb = (s) => {
  if (s.ov || s.win) return s;
  const pay = skillPay(s, 'bomb');
  if (!pay) return s;
  const rad = bal().skill.bombRadius;
  const xc = s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) <= rad);
  return {
    ...s, ...pay,
    bl: s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) > rad),
    enemies: (s.enemies || []).filter(e => hd(s.pl.r, s.pl.c, e.r, e.c) > rad),
    skillUses: (s.skillUses || 0) + 1,
    evts: [{ ty: 'bm', r: s.pl.r, c: s.pl.c, cells: xc.map(b => `${b.r},${b.c}`) }],
  };
};

const doFreeze = (s) => {
  if (s.fz > 0 || s.ov || s.win) return s;
  const pay = skillPay(s, 'freeze');
  if (!pay) return s;
  return { ...s, ...pay, fz: bal().skill.freezeTurns, skillUses: (s.skillUses || 0) + 1, evts: [] };
};
```

stages.jsx `initStageDef`의 `base`에 한 줄 추가: `coins: loadCoins(),` (skillLeft은 lazy init이라 불필요).

- [ ] **Step 4: 통과 확인** — `node --test tests/economy.test.mjs` PASS + `npm test` 전체(기존 boss/regression 테스트의 endless 스킬 경로 회귀 확인).

- [ ] **Step 5: 커밋**

```bash
git add engine.jsx stages.jsx tests/economy.test.mjs
git commit -m "feat(economy): mode-split skill payment (stage=coins+per-run cap, endless=score)"
```

---

### Task 3: 코인 픽업 `cn` — 스폰/수집 + 동전 스프라이트

**Files:**
- Modify: `engine.jsx` (BAL.item.pCoin, tryItem 모드 인자, 수집 분기)
- Modify: `resources.jsx` (COIN 그리드/맵 + RES 등록), `sprites.jsx` (CoinSprite), `app.jsx` (아이템 ty→스프라이트 매핑 + 범례)
- Test: `tests/economy.test.mjs`, `tests/resources-art.test.mjs` (EXPECTED_SIZE에 coin)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('collecting a cn pickup adds pickupValue coins and pushes a cn event', () => {
  // 플레이어가 (8,3)→(8,4)로 이동, (8,4)에 코인
  const s0 = stageState({ its: [{ r: 8, c: 4, ty: 'cn' }] });
  const s = HX.tick(s0, 8, 4);          // 기존 테스트들의 tick 호출 시그니처에 맞춤
  assert.equal(s.coins, 100 + 5);
  assert.ok(plain(s.evts).some(e => e.ty === 'cn'));
  assert.equal(plain(s.its).length, 0);
});

test('tryItem never rolls cn outside stage mode', () => {
  const orig = sandbox.Math.random;
  sandbox.Math.random = () => 0.0;      // spawnChance 통과 + 첫 후보 + roll=0 → 최우선 타입
  try {
    // pCoin이 1.0이어도 endless에선 cn이 나오면 안 됨
    sandbox.window.HXB = plainToSandbox({ ...DEFAULT_BAL_COPY, item: { ...DEFAULT_BAL_COPY.item, pCoin: 1.0 } });
    const its = plain(HX.tryItem([], { r: 8, c: 3 }, [], 'endless'));
    assert.ok(its.length === 1 && its[0].ty !== 'cn');
    const its2 = plain(HX.tryItem([], { r: 8, c: 3 }, [], 'stage'));
    assert.ok(its2.length === 1 && its2[0].ty === 'cn');
  } finally { sandbox.Math.random = orig; delete sandbox.window.HXB; }
});
```

(`tick` 시그니처·`tryItem` export 여부는 기존 `tests/bullets.test.mjs`/`tests/regression.test.mjs`의 호출 방식을 따른다. tryItem이 미export면 window.HX에 추가 export.)

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 엔진 구현**
  - `DEFAULT_BAL.item`에 `pCoin: 0.15` 추가 (주석: stage 전용, ht=나머지).
  - `tryItem(its, pl, bl, mode)`로 시그니처 확장, 타입 결정부를:

```js
const it = bal().item;
const pCn = mode === 'stage' ? (it.pCoin || 0) : 0;
const ty = roll < pCn ? 'cn'
         : roll < pCn + it.pSc ? 'sc'
         : roll < pCn + it.pSc + it.pBm ? 'bm'
         : roll < pCn + it.pSc + it.pBm + it.pTp ? 'tp'
         : 'ht';
```

  - tick 내 tryItem 호출부에 `s.mode` 전달.
  - 수집 분기(engine.jsx:378 `ht` 분기 뒤)에 추가:

```js
} else if (itemAt.ty === 'cn') {
  const cv = bal().coin.pickupValue;
  evts.push({ ty: 'cn', r: nr, c: nc, val: cv });
  // coins는 결과 상태 조립부에서 (s.coins||0)+획득분으로 반영
}
```

  (tick의 결과 객체 조립부에 `coins: (s.coins || 0) + coinGain` 형태로 배선 — coinGain 지역변수.)

- [ ] **Step 4: 동전 스프라이트** — resources.jsx (리스킨 스타일: 다크 아웃라인+3단 램프+C 각인):

```js
// Coin pickup (stage-mode currency) — gold disc with a C engraving
const COIN_MAP = { o: '#7c4a03', X: '#fbbf24', H: '#fde68a', d: '#d97706', e: '#a16207' };
const COIN = [
  '.....oooooo.....',
  '...ooXXXXXXoo...',
  '..oXHHHHHHHHXo..',
  '.oXHHXXXXXXXHXo.',
  '.oXHXXXXXXXXHXo.',
  'oXHXXXeeeeXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXXeeeeXXXHXo',
  '.oXdXXXXXXXXdXo.',
  '.odXXXXXXXXXXdo.',
  '..oddXXXXXXddo..',
  '...ooddddddoo...',
  '.....oooooo.....',
  '................',
];
```

RES에 `coin: { kind: 'pixel', grid: COIN, map: COIN_MAP, px: 1.3, warnStroke: true },` 등록.
sprites.jsx에 (StarSprite 패턴):

```js
const CoinSprite = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('coin', { warn })}</g>;
```

`Object.assign(window, {...})` 목록에 CoinSprite 추가.
app.jsx: 아이템 렌더에서 `it.ty`→스프라이트 매핑부(StarSprite/BombSprite/TpSprite/HintSprite를 고르는 곳을 grep `HintSprite`로 찾기)에 `cn → CoinSprite` 추가. 범례(legend)에 `{isStage && <div className="item"><span className="sw" style={{ background: '#fbbf24' }}></span>코인 🪙</div>}` 추가.
`tests/resources-art.test.mjs`의 EXPECTED_SIZE에 `coin: [16, 16]` 추가.
시각 확인: `node tools/extract-sprites.mjs` → `assets/extracted/coin.png` Read — gem·star와 실루엣 구분되는지 (원형 vs 팔각 vs 별).

- [ ] **Step 5: 통과 확인** — `node --test tests/economy.test.mjs tests/resources-art.test.mjs` PASS → `npm test` 전체 + `node tests/_babelcheck.mjs` 8/8.

- [ ] **Step 6: 커밋**

```bash
git add engine.jsx resources.jsx sprites.jsx app.jsx tests/economy.test.mjs tests/resources-art.test.mjs
git commit -m "feat(economy): cn coin pickup (stage-only spawn) + gold coin sprite"
```

---

### Task 4: 앱 배선 — 지갑 persist, 클리어 보상, UI

**Files:**
- Modify: `app.jsx` (persist effect, 클리어 효과, SkillBtn3, 스킬 패널, StageHUD), `screens.jsx` (ClearOverlay 보상 행)

- [ ] **Step 1: 지갑 persist + 클리어 보상** — app.jsx GameView:

기존 클리어 효과(app.jsx:121-127)를 확장 — **saveStars 호출 전에 첫 클리어 판정**:

```js
const [coinGain, setCoinGain] = useState(0);
// stage clear → save stars + coin reward
useEffect(() => {
  if (isStage && g.win && !g._test) {
    const sNum = HXS.rateStage(g);
    const first = !HXS.loadStars()[g.stage.id];      // saveStars 전에 판정
    setEarned(sNum);
    setStars(HXS.saveStars(g.stage.id, sNum));
    const reward = HXS.coinReward(sNum, first);
    setCoinGain(reward);
    HXS.saveCoins((g.coins || 0) + reward);
  }
}, [g.win]);

// 스킬 사용/픽업으로 변한 코인을 즉시 지갑에 반영 (이탈/사망에도 유지)
useEffect(() => {
  if (isStage && !g._test && typeof g.coins === 'number' && !g.win) HXS.saveCoins(g.coins);
}, [g.coins]);
```

(`!g.win` 가드: 클리어 효과가 보상을 더해 저장한 값을 persist effect가 보상 없이 덮어쓰지 않도록.)

- [ ] **Step 2: SkillBtn3 일반화 + 패널 모드 분기** — app.jsx:55-64 교체:

```js
const SkillBtn3 = ({ cls, icon, name, cost, budget, unit, left, disabled, onClick }) => {
  const canUse = !disabled && budget >= cost && (left === undefined || left > 0);
  return (
    <button className={`skill3 ${cls} ${canUse ? 'ready' : ''}`} disabled={!canUse} onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="lbl">{name}{left !== undefined ? ` ${left}` : ''}</span>
      <span className="cost">{cost}{unit}</span>
    </button>
  );
};
```

스킬 패널(app.jsx:472-483) 교체 — 비용 하드코딩 제거, `HX.bal()`에서 읽기:

```js
{(() => {
  const k = HX.bal().skill;
  const lim = k.usesPerRun;
  const leftOf = (key) => (lim > 0 && isStage) ? ((g.skillLeft && key in g.skillLeft) ? g.skillLeft[key] : lim) : undefined;
  const budget = isStage ? (g.coins || 0) : g.sc;
  const unit = isStage ? '🪙' : '점';
  return (
    <div className="skills-row">
      <SkillBtn3 cls="undo" icon="↶" name="뒤로가기" cost={isStage ? k.undoCoin : k.undoCost} budget={budget} unit={unit} left={leftOf('undo')} disabled={!g.hist || g.ov || g.win} onClick={() => setG(s => HX.doUndo(s))} />
      <SkillBtn3 cls="bomb" icon="✸" name="폭탄" cost={isStage ? k.bombCoin : k.bombCost} budget={budget} unit={unit} left={leftOf('bomb')} disabled={g.ov || g.win} onClick={() => setG(s => HX.doBomb(s))} />
      <SkillBtn3 cls="frz" icon="❄" name="정지" cost={isStage ? k.freezeCoin : k.freezeCost} budget={budget} unit={unit} left={leftOf('freeze')} disabled={g.ov || g.win || g.fz > 0} onClick={() => setG(s => HX.doFreeze(s))} />
    </div>
  );
})()}
```

패널 캡션(app.jsx:475): `'스킬 — 점수 소모'` → `{isStage ? '스킬 — 코인 소모' : '스킬 — 점수 소모'}`.

- [ ] **Step 3: HUD 잔액 + ClearOverlay 보상 행**
  - StageHUD(app.jsx:67-)의 상단 행에 `<span className="hud-coin">🪙 {g.coins || 0}</span>` 추가 (sh-top 안, 기존 항목 뒤).
  - app.jsx:442-447 ClearOverlay 호출에 `coins={coinGain}` prop 추가.
  - screens.jsx의 ClearOverlay 정의(grep `ClearOverlay`)에서 점수/턴 행 뒤에:

```jsx
{coins > 0 && <div className="row coin"><span>코인 보상</span><span className="v">+{coins} 🪙</span></div>}
```

  (props 구조분해에 `coins` 추가. 기존 행 마크업 클래스를 따른다.)
  - 코인 획득 플로트: app.jsx 이벤트 효과(g.evts 처리부 130-142)에 `else if (ev.ty === 'cn') addFloat(`+${ev.val}🪙`, x, y - 6, '#fbbf24');` 추가.

- [ ] **Step 4: 수동 검증 (스크린샷)** — `node tools/shot.mjs` → `04-stage1.png`에서 HUD 코인 표시·스킬 버튼 "N🪙 (2)" 확인. `npm test` + `node tests/_babelcheck.mjs` 8/8 (JSX 구문 가드 — 앱 변경의 핵심 검증).

- [ ] **Step 5: 커밋**

```bash
git add app.jsx screens.jsx
git commit -m "feat(economy): wallet persist + clear reward + coin-aware skill/HUD UI"
```

---

### Task 5: 에디터 밸런스 노출 + 최종 검증

**Files:**
- Modify: `editor.jsx` (BAL_FIELDS), `editor-core.jsx` (buildBalance 클램프 확인)
- Test: `tests/overrides.test.mjs` (coin 섹션 머지 케이스)

- [ ] **Step 1: 실패하는 테스트 추가** — `tests/overrides.test.mjs`에:

```js
test('buildBalance merges coin section and clamps negatives to 0', () => {
  const b = plain(HXE.buildBalance({ coin: { clearPerStar: -10, pickupValue: 7 } }));
  assert.equal(b.coin.clearPerStar, 0);
  assert.equal(b.coin.pickupValue, 7);
  assert.equal(b.coin.repeatPerStar, 5);   // 미지정 키는 기본값
});
```

- [ ] **Step 2: 실패 확인** → FAIL (클램프 없음 또는 coin 키 누락 시).

- [ ] **Step 3: 구현**
  - editor-core.jsx `buildBalance`: 기존 클램프(chaseEvery/lungeDash ≥1) 옆에 coin 3필드 + 스킬 코인 3필드 음수→0 클램프 추가:

```js
['clearPerStar', 'repeatPerStar', 'pickupValue'].forEach(k => { b.coin[k] = Math.max(0, Number(b.coin[k]) || 0); });
['undoCoin', 'bombCoin', 'freezeCoin', 'usesPerRun'].forEach(k => { b.skill[k] = Math.max(0, Number(b.skill[k]) || 0); });
```

  - editor.jsx `BAL_FIELDS`에 추가:

```js
['skill', 'undoCoin', '뒤로가기 코인', 0, 200, 5],
['skill', 'bombCoin', '폭탄 코인', 0, 200, 5],
['skill', 'freezeCoin', '정지 코인', 0, 200, 5],
['skill', 'usesPerRun', '스킬 런당 횟수(0=무제한)', 0, 9, 1],
['coin', 'clearPerStar', '클리어 코인/별', 0, 100, 5],
['coin', 'repeatPerStar', '재클리어 코인/별', 0, 100, 5],
['coin', 'pickupValue', '코인 픽업 값', 0, 50, 1],
['item', 'pCoin', '확률 코인🪙', 0, 1, 0.01],
```

- [ ] **Step 4: 최종 전체 검증** — `npm test`(기존 71 + economy/overrides 신규 ≈ 82±) 전부 PASS + `node tests/_babelcheck.mjs` 8/8 + `node tools/shot.mjs`로 인게임 확인 1회.

- [ ] **Step 5: 커밋**

```bash
git add editor.jsx editor-core.jsx tests/overrides.test.mjs
git commit -m "feat(economy): expose coin balance fields in editor + clamp guards"
```

---

## 완료 기준 (스펙 수용 기준)

- 스테이지: 스킬 = 코인 결제(점수 불변) + 런당 2회 제한, 잔액·횟수 UI 표시
- 엔드리스: 동작 변화 없음 (회귀 테스트로 보증)
- 클리어 보상(첫 별×20/재 별×5) 지급·지갑 유지, `_test` 런 미반영
- 코인 픽업 스테이지 전용 스폰·수집·새 스프라이트 렌더
- 에디터에서 코인 수치 조정 가능, `npm test` 전체 + JSX 8/8 통과
