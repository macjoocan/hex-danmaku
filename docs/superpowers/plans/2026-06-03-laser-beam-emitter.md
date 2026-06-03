# Laser Beam Emitter (`beams`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a placeable "laser beam emitter" field gimmick that telegraphs one turn ahead (dotted column) then zaps its entire vertical column in one shot, on a per-emitter cooldown.

**Architecture:** New persistent field-gimmick array `s.beams: [{r,c,period,cd}]`, processed inline in `tick` next to the existing one-shot boss laser. Each emitter decrements `cd` per turn (paused while frozen), telegraphs at `cd===1`, fires at `cd<=0` (player in the emitter's column dies — full-column, pierces walls), then resets `cd=period`. Reuses the existing `finalC === c` column-hit pattern. Non-solid. Editor-placeable via a new palette tool.

**Tech Stack:** Vanilla JS engine (`engine.jsx`/`stages.jsx`, pure — no JSX/React), React UMD + @babel/standalone for UI (`app.jsx`/`editor.jsx`/`sprites.jsx`/`resources.jsx`), `node:test` + `node:vm` harness (`tests/*.test.mjs`). Run tests with `npm test`; JSX syntax check with `node tests/_babelcheck.mjs`.

**Spec:** [docs/superpowers/specs/2026-06-03-laser-beam-emitter-design.md](../specs/2026-06-03-laser-beam-emitter-design.md)

**Conventions for this codebase:**
- Engine state is immutable-style: `tick(s, nr, nc)` returns a new state. Beams must be copied, not mutated in place.
- The vm test harness runs `engine.jsx` + `stages.jsx` in a sandbox; `loadGame({seed})` returns `{HX, HXS}`. Math.random is seeded per `loadGame`.
- `baseState(HX, over)` = `{...HX.initState(), ...over}` for tick tests.
- Commit after each task. Use `fix:`/`feat:` conventional prefixes. End commit messages with the Co-Authored-By trailer used in this repo.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `engine.jsx` | beam state + tick processing + collision + meta | Modify |
| `stages.jsx` | map `def.beams` → runtime beams with `cd` | Modify |
| `editor.jsx` | `beam` palette tool + placement + blank def | Modify |
| `app.jsx` | render emitter sprite + dotted telegraph + fire flash + legend | Modify |
| `sprites.jsx` | `BeamSprite` component + export | Modify |
| `resources.jsx` | `beam` art registry entry | Modify |
| `styles.css` | dotted-telegraph + beam-fire styles | Modify |
| `tests/beams.test.mjs` | engine beam unit tests | Create |
| `tests/fairness.test.mjs` | single-beam dodgeable guard | Modify |
| `docs/hex-danmaku-dev.md` | document the new gimmick | Modify |

---

## Task 1: Engine — beam state machine

**Files:**
- Modify: `engine.jsx` (initState ~line 506, GIMMICKS ~line 230, tick after laser block ~line 414, collision ~line 422, return state ~line 465)
- Create: `tests/beams.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/beams.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, baseState } from './harness.mjs';

// minimal stage state with an emitter; player parked safely unless noted
const stageState = (HX, over) => baseState(HX, {
  mode: 'stage', obj: { type: 'survive', surviveTurns: 99 }, si: 99,
  stage: { type: 'survive', interval: 2 }, ...over,
});

test('beam counts down, telegraphs at cd=1, fires at cd<=0 then resets to period', () => {
  const { HX } = loadGame();
  // player sits in column 0 (never the beam column 3) so we observe cd over time
  let s = stageState(HX, { t: 0, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 4 }] });
  const cds = [];
  for (let i = 0; i < 5; i++) { s = HX.tick(s, s.pl.r, s.pl.c); cds.push(s.beams[0].cd); }
  // 4-1=3, 2, 1 (telegraph), fire at 0 -> reset to 4, then 3
  assert.deepEqual(cds, [3, 2, 1, 4, 3]);
});

test('beam kills the player who stays in its column on the fire turn', () => {
  const { HX } = loadGame();
  // cd:1 -> this tick decrements to 0 -> fires this turn
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c); // stay in column 3
  assert.equal(n.ov, true);
});

test('beam misses a player who left the column on the fire turn', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, 10, 2); // step west to column 2 (W neighbor of (10,3))
  assert.equal(n.ov, false);
});

test('beam pierces walls — same column kills even with a wall between', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 3 }, walls: [{ r: 5, c: 3 }], beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.ov, true);
});

test('freeze pauses the beam cooldown', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, fz: 2, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 2 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.equal(n.beams[0].cd, 2); // unchanged while frozen
});

test('a fired beam pushes a beam event for its column', () => {
  const { HX } = loadGame();
  const s = stageState(HX, { t: 0, pl: { r: 10, c: 0 }, beams: [{ r: 0, c: 3, period: 4, cd: 1 }] });
  const n = HX.tick(s, s.pl.r, s.pl.c);
  assert.ok(n.evts.some(e => e.ty === 'beam' && e.c === 3));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/beams.test.mjs`
Expected: FAIL — `n.beams` is unchanged (cd stays 4) and `n.ov` is false / no beam evt (beams not processed yet).

- [ ] **Step 3: Add `beams: []` to initState**

In `engine.jsx`, the `initState` object (near line 504-511) currently has:

```js
  turrets: [],
  lasers: [],
```

Add a `beams: []` line right after `lasers: []`:

```js
  turrets: [],
  lasers: [],
  beams: [],
```

- [ ] **Step 4: Add the `beam` metadata entry to GIMMICKS**

In `engine.jsx`, `GIMMICKS` (lines 230-236) currently ends with the `pad` entry. Add a `beam` entry:

```js
const GIMMICKS = {
  wall:   { blocksMove: true,  blocksBullet: true,  lethal: false },
  turret: { blocksMove: true,  blocksBullet: true,  lethal: false },
  spike:  { blocksMove: false, blocksBullet: false, lethal: true },
  crack:  { blocksMove: 'whenBroken', blocksBullet: 'whenBroken', lethal: false },
  pad:    { blocksMove: false, blocksBullet: false, lethal: false, push: true },
  beam:   { blocksMove: false, blocksBullet: false, lethal: 'whenFiring' },
};
```

- [ ] **Step 5: Add the beam-processing block in tick**

In `engine.jsx`, find the laser block that ends at line 414 (`lasers = [...liveLasers, ...spawnedLasers];`). Immediately AFTER that line and BEFORE the `// ── collision ──` comment, insert:

```js

  // ── beam emitters (placed laser): cooldown -> 1-turn dotted telegraph -> full-column zap ──
  // cd counts down (paused while frozen); cd===1 is the telegraph turn (renderer shows the dotted
  // column), cd<=0 fires the whole column c then resets to period. Pierces walls; player-only lethal.
  let beamHit = false;
  const beams = (s.beams || []).map(b => {
    if (s.fz > 0) return { ...b };                    // freeze pauses the cooldown
    const period = b.period || 4;
    let cd = (b.cd == null ? period : b.cd) - 1;
    if (cd <= 0) {                                     // fire this turn
      if (finalC === b.c) beamHit = true;
      evts.push({ ty: 'beam', c: b.c });
      cd = period;                                     // rest, then telegraph again at cd===1
    }
    return { ...b, cd };
  });
```

- [ ] **Step 6: Add `beamHit` to the game-over disjunction**

In `engine.jsx` the collision line (was line 422) reads:

```js
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit;
```

Change it to include `beamHit`:

```js
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit || beamHit;
```

- [ ] **Step 7: Return `beams` in the new state**

In `engine.jsx` the returned state object (around line 451-467) contains `lasers,`. Add `beams,` right after it:

```js
    lasers,
    beams,
    evts,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/beams.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 9: Run the full suite to confirm no regression**

Run: `npm test`
Expected: all pass (existing 58 + 6 new = 64).

- [ ] **Step 10: Commit**

```bash
git add engine.jsx tests/beams.test.mjs
git commit -m "feat(engine): beam emitter gimmick (cooldown, full-column zap, telegraph)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Stages — initStageDef maps `def.beams` to runtime beams

**Files:**
- Modify: `stages.jsx` (initStageDef, ~line 372-373)
- Modify: `tests/beams.test.mjs` (add one test)

- [ ] **Step 1: Write the failing test**

Append to `tests/beams.test.mjs`:

```js
test('initStageDef maps def.beams and initializes cd from period/phase', () => {
  const { HXS } = loadGame();
  const def = { type: 'survive', interval: 2, surviveTurns: 10,
    beams: [{ r: 0, c: 3, period: 4 }, { r: 0, c: 5, period: 6, phase: 2 }] };
  const s = HXS.initStageDef(def, 0);
  assert.equal(s.beams.length, 2);
  assert.equal(s.beams[0].cd, 4); // period 4 - phase 0
  assert.equal(s.beams[1].cd, 4); // period 6 - phase 2
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/beams.test.mjs`
Expected: FAIL — `s.beams` is `undefined` (initStageDef doesn't map beams yet) → reading `.length` throws / assertion fails.

- [ ] **Step 3: Add the beams mapping to initStageDef**

In `stages.jsx`, the `initStageDef` base object (lines 372-373) currently has:

```js
    cracks: (def.cracks || []).map(cr => ({ ...cr, broken: false })),
    pads: (def.pads || []).map(p => ({ ...p })),
```

Add a `beams` line right after `pads`:

```js
    cracks: (def.cracks || []).map(cr => ({ ...cr, broken: false })),
    pads: (def.pads || []).map(p => ({ ...p })),
    beams: (def.beams || []).map(b => ({ ...b, cd: (b.period || 4) - (b.phase || 0) })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/beams.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add stages.jsx tests/beams.test.mjs
git commit -m "feat(stages): map def.beams to runtime beams (cd init from period/phase)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Fairness — a single beam stays dodgeable

**Files:**
- Modify: `tests/fairness.test.mjs` (add a test using the exported `hasSafeMove`/`bestNext`)

- [ ] **Step 1: Add the fairness guard test**

In `tests/fairness.test.mjs`, after the boss-attack tests (after line 57, before the `stageSurvives` helper or at the end before the `export`), add:

```js
// a placed beam emitter must never remove every safe move — the player can always leave its column
test('a single beam emitter stays dodgeable', () => {
  const { HX, HXS } = loadGame({ seed: 7 });
  const def = { type: 'survive', interval: 2, surviveTurns: 30,
    pool: [{ n: '중앙', c: [2, 3, 4] }],
    beams: [{ r: 0, c: 3, period: 4 }], start: { r: 10, c: 0 } };
  let s = HXS.initStageDef(def, 0);
  for (let i = 0; i < 30 && !s.ov && !s.win; i++) {
    assert.ok(hasSafeMove(HX, s), `beam turn ${s.t}: no safe move (unfair)`);
    const n = bestNext(HX, s);
    if (!n) break;
    s = n;
  }
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `node --test tests/fairness.test.mjs`
Expected: PASS (this is a fairness guard — it passes because Tasks 1-2 process the beam and the stage stays dodgeable). If it FAILS with "no safe move", the beam plus pool is genuinely unfair — reduce the pool (e.g. `c: [3]`) until it passes, since the goal is to prove a single beam alone is dodgeable.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all pass (65 total).

- [ ] **Step 4: Commit**

```bash
git add tests/fairness.test.mjs
git commit -m "test(fairness): a single beam emitter always leaves a safe move

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Editor — `beam` placement tool

**Files:**
- Modify: `editor.jsx` (PALETTE ~line 187, blankDef ~line 198, place ~line 303 + 314, EditorBoard keysets/fill)

> No headless test (editor UI is JSX). Verification = JSX syntax check + manual QA. Each step shows exact edits.

- [ ] **Step 1: Add `beam` to the palette**

In `editor.jsx`, `PALETTE` (lines 186-190) — add a `beam` tool after `turret`:

```js
const PALETTE = [
  ['erase', '지우개'], ['wall', '벽'], ['crack', '발판'], ['pad', '컨베이어'],
  ['spike', '가시'], ['turret', '포대'], ['beam', '레이저'], ['gem', '별'], ['goal', '게이트'],
  ['start', '시작'], ['enemy:chase', '추적자'], ['enemy:bounce', '반사체'], ['enemy:lunge', '돌격수'],
];
```

- [ ] **Step 2: Add `beams: []` to blankDef**

In `editor.jsx`, `blankDef()` (line 198) currently:

```js
  walls: [], cracks: [], pads: [], spikes: [], turrets: [], enemies: [], gems: [],
```

Change to include `beams`:

```js
  walls: [], cracks: [], pads: [], spikes: [], turrets: [], beams: [], enemies: [], gems: [],
```

- [ ] **Step 3: Handle beams in `place()` — removal and placement**

In `editor.jsx`, `place()` (lines 303-314). The removal line (303) currently:

```js
    d.walls = removeAt(d.walls); d.cracks = removeAt(d.cracks); d.pads = removeAt(d.pads);
```

Change to also clear beams at the cell:

```js
    d.walls = removeAt(d.walls); d.cracks = removeAt(d.cracks); d.pads = removeAt(d.pads);
    d.beams = removeAt(d.beams);
```

Then add a placement branch after the `turret` branch (line 314):

```js
    else if (tool === 'turret') (d.turrets = d.turrets || []).push({ r, c, period: 3, phase: 0 });
    else if (tool === 'beam') (d.beams = d.beams || []).push({ r, c, period: 4 });
```

- [ ] **Step 4: Show beams on the editor board**

In `editor.jsx`, `EditorBoard` builds keysets and per-cell `fill`. Find the keyset block (search for `const W = keyset(def.walls)`) and add a beam keyset, then a fill branch.

Add `BM` to the keyset declarations (alongside `W`, `CR`, `PD`, etc.):

```js
  const W = keyset(def.walls), CR = keyset(def.cracks), PD = keyset(def.pads),
        SP = keyset(def.spikes), TT = keyset(def.turrets), GM = keyset(def.gems),
        BM = keyset(def.beams),
        EN = new Map((def.enemies || []).map(e => [`${e.r},${e.c}`, e.kind]));
```

In the fill chain (search for `else if (TT.has(k)) fill =`), add a beam branch right after the turret branch:

```js
    else if (TT.has(k)) fill = '#23264a'; else if (BM.has(k)) fill = '#0b2e3a';
```

- [ ] **Step 5: JSX syntax check**

Run: `node tests/_babelcheck.mjs`
Expected: `8 ok, 0 fail` (editor.jsx parses).

- [ ] **Step 6: Commit**

```bash
git add editor.jsx
git commit -m "feat(editor): beam placement tool (stage tab palette)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Rendering — emitter sprite, dotted telegraph, fire flash, legend

**Files:**
- Modify: `resources.jsx` (RES registry ~line 199-204)
- Modify: `sprites.jsx` (new `BeamSprite` ~line 105, export ~line 164)
- Modify: `app.jsx` (Cell styling ~line 23-40, useMemos ~line 197-205, cell state ~line 257-274, sprite layer ~line 366, legend ~line 489-491)
- Modify: `styles.css` (~line 846)

> Visual layer — verification = JSX syntax check + manual browser QA (per project convention: "시각은 브라우저 수동 검증 영역"). Each step shows exact code.

- [ ] **Step 1: Add the `beam` art entry to the registry**

In `resources.jsx`, near the pixel-grid definitions (above `const RES =`), add a beam emitter grid + map (model on the existing `TURRET`/`MINE` definitions):

```js
// Laser beam emitter (placed cannon that zaps its whole column). 8x8, rows are 8 chars.
const BEAM_MAP = { X: '#0e7490', H: '#67e8f9', e: '#a5f3fc' };
const BEAM = [
  '.XXXXXX.', 'XHHHHHHX', 'XHeeeeHX', 'XHe..eHX',
  'XHe..eHX', 'XHeeeeHX', 'XHHHHHHX', '.XXXXXX.',
];
```

Then add a `beam` entry to the `RES` object (after the `turret:` entry, line 204):

```js
  turret:  { kind: 'pixel', grid: TURRET,  map: TURRET_MAP,  px: 2.4, warnMap: { B: '#fca5a5' } },
  beam:    { kind: 'pixel', grid: BEAM,     map: BEAM_MAP,    px: 2.3 },
```

- [ ] **Step 2: Add `BeamSprite` and export it**

In `sprites.jsx`, before the `Object.assign(window, {` block (after the existing gimmick sprites), add:

```js
// Beam emitter — pixel device + shadow; pulses while telegraphing
const BeamSprite = ({ x, y, warn }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#06121f" opacity="0.4" />
    <g className={warn ? 'mine-armed' : undefined}>{drawArt('beam')}</g>
  </g>
);
```

Then add `BeamSprite` to the export object (line 162-165):

```js
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite,
  BeamSprite,
```

- [ ] **Step 3: Destructure `BeamSprite` in app.jsx**

In `app.jsx`, the top destructure from `window` (lines 7-11) includes `BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite,`. Add `BeamSprite`:

```js
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite, BeamSprite,
```

- [ ] **Step 4: Add beam useMemos (positions, telegraph columns, fire columns)**

In `app.jsx`, after the `laserCols` useMemo (line 203), add:

```js
  const beamSet = useMemo(() => new Set((g.beams || []).map(b => `${b.r},${b.c}`)), [g.beams]);
  // columns telegraphing this turn (cd===1 -> fires next turn): dotted full column
  const beamWarnCols = useMemo(() => new Set((g.beams || []).filter(b => b.cd === 1).map(b => b.c)), [g.beams]);
  // columns that fired this turn (from evts): full-column flash
  const beamFireCols = useMemo(() => new Set((g.evts || []).filter(e => e.ty === 'beam').map(e => e.c)), [g.evts]);
```

- [ ] **Step 5: Add beam flags to per-cell state**

In `app.jsx`, the per-cell `st` object (lines 257-274). Add `beam`, `beamWarn`, and `beamFire`:

```js
      turret: turretSet.has(k),
      spike: spikeSet.has(k),
      crack: crackSet.has(k),
      pad: padSet.has(k),
      beam: beamSet.has(k),
      beamWarn: beamWarnCols.has(c),
      beamFire: beamFireCols.has(c),
      turretWarn: turretWarnSet.has(k),
```

- [ ] **Step 6: Render the telegraph + fire in the Cell component**

In `app.jsx`, the `Cell` component decides `fill`/`stroke` from `state` flags and renders overlay paths (lines 24-44). Add a beam-fire fill branch near the other hazard fills (after the `state.pad` branch around line 25), and overlay paths for telegraph/fire. First, add to the fill chain (after the `else if (state.pad)` line):

```js
  else if (state.beamFire) { fill = '#3a1418'; stroke = '#f87171'; strokeW = 2.5; }
  else if (state.beam) { fill = '#0b2e3a'; stroke = '#67e8f9'; strokeW = 1.8; }
```

Then, in the overlay-paths section of `Cell` (where `state.laser1 && <path .../>` is rendered, ~line 39), add dotted-telegraph and fire overlays:

```js
      {state.beamWarn && <path d={hp(x, y, SZ - 4)} fill="none" stroke="#67e8f9" strokeWidth="1.6" strokeDasharray="3 3" />}
      {state.beamFire && <path className="laser-beam" d={hp(x, y, SZ - 2)} fill="#67e8f9" opacity="0.85" />}
```

(`hp`, `SZ`, `x`, `y` are already in scope in `Cell` — confirm by checking the existing `state.laser1` path which uses the same.)

- [ ] **Step 7: Render emitter sprites in the sprite layer**

In `app.jsx`, the sprite layer (after the turret render line 366), add:

```js
            {(g.turrets || []).map((t, i) => { const { x, y } = hc(t.r, t.c); return <TurretSprite key={`tt-${i}`} x={x} y={y} warn={turretWarnSet.has(`${t.r + 1},${t.c}`)} />; })}

            {(g.beams || []).map((b, i) => { const { x, y } = hc(b.r, b.c); return <BeamSprite key={`bm-${i}`} x={x} y={y} warn={b.cd === 1} />; })}
```

- [ ] **Step 8: Add a legend entry**

In `app.jsx`, the legend block (lines 489-491), after the conveyor entry, add a beam entry:

```js
          {isStage && (g.beams || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#67e8f9' }}></span>레이저 방출기</div>}
```

- [ ] **Step 9: Add styles**

In `styles.css`, after the existing `.laser-beam` rule (line 847), the `.laser-beam` animation is already defined and reused by the beam-fire overlay — no new keyframe needed. Confirm `.laser-beam` exists (lines 846-847). No change required unless missing; if missing, add:

```css
.laser-beam { animation: laserflash 0.28s ease-out forwards; }
@keyframes laserflash { 0% { opacity: 0.95; } 60% { opacity: 0.8; } 100% { opacity: 0; } }
```

- [ ] **Step 10: JSX syntax check + full test suite**

Run: `node tests/_babelcheck.mjs` → Expected: `8 ok, 0 fail`
Run: `npm test` → Expected: all pass (65, unchanged — rendering has no headless tests)

- [ ] **Step 11: Manual browser QA**

Start server if not running: `python -m http.server 3000 --bind 127.0.0.1` then open `http://localhost:3000/Hex%20Danmaku.html`.
- Editor → 스테이지 → + 새 커스텀 → select "레이저" tool → place an emitter → 테스트 ▶.
- Confirm: emitter sprite renders; the column shows a dotted telegraph one turn before firing; the whole column flashes on fire; standing in the column when it fires = game over; leaving the column = safe; freeze (if available) pauses it.

- [ ] **Step 12: Commit**

```bash
git add app.jsx sprites.jsx resources.jsx styles.css
git commit -m "feat(render): beam emitter sprite + dotted telegraph + column flash + legend

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Docs + final verification

**Files:**
- Modify: `docs/hex-danmaku-dev.md` (확장팩 section)

- [ ] **Step 1: Document the gimmick**

In `docs/hex-danmaku-dev.md`, in the "확장팩 1탄 & 에디터" area under the field-gimmick section (search for `## 3. 필드 기믹`), add a short subsection:

```markdown
- **`beams: [{r,c,period,phase?}]`** — 레이저 방출기(배치형). 방출기별 `cd` 쿨다운: `cd===1` 점선 예고 → `cd<=0` 해당 **컬럼 전체** 일격(`finalC===c`이면 즉사) → `cd=period` 리셋. 벽 관통, 비-솔리드, 플레이어만 치명, 정지(freeze) 중 멈춤. 기존 보스 `lasers`(1회성)와 별개. 에디터 팔레트 "레이저".
```

- [ ] **Step 2: Run the full suite + JSX check one more time**

Run: `npm test` → Expected: all pass (65).
Run: `node tests/_babelcheck.mjs` → Expected: `8 ok, 0 fail`.

- [ ] **Step 3: Commit**

```bash
git add docs/hex-danmaku-dev.md
git commit -m "docs: document beam emitter gimmick

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §2 data model → Tasks 1 (initState), 2 (initStageDef). §3 tick state machine → Task 1 (steps 5-7). §4 fairness → Task 3. §5 editor → Task 4. §6 rendering → Task 5. §7 testing → Tasks 1-3. §8 affected files → all tasks. §9 decisions (non-solid, period 4, vertical/pierce/player-only, cooldown) → encoded in Task 1 logic + Task 4 placement defaults.
- **Type/name consistency:** `beams` array everywhere (engine state, def, runtime, editor, render). Per-emitter fields `{r,c,period,cd,phase?}` consistent across Task 1 (`b.period||4`, `b.cd`), Task 2 (`cd: (b.period||4)-(b.phase||0)`), Task 4 (place `{r,c,period:4}`), Task 5 (`b.cd===1`). Event `{ty:'beam', c}` consistent (Task 1 push, Task 5 read). Collision var `beamHit` consistent.
- **No placeholders:** every code step shows exact code; commands show expected output.
- **RED-first:** Task 1 & 2 tests fail before their implementation (beams unprocessed → cd unchanged, ov false). Task 3 is a fairness guard (passes post-1/2). Task 5 is visual (manual QA, no headless RED).
